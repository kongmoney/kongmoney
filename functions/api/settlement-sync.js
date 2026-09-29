import { json, bad } from './_lib/http.js';
import { syncMonthlySettlement } from './_lib/settlement.js';

export async function onRequestPost({ env }) {
  try {
    const result = await syncMonthlySettlement(env);
    return json({ ok: true, ...result });
  } catch (err) {
    return bad(err?.message || 'settlement sync error', 500);
  }
}
