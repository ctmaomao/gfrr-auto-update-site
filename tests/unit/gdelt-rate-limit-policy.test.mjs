import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fetchGdeltDocJson } from '../../scripts/gdelt/fetch-gdelt.mjs';
import { runDiagnosis, cacheUsability } from '../../scripts/oil-directional/diagnose-oil-news-events.mjs';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const options = { queryParams: { query: 'oil' }, minIntervalMs: 0, timeoutMs: 1000, maxRetries: 1, retryOnRateLimit: false };

test('rate limit exits after one request even with Retry-After and remaining retry budget', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '3600' } }); };
  await assert.rejects(fetchGdeltDocJson(options), error => {
    assert.equal(error.gdeltDiagnostics.attempts, 1);
    assert.equal(error.gdeltDiagnostics.retryCount, 0);
    assert.equal(error.gdeltDiagnostics.errorCode, 'rate_limited');
    return true;
  });
  assert.equal(calls, 1);
});

test('transient server errors still receive the existing bounded retry', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? new Response('', { status: 503, headers: { 'Retry-After': '0.001' } })
    : Response.json({ articles: [] });
  const result = await fetchGdeltDocJson(options);
  assert.equal(calls, 2);
  assert.equal(result.diagnostics.retryCount, 1);
});

test('plain-text rate limit errors are not retried', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('Please limit requests'); };
  await assert.rejects(fetchGdeltDocJson(options), error => error.gdeltDiagnostics.errorCode === 'rate_limited');
  assert.equal(calls, 1);
});

test('real oil-news caller persists 429 cooldown and subsequent diagnosis makes no request', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gfrr-gdelt-policy-'));
  try {
    const gdeltCachePath = join(dir, 'cache.json');
    const input = { allowNetwork: true, sources: ['gdelt_doc'], windowDays: 7, maxResults: 8,
      gdeltCachePath, writeOutput: false, output: join(dir, 'unused.json') };
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 429 }); };
    const first = await runDiagnosis(input);
    const cache = first.sourceCaches.gdelt_doc;
    assert.equal(calls, 1);
    assert.equal(cache.lastFetchFailure.errorClass, 'rate_limited');
    assert.equal(cache.lastFetchFailure.cooldownHours, 24);
    assert.equal(cacheUsability(cache, input), 'error_cooldown');
    writeFileSync(gdeltCachePath, JSON.stringify(cache));
    globalThis.fetch = async () => { throw new Error('cooldown must not fetch'); };
    const second = await runDiagnosis(input);
    assert.equal(second.sourceResults[0].networkUsed, false);
    assert.equal(second.sourceCaches.gdelt_doc.promotionEligible, false);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(dir.startsWith(join(tmpdir(), 'gfrr-gdelt-policy-')));
    rmSync(dir, { recursive: true, force: true });
  }
});
