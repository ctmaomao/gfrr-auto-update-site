// Manual offline acceptance: no receiver/platform requests, credentials, or production artifacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { trialIsOpen, MAX_TRIAL_WINDOW_MS } from '../../workers/gfrr-csp-report-receiver/src/trial-window.js';
import { handleReceiverRequest } from '../../workers/gfrr-csp-report-receiver/src/index.js';
import { readFileSync } from 'node:fs';

const start = Date.parse('2026-10-06T04:00:00.000Z');
const settings = {
  CSP_TRIAL_ENABLED: 'true',
  CSP_TRIAL_START_AT: new Date(start).toISOString(),
  CSP_TRIAL_END_AT: new Date(start + MAX_TRIAL_WINDOW_MS).toISOString(),
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:8765',
};
function forbiddenEnv(vars = {}) {
  return { ...vars, get CSP_RECEIVER() { assert.fail('closed route must not acquire a DO binding'); } };
}
function unreadableRequest(path, method = 'POST') {
  return { url: 'https://receiver.example.invalid' + path, method,
    get body() { assert.fail('closed route must not read the request body'); },
    get headers() { assert.fail('closed route must not inspect request headers'); } };
}

test('a window admits only its exact half-open interval and never rolls forward', () => {
  for (const now of [start, start + 1, start + MAX_TRIAL_WINDOW_MS - 1]) assert.equal(trialIsOpen(settings, now), true);
  for (const now of [start - 1, start + MAX_TRIAL_WINDOW_MS, start + MAX_TRIAL_WINDOW_MS + 1, NaN, Infinity]) {
    assert.equal(trialIsOpen(settings, now), false);
  }
  assert.equal(trialIsOpen({ ...settings, CSP_TRIAL_END_AT: new Date(start + MAX_TRIAL_WINDOW_MS + 1).toISOString() }, start), false);
});

test('missing settings, permissive booleans, noncanonical or impossible times fail closed', () => {
  assert.equal(trialIsOpen(undefined, start), false);
  for (const flag of [undefined, null, true, 1, 'TRUE', ' true', 'true ', 'false', '']) {
    assert.equal(trialIsOpen({ ...settings, CSP_TRIAL_ENABLED: flag }, start), false);
  }
  for (const value of [undefined, '', '2026-10-06', '2026-10-06T04:00:00Z', '2026-10-06T04:00:00.000+00:00',
    '2026-02-30T04:00:00.000Z', '2026-10-06T24:00:00.000Z', '2026-10-06T04:00:00.000Z\n', 123]) {
    for (const key of ['CSP_TRIAL_START_AT', 'CSP_TRIAL_END_AT']) {
      assert.equal(trialIsOpen({ ...settings, [key]: value }, start), false);
    }
  }
  for (const end of [start - 1, start]) {
    assert.equal(trialIsOpen({ ...settings, CSP_TRIAL_END_AT: new Date(end).toISOString() }, start), false);
  }
});

test('all closed public report/health methods reject before body, headers or DO access', async () => {
  for (const vars of [{}, { ...settings, CSP_TRIAL_ENABLED: 'false' }, settings,
    { ...settings, CSP_TRIAL_START_AT: 'invalid' }]) {
    for (const path of ['/csp-report', '/health']) {
      for (const method of ['POST', 'OPTIONS', 'GET', 'PUT']) {
        const response = await handleReceiverRequest(unreadableRequest(path, method), forbiddenEnv(vars), {
          now: () => start + MAX_TRIAL_WINDOW_MS,
        });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { ok: false, status: 'unknown', error: 'trial-closed' });
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('access-control-allow-origin'), null);
      }
    }
  }
});

function activeEnv() {
  const calls = [];
  const stub = {
    async ingest(input) { calls.push(['ingest', input]); return { action: 'commit', stored: 1 }; },
    async health(input) { calls.push(['health', input]); return { status: 'alert', alerts: ['schedule-missing'] }; },
  };
  return { calls, env: { ...settings, CSP_RECEIVER: { idFromName: name => name, get: () => stub } } };
}
function reportRequest(payload, contentType = 'application/csp-report') {
  return new Request('https://receiver.example.invalid/csp-report', {
    method: 'POST', headers: { 'content-type': contentType }, body: JSON.stringify(payload),
  });
}

test('open routes preserve normalization, CORS and honest health results', async () => {
  for (const mechanism of ['legacy', 'reporting']) {
    const { env, calls } = activeEnv();
    const body = { 'effective-directive': 'script-src-attr', 'blocked-uri': 'inline',
      'document-uri': 'http://127.0.0.1:8765/index.html?token=FICTION_ONLY#test',
      referrer: 'FICTION_ONLY', 'source-file': 'FICTION_ONLY', 'script-sample': 'FICTION_ONLY' };
    const payload = mechanism === 'legacy' ? { 'csp-report': body } : [{ type: 'csp-violation', body }];
    const response = await handleReceiverRequest(reportRequest(payload,
      mechanism === 'legacy' ? 'application/csp-report' : 'application/reports+json'), env, { now: () => start });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1].entries, [[`script-src-attr|inline|index|unknown|${mechanism}`, { reports: 1, incomplete: false }]]);
    assert.ok(!JSON.stringify(calls).includes('FICTION_ONLY'));
  }
  const { env, calls } = activeEnv();
  const preflight = new Request('https://receiver.example.invalid/csp-report', { method: 'OPTIONS',
    headers: { origin: 'http://127.0.0.1:8765', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  const response = await handleReceiverRequest(preflight, env, { now: () => start });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), settings.CORS_ALLOWED_ORIGINS);
  assert.deepEqual(calls, []);
  const health = await handleReceiverRequest(new Request('https://receiver.example.invalid/health'), env, { now: () => start });
  assert.equal((await health.json()).status, 'alert');
  assert.equal(calls[0][0], 'health');
});

test('an upload that crosses expiry cannot start a DO RPC', async () => {
  let clock = start;
  const req = reportRequest({ 'csp-report': { 'effective-directive': 'script-src' } });
  // Advance after entry admission but during asynchronous body consumption.
  const body = req.body;
  const request = { url: req.url, method: req.method, headers: req.headers,
    get body() { clock = start + MAX_TRIAL_WINDOW_MS; return body; } };
  const response = await handleReceiverRequest(request, forbiddenEnv(settings), { now: () => clock });
  assert.equal(response.status, 503);
});

test('unknown routes and health writes never reach the DO', async () => {
  assert.equal((await handleReceiverRequest(unreadableRequest('/unlisted'), forbiddenEnv(settings), { now: () => start })).status, 404);
  assert.equal((await handleReceiverRequest(unreadableRequest('/health'), forbiddenEnv(settings), { now: () => start })).status, 405);
});

test('the real runtime entry delegates to the tested guard and configuration defaults closed', () => {
  const entry = readFileSync(new URL('../../workers/gfrr-csp-report-receiver/src/worker-entry.js', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../../workers/gfrr-csp-report-receiver/wrangler.toml', import.meta.url), 'utf8');
  assert.match(entry, /fetch:\s*handleReceiverRequest/);
  assert.doesNotMatch(entry, /handleReport|handleHealth/);
  assert.match(config, /CSP_TRIAL_ENABLED\s*=\s*"false"/);
  assert.match(config, /CSP_TRIAL_START_AT\s*=\s*""/);
  assert.match(config, /CSP_TRIAL_END_AT\s*=\s*""/);
});
