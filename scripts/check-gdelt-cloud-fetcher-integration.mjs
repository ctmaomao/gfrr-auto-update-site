import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
function fail(message) {
  errors.push(message);
}

function readText(path) {
  return readFileSync(resolve(path), 'utf8');
}

const fetcherPath = 'scripts/world-order/fetch-gdelt-cloud.mjs';
const legacyFetcherPath = 'scripts/world-order/fetch-gdelt.mjs';
const legacyDiagnosticPath = 'scripts/world-order/diagnose-gdelt-source.mjs';
const workflowPath = '.github/workflows/refresh-world-order-stress.yml';
const buildPath = 'scripts/build-world-order-stress.mjs';
const narrativePath = 'scripts/modules/buildCrossValidationMatrix.js';
const cachePath = 'data/gdelt-world-order-cache.json';

if (!existsSync(resolve(fetcherPath))) fail('M-59: GDELT Cloud fetcher missing');
if (!existsSync(resolve(workflowPath))) fail('M-59: Refresh World Order Stress workflow missing');
if (existsSync(resolve(legacyFetcherPath))) fail('M-59: legacy scripts/world-order/fetch-gdelt.mjs should be deleted');
if (existsSync(resolve(legacyDiagnosticPath))) fail('M-59: legacy scripts/world-order/diagnose-gdelt-source.mjs should be deleted');

const fetcherContent = existsSync(resolve(fetcherPath)) ? readText(fetcherPath) : '';
const workflowContent = existsSync(resolve(workflowPath)) ? readText(workflowPath) : '';
const buildContent = existsSync(resolve(buildPath)) ? readText(buildPath) : '';
const narrativeContent = existsSync(resolve(narrativePath)) ? readText(narrativePath) : '';

for (const needle of [
  'secrets.GDELT_CLOUD_API_KEY',
  'npm run build:world-order',
  'npm run check:world-order',
  "cron: '0 23 * * *'",
  'continue-on-error: true',
  'data/gdelt-world-order-cache.json'
]) {
  if (!workflowContent.includes(needle)) fail(`M-59 workflow: missing "${needle}"`);
}

for (const needle of [
  'process.env.GDELT_CLOUD_API_KEY',
  '../gdelt/fetch-gdelt.mjs',
  'fetchGdeltCloudJson',
  'DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT',
  'readGdeltWorldOrderCache',
  'event_family',
  'group_by',
  'KEY_CONFLICT_REGIONS',
  'maxRetries: 0'
]) {
  if (!fetcherContent.includes(needle)) fail(`M-59 fetcher: missing "${needle}"`);
}
if (fetcherContent.includes('https://gdeltcloud.com/api/v2')) {
  fail('P39 fetcher: direct GDELT Cloud endpoint must live only in shared wrapper');
}
if (fetcherContent.includes('fetch(')) {
  fail('P39 fetcher: direct fetch must not be reintroduced');
}

if (!buildContent.includes('fetchGdeltCloudSummary')) {
  fail('M-59 build script: fetchGdeltCloudSummary import/call missing');
}
if (!buildContent.includes('fetch-gdelt-cloud.mjs')) {
  fail('M-59 build script: fetch-gdelt-cloud.mjs import path missing');
}
for (const needle of [
  'DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT',
  'gdeltCacheArtifact',
  'stripBuildOnlyFields'
]) {
  if (!buildContent.includes(needle)) fail(`P39 build script: missing "${needle}"`);
}
if (buildContent.includes('fetch-gdelt.mjs')) {
  fail('M-59 build script: legacy fetch-gdelt.mjs import still present');
}

for (const marker of [
  'gdelt_event_density',
  'gdelt_multi_country',
  'gdelt_fatalities',
  'gdelt_key_regions'
]) {
  if (!narrativeContent.includes(marker)) fail(`M-59 narrative: missing ${marker}`);
}

const secretLeakPattern = /(?:GDELT_CLOUD_API_KEY)\s*[:=]\s*['"](?!\$)[a-zA-Z0-9._-]{8,}/u;
const gdeltTokenPattern = /gdelt_sk_[a-zA-Z0-9._-]+/u;
for (const [path, content] of [
  [fetcherPath, fetcherContent],
  [workflowPath, workflowContent],
  [buildPath, buildContent]
]) {
  if (secretLeakPattern.test(content)) fail(`M-59 secret leak guard: literal key assignment found in ${path}`);
  if (gdeltTokenPattern.test(content)) fail(`M-59 secret leak guard: gdelt_sk token literal found in ${path}`);
}

if (!existsSync(resolve(cachePath))) {
  fail('P39: World Order GDELT cache missing');
} else {
  const cache = JSON.parse(readText(cachePath));
  if (cache.schemaVersion !== 'gdelt-world-order-cache-p39') {
    fail('P39 cache: schemaVersion must be gdelt-world-order-cache-p39');
  }
  if (cache.cacheScope !== 'world_order_gdelt_cloud') {
    fail('P39 cache: cacheScope must be world_order_gdelt_cloud');
  }
  if (cache.cachePolicy?.lowFrequencyCache !== true || cache.cachePolicy?.singleAttemptAfterCacheExpiry !== true) {
    fail('P39 cache: must declare lowFrequencyCache + singleAttemptAfterCacheExpiry');
  }
  if (cache.cachePolicy?.rawProviderResponseStored !== false || cache.cachePolicy?.authorizationStored !== false) {
    fail('P39 cache: must declare no raw provider response or authorization storage');
  }
}

if (errors.length > 0) {
  console.error('GDELT Cloud fetcher integration check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log('GDELT Cloud fetcher integration check: PASS (Cloud v2 shared wrapper/cache + workflow + narrative branches + legacy deletion locked)');
