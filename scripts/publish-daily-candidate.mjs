import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DAILY_OUTPUTS = Object.freeze(['data/radar-data.json', 'data/radar-history.json', 'data/radar-history-full.json']);
export const WORLD_ORDER_OUTPUTS = Object.freeze(['data/world-order-stress.json', 'data/gdelt-world-order-cache.json']);
export const BUBBLE_CREDIT_OUTPUTS = Object.freeze(['data/bubble-watch.json', 'data/bubble-market-observations.json']);
const DAILY = { outputs: DAILY_OUTPUTS, label: 'daily' };
const WORLD_ORDER = { outputs: WORLD_ORDER_OUTPUTS, label: 'world_order' };
const BUBBLE_CREDIT = { outputs: BUBBLE_CREDIT_OUTPUTS, label: 'bubble_credit', verifyReplayBlobs: true };
// Only documentation and tests are excluded from the generation-input guard.
// Every other path, including new scripts/configuration, requires a fresh reviewed
// candidate. Expand this exception only after independent dependency review.
export function safeConcurrentPath(path) {
  return path.startsWith('docs/') || path.startsWith('tests/');
}

// Read raw paths and both modes, not Git's display-quoted names. Disabling
// rename folding reports both paths; 000000 represents an absent entry.
function changedFiles(git, base, head) {
  const records = git(['diff', '--raw', '--no-renames', '-z', base, head, '--']).split('\0');
  const changes = [];
  for (let i = 0; i + 1 < records.length; i += 2) {
    const [before, after] = records[i].slice(1).split(' ');
    changes.push({ path: records[i + 1], before, after });
  }
  return changes;
}

const safeConcurrentModes = ({ before, after }) => [before, after].every(mode => ['000000', '100644', '100755'].includes(mode));

function inspectCandidate(git, { outputs, label }) {
  const candidate = git(['rev-parse', 'HEAD']);
  const parents = git(['rev-list', '--parents', '-n', '1', candidate]).split(' ');
  if (parents.length !== 2) throw new Error(`${label}_candidate_requires_single_parent`);
  const base = parents[1];
  const changed = changedFiles(git, base, candidate);
  if (!changed.length || changed.some(({ path }) => !outputs.includes(path))) throw new Error(`${label}_candidate_path_rejected`);
  for (const path of outputs) {
    if (!git(['ls-tree', candidate, '--', path]).startsWith('100644 blob ')) throw new Error(`${label}_candidate_file_rejected`);
  }
  return { candidate, base };
}

function linkInstalledDependencies(cwd, workspace) {
  const source = resolve(cwd, 'node_modules');
  if (!existsSync(source)) return;
  const target = join(workspace, 'node_modules');
  // Git's node_modules/ ignore rule only matches a real directory. A top-level
  // symlink would be treated as an untracked file by the documentation gate.
  mkdirSync(target);
  for (const name of readdirSync(source)) symlinkSync(join(source, name), join(target, name));
}

function publishCandidate({ outputs, label, verifyReplayBlobs = false }, { cwd = process.cwd(), validate, maxAttempts = 3, runGit } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error(`${label}_publish_attempt_limit`);
  const git = (args, directory = cwd) => (runGit ? runGit(args, directory) : execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
  const { candidate, base } = inspectCandidate(git, { outputs, label });
  let published = candidate;
  let workspace = cwd;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    git(['fetch', 'origin', 'refs/heads/main']);
    const remote = git(['rev-parse', 'FETCH_HEAD']);
    // An uncertain earlier push may already have succeeded. Do not duplicate it.
    try { git(['merge-base', '--is-ancestor', published, remote]); return { candidate, published, attempts: attempt, alreadyPublished: true }; } catch {}
    try { git(['merge-base', '--is-ancestor', base, remote]); } catch { throw new Error(`${label}_remote_history_diverged`); }
    if (remote !== base) {
      const concurrent = changedFiles(git, base, remote);
      if (concurrent.some(change => !safeConcurrentPath(change.path) || !safeConcurrentModes(change))) throw new Error(`${label}_generation_inputs_changed`);
      // Never reset/rebase the original candidate or force-push. Build a separate
      // reviewed tree on the current remote and preserve every concurrent file.
      workspace = join(mkdtempSync(join(tmpdir(), 'gfrr-daily-publish-')), 'worktree');
      git(['worktree', 'add', '--detach', workspace, remote]);
      git(['cherry-pick', candidate], workspace);
      const replay = verifyReplayBlobs ? git(['rev-parse', 'HEAD'], workspace) : null;
      linkInstalledDependencies(cwd, workspace);
      if (validate) validate(workspace);
      else execFileSync('npm', ['run', 'check:all'], { cwd: workspace, stdio: 'inherit' });
      if (git(['status', '--porcelain', '--untracked-files=no'], workspace)) throw new Error(`${label}_validation_changed_tracked_files`);
      published = git(['rev-parse', 'HEAD'], workspace);
      if (verifyReplayBlobs) {
        // Pin both original files, including an unchanged member of the pair.
        // Do not publish a replacement commit even if validation reports success.
        const checked = inspectCandidate(args => git(args, workspace), { outputs, label });
        if (checked.candidate !== replay || checked.base !== remote ||
          outputs.some(path => git(['ls-tree', candidate, '--', path]) !== git(['ls-tree', published, '--', path], workspace))) {
          throw new Error(`${label}_replay_identity_changed`);
        }
      }
    }
    try {
      git(['push', 'origin', `${published}:refs/heads/main`], workspace);
      return { candidate, published, attempts: attempt, alreadyPublished: false };
    } catch {
      // A bounded retry fetches and rechecks the original input identity. It never
      // reruns generation or assumes a transport failure means nothing was sent.
      if (attempt === maxAttempts) {
        let finalRemote;
        try { git(['fetch', 'origin', 'refs/heads/main']); finalRemote = git(['rev-parse', 'FETCH_HEAD']); }
        catch { throw new Error(`${label}_publish_outcome_unknown`); }
        try { git(['merge-base', '--is-ancestor', published, finalRemote]); return { candidate, published, attempts: attempt, alreadyPublished: true }; }
        catch (error) { if (error.status !== 1) throw new Error(`${label}_publish_outcome_unknown`); }
        throw new Error(`${label}_publish_retry_exhausted`);
      }
    }
  }
}

function retainCandidate({ outputs, label }, { cwd = process.cwd(), destination = join(cwd, label.replaceAll('_', '-') + '-candidate-artifact') } = {}) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const { candidate, base } = inspectCandidate(git, { outputs, label });
  const files = {};
  let bytes = 0;
  for (const path of outputs) {
    const size = Number(git(['cat-file', '-s', `${candidate}:${path}`]));
    bytes += size;
    if (!Number.isSafeInteger(size) || size < 0 || bytes > 5 * 1024 * 1024) throw new Error(`${label}_candidate_artifact_size_limit`);
    files[path] = execFileSync('git', ['show', `${candidate}:${path}`], { cwd, maxBuffer: 5 * 1024 * 1024 });
  }
  const receipt = { schemaVersion: 1, status: 'publication_not_confirmed', candidate, base, runId: process.env.GITHUB_RUN_ID || null, runAttempt: process.env.GITHUB_RUN_ATTEMPT || null, ...(label === 'daily' ? { realtimeInputCommit: process.env.GFRR_REALTIME_COMMIT_SHA || null } : {}), files: Object.fromEntries(Object.entries(files).map(([path, data]) => [path, { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }])) };
  // Create-only private staging: no upload unless every exact immutable blob and
  // receipt were written successfully. Never collect the mutable worktree.
  mkdirSync(destination);
  mkdirSync(join(destination, 'data'));
  for (const [path, data] of Object.entries(files)) writeFileSync(join(destination, path), data, { flag: 'wx' });
  writeFileSync(join(destination, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}

export const publishDailyCandidate = options => publishCandidate(DAILY, options);
export const retainDailyCandidate = options => retainCandidate(DAILY, options);
export const publishWorldOrderCandidate = options => publishCandidate(WORLD_ORDER, options);
export const retainWorldOrderCandidate = options => retainCandidate(WORLD_ORDER, options);
export const publishBubbleCreditCandidate = options => publishCandidate(BUBBLE_CREDIT, options);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--receipt' && process.argv.length === 3) retainDailyCandidate();
    else if (process.argv[2] === '--world-order' && process.argv.length === 3) console.log(JSON.stringify(publishWorldOrderCandidate()));
    else if (process.argv[2] === '--world-order-receipt' && process.argv.length === 3) retainWorldOrderCandidate();
    else if (process.argv[2] === '--bubble-credit' && process.argv.length === 3) console.log(JSON.stringify(publishBubbleCreditCandidate()));
    else if (process.argv.length === 2) console.log(JSON.stringify(publishDailyCandidate()));
    else throw new Error('daily_publish_argument_rejected');
  }
  catch (error) { console.error(/^(daily|world_order|bubble_credit)_/.test(error.message || '') ? error.message : 'daily_publish_failed'); process.exitCode = 1; }
}
