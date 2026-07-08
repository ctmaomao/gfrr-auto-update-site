import { readJson } from './lib/check-script-helpers.mjs';
// check-market-pricing-metrics-schema.mjs — direct guard for the production sidecar
// consumed by the homepage market-temperature and cross-validation renderers.

const ROOT = process.cwd();
const METRICS_PATH = 'data/market-pricing-metrics.json';
const EXPECTED_CONTRACT_VERSION = 'v28.0M-91-multi-asset-metrics-1';
const WINDOW_SIZE = 60;
const REQUIRED_ASSETS = ['qqq', 'ndx', 'ixic'];
const EXPECTED_ASSET_META = {
  qqq: {
    symbol: 'QQQ',
    role: 'primary',
    historyStatus: 'active'
  },
  ndx: {
    symbol: 'NDX',
    role: 'auxiliary_comparison',
    historyStatus: 'history_active_display_only'
  },
  ixic: {
    symbol: 'IXIC',
    role: 'auxiliary_breadth_reference',
    historyStatus: 'history_active_display_only'
  }
};
const REQUIRED_TRUE_BOUNDARIES = [
  'noFetch',
  'noFrontendChange',
  'noHistoryWrite',
  'noScoringChange',
  'noDecisionChange',
  'notInvestmentAdvice',
  'calculationLayerActive',
  'displayLayerActive',
  'multiAssetAuxiliaryDisplayOnly'
];
const REQUIRED_FALSE_BOUNDARIES = [
  'affectsScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance'
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertEqual(actual, expected, message) {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function isIsoWeek(value) {
  return typeof value === 'string' && /^\d{4}-W\d{2}$/u.test(value);
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function hasChineseText(value) {
  return typeof value === 'string' && /[\u4e00-\u9fff]/u.test(value);
}

function rangeFor(records, key) {
  const values = records.map((record) => record[key]).filter(Number.isFinite);
  if (!values.length) return { min: null, max: null };
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function assertRange(actual, expected, label) {
  assert(isRecord(actual), `${label} must be an object`);
  if (!isRecord(actual)) return;
  assertEqual(actual.min, expected.min, `${label}.min`);
  assertEqual(actual.max, expected.max, `${label}.max`);
}

function assertBoundaries(boundaries, label) {
  assert(isRecord(boundaries), `${label}.boundaries must be an object`);
  if (!isRecord(boundaries)) return;
  for (const key of REQUIRED_TRUE_BOUNDARIES) {
    assertEqual(boundaries[key], true, `${label}.boundaries.${key}`);
  }
  for (const key of REQUIRED_FALSE_BOUNDARIES) {
    assertEqual(boundaries[key], false, `${label}.boundaries.${key}`);
  }
}

function assertRecords(records, label) {
  assert(Array.isArray(records), `${label}.records must be an array`);
  if (!Array.isArray(records)) return;
  assert(records.length > 0, `${label}.records must not be empty`);

  const seenDates = new Set();
  const seenWeeks = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    assert(isRecord(record), `${label}.records[${index}] must be an object`);
    if (!isRecord(record)) continue;

    assert(isIsoDate(record.date), `${label}.records[${index}].date must be YYYY-MM-DD`);
    assert(isIsoWeek(record.isoWeek), `${label}.records[${index}].isoWeek must be YYYY-Www`);
    for (const key of ['close', 'ma60', 'stdDev60', 'zScore']) {
      assert(Number.isFinite(record[key]), `${label}.records[${index}].${key} must be finite`);
    }
    assert(record.close > 0, `${label}.records[${index}].close must be positive`);
    assert(record.ma60 > 0, `${label}.records[${index}].ma60 must be positive`);
    assert(record.stdDev60 >= 0, `${label}.records[${index}].stdDev60 must be >= 0`);

    if (index > 0) {
      assert(record.date > records[index - 1].date, `${label}.records must be strictly date-ascending`);
    }
    assert(!seenDates.has(record.date), `${label}.records duplicate date ${record.date}`);
    assert(!seenWeeks.has(record.isoWeek), `${label}.records duplicate isoWeek ${record.isoWeek}`);
    seenDates.add(record.date);
    seenWeeks.add(record.isoWeek);
  }
}

function assertAsset(metrics, assetKey) {
  const asset = metrics.assets?.[assetKey];
  const expected = EXPECTED_ASSET_META[assetKey];
  const label = `assets.${assetKey}`;

  assert(isRecord(asset), `${label} must be an object`);
  if (!isRecord(asset)) return;

  assertEqual(asset.asset, assetKey, `${label}.asset`);
  assertEqual(asset.symbol, expected.symbol, `${label}.symbol`);
  assertEqual(asset.role, expected.role, `${label}.role`);
  assertEqual(asset.status, 'metrics_active_display_only', `${label}.status`);
  assertEqual(asset.historyStatus, expected.historyStatus, `${label}.historyStatus`);
  assert(hasChineseText(asset.labelZh), `${label}.labelZh must be Chinese/user-readable`);
  assert(typeof asset.displayLabelZh === 'string' && asset.displayLabelZh.length > 0, `${label}.displayLabelZh must be non-empty`);
  assertEqual(asset.windowSize, WINDOW_SIZE, `${label}.windowSize`);
  assertEqual(asset.stdDevFormula, 'sample', `${label}.stdDevFormula`);
  assertEqual(asset.stdDevDivisor, 'N-1', `${label}.stdDevDivisor`);
  assertEqual(asset.zScoreCapped, false, `${label}.zScoreCapped`);
  assert(Number.isInteger(asset.sourceRecordsCount) && asset.sourceRecordsCount >= WINDOW_SIZE, `${label}.sourceRecordsCount must be >= ${WINDOW_SIZE}`);
  assert(Number.isInteger(asset.metricsRecordsCount) && asset.metricsRecordsCount > 0, `${label}.metricsRecordsCount must be positive`);
  assertEqual(asset.sourceRecordsCount - WINDOW_SIZE + 1, asset.metricsRecordsCount, `${label} rolling record count`);
  assertBoundaries(asset.boundaries, label);
  assertRecords(asset.records, label);

  if (Array.isArray(asset.records) && asset.records.length) {
    assertEqual(asset.metricsRecordsCount, asset.records.length, `${label}.metricsRecordsCount vs records.length`);
    assertEqual(asset.earliestMetricDate, asset.records[0].date, `${label}.earliestMetricDate`);
    assertEqual(asset.latestMetricDate, asset.records.at(-1).date, `${label}.latestMetricDate`);
    assertRange(asset.ma60Range, rangeFor(asset.records, 'ma60'), `${label}.ma60Range`);
    assertRange(asset.stdDev60Range, rangeFor(asset.records, 'stdDev60'), `${label}.stdDev60Range`);
    assertRange(asset.zScoreRange, rangeFor(asset.records, 'zScore'), `${label}.zScoreRange`);
  }

  assert(isRecord(asset.progress), `${label}.progress must be an object`);
  if (isRecord(asset.progress)) {
    assertEqual(asset.progress.recordsCollected, asset.sourceRecordsCount, `${label}.progress.recordsCollected`);
    assertEqual(asset.progress.recordsRequired, WINDOW_SIZE, `${label}.progress.recordsRequired`);
    assertEqual(asset.progress.remainingRecords, Math.max(0, WINDOW_SIZE - asset.sourceRecordsCount), `${label}.progress.remainingRecords`);
  }
}

let metrics;
try {
  metrics = readJson(METRICS_PATH);
} catch (error) {
  console.error('Market pricing metrics schema: FAIL');
  console.error(`- Unable to read ${METRICS_PATH}: ${error.message}`);
  process.exit(1);
}

assert(isRecord(metrics), 'root must be an object');
assertEqual(metrics.contractVersion, EXPECTED_CONTRACT_VERSION, 'contractVersion');
assertEqual(metrics.kind, 'market_pricing_metrics_calculation', 'kind');
assert(isIsoTimestamp(metrics.generatedAt), 'generatedAt must be an ISO timestamp');
assertEqual(metrics.sourceHistoryFile, 'data/market-pricing-history.json', 'sourceHistoryFile');
assert(typeof metrics.sourceCommit === 'string' && /^[0-9a-f]{7,40}$/u.test(metrics.sourceCommit), 'sourceCommit must be a git sha prefix');
assertEqual(metrics.asset, 'qqq', 'asset');
assertEqual(metrics.primaryAsset, 'qqq', 'primaryAsset');
assertEqual(JSON.stringify(metrics.auxiliaryAssets), JSON.stringify(['ndx', 'ixic']), 'auxiliaryAssets');
assertEqual(JSON.stringify(metrics.assetOrder), JSON.stringify(REQUIRED_ASSETS), 'assetOrder');
assertEqual(metrics.windowSize, WINDOW_SIZE, 'windowSize');
assertEqual(metrics.stdDevFormula, 'sample', 'stdDevFormula');
assertEqual(metrics.stdDevDivisor, 'N-1', 'stdDevDivisor');
assertEqual(metrics.zScoreCapped, false, 'zScoreCapped');
assert(isRecord(metrics.assets), 'assets must be an object');
assertEqual(JSON.stringify(Object.keys(metrics.assets || {}).sort()), JSON.stringify([...REQUIRED_ASSETS].sort()), 'asset keys');
assertBoundaries(metrics.boundaries, 'root');

for (const assetKey of REQUIRED_ASSETS) {
  assertAsset(metrics, assetKey);
}

assert(
  JSON.stringify(metrics.records) === JSON.stringify(metrics.assets?.qqq?.records),
  'top-level records must mirror assets.qqq.records for backward compatibility'
);
assertEqual(metrics.sourceRecordsCount, metrics.assets?.qqq?.sourceRecordsCount, 'top-level sourceRecordsCount mirrors qqq');
assertEqual(metrics.metricsRecordsCount, metrics.assets?.qqq?.metricsRecordsCount, 'top-level metricsRecordsCount mirrors qqq');
assertEqual(metrics.earliestMetricDate, metrics.assets?.qqq?.earliestMetricDate, 'top-level earliestMetricDate mirrors qqq');
assertEqual(metrics.latestMetricDate, metrics.assets?.qqq?.latestMetricDate, 'top-level latestMetricDate mirrors qqq');
assertRange(metrics.ma60Range, metrics.assets?.qqq?.ma60Range || {}, 'top-level ma60Range mirrors qqq');
assertRange(metrics.stdDev60Range, metrics.assets?.qqq?.stdDev60Range || {}, 'top-level stdDev60Range mirrors qqq');
assertRange(metrics.zScoreRange, metrics.assets?.qqq?.zScoreRange || {}, 'top-level zScoreRange mirrors qqq');

if (errors.length) {
  console.error('Market pricing metrics schema: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Market pricing metrics schema: PASS (${REQUIRED_ASSETS.length} assets, ${metrics.records.length} primary records)`);
