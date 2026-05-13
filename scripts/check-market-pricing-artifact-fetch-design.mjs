import fs from 'node:fs';
import path from 'node:path';

const DESIGN_PATH = 'docs/MARKET_PRICING_ARTIFACT_ONLY_FETCH_DESIGN.md';
const DRY_RUN_SCRIPT_PATH = 'scripts/market-pricing/source-adapter-dry-run.mjs';
const HISTORY_PATH = 'data/market-pricing-history.json';
const MANUAL_ARTIFACT_PREFIX = 'manual-artifacts/market-pricing/';

const REQUIRED_DESIGN_PHRASES = [
  'No live fetch',
  'No production data write',
  'No calculation',
  'waiting-for-history',
  'QQQ',
  'NDX',
  'IXIC',
  'SPX',
  'fallback candidate',
  'artifact-only',
  'no scoring / decision / execution / position impact',
  'no fake history',
  'no long-term inverse ETF recommendation'
];

const FORBIDDEN_DRY_RUN_PATTERNS = [
  ['fe', 'tch('].join(''),
  ['ht', 'tps.get'].join(''),
  ['ht', 'tp.get'].join(''),
  ['ax', 'ios'].join(''),
  ['req', 'uest('].join(''),
  'child_process',
  'exec(',
  'spawn(',
  ['process', 'env'].join('.')
];

const FORBIDDEN_HISTORY_KEYS = new Set([
  'ma60',
  'zscore',
  'standarddeviation',
  'temperature',
  'marketpricingtemperature',
  'marketpricingtemperaturelayer'
]);

const errors = [];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').toLowerCase();
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function validateDesignDoc() {
  assert(fs.existsSync(DESIGN_PATH), `${DESIGN_PATH} must exist`);
  if (!fs.existsSync(DESIGN_PATH)) return;

  const design = readText(DESIGN_PATH);
  const normalized = normalizeText(design);
  for (const phrase of REQUIRED_DESIGN_PHRASES) {
    assert(normalized.includes(normalizeText(phrase)), `${DESIGN_PATH} must include boundary phrase: ${phrase}`);
  }
}

function validateDryRunScriptStillNoNetwork() {
  assert(fs.existsSync(DRY_RUN_SCRIPT_PATH), `${DRY_RUN_SCRIPT_PATH} must exist`);
  if (!fs.existsSync(DRY_RUN_SCRIPT_PATH)) return;

  const source = readText(DRY_RUN_SCRIPT_PATH);
  for (const pattern of FORBIDDEN_DRY_RUN_PATTERNS) {
    assert(!source.includes(pattern), `${DRY_RUN_SCRIPT_PATH} must not contain ${pattern}`);
  }
}

function scanForbiddenHistoryKeys(value, jsonPath = 'root') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenHistoryKeys(item, `${jsonPath}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_HISTORY_KEYS.has(normalizeKey(key))) {
      errors.push(`${jsonPath}.${key} is forbidden before the calculation phase`);
    }
    scanForbiddenHistoryKeys(child, `${jsonPath}.${key}`);
  }
}

function scanRecordsStayEmpty(value, jsonPath = 'root') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanRecordsStayEmpty(item, `${jsonPath}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'records') {
      assert(Array.isArray(child), `${jsonPath}.${key} must be an array`);
      if (Array.isArray(child)) {
        assert(child.length === 0, `${jsonPath}.${key} must remain empty`);
      }
    }
    scanRecordsStayEmpty(child, `${jsonPath}.${key}`);
  }
}

function validateHistoryStillScaffoldOnly(history) {
  assert(history.status === 'waiting_for_history', `${HISTORY_PATH} status must remain waiting_for_history`);
  assert(history.sourceMode === 'scaffold_only', `${HISTORY_PATH} sourceMode must remain scaffold_only`);
  scanRecordsStayEmpty(history);
  scanForbiddenHistoryKeys(history);
}

function validateHistoryCommittedBoundaries(history) {
  const boundaries = history.boundaries;
  assert(isRecord(boundaries), `${HISTORY_PATH} boundaries must be an object`);
  if (!isRecord(boundaries)) return;

  assert(boundaries.noFetch === true, `${HISTORY_PATH} boundaries.noFetch must remain true`);
  assert(boundaries.noCalculation === true, `${HISTORY_PATH} boundaries.noCalculation must remain true`);
  assert(boundaries.displayOnly === true, `${HISTORY_PATH} boundaries.displayOnly must remain true`);
  assert(boundaries.notInvestmentAdvice === true, `${HISTORY_PATH} boundaries.notInvestmentAdvice must remain true`);
  assert(boundaries.affectsScoring === false, `${HISTORY_PATH} boundaries.affectsScoring must remain false`);
  assert(boundaries.affectsDecisionModel === false, `${HISTORY_PATH} boundaries.affectsDecisionModel must remain false`);
  assert(boundaries.affectsExecutionLock === false, `${HISTORY_PATH} boundaries.affectsExecutionLock must remain false`);
  assert(boundaries.affectsPositionGuidance === false, `${HISTORY_PATH} boundaries.affectsPositionGuidance must remain false`);
}

function validateHistoryState() {
  assert(fs.existsSync(HISTORY_PATH), `${HISTORY_PATH} must exist`);
  if (!fs.existsSync(HISTORY_PATH)) return 'missing';

  let history;
  try {
    history = JSON.parse(readText(HISTORY_PATH));
  } catch (error) {
    errors.push(`Unable to parse ${HISTORY_PATH}: ${error.message}`);
    return 'invalid';
  }

  if (history.status === 'waiting_for_history') {
    validateHistoryStillScaffoldOnly(history);
    return history.status;
  }

  if (history.status === 'has_history') {
    validateHistoryCommittedBoundaries(history);
    return history.status;
  }

  errors.push(`${HISTORY_PATH} status must be waiting_for_history or has_history; got ${JSON.stringify(history.status)}`);
  return String(history.status ?? 'missing_status');
}

function resolveGitDir() {
  const dotGitPath = '.git';
  const stats = fs.statSync(dotGitPath);
  if (stats.isDirectory()) return dotGitPath;

  const content = readText(dotGitPath).trim();
  const match = content.match(/^gitdir:\s*(.+)$/iu);
  if (!match) throw new Error('.git file does not contain gitdir');
  return path.resolve(path.dirname(dotGitPath), match[1]);
}

function readGitIndexPaths() {
  const gitDir = resolveGitDir();
  const indexPath = path.join(gitDir, 'index');
  if (!fs.existsSync(indexPath)) return [];

  const buffer = fs.readFileSync(indexPath);
  if (buffer.length < 12 || buffer.toString('utf8', 0, 4) !== 'DIRC') {
    throw new Error('unsupported git index header');
  }

  const version = buffer.readUInt32BE(4);
  const entryCount = buffer.readUInt32BE(8);
  if (version === 4) {
    throw new Error('git index version 4 path compression is not supported by this checker');
  }
  if (version < 2 || version > 3) {
    throw new Error(`unsupported git index version ${version}`);
  }

  const paths = [];
  let offset = 12;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 62 > buffer.length) throw new Error('unexpected truncated git index entry');

    const flags = buffer.readUInt16BE(offset + 60);
    const pathLength = flags & 0x0fff;
    let pathStart = offset + 62;
    if ((flags & 0x4000) !== 0) pathStart += 2;

    let pathEnd = pathStart;
    if (pathLength < 0x0fff) {
      pathEnd = pathStart + pathLength;
    } else {
      while (pathEnd < buffer.length && buffer[pathEnd] !== 0) pathEnd += 1;
    }

    const entryPath = buffer.toString('utf8', pathStart, pathEnd).replaceAll('\\', '/');
    paths.push(entryPath);

    const entryLength = pathEnd + 1 - offset;
    const padding = (8 - (entryLength % 8)) % 8;
    offset += entryLength + padding;
  }

  return paths;
}

function validateNoCommittedMarketPricingArtifacts() {
  let trackedPaths;
  try {
    trackedPaths = readGitIndexPaths();
  } catch (error) {
    errors.push(`Unable to inspect git index for manual artifacts: ${error.message}`);
    return;
  }

  const trackedArtifacts = trackedPaths.filter((entryPath) => entryPath.startsWith(MANUAL_ARTIFACT_PREFIX));
  assert(
    trackedArtifacts.length === 0,
    `${MANUAL_ARTIFACT_PREFIX} artifacts must not be committed: ${trackedArtifacts.join(', ')}`
  );
}

function main() {
  validateDesignDoc();
  validateDryRunScriptStillNoNetwork();
  const historyState = validateHistoryState();
  validateNoCommittedMarketPricingArtifacts();

  if (errors.length > 0) {
    console.error('Market pricing artifact-only fetch design: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Market pricing artifact-only fetch design: PASS (state=${historyState})`);
}

main();
