#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'gdelt-web-ngrams-display-fallback-projection-p50';
const INPUT_SCHEMA = 'gdelt-web-ngrams-fallback-gate-review-p49';
const DEFAULT_INPUT = 'docs/fixtures/oil-news/gdelt-web-ngrams-fallback-gate-review-p49.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-latest.json';
const BOUNDARY =
  'dry-run-only GDELT Web NGrams display fallback projection; not production data; no frontend implementation; not in current Oil News signal, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run project:gdelt-web-ngrams-display-fallback-projection -- [options]

Options:
  --input <path>   P49 fallback gate review artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored display fallback projection artifact. Default: ${DEFAULT_OUTPUT}
  --no-output      Do not write the projection artifact.
  --json           Print full projection JSON.
  --strict         Exit non-zero unless projection is ready.
  --help           Show this help.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    writeOutput: true,
    printJson: false,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
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
    if (arg === '--input') {
      options.input = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!isSafeInputPath(options.input)) throw new Error(`Refusing unsafe input path: ${options.input}`);
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write projection outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('manual-artifacts/'));
}

function isFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('docs/fixtures/'));
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function readGateReview(inputPath) {
  return JSON.parse(readFileSync(inputPath, 'utf8'));
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

function assertGateReview(gateReview) {
  if (gateReview.contractVersion !== INPUT_SCHEMA) throw new Error(`Input must be ${INPUT_SCHEMA}.`);
  if (gateReview.kind !== 'gdelt_web_ngrams_fallback_gate_review') throw new Error('Input kind mismatch.');
  if (gateReview.status !== 'sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write') {
    throw new Error('P49 gate is not ready for display-only fallback projection.');
  }
  if (gateReview.approvalState?.sampleGatePassed !== true) throw new Error('sampleGatePassed must be true.');
  if (gateReview.approvalState?.readyForDisplayOnlyFallbackProjection !== true) {
    throw new Error('readyForDisplayOnlyFallbackProjection must be true.');
  }
  for (const field of [
    'productionWriteApproved',
    'frontendApproved',
    'workflowApproved',
    'currentSignalEnhancementApproved',
    'scoreApproved'
  ]) {
    if (gateReview.approvalState?.[field] !== false) throw new Error(`approvalState.${field} must be false.`);
  }
  if (gateReview.futureFieldState?.productionWriterAllowed !== false) {
    throw new Error('P49 must not allow a production writer.');
  }
}

function compactBucketCoverage(bucketCoverage = {}) {
  return Object.fromEntries(
    Object.entries(bucketCoverage).map(([bucket, value]) => [
      bucket,
      {
        sampleHitCount: Number(value?.sampleHitCount || 0),
        totalCount: Number(value?.totalCount || 0)
      }
    ])
  );
}

function compactTermCoverage(termCoverage = []) {
  return termCoverage.map((term) => ({
    termId: String(term.termId || ''),
    samplesWithHits: Number(term.samplesWithHits || 0),
    totalMentionCount: Number(term.totalMentionCount || 0),
    buckets: Array.isArray(term.buckets) ? term.buckets.map(String).sort() : []
  })).filter((term) => term.termId);
}

function buildProjection(gateReview, options) {
  assertGateReview(gateReview);
  const sampleWindow = gateReview.sampleWindow || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'display_only_fallback_projection_ready_no_production_write',
    projectionState: 'manual_projection_ready_for_separate_writer_contract_review',
    recommendation: 'ready_for_p51_projection_review_keep_non_production',
    generatedAt: new Date().toISOString(),
    sourceMode: 'p49_gate_review_projection_dry_run',
    input: {
      sourcePath: safeRelativePath(options.input),
      contractVersion: gateReview.contractVersion,
      status: gateReview.status,
      reviewedAt: gateReview.reviewedAt || null,
      collectorRunId: gateReview.evidenceSnapshot?.collectorRunId || null
    },
    projectedProductionField: {
      targetArtifact: 'data/oil-news-event-watch.json',
      fieldPath: 'sourceCaches.gdeltWebNgramsFallback',
      presentInProductionData: false,
      writerApprovedByThisProjection: false,
      frontendApprovedByThisProjection: false,
      workflowApprovedByThisProjection: false,
      displayMode: 'aggregate_source_health_only_no_headlines',
      projectedShape: {
        status: 'sample_gate_passed_projection_only',
        generatedAt: null,
        sourceKey: 'gdelt_web_ngrams_v5_legacy',
        fallbackContextOnly: true,
        currentSignalEnhancement: false,
        eventConfirmationSource: false,
        headlineSource: false,
        oilDirectionInput: false,
        sampleGate: {
          state: 'passed',
          p49ContractVersion: gateReview.contractVersion,
          collectorRunId: gateReview.evidenceSnapshot?.collectorRunId || null,
          usableSampleCount: sampleWindow.usableSampleCount || 0,
          selectedTimestampCount: sampleWindow.selectedTimestampCount || 0,
          observationWindowHours: sampleWindow.observationWindowHours || 0,
          latestSelectedTimestamp: sampleWindow.latestSelectedTimestamp || null,
          warningCount: sampleWindow.warningCount || 0,
          warningTreatment: gateReview.evidenceSnapshot?.warningTreatment || null
        },
        sourceHealth: {
          state: 'fallback_sample_gate_passed',
          freshness: 'artifact_only_reviewed',
          gdeltDocReliefRole: 'background_fallback_when_doc_api_rate_limited',
          usedForCurrentSignal: false
        },
        aggregate: {
          bucketCounts: compactBucketCoverage(gateReview.bucketCoverage),
          termCounts: compactTermCoverage(gateReview.termCoverage),
          selectedTimestampCount: sampleWindow.selectedTimestampCount || 0,
          usableSampleCount: sampleWindow.usableSampleCount || 0,
          observationWindowHours: sampleWindow.observationWindowHours || 0
        },
        limitations: [
          'background phrase heat only',
          'no headline or URL display',
          'no event confirmation',
          'no current Oil News signal enhancement',
          'no ODP direction or scoring impact'
        ]
      }
    },
    approvals: {
      productionWriteApproved: false,
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
      notProductionData: true,
      displayProjectionOnly: true
    },
    nextAllowedStep: 'p51_display_only_fallback_projection_review_no_production_write',
    boundary: BOUNDARY
  };
}

function writeJson(path, payload) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
  return absolutePath;
}

function printSummary(projection) {
  console.log(`GDELT Web NGrams display fallback projection: ${projection.status}`);
  console.log(`projectionState: ${projection.projectionState}`);
  console.log(`futureField: ${projection.projectedProductionField.fieldPath}`);
  console.log(`productionWriteApproved: ${projection.approvals.productionWriteApproved}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const gateReview = readGateReview(options.input);
  const projection = buildProjection(gateReview, options);
  if (options.writeOutput) projection.outputPath = writeJson(options.output, projection);
  if (options.printJson) {
    console.log(JSON.stringify(projection, null, 2));
  } else {
    printSummary(projection);
  }
  if (options.strict && projection.status !== 'display_only_fallback_projection_ready_no_production_write') {
    process.exitCode = 1;
  }
}

main();
