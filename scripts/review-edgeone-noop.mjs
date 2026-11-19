import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPagesArtifact } from './build-pages-artifact.mjs';
import { buildStagingDirectory, checkStagingDirectory } from './build-edgeone-release-artifact.mjs';

const SOURCE_REPO = 'ctmaomao/gfrr-auto-update-site';
const RELEASE_REPO = 'ctmaomao/gfrr-edgeone-release';
const SOURCE_URL = 'https://github.com/' + SOURCE_REPO + '.git';
const RELEASE_URL = 'https://github.com/' + RELEASE_REPO + '.git';
const MAIN = 'refs/heads/main';
const SHA = /^[a-f0-9]{40}$/u;
const checkout = resolve(fileURLToPath(new URL('..', import.meta.url)));

function runGit(cwd, ...args) {
  // Never reuse checkout credentials or filters. The probe is public read-only.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return execFileSync('git', ['-c', 'credential.helper=', '-c', 'http.followRedirects=false', '-c', 'core.attributesFile=' + devNull, ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
    env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  }).trim();
}

function mainRef(git, scratch, url) {
  const response = git(scratch, 'ls-remote', '--exit-code', '--heads', url, MAIN);
  const [sha, ref] = response.split('\t');
  if (!SHA.test(sha) || ref !== MAIN) throw new Error('unverified_ref');
  return sha;
}

/** Compare the exact Git release tree, not only file digests or a source revision. */
export function compareEdgeOneTree({ staging, scratch, sourceSha, sourceUrl = SOURCE_URL, releaseUrl = RELEASE_URL, git = runGit }) {
  if (!SHA.test(sourceSha)) return { reason: 'unverified_source' };
  try {
    git(scratch, 'init', '--bare', '--template=', '--object-format=sha1', '.');
    git(scratch, '--work-tree=' + resolve(staging), '-c', 'core.filemode=true', '-c', 'core.autocrlf=false', 'add', '--all', '--force', '--', '.');
    const stagedTree = git(scratch, 'write-tree');
    git(scratch, 'fetch', '--quiet', '--no-tags', '--depth=1', releaseUrl, MAIN);
    const releaseCommit = git(scratch, 'rev-parse', 'FETCH_HEAD^{commit}');
    const releaseTree = git(scratch, 'rev-parse', 'FETCH_HEAD^{tree}');
    if (![stagedTree, releaseCommit, releaseTree].every(value => SHA.test(value))) return { reason: 'unverified_tree' };
    if (stagedTree !== releaseTree) return { reason: 'tree_differs' };
    if (mainRef(git, scratch, sourceUrl) !== sourceSha || mainRef(git, scratch, releaseUrl) !== releaseCommit) {
      return { reason: 'ref_changed' };
    }
    return { reason: 'identical_release_tree', sourceSha, releaseCommit, releaseTree };
  } catch {
    return { reason: 'proof_unavailable' };
  }
}

export function isScheduledWorldOrderCompletion({ eventName, ref, repository, event }) {
  const run = event?.workflow_run;
  return eventName === 'workflow_run' && ref === MAIN && repository === SOURCE_REPO
    && event?.action === 'completed' && run?.status === 'completed' && run.conclusion === 'success'
    && run.event === 'schedule' && run.head_branch === 'main'
    && run.name === 'Refresh World Order Stress' && run.path === '.github/workflows/refresh-world-order-stress.yml'
    && [event.repository, run.repository, run.head_repository].every(repo => repo?.full_name === SOURCE_REPO);
}

export function isEdgeOneNoopTrigger(context) {
  return context.ref === MAIN && context.repository === SOURCE_REPO && context.releaseRepository === RELEASE_REPO
    && (context.eventName === 'schedule' || isScheduledWorldOrderCompletion(context));
}

function eventContext() {
  const { GITHUB_EVENT_NAME: eventName, GITHUB_REF: ref, GITHUB_REPOSITORY: repository,
    RELEASE_REPOSITORY: releaseRepository, GITHUB_EVENT_PATH: eventPath } = process.env;
  // GitHub supplies this file. Never use a workflow_run checkout or producer artifact.
  const event = eventName === 'workflow_run' ? JSON.parse(readFileSync(eventPath, 'utf8')) : undefined;
  return { eventName, ref, repository, releaseRepository, event };
}

function review() {
  if (!isEdgeOneNoopTrigger(eventContext())) return { reason: 'not_admitted' };
  const { scripts } = JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8'));
  if (scripts['build:pages-artifact'] !== 'node scripts/build-pages-artifact.mjs'
    || 'prebuild:pages-artifact' in scripts || 'postbuild:pages-artifact' in scripts) return { reason: 'build_entry_changed' };
  const sourceSha = process.env.SOURCE_SHA;
  if (!SHA.test(sourceSha) || runGit(checkout, 'rev-parse', 'HEAD') !== sourceSha
    || runGit(checkout, 'status', '--porcelain', '--untracked-files=no')) return { reason: 'unverified_source' };
  const scratch = mkdtempSync(join(tmpdir(), 'edgeone-noop-'));
  try {
    const artifactDir = join(scratch, 'pages');
    buildPagesArtifact(artifactDir);
    const staging = join(scratch, 'staging');
    buildStagingDirectory({ outDir: staging, artifactDir });
    if (!checkStagingDirectory({ stagingDir: staging, artifactDir }).ok
      || runGit(checkout, 'rev-parse', 'HEAD') !== sourceSha
      || runGit(checkout, 'status', '--porcelain', '--untracked-files=no')) return { reason: 'unverified_staging' };
    // Use a separate directory from staging: the bare repository must not enter the candidate tree.
    return compareEdgeOneTree({ staging, scratch: mkdtempSync(join(scratch, 'git-')), sourceSha });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--admit-world-order') {
    let admitted = false;
    try { admitted = isScheduledWorldOrderCompletion(eventContext()); }
    catch { /* Missing or unreadable trigger metadata cannot authorize publication. */ }
    if (admitted) appendFileSync(process.env.GITHUB_OUTPUT, 'admitted=true\n');
    else console.log('World Order completion not admitted.');
  } else {
    runProof();
  }
}

function runProof() {
  let result;
  try { result = review(); }
  catch { result = { reason: 'proof_unavailable' }; }
  console.log(JSON.stringify(result));
  if (result.reason === 'identical_release_tree') {
    const { sourceSha, releaseCommit, releaseTree } = result;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `EdgeOne no-op: source \`${sourceSha}\` exactly matched release repository commit \`${releaseCommit}\` (tree \`${releaseTree}\`). No release or full check was run; platform deployment was not verified.\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, 'identical=true\n');
  }
}
