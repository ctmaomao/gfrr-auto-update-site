import { readJson } from './lib/check-script-helpers.mjs';

const ROOT = process.cwd();
const HISTORY_PATH = 'data/market-pricing-history.json';
const METRICS_PATH = 'data/market-pricing-metrics.json';
const WINDOW_SIZE = 60;

// Ignore list is intentionally empty: M-91 covers the complete committed
// multi-asset Market Pricing schema, so every known asset slot is asserted.
const CHECKER_IGNORE_LIST = [];

const REQUIRED_HISTORY_STATUSES = {
  qqq: 'active',
  ndx: 'history_active_display_only',
  ixic: 'history_active_display_only',
  spx: 'fallback_candidate_only'
};

const REQUIRED_METRIC_ASSETS = ['qqq', 'ndx', 'ixic'];
const AUXILIARY_LABELS = {
  ndx: '纳斯达克 100 — 横向对照',
  ixic: '纳斯达克综合指数 — 广度参照'
};

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

function assertRecordsShape(records, label) {
  assert(Array.isArray(records), `${label}.records must be an array`);
  if (!Array.isArray(records)) return;

  const seenDates = new Set();
  const seenWeeks = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    assert(isRecord(record), `${label}.records[${index}] must be an object`);
    if (!isRecord(record)) continue;

    assert(isIsoDate(record.date), `${label}.records[${index}].date must be YYYY-MM-DD`);
    assert(isIsoWeek(record.isoWeek), `${label}.records[${index}].isoWeek must be YYYY-Www`);
    assert(Number.isFinite(record.close) && record.close > 0, `${label}.records[${index}].close must be finite positive`);
    assert(typeof record.sourceFile === 'string' && record.sourceFile.length > 0, `${label}.records[${index}].sourceFile must be non-empty`);
    assert(typeof record.sourceVendor === 'string' && record.sourceVendor.length > 0, `${label}.records[${index}].sourceVendor must be non-empty`);

    if (index > 0) {
      assert(record.date > records[index - 1].date, `${label}.records must be strictly date-ascending`);
    }
    assert(!seenDates.has(record.date), `${label}.records duplicate date ${record.date}`);
    assert(!seenWeeks.has(record.isoWeek), `${label}.records duplicate isoWeek ${record.isoWeek}`);
    seenDates.add(record.date);
    seenWeeks.add(record.isoWeek);
  }
}

function assertCoverage(asset, label) {
  const records = Array.isArray(asset.records) ? asset.records : [];
  const coverage = asset.coverage || {};
  assertEqual(coverage.weeklyRows, records.length, `${label}.coverage.weeklyRows`);
  assertEqual(coverage.hasAtLeast60Weeks, records.length >= WINDOW_SIZE, `${label}.coverage.hasAtLeast60Weeks`);
  assertEqual(coverage.oldestDate, records[0]?.date || null, `${label}.coverage.oldestDate`);
  assertEqual(coverage.latestDate, records.at(-1)?.date || null, `${label}.coverage.latestDate`);
}

function assertMetricRecords(records, label) {
  assert(Array.isArray(records), `${label}.records must be an array`);
  if (!Array.isArray(records)) return;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    assert(isRecord(record), `${label}.records[${index}] must be an object`);
    if (!isRecord(record)) continue;
    assert(isIsoDate(record.date), `${label}.records[${index}].date must be YYYY-MM-DD`);
    assert(isIsoWeek(record.isoWeek), `${label}.records[${index}].isoWeek must be YYYY-Www`);
    for (const key of ['close', 'ma60', 'stdDev60', 'zScore']) {
      assert(Number.isFinite(record[key]), `${label}.records[${index}].${key} must be finite`);
    }
  }
}

function assertMetricAsset(metrics, assetKey) {
  const asset = metrics.assets?.[assetKey];
  assert(isRecord(asset), `metrics.assets.${assetKey} must be an object`);
  if (!isRecord(asset)) return;

  const expectedRole = assetKey === 'qqq'
    ? 'primary'
    : assetKey === 'ndx' ? 'auxiliary_comparison' : 'auxiliary_breadth_reference';
  assertEqual(asset.role, expectedRole, `metrics.assets.${assetKey}.role`);
  assertEqual(asset.windowSize, WINDOW_SIZE, `metrics.assets.${assetKey}.windowSize`);
  assertEqual(asset.stdDevFormula, 'sample', `metrics.assets.${assetKey}.stdDevFormula`);
  assertEqual(asset.stdDevDivisor, 'N-1', `metrics.assets.${assetKey}.stdDevDivisor`);
  assertEqual(asset.zScoreCapped, false, `metrics.assets.${assetKey}.zScoreCapped`);
  assertEqual(asset.status, 'metrics_active_display_only', `metrics.assets.${assetKey}.status`);
  assertMetricRecords(asset.records, `metrics.assets.${assetKey}`);
  assertEqual(asset.metricsRecordsCount, asset.records.length, `metrics.assets.${assetKey}.metricsRecordsCount`);
  assertEqual(asset.sourceRecordsCount - WINDOW_SIZE + 1, asset.metricsRecordsCount, `metrics.assets.${assetKey} rolling count`);

  if (assetKey !== 'qqq') {
    assertEqual(asset.displayLabelZh, AUXILIARY_LABELS[assetKey], `metrics.assets.${assetKey}.displayLabelZh`);
  }
}

const history = readJson(HISTORY_PATH);
const metrics = readJson(METRICS_PATH);

assertEqual(CHECKER_IGNORE_LIST.length, 0, 'checker ignore list length');
assertEqual(history.status, 'has_history', 'history.status');
assert(isRecord(history.assets), 'history.assets must be an object');

for (const [assetKey, expectedStatus] of Object.entries(REQUIRED_HISTORY_STATUSES)) {
  const asset = history.assets?.[assetKey];
  assert(isRecord(asset), `history.assets.${assetKey} must exist`);
  if (!isRecord(asset)) continue;
  assertEqual(asset.status, expectedStatus, `history.assets.${assetKey}.status`);
  assertCoverage(asset, `history.assets.${assetKey}`);
  if (assetKey === 'spx') {
    assertEqual(Array.isArray(asset.records) ? asset.records.length : null, 0, 'history.assets.spx.records.length');
    continue;
  }
  assertRecordsShape(asset.records, `history.assets.${assetKey}`);
  assert(asset.records.length >= WINDOW_SIZE, `history.assets.${assetKey}.records must have at least ${WINDOW_SIZE} rows`);
}

assertEqual(metrics.asset, 'qqq', 'metrics.asset top-level backward-compatible primary');
assertEqual(metrics.primaryAsset, 'qqq', 'metrics.primaryAsset');
assert(Array.isArray(metrics.auxiliaryAssets), 'metrics.auxiliaryAssets must be an array');
assert(metrics.auxiliaryAssets.includes('ndx'), 'metrics.auxiliaryAssets must include ndx');
assert(metrics.auxiliaryAssets.includes('ixic'), 'metrics.auxiliaryAssets must include ixic');
assert(isRecord(metrics.assets), 'metrics.assets must be an object');
assert(!metrics.assets?.spx, 'metrics.assets.spx must not exist');

for (const assetKey of REQUIRED_METRIC_ASSETS) {
  assertMetricAsset(metrics, assetKey);
}

assert(
  JSON.stringify(metrics.assets?.qqq?.records) === JSON.stringify(metrics.records),
  'metrics.assets.qqq.records must mirror top-level QQQ records for backward compatibility'
);
assertEqual(metrics.sourceRecordsCount, metrics.assets?.qqq?.sourceRecordsCount, 'top-level sourceRecordsCount mirrors qqq');
assertEqual(metrics.metricsRecordsCount, metrics.assets?.qqq?.metricsRecordsCount, 'top-level metricsRecordsCount mirrors qqq');
assertEqual(metrics.latestMetricDate, metrics.assets?.qqq?.latestMetricDate, 'top-level latestMetricDate mirrors qqq');

if (errors.length) {
  console.error('Market pricing multi-asset check: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Market pricing multi-asset check: PASS');
