import { compareScopeBaselines, validateScopeBaselines } from './acled-admin2-scope-review.mjs';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { safeDirectory } from './acled-pilot-store.mjs';
import { readAnnualPrivateFile } from './acled-annual-store.mjs';
import { digest, pilotContact } from './acled-pilot.mjs';
import { SCOPE, collectScope, inspectScopeSnapshot } from './acled-admin2-scope-collector.mjs';

export async function runScopeAcceptance(root, contact, baselines, deps = {}) {
  pilotContact(contact);
  validateScopeBaselines(baselines, (deps.now ?? (() => new Date().toISOString()))());
  const parent = await safeDirectory(root, 'manual-artifacts'), dir = path.join(parent, SCOPE.id);
  try { await mkdir(dir, { mode: 0o700 }); }
  catch (e) { if (e.code === 'EEXIST') return { status: 'already_attempted', networkRequests: 0, productionEligible: false }; throw e; }
  const now = deps.now ?? (() => new Date().toISOString());
  await writeFile(path.join(dir, 'attempt.json'), JSON.stringify({ id: SCOPE.id, startedAt: now(), budget: SCOPE }), { flag: 'wx', mode: 0o600 });
  const result = await (deps.collect ?? collectScope)(contact, baselines, deps), files = {};
  if (result.snapshot) {
    inspectScopeSnapshot(result.snapshot, now());
    files['metadata-before.private.json'] = result.snapshot.metadataBefore;
    files['sample.private.json'] = result.snapshot.sampleJson;
    files['metadata-after.private.json'] = result.snapshot.metadataAfter;
    files['manifest.json'] = JSON.stringify({ fetchedAt: result.snapshot.fetchedAt,
      hashes: Object.fromEntries(Object.entries(files).map(([key, text]) => [key, digest(text)])) });
  }
  files['receipt.json'] = JSON.stringify(result.report);
  if (Object.values(files).reduce((n, text) => n + Buffer.byteLength(text), 0) > SCOPE.storageBytes - 4096) throw new Error('storage_budget');
  // Receipt last; interruption consumes approval and never creates a valid archive.
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text, { flag: 'wx', mode: 0o600 });
  return result.report;
}
export async function readScopeCandidateForReview(root, now = new Date().toISOString()) {
  const parent = await safeDirectory(root, 'manual-artifacts'), dir = await safeDirectory(parent, SCOPE.id);
  const receipt = JSON.parse(await readAnnualPrivateFile(path.join(dir, 'receipt.json'), 32768));
  if (!['candidate_ready', 'comparison_hold'].includes(receipt.status)) throw new Error('candidate_missing');
  const manifest = JSON.parse(await readAnnualPrivateFile(path.join(dir, 'manifest.json'), 32768)), texts = [];
  for (const name of ['metadata-before.private.json', 'sample.private.json', 'metadata-after.private.json']) {
    const text = await readAnnualPrivateFile(path.join(dir, name), name.startsWith('metadata') ? 65536 : SCOPE.bytes);
    if (manifest.hashes?.[name] !== digest(text)) throw new Error('artifact_hash'); texts.push(text);
  }
  const snapshot = { metadataBefore: texts[0], sampleJson: texts[1], metadataAfter: texts[2], fetchedAt: manifest.fetchedAt };
  inspectScopeSnapshot(snapshot, now);
  return snapshot;
}
export async function reviewStoredScope(root, baselines, now = new Date().toISOString()) {
  const snapshot = await readScopeCandidateForReview(root, now);
  const coverage = inspectScopeSnapshot(snapshot, now), comparison = compareScopeBaselines(snapshot, baselines, now);
  return { status: comparison.afg.status === 'same_version_conflict' ? 'comparison_hold' : 'saved_candidate_verified', networkRequests: 0, productionEligible: false, coverage, comparison };
}
