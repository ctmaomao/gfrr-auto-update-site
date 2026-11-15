import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POLICY, digest, BUDGET_REPOSITORY } from '../../scripts/lib/deepseek-budget.mjs';
import { RECEIPT_GRANT } from '../../scripts/lib/deepseek-receipt-grant.mjs';
import { NOW, key, receiptGrantFixture } from '../fixtures/deepseek-receipt-grant.mjs';
import { OPAQUE_MARKER, PRIVATE_CLAIM_ID, PRIVATE_SNAPSHOT_LIMIT, opaqueClaimRef, validateOpaqueMarker, validatePrivateSnapshot, parsePrivateSnapshot,
  createOpaqueClaimStore, verifyPrivateClaimStatus, createPrivateClaimBudget, privateClaimRuntimeConfig } from '../../scripts/lib/deepseek-private-claim.mjs';
const iso = at => new Date(at).toISOString();
function fixture() {
  const { grant, review } = receiptGrantFixture();
  const snapshot = { schemaVersion: 'deepseek-private-claim-v1', claimId: PRIVATE_CLAIM_ID, sourceCommit: 'b'.repeat(40), grant, review };
  return { snapshot, approvedSnapshotDigest: digest(snapshot), approvedReviewDigest: digest(review) };
}
function setup(changes = {}) {
  const f = fixture(); let claimed = false, claims = 0;
  const store = { available: async () => { if (claimed) throw Object.assign(Error('deepseek_budget_grant_consumed'), { budgetCode: 'deepseek_budget_grant_consumed' }); return true; },
    claim: async (...args) => { assert.equal(args.length, 0); if (claimed) throw Error('deepseek_budget_grant_consumed'); claimed = true; claims++; return 'c'.repeat(40); },
    verifyClaim: async head => claimed && head === 'c'.repeat(40) };
  const options = { ...f, store, runId: '123', verifyExposure: async () => true, now: () => NOW,
    readBalance: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '10', granted_balance: '0', topped_up_balance: '10' }] }), ...changes };
  return { ...f, options, store, claims: () => claims, gate: createPrivateClaimBudget(options) };
}
const context = patch => ({ key, consumer: 'bubble-editorial', mode: 'manual', runId: '123', payload: { model: POLICY.model,
  temperature: 0.2, max_tokens: 8000, stream: false, thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
  messages: [{ role: 'system', content: 'JSON' }, { role: 'user', content: 'JSON' }] }, ...patch });
const response = () => ({ id: 'synthetic-response', object: 'chat.completion', created: NOW / 1000, model: POLICY.responseModel,
  usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] });
test('private snapshot is exact, bounded and independently pinned; status discloses no evidence', async () => {
  const { snapshot, approvedSnapshotDigest, approvedReviewDigest, options } = setup();
  assert.deepEqual(parsePrivateSnapshot(JSON.stringify(snapshot), { approvedSnapshotDigest, approvedReviewDigest }, NOW), snapshot);
  const status = await verifyPrivateClaimStatus(options);
  assert.deepEqual(status, { operation: 'read_only_verification', providerCalls: 0, writes: 0, admission: 'eligible_snapshot_only' });
  for (const patch of [{ extra: true }, { claimId: 'a'.repeat(64) }, { claimId: '' }, { sourceCommit: '' }, { grant: { ...snapshot.grant, expiresAt: iso(NOW - 1) } }]) {
    const bad = { ...snapshot, ...patch }; assert.throws(() => validatePrivateSnapshot(bad, { approvedSnapshotDigest: digest(bad), approvedReviewDigest }, NOW), /deepseek_budget_/);
  }
  assert.throws(() => parsePrivateSnapshot(' '.repeat(PRIVATE_SNAPSHOT_LIMIT + 1), { approvedSnapshotDigest, approvedReviewDigest }, NOW), /private_snapshot_unproven/);
  assert.throws(() => parsePrivateSnapshot('not-json', { approvedSnapshotDigest, approvedReviewDigest }, NOW), /private_snapshot_unproven/);
  assert.throws(() => validatePrivateSnapshot(snapshot, { approvedSnapshotDigest: 'b'.repeat(64), approvedReviewDigest }, NOW), /private_snapshot_unproven/);
});
test('one opaque claim precedes callback; token usage and private snapshot never reach the store', async () => {
  const { gate, claims, options } = setup(); let calls = 0;
  await gate(context(), async () => { assert.equal(claims(), 1); calls++; return response(); });
  assert.equal(calls, 1);
  await assert.rejects(gate(context(), () => assert.fail()), /session_stopped/);
  await assert.rejects(createPrivateClaimBudget(options)(context(), () => assert.fail()), /grant_consumed/);
  const rotated = fixture();
  await assert.rejects(createPrivateClaimBudget({ ...options, ...rotated })(context(), () => assert.fail()), /grant_consumed/);
});
test('failure, invalid receipt, post-claim exposure failure and uncertain creation never restore a slot', async () => {
  for (const failure of ['provider', 'receipt', 'exposure', 'uncertain']) {
    let checks = 0; const x = setup(failure === 'exposure' ? { verifyExposure: async () => ++checks === 1 } : {});
    if (failure === 'uncertain') x.store.claim = async () => { throw Error('deepseek_budget_claim_uncertain'); };
    let calls = 0;
    await assert.rejects(x.gate(context(), async () => {
      calls++; if (failure === 'provider') throw Error('PRIVATE_REQUEST_BODY');
      const r = response(); if (failure === 'receipt') r.usage.total_tokens++; return r;
    }), /deepseek_budget_/);
    assert.equal(calls, ['provider', 'receipt'].includes(failure) ? 1 : 0);
    await assert.rejects(x.gate(context(), () => assert.fail()), /session_stopped/);
  }
});
test('wrong consumer, changed key, automatic mode, expired approval and missing exposure stop before claim', async () => {
  for (const patch of [{ consumer: 'macro-editorial' }, { key: 'different' }, { mode: 'automated' }, { runId: 'local' }]) {
    const x = setup(); await assert.rejects(x.gate(context(patch), () => assert.fail()), /deepseek_budget_/); assert.equal(x.claims(), 0);
  }
  for (const changes of [{ verifyExposure: undefined }, { now: () => NOW + 86400000 }]) {
    const x = setup(changes); await assert.rejects(x.gate(context(), () => assert.fail()), /deepseek_budget_/); assert.equal(x.claims(), 0);
  }
});
test('racing independent gates share exactly one permanent claim', async () => {
  const x = setup(); let calls = 0;
  const results = await Promise.allSettled([createPrivateClaimBudget(x.options), createPrivateClaimBudget(x.options)].map(gate => gate(context(), async () => { calls++; return response(); })));
  assert.equal(calls, 1); assert.equal(x.claims(), 1); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
function transport(scenario = 'valid') {
  const calls = [], claimId = PRIVATE_CLAIM_ID, head = 'c'.repeat(40); let created = false;
  const store = createOpaqueClaimStore({ token: 'SYNTHETIC_TOKEN', claimId, now: () => NOW, fetchImpl: async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null; calls.push({ url, method: init.method, body });
    let status = 200, data;
    if (init.method === 'GET') { status = created || scenario === 'existing' ? 200 : 404; data = { object: { sha: scenario === 'changed' ? 'd'.repeat(40) : head } }; }
    else if (url.endsWith('/git/trees')) data = { sha: 'b'.repeat(40) };
    else if (url.endsWith('/git/commits')) data = { sha: head };
    else if (url.endsWith('/git/refs')) {
      if (scenario === 'lost') throw Error('lost acknowledgment');
      created = true; data = { ref: opaqueClaimRef(claimId), object: { sha: head } };
      if (scenario === 'conflict') status = 422;
    }
    if (init.method === 'POST' && status === 200) status = 201;
    return new Response(JSON.stringify(data), { status, headers: { date: new Date(NOW - (scenario === 'clock' ? 120000 : 0)).toUTCString() } });
  } });
  return { store, calls, head };
}
test('public transport writes only a constant parentless marker and atomic create-ref', async () => {
  const { store, calls, head } = transport(); assert.equal(await store.available(), true);
  assert.equal(await store.claim(), head); assert.equal(await store.verifyClaim(head), true);
  const posts = calls.filter(c => c.method === 'POST');
  assert.deepEqual(posts.map(c => c.body), [
    { tree: [{ path: 'claim.json', mode: '100644', type: 'blob', content: JSON.stringify(OPAQUE_MARKER) }] },
    { message: 'Record one-use claim', tree: 'b'.repeat(40), parents: [] },
    { ref: opaqueClaimRef(PRIVATE_CLAIM_ID), sha: head }
  ]);
  assert.doesNotMatch(JSON.stringify(posts), /usage|cost|currency|keyId|requestDigest|evidence|runId|grant|review|snapshot/u);
  validateOpaqueMarker(OPAQUE_MARKER);
  assert.throws(() => validateOpaqueMarker({ ...OPAQUE_MARKER, usage: {} }), /claim_unproven/);
  assert.ok(calls.every(c => c.method === 'GET' || c.method === 'POST'));
});
test('existing, lost acknowledgment, conflict, changed ref and untrusted clock fail closed', async () => {
  for (const scenario of ['existing', 'clock']) await assert.rejects(transport(scenario).store.available(), /deepseek_budget_/);
  for (const scenario of ['lost', 'conflict']) await assert.rejects(transport(scenario).store.claim(), /deepseek_budget_/);
  const changed = transport('changed'); await changed.store.claim(); await assert.rejects(changed.store.verifyClaim(changed.head), /claim_unproven/);
});
test('runtime uses only private secret configuration and exact reviewed source identity', () => {
  const f = fixture();
  const env = { DEEPSEEK_BUDGET_SELECTION: RECEIPT_GRANT.id, DEEPSEEK_BUDGET_CONSUMER: 'bubble-editorial', GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: BUDGET_REPOSITORY, GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_RUN_ID: '123', GITHUB_SHA: f.snapshot.sourceCommit, GITHUB_WORKFLOW_REF: `${BUDGET_REPOSITORY}/.github/workflows/bubble-watch-weekly-editorial-refresh.yml@refs/heads/main`,
    DEEPSEEK_RECEIPT_PRIVATE_SNAPSHOT: JSON.stringify(f.snapshot), DEEPSEEK_RECEIPT_PRIVATE_APPROVAL_SHA256: f.approvedSnapshotDigest,
    DEEPSEEK_RECEIPT_PRIVATE_PRICE_SHA256: f.approvedReviewDigest, DEEPSEEK_BUDGET_GITHUB_TOKEN: 'SYNTHETIC_TOKEN' };
  assert.equal(privateClaimRuntimeConfig(env, NOW).snapshot.claimId, f.snapshot.claimId);
  for (const patch of [{ GITHUB_SHA: 'c'.repeat(40) }, { GITHUB_RUN_ATTEMPT: '2' }, { DEEPSEEK_RECEIPT_PRIVATE_SNAPSHOT: undefined },
    { DEEPSEEK_BUDGET_CONSUMER: 'macro-editorial' }, { GITHUB_EVENT_NAME: 'workflow_run' }])
    assert.throws(() => privateClaimRuntimeConfig({ ...env, ...patch }, NOW), /deepseek_budget_/);
  const routing = fs.readFileSync('scripts/lib/deepseek-budget.mjs', 'utf8');
  assert.ok(routing.includes("await import('./deepseek-private-claim.mjs')"));
  assert.ok(!routing.includes('withReceiptBudget'));
  const status = fs.readFileSync('scripts/review-deepseek-budget.mjs', 'utf8');
  assert.ok(status.includes('verifyPrivateClaimStatus(privateClaimRuntimeConfig())'));
  assert.ok(!status.includes('verifyReceiptStatus(receiptRuntimeConfig())'));
});

test('workflow limits private authority to preflight/provider and binds actual checkout', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('.github/workflows/bubble-watch-weekly-editorial-refresh.yml', 'utf8');
  const blocks = source.split('\n      - name:').slice(1);
  for (const secret of ['DEEPSEEK_RECEIPT_PRIVATE_SNAPSHOT', 'DEEPSEEK_RECEIPT_PRIVATE_APPROVAL_SHA256', 'DEEPSEEK_RECEIPT_PRIVATE_PRICE_SHA256']) {
    const scoped = blocks.filter(block => block.includes(`${secret}:`));
    assert.equal(scoped.length, 2);
    assert.ok(scoped.some(block => block.includes('review-deepseek-budget.mjs --require-eligible')));
    assert.ok(scoped.some(block => block.includes('run:bubble-watch-weekly-editorial-deepseek -- --allow-network')));
    for (const block of scoped) assert.ok(block.includes(`${secret}: \${{ secrets.${secret} }}`));
  }
  assert.ok(source.includes('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"'));
  assert.doesNotMatch(source, /DEEPSEEK_RECEIPT_20261112_(?:GENESIS_SHA|GRANT_SHA256|PRICE_REVIEW_SHA256)/u);
  const diagnostic = blocks.find(block => block.includes('id: diagnostic_receipt'));
  assert.ok(diagnostic.includes('DEEPSEEK_BUDGET_SELECTION: ${{ inputs.budget_selection }}'));
  assert.doesNotMatch(diagnostic, /DEEPSEEK_RECEIPT_PRIVATE_|DEEPSEEK_API_KEY/u);
});

test('private provider success log omits usage while ordinary routes retain diagnostics', () => {
  const source = fs.readFileSync('scripts/bubble-watch/run-weekly-editorial-deepseek.mjs', 'utf8');
  assert.ok(source.includes("if (process.env.DEEPSEEK_BUDGET_SELECTION === RECEIPT_GRANT.id) {\n      console.log('Bubble Watch DeepSeek weekly editorial PASS');\n    } else {"));
  assert.ok(source.includes('apiCallCount=${result.diagnostics.apiCallCount}'));
});
