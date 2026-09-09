import assert from 'node:assert/strict';
import test from 'node:test';
import { describeHistoricalValidation, historicalNumber, isHistoricalDate } from '../../scripts/daily/historical-validation.mjs';
import { parseArgs, parseFredApiObservations, parseFredCsv } from '../../scripts/audit-main-score-backtest.mjs';

test('calendar validation rejects rolled-over dates and missing values without losing zero', () => {
  for (const value of ['2026-02-29', '2026-13-01', '', undefined]) assert.equal(isHistoricalDate(value), false);
  assert.equal(isHistoricalDate('2024-02-29'), true);
  for (const value of ['', ' ', '.', null, undefined, false, Infinity]) assert.equal(historicalNumber(value), null);
  assert.equal(historicalNumber('0'), 0);
  assert.equal(historicalNumber('-1.5'), -1.5);
});

test('FRED parsers reject missing observations and sort before as-of lookup', () => {
  const observations = [
    { date: '2026-01-03', value: '2' }, { date: '2026-01-01', value: '0' },
    { date: '2026-01-02', value: '' }, { date: '2026-02-30', value: '8' }
  ];
  const expected = [{ date: '2026-01-01', value: 0 }, { date: '2026-01-03', value: 2 }];
  assert.deepEqual(parseFredApiObservations({ observations }), expected);
  assert.deepEqual(parseFredCsv('DATE,VALUE\n' + observations.map(row => `${row.date},${row.value}`).join('\n')), expected);
  assert.deepEqual(parseFredApiObservations(null), []);
});

test('calibration cutoff is inclusive and a later date cannot imply predictive validation', () => {
  const rules = { riskCalibrations: { dxyBroadDollar: { sampleStart: '2006-01-01', sampleEnd: '2026-06-16' } } };
  const report = describeHistoricalValidation(rules, ['2008-09-15', '2026-06-16', '2026-06-17']);
  assert.equal(report.rowsAtOrBeforeCalibrationEnd, 2);
  assert.equal(report.rowsAfterCalibrationEnd, 1);
  assert.equal(report.predictiveEvidence, false);
  assert.equal(report.pointInTimeData, false);
  assert.equal(report.frozenOutOfSample, false);
  assert.match(report.rulesSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(report.rulesSha256, describeHistoricalValidation({ ...rules, changed: true }, []).rulesSha256);
  const unknown = describeHistoricalValidation({}, []);
  assert.equal(unknown.rowsAtOrBeforeCalibrationEnd, null);
  assert.equal(unknown.rowsAfterCalibrationEnd, null);
  assert.equal(unknown.predictiveEvidence, false);
  assert.throws(() => describeHistoricalValidation(rules, ['2026-02-30']), /Invalid historical/);
});

test('strict predictive request and invalid evaluation windows fail before network or output', () => {
  assert.throws(() => parseArgs(['--allow-network', '--require-predictive-evidence']), /Predictive validation unavailable/);
  assert.throws(() => parseArgs(['--start-date', '2026-02-30']), /valid YYYY-MM-DD/);
  assert.throws(() => parseArgs(['--start-date', '2026-01-02', '--end-date', '2026-01-01']), /on or before/);
  assert.equal(parseArgs([]).allowNetwork, false);
});
