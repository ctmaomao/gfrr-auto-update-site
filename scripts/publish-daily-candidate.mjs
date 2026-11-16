import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DAILY_OUTPUTS = ['data/radar-data.json', 'data/radar-history.json', 'data/radar-history-full.json'];
// Only documentation and tests are excluded from the generation-input guard.
// Every other path, including new scripts/configuration, requires a fresh reviewed
// candidate. Expand this exception only after independent dependency review.
export function safeConcurrentPath(path) {
  return path.startsWith('docs/') || path.startsWith('tests/');
}

export function publishDailyCandidate({ cwd = process.cwd(), validate, maxAttempts = 3, runGit } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('daily_publish_attempt_limit');
  const git = (args, directory = cwd) => (runGit ? runGit(args, directory) : execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
  const candidate = git(['rev-parse', 'HEAD']);
  const parents = git(['rev-list', '--parents', '-n', '1', candidate]).split(' ');
  if (parents.length !== 2) throw new Error('daily_candidate_requires_single_parent');
  const base = parents[1];
  const changed = git(['diff', '--name-only', base, candidate]).split('\n').filter(Boolean);
  if (!changed.length || changed.some(path => !DAILY_OUTPUTS.includes(path))) throw new Error('daily_candidate_path_rejected');
  for (const path of DAILY_OUTPUTS) {
    if (!git(['ls-tree', candidate, '--', path]).startsWith('100644 blob ')) throw new Error('daily_candidate_file_rejected');
  }
  let published = candidate;
  let workspace = cwd;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    git(['fetch', 'origin', 'refs/heads/main']);
    const remote = git(['rev-parse', 'FETCH_HEAD']);
    // An uncertain earlier push may already have succeeded. Do not duplicate it.
    try { git(['merge-base', '--is-ancestor', published, remote]); return { candidate, published, attempts: attempt, alreadyPublished: true }; } catch {}
    try { git(['merge-base', '--is-ancestor', base, remote]); } catch { throw new Error('daily_remote_history_diverged'); }
    if (remote !== base) {
      const concurrent = git(['diff', '--name-only', base, remote]).split('\n').filter(Boolean);
      if (concurrent.some(path => !safeConcurrentPath(path) || !['', '100644', '100755'].includes(git(['ls-tree', remote, '--', path]).split(' ')[0]))) throw new Error('daily_generation_inputs_changed');
      // Never reset/rebase the original candidate or force-push. Build a separate
      // reviewed tree on the current remote and preserve every concurrent file.
      workspace = join(mkdtempSync(join(tmpdir(), 'gfrr-daily-publish-')), 'worktree');
      git(['worktree', 'add', '--detach', workspace, remote]);
      git(['cherry-pick', candidate], workspace);
      if (existsSync(join(cwd, 'node_modules'))) symlinkSync(resolve(cwd, 'node_modules'), join(workspace, 'node_modules'), 'dir');
      if (validate) validate(workspace);
      else execFileSync('npm', ['run', 'check:all'], { cwd: workspace, stdio: 'inherit' });
      if (git(['status', '--porcelain', '--untracked-files=no'], workspace)) throw new Error('daily_validation_changed_tracked_files');
      published = git(['rev-parse', 'HEAD'], workspace);
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
        catch { throw new Error('daily_publish_outcome_unknown'); }
        try { git(['merge-base', '--is-ancestor', published, finalRemote]); return { candidate, published, attempts: attempt, alreadyPublished: true }; }
        catch (error) { if (error.status !== 1) throw new Error('daily_publish_outcome_unknown'); }
        throw new Error('daily_publish_retry_exhausted');
      }
    }
  }
}

export function retainDailyCandidate({ cwd = process.cwd(), destination = join(cwd, 'daily-candidate-artifact') } = {}) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const candidate = git(['rev-parse', 'HEAD']);
  const parents = git(['rev-list', '--parents', '-n', '1', candidate]).split(' ');
  if (parents.length !== 2) throw new Error('daily_candidate_requires_single_parent');
  const base = parents[1];
  const changed = git(['diff', '--name-only', base, candidate]).split('\n').filter(Boolean);
  if (!changed.length || changed.some(path => !DAILY_OUTPUTS.includes(path))) throw new Error('daily_candidate_path_rejected');
  const files = {};
  let bytes = 0;
  for (const path of DAILY_OUTPUTS) {
    if (!git(['ls-tree', candidate, '--', path]).startsWith('100644 blob ')) throw new Error('daily_candidate_file_rejected');
    const size = Number(git(['cat-file', '-s', `${candidate}:${path}`]));
    bytes += size;
    if (!Number.isSafeInteger(size) || size < 0 || bytes > 5 * 1024 * 1024) throw new Error('daily_candidate_artifact_size_limit');
    files[path] = execFileSync('git', ['show', `${candidate}:${path}`], { cwd, maxBuffer: 5 * 1024 * 1024 });
  }
  const receipt = { schemaVersion: 1, status: 'publication_not_confirmed', candidate, base, runId: process.env.GITHUB_RUN_ID || null, runAttempt: process.env.GITHUB_RUN_ATTEMPT || null, realtimeInputCommit: process.env.GFRR_REALTIME_COMMIT_SHA || null, files: Object.fromEntries(Object.entries(files).map(([path, data]) => [path, { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }])) };
  // Create-only private staging: no upload unless every exact immutable blob and
  // receipt were written successfully. Never collect the mutable worktree.
  mkdirSync(destination);
  mkdirSync(join(destination, 'data'));
  for (const [path, data] of Object.entries(files)) writeFileSync(join(destination, path), data, { flag: 'wx' });
  writeFileSync(join(destination, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--receipt' && process.argv.length === 3) retainDailyCandidate();
    else if (process.argv.length === 2) console.log(JSON.stringify(publishDailyCandidate()));
    else throw new Error('daily_publish_argument_rejected');
  }
  catch (error) { console.error(error.message?.startsWith('daily_') ? error.message : 'daily_publish_failed'); process.exitCode = 1; }
}
