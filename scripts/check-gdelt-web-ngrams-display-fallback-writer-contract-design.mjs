#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_WRITER_CONTRACT_DESIGN.md';
const FIXTURE = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-writer-contract-design-p52.json';

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
  'gdelt-web-ngrams-display-fallback-writer-contract-design-p52',
  'gdelt_web_ngrams_display_fallback_writer_contract_design',
  'gdelt-web-ngrams-display-fallback-cache-v1',
  'p53_display_only_fallback_disabled_writer_scaffold_no_production_write',
  'sourceCaches.gdeltWebNgramsFallback',
  'gdeltWebNgramsFallback'
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

function assertNoRawContentLeaks(value, path = '$') {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const forbidden of ['http://', 'https://', '<html', '<!doctype']) {
      assert(!lower.includes(forbidden), `${path} contains forbidden raw-content marker: ${forbidden}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawContentLeaks(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assertNoRawContentLeaks(nested, `${path}.${key}`);
    }
  }
}

function assertDoc() {
  assert(existsSync(absolute(DOC)), `${DOC} is missing.`);
  const doc = readText(DOC);
  for (const marker of [
    'GDELT Web NGrams Display Fallback Writer Contract Design',
    'gdelt-web-ngrams-display-fallback-writer-contract-design-p52',
    'display_only_fallback_writer_contract_design_no_production_write',
    'data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback',
    'gdelt-web-ngrams-display-fallback-cache-v1',
    'aggregate_source_health_only_no_headlines',
    'currentSignalEnhancement=false',
    'eventConfirmationSource=false',
    'headlineSource=false',
    'oilDirectionInput=false',
    'eligibleForScoring=false',
    'productionWriteApproved=false',
    'writerImplementationApproved=false',
    'frontendImplementationApproved=false',
    'workflowAutomationApproved=false',
    'liveFetchApproved=false',
    'apiKeyReadApproved=false',
    'currentSignalEnhancementApproved=false',
    'scoreApproved=false',
    'npm run check:gdelt-web-ngrams-display-fallback-writer-contract-design',
    'p53_display_only_fallback_disabled_writer_scaffold_no_production_write'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
  for (const forbidden of [
    'productionWriteApproved=true',
    'writerImplementationApproved=true',
    'frontendImplementationApproved=true',
    'workflowAutomationApproved=true',
    'currentSignalEnhancementApproved=true',
    'scoreApproved=true',
    'confirmed Hormuz',
    'oil direction approved'
  ]) {
    assert(!doc.includes(forbidden), `${DOC} contains forbidden approval claim: ${forbidden}`);
  }
}

function assertFixture(contract) {
  assert(contract.contractVersion === 'gdelt-web-ngrams-display-fallback-writer-contract-design-p52', 'Unexpected contractVersion.');
  assert(contract.kind === 'gdelt_web_ngrams_display_fallback_writer_contract_design', 'Unexpected kind.');
  assert(contract.status === 'display_only_fallback_writer_contract_design_no_production_write', 'Unexpected status.');

  const future = contract.futureProductionField || {};
  assert(future.targetArtifact === 'data/oil-news-event-watch.json', 'Unexpected future target artifact.');
  assert(future.fieldPath === 'sourceCaches.gdeltWebNgramsFallback', 'Unexpected future field path.');
  assert(future.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v1', 'Unexpected future field contract.');
  assert(future.presentInProductionData === false, 'Future field must remain absent.');
  assert(future.displayMode === 'aggregate_source_health_only_no_headlines', 'Unexpected display mode.');
  for (const field of [
    'fallbackContextOnly',
    'currentSignalEnhancement',
    'eventConfirmationSource',
    'headlineSource',
    'oilDirectionInput',
    'eligibleForScoring'
  ]) {
    const expected = field === 'fallbackContextOnly';
    assert(future[field] === expected, `futureProductionField.${field} must be ${expected}.`);
  }

  const requiredInputs = new Set(contract.requiredPreWriteInputs || []);
  for (const marker of [
    'gdelt-web-ngrams-production-display-fallback-contract-p46',
    'gdelt-web-ngrams-fallback-gate-review-p49',
    'gdelt-web-ngrams-display-fallback-projection-p50',
    'gdelt-web-ngrams-display-fallback-projection-review-p51'
  ]) {
    assert(requiredInputs.has(marker), `requiredPreWriteInputs missing ${marker}.`);
  }

  const shape = contract.futureFieldShape || {};
  assert(shape.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v1', 'Unexpected futureFieldShape contract.');
  assert(shape.defaultStatus === 'not_connected', 'Future default status must be not_connected.');
  const statuses = new Set(shape.allowedStatuses || []);
  for (const status of ['not_connected', 'sample_gate_passed_projection_only', 'stale', 'unavailable', 'contradicted']) {
    assert(statuses.has(status), `allowedStatuses missing ${status}.`);
  }
  assert(!statuses.has('confirmed'), 'allowedStatuses must not include confirmed.');
  assert(shape.displayMode === 'aggregate_source_health_only_no_headlines', 'Future shape display mode mismatch.');
  assert(shape.sampleGate?.minimumUsableSampleCount >= 8, 'Future sample gate must require at least 8 usable samples.');
  assert(shape.sampleGate?.minimumSelectedTimestampCount >= 2, 'Future sample gate must require at least 2 timestamps.');
  assert(shape.sampleGate?.minimumObservationWindowHours >= 24, 'Future sample gate must require at least 24 hours.');
  assert(shape.sampleGate?.requiresNoBlockers === true, 'Future sample gate must require no blockers.');
  assert(shape.sampleGate?.requiresNoRawTitleUrlBodyOrResponseExposure === true, 'Future sample gate must require no raw exposure.');
  assert(shape.sourceHealth?.usedForCurrentSignal === false, 'Future source health must not enhance current signal.');
  assert((shape.aggregate?.allowedFields || []).includes('bucketCounts'), 'Future aggregate shape must include bucketCounts.');
  assert((shape.aggregate?.allowedFields || []).includes('termCounts'), 'Future aggregate shape must include termCounts.');

  for (const [key, value] of Object.entries(contract.approvalState || {})) {
    assert(value === false, `approvalState.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(contract.productionImpact || {})) {
    assert(value === false, `productionImpact.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(contract.boundaries || {})) {
    assert(value === true, `boundaries.${key} must be true.`);
  }

  assert(contract.currentProductionState?.sourceCachesGdeltWebNgramsFallback === 'absent', 'Current production field must remain absent.');
  assert(contract.currentProductionState?.oilNewsCurrentSignalEnhancedByWebNgrams === false, 'Current signal must not be enhanced.');
  assert(contract.currentProductionState?.frontendDisplayConnected === false, 'Frontend must remain disconnected.');
  assert(contract.currentProductionState?.eligibleForScoring === false, 'Contract must remain non-scoring.');
  assert(contract.currentProductionState?.productionWriteApproved === false, 'Production write must remain unapproved.');
  assert(contract.nextAllowedStep === 'p53_display_only_fallback_disabled_writer_scaffold_no_production_write', 'Unexpected nextAllowedStep.');
  assertNoRawContentLeaks(contract);
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P52 writer-contract marker: ${marker}`);
    }
  }

  const oilNews = JSON.parse(readText('data/oil-news-event-watch.json'));
  assert(!oilNews.sourceCaches?.gdeltWebNgramsFallback, 'data/oil-news-event-watch.json must not contain sourceCaches.gdeltWebNgramsFallback.');
}

function assertAuthorityDocsAndPackage() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const oilNewsReview = readText('docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md');
  const gdeltPolicy = readText('docs/GDELT_SOURCE_POLICY.md');
  const packageJson = JSON.parse(readText('package.json'));

  for (const marker of [
    'gdelt-web-ngrams-display-fallback-writer-contract-design-p52',
    'display_only_fallback_writer_contract_design_no_production_write',
    'sourceCaches.gdeltWebNgramsFallback',
    'productionWriteApproved=false',
    'scoreApproved=false',
    'p53_display_only_fallback_disabled_writer_scaffold_no_production_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
    assert(oilNewsReview.includes(marker), `OIL_NEWS_EVENT_SOURCE_REVIEW missing marker: ${marker}`);
    assert(gdeltPolicy.includes(marker), `GDELT_SOURCE_POLICY missing marker: ${marker}`);
  }

  assert(
    packageJson.scripts['check:gdelt-web-ngrams-display-fallback-writer-contract-design'],
    'package.json missing P52 check script.'
  );
  assert(
    packageJson.scripts['check:all']?.includes('check:gdelt-web-ngrams-display-fallback-writer-contract-design'),
    'check:all missing P52 check.'
  );
}

function main() {
  assertDoc();
  assertFixture(JSON.parse(readText(FIXTURE)));
  assertRuntimeRemainsUnwired();
  assertAuthorityDocsAndPackage();
  console.log('GDELT Web NGrams display fallback writer contract design: PASS');
}

main();
