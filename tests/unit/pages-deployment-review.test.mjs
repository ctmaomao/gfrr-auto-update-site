import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewPagesDeployment } from '../../scripts/review-pages-deployment.mjs';

const repository = 'ctmaomao/gfrr-auto-update-site';
const sourceSha = 'a'.repeat(40);
const token = 'test-private-token';
function metadata() {
  return [[{ id: 123, sha: sourceSha, ref: 'main', environment: 'github-pages',
    performed_via_github_app: { slug: 'github-actions' } }],
  [{ state: 'success', environment: 'github-pages',
    log_url: `https://github.com/${repository}/actions/runs/456/job/789` }],
  { repository: { full_name: repository }, head_sha: sourceSha, head_branch: 'main',
    path: '.github/workflows/deploy-static-site-to-pages.yml', status: 'completed',
    conclusion: 'success', event: 'push' }];
}
async function review(values = metadata(), options = {}) {
  const calls = [];
  const decision = await reviewPagesDeployment({ repository, sourceSha, token,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      assert.ok(calls.length <= 3, 'request budget');
      return new Response(JSON.stringify(values[calls.length - 1]), { status: 200 });
    }, ...options });
  return { decision, calls };
}

test('only matching successful main Pages publication skips deployment, using three bounded GETs', async () => {
  const { decision, calls } = await review();
  assert.deepEqual(decision, { shouldDeploy: false, reason: 'same_revision_already_published' });
  assert.deepEqual(calls.map(({ url }) => url), [
    `https://api.github.com/repos/${repository}/deployments?environment=github-pages&per_page=1`,
    `https://api.github.com/repos/${repository}/deployments/123/statuses?per_page=1`,
    `https://api.github.com/repos/${repository}/actions/runs/456`,
  ]);
  for (const { init } of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
  }
});

test('manual force and invalid/missing local metadata deploy without requests', async () => {
  for (const options of [{ force: true }, { sourceSha: 'not-a-commit' }, { repository: '../..' }, { token: '' }]) {
    const { decision, calls } = await review(metadata(), options);
    assert.equal(decision.shouldDeploy, true);
    assert.equal(calls.length, 0);
  }
});

test('different revision, branch, environment, app or invalid deployment identity never skip', async () => {
  for (const patch of [{ sha: 'b'.repeat(40) }, { ref: 'feature' }, { environment: 'preview' },
    { performed_via_github_app: { slug: 'another-app' } }, { id: -1 }, { id: '123' }]) {
    const values = metadata();
    Object.assign(values[0][0], patch);
    const { decision, calls } = await review(values);
    assert.equal(decision.shouldDeploy, true);
    assert.equal(calls.length, 1);
  }
  for (const value of [[], null, {}]) {
    const values = metadata(); values[0] = value;
    assert.equal((await review(values)).decision.shouldDeploy, true);
  }
});

test('failed, pending or foreign deployment status and untrusted log URLs never skip or get fetched', async () => {
  for (const patch of [{ state: 'failure' }, { state: 'in_progress' }, { environment: 'preview' },
    { log_url: `https://example.com/${repository}/actions/runs/456/job/789` },
    { log_url: 'https://github.com/other/repo/actions/runs/456/job/789' },
    { log_url: `https://github.com/${repository}/actions/runs/456?token=${token}` },
    { log_url: `https://github.com/${repository}/actions/runs/not-a-run/job/789` },
    { log_url: `http://github.com/${repository}/actions/runs/456/job/789` }, { log_url: null }]) {
    const values = metadata(); Object.assign(values[1][0], patch);
    const { decision, calls } = await review(values);
    assert.equal(decision.shouldDeploy, true);
    assert.equal(calls.length, 2);
  }
});

test('workflow identity, actual event SHA and success are all required; uncertain checkout revision deploys', async () => {
  for (const patch of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'feature' },
    { repository: { full_name: 'other/repo' } }, { path: '.github/workflows/another.yml' },
    { status: 'in_progress' }, { conclusion: 'failure' }, { conclusion: 'cancelled' }, { event: 'pull_request' }]) {
    const values = metadata(); Object.assign(values[2], patch);
    assert.equal((await review(values)).decision.shouldDeploy, true);
  }
});

test('HTTP failures, malformed/oversized bodies and errors fail open with redacted fixed diagnostics', async () => {
  const responses = [new Response(token, { status: 403 }), new Response(token, { status: 500 }),
    new Response(token, { status: 200 }), new Response('x'.repeat(65537), { status: 200 }),
    new Response('{}', { status: 200, headers: { 'content-length': '65537' } })];
  for (const response of responses) {
    let count = 0;
    const decision = await reviewPagesDeployment({ repository, sourceSha, token,
      fetchImpl: async () => { count++; return response; } });
    assert.deepEqual(decision, { shouldDeploy: true, reason: 'metadata_unavailable' });
    assert.equal(count, 1);
    assert.doesNotMatch(JSON.stringify(decision), /test-private-token/u);
  }
  const { decision } = await review(metadata(), { fetchImpl: async () => { throw new Error(token); } });
  assert.deepEqual(decision, { shouldDeploy: true, reason: 'metadata_unavailable' });
});

test('request timeout resumes deployment without retry', async () => {
  let count = 0;
  const decision = await reviewPagesDeployment({ repository, sourceSha, token, timeoutMs: 10,
    fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
      count++;
      const keeper = setTimeout(() => reject(new Error('test timeout failed')), 1000);
      signal.addEventListener('abort', () => { clearTimeout(keeper); reject(new Error(token)); }, { once: true });
    }) });
  assert.equal(count, 1);
  assert.deepEqual(decision, { shouldDeploy: true, reason: 'metadata_unavailable' });
});
