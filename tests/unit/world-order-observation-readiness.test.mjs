import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditWorldOrderObservationReadiness as audit, parseReadinessTimestamp as parse } from '../../scripts/world-order/observation-readiness.mjs';
import { buildMarketCompletionRange } from '../../scripts/world-order/market-completion-range.mjs';
import { normalizeWorldOrderStressHistorySnapshot as history } from '../../scripts/daily/world-order-history.mjs';
const checkedAt = '2026-11-14T12:00:00Z';
const detail = (value = 120) => ({ ok: true, value, source: 'FRED:DTWEXBGS', timestamp: '2026-11-06', timestampKind: 'observation_date', fallbackUsed: false, held: false });
const run = d => audit({ checkedAt, values: { dxy: 120 }, sourceDetails: { dxy: d } });

test('registered broad dollar metadata cannot become ICE DXY or a calibrated threshold', () => {
  const result = run(detail());
  assert.equal(result.observations.dxy.sourceRecognized, true);
  assert.equal(result.observations.dxy.reportedObservationAt, '2026-11-06');
  assert.equal(result.observations.dxy.qualifiedObservedAt, null);
  assert.ok(result.observations.dxy.reasons.includes('dollar_series_rule_not_calibrated'));
  for (const value of [0, 104, 105, 200]) {
    const out = audit({ checkedAt, values: { dxy: value }, sourceDetails: { dxy: detail(value) } });
    assert.equal(out.criteria.dollarGold.status, 'unknown');
    assert.equal(out.productionEligible, false);
    assert.equal(out.score, null);
  }
});

test('valid calendar clocks only; wrapper clocks never repair missing/invalid/future observations', () => {
  for (const timestamp of [null, '', '2026-02-30', '2025-02-29', '2026-11-15', '2026-11-06T24:00:00Z', '11/06/2026', '2026-11-06T00:00:00', 123]) {
    assert.equal(run({ ...detail(), timestamp, updatedAt: checkedAt }).observations.dxy.reportedObservationAt, null);
  }
  for (const value of ['2024-02-29', '2026-11-06T00:00:00.123Z']) assert.ok(Number.isFinite(parse(value)));
  for (const date of [null, '2026-02-30']) assert.throws(() => audit({ checkedAt: date }));
});

test('source identity, value binding, timestamp semantics and held status cannot be inferred', () => {
  for (const patch of [{ source: 'ICE:DXY' }, { source: 'fred:SP500' }, { source: 'FRED:DTWEXBGS+other' }, { value: 121 }, { value: '120' }, { ok: false }, { timestampKind: 'unknown' }, { timestampKind: 'snapshot_acquisition' }, { timestampKind: 'provider_acquisition' }, { fallbackUsed: true }, { fallbackUsed: null }, { held: true }, { held: null }, { held: undefined }]) {
    const out = run({ ...detail(), ...patch }).observations.dxy;
    assert.equal(out.reportedObservationAt, null, JSON.stringify(patch));
    assert.equal(out.qualifiedObservedAt, null);
  }
  const matchedOnly = { status: 'matched_metadata', source: 'FRED:DTWEXBGS', reportedTimestamp: '2026-11-06' };
  assert.equal(run(matchedOnly).observations.dxy.valueMatched, false);
});

test('gold acquisition time and composite Brent remain unqualified even with misleading observation labels', () => {
  const sourceDetails = { gold: { ...detail(4000), source: 'https://api.gold-api.com/price/XAU' }, brent: { ...detail(100), source: 'yahoo:BZ=F+tradingeconomics:brent-crude-oil-average promoted over stale FRED anchor' } };
  const out = audit({ checkedAt, values: { gold: 4000, brent: 100 }, sourceDetails });
  assert.equal(out.observations.gold.reportedObservationAt, null);
  assert.equal(out.observations.brent.reportedObservationAt, null);
  assert.ok(out.observations.gold.reasons.includes('gold_provider_time_is_not_quote_observation'));
});

test('all missing and true zero stay distinct but neither qualifies a criterion or point score', () => {
  const input = { checkedAt, values: { dxy: 0, gold: null }, sourceDetails: { dxy: detail(0) } };
  const before = JSON.stringify(input), out = audit(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(out.observations.dxy.selectedValue, 0);
  assert.equal(out.observations.gold.selectedValue, null);
  assert.ok(Object.values(out.criteria).every(c => c.status === 'unknown'));
  assert.deepEqual(buildMarketCompletionRange(out.criteria).scoreRange, { lower: 0, upper: 88, kind: 'conditional_v1_formula_outer_bound' });
  assert.throws(() => history({ contractVersion: 'world-order-stress-v2' }), /not_activated/);
});

test('current published provenance remains insufficient without raw matched observations; production has no importer', () => {
  const world = JSON.parse(fs.readFileSync('data/world-order-stress.json', 'utf8'));
  const out = audit({ checkedAt, values: world.marketConfirmationInput || {}, sourceDetails: {} });
  assert.ok(Object.values(out.observations).every(o => o.qualifiedObservedAt === null));
  for (const file of ['scripts/build-world-order-stress.mjs', 'scripts/world-order/build-market-confirmation.mjs', 'scripts/world-order/score-world-order-stress.mjs', 'scripts/run-daily-pipeline.mjs']) {
    assert.ok(!fs.readFileSync(file, 'utf8').includes('observation-readiness.mjs'), `${file} must remain unconnected`);
  }
});
