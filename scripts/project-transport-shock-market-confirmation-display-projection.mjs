#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-market-confirmation-display-projection-v1';
const REVIEW_SCHEMA = 'transport-shock-market-confirmation-manual-sample-review-v1';
const DEFAULT_INPUT =
  'manual-artifacts/transport-shock-confirmation-factor/market-confirmation-manual-sample-review-latest.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/market-confirmation-display-projection-latest.json';
const BOUNDARY = 'dry-run-only Transport Shock market-confirmation display projection; not production data; no frontend implementation; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run project:transport-shock-market-confirmation-display-projection -- [options]

Options:
  --input <path>   Market-confirmation manual sample review artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored display projection artifact. Default: ${DEFAULT_OUTPUT}
  --json           Print full JSON projection to stdout.
  --no-output      Do not write ignored artifact.
  --strict         Exit non-zero unless projectionState is manual_market_confirmation_review_ready_non_production.
  --help           Show this help.

Boundary:
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production data, frontend, workflow, Worker, ODP finalBias, or main judgment scoring.`);
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    printJson: false,
    writeOutput: true,
    strict: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
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
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isManualArtifactPath(options.input) && !isFixturePath(options.input)) {
    throw new Error(`Refusing to read input outside allowed Transport Shock artifact paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write display projection outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readReview(inputPath) {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) throw new Error(`Input file does not exist: ${inputPath}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
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
    affectsMainJudgment: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function assertReview(review) {
  if (review.schemaVersion !== REVIEW_SCHEMA) throw new Error(`Unexpected review schemaVersion: ${review.schemaVersion}`);
  if (review.status !== 'dry_run_only') throw new Error('Market-confirmation review must stay dry_run_only.');
  if (review.promotionEligible !== false) throw new Error('Review must not be promotion eligible.');
  if (review.productionWriteApproved !== false) throw new Error('Review must not approve production write.');
  if (review.marketConfirmationWriteApproved !== false) throw new Error('Review must not approve marketConfirmation write.');
  if (review.scoreWriteApproved !== false) throw new Error('Review must not approve score write.');
  if (review.frontendDisplayApproved !== false) throw new Error('Review must not approve frontend display.');
  if (review.routeFreightConfirmation !== 'not_connected') throw new Error('routeFreightConfirmation must stay not_connected.');
  if (review.marketConfirmation !== 'not_connected') throw new Error('marketConfirmation must stay not_connected.');
  if (review.eligibleForMainScore !== false) throw new Error('Review must not be main-score eligible.');
  if (review.boundaries?.noNetworkCall !== true) throw new Error('Review missing noNetworkCall boundary.');
  if (review.boundaries?.noProductionWrite !== true) throw new Error('Review missing noProductionWrite boundary.');
  if (review.boundaries?.noMarketConfirmationWrite !== true) throw new Error('Review missing noMarketConfirmationWrite boundary.');
  if (review.boundaries?.noScoreWrite !== true) throw new Error('Review missing noScoreWrite boundary.');
}

function projectionState(review) {
  const accepted = Number(review.review?.acceptedObservationCount || 0);
  const rejected = Number(review.review?.rejectedObservationCount || 0);
  const bucketCoverage = review.review?.bucketCoverage || {};
  const hasPrice = Number(bucketCoverage.brent_price_structure_confirmation || 0) > 0;
  const hasNewsReaction = Number(bucketCoverage.oil_news_market_reaction_confirmation || 0) > 0;
  const hasOdpMarketContext = Number(bucketCoverage.odp_market_stress_context || 0) > 0;
  if (accepted >= 3 && rejected === 0 && hasPrice && hasNewsReaction && hasOdpMarketContext) {
    return 'manual_market_confirmation_review_ready_non_production';
  }
  if (accepted > 0) return 'insufficient_market_confirmation_coverage';
  return 'market_confirmation_unavailable';
}

function buildProjection(review, options) {
  assertReview(review);
  const state = projectionState(review);
  const accepted = Number(review.review?.acceptedObservationCount || 0);
  const rejected = Number(review.review?.rejectedObservationCount || 0);
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'dry_run_only',
    projectionState: state,
    recommendation: state === 'manual_market_confirmation_review_ready_non_production'
      ? 'ready_for_human_display_design_review_keep_non_production'
      : 'collect_more_market_confirmation_samples_keep_non_production',
    generatedAt: new Date().toISOString(),
    sourceMode: 'market_confirmation_manual_sample_review_dry_run',
    input: {
      sourcePath: safeRelativePath(options.input),
      artifactHash: shortHash(review),
      schemaVersion: review.schemaVersion,
      contractVersion: review.contractVersion || null,
      status: review.status,
      generatedAt: review.generatedAt || null,
      acceptedObservationCount: accepted,
      rejectedObservationCount: rejected
    },
    displayCandidate: {
      futureThematicBlock: 'C1 通胀与能源',
      futureCardTitle: 'Transport Shock Market Confirmation',
      futureCardTitleZh: '运输冲击市场确认观察',
      directDisplayApproved: false,
      frontendImplementationApproved: false,
      rawSourceTextDisplayed: false,
      state,
      confidence: 'manual_review_required',
      acceptedObservationCount: accepted,
      rejectedObservationCount: rejected,
      bucketCoverage: review.review?.bucketCoverage || {},
      directionCounts: review.review?.directionCounts || {},
      sourceCoverage: review.review?.sourceCoverage || {},
      limitationZh: '仅为 marketConfirmation 展示候选 dry-run 投影;不是生产数据、不写 marketConfirmation、不确认封锁、断供或油价方向。'
    },
    approvals: {
      productionDataWriteApproved: false,
      productionDisplayApproved: false,
      frontendDisplayApproved: false,
      workflowAutomationApproved: false,
      liveFetchApproved: false,
      marketConfirmationWriteApproved: false,
      completeFactorScoreApproved: false,
      scoreWriteApproved: false,
      mainScoreApproved: false,
      odpFinalBiasApproved: false,
      brentPromotionApproved: false,
      globalRiskHeatmapApproved: false,
      crossValidationApproved: false
    },
    currentProductionState: {
      transportShockConfirmationFactor: 'not_connected',
      routeFreightConfirmation: 'not_connected',
      marketConfirmation: 'not_connected',
      eligibleForMainScore: false
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
      noMarketConfirmationWrite: true,
      noScoreWrite: true,
      notProductionData: true,
      displayProjectionOnly: true
    },
    boundary: BOUNDARY
  };
}

function printSummary(projection) {
  console.log(`Transport Shock market-confirmation display projection: ${projection.status}`);
  console.log(`projectionState: ${projection.projectionState}`);
  console.log(`acceptedObservationCount: ${projection.displayCandidate.acceptedObservationCount}`);
  console.log(`directDisplayApproved: ${projection.displayCandidate.directDisplayApproved}`);
  console.log(`marketConfirmation: ${projection.currentProductionState.marketConfirmation}`);
  console.log(`eligibleForMainScore: ${projection.currentProductionState.eligibleForMainScore}`);
  console.log(`boundary: ${projection.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const projection = buildProjection(readReview(options.input), options);
    if (options.writeOutput) writeJson(options.output, projection);
    if (options.printJson) console.log(JSON.stringify(projection, null, 2));
    else printSummary(projection);
    if (options.strict && projection.projectionState !== 'manual_market_confirmation_review_ready_non_production') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
