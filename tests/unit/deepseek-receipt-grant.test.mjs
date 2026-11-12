import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { POLICY, POLICY_DIGEST, LEGACY_POLICY_DIGEST, digest } from '../../scripts/lib/deepseek-budget.mjs';
import { GRANT, VERIFICATION_GRANT, validateOneShotLedger } from '../../scripts/lib/deepseek-one-shot.mjs';
import { RECEIPT_GRANT, prepareReceiptLedger, validateReceiptLedger, validateReceiptTransition,
  createReceiptBudget, verifyReceiptStatus, createReceiptExposureVerifier, receiptRuntimeConfig } from '../../scripts/lib/deepseek-receipt-grant.mjs';
const NOW = Date.parse('2026-11-12T08:00:00.000Z');
const iso = n => new Date(n).toISOString();
const key = 'SYNTHETIC_RECEIPT_KEY';
function historic(policy, index) {
  const at = Date.parse(index ? '2026-11-11T02:00:00.000Z' : '2026-11-10T02:00:00.000Z');
  const review = { policyDigest: LEGACY_POLICY_DIGEST, verifiedAt: iso(at), expiresAt: iso(at + 86400000), evidenceSha256: digest('synthetic price') };
  const usages = index ? [[18120, 4127], [6302, 1823]] : [[17518, 4252], [7596, 1279]];
  const entries = usages.flatMap(([prompt, output], i) => {
    const id = randomUUID();
    return [{ id, kind: 'reserve', time: iso(at + i * 10000 + 1000), consumer: ['bubble-editorial', 'macro-editorial'][i], mode: 'manual',
      runId: String(index * 2 + i + 1), keyId: digest(key), requestDigest: digest(`request${index}${i}`), reservedMicroCny: POLICY.reserveMicroCny, reviewDigest: digest(review) },
    { id: randomUUID(), kind: 'outcome', time: iso(at + i * 10000 + 2000), reservationId: id, status: 'complete_unreconciled',
      requestIdDigest: digest(`response${index}${i}`), usage: { prompt_tokens: prompt, completion_tokens: output, total_tokens: prompt + output }, code: null }];
  });
  const ledger = { schemaVersion: 'deepseek-one-shot-v1', grant: { policy, authorizedAt: iso(at), authorizationEvidenceSha256: digest('synthetic authorization'), initializationParentSha: 'a'.repeat(40) }, reviews: [review], entries };
  validateOneShotLedger(ledger, NOW, policy.id);
  return { selection: policy.id, head: String(index + 1).repeat(40), genesisSha: String(index + 3).repeat(40), ledgerSha256: digest(ledger), ledger };
}
function input() {
  const snapshot = { observedAt: iso(NOW - 1000), calendarMonth: '2026-11', projectUtcOffsetMinutes: 0, exportUtcOffsetMinutes: 780,
    coveredFrom: '2026-10-31T11:00:00.000Z', coveredThrough: '2026-11-12T11:00:00.000Z', exportSha256: digest('synthetic export'),
    accountScopeEvidenceSha256: digest('synthetic all keys evidence'), accountSpendCny: '0.2643584', historicalDebitMicroCny: 2836985, keyId: digest(key),
    quiescenceEvidenceSha256: digest('synthetic all paths attestation'), unknownRequests: 0, allProjectPathsControlled: true,
    inventorySha256: digest('synthetic inventory'), earlyCompleted: [[17086,4740],[17188,5138],[17111,4845],null].map((u, i) => ({ runId: ['41526065601','41531578149','41534908718','41539541399'][i], completedAt: '2026-11-02T22:44:00.000Z', evidenceSha256: digest(`synthetic early${i}`), status: 'completed', usage: u ? { prompt_tokens:u[0], completion_tokens:u[1], total_tokens:u[0]+u[1] } : null })),
    legacy: [historic(GRANT, 0), historic(VERIFICATION_GRANT, 1)] };
  const grant = { policy: RECEIPT_GRANT, authorizedAt: iso(NOW - 500), expiresAt: iso(NOW + 3600000), authorizationEvidenceSha256: digest('synthetic one-call approval'), initializationParentSha: 'f'.repeat(40), snapshot };
  const review = { policyDigest: POLICY_DIGEST, verifiedAt: iso(NOW), expiresAt: iso(NOW + 86400000), evidenceSha256: digest('synthetic current price') };
  return { grant, review, approvedGrantDigest: digest(grant) };
}
function setup(changes = {}) {
  const data = input(); let ledger = prepareReceiptLedger(data, NOW), head = 0;
  const store = { read: async () => ({ head, ledger: structuredClone(ledger) }), write: async (old, next) => {
    if (old.head !== head) return false; validateReceiptTransition(ledger, next, NOW); ledger = structuredClone(next); head++; return true;
  } };
  const options = { store, approvedGrantDigest: data.approvedGrantDigest, approvedReviewDigest: digest(data.review), now: () => NOW,
    verifyExposure: async () => true, readBalance: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '10', granted_balance: '0', topped_up_balance: '10' }] }), ...changes };
  return { store, options, data, gate: createReceiptBudget(options) };
}
const context = (changes = {}) => ({ key, consumer: 'bubble-editorial', mode: 'manual', runId: '123', payload: {
  model: POLICY.model, temperature: 0.2, max_tokens: 8000, stream: false, thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
  messages: [{ role: 'system', content: 'JSON' }, { role: 'user', content: 'JSON' }] }, ...changes });
const response = () => ({ id: 'synthetic-result', object: 'chat.completion', created: NOW / 1000, model: POLICY.responseModel,
  usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] });
test('transitional ceiling double-counts receipt exposure without changing four old reservations', async () => {
  const { gate, store, options } = setup();
  const before = (await store.read()).ledger.grant.snapshot.legacy;
  const status = await verifyReceiptStatus(options);
  assert.equal(status.historicalUpperBoundMicroCny, 2836985); assert.equal(status.nextReservationMicroCny, 2161152);
  let calls = 0; await gate(context(), async () => { calls++; return response(); });
  await assert.rejects(gate(context(), () => assert.fail()), /session_stopped/);
  await assert.rejects(createReceiptBudget(options)(context(), () => assert.fail()), /grant_consumed/);
  const after = (await store.read()).ledger;
  assert.deepEqual(after.grant.snapshot.legacy, before); assert.equal(calls, 1);
  assert.equal(before.flatMap(x => x.ledger.entries).filter(x => x.kind === 'reserve').reduce((n, x) => n + x.reservedMicroCny, 0), 8644608);
  validateReceiptLedger(after, NOW + 400 * 86400000);
});
test('unknown or altered snapshot never prepares a grant', () => {
  const mutations = [s => { s.unknownRequests = 1; }, s => { s.allProjectPathsControlled = false; }, s => { s.accountSpendCny = '0.264358'; },
    s => { s.accountSpendCny = '9.9'; }, s => { s.historicalDebitMicroCny--; }, s => { s.calendarMonth = '2026-12'; }, s => { s.projectUtcOffsetMinutes = 780; },
    s => { s.coveredFrom = '2026-11-01T11:00:00.000Z'; }, s => { s.coveredThrough = '2026-11-11T11:00:00.000Z'; },
    s => { s.exportSha256 = ''; }, s => { s.inventorySha256 = ''; }, s => { s.earlyCompleted[0].usage.prompt_tokens++; }, s => { s.earlyCompleted[3].status = 'pending'; }, s => { s.earlyCompleted.pop(); }, s => { s.keyId = digest('other'); }, s => { s.legacy[0].head = ''; },
    s => { const l = s.legacy[0]; l.ledger.entries[1].status = 'failed_unknown'; l.ledger.entries[1].usage = null; l.ledgerSha256 = digest(l.ledger); },
    s => { const l = s.legacy[0]; l.ledger.entries.pop(); l.ledgerSha256 = digest(l.ledger); }];
  for (const mutate of mutations) {
    const data = input(); mutate(data.grant.snapshot); data.approvedGrantDigest = digest(data.grant);
    assert.throws(() => prepareReceiptLedger(data, NOW), /deepseek_budget_/);
  }
});
test('Macro, rotated key, automated calls, stale grants and unproven exposure cannot spend', async () => {
  for (const patch of [{ consumer: 'macro-editorial' }, { key: 'OTHER' }, { mode: 'automated' }, { runId: 'local' }]) {
    const { gate, store } = setup(); await assert.rejects(gate(context(patch), () => assert.fail()), /deepseek_budget_/);
    assert.equal((await store.read()).ledger.entries.length, 0);
  }
  for (const changes of [{ verifyExposure: undefined }, { verifyExposure: async () => false }, { now: () => NOW + 86400000 }]) {
    const { gate } = setup(changes); await assert.rejects(gate(context(), () => assert.fail()), /deepseek_budget_/);
  }
});
test('exposure change at dispatch consumes reservation and never calls provider', async () => {
  let reads = 0;
  const { gate, store } = setup({ verifyExposure: async () => ++reads === 1 });
  await assert.rejects(gate(context(), () => assert.fail()), /exposure_unproven/);
  assert.equal((await store.read()).ledger.entries.length, 1);
});
test('failed request remains permanently consumed and no refund transition exists', async () => {
  const { gate, store, options } = setup();
  await assert.rejects(gate(context(), async () => { throw new Error('synthetic timeout'); }), /timeout/);
  const { ledger } = await store.read(); assert.equal(ledger.entries[1].status, 'failed_unknown');
  await assert.rejects(createReceiptBudget(options)(context(), () => assert.fail()), /grant_consumed/);
  assert.throws(() => validateReceiptTransition(ledger, { ...ledger, entries: [] }, NOW), /history_changed/);
});
test('concurrent callers share one CAS reservation', async () => {
  const { options } = setup(); let calls = 0;
  const results = await Promise.allSettled([createReceiptBudget(options), createReceiptBudget(options)].map(gate => gate(context(), async () => { calls++; return response(); })));
  assert.equal(calls, 1); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});

test('live exposure verifier refuses changed heads, monthly activation, ongoing or unbounded runs and bad server time', async () => {
  const snapshot = input().grant.snapshot;
  for (const scenario of ['valid', 'head', 'monthly', 'ongoing', 'truncated', 'clock', 'body']) {
    let reads = 0;
    const verifier = createReceiptExposureVerifier({ token: 'synthetic', now: () => NOW, fetchImpl: async (url, init) => {
      reads++; assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
      let body, status = 200;
      if (url.includes('/git/ref/heads/deepseek-usage-ledger')) {
        status = scenario === 'monthly' ? 200 : 404; body = { object: { sha: '9'.repeat(40) } };
      } else if (url.includes('/git/ref/')) {
        const old = snapshot.legacy[url.includes('verification') ? 1 : 0];
        body = { object: { sha: scenario === 'head' ? '9'.repeat(40) : old.head } };
      } else if (url.includes('/contents/')) {
        const old = snapshot.legacy.find(x => url.endsWith(x.head));
        body = { encoding: 'base64', content: Buffer.from(JSON.stringify(scenario === 'body' ? {} : old.ledger)).toString('base64') };
      } else {
        body = { total_count: scenario === 'truncated' ? 101 : scenario === 'ongoing' ? 1 : 0,
          workflow_runs: scenario === 'ongoing' ? [{ id: 456, path: '.github/workflows/macro-risk-editorial-refresh.yml' }] : [] };
      }
      return new Response(JSON.stringify(body), { status, headers: { date: new Date(NOW - (scenario === 'clock' ? 120000 : 0)).toUTCString() } });
    } });
    if (scenario === 'valid') { assert.equal(await verifier(snapshot, '123'), true); assert.equal(reads, 10); }
    else await assert.rejects(verifier(snapshot, '123'), /deepseek_budget_/);
  }
});
test('runtime selects only explicit first-attempt Bubble manual execution and separate pins', () => {
  const env = { DEEPSEEK_BUDGET_SELECTION: RECEIPT_GRANT.id, DEEPSEEK_BUDGET_CONSUMER: 'bubble-editorial',
    GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site',
    GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '123',
    GITHUB_WORKFLOW_REF: 'ctmaomao/gfrr-auto-update-site/.github/workflows/bubble-watch-weekly-editorial-refresh.yml@refs/heads/main',
    DEEPSEEK_RECEIPT_20261112_GENESIS_SHA: 'a'.repeat(40), DEEPSEEK_RECEIPT_20261112_GRANT_SHA256: 'b'.repeat(64),
    DEEPSEEK_RECEIPT_20261112_PRICE_REVIEW_SHA256: 'c'.repeat(64), DEEPSEEK_BUDGET_GITHUB_TOKEN: 'synthetic' };
  assert.equal(receiptRuntimeConfig(env).approvedGrantDigest, 'b'.repeat(64));
  for (const patch of [{ GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_EVENT_NAME: 'workflow_run' }, { DEEPSEEK_BUDGET_CONSUMER: 'macro-editorial' },
    { GITHUB_REF: 'refs/heads/other' }, { DEEPSEEK_RECEIPT_20261112_GENESIS_SHA: undefined }])
    assert.throws(() => receiptRuntimeConfig({ ...env, ...patch }), /deepseek_budget_/);
});

test('real authorization may precede later evidence observation, never a future authorization', () => {
  const data = input(); data.grant.authorizedAt = iso(NOW - 10000); data.approvedGrantDigest = digest(data.grant);
  assert.doesNotThrow(() => prepareReceiptLedger(data, NOW));
  data.grant.authorizedAt = iso(NOW + 1); data.approvedGrantDigest = digest(data.grant);
  assert.throws(() => prepareReceiptLedger(data, NOW), /grant_invalid/);
});
