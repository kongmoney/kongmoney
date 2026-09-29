import { json, bad } from './_lib/http.js';
import { ensureAppTables } from './_lib/d1.js';

const SH_JH_ALIASES = new Set(['SH + JH','JH + SH']);
const VALID_SPLITS = new Set(['3인 공동','JH + CE',...SH_JH_ALIASES]);

function normalizeTemplate(row) {
  const amount = Number(row?.amount || 0);
  return {
    id: String(row?.id || ''),
    name: String(row?.name || ''),
    category: String(row?.category || ''),
    subcategory: String(row?.subcategory || ''),
    description: String(row?.description || ''),
    amount: Number.isFinite(amount) ? amount : 0,
    splitType: String(row?.split_type || row?.splitType || ''),
  };
}

function validate(body) {
  const name = String(body.name || body.subcategory || '').trim();
  const category = String(body.category || '').trim();
  const subcategory = String(body.subcategory || '').trim();
  const description = String(body.description || '').trim();
  const amount = Number(String(body.amount ?? '').replace(/[^0-9]/g, ''));
  const splitType = String(body.splitType || '').trim();
  if (!name) throw new Error('반복지출 이름을 입력해주세요.');
  if (!['생활비','기타/부속'].includes(category)) throw new Error('대분류를 선택해주세요.');
  if (!subcategory) throw new Error('소분류를 입력해주세요.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('금액을 1원 이상 입력해주세요.');
  if (!VALID_SPLITS.has(splitType)) throw new Error('분담방식을 확인해주세요.');
  return { name, category, subcategory, description, amount: Math.round(amount), splitType };
}

async function listTemplates(db) {
  const result = await db.prepare(`SELECT id,name,category,subcategory,description,amount,split_type
    FROM recurring_expenses ORDER BY created_at ASC, id ASC`).all();
  return (result.results || []).map(normalizeTemplate);
}

export async function onRequestGet({ env }) {
  try {
    const db = await ensureAppTables(env);
    const templates = await listTemplates(db);
    return json({ ok: true, storage: 'cloudflare-d1', count: templates.length, templates });
  } catch (err) {
    return bad(err?.message || 'recurring expense read error', err?.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const item = validate(await request.json());
    const db = await ensureAppTables(env);
    const count = await db.prepare('SELECT COUNT(*) AS c FROM recurring_expenses').first();
    if (Number(count?.c || 0) >= 50) return bad('반복지출은 최대 50개까지 저장할 수 있습니다.', 409);

    const id = `rec-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const result = await db.prepare(`INSERT INTO recurring_expenses
      (id,name,category,subcategory,description,amount,split_type,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(id,item.name,item.category,item.subcategory,item.description,item.amount,item.splitType,now,now).run();

    if (result?.success === false) throw new Error('D1 INSERT가 성공하지 못했습니다.');

    // 실제 D1에 저장되었는지 즉시 다시 확인한다.
    const savedRow = await db.prepare(`SELECT id,name,category,subcategory,description,amount,split_type
      FROM recurring_expenses WHERE id = ? LIMIT 1`).bind(id).first();
    if (!savedRow) throw new Error('D1 저장 후 재조회에서 반복지출을 찾지 못했습니다.');

    const templates = await listTemplates(db);
    return json({ ok: true, storage: 'cloudflare-d1', verified: true, template: normalizeTemplate(savedRow), templates }, 201);
  } catch (err) {
    return bad(err?.message || 'recurring expense save error', err?.status || 400);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) return bad('반복지출 ID가 없습니다.');
    const item = validate(body);
    const db = await ensureAppTables(env);
    const existing = await db.prepare('SELECT id FROM recurring_expenses WHERE id=? LIMIT 1').bind(id).first();
    if (!existing) return bad('수정할 반복지출을 찾지 못했습니다.', 404);

    await db.prepare(`UPDATE recurring_expenses
      SET name=?,category=?,subcategory=?,description=?,amount=?,split_type=?,updated_at=? WHERE id=?`)
      .bind(item.name,item.category,item.subcategory,item.description,item.amount,item.splitType,new Date().toISOString(),id).run();

    const savedRow = await db.prepare(`SELECT id,name,category,subcategory,description,amount,split_type
      FROM recurring_expenses WHERE id=? LIMIT 1`).bind(id).first();
    if (!savedRow) throw new Error('D1 수정 후 재조회에 실패했습니다.');

    return json({ ok: true, verified: true, template: normalizeTemplate(savedRow), templates: await listTemplates(db) });
  } catch (err) {
    return bad(err?.message || 'recurring expense update error', err?.status || 400);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) return bad('반복지출 ID가 없습니다.');
    const db = await ensureAppTables(env);
    const existing = await db.prepare('SELECT id FROM recurring_expenses WHERE id=? LIMIT 1').bind(id).first();
    if (!existing) return bad('삭제할 반복지출을 찾지 못했습니다.', 404);
    await db.prepare('DELETE FROM recurring_expenses WHERE id=?').bind(id).run();
    const check = await db.prepare('SELECT id FROM recurring_expenses WHERE id=? LIMIT 1').bind(id).first();
    if (check) throw new Error('D1 삭제 후에도 데이터가 남아 있습니다.');
    return json({ ok: true, verified: true, id, templates: await listTemplates(db) });
  } catch (err) {
    return bad(err?.message || 'recurring expense delete error', err?.status || 500);
  }
}
