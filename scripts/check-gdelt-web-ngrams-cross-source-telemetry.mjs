#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  buildWebNgramsArticleCandidates
} from './oil-directional/gdelt-web-ngrams-article-candidates.mjs';
import {
  buildWebNgramsCrossSourceTelemetry,
  WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT
} from './oil-directional/gdelt-web-ngrams-cross-source-telemetry.mjs';
import {
  buildWebNgramsMultilingualShadow
} from './oil-directional/gdelt-web-ngrams-shadow-classifier.mjs';

const ngramsText = [
  '1\tHormuz tanker shutdown after attack\t2',
  '2\tcrude oil prices market context\t1'
].join('\n');
const tocText = [
  JSON.stringify({
    ID: 1,
    date: '2026-07-31T01:00:00.000Z',
    lang: 'en',
    title: 'Hormuz tanker shutdown after attack',
    url: 'https://www.reuters.com/world/hormuz-story?utm_source=feed'
  }),
  JSON.stringify({
    ID: 2,
    date: '2026-07-31T02:00:00.000Z',
    lang: 'en',
    title: 'Crude oil prices market context',
    url: 'https://marketwatch.com/story/oil-context'
  })
].join('\n');
const candidates = buildWebNgramsArticleCandidates({
  timestamp: '20260731030000',
  ngramsText,
  tocText
});
const webShadow = buildWebNgramsMultilingualShadow(candidates);
const referenceArticles = [
  {
    source: 'tavily',
    title: 'Hormuz tanker shutdown after attack',
    url: 'https://reuters.com/world/hormuz-story?ref=home',
    domain: 'reuters.com',
    publishedAt: '2026-07-31T01:10:00.000Z',
    buckets: ['chokepoint', 'tanker_shipping']
  },
  {
    source: 'tavily',
    title: 'Hormuz tanker traffic halted after attack',
    url: 'https://apnews.com/article/hormuz-independent',
    domain: 'apnews.com',
    publishedAt: '2026-07-31T03:00:00.000Z',
    buckets: ['chokepoint', 'tanker_shipping']
  },
  {
    source: 'brave',
    title: 'Attack disrupts tanker traffic in Strait of Hormuz',
    url: 'https://bbc.com/news/hormuz-independent',
    domain: 'bbc.com',
    publishedAt: '2026-07-31T04:00:00.000Z',
    buckets: ['chokepoint', 'tanker_shipping']
  },
  {
    source: 'brave',
    title: 'Crude oil prices market context',
    url: 'https://www.marketwatch.com/story/oil-context?gclid=test',
    domain: 'marketwatch.com',
    publishedAt: '2026-07-31T02:05:00.000Z',
    buckets: ['market_reaction']
  },
  {
    source: 'gdelt_doc',
    title: 'Excluded GDELT result',
    url: 'https://example.com/excluded',
    domain: 'example.com',
    publishedAt: '2026-07-31T02:00:00.000Z',
    buckets: ['chokepoint']
  }
];

const telemetry = buildWebNgramsCrossSourceTelemetry({
  webShadow,
  referenceArticles
});

assert.equal(telemetry.contractVersion, WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT);
assert.equal(telemetry.status, 'cross_source_shadow_ready');
assert.equal(telemetry.aggregate.webCandidateCount, 2);
assert.equal(telemetry.aggregate.referenceArticleCount, 4);
assert.equal(telemetry.aggregate.excludedReferenceArticleCount, 1);
assert.equal(telemetry.aggregate.exactDiscoveryMatchCount, 2);
assert.equal(telemetry.aggregate.exactDiscoveryMatchRate, 1);
assert.equal(telemetry.aggregate.independentSupportCandidateCount, 1);
assert.equal(telemetry.aggregate.independentSupportRate, 0.5);
assert.equal(telemetry.aggregate.crossProviderSupportCandidateCount, 1);
assert.equal(telemetry.aggregate.crossProviderSupportRate, 0.5);
assert.deepEqual(telemetry.aggregate.providerDiscoveryCounts, {
  tavily: 1,
  brave: 1
});
assert.deepEqual(telemetry.aggregate.providerIndependentSupportCounts, {
  tavily: 1,
  brave: 1
});

const directional = telemetry.articles.find((article) => (
  article.claimPolarity === 'risk_escalation'
));
assert.equal(directional.independentSupportDomainCount, 2);
assert.equal(directional.crossProviderSupported, true);
const context = telemetry.articles.find((article) => (
  article.claimPolarity === 'market_reaction_only'
));
assert.equal(context.independentSourceSupported, false);

const serialized = JSON.stringify(telemetry);
for (const forbidden of [
  '"title":',
  '"url":',
  'Hormuz tanker shutdown',
  'https://reuters.com'
]) {
  assert.equal(serialized.includes(forbidden), false, `telemetry leaked ${forbidden}`);
}
assert.equal(telemetry.discoveryOverlapIsEventConfirmation, false);
assert.equal(telemetry.independentSupportIsConfirmedEvent, false);
assert.equal(telemetry.currentSignalEnhancement, false);
assert.equal(telemetry.eventConfirmationSource, false);
assert.equal(telemetry.eligibleForScoring, false);
assert.throws(
  () => buildWebNgramsCrossSourceTelemetry({ webShadow, referenceArticles, maxWindowHours: 0 }),
  /integer from 1 to 168/u
);

console.log('PASS check-gdelt-web-ngrams-cross-source-telemetry');
