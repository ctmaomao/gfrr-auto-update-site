#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  buildWebNgramsArticleCandidates,
  sanitizeWebNgramsArticleCandidates,
  WEB_NGRAMS_ARTICLE_CANDIDATE_CONTRACT
} from './oil-directional/gdelt-web-ngrams-article-candidates.mjs';

const ngramsText = [
  '1\tOil supply disruption near terminal\t2',
  '1\tBrent crude market reaction today\t1',
  '2\tSTRAIT OF HORMUZ tanker risk\t3',
  '3\trefinery outage after maintenance\t1',
  '4\toil sanctions remain under review\t1',
  '5\tunrelated local sports coverage\t1',
  '6\tcrude oil zero count\t0',
  'bad-line'
].join('\n');

const tocText = [
  JSON.stringify({
    ID: 1,
    date: '2026-07-31T01:00:00.000Z',
    lang: 'en',
    title: 'Oil supply disruption test headline',
    url: 'https://www.example.com/story/?utm_source=test&a=1'
  }),
  JSON.stringify({
    ID: 2,
    date: '2026-07-31T01:01:00.000Z',
    lang: 'en',
    title: 'Hormuz tanker risk test headline',
    url: 'https://example.com/story?a=1'
  }),
  JSON.stringify({
    ID: 3,
    date: '2026-07-31T01:02:00.000Z',
    lang: 'en',
    title: 'Refinery outage test headline',
    url: 'https://energy.example.net/refinery'
  }),
  JSON.stringify({
    ID: 4,
    date: 'invalid',
    lang: 'en',
    title: 'Invalid timestamp',
    url: 'https://invalid.example/story'
  }),
  '{invalid-json'
].join('\n');

const candidates = buildWebNgramsArticleCandidates({
  timestamp: '20260731010000',
  ngramsText,
  tocText
});

assert.equal(candidates.contractVersion, WEB_NGRAMS_ARTICLE_CANDIDATE_CONTRACT);
assert.equal(candidates.status, 'shadow_candidates_ready');
assert.equal(candidates.aggregate.matchedDocCount, 4);
assert.equal(candidates.aggregate.validTocRowCount, 3);
assert.equal(candidates.aggregate.invalidNgramsLineCount, 2);
assert.equal(candidates.aggregate.joinedDocCount, 3);
assert.equal(candidates.aggregate.missingTocCount, 1);
assert.equal(candidates.aggregate.joinRate, 0.75);
assert.equal(candidates.aggregate.invalidTocRowCount, 2);
assert.equal(candidates.aggregate.duplicateUrlCount, 1);
assert.equal(candidates.articles.length, 2);
assert.equal(candidates.articles[0].domain, 'energy.example.net');
assert.equal(candidates.articles[1].domain, 'example.com');
assert.deepEqual(candidates.articles[1].matchedTermIds, [
  'crude_oil',
  'hormuz',
  'supply_disruption',
  'tanker'
]);

const sanitized = sanitizeWebNgramsArticleCandidates(candidates);
const serialized = JSON.stringify(sanitized);
assert.equal(sanitized.rawContentStored, false);
assert.equal(sanitized.currentSignalEnhancement, false);
assert.equal(sanitized.eligibleForScoring, false);
for (const forbidden of [
  '"title":',
  '"url":',
  'Oil supply disruption test headline',
  'https://example.com'
]) {
  assert.equal(serialized.includes(forbidden), false, `sanitized candidates leaked ${forbidden}`);
}
assert.match(sanitized.articles[0].canonicalUrlHash, /^[a-f0-9]{64}$/u);
assert.match(sanitized.articles[0].storyClusterHash, /^[a-f0-9]{64}$/u);

assert.throws(
  () => buildWebNgramsArticleCandidates({ timestamp: 'invalid', ngramsText, tocText }),
  /YYYYMMDDHHMMSS/u
);

console.log('PASS check-gdelt-web-ngrams-article-candidates');
