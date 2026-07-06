#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertGdeltWebNgramsDisplayFallbackCache } from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-gdelt-web-ngrams-display-fallback-disabled-writer.mjs';
const DOC = 'docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_DISABLED_WRITER_REVIEW.md';
const INPUT_FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-p53.json';
const REVIEW_FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-review-p54.json';
const GENERATED_AT = '2026-07-06T00:00:00.000Z';

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
  'gdelt-web-ngrams-display-fallback-disabled-writer-review-p54',
  'disabled_writer_scaffold_review_passed_no_production_write',
  'review-gdelt-web-ngrams-display-fallback-disabled-writer'
];

function absolute(relativePath) {
  return join(ROOT, relativePath);
}

function readText(relativePath) {
  return readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function allFalse(record, label, allowedTrue = new Set()) {
  for (const [key, value] of Object.entries(record || {})) {
    if (allowedTrue.has(key)) {
      assert(value === true, `${label}.${key} must be true.`);
    } else {
      assert(value === false, `${label}.${key} must be false.`);
    }
  }
}

function assertNoRawContentMarkers(value, path = '$') {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const forbidden of ['http://', 'https://', '<html', '<!doctype', 'article title', 'article url', 'article body', 'rawresponse']) {
      assert(!lower.includes(forbidden), `${path} contains forbidden raw-content marker: ${forbidden}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawContentMarkers(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) assertNoRawContentMarkers(nested, `${path}.${key}`);
  }
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return String(result.stdout || '');
}

function assertDoc() {
  assert(existsSync(absolute(DOC)), `${DOC} is missing.`);
  const doc = readText(DOC);
  for (const marker of [
    'GDELT Web NGrams Display Fallback Disabled Writer Review',
    'gdelt-web-ngrams-display-fallback-disabled-writer-review-p54',
    'disabled_writer_scaffold_review_passed_no_production_write',
    'gdelt-web-ngrams-display-fallback-disabled-writer-p53',
    'disabled_no_production_write',
    'disabled_scaffold_no_production_write',
    'sourceCaches.gdeltWebNgramsFallback',
    'aggregate_source_health_only_no_headlines',
    'productionDataWriteApproved=false',
    'productionWriteApproved=false',
    'writerImplementationApproved=false',
    'frontendImplementationApproved=false',
    'workflowAutomationApproved=false',
    'currentSignalEnhancementApproved=false',
    'scoreApproved=false',
    'p55_display_only_fallback_production_write_readiness_gate_no_production_write'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
}

function assertScriptSafety() {
  assert(existsSync(absolute(REVIEW_SCRIPT)), `${REVIEW_SCRIPT} is missing.`);
  const source = readText(REVIEW_SCRIPT);
  for (const forbidden of ['fetch(', 'process.env', 'node:https', 'node:http', 'axios', 'productionWriteApproved: true', 'scoreApproved: true']) {
    assert(!source.includes(forbidden), `${REVIEW_SCRIPT} contains forbidden marker: ${forbidden}`);
  }
  for (const marker of [
    'gdelt-web-ngrams-display-fallback-disabled-writer-review-p54',
    'Refusing to write disabled writer review outside manual-artifacts/',
    'disabled_writer_scaffold_review_passed_no_production_write',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'notProductionData',
    'p55_display_only_fallback_production_write_readiness_gate_no_production_write'
  ]) {
    assert(source.includes(marker), `${REVIEW_SCRIPT} missing marker: ${marker}`);
  }
}

function assertReview(review) {
  assert(review.schemaVersion === 'gdelt-web-ngrams-display-fallback-disabled-writer-review-p54', 'Unexpected schemaVersion.');
  assert(review.status === 'pass', 'Review must pass.');
  assert(review.reviewState === 'disabled_writer_scaffold_review_passed_no_production_write', 'Unexpected reviewState.');
  assert(review.recommendation === 'ready_for_p55_production_write_readiness_gate_keep_non_production', 'Unexpected recommendation.');
  assert(review.projectionCount >= 1, 'Expected at least one projection.');
  assert(review.usableProjectionCount >= 1, 'Expected at least one usable projection.');
  assert(review.blockerCount === 0, 'Review must have zero blockers.');
  allFalse(review.approvalState, 'review.approvalState', new Set(['disabledWriterReviewPassed', 'readyForProductionWriteReadinessGate']));
  allFalse(review.approvals, 'review.approvals');
  allFalse(review.productionImpact, 'review.productionImpact');
  assert(review.currentProductionState?.sourceCachesGdeltWebNgramsFallback === 'absent', 'Production field must remain absent.');
  assert(review.aggregate?.maxUsableSampleCount >= 8, 'Review must retain usable sample gate.');
  assert(review.aggregate?.maxSelectedTimestampCount >= 2, 'Review must retain selected timestamp gate.');
  assert(review.aggregate?.maxObservationWindowHours >= 24, 'Review must retain observation window gate.');
  assert(Array.isArray(review.projections) && review.projections.every((projection) => projection.usable === true), 'All fixture projections must be usable.');
  assert(review.nextAllowedStep === 'p55_display_only_fallback_production_write_readiness_gate_no_production_write', 'Unexpected nextAllowedStep.');
  for (const field of [
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'noRealtimeWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange',
    'noRawProviderResponseStored',
    'notProductionData',
    'disabledWriterScaffoldReviewOnly'
  ]) {
    assert(review.boundaries?.[field] === true, `boundaries.${field} must be true.`);
  }
  assertNoRawContentMarkers(review);
}

function assertReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    INPUT_FIXTURE,
    '--generated-at',
    GENERATED_AT,
    '--min-projections',
    '1',
    '--no-output',
    '--json',
    '--strict'
  ]);
  assertReview(JSON.parse(stdout));
  const fixture = readJson(REVIEW_FIXTURE);
  fixture.projections[0].artifactHash = JSON.parse(stdout).projections[0].artifactHash;
  assertReview(fixture);
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P54 review marker: ${marker}`);
    }
  }
  const oilNews = readJson('data/oil-news-event-watch.json');
  if (oilNews.sourceCaches?.gdeltWebNgramsFallback) {
    assertGdeltWebNgramsDisplayFallbackCache(oilNews.sourceCaches.gdeltWebNgramsFallback);
  }
}

function assertAuthorityDocsAndPackage() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const oilNewsReview = readText('docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md');
  const gdeltPolicy = readText('docs/GDELT_SOURCE_POLICY.md');
  const packageJson = readJson('package.json');

  for (const marker of [
    'gdelt-web-ngrams-display-fallback-disabled-writer-review-p54',
    'disabled_writer_scaffold_review_passed_no_production_write',
    'review:gdelt-web-ngrams-display-fallback-disabled-writer',
    'check:gdelt-web-ngrams-display-fallback-disabled-writer-review',
    'productionWriteApproved=false',
    'scoreApproved=false',
    'p55_display_only_fallback_production_write_readiness_gate_no_production_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }
  assert(packageJson.scripts['review:gdelt-web-ngrams-display-fallback-disabled-writer'], 'package.json missing P54 review script.');
  assert(packageJson.scripts['check:gdelt-web-ngrams-display-fallback-disabled-writer-review'], 'package.json missing P54 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-display-fallback-disabled-writer-review'), 'check:all missing P54 check.');
}

function main() {
  assertDoc();
  assertScriptSafety();
  assertReviewOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams display fallback disabled writer review: PASS');
}

main();
