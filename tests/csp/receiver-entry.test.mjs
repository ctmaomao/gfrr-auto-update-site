// Entry-layer regressions: method, media type, both byte gates, malformed JSON, and the mapping
// from a Durable Object decision onto an HTTP status.
//
// Local phase (D-C). The Durable Object is replaced by a stub here; its own SQL behaviour is covered
// by receiver-object.test.mjs. Platform metering and quota are NOT covered (stage B).
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHealth, handleReport } from '../../workers/gfrr-csp-report-receiver/src/index.js';
import { LIMITS } from '../../workers/gfrr-csp-report-receiver/src/constants.js';

/** Builds a Request-like object with a streaming body, so the streaming gate is exercised. */
function request({ method = 'POST', contentType = 'application/csp-report', body = '', contentLength, chunkSize = 4096 } = {}) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const headers = new Map();
  if (contentType !== null) headers.set('content-type', contentType);
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));

  return {
    method,
    headers: { get: (name) => headers.get(String(name).toLowerCase()) ?? null },
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

/** A Durable Object stub recording what it was asked to do. */
function envWithStub(result = { action: 'commit', stored: 1, overflowReports: 0, diagnostics: {} }) {
  const calls = [];
  const stub = {
    async ingest(payload) { calls.push(['ingest', payload]); return result; },
    async health(payload) { calls.push(['health', payload]); return { status: 'healthy', alerts: [] }; },
  };
  return {
    calls,
    env: { CSP_RECEIVER: { idFromName: (name) => name, get: () => stub } },
  };
}

const legacyBody = JSON.stringify({
  'csp-report': {
    'effective-directive': 'script-src',
    'blocked-uri': 'inline',
    'document-uri': 'https://radar.gfrfinradar.uk/index.html',
  },
});

test('a non-POST request is rejected without touching the object', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(request({ method: 'GET' }), env);
  assert.equal(response.status, 405);
  assert.deepEqual(calls, []);
});

test('an unsupported media type is rejected with 415', async () => {
  const { env } = envWithStub();
  const response = await handleReport(request({ contentType: 'text/plain' }), env);
  assert.equal(response.status, 415);
});

test('a declared Content-Length over the limit is a 413 pre-check', async () => {
  const { env } = envWithStub();
  const response = await handleReport(
    request({ body: legacyBody, contentLength: LIMITS.MAX_BODY_BYTES + 1 }),
    env,
  );
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'body-too-large');
});

test('a chunked body with no Content-Length is bounded by the streaming gate', async () => {
  const { env } = envWithStub();
  const huge = JSON.stringify({ pad: 'x'.repeat(LIMITS.MAX_BODY_BYTES + 4096) });
  const response = await handleReport(request({ body: huge, chunkSize: 2048 }), env);
  assert.equal(response.status, 413, 'the streaming gate must bound a body without a declared length');
});

test('malformed JSON is a 400, not a 500', async () => {
  const { env } = envWithStub();
  const response = await handleReport(request({ body: '{not json' }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'malformed-json');
});

test('an unrecognised payload shape is a 400', async () => {
  const { env } = envWithStub();
  const response = await handleReport(request({ body: JSON.stringify({ hello: 'world' }) }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'unrecognised-payload');
});

test('a legacy report reaches the object and reports per-request diagnostics', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(request({ body: legacyBody }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(body.diagnostics, 'diagnostics describe this call only');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'ingest');
  assert.equal(calls[0][1].entries.length, 1);
  assert.ok(calls[0][1].entries[0][0].startsWith('script-src|inline|index|'));
});

test('an ingest rejection surfaces as 429 and carries no stored count', async () => {
  const { env } = envWithStub({ action: 'reject', reason: 'ingest-budget' });
  const response = await handleReport(request({ body: legacyBody }), env);
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.reason, 'ingest-budget');
});

test('an empty plan is a noop that never calls the object', async () => {
  const { calls, env } = envWithStub();
  const response = await handleReport(
    request({ contentType: 'application/reports+json', body: JSON.stringify([{ type: 'deprecation', body: {} }]) }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).stored, 0);
  assert.deepEqual(calls, [], 'a noop must not write a ledger row');
});

test('the Reporting API shape is accepted', async () => {
  const { calls, env } = envWithStub();
  const payload = JSON.stringify([
    { type: 'csp-violation', body: { effectiveDirective: 'script-src', blockedURL: 'inline', documentURL: 'https://x.test/index.html' } },
  ]);
  const response = await handleReport(request({ contentType: 'application/reports+json', body: payload }), env);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test('health reports a non-200 when the object cannot confirm', async () => {
  const env = {
    CSP_RECEIVER: {
      idFromName: (name) => name,
      get: () => ({ health: async () => ({ status: 'unknown', alerts: ['cannot-confirm'] }) }),
    },
  };
  const response = await handleHealth(env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, 'unknown');
});

test('health reports 200 for a healthy object', async () => {
  const { env } = envWithStub();
  const response = await handleHealth(env);
  assert.equal(response.status, 200);
});
