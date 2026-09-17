import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGdeltCloudSummary } from '../../scripts/world-order/fetch-gdelt-cloud.mjs';

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
