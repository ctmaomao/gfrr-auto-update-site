import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketCompletionRange, MARKET_CRITERIA } from '../../scripts/world-order/market-completion-range.mjs';
const known = contribution => ({ status: 'qualified', contribution, evidenceRef: 'offline-fixture:not-production-certification' });
const zero = () => Object.fromEntries(MARKET_CRITERIA.map(key => [key, known(0)]));

test('missing evidence is incomplete, not zero, green, probability or production eligible', () => {
  const result = buildMarketCompletionRange();
  assert.equal(result.score, null);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.scoreRange, { lower: 0, upper: 88, kind: 'conditional_v1_formula_outer_bound' });
  assert.equal(result.productionEligible, false);
  assert.equal(result.calibratedProbability, false);
  assert.equal(result.regimeClassification, null);
});

test('all 324 qualified v1 contribution combinations preserve exact sum', () => {
  let count = 0;
  for (const gold of [0, 11, 18]) for (const brent of [0, 9, 16])
    for (const vix of [0, 10, 18]) for (const dollarGold of [0, 12])
      for (const hyOas of [0, 10, 18]) for (const spxGold of [0, 6]) {
        const contributions = { gold, brent, vix, dollarGold, hyOas, spxGold };
        const result = buildMarketCompletionRange(Object.fromEntries(Object.entries(contributions).map(([k, v]) => [k, known(v)])));
        const expected = Object.values(contributions).reduce((a, b) => a + b, 0);
        assert.equal(result.score, expected);
        assert.equal(result.status, 'complete');
        assert.equal(result.scoreRange.lower, expected);
        assert.equal(result.scoreRange.upper, expected);
        count++;
      }
  assert.equal(count, 324);
});

test('uncalibrated dollar preserves current non-dollar evidence and a conditional unknown range', () => {
  const criteria = { ...zero(), gold: known(18), spxGold: known(6), dollarGold: { status: 'unknown', reason: 'series_calibration_missing' } };
  const result = buildMarketCompletionRange(criteria);
  assert.equal(result.score, null);
  assert.equal(result.scoreRange.lower, 24);
  assert.equal(result.scoreRange.upper, 36);
  assert.equal(result.criteria.find(x => x.key === 'dollarGold').reason, 'series_calibration_missing');
});

test('caller can certify a joint zero from a known-false leg without certifying the unknown leg', () => {
  // Gold below threshold logically defeats both gold joint signals. No dollar
  // calibration or dollar observation is claimed by this contribution fixture.
  const result = buildMarketCompletionRange(zero());
  assert.equal(result.score, 0);
  assert.equal(result.status, 'complete');
});

test('unknown criteria widen bounds and never manufacture a point score', () => {
  const max = { gold: 18, brent: 16, vix: 18, dollarGold: 12, hyOas: 18, spxGold: 6 };
  for (const key of MARKET_CRITERIA) {
    const input = Object.fromEntries(Object.entries(max).map(([k, v]) => [k, known(v)]));
    input[key] = { status: 'unknown', reason: 'observation_stale' };
    const result = buildMarketCompletionRange(input);
    assert.equal(result.score, null);
    assert.equal(result.scoreRange.lower, 88 - max[key]);
    assert.equal(result.scoreRange.upper, 88);
  }
});

test('malformed status, contribution, keys or missing evidence reference are not accepted', () => {
  for (const input of [null, [], 1, { typo: known(0) }]) assert.throws(() => buildMarketCompletionRange(input));
  for (const item of [null, [], {}, { status: 'fresh', contribution: 18 }, known(null), known('18'), known(19), known(NaN),
    { status: 'qualified', contribution: 18 }, { status: 'qualified', contribution: 18, evidenceRef: ' ' },
    { status: 'unknown', reason: '' }, { status: 'unknown', reason: 'missing', contribution: 0 }]) {
    assert.throws(() => buildMarketCompletionRange({ gold: item }));
  }
});
