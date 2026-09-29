import { json, bad } from './_lib/http.js';
import { listLoans } from './_lib/loan-store.js';
import { isSupportedYear } from './_lib/year.js';

export async function onRequestGet({ request, env }) {
  try {
    const year = new URL(request.url).searchParams.get('year') || '2026';
    if (!isSupportedYear(year)) return bad('year must be 2025 or 2026', 400);
    const rows = (await listLoans(env)).filter((r) => String(r.month || '').startsWith(`${year}-`));
    const active = rows.filter((r) => r.principal > 0 || r.interest > 0);
    const first = rows[0] || null;
    const latest = [...active].reverse().find((r) => r.balance > 0) || [...rows].reverse().find((r) => r.balance > 0) || null;
    const startBalance = first ? first.balance + first.principal : 0;
    const currentBalance = latest?.balance || 0;
    const cumulativePrincipal = active.reduce((sum, r) => sum + r.principal, 0);
    return json({
      ok: true,
      year: Number(year),
      storage: 'd1',
      summary: { startBalance, currentBalance, cumulativePrincipal },
      rows,
    });
  } catch (err) {
    return bad(err?.message || 'loan trend error', err?.status || 500);
  }
}
