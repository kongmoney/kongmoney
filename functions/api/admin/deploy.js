import { json, bad } from '../_lib/http.js';
import {
  requireAdmin, githubConfig, githubFetch, base64ToText, textToBase64,
  updateReadmeHistory, mergeReadmeHistory, kstStamp,
} from '../_lib/admin.js';

function safePath(path) {
  const p = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!p || p.includes('../') || p === '..' || p.startsWith('.git/') || p === '.git') return '';
  return p;
}

async function getExistingReadme(env, cfg) {
  try {
    const row = await githubFetch(env, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/README.md?ref=${encodeURIComponent(cfg.branch)}`);
    if (row?.content) return base64ToText(String(row.content).replace(/\s/g, ''));
  } catch {}
  return '# kongmoney\n';
}

async function createBlob(env, cfg, file) {
  const blob = await githubFetch(env, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: file.contentBase64, encoding: 'base64' }),
  });
  return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
}

export async function onRequestPost({ request, env }) {
  try {
    requireAdmin(request, env);
    const cfg = githubConfig(env);
    const body = await request.json();
    const message = String(body.message || '').trim();
    const supplied = Array.isArray(body.files) ? body.files : [];
    if (!message) return bad('커밋 메시지를 입력해주세요.');
    if (!supplied.length) return bad('업로드할 파일이 없습니다.');
    if (supplied.length > 500) return bad('한 번에 업로드할 수 있는 파일 수를 초과했습니다.');

    const fileMap = new Map();
    let totalBytes = 0;
    for (const f of supplied) {
      const path = safePath(f.path);
      const contentBase64 = String(f.contentBase64 || '');
      const size = Number(f.size || 0);
      if (!path || !contentBase64) continue;
      totalBytes += Math.max(0, size);
      fileMap.set(path, { path, contentBase64, size });
    }
    if (!fileMap.size) return bad('유효한 파일이 없습니다.');
    if (totalBytes > 30 * 1024 * 1024) return bad('압축 해제 후 파일 크기가 너무 큽니다. 30MB 이하의 소스 ZIP을 사용해주세요.');

    const ref = await githubFetch(env, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
    const parentSha = ref?.object?.sha;
    if (!parentSha) throw new Error('현재 GitHub branch SHA를 확인하지 못했습니다.');
    const parentCommit = await githubFetch(env, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/commits/${parentSha}`);
    const baseTree = parentCommit?.tree?.sha;
    if (!baseTree) throw new Error('현재 Git tree를 확인하지 못했습니다.');

    const existingReadme = await getExistingReadme(env, cfg);
    const uploadedReadme = fileMap.has('README.md')
      ? base64ToText(fileMap.get('README.md').contentBase64)
      : existingReadme;
    let readme = mergeReadmeHistory(uploadedReadme, existingReadme);
    readme = updateReadmeHistory(readme, { message, fileCount: fileMap.size, stamp: kstStamp() });
    fileMap.set('README.md', {
      path: 'README.md',
      contentBase64: textToBase64(readme),
      size: new TextEncoder().encode(readme).length,
    });

    const files = [...fileMap.values()];
    const treeEntries = [];
    const concurrency = 6;
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const rows = await Promise.all(batch.map((f) => createBlob(env, cfg, f)));
      treeEntries.push(...rows);
    }

    const tree = await githubFetch(env, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
    });

    const commit = await githubFetch(env, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
    });

    await githubFetch(env, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return json({
      ok: true,
      commit: {
        sha: commit.sha,
        shortSha: commit.sha.slice(0, 7),
        url: `https://github.com/${cfg.owner}/${cfg.repo}/commit/${commit.sha}`,
        message,
      },
      files: files.length,
      note: 'ZIP에 포함되지 않은 기존 GitHub 파일은 삭제하지 않고 유지합니다.',
    }, 201);
  } catch (err) {
    return bad(err?.message || 'admin deploy error', err?.status || 500);
  }
}
