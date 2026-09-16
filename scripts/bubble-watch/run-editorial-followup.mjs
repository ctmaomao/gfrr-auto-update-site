import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STATUS_SCHEMA, STATUS_PATH, WORKFLOW, weekStart, classifyRun, decideRecheck, admitRecheck } from './editorial-followup.mjs';

const REPOSITORY = 'ctmaomao/gfrr-auto-update-site';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', timeout: 60_000 }).trim();

async function api(route, body) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function observations(asOfDate, now) {
  const result = await api(`actions/workflows/${WORKFLOW}/runs?branch=main&per_page=100&created=${encodeURIComponent(`>=${weekStart(now)}`)}`);
  if (result.total_count >= 100) throw new Error('Run inventory exceeds bounded limit');
  const runs = result.workflow_runs || [];
  for (const run of runs) {
    run.evidence = { reason: 'unverified', providerCalled: null, credibleCount: null };
    if (run.head_branch !== 'main' || run.head_repository?.full_name !== REPOSITORY
      || run.path !== `.github/workflows/${WORKFLOW}` || !['workflow_run', 'workflow_dispatch'].includes(run.event)
      || run.status !== 'completed' || run.run_attempt !== 1) continue;
    const jobs = await api(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    const job = jobs.jobs?.find(item => item.name === 'bubble-watch-weekly-editorial-refresh');
    if (!job) continue;
    let discovery = null;
    const directory = `manual-artifacts/bubble-watch-followup/${process.env.GITHUB_RUN_ID || 'dry-run'}/${run.id}`;
    try {
      fs.mkdirSync(directory, { recursive: true });
      execFileSync('gh', ['run', 'download', String(run.id), '--repo', REPOSITORY,
        '--name', `bubble-watch-weekly-editorial-${run.id}`, '--dir', directory],
      { stdio: 'pipe', timeout: 60_000, env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN } });
      discovery = read(`${directory}/news-discovery-latest.json`);
    } catch {
      // Missing/expired artifact is unknown evidence, never proof of zero calls.
    }
    run.evidence = classifyRun({ run, steps: job.steps, discovery, asOfDate });
  }
  return runs.sort((left, right) => right.id - left.id);
}

function persist(state) {
  if (git('status', '--porcelain')) throw new Error('Refusing status write from a dirty checkout');
  if (git('branch', '--show-current') !== 'main') throw new Error('Status writes require main');
  fs.writeFileSync(STATUS_PATH, `${JSON.stringify(state, null, 2)}\n`);
  if (!git('diff', '--name-only')) return;
  if (git('diff', '--name-only') !== STATUS_PATH) throw new Error('Unexpected status writer changes');
  git('config', 'user.name', 'github-actions[bot]');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git('add', '--', STATUS_PATH);
  if (git('diff', '--cached', '--name-only') !== STATUS_PATH) throw new Error('Unexpected staged paths');
  git('commit', '-m', 'chore: record Bubble editorial refresh status');
  // No rebase/retry: uncertain push or dispatch permanently consumes a reservation.
  git('push', 'origin', 'HEAD:main');
}

export async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--write', '--admit'].includes(arg))) throw new Error('Unsupported argument');
  const write = args.includes('--write');
  const admission = args.includes('--admit');
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || !process.env.GITHUB_TOKEN) throw new Error('Trusted Actions repository/token required');
  if (write && (process.env.GITHUB_REF !== 'refs/heads/main' || !/^\d+$/.test(process.env.GITHUB_RUN_ID || ''))) throw new Error('Trusted main run required');
  const data = read('data/bubble-watch.json');
  const state = read(STATUS_PATH);
  if (state.schemaVersion !== STATUS_SCHEMA || !state.reservations || Array.isArray(state.reservations)) throw new Error('Invalid persistent state');
  const now = new Date().toISOString();
  const runs = await observations(data.as_of_date, now);
  const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (admission) {
    const allowed = admitRecheck({ data, state, runs, now, runId: process.env.GITHUB_RUN_ID, attempt,
      week: process.env.RECHECK_WEEK, token: process.env.RECHECK_TOKEN, asOfDate: process.env.RECHECK_AS_OF });
    if (allowed && write) {
      state.reservations[process.env.RECHECK_WEEK].admittedRunId = process.env.GITHUB_RUN_ID;
      persist(state);
    }
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${allowed && write}\n`);
    console.log(`Bubble recheck admission: ${allowed && write ? 'reserved once' : 'blocked; zero provider calls'}`);
    return;
  }
  const latest = runs[0];
  const observation = latest?.evidence || { reason: 'not_started', providerCalled: null, credibleCount: null };
  const decision = decideRecheck({ data, state, observation, runs, now, eventName: process.env.GITHUB_EVENT_NAME, attempt });
  const next = { schemaVersion: STATUS_SCHEMA, asOfDate: data.as_of_date, checkedAt: now,
    sourceRunId: latest ? String(latest.id) : null, sourceRunCreatedAt: latest?.created_at || null,
    ...observation, recheckDecision: decision, reservations: state.reservations };
  if (decision === 'reserve') {
    next.reservations[weekStart(now)] = { token: process.env.GITHUB_RUN_ID, asOfDate: data.as_of_date,
      sourceRunId: next.sourceRunId, reservedAt: now, admittedRunId: null };
  }
  console.log(JSON.stringify({ reason: next.reason, recheckDecision: decision, write }));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Bubble editorial follow-up\n\n- Reason: ${next.reason}\n- Recheck: ${decision}\n- This workflow makes zero provider calls.\n`);
  if (!write) return;
  persist(next);
  if (decision === 'reserve') {
    // Exactly one dispatch, only after its durable reservation has reached main.
    await api(`actions/workflows/${WORKFLOW}/dispatches`, { ref: 'main', inputs: {
      acknowledge_cost: 'true', recheck_week: weekStart(now), recheck_token: process.env.GITHUB_RUN_ID,
      recheck_as_of: data.as_of_date
    } });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Bubble follow-up failed closed; reservation retained, no automatic retry.'); process.exitCode = 1; });
}
