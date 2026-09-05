import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyByThreshold, finite, normalizeStatus, statusLabel } from '../../scripts/modules/displayStatusThresholds.js';
import {
  $,
  deltaArrow,
  fmtDeltaSafe,
  fmtNumSafe,
  fmtSigned,
  fmtSignedArrow,
  riskColor,
  trendClass,
} from '../../scripts/modules/config.js?v=bofa-report-review-1';
import {
  buildRealtimeStatusLabel,
  canUseRealtimePayloadValues,
  classifyFreshnessLevel,
  computeAgeMinutes,
  parseTimestamp,
  shouldApplyRealtimeOverlay,
} from '../../scripts/modules/freshness.js';
import { formatFiniteNumber, formatOnRrpYiUsd } from '../../scripts/modules/format.js';

test('threshold classification covers normal, absolute, inverse and overlay policies', () => {
  assert.equal(finite(null), null);
  assert.equal(finite(''), null);
  assert.equal(finite('12.5'), 12.5);
  assert.equal(finite('not-a-number'), null);
  assert.equal(classifyByThreshold(101, 'brent'), 'red');
  assert.equal(classifyByThreshold(90, 'brent'), 'yellow');
  assert.equal(classifyByThreshold(70, 'brent'), 'green');
  assert.equal(classifyByThreshold(-51, 'fedPathSpreadBp'), 'red');
  assert.equal(classifyByThreshold(-30, 'fedPathSpreadBp'), 'yellow');
  assert.equal(classifyByThreshold(-20, 'fedPathSpreadBp'), 'green');
  assert.equal(classifyByThreshold(44, 'ismManufacturingPmi'), 'red');
  assert.equal(classifyByThreshold(48, 'ismManufacturingPmi'), 'yellow');
  assert.equal(classifyByThreshold(52, 'ismManufacturingPmi'), 'green');
  assert.equal(classifyByThreshold(72, 'worldOrderScore'), 'orange');
  assert.equal(classifyByThreshold(null, 'brent'), 'pending');
  assert.equal(classifyByThreshold(10, 'unknown'), 'pending');
});

test('status normalization preserves the display contract', () => {
  for (const value of ['red', 'high', 'stress', 'tight', 'tightening']) assert.equal(normalizeStatus(value), 'red');
  for (const value of ['yellow', 'watch', 'mixed', 'caution', 'elevated']) assert.equal(normalizeStatus(value), 'yellow');
  for (const value of ['green', 'normal', 'stable', 'low']) assert.equal(normalizeStatus(value), 'green');
  for (const value of ['orange', 'overlay', 'multi_theater_stress', 'bloc_fragmentation']) assert.equal(normalizeStatus(value), 'orange');
  assert.equal(normalizeStatus('unexpected'), 'pending');
  assert.equal(statusLabel('high'), 'RED');
  assert.equal(statusLabel('unexpected'), 'PENDING');
});

test('freshness parsing and boundary classification are deterministic', () => {
  assert.equal(parseTimestamp(null), null);
  assert.equal(parseTimestamp(''), null);
  assert.equal(parseTimestamp('invalid'), null);
  assert.equal(parseTimestamp('2026-07-13'), Date.parse('2026-07-13T00:00:00Z'));
  assert.equal(parseTimestamp('2026-07-13T01:02:03Z'), Date.parse('2026-07-13T01:02:03Z'));
  assert.equal(classifyFreshnessLevel(null, true), 'unavailable');
  assert.equal(classifyFreshnessLevel(1, false), 'unavailable');
  assert.equal(classifyFreshnessLevel(30, true), 'fresh');
  assert.equal(classifyFreshnessLevel(90, true), 'aging');
  assert.equal(classifyFreshnessLevel(360, true), 'stale');
  assert.equal(classifyFreshnessLevel(361, true), 'unavailable');

  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-07-13T01:00:00Z');
  try {
    assert.equal(computeAgeMinutes('2026-07-13T00:30:00Z'), 30);
    assert.equal(computeAgeMinutes('2026-07-13T02:00:00Z'), 0);
    assert.equal(computeAgeMinutes('invalid'), null);
  } finally {
    Date.now = originalNow;
  }
});

test('realtime trust gate fails closed for unusable payloads', () => {
  const usable = { values: { brent: 80 }, sourceMode: 'live', healthScore: 100, criticalMissing: 0 };
  assert.equal(canUseRealtimePayloadValues(usable), true);
  assert.equal(canUseRealtimePayloadValues(null), false);
  assert.equal(canUseRealtimePayloadValues({}), false);
  assert.equal(canUseRealtimePayloadValues({ values: [] }), false);
  assert.equal(canUseRealtimePayloadValues({ ...usable, cacheOnly: true }), false);
  assert.equal(canUseRealtimePayloadValues({ ...usable, sourceMode: 'cache-only' }), false);
  assert.equal(canUseRealtimePayloadValues({ ...usable, unavailable: true }), false);
  assert.equal(canUseRealtimePayloadValues({ ...usable, degradedMode: true }), false);
  assert.equal(canUseRealtimePayloadValues({ ...usable, degradedMode: true, sourceMode: 'live-with-fallback' }), true);
  assert.equal(canUseRealtimePayloadValues({ ...usable, healthScore: 0 }), false);
  assert.equal(canUseRealtimePayloadValues({ ...usable, criticalMissing: 4 }), false);
  assert.equal(shouldApplyRealtimeOverlay({ realtimeUnavailable: false }, usable), true);
  assert.equal(shouldApplyRealtimeOverlay({ realtimeUnavailable: true }, usable), false);
});

test('realtime status and number formatting expose explicit fallbacks', () => {
  assert.equal(buildRealtimeStatusLabel({ realtimeUnavailable: true }), '实时数据不可用 / 仅基线模式');
  assert.equal(
    buildRealtimeStatusLabel({
      realtimeUnavailable: false,
      realtimeSource: 'worker-generated-preview',
      realtimeFreshnessLevel: 'aging',
      realtimeAgeMinutes: 45,
      realtimeDegraded: true,
      realtimeFallbackUsed: true,
      realtimeCacheOnly: true,
      realtimeBrentHeldBeyondAgeCap: true,
      realtimeBrentSelectedAgeHours: 72,
    }),
    '主源 Worker独立生成 / 实时数据 老化中 / 45 分钟前 / 降级 / 本地回退 / 缓存模式 / Brent旧值风险(held ~3天)'
  );
  assert.match(
    buildRealtimeStatusLabel({
      realtimeUnavailable: false,
      realtimeSource: 'unknown',
      realtimeFreshnessLevel: 'unknown',
      realtimeBrentHeldBeyondAgeCap: true,
    }),
    /主源 未知 \/ 实时数据 unknown \/ Brent旧值风险\(held\)/u
  );
  assert.equal(formatFiniteNumber(1.234, 2), '1.23');
  assert.equal(formatFiniteNumber(Number.NaN), '--');
  assert.equal(formatOnRrpYiUsd(2.5), '25.00 亿美元');
  assert.equal(formatOnRrpYiUsd(null), '--');
});

test('shared display helpers cover every color, trend and DOM fallback branch', () => {
  assert.equal(fmtSigned(2), '+2');
  assert.equal(fmtSigned(-2), '-2');
  assert.equal(riskColor(85), '#ff5e72');
  assert.equal(riskColor(70), '#ff9a5d');
  assert.equal(riskColor(50), '#ffd46a');
  assert.equal(riskColor(49), '#2fd38a');
  assert.equal(trendClass(1), 'up');
  assert.equal(trendClass(-1), 'down');
  assert.equal(trendClass(0), 'flat');
  assert.equal(fmtDeltaSafe(2), '+2');
  assert.equal(fmtDeltaSafe(-2), '-2');
  assert.equal(fmtDeltaSafe(null), '--');
  assert.equal(deltaArrow(1), '↑');
  assert.equal(deltaArrow(-1), '↓');
  assert.equal(deltaArrow(0), '→');
  assert.equal(deltaArrow(null), '→');
  assert.equal(fmtSignedArrow(-3), '↓ 3');
  assert.equal(fmtSignedArrow(null), '→ --');
  assert.equal(fmtNumSafe(1.25, 1), '1.3');

  globalThis.document = { getElementById: (id) => ({ id }) };
  try {
    assert.deepEqual($('target'), { id: 'target' });
  } finally {
    delete globalThis.document;
  }
});
