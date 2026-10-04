// CORS and preflight regressions for the report endpoint.
//
// The Reporting API fetches `report-to` endpoints in `cors` mode, so the preflight MUST succeed for
// a browser to send anything. Before this change the generic "not POST" branch answered 405 with no
// CORS headers. Cross-origin Reporting API preflights therefore could not pass; legacy `report-uri`
// (no-cors) has no preflight dependency, but native browser delivery remains unverified.
//
// Scope note: these are LOCAL tests. They prove the receiver's policy, NOT that a real browser
// delivers a report — that needs the platform browser test, which is separately authorized.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHealth, handlePreflight, handleReport, parseAllowedOrigins } from '../../workers/gfrr-csp-report-receiver/src/index.js';
import { LIMITS } from '../../workers/gfrr-csp-report-receiver/src/constants.js';

const ORIGIN = 'https://report-origin.example.test';
const ALLOWED = parseAllowedOrigins(`${ORIGIN}, https://second.example.test`);

/** Request-like object with arbitrary headers, so preflight and Origin cases are expressible. */
function request({
  method = 'POST',
  headers = {},
  body = '',
  contentLength,
  chunkSize = 4096,
} = {}) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  if (contentLength !== undefined) map.set('content-length', String(contentLength));

  return {
    method,
    headers: { get: (name) => map.get(String(name).toLowerCase()) ?? null },
    body: {
      getReader: () => ({
        async read() {
          if (offset >= bytes.length) return { done: true };
          const slice = bytes.slice(offset, offset + chunkSize);
          offset += slice.length;
          return { done: false, value: slice };
        },
        async cancel() {},
      }),
    },
  };
}

/** A Durable Object stub recording calls, so "OPTIONS has no side effects" is checkable. */
function envWithStub(result = { action: 'commit', stored: 1, overflowReports: 0, diagnostics: {} }) {
  const calls = [];
  const stub = {
    async ingest(payload) { calls.push(['ingest', payload]); return result; },
    async health(payload) { calls.push(['health', payload]); return { status: 'healthy', alerts: [] }; },
  };
  return { calls, env: { CSP_RECEIVER: { idFromName: (name) => name, get: () => stub } } };
}

const preflightHeaders = (overrides = {}) => ({
  origin: ORIGIN,
  'access-control-request-method': 'POST',
  'access-control-request-headers': 'content-type',
  ...overrides,
});

const legacyBody = JSON.stringify({
  'csp-report': {
    'document-uri': 'https://receiver-test.example.test/index.html',
    'effective-directive': 'script-src',
    'blocked-uri': 'inline',
    disposition: 'report',
  },
});

const reportingBody = JSON.stringify([
  {
    type: 'csp-violation',
    age: 12,
    body: {
      documentURL: 'https://receiver-test.example.test/index.html',
      effectiveDirective: 'style-src-elem',
      blockedURL: 'https://cdn.example.test/a.css',
      disposition: 'report',
    },
  },
]);

test('a valid preflight is accepted and advertises the exact policy', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(request({ method: 'OPTIONS', headers: preflightHeaders() }), env, {
    allowedOrigins: ALLOWED,
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN, 'the single matched origin, not a list');
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), 'content-type');
  assert.equal(response.headers.get('access-control-max-age'), '600');
  assert.equal(response.headers.get('vary'), 'origin');
  assert.equal(response.headers.get('cache-control'), 'no-store', 'no-store is preserved');
  assert.equal(response.headers.get('access-control-allow-credentials'), null, 'credentials are never enabled');
  assert.equal(response.headers.get('access-control-allow-origin') === '*', false, 'never a wildcard');
  assert.equal(calls.length, 0, 'a preflight must not touch the Durable Object');
});

test('a preflight from an unlisted origin is refused without echoing headers', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(
    request({ method: 'OPTIONS', headers: preflightHeaders({ origin: 'https://evil.example.test' }) }),
    env,
    { allowedOrigins: ALLOWED },
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), null, 'no origin is reflected');
  assert.equal(response.headers.get('access-control-allow-methods'), null);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(calls.length, 0);
});

test('the default allowlist is empty, so no origin is allowed by default', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(request({ method: 'OPTIONS', headers: preflightHeaders() }), env);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(calls.length, 0);
});

test('a preflight asking for another method or header is refused', async () => {
  const { env } = envWithStub();
  const wrongMethod = await handlePreflight(
    request({ method: 'OPTIONS', headers: preflightHeaders({ 'access-control-request-method': 'PUT' }) }),
    { allowedOrigins: ALLOWED },
  );
  assert.equal(wrongMethod.headers.get('access-control-allow-origin'), null, 'only POST is offered');

  const wrongHeader = await handlePreflight(
    request({ method: 'OPTIONS', headers: preflightHeaders({ 'access-control-request-headers': 'content-type, x-custom' }) }),
    { allowedOrigins: ALLOWED },
  );
  assert.equal(wrongHeader.headers.get('access-control-allow-origin'), null, 'only content-type is offered');
});

test('a preflight with no Origin is refused and writes nothing', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(
    request({ method: 'OPTIONS', headers: { 'access-control-request-method': 'POST' } }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(calls.length, 0, 'no Durable Object call, so no schema, ledger or alarm work');
});

test('an allowed Origin gets CORS headers on a successful ingest, errors included', async () => {
  const { env } = envWithStub();
  const ok = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report', origin: ORIGIN }, body: legacyBody }),
    env,
    { allowedOrigins: ALLOWED, now: () => Date.parse('2026-10-10T05:00:00.000Z') },
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(ok.headers.get('cache-control'), 'no-store');

  // The existing error responses must carry the same policy rather than being CORS-blind.
  const wrongType = await handleReport(
    request({ headers: { 'content-type': 'text/plain', origin: ORIGIN }, body: '{}' }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(wrongType.status, 415);
  assert.equal(wrongType.headers.get('access-control-allow-origin'), ORIGIN);

  const badJson = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report', origin: ORIGIN }, body: '{not json' }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(badJson.status, 400);
  assert.equal(badJson.headers.get('access-control-allow-origin'), ORIGIN);

  const methodGate = await handleReport(
    request({ method: 'GET', headers: { origin: ORIGIN } }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(methodGate.status, 405);
  assert.equal(methodGate.headers.get('access-control-allow-origin'), ORIGIN);
});

test('a 413 also carries the CORS policy for an allowed origin', async () => {
  const { env } = envWithStub();
  const declared = await handleReport(
    request({
      headers: { 'content-type': 'application/csp-report', origin: ORIGIN },
      body: '{}',
      contentLength: LIMITS.MAX_BODY_BYTES + 1,
    }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(declared.status, 413);
  assert.equal(declared.headers.get('access-control-allow-origin'), ORIGIN, 'the declared-length gate keeps the policy');
  assert.equal(declared.headers.get('cache-control'), 'no-store');

  const streamed = await handleReport(
    request({
      headers: { 'content-type': 'application/csp-report', origin: ORIGIN },
      body: 'x'.repeat(LIMITS.MAX_BODY_BYTES + 10),
    }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(streamed.status, 413);
  assert.equal(streamed.headers.get('access-control-allow-origin'), ORIGIN, 'the streaming gate keeps the policy');
});

test('a 429 carries the CORS policy and exposes retry-after to the allowed origin', async () => {
  const { env } = envWithStub({ action: 'reject', reason: 'ingest-budget', diagnostics: {} });
  const response = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report', origin: ORIGIN }, body: legacyBody }),
    env,
    { allowedOrigins: ALLOWED, now: () => Date.parse('2026-10-10T05:00:00.000Z') },
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(
    response.headers.get('access-control-expose-headers'),
    'retry-after',
    'the rejected origin must be able to read the retry hint',
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).ok, false);
});

test('an unlisted Origin gets no CORS headers on the actual POST either', async () => {
  const { env } = envWithStub();
  const response = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report', origin: 'https://evil.example.test' }, body: legacyBody }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(response.status, 200, 'the report is still processed; only the response is not exposed');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('a request without an Origin gets no CORS headers (CLI and same-origin path)', async () => {
  const { env } = envWithStub();
  const response = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report' }, body: legacyBody }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('vary'), null);
});

test('the legacy wire format still ingests after the CORS change', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report', origin: ORIGIN }, body: legacyBody }),
    env,
    { allowedOrigins: ALLOWED, now: () => Date.parse('2026-10-10T05:00:00.000Z') },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).action, 'commit');
  assert.equal(calls.filter(([kind]) => kind === 'ingest').length, 1);
});

test('the Reporting API wire format still ingests after the CORS change', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(
    request({ headers: { 'content-type': 'application/reports+json', origin: ORIGIN }, body: reportingBody }),
    env,
    { allowedOrigins: ALLOWED, now: () => Date.parse('2026-10-10T05:00:00.000Z') },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).action, 'commit');
  assert.equal(calls.filter(([kind]) => kind === 'ingest').length, 1);
});

test('the existing input gates are unchanged by the CORS work', async () => {
  const { calls, env } = envWithStub();

  const method = await handleReport(request({ method: 'GET' }), env, { allowedOrigins: ALLOWED });
  assert.equal(method.status, 405);

  const mediaType = await handleReport(
    request({ headers: { 'content-type': 'text/plain' }, body: '{}' }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(mediaType.status, 415);

  const declared = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report' }, body: '{}', contentLength: LIMITS.MAX_BODY_BYTES + 1 }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(declared.status, 413);

  const streamed = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report' }, body: 'x'.repeat(LIMITS.MAX_BODY_BYTES + 10) }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(streamed.status, 413, 'the streaming gate still bounds an undeclared oversized body');

  const malformed = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report' }, body: '{not json' }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(malformed.status, 400);

  const unrecognised = await handleReport(
    request({ headers: { 'content-type': 'application/csp-report' }, body: JSON.stringify({ nope: true }) }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(unrecognised.status, 400);

  const emptyPlan = await handleReport(
    request({ headers: { 'content-type': 'application/reports+json' }, body: JSON.stringify([{ type: 'deprecation', body: {} }]) }),
    env,
    { allowedOrigins: ALLOWED },
  );
  assert.equal(emptyPlan.status, 200);
  assert.equal((await emptyPlan.json()).stored, 0);
  assert.equal(calls.filter(([kind]) => kind === 'ingest').length, 0, 'an empty plan never reaches the object');
});

test('health keeps its zero-write contract and exposes no CORS headers', async () => {
  const { calls, env } = envWithStub();
  const response = await handleHealth(env, { now: () => 0 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null,
    'health is not opened to browser origins');
  assert.deepEqual(calls, [['health', { now: 0 }]]);
});

test('the allowlist parser trims entries and rejects wildcards', () => {
  const parsed = parseAllowedOrigins(' https://a.example.test , https://b.example.test ,, ');
  assert.deepEqual([...parsed].sort(), ['https://a.example.test', 'https://b.example.test']);
  assert.equal(parsed.has('*'), false);
  assert.equal(parseAllowedOrigins(undefined).size, 0, 'an unset variable means nothing is allowed');
  assert.equal(parseAllowedOrigins('').size, 0);
  assert.equal(parseAllowedOrigins('*').has('https://a.example.test'), false, 'a wildcard never matches an origin');
});
