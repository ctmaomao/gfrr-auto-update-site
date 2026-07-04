#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const POLICY_DOC = 'docs/GDELT_SOURCE_POLICY.md';
const PACKAGE_JSON = 'package.json';
const GDELT_NEWS_CACHE = 'data/gdelt-news-cache.json';
const GDELT_BUBBLE_CACHE = 'data/gdelt-bubble-watch-cache.json';
const GDELT_WORLD_ORDER_CACHE = 'data/gdelt-world-order-cache.json';
const SCAN_ROOTS = ['scripts', '.github/workflows', 'workers'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.yml', '.yaml']);
const GDELT_ENDPOINT_RE = /\b(?:https?:\/\/)?(?:api\.gdeltproject\.org|gdeltcloud\.com)\/api\/v2\b|GDELT_CLOUD_API_BASE/u;

const ALLOWED_ENDPOINT_REFERENCE_FILES = new Map([
  ['.github/workflows/test-api-secrets.yml', 'manual API secret diagnostic workflow'],
  ['scripts/check-gdelt-cloud-fetcher-integration.mjs', 'GDELT Cloud integration checker'],
  ['scripts/check-gdelt-source-policy.mjs', 'self-check allowlist and endpoint guard'],
  ['scripts/gdelt/fetch-gdelt.mjs', 'shared GDELT wrapper with serial request discipline']
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
  'P39, current phase',
  'P41, current phase',
  'P43, current phase',
  'P44, current phase',
  'P45, current phase',
  'P46, current phase',
  'P47, current phase',
  'P48, current phase',
  '24h fresh-cache or 24h error-cooldown',
  'GDELT Web NGrams',
  'scripts/gdelt/fetch-gdelt.mjs',
  'diagnose:gdelt-web-ngrams',
  'sanitize:gdelt-web-ngrams-artifacts',
  'archive:gdelt-web-ngrams-samples',
  'review:gdelt-web-ngrams-samples',
  'gdelt-web-ngrams-artifact-sanitizer-p48',
  'gdelt-web-ngrams-fallback-source-review-p45',
  'gdelt-web-ngrams-production-display-fallback-contract-p46',
  'gdelt-web-ngrams-sample-collector.yml',
  'data/gdelt-news-cache.json',
  'data/gdelt-bubble-watch-cache.json',
  'data/gdelt-world-order-cache.json'
];

const REQUIRED_WRAPPER_PHRASES = [
  'let gdeltRequestQueue = Promise.resolve()',
  'parseRetryAfterMs',
  'DEFAULT_GDELT_MAX_RETRIES',
  'DEFAULT_GDELT_MIN_INTERVAL_MS',
  'sanitizeGdeltDiagnostics',
  'fetchGdeltCloudJson',
  'fetchGdeltDocJson',
  'fetchGdeltWebNgramsText',
  'probeGdeltWebNgramsFile',
  'GDELT_WEB_NGRAMS_BASE'
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
  'lastUsableCachePreservedOnError',
  'lastUsableCacheAffectsCurrentSignal',
  'lastUsableGdeltCacheFrom',
  'rate_limited_last_usable_cache_preserved',
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

const REQUIRED_WORLD_ORDER_CACHE_PHRASES = [
  'fetchGdeltCloudJson',
  'GDELT_WORLD_ORDER_CACHE_SCHEMA_VERSION',
  'DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT',
  'readGdeltWorldOrderCache',
  'GDELT_WORLD_ORDER_CACHE_TTL_HOURS',
  'GDELT_WORLD_ORDER_STALE_MAX_HOURS',
  'GDELT_WORLD_ORDER_ERROR_COOLDOWN_HOURS',
  'singleAttemptAfterCacheExpiry',
  'maxRetries: 0'
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
  if (typeof scripts['diagnose:gdelt-web-ngrams'] !== 'string' ||
      !scripts['diagnose:gdelt-web-ngrams'].includes('scripts/oil-directional/diagnose-gdelt-web-ngrams.mjs')) {
    fail('package.json missing scripts.diagnose:gdelt-web-ngrams');
  }
  if (typeof scripts['check:gdelt-web-ngrams-diagnosis'] !== 'string' ||
      !scripts['check:gdelt-web-ngrams-diagnosis'].includes('--dry-run --no-output')) {
    fail('package.json missing dry-run check:gdelt-web-ngrams-diagnosis');
  }
  if (typeof scripts['sanitize:gdelt-web-ngrams-artifacts'] !== 'string' ||
      !scripts['sanitize:gdelt-web-ngrams-artifacts'].includes('scripts/oil-directional/sanitize-gdelt-web-ngrams-artifacts.mjs')) {
    fail('package.json missing scripts.sanitize:gdelt-web-ngrams-artifacts');
  }
  if (typeof scripts['check:gdelt-web-ngrams-artifact-sanitizer'] !== 'string' ||
      !scripts['check:gdelt-web-ngrams-artifact-sanitizer'].includes('scripts/check-gdelt-web-ngrams-artifact-sanitizer.mjs')) {
    fail('package.json missing scripts.check:gdelt-web-ngrams-artifact-sanitizer');
  }
  if (!scripts['check:all'].includes('check:gdelt-web-ngrams-artifact-sanitizer')) {
    fail('check:all must include check:gdelt-web-ngrams-artifact-sanitizer');
  }
  if (typeof scripts['review:gdelt-web-ngrams-samples'] !== 'string' ||
      !scripts['review:gdelt-web-ngrams-samples'].includes('scripts/oil-directional/review-gdelt-web-ngrams-samples.mjs')) {
    fail('package.json missing scripts.review:gdelt-web-ngrams-samples');
  }
  if (typeof scripts['check:gdelt-web-ngrams-samples-review'] !== 'string' ||
      !scripts['check:gdelt-web-ngrams-samples-review'].includes('docs/fixtures/oil-news/gdelt-web-ngrams-diagnosis-sample-a.json')) {
    fail('package.json missing fixture-backed check:gdelt-web-ngrams-samples-review');
  }
  if (!scripts['check:all'].includes('check:gdelt-web-ngrams-samples-review')) {
    fail('check:all must include check:gdelt-web-ngrams-samples-review');
  }
  if (typeof scripts['archive:gdelt-web-ngrams-samples'] !== 'string' ||
      !scripts['archive:gdelt-web-ngrams-samples'].includes('scripts/oil-directional/archive-gdelt-web-ngrams-samples.mjs')) {
    fail('package.json missing scripts.archive:gdelt-web-ngrams-samples');
  }
  if (typeof scripts['check:gdelt-web-ngrams-sample-archive'] !== 'string' ||
      !scripts['check:gdelt-web-ngrams-sample-archive'].includes('--dry-run --min-review-samples 2 --no-review-output')) {
    fail('package.json missing dry-run check:gdelt-web-ngrams-sample-archive');
  }
  if (!scripts['check:all'].includes('check:gdelt-web-ngrams-sample-archive')) {
    fail('check:all must include check:gdelt-web-ngrams-sample-archive');
  }
  if (typeof scripts['check:gdelt-web-ngrams-fallback-source-review'] !== 'string' ||
      !scripts['check:gdelt-web-ngrams-fallback-source-review'].includes('scripts/check-gdelt-web-ngrams-fallback-source-review.mjs')) {
    fail('package.json missing scripts.check:gdelt-web-ngrams-fallback-source-review');
  }
  if (!scripts['check:all'].includes('check:gdelt-web-ngrams-fallback-source-review')) {
    fail('check:all must include check:gdelt-web-ngrams-fallback-source-review');
  }
  if (typeof scripts['check:gdelt-web-ngrams-production-display-fallback-contract'] !== 'string' ||
      !scripts['check:gdelt-web-ngrams-production-display-fallback-contract'].includes('scripts/check-gdelt-web-ngrams-production-display-fallback-contract.mjs')) {
    fail('package.json missing scripts.check:gdelt-web-ngrams-production-display-fallback-contract');
  }
  if (!scripts['check:all'].includes('check:gdelt-web-ngrams-production-display-fallback-contract')) {
    fail('check:all must include check:gdelt-web-ngrams-production-display-fallback-contract');
  }
  if (typeof scripts['check:gdelt-web-ngrams-sample-collector-workflow'] !== 'string' ||
      !scripts['check:gdelt-web-ngrams-sample-collector-workflow'].includes('scripts/check-gdelt-web-ngrams-sample-collector-workflow.mjs')) {
    fail('package.json missing scripts.check:gdelt-web-ngrams-sample-collector-workflow');
  }
  if (!scripts['check:all'].includes('check:gdelt-web-ngrams-sample-collector-workflow')) {
    fail('check:all must include check:gdelt-web-ngrams-sample-collector-workflow');
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
  if (!/GDELT_CACHE_TTL_MINUTES\s*=\s*1440/u.test(oilNews)) {
    fail(`${oilNewsPath} must keep ODP GDELT fresh-cache TTL at 1440 minutes`);
  }
  if (!/GDELT_STALE_MAX_HOURS\s*=\s*72/u.test(oilNews)) {
    fail(`${oilNewsPath} must keep ODP GDELT stale-cache fallback at 72 hours`);
  }
  if (!/GDELT_ERROR_COOLDOWN_HOURS\s*=\s*24/u.test(oilNews)) {
    fail(`${oilNewsPath} must keep ODP GDELT error cooldown at 24 hours`);
  }
  if (!oilNews.includes('maxRetries: 0')) {
    fail(`${oilNewsPath} must keep ODP GDELT live attempts single-attempt after cache/cooldown expiry`);
  }
  const oilNewsNgramsPath = 'scripts/oil-directional/diagnose-gdelt-web-ngrams.mjs';
  if (!existsSync(resolve(oilNewsNgramsPath))) {
    fail(`${oilNewsNgramsPath} missing`);
  } else {
    const oilNewsNgrams = readText(oilNewsNgramsPath);
    if (!oilNewsNgrams.includes("../gdelt/fetch-gdelt.mjs") && !oilNewsNgrams.includes('../gdelt/fetch-gdelt.mjs')) {
      fail(`${oilNewsNgramsPath} must import shared GDELT wrapper`);
    }
    for (const phrase of [
      'DIAGNOSIS_VERSION',
      'gdelt-web-ngrams-diagnosis-p41',
      'manual_live_diagnosis',
      'buildHeartbeatDiscoveryTimestamps',
      'probeFirstAvailableNgrams',
      '--max-probes',
      'productionDisplayApproved: false',
      'promotionEligible: false',
      'sanitizeSelectedFileForArtifact'
    ]) {
      if (!oilNewsNgrams.includes(phrase)) fail(`${oilNewsNgramsPath} missing Web NGrams diagnosis phrase: ${phrase}`);
    }
    if (oilNewsNgrams.includes('url: fetched.url')) {
      fail(`${oilNewsNgramsPath} must not write selectedFile.url after P48`);
    }
  }
  const oilNewsNgramsSanitizerPath = 'scripts/oil-directional/sanitize-gdelt-web-ngrams-artifacts.mjs';
  if (!existsSync(resolve(oilNewsNgramsSanitizerPath))) {
    fail(`${oilNewsNgramsSanitizerPath} missing`);
  } else {
    const oilNewsNgramsSanitizer = readText(oilNewsNgramsSanitizerPath);
    for (const phrase of [
      'gdelt-web-ngrams-artifact-sanitizer-p48',
      'selectedFile.url',
      'manual GDELT Web NGrams artifact sanitizer only',
      'rewrites ignored manual-artifacts only',
      'Refusing to rewrite outside manual-artifacts',
      'productionDisplayApproved: false',
      'promotionEligible: false'
    ]) {
      if (!oilNewsNgramsSanitizer.includes(phrase)) fail(`${oilNewsNgramsSanitizerPath} missing P48 artifact sanitizer phrase: ${phrase}`);
    }
    for (const forbidden of ['fetch(', 'node:https', 'node:http', "writeFileSync(resolve('data/", 'writeFileSync(resolve("data/']) {
      if (oilNewsNgramsSanitizer.includes(forbidden)) fail(`${oilNewsNgramsSanitizerPath} must remain no-network/no-production-write; found ${forbidden}`);
    }
  }
  const oilNewsNgramsReviewPath = 'scripts/oil-directional/review-gdelt-web-ngrams-samples.mjs';
  if (!existsSync(resolve(oilNewsNgramsReviewPath))) {
    fail(`${oilNewsNgramsReviewPath} missing`);
  } else {
    const oilNewsNgramsReview = readText(oilNewsNgramsReviewPath);
    for (const phrase of [
      'gdelt-web-ngrams-samples-review-p43',
      'manual GDELT Web NGrams sample review only',
      'readyForProductionDisplayFallback: false',
      'readyForScoring: false',
      'promotionEligible: false',
      'productionDisplayApproved: false'
    ]) {
      if (!oilNewsNgramsReview.includes(phrase)) fail(`${oilNewsNgramsReviewPath} missing Web NGrams sample review phrase: ${phrase}`);
    }
    for (const forbidden of ['fetch(', 'node:https', 'node:http', "writeFileSync(resolve('data/", 'writeFileSync(resolve("data/']) {
      if (oilNewsNgramsReview.includes(forbidden)) fail(`${oilNewsNgramsReviewPath} must remain no-network/no-production-write; found ${forbidden}`);
    }
  }
  const oilNewsNgramsArchivePath = 'scripts/oil-directional/archive-gdelt-web-ngrams-samples.mjs';
  if (!existsSync(resolve(oilNewsNgramsArchivePath))) {
    fail(`${oilNewsNgramsArchivePath} missing`);
  } else {
    const oilNewsNgramsArchive = readText(oilNewsNgramsArchivePath);
    for (const phrase of [
      'gdelt-web-ngrams-sample-archive-p44',
      'manual GDELT Web NGrams sample archive only',
      'stable_manual_review_ready',
      'insufficient_samples',
      'unstable_keep_manual_only',
      'promotionEligible: false',
      'productionDisplayApproved: false',
      'review:gdelt-web-ngrams-samples'
    ]) {
      if (!oilNewsNgramsArchive.includes(phrase)) fail(`${oilNewsNgramsArchivePath} missing Web NGrams sample archive phrase: ${phrase}`);
    }
    for (const phrase of [
      'sanitizeGdeltWebNgramsArtifact',
      'GDELT_WEB_NGRAMS_ARTIFACT_SANITIZER_VERSION',
      'writeFileSync(targetPaths.samplePath, validation.text'
    ]) {
      if (!oilNewsNgramsArchive.includes(phrase)) fail(`${oilNewsNgramsArchivePath} missing P48 sanitizer phrase: ${phrase}`);
    }
    if (oilNewsNgramsArchive.includes('copyFileSync')) {
      fail(`${oilNewsNgramsArchivePath} must write sanitized samples instead of copying raw input after P48`);
    }
    for (const forbidden of ['fetch(', 'node:https', 'node:http', "writeFileSync(resolve('data/", 'writeFileSync(resolve("data/']) {
      if (oilNewsNgramsArchive.includes(forbidden)) fail(`${oilNewsNgramsArchivePath} must remain no-network/no-production-write; found ${forbidden}`);
    }
  }
  const oilNewsNgramsFallbackReviewPath = 'scripts/check-gdelt-web-ngrams-fallback-source-review.mjs';
  if (!existsSync(resolve(oilNewsNgramsFallbackReviewPath))) {
    fail(`${oilNewsNgramsFallbackReviewPath} missing`);
  } else {
    const oilNewsNgramsFallbackReview = readText(oilNewsNgramsFallbackReviewPath);
    for (const phrase of [
      'gdelt-web-ngrams-fallback-source-review-p45',
      'source_review_manual_fallback_candidate_no_production_display',
      'oil_news_gdelt_web_ngrams_background_fallback_display_only',
      'productionDisplayFallbackApproved',
      'currentSignalEnhancementApproved',
      'scoreApproved',
      'assertRuntimeUnwired'
    ]) {
      if (!oilNewsNgramsFallbackReview.includes(phrase)) fail(`${oilNewsNgramsFallbackReviewPath} missing P45 fallback source-review phrase: ${phrase}`);
    }
    for (const forbidden of ['fetch(', 'node:https', 'node:http', "writeFileSync(resolve('data/", 'writeFileSync(resolve("data/']) {
      if (oilNewsNgramsFallbackReview.includes(forbidden)) fail(`${oilNewsNgramsFallbackReviewPath} must remain no-network/no-production-write; found ${forbidden}`);
    }
  }
  const oilNewsNgramsDisplayContractPath = 'scripts/check-gdelt-web-ngrams-production-display-fallback-contract.mjs';
  if (!existsSync(resolve(oilNewsNgramsDisplayContractPath))) {
    fail(`${oilNewsNgramsDisplayContractPath} missing`);
  } else {
    const oilNewsNgramsDisplayContract = readText(oilNewsNgramsDisplayContractPath);
    for (const phrase of [
      'gdelt-web-ngrams-production-display-fallback-contract-p46',
      'contract_design_only_waiting_for_sufficient_p44_samples_no_production_write',
      'sourceCaches.gdeltWebNgramsFallback',
      'aggregate_source_health_only_no_headlines',
      'productionWriteApproved',
      'frontendApproved',
      'workflowApproved',
      'currentSignalEnhancementApproved',
      'scoreApproved',
      'assertRuntimeUnwired'
    ]) {
      if (!oilNewsNgramsDisplayContract.includes(phrase)) fail(`${oilNewsNgramsDisplayContractPath} missing P46 production display fallback contract phrase: ${phrase}`);
    }
    for (const forbidden of ['fetch(', 'node:https', 'node:http', "writeFileSync(resolve('data/", 'writeFileSync(resolve("data/']) {
      if (oilNewsNgramsDisplayContract.includes(forbidden)) fail(`${oilNewsNgramsDisplayContractPath} must remain no-network/no-production-write; found ${forbidden}`);
    }
  }
  const oilNewsNgramsCollectorWorkflowPath = 'scripts/check-gdelt-web-ngrams-sample-collector-workflow.mjs';
  if (!existsSync(resolve(oilNewsNgramsCollectorWorkflowPath))) {
    fail(`${oilNewsNgramsCollectorWorkflowPath} missing`);
  } else {
    const oilNewsNgramsCollectorWorkflow = readText(oilNewsNgramsCollectorWorkflowPath);
    for (const phrase of [
      'GDELT Web NGrams Sample Collector',
      'gdelt-web-ngrams-sample-collector.yml',
      'npm run diagnose:gdelt-web-ngrams -- --allow-network --max-probes 96',
      'npm run sanitize:gdelt-web-ngrams-artifacts -- --input-dir manual-artifacts/oil-news/gdelt-web-ngrams-samples --allow-empty',
      'npm run sanitize:gdelt-web-ngrams-artifacts -- --input manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json --allow-empty',
      'npm run archive:gdelt-web-ngrams-samples',
      'npm run review:gdelt-web-ngrams-samples',
      'contents: read',
      'actions: read',
      'artifact-only sample collection and gate review'
    ]) {
      if (!oilNewsNgramsCollectorWorkflow.includes(phrase)) fail(`${oilNewsNgramsCollectorWorkflowPath} missing P47 collector workflow phrase: ${phrase}`);
    }
  }
  const worldOrderPath = 'scripts/world-order/fetch-gdelt-cloud.mjs';
  if (!existsSync(resolve(worldOrderPath))) {
    fail(`${worldOrderPath} missing`);
  } else {
    const worldOrder = readText(worldOrderPath);
    if (!worldOrder.includes("../gdelt/fetch-gdelt.mjs") && !worldOrder.includes('../gdelt/fetch-gdelt.mjs')) {
      fail(`${worldOrderPath} must import shared GDELT wrapper after P39`);
    }
    if (GDELT_ENDPOINT_RE.test(worldOrder)) {
      fail(`${worldOrderPath} must not contain direct GDELT endpoint markers after P39`);
    }
    for (const phrase of REQUIRED_WORLD_ORDER_CACHE_PHRASES) {
      if (!worldOrder.includes(phrase)) fail(`${worldOrderPath} missing P39 World Order cache phrase: ${phrase}`);
    }
  }
  const worldOrderBuildPath = 'scripts/build-world-order-stress.mjs';
  if (!existsSync(resolve(worldOrderBuildPath))) {
    fail(`${worldOrderBuildPath} missing`);
  } else {
    const worldOrderBuild = readText(worldOrderBuildPath);
    if (!worldOrderBuild.includes('DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT')) {
      fail(`${worldOrderBuildPath} must write the World Order GDELT cache after P39`);
    }
    if (!worldOrderBuild.includes('stripBuildOnlyFields')) {
      fail(`${worldOrderBuildPath} must strip cacheArtifact from public world-order-stress.json`);
    }
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
    if (cache.cachePolicy?.lastUsableCachePreservedOnError !== true ||
        cache.cachePolicy?.lastUsableCacheAffectsCurrentSignal !== false) {
      fail(`${GDELT_NEWS_CACHE} must declare last usable cache preservation without current-signal impact`);
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
  if (!existsSync(resolve(GDELT_WORLD_ORDER_CACHE))) {
    fail(`${GDELT_WORLD_ORDER_CACHE} missing`);
  } else {
    const cache = JSON.parse(readText(GDELT_WORLD_ORDER_CACHE));
    if (cache.schemaVersion !== 'gdelt-world-order-cache-p39') {
      fail(`${GDELT_WORLD_ORDER_CACHE} schemaVersion must be gdelt-world-order-cache-p39`);
    }
    if (cache.module !== 'gdelt-world-order-cache') fail(`${GDELT_WORLD_ORDER_CACHE} module must be gdelt-world-order-cache`);
    if (cache.cacheScope !== 'world_order_gdelt_cloud') fail(`${GDELT_WORLD_ORDER_CACHE} cacheScope must be world_order_gdelt_cloud`);
    if (cache.query?.id !== 'gdelt_world_order_conflict_country_summary') {
      fail(`${GDELT_WORLD_ORDER_CACHE} query.id must be gdelt_world_order_conflict_country_summary`);
    }
    if (cache.cachePolicy?.lowFrequencyCache !== true || cache.cachePolicy?.singleAttemptAfterCacheExpiry !== true) {
      fail(`${GDELT_WORLD_ORDER_CACHE} must declare lowFrequencyCache and singleAttemptAfterCacheExpiry`);
    }
    if (cache.cachePolicy?.sharedWrapper !== 'scripts/gdelt/fetch-gdelt.mjs') {
      fail(`${GDELT_WORLD_ORDER_CACHE} must declare shared wrapper path`);
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
