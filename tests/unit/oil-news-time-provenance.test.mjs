import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseAbsoluteNewsTime, normalizeAbsoluteNewsTime, parseNewsDatasetTimestamp } from '../../scripts/oil-directional/oil-news-time.mjs';
import { buildWebNgramsArticleCandidates, sanitizeWebNgramsArticleCandidates } from '../../scripts/oil-directional/gdelt-web-ngrams-article-candidates.mjs';
import { buildWebNgramsMultilingualShadow } from '../../scripts/oil-directional/gdelt-web-ngrams-shadow-classifier.mjs';
import { buildWebNgramsCrossSourceTelemetry } from '../../scripts/oil-directional/gdelt-web-ngrams-cross-source-telemetry.mjs';
import { buildGdeltWebNgramsArticleShadow } from '../../scripts/oil-directional/build-gdelt-web-ngrams-article-shadow.mjs';
import { assertWebNgramsArticleShadowCache } from '../../scripts/oil-directional/gdelt-web-ngrams-article-shadow-cache.mjs';
import { evaluateWebNgramsShadowHistory } from '../../scripts/oil-directional/review-gdelt-web-ngrams-article-shadow-history.mjs';

const timestamp = '20260908090000';
const tocDate = '2026-09-08T08:00:00Z';
const ngramsText = '1\tHormuz tanker attack\t1';
const row = date => ({ ID: 1, date, lang: 'en', title: 'Attack on tanker in Hormuz',
  url: 'https://web.example/story', publishedAt: '2026-09-08T08:30:00Z' });
const references = [
  { source: 'tavily', title: 'Tanker struck near Hormuz', domain: 'a.example', url: 'https://a.example/a', publishedAt: tocDate },
  { source: 'brave', title: 'Hormuz attack disrupts shipping', domain: 'b.example', url: 'https://b.example/b', publishedAt: tocDate }
].map(article => ({ ...article, buckets: ['chokepoint', 'tanker_shipping'] }));
function candidates(date = tocDate, batch = timestamp) {
  return buildWebNgramsArticleCandidates({ timestamp: batch, ngramsText, tocText: JSON.stringify(row(date)) });
}
function telemetry(date = tocDate) {
  return buildWebNgramsCrossSourceTelemetry({ webShadow: buildWebNgramsMultilingualShadow(candidates(date)), referenceArticles: references });
}
async function build(date = tocDate) {
  let calls = 0;
  const result = await buildGdeltWebNgramsArticleShadow({ allowNetwork: true, referenceArticles: references,
    nowMs: Date.parse('2026-09-08T09:10:00Z'), fetchFirstAvailable: async () => {
      calls += 1;
      return { timestamp, ngramsText, tocText: JSON.stringify(row(date)), diagnostics: {},
        attempts: [], discovery: { found: true, timestamp, attempts: [] } };
    } });
  assert.equal(calls, 1);
  return result;
}

for (const date of [null, '', 0, '0', 'today', '2 hours ago', '2026-09-08',
  '2026-09-08T08:00:00', '2026-02-30T08:00:00Z', '2026-02-29T08:00:00Z',
  '2026-04-31T08:00:00Z', '2026-13-01T08:00:00Z', '2026-00-01T08:00:00Z',
  '2026-09-00T08:00:00Z', '2026-09-08T24:00:00Z', '2026-09-08T08:60:00Z',
  '2026-09-08T08:00:60Z', '2026-09-08T08:00:00+24:00', '2026-09-08T08:00:00+01:60',
  '2026-09-08T08:00:00Z PRIVATE_TOKEN']) {
  test(`strict TOC date rejects without normalization or leakage: ${String(date)}`, () => {
    assert.equal(parseAbsoluteNewsTime(date), null);
    const result = candidates(date);
    assert.equal(result.aggregate.invalidTocRowCount, 1);
    assert.equal(result.aggregate.missingTocCount, 1);
    assert.equal(result.articles.length, 0);
    assert.equal(JSON.stringify(sanitizeWebNgramsArticleCandidates(result)).includes('PRIVATE_TOKEN'), false);
  });
}

test('absolute offsets and real leap dates normalize without using the clock', () => {
  assert.equal(normalizeAbsoluteNewsTime('2024-02-29T20:00:00+12:00'), '2024-02-29T08:00:00.000Z');
  assert.equal(normalizeAbsoluteNewsTime('2026-09-08T00:00:00-08:00'), '2026-09-08T08:00:00.000Z');
  assert.equal(normalizeAbsoluteNewsTime('2026-09-08T08:00:00.123Z'), '2026-09-08T08:00:00.123Z');
});

test('dataset filename requires a real UTC calendar, not merely fourteen digits', () => {
  for (const value of ['20260230090000', '20261308090000', '20260908240000', '20260908096000', '20260908090060', null]) {
    assert.equal(parseNewsDatasetTimestamp(value), null);
    assert.throws(() => candidates(tocDate, value), /real UTC/u);
  }
});

test('TOC date, dataset time and publication time remain distinct across sanitizing and classification', () => {
  const c = candidates();
  for (const article of [c.articles[0], sanitizeWebNgramsArticleCandidates(c).articles[0],
    buildWebNgramsMultilingualShadow(c).articles[0], telemetry().articles[0]]) {
    assert.equal(article.datasetObservedAt, '2026-09-08T09:00:00.000Z');
    assert.equal(article.tocTimestamp, '2026-09-08T08:00:00.000Z');
    assert.equal(article.publishedAt, null);
    assert.equal(article.publicationTimeBasis, 'original_publication_time_unknown');
  }
});

test('same-event metadata links survive but cannot enter original-publication support', async () => {
  const { observation, productionCache } = await build();
  const t = observation.crossSourceTelemetry;
  assert.equal(t.metadataCandidateSupport.aggregate.crossProviderSupportCandidateCount, 1);
  assert.equal(t.metadataCandidateSupport.articles[0].supportLinks.length, 2);
  assert.equal(t.metadataCandidateSupport.publicationFreshnessQualified, false);
  assert.equal(t.metadataCandidateSupport.usedForQualityGates, false);
  assert.equal(t.aggregate.independentSupportRate, 0);
  assert.equal(t.aggregate.crossProviderSupportRate, 0);
  assert.deepEqual(t.articles[0].supportLinks, []);
  assert.equal(t.aggregate.diagnostics.web.missingDateCount, 1);
  assert.equal(observation.generatedAt, '2026-09-08T09:10:00.000Z');
  assertWebNgramsArticleShadowCache(productionCache);
  const publicJson = JSON.stringify(productionCache);
  for (const field of ['metadataCandidateSupport', 'supportLinks', 'references', 'datasetObservedAt', 'tocTimestamp', 'publishedAt', 'web.example']) {
    assert.equal(publicJson.includes(field), false, field);
  }
  for (const field of ['metadataCandidateSupport', 'supportLinks', 'references', 'datasetObservedAt', 'tocTimestamp', 'publishedAt']) {
    assert.throws(() => assertWebNgramsArticleShadowCache({ ...productionCache, [field]: null }), /forbidden field/u);
  }
  const forged = structuredClone(productionCache);
  forged.crossSourceAggregate = t.metadataCandidateSupport.aggregate;
  assert.throws(() => assertWebNgramsArticleShadowCache(forged), /unverified original publication/u);
});

test('legacy/caller publication values never substitute for missing TOC time or confer qualification', () => {
  const shadow = buildWebNgramsMultilingualShadow(candidates());
  shadow.articles[0].publishedAt = tocDate;
  shadow.articles[0].publicationTimeBasis = 'verified';
  shadow.articles[0].tocTimestamp = null;
  const t = buildWebNgramsCrossSourceTelemetry({ webShadow: shadow, referenceArticles: references });
  assert.equal(t.articles[0].publishedAt, null);
  assert.equal(t.aggregate.independentSupportRate, 0);
  assert.equal(t.metadataCandidateSupport.aggregate.independentSupportRate, 0);
  assert.equal(t.metadataCandidateSupport.aggregate.diagnostics.web.missingDateCount, 1);
});

test('future or stale TOC metadata cannot borrow the newer dataset timestamp', () => {
  for (const date of ['2026-09-08T09:00:01Z', '2026-09-06T00:00:00Z']) {
    const t = telemetry(date);
    assert.equal(t.aggregate.webCandidateCount, 1);
    assert.equal(t.aggregate.independentSupportRate, 0);
    assert.equal(t.metadataCandidateSupport.aggregate.independentSupportRate, 0);
  }
  assert.equal(telemetry('2026-09-08T09:00:01Z').metadataCandidateSupport.aggregate.diagnostics.web.futureDateCount, 1);
});

test('invalid direct metadata is classified but never echoed into either audit path', () => {
  const shadow = buildWebNgramsMultilingualShadow(candidates());
  shadow.articles[0].tocTimestamp = 'PRIVATE_TOKEN invalid';
  const t = buildWebNgramsCrossSourceTelemetry({ webShadow: shadow, referenceArticles: references });
  assert.equal(t.metadataCandidateSupport.aggregate.diagnostics.web.invalidDateCount, 1);
  assert.equal(t.metadataCandidateSupport.articles[0].tocTimestamp, null);
  assert.equal(JSON.stringify(t).includes('PRIVATE_TOKEN'), false);
  const dirty = candidates();
  dirty.articles[0].tocTimestamp = 'PRIVATE_TOKEN';
  dirty.articles[0].datasetObservedAt = 'PRIVATE_TOKEN';
  assert.equal(JSON.stringify(sanitizeWebNgramsArticleCandidates(dirty)).includes('PRIVATE_TOKEN'), false);
});

test('strict v2/v3/v4 history survives while even mature v5 metadata cannot pass quality gates', async () => {
  const { observation, productionCache } = await build();
  const policy = JSON.parse(readFileSync('config/oil-news-discovery-policy.json', 'utf8'));
  const legacy = ['v2', 'v3', 'v4'].map((version, i) => {
    const cache = structuredClone(productionCache);
    cache.generatedAt = `2026-09-08T09:2${i}:00Z`;
    cache.crossSourceTelemetryContractVersion = `gdelt-web-ngrams-cross-source-telemetry-shadow-${version}`;
    cache.crossSourceAggregate = observation.crossSourceTelemetry.metadataCandidateSupport.aggregate;
    assertWebNgramsArticleShadowCache(cache);
    const corrupt = structuredClone(cache);
    delete corrupt.crossSourceAggregate.diagnostics;
    assert.throws(() => assertWebNgramsArticleShadowCache(corrupt));
    return { cache };
  });
  const current = Array.from({ length: 121 }, (_, i) => {
    const cache = structuredClone(productionCache);
    cache.generatedAt = new Date(Date.parse('2026-09-08T10:00:00Z') + i * 21600000).toISOString();
    return { cache };
  });
  const review = evaluateWebNgramsShadowHistory([...legacy, ...current], policy);
  assert.equal(review.metrics.invalidSampleCount, 0);
  assert.equal(review.legacySampleCount, 3);
  assert.equal(review.qualityMetrics.usableSampleCount, 121);
  assert.equal(review.qualityMetrics.observationDays, 30);
  assert.equal(review.qualityMetrics.medianIndependentSupportRate, 0);
  assert.equal(review.qualityGatePassed, false);
  assert.equal(review.promotionEligible, false);
  assert.equal(review.automaticCutoverApproved, false);
});
