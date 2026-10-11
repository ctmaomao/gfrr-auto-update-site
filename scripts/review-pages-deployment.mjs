import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const WORKFLOW = '.github/workflows/deploy-static-site-to-pages.yml';
const SHA = /^[0-9a-f]{40}$/u;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/u;
const deploy = (reason) => ({ shouldDeploy: true, reason });

async function readJson(url, token, fetchImpl, timeoutMs) {
  const response = await fetchImpl(url, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (response.status !== 200 || !response.body) throw new Error('metadata_unavailable');
  const limit = 64 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw new Error('metadata_unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error('metadata_unavailable');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function runIdFromLogUrl(value, repository) {
  if (typeof value !== 'string') return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (![5, 7].includes(parts.length) || `${parts[0]}/${parts[1]}`.toLowerCase() !== repository.toLowerCase()
      || parts[2] !== 'actions' || parts[3] !== 'runs' || !/^[1-9]\d{0,15}$/u.test(parts[4])
      || (parts.length === 7 && (parts[5] !== 'job' || !/^[1-9]\d{0,15}$/u.test(parts[6])))) return null;
  return parts[4];
}

// This optimization never treats unknown metadata as proof of publication.
// Main remains fast-forward and Pages keeps one serial, checked latest-main stream.
export async function reviewPagesDeployment({ repository, sourceSha, token, force = false,
  fetchImpl = fetch, timeoutMs = 6000 }) {
  if (force) return deploy('manual_force');
  if (!REPOSITORY.test(repository ?? '') || !SHA.test(sourceSha ?? '') || !token) return deploy('metadata_unavailable');
  const base = `https://api.github.com/repos/${repository}`;
  try {
    const deployments = await readJson(`${base}/deployments?environment=github-pages&per_page=1`, token, fetchImpl, timeoutMs);
    const latest = Array.isArray(deployments) ? deployments[0] : null;
    if (!latest || latest.sha !== sourceSha || latest.ref !== 'main' || latest.environment !== 'github-pages'
        || latest.performed_via_github_app?.slug !== 'github-actions'
        || !Number.isSafeInteger(latest.id) || latest.id <= 0) return deploy('no_matching_deployment');
    const statuses = await readJson(`${base}/deployments/${latest.id}/statuses?per_page=1`, token, fetchImpl, timeoutMs);
    const status = Array.isArray(statuses) ? statuses[0] : null;
    if (status?.state !== 'success' || status.environment !== 'github-pages') return deploy('deployment_not_successful');
    const runId = runIdFromLogUrl(status.log_url, repository);
    if (!runId) return deploy('unverified_workflow');
    // Construct a fixed GitHub API URL; never fetch the supplied log URL.
    const run = await readJson(`${base}/actions/runs/${runId}`, token, fetchImpl, timeoutMs);
    if (run.repository?.full_name?.toLowerCase() !== repository.toLowerCase()
        || run.head_sha !== sourceSha || run.head_branch !== 'main' || run.path !== WORKFLOW
        || run.status !== 'completed' || run.conclusion !== 'success'
        || !['push', 'workflow_run', 'workflow_dispatch'].includes(run.event)) return deploy('unverified_workflow');
    return { shouldDeploy: false, reason: 'same_revision_already_published' };
  } catch {
    // Fixed diagnostic: no response body, raw exception, URL or token in logs.
    return deploy('metadata_unavailable');
  }
}

async function main() {
  const decision = await reviewPagesDeployment({ repository: process.env.GITHUB_REPOSITORY,
    sourceSha: process.env.SOURCE_SHA, token: process.env.GH_TOKEN, force: process.env.FORCE_DEPLOY === 'true' });
  const message = `Pages publication: ${decision.shouldDeploy ? 'deploy' : 'reuse'} (${decision.reason}).`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `should_deploy=${decision.shouldDeploy}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  console.log(message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
