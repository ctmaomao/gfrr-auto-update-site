import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCommit, observationWindow, observe, refreshStage, selectScheduledRun, siteAdoption }
  from '../../scripts/monitor-bubble-watch-adoption.mjs';

const start = Date.parse('2026-11-23T00:15:00Z');
const deadline = Date.parse('2026-11-23T04:30:00Z');
const run = { id: 123, run_attempt: 1, head_branch: 'main', event: 'schedule',
  created_at: '2026-11-23T00:15:38Z', status: 'completed', conclusion: 'success' };
const generatedAt = '2026-11-23T00:23:37.123Z';
const asOf = '2026-11-23';
const sha = 'a'.repeat(40);
const served = { generated_at: generatedAt, as_of_date: asOf };
const commit = { state: 'on_main', sha, generatedAt, asOf };
const runList = (...runs) => ({ total_count: runs.length, workflow_runs: runs });
const jobList = (...jobs) => ({ total_count: jobs.length, jobs });
const nz = time => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Pacific/Auckland', weekday: 'long', hourCycle: 'h23', hour: '2-digit', minute: '2-digit'
}).format(time).replace(' at ', ' ');

test('00:15 belongs to Monday UTC, including NZ DST transitions and ISO year boundaries', () => {
  for (const [input, monday, local] of [
    ['2026-04-05T23:00:00Z', '2026-03-30', 'Monday 13:15'],
    ['2026-04-06T00:15:00Z', '2026-04-06', 'Monday 12:15'],
    ['2026-09-21T00:15:00Z', '2026-09-21', 'Monday 12:15'],
    ['2026-09-28T00:15:00Z', '2026-09-28', 'Monday 13:15'],
    ['2027-01-01T00:00:00Z', '2026-12-28', 'Monday 13:15'],
    ['2027-01-04T00:00:00Z', '2027-01-04', 'Monday 13:15']
  ]) {
    const w = observationWindow(Date.parse(input));
    assert.equal(w.monday, monday);
    assert.equal(new Date(w.start).toISOString(), `${monday}T00:15:00.000Z`);
    assert.equal(new Date(w.deadline).toISOString(), `${monday}T04:30:00.000Z`);
    assert.equal(nz(w.start), local);
  }
});

test('filters by main, schedule, current UTC slot and observation time; duplicate and incomplete evidence cannot pass', () => {
  const w = observationWindow(start);
  const other = [
    { ...run, event: 'workflow_dispatch' }, { ...run, head_branch: 'other' },
    { ...run, created_at: '2026-11-23T00:14:59Z' }, { ...run, created_at: '2026-11-30T00:15:00Z' },
    { ...run, created_at: '2026-11-23T05:00:00Z' }
  ];
  assert.deepEqual(selectScheduledRun(runList(...other, run), w, deadline), { run, count: 1 });
  assert.deepEqual(selectScheduledRun(runList(run, { ...run, id: 456 }), w, deadline), { run: null, count: 2 });
  assert.throws(() => selectScheduledRun({ ...runList(run), total_count: 2 }, w, deadline), /incomplete/u);
});

test('reports queue, running, checks, aggregate-check/commit and completed without claiming success', () => {
  const running = { ...run, status: 'in_progress' };
  const job = (status, name) => [{ name: 'refresh', status, steps: name ? [{ name, status: 'in_progress' }] : [] }];
  assert.equal(refreshStage({ ...run, status: 'queued' }, [], false), 'queued_or_waiting');
  assert.equal(refreshStage(running, [], false), 'awaiting_refresh_job');
  assert.equal(refreshStage(running, job('queued'), false), 'queued_or_waiting');
  assert.equal(refreshStage(running, job('in_progress'), false), 'running');
  assert.equal(refreshStage(running, job('in_progress', 'Check Bubble payload'), false), 'checking');
  assert.equal(refreshStage(running, job('in_progress', 'Check GDELT cache health'), false), 'checking');
  assert.equal(refreshStage(running, job('in_progress', 'Commit'), false), 'aggregate_check_or_commit');
  assert.equal(refreshStage(run, [{ name: 'refresh', status: 'completed', conclusion: 'success' }], false),
    'finished_without_commit');
  assert.equal(refreshStage(run, [], true), 'committed');
});

test('distinguishes pending and observation timeout from actual run failure', async () => {
  const opts = { now: deadline, getApi: () => runList(), getSite: () => assert.fail('unexpected site call') };
  assert.equal((await observe({ ...opts, now: start - 1 })).status, 'not_due');
  assert.equal((await observe({ ...opts, now: deadline - 1 })).status, 'pending');
  assert.equal((await observe(opts)).status, 'scheduled_run_not_seen_after_deadline');
  assert.equal((await observe({ ...opts, getApi: () => { throw new Error('network'); } })).status, 'evidence_unavailable');
  const read = selected => path => path.includes('/workflows/') ? runList(selected) : jobList();
  const noCommit = () => ({ state: 'not_on_main' });
  const pending = await observe({ ...opts, getApi: read({ ...run, status: 'queued' }), readCommit: noCommit });
  assert.equal(pending.status, 'pending_past_deadline');
  assert.equal(pending.stage, 'queued_or_waiting');
  assert.equal((await observe({ ...opts, getApi: read({ ...run, conclusion: 'failure' }),
    readCommit: noCommit })).status, 'workflow_failed');
  assert.equal((await observe({ ...opts, getApi: read(run), readCommit: noCommit })).status, 'commit_unconfirmed');
});

test('checks both published snapshots against the original attempt, not an independently refreshed overlay or rerun', async () => {
  const paths = [];
  const getApi = path => {
    paths.push(path);
    if (path.includes('/workflows/')) return runList({ ...run, run_attempt: 2 });
    if (path.endsWith('/attempts/1')) return run;
    if (path.includes('/attempts/1/jobs')) return jobList();
    assert.fail('unexpected API path');
  };
  const opts = { now: deadline, getApi, readCommit: selected => {
    assert.equal(selected.run_attempt, 1);
    return commit;
  } };
  const matching = await observe({ ...opts, getSite: () => ({ ...served, market_observations: ['different overlay'] }) });
  assert.equal(matching.attempt, 1);
  assert.equal(matching.status, 'adopted');
  assert.deepEqual(matching.sites, { 'GitHub Pages': 'adopted', EdgeOne: 'adopted' });
  assert.equal(paths.length, 3);
  const stale = await observe({ ...opts, getSite: url => url.includes('github.io') ? served :
    { ...served, generated_at: '2026-11-16T00:21:37.123Z' } });
  assert.equal(stale.status, 'publication_not_adopted_after_deadline');
  assert.equal(stale.sites.EdgeOne, 'stale_or_mismatched');
  assert.equal(siteAdoption(commit, { ...served, generated_at: '2026-11-23T00:25:37.123Z' }), 'different_newer_generation');
  assert.equal((await observe({ ...opts, getSite: () => { throw new Error('not reachable'); } })).status,
    'publication_unverified');
});

test('late observations report current adoption, flag a late run, and do not imply cutoff compliance', async () => {
  const late = { ...run, created_at: '2026-11-23T09:00:00Z' };
  const now = Date.parse('2026-11-24T00:15:00Z');
  const opts = { now, getApi: path => path.includes('/workflows/') ? runList(late) : jobList(),
    readCommit: () => commit };
  const adopted = await observe({ ...opts, getSite: () => served });
  assert.equal(adopted.status, 'adopted');
  assert.equal(adopted.observedAt, '2026-11-24T00:15:00.000Z');
  assert.equal(adopted.runCreatedAfterDeadline, true);
  assert.equal(adopted.runCreatedAt, '2026-11-23T09:00:00.000Z');
  const stale = await observe({ ...opts, getSite: () => ({ ...served, generated_at: '2026-11-16T00:21:37.123Z' }) });
  assert.equal(stale.status, 'publication_not_adopted_after_deadline');
});

test('uses a real Git lineage, exact trailer and strictly newer full-generation clock', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'gfrr-bubble-adoption-'));
  try {
    const git = args => execFileSync('git', args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
        GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
        GIT_AUTHOR_DATE: '2026-11-23T00:24:00Z', GIT_COMMITTER_DATE: '2026-11-23T00:24:00Z' }
    });
    const write = (data, ...args) => {
      writeFileSync(join(cwd, 'data/bubble-watch.json'), JSON.stringify(data));
      git(['add', 'data/bubble-watch.json']);
      git(['commit', ...args]);
    };
    git(['init', '-b', 'main']);
    mkdirSync(join(cwd, 'data'));
    write({ ...served, generated_at: '2026-11-16T00:23:37.123Z' }, '-m', 'prior');
    write(served, '-m', 'chore: refresh bubble watch', '-m', 'Bubble-Refresh-Run: 123/1');
    const fullSha = git(['rev-parse', 'HEAD']).trim();
    write({ ...served, extra: ['new observations'] }, '-m', 'credit overlay');
    const w = observationWindow(start);
    assert.deepEqual(findCommit(run, w, git), { ...commit, sha: fullSha });
    assert.deepEqual(findCommit({ ...run, id: 12 }, w, git), { state: 'not_on_main' });
    write({ ...served, extra: [] }, '-m', 'chore: refresh bubble watch', '-m', 'Bubble-Refresh-Run: 123/2');
    assert.equal(findCommit({ ...run, run_attempt: 2 }, w, git).state, 'no_new_full_generation');
    write({ ...served, extra: ['another'] }, '-m', 'chore: refresh bubble watch', '-m', 'Bubble-Refresh-Run: 123/1');
    assert.equal(findCommit(run, w, git).state, 'ambiguous_main_receipts');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('workflow uses one full cron and an isolated, read-only observer', () => {
  const full = readFileSync(new URL('../../.github/workflows/refresh-bubble-watch.yml', import.meta.url), 'utf8');
  const monitor = readFileSync(new URL('../../.github/workflows/monitor-bubble-watch-adoption.yml', import.meta.url), 'utf8');
  assert.deepEqual([...full.matchAll(/^\s*- cron: (.+)$/gmu)].map(m => m[1]), ["'15 0 * * 1'"]);
  assert.deepEqual([...monitor.matchAll(/^\s*- cron: (.+)$/gmu)].map(m => m[1]), ["'30 4 * * 1'"]);
  assert.match(monitor, /permissions:\n  actions: read\n  contents: read\n\n/u);
  assert.match(monitor, /persist-credentials: false/u);
  assert.doesNotMatch(monitor, /secrets\.|(?:contents|actions): write|workflow_run:|gh workflow|git (?:push|commit)|npm (?:ci|run)/u);
  assert.match(full, /Bubble-Refresh-Run: \$\{GITHUB_RUN_ID\}\/\$\{GITHUB_RUN_ATTEMPT\}/u);
});
