import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { safeDirectory } from './acled-pilot-store.mjs';
import { readAnnualPrivateFile } from './acled-annual-store.mjs';
import { digest, pilotContact } from './acled-pilot.mjs';
import { SCOPE, collectScope } from './acled-admin2-scope-collector.mjs';
import { validateScopeBaselines } from './acled-admin2-scope-review.mjs';
import { reviewScopeQuarantine } from './acled-admin2-quarantine.mjs';

// Separate owner-approved artifact_sanitizer_layer once. Old IDs stay spent.
export const FORENSIC = Object.freeze({ ...SCOPE, id: 'acled-admin2-forensic-20260916' });
export async function runForensicAcceptance(root, contact, baselines, deps = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  pilotContact(contact); validateScopeBaselines(baselines, now());
  const parent = await safeDirectory(root, 'manual-artifacts'), dir = path.join(parent, FORENSIC.id);
  try { await mkdir(dir, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'already_attempted', networkRequests: 0, productionEligible: false }; throw error; }
  await writeFile(path.join(dir, 'attempt.json'), JSON.stringify({ id: FORENSIC.id, startedAt: now(), budget: FORENSIC }), { flag: 'wx', mode: 0o600 });
  const result = await (deps.collect ?? collectScope)(contact, baselines, deps);
  const evidence = result.quarantine ?? result.snapshot, files = {};
  let diagnostic = null;
  if (evidence) {
    diagnostic = reviewScopeQuarantine(evidence, now());
    files['quarantine-metadata-before.private.json'] = evidence.metadataBefore;
    files['quarantine-sample.private.json'] = evidence.sampleJson;
    if (evidence.metadataAfter !== null) files['quarantine-metadata-after.private.json'] = evidence.metadataAfter;
    files['quarantine-manifest.json'] = JSON.stringify({ schemaVersion: 'acled-admin2-forensic-v1',
      fetchedAt: evidence.fetchedAt, hasMetadataAfter: evidence.metadataAfter !== null,
      hashes: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, digest(text)])) });
  }
  const report = { schemaVersion: 'acled-admin2-forensic-receipt-v1', status: evidence ? 'evidence_saved_not_candidate' : 'stopped',
    collection: result.report, diagnostic, productionEligible: false, sourceCutoverApproved: false };
  files['receipt.json'] = JSON.stringify(report);
  if (Object.values(files).reduce((n, text) => n + Buffer.byteLength(text), 0) > FORENSIC.storageBytes - 4096) throw new Error('storage_budget');
  // No candidate manifest/sample names, even when source row validation passes.
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text, { flag: 'wx', mode: 0o600 });
  return report;
}
export async function reviewForensicEvidence(root, now = new Date().toISOString()) {
  const parent = await safeDirectory(root, 'manual-artifacts'), dir = await safeDirectory(parent, FORENSIC.id);
  const receipt = JSON.parse(await readAnnualPrivateFile(path.join(dir, 'receipt.json'), 32768));
  if (receipt.status !== 'evidence_saved_not_candidate') throw new Error('evidence_missing');
  const manifest = JSON.parse(await readAnnualPrivateFile(path.join(dir, 'quarantine-manifest.json'), 32768));
  if (manifest.schemaVersion !== 'acled-admin2-forensic-v1' || typeof manifest.hasMetadataAfter !== 'boolean') throw new Error('manifest_invalid');
  const texts = [];
  for (const name of ['quarantine-metadata-before.private.json', 'quarantine-sample.private.json',
    ...(manifest.hasMetadataAfter ? ['quarantine-metadata-after.private.json'] : [])]) {
    const text = await readAnnualPrivateFile(path.join(dir, name), name.includes('metadata') ? 65536 : FORENSIC.bytes);
    if (manifest.hashes?.[name] !== digest(text)) throw new Error('artifact_hash'); texts.push(text);
  }
  return reviewScopeQuarantine({ metadataBefore: texts[0], sampleJson: texts[1], metadataAfter: texts[2] ?? null, fetchedAt: manifest.fetchedAt }, now);
}
