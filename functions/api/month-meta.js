import { json, bad } from './_lib/http.js';
import { getMonthMeta, writeMonthMeta } from './_lib/monthmeta.js';
import { normalizeMonthValue, is2026Month } from './_lib/year2026.js';

export async function onRequestGet({ request, env }) {
  try {
    const month = normalizeMonthValue(new URL(request.url).searchParams.get('month'));
    if (!is2026Month(month)) return bad('month must be 2026-01 ~ 2026-12');
    return json({ ok: true, meta: await getMonthMeta(env, month) });
  } catch (err) {
    return bad(err?.message || 'month meta read error', 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const month = normalizeMonthValue(body.month);
    if (!is2026Month(month)) return bad('month must be 2026-01 ~ 2026-12');
    const current = await getMonthMeta(env, month);
    const meta = await writeMonthMeta(env, month, {
      memo: Object.prototype.hasOwnProperty.call(body, 'memo') ? String(body.memo ?? '') : current.memo,
      closed: Object.prototype.hasOwnProperty.call(body, 'closed') ? Boolean(body.closed) : current.closed,
    });
    return json({ ok: true, meta });
  } catch (err) {
    return bad(err?.message || 'month meta save error', 500);
  }
}
