import { json, bad } from './_lib/http.js';
import { syncMonthlySettlement } from './_lib/settlement.js';
import { normalizeLoanYear2026 } from './_lib/year2026.js';

export async function onRequestPost({ env }) {
  try {
    const loan = await normalizeLoanYear2026(env);
    const settlement = await syncMonthlySettlement(env);
    return json({ ok: true, loan, settlement, year: 2026 });
  } catch (err) {
    return bad(err?.message || 'settlement sync error', 500);
  }
}
