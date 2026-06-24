#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const POLICY_DOC = 'docs/GDELT_SOURCE_POLICY.md';
const PACKAGE_JSON = 'package.json';
const GDELT_NEWS_CACHE = 'data/gdelt-news-cache.json';
const GDELT_BUBBLE_CACHE = 'data/gdelt-bubble-watch-cache.json';
const SCAN_ROOTS = ['scripts', '.github/workflows', 'workers'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.yml', '.yaml']);
const GDELT_ENDPOINT_RE = /\b(?:https?:\/\/)?(?:api\.gdeltproject\.org|gdeltcloud\.com)\/api\/v2\b|GDELT_CLOUD_API_BASE/u;

const ALLOWED_ENDPOINT_REFERENCE_FILES = new Map([
  ['.github/workflows/test-api-secrets.yml', 'manual API secret diagnostic workflow'],
  ['scripts/check-gdelt-cloud-fetcher-integration.mjs', 'GDELT Cloud integration checker'],
  ['scripts/check-gdelt-source-policy.mjs', 'self-check allowlist and endpoint guard'],
  ['scripts/check-workflows.mjs', 'workflow coverage checker with GDELT Cloud assertions'],
  ['scripts/gdelt/fetch-gdelt.mjs', 'shared GDELT wrapper with serial request discipline'],
  ['scripts/world-order/fetch-gdelt-cloud.mjs', 'registered World Order GDELT Cloud path']
]);

const REQUIRED_POLICY_PHRASES = [
  'GDELT Source Policy',
  'GDELT DOC / Context APIs are rate-limited',
  'New GDELT calls must not be added directly to feature modules',
  'Queries should be broad and locally classified',
  'GDELT calls must be serial or centrally throttled',
  'P36, current phase',
  'P37, current phase',
  'P38, current phase',
  '6h fresh-cache or 6h error-cooldown',
  'scripts/gdelt/fetch-gdelt.mjs',
  'data/gdelt-news-cache.json',
  'data/gdelt-bubble-watch-cache.json'
];

const REQUIRED_WRAPPER_PHRASES = [
  'let gdeltRequestQueue = Promise.resolve()',
  'parseRetryAfterMs',
  'DEFAULT_GDELT_MAX_RETRIES',
  'DEFAULT_GDELT_MIN_INTERVAL_MS',
  'sanitizeGdeltDiagnostics',
  'fetchGdeltDocJson'
];

const REQUIRED_ODP_CACHE_PHRASES = [
  'GDELT_BROAD_QUERY_SPEC',
  'gdelt_broad_oil_news',
  'DEFAULT_GDELT_CACHE_OUTPUT',
  'GDELT_CACHE_SCHEMA_VERSION',
  'GDELT_CACHE_TTL_MINUTES',
  'GDELT_ERROR_COOLDOWN_HOURS',
  'GDELT_STALE_MAX_HOURS',
  'error_cooldown_cache_hit',
  'fetchGdeltDocBroad',
  'single_broad_query_local_classification',
  'sourceCaches'
];

const REQUIRED_BUBBLE_CACHE_PHRASES = [
  'fetchGdeltDocJson',
  'GDELT_BUBBLE_CACHE_SCHEMA_VERSION',
  'readGdeltBubbleWatchCache',
  'writeGdeltBubbleWatchCache',
  'GDELT_BUBBLE_CACHE_TTL_HOURS',
  'GDELT_BUBBLE_STALE_MAX_DAYS'
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function toRepoPath(filePath) {
  return relative(process.cwd(), resolve(filePath)).replace(/\\/g, '/');
}

function readText(filePath) {
  return readFileSync(resolve(filePath), 'utf8');
}

function walkFiles(root) {
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot)) return [];
  const files = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      const repoPath = toRepoPath(fullPath);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'manual-artifacts') continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SCAN_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      files.push(repoPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function matchingLines(text) {
  return text
    .split(/\r?\n/u)
    .map((line, index) => ({ lineNumber: index + 1, line }))
    .filter(({ line }) => GDELT_ENDPOINT_RE.test(line));
}

function checkPolicyDoc() {
  if (!existsSync(resolve(POLICY_DOC))) {
    fail(`${POLICY_DOC} missing`);
    return;
  }
  const doc = readText(POLICY_DOC);
  for (const phrase of REQUIRED_POLICY_PHRASES) {
    if (!doc.includes(phrase)) fail(`${POLICY_DOC} missing required phrase: ${phrase}`);
  }
  for (const allowedFile of ALLOWED_ENDPOINT_REFERENCE_FILES.keys()) {
    if (!doc.includes(allowedFile)) fail(`${POLICY_DOC} must list allowed GDELT endpoint reference: ${allowedFile}`);
  }
}

function checkPackageWiring() {
  if (!existsSync(resolve(PACKAGE_JSON))) {
    fail(`${PACKAGE_JSON} missing`);
    return;
  }
  const pkg = JSON.parse(readText(PACKAGE_JSON));
  const scripts = pkg.scripts || {};
  const script = scripts['check:gdelt-source-policy'];
  if (typeof script !== 'string') {
    fail('package.json missing scripts.check:gdelt-source-policy');
  } else {
    if (!script.includes('scripts/check-gdelt-source-policy.mjs')) {
      fail('check:gdelt-source-policy must run scripts/check-gdelt-source-policy.mjs');
    }
    if (!script.includes('node --check')) {
      fail('check:gdelt-source-policy must include node --check syntax validation');
    }
  }
  if (typeof scripts['check:all'] !== 'string' || !scripts['check:all'].includes('check:gdelt-source-policy')) {
    fail('check:all must include check:gdelt-source-policy');
  }
}

function checkEndpointReferences() {
  const files = SCAN_ROOTS.flatMap(walkFiles);
  const filesWithEndpointReferences = [];

  for (const file of files) {
    const text = readText(file);
    const matches = matchingLines(text);
    if (matches.length === 0) continue;
    filesWithEndpointReferences.push(file);
    if (!ALLOWED_ENDPOINT_REFERENCE_FILES.has(file)) {
      const first = matches[0];
      fail(`Unregistered GDELT endpoint reference in ${file}:${first.lineNumber}: ${first.line.trim()}`);
    }
  }

  for (const [file, reason] of ALLOWED_ENDPOINT_REFERENCE_FILES.entries()) {
    if (!existsSync(resolve(file))) {
      fail(`Allowed GDELT endpoint reference file missing: ${file} (${reason})`);
      continue;
    }
    const text = readText(file);
    if (!GDELT_ENDPOINT_RE.test(text)) {
      fail(`Allowed GDELT endpoint reference file no longer contains a GDELT endpoint marker: ${file}`);
    }
  }

  return filesWithEndpointReferences;
}

function checkSharedWrapperContract() {
  const wrapperPath = 'scripts/gdelt/fetch-gdelt.mjs';
  const oilNewsPath = 'scripts/oil-directional/diagnose-oil-news-events.mjs';
  if (!existsSync(resolve(wrapperPath))) {
    fail(`${wrapperPath} missing`);
    return;
  }
  const wrapper = readText(wrapperPath);
  for (const phrase of REQUIRED_WRAPPER_PHRASES) {
    if (!wrapper.includes(phrase)) fail(`${wrapperPath} missing required wrapper phrase: ${phrase}`);
  }
  if (!/maxRetries\s*=\s*DEFAULT_GDELT_MAX_RETRIES/u.test(wrapper)) {
    fail(`${wrapperPath} must expose bounded retry defaults`);
  }
  if (!wrapper.includes('Retry-After')) {
    fail(`${wrapperPath} must read Retry-After`);
  }
  if (!existsSync(resolve(oilNewsPath))) {
    fail(`${oilNewsPath} missing`);
    return;
  }
  const oilNews = readText(oilNewsPath);
  if (!oilNews.includes("../gdelt/fetch-gdelt.mjs") && !oilNews.includes('../gdelt/fetch-gdelt.mjs')) {
    fail(`${oilNewsPath} must import shared GDELT wrapper`);
  }
  if (GDELT_ENDPOINT_RE.test(oilNews)) {
    fail(`${oilNewsPath} must not contain direct GDELT endpoint markers after P36`);
  }
  for (const phrase of REQUIRED_ODP_CACHE_PHRASES) {
    if (!oilNews.includes(phrase)) fail(`${oilNewsPath} missing P37 ODP cache phrase: ${phrase}`);
  }
  if (!/GDELT_CACHE_TTL_MINUTES\s*=\s*360/u.test(oilNews)) {
    fail(`${oilNewsPath} must keep ODP GDELT fresh-cache TTL at 360 minutes`);
  }
  if (!/GDELT_STALE_MAX_HOURS\s*=\s*24/u.test(oilNews)) {
    fail(`${oilNewsPath} must keep ODP GDELT stale-cache fallback at 24 hours`);
  }
  if (!/GDELT_ERROR_COOLDOWN_HOURS\s*=\s*6/u.test(oilNews)) {
    fail(`${oilNewsPath} must keep ODP GDELT error cooldown at 6 hours`);
  }
  if (!oilNews.includes('maxRetries: 0')) {
    fail(`${oilNewsPath} must keep ODP GDELT live attempts single-attempt after cache/cooldown expiry`);
  }
  const bubblePath = 'scripts/build-bubble-watch.mjs';
  if (!existsSync(resolve(bubblePath))) {
    fail(`${bubblePath} missing`);
  } else {
    const bubble = readText(bubblePath);
    if (!bubble.includes("./gdelt/fetch-gdelt.mjs") && !bubble.includes('./gdelt/fetch-gdelt.mjs')) {
      fail(`${bubblePath} must import shared GDELT wrapper after P38`);
    }
    if (GDELT_ENDPOINT_RE.test(bubble)) {
      fail(`${bubblePath} must not contain direct GDELT endpoint markers after P38`);
    }
    for (const phrase of REQUIRED_BUBBLE_CACHE_PHRASES) {
      if (!bubble.includes(phrase)) fail(`${bubblePath} missing P38 Bubble cache phrase: ${phrase}`);
    }
  }
  if (!existsSync(resolve(GDELT_NEWS_CACHE))) {
    fail(`${GDELT_NEWS_CACHE} missing`);
  } else {
    const cache = JSON.parse(readText(GDELT_NEWS_CACHE));
    if (cache.schemaVersion !== 'gdelt-news-cache-p37') {
      fail(`${GDELT_NEWS_CACHE} schemaVersion must be gdelt-news-cache-p37`);
    }
    if (cache.module !== 'gdelt-news-cache') fail(`${GDELT_NEWS_CACHE} module must be gdelt-news-cache`);
    if (cache.query?.id !== 'gdelt_broad_oil_news') {
      fail(`${GDELT_NEWS_CACHE} query.id must be gdelt_broad_oil_news`);
    }
    if (cache.cachePolicy?.broadQueryLocalClassification !== true) {
      fail(`${GDELT_NEWS_CACHE} must declare broadQueryLocalClassification`);
    }
  }
  if (!existsSync(resolve(GDELT_BUBBLE_CACHE))) {
    fail(`${GDELT_BUBBLE_CACHE} missing`);
  } else {
    const cache = JSON.parse(readText(GDELT_BUBBLE_CACHE));
    if (cache.schemaVersion !== 'gdelt-bubble-watch-cache-p38') {
      fail(`${GDELT_BUBBLE_CACHE} schemaVersion must be gdelt-bubble-watch-cache-p38`);
    }
    if (cache.module !== 'gdelt-bubble-watch-cache') fail(`${GDELT_BUBBLE_CACHE} module must be gdelt-bubble-watch-cache`);
    if (cache.cacheScope !== 'bubble_watch_ceo_hedging') fail(`${GDELT_BUBBLE_CACHE} cacheScope must be bubble_watch_ceo_hedging`);
    if (cache.query?.id !== 'gdelt_bubble_ceo_hedging') {
      fail(`${GDELT_BUBBLE_CACHE} query.id must be gdelt_bubble_ceo_hedging`);
    }
    if (cache.cachePolicy?.lowFrequencyCache !== true || cache.cachePolicy?.broadQueryLocalClassification !== true) {
      fail(`${GDELT_BUBBLE_CACHE} must declare lowFrequencyCache and broadQueryLocalClassification`);
    }
  }
}

function checkDataDocsAreNotScannedAsRuntime() {
  for (const root of ['data', 'docs', 'config']) {
    if (!existsSync(resolve(root))) continue;
    const stats = statSync(resolve(root));
    if (!stats.isDirectory()) fail(`${root} should be a directory`);
  }
}

checkPolicyDoc();
checkPackageWiring();
const filesWithEndpointReferences = checkEndpointReferences();
checkSharedWrapperContract();
checkDataDocsAreNotScannedAsRuntime();

if (errors.length > 0) {
  console.error('GDELT source policy check FAILED:');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}

console.log(
  `GDELT source policy check: PASS (${filesWithEndpointReferences.length} endpoint reference files, ${ALLOWED_ENDPOINT_REFERENCE_FILES.size} allowed)`
);
