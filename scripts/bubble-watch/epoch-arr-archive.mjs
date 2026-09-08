import { closeSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareEpochArrSnapshots, validateEpochArrSnapshot } from './epoch-arr-snapshot.mjs';

const WORKSPACE = fileURLToPath(new URL('../../', import.meta.url));
const SEGMENTS = ['manual-artifacts', 'epoch-arr-candidates', 'snapshots'];
export const EPOCH_ARCHIVE_LIMITS = Object.freeze({ snapshots: 128, bytes: 2 * 1024 * 1024 });
const bad = code => { throw new Error(code); };
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function stat(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// workspaceRoot is a trusted integration/test argument, never taken from stdin
// or CLI options. This is not a sandbox against concurrent hostile OS mutation.
function archiveDirectory(workspaceRoot, create = false) {
  if (typeof workspaceRoot !== 'string' || !isAbsolute(workspaceRoot)) bad('archive_root_invalid');
  let cursor = resolve(workspaceRoot);
  const root = stat(cursor);
  if (!root?.isDirectory() || root.isSymbolicLink() || !samePath(realpathSync(cursor), cursor)) bad('archive_path_unsafe');
  for (const segment of SEGMENTS) {
    cursor = join(cursor, segment);
    let entry = stat(cursor);
    if (!entry && create) { mkdirSync(cursor); entry = stat(cursor); }
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink() || !samePath(realpathSync(cursor), cursor))) bad('archive_path_unsafe');
  }
  return cursor;
}

function canonical(snapshot) {
  const checked = validateEpochArrSnapshot(snapshot);
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
  checked.rows.sort((a, b) => a.rowHash.localeCompare(b.rowHash));
  const bytes = Buffer.from(`${JSON.stringify(sort(checked))}\n`, 'utf8');
  if (bytes.length > EPOCH_ARCHIVE_LIMITS.bytes) bad('archive_byte_limit');
  return { snapshot: checked, bytes };
}

function inventory(directory, ownLock = false) {
  if (!stat(directory)) return 0;
  const handle = opendirSync(directory); let count = 0;
  try {
    for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
      if (ownLock && entry.name === '.lock' && entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name === '.lock') bad('archive_busy');
      if (!/^[a-f0-9]{64}\.json$/u.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) bad('archive_unexpected_entry');
      count += 1;
      if (count > EPOCH_ARCHIVE_LIMITS.snapshots) bad('archive_capacity');
    }
  } finally { handle.closeSync(); }
  return count;
}

function readSnapshot(path) {
  const info = stat(path);
  if (!info) bad('archive_not_found');
  if (!info?.isFile() || info.isSymbolicLink()) bad('archive_file_unsafe');
  const fd = openSync(path, 'r');
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) bad('archive_file_unsafe');
    if (opened.size > EPOCH_ARCHIVE_LIMITS.bytes) bad('archive_byte_limit');
    const buffer = Buffer.alloc(EPOCH_ARCHIVE_LIMITS.bytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = readSync(fd, buffer, size, buffer.length - size, null);
      if (!read) break;
      size += read;
    }
    if (size > EPOCH_ARCHIVE_LIMITS.bytes) bad('archive_byte_limit');
    try { return canonical(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size)))); }
    catch { bad('archive_existing_invalid'); }
  } finally { closeSync(fd); }
}

export function archiveEpochArrSnapshot(input, { write = false, workspaceRoot = WORKSPACE } = {}) {
  if (typeof write !== 'boolean') bad('archive_options_invalid');
  const { snapshot, bytes } = canonical(input);
  let directory = archiveDirectory(workspaceRoot);
  inventory(directory);
  const target = join(directory, `${snapshot.fileHash}.json`);
  const result = status => ({ status, fileHash: snapshot.fileHash,
    relativePath: [...SEGMENTS, `${snapshot.fileHash}.json`].join('/'),
    productionEligible: false, baselineUpdated: false, networkCalls: 0 });
  const checkExisting = () => {
    if (!stat(target)) return false;
    const existing = readSnapshot(target);
    if (!existing.bytes.equals(bytes)) bad('archive_identity_conflict');
    return true;
  };
  if (checkExisting()) return result('already_archived');
  if (inventory(directory) >= EPOCH_ARCHIVE_LIMITS.snapshots) bad('archive_capacity');
  if (!write) return result('dry_run_would_archive');

  directory = archiveDirectory(workspaceRoot, true);
  const lock = join(directory, '.lock');
  try { mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') bad('archive_busy'); throw error; }
  let temporary = null;
  try {
    archiveDirectory(workspaceRoot);
    const count = inventory(directory, true);
    if (checkExisting()) return result('already_archived');
    if (count >= EPOCH_ARCHIVE_LIMITS.snapshots) bad('archive_capacity');
    const pendingPath = join(directory, `.pending-${randomUUID()}.json`);
    const fd = openSync(pendingPath, 'wx', 0o600);
    temporary = pendingPath;
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    archiveDirectory(workspaceRoot);
    // Publish a fully written inode without overwriting a destination. If hard
    // links are unsupported, fail rather than fall back to a clobbering write.
    try { linkSync(temporary, target); }
    catch (error) { if (error.code === 'EEXIST' && checkExisting()) return result('already_archived'); throw error; }
    return result('archived');
  } finally {
    // Only this invocation's newly created temporary file and empty lock are
    // removed. A crash can leave them behind; later runs stop for owner review.
    if (temporary) unlinkSync(temporary);
    rmdirSync(lock);
  }
}

export function compareArchivedEpochArrSnapshot(previousHash, currentInput, { workspaceRoot = WORKSPACE } = {}) {
  if (typeof previousHash !== 'string' || !/^[a-f0-9]{64}$/u.test(previousHash)) bad('archive_hash_invalid');
  const { snapshot } = canonical(currentInput);
  const directory = archiveDirectory(workspaceRoot);
  inventory(directory);
  const previous = readSnapshot(join(directory, `${previousHash}.json`)).snapshot;
  if (previous.fileHash !== previousHash) bad('archive_identity_conflict');
  return compareEpochArrSnapshots(previous, snapshot);
}

export function epochArchiveDiagnostic(error) {
  const codes = new Set(['archive_root_invalid', 'archive_path_unsafe', 'archive_busy', 'archive_unexpected_entry', 'archive_capacity',
    'archive_byte_limit', 'archive_file_unsafe', 'archive_existing_invalid', 'archive_options_invalid', 'archive_identity_conflict',
    'archive_hash_invalid', 'archive_not_found', 'snapshot_invalid', 'snapshot_identity_conflict']);
  return codes.has(error?.message) ? error.message : 'archive_io_failed';
}
