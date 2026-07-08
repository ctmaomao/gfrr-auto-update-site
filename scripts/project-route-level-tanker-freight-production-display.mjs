#!/usr/bin/env node
import { isManualArtifactPath, readJson, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import process from 'node:process';

const PROJECTION_VERSION = 'route-level-tanker-freight-production-display-projection-v1';
const REVIEW_VERSION = 'route-level-tanker-freight-manual-samples-review-v1';
const CONTRACT_VERSION = 'route-level-tanker-freight-display-contract-v1';
const DEFAULT_CONTRACT = 'docs/fixtures/route-level-tanker-freight-display-contract-v1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-production-display-projection-latest.json';
const BOUNDARY = 'dry-run-only route-level tanker freight production display projection; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run project:route-level-tanker-freight-production-display -- [options]

Options:
  --input <path>      Manual samples review artifact. Required.
  --contract <path>   Display contract fixture. Default: ${DEFAULT_CONTRACT}
  --output <path>     Ignored projection artifact path. Default: ${DEFAULT_OUTPUT}
  --no-output         Do not write the ignored projection artifact.
  --json              Print full JSON projection to stdout.
  --strict            Exit non-zero unless projectionState is manual_review_ready_non_production.
  --help              Show this help.`);
}

function parseArgs(argv) {
  const options = {
    input: null,
    contract: DEFAULT_CONTRACT,
    output: DEFAULT_OUTPUT,
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
    if (arg === '--input') options.input = nextValue();
    else if (arg === '--contract') options.contract = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.input) throw new Error('Missing required --input manual samples review artifact.');
  if (!isSafeInputPath(options.input)) throw new Error(`Refusing to read input outside manual-artifacts/ or docs/fixtures/: ${options.input}`);
  if (!isSafeInputPath(options.contract)) throw new Error(`Refusing to read contract outside manual-artifacts/ or docs/fixtures/: ${options.contract}`);
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write projection outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function productionImpactFalseMap() {
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

function assertReview(review) {
  if (review.schemaVersion !== REVIEW_VERSION) throw new Error(`Unexpected manual samples review schemaVersion: ${review.schemaVersion}`);
  if (review.promotionEligible !== false) throw new Error('Manual samples review must not be promotionEligible.');
  if (review.productionWriteApproved !== false) throw new Error('Manual samples review must not approve production write.');
  if (review.productionDisplayApproved !== false) throw new Error('Manual samples review must not approve production display.');
  if (review.routeFreightConfirmation !== 'not_connected') throw new Error('Manual samples review routeFreightConfirmation must stay not_connected.');
  if (review.marketConfirmation !== 'not_connected') throw new Error('Manual samples review marketConfirmation must stay not_connected.');
  if (review.eligibleForMainScore !== false) throw new Error('Manual samples review must not be main-score eligible.');
}

function assertContract(contract) {
  if (contract.contractVersion !== CONTRACT_VERSION) throw new Error(`Unexpected display contract version: ${contract.contractVersion}`);
  if (contract.status !== 'contract_only_no_production_write') throw new Error('Display contract must stay contract_only_no_production_write.');
  if (contract.approvalState?.productionDataWriteApproved !== false) throw new Error('Display contract must not approve production write.');
  if (contract.approvalState?.frontendDisplayApproved !== false) throw new Error('Display contract must not approve frontend display.');
  if (contract.approvalState?.mainScoreApproved !== false) throw new Error('Display contract must not approve main score.');
  if (!Array.isArray(contract.candidateDisplayStatuses) || contract.candidateDisplayStatuses.includes('confirmed')) {
    throw new Error('Display contract must not expose confirmed status yet.');
  }
}

function projectionState(review) {
  if (review.status === 'pass' && review.recommendation === 'manual_sample_review_ready_keep_non_production') {
    return 'manual_review_ready_non_production';
  }
  if (review.blockerCount > 0 || (Array.isArray(review.blockers) && review.blockers.length > 0)) return 'source_rights_unproven';
  if (review.status === 'warn') return 'insufficient_samples';
  return 'unavailable';
}

function routeSummary(review) {
  const repeated = Array.isArray(review.repeatedRoutes) ? review.repeatedRoutes : [];
  const allRoutes = Array.isArray(review.routeCoverage) ? review.routeCoverage : [];
  return {
    repeatedRouteCount: repeated.length,
    observedRouteCount: allRoutes.length,
    repeatedRoutes: repeated.map((route) => ({
      routeCode: route.routeCode,
      bucketKey: route.bucketKey,
      sampleCount: route.sampleCount,
      assessmentDateCount: route.assessmentDateCount,
      latestWeeklyChangePct: Number.isFinite(Number(route.latestWeeklyChangePct)) ? Number(route.latestWeeklyChangePct) : null
    }))
  };
}

function buildProjection(review, contract, options) {
  assertReview(review);
  assertContract(contract);
  const state = projectionState(review);
  if (!contract.candidateDisplayStatuses.includes(state)) {
    throw new Error(`Projection state ${state} is not allowed by display contract.`);
  }
  const routes = routeSummary(review);
  return {
    schemaVersion: PROJECTION_VERSION,
    status: 'dry_run_only',
    projectionState: state,
    recommendation: state === 'manual_review_ready_non_production'
      ? 'ready_for_human_display_design_review_keep_non_production'
      : 'collect_more_review_evidence_keep_non_production',
    generatedAt: new Date().toISOString(),
    sourceMode: 'manual_samples_review_dry_run',
    input: {
      sourcePath: safeRelativePath(options.input),
      artifactHash: shortHash(review),
      schemaVersion: review.schemaVersion,
      status: review.status,
      recommendation: review.recommendation,
      generatedAt: review.generatedAt || null,
      sampleCount: Number(review.sampleCount || 0),
      usableSampleCount: Number(review.usableSampleCount || 0),
      assessmentDateWindow: review.assessmentDateWindow || null
    },
    contract: {
      sourcePath: safeRelativePath(options.contract),
      contractVersion: contract.contractVersion,
      status: contract.status,
      futureProductionFieldCandidate: contract.futureProductionFieldCandidate
    },
    displayCandidate: {
      futureProductionFieldCandidate: contract.futureProductionFieldCandidate,
      titleZh: '路线级油轮运费确认观察',
      state,
      confidence: 'manual_review_required',
      directDisplayApproved: false,
      rawHeadlineOrSourceTextDisplayed: false,
      sampleCount: Number(review.sampleCount || 0),
      usableSampleCount: Number(review.usableSampleCount || 0),
      bucketSampleCoverage: review.bucketSampleCoverage || {},
      routeSummary: routes,
      limitationZh: '仅为 dry-run 投影,用于人工审阅未来展示层形状;不确认封锁、断供、官方贸易统计或油价方向。'
    },
    currentProductionState: {
      routeFreightConfirmation: 'not_connected',
      marketConfirmation: 'not_connected',
      eligibleForMainScore: false
    },
    approvals: {
      productionDataWriteApproved: false,
      frontendDisplayApproved: false,
      workflowAutomationApproved: false,
      liveFetchApproved: false,
      mainScoreApproved: false,
      odpFinalBiasApproved: false,
      brentPromotionApproved: false,
      worldOrderWeightsApproved: false,
      globalRiskHeatmapApproved: false,
      crossValidationApproved: false
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
      notProductionData: true
    },
    boundary: BOUNDARY
  };
}

function printSummary(projection) {
  console.log(`Route-level tanker freight production display projection: ${projection.status}`);
  console.log(`projectionState: ${projection.projectionState}`);
  console.log(`sampleCount: ${projection.input.sampleCount}`);
  console.log(`usableSampleCount: ${projection.input.usableSampleCount}`);
  console.log(`directDisplayApproved: ${projection.displayCandidate.directDisplayApproved}`);
  console.log(`productionDataWriteApproved: ${projection.approvals.productionDataWriteApproved}`);
  console.log(`boundary: ${projection.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = readJson(options.input);
    const contract = readJson(options.contract);
    const projection = buildProjection(review, contract, options);
    if (options.writeOutput) writeJson(options.output, projection);
    if (options.printJson) console.log(JSON.stringify(projection, null, 2));
    else printSummary(projection);
    if (options.strict && projection.projectionState !== 'manual_review_ready_non_production') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
