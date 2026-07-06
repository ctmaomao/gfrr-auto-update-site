#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/GDELT_WEB_NGRAMS_FALLBACK_GATE_REVIEW.md';
const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-fallback-gate-review-p49.json';

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
  'gdelt-web-ngrams-fallback-gate-review-p49',
  'gdelt_web_ngrams_fallback_gate_review',
  'sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write'
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
    'GDELT Web NGrams Fallback Gate Review',
    'gdelt-web-ngrams-fallback-gate-review-p49',
    'sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write',
    '28743580007',
    'usable sample count: `9`',
    'observation window: `28.27` hours',
    'raw exposure markers: absent',
    'productionWriteApproved=false',
    'frontendApproved=false',
    'workflowApproved=false',
    'currentSignalEnhancementApproved=false',
    'scoreApproved=false',
    'display-only fallback projection dry run'
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

function assertNoRawContentMarkers(value, path = '$') {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const forbidden of ['http://', 'https://', '<html', '<!doctype', 'article_title', 'article_url', 'article_body']) {
      assert(!lower.includes(forbidden), `${path} contains forbidden raw-content marker: ${forbidden}`);
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

function assertFalseApprovals(fixture) {
  for (const field of [
    'productionWriteApproved',
    'frontendApproved',
    'workflowApproved',
    'currentSignalEnhancementApproved',
    'scoreApproved'
  ]) {
    assert(fixture.approvalState?.[field] === false, `approvalState.${field} must be false.`);
  }
  assert(fixture.approvalState?.sampleGatePassed === true, 'sampleGatePassed must be true.');
  assert(
    fixture.approvalState?.readyForDisplayOnlyFallbackProjection === true,
    'readyForDisplayOnlyFallbackProjection must be true.'
  );
}

function assertFixture() {
  assert(existsSync(absolute(FIXTURE)), `${FIXTURE} is missing.`);
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'gdelt-web-ngrams-fallback-gate-review-p49', 'Unexpected contractVersion.');
  assert(fixture.kind === 'gdelt_web_ngrams_fallback_gate_review', 'Unexpected kind.');
  assert(
    fixture.status === 'sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write',
    'Unexpected status.'
  );
  assert(fixture.evidenceSnapshot?.collectorRunId === 28743580007, 'Unexpected collectorRunId.');
  assert(fixture.evidenceSnapshot?.rawExposureScan === 'no_raw_exposure_markers', 'rawExposureScan must be clean.');
  assert(fixture.sampleWindow?.usableSampleCount >= 8, 'usableSampleCount must be at least 8.');
  assert(fixture.sampleWindow?.selectedTimestampCount >= 2, 'selectedTimestampCount must be at least 2.');
  assert(fixture.sampleWindow?.observationWindowHours >= 24, 'observationWindowHours must be at least 24.');
  assert(fixture.sampleWindow?.blockerCount === 0, 'blockerCount must be 0.');
  for (const criterion of [
    'minimumUsableSamples',
    'minimumObservationWindowHours',
    'minimumSelectedTimestamps',
    'noBlockers',
    'noRawExposure',
    'requiredBuckets',
    'requiresOneOfBuckets'
  ]) {
    assert(fixture.gateCriteria?.[criterion]?.passed === true, `gateCriteria.${criterion}.passed must be true.`);
  }
  for (const bucket of ['chokepoint', 'tanker_shipping', 'market_reaction']) {
    assert(fixture.bucketCoverage?.[bucket]?.sampleHitCount > 0, `bucketCoverage.${bucket} must have hits.`);
  }
  assert(
    fixture.bucketCoverage?.sanctions?.sampleHitCount > 0 || fixture.bucketCoverage?.supply_disruption?.sampleHitCount > 0,
    'At least one optional bucket must have hits.'
  );
  assertFalseApprovals(fixture);
  for (const field of Object.keys(fixture.productionImpact || {})) {
    assert(fixture.productionImpact[field] === false, `productionImpact.${field} must be false.`);
  }
  assert(fixture.futureFieldState?.fieldPath === 'sourceCaches.gdeltWebNgramsFallback', 'Unexpected future field path.');
  assert(fixture.futureFieldState?.presentInProductionData === false, 'future field must stay absent from production.');
  assert(fixture.futureFieldState?.projectionDryRunAllowed === true, 'projection dry run should be allowed.');
  assert(fixture.futureFieldState?.productionWriterAllowed === false, 'production writer must remain blocked.');
  assert(
    fixture.nextAllowedStep === 'p50_display_only_fallback_projection_dry_run_no_production_write',
    'Unexpected nextAllowedStep.'
  );
  assertNoRawContentMarkers(fixture);
}

function assertRuntimeUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P49 gate-review marker: ${marker}`);
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
    'gdelt-web-ngrams-fallback-gate-review-p49',
    'sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write',
    'p50_display_only_fallback_projection_dry_run_no_production_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }
  assert(packageJson.scripts['check:gdelt-web-ngrams-fallback-gate-review'], 'package.json missing P49 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-fallback-gate-review'), 'check:all missing P49 check.');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams fallback gate review: PASS');
}

main();
