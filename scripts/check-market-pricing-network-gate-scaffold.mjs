import fs from 'node:fs';
import path from 'node:path';
import { buildMarketPricingNetworkGateScaffoldReport } from './market-pricing/network-gate-scaffold.mjs';

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'network-gate-scaffold-v28.0M-17.json'
);
const SCAFFOLD_SCRIPT_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'network-gate-scaffold.mjs'
);
const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json',
  'data/radar-history.json',
  'data/radar-history-full.json'
];
const REQUIRED_FALSE_FLAGS = [
  'sourceSelectionFinalized',
  'sourceApproved',
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
  'readyForProductionWrite',
  'apiCalled',
  'secretsRead',
  'productionDataWritten',
  'historyFileModified',
  'frontendChanged',
  'workflowChanged'
];
const REQUIRED_REJECTION_REASONS = [
  'source_not_approved',
  'live_fetch_not_approved',
  'network_gate_not_approved'
];
const FORBIDDEN_SCAFFOLD_PATTERNS = [
  'fetch(',
  'http.get',
  'https.get',
  'axios',
  'request(',
  'curl',
  'process.env'
];
const FORBIDDEN_FIELD_KEYS = new Set([
  'url',
  'endpoint',
  'providerurl',
  'sourceurl',
  'apiurl',
  'headers',
  'authorization',
  'token',
  'apikey',
  'secret',
  'password'
]);

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

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function collectFieldKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFieldKeys(item, keys));
    return keys;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nestedValue]) => {
      keys.push(key);
      collectFieldKeys(nestedValue, keys);
    });
  }

  return keys;
}

function assertNoUrlOrSensitiveFields(report, label) {
  const serialized = JSON.stringify(report);
  assert(!/https?:\/\//i.test(serialized), `${label}: report must not contain external links`);

  for (const key of collectFieldKeys(report)) {
    assert(
      !FORBIDDEN_FIELD_KEYS.has(normalizeKey(key)),
      `${label}: forbidden URL or sensitive field key present: ${key}`
    );
  }
}

function assertRequiredFlagsFalse(report, label) {
  for (const field of REQUIRED_FALSE_FLAGS) {
    assert(report[field] === false, `${label}: ${field} must remain false`);
  }
}

function assertBoundaryFlags(report, label) {
  const boundaries = report.boundaries || {};
  const requiredTrue = [
    'scaffoldOnly',
    'noLiveFetch',
    'noNetworkEnabled',
    'noSourceApproval',
    'noProductionWrite',
    'noHistoryWrite',
    'noWorkflowChange',
    'noCalculation',
    'noFrontendChange'
  ];
  const requiredFalse = [
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance'
  ];

  for (const field of requiredTrue) {
    assert(boundaries[field] === true, `${label}: boundaries.${field} must remain true`);
  }

  for (const field of requiredFalse) {
    assert(boundaries[field] === false, `${label}: boundaries.${field} must remain false`);
  }
}

function assertPipelineAssignment(report, label) {
  const assignment = report.unifiedPipelineAssignment || {};
  assert(
    assignment.sourceArtifactsLayer === 'artifact_sanitizer_layer',
    `${label}: source artifacts layer must remain artifact_sanitizer_layer`
  );
  assert(
    assignment.historyLayer === 'daily_history_layer',
    `${label}: history layer must remain daily_history_layer`
  );
  assert(
    assignment.realtimeWorkerPrimaryWeeklyHistoryBuilder === false,
    `${label}: realtime worker must not become a weekly history builder`
  );
  assert(
    assignment.backupValidationMayBypassSanitizer === false,
    `${label}: backup validation must not bypass sanitizer`
  );
}

function assertReportContract(report, label, options = {}) {
  const expectedAllowNetworkRequested = options.allowNetworkRequested === true;
  const expectedStatus = expectedAllowNetworkRequested
    ? 'network_request_rejected_scaffold_only'
    : 'network_gate_closed_scaffold_only';

  assert(
    report.contractVersion === 'v28.0M-17-network-gate-scaffold-1',
    `${label}: unexpected contractVersion`
  );
  assert(report.kind === 'market_pricing_network_gate_scaffold', `${label}: unexpected kind`);
  assert(report.status === expectedStatus, `${label}: unexpected status`);
  assert(report.targetAsset === 'qqq', `${label}: targetAsset must remain qqq`);
  assert(report.targetSymbol === 'QQQ', `${label}: targetSymbol must remain QQQ`);
  assert(
    report.sourceCandidate === 'stooq_public_csv_candidate',
    `${label}: sourceCandidate must remain the unapproved candidate name`
  );
  assertRequiredFlagsFalse(report, label);
  assert(
    report.allowNetworkRequested === expectedAllowNetworkRequested,
    `${label}: allowNetworkRequested mismatch`
  );
  assert(
    report.networkRequestRejected === expectedAllowNetworkRequested,
    `${label}: networkRequestRejected must only reflect an explicit network request`
  );
  assert(
    Array.isArray(report.rejectionReasons),
    `${label}: rejectionReasons must be an array`
  );
  for (const reason of REQUIRED_REJECTION_REASONS) {
    assert(
      report.rejectionReasons.includes(reason),
      `${label}: missing rejection reason ${reason}`
    );
  }
  assert(Array.isArray(report.records), `${label}: records must be an array`);
  assert(report.records.length === 0, `${label}: records must remain empty`);
  assert(report.artifactOnly === true, `${label}: artifactOnly must remain true`);
  assert(report.sanitizerRequired === true, `${label}: sanitizerRequired must remain true`);
  assert(report.productionWriterRequired === true, `${label}: productionWriterRequired must remain true`);
  assert(
    report.calculationRequiresSeparateApproval === true,
    `${label}: calculationRequiresSeparateApproval must remain true`
  );
  assertPipelineAssignment(report, label);
  assertBoundaryFlags(report, label);
  assertNoUrlOrSensitiveFields(report, label);
}

function assertNoForbiddenScaffoldSource() {
  const source = readText(SCAFFOLD_SCRIPT_PATH);

  for (const pattern of FORBIDDEN_SCAFFOLD_PATTERNS) {
    assert(!source.includes(pattern), `scaffold script must not contain forbidden pattern: ${pattern}`);
  }

  assert(!/https?:\/\//i.test(source), 'scaffold script must not contain provider or endpoint links');

  const protectedWritePattern =
    /(writeFileSync|writeFile|appendFileSync|appendFile)\s*\([^)]*(data[\\/](?:radar-data|market-pricing-history|radar-history|radar-history-full)\.json)/s;
  assert(
    !protectedWritePattern.test(source),
    'scaffold script must not contain write operations targeting production data files'
  );
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(SCAFFOLD_SCRIPT_PATH), 'network gate scaffold script is missing');
  assert(fs.existsSync(FIXTURE_PATH), 'network gate scaffold fixture is missing');
  assertNoForbiddenScaffoldSource();

  const fixture = readJson(FIXTURE_PATH);
  assertReportContract(fixture, 'fixture closed report', { allowNetworkRequested: false });

  const closedReport = buildMarketPricingNetworkGateScaffoldReport({
    generatedAt: '2099-01-01T00:00:00.000Z'
  });
  assertReportContract(closedReport, 'generated closed report', { allowNetworkRequested: false });

  const rejectedReport = buildMarketPricingNetworkGateScaffoldReport({
    generatedAt: '2099-01-01T00:00:00.000Z',
    allowNetworkRequested: true
  });
  assertReportContract(rejectedReport, 'generated allow-network report', {
    allowNetworkRequested: true
  });

  assertProtectedFilesUnchanged(snapshot, 'network gate scaffold check');

  if (errors.length > 0) {
    console.error('Market pricing network gate scaffold: FAIL');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Market pricing network gate scaffold: PASS');
}

main();
