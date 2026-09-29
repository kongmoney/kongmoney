import { sheetsGet, sheetsUpdate, sheetsClear } from './google.js';

const TARGET_YEAR = '2026';
const months2026 = Array.from({ length: 12 }, (_, i) => `${TARGET_YEAR}-${String(i + 1).padStart(2, '0')}`);

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function normalizeMonthValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  const m = text.match(/^(\d{4})[-/.년 ]+(\d{1,2})(?:[-/.월 ]+\d{1,2})?/);
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, '0')}` : text;
}

export function is2026Month(value) {
  return /^2026-(0[1-9]|1[0-2])$/.test(normalizeMonthValue(value));
}

export async function normalizeLoanYear2026(env) {
  const data = await sheetsGet(env, ['대출내역!A3:I500']);
  const rows = data.valueRanges?.[0]?.values || [];
  const byMonth = new Map();

  for (const row of rows) {
    const ym = normalizeMonthValue(row?.[0]);
    if (!is2026Month(ym)) continue;
    const principal = n(row?.[1]);
    const interest = n(row?.[2]);
    const rate = n(row?.[3]);
    const balance = n(row?.[4]);
    const total = principal + interest;
    byMonth.set(ym, [ym, principal, interest, rate, balance, total, total / 2, total / 2, String(row?.[8] || '')]);
  }

  let lastRate = 0.038;
  let lastBalance = 0;
  const normalized = months2026.map((ym) => {
    const current = byMonth.get(ym);
    if (current) {
      if (current[3]) lastRate = current[3];
      if (current[4]) lastBalance = current[4];
      return current;
    }
    return [ym, 0, 0, lastRate, lastBalance, 0, 0, 0, ''];
  });

  await sheetsClear(env, '대출내역!A3:I500');
  await sheetsUpdate(env, '대출내역!A3:I14', normalized, 'RAW');
  return { ok: true, rows: normalized.length };
}

export { months2026 };
