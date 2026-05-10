import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PROOF_DOC = 'docs/MARKET_PRICING_PROOF_OF_SOURCE_DESIGN.md';
const PROOF_FIXTURE =
  'docs/fixtures/market-pricing/proof-of-source-design-v28.0M-14.json';

const MARKET_PRICING_SCRIPTS = [
  'scripts/market-pricing/source-adapter-dry-run.mjs',
  'scripts/market-pricing/artifact-fetch-scaffold.mjs',
  'scripts/market-pricing/artifact-sanitizer-scaffold.mjs'
];

const PROTECTED_FILES = [
  'data/radar-data.json',
  'data/market-pricing-history.json'
];

const REQUIRED_DOC_PHRASES = [
  'No live fetch',
  'No source approval',
  'No production data write',
  'No history record write',
  'QQQ',
  'Stooq/public CSV',
  'Yahoo-style',
  'FRED',
  'future licensed source',
  'adjustedClose',
  'source compliance',
  'sourceSelectionFinalized=false',
  'sourceApproved=false',
  'liveFetchApproved=false',
  'productionDataWriteApproved=false',
  'marketTemperatureCalculationApproved=false',
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

const REQUIRED_COMPARISON_CANDIDATES = new Set([
  'yahoo_style_candidate',
  'fred_candidate',
  'future_licensed_candidate'
]);

const REQUIRED_SOURCE_REVIEWS = new Set([
  'stooq_public_csv_candidate',
  'yahoo_style_candidate',
  'fred_candidate',
  'future_licensed_candidate'
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
    assert(after === before, `${relativePath} changed during proof-of-source check.`);
  }
}

function assertNoExecutableUrls(text, label) {
  assert(!/https?:\/\//i.test(text), `${label} must not contain executable URLs.`);
}

function assertDesignDoc() {
  assert(fs.existsSync(absolute(PROOF_DOC)), 'Proof-of-source design doc is missing.');
  const doc = readText(PROOF_DOC);
  const docLower = normalize(doc);

  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(
      docLower.includes(normalize(phrase)),
      `Proof-of-source design doc is missing phrase: ${phrase}`
    );
  }
}

function assertSourceReviewFlags(sourceKey, review) {
  assert(review, `Missing sourceCandidateReview entry: ${sourceKey}`);
  assert(review.sourceApproved === false, `${sourceKey} sourceApproved must be false.`);
  assert(review.liveFetchApproved === false, `${sourceKey} liveFetchApproved must be false.`);
  assert(
    review.productionWriteApproved === false,
    `${sourceKey} productionWriteApproved must be false.`
  );
}

function assertProofFixture() {
  assert(fs.existsSync(absolute(PROOF_FIXTURE)), 'Proof-of-source fixture is missing.');
  const fixtureText = readText(PROOF_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(
    fixture.contractVersion === 'v28.0M-14-proof-of-source-design-1',
    'Unexpected proof-of-source fixture contractVersion.'
  );
  assert(
    fixture.kind === 'market_pricing_source_specific_proof_of_source_design',
    'Unexpected proof-of-source fixture kind.'
  );
  assert(
    fixture.status === 'design_only_no_live_fetch',
    'Unexpected proof-of-source fixture status.'
  );
  assert(fixture.sourceSelectionFinalized === false, 'sourceSelectionFinalized must be false.');
  assert(fixture.sourceApproved === false, 'sourceApproved must be false.');
  assert(fixture.liveFetchApproved === false, 'liveFetchApproved must be false.');
  assert(
    fixture.productionDataWriteApproved === false,
    'productionDataWriteApproved must be false.'
  );
  assert(fixture.historyWriteApproved === false, 'historyWriteApproved must be false.');
  assert(
    fixture.marketTemperatureCalculationApproved === false,
    'marketTemperatureCalculationApproved must be false.'
  );
  assert(fixture.targetAsset === 'qqq', 'targetAsset must be qqq.');
  assert(fixture.targetSymbol === 'QQQ', 'targetSymbol must be QQQ.');
  assert(
    fixture.primarySourceCandidate === 'stooq_public_csv_candidate',
    'primarySourceCandidate must be stooq_public_csv_candidate.'
  );

  assert(
    Array.isArray(fixture.comparisonCandidates),
    'comparisonCandidates must be an array.'
  );
  const comparisonCandidates = new Set(fixture.comparisonCandidates);
  for (const candidate of REQUIRED_COMPARISON_CANDIDATES) {
    assert(comparisonCandidates.has(candidate), `Missing comparison candidate: ${candidate}`);
  }

  assert(
    fixture.sourceCandidateReview &&
      typeof fixture.sourceCandidateReview === 'object' &&
      !Array.isArray(fixture.sourceCandidateReview),
    'sourceCandidateReview must be an object.'
  );
  for (const sourceKey of REQUIRED_SOURCE_REVIEWS) {
    assertSourceReviewFlags(sourceKey, fixture.sourceCandidateReview[sourceKey]);
  }

  const stooq = fixture.sourceCandidateReview.stooq_public_csv_candidate;
  assert(
    stooq.sourceComplianceReviewed === false,
    'stooq sourceComplianceReviewed must be false.'
  );
  assert(stooq.sourceFormatVerified === false, 'stooq sourceFormatVerified must be false.');
  assert(
    stooq.symbolMappingVerified === false,
    'stooq symbolMappingVerified must be false.'
  );
  assert(stooq.adjustedCloseAvailable === 'unknown', 'stooq adjustedCloseAvailable must be unknown.');
  assert(
    stooq.weeklyAggregationPolicy === 'not_implemented',
    'stooq weeklyAggregationPolicy must be not_implemented.'
  );

  assert(Array.isArray(fixture.records), 'Fixture records must be an array.');
  assert(fixture.records.length === 0, 'Proof-of-source fixture must not contain records.');
  assertNoExecutableUrls(fixtureText, 'Proof-of-source fixture');
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
  }

  assert(fixture.boundaries?.designOnly === true, 'boundaries.designOnly must be true.');
  assert(fixture.boundaries?.noLiveFetch === true, 'boundaries.noLiveFetch must be true.');
  assert(
    fixture.boundaries?.noProductionWrite === true,
    'boundaries.noProductionWrite must be true.'
  );
  assert(fixture.boundaries?.noHistoryWrite === true, 'boundaries.noHistoryWrite must be true.');
  assert(fixture.boundaries?.noCalculation === true, 'boundaries.noCalculation must be true.');
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
    assertNoExecutableUrls(source, relativePath);
  }
}

function main() {
  const snapshot = snapshotProtectedFiles();
  assertDesignDoc();
  assertProofFixture();
  assertMarketPricingScriptsRemainLocalOnly();
  assertProtectedFilesUnchanged(snapshot);
  console.log('Market pricing proof-of-source design: PASS');
}

main();
