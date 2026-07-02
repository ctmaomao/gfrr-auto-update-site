#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-runtime-score-integration-design-review-v1';
const INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-write-design-review-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/runtime-score-integration-design-review-latest.json';
const MAX_SCORE_CONTRIBUTION_PCT = 3;
const BOUNDARY =
  'manual/local Transport Shock runtime score integration design review; design-review artifact only; writes ignored manual-artifacts only; no runtime wiring; no score write; not production data; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-runtime-score-integration-design -- [options]

Options:
  --input <path>   P-score-48 score-write design review artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored runtime-integration design review artifact. Default: ${DEFAULT_OUTPUT}
  --json           Print full JSON review.
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

  if (!isSafeInputPath(options.input)) throw new Error(`Refusing input outside allowed paths: ${options.input}`);
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readJson(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return {
      missing: true,
      safePath: safeRelativePath(filePath),
      data: null
    };
  }
  return {
    missing: false,
    safePath: safeRelativePath(filePath),
    data: JSON.parse(readFileSync(absolutePath, 'utf8'))
  };
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
    noProductionDataRead: true,
    noProductionWrite: true,
    noRealtimeWrite: true,
    noWorkflowChange: true,
    noFrontendChange: true,
    noWorkerRuntimeChange: true,
    noRuntimeWiring: true,
    noScoreIntegration: true,
    noScoreWrite: true,
    noMainJudgmentEligibility: true,
    noContractMigrationByThisReview: true,
    artifactOnlyRuntimeDesignReview: true,
    affectsScoring: false,
    affectsMainJudgment: false
  };
}

function addBlocker(blockers, id, reasonZh, observed, expected) {
  blockers.push({ id, reasonZh, observed, expected });
}

function validateInput(input) {
  const blockers = [];
  const review = input.data;
  const contribution = Number(review?.candidateScoreContributionPct);
  const cap = Number(review?.maxFutureMainScoreContributionPct);
  if (input.missing) addBlocker(blockers, 'score_write_design_review_missing', '缺少 P-score-48 score-write design review artifact。', null, 'present');
  if (!review || typeof review !== 'object') addBlocker(blockers, 'input_not_object', '输入 review 不是对象。', typeof review, 'object');
  if (review?.schemaVersion !== INPUT_SCHEMA) addBlocker(blockers, 'input_schema_invalid', '输入 schema 不匹配。', review?.schemaVersion ?? null, INPUT_SCHEMA);
  if (review?.status !== 'score_write_design_review_ready_no_production_write') {
    addBlocker(blockers, 'score_write_design_not_ready', 'P-score-48 未达到设计 ready 状态。', review?.status ?? null, 'score_write_design_review_ready_no_production_write');
  }
  if (review?.scoreWriteDesignReady !== true) addBlocker(blockers, 'score_write_design_ready_not_true', 'scoreWriteDesignReady 必须为 true。', review?.scoreWriteDesignReady ?? null, true);
  if (Number(review?.blockerCount ?? 1) !== 0) addBlocker(blockers, 'score_write_design_blockers_remaining', 'P-score-48 不得有剩余 blocker。', review?.blockerCount ?? null, 0);
  if (!Number.isFinite(contribution) || contribution <= 0) addBlocker(blockers, 'candidate_contribution_missing', '候选贡献必须为正。', review?.candidateScoreContributionPct ?? null, '>0');
  if (!Number.isFinite(cap) || cap > MAX_SCORE_CONTRIBUTION_PCT) addBlocker(blockers, 'score_cap_above_limit', '免费代理路径 cap 必须不超过 3%。', review?.maxFutureMainScoreContributionPct ?? null, `<=${MAX_SCORE_CONTRIBUTION_PCT}`);
  if (Number.isFinite(contribution) && Number.isFinite(cap) && contribution > cap) addBlocker(blockers, 'candidate_contribution_above_cap', '候选贡献不得超过 cap。', contribution, `<=${cap}`);
  if (review?.historicalBacktestPerformed !== false) addBlocker(blockers, 'historical_backtest_claimed', '本阶段不得声明已经做过历史回测。', review?.historicalBacktestPerformed ?? null, false);
  if (review?.scoreWriteApproved !== false) addBlocker(blockers, 'score_write_approved_claimed', 'P-score-48 不得批准 score write。', review?.scoreWriteApproved ?? null, false);
  if (review?.productionWriteApproved !== false) addBlocker(blockers, 'production_write_approved_claimed', 'P-score-48 不得批准 production write。', review?.productionWriteApproved ?? null, false);
  if (review?.scoreIntegrationApproved !== false) addBlocker(blockers, 'score_integration_approved_claimed', 'P-score-48 不得批准 score integration。', review?.scoreIntegrationApproved ?? null, false);
  if (review?.eligibleForMainScore !== false) addBlocker(blockers, 'main_score_eligible_claimed', 'P-score-48 不得声明 eligibleForMainScore。', review?.eligibleForMainScore ?? null, false);
  if (review?.productionImpact?.affectsScoring !== false) addBlocker(blockers, 'input_scoring_impact_not_false', 'P-score-48 不得影响 scoring。', review?.productionImpact?.affectsScoring ?? null, false);
  if (review?.boundaries?.noProductionWrite !== true) addBlocker(blockers, 'input_no_production_write_boundary_missing', 'P-score-48 缺少 noProductionWrite。', review?.boundaries?.noProductionWrite ?? null, true);
  if (review?.boundaries?.noScoreWrite !== true) addBlocker(blockers, 'input_no_score_write_boundary_missing', 'P-score-48 缺少 noScoreWrite。', review?.boundaries?.noScoreWrite ?? null, true);
  return blockers;
}

function buildReview(input) {
  const blockers = validateInput(input);
  const source = input.data || {};
  const ready = blockers.length === 0;
  const contribution = ready ? Number(source.candidateScoreContributionPct) : 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: ready
      ? 'runtime_score_integration_design_ready_no_production_write'
      : 'runtime_score_integration_design_blocked_no_production_write',
    recommendation: ready
      ? 'separate_review_required_before_any_main_score_write'
      : 'fix_score_write_design_review_before_runtime_integration_design',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    inputStatus: source.status ?? (input.missing ? 'missing' : 'unknown'),
    inputSchemaVersion: source.schemaVersion ?? null,
    futureFactorKey: 'transport_shock_confirmation_factor',
    futureRuntimeSourcePath: 'macroDrivers.energyTransport.transportShockCandidate',
    futureRuntimeMode: 'disabled_until_separate_reviewed_score_pr',
    proposedMaxMainScoreContributionPct: Number.isFinite(Number(source.maxFutureMainScoreContributionPct))
      ? Number(source.maxFutureMainScoreContributionPct)
      : null,
    candidateScoreContributionPct: contribution,
    confidence: ready ? 'low' : 'none',
    runtimeScoreIntegrationDesignReady: ready,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    scoreIntegrationApproved: false,
    runtimeIntegrationApproved: false,
    mainScoreApproved: false,
    frontendDisplayApproved: false,
    eligibleForMainScore: false,
    implementationReviewRequired: true,
    scoreMigrationRequired: true,
    runtimeGuardsRequired: [
      'feature_flag_default_off',
      'kill_switch_or_env_independent_static_disable_path',
      'hard_cap_three_pct',
      'zero_contribution_when_candidate_missing_or_not_live',
      'zero_contribution_when_news_only_or_single_chokepoint_or_stale_portwatch',
      'no_effect_on_odp_final_bias_or_brent_promotion',
      'contract_version_change_review',
      'post_deploy_observation_and_rollback_plan'
    ],
    candidateMappingReview: {
      sourcePath: 'macroDrivers.energyTransport.transportShockCandidate',
      requiredFields: [
        'sourceStatus',
        'latestAgeDays',
        'status',
        'confidence',
        'routeFreightConfirmation',
        'marketConfirmation',
        'eligibleForMainScore'
      ],
      failClosedWhenMissing: true,
      productionMappingApprovedByThisReview: false
    },
    weightingPolicyDraft: {
      maxContributionPct: contribution,
      sign: 'transport_shock_pressure_only',
      additiveOnlyAfterSeparateReview: true,
      cannotOverrideCoreRiskModel: true,
      cannotOverrideOilDirectionalPressureFinalBias: true
    },
    hardStopBeforeImplementation: [
      'authority_docs_must_explicitly_allow_runtime_score_write',
      'main_score_weight_interaction_backtest_required',
      'daily_payload_contract_migration_required',
      'runtime_checks_for_fail_closed_zero_contribution_required',
      'frontend_copy_must_label_low_weight_proxy_not_route_freight_confirmation'
    ],
    blockerCount: blockers.length,
    blockers,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本 review 只列出未来运行时入分设计门槛;它不改主分、不批准生产写分、不证明历史回测,也不改变今天的油价方向判断。'
  };
}

function writeJson(outputPath, value) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock runtime score integration design review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`runtimeScoreIntegrationDesignReady: ${review.runtimeScoreIntegrationDesignReady}`);
  console.log(`candidateScoreContributionPct: ${review.candidateScoreContributionPct}`);
  console.log(`blockerCount: ${review.blockerCount}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildReview(readJson(options.input));
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
