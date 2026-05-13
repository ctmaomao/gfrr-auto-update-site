import fs from 'node:fs';

const CONTRACT_PATH = 'data/market-pricing-history.json';
const EXPECTED_SCHEMA_VERSION = 'v28.0M-market-pricing-history-1';
const REQUIRED_ASSETS = ['qqq', 'ndx', 'ixic', 'spx'];
const REQUIRED_TRUE_BOUNDARIES = [
  'noFetch',
  'noCalculation',
  'displayOnly',
  'notInvestmentAdvice'
];
const REQUIRED_FALSE_AFFECT_BOUNDARIES = [
  'affectsScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance'
];
const FORBIDDEN_KEYS = new Set([
  'ma60',
  'zscore',
  'standarddeviation',
  'upperband',
  'lowerband',
  'temperature',
  'signal',
  'buy',
  'sell',
  'short',
  'inverseetf'
]);

const errors = [];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertEqual(actual, expected, message) {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function hasChineseText(value) {
  return typeof value === 'string' && /[\u4e00-\u9fff]/.test(value);
}

function scanForbiddenKeys(value, path = 'root') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (FORBIDDEN_KEYS.has(normalized)) {
      errors.push(`${path}.${key} is forbidden before the calculation layer`);
    }
    scanForbiddenKeys(child, `${path}.${key}`);
  }
}

function validateSharedBoundaries(boundaries, expectedScaffoldOnly) {
  assert(isRecord(boundaries), 'boundaries must be an object');
  if (!isRecord(boundaries)) return;

  assertEqual(boundaries.scaffoldOnly, expectedScaffoldOnly, 'boundaries.scaffoldOnly');
  for (const key of REQUIRED_TRUE_BOUNDARIES) {
    assertEqual(boundaries[key], true, `boundaries.${key}`);
  }
  for (const key of REQUIRED_FALSE_AFFECT_BOUNDARIES) {
    assertEqual(boundaries[key], false, `boundaries.${key}`);
  }
}

function validateSharedAssetShape(key, asset) {
  assert(isRecord(asset), `assets.${key} must be an object`);
  if (!isRecord(asset)) return;

  assert(typeof asset.symbol === 'string' && asset.symbol.length > 0, `assets.${key}.symbol must be a non-empty string`);
  assert(hasChineseText(asset.labelZh), `assets.${key}.labelZh must be Chinese/user-readable`);
  assertEqual(asset.frequency, 'weekly', `assets.${key}.frequency`);
  assert(Array.isArray(asset.records), `assets.${key}.records must be an array`);
  assert(isRecord(asset.coverage), `assets.${key}.coverage must be an object`);
}

function validateEmptyAsset(key, asset, label) {
  validateSharedAssetShape(key, asset);
  if (!isRecord(asset)) return;

  const records = Array.isArray(asset.records) ? asset.records : [];
  assertEqual(records.length, 0, `${label}: assets.${key}.records.length`);

  const coverage = asset.coverage;
  if (isRecord(coverage)) {
    assertEqual(coverage.weeklyRows, 0, `${label}: assets.${key}.coverage.weeklyRows`);
    assertEqual(coverage.hasAtLeast60Weeks, false, `${label}: assets.${key}.coverage.hasAtLeast60Weeks`);
    assertEqual(coverage.oldestDate, null, `${label}: assets.${key}.coverage.oldestDate`);
    assertEqual(coverage.latestDate, null, `${label}: assets.${key}.coverage.latestDate`);
  }
}

function validateActiveAsset(key, asset) {
  validateSharedAssetShape(key, asset);
  if (!isRecord(asset) || !Array.isArray(asset.records) || !isRecord(asset.coverage)) return;

  const records = asset.records;
  assert(records.length > 0, `assets.${key}.records.length must be greater than 0 when active`);
  assertEqual(records.length, asset.coverage.weeklyRows, `assets.${key}.records.length vs coverage.weeklyRows`);
  assertEqual(asset.coverage.hasAtLeast60Weeks, records.length >= 60, `assets.${key}.coverage.hasAtLeast60Weeks`);

  if (records.length > 0) {
    assertEqual(records[0]?.date, asset.coverage.oldestDate, `assets.${key}.coverage.oldestDate`);
    assertEqual(records.at(-1)?.date, asset.coverage.latestDate, `assets.${key}.coverage.latestDate`);
  }

  assert(isRecord(asset.source), `assets.${key}.source must be an object when active`);
  if (isRecord(asset.source)) {
    assert(typeof asset.source.vendor === 'string' && asset.source.vendor.length > 0, `assets.${key}.source.vendor must be a non-empty string`);
    assert(isIsoTimestamp(asset.source.lastCommittedAt), `assets.${key}.source.lastCommittedAt must be a valid ISO timestamp string`);
    assertEqual(asset.source.committedRecordsCount, records.length, `assets.${key}.source.committedRecordsCount`);
  }
}

function validateWaitingForHistory(data) {
  assertEqual(data.sourceMode, 'scaffold_only', 'sourceMode');
  assertEqual(data.updatedAt, null, 'updatedAt');
  assertEqual(data.generatedAt, null, 'generatedAt');
  validateSharedBoundaries(data.boundaries, true);

  for (const assetKey of REQUIRED_ASSETS) {
    validateEmptyAsset(assetKey, data.assets?.[assetKey], 'waiting_for_history');
  }
}

function validateHasHistory(data) {
  assertEqual(data.sourceMode, 'manual_weekly_input_committed', 'sourceMode');
  assert(isIsoTimestamp(data.updatedAt), 'updatedAt must be a non-null ISO timestamp string');
  assert(isIsoTimestamp(data.generatedAt), 'generatedAt must be a non-null ISO timestamp string');
  validateSharedBoundaries(data.boundaries, false);

  let activeAssetCount = 0;
  for (const assetKey of REQUIRED_ASSETS) {
    const asset = data.assets?.[assetKey];
    if (asset?.status === 'active') {
      activeAssetCount += 1;
      validateActiveAsset(assetKey, asset);
    } else {
      validateEmptyAsset(assetKey, asset, 'has_history inactive asset');
    }
  }

  assert(activeAssetCount > 0, 'has_history state requires at least one active asset with records');
}

function validateSpxOrdering(data) {
  const spx = data.assets?.spx;
  if (isRecord(spx)) {
    assertEqual(spx.status, 'fallback_candidate_only', 'assets.spx.status');
    assert(spx.priority > data.assets.qqq?.priority, 'assets.spx must rank after qqq');
    assert(spx.priority > data.assets.ndx?.priority, 'assets.spx must rank after ndx');
    assert(spx.priority > data.assets.ixic?.priority, 'assets.spx must rank after ixic');
  }
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  } catch (error) {
    console.error('Market pricing history scaffold: FAIL');
    console.error(`- Unable to read ${CONTRACT_PATH}: ${error.message}`);
    process.exit(1);
  }

  assert(isRecord(data), 'root must be an object');
  assertEqual(data.schemaVersion, EXPECTED_SCHEMA_VERSION, 'schemaVersion');
  assert(isRecord(data.assets), 'assets must be an object');
  if (isRecord(data.assets)) {
    for (const assetKey of REQUIRED_ASSETS) {
      assert(Object.hasOwn(data.assets, assetKey), `assets.${assetKey} is required`);
    }
  }

  if (data.status === 'waiting_for_history') {
    validateWaitingForHistory(data);
  } else if (data.status === 'has_history') {
    validateHasHistory(data);
  } else {
    errors.push(`status: expected "waiting_for_history" or "has_history", got ${JSON.stringify(data.status)}`);
  }

  validateSpxOrdering(data);
  scanForbiddenKeys(data);

  if (errors.length > 0) {
    console.error('Market pricing history scaffold: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Market pricing history scaffold: PASS (state=${data.status})`);
}

main();
