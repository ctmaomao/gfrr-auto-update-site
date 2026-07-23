import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkRealtimeHealth } from '../../scripts/check-realtime-health.mjs';
import {
  FUTURE_TIMESTAMP_TOLERANCE_MINUTES,
  isFutureTimestampAge,
  timestampAgeMinutes
} from '../../scripts/health/timestamp-policy.mjs';

const NOW_MS = Date.parse('2026-07-13T12:00:00.000Z');

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

test('timestamp policy tolerates five minutes of clock skew and rejects more', () => {
  const withinTolerance = timestampAgeMinutes('2026-07-13T12:05:00.000Z', NOW_MS);
  const beyondTolerance = timestampAgeMinutes('2026-07-13T12:05:00.001Z', NOW_MS);

  assert.equal(withinTolerance, -FUTURE_TIMESTAMP_TOLERANCE_MINUTES);
  assert.equal(isFutureTimestampAge(withinTolerance), false);
  assert.equal(isFutureTimestampAge(beyondTolerance), true);
  assert.equal(timestampAgeMinutes('not-a-date', NOW_MS), null);
  assert.equal(timestampAgeMinutes(null, NOW_MS), null);
});

test('realtime health clamps tolerated skew to fresh age zero', async () => {
  const report = await checkRealtimeHealth({
    nowMs: NOW_MS,
    timeoutMs: 1000,
    fetchImpl: async () => jsonResponse({ updatedAt: '2026-07-13T12:04:00.000Z' })
  });

  assert.equal(report.freshness, 'fresh');
  assert.equal(report.ageMinutes, 0);
});

test('realtime health fails closed for a timestamp beyond future tolerance', async () => {
  const report = await checkRealtimeHealth({
    nowMs: NOW_MS,
    timeoutMs: 1000,
    fetchImpl: async () => jsonResponse({ updatedAt: '2026-07-13T12:06:00.000Z' })
  });

  assert.equal(report.freshness, 'unavailable');
  assert.match(report.reason, /future tolerance/u);
});

test('realtime health returns unavailable when the request times out', async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

  const report = await checkRealtimeHealth({
    nowMs: NOW_MS,
    timeoutMs: 20,
    fetchImpl
  });

  assert.equal(report.freshness, 'unavailable');
  assert.match(report.reason, /timed out after 20ms/u);
});
