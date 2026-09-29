import { json, bad } from './_lib/http.js';
import { sheetsGet, sheetsUpdate, sheetsClear } from './_lib/google.js';
import { syncMonthlySettlement } from './_lib/settlement.js';

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
    splitType = '3인 공동';
    manager = memberA = memberB = amount / 3;
  } else if (SH_JH_ALIASES.has(rawSplitType)) {
    // 화면에서 선택한 순서는 그대로 보존하되 실제 부담은 SH/JH 반반.
    splitType = rawSplitType === 'JH + SH' ? 'JH + SH' : 'SH + JH';
    manager = memberA = amount / 2;
  } else if (JH_CE_ALIASES.has(rawSplitType)) {
    splitType = 'JH + CE';
    memberA = memberB = amount / 2;
  } else {
    return null;
  }

  return { splitType, manager, memberA, memberB };
}

async function findNextExpenseRow(env) {
  // append 대신 실제 A열을 읽어 첫 빈 행을 찾아 정확한 위치에 기록한다.
  // 변환된 XLSX/Google Sheet의 표 범위가 길게 잡혀 있어도 안정적으로 동작한다.
  const data = await sheetsGet(env, ['지출내역!A3:A5000']);
  const rows = data.valueRanges?.[0]?.values || [];

  let lastUsedOffset = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const value = String(rows[i]?.[0] ?? '').trim();
    if (value) lastUsedOffset = i;
  }
  return 3 + lastUsedOffset + 1;
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const month = String(body.month || '').trim();
    const category = String(body.category || '').trim();
    const subcategory = String(body.subcategory || '').trim();
    const description = String(body.description || '').trim();
    const amountText = String(body.amount ?? '').replace(/[^0-9]/g, '');
    const amount = Number(amountText);
    const rawSplitType = String(body.splitType || '').trim();

    if (!/^\d{4}-\d{2}$/.test(month)) return bad('month must be YYYY-MM');
    const monthNo = Number(month.slice(5, 7));
    if (monthNo < 1 || monthNo > 12) return bad('invalid month');
    if (!category) return bad('대분류를 선택해주세요.');
    if (!subcategory) return bad('소분류를 입력해주세요.');
    if (!Number.isFinite(amount) || amount <= 0) return bad('금액을 1원 이상 입력해주세요.');

    const split = normalizeSplit(rawSplitType, amount);
    if (!split) return bad('지원하지 않는 분담방식입니다.');

    const targetRow = await findNextExpenseRow(env);
    await sheetsUpdate(env, `지출내역!A${targetRow}:I${targetRow}`, [[
      month,
      category,
      subcategory,
      description,
      amount,
      split.splitType,
      split.manager,
      split.memberA,
      split.memberB,
    ]], 'RAW');

    await syncMonthlySettlement(env);

    return json({
      ok: true,
      mode: 'inserted',
      sheetRow: targetRow,
      expense: {
        month, category, subcategory, description, amount,
        splitType: split.splitType,
      },
    }, 201);
  } catch (err) {
    return bad(err?.message || 'expense save error', 500);
  }
}


export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const sheetRow = Number(body.sheetRow);
    if (!Number.isInteger(sheetRow) || sheetRow < 3 || sheetRow > 5000) {
      return bad('삭제할 지출 행 정보가 올바르지 않습니다.');
    }

    // 지출 데이터 열(A:I)만 비워 시트의 다른 서식/구조는 유지한다.
    await sheetsClear(env, `지출내역!A${sheetRow}:I${sheetRow}`);
    await syncMonthlySettlement(env);
    return json({ ok: true, mode: 'deleted', sheetRow });
  } catch (err) {
    return bad(err?.message || 'expense delete error', 500);
  }
}
