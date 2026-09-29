import { json, bad } from './_lib/http.js';
import { normalizeMonthValue, isSupportedMonth } from './_lib/year.js';
import { assertMonthOpen } from './_lib/monthmeta.js';
import { ensureAppTables } from './_lib/d1.js';
import { insertExpense, updateExpense, deleteExpense, getExpenseById } from './_lib/expense-store.js';
import { recalculateMonthlySummaryFrom } from './_lib/summary-store.js';

const SH_JH_ALIASES = new Set([
  '총무+구성원 A','총무+구성원 A 부담','총무 + 구성원 A','2인 공동',
  'SH+JH','SH + JH','JH+SH','JH + SH',
]);
const JH_CE_ALIASES = new Set(['JH+CE','JH + CE']);

function normalizeSplit(rawSplitType, amount) {
  let splitType = rawSplitType;
  let manager = 0;
  let memberA = 0;
  let memberB = 0;
  if (rawSplitType === '3인 공동') {
    splitType = '3인 공동'; manager = memberA = memberB = amount / 3;
  } else if (SH_JH_ALIASES.has(rawSplitType)) {
    splitType = rawSplitType === 'JH + SH' ? 'JH + SH' : 'SH + JH';
    manager = memberA = amount / 2;
  } else if (JH_CE_ALIASES.has(rawSplitType)) {
    splitType = 'JH + CE'; memberA = memberB = amount / 2;
  } else return null;
  return { splitType, manager, memberA, memberB };
}

function parseExpense(body) {
  const month = normalizeMonthValue(body.month);
  const category = String(body.category || '').trim();
  const subcategory = String(body.subcategory || '').trim();
  const description = String(body.description || '').trim();
  const amount = Number(String(body.amount ?? '').replace(/[^0-9]/g, ''));
  const rawSplitType = String(body.splitType || '').trim();
  if (!isSupportedMonth(month)) throw new Error('지출내역은 2025년 또는 2026년만 관리합니다.');
  if (!category) throw new Error('대분류를 선택해주세요.');
  if (!subcategory) throw new Error('소분류를 입력해주세요.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('금액을 1원 이상 입력해주세요.');
  const split = normalizeSplit(rawSplitType, amount);
  if (!split) throw new Error('지원하지 않는 분담방식입니다.');
  return { month, category, subcategory, description, amount, ...split };
}


async function saveRecurringFromExpense(env, item) {
  const db = await ensureAppTables(env);
  const count = await db.prepare('SELECT COUNT(*) AS c FROM recurring_expenses').first();
  if (Number(count?.c || 0) >= 50) {
    const err = new Error('반복지출은 최대 50개까지 저장할 수 있습니다.');
    err.status = 409;
    throw err;
  }

  const id = `rec-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const result = await db.prepare(`INSERT INTO recurring_expenses
    (id,name,category,subcategory,description,amount,split_type,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(id, item.subcategory, item.category, item.subcategory, item.description, Math.round(item.amount), item.splitType, now, now)
    .run();

  if (result?.success === false) throw new Error('반복지출 D1 저장에 실패했습니다.');

  const saved = await db.prepare(`SELECT id,name,category,subcategory,description,amount,split_type
    FROM recurring_expenses WHERE id=? LIMIT 1`).bind(id).first();
  if (!saved) throw new Error('반복지출 D1 저장 후 재조회에 실패했습니다.');

  return {
    id: String(saved.id || ''),
    name: String(saved.name || ''),
    category: String(saved.category || ''),
    subcategory: String(saved.subcategory || ''),
    description: String(saved.description || ''),
    amount: Number(saved.amount || 0),
    splitType: String(saved.split_type || ''),
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const recurringRaw = body.saveAsRecurring;
    const saveAsRecurring = recurringRaw === true || recurringRaw === 'true' || recurringRaw === 1 || recurringRaw === '1' || recurringRaw === 'on' || recurringRaw === 'yes';
    const item = parseExpense(body);
    await assertMonthOpen(env, item.month);

    const saved = await insertExpense(env, item);
    await recalculateMonthlySummaryFrom(env, item.month);
    let recurringTemplate = null;
    if (saveAsRecurring) recurringTemplate = await saveRecurringFromExpense(env, item);

    return json({
      ok: true,
      storage: 'd1',
      mode: 'inserted',
      sheetRow: saved.sheetRow,
      recurringSaved: Boolean(recurringTemplate),
      recurringTemplate,
      expense: {
        sheetRow: saved.sheetRow,
        month: saved.month,
        category: saved.category,
        subcategory: saved.subcategory,
        description: saved.description,
        amount: saved.amount,
        splitType: saved.splitType,
      },
    }, 201);
  } catch (err) {
    return bad(err?.message || 'expense save error', err?.status || 400);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const recurringRaw = body.saveAsRecurring;
    const saveAsRecurring = recurringRaw === true || recurringRaw === 'true' || recurringRaw === 1 || recurringRaw === '1' || recurringRaw === 'on' || recurringRaw === 'yes';
    const id = Number(body.sheetRow);
    if (!Number.isInteger(id) || id < 1) return bad('수정할 지출 정보가 올바르지 않습니다.');

    const current = await getExpenseById(env, id);
    if (!current) return bad('수정할 지출내역을 찾지 못했습니다.', 404);
    await assertMonthOpen(env, current.month);

    const item = parseExpense(body);
    if (item.month !== current.month) await assertMonthOpen(env, item.month);

    const saved = await updateExpense(env, id, item);
    if (!saved) return bad('수정할 지출내역을 찾지 못했습니다.', 404);
    const recalcMonth = current.month <= item.month ? current.month : item.month;
    await recalculateMonthlySummaryFrom(env, recalcMonth);

    let recurringTemplate = null;
    if (saveAsRecurring) recurringTemplate = await saveRecurringFromExpense(env, item);

    return json({
      ok: true,
      storage: 'd1',
      mode: 'updated',
      sheetRow: saved.sheetRow,
      recurringSaved: Boolean(recurringTemplate),
      recurringTemplate,
      expense: {
        sheetRow: saved.sheetRow,
        month: saved.month,
        category: saved.category,
        subcategory: saved.subcategory,
        description: saved.description,
        amount: saved.amount,
        splitType: saved.splitType,
      },
    });
  } catch (err) {
    return bad(err?.message || 'expense update error', err?.status || 400);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.sheetRow);
    if (!Number.isInteger(id) || id < 1) return bad('삭제할 지출 정보가 올바르지 않습니다.');

    const current = await getExpenseById(env, id);
    if (!current) return bad('삭제할 지출내역을 찾지 못했습니다.', 404);
    await assertMonthOpen(env, current.month);

    await deleteExpense(env, id);
    await recalculateMonthlySummaryFrom(env, current.month);
    return json({ ok: true, storage: 'd1', mode: 'deleted', sheetRow: id, month: current.month });
  } catch (err) {
    return bad(err?.message || 'expense delete error', err?.status || 500);
  }
}
