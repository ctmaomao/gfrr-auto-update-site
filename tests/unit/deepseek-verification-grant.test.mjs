import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { LEGACY_POLICY as POLICY, LEGACY_POLICY_DIGEST as POLICY_DIGEST, digest, BUDGET_REPOSITORY } from '../../scripts/lib/deepseek-budget.mjs';
import { GRANT, VERIFICATION_GRANT, oneShotSelection, prepareOneShotLedger, validateOneShotLedger,
  validateOneShotTransition, createOneShotBudget, verifyOneShotStatus, oneShotRuntimeConfig,
  createOneShotStore } from '../../scripts/lib/deepseek-one-shot.mjs';

const NOW = Date.parse('2026-11-11T01:00:00.000Z');
const selection = VERIFICATION_GRANT.id;
const review = { policyDigest: POLICY_DIGEST, verifiedAt: new Date(NOW).toISOString(),
  expiresAt: new Date(NOW + 86400000).toISOString(), evidenceSha256: 'b'.repeat(64) };
const grant = policy => ({ policy, authorizedAt: new Date(NOW - 1000).toISOString(),
  authorizationEvidenceSha256: digest(`independent fixture authorization ${policy.id}`), initializationParentSha: 'b'.repeat(40) });
const fresh = (policy = VERIFICATION_GRANT) => prepareOneShotLedger({ grant: grant(policy), review,
  approvedGrantDigest: digest(grant(policy)), selection: policy.id }, NOW);
const pins = (policy = VERIFICATION_GRANT) => ({ selection: policy.id, approvedGrantDigest: digest(grant(policy)), approvedReviewDigest: digest(review) });
const balance = () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '5', granted_balance: '0', topped_up_balance: '5' }] });
const context = (changes = {}) => ({ key: 'SYNTHETIC_KEY', consumer: 'macro-editorial', mode: 'manual', runId: '123',
  payload: { model: POLICY.model, temperature: 0.2, max_tokens: 8000, stream: false, thinking: { type: 'disabled' },
    response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'JSON' }, { role: 'user', content: 'JSON' }] }, ...changes });
const response = () => ({ id: randomUUID(), object: 'chat.completion', created: NOW / 1000, model: POLICY.responseModel,
  usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] });
function memory(policy = VERIFICATION_GRANT) {
  let ledger = fresh(policy), head = 0;
  return { async read() { return { head, ledger: structuredClone(ledger) }; },
    async write(previous, next) { if (head !== previous.head) return false; validateOneShotTransition(ledger, next, NOW, policy.id); ledger = structuredClone(next); head++; return true; } };
}
const gate = (store, more = {}) => createOneShotBudget({ store, ...pins(), now: () => NOW, readBalance: async () => balance(), ...more });
const status = (store, more = {}) => verifyOneShotStatus({ store, ...pins(), consumer: 'macro-editorial', now: () => NOW, ...more });
const env = () => ({ DEEPSEEK_BUDGET_SELECTION: selection, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: BUDGET_REPOSITORY, GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '123',
  GITHUB_WORKFLOW_REF: `${BUDGET_REPOSITORY}/.github/workflows/macro-risk-editorial-refresh.yml@refs/heads/main`,
  DEEPSEEK_BUDGET_CONSUMER: 'macro-editorial', DEEPSEEK_BUDGET_GITHUB_TOKEN: 'SYNTHETIC_TOKEN',
  DEEPSEEK_VERIFY_20261111_GENESIS_SHA: 'a'.repeat(40), DEEPSEEK_VERIFY_20261111_GRANT_SHA256: digest(grant(VERIFICATION_GRANT)),
  DEEPSEEK_VERIFY_20261111_PRICE_REVIEW_SHA256: digest(review) });

test('a separately approved grant preserves consumed old history and caps two permanent slots at CNY4.322304', async () => {
  assert.equal(GRANT.id, 'editorial-additional-20261109-cny433-v1');
  assert.equal(oneShotSelection().branch, 'deepseek-editorial-one-shot-20261109');
  assert.equal(oneShotSelection(selection).branch, 'deepseek-editorial-verification-20261111');
  assert.equal(VERIFICATION_GRANT.capMicroCny, 4_330_000);
  assert.equal(VERIFICATION_GRANT.expiresAt, '2026-11-13T00:00:00.000Z');
  assert.equal(VERIFICATION_GRANT.historicalProjectSpend, 'unknown-not-covered');
  const old = memory(GRANT), current = memory(); let calls = 0;
  for (const consumer of GRANT.consumers) await gate(old, pins(GRANT))(context({ consumer }), async () => response());
  const spent = await old.read();
  for (const consumer of GRANT.consumers) await assert.rejects(status(old, { ...pins(GRANT), consumer }), /grant_consumed/);
  for (const consumer of VERIFICATION_GRANT.consumers) {
    await gate(current)(context({ consumer }), async () => { calls++; return response(); });
    await assert.rejects(status(current, { consumer }), /grant_consumed/);
  }
  const ledger = (await current.read()).ledger;
  assert.equal(calls, 2);
  assert.equal(ledger.entries.filter(r => r.kind === 'reserve').reduce((n, r) => n + r.reservedMicroCny, 0), 4_322_304);
  assert.deepEqual(await old.read(), spent);
  validateOneShotLedger(ledger, NOW + 400 * 86400000, selection);
  assert.throws(() => validateOneShotTransition(ledger, fresh(), NOW, selection), /history_changed/);
});

test('new and old grants, approvals and transitions are not interchangeable', async () => {
  for (const policy of [GRANT, VERIFICATION_GRANT]) {
    const other = policy === GRANT ? VERIFICATION_GRANT : GRANT;
    assert.throws(() => validateOneShotLedger(fresh(policy), NOW, other.id), /grant_invalid/);
    assert.throws(() => validateOneShotTransition(fresh(policy), fresh(other), NOW, policy.id), /grant_invalid/);
    await assert.rejects(gate(memory(policy), { ...pins(policy), approvedGrantDigest: digest(grant(other)) })(context(), () => assert.fail()), /grant_unapproved/);
  }
  assert.throws(() => prepareOneShotLedger({ grant: grant(VERIFICATION_GRANT), review, approvedGrantDigest: digest(grant(VERIFICATION_GRANT)) }, NOW), /grant_invalid/);
  for (const patch of [{ capMicroCny: 4_330_001 }, { attemptsPerConsumer: 2 }, { currency: 'USD' },
    { expiresAt: '2026-12-01T00:00:00.000Z' }, { id: 'editorial-verification-another' }]) {
    const g = grant({ ...VERIFICATION_GRANT, ...patch });
    assert.throws(() => prepareOneShotLedger({ grant: g, review, approvedGrantDigest: digest(g), selection }, NOW), /grant_invalid/);
  }
});

test('selected store binds every pinned history snapshot to its own grant and approved parent', async () => {
  const genesisSha = 'a'.repeat(40), head = 'c'.repeat(40);
  for (const scenario of ['valid', 'wrong-genesis-grant', 'wrong-head-grant', 'wrong-parent']) {
    const store = createOneShotStore({ token: 'SYNTHETIC_TOKEN', genesisSha, now: () => NOW, fetchImpl: async url => {
      let body;
      if (url.includes('/git/ref/')) { assert.ok(url.endsWith('/deepseek-editorial-verification-20261111')); body = { object: { sha: head } }; }
      else if (url.includes(`/git/commits/${head}`)) body = { sha: head, parents: [{ sha: genesisSha }] };
      else if (url.includes(`/git/commits/${genesisSha}`)) body = { sha: genesisSha, parents: [{ sha: scenario === 'wrong-parent' ? head : grant(VERIFICATION_GRANT).initializationParentSha }] };
      else if (url.includes('/contents/usage.json')) {
        const atGenesis = new URL(url).searchParams.get('ref') === genesisSha;
        const useOld = (atGenesis && scenario === 'wrong-genesis-grant') || (!atGenesis && scenario === 'wrong-head-grant');
        const ledger = fresh(useOld ? GRANT : VERIFICATION_GRANT);
        // A valid descendant appends exactly one reviewed price record.
        if (!atGenesis && !useOld) ledger.reviews.push({ ...review, evidenceSha256: 'c'.repeat(64) });
        body = { encoding: 'base64', content: Buffer.from(JSON.stringify(ledger)).toString('base64') };
      } else assert.fail(url);
      return new Response(JSON.stringify(body), { status: 200, headers: { date: new Date(NOW).toUTCString() } });
    } }, selection);
    if (scenario === 'valid') assert.equal((await store.read()).head, head);
    else await assert.rejects(store.read(), /grant_invalid|bootstrap_unproven/);
  }
});

test('new selection reads only its own pins, retains dispatch guards and fails closed without initialization', () => {
  const config = oneShotRuntimeConfig(env()); assert.equal(config.selection, selection);
  assert.equal(config.approvedGrantDigest, digest(grant(VERIFICATION_GRANT)));
  const oldPins = { DEEPSEEK_ONE_SHOT_GENESIS_SHA: 'b'.repeat(40), DEEPSEEK_ONE_SHOT_GRANT_SHA256: digest(grant(GRANT)), DEEPSEEK_ONE_SHOT_PRICE_REVIEW_SHA256: digest(review) };
  assert.throws(() => oneShotRuntimeConfig({ ...env(), ...oldPins, DEEPSEEK_VERIFY_20261111_GENESIS_SHA: undefined }), /uninitialized/);
  assert.equal(oneShotRuntimeConfig({ ...env(), ...oldPins, DEEPSEEK_VERIFY_20261111_GRANT_SHA256: undefined }).approvedGrantDigest, undefined);
  for (const patch of [{ DEEPSEEK_BUDGET_SELECTION: 'unknown' }, { GITHUB_EVENT_NAME: 'schedule' }, { GITHUB_EVENT_NAME: 'workflow_run' },
    { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_REF: 'refs/heads/other' }, { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_WORKFLOW_REF: 'other' }, { DEEPSEEK_BUDGET_CONSUMER: 'manual-external-ai' }]) {
    assert.throws(() => oneShotRuntimeConfig({ ...env(), ...patch }), /grant_manual_only/);
  }
  for (const patch of [{ DEEPSEEK_VERIFY_20261111_GENESIS_SHA: 'c'.repeat(40) }, { DEEPSEEK_VERIFY_20261111_GRANT_SHA256: 'c'.repeat(64) },
    { DEEPSEEK_VERIFY_20261111_PRICE_REVIEW_SHA256: 'c'.repeat(64) }, { GITHUB_RUN_ID: '456' }, { DEEPSEEK_BUDGET_GITHUB_TOKEN: 'ROTATED' }]) {
    assert.notEqual(oneShotRuntimeConfig({ ...env(), ...patch }).runtimeIdentity, config.runtimeIdentity);
  }
});

test('cached runtime cannot switch grants or pins after failure, even with otherwise valid workflow context', () => {
  const code = `globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY')};
    const {withOneShotBudget}=await import('./scripts/lib/deepseek-one-shot.mjs');
    for(const patch of [{}, {DEEPSEEK_BUDGET_SELECTION:${JSON.stringify(GRANT.id)},DEEPSEEK_ONE_SHOT_GENESIS_SHA:'b'.repeat(40)},
      {DEEPSEEK_BUDGET_SELECTION:${JSON.stringify(selection)},DEEPSEEK_VERIFY_20261111_GENESIS_SHA:'c'.repeat(40)}]) {
      Object.assign(process.env,patch); try {await withOneShotBudget(${JSON.stringify(context())},()=>{throw Error('PAID_FORBIDDEN')})}
      catch(e){console.log(e.budgetCode)}
    }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env() } });
  assert.equal(result.status, 0); assert.equal(result.stdout.match(/deepseek_budget_session_stopped/gu)?.length, 2);
  assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC/);
});

test('new grant retains CAS races, uncertain writes, lost receipts and failure holds without refunds', async () => {
  const store = memory(); let calls = 0;
  const raced = await Promise.allSettled([gate(store), gate(store)].map(run => run(context(), async () => { calls++; return response(); })));
  assert.equal(calls, 1); assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1);
  for (const scenario of ['unknown-reserve', 'lost-receipt', 'provider-failure', 'model-mismatch']) {
    const s = memory(), write = s.write.bind(s); let writes = 0, actual = 0;
    s.write = async (...args) => {
      writes++; if (scenario === 'lost-receipt' && writes === 2) throw Error('lost');
      const ok = await write(...args); if (scenario === 'unknown-reserve' && writes === 1) throw Error('unknown'); return ok;
    };
    const run = gate(s);
    await assert.rejects(run(context(), async () => {
      actual++; if (scenario === 'provider-failure') throw Error('provider failed');
      return { ...response(), ...(scenario === 'model-mismatch' ? { model: 'other' } : {}) };
    }));
    assert.equal(actual, scenario === 'unknown-reserve' ? 0 : 1);
    await assert.rejects(run(context(), () => assert.fail()), /session_stopped/);
    await assert.rejects(status(s), /grant_consumed/);
    await assert.rejects(status(s, { consumer: 'bubble-editorial' }), /receipt_pending|contract_hold/);
    assert.equal((await s.read()).ledger.entries[0].reservedMicroCny, POLICY.reserveMicroCny);
  }
});

test('new grant rejects bad balances and request mutation and enforces price and grant expiry before sending', async () => {
  for (const bad of [null, { ...balance(), is_available: false }, { is_available: true, balance_infos: [{ ...balance().balance_infos[0], total_balance: '2', topped_up_balance: '2' }] },
    { is_available: true, balance_infos: [...balance().balance_infos, { currency: 'USD', total_balance: '0.01', granted_balance: '0', topped_up_balance: '0.01' }] }]) {
    const s = memory(); await assert.rejects(gate(s, { readBalance: async () => bad })(context(), () => assert.fail()), /currency_unknown/);
    assert.equal((await s.read()).ledger.entries.length, 0);
  }
  for (const scenario of ['mutation', 'price-expiry', 'grant-expiry', 'clock-rollback']) {
    const s = memory(), write = s.write.bind(s), ctx = context(); let at = NOW;
    s.write = async (...args) => { const ok = await write(...args);
      if (scenario === 'mutation') ctx.payload.max_tokens++;
      if (scenario === 'price-expiry') at += 86400000;
      if (scenario === 'grant-expiry') at = Date.parse(VERIFICATION_GRANT.expiresAt) - 76000;
      if (scenario === 'clock-rollback') at--;
      return ok;
    };
    await assert.rejects(gate(s, { now: () => at })(ctx, () => assert.fail()), /invalid_request|request_changed|price_review_required|grant_expired|clock_rollback/);
    assert.equal((await s.read()).ledger.entries.length, 1);
  }
});

test('new CLI plan is offline, unknown selections fail, and both existing workflow steps receive only explicit new pins', () => {
  for (const id of [GRANT.id, selection, 'unknown']) {
    const result = spawnSync(process.execPath, ['scripts/review-deepseek-budget.mjs', '--one-shot-plan', id], { encoding: 'utf8' });
    assert.equal(result.status, id === 'unknown' ? 1 : 0);
    if (id !== 'unknown') { const json = JSON.parse(result.stdout); assert.equal(json.grant.id, id); assert.equal(json.writes + json.providerCalls, 0); }
  }
  for (const file of ['macro-risk-editorial-refresh.yml', 'bubble-watch-weekly-editorial-refresh.yml']) {
    const source = fs.readFileSync(`.github/workflows/${file}`, 'utf8');
    assert.match(source, /default: monthly/u);
    assert.equal(source.split(`          - ${selection}`).length - 1, 1);
    for (const suffix of ['GENESIS_SHA', 'GRANT_SHA256', 'PRICE_REVIEW_SHA256']) {
      assert.equal(source.split(`DEEPSEEK_VERIFY_20261111_${suffix}: \u0024{{ vars.DEEPSEEK_VERIFY_20261111_${suffix} }}`).length - 1, 2);
      assert.equal(source.split(`DEEPSEEK_ONE_SHOT_${suffix}: \u0024{{ vars.DEEPSEEK_ONE_SHOT_${suffix} }}`).length - 1, 2);
    }
    assert.equal(source.split("github.event_name == 'workflow_dispatch' && inputs.budget_selection || 'monthly'").length - 1, 2);
    assert.ok(source.indexOf('review-deepseek-budget.mjs --require-eligible') < source.indexOf('TAVILY_API_KEYS:'));
    assert.match(source, /--data-only/u);
  }
});

// Digests captured independently from pre-change main a9f6cab6, not derived
// from the new monthly policy. Existing grants and their price approvals survive.
test('both historical one-shot grants retain their exact pre-monthly-v2 digests', () => {
  assert.equal(POLICY_DIGEST, 'e5d89e09ba8bb0906bf0efeded3d185087809c9bf56aff44e048b083afee7518');
  assert.equal(digest(GRANT), '9c642871a981247ec449d666dc7b232a032da17ace4bdfe7ba88281f4a97a785');
  assert.equal(digest(VERIFICATION_GRANT), '6defa22d9fea4ce67fff8e40cc61478d40dca4bf37f884d558a1f6bad80850ba');
});
