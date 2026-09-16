import path from 'node:path';
import { mkdir, lstat, realpath, readFile, writeFile } from 'node:fs/promises';
import { ANNUAL, collectAnnualCandidate, inspectAnnualSnapshot } from './acled-annual-collector.mjs';
import { safeDirectory } from './acled-pilot-store.mjs';
import { digest, pilotContact } from './acled-pilot.mjs';

export async function readAnnualPrivateFile(file, cap) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== path.normalize(file) || stat.size > cap) throw new Error('unsafe_file');
  const text = await readFile(file, 'utf8'); if (Buffer.byteLength(text) > cap) throw new Error('unsafe_file'); return text;
}
export async function runAnnualAcceptance(root, contact, deps = {}) {
  pilotContact(contact);
  const parent = await safeDirectory(root, 'manual-artifacts');
  const dir = path.join(parent, ANNUAL.id);
  // Atomic once reservation; no recovery/delete/retry path. Even an empty or
  // interrupted existing directory consumes this separate authorization.
  try { await mkdir(dir, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'already_attempted', networkRequests: 0, productionEligible: false }; throw error; }
  const now = deps.now ?? (() => new Date().toISOString());
  await writeFile(path.join(dir, 'attempt.json'), JSON.stringify({ id: ANNUAL.id, startedAt: now(), budget: ANNUAL }), { flag: 'wx', mode: 0o600 });
  const result = await (deps.collect ?? collectAnnualCandidate)(contact, deps);
  const files = {};
  if (result.snapshot) {
    inspectAnnualSnapshot(result.snapshot, now());
    files['metadata-before.private.json'] = result.snapshot.metadataBefore;
    files['years-2022-2023.private.json'] = result.snapshot.partitions[0];
    files['years-2024-2025.private.json'] = result.snapshot.partitions[1];
    files['metadata-after.private.json'] = result.snapshot.metadataAfter;
    files['manifest.json'] = JSON.stringify({ fetchedAt: result.snapshot.fetchedAt,
      hashes: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, digest(text)])) });
  }
  files['receipt.json'] = JSON.stringify(result.report);
  if (Object.values(files).reduce((n, text) => n + Buffer.byteLength(text), 0) > ANNUAL.storageBytes - 4096) throw new Error('storage_budget');
  // Receipt is last: interrupted raw writes do not become accepted candidates.
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text, { flag: 'wx', mode: 0o600 });
  return result.report;
}
export async function readAnnualCandidateForReview(root, now = new Date().toISOString()) {
  const parent = await safeDirectory(root, 'manual-artifacts');
  const dir = await safeDirectory(parent, ANNUAL.id);
  const receipt = JSON.parse(await readAnnualPrivateFile(path.join(dir, 'receipt.json'), 32768));
  if (receipt.status !== 'candidate_ready') throw new Error('candidate_missing');
  const manifest = JSON.parse(await readAnnualPrivateFile(path.join(dir, 'manifest.json'), 32768));
  const texts = [];
  for (const name of ['metadata-before.private.json', 'years-2022-2023.private.json', 'years-2024-2025.private.json', 'metadata-after.private.json']) {
    const text = await readAnnualPrivateFile(path.join(dir, name), name.startsWith('metadata') ? 65536 : ANNUAL.bytes);
    if (manifest.hashes?.[name] !== digest(text)) throw new Error('artifact_hash'); texts.push(text);
  }
  const snapshot = { metadataBefore: texts[0], partitions: texts.slice(1, 3), metadataAfter: texts[3], fetchedAt: manifest.fetchedAt };
  inspectAnnualSnapshot(snapshot, now);
  return snapshot;
}
export async function reviewStoredAnnual(root, now = new Date().toISOString()) {
  const coverage = inspectAnnualSnapshot(await readAnnualCandidateForReview(root, now), now);
  return { status: 'saved_candidate_verified', networkRequests: 0, productionEligible: false, coverage };
}
