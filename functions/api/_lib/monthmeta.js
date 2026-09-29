import { sheetsGet } from './google.js';
import { normalizeMonthValue, is2026Month } from './year2026.js';

export function parseClosed(value) {
  const v = String(value ?? '').trim().toUpperCase();
  return ['Y','YES','TRUE','1','CLOSED','마감'].includes(v);
}

export function parseMonthMetaRows(rows = []) {
  const map = new Map();
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

export async function getMonthMeta(env, month) {
  const data = await sheetsGet(env, ['SETTINGS!L3:N14']);
  const rows = data.valueRanges?.[0]?.values || [];
  return parseMonthMetaRows(rows).get(month) || { month, memo: '', closed: false };
}

export async function assertMonthOpen(env, month) {
  const meta = await getMonthMeta(env, month);
  if (meta.closed) {
    const error = new Error(`${month.slice(5)}월은 정산 마감된 달입니다. 마감 해제 후 수정해주세요.`);
    error.status = 409;
    throw error;
  }
  return meta;
}
