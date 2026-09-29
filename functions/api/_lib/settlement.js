import { sheetsUpdate, sheetsClear } from './google.js';
import { getMonthlySummaries } from './summary-store.js';

export async function syncMonthlySettlement(env, { cleanup = false } = {}) {
  const summaries = await getMonthlySummaries(env);
  const output = summaries.map((s) => [
    s.month,
    s.living,
    s.loan,
    s.total,
    s.managerBasic,
    s.memberABasic,
    s.memberBBasic,
    s.laborFeeConfig,
    s.managerFinal,
    s.memberAFinal,
    s.memberBFinal,
    s.carryIn,
    s.settlementNeeded,
    s.autoTransfer,
    s.monthDiff,
    s.carryOut,
  ]);

  if (cleanup) await sheetsClear(env, '월정산!A3:P500');
  if (output.length) await sheetsUpdate(env, `월정산!A3:P${output.length + 2}`, output, 'RAW');
  return { ok: true, updated: output.length };
}
