import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { acquireAcledPublishLock } from './acled-prepare-main.mjs';
import { reviewAcledConfigPair } from './acled-config-review.mjs';

const paths = { weekly: 'config/world-order-acled-regional-weekly.json', monthly: 'config/world-order-acled-global-monthly.json' };
const sha = value => createHash('sha256').update(value).digest('hex');
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const pin = value => value && Object.keys(value).sort().join('|') === 'monthly|weekly'
  && Object.values(value).every(v => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v));
const fail = () => { throw new Error('pair_commit_hold'); };

// Only local object preparation; deliberately no CLI, ref update, push or dispatch.
// The local tracking ref is NOT evidence of remote freshness or source permission.
export function prepareAcledPairCommit({ root, expectedHead, expectedBaselineSha256, reviewedCandidateSha256, candidate } = {}) {
  const report = { status: 'hold', reason: 'pair_commit_hold', productionWritten: false,
    refsUpdated: false, networkRequests: 0, objectsMayRemain: false, cleanupConfirmed: true };
  let release, directory, parent, stage = 'pair_commit_hold';
  try {
    parent = fs.realpathSync(os.tmpdir());
    // The reused lock helper also runs Git; reject overrides before acquiring it.
    // GIT_PAGER is a harmless desktop default; it is not forwarded to our Git
    // commands. All other overrides fail closed before the legacy lock helper.
    if (Object.keys(process.env).some(k => /^GIT_/iu.test(k) && k.toUpperCase() !== 'GIT_PAGER')) fail();
    if (!oid(expectedHead) || !pin(expectedBaselineSha256) || !pin(reviewedCandidateSha256)
      || !candidate || Object.keys(candidate).sort().join('|') !== 'monthly|weekly') fail();
    root = fs.realpathSync(root);
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' };
    const git = (args, options = {}) => execFileSync('git', args, { cwd: root, env, timeout: 30000,
      maxBuffer: 40 * 1024 * 1024, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...options });
    release = acquireAcledPublishLock(root);
    const indexFile = path.resolve(root, git(['rev-parse', '--git-path', 'index']).trim());
    const indexHash = () => fs.existsSync(indexFile) ? sha(fs.readFileSync(indexFile)) : null;
    const originalIndexHash = indexHash();
    const assertContext = () => {
      if (git(['rev-parse', 'HEAD']).trim() !== expectedHead
        || git(['rev-parse', 'refs/remotes/origin/main']).trim() !== expectedHead
        || git(['status', '--porcelain', '--untracked-files=all']) || indexHash() !== originalIndexHash) fail();
      for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG']) {
        if (fs.existsSync(path.resolve(root, git(['rev-parse', '--git-path', marker]).trim()))) fail();
      }
    };
    assertContext();
    const baseline = {};
    for (const [kind, file] of Object.entries(paths)) {
      if (!git(['ls-tree', expectedHead, '--', file]).startsWith('100644 blob ')) fail();
      baseline[kind] = git(['show', `${expectedHead}:${file}`]);
      if (typeof candidate[kind] !== 'string' || sha(candidate[kind]) !== reviewedCandidateSha256[kind]) fail();
    }
    // Snapshot strings before any checker executes; callers cannot change the pair later.
    candidate = { weekly: candidate.weekly, monthly: candidate.monthly };
    const comparison = reviewAcledConfigPair({ baseline, candidate, expectedBaselineSha256 });
    if (!['unchanged', 'review_required'].includes(comparison.status)) fail();
    if (comparison.status === 'unchanged') {
      assertContext(); report.status = 'unchanged'; delete report.reason; return report;
    }
    directory = fs.mkdtempSync(path.join(parent, 'gfrr-acled-pair-'));
    fs.chmodSync(directory, 0o700);
    stage = 'snapshot_failed';

    // Snapshot ALL tracked checker scan surfaces at the pinned commit, not just
    // validator dependencies. cat-file avoids local clean/smudge filters entirely.
    const listing = git(['ls-tree', '-rl', expectedHead, '--', 'scripts', 'workers', 'tools', '.github/workflows', 'index.html', 'bubble-watch.html']);
    const entries = listing.trim().split('\n').filter(Boolean).map(line => {
      const m = /^(100644|100755) blob ([a-f0-9]{40})\s+(\d+)\t([A-Za-z0-9_. /-]+)$/u.exec(line);
      if (!m || m[4].split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(m[4])) fail();
      return { hash: m[2], size: Number(m[3]), file: m[4] };
    });
    if (!entries.length || entries.length > 3000 || entries.some(e => e.size > 2 * 1024 * 1024)
      || entries.reduce((n, e) => n + e.size, 0) > 32 * 1024 * 1024) fail();
    const content = git(['cat-file', '--batch'], { input: entries.map(e => e.hash).join('\n') + '\n', encoding: null });
    let offset = 0;
    for (const entry of entries) {
      const end = content.indexOf(10, offset);
      if (end < offset || content.subarray(offset, end).toString() !== `${entry.hash} blob ${entry.size}`) fail();
      offset = end + 1;
      const bytes = content.subarray(offset, offset + entry.size);
      if (bytes.length !== entry.size || content[offset + entry.size] !== 10) fail();
      offset += entry.size + 1;
      const target = path.join(directory, entry.file);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
    }
    if (offset !== content.length) fail();
    fs.mkdirSync(path.join(directory, 'config'));
    for (const [kind, file] of Object.entries(paths)) fs.writeFileSync(path.join(directory, file), candidate[kind], { flag: 'wx', mode: 0o600 });
    for (const kind of Object.keys(paths)) {
      stage = `${kind}_validation_failed`;
      execFileSync(process.execPath, [path.join(directory, `scripts/check-world-order-acled-${kind}.mjs`)], {
        cwd: directory, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    stage = 'commit_preparation_failed';
    // Validators must have examined exactly the bytes that will become the blobs.
    for (const [kind, file] of Object.entries(paths)) if (sha(fs.readFileSync(path.join(directory, file))) !== reviewedCandidateSha256[kind]) fail();
    assertContext();
    const indexEnv = { ...env, GIT_INDEX_FILE: path.join(directory, 'private-index') };
    git(['read-tree', expectedHead], { env: indexEnv });
    report.objectsMayRemain = true;
    const blobs = {};
    for (const [kind, file] of Object.entries(paths)) {
      blobs[kind] = git(['hash-object', '-w', '--stdin'], { input: candidate[kind] }).trim();
      if (!oid(blobs[kind])) fail();
      git(['update-index', '--add', '--cacheinfo', `100644,${blobs[kind]},${file}`], { env: indexEnv });
    }
    const tree = git(['write-tree'], { env: indexEnv }).trim();
    if (!oid(tree)) fail();
    const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', expectedHead, tree]).trim().split('\n').filter(Boolean);
    if (!changed.length || changed.some(file => !Object.values(paths).includes(file))) fail();
    for (const [kind, file] of Object.entries(paths)) if (sha(git(['show', `${tree}:${file}`], { encoding: null })) !== reviewedCandidateSha256[kind]) fail();
    const commit = git(['-c', 'user.name=GFRR ACLED candidate', '-c', 'user.email=acled-candidate@localhost',
      '-c', 'commit.gpgsign=false', 'commit-tree', tree, '-p', expectedHead], {
      input: 'chore(world-order): prepare reviewed ACLED weekly and monthly pair\n' }).trim();
    if (!oid(commit) || git(['rev-parse', `${commit}^`]).trim() !== expectedHead
      || git(['rev-parse', `${commit}^{tree}`]).trim() !== tree) fail();
    assertContext();
    report.status = 'commit_prepared_not_published'; delete report.reason;
    report.commit = commit; report.parent = expectedHead; report.tree = tree;
    report.configSha256 = { ...reviewedCandidateSha256 };
  } catch {
    report.status = 'hold'; report.reason = stage;
    delete report.commit; delete report.parent; delete report.tree; delete report.configSha256;
  } finally {
    try {
      if (directory) {
        if (path.dirname(directory) !== parent || !path.basename(directory).startsWith('gfrr-acled-pair-') || fs.realpathSync(directory) !== directory) fail();
        fs.rmSync(directory, { recursive: true });
      }
    } catch { report.cleanupConfirmed = false; }
    try { release?.(); } catch { report.cleanupConfirmed = false; }
    if (!report.cleanupConfirmed) {
      report.status = 'hold'; report.reason = 'cleanup_failed';
      delete report.commit; delete report.parent; delete report.tree; delete report.configSha256;
    }
  }
  return report;
}
