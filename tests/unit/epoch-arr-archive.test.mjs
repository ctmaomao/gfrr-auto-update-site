import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { EPOCH_ARR_HEADERS } from '../../scripts/bubble-watch/epoch-arr-candidate.mjs';
import { buildEpochArrSnapshot } from '../../scripts/bubble-watch/epoch-arr-snapshot.mjs';
import { archiveEpochArrSnapshot as archive, compareArchivedEpochArrSnapshot as compare, epochArchiveDiagnostic, EPOCH_ARCHIVE_LIMITS } from '../../scripts/bubble-watch/epoch-arr-archive.mjs';

const make = (id = 'synthetic', notes = 'PRIVATE_NOTES') => {
  const record = { Id: id, Company: 'Anthropic', Date: '2026-07-31', Scope: 'Full company',
    'Annualized revenue (USD)': '65000000000.0', 'Annualized revenue type': 'Annualized run rate',
    Confidence: 'Likely', 'Report date': '2026-08-17', 'Source type': 'Company disclosure',
    'Source 1': 'https://example.org/PRIVATE_URL', Notes: notes };
  const csv = [EPOCH_ARR_HEADERS, EPOCH_ARR_HEADERS.map(key => record[key] || '')]
    .map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');
  return buildEpochArrSnapshot(csv, { asOfDate: '2026-09-08' }).snapshot;
};
function workspace(t) {
  const parent = resolve(tmpdir());
  const root = mkdtempSync(join(parent, 'gfrr-epoch-archive-test-'));
  t.after(() => {
    // Remove only the exact fresh test workspace, never user/project artifacts.
    assert.equal(dirname(resolve(root)), parent);
    assert.ok(resolve(root).startsWith(`${parent}${sep}gfrr-epoch-archive-test-`));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
const directory = root => join(root, 'manual-artifacts', 'epoch-arr-candidates', 'snapshots');
const options = root => ({ workspaceRoot: root, write: true });

// Faults are injected only into isolated child processes' Node builtins, not via
// a production writer option. Each child owns a temporary test workspace only.
function childWriter(root, snapshot, fault = '') {
  const moduleUrl = pathToFileURL(resolve('scripts/bubble-watch/epoch-arr-archive.mjs')).href;
  const source = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const realWrite = fs.writeFileSync, realFsync = fs.fsyncSync;
    if (${JSON.stringify(fault)} === 'write') fs.writeFileSync = (fd, bytes) => { realWrite(fd, bytes.subarray(0, 10)); throw new Error('injected write'); };
    if (${JSON.stringify(fault)} === 'link') fs.linkSync = () => { throw Object.assign(new Error('injected link'), { code: 'ENOTSUP' }); };
    if (${JSON.stringify(fault)} === 'crash') fs.fsyncSync = fd => { realFsync(fd); process.exit(77); };
    syncBuiltinESMExports();
    const { archiveEpochArrSnapshot, epochArchiveDiagnostic } = await import(${JSON.stringify(moduleUrl)});
    process.once('message', input => {
      try { process.stdout.write(JSON.stringify(archiveEpochArrSnapshot(input.snapshot, { workspaceRoot: input.root, write: true }))); }
      catch (error) { process.stdout.write(JSON.stringify({ code: epochArchiveDiagnostic(error) })); process.exitCode = 1; }
      process.disconnect();
    });
    process.send('ready');`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '', stderr = '';
  child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const ready = new Promise((accept, reject) => { child.once('message', accept); child.once('error', reject); child.once('exit', () => reject(new Error('child exited before ready'))); });
  const finished = new Promise((accept, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('child test timeout')); }, 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); accept({ code, output, stderr }); });
  });
  return { ready, finished, start: () => child.send({ root, snapshot }) };
}

test('real concurrent writers at capacity can publish at most one new snapshot', async t => {
  const root = workspace(t), dir = directory(root); mkdirSync(dir, { recursive: true });
  for (let i = 0; i < EPOCH_ARCHIVE_LIMITS.snapshots - 1; i++) writeFileSync(join(dir, `${i.toString(16).padStart(64, '0')}.json`), '{}');
  const writers = Array.from({ length: 4 }, (_, i) => childWriter(root, make(`parallel-${i}`)));
  await Promise.all(writers.map(writer => writer.ready)); writers.forEach(writer => writer.start());
  const outcomes = await Promise.all(writers.map(writer => writer.finished));
  assert.equal(outcomes.filter(result => result.code === 0).length, 1);
  for (const result of outcomes) {
    assert.equal(result.stderr, '');
    // Directory enumeration may encounter the other writer's pending entry
    // before its lock; either conservative refusal is valid, never a retry.
    if (result.code !== 0) assert.match(JSON.parse(result.output).code, /^archive_(busy|capacity|unexpected_entry)$/u);
  }
  assert.equal(readdirSync(dir).length, 128);
  assert.ok(readdirSync(dir).every(name => /^[a-f0-9]{64}\.json$/u.test(name)));
});

test('partial-write and unsupported-hardlink failures preserve prior files and remove only owned remnants', async t => {
  for (const fault of ['write', 'link']) {
    const root = workspace(t), old = make('old'), saved = archive(old, options(root));
    const before = readFileSync(join(root, saved.relativePath));
    const writer = childWriter(root, make('new'), fault); await writer.ready; writer.start();
    const result = await writer.finished;
    assert.equal(result.code, 1); assert.equal(result.stderr, ''); assert.equal(JSON.parse(result.output).code, 'archive_io_failed');
    assert.deepEqual(readdirSync(directory(root)), [`${old.fileHash}.json`]);
    assert.deepEqual(readFileSync(join(root, saved.relativePath)), before);
  }
});

test('actual process exit after fsync leaves a complete pending file and lock for reviewed recovery', async t => {
  const root = workspace(t), next = make(); const writer = childWriter(root, next, 'crash');
  await writer.ready; writer.start(); const result = await writer.finished;
  assert.equal(result.code, 77); assert.equal(result.stderr, '');
  const entries = readdirSync(directory(root)).sort();
  assert.equal(entries.length, 2); assert.ok(entries.includes('.lock'));
  const pending = entries.find(name => name.startsWith('.pending-'));
  const pendingBytes = readFileSync(join(directory(root), pending));
  assert.deepEqual(JSON.parse(pendingBytes), next);
  // Filesystem enumeration can see the pending entry before the lock. Both
  // existing diagnostics must refuse the write and preserve recovery evidence.
  assert.throws(() => archive(next, options(root)), /^Error: archive_(busy|unexpected_entry)$/u);
  assert.deepEqual(readdirSync(directory(root)).sort(), entries);
  assert.deepEqual(readFileSync(join(directory(root), pending)), pendingBytes);
  assert.ok(statSync(join(directory(root), '.lock')).isDirectory());
});

test('default dry-run validates and plans without even creating directories', t => {
  const root = workspace(t), result = archive(make(), { workspaceRoot: root });
  assert.equal(result.status, 'dry_run_would_archive');
  assert.deepEqual(readdirSync(root), []);
  assert.equal(result.networkCalls, 0); assert.equal(result.baselineUpdated, false);
  assert.ok(result.relativePath.startsWith('manual-artifacts/epoch-arr-candidates/snapshots/'));
});

test('write publishes hash-only complete JSON; duplicate and reordered input do not rewrite it', t => {
  const root = workspace(t), snapshot = make();
  const result = archive(snapshot, options(root));
  assert.equal(result.status, 'archived');
  const file = join(root, result.relativePath);
  const before = readFileSync(file), mtime = statSync(file).mtimeMs;
  assert.ok(!before.toString().includes('PRIVATE_'));
  assert.ok(!before.toString().includes('65000000000'));
  assert.ok(!before.toString().includes('2026-07-31'));
  assert.deepEqual(JSON.parse(before), snapshot);
  assert.equal(archive(snapshot, options(root)).status, 'already_archived');
  const reordered = structuredClone(snapshot);
  reordered.rows[0].fields = Object.fromEntries(Object.entries(reordered.rows[0].fields).reverse());
  assert.equal(archive(reordered, options(root)).status, 'already_archived');
  assert.deepEqual(readFileSync(file), before); assert.equal(statSync(file).mtimeMs, mtime);
  assert.deepEqual(readdirSync(directory(root)), [`${snapshot.fileHash}.json`]);
});

test('new revisions coexist; explicit prior hash compares without choosing or changing a baseline', t => {
  const root = workspace(t), old = make(), next = make('synthetic', 'correction');
  archive(old, options(root)); archive(next, options(root));
  assert.equal(readdirSync(directory(root)).length, 2);
  const result = compare(old.fileHash, next, { workspaceRoot: root });
  assert.equal(result.changes[0].kind, 'revision');
  assert.equal(result.changes[0].unprojectedEvidenceChanged, true);
  assert.equal(result.boundaries.baselineUpdated, false);
  assert.equal(compare(old.fileHash, old, { workspaceRoot: root }).status, 'unchanged_file');
});

test('forged same-file identity and corrupted existing bytes are preserved, never overwritten', t => {
  const root = workspace(t), snapshot = make();
  const path = join(directory(root), `${snapshot.fileHash}.json`);
  archive(snapshot, options(root));
  const changed = structuredClone(snapshot); changed.rows[0].fields.amounts = '0'.repeat(64);
  const original = readFileSync(path);
  assert.throws(() => archive(changed, options(root)), /archive_identity_conflict/u);
  assert.deepEqual(readFileSync(path), original);
  writeFileSync(path, 'PRIVATE_CORRUPT');
  assert.throws(() => archive(snapshot, options(root)), /archive_existing_invalid/u);
  assert.equal(readFileSync(path, 'utf8'), 'PRIVATE_CORRUPT');
});

test('unsafe paths, junctions, missing hashes and filenames cannot redirect archive writes', t => {
  const root = workspace(t), outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(root, 'manual-artifacts'), 'junction');
  assert.throws(() => archive(make(), options(root)), /archive_path_unsafe/u);
  assert.deepEqual(readdirSync(outside), []);
  assert.throws(() => archive(make(), { workspaceRoot: '../relative' }), /archive_root_invalid/u);
  for (const hash of ['../data/radar-data', '', null, 'A'.repeat(64)]) assert.throws(() => compare(hash, make(), { workspaceRoot: root }), /archive_hash_invalid/u);
  const empty = workspace(t);
  assert.throws(() => compare(make().fileHash, make(), { workspaceRoot: empty }), /archive_not_found/u);
});

test('invalid snapshot or write options cause no filesystem mutation', t => {
  const root = workspace(t), snapshot = make(); snapshot.productionEligible = true;
  assert.throws(() => archive(snapshot, options(root)), /snapshot_invalid/u);
  assert.throws(() => archive(make(), { workspaceRoot: root, write: 'true' }), /archive_options_invalid/u);
  assert.deepEqual(readdirSync(root), []);
});

test('busy lock, crash remnants and unexpected user files stop safely without cleanup', t => {
  for (const entry of ['.lock', '.pending-stale.json', 'user-note.txt']) {
    const root = workspace(t), dir = directory(root); mkdirSync(dir, { recursive: true });
    if (entry === '.lock') mkdirSync(join(dir, entry)); else writeFileSync(join(dir, entry), 'KEEP');
    assert.throws(() => archive(make(), options(root)), /archive_(busy|unexpected_entry)/u);
    assert.deepEqual(readdirSync(dir), [entry]);
  }
});

test('archive capacity is bounded, no automatic pruning, existing entries stay usable', t => {
  const root = workspace(t), dir = directory(root), snapshot = make();
  archive(snapshot, options(root));
  for (let i = 0; i < EPOCH_ARCHIVE_LIMITS.snapshots - 1; i += 1) {
    // Only inventory is exercised for these unrelated synthetic entries.
    writeFileSync(join(dir, `${i.toString(16).padStart(64, '0')}.json`), '{}');
  }
  assert.equal(archive(snapshot, options(root)).status, 'already_archived');
  assert.throws(() => archive(make('new'), options(root)), /archive_capacity/u);
  assert.equal(readdirSync(dir).length, EPOCH_ARCHIVE_LIMITS.snapshots);
});

test('bounded existing-file read and filename identity binding reject corrupt archives', t => {
  const root = workspace(t), snapshot = make(), result = archive(snapshot, options(root));
  const path = join(root, result.relativePath);
  writeFileSync(path, 'x'.repeat(EPOCH_ARCHIVE_LIMITS.bytes + 1));
  assert.throws(() => archive(snapshot, options(root)), /archive_byte_limit/u);
  writeFileSync(path, JSON.stringify(make('another')));
  assert.throws(() => compare(snapshot.fileHash, snapshot, { workspaceRoot: root }), /archive_identity_conflict/u);
});

test('CLI dry-run is offline and rejects raw reader reports, path, overwrite and network options', t => {
  // Run the real CLI in an isolated copy so user-owned ignored archives cannot
  // change test outcomes, and even a regression cannot write the real archive.
  const root = workspace(t);
  mkdirSync(join(root, 'scripts/bubble-watch'), { recursive: true });
  for (const file of ['scripts/archive-epoch-arr-candidate.mjs', ...['epoch-arr-archive', 'epoch-arr-snapshot', 'epoch-arr-candidate', 'observation-freshness'].map(name => `scripts/bubble-watch/${name}.mjs`)]) {
    cpSync(join(process.cwd(), file), join(root, file));
  }
  const cli = (input, args = []) => spawnSync(process.execPath, ['scripts/archive-epoch-arr-candidate.mjs', ...args],
    { cwd: root, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  const good = cli(make()); assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).status, 'dry_run_would_archive');
  assert.equal(existsSync(join(root, 'manual-artifacts/epoch-arr-candidates/snapshots', `${make().fileHash}.json`)), false);
  for (const [input, args] of [[{ snapshot: make(), report: 'PRIVATE_RAW' }, []], [make(), ['--output', 'data/PRIVATE.json']],
    [make(), ['--overwrite']], [make(), ['--allow-network']], ['PRIVATE_BAD_JSON', []], ['x'.repeat(2 * 1024 * 1024 + 1), []]]) {
    const result = cli(input, args); assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stderr, ''); assert.ok(!result.stdout.includes('PRIVATE'));
    assert.equal(JSON.parse(result.stdout).baselineUpdated, false);
  }
  assert.equal(epochArchiveDiagnostic(new Error('PRIVATE_PATH')), 'archive_io_failed');
});
