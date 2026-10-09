// Independent manual candidate. Default is offline; no deployment, unlock, cleanup or retry code.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TARGET, sourceFingerprint, harnessFingerprint, validateReadback, deploymentPlan } from './controlled-platform.mjs';
import { ACCOUNT } from './controlled-platform-batch2.mjs';
import { nativeDirect, producerFingerprint } from './native-direct.mjs';
import { readBodyWithinLimit } from '../../workers/gfrr-csp-report-receiver/src/normalize.js';
import { bucketFor, retentionThreshold } from '../../workers/gfrr-csp-report-receiver/src/constants.js';

export const BATCH = 'csp-native-direct';
const root = resolve(import.meta.dirname, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const runnerFingerprint = () => hash(readFileSync(new URL(import.meta.url)));
const sleep = ms => new Promise(done => setTimeout(done, ms));
const TOTAL_MS = 300_000;
const EXPIRY_RESERVE_MS = 25_000;
function save(path, value, exclusive = false) {
  const fd = openSync(path, exclusive ? 'wx' : 'w');
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
export function nativePlan(startAt, endAt) {
  const plan = deploymentPlan(startAt, endAt, 42); // Reuse canonical UTC validation and argument arrays only.
  return { ...plan, batch: BATCH, account: ACCOUNT, approved: false, cumulativeBefore: 50, cumulativeAfter: 58,
    runnerFingerprint: runnerFingerprint(), producerFingerprint: producerFingerprint(), maxRequests: 8, maxUpdates: 3,
    delivery: 'native-browser-direct', authorizationPath: 'test-results/csp-native-direct-authorization.json',
    closedReadbackPath: 'test-results/csp-native-direct-closed-readback.json', openReadbackPath: 'test-results/csp-native-direct-open-readback.json',
    markerPath: 'test-results/csp-native-direct-once.json', outDir: 'test-results/csp-native-direct-live',
    productionActivationApproved: false };
}
export function validateNativeAuthorization(auth, previous, now) {
  assert.equal(auth.approved, true); assert.equal(auth.batch, BATCH); assert.equal(auth.account, ACCOUNT);
  assert.equal(auth.target, TARGET); assert.equal(auth.sourceFingerprint, sourceFingerprint());
  assert.equal(auth.harnessFingerprint, harnessFingerprint());
  assert.equal(auth.runnerFingerprint, runnerFingerprint()); assert.equal(auth.producerFingerprint, producerFingerprint());
  assert.equal(auth.delivery, 'native-browser-direct'); assert.equal(auth.maxRequests, 8);
  assert.equal(auth.cumulativeBefore, 50); assert.equal(auth.limit, 500); assert.equal(auth.maxUpdates, 3);
  assert.equal(auth.productionActivationApproved, false);
  assert.equal(auth.previousResultFingerprint, previous.fingerprint);
  assert.equal(previous.result.outcome, 'controlled-sequence-pass'); assert.equal(previous.result.reserved, 8);
  assert.equal(previous.result.attempts.length, 7); assert.ok(previous.result.attempts.every(attempt => attempt.passed === true));
  assert.deepEqual(previous.result.attempts.map(attempt => [attempt.label, attempt.status]), [
    ['closed-health', 503], ['open-health-before', 200], ['native-relay-index', 200],
    ['native-relay-bubble-watch', 200], ['open-health-after', 200], ['expired-report', 503], ['expired-health', 503],
  ]);
  nativePlan(auth.startAt, auth.endAt);
  assert.ok(Date.parse(auth.startAt) >= now && Date.parse(auth.startAt) - now <= 120_000);
  assert.ok(Date.parse(auth.endAt) - now <= TOTAL_MS - EXPIRY_RESERVE_MS,
    'reserve 25 seconds for both expired checks within the five-minute total');
}
export function validateInspection(body, at) {
  assert.equal(body.status, 'healthy'); assert.deepEqual(body.alerts, []); assert.equal(body.ingestBudget, 2500);
  assert.ok(Number.isSafeInteger(body.ingestUsed) && body.ingestUsed >= 0);
  const raw = body.observations; assert.ok(raw); assert.equal(raw.contract, 'csp-retention-inspection-v1');
  assert.ok(Number.isSafeInteger(raw.observedAt) && Math.abs(raw.observedAt - at) <= 10_000);
  assert.ok(Number.isSafeInteger(raw.alarmAt) && raw.alarmAt > raw.observedAt, 'missing/past next alarm stops');
  assert.match(raw.last_cleaned_bucket ?? '', /^\d{4}-\d{2}-\d{2}$/u);
  assert.ok(/^\d+$/u.test(raw.cleanup_completed_at ?? '') && Number(raw.cleanup_completed_at) <= raw.observedAt);
  assert.equal(raw.last_cleaned_bucket, bucketFor(Number(raw.cleanup_completed_at)));
  assert.equal(body.expectedWatermark, retentionThreshold(bucketFor(raw.observedAt), 14));
  assert.equal(raw.cleanup_started_at, ''); assert.equal(raw.cleanup_attempts, '0'); assert.equal(raw.retention_days, '14');
  return { ingestUsed: body.ingestUsed, expectedWatermark: body.expectedWatermark, observations: raw };
}

export async function runNativeSequence({ auth, previous, closedReadback, statePath, markerPath, outDir,
  waitForOpen, sendNative = nativeDirect, fetchImpl = fetch, now = Date.now, pause = sleep }) {
  const startedAt = now(), deadlineAt = startedAt + TOTAL_MS;
  validateNativeAuthorization(auth, previous, startedAt); validateReadback(closedReadback, auth, false);
  const lockPath = statePath + '.lock'; assert.ok(!existsSync(lockPath), 'shared lock requires separate manual recovery');
  let locked = false, ownsOut = false, failure = null;
  const controller = new AbortController();
  const evidence = { outcome: 'running', delivery: 'native-browser-direct', startedAt, deadlineAt, attempts: [], nativeDirectVerified: false,
    rawCleanupWatermarkVerified: false, nextAlarmVerified: false, deletionVerified: false };
  const check = () => { if (failure) throw failure; assert.ok(now() < deadlineAt, 'five-minute total deadline'); };
  const latch = error => { failure ??= error; controller.abort(); };
  const persist = () => { if (ownsOut) save(resolve(outDir, 'result.json'), evidence); };
  let deadlineTimer;
  const deadlineFailure = new Promise((unused, reject) => {
    deadlineTimer = setTimeout(() => { const error = new Error('five-minute total deadline'); latch(error); reject(error); },
      Math.max(0, deadlineAt - now()));
    deadlineTimer.unref();
  });
  // The shared rejection also bounds waits/producers that do not themselves honor AbortSignal.
  const bounded = promise => Promise.race([promise, deadlineFailure]);
  function begin(label, path, method, phase) {
    check(); const state = JSON.parse(readFileSync(statePath)); assert.equal(state.cumulative, 58); assert.equal(state.limit, 500);
    assert.ok(evidence.attempts.length < 8);
    const at = now(), start = Date.parse(auth.startAt), end = Date.parse(auth.endAt);
    assert.ok(phase === 'closed' ? at < start : phase === 'open' ? at >= start && at < end : at >= end && at <= end + 15_000);
    const record = { label, path, method, at, ordinal: evidence.attempts.length + 1 };
    evidence.attempts.push(record); persist(); return record;
  }
  function complete(record, response, status, closed = false) {
    check(); record.status = response.status; assert.equal(response.status, status);
    assert.equal(response.headers['cache-control'], 'no-store'); assert.ok(Buffer.byteLength(response.text) <= 16_384);
    const body = JSON.parse(response.text);
    if (closed) assert.deepEqual(body, { ok: false, status: 'unknown', error: 'trial-closed' });
    record.passed = true; persist(); return body;
  }
  async function attempt(label, path, init, expected, phase) {
    const record = begin(label, path, init.method ?? 'GET', phase);
    try {
      const response = await bounded(fetchImpl(TARGET + path, { ...init, redirect: 'manual', signal: AbortSignal.any([controller.signal,
        AbortSignal.timeout(Math.max(1, Math.min(10_000, deadlineAt - now())))]) }));
      const body = await bounded(readBodyWithinLimit(response.body, 16_384)); assert.ok(body.ok);
      return complete(record, { status: response.status, headers: Object.fromEntries(response.headers), text: body.text }, expected, phase !== 'open');
    } catch (error) { latch(error); record.passed = false; persist(); throw error; }
  }
  try {
    const fd = openSync(lockPath, 'wx'); locked = true;
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, purpose: BATCH })); fsyncSync(fd); } finally { closeSync(fd); }
    const state = JSON.parse(readFileSync(statePath)); assert.equal(state.cumulative, 50); assert.equal(state.limit, 500);
    mkdirSync(outDir); ownsOut = true;
    save(markerPath, { batch: BATCH, initial: 50, reserved: 8, sourceFingerprint: auth.sourceFingerprint }, true);
    save(statePath, { ...state, cumulative: 58, updatedAt: new Date(now()).toISOString() }); evidence.reserved = 8; persist();
    await attempt('closed-health', '/health', {}, 503, 'closed');
    const open = await bounded(waitForOpen()); check(); validateReadback(open, auth, true); assert.notEqual(open.version, closedReadback.version);
    evidence.versions = { closed: closedReadback.version, open: open.version };
    if (now() < Date.parse(auth.startAt)) await bounded(pause(Date.parse(auth.startAt) - now()));
    const before = validateInspection(await attempt('open-inspection-before', '/health?inspect=retention-v1', {}, 200, 'open'), now());
    const docs = new Set();
    await bounded(sendNative({
      signal: controller.signal,
      beforeSend(doc) {
        check(); assert.ok(['index', 'bubble-watch'].includes(doc) && !docs.has(doc)); docs.add(doc);
        return begin('native-direct-' + doc, '/csp-report', 'POST', 'open');
      },
      afterResponse(record, response) {
        try {
          check(); record.status = response.status; assert.equal(response.status, 200);
          assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.bodyInspectable, false);
          record.responseEvidence = 'chromium-network-extra-info'; record.responseBodyInspected = false;
          record.passed = true; persist();
        }
        catch (error) { latch(error); record.passed = false; persist(); throw error; }
      }, onFailure: latch,
    })); check(); assert.equal(docs.size, 2);
    const after = validateInspection(await attempt('open-inspection-after', '/health?inspect=retention-v1', {}, 200, 'open'), now());
    assert.equal(after.ingestUsed - before.ingestUsed, 4, 'unexpected public/concurrent ingestion');
    evidence.inspection = { before, after }; evidence.nativeDirectVerified = true;
    evidence.rawCleanupWatermarkVerified = true; evidence.nextAlarmVerified = true; persist();
    if (now() < Date.parse(auth.endAt)) await bounded(pause(Date.parse(auth.endAt) - now() + 100));
    await attempt('expired-report', '/csp-report', { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: '{}' }, 503, 'expired');
    await attempt('expired-health', '/health', {}, 503, 'expired');
    assert.equal(evidence.attempts.length, 7); evidence.outcome = 'native-direct-sequence-pass'; persist();
    rmSync(lockPath); locked = false; return evidence;
  } catch (error) {
    latch(error); evidence.outcome = 'stopped'; evidence.error = error.name; evidence.lockRetained = locked; persist(); throw error;
  } finally {
    clearTimeout(deadlineTimer);
  }
}
async function main(args) {
  if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
    const start = Date.now() + 60_000; console.log(JSON.stringify(nativePlan(new Date(start).toISOString(), new Date(start + 180_000).toISOString()), null, 2)); return;
  }
  assert.deepEqual(args.slice(0, 2), ['--live', '--authorization']); assert.equal(args.length, 3);
  const authPath = resolve(root, 'test-results/csp-native-direct-authorization.json'); assert.equal(resolve(args[2]), authPath);
  const auth = JSON.parse(readFileSync(authPath, 'utf8'));
  const bytes = readFileSync(resolve(root, 'test-results/csp-platform-batch2-live/result.json'));
  const openPath = resolve(root, 'test-results/csp-native-direct-open-readback.json'); assert.ok(!existsSync(openPath));
  await runNativeSequence({ auth, previous: { fingerprint: hash(bytes), result: JSON.parse(bytes) },
    closedReadback: JSON.parse(readFileSync(resolve(root, 'test-results/csp-native-direct-closed-readback.json'))),
    statePath: resolve(root, 'test-results/b-budget-state.json'), markerPath: resolve(root, 'test-results/csp-native-direct-once.json'),
    outDir: resolve(root, 'test-results/csp-native-direct-live'),
    waitForOpen: async () => { const deadline = Date.now() + 90_000;
      while (!existsSync(openPath) && Date.now() < deadline) await sleep(250);
      assert.ok(existsSync(openPath)); return JSON.parse(readFileSync(openPath)); },
  });
  console.log('Native direct candidate passed; deletion and production approval remain separate.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error('Stopped: ' + error.name); process.exitCode = 1; });
}
