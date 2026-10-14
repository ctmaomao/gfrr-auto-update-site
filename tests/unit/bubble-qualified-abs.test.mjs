import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyDataCenterSpread } from '../../scripts/bubble-watch/qualified-abs.mjs';
const reviews = [{ id: 'fixture-only-review', approved: true, coreEligibilityApproved: true, indicatorId: 'dc_abs_spread', subjectType: 'US_DATA_CENTER_ABS', currency: 'USD', allowedHosts: ['example.com'], bondIds: ['fixture-bond'] }];
const quote = (date, yieldPct) => ({ bondId: 'fixture-bond', tranche: 'A', currency: 'USD', benchmarkType: 'US_TREASURY', observationKind: 'market_quote', sourceUrl: 'https://example.com/quote', observedAt: date, benchmarkObservedAt: date, benchmarkSourceUrl: 'https://example.com/benchmark', yieldPct, benchmarkYieldPct: 4, tenorYears: 5, benchmarkTenorYears: 5 });
const fixture = () => ({ sourceReviewId: 'fixture-only-review', subjectType: 'US_DATA_CENTER_ABS', currency: 'USD', bondId: 'fixture-bond', tranche: 'A', benchmarkType: 'US_TREASURY', current: quote('2026-10-12', 6), week4: quote('2026-09-14', 5.5), week12: quote('2026-07-20', 5.4) });

test('same-bond matched-benchmark spread qualifies with original observation date', () => {
  const r = qualifyDataCenterSpread(fixture(), '2026-10-13', reviews);
  assert.equal(r.status, 'red'); assert.equal(r.spreadBp, 200); assert.equal(r.change4wBp, 50); assert.equal(r.ageDays, 1); assert.equal(r.asOf, '2026-10-12');
});
test('absolute yields falling cannot masquerade as credit spreads tightening', () => {
  const f = fixture(); f.current.yieldPct = 5.5; f.current.benchmarkYieldPct = 3;
  const r = qualifyDataCenterSpread(f, '2026-10-13', reviews);
  assert.equal(r.status, 'red'); assert.equal(r.change4wBp, 100);
});
test('genuine unchanged and tighter matched spreads retain distinct lights', () => {
  const f = fixture(); f.current.yieldPct = 5.5; assert.equal(qualifyDataCenterSpread(f, '2026-10-13', reviews).status, 'yellow');
  f.current.yieldPct = 5.2; assert.equal(qualifyDataCenterSpread(f, '2026-10-13', reviews).status, 'green');
});
test('unreviewed, Chinese generic, coupon-only and wrong-tranche evidence cannot score', () => {
  assert.equal(qualifyDataCenterSpread(fixture(), '2026-10-13').status, 'unknown');
  for (const mutate of [
    f => { f.subjectType = 'CHINA_GENERIC_ABS'; }, f => { f.currency = 'CNY'; },
    f => { f.current.benchmarkObservedAt = '2026-01-01'; },
    f => { delete f.current.benchmarkSourceUrl; },
    f => { f.current.benchmarkSourceUrl = 'https://evil.test/old'; },
    f => { f.current.tranche = 'B'; }, f => { f.current.bondId = 'other'; },
    f => { f.current.observationKind = 'coupon'; }, f => { delete f.current.yieldPct; f.current.couponRate = 6; },
    f => { delete f.current.benchmarkYieldPct; }, f => { f.current.yieldPct = null; },
    f => { f.current.tenorYears = 10; }, f => { f.current.sourceUrl = 'http://example.com/q'; },
    f => { f.current.sourceUrl = 'https://example.com/q?api_key=hidden'; },
    f => { f.current.sourceUrl = 'https://example.com.evil.test/q'; }
  ]) { const f = fixture(); mutate(f); assert.equal(qualifyDataCenterSpread(f, '2026-10-13', reviews).status, 'unknown'); }
});
test('invalid, future, old and noncomparable baseline dates never get refreshed by check time', () => {
  for (const [key, value] of [['current', '2026-10-14'], ['current', '2026-09-01'], ['current', '2026-02-30'], ['week4', '2026-10-01'], ['week12', '2026-09-01']]) {
    const f = fixture(); f[key].observedAt = value; assert.equal(qualifyDataCenterSpread(f, '2026-10-13', reviews).status, 'unknown');
  }
  assert.equal(qualifyDataCenterSpread(fixture(), 'invalid', reviews).status, 'unknown');
});
