import { json, bad } from './_lib/http.js';
import { ensureAppTables } from './_lib/d1.js';

const SH_JH_ALIASES = new Set(['SH + JH','JH + SH']);
const VALID_SPLITS = new Set(['3인 공동','JH + CE',...SH_JH_ALIASES]);

function normalizeTemplate(item, index = 0) {
  const amount = Number(item?.amount || 0);
  return {
    id: String(item?.id || `rec-${index + 1}`),
    name: String(item?.name || ''),
    category: String(item?.category || ''),
    subcategory: String(item?.subcategory || ''),
    description: String(item?.description || ''),
    amount: Number.isFinite(amount) ? amount : 0,
    splitType: String(item?.splitType || item?.split_type || ''),
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
  return { name, category, subcategory, description, amount, splitType };
}

async function listTemplates(db) {
  const result = await db.prepare(`SELECT id,name,category,subcategory,description,amount,split_type
    FROM recurring_expenses ORDER BY created_at ASC, id ASC`).all();
  return (result.results || []).map(row => normalizeTemplate(row));
}

async function getDb(env) { return ensureAppTables(env); }

export async function onRequestGet({ env }) {
  try {
    const db = await getDb(env);
    return json({ ok: true, templates: await listTemplates(db), storage: 'cloudflare-d1' });
  } catch (err) {
    return bad(err?.message || 'recurring expense read error', err?.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const item = validate(await request.json());
    const db = await getDb(env);
    const count = await db.prepare('SELECT COUNT(*) AS c FROM recurring_expenses').first();
    if (Number(count?.c || 0) >= 50) return bad('반복지출은 최대 50개까지 저장할 수 있습니다.', 409);
    const id = `rec-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`;
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO recurring_expenses
      (id,name,category,subcategory,description,amount,split_type,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(id,item.name,item.category,item.subcategory,item.description,Math.round(item.amount),item.splitType,now,now).run();
    const templates = await listTemplates(db);
    return json({ ok: true, template: templates.find(t => t.id === id), templates }, 201);
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
    const db = await getDb(env);
    const existing = await db.prepare('SELECT id FROM recurring_expenses WHERE id=?').bind(id).first();
    if (!existing) return bad('수정할 반복지출을 찾지 못했습니다.', 404);
    await db.prepare(`UPDATE recurring_expenses SET name=?,category=?,subcategory=?,description=?,amount=?,split_type=?,updated_at=? WHERE id=?`)
      .bind(item.name,item.category,item.subcategory,item.description,Math.round(item.amount),item.splitType,new Date().toISOString(),id).run();
    const templates = await listTemplates(db);
    return json({ ok: true, template: templates.find(t => t.id === id), templates });
  } catch (err) {
    return bad(err?.message || 'recurring expense update error', err?.status || 400);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) return bad('반복지출 ID가 없습니다.');
    const db = await getDb(env);
    const existing = await db.prepare('SELECT id FROM recurring_expenses WHERE id=?').bind(id).first();
    if (!existing) return bad('삭제할 반복지출을 찾지 못했습니다.', 404);
    await db.prepare('DELETE FROM recurring_expenses WHERE id=?').bind(id).run();
    return json({ ok: true, id, templates: await listTemplates(db) });
  } catch (err) {
    return bad(err?.message || 'recurring expense delete error', err?.status || 500);
  }
}
