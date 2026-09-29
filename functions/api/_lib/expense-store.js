import { sheetsGet } from './google.js';
import { ensureAppTables } from './d1.js';
import { normalizeMonthValue, is2026Month } from './year2026.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function normalizeSheetExpense(row, sourceRow) {
  const amount = n(row?.[4]);
  const splitType = String(row?.[5] || '');
  let manager = n(row?.[6]);
  let memberA = n(row?.[7]);
  let memberB = n(row?.[8]);
  if (!manager && !memberA && !memberB && amount) {
    if (splitType === '3인 공동') manager = memberA = memberB = amount / 3;
    else if (['JH + CE', 'JH+CE'].includes(splitType)) memberA = memberB = amount / 2;
    else manager = memberA = amount / 2;
  }
  return {
    id: sourceRow,
    month: normalizeMonthValue(row?.[0]),
    category: String(row?.[1] || ''),
    subcategory: String(row?.[2] || ''),
    description: String(row?.[3] || ''),
    amount,
    splitType,
    manager,
    memberA,
    memberB,
  };
}

function mapDbExpense(row) {
  return {
    sheetRow: Number(row.id),
    month: String(row.month || ''),
    category: String(row.category || ''),
    subcategory: String(row.subcategory || ''),
    description: String(row.description || ''),
    amount: n(row.amount),
    splitType: String(row.split_type || ''),
    manager: n(row.manager),
    memberA: n(row.member_a),
    memberB: n(row.member_b),
  };
}

export async function ensureExpensesMigrated(env) {
  const db = await ensureAppTables(env);
  const state = await db.prepare("SELECT value FROM app_state WHERE key='expenses_migrated' LIMIT 1").first();
  if (String(state?.value || '') === '1') return db;

  const count = await db.prepare('SELECT COUNT(*) AS c FROM expenses').first();
  if (Number(count?.c || 0) > 0) {
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO app_state (key,value,updated_at) VALUES ('expenses_migrated','1',?) ON CONFLICT(key) DO UPDATE SET value='1', updated_at=excluded.updated_at").bind(now).run();
    return db;
  }

  const data = await sheetsGet(env, ['지출내역!A3:I5000']);
  const rows = data.valueRanges?.[0]?.values || [];
  const expenses = rows
    .map((row, i) => normalizeSheetExpense(row, i + 3))
    .filter((row) => is2026Month(row.month) && row.amount > 0 && row.category && row.subcategory);

  const now = new Date().toISOString();
  for (const item of expenses) {
    await db.prepare(`INSERT OR REPLACE INTO expenses
      (id,month,category,subcategory,description,amount,split_type,manager,member_a,member_b,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(item.id, item.month, item.category, item.subcategory, item.description, Math.round(item.amount), item.splitType,
        item.manager, item.memberA, item.memberB, now, now).run();
  }

  await db.prepare("INSERT INTO app_state (key,value,updated_at) VALUES ('expenses_migrated','1',?) ON CONFLICT(key) DO UPDATE SET value='1', updated_at=excluded.updated_at").bind(now).run();
  return db;
}

export async function listExpenses(env, { month = null } = {}) {
  const db = await ensureExpensesMigrated(env);
  let result;
  if (month) {
    result = await db.prepare(`SELECT id,month,category,subcategory,description,amount,split_type,manager,member_a,member_b
      FROM expenses WHERE month=? ORDER BY id ASC`).bind(month).all();
  } else {
    result = await db.prepare(`SELECT id,month,category,subcategory,description,amount,split_type,manager,member_a,member_b
      FROM expenses ORDER BY month ASC,id ASC`).all();
  }
  return (result.results || []).map(mapDbExpense);
}

export async function getExpenseById(env, id) {
  const db = await ensureExpensesMigrated(env);
  const row = await db.prepare(`SELECT id,month,category,subcategory,description,amount,split_type,manager,member_a,member_b
    FROM expenses WHERE id=? LIMIT 1`).bind(Number(id)).first();
  return row ? mapDbExpense(row) : null;
}

export async function insertExpense(env, item) {
  const db = await ensureExpensesMigrated(env);
  const now = new Date().toISOString();
  const result = await db.prepare(`INSERT INTO expenses
    (month,category,subcategory,description,amount,split_type,manager,member_a,member_b,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(item.month,item.category,item.subcategory,item.description,Math.round(item.amount),item.splitType,
      item.manager,item.memberA,item.memberB,now,now).run();
  const id = Number(result?.meta?.last_row_id || 0);
  if (!id) throw new Error('D1 지출 저장 후 ID를 확인하지 못했습니다.');
  return getExpenseById(env, id);
}

export async function updateExpense(env, id, item) {
  const db = await ensureExpensesMigrated(env);
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE expenses SET
    month=?,category=?,subcategory=?,description=?,amount=?,split_type=?,manager=?,member_a=?,member_b=?,updated_at=?
    WHERE id=?`)
    .bind(item.month,item.category,item.subcategory,item.description,Math.round(item.amount),item.splitType,
      item.manager,item.memberA,item.memberB,now,Number(id)).run();
  if (Number(result?.meta?.changes || 0) < 1) return null;
  return getExpenseById(env, id);
}

export async function deleteExpense(env, id) {
  const existing = await getExpenseById(env, id);
  if (!existing) return null;
  const db = await ensureExpensesMigrated(env);
  await db.prepare('DELETE FROM expenses WHERE id=?').bind(Number(id)).run();
  return existing;
}

export async function getLastSheetSync(env) {
  const db = await ensureAppTables(env);
  const row = await db.prepare("SELECT value,updated_at FROM app_state WHERE key='expenses_sheet_sync' LIMIT 1").first();
  return row ? { value: String(row.value || ''), updatedAt: String(row.updated_at || '') } : null;
}

export async function setLastSheetSync(env, value) {
  const db = await ensureAppTables(env);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO app_state (key,value,updated_at) VALUES ('expenses_sheet_sync',?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).bind(String(value || ''), now).run();
  return { value: String(value || ''), updatedAt: now };
}
