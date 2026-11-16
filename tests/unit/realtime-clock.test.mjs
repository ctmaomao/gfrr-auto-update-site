import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAgeMinutes, classifyFreshnessLevel, isFreshEnoughForConsensus,
  prepareBrentCandidatesForConsensus, buildBrentConsensus, buildBrentPromotionDecision, buildPayload
} from '../../scripts/run-realtime.mjs';
import { FUTURE_TIMESTAMP_TOLERANCE_MINUTES } from '../../scripts/health/timestamp-policy.mjs';
const now = '2026-11-16T12:00:00.000Z';
const at = minutes => new Date(Date.parse(now) + minutes * 60000).toISOString();
const candidate = (source, observedAt = now, value = 90) => ({ source, value, observedAt, fetchedAt: now, available: true });

test('producer clock checks raw future age before rounding with existing five-minute skew', () => {
  assert.equal(FUTURE_TIMESTAMP_TOLERANCE_MINUTES, 5);
  for (const delta of [0, 1, 4.999, 5]) assert.equal(computeAgeMinutes(at(delta), now), 0);
  for (const delta of [5 + 1 / 60000, 5.49, 60]) assert.equal(computeAgeMinutes(at(delta), now), null);
  assert.equal(computeAgeMinutes(at(-30), now), 30);
  for (const clock of [null, '', 'bad']) {
    assert.equal(computeAgeMinutes(clock, now), null);
    assert.equal(computeAgeMinutes(now, clock), null);
  }
  for (const age of [null, undefined, NaN, Infinity, -Infinity, -1, '0', false]) assert.equal(classifyFreshnessLevel(age, true), 'unavailable');
  for (const [age, level] of [[0, 'fresh'], [30, 'fresh'], [90, 'aging'], [360, 'stale'], [361, 'unavailable']]) assert.equal(classifyFreshnessLevel(age, true), level);
});

test('every timestamped Brent candidate excludes future clocks; null never coerces below 120', () => {
  for (const source of ['ice', 'barchart', 'stooq', 'marketwatch', 'oilprice', 'yahoo']) {
    for (const observedAt of [at(60), '2099-01-01', null, 'bad']) {
      const c = candidate(source, observedAt);
      assert.equal(isFreshEnoughForConsensus(c, now), false, `${source}/${observedAt}`);
      assert.equal(prepareBrentCandidatesForConsensus([c], now)[0].participatesInConsensus, false);
    }
    assert.equal(isFreshEnoughForConsensus(candidate(source, at(5)), now), true);
    assert.equal(isFreshEnoughForConsensus(candidate(source), 'bad'), false);
  }
  assert.equal(isFreshEnoughForConsensus(candidate('fred-anchor'), now), false);
  assert.equal(isFreshEnoughForConsensus(candidate('yahoo', at(-120)), now), true);
  assert.equal(isFreshEnoughForConsensus(candidate('yahoo', at(-121)), now), false);
  // Daily Stooq dates retain the existing age exception, not a new intraday claim.
  const stooq = prepareBrentCandidatesForConsensus([candidate('stooq', '2026-11-13')], now)[0];
  assert.equal(stooq.participatesInConsensus, true);
  assert.equal(stooq.ageMinutes, null);
});

test('future prices cannot form a promoted pair or become Oilprice weak confirmation', () => {
  const raw = [candidate('barchart'), candidate('yahoo', at(60), 90.1), candidate('oilprice', at(60), 90.2)];
  const candidates = prepareBrentCandidatesForConsensus(raw, now);
  assert.equal(candidates.filter(c => c.participatesInConsensus).length, 1);
  assert.equal(candidates[2].weakConfirmation, false);
  const consensus = buildBrentConsensus(candidates);
  const result = buildBrentPromotionDecision([{ key: 'brent', value: 88, source: 'fred:DCOILBRENTEU', timestamp: '2026-11-01' }], { candidates, consensus }, now);
  assert.equal(result.applied, false);
  // Preserve legitimate date-unknown Oilprice weak confirmation behavior.
  const weak = prepareBrentCandidatesForConsensus([candidate('barchart'), candidate('oilprice', null, 90.1)], now);
  assert.equal(weak[1].weakConfirmation, true);
});

test('future anchor is unknown age, and future cached payload/field never looks fresh', () => {
  const candidates = prepareBrentCandidatesForConsensus([candidate('ice'), candidate('barchart', now, 90.1)], now);
  const consensus = buildBrentConsensus(candidates);
  const promotion = buildBrentPromotionDecision([{ key: 'brent', value: 88, timestamp: at(60) }], { candidates, consensus }, now);
  assert.equal(promotion.applied, false);
  assert.equal(promotion.anchorAgeHours, null);
  assert.equal(promotion.reason, 'fred-anchor-age-missing');
  const results = [{ key: 'brent', ok: false, critical: true, value: 88, change: 0, source: 'fred:DCOILBRENTEU', timestamp: '2099-01-01', fallbackUsed: true }];
  const output = buildPayload(results, { asOf: '2099-01-01', lastSuccessAt: '2099-01-01', values: { brent: 88 } });
  assert.equal(output.ageMinutes, null);
  assert.equal(output.freshnessLevel, 'unavailable');
  assert.equal(output.unavailable, true);
  assert.equal(output.fieldFreshness.brent.ageMinutes, null);
  assert.equal(output.fieldFreshness.brent.freshnessLevel, 'unavailable');
  assert.equal(output.fieldFreshness.brent.isStale, true);
  assert.equal(output.values.brent, 88); // retain dated fallback; never rewrite its value or clock
  assert.equal(output.asOf, '2099-01-01');
});
