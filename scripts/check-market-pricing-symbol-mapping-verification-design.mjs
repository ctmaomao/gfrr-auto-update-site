import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'symbol-mapping-verification-design-v28.0M-19.json'
);
const DISALLOWED_EXECUTABLE_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'symbol-mapping-verification-design.mjs'
);
const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json',
  'data/radar-history.json',
  'data/radar-history-full.json'
];
const REQUIRED_FALSE_FLAGS = [
  'symbolMappingVerified',
  'symbolMappingApproved',
  'sourceComplianceReviewed',
  'sourceFormatVerified',
  'sourceSelectionFinalized',
  'sourceApproved',
  'liveFetchApproved',
  'networkGateApproved',
  'networkGateOpen',
  'networkAllowed',
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
const VERIFICATION_FALSE_FLAGS = [
  'tickerCaseMatched',
  'marketIdentifierMatched',
  'exchangeIdentifierMatched',
  'assetClassMatched',
  'isinOrFigiCrossChecked',
  'timezoneAlignmentVerified'
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
  const externalLinkPattern = new RegExp('h' + 'ttps?:\\/\\/', 'i');
  assert(!externalLinkPattern.test(serialized), `${label}: fixture must not contain external links`);

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

function assertVerificationChecklist(report, label) {
  const checklist = report.verificationChecklistDesign || {};

  for (const field of VERIFICATION_FALSE_FLAGS) {
    assert(checklist[field] === false, `${label}: verificationChecklistDesign.${field} must remain false`);
  }

  assert(
    checklist.noSpxSubstitution === true,
    `${label}: verificationChecklistDesign.noSpxSubstitution must remain true`
  );
}

function assertCandidateSymbolDesign(report, label) {
  const design = report.candidateSymbolDesign || {};
  assert(design.primarySymbol === 'QQQ', `${label}: primarySymbol must be QQQ`);
  assert(design.primaryMarket === 'NASDAQ', `${label}: primaryMarket must be NASDAQ`);
  assert(design.primaryExchange === 'NASDAQ', `${label}: primaryExchange must be NASDAQ`);
  assert(design.primarySymbolFormat === 'uppercase_ticker', `${label}: primarySymbolFormat mismatch`);

  const fallbackSymbols = (design.fallbackCandidates || []).map((candidate) => candidate.symbol);
  assert(fallbackSymbols.includes('NDX'), `${label}: fallbackCandidates must document NDX`);
  assert(fallbackSymbols.includes('IXIC'), `${label}: fallbackCandidates must document IXIC`);

  const rejectedSpx = (design.rejectedSubstitutes || []).find(
    (candidate) => candidate.symbol === 'SPX'
  );
  assert(Boolean(rejectedSpx), `${label}: rejectedSubstitutes must include SPX`);
  assert(
    /Nasdaq\/QQQ/.test(rejectedSpx?.reason || ''),
    `${label}: SPX rejection reason must mention Nasdaq/QQQ`
  );
}

function assertBoundaryFlags(report, label) {
  const boundaries = report.boundaries || {};
  const requiredTrue = [
    'designLayerOnly',
    'noScaffoldExecutable',
    'noLiveFetch',
    'noNetworkEnabled',
    'noSourceApproval',
    'noComplianceApproval',
    'noSymbolMappingApproval',
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

function assertDesignFixture(report, label) {
  assert(
    report.contractVersion === 'v28.0M-19-symbol-mapping-verification-design-1',
    `${label}: unexpected contractVersion`
  );
  assert(
    report.kind === 'market_pricing_symbol_mapping_verification_design',
    `${label}: unexpected kind`
  );
  assert(
    report.status === 'symbol_mapping_design_only_not_verified',
    `${label}: unexpected status`
  );
  assert(report.targetAsset === 'qqq', `${label}: targetAsset must remain qqq`);
  assertRequiredFlagsFalse(report, label);
  assert(
    report.symbolMappingVerificationStatus === 'not_verified',
    `${label}: symbolMappingVerificationStatus must remain not_verified`
  );
  assert(report.candidateSymbolRecorded === true, `${label}: candidateSymbolRecorded must remain true`);
  assert(report.symbolMappingDesignReviewed === true, `${label}: symbolMappingDesignReviewed must remain true`);
  assert(
    report.sourceComplianceReviewStatus === 'not_reviewed',
    `${label}: sourceComplianceReviewStatus must remain not_reviewed`
  );
  assert(report.artifactOnly === true, `${label}: artifactOnly must remain true`);
  assert(report.designLayerOnly === true, `${label}: designLayerOnly must remain true`);
  assert(
    report.scaffoldExecutableExists === false,
    `${label}: scaffoldExecutableExists must remain false`
  );
  assert(
    report.verificationRequiresSeparateApproval === true,
    `${label}: verificationRequiresSeparateApproval must remain true`
  );
  assert(Array.isArray(report.records), `${label}: records must be an array`);
  assert(report.records.length === 0, `${label}: records must remain empty`);
  assertCandidateSymbolDesign(report, label);
  assertVerificationChecklist(report, label);
  assertPipelineAssignment(report, label);
  assertBoundaryFlags(report, label);
  assertNoUrlOrSensitiveFields(report, label);
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(FIXTURE_PATH), 'symbol mapping verification design fixture is missing');
  assert(
    !fs.existsSync(DISALLOWED_EXECUTABLE_PATH),
    'design layer must not add scripts/market-pricing/symbol-mapping-verification-design.mjs'
  );

  const fixture = readJson(FIXTURE_PATH);
  assertDesignFixture(fixture, 'symbol mapping verification design fixture');
  assertProtectedFilesUnchanged(snapshot, 'symbol mapping verification design check');

  if (errors.length > 0) {
    console.error('Market pricing symbol mapping verification design: FAIL');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Market pricing symbol mapping verification design: PASS');
}

main();
