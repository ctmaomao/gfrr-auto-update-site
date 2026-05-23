import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC_PATH = 'docs/MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md';
const HISTORY_PATH = 'data/market-pricing-history.json';
const METRICS_PATH = 'data/market-pricing-metrics.json';
const WORKER_MARKET_PREVIEW_PATH = 'workers/gfrr-realtime-worker/src/worker-market-preview.js';
const PACKAGE_PATH = 'package.json';

const REQUIRED_DOC_MARKERS = [
  'M-91 Market Pricing NDX / IXIC Source Review And Implementation Spec Draft',
  'Phase: source review + contract design',
  'Implementation status: not implemented',
  'Source approval status: not approved',
  'Manual Source Availability Probe',
  'https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?range=1mo&interval=1d',
  'https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?range=1mo&interval=1d',
  '`^NDX` | 200 | `^NDX` | `INDEX`',
  '`^IXIC` | 200 | `^IXIC` | `INDEX`',
  '### 1. Correlation / Duplicate Counting',
  '### 2. Display Semantics',
  '### 3. History File Shape',
  '### 4. Z-Score Window / Thresholds',
  '### 5. Status Model',
  '### 6. Ingestion Path',
  '### 7. Failure / Fallback Strategy',
  'Recommendation: use "QQQ primary, NDX / IXIC auxiliary"',
  'Recommendation: keep NDX / IXIC in the existing `data/market-pricing-history.json` multi-asset file.',
  'Recommendation: Daily/manual market-pricing pipeline only, not Worker realtime preview.',
  'Recommendation: independent graceful degradation; no cross-substitution.',
  'M-91 Implementation Spec Draft',
  'No Worker runtime change.',
  'No `displayInputsBaseline` / `effectiveDisplayInputs` change.',
  'No Brent promotion change.',
  'No scoring / decision / execution / position change.',
  'No new npm dependency.',
  'No SPX substitution.',
];

const FORBIDDEN_DOC_MARKERS = [
  'liveFetchApproved=true',
  'productionDataWriteApproved=true',
  'historyWriteApproved=true',
  'marketTemperatureCalculationApproved=true',
  'sourceApproved=true',
];

const FORBIDDEN_WORKER_MARKERS = [
  '^NDX',
  '%5ENDX',
  'YAHOO_NDX',
  'fetchYahooNdx',
  '^IXIC',
  '%5EIXIC',
  'YAHOO_IXIC',
  'fetchYahooIxic',
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function checkDoc() {
  assert(fs.existsSync(path.join(ROOT, DOC_PATH)), `${DOC_PATH} must exist`);
  const text = readText(DOC_PATH);
  for (const marker of REQUIRED_DOC_MARKERS) {
    assert(text.includes(marker), `${DOC_PATH} missing marker: ${marker}`);
  }
  for (const marker of FORBIDDEN_DOC_MARKERS) {
    assert(!text.includes(marker), `${DOC_PATH} must not approve implementation marker: ${marker}`);
  }
}

function checkCurrentDataBoundary() {
  const history = readJson(HISTORY_PATH);
  const metrics = readJson(METRICS_PATH);

  assert(history.assets?.qqq?.status === 'active', 'QQQ must remain active baseline');
  assert(history.assets?.ndx?.status === 'waiting_for_source', 'NDX must remain waiting_for_source in M-91 source review');
  assert(history.assets?.ixic?.status === 'waiting_for_source', 'IXIC must remain waiting_for_source in M-91 source review');
  assert(Array.isArray(history.assets?.ndx?.records) && history.assets.ndx.records.length === 0, 'NDX records must remain empty');
  assert(Array.isArray(history.assets?.ixic?.records) && history.assets.ixic.records.length === 0, 'IXIC records must remain empty');
  assert(history.assets?.spx?.status === 'fallback_candidate_only', 'SPX must remain fallback_candidate_only');

  assert(metrics.asset === 'qqq', 'market-pricing metrics must remain QQQ-only during M-91 source review');
  assert(!('ndx' in metrics), 'metrics file must not add top-level ndx during source review');
  assert(!('ixic' in metrics), 'metrics file must not add top-level ixic during source review');
  assert(!metrics.assets?.ndx, 'metrics.assets.ndx must not exist during source review');
  assert(!metrics.assets?.ixic, 'metrics.assets.ixic must not exist during source review');
}

function checkNoWorkerRuntimeImplementation() {
  const workerText = readText(WORKER_MARKET_PREVIEW_PATH);
  for (const marker of FORBIDDEN_WORKER_MARKERS) {
    assert(!workerText.includes(marker), `${WORKER_MARKET_PREVIEW_PATH} must not add M-91 Worker runtime marker: ${marker}`);
  }
}

function checkPackageWiring() {
  const pkg = readJson(PACKAGE_PATH);
  const script = pkg.scripts?.['check:market-pricing-ndx-ixic-source-review-design'];
  assert(
    script === 'node --check scripts/check-market-pricing-ndx-ixic-source-review-design.mjs && node scripts/check-market-pricing-ndx-ixic-source-review-design.mjs',
    'package.json must expose check:market-pricing-ndx-ixic-source-review-design',
  );
}

checkDoc();
checkCurrentDataBoundary();
checkNoWorkerRuntimeImplementation();
checkPackageWiring();

if (errors.length) {
  console.error('M-91 NDX/IXIC source review design check: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('M-91 NDX/IXIC source review design check: PASS (source review only; NDX/IXIC still waiting_for_source)');
