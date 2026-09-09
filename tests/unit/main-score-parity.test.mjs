import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deriveRisk, buildTransportShockScoringImpact } from '../../scripts/run-daily-pipeline.mjs';
import { buildHistoricalScoreInputs, deriveHistoricalRisk } from '../../scripts/daily/historical-score.mjs';

const rules = JSON.parse(readFileSync(new URL('../../config/rules.json', import.meta.url)));
const baseline = JSON.parse(readFileSync(new URL('../fixtures/main-score-production-baseline.json', import.meta.url)));
for (const fixture of baseline.cases) {
  test(`unchanged production score and complete output: ${fixture.name}`, () => {
    const result = deriveRisk(fixture.rt, fixture.macroDrivers);
    assert.equal(result.score, fixture.expectedScore);
    assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'), fixture.expectedSha256);
    assert.deepEqual(deriveRisk(fixture.rt, fixture.macroDrivers, rules), result);
  });
}

const date = '2026-06-12';
const series = Object.fromEntries(Object.entries({ brent: 80, dxy: 115, vix: 18, hyOas: 3,
  us10y: 4, real10y: 1.8, breakeven10y: 2.3, spx: 5300, walcl: 7000000, onRrp: 500, t10y2y: -0.1, igOas: 1 })
  .map(([key, value]) => [key, [{ date: '2026-05-01', value }, { date, value }]]));
series.brent.splice(1, 0, { date: '2026-06-11', value: 64 });
series.t10y2y[0].value = -0.5;
series.onRrp[0].value = 1000;

test('historical adapter supplies oil daily change, curve steepening and RRP change', () => {
  const input = buildHistoricalScoreInputs(date, series, rules);
  assert.equal(input.rt.changes.brent1d, 25);
  assert.equal(input.macroDrivers.curve.steepeningAlert, true);
  assert.equal(input.macroDrivers.fedLiquidity.onRrpWeekChange, -50);
  const row = deriveHistoricalRisk(date, series, rules);
  assert.deepEqual(row.modules, deriveRisk(input.rt, input.macroDrivers, rules).modules);
  assert.equal(row.components.curveSteepeningRisk, 80);
  assert.equal(row.transportShockScoringImpact.contributionPct, 0);
  assert.deepEqual(row.unavailableHistoricalInputs, ['transportShockCandidate']);
});

test('future observations cannot affect earlier scores', () => {
  const future = Object.fromEntries(Object.entries(series).map(([key, rows]) => [key, [...rows, { date: '2027-01-01', value: 999999 }]]));
  assert.deepEqual(deriveHistoricalRisk(date, future, rules), deriveHistoricalRisk(date, series, rules));
});

test('missing required inputs fail closed and historical credit proxy is disclosed', () => {
  assert.equal(deriveHistoricalRisk(date, { ...series, brent: [] }, rules), null);
  const row = deriveHistoricalRisk(date, { ...series, hyOas: [], baa10y: [{ date, value: 3 }] }, rules);
  assert.equal(row.inputs.creditProxyUsed, true);
  assert.ok(row.historicalProxyInputs.includes('hyOas_from_baa10y'));
});

test('historical overrides accept only known finite values; absent optional inputs stay missing', () => {
  const sparse = { ...series, walcl: [], onRrp: [], t10y2y: [], igOas: [], spx: [], breakeven10y: [] };
  const input = buildHistoricalScoreInputs(date, sparse, rules, { brent: 0, dxy: NaN, unknown: 9 });
  assert.equal(input.rt.values.brent, 0);
  assert.equal(input.rt.values.dxy, 115);
  assert.equal(Object.hasOwn(input.rt.values, 'unknown'), false);
  assert.equal(input.macroDrivers.fedLiquidity.onRrpWeekChange, null);
  assert.equal(input.macroDrivers.curve.t10y2yWeekChange, null);
  assert.equal(input.macroDrivers.credit.sourceStatus.igOas, 'missing');
  assert.equal(deriveHistoricalRisk('2000-01-01', series, rules), null);
  const zeroPrevious = structuredClone(series);
  zeroPrevious.brent[1].value = 0;
  assert.equal(buildHistoricalScoreInputs(date, zeroPrevious, rules).rt.changes.brent1d, null);
});

test('transport thresholds, cap and fail-closed gates remain independent', () => {
  const energy = structuredClone(baseline.cases.find(item => item.name === 'transport').macroDrivers.energyTransport);
  for (const [score, expected] of [[0, 0], [49.99, 0], [50, 1], [59.99, 1], [60, 2], [74.99, 2], [75, 3], [100, 3]]) {
    energy.transportShockCandidate.score = score;
    const result = buildTransportShockScoringImpact(energy, 40);
    assert.equal(result.contributionPct, expected);
    assert.equal(result.scoreAfterTransport, 40 + expected);
  }
  energy.transportShockCandidate.score = 75;
  assert.equal(buildTransportShockScoringImpact(energy, 99).contributionPct, 1);
  assert.equal(buildTransportShockScoringImpact(energy, 100).contributionPct, 0);
  assert.equal(buildTransportShockScoringImpact(energy, null).contributionPct, 0);
  for (const mutate of [
    e => { delete e.transportShockCandidate; }, e => { e.sourceStatus.chokepoints = 'fallback'; },
    e => { e.latestAgeDays = 999; }, e => { e.latestAgeDays = -1; }, e => { e.latestAgeDays = null; },
    e => { e.transportShockCandidate.eligibleForMainScore = false; },
    e => { e.transportShockCandidate.status = 'normal'; }, e => { e.transportShockCandidate.score = NaN; }
  ]) {
    const invalid = structuredClone(energy); mutate(invalid);
    const result = buildTransportShockScoringImpact(invalid, 40);
    assert.equal(result.contributionPct, 0);
    assert.equal(result.scoreAfterTransport, 40);
    assert.equal(result.applied, false);
  }
});
