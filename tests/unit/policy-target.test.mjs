import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { policyTargetRange, cachedPolicyTargetRange, alignPolicyTargetComparisons } from '../../scripts/daily/policy-target.mjs';
const now = '2026-11-17T12:00:00Z';
const row = (date, value) => ({ date, value });
const date = '2026-11-16';
const normal = () => policyTargetRange([row(date, 3.75)], [row(date, 4)], now);
const source = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url), 'utf8');
const names = ['latestValue', 'latestIsoDate', 'buildMissingFedFundsFuturesCurve', 'buildMissingSofrFuturesCurve',
  'buildMissingOisForwardCurve', 'buildMissingPolicyExpectations', 'normalizePreviousFedFundsFuturesCurve',
  'normalizePreviousSofrFuturesCurve', 'normalizePreviousOisForwardCurve', 'normalizePreviousPolicyExpectations',
  'classifyPolicyExpectationRegime', 'buildFedFundsFuturesCurve', 'buildSofrFuturesCurve', 'getOisTenorRate',
  'buildOisForwardCurve', 'resolvePolicyExpectations'];
function harness({ lower = [row(date, 3.75)], upper = [row(date, 4)], market = true } = {}) {
  const text = names.map(name => {
    const start = source.indexOf(`function ${name}(`); assert.ok(start >= 0, name);
    const end = source.indexOf('\n}', start);
    return (source.slice(start - 6, start) === 'async ' ? 'async ' : '') + source.slice(start, end + 2);
  }).join('\n');
  const fail = () => { throw Error('offline fixture'); };
  return vm.runInNewContext(text + '\n({resolvePolicyExpectations,normalizePreviousPolicyExpectations})', {
    isoNow: now, policyTargetRange, cachedPolicyTargetRange, alignPolicyTargetComparisons,
    POLICY_EXPECTATIONS_SOURCE: 'offline', CHECKMYSWAP_RATES_URL: 'offline',
    fetchFredSeries: async id => { const rows = { DFEDTARL: lower, DFEDTARU: upper, DFF: [row(date, 3.88)] }[id]; return rows || fail(); },
    fetchYahooChartQuote: async () => market ? { price: 95.835, updatedAt: '2026-11-16T20:00:00Z' } : fail(),
    fetchYahooMonthlyFuturesCurve: async ({ root }) => market ? [
      { symbol: root + 'X26', contractMonth: '2026-11', price: 96, updatedAt: '2026-11-16T20:00:00Z' },
      { symbol: root + 'Z26', contractMonth: '2026-12', price: 95.5, updatedAt: '2026-11-16T20:00:00Z' },
    ] : fail(),
    fetchCheckMySwapUsdOisCurve: async () => market ? { date, curve: [{ tenor: '2Y', rate: 4.5 }, { tenor: '10Y', rate: 5 }] } : fail(),
    fetchLatestFedCalendarContext: async () => ({}),
  });
}
const plain = value => JSON.parse(JSON.stringify(value));
function assertNoComparisons(policy) {
  assert.equal(policy.futureMinusTargetMid, null);
  for (const key of ['fedFundsFuturesCurve', 'sofrFuturesCurve']) {
    assert.ok(policy[key].contracts.every(c => c.impliedMinusTargetMid === null));
  }
  assert.equal(policy.oisForwardCurve.twoMinusTargetMid, null);
  assert.equal(policy.policyExpectationRegime, '未知');
}

test('official normal target and daily seven-day weekends preserve midpoint and zero lower bound', () => {
  // FRED DFEDTARL/U, 2026-11-16: 3.75 / 4.00, daily effective values.
  assert.equal(normal().targetMid, 3.875);
  for (const day of ['2026-11-14', '2026-11-15']) {
    assert.equal(policyTargetRange([row(day, 3.75)], [row(day, 4)], now).targetMid, 3.875);
  }
  assert.equal(policyTargetRange([row(date, 0)], [row(date, 0.25)], now).targetMid, 0.125);
  assert.equal(policyTargetRange([row(date, 0)], [row(date, 0)], now).targetMid, 0);
});

test('target pair rejects different effective days, inversion, missing and malformed observations', () => {
  for (const [lower, upper] of [
    [[row('2024-09-19', 4.75)], [row('2024-09-18', 5.5)]],
    [[row('2026-11-15', 3.75)], [row(date, 4)]],
    [[row(date, 4.25)], [row(date, 4)]], [[], [row(date, 4)]],
    [[row(date, 3.75), row(date, 3.75)], [row(date, 4)]],
    [[row('2026-11-18', 3.75)], [row('2026-11-18', 4)]],
    [[row('2026-02-30', 3.75)], [row('2026-02-30', 4)]],
    [[row(date, null)], [row(date, 4)]], [[row(date, '3.75')], [row(date, 4)]],
    [[row(date, NaN)], [row(date, 4)]],
  ]) assert.equal(policyTargetRange(lower, upper, now).targetMid, null);
});

test('cache requires same-day proof, ordered bounds, correct midpoint and original timestamp', () => {
  const cache = { ...normal(), sourceStatus: { targetRange: 'live' } };
  assert.deepEqual(cachedPolicyTargetRange(cache, now), normal());
  for (const patch of [{ targetRangeObservedAt: null }, { targetMid: 4 }, { targetLower: 4.5 },
    { targetUpdatedAt: '2026-11-17T00:00:00Z' }, { sourceStatus: { targetRange: 'missing' } },
    { targetRangeObservedAt: { lower: '2026-11-15', upper: date } }]) {
    assert.equal(cachedPolicyTargetRange({ ...cache, ...patch }, now).targetMid, null);
  }
});

test('real policy resolver never combines two decision periods or revives unproven target comparisons', async () => {
  const live = await harness().resolvePolicyExpectations(null);
  assert.equal(live.targetMid, 3.875); assert.equal(live.futureMinusTargetMid, 0.29);
  const mixed = await harness({ lower: [row('2024-09-19', 4.75)], upper: [row('2024-09-18', 5.5)] }).resolvePolicyExpectations(null);
  assert.equal(mixed.targetMid, null); assert.equal(mixed.sourceStatus.targetRange, 'missing'); assertNoComparisons(mixed);
  const oneMissing = await harness({ upper: null }).resolvePolicyExpectations(null);
  assert.equal(oneMissing.targetMid, null); assertNoComparisons(oneMissing);
  const legacy = { ...plain(live), targetRangeObservedAt: null, policyExpectationRegime: '降息预期' };
  const out = await harness({ lower: null, upper: null, market: false }).resolvePolicyExpectations(legacy);
  assert.equal(out.targetMid, null); assertNoComparisons(out);
  const normalized = harness().normalizePreviousPolicyExpectations(legacy);
  assertNoComparisons(normalized);
});

test('verified target fallback keeps old clock; fresh target re-references cached curves without touching market evidence', async () => {
  const live = plain(await harness().resolvePolicyExpectations(null));
  const fallback = await harness({ lower: null, upper: null, market: false }).resolvePolicyExpectations(live);
  assert.equal(fallback.targetMid, 3.875); assert.equal(fallback.targetUpdatedAt, live.targetUpdatedAt);
  assert.equal(fallback.sourceStatus.targetRange, 'fallback');
  const mixed = await harness({ lower: [row('2026-11-17', 4)], upper: [row(date, 4)] }).resolvePolicyExpectations(live);
  assert.equal(mixed.targetMid, live.targetMid);
  assert.equal(mixed.targetUpdatedAt, live.targetUpdatedAt);
  assert.equal(mixed.sourceStatus.targetRange, 'fallback');
  const changed = await harness({ lower: [row(date, 4)], upper: [row(date, 4.25)], market: false }).resolvePolicyExpectations(live);
  assert.equal(changed.targetMid, 4.125); assert.equal(changed.futureMinusTargetMid, 0.04);
  for (const key of ['fedFundsFuturesCurve', 'sofrFuturesCurve']) {
    assert.equal(changed[key].contracts[0].impliedMinusTargetMid, -0.125);
    assert.equal(changed[key].contracts[0].updatedAt, live[key].contracts[0].updatedAt);
    assert.equal(changed[key].frontMinusBack, live[key].frontMinusBack);
    assert.equal(changed[key].curveStatus, 'fallback_proxy_curve');
    for (let i = 0; i < live[key].contracts.length; i++) {
      const { impliedMinusTargetMid: omitted, ...original } = live[key].contracts[i];
      const { impliedMinusTargetMid: recalculated, ...actual } = plain(changed[key].contracts[i]);
      assert.deepEqual(actual, original);
    }
  }
  assert.equal(changed.oisForwardCurve.twoMinusTargetMid, 0.375);
  assert.deepEqual(plain(changed.oisForwardCurve.tenors), live.oisForwardCurve.tenors);
  assert.equal(changed.oisForwardCurve.updatedAt, live.oisForwardCurve.updatedAt);
  assert.equal(changed.oisForwardCurve.tenMinusTwo, live.oisForwardCurve.tenMinusTwo);
});
