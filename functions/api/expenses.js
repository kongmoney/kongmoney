import { json, bad } from './_lib/http.js';
import { sheetsAppend } from './_lib/google.js';

const SH_JH_ALIASES = new Set([
  '총무+구성원 A','총무+구성원 A 부담','총무 + 구성원 A','2인 공동','SH+JH','SH + JH','JH+SH','JH + SH',
]);
const JH_CE_ALIASES = new Set(['JH+CE','JH + CE']);

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const month = String(body.month || '');
    const category = String(body.category || '').trim();
    const subcategory = String(body.subcategory || '').trim();
    const description = String(body.description || '').trim();
    const amountText = String(body.amount ?? '').replace(/[^0-9]/g, '');
    const amount = Number(amountText);
    const rawSplitType = String(body.splitType || '').trim();

    if (!/^\d{4}-\d{2}$/.test(month)) return bad('month must be YYYY-MM');
    if (!category || !subcategory || !Number.isFinite(amount) || amount <= 0) return bad('invalid expense');

    let splitType = rawSplitType;
    let manager = 0;
    let memberA = 0;
    let memberB = 0;

    if (rawSplitType === '3인 공동') {
      splitType = '3인 공동';
      manager = memberA = memberB = amount / 3;
    } else if (SH_JH_ALIASES.has(rawSplitType)) {
      splitType = rawSplitType === 'JH + SH' ? 'JH + SH' : 'SH + JH';
      manager = memberA = amount / 2;
    } else if (JH_CE_ALIASES.has(rawSplitType)) {
      splitType = 'JH + CE';
      memberA = memberB = amount / 2;
    } else {
      return bad('unsupported split type');
    }

    await sheetsAppend(env, '지출내역!A:I', [[
      month, category, subcategory, description, amount, splitType,
      manager, memberA, memberB,
    ]]);

    return json({ ok: true, expense: { month, category, subcategory, description, amount, splitType } }, 201);
  } catch (err) {
    return bad(err?.message || 'expense append error', 500);
  }
}
