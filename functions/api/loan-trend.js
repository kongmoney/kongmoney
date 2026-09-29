import { json, bad } from './_lib/http.js';
import { listLoans } from './_lib/loan-store.js';

export async function onRequestGet({ env }) {
  try {
    const rows = await listLoans(env);
    const active = rows.filter((r) => r.principal > 0 || r.interest > 0);
    const first = rows[0] || null;
    const latest = [...active].reverse().find((r) => r.balance > 0) || [...rows].reverse().find((r) => r.balance > 0) || null;
    const startBalance = first ? first.balance + first.principal : 0;
    const currentBalance = latest?.balance || 0;
    const cumulativePrincipal = active.reduce((sum, r) => sum + r.principal, 0);
    return json({
      ok: true,
      year: 2026,
      storage: 'd1',
      summary: { startBalance, currentBalance, cumulativePrincipal },
      rows,
    });
  } catch (err) {
    return bad(err?.message || 'loan trend error', err?.status || 500);
  }
}
