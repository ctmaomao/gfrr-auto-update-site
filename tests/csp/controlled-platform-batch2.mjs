// Manual batch-two preparation. Default is offline; this entry never executes Wrangler or recovers locks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deploymentPlan, runSequence, nativeRelay } from './controlled-platform.mjs';

export const BATCH = 'csp-platform-batch2';
export const ACCOUNT = '17767b6cb05ca161549e25cc42a817d7';
const root = resolve(import.meta.dirname, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const runnerFingerprint = () => hash(readFileSync(new URL('./controlled-platform-batch2.mjs', import.meta.url)));

export function batch2Plan(startAt, endAt) {
  return { ...deploymentPlan(startAt, endAt, 42), batch: BATCH, account: ACCOUNT,
    runnerFingerprint: runnerFingerprint(), authorizationPath: 'test-results/csp-platform-batch2-authorization.json',
    closedReadbackPath: 'test-results/csp-platform-batch2-closed-readback.json',
    openReadbackPath: 'test-results/csp-platform-batch2-open-readback.json',
    markerPath: 'test-results/csp-platform-batch2-once.json', outDir: 'test-results/csp-platform-batch2-live',
    lockRecoveryApproved: false, productionActivationApproved: false };
}

/** Parse without DateTime conversion, then return argument arrays, never shell command strings. */
export function deploymentInvocation(authorizationText, phase) {
  const auth = JSON.parse(authorizationText);
  assert.ok(['closed', 'open'].includes(phase));
  const plan = batch2Plan(auth.startAt, auth.endAt);
  return { account: ACCOUNT, args: phase === 'closed' ? plan.closedArgs : plan.openArgs };
}

export function validateBatch2(auth, previous) {
  assert.equal(auth.batch, BATCH); assert.equal(auth.account, ACCOUNT);
  assert.equal(auth.runnerFingerprint, runnerFingerprint());
  assert.equal(auth.previousMarkerFingerprint, previous.markerFingerprint);
  assert.equal(auth.previousResultFingerprint, previous.resultFingerprint);
  assert.equal(previous.marker.initial, 34); assert.equal(previous.marker.reserved, 8);
  assert.equal(previous.result.outcome, 'stopped'); assert.equal(previous.result.lockRetained, true);
  assert.equal(previous.result.reserved, 8);
  assert.equal(previous.result.attempts.length, 1);
  assert.equal(previous.result.attempts[0].label, 'closed-health');
  assert.equal(previous.result.attempts[0].status, 503); assert.equal(previous.result.attempts[0].passed, true);
  assert.equal(auth.cumulativeBefore, 42);
  // Common authorization additionally enforces approved:true, both source/harness hashes,
  // eight slots, limit 500, canonical short window and reviewed readbacks.
}

export async function runBatch2({ previous, ...options }) {
  validateBatch2(options.auth, previous);
  assert.ok(!existsSync(options.statePath + '.lock'), 'shared failure lock requires separately approved manual recovery');
  return runSequence({ ...options, cumulativeBefore: 42 });
}

function previousEvidence() {
  const markerBytes = readFileSync(resolve(root, 'test-results/csp-platform-controlled-once.json'));
  const resultBytes = readFileSync(resolve(root, 'test-results/csp-platform-controlled-live/result.json'));
  return { markerFingerprint: hash(markerBytes), resultFingerprint: hash(resultBytes),
    marker: JSON.parse(markerBytes), result: JSON.parse(resultBytes) };
}

async function main(args) {
  if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
    const start = Date.now() + 60_000;
    console.log(JSON.stringify(batch2Plan(new Date(start).toISOString(), new Date(start + 180_000).toISOString()), null, 2));
    return;
  }
  assert.deepEqual(args.slice(0, 2), ['--live', '--authorization']); assert.equal(args.length, 3);
  const authPath = resolve(root, 'test-results/csp-platform-batch2-authorization.json');
  assert.equal(resolve(args[2]), authPath);
  const auth = JSON.parse(readFileSync(authPath, 'utf8'));
  const openPath = resolve(root, 'test-results/csp-platform-batch2-open-readback.json');
  assert.ok(!existsSync(openPath), 'open readback must be new and follow closed-health');
  await runBatch2({ auth, previous: previousEvidence(),
    closedReadback: JSON.parse(readFileSync(resolve(root, 'test-results/csp-platform-batch2-closed-readback.json'), 'utf8')),
    statePath: resolve(root, 'test-results/b-budget-state.json'),
    markerPath: resolve(root, 'test-results/csp-platform-batch2-once.json'),
    outDir: resolve(root, 'test-results/csp-platform-batch2-live'),
    waitForOpen: async () => {
      const deadline = Date.now() + 90_000;
      while (!existsSync(openPath) && Date.now() < deadline) await new Promise(done => setTimeout(done, 250));
      assert.ok(existsSync(openPath), 'readback deadline; no automatic update or retry');
      return JSON.parse(readFileSync(openPath, 'utf8'));
    }, sendNative: nativeRelay });
  console.log('Batch two controlled relay passed; native direct, next alarm and deletion remain separate.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error('Stopped: ' + error.name); process.exitCode = 1; });
}
