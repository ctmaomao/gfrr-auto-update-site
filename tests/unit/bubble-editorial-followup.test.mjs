import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STATUS_SCHEMA, PROVIDER_STEP, classifyRun, decideRecheck, admitRecheck } from '../../scripts/bubble-watch/editorial-followup.mjs';
import { buildNewsDiscovery } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';

const now = '2026-09-16T05:45:00Z';
const date = '2026-09-14';
function fixture() {
  const discovery = buildNewsDiscovery({ rawStories: [], generatedAt: '2026-09-14T06:00:00Z',
    windowStart: '2026-09-05', windowEnd: date,
    sourceStatus: Object.fromEntries(['tavily', 'brave'].map(key => [key, { status: 'ok', successCount: 6, failureCount: 0 }])) });
  const run = { id: 123, status: 'completed', conclusion: 'success', run_attempt: 1 };
  const steps = [
    { name: PROVIDER_STEP, conclusion: 'skipped' },
    { name: 'Build compact provider input', conclusion: 'success' },
    { name: 'Verify expected no-credible-news skip stayed side-effect free', conclusion: 'success' }
  ];
  const observation = classifyRun({ run, steps, discovery, asOfDate: date });
  const context = { data: { as_of_date: date, summary: {} }, state: { schemaVersion: STATUS_SCHEMA, asOfDate: date, sourceRunId: '123', reservations: {} },
    observation, runs: [{ ...run, evidence: observation }], now, eventName: 'schedule', attempt: 1 };
  return { discovery, run, steps, context };
}

test('only explicit healthy no-news skip can reserve Wednesday slot', () => {
  const { context } = fixture();
  assert.equal(context.observation.reason, 'no_credible_news');
  assert.equal(context.observation.providerCalled, false);
  assert.equal(decideRecheck(context), 'reserve');
  for (const eventName of ['workflow_run', 'workflow_dispatch']) assert.equal(decideRecheck({ ...context, eventName }), 'status_only');
  assert.equal(decideRecheck({ ...context, attempt: 2 }), 'status_only');
  assert.equal(decideRecheck({ ...context, now: '2026-09-17T05:45:00Z' }), 'outside_recheck_day');
});

test('unknown evidence, expired artifact, failed source and paid failures never become no-news', () => {
  const { run, steps, discovery } = fixture();
  for (const sample of [null, { ...discovery, windowEnd: '2026-09-07' }]) {
    assert.equal(classifyRun({ run, steps, discovery: sample, asOfDate: date }).reason, 'unverified');
  }
  assert.notEqual(classifyRun({ run, steps: steps.slice(1), discovery, asOfDate: date }).reason, 'no_credible_news');
  const paid = [{ name: PROVIDER_STEP, conclusion: 'failure', started_at: now }];
  assert.equal(classifyRun({ run: { ...run, conclusion: 'failure' }, steps: paid, discovery, asOfDate: date }).reason, 'provider_failed');
  discovery.sourceStatus.brave.status = 'error';
  discovery.sourceStatus.brave.failureCount = 6;
  discovery.sourceStatus.brave.successCount = 0;
  assert.notEqual(classifyRun({ run, steps, discovery, asOfDate: date }).reason, 'no_credible_news');
});

test('all weekly attempts count, not only latest skip', () => {
  const { context } = fixture();
  for (const reason of ['provider_failed', 'published', 'unverified', 'validation_or_publish_failed']) {
    assert.equal(decideRecheck({ ...context, runs: [...context.runs, { id: 122, run_attempt: 1, status: 'completed', evidence: { reason } }] }), 'other_attempt_not_safe');
  }
  assert.equal(decideRecheck({ ...context, runs: [...context.runs, { status: 'queued' }] }), 'other_run_pending');
  assert.equal(decideRecheck({ ...context, data: { as_of_date: '2026-09-07' } }), 'data_not_current_week');
  context.data.summary.weekly_editorial = { asOfDate: date };
  assert.equal(decideRecheck(context), 'current_editorial_exists');
});

test('durable reservation survives dispatch ambiguity, duplicate triggers and admission', () => {
  const { context } = fixture();
  context.state.reservations['2026-09-14'] = { token: '456', asOfDate: date, sourceRunId: '123', admittedRunId: null };
  assert.equal(decideRecheck(context), 'weekly_slot_used');
  const admission = { ...context, week: date, token: '456', asOfDate: date, runId: '789' };
  assert.equal(admitRecheck(admission), true);
  for (const patch of [{ token: 'bad' }, { attempt: 2 }, { runs: [] }, { week: '2026-09-07' }, { data: { as_of_date: '2026-09-21' } }]) {
    assert.equal(admitRecheck({ ...admission, ...patch }), false);
  }
  assert.equal(admitRecheck({ ...admission, runs: [...context.runs, { id: 790, status: 'queued' }] }), false);
  context.state.reservations[date].admittedRunId = '789';
  assert.equal(admitRecheck(admission), false);
  assert.equal(admitRecheck({ ...admission, runId: '790' }), false);
});

test('locked admission stops a paid or successful manual run that overtook dispatch', () => {
  const { context } = fixture();
  context.state.reservations[date] = { token: '456', asOfDate: date, sourceRunId: '123', admittedRunId: null };
  const admission = { ...context, week: date, token: '456', asOfDate: date, runId: '789' };
  assert.equal(admitRecheck({ ...admission, runs: [...context.runs, { id: 788, status: 'completed', run_attempt: 1, evidence: { reason: 'provider_failed' } }] }), false);
  context.data.summary.weekly_editorial = { asOfDate: date };
  assert.equal(admitRecheck(admission), false);
});

test('workflow wiring keeps a single paid path and publishes status to both destinations', () => {
  const read = file => fs.readFileSync(file, 'utf8');
  const followup = read('.github/workflows/bubble-watch-editorial-followup.yml');
  assert.match(followup, /cron: '45 5 \* \* 3'/u);
  assert.match(followup, /group: gfrr-main-writer-main/u);
  assert.match(followup, /actions: write/u);
  assert.doesNotMatch(followup, /DEEPSEEK_API_KEY|run-weekly-editorial-deepseek/u);
  const ai = read('.github/workflows/bubble-watch-weekly-editorial-refresh.yml');
  assert.equal(ai.split('run:bubble-watch-weekly-editorial-deepseek -- --allow-network').length - 1, 1);
  assert.match(ai, /run-editorial-followup\.mjs --admit --write/u);
  assert.match(ai, /name: Collect bounded weekly news context\r?\n\s+if: steps.recheck_admission.outputs.allowed == 'true'/u);
  assert.match(ai, /id: build_input\r?\n\s+if: steps.recheck_admission.outputs.allowed == 'true'/u);
  for (const file of ['deploy-static-site-to-pages.yml', 'publish-edgeone-release.yml']) {
    const workflow = read(`.github/workflows/${file}`);
    assert.ok(workflow.includes('Bubble Watch Editorial Follow-up'));
    assert.ok(workflow.includes('Bubble Watch Weekly Editorial Refresh'));
  }
});
