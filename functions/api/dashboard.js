import { json, bad } from './_lib/http.js';
import { getMonthMeta } from './_lib/monthmeta.js';
import { listExpenses, getLastSheetSync } from './_lib/expense-store.js';
import { getLoan } from './_lib/loan-store.js';
import { getMonthlySummary, getPreviousMonthlySummary } from './_lib/summary-store.js';
import { isSupportedMonth } from './_lib/year.js';

const validMonth = (m) => isSupportedMonth(m);

export async function onRequestGet({ request, env }) {
  try {
    const month = new URL(request.url).searchParams.get('month');
    if (!validMonth(month)) return bad('조회 월은 2025년 또는 2026년만 지원합니다.');

    const [expenses, loan, summary, previousSummary, meta, lastSheetSync] = await Promise.all([
      listExpenses(env, { month }),
      getLoan(env, month),
      getMonthlySummary(env, month),
      getPreviousMonthlySummary(env, month),
      getMonthMeta(env, month),
      getLastSheetSync(env),
    ]);

    return json({
      ok: true,
      source: 'd1',
      expenseStorage: 'd1',
      loanStorage: 'd1',
      summaryStorage: 'd1-cache',
      lastSheetSync,
      month,
      summary: summary || {
        living: 0, loan: 0, total: 0,
        managerBasic: 0, memberABasic: 0, memberBBasic: 0,
        laborFee: 0, managerFinal: 0, memberAFinal: 0, memberBFinal: 0,
        carryIn: 0, settlementNeeded: 0, autoTransfer: 0, monthDiff: 0, carryOut: 0,
      },
      comparison: {
        previousMonth: previousSummary?.month || null,
        previous: previousSummary || null,
      },
      meta,
      expenses,
      loan: loan || { principal: 0, interest: 0, rate: 0, balance: 0, total: 0 },
    });
  } catch (err) {
    return bad(err?.message || 'dashboard error', err?.status || 500);
  }
}
