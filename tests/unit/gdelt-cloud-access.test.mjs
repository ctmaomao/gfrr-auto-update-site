import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchGdeltCloudSummary } from '../../scripts/world-order/fetch-gdelt-cloud.mjs';
import { scoreGdeltPressure } from '../../scripts/world-order/gdelt-score.mjs';

test('free-only policy blocks Cloud with a key and preserves dated stale evidence without renewing cache', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GDELT_CLOUD_API_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-free-only-'));
  const cachePath = path.join(dir, 'cache.json');
  const previous = {
    enabled: true, status: 'stale', lastFetchedAt: '2026-09-23T01:14:09.713Z',
    summary: { totalEvents: 17, conflictEvents: 17, regionsCovered: ['Ukraine'] },
    evidence: [], confidence: 0.25
  };
  const before = structuredClone(previous);
  let calls = 0;
  try {
    process.env.GDELT_CLOUD_API_KEY = 'test-only-not-a-real-key';
    globalThis.fetch = async () => { calls++; throw new Error('Cloud must not be called'); };
    const cache = {
      schemaVersion: 'gdelt-world-order-cache-p39', module: 'gdelt-world-order-cache',
      cacheScope: 'world_order_gdelt_cloud', status: 'ok',
      lastFetchedAt: new Date().toISOString(),
      query: { id: 'gdelt_world_order_conflict_country_summary', windowDays: 7 },
      summary: { totalEvents: 0, conflictEvents: 0, regionsCovered: [] }
    };
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    const cacheBefore = fs.readFileSync(cachePath, 'utf8');
    const config = { accessPolicy: 'free_only', cachePath };
    const result = await fetchGdeltCloudSummary({ config, previousSource: previous });
    assert.equal(result.status, 'stale');
    assert.equal(result.lastFetchedAt, previous.lastFetchedAt);
    assert.equal(result.summary.totalEvents, 17);
    assert.equal(scoreGdeltPressure(result), scoreGdeltPressure(previous));
    assert.equal(result.summary.requestsUsed, 0);
    assert.equal(result.summary.failureCount, 0);
    assert.equal(result.summary.queriesRun[0].status, 'skipped');
    assert.equal(result.summary.requestDiagnostics.status, null);
    assert.equal(result.cacheArtifact, undefined);
    assert.match(result.warnings.join(' '), /零订阅费用/);
    assert.deepEqual(previous, before);
    assert.equal(fs.readFileSync(cachePath, 'utf8'), cacheBefore);
    const cached = await fetchGdeltCloudSummary({ config });
    assert.equal(cached.status, 'stale', 'even a fresh Cloud cache is historical in free-only mode');
    assert.equal(cached.summary.totalEvents, 0, 'real zero is retained');
    assert.equal(cached.lastFetchedAt, cache.lastFetchedAt);
    assert.equal(cached.cacheArtifact, undefined);
    fs.unlinkSync(cachePath);
    for (const previousSource of [null, { ...previous, lastFetchedAt: null },
      { ...previous, lastFetchedAt: '2999-01-01T00:00:00Z' }]) {
      const absent = await fetchGdeltCloudSummary({ config, previousSource });
      assert.equal(absent.status, 'not_configured');
      assert.equal(absent.lastFetchedAt, null);
      assert.equal(absent.summary.totalEvents, null);
      assert.equal(absent.confidence, 0);
    }
    assert.equal(calls, 0);
    const rules = JSON.parse(fs.readFileSync(new URL('../../config/world-order-rules.json', import.meta.url)));
    assert.equal(rules.gdelt.accessPolicy, 'free_only');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GDELT_CLOUD_API_KEY;
    else process.env.GDELT_CLOUD_API_KEY = originalKey;
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
    fs.rmdirSync(dir);
  }
});

test('Cloud access failures preserve dated evidence, distinguish 403 from 429 and never retry', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GDELT_CLOUD_API_KEY;
  const previousSource = {
    enabled: true, status: 'ok', lastFetchedAt: '2026-09-01T00:00:00Z',
    summary: { totalEvents: 17, apiBudget: '100 units/month free tier' },
    evidence: [], confidence: 0.75
  };
  const before = structuredClone(previousSource);
  try {
    process.env.GDELT_CLOUD_API_KEY = 'test-only-not-a-real-key';
    for (const status of [401, 402, 403, 429]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response('do not expose provider response', { status });
      };
      const result = await fetchGdeltCloudSummary({
        config: { cachePath: 'tests/fixtures/nonexistent-gdelt-access-cache.json' }, previousSource
      });
      assert.equal(calls, 1);
      assert.equal(result.status, 'stale');
      assert.equal(result.lastFetchedAt, previousSource.lastFetchedAt);
      assert.equal(result.summary.totalEvents, 17);
      assert.equal(result.confidence, 0.25);
      assert.equal(result.summary.rateLimitedCount, status === 429 ? 1 : 0);
      assert.equal(result.summary.queriesRun[0].status, status === 429 ? 'rate_limited' : 'error');
      assert.equal(result.summary.requestDiagnostics.status, status);
      assert.doesNotMatch(result.summary.apiBudget, /100 units/);
      if (status === 401) assert.match(result.warnings.join(' '), /凭据未通过验证/);
      if (status === 402) assert.match(result.warnings.join(' '), /付费或额度/);
      if (status === 403) assert.match(result.warnings.join(' '), /不能单凭它断定试用已到期/);
      if (status === 403) assert.match(result.summary.errors.join(' '), /不能单凭它断定试用已到期/);
      assert.doesNotMatch(JSON.stringify(result), /do not expose provider response|test-only-not-a-real-key/);
      assert.deepEqual(previousSource, before);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GDELT_CLOUD_API_KEY;
    else process.env.GDELT_CLOUD_API_KEY = originalKey;
  }
});
