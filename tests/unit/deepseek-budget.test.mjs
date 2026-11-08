import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  appendPriceReview, appendVerifiedSettlement, BUDGET_BRANCH, BUDGET_REPOSITORY,
  createDeepSeekBudget, createGithubLedger, DEEPSEEK_URL, digest, POLICY, POLICY_DIGEST, RETIREMENT_MARGIN_MS,
  prepareBootstrapLedger, prepareRequest, readDeepSeekBalance, summarizeLedger,
  validateBalance, validateLedger, validateTransition, verifyBudgetStatus, withDeepSeekBudget
} from '../../scripts/lib/deepseek-budget.mjs';

const NOW = Date.parse('2026-11-08T12:00:00.000Z'), DAY = 86_400_000;
const key = 'PRIVATE_FAKE_DEEPSEEK_KEY';
const review = (at = NOW) => ({ policyDigest: POLICY_DIGEST, verifiedAt: new Date(at).toISOString(),
  expiresAt: new Date(at + DAY).toISOString(), evidenceSha256: 'b'.repeat(64) });
const bootstrap = () => ({ cutoverAt: new Date(NOW - 32 * DAY).toISOString(), evidenceSha256: 'a'.repeat(64),
  history: 'full-cap-quarantine', currency: 'CNY', historicalDebitMicroCny: 5_000_000,
  outstandingRequests: 0, ungatedConsumersDisabled: true });
const fresh = () => prepareBootstrapLedger({ bootstrap: bootstrap(), review: review() }, NOW);
const payload = () => ({ model: POLICY.model, temperature: 0.2, max_tokens: 8000, stream: false,
  thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
  messages: [{ role: 'system', content: 'PRIVATE_SYSTEM_PROMPT' }, { role: 'user', content: 'PRIVATE_USER_PROMPT' }] });
const context = changes => ({ key, payload: payload(), consumer: 'macro-editorial', mode: 'automated', runId: '100', ...changes });
const balance = () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '1.5', granted_balance: '0.0', topped_up_balance: '1.5' }] });
const response = () => ({ id: randomUUID(), object: 'chat.completion', created: NOW / 1000, model: POLICY.responseModel, usage: {
  prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, prompt_cache_hit_tokens: 20, prompt_cache_miss_tokens: 80
}, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] });
function memory(initial = fresh()) {
  let ledger = structuredClone(initial), head = 0;
  return { reads: 0, writes: 0,
    async read() { this.reads++; return { head, ledger: structuredClone(ledger) }; },
    async write(previous, next) { this.writes++; if (previous.head !== head) return false;
      ledger = structuredClone(next); head++; return true; }
  };
}
const gate = (store, options = {}) => createDeepSeekBudget({ store, readBalance: async () => balance(), approvedReviewDigest: digest(review()), now: () => NOW, ...options });
const reserve = (at = NOW, changes = {}) => ({ id: randomUUID(), kind: 'reserve', time: new Date(at).toISOString(),
  consumer: 'macro-editorial', mode: 'manual', runId: 'local', keyId: digest(key), requestDigest: digest(JSON.stringify(payload())),
  reservedMicroCny: POLICY.reserveMicroCny, reviewDigest: digest(review(at)), ...changes });
function settlement(reservation, changes = {}) {
  return { id: randomUUID(), kind: 'settlement', time: new Date(NOW).toISOString(), reservationId: reservation.id,
    currency: 'CNY', billedMicroCny: 2000, billingEvidenceSha256: 'c'.repeat(64), requestIdDigest: 'd'.repeat(64), model: POLICY.responseModel, ...changes };
}

test('fixed integer cap and full-context reserve are CNY5 and CNY2.161152, with no float estimates', () => {
  assert.equal(POLICY.capMicroCny, 5_000_000);
  assert.equal(POLICY.reserveMicroCny, POLICY.contextTokens * 2 + POLICY.maxOutputTokens * 8);
  assert.equal(POLICY.reserveMicroCny, 2_161_152);
  assert.equal(Object.isFrozen(POLICY), true);
  assert.throws(() => { POLICY.capMicroCny = 10_000_000; });
});

test('bootstrap is explicit, quarantines full cap for31 days and never infers history from balance', async () => {
  const b = { ...bootstrap(), cutoverAt: new Date(NOW).toISOString() };
  const ledger = prepareBootstrapLedger({ bootstrap: b, review: review() }, NOW);
  assert.equal(summarizeLedger(ledger, NOW).reservedMicroCny, 5_000_000);
  assert.equal(summarizeLedger(ledger, NOW + 31 * DAY).reservedMicroCny, 5_000_000);
  assert.equal(summarizeLedger(ledger, NOW + 31 * DAY + RETIREMENT_MARGIN_MS + 1).reservedMicroCny, 0);
  let reads = 0;
  await assert.rejects(gate(memory(ledger), { readBalance: async () => { reads++; return balance(); } })(context(), () => assert.fail('paid send')), /project_limit/);
  assert.equal(reads, 0);
  for (const change of [{ historicalDebitMicroCny: 0 }, { outstandingRequests: null }, { outstandingRequests: 1 },
    { ungatedConsumersDisabled: false }, { evidenceSha256: '' }, { history: 'assumed-zero' }, { currency: 'USD' }]) {
    assert.throws(() => prepareBootstrapLedger({ bootstrap: { ...b, ...change }, review: review() }, NOW), /bootstrap_unproven/);
  }
});

test('exact serialized immutable request is reserved before its sole provider callback', async () => {
  const store = memory(), reports = [];
  const result = await gate(store, { report: r => reports.push(r) })(context(), async prepared => {
    assert.equal(prepared.url, DEEPSEEK_URL); assert.equal(prepared.redirect, 'error');
    assert.equal(prepared.method, 'POST'); assert.equal(Object.isFrozen(prepared), true);
    assert.equal(Object.isFrozen(prepared.headers), true); assert.equal(prepared.body, JSON.stringify(payload()));
    const ledger = (await store.read()).ledger;
    assert.equal(ledger.entries.length, 1); assert.equal(ledger.entries[0].kind, 'reserve');
    assert.equal(ledger.entries[0].requestDigest, digest(prepared.body));
    assert.throws(() => { prepared.body = '{}'; });
    return response();
  });
  assert.equal(result.usage.total_tokens, 300);
  const ledger = (await store.read()).ledger;
  assert.equal(ledger.entries[1].status, 'complete_unreconciled');
  assert.equal(summarizeLedger(ledger, NOW).reservedMicroCny, POLICY.reserveMicroCny);
  assert.ok(!JSON.stringify([ledger, reports]).includes('PRIVATE_'));
});

test('aggregate two-consumer, both-mode, rotating-key cap allows two attempts, never three', async () => {
  const store = memory(); let calls = 0;
  for (const ctx of [context(), context({ consumer: 'bubble-editorial', mode: 'manual', key: 'rotated-key' })]) {
    await gate(store)(ctx, async () => { calls++; return response(); });
  }
  const status = await verifyBudgetStatus({ store, approvedReviewDigest: digest(review()), now: () => NOW });
  assert.equal(status.reservedMicroCny, 4_322_304); assert.equal(status.remainingMicroCny, 677_696);
  assert.equal(status.byConsumer['bubble-editorial'], 2_161_152);
  await assert.rejects(gate(store)(context({ key: 'another-key' }), () => { calls++; }), /project_limit/);
  assert.equal(calls, 2);
});

test('concurrent independent processes racing for last allowance have one confirmed CAS winner', async () => {
  const store = memory(); await gate(store)(context(), async () => response());
  let calls = 0;
  const outcomes = await Promise.allSettled(['macro-editorial', 'bubble-editorial'].map(consumer =>
    gate(store)(context({ consumer }), async () => { calls++; return response(); })));
  assert.equal(calls, 1); assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await store.read()).ledger.entries.filter(r => r.kind === 'reserve').length, 2);
  assert.equal(summarizeLedger((await store.read()).ledger, NOW).reservedMicroCny, 4_322_304);
});

test('ambiguous reserve persisted then threw: no paid send, no retry and permanent liability', async () => {
  const store = memory(), original = store.write.bind(store);
  store.write = async (...args) => { await original(...args); throw new Error('transport unknown'); };
  const run = gate(store); let calls = 0;
  await assert.rejects(run(context(), () => { calls++; }), /transport unknown/);
  await assert.rejects(run(context(), () => { calls++; }), /session_stopped/);
  assert.equal(calls, 0); assert.equal(store.writes, 1);
  assert.equal(summarizeLedger((await store.read()).ledger, NOW + 90 * DAY).reservedMicroCny, POLICY.reserveMicroCny);
});

test('false, null, undefined and truthy nonboolean reserve acknowledgments all stop before send', async () => {
  for (const acknowledgment of [false, null, undefined, 'true', { ok: true }]) {
    const store = memory(); store.write = async () => acknowledgment;
    await assert.rejects(gate(store)(context(), () => assert.fail('paid send')), /contention/);
  }
});

test('failed provider, timeout and no response retain full reservation with no retry', async () => {
  for (const failure of [new Error('HTTP503'), Object.assign(new Error('timeout'), { name: 'AbortError' })]) {
    const store = memory(); let calls = 0;
    await assert.rejects(gate(store)(context(), () => { calls++; throw failure; }), e => e === failure);
    assert.equal(calls, 1); assert.equal((await store.read()).ledger.entries[1].status, 'failed_unknown');
    assert.equal(summarizeLedger((await store.read()).ledger, NOW + 400 * DAY).reservedMicroCny, POLICY.reserveMicroCny);
  }
});

test('lost outcome write fails closed and leaves original full reservation', async () => {
  const store = memory(), original = store.write.bind(store); let writes = 0;
  store.write = (...args) => ++writes === 1 ? original(...args) : Promise.reject(new Error('gone'));
  const run = gate(store); let calls = 0;
  await assert.rejects(run(context(), async () => { calls++; return response(); }), /receipt_pending/);
  await assert.rejects(run(context(), () => { calls++; }), /session_stopped/);
  assert.equal(calls, 1); assert.equal((await store.read()).ledger.entries.length, 1);
});

test('missing/changed/unsafe request metadata and unsupported consumers cannot contact provider', async () => {
  for (const changes of [{ consumer: 'oil-news' }, { consumer: 'manual-external-ai' }, { consumer: '' }, { mode: 'override' },
    { runId: null }, { runId: 'rerun' }, { key: '' }]) {
    await assert.rejects(gate(memory())(context(changes), () => assert.fail('paid send')), /invalid_request/);
  }
  for (const change of [{ model: 'deepseek-reasoner' }, { max_tokens: 8001 }, { max_tokens: 1.5 }, { stream: true },
    { thinking: { type: 'enabled' } }, { temperature: 0.3 }, { tools: [] }, { n: 2 }, { response_format: null }, { messages: [] }]) {
    await assert.rejects(gate(memory())(context({ payload: { ...payload(), ...change } }), () => assert.fail('paid send')), /invalid_request/);
  }
  const p = payload(); delete p.thinking;
  assert.throws(() => prepareRequest(context({ payload: p })), /invalid_request/);
});

test('payload getters, toJSON, prototype objects and cycles are refused', () => {
  const getter = payload(); Object.defineProperty(getter, 'max_tokens', { get: () => 8000, enumerable: true });
  const cyclic = payload(); cyclic.self = cyclic;
  for (const p of [getter, cyclic, { ...payload(), toJSON: () => payload() }, Object.assign(Object.create(null), payload())]) {
    assert.throws(() => prepareRequest(context({ payload: p })), /invalid_request/);
  }
});

test('changing payload, key or consumer during reserve is stopped before dispatch and is not refunded', async () => {
  for (const mutate of [c => { c.payload.max_tokens = 16000; }, c => { c.payload.messages[1].content = 'changed'; },
    c => { c.key = 'new-key'; }, c => { c.consumer = 'bubble-editorial'; }]) {
    const store = memory(), original = store.write.bind(store), ctx = context();
    store.write = async (...args) => { const ok = await original(...args); mutate(ctx); return ok; };
    await assert.rejects(gate(store)(ctx, () => assert.fail('paid send')), /request_changed|invalid_request/);
    assert.equal((await store.read()).ledger.entries.length, 1);
  }
});

test('currency requires an unambiguous valid CNY balance, never a USD conversion or assumed zero', async () => {
  assert.deepEqual(validateBalance(balance()), { currency: 'CNY' });
  for (const b of [null, {}, { ...balance(), is_available: false }, { ...balance(), balance_infos: [] },
    { ...balance(), balance_infos: [...balance().balance_infos, ...balance().balance_infos] },
    ...['USD', null, 'RMB'].map(currency => ({ ...balance(), balance_infos: [{ ...balance().balance_infos[0], currency }] })),
    ...[null, 1, '-1', 'NaN', '1e9'].map(total_balance => ({ ...balance(), balance_infos: [{ ...balance().balance_infos[0], total_balance }] }))]) {
    const store = memory();
    await assert.rejects(gate(store, { readBalance: async () => b })(context(), () => assert.fail('paid send')), /currency_unknown/);
    assert.equal(store.writes, 0);
  }
});

test('malformed model, tokens, cache counters and billing produce durable contract hold', async () => {
  const malformed = [null, {}, { ...response(), model: 'deepseek-v4-pro' }, { ...response(), usage: null },
    { ...response(), usage: { prompt_tokens: 1, completion_tokens: 8001, total_tokens: 8002 } },
    { ...response(), usage: { prompt_tokens: 1.5, completion_tokens: 2, total_tokens: 3.5 } },
    { ...response(), usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 4 } },
    { ...response(), usage: { prompt_tokens: 1_048_576, completion_tokens: 1, total_tokens: 1_048_577 } },
    { ...response(), usage: { ...response().usage, prompt_cache_hit_tokens: 500 } },
    { ...response(), currency: 'USD' }, { ...response(), cost: 0 }, { ...response(), usage: { ...response().usage, total_cost: 0 } },
    { ...response(), id: null }, { ...response(), choices: [] }];
  for (const result of malformed) {
    const store = memory(); let calls = 0;
    await assert.rejects(gate(store)(context(), async () => { calls++; return result; }), /deepseek_budget_/);
    assert.equal(calls, 1); assert.equal((await store.read()).ledger.entries[1].status, 'contract_hold');
    await assert.rejects(gate(store)(context(), () => assert.fail('paid send')), /contract_hold/);
  }
});

test('price/model policy cannot be overridden, review must be independently pinned and expires in24 hours', async () => {
  for (const r of [ { ...review(), policyDigest: 'f'.repeat(64) }, { ...review(), expiresAt: new Date(NOW + DAY + 1).toISOString() },
    { ...review(), verifiedAt: new Date(NOW + 1).toISOString() }, { ...review(), rates: { input: 10 } }, { ...review(), evidenceSha256: '' } ]) {
    assert.throws(() => prepareBootstrapLedger({ bootstrap: bootstrap(), review: r }, NOW), /price_policy_unknown/);
  }
  for (const opts of [{ approvedReviewDigest: undefined }, { approvedReviewDigest: 'f'.repeat(64) }, { now: () => NOW + DAY }]) {
    await assert.rejects(gate(memory(), opts)(context(), () => assert.fail('paid send')), /price_review_required/);
  }
});

test('policy expiry between reserve and dispatch prevents send and keeps debit', async () => {
  const store = memory(), original = store.write.bind(store); let at = NOW;
  store.write = async (...args) => { const ok = await original(...args); at += DAY; return ok; };
  await assert.rejects(gate(store, { now: () => at })(context(), () => assert.fail('paid send')), /price_review_required/);
  assert.equal((await store.read()).ledger.entries.length, 1);
});

test('renewing reviewed price evidence never resets prior reservations or quarantined history', async () => {
  const store = memory(); await gate(store)(context(), async () => response());
  const previous = (await store.read()).ledger, nextReview = review(NOW + DAY);
  const renewed = appendPriceReview(previous, nextReview, digest(nextReview), NOW + DAY);
  assert.equal(renewed.reviews.length, 2); assert.deepEqual(renewed.entries, previous.entries);
  assert.equal(summarizeLedger(renewed, NOW + DAY).reservedMicroCny, POLICY.reserveMicroCny);
  assert.throws(() => appendPriceReview(previous, nextReview, 'f'.repeat(64), NOW + DAY), /price_review_required/);
  const newer = memory(renewed);
  await gate(newer, { approvedReviewDigest: digest(nextReview), now: () => NOW + DAY })(context(), async () => ({ ...response(), created: (NOW + DAY) / 1000 }));
  await assert.rejects(gate(newer, { approvedReviewDigest: digest(nextReview), now: () => NOW + DAY })(context(), () => assert.fail('paid send')), /project_limit/);
});

test('calendar boundaries and clock rollback cannot reset spend, and pending debt never ages away', async () => {
  const at = Date.parse('2026-10-31T23:59:59.000Z');
  const b = { ...bootstrap(), cutoverAt: new Date(at - 32 * DAY).toISOString() };
  const ledger = prepareBootstrapLedger({ bootstrap: b, review: review(at) }, at);
  const row = reserve(at), next = validateTransition(ledger, { ...ledger, entries: [row] }, at);
  assert.equal(summarizeLedger(next, at + 2000).reservedMicroCny, POLICY.reserveMicroCny);
  assert.equal(summarizeLedger(next, at + 400 * DAY).reservedMicroCny, POLICY.reserveMicroCny);
  assert.throws(() => summarizeLedger(next, at - 1), /price_policy_unknown|invalid_ledger/);
  let now = NOW; const store = memory(), run = gate(store, { now: () => now });
  await run(context(), async () => response()); now--;
  await assert.rejects(run(context(), () => assert.fail('paid send')), /clock_rollback/);
});

test('only independently approved provider billing evidence can settle, still charging the full reserve', () => {
  const row = reserve(), ledger = { ...fresh(), entries: [row] }, record = settlement(row);
  assert.throws(() => appendVerifiedSettlement(ledger, record, undefined, NOW), /billing_unknown/);
  const settled = appendVerifiedSettlement(ledger, record, digest(record), NOW);
  assert.equal(summarizeLedger(settled, NOW).reservedMicroCny, POLICY.reserveMicroCny);
  assert.equal(summarizeLedger(settled, NOW + 31 * DAY).reservedMicroCny, POLICY.reserveMicroCny);
  assert.equal(summarizeLedger(settled, NOW + 31 * DAY + RETIREMENT_MARGIN_MS + 1).reservedMicroCny, 0);
  assert.equal(settled.entries.length, 2);
  for (const change of [{ billedMicroCny: null }, { billedMicroCny: -1 }, { billedMicroCny: POLICY.reserveMicroCny + 1 },
    { currency: 'USD' }, { model: 'unknown' }, { billingEvidenceSha256: '' }, { requestIdDigest: '' }]) {
    const invalid = { ...record, ...change };
    assert.throws(() => appendVerifiedSettlement(ledger, invalid, digest(invalid), NOW), /billing_unknown/);
  }
});

test('historical rows, settlements, bootstrap and reviews cannot be erased, edited or refunded', () => {
  const row = reserve(), old = { ...fresh(), entries: [row] }, record = settlement(row);
  const settled = appendVerifiedSettlement(old, record, digest(record), NOW);
  const variants = [ { ...settled, entries: [] }, { ...settled, entries: [row] },
    { ...settled, bootstrap: { ...settled.bootstrap, evidenceSha256: 'e'.repeat(64) } },
    { ...settled, reviews: [{ ...review(), evidenceSha256: 'e'.repeat(64) }] },
    { ...settled, entries: [{ ...row, consumer: 'bubble-editorial' }, record] },
    { ...settled, entries: [row, { ...record, billedMicroCny: 0 }] } ];
  for (const changed of variants) assert.throws(() => validateTransition(settled, changed, NOW), /history_changed|invalid_ledger/);
  assert.throws(() => validateTransition(settled, { ...settled, entries: [...settled.entries, record] }, NOW), /invalid_ledger/);
});

test('independently reviewed complete history migration uses exact proved spend, never assumed zero', async () => {
  const b = { ...bootstrap(), history: 'reviewed-complete-history', cutoverAt: new Date(NOW).toISOString(),
    coveredFrom: new Date(NOW - 31 * DAY - RETIREMENT_MARGIN_MS).toISOString(), scope: 'both-editorial-consumers-all-keys',
    historicalDebitMicroCny: 2_000_000, historicalEntries: [{ recordSha256: 'd'.repeat(64),
      time: new Date(NOW - DAY).toISOString(), costMicroCny: 2_000_000 }] };
  assert.throws(() => prepareBootstrapLedger({ bootstrap: b, review: review() }, NOW), /bootstrap_unproven/);
  const ledger = prepareBootstrapLedger({ bootstrap: b, review: review(), approvedRecordDigest: digest(b) }, NOW);
  assert.equal(summarizeLedger(ledger, NOW).reservedMicroCny, 2_000_000);
  const store = memory(ledger); await gate(store)(context(), async () => response());
  await assert.rejects(gate(store)(context(), () => assert.fail('paid send')), /project_limit/);
  for (const change of [{ historicalDebitMicroCny: 0 }, { coveredFrom: new Date(NOW - DAY).toISOString() },
    { scope: 'current-key-only' }, { outstandingRequests: 1 }, { historicalEntries: [] }]) {
    const bad = { ...b, ...change };
    assert.throws(() => prepareBootstrapLedger({ bootstrap: bad, review: review(), approvedRecordDigest: digest(bad) }, NOW), /bootstrap_unproven/);
  }
  assert.deepEqual((await store.read()).ledger.bootstrap.historicalEntries, b.historicalEntries);
});

test('completed responses keep full reserve through31 days after completion without awaiting invoice', async () => {
  const store = memory(); let at = NOW;
  await gate(store, { now: () => at })(context(), async () => { at += 120_000; return response(); });
  const ledger = (await store.read()).ledger;
  assert.equal(summarizeLedger(ledger, at + 31 * DAY).reservedMicroCny, POLICY.reserveMicroCny);
  assert.equal(summarizeLedger(ledger, at + 31 * DAY + RETIREMENT_MARGIN_MS + 1).reservedMicroCny, 0);
  assert.equal(ledger.entries[1].status, 'complete_unreconciled');
  assert.equal(summarizeLedger(ledger, at).unresolved, 0);
});

function github(initial = fresh(), { authorityNow = () => NOW } = {}) {
  const genesis = 'a'.repeat(40), commits = new Map([[genesis, { ledger: initial, parents: [] }]]), trees = new Map();
  let head = genesis, serial = 1;
  const calls = [], sha = () => (++serial).toString(16).padStart(40, '0');
  const json = (data, status = 200) => Response.json(data, { status, headers: { date: new Date(authorityNow()).toUTCString() } });
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body }); assert.equal(init.redirect, 'error');
    const path = url.replace(`https://api.github.com/repos/${BUDGET_REPOSITORY}`, '');
    if (path === `/git/ref/heads/${BUDGET_BRANCH}`) return head ? json({ object: { sha: head } }) : json({}, 404);
    if (path.startsWith('/git/commits/')) {
      const hash = path.split('/').at(-1), c = commits.get(hash);
      return c ? json({ sha: hash, parents: c.parents.map(sha => ({ sha })) }) : json({}, 404);
    }
    if (path.startsWith('/contents/usage.json?ref=')) {
      const c = commits.get(path.split('=').at(-1));
      return c ? json({ encoding: 'base64', content: Buffer.from(JSON.stringify(c.ledger)).toString('base64') }) : json({}, 404);
    }
    if (path === '/git/trees') { const hash = sha(); trees.set(hash, JSON.parse(JSON.parse(init.body).tree[0].content)); return json({ sha: hash }, 201); }
    if (path === '/git/commits') { const body = JSON.parse(init.body), hash = sha(); commits.set(hash, { ledger: trees.get(body.tree), parents: body.parents }); return json({ sha: hash }, 201); }
    if (path === `/git/refs/heads/${BUDGET_BRANCH}`) {
      const body = JSON.parse(init.body); assert.equal(body.force, false);
      if (commits.get(body.sha)?.parents[0] !== head) return json({}, 422);
      head = body.sha; return json({ object: { sha: head } });
    }
    assert.fail(`unexpected request: ${path}`);
  };
  return { genesis, calls, commits, fetchImpl, setHead: value => { head = value; }, getHead: () => head,
    store: ({ now = () => NOW } = {}) => createGithubLedger({ token: 'PRIVATE_GITHUB_TOKEN', genesisSha: genesis, fetchImpl, now }) };
}

test('GitHub CAS uses the fixed separate ref, verified complete history and never touches main', async () => {
  const remote = github(), store = remote.store();
  await gate(store)(context(), async () => response());
  const snapshot = await store.read(); assert.equal(snapshot.ledger.entries.length, 2);
  assert.ok(remote.calls.every(c => !c.url.includes('/heads/main') && !c.url.includes('/protection')));
  assert.ok(remote.calls.filter(c => c.url.endsWith('/git/commits')).every(c => JSON.parse(c.body).parents.length === 1));
  assert.equal(summarizeLedger(snapshot.ledger, NOW).reservedMicroCny, POLICY.reserveMicroCny);
});

test('GitHub concurrent writes have a single CAS winner with no paid retries', async () => {
  const remote = github(); await gate(remote.store())(context(), async () => response());
  let paid = 0;
  const jobs = await Promise.allSettled([remote.store(), remote.store()].map(store => gate(store)(context(), async () => { paid++; return response(); })));
  assert.equal(paid, 1); assert.equal(jobs.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(summarizeLedger((await remote.store().read()).ledger, NOW).reservedMicroCny, 4_322_304);
});

test('deleted/uninitialized ref, wrong anchor, altered history and same-process rollback fail closed', async () => {
  assert.throws(() => createGithubLedger({ token: 'x' }), /uninitialized/);
  assert.throws(() => createGithubLedger({ genesisSha: 'a'.repeat(40) }), /credentials_missing/);
  const remote = github(), store = remote.store();
  await gate(store)(context(), async () => response());
  const latest = remote.getHead(); remote.setHead(remote.genesis);
  await assert.rejects(store.read(), /history_rollback/);
  remote.setHead(null); await assert.rejects(remote.store().read(), /uninitialized/);
  remote.setHead(latest);
  remote.commits.get(latest).ledger.entries[0].reservedMicroCny = 1;
  await assert.rejects(remote.store().read(), /invalid_ledger/);
  const second = github();
  const wrong = createGithubLedger({ token: 'x', genesisSha: 'f'.repeat(40), fetchImpl: second.fetchImpl, now: () => NOW });
  await assert.rejects(wrong.read(), /history_unproven/);
});

test('history truncation masked by a syntactically valid ledger is rejected against parent', async () => {
  const remote = github(); await gate(remote.store())(context(), async () => response());
  const original = remote.commits.get(remote.getHead());
  original.ledger.entries = [];
  await assert.rejects(remote.store().read(), /history_changed/);
});

test('GitHub write rejects mutated/unverified parent and missing server time', async () => {
  const remote = github(), store = remote.store(), previous = await store.read();
  const next = { ...structuredClone(previous.ledger), entries: [reserve()] };
  await assert.rejects(store.write({ ...previous }, next), /unproven_write_parent/);
  previous.ledger.bootstrap.evidenceSha256 = 'f'.repeat(64);
  await assert.rejects(store.write(previous, next), /unproven_write_parent/);
  const missingDate = createGithubLedger({ token: 'x', genesisSha: remote.genesis, now: () => NOW,
    fetchImpl: async () => Response.json({ object: { sha: remote.genesis } }) });
  await assert.rejects(missingDate.read(), /clock_unknown/);
});

test('read-only status never reserves, contacts provider or treats missing price approval as eligible', async () => {
  const store = memory(); store.write = () => assert.fail('status write');
  const status = await verifyBudgetStatus({ store, now: () => NOW, approvedReviewDigest: digest(review()) });
  assert.equal(status.admission, 'eligible_snapshot_only'); assert.equal(status.writes, 0); assert.equal(status.providerCalls, 0);
  const hold = await verifyBudgetStatus({ store, now: () => NOW }); assert.equal(hold.admission, 'deepseek_budget_price_review_required');
  assert.ok(!JSON.stringify(status).includes('PRIVATE_'));
});

test('read balance is one bounded read, refuses redirect and malformed data without leaking keys', async () => {
  for (const makeResponse of [() => new Response('PRIVATE_BODY', { status: 401 }), () => new Response('PRIVATE_BODY'), () => Response.json({})]) {
    let calls = 0;
    await assert.rejects(readDeepSeekBalance(key, async (url, init) => {
      calls++; assert.equal(url, 'https://api.deepseek.com/user/balance'); assert.equal(init.redirect, 'error'); return makeResponse();
    }), e => !e.message.includes('PRIVATE'));
    assert.equal(calls, 1);
  }
});

test('report failures never cause a second provider attempt or invalidate persisted accounting', async () => {
  const store = memory(); let calls = 0;
  await gate(store, { report: () => { throw new Error('log failed'); } })(context(), async () => { calls++; return response(); });
  assert.equal(calls, 1); assert.equal((await store.read()).ledger.entries.length, 2);
});


test('null, malformed, duplicate and corrupt ledgers are rejected rather than initialized', () => {
  for (const ledger of [null, {}, { ...fresh(), schemaVersion: 'unknown' }, { ...fresh(), entries: null },
    { ...fresh(), reviews: [] }, { ...fresh(), unexpected: 1 }]) assert.throws(() => validateLedger(ledger, NOW), /invalid_ledger/);
  const row = reserve();
  for (const entries of [[row, row], [{ ...row, reservedMicroCny: 0 }], [{ ...row, time: 'not-a-date' }],
    [{ ...row, consumer: 'oil-news' }], [{ ...row, extra: 'PRIVATE' }]]) {
    assert.throws(() => validateLedger({ ...fresh(), entries }, NOW), /invalid_ledger/);
  }
});

test('unknown prior outcome blocks subsequent processes even when nominal cap has room', async () => {
  const store = memory(), original = store.write.bind(store); let writes = 0;
  store.write = (...args) => ++writes === 1 ? original(...args) : Promise.reject(new Error('offline'));
  await assert.rejects(gate(store)(context(), async () => ({ ...response(), model: 'changed-priced-model' })), /model_changed/);
  assert.equal((await store.read()).ledger.entries.length, 1);
  await assert.rejects(gate(store)(context({ consumer: 'bubble-editorial' }), () => assert.fail('paid send')), /receipt_pending/);
  const summary = await verifyBudgetStatus({ store, approvedReviewDigest: digest(review()), now: () => NOW });
  assert.equal(summary.admission, 'deepseek_budget_receipt_pending');
  assert.equal(summary.reservedMicroCny, POLICY.reserveMicroCny);
});

test('receipt must prove a current complete nonthinking response, not just a token-like object', async () => {
  for (const change of [{ object: 'chat.completion.chunk' }, { created: NOW / 1000 - 120 }, { created: NOW / 1000 + 120 },
    { choices: [{ finish_reason: 'stop', message: { role: 'user', content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}', reasoning_content: 'hidden thought' } }] },
    { usage: { ...response().usage, completion_tokens_details: { reasoning_tokens: 1 } } }]) {
    const store = memory();
    await assert.rejects(gate(store)(context(), async () => ({ ...response(), ...change })), /receipt_unknown|model_changed/);
    assert.equal((await store.read()).ledger.entries[1].status, 'contract_hold');
  }
});


test('ambiguous GitHub ref update never dispatches; a fresh process sees the unresolved debit', async () => {
  const remote = github(); let updates = 0, paid = 0;
  const store = createGithubLedger({ token: 'fake', genesisSha: remote.genesis, now: () => NOW,
    fetchImpl: async (url, init) => {
      const result = await remote.fetchImpl(url, init);
      if (init.method === 'PATCH') { updates++; throw new Error('response lost after update'); }
      return result;
    } });
  await assert.rejects(gate(store)(context(), () => { paid++; }), /transport_unknown/);
  assert.equal(updates, 1); assert.equal(paid, 0);
  assert.equal((await remote.store().read()).ledger.entries.length, 1);
  await assert.rejects(gate(remote.store())(context({ consumer: 'bubble-editorial' }), () => { paid++; }), /receipt_pending/);
  assert.equal(paid, 0);
});

test('default runtime is disabled without configured authority and rejects foreign workflows before network', async () => {
  const names = ['DEEPSEEK_BUDGET_GITHUB_TOKEN', 'DEEPSEEK_BUDGET_GENESIS_SHA', 'DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256', 'GITHUB_ACTIONS', 'GITHUB_REPOSITORY'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('default fail-closed path must not contact any service');
  try {
    names.forEach(name => { delete process.env[name]; });
    await assert.rejects(withDeepSeekBudget(context(), () => assert.fail('paid send')), /credentials_missing/);
    process.env.GITHUB_ACTIONS = 'true'; process.env.GITHUB_REPOSITORY = 'another/repository';
    await assert.rejects(withDeepSeekBudget(context(), () => assert.fail('paid send')), /wrong_repository/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  }
});


function monthlyBootstrap() {
  return { ...bootstrap(), history: 'reviewed-current-calendar-month', cutoverAt: new Date(NOW).toISOString(),
    historicalDebitMicroCny: 150_000, calendarMonth: '2026-11', calendarUtcOffsetMinutes: 480,
    coveredFrom: '2026-10-31T16:00:00.000Z', scope: 'account-all-keys-upper-bound', accountEvidenceSha256: 'c'.repeat(64),
    quiescence: { ungatedPathsDisabledAt: new Date(NOW - 600_000).toISOString(),
      allRequestsFinishedBy: new Date(NOW - 600_000).toISOString(), evidenceSha256: 'd'.repeat(64) },
    dashboard: { observedAt: new Date(NOW - 30_000).toISOString(), reportedSpendMicroCny: 140_000,
      displayQuantumMicroCny: 10_000, reportedCalls: 4, reportingLagMs: 300_000,
      lagBoundEvidenceSha256: 'e'.repeat(64), evidenceSha256: 'f'.repeat(64) } };
}
const prepareMonthly = (b, at = NOW) => prepareBootstrapLedger({ bootstrap: b, review: review(at), approvedRecordDigest: digest(b) }, at);

test('opposite accepted production clocks cannot admit a third full attempt before January month end', async () => {
  let actualNow = Date.parse('2027-01-01T00:00:30.000Z');
  const firstLocal = actualNow - 60_000;
  const firstReview = review(firstLocal);
  const initial = prepareBootstrapLedger({ bootstrap: { ...bootstrap(), cutoverAt: new Date(firstLocal - 32 * DAY).toISOString() },
    review: firstReview }, firstLocal);
  const remote = github(initial, { authorityNow: () => actualNow }); let paid = 0;
  for (const consumer of ['macro-editorial', 'bubble-editorial']) {
    await gate(remote.store({ now: () => firstLocal }), { now: () => firstLocal, approvedReviewDigest: digest(firstReview) })(
      context({ consumer }), async () => { paid++; return { ...response(), created: actualNow / 1000 }; });
  }
  actualNow = Date.parse('2027-01-31T23:58:31.000Z');
  const laterLocal = actualNow + 60_000;
  assert.equal(laterLocal, firstLocal + 31 * DAY + 1000); // Vulnerable code retired both at this point.
  const newReview = review(laterLocal), store = remote.store({ now: () => laterLocal }), previous = await store.read();
  assert.equal(await store.write(previous, appendPriceReview(previous.ledger, newReview, digest(newReview), laterLocal)), true);
  await assert.rejects(gate(remote.store({ now: () => laterLocal }), { now: () => laterLocal,
    approvedReviewDigest: digest(newReview) })(context(), async () => { paid++; return response(); }), /project_limit/);
  assert.equal(paid, 2);
  assert.equal(summarizeLedger((await store.read()).ledger, laterLocal).reservedMicroCny, 4_322_304);
});

test('bootstrap, completed reservations and settlements all retain through the full crossclock margin', async () => {
  assert.equal(RETIREMENT_MARGIN_MS, 152_000);
  const b = { ...bootstrap(), cutoverAt: new Date(NOW).toISOString() };
  const quarantine = prepareBootstrapLedger({ bootstrap: b, review: review() }, NOW);
  const row = reserve(), complete = { id: randomUUID(), kind: 'outcome', time: new Date(NOW).toISOString(),
    reservationId: row.id, status: 'complete_unreconciled', requestIdDigest: 'e'.repeat(64),
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, code: null };
  const recorded = { ...fresh(), entries: [row, complete] };
  const bill = settlement(row), settled = appendVerifiedSettlement({ ...fresh(), entries: [row] }, bill, digest(bill), NOW);
  for (const [ledger, expected] of [[quarantine, POLICY.capMicroCny], [recorded, POLICY.reserveMicroCny], [settled, POLICY.reserveMicroCny]]) {
    for (const extra of [1, 120_000, RETIREMENT_MARGIN_MS]) {
      assert.equal(summarizeLedger(ledger, NOW + 31 * DAY + extra).reservedMicroCny, expected);
    }
    assert.equal(summarizeLedger(ledger, NOW + 31 * DAY + RETIREMENT_MARGIN_MS + 1).reservedMicroCny, 0);
  }
});

test('price review also holds conservatively before expiry under a slow local clock', async () => {
  const at = NOW + DAY - RETIREMENT_MARGIN_MS / 2;
  await assert.rejects(gate(memory(), { now: () => at })(context(), () => assert.fail('paid send')), /price_review_required/);
});

test('proved current-month all-key aggregate rounds CNY0.14 upward to0.15 and permits at most two new attempts', async () => {
  const b = monthlyBootstrap();
  for (const approvedRecordDigest of [undefined, '0'.repeat(64)]) {
    assert.throws(() => prepareBootstrapLedger({ bootstrap: b, review: review(), approvedRecordDigest }, NOW), /bootstrap_unproven/);
  }
  const ledger = prepareMonthly(b), store = memory(ledger); let paid = 0;
  assert.equal(summarizeLedger(ledger, NOW).reservedMicroCny, 150_000);
  for (const consumer of ['macro-editorial', 'bubble-editorial']) {
    await gate(store)(context({ consumer }), async () => { paid++; return response(); });
  }
  assert.equal(summarizeLedger((await store.read()).ledger, NOW).reservedMicroCny, 4_472_304);
  await assert.rejects(gate(store)(context(), () => { paid++; }), /project_limit/);
  assert.equal(paid, 2); assert.deepEqual((await store.read()).ledger.bootstrap, b);
});

test('zero displayed monthly spend still reserves a full precision quantum and needs proved history', () => {
  const b = monthlyBootstrap(); b.dashboard.reportedSpendMicroCny = 0; b.dashboard.reportedCalls = 0;
  b.historicalDebitMicroCny = 10_000;
  assert.equal(summarizeLedger(prepareMonthly(b), NOW).reservedMicroCny, 10_000);
  assert.throws(() => prepareMonthly({ ...b, historicalDebitMicroCny: 0 }), /bootstrap_unproven/);
});

test('monthly bootstrap requires the verified fixed billing calendar, exact month start and all-key scope', () => {
  const b = monthlyBootstrap();
  for (const change of [{ calendarMonth: '2026-10' }, { calendarMonth: '2026-13' }, { calendarMonth: 'November' },
    { coveredFrom: '2026-11-01T00:00:00.000Z' }, { calendarUtcOffsetMinutes: 0 },
    { calendarUtcOffsetMinutes: '480' }, { calendarUtcOffsetMinutes: 900 }, { calendarUtcOffsetMinutes: 1 },
    { scope: 'current-key-only' }, { accountEvidenceSha256: '' }, { displayTimeZone: 'Asia/Shanghai' }]) {
    assert.throws(() => prepareMonthly({ ...b, ...change }), /bootstrap_unproven/);
  }
  const utc = { ...b, calendarUtcOffsetMinutes: 0, coveredFrom: '2026-11-01T00:00:00.000Z' };
  assert.equal(prepareMonthly(utc).bootstrap.calendarUtcOffsetMinutes, 0);
});

test('monthly dashboard precision, aggregate currency, call count and independent lag-bound proof must be known', () => {
  const b = monthlyBootstrap();
  for (const change of [{ reportedSpendMicroCny: 149_999 }, { reportedSpendMicroCny: null },
    { reportedSpendMicroCny: -10_000 }, { displayQuantumMicroCny: 1 }, { reportedCalls: null }, { reportedCalls: 0 },
    { reportingLagMs: 299_999 }, { reportingLagMs: 300_001 }, { lagBoundEvidenceSha256: null }, { evidenceSha256: '' }]) {
    assert.throws(() => prepareMonthly({ ...b, dashboard: { ...b.dashboard, ...change } }), /bootstrap_unproven/);
  }
  for (const change of [{ historicalDebitMicroCny: 140_000 }, { currency: 'USD' }, { outstandingRequests: 1 }, { ungatedConsumersDisabled: false }]) {
    assert.throws(() => prepareMonthly({ ...b, ...change }), /bootstrap_unproven/);
  }
});

test('bootstrap observation must follow proven path shutdown AND request completion plus lag and clock margin', () => {
  const b = monthlyBootstrap();
  const q = Math.max(Date.parse(b.quiescence.ungatedPathsDisabledAt), Date.parse(b.quiescence.allRequestsFinishedBy));
  const threshold = q + POLICY.dashboardReportingLagMs + RETIREMENT_MARGIN_MS;
  const exact = { ...b, dashboard: { ...b.dashboard, observedAt: new Date(threshold).toISOString() } };
  assert.equal(prepareMonthly(exact).bootstrap.dashboard.observedAt, exact.dashboard.observedAt);
  assert.throws(() => prepareMonthly({ ...exact, dashboard: { ...exact.dashboard, observedAt: new Date(threshold - 1).toISOString() } }), /bootstrap_unproven/);
  for (const change of [{ ungatedPathsDisabledAt: new Date(NOW - 100_000).toISOString() },
    { allRequestsFinishedBy: new Date(NOW - 100_000).toISOString() }, { evidenceSha256: '' }, { allRequestsFinishedBy: null }]) {
    assert.throws(() => prepareMonthly({ ...b, quiescence: { ...b.quiescence, ...change } }), /bootstrap_unproven/);
  }
});

test('monthly bootstrap requires fresh current-month matching evidence, not a later invented cutover', () => {
  const b = monthlyBootstrap();
  const old = { ...b, quiescence: { ...b.quiescence,
    ungatedPathsDisabledAt: new Date(NOW - DAY).toISOString(), allRequestsFinishedBy: new Date(NOW - DAY).toISOString() },
    dashboard: { ...b.dashboard, observedAt: new Date(NOW - POLICY.maxBootstrapEvidenceAgeMs - 1).toISOString() } };
  assert.throws(() => prepareMonthly(old), /bootstrap_unproven/);
  assert.throws(() => prepareMonthly({ ...b, dashboard: { ...b.dashboard, observedAt: new Date(NOW + 1).toISOString() } }), /bootstrap_unproven/);
  assert.throws(() => prepareMonthly(b, NOW + 32 * DAY), /bootstrap_unproven/);
  const immutable = prepareMonthly(b);
  assert.doesNotThrow(() => validateLedger(immutable, NOW + 32 * DAY)); // Retained history remains valid; never reinitialize.
});

test('monthly bootstrap debt is immutable and kept31 days plus crossclock margin, independent of old-month totals', () => {
  const b = monthlyBootstrap(), ledger = prepareMonthly(b);
  const later = appendPriceReview(ledger, review(NOW + DAY), digest(review(NOW + DAY)), NOW + DAY);
  assert.deepEqual(later.bootstrap, b);
  assert.equal(summarizeLedger(later, NOW + 31 * DAY + 120_000).reservedMicroCny, 150_000);
  assert.equal(summarizeLedger(later, NOW + 31 * DAY + RETIREMENT_MARGIN_MS + 1).reservedMicroCny, 0);
  const altered = { ...later, bootstrap: { ...b, historicalDebitMicroCny: 10_000, dashboard: { ...b.dashboard, reportedSpendMicroCny: 0 } } };
  assert.throws(() => validateTransition(later, altered, NOW + DAY), /history_changed/);
});


test('monthly bootstrap refuses ambiguous current-month boundaries under opposite clock errors', () => {
  const b = monthlyBootstrap(), start = Date.parse(b.coveredFrom), end = Date.parse('2026-11-30T16:00:00.000Z');
  for (const at of [start + 30_000, end - 30_000]) {
    const edge = { ...b, cutoverAt: new Date(at).toISOString(),
      dashboard: { ...b.dashboard, observedAt: new Date(at - 1000).toISOString() },
      quiescence: { ...b.quiescence, ungatedPathsDisabledAt: new Date(at - DAY).toISOString(),
        allRequestsFinishedBy: new Date(at - DAY).toISOString() } };
    assert.throws(() => prepareMonthly(edge, at), /bootstrap_unproven/);
  }
  const at = start + RETIREMENT_MARGIN_MS / 2 + 1000;
  const safe = { ...b, cutoverAt: new Date(at).toISOString(), dashboard: { ...b.dashboard, observedAt: new Date(at).toISOString() },
    quiescence: { ...b.quiescence, ungatedPathsDisabledAt: new Date(at - DAY).toISOString(), allRequestsFinishedBy: new Date(at - DAY).toISOString() } };
  assert.doesNotThrow(() => prepareMonthly(safe, at));
});

// Preserve the real adapter's header check while injecting a wall-clock step
// strictly inside the awaited response-body read (including the final done read).
function stepDuringBody(response, step, when = 'chunk') {
  const reader = response.body.getReader(); let stepped = false;
  return { ok: response.ok, status: response.status, headers: response.headers,
    body: { cancel: () => reader.cancel(), getReader: () => ({ cancel: () => reader.cancel(),
      async read() {
        const item = await reader.read();
        if (!stepped && (when === 'done' ? item.done : !item.done)) { stepped = true; step(); }
        return item;
      }
    }) }
  };
}

test('real GitHub adapter rejects exact January expiry bypass caused by a154s mid-content-read clock step', async () => {
  let authority = Date.parse('2027-01-01T00:00:00.000Z'), local = authority;
  const firstReview = review(local), initial = prepareBootstrapLedger({
    bootstrap: { ...bootstrap(), cutoverAt: new Date(local - 32 * DAY).toISOString() }, review: firstReview }, local);
  const remote = github(initial, { authorityNow: () => authority }); let paid = 0;
  for (const consumer of ['macro-editorial', 'bubble-editorial']) {
    await gate(remote.store({ now: () => local }), { now: () => local, approvedReviewDigest: digest(firstReview) })(
      context({ consumer }), async () => { paid++; return { ...response(), created: authority / 1000 }; });
  }
  authority = Date.parse('2027-01-31T23:59:59.000Z'); local = authority;
  const renewed = review(local), renewalStore = remote.store({ now: () => local }), previous = await renewalStore.read();
  assert.equal(await renewalStore.write(previous, appendPriceReview(previous.ledger, renewed, digest(renewed), local)), true);
  const before = remote.getHead(); let stepped = false;
  const store = createGithubLedger({ token: 'fake', genesisSha: remote.genesis, now: () => local,
    fetchImpl: async (url, init) => {
      const result = await remote.fetchImpl(url, init);
      if (!stepped && url.includes('/contents/usage.json?ref=')) {
        stepped = true; local += 154_000; // All HTTP Date headers remain the true January31 time.
      }
      return result;
    } });
  await assert.rejects(gate(store, { now: () => local, approvedReviewDigest: digest(renewed) })(
    context(), async () => { paid++; return { ...response(), created: authority / 1000 }; }), /clock_unknown/);
  assert.equal(stepped, true); assert.equal(paid, 2); assert.equal(remote.getHead(), before);
  local = authority;
  assert.equal(summarizeLedger((await remote.store({ now: () => local }).read()).ledger, local).reservedMicroCny, 4_322_304);
});

test('clock bounds are rechecked during both metadata body chunks and final body completion', async () => {
  for (const when of ['chunk', 'done']) {
    const remote = github(); let local = NOW, paid = 0, stepped = false;
    const store = createGithubLedger({ token: 'fake', genesisSha: remote.genesis, now: () => local,
      fetchImpl: async (url, init) => {
        const result = await remote.fetchImpl(url, init);
        if (!stepped && url.includes('/contents/usage.json?ref=')) {
          return stepDuringBody(result, () => { stepped = true; local += 154_000; }, when);
        }
        return result;
      } });
    await assert.rejects(gate(store, { now: () => local })(context(), () => { paid++; }), /clock_unknown/);
    assert.equal(stepped, true); assert.equal(paid, 0); assert.equal(remote.getHead(), remote.genesis);
  }
});

test('mid-write clock steps on tree or commit response stop before the durable ref and before paid dispatch', async () => {
  for (const suffix of ['/git/trees', '/git/commits']) {
    const remote = github(); let local = NOW, paid = 0, stepped = false;
    const store = createGithubLedger({ token: 'fake', genesisSha: remote.genesis, now: () => local,
      fetchImpl: async (url, init) => {
        const result = await remote.fetchImpl(url, init);
        if (init.method === 'POST' && url.endsWith(suffix)) { stepped = true; local += 154_000; }
        return result;
      } });
    await assert.rejects(gate(store, { now: () => local })(context(), () => { paid++; }), /clock_unknown/);
    assert.equal(stepped, true); assert.equal(paid, 0); assert.equal(remote.getHead(), remote.genesis);
    assert.equal(remote.calls.filter(c => c.method === 'PATCH').length, 0);
  }
});

test('accepted ref write with a clock step at headers or body completion keeps pending debt and never calls provider', async () => {
  for (const when of ['headers', 'chunk', 'done']) {
    const remote = github(); let local = NOW, paid = 0, stepped = false;
    const store = createGithubLedger({ token: 'fake', genesisSha: remote.genesis, now: () => local,
      fetchImpl: async (url, init) => {
        const result = await remote.fetchImpl(url, init); // PATCH really succeeds before the local clock step.
        if (init.method === 'PATCH') {
          const step = () => { stepped = true; local += 154_000; };
          if (when === 'headers') step(); else return stepDuringBody(result, step, when);
        }
        return result;
      } });
    await assert.rejects(gate(store, { now: () => local })(context(), () => { paid++; }), /clock_unknown/);
    assert.equal(stepped, true); assert.equal(paid, 0); assert.notEqual(remote.getHead(), remote.genesis);
    local = NOW;
    const ledger = (await remote.store().read()).ledger;
    assert.equal(ledger.entries.length, 1); assert.equal(ledger.entries[0].kind, 'reserve');
    await assert.rejects(gate(remote.store())(context({ consumer: 'bubble-editorial' }), () => { paid++; }), /receipt_pending/);
    assert.equal(paid, 0);
  }
});

test('the last synchronous dispatch check refuses a clock step after successful reservation write returns', async () => {
  const remote = github(); let local = NOW, paid = 0;
  const store = remote.store({ now: () => local }), originalWrite = store.write.bind(store);
  store.write = async (...args) => { const confirmed = await originalWrite(...args); local += 154_000; return confirmed; };
  await assert.rejects(gate(store, { now: () => local })(context(), () => { paid++; }), /clock_unknown/);
  assert.equal(paid, 0);
  local = NOW;
  assert.equal((await remote.store().read()).ledger.entries.length, 1);
  await assert.rejects(gate(remote.store())(context(), () => { paid++; }), /receipt_pending/);
  assert.equal(paid, 0);
});

test('every GitHub metadata response requires a current Date, not only the initial ref', async () => {
  const targets = [
    (url, init) => init.method === 'GET' && url.includes('/git/ref/'),
    (url, init) => init.method === 'GET' && url.includes('/git/commits/'),
    (url, init) => init.method === 'GET' && url.includes('/contents/'),
    (url, init) => init.method === 'POST' && url.endsWith('/git/trees'),
    (url, init) => init.method === 'POST' && url.endsWith('/git/commits'),
    (_url, init) => init.method === 'PATCH'
  ];
  for (const target of targets) {
    const remote = github(); let paid = 0, intercepted = false;
    const store = createGithubLedger({ token: 'fake', genesisSha: remote.genesis, now: () => NOW,
      fetchImpl: async (url, init) => {
        const result = await remote.fetchImpl(url, init);
        if (target(url, init)) { intercepted = true; result.headers.delete('date'); }
        return result;
      } });
    await assert.rejects(gate(store)(context(), () => { paid++; }), /clock_unknown/);
    assert.equal(intercepted, true); assert.equal(paid, 0);
  }
});

test('a clock jump during the balance await is refused before any reservation mutation', async () => {
  const remote = github(); let local = NOW, paid = 0;
  await assert.rejects(gate(remote.store({ now: () => local }), { now: () => local,
    readBalance: async () => { local += 154_000; return balance(); } })(context(), () => { paid++; }), /clock_unknown/);
  assert.equal(paid, 0); assert.equal(remote.calls.some(c => c.method !== 'GET'), false);
});


test('metadata duration uses a monotonic deadline even if an abort timer has not run and wall clock stays unchanged', async t => {
  const remote = github(); let elapsed = 0, paid = 0;
  t.mock.method(performance, 'now', () => elapsed);
  const store = createGithubLedger({ token: 'fake', genesisSha: remote.genesis, now: () => NOW,
    fetchImpl: async (url, init) => {
      const result = await remote.fetchImpl(url, init);
      if (url.includes('/contents/usage.json?ref=')) elapsed += POLICY.metadataTimeoutMs + 1;
      return result;
    } });
  await assert.rejects(gate(store)(context(), () => { paid++; }), /transport_unknown/);
  assert.equal(paid, 0); assert.equal(remote.getHead(), remote.genesis);
});
