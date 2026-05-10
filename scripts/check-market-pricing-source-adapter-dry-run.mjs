import fs from 'node:fs';
import { buildDryRunReport, writeDryRunReport } from './market-pricing/source-adapter-dry-run.mjs';

const SCRIPT_PATH = 'scripts/market-pricing/source-adapter-dry-run.mjs';
const REPORT_PATH = 'manual-artifacts/market-pricing/source-adapter-dry-run-latest.json';
const PROTECTED_DATA_PATHS = [
  'data/radar-data.json',
  'data/market-pricing-history.json'
];
const REQUIRED_ASSETS = ['qqq', 'ndx', 'ixic', 'spx'];
const FORBIDDEN_SOURCE_PATTERNS = [
  'fetch(',
  'https.get',
  'http.get',
  'axios',
  'request(',
  'child_process',
  'exec(',
  'spawn(',
  'DEEPSEEK_API_KEY',
  'process.env'
];
const FORBIDDEN_REPORT_KEYS = new Set([
  'close',
  'adjustedclose',
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

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function scanForbiddenKeys(value, path = 'root') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_REPORT_KEYS.has(key.toLowerCase())) {
      errors.push(`${path}.${key} is forbidden in dry-run report`);
    }
    scanForbiddenKeys(child, `${path}.${key}`);
  }
}

function validateStaticScript() {
  assert(fs.existsSync(SCRIPT_PATH), `${SCRIPT_PATH} must exist`);
  const source = readIfExists(SCRIPT_PATH) || '';
  assert(source.includes("const CONTRACT_VERSION = 'v28.0M-7'"), 'dry-run script must declare contract version v28.0M-7');
  for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
    assert(!source.includes(pattern), `dry-run script must not contain ${pattern}`);
  }
  assert(!source.includes('data/radar-data.json'), 'dry-run script must not reference data/radar-data.json');
}

function validateReport(report) {
  assert(isRecord(report), 'report must be an object');
  if (!isRecord(report)) return;

  assertEqual(report.contractVersion, 'v28.0M-7', 'contractVersion');
  assertEqual(report.kind, 'market_pricing_source_adapter_dry_run_report', 'kind');
  assertEqual(report.status, 'dry_run_only', 'status');
  assertEqual(report.networkAllowed, false, 'networkAllowed');
  assertEqual(report.apiCalled, false, 'apiCalled');
  assertEqual(report.secretsRead, false, 'secretsRead');
  assertEqual(report.productionDataWritten, false, 'productionDataWritten');
  assertEqual(report.historyFileModified, false, 'historyFileModified');
  assertEqual(report.calculationPerformed, false, 'calculationPerformed');

  const boundaries = report.boundaries;
  assert(isRecord(boundaries), 'boundaries must be an object');
  if (isRecord(boundaries)) {
    assertEqual(boundaries.dryRunOnly, true, 'boundaries.dryRunOnly');
    assertEqual(boundaries.noFetch, true, 'boundaries.noFetch');
    assertEqual(boundaries.noCalculation, true, 'boundaries.noCalculation');
    assertEqual(boundaries.noProductionWrite, true, 'boundaries.noProductionWrite');
    assertEqual(boundaries.affectsScoring, false, 'boundaries.affectsScoring');
    assertEqual(boundaries.affectsDecisionModel, false, 'boundaries.affectsDecisionModel');
    assertEqual(boundaries.affectsExecutionLock, false, 'boundaries.affectsExecutionLock');
    assertEqual(boundaries.affectsPositionGuidance, false, 'boundaries.affectsPositionGuidance');
  }

  assert(Array.isArray(report.assets), 'assets must be an array');
  const assetMap = new Map(Array.isArray(report.assets) ? report.assets.map((asset) => [asset.assetKey, asset]) : []);
  for (const assetKey of REQUIRED_ASSETS) {
    assert(assetMap.has(assetKey), `assets must include ${assetKey}`);
    const asset = assetMap.get(assetKey);
    assertEqual(asset?.recordsProduced, 0, `assets.${assetKey}.recordsProduced`);
    assertEqual(asset?.hasAtLeast60Weeks, false, `assets.${assetKey}.hasAtLeast60Weeks`);
  }
  assertEqual(assetMap.get('spx')?.candidateRole, 'fallback_candidate_only', 'assets.spx.candidateRole');

  scanForbiddenKeys(report);
}

function main() {
  validateStaticScript();

  const before = new Map(PROTECTED_DATA_PATHS.map((filePath) => [filePath, readIfExists(filePath)]));
  const dryRunReport = buildDryRunReport('2026-01-01T00:00:00.000Z');
  validateReport(dryRunReport);

  writeDryRunReport(REPORT_PATH);
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  validateReport(report);

  for (const filePath of PROTECTED_DATA_PATHS) {
    assertEqual(readIfExists(filePath), before.get(filePath), `${filePath} must not change`);
  }

  if (errors.length > 0) {
    console.error('Market pricing source adapter dry-run: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Market pricing source adapter dry-run: PASS');
}

main();
