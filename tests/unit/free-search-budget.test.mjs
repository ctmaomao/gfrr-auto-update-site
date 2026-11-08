import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createBraveBudget, emptyBraveLedger, summarizeBraveLedger, validateBraveLedger, activateBraveGrant, createBraveLedger } from '../../scripts/lib/brave-budget.mjs';
import { createMeteredTavilyUsage, emptyMeterLedger as newMeterLedger, validateMeterLedger, createTavilyMeterStore } from '../../scripts/lib/tavily-usage-meter.mjs';
import { keyFingerprint, createSearchLedger } from '../../scripts/lib/free-search-ledger.mjs';
import { createTavilyBudget, emptyLedger, validateUsage, verifyBudgetStatus, summarizeLedger } from '../../scripts/lib/tavily-budget.mjs';
import { createSearchKeyPool } from '../../scripts/lib/search-key-pool.mjs';
import { collectProvider as macro } from '../../scripts/macro-risk/collect-editorial-news.mjs';
import { collectProvider as bubble } from '../../scripts/bubble-watch/collect-weekly-editorial-news.mjs';
import { runDiagnosis } from '../../scripts/oil-directional/diagnose-oil-news-events.mjs';

const clock = Date.parse('2026-11-08T12:00:00.000Z');
// Existing fixture authority was initialized before the full conservative startup window.
const emptyMeterLedger = (initializedAt = new Date(clock - 662000).toISOString()) => newMeterLedger(initializedAt);
const key = 'SYNTHETIC_ONLY_SECRET';
const context = { key, consumer: 'oil-news', mode: 'automated', runId: '42' };
const usage = () => ({ account: { current_plan: 'Researcher', plan_usage: 100, plan_limit: 1000, paygo_usage: null, paygo_limit: null }, key: { usage: 100, limit: 1000 } });
const grant = (change = {}) => ({ id: randomUUID(), keyId: keyFingerprint(key), source: 'owner_dashboard', scope: 'exclusive_repository_key',
  evidenceRef: 'synthetic-fixture', zeroChargeConfirmed: true, requestLimit: 1000, usageAtActivation: 994,
  verifiedAt: '2026-11-08T11:00:00.000Z', expiresAt: '2026-11-09T11:00:00.000Z', ...change });
const funded = (change = {}) => ({ ...emptyBraveLedger(), grants: [grant(change)] });
function memory(initial) {
  let ledger = structuredClone(initial), head = 0, serverTime = clock;
  return { setServerTime(value) { serverTime = value; }, async read() { return { head, serverTime, ledger: structuredClone(ledger) }; }, async write(previous, next) {
    if (previous.head !== head) return false;
    ledger = structuredClone(next); head++;
    return true;
  } };
}
const braveGate = store => createBraveBudget({ store, now: () => clock });
const never = () => assert.fail('Provider must not be called');
const rejectedResponse = status => Object.assign(new Error(`HTTP ${status}`), { httpStatus: status, providerResponseReceived: true });
const source = readFileSync('scripts/build-bubble-watch.mjs', 'utf8');
function ceoApi(fetchImpl, braveBudget, tavilyBudget) {
  const start = source.indexOf('const ceoTavilyKeyPool =');
  const end = source.indexOf('async function fetchCeoHedgingFromTavilyPublic', start);
  return vm.runInNewContext(`${source.slice(start, end)}\n({ braveNewsSearch, tavilySearch })`, {
    createSearchKeyPool, TAVILY_API_KEYS: [key], BRAVE_API_KEYS: [key], withBraveBudget: braveBudget,
    withTavilyBudget: tavilyBudget, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, UA: 'offline-test'
  });
}

test('Tavily accepts only evidenced Researcher free plan and explicit disabled PAYGO', () => {
  assert.equal(validateUsage(usage()).planLimit, 1000);
  for (const patch of [{ current_plan: undefined }, { current_plan: 'Free' }, { current_plan: 'paid' }, { paygo_usage: 1 }, { paygo_limit: 1 }, { paygo_limit: undefined }, { plan_limit: 1001 }]) {
    assert.throws(() => validateUsage({ ...usage(), account: { ...usage().account, ...patch } }), /tavily_budget_/);
  }
});

test('production read-only verification never calls usage and reports unknown, not eligibility', async () => {
  const store = memory(emptyLedger()); store.write = never;
  const result = await verifyBudgetStatus({ store, keys: [key], now: () => clock });
  assert.equal(result.status, 'tavily_budget_usage_unavailable');
  assert.equal(result.eligible, false);
  assert.deepEqual(result.meters, []);
  assert.equal(result.writes, 0);
  assert.equal(result.searches, 0);
});

test('meter reserves before every usage request and shares 10/10-minute cap across keys, success, failed and pending', async () => {
  const initial = emptyMeterLedger();
  initial.entries = Array.from({ length: 8 }, (_, index) => ({ id: randomUUID(), keyId: 'a'.repeat(16), time: new Date(clock).toISOString(), state: ['reserved','failed','success'][index % 3] }));
  const store = memory(initial); let calls = 0;
  for (const providerKey of ['one', 'two']) {
    const read = createMeteredTavilyUsage({ store, now: () => clock, readUsage: async () => {
      calls++; assert.equal((await store.read()).ledger.entries.at(-1).state, 'reserved'); return usage();
    } });
    await read(providerKey);
  }
  await assert.rejects(createMeteredTavilyUsage({ store, now: () => clock, readUsage: never })('third'), /meter_rate_limit/);
  assert.equal(calls, 2);
  assert.equal((await store.read()).ledger.entries.length, 10);
  store.setServerTime(clock + 600000);
  await assert.rejects(createMeteredTavilyUsage({ store, now: () => clock + 600000, readUsage: never })(key), /meter_rate_limit/);
  store.setServerTime(clock + 661001);
  await createMeteredTavilyUsage({ store, now: () => clock + 661001, readUsage: async () => usage() })(key);
  assert.equal((await store.read()).ledger.entries.length, 11, 'historical attempt records are preserved');
});

test('meter concurrent last slot is CAS protected; uncertain reserve sends no usage', async () => {
  const initial = emptyMeterLedger();
  initial.entries = Array.from({ length: 9 }, () => ({ id: randomUUID(), keyId: 'a'.repeat(16), time: new Date(clock).toISOString(), state: 'success' }));
  const store = memory(initial); let calls = 0;
  const results = await Promise.allSettled([1,2].map(() => createMeteredTavilyUsage({ store, now: () => clock, readUsage: async () => { calls++; return usage(); } })(key)));
  assert.equal(calls, 1);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  const uncertain = memory(emptyMeterLedger()), write = uncertain.write;
  uncertain.write = async (...args) => { await write(...args); throw new Error('uncertain'); };
  await assert.rejects(createMeteredTavilyUsage({ store: uncertain, now: () => clock, readUsage: never })(key), /uncertain/);
  assert.equal((await uncertain.read()).ledger.entries[0].state, 'reserved');
});

test('meter failed response consumes attempt and missing receipt stops search without stale usage reuse', async () => {
  const store = memory(emptyMeterLedger());
  await assert.rejects(createMeteredTavilyUsage({ store, now: () => clock, readUsage: async () => { throw new Error('HTTP 429'); } })(key), /429/);
  assert.equal((await store.read()).ledger.entries[0].state, 'failed');
  const missing = memory(emptyMeterLedger()), write = missing.write;
  let writes = 0;
  missing.write = (...args) => ++writes === 1 ? write(...args) : Promise.reject(new Error('receipt unavailable'));
  const read = createMeteredTavilyUsage({ store: missing, now: () => clock, readUsage: async () => usage() });
  const search = createTavilyBudget({ store: memory(emptyLedger()), readUsage: read, now: () => clock });
  await assert.rejects(search({ ...context, payload: { search_depth: 'basic' } }, never), /receipt unavailable/);
  await assert.rejects(read(key), /session_stopped/);
  assert.equal((await missing.read()).ledger.entries[0].state, 'reserved');
});

test('meter invalid/duplicate/future state and unreadable authority fail closed', async () => {
  const row = { id: randomUUID(), keyId: 'a'.repeat(16), time: new Date(clock).toISOString(), state: 'reserved' };
  for (const entries of [[row, row], [{ ...row, time: new Date(clock + 1).toISOString() }], [{ ...row, state: 'ignored' }]]) {
    assert.throws(() => validateMeterLedger({ ...emptyMeterLedger(), entries }, clock), /invalid_ledger/);
  }
  await assert.rejects(createMeteredTavilyUsage({ store: { read: async () => { throw new Error('store missing'); } }, readUsage: never })(key), /store missing/);
});

test('Brave no charge assurance alone does not create quota; missing, expired, unknown scope, or wrong key holds', async () => {
  const unknown = memory(emptyBraveLedger());
  assert.equal(summarizeBraveLedger((await unknown.read()).ledger, clock).remainingVerifiedRequests, null);
  await assert.rejects(braveGate(unknown)(context, never), /quota_unknown/);
  await assert.rejects(braveGate(memory(funded({ expiresAt: new Date(clock).toISOString() })))(context, never), /grant_expired/);
  await assert.rejects(braveGate(memory(funded()))({ ...context, key: 'different-account-or-key' }, never), /key_scope_unknown/);
  for (const patch of [{ requestLimit: null }, { usageAtActivation: null }, { zeroChargeConfirmed: false }, { scope: 'unknown' }, { source: 'rate_limit_header' }, { evidenceRef: '' }, { requestLimit: 2000, usageAtActivation: 0 }]) {
    assert.throws(() => validateBraveLedger(funded(patch), clock), /grant_invalid/);
  }
});

test('Brave persists each reservation, counters and outcomes without credentials, queries or claimed money balance', async () => {
  const store = memory(funded());
  await braveGate(store)(context, async () => { assert.equal((await store.read()).ledger.entries[0].state, 'reserved'); return { results: [] }; });
  await assert.rejects(braveGate(store)(context, async () => { throw new Error('timeout'); }), /provider_outcome_unknown/);
  const ledger = (await store.read()).ledger;
  const report = summarizeBraveLedger(ledger, clock);
  assert.equal(report.reservedRequests, 2);
  assert.equal(report.remainingVerifiedRequests, 4);
  assert.deepEqual(report.byConsumer['oil-news'], { reserved: 2, success: 1, failed: 0, pending: 1 });
  assert.equal(report.monetaryBalance, 'unavailable_no_official_api');
  assert.ok(!JSON.stringify([ledger, report]).includes(key));
});

test('Brave concurrent last free request admits only one callback and unknown writes never send', async () => {
  const store = memory(funded({ usageAtActivation: 999 })); let calls = 0;
  const results = await Promise.allSettled([1,2].map(() => braveGate(store)(context, async () => { calls++; return { results: [] }; })));
  assert.equal(calls, 1);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal((await store.read()).ledger.entries.length, 1);
  const uncertain = memory(funded()), write = uncertain.write;
  uncertain.write = async (...args) => { await write(...args); throw new Error('uncertain'); };
  const run = braveGate(uncertain);
  await assert.rejects(run(context, never), /uncertain/);
  await assert.rejects(run(context, never), /session_stopped/);
  assert.equal((await uncertain.read()).ledger.entries[0].state, 'reserved');
});

test('Brave pending/failure counts do not reset at month change; missing receipt stops local session', async () => {
  const store = memory(funded({ verifiedAt: '2026-10-31T11:00:00.000Z', expiresAt: '2026-11-15T11:00:00.000Z', usageAtActivation: 999 }));
  const write = store.write; let writes = 0;
  store.write = (...args) => ++writes === 1 ? write(...args) : Promise.reject(new Error('receipt unknown'));
  const run = braveGate(store);
  await run(context, async () => ({ results: [] }));
  await assert.rejects(run(context, never), /session_stopped/);
  const snapshot = (await store.read()).ledger;
  assert.equal(snapshot.entries[0].state, 'reserved');
  await assert.rejects(braveGate(memory(snapshot))(context, never), /quota_exhausted/);
});

for (const status of [402,429,432,433]) test(`Brave HTTP ${status} creates durable unknown-quota hold and cannot rotate keys`, async () => {
  const store = memory(funded()), pool = createSearchKeyPool([key, 'other']); let calls = 0;
  await assert.rejects(pool(providerKey => braveGate(store)({ ...context, key: providerKey }, async () => { calls++; throw rejectedResponse(status); })), /provider_quota_unknown/);
  assert.equal(calls, 1);
  const ledger = (await store.read()).ledger;
  assert.equal(ledger.entries[0].state, 'failed');
  assert.equal(ledger.hold.code, 'brave_budget_provider_quota_unknown');
  await assert.rejects(braveGate(store)(context, never), /provider_quota_unknown/);
});

test('explicit Brave reconciliation appends evidence, preserves history and refuses pending or changed account scope', async () => {
  const store = memory(funded({ usageAtActivation: 999 }));
  await assert.rejects(braveGate(store)(context, async () => { throw rejectedResponse(429); }), /provider_quota_unknown/);
  const fresh = grant({ verifiedAt: new Date(clock + 1).toISOString() });
  const renewed = await activateBraveGrant({ store, grant: fresh, now: () => clock + 2 });
  assert.equal(renewed.grants.length, 2);
  assert.equal(renewed.entries.length, 1);
  assert.equal(renewed.hold, null);
  assert.equal(summarizeBraveLedger(renewed, clock + 2).rollingRequests, 1);
  await assert.rejects(activateBraveGrant({ store, grant: grant({ keyId: 'b'.repeat(16), verifiedAt: new Date(clock + 3).toISOString() }), now: () => clock + 4 }), /grant_invalid/);
  const pending = structuredClone(renewed); pending.entries[0].state = 'reserved'; pending.entries[0].finishedAt = null;
  await assert.rejects(activateBraveGrant({ store: memory(pending), grant: grant({ verifiedAt: new Date(clock + 3).toISOString() }), now: () => clock + 4 }), /activation_pending_accounting/);
});

test('Brave project cap spans explicitly renewed grants and cannot be raised by dashboard limit or rotation', async () => {
  const ledger = funded({ requestLimit: 1000, usageAtActivation: 50 });
  ledger.entries = Array.from({ length: 950 }, () => ({ id: randomUUID(), grantId: ledger.grants[0].id, keyId: keyFingerprint(key),
    time: new Date(clock).toISOString(), consumer: 'oil-news', mode: 'manual', runId: 'local', requests: 1, state: 'failed', finishedAt: new Date(clock).toISOString() }));
  const store = memory(ledger);
  await activateBraveGrant({ store, grant: grant({ verifiedAt: new Date(clock + 1).toISOString() }), now: () => clock + 2 });
  await assert.rejects(createBraveBudget({ store, now: () => clock + 2 })(context, never), /project_limit/);
});

for (const [name, collect, consumer] of [['macro',macro,'macro-editorial'],['bubble',bubble,'bubble-editorial']]) test(`${name} actual search callers reserve both providers and report Brave unknown with zero searches`, async t => {
  const braveStore = memory(funded()), tavilyStore = memory(emptyLedger());
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); return Response.json({ results: [], usage: { credits: 1 } }); });
  const brave = await collect('brave', [key], { braveBudget: braveGate(braveStore) });
  const tavily = await collect('tavily', [key], { budget: createTavilyBudget({ store: tavilyStore, readUsage: async () => usage(), now: () => clock }) });
  assert.equal(brave.status.status, 'ok'); assert.equal(tavily.status.status, 'ok');
  assert.equal(calls, 12);
  assert.ok((await braveStore.read()).ledger.entries.every(row => row.consumer === consumer && row.state === 'success'));
  assert.ok((await tavilyStore.read()).ledger.entries.every(row => row.consumer === consumer && row.state === 'success'));
  calls = 0;
  const held = await collect('brave', [key, 'another'], { braveBudget: braveGate(memory(emptyBraveLedger())) });
  assert.equal(calls, 0); assert.equal(held.status.failureCount, 6);
  assert.ok(held.status.queryRuns.every(row => row.error.startsWith('brave_budget_')));
});

test('oil actual collector accounts both providers with injected durable fake ledgers and holds unknown Brave', async t => {
  const oldCwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'gfrr-free-search-'));
  process.chdir(directory);
  t.after(() => { process.chdir(oldCwd); rmSync(directory, { recursive: true, force: true }); });
  const names = ['TAVILY_API_KEYS','TAVILY_API_KEY','BRAVE_API_KEYS','BRAVE_API_KEY'];
  const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => { for (const name of names) if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; });
  process.env.TAVILY_API_KEYS = key; process.env.BRAVE_API_KEYS = key;
  process.env.TAVILY_API_KEY = ''; process.env.BRAVE_API_KEY = '';
  const braveStore = memory(funded()), tavilyStore = memory(emptyLedger()); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); return Response.json({ results: [], usage: { credits: 1 } }); });
  const options = { allowNetwork: true, sources: ['tavily','brave'], windowDays: 7, maxResults: 5, writeOutput: false,
    braveBudget: braveGate(braveStore), budget: createTavilyBudget({ store: tavilyStore, readUsage: async () => usage(), now: () => clock }) };
  const result = await runDiagnosis(options);
  assert.ok(result.sourceResults.every(row => row.status === 'ok'));
  assert.equal(calls, 8);
  assert.equal((await braveStore.read()).ledger.entries.length, 4);
  assert.equal((await tavilyStore.read()).ledger.entries.length, 4);
  calls = 0;
  const held = await runDiagnosis({ ...options, sources: ['brave'], braveBudget: braveGate(memory(emptyBraveLedger())) });
  assert.equal(calls, 0);
  assert.ok(held.sourceResults[0].queryRuns.every(row => row.error.startsWith('brave_budget_')));
});

test('CEO actual transport functions use shared accounting and key pool, with zero requests on unknown quota', async () => {
  const braveStore = memory(funded()), tavilyStore = memory(emptyLedger()); let calls = 0;
  const api = ceoApi(async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); return Response.json({ results: [], usage: { credits: 1 } }); },
    braveGate(braveStore), createTavilyBudget({ store: tavilyStore, readUsage: async () => usage(), now: () => clock }));
  await api.braveNewsSearch(new URLSearchParams({ q: 'synthetic' }));
  await api.tavilySearch({ search_depth: 'basic', query: 'synthetic' });
  assert.equal(calls, 2);
  assert.equal((await braveStore.read()).ledger.entries[0].consumer, 'bubble-ceo');
  assert.equal((await tavilyStore.read()).ledger.entries[0].consumer, 'bubble-ceo');
  const held = ceoApi(never, braveGate(memory(emptyBraveLedger())), never);
  await assert.rejects(held.braveNewsSearch(new URLSearchParams()), /quota_unknown/);
});

test('CEO-only fallback removal preserves unrelated existing Wind configuration and audit opt-in', () => {
  assert.ok(!source.includes('fetchCeoHedgingFromWindNews'));
  assert.ok(!source.includes('capSingleSourceCeoHedgingRed'));
  const start = source.indexOf('function readWindApiKey()'), end = source.indexOf('function readSecretList', start);
  const readConfiguredKey = env => vm.runInNewContext(`${source.slice(start, end)}\nreadWindApiKey()`, {
    process: { env }, fs: new Proxy({}, { get: never }), os: new Proxy({}, { get: never })
  });
  assert.equal(readConfiguredKey({ WIND_API_KEY: 'SYNTHETIC', BUBBLE_WATCH_DISABLE_WIND: '0' }), 'SYNTHETIC');
  assert.equal(readConfiguredKey({ WIND_API_KEY: 'SYNTHETIC', BUBBLE_WATCH_DISABLE_WIND: '1' }), '');
  assert.match(readFileSync('.github/workflows/refresh-bubble-watch.yml', 'utf8'), /WIND_API_KEY: \$\{\{ secrets.WIND_API_KEY \}\}/u);
  assert.ok(readFileSync('.github/workflows/audit-bubble-watch-sources.yml', 'utf8').includes('allow_paid_wind:'));
  assert.ok(readFileSync('scripts/audit-bubble-watch-sources.mjs', 'utf8').includes("const allowPaidWind = args.has('--allow-paid-wind')"));
});

test('CEO exhausted free paths cannot call paid fallback or invent a result', async () => {
  const start = source.indexOf('async function fetchCeoHedgingWithTieredSources()'), end = source.indexOf('const hybridCuratedBuilders', start);
  const run = vm.runInNewContext(`${source.slice(start,end)}\nfetchCeoHedgingWithTieredSources`, {
    fetchCeoHedgingFromGdeltPublic: async () => { throw new Error('offline'); }, hasAnyCeoHedgingSearchKey: () => true,
    collectCeoHedgingFreeSearchConfirmations: async () => [], fetchCeoHedgingFromWindNews: never, console: { warn() {} }
  });
  await assert.rejects(run(), /CEO Wind fallback disabled by free-only search policy/);
});

test('shared accounting adapter pins immutable read, CAS parent and isolated branch; no missing-state reset', async () => {
  for (const branch of ['brave-usage-ledger','tavily-meter-ledger']) {
    const head = 'a'.repeat(40), next = 'b'.repeat(40), requests = [];
    const replyJson = (body, init = {}) => Response.json(body, { ...init, headers: { Date: new Date(clock).toUTCString() } });
    const initial = branch.startsWith('brave') ? emptyBraveLedger() : emptyMeterLedger();
    const store = createSearchLedger({ branch, prefix: 'test_budget', token: 'synthetic', now: () => clock, initialLedger: () => initial, fetchImpl: async (url, init) => {
      requests.push(url); assert.equal(init.redirect, 'error');
      if (url.includes('/git/ref/heads/')) return replyJson({ object: { sha: head } });
      if (url.includes('/contents/')) { assert.ok(url.endsWith(`?ref=${head}`)); return replyJson({ encoding: 'base64', content: Buffer.from(JSON.stringify(initial)).toString('base64') }); }
      if (url.endsWith('/git/trees')) return replyJson({ sha: next }, { status: 201 });
      if (url.endsWith('/git/commits')) { assert.deepEqual(JSON.parse(init.body).parents, [head]); return replyJson({ sha: next }, { status: 201 }); }
      assert.equal(JSON.parse(init.body).force, false); return replyJson({ object: { sha: next } });
    } });
    assert.equal(await store.write(await store.read(), initial), true);
    await assert.rejects(store.initialize(), /initialization_refused/);
    assert.ok(requests.every(url => !url.includes('/heads/main')));
  }
  for (const factory of [createBraveLedger, createTavilyMeterStore]) {
    const store = factory({ token: 'synthetic', now: () => clock, fetchImpl: async () => new Response('', { status: 404, headers: { Date: new Date(clock).toUTCString() } }) });
    await assert.rejects(store.read(), /uninitialized/);
  }
});

test('meter metadata delay cannot shorten the provider window or dispatch a stale reservation', async () => {
  const store = memory(emptyMeterLedger()), write = store.write; let time = clock;
  store.write = async (...args) => { const saved = await write(...args); time += 30001; return saved; };
  await assert.rejects(createMeteredTavilyUsage({ store, now: () => time, readUsage: never })(key), /dispatch_deadline/);
  assert.equal((await store.read()).ledger.entries[0].state, 'reserved');
});

test('Brave unresolved receipts across processes hold even when the numeric grant is not exhausted', async () => {
  const store = memory(funded()), write = store.write; let writes = 0;
  store.write = (...args) => ++writes === 1 ? write(...args) : Promise.reject(new Error('receipt unavailable'));
  await braveGate(store)(context, async () => ({ results: [] }));
  const snapshot = (await store.read()).ledger;
  assert.equal(summarizeBraveLedger(snapshot, clock).remainingVerifiedRequests, 5);
  await assert.rejects(braveGate(memory(snapshot))(context, never), /pending_accounting/);
});

test('Brave grant expiry during accounting still sends zero provider requests', async () => {
  const store = memory(funded({ expiresAt: new Date(clock + 1).toISOString() })), write = store.write; let time = clock;
  store.write = async (...args) => { const result = await write(...args); time += 2; return result; };
  await assert.rejects(createBraveBudget({ store, now: () => time })(context, never), /grant_expired/);
  assert.equal((await store.read()).ledger.entries[0].state, 'reserved');
});

test('four actual Brave callers share one full-repository allowance, not one allowance per consumer', async t => {
  const oldCwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'gfrr-four-callers-'));
  process.chdir(directory);
  t.after(() => { process.chdir(oldCwd); rmSync(directory, { recursive: true, force: true }); });
  const old = [process.env.BRAVE_API_KEYS, process.env.BRAVE_API_KEY];
  t.after(() => { ['BRAVE_API_KEYS','BRAVE_API_KEY'].forEach((name,index) => { if (old[index] === undefined) delete process.env[name]; else process.env[name] = old[index]; }); });
  process.env.BRAVE_API_KEYS = key; process.env.BRAVE_API_KEY = '';
  const store = memory(funded({ usageAtActivation: 983 })); let calls = 0;
  const fakeFetch = async () => { calls++; return Response.json({ results: [] }); };
  t.mock.method(globalThis, 'fetch', fakeFetch);
  assert.equal((await macro('brave', [key], { braveBudget: braveGate(store) })).status.successCount, 6);
  assert.equal((await bubble('brave', [key], { braveBudget: braveGate(store) })).status.successCount, 6);
  const oil = await runDiagnosis({ allowNetwork: true, sources: ['brave'], windowDays: 7, maxResults: 5, writeOutput: false, braveBudget: braveGate(store) });
  assert.equal(oil.sourceResults[0].successCount, 4);
  await ceoApi(fakeFetch, braveGate(store), never).braveNewsSearch(new URLSearchParams());
  assert.equal(calls, 17);
  const summary = summarizeBraveLedger((await store.read()).ledger, clock);
  assert.equal(summary.remainingVerifiedRequests, 0);
  assert.equal(Object.keys(summary.byConsumer).length, 4);
  await assert.rejects(ceoApi(never, braveGate(store), never).braveNewsSearch(new URLSearchParams()), /quota_exhausted/);
});

test('Brave activation requires verification after completion, not merely after request start', async () => {
  const store = memory(funded()); let time = clock;
  await createBraveBudget({ store, now: () => time })(context, async () => { time = clock + 20000; return { results: [] }; });
  await assert.rejects(activateBraveGrant({ store, grant: grant({ verifiedAt: new Date(clock + 10000).toISOString() }), now: () => clock + 30000 }), /activation_pending_accounting/);
  assert.equal((await store.read()).ledger.grants.length, 1);
});

for (const [name, callback] of [
  ['AbortError', async () => { throw Object.assign(new Error('client abort'), { name: 'AbortError' }); }],
  ['timeout', async () => { throw new Error('request timeout'); }],
  ['network disconnect', async () => { throw new TypeError('socket closed'); }],
  ['HTTP 500 response', async () => { throw rejectedResponse(500); }],
  ['HTTP 503 response', async () => { throw rejectedResponse(503); }],
  ['untrusted HTTP text', async () => { throw new Error('HTTP 429'); }],
  ['malformed JSON', async () => { throw new SyntaxError('PRIVATE_RESPONSE_TEXT'); }],
  ['unknown error body', async () => ({ error: 'PRIVATE_RESPONSE_TEXT' })],
  ['error body with empty results', async () => ({ results: [], errors: ['PRIVATE_RESPONSE_TEXT'] })],
  ['missing search response', async () => ({})]
]) test(`Brave ${name} cannot reuse the last allowance through a later dashboard grant`, async () => {
  const store = memory(funded({ requestLimit: 1000, usageAtActivation: 999 }));
  const reports = []; let calls = 0;
  await assert.rejects(createBraveBudget({ store, now: () => clock, report: row => reports.push(row) })(context, async () => { calls++; return callback(); }), /provider_outcome_unknown/);
  const before = (await store.read()).ledger;
  assert.equal(before.entries[0].state, 'reserved');
  assert.equal(before.entries[0].finishedAt, null);
  assert.deepEqual(summarizeBraveLedger(before, clock).byConsumer['oil-news'], { reserved: 1, success: 0, failed: 0, pending: 1 });
  const newerSnapshot = grant({ requestLimit: 1000, usageAtActivation: 999, verifiedAt: new Date(clock + 1000).toISOString() });
  await assert.rejects(activateBraveGrant({ store, grant: newerSnapshot, now: () => clock + 1001 }), /activation_pending_accounting/);
  await assert.rejects(createBraveBudget({ store, now: () => clock + 1002 })(context, async () => { calls++; return { results: [] }; }), /quota_exhausted|pending_accounting/);
  assert.equal(calls, 1, 'at most one potentially chargeable provider attempt with one free request left');
  assert.deepEqual((await store.read()).ledger, before, 'neither a newer grant nor another process can clear unresolved debt');
  assert.ok(reports.some(row => row.status === 'brave_budget_provider_outcome_unknown'));
  assert.ok(!JSON.stringify(reports).includes('PRIVATE_RESPONSE_TEXT'));
});

test('Brave client timeout while provider remains active blocks concurrent grant activation and second request', async () => {
  const store = memory(funded({ requestLimit: 1000, usageAtActivation: 999 }));
  let completeProvider, calls = 0;
  const providerStillRunning = new Promise(resolve => { completeProvider = resolve; });
  const run = createBraveBudget({ store, now: () => clock });
  await assert.rejects(run(context, async () => {
    calls++;
    return Promise.race([providerStillRunning, Promise.reject(Object.assign(new Error('local deadline'), { name: 'AbortError' }))]);
  }), /provider_outcome_unknown/);
  const newerSnapshot = grant({ requestLimit: 1000, usageAtActivation: 999, verifiedAt: new Date(clock + 1000).toISOString() });
  const outcomes = await Promise.allSettled([
    activateBraveGrant({ store, grant: newerSnapshot, now: () => clock + 1001 }),
    createBraveBudget({ store, now: () => clock + 1001 })(context, async () => { calls++; return { results: [] }; })
  ]);
  assert.ok(outcomes.every(row => row.status === 'rejected'));
  assert.match(outcomes[0].reason.message, /activation_pending_accounting/);
  completeProvider({ results: [] });
  await providerStillRunning;
  assert.equal(calls, 1);
  assert.equal((await store.read()).ledger.entries[0].state, 'reserved', 'late local promise completion is not provider settlement evidence');
  await assert.rejects(activateBraveGrant({ store, grant: newerSnapshot, now: () => clock + 2000 }), /activation_pending_accounting/);
});

for (const [name, collect] of [['macro', macro], ['bubble', bubble]]) test(`${name} real Brave transport distinguishes HTTP rejection from unknown body`, async t => {
  for (const [response, expectedState, expectedCode] of [
    [() => new Response('rejected', { status: 429 }), 'failed', 'brave_budget_provider_quota_unknown'],
    [() => new Response('upstream error', { status: 503 }), 'reserved', 'brave_budget_provider_outcome_unknown'],
    [() => Response.json({ error: 'PRIVATE_RESPONSE_TEXT' }), 'reserved', 'brave_budget_provider_outcome_unknown']
  ]) {
    const store = memory(funded()); let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return response(); });
    const result = await collect('brave', [key, 'different-key'], { braveBudget: braveGate(store) });
    assert.equal(calls, 1);
    assert.equal(result.status.failureCount, 6);
    assert.equal(result.status.queryRuns[0].error, expectedCode);
    assert.equal((await store.read()).ledger.entries[0].state, expectedState);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_RESPONSE_TEXT'));
    t.mock.restoreAll();
  }
});

test('CEO real Brave transport retains uncertain 5xx and body errors while persisting definite quota rejection', async () => {
  for (const [response, state, errorCode] of [
    [() => new Response('', { status: 429 }), 'failed', /provider_quota_unknown/],
    [() => new Response('', { status: 503 }), 'reserved', /provider_outcome_unknown/],
    [() => Response.json({ error: 'unknown response' }), 'reserved', /provider_outcome_unknown/]
  ]) {
    const store = memory(funded());
    const api = ceoApi(async () => response(), braveGate(store), never);
    await assert.rejects(api.braveNewsSearch(new URLSearchParams()), errorCode);
    assert.equal((await store.read()).ledger.entries[0].state, state);
  }
});

test('oil real Brave transport keeps unresolved 5xx and error bodies pending across later activation', async t => {
  const oldCwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'gfrr-brave-pending-oil-'));
  process.chdir(directory);
  t.after(() => { process.chdir(oldCwd); rmSync(directory, { recursive: true, force: true }); });
  const old = [process.env.BRAVE_API_KEYS, process.env.BRAVE_API_KEY];
  t.after(() => { ['BRAVE_API_KEYS','BRAVE_API_KEY'].forEach((name,index) => { if (old[index] === undefined) delete process.env[name]; else process.env[name] = old[index]; }); });
  process.env.BRAVE_API_KEYS = key; process.env.BRAVE_API_KEY = '';
  for (const [response, state, code] of [
    [() => new Response('rejected', { status: 429 }), 'failed', 'brave_budget_provider_quota_unknown'],
    [() => new Response('unknown', { status: 503 }), 'reserved', 'brave_budget_provider_outcome_unknown'],
    [() => Response.json({ error: 'PRIVATE_RESPONSE_TEXT' }), 'reserved', 'brave_budget_provider_outcome_unknown']
  ]) {
    const store = memory(funded()); let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return response(); });
    const result = await runDiagnosis({ allowNetwork: true, sources: ['brave'], windowDays: 7, maxResults: 5, writeOutput: false, braveBudget: braveGate(store) });
    assert.equal(calls, 1);
    assert.equal(result.sourceResults[0].queryRuns[0].error, code);
    assert.equal((await store.read()).ledger.entries[0].state, state);
    if (state === 'reserved') await assert.rejects(activateBraveGrant({ store, grant: grant({ verifiedAt: new Date(clock + 1).toISOString() }), now: () => clock + 2 }), /activation_pending_accounting/);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_RESPONSE_TEXT'));
    t.mock.restoreAll();
  }
});

function githubMeterFixture(initial = emptyMeterLedger(), branch = 'tavily-meter-ledger') {
  let serverTime = clock, sequence = 1, head = initial ? sequence.toString(16).padStart(40, '0') : null;
  const trees = new Map(), commits = new Map(initial ? [[head, { ledger: structuredClone(initial), parent: null }]] : []);
  const reply = (body, status = 200) => Response.json(body, { status, headers: { Date: new Date(serverTime).toUTCString() } });
  const nextSha = () => (++sequence).toString(16).padStart(40, '0');
  return {
    now: () => serverTime,
    setTime(value) { serverTime = value; },
    ledger: () => structuredClone(commits.get(head).ledger),
    async fetch(url, init) {
      assert.equal(init.cache, 'no-store');
      assert.equal(init.headers['Cache-Control'], 'no-cache');
      assert.ok(url.startsWith('https://api.github.com/repos/ctmaomao/gfrr-auto-update-site/'));
      if (url.endsWith(`/git/ref/heads/${branch}`)) return head ? reply({ object: { sha: head } }) : reply({}, 404);
      if (url.includes('/contents/usage.json?ref=')) {
        const ref = url.split('?ref=')[1];
        assert.ok(commits.has(ref));
        return reply({ encoding: 'base64', content: Buffer.from(JSON.stringify(commits.get(ref).ledger)).toString('base64') });
      }
      const body = JSON.parse(init.body);
      if (url.endsWith('/git/trees')) {
        const sha = nextSha();
        trees.set(sha, JSON.parse(body.tree[0].content));
        return reply({ sha }, 201);
      }
      if (url.endsWith('/git/commits')) {
        const sha = nextSha();
        assert.equal(body.parents.length, head ? 1 : 0);
        commits.set(sha, { ledger: structuredClone(trees.get(body.tree)), parent: body.parents[0] || null });
        return reply({ sha }, 201);
      }
      if (url.endsWith('/git/refs')) {
        assert.equal(init.method, 'POST');
        assert.equal(body.ref, `refs/heads/${branch}`);
        if (head) return reply({}, 422);
        head = body.sha;
        return reply({ object: { sha: head } }, 201);
      }
      assert.ok(url.endsWith(`/git/refs/heads/${branch}`));
      assert.equal(init.method, 'PATCH');
      assert.equal(body.force, false);
      if (commits.get(body.sha)?.parent !== head) return reply({}, 422);
      head = body.sha;
      return reply({ object: { sha: head } });
    }
  };
}

test('real GitHub CAS meter rejects a fresh fast runner and uses authoritative time across allowed opposite skews', async () => {
  const github = githubMeterFixture(); let calls = 0;
  const client = skew => {
    const now = () => github.now() + skew;
    return createMeteredTavilyUsage({ now, store: createTavilyMeterStore({ token: 'synthetic', now, fetchImpl: github.fetch }),
      readUsage: async () => { calls++; return usage(); } });
  };
  for (let index = 0; index < 10; index++) await client(index % 2 ? 29000 : -29000)(key);
  assert.equal(calls, 10);
  assert.ok(github.ledger().entries.every(row => row.time === new Date(clock).toISOString()), 'timestamps come from GitHub Date, not either runner');
  await assert.rejects(client(630000)(key), /clock_skew/);
  for (const skew of [-29000,29000]) await assert.rejects(client(skew)(key), /meter_rate_limit/);
  assert.equal(calls, 10, 'a new clock or process cannot manufacture an 11th attempt');
  github.setTime(clock + 600000);
  for (const skew of [-29000,29000]) await assert.rejects(client(skew)(key), /meter_rate_limit/);
  github.setTime(clock + 661000);
  await assert.rejects(client(-29000)(key), /meter_rate_limit/);
  github.setTime(clock + 662000);
  await client(-29000)(key);
  assert.equal(calls, 11);
  assert.equal(github.ledger().entries.length, 11);
});

test('real GitHub CAS plus Date protects the tenth slot under concurrent opposite-skew processes', async () => {
  const ledger = emptyMeterLedger();
  ledger.entries = Array.from({ length: 9 }, () => ({ id: randomUUID(), keyId: keyFingerprint(key), time: new Date(clock).toISOString(), state: 'success' }));
  const github = githubMeterFixture(ledger); let calls = 0;
  const outcomes = await Promise.allSettled([-29000,29000].map(skew => {
    const now = () => github.now() + skew;
    return createMeteredTavilyUsage({ now, store: createTavilyMeterStore({ token: 'synthetic', now, fetchImpl: github.fetch }),
      readUsage: async () => { calls++; return usage(); } })(key);
  }));
  assert.equal(calls, 1);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(github.ledger().entries.length, 10);
});

test('missing, invalid, stale or future GitHub Date cannot admit a usage call', async () => {
  for (const date of [null, 'not-a-date', new Date(clock - 31000).toUTCString(), new Date(clock + 31000).toUTCString()]) {
    const store = createTavilyMeterStore({ token: 'synthetic', now: () => clock, fetchImpl: async () => Response.json({ object: { sha: 'a'.repeat(40) } }, {
      headers: date === null ? {} : { Date: date }
    }) });
    await assert.rejects(createMeteredTavilyUsage({ store, now: () => clock, readUsage: never })(key), /clock_unknown|clock_skew/);
  }
});

test('post-dispatch budget failures and stopped sessions preserve attempted evidence; pre-dispatch holds do not', async () => {
  for (const callback of [async () => { throw rejectedResponse(429); }, async () => { throw new Error('timeout'); }, async () => ({ error: 'unknown' })]) {
    const run = braveGate(memory(funded()));
    await assert.rejects(run(context, callback), error => error.providerRequestAttempted === true);
    await assert.rejects(run(context, never), error => error.budgetCode === 'brave_budget_session_stopped' && error.providerRequestAttempted === true);
  }
  await assert.rejects(braveGate(memory(emptyBraveLedger()))(context, never), error => error.providerRequestAttempted !== true);
  const tavily = createTavilyBudget({ store: memory(emptyLedger()), now: () => clock, readUsage: async () => usage() });
  await assert.rejects(tavily({ ...context, payload: { search_depth: 'basic' } }, async () => { throw new Error('HTTP 503'); }), error => error.providerRequestAttempted === true);
});

test('real meter bootstrap records GitHub genesis and waits a complete safe window for unknown legacy probes', async () => {
  const github = githubMeterFixture(null);
  const now = () => github.now();
  const store = createTavilyMeterStore({ token: 'synthetic', now, fetchImpl: github.fetch });
  let calls = 0;
  const read = () => createMeteredTavilyUsage({ store, now, readUsage: async () => { calls++; return usage(); } })(key);
  await assert.rejects(read(), /uninitialized/);
  assert.equal(await store.initialize(), true);
  assert.equal(github.ledger().initializedAt, new Date(clock).toISOString());
  assert.equal(github.ledger().entries.length, 0);
  await assert.rejects(read(), /initialization_cooldown/);
  github.setTime(clock + 600000);
  await assert.rejects(read(), /initialization_cooldown/);
  github.setTime(clock + 661000);
  await assert.rejects(read(), /initialization_cooldown/);
  assert.equal(calls, 0, 'empty genesis cannot erase unknown calls from old CLI/status paths');
  github.setTime(clock + 662000);
  await read();
  assert.equal(calls, 1);
  assert.equal(github.ledger().entries.length, 1);
  await assert.rejects(store.initialize(), /initialization_refused/);
});

test('meter with missing or future genesis holds without inferring an empty history', async () => {
  assert.throws(() => newMeterLedger(), /initialization_time_unknown/);
  for (const ledger of [{ schemaVersion: 'tavily-meter-v1', entries: [] }, emptyMeterLedger(new Date(clock + 1).toISOString())]) {
    await assert.rejects(createMeteredTavilyUsage({ store: memory(ledger), now: () => clock, readUsage: never })(key), /invalid_ledger/);
  }
});

test('key fallback cannot replace an attempted provider failure with an expected preflight skip', async () => {
  const pool = createSearchKeyPool(['first','second']); let calls = 0;
  await assert.rejects(pool(async selected => {
    calls++;
    if (selected === 'first') throw Object.assign(new Error('HTTP 401'), { providerRequestAttempted: true });
    throw Object.assign(new Error('brave_budget_key_scope_unknown'), { budgetCode: 'brave_budget_key_scope_unknown', providerRequestAttempted: false });
  }), error => error.budgetCode === 'brave_budget_key_scope_unknown' && error.providerRequestAttempted === true);
  assert.equal(calls, 2);
});

test('paused key quota errors keep attempted evidence for remaining topics', async () => {
  const pool = createSearchKeyPool([key], () => {}); let calls = 0;
  await assert.rejects(pool(async () => { calls++; throw Object.assign(new Error('HTTP 432 private'), { providerRequestAttempted: true }); }), error => error.providerRequestAttempted === true && error.httpStatus === 432);
  await assert.rejects(pool(never), error => error.providerRequestAttempted === true && error.httpStatus === 432);
  assert.equal(calls, 1);
});

test('real GitHub Brave CAS cannot dispatch at grant expiry despite an accepted slow runner clock', async () => {
  for (const expiryOffset of [0, 1000, 31000]) {
    const ledger = funded({ expiresAt: new Date(clock + expiryOffset).toISOString() });
    const github = githubMeterFixture(ledger, 'brave-usage-ledger');
    const now = () => github.now() - 29000;
    const store = createBraveLedger({ token: 'synthetic', now, fetchImpl: github.fetch });
    let calls = 0;
    await assert.rejects(createBraveBudget({ store, now })(context, async () => { calls++; return { results: [] }; }), /grant_expired/);
    assert.equal(calls, 0);
    assert.equal(github.ledger().entries[0].state, 'reserved');
  }
  const github = githubMeterFixture(funded({ expiresAt: new Date(clock + 32000).toISOString() }), 'brave-usage-ledger');
  const now = () => github.now() - 29000;
  await createBraveBudget({ now, store: createBraveLedger({ token: 'synthetic', now, fetchImpl: github.fetch }) })(context, async () => ({ results: [] }));
  assert.equal(github.ledger().entries[0].state, 'success');
});

test('new Tavily and Brave admissions refuse long CAS delays without dispatch or refund', async () => {
  for (const provider of ['tavily','brave']) {
    const store = memory(provider === 'tavily' ? emptyLedger() : funded()), write = store.write;
    let monotonic = 0, calls = 0;
    store.write = async (...args) => { const saved = await write(...args); monotonic = 30000; return saved; };
    const options = { store, now: () => clock, monotonicNow: () => monotonic, readUsage: async () => usage() };
    const run = provider === 'tavily' ? createTavilyBudget(options) : createBraveBudget(options);
    await assert.rejects(run({ ...context, payload: { search_depth: 'basic' } }, async () => { calls++; return { results: [] }; }), error => /dispatch_deadline/.test(error.budgetCode) && error.providerRequestAttempted !== true);
    assert.equal(calls, 0);
    assert.equal((await store.read()).ledger.entries[0].state, 'reserved');
  }
});

test('Brave requires authoritative snapshot time for the actual grant expiry boundary', async () => {
  const store = memory(funded()), read = store.read;
  store.read = async () => { const result = await read(); delete result.serverTime; return result; };
  await assert.rejects(braveGate(store)(context, never), /clock_unknown/);
  assert.equal((await store.read()).ledger.entries.length, 0);
});

test('project counter summaries and offline plans state reservation-time scope without claiming strict dispatch history', () => {
  for (const summary of [summarizeLedger(emptyLedger(), clock), summarizeBraveLedger(funded(), clock)]) {
    assert.equal(summary.countBasis, 'recorded_reservation_time');
    assert.equal(summary.strictDispatchWindowVerified, false);
  }
  for (const provider of ['tavily','brave']) {
    const result = spawnSync(process.execPath, [`scripts/review-${provider}-budget.mjs`, '--plan'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.countBasis, 'recorded_reservation_time');
    assert.equal(plan.strictDispatchWindowVerified, false);
    assert.equal(plan.dispatchDeadlineMs, 30000);
    assert.equal(plan.searches, 0);
    assert.equal(plan.writes, 0);
  }
});
