#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const POLICY_DOC = 'docs/GDELT_SOURCE_POLICY.md';
const PACKAGE_JSON = 'package.json';
const SCAN_ROOTS = ['scripts', '.github/workflows', 'workers'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.yml', '.yaml']);
const GDELT_ENDPOINT_RE = /\b(?:https?:\/\/)?(?:api\.gdeltproject\.org|gdeltcloud\.com)\/api\/v2\b|GDELT_CLOUD_API_BASE/u;

const ALLOWED_ENDPOINT_REFERENCE_FILES = new Map([
  ['.github/workflows/test-api-secrets.yml', 'manual API secret diagnostic workflow'],
  ['scripts/build-bubble-watch.mjs', 'registered Bubble Watch ceo_hedging GDELT DOC path'],
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
  'P37 candidate',
  'scripts/gdelt/fetch-gdelt.mjs',
  'data/gdelt-news-cache.json'
];

const REQUIRED_WRAPPER_PHRASES = [
  'let gdeltRequestQueue = Promise.resolve()',
  'parseRetryAfterMs',
  'DEFAULT_GDELT_MAX_RETRIES',
  'DEFAULT_GDELT_MIN_INTERVAL_MS',
  'sanitizeGdeltDiagnostics',
  'fetchGdeltDocJson'
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
