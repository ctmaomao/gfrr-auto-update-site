import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { selectedBrentObservation } from '../../scripts/run-daily-pipeline.mjs';

const NOW = '2026-11-08T01:41:51.207Z';
// Same-row excerpt from the Daily input recorded in radar-data.json:
// 65f198f530e87a31e7ea5283547d73063d1aae70:realtime/market.json, lines 57-65.
const detail = {
  ok: true, value: 107.03, source: 'fred:DCOILBRENTEU',
  timestamp: '2026-11-03', fallbackUsed: false, error: null,
  freshnessPrepared: true, ageSeconds: 438091,
};
const observe = (row, source = detail.source, value = detail.value) =>
  selectedBrentObservation(row, source, value, NOW);

test('real Brent input keeps its November 3 observation, not November 8 collection', () => {
  assert.equal(observe(detail), '2026-11-03');
});

test('explicit observedAt takes priority and preserves timestamp precision', () => {
  assert.equal(observe({ ...detail, observedAt: '2026-11-03T21:59:44.000Z' }),
    '2026-11-03T21:59:44.000Z');
  assert.equal(observe({ ...detail, observedAt: 'bad-date' }), '2026-11-03');
});

test('missing observation never borrows update, fetch or calculation time', () => {
  assert.equal(observe({ ...detail, timestamp: undefined, updatedAt: NOW, fetchedAt: NOW }), null);
  assert.equal(observe(null), null);
});

test('invalid, future, timezone-free and impossible calendar observations are rejected', () => {
  for (const timestamp of [null, '', 0, 'garbage', '2026-02-30', '2026-11-09',
    '2026-11-03T12:00:00', '2026-11-03T24:00:00Z', '2026-11-08T02:00:00Z']) {
    assert.equal(observe({ ...detail, timestamp }), null, String(timestamp));
  }
});

test('dates cannot be borrowed from another source or another selected value', () => {
  assert.equal(observe(detail, 'yahoo:BZ=F'), null);
  assert.equal(observe({ ...detail, source: null }), null);
  assert.equal(observe(detail, ''), null);
  assert.equal(observe(detail, detail.source, 98.32), null);
  for (const value of [null, undefined, NaN, Infinity, '107.03']) {
    assert.equal(observe({ ...detail, value }), null);
  }
});

test('zero is preserved as a value rather than treated as missing', () => {
  assert.equal(observe({ ...detail, value: 0 }, detail.source, 0), '2026-11-03');
  assert.equal(observe({ ...detail, value: 0 }), null);
  assert.equal(observe({ ...detail, value: null }, detail.source, 0), null);
});

test('builder selected-price projection uses same-row provenance without payload-time fallback', () => {
  // Execute the actual builder prefix up to its selectedBrent projection. This
  // isolates the audited path without fetching other sources or generating data.
  const source = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function buildBrentPricingLayer(');
  const end = source.indexOf('\n  const fredCandidate =', start);
  assert.ok(start >= 0 && end > start);
  const build = vm.runInNewContext(`${source.slice(start, end)}\nreturn selectedBrent;\n}\nbuildBrentPricingLayer`, {
    selectedBrentObservation: (row, name, value) => selectedBrentObservation(row, name, value, NOW),
    firstFinite: (...values) => values.find(Number.isFinite) ?? null,
    firstString: (...values) => values.find((value) => typeof value === 'string' && value.trim()) ?? null,
  });
  const input = {
    realtimePayload: {
      sourceDetails: { brent: detail }, sourceStatus: { brent: detail.source },
      values: { brent: detail.value }, updatedAt: '2026-11-08T01:41:30.382Z',
    },
    displayInputsBaseline: { brent: detail.value },
    dailyRealtimeInput: { updatedAt: NOW },
  };
  assert.equal(build(input).observedAt, '2026-11-03');
  assert.equal(build({ ...input, displayInputsBaseline: { brent: 98.32 } }).observedAt, null);
  assert.equal(build({ ...input, realtimePayload: {
    ...input.realtimePayload, sourceDetails: { brent: { ...detail, timestamp: undefined } },
  } }).observedAt, null);
  assert.equal(build({ ...input, realtimePayload: {
    ...input.realtimePayload, sourceDetails: { brent: { ...detail, source: undefined } },
  } }).observedAt, null);
  assert.equal(build(input).value, detail.value);
  assert.equal(build(input).source, detail.source);
});
