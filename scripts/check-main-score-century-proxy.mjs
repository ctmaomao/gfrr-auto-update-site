#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildCenturyProxyRows, causalMidrankPercentile } from './main-score/century-proxy.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = JSON.parse(fs.readFileSync(path.resolve('config/main-score-century-proxy.json'), 'utf8'));
const dailySource = fs.readFileSync(path.resolve('scripts/run-daily-pipeline.mjs'), 'utf8');
const auditSource = fs.readFileSync(path.resolve('scripts/audit-main-score-century-proxy.mjs'), 'utf8');
const validationDoc = fs.readFileSync(path.resolve('docs/MAIN_SCORE_SCIENTIFIC_VALIDATION.md'), 'utf8');
const referenceResults = JSON.parse(fs.readFileSync(
  path.resolve('docs/fixtures/main-score-validation/reference-results-2026-08-02.json'),
  'utf8'
));

assert(config.auditOnly === true, 'century proxy must remain audit-only');
assert(config.productionFormulaReplay === false, 'century proxy must not claim production formula replay');
assert(config.eligibleForProductionScore === false, 'century proxy must remain ineligible for production score');
assert(config.targetStartDate === '1926-01-01', 'century target start mismatch');
assert(config.model.informationLagMonths === 1, 'century proxy must retain a conservative one-month information lag');
assert(Object.values(config.model.components).reduce((sum, item) => sum + item.weight, 0) === 1, 'proxy weights must sum to one');
assert(causalMidrankPercentile([1, 2, 3, 1000], 3, 3) === 62.5, 'causal midrank percentile mismatch');

const monthly = (values) => values.map((value, index) => ({
  date: `${2000 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`,
  value
}));
const values = Array.from({ length: 84 }, (_, index) => 100 + index);
const synthetic = {
  baa: monthly(values.map((value) => value / 20 + 2)),
  aaa: monthly(values.map((value) => value / 20 + 1)),
  industrialProduction: monthly(values),
  recessionLabel: monthly(values.map(() => 0))
};
const rows = buildCenturyProxyRows(synthetic, config, '2005-01-01', '2006-12-01');
assert(rows.length > 0, 'synthetic century proxy should produce rows after minimum history');
assert(rows.every((row) => row.audit.causal && row.audit.futureRowsUsed === 0), 'century proxy must remain causal');
assert(referenceResults.auditOnly === true && referenceResults.changesProductionScore === false, 'reference results boundary mismatch');
assert(referenceResults.centuryProxy?.productionFormulaReplay === false, 'reference results must reject century production replay claim');
assert(referenceResults.centuryProxy?.eligibleForProductionScore === false, 'reference results must remain production-ineligible');
assert(referenceResults.modernFormulaReplay?.earlyWarning6m?.threshold55Recall === 0, 'reference results must preserve failed modern early-warning finding');
assert(referenceResults.centuryProxy?.coverage?.years >= 100, 'reference results must meet century coverage target');
assert(referenceResults.centuryProxy?.stressNowcast?.auroc === 0.779765, 'century nowcast AUROC reference drift');
assert(referenceResults.centuryProxy?.stressNowcast?.averagePrecision === 0.527447, 'century nowcast AP reference drift');
assert(referenceResults.centuryProxy?.earlyWarning6m?.auroc === 0.497025, 'century early-warning AUROC reference drift');
assert(referenceResults.centuryProxy?.earlyWarning6m?.averagePrecision === 0.090518, 'century early-warning AP reference drift');
assert(referenceResults.centuryProxy?.stressNowcast?.activeStressEpisodeHits === 11, 'century active-stress event result drift');
assert(referenceResults.centuryProxy?.earlyWarning6m?.preOnsetEpisodeHits === 3, 'century pre-onset event result drift');

for (const marker of [
  'century_scale_proxy_validation_not_historical_reconstruction',
  'productionFormulaReplay: false',
  'alfredVintageApplied: false',
  'rawSeriesCommitted: false',
  'rawSeriesWrittenToArtifact: false'
]) {
  assert(auditSource.includes(marker), `century audit missing marker: ${marker}`);
}
assert(!dailySource.includes('main-score-century-proxy.json'), 'century proxy config must not enter Daily runtime');
assert(!dailySource.includes('century-proxy.mjs'), 'century proxy module must not enter Daily runtime');
for (const marker of [
  '不是危机概率',
  '不能提前六个月预警',
  'productionFormulaReplay=false',
  'ALFRED point-in-time',
  'AUROC 0.780,AP 0.527',
  'AUROC 0.497,AP 0.091',
  '当期压力命中 11 次',
  '提前命中 3/16 个 episode'
]) {
  assert(validationDoc.includes(marker), `validation doc missing semantic boundary: ${marker}`);
}

console.log('[check-main-score-century-proxy] PASS');
