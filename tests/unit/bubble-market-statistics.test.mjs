import assert from 'node:assert/strict';
import test from 'node:test';
import { mean, standardDeviation, pctReturn, commonDatesForSeries, sliceCommonCloses,
  dailyReturnsFromCloses, covariance, correlation, betaToBenchmark, rsi14, bollingerPctB } from '../../scripts/bubble-watch/market-statistics.mjs';

test('empty, invalid and zero baselines remain unavailable rather than fabricated', () => {
  assert.equal(mean([]), null);
  assert.equal(mean([null, NaN, Infinity]), null);
  assert.equal(mean([0, 2, null]), 1);
  assert.equal(standardDeviation([1]), null);
  assert.equal(pctReturn(0, 10), null);
  assert.equal(pctReturn(-1, 10), null);
  assert.equal(pctReturn(100, 110), 10);
  assert.equal(covariance([1, 2], [2, 3]), null);
  assert.equal(correlation([1, 1, 1, 1, 1], [2, 3, 4, 5, 6]), null);
  assert.equal(betaToBenchmark([2, 3, 4, 5, 6], [1, 1, 1, 1, 1]), null);
});

test('known affine series retain correlation and beta, without mutating inputs', () => {
  const benchmark = [1, 2, 3, 4, 5], asset = [2, 4, 6, 8, 10];
  const before = structuredClone([benchmark, asset]);
  assert.ok(Math.abs(correlation(asset, benchmark) - 1) < 1e-12);
  assert.ok(Math.abs(betaToBenchmark(asset, benchmark) - 2) < 1e-12);
  assert.ok(Math.abs(correlation([...asset].reverse(), benchmark) + 1) < 1e-12);
  assert.deepEqual([benchmark, asset], before);
});

test('calendar intersection and invalid prices keep existing alignment rules', () => {
  const rows = [{ date: '2026-01-03', close: 0 }, { date: '2026-01-01', close: 100 }, { date: '2026-01-02', close: 110 }];
  const before = structuredClone(rows);
  assert.deepEqual(commonDatesForSeries([rows, rows.slice(1)]), ['2026-01-01', '2026-01-02']);
  assert.deepEqual(commonDatesForSeries([]), []);
  assert.deepEqual(sliceCommonCloses(rows, ['2026-01-01', '2026-01-03', 'missing']), [100]);
  assert.deepEqual(dailyReturnsFromCloses([100, 110, 0, 120]), [0.1]);
  assert.deepEqual(rows, before);
});

test('technical windows preserve minimum history and legacy flat-series behavior', () => {
  assert.equal(rsi14(Array(14).fill(1)), null);
  assert.equal(rsi14(Array.from({ length: 15 }, (_, i) => i + 1)), 100);
  assert.equal(rsi14(Array.from({ length: 15 }, (_, i) => 15 - i)), 0);
  assert.equal(rsi14(Array(15).fill(1)), 100); // Existing flat-series convention, not a recalibration.
  assert.equal(bollingerPctB(Array(19).fill(1)), null);
  assert.equal(bollingerPctB(Array(20).fill(1)), null);
  assert.ok(Math.abs(bollingerPctB([...Array(18).fill(1), 0, 1]) - (0.5 + 0.05 / (4 * Math.sqrt(0.0475)))) < 1e-12);
});
