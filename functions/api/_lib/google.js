const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlText(text) {
  return b64url(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function getServiceAccountEmail(env) {
  // Current kongmoney secret name is GOOGLE_CLIENT_EMAIL.
  // GOOGLE_SERVICE_ACCOUNT_EMAIL is retained as a backwards-compatible alias.
  return env.GOOGLE_CLIENT_EMAIL || env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
}

async function readError(res) {
  try {
    const body = await res.text();
    return body ? `: ${body.slice(0, 500)}` : '';
  } catch {
    return '';
  }
}

export async function getAccessToken(env) {
  const clientEmail = getServiceAccountEmail(env);
  if (!clientEmail || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google credentials are not configured. Check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlText(JSON.stringify({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));

  const unsigned = `${header}.${claims}`;
  const normalizedKey = String(env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, '\n').trim();
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(normalizedKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );

  const assertion = `${unsigned}.${b64url(sig)}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Google token error ${res.status}${await readError(res)}`);
  }

  const json = await res.json();
  if (!json.access_token) throw new Error('Google token response did not include access_token.');
  return json.access_token;
}

export async function sheetsGet(env, ranges) {
  if (!env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getAccessToken(env);
  const qs = new URLSearchParams();
  for (const range of ranges) qs.append('ranges', range);
  qs.set('majorDimension', 'ROWS');
  qs.set('valueRenderOption', 'UNFORMATTED_VALUE');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values:batchGet?${qs}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets read error ${res.status}${await readError(res)}`);
  return res.json();
}

export async function sheetsAppend(env, range, values, valueInputOption = 'USER_ENTERED') {
  if (!env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=${encodeURIComponent(valueInputOption)}&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ majorDimension: 'ROWS', values }),
  });
  if (!res.ok) throw new Error(`Sheets append error ${res.status}${await readError(res)}`);
  return res.json();
}


export async function sheetsUpdate(env, range, values, valueInputOption = 'USER_ENTERED') {
  if (!env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=${encodeURIComponent(valueInputOption)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ majorDimension: 'ROWS', values }),
  });
  if (!res.ok) throw new Error(`Sheets update error ${res.status}${await readError(res)}`);
  return res.json();
}


export async function sheetsClear(env, range) {
  if (!env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token = await getAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}:clear`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Sheets clear error ${res.status}${await readError(res)}`);
  return res.json();
}
