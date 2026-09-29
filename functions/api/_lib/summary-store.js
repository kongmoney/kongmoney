import { ensureAppTables } from './d1.js';
import { listExpenses } from './expense-store.js';
import { listLoans } from './loan-store.js';
import { sheetsGet } from './google.js';
import { isSupportedMonth, isSupportedYear, monthsForYear, normalizeMonthValue, previousMonthSameYear, yearOfMonth } from './year.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function autoTransferForMonth(ym) {
  if (ym === '2026-01' || ym === '2026-02') return 300000;
  return 400000;
}

function mapSummary(row) {
  if (!row) return null;
  const total = n(row.total);
  return {
    month: String(row.month || ''),
    living: n(row.living),
    loan: n(row.loan),
    total,
    managerBasic: n(row.manager_basic),
    memberABasic: n(row.member_a_basic),
    memberBBasic: n(row.member_b_basic),
    laborFee: total > 0 ? n(row.labor_fee) : 0,
    laborFeeConfig: n(row.labor_fee),
    managerFinal: n(row.manager_final),
    memberAFinal: n(row.member_a_final),
    memberBFinal: n(row.member_b_final),
    carryIn: n(row.carry_in),
    settlementNeeded: n(row.settlement_needed),
    autoTransfer: n(row.auto_transfer),
    monthDiff: n(row.month_diff),
    carryOut: n(row.carry_out),
    updatedAt: String(row.updated_at || ''),
  };
}

async function readLaborConfig(env) {
  const data = await sheetsGet(env, ['월정산!A3:H500', 'SETTINGS!B9:B9']);
  const [settlementsRange, settingsRange] = data.valueRanges || [];
  const laborByMonth = new Map();
  for (const row of settlementsRange?.values || []) {
    const ym = normalizeMonthValue(row?.[0]);
    if (isSupportedMonth(ym)) laborByMonth.set(ym, n(row?.[7]));
  }
  const defaultLaborFee = n(settingsRange?.values?.[0]?.[0]) || 200000;
  return { laborByMonth, defaultLaborFee };
}

async function computeAndWrite(env, { year, startMonth, initialize = false } = {}) {
  const y = String(year || yearOfMonth(startMonth));
  if (!isSupportedYear(y)) throw new Error('지원하지 않는 연도입니다.');
  const months = monthsForYear(y);
  const start = isSupportedMonth(startMonth) && yearOfMonth(startMonth) === y ? startMonth : `${y}-01`;
  const startIndex = Math.max(0, months.indexOf(start));
  const db = await ensureAppTables(env);
  const [expenses, loans] = await Promise.all([listExpenses(env), listLoans(env)]);

  let laborByMonth = new Map();
  let defaultLaborFee = 200000;
  if (initialize) {
    const config = await readLaborConfig(env);
    laborByMonth = config.laborByMonth;
    defaultLaborFee = config.defaultLaborFee;
  }

  // 연도별 정산은 독립적이다. 1월은 항상 carryIn = 0에서 시작한다.
  let carry = 0;
  if (startIndex > 0) {
    const prev = await db.prepare('SELECT carry_out FROM monthly_summary WHERE month=? LIMIT 1')
      .bind(months[startIndex - 1]).first();
    carry = n(prev?.carry_out);
  }

  const existingRows = await db.prepare('SELECT month,labor_fee FROM monthly_summary WHERE month LIKE ? ORDER BY month')
    .bind(`${y}-%`).all();
  const existingLabor = new Map((existingRows.results || []).map((r) => [String(r.month || ''), n(r.labor_fee)]));
  const now = new Date().toISOString();

  for (let i = startIndex; i < months.length; i += 1) {
    const ym = months[i];
    const monthExpenses = expenses.filter((r) => r.month === ym);
    const loan = loans.find((r) => r.month === ym);
    const living = monthExpenses.reduce((sum, r) => sum + n(r.amount), 0);
    const managerExpense = monthExpenses.reduce((sum, r) => sum + n(r.manager), 0);
    const memberAExpense = monthExpenses.reduce((sum, r) => sum + n(r.memberA), 0);
    const memberBExpense = monthExpenses.reduce((sum, r) => sum + n(r.memberB), 0);
    const loanTotal = n(loan?.total);
    const total = living + loanTotal;
    const active = total > 0;
    const laborFee = initialize
      ? (laborByMonth.get(ym) || defaultLaborFee)
      : (existingLabor.get(ym) || defaultLaborFee);

    const managerBasic = managerExpense + loanTotal / 2;
    const memberABasic = memberAExpense + loanTotal / 2;
    const memberBBasic = memberBExpense;
    const managerFinal = active ? managerBasic - laborFee * 2 : 0;
    const memberAFinal = active ? memberABasic + laborFee : 0;
    const memberBFinal = active ? memberBBasic + laborFee : 0;
    const carryIn = carry;
    const settlementNeeded = active ? Math.max(0, memberBFinal - carryIn) : 0;
    const autoTransfer = active ? autoTransferForMonth(ym) : 0;
    const monthDiff = active ? carryIn + autoTransfer - memberBFinal : 0;
    const carryOut = active ? monthDiff : carryIn;
    if (active) carry = carryOut;

    await db.prepare(`INSERT INTO monthly_summary (
      month,living,loan,total,manager_basic,member_a_basic,member_b_basic,labor_fee,
      manager_final,member_a_final,member_b_final,carry_in,settlement_needed,auto_transfer,month_diff,carry_out,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(month) DO UPDATE SET
      living=excluded.living,loan=excluded.loan,total=excluded.total,
      manager_basic=excluded.manager_basic,member_a_basic=excluded.member_a_basic,member_b_basic=excluded.member_b_basic,
      labor_fee=excluded.labor_fee,manager_final=excluded.manager_final,member_a_final=excluded.member_a_final,
      member_b_final=excluded.member_b_final,carry_in=excluded.carry_in,settlement_needed=excluded.settlement_needed,
      auto_transfer=excluded.auto_transfer,month_diff=excluded.month_diff,carry_out=excluded.carry_out,updated_at=excluded.updated_at`)
      .bind(
        ym, living, loanTotal, total, managerBasic, memberABasic, memberBBasic, laborFee,
        managerFinal, memberAFinal, memberBFinal, carryIn, settlementNeeded, autoTransfer, monthDiff, carryOut, now,
      ).run();
  }

  return db;
}

export async function ensureYearSummary(env, year) {
  const y = String(year || '');
  if (!isSupportedYear(y)) throw new Error('지원하지 않는 연도입니다.');
  const db = await ensureAppTables(env);
  const count = await db.prepare('SELECT COUNT(*) AS c FROM monthly_summary WHERE month LIKE ?').bind(`${y}-%`).first();
  if (Number(count?.c || 0) >= 12) return db;
  return computeAndWrite(env, { year: y, startMonth: `${y}-01`, initialize: true });
}

export async function ensureMonthlySummary(env, month = '2026-01') {
  const ym = normalizeMonthValue(month);
  const year = yearOfMonth(ym);
  if (!isSupportedMonth(ym)) throw new Error('지원하지 않는 월입니다.');
  return ensureYearSummary(env, year);
}

export async function recalculateMonthlySummaryFrom(env, month) {
  const ym = normalizeMonthValue(month);
  if (!isSupportedMonth(ym)) return null;
  const year = yearOfMonth(ym);
  await ensureYearSummary(env, year);
  return computeAndWrite(env, { year, startMonth: ym, initialize: false });
}

export async function getMonthlySummary(env, month) {
  const ym = normalizeMonthValue(month);
  if (!isSupportedMonth(ym)) return null;
  const db = await ensureMonthlySummary(env, ym);
  const row = await db.prepare('SELECT * FROM monthly_summary WHERE month=? LIMIT 1').bind(ym).first();
  return mapSummary(row);
}

export async function getMonthlySummaries(env, { year = null } = {}) {
  const db = await ensureAppTables(env);
  if (year) {
    const y = String(year);
    await ensureYearSummary(env, y);
    const result = await db.prepare('SELECT * FROM monthly_summary WHERE month LIKE ? ORDER BY month ASC').bind(`${y}-%`).all();
    return (result.results || []).map(mapSummary);
  }
  const result = await db.prepare('SELECT * FROM monthly_summary ORDER BY month ASC').all();
  return (result.results || []).map(mapSummary);
}

export async function getPreviousMonthlySummary(env, month) {
  const prev = previousMonthSameYear(month);
  if (!prev) return null;
  return getMonthlySummary(env, prev);
}
