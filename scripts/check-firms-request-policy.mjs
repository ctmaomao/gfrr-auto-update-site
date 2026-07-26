#!/usr/bin/env node
import {
  FIRMS_REQUEST_POLICY,
  createFirmsRetryBudget,
  fetchFirmsText,
  getFirmsErrorDiagnostics,
  parseFirmsRetryAfterMs,
  summarizeFirmsRequestDiagnostics,
  wrapFirmsResponseError
} from './oil-directional/firms-request-policy.mjs';

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

async function captureFailure(task) {
  try {
    await task();
    failures.push('Expected FIRMS request to fail.');
    return null;
  } catch (error) {
    return error;
  }
}

function response(status, body = '', headers = {}) {
  return new Response(body, { status, headers });
}

const recoveryResponses = [
  response(503, 'secret provider body must not escape'),
  response(200, 'acq_date,acq_time,confidence,frp,daynight\n')
];
const recoverySleeps = [];
const recoveryBudget = createFirmsRetryBudget();
const recovered = await fetchFirmsText('https://example.invalid/SECRET_KEY', {
  timeoutMs: 2000,
  retryBudget: recoveryBudget,
  fetchImpl: async () => recoveryResponses.shift(),
  sleepImpl: async (ms) => recoverySleeps.push(ms)
});
expect(recovered.diagnostics.outcome === 'success', '503 -> 200 must recover.');
expect(recovered.diagnostics.attempts === 2, 'Recovered request must record two attempts.');
expect(recovered.diagnostics.retryCount === 1, 'Recovered request must record one retry.');
expect(recovered.diagnostics.recoveredAfterRetry === true, 'Recovered request must be labeled recovered.');
expect(recovered.diagnostics.lastFailureCategory === 'server_error', '503 must classify as server_error.');
expect(recoverySleeps.join(',') === '1000', '503 retry must use bounded 1000ms base backoff.');
expect(recoveryBudget.used === 1, 'Successful retry must consume one run retry slot.');

const rateLimitSleeps = [];
const rateLimitError = await captureFailure(() => fetchFirmsText('https://example.invalid/SECRET_KEY', {
  timeoutMs: 2000,
  retryBudget: createFirmsRetryBudget(),
  fetchImpl: async () => response(429, 'raw rate-limit body', { 'Retry-After': '99' }),
  sleepImpl: async (ms) => rateLimitSleeps.push(ms)
}));
const rateLimitDiagnostics = getFirmsErrorDiagnostics(rateLimitError);
expect(rateLimitDiagnostics.category === 'rate_limited', '429 must classify as rate_limited.');
expect(rateLimitDiagnostics.attempts === 2, '429 must stop after one bounded retry.');
expect(rateLimitSleeps.join(',') === '5000', 'Retry-After must be capped at 5000ms.');

let authenticationCalls = 0;
const authenticationError = await captureFailure(() => fetchFirmsText('https://example.invalid/SECRET_KEY', {
  timeoutMs: 2000,
  retryBudget: createFirmsRetryBudget(),
  fetchImpl: async () => {
    authenticationCalls += 1;
    return response(403, 'SECRET_KEY invalid: raw provider body');
  },
  sleepImpl: async () => {}
}));
const authenticationDiagnostics = getFirmsErrorDiagnostics(authenticationError);
expect(authenticationDiagnostics.category === 'authentication_error', '403 must classify as authentication_error.');
expect(authenticationDiagnostics.retryable === false, '403 must not be retryable.');
expect(authenticationCalls === 1, '403 must not be retried.');
const authenticationText = JSON.stringify({
  message: authenticationError?.message,
  diagnostics: authenticationDiagnostics
});
expect(!authenticationText.includes('SECRET_KEY'), 'Diagnostics must not expose URL keys.');
expect(!authenticationText.includes('raw provider body'), 'Diagnostics must not expose response bodies.');
expect(!authenticationText.includes('example.invalid'), 'Diagnostics must not expose request URLs.');

const emptyBudget = createFirmsRetryBudget(0);
const exhaustedError = await captureFailure(() => fetchFirmsText('https://example.invalid/key', {
  timeoutMs: 2000,
  retryBudget: emptyBudget,
  fetchImpl: async () => response(503, 'unavailable'),
  sleepImpl: async () => failures.push('Exhausted retry budget must not sleep.')
}));
const exhaustedDiagnostics = getFirmsErrorDiagnostics(exhaustedError);
expect(exhaustedDiagnostics.attempts === 1, 'Exhausted run budget must stop after the first attempt.');
expect(exhaustedDiagnostics.retryBudgetExhausted === true, 'Exhausted run budget must be explicit.');

let networkCalls = 0;
const networkRecovery = await fetchFirmsText('https://example.invalid/key', {
  timeoutMs: 2000,
  retryBudget: createFirmsRetryBudget(),
  fetchImpl: async () => {
    networkCalls += 1;
    if (networkCalls === 1) throw new TypeError('socket details must not escape');
    return response(200, 'ok');
  },
  sleepImpl: async () => {}
});
expect(networkRecovery.diagnostics.lastFailureCategory === 'network_error', 'TypeError must classify as network_error.');
expect(networkRecovery.diagnostics.recoveredAfterRetry === true, 'Network recovery must be recorded.');

const timeoutResponses = [new DOMException('timed out', 'AbortError'), response(200, 'ok')];
const timeoutRecovery = await fetchFirmsText('https://example.invalid/key', {
  timeoutMs: 2000,
  retryBudget: createFirmsRetryBudget(),
  fetchImpl: async () => {
    const item = timeoutResponses.shift();
    if (item instanceof Error) throw item;
    return item;
  },
  sleepImpl: async () => {}
});
expect(timeoutRecovery.diagnostics.lastFailureCategory === 'timeout', 'AbortError must classify as timeout.');

let parseError = null;
try {
  wrapFirmsResponseError(
    new Error('FIRMS CSV missing expected columns: frp'),
    recovered.diagnostics
  );
} catch (error) {
  parseError = error;
}
const parseDiagnostics = getFirmsErrorDiagnostics(parseError);
expect(parseDiagnostics.category === 'invalid_csv_schema', 'CSV schema errors must be classified.');
expect(parseDiagnostics.retryable === false, 'CSV schema errors must not be retried.');

expect(parseFirmsRetryAfterMs('2.5') === 2500, 'Numeric Retry-After parsing failed.');
expect(parseFirmsRetryAfterMs('99') === FIRMS_REQUEST_POLICY.maxBackoffMs, 'Retry-After cap failed.');
expect(parseFirmsRetryAfterMs('invalid') === null, 'Invalid Retry-After must be ignored.');

const summary = summarizeFirmsRequestDiagnostics([
  recovered.diagnostics,
  rateLimitDiagnostics,
  authenticationDiagnostics,
  exhaustedDiagnostics,
  networkRecovery.diagnostics,
  timeoutRecovery.diagnostics,
  parseDiagnostics
], {
  logicalRequestCount: 7,
  retryBudget: recoveryBudget
});
expect(summary.logicalRequestCount === 7, 'Summary logical request count mismatch.');
expect(summary.failedRequestCount === 4, 'Summary failed request count mismatch.');
expect(summary.failuresByCategory.rate_limited === 1, 'Summary rate_limited count mismatch.');
expect(summary.failuresByCategory.authentication_error === 1, 'Summary authentication_error count mismatch.');
expect(summary.failuresByCategory.server_error === 1, 'Summary server_error count mismatch.');
expect(summary.failuresByCategory.invalid_csv_schema === 1, 'Summary invalid_csv_schema count mismatch.');
expect(summary.retryPolicy.maxRetriesPerRequest === 1, 'Per-request retry cap drifted.');
expect(summary.retryPolicy.maxRetriesPerRun === 6, 'Per-run retry cap drifted.');

if (failures.length > 0) {
  console.error('FIRMS request policy check FAILED:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('FIRMS request policy check: PASS (sanitized categories, one retry/request, six retries/run)');
