// Manual offline regression only; does not enter unit/CI globs or use the real budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET, ORIGIN, sourceFingerprint, harnessFingerprint, deploymentPlan, runSequence, nativeRelay } from './controlled-platform.mjs';

const base = Date.parse('2026-10-06T08:00:00.000Z');
const closed = { ok: false, status: 'unknown', error: 'trial-closed' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'cache-control': 'no-store' } });
const payload = doc => ({ 'csp-report': { 'document-uri': ORIGIN + '/' + doc + '.html?synthetic=fiction-only',
  'effective-directive': 'script-src-elem', 'blocked-uri': 'inline', 'script-sample': 'LOCAL_UNFORWARDED_TEST' } });
function setup() {
  const parent = mkdtempSync(join(tmpdir(), 'gfrr-csp-preparation-'));
  let clock = base, calls = 0, used = 6;
  const auth = { approved: true, target: TARGET, sourceFingerprint: sourceFingerprint(), harnessFingerprint: harnessFingerprint(), maxRequests: 8,
    cumulativeBefore: 34, limit: 500, delivery: 'local-native-relay',
    startAt: new Date(base + 1000).toISOString(), endAt: new Date(base + 2000).toISOString() };
  const readback = enabled => ({ reviewed: true, target: TARGET, sourceFingerprint: auth.sourceFingerprint,
    version: enabled ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    percent: 100, plan: 'Free', logs: false, traces: false, issues: false, exportDestinations: [],
    vars: { CORS_ALLOWED_ORIGINS: ORIGIN, CSP_TRIAL_ENABLED: enabled ? 'true' : 'false',
      CSP_TRIAL_START_AT: enabled ? auth.startAt : '', CSP_TRIAL_END_AT: enabled ? auth.endAt : '' } });
  const statePath = join(parent, 'budget.json'), outDir = join(parent, 'result'), markerPath = join(parent, 'once.json');
  writeFileSync(statePath, JSON.stringify({ cumulative: 34, limit: 500 }));
  const options = { auth, closedReadback: readback(false), statePath, outDir, markerPath,
    waitForOpen: async () => readback(true), now: () => clock, pause: async ms => { clock += ms; },
    sendNative: async forward => { await forward(payload('index')); await forward(payload('bubble-watch')); },
    fetchImpl: async (url, init) => {
      calls++;
      // This assertion is at the transport boundary, BEFORE a fake response can succeed.
      assert.equal(JSON.parse(readFileSync(statePath)).cumulative, 42);
      const evidence = JSON.parse(readFileSync(join(outDir, 'result.json')));
      assert.equal(evidence.attempts.length, calls);
      assert.equal(init.redirect, 'manual'); assert.ok(init.signal);
      assert.ok(url.startsWith(TARGET + '/'));
      if (clock < base + 1000 || clock >= base + 2000) return response(closed, 503);
      if (url.endsWith('/health')) return response({ status: 'healthy', alerts: [], expectedWatermark: '2026-09-22', ingestBudget: 2500, ingestUsed: used });
      assert.ok(!init.body.includes('LOCAL_UNFORWARDED_TEST'));
      used += 2; return response({ ok: true, action: 'commit', stored: 1 });
    },
  };
  return { options, calls: () => calls, readback, budget: () => JSON.parse(readFileSync(statePath)),
    evidence: () => JSON.parse(readFileSync(join(outDir, 'result.json'))) };
}

test('offline deployment plan preserves variables and explicitly pins loopback CORS and trial settings', () => {
  const plan = deploymentPlan(new Date(base).toISOString(), new Date(base + 300_000).toISOString());
  assert.equal(plan.approved, false); assert.equal(plan.reserve, 8); assert.equal(plan.cumulativeAfter, 42);
  for (const args of [plan.closedArgs, plan.openArgs]) {
    assert.ok(args.includes('--keep-vars')); assert.ok(args.includes('CORS_ALLOWED_ORIGINS:' + ORIGIN));
    assert.ok(!args.includes('--yes')); assert.ok(!args.includes('--temporary'));
  }
  for (const end of [base, base - 1, base + 300_001]) assert.throws(() => deploymentPlan(new Date(base).toISOString(), new Date(end).toISOString()));
});
test('seven sends consume eight pre-reserved slots; expiry rejects; success releases only own lock', async () => {
  const f = setup(); const evidence = await runSequence(f.options);
  assert.equal(f.calls(), 7); assert.equal(f.budget().cumulative, 42);
  assert.equal(evidence.outcome, 'controlled-sequence-pass'); assert.equal(evidence.nativeDirectVerified, false);
  assert.equal(evidence.rawCleanupWatermarkVerified, false); assert.equal(evidence.deletionVerified, false);
  assert.equal(evidence.health.after.ingestUsed - evidence.health.before.ingestUsed, 4);
  assert.ok(existsSync(f.options.markerPath)); assert.ok(!existsSync(f.options.statePath + '.lock'));
  await assert.rejects(runSequence(f.options)); assert.equal(f.calls(), 7); // never re-run the consumed sequence
});
test('missing approval, changed target/fingerprint/budget/window and unsafe readback stop before any send', async () => {
  const mutations = [f => { f.options.auth.approved = false; }, f => { f.options.auth.target = 'https://example.invalid'; },
    f => { f.options.auth.sourceFingerprint = '0'.repeat(64); }, f => { f.options.auth.maxRequests = 9; },
    f => { f.options.auth.harnessFingerprint = '0'.repeat(64); },
    f => { f.options.auth.delivery = 'native-direct'; }, f => { f.options.auth.startAt = new Date(base - 1).toISOString(); },
    f => { f.options.closedReadback.vars.CORS_ALLOWED_ORIGINS = '*'; }, f => { f.options.closedReadback.logs = true; },
    f => { writeFileSync(f.options.statePath, '{'); }, f => { writeFileSync(f.options.statePath, '{"limit":500,"cumulative":35}'); }];
  for (const mutate of mutations) { const f = setup(); mutate(f); await assert.rejects(runSequence(f.options)); assert.equal(f.calls(), 0); }
});
test('lock and existing evidence/marker conflicts never overwrite older files', async () => {
  for (const kind of ['lock', 'output', 'marker']) {
    const f = setup(); const path = kind === 'lock' ? f.options.statePath + '.lock' : kind === 'marker' ? f.options.markerPath : f.options.outDir;
    if (kind === 'output') mkdirSync(path); else writeFileSync(path, 'OLDER EVIDENCE');
    await assert.rejects(runSequence(f.options)); assert.equal(f.calls(), 0); assert.equal(f.budget().cumulative, 34);
    if (kind !== 'output') assert.equal(readFileSync(path, 'utf8'), 'OLDER EVIDENCE');
  }
});
test('unexpected status, redirects, oversized body or network failure latch lock; no retry/refund', async () => {
  for (const transport of [async () => response({}, 500), async () => response({}, 302),
    async () => new Response('x'.repeat(16_385), { status: 503, headers: { 'cache-control': 'no-store' } }),
    async () => { throw new Error('synthetic transport failure'); }]) {
    const f = setup(); let sends = 0;
    f.options.fetchImpl = async (...args) => { sends++; return transport(...args); };
    await assert.rejects(runSequence(f.options)); assert.equal(sends, 1); assert.equal(f.budget().cumulative, 42);
    assert.equal(f.evidence().outcome, 'stopped'); assert.ok(existsSync(f.options.statePath + '.lock'));
  }
});
test('unsafe second deployment, unhealthy health or unexpected report stops remaining sequence', async () => {
  const f = setup(); f.options.waitForOpen = async () => ({ ...f.readback(true), logs: true });
  await assert.rejects(runSequence(f.options)); assert.equal(f.calls(), 1);
  const g = setup(); g.options.sendNative = async forward => { await forward(payload('index')); await forward(payload('index')); };
  await assert.rejects(runSequence(g.options)); assert.equal(g.calls(), 3); assert.equal(g.budget().cumulative, 42);
  const h = setup(); const original = h.options.fetchImpl;
  h.options.fetchImpl = async (...args) => h.calls() === 1 ? response({ status: 'alert', alerts: ['cleanup-watermark-stale'] }) : original(...args);
  await assert.rejects(runSequence(h.options)); assert.equal(h.calls(), 1); // overridden transport is not counted by fixture
});
test('unknown flags and live without exact authorization cannot fall through to network', () => {
  for (const args of [['--target', TARGET], ['--live'], ['--live', '--authorization', 'wrong.json']]) {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./controlled-platform.mjs', import.meta.url)), ...args], { encoding: 'utf8' });
    assert.notEqual(child.status, 0); assert.match(child.stderr, /Stopped: AssertionError/); assert.equal(child.stdout, '');
  }
});
test('real native Chromium reports remain local and pass through the counted fake transport', async () => {
  const f = setup(); f.options.sendNative = nativeRelay;
  const evidence = await runSequence(f.options);
  assert.equal(f.calls(), 7); assert.equal(evidence.outcome, 'controlled-sequence-pass');
  assert.equal(evidence.nativeDirectVerified, false);
});
