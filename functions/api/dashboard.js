import { json, bad } from './_lib/http.js';
import { sheetsGet } from './_lib/google.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const isMonth = (v) => /^\d{4}-\d{2}$/.test(v || '');

function normalizeMonthValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Google Sheets date serial: day 0 = 1899-12-30.
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

  // Backfill shares if an older row has no pre-calculated share columns.
  if (!manager && !memberA && !memberB && amount) {
    if (splitType === '3인 공동') {
      manager = memberA = memberB = amount / 3;
    } else if (['JH + CE','JH+CE'].includes(splitType)) {
      manager = 0;
      memberA = memberB = amount / 2;
    } else {
      manager = memberA = amount / 2;
      memberB = 0;
    }
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

function normalizeLoan(row) {
  return {
    month: normalizeMonthValue(row[0]),
    principal: n(row[1]),
    interest: n(row[2]),
    rate: n(row[3]),
    balance: n(row[4]),
    total: n(row[5]) || n(row[1]) + n(row[2]),
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

function autoTransferForMonth(ym, configured) {
  if (ym === '2025-01' || ym === '2025-02') return 300000;
  if (ym >= '2025-03') return 400000;
  return configured || 400000;
}

export async function onRequestGet({ request, env }) {
  try {
    const month = new URL(request.url).searchParams.get('month');
    if (!isMonth(month)) return bad('month must be YYYY-MM');

    const data = await sheetsGet(env, [
      '지출내역!A3:I5000',
      '대출내역!A3:I500',
      '월정산!A3:H200',
      'SETTINGS!B9:B12',
    ]);

    const [expensesRange, loansRange, settlementsRange, settingsRange] = data.valueRanges || [];
    const expenses = (expensesRange?.values || []).map((row, i) => normalizeExpense(row, i + 3)).filter((r) => isMonth(r.month));
    const loans = (loansRange?.values || []).map(normalizeLoan).filter((r) => isMonth(r.month));

    const laborFeeByMonth = new Map();
    for (const row of settlementsRange?.values || []) {
      const ym = normalizeMonthValue(row[0]);
      if (isMonth(ym)) laborFeeByMonth.set(ym, n(row[7]));
    }

    const settingsRows = settingsRange?.values || [];
    const defaultLaborFee = n(settingsRows?.[0]?.[0]) || 200000;
    const configuredAutoTransfer = n(settingsRows?.[3]?.[0]) || 400000;

    const expenseMonths = expenses.map((r) => r.month);
    const loanMonths = loans.map((r) => r.month);
    const settlementMonths = [...laborFeeByMonth.keys()];
    const allMonths = [...expenseMonths, ...loanMonths, ...settlementMonths].filter(isMonth).sort();
    const carryStart = allMonths[0] && allMonths[0] <= month ? allMonths[0] : month;

    let carry = 0;
    let requestedSummary = null;

    for (const ym of monthRange(carryStart, month)) {
      const monthExpenses = expenses.filter((r) => r.month === ym);
      const loan = loans.find((r) => r.month === ym) || normalizeLoan([]);

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

      if (ym === month) {
        requestedSummary = {
          living,
          loan: loanTotal,
          total,
          managerBasic,
          memberABasic,
          memberBBasic,
          laborFee,
          managerFinal,
          memberAFinal,
          memberBFinal,
          carryIn,
          autoTransfer: transferApplied,
          carryOut,
        };
      }
    }

    const monthExpenses = expenses
      .filter((r) => r.month === month)
      .map(({ manager, memberA, memberB, ...rest }) => rest);
    const loan = loans.find((r) => r.month === month) || normalizeLoan([]);

    return json({
      ok: true,
      source: 'google-sheets',
      month,
      summary: requestedSummary || {
        living: 0, loan: 0, total: 0,
        managerBasic: 0, memberABasic: 0, memberBBasic: 0,
        laborFee: 0, managerFinal: 0, memberAFinal: 0, memberBFinal: 0,
        carryIn: carry, autoTransfer: 0, carryOut: carry,
      },
      expenses: monthExpenses,
      loan,
    });
  } catch (err) {
    return bad(err?.message || 'dashboard error', 500);
  }
}
