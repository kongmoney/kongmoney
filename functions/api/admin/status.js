import { json, bad } from '../_lib/http.js';
import { requireAdmin, githubConfig, cloudflareConfig, githubFetch, cloudflareFetch } from '../_lib/admin.js';

export async function onRequestGet({ request, env }) {
  try {
    requireAdmin(request, env);
    const gh = githubConfig(env);
    const cf = cloudflareConfig(env);

    const commit = await githubFetch(env, `/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/commits/${encodeURIComponent(gh.branch)}`);
    const latestSha = commit.sha || '';

    let deployment = null;
    let cfError = null;
    if (cf.accountId && cf.token) {
      try {
        const list = await cloudflareFetch(env, `/accounts/${encodeURIComponent(cf.accountId)}/pages/projects/${encodeURIComponent(cf.project)}/deployments?env=production&page=1&per_page=10`);
        const rows = Array.isArray(list.result) ? list.result : [];
        deployment = rows.find((d) => d?.deployment_trigger?.metadata?.commit_hash === latestSha) || rows[0] || null;
      } catch (err) {
        cfError = err.message;
      }
    } else {
      cfError = 'CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN is not configured.';
    }

    const commitHash = deployment?.deployment_trigger?.metadata?.commit_hash || '';
    const depStatus = deployment?.latest_stage?.status || (deployment ? 'idle' : 'unknown');
    const dashboardUrl = deployment && cf.accountId
      ? `https://dash.cloudflare.com/?to=/${cf.accountId}/pages/view/${encodeURIComponent(cf.project)}/${deployment.id}`
      : `https://dash.cloudflare.com/`;

    return json({
      ok: true,
      checkedAt: new Date().toISOString(),
      github: {
        owner: gh.owner,
        repo: gh.repo,
        branch: gh.branch,
        sha: latestSha,
        shortSha: latestSha.slice(0, 7),
        message: commit?.commit?.message || '',
        date: commit?.commit?.author?.date || commit?.commit?.committer?.date || null,
        url: commit?.html_url || `https://github.com/${gh.owner}/${gh.repo}/commit/${latestSha}`,
      },
      cloudflare: deployment ? {
        project: cf.project,
        id: deployment.id,
        environment: deployment.environment,
        status: depStatus,
        stage: deployment?.latest_stage?.name || '',
        createdOn: deployment.created_on || null,
        modifiedOn: deployment.modified_on || null,
        commitHash,
        matchesLatestCommit: commitHash === latestSha,
        url: deployment.url || null,
        dashboardUrl,
      } : null,
      cloudflareError: cfError,
    });
  } catch (err) {
    return bad(err?.message || 'admin status error', err?.status || 500);
  }
}
