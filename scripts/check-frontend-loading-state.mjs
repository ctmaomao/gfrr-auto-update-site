import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];

function readText(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertMissing(text, snippet, where) {
  assert(!text.includes(snippet), `${where} must not contain stale initial display snippet: ${snippet}`);
}

function extractFunctionSource(text, functionName) {
  const marker = `function ${functionName}`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Unable to find ${functionName}`);

  const parenStart = text.indexOf('(', start);
  if (parenStart < 0) throw new Error(`Unable to find signature for ${functionName}`);

  let parenDepth = 0;
  let signatureEnd = -1;
  for (let index = parenStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnd = index;
        break;
      }
    }
  }

  if (signatureEnd < 0) throw new Error(`Unable to parse signature for ${functionName}`);

  const braceStart = text.indexOf('{', signatureEnd);
  if (braceStart < 0) throw new Error(`Unable to find body for ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  throw new Error(`Unable to parse ${functionName}`);
}

function loadRenderableDataHarness(appText) {
  const factory = new Function(`${extractFunctionSource(appText, 'allRenderableDataPresent')}\nreturn { allRenderableDataPresent };`);
  return factory();
}

const html = readText('index.html');
const css = readText('assets/styles.css');
const app = readText('scripts/app.js');
const suite = readText('scripts/check-suite.mjs');
const pkg = readText('package.json');

assert(html.includes('<body class="gfrr-data-loading">'), 'index.html body must start in gfrr-data-loading state.');
assert(html.includes('id="hero-score-value">'), 'index.html must keep #hero-score-value for renderer wiring.');

for (const snippet of [
  'id="hero-score-value">56',
  'id="hero-data-health">23/23',
  'id="threshold-now-line">原始 56',
  'id="pressure-card-energy"><div class="label">Energy 能源</div><div class="num">82',
  'id="engine-card-b1"><div class="label">B1 Energy 能源</div><div class="num">RED',
  'id="mt-zscore-value">+2.18',
  'id="cv-consistency-value">72',
]) {
  assertMissing(html, snippet, 'index.html');
}

assert(css.includes('body.gfrr-data-loading .editorial-section-body'), 'styles.css must hide section bodies while data is loading.');
assert(css.includes('body.gfrr-data-failed .editorial-section-body'), 'styles.css must hide section bodies when renderable data is unavailable.');
assert(css.includes('visibility: hidden'), 'styles.css loading guard must use visibility:hidden to prevent mock-value flashes.');

for (const snippet of [
  "const DATA_LOADING_CLASS = 'gfrr-data-loading'",
  "const DATA_READY_CLASS = 'gfrr-data-ready'",
  "const DATA_FAILED_CLASS = 'gfrr-data-failed'",
  'function markDataReady()',
  'function markDataUnavailable()',
  'function allRenderableDataPresent',
  'return Boolean(radarData);',
  'dataReady && macroOverviewRendered && oilDirectionalRendered',
]) {
  assert(app.includes(snippet), `scripts/app.js missing loading-state guard snippet: ${snippet}`);
}

for (const snippet of [
  'radarData && worldOrderStressData && marketPricingMetricsData && radarHistoryData && oilDirectionalData',
  'oilDirectionalData && oilThermalWatchData && oilNewsEventWatchData',
]) {
  assertMissing(app, snippet, 'scripts/app.js');
}

const { allRenderableDataPresent } = loadRenderableDataHarness(app);

assert(
  allRenderableDataPresent({
    radarData: { score: 56 },
    worldOrderStressData: null,
    marketPricingMetricsData: null,
    radarHistoryData: null,
    oilDirectionalData: null,
    oilThermalWatchData: null,
    oilNewsEventWatchData: null,
  }) === true,
  'allRenderableDataPresent must allow homepage render when display-only auxiliary JSON files are missing.'
);

assert(
  allRenderableDataPresent({
    radarData: null,
    worldOrderStressData: { score: 0 },
    marketPricingMetricsData: {},
    radarHistoryData: {},
    oilDirectionalData: {},
    oilThermalWatchData: {},
    oilNewsEventWatchData: {},
  }) === false,
  'allRenderableDataPresent must fail closed when radar-data.json is missing.'
);

assert(
  allRenderableDataPresent({ radarData: { score: 56 } }) === true,
  'allRenderableDataPresent must key readiness only on radarData presence.'
);

assert(pkg.includes('"check:frontend-loading-state"'), 'package.json must expose check:frontend-loading-state.');
assert(suite.includes("'check:frontend-loading-state'"), 'frontend-live-contracts suite must include check:frontend-loading-state.');

if (errors.length > 0) {
  console.error('Frontend loading-state check FAILED:');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}

console.log('Frontend loading-state check: PASS');
