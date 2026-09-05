#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  buildGdeltWebNgramsArticleShadow,
  WEB_NGRAMS_ARTICLE_SHADOW_OBSERVATION_CONTRACT
} from './oil-directional/build-gdelt-web-ngrams-article-shadow.mjs';
import {
  assertWebNgramsArticleShadowCache,
  WEB_NGRAMS_ARTICLE_SHADOW_CACHE_CONTRACT
} from './oil-directional/gdelt-web-ngrams-article-shadow-cache.mjs';
import { WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT } from './oil-directional/gdelt-web-ngrams-cross-source-telemetry.mjs';

const nowMs = Date.parse('2026-07-31T07:20:00.000Z');
const fetchedPair = {
  timestamp: '20260731070000',
  ngramsText: [
    '1\tHormuz tanker shutdown after attack\t2',
    '2\tcrude oil prices market context\t1'
  ].join('\n'),
  tocText: [
    JSON.stringify({
      ID: 1,
      date: '2026-07-31T06:45:00.000Z',
      lang: 'en',
      title: 'Hormuz tanker shutdown after attack',
      url: 'https://reuters.com/world/hormuz-shadow'
    }),
    JSON.stringify({
      ID: 2,
      date: '2026-07-31T06:50:00.000Z',
      lang: 'en',
      title: 'Crude oil prices market context',
      url: 'https://marketwatch.com/story/oil-shadow'
    })
  ].join('\n'),
  diagnostics: {
    contractVersion: 'gdelt-web-ngrams-article-pair-v1',
    timestamp: '20260731070000',
    status: 'ok',
    ngrams: { diagnostics: { status: 200, attempts: 1 } },
    toc: { diagnostics: { status: 200, attempts: 1 } }
  },
  attempts: [],
  discovery: {
    found: true,
    timestamp: '20260731070000',
    contentLength: 100,
    tocContentLength: 200,
    lastModified: null,
    tocLastModified: null,
    attempts: []
  }
};
const referenceArticles = [
  {
    source: 'tavily',
    title: 'Tanker traffic halted after Hormuz attack',
    url: 'https://apnews.com/article/hormuz-shadow',
    domain: 'apnews.com',
    publishedAt: '2026-07-31T06:55:00.000Z',
    buckets: ['chokepoint', 'tanker_shipping']
  },
  {
    source: 'brave',
    title: 'Attack disrupts tanker traffic in Strait of Hormuz',
    url: 'https://bbc.com/news/hormuz-shadow',
    domain: 'bbc.com',
    publishedAt: '2026-07-31T07:00:00.000Z',
    buckets: ['chokepoint', 'tanker_shipping']
  }
];

const live = await buildGdeltWebNgramsArticleShadow({
  allowNetwork: true,
  referenceArticles,
  nowMs,
  fetchFirstAvailable: async () => fetchedPair
});
assert.equal(
  live.observation.contractVersion,
  WEB_NGRAMS_ARTICLE_SHADOW_OBSERVATION_CONTRACT
);
assert.equal(live.productionCache.contractVersion, WEB_NGRAMS_ARTICLE_SHADOW_CACHE_CONTRACT);
assert.equal(live.productionCache.status, 'shadow_observation_ready');
assert.equal(live.productionCache.sourceFile.selectedTimestamp, '20260731070000');
assert.equal(live.productionCache.candidateAggregate.candidateCount, 2);
assert.equal(live.productionCache.classificationAggregate.directionalArticleCount, 1);
assert.equal(live.productionCache.crossSourceAggregate.crossProviderSupportCandidateCount, 1);
assertWebNgramsArticleShadowCache(live.productionCache);
assert.equal(live.productionCache.crossSourceTelemetryContractVersion, WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT);
assert.equal(live.productionCache.crossSourceAggregate.diagnostics.reference.validDateCount, 2);

const serializedCache = JSON.stringify(live.productionCache);
for (const forbidden of [
  '"title":',
  '"url":',
  '"articles":',
  '"canonicalUrlHash":',
  '"storyClusterHash":',
  'Hormuz tanker shutdown',
  'https://reuters.com'
]) {
  assert.equal(serializedCache.includes(forbidden), false, `production cache leaked ${forbidden}`);
}

const observationSerialized = JSON.stringify(live.observation);
for (const forbidden of ['"title":', '"url":', 'Hormuz tanker shutdown', 'https://reuters.com']) {
  assert.equal(observationSerialized.includes(forbidden), false, `shadow observation leaked ${forbidden}`);
}
assert.equal(live.observation.productionImpact.affectsScoring, false);
assert.equal(live.observation.eventConfirmationSource, false);
assert.throws(
  () => assertWebNgramsArticleShadowCache({
    ...live.productionCache,
    sourceFile: {
      ...live.productionCache.sourceFile,
      selectedTimestamp: '20260801090000'
    }
  }),
  /future/u
);
assert.throws(
  () => assertWebNgramsArticleShadowCache({
    ...live.productionCache,
    crossSourceAggregate: {
      ...live.productionCache.crossSourceAggregate,
      referenceArticleCount: 0
    }
  }),
  /aggregates are incomplete/u
);

let dryRunFetchCalled = false;
const dryRun = await buildGdeltWebNgramsArticleShadow({
  allowNetwork: false,
  referenceArticles,
  nowMs,
  fetchFirstAvailable: async () => {
    dryRunFetchCalled = true;
    return fetchedPair;
  }
});
assert.equal(dryRunFetchCalled, false);
assert.equal(dryRun.productionCache.status, 'dry_run');
assertWebNgramsArticleShadowCache(dryRun.productionCache);
assert.equal(dryRun.productionCache.crossSourceTelemetryContractVersion, WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT);

const malformed = await buildGdeltWebNgramsArticleShadow({
  allowNetwork: true,
  referenceArticles,
  nowMs,
  fetchFirstAvailable: async () => ({
    ...fetchedPair,
    tocText: '{malformed-json'
  })
});
assert.equal(malformed.productionCache.status, 'no_candidates');
assertWebNgramsArticleShadowCache(malformed.productionCache);

const legacy = structuredClone(live.productionCache);
delete legacy.crossSourceTelemetryContractVersion;
delete legacy.crossSourceAggregate.diagnostics;
assertWebNgramsArticleShadowCache(legacy);
assertWebNgramsArticleShadowCache({ ...legacy,
  crossSourceTelemetryContractVersion: 'gdelt-web-ngrams-cross-source-telemetry-shadow-v1' });
for (const mutate of [
  cache => { cache.crossSourceTelemetryContractVersion = 'unknown'; },
  cache => { delete cache.crossSourceAggregate.diagnostics; },
  cache => { cache.crossSourceAggregate.diagnostics.reference.validDateCount = 3; },
  cache => { cache.crossSourceAggregate.diagnostics.web.invalidDateCount = null; },
  cache => { cache.crossSourceAggregate.diagnostics.web.totalCount = Infinity; },
  cache => { cache.crossSourceAggregate.diagnostics.web.domain = 'private.example'; },
  cache => { cache.crossSourceAggregate.diagnostics.comparison.independentDomainSupportedWebCount = 2; },
  cache => { cache.crossSourceAggregate.independentSupportRate = 0.9; },
  cache => { cache.crossSourceAggregate.webCandidateCount = 20; },
  cache => { cache.crossSourceAggregate.providerIndependentSupportCounts.extra = 1; },
  cache => { cache.crossSourceAggregate = null; }
]) {
  const changed = structuredClone(live.productionCache);
  mutate(changed);
  assert.throws(() => assertWebNgramsArticleShadowCache(changed));
}

console.log('PASS check-gdelt-web-ngrams-article-shadow-cache');
