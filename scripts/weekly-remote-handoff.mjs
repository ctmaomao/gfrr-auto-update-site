#!/usr/bin/env node
// Persist accepted bytes on one immutable-by-convention branch per date, then fetch and verify.
// Git uses existing authentication; this program never stores or adds credentials.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identity, saveOriginal, validateOriginal } from './weekly-original.mjs';

const productionRemote = 'https://github.com/ctmaomao/gfrr-auto-update-site.git';
const branchFor = date => `refs/heads/weekly-originals/${date}`;
function git(cwd, args, encoding = 'utf8') {
  try {
    return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding, timeout: 60000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw new Error('Git operation failed or timed out; preserve the source and inspect the remote before retrying'); }
}
function freshRepo(remote) {
  const cwd = mkdtempSync(join(tmpdir(), 'gfrr-weekly-handoff-'));
  try {
    git(cwd, ['init', '--quiet']);
    git(cwd, ['remote', 'add', 'origin', remote]);
    return cwd;
  } catch (error) { rmSync(cwd, { recursive: true, force: true }); throw error; }
}
function fetchAndVerify(cwd, date, sha) {
  identity(date, sha);
  git(cwd, ['fetch', '--no-tags', '--depth=1', 'origin', branchFor(date)]);
  const commit = git(cwd, ['rev-parse', 'FETCH_HEAD']).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid remote handoff commit');
  const storedIdentity = git(cwd, ['show', `${commit}:weekly-originals/${date}/identity.sha256`]);
  if (storedIdentity !== sha + '\n') throw new Error('Remote handoff issue or digest differs');
  const bytes = git(cwd, ['show', `${commit}:weekly-originals/${date}/${sha}.html`], null);
  validateOriginal(bytes, date, sha);
  return { date, sha256: sha, commit, bytes };
}
export function readRemoteHandoff({ date, sha, remote = productionRemote }) {
  identity(date, sha);
  const cwd = freshRepo(remote);
  try { return fetchAndVerify(cwd, date, sha); }
  finally { rmSync(cwd, { recursive: true, force: true }); }
}
// Fetch dated handoff refs in bounded batches; verify every issue from immutable commit bytes.
export function readRemoteHandoffs({ issues, remote = productionRemote }) {
  if (!Array.isArray(issues) || !issues.length) throw new Error('Expected at least one issue');
  for (const { date, sha } of issues) identity(date, sha);
  if (new Set(issues.map(issue => issue.date)).size !== issues.length) throw new Error('Duplicate issue date');
  const cwd = freshRepo(remote);
  try {
    for (let index = 0; index < issues.length; index += 64) {
      const batch = issues.slice(index, index + 64);
      git(cwd, ['fetch', '--no-tags', '--depth=1', 'origin', ...batch.map(({date}) => `${branchFor(date)}:refs/weekly-verification/${date}`)]);
    }
    return issues.map(({date, sha}) => {
      const commit = git(cwd, ['rev-parse', `refs/weekly-verification/${date}`]).trim();
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid remote handoff commit');
      const stored = git(cwd, ['show', `${commit}:weekly-originals/${date}/identity.sha256`]);
      if (stored !== sha + '\n') throw new Error('Remote handoff issue or digest differs');
      const bytes = git(cwd, ['show', `${commit}:weekly-originals/${date}/${sha}.html`], null);
      validateOriginal(bytes, date, sha);
      return { date, sha256: sha, commit, bytes };
    });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
export function persistRemoteHandoff({ source, date, sha, remote = productionRemote }) {
  identity(date, sha);
  const bytes = readFileSync(source);
  validateOriginal(bytes, date, sha);
  const cwd = freshRepo(remote);
  try {
  const existing = git(cwd, ['ls-remote', '--heads', 'origin', branchFor(date)]).trim();
  if (existing) {
    const receipt = fetchAndVerify(cwd, date, sha);
    if (!receipt.bytes.equals(bytes)) throw new Error('Remote handoff differs from accepted source');
    return receipt;
  }
  git(cwd, ['fetch', '--no-tags', '--depth=1', 'origin', 'refs/heads/main']);
  git(cwd, ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  const input = join(cwd, 'accepted-original.html');
  writeFileSync(input, bytes, { flag: 'wx' });
  saveOriginal({ root: cwd, source: input, date, sha });
  git(cwd, ['add', '--', `weekly-originals/${date}/identity.sha256`, `weekly-originals/${date}/${sha}.html`]);
  git(cwd, ['-c', 'user.name=GFRR Weekly', '-c', 'user.email=weekly@users.noreply.github.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', `Archive weekly original ${date}`]);
  // A failed or uncertain push is never retried blindly: inspect the branch and accept only the expected bytes.
  try { git(cwd, ['push', 'origin', `HEAD:${branchFor(date)}`]); }
  catch {
    try { return fetchAndVerify(cwd, date, sha); }
    catch { throw new Error('Handoff push failed or has an uncertain outcome; inspect the remote before retrying'); }
  }
  const receipt = fetchAndVerify(cwd, date, sha);
  if (!receipt.bytes.equals(bytes)) throw new Error('Remote readback differs from accepted source');
  return receipt;
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, date, sha, source, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || !['save', 'verify'].includes(action) || (action === 'save' ? !source : source)) throw new Error('Usage: weekly-remote-handoff.mjs save DATE SHA256 SOURCE | verify DATE SHA256');
    const result = action === 'save' ? persistRemoteHandoff({ source, date, sha }) : readRemoteHandoff({ date, sha });
    console.log(JSON.stringify({ date: result.date, sha256: result.sha256, remote_commit: result.commit, remote_branch: branchFor(date) }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
