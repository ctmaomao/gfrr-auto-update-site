#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertGdeltWebNgramsDisplayFallbackCache } from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';

const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-frontend-aggregate-health-p63.json';
const DOC = 'docs/GDELT_WEB_NGRAMS_FRONTEND_AGGREGATE_HEALTH.md';
const PRODUCTION = 'data/oil-news-event-watch.json';
const RENDERER = 'scripts/modules/renderOilDirectional.js';
const EXPECTED_ALLOWED_FIELDS = [
  'contractVersion',
  'frontendDisplayApproved',
  'displayMode',
  'status',
  'sampleGate.state',
  'sampleGate.usableSampleCount',
  'sampleGate.selectedTimestampCount',
  'sampleGate.observationWindowHours',
  'sampleGate.warningCount',
  'sourceHealth.state',
  'sourceHealth.freshness',
  'sourceHealth.usedForCurrentSignal',
  'limitationZh'
];
const PRODUCTION_IMPACT_FIELDS = [
  'affectsValues',
  'affectsScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance',
  'affectsBrentPromotion',
  'affectsOdpFinalBias',
  'affectsGlobalRiskHeatmap',
  'affectsCrossValidation'
];

function readText(path) {
  return readFileSync(resolve(path), 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertApprovalFixture() {
  const fixture = readJson(FIXTURE);
  assert(fixture.contractVersion === 'gdelt-web-ngrams-frontend-aggregate-health-p63', 'P63 contract mismatch.');
  assert(fixture.status === 'frontend_aggregate_source_health_approved', 'P63 status mismatch.');
  assert(
    fixture.sourceField === 'data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback',
    'P63 source field mismatch.'
  );
  assert(fixture.requiredCacheContract === 'gdelt-web-ngrams-display-fallback-cache-v1', 'P63 cache contract mismatch.');
  assert(fixture.displayMode === 'aggregate_source_health_only_no_headlines', 'P63 display mode mismatch.');
  assert(
    JSON.stringify(fixture.allowedFrontendFields) === JSON.stringify(EXPECTED_ALLOWED_FIELDS),
    'P63 frontend field allowlist changed.'
  );
  assert(fixture.approvalState?.frontendAggregateHealthApproved === true, 'P63 aggregate-health display must be approved.');
  for (const field of [
    'headlineDisplayApproved',
    'rawContentDisplayApproved',
    'currentSignalEnhancementApproved',
    'eventConfirmationApproved',
    'oilDirectionInputApproved',
    'workflowAutomationApproved',
    'liveFetchApproved',
    'scoreApproved'
  ]) {
    assert(fixture.approvalState?.[field] === false, `P63 approvalState.${field} must be false.`);
  }
  for (const field of PRODUCTION_IMPACT_FIELDS) {
    assert(fixture.productionImpact?.[field] === false, `P63 productionImpact.${field} must be false.`);
  }
}

function assertProductionCache() {
  const artifact = readJson(PRODUCTION);
  const cache = artifact.sourceCaches?.gdeltWebNgramsFallback;
  assertGdeltWebNgramsDisplayFallbackCache(cache);
  assert(cache.frontendDisplayApproved === true, 'Production cache must carry P63 frontend approval.');
  assert(
    cache.sourceReview?.frontendGate === 'gdelt-web-ngrams-frontend-aggregate-health-p63',
    'Production cache must cite the P63 frontend gate.'
  );
  for (const field of [
    'currentSignalEnhancement',
    'eventConfirmationSource',
    'headlineSource',
    'oilDirectionInput',
    'eligibleForScoring',
    'usedForCurrentOilNewsSignal',
    'usedForOdpFinalBias',
    'usedForMainScore',
    'workflowAutomationApproved',
    'liveFetchApproved',
    'apiKeyReadApproved'
  ]) {
    assert(cache[field] === false, `Production cache ${field} must remain false.`);
  }
}

function assertFrontendProjection() {
  const html = readText('index.html');
  const renderer = readText(RENDERER);
  assert(html.includes('id="odp-news-event-web-ngrams-health"'), 'P63 frontend row is missing.');
  const start = renderer.indexOf('function webNgramsSourceHealth(data)');
  const end = renderer.indexOf('\nfunction newsFallbackContextText', start);
  assert(start >= 0 && end > start, 'P63 renderer helper is missing.');
  const helper = renderer.slice(start, end);
  for (const marker of [
    'gdeltWebNgramsFallback',
    'gdelt-web-ngrams-display-fallback-cache-v1',
    'aggregate_source_health_only_no_headlines',
    'frontendDisplayApproved',
    'sampleGate',
    'usedForCurrentSignal',
    '聚合背景样本门已通过',
    '不用于当前新闻信号'
  ]) {
    assert(helper.includes(marker), `P63 renderer helper missing marker: ${marker}`);
  }
  for (const forbidden of [
    'topArticles',
    '.articles',
    '.title',
    '.url',
    '.snippet',
    '.body',
    '.raw',
    'rawResponse',
    'providerBody',
    'responseBody'
  ]) {
    assert(!helper.includes(forbidden), `P63 renderer helper reads forbidden content: ${forbidden}`);
  }
}

function assertCorePathsRemainUnwired() {
  for (const path of [
    'scripts/oil-directional/build-oil-directional-pressure.mjs',
    'data/oil-directional-pressure.json',
    'data/radar-data.json',
    '.github/workflows/refresh-oil-news-event-watch.yml'
  ]) {
    assert(!readText(path).includes('gdeltWebNgramsFallback'), `${path} must not consume the P63 cache.`);
  }
}

function assertDocsAndPackage() {
  assert(existsSync(resolve(DOC)), `${DOC} is missing.`);
  const doc = readText(DOC);
  const packageJson = readJson('package.json');
  for (const marker of [
    'gdelt-web-ngrams-frontend-aggregate-health-p63',
    'frontend_aggregate_source_health_approved',
    'aggregate_source_health_only_no_headlines',
    'frontendAggregateHealthApproved=true',
    'frontendDisplayApproved=true',
    'currentSignalEnhancement=false',
    'eligibleForScoring=false'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
  assert(
    packageJson.scripts['check:gdelt-web-ngrams-frontend-aggregate-health'],
    'package.json missing P63 check script.'
  );
  assert(
    packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-frontend-aggregate-health'),
    'check:all missing P63 check.'
  );
}

assertApprovalFixture();
assertProductionCache();
assertFrontendProjection();
assertCorePathsRemainUnwired();
assertDocsAndPackage();
console.log('GDELT Web NGrams frontend aggregate health: PASS');
