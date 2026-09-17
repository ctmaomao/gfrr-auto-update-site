import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { deriveRisk, buildTransportShockScoringImpact } from '../../scripts/run-daily-pipeline.mjs';
import { buildHistoricalScoreInputs, deriveHistoricalRisk, historicalObservation, prepareHistoricalValues, buildHistoricalReplay } from '../../scripts/daily/historical-score.mjs';

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
  .map(([key, value]) => [key, [{ date: '2026-06-05', value }, { date, value }]]));
series.brent.splice(1, 0, { date: '2026-06-11', value: 64 });
series.t10y2y[0].value = -0.5;
series.onRrp[0].value = 1000;

test('historical adapter supplies oil daily change, curve steepening and RRP change', () => {
  const input = buildHistoricalScoreInputs(date, series, rules);
  assert.equal(input.rt.changes.brent1d, 16);
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

test('historical age boundaries allow calendar gaps but reject abandoned series', () => {
  const rows = [{ date: '2026-06-05', value: 10 }];
  assert.equal(historicalObservation(rows, '2026-06-07', 'brent').value, 10);
  assert.equal(historicalObservation(rows, '2026-06-12', 'brent').value, 10);
  assert.equal(historicalObservation(rows, '2026-06-13', 'brent').status, 'stale');
  assert.equal(historicalObservation(rows, '2026-06-19', 'walcl').value, 10);
  assert.equal(historicalObservation(rows, '2026-06-20', 'walcl').status, 'stale');
  assert.equal(historicalObservation(rows, '2026-06-01', 'brent').status, 'missing');
  assert.equal(historicalObservation([{ date, value: NaN }], date, 'brent').status, 'missing');
  assert.equal(deriveHistoricalRisk('2030-01-01', series, rules), null);
  const oldOptional = { ...series, igOas: [{ date: '2000-01-01', value: 99 }] };
  assert.equal(buildHistoricalScoreInputs(date, oldOptional, rules).macroDrivers.credit.sourceStatus.igOas, 'missing');
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
  assert.equal(buildHistoricalScoreInputs(date, zeroPrevious, rules).rt.changes.brent1d, 80);
});

// Execute only the actual, pure production series adapter. Importing the whole
// realtime CLI would fetch sources and write production data at module load.
const realtimeSource = readFileSync(new URL('../../scripts/run-realtime.mjs', import.meta.url), 'utf8');
const adapterStart = realtimeSource.indexOf('function latest(');
const adapterEnd = realtimeSource.indexOf('function readPrev(', adapterStart);
assert.ok(adapterStart >= 0 && adapterEnd > adapterStart);
const productionSeries = vm.runInNewContext(
  `${realtimeSource.slice(adapterStart, adapterEnd)}\nbuildSeriesPayload`, {}, { timeout: 1000 });

test('actual production series adapter and historical input agree through the full score', () => {
  for (const [previous, current] of [[64,80],[121.25,130.8],[100,90],[80,80],[0,80],[80.12345,81.98765]]) {
    const inputs = structuredClone(series);
    inputs.brent = [{ date:'2026-06-11', value:previous }, { date, value:current }];
    const production = productionSeries(inputs.brent);
    const historical = buildHistoricalScoreInputs(date, inputs, rules);
    assert.equal(historical.rt.changes.brent1d, production.change);
    assert.equal(historical.inputDiagnostics.brent1d.unit, 'USD_per_barrel');
    assert.deepEqual(deriveRisk({ ...historical.rt, changes:{brent1d:production.change} }, historical.macroDrivers),
      deriveRisk(historical.rt, historical.macroDrivers));
  }
});

test('oil observation changes retain Friday-to-Monday dates, missingness and scenario provenance', () => {
  const inputs = structuredClone(series);
  inputs.brent = [{date:'2026-06-05',value:80},{date:'2026-06-08',value:85}];
  const monday = buildHistoricalScoreInputs('2026-06-08',inputs,rules);
  assert.equal(monday.rt.changes.brent1d,5);
  assert.equal(monday.inputDiagnostics.brent1d.observationDate,'2026-06-08');
  assert.equal(monday.inputDiagnostics.brent1d.previousObservationDate,'2026-06-05');
  assert.equal(buildHistoricalScoreInputs('2026-06-09',inputs,rules).rt.changes.brent1d,5);
  const scenario = buildHistoricalScoreInputs('2026-06-08',inputs,rules,{brent:90});
  assert.equal(scenario.rt.changes.brent1d,10);
  assert.equal(scenario.inputDiagnostics.brent1d.valueOrigin,'scenario_override');
  assert.equal(scenario.inputDiagnostics.brent1d.observationDate,null);
  for(const rows of [[{date,value:80}],[{date:'2026-05-01',value:64},{date,value:80}]]) {
    inputs.brent=rows;
    const missing=buildHistoricalScoreInputs(date,inputs,rules);
    assert.equal(missing.rt.changes.brent1d,null);
    assert.equal(missing.inputDiagnostics.brent1d.value,null);
    assert.equal(missing.inputDiagnostics.brent1d.effectiveValue,0);
    assert.equal(missing.inputDiagnostics.brent1d.valueOrigin,'default');
    assert.ok(missing.defaultedHistoricalInputs.includes('brent1d'));
    assert.ok(missing.unavailableHistoricalInputs.includes('brent1d'));
  }
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

test('default, stale, observed, proxy and scenario inputs retain distinct provenance', () => {
  const inputs = { ...series, breakeven10y: [], spx: [{ date: '2000-01-01', value: 1000 }], hyOas: [], baa10y: [{ date, value: 3 }], igOas: [] };
  const row = deriveHistoricalRisk(date, inputs, rules);
  assert.deepEqual(row.defaultedHistoricalInputs, ['breakeven10y', 'spx']);
  assert.equal(row.inputDiagnostics.breakeven10y.valueOrigin, 'default');
  assert.equal(row.inputDiagnostics.breakeven10y.effectiveValue, rules.defaults.breakeven10y);
  assert.equal(row.inputDiagnostics.breakeven10y.effectiveObservationDate, null);
  assert.equal(row.inputDiagnostics.spx.status, 'stale');
  assert.equal(row.inputDiagnostics.spx.observationDate, '2000-01-01');
  assert.equal(row.inputDiagnostics.spx.value, null);
  assert.equal(row.inputDiagnostics.spx.effectiveValue, rules.defaults.spx);
  assert.equal(row.inputDiagnostics.hyOas.valueOrigin, 'proxy');
  assert.equal(row.inputDiagnostics.hyOas.effectiveSourceKey, 'baa10y');
  assert.equal(row.inputDiagnostics.hyOas.effectiveObservationDate, date);
  assert.equal(row.inputDiagnostics.brent.valueOrigin, 'historical');
  assert.equal(row.inputDiagnostics.brent.observationDate, date);
  assert.equal(row.inputDiagnostics.igOas.valueOrigin, 'missing');
  assert.ok(row.unavailableHistoricalInputs.includes('igOas'));
  assert.ok(row.unavailableHistoricalInputs.includes('spx'));
  const simulation = prepareHistoricalValues(date, inputs, rules, { brent: 0 });
  assert.equal(simulation.inputDiagnostics.brent.valueOrigin, 'scenario_override');
  assert.equal(simulation.inputDiagnostics.brent.value, 80);
  assert.equal(simulation.inputDiagnostics.brent.effectiveValue, 0);
  assert.equal(simulation.inputDiagnostics.brent.effectiveObservationDate, null);
});

test('replay accounts for missing and stale excluded dates without manufacturing scores', () => {
  const replay = buildHistoricalReplay(['2000-01-01', date, '2030-01-01'], series, rules);
  assert.deepEqual(replay.sampleRows.map(row => row.date), [date]);
  assert.equal(replay.inputCoverage.requestedRows, 3);
  assert.equal(replay.inputCoverage.evaluatedRows, 1);
  assert.equal(replay.inputCoverage.excludedSamples.length, 2);
  assert.equal(replay.inputCoverage.excludedSamples[0].inputDiagnostics.brent.status, 'missing');
  assert.equal(replay.inputCoverage.excludedSamples[1].inputDiagnostics.brent.status, 'stale');
  assert.equal(replay.inputCoverage.excludedSamples[1].inputDiagnostics.brent.observationDate, date);
  assert.deepEqual(buildHistoricalReplay([], series, rules).inputCoverage, { requestedRows: 0, evaluatedRows: 0, excludedSamples: [] });
});
