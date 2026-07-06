#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-gdelt-web-ngrams-display-fallback-production-write-readiness.mjs';
const DOC = 'docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_PRODUCTION_WRITE_READINESS.md';
const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-production-write-readiness-p55.json';
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
  'gdelt-web-ngrams-display-fallback-production-write-readiness-p55',
  'p56_display_only_write_authorized',
  'review-gdelt-web-ngrams-display-fallback-production-write-readiness'
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
    'GDELT Web NGrams Display Fallback Production Write Readiness',
    'gdelt-web-ngrams-display-fallback-production-write-readiness-p55',
    'production_display_only_write_ready_no_production_write',
    'data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback',
    'gdelt-web-ngrams-display-fallback-cache-v1',
    'aggregate_source_health_only_no_headlines',
    'currentSignalEnhancement=false',
    'eventConfirmationSource=false',
    'headlineSource=false',
    'oilDirectionInput=false',
    'eligibleForScoring=false',
    'frontendImplementationApproved=false',
    'workflowAutomationApproved=false',
    'liveFetchApproved=false',
    'apiKeyReadApproved=false',
    'currentSignalEnhancementApproved=false',
    'scoreApproved=false',
    'p56_display_only_fallback_production_display_write'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
}

function assertScriptSafety() {
  assert(existsSync(absolute(REVIEW_SCRIPT)), `${REVIEW_SCRIPT} is missing.`);
  const source = readText(REVIEW_SCRIPT);
  for (const forbidden of ['fetch(', 'process.env', 'node:https', 'node:http', 'axios']) {
    assert(!source.includes(forbidden), `${REVIEW_SCRIPT} contains forbidden marker: ${forbidden}`);
  }
  for (const marker of [
    'gdelt-web-ngrams-display-fallback-production-write-readiness-p55',
    'Refusing to write readiness gate outside manual-artifacts/',
    'production_display_only_write_ready_no_production_write',
    'p56ProductionDataWriteApproved',
    'p56ProductionWriteApproved',
    'noProductionWriteByThisGate',
    'p56_display_only_fallback_production_display_write'
  ]) {
    assert(source.includes(marker), `${REVIEW_SCRIPT} missing marker: ${marker}`);
  }
}

function assertReadiness(readiness) {
  assert(readiness.schemaVersion === 'gdelt-web-ngrams-display-fallback-production-write-readiness-p55', 'Unexpected schemaVersion.');
  assert(readiness.status === 'production_display_only_write_ready_no_production_write', 'Readiness must pass.');
  assert(readiness.readinessState === 'p56_display_only_write_authorized', 'Unexpected readinessState.');
  assert(readiness.recommendation === 'proceed_to_p56_production_display_only_write_with_scoped_guard', 'Unexpected recommendation.');
  assert(readiness.approvedWriteScope?.targetArtifact === 'data/oil-news-event-watch.json', 'Unexpected target artifact.');
  assert(readiness.approvedWriteScope?.fieldPath === 'sourceCaches.gdeltWebNgramsFallback', 'Unexpected field path.');
  assert(readiness.approvedWriteScope?.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v1', 'Unexpected cache contract.');
  assert(readiness.approvedWriteScope?.allowedWriteMode === 'single_field_display_only_cache', 'Unexpected write mode.');
  assert(readiness.approvedWriteScope?.preserveExistingOilNewsFields === true, 'Must preserve existing Oil News fields.');
  for (const field of ['currentSignalEnhancement', 'eventConfirmationSource', 'headlineSource', 'oilDirectionInput', 'eligibleForScoring', 'rawContentAllowed']) {
    assert(readiness.approvedWriteScope?.[field] === false, `approvedWriteScope.${field} must be false.`);
  }
  assert(readiness.candidateCache?.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v1', 'Unexpected candidate cache contract.');
  assert(readiness.candidateCache?.currentSignalEnhancement === false, 'candidateCache.currentSignalEnhancement must be false.');
  assert(readiness.candidateCache?.sourceHealth?.usedForCurrentSignal === false, 'candidateCache sourceHealth must not affect current signal.');
  assert(readiness.candidateCache?.sampleGate?.usableSampleCount >= 8, 'candidate sample gate must pass.');
  assert(readiness.currentProductionState?.sourceCachesGdeltWebNgramsFallback === 'prewrite_absent', 'P55 fixture must be prewrite_absent.');
  for (const field of ['readinessGatePassed', 'p56ProductionDataWriteApproved', 'p56ProductionWriteApproved', 'p56WriterImplementationApproved', 'p56ScopedFieldOnly']) {
    assert(readiness.approvalState?.[field] === true, `approvalState.${field} must be true.`);
  }
  for (const field of [
    'frontendImplementationApproved',
    'workflowAutomationApproved',
    'liveFetchApproved',
    'apiKeyReadApproved',
    'currentSignalEnhancementApproved',
    'scoreApproved',
    'mainScoreApproved',
    'odpFinalBiasApproved',
    'brentPromotionApproved',
    'globalRiskHeatmapApproved',
    'crossValidationApproved'
  ]) {
    assert(readiness.approvalState?.[field] === false, `approvalState.${field} must be false.`);
  }
  for (const [key, value] of Object.entries(readiness.p55ProductionImpact || {})) {
    assert(value === false, `p55ProductionImpact.${key} must be false.`);
  }
  assert(readiness.p56AuthorizedImpact?.writesProductionData === true, 'P56 production data write should be scoped-approved.');
  assert(readiness.p56AuthorizedImpact?.displayOnly === true, 'P56 authorized impact must be displayOnly.');
  assert(readiness.p56AuthorizedImpact?.changesOilNewsCurrentSignal === false, 'P56 must not change current Oil News signal.');
  assert(readiness.p56AuthorizedImpact?.changesOdpBuild === false, 'P56 must not change ODP build.');
  assert(readiness.p56AuthorizedImpact?.changesScoring === false, 'P56 must not change scoring.');
  assert(readiness.blockerCount === 0, 'Readiness must have zero blockers.');
  for (const field of [
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWriteByThisGate',
    'noRealtimeWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange',
    'noRawProviderResponseStored',
    'notProductionData',
    'readinessGateOnly'
  ]) {
    assert(readiness.boundaries?.[field] === true, `boundaries.${field} must be true.`);
  }
  assert(readiness.nextAllowedStep === 'p56_display_only_fallback_production_display_write', 'Unexpected nextAllowedStep.');
  assertNoRawContentMarkers(readiness);
}

function assertReadinessOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--generated-at',
    GENERATED_AT,
    '--no-output',
    '--json',
    '--strict'
  ]);
  const generated = JSON.parse(stdout);
  assertReadiness(generated);
  const fixture = readJson(FIXTURE);
  fixture.inputs.disabledWriterReview.artifactHash = generated.inputs.disabledWriterReview.artifactHash;
  fixture.inputs.disabledWriterProjection.artifactHash = generated.inputs.disabledWriterProjection.artifactHash;
  assertReadiness(fixture);
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P55 readiness marker: ${marker}`);
    }
  }
}

function assertAuthorityDocsAndPackage() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const oilNewsReview = readText('docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md');
  const gdeltPolicy = readText('docs/GDELT_SOURCE_POLICY.md');
  const packageJson = readJson('package.json');

  for (const marker of [
    'gdelt-web-ngrams-display-fallback-production-write-readiness-p55',
    'production_display_only_write_ready_no_production_write',
    'review:gdelt-web-ngrams-display-fallback-production-write-readiness',
    'check:gdelt-web-ngrams-display-fallback-production-write-readiness',
    'p56ProductionDataWriteApproved=true',
    'currentSignalEnhancementApproved=false',
    'scoreApproved=false',
    'p56_display_only_fallback_production_display_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }
  assert(packageJson.scripts['review:gdelt-web-ngrams-display-fallback-production-write-readiness'], 'package.json missing P55 review script.');
  assert(packageJson.scripts['check:gdelt-web-ngrams-display-fallback-production-write-readiness'], 'package.json missing P55 check script.');
  assert(packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-display-fallback-production-write-readiness'), 'check:all missing P55 check.');
}

function main() {
  assertDoc();
  assertScriptSafety();
  assertReadinessOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams display fallback production write readiness: PASS');
}

main();
