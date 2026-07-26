const FAILURE_CATEGORIES = new Set([
  'timeout',
  'network_error',
  'rate_limited',
  'server_error',
  'authentication_error',
  'request_rejected',
  'unexpected_http_status',
  'empty_response',
  'non_csv_response',
  'invalid_csv_schema',
  'response_parse_error',
  'unknown_error'
]);

export const FIRMS_REQUEST_POLICY = Object.freeze({
  version: 'firms-request-policy-1',
  maxRetriesPerRequest: 1,
  maxRetriesPerRun: 6,
  baseBackoffMs: 1000,
  maxBackoffMs: 5000
});

function finiteInteger(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function incrementCount(target, key) {
  if (!key) return;
  target[key] = (target[key] ?? 0) + 1;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function classifyHttpStatus(status) {
  if (status === 408) return { category: 'timeout', retryable: true };
  if (status === 429) return { category: 'rate_limited', retryable: true };
  if (status >= 500) return { category: 'server_error', retryable: true };
  if (status === 401 || status === 403) return { category: 'authentication_error', retryable: false };
  if (status >= 400 && status < 500) return { category: 'request_rejected', retryable: false };
  return { category: 'unexpected_http_status', retryable: false };
}

function classifyThrownError(error) {
  const name = String(error?.name ?? '');
  const code = String(error?.code ?? error?.cause?.code ?? '');
  if (name === 'AbortError' || code === 'ABORT_ERR') {
    return { category: 'timeout', retryable: true };
  }
  if (
    error instanceof TypeError
    || /^(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ENOTFOUND|ETIMEDOUT|UND_ERR_)/u.test(code)
  ) {
    return { category: 'network_error', retryable: true };
  }
  return { category: 'unknown_error', retryable: false };
}

function sanitizeDiagnostics(diagnostics = {}) {
  const category = FAILURE_CATEGORIES.has(diagnostics.category) ? diagnostics.category : null;
  const lastFailureCategory = FAILURE_CATEGORIES.has(diagnostics.lastFailureCategory)
    ? diagnostics.lastFailureCategory
    : null;
  return {
    policyVersion: FIRMS_REQUEST_POLICY.version,
    outcome: diagnostics.outcome === 'success' ? 'success' : 'error',
    category,
    retryable: diagnostics.retryable === true,
    httpStatus: Number.isInteger(diagnostics.httpStatus) ? diagnostics.httpStatus : null,
    attempts: finiteInteger(diagnostics.attempts),
    retryCount: finiteInteger(diagnostics.retryCount),
    recoveredAfterRetry: diagnostics.recoveredAfterRetry === true,
    retryBudgetExhausted: diagnostics.retryBudgetExhausted === true,
    backoffAppliedMs: finiteInteger(diagnostics.backoffAppliedMs),
    timeoutMs: finiteInteger(diagnostics.timeoutMs),
    maxRetriesPerRequest: FIRMS_REQUEST_POLICY.maxRetriesPerRequest,
    lastFailureCategory
  };
}

function createRequestError(diagnostics) {
  const safeDiagnostics = sanitizeDiagnostics(diagnostics);
  const error = new Error(
    `FIRMS request failed: ${safeDiagnostics.category ?? 'unknown_error'} after ${safeDiagnostics.attempts} attempt(s)`
  );
  error.name = 'FirmsRequestError';
  error.firmsDiagnostics = safeDiagnostics;
  return error;
}

function reserveRetry(retryBudget) {
  if (!retryBudget) return true;
  if (retryBudget.used >= retryBudget.maxRetriesPerRun) return false;
  retryBudget.used += 1;
  return true;
}

function buildBackoffMs({ retryIndex, retryAfterMs, baseBackoffMs, maxBackoffMs }) {
  const exponentialMs = baseBackoffMs * (2 ** retryIndex);
  const requestedMs = Number.isFinite(retryAfterMs) ? retryAfterMs : 0;
  return Math.min(maxBackoffMs, Math.max(exponentialMs, requestedMs));
}

export function createFirmsRetryBudget(maxRetriesPerRun = FIRMS_REQUEST_POLICY.maxRetriesPerRun) {
  const bounded = finiteInteger(maxRetriesPerRun, FIRMS_REQUEST_POLICY.maxRetriesPerRun);
  return {
    policyVersion: FIRMS_REQUEST_POLICY.version,
    maxRetriesPerRun: Math.min(50, bounded),
    used: 0
  };
}

export function parseFirmsRetryAfterMs(
  value,
  capMs = FIRMS_REQUEST_POLICY.maxBackoffMs,
  nowMs = Date.now()
) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let parsedMs = null;
  if (/^\d+(?:\.\d+)?$/u.test(raw)) {
    parsedMs = Math.round(Number(raw) * 1000);
  } else {
    const dateMs = Date.parse(raw);
    if (!Number.isNaN(dateMs)) parsedMs = dateMs - nowMs;
  }
  if (!Number.isFinite(parsedMs) || parsedMs <= 0) return null;
  return Math.min(Math.round(parsedMs), finiteInteger(capMs, FIRMS_REQUEST_POLICY.maxBackoffMs));
}

export function getFirmsErrorDiagnostics(error, { timeoutMs = 0 } = {}) {
  if (error?.firmsDiagnostics) return sanitizeDiagnostics(error.firmsDiagnostics);
  const classification = classifyThrownError(error);
  return sanitizeDiagnostics({
    outcome: 'error',
    category: classification.category,
    retryable: classification.retryable,
    attempts: 1,
    retryCount: 0,
    timeoutMs
  });
}

export function wrapFirmsResponseError(error, requestDiagnostics = {}) {
  const message = String(error?.message ?? '');
  const category = message.includes('response was empty')
    ? 'empty_response'
    : message.includes('response was not CSV')
      ? 'non_csv_response'
      : message.includes('CSV missing expected columns')
        ? 'invalid_csv_schema'
        : 'response_parse_error';
  const prior = sanitizeDiagnostics({
    ...requestDiagnostics,
    outcome: 'success'
  });
  throw createRequestError({
    ...prior,
    outcome: 'error',
    category,
    retryable: false,
    httpStatus: prior.httpStatus ?? 200,
    recoveredAfterRetry: false,
    lastFailureCategory: category
  });
}

export async function fetchFirmsText(url, {
  timeoutMs,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  retryBudget = null,
  maxRetries = FIRMS_REQUEST_POLICY.maxRetriesPerRequest,
  baseBackoffMs = FIRMS_REQUEST_POLICY.baseBackoffMs,
  maxBackoffMs = FIRMS_REQUEST_POLICY.maxBackoffMs
} = {}) {
  const boundedTimeoutMs = finiteInteger(timeoutMs);
  const boundedRetries = Math.min(
    FIRMS_REQUEST_POLICY.maxRetriesPerRequest,
    finiteInteger(maxRetries, FIRMS_REQUEST_POLICY.maxRetriesPerRequest)
  );
  const boundedBaseBackoffMs = Math.min(
    FIRMS_REQUEST_POLICY.maxBackoffMs,
    finiteInteger(baseBackoffMs, FIRMS_REQUEST_POLICY.baseBackoffMs)
  );
  const boundedMaxBackoffMs = Math.min(
    FIRMS_REQUEST_POLICY.maxBackoffMs,
    Math.max(boundedBaseBackoffMs, finiteInteger(maxBackoffMs, FIRMS_REQUEST_POLICY.maxBackoffMs))
  );
  const attempts = [];
  let backoffAppliedMs = 0;
  let retryBudgetExhausted = false;

  for (let attemptIndex = 0; attemptIndex <= boundedRetries; attemptIndex += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), boundedTimeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        const classification = classifyHttpStatus(response.status);
        const retryAfterMs = parseFirmsRetryAfterMs(
          response.headers?.get?.('Retry-After'),
          boundedMaxBackoffMs
        );
        attempts.push({
          outcome: 'error',
          category: classification.category,
          retryable: classification.retryable,
          httpStatus: response.status
        });
        try {
          await response.body?.cancel();
        } catch {
          // Body content is intentionally discarded and never copied into diagnostics.
        }

        if (classification.retryable && attemptIndex < boundedRetries) {
          if (!reserveRetry(retryBudget)) {
            retryBudgetExhausted = true;
          } else {
            const waitMs = buildBackoffMs({
              retryIndex: attemptIndex,
              retryAfterMs,
              baseBackoffMs: boundedBaseBackoffMs,
              maxBackoffMs: boundedMaxBackoffMs
            });
            backoffAppliedMs += waitMs;
            await sleepImpl(waitMs);
            continue;
          }
        }

        throw createRequestError({
          outcome: 'error',
          category: classification.category,
          retryable: classification.retryable,
          httpStatus: response.status,
          attempts: attempts.length,
          retryCount: Math.max(0, attempts.length - 1),
          retryBudgetExhausted,
          backoffAppliedMs,
          timeoutMs: boundedTimeoutMs,
          lastFailureCategory: classification.category
        });
      }

      const text = await response.text();
      attempts.push({ outcome: 'success', httpStatus: response.status });
      const lastFailure = [...attempts].reverse().find((attempt) => attempt.outcome === 'error');
      return {
        text,
        diagnostics: sanitizeDiagnostics({
          outcome: 'success',
          httpStatus: response.status,
          attempts: attempts.length,
          retryCount: Math.max(0, attempts.length - 1),
          recoveredAfterRetry: attempts.length > 1,
          retryBudgetExhausted,
          backoffAppliedMs,
          timeoutMs: boundedTimeoutMs,
          lastFailureCategory: lastFailure?.category ?? null
        })
      };
    } catch (error) {
      if (error?.firmsDiagnostics) throw error;
      const classification = classifyThrownError(error);
      attempts.push({
        outcome: 'error',
        category: classification.category,
        retryable: classification.retryable,
        httpStatus: null
      });
      if (classification.retryable && attemptIndex < boundedRetries) {
        if (!reserveRetry(retryBudget)) {
          retryBudgetExhausted = true;
        } else {
          const waitMs = buildBackoffMs({
            retryIndex: attemptIndex,
            retryAfterMs: null,
            baseBackoffMs: boundedBaseBackoffMs,
            maxBackoffMs: boundedMaxBackoffMs
          });
          backoffAppliedMs += waitMs;
          await sleepImpl(waitMs);
          continue;
        }
      }
      throw createRequestError({
        outcome: 'error',
        category: classification.category,
        retryable: classification.retryable,
        attempts: attempts.length,
        retryCount: Math.max(0, attempts.length - 1),
        retryBudgetExhausted,
        backoffAppliedMs,
        timeoutMs: boundedTimeoutMs,
        lastFailureCategory: classification.category
      });
    } finally {
      clearTimeout(timer);
    }
  }

  throw createRequestError({
    outcome: 'error',
    category: 'unknown_error',
    retryable: false,
    attempts: attempts.length,
    retryCount: Math.max(0, attempts.length - 1),
    retryBudgetExhausted,
    backoffAppliedMs,
    timeoutMs: boundedTimeoutMs,
    lastFailureCategory: 'unknown_error'
  });
}

export function summarizeFirmsRequestDiagnostics(diagnosticsList, {
  logicalRequestCount = diagnosticsList.length,
  retryBudget = null
} = {}) {
  const sanitized = diagnosticsList.map((item) => sanitizeDiagnostics(item));
  const failuresByCategory = {};
  const attemptFailuresByCategory = {};
  for (const item of sanitized) {
    if (item.outcome === 'error') incrementCount(failuresByCategory, item.category);
    if (item.lastFailureCategory) incrementCount(attemptFailuresByCategory, item.lastFailureCategory);
  }
  return {
    policyVersion: FIRMS_REQUEST_POLICY.version,
    logicalRequestCount: finiteInteger(logicalRequestCount),
    totalAttemptCount: sanitized.reduce((sum, item) => sum + item.attempts, 0),
    retryCount: sanitized.reduce((sum, item) => sum + item.retryCount, 0),
    recoveredAfterRetryCount: sanitized.filter((item) => item.recoveredAfterRetry).length,
    failedRequestCount: sanitized.filter((item) => item.outcome === 'error').length,
    retryableFailureCount: sanitized.filter((item) => item.outcome === 'error' && item.retryable).length,
    retryBudgetExhaustedCount: sanitized.filter((item) => item.retryBudgetExhausted).length,
    backoffAppliedMs: sanitized.reduce((sum, item) => sum + item.backoffAppliedMs, 0),
    failuresByCategory,
    attemptFailuresByCategory,
    retryPolicy: {
      maxRetriesPerRequest: FIRMS_REQUEST_POLICY.maxRetriesPerRequest,
      maxRetriesPerRun: retryBudget?.maxRetriesPerRun ?? FIRMS_REQUEST_POLICY.maxRetriesPerRun,
      retriesUsed: retryBudget?.used ?? sanitized.reduce((sum, item) => sum + item.retryCount, 0),
      baseBackoffMs: FIRMS_REQUEST_POLICY.baseBackoffMs,
      maxBackoffMs: FIRMS_REQUEST_POLICY.maxBackoffMs
    }
  };
}
