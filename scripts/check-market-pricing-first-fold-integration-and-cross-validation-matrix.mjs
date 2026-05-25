import fs from 'node:fs';

import { buildCrossValidationMatrix } from './modules/buildCrossValidationMatrix.js';

const RENDER_PATH = 'scripts/modules/renderMacroOverview.js';
const HELPER_PATH = 'scripts/modules/buildCrossValidationMatrix.js';
const METRICS_PATH = 'data/market-pricing-metrics.json';
const PROTECTED_PATHS = [
  'data/market-pricing-history.json',
  METRICS_PATH,
  'data/radar-data.json',
  'data/world-order-stress.json',
];
const REQUIRED_NARRATIVE_IDS = [
  'energy_shock',
  'stagflation_pressure',
  'risk_asset_mismatch',
  'overheat_confirmation',
  'credit_spread_warning',
  'liquidity_tightening',
  'world_order_pressure_crossing',
];
const VALID_ASSESSMENTS = new Set([
  'strong_confirmation',
  'partial_confirmation',
  'insufficient_data',
  'contradiction',
]);
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function snapshotFiles(paths) {
  return new Map(paths.map((filePath) => [filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null]));
}

function assertUnchanged(before) {
  for (const [filePath, beforeBytes] of before.entries()) {
    const afterBytes = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
    const same = beforeBytes === null
      ? afterBytes === null
      : afterBytes !== null && Buffer.compare(beforeBytes, afterBytes) === 0;
    assert(same, `${filePath} must be unchanged by first-fold integration check`);
  }
}

function formatSigned(value, digits = 2) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function assertIsoDateNotFuture(dateValue, label) {
  assert(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(dateValue), `${label} must be YYYY-MM-DD, got ${JSON.stringify(dateValue)}`);
  const parsed = Date.parse(`${dateValue}T00:00:00.000Z`);
  assert(Number.isFinite(parsed), `${label} must parse as a valid Date, got ${JSON.stringify(dateValue)}`);
  assert(parsed <= Date.now() + 7 * 24 * 60 * 60 * 1000, `${label} must not be in the future, got ${JSON.stringify(dateValue)}`);
}

function getLatestMetric(metricsData) {
  const records = Array.isArray(metricsData?.records) ? metricsData.records : [];
  return records[records.length - 1] || null;
}

function extractFunctionSource(source, functionName) {
  const idx = source.indexOf(`function ${functionName}`);
  if (idx < 0) return '';
  const brace = source.indexOf('{', idx);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(idx, i + 1);
    }
  }
  return '';
}

function assertBuilderUsesMetrics(renderSource, functionName) {
  const fn = extractFunctionSource(renderSource, functionName);
  assert(fn, `${functionName} must exist`);
  assert(fn.includes('marketPricingMetricsData'), `${functionName} must accept or pass marketPricingMetricsData`);
  assert(
    fn.includes('getMarketPricingMetricContext(marketPricingMetricsData)') || fn.includes('buildCrossValidationMatrix(data, worldOrderStressData, marketPricingMetricsData)'),
    `${functionName} must consume metrics records through a null-safe helper`
  );
  assert(fn.includes('marketMetric ?') || fn.includes('marketPricingMetricsData = null'), `${functionName} must keep null-safe fallback path`);
}

function assertMatrixShape(matrix) {
  assert(matrix && typeof matrix === 'object', 'matrix must be an object');
  assert(Array.isArray(matrix.narratives), 'matrix.narratives must be an array');
  assert(matrix.narratives.length === 7, `matrix.narratives length must be 7, got ${matrix.narratives.length}`);
  const ids = new Set(matrix.narratives.map((item) => item.id));
  for (const id of REQUIRED_NARRATIVE_IDS) assert(ids.has(id), `missing narrative id ${id}`);
  for (const narrative of matrix.narratives) {
    assert(typeof narrative.id === 'string' && narrative.id, 'narrative.id must be non-empty');
    assert(typeof narrative.label === 'string' && narrative.label, `${narrative.id} label must be non-empty`);
    assert(Array.isArray(narrative.supportingEvidence), `${narrative.id} supportingEvidence must be array`);
    assert(Array.isArray(narrative.missingEvidence), `${narrative.id} missingEvidence must be array`);
    assert(Array.isArray(narrative.contradictingEvidence), `${narrative.id} contradictingEvidence must be array`);
    assert(VALID_ASSESSMENTS.has(narrative.assessment), `${narrative.id} assessment invalid: ${narrative.assessment}`);
    assert(typeof narrative.interpretation === 'string' && narrative.interpretation, `${narrative.id} interpretation must be non-empty`);
  }
  assert(Number.isInteger(matrix.consistencyScore) && matrix.consistencyScore >= 0 && matrix.consistencyScore <= 100, 'consistencyScore must be integer 0-100');
  assert(typeof matrix.consistencyState === 'string' && matrix.consistencyState, 'consistencyState must be non-empty string');
  assert(typeof matrix.oneLineSummary === 'string' && matrix.oneLineSummary, 'oneLineSummary must be non-empty string');
}

const before = snapshotFiles(PROTECTED_PATHS);
const renderSource = readText(RENDER_PATH);
const helperSource = readText(HELPER_PATH);

for (const functionName of ['buildTodayJudgment', 'buildSignalLayers', 'buildRiskEngines', 'buildCrossValidation']) {
assertBuilderUsesMetrics(renderSource, functionName);
}
assert(renderSource.includes('buildCrossValidationMatrix'), 'renderMacroOverview must import/use buildCrossValidationMatrix');
// PR 2b: cross-validation renders mock consistency-block (consistency-bar + consistency-value + consistency-detail).
// Detailed supporting/contradicting evidence is no longer rendered per mock; matrix algorithm still produces them (see matrix shape checks below).
assert(renderSource.includes('appendConsistencyBlock'), 'renderMacroOverview must call appendConsistencyBlock helper (PR 2b mock-compliant cross-validation)');
assert(renderSource.includes('consistency-bar'), 'renderMacroOverview must render mock consistency-bar (PR 2b)');
assert(renderSource.includes('consistency-value'), 'renderMacroOverview must render mock consistency-value (PR 2b)');
assert(!renderSource.includes('editorial-consistency-score-display'), 'renderMacroOverview must not retain legacy editorial-consistency-score-display (replaced by mock consistency-block in PR 2b)');
assert(!renderSource.includes('appendEditorialValidationCard'), 'renderMacroOverview must not retain legacy appendEditorialValidationCard (replaced by appendConsistencyBlock in PR 2b)');

assert(helperSource.includes('export function buildCrossValidationMatrix'), 'helper must export buildCrossValidationMatrix');
assert(helperSource.includes("evidence('qqq_zscore', formatSigned(metric.zScore)"), 'helper must derive qqq_zscore evidence from latest metrics zScore');
const forbiddenNetwork = [
  ['f', 'e', 't', 'c', 'h', '('].join(''),
  ['h', 't', 't', 'p'].join(''),
  'axios',
  ['p', 'r', 'o', 'c', 'e', 's', 's', '.', 'e', 'n', 'v'].join(''),
];
for (const marker of forbiddenNetwork) {
  assert(!helperSource.includes(marker), `helper must not contain network/env marker ${marker}`);
}

const testData = {
  score: 55,
  displayInputsBaseline: { brent: 110, us10y: 4.5, dxy: 106, hyOas: 2.9, vix: 18 },
  modules: { inflation: 65 },
  macroDrivers: {
    consumer: { umichSentiment: 55 },
    credit: { hyOas: 2.9, igOas: 0.8, igHyRatio: 0.3 },
    fedLiquidity: { onRrp: 100, walcl4wChange: 0 },
    curve: { t10y2y: 0.6 },
  },
  divergenceLayer: {
    checks: [
      { key: 'energy_pricing_gap_watch', status: 'stress', score: 72, summaryZh: '能源验证层提示压力。' },
      { key: 'risk_complacency_watch', status: 'stress', score: 62, summaryZh: '风险资产定价存在错配。' },
      { key: 'rates_vs_risk_assets', status: 'normal', score: 18, summaryZh: '利率与风险资产暂未明显背离。' },
    ],
  },
};
const testWorld = {
  score: 55,
  freshness: 'fresh',
  confidence: 0.6,
  marketConfirmationInput: { source: 'worker-generated-preview' },
  externalSources: {},
};
const syntheticClose = 100;
const syntheticMa60 = 90;
const syntheticStdDev60 = 5;
const testMetrics = {
  records: [{
    date: '2025-01-03',
    isoWeek: '2025-W01',
    close: syntheticClose,
    ma60: syntheticMa60,
    stdDev60: syntheticStdDev60,
    zScore: (syntheticClose - syntheticMa60) / syntheticStdDev60,
  }],
};
const testMatrix = buildCrossValidationMatrix(testData, testWorld, testMetrics);
assertMatrixShape(testMatrix);

const radarData = readJson('data/radar-data.json');
const worldOrder = readJson('data/world-order-stress.json');
const metrics = readJson(METRICS_PATH);
const latestMetric = getLatestMetric(metrics);
assert(latestMetric, `${METRICS_PATH} must contain at least one metrics record`);
assertIsoDateNotFuture(latestMetric?.date, 'latest metrics record date');
assert(metrics.latestMetricDate === latestMetric?.date, `metrics.latestMetricDate must match latest record date: expected ${JSON.stringify(latestMetric?.date)}, got ${JSON.stringify(metrics.latestMetricDate)}`);
const latestZScore = Number(latestMetric?.zScore);
assert(Number.isFinite(latestZScore), `latest metrics zScore must be finite, got ${JSON.stringify(latestMetric?.zScore)}`);
assert(latestZScore >= -10 && latestZScore <= 10, `latest metrics zScore must be within [-10, 10], got ${JSON.stringify(latestMetric?.zScore)}`);
const expectedQqqZScoreEvidenceValue = Number.isFinite(latestZScore) ? formatSigned(latestZScore) : null;
const realMatrix = buildCrossValidationMatrix(radarData, worldOrder, metrics);
assertMatrixShape(realMatrix);
const overheat = realMatrix.narratives.find((item) => item.id === 'overheat_confirmation');
assert(overheat?.assessment === 'strong_confirmation', `current overheat_confirmation must be strong_confirmation, got ${overheat?.assessment}`);
const qqqZScoreEvidence = overheat?.supportingEvidence?.find((item) => item.source === 'qqq_zscore');
assert(qqqZScoreEvidence, 'overheat_confirmation must include QQQ z-score supporting evidence');
assert(
  qqqZScoreEvidence?.value === expectedQqqZScoreEvidenceValue,
  `overheat_confirmation QQQ z-score evidence must match latest metrics zScore: expected ${JSON.stringify(expectedQqqZScoreEvidenceValue)}, got ${JSON.stringify(qqqZScoreEvidence?.value)}`
);

assertUnchanged(before);

if (errors.length) {
  console.error('Market pricing first-fold integration and cross-validation matrix: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Market pricing first-fold integration and cross-validation matrix: PASS');
console.log(`narratives=${realMatrix.narratives.length}`);
console.log(`consistencyScore=${realMatrix.consistencyScore}`);
console.log(`consistencyState=${realMatrix.consistencyState}`);
console.log(`oneLineSummary=${realMatrix.oneLineSummary}`);
console.log(`assessments=${realMatrix.narratives.map((item) => `${item.id}:${item.assessment}`).join(', ')}`);
