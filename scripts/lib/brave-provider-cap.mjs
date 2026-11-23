// Production admission uses only Brave's Search plan-level Free credits only
// hard stop. The historical private proof is an identity pin, not a grant:
// remaining requests, expiry, reservations and the public ledger are not used.
import { keyFingerprint, SEARCH_REPOSITORY } from './free-search-ledger.mjs';
import { classifySearchRequestError } from './search-request-policy.mjs';
import policy from '../../config/brave-provider-cap.json' with { type: 'json' };

const PROVIDER_QUOTA = new Set(['http_402_payment_required', 'http_432_plan_limit', 'http_433_paygo_limit']);
const WORKFLOWS = Object.freeze({
  'macro-editorial': ['macro-risk-editorial-refresh.yml'],
  'bubble-editorial': ['bubble-watch-weekly-editorial-refresh.yml'],
  'oil-news': ['refresh-oil-news-event-watch.yml'],
  'bubble-ceo': ['refresh-bubble-watch.yml', 'refresh-bubble-watch-free.yml']
});
const unavailable = (suffix, details) => {
  const code = `brave_provider_${suffix}`;
  // budgetCode here is the key pool's hard-stop marker. It must not try a
  // different key as a fallback. It does not represent project accounting.
  return Object.assign(new Error(code), { budgetCode: code, ...details });
};

function readBinding(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== SEARCH_REPOSITORY
    || env.GITHUB_REF !== 'refs/heads/main') return null;
  // Use exactly the singleton configuration attested by the historical real
  // runners. Do not admit a new/alternate key after accidental secret drift.
  const keys = [...new Set([env.BRAVE_API_KEYS, env.BRAVE_API_KEY]
    .flatMap(value => String(value || '').split(/[\n,;]+/u)).map(value => value.trim()).filter(Boolean))];
  if (keys.length !== 1 || /\s/u.test(keys[0])) return null;
  try {
    const raw = env.BRAVE_BUDGET_PRIVATE_PROOF;
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 48000) return null;
    const proof = JSON.parse(raw);
    const pin = proof.grants?.[0];
    if (proof.schemaVersion !== 'brave-private-proof-v1' || proof.repository !== SEARCH_REPOSITORY
      || proof.branch !== 'brave-usage-ledger' || !Array.isArray(proof.grants)
      || !/^[a-f0-9]{16}$/u.test(pin?.keyId || '') || !/^[a-f0-9]{64}$/u.test(pin?.accountPlanBindingSha256 || '')) return null;
    if (!proof.grants.every(grant => grant?.keyId === pin.keyId && grant.accountPlanBindingSha256 === pin.accountPlanBindingSha256
      && grant.bindingType === 'verified_dashboard_login_and_plan_key'
      && grant.loginIdentityVerified === true && grant.planKeyAssociationVerified === true
      && grant.plan === 'search_postpaid' && grant.freeOnlyEnabled === true && grant.hardStopConfirmed === true)) return null;
    return keyFingerprint(keys[0]) === pin.keyId ? keys[0] : null;
  } catch {
    return null;
  }
}

export function createBraveProviderGate(env, enabled = policy.enabled) {
  let binding, stopped;
  return async ({ key, consumer }, request) => {
    if (!Object.hasOwn(WORKFLOWS, consumer) || !Array.isArray(enabled?.[consumer])
      || !enabled[consumer].includes(env.GITHUB_EVENT_NAME)
      || !WORKFLOWS[consumer].some(file => env.GITHUB_WORKFLOW_REF === `${SEARCH_REPOSITORY}/.github/workflows/${file}@refs/heads/main`)) {
      throw unavailable('disabled');
    }
    if (binding === undefined) binding = readBinding(env);
    if (!binding || key !== binding) throw unavailable('binding_unverified');
    if (stopped) throw unavailable(stopped.reason, { httpStatus: stopped.httpStatus, providerRequestAttempted: false });
    try {
      return await request();
    } catch (error) {
      const category = classifySearchRequestError(error);
      const httpStatus = Number(/^http_(\d{3})/u.exec(category)?.[1]) || undefined;
      const reason = PROVIDER_QUOTA.has(category) ? 'quota_unavailable'
        : category === 'http_429_rate_limited' ? 'rate_limited'
        : !httpStatus ? 'outcome_unknown' : null;
      if (!reason) throw error; // Other definite 4xx keep the existing diagnostic.
      stopped = { reason, httpStatus };
      throw unavailable(reason, { httpStatus, providerRequestAttempted: true });
    }
  };
}

export const withBraveProviderCap = createBraveProviderGate(process.env);
