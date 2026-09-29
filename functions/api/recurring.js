import { json, bad } from './_lib/http.js';
import { sheetsGet, sheetsUpdate, sheetsEnsureSheet } from './_lib/google.js';

const APP_SHEET = 'APP_DATA';
const STORAGE_RANGE = `${APP_SHEET}!A1:B1`;
const LEGACY_RANGE = 'SETTINGS!C3:D3';
const STORAGE_KEY = 'APP_RECURRING';
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
    splitType: String(item?.splitType || ''),
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

function parseStorageRow(row) {
  if (String(row?.[0] || '').trim() !== STORAGE_KEY) return [];
  const raw = String(row?.[1] || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(normalizeTemplate).filter(t => t.name && t.category && t.subcategory && t.amount > 0)
      : [];
  } catch {
    return [];
  }
}

async function ensureStorage(env) {
  await sheetsEnsureSheet(env, APP_SHEET, { hidden: true, rowCount: 20, columnCount: 4 });
}

async function readTemplates(env) {
  await ensureStorage(env);
  const data = await sheetsGet(env, [STORAGE_RANGE, LEGACY_RANGE]);
  const appRow = data.valueRanges?.[0]?.values?.[0] || [];
  const current = parseStorageRow(appRow);
  if (current.length || String(appRow?.[0] || '').trim() === STORAGE_KEY) return current;

  // One-time migration from v5.4.1/v5.4.2 storage if it exists.
  const legacyRow = data.valueRanges?.[1]?.values?.[0] || [];
  const legacy = parseStorageRow(legacyRow);
  if (legacy.length) {
    await writeTemplates(env, legacy);
    return legacy;
  }
  return [];
}

async function writeTemplates(env, templates) {
  await ensureStorage(env);
  const clean = templates.map(normalizeTemplate).filter(t => t.name && t.category && t.subcategory && t.amount > 0);
  await sheetsUpdate(env, STORAGE_RANGE, [[STORAGE_KEY, JSON.stringify(clean)]], 'RAW');

  // Read-after-write verification: do not tell the UI that saving succeeded unless Google returns the data.
  const verify = await sheetsGet(env, [STORAGE_RANGE]);
  const stored = parseStorageRow(verify.valueRanges?.[0]?.values?.[0] || []);
  if (stored.length !== clean.length) {
    throw new Error('반복지출 저장 검증에 실패했습니다. Google Sheet 저장값을 확인해주세요.');
  }
  return stored;
}

export async function onRequestGet({ env }) {
  try {
    const templates = await readTemplates(env);
    return json({ ok: true, templates, storage: APP_SHEET });
  } catch (err) {
    return bad(err?.message || 'recurring expense read error', 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const item = validate(await request.json());
    const templates = await readTemplates(env);
    if (templates.length >= 30) return bad('반복지출은 최대 30개까지 저장할 수 있습니다.', 409);
    const template = { ...item, id: `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}` };
    const stored = await writeTemplates(env, [...templates, template]);
    const saved = stored.find(t => t.id === template.id);
    if (!saved) throw new Error('반복지출을 저장했지만 다시 읽지 못했습니다.');
    return json({ ok: true, template: saved, templates: stored }, 201);
  } catch (err) {
    return bad(err?.message || 'recurring expense save error', 400);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) return bad('반복지출 ID가 없습니다.');
    const item = validate(body);
    const templates = await readTemplates(env);
    const index = templates.findIndex(t => t.id === id);
    if (index < 0) return bad('수정할 반복지출을 찾지 못했습니다.', 404);
    const template = { ...item, id };
    templates[index] = template;
    const stored = await writeTemplates(env, templates);
    return json({ ok: true, template: stored.find(t => t.id === id) || template, templates: stored });
  } catch (err) {
    return bad(err?.message || 'recurring expense update error', err?.status || 400);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) return bad('반복지출 ID가 없습니다.');
    const templates = await readTemplates(env);
    const next = templates.filter(t => t.id !== id);
    if (next.length === templates.length) return bad('삭제할 반복지출을 찾지 못했습니다.', 404);
    const stored = await writeTemplates(env, next);
    return json({ ok: true, id, templates: stored });
  } catch (err) {
    return bad(err?.message || 'recurring expense delete error', 500);
  }
}
