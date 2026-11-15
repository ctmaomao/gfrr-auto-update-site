import { appendFileSync, readFileSync } from 'node:fs';
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

// ADR-0109: green Macro budget pauses are not publications. Only authenticated
// GitHub run/attempt/job/step metadata can establish this no-op; summaries and
// uploaded artifacts are not trusted as deployment admission evidence.
export async function reviewMacroBudgetSkip({ repository, eventName, event, token,
  fetchImpl = fetch, timeoutMs = 6000 }) {
  const publish = reason => ({ shouldPublish: true, reason });
  if (eventName !== 'workflow_run' || event?.workflow_run?.name !== 'Macro Risk Editorial Refresh') return publish('not_macro_budget_skip');
  const validRun = run => run?.name === 'Macro Risk Editorial Refresh'
    && run?.path === '.github/workflows/macro-risk-editorial-refresh.yml'
    && run?.repository?.full_name === repository && run?.head_repository?.full_name === repository
    && run?.head_branch === 'main' && SHA.test(run?.head_sha ?? '')
    && run?.event === 'workflow_run' && run?.status === 'completed' && run?.conclusion === 'success'
    && Number.isSafeInteger(run?.id) && run.id > 0
    && Number.isSafeInteger(run?.workflow_id) && run.workflow_id > 0
    && Number.isSafeInteger(run?.run_attempt) && run.run_attempt > 0;
  const trigger = event?.workflow_run;
  if (repository !== 'ctmaomao/gfrr-auto-update-site' || !token || event?.action !== 'completed'
    || event?.repository?.full_name !== repository || !validRun(trigger)) return publish('macro_skip_unverified');
  try {
    const base = `https://api.github.com/repos/${repository}/actions/runs/${trigger.id}/attempts/${trigger.run_attempt}`;
    const run = await readJson(base, token, fetchImpl, timeoutMs);
    if (!validRun(run) || run.id !== trigger.id || run.run_attempt !== trigger.run_attempt
      || run.workflow_id !== trigger.workflow_id || run.head_sha !== trigger.head_sha) return publish('macro_skip_unverified');
    const data = await readJson(`${base}/jobs?per_page=100`, token, fetchImpl, timeoutMs);
    if (data?.total_count !== 1 || !Array.isArray(data.jobs) || data.jobs.length !== 1) return publish('macro_skip_unverified');
    const job = data.jobs[0];
    if (!Number.isSafeInteger(job?.id) || job.id <= 0 || job.name !== 'macro-risk-editorial-refresh' || job.run_id !== run.id || job.run_attempt !== run.run_attempt || job.head_sha !== run.head_sha
      || job.status !== 'completed' || job.conclusion !== 'success' || !Array.isArray(job.steps)) return publish('macro_skip_unverified');
    const matches = (name, conclusion) => {
      const steps = job.steps.filter(step => step.name === name);
      return steps.length === 1 && steps[0].status === 'completed' && steps[0].conclusion === conclusion;
    };
    const successfulSteps = ['Checkout repository', 'Sync latest main before refresh', 'Setup Node.js',
      'Install dependencies', 'Preflight editorial contracts', 'Confirm network and cost authorization',
      'Check shared CNY budget before discovery',
      'Verify uninitialized monthly budget skip stayed side-effect free',
      'Prepare safe editorial diagnostic receipt', 'Upload safe editorial diagnostic receipt'];
    const skippedSteps = ['Verify expected skip stayed side-effect free', 'Admit one refresh for current upstream data', 'Prepare transient artifact directory',
        'Collect near-7-day macro news', 'Build compact editorial evidence pack',
        'Run one DeepSeek editorial call', 'Review editorial quality', 'Project production layer',
        'Write production editorial layer', 'Validate final production data', 'Protected path assertion',
        'Commit refreshed macro editorial if changed'];
    // Exact success allowlist: a new/renamed action requires review here. Only
    // runner bookkeeping/post-cleanup names are extra; arbitrary successful
    // steps, duplicate names and mixed-attempt job evidence cannot prove no-op.
    const allowed = new Map([...successfulSteps.map(name => [name, 'success']),
      ...skippedSteps.map(name => [name, 'skipped']),
      ...['Set up job', 'Post Setup Node.js', 'Post Checkout repository', 'Complete job'].map(name => [name, 'success'])]);
    if (!successfulSteps.every(name => matches(name, 'success')) || !skippedSteps.every(name => matches(name, 'skipped'))
      || new Set(job.steps.map(step => step.name)).size !== job.steps.length
      || new Set(job.steps.map(step => step.number)).size !== job.steps.length
      || job.steps.some(step => !Number.isSafeInteger(step.number) || step.number <= 0 || step.status !== 'completed' || !allowed.has(step.name)
        || step.conclusion !== allowed.get(step.name))) return publish('macro_skip_unverified');
    return { shouldPublish: false, reason: 'macro_monthly_budget_uninitialized_no_publication' };
  } catch {
    // Missing/failed inspection preserves existing checked publication behavior.
    return publish('macro_skip_metadata_unavailable');
  }
}

async function main() {
  const upstreamOnly = process.argv.length === 3 && process.argv[2] === '--upstream-only';
  if (process.argv.length > 2 && !upstreamOnly) throw new Error('unsupported_publication_review_argument');
  let event;
  if (process.env.GITHUB_EVENT_NAME === 'workflow_run') {
    try { event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); } catch { /* Unknown is never skip proof. */ }
  }
  const upstream = await reviewMacroBudgetSkip({ repository: process.env.GITHUB_REPOSITORY,
    eventName: process.env.GITHUB_EVENT_NAME, event, token: process.env.GH_TOKEN });
  if (upstreamOnly || !upstream.shouldPublish) {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      `should_publish=${upstream.shouldPublish}\nshould_deploy=${upstream.shouldPublish}\n`);
    const message = `Upstream publication: ${upstream.shouldPublish ? 'continue' : 'skip'} (${upstream.reason}).`;
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
    console.log(message);
    return;
  }
  const decision = await reviewPagesDeployment({ repository: process.env.GITHUB_REPOSITORY,
    sourceSha: process.env.SOURCE_SHA, token: process.env.GH_TOKEN, force: process.env.FORCE_DEPLOY === 'true' });
  const message = `Pages publication: ${decision.shouldDeploy ? 'deploy' : 'reuse'} (${decision.reason}).`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `should_deploy=${decision.shouldDeploy}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  console.log(message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
