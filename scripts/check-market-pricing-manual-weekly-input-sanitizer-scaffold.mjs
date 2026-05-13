import fs from 'node:fs';
import path from 'node:path';
import { buildSanitizationReport } from './market-pricing/manual-weekly-input-sanitizer-scaffold.mjs';

const ROOT = process.cwd();
const M22_DESIGN_FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'manual-weekly-input-sanitizer-design-v28.0M-22.json'
);
const M23_STATE_FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'manual-weekly-input-sanitizer-scaffold-v28.0M-23.json'
);
const SCAFFOLD_SCRIPT_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'manual-weekly-input-sanitizer-scaffold.mjs'
);
const M21_SCRIPT_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'network-open-throttled-scaffold.mjs'
);
const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json',
  'scripts/market-pricing/network-open-throttled-scaffold.mjs'
];
const REQUIRED_FALSE_FLAGS = [
  'sourceApproved',
  'liveFetchApproved',
  'networkAllowed',
  'sourceComplianceReviewed',
  'sourceFormatVerified',
  'symbolMappingVerified',
  'productionDataWriteApproved',
  'historyWriteApproved',
  'marketTemperatureCalculationApproved',
  'readyForProductionWrite',
  'firstRealRecordWriteApproved',
  'apiCalled',
  'secretsRead',
  'productionDataWritten',
  'historyFileModified'
];
const REQUIRED_REJECTION_REASONS = [
  'header_mismatch',
  'date_format_invalid',
  'date_out_of_range',
  'future_date',
  'close_not_numeric',
  'close_out_of_plausibility_bounds'
];
const FORBIDDEN_SOURCE_SUBSTRINGS = [
  'fetch(',
  'http.get',
  'https.get',
  'axios',
  'process.env',
  '--commit',
  '--write-history',
  '--to-data',
  '--activate',
  '--approve'
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function snapshotProtectedFiles() {
  return new Map(
    PROTECTED_FILES.map((relativePath) => {
      const absolutePath = path.join(ROOT, relativePath);
      return [relativePath, fs.existsSync(absolutePath) ? readText(absolutePath) : null];
    })
  );
}

function assertProtectedFilesUnchanged(snapshot, label) {
  for (const [relativePath, before] of snapshot.entries()) {
    const absolutePath = path.join(ROOT, relativePath);
    const after = fs.existsSync(absolutePath) ? readText(absolutePath) : null;
    assert(after === before, `${label}: protected file changed: ${relativePath}`);
  }
}

function assertRequiredFalseFlags(report, label) {
  for (const field of REQUIRED_FALSE_FLAGS) {
    assert(report[field] === false, `${label}: ${field} must remain false`);
  }
}

function assertM22DesignFixture(report) {
  assert(
    report.contractVersion === 'v28.0M-22-manual-weekly-input-sanitizer-design-1',
    'M-22 design fixture: unexpected contractVersion'
  );
  assert(
    report.status === 'manual_weekly_input_sanitizer_design_only_not_implemented',
    'M-22 design fixture: unexpected status'
  );
  assert(
    report.sanitizerImplementationExists === false,
    'M-22 design fixture: sanitizerImplementationExists must remain false'
  );
  assert(
    report.expectedCsvFormat?.exactHeaderRow === 'Date,Close/Last,Volume,Open,High,Low',
    'M-22 design fixture: expected header mismatch'
  );
}

function assertScaffoldSourceBoundary() {
  const source = readText(SCAFFOLD_SCRIPT_PATH);

  for (const pattern of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert(!source.includes(pattern), `scaffold source must not contain ${pattern}`);
  }

  const protectedWritePattern =
    /(fs\.writeFile|fs\.writeFileSync|fs\.promises\.writeFile)\s*\([^)]*data[\\/]/s;
  assert(!protectedWritePattern.test(source), 'scaffold source must not write to data/');
  assert(
    source.includes('manual-artifacts/market-pricing/sanitized-output'),
    'scaffold source must contain sanitized-output path'
  );
  assert(source.includes('Close/Last'), 'scaffold source must handle Close/Last');
  assert(
    source.includes('isoWeek') || source.includes('ISO 8601'),
    'scaffold source must contain ISO week handling'
  );
  assert(source.includes('80'), 'scaffold source must contain min plausibility bound');
  assert(source.includes('1000'), 'scaffold source must contain max plausibility bound');
}

function assertM23StateFixture(report) {
  assert(
    report.contractVersion === 'v28.0M-23-manual-weekly-input-sanitizer-scaffold-1',
    'M-23 fixture: unexpected contractVersion'
  );
  assert(
    report.status === 'manual_weekly_input_sanitizer_scaffold_executable_no_history_write',
    'M-23 fixture: unexpected status'
  );
  assert(report.sanitizerImplementationExists === true, 'M-23 fixture: sanitizerImplementationExists must be true');
  assert(report.sanitizerScaffoldExecutable === true, 'M-23 fixture: sanitizerScaffoldExecutable must be true');
  assert(report.sanitizerCanWriteToHistory === false, 'M-23 fixture: sanitizerCanWriteToHistory must be false');
  assert(
    report.sanitizerOutputContract?.outputBaseDirectory ===
      'manual-artifacts/market-pricing/sanitized-output/',
    'M-23 fixture: output base directory mismatch'
  );
  assert(
    report.sanitizerOutputContract?.outputContainsHistory === false,
    'M-23 fixture: outputContainsHistory must be false'
  );
  assert(
    report.inputContract?.inputCsvHeaderExact === 'Date,Close/Last,Volume,Open,High,Low',
    'M-23 fixture: CSV header mismatch'
  );
  assert(report.validationRules?.minPlausibleClose === 80.0, 'M-23 fixture: min bound must be 80');
  assert(report.validationRules?.maxPlausibleClose === 1000.0, 'M-23 fixture: max bound must be 1000');
  assert(
    String(report.validationRules?.weeklyExtractionMethod || '').includes('last trading day'),
    'M-23 fixture: weekly extraction method must mention last trading day'
  );
  assert(report.boundaries?.noNetworkCall === true, 'M-23 fixture: noNetworkCall must be true');
  assert(report.boundaries?.noWriteToData === true, 'M-23 fixture: noWriteToData must be true');
  assert(
    report.boundaries?.noTemperatureCalculation === true,
    'M-23 fixture: noTemperatureCalculation must be true'
  );
  assertRequiredFalseFlags(report, 'M-23 fixture');
  assert(Array.isArray(report.records), 'M-23 fixture: records must be an array');
  assert(report.records.length === 0, 'M-23 fixture: records must remain empty');

  const catalog = Array.isArray(report.rejectionReasonsCatalog)
    ? report.rejectionReasonsCatalog
    : [];
  for (const reason of REQUIRED_REJECTION_REASONS) {
    assert(catalog.includes(reason), `M-23 fixture: missing rejection reason ${reason}`);
  }
}

function assertPureReport() {
  const report = buildSanitizationReport({ dryRun: true });
  assert(report && typeof report === 'object', 'buildSanitizationReport must return an object');
  assert(report.dryRun === true, 'buildSanitizationReport must preserve dryRun true');
  assert(Array.isArray(report.records), 'buildSanitizationReport report.records must be an array');
  assert(report.records.length === 0, 'buildSanitizationReport default records must be empty');
  assert(report.productionDataWritten === false, 'buildSanitizationReport must not imply production writes');
  assert(report.historyFileModified === false, 'buildSanitizationReport must not imply history writes');
}

function assertM21ScriptPresent() {
  assert(fs.existsSync(M21_SCRIPT_PATH), 'M-21 script must still exist');
  assert(readText(M21_SCRIPT_PATH).length > 0, 'M-21 script must be non-empty');
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(M22_DESIGN_FIXTURE_PATH), 'M-22 design fixture is missing');
  assert(fs.existsSync(M23_STATE_FIXTURE_PATH), 'M-23 state fixture is missing');
  assert(fs.existsSync(SCAFFOLD_SCRIPT_PATH), 'M-23 scaffold script is missing');

  assertM22DesignFixture(readJson(M22_DESIGN_FIXTURE_PATH));
  assertM23StateFixture(readJson(M23_STATE_FIXTURE_PATH));
  assertScaffoldSourceBoundary();
  assertPureReport();
  assertM21ScriptPresent();
  assertProtectedFilesUnchanged(snapshot, 'manual weekly input sanitizer scaffold check');

  if (errors.length > 0) {
    console.error('Market pricing manual weekly input sanitizer scaffold: FAIL');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Market pricing manual weekly input sanitizer scaffold: PASS');
}

main();
