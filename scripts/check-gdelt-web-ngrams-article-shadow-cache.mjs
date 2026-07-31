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

console.log('PASS check-gdelt-web-ngrams-article-shadow-cache');
