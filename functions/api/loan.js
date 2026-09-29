import { json, bad } from './_lib/http.js';
import { sheetsGet, sheetsUpdate, sheetsAppend } from './_lib/google.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const month = String(body.month || '');
    const principal = n(body.principal);
    const interest = n(body.interest);
    const rate = n(body.rate);
    const balance = n(body.balance);
    if (!/^\d{4}-\d{2}$/.test(month)) return bad('month must be YYYY-MM');
    if (principal < 0 || interest < 0 || balance < 0 || rate < 0) return bad('invalid loan values');

    const total = principal + interest;
    const data = await sheetsGet(env, ['대출내역!A3:I500']);
    const rows = data.valueRanges?.[0]?.values || [];
    const idx = rows.findIndex((row) => String(row?.[0] || '') === month);

    if (idx >= 0) {
      const sheetRow = idx + 3;
      await sheetsUpdate(env, `대출내역!B${sheetRow}:H${sheetRow}`, [[
        principal, interest, rate, balance, total, total / 2, total / 2,
      ]]);
      return json({ ok: true, mode: 'updated', month, principal, interest, rate, balance, total });
    }

    await sheetsAppend(env, '대출내역!A:I', [[
      month, principal, interest, rate, balance, total, total / 2, total / 2, '',
    ]]);
    return json({ ok: true, mode: 'inserted', month, principal, interest, rate, balance, total }, 201);
  } catch (err) {
    return bad(err?.message || 'loan update error', 500);
  }
}
