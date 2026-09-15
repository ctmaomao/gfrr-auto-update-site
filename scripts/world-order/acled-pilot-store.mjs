import { mkdir, lstat, realpath, readdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { PILOT, PilotStop, pilotTime, digest, pilotMetadata, inspectPilotSnapshot, runPilotCollection } from './acled-pilot.mjs';

const fail = reason => { throw new PilotStop(reason); };
export async function safeDirectory(parent, name, create = false) {
  const target = path.join(parent, name);
  if (create) try { await mkdir(target, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(target) !== target) fail('unsafe_directory');
  return target;
}
async function boundedRead(file, cap) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > cap) fail('unsafe_file');
  const text = await readFile(file, 'utf8'); if (Buffer.byteLength(text) > cap) fail('unsafe_file'); return text;
}
async function json(file) { try { return JSON.parse(await boundedRead(file, 65536)); } catch { fail('state_invalid'); } }
async function exists(file) { try { await lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function storageUsed(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) fail('unsafe_directory');
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await storageUsed(await safeDirectory(dir, entry.name));
    else if (entry.isFile()) total += (await lstat(file)).size;
    else fail('unsafe_file');
  }
  return total;
}
async function save(dir, name, text) {
  if (await exists(path.join(dir, name))) fail('artifact_exists');
  const pending = path.join(dir, `${name}.pending`);
  await writeFile(pending, text, { flag: 'wx', mode: 0o600 });
  await rename(pending, path.join(dir, name));
}
async function loadCandidate(dir, now) {
  const manifest = await json(path.join(dir, 'manifest.json'));
  const sampleJson = await boundedRead(path.join(dir, 'sample.private.json'), PILOT.bytes);
  const metadataJson = await boundedRead(path.join(dir, 'metadata.private.json'), 65536);
  const before = await boundedRead(path.join(dir, 'metadata-before.private.json'), 65536);
  if (manifest.sampleSha256 !== digest(sampleJson) || manifest.metadataSha256 !== digest(metadataJson)
    || manifest.metadataBeforeSha256 !== digest(before)) fail('artifact_hash');
  const snapshot = { sampleJson, metadataJson, fetchedAt: manifest.fetchedAt };
  const checked = inspectPilotSnapshot(snapshot, now);
  if (!checked.summary.observedCoverageComplete) fail('baseline_invalid');
  if (JSON.stringify(pilotMetadata(before, snapshot.fetchedAt).version) !== JSON.stringify(checked.meta.version)) fail('artifact_fence');
  return snapshot;
}
async function inspectState(dir, now) {
  if (!await exists(path.join(dir, 'pilot.json'))) {
    const entries = await readdir(dir);
    if (entries.some(name => name !== 'contact-source.json' && name !== '.lock')) fail('state_missing');
    return { state: null, slots: [], previous: null };
  }
  const state = await json(path.join(dir, 'pilot.json'));
  if (state.id !== PILOT.id || pilotTime(state.expiresAt) !== pilotTime(state.startedAt) + 4 * PILOT.intervalMs
    || pilotTime(state.startedAt) > pilotTime(now)) fail('state_invalid');
  const slots = []; let previous = null;
  for (let index = 0; index < PILOT.slots; index++) {
    const name = `slot-${index}`;
    if (!await exists(path.join(dir, name))) continue;
    const slot = await safeDirectory(dir, name), attempt = await json(path.join(slot, 'attempt.json'));
    const age = pilotTime(attempt.startedAt) - pilotTime(state.startedAt);
    if (attempt.slot !== index || attempt.id !== PILOT.id || Math.floor(age / PILOT.intervalMs) !== index
      || pilotTime(attempt.startedAt) > pilotTime(now)) fail('state_invalid');
    if (!await exists(path.join(slot, 'receipt.json'))) fail('incomplete_attempt');
    const receipt = await json(path.join(slot, 'receipt.json'));
    if (!Number.isInteger(receipt.requestCount) || receipt.requestCount < 0 || receipt.requestCount > 3
      || !Number.isFinite(receipt.totalBytes) || receipt.totalBytes < 0) fail('state_invalid');
    slots.push({ index, attempt, receipt });
    if (receipt.paused) fail('pilot_paused');
    if (receipt.status === 'candidate_ready') previous = await loadCandidate(slot, now);
  }
  return { state, slots, previous };
}
export async function pilotStoreStatus(dir, now = new Date().toISOString()) {
  if (!await exists(dir)) return { status: 'not_started', networkRequests: 0 };
  try {
    await safeDirectory(path.dirname(dir), path.basename(dir));
    if (await exists(path.join(dir, '.lock'))) return { status: 'locked', paused: true, networkRequests: 0 };
    const { state, slots } = await inspectState(dir, now);
    return { status: !state ? 'not_started' : pilotTime(now) >= pilotTime(state.expiresAt) || slots.length === 4 || slots.at(-1)?.index === 3 ? 'finished' : 'active',
      usedSlots: slots.length, startedAt: state?.startedAt ?? null, expiresAt: state?.expiresAt ?? null, networkRequests: 0 };
  } catch (e) { return { status: 'paused', reason: e instanceof PilotStop ? e.message : 'local_failure', networkRequests: 0 }; }
}
// root must be the canonical primary checkout, checked by the CLI before entry.
// One lock covers state-read through receipt-write. A crash leaves it in place;
// only an explicit reviewed recovery may remove that interrupted lock.
export async function executePilotSlot(root, contact, deps = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const startedAt = now(); pilotTime(startedAt);
  const artifacts = await safeDirectory(root, 'manual-artifacts', true);
  const dir = await safeDirectory(artifacts, PILOT.id, true);
  const lock = path.join(dir, '.lock'); await mkdir(lock, { mode: 0o700 });
  try {
    let { state, slots, previous } = await inspectState(dir, startedAt);
    if (state && pilotTime(startedAt) >= pilotTime(state.expiresAt)) return { status: 'finished', networkRequests: 0 };
    if (slots.length && pilotTime(startedAt) - pilotTime(slots.at(-1).attempt.startedAt) < PILOT.intervalMs) return { status: slots.at(-1).index === 3 ? 'finished' : 'not_due', networkRequests: 0 };
    const index = state ? Math.floor((pilotTime(startedAt) - pilotTime(state.startedAt)) / PILOT.intervalMs) : 0;
    if (index >= 4 || slots.some(slot => slot.index === index)) return { status: 'finished', networkRequests: 0 };
    if (await storageUsed(dir) + PILOT.reserveBytes > PILOT.storageBytes) fail('storage_budget');
    if (!state) {
      state = { id: PILOT.id, startedAt, expiresAt: new Date(pilotTime(startedAt) + 4 * PILOT.intervalMs).toISOString() };
      await save(dir, 'pilot.json', JSON.stringify(state));
    }
    const slot = path.join(dir, `slot-${index}`); await mkdir(slot, { mode: 0o700 });
    await save(slot, 'attempt.json', JSON.stringify({ id: PILOT.id, slot: index, startedAt,
      reservedRequests: PILOT.requests, reservedBytes: PILOT.bytes }));
    const result = await (deps.collect ?? runPilotCollection)(contact, previous, deps);
    if (result.snapshot) {
      const manifest = { fetchedAt: result.snapshot.fetchedAt, sampleSha256: digest(result.snapshot.sampleJson),
        metadataSha256: digest(result.snapshot.metadataJson), metadataBeforeSha256: digest(result.metadataBefore) };
      const files = { 'sample.private.json': result.snapshot.sampleJson, 'metadata.private.json': result.snapshot.metadataJson,
        'metadata-before.private.json': result.metadataBefore, 'manifest.json': JSON.stringify(manifest) };
      const bytes = Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
      if (bytes > PILOT.reserveBytes - 32768 || await storageUsed(dir) + bytes + 32768 > PILOT.storageBytes) fail('storage_budget');
      for (const [name, text] of Object.entries(files)) await save(slot, name, text);
    }
    const receipt = { ...result.report, slot: index, startedAt, expiresAt: state.expiresAt, finalSlot: index === 3 };
    const encoded = JSON.stringify(receipt); if (Buffer.byteLength(encoded) > 32768) fail('receipt_size');
    await save(slot, 'receipt.json', encoded);
    return receipt;
  } finally { await rmdir(lock); }
}
