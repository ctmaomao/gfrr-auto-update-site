import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildArticleIdentity } from '../../scripts/oil-directional/oil-news-story-identity.mjs';
import { buildOilNewsEventSignature, sameEventCandidateReason } from '../../scripts/oil-directional/oil-news-event-signature.mjs';
import { classifyWebNgramsShadowArticle } from '../../scripts/oil-directional/gdelt-web-ngrams-shadow-classifier.mjs';
import { buildWebNgramsCrossSourceTelemetry } from '../../scripts/oil-directional/gdelt-web-ngrams-cross-source-telemetry.mjs';
import { buildGdeltWebNgramsArticleShadow } from '../../scripts/oil-directional/build-gdelt-web-ngrams-article-shadow.mjs';
import { assertWebNgramsArticleShadowCache } from '../../scripts/oil-directional/gdelt-web-ngrams-article-shadow-cache.mjs';
import { evaluateWebNgramsShadowHistory } from '../../scripts/oil-directional/review-gdelt-web-ngrams-article-shadow-history.mjs';

const timestamp = '20260907090000';
const date = '2026-09-07T08:00:00Z';
const webTitle = 'Attack on a tanker in Hormuz';
function row(title, domain = 'web.example', source = 'tavily', extra = {}) {
  return { title, domain, source, url: `https://${domain}/story`, publishedAt: date,
    language: 'en', buckets: ['chokepoint', 'tanker_shipping'], ...extra };
}
function web(input = row(webTitle)) {
  return classifyWebNgramsShadowArticle({ ...input, ...buildArticleIdentity(input) });
}
const refs = () => [row('Tanker struck near Hormuz', 'a.example', 'tavily'),
  row('Hormuz attack disrupts shipping', 'b.example', 'brave')];
function audit(webRows = [web()], referenceArticles = refs()) {
  return buildWebNgramsCrossSourceTelemetry({ webShadow: { timestamp, articles: webRows }, referenceArticles });
}

test('positive support links resolve uniquely to actual provider rows without raw titles or URLs', () => {
  const result = audit();
  assert.equal(result.aggregate.crossProviderSupportCandidateCount, 1);
  assert.equal(result.articles[0].supportLinks.length, 2);
  const table = new Map(result.references.map(r => [r.referenceId, r]));
  assert.equal(table.size, result.references.length);
  for (const link of result.articles[0].supportLinks) {
    const reference = table.get(link.referenceId);
    assert.ok(reference);
    assert.match(reference.canonicalUrlHash, /^[a-f0-9]{64}$/u);
    assert.equal(reference.eventSignature.locationId, 'hormuz');
    assert.equal(reference.eventSignature.mechanismId, 'attack');
    assert.equal(link.relation, 'same_event_candidate');
    assert.equal(link.metadataTimeDeltaHours, 0);
  }
  for (const secret of [webTitle, refs()[0].title, 'https://', '"title":', '"url":', '"body":']) {
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  assert.equal(result.timeEvidenceRule, 'metadata_window_not_verified_original_publication_time');
  assert.equal(result.independentSupportIsConfirmedEvent, false);
});

for (const [title, reason] of [
  ['Tanker attacked near Suez', 'event_location_mismatch'],
  ['Fire aboard tanker in Hormuz', 'event_mechanism_mismatch'],
  ['Refinery attacked at Hormuz', 'event_target_mismatch'],
  ['Attack on a tanker', 'event_signature_unresolved'],
  ['Tanker attack in Hormuz and Suez', 'event_signature_unresolved'],
  ['Tanker attack and fire in Hormuz', 'event_signature_unresolved']
]) test(`different or unresolved event refuses support: ${reason}: ${title}`, () => {
  const result = audit([web()], [row(title, 'a.example')]);
  assert.equal(result.aggregate.independentSupportCandidateCount, 0);
  assert.equal(result.articles[0].supportLinks.length, 0);
  // Target changes can also fail the earlier axis guard; no new rule bypasses it.
  assert.equal(result.articles[0].rejectionCounts[reason]
    + result.articles[0].rejectionCounts.direction_or_axis_mismatch, 1);
});
test('original synthetic Hormuz attack / Suez maintenance exercise counterexample stays closed', () => {
  const result = audit([web()], refs().map(r => ({ ...r, title: 'Suez Canal closed for a maintenance exercise' })));
  assert.equal(result.aggregate.crossProviderSupportCandidateCount, 0);
});
test('title clauses cannot lend location and target to a different event clause', () => {
  assert.equal(buildOilNewsEventSignature('Tanker near Hormuz; attack in a city').state, 'event_clause_unbound');
});
for (const title of ['霍尔木兹海峡油轮遭袭击', 'هجوم ناقلة نفط هرمز',
  'атака танкера Ормуз', 'ataque petrolero Ormuz']) {
  test(`same-location multilingual signature: ${title}`, () => {
    assert.equal(sameEventCandidateReason(buildOilNewsEventSignature(webTitle), buildOilNewsEventSignature(title)), 'same_event_candidate');
  });
}
test('named vessel conflicts or a missing counterpart abstain; names are hashed', () => {
  const left = buildOilNewsEventSignature('Attack on tanker "Ocean Dawn" in Hormuz');
  const right = buildOilNewsEventSignature('Tanker "Ocean Dusk" struck in Hormuz');
  assert.equal(sameEventCandidateReason(left, right), 'named_asset_unresolved_or_mismatch');
  assert.equal(sameEventCandidateReason(left, buildOilNewsEventSignature(webTitle)), 'named_asset_unresolved_or_mismatch');
  assert.equal(sameEventCandidateReason(left, buildOilNewsEventSignature('Tanker "Ocean Dawn" struck at Hormuz')), 'same_event_candidate');
  assert.equal(JSON.stringify(left).includes('ocean'), false);
});
test('multiple explicit vessel identities remain ambiguous', () => {
  assert.equal(buildOilNewsEventSignature('Attack on tanker "Alpha" and tanker "Beta" in Hormuz').state, 'named_asset_ambiguous');
});
test('identical Web/reference story is overlap, not independent support', () => {
  const result = audit([web()], [row(webTitle, 'a.example'), row(webTitle, 'b.example', 'brave')]);
  assert.equal(result.aggregate.exactDiscoveryMatchCount, 1);
  assert.equal(result.aggregate.independentSupportCandidateCount, 0);
  assert.equal(result.articles[0].rejectionCounts.same_article_or_story, 2);
});
test('same URL with a changed title is not a second publication', () => {
  const result = audit([web()], [row('Tanker struck near Hormuz', 'a.example', 'tavily', { url: 'https://web.example/story?utm_source=feed' })]);
  assert.equal(result.aggregate.independentSupportCandidateCount, 0);
});
test('syndicated reference title under two domains counts once, without cross-provider support', () => {
  const result = audit([web()], refs().map(r => ({ ...r, title: 'Tanker struck near Hormuz' })));
  assert.equal(result.articles[0].independentSupportDomainCount, 1);
  assert.equal(result.articles[0].supportLinks.length, 1);
  assert.equal(result.articles[0].rejectionCounts.duplicate_reference_story, 1);
  assert.equal(result.aggregate.crossProviderSupportCandidateCount, 0);
});
test('two providers returning one publication cannot create two domains', () => {
  const common = row('Tanker struck near Hormuz', 'a.example');
  const result = audit([web()], [common, { ...common, source: 'brave' }]);
  assert.deepEqual(result.articles[0].independentSupportProviders, ['brave', 'tavily']);
  assert.equal(result.articles[0].independentSupportDomainCount, 1);
  assert.equal(result.aggregate.crossProviderSupportCandidateCount, 0);
});
test('duplicate reference input has one link per stable ID and order-independent output', () => {
  const referenceRows = [...refs(), refs()[0]];
  const first = audit([web()], referenceRows);
  assert.equal(first.references.length, 2);
  assert.equal(first.articles[0].supportLinks.length, 2);
  assert.deepEqual(audit([web()], [...referenceRows].reverse()), first);
});
test('Web syndication cannot multiply supported candidates; denominator remains all candidates', () => {
  const webRows = [web(), web(row(webTitle, 'syndicated.example'))];
  const result = audit(webRows);
  assert.equal(result.aggregate.webCandidateCount, 2);
  assert.equal(result.aggregate.independentSupportCandidateCount, 1);
  assert.equal(result.aggregate.independentSupportRate, 0.5);
  assert.equal(result.articles.reduce((n, r) => n + r.rejectionCounts.duplicate_web_story, 0), 2);
  assert.equal(audit([...webRows].reverse()).aggregate.independentSupportCandidateCount, 1);
});
test('parent/child host support cannot satisfy cross-provider independence', () => {
  const result = audit([web()], [row('Tanker struck near Hormuz', 'a.example'),
    row('Hormuz attack disrupts shipping', 'news.a.example', 'brave')]);
  assert.equal(result.articles[0].independentSupportDomainCount, 1);
  assert.equal(result.aggregate.crossProviderSupportCandidateCount, 0);
});
for (const badDate of [null, 'yesterday PRIVATE_TOKEN', '2026-02-30T08:00:00Z', '2026-09-07T10:00:00Z']) {
  test(`invalid/future reference metadata cannot support: ${badDate}`, () => {
    const result = audit([web()], [row('Tanker struck near Hormuz', 'a.example', 'tavily', { publishedAt: badDate })]);
    assert.equal(result.aggregate.independentSupportCandidateCount, 0);
    assert.equal(result.articles[0].rejectionCounts.outside_metadata_window, 1);
    assert.equal(JSON.stringify(result).includes('PRIVATE_TOKEN'), false);
  });
}
test('input bounds fail closed before a large support graph can be produced', () => {
  assert.throws(() => audit([web()], Array.from({ length: 257 }, () => refs()[0])), /input limit/u);
  assert.throws(() => audit(Array.from({ length: 2001 }, () => web()), []), /input limit/u);
});
test('stubbed build persists support provenance only in ignored observation, not production cache', async () => {
  let fetchCount = 0;
  const result = await buildGdeltWebNgramsArticleShadow({ allowNetwork: true,
    nowMs: Date.parse('2026-09-07T09:10:00Z'), referenceArticles: refs(),
    fetchFirstAvailable: async () => {
      fetchCount += 1;
      return { timestamp, ngramsText: '1\tHormuz tanker attack\t1',
        tocText: JSON.stringify({ ID: 1, date, lang: 'en', title: webTitle, url: 'https://web.example/story' }),
        diagnostics: {}, attempts: [], discovery: { found: true, timestamp, attempts: [] } };
    } });
  assert.equal(fetchCount, 1);
  assert.equal(result.observation.crossSourceTelemetry.articles[0].supportLinks.length, 2);
  assert.equal(result.observation.crossSourceTelemetry.references.length, 2);
  assertWebNgramsArticleShadowCache(result.productionCache);
  const publicJson = JSON.stringify(result.productionCache);
  for (const key of ['supportLinks', 'references', 'referenceId', 'eventSignature', 'namedAssetHashes', 'web.example']) {
    assert.equal(publicJson.includes(key), false);
  }
  assert.equal(result.productionCache.currentSignalEnhancement, false);
  assert.equal(result.productionCache.eligibleForScoring, false);
  const legacy = ['v2', 'v3'].map((version, i) => {
    const cache = structuredClone(result.productionCache);
    cache.generatedAt = `2026-09-07T09:1${i + 1}:00Z`;
    cache.crossSourceTelemetryContractVersion = `gdelt-web-ngrams-cross-source-telemetry-shadow-${version}`;
    assertWebNgramsArticleShadowCache(cache);
    const invalid = structuredClone(cache);
    delete invalid.crossSourceAggregate.diagnostics;
    assert.throws(() => assertWebNgramsArticleShadowCache(invalid));
    return { cache };
  });
  const policy = JSON.parse(readFileSync('config/oil-news-discovery-policy.json', 'utf8'));
  const review = evaluateWebNgramsShadowHistory([...legacy, { cache: result.productionCache }], policy);
  assert.equal(review.metrics.validSampleCount, 3);
  assert.equal(review.legacySampleCount, 2);
  assert.equal(review.qualityMetrics.usableSampleCount, 1);
  assert.equal(review.qualityGatePassed, false);
  assert.equal(review.automaticCutoverApproved, false);
});
