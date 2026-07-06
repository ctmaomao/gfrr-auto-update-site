#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const READINESS_VERSION = 'gdelt-web-ngrams-display-fallback-production-write-readiness-p55';
const REVIEW_VERSION = 'gdelt-web-ngrams-display-fallback-disabled-writer-review-p54';
const PROJECTION_VERSION = 'gdelt-web-ngrams-display-fallback-disabled-writer-p53';
const FUTURE_CACHE_VERSION = 'gdelt-web-ngrams-display-fallback-cache-v1';
const DEFAULT_REVIEW = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-review-p54.json';
const DEFAULT_PROJECTION = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-p53.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-production-write-readiness-latest.json';
const BOUNDARY =
  'manual/local GDELT Web NGrams display fallback production-write readiness gate; no production write by this gate; P56 scope only; not in current Oil News signal, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:gdelt-web-ngrams-display-fallback-production-write-readiness -- [options]

Options:
  --review <path>       P54 disabled writer review. Default: ${DEFAULT_REVIEW}
  --projection <path>   P53 disabled writer projection. Default: ${DEFAULT_PROJECTION}
  --output <path>       Ignored manual artifact path. Default: ${DEFAULT_OUTPUT}
  --generated-at <iso>  Deterministic generatedAt for fixtures/checks.
  --no-output           Do not write the ignored artifact.
  --json                Print full JSON review to stdout.
  --strict              Exit non-zero unless readiness passes.
  --help                Show this help.`);
}

function parseArgs(argv) {
  const options = {
    review: DEFAULT_REVIEW,
    projection: DEFAULT_PROJECTION,
    output: DEFAULT_OUTPUT,
    generatedAt: null,
    writeOutput: true,
    printJson: false,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--review') options.review = nextValue();
    else if (arg === '--projection') options.projection = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--generated-at') options.generatedAt = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [label, value] of [['review', options.review], ['projection', options.projection]]) {
    if (!isSafeInputPath(value)) throw new Error(`Refusing to read ${label} outside manual-artifacts/ or docs/fixtures/: ${value}`);
  }
  if (options.generatedAt && Number.isNaN(Date.parse(options.generatedAt))) {
    throw new Error(`Invalid --generated-at ISO timestamp: ${options.generatedAt}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write readiness gate outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function safeRelativePath(filePath) {
  const abs = resolve(filePath);
  const rel = relative(process.cwd(), abs);
  if (rel === '' || rel.startsWith('..')) return null;
  return rel.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/') === true;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function readJson(filePath) {
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  return JSON.parse(readFileSync(resolve(filePath), 'utf8'));
}

function hashObject(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function allFalse(record, allowedTrue = new Set()) {
  return Object.entries(record || {}).every(([key, value]) => (allowedTrue.has(key) ? value === true : value === false));
}

function validateReview(review) {
  const blockers = [];
  if (review.schemaVersion !== REVIEW_VERSION) blockers.push(`unexpected_review_schema:${review.schemaVersion}`);
  if (review.status !== 'pass') blockers.push(`review_not_pass:${review.status}`);
  if (review.reviewState !== 'disabled_writer_scaffold_review_passed_no_production_write') {
    blockers.push(`unexpected_review_state:${review.reviewState}`);
  }
  if (review.usableProjectionCount < 1) blockers.push('no_usable_disabled_projection');
  if (review.blockerCount !== 0) blockers.push('review_has_blockers');
  if (!allFalse(review.approvalState, new Set(['disabledWriterReviewPassed', 'readyForProductionWriteReadinessGate']))) {
    blockers.push('review_approval_state_invalid');
  }
  if (!allFalse(review.approvals)) blockers.push('review_approvals_not_false');
  if (!allFalse(review.productionImpact)) blockers.push('review_production_impact_not_false');
  if (review.currentProductionState?.sourceCachesGdeltWebNgramsFallback !== 'absent') blockers.push('review_future_field_not_absent');
  if ((review.aggregate?.maxUsableSampleCount || 0) < 8) blockers.push('review_sample_gate_insufficient');
  if ((review.aggregate?.maxSelectedTimestampCount || 0) < 2) blockers.push('review_timestamp_gate_insufficient');
  if ((review.aggregate?.maxObservationWindowHours || 0) < 24) blockers.push('review_observation_window_insufficient');
  return blockers;
}

function validateProjection(projection) {
  const blockers = [];
  if (projection.schemaVersion !== PROJECTION_VERSION) blockers.push(`unexpected_projection_schema:${projection.schemaVersion}`);
  if (projection.status !== 'disabled_no_production_write') blockers.push(`projection_not_disabled:${projection.status}`);
  if (projection.writerState !== 'disabled_scaffold_no_production_write') blockers.push(`unexpected_writer_state:${projection.writerState}`);
  if (projection.productionWriteAttempted !== false || projection.productionWriteApproved !== false) blockers.push('projection_attempted_or_approved_write');
  if (projection.futureProductionField?.fieldPath !== 'sourceCaches.gdeltWebNgramsFallback') blockers.push('unexpected_projection_field');
  if (projection.futureProductionField?.presentInProductionData !== false) blockers.push('projection_field_not_absent');
  if (projection.candidateCache?.contractVersion !== FUTURE_CACHE_VERSION) blockers.push('unexpected_candidate_cache_contract');
  if (projection.candidateCache?.status !== 'sample_gate_passed_projection_only') blockers.push('unexpected_candidate_cache_status');
  if (projection.candidateCache?.currentSignalEnhancement !== false) blockers.push('candidate_current_signal_not_false');
  if (projection.candidateCache?.sourceHealth?.usedForCurrentSignal !== false) blockers.push('candidate_source_health_current_signal');
  if ((projection.candidateCache?.sampleGate?.usableSampleCount || 0) < 8) blockers.push('candidate_sample_gate_insufficient');
  if (!allFalse(projection.approvals)) blockers.push('projection_approvals_not_false');
  if (!allFalse(projection.productionImpact)) blockers.push('projection_production_impact_not_false');
  return blockers;
}

function buildReadiness({ options, review, projection }) {
  const blockers = [
    ...validateReview(review).map((blocker) => `p54:${blocker}`),
    ...validateProjection(projection).map((blocker) => `p53:${blocker}`)
  ];
  const status = blockers.length === 0
    ? 'production_display_only_write_ready_no_production_write'
    : 'production_display_only_write_not_ready_keep_manual_only';
  const ready = blockers.length === 0;
  return {
    schemaVersion: READINESS_VERSION,
    status,
    readinessState: ready ? 'p56_display_only_write_authorized' : 'p56_display_only_write_blocked',
    recommendation: ready
      ? 'proceed_to_p56_production_display_only_write_with_scoped_guard'
      : 'keep_disabled_writer_manual_only',
    generatedAt: options.generatedAt || new Date().toISOString(),
    inputs: {
      disabledWriterReview: {
        sourcePath: safeRelativePath(options.review),
        artifactHash: hashObject(review),
        schemaVersion: review.schemaVersion,
        reviewState: review.reviewState,
        status: review.status
      },
      disabledWriterProjection: {
        sourcePath: safeRelativePath(options.projection),
        artifactHash: hashObject(projection),
        schemaVersion: projection.schemaVersion,
        status: projection.status,
        writerState: projection.writerState
      }
    },
    approvedWriteScope: {
      targetArtifact: 'data/oil-news-event-watch.json',
      fieldPath: 'sourceCaches.gdeltWebNgramsFallback',
      contractVersion: FUTURE_CACHE_VERSION,
      allowedWriteMode: 'single_field_display_only_cache',
      allowedSource: 'p53_candidateCache_after_p54_review',
      allowedWriter: 'scripts/oil-directional/build-oil-news-event-watch.mjs may attach compact cache from reviewed fixtures',
      preserveExistingOilNewsFields: true,
      displayMode: 'aggregate_source_health_only_no_headlines',
      currentSignalEnhancement: false,
      eventConfirmationSource: false,
      headlineSource: false,
      oilDirectionInput: false,
      eligibleForScoring: false,
      rawContentAllowed: false,
      productionFieldMayBeStale: true
    },
    candidateCache: clone(projection.candidateCache),
    currentProductionState: {
      sourceCachesGdeltWebNgramsFallback: 'prewrite_absent',
      oilNewsCurrentSignalEnhancedByWebNgrams: false,
      frontendDisplayConnected: false,
      eligibleForScoring: false
    },
    approvalState: {
      readinessGatePassed: ready,
      p56ProductionDataWriteApproved: ready,
      p56ProductionWriteApproved: ready,
      p56WriterImplementationApproved: ready,
      p56ScopedFieldOnly: ready,
      frontendImplementationApproved: false,
      workflowAutomationApproved: false,
      liveFetchApproved: false,
      apiKeyReadApproved: false,
      currentSignalEnhancementApproved: false,
      scoreApproved: false,
      mainScoreApproved: false,
      odpFinalBiasApproved: false,
      brentPromotionApproved: false,
      globalRiskHeatmapApproved: false,
      crossValidationApproved: false
    },
    p55ProductionImpact: {
      writesProductionData: false,
      addsWorkflow: false,
      changesFrontend: false,
      changesOilNewsCurrentSignal: false,
      changesOdpBuild: false,
      changesFinalBias: false,
      changesValues: false,
      changesScoring: false,
      changesDecision: false,
      changesExecution: false,
      changesPosition: false,
      changesBrentPromotion: false,
      changesGlobalRiskHeatmap: false,
      changesCrossValidation: false
    },
    p56AuthorizedImpact: {
      writesProductionData: ready,
      targetArtifact: 'data/oil-news-event-watch.json',
      fieldPath: 'sourceCaches.gdeltWebNgramsFallback',
      displayOnly: true,
      changesFrontend: false,
      changesOilNewsCurrentSignal: false,
      changesOdpBuild: false,
      changesScoring: false
    },
    blockers,
    blockerCount: blockers.length,
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWriteByThisGate: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      noRawProviderResponseStored: true,
      notProductionData: true,
      readinessGateOnly: true
    },
    nextAllowedStep: 'p56_display_only_fallback_production_display_write',
    boundary: BOUNDARY
  };
}

function writeJson(filePath, value) {
  const outputPath = resolve(filePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const review = readJson(options.review);
  const projection = readJson(options.projection);
  const readiness = buildReadiness({ options, review, projection });
  if (options.strict && readiness.status !== 'production_display_only_write_ready_no_production_write') {
    throw new Error(`Production write readiness failed: ${readiness.blockers.join('; ')}`);
  }
  if (options.writeOutput) writeJson(options.output, readiness);
  if (options.printJson) console.log(JSON.stringify(readiness, null, 2));
  else {
    console.log(`GDELT Web NGrams display fallback production write readiness: ${readiness.status}`);
    console.log(`readinessState: ${readiness.readinessState}`);
    console.log(`blockers: ${readiness.blockerCount}`);
    console.log(`nextAllowedStep: ${readiness.nextAllowedStep}`);
  }
}

main();
