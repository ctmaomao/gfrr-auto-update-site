// Search-only fixtures inject the accounting boundary; budget tests exercise real reservations.
const budget = async (_context, request) => request();
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createSearchKeyPool } from '../../scripts/lib/search-key-pool.mjs';
import { collectProvider as macro } from '../../scripts/macro-risk/collect-editorial-news.mjs';
import { collectProvider as bubble } from '../../scripts/bubble-watch/collect-weekly-editorial-news.mjs';
import { runDiagnosis } from '../../scripts/oil-directional/diagnose-oil-news-events.mjs';

for (const status of [402, 432, 433]) test(`quota ${status} pauses only exhausted keys until next collection`, async () => {
  const calls = [], warnings = [];
  const run = createSearchKeyPool(['spent', 'healthy', 'spent'], (code) => warnings.push(code));
  const request = async (key) => {
    calls.push(key);
    if (key === 'spent') throw new Error(`HTTP ${status} secret body`);
    return 'ok';
  };
  assert.equal(await run(request), 'ok');
  assert.equal(await run(request), 'ok');
  assert.deepEqual(calls, ['spent', 'healthy', 'healthy']);
  assert.equal(warnings.length, 1);
  assert.ok(!JSON.stringify(warnings).includes('secret'));
  await createSearchKeyPool(['spent'], () => {})(async () => 'recovered');
});

test('transient errors do not create an enduring pause or retries within a topic', async () => {
  for (const status of [429, 503]) {
    let calls = 0;
    const run = createSearchKeyPool(['key'], () => assert.fail('not a quota error'));
    await assert.rejects(run(async () => { calls++; throw new Error(`HTTP ${status}`); }));
    assert.equal(await run(async () => { calls++; return 'ok'; }), 'ok');
    assert.equal(calls, 2);
  }
});

for (const [name, collect] of [['macro', macro], ['bubble', bubble]]) test(`${name} real collector stops quota calls and preserves failed topic accounting`, async (t) => {
  let calls = 0;
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('secret', { status: 432 }); });
  const result = await collect('tavily', ['synthetic-key'], { budget });
  assert.equal(calls, 1);
  assert.equal(result.status.status, 'error');
  assert.equal(result.status.failureCount, result.status.queryRuns.length);
  assert.ok(result.status.queryRuns.every(row => row.status === 'error' && row.error.includes('432')));
  assert.ok(!JSON.stringify(result).includes('secret'));
  await collect('tavily', ['synthetic-key'], { budget });
  assert.equal(calls, 2, 'next invocation must probe again');
});

test('oil real collector isolates quota failure from healthy Brave without exposing response text', async (t) => {
  const originalDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), 'gfrr-search-test-'));
  process.chdir(directory); // Do not read any workspace-local credential files.
  t.after(() => {
    process.chdir(originalDirectory);
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.startsWith(join(tmpdir(), 'gfrr-search-test-')));
    rmSync(directory, { recursive: true, force: true });
  });
  const previous = Object.fromEntries(['TAVILY_API_KEYS','TAVILY_API_KEY','BRAVE_API_KEYS','BRAVE_API_KEY'].map(key => [key, process.env[key]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  process.env.TAVILY_API_KEYS = 'synthetic-tavily'; process.env.TAVILY_API_KEY = '';
  process.env.BRAVE_API_KEYS = 'synthetic-brave'; process.env.BRAVE_API_KEY = '';
  let tavilyCalls = 0, braveCalls = 0;
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('tavily.com')) { tavilyCalls++; return new Response('secret', { status: 432 }); }
    assert.ok(url.includes('search.brave.com')); braveCalls++;
    return Response.json({ results: [] });
  });
  const result = await runDiagnosis({ budget, allowNetwork: true, sources: ['tavily', 'brave'], windowDays: 7, maxResults: 5, writeOutput: false });
  assert.equal(tavilyCalls, 1);
  assert.ok(braveCalls > 1);
  assert.equal(result.sourceResults.find(row => row.source === 'tavily').status, 'error');
  assert.equal(result.sourceResults.find(row => row.source === 'brave').status, 'ok');
  assert.ok(!JSON.stringify(result).includes('secret'));
});
