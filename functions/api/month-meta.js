import { json, bad } from './_lib/http.js';
import { getMonthMeta, writeMonthMeta } from './_lib/monthmeta.js';
import { normalizeMonthValue, isSupportedMonth } from './_lib/year.js';

export async function onRequestGet({ request, env }) {
  try {
    const month = normalizeMonthValue(new URL(request.url).searchParams.get('month'));
    if (!isSupportedMonth(month)) return bad('month must be within 2025 or 2026');
    return json({ ok: true, meta: await getMonthMeta(env, month) });
  } catch (err) {
    return bad(err?.message || 'month meta read error', 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const month = normalizeMonthValue(body.month);
    if (!isSupportedMonth(month)) return bad('month must be within 2025 or 2026');
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
