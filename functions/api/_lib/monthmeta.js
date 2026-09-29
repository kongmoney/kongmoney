import { ensureAppTables } from './d1.js';
import { normalizeMonthValue, isSupportedMonth } from './year.js';

const STORAGE_KEY = 'APP_MONTH_META';

export function parseClosed(value) {
  const v = String(value ?? '').trim().toUpperCase();
  return ['Y','YES','TRUE','1','CLOSED','마감'].includes(v);
}

// Kept for backwards compatibility with older imports/builds.
export function parseMonthMetaRows(rows = []) {
  const map = new Map();
  if (!Array.isArray(rows) || !rows.length) return map;
  const first = rows[0] || [];
  if (String(first?.[0] || '').trim() === STORAGE_KEY) {
    const raw = String(first?.[1] || '').trim();
    if (!raw) return map;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          const month = normalizeMonthValue(key);
          if (!isSupportedMonth(month)) continue;
          map.set(month, { month, memo: String(value?.memo ?? ''), closed: Boolean(value?.closed) });
        }
      }
    } catch {}
    return map;
  }
  for (const row of rows) {
    const month = normalizeMonthValue(row?.[0]);
    if (!isSupportedMonth(month)) continue;
    map.set(month, { month, memo: String(row?.[1] ?? ''), closed: parseClosed(row?.[2]) });
  }
  return map;
}

export async function getMonthMeta(env, month) {
  const ym = normalizeMonthValue(month);
  if (!isSupportedMonth(ym)) return { month: ym, memo: '', closed: false };
  const db = await ensureAppTables(env);
  const row = await db.prepare('SELECT month,memo,closed FROM month_meta WHERE month = ?').bind(ym).first();
  return { month: ym, memo: String(row?.memo ?? ''), closed: Boolean(row?.closed) };
}

export async function writeMonthMeta(env, month, meta) {
  const ym = normalizeMonthValue(month);
  if (!isSupportedMonth(ym)) throw new Error('2025년 또는 2026년 월만 저장할 수 있습니다.');
  const db = await ensureAppTables(env);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO month_meta (month,memo,closed,updated_at)
    VALUES (?,?,?,?)
    ON CONFLICT(month) DO UPDATE SET memo=excluded.memo, closed=excluded.closed, updated_at=excluded.updated_at`)
    .bind(ym, String(meta?.memo ?? ''), meta?.closed ? 1 : 0, now).run();
  return { month: ym, memo: String(meta?.memo ?? ''), closed: Boolean(meta?.closed) };
}

export async function assertMonthOpen(env, month) {
  const meta = await getMonthMeta(env, month);
  if (meta.closed) {
    const error = new Error(`${Number(String(month).slice(5))}월은 정산 마감된 달입니다. 마감 해제 후 수정해주세요.`);
    error.status = 409;
    throw error;
  }
  return meta;
}
