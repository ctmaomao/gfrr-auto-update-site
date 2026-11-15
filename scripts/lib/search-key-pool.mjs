import { classifySearchRequestError } from './search-request-policy.mjs';

const QUOTA_ERRORS = new Set(['http_402_payment_required', 'http_432_plan_limit', 'http_433_paygo_limit']);

// A pool belongs to one collector invocation, never a persistent credential store.
// Only exhausted keys pause; another key/provider can still supply evidence.
// A new scheduled invocation probes again, so recovery needs no manual reset.
export function createSearchKeyPool(keys, onQuota = (category) => {
  const prefix = process.env.GITHUB_ACTIONS === 'true' ? '::warning::' : '';
  console.warn(`${prefix}News search ${category}: exhausted key paused for this collection; next scheduled collection may probe again.`);
}) {
  const uniqueKeys = [...new Set(keys)];
  const paused = new Map();
  return async (request) => {
    let lastError, providerRequestAttempted = false;
    for (const key of uniqueKeys) {
      if (paused.has(key)) { lastError = paused.get(key); providerRequestAttempted ||= lastError.providerRequestAttempted === true; continue; }
      try { return await request(key); } catch (error) {
        // A later preflight hold must not erase an earlier dispatched failure
        // in this logical query (or a paused key from this same collection).
        providerRequestAttempted ||= error?.providerRequestAttempted === true;
        if (providerRequestAttempted && error && typeof error === 'object') error.providerRequestAttempted = true;
        // A shared budget hold must not try another key to evade the account cap.
        if (error?.budgetCode) throw error;
        lastError = error;
        const category = classifySearchRequestError(error);
        if (QUOTA_ERRORS.has(category)) {
          // Retain only the status, never a response body or credential-bearing error.
          const safe = new Error(`HTTP ${category.slice(5, 8)}`);
          safe.httpStatus = Number(category.slice(5, 8));
          if (providerRequestAttempted) safe.providerRequestAttempted = true;
          paused.set(key, safe);
          lastError = safe;
          onQuota(category);
        }
      }
    }
    throw lastError || new Error('provider_not_configured');
  };
}
