import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_PROBE, authenticatedProbe, controlRequest } from '../../scripts/world-order/acled-authenticated-probe.mjs';
import { collectAcledSessionBatch } from '../../scripts/world-order/acled-session-batch.mjs';
import { discoverAcledDetails } from '../../scripts/world-order/acled-detail-discovery.mjs';

const secret = 'PRIVATE_PASSWORD_COOKIE_TOKEN_EMAIL';
const request = (fetchImpl, timeoutMs = 100) => controlRequest(AUTH_PROBE.loginUrl,
  { method: 'POST', body: secret }, fetchImpl, timeoutMs);
const denial = (message, status = 403, headers = {}) => new Response(JSON.stringify({ message,
  password: secret, csrf_token: secret, current_user: { name: secret } }),
{ status, headers: { 'content-type': 'application/json', 'set-cookie': secret, ...headers } });
function staysDenied(result) {
  assert.equal(result.ok, false);
  assert.equal(result.bytes, undefined);
  assert.equal(result.headers, undefined);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|password|cookie|token|current_user/u);
}

test('documented login denials become fixed safe codes, never successful authentication', async () => {
  for (const [status, message, code] of [
    [400, 'Sorry, unrecognized username or password.', 'credentials_rejected'],
    [403, 'Consent must be accepted in order to continue using the site when logged in.', 'consent_required'],
    [403, 'Please fill in all the required fields.', 'profile_required_fields'],
    [403, 'Access denied', 'access_denied'],
    [403, 'Invalid URL', 'invalid_url'],
    [403, secret, 'unclassified_denial'],
    [400, 'Access denied', 'unclassified_denial'],
    [403, 'Sorry, unrecognized username or password.', 'unclassified_denial']
  ]) {
    let calls = 0;
    const result = await request(async (_url, options) => {
      calls++; assert.equal(options.redirect, 'manual'); return denial(message, status);
    });
    staysDenied(result); assert.equal(calls, 1); assert.equal(result.reason, 'http_not_ok');
    assert.equal(result.loginFailure, code); assert.equal(result.httpStatus, status);
  }
});

test('HTML, unknown JSON, malformed JSON and invalid UTF-8 never disclose response content', async () => {
  for (const [body, type, code] of [
    [`<html>${secret}</html>`, 'text/html', 'non_json_denial'],
    [secret, 'application/json', 'unclassified_denial'],
    [JSON.stringify([secret]), 'application/json', 'unclassified_denial'],
    [JSON.stringify({ message: { secret } }), 'application/json', 'unclassified_denial'],
    [new Uint8Array([0xff, 0xfe]), 'application/json', 'unclassified_denial']
  ]) {
    const result = await request(async () => new Response(body, { status: 403, headers: { 'content-type': type } }));
    staysDenied(result); assert.equal(result.loginFailure, code); assert.equal(result.reason, 'http_not_ok');
  }
});

test('401 and 429 retain denial and use only status, with no body read or retry', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [429, 'rate_limited']]) {
    let cancelled = 0, calls = 0;
    const result = await request(async () => {
      calls++;
      return new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } }),
        { status, headers: { 'content-type': 'application/json' } });
    });
    staysDenied(result); assert.equal(result.loginFailure, code); assert.equal(calls, 1);
    assert.equal(cancelled, 1); assert.equal(result.receivedBytes, 0); assert.equal(result.reason, 'http_not_ok');
  }
});

test('redirects, other targets and methods are not read, classified or followed', async () => {
  for (const [url, method, status, kind] of [
    [AUTH_PROBE.loginUrl, 'POST', 302, 'control'],
    [AUTH_PROBE.loginUrl, 'POST', 500, 'control'],
    [AUTH_PROBE.logoutUrl, 'POST', 403, 'control'],
    [`${AUTH_PROBE.loginUrl}&extra=1`, 'POST', 403, 'control'],
    [AUTH_PROBE.loginUrl, 'GET', 403, 'control'],
    [AUTH_PROBE.loginUrl, 'POST', 403, 'html']
  ]) {
    let cancelled = 0, calls = 0;
    const result = await controlRequest(url, { method }, async (_url, options) => {
      calls++; assert.equal(options.redirect, 'manual');
      return new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } }),
        { status, headers: { 'content-type': 'application/json', location: 'https://example.invalid' } });
    }, 100, kind);
    staysDenied(result); assert.equal(result.loginFailure, undefined); assert.equal(calls, 1);
    assert.equal(cancelled, 1); assert.equal(result.receivedBytes, 0); assert.equal(result.reason, 'http_not_ok');
  }
});

test('denial diagnostics preserve declared and streaming byte caps, length checks and body deadline', async () => {
  for (const [body, headers, reason] of [
    [secret, { 'content-length': '65537' }, 'byte_limit'],
    ['x'.repeat(65537), {}, 'byte_limit'],
    [secret, { 'content-length': '1' }, 'length_mismatch'],
    [secret, { 'content-length': 'invalid' }, 'byte_limit']
  ]) {
    const result = await request(async () => new Response(body, { status: 403,
      headers: { 'content-type': 'application/json', ...headers } }));
    staysDenied(result); assert.equal(result.reason, reason); assert.equal(result.loginFailure, 'unclassified_denial');
  }
  let cancelled = 0;
  const result = await request(async () => new Response(new ReadableStream({
    pull() { return new Promise(() => {}); }, cancel() { cancelled++; }
  }), { status: 403, headers: { 'content-type': 'application/json' } }), 10);
  staysDenied(result); assert.equal(result.reason, 'timeout'); assert.equal(cancelled, 1);
});

test('all existing login consumers expose only the code and stop after one refused request', async () => {
  for (const run of [authenticatedProbe, discoverAcledDetails, collectAcledSessionBatch]) {
    let calls = 0;
    const result = await run({ username: secret, password: secret,
      fetchImpl: async () => { calls++; return denial('Please fill in all the required fields.'); } });
    const report = result.report ?? result;
    assert.equal(calls, 1); assert.equal(report.requestCount, 1); assert.equal(report.login, 'unconfirmed');
    assert.equal(report.loginFailure, 'profile_required_fields'); assert.equal(report.logout, 'not_attempted');
    assert.equal(report.sessionMayRemain, true); assert.equal(report.productionWritten, false);
    assert.equal(report.reason, 'http_not_ok'); assert.doesNotMatch(JSON.stringify(report), /PRIVATE/u);
    if (result.report) { assert.equal(result.workbooks, null); assert.deepEqual(report.pages, []); assert.deepEqual(report.files, []); }
  }
});
