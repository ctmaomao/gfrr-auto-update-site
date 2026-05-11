import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const ARCHITECTURE_DOC = 'docs/UNIFIED_DATA_PIPELINE_ARCHITECTURE.md';
const ARCHITECTURE_FIXTURE =
  'docs/fixtures/data-pipeline/unified-data-pipeline-architecture-v28.0M-15A.json';

const MARKET_PRICING_SCRIPTS = [
  'scripts/market-pricing/source-adapter-dry-run.mjs',
  'scripts/market-pricing/artifact-fetch-scaffold.mjs',
  'scripts/market-pricing/artifact-sanitizer-scaffold.mjs',
  'scripts/market-pricing/source-specific-artifact-fetch-scaffold.mjs'
];

const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json'
];

const REQUIRED_DOC_PHRASES = [
  'Daily GitHub Actions',
  'Cloudflare Worker',
  '3-minute',
  'GitHub Actions backup',
  'six checks',
  'daily_history_layer',
  'realtime_worker_layer',
  'github_actions_backup_validation_layer',
  'artifact_sanitizer_layer',
  'frontend_display_layer',
  'no isolated data pipelines',
  'market-pricing-history belongs to daily_history_layer',
  'Market Pricing must not use Cloudflare Worker as the primary weekly-history builder',
  'backup checks must not bypass sanitizer',
  'no calculation without 60 validated weekly observations',
  'waiting-for-history',
  'no SPX-as-Nasdaq-temperature'
];

const ALLOWED_LAYERS = new Set([
  'daily_history_layer',
  'realtime_worker_layer',
  'github_actions_backup_validation_layer',
  'artifact_sanitizer_layer',
  'frontend_display_layer'
]);

const FORBIDDEN_LAYER_VALUES = new Set(['standalone', 'ad_hoc']);

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
    assert(after === before, `${relativePath} changed during architecture check.`);
  }
}

function assertNoUrls(text, label) {
  assert(!/https?:\/\//i.test(text), `${label} must not contain source URLs.`);
}

function assertArchitectureDoc() {
  assert(fs.existsSync(absolute(ARCHITECTURE_DOC)), 'Unified architecture doc is missing.');
  const doc = readText(ARCHITECTURE_DOC);
  const docLower = normalize(doc);

  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(
      docLower.includes(normalize(phrase)),
      `Unified architecture doc is missing phrase: ${phrase}`
    );
  }

  assertNoUrls(doc, ARCHITECTURE_DOC);
}

function assertAllowedLayers(fixture) {
  assert(Array.isArray(fixture.allowedLayers), 'allowedLayers must be an array.');
  const layerSet = new Set(fixture.allowedLayers);
  for (const layer of ALLOWED_LAYERS) {
    assert(layerSet.has(layer), `allowedLayers missing ${layer}.`);
  }
  for (const layer of fixture.allowedLayers) {
    assert(ALLOWED_LAYERS.has(layer), `Unexpected allowed layer: ${layer}`);
    assert(!FORBIDDEN_LAYER_VALUES.has(layer), `Forbidden layer value: ${layer}`);
  }
}

function assertNoApprovalFlagsTrue(fixture) {
  for (const entry of collectEntries(fixture)) {
    const key = entry.normalizedKey;
    const isApprovalFlag =
      key.endsWith('approved') ||
      key.endsWith('approval') ||
      key === 'readyforproductionwrite';
    if (isApprovalFlag) {
      assert(entry.value === false, `Approval flag must not be true: ${entry.path}`);
    }
  }
}

function assertNoFixtureLeakage(fixtureText, fixture) {
  assertNoUrls(fixtureText, ARCHITECTURE_FIXTURE);
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
    if (typeof entry.value === 'string') {
      assert(
        !FORBIDDEN_LAYER_VALUES.has(entry.value),
        `Fixture must not contain forbidden pipeline value at ${entry.path}.`
      );
    }
  }
  assertNoApprovalFlagsTrue(fixture);
}

function assertArchitectureFixture() {
  assert(
    fs.existsSync(absolute(ARCHITECTURE_FIXTURE)),
    'Unified architecture fixture is missing.'
  );
  const fixtureText = readText(ARCHITECTURE_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(
    fixture.contractVersion === 'v28.0M-15A-unified-data-pipeline-architecture-1',
    'Unexpected fixture contractVersion.'
  );
  assert(
    fixture.kind === 'unified_data_pipeline_architecture',
    'Unexpected fixture kind.'
  );
  assert(fixture.status === 'architecture_sync_only', 'Unexpected fixture status.');
  assert(fixture.runtimeBehaviorChanged === false, 'runtimeBehaviorChanged must be false.');
  assert(fixture.dataWritten === false, 'dataWritten must be false.');
  assert(fixture.workflowChanged === false, 'workflowChanged must be false.');

  assertAllowedLayers(fixture);

  const assignments = fixture.sourceAssignments || {};
  const marketHistory = assignments.market_pricing_history || {};
  assert(
    marketHistory.assignedLayer === 'daily_history_layer',
    'market_pricing_history assignedLayer mismatch.'
  );
  assert(
    marketHistory.artifactOnlyBeforeProduction === true,
    'market_pricing_history must be artifact-only before production.'
  );
  assert(
    marketHistory.sanitizerRequired === true,
    'market_pricing_history must require sanitizer.'
  );
  assert(
    marketHistory.productionWriterRequired === true,
    'market_pricing_history must require production writer.'
  );
  assert(marketHistory.recordsPresent === false, 'market_pricing_history recordsPresent must be false.');
  assert(
    marketHistory.calculationApproved === false,
    'market_pricing_history calculationApproved must be false.'
  );

  const sourceArtifacts = assignments.market_pricing_source_specific_artifacts || {};
  assert(
    sourceArtifacts.assignedLayer === 'artifact_sanitizer_layer',
    'source-specific artifacts assignedLayer mismatch.'
  );
  assert(sourceArtifacts.sourceApproved === false, 'sourceApproved must be false.');
  assert(sourceArtifacts.liveFetchApproved === false, 'liveFetchApproved must be false.');

  const realtime = assignments.realtime_fast_variables || {};
  assert(
    realtime.assignedLayer === 'realtime_worker_layer',
    'realtime_fast_variables assignedLayer mismatch.'
  );
  assert(
    String(realtime.workerCadence || '').includes('3'),
    'realtime_fast_variables workerCadence must include 3.'
  );

  const backup = assignments.github_actions_backup_validation || {};
  assert(
    backup.assignedLayer === 'github_actions_backup_validation_layer',
    'github_actions_backup_validation assignedLayer mismatch.'
  );
  assert(
    String(backup.approximateCadence || '').includes('six'),
    'github_actions_backup_validation approximateCadence must include six.'
  );
  assert(backup.mayBypassSanitizer === false, 'Backup validation must not bypass sanitizer.');
  assert(
    backup.mayWriteMarketPricingHistoryDirectly === false,
    'Backup validation must not write market-pricing history directly.'
  );

  assert(fixture.boundaries?.noFetch === true, 'boundaries.noFetch must be true.');
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
  assert(
    fixture.boundaries?.noFrontendChange === true,
    'boundaries.noFrontendChange must be true.'
  );

  assertNoFixtureLeakage(fixtureText, fixture);
}

function assertMarketPricingScriptsRemainLocalOnly() {
  for (const relativePath of MARKET_PRICING_SCRIPTS) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const pattern of FORBIDDEN_SCRIPT_PATTERNS) {
      assert(
        !source.includes(pattern),
        `${relativePath} contains forbidden live-fetch pattern: ${pattern}`
      );
    }
    assertNoUrls(source, relativePath);
  }
}

function main() {
  const snapshot = snapshotProtectedFiles();
  assertArchitectureDoc();
  assertArchitectureFixture();
  assertMarketPricingScriptsRemainLocalOnly();
  assertProtectedFilesUnchanged(snapshot);
  console.log('Unified data pipeline architecture: PASS');
}

main();
