import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DESIGN_FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'manual-weekly-input-sanitizer-design-v28.0M-22.json'
);
const M21_MANIFEST_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'network-open-throttled-manifest-v28.0M-21.json'
);
const INCIDENT_LOG_PATH = path.join(
  ROOT,
  'docs',
  'MARKET_PRICING_SOURCE_INCIDENT_LOG.md'
);
const DISALLOWED_SANITIZER_SCRIPT_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'manual-weekly-input-sanitizer-design.mjs'
);
const EXPECTED_STOOQ_URL = 'https://stooq.com/q/d/l/?s=qqq.us&i=d';
const EXPECTED_NASDAQ_DOC_URL =
  'https://www.nasdaq.com/market-activity/etf/qqq/historical';
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
  'symbolMappingVerified',
  'sourceFormatVerified',
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

function collectUrlFields(value, pathParts = [], matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUrlFields(item, [...pathParts, String(index)], matches));
    return matches;
  }

  if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextPath = [...pathParts, key];
      if (String(key).toLowerCase().includes('url') && typeof nestedValue === 'string') {
        matches.push({
          path: nextPath.join('.'),
          value: nestedValue
        });
      }
      collectUrlFields(nestedValue, nextPath, matches);
    }
  }

  return matches;
}

function assertOnlyDocumentationUrlInDesignFixture(report) {
  const urlFields = collectUrlFields(report);
  assert(urlFields.length === 1, 'design fixture: only the NASDAQ documentation URL field is allowed');
  assert(
    urlFields[0]?.path === 'expectedDownloadSource.url',
    'design fixture: URL must only be expectedDownloadSource.url'
  );
  assert(
    urlFields[0]?.value === EXPECTED_NASDAQ_DOC_URL,
    'design fixture: expectedDownloadSource.url mismatch'
  );
  assert(
    /documentation only/i.test(JSON.stringify(report.expectedDownloadSource?.notes || [])),
    'design fixture: NASDAQ URL must be explicitly documentation-only'
  );
}

function assertDesignFixture(report) {
  assert(
    report.contractVersion === 'v28.0M-22-manual-weekly-input-sanitizer-design-1',
    'design fixture: unexpected contractVersion'
  );
  assert(
    report.kind === 'market_pricing_manual_weekly_input_sanitizer_design',
    'design fixture: unexpected kind'
  );
  assert(
    report.status === 'manual_weekly_input_sanitizer_design_only_not_implemented',
    'design fixture: unexpected status'
  );
  assert(report.targetAsset === 'qqq', 'design fixture: targetAsset must remain qqq');
  assert(report.targetSymbol === 'QQQ', 'design fixture: targetSymbol must remain QQQ');
  assert(report.sanitizerImplementationExists === false, 'design fixture: sanitizerImplementationExists must be false');
  assert(report.sanitizerDesignReviewed === true, 'design fixture: sanitizerDesignReviewed must be true');
  assert(
    report.manualInputDirectoryContract?.path ===
      'manual-artifacts/market-pricing/manual-weekly-input/',
    'design fixture: manual input path mismatch'
  );
  assert(
    report.manualInputDirectoryContract?.filenamePattern === '<yyyy-mm-dd>.csv',
    'design fixture: filename pattern mismatch'
  );
  assert(
    report.manualInputDirectoryContract?.isGitignored === true,
    'design fixture: manual input path must be gitignored'
  );
  assert(
    report.expectedCsvFormat?.exactHeaderRow === 'Date,Close/Last,Volume,Open,High,Low',
    'design fixture: exact header row mismatch'
  );
  assert(
    String(report.dateConversionRule?.inputFormat || '').startsWith('US MM/DD/YYYY'),
    'design fixture: dateConversionRule.inputFormat mismatch'
  );
  assert(
    String(report.dateConversionRule?.outputFormat || '').startsWith('ISO YYYY-MM-DD'),
    'design fixture: dateConversionRule.outputFormat mismatch'
  );
  assert(
    String(report.dateConversionRule?.interpretationLock || '').includes('US convention'),
    'design fixture: interpretationLock must contain US convention'
  );
  assert(
    report.columnMappingRule?.['Close/Last'] === 'close',
    'design fixture: Close/Last must map to close'
  );
  assert(
    String(report.weeklyExtractionRule?.weekDefinition || '').includes('ISO 8601'),
    'design fixture: weeklyExtractionRule.weekDefinition must mention ISO 8601'
  );
  assert(
    report.plausibilityBounds?.minPlausibleClose === 80.0,
    'design fixture: minPlausibleClose must be 80'
  );
  assert(
    report.plausibilityBounds?.maxPlausibleClose === 1000.0,
    'design fixture: maxPlausibleClose must be 1000'
  );
  assert(
    Array.isArray(report.rejectionScenarios) && report.rejectionScenarios.length >= 6,
    'design fixture: rejectionScenarios must contain at least 6 entries'
  );
  assert(report.noPriceFabrication === true, 'design fixture: noPriceFabrication must be true');
  assert(
    report.noHtmlErrorPageMasquerade === true,
    'design fixture: noHtmlErrorPageMasquerade must be true'
  );
  assert(report.records?.length === 0, 'design fixture: records must remain empty');
  assert(report.designLayerOnly === true, 'design fixture: designLayerOnly must be true');
  assert(
    report.scaffoldExecutableExists === false,
    'design fixture: scaffoldExecutableExists must be false'
  );
  assert(report.manualInputDirectoryContractDefined === true, 'design fixture: manualInputDirectoryContractDefined must be true');
  assert(report.weeklyExtractionRuleDefined === true, 'design fixture: weeklyExtractionRuleDefined must be true');
  assert(report.isoConversionRuleDefined === true, 'design fixture: isoConversionRuleDefined must be true');
  assert(report.nasdaqColumnMappingDefined === true, 'design fixture: nasdaqColumnMappingDefined must be true');
  assertRequiredFalseFlags(report, 'design fixture');
  assertOnlyDocumentationUrlInDesignFixture(report);

  const boundaries = report.boundaries || {};
  assert(boundaries.designLayerOnly === true, 'design fixture: boundaries.designLayerOnly must be true');
  assert(boundaries.noScaffoldExecutable === true, 'design fixture: boundaries.noScaffoldExecutable must be true');
  assert(boundaries.noLiveFetch === true, 'design fixture: boundaries.noLiveFetch must be true');
  assert(boundaries.noNetworkEnabled === true, 'design fixture: boundaries.noNetworkEnabled must be true');
  assert(boundaries.noProductionWrite === true, 'design fixture: boundaries.noProductionWrite must be true');
  assert(boundaries.noHistoryWrite === true, 'design fixture: boundaries.noHistoryWrite must be true');
  assert(boundaries.noWorkflowChange === true, 'design fixture: boundaries.noWorkflowChange must be true');
  assert(boundaries.noCalculation === true, 'design fixture: boundaries.noCalculation must be true');
  assert(boundaries.noFrontendChange === true, 'design fixture: boundaries.noFrontendChange must be true');
  assert(boundaries.affectsScoring === false, 'design fixture: boundaries.affectsScoring must be false');
  assert(boundaries.affectsDecisionModel === false, 'design fixture: boundaries.affectsDecisionModel must be false');
  assert(boundaries.affectsExecutionLock === false, 'design fixture: boundaries.affectsExecutionLock must be false');
  assert(boundaries.affectsPositionGuidance === false, 'design fixture: boundaries.affectsPositionGuidance must be false');
}

function assertM21ManifestDeprecation(manifest) {
  const source = manifest.allowedSources?.[0] || {};
  assert(
    source.status === 'deprecated_2026-05-12',
    'M-21 manifest: stooq status must be deprecated_2026-05-12'
  );
  assert(
    String(source.deprecationReason || '').includes('API key'),
    'M-21 manifest: deprecationReason must mention API key'
  );
  assert(Boolean(source.deprecatedAt), 'M-21 manifest: deprecatedAt must exist');
  assert(source.url === EXPECTED_STOOQ_URL, 'M-21 manifest: stooq URL must remain unchanged');
  assert(Array.isArray(manifest.activeSources), 'M-21 manifest: activeSources must be an array');
  assert(manifest.activeSources.length === 0, 'M-21 manifest: activeSources must be empty');
}

function assertIncidentLog() {
  assert(fs.existsSync(INCIDENT_LOG_PATH), 'incident log document is missing');
  const text = readText(INCIDENT_LOG_PATH);
  assert(/stooq/i.test(text), 'incident log must mention stooq');
  assert(text.includes('2026-05-12'), 'incident log must mention 2026-05-12');
  assert(text.includes('API key'), 'incident log must mention API key');
}

function assertMarketPricingHistoryHasNoRecords() {
  const history = readJson(path.join(ROOT, 'data', 'market-pricing-history.json'));
  const assets = history.assets || {};

  for (const [asset, value] of Object.entries(assets)) {
    assert(Array.isArray(value.records), `market-pricing history: ${asset}.records must be an array`);
    assert(value.records.length === 0, `market-pricing history: ${asset}.records must remain empty`);
  }
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(DESIGN_FIXTURE_PATH), 'M-22 design fixture is missing');
  assert(fs.existsSync(M21_MANIFEST_PATH), 'M-21 manifest fixture is missing');
  assert(
    !fs.existsSync(DISALLOWED_SANITIZER_SCRIPT_PATH),
    'design layer must not add scripts/market-pricing/manual-weekly-input-sanitizer-design.mjs'
  );

  const designFixture = readJson(DESIGN_FIXTURE_PATH);
  const manifest = readJson(M21_MANIFEST_PATH);

  assertDesignFixture(designFixture);
  assertM21ManifestDeprecation(manifest);
  assertIncidentLog();
  assertMarketPricingHistoryHasNoRecords();
  assertProtectedFilesUnchanged(snapshot, 'manual weekly input sanitizer design check');

  if (errors.length > 0) {
    console.error('Market pricing manual weekly input sanitizer design: FAIL');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Market pricing manual weekly input sanitizer design: PASS');
}

main();
