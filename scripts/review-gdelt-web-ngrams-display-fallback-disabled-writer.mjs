#!/usr/bin/env node
import { isManualArtifactPath, readJson, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import process from 'node:process';

const REVIEW_VERSION = 'gdelt-web-ngrams-display-fallback-disabled-writer-review-p54';
const PROJECTION_VERSION = 'gdelt-web-ngrams-display-fallback-disabled-writer-p53';
const FUTURE_CACHE_VERSION = 'gdelt-web-ngrams-display-fallback-cache-v1';
const DEFAULT_INPUT = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-p53.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-review-latest.json';
const BOUNDARY =
  'manual/local GDELT Web NGrams disabled writer scaffold review only; not production data; not in current Oil News signal, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:gdelt-web-ngrams-display-fallback-disabled-writer -- [options]

Options:
  --input <path>        P53 disabled writer projection. Repeatable. Default: ${DEFAULT_INPUT}
  --output <path>       Ignored manual artifact path. Default: ${DEFAULT_OUTPUT}
  --generated-at <iso>  Deterministic generatedAt for fixtures/checks.
  --min-projections <n> Minimum valid projections required. Default: 1
  --no-output           Do not write the ignored artifact.
  --json                Print full JSON review to stdout.
  --strict              Exit non-zero unless review passes.
  --help                Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    output: DEFAULT_OUTPUT,
    generatedAt: null,
    minProjections: 1,
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
    if (arg === '--input') options.inputs.push(nextValue());
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--generated-at') options.generatedAt = nextValue();
    else if (arg === '--min-projections') options.minProjections = Number(nextValue());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.inputs.length === 0) options.inputs.push(DEFAULT_INPUT);
  if (!Number.isInteger(options.minProjections) || options.minProjections < 1) {
    throw new Error('Invalid --min-projections. Expected integer >= 1.');
  }
  if (options.generatedAt && Number.isNaN(Date.parse(options.generatedAt))) {
    throw new Error(`Invalid --generated-at ISO timestamp: ${options.generatedAt}`);
  }
  for (const input of options.inputs) {
    if (!isSafeInputPath(input)) throw new Error(`Refusing to read input outside manual-artifacts/ or docs/fixtures/: ${input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write disabled writer review outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function allFalse(record) {
  return Object.values(record || {}).every((value) => value === false);
}

function falseImpactMap() {
  return {
    writesProductionData: false,
    addsWriter: false,
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
  };
}

function validateProjection(projection) {
  const blockers = [];
  const warnings = [];
  const addBlocker = (message) => blockers.push(message);

  if (projection.schemaVersion !== PROJECTION_VERSION) addBlocker(`unexpected_schema:${projection.schemaVersion}`);
  if (projection.status !== 'disabled_no_production_write') addBlocker(`unexpected_status:${projection.status}`);
  if (projection.writerState !== 'disabled_scaffold_no_production_write') addBlocker(`unexpected_writer_state:${projection.writerState}`);
  if (projection.writeMode !== 'manual_artifact_only') addBlocker(`unexpected_write_mode:${projection.writeMode}`);
  if (projection.productionWriteAttempted !== false) addBlocker('production_write_attempted');
  if (projection.productionWriteApproved !== false) addBlocker('production_write_approved');
  if (projection.futureProductionField?.fieldPath !== 'sourceCaches.gdeltWebNgramsFallback') addBlocker('unexpected_future_field');
  if (projection.futureProductionField?.presentInProductionData !== false) addBlocker('future_field_not_absent');
  if (projection.candidateCache?.contractVersion !== FUTURE_CACHE_VERSION) addBlocker('unexpected_cache_contract');
  if (projection.candidateCache?.status !== 'sample_gate_passed_projection_only') addBlocker('unexpected_candidate_cache_status');
  if (projection.candidateCache?.displayMode !== 'aggregate_source_health_only_no_headlines') addBlocker('unexpected_display_mode');
  if (projection.candidateCache?.currentSignalEnhancement !== false) addBlocker('current_signal_enhancement_not_false');
  if (projection.candidateCache?.eventConfirmationSource !== false) addBlocker('event_confirmation_not_false');
  if (projection.candidateCache?.headlineSource !== false) addBlocker('headline_source_not_false');
  if (projection.candidateCache?.oilDirectionInput !== false) addBlocker('oil_direction_input_not_false');
  if (projection.candidateCache?.eligibleForScoring !== false) addBlocker('eligible_for_scoring_not_false');
  if (projection.candidateCache?.sourceHealth?.usedForCurrentSignal !== false) addBlocker('source_health_used_for_current_signal');
  if ((projection.candidateCache?.sampleGate?.usableSampleCount || 0) < 8) addBlocker('usable_sample_gate_insufficient');
  if ((projection.candidateCache?.sampleGate?.selectedTimestampCount || 0) < 2) addBlocker('selected_timestamp_gate_insufficient');
  if ((projection.candidateCache?.sampleGate?.observationWindowHours || 0) < 24) addBlocker('observation_window_gate_insufficient');
  if (projection.currentProductionState?.sourceCachesGdeltWebNgramsFallback !== 'absent') addBlocker('current_production_field_not_absent');
  if (!allFalse(projection.approvals)) addBlocker('approval_not_false');
  if (!allFalse(projection.productionImpact)) addBlocker('production_impact_not_false');
  if (projection.boundaries?.noProductionWrite !== true) addBlocker('missing_no_production_write_boundary');
  if (projection.boundaries?.notProductionData !== true) addBlocker('missing_not_production_data_boundary');

  const serialized = JSON.stringify(projection).toLowerCase();
  for (const marker of ['http://', 'https://', '<html', '<!doctype', 'article title', 'article url', 'article body', 'rawresponse']) {
    if (serialized.includes(marker)) addBlocker(`raw_content_marker:${marker}`);
  }
  if ((projection.candidateCache?.sampleGate?.warningCount || 0) > 0) {
    warnings.push('sample_gate_passed_with_non_blocking_warning');
  }
  return { blockers, warnings };
}

function buildProjectionSummary({ projection, sourcePath, validation }) {
  return {
    sourcePath: safeRelativePath(sourcePath),
    artifactHash: shortHash(projection),
    schemaVersion: projection.schemaVersion,
    status: projection.status,
    writerState: projection.writerState,
    usable: validation.blockers.length === 0,
    blockerCount: validation.blockers.length,
    warningCount: validation.warnings.length,
    usableSampleCount: projection.candidateCache?.sampleGate?.usableSampleCount || 0,
    selectedTimestampCount: projection.candidateCache?.sampleGate?.selectedTimestampCount || 0,
    observationWindowHours: projection.candidateCache?.sampleGate?.observationWindowHours || 0,
    latestSelectedTimestamp: projection.candidateCache?.sampleGate?.latestSelectedTimestamp || null,
    bucketCounts: projection.candidateCache?.aggregate?.bucketCounts || {},
    termCount: Array.isArray(projection.candidateCache?.aggregate?.termCounts)
      ? projection.candidateCache.aggregate.termCounts.length
      : 0,
    blockers: validation.blockers,
    warnings: validation.warnings
  };
}

function buildReview({ options, loaded }) {
  const projections = loaded.map(({ sourcePath, projection }) => {
    const validation = validateProjection(projection);
    return buildProjectionSummary({ projection, sourcePath, validation });
  });
  const usable = projections.filter((projection) => projection.usable);
  const blockers = projections.flatMap((projection) => projection.blockers.map((blocker) => `${projection.sourcePath}:${blocker}`));
  if (usable.length < options.minProjections) blockers.push(`usable_projection_count_below_min:${usable.length}/${options.minProjections}`);
  const status = blockers.length === 0 ? 'pass' : 'fail';
  const aggregate = {
    maxUsableSampleCount: Math.max(0, ...projections.map((projection) => projection.usableSampleCount)),
    maxSelectedTimestampCount: Math.max(0, ...projections.map((projection) => projection.selectedTimestampCount)),
    maxObservationWindowHours: Math.max(0, ...projections.map((projection) => projection.observationWindowHours)),
    latestSelectedTimestamp: projections.map((projection) => projection.latestSelectedTimestamp).filter(Boolean).sort().at(-1) || null
  };
  return {
    schemaVersion: REVIEW_VERSION,
    status,
    reviewState: status === 'pass'
      ? 'disabled_writer_scaffold_review_passed_no_production_write'
      : 'disabled_writer_scaffold_review_failed_keep_manual_only',
    recommendation: status === 'pass'
      ? 'ready_for_p55_production_write_readiness_gate_keep_non_production'
      : 'keep_disabled_writer_manual_only',
    generatedAt: options.generatedAt || new Date().toISOString(),
    minProjections: options.minProjections,
    inputCount: loaded.length,
    projectionCount: projections.length,
    usableProjectionCount: usable.length,
    blockerCount: blockers.length,
    warningCount: projections.reduce((sum, projection) => sum + projection.warningCount, 0),
    approvalState: {
      disabledWriterReviewPassed: status === 'pass',
      readyForProductionWriteReadinessGate: status === 'pass',
      productionDataWriteApproved: false,
      productionWriteApproved: false,
      writerImplementationApproved: false,
      frontendImplementationApproved: false,
      workflowAutomationApproved: false,
      currentSignalEnhancementApproved: false,
      scoreApproved: false
    },
    approvals: {
      productionDataWriteApproved: false,
      productionWriteApproved: false,
      writerImplementationApproved: false,
      frontendApproved: false,
      workflowApproved: false,
      currentSignalEnhancementApproved: false,
      scoreApproved: false,
      odpFinalBiasApproved: false,
      brentPromotionApproved: false,
      globalRiskHeatmapApproved: false,
      crossValidationApproved: false
    },
    currentProductionState: {
      sourceCachesGdeltWebNgramsFallback: 'absent',
      oilNewsCurrentSignalEnhancedByWebNgrams: false,
      frontendDisplayConnected: false,
      eligibleForScoring: false
    },
    aggregate,
    projections,
    blockers,
    productionImpact: falseImpactMap(),
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      noRawProviderResponseStored: true,
      notProductionData: true,
      disabledWriterScaffoldReviewOnly: true
    },
    nextAllowedStep: 'p55_display_only_fallback_production_write_readiness_gate_no_production_write',
    boundary: BOUNDARY
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const loaded = options.inputs.map((sourcePath) => ({ sourcePath, projection: readJson(sourcePath) }));
  const review = buildReview({ options, loaded });
  if (options.strict && review.status !== 'pass') {
    throw new Error(`Disabled writer scaffold review failed: ${review.blockers.join('; ')}`);
  }
  if (options.writeOutput) writeJson(options.output, review);
  if (options.printJson) console.log(JSON.stringify(review, null, 2));
  else {
    console.log(`GDELT Web NGrams display fallback disabled writer review: ${review.status.toUpperCase()}`);
    console.log(`recommendation: ${review.recommendation}`);
    console.log(`usableProjectionCount: ${review.usableProjectionCount}`);
    console.log(`warnings: ${review.warningCount}`);
    console.log(`blockers: ${review.blockerCount}`);
  }
}

main();
