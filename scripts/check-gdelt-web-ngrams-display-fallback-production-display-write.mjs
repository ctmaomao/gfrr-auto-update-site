#!/usr/bin/env node
import { readJson, runNode } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertGdeltWebNgramsDisplayFallbackCache, buildGdeltWebNgramsDisplayFallbackCache } from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';

const ROOT = process.cwd();
const WRITER = 'scripts/write-gdelt-web-ngrams-display-fallback-production-cache.mjs';
const BUILDER = 'scripts/oil-directional/build-oil-news-event-watch.mjs';
const HELPER = 'scripts/oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';
const DOC = 'docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_PRODUCTION_DISPLAY_WRITE.md';
const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-production-display-write-p56.json';
const PRODUCTION_ARTIFACT = 'data/oil-news-event-watch.json';
const GENERATED_AT = '2026-07-06T00:00:00.000Z';

const GUARDED_RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/oil-directional/build-oil-directional-pressure.mjs',
  'scripts/modules/renderOilDirectional.js',
  'data/oil-directional-pressure.json',
  'data/radar-data.json',
  '.github/workflows/refresh-oil-news-event-watch.yml'
];

function absolute(relativePath) {
  return join(ROOT, relativePath);
}

function readText(relativePath) {
  return readFileSync(absolute(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoRawContentMarkers(value, path = '$') {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const forbidden of ['http://', 'https://', '<html', '<!doctype', 'article title', 'article url', 'article body', 'rawresponse']) {
      assert(!lower.includes(forbidden), `${path} contains forbidden raw-content marker: ${forbidden}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawContentMarkers(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assert(!['title', 'url', 'snippet', 'raw', 'body', 'rawResponse', 'titleHash'].includes(key), `${path}.${key} is forbidden`);
      assertNoRawContentMarkers(nested, `${path}.${key}`);
    }
  }
}

function assertFixtureAndHelper() {
  const fixture = readJson(FIXTURE);
  const generated = buildGdeltWebNgramsDisplayFallbackCache({ generatedAt: GENERATED_AT });
  assert(JSON.stringify(generated) === JSON.stringify(fixture), 'Helper-generated P56 cache must match fixture.');
  assertGdeltWebNgramsDisplayFallbackCache(fixture);
  assertNoRawContentMarkers(fixture);
}

function assertScriptSafety() {
  for (const relativePath of [WRITER, HELPER]) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const forbidden of ['fetch(', 'process.env', 'node:https', 'node:http', 'axios']) {
      assert(!source.includes(forbidden), `${relativePath} contains forbidden live-source marker: ${forbidden}`);
    }
  }
  const writer = readText(WRITER);
  for (const marker of [
    'Refusing to write GDELT Web NGrams fallback cache outside',
    'sourceCaches.gdeltWebNgramsFallback',
    'production_display_only_cache_written'
  ]) {
    assert(writer.includes(marker), `${WRITER} missing marker: ${marker}`);
  }
  const builder = readText(BUILDER);
  assert(builder.includes('attachGdeltWebNgramsDisplayFallbackCache'), `${BUILDER} must attach P56 fallback cache.`);
}

function assertWriterDryRun() {
  const stdout = runNode([
    WRITER,
    '--generated-at',
    GENERATED_AT,
    '--no-output',
    '--json'
  ]);
  const artifact = JSON.parse(stdout);
  assert(artifact.schemaVersion === 'oil-news-event-watch-1', 'Writer dry-run must preserve Oil News artifact schema.');
  assert(artifact.promotionEligible === false, 'Writer dry-run must preserve promotionEligible=false.');
  const cache = artifact.sourceCaches?.gdeltWebNgramsFallback;
  assertGdeltWebNgramsDisplayFallbackCache(cache);
  assert(JSON.stringify(cache) === JSON.stringify(readJson(FIXTURE)), 'Writer dry-run cache must match P56 fixture.');
}

function assertProductionArtifact() {
  const artifact = readJson(PRODUCTION_ARTIFACT);
  assert(artifact.schemaVersion === 'oil-news-event-watch-1', 'Production Oil News schema mismatch.');
  assert(artifact.productionDisplayApproved === true, 'Oil News productionDisplayApproved must remain true.');
  assert(artifact.promotionEligible === false, 'Oil News promotionEligible must remain false.');
  const cache = artifact.sourceCaches?.gdeltWebNgramsFallback;
  assertGdeltWebNgramsDisplayFallbackCache(cache);
  assert(cache.productionDataWriteApproved === true, 'P56 production cache must declare scoped production data write approval.');
  assert(cache.currentSignalEnhancement === false, 'P56 production cache must not enhance current signal.');
  assert(cache.eligibleForScoring === false, 'P56 production cache must not be scoring eligible.');
  assertNoRawContentMarkers(cache);
}

function assertGuardedRuntimeUnchanged() {
  for (const relativePath of GUARDED_RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of [
      'gdeltWebNgramsFallback',
      'gdelt-web-ngrams-display-fallback-cache-v1',
      'GDELT Web NGrams fallback cache'
    ]) {
      assert(!source.includes(marker), `${relativePath} must not consume P56 fallback marker: ${marker}`);
    }
  }
}

function assertDocsAndPackage() {
  assert(existsSync(absolute(DOC)), `${DOC} is missing.`);
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const oilNewsReview = readText('docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md');
  const gdeltPolicy = readText('docs/GDELT_SOURCE_POLICY.md');
  const p56Doc = readText(DOC);
  const packageJson = readJson('package.json');

  for (const marker of [
    'p56_display_only_fallback_production_display_write',
    'gdelt-web-ngrams-display-fallback-cache-v1',
    'sourceCaches.gdeltWebNgramsFallback',
    'productionDataWriteApproved=true',
    'frontendDisplayApproved=false',
    'currentSignalEnhancement=false',
    'eligibleForScoring=false',
    'write:gdelt-web-ngrams-display-fallback-production-cache',
    'check:gdelt-web-ngrams-display-fallback-production-display-write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
    assert(p56Doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
  assert(packageJson.scripts['write:gdelt-web-ngrams-display-fallback-production-cache'], 'package.json missing P56 write script.');
  assert(packageJson.scripts['check:gdelt-web-ngrams-display-fallback-production-display-write'], 'package.json missing P56 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-display-fallback-production-display-write'), 'check:all missing P56 check.');
}

function main() {
  assertFixtureAndHelper();
  assertScriptSafety();
  assertWriterDryRun();
  assertProductionArtifact();
  assertGuardedRuntimeUnchanged();
  assertDocsAndPackage();
  console.log('GDELT Web NGrams display fallback production display write: PASS');
}

main();
