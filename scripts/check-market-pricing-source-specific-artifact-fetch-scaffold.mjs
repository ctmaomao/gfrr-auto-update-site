import fs from 'fs';
import path from 'path';
import {
  buildSourceSpecificArtifactFetchScaffoldReport,
  writeSourceSpecificArtifactFetchScaffoldReport
} from './market-pricing/source-specific-artifact-fetch-scaffold.mjs';

const ROOT = process.cwd();
const CONTRACT_VERSION = 'v28.0M-15';
const SCAFFOLD_PATH =
  'scripts/market-pricing/source-specific-artifact-fetch-scaffold.mjs';
const FIXTURE_PATH =
  'docs/fixtures/market-pricing/source-specific-artifact-fetch-scaffold-v28.0M-15.json';
const DEFAULT_OUTPUT_PATH =
  'manual-artifacts/market-pricing/source-specific-artifact-fetch-scaffold-latest.json';
const NETWORK_REJECTED_OUTPUT_PATH =
  'manual-artifacts/market-pricing/source-specific-artifact-fetch-scaffold-network-rejected-latest.json';

const PROOF_OF_SOURCE_FIXTURE =
  'docs/fixtures/market-pricing/proof-of-source-design-v28.0M-14.json';
const SOURCE_SELECTION_FIXTURE =
  'docs/fixtures/market-pricing/source-selection-review-v28.0M-13.json';
const SANITIZER_SCAFFOLD_PATH =
  'scripts/market-pricing/artifact-sanitizer-scaffold.mjs';

const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json'
];

const PROTECTED_WRITE_TARGETS = [
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

const SOURCE_URL_KEYS = new Set([
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

const SENSITIVE_KEYS = new Set([
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

const PRICE_AND_CALCULATION_KEYS = new Set([
  'close',
  'adjustedclose',
  'ma60',
  'zscore',
  'standarddeviation',
  'upperband',
  'lowerband',
  'temperature',
  'markettemperature',
  'signal',
  'buy',
  'sell',
  'short',
  'inverseetf',
  'allocation',
  'positionadvice'
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '');
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

function snapshotProtectedFiles() {
  return new Map(
    PROTECTED_FILES.map((relativePath) => [relativePath, readText(relativePath)])
  );
}

function assertProtectedFilesUnchanged(snapshot) {
  for (const [relativePath, before] of snapshot.entries()) {
    const after = readText(relativePath);
    assert(
      after === before,
      `${relativePath} changed during source-specific scaffold check.`
    );
  }
}

function assertNoUrls(text, label) {
  assert(!/https?:\/\//i.test(text), `${label} must not contain executable URLs.`);
}

function assertNoProtectedWriteOperations(source, label) {
  const writeOperationPattern =
    /(writeFileSync|appendFileSync|createWriteStream)\s*\(([^)]*)\)/gs;
  for (const match of source.matchAll(writeOperationPattern)) {
    const callText = match[0];
    for (const target of PROTECTED_WRITE_TARGETS) {
      assert(
        !callText.includes(target),
        `${label} must not write protected production data: ${target}`
      );
    }
  }
}

function assertStaticScaffoldSource() {
  assert(fs.existsSync(absolute(SCAFFOLD_PATH)), 'Source-specific scaffold is missing.');
  const source = readText(SCAFFOLD_PATH);
  assert(source.includes(CONTRACT_VERSION), 'Scaffold contractVersion is missing.');

  for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
    assert(
      !source.includes(pattern),
      `Scaffold source contains forbidden pattern: ${pattern}`
    );
  }

  assertNoUrls(source, SCAFFOLD_PATH);
  assertNoProtectedWriteOperations(source, SCAFFOLD_PATH);
}

function assertReportBase(report, expectedStatus) {
  assert(report.contractVersion === CONTRACT_VERSION, 'Unexpected contractVersion.');
  assert(
    report.kind === 'market_pricing_source_specific_artifact_fetch_scaffold_report',
    'Unexpected report kind.'
  );
  assert(report.status === expectedStatus, `Unexpected report status: ${report.status}`);
  assert(report.targetAsset === 'qqq', 'targetAsset must be qqq.');
  assert(report.targetSymbol === 'QQQ', 'targetSymbol must be QQQ.');
  assert(
    report.sourceCandidate === 'stooq_public_csv_candidate',
    'sourceCandidate must be stooq_public_csv_candidate.'
  );
  assert(report.sourceApproved === false, 'sourceApproved must be false.');
  assert(
    report.sourceSelectionFinalized === false,
    'sourceSelectionFinalized must be false.'
  );
  assert(report.liveFetchApproved === false, 'liveFetchApproved must be false.');
  assert(
    report.productionDataWriteApproved === false,
    'productionDataWriteApproved must be false.'
  );
  assert(report.historyWriteApproved === false, 'historyWriteApproved must be false.');
  assert(
    report.marketTemperatureCalculationApproved === false,
    'marketTemperatureCalculationApproved must be false.'
  );
  assert(report.networkAllowed === false, 'networkAllowed must be false.');
  assert(report.apiCalled === false, 'apiCalled must be false.');
  assert(report.secretsRead === false, 'secretsRead must be false.');
  assert(report.sourceUrlPersisted === false, 'sourceUrlPersisted must be false.');
  assert(
    report.sourceEndpointPersisted === false,
    'sourceEndpointPersisted must be false.'
  );
  assert(
    report.sourceComplianceReviewed === false,
    'sourceComplianceReviewed must be false.'
  );
  assert(report.sourceFormatVerified === false, 'sourceFormatVerified must be false.');
  assert(report.symbolMappingVerified === false, 'symbolMappingVerified must be false.');
  assert(
    report.adjustedCloseAvailable === 'unknown',
    'adjustedCloseAvailable must be unknown.'
  );
  assert(
    report.weeklyAggregationPolicy === 'not_implemented',
    'weeklyAggregationPolicy must be not_implemented.'
  );
  assert(Array.isArray(report.records), 'records must be an array.');
  assert(report.records.length === 0, 'records must remain empty.');
  assert(report.recordsProduced === 0, 'recordsProduced must be 0.');
  assert(report.recordsAcceptedForHistory === 0, 'recordsAcceptedForHistory must be 0.');
  assert(report.weeklyRows === 0, 'weeklyRows must be 0.');
  assert(report.hasAtLeast60Weeks === false, 'hasAtLeast60Weeks must be false.');
  assert(
    report.readyForProductionWrite === false,
    'readyForProductionWrite must be false.'
  );
  assert(
    report.productionDataWritten === false,
    'productionDataWritten must be false.'
  );
  assert(report.historyFileModified === false, 'historyFileModified must be false.');
  assert(report.radarDataModified === false, 'radarDataModified must be false.');
  assert(
    report.calculationPerformed === false,
    'calculationPerformed must be false.'
  );
  assert(report.boundaries?.scaffoldOnly === true, 'boundaries.scaffoldOnly must be true.');
  assert(
    report.boundaries?.networkDisabled === true,
    'boundaries.networkDisabled must be true.'
  );
  assert(report.boundaries?.noLiveFetch === true, 'boundaries.noLiveFetch must be true.');
  assert(
    report.boundaries?.noSourceApproval === true,
    'boundaries.noSourceApproval must be true.'
  );
  assert(
    report.boundaries?.noProductionWrite === true,
    'boundaries.noProductionWrite must be true.'
  );
  assert(report.boundaries?.noHistoryWrite === true, 'boundaries.noHistoryWrite must be true.');
  assert(report.boundaries?.noCalculation === true, 'boundaries.noCalculation must be true.');
  assert(report.boundaries?.affectsScoring === false, 'affectsScoring must be false.');
  assert(
    report.boundaries?.affectsDecisionModel === false,
    'affectsDecisionModel must be false.'
  );
  assert(
    report.boundaries?.affectsExecutionLock === false,
    'affectsExecutionLock must be false.'
  );
  assert(
    report.boundaries?.affectsPositionGuidance === false,
    'affectsPositionGuidance must be false.'
  );
}

function assertDefaultReport() {
  const report = buildSourceSpecificArtifactFetchScaffoldReport({
    targetAsset: 'qqq',
    sourceCandidate: 'stooq_public_csv_candidate'
  });
  assertReportBase(report, 'source_specific_artifact_fetch_scaffold_only');
  assert(report.allowNetworkRequested === false, 'allowNetworkRequested must be false.');
  assert(
    report.networkRequestRejected === false,
    'networkRequestRejected must be false.'
  );
}

function assertAllowNetworkRejectionReport() {
  const report = buildSourceSpecificArtifactFetchScaffoldReport({
    targetAsset: 'qqq',
    sourceCandidate: 'stooq_public_csv_candidate',
    allowNetworkRequested: true
  });
  assertReportBase(report, 'network_request_rejected_scaffold_only');
  assert(report.allowNetworkRequested === true, 'allowNetworkRequested must be true.');
  assert(
    report.networkRequestRejected === true,
    'networkRequestRejected must be true.'
  );
}

function assertWrittenReports(snapshot) {
  const defaultResult = writeSourceSpecificArtifactFetchScaffoldReport(
    DEFAULT_OUTPUT_PATH,
    {
      targetAsset: 'qqq',
      sourceCandidate: 'stooq_public_csv_candidate'
    }
  );
  assert(
    defaultResult.outputPath === DEFAULT_OUTPUT_PATH,
    'Unexpected default output path.'
  );
  assertReportBase(defaultResult.report, 'source_specific_artifact_fetch_scaffold_only');

  const rejectedResult = writeSourceSpecificArtifactFetchScaffoldReport(
    NETWORK_REJECTED_OUTPUT_PATH,
    {
      targetAsset: 'qqq',
      sourceCandidate: 'stooq_public_csv_candidate',
      allowNetworkRequested: true
    }
  );
  assert(
    rejectedResult.outputPath === NETWORK_REJECTED_OUTPUT_PATH,
    'Unexpected rejected output path.'
  );
  assertReportBase(rejectedResult.report, 'network_request_rejected_scaffold_only');
  assert(rejectedResult.report.allowNetworkRequested === true, 'Rejected report mismatch.');
  assert(rejectedResult.report.networkRequestRejected === true, 'Rejected report mismatch.');
  assertProtectedFilesUnchanged(snapshot);
}

function assertNoFixtureLeakage(fixtureText, fixture) {
  assertNoUrls(fixtureText, FIXTURE_PATH);
  assert(!fixtureText.includes('manual-artifacts'), 'Fixture must not reference manual artifacts.');

  const entries = collectEntries(fixture);
  for (const entry of entries) {
    assert(
      !SOURCE_URL_KEYS.has(entry.normalizedKey),
      `Fixture must not contain source URL field: ${entry.path}`
    );
    assert(
      !SENSITIVE_KEYS.has(entry.normalizedKey),
      `Fixture must not contain sensitive field: ${entry.path}`
    );
    assert(
      !PRICE_AND_CALCULATION_KEYS.has(entry.normalizedKey),
      `Fixture must not contain price, calculation, or advice field: ${entry.path}`
    );
    if (entry.key.endsWith('Approved') || entry.key === 'readyForProductionWrite') {
      assert(entry.value === false, `Approval flag must remain false: ${entry.path}`);
    }
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE_PATH)), 'Source-specific fixture is missing.');
  const fixtureText = readText(FIXTURE_PATH);
  const fixture = JSON.parse(fixtureText);
  assertReportBase(fixture, 'source_specific_artifact_fetch_scaffold_only');
  assert(fixture.allowNetworkRequested === false, 'Fixture allowNetworkRequested mismatch.');
  assert(
    fixture.networkRequestRejected === false,
    'Fixture networkRequestRejected mismatch.'
  );
  assertNoFixtureLeakage(fixtureText, fixture);
}

function assertExistingDesignCompatibility() {
  const proofFixture = readJson(PROOF_OF_SOURCE_FIXTURE);
  assert(proofFixture.sourceApproved === false, 'Proof fixture sourceApproved drifted.');
  assert(
    proofFixture.liveFetchApproved === false,
    'Proof fixture liveFetchApproved drifted.'
  );
  assert(
    proofFixture.productionDataWriteApproved === false,
    'Proof fixture productionDataWriteApproved drifted.'
  );

  const sourceSelectionFixture = readJson(SOURCE_SELECTION_FIXTURE);
  assert(
    sourceSelectionFixture.sourceSelectionFinalized === false,
    'Source selection fixture sourceSelectionFinalized drifted.'
  );
  assert(
    sourceSelectionFixture.liveFetchApproved === false,
    'Source selection fixture liveFetchApproved drifted.'
  );
  assert(
    sourceSelectionFixture.productionDataWriteApproved === false,
    'Source selection fixture productionDataWriteApproved drifted.'
  );

  const sanitizerSource = readText(SANITIZER_SCAFFOLD_PATH);
  for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
    assert(
      !sanitizerSource.includes(pattern),
      `Sanitizer scaffold contains forbidden live pattern: ${pattern}`
    );
  }
  assertNoUrls(sanitizerSource, SANITIZER_SCAFFOLD_PATH);
  assertNoProtectedWriteOperations(sanitizerSource, SANITIZER_SCAFFOLD_PATH);
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
  assertStaticScaffoldSource();
  assertDefaultReport();
  assertAllowNetworkRejectionReport();
  assertFixture();
  assertExistingDesignCompatibility();
  assertWrittenReports(snapshot);
  assertProtectedFilesUnchanged(snapshot);
  assertManualArtifactsNotCommitted();
  console.log('Market pricing source-specific artifact fetch scaffold: PASS');
}

main();
