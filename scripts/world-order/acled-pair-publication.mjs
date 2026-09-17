import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareAcledPairCommit } from './acled-pair-commit.mjs';
import { controlRequest } from './acled-authenticated-probe.mjs';

const REPO = 'ctmaomao/gfrr-auto-update-site';
const URL = 'https://api.github.com/graphql';
const paths = { weekly: 'config/world-order-acled-regional-weekly.json', monthly: 'config/world-order-acled-global-monthly.json' };
const isOid = v => typeof v === 'string' && /^[a-f0-9]{40}$/u.test(v);
const HEAD_QUERY = 'query { repository(owner:"ctmaomao",name:"gfrr-auto-update-site") { ref(qualifiedName:"refs/heads/main") { target { oid } } } }';
const COMMIT_MUTATION = 'mutation($input:CreateCommitOnBranchInput!) { createCommitOnBranch(input:$input) { commit { oid tree { oid } parents(first:2) { nodes { oid } } } ref { target { oid } } } }';

// Explicitly authorized callers only; hashes attest bytes, not source rights.
// There is intentionally no CLI/workflow or automatic downloader in this module.
export async function publishAcledPair({ execute = false, publicationApproved = false, sourceUseApproved = false,
  token, fetchImpl = fetch, prepare = prepareAcledPairCommit, ...input } = {}) {
  const report = { status: 'dry_run', requestCount: 0, mutationAttempted: false,
    configurationsPublished: false, sitePublished: false, retryAllowed: false };
  if (execute !== true) return report;
  report.status = 'hold';
  try {
    if (publicationApproved !== true || sourceUseApproved !== true || !isOid(input.expectedHead)
      || typeof token !== 'string' || !/^[A-Za-z0-9_\.\-]{1,4096}$/u.test(token)
      || Object.keys(process.env).some(k => /^GIT_/iu.test(k) && k.toUpperCase() !== 'GIT_PAGER')) return report;
    input = { ...input, candidate: { ...input.candidate }, expectedBaselineSha256: { ...input.expectedBaselineSha256 },
      reviewedCandidateSha256: { ...input.reviewedCandidateSha256 } };
    if (Object.keys(input.candidate).sort().join('|') !== 'monthly|weekly'
      || Object.values(input.candidate).some(v => typeof v !== 'string' || Buffer.byteLength(v) > 1024 * 1024)) return report;
    const git = args => execFileSync('git', args, { cwd: input.root, timeout: 15000, maxBuffer: 65536,
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' } }).trim();
    if (git(['branch', '--show-current']) !== 'main'
      || git(['remote', 'get-url', 'origin']) !== `https://github.com/${REPO}.git`) return report;
    async function graphql(query, variables) {
      const body = JSON.stringify({ query, variables });
      if (Buffer.byteLength(body) > 3 * 1024 * 1024) throw new Error();
      report.requestCount++;
      const response = await controlRequest(URL, { method: 'POST', headers: { Authorization: `Bearer ${token}`,
        Accept: 'application/json', 'Content-Type': 'application/json' }, body }, fetchImpl, 15000);
      if (!response.ok || response.httpStatus !== 200
        || (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error();
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.bytes));
      if (value.errors !== undefined || !value.data) throw new Error();
      return value.data;
    }
    const remote = await graphql(HEAD_QUERY);
    if (remote.repository?.ref?.target?.oid !== input.expectedHead) { report.status = 'remote_changed_hold'; return report; }
    const prepared = prepare(input);
    if (prepared.status === 'unchanged') { report.status = 'unchanged'; return report; }
    if (prepared.status !== 'commit_prepared_not_published' || !prepared.cleanupConfirmed
      || prepared.parent !== input.expectedHead || !isOid(prepared.tree) || !isOid(prepared.commit)) return report;
    if (Object.keys(paths).some(kind => createHash('sha256').update(input.candidate[kind]).digest('hex') !== prepared.configSha256?.[kind])) return report;
    const additions = Object.entries(paths).map(([kind, file]) => ({ path: file, contents: Buffer.from(input.candidate[kind], 'utf8').toString('base64') }));
    const variables = { input: { branch: { repositoryNameWithOwner: REPO, branchName: 'main' },
      expectedHeadOid: input.expectedHead, message: { headline: 'chore(world-order): publish reviewed ACLED weekly/monthly pair' },
      fileChanges: { additions } } };
    // Beyond this point any error is potentially post-commit. Never retry a mutation
    // or claim unchanged production merely because its response was unavailable.
    report.mutationAttempted = true;
    report.status = 'publication_unknown'; report.configurationsPublished = null;
    const result = await graphql(COMMIT_MUTATION, variables);
    const commit = result.createCommitOnBranch?.commit;
    if (!isOid(commit?.oid) || commit.tree?.oid !== prepared.tree
      || commit.parents?.nodes?.length !== 1 || commit.parents.nodes[0].oid !== input.expectedHead
      || result.createCommitOnBranch.ref?.target?.oid !== commit.oid) return report;
    report.status = 'configurations_published_refresh_pending'; report.configurationsPublished = true;
    report.commit = commit.oid; report.parent = input.expectedHead; report.tree = prepared.tree;
    return report;
  } catch { return report; }
}
