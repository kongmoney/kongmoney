import { json, bad } from './_lib/http.js';
import { sheetsGet } from './_lib/google.js';
import { getMonthMeta } from './_lib/monthmeta.js';
import { listExpenses, getLastSheetSync } from './_lib/expense-store.js';
import { listLoans } from './_lib/loan-store.js';

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

function normalizeExpense(row, sheetRow = null) {
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
  return {
    sheetRow,
    month: normalizeMonthValue(row[0]),
    category: String(row[1] || ''),
    subcategory: String(row[2] || ''),
    description: String(row[3] || ''),
    amount,
    splitType,
    manager,
    memberA,
    memberB,
  };
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

function previousMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function autoTransferForMonth(ym, configured) {
  if (ym === '2026-01' || ym === '2026-02') return 300000;
  if (ym >= '2026-03') return 400000;
  return configured || 400000;
}

function emptySummary(carry = 0) {
  return {
    living: 0, loan: 0, total: 0,
    managerBasic: 0, memberABasic: 0, memberBBasic: 0,
    laborFee: 0, managerFinal: 0, memberAFinal: 0, memberBFinal: 0,
    carryIn: carry, autoTransfer: 0, carryOut: carry,
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const month = new URL(request.url).searchParams.get('month');
    if (!/^2026-(0[1-9]|1[0-2])$/.test(month || '')) return bad('조회 월은 2026년 1월~12월만 지원합니다.');

    const [expenses, loans, data, lastSheetSync] = await Promise.all([
      listExpenses(env),
      listLoans(env),
      sheetsGet(env, [
        '월정산!A3:P14',
        'SETTINGS!B9:B12',
      ]),
      getLastSheetSync(env),
    ]);

    const [settlementsRange, settingsRange] = data.valueRanges || [];

    const laborFeeByMonth = new Map();
    for (const row of settlementsRange?.values || []) {
      const ym = normalizeMonthValue(row[0]);
      if (/^2026-(0[1-9]|1[0-2])$/.test(ym)) laborFeeByMonth.set(ym, n(row[7]));
    }

    const settingsRows = settingsRange?.values || [];
    const defaultLaborFee = n(settingsRows?.[0]?.[0]) || 200000;
    const configuredAutoTransfer = n(settingsRows?.[3]?.[0]) || 400000;

    let carry = 0;
    const summaryByMonth = new Map();

    for (const ym of monthRange('2026-01', month)) {
      const monthExpenses = expenses.filter((r) => r.month === ym);
      const loan = loans.find((r) => r.month === ym) || { principal:0, interest:0, rate:0, balance:0, total:0 };
      const living = monthExpenses.reduce((sum, r) => sum + r.amount, 0);
      const managerExpense = monthExpenses.reduce((sum, r) => sum + r.manager, 0);
      const memberAExpense = monthExpenses.reduce((sum, r) => sum + r.memberA, 0);
      const memberBExpense = monthExpenses.reduce((sum, r) => sum + r.memberB, 0);
      const loanTotal = loan.total;
      const total = living + loanTotal;
      const active = total > 0;
      const laborFee = active ? (laborFeeByMonth.get(ym) || defaultLaborFee) : 0;
      const managerBasic = managerExpense + loanTotal / 2;
      const memberABasic = memberAExpense + loanTotal / 2;
      const memberBBasic = memberBExpense;
      const managerFinal = active ? managerBasic - laborFee * 2 : 0;
      const memberAFinal = active ? memberABasic + laborFee : 0;
      const memberBFinal = active ? memberBBasic + laborFee : 0;
      const carryIn = carry;
      const transferApplied = active ? autoTransferForMonth(ym, configuredAutoTransfer) : 0;
      const carryOut = active ? carryIn + transferApplied - memberBFinal : carryIn;
      if (active) carry = carryOut;
      summaryByMonth.set(ym, {
        living, loan: loanTotal, total,
        managerBasic, memberABasic, memberBBasic,
        laborFee, managerFinal, memberAFinal, memberBFinal,
        carryIn, autoTransfer: transferApplied, carryOut,
      });
    }

    const summary = summaryByMonth.get(month) || emptySummary(carry);
    const prevMonth = previousMonth(month);
    const previousSummary = /^2026-/.test(prevMonth) ? (summaryByMonth.get(prevMonth) || emptySummary(0)) : null;
    const monthExpenses = expenses.filter((r) => r.month === month).map(({ manager, memberA, memberB, ...rest }) => rest);
    const loan = loans.find((r) => r.month === month) || { principal:0, interest:0, rate:0, balance:0, total:0 };
    const meta = await getMonthMeta(env, month);

    return json({
      ok: true,
      source: 'd1+google-sheets',
      expenseStorage: 'd1',
      loanStorage: 'd1',
      lastSheetSync,
      month,
      summary,
      comparison: { previousMonth: previousSummary ? prevMonth : null, previous: previousSummary },
      meta,
      expenses: monthExpenses,
      loan,
    });
  } catch (err) {
    return bad(err?.message || 'dashboard error', 500);
  }
}
