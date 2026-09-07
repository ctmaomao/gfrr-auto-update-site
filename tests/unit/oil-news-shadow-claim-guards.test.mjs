import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildGdeltWebNgramsArticleShadow } from '../../scripts/oil-directional/build-gdelt-web-ngrams-article-shadow.mjs';
import { classifyWebNgramsShadowArticle } from '../../scripts/oil-directional/gdelt-web-ngrams-shadow-classifier.mjs';
import { claimPolarity } from '../../scripts/oil-directional/oil-news-claim-classifier.mjs';
import { assertWebNgramsArticleShadowCache } from '../../scripts/oil-directional/gdelt-web-ngrams-article-shadow-cache.mjs';
import { evaluateWebNgramsShadowHistory } from '../../scripts/oil-directional/review-gdelt-web-ngrams-article-shadow-history.mjs';

const policy = JSON.parse(readFileSync('config/oil-news-discovery-policy.json', 'utf8'));
const directional = ['risk_escalation', 'risk_deescalation'];
function classify(title, language = 'en') {
  return classifyWebNgramsShadowArticle({ title, language,
    buckets: ['chokepoint', 'tanker_shipping', 'market_reaction'] });
}

// Real TOC titles audited on 2026-09-07, not assertions that the reported
// events occurred. Domains/hashes stay in the audit, never in production data.
const pond = 'A company drained a pond in Killingly. DEEP wants it restored';
const disputed = 'Iran claims a strike on a US ship in the Strait of Hormuz but the US denies it';
test('real unrelated pond restoration cannot borrow an oil bucket', () => {
  const row = classify(pond);
  assert.equal(row.claimPolarity, 'unclear_or_high_claim');
  assert.ok(row.classificationGuardIds.includes('title_topic_unbound'));
});
test('real claim and denial is contested, not a supported escalation', () => {
  assert.equal(classify(disputed).claimPolarity, 'mixed_or_contested');
});

for (const [language, title] of [
  ['en', 'Officials deny an attack on a tanker in Hormuz'],
  ['en', 'No evidence of a refinery fire'],
  ['en', 'The tanker was not attacked'],
  ['en', "The tanker wasn't attacked"],
  ['en', 'Hormuz has not reopened'],
  ['en', 'Officials reject reports of a Hormuz tanker attack'],
  ['en', 'Authorities dismiss reports of a refinery shutdown'],
  ['zh', '霍尔木兹海峡未发生袭击'],
  ['zh', '霍尔木兹海峡未关闭'],
  ['zh', '原油运输尚未恢复'],
  ['zh', '油轮没有遭到袭击'],
  ['ar', 'لم يحدث هجوم علي ناقلة نفط'],
  ['ru', 'Не было атака танкера'],
  ['es', 'No hubo ataque al petrolero']
]) test(`negation abstains: ${language}: ${title}`, () => {
  const row = classify(title, language);
  assert.equal(row.claimPolarity, 'unclear_or_high_claim');
  assert.ok(row.classificationGuardIds.includes('title_denied_or_negated'));
});

for (const [language, title] of [
  ['en', 'A tanker attack may occur next month'],
  ['en', 'Will Hormuz reopen?'],
  ['en', 'Officials threaten a refinery shutdown'],
  ['en', 'Refinery fire drill planned for Monday'],
  ['en', 'Refinery fire drill held today'],
  ['en', 'A tanker attack simulation concluded today'],
  ['en', 'Analysts warn of an attack on a tanker'],
  ['en', 'Officials claim a tanker was attacked'],
  ['zh', '霍尔木兹海峡可能关闭'],
  ['zh', '计划恢复原油运输'],
  ['zh', '霍尔木兹海峡封锁演习'],
  ['ar', 'قد يحدث هجوم علي ناقلة نفط'],
  ['ru', 'Может произойти атака танкера'],
  ['es', 'Podría ocurrir un ataque al petrolero']
]) test(`non-assertive abstains: ${language}: ${title}`, () => {
  const row = classify(title, language);
  assert.equal(row.claimPolarity, 'unclear_or_high_claim');
  assert.ok(row.classificationGuardIds.includes('title_non_assertive'));
});

for (const title of [
  'Oil prices rise; the city pool reopened',
  'Oil prices rise while a house fire closes a road',
  'Firefighters restored a water tanker',
  'A tanker truck fire blocked a road',
  'A nuclear facility faces shutdown',
  'An oil painting was restored after a fire',
  'US-Iraq News | Latest News',
  'Software pipeline shutdown after outage'
]) test(`unbound topic or claim cannot become directional: ${title}`, () => {
  assert.equal(directional.includes(classify(title).claimPolarity), false);
});

for (const title of [
  'Tanker attack near Hormuz', 'Tanker attacks near Hormuz',
  'Tanker attacked near Hormuz', 'Oil tankers struck near Hormuz',
  'Refinery fires disrupt crude oil production', 'Hormuz tanker traffic halted'
]) test(`affirmative inflection: ${title}`, () => {
  assert.equal(classify(title).claimPolarity, 'risk_escalation');
});
for (const title of ['Hormuz reopens', 'Refinery restarted', 'Oil supplies restored']) {
  test(`affirmative recovery: ${title}`, () => {
    assert.equal(classify(title).claimPolarity, 'risk_deescalation');
  });
}
for (const [language, title] of [['zh', '霍尔木兹海峡油轮遭袭击'],
  ['ar', 'هجوم ناقلة نفط'], ['ru', 'атака танкера'], ['es', 'ataque petrolero']]) {
  test(`multilingual affirmative remains recognized: ${language}`, () => {
    assert.equal(classify(title, language).claimPolarity, 'risk_escalation');
  });
}
test('whole-token matching, empty input, mixed and market controls remain conservative', () => {
  assert.equal(classify('Hormuz firefly outlook').claimPolarity, 'market_reaction_only');
  assert.equal(classify('Hormuz attack and truce').claimPolarity, 'mixed_or_contested');
  assert.equal(classify('Crude oil prices market context').claimPolarity, 'market_reaction_only');
  assert.equal(classify(null).claimPolarity, 'unclear_or_high_claim');
  assert.equal(classify('Tanker context').classificationGuardIds.length, 0);
});
test('production classifier behavior is not silently migrated', () => {
  assert.equal(claimPolarity({ title: pond }), 'risk_deescalation');
  assert.equal(classify(pond).claimPolarity, 'unclear_or_high_claim');
});

async function buildWithTitles(webTitle, refTitle = webTitle) {
  const timestamp = '20260906203100';
  const date = '2026-09-06T20:31:00Z';
  let fetchCalls = 0;
  const result = await buildGdeltWebNgramsArticleShadow({
    allowNetwork: true, nowMs: Date.parse('2026-09-06T20:45:00Z'),
    referenceArticles: ['tavily', 'brave'].map((source, i) => ({ source,
      title: refTitle, publishedAt: date, domain: `reference-${i}.example`,
      url: `https://reference-${i}.example/story`, buckets: ['chokepoint', 'tanker_shipping'] })),
    fetchFirstAvailable: async () => {
      fetchCalls += 1;
      return { timestamp, ngramsText: '1\tHormuz tanker context\t1',
        tocText: JSON.stringify({ ID: 1, date, lang: 'en', title: webTitle,
          url: 'https://origin.example/story' }), diagnostics: {}, attempts: [],
        discovery: { found: true, timestamp, attempts: [] } };
    }
  });
  assert.equal(fetchCalls, 1);
  assertWebNgramsArticleShadowCache(result.productionCache);
  return result;
}

test('real disputed/unrelated and synthetic hypothetical titles never gain independent support', async () => {
  for (const title of [pond, disputed, 'A tanker attack may occur next month']) {
    const { productionCache, observation } = await buildWithTitles(title);
    assert.equal(productionCache.crossSourceAggregate.independentSupportCandidateCount, 0);
    assert.equal(productionCache.crossSourceAggregate.crossProviderSupportCandidateCount, 0);
    assert.equal(productionCache.currentSignalEnhancement, false);
    assert.equal(productionCache.eventConfirmationSource, false);
    assert.equal(productionCache.eligibleForScoring, false);
    for (const output of [productionCache, observation]) {
      const serialized = JSON.stringify(output);
      for (const raw of [title, '"title":', '"url":', '"body":', '"snippet":', 'https://origin.example']) {
        assert.equal(serialized.includes(raw), false, raw);
      }
    }
  }
});
test('both sides of comparison use guards without changing the candidate denominator', async () => {
  const { productionCache } = await buildWithTitles('Hormuz tanker attacked', 'Officials deny a Hormuz tanker attack');
  assert.equal(productionCache.candidateAggregate.candidateCount, 1);
  assert.equal(productionCache.crossSourceAggregate.referenceArticleCount, 2);
  assert.equal(productionCache.crossSourceAggregate.independentSupportRate, 0);
  // ADR-0030: two indexes returning the same headline are discovery overlap,
  // not independent support. Distinct-publication positives live in the v4 suite.
  const duplicate = await buildWithTitles('Hormuz tanker attacked');
  assert.equal(duplicate.productionCache.crossSourceAggregate.crossProviderSupportCandidateCount, 0);
});
test('v2 remains strictly validated historical evidence; only v4 qualifies', async () => {
  const { productionCache } = await buildWithTitles('Hormuz tanker attacked');
  const currentVersion = productionCache.crossSourceTelemetryContractVersion;
  assert.equal(currentVersion, 'gdelt-web-ngrams-cross-source-telemetry-shadow-v4');
  const old = structuredClone(productionCache);
  old.crossSourceTelemetryContractVersion = 'gdelt-web-ngrams-cross-source-telemetry-shadow-v2';
  old.generatedAt = '2026-09-06T20:46:00Z';
  assertWebNgramsArticleShadowCache(old);
  const review = evaluateWebNgramsShadowHistory([{ cache: old }, { cache: productionCache }], policy);
  assert.equal(review.metrics.validSampleCount, 2);
  assert.equal(review.legacySampleCount, 1);
  assert.equal(review.qualityMetrics.usableSampleCount, 1);
  assert.equal(review.qualityMetrics.observationDays, 0);
  assert.equal(review.qualityGatePassed, false);
  assert.equal(review.automaticCutoverApproved, false);
  for (const version of [currentVersion, old.crossSourceTelemetryContractVersion]) {
    const corrupt = structuredClone(productionCache);
    corrupt.crossSourceTelemetryContractVersion = version;
    delete corrupt.crossSourceAggregate.diagnostics;
    assert.throws(() => assertWebNgramsArticleShadowCache(corrupt));
    corrupt.crossSourceAggregate = { ...old.crossSourceAggregate, independentSupportRate: 0.123 };
    assert.throws(() => assertWebNgramsArticleShadowCache(corrupt));
  }
});
