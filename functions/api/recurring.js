import { json, bad } from './_lib/http.js';
import { sheetsGet, sheetsUpdate, sheetsClear } from './_lib/google.js';

const SH_JH_ALIASES = new Set(['SH + JH','JH + SH']);
const VALID_SPLITS = new Set(['3인 공동','JH + CE',...SH_JH_ALIASES]);

function normalizeTemplate(row, sheetRow) {
  const amount = Number(row?.[5] || 0);
  return {
    sheetRow,
    id: String(row?.[0] || `rec-${sheetRow}`),
    name: String(row?.[1] || ''),
    category: String(row?.[2] || ''),
    subcategory: String(row?.[3] || ''),
    description: String(row?.[4] || ''),
    amount: Number.isFinite(amount) ? amount : 0,
    splitType: String(row?.[6] || ''),
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

export async function onRequestGet({ env }) {
  try {
    const data = await sheetsGet(env, ['SETTINGS!D3:J52']);
    const rows = data.valueRanges?.[0]?.values || [];
    const templates = rows.map((row, i) => normalizeTemplate(row, i + 3)).filter(t => t.name && t.category && t.amount > 0);
    return json({ ok: true, templates });
  } catch (err) {
    return bad(err?.message || 'recurring expense read error', 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const item = validate(await request.json());
    const data = await sheetsGet(env, ['SETTINGS!D3:D52']);
    const rows = data.valueRanges?.[0]?.values || [];
    let targetRow = 3;
    for (let i = 0; i < 50; i += 1) {
      if (!String(rows[i]?.[0] || '').trim()) { targetRow = i + 3; break; }
      if (i === 49) return bad('반복지출 저장 공간이 가득 찼습니다.', 409);
    }
    const id = `rec-${Date.now().toString(36)}`;
    await sheetsUpdate(env, `SETTINGS!D${targetRow}:J${targetRow}`, [[id, item.name, item.category, item.subcategory, item.description, item.amount, item.splitType]], 'RAW');
    return json({ ok: true, template: { ...item, id, sheetRow: targetRow } }, 201);
  } catch (err) {
    return bad(err?.message || 'recurring expense save error', 400);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const sheetRow = Number(body.sheetRow);
    if (!Number.isInteger(sheetRow) || sheetRow < 3 || sheetRow > 52) return bad('반복지출 행 정보가 올바르지 않습니다.');
    const item = validate(body);
    const id = String(body.id || `rec-${sheetRow}`);
    await sheetsUpdate(env, `SETTINGS!D${sheetRow}:J${sheetRow}`, [[id, item.name, item.category, item.subcategory, item.description, item.amount, item.splitType]], 'RAW');
    return json({ ok: true, template: { ...item, id, sheetRow } });
  } catch (err) {
    return bad(err?.message || 'recurring expense update error', 400);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const sheetRow = Number(body.sheetRow);
    if (!Number.isInteger(sheetRow) || sheetRow < 3 || sheetRow > 52) return bad('반복지출 행 정보가 올바르지 않습니다.');
    await sheetsClear(env, `SETTINGS!D${sheetRow}:J${sheetRow}`);
    return json({ ok: true, sheetRow });
  } catch (err) {
    return bad(err?.message || 'recurring expense delete error', 500);
  }
}
