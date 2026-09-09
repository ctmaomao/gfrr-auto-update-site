import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deriveRisk } from '../../scripts/run-daily-pipeline.mjs';
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
