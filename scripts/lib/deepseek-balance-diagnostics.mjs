// Diagnostic-only projection. Never returns raw fields, amounts, availability
// values, key identifiers, headers, provider errors, or an admission decision.
const URL = 'https://api.deepseek.com/user/balance';
const LIMIT = 65_536, TIMEOUT = 15_000, MAX_ROWS = 32;
export const DIAGNOSTIC_EXPIRES_AT = '2026-11-11T00:00:00.000Z';
const hold = () => ({ schemaVersion: 'deepseek-balance-shape-v1', admission: 'hold', diagnostic: 'unavailable' });
const type = value => value === null ? 'null' : Array.isArray(value) ? 'array'
  : ['string', 'number', 'boolean', 'object', 'undefined'].includes(typeof value) ? typeof value : 'other';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const field = (value, key) => {
  if (!record(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};
const format = value => ({ type: type(value), decimalStringFormat: typeof value === 'string'
  && /^(0|[1-9]\d*)(\.\d{1,8})?$/u.test(value) && Number.isFinite(Number(value)) });

export function inspectBalanceShape(value) {
  try {
    const balances = field(value, 'balance_infos');
    const count = Array.isArray(balances) ? balances.length : null;
    if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count > MAX_ROWS)) return hold();
    const rows = [];
    for (let i = 0; i < (count || 0); i++) {
      const descriptor = Object.getOwnPropertyDescriptor(balances, String(i));
      const row = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
      const currency = field(row, 'currency');
      rows.push({ type: type(row), currencyType: type(currency),
        currency: currency === 'CNY' || currency === 'USD' ? currency : 'unknown',
        totalBalance: format(field(row, 'total_balance')),
        grantedBalance: format(field(row, 'granted_balance')),
        toppedUpBalance: format(field(row, 'topped_up_balance')) });
    }
    return { schemaVersion: 'deepseek-balance-shape-v1', admission: 'hold', diagnostic: 'shape_only',
      responseType: type(value), availabilityType: type(field(value, 'is_available')),
      balanceInfosType: type(balances), balanceInfosCount: count, rows };
  } catch { return hold(); }
}

export function diagnosticContextAllowed(env, now = Date.now()) {
  return Number.isSafeInteger(now) && now >= 0 && now + 76_000 < Date.parse(DIAGNOSTIC_EXPIRES_AT)
    && env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && env.GITHUB_REPOSITORY === 'ctmaomao/gfrr-auto-update-site' && env.GITHUB_REF === 'refs/heads/main'
    && env.GITHUB_RUN_ATTEMPT === '1' && env.GITHUB_RUN_NUMBER === '1' && /^[0-9]+$/u.test(env.GITHUB_RUN_ID || '')
    && env.GITHUB_WORKFLOW_REF === 'ctmaomao/gfrr-auto-update-site/.github/workflows/deepseek-balance-shape-once-20261110.yml@refs/heads/main'
    && env.BALANCE_DIAGNOSTIC === 'true';
}

export async function diagnoseBalance({ key, fetchImpl = fetch, timeoutMs = TIMEOUT, monotonic = () => performance.now() }) {
  // No runtime timeout override: injection is only for deterministic offline tests.
  if (typeof key !== 'string' || !key || /[\r\n]/u.test(key) || timeoutMs !== TIMEOUT) return hold();
  const controller = new AbortController(), started = monotonic();
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('hold')); }, TIMEOUT); });
  const bounded = promise => Promise.race([promise, deadline]);
  const check = () => {
    const elapsed = monotonic() - started;
    if (controller.signal.aborted || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= TIMEOUT) throw Error('hold');
  };
  try {
    const response = await bounded(fetchImpl(URL, { method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } }));
    check();
    if (response.status !== 200 || !response.body) { void response.body?.cancel().catch(() => {}); return hold(); }
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try {
      for (;;) {
        const { done, value } = await bounded(reader.read()); check(); if (done) break;
        length += value.length;
        if (length > LIMIT) throw Error('hold');
        chunks.push(Buffer.from(value));
      }
    } catch { void reader.cancel().catch(() => {}); return hold(); }
    check();
    return inspectBalanceShape(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch { return hold(); } finally { clearTimeout(timer); controller.abort(); }
}

export async function runBalanceDiagnostic(args, env, fetchImpl = fetch, now = Date.now()) {
  if (args.length !== 1 || args[0] !== '--allow-balance-read' || !diagnosticContextAllowed(env, now)) return hold();
  return diagnoseBalance({ key: env.DEEPSEEK_API_KEY, fetchImpl });
}
