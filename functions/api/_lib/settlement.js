import { sheetsGet, sheetsUpdate } from './google.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const isMonth = (v) => /^\d{4}-\d{2}$/.test(v || '');

function normalizeMonthValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  const direct = text.match(/^(\d{4})[-/.년 ]+(\d{1,2})(?:[-/.월 ]+\d{1,2})?/);
  if (direct) return `${direct[1]}-${String(Number(direct[2])).padStart(2, '0')}`;
  return text;
}

function monthRange(start, end) {
  if (!isMonth(start) || !isMonth(end) || start > end) return [];
  const result = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) { y += 1; m = 1; }
  }
  return result;
}

function autoTransferForMonth(ym, configured) {
  if (ym === '2025-01' || ym === '2025-02') return 300000;
  if (ym >= '2025-03') return 400000;
  return configured || 400000;
}

function normalizeExpense(row) {
  const amount = n(row[4]);
  const splitType = String(row[5] || '');
  let manager = n(row[6]);
  let memberA = n(row[7]);
  let memberB = n(row[8]);
  if (!manager && !memberA && !memberB && amount) {
    if (splitType === '3인 공동') manager = memberA = memberB = amount / 3;
    else if (['JH + CE','JH+CE'].includes(splitType)) memberA = memberB = amount / 2;
    else manager = memberA = amount / 2;
  }
  return { month: normalizeMonthValue(row[0]), amount, manager, memberA, memberB };
}

function normalizeLoan(row) {
  return {
    month: normalizeMonthValue(row[0]),
    total: n(row[5]) || n(row[1]) + n(row[2]),
  };
}

/**
 * Rebuild 월정산 from the live 지출내역 + 대출내역 data.
 * H(1인당 수고비) is preserved per month when it already exists.
 * B:P are written as concrete values so Google Sheets and the web stay identical.
 */
export async function syncMonthlySettlement(env) {
  const data = await sheetsGet(env, [
    '지출내역!A3:I5000',
    '대출내역!A3:I500',
    '월정산!A3:P500',
    'SETTINGS!B9:B12',
  ]);
  const [expensesRange, loansRange, settlementsRange, settingsRange] = data.valueRanges || [];
  const expenses = (expensesRange?.values || []).map(normalizeExpense).filter(r => isMonth(r.month));
  const loans = (loansRange?.values || []).map(normalizeLoan).filter(r => isMonth(r.month));
  const settlementRows = settlementsRange?.values || [];

  const existingByMonth = new Map();
  for (let i = 0; i < settlementRows.length; i += 1) {
    const row = settlementRows[i] || [];
    const ym = normalizeMonthValue(row[0]);
    if (isMonth(ym)) existingByMonth.set(ym, { sheetRow: i + 3, row });
  }

  const settingsRows = settingsRange?.values || [];
  const defaultLaborFee = n(settingsRows?.[0]?.[0]) || 200000;
  const configuredAutoTransfer = n(settingsRows?.[3]?.[0]) || 400000;

  const months = new Set([
    ...expenses.map(r => r.month),
    ...loans.map(r => r.month),
    ...existingByMonth.keys(),
  ]);
  const sorted = [...months].filter(isMonth).sort();
  if (!sorted.length) return { ok: true, updated: 0 };

  const fullMonths = monthRange(sorted[0], sorted[sorted.length - 1]);
  let carry = 0;
  let nextFreeRow = 3;
  for (const { sheetRow } of existingByMonth.values()) nextFreeRow = Math.max(nextFreeRow, sheetRow + 1);
  let updated = 0;

  for (const ym of fullMonths) {
    const monthExpenses = expenses.filter(r => r.month === ym);
    const loan = loans.find(r => r.month === ym);
    const existing = existingByMonth.get(ym);
    const living = monthExpenses.reduce((sum, r) => sum + r.amount, 0);
    const managerExpense = monthExpenses.reduce((sum, r) => sum + r.manager, 0);
    const memberAExpense = monthExpenses.reduce((sum, r) => sum + r.memberA, 0);
    const memberBExpense = monthExpenses.reduce((sum, r) => sum + r.memberB, 0);
    const loanTotal = loan?.total || 0;
    const total = living + loanTotal;
    const active = total > 0;
    const existingLabor = n(existing?.row?.[7]);
    const laborFee = active ? (existingLabor || defaultLaborFee) : (existingLabor || defaultLaborFee);

    const managerBasic = managerExpense + loanTotal / 2;
    const memberABasic = memberAExpense + loanTotal / 2;
    const memberBBasic = memberBExpense;
    const managerFinal = active ? managerBasic - laborFee * 2 : 0;
    const memberAFinal = active ? memberABasic + laborFee : 0;
    const memberBFinal = active ? memberBBasic + laborFee : 0;
    const carryIn = carry;
    const settlementNeeded = active ? Math.max(0, memberBFinal - carryIn) : 0;
    const autoTransfer = active ? autoTransferForMonth(ym, configuredAutoTransfer) : 0;
    const monthDiff = active ? carryIn + autoTransfer - memberBFinal : 0;
    const carryOut = active ? monthDiff : carryIn;
    if (active) carry = carryOut;

    // Do not manufacture rows for completely empty gap months unless a row already exists.
    if (!active && !existing) continue;

    const sheetRow = existing?.sheetRow || nextFreeRow++;
    const values = [[
      ym, living, loanTotal, total,
      managerBasic, memberABasic, memberBBasic, laborFee,
      managerFinal, memberAFinal, memberBFinal,
      carryIn, settlementNeeded, autoTransfer, monthDiff, carryOut,
    ]];
    await sheetsUpdate(env, `월정산!A${sheetRow}:P${sheetRow}`, values, 'RAW');
    updated += 1;
  }

  return { ok: true, updated };
}
