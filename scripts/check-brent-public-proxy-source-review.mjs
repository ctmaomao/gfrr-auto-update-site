import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_DOC = 'docs/BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md';
const REVIEW_FIXTURE = 'docs/fixtures/brent-public-proxy-source-review-v28.0M-71.json';

const RUNTIME_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/render.js'
];

const REQUIRED_DOC_PHRASES = [
  'Review only',
  'No live fetch',
  'No production source approval',
  'No production data write',
  'No workflow change',
  'No frontend change',
  'No Worker runtime change',
  'No Brent promotion change',
  'Platts Dated Brent / 正式 Dated Brent',
  'EIA Europe Brent Spot Price FOB',
  'ICE Brent Crude Futures',
  'Baltic Exchange freight benchmarks',
  'Freightos Baltic Index',
  'S&P Global Commodity Insights / Platts',
  'sourceApproved=false',
  'liveFetchApproved=false',
  'productionDataWriteApproved=false',
  'Formal Platts Dated Brent remains future licensed source only',
  'v28.0M-72 Brent public proxy proof-of-source design - No live fetch / no production data write'
];

const REQUIRED_SOURCE_KEYS = new Set([
  'eia_europe_brent_spot_fob',
  'ice_brent_futures_curve',
  'baltic_exchange_freight_benchmarks',
  'freightos_baltic_index',
  'sp_global_platts_dated_brent'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'eia_europe_brent_spot_fob',
  'ice_brent_futures_curve',
  'baltic_exchange_freight_benchmarks',
  'freightos_baltic_index',
  'sp_global_platts_dated_brent',
  'BRENT_PUBLIC_PROXY_SOURCE_REVIEW',
  'officialDatedBrentConnected'
];

const FORBIDDEN_APPROVAL_PATTERNS = [
  /sourceApproved\s*[:=]\s*true/i,
  /liveFetchApproved\s*[:=]\s*true/i,
  /productionDataWriteApproved\s*[:=]\s*true/i,
  /brentPromotionApproved\s*[:=]\s*true/i,
  /officialDatedBrentConnected\s*[:=]\s*true/i,
  /formalPlattsDatedBrentConnected\s*[:=]\s*true/i
];

const FORBIDDEN_CONNECTED_CLAIMS = [
  'Platts Dated Brent 已接入',
  '真实 Dated Brent 已接入',
  '正式 Dated Brent 已接入'
];

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDesignDoc() {
  assert(fs.existsSync(absolute(REVIEW_DOC)), 'Brent public proxy source review doc is missing.');
  const doc = readText(REVIEW_DOC);
  const docLower = doc.toLowerCase();

  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(
      docLower.includes(phrase.toLowerCase()),
      `Review doc missing required phrase: ${phrase}`
    );
  }

  for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
    assert(!pattern.test(doc), `Review doc contains forbidden approval pattern: ${pattern}`);
  }

  for (const claim of FORBIDDEN_CONNECTED_CLAIMS) {
    assert(!doc.includes(claim), `Review doc contains forbidden connected claim: ${claim}`);
  }
}

function assertReviewFixture() {
  assert(fs.existsSync(absolute(REVIEW_FIXTURE)), 'Brent public proxy source review fixture is missing.');
  const fixtureText = readText(REVIEW_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(
    fixture.contractVersion === 'v28.0M-71-brent-public-proxy-source-review-1',
    'Unexpected fixture contractVersion.'
  );
  assert(fixture.kind === 'brent_public_proxy_source_review', 'Unexpected fixture kind.');
  assert(fixture.status === 'review_only_no_source_approved', 'Unexpected fixture status.');

  const topLevelFalseFields = [
    'sourceSelectionFinalized',
    'liveFetchApproved',
    'productionDataWriteApproved',
    'realtimeWriteApproved',
    'workflowAutomationApproved',
    'frontendDisplayApproved',
    'brentPromotionApproved',
    'officialDatedBrentConnected',
    'formalPlattsDatedBrentConnected'
  ];

  for (const field of topLevelFalseFields) {
    assert(fixture[field] === false, `${field} must be false.`);
  }

  assert(Array.isArray(fixture.candidateSources), 'candidateSources must be an array.');
  const sourceKeys = new Set(fixture.candidateSources.map((source) => source.sourceKey));
  for (const sourceKey of REQUIRED_SOURCE_KEYS) {
    assert(sourceKeys.has(sourceKey), `Missing candidate source: ${sourceKey}`);
  }

  for (const source of fixture.candidateSources) {
    assert(source.sourceApproved === false, `${source.sourceKey}.sourceApproved must be false.`);
    assert(source.liveFetchApproved === false, `${source.sourceKey}.liveFetchApproved must be false.`);
    assert(
      source.productionWriteApproved === false,
      `${source.sourceKey}.productionWriteApproved must be false.`
    );
    assert(source.officialDatedBrent === false, `${source.sourceKey}.officialDatedBrent must be false.`);
  }

  const boundaries = fixture.boundaries || {};
  const requiredTrueBoundaries = [
    'reviewOnly',
    'noLiveFetch',
    'noProductionWrite',
    'noRealtimeWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange'
  ];
  const requiredFalseBoundaries = [
    'affectsValuesBrent',
    'affectsBrentPromotion',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsActionQueue',
    'affectsTriggerMonitor',
    'affectsInvalidationRules'
  ];

  for (const field of requiredTrueBoundaries) {
    assert(boundaries[field] === true, `boundaries.${field} must be true.`);
  }
  for (const field of requiredFalseBoundaries) {
    assert(boundaries[field] === false, `boundaries.${field} must be false.`);
  }

  assert(
    fixture.nextAllowedStep === 'brent_public_proxy_proof_of_source_design_no_live_fetch_no_production_data_write',
    'Unexpected nextAllowedStep.'
  );

  for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
    assert(!pattern.test(fixtureText), `Fixture contains forbidden approval pattern: ${pattern}`);
  }
  for (const claim of FORBIDDEN_CONNECTED_CLAIMS) {
    assert(!fixtureText.includes(claim), `Fixture contains forbidden connected claim: ${claim}`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(
        !source.includes(marker),
        `${relativePath} contains source-review marker and may have wired M-71 into runtime: ${marker}`
      );
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/PROJECT_BACKLOG.md');
  const index = readText('docs/INDEX.md');

  const dataSourceMarkers = [
    'M-71 public proxy source review',
    'EIA Europe Brent Spot Price FOB',
    'ICE Brent futures curve',
    'Baltic Exchange freight benchmarks',
    'Freightos Baltic Index',
    'S&P / Platts Dated Brent'
  ];
  for (const marker of dataSourceMarkers) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing M-71 marker: ${marker}`);
  }

  const signalMarkers = [
    'M-71 public proxy source review',
    'Brent term structure',
    'Shipping / freight stress',
    'Level 1/2 source-review candidate'
  ];
  for (const marker of signalMarkers) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing M-71 marker: ${marker}`);
  }

  assert(
    backlog.includes('M-71 Brent public proxy source review'),
    'PROJECT_BACKLOG missing M-71 completion marker.'
  );
  assert(
    index.includes('docs/BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md'),
    'INDEX missing Brent public proxy source review doc.'
  );
}

function main() {
  assertDesignDoc();
  assertReviewFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Brent public proxy source review: PASS');
}

main();
