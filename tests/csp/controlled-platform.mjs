// Manual preparation/acceptance only. Default CLI is offline; never deploys anything.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { readBodyWithinLimit, buildPlan } from '../../workers/gfrr-csp-report-receiver/src/normalize.js';
import { trialIsOpen } from '../../workers/gfrr-csp-report-receiver/src/trial-window.js';

export const TARGET = 'https://gfrr-csp-report-receiver.gfrrriskradar2026.workers.dev';
export const ORIGIN = 'http://127.0.0.1:8765';
export const MAX_ATTEMPTS = 8;
const root = resolve(import.meta.dirname, '../..');
const sleep = ms => new Promise(done => setTimeout(done, ms));
function save(path, value, exclusive = false) {
  const fd = openSync(path, exclusive ? 'wx' : 'w');
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
export function sourceFingerprint() {
  const hash = createHash('sha256');
  const dir = resolve(root, 'workers/gfrr-csp-report-receiver');
  const files = ['wrangler.toml', ...readdirSync(resolve(dir, 'src')).filter(name => name.endsWith('.js')).sort().map(name => 'src/' + name)];
  for (const file of files) hash.update(file + '\0').update(readFileSync(resolve(dir, file))).update('\0');
  return hash.digest('hex');
}
export function harnessFingerprint() {
  return createHash('sha256').update(readFileSync(new URL('./controlled-platform.mjs', import.meta.url))).digest('hex');
}
export function deploymentPlan(startAt, endAt) {
  const variables = { CSP_TRIAL_ENABLED: 'true', CSP_TRIAL_START_AT: startAt, CSP_TRIAL_END_AT: endAt };
  const start = Date.parse(startAt), end = Date.parse(endAt);
  assert.ok(trialIsOpen(variables, start) && end - start <= 5 * 60_000, 'fixed window must be valid and <=5 minutes');
  const common = ['deploy', '--config', 'workers/gfrr-csp-report-receiver/wrangler.toml', '--keep-vars', '--var', 'CORS_ALLOWED_ORIGINS:' + ORIGIN];
  return {
    target: TARGET, sourceFingerprint: sourceFingerprint(), harnessFingerprint: harnessFingerprint(), approved: false,
    cumulativeBefore: 34, reserve: MAX_ATTEMPTS, cumulativeAfter: 42, limit: 500,
    closedArgs: [...common, '--var', 'CSP_TRIAL_ENABLED:false', 'CSP_TRIAL_START_AT:', 'CSP_TRIAL_END_AT:'],
    openArgs: [...common, '--var', 'CSP_TRIAL_ENABLED:true', 'CSP_TRIAL_START_AT:' + startAt, 'CSP_TRIAL_END_AT:' + endAt],
    startAt, endAt, maxUpdates: 2,
    delivery: 'native localhost CSP report -> budgeted Node relay -> existing Worker; NOT native direct delivery',
  };
}
function validateAuthorization(auth, now) {
  assert.equal(auth.approved, true, 'separate owner approval required');
  assert.equal(auth.target, TARGET); assert.equal(auth.sourceFingerprint, sourceFingerprint());
  assert.equal(auth.harnessFingerprint, harnessFingerprint(), 'reviewed harness bytes must match');
  assert.equal(auth.maxRequests, MAX_ATTEMPTS); assert.equal(auth.cumulativeBefore, 34); assert.equal(auth.limit, 500);
  assert.equal(auth.delivery, 'local-native-relay');
  deploymentPlan(auth.startAt, auth.endAt);
  assert.ok(Date.parse(auth.startAt) >= now && Date.parse(auth.startAt) - now <= 120_000, 'start must be within next two minutes');
  assert.ok(Date.parse(auth.endAt) - now <= 5 * 60_000, 'whole remaining sequence must fit five minutes');
}
export function validateReadback(record, auth, enabled) {
  assert.equal(record.reviewed, true); assert.equal(record.target, TARGET);
  assert.equal(record.sourceFingerprint, auth.sourceFingerprint);
  assert.match(record.version, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
  assert.equal(record.percent, 100); assert.equal(record.plan, 'Free');
  assert.equal(record.logs, false); assert.equal(record.traces, false);
  assert.equal(record.issues, false); assert.deepEqual(record.exportDestinations, []);
  assert.equal(record.vars.CORS_ALLOWED_ORIGINS, ORIGIN);
  assert.deepEqual(record.vars, { CORS_ALLOWED_ORIGINS: ORIGIN, CSP_TRIAL_ENABLED: enabled ? 'true' : 'false',
    CSP_TRIAL_START_AT: enabled ? auth.startAt : '', CSP_TRIAL_END_AT: enabled ? auth.endAt : '' });
  // These are manually reviewed control-plane observations, not receiver HTTP proof.
}

/** Tests inject time, transport and native producer. CLI supplies only the fixed live target. */
export async function runSequence({ auth, closedReadback, statePath, outDir, markerPath,
  waitForOpen, sendNative, fetchImpl = fetch, now = Date.now, pause = sleep }) {
  validateAuthorization(auth, now()); validateReadback(closedReadback, auth, false);
  const lockPath = statePath + '.lock';
  let locked = false, ownsOut = false, failure = null;
  const controller = new AbortController();
  const evidence = { outcome: 'running', delivery: 'local-native-relay', attempts: [],
    nativeDirectVerified: false, rawCleanupWatermarkVerified: false, deletionVerified: false };
  const latch = error => { failure ??= error; controller.abort(); };
  const check = () => { if (failure) throw failure; };
  const persist = () => { if (ownsOut) save(resolve(outDir, 'result.json'), evidence); };
  try {
    const lock = openSync(lockPath, 'wx'); locked = true;
    try { writeFileSync(lock, JSON.stringify({ pid: process.pid, purpose: 'controlled CSP acceptance' })); fsyncSync(lock); } finally { closeSync(lock); }
    const initial = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(initial.limit, 500); assert.equal(initial.cumulative, 34, 'budget drift stops without sending');
    mkdirSync(outDir); ownsOut = true;
    save(markerPath, { sourceFingerprint: auth.sourceFingerprint, initial: 34, reserved: 8 }, true);
    // Reserve ALL eight slots durably before ANY request; unused slots are never refunded.
    save(statePath, { ...initial, cumulative: 42, updatedAt: new Date(now()).toISOString() });
    evidence.reserved = 8; persist();
    async function attempt(label, path, init, expected, window) {
      check();
      const current = JSON.parse(readFileSync(statePath, 'utf8'));
      assert.equal(current.cumulative, 42, 'shared budget changed'); assert.equal(current.limit, 500);
      assert.ok(evidence.attempts.length < MAX_ATTEMPTS, 'attempt ceiling');
      const at = now(), start = Date.parse(auth.startAt), end = Date.parse(auth.endAt);
      assert.ok(window === 'closed' ? at < start : window === 'open' ? at >= start && at < end : at >= end && at <= end + 15_000,
        'wrong phase or expired execution deadline');
      const record = { label, path, method: init.method ?? 'GET', at, ordinal: evidence.attempts.length + 1 };
      evidence.attempts.push(record); persist(); // send only after durable attempt evidence
      try {
        const response = await fetchImpl(TARGET + path, { ...init, redirect: 'manual',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        record.status = response.status;
        assert.equal(response.status, expected, 'unexpected HTTP status; no retry');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const body = await readBodyWithinLimit(response.body, 16_384);
        assert.ok(body.ok, 'response byte ceiling');
        const parsed = JSON.parse(body.text);
        if (window !== 'open') assert.deepEqual(parsed, { ok: false, status: 'unknown', error: 'trial-closed' });
        record.passed = true; persist(); return parsed;
      } catch (error) { latch(error); record.passed = false; persist(); throw error; }
    }
    await attempt('closed-health', '/health', {}, 503, 'closed');
    const open = await waitForOpen(); check(); validateReadback(open, auth, true);
    assert.notEqual(open.version, closedReadback.version, 'opening needs a separately observed version');
    evidence.versions = { closed: closedReadback.version, open: open.version };
    const untilStart = Date.parse(auth.startAt) - now();
    if (untilStart > 0) await pause(untilStart);
    function health(body) {
      assert.equal(body.status, 'healthy', 'unhealthy cleanup/scheduling stops the sequence');
      assert.deepEqual(body.alerts, []); assert.equal(body.ingestBudget, 2500);
      assert.ok(Number.isSafeInteger(body.ingestUsed) && body.ingestUsed >= 0);
      assert.match(body.expectedWatermark, /^\d{4}-\d{2}-\d{2}$/u);
      return { ingestUsed: body.ingestUsed, expectedWatermark: body.expectedWatermark, status: body.status };
    }
    const before = health(await attempt('open-health-before', '/health', {}, 200, 'open'));
    const seen = new Set();
    await sendNative(async payload => {
      try {
        check(); const { plan, malformed } = buildPlan(payload);
        assert.ok(!malformed && plan.size === 1, 'exactly one synthetic violation required');
        const [key, counts] = [...plan][0], fields = key.split('|');
        const doc = fields[2];
        assert.ok(['index', 'bubble-watch'].includes(doc) && !seen.has(doc), 'unexpected or duplicate native report');
        assert.equal(payload['csp-report']?.['effective-directive'], 'script-src-elem');
        // The existing receiver enum deliberately maps script-src-elem to other; do not extend it.
        assert.equal(fields[0], 'other'); assert.equal(fields[1], 'inline'); assert.equal(fields[4], 'legacy');
        assert.equal(counts.reports, 1); seen.add(doc);
        const documentUri = ORIGIN + '/' + doc + '.html?synthetic=fiction-only';
        assert.equal(payload['csp-report']['document-uri'], documentUri);
        assert.equal(payload['csp-report']['blocked-uri'], 'inline');
        // Forward only these verified synthetic fields, never referrer/sample/arbitrary metadata.
        const relayPayload = { 'csp-report': { 'document-uri': documentUri,
          'effective-directive': 'script-src-elem', 'blocked-uri': 'inline', disposition: 'report' } };
        const result = await attempt('native-relay-' + doc, '/csp-report', {
          method: 'POST', headers: { 'content-type': 'application/csp-report', origin: ORIGIN }, body: JSON.stringify(relayPayload),
        }, 200, 'open');
        assert.equal(result.ok, true); assert.equal(result.action, 'commit'); assert.equal(result.stored, 1);
      } catch (error) { latch(error); throw error; }
    });
    check(); assert.equal(seen.size, 2);
    const after = health(await attempt('open-health-after', '/health', {}, 200, 'open'));
    assert.equal(after.ingestUsed - before.ingestUsed, 4, 'unattributable ledger delta stops');
    evidence.health = { before, after };
    const untilEnd = Date.parse(auth.endAt) - now(); if (untilEnd > 0) await pause(untilEnd + 100);
    await attempt('expired-report', '/csp-report', { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: '{}' }, 503, 'expired');
    await attempt('expired-health', '/health', {}, 503, 'expired');
    assert.equal(evidence.attempts.length, 7);
    evidence.outcome = 'controlled-sequence-pass'; persist();
    // Release only OUR normal-success lock. Failures/crashes latch it for manual recovery.
    rmSync(lockPath); locked = false; return evidence;
  } catch (error) {
    latch(error); evidence.outcome = 'stopped'; evidence.error = error.name;
    evidence.lockRetained = locked; persist(); throw error;
  }
}

/** Native reports stay on localhost; every platform send goes through the counted callback. */
export async function nativeRelay(forward) {
  const { chromium } = await import('@playwright/test');
  let browser, failure = null;
  const pending = new Set(), seen = new Set();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, ORIGIN);
      if (req.method === 'GET' && ['/index.html', '/bubble-watch.html'].includes(url.pathname)) {
        res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy-report-only':
          "default-src 'none'; script-src 'none'; report-uri " + ORIGIN + '/csp-report' });
        res.end('<!doctype html><title>Synthetic only</title><script>window.fictionOnly = true;</script>'); return;
      }
      if (req.method !== 'POST' || url.pathname !== '/csp-report' || failure) { res.writeHead(404); res.end(); return; }
      const task = (async () => {
        const body = await readBodyWithinLimit(Readable.toWeb(req), 16_384);
        assert.ok(body.ok); const payload = JSON.parse(body.text);
        const doc = new URL(payload['csp-report']['document-uri']);
        assert.equal(doc.origin, ORIGIN); assert.ok(['/index.html', '/bubble-watch.html'].includes(doc.pathname));
        assert.equal(doc.search, '?synthetic=fiction-only'); assert.ok(!seen.has(doc.pathname)); seen.add(doc.pathname);
        await forward(payload);
      })();
      pending.add(task);
      try { await task; res.writeHead(204); res.end(); } finally { pending.delete(task); }
    } catch (error) { failure ??= error; res.writeHead(500); res.end(); }
  });
  try {
    await new Promise((done, reject) => { server.once('error', reject); server.listen(8765, '127.0.0.1', done); });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
    const page = await context.newPage();
    for (const name of ['index', 'bubble-watch']) await page.goto(ORIGIN + '/' + name + '.html?synthetic=fiction-only', { timeout: 10_000 });
    const deadline = Date.now() + 10_000;
    while (!failure && (seen.size < 2 || pending.size) && Date.now() < deadline) await sleep(50);
    if (failure) throw failure;
    assert.equal(seen.size, 2); assert.equal(pending.size, 0);
  } finally {
    if (browser) await browser.close();
    await Promise.allSettled([...pending]);
    await new Promise(done => server.close(done));
  }
}

async function main(args) {
  if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
    const start = Date.now() + 120_000;
    console.log(JSON.stringify(deploymentPlan(new Date(start).toISOString(), new Date(start + 180_000).toISOString()), null, 2)); return;
  }
  assert.deepEqual(args.slice(0, 2), ['--live', '--authorization']); assert.equal(args.length, 3);
  // Only one fixed ignored authorization path; cannot redirect the live ledger/output/target.
  const authPath = resolve(root, 'test-results/csp-platform-authorization.json');
  assert.equal(resolve(args[2]), authPath);
  const auth = JSON.parse(readFileSync(authPath, 'utf8'));
  const openPath = resolve(root, 'test-results/csp-platform-open-readback.json');
  assert.ok(!existsSync(openPath), 'new open readback must be created after closed-health');
  await runSequence({ auth,
    closedReadback: JSON.parse(readFileSync(resolve(root, 'test-results/csp-platform-closed-readback.json'), 'utf8')),
    statePath: resolve(root, 'test-results/b-budget-state.json'),
    markerPath: resolve(root, 'test-results/csp-platform-controlled-once.json'),
    outDir: resolve(root, 'test-results/csp-platform-controlled-live'),
    waitForOpen: async () => {
      const deadline = Date.now() + 90_000;
      while (!existsSync(openPath) && Date.now() < deadline) await sleep(250);
      assert.ok(existsSync(openPath), 'open readback deadline; no automatic platform update');
      return JSON.parse(readFileSync(openPath, 'utf8'));
    }, sendNative: nativeRelay,
  });
  console.log('Controlled relay sequence passed; native direct/cleanup deletion still unverified.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error('Stopped: ' + error.name); process.exitCode = 1; });
}
