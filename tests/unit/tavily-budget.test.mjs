import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createGithubLedger, createTavilyBudget, emptyLedger, POLICY, readTavilyUsage, reserveCredit, summarizeLedger, validateLedger, verifyBudgetStatus } from '../../scripts/lib/tavily-budget.mjs';
import { collectProvider as macro } from '../../scripts/macro-risk/collect-editorial-news.mjs';
import { collectProvider as bubble } from '../../scripts/bubble-watch/collect-weekly-editorial-news.mjs';
import { createSearchKeyPool } from '../../scripts/lib/search-key-pool.mjs';

const clock = Date.parse('2026-09-18T07:00:00.000Z');
const usage = () => ({ account: { plan_usage: 40, plan_limit: 1000, paygo_usage: 0, paygo_limit: 0 }, key: { usage: 40, limit: 1000 } });
const normalized = { planUsage: 40, planLimit: 1000, keyUsage: 40, keyLimit: 1000 };
const context = { key: 'PRIVATE_TEST_SECRET', payload: { search_depth: 'basic', query: 'PRIVATE_QUERY' }, consumer: 'macro-editorial', mode: 'automated', runId: '123' };
function row(change = {}) { return { id: randomUUID(), time: new Date(clock).toISOString(), consumer: 'oil-news', mode: 'automated', keyId: 'a'.repeat(16), credits: 1, state: 'success', accountUsageBefore: 0, reportedCredits: 1, runId: '123', ...change }; }
function memory(entries = []) {
  let ledger = { ...emptyLedger(), entries }, head = 0;
  return { async read() { return { head, ledger: structuredClone(ledger) }; }, async write(old, next) {
    if (old.head !== head) return false;
    ledger = structuredClone(next); head++; return true;
  } };
}
function gate(store, options = {}) { return createTavilyBudget({ store, readUsage: async () => usage(), now: () => clock, ...options }); }

test('deployment probe reads deduplicated meters and reports holds without reserving, searching or exposing keys', async () => {
  const store = memory();
  store.write = () => assert.fail('read-only probe must not write');
  let reads = 0;
  const status = await verifyBudgetStatus({ store, keys: [context.key, context.key], now: () => clock,
    readUsage: async () => { reads++; const meter = usage(); meter.account.plan_usage = 1000; return meter; } });
  assert.equal(reads, 1);
  assert.equal(status.searches, 0);
  assert.equal(status.writes, 0);
  assert.equal(status.reservedCredits, 0);
  assert.equal(status.meters[0].admission.automated, 'tavily_budget_account_limit');
  assert.equal(status.meters[0].admission.manual, 'tavily_budget_account_limit');
  assert.ok(!JSON.stringify(status).includes(context.key));
  await assert.rejects(verifyBudgetStatus({ store, keys: [], now: () => clock }), /key_missing/);
  await assert.rejects(verifyBudgetStatus({ store, keys: [context.key], now: () => clock, readUsage: async () => ({}) }), /usage_unknown/);
  const workflow = readFileSync('.github/workflows/tavily-budget-status.yml', 'utf8');
  assert.ok(workflow.includes('contents: read'));
  assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(workflow.includes('review-tavily-budget.mjs --verify'));
  assert.ok(!workflow.includes('contents: write'));
  assert.ok(!workflow.includes('schedule:'));
});

test('usage report groups by key, UTC day, mode and consumer without treating missing receipts as zero billing', () => {
  const ledger = { ...emptyLedger(), entries: [row(), row({ state: 'reserved', reportedCredits: null }),
    row({ keyId: 'b'.repeat(16), mode: 'manual', consumer: 'bubble-ceo', state: 'failed', reportedCredits: null, time: '2026-09-17T01:00:00.000Z' }),
    row({ time: '2026-08-01T01:00:00.000Z' })] };
  const report = summarizeLedger(ledger, clock);
  assert.equal(report.reservedCredits, 3);
  assert.deepEqual(report.byKey['a'.repeat(16)], { reserved: 2, success: 1, failed: 0, pending: 1, reportedCredits: 1, unreportedRequests: 1 });
  assert.equal(report.byDayUtc['2026-09-17'].failed, 1);
  assert.equal(report.byMode.manual.reserved, 1);
  assert.equal(report.byConsumer['bubble-ceo'].unreportedRequests, 1);
  assert.equal(Object.keys(report.byDayUtc).length, 2);
});

test('reservation persists before network; known usage and outcome stored without query/key', async () => {
  const store = memory(), reports = [];
  const result = await gate(store, { report: row => reports.push(row) })(context, async () => {
    assert.equal((await store.read()).ledger.entries[0].state, 'reserved');
    return { results: [], usage: { credits: 1 } };
  });
  assert.equal(result.usage.credits, 1);
  const ledger = (await store.read()).ledger;
  assert.equal(ledger.entries[0].state, 'success');
  assert.equal(ledger.entries[0].reportedCredits, 1);
  assert.ok(!JSON.stringify([ledger, reports]).includes('PRIVATE_'));
});

test('all three rolling caps count failures and pending calls; elapsed calendar month does not reset', () => {
  for (const [mode, limit] of [['automated', 800], ['manual', 150]]) {
    const entries = Array.from({ length: limit }, () => row({ mode, state: 'failed', time: '2026-08-31T01:00:00.000Z' }));
    assert.throws(() => reserveCredit({ ...emptyLedger(), entries }, row({ mode, state: 'reserved' }), normalized, clock), /project_limit/);
  }
  const entries = [...Array.from({ length: 800 }, () => row()), ...Array.from({ length: 150 }, () => row({ mode: 'manual' }))];
  assert.throws(() => reserveCredit({ ...emptyLedger(), entries }, row(), normalized, clock), /project_limit/);
  entries.forEach(r => { r.time = '2026-08-17T07:00:00.000Z'; });
  assert.equal(reserveCredit({ ...emptyLedger(), entries }, row(), normalized, clock).entries.length, 951);
});

test('account exhausted, lower key limit, malformed meter, or unreadable ledger sends no search', async () => {
  for (const meter of [null, { account: {} }, { ...usage(), account: { ...usage().account, plan_usage: 1000 } }, { ...usage(), key: { usage: 50, limit: 50 } }]) {
    let calls = 0;
    await assert.rejects(gate(memory(), { readUsage: async () => meter })(context, async () => { calls++; }), /tavily_budget_/);
    assert.equal(calls, 0);
  }
  await assert.rejects(gate({ read: async () => { throw new Error('unavailable'); } })(context, () => assert.fail('network')), /unavailable/);
});

test('concurrent jobs compete for last credit via CAS; only one provider callback runs', async () => {
  const store = memory(Array.from({ length: 799 }, () => row()));
  let calls = 0;
  const jobs = [gate(store), gate(store)];
  const outcomes = await Promise.allSettled(jobs.map(run => run(context, async () => { calls++; return {}; })));
  assert.equal(calls, 1);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await store.read()).ledger.entries.length, 800);
});

test('uncertain reservation never sends or retries search even if write actually persisted', async () => {
  const store = memory(), write = store.write;
  store.write = async (...args) => { await write(...args); throw new Error('uncertain'); };
  const run = gate(store); let calls = 0;
  await assert.rejects(run(context, () => { calls++; }), /uncertain/);
  await assert.rejects(run(context, () => { calls++; }), /session_stopped/);
  assert.equal(calls, 0);
  assert.equal((await store.read()).ledger.entries[0].state, 'reserved');
});

test('provider failure and unknown timeout are charged conservatively without search retry', async () => {
  const store = memory(); let calls = 0;
  await assert.rejects(gate(store)(context, () => { calls++; throw new Error('HTTP 432'); }), /432/);
  assert.equal(calls, 1);
  assert.equal((await store.read()).ledger.entries[0].state, 'failed');
  assert.equal((await store.read()).ledger.entries[0].credits, 1);
});

test('missing completion retains reservation and stops further calls in this process', async () => {
  const store = memory(), write = store.write;
  let writes = 0;
  store.write = (...args) => { if (++writes > 1) throw new Error('gone'); return write(...args); };
  const run = gate(store);
  await run(context, async () => ({ results: [] }));
  assert.equal((await store.read()).ledger.entries[0].state, 'reserved');
  await assert.rejects(run(context, () => assert.fail('network')), /session_stopped/);
});

test('pending credits also reduce observed account balance', () => {
  assert.throws(() => reserveCredit({ ...emptyLedger(), entries: [row({ state: 'reserved' })] }, row(), { ...normalized, planUsage: 949 }, clock), /account_limit/);
  assert.equal(reserveCredit(emptyLedger(), row(), { ...normalized, planUsage: 949 }, clock).entries.length, 1);
});

test('a competing completed call during usage read still consumes the last account credit', async () => {
  const store = memory();
  const run = gate(store, { readUsage: async () => {
    const previous = await store.read();
    await store.write(previous, { ...emptyLedger(), entries: [row()] });
    return { ...usage(), account: { ...usage().account, plan_usage: 949 } };
  } });
  await assert.rejects(run(context, () => assert.fail('unobserved competing spend must block')), /account_limit/);
});

test('advanced, auto-routing, malformed ledger and clock rollback fail closed', async () => {
  for (const payload of [{ search_depth: 'advanced' }, { search_depth: 'basic', auto_parameters: true }]) {
    await assert.rejects(gate(memory())({ ...context, payload }, () => assert.fail('network')), /invalid_request/);
  }
  for (const entries of [[row({ credits: 0 })], [row({ time: '2026-09-19T00:00:00.000Z' })], [row({ reportedCredits: 2 })], [row({ unexpected: 'PRIVATE' })]]) {
    assert.throws(() => validateLedger({ ...emptyLedger(), entries }, clock), /invalid_ledger/);
  }
  const duplicate = row();
  assert.throws(() => validateLedger({ ...emptyLedger(), entries: [duplicate, duplicate] }, clock), /invalid_ledger/);
});

test('unexpected higher provider cost blocks future processes until reviewed', async () => {
  const store = memory();
  await assert.rejects(gate(store)(context, async () => ({ usage: { credits: 2 } })), /cost_contract_changed/);
  await assert.rejects(gate(store)(context, () => assert.fail('network')), /invalid_ledger/);
});

test('budget errors cannot fall through to another key', async () => {
  const pool = createSearchKeyPool(['one', 'two']); let calls = 0;
  await assert.rejects(pool(async () => { calls++; throw Object.assign(new Error('hold'), { budgetCode: 'tavily_budget_project_limit' }); }), /hold/);
  assert.equal(calls, 1);
});

test('actual editorial collectors preserve error diagnostics with real budget hold and zero searches', async () => {
  for (const collect of [macro, bubble]) {
    const budget = gate(memory(), { readUsage: async () => ({ ...usage(), account: { ...usage().account, plan_usage: 1000 } }) });
    const result = await collect('tavily', ['synthetic-key'], { budget });
    assert.equal(result.status.status, 'error');
    assert.equal(result.status.failureCount, 6);
    assert.ok(result.status.queryRuns.every(row => row.error.startsWith('tavily_budget_')));
  }
});

test('GitHub adapter uses pinned content and non-force CAS; never writes main', async () => {
  const requests = [], head = 'a'.repeat(40), next = 'b'.repeat(40);
  const store = createGithubLedger({ token: 'PRIVATE_TOKEN', fetchImpl: async (url, init) => {
    requests.push({ url, method: init.method, body: init.body });
    assert.equal(init.redirect, 'error');
    if (url.endsWith('/git/ref/heads/tavily-usage-ledger')) return Response.json({ object: { sha: head } });
    if (url.includes('/contents/')) { assert.ok(url.endsWith(`?ref=${head}`)); return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify(emptyLedger())).toString('base64') }); }
    if (url.endsWith('/git/trees')) return Response.json({ sha: next }, { status: 201 });
    if (url.endsWith('/git/commits')) { assert.deepEqual(JSON.parse(init.body).parents, [head]); return Response.json({ sha: next }, { status: 201 }); }
    assert.equal(JSON.parse(init.body).force, false);
    return Response.json({ object: { sha: next } });
  } });
  assert.equal(await store.write(await store.read(), emptyLedger()), true);
  assert.ok(requests.every(row => !row.url.includes('/heads/main')));
});

test('missing GitHub ledger cannot silently restart budget; initialization is explicit', async () => {
  const store = createGithubLedger({ token: 'x', fetchImpl: async () => new Response('', { status: 404 }) });
  await assert.rejects(store.read(), /uninitialized/);
});

test('usage reader does not retry or expose credentials, rejects redirect and bad JSON', async () => {
  for (const response of [() => new Response('PRIVATE_ERROR', { status: 401 }), () => new Response('PRIVATE_ERROR')]) {
    let calls = 0;
    await assert.rejects(readTavilyUsage('PRIVATE_KEY', async (url, init) => {
      calls++; assert.equal(url, 'https://api.tavily.com/usage'); assert.equal(init.redirect, 'error'); return response();
    }), error => !error.message.includes('PRIVATE'));
    assert.equal(calls, 1);
  }
});

test('all four production search paths are guarded and every consuming workflow passes ledger token', () => {
  for (const file of ['scripts/macro-risk/collect-editorial-news.mjs', 'scripts/bubble-watch/collect-weekly-editorial-news.mjs', 'scripts/oil-directional/diagnose-oil-news-events.mjs', 'scripts/build-bubble-watch.mjs']) {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(text, /withTavilyBudget/u);
    assert.equal(text.split('https://api.tavily.com/search').length - 1, 1);
  }
  for (const file of ['macro-risk-editorial-refresh', 'bubble-watch-weekly-editorial-refresh', 'refresh-oil-news-event-watch', 'refresh-bubble-watch', 'audit-bubble-watch-sources']) {
    const text = readFileSync(new URL(`../../.github/workflows/${file}.yml`, import.meta.url), 'utf8');
    assert.equal(text.split('TAVILY_API_KEYS:').length, text.split('TAVILY_BUDGET_GITHUB_TOKEN:').length);
    assert.match(text, /contents: write/u);
  }
  assert.equal(POLICY.automated + POLICY.manual, POLICY.total);
});
