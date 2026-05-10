import fs from 'fs';
import path from 'path';
import {
  buildArtifactSanitizerScaffoldReport,
  sanitizeArtifactFile
} from './market-pricing/artifact-sanitizer-scaffold.mjs';

const ROOT = process.cwd();
const SCAFFOLD_PATH =
  'scripts/market-pricing/artifact-sanitizer-scaffold.mjs';
const VALID_SYNTHETIC_FIXTURE =
  'docs/fixtures/market-pricing/artifact-sanitizer-real-record-valid-synthetic-v28.0M-12.json';
const INVALID_SYNTHETIC_FIXTURE =
  'docs/fixtures/market-pricing/artifact-sanitizer-real-record-invalid-synthetic-v28.0M-12.json';
const VALID_M10_FIXTURE =
  'docs/fixtures/market-pricing/artifact-sanitizer-scaffold-valid-v28.0M-10.json';
const INVALID_M10_FIXTURE =
  'docs/fixtures/market-pricing/artifact-sanitizer-scaffold-invalid-v28.0M-10.json';
const SYNTHETIC_OUTPUT =
  'manual-artifacts/market-pricing/real-record-sanitizer-scaffold-latest.json';
const INVALID_SYNTHETIC_OUTPUT =
  'manual-artifacts/market-pricing/real-record-sanitizer-invalid-latest.json';

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

const PRODUCTION_ASSET_MARKERS = [
  'QQQ',
  'NDX',
  'IXIC',
  'SPX'
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

function snapshotProtectedFiles() {
  return new Map(
    PROTECTED_FILES.map((relativePath) => [relativePath, readText(relativePath)])
  );
}

function assertProtectedFilesUnchanged(snapshot) {
  for (const [relativePath, before] of snapshot.entries()) {
    const after = readText(relativePath);
    assert(after === before, `${relativePath} changed during M-12 check.`);
  }
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
      normalizedKey: key.toLowerCase().replace(/[^a-z0-9]/g, ''),
      path: `${trail}.${key}`,
      value: child
    });
    collectEntries(child, entries, `${trail}.${key}`);
  }
  return entries;
}

function assertStaticSourceContract() {
  assert(fs.existsSync(absolute(SCAFFOLD_PATH)), 'Sanitizer scaffold is missing.');
  const source = readText(SCAFFOLD_PATH);
  assert(
    source.includes('v28.0M-12-real-record-synthetic-1'),
    'Sanitizer scaffold must recognize the M-12 synthetic real-record contract.'
  );
  assert(
    source.includes('market_pricing_real_record_artifact'),
    'Sanitizer scaffold must recognize real-record artifact kind.'
  );

  for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
    assert(
      !source.includes(pattern),
      `Sanitizer scaffold contains forbidden source pattern: ${pattern}`
    );
  }

  assert(!/https?:\/\//i.test(source), 'Sanitizer scaffold must not contain URLs.');

  for (const protectedPath of PROTECTED_WRITE_PATHS) {
    const escapedPath = protectedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const writeOperationPattern = new RegExp(
      `(writeFileSync|appendFileSync|createWriteStream)\\s*\\([^)]*${escapedPath}`,
      's'
    );
    assert(
      !writeOperationPattern.test(source),
      `Sanitizer scaffold must not write ${protectedPath}.`
    );
  }
}

function assertFixtureBase(relativePath, artifact) {
  assert(
    relativePath.startsWith('docs/fixtures/market-pricing/'),
    `${relativePath} must stay under docs/fixtures/market-pricing/.`
  );
  assert(artifact.assetKey === 'fixture_asset', `${relativePath} assetKey must be fixture_asset.`);
  assert(artifact.symbol === 'FIXTURE', `${relativePath} symbol must be FIXTURE.`);
  assert(artifact.fixtureOnly === true, `${relativePath} fixtureOnly must be true.`);
  assert(artifact.syntheticOnly === true, `${relativePath} syntheticOnly must be true.`);
  assert(
    artifact.productionDataWritten !== true,
    `${relativePath} must not set productionDataWritten=true.`
  );
  assert(
    artifact.historyFileModified !== true,
    `${relativePath} must not set historyFileModified=true.`
  );
  assert(
    artifact.validation?.readyForProductionWrite !== true,
    `${relativePath} must not set readyForProductionWrite=true.`
  );

  const fixtureText = readText(relativePath);
  for (const marker of PRODUCTION_ASSET_MARKERS) {
    assert(!fixtureText.includes(marker), `${relativePath} must not mention ${marker}.`);
  }
  assert(!/https?:\/\//i.test(fixtureText), `${relativePath} must not contain URLs.`);
  assert(
    !fixtureText.includes('manual-artifacts'),
    `${relativePath} must not reference manual-artifacts.`
  );
}

function assertValidFixtureSafety(relativePath, artifact) {
  assertFixtureBase(relativePath, artifact);
  assert(artifact.kind === 'market_pricing_real_record_artifact', 'Valid fixture kind mismatch.');
  assert(artifact.status === 'synthetic_fixture_only', 'Valid fixture status mismatch.');
  assert(artifact.artifactOnly === true, 'Valid fixture must be artifactOnly.');
  assert(Array.isArray(artifact.records), 'Valid fixture records must be an array.');
  assert(artifact.records.length === 3, 'Valid fixture must include three synthetic records.');

  const entries = collectEntries(artifact);
  for (const entry of entries) {
    const normalized = entry.normalizedKey;
    assert(normalized !== 'ma60', `Valid fixture must not contain ma60: ${entry.path}`);
    assert(normalized !== 'zscore', `Valid fixture must not contain zScore: ${entry.path}`);
    assert(
      normalized !== 'standarddeviation',
      `Valid fixture must not contain standardDeviation: ${entry.path}`
    );
    assert(
      normalized !== 'temperature',
      `Valid fixture must not contain temperature: ${entry.path}`
    );
    assert(normalized !== 'signal', `Valid fixture must not contain signal: ${entry.path}`);
    assert(normalized !== 'buy', `Valid fixture must not contain buy: ${entry.path}`);
    assert(normalized !== 'sell', `Valid fixture must not contain sell: ${entry.path}`);
    assert(normalized !== 'short', `Valid fixture must not contain short: ${entry.path}`);
    assert(
      normalized !== 'inverseetf',
      `Valid fixture must not contain inverseEtf: ${entry.path}`
    );
    assert(
      normalized !== 'allocation',
      `Valid fixture must not contain allocation: ${entry.path}`
    );
    assert(
      normalized !== 'positionadvice',
      `Valid fixture must not contain positionAdvice: ${entry.path}`
    );
    assert(normalized !== 'sourceurl', `Valid fixture must not contain sourceUrl: ${entry.path}`);
    assert(normalized !== 'headers', `Valid fixture must not contain headers: ${entry.path}`);
    assert(normalized !== 'apikey', `Valid fixture must not contain apiKey: ${entry.path}`);
    assert(
      normalized !== 'authorization',
      `Valid fixture must not contain authorization: ${entry.path}`
    );
    assert(normalized !== 'token', `Valid fixture must not contain token: ${entry.path}`);
  }
}

function assertInvalidFixtureSafety(relativePath, artifact) {
  assertFixtureBase(relativePath, artifact);
  assert(artifact.kind === 'market_pricing_real_record_artifact', 'Invalid fixture kind mismatch.');
  assert(artifact.status === 'synthetic_fixture_only', 'Invalid fixture status mismatch.');
  assert(artifact.artifactOnly === true, 'Invalid fixture must be artifactOnly.');
  assert(Array.isArray(artifact.records), 'Invalid fixture records must be an array.');
  assert(artifact.records.length > 0, 'Invalid fixture must exercise record rejection.');

  for (const record of artifact.records) {
    assert(
      record.providerSymbol === undefined || record.providerSymbol === 'FIXTURE',
      'Invalid fixture must not use production provider symbols.'
    );
  }
}

function assertBaseOutputBoundaries(report) {
  assert(report.recordsAcceptedForHistory === 0, 'recordsAcceptedForHistory must remain 0.');
  assert(report.readyForProductionWrite === false, 'readyForProductionWrite must stay false.');
  assert(report.productionDataWritten === false, 'productionDataWritten must stay false.');
  assert(report.historyFileModified === false, 'historyFileModified must stay false.');
  assert(report.radarDataModified === false, 'radarDataModified must stay false.');
  assert(report.calculationPerformed === false, 'calculationPerformed must stay false.');
  assert(report.boundaries?.affectsScoring === false, 'affectsScoring must stay false.');
  assert(
    report.boundaries?.affectsDecisionModel === false,
    'affectsDecisionModel must stay false.'
  );
  assert(
    report.boundaries?.affectsExecutionLock === false,
    'affectsExecutionLock must stay false.'
  );
  assert(
    report.boundaries?.affectsPositionGuidance === false,
    'affectsPositionGuidance must stay false.'
  );
}

function assertValidSyntheticFixture(snapshot) {
  const artifact = readJson(VALID_SYNTHETIC_FIXTURE);
  assertValidFixtureSafety(VALID_SYNTHETIC_FIXTURE, artifact);

  const result = sanitizeArtifactFile(VALID_SYNTHETIC_FIXTURE, SYNTHETIC_OUTPUT);
  const { report } = result;
  assert(
    report.status === 'pass_synthetic_real_record_scaffold',
    `Unexpected valid synthetic status: ${report.status}`
  );
  assert(report.recordsInspected === 3, 'Valid synthetic recordsInspected must be 3.');
  assert(
    report.recordsStructurallyValid === 3,
    'Valid synthetic recordsStructurallyValid must be 3.'
  );
  assert(report.recordsRejected === 0, 'Valid synthetic recordsRejected must be 0.');
  assertBaseOutputBoundaries(report);
  assertProtectedFilesUnchanged(snapshot);
}

function assertReasonIncludes(report, fragment, label) {
  const reasons = [
    ...(report.recordsRejectedReasons ?? []),
    ...(report.rejectionReasons ?? [])
  ];
  assert(
    reasons.some((reason) => reason.includes(fragment)),
    `Invalid synthetic report must reject ${label}.`
  );
}

function assertInvalidSyntheticFixture(snapshot) {
  const artifact = readJson(INVALID_SYNTHETIC_FIXTURE);
  assertInvalidFixtureSafety(INVALID_SYNTHETIC_FIXTURE, artifact);

  const result = sanitizeArtifactFile(INVALID_SYNTHETIC_FIXTURE, INVALID_SYNTHETIC_OUTPUT);
  const { report } = result;
  assert(report.status === 'invalid_artifact', `Unexpected invalid status: ${report.status}`);
  assert(report.recordsInspected > 0, 'Invalid fixture must inspect records.');
  assert(
    report.recordsStructurallyValid < report.recordsInspected,
    'Invalid fixture must have fewer valid records than inspected records.'
  );
  assertBaseOutputBoundaries(report);
  assertReasonIncludes(report, 'duplicate_date', 'duplicate date');
  assertReasonIncludes(report, 'unsorted_date', 'unsorted date');
  assertReasonIncludes(report, 'non_positive_price', 'non-positive price');
  assertReasonIncludes(report, 'forbidden_calculation_field', 'forbidden calculation field');
  assertReasonIncludes(report, 'forbidden_trading_advice_field', 'forbidden trading/advice field');
  assertReasonIncludes(report, 'forbidden_source_field', 'source leakage field');
  assertProtectedFilesUnchanged(snapshot);
}

function assertM10Compatibility(snapshot) {
  const validM10 = buildArtifactSanitizerScaffoldReport(
    VALID_M10_FIXTURE,
    readJson(VALID_M10_FIXTURE)
  );
  assert(
    validM10.status === 'pass_scaffold_only',
    `M-10 valid fixture regressed: ${validM10.status}`
  );
  assertBaseOutputBoundaries(validM10);

  const invalidM10 = buildArtifactSanitizerScaffoldReport(
    INVALID_M10_FIXTURE,
    readJson(INVALID_M10_FIXTURE)
  );
  assert(
    invalidM10.status === 'invalid_artifact',
    `M-10 invalid fixture regressed: ${invalidM10.status}`
  );
  assertBaseOutputBoundaries(invalidM10);
  assertProtectedFilesUnchanged(snapshot);
}

function assertManualArtifactsNotCommitted() {
  const indexPath = absolute('.git/index');
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
  assertValidSyntheticFixture(snapshot);
  assertInvalidSyntheticFixture(snapshot);
  assertM10Compatibility(snapshot);
  assertManualArtifactsNotCommitted();
  assertProtectedFilesUnchanged(snapshot);
  console.log('Market pricing real-record sanitizer scaffold: PASS');
}

main();
