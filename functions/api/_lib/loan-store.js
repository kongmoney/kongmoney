import { sheetsGet } from './google.js';
import { ensureAppTables } from './d1.js';
import { normalizeMonthValue, is2026Month } from './year2026.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function mapLoan(row) {
  return {
    month: String(row?.month || ''),
    principal: n(row?.principal),
    interest: n(row?.interest),
    rate: n(row?.rate),
    balance: n(row?.balance),
    total: n(row?.total) || n(row?.principal) + n(row?.interest),
    managerShare: n(row?.manager_share),
    memberAShare: n(row?.member_a_share),
    note: String(row?.note || ''),
  };
}

export async function ensureLoansMigrated(env) {
  const db = await ensureAppTables(env);
  const state = await db.prepare("SELECT value FROM app_state WHERE key='loans_migrated' LIMIT 1").first();
  if (String(state?.value || '') === '1') return db;

  const count = await db.prepare('SELECT COUNT(*) AS c FROM loans').first();
  if (Number(count?.c || 0) > 0) {
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO app_state (key,value,updated_at) VALUES ('loans_migrated','1',?) ON CONFLICT(key) DO UPDATE SET value='1', updated_at=excluded.updated_at").bind(now).run();
    return db;
  }

  const data = await sheetsGet(env, ['대출내역!A3:I100']);
  const rows = data.valueRanges?.[0]?.values || [];
  const now = new Date().toISOString();

  for (const row of rows) {
    const month = normalizeMonthValue(row?.[0]);
    if (!is2026Month(month)) continue;
    const principal = n(row?.[1]);
    const interest = n(row?.[2]);
    const rate = n(row?.[3]);
    const balance = n(row?.[4]);
    const total = n(row?.[5]) || principal + interest;
    const managerShare = n(row?.[6]) || total / 2;
    const memberAShare = n(row?.[7]) || total / 2;
    const note = String(row?.[8] || '');
    await db.prepare(`INSERT OR REPLACE INTO loans
      (month,principal,interest,rate,balance,total,manager_share,member_a_share,note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(month, principal, interest, rate, balance, total, managerShare, memberAShare, note, now, now).run();
  }

  await db.prepare("INSERT INTO app_state (key,value,updated_at) VALUES ('loans_migrated','1',?) ON CONFLICT(key) DO UPDATE SET value='1', updated_at=excluded.updated_at").bind(now).run();
  return db;
}

export async function listLoans(env) {
  const db = await ensureLoansMigrated(env);
  const result = await db.prepare(`SELECT month,principal,interest,rate,balance,total,manager_share,member_a_share,note
    FROM loans ORDER BY month ASC`).all();
  return (result.results || []).map(mapLoan);
}

export async function getLoan(env, month) {
  const db = await ensureLoansMigrated(env);
  const row = await db.prepare(`SELECT month,principal,interest,rate,balance,total,manager_share,member_a_share,note
    FROM loans WHERE month=? LIMIT 1`).bind(month).first();
  return row ? mapLoan(row) : null;
}

export async function getPreviousLoan(env, month) {
  const db = await ensureLoansMigrated(env);
  const row = await db.prepare(`SELECT month,principal,interest,rate,balance,total,manager_share,member_a_share,note
    FROM loans WHERE month < ? AND balance > 0 ORDER BY month DESC LIMIT 1`).bind(month).first();
  return row ? mapLoan(row) : null;
}

export async function upsertLoan(env, item) {
  const db = await ensureLoansMigrated(env);
  const now = new Date().toISOString();
  const existing = await getLoan(env, item.month);
  const createdAt = existing ? now : now;
  await db.prepare(`INSERT INTO loans
    (month,principal,interest,rate,balance,total,manager_share,member_a_share,note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(month) DO UPDATE SET
      principal=excluded.principal,
      interest=excluded.interest,
      rate=excluded.rate,
      balance=excluded.balance,
      total=excluded.total,
      manager_share=excluded.manager_share,
      member_a_share=excluded.member_a_share,
      note=excluded.note,
      updated_at=excluded.updated_at`)
    .bind(item.month, item.principal, item.interest, item.rate, item.balance, item.total,
      item.managerShare, item.memberAShare, item.note || '', createdAt, now).run();
  return getLoan(env, item.month);
}
