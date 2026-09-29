import { json, bad } from './_lib/http.js';
import { sheetsClear, sheetsUpdate } from './_lib/google.js';
import { listExpenses, getLastSheetSync, setLastSheetSync } from './_lib/expense-store.js';
import { syncMonthlySettlement } from './_lib/settlement.js';

export async function onRequestGet({ env }) {
  try {
    const lastSync = await getLastSheetSync(env);
    return json({ ok: true, lastSync });
  } catch (err) {
    return bad(err?.message || '시트 동기화 상태 조회 실패', err?.status || 500);
  }
}

export async function onRequestPost({ env }) {
  try {
    const expenses = await listExpenses(env);
    const rows = expenses.map((item) => [
      item.month,
      item.category,
      item.subcategory,
      item.description,
      item.amount,
      item.splitType,
      item.manager,
      item.memberA,
      item.memberB,
    ]);

    await sheetsClear(env, '지출내역!A3:I5000');
    if (rows.length) {
      await sheetsUpdate(env, `지출내역!A3:I${rows.length + 2}`, rows, 'RAW');
    }

    const settlement = await syncMonthlySettlement(env);
    const lastSync = await setLastSheetSync(env, `expenses:${rows.length}`);

    return json({
      ok: true,
      syncedExpenses: rows.length,
      settlementUpdated: Number(settlement?.updated || 0),
      lastSync,
    });
  } catch (err) {
    return bad(err?.message || 'Google Sheet 동기화 실패', err?.status || 500);
  }
}
