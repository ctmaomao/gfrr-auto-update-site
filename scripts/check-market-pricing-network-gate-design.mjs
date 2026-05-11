import fs from 'fs';
import path from 'path';
import { buildSourceSpecificArtifactFetchScaffoldReport } from './market-pricing/source-specific-artifact-fetch-scaffold.mjs';

const ROOT = process.cwd();
const NETWORK_GATE_DOC = 'docs/MARKET_PRICING_NETWORK_GATE_DESIGN.md';
const NETWORK_GATE_FIXTURE =
  'docs/fixtures/market-pricing/network-gate-design-v28.0M-16.json';
const SOURCE_SPECIFIC_SCAFFOLD =
  'scripts/market-pricing/source-specific-artifact-fetch-scaffold.mjs';
const UNIFIED_ARCHITECTURE_FIXTURE =
  'docs/fixtures/data-pipeline/unified-data-pipeline-architecture-v28.0M-15A.json';

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

const REQUIRED_DOC_PHRASES = [
  'Network remains disabled',
  'No live fetch',
  'No source approval',
  'No production data write',
  'No history record write',
  'networkGateApproved=false',
  'networkGateOpen=false',
  'networkAllowed=false',
  'sourceApproved=false',
  'liveFetchApproved=false',
  'sourceComplianceReviewed=false',
  'sourceFormatVerified=false',
  'symbolMappingVerified=false',
  'source_not_approved',
  'live_fetch_not_approved',
  'network_gate_not_approved',
  'artifact_sanitizer_layer',
  'daily_history_layer',
  'Market Pricing Temperature remains waiting-for-history',
  'no SPX-as-Nasdaq-temperature'
];

const FORBIDDEN_SCRIPT_PATTERNS = [
  'fetch(',
  'https.get',
  'http.get',
  'axios',
  'request(',
  'child_process',
  'exec(',
  'spawn(',
  'curl',
  'process.env'
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

const APPROVAL_OR_NETWORK_FALSE_FIELDS = [
  'sourceApproved',
  'sourceSelectionFinalized',
  'liveFetchApproved',
  'networkGateApproved',
  'networkGateOpen',
  'networkAllowed',
  'sourceComplianceReviewed',
  'sourceFormatVerified',
  'symbolMappingVerified',
  'sourceUrlPersistenceAllowed',
  'secretsAllowed',
  'productionDataWriteApproved',
  'historyWriteApproved',
  'marketTemperatureCalculationApproved',
  'readyForProductionWrite'
];

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

function normalize(value) {
  return value.toLowerCase();
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
    assert(after === before, `${relativePath} changed during network gate check.`);
  }
}

function assertNoUrls(text, label) {
  assert(!/https?:\/\//i.test(text), `${label} must not contain source URLs.`);
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

function assertDesignDoc() {
  assert(fs.existsSync(absolute(NETWORK_GATE_DOC)), 'Network gate design doc is missing.');
  const doc = readText(NETWORK_GATE_DOC);
  const docLower = normalize(doc);
  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(
      docLower.includes(normalize(phrase)),
      `Network gate design doc is missing phrase: ${phrase}`
    );
  }
  assertNoUrls(doc, NETWORK_GATE_DOC);
}

function assertFalseField(fixture, fieldName) {
  if (Object.hasOwn(fixture, fieldName)) {
    assert(fixture[fieldName] === false, `${fieldName} must be false.`);
  }
}

function assertRequiredRejectionReasons(fixture) {
  assert(
    Array.isArray(fixture.rejectionReasonsRequired),
    'rejectionReasonsRequired must be an array.'
  );
  const reasons = new Set(fixture.rejectionReasonsRequired);
  for (const reason of [
    'source_not_approved',
    'live_fetch_not_approved',
    'network_gate_not_approved'
  ]) {
    assert(reasons.has(reason), `Missing required rejection reason: ${reason}`);
  }
}

function assertNoFixtureLeakage(fixtureText, fixture) {
  assertNoUrls(fixtureText, NETWORK_GATE_FIXTURE);
  for (const entry of collectEntries(fixture)) {
    assert(
      !SOURCE_URL_KEYS.has(entry.normalizedKey),
      `Fixture must not contain source URL field: ${entry.path}`
    );
    assert(
      !SENSITIVE_KEYS.has(entry.normalizedKey),
      `Fixture must not contain sensitive field: ${entry.path}`
    );
    if (APPROVAL_OR_NETWORK_FALSE_FIELDS.includes(entry.key)) {
      assert(entry.value === false, `Approval/network field must remain false: ${entry.path}`);
    }
  }
}

function assertNetworkGateFixture() {
  assert(
    fs.existsSync(absolute(NETWORK_GATE_FIXTURE)),
    'Network gate design fixture is missing.'
  );
  const fixtureText = readText(NETWORK_GATE_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(
    fixture.contractVersion === 'v28.0M-16-network-gate-design-1',
    'Unexpected network gate fixture contractVersion.'
  );
  assert(
    fixture.kind === 'market_pricing_source_specific_network_gate_design',
    'Unexpected network gate fixture kind.'
  );
  assert(fixture.status === 'network_gate_design_only', 'Unexpected fixture status.');
  assert(fixture.targetAsset === 'qqq', 'targetAsset must be qqq.');
  assert(fixture.targetSymbol === 'QQQ', 'targetSymbol must be QQQ.');
  assert(
    fixture.sourceCandidate === 'stooq_public_csv_candidate',
    'sourceCandidate must be stooq_public_csv_candidate.'
  );

  for (const fieldName of APPROVAL_OR_NETWORK_FALSE_FIELDS) {
    assertFalseField(fixture, fieldName);
  }

  assert(
    fixture.allowNetworkRequestMustBeRejected === true,
    'allowNetworkRequestMustBeRejected must be true.'
  );
  assert(fixture.artifactOnly === true, 'artifactOnly must be true.');
  assert(fixture.sanitizerRequired === true, 'sanitizerRequired must be true.');
  assert(
    fixture.productionWriterRequired === true,
    'productionWriterRequired must be true.'
  );
  assert(
    fixture.calculationRequiresSeparateApproval === true,
    'calculationRequiresSeparateApproval must be true.'
  );
  assertRequiredRejectionReasons(fixture);

  assert(
    fixture.unifiedPipelineAssignment?.sourceArtifactsLayer === 'artifact_sanitizer_layer',
    'sourceArtifactsLayer must be artifact_sanitizer_layer.'
  );
  assert(
    fixture.unifiedPipelineAssignment?.historyLayer === 'daily_history_layer',
    'historyLayer must be daily_history_layer.'
  );
  assert(
    fixture.unifiedPipelineAssignment?.realtimeWorkerPrimaryWeeklyHistoryBuilder === false,
    'Realtime worker must not be primary weekly-history builder.'
  );
  assert(
    fixture.unifiedPipelineAssignment?.backupValidationMayBypassSanitizer === false,
    'Backup validation must not bypass sanitizer.'
  );

  assert(Array.isArray(fixture.records), 'records must be an array.');
  assert(fixture.records.length === 0, 'records must remain empty.');
  assert(fixture.boundaries?.designOnly === true, 'boundaries.designOnly must be true.');
  assert(fixture.boundaries?.noLiveFetch === true, 'boundaries.noLiveFetch must be true.');
  assert(
    fixture.boundaries?.noNetworkEnabled === true,
    'boundaries.noNetworkEnabled must be true.'
  );
  assert(
    fixture.boundaries?.noSourceApproval === true,
    'boundaries.noSourceApproval must be true.'
  );
  assert(
    fixture.boundaries?.noProductionWrite === true,
    'boundaries.noProductionWrite must be true.'
  );
  assert(fixture.boundaries?.noHistoryWrite === true, 'boundaries.noHistoryWrite must be true.');
  assert(
    fixture.boundaries?.noWorkflowChange === true,
    'boundaries.noWorkflowChange must be true.'
  );
  assert(fixture.boundaries?.noCalculation === true, 'boundaries.noCalculation must be true.');
  assert(fixture.boundaries?.noFrontendChange === true, 'boundaries.noFrontendChange must be true.');
  assert(fixture.boundaries?.affectsScoring === false, 'affectsScoring must be false.');
  assert(
    fixture.boundaries?.affectsDecisionModel === false,
    'affectsDecisionModel must be false.'
  );
  assert(
    fixture.boundaries?.affectsExecutionLock === false,
    'affectsExecutionLock must be false.'
  );
  assert(
    fixture.boundaries?.affectsPositionGuidance === false,
    'affectsPositionGuidance must be false.'
  );

  assertNoFixtureLeakage(fixtureText, fixture);
}

function assertSourceSpecificScaffoldRemainsClosed() {
  assert(
    fs.existsSync(absolute(SOURCE_SPECIFIC_SCAFFOLD)),
    'Source-specific scaffold is missing.'
  );
  const source = readText(SOURCE_SPECIFIC_SCAFFOLD);
  for (const pattern of FORBIDDEN_SCRIPT_PATTERNS) {
    assert(
      !source.includes(pattern),
      `${SOURCE_SPECIFIC_SCAFFOLD} contains forbidden live-fetch pattern: ${pattern}`
    );
  }
  assertNoUrls(source, SOURCE_SPECIFIC_SCAFFOLD);
  assertNoProtectedWriteOperations(source, SOURCE_SPECIFIC_SCAFFOLD);

  const rejectedReport = buildSourceSpecificArtifactFetchScaffoldReport({
    targetAsset: 'qqq',
    sourceCandidate: 'stooq_public_csv_candidate',
    allowNetworkRequested: true
  });
  assert(
    rejectedReport.status === 'network_request_rejected_scaffold_only',
    'allow-network report must remain rejected.'
  );
  assert(rejectedReport.allowNetworkRequested === true, 'allowNetworkRequested mismatch.');
  assert(rejectedReport.networkAllowed === false, 'networkAllowed must stay false.');
  assert(
    rejectedReport.networkRequestRejected === true,
    'networkRequestRejected must be true.'
  );
  assert(rejectedReport.apiCalled === false, 'apiCalled must remain false.');
  assert(Array.isArray(rejectedReport.records), 'records must be an array.');
  assert(rejectedReport.records.length === 0, 'records must remain empty.');
  assert(
    rejectedReport.productionDataWritten === false,
    'productionDataWritten must remain false.'
  );
  assert(
    rejectedReport.historyFileModified === false,
    'historyFileModified must remain false.'
  );
}

function assertUnifiedArchitectureCompatibility() {
  assert(
    fs.existsSync(absolute(UNIFIED_ARCHITECTURE_FIXTURE)),
    'Unified architecture fixture is missing.'
  );
  const fixture = readJson(UNIFIED_ARCHITECTURE_FIXTURE);
  const assignments = fixture.sourceAssignments || {};
  assert(
    assignments.market_pricing_history?.assignedLayer === 'daily_history_layer',
    'market_pricing_history must stay in daily_history_layer.'
  );
  assert(
    assignments.market_pricing_source_specific_artifacts?.assignedLayer ===
      'artifact_sanitizer_layer',
    'source-specific artifacts must stay in artifact_sanitizer_layer.'
  );
  assert(
    assignments.github_actions_backup_validation?.mayBypassSanitizer === false,
    'GitHub Actions backup validation must not bypass sanitizer.'
  );
  assert(
    assignments.github_actions_backup_validation?.mayWriteMarketPricingHistoryDirectly ===
      false,
    'GitHub Actions backup validation must not write market-pricing history directly.'
  );
}

function main() {
  const snapshot = snapshotProtectedFiles();
  assertDesignDoc();
  assertNetworkGateFixture();
  assertSourceSpecificScaffoldRemainsClosed();
  assertUnifiedArchitectureCompatibility();
  assertProtectedFilesUnchanged(snapshot);
  console.log('Market pricing network gate design: PASS');
}

main();
