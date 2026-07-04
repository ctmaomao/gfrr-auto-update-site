#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/GDELT_WEB_NGRAMS_FALLBACK_SOURCE_REVIEW.md';
const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-fallback-source-review-p45.json';

const RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/oil-directional/build-oil-news-event-watch.mjs',
  'scripts/oil-directional/build-oil-directional-pressure.mjs',
  'scripts/modules/renderOilDirectional.js',
  '.github/workflows/refresh-oil-news-event-watch.yml',
  'data/oil-news-event-watch.json',
  'data/oil-directional-pressure.json',
  'data/radar-data.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'gdelt-web-ngrams-fallback-source-review-p45',
  'gdelt_web_ngrams_fallback_source_review',
  'oil_news_gdelt_web_ngrams_background_fallback_display_only'
];

function absolute(relativePath) {
  return join(ROOT, relativePath);
}

function readText(relativePath) {
  return readFileSync(absolute(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDoc() {
  assert(existsSync(absolute(DOC)), `${DOC} is missing.`);
  const doc = readText(DOC);
  for (const marker of [
    'GDELT Web NGrams Fallback Source Review',
    'gdelt-web-ngrams-fallback-source-review-p45',
    'source_review_manual_fallback_candidate_no_production_display',
    'oil_news_gdelt_web_ngrams_background_fallback_display_only',
    'P44 sample archive reports `stable_manual_review_ready`',
    'At least 8 usable Web NGrams diagnosis samples',
    'Samples span at least 24 hours',
    'does not approve production display fallback',
    'currentSignalEnhancementApproved = false',
    'scoreApproved = false',
    'The next allowed step is P46 contract design'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
  for (const forbidden of [
    'productionDisplayFallbackApproved = true',
    'currentSignalEnhancementApproved = true',
    'scoreApproved = true',
    'confirmed Hormuz',
    'oil direction approved'
  ]) {
    assert(!doc.includes(forbidden), `${DOC} contains forbidden approval claim: ${forbidden}`);
  }
}

function assertFixture() {
  assert(existsSync(absolute(FIXTURE)), `${FIXTURE} is missing.`);
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'gdelt-web-ngrams-fallback-source-review-p45', 'Unexpected contractVersion.');
  assert(fixture.kind === 'gdelt_web_ngrams_fallback_source_review', 'Unexpected kind.');
  assert(fixture.status === 'source_review_manual_fallback_candidate_no_production_display', 'Unexpected status.');
  assert(fixture.source?.sourceKey === 'gdelt_web_ngrams_v5_legacy', 'Unexpected sourceKey.');
  assert(fixture.source?.primaryUse === 'background_narrative_heat_fallback', 'Unexpected primaryUse.');
  assert(fixture.candidateFutureRole?.roleKey === 'oil_news_gdelt_web_ngrams_background_fallback_display_only', 'Unexpected future role.');
  assert(fixture.candidateFutureRole?.fallbackCandidate === true, 'fallbackCandidate must be true.');
  for (const field of [
    'productionDisplayFallbackApproved',
    'currentSignalEnhancementApproved',
    'workflowApproved',
    'frontendApproved',
    'scoreApproved'
  ]) {
    assert(fixture.candidateFutureRole?.[field] === false, `candidateFutureRole.${field} must be false.`);
  }
  assert(fixture.requiredBeforeP46?.requiresP44StableManualReviewReady === true, 'P46 must require P44 stable review.');
  assert(fixture.requiredBeforeP46?.minimumUsableSamples >= 8, 'P46 minimum usable samples must be at least 8.');
  assert(fixture.requiredBeforeP46?.minimumObservationWindowHours >= 24, 'P46 minimum observation window must be at least 24 hours.');
  assert(fixture.requiredBeforeP46?.minimumSelectedTimestamps >= 2, 'P46 minimum selected timestamps must be at least 2.');
  assert(fixture.requiredBeforeP46?.requiresNoRawTextOrUrl === true, 'P46 must require no raw text or URL.');
  assert(fixture.requiredBeforeP46?.requiresSeparateP46Contract === true, 'P46 must require a separate contract.');
  for (const field of Object.keys(fixture.approvalState || {})) {
    assert(fixture.approvalState[field] === false, `approvalState.${field} must be false.`);
  }
  for (const field of Object.keys(fixture.productionImpact || {})) {
    assert(fixture.productionImpact[field] === false, `productionImpact.${field} must be false.`);
  }
  for (const forbidden of [
    'hormuz_closure_confirmation',
    'tanker_flow_confirmation',
    'oil_price_direction',
    'score_input'
  ]) {
    assert(fixture.forbiddenInterpretation?.includes(forbidden), `forbiddenInterpretation missing ${forbidden}.`);
  }
}

function assertRuntimeUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P45 source-review marker: ${marker}`);
    }
  }
}

function assertAuthorityDocsAndPackage() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const oilNewsReview = readText('docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md');
  const gdeltPolicy = readText('docs/GDELT_SOURCE_POLICY.md');
  const packageJson = JSON.parse(readText('package.json'));

  for (const marker of [
    'gdelt-web-ngrams-fallback-source-review-p45',
    'source_review_manual_fallback_candidate_no_production_display',
    'oil_news_gdelt_web_ngrams_background_fallback_display_only'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }
  assert(packageJson.scripts['check:gdelt-web-ngrams-fallback-source-review'], 'package.json missing P45 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-fallback-source-review'), 'check:all missing P45 check.');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams fallback source-review: PASS');
}

main();
