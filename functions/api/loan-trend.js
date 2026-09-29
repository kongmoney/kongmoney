import { json, bad } from './_lib/http.js';
import { sheetsGet } from './_lib/google.js';
import { normalizeMonthValue, is2026Month } from './_lib/year2026.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function onRequestGet({ env }) {
  try {
    const data = await sheetsGet(env, ['대출내역!A3:I500']);
    const rows = (data.valueRanges?.[0]?.values || [])
      .map((row) => ({
        month: normalizeMonthValue(row?.[0]),
        principal: n(row?.[1]),
        interest: n(row?.[2]),
        rate: n(row?.[3]),
        balance: n(row?.[4]),
        total: n(row?.[5]) || n(row?.[1]) + n(row?.[2]),
      }))
      .filter((row) => is2026Month(row.month))
      .sort((a, b) => a.month.localeCompare(b.month));

    const active = rows.filter((r) => r.principal > 0 || r.interest > 0);
    const first = rows[0] || null;
    const latest = [...active].reverse().find((r) => r.balance > 0) || [...rows].reverse().find((r) => r.balance > 0) || null;
    const startBalance = first ? first.balance + first.principal : 0;
    const currentBalance = latest?.balance || 0;
    const cumulativePrincipal = active.reduce((sum, r) => sum + r.principal, 0);

    return json({
      ok: true,
      year: 2026,
      summary: { startBalance, currentBalance, cumulativePrincipal },
      rows,
    });
  } catch (err) {
    return bad(err?.message || 'loan trend error', 500);
  }
}
