#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  annualBlockBootstrap,
  buildBinaryEpisodes,
  computeAuRoc,
  computeAveragePrecision,
  evaluateThreshold,
  summarizeBinaryTask
} from './main-score/validation-metrics.mjs';
import { buildCausalDxyCalibration } from './main-score/causal-calibration.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = JSON.parse(fs.readFileSync(path.resolve('config/main-score-validation.json'), 'utf8'));
const auditSource = fs.readFileSync(path.resolve('scripts/audit-main-score-backtest.mjs'), 'utf8');
const dailySource = fs.readFileSync(path.resolve('scripts/run-daily-pipeline.mjs'), 'utf8');
const metricsSource = fs.readFileSync(path.resolve('scripts/main-score/validation-metrics.mjs'), 'utf8');

assert(config.schemaVersion === 'main-score-scientific-validation-v1', 'validation schemaVersion mismatch');
assert(config.auditOnly === true, 'validation must remain audit-only');
assert(config.changesProductionScore === false, 'validation must not change production score');
assert(config.primaryThreshold === 55, 'primary threshold must remain preregistered at 55');
assert(JSON.stringify(config.thresholds) === JSON.stringify([45, 55, 65]), 'threshold set mismatch');
assert(config.labels?.earlyWarning6m?.leadDays === 183, 'early-warning horizon must remain 183 days');
assert(config.labels?.earlyWarning6m?.excludesActiveRecession === true, 'early-warning task must exclude active recessions');
assert(Array.isArray(config.eventWindows) && config.eventWindows.length === 6, 'event windows must remain preregistered');
assert(config.causalCalibration?.dxy?.minimumObservations === 252, 'causal DXY minimum history mismatch');
assert(config.causalCalibration?.dxy?.method === 'expanding_percentile_as_of_each_observation_v1', 'causal DXY method mismatch');
assert(config.robustness?.annualBlockBootstrap?.iterations === 1000, 'bootstrap iteration contract mismatch');
assert(config.robustness?.moduleWeightPerturbationPct === 20, 'module-weight sensitivity contract mismatch');

const perfect = [
  { date: '2020-01-01', score: 90, label: 1 },
  { date: '2020-01-08', score: 80, label: 1 },
  { date: '2020-01-15', score: 20, label: 0 },
  { date: '2020-01-22', score: 10, label: 0 }
];
assert(computeAuRoc(perfect) === 1, 'perfect AUROC must equal 1');
assert(computeAveragePrecision(perfect) === 1, 'perfect average precision must equal 1');
assert(computeAuRoc(perfect.map((row) => ({ ...row, score: 50 }))) === 0.5, 'tied AUROC must equal 0.5');
const threshold = evaluateThreshold(perfect, 55);
assert(threshold.confusion.truePositive === 2 && threshold.confusion.trueNegative === 2, 'threshold confusion mismatch');
assert(threshold.recall === 1 && threshold.specificity === 1 && threshold.precision === 1, 'threshold rates mismatch');
const summary = summarizeBinaryTask(perfect, config.thresholds);
assert(summary.thresholds.length === 3 && summary.calibrationDiagnostic.scoreIsProbability === false, 'task summary contract mismatch');
const bootstrap = annualBlockBootstrap(perfect, { iterations: 50, seed: 7, confidenceLevel: 0.95 });
assert(bootstrap.auroc.lower === 1 && bootstrap.auroc.upper === 1, 'perfect annual-block bootstrap AUROC mismatch');

const causalConfig = {
  minimumObservations: 3,
  legacyFloor: { value: 90, risk: 0, label: 'floor' },
  quantileRiskMap: [{ quantile: 0.5, risk: 50, label: 'p50' }]
};
const dxyRows = [
  { date: '2020-01-01', value: 100 },
  { date: '2020-01-02', value: 101 },
  { date: '2020-01-03', value: 102 },
  { date: '2020-01-04', value: 1000 }
];
const causalBeforeOutlier = buildCausalDxyCalibration(dxyRows, '2020-01-03', causalConfig);
assert(causalBeforeOutlier.audit.observations === 3, 'causal calibration must exclude future rows');
assert(causalBeforeOutlier.audit.futureRowsUsed === 0, 'causal calibration futureRowsUsed must stay zero');
assert(causalBeforeOutlier.calibration.points[1].value === 101, 'future outlier must not alter earlier calibration');

const episodes = buildBinaryEpisodes([
  { date: '2019-12-01', value: 0 },
  { date: '2020-01-01', value: 1 },
  { date: '2020-02-01', value: 1 },
  { date: '2020-03-01', value: 0 }
]);
assert(episodes.length === 1, 'binary episode count mismatch');
assert(episodes[0].start === '2020-01-01' && episodes[0].end === '2020-02-29', 'binary episode boundaries mismatch');

for (const marker of [
  "usRecession: 'USRECM'",
  'buildScientificValidation',
  'stressNowcast',
  'earlyWarning6m',
  'thresholdCoverage',
  'labelCaveat',
  'dataVintageAudit',
  'annualBlockBootstrap',
  'moduleWeightSensitivity'
]) {
  assert(auditSource.includes(marker), `audit script missing marker: ${marker}`);
}
for (const marker of ['computeAuRoc', 'computeAveragePrecision', 'falseAlarmsPerYear', 'expectedCalibrationError']) {
  assert(metricsSource.includes(marker), `validation metrics missing marker: ${marker}`);
}
assert(!dailySource.includes('main-score-validation.json'), 'scientific validation must not enter Daily runtime');
assert(!dailySource.includes('USRECM'), 'USRECM outcome label must not enter Daily runtime');

console.log('[check-main-score-scientific-validation] PASS');
