import { json, bad } from './_lib/http.js';
import { ensureAppTables } from './_lib/d1.js';

export async function onRequestGet({ env }) {
  try {
    const db = await ensureAppTables(env);
    const recurring = await db.prepare('SELECT COUNT(*) AS c FROM recurring_expenses').first();
    const meta = await db.prepare('SELECT COUNT(*) AS c FROM month_meta').first();
    const expenses = await db.prepare('SELECT COUNT(*) AS c FROM expenses').first();
    const sync = await db.prepare("SELECT value,updated_at FROM app_state WHERE key='expenses_sheet_sync' LIMIT 1").first();
    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('recurring_expenses','month_meta','expenses','app_state') ORDER BY name").all();
    return json({
      ok: true,
      binding: 'DB',
      storage: 'cloudflare-d1',
      tables: (tables.results || []).map(r => r.name),
      recurringCount: Number(recurring?.c || 0),
      monthMetaCount: Number(meta?.c || 0),
      expensesCount: Number(expenses?.c || 0),
      lastSheetSync: sync ? { value: String(sync.value || ''), updatedAt: String(sync.updated_at || '') } : null,
    });
  } catch (err) {
    return bad(err?.message || 'D1 status error', err?.status || 500);
  }
}
