#!/usr/bin/env node
import { assertAllFalse as allFalse, readJson, runNode } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertGdeltWebNgramsDisplayFallbackCache } from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';

const ROOT = process.cwd();
const SCRIPT = 'scripts/project-gdelt-web-ngrams-display-fallback-disabled-writer.mjs';
const DOC = 'docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_DISABLED_WRITER_SCAFFOLD.md';
const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-p53.json';
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
  'gdelt-web-ngrams-display-fallback-disabled-writer-p53',
  'disabled_scaffold_no_production_write',
  'project-gdelt-web-ngrams-display-fallback-disabled-writer'
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

function assertDoc() {
  assert(existsSync(absolute(DOC)), `${DOC} is missing.`);
  const doc = readText(DOC);
  for (const marker of [
    'GDELT Web NGrams Display Fallback Disabled Writer Scaffold',
    'gdelt-web-ngrams-display-fallback-disabled-writer-p53',
    'disabled_no_production_write',
    'disabled_scaffold_no_production_write',
    'sourceCaches.gdeltWebNgramsFallback',
    'gdelt-web-ngrams-display-fallback-cache-v1',
    'productionWriteAttempted=false',
    'productionWriteApproved=false',
    'currentSignalEnhancement=false',
    'eventConfirmationSource=false',
    'headlineSource=false',
    'oilDirectionInput=false',
    'eligibleForScoring=false',
    'productionDataWriteApproved=false',
    'writerImplementationApproved=false',
    'frontendImplementationApproved=false',
    'workflowAutomationApproved=false',
    'scoreApproved=false',
    'p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
}

function assertScriptSafety() {
  assert(existsSync(absolute(SCRIPT)), `${SCRIPT} is missing.`);
  const source = readText(SCRIPT);
  for (const forbidden of ['fetch(', 'process.env', 'node:https', 'node:http', 'axios', 'productionWriteApproved: true', 'scoreApproved: true']) {
    assert(!source.includes(forbidden), `${SCRIPT} contains forbidden marker: ${forbidden}`);
  }
  for (const marker of [
    'gdelt-web-ngrams-display-fallback-disabled-writer-p53',
    'Refusing to write disabled writer projection outside manual-artifacts/',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'notProductionData',
    'p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write'
  ]) {
    assert(source.includes(marker), `${SCRIPT} missing marker: ${marker}`);
  }
}

function assertProjection(projection) {
  assert(projection.schemaVersion === 'gdelt-web-ngrams-display-fallback-disabled-writer-p53', 'Unexpected schemaVersion.');
  assert(projection.status === 'disabled_no_production_write', 'Unexpected status.');
  assert(projection.writerState === 'disabled_scaffold_no_production_write', 'Unexpected writerState.');
  assert(projection.writeMode === 'manual_artifact_only', 'Unexpected writeMode.');
  assert(projection.productionWriteAttempted === false, 'productionWriteAttempted must be false.');
  assert(projection.productionWriteApproved === false, 'productionWriteApproved must be false.');
  assert(projection.futureProductionField?.fieldPath === 'sourceCaches.gdeltWebNgramsFallback', 'Unexpected future field.');
  assert(projection.futureProductionField?.presentInProductionData === false, 'Future field must remain absent in P53.');
  assert(projection.candidateCache?.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v1', 'Unexpected cache contract.');
  assert(projection.candidateCache?.status === 'sample_gate_passed_projection_only', 'Unexpected candidate cache status.');
  assert(projection.candidateCache?.displayMode === 'aggregate_source_health_only_no_headlines', 'Unexpected display mode.');
  assert(projection.candidateCache?.currentSignalEnhancement === false, 'candidate currentSignalEnhancement must be false.');
  assert(projection.candidateCache?.eventConfirmationSource === false, 'candidate eventConfirmationSource must be false.');
  assert(projection.candidateCache?.headlineSource === false, 'candidate headlineSource must be false.');
  assert(projection.candidateCache?.oilDirectionInput === false, 'candidate oilDirectionInput must be false.');
  assert(projection.candidateCache?.eligibleForScoring === false, 'candidate eligibleForScoring must be false.');
  assert(projection.candidateCache?.sourceHealth?.usedForCurrentSignal === false, 'sourceHealth.usedForCurrentSignal must be false.');
  assert(projection.candidateCache?.sampleGate?.usableSampleCount >= 8, 'candidate sample gate must retain usable sample count.');
  assert(projection.candidateCache?.sampleGate?.selectedTimestampCount >= 2, 'candidate sample gate must retain selected timestamp count.');
  assert(projection.candidateCache?.sampleGate?.observationWindowHours >= 24, 'candidate sample gate must retain observation window.');
  assert(projection.currentProductionState?.sourceCachesGdeltWebNgramsFallback === 'absent', 'Current production field must remain absent.');
  allFalse(projection.approvals, 'projection.approvals');
  allFalse(projection.productionImpact, 'projection.productionImpact');
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
    'noRawTitleOrUrl',
    'notProductionData',
    'disabledWriterScaffoldOnly'
  ]) {
    assert(projection.boundaries?.[field] === true, `boundaries.${field} must be true.`);
  }
  assert(projection.nextAllowedStep === 'p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write', 'Unexpected nextAllowedStep.');
  assertNoRawContentMarkers(projection);
}

function assertProjectionOutput() {
  const stdout = runNode([
    SCRIPT,
    '--generated-at',
    GENERATED_AT,
    '--no-output',
    '--json',
    '--strict'
  ]);
  const generated = JSON.parse(stdout);
  const fixture = readJson(FIXTURE);
  assert(JSON.stringify(generated) === JSON.stringify(fixture), 'Generated disabled writer projection must match fixture.');
  assertProjection(generated);
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P53 disabled-writer marker: ${marker}`);
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
    'gdelt-web-ngrams-display-fallback-disabled-writer-p53',
    'disabled_no_production_write',
    'disabled_scaffold_no_production_write',
    'project:gdelt-web-ngrams-display-fallback-disabled-writer',
    'check:gdelt-web-ngrams-display-fallback-disabled-writer-scaffold',
    'productionWriteApproved=false',
    'scoreApproved=false',
    'p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }
  assert(packageJson.scripts['project:gdelt-web-ngrams-display-fallback-disabled-writer'], 'package.json missing P53 project script.');
  assert(packageJson.scripts['check:gdelt-web-ngrams-display-fallback-disabled-writer-scaffold'], 'package.json missing P53 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-display-fallback-disabled-writer-scaffold'), 'check:all missing P53 check.');
}

function main() {
  assertDoc();
  assertScriptSafety();
  assertProjectionOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams display fallback disabled writer scaffold: PASS');
}

main();
