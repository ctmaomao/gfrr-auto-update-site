import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DIAGNOSTIC_EXPIRES_AT, inspectBalanceShape, diagnoseBalance, diagnosticContextAllowed, runBalanceDiagnostic } from '../../scripts/lib/deepseek-balance-diagnostics.mjs';
import { validateBalance } from '../../scripts/lib/deepseek-budget.mjs';
const secret = 'SENSITIVE_KEY_SENTINEL';
const payload = () => ({ is_available: true, balance_infos: [
  { currency: 'CNY', total_balance: '987654.321', granted_balance: '12345.67', topped_up_balance: '975308.651' },
  { currency: 'USD', total_balance: '314159.265', granted_balance: '0', topped_up_balance: '314159.265' }
] });
const env = () => ({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site',
  GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '123', BALANCE_DIAGNOSTIC: 'true', DEEPSEEK_API_KEY: secret,
  GITHUB_WORKFLOW_REF: 'ctmaomao/gfrr-auto-update-site/.github/workflows/deepseek-balance-shape-once-20261110.yml@refs/heads/main' });
const unavailable = { schemaVersion: 'deepseek-balance-shape-v1', admission: 'hold', diagnostic: 'unavailable' };
function safe(report) {
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /987654|12345|975308|314159|SENSITIVE|Bearer|api\.deepseek|request_id|headers|nonzero|payable|eligible|balanceAvailable/iu);
  assert.equal(report.admission, 'hold');
}
const reply = (json = payload()) => new Response(JSON.stringify(json), { status: 200 });

test('shape projection emits only fixed types/formats, array count and allowlisted currencies', () => {
  const result = inspectBalanceShape(payload()); safe(result);
  assert.deepEqual(result, { schemaVersion: 'deepseek-balance-shape-v1', admission: 'hold', diagnostic: 'shape_only',
    responseType: 'object', availabilityType: 'boolean', balanceInfosType: 'array', balanceInfosCount: 2,
    rows: ['CNY', 'USD'].map(currency => ({ type: 'object', currencyType: 'string', currency,
      totalBalance: { type: 'string', decimalStringFormat: true }, grantedBalance: { type: 'string', decimalStringFormat: true },
      toppedUpBalance: { type: 'string', decimalStringFormat: true } })) });
  const other = payload(); other.is_available = false;
  other.balance_infos.forEach(row => { row.total_balance = '0'; row.granted_balance = '0'; row.topped_up_balance = '0'; });
  assert.deepEqual(inspectBalanceShape(other), result, 'availability value and zero/nonzero must be indistinguishable');
});

test('missing/null/non-array response shapes and unapproved currency values never leak', () => {
  for (const value of [null, undefined, 'SENSITIVE_BODY', 12345, true, [], {}, { is_available: 'SENSITIVE_BODY', balance_infos: null },
    { balance_infos: ['SENSITIVE_BODY', null, 987654, [], {}, { currency: secret, total_balance: secret }] }]) safe(inspectBalanceShape(value));
  const result = inspectBalanceShape({ balance_infos: [{ currency: secret, total_balance: secret }] });
  assert.equal(result.rows[0].currency, 'unknown'); assert.equal(result.rows[0].totalBalance.decimalStringFormat, false);
  assert.deepEqual(inspectBalanceShape({ balance_infos: Array(33).fill({}) }), unavailable);
});

test('balance formats retain no raw amount, availability value or unknown property names', () => {
  for (const value of [0, null, undefined, '', '-1', 'NaN', 'Infinity', '1e10', '+1', '00', '.1', '1.', '1.123456789', '9'.repeat(400), [], {}, true]) {
    const result = inspectBalanceShape({ is_available: value, balance_infos: [{ currency: 'CNY', total_balance: value, SENSITIVE_NAME: secret }] });
    assert.equal(result.rows[0].totalBalance.decimalStringFormat, false); safe(result);
  }
});

test('accessors, inherited fields, symbols and toJSON cannot enter diagnostic output', () => {
  let calls = 0;
  const value = { toJSON() { calls++; return secret; }, [Symbol('SENSITIVE')]: secret };
  Object.defineProperty(value, 'balance_infos', { get() { calls++; throw Error(secret); } });
  safe(inspectBalanceShape(value)); assert.equal(calls, 0);
  const row = {}; Object.defineProperty(row, 'currency', { get() { calls++; return secret; } });
  safe(inspectBalanceShape({ balance_infos: [row, Object.create({ currency: secret })] })); assert.equal(calls, 0);
  assert.deepEqual(inspectBalanceShape(new Proxy({}, { getPrototypeOf() { throw Error(secret); } })), unavailable);
  for (const length of [secret, -1, Infinity, 1.5]) {
    const array = new Proxy([], { get(target, name) { return name === 'length' ? length : Reflect.get(target, name); } });
    assert.deepEqual(inspectBalanceShape({ balance_infos: array }), unavailable);
  }
});

test('exactly one balance GET is issued, redirect error; no search/generation/ledger endpoint', async () => {
  let calls = 0;
  const result = await diagnoseBalance({ key: secret, fetchImpl: async (url, init) => {
    calls++; assert.equal(url, 'https://api.deepseek.com/user/balance'); assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    assert.equal(init.body, undefined); assert.ok(init.signal instanceof AbortSignal); return reply();
  } });
  assert.equal(calls, 1); safe(result); assert.equal(result.diagnostic, 'shape_only');
});

test('HTTP, redirects, malformed/oversized JSON and errors are generic hold with no retry', async () => {
  for (const make of [() => new Response(secret, { status: 401 }), () => new Response(secret, { status: 429 }),
    () => new Response(secret, { status: 500 }), () => new Response(secret, { status: 302, headers: { Location: 'https://bad.example' } }),
    () => new Response(secret, { status: 200 }), () => new Response('x'.repeat(65537)), () => { throw Error(secret); }]) {
    let calls = 0;
    const result = await diagnoseBalance({ key: secret, fetchImpl: async () => { calls++; return make(); } });
    assert.deepEqual(result, unavailable); assert.equal(calls, 1); safe(result);
  }
});

test('clock deadline after headers or body stops without a retry', async () => {
  for (const phase of ['headers', 'body']) {
    let clock = 0, calls = 0;
    const result = await diagnoseBalance({ key: secret, monotonic: () => clock, fetchImpl: async () => {
      calls++;
      if (phase === 'headers') { clock = 15000; return reply(); }
      return new Response(new ReadableStream({ pull(controller) { clock = 15000; controller.enqueue(new TextEncoder().encode('{}')); controller.close(); } }));
    } });
    assert.deepEqual(result, unavailable); assert.equal(calls, 1);
  }
});

test('bad key or attempted timeout override performs no request', async () => {
  for (const key of [undefined, '', 'bad\r\nkey', 123]) assert.deepEqual(await diagnoseBalance({ key, fetchImpl: () => assert.fail() }), unavailable);
  assert.deepEqual(await diagnoseBalance({ key: secret, timeoutMs: 1, fetchImpl: () => assert.fail() }), unavailable);
});

test('manual exact-workflow first-attempt opt-in is required before accessing provider', async () => {
  assert.equal(diagnosticContextAllowed(env(), Date.parse('2026-11-10T02:00:00.000Z')), true);
  for (const patch of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_EVENT_NAME: 'workflow_run' }, { GITHUB_EVENT_NAME: 'schedule' },
    { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_RUN_ATTEMPT: '2' },
    { GITHUB_RUN_NUMBER: '2' }, { GITHUB_RUN_NUMBER: undefined }, { GITHUB_RUN_ID: 'local' }, { BALANCE_DIAGNOSTIC: 'false' }, { GITHUB_WORKFLOW_REF: 'other' }]) {
    assert.deepEqual(await runBalanceDiagnostic(['--allow-balance-read'], { ...env(), ...patch }, () => assert.fail()), unavailable);
  }
  for (const args of [[], ['--allow-network'], ['--allow-balance-read', '--retry']]) assert.deepEqual(await runBalanceDiagnostic(args, env(), () => assert.fail()), unavailable);
  safe(await runBalanceDiagnostic(['--allow-balance-read'], env(), async () => reply(), Date.parse('2026-11-10T02:00:00.000Z')));
});

test('real CLI defaults to no network, emits only generic hold, and exits nonzero', () => {
  const result = spawnSync(process.execPath, ['scripts/diagnose-deepseek-balance.mjs'], { encoding: 'utf8', env: {} });
  assert.equal(result.status, 1); assert.deepEqual(JSON.parse(result.stdout), unavailable); assert.equal(result.stderr, '');
});

test('unchanged paid currency gate rejects mixed currency and unavailable balance, even after diagnostic', () => {
  for (const value of [payload(), { ...payload(), is_available: false }, { ...payload(), balance_infos: [payload().balance_infos[1]] }]) {
    inspectBalanceShape(value); assert.throws(() => validateBalance(value), /currency_unknown/);
  }
  assert.deepEqual(validateBalance({ is_available: true, balance_infos: [payload().balance_infos[0]] }), { currency: 'CNY' });
  assert.throws(() => validateBalance({ is_available: false, balance_infos: [payload().balance_infos[0]] }), /currency_unknown/);
});

test('retired diagnostic has no workflow entrypoint or copied credential-access invocation', () => {
  const file = '.github/workflows/deepseek-balance-shape-once-20261110.yml';
  assert.equal(fs.existsSync(file), false, 'the single-use credential entrypoint must remain deleted');
  for (const candidate of fs.readdirSync('.github/workflows').filter(name => /\.ya?ml$/u.test(name))) {
    const workflow = fs.readFileSync(`.github/workflows/${candidate}`, 'utf8');
    assert.doesNotMatch(workflow, /DeepSeek Balance Shape Once|deepseek-balance-shape-once|diagnose-deepseek-balance|deepseek-balance-diagnostics|--allow-balance-read|BALANCE_DIAGNOSTIC|acknowledge_single_read|diagnoseBalance|inspectBalanceShape|diagnosticContextAllowed|runBalanceDiagnostic|api\.deepseek\.com\/user\/balance/u,
      `${candidate} must not copy, rename, invoke or inline the retired diagnostic`);
    if (!workflow.includes('workflow_run:')) continue;
    const trigger = workflow.split('workflow_run:')[1].split(/^  [a-z_]+:/mu)[0];
    assert.match(trigger, /workflows:/u, `${candidate} must have an explicit upstream allowlist`);
    assert.doesNotMatch(trigger, /DeepSeek Balance Shape Once|deepseek-balance-shape-once|\*/u, candidate);
  }
  const history = fs.readFileSync('scripts/bubble-watch/run-editorial-followup.mjs', 'utf8');
  const policy = fs.readFileSync('scripts/bubble-watch/editorial-followup.mjs', 'utf8');
  assert.match(policy, /WORKFLOW = 'bubble-watch-weekly-editorial-refresh.yml'/u);
  assert.ok(history.includes('actions/workflows/${WORKFLOW}/runs?'));
  assert.ok(history.includes('run.path !== `.github/workflows/${WORKFLOW}`'));
  assert.doesNotMatch(history, /actions\/runs\?/u, 'history must remain scoped to original article workflow');
  const cli = fs.readFileSync('scripts/diagnose-deepseek-balance.mjs', 'utf8');
  assert.match(cli, /process.exitCode = 1/u);
  const module = fs.readFileSync('scripts/lib/deepseek-balance-diagnostics.mjs', 'utf8');
  assert.doesNotMatch(module, /from |chat\/completions|tavily|brave|api\.github|writeFile|console\./u);
});

test('timer bounds even a transport that ignores AbortSignal, without retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const pending = diagnoseBalance({ key: secret, fetchImpl: () => { calls++; return new Promise(() => {}); } });
  t.mock.timers.tick(15000);
  assert.deepEqual(await pending, unavailable); assert.equal(calls, 1);
});

test('broken body stream and impossible monotonic clock only return generic hold', async () => {
  const result = await diagnoseBalance({ key: secret, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.error(Error(secret)); }
  })) });
  assert.deepEqual(result, unavailable);
  let n = 0;
  assert.deepEqual(await diagnoseBalance({ key: secret, monotonic: () => ++n === 1 ? 100 : 0, fetchImpl: async () => reply() }), unavailable);
});


test('fixed expiry and new-run/rerun gates reject before reading the key', async () => {
  const allowed = env();
  Object.defineProperty(allowed, 'DEEPSEEK_API_KEY', { get() { assert.fail('credential read'); } });
  for (const now of [Date.parse(DIAGNOSTIC_EXPIRES_AT) - 76_000, Date.parse(DIAGNOSTIC_EXPIRES_AT), Infinity, NaN, -1]) {
    assert.equal(diagnosticContextAllowed(allowed, now), false);
    assert.deepEqual(await runBalanceDiagnostic(['--allow-balance-read'], allowed, () => assert.fail(), now), unavailable);
  }
  for (const patch of [{ GITHUB_RUN_NUMBER: '2' }, { GITHUB_RUN_ATTEMPT: '2' }]) {
    const invalid = { ...env(), ...patch };
    Object.defineProperty(invalid, 'DEEPSEEK_API_KEY', { get() { assert.fail('credential read'); } });
    assert.deepEqual(await runBalanceDiagnostic(['--allow-balance-read'], invalid, () => assert.fail(), Date.parse('2026-11-10T02:00:00.000Z')), unavailable);
  }
  assert.equal(diagnosticContextAllowed(env(), Date.parse(DIAGNOSTIC_EXPIRES_AT) - 76_001), true);
});
