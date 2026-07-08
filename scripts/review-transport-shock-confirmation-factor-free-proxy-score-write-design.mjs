#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1';
const CANDIDATE_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-candidate-v1';
const REPLAY_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-replay-v1';
const DEFAULT_CANDIDATE = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-candidate-latest.json';
const DEFAULT_REPLAY = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-replay-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-write-design-review-latest.json';
const MAX_SCORE_CONTRIBUTION_PCT = 3;
const BOUNDARY =
  'manual/local Transport Shock free-proxy score-write design review; validates candidate cap and replay controls only; writes ignored manual-artifacts only; no score write; not production data; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-free-proxy-score-write-design -- [options]

Options:
  --candidate <path>  P-score-20 free-proxy candidate artifact. Default: ${DEFAULT_CANDIDATE}
  --replay <path>     P-score-21 free-proxy replay artifact. Default: ${DEFAULT_REPLAY}
  --output <path>     Ignored design-review artifact. Default: ${DEFAULT_OUTPUT}
  --json              Print full JSON review.
  --no-output         Do not write ignored artifact.
  --help              Show this help.

Boundary:
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production data, frontend, workflow, Worker, ODP finalBias, or main judgment scoring.`);
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function parseArgs(argv) {
  const options = {
    candidate: DEFAULT_CANDIDATE,
    replay: DEFAULT_REPLAY,
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
    if (arg === '--candidate') options.candidate = nextValue();
    else if (arg === '--replay') options.replay = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!isSafeInputPath(options.candidate)) throw new Error(`Refusing candidate outside allowed paths: ${options.candidate}`);
  if (!isSafeInputPath(options.replay)) throw new Error(`Refusing replay outside allowed paths: ${options.replay}`);
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readJson(filePath, label) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return {
      missing: true,
      label,
      safePath: safeRelativePath(filePath),
      data: null
    };
  }
  return {
    missing: false,
    label,
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
    noScoreIntegration: true,
    noScoreWrite: true,
    noMainJudgmentEligibility: true,
    noHistoricalBacktestClaim: true,
    artifactOnlyScoreWriteDesignReview: true,
    affectsScoring: false,
    affectsMainJudgment: false
  };
}

function addBlocker(blockers, id, reasonZh, observed, expected) {
  blockers.push({ id, reasonZh, observed, expected });
}

function validateCandidate(input) {
  const blockers = [];
  const candidate = input.data;
  const contribution = Number(candidate?.candidateScoreContributionPct);
  const cap = Number(candidate?.maxFutureMainScoreContributionPct);
  if (input.missing) addBlocker(blockers, 'candidate_missing', '缺少 P-score-20 candidate artifact。', null, 'present');
  if (!candidate || typeof candidate !== 'object') addBlocker(blockers, 'candidate_not_object', 'candidate 不是对象。', typeof candidate, 'object');
  if (candidate?.schemaVersion !== CANDIDATE_SCHEMA) addBlocker(blockers, 'candidate_schema_invalid', 'candidate schema 不匹配。', candidate?.schemaVersion ?? null, CANDIDATE_SCHEMA);
  if (candidate?.status !== 'free_proxy_score_candidate_ready_no_score_write') {
    addBlocker(blockers, 'candidate_not_ready', 'candidate 尚未达到 no-score-write ready 状态。', candidate?.status ?? null, 'free_proxy_score_candidate_ready_no_score_write');
  }
  if (!Number.isFinite(contribution) || contribution <= 0) addBlocker(blockers, 'candidate_contribution_missing', 'candidate 贡献必须是正数审阅值。', candidate?.candidateScoreContributionPct ?? null, '>0');
  if (!Number.isFinite(cap) || cap > MAX_SCORE_CONTRIBUTION_PCT) {
    addBlocker(blockers, 'candidate_cap_above_limit', '免费代理路径 cap 必须不超过 3%。', candidate?.maxFutureMainScoreContributionPct ?? null, `<=${MAX_SCORE_CONTRIBUTION_PCT}`);
  }
  if (Number.isFinite(contribution) && Number.isFinite(cap) && contribution > cap) {
    addBlocker(blockers, 'candidate_contribution_above_cap', 'candidate 贡献不得超过 cap。', contribution, `<=${cap}`);
  }
  if (candidate?.scoreWriteApproved !== false) addBlocker(blockers, 'candidate_score_write_approved', 'candidate 不得批准 score write。', candidate?.scoreWriteApproved ?? null, false);
  if (candidate?.productionWriteApproved !== false) addBlocker(blockers, 'candidate_production_write_approved', 'candidate 不得批准 production write。', candidate?.productionWriteApproved ?? null, false);
  if (candidate?.mainScoreApproved !== false) addBlocker(blockers, 'candidate_main_score_approved', 'candidate 不得批准 main score。', candidate?.mainScoreApproved ?? null, false);
  if (candidate?.eligibleForMainScore !== false) addBlocker(blockers, 'candidate_main_score_eligible', 'candidate 不得声明 eligibleForMainScore。', candidate?.eligibleForMainScore ?? null, false);
  if (candidate?.routeFreightConfirmation !== 'not_connected') addBlocker(blockers, 'candidate_route_freight_connected', 'candidate 不得连接 route freight confirmation。', candidate?.routeFreightConfirmation ?? null, 'not_connected');
  if (candidate?.marketConfirmation !== 'not_connected') addBlocker(blockers, 'candidate_market_connected', 'candidate 不得连接 market confirmation。', candidate?.marketConfirmation ?? null, 'not_connected');
  if (candidate?.hardCaps?.newsOnlyContributionPct !== 0) addBlocker(blockers, 'candidate_news_only_cap_not_zero', 'news-only cap 必须为 0。', candidate?.hardCaps?.newsOnlyContributionPct ?? null, 0);
  if (candidate?.hardCaps?.singleChokepointOnlyContributionPct !== 0) addBlocker(blockers, 'candidate_single_chokepoint_cap_not_zero', 'single-chokepoint-only cap 必须为 0。', candidate?.hardCaps?.singleChokepointOnlyContributionPct ?? null, 0);
  if (candidate?.hardCaps?.stalePortWatchContributionPct !== 0) addBlocker(blockers, 'candidate_stale_portwatch_cap_not_zero', 'stale PortWatch cap 必须为 0。', candidate?.hardCaps?.stalePortWatchContributionPct ?? null, 0);
  if (candidate?.productionImpact?.affectsScoring !== false) addBlocker(blockers, 'candidate_scoring_impact_not_false', 'candidate 不得影响 scoring。', candidate?.productionImpact?.affectsScoring ?? null, false);
  if (candidate?.boundaries?.noNetworkCall !== true) addBlocker(blockers, 'candidate_no_network_boundary_missing', 'candidate 缺少 noNetworkCall。', candidate?.boundaries?.noNetworkCall ?? null, true);
  if (candidate?.boundaries?.noProductionWrite !== true) addBlocker(blockers, 'candidate_no_production_write_boundary_missing', 'candidate 缺少 noProductionWrite。', candidate?.boundaries?.noProductionWrite ?? null, true);
  if (candidate?.boundaries?.noScoreWrite !== true) addBlocker(blockers, 'candidate_no_score_write_boundary_missing', 'candidate 缺少 noScoreWrite。', candidate?.boundaries?.noScoreWrite ?? null, true);
  return blockers;
}

function validateReplay(input, candidateInput) {
  const blockers = [];
  const replay = input.data;
  const candidate = candidateInput.data;
  if (input.missing) addBlocker(blockers, 'replay_missing', '缺少 P-score-21 replay artifact。', null, 'present');
  if (!replay || typeof replay !== 'object') addBlocker(blockers, 'replay_not_object', 'replay 不是对象。', typeof replay, 'object');
  if (replay?.schemaVersion !== REPLAY_SCHEMA) addBlocker(blockers, 'replay_schema_invalid', 'replay schema 不匹配。', replay?.schemaVersion ?? null, REPLAY_SCHEMA);
  if (replay?.status !== 'free_proxy_score_replay_scaffold_pass_no_score_write') {
    addBlocker(blockers, 'replay_status_not_pass', 'replay 必须是 no-score-write scaffold pass。', replay?.status ?? null, 'free_proxy_score_replay_scaffold_pass_no_score_write');
  }
  if (replay?.inputStatus !== 'free_proxy_score_candidate_ready_no_score_write') {
    addBlocker(blockers, 'replay_input_not_ready_candidate', 'replay 必须基于 ready candidate。', replay?.inputStatus ?? null, 'free_proxy_score_candidate_ready_no_score_write');
  }
  if (replay?.replayControlPass !== true) addBlocker(blockers, 'replay_controls_not_passed', 'replay controls 未全部通过。', replay?.replayControlPass ?? null, true);
  if (replay?.historicalBacktestPerformed !== false) addBlocker(blockers, 'historical_backtest_claimed', '本阶段不得声明已经做过历史回测。', replay?.historicalBacktestPerformed ?? null, false);
  if (replay?.historicalBacktestReady !== false) addBlocker(blockers, 'historical_backtest_ready_claimed', '本阶段不得声明历史回测已就绪。', replay?.historicalBacktestReady ?? null, false);
  if (replay?.scoreIntegrationApproved !== false) addBlocker(blockers, 'replay_score_integration_approved', 'replay 不得批准 score integration。', replay?.scoreIntegrationApproved ?? null, false);
  if (replay?.scoreWriteApproved !== false) addBlocker(blockers, 'replay_score_write_approved', 'replay 不得批准 score write。', replay?.scoreWriteApproved ?? null, false);
  if (replay?.productionWriteApproved !== false) addBlocker(blockers, 'replay_production_write_approved', 'replay 不得批准 production write。', replay?.productionWriteApproved ?? null, false);
  if (replay?.eligibleForMainScore !== false) addBlocker(blockers, 'replay_main_score_eligible', 'replay 不得声明 eligibleForMainScore。', replay?.eligibleForMainScore ?? null, false);
  if (replay?.routeFreightConfirmation !== 'not_connected') addBlocker(blockers, 'replay_route_freight_connected', 'replay 不得连接 route freight confirmation。', replay?.routeFreightConfirmation ?? null, 'not_connected');
  if (replay?.marketConfirmation !== 'not_connected') addBlocker(blockers, 'replay_market_connected', 'replay 不得连接 market confirmation。', replay?.marketConfirmation ?? null, 'not_connected');
  if (candidate && replay && Number(replay.candidateScoreContributionPct) !== Number(candidate.candidateScoreContributionPct)) {
    addBlocker(blockers, 'replay_candidate_contribution_mismatch', 'replay 与 candidate 的贡献值必须一致。', replay.candidateScoreContributionPct ?? null, candidate.candidateScoreContributionPct ?? null);
  }
  if (candidate && replay && Number(replay.maxFutureMainScoreContributionPct) !== Number(candidate.maxFutureMainScoreContributionPct)) {
    addBlocker(blockers, 'replay_candidate_cap_mismatch', 'replay 与 candidate 的 cap 必须一致。', replay.maxFutureMainScoreContributionPct ?? null, candidate.maxFutureMainScoreContributionPct ?? null);
  }
  for (const id of ['news_only', 'single_chokepoint_only', 'stale_portwatch', 'ready_candidate_cap']) {
    const control = Array.isArray(replay?.controls) ? replay.controls.find((item) => item.id === id) : null;
    if (control?.pass !== true) addBlocker(blockers, `replay_control_${id}_not_passed`, `replay control 未通过:${id}`, control?.pass ?? null, true);
  }
  if (replay?.productionImpact?.affectsScoring !== false) addBlocker(blockers, 'replay_scoring_impact_not_false', 'replay 不得影响 scoring。', replay?.productionImpact?.affectsScoring ?? null, false);
  if (replay?.boundaries?.noNetworkCall !== true) addBlocker(blockers, 'replay_no_network_boundary_missing', 'replay 缺少 noNetworkCall。', replay?.boundaries?.noNetworkCall ?? null, true);
  if (replay?.boundaries?.noProductionWrite !== true) addBlocker(blockers, 'replay_no_production_write_boundary_missing', 'replay 缺少 noProductionWrite。', replay?.boundaries?.noProductionWrite ?? null, true);
  if (replay?.boundaries?.noScoreWrite !== true) addBlocker(blockers, 'replay_no_score_write_boundary_missing', 'replay 缺少 noScoreWrite。', replay?.boundaries?.noScoreWrite ?? null, true);
  return blockers;
}

function buildReview(candidateInput, replayInput) {
  const blockers = [
    ...validateCandidate(candidateInput),
    ...validateReplay(replayInput, candidateInput)
  ];
  const candidate = candidateInput.data || {};
  const replay = replayInput.data || {};
  const designReady = blockers.length === 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: designReady
      ? 'score_write_design_review_ready_no_production_write'
      : 'score_write_design_review_blocked_no_production_write',
    recommendation: designReady
      ? 'open_separate_runtime_score_integration_design_review_do_not_auto_wire'
      : 'fix_candidate_or_replay_before_score_write_design_review',
    generatedAt: new Date().toISOString(),
    candidatePath: candidateInput.safePath,
    replayPath: replayInput.safePath,
    candidateStatus: candidate.status ?? (candidateInput.missing ? 'missing' : 'unknown'),
    replayStatus: replay.status ?? (replayInput.missing ? 'missing' : 'unknown'),
    candidateScoreContributionPct: designReady ? Number(candidate.candidateScoreContributionPct) : 0,
    maxFutureMainScoreContributionPct: Number.isFinite(Number(candidate.maxFutureMainScoreContributionPct))
      ? Number(candidate.maxFutureMainScoreContributionPct)
      : null,
    confidence: designReady ? 'low' : 'none',
    scoreWriteDesignReady: designReady,
    scoreDesignScope: 'free_proxy_only_low_weight_candidate_cap_review',
    historicalBacktestPerformed: false,
    historicalBacktestReady: false,
    replayControlPass: replay.replayControlPass === true,
    replayControls: Array.isArray(replay.controls)
      ? replay.controls.map((control) => ({
          id: control.id,
          pass: control.pass === true,
          expectedContributionPct: control.expectedContributionPct ?? null,
          observedContributionPct: control.observedContributionPct ?? null
        }))
      : [],
    requiredBeforeRuntimeScoreIntegration: [
      'separate_reviewed_runtime_score_integration_design_pr',
      'production_payload_mapping_review',
      'score_weight_interaction_review',
      'rollback_and_kill_switch_design',
      'historical_replay_or_post_launch_observation_window',
      'frontend_copy_and_boundary_review'
    ],
    scoreWriteApproved: false,
    productionWriteApproved: false,
    scoreIntegrationApproved: false,
    mainScoreApproved: false,
    frontendDisplayApproved: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    blockerCount: blockers.length,
    blockers,
    warnings: designReady
      ? [
          'design_ready_but_no_score_write',
          'candidate_cap_is_low_weight_three_pct',
          'historical_backtest_not_performed',
          'runtime_integration_requires_separate_review'
        ]
      : ['design_review_blocked_keep_no_score_write'],
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本 review 只确认免费代理候选的 3% cap 与 replay 控制是否自洽;它不批准生产写分,也不证明历史回测、真实误报率或今日油价方向。'
  };
}

function printSummary(review) {
  console.log(`Transport Shock free-proxy score-write design review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`scoreWriteDesignReady: ${review.scoreWriteDesignReady}`);
  console.log(`candidateScoreContributionPct: ${review.candidateScoreContributionPct}`);
  console.log(`blockerCount: ${review.blockerCount}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildReview(
      readJson(options.candidate, 'candidate'),
      readJson(options.replay, 'replay')
    );
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
