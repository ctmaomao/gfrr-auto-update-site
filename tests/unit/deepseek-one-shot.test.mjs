import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { POLICY, POLICY_DIGEST, digest, BUDGET_REPOSITORY } from '../../scripts/lib/deepseek-budget.mjs';
import { GRANT, prepareOneShotLedger, validateOneShotLedger, validateOneShotTransition,
  createOneShotBudget, verifyOneShotStatus, oneShotRuntimeConfig, createOneShotStore, validateOneShotBalance, readOneShotBalance } from '../../scripts/lib/deepseek-one-shot.mjs';
const NOW = Date.parse('2026-11-09T21:45:00.000Z');
const grant = { policy: GRANT, authorizedAt: new Date(NOW - 1000).toISOString(), authorizationEvidenceSha256: 'a'.repeat(64), initializationParentSha: 'b'.repeat(40) };
const review = { policyDigest: POLICY_DIGEST, verifiedAt: new Date(NOW).toISOString(),
  expiresAt: new Date(NOW + 86400000).toISOString(), evidenceSha256: 'b'.repeat(64) };
const approvedGrantDigest = digest(grant), approvedReviewDigest = digest(review);
const fresh = () => prepareOneShotLedger({ grant, review, approvedGrantDigest }, NOW);
const payload = () => ({ model: POLICY.model, temperature: 0.2, max_tokens: 8000, stream: false, thinking: { type: 'disabled' },
  response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'JSON' }, { role: 'user', content: 'JSON' }] });
const context = (changes = {}) => ({ key: 'FAKE_KEY', payload: payload(), consumer: 'macro-editorial', mode: 'manual', runId: '123', ...changes });
const response = () => ({ id: randomUUID(), object: 'chat.completion', created: NOW / 1000, model: POLICY.responseModel,
  usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] });
const balance = () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '5', granted_balance: '0', topped_up_balance: '5' }] });
function memory() {
  let ledger = fresh(), head = 0;
  return { async read() { return { head, ledger: structuredClone(ledger) }; },
    async write(previous, next) { if (head !== previous.head) return false; validateOneShotTransition(ledger, next, NOW); ledger = structuredClone(next); head++; return true; } };
}
const gate = (store, more = {}) => createOneShotBudget({ store, approvedGrantDigest, approvedReviewDigest, now: () => NOW, readBalance: async () => balance(), ...more });
const status = store => verifyOneShotStatus({ store, consumer: 'macro-editorial', approvedGrantDigest, approvedReviewDigest, now: () => NOW });

test('additional grant never claims old spend is zero and permits exactly one attempt per consumer', async () => {
  assert.equal(GRANT.capMicroCny, 4_330_000); assert.equal(GRANT.historicalProjectSpend, 'unknown-not-covered');
  const store = memory(); let calls = 0;
  assert.equal((await status(store)).writes, 0);
  for (const consumer of GRANT.consumers) await gate(store)(context({ consumer }), async p => {
    calls++; assert.equal((await store.read()).ledger.entries.filter(r => r.kind === 'reserve').length, calls);
    assert.equal(Object.isFrozen(p), true); return response();
  });
  assert.equal(calls, 2);
  for (const consumer of GRANT.consumers) await assert.rejects(gate(store)(context({ consumer, key: 'rotated' }), () => assert.fail()), /grant_consumed/);
  const ledger = (await store.read()).ledger;
  assert.equal(ledger.entries.filter(r => r.kind === 'reserve').reduce((n, r) => n + r.reservedMicroCny, 0), 4_322_304);
  validateOneShotLedger(ledger, NOW + 400 * 86400000); // debt never ages out
});

test('invalid, extra, missing and unapproved grant or price fields fail closed', async () => {
  for (const patch of [{ capMicroCny: 5_000_000 }, { expiresAt: '2026-12-01T00:00:00.000Z' }, { currency: 'USD' },
    { historicalProjectSpend: 0 }, { attemptsPerConsumer: 2 }]) {
    const g = { ...grant, policy: { ...GRANT, ...patch } };
    assert.throws(() => prepareOneShotLedger({ grant: g, review, approvedGrantDigest: digest(g) }, NOW), /grant_invalid/);
  }
  for (const patch of [{ approvedGrantDigest: undefined }, { approvedGrantDigest: 'c'.repeat(64) },
    { approvedReviewDigest: undefined }, { approvedReviewDigest: 'c'.repeat(64) }, { now: () => NOW + 86400000 }]) {
    await assert.rejects(gate(memory(), patch)(context(), () => assert.fail()), /grant_unapproved|price_review_required/);
  }
  assert.throws(() => prepareOneShotLedger({ grant, review: { ...review, policyDigest: 'c'.repeat(64) }, approvedGrantDigest }, NOW), /price_policy_unknown/);
});

test('expiry, bad currency, payload, mode and third consumer never send', async () => {
  for (const patch of [{ mode: 'automated' }, { runId: 'local' }, { consumer: 'manual-external-ai' }, { payload: { ...payload(), max_tokens: 8001 } }]) {
    await assert.rejects(gate(memory())(context(patch), () => assert.fail()), /manual_only|invalid_request/);
  }
  await assert.rejects(gate(memory(), { readBalance: async () => ({ ...balance(), balance_infos: [{ ...balance().balance_infos[0], currency: 'USD' }] }) })(context(), () => assert.fail()), /currency_unknown/);
  const at = Date.parse(GRANT.expiresAt) - 76_000;
  await assert.rejects(gate(memory(), { now: () => at })(context(), () => assert.fail()), /grant_expired/);
});

test('races permit a single confirmed reservation; loser cannot retry same process', async () => {
  const store = memory(); let calls = 0;
  const a = gate(store), b = gate(store);
  const results = await Promise.allSettled([a, b].map(run => run(context(), async () => { calls++; return response(); })));
  assert.equal(calls, 1); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  await assert.rejects((results[0].status === 'rejected' ? a : b)(context(), () => assert.fail()), /session_stopped/);
});

test('unknown reserve write consumes slot without provider call; no retries or reset', async () => {
  const store = memory(), original = store.write.bind(store);
  store.write = async (...args) => { await original(...args); throw Error('timeout'); };
  await assert.rejects(gate(store)(context(), () => assert.fail()), /timeout/);
  const ledger = (await store.read()).ledger;
  assert.equal(ledger.entries.length, 1);
  await assert.rejects(gate(store)(context(), () => assert.fail()), /grant_consumed/);
  await assert.rejects(gate(store)(context({ consumer: 'bubble-editorial' }), () => assert.fail()), /receipt_pending/);
  assert.throws(() => validateOneShotTransition(ledger, fresh(), NOW), /history_changed/);
});

test('all unconfirmed CAS acknowledgments cause zero dispatch', async () => {
  for (const value of [false, null, undefined, 'true', {}]) {
    const store = memory(); store.write = async () => value;
    await assert.rejects(gate(store)(context(), () => assert.fail()), /contention/);
  }
});

test('provider failures and invalid model/usage permanently consume allowance and hold other consumer', async () => {
  for (const reply of [null, { ...response(), model: 'other' }, { ...response(), usage: {} }, { ...response(), cost: 0 }, 'timeout']) {
    const store = memory(); let calls = 0;
    await assert.rejects(gate(store)(context(), () => { calls++; if (reply === 'timeout') throw Error('timeout'); return reply; }));
    assert.equal(calls, 1); assert.equal((await store.read()).ledger.entries.length, 2);
    await assert.rejects(gate(store)(context({ consumer: 'bubble-editorial' }), () => assert.fail()), /contract_hold|receipt_pending/);
  }
});

test('lost outcome, mutation and expiry after reserve never permit retry/refund', async () => {
  for (const scenario of ['lost-outcome', 'mutation', 'expiry', 'clock-rollback']) {
    const store = memory(), original = store.write.bind(store), ctx = context(); let writes = 0, at = NOW, calls = 0;
    store.write = async (...args) => {
      if (++writes === 2 && scenario === 'lost-outcome') throw Error('lost');
      const ok = await original(...args);
      if (scenario === 'mutation') ctx.payload.messages[0].content = 'changed';
      if (scenario === 'expiry') at += 86400000;
      if (scenario === 'clock-rollback') at--;
      return ok;
    };
    await assert.rejects(gate(store, { now: () => at })(ctx, async () => { calls++; return response(); }));
    assert.equal(calls, scenario === 'lost-outcome' ? 1 : 0);
    assert.equal((await store.read()).ledger.entries[0].reservedMicroCny, POLICY.reserveMicroCny);
  }
});

const env = () => ({ DEEPSEEK_BUDGET_SELECTION: GRANT.id, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: BUDGET_REPOSITORY, GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '123',
  GITHUB_WORKFLOW_REF: `${BUDGET_REPOSITORY}/.github/workflows/macro-risk-editorial-refresh.yml@refs/heads/main`,
  DEEPSEEK_BUDGET_CONSUMER: 'macro-editorial', DEEPSEEK_BUDGET_GITHUB_TOKEN: 'FAKE', DEEPSEEK_ONE_SHOT_GENESIS_SHA: 'a'.repeat(40) });
test('runtime selection binds repository, exact workflow, first dispatch attempt and grant ID', () => {
  assert.equal(oneShotRuntimeConfig(env()).consumer, 'macro-editorial');
  for (const patch of [{ DEEPSEEK_BUDGET_SELECTION: 'true' }, { GITHUB_EVENT_NAME: 'workflow_run' }, { GITHUB_EVENT_NAME: 'schedule' },
    { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_ACTIONS: undefined }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_REF: 'refs/heads/test' },
    { GITHUB_WORKFLOW_REF: undefined }, { DEEPSEEK_BUDGET_CONSUMER: 'manual-external-ai' }, { GITHUB_RUN_ID: 'local' }]) {
    assert.throws(() => oneShotRuntimeConfig({ ...env(), ...patch }), /grant_manual_only/);
  }
  assert.throws(() => oneShotRuntimeConfig({ ...env(), DEEPSEEK_ONE_SHOT_GENESIS_SHA: undefined }), /uninitialized/);
});

test('one-shot store uses separate branch and rejects missing genesis with no initialization', async () => {
  let requests = 0;
  const store = createOneShotStore({ token: 'FAKE', genesisSha: 'a'.repeat(40), now: () => NOW, fetchImpl: async url => {
    requests++; assert.match(url, /deepseek-editorial-one-shot-20261109$/u);
    return new Response('', { status: 404, headers: { date: new Date(NOW).toUTCString() } });
  } });
  await assert.rejects(store.read(), /uninitialized/); assert.equal(requests, 1);
});

test('offline plan, missing runtime config, and wiring preserve preflight-before-search and default monthly', () => {
  const result = spawnSync(process.execPath, ['scripts/review-deepseek-budget.mjs', '--one-shot-plan'], { encoding: 'utf8' });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).providerCalls, 0); assert.equal(JSON.parse(result.stdout).writes, 0);
  const missing = spawnSync(process.execPath, ['scripts/review-deepseek-budget.mjs', '--require-eligible'], {
    encoding: 'utf8', env: { ...process.env, DEEPSEEK_BUDGET_SELECTION: GRANT.id, GITHUB_ACTIONS: 'false' } });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /grant_manual_only/u);
  for (const [file, consumer] of [['macro-risk-editorial-refresh.yml', 'macro-editorial'], ['bubble-watch-weekly-editorial-refresh.yml', 'bubble-editorial']]) {
    const source = fs.readFileSync(`.github/workflows/${file}`, 'utf8');
    assert.match(source, /default: monthly/u);
    assert.equal(source.split("github.event_name == 'workflow_dispatch' && inputs.budget_selection || 'monthly'").length - 1, 2);
    assert.equal(source.split(`DEEPSEEK_BUDGET_CONSUMER: ${consumer}`).length - 1, 2);
    assert.ok(source.indexOf('review-deepseek-budget.mjs --require-eligible') < source.indexOf('TAVILY_API_KEYS:'));
    assert.match(source, /--data-only/u);
  }
});

test('successful first consumer never frees its slot; only the other consumer remains eligible', async () => {
  const store = memory(); await gate(store)(context(), async () => response());
  await assert.rejects(status(store), /grant_consumed/);
  const other = await verifyOneShotStatus({ store, consumer: 'bubble-editorial', approvedGrantDigest, approvedReviewDigest, now: () => NOW });
  assert.equal(other.remainingMicroCny, 2_168_848);
  await assert.rejects(gate(store, { now: () => NOW + 90 * 86400000 })(context(), () => assert.fail()), /grant_expired/);
  assert.equal((await store.read()).ledger.entries[0].consumer, 'macro-editorial');
});

test('price expiry during balance, reservation or final boundary sends zero paid requests', async () => {
  for (const phase of ['balance', 'reserve', 'final']) {
    const store = memory(), original = store.write.bind(store); let at = NOW, clockReads = 0;
    store.write = async (...args) => { const ok = await original(...args); if (phase === 'reserve') at += 86400000; return ok; };
    const now = () => { if (phase === 'final' && ++clockReads >= 3) at = NOW + 86400000; return at; };
    await assert.rejects(gate(store, { now, readBalance: async () => { if (phase === 'balance') at += 86400000; return balance(); } })(context(), () => assert.fail()), /price_review_required/);
    assert.equal((await store.read()).ledger.entries.length, phase === 'balance' ? 0 : 1);
  }
});

test('empty or monthly selection keeps old fail-closed gate; unknown selection cannot fall back', () => {
  for (const selection of ['', 'monthly', 'unknown']) {
    const code = `globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')}; const {withDeepSeekBudget}=await import('./scripts/lib/deepseek-budget.mjs'); try {await withDeepSeekBudget({},()=>{throw Error('PAID_FORBIDDEN')})} catch(e){console.log(e.budgetCode)}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8',
      env: { PATH: process.env.PATH, DEEPSEEK_BUDGET_SELECTION: selection } });
    assert.equal(result.status, 0);
    assert.match(result.stdout, selection === 'unknown' ? /grant_manual_only/u : /credentials_missing/u);
  }
});


test('one-shot genesis requires exactly the approved initialization parent; monthly remains parentless', async () => {
  const genesisSha = 'a'.repeat(40);
  for (const parents of [[], [{ sha: 'c'.repeat(40) }], [{ sha: grant.initializationParentSha }, { sha: 'c'.repeat(40) }], [{ sha: grant.initializationParentSha }]]) {
    const store = createOneShotStore({ token: 'FAKE', genesisSha, now: () => NOW, fetchImpl: async url => {
      let json;
      if (url.includes('/git/ref/')) json = { object: { sha: genesisSha } };
      else if (url.includes('/git/commits/')) json = { sha: genesisSha, parents };
      else if (url.includes('/contents/usage.json')) json = { encoding: 'base64', content: Buffer.from(JSON.stringify(fresh())).toString('base64') };
      else assert.fail(url);
      return new Response(JSON.stringify(json), { status: 200, headers: { date: new Date(NOW).toUTCString() } });
    } });
    if (parents.length === 1 && parents[0].sha === grant.initializationParentSha) assert.equal((await store.read()).head, genesisSha);
    else await assert.rejects(store.read(), /bootstrap_unproven/);
  }
  for (const initializationParentSha of [null, '', 'x'.repeat(40), 'a'.repeat(39)]) {
    const g = { ...grant, initializationParentSha };
    assert.throws(() => prepareOneShotLedger({ grant: g, review, approvedGrantDigest: digest(g) }, NOW), /grant_invalid/);
  }
  const changed = fresh(); changed.grant.initializationParentSha = 'c'.repeat(40);
  assert.throws(() => validateOneShotTransition(fresh(), changed, NOW), /history_changed/);
});

const currencyRow = (currency, total = '0', granted = '0', topped = total) => ({ currency,
  total_balance: total, granted_balance: granted, topped_up_balance: topped });
const multiBalance = (...rows) => ({ is_available: true, balance_infos: rows });
test('one-shot permits only sufficiently CNY-funded balances with optional all-zero USD metadata', async () => {
  for (const rows of [[currencyRow('CNY', '2.161152')], [currencyRow('CNY', '2.16115200'), currencyRow('USD', '0.00000000')],
    [currencyRow('USD'), currencyRow('CNY', '2.16115201', '0.00000001', '2.161152')]]) {
    assert.deepEqual(validateOneShotBalance(multiBalance(...rows)), { currency: 'CNY' });
    const store = memory(); let calls = 0;
    await gate(store, { readBalance: async () => multiBalance(...rows) })(context(), async () => { calls++; return response(); });
    assert.equal(calls, 1);
    assert.equal((await store.read()).ledger.entries.filter(row => row.kind === 'reserve').length, 1);
  }
});
test('ambiguous, insufficient, nonzero USD and malformed one-shot balances hold before reservation or POST', async () => {
  const cny = currencyRow('CNY', '5'), usd = currencyRow('USD');
  const bad = [null, {}, multiBalance(), multiBalance(usd), multiBalance(cny, cny), multiBalance(cny, usd, usd),
    multiBalance(cny, currencyRow('EUR')), { ...multiBalance(cny), is_available: false },
    multiBalance(currencyRow('CNY', '2.16115199')), multiBalance(currencyRow('CNY', '0')),
    multiBalance(cny, currencyRow('USD', '0.00000001')), multiBalance(cny, currencyRow('USD', '0', '1', '0')),
    multiBalance(currencyRow('CNY', '5', '1', '5')), multiBalance({ ...cny, extra: true }),
    ...[null, 1, '-1', '+1', '01', '1e2', 'NaN', 'Infinity', '0.000000001', '1'.repeat(33)].flatMap(value =>
      ['total_balance', 'granted_balance', 'topped_up_balance'].flatMap(field => [
        multiBalance({ ...cny, [field]: value }), multiBalance(cny, { ...usd, [field]: value })]))];
  for (const value of bad) {
    assert.throws(() => validateOneShotBalance(value), /^Error: deepseek_budget_currency_unknown$/);
    const store = memory();
    await assert.rejects(gate(store, { readBalance: async () => value })(context(), () => assert.fail('paid POST')), /currency_unknown/);
    assert.equal((await store.read()).ledger.entries.length, 0);
  }
});
test('one-shot reader reuses bounded fixed GET and monthly reader remains strict', async () => {
  const { readDeepSeekBalance } = await import('../../scripts/lib/deepseek-budget.mjs');
  let reads = 0;
  const fetchImpl = async (url, init) => {
    reads++; assert.equal(url, 'https://api.deepseek.com/user/balance'); assert.equal(init.redirect, 'error');
    assert.equal(init.body, undefined); assert.equal(init.method, undefined);
    return new Response(JSON.stringify(multiBalance(currencyRow('CNY', '5'), currencyRow('USD'))),
      { headers: { date: new Date().toUTCString() } });
  };
  await readOneShotBalance('FAKE_KEY', fetchImpl); assert.equal(reads, 1);
  await assert.rejects(readDeepSeekBalance('FAKE_KEY', fetchImpl), /currency_unknown/); assert.equal(reads, 2);
});
