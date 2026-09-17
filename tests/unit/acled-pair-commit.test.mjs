import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { prepareAcledPairCommit } from '../../scripts/world-order/acled-pair-commit.mjs';
import { acquireAcledPublishLock } from '../../scripts/world-order/acled-prepare-main.mjs';

const files = { weekly: 'config/world-order-acled-regional-weekly.json', monthly: 'config/world-order-acled-global-monthly.json' };
const code = ['check-world-order-acled-weekly.mjs', 'check-world-order-acled-monthly.mjs',
  'world-order/acled-weekly-coverage.mjs', 'world-order/acled-weekly-window.mjs', 'world-order/acled-freshness.mjs',
  'world-order/acled-monthly-trend.mjs', 'world-order/sanitize-acled-weekly.mjs', 'world-order/sanitize-acled-monthly.mjs'];
const sha = v => createHash('sha256').update(v).digest('hex');
const originalExec = cp.execFileSync;
const git = (root, args, opts = {}) => originalExec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@localhost', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'gfrr-pair-test-'));
  t.after(() => { assert.equal(path.dirname(root), parent); assert.equal(fs.realpathSync(root), root); assert.ok(path.basename(root).startsWith('gfrr-pair-test-')); fs.rmSync(root, { recursive: true }); });
  git(root, ['init', '-b', 'main']);
  for (const file of code.map(p => `scripts/${p}`).concat(Object.values(files))) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.copyFileSync(file, path.join(root, file));
  }
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'preserve me\n');
  git(root, ['-c', 'core.autocrlf=false', 'add', '.']); git(root, ['commit', '-m', 'fixture']);
  const expectedHead = git(root, ['rev-parse', 'HEAD']); git(root, ['update-ref', 'refs/remotes/origin/main', expectedHead]);
  const baseline = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, originalExec('git', ['show', `${expectedHead}:${f}`], { cwd: root, encoding: 'utf8' })]));
  const candidate = Object.fromEntries(Object.entries(baseline).map(([k, text]) => {
    const v = JSON.parse(text); v.quality.confidence = 0.81; return [k, JSON.stringify(v, null, 2) + '\n'];
  }));
  const input = { root, expectedHead, candidate, expectedBaselineSha256: Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, sha(v)])),
    reviewedCandidateSha256: Object.fromEntries(Object.entries(candidate).map(([k, v]) => [k, sha(v)])) };
  return { input, root, baseline, index: fs.readFileSync(path.join(root, '.git/index')) };
}
function preserved(f) {
  assert.equal(git(f.root, ['rev-parse', 'HEAD']), f.input.expectedHead);
  assert.equal(git(f.root, ['status', '--porcelain']), '');
  // Read-only production calls must not refresh or replace the user's index.
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.git/index')), f.index);
  for (const [kind, file] of Object.entries(files)) assert.equal(sha(fs.readFileSync(path.join(f.root, file))), sha(fs.readFileSync(file)));
}
function intercept(t, fn) {
  cp.execFileSync = fn; syncBuiltinESMExports();
  t.after(() => { cp.execFileSync = originalExec; syncBuiltinESMExports(); });
}

test('real Git commit contains the complete pair, exact reviewed bytes and only allowed diffs; no ref changes', t => {
  const f = fixture(t), r = prepareAcledPairCommit(f.input);
  assert.equal(r.status, 'commit_prepared_not_published', JSON.stringify(r));
  assert.equal(git(f.root, ['rev-parse', `${r.commit}^`]), f.input.expectedHead);
  assert.deepEqual(git(f.root, ['diff-tree', '--no-commit-id', '--name-only', '-r', r.commit]).split('\n').sort(), Object.values(files).sort());
  for (const [kind, file] of Object.entries(files)) assert.equal(sha(originalExec('git', ['show', `${r.commit}:${file}`], { cwd: f.root })), f.input.reviewedCandidateSha256[kind]);
  assert.equal(r.refsUpdated, false); assert.equal(r.productionWritten, false); assert.equal(r.cleanupConfirmed, true);
  preserved(f);
});

test('one changed track still carries both candidates; semantic no-op creates no objects', t => {
  const f = fixture(t); f.input.candidate.monthly = f.baseline.monthly; f.input.reviewedCandidateSha256.monthly = sha(f.baseline.monthly);
  const r = prepareAcledPairCommit(f.input); assert.equal(r.status, 'commit_prepared_not_published');
  assert.equal(git(f.root, ['diff-tree', '--no-commit-id', '--name-only', '-r', r.commit]), files.weekly);
  f.input.candidate.weekly = f.baseline.weekly; f.input.reviewedCandidateSha256.weekly = sha(f.baseline.weekly);
  const noop = prepareAcledPairCommit(f.input); assert.equal(noop.status, 'unchanged'); assert.equal(noop.objectsMayRemain, false); preserved(f);
});

test('mismatched head, baseline or candidate pins stop without changing files', t => {
  const f = fixture(t);
  for (const field of ['expectedHead', 'expectedBaselineSha256', 'reviewedCandidateSha256']) {
    const input = structuredClone(f.input);
    if (field === 'expectedHead') input[field] = '0'.repeat(40); else input[field].weekly = '0'.repeat(64);
    const r = prepareAcledPairCommit(input); assert.equal(r.status, 'hold'); assert.equal(r.objectsMayRemain, false);
  }
  preserved(f);
});

test('strict second-track validator failure rejects the pair, never emits a partial commit', t => {
  const f = fixture(t), v = JSON.parse(f.input.candidate.monthly); v.global.fatalitiesLatestFullYear = -1;
  f.input.candidate.monthly = JSON.stringify(v); f.input.reviewedCandidateSha256.monthly = sha(f.input.candidate.monthly);
  const r = prepareAcledPairCommit(f.input); assert.equal(r.status, 'hold'); assert.equal(r.commit, undefined); assert.equal(r.objectsMayRemain, false); preserved(f);
});

test('common-directory lock contention does not remove another invocation lock', t => {
  const f = fixture(t), release = acquireAcledPublishLock(f.root);
  try { assert.equal(prepareAcledPairCommit(f.input).status, 'hold'); assert.ok(fs.existsSync(path.join(f.root, '.git/acled-publish-auto.lock'))); }
  finally { release(); } preserved(f);
});

test('Git environment overrides are rejected before acquiring lock', t => {
  const f = fixture(t), old = process.env.GIT_INDEX_FILE;
  process.env.GIT_INDEX_FILE = path.join(f.root, 'foreign-index');
  try { assert.equal(prepareAcledPairCommit(f.input).status, 'hold'); assert.ok(!fs.existsSync(process.env.GIT_INDEX_FILE)); }
  finally { if (old === undefined) delete process.env.GIT_INDEX_FILE; else process.env.GIT_INDEX_FILE = old; }
  preserved(f);
});

test('concurrent HEAD advance after object creation revokes the result and preserves the concurrent commit', t => {
  const f = fixture(t); let advanced;
  intercept(t, (file, args, options) => {
    const result = originalExec(file, args, options);
    if (file === 'git' && args.includes('commit-tree')) {
      git(f.root, ['commit', '--allow-empty', '-m', 'concurrent']); advanced = git(f.root, ['rev-parse', 'HEAD']);
    }
    return result;
  });
  const r = prepareAcledPairCommit(f.input); assert.equal(r.status, 'hold'); assert.equal(r.commit, undefined);
  assert.equal(git(f.root, ['rev-parse', 'HEAD']), advanced); assert.notEqual(advanced, f.input.expectedHead);
});

test('concurrent staged change remains untouched and blocks return', t => {
  const f = fixture(t);
  intercept(t, (file, args, options) => {
    const result = originalExec(file, args, options);
    if (file === 'git' && args.includes('commit-tree')) {
      fs.writeFileSync(path.join(f.root, 'unrelated.txt'), 'concurrent staged edit\n'); git(f.root, ['add', 'unrelated.txt']);
    }
    return result;
  });
  const r = prepareAcledPairCommit(f.input); assert.equal(r.status, 'hold'); assert.equal(r.commit, undefined);
  assert.equal(git(f.root, ['diff', '--cached', '--name-only']), 'unrelated.txt');
  assert.equal(fs.readFileSync(path.join(f.root, 'unrelated.txt'), 'utf8'), 'concurrent staged edit\n');
});

test('cleanup failure revokes a prepared commit and preserves recovery location', t => {
  const f = fixture(t), originalRemove = fs.rmSync; let retained;
  fs.rmSync = (target, options) => { if (path.basename(target).startsWith('gfrr-acled-pair-')) { retained = target; throw new Error('secret'); } return originalRemove(target, options); };
  try {
    const r = prepareAcledPairCommit(f.input); assert.equal(r.status, 'hold'); assert.equal(r.reason, 'cleanup_failed');
    assert.equal(r.cleanupConfirmed, false); assert.equal(r.commit, undefined); assert.ok(!JSON.stringify(r).includes('secret')); preserved(f);
  } finally {
    fs.rmSync = originalRemove;
    if (retained) { assert.equal(path.dirname(retained), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(retained).startsWith('gfrr-acled-pair-')); originalRemove(retained, { recursive: true }); }
  }
});

test('unavailable temporary directory returns sanitized hold without throwing', t => {
  const f = fixture(t), previous = os.tmpdir;
  os.tmpdir = () => path.join(f.root, 'missing-private-secret-directory');
  try {
    const result = prepareAcledPairCommit(f.input);
    assert.equal(result.status, 'hold'); assert.ok(!JSON.stringify(result).includes('secret')); preserved(f);
  } finally { os.tmpdir = previous; }
});
