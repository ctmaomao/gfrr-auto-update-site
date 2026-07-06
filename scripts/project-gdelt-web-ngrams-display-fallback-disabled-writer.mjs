#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'gdelt-web-ngrams-display-fallback-disabled-writer-p53';
const WRITER_CONTRACT_VERSION = 'gdelt-web-ngrams-display-fallback-writer-contract-design-p52';
const PROJECTION_VERSION = 'gdelt-web-ngrams-display-fallback-projection-p50';
const PROJECTION_REVIEW_VERSION = 'gdelt-web-ngrams-display-fallback-projection-review-p51';
const FUTURE_CACHE_VERSION = 'gdelt-web-ngrams-display-fallback-cache-v1';
const DEFAULT_WRITER_CONTRACT = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-writer-contract-design-p52.json';
const DEFAULT_PROJECTION = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-projection-p50.json';
const DEFAULT_PROJECTION_REVIEW = 'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-projection-review-p51.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-latest.json';
const BOUNDARY =
  'disabled GDELT Web NGrams display fallback writer scaffold; manual artifact only; not production data; not in current Oil News signal, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run project:gdelt-web-ngrams-display-fallback-disabled-writer -- [options]

Options:
  --writer-contract <path>      P52 writer contract fixture. Default: ${DEFAULT_WRITER_CONTRACT}
  --projection <path>           P50 projection fixture. Default: ${DEFAULT_PROJECTION}
  --projection-review <path>    P51 projection review fixture. Default: ${DEFAULT_PROJECTION_REVIEW}
  --output <path>               Ignored manual artifact path. Default: ${DEFAULT_OUTPUT}
  --generated-at <iso>          Deterministic generatedAt for fixtures/checks.
  --no-output                   Do not write the ignored artifact.
  --json                        Print full JSON projection to stdout.
  --strict                      Exit non-zero unless disabled projection is valid.
  --help                        Show this help.`);
}

function parseArgs(argv) {
  const options = {
    writerContract: DEFAULT_WRITER_CONTRACT,
    projection: DEFAULT_PROJECTION,
    projectionReview: DEFAULT_PROJECTION_REVIEW,
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
    if (arg === '--writer-contract') options.writerContract = nextValue();
    else if (arg === '--projection') options.projection = nextValue();
    else if (arg === '--projection-review') options.projectionReview = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--generated-at') options.generatedAt = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [label, value] of [
    ['writer-contract', options.writerContract],
    ['projection', options.projection],
    ['projection-review', options.projectionReview]
  ]) {
    if (!isSafeInputPath(value)) throw new Error(`Refusing to read ${label} outside manual-artifacts/ or docs/fixtures/: ${value}`);
  }
  if (options.generatedAt && Number.isNaN(Date.parse(options.generatedAt))) {
    throw new Error(`Invalid --generated-at ISO timestamp: ${options.generatedAt}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write disabled writer projection outside manual-artifacts/: ${options.output}`);
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

function assertAllFalse(record, label) {
  for (const [key, value] of Object.entries(record || {})) {
    if (value !== false) throw new Error(`${label}.${key} must be false.`);
  }
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

function assertWriterContract(contract) {
  if (contract.contractVersion !== WRITER_CONTRACT_VERSION) throw new Error(`Unexpected writer contractVersion: ${contract.contractVersion}`);
  if (contract.status !== 'display_only_fallback_writer_contract_design_no_production_write') {
    throw new Error('Writer contract must stay display_only_fallback_writer_contract_design_no_production_write.');
  }
  if (contract.futureProductionField?.targetArtifact !== 'data/oil-news-event-watch.json') {
    throw new Error('Unexpected future target artifact.');
  }
  if (contract.futureProductionField?.fieldPath !== 'sourceCaches.gdeltWebNgramsFallback') {
    throw new Error('Unexpected future production field.');
  }
  if (contract.futureProductionField?.contractVersion !== FUTURE_CACHE_VERSION) {
    throw new Error('Unexpected future cache contract version.');
  }
  if (contract.currentProductionState?.sourceCachesGdeltWebNgramsFallback !== 'absent') {
    throw new Error('sourceCaches.gdeltWebNgramsFallback must stay absent before P56.');
  }
  if (contract.currentProductionState?.productionWriteApproved !== false) {
    throw new Error('productionWriteApproved must stay false in P52.');
  }
  if (contract.futureFieldShape?.defaultStatus !== 'not_connected') {
    throw new Error('Future field default status must stay not_connected.');
  }
  if (contract.futureFieldShape?.allowedStatuses?.includes('confirmed')) {
    throw new Error('confirmed status is not allowed.');
  }
  if (contract.futureFieldShape?.displayMode !== 'aggregate_source_health_only_no_headlines') {
    throw new Error('Unexpected future display mode.');
  }
  assertAllFalse(contract.approvalState, 'writerContract.approvalState');
}

function assertProjection(projection) {
  if (projection.schemaVersion !== PROJECTION_VERSION) throw new Error(`Unexpected projection schemaVersion: ${projection.schemaVersion}`);
  if (projection.status !== 'display_only_fallback_projection_ready_no_production_write') {
    throw new Error('P50 projection must stay display_only_fallback_projection_ready_no_production_write.');
  }
  if (projection.projectedProductionField?.fieldPath !== 'sourceCaches.gdeltWebNgramsFallback') {
    throw new Error('Unexpected projected production field.');
  }
  if (projection.projectedProductionField?.presentInProductionData !== false) {
    throw new Error('P50 projected production field must remain absent.');
  }
  if (projection.projectedProductionField?.displayMode !== 'aggregate_source_health_only_no_headlines') {
    throw new Error('Unexpected P50 display mode.');
  }
  const sampleGate = projection.projectedProductionField?.projectedShape?.sampleGate;
  if (!sampleGate || sampleGate.usableSampleCount < 8 || sampleGate.selectedTimestampCount < 2 || sampleGate.observationWindowHours < 24) {
    throw new Error('P50 sample gate is insufficient for disabled writer projection.');
  }
  if (projection.projectedProductionField?.projectedShape?.sourceHealth?.usedForCurrentSignal !== false) {
    throw new Error('P50 sourceHealth.usedForCurrentSignal must be false.');
  }
  assertAllFalse(projection.approvals, 'projection.approvals');
  assertAllFalse(projection.productionImpact, 'projection.productionImpact');
}

function assertProjectionReview(review) {
  if (review.schemaVersion !== PROJECTION_REVIEW_VERSION) throw new Error(`Unexpected projection review schemaVersion: ${review.schemaVersion}`);
  if (review.status !== 'pass') throw new Error('P51 review must pass before P53.');
  if (review.reviewState !== 'display_fallback_projection_review_passed_no_production_write') {
    throw new Error('Unexpected P51 reviewState.');
  }
  if (review.currentProductionState?.sourceCachesGdeltWebNgramsFallback !== 'absent') {
    throw new Error('P51 must report future field absent.');
  }
  if (review.blockerCount !== 0 || review.usableProjectionCount < 1) {
    throw new Error('P51 review must have at least one usable projection and no blockers.');
  }
  assertAllFalse(review.approvals, 'review.approvals');
  assertAllFalse(review.productionImpact, 'review.productionImpact');
}

function buildCandidateCache({ writerContract, projection }) {
  const projectedShape = projection.projectedProductionField.projectedShape;
  const fieldShape = writerContract.futureFieldShape;
  return {
    contractVersion: FUTURE_CACHE_VERSION,
    status: 'sample_gate_passed_projection_only',
    generatedAt: null,
    sourceKey: fieldShape.sourceKey,
    displayMode: fieldShape.displayMode,
    fallbackContextOnly: true,
    currentSignalEnhancement: false,
    eventConfirmationSource: false,
    headlineSource: false,
    oilDirectionInput: false,
    eligibleForScoring: false,
    staleAfterHours: fieldShape.staleAfterHours,
    sampleGate: clone(projectedShape.sampleGate),
    sourceHealth: {
      state: 'fallback_sample_gate_passed',
      freshness: 'artifact_only_reviewed',
      gdeltDocReliefRole: 'background_fallback_when_doc_api_rate_limited',
      usedForCurrentSignal: false
    },
    aggregate: clone(projectedShape.aggregate),
    limitationZh: fieldShape.limitationZh,
    warnings: [
      'manual_artifact_projection_only',
      'not_current_news_signal',
      'not_event_confirmation'
    ]
  };
}

function buildProjection({ writerContract, projection, projectionReview, options }) {
  assertWriterContract(writerContract);
  assertProjection(projection);
  assertProjectionReview(projectionReview);
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'disabled_no_production_write',
    writerState: 'disabled_scaffold_no_production_write',
    recommendation: 'ready_for_p54_disabled_writer_scaffold_review_no_production_write',
    generatedAt: options.generatedAt || new Date().toISOString(),
    sourceMode: 'p52_contract_projection_disabled',
    writeMode: 'manual_artifact_only',
    productionWriteAttempted: false,
    productionWriteApproved: false,
    futureProductionField: {
      targetArtifact: 'data/oil-news-event-watch.json',
      fieldPath: 'sourceCaches.gdeltWebNgramsFallback',
      contractVersion: FUTURE_CACHE_VERSION,
      presentInProductionData: false,
      displayMode: 'aggregate_source_health_only_no_headlines'
    },
    inputs: {
      writerContract: {
        sourcePath: safeRelativePath(options.writerContract),
        artifactHash: hashObject(writerContract),
        contractVersion: writerContract.contractVersion,
        status: writerContract.status
      },
      projection: {
        sourcePath: safeRelativePath(options.projection),
        artifactHash: hashObject(projection),
        schemaVersion: projection.schemaVersion,
        status: projection.status
      },
      projectionReview: {
        sourcePath: safeRelativePath(options.projectionReview),
        artifactHash: hashObject(projectionReview),
        schemaVersion: projectionReview.schemaVersion,
        reviewState: projectionReview.reviewState,
        status: projectionReview.status
      }
    },
    candidateCache: buildCandidateCache({ writerContract, projection }),
    currentProductionState: {
      sourceCachesGdeltWebNgramsFallback: 'absent',
      oilNewsCurrentSignalEnhancedByWebNgrams: false,
      frontendDisplayConnected: false,
      eligibleForScoring: false
    },
    approvals: {
      productionDataWriteApproved: false,
      productionWriteApproved: false,
      writerImplementationApproved: false,
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
      noRawTitleOrUrl: true,
      notProductionData: true,
      disabledWriterScaffoldOnly: true
    },
    nextAllowedStep: 'p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write',
    boundary: BOUNDARY
  };
}

function assertDisabledProjection(projection) {
  if (projection.schemaVersion !== SCHEMA_VERSION) throw new Error('Unexpected disabled writer schemaVersion.');
  if (projection.status !== 'disabled_no_production_write') throw new Error('Disabled writer status must stay disabled_no_production_write.');
  if (projection.writerState !== 'disabled_scaffold_no_production_write') throw new Error('Unexpected writerState.');
  if (projection.writeMode !== 'manual_artifact_only') throw new Error('writeMode must be manual_artifact_only.');
  if (projection.productionWriteAttempted !== false || projection.productionWriteApproved !== false) {
    throw new Error('Disabled writer must not attempt or approve production write.');
  }
  if (projection.futureProductionField?.presentInProductionData !== false) {
    throw new Error('Future production field must remain absent in P53.');
  }
  if (projection.candidateCache?.contractVersion !== FUTURE_CACHE_VERSION) throw new Error('Unexpected candidate cache contract.');
  if (projection.candidateCache?.status !== 'sample_gate_passed_projection_only') throw new Error('Unexpected candidate cache status.');
  if (projection.candidateCache?.currentSignalEnhancement !== false) throw new Error('candidateCache.currentSignalEnhancement must be false.');
  if (projection.candidateCache?.sourceHealth?.usedForCurrentSignal !== false) throw new Error('candidateCache.sourceHealth.usedForCurrentSignal must be false.');
  if (projection.candidateCache?.sampleGate?.usableSampleCount < 8) throw new Error('candidateCache sample gate must retain usable sample count.');
  assertAllFalse(projection.approvals, 'projection.approvals');
  assertAllFalse(projection.productionImpact, 'projection.productionImpact');
}

function writeJson(filePath, value) {
  const outputPath = resolve(filePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const writerContract = readJson(options.writerContract);
  const projection = readJson(options.projection);
  const projectionReview = readJson(options.projectionReview);
  const disabledProjection = buildProjection({ writerContract, projection, projectionReview, options });
  if (options.strict) assertDisabledProjection(disabledProjection);
  if (options.writeOutput) writeJson(options.output, disabledProjection);
  if (options.printJson) console.log(JSON.stringify(disabledProjection, null, 2));
  else {
    console.log(`GDELT Web NGrams display fallback disabled writer scaffold: ${disabledProjection.status}`);
    console.log(`writeMode: ${disabledProjection.writeMode}`);
    console.log(`output: ${options.writeOutput ? safeRelativePath(options.output) : '(no-output)'}`);
    console.log(`boundary: ${BOUNDARY}`);
  }
}

main();
