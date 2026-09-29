export const SUPPORTED_YEARS = ['2025', '2026'];

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

export function yearOfMonth(value) {
  const month = normalizeMonthValue(value);
  return /^\d{4}-\d{2}$/.test(month) ? month.slice(0, 4) : '';
}

export function isSupportedYear(year) {
  return SUPPORTED_YEARS.includes(String(year || ''));
}

export function isSupportedMonth(value) {
  const month = normalizeMonthValue(value);
  return /^(2025|2026)-(0[1-9]|1[0-2])$/.test(month);
}

export function monthsForYear(year) {
  const y = String(year || '');
  if (!isSupportedYear(y)) return [];
  return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
}

export function firstMonthOfYear(year) {
  return isSupportedYear(year) ? `${year}-01` : '';
}

export function previousMonthSameYear(month) {
  const ym = normalizeMonthValue(month);
  if (!isSupportedMonth(ym)) return '';
  const [year, mText] = ym.split('-');
  const m = Number(mText);
  if (m <= 1) return '';
  return `${year}-${String(m - 1).padStart(2, '0')}`;
}
