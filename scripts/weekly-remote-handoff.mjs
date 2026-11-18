#!/usr/bin/env node
// Persist accepted bytes on one immutable-by-convention branch per edition, then fetch and verify.
// Git uses existing authentication; this program never stores or adds credentials.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identity, saveOriginal, validateOriginal } from './weekly-original.mjs';
import { previousIssueKey, samePredecessor, validatePredecessor } from './weekly-issue-identity.mjs';

const productionRemote = 'https://github.com/ctmaomao/gfrr-auto-update-site.git';
const branchFor = date => `refs/heads/weekly-originals/${date}`;
function git(cwd, args, encoding = 'utf8') {
  try {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    delete env.GIT_SSL_NO_VERIFY;
    return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'http.followRedirects=false', '-c', 'http.sslVerify=true', ...args], { cwd, encoding, timeout: 60000, maxBuffer: 4 * 1024 * 1024,
      env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw new Error('Git operation failed or timed out; preserve the source and inspect the remote before retrying'); }
}
// Git resolves insteadOf, pushInsteadOf and pushurl when reporting effective URLs.
// Refuse an altered or multiple endpoint without printing it (it may contain credentials).
function assertRemoteEndpoints(cwd, expected) {
  const transport = git(cwd, ['config', '--get', '--default=', 'remote.origin.vcs']).trim();
  if (transport) throw new Error('Unexpected Git remote transport; refusing remote handoff');
  const fetchUrl = git(cwd, ['remote', 'get-url', '--all', 'origin']).trim();
  const pushUrl = git(cwd, ['remote', 'get-url', '--push', '--all', 'origin']).trim();
  if (fetchUrl !== expected || pushUrl !== expected) throw new Error('Unexpected Git fetch or push endpoint; refusing remote handoff');
  if (expected.startsWith('https://')) {
    const verify = git(cwd, ['config', '--get-urlmatch', 'http.sslVerify', expected]).trim().toLowerCase();
    const redirects = git(cwd, ['config', '--get-urlmatch', 'http.followRedirects', expected]).trim().toLowerCase();
    if (verify !== 'true' || redirects !== 'false') throw new Error('Unsafe effective Git HTTPS settings; refusing remote handoff');
  }
}
function remoteGit(cwd, remote, args) {
  assertRemoteEndpoints(cwd, remote);
  return git(cwd, args);
}
function freshRepo(remote) {
  const cwd = mkdtempSync(join(tmpdir(), 'gfrr-weekly-handoff-'));
  try {
    git(cwd, ['init', '--quiet']);
    git(cwd, ['remote', 'add', 'origin', remote]);
    assertRemoteEndpoints(cwd, remote);
    return cwd;
  } catch (error) { rmSync(cwd, { recursive: true, force: true }); throw error; }
}
function verifyCommit(cwd, date, sha, commit) {
  const issue = identity(date, sha);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid remote handoff commit');
  const storedIdentity = git(cwd, ['show', `${commit}:weekly-originals/${date}/identity.sha256`]);
  if (storedIdentity !== sha + '\n') throw new Error('Remote handoff issue or digest differs');
  const bytes = git(cwd, ['show', `${commit}:weekly-originals/${date}/${sha}.html`], null);
  validateOriginal(bytes, date, sha);
  const predecessor = issue.revision === 1 ? undefined : validatePredecessor(issue, sha,
    JSON.parse(git(cwd, ['show', `${commit}:weekly-originals/${date}/predecessor.json`])));
  return { date, sha256: sha, commit, bytes, ...(predecessor ? { predecessor } : {}) };
}
function readRevisionChain(cwd, date, sha, resolveCommit, verified = new Map()) {
  const cached = verified.get(date);
  if (cached) {
    if (cached.sha256 !== sha) throw new Error('Conflicting remote handoff digests for ' + date);
    return cached;
  }
  const issue = identity(date, sha);
  const receipt = verifyCommit(cwd, date, sha, resolveCommit(date));
  if (receipt.predecessor) {
    const prior = readRevisionChain(cwd, previousIssueKey(issue), receipt.predecessor.sha256, resolveCommit, verified);
    if (prior.commit !== receipt.predecessor.handoffCommit) throw new Error('Remote predecessor commit differs from pinned handoff');
  }
  verified.set(date, receipt);
  return receipt;
}
function fetchAndVerify(cwd, date, sha, remote) {
  return readRevisionChain(cwd, date, sha, key => {
    remoteGit(cwd, remote, ['fetch', '--no-tags', '--depth=1', 'origin', branchFor(key)]);
    return git(cwd, ['rev-parse', 'FETCH_HEAD']).trim();
  });
}
export function readRemoteHandoff({ date, sha }) {
  const remote = productionRemote;
  identity(date, sha);
  const cwd = freshRepo(remote);
  try { return fetchAndVerify(cwd, date, sha, remote); }
  finally { rmSync(cwd, { recursive: true, force: true }); }
}
// Fetch edition and predecessor refs in bounded batches; verify every issue from pinned commit bytes.
export function readRemoteHandoffs({ issues }) {
  const remote = productionRemote;
  if (!Array.isArray(issues) || !issues.length) throw new Error('Expected at least one issue');
  for (const { date, sha } of issues) identity(date, sha);
  if (new Set(issues.map(issue => issue.date)).size !== issues.length) throw new Error('Duplicate issue edition');
  const keys = new Set();
  for (const { date, sha } of issues) {
    const issue = identity(date, sha);
    keys.add(issue.date);
    for (let revision = 2; revision <= issue.revision; revision++) keys.add(`${issue.date}-r${revision}`);
  }
  const refs = [...keys];
  const cwd = freshRepo(remote);
  try {
    for (let index = 0; index < refs.length; index += 64) {
      const batch = refs.slice(index, index + 64);
      remoteGit(cwd, remote, ['fetch', '--no-tags', '--depth=1', 'origin', ...batch.map(key => `${branchFor(key)}:refs/weekly-verification/${key}`)]);
    }
    const verified = new Map();
    const resolveCommit = key => git(cwd, ['rev-parse', `refs/weekly-verification/${key}`]).trim();
    return issues.map(({date, sha}) => readRevisionChain(cwd, date, sha, resolveCommit, verified));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
export function persistRemoteHandoff({ source, date, sha, predecessor }) {
  const remote = productionRemote;
  const issue = identity(date, sha);
  const prior = validatePredecessor(issue, sha, predecessor);
  const bytes = readFileSync(source);
  validateOriginal(bytes, date, sha);
  const cwd = freshRepo(remote);
  try {
  const verifyReadback = () => {
    const receipt = fetchAndVerify(cwd, date, sha, remote);
    if (!receipt.bytes.equals(bytes) || !samePredecessor(receipt.predecessor, prior)) throw new Error('Remote handoff differs from accepted source or predecessor');
    return receipt;
  };
  if (prior && fetchAndVerify(cwd, previousIssueKey(issue), prior.sha256, remote).commit !== prior.handoffCommit) {
    throw new Error('Remote predecessor commit differs from pinned handoff');
  }
  const existing = remoteGit(cwd, remote, ['ls-remote', '--heads', 'origin', branchFor(date)]).trim();
  if (existing) return verifyReadback();
  remoteGit(cwd, remote, ['fetch', '--no-tags', '--depth=1', 'origin', 'refs/heads/main']);
  git(cwd, ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  const input = join(cwd, 'accepted-original.html');
  writeFileSync(input, bytes, { flag: 'wx' });
  saveOriginal({ root: cwd, source: input, date, sha, predecessor: prior });
  const originals = [`weekly-originals/${date}/identity.sha256`, `weekly-originals/${date}/${sha}.html`];
  // A root commit can only create the revision ref (or match identical existing bytes).
  // Even if another saver wins after ls-remote, this ordinary push cannot advance its ref.
  if (prior) {
    git(cwd, ['read-tree', '--empty']);
    originals.push(`weekly-originals/${date}/predecessor.json`);
  }
  git(cwd, ['add', '--', ...originals]);
  const author = ['-c', 'user.name=GFRR Weekly', '-c', 'user.email=weekly@users.noreply.github.com', '-c', 'commit.gpgsign=false'];
  let pushCommit = 'HEAD';
  if (prior) {
    const tree = git(cwd, ['write-tree']).trim();
    pushCommit = git(cwd, [...author, 'commit-tree', tree, '-m', `Archive weekly original ${date}`]).trim();
  } else {
    git(cwd, [...author, 'commit', '--quiet', '-m', `Archive weekly original ${date}`]);
  }
  // A failed or uncertain push is never retried blindly: inspect the branch and accept only the expected bytes.
  try { remoteGit(cwd, remote, ['push', 'origin', `${pushCommit}:${branchFor(date)}`]); }
  catch {
    try { return verifyReadback(); }
    catch { throw new Error('Handoff push failed or has an uncertain outcome; inspect the remote before retrying'); }
  }
  return verifyReadback();
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, date, sha, source, predecessorSha, predecessorCommit, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || !['save', 'verify'].includes(action) || (action === 'save' ? !source : source)) throw new Error('Usage: weekly-remote-handoff.mjs save ISSUE SHA256 SOURCE [PREDECESSOR_SHA PREDECESSOR_COMMIT] | verify ISSUE SHA256');
    const predecessor = predecessorSha === undefined && predecessorCommit === undefined ? undefined : { sha256: predecessorSha, handoffCommit: predecessorCommit };
    const result = action === 'save' ? persistRemoteHandoff({ source, date, sha, predecessor }) : readRemoteHandoff({ date, sha });
    console.log(JSON.stringify({ date: result.date, sha256: result.sha256, remote_commit: result.commit, remote_branch: branchFor(date),
      ...(result.predecessor ? { predecessor: result.predecessor } : {}) }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
