// Manual, offline transport fixtures. Historical known operational receipts are byte-encoded to preserve their hashes across OS line endings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectionPlan, validateProbeAuthorization, runInspectionProbe } from './controlled-inspection-probe.mjs';
import { ORIGIN, TARGET } from './controlled-platform.mjs';
const lineage = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('./inspection-probe-lineage.fixture.json', import.meta.url), 'utf8').replace(/^\uFEFF/u, '')))
  .map(([key, encoded]) => [key, Buffer.from(encoded, 'base64')]));
const base = Date.parse('2026-10-09T12:00:00.000Z');
function fixture() {
  let clock = base; const dir = mkdtempSync(join(tmpdir(), 'csp-inspection-probe-'));
  const auth = { ...inspectionPlan(new Date(base + 1000).toISOString(), new Date(base + 2000).toISOString()), approved: true };
  const readback = enabled => ({ reviewed: true, target: TARGET, sourceFingerprint: auth.sourceFingerprint,
    account: auth.account, namespace: 'fa02880f086f41ff94f526a982f7ed23', observedAt: new Date(clock).toISOString(),
    version: enabled ? '571a4260-b6e0-4823-b207-f8ab6a999427' : 'b9524593-ac3a-4508-a38a-df5c1a8303d8',
    percent: 100, plan: 'Free', logs: false, traces: false, issues: false, exportDestinations: [],
    vars: { CORS_ALLOWED_ORIGINS: ORIGIN, CSP_TRIAL_ENABLED: enabled ? 'true' : 'false',
      CSP_TRIAL_START_AT: enabled ? auth.startAt : '', CSP_TRIAL_END_AT: enabled ? auth.endAt : '' } });
  const statePath = join(dir, 'budget.json'), markerPath = join(dir, 'marker.json'), outDir = join(dir, 'result');
  writeFileSync(statePath, JSON.stringify({ cumulative: 58, limit: 500 }));
  const healthy = () => ({ status: 'healthy', alerts: [], ingestBudget: 2500, ingestUsed: 4,
    expectedWatermark: '2026-09-26', observations: { contract: 'csp-retention-inspection-v1', observedAt: clock,
      alarmAt: clock + 86400000, last_cleaned_bucket: '2026-10-09', cleanup_completed_at: String(base - 1000),
      cleanup_started_at: '', cleanup_attempts: '0', retention_days: '14' } });
  const calls = [];
  const options = { auth, lineage, closedReadback: readback(false), statePath, markerPath, outDir, now: () => clock,
    pause: async ms => { clock += ms; }, waitForOpen: async () => readback(true),
    fetchImpl: async (url, init) => {
      calls.push([url, init.method]); assert.equal(init.redirect, 'manual'); assert.ok(init.signal);
      const result = JSON.parse(readFileSync(join(outDir, 'result.json')));
      assert.equal(result.attempts.length, calls.length); assert.equal(JSON.parse(readFileSync(statePath)).cumulative, 61);
      const open = url.includes('?inspect=');
      return new Response(JSON.stringify(open ? healthy() : { ok: false, status: 'unknown', error: 'trial-closed' }),
        { status: open ? 200 : 503, headers: { 'cache-control': 'no-store' } });
    } };
  return { options, calls, healthy, setClock: at => { clock = at; }, readback,
    result: () => JSON.parse(readFileSync(join(outDir, 'result.json'))) };
}
test('fresh plan is unapproved, GET-only and does not reuse old native paths/budget', () => {
  const f = fixture(), p = inspectionPlan(f.options.auth.startAt, f.options.auth.endAt);
  assert.equal(p.approved, false); assert.equal(p.cumulativeBefore, 58); assert.equal(p.cumulativeAfter, 61);
  assert.equal(p.maxRequests, 3); assert.equal(p.maxUpdates, 2); assert.equal(p.delivery, 'inspection-get-only');
  assert.ok(p.markerPath.includes('inspection-probe')); assert.ok(!p.markerPath.includes('native-direct'));
  validateProbeAuthorization(f.options.auth, lineage, base);
});
test('reused approval, altered fingerprints/lineage, namespace, stale readback and full deadline window stop before transport', async () => {
  for (const change of [o => { o.auth.approved = false; }, o => { o.auth.cumulativeBefore = 50; },
    o => { o.auth.runnerFingerprint = '0'.repeat(64); }, o => { o.auth.diagnosticsFingerprint = '0'.repeat(64); },
    o => { o.lineage = { ...lineage, failedResult: Buffer.from('{}') }; },
    o => { o.auth.openArgs = [...o.auth.openArgs, '--var', 'CORS_ALLOWED_ORIGINS:https://other.test']; },
    o => { o.closedReadback.namespace = 'other'; }, o => { o.closedReadback.observedAt = new Date(base - 31000).toISOString(); },
    o => { o.auth.endAt = new Date(base + 300000).toISOString(); }]) {
    const f = fixture(); change(f.options); await assert.rejects(runInspectionProbe(f.options));
    assert.equal(f.calls.length, 0); assert.equal(JSON.parse(readFileSync(f.options.statePath)).cumulative, 58);
    assert.equal(existsSync(f.options.statePath + '.lock'), false);
  }
});
test('healthy snapshot permits exactly three GETs; normal success releases only its own lock', async () => {
  const f = fixture(), result = await runInspectionProbe(f.options);
  assert.equal(result.outcome, 'inspection-probe-pass'); assert.equal(result.inspectionReadback.validationPassed, true);
  assert.deepEqual(f.calls, [[TARGET + '/health', 'GET'], [TARGET + '/health?inspect=retention-v1', 'GET'], [TARGET + '/health', 'GET']]);
  assert.equal(result.nativeDirectVerified, false); assert.equal(result.deletionVerified, false);
  assert.equal(existsSync(f.options.markerPath), true); assert.equal(existsSync(f.options.statePath + '.lock'), false);
  assert.equal(JSON.parse(readFileSync(f.options.statePath)).cumulative, 61);
});
test('200 alert and 503 unknown retain rejected diagnostics, budget, marker and failed lock without retry', async () => {
  for (const status of [200, 503]) {
    const f = fixture(), original = f.options.fetchImpl;
    f.options.fetchImpl = async (url, init) => {
      if (!url.includes('?inspect=')) return original(url, init);
      f.calls.push([url, init.method]);
      const body = f.healthy(); body.status = status === 200 ? 'alert' : 'unknown';
      body.alerts = status === 200 ? ['schedule-overdue'] : ['cannot-confirm'];
      body.message = 'PRIVATE_MESSAGE'; body.url = 'https://private.test/?secret=PRIVATE_URL';
      return new Response(JSON.stringify(body), { status, headers: { 'cache-control': 'no-store' } });
    };
    await assert.rejects(runInspectionProbe(f.options)); const result = f.result();
    assert.equal(result.outcome, 'stopped'); assert.equal(result.inspectionReadback.validationPassed, false);
    assert.equal(result.inspectionReadback.status, status === 200 ? 'alert' : 'unknown');
    assert.ok(!JSON.stringify(result).includes('PRIVATE_')); assert.equal(f.calls.length, 2);
    assert.equal(existsSync(f.options.statePath + '.lock'), true); assert.equal(existsSync(f.options.markerPath), true);
    assert.equal(JSON.parse(readFileSync(f.options.statePath)).cumulative, 61);
  }
});
test('existing artifact or failed lock stops before reservation', async () => {
  for (const path of ['markerPath', 'outDir', 'lock']) {
    const f = fixture(); writeFileSync(path === 'lock' ? f.options.statePath + '.lock' : f.options[path], 'existing');
    await assert.rejects(runInspectionProbe(f.options)); assert.equal(f.calls.length, 0);
    assert.equal(JSON.parse(readFileSync(f.options.statePath)).cumulative, 58);
  }
});
test('late body and invalid response stop, retain reservation and never send another request', async () => {
  for (const mode of ['late', 'redirect', 'oversize', 'malformed']) {
    const f = fixture(); f.options.fetchImpl = async () => {
      f.calls.push('called');
      const text = mode === 'oversize' ? 'x'.repeat(16385) : mode === 'malformed' ? '{' : JSON.stringify({ ok: false, status: 'unknown', error: 'trial-closed' });
      const response = new Response(new ReadableStream({ start(c) { if (mode === 'late') f.setClock(base + 300000); c.enqueue(new TextEncoder().encode(text)); c.close(); } }),
        { status: mode === 'redirect' ? 307 : 503, headers: { 'cache-control': 'no-store' } }); return response;
    };
    await assert.rejects(runInspectionProbe(f.options)); assert.equal(f.calls.length, 1);
    assert.equal(f.result().outcome, 'stopped'); assert.equal(existsSync(f.options.statePath + '.lock'), true);
  }
});
test('deadline during open wait and after expiry prevents subsequent transport', async () => {
  for (const phase of ['open', 'expired']) {
    const f = fixture();
    if (phase === 'open') f.options.waitForOpen = async () => { f.setClock(base + 300000); return f.readback(true); };
    else f.options.pause = async ms => { f.setClock(ms > 1000 ? base + 300000 : base + 1000); };
    await assert.rejects(runInspectionProbe(f.options)); assert.equal(f.calls.length, phase === 'open' ? 1 : 2);
    assert.equal(existsSync(f.options.statePath + '.lock'), true);
  }
});
