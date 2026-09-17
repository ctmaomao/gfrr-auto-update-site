import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runAcledAutoUpdate, acledAutoContext } from '../../scripts/world-order/acled-auto-update.mjs';
import { acledWeekSlot, claimAcledSlot, dispatchAcledFollowup } from '../../scripts/world-order/acled-auto-github.mjs';
import { publishAcledPair } from '../../scripts/world-order/acled-pair-publication.mjs';
import { prepareAcledPairCommit } from '../../scripts/world-order/acled-pair-commit.mjs';
import { checkAcledRefreshReceipt, acledSourceMatches } from '../../scripts/world-order/acled-refresh-receipt.mjs';
import { isReviewedAcledAuthWorkflow, AUTO_WORKFLOW_PATH } from '../../scripts/acled-auth-workflow-policy.mjs';

const sha = v => createHash('sha256').update(v).digest('hex');
const paths = { weekly: 'config/world-order-acled-regional-weekly.json', monthly: 'config/world-order-acled-global-monthly.json' };
const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site',
  GITHUB_WORKFLOW_REF: 'ctmaomao/gfrr-auto-update-site/.github/workflows/acled-auto-update.yml@refs/heads/main',
  ACLED_DOWNLOAD_USERNAME: 'secret_username', ACLED_DOWNLOAD_PASSWORD: 'secret_password', GH_TOKEN: 'secret_token' };
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const pubHead = 'a'.repeat(40);
const runResponse = () => json({ workflow_run_id: 42, run_url: 'https://api.github.com/repos/ctmaomao/gfrr-auto-update-site/actions/runs/42',
  html_url: 'https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42' });
function fixture(t, automatic = false) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'gfrr-auto-test-'));
  t.after(() => { if (path.dirname(fs.realpathSync(root)) !== parent || !path.basename(root).startsWith('gfrr-auto-test-')) throw new Error('unsafe cleanup'); fs.rmSync(root, { recursive: true }); });
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, GIT_OPTIONAL_LOCKS: '0' } }).trim();
  git(['init', '-b', 'main']); git(['remote', 'add', 'origin', 'https://github.com/ctmaomao/gfrr-auto-update-site.git']);
  const code = ['check-world-order-acled-weekly.mjs', 'check-world-order-acled-monthly.mjs', 'world-order/acled-weekly-coverage.mjs',
    'world-order/acled-weekly-window.mjs', 'world-order/acled-freshness.mjs', 'world-order/acled-monthly-trend.mjs',
    'world-order/sanitize-acled-weekly.mjs', 'world-order/sanitize-acled-monthly.mjs'];
  for (const file of code.map(p => `scripts/${p}`).concat(Object.values(paths))) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.copyFileSync(file, path.join(root, file));
  }
  if (automatic) for (const file of Object.values(paths)) {
    const data = JSON.parse(fs.readFileSync(path.join(root, file))); data.preparedBy = 'github-actions-acled-auto';
    fs.writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`);
  }
  git(['-c', 'core.autocrlf=false', 'add', '.']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@localhost', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']);
  const head = git(['rev-parse', 'HEAD']); git(['update-ref', 'refs/remotes/origin/main', head]);
  const candidates = Object.fromEntries(Object.values(paths).map(file => [path.basename(file), JSON.parse(fs.readFileSync(path.join(root, file)))]));
  const calls = [], claims = new Set(); let prepared;
  const collect = async () => { calls.push('collect'); return { report: { status: 'authenticated_zip_batch_read', requestCount: 26,
    logout: 'confirmed', sessionMayRemain: false }, workbooks: [Buffer.from('private')] }; };
  const validate = () => { calls.push('validate'); return { report: { status: 'private_validation_passed', cleanupConfirmed: true }, candidates: structuredClone(candidates) }; };
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, 'manual'); assert.ok(options.signal); const body = JSON.parse(options.body);
    if (url.endsWith('/dispatches')) { calls.push('dispatch'); assert.equal(body.ref, 'main'); assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10'); return runResponse(); }
    assert.equal(url, 'https://api.github.com/graphql');
    if (body.query.startsWith('query($name:')) { calls.push('claim-query'); return json({ data: { repository: { id: 'R_test', ref: { target: { oid: head } }, claim: claims.has(body.variables.name) ? { id: 'claimed' } : null } } }); }
    if (body.query.includes('createRef')) {
      calls.push('claim'); const input = body.variables.input; assert.equal(input.oid, head); assert.equal(input.repositoryId, 'R_test');
      claims.add(input.name); return json({ data: { createRef: { ref: { prefix: 'refs/tags/', name: input.name.slice(10), target: { oid: head } } } } });
    }
    if (body.query.startsWith('query ')) { calls.push('publish-query'); return json({ data: { repository: { ref: { target: { oid: head } } } } }); }
    calls.push('publish'); assert.equal(body.variables.input.expectedHeadOid, head);
    assert.deepEqual(body.variables.input.fileChanges.additions.map(f => f.path), Object.values(paths));
    for (const f of body.variables.input.fileChanges.additions) assert.equal(JSON.parse(Buffer.from(f.contents, 'base64')).preparedBy, 'github-actions-acled-auto');
    return json({ data: { createCommitOnBranch: { commit: { oid: pubHead, tree: { oid: prepared.tree }, parents: { nodes: [{ oid: head }] } }, ref: { target: { oid: pubHead } } } } });
  };
  const publish = input => publishAcledPair({ ...input, prepare: v => { prepared = prepareAcledPairCommit(v); return prepared; } });
  return { root, git, head, candidates, calls, claims, fetchImpl, options: { execute: true, env, root, collect, validate, fetchImpl, publish } };
}

test('exact workflow, context and default CLI preserve zero source/GitHub operations', async () => {
  assert.equal(isReviewedAcledAuthWorkflow(AUTO_WORKFLOW_PATH, fs.readFileSync(AUTO_WORKFLOW_PATH, 'utf8')), true);
  assert.equal(acledAutoContext(env), true);
  for (const [k, v] of [['GITHUB_RUN_ATTEMPT', '2'], ['GITHUB_EVENT_NAME', 'pull_request'], ['GITHUB_REF', 'refs/heads/topic'], ['GITHUB_REPOSITORY', 'other/repo'], ['GITHUB_WORKFLOW_REF', 'wrong']]) assert.equal(acledAutoContext({ ...env, [k]: v }), false);
  let calls = 0; const r = await runAcledAutoUpdate({ fetchImpl: () => { calls++; } });
  assert.equal(r.status, 'dry_run'); assert.equal(calls, 0);
  for (const args of [[], ['--dry-run'], ['--live'], ['--live', '--retry']]) {
    const child = spawnSync(process.execPath, ['scripts/run-acled-auto-update.mjs', ...args], { encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
    assert.equal(JSON.parse(child.stdout).acledRequests, 0); assert.equal(child.status, args.includes('--live') ? 1 : 0);
  }
});

test('UTC Monday slots separate initial and weekly budgets, including year boundaries', () => {
  assert.equal(acledWeekSlot('2026-09-20T23:59:59Z'), '2026-09-14');
  assert.equal(acledWeekSlot('2026-09-21T00:00:00Z'), '2026-09-21');
  assert.equal(acledWeekSlot('2027-01-01T00:00:00Z'), '2026-12-28');
  assert.throws(() => acledWeekSlot('invalid'));
});

test('real strict preparation, paired publication and exact refresh receipt run in order; repeat consumes no source requests', async t => {
  const f = fixture(t), before = JSON.stringify(f.candidates);
  const r = await runAcledAutoUpdate(f.options);
  assert.equal(r.status, 'refresh_dispatched_site_pending', JSON.stringify(r));
  assert.equal(r.githubRequests, 5); assert.equal(r.acledRequests, 26); assert.equal(r.sitePublished, false);
  assert.equal(r.receipt.acled_config_commit, pubHead); assert.equal(r.refresh.runId, 42);
  assert.deepEqual(f.calls, ['claim-query', 'claim', 'collect', 'validate', 'publish-query', 'publish', 'dispatch']);
  assert.equal(f.git(['rev-parse', 'HEAD']), f.head); assert.equal(f.git(['status', '--porcelain']), '');
  assert.equal(JSON.stringify(f.candidates), before); assert.ok(!JSON.stringify(r).includes('secret_'));
  f.calls.length = 0; const again = await runAcledAutoUpdate(f.options);
  assert.equal(again.status, 'slot_unavailable'); assert.equal(again.acledRequests, 0); assert.deepEqual(f.calls, ['claim-query']);
  const weekly = await runAcledAutoUpdate({ ...f.options, env: { ...env, GITHUB_EVENT_NAME: 'schedule' }, now: new Date('2026-09-21T00:30:00Z') });
  assert.equal(weekly.status, 'refresh_dispatched_site_pending');
  assert.deepEqual([...f.claims].sort(), ['refs/tags/acled-auto-attempt-v1/2026-09-21', 'refs/tags/acled-auto-attempt-v1/initial']);
});

test('claim failure or lost mutation response stops before login, and invalid slots never request', async t => {
  const f = fixture(t); let calls = 0;
  const fetchImpl = async (url, options) => { calls++; if (calls === 1) return f.fetchImpl(url, options); throw new Error('secret_body'); };
  const r = await runAcledAutoUpdate({ ...f.options, fetchImpl });
  assert.equal(r.status, 'claim_unknown'); assert.equal(r.acledRequests, 0); assert.equal(calls, 2);
  assert.ok(!f.calls.includes('collect')); assert.ok(!JSON.stringify(r).includes('secret_body'));
  const invalid = await claimAcledSlot({ slot: '2026-09-22', expectedHead: f.head, token: env.GH_TOKEN, fetchImpl: () => { throw new Error('must not run'); } });
  assert.equal(invalid.requestCount, 0);
});

test('collection/logout and private cleanup failures never publish and preserve claimed slot', async t => {
  for (const mode of ['collection', 'logout', 'cleanup', 'throw']) {
    const f = fixture(t);
    const collect = async () => mode === 'throw' ? Promise.reject(new Error('secret_raw')) : { report: { requestCount: 26,
      status: mode === 'collection' ? 'stopped' : 'authenticated_zip_batch_read', logout: mode === 'logout' ? 'unconfirmed' : 'confirmed',
      sessionMayRemain: mode === 'logout' }, workbooks: [Buffer.from('private')] };
    const r = await runAcledAutoUpdate({ ...f.options, collect,
      validate: () => ({ report: { status: 'private_validation_passed', cleanupConfirmed: false }, candidates: f.candidates }) });
    assert.ok(['collection_failed', 'validation_failed'].includes(r.status)); assert.equal(r.configurationsPublished, false);
    assert.equal(f.claims.size, 1); assert.ok(!f.calls.includes('publish')); assert.ok(!JSON.stringify(r).includes('secret_raw'));
  }
});

test('unchanged automatic pair skips mutation and dispatch; unknown publication/dispatch never redownloads', async t => {
  const same = fixture(t, true); const noChange = await runAcledAutoUpdate(same.options);
  assert.equal(noChange.status, 'unchanged', JSON.stringify(noChange)); assert.equal(noChange.githubRequests, 3);
  assert.ok(!same.calls.includes('publish')); assert.ok(!same.calls.includes('dispatch'));
  const unknown = fixture(t);
  const r = await runAcledAutoUpdate({ ...unknown.options, publish: async () => { throw new Error('secret'); } });
  assert.equal(r.status, 'publication_unknown'); assert.equal(r.configurationsPublished, null); assert.equal(r.acledRequests, 26);
  const f = fixture(t);
  const dispatched = await runAcledAutoUpdate({ ...f.options, fetchImpl: async (url, options) => url.endsWith('/dispatches') ? new Response('secret', { status: 500 }) : f.fetchImpl(url, options) });
  assert.equal(dispatched.status, 'published_refresh_unknown'); assert.equal(dispatched.configurationsPublished, true);
  assert.equal(dispatched.acledRequests, 26); assert.equal(dispatched.githubRequests, 5);
});

test('followup allowlist and response identity hold, with no retry or arbitrary workflow', async () => {
  const bad = await dispatchAcledFollowup({ target: 'arbitrary', token: env.GH_TOKEN }); assert.equal(bad.requestCount, 0);
  for (const response of [new Response(null, { status: 204 }), json({ workflow_run_id: 42, run_url: 'https://evil.invalid', html_url: 'https://evil.invalid' }), new Response('secret')]) {
    let count = 0; const r = await dispatchAcledFollowup({ target: 'edgeone', token: env.GH_TOKEN, fetchImpl: async () => { count++; return response; } });
    assert.equal(count, 1); assert.equal(r.status, 'dispatch_unknown'); assert.ok(!JSON.stringify(r).includes('secret'));
  }
});

test('refresh receipt requires ancestor and exact pair bytes; projection checks preserve null/zero and metadata', t => {
  const f = fixture(t, true);
  const receipt = { acled_config_commit: f.head, acled_weekly_sha256: sha(fs.readFileSync(path.join(f.root, paths.weekly))),
    acled_monthly_sha256: sha(fs.readFileSync(path.join(f.root, paths.monthly))) };
  assert.equal(checkAcledRefreshReceipt({ root: f.root, receipt }), true);
  assert.equal(checkAcledRefreshReceipt({ root: f.root, receipt: { ...receipt, acled_config_commit: pubHead } }), false);
  fs.appendFileSync(path.join(f.root, paths.monthly), '\n');
  assert.equal(checkAcledRefreshReceipt({ root: f.root, receipt }), false);
  f.git(['-c', 'core.autocrlf=false', 'add', paths.monthly]);
  f.git(['-c', 'user.name=Test', '-c', 'user.email=test@localhost', '-c', 'commit.gpgsign=false', 'commit', '-m', 'later pair']);
  const unrelated = { ...receipt, acled_monthly_sha256: sha(fs.readFileSync(path.join(f.root, paths.monthly))) };
  assert.equal(checkAcledRefreshReceipt({ root: f.root, receipt: unrelated }), false, 'valid ancestor cannot attest later config bytes');
  const source = { enabled: true, status: 'ok', summary: { value: 0, latestWeek: '2026-09-05' }, evidence: [] };
  assert.equal(acledSourceMatches(source, structuredClone(source)), true);
  assert.equal(acledSourceMatches({ ...source, summary: { ...source.summary, value: null } }, source), false);
  assert.equal(acledSourceMatches({ ...source, status: 'partial' }, source), false);
});

test('refresh workflow keeps input hashes out of shell, verifies before/after and dispatches EdgeOne only after commit', () => {
  const source = fs.readFileSync('.github/workflows/refresh-world-order-stress.yml', 'utf8');
  assert.ok(source.indexOf('--before') < source.indexOf('npm run build:world-order'));
  assert.ok(source.indexOf('--after') < source.indexOf('git push'));
  assert.ok(source.indexOf('--edgeone') > source.indexOf('git push'));
  assert.match(source, /ACLED_CONFIG_COMMIT: \$\{\{ inputs\.acled_config_commit \}\}/u);
  assert.ok(!source.includes('secrets.ACLED_DOWNLOAD')); assert.ok(!source.includes('run: ${{ inputs.'));
});
