#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertGdeltWebNgramsDisplayFallbackCache,
  buildGdeltWebNgramsAutomatedDisplayCache
} from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';

const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-automated-display-cache-v2.json';
const PRODUCTION = 'data/oil-news-event-watch.json';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function readText(path) {
  return readFileSync(resolve(path), 'utf8');
}

const diagnosis = readJson(FIXTURE);
const live = buildGdeltWebNgramsAutomatedDisplayCache({
  diagnosis,
  generatedAt: '2026-07-31T14:10:00.000Z'
});
assertGdeltWebNgramsDisplayFallbackCache(live);
assert(live.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v2', 'Automated cache contract mismatch.');
assert(live.status === 'live', 'Fresh diagnosis must produce live automated cache.');
assert(live.workflowAutomationApproved === true && live.liveFetchApproved === true, 'Automated cache approvals missing.');
assert(live.apiKeyReadApproved === false, 'Automated cache must remain keyless.');
assert(live.aggregate.totalHitCount === 18 && live.aggregate.uniqueDocCount === 14, 'Automated aggregate mismatch.');
assert(live.automation.selectedFileTimestamp === '20260731140200', 'Automated selected timestamp mismatch.');

const unavailableDiagnosis = {
  ...diagnosis,
  generatedAt: '2026-07-31T20:00:00.000Z',
  status: 'source_unavailable',
  selectedFile: null,
  summary: {
    totalHitCount: 0,
    totalMentionCount: 0,
    uniqueDocCount: 0,
    bucketCounts: {},
    terms: []
  }
};
const stale = buildGdeltWebNgramsAutomatedDisplayCache({
  diagnosis: unavailableDiagnosis,
  previousCache: live,
  generatedAt: unavailableDiagnosis.generatedAt
});
assertGdeltWebNgramsDisplayFallbackCache(stale);
assert(stale.status === 'stale', 'Recent prior observation must degrade to stale.');
assert(stale.aggregate.totalHitCount === live.aggregate.totalHitCount, 'Stale cache must preserve compact aggregate.');
assert(stale.usedForCurrentOilNewsSignal === false, 'Stale automated cache must not affect current signal.');

const unavailable = buildGdeltWebNgramsAutomatedDisplayCache({
  diagnosis: {
    ...unavailableDiagnosis,
    generatedAt: '2026-08-01T10:30:00.000Z'
  },
  previousCache: live,
  generatedAt: '2026-08-01T10:30:00.000Z'
});
assertGdeltWebNgramsDisplayFallbackCache(unavailable);
assert(unavailable.status === 'source_unavailable', 'Expired prior observation must fail closed.');
assert(unavailable.aggregate.totalHitCount === 0, 'Expired automated cache must not preserve active aggregate.');

const production = readJson(PRODUCTION);
assertGdeltWebNgramsDisplayFallbackCache(production.sourceCaches?.gdeltWebNgramsFallback);

const writer = readText('scripts/write-gdelt-web-ngrams-display-fallback-production-cache.mjs');
for (const marker of [
  '--diagnosis',
  'manual-artifacts/oil-news/',
  'buildGdeltWebNgramsAutomatedDisplayCache',
  'automated_production_display_only_cache_written'
]) {
  assert(
    writer.includes(marker) || readText('scripts/oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs').includes(marker),
    `Automated writer path missing marker: ${marker}`
  );
}

const workflow = readText('.github/workflows/refresh-oil-news-event-watch.yml');
for (const marker of [
  'Refresh automated Web NGrams display cache',
  'diagnose:gdelt-web-ngrams',
  'sanitize:gdelt-web-ngrams-artifacts',
  'write:gdelt-web-ngrams-display-fallback-production-cache',
  '--diagnosis "$diagnosis_path"'
]) {
  assert(workflow.includes(marker), `Oil News workflow missing marker: ${marker}`);
}

for (const path of [
  'scripts/oil-directional/build-oil-directional-pressure.mjs',
  'data/oil-directional-pressure.json',
  'data/radar-data.json'
]) {
  assert(!readText(path).includes('gdelt-web-ngrams-display-fallback-cache-v2'), `${path} must not consume automated Web NGrams cache.`);
}

for (const path of ['docs/GDELT_SOURCE_POLICY.md', 'docs/DATA_SOURCES.md', 'docs/OPERATIONS.md']) {
  const text = readText(path);
  for (const marker of [
    'gdelt-web-ngrams-display-fallback-cache-v2',
    'automated display-only',
    'not a current Oil News signal'
  ]) {
    assert(text.includes(marker), `${path} missing automated-cache marker: ${marker}`);
  }
}

console.log('GDELT Web NGrams automated display cache: PASS');
