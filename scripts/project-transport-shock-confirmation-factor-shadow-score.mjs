#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-shadow-score-v1';
const INPUT_SCHEMA = 'transport-shock-confirmation-factor-manual-samples-review-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/manual-samples-review-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/shadow-score-latest.json';
const REQUIRED_BUCKETS = [
  'free_route_linked_tanker_transport_pressure_proxy',
  'baltic_weekly_tanker_report_public_route_signal'
];
const MANUAL_SLICE_SCORE_CAP = 70;
const BOUNDARY = 'artifact-only Transport Shock Confirmation Factor manual route-signal shadow-score projection; not production data; not complete factor score; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run project:transport-shock-confirmation-factor-shadow-score -- [options]

Options:
  --input <path>   Manual samples review artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored shadow-score artifact. Default: ${DEFAULT_OUTPUT}
  --json           Print full JSON projection to stdout.
  --no-output      Do not write ignored artifact.
  --help           Show this help.

Boundary:
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production data, frontend, workflow, Worker, ODP finalBias, or main judgment scoring.`);
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    printJson: false,
    writeOutput: true
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
  if (!isSafeInputPath(options.input)) {
    throw new Error(`Refusing to read input outside allowed review paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write shadow-score artifact outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readReview(inputPath) {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) {
    return {
      missing: true,
      safePath: safeRelativePath(inputPath),
      review: null
    };
  }
  return {
    missing: false,
    safePath: safeRelativePath(inputPath),
    review: JSON.parse(readFileSync(absolutePath, 'utf8'))
  };
}

function round(value, decimals = 2) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
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

function boundaries() {
  return {
    outputOnlyToManualArtifacts: true,
    noNetworkCall: true,
    noEnvironmentRead: true,
    noProductionWrite: true,
    noRealtimeWrite: true,
    noWorkflowChange: true,
    noFrontendChange: true,
    noWorkerRuntimeChange: true,
    noRawProviderResponseStored: true,
    completeFactorScoreGenerated: false,
    manualRouteSignalSliceOnly: true
  };
}

function buildBlockedProjection(input, blockers) {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'shadow_score_not_ready',
    recommendation: 'collect_or_fix_manual_samples_review_keep_non_production',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    inputStatus: input.review?.status || (input.missing ? 'missing' : 'unknown'),
    candidateShadowScore: null,
    candidateDirection: 'unavailable',
    confidence: 'none',
    scoreCap: MANUAL_SLICE_SCORE_CAP,
    scoreScope: 'manual_route_signal_slice_only',
    completeFactorScoreGenerated: false,
    productionShadowScoreGenerated: false,
    promotionEligible: false,
    productionWriteApproved: false,
    productionDisplayApproved: false,
    shadowScoreApproved: false,
    frontendDisplayApproved: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    eligibleForMainScore: false,
    blockers,
    warnings: [],
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY
  };
}

function validateReview(input) {
  const blockers = [];
  const review = input.review;
  if (input.missing) blockers.push('input_missing');
  if (!review || typeof review !== 'object') blockers.push('input_not_object');
  if (review?.schemaVersion !== INPUT_SCHEMA) blockers.push('input_schema_invalid');
  if (review?.status !== 'pass') blockers.push('manual_samples_review_not_pass');
  if (review?.recommendation !== 'manual_samples_review_ready_keep_non_production') {
    blockers.push('manual_samples_review_not_ready');
  }
  if (review?.promotionEligible !== false) blockers.push('promotion_eligible_claimed');
  if (review?.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (review?.shadowScoreApproved !== false) blockers.push('shadow_score_approved_claimed');
  if (review?.frontendDisplayApproved !== false) blockers.push('frontend_display_approved_claimed');
  if (review?.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (review?.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (review?.eligibleForMainScore !== false) blockers.push('main_score_eligible_claimed');
  if (review?.boundaries?.noNetworkCall !== true) blockers.push('no_network_boundary_missing');
  if (review?.boundaries?.noProductionWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (review?.productionImpact?.affectsScoring !== false) blockers.push('scoring_impact_not_false');
  if (review?.productionImpact?.affectsMainJudgment !== false) blockers.push('main_judgment_impact_not_false');
  return blockers;
}

function scoreDirection(directionCounts) {
  const tightening = Number(directionCounts?.tightening || 0);
  const easing = Number(directionCounts?.easing || 0);
  const mixed = Number(directionCounts?.mixed || 0);
  const total = Math.max(1, tightening + easing + mixed + Number(directionCounts?.unavailable || 0));
  const netBias = (tightening - easing) / total;
  if (netBias >= 0.3 && tightening >= easing + 2) {
    return { score: 15, candidateDirection: 'tightening_watch', netBias: round(netBias, 3) };
  }
  if (netBias <= -0.3 && easing >= tightening + 2) {
    return { score: 0, candidateDirection: 'easing_watch', netBias: round(netBias, 3) };
  }
  return { score: 7.5, candidateDirection: 'mixed_watch', netBias: round(netBias, 3) };
}

function buildProjection(input) {
  const blockers = validateReview(input);
  if (blockers.length > 0) return buildBlockedProjection(input, blockers);

  const review = input.review;
  const coveredBucketCount = REQUIRED_BUCKETS.filter((bucket) => Number(review.bucketSampleCoverage?.[bucket] || 0) > 0).length;
  const sourceCount = Object.keys(review.sourceCoverage || {}).filter((source) => Number(review.sourceCoverage[source] || 0) > 0).length;
  const sampleReadinessScore = review.usableSampleCount >= review.minSamples ? 20 : 0;
  const bucketCoverageScore = (coveredBucketCount / REQUIRED_BUCKETS.length) * 20;
  const sourceDiversityScore = Math.min(15, sourceCount * 3.75);
  const direction = scoreDirection(review.directionCounts || {});
  const rawScore = sampleReadinessScore + bucketCoverageScore + sourceDiversityScore + direction.score;
  const candidateShadowScore = round(clamp(rawScore, 0, MANUAL_SLICE_SCORE_CAP), 1);
  const warnings = [
    'manual_route_signal_slice_only',
    'missing_live_physical_market_news_thermal_cross_confirmation',
    'production_shadow_score_not_generated'
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'shadow_score_projected_non_production',
    recommendation: 'shadow_score_projection_ready_for_manual_review_keep_non_production',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    inputStatus: review.status,
    candidateShadowScore,
    candidateDirection: direction.candidateDirection,
    confidence: 'low',
    scoreCap: MANUAL_SLICE_SCORE_CAP,
    scoreScope: 'manual_route_signal_slice_only',
    completeFactorScoreGenerated: false,
    productionShadowScoreGenerated: false,
    promotionEligible: false,
    productionWriteApproved: false,
    productionDisplayApproved: false,
    shadowScoreApproved: false,
    frontendDisplayApproved: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    eligibleForMainScore: false,
    componentScores: {
      sampleReadiness: sampleReadinessScore,
      bucketCoverage: round(bucketCoverageScore, 1),
      sourceDiversity: round(sourceDiversityScore, 1),
      directionPressure: direction.score,
      scoreCap: MANUAL_SLICE_SCORE_CAP
    },
    evidenceSummary: {
      sampleCount: review.sampleCount,
      usableSampleCount: review.usableSampleCount,
      coveredBucketCount,
      sourceCount,
      directionCounts: review.directionCounts,
      netDirectionBias: direction.netBias,
      sampleWindow: review.sampleWindow
    },
    blockers: [],
    warnings,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本影子分只是人工路线信号切片投影,缺少实时物理、市场、新闻和设施交叉确认;不得写入生产数据、前端卡片、ODP finalBias 或今日总判断打分。'
  };
}

function writeJson(outputPath, projection) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
}

function printSummary(projection) {
  console.log(`Transport Shock Confirmation Factor shadow-score projection: ${projection.status}`);
  console.log(`recommendation: ${projection.recommendation}`);
  console.log(`candidateShadowScore: ${projection.candidateShadowScore ?? 'n/a'}`);
  console.log(`candidateDirection: ${projection.candidateDirection}`);
  console.log(`eligibleForMainScore: ${projection.eligibleForMainScore}`);
  console.log(`boundary: ${projection.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const projection = buildProjection(readReview(options.input));
    if (options.writeOutput) writeJson(options.output, projection);
    if (options.printJson) console.log(JSON.stringify(projection, null, 2));
    else printSummary(projection);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
