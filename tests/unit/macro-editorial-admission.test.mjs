import test from 'node:test';
import assert from 'node:assert/strict';
import { admitRefresh, githubClient, planAdmission, REPOSITORY, UPSTREAMS, RECOVERY_20260911 } from '../../scripts/macro-risk/editorial-refresh-admission.mjs';

const now = '2026-09-09T03:00:00.000Z';
const sha = 'a'.repeat(40);
const runs = UPSTREAMS.map(([name, file], index) => ({ id: index + 1, name, path: `.github/workflows/${file}`, repository: { full_name: REPOSITORY }, head_repository: { full_name: REPOSITORY }, head_branch: 'main', event: 'schedule', run_attempt: 1, status: 'completed', conclusion: 'success', created_at: `2026-09-09T0${index}:00:00Z`, updated_at: `2026-09-09T0${index}:20:00Z` }));
const context = () => ({ eventName: 'workflow_run', event: { action: 'completed', workflow_run: structuredClone(runs[2]) }, runAttempt: '1', repository: REPOSITORY, ref: 'refs/heads/main', now, radar: { updatedAt: '2026-09-09T00:10:00Z' }, world: { updatedAt: '2026-09-09T01:10:00Z' }, oil: { builtAt: '2026-09-09T02:10:00Z' } });
const options = (ctx = context()) => ({ plan: planAdmission(ctx), eventName: ctx.eventName, event: ctx.event, now: ctx.now, snapshots: [ctx.radar.updatedAt, ctx.world.updatedAt, ctx.oil.builtAt], headSha: sha, reserve: true });
function recoveryContext() {
  return { ...context(), eventName: 'workflow_dispatch',
    event: { inputs: { allow_network: true, acknowledge_cost: true, recovery_id: RECOVERY_20260911.id } },
    now: '2026-09-11T07:00:00.000Z', radar: { updatedAt: RECOVERY_20260911.sourceDataUpdatedAt },
    radarDigest: RECOVERY_20260911.radarDigest,
    world: { updatedAt: '2026-09-11T05:47:31.958Z' }, oil: { builtAt: '2026-09-11T01:29:41.501Z' } };
}
function recoveryApi({ badOriginal = false, uncertain = false } = {}) {
  const plan = planAdmission(recoveryContext());
  const original = new Map(plan.originalRefs.map(ref => [`refs/${ref}`, RECOVERY_20260911.failedHeadSha]));
  const refs = new Map(original), methods = [];
  return { refs, original, methods, api: async (path, method = 'GET', body) => {
    methods.push(method);
    if (method === 'POST') {
      if (refs.has(body.ref)) return { status: 422 };
      refs.set(body.ref, body.sha);
      if (uncertain) throw new Error('uncertain_recovery_write');
      return { status: 201, data: { ref: body.ref, object: { sha: body.sha } } };
    }
    const ref = `refs/${path.slice('/git/ref/'.length)}`;
    if (badOriginal && original.has(ref)) return { status: 403 };
    return refs.has(ref) ? { status: 200, data: { ref, object: { sha: refs.get(ref) } } } : { status: 404 };
  } };
}

test('reviewed recovery adds exactly one reservation without changing old day/input tokens', async () => {
  const ctx = recoveryContext(), state = recoveryApi();
  assert.equal((await admitRefresh({ ...options(ctx), api: state.api })).reason, 'recovery_budget_reserved');
  assert.equal(state.refs.size, 3);
  for (const [ref, value] of state.original) assert.equal(state.refs.get(ref), value);
  assert.equal((await admitRefresh({ ...options(ctx), api: state.api })).reason, 'budget_already_reserved');
  delete ctx.event.inputs.recovery_id;
  assert.equal((await admitRefresh({ ...options(ctx), api: state.api })).reason, 'budget_already_reserved');
  assert.ok(state.methods.every(method => ['GET', 'POST'].includes(method)));
});

test('recovery rejects wrong day/input/digest/id/context, reruns and missing acknowledgements', () => {
  for (const change of [
    c => { c.now = RECOVERY_20260911.expiresAt; }, c => { c.now = '2026-09-11T05:59:59Z'; },
    c => { c.radar.updatedAt = '2026-09-11T00:22:00Z'; }, c => { c.radarDigest = 'b'.repeat(64); },
    c => { delete c.radarDigest; }, c => { c.event.inputs.recovery_id = 'another'; },
    c => { c.eventName = 'schedule'; }, c => { c.runAttempt = '2'; },
    c => { c.event.inputs.allow_network = false; }, c => { c.event.inputs.acknowledge_cost = false; },
    c => { c.ref = 'refs/heads/feature'; }, c => { c.repository = 'fork/repo'; },
    c => { c.oil.builtAt = '2026-09-01T00:00:00Z'; },
    c => { c.radar.macroRiskEditorialLayer = { sourceDataUpdatedAt: c.radar.updatedAt }; },
  ]) { const ctx = recoveryContext(); change(ctx); assert.equal(planAdmission(ctx).ready, false); }
});

test('recovery dry run, unknown original budget and uncertain reservation stay fail-closed', async () => {
  const ctx = recoveryContext(), dry = recoveryApi();
  assert.equal((await admitRefresh({ ...options(ctx), api: dry.api, reserve: false })).reason, 'dry_run_would_reserve');
  assert.equal(dry.refs.size, 2);
  const bad = recoveryApi({ badOriginal: true });
  await assert.rejects(admitRefresh({ ...options(ctx), api: bad.api }), /original_budget_unverified/);
  assert.equal(bad.refs.size, 2);
  const uncertain = recoveryApi({ uncertain: true });
  await assert.rejects(admitRefresh({ ...options(ctx), api: uncertain.api }), /uncertain_recovery_write/);
  assert.equal((await admitRefresh({ ...options(ctx), api: uncertain.api })).reason, 'budget_already_reserved');
});

test('concurrent recovery callers admit at most one paid attempt', async () => {
  const state = recoveryApi();
  const results = await Promise.allSettled([1, 2].map(() => admitRefresh({ ...options(recoveryContext()), api: state.api })));
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.ready).length, 1);
  assert.equal(state.refs.size, 3);
});
function mockApi({ alteredRuns = runs, failPost = 0 } = {}) {
  const refs = new Set();
  const calls = [];
  let posts = 0;
  const api = async (path, method = 'GET', body) => {
    calls.push({ path, method, body });
    if (path.startsWith('/actions/runs/')) return { status: 200, data: runs[2] };
    if (path.startsWith('/actions/workflows/')) return { status: 200, data: { workflow_runs: [alteredRuns.find((r) => path.includes(r.path.split('/').at(-1)))] } };
    if (method === 'POST') {
      posts++;
      if (posts === failPost) throw new Error('uncertain_post');
      if (refs.has(body.ref)) return { status: 422, data: {} };
      refs.add(body.ref);
      return { status: 201, data: { ref: body.ref, object: { sha: body.sha } } };
    }
    return { status: refs.has(`refs/${path.slice('/git/ref/'.length)}`) ? 200 : 404 };
  };
  return { api, refs, calls };
}

test('eligible completion reserves both day and input before admitting work', async () => {
  const state = mockApi();
  const result = await admitRefresh({ ...options(), api: state.api });
  assert.equal(result.ready, true);
  assert.equal(state.refs.size, 2);
  assert.equal(state.calls.length, 8);
  assert.equal((await admitRefresh({ ...options(), api: state.api })).reason, 'budget_already_reserved');
});

test('reject foreign, unsuccessful, manual-upstream, rerun and unsupported events', () => {
  const changes = [
    c => { c.repository = 'fork/repo'; }, c => { c.ref = 'refs/heads/feature'; },
    c => { c.runAttempt = '2'; }, c => { c.eventName = 'schedule'; },
    c => { c.event.workflow_run.head_repository.full_name = 'fork/repo'; },
    c => { c.event.workflow_run.path = '.github/workflows/untrusted.yml'; },
    c => { c.event.workflow_run.conclusion = 'failure'; }, c => { c.event.workflow_run.run_attempt = 2; },
    c => { c.event.workflow_run.event = 'workflow_dispatch'; }, c => { c.event.action = 'requested'; },
  ];
  for (const change of changes) { const ctx = context(); change(ctx); assert.equal(planAdmission(ctx).ready, false); }
});

test('missing/future/stale snapshots and pre-Daily upstreams do not admit', () => {
  for (const value of [null, '', 'bad', '2026-09-10T00:00:00Z', '2026-09-07T00:00:00Z']) {
    const ctx = context(); ctx.radar.updatedAt = value; assert.equal(planAdmission(ctx).ready, false);
  }
  const ctx = context(); ctx.oil.builtAt = '2026-09-08T23:00:00Z';
  assert.equal(planAdmission(ctx).reason, 'waiting_for_upstream_snapshots');
});

test('legacy/manual production output already matching Daily prevents another call', async () => {
  const ctx = context(); ctx.radar.macroRiskEditorialLayer = { sourceDataUpdatedAt: ctx.radar.updatedAt };
  const result = await admitRefresh({ ...options(ctx), api: () => { throw new Error('must not access API'); } });
  assert.equal(result.reason, 'input_already_has_editorial');
});

test('manual entry requires both explicit acknowledgements and still shares budget', async () => {
  const ctx = context(); ctx.eventName = 'workflow_dispatch'; ctx.event = { inputs: {} };
  assert.equal(planAdmission(ctx).ready, false);
  ctx.event.inputs = { allow_network: true, acknowledge_cost: 'true' };
  const state = mockApi();
  assert.equal((await admitRefresh({ ...options(ctx), api: state.api })).ready, true);
  assert.equal((await admitRefresh({ ...options(), api: state.api })).ready, false);
});

test('failed or lagging latest upstream does not fall back to older success', async () => {
  for (const patch of [{ conclusion: 'failure' }, { status: 'in_progress' }, { created_at: '2026-09-07T00:00:00Z' }, { updated_at: '2026-09-10T00:00:00Z' }, { id: 99 }]) {
    const changed = structuredClone(runs); Object.assign(changed[2], patch);
    const state = mockApi({ alteredRuns: changed });
    assert.equal((await admitRefresh({ ...options(), api: state.api })).ready, false);
    assert.equal(state.refs.size, 0);
  }
});

test('unknown API state is fail-closed, not a free budget', async () => {
  const ctx = context(); ctx.eventName = 'workflow_dispatch'; ctx.event = { inputs: { allow_network: true, acknowledge_cost: true } };
  await assert.rejects(admitRefresh({ ...options(ctx), api: async () => ({ status: 403 }) }), /budget_state_unknown/);
  await assert.rejects(admitRefresh({ ...options(), api: async () => ({ status: 503 }) }), /upstream_identity_unverified/);
});

test('dry run performs no reservation; partial/uncertain write retains consumed budget', async () => {
  const dry = mockApi();
  assert.equal((await admitRefresh({ ...options(), api: dry.api, reserve: false })).reason, 'dry_run_would_reserve');
  assert.equal(dry.refs.size, 0);
  const partial = mockApi({ failPost: 2 });
  await assert.rejects(admitRefresh({ ...options(), api: partial.api }), /uncertain_post/);
  assert.equal(partial.refs.size, 1);
  assert.equal((await admitRefresh({ ...options(), api: partial.api })).ready, false);
});

test('atomic ref collisions cannot admit concurrent duplicate callers', async () => {
  const state = mockApi();
  const results = await Promise.allSettled([admitRefresh({ ...options(), api: state.api }), admitRefresh({ ...options(), api: state.api })]);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.ready).length, 1);
});

test('new day cannot repay same input; new input cannot repay same day', async () => {
  const state = mockApi(); await admitRefresh({ ...options(), api: state.api });
  const ctx = context(); ctx.now = '2026-09-10T00:00:00.000Z'; ctx.eventName = 'workflow_dispatch'; ctx.event = { inputs: { allow_network: true, acknowledge_cost: true } };
  assert.equal((await admitRefresh({ ...options(ctx), api: state.api })).ready, false);
  ctx.now = now; ctx.radar.updatedAt = '2026-09-09T00:15:00Z';
  assert.equal((await admitRefresh({ ...options(ctx), api: state.api })).ready, false);
});

test('HTTP client is bounded, rejects redirects, redacts failures and never retries', async () => {
  let calls = 0;
  const api = githubClient({ token: 'secret', fetchImpl: async (url, options) => {
    calls++; assert(url.startsWith(`https://api.github.com/repos/${REPOSITORY}/`));
    assert.equal(options.redirect, 'error'); assert(options.signal); throw new Error('secret in server response');
  } });
  await assert.rejects(api('/git/ref/tags/x'), error => error.message === 'github_metadata_request_failed');
  assert.equal(calls, 1);
  const big = githubClient({ token: 'secret', fetchImpl: async () => new Response('x'.repeat(1048577)) });
  await assert.rejects(big('/git/ref/tags/x'), /github_metadata_request_failed/);
  const bounded = githubClient({ token: 'secret', fetchImpl: async () => new Response('{}') });
  for (let i = 0; i < 10; i++) await bounded('/git/ref/tags/x');
  await assert.rejects(bounded('/git/ref/tags/x'), /out_of_bounds/);
});
