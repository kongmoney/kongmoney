import { json } from './_lib/http.js';
import { getAccessToken, sheetsGet } from './_lib/google.js';
import { ensureAppTables } from './_lib/d1.js';

export async function onRequestGet({ env }) {
  const clientEmailConfigured = Boolean(env.GOOGLE_CLIENT_EMAIL || env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKeyConfigured = Boolean(env.GOOGLE_PRIVATE_KEY);
  const sheetIdConfigured = Boolean(env.GOOGLE_SHEET_ID);

  const result = {
    version: 'kongmoney-google-v2',
    ok: false,
    configured: {
      googleSheetId: sheetIdConfigured,
      googleClientEmail: clientEmailConfigured,
      googlePrivateKey: privateKeyConfigured,
    },
    token: false,
    sheetRead: false,
    d1: false,
  };

  if (!sheetIdConfigured || !clientEmailConfigured || !privateKeyConfigured) {
    result.error = 'Cloudflare secrets are incomplete.';
    return json(result, 500);
  }

  try {
    await getAccessToken(env);
    result.token = true;
    await sheetsGet(env, ['월정산!A1:A3']);
    result.sheetRead = true;
    await ensureAppTables(env);
    result.d1 = true;
    result.ok = true;
    return json(result);
  } catch (err) {
    result.error = err?.message || 'Google connection test failed.';
    return json(result, 500);
  }
}
