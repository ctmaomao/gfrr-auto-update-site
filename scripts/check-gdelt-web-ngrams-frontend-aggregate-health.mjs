#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertGdeltWebNgramsDisplayFallbackCache } from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';
import { webNgramsSampleAge } from './modules/renderOilDirectional.js';

const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-frontend-aggregate-health-p63.json';
const AGE_FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-frontend-sample-age-p67.json';
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
const EXPECTED_AGE_FIELDS = [
  'staleAfterHours',
  'sampleGate.latestSelectedTimestamp'
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

function assertAgeApprovalFixture() {
  const fixture = readJson(AGE_FIXTURE);
  assert(fixture.contractVersion === 'gdelt-web-ngrams-frontend-sample-age-p67', 'P67 contract mismatch.');
  assert(fixture.status === 'frontend_sample_age_approved', 'P67 status mismatch.');
  assert(
    fixture.requiredFrontendGate === 'gdelt-web-ngrams-frontend-aggregate-health-p63',
    'P67 must preserve the P63 aggregate-health gate.'
  );
  assert(
    JSON.stringify(fixture.allowedFrontendFields) === JSON.stringify(EXPECTED_AGE_FIELDS),
    'P67 frontend field allowlist changed.'
  );
  assert(fixture.agePolicy?.timestampFormat === 'yyyyMMddHHmmss_utc', 'P67 timestamp policy mismatch.');
  assert(fixture.agePolicy?.staleThresholdField === 'staleAfterHours', 'P67 stale threshold mismatch.');
  assert(fixture.agePolicy?.invalidState === 'unavailable', 'P67 invalid state must fail closed.');
  assert(fixture.approvalState?.frontendSampleAgeApproved === true, 'P67 sample age must be approved.');
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
    assert(fixture.approvalState?.[field] === false, `P67 approvalState.${field} must be false.`);
  }
  for (const field of PRODUCTION_IMPACT_FIELDS) {
    assert(fixture.productionImpact?.[field] === false, `P67 productionImpact.${field} must be false.`);
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
  assert(
    Number.isFinite(cache.staleAfterHours) && cache.staleAfterHours > 0,
    'Production cache must expose a positive staleAfterHours threshold.'
  );
  const automated = cache.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v2';
  const freshnessTimestamp = automated
    ? cache.automation?.selectedFileTimestamp
    : cache.sampleGate?.latestSelectedTimestamp;
  if (cache.status !== 'source_unavailable') {
    assert(/^\d{14}$/.test(freshnessTimestamp || ''), 'Production cache must expose a yyyyMMddHHmmss freshness timestamp.');
  }
  for (const field of [
    'currentSignalEnhancement',
    'eventConfirmationSource',
    'headlineSource',
    'oilDirectionInput',
    'eligibleForScoring',
    'usedForCurrentOilNewsSignal',
    'usedForOdpFinalBias',
    'usedForMainScore',
    'apiKeyReadApproved'
  ]) {
    assert(cache[field] === false, `Production cache ${field} must remain false.`);
  }
  assert(cache.workflowAutomationApproved === automated, 'Production cache workflow automation approval mismatch.');
  assert(cache.liveFetchApproved === automated, 'Production cache live fetch approval mismatch.');
}

function assertFrontendProjection() {
  const html = readText('index.html');
  const renderer = readText(RENDERER);
  assert(html.includes('id="odp-news-event-web-ngrams-health"'), 'P63 frontend row is missing.');
  assert(html.includes('id="odp-news-event-web-ngrams-age"'), 'P67 sample-age row is missing.');
  const start = renderer.indexOf('function parseWebNgramsTimestamp(value)');
  const end = renderer.indexOf('\nfunction newsFallbackContextText', start);
  assert(start >= 0 && end > start, 'P63/P67 renderer helpers are missing.');
  const helper = renderer.slice(start, end);
  for (const marker of [
    'gdeltWebNgramsFallback',
    'gdelt-web-ngrams-display-fallback-cache-v1',
    'gdelt-web-ngrams-display-fallback-cache-v2',
    'aggregate_source_health_only_no_headlines',
    'frontendDisplayApproved',
    'sampleGate',
    'latestSelectedTimestamp',
    'staleAfterHours',
    'usedForCurrentSignal',
    '聚合背景样本门已通过',
    '历史审阅样本截至',
    '自动下载源正常',
    '自动源文件截至',
    '已超',
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

  const fresh = webNgramsSampleAge(
    { staleAfterHours: 72, sampleGate: { latestSelectedTimestamp: '20260705140200' } },
    Date.parse('2026-07-05T16:02:00Z')
  );
  assert(fresh.state === 'within_window', 'P67 fresh fixture must remain within window.');
  assert(fresh.text.includes('2026-07-05'), 'P67 fresh copy must expose the reviewed sample date.');
  assert(fresh.text.includes('72 小时内'), 'P67 fresh copy must expose the threshold.');

  const stale = webNgramsSampleAge(
    { staleAfterHours: 72, sampleGate: { latestSelectedTimestamp: '20260705140200' } },
    Date.parse('2026-07-09T14:02:00Z')
  );
  assert(stale.state === 'stale', 'P67 stale fixture must exceed the window.');
  assert(stale.text.includes('已超 72 小时时效'), 'P67 stale copy must be explicit.');

  const invalid = webNgramsSampleAge(
    { staleAfterHours: 72, sampleGate: { latestSelectedTimestamp: 'invalid' } },
    Date.parse('2026-07-09T14:02:00Z')
  );
  assert(invalid.state === 'unavailable', 'P67 invalid timestamp must fail closed.');
  assert(invalid.text.includes('日期待核'), 'P67 invalid copy must not fabricate a date.');

  const invalidCalendar = webNgramsSampleAge(
    { staleAfterHours: 72, sampleGate: { latestSelectedTimestamp: '20260230010101' } },
    Date.parse('2026-03-01T00:00:00Z')
  );
  assert(invalidCalendar.state === 'unavailable', 'P67 invalid calendar date must fail closed.');

  const futureBeyondTolerance = webNgramsSampleAge(
    { staleAfterHours: 72, sampleGate: { latestSelectedTimestamp: '20260705140200' } },
    Date.parse('2026-07-05T12:00:00Z')
  );
  assert(futureBeyondTolerance.state === 'unavailable', 'P67 timestamp over one hour in the future must fail closed.');
  assert(futureBeyondTolerance.text.includes('时间异常'), 'P67 future timestamp copy must expose an anomaly.');

  const automated = webNgramsSampleAge(
    {
      contractVersion: 'gdelt-web-ngrams-display-fallback-cache-v2',
      staleAfterHours: 12,
      automation: { selectedFileTimestamp: '20260731110000' }
    },
    Date.parse('2026-07-31T12:00:00Z')
  );
  assert(automated.state === 'within_window', 'Automated Web NGrams source file must be within its 12h window.');
  assert(automated.text.includes('自动源文件截至 2026-07-31'), 'Automated Web NGrams copy must expose source-file freshness.');
}

function assertCorePathsRemainUnwired() {
  for (const path of [
    'scripts/oil-directional/build-oil-directional-pressure.mjs',
    'data/oil-directional-pressure.json',
    'data/radar-data.json'
  ]) {
    assert(!readText(path).includes('gdeltWebNgramsFallback'), `${path} must not consume the P63 cache.`);
  }
  const workflow = readText('.github/workflows/refresh-oil-news-event-watch.yml');
  for (const marker of [
    'npm run build:oil-news-event-watch',
    'Upload sanitized Web NGrams article shadow observation',
    'gdelt-web-ngrams-article-shadow-latest.json',
    'retention-days: 35'
  ]) {
    assert(workflow.includes(marker), `Oil News workflow missing integrated Web NGrams marker: ${marker}`);
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
  for (const marker of [
    'gdelt-web-ngrams-frontend-sample-age-p67',
    'frontendSampleAgeApproved=true',
    'latestSelectedTimestamp',
    'staleAfterHours',
    'historical review sample'
  ]) {
    assert(doc.includes(marker), `${DOC} missing P67 marker: ${marker}`);
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
assertAgeApprovalFixture();
assertProductionCache();
assertFrontendProjection();
assertCorePathsRemainUnwired();
assertDocsAndPackage();
console.log('GDELT Web NGrams frontend aggregate health: PASS');
