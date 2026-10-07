// Manual offline tests; only temporary ledgers and fake transports, no real platform calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET, ORIGIN, sourceFingerprint, harnessFingerprint, runSequence } from './controlled-platform.mjs';
import { BATCH, ACCOUNT, runnerFingerprint, batch2Plan, deploymentInvocation, runBatch2 } from './controlled-platform-batch2.mjs';

const base = Date.parse('2026-10-07T08:00:00.000Z');
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'csp-batch2-'));
  let clock = base, calls = 0, used = 0;
  const auth = { approved: true, batch: BATCH, account: ACCOUNT, runnerFingerprint: runnerFingerprint(),
    target: TARGET, sourceFingerprint: sourceFingerprint(), harnessFingerprint: harnessFingerprint(), maxRequests: 8,
    cumulativeBefore: 42, limit: 500, delivery: 'local-native-relay', previousMarkerFingerprint: 'marker-fixture',
    previousResultFingerprint: 'result-fixture', startAt: new Date(base + 1000).toISOString(), endAt: new Date(base + 2000).toISOString() };
  const previous = { markerFingerprint: 'marker-fixture', resultFingerprint: 'result-fixture',
    marker: { initial: 34, reserved: 8 }, result: { outcome: 'stopped', reserved: 8, lockRetained: true,
      attempts: [{ label: 'closed-health', status: 503, passed: true }] } };
  const readback = enabled => ({ reviewed: true, target: TARGET, sourceFingerprint: auth.sourceFingerprint,
    version: enabled ? '22222222-2222-2222-2222-222222222222' : '11111111-1111-1111-1111-111111111111',
    percent: 100, plan: 'Free', logs: false, traces: false, issues: false, exportDestinations: [],
    vars: { CORS_ALLOWED_ORIGINS: ORIGIN, CSP_TRIAL_ENABLED: enabled ? 'true' : 'false',
      CSP_TRIAL_START_AT: enabled ? auth.startAt : '', CSP_TRIAL_END_AT: enabled ? auth.endAt : '' } });
  const statePath = join(dir, 'budget.json'), outDir = join(dir, 'output'), markerPath = join(dir, 'once.json');
  writeFileSync(statePath, JSON.stringify({ cumulative: 42, limit: 500 }));
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'cache-control': 'no-store' } });
  const options = { auth, previous, statePath, outDir, markerPath, closedReadback: readback(false),
    now: () => clock, pause: async ms => { clock += ms; }, waitForOpen: async () => readback(true),
    sendNative: async forward => {
      for (const doc of ['index', 'bubble-watch']) await forward({ 'csp-report': {
        'document-uri': ORIGIN + '/' + doc + '.html?synthetic=fiction-only', 'effective-directive': 'script-src-elem', 'blocked-uri': 'inline' } });
    }, fetchImpl: async (url, init) => {
      calls++;
      assert.equal(JSON.parse(readFileSync(statePath)).cumulative, 50, 'reserve before transport');
      assert.equal(JSON.parse(readFileSync(join(outDir, 'result.json'))).attempts.length, calls);
      assert.equal(init.redirect, 'manual');
      if (clock < base + 1000 || clock >= base + 2000) return response({ ok: false, status: 'unknown', error: 'trial-closed' }, 503);
      if (url.endsWith('/health')) return response({ status: 'healthy', alerts: [], expectedWatermark: '2026-10-07', ingestBudget: 2500, ingestUsed: used });
      used += 2; return response({ ok: true, action: 'commit', stored: 1 });
    } };
  return { options, calls: () => calls, budget: () => JSON.parse(readFileSync(statePath)) };
}

test('canonical UTC bytes survive JSON parse and actual child-process argument delivery', () => {
  const f = fixture(), invocation = deploymentInvocation(JSON.stringify(f.options.auth), 'open');
  assert.ok(invocation.args.includes('CSP_TRIAL_START_AT:' + f.options.auth.startAt));
  assert.ok(invocation.args.includes('CSP_TRIAL_END_AT:' + f.options.auth.endAt));
  const probe = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', '--', ...invocation.args], { encoding: 'utf8' });
  assert.equal(probe.status, 0); assert.deepEqual(JSON.parse(probe.stdout), invocation.args);
  const bad = { ...f.options.auth, startAt: '10/07/2026 08:00:01' };
  assert.throws(() => deploymentInvocation(JSON.stringify(bad), 'open'));
  assert.throws(() => deploymentInvocation(JSON.stringify(f.options.auth), 'other'));
});

test('batch-two reserves 42 to 50, uses seven attempts and consumes only its new marker', async () => {
  const f = fixture(); const evidence = await runBatch2(f.options);
  assert.equal(evidence.outcome, 'controlled-sequence-pass'); assert.equal(f.calls(), 7); assert.equal(f.budget().cumulative, 50);
  assert.equal(evidence.nativeDirectVerified, false); assert.equal(evidence.rawCleanupWatermarkVerified, false);
  assert.equal(evidence.deletionVerified, false);
  assert.equal(JSON.parse(readFileSync(f.options.markerPath)).initial, 42);
  assert.ok(!existsSync(f.options.statePath + '.lock'));
  await assert.rejects(runBatch2(f.options)); assert.equal(f.calls(), 7);
});

test('old shared failure lock blocks before reservation and is never removed or overwritten', async () => {
  const f = fixture(); writeFileSync(f.options.statePath + '.lock', 'PRESERVE OLD LOCK');
  await assert.rejects(runBatch2(f.options)); assert.equal(f.calls(), 0); assert.equal(f.budget().cumulative, 42);
  assert.equal(readFileSync(f.options.statePath + '.lock', 'utf8'), 'PRESERVE OLD LOCK');
  assert.ok(!existsSync(f.options.outDir)); assert.ok(!existsSync(f.options.markerPath));
});

test('approval, ancestry, runner, budget and control-plane drift fail before any transport', async () => {
  for (const mutate of [f => { f.options.auth.approved = false; }, f => { f.options.auth.runnerFingerprint = 'changed'; },
    f => { f.options.auth.account = 'wrong'; }, f => { f.options.auth.previousResultFingerprint = 'changed'; },
    f => { f.options.previous.result.attempts.push({}); }, f => { f.options.auth.cumulativeBefore = 34; },
    f => { f.options.auth.maxRequests = 9; }, f => { f.options.auth.limit = 501; },
    f => { f.options.closedReadback.logs = true; }, f => { writeFileSync(f.options.statePath, '{"cumulative":43,"limit":500}'); }]) {
    const f = fixture(); mutate(f); await assert.rejects(runBatch2(f.options)); assert.equal(f.calls(), 0);
  }
});

test('batch-two failure holds its eight-slot reservation, marker and lock without retry', async () => {
  const f = fixture(); let calls = 0;
  f.options.fetchImpl = async () => { calls++; throw new Error('synthetic offline failure'); };
  await assert.rejects(runBatch2(f.options)); assert.equal(calls, 1); assert.equal(f.budget().cumulative, 50);
  assert.ok(existsSync(f.options.statePath + '.lock')); assert.ok(existsSync(f.options.markerPath));
  assert.equal(JSON.parse(readFileSync(join(f.options.outDir, 'result.json'))).outcome, 'stopped');
});

test('legacy sequence still rejects 42 baseline; default batch-two plan has no execution approval', async () => {
  const f = fixture(); await assert.rejects(runSequence(f.options)); assert.equal(f.calls(), 0); assert.equal(f.budget().cumulative, 42);
  const plan = batch2Plan(f.options.auth.startAt, f.options.auth.endAt);
  assert.equal(plan.approved, false); assert.equal(plan.lockRecoveryApproved, false); assert.equal(plan.reserve, 8);
  assert.equal(plan.cumulativeBefore, 42); assert.equal(plan.cumulativeAfter, 50);
});

test('unknown CLI flags or old authorization path cannot enter the network sequence', () => {
  const script = fileURLToPath(new URL('./controlled-platform-batch2.mjs', import.meta.url));
  for (const args of [['--live'], ['--target', TARGET], ['--live', '--authorization', 'test-results/csp-platform-authorization.json']]) {
    const child = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.notEqual(child.status, 0); assert.equal(child.stdout, ''); assert.match(child.stderr, /Stopped: AssertionError/);
  }
});
