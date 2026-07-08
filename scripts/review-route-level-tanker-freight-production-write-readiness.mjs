#!/usr/bin/env node
import { assertAllFalse as allFalse, assertAllTrue as allTrue, isManualArtifactPath, readJson, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import process from 'node:process';

const READINESS_VERSION = 'route-level-tanker-freight-production-write-readiness-v1';
const PROJECTION_REVIEW_VERSION = 'route-level-tanker-freight-production-display-projection-review-v1';
const DISPLAY_CONTRACT_VERSION = 'route-level-tanker-freight-display-contract-v1';
const FRONTEND_BRIEF_VERSION = 'route-level-tanker-freight-frontend-display-brief-v1';

const DEFAULT_PROJECTION_REVIEW = 'docs/fixtures/route-level-tanker-freight/production-display-projection-review-pass.json';
const DEFAULT_DISPLAY_CONTRACT = 'docs/fixtures/route-level-tanker-freight-display-contract-v1.json';
const DEFAULT_FRONTEND_BRIEF = 'docs/fixtures/route-level-tanker-freight-frontend-display-brief-v1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-production-write-readiness-latest.json';
const BOUNDARY = 'manual/local route-level tanker freight production write readiness gate only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:route-level-tanker-freight-production-write-readiness -- [options]

Options:
  --projection-review <path>  Projection review artifact. Default: ${DEFAULT_PROJECTION_REVIEW}
  --display-contract <path>   Display contract fixture. Default: ${DEFAULT_DISPLAY_CONTRACT}
  --frontend-brief <path>     Frontend display brief fixture. Default: ${DEFAULT_FRONTEND_BRIEF}
  --output <path>             Ignored readiness artifact path. Default: ${DEFAULT_OUTPUT}
  --min-usable-projections <n> Minimum usable projection reviews for design readiness. Default: 1
  --min-route-buckets <n>     Minimum route buckets in reviewed repeated-route coverage. Default: 2
  --no-output                 Do not write the ignored readiness artifact.
  --json                      Print full JSON readiness to stdout.
  --strict                    Exit non-zero unless design readiness is pass.
  --help                      Show this help.`);
}

function parseArgs(argv) {
  const options = {
    projectionReview: DEFAULT_PROJECTION_REVIEW,
    displayContract: DEFAULT_DISPLAY_CONTRACT,
    frontendBrief: DEFAULT_FRONTEND_BRIEF,
    output: DEFAULT_OUTPUT,
    minUsableProjections: 1,
    minRouteBuckets: 2,
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
    if (arg === '--projection-review') options.projectionReview = nextValue();
    else if (arg === '--display-contract') options.displayContract = nextValue();
    else if (arg === '--frontend-brief') options.frontendBrief = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--min-usable-projections') options.minUsableProjections = Number(nextValue());
    else if (arg === '--min-route-buckets') options.minRouteBuckets = Number(nextValue());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [label, value] of [
    ['projection-review', options.projectionReview],
    ['display-contract', options.displayContract],
    ['frontend-brief', options.frontendBrief]
  ]) {
    if (!isSafeInputPath(value)) throw new Error(`Refusing to read ${label} outside manual-artifacts/ or docs/fixtures/: ${value}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write readiness outside manual-artifacts/: ${options.output}`);
  }
  if (!Number.isInteger(options.minUsableProjections) || options.minUsableProjections < 1 || options.minUsableProjections > 50) {
    throw new Error('Invalid --min-usable-projections. Expected integer 1..50.');
  }
  if (!Number.isInteger(options.minRouteBuckets) || options.minRouteBuckets < 1 || options.minRouteBuckets > 10) {
    throw new Error('Invalid --min-route-buckets. Expected integer 1..10.');
  }
  return options;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function falseImpactMap() {
  return {
    writesProductionData: false,
    modifiesFrontend: false,
    modifiesWorkerRuntime: false,
    modifiesWorkflow: false,
    affectsValues: false,
    affectsDisplayInputsBaseline: false,
    affectsEffectiveDisplayInputs: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsWorldOrderWeights: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function assertProjectionReview(review) {
  if (review.schemaVersion !== PROJECTION_REVIEW_VERSION) throw new Error(`Unexpected projection review schemaVersion: ${review.schemaVersion}`);
  if (review.promotionEligible !== false) throw new Error('Projection review must not be promotionEligible.');
  if (review.productionWriteApproved !== false) throw new Error('Projection review must not approve production write.');
  if (review.productionDisplayApproved !== false) throw new Error('Projection review must not approve production display.');
  if (review.directDisplayApproved !== false) throw new Error('Projection review must not approve direct display.');
  if (review.routeFreightConfirmation !== 'not_connected') throw new Error('Projection review routeFreightConfirmation must stay not_connected.');
  if (review.marketConfirmation !== 'not_connected') throw new Error('Projection review marketConfirmation must stay not_connected.');
  if (review.eligibleForMainScore !== false) throw new Error('Projection review eligibleForMainScore must stay false.');
  allFalse(review.productionImpact, 'projectionReview.productionImpact');
  allTrue(review.boundaries, 'projectionReview.boundaries');
}

function assertDisplayContract(contract) {
  if (contract.contractVersion !== DISPLAY_CONTRACT_VERSION) throw new Error(`Unexpected display contractVersion: ${contract.contractVersion}`);
  if (contract.status !== 'contract_only_no_production_write') throw new Error('Display contract must stay contract_only_no_production_write.');
  if (contract.currentProductionState?.routeFreightConfirmation !== 'not_connected') throw new Error('Display contract routeFreightConfirmation must stay not_connected.');
  if (contract.currentProductionState?.marketConfirmation !== 'not_connected') throw new Error('Display contract marketConfirmation must stay not_connected.');
  if (contract.currentProductionState?.eligibleForMainScore !== false) throw new Error('Display contract eligibleForMainScore must stay false.');
  allFalse(contract.approvalState, 'displayContract.approvalState');
  allTrue(contract.boundaries, 'displayContract.boundaries');
  if (!Array.isArray(contract.minimumExitCriteriaBeforeAnyProductionWrite)) throw new Error('Display contract missing exit criteria.');
  if (!contract.minimumExitCriteriaBeforeAnyProductionWrite.includes('source_rights_and_redistribution_review_approved')) {
    throw new Error('Display contract must require source-rights review before production write.');
  }
}

function assertFrontendBrief(brief) {
  if (brief.contractVersion !== FRONTEND_BRIEF_VERSION) throw new Error(`Unexpected frontend brief contractVersion: ${brief.contractVersion}`);
  if (brief.status !== 'docs_only_no_frontend_implementation') throw new Error('Frontend brief must stay docs-only.');
  if (brief.targetSurface !== '#oil-directional-pressure') throw new Error('Frontend brief target surface must be ODP.');
  if (brief.placement !== 'folded_detail_only') throw new Error('Frontend brief placement must stay folded_detail_only.');
  if (brief.currentProductionState?.routeFreightConfirmation !== 'not_connected') throw new Error('Frontend brief routeFreightConfirmation must stay not_connected.');
  if (brief.currentProductionState?.marketConfirmation !== 'not_connected') throw new Error('Frontend brief marketConfirmation must stay not_connected.');
  if (brief.currentProductionState?.eligibleForMainScore !== false) throw new Error('Frontend brief eligibleForMainScore must stay false.');
  allFalse(brief.approvalState, 'frontendBrief.approvalState');
  allTrue(brief.boundaries, 'frontendBrief.boundaries');
  allTrue(brief.copyRules, 'frontendBrief.copyRules');
}

function uniqueBuckets(routeCoverage) {
  return [...new Set((Array.isArray(routeCoverage) ? routeCoverage : []).map((route) => route.bucketKey).filter(Boolean))];
}

function buildReadiness({ projectionReview, displayContract, frontendBrief, options }) {
  assertProjectionReview(projectionReview);
  assertDisplayContract(displayContract);
  assertFrontendBrief(frontendBrief);

  const routeBuckets = uniqueBuckets(projectionReview.routeCoverage);
  const projectionReady = projectionReview.status === 'pass'
    && projectionReview.usableProjectionCount >= options.minUsableProjections
    && routeBuckets.length >= options.minRouteBuckets
    && projectionReview.blockerCount === 0
    && projectionReview.warningCount === 0;

  const readiness = {
    projectionReview: projectionReady ? 'pass' : 'insufficient',
    sampleReadiness: projectionReady ? 'pass' : 'insufficient_samples_or_routes',
    sourceRightsReadiness: 'manual_review_required',
    frontendBriefReadiness: 'pass',
    productionWriterContractReadiness: 'not_started',
    immediateProductionWriteReadiness: 'blocked'
  };

  const warnings = [];
  if (!projectionReady) warnings.push('collect_more_projection_review_evidence');

  const blockersForImmediateProductionWrite = [
    'source_rights_and_redistribution_not_approved',
    'production_writer_contract_not_reviewed',
    'production_write_workflow_not_approved',
    'live_fetch_not_approved',
    'frontend_implementation_not_approved',
    'scoring_backtest_not_approved'
  ];

  const status = projectionReady ? 'pass' : 'warn';
  return {
    schemaVersion: READINESS_VERSION,
    status,
    recommendation: projectionReady
      ? 'ready_for_separate_production_write_design_keep_non_production'
      : 'collect_more_review_evidence_keep_non_production',
    generatedAt: new Date().toISOString(),
    inputs: {
      projectionReview: {
        sourcePath: safeRelativePath(options.projectionReview),
        artifactHash: shortHash(projectionReview),
        schemaVersion: projectionReview.schemaVersion,
        status: projectionReview.status,
        recommendation: projectionReview.recommendation,
        usableProjectionCount: projectionReview.usableProjectionCount,
        routeBucketCount: routeBuckets.length,
        routeBuckets
      },
      displayContract: {
        sourcePath: safeRelativePath(options.displayContract),
        artifactHash: shortHash(displayContract),
        contractVersion: displayContract.contractVersion,
        status: displayContract.status,
        futureProductionFieldCandidate: displayContract.futureProductionFieldCandidate
      },
      frontendBrief: {
        sourcePath: safeRelativePath(options.frontendBrief),
        artifactHash: shortHash(frontendBrief),
        contractVersion: frontendBrief.contractVersion,
        status: frontendBrief.status,
        targetSurface: frontendBrief.targetSurface,
        placement: frontendBrief.placement
      }
    },
    readiness,
    warnings,
    blockersForImmediateProductionWrite,
    nextAllowedStep: 'separate_production_writer_contract_design',
    currentProductionState: {
      routeFreightConfirmation: 'not_connected',
      marketConfirmation: 'not_connected',
      eligibleForMainScore: false
    },
    approvals: {
      productionDataWriteApproved: false,
      productionWriteApproved: false,
      frontendImplementationApproved: false,
      workflowAutomationApproved: false,
      liveFetchApproved: false,
      mainScoreApproved: false,
      odpFinalBiasApproved: false,
      brentPromotionApproved: false,
      worldOrderWeightsApproved: false,
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
      notProductionData: true
    },
    boundary: BOUNDARY
  };
}

function printSummary(readiness) {
  console.log(`Route-level tanker freight production write readiness: ${readiness.status}`);
  console.log(`recommendation: ${readiness.recommendation}`);
  console.log(`projectionReview: ${readiness.readiness.projectionReview}`);
  console.log(`sourceRightsReadiness: ${readiness.readiness.sourceRightsReadiness}`);
  console.log(`productionWriteApproved: ${readiness.approvals.productionWriteApproved}`);
  console.log(`routeFreightConfirmation: ${readiness.currentProductionState.routeFreightConfirmation}`);
  console.log(`nextAllowedStep: ${readiness.nextAllowedStep}`);
  console.log(`boundary: ${readiness.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const readiness = buildReadiness({
      projectionReview: readJson(options.projectionReview),
      displayContract: readJson(options.displayContract),
      frontendBrief: readJson(options.frontendBrief),
      options
    });
    if (options.writeOutput) writeJson(options.output, readiness);
    if (options.printJson) console.log(JSON.stringify(readiness, null, 2));
    else printSummary(readiness);
    if (options.strict && readiness.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
