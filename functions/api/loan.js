import { json, bad } from './_lib/http.js';
import { assertMonthOpen } from './_lib/monthmeta.js';
import { getLoan, getPreviousLoan, upsertLoan } from './_lib/loan-store.js';
import { recalculateMonthlySummaryFrom } from './_lib/summary-store.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const validMonth = (m) => /^2026-(0[1-9]|1[0-2])$/.test(m || '');

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const month = String(body.month || '').trim();
    if (!validMonth(month)) return bad('대출내역은 2026년 1월~12월만 관리합니다.');
    await assertMonthOpen(env, month);

    const principal = n(body.principal);
    const interest = n(body.interest);
    const hasRate = body.rate !== null && body.rate !== undefined && String(body.rate).trim() !== '';
    const hasBalance = body.balance !== null && body.balance !== undefined && String(body.balance).trim() !== '';
    if (principal < 0 || interest < 0) return bad('상환 원금/이자는 0원 이상이어야 합니다.');

    const current = await getLoan(env, month);
    const previous = await getPreviousLoan(env, month);
    let rate = hasRate ? n(body.rate) : (current?.rate || previous?.rate || 0);
    let balance = hasBalance ? n(body.balance) : Math.max(0, (previous?.balance || 0) - principal);
    if (rate < 0 || balance < 0) return bad('대출 값이 올바르지 않습니다.');

    const total = principal + interest;
    const saved = await upsertLoan(env, {
      month, principal, interest, rate, balance, total,
      managerShare: total / 2,
      memberAShare: total / 2,
      note: current?.note || '',
    });
    await recalculateMonthlySummaryFrom(env, month);
    return json({ ok: true, mode: current ? 'updated' : 'inserted', ...saved }, current ? 200 : 201);
  } catch (err) {
    return bad(err?.message || 'loan update error', err?.status || 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const month = String(body.month || '').trim();
    if (!validMonth(month)) return bad('대출내역은 2026년 1월~12월만 관리합니다.');
    await assertMonthOpen(env, month);

    const current = await getLoan(env, month);
    if (!current) return bad('초기화할 대출내역이 없습니다.', 404);
    const previous = await getPreviousLoan(env, month);
    const saved = await upsertLoan(env, {
      month,
      principal: 0,
      interest: 0,
      rate: previous?.rate || current.rate || 0,
      balance: previous?.balance || 0,
      total: 0,
      managerShare: 0,
      memberAShare: 0,
      note: '',
    });
    await recalculateMonthlySummaryFrom(env, month);
    return json({ ok: true, mode: 'reset', ...saved });
  } catch (err) {
    return bad(err?.message || 'loan reset error', err?.status || 500);
  }
}
