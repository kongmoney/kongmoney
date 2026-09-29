import { json, bad } from './_lib/http.js';
import { sheetsGet, sheetsUpdate } from './_lib/google.js';
import { normalizeMonthValue, is2026Month } from './_lib/year2026.js';
import { parseMonthMetaRows } from './_lib/monthmeta.js';

function rowForMonth(month) {
  return 2 + Number(month.slice(5, 7));
}

export async function onRequestGet({ request, env }) {
  try {
    const month = normalizeMonthValue(new URL(request.url).searchParams.get('month'));
    if (!is2026Month(month)) return bad('month must be 2026-01 ~ 2026-12');
    const data = await sheetsGet(env, ['SETTINGS!L3:N14']);
    const map = parseMonthMetaRows(data.valueRanges?.[0]?.values || []);
    return json({ ok: true, meta: map.get(month) || { month, memo: '', closed: false } });
  } catch (err) {
    return bad(err?.message || 'month meta read error', 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const month = normalizeMonthValue(body.month);
    if (!is2026Month(month)) return bad('month must be 2026-01 ~ 2026-12');

    const data = await sheetsGet(env, ['SETTINGS!L3:N14']);
    const map = parseMonthMetaRows(data.valueRanges?.[0]?.values || []);
    const current = map.get(month) || { month, memo: '', closed: false };
    const memo = body.memo === undefined ? current.memo : String(body.memo ?? '').slice(0, 500);
    const closed = body.closed === undefined ? current.closed : Boolean(body.closed);
    const row = rowForMonth(month);
    await sheetsUpdate(env, `SETTINGS!L${row}:N${row}`, [[month, memo, closed ? 'Y' : 'N']], 'RAW');
    return json({ ok: true, meta: { month, memo, closed } });
  } catch (err) {
    return bad(err?.message || 'month meta update error', 500);
  }
}
