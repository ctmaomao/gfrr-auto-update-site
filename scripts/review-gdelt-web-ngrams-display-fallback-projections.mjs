#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'gdelt-web-ngrams-display-fallback-projection-review-p51';
const PROJECTION_VERSION = 'gdelt-web-ngrams-display-fallback-projection-p50';
const DEFAULT_INPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-review-latest.json';
const DEFAULT_MIN_PROJECTIONS = 1;
const NEXT_STEP = 'p52_display_only_fallback_writer_contract_design_no_production_write';
const BOUNDARY =
  'manual/local GDELT Web NGrams display fallback projection review only; not production data; not in current Oil News signal, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:gdelt-web-ngrams-display-fallback-projections -- [options]

Options:
  --input <path>            P50 display fallback projection artifact. May be repeated.
  --input-dir <path>        Directory of projection JSON artifacts. Files are read alphabetically.
  --min-projections <n>     Minimum usable projection count. Default: ${DEFAULT_MIN_PROJECTIONS}
  --output <path>           Ignored review artifact path. Default: ${DEFAULT_OUTPUT}
  --allow-empty             Exit 0 if no projection exists.
  --strict                  Exit non-zero on WARN or FAIL.
  --json                    Print full JSON review to stdout.
  --no-output               Do not write the ignored review artifact.
  --help                    Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    minProjections: DEFAULT_MIN_PROJECTIONS,
    output: DEFAULT_OUTPUT,
    allowEmpty: false,
    strict: false,
    printJson: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--input') options.inputs.push(nextValue());
    else if (arg === '--input-dir') options.inputDirs.push(nextValue());
    else if (arg === '--min-projections') options.minProjections = Number(nextValue());
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.minProjections) || options.minProjections < 1 || options.minProjections > 100) {
    throw new Error('Invalid --min-projections. Expected integer 1..100.');
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function expandInputFiles(options) {
  const files = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    if (!isSafeInputPath(inputDir)) {
      throw new Error(`Refusing to read directory outside manual-artifacts/ or docs/fixtures/: ${inputDir}`);
    }
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json')
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  if (!files.length && existsSync(resolve(DEFAULT_INPUT))) files.push(DEFAULT_INPUT);
  return [...new Set(files)];
}

function readInput(filePath) {
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing unsafe input path: ${filePath}`);
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  return {
    safePath: safeRelativePath(filePath),
    data: JSON.parse(readFileSync(resolve(filePath), 'utf8'))
  };
}

function allFalseEntries(value = {}) {
  return Object.entries(value).every(([, nested]) => nested === false);
}

function requiredBoundaryTrue(boundaries = {}) {
  return [
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
  ].every((key) => boundaries[key] === true);
}

function noRawContentMarkers(value) {
  const serialized = JSON.stringify(value || {}).toLowerCase();
  return ![
    'http://',
    'https://',
    '<html',
    '<!doctype',
    'article title',
    'article url',
    'article body',
    'rawresponse',
    'rawproviderresponse',
    'snippet',
    'authorization',
    'bearer '
  ].some((marker) => serialized.includes(marker));
}

function productionImpactFalseMap() {
  return {
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
  };
}

function approvalFalseMap() {
  return {
    productionWriteApproved: false,
    frontendApproved: false,
    workflowApproved: false,
    currentSignalEnhancementApproved: false,
    scoreApproved: false,
    odpFinalBiasApproved: false,
    brentPromotionApproved: false,
    globalRiskHeatmapApproved: false,
    crossValidationApproved: false
  };
}

function projectionBlockers(projection) {
  const blockers = [];
  const field = projection.projectedProductionField || {};
  const shape = field.projectedShape || {};
  const sampleGate = shape.sampleGate || {};
  if (projection.schemaVersion !== PROJECTION_VERSION) blockers.push('schema_version_invalid');
  if (projection.status !== 'display_only_fallback_projection_ready_no_production_write') blockers.push('status_invalid');
  if (projection.projectionState !== 'manual_projection_ready_for_separate_writer_contract_review') {
    blockers.push('projection_state_not_review_ready');
  }
  if (field.targetArtifact !== 'data/oil-news-event-watch.json') blockers.push('target_artifact_invalid');
  if (field.fieldPath !== 'sourceCaches.gdeltWebNgramsFallback') blockers.push('field_path_invalid');
  if (field.presentInProductionData !== false) blockers.push('field_already_present_in_production');
  if (field.writerApprovedByThisProjection !== false) blockers.push('writer_approved_by_projection');
  if (field.frontendApprovedByThisProjection !== false) blockers.push('frontend_approved_by_projection');
  if (field.workflowApprovedByThisProjection !== false) blockers.push('workflow_approved_by_projection');
  if (field.displayMode !== 'aggregate_source_health_only_no_headlines') blockers.push('display_mode_invalid');
  if (shape.currentSignalEnhancement !== false) blockers.push('current_signal_enhancement_claimed');
  if (shape.eventConfirmationSource !== false) blockers.push('event_confirmation_claimed');
  if (shape.headlineSource !== false) blockers.push('headline_source_claimed');
  if (shape.oilDirectionInput !== false) blockers.push('oil_direction_input_claimed');
  if (shape.sourceHealth?.usedForCurrentSignal !== false) blockers.push('source_health_current_signal_claimed');
  if (Number(sampleGate.usableSampleCount || 0) < 8) blockers.push('usable_sample_gate_not_met');
  if (Number(sampleGate.selectedTimestampCount || 0) < 2) blockers.push('selected_timestamp_gate_not_met');
  if (Number(sampleGate.observationWindowHours || 0) < 24) blockers.push('observation_window_gate_not_met');
  if (!allFalseEntries(projection.approvals || {})) blockers.push('approval_claimed');
  if (!allFalseEntries(projection.productionImpact || {})) blockers.push('production_impact_claimed');
  if (!requiredBoundaryTrue(projection.boundaries || {})) blockers.push('boundary_missing');
  if (projection.nextAllowedStep !== 'p51_display_only_fallback_projection_review_no_production_write') {
    blockers.push('unexpected_next_step');
  }
  if (!noRawContentMarkers(projection)) blockers.push('raw_content_marker_detected');
  return blockers;
}

function summarizeProjection(input) {
  const projection = input.data;
  const blockers = projectionBlockers(projection);
  const sampleGate = projection.projectedProductionField?.projectedShape?.sampleGate || {};
  const aggregate = projection.projectedProductionField?.projectedShape?.aggregate || {};
  const bucketCounts = aggregate.bucketCounts || {};
  return {
    projectionId: shortHash({ sourcePath: input.safePath, generatedAt: projection.generatedAt }),
    sourcePath: input.safePath,
    generatedAt: projection.generatedAt || null,
    status: projection.status || null,
    projectionState: projection.projectionState || null,
    usable: blockers.length === 0,
    blockers,
    collectorRunId: sampleGate.collectorRunId || null,
    usableSampleCount: Number(sampleGate.usableSampleCount || 0),
    selectedTimestampCount: Number(sampleGate.selectedTimestampCount || 0),
    observationWindowHours: Number(sampleGate.observationWindowHours || 0),
    latestSelectedTimestamp: sampleGate.latestSelectedTimestamp || null,
    warningCount: Number(sampleGate.warningCount || 0),
    bucketCounts: Object.fromEntries(
      Object.entries(bucketCounts).map(([bucket, value]) => [
        bucket,
        {
          sampleHitCount: Number(value?.sampleHitCount || 0),
          totalCount: Number(value?.totalCount || 0)
        }
      ])
    ),
    termCount: Array.isArray(aggregate.termCounts) ? aggregate.termCounts.length : 0
  };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key] || 'unknown'] = (counts[item[key] || 'unknown'] || 0) + 1;
  return counts;
}

function buildBucketCoverage(projections) {
  const coverage = {};
  for (const projection of projections.filter((item) => item.usable)) {
    for (const [bucket, value] of Object.entries(projection.bucketCounts)) {
      if (!coverage[bucket]) coverage[bucket] = { projectionHitCount: 0, maxSampleHitCount: 0, totalCount: 0 };
      if (value.sampleHitCount > 0) coverage[bucket].projectionHitCount += 1;
      coverage[bucket].maxSampleHitCount = Math.max(coverage[bucket].maxSampleHitCount, value.sampleHitCount);
      coverage[bucket].totalCount += value.totalCount;
    }
  }
  return coverage;
}

function buildReview(inputs, options) {
  const projections = inputs.map(summarizeProjection);
  const usableProjections = projections.filter((projection) => projection.usable);
  const blockers = projections.flatMap((projection) => projection.blockers.map((reason) => ({
    projectionId: projection.projectionId,
    reason
  })));
  const warnings = [];
  if (usableProjections.length < options.minProjections) warnings.push('collect_more_usable_display_fallback_projections');

  let status = 'warn';
  let reviewState = 'display_fallback_projection_review_waiting_for_more_samples_no_production_write';
  let recommendation = 'collect_more_projection_artifacts_keep_non_production';
  if (blockers.length > 0) {
    status = 'fail';
    reviewState = 'display_fallback_projection_review_blocked_no_production_write';
    recommendation = 'operator_cleanup_required_keep_non_production';
  } else if (warnings.length === 0) {
    status = 'pass';
    reviewState = 'display_fallback_projection_review_passed_no_production_write';
    recommendation = 'ready_for_p52_writer_contract_design_keep_non_production';
  }

  return {
    schemaVersion: REVIEW_VERSION,
    status,
    reviewState,
    recommendation,
    generatedAt: new Date().toISOString(),
    minProjections: options.minProjections,
    inputCount: inputs.length,
    projectionCount: projections.length,
    usableProjectionCount: usableProjections.length,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    approvalState: {
      projectionReviewPassed: status === 'pass',
      readyForWriterContractDesignReview: status === 'pass',
      productionWriteApproved: false,
      frontendApproved: false,
      workflowApproved: false,
      currentSignalEnhancementApproved: false,
      scoreApproved: false
    },
    approvals: approvalFalseMap(),
    currentProductionState: {
      sourceCachesGdeltWebNgramsFallback: 'absent',
      oilNewsCurrentSignalEnhancedByWebNgrams: false,
      frontendDisplayConnected: false,
      eligibleForScoring: false
    },
    projectionStateCounts: countBy(projections, 'projectionState'),
    aggregate: {
      maxUsableSampleCount: Math.max(0, ...usableProjections.map((item) => item.usableSampleCount)),
      maxSelectedTimestampCount: Math.max(0, ...usableProjections.map((item) => item.selectedTimestampCount)),
      maxObservationWindowHours: Math.max(0, ...usableProjections.map((item) => item.observationWindowHours)),
      latestSelectedTimestamp: usableProjections.map((item) => item.latestSelectedTimestamp).filter(Boolean).sort().at(-1) || null,
      bucketCoverage: buildBucketCoverage(projections)
    },
    projections,
    blockers,
    warnings,
    productionImpact: productionImpactFalseMap(),
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
      displayProjectionReviewOnly: true
    },
    nextAllowedStep: NEXT_STEP,
    boundary: BOUNDARY
  };
}

function buildEmptyReview(options) {
  return {
    schemaVersion: REVIEW_VERSION,
    status: options.allowEmpty ? 'empty' : 'fail',
    reviewState: 'display_fallback_projection_review_empty_no_production_write',
    recommendation: 'provide_projection_artifacts_under_manual_artifacts',
    generatedAt: new Date().toISOString(),
    minProjections: options.minProjections,
    inputCount: 0,
    projectionCount: 0,
    usableProjectionCount: 0,
    blockerCount: 0,
    warningCount: 0,
    approvalState: {
      projectionReviewPassed: false,
      readyForWriterContractDesignReview: false,
      productionWriteApproved: false,
      frontendApproved: false,
      workflowApproved: false,
      currentSignalEnhancementApproved: false,
      scoreApproved: false
    },
    approvals: approvalFalseMap(),
    currentProductionState: {
      sourceCachesGdeltWebNgramsFallback: 'absent',
      oilNewsCurrentSignalEnhancedByWebNgrams: false,
      frontendDisplayConnected: false,
      eligibleForScoring: false
    },
    productionImpact: productionImpactFalseMap(),
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
      displayProjectionReviewOnly: true
    },
    nextAllowedStep: NEXT_STEP,
    boundary: BOUNDARY
  };
}

function printSummary(review) {
  console.log(`GDELT Web NGrams display fallback projection review: ${review.status}`);
  console.log(`reviewState: ${review.reviewState}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`projectionCount: ${review.projectionCount}`);
  console.log(`usableProjectionCount: ${review.usableProjectionCount}`);
  console.log(`productionWriteApproved: ${review.approvalState.productionWriteApproved}`);
  console.log(`nextAllowedStep: ${review.nextAllowedStep}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputFiles = expandInputFiles(options);
    const review = inputFiles.length > 0
      ? buildReview(inputFiles.map(readInput), options)
      : buildEmptyReview(options);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
    if (options.strict && ['warn', 'fail'].includes(review.status)) process.exitCode = 1;
    if (!options.allowEmpty && inputFiles.length === 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
