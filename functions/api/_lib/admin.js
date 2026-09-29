const GH_API = 'https://api.github.com';
const CF_API = 'https://api.cloudflare.com/client/v4';

export function requireAdmin(request, env) {
  const expected = String(env.ADMIN_KEY || '').trim();
  if (!expected) throw new Error('ADMIN_KEY is not configured.');
  const actual = String(request.headers.get('x-admin-key') || '').trim();
  if (!actual || actual !== expected) {
    const err = new Error('관리자 인증에 실패했습니다.');
    err.status = 401;
    throw err;
  }
}

export function githubConfig(env) {
  return {
    owner: String(env.GITHUB_OWNER || 'rjs1127').trim(),
    repo: String(env.GITHUB_REPO || 'kongmoney').trim(),
    branch: String(env.GITHUB_BRANCH || 'main').trim(),
    token: String(env.GITHUB_TOKEN || '').trim(),
  };
}

export function cloudflareConfig(env) {
  return {
    accountId: String(env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
    project: String(env.CLOUDFLARE_PROJECT_NAME || 'kongmoney').trim(),
    token: String(env.CLOUDFLARE_API_TOKEN || '').trim(),
  };
}

export async function githubFetch(env, path, init = {}) {
  const cfg = githubConfig(env);
  if (!cfg.token) throw new Error('GITHUB_TOKEN is not configured.');
  const headers = new Headers(init.headers || {});
  headers.set('accept', 'application/vnd.github+json');
  headers.set('authorization', `Bearer ${cfg.token}`);
  headers.set('x-github-api-version', '2026-03-10');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${GH_API}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 800)}`);
  }
  return res.json();
}

export async function cloudflareFetch(env, path, init = {}) {
  const cfg = cloudflareConfig(env);
  if (!cfg.accountId || !cfg.token) throw new Error('Cloudflare API settings are incomplete.');
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${cfg.token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${CF_API}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(`Cloudflare API ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 800)}`);
  }
  return body;
}

export function bytesToBase64(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function base64ToText(base64) {
  return new TextDecoder().decode(base64ToBytes(base64));
}

export function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function kstStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} KST`;
}

export function mergeReadmeHistory(baseReadme, existingReadme) {
  const marker = '<!-- AUTO_DEPLOY_HISTORY -->';
  const extract = (text) => {
    const src = String(text || '');
    const i = src.indexOf(marker);
    if (i < 0) return '';
    const after = src.slice(i + marker.length);
    const nextHeading = after.search(/\n##\s+/);
    return (nextHeading >= 0 ? after.slice(0, nextHeading) : after).trim();
  };
  const strip = (text) => {
    const src = String(text || '').trimEnd();
    const i = src.indexOf(marker);
    if (i < 0) return src;
    const headingStart = src.lastIndexOf('\n## ', i);
    const start = headingStart >= 0 ? headingStart : i;
    const after = src.slice(i + marker.length);
    const nextHeadingRel = after.search(/\n##\s+/);
    if (nextHeadingRel < 0) return src.slice(0, start).trimEnd();
    const nextStart = i + marker.length + nextHeadingRel;
    return (src.slice(0, start).trimEnd() + '\n\n' + src.slice(nextStart + 1).trimStart()).trimEnd();
  };
  const history = extract(existingReadme);
  let merged = strip(baseReadme);
  merged += `\n\n## 배포/커밋 내역\n${marker}`;
  if (history) merged += `\n${history}`;
  return merged + '\n';
}

export function updateReadmeHistory(readme, { message, fileCount, stamp }) {
  const marker = '<!-- AUTO_DEPLOY_HISTORY -->';
  const cleanMessage = String(message || '').replace(/\s+/g, ' ').trim();
  const line = `- ${stamp} — ${cleanMessage} — ${fileCount}개 파일 업로드`;
  let text = String(readme || '').trimEnd();
  if (!text.includes(marker)) {
    text += `\n\n## 배포/커밋 내역\n${marker}\n`;
  }
  return text.replace(marker, `${marker}\n${line}`) + '\n';
}
