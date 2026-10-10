// Independent manual diagnosis. Default is offline; no deployment, unlock, native report or retry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TARGET, deploymentPlan, validateReadback } from './controlled-platform.mjs';
import { ACCOUNT } from './controlled-platform-batch2.mjs';
import { inspectionEvidence, validateInspection } from './controlled-native-platform.mjs';
import { readBodyWithinLimit } from '../../workers/gfrr-csp-report-receiver/src/normalize.js';

export const BATCH = 'csp-inspection-probe';
const root = resolve(import.meta.dirname, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const TOTAL_MS = 300_000;
const sleep = ms => new Promise(done => setTimeout(done, ms));
export const runnerFingerprint = () => hash(readFileSync(new URL(import.meta.url)));
const diagnosticsFingerprint = () => hash(readFileSync(new URL('./controlled-native-platform.mjs', import.meta.url)));
const lineageHashes = Object.freeze({
  failedResult: 'd9f17c468623a5d669d785599932df91fe538324f666679191dc4c5fe407ffc8',
  archivedLock: '582ea1899d4cb02fcf491c8b7e407dd62c5d7f6aeefe679d1c1569f7eaa13f86',
  recoveryReceipt: 'eaa915b6e75ebcbabba7e64445d1701b6751d397c9d41bb976c2d82b92762d26',
});
const lineagePaths = {
  failedResult: 'test-results/csp-native-direct-live/result.json',
  archivedLock: 'test-results/csp-native-lock-recovery-preparation-20261009/retired-native-direct.lock',
  recoveryReceipt: 'test-results/csp-native-lock-recovery-preparation-20261009/move-completion.json',
};
function save(path, value, exclusive = false) {
  const fd = openSync(path, exclusive ? 'wx' : 'w');
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
export function inspectionPlan(startAt, endAt) {
  const common = deploymentPlan(startAt, endAt, 42); // Canonical UTC/argv only; old budget gates stay unchanged.
  return { ...common, batch: BATCH, account: ACCOUNT, approved: false, cumulativeBefore: 58,
    cumulativeAfter: 61, reserve: 3, maxRequests: 3, maxUpdates: 2, delivery: 'inspection-get-only',
    runnerFingerprint: runnerFingerprint(), diagnosticsFingerprint: diagnosticsFingerprint(), lineageHashes,
    authorizationPath: 'test-results/csp-inspection-probe-authorization.json',
    closedReadbackPath: 'test-results/csp-inspection-probe-closed-readback.json',
    openReadbackPath: 'test-results/csp-inspection-probe-open-readback.json',
    markerPath: 'test-results/csp-inspection-probe-once.json', outDir: 'test-results/csp-inspection-probe-live',
    productionActivationApproved: false };
}
export function validateProbeAuthorization(auth, lineage, at) {
  const expected = inspectionPlan(auth.startAt, auth.endAt);
  assert.equal(auth.approved, true, 'new specific owner approval required');
  for (const key of ['batch', 'account', 'target', 'sourceFingerprint', 'harnessFingerprint', 'runnerFingerprint',
    'diagnosticsFingerprint', 'cumulativeBefore', 'cumulativeAfter', 'reserve', 'maxRequests', 'maxUpdates',
    'limit', 'delivery', 'productionActivationApproved', 'authorizationPath', 'closedReadbackPath',
    'openReadbackPath', 'markerPath', 'outDir']) assert.equal(auth[key], expected[key], key);
  assert.deepEqual(auth.lineageHashes, lineageHashes);
  assert.deepEqual(auth.openArgs, expected.openArgs); assert.deepEqual(auth.closedArgs, expected.closedArgs);
  for (const key of Object.keys(lineageHashes)) assert.equal(hash(lineage[key]), lineageHashes[key], key);
  assert.ok(Date.parse(auth.startAt) >= at && Date.parse(auth.startAt) - at <= 120_000);
  assert.ok(Date.parse(auth.endAt) - at <= TOTAL_MS - 25_000, 'reserve expiry checks within total deadline');
}
function validateControl(record, auth, enabled, at) {
  validateReadback(record, auth, enabled);
  assert.equal(record.account, ACCOUNT);
  assert.equal(record.namespace, 'fa02880f086f41ff94f526a982f7ed23');
  assert.ok(Number.isFinite(Date.parse(record.observedAt)) && Math.abs(Date.parse(record.observedAt) - at) <= 30_000,
    'fresh control-plane observation required');
}

export async function runInspectionProbe({ auth, lineage, closedReadback, statePath, markerPath, outDir,
  waitForOpen, fetchImpl = fetch, now = Date.now, pause = sleep }) {
  const startedAt = now(), deadlineAt = startedAt + TOTAL_MS;
  validateProbeAuthorization(auth, lineage, startedAt); validateControl(closedReadback, auth, false, startedAt);
  const lockPath = statePath + '.lock';
  for (const path of [lockPath, markerPath, outDir]) assert.ok(!existsSync(path), 'new artifacts and absent shared lock required');
  const initial = JSON.parse(readFileSync(statePath)); assert.equal(initial.cumulative, 58); assert.equal(initial.limit, 500);
  const evidence = { batch: BATCH, outcome: 'running', startedAt, deadlineAt, attempts: [],
    nativeDirectVerified: false, deletionVerified: false, productionActivation: false };
  const controller = new AbortController(); let failure = null, locked = false, ownsOut = false, timer;
  const persist = () => { if (ownsOut) save(resolve(outDir, 'result.json'), evidence); };
  const latch = error => { failure ??= error; controller.abort(); };
  const check = () => { if (failure) throw failure; assert.ok(now() < deadlineAt, 'five-minute total deadline'); };
  const expiry = new Promise((unused, reject) => {
    timer = setTimeout(() => { const error = new Error('five-minute total deadline'); latch(error); reject(error); }, TOTAL_MS);
    timer.unref();
  });
  const bounded = promise => Promise.race([promise, expiry]);
  async function request(label, path, phase) {
    check(); const at = now(), start = Date.parse(auth.startAt), end = Date.parse(auth.endAt);
    assert.ok(phase === 'closed' ? at < start : phase === 'open' ? at >= start && at < end : at >= end && at <= end + 15_000);
    const state = JSON.parse(readFileSync(statePath)); assert.equal(state.cumulative, 61); assert.equal(state.limit, 500);
    assert.ok(evidence.attempts.length < 3);
    const record = { label, path, method: 'GET', at, ordinal: evidence.attempts.length + 1 };
    evidence.attempts.push(record); persist(); // Durable reservation before every transport.
    try {
      const response = await bounded(fetchImpl(TARGET + path, { method: 'GET', redirect: 'manual',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, Math.min(10_000, deadlineAt - now())))]) }));
      check(); record.status = response.status;
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await bounded(readBodyWithinLimit(response.body, 16_384)); check(); assert.ok(body.ok);
      const parsed = JSON.parse(body.text);
      if (phase === 'open') {
        evidence.inspectionReadback = inspectionEvidence(parsed, now()); persist();
        assert.ok([200, 503].includes(response.status), 'only health response statuses');
        record.httpPassed = response.status === 200;
        validateInspection(parsed, now()); // Existing full healthy gate; unknown/alert is diagnostic failure.
        assert.equal(response.status, 200);
        evidence.inspectionReadback.validationPassed = true;
      } else {
        assert.equal(response.status, 503); assert.deepEqual(parsed, { ok: false, status: 'unknown', error: 'trial-closed' });
      }
      record.passed = true; persist();
    } catch (error) { latch(error); record.passed = false; persist(); throw error; }
  }
  try {
    const fd = openSync(lockPath, 'wx'); locked = true;
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, purpose: BATCH })); fsyncSync(fd); } finally { closeSync(fd); }
    mkdirSync(outDir); ownsOut = true;
    save(markerPath, { batch: BATCH, initial: 58, reserved: 3, runnerFingerprint: auth.runnerFingerprint }, true);
    save(statePath, { ...initial, cumulative: 61, updatedAt: new Date(now()).toISOString() }); evidence.reserved = 3; persist();
    await request('closed-health', '/health', 'closed');
    const open = await bounded(waitForOpen(controller.signal)); check(); validateControl(open, auth, true, now());
    assert.notEqual(open.version, closedReadback.version); evidence.versions = { closed: closedReadback.version, open: open.version };
    if (now() < Date.parse(auth.startAt)) await bounded(pause(Date.parse(auth.startAt) - now())); check();
    await request('open-inspection', '/health?inspect=retention-v1', 'open');
    if (now() < Date.parse(auth.endAt)) await bounded(pause(Date.parse(auth.endAt) - now() + 100)); check();
    await request('expired-health', '/health', 'expired');
    assert.equal(evidence.attempts.length, 3); evidence.outcome = 'inspection-probe-pass'; persist();
    rmSync(lockPath); locked = false; return evidence;
  } catch (error) {
    latch(error); evidence.outcome = 'stopped'; evidence.error = error.name; evidence.lockRetained = locked; persist(); throw error;
  } finally { clearTimeout(timer); }
}
async function main(args) {
  if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
    const start = Date.now() + 60_000;
    console.log(JSON.stringify(inspectionPlan(new Date(start).toISOString(), new Date(start + 90_000).toISOString()), null, 2)); return;
  }
  assert.deepEqual(args.slice(0, 2), ['--live', '--authorization']); assert.equal(args.length, 3);
  const plan = inspectionPlan(new Date(Date.now() + 60_000).toISOString(), new Date(Date.now() + 150_000).toISOString());
  const authPath = resolve(root, plan.authorizationPath); assert.equal(resolve(args[2]), authPath);
  const auth = JSON.parse(readFileSync(authPath));
  const openPath = resolve(root, plan.openReadbackPath); assert.ok(!existsSync(openPath));
  const lineage = Object.fromEntries(Object.entries(lineagePaths).map(([key, path]) => [key, readFileSync(resolve(root, path))]));
  await runInspectionProbe({ auth, lineage, closedReadback: JSON.parse(readFileSync(resolve(root, plan.closedReadbackPath))),
    statePath: resolve(root, 'test-results/b-budget-state.json'), markerPath: resolve(root, plan.markerPath), outDir: resolve(root, plan.outDir),
    waitForOpen: async signal => {
      const deadline = Date.now() + 90_000;
      while (!existsSync(openPath) && Date.now() < deadline) { signal.throwIfAborted(); await sleep(250); }
      signal.throwIfAborted(); assert.ok(existsSync(openPath)); return JSON.parse(readFileSync(openPath));
    },
  });
  console.log('Inspection-only probe passed; native delivery, deletion and production approval remain separate.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error('Stopped: ' + error.name); process.exitCode = 1; });
}
