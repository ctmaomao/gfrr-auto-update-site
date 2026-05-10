import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const REVIEW_DOC = 'docs/MARKET_PRICING_SOURCE_SELECTION_REVIEW.md';
const REVIEW_FIXTURE =
  'docs/fixtures/market-pricing/source-selection-review-v28.0M-13.json';

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
  'No production source approval',
  'No production data write',
  'No history record write',
  'QQQ',
  'NDX',
  'IXIC',
  'SPX fallback only',
  'Yahoo-style',
  'Stooq',
  'FRED',
  'future licensed source',
  'adjustedClose',
  'source compliance reviewed',
  '60 weekly observations',
  'sourceSelectionFinalized=false',
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

const REQUIRED_ASSETS = new Set(['qqq', 'ndx', 'ixic', 'spx']);
const REQUIRED_SOURCES = new Set([
  'yahoo_style_candidate',
  'stooq_public_csv_candidate',
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

const PRICE_KEYS = new Set([
  'close',
  'adjustedclose',
  'ma60',
  'zscore',
  'standarddeviation',
  'upperband',
  'lowerband',
  'temperature',
  'markettemperature',
  'signal'
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
    assert(after === before, `${relativePath} changed during source selection check.`);
  }
}

function assertDesignDoc() {
  assert(fs.existsSync(absolute(REVIEW_DOC)), 'Source selection review doc is missing.');
  const doc = readText(REVIEW_DOC);
  const docLower = normalize(doc);

  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(
      docLower.includes(normalize(phrase)),
      `Source selection review doc is missing phrase: ${phrase}`
    );
  }
}

function assertReviewFixture() {
  assert(fs.existsSync(absolute(REVIEW_FIXTURE)), 'Source selection fixture is missing.');
  const fixtureText = readText(REVIEW_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(
    fixture.contractVersion === 'v28.0M-13-source-selection-review-1',
    'Unexpected source selection fixture contractVersion.'
  );
  assert(
    fixture.kind === 'market_pricing_source_selection_review',
    'Unexpected source selection fixture kind.'
  );
  assert(
    fixture.status === 'review_only_no_source_approved',
    'Unexpected source selection fixture status.'
  );
  assert(fixture.sourceSelectionFinalized === false, 'sourceSelectionFinalized must be false.');
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
  assert(fixture.preferredAssetReviewTarget === 'qqq', 'Preferred target must be qqq.');
  assert(Array.isArray(fixture.records), 'Fixture records must be an array.');
  assert(fixture.records.length === 0, 'Source selection fixture must not contain records.');

  assert(Array.isArray(fixture.assetCandidates), 'assetCandidates must be an array.');
  const assetKeys = new Set(fixture.assetCandidates.map((asset) => asset.assetKey));
  for (const assetKey of REQUIRED_ASSETS) {
    assert(assetKeys.has(assetKey), `Missing asset candidate: ${assetKey}`);
  }

  for (const asset of fixture.assetCandidates) {
    assert(
      asset.approvalStatus === 'not_approved_for_live_fetch',
      `${asset.assetKey} must not be approved for live fetch.`
    );
    if (asset.assetKey === 'spx') {
      assert(asset.role === 'fallback_candidate_only', 'SPX must remain fallback only.');
    }
  }

  assert(Array.isArray(fixture.sourceCandidates), 'sourceCandidates must be an array.');
  const sourceKeys = new Set(
    fixture.sourceCandidates.map((source) => source.sourceKey)
  );
  for (const sourceKey of REQUIRED_SOURCES) {
    assert(sourceKeys.has(sourceKey), `Missing source candidate: ${sourceKey}`);
  }

  for (const source of fixture.sourceCandidates) {
    assert(
      source.liveFetchApproved === false,
      `${source.sourceKey} liveFetchApproved must be false.`
    );
    assert(
      source.productionWriteApproved === false,
      `${source.sourceKey} productionWriteApproved must be false.`
    );
  }

  assert(!/https?:\/\//i.test(fixtureText), 'Fixture must not contain URLs.');
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
    assert(
      !PRICE_KEYS.has(entry.normalizedKey),
      `Fixture must not contain price/calculation field: ${entry.path}`
    );
  }

  assert(fixture.boundaries?.reviewOnly === true, 'boundaries.reviewOnly must be true.');
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
    assert(!/https?:\/\//i.test(source), `${relativePath} must not contain executable URLs.`);
  }
}

function main() {
  const snapshot = snapshotProtectedFiles();
  assertDesignDoc();
  assertReviewFixture();
  assertMarketPricingScriptsRemainLocalOnly();
  assertProtectedFilesUnchanged(snapshot);
  console.log('Market pricing source selection review: PASS');
}

main();
