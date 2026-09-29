import { json, bad } from './_lib/http.js';
import { sheetsGet, sheetsUpdate, sheetsAppend } from './_lib/google.js';
import { syncMonthlySettlement } from './_lib/settlement.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function normalizeMonthValue(value) {
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

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const month = String(body.month || '');
    const principal = n(body.principal);
    const interest = n(body.interest);
    const rate = n(body.rate);
    const balance = n(body.balance);
    if (!/^2026-(0[1-9]|1[0-2])$/.test(month)) return bad('대출내역은 2026년 1월~12월만 관리합니다.');
    if (principal < 0 || interest < 0 || balance < 0 || rate < 0) return bad('invalid loan values');

    const total = principal + interest;
    const data = await sheetsGet(env, ['대출내역!A3:I500']);
    const rows = data.valueRanges?.[0]?.values || [];
    const idx = rows.findIndex((row) => normalizeMonthValue(row?.[0]) === month);

    if (idx >= 0) {
      const sheetRow = idx + 3;
      await sheetsUpdate(env, `대출내역!B${sheetRow}:H${sheetRow}`, [[
        principal, interest, rate, balance, total, total / 2, total / 2,
      ]]);
      await syncMonthlySettlement(env);
      return json({ ok: true, mode: 'updated', month, principal, interest, rate, balance, total });
    }

    await sheetsAppend(env, '대출내역!A:I', [[
      month, principal, interest, rate, balance, total, total / 2, total / 2, '',
    ]], 'RAW');
    await syncMonthlySettlement(env);
    return json({ ok: true, mode: 'inserted', month, principal, interest, rate, balance, total }, 201);
  } catch (err) {
    return bad(err?.message || 'loan update error', 500);
  }
}
