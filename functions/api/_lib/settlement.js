import { sheetsGet, sheetsUpdate, sheetsClear } from './google.js';
import { listExpenses } from './expense-store.js';
import { listLoans } from './loan-store.js';
import { normalizeMonthValue, is2026Month, months2026 } from './year2026.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function autoTransferForMonth(ym) {
  if (ym === '2026-01' || ym === '2026-02') return 300000;
  return 400000;
}



export async function syncMonthlySettlement(env, { cleanup = false } = {}) {
  const [expenses, loans, data] = await Promise.all([
    listExpenses(env),
    listLoans(env),
    sheetsGet(env, [
      '월정산!A3:P500',
      'SETTINGS!B9:B12',
    ]),
  ]);
  const [settlementsRange, settingsRange] = data.valueRanges || [];
  const settlementRows = settlementsRange?.values || [];

  const laborByMonth = new Map();
  for (const row of settlementRows) {
    const ym = normalizeMonthValue(row?.[0]);
    if (is2026Month(ym)) laborByMonth.set(ym, n(row?.[7]));
  }
  const settingsRows = settingsRange?.values || [];
  const defaultLaborFee = n(settingsRows?.[0]?.[0]) || 200000;

  let carry = 0;
  const output = [];

  for (const ym of months2026) {
    const monthExpenses = expenses.filter(r => r.month === ym);
    const loan = loans.find(r => r.month === ym);
    const living = monthExpenses.reduce((sum, r) => sum + r.amount, 0);
    const managerExpense = monthExpenses.reduce((sum, r) => sum + r.manager, 0);
    const memberAExpense = monthExpenses.reduce((sum, r) => sum + r.memberA, 0);
    const memberBExpense = monthExpenses.reduce((sum, r) => sum + r.memberB, 0);
    const loanTotal = loan?.total || 0;
    const total = living + loanTotal;
    const active = total > 0;
    const laborFee = laborByMonth.get(ym) || defaultLaborFee;

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

    output.push([
      ym, living, loanTotal, total,
      managerBasic, memberABasic, memberBBasic, laborFee,
      managerFinal, memberAFinal, memberBFinal,
      carryIn, settlementNeeded, autoTransfer, monthDiff, carryOut,
    ]);
  }

  // Normal saves overwrite only the fixed 2026 rows. Full cleanup is reserved
  // for the explicit one-time settlement sync endpoint.
  if (cleanup) await sheetsClear(env, '월정산!A3:P500');
  await sheetsUpdate(env, '월정산!A3:P14', output, 'RAW');
  return { ok: true, updated: output.length };
}
