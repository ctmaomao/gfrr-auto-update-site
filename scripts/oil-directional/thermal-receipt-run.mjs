// Artifact-sanitizer sidecar: opt-in, fixed ignored destination, no provider calls.
import { createHash } from 'node:crypto';
import { mkdirSync, lstatSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createThermalReceiptCapture } from './thermal-receipt-capture.mjs';

export const THERMAL_RECEIPT_PATH = 'manual-artifacts/oil-thermal-research/receipt.json';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function writeReceipt(snapshot) {
  const text = JSON.stringify(snapshot);
  if (Buffer.byteLength(text) > 262144) throw new Error('Research size limit');
  // Refuse symlink directories/files rather than crossing the fixed output boundary.
  for (const directory of ['manual-artifacts', 'manual-artifacts/oil-thermal-research']) {
    try { mkdirSync(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('Invalid research path');
  }
  const target = resolve(THERMAL_RECEIPT_PATH);
  const temp = resolve(dirname(target), `receipt-${snapshot.manifest.runId}-${snapshot.manifest.runAttempt}.tmp`);
  // Exclusive temp creation avoids following a pre-existing symlink. Rename replaces
  // a destination symlink itself rather than following it; no recursive/glob writes.
  writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
  renameSync(temp, target);
}

export async function runWithThermalReceipt({ enabled, config, options, env = process.env }, build) {
  if (!enabled) return build(null);
  let recorder;
  try {
    const geometry = config.facilities.map(f => ({ areaId: f.id, bbox: f.bbox.string }));
    recorder = createThermalReceiptCapture({
      runId: env.GITHUB_RUN_ID, runAttempt: Number(env.GITHUB_RUN_ATTEMPT), checkoutSha: env.THERMAL_ACTUAL_CHECKOUT_SHA,
      configDigest: digest({ config, sources: options.sources, dayRange: options.dayRange, timeoutMs: options.timeoutMs }),
      geometryDigest: digest(geometry), sourceSet: options.sources,
      expectedRequests: config.facilities.length * options.sources.length
    });
  } catch { return build(null); } // Invalid metadata disables research, not production.
  let finished = false;
  try { const result = await build(recorder); finished = true; return result; }
  finally {
    try {
      writeReceipt(finished ? recorder.finalize() : recorder.snapshot());
      // A current invocation must attest a fresh write; manifest matching alone
      // cannot distinguish an old file from an earlier invocation of this run.
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, 'research_receipt_written=true\n');
    }
    catch { /* Write/quota/path failures are research-only; never log exception text. */ }
  }
}

export function isCurrentThermalReceipt(text, { runId, runAttempt, checkoutSha }) {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 262144) return false;
    const receipt = JSON.parse(text);
    createThermalReceiptCapture(receipt.manifest); // Strict manifest shape/limits, no I/O.
    return receipt.schemaVersion === 'thermal-receipt-capture-v1'
      && receipt.manifest?.runId === runId && receipt.manifest?.runAttempt === Number(runAttempt)
      && receipt.manifest?.checkoutSha === checkoutSha
      && receipt.eligibleForEvaluation === false && receipt.eligibleForMainScore === false
      && receipt.crossRunFirstSeen === null && typeof receipt.finalized === 'boolean';
  } catch { return false; }
}
