#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/GDELT_WEB_NGRAMS_PRODUCTION_DISPLAY_FALLBACK_CONTRACT.md';
const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-production-display-fallback-contract-p46.json';

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
  'gdelt-web-ngrams-production-display-fallback-contract-p46',
  'gdelt_web_ngrams_production_display_fallback_contract',
  'sourceCaches.gdeltWebNgramsFallback',
  'gdeltWebNgramsFallback',
  'aggregate_source_health_only_no_headlines'
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

function assertNoRawContentMarkers(value, path = '$') {
  if (typeof value === 'string') {
    for (const forbidden of ['http://', 'https://', '<html', '<!doctype', 'headline:', 'title:']) {
      assert(!value.toLowerCase().includes(forbidden), `${path} contains forbidden raw-content marker: ${forbidden}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawContentMarkers(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assertNoRawContentMarkers(nested, `${path}.${key}`);
    }
  }
}

function assertDoc() {
  assert(existsSync(absolute(DOC)), `${DOC} is missing.`);
  const doc = readText(DOC);
  for (const marker of [
    'GDELT Web NGrams Production Display Fallback Contract',
    'gdelt-web-ngrams-production-display-fallback-contract-p46',
    'contract_design_only_waiting_for_sufficient_p44_samples_no_production_write',
    'oil_news_gdelt_web_ngrams_background_fallback_display_only',
    'sourceCaches.gdeltWebNgramsFallback',
    'aggregate_source_health_only_no_headlines',
    'P44 sample archive reports `stable_manual_review_ready`',
    'At least 8 usable Web NGrams diagnosis samples',
    'Samples span at least 24 hours',
    'productionWriteApproved=false',
    'frontendApproved=false',
    'workflowApproved=false',
    'currentSignalEnhancementApproved=false',
    'scoreApproved=false',
    'The next allowed step is P47 artifact-only projection'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
  for (const forbidden of [
    'productionWriteApproved=true',
    'frontendApproved=true',
    'workflowApproved=true',
    'currentSignalEnhancementApproved=true',
    'scoreApproved=true',
    'confirmed Hormuz',
    'oil direction approved'
  ]) {
    assert(!doc.includes(forbidden), `${DOC} contains forbidden approval claim: ${forbidden}`);
  }
}

function assertFixture() {
  assert(existsSync(absolute(FIXTURE)), `${FIXTURE} is missing.`);
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'gdelt-web-ngrams-production-display-fallback-contract-p46', 'Unexpected contractVersion.');
  assert(fixture.kind === 'gdelt_web_ngrams_production_display_fallback_contract', 'Unexpected kind.');
  assert(fixture.status === 'contract_design_only_waiting_for_sufficient_p44_samples_no_production_write', 'Unexpected status.');
  assert(fixture.futureRole?.roleKey === 'oil_news_gdelt_web_ngrams_background_fallback_display_only', 'Unexpected future role.');
  assert(fixture.futureRole?.fallbackContextOnly === true, 'future role must be fallback context only.');
  assert(fixture.futureRole?.eventConfirmationSource === false, 'future role must not be event confirmation.');
  assert(fixture.futureRole?.headlineSource === false, 'future role must not be headline source.');
  assert(fixture.futureRole?.oilDirectionInput === false, 'future role must not be oil direction input.');

  assert(fixture.futureField?.targetArtifact === 'data/oil-news-event-watch.json', 'Unexpected future target artifact.');
  assert(fixture.futureField?.fieldPath === 'sourceCaches.gdeltWebNgramsFallback', 'Unexpected future field path.');
  assert(fixture.futureField?.displayMode === 'aggregate_source_health_only_no_headlines', 'Unexpected display mode.');
  assert(fixture.futureField?.writerApprovedByThisContract === false, 'Writer approval must remain false.');
  assert(fixture.futureField?.frontendApprovedByThisContract === false, 'Frontend approval must remain false.');
  assert(fixture.futureField?.workflowApprovedByThisContract === false, 'Workflow approval must remain false.');
  assert(fixture.futureField?.schemaShape?.status === 'disabled_pending_sample_gate', 'Schema shape must remain disabled.');
  assert(fixture.futureField?.schemaShape?.sourceHealth?.fallbackContextOnly === true, 'Schema must remain context only.');

  assert(fixture.sampleGate?.requiredArchiveState === 'stable_manual_review_ready', 'Sample gate must require stable archive.');
  assert(fixture.sampleGate?.minimumUsableSamples >= 8, 'Sample gate must require at least 8 usable samples.');
  assert(fixture.sampleGate?.minimumObservationWindowHours >= 24, 'Sample gate must require at least 24 hours.');
  assert(fixture.sampleGate?.minimumSelectedTimestamps >= 2, 'Sample gate must require at least 2 selected timestamps.');
  assert(fixture.sampleGate?.requiresNoRawTextOrUrl === true, 'Sample gate must require no raw text or URL.');
  assert(fixture.sampleGate?.productionWriteAllowedWhenGateFails === false, 'Failed gate must not allow production writes.');
  for (const bucket of ['chokepoint', 'tanker_shipping', 'market_reaction']) {
    assert(fixture.sampleGate?.requiredBuckets?.includes(bucket), `Sample gate missing bucket ${bucket}.`);
  }
  for (const bucket of ['sanctions', 'supply_disruption', 'facility_event']) {
    assert(fixture.sampleGate?.requiresOneOfBuckets?.includes(bucket), `Sample gate missing optional bucket ${bucket}.`);
  }

  for (const field of Object.keys(fixture.approvalState || {})) {
    assert(fixture.approvalState[field] === false, `approvalState.${field} must be false.`);
  }
  for (const field of Object.keys(fixture.productionImpact || {})) {
    assert(fixture.productionImpact[field] === false, `productionImpact.${field} must be false.`);
  }
  for (const forbidden of [
    'article_title',
    'article_url',
    'article_snippet',
    'article_body',
    'raw_ngram_rows',
    'raw_provider_response',
    'secret',
    'request_header',
    'api_key'
  ]) {
    assert(fixture.forbiddenContent?.includes(forbidden), `forbiddenContent missing ${forbidden}.`);
  }
  for (const forbidden of [
    'hormuz_closure_confirmation',
    'tanker_flow_confirmation',
    'oil_price_direction',
    'score_input'
  ]) {
    assert(fixture.forbiddenInterpretation?.includes(forbidden), `forbiddenInterpretation missing ${forbidden}.`);
  }
  assert(fixture.nextAllowedStep === 'p47_artifact_only_projection_after_sample_gate_review', 'Unexpected nextAllowedStep.');
  assertNoRawContentMarkers(fixture);
}

function assertRuntimeUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P46 production-display fallback marker: ${marker}`);
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
    'gdelt-web-ngrams-production-display-fallback-contract-p46',
    'contract_design_only_waiting_for_sufficient_p44_samples_no_production_write',
    'sourceCaches.gdeltWebNgramsFallback',
    'aggregate_source_health_only_no_headlines'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }
  assert(packageJson.scripts['check:gdelt-web-ngrams-production-display-fallback-contract'], 'package.json missing P46 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-production-display-fallback-contract'), 'check:all missing P46 check.');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams production display fallback contract: PASS');
}

main();
