import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = 'ctmaomao/gfrr-auto-update-site';
const WORKFLOW = 'refresh-bubble-watch.yml';
const PATH = 'data/bubble-watch.json';
const API = `https://api.github.com/repos/${REPO}`;
const SITES = {
  'GitHub Pages': `https://ctmaomao.github.io/gfrr-auto-update-site/${PATH}`,
  EdgeOne: `https://radar.gfrfinradar.uk/${PATH}`
};
const DAY_MS = 86_400_000;
const SHA = /^[a-f0-9]{40}$/u;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ? Date.parse(value) : NaN;

export function observationWindow(now) {
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  const monday = midnight.getTime() - ((midnight.getUTCDay() + 6) % 7) * DAY_MS;
  return {
    monday: new Date(monday).toISOString().slice(0, 10),
    start: monday + 15 * 60_000,
    deadline: monday + 270 * 60_000,
    end: monday + 7 * DAY_MS
  };
}

export function selectScheduledRun(data, window, now) {
  if (!Array.isArray(data?.workflow_runs) || !Number.isInteger(data.total_count) ||
      data.total_count !== data.workflow_runs.length) throw new Error('run list incomplete');
  const runs = data.workflow_runs.filter(run => run.event === 'schedule' && run.head_branch === 'main' &&
    Number.isSafeInteger(run.id) && run.id > 0 && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 &&
    date(run.created_at) >= window.start && date(run.created_at) <= now && date(run.created_at) < window.end);
  return { run: runs.length === 1 ? runs[0] : null, count: runs.length };
}

const CHECKS = ['Check Bubble payload', 'Check GDELT cache health'];
export function refreshStage(run, jobs, hasCommit) {
  if (!run) return 'not_observed';
  if (hasCommit) return 'committed';
  const job = jobs?.find(j => j.name === 'refresh');
  if (!job) {
    if (run.status === 'completed') return 'refresh_job_not_seen';
    return run.status === 'in_progress' ? 'awaiting_refresh_job' : 'queued_or_waiting';
  }
  if (['queued', 'waiting', 'pending', 'requested'].includes(job.status)) return 'queued_or_waiting';
  if (job.status === 'completed') return job.conclusion === 'success' ? 'finished_without_commit' : 'job_failed';
  const steps = job.steps || [];
  const commit = steps.find(step => step.name === 'Commit');
  if (commit?.status === 'in_progress') return 'aggregate_check_or_commit';
  if (steps.some(step => CHECKS.includes(step.name) && step.status === 'in_progress')) return 'checking';
  return 'running';
}

function identity(data) {
  const generatedAt = data?.generated_at;
  const asOf = data?.as_of_date;
  return Number.isFinite(date(generatedAt)) &&
    typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(asOf)
    ? { generatedAt, asOf } : null;
}

export function siteAdoption(source, served) {
  const id = identity(served);
  if (!id) return 'unverified';
  if (source.generatedAt === id.generatedAt && source.asOf === id.asOf) return 'adopted';
  return date(id.generatedAt) > date(source.generatedAt) ? 'different_newer_generation' : 'stale_or_mismatched';
}

const git = args => execFileSync('git', args, { encoding: 'utf8', timeout: 20_000 });
export function findCommit(run, window, gitExec = git) {
  const trailer = `Bubble-Refresh-Run: ${run.id}/${run.run_attempt}`;
  const records = gitExec(['log', 'HEAD', '--first-parent', '--full-history', '--fixed-strings',
    `--since-as-filter=${new Date(window.start).toISOString()}`, `--grep=${trailer}`,
    '--format=%H%x00%s%x00%(trailers:key=Bubble-Refresh-Run,valueonly,separator=%x2C)%x00', '--', PATH])
    .split('\0');
  const matches = [];
  for (let i = 0; i + 2 < records.length; i += 3) {
    const sha = records[i].trim();
    if (SHA.test(sha) && records[i + 1] === 'chore: refresh bubble watch' &&
        records[i + 2].trim() === `${run.id}/${run.run_attempt}`) matches.push(sha);
  }
  if (matches.length > 1) return { state: 'ambiguous_main_receipts' };
  if (!matches.length) return { state: 'not_on_main' };
  const [sha] = matches;
  const source = identity(JSON.parse(gitExec(['show', `${sha}:${PATH}`])));
  if (!source || date(source.generatedAt) < date(run.created_at) || date(source.generatedAt) >= window.end) {
    return { state: 'unverified_generation', sha };
  }
  const prior = identity(JSON.parse(gitExec(['show', `${sha}^1:${PATH}`])));
  if (!prior || date(prior.generatedAt) >= date(source.generatedAt)) return { state: 'no_new_full_generation', sha };
  return { state: 'on_main', sha, ...source };
}

function outcome(run, stage, commit, sites, deadlineReached) {
  if (run.status === 'completed' && run.conclusion !== 'success') return 'workflow_failed';
  if (!commit || commit.state === 'not_on_main') {
    if (run.status === 'completed') return 'commit_unconfirmed';
    return deadlineReached ? 'pending_past_deadline' : 'pending';
  }
  if (commit.state !== 'on_main') return 'commit_unconfirmed';
  if (Object.values(sites).some(status => status === 'unverified')) return 'publication_unverified';
  if (Object.values(sites).some(status => status !== 'adopted')) {
    return deadlineReached ? 'publication_not_adopted_after_deadline' : 'publication_pending';
  }
  return run.status === 'completed' && stage === 'committed' ? 'adopted' :
    deadlineReached ? 'adopted_run_pending_past_deadline' : 'adopted_run_not_complete';
}

export async function observe({ now, getApi, getSite, readCommit }) {
  const window = observationWindow(now);
  const source = new URLSearchParams({ branch: 'main', event: 'schedule', per_page: '100',
    created: `>=${new Date(window.start).toISOString()}` });
  const deadlineReached = now >= window.deadline;
  const result = { weekOf: window.monday, observedAt: new Date(now).toISOString(),
    deadlineReached, status: 'evidence_unavailable' };
  if (now < window.start) return { ...result, status: 'not_due' };
  let selection;
  try {
    selection = selectScheduledRun(await getApi(`/actions/workflows/${WORKFLOW}/runs?${source}`), window, now);
  } catch { return result; }
  const { run: latest, count } = selection;
  if (!latest) return { ...result, status: count > 1 ? 'ambiguous_scheduled_runs' :
    deadlineReached ? 'scheduled_run_not_seen_after_deadline' : 'pending' };
  result.runId = latest.id;
  result.attempt = 1;
  result.runCreatedAfterDeadline = date(latest.created_at) > window.deadline;
  result.runCreatedAt = new Date(date(latest.created_at)).toISOString();
  const attemptPath = `/actions/runs/${latest.id}/attempts/1`;
  let run = latest;
  if (latest.run_attempt !== 1) {
    try {
      run = await getApi(attemptPath);
      if (run?.id !== latest.id || run.run_attempt !== 1 || run.event !== 'schedule' ||
          run.head_branch !== 'main' || run.created_at !== latest.created_at) return result;
    } catch { return result; }
  }
  const [jobs, commit] = await Promise.all([
    Promise.resolve().then(() => getApi(`${attemptPath}/jobs?per_page=100`))
      .then(data => Array.isArray(data?.jobs) && data.jobs.length === data.total_count ? data.jobs : null, () => null),
    Promise.resolve().then(() => readCommit(run, window)).catch(() => ({ state: 'unverified_main_history' }))
  ]);
  result.commit = commit;
  result.stage = jobs || commit.state === 'on_main' ? refreshStage(run, jobs, commit.state === 'on_main') : 'job_evidence_unavailable';
  if (commit.state === 'on_main') {
    result.sites = Object.fromEntries(await Promise.all(Object.entries(SITES).map(async ([name, url]) => {
      try { return [name, siteAdoption(commit, await getSite(url))]; }
      catch { return [name, 'unverified']; }
    })));
  }
  result.status = outcome(run, result.stage, commit, result.sites || {}, deadlineReached);
  return result;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Cache-Control': 'no-cache', ...headers },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  });
  if (!res.ok) throw new Error('read failed');
  return res.json();
}

function summary(result) {
  const { status, stage, runId, attempt, commit, sites = {} } = result;
  return [
    '### Bubble Watch weekly adoption (read-only)',
    `- UTC week beginning ${result.weekOf}; observation deadline: Monday 04:30 UTC`,
    `- Observed from ${result.observedAt}: **${status}** (point-in-time, not a retrospective deadline verdict)`,
    runId && `- [Scheduled run / attempt ${attempt}](https://github.com/${REPO}/actions/runs/${runId}/attempts/${attempt}): ${stage ?? 'unverified'}; created ${result.runCreatedAt}${result.runCreatedAfterDeadline ? ' (after observation deadline)' : ''}`,
    commit && `- Main commit: ${commit.state}${commit.sha ? ` ([${commit.sha.slice(0, 12)}](https://github.com/${REPO}/commit/${commit.sha}))` : ''}`,
    commit?.generatedAt && `- Full snapshot: ${commit.generatedAt} (as of ${commit.asOf})`,
    ...Object.entries(sites).map(([name, state]) => `- ${name}: ${state}`),
    '- Past-deadline observations do not cancel, retry, or publish anything.'
  ].filter(Boolean).join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('read-only GitHub token required');
  const now = Date.now();
  const result = await observe({
    now, readCommit: findCommit,
    getApi: path => getJson(`${API}${path}`, { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }),
    getSite: url => getJson(`${url}?bubble-adoption=${now}`)
  });
  const report = summary(result);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
  if (!['adopted', 'pending', 'not_due', 'publication_pending', 'adopted_run_not_complete'].includes(result.status)) {
    process.exitCode = 1;
  }
}
