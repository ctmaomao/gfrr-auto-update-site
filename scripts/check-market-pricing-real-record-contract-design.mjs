import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DESIGN_DOC =
  'docs/MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md';
const FIXTURE =
  'docs/fixtures/market-pricing/real-record-contract-design-v28.0M-11.json';
const SANITIZER_SCAFFOLD =
  'scripts/market-pricing/artifact-sanitizer-scaffold.mjs';

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

const REQUIRED_DOC_PHRASES = [
  'No live fetch',
  'No production data write',
  'No history record write',
  'waiting_for_history',
  'adjustedClose',
  'close',
  'duplicate dates',
  'sorted ascending',
  'finite positive numbers',
  'source compliance',
  '60 validated weekly observations',
  'no MA60 / z-score',
  'no trading advice',
  'SPX fallback only',
  'no SPX-as-Nasdaq-temperature',
  'readyForProductionWrite=false'
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

const SENSITIVE_FIELD_KEYS = new Set([
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

const SOURCE_LEAKAGE_FIELD_KEYS = new Set([
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

const TRADING_ADVICE_FIELD_KEYS = new Set([
  'buy',
  'sell',
  'short',
  'long',
  'inverseetf',
  'allocation',
  'positionadvice',
  'tradeadvice',
  'recommendation',
  'targetposition'
]);

const CALCULATION_FIELD_KEYS = new Set([
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

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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
    assert(after === before, `${relativePath} changed during contract check.`);
  }
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

function assertDesignDoc() {
  const docPath = path.join(ROOT, DESIGN_DOC);
  assert(fs.existsSync(docPath), `${DESIGN_DOC} is missing.`);
  const text = readText(DESIGN_DOC);
  const lowerText = text.toLowerCase();

  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(
      lowerText.includes(phrase.toLowerCase()),
      `${DESIGN_DOC} missing required phrase: ${phrase}`
    );
  }
}

function assertFixture() {
  const fixturePath = path.join(ROOT, FIXTURE);
  assert(fs.existsSync(fixturePath), `${FIXTURE} is missing.`);
  const fixture = readJson(FIXTURE);

  assert(
    fixture.contractVersion === 'v28.0M-11-real-record-contract-1',
    'Unexpected fixture contractVersion.'
  );
  assert(
    fixture.kind === 'market_pricing_real_record_contract_design',
    'Unexpected fixture kind.'
  );
  assert(fixture.status === 'design_only', 'Fixture status must be design_only.');
  assert(Array.isArray(fixture.records), 'Fixture records must be an array.');
  assert(fixture.records.length === 0, 'Fixture records must remain empty.');
  assert(
    fixture.productionDataWritten === false,
    'Fixture productionDataWritten must be false.'
  );
  assert(
    fixture.historyFileModified === false,
    'Fixture historyFileModified must be false.'
  );
  assert(
    fixture.calculationPerformed === false,
    'Fixture calculationPerformed must be false.'
  );
  assert(fixture.boundaries?.designOnly === true, 'Fixture must be designOnly.');
  assert(
    fixture.boundaries.noLiveFetch === true,
    'Fixture must set noLiveFetch.'
  );
  assert(
    fixture.boundaries.noProductionWrite === true,
    'Fixture must set noProductionWrite.'
  );
  assert(
    fixture.boundaries.noHistoryWrite === true,
    'Fixture must set noHistoryWrite.'
  );
  assert(
    fixture.boundaries.noCalculation === true,
    'Fixture must set noCalculation.'
  );
  assert(
    fixture.boundaries.affectsScoring === false,
    'Fixture must not affect scoring.'
  );
  assert(
    fixture.boundaries.affectsDecisionModel === false,
    'Fixture must not affect decision model.'
  );
  assert(
    fixture.boundaries.affectsExecutionLock === false,
    'Fixture must not affect execution lock.'
  );
  assert(
    fixture.boundaries.affectsPositionGuidance === false,
    'Fixture must not affect position guidance.'
  );

  const text = readText(FIXTURE);
  assert(!/https?:\/\//i.test(text), 'Fixture must not contain source URLs.');

  for (const entry of collectEntries(fixture)) {
    const { normalizedKey, path: fieldPath, value } = entry;
    assert(
      !SENSITIVE_FIELD_KEYS.has(normalizedKey),
      `Fixture must not contain sensitive field: ${fieldPath}`
    );
    assert(
      !SOURCE_LEAKAGE_FIELD_KEYS.has(normalizedKey),
      `Fixture must not contain source URL field: ${fieldPath}`
    );
    assert(
      !TRADING_ADVICE_FIELD_KEYS.has(normalizedKey),
      `Fixture must not contain trading advice field: ${fieldPath}`
    );
    assert(
      !CALCULATION_FIELD_KEYS.has(normalizedKey),
      `Fixture must not contain calculation field key: ${fieldPath}`
    );
    assert(
      !(typeof value === 'number'),
      `Fixture must not contain numeric market-like values: ${fieldPath}`
    );
  }
}

function assertSanitizerScaffoldStillLocalOnly() {
  const sourcePath = path.join(ROOT, SANITIZER_SCAFFOLD);
  assert(fs.existsSync(sourcePath), `${SANITIZER_SCAFFOLD} is missing.`);
  const source = readText(SANITIZER_SCAFFOLD);

  for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
    assert(
      !source.includes(pattern),
      `${SANITIZER_SCAFFOLD} contains forbidden pattern: ${pattern}`
    );
  }

  assert(!/https?:\/\//i.test(source), 'Sanitizer scaffold must not contain source URLs.');

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

function main() {
  const snapshot = snapshotProtectedFiles();
  assertDesignDoc();
  assertFixture();
  assertSanitizerScaffoldStillLocalOnly();
  assertProtectedFilesUnchanged(snapshot);
  console.log('Market pricing real-record contract design: PASS');
}

main();
