#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  buildWebNgramsArticleCandidates
} from './oil-directional/gdelt-web-ngrams-article-candidates.mjs';
import {
  buildWebNgramsMultilingualShadow,
  WEB_NGRAMS_SHADOW_CLASSIFICATION_CONTRACT
} from './oil-directional/gdelt-web-ngrams-shadow-classifier.mjs';
import {
  WEB_NGRAMS_QUERY_SET_VERSION
} from './oil-directional/oil-news-query-taxonomy.mjs';

const rows = [
  {
    id: 1,
    lang: 'en',
    title: 'Oil tanker shutdown near the strait',
    quadgram: 'Hormuz tanker shutdown reported'
  },
  {
    id: 2,
    lang: 'zh',
    title: '原油运输恢复，港口重开',
    quadgram: '霍尔木兹 油轮 恢复 重开'
  },
  {
    id: 3,
    lang: 'ar',
    title: 'استئناف ناقلات النفط بعد إغلاق الميناء',
    quadgram: 'ناقلات النفط استئناف إغلاق'
  },
  {
    id: 4,
    lang: 'ru',
    title: 'Пожар на НПЗ привел к остановке',
    quadgram: 'пожар на НПЗ остановка'
  },
  {
    id: 5,
    lang: 'es',
    title: 'Reapertura tras el cierre de la refinería',
    quadgram: 'petróleo crudo reapertura cierre'
  },
  {
    id: 6,
    lang: 'en',
    title: 'Tanker market context and crude prices',
    quadgram: 'tanker crude oil market context'
  }
];

const ngramsText = rows.map((row) => `${row.id}\t${row.quadgram}\t1`).join('\n');
const tocText = rows.map((row) => JSON.stringify({
  ID: row.id,
  date: `2026-07-31T0${row.id}:00:00.000Z`,
  lang: row.lang,
  title: row.title,
  url: `https://source-${row.id}.example/story`
})).join('\n');

const candidates = buildWebNgramsArticleCandidates({
  timestamp: '20260731070000',
  ngramsText,
  tocText
});
const shadow = buildWebNgramsMultilingualShadow(candidates);

assert.equal(shadow.contractVersion, WEB_NGRAMS_SHADOW_CLASSIFICATION_CONTRACT);
assert.equal(shadow.querySetVersion, WEB_NGRAMS_QUERY_SET_VERSION);
assert.equal(shadow.status, 'classified_shadow_ready');
assert.equal(shadow.aggregate.candidateCount, 6);
assert.equal(shadow.aggregate.supportedLanguageCandidateCount, 6);
assert.equal(shadow.aggregate.supportedLanguageCoverageRate, 1);
assert.equal(shadow.aggregate.polarityCounts.risk_escalation, 2);
assert.equal(shadow.aggregate.polarityCounts.risk_deescalation, 1);
assert.equal(shadow.aggregate.polarityCounts.mixed_or_contested, 2);
assert.equal(shadow.aggregate.polarityCounts.market_reaction_only, 1);
assert.equal(shadow.aggregate.directionalArticleCount, 5);
assert.deepEqual(shadow.aggregate.languageCounts, {
  ar: 1,
  en: 2,
  es: 1,
  ru: 1,
  zh: 1
});

const contextOnly = shadow.articles.find((article) => article.language === 'en'
  && article.claimPolarity === 'market_reaction_only');
assert.ok(contextOnly);
assert.deepEqual(contextOnly.directionalRuleIds, []);

const serialized = JSON.stringify(shadow);
for (const forbidden of [
  '"title":',
  '"url":',
  'Oil tanker shutdown',
  '原油运输恢复',
  'https://source-'
]) {
  assert.equal(serialized.includes(forbidden), false, `shadow output leaked ${forbidden}`);
}
assert.equal(shadow.rawContentStored, false);
assert.equal(shadow.currentSignalEnhancement, false);
assert.equal(shadow.eventConfirmationSource, false);
assert.equal(shadow.eligibleForScoring, false);

console.log('PASS check-gdelt-web-ngrams-shadow-classifier');
