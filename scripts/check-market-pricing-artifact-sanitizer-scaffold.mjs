import fs from 'fs';
import path from 'path';
import {
  buildArtifactSanitizerScaffoldReport,
  sanitizeArtifactFile
} from './market-pricing/artifact-sanitizer-scaffold.mjs';

const CONTRACT_VERSION = 'v28.0M-10';
const ROOT = process.cwd();
const SCAFFOLD_PATH = path.join(
  ROOT,
  'scripts/market-pricing/artifact-sanitizer-scaffold.mjs'
);
const VALID_FIXTURE =
  'docs/fixtures/market-pricing/artifact-sanitizer-scaffold-valid-v28.0M-10.json';
const INVALID_FIXTURE =
  'docs/fixtures/market-pricing/artifact-sanitizer-scaffold-invalid-v28.0M-10.json';
const DEFAULT_OUTPUT_PATH =
  'manual-artifacts/market-pricing/artifact-sanitizer-scaffold-latest.json';
const INVALID_OUTPUT_PATH =
  'manual-artifacts/market-pricing/artifact-sanitizer-invalid-latest.json';

const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json'
];

const PROTECTED_WRITE_PATHS = [
  'data/radar-data.json',
  'data/market-pricing-history.json',
  'data/radar-history.json',
  'data/radar-history-full.json'
];

const FORBIDDEN_SOURCE_PATTERNS = [
  'fetch(',
  'https.get',
  'http.get',
  'axios',
  'request(',
  'child_process',
  'exec(',
  'spawn(',
  'curl',
  'process.env',
  'DEEPSEEK_API_KEY',
  '.github/workflows'
];

const SENSITIVE_FIELD_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'bearer',
  'token',
  'accesstoken',
  'refreshtoken',
  'cookie',
  'cookies',
  'session',
  'headers',
  'requestheaders',
  'responseheaders',
  'secret',
  'password',
  'credential',
  'credentials'
]);

const SOURCE_LEAKAGE_FIELD_KEYS = new Set([
  'url',
  'endpoint',
  'queryurl',
  'requesturl',
  'rawurl',
  'downloadurl',
  'sourceurl',
  'fullurl',
  'finalurl'
]);

const TRADING_FIELD_KEYS = new Set([
  'buy',
  'sell',
  'short',
  'long',
  'inverseetf',
  'allocation',
  'positionadvice',
  'tradeadvice',
  'recommendation',
  'targetposition'
]);

const CALCULATION_FIELD_KEYS = new Set([
  'close',
  'adjustedclose',
  'ma60',
  'zscore',
  'standarddeviation',
  'upperband',
  'lowerband',
  'temperature',
  'markettemperature'
]);

const PRODUCTION_WRITE_FLAGS = new Set([
  'productiondatawritten',
  'historyfilemodified',
  'radardatamodified',
  'readyforproductionwrite'
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function snapshotProtectedFiles() {
  return new Map(
    PROTECTED_FILES.map((relativePath) => [relativePath, readText(relativePath)])
  );
}

function assertProtectedFilesUnchanged(snapshot) {
  for (const [relativePath, before] of snapshot.entries()) {
    const after = readText(relativePath);
    assert(after === before, `${relativePath} changed during sanitizer check.`);
  }
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function collectEntries(value, entries = [], trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectEntries(item, entries, `${trail}[${index}]`));
    return entries;
  }
  if (!value || typeof value !== 'object') {
    return entries;
  }
  for (const [key, child] of Object.entries(value)) {
    entries.push({
      key,
      normalizedKey: normalizeKey(key),
      path: `${trail}.${key}`,
      value: child
    });
    collectEntries(child, entries, `${trail}.${key}`);
  }
  return entries;
}

function assertValidFixtureHasNoForbiddenFields(validFixture) {
  const entries = collectEntries(validFixture);

  for (const entry of entries) {
    const { normalizedKey, path: fieldPath, value } = entry;
    assert(
      !SENSITIVE_FIELD_KEYS.has(normalizedKey),
      `Valid fixture must not contain sensitive field: ${fieldPath}`
    );
    assert(
      !SOURCE_LEAKAGE_FIELD_KEYS.has(normalizedKey),
      `Valid fixture must not contain source leakage field: ${fieldPath}`
    );
    assert(
      !TRADING_FIELD_KEYS.has(normalizedKey),
      `Valid fixture must not contain trading/advice field: ${fieldPath}`
    );
    assert(
      !CALCULATION_FIELD_KEYS.has(normalizedKey),
      `Valid fixture must not contain price/calculation field: ${fieldPath}`
    );
    assert(
      !(PRODUCTION_WRITE_FLAGS.has(normalizedKey) && value === true),
      `Valid fixture must not set production-write flag true: ${fieldPath}`
    );
  }
}

function assertInvalidFixtureHasNoRealRecords(invalidFixture) {
  assert(
    Array.isArray(invalidFixture.records),
    'Invalid fixture records must be an array.'
  );
  assert(
    invalidFixture.records.length === 0,
    'Invalid fixture must not use production-like records.'
  );
  assert(
    invalidFixture.assetKey === 'fixture_asset',
    'Invalid fixture assetKey must stay non-production.'
  );
  assert(
    invalidFixture.symbol === 'FIXTURE',
    'Invalid fixture symbol must stay non-production.'
  );
  assert(
    invalidFixture.fixtureOnly === true,
    'Invalid fixture fixtureOnly must stay true.'
  );
  assert(
    invalidFixture.syntheticOnly === true,
    'Invalid fixture syntheticOnly must stay true.'
  );

  const invalidEntries = collectEntries(invalidFixture);
  for (const entry of invalidEntries) {
    assert(
      entry.normalizedKey !== 'close' && entry.normalizedKey !== 'adjustedclose',
      `Invalid fixture must not contain realistic price field: ${entry.path}`
    );
  }
}

function assertNoProductionLikeFixtureRecords() {
  const validFixture = readJson(VALID_FIXTURE);
  const invalidFixture = readJson(INVALID_FIXTURE);

  assert(Array.isArray(validFixture.records), 'Valid fixture records must be an array.');
  assert(validFixture.records.length === 0, 'Valid fixture records must remain empty.');
  assertValidFixtureHasNoForbiddenFields(validFixture);
  assertInvalidFixtureHasNoRealRecords(invalidFixture);
}

function assertStaticSourceContract() {
  assert(fs.existsSync(SCAFFOLD_PATH), 'Artifact sanitizer scaffold script is missing.');
  const source = fs.readFileSync(SCAFFOLD_PATH, 'utf8');
  assert(source.includes(CONTRACT_VERSION), 'Sanitizer contractVersion is missing.');

  for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
    assert(
      !source.includes(pattern),
      `Sanitizer source contains forbidden pattern: ${pattern}`
    );
  }

  assert(!/https?:\/\//i.test(source), 'Sanitizer source must not contain source URLs.');

  for (const protectedPath of PROTECTED_WRITE_PATHS) {
    const escapedPath = protectedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const writeOperationPattern = new RegExp(
      `(writeFileSync|appendFileSync|createWriteStream)\\s*\\([^)]*${escapedPath}`,
      's'
    );
    assert(
      !writeOperationPattern.test(source),
      `Sanitizer source must not write ${protectedPath}.`
    );
  }
}

function assertValidReportBase(report, expectedStatus) {
  assert(report.contractVersion === CONTRACT_VERSION, 'Unexpected contractVersion.');
  assert(
    report.kind === 'market_pricing_artifact_sanitizer_scaffold_report',
    'Unexpected sanitizer report kind.'
  );
  assert(report.status === expectedStatus, `Unexpected status: ${report.status}`);
  assert(report.scaffoldOnly === true, 'scaffoldOnly must be true.');
  assert(report.recordsAcceptedForHistory === 0, 'recordsAcceptedForHistory must be 0.');
  assert(
    report.readyForProductionWrite === false,
    'readyForProductionWrite must remain false.'
  );
  assert(
    report.productionDataWritten === false,
    'productionDataWritten must remain false.'
  );
  assert(
    report.historyFileModified === false,
    'historyFileModified must remain false.'
  );
  assert(report.radarDataModified === false, 'radarDataModified must remain false.');
  assert(
    report.calculationPerformed === false,
    'calculationPerformed must remain false.'
  );
  assert(
    report.boundaries?.noProductionWrite === true,
    'boundaries.noProductionWrite must be true.'
  );
  assert(
    report.boundaries.noCalculation === true,
    'boundaries.noCalculation must be true.'
  );
  assert(
    report.boundaries.affectsScoring === false,
    'affectsScoring must remain false.'
  );
  assert(
    report.boundaries.affectsDecisionModel === false,
    'affectsDecisionModel must remain false.'
  );
  assert(
    report.boundaries.affectsExecutionLock === false,
    'affectsExecutionLock must remain false.'
  );
  assert(
    report.boundaries.affectsPositionGuidance === false,
    'affectsPositionGuidance must remain false.'
  );
}

function assertValidFixtureReport(snapshot) {
  const artifact = readJson(VALID_FIXTURE);
  const report = buildArtifactSanitizerScaffoldReport(VALID_FIXTURE, artifact);
  assertValidReportBase(report, 'pass_scaffold_only');
  assert(report.fixtureOnly === true, 'Valid fixture report must be fixtureOnly.');
  assert(report.recordsInspected === 0, 'Valid fixture recordsInspected must be 0.');
  assert(report.recordsRejected === 0, 'Valid fixture recordsRejected must be 0.');
  assert(
    report.sensitiveFieldsRejected.length === 0,
    'Valid fixture must not reject sensitive fields.'
  );
  assert(
    report.sourceLeakageFieldsRejected.length === 0,
    'Valid fixture must not reject source leakage fields.'
  );
  assert(
    report.forbiddenFieldsRejected.length === 0,
    'Valid fixture must not reject forbidden fields.'
  );

  const written = sanitizeArtifactFile(VALID_FIXTURE, DEFAULT_OUTPUT_PATH);
  assert(written.outputPath === DEFAULT_OUTPUT_PATH, 'Unexpected valid output path.');
  assertValidReportBase(written.report, 'pass_scaffold_only');
  assertProtectedFilesUnchanged(snapshot);
}

function assertInvalidFixtureReport(snapshot) {
  const artifact = readJson(INVALID_FIXTURE);
  const report = buildArtifactSanitizerScaffoldReport(INVALID_FIXTURE, artifact);
  assertValidReportBase(report, 'invalid_artifact');
  assert(report.recordsInspected === 0, 'Invalid fixture recordsInspected must be 0.');
  assert(
    report.recordsAcceptedForHistory === 0,
    'Invalid fixture must not accept records.'
  );
  assert(
    report.sensitiveFieldsRejected.some((field) => field.endsWith('.apiKey')),
    'Invalid fixture must reject apiKey.'
  );
  assert(
    report.sensitiveFieldsRejected.some((field) => field.endsWith('.headers')),
    'Invalid fixture must reject headers.'
  );
  assert(
    report.sourceLeakageFieldsRejected.some((field) => field.endsWith('.sourceUrl')),
    'Invalid fixture must reject sourceUrl.'
  );
  assert(
    report.forbiddenFieldsRejected.some((field) => field.endsWith('.temperature')),
    'Invalid fixture must reject temperature.'
  );
  assert(
    report.forbiddenFieldsRejected.some((field) => field.endsWith('.buy')),
    'Invalid fixture must reject trading advice fields.'
  );
  assert(
    report.forbiddenFieldsRejected.some((field) =>
      field.endsWith('.productionDataWritten=true')
    ),
    'Invalid fixture must reject productionDataWritten=true.'
  );
  assert(
    report.forbiddenFieldsRejected.some((field) =>
      field.endsWith('.historyFileModified=true')
    ),
    'Invalid fixture must reject historyFileModified=true.'
  );
  assert(
    report.forbiddenFieldsRejected.some((field) =>
      field.endsWith('.readyForProductionWrite=true')
    ),
    'Invalid fixture must reject readyForProductionWrite=true.'
  );

  const written = sanitizeArtifactFile(INVALID_FIXTURE, INVALID_OUTPUT_PATH);
  assert(written.outputPath === INVALID_OUTPUT_PATH, 'Unexpected invalid output path.');
  assertValidReportBase(written.report, 'invalid_artifact');
  assertProtectedFilesUnchanged(snapshot);
}

function assertManualArtifactsNotCommitted() {
  const indexPath = path.join(ROOT, '.git/index');
  if (!fs.existsSync(indexPath)) {
    return;
  }

  const indexText = fs.readFileSync(indexPath, 'utf8');
  assert(
    !indexText.includes('manual-artifacts/market-pricing/'),
    'manual-artifacts/market-pricing must not be committed.'
  );
}

function main() {
  const snapshot = snapshotProtectedFiles();
  assertStaticSourceContract();
  assertNoProductionLikeFixtureRecords();
  assertValidFixtureReport(snapshot);
  assertInvalidFixtureReport(snapshot);
  assertProtectedFilesUnchanged(snapshot);
  assertManualArtifactsNotCommitted();
  console.log('Market pricing artifact sanitizer scaffold: PASS');
}

main();
