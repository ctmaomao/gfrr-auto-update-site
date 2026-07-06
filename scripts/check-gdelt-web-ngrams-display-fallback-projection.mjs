#!/usr/bin/env node
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGdeltWebNgramsDisplayFallbackCache } from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';

const ROOT = process.cwd();
const DOC = 'docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_PROJECTION.md';
const PROJECT_SCRIPT = 'scripts/project-gdelt-web-ngrams-display-fallback-projection.mjs';
const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-projection-p50.json';
const CHECK_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-check.json';

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
  'gdelt-web-ngrams-display-fallback-projection-p50',
  'display_only_fallback_projection_ready_no_production_write'
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
  if (result.status !== 0) {
    throw new Error(`Command failed: node ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function assertNoRawContentMarkers(value, path = '$') {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const forbidden of ['http://', 'https://', '<html', '<!doctype', 'article title', 'article url', 'article body']) {
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

function assertDoc() {
  assert(existsSync(absolute(DOC)), `${DOC} is missing.`);
  const doc = readText(DOC);
  for (const marker of [
    'GDELT Web NGrams Display Fallback Projection',
    'gdelt-web-ngrams-display-fallback-projection-p50',
    'display_only_fallback_projection_ready_no_production_write',
    'sourceCaches.gdeltWebNgramsFallback',
    'npm run project:gdelt-web-ngrams-display-fallback-projection',
    'npm run check:gdelt-web-ngrams-display-fallback-projection',
    'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-latest.json',
    'productionWriteApproved=false',
    'frontendApproved=false',
    'workflowApproved=false',
    'currentSignalEnhancementApproved=false',
    'scoreApproved=false',
    'p51_display_only_fallback_projection_review_no_production_write'
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

function assertProjection(projection) {
  assert(projection.schemaVersion === 'gdelt-web-ngrams-display-fallback-projection-p50', 'Unexpected schemaVersion.');
  assert(
    projection.status === 'display_only_fallback_projection_ready_no_production_write',
    'Unexpected projection status.'
  );
  assert(
    projection.projectionState === 'manual_projection_ready_for_separate_writer_contract_review',
    'Unexpected projectionState.'
  );
  assert(
    projection.projectedProductionField?.fieldPath === 'sourceCaches.gdeltWebNgramsFallback',
    'Unexpected projected field path.'
  );
  assert(projection.projectedProductionField?.presentInProductionData === false, 'Projected field must remain absent.');
  assert(
    projection.projectedProductionField?.displayMode === 'aggregate_source_health_only_no_headlines',
    'Unexpected display mode.'
  );
  assert(
    projection.projectedProductionField?.projectedShape?.sampleGate?.usableSampleCount >= 8,
    'Projection must carry the passed usable sample count.'
  );
  assert(
    projection.projectedProductionField?.projectedShape?.sampleGate?.observationWindowHours >= 24,
    'Projection must carry the passed observation window.'
  );
  assert(
    projection.projectedProductionField?.projectedShape?.sourceHealth?.usedForCurrentSignal === false,
    'Projection must not enhance current signal.'
  );
  for (const field of Object.keys(projection.approvals || {})) {
    assert(projection.approvals[field] === false, `approvals.${field} must be false.`);
  }
  for (const field of Object.keys(projection.productionImpact || {})) {
    assert(projection.productionImpact[field] === false, `productionImpact.${field} must be false.`);
  }
  for (const field of [
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'noRealtimeWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange',
    'notProductionData',
    'displayProjectionOnly'
  ]) {
    assert(projection.boundaries?.[field] === true, `boundaries.${field} must be true.`);
  }
  assert(
    projection.nextAllowedStep === 'p51_display_only_fallback_projection_review_no_production_write',
    'Unexpected nextAllowedStep.'
  );
  assertNoRawContentMarkers(projection);
}

function assertProjectScript() {
  assert(existsSync(absolute(PROJECT_SCRIPT)), `${PROJECT_SCRIPT} is missing.`);
  const source = readText(PROJECT_SCRIPT);
  for (const marker of [
    'SCHEMA_VERSION',
    'gdelt-web-ngrams-display-fallback-projection-p50',
    'DEFAULT_OUTPUT',
    'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-latest.json',
    'sourceCaches.gdeltWebNgramsFallback',
    'isManualArtifactPath(options.output)',
    'Refusing to write projection outside manual-artifacts/',
    'noProductionWrite',
    'p51_display_only_fallback_projection_review_no_production_write'
  ]) {
    assert(source.includes(marker), `${PROJECT_SCRIPT} missing marker: ${marker}`);
  }
  for (const forbidden of [
    'fetch(',
    'process.env',
    'productionWriteApproved: true',
    'scoreApproved: true'
  ]) {
    assert(!source.includes(forbidden), `${PROJECT_SCRIPT} contains forbidden marker: ${forbidden}`);
  }
}

function assertRuntimeUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P50 projection marker: ${marker}`);
    }
  }
  const oilNews = JSON.parse(readText('data/oil-news-event-watch.json'));
  if (oilNews.sourceCaches?.gdeltWebNgramsFallback) {
    assertGdeltWebNgramsDisplayFallbackCache(oilNews.sourceCaches.gdeltWebNgramsFallback);
  }
}

function assertAuthorityDocsAndPackage() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const oilNewsReview = readText('docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md');
  const gdeltPolicy = readText('docs/GDELT_SOURCE_POLICY.md');
  const packageJson = JSON.parse(readText('package.json'));

  for (const marker of [
    'gdelt-web-ngrams-display-fallback-projection-p50',
    'display_only_fallback_projection_ready_no_production_write',
    'p51_display_only_fallback_projection_review_no_production_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }
  assert(packageJson.scripts['project:gdelt-web-ngrams-display-fallback-projection'], 'package.json missing P50 project script.');
  assert(packageJson.scripts['check:gdelt-web-ngrams-display-fallback-projection'], 'package.json missing P50 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-display-fallback-projection'), 'check:all missing P50 check.');
}

function assertGeneratedProjection() {
  rmSync(absolute(CHECK_OUTPUT), { force: true });
  runNode([PROJECT_SCRIPT, '--output', CHECK_OUTPUT, '--strict']);
  const projection = JSON.parse(readText(CHECK_OUTPUT));
  assertProjection(projection);
}

function main() {
  assertDoc();
  assertProjectScript();
  assertProjection(JSON.parse(readText(FIXTURE)));
  assertGeneratedProjection();
  assertRuntimeUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams display fallback projection: PASS');
}

main();
