#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertGdeltWebNgramsDisplayFallbackCache } from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-gdelt-web-ngrams-display-fallback-projections.mjs';
const DOC = 'docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_PROJECTION_REVIEW.md';
const PROJECTION_FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-projection-p50.json';
const REVIEW_FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-projection-review-p51.json';

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
  'gdelt-web-ngrams-display-fallback-projection-review-p51',
  'display_fallback_projection_review_passed_no_production_write',
  'review:gdelt-web-ngrams-display-fallback-projections',
  'p52_display_only_fallback_writer_contract_design_no_production_write'
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

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`node ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return String(result.stdout || '');
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

function assertScriptSafety() {
  assert(existsSync(absolute(REVIEW_SCRIPT)), `${REVIEW_SCRIPT} is missing.`);
  const source = readText(REVIEW_SCRIPT);
  for (const forbidden of ['fetch(', 'process.env', 'node:https', 'node:http', 'axios', 'productionWriteApproved: true', 'scoreApproved: true']) {
    assert(!source.includes(forbidden), `${REVIEW_SCRIPT} contains forbidden marker: ${forbidden}`);
  }
  for (const marker of [
    'gdelt-web-ngrams-display-fallback-projection-review-p51',
    'gdelt-web-ngrams-display-fallback-projection-p50',
    'display_fallback_projection_review_passed_no_production_write',
    'sourceCaches.gdeltWebNgramsFallback',
    'Refusing to write review outside manual-artifacts/',
    'noProductionWrite',
    'p52_display_only_fallback_writer_contract_design_no_production_write'
  ]) {
    assert(source.includes(marker), `${REVIEW_SCRIPT} missing marker: ${marker}`);
  }
}

function assertReview(review) {
  assert(review.schemaVersion === 'gdelt-web-ngrams-display-fallback-projection-review-p51', 'Unexpected review schemaVersion.');
  assert(review.status === 'pass', 'Expected review status pass.');
  assert(review.reviewState === 'display_fallback_projection_review_passed_no_production_write', 'Unexpected reviewState.');
  assert(review.recommendation === 'ready_for_p52_writer_contract_design_keep_non_production', 'Unexpected recommendation.');
  assert(review.projectionCount === 1, 'Expected one projection.');
  assert(review.usableProjectionCount === 1, 'Expected one usable projection.');
  assert(review.approvalState.projectionReviewPassed === true, 'Projection review should pass.');
  assert(review.approvalState.readyForWriterContractDesignReview === true, 'Writer contract design review should be ready.');
  for (const field of [
    'productionWriteApproved',
    'frontendApproved',
    'workflowApproved',
    'currentSignalEnhancementApproved',
    'scoreApproved'
  ]) {
    assert(review.approvalState[field] === false, `approvalState.${field} must stay false.`);
  }
  for (const field of Object.keys(review.approvals || {})) assert(review.approvals[field] === false, `approvals.${field} must be false.`);
  for (const field of Object.keys(review.productionImpact || {})) {
    assert(review.productionImpact[field] === false, `productionImpact.${field} must be false.`);
  }
  assert(review.currentProductionState.sourceCachesGdeltWebNgramsFallback === 'absent', 'Future field must remain absent.');
  assert(review.currentProductionState.oilNewsCurrentSignalEnhancedByWebNgrams === false, 'Current signal must not be enhanced.');
  assert(review.currentProductionState.frontendDisplayConnected === false, 'Frontend must remain disconnected.');
  assert(review.currentProductionState.eligibleForScoring === false, 'Review must remain non-scoring.');
  assert(review.aggregate.maxUsableSampleCount >= 8, 'Review must carry usable sample gate.');
  assert(review.aggregate.maxObservationWindowHours >= 24, 'Review must carry observation window gate.');
  assert(review.blockerCount === 0, 'Review must have zero blockers.');
  assert(review.nextAllowedStep === 'p52_display_only_fallback_writer_contract_design_no_production_write', 'Unexpected nextAllowedStep.');
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
    'displayProjectionReviewOnly'
  ]) {
    assert(review.boundaries[field] === true, `boundaries.${field} must be true.`);
  }
  assertNoRawContentMarkers(review);
}

function assertReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    PROJECTION_FIXTURE,
    '--min-projections',
    '1',
    '--no-output',
    '--json',
    '--strict'
  ]);
  assertReview(JSON.parse(stdout));
  assertReview(JSON.parse(readText(REVIEW_FIXTURE)));
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P51 review marker: ${marker}`);
    }
  }
  const oilNews = JSON.parse(readText('data/oil-news-event-watch.json'));
  if (oilNews.sourceCaches?.gdeltWebNgramsFallback) {
    assertGdeltWebNgramsDisplayFallbackCache(oilNews.sourceCaches.gdeltWebNgramsFallback);
  }
}

function assertAuthorityDocsAndPackage() {
  assert(existsSync(absolute(DOC)), `${DOC} is missing.`);
  const doc = readText(DOC);
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const oilNewsReview = readText('docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md');
  const gdeltPolicy = readText('docs/GDELT_SOURCE_POLICY.md');
  const packageJson = JSON.parse(readText('package.json'));

  for (const marker of [
    'gdelt-web-ngrams-display-fallback-projection-review-p51',
    'display_fallback_projection_review_passed_no_production_write',
    'review:gdelt-web-ngrams-display-fallback-projections',
    'check:gdelt-web-ngrams-display-fallback-projection-review',
    'p52_display_only_fallback_writer_contract_design_no_production_write',
    'productionWriteApproved=false',
    'scoreApproved=false'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }
  assert(packageJson.scripts['review:gdelt-web-ngrams-display-fallback-projections'], 'package.json missing P51 review script.');
  assert(packageJson.scripts['check:gdelt-web-ngrams-display-fallback-projection-review'], 'package.json missing P51 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-display-fallback-projection-review'), 'check:all missing P51 check.');
}

function main() {
  assertScriptSafety();
  assertReviewOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams display fallback projection review: PASS');
}

main();
