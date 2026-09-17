import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { publishAcledPair } from '../../scripts/world-order/acled-pair-publication.mjs';
import { prepareAcledPairCommit } from '../../scripts/world-order/acled-pair-commit.mjs';
const sha = v => createHash('sha256').update(v).digest('hex');
const json = v => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
const old = 'a'.repeat(40), tree = 'b'.repeat(40), local = 'c'.repeat(40), remote = 'd'.repeat(40);
function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'gfrr-publication-test-'));
  t.after(() => { assert.equal(path.dirname(root), parent); assert.equal(fs.realpathSync(root), root); assert.ok(path.basename(root).startsWith('gfrr-publication-test-')); fs.rmSync(root, { recursive: true }); });
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  git(['init', '-b', 'main']); git(['remote', 'add', 'origin', 'https://github.com/ctmaomao/gfrr-auto-update-site.git']);
  const candidate = { weekly: '{"private":"weekly"}\r\n', monthly: '{"private":"monthly"}\n' };
  const configSha256 = Object.fromEntries(Object.entries(candidate).map(([k, v]) => [k, sha(v)]));
  const prepared = { status: 'commit_prepared_not_published', cleanupConfirmed: true, commit: local, parent: old, tree, configSha256 };
  return { root, git, prepared, input: { root, execute: true, publicationApproved: true, sourceUseApproved: true,
    token: 'secret_test_token', expectedHead: old, candidate, reviewedCandidateSha256: configSha256,
    expectedBaselineSha256: configSha256, prepare: () => prepared } };
}
function success(p) { return { data: { createCommitOnBranch: { commit: { oid: remote, tree: { oid: p.tree }, parents: { nodes: [{ oid: p.parent }] } }, ref: { target: { oid: remote } } } } }; }

test('default and missing explicit approvals perform no requests or preparation', async () => {
  for (const input of [{}, { execute: true }, { execute: true, publicationApproved: true }]) {
    const r = await publishAcledPair({ ...input, fetchImpl: () => assert.fail('network'), prepare: () => assert.fail('prepare') });
    assert.equal(r.requestCount, 0); assert.equal(r.mutationAttempted, false);
  }
});

test('CAS mutation pins parent, sends exact two reviewed byte strings, and verifies full tree rather than local commit id', async t => {
  const f = fixture(t), requests = [];
  const r = await publishAcledPair({ ...f.input, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.github.com/graphql'); assert.equal(options.redirect, 'manual');
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) return json({ data: { repository: { ref: { target: { oid: old } } } } });
    const input = requests[1].variables.input;
    assert.deepEqual(input.branch, { repositoryNameWithOwner: 'ctmaomao/gfrr-auto-update-site', branchName: 'main' });
    assert.equal(input.expectedHeadOid, old); assert.deepEqual(Object.keys(input.fileChanges), ['additions']);
    assert.equal(input.fileChanges.additions.length, 2);
    for (const [i, kind] of ['weekly', 'monthly'].entries()) {
      assert.equal(Buffer.from(input.fileChanges.additions[i].contents, 'base64').toString(), f.input.candidate[kind]);
      assert.match(input.fileChanges.additions[i].path, /^config\/world-order-acled-(regional-weekly|global-monthly)\.json$/);
    }
    return json(success(f.prepared));
  } });
  assert.equal(r.status, 'configurations_published_refresh_pending'); assert.equal(r.commit, remote);
  assert.equal(r.sitePublished, false); assert.equal(r.requestCount, 2); assert.equal(r.retryAllowed, false);
  assert.ok(!JSON.stringify(r).includes('secret')); assert.ok(!JSON.stringify(r).includes('private'));
});

test('remote change, wrong origin and preparation failure never send mutation', async t => {
  const f = fixture(t);
  for (const mode of ['remote_changed', 'validation_failed', 'no_change', 'wrong_tree_bytes']) {
    let calls = 0;
    const r = await publishAcledPair({ ...f.input, prepare: () => mode === 'validation_failed' ? { status: 'hold' }
      : mode === 'no_change' ? { status: 'unchanged' } : { ...f.prepared, configSha256: {} },
    fetchImpl: async () => { calls++; return json({ data: { repository: { ref: { target: { oid: mode === 'remote_changed' ? remote : old } } } } }); } });
    assert.equal(calls, 1); assert.equal(r.mutationAttempted, false);
  }
  f.git(['remote', 'set-url', 'origin', 'https://example.com/untrusted.git']);
  assert.equal((await publishAcledPair({ ...f.input, fetchImpl: () => assert.fail('network') })).requestCount, 0);
});

test('caller mutation during the remote read cannot replace the reviewed snapshot', async t => {
  const f = fixture(t), original = structuredClone(f.input.candidate); let calls = 0;
  const originalPins = structuredClone(f.input.reviewedCandidateSha256);
  const r = await publishAcledPair({ ...f.input, prepare: input => {
    assert.deepEqual(input.candidate, original); assert.deepEqual(input.reviewedCandidateSha256, originalPins);
    return f.prepared;
  }, fetchImpl: async (_url, options) => {
    if (++calls === 1) {
      f.input.candidate.weekly = 'unreviewed'; f.input.reviewedCandidateSha256.weekly = sha('unreviewed');
      f.input.expectedBaselineSha256.monthly = '0'.repeat(64);
      await Promise.resolve();
      return json({ data: { repository: { ref: { target: { oid: old } } } } });
    }
    const addition = JSON.parse(options.body).variables.input.fileChanges.additions[0];
    assert.equal(Buffer.from(addition.contents, 'base64').toString(), original.weekly);
    return json(success({ ...f.prepared, configSha256: originalPins }));
  } });
  // The injected preparation receipt shares caller pins and was changed too: fail
  // closed before mutation rather than transmit mismatched preparation evidence.
  assert.equal(r.status, 'hold'); assert.equal(r.mutationAttempted, false); assert.equal(calls, 1);
});

test('all ambiguous mutation failures withhold publication confirmation and never retry', async t => {
  const f = fixture(t);
  const cases = [() => { throw new Error('secret token'); }, () => new Response('secret', { status: 409 }),
    () => json({ errors: [{ message: 'secret conflict' }] }), () => json({ ...success(f.prepared), errors: [] }),
    () => new Response('secret malformed'), () => new Response(' '.repeat(65537)),
    () => json(success({ ...f.prepared, tree: local })), () => json(success({ ...f.prepared, parent: local }))];
  for (const response of cases) {
    let calls = 0;
    const r = await publishAcledPair({ ...f.input, fetchImpl: async () => ++calls === 1
      ? json({ data: { repository: { ref: { target: { oid: old } } } } }) : response() });
    assert.equal(calls, 2); assert.equal(r.status, 'publication_unknown'); assert.equal(r.configurationsPublished, null);
    assert.equal(r.retryAllowed, false); assert.ok(!JSON.stringify(r).includes('secret'));
  }
});

test('whole-response timeout after mutation remains unknown even when abort is ignored', async t => {
  const f = fixture(t); let calls = 0;
  const r = await publishAcledPair({ ...f.input, fetchImpl: async () => ++calls === 1
    ? json({ data: { repository: { ref: { target: { oid: old } } } } }) : new Promise(() => {}) });
  assert.equal(r.status, 'publication_unknown'); assert.equal(calls, 2);
});

test('real strict preparation integrates with the remote parent and tree receipt without touching local refs', async t => {
  const f = fixture(t);
  const names = { weekly: 'world-order-acled-regional-weekly.json', monthly: 'world-order-acled-global-monthly.json' };
  const code = ['check-world-order-acled-weekly.mjs', 'check-world-order-acled-monthly.mjs', 'world-order/acled-weekly-coverage.mjs',
    'world-order/acled-weekly-window.mjs', 'world-order/acled-freshness.mjs', 'world-order/acled-monthly-trend.mjs',
    'world-order/sanitize-acled-weekly.mjs', 'world-order/sanitize-acled-monthly.mjs'];
  for (const file of code.map(n => `scripts/${n}`).concat(Object.values(names).map(n => `config/${n}`))) {
    fs.mkdirSync(path.dirname(path.join(f.root, file)), { recursive: true }); fs.copyFileSync(file, path.join(f.root, file));
  }
  f.git(['-c', 'core.autocrlf=false', 'add', '.']);
  f.git(['-c', 'user.name=Test', '-c', 'user.email=test@localhost', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']);
  const expectedHead = f.git(['rev-parse', 'HEAD']); f.git(['update-ref', 'refs/remotes/origin/main', expectedHead]);
  const baseline = Object.fromEntries(Object.entries(names).map(([k, n]) => [k, execFileSync('git', ['show', `${expectedHead}:config/${n}`], { cwd: f.root, encoding: 'utf8' })]));
  const candidate = Object.fromEntries(Object.entries(baseline).map(([k, v]) => { const data = JSON.parse(v); data.quality.confidence = 0.82; return [k, JSON.stringify(data)]; }));
  let prepared, calls = 0;
  const r = await publishAcledPair({ ...f.input, expectedHead, candidate,
    expectedBaselineSha256: Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, sha(v)])),
    reviewedCandidateSha256: Object.fromEntries(Object.entries(candidate).map(([k, v]) => [k, sha(v)])),
    prepare: input => { prepared = prepareAcledPairCommit(input); return prepared; },
    fetchImpl: async () => ++calls === 1 ? json({ data: { repository: { ref: { target: { oid: expectedHead } } } } }) : json(success(prepared)) });
  assert.equal(r.status, 'configurations_published_refresh_pending', JSON.stringify({ r, prepared }));
  assert.equal(f.git(['rev-parse', 'HEAD']), expectedHead); assert.equal(f.git(['status', '--porcelain']), '');
});
