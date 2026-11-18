import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CANARY, runBraveCanary, requestDiscardedCanary } from '../../scripts/lib/brave-manual-canary.mjs';
import { keyFingerprint, SEARCH_REPOSITORY } from '../../scripts/lib/free-search-ledger.mjs';
import { prepareBravePrivateProof, createBravePublicProjection, withBravePrivateProof } from '../../scripts/lib/brave-private-proof.mjs';
import { createBraveBudget, validateBraveLedger } from '../../scripts/lib/brave-budget.mjs';
const time = Date.parse('2026-11-18T12:00:00.000Z'), key = 'SYNTHETIC_CANARY_KEY';
const iso = ms => new Date(ms).toISOString();
const grant = (at, evidence) => ({ id: randomUUID(), keyId: keyFingerprint(key), scope: 'provider_enforced_free_only', source: 'owner_dashboard',
  evidenceSha256: evidence.repeat(64), accountPlanBindingSha256: 'b'.repeat(64), verifiedAt: iso(at), expiresAt: iso(at + 3600000),
  protectionEndsAt: iso(at + 3600000), requestLimit: 50, freeOnlyEnabled: true, hardStopConfirmed: true, plan: 'search_postpaid',
  bindingType: 'verified_dashboard_login_and_plan_key', loginIdentityVerified: true, planKeyAssociationVerified: true,
  accountObservation: { source: 'owner_dashboard', observedAt: iso(at), requestsUsed: 123, usageCostUsd: '0.62', outOfPocketCostUsd: '0.00', monthlyFreeCreditUsd: '5.00' } });
function fixture() {
  const original = prepareBravePrivateProof({ grant: grant(time - 86400000, 'a'), recordingStartedAt: iso(time - 86400000), now: time });
  const added = { ...grant(time - 60000, 'c'), id: CANARY.grantId };
  const record = { schemaVersion: 'brave-renewal-chain-v1', purpose: CANARY.purpose, baseHead: CANARY.baseHead,
    approvedDispatchSha: 'd'.repeat(40), freshKeyId: keyFingerprint(key), freshAccountPlanBindingSha256: 'b'.repeat(64), grant: added };
  const baseSnapshot = { head: CANARY.baseHead, serverTime: time, ledger: createBravePublicProjection({ privateProof: original, now: time }) };
  let current = structuredClone(baseSnapshot), writes = 0, calls = 0;
  const store = { read: async () => structuredClone(current), write: async (previous, ledger) => {
    if (previous.head !== current.head) return false;
    writes++; current = { head: writes.toString(16).padStart(40, '0'), serverTime: time, ledger: structuredClone(ledger) }; return true;
  } };
  const context = { actions: 'true', repository: SEARCH_REPOSITORY, ref: 'refs/heads/main', event: 'workflow_dispatch',
    sha: record.approvedDispatchSha, workflowSha: record.approvedDispatchSha, liveMainSha: record.approvedDispatchSha,
    workflowRef: `${SEARCH_REPOSITORY}/${CANARY.workflow}@refs/heads/main`, runId: '123', job: 'single-test', operation: 'single-test' };
  return { original, record, store, context, baseSnapshot,
    options() { return { originalProof: original, chain: JSON.stringify(record), keys: [key], context: { ...context }, baseSnapshot, store,
      now: () => time, monotonicNow: () => 1, request: async () => { calls++; return { results: [] }; } }; },
    counts: () => ({ writes, calls }) };
}
test.before(() => { globalThis.fetch = async () => { throw new Error('OFFLINE_ONLY'); }; });
test('preview validates original private proof, chain and new grant without writes or search', async () => {
  const f = fixture(); f.context.operation = 'preview'; f.context.job = 'preview';
  assert.equal(await runBraveCanary(f.options()), 'PREVIEW_READY'); assert.deepEqual(f.counts(), { writes: 0, calls: 0 });
});
test('fresh process dispatches and retries collectively allow exactly one settled shared receipt', async () => {
  const f = fixture(); assert.equal(await runBraveCanary(f.options()), 'SINGLE_TEST_FINISHED');
  assert.deepEqual(f.counts(), { writes: 3, calls: 1 });
  const ledger = (await f.store.read()).ledger;
  assert.equal(ledger.entries[0].consumer, 'brave-renewal-smoke'); assert.equal(ledger.entries[0].state, 'success');
  assert.equal(ledger.grants.at(-1).requestLimit, 50);
  for (let i = 0; i < 3; i++) { f.context.runId = String(200 + i); await assert.rejects(runBraveCanary(f.options())); }
  assert.equal(f.counts().calls, 1);
  await assert.rejects(createBraveBudget({ store: withBravePrivateProof(f.store, f.original, () => time), now: () => time })({
    key, consumer: 'oil-news', mode: 'manual', runId: '321' }, () => assert.fail('old business proof must remain blocked')));
});
test('concurrent renewal and resumed concurrent reservation both have a single winner', async () => {
  for (const resume of [false, true]) {
    const f = fixture();
    if (resume) {
      const originalWrite = f.store.write; let n = 0;
      f.store.write = async (...args) => { if (++n === 2) throw new Error('before reservation'); return originalWrite(...args); };
      await assert.rejects(runBraveCanary(f.options())); f.store.write = originalWrite;
    }
    const result = await Promise.allSettled([runBraveCanary(f.options()), runBraveCanary(f.options()), runBraveCanary(f.options())]);
    assert.equal(result.filter(x => x.status === 'fulfilled').length, 1); assert.equal(f.counts().calls, 1);
  }
});
test('lost renewal acknowledgment can reconcile exact successor, lost reservation cannot replay', async () => {
  for (const lostAt of [1, 2]) {
    const f = fixture(), originalWrite = f.store.write; let n = 0;
    f.store.write = async (...args) => { const saved = await originalWrite(...args); if (++n === lostAt) throw new Error('private transport'); return saved; };
    await assert.rejects(runBraveCanary(f.options())); f.store.write = originalWrite;
    if (lostAt === 1) assert.equal(await runBraveCanary(f.options()), 'SINGLE_TEST_FINISHED');
    else { await assert.rejects(runBraveCanary(f.options())); assert.equal(f.counts().calls, 0); }
  }
});
test('failed, pending and uncertain receipt writes never yield successful completion or reusable slot', async () => {
  for (const scenario of ['rejected', 'unknown', 'receipt-write']) {
    const f = fixture(), options = f.options();
    if (scenario === 'rejected') options.request = async () => { throw Object.assign(new Error('PRIVATE'), { providerResponseReceived: true, httpStatus: 403 }); };
    if (scenario === 'unknown') options.request = async () => { throw new Error('PRIVATE'); };
    if (scenario === 'receipt-write') { const write = f.store.write; let n = 0; f.store.write = async (...args) => ++n >= 3 ? false : write(...args); }
    await assert.rejects(runBraveCanary(options)); await assert.rejects(runBraveCanary(f.options()));
    assert.equal((await f.store.read()).ledger.entries.length, 1);
  }
});
test('unknown, mismatched, expired, replayed, expanded or changed authority refuses before write', async () => {
  for (const change of [f => f.record.freshKeyId = 'f'.repeat(16), f => f.record.freshAccountPlanBindingSha256 = 'f'.repeat(64),
    f => delete f.record.freshKeyId, f => f.record.extra = true, f => f.record.grant.requestLimit = 1,
    f => f.record.grant.id = randomUUID(), f => f.record.baseHead = 'f'.repeat(40), f => f.record.purpose = 'new test',
    f => f.context.liveMainSha = 'f'.repeat(40), f => f.context.workflowSha = 'f'.repeat(40), f => f.context.ref = 'refs/heads/dev',
    f => f.context.event = 'push', f => f.record.grant.evidenceSha256 = f.original.grants[0].evidenceSha256,
    f => f.record.grant.expiresAt = iso(time - 1), f => f.record.grant.freeOnlyEnabled = false,
    f => f.baseSnapshot.ledger.proofCommitment = 'f'.repeat(64)]) {
    const f = fixture(); change(f); await assert.rejects(runBraveCanary(f.options())); assert.deepEqual(f.counts(), { writes: 0, calls: 0 });
  }
});
test('provider transport is fixed query, no redirects or retries and discards transient validated results', async () => {
  const privateText = 'SYNTHETIC_DO_NOT_RETAIN'; let calls = 0;
  const fetchImpl = async (url, options) => { calls++; assert.equal(new URL(url).searchParams.get('q'), CANARY.query);
    assert.equal(options.redirect, 'error'); return Response.json({ results: [{ title: privateText }] }); };
  assert.deepEqual(await requestDiscardedCanary(key, fetchImpl), { results: [] }); assert.equal(calls, 1);
  for (const body of [{}, { results: [], errors: ['PRIVATE'] }]) await assert.rejects(requestDiscardedCanary(key, async () => Response.json(body)));
});
test('workflow exposes only operation, pinned main checkout, step secrets and no new environment or persistent output', () => {
  const text = readFileSync('.github/workflows/brave-private-canary.yml', 'utf8');
  assert.match(text, /needs: preview/u); assert.match(text, /default: preview/u); assert.match(text, /contents: read/u); assert.match(text, /contents: write/u);
  assert.equal((text.match(/persist-credentials: false/gu) || []).length, 2);
  assert.equal((text.match(/ref: \$\{\{ github.sha \}\}/gu) || []).length, 2);
  for (const forbidden of ['environment:', 'upload-artifact', 'GITHUB_STEP_SUMMARY', 'npm ', 'expected_sha', 'schedule:', 'pull_request:', 'set -x']) assert.ok(!text.includes(forbidden));
  const script = readFileSync('scripts/run-brave-private-canary.mjs', 'utf8');
  assert.match(script, /const operation = env.GITHUB_JOB/u); assert.match(script, /GIT_CONFIG_GLOBAL/u); assert.match(script, /RUNNER_DEBUG/u); assert.ok(!script.includes('console.error(error'));
});

test('both preview paths exercise real gates for clock, expiry and rolling ceiling without actual writes', async () => {
  for (const resume of [false, true]) for (const condition of ['clock', 'expiry', 'rolling']) {
    const f = fixture();
    if (condition === 'rolling') {
      f.original.recordingStartedAt = iso(time - 20 * 86400000);
      f.original.grants = Array.from({ length: 19 }, (_, i) => grant(time - (20 - i) * 86400000, 'a'));
      f.baseSnapshot.ledger = createBravePublicProjection({ privateProof: f.original, now: time });
      f.baseSnapshot.ledger.entries = f.original.grants.flatMap(g => Array.from({ length: 50 }, () => ({ id: randomUUID(), grantId: g.id,
        consumer: 'oil-news', mode: 'automated', runId: '99', requests: 1, time: iso(Date.parse(g.verifiedAt) + 1000),
        finishedAt: iso(Date.parse(g.verifiedAt) + 2000), state: 'success' })));
    }
    let current = structuredClone(f.baseSnapshot), writes = 0;
    const store = { read: async () => structuredClone(current), write: async (_previous, ledger) => {
      writes++; current = { ...current, head: 'e'.repeat(40), ledger: structuredClone(ledger) }; return true;
    } };
    if (resume) {
      const { prepareBravePrivateRenewal, renewBravePrivateProof } = await import('../../scripts/lib/brave-private-proof.mjs');
      const next = prepareBravePrivateRenewal({ privateProof: f.original, grant: f.record.grant, now: time });
      await renewBravePrivateProof({ store, privateProof: f.original, nextPrivateProof: next, now: () => time }); writes = 0;
    }
    if (condition === 'clock') current.serverTime = time - 30001;
    f.context.operation = 'preview'; f.context.job = 'preview';
    const options = { ...f.options(), store, request: () => assert.fail('provider forbidden') };
    if (condition === 'expiry') options.now = () => Date.parse(f.record.grant.expiresAt) - 31000;
    await assert.rejects(runBraveCanary(options)); assert.equal(writes, 0);
  }
});

test('base v3 gate rejects nonauthorized smoke grants, repeated smoke and v1/v2 smoke before provider', async () => {
  const f = fixture();
  const originalAdapter = withBravePrivateProof(f.store, f.original, () => time);
  const oldLedger = (await originalAdapter.read()).ledger;
  const fresh = f.record.grant;
  const row = { id: randomUUID(), keyId: keyFingerprint(key), grantId: fresh.id, consumer: 'brave-renewal-smoke', mode: 'manual',
    requests: 1, time: iso(time), finishedAt: iso(time), state: 'success', runId: '123' };
  const valid = { ...oldLedger, grants: [...oldLedger.grants, fresh], entries: [row] };
  validateBraveLedger(valid, time);
  for (const alter of [x => x.entries.push({ ...row, id: randomUUID() }), x => x.entries[0].mode = 'automated',
    x => { x.grants.at(-1).id = randomUUID(); x.entries[0].grantId = x.grants.at(-1).id; },
    x => { x.schemaVersion = 'brave-budget-v2'; for (const g of x.grants) { delete g.bindingType; delete g.loginIdentityVerified; delete g.planKeyAssociationVerified; } },
    x => x.schemaVersion = 'brave-budget-v1']) {
    const altered = structuredClone(valid); alter(altered); assert.throws(() => validateBraveLedger(altered, time));
  }
  const gate = createBraveBudget({ store: { read: async () => ({ ledger: valid, serverTime: time, head: 'e'.repeat(40) }),
    write: async () => assert.fail('second smoke must fail before write') }, now: () => time });
  await assert.rejects(gate({ key, consumer: 'brave-renewal-smoke', mode: 'manual', runId: '999' }, () => assert.fail('provider forbidden')));
});
