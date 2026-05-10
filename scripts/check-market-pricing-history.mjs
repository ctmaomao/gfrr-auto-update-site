import fs from 'node:fs';

const CONTRACT_PATH = 'data/market-pricing-history.json';
const EXPECTED_SCHEMA_VERSION = 'v28.0M-market-pricing-history-1';
const REQUIRED_ASSETS = ['qqq', 'ndx', 'ixic', 'spx'];
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

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertEqual(actual, expected, message) {
  assert(Object.is(actual, expected), `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
      errors.push(`${path}.${key} is forbidden in the scaffold contract`);
    }
    scanForbiddenKeys(child, `${path}.${key}`);
  }
}

function validateAsset(key, asset) {
  assert(isRecord(asset), `assets.${key} must be an object`);
  if (!isRecord(asset)) return;

  assert(typeof asset.symbol === 'string' && asset.symbol.length > 0, `assets.${key}.symbol must be a non-empty string`);
  assert(hasChineseText(asset.labelZh), `assets.${key}.labelZh must be Chinese/user-readable`);
  assertEqual(asset.frequency, 'weekly', `assets.${key}.frequency`);
  assert(Array.isArray(asset.records), `assets.${key}.records must be an array`);
  if (Array.isArray(asset.records)) {
    assertEqual(asset.records.length, 0, `assets.${key}.records must remain empty in scaffold version`);
  }

  const coverage = asset.coverage;
  assert(isRecord(coverage), `assets.${key}.coverage must be an object`);
  if (isRecord(coverage)) {
    assertEqual(coverage.weeklyRows, 0, `assets.${key}.coverage.weeklyRows`);
    assertEqual(coverage.hasAtLeast60Weeks, false, `assets.${key}.coverage.hasAtLeast60Weeks`);
    assertEqual(coverage.oldestDate, null, `assets.${key}.coverage.oldestDate`);
    assertEqual(coverage.latestDate, null, `assets.${key}.coverage.latestDate`);
  }
}

function validateBoundaries(boundaries) {
  assert(isRecord(boundaries), 'boundaries must be an object');
  if (!isRecord(boundaries)) return;

  assertEqual(boundaries.scaffoldOnly, true, 'boundaries.scaffoldOnly');
  assertEqual(boundaries.noFetch, true, 'boundaries.noFetch');
  assertEqual(boundaries.noCalculation, true, 'boundaries.noCalculation');
  assertEqual(boundaries.displayOnly, true, 'boundaries.displayOnly');
  assertEqual(boundaries.notInvestmentAdvice, true, 'boundaries.notInvestmentAdvice');
  assertEqual(boundaries.affectsScoring, false, 'boundaries.affectsScoring');
  assertEqual(boundaries.affectsDecisionModel, false, 'boundaries.affectsDecisionModel');
  assertEqual(boundaries.affectsExecutionLock, false, 'boundaries.affectsExecutionLock');
  assertEqual(boundaries.affectsPositionGuidance, false, 'boundaries.affectsPositionGuidance');
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  } catch (error) {
    console.error(`Market pricing history scaffold: FAIL`);
    console.error(`- Unable to read ${CONTRACT_PATH}: ${error.message}`);
    process.exit(1);
  }

  assert(isRecord(data), 'root must be an object');
  assertEqual(data.schemaVersion, EXPECTED_SCHEMA_VERSION, 'schemaVersion');
  assertEqual(data.status, 'waiting_for_history', 'status');
  assertEqual(data.sourceMode, 'scaffold_only', 'sourceMode');
  validateBoundaries(data.boundaries);

  assert(isRecord(data.assets), 'assets must be an object');
  if (isRecord(data.assets)) {
    for (const assetKey of REQUIRED_ASSETS) {
      assert(Object.hasOwn(data.assets, assetKey), `assets.${assetKey} is required`);
      validateAsset(assetKey, data.assets[assetKey]);
    }

    const spx = data.assets.spx;
    if (isRecord(spx)) {
      assertEqual(spx.status, 'fallback_candidate_only', 'assets.spx.status');
      assert(spx.priority > data.assets.qqq?.priority, 'assets.spx must rank after qqq');
      assert(spx.priority > data.assets.ndx?.priority, 'assets.spx must rank after ndx');
      assert(spx.priority > data.assets.ixic?.priority, 'assets.spx must rank after ixic');
    }
  }

  scanForbiddenKeys(data);

  if (errors.length > 0) {
    console.error('Market pricing history scaffold: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Market pricing history scaffold: PASS');
}

main();
