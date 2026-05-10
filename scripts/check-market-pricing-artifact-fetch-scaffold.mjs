import fs from 'fs';
import path from 'path';
import {
  buildArtifactFetchScaffoldReport,
  writeArtifactFetchScaffoldReport
} from './market-pricing/artifact-fetch-scaffold.mjs';

const CONTRACT_VERSION = 'v28.0M-9';
const ROOT = process.cwd();
const SCAFFOLD_PATH = path.join(
  ROOT,
  'scripts/market-pricing/artifact-fetch-scaffold.mjs'
);
const DEFAULT_OUTPUT_PATH =
  'manual-artifacts/market-pricing/artifact-fetch-scaffold-latest.json';

const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json'
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

const FORBIDDEN_REPORT_FIELDS = new Set([
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
  'inverseetf',
  'allocation',
  'positionadvice'
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function snapshotProtectedFiles() {
  return new Map(
    PROTECTED_FILES.map((relativePath) => [relativePath, readText(relativePath)])
  );
}

function assertProtectedFilesUnchanged(snapshot) {
  for (const [relativePath, before] of snapshot.entries()) {
    const after = readText(relativePath);
    assert(after === before, `${relativePath} changed during scaffold check.`);
  }
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function assertNoForbiddenReportFields(value, trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenReportFields(item, `${trail}[${index}]`)
    );
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    assert(
      !FORBIDDEN_REPORT_FIELDS.has(normalized),
      `Forbidden report field found at ${trail}.${key}.`
    );
    assertNoForbiddenReportFields(child, `${trail}.${key}`);
  }
}

function assertReportBase(report, expectedStatus) {
  assert(report.contractVersion === CONTRACT_VERSION, 'Unexpected contractVersion.');
  assert(
    report.kind === 'market_pricing_artifact_fetch_scaffold_report',
    'Unexpected report kind.'
  );
  assert(report.status === expectedStatus, `Unexpected status: ${report.status}`);
  assert(
    report.sourceMode === 'scaffold_no_live_fetch',
    'Unexpected sourceMode.'
  );
  assert(report.networkAllowed === false, 'networkAllowed must remain false.');
  assert(report.apiCalled === false, 'apiCalled must remain false.');
  assert(report.secretsRead === false, 'secretsRead must remain false.');
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
  assert(Array.isArray(report.records), 'records must be an array.');
  assert(report.records.length === 0, 'records must remain empty.');
  assert(report.recordsProduced === 0, 'recordsProduced must be 0.');
  assert(report.weeklyRows === 0, 'weeklyRows must be 0.');
  assert(report.hasAtLeast60Weeks === false, 'hasAtLeast60Weeks must be false.');
  assert(
    report.validation?.status === 'scaffold_only',
    'validation.status must be scaffold_only.'
  );
  assert(
    report.validation.recordsValidated === false,
    'recordsValidated must remain false.'
  );
  assert(
    report.validation.sourceComplianceReviewed === false,
    'sourceComplianceReviewed must remain false.'
  );
  assert(
    report.validation.sourceSelected === false,
    'sourceSelected must remain false.'
  );
  assert(
    report.validation.readyForProductionWrite === false,
    'readyForProductionWrite must remain false.'
  );
  assert(
    report.candidatePolicy?.spxFallbackOnly === true,
    'candidatePolicy.spxFallbackOnly must be true.'
  );
  assert(
    report.boundaries?.artifactOnly === true,
    'boundaries.artifactOnly must be true.'
  );
  assert(
    report.boundaries.noLiveFetch === true,
    'boundaries.noLiveFetch must be true.'
  );
  assert(
    report.boundaries.noProductionWrite === true,
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
  assertNoForbiddenReportFields(report);
}

function assertStaticSourceContract() {
  assert(fs.existsSync(SCAFFOLD_PATH), 'Artifact fetch scaffold script is missing.');
  const source = fs.readFileSync(SCAFFOLD_PATH, 'utf8');
  assert(source.includes(CONTRACT_VERSION), 'Scaffold contractVersion is missing.');

  for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
    assert(
      !source.includes(pattern),
      `Scaffold source contains forbidden pattern: ${pattern}`
    );
  }

  assert(!/https?:\/\//i.test(source), 'Scaffold source must not contain source URLs.');

  const writeOperationPattern =
    /(writeFileSync|appendFileSync|createWriteStream)\s*\([^)]*(data\/radar-data\.json|data\/market-pricing-history\.json)/s;
  assert(
    !writeOperationPattern.test(source),
    'Scaffold source must not write protected production data files.'
  );
}

function assertDefaultReport() {
  const report = buildArtifactFetchScaffoldReport({
    assetKey: 'qqq',
    candidateSource: 'stooq_candidate'
  });
  assertReportBase(report, 'artifact_fetch_scaffold_only');
  assert(report.assetKey === 'qqq', 'Default report assetKey must be qqq.');
  assert(report.symbol === 'QQQ', 'Default report symbol must be QQQ.');
  assert(
    report.candidateSource === 'stooq_candidate',
    'Default candidateSource mismatch.'
  );
  assert(report.allowNetworkRequested === false, 'allowNetworkRequested mismatch.');
  assert(
    report.networkRequestRejected === false,
    'networkRequestRejected mismatch.'
  );
}

function assertAllowNetworkRejectionReport() {
  const report = buildArtifactFetchScaffoldReport({
    assetKey: 'qqq',
    candidateSource: 'yahoo_style_candidate',
    allowNetworkRequested: true
  });
  assertReportBase(report, 'network_request_rejected_scaffold_only');
  assert(
    report.allowNetworkRequested === true,
    'allowNetworkRequested must be true for rejected report.'
  );
  assert(
    report.networkAllowed === false,
    'networkAllowed must stay false for rejected report.'
  );
  assert(
    report.networkRequestRejected === true,
    'networkRequestRejected must be true.'
  );
  assert(report.apiCalled === false, 'Rejected report must not call an API.');
  assert(report.records.length === 0, 'Rejected report records must stay empty.');
}

function assertWrittenArtifact(snapshot) {
  const { report, outputPath } = writeArtifactFetchScaffoldReport(
    DEFAULT_OUTPUT_PATH,
    {
      assetKey: 'qqq',
      candidateSource: 'stooq_candidate'
    }
  );
  assert(outputPath === DEFAULT_OUTPUT_PATH, 'Unexpected scaffold output path.');
  assertReportBase(report, 'artifact_fetch_scaffold_only');

  const artifactText = fs.readFileSync(path.join(ROOT, outputPath), 'utf8');
  const artifact = JSON.parse(artifactText);
  assertReportBase(artifact, 'artifact_fetch_scaffold_only');
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
  assertDefaultReport();
  assertAllowNetworkRejectionReport();
  assertWrittenArtifact(snapshot);
  assertProtectedFilesUnchanged(snapshot);
  assertManualArtifactsNotCommitted();
  console.log('Market pricing artifact fetch scaffold: PASS');
}

main();
