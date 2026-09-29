import { sheetsGet, sheetsUpdate } from './google.js';
import { normalizeMonthValue, is2026Month } from './year2026.js';

const STORAGE_RANGE = 'SETTINGS!C4:D4';
const STORAGE_KEY = 'APP_MONTH_META';

export function parseClosed(value) {
  const v = String(value ?? '').trim().toUpperCase();
  return ['Y','YES','TRUE','1','CLOSED','마감'].includes(v);
}

/**
 * Supports both the current JSON cell format:
 *   [["APP_MONTH_META", "{...json...}"]]
 * and the older row format:
 *   [["2026-01", "memo", "Y"], ...]
 */
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
          if (!is2026Month(month)) continue;
          map.set(month, {
            month,
            memo: String(value?.memo ?? ''),
            closed: Boolean(value?.closed),
          });
        }
      }
    } catch {}
    return map;
  }

  for (const row of rows) {
    const month = normalizeMonthValue(row?.[0]);
    if (!is2026Month(month)) continue;
    map.set(month, {
      month,
      memo: String(row?.[1] ?? ''),
      closed: parseClosed(row?.[2]),
    });
  }
  return map;
}

async function readAll(env) {
  const data = await sheetsGet(env, [STORAGE_RANGE]);
  const rows = data.valueRanges?.[0]?.values || [];
  const map = parseMonthMetaRows(rows);
  const all = {};
  for (const [month, meta] of map.entries()) {
    all[month] = { memo: meta.memo, closed: meta.closed };
  }
  return all;
}

export async function writeMonthMeta(env, month, meta) {
  const ym = normalizeMonthValue(month);
  if (!is2026Month(ym)) throw new Error('2026년 월만 저장할 수 있습니다.');
  const all = await readAll(env);
  all[ym] = { memo: String(meta?.memo ?? ''), closed: Boolean(meta?.closed) };
  await sheetsUpdate(env, STORAGE_RANGE, [[STORAGE_KEY, JSON.stringify(all)]], 'RAW');
  return { month: ym, ...all[ym] };
}

export async function getMonthMeta(env, month) {
  const ym = normalizeMonthValue(month);
  const all = await readAll(env);
  const meta = all[ym] || {};
  return { month: ym, memo: String(meta.memo ?? ''), closed: Boolean(meta.closed) };
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
