// Inactive integration API. No CLI, scheduler, or network at import.
// Receipts prevent accidental cross-run/cache reuse, not arbitrary same-process JS.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest } from './pressure-model.mjs';
import { validateShadowLedger } from './pressure-evaluation.mjs';
import { isHistoricalDate } from './historical-validation.mjs';
import { readPersistedPressureArtifacts, PRESSURE_PERSISTENCE_IDENTITY } from './pressure-artifact-readback.mjs';

export const FROZEN_PRESSURE = Object.freeze({
  commit: '5f4fb4c1ea4c870af0dd36b6c3e0683a79f026f6',
  implementation: 'd3723b145c0eab8538938d3d95bdf033c68dd8ee7e68e85630b354c6d5e8001b',
  cohort: 'pressure-shadow-29d69c0ecb7b98a0'
});
const receipts = new WeakMap();
const execute = promisify(execFile);
const relativeRoot = 'manual-artifacts/main-score-audit/pressure-model';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const refuse = reason => { throw new Error(`shared_retrieval_hold:${reason}`); };
const contained = (file, root) => file.startsWith(root + path.sep);
function safeParents(file) {
  let parent = path.resolve(file);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  if (fs.realpathSync(parent) !== parent) refuse('symlink_parent');
}
function regular(file) {
  if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== path.resolve(file)) refuse('unsafe_file');
}
function verifyTree(root, listing) {
  const entries = listing.split('\0').filter(Boolean);
  if (!entries.length) refuse('empty_frozen_tree');
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s.exec(entry);
    if (!match) refuse('unsupported_frozen_entry');
    const file = path.resolve(root, match[3]);
    if (!contained(file, root)) refuse('frozen_path');
    regular(file);
    const bytes = fs.readFileSync(file);
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (blob !== match[2]) refuse('frozen_bytes');
  }
}

function saveNew(file, bytes) {
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  if (sha(fs.readFileSync(file)) !== sha(bytes)) refuse('persistence_mismatch');
}

// Pure evidence check, also used by offline fixtures. It cannot issue a receipt.
export function validateSharedCycle({ previous, ledger, cache, report, protocol, startedAt, finishedAt, identity, targetImplementation }) {
  const start = Date.parse(startedAt), finish = Date.parse(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start || finish - start > 15 * 60000
    || startedAt.slice(0, 10) !== finishedAt.slice(0, 10)) refuse('cycle_time');
  if (!/^\d+$/.test(identity?.runId ?? '') || !/^\d+$/.test(identity?.attempt ?? '')) refuse('run_identity');
  if (!/^[a-f0-9]{64}$/.test(targetImplementation ?? '') || targetImplementation === FROZEN_PRESSURE.implementation) refuse('target_identity');
  const protocolHash = digest(protocol);
  if (!Array.isArray(previous?.records) || !previous.records.length || previous.implementationHash !== FROZEN_PRESSURE.implementation
    || ledger?.implementationHash !== FROZEN_PRESSURE.implementation || previous.protocolHash !== protocolHash || ledger.protocolHash !== protocolHash) refuse('legacy_identity');
  if (ledger.records?.length !== previous.records.length + 1 || digest(ledger.records.slice(0, -1)) !== digest(previous.records)) refuse('legacy_not_appended');
  const last = ledger.records.at(-1), retrieved = Date.parse(cache?.retrievedAt);
  if (cache?.schemaVersion !== 'pressure-source-cache-v1' || cache.vintage !== 'latest_revised_not_point_in_time'
    || !Number.isFinite(retrieved) || retrieved < start || retrieved > finish || cache.retrievedAt.slice(0, 10) !== finishedAt.slice(0, 10)
    || last.date !== finishedAt.slice(0, 10) || last.sourceRetrievedAt !== cache.retrievedAt
    || !Number.isFinite(Date.parse(last.recordedAt)) || Date.parse(last.recordedAt) < retrieved || Date.parse(last.recordedAt) > finish) refuse('retrieval_time');
  if (report?.implementationHash !== FROZEN_PRESSURE.implementation || report.protocolHash !== protocolHash
    || report.sourceRetrievedAt !== cache.retrievedAt || Date.parse(report.generatedAt) < retrieved
    || !Number.isFinite(Date.parse(report.generatedAt)) || Date.parse(report.generatedAt) > finish
    || digest(report.sourceStatus) !== digest(cache.sourceStatus)) refuse('report_binding');
  const expectedSources = { ...Object.fromEntries(Object.entries(protocol.sources).map(([key, policy]) => [key, policy.seriesId])),
    ...protocol.benchmarks, hyOas:'BAMLH0A0HYM2', igOas:'BAMLC0A0CM', real10y:'DFII10', walcl:'WALCL', onRrp:'RRPONTSYD', t10y2y:'T10Y2Y' };
  for (const object of [cache.series, cache.sourceStatus]) if (digest(Object.keys(object ?? {}).sort()) !== digest(Object.keys(expectedSources).sort())) refuse('source_set');
  for (const [key, seriesId] of Object.entries(expectedSources)) {
    const status = cache.sourceStatus[key], rows = cache.series[key];
    if (!Array.isArray(rows) || status?.seriesId !== seriesId || !['available','unavailable'].includes(status.status)
      || (status.status === 'unavailable' && rows.length !== 0)
      || (status.status === 'available' && (rows.length < 2 || status.count !== rows.length || status.firstDate !== rows[0].date || status.lastDate !== rows.at(-1).date))) refuse('source_metadata');
  }
  const required = Object.keys(protocol.sources);
  for (const key of required) {
    const rows = cache.series?.[key];
    if (cache.sourceStatus?.[key]?.status !== 'available' || !Array.isArray(rows) || rows.length < 2
      || cache.sourceStatus[key].seriesId !== protocol.sources[key].seriesId) refuse('core_source_missing');
    const evidence = last.scoreInputs?.evidence?.[key];
    if (!rows.some(row => row.date === evidence?.observationDate && row.value === evidence?.value)) refuse('evidence_cache_mismatch');
  }
  for (const rows of Object.values(cache.series ?? {})) {
    let previousDate = '';
    if (!Array.isArray(rows)) refuse('source_rows');
    for (const row of rows) {
      if (!isHistoricalDate(row?.date) || row.date <= previousDate || !Number.isFinite(row.value)) refuse('source_rows');
      previousDate = row.date;
    }
  }
  return { runId: identity.runId, attempt: identity.attempt, legacyCommit: FROZEN_PRESSURE.commit,
    legacyImplementation: FROZEN_PRESSURE.implementation, protocolHash, targetImplementation,
    retrievedAt: cache.retrievedAt, evaluationDate: last.date, legacyRecordHash: last.recordHash, startedAt, finishedAt };
}

// Executes only the unchanged frozen legacy CLI's existing retrieval. Never run
// manually for testing. Future activation needs independent workflow review.
async function runLegacyStage({ legacyRoot, previousLedger, legacyUntil }) {
  const identity = { runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT };
  if (process.env.GITHUB_ACTIONS !== 'true' || !/^\d+$/.test(identity.runId ?? '') || !/^\d+$/.test(identity.attempt ?? '')) refuse('ci_only');
  const startedAt = new Date().toISOString();
  if (!isHistoricalDate(legacyUntil) || startedAt.slice(0, 10) > legacyUntil) refuse('legacy_expired');
  const root = path.resolve(legacyRoot), current = fs.realpathSync(process.cwd());
  if (fs.realpathSync(root) !== root || root === current || contained(root, current) || contained(current, root)) refuse('checkout_isolation');
  const options = { cwd: root, env: { PATH: process.env.PATH }, timeout: 15 * 60000, maxBuffer: 4 * 1024 * 1024 };
  const git = async args => (await execute('git', args, options)).stdout.trim();
  if (await git(['rev-parse', 'HEAD']) !== FROZEN_PRESSURE.commit || await git(['status', '--porcelain', '--untracked-files=all']) !== ''
    || (await git(['ls-files', '-s'])).split('\n').some(line => line.startsWith('120000 '))) refuse('frozen_checkout');
  const tree = await git(['ls-tree', '-rz', 'HEAD']);
  verifyTree(root, tree); // Do not trust assume-unchanged/skip-worktree index flags.
  const node = async args => (await execute(process.execPath, args, options)).stdout.trim();
  if (await node(['scripts/research-pressure-model.mjs', '--print-cohort']) !== FROZEN_PRESSURE.cohort) refuse('frozen_cohort');
  if (await node(['--input-type=module', '-e', 'import { implementationHash } from "./scripts/research-pressure-model.mjs"; console.log(implementationHash());']) !== FROZEN_PRESSURE.implementation) refuse('frozen_implementation');
  const protocol = readJson(path.join(root, 'config/pressure-model-research.json'));
  const prior = path.resolve(previousLedger);
  if (!contained(prior, path.join(root, relativeRoot))) refuse('previous_path');
  regular(prior);
  const previousBytes = fs.readFileSync(prior), previous = JSON.parse(previousBytes);
  validateShadowLedger(previous, protocol, FROZEN_PRESSURE.implementation, startedAt);
  if (previous.records.at(-1).date >= startedAt.slice(0, 10)) refuse('duplicate_day');
  const cycle = `shared-${identity.runId}-${identity.attempt}`;
  const directory = path.join(root, relativeRoot, cycle);
  safeParents(directory);
  if (fs.existsSync(directory)) refuse('cycle_exists');
  fs.mkdirSync(directory, { recursive: true });
  const cacheFile = path.join(directory, 'source-cache.json'), reportFile = path.join(directory, 'report.json');
  await node(['scripts/research-pressure-model.mjs', '--allow-network', '--record-shadow', '--previous-ledger', prior,
    '--cache', cacheFile, '--output', reportFile]);
  const finishedAt = new Date().toISOString();
  const ledgerFile = path.join(directory, 'shadow-ledger.json');
  for (const file of [reportFile, ledgerFile]) regular(file);
  if (await git(['rev-parse', 'HEAD']) !== FROZEN_PRESSURE.commit || await git(['status', '--porcelain', '--untracked-files=all']) !== '') refuse('frozen_checkout_changed');
  verifyTree(root, tree);
  if (sha(fs.readFileSync(prior)) !== sha(previousBytes)) refuse('previous_changed');
  const reportBytes = fs.readFileSync(reportFile), ledgerBytes = fs.readFileSync(ledgerFile);
  const report = JSON.parse(reportBytes), ledger = JSON.parse(ledgerBytes);
  validateShadowLedger(ledger, protocol, FROZEN_PRESSURE.implementation, finishedAt);
  // Preserve a legitimate legacy append BEFORE any corrected-track/cache gate.
  // These checks belong to legacy continuity, not corrected eligibility.
  if (ledger.records?.length !== previous.records.length + 1
    || digest(ledger.records.slice(0, -1)) !== digest(previous.records)) refuse('legacy_not_appended');
  if (report.implementationHash !== FROZEN_PRESSURE.implementation || report.protocolHash !== digest(protocol)
    || report.sourceRetrievedAt !== ledger.records.at(-1).sourceRetrievedAt) refuse('legacy_report_binding');
  const archive = path.join(current, relativeRoot, 'legacy-preserved', cycle);
  safeParents(archive);
  if (fs.existsSync(archive)) refuse('archive_exists');
  fs.mkdirSync(archive, { recursive: true });
  for (const [name, bytes] of [['report.json', reportBytes], ['shadow-ledger.json', ledgerBytes]]) saveNew(path.join(archive, name), bytes);
  return { archive, current, cycle, identity, startedAt, finishedAt, prior, cacheFile,
    previous, ledger, report, protocol, reportBytes, ledgerBytes };
}

// Standalone OLD stage: normal return means only that validated old files exist.
// No cache access, corrected target checks, receipt minting or shared manifest.
// A future workflow must upload exactly archive/report.json and
// archive/shadow-ledger.json, then authenticate that remote artifact separately.
export async function prepareLegacyPressureCycle(options) {
  const stage = await runLegacyStage(options);
  return { archive: stage.archive, cohort: FROZEN_PRESSURE.cohort,
    reportSha256: sha(stage.reportBytes), ledgerSha256: sha(stage.ledgerBytes),
    localContext: { identity: stage.identity, startedAt: stage.startedAt, finishedAt: stage.finishedAt,
      previousLedger: stage.prior, cacheFile: stage.cacheFile } };
}

// Creates a derived claim for the SECOND native upload, never an authority or
// receipt. A numeric artifact ID alone is not proof of remote persistence; only
// restorePersistedPressureCycle authenticates both native upload results.
export async function preparePressureSharedManifest({ legacyStage, legacyRoot, legacyArtifactId, targetImplementation }) {
  const env = process.env, identity = { runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT };
  const P = PRESSURE_PERSISTENCE_IDENTITY;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== P.repository
    || env.GITHUB_REPOSITORY_ID !== String(P.repositoryId) || env.GITHUB_REF !== 'refs/heads/main'
    || !/^\d+$/.test(identity.runId ?? '') || !/^\d+$/.test(identity.attempt ?? '')
    || !/^[1-9]\d*$/.test(legacyArtifactId ?? '') || !Number.isSafeInteger(Number(legacyArtifactId))
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || env.GITHUB_JOB !== 'research'
    || !env.RUNNER_NAME || legacyStage?.cohort !== FROZEN_PRESSURE.cohort
    || digest(legacyStage?.localContext?.identity) !== digest(identity)) refuse('manifest_stage_identity');
  const current = fs.realpathSync(process.cwd()), root = path.resolve(legacyRoot), cycle = `shared-${identity.runId}-${identity.attempt}`;
  if (fs.realpathSync(root) !== root || root === current || contained(root, current) || contained(current, root)) refuse('checkout_isolation');
  const archive = path.join(current, relativeRoot, 'legacy-preserved', cycle), context = legacyStage.localContext;
  const cacheFile = path.join(root, relativeRoot, cycle, 'source-cache.json');
  if (legacyStage.archive !== archive || context.cacheFile !== cacheFile
    || !contained(path.resolve(context.previousLedger), path.join(root, relativeRoot))) refuse('manifest_stage_paths');
  const checkout = (await execute('git', ['rev-parse', 'HEAD'], { cwd: current,
    env: { PATH: env.PATH }, timeout: 30000, maxBuffer: 1024 })).stdout.trim();
  if (checkout !== env.GITHUB_SHA) refuse('manifest_checkout');
  const files = [path.join(archive, 'report.json'), path.join(archive, 'shadow-ledger.json'), cacheFile, context.previousLedger];
  files.forEach(regular);
  const [reportBytes, ledgerBytes, cacheBytes, previousBytes] = files.map(file => fs.readFileSync(file));
  if (sha(reportBytes) !== legacyStage.reportSha256 || sha(ledgerBytes) !== legacyStage.ledgerSha256) refuse('manifest_old_bytes');
  const report = JSON.parse(reportBytes), ledger = JSON.parse(ledgerBytes), cache = JSON.parse(cacheBytes), previous = JSON.parse(previousBytes);
  const protocol = readJson(path.join(current, 'config/pressure-model-research.json')), now = new Date().toISOString();
  validateShadowLedger(previous, protocol, FROZEN_PRESSURE.implementation, now);
  validateShadowLedger(ledger, protocol, FROZEN_PRESSURE.implementation, now);
  const provenance = validateSharedCycle({ previous, ledger, cache, report, protocol, startedAt: context.startedAt, finishedAt: context.finishedAt, identity, targetImplementation });
  if (Date.parse(now) < Date.parse(context.finishedAt) || Date.parse(now) - Date.parse(context.startedAt) > 15 * 60000
    || now.slice(0, 10) !== provenance.evaluationDate) refuse('manifest_stage_time');
  const manifest = { schemaVersion: 'pressure-shared-persistence-v1', repositoryId: P.repositoryId,
    workflowId: P.workflowId, workflowPath: P.workflowPath, headSha: env.GITHUB_SHA, checkoutSha: checkout,
    runnerName: env.RUNNER_NAME, jobName: env.GITHUB_JOB, legacyArtifactId, ...provenance,
    cacheSha256: sha(cacheBytes), legacyReportSha256: sha(reportBytes), legacyLedgerSha256: sha(ledgerBytes) };
  const directory = path.join(current, relativeRoot, 'shared-evidence', cycle);
  safeParents(directory);
  if (fs.existsSync(directory)) refuse('evidence_exists');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'retrieval-receipt.json');
  saveNew(file, JSON.stringify(manifest, null, 2));
  return { file, manifest };
}

// Cross-step entry: only authenticated exact-ID remote evidence can mint here.
// Caller-provided local JSON never bypasses the readback. No source fetch occurs.
export async function restorePersistedPressureCycle({ legacyRoot, ...readbackOptions }) {
  const persisted = await readPersistedPressureArtifacts(readbackOptions);
  const { manifest, reportBytes, ledgerBytes } = persisted;
  const current = fs.realpathSync(process.cwd()), root = path.resolve(legacyRoot);
  if (fs.realpathSync(root) !== root || root === current || contained(root, current) || contained(current, root)) refuse('checkout_isolation');
  const cacheFile = path.join(root, relativeRoot, `shared-${manifest.runId}-${manifest.attempt}`, 'source-cache.json');
  regular(cacheFile);
  const cacheBytes = fs.readFileSync(cacheFile);
  if (sha(cacheBytes) !== manifest.cacheSha256) refuse('persisted_cache_digest');
  const cache = JSON.parse(cacheBytes), ledger = JSON.parse(ledgerBytes), report = JSON.parse(reportBytes);
  const protocol = readJson(path.join(current, 'config/pressure-model-research.json'));
  const now = new Date().toISOString();
  validateShadowLedger(ledger, protocol, FROZEN_PRESSURE.implementation, now);
  const previous = { ...ledger, records: ledger.records.slice(0, -1) };
  validateShadowLedger(previous, protocol, FROZEN_PRESSURE.implementation, now);
  const provenance = { ...validateSharedCycle({ previous, ledger, cache, report, protocol,
    startedAt: manifest.startedAt, finishedAt: manifest.finishedAt,
    identity: { runId: manifest.runId, attempt: manifest.attempt }, targetImplementation: readbackOptions.targetImplementation }),
    cacheSha256: sha(cacheBytes), legacyReportSha256: sha(reportBytes), legacyLedgerSha256: sha(ledgerBytes) };
  if (Object.entries(provenance).some(([key, value]) => manifest[key] !== value)) refuse('persisted_cycle_binding');
  // Authenticated readback may consume time; recheck at the actual mint boundary.
  if (Date.parse(now) < Date.parse(manifest.finishedAt) || Date.parse(now) - Date.parse(manifest.startedAt) > 15 * 60000
    || now.slice(0, 10) !== manifest.evaluationDate) refuse('persisted_cycle_time');
  const receipt = Object.freeze({});
  receipts.set(receipt, { cache: structuredClone(cache), provenance, root: current });
  return { receipt, provenance: structuredClone(provenance) };
}

export function consumeSharedPressureRetrieval(receipt, { protocol, implementation, output, previousLedger, now = new Date().toISOString() }) {
  const entry = receipts.get(receipt);
  if (!entry) refuse('invalid_or_consumed_receipt');
  receipts.delete(receipt); // Fail closed even when the subsequent validation fails.
  const { provenance } = entry;
  if (process.cwd() !== entry.root || process.env.GITHUB_RUN_ID !== provenance.runId || process.env.GITHUB_RUN_ATTEMPT !== provenance.attempt
    || implementation !== provenance.targetImplementation || digest(protocol) !== provenance.protocolHash
    || !Number.isFinite(Date.parse(now)) || Date.parse(now) < Date.parse(provenance.finishedAt)
    || Date.parse(now) - Date.parse(provenance.startedAt) > 15 * 60000 || now.slice(0, 10) !== provenance.evaluationDate) refuse('receipt_binding');
  const directory = path.join(entry.root, relativeRoot, `corrected-${provenance.runId}-${provenance.attempt}`);
  if (path.resolve(output ?? '') !== path.join(directory, 'report.json') || fs.existsSync(directory)) refuse('corrected_output');
  safeParents(directory);
  if (previousLedger) {
    const prior = path.resolve(previousLedger);
    if (!contained(prior, path.join(entry.root, relativeRoot)) || contained(prior, path.join(entry.root, relativeRoot, 'legacy-preserved'))) refuse('corrected_previous');
    regular(prior);
  }
  fs.mkdirSync(directory, { recursive: true });
  return { cache: structuredClone(entry.cache), provenance: structuredClone(provenance) };
}
