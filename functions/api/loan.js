import { json, bad } from './_lib/http.js';
import { sheetsGet, sheetsUpdate, sheetsAppend } from './_lib/google.js';
import { syncMonthlySettlement } from './_lib/settlement.js';
import { parseMonthMetaRows } from './_lib/monthmeta.js';

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
    const hasRate = body.rate !== null && body.rate !== undefined && String(body.rate).trim() !== '';
    const hasBalance = body.balance !== null && body.balance !== undefined && String(body.balance).trim() !== '';
    let rate = hasRate ? n(body.rate) : 0;
    let balance = hasBalance ? n(body.balance) : 0;
    if (!/^2026-(0[1-9]|1[0-2])$/.test(month)) return bad('대출내역은 2026년 1월~12월만 관리합니다.');
    if (principal < 0 || interest < 0 || balance < 0 || rate < 0) return bad('invalid loan values');

    const total = principal + interest;
    const data = await sheetsGet(env, ['대출내역!A3:I500','SETTINGS!L3:N14']);
    const rows = data.valueRanges?.[0]?.values || [];
    const metaMap = parseMonthMetaRows(data.valueRanges?.[1]?.values || []);
    if (metaMap.get(month)?.closed) return bad(`${Number(month.slice(5))}월은 정산 마감된 달입니다. 마감 해제 후 수정해주세요.`, 409);
    const idx = rows.findIndex((row) => normalizeMonthValue(row?.[0]) === month);
    const normalizedRows = rows
      .map((row) => ({ month: normalizeMonthValue(row?.[0]), rate: n(row?.[3]), balance: n(row?.[4]) }))
      .filter((row) => /^2026-(0[1-9]|1[0-2])$/.test(row.month))
      .sort((a, b) => a.month.localeCompare(b.month));
    const previous = [...normalizedRows].reverse().find((row) => row.month < month && row.balance > 0) || null;
    if (!hasRate) rate = previous?.rate || (idx >= 0 ? n(rows[idx]?.[3]) : 0);
    if (!hasBalance) balance = Math.max(0, (previous?.balance || 0) - principal);

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


export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const month = String(body.month || '').trim();
    if (!/^2026-(0[1-9]|1[0-2])$/.test(month)) return bad('대출내역은 2026년 1월~12월만 관리합니다.');

    const data = await sheetsGet(env, ['대출내역!A3:I500','SETTINGS!L3:N14']);
    const rows = data.valueRanges?.[0]?.values || [];
    const metaMap = parseMonthMetaRows(data.valueRanges?.[1]?.values || []);
    if (metaMap.get(month)?.closed) return bad(`${Number(month.slice(5))}월은 정산 마감된 달입니다. 마감 해제 후 수정해주세요.`, 409);
    const idx = rows.findIndex((row) => normalizeMonthValue(row?.[0]) === month);
    if (idx < 0) return bad('초기화할 대출내역이 없습니다.', 404);

    const normalizedRows = rows
      .map((row) => ({ month: normalizeMonthValue(row?.[0]), rate: n(row?.[3]), balance: n(row?.[4]) }))
      .filter((row) => /^2026-(0[1-9]|1[0-2])$/.test(row.month))
      .sort((a, b) => a.month.localeCompare(b.month));
    const previous = [...normalizedRows].reverse().find((row) => row.month < month && row.balance > 0) || null;
    const sheetRow = idx + 3;
    const currentRate = n(rows[idx]?.[3]);
    const resetRate = previous?.rate || currentRate || 0;
    const resetBalance = previous?.balance || 0;

    await sheetsUpdate(env, `대출내역!B${sheetRow}:I${sheetRow}`, [[
      0, 0, resetRate, resetBalance, 0, 0, 0, '',
    ]]);
    await syncMonthlySettlement(env);

    return json({ ok: true, mode: 'reset', month, principal: 0, interest: 0, rate: resetRate, balance: resetBalance, total: 0 });
  } catch (err) {
    return bad(err?.message || 'loan reset error', 500);
  }
}
