import { json, bad } from './_lib/http.js';
import { sheetsGet, sheetsUpdate, sheetsClear } from './_lib/google.js';
import { syncMonthlySettlement } from './_lib/settlement.js';
import { normalizeMonthValue, is2026Month } from './_lib/year2026.js';
import { assertMonthOpen } from './_lib/monthmeta.js';
import { ensureAppTables } from './_lib/d1.js';

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
  if (!is2026Month(month)) throw new Error('지출내역은 2026년 1월~12월만 관리합니다.');
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
    const data = await sheetsGet(env, ['지출내역!A3:A5000']);
    const rows = data.valueRanges?.[0]?.values || [];

    let lastUsedOffset = -1;
    for (let i = 0; i < rows.length; i += 1) if (String(rows[i]?.[0] ?? '').trim()) lastUsedOffset = i;
    const targetRow = 3 + lastUsedOffset + 1;
    await sheetsUpdate(env, `지출내역!A${targetRow}:I${targetRow}`, [[
      item.month, item.category, item.subcategory, item.description, item.amount,
      item.splitType, item.manager, item.memberA, item.memberB,
    ]], 'RAW');
    let recurringTemplate = null;
    if (saveAsRecurring) {
      recurringTemplate = await saveRecurringFromExpense(env, item);
    }

    context.waitUntil(syncMonthlySettlement(env).catch((err) => console.error('settlement background sync failed', err)));
    return json({ ok: true, mode: 'inserted', sheetRow: targetRow, recurringSaved: Boolean(recurringTemplate), recurringTemplate, expense: {
      sheetRow: targetRow, month: item.month, category: item.category, subcategory: item.subcategory,
      description: item.description, amount: item.amount, splitType: item.splitType,
    } }, 201);
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
    const sheetRow = Number(body.sheetRow);
    if (!Number.isInteger(sheetRow) || sheetRow < 3 || sheetRow > 5000) return bad('수정할 지출 행 정보가 올바르지 않습니다.');
    const item = parseExpense(body);
    const data = await sheetsGet(env, [`지출내역!A${sheetRow}:I${sheetRow}`]);
    const current = data.valueRanges?.[0]?.values?.[0] || [];
    const originalMonth = normalizeMonthValue(current?.[0]);
    if (!is2026Month(originalMonth)) return bad('수정할 지출내역을 찾지 못했습니다.', 404);
    await assertMonthOpen(env, originalMonth);
    if (item.month !== originalMonth) await assertMonthOpen(env, item.month);

    await sheetsUpdate(env, `지출내역!A${sheetRow}:I${sheetRow}`, [[
      item.month, item.category, item.subcategory, item.description, item.amount,
      item.splitType, item.manager, item.memberA, item.memberB,
    ]], 'RAW');

    let recurringTemplate = null;
    if (saveAsRecurring) {
      recurringTemplate = await saveRecurringFromExpense(env, item);
    }

    context.waitUntil(syncMonthlySettlement(env).catch((err) => console.error('settlement background sync failed', err)));
    return json({ ok: true, mode: 'updated', sheetRow, recurringSaved: Boolean(recurringTemplate), recurringTemplate, expense: {
      sheetRow, month: item.month, category: item.category, subcategory: item.subcategory,
      description: item.description, amount: item.amount, splitType: item.splitType,
    } });
  } catch (err) {
    return bad(err?.message || 'expense update error', err?.status || 400);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const sheetRow = Number(body.sheetRow);
    if (!Number.isInteger(sheetRow) || sheetRow < 3 || sheetRow > 5000) return bad('삭제할 지출 행 정보가 올바르지 않습니다.');
    const data = await sheetsGet(env, [`지출내역!A${sheetRow}:I${sheetRow}`]);
    const current = data.valueRanges?.[0]?.values?.[0] || [];
    const month = normalizeMonthValue(current?.[0]);
    if (!is2026Month(month)) return bad('삭제할 지출내역을 찾지 못했습니다.', 404);
    await assertMonthOpen(env, month);
    await sheetsClear(env, `지출내역!A${sheetRow}:I${sheetRow}`);
    context.waitUntil(syncMonthlySettlement(env).catch((err) => console.error('settlement background sync failed', err)));
    return json({ ok: true, mode: 'deleted', sheetRow, month });
  } catch (err) {
    return bad(err?.message || 'expense delete error', err?.status || 500);
  }
}
