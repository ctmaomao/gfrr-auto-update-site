import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'source-format-verification-design-v28.0M-20.json'
);
const DISALLOWED_EXECUTABLE_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'source-format-verification-design.mjs'
);
const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json',
  'data/radar-history.json',
  'data/radar-history-full.json'
];
const REQUIRED_FALSE_FLAGS = [
  'sourceFormatVerified',
  'sourceFormatApproved',
  'symbolMappingVerified',
  'sourceComplianceReviewed',
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
const FORMAT_CHECKLIST_FALSE_FLAGS = [
  'contentTypeMatched',
  'headerRowPresent',
  'columnSchemaMatched',
  'dateColumnFormatMatched',
  'priceColumnNumericityVerified',
  'priceRangePlausibilityChecked',
  'rowCadenceClassified'
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

function assertFormatChecklist(report, label) {
  const checklist = report.verificationChecklistDesign || {};

  for (const field of FORMAT_CHECKLIST_FALSE_FLAGS) {
    assert(checklist[field] === false, `${label}: verificationChecklistDesign.${field} must remain false`);
  }

  assert(
    checklist.noHtmlErrorPageMasquerade === true,
    `${label}: verificationChecklistDesign.noHtmlErrorPageMasquerade must remain true`
  );
  assert(
    checklist.noPriceFabrication === true,
    `${label}: verificationChecklistDesign.noPriceFabrication must remain true`
  );
}

function assertCandidateSourceFormatDesign(report, label) {
  const design = report.candidateSourceFormatDesign || {};
  assert(design.expectedDeliveryFormat === 'csv', `${label}: expectedDeliveryFormat must be csv`);
  assert(design.expectedContentType === 'text/csv', `${label}: expectedContentType must be text/csv`);
  assert(design.expectedRowCadence === 'daily_or_weekly', `${label}: expectedRowCadence must be daily_or_weekly`);

  const columns = Array.isArray(design.expectedColumns) ? design.expectedColumns : [];
  const dateColumn = columns.find((column) => column.name === 'Date');
  const closeColumn = columns.find((column) => column.name === 'Close');
  assert(Boolean(dateColumn), `${label}: expectedColumns must contain Date`);
  assert(Boolean(closeColumn), `${label}: expectedColumns must contain Close`);
  assert(dateColumn?.required === true, `${label}: Date column must be required`);
  assert(closeColumn?.required === true, `${label}: Close column must be required`);
  assert(dateColumn?.dataType === 'iso_date_yyyy_mm_dd', `${label}: Date column data type mismatch`);
  assert(closeColumn?.dataType === 'decimal_price', `${label}: Close column data type mismatch`);

  const range = design.expectedPriceRange || {};
  assert(
    typeof range.minPlausibleClose === 'number',
    `${label}: expectedPriceRange.minPlausibleClose must be numeric`
  );
  assert(
    typeof range.maxPlausibleClose === 'number',
    `${label}: expectedPriceRange.maxPlausibleClose must be numeric`
  );
  assert(
    range.minPlausibleClose < range.maxPlausibleClose,
    `${label}: expectedPriceRange min must be less than max`
  );
}

function assertRejectedFormatScenarios(report, label) {
  const scenarios = Array.isArray(report.rejectedFormatScenarios)
    ? report.rejectedFormatScenarios
    : [];
  const scenarioNames = scenarios.map((item) => item.scenario);
  const distinctScenarioCount = new Set(scenarioNames).size;
  assert(distinctScenarioCount >= 6, `${label}: rejectedFormatScenarios must contain at least 6 distinct scenarios`);

  const serialized = JSON.stringify(scenarios);
  assert(/HTML/i.test(serialized), `${label}: rejectedFormatScenarios must include HTML masquerade scenario`);
  assert(
    /(NaN|null|empty Close|Missing prices|substitute|interpolation)/i.test(serialized),
    `${label}: rejectedFormatScenarios must include missing price or fabrication scenario`
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
    'noSourceFormatApproval',
    'noPriceFabrication',
    'noHtmlErrorPageMasquerade',
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
    report.contractVersion === 'v28.0M-20-source-format-verification-design-1',
    `${label}: unexpected contractVersion`
  );
  assert(
    report.kind === 'market_pricing_source_format_verification_design',
    `${label}: unexpected kind`
  );
  assert(
    report.status === 'source_format_design_only_not_verified',
    `${label}: unexpected status`
  );
  assert(report.targetAsset === 'qqq', `${label}: targetAsset must remain qqq`);
  assertRequiredFlagsFalse(report, label);
  assert(
    report.sourceFormatVerificationStatus === 'not_verified',
    `${label}: sourceFormatVerificationStatus must remain not_verified`
  );
  assert(report.sourceFormatDesignReviewed === true, `${label}: sourceFormatDesignReviewed must remain true`);
  assert(report.noPriceFabrication === true, `${label}: noPriceFabrication must remain true`);
  assert(report.noHtmlErrorPageMasquerade === true, `${label}: noHtmlErrorPageMasquerade must remain true`);
  assert(
    report.symbolMappingVerificationStatus === 'not_verified',
    `${label}: symbolMappingVerificationStatus must remain not_verified`
  );
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
  assertCandidateSourceFormatDesign(report, label);
  assertFormatChecklist(report, label);
  assertRejectedFormatScenarios(report, label);
  assertPipelineAssignment(report, label);
  assertBoundaryFlags(report, label);
  assertNoUrlOrSensitiveFields(report, label);
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(FIXTURE_PATH), 'source format verification design fixture is missing');
  assert(
    !fs.existsSync(DISALLOWED_EXECUTABLE_PATH),
    'design layer must not add scripts/market-pricing/source-format-verification-design.mjs'
  );

  const fixture = readJson(FIXTURE_PATH);
  assertDesignFixture(fixture, 'source format verification design fixture');
  assertProtectedFilesUnchanged(snapshot, 'source format verification design check');

  if (errors.length > 0) {
    console.error('Market pricing source format verification design: FAIL');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Market pricing source format verification design: PASS');
}

main();
