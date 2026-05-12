import fs from 'node:fs';
import path from 'node:path';
import { buildMarketPricingNetworkOpenThrottledReport } from './market-pricing/network-open-throttled-scaffold.mjs';

const ROOT = process.cwd();
const DESIGN_FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'network-open-throttled-design-v28.0M-21.json'
);
const MANIFEST_FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'network-open-throttled-manifest-v28.0M-21.json'
);
const SCAFFOLD_SCRIPT_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'network-open-throttled-scaffold.mjs'
);
const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json'
];
const REQUIRED_FALSE_FLAGS = [
  'sourceApproved',
  'liveFetchApproved',
  'sourceComplianceReviewed',
  'symbolMappingVerified',
  'sourceFormatVerified',
  'sourceSelectionFinalized',
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

function assertRequiredFlagsFalse(report, label) {
  for (const field of REQUIRED_FALSE_FLAGS) {
    assert(report[field] === false, `${label}: ${field} must remain false`);
  }
}

function assertDesignFixture(report) {
  assert(
    report.contractVersion === 'v28.0M-21-network-open-throttled-design-1',
    'design fixture: unexpected contractVersion'
  );
  assert(
    report.kind === 'market_pricing_network_open_throttled_design',
    'design fixture: unexpected kind'
  );
  assert(
    report.status === 'network_open_throttled_design_dry_run_only',
    'design fixture: unexpected status'
  );
  assert(report.targetAsset === 'qqq', 'design fixture: targetAsset must remain qqq');
  assert(report.targetSymbol === 'QQQ', 'design fixture: targetSymbol must remain QQQ');
  assert(
    report.sourceCandidate === 'stooq_public_csv_qqq',
    'design fixture: sourceCandidate mismatch'
  );
  assert(report.networkOpenAllowedInDesign === true, 'design fixture: design open flag must be true');
  assert(
    report.networkOpenAllowedInRuntime === false,
    'design fixture: runtime open flag must be false'
  );
  assert(report.networkOpenedThisRun === false, 'design fixture: networkOpenedThisRun must be false');
  assert(report.networkAllowed === false, 'design fixture: networkAllowed must be false');
  assert(report.networkRequestRejected === false, 'design fixture: networkRequestRejected must be false');
  assert(report.fetchAttemptCount === 0, 'design fixture: fetchAttemptCount must be 0');
  assert(report.recordsWrittenToHistory === 0, 'design fixture: recordsWrittenToHistory must be 0');
  assert(report.recordsWrittenToData === 0, 'design fixture: recordsWrittenToData must be 0');
  assert(report.manualArtifactWritten === false, 'design fixture: manualArtifactWritten must be false');
  assertRequiredFlagsFalse(report, 'design fixture');
  assert(report.sourceUrlPersistenceAllowed === true, 'design fixture: manifest URL persistence must be true');
  assert(report.artifactOnly === true, 'design fixture: artifactOnly must be true');
  assert(
    report.manualArtifactsLayerOnly === true,
    'design fixture: manualArtifactsLayerOnly must be true'
  );
  assert(
    report.verificationRequiresSeparateApproval === true,
    'design fixture: verificationRequiresSeparateApproval must be true'
  );
  assert(Array.isArray(report.records), 'design fixture: records must be an array');
  assert(report.records.length === 0, 'design fixture: records must remain empty');

  const policy = report.fetchPolicy || {};
  assert(policy.maxFetchPerInvocation === 1, 'design fixture: maxFetchPerInvocation must be 1');
  assert(policy.timeoutSeconds === 30, 'design fixture: timeoutSeconds must be 30');
  assert(policy.maxRetries === 1, 'design fixture: maxRetries must be 1');
  assert(
    policy.followRedirectsAcrossHostnames === false,
    'design fixture: cross-host redirects must be false'
  );
  assert(
    policy.requiresExplicitNetworkOpenFlag === true,
    'design fixture: requiresExplicitNetworkOpenFlag must be true'
  );
  assert(
    policy.explicitNetworkOpenFlagName === '--network=open-throttled',
    'design fixture: explicit flag name mismatch'
  );

  const boundaries = report.boundaries || {};
  assert(boundaries.defaultDryRun === true, 'design fixture: boundaries.defaultDryRun must be true');
  assert(
    boundaries.networkOnlyWithExplicitFlag === true,
    'design fixture: boundaries.networkOnlyWithExplicitFlag must be true'
  );
  assert(
    boundaries.singleFetchPerInvocation === true,
    'design fixture: boundaries.singleFetchPerInvocation must be true'
  );
  assert(boundaries.maxTimeoutSeconds === 30, 'design fixture: boundaries.maxTimeoutSeconds must be 30');
  assert(boundaries.noSecretsRead === true, 'design fixture: boundaries.noSecretsRead must be true');
  assert(boundaries.noProcessEnvRead === true, 'design fixture: boundaries.noProcessEnvRead must be true');
  assert(boundaries.noHardcodedUrl === true, 'design fixture: boundaries.noHardcodedUrl must be true');
  assert(boundaries.noProductionWrite === true, 'design fixture: boundaries.noProductionWrite must be true');
  assert(boundaries.noHistoryWrite === true, 'design fixture: boundaries.noHistoryWrite must be true');
  assert(boundaries.noWorkflowChange === true, 'design fixture: boundaries.noWorkflowChange must be true');
  assert(boundaries.noCalculation === true, 'design fixture: boundaries.noCalculation must be true');
  assert(boundaries.noFrontendChange === true, 'design fixture: boundaries.noFrontendChange must be true');
  assert(boundaries.affectsScoring === false, 'design fixture: affectsScoring must be false');
  assert(boundaries.affectsDecisionModel === false, 'design fixture: affectsDecisionModel must be false');
  assert(boundaries.affectsExecutionLock === false, 'design fixture: affectsExecutionLock must be false');
  assert(boundaries.affectsPositionGuidance === false, 'design fixture: affectsPositionGuidance must be false');
}

function assertManifestFixture(manifest) {
  assert(
    manifest.manifestVersion === 'v28.0M-21-network-open-throttled-manifest-1',
    'manifest fixture: unexpected manifestVersion'
  );
  assert(
    manifest.kind === 'market_pricing_network_open_throttled_manifest',
    'manifest fixture: unexpected kind'
  );
  assert(
    Array.isArray(manifest.allowedSources),
    'manifest fixture: allowedSources must be an array'
  );
  assert(manifest.allowedSources.length === 1, 'manifest fixture: allowedSources.length must be 1');

  const source = manifest.allowedSources[0] || {};
  assert(source.id === 'stooq_public_csv_qqq', 'manifest fixture: source id mismatch');
  assert(source.expectedSymbol === 'QQQ', 'manifest fixture: expectedSymbol must be QQQ');
  assert(source.expectedFormat === 'csv', 'manifest fixture: expectedFormat must be csv');
  assert(
    source.expectedContentTypePrefix === 'text/',
    'manifest fixture: expectedContentTypePrefix must be text/'
  );
  assert(source.method === 'GET', 'manifest fixture: method must be GET');
  assert(source.complianceReviewDone === false, 'manifest fixture: compliance must remain false');

  const policy = manifest.policy || {};
  assert(policy.maxFetchPerInvocation === 1, 'manifest fixture: maxFetchPerInvocation must be 1');
  assert(policy.timeoutSeconds === 30, 'manifest fixture: timeoutSeconds must be 30');
  assert(policy.maxRetries === 1, 'manifest fixture: maxRetries must be 1');
  assert(
    policy.followRedirectsAcrossHostnames === false,
    'manifest fixture: cross-host redirects must be false'
  );
  assert(
    Array.isArray(policy.allowedHttpMethods) && policy.allowedHttpMethods.length === 1,
    'manifest fixture: allowedHttpMethods must contain one method'
  );
  assert(policy.allowedHttpMethods[0] === 'GET', 'manifest fixture: allowed method must be GET');
}

function assertGeneratedDryRunReport(report, label) {
  assert(report.networkOpenAllowedInDesign === true, `${label}: design open flag must be true`);
  assert(report.networkOpenAllowedInRuntime === false, `${label}: runtime open flag must be false`);
  assert(report.networkOpenedThisRun === false, `${label}: networkOpenedThisRun must be false`);
  assert(report.networkAllowed === false, `${label}: networkAllowed must be false`);
  assert(report.fetchAttemptCount === 0, `${label}: fetchAttemptCount must be 0`);
  assert(Array.isArray(report.records), `${label}: records must be an array`);
  assert(report.records.length === 0, `${label}: records must remain empty`);
  assert(report.manualArtifactWritten === false, `${label}: manualArtifactWritten must be false`);
  assertRequiredFlagsFalse(report, label);
}

function assertNoForbiddenScaffoldSource() {
  const source = readText(SCAFFOLD_SCRIPT_PATH);
  const protectedWritePattern =
    /(writeFileSync|writeFile|appendFileSync|appendFile)\s*\([^)]*data[\\/]/s;

  assert(!source.includes('process.env'), 'scaffold source must not read process.env');
  assert(!source.includes('Authorization'), 'scaffold source must not insert Authorization headers');
  assert(!source.includes('Cookie'), 'scaffold source must not insert Cookie headers');
  assert(!/https?:\/\//i.test(source), 'scaffold source must not hardcode provider URLs');
  assert(
    source.includes('manual-artifacts/market-pricing/network-fetch-attempts'),
    'scaffold source must hardcode the manual artifact output root'
  );
  assert(!protectedWritePattern.test(source), 'scaffold source must not write to data/');
  assert(source.includes('AbortController'), 'scaffold source must use AbortController');
}

function assertManualArtifactsIgnored() {
  const gitignorePath = path.join(ROOT, '.gitignore');
  const gitignore = fs.existsSync(gitignorePath) ? readText(gitignorePath) : '';
  assert(/(^|\r?\n)manual-artifacts\/?(\r?\n|$)/.test(gitignore), '.gitignore must cover manual-artifacts/');
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(DESIGN_FIXTURE_PATH), 'M-21 design fixture is missing');
  assert(fs.existsSync(MANIFEST_FIXTURE_PATH), 'M-21 manifest fixture is missing');
  assert(fs.existsSync(SCAFFOLD_SCRIPT_PATH), 'M-21 scaffold script is missing');

  const designFixture = readJson(DESIGN_FIXTURE_PATH);
  const manifestFixture = readJson(MANIFEST_FIXTURE_PATH);
  assertDesignFixture(designFixture);
  assertManifestFixture(manifestFixture);

  const defaultReport = buildMarketPricingNetworkOpenThrottledReport({});
  assertGeneratedDryRunReport(defaultReport, 'default dry-run report');

  const forcedDryRunReport = buildMarketPricingNetworkOpenThrottledReport({
    network: 'open-throttled',
    dryRun: true
  });
  assertGeneratedDryRunReport(forcedDryRunReport, 'forced dry-run report');

  assertNoForbiddenScaffoldSource();
  assertManualArtifactsIgnored();
  assertProtectedFilesUnchanged(snapshot, 'network open throttled scaffold check');

  if (errors.length > 0) {
    console.error('Market pricing network open throttled scaffold: FAIL');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Market pricing network open throttled scaffold: PASS');
}

main();
