#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-free-proxy-score-replay-v1';
const INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-candidate-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-candidate-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-replay-latest.json';
const BOUNDARY = 'artifact-only Transport Shock Confirmation Factor free-proxy score replay scaffold; no historical backtest performed; no score write; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run replay:transport-shock-confirmation-factor-free-proxy-score-candidate -- [options]

Options:
  --input <path>   Free-proxy score candidate artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored replay scaffold artifact. Default: ${DEFAULT_OUTPUT}
  --json           Print full JSON replay review to stdout.
  --no-output      Do not write ignored artifact.
  --help           Show this help.

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
    throw new Error(`Refusing to read input outside allowed candidate paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write replay scaffold outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readCandidate(inputPath) {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) {
    return {
      missing: true,
      safePath: safeRelativePath(inputPath),
      candidate: null
    };
  }
  return {
    missing: false,
    safePath: safeRelativePath(inputPath),
    candidate: JSON.parse(readFileSync(absolutePath, 'utf8'))
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
    noScoreWrite: true,
    noHistoricalBacktestPerformed: true,
    noRawProviderResponseStored: true,
    artifactOnlyReplayScaffold: true
  };
}

function validateCandidate(input) {
  const blockers = [];
  const candidate = input.candidate;
  const status = candidate?.status;
  const contribution = Number(candidate?.candidateScoreContributionPct);
  const maxContribution = Number(candidate?.maxFutureMainScoreContributionPct);
  if (input.missing) blockers.push('input_missing');
  if (!candidate || typeof candidate !== 'object') blockers.push('input_not_object');
  if (candidate?.schemaVersion !== INPUT_SCHEMA) blockers.push('input_schema_invalid');
  if (!['free_proxy_score_candidate_blocked_no_score_write', 'free_proxy_score_candidate_ready_no_score_write'].includes(status)) {
    blockers.push('candidate_status_invalid');
  }
  if (status === 'free_proxy_score_candidate_blocked_no_score_write' && contribution !== 0) {
    blockers.push('blocked_candidate_contribution_not_zero');
  }
  if (status === 'free_proxy_score_candidate_ready_no_score_write') {
    if (!Number.isFinite(contribution) || contribution <= 0) blockers.push('ready_candidate_contribution_missing');
    if (!Number.isFinite(maxContribution) || maxContribution > 3) blockers.push('ready_candidate_cap_above_three_pct');
    if (Number.isFinite(contribution) && Number.isFinite(maxContribution) && contribution > maxContribution) {
      blockers.push('ready_candidate_contribution_above_cap');
    }
  }
  if (candidate?.scoreWriteApproved !== false) blockers.push('score_write_approved_claimed');
  if (candidate?.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (candidate?.mainScoreApproved !== false) blockers.push('main_score_approved_claimed');
  if (candidate?.eligibleForMainScore !== false) blockers.push('eligible_for_main_score_claimed');
  if (candidate?.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (candidate?.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (candidate?.hardCaps?.newsOnlyContributionPct !== 0) blockers.push('news_only_cap_not_zero');
  if (candidate?.hardCaps?.singleChokepointOnlyContributionPct !== 0) blockers.push('single_chokepoint_cap_not_zero');
  if (candidate?.hardCaps?.stalePortWatchContributionPct !== 0) blockers.push('stale_portwatch_cap_not_zero');
  if (candidate?.productionImpact?.affectsScoring !== false) blockers.push('scoring_impact_not_false');
  if (candidate?.productionImpact?.affectsMainJudgment !== false) blockers.push('main_judgment_impact_not_false');
  if (candidate?.boundaries?.noNetworkCall !== true) blockers.push('no_network_boundary_missing');
  if (candidate?.boundaries?.noProductionWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (candidate?.boundaries?.noScoreWrite !== true) blockers.push('no_score_write_boundary_missing');
  return blockers;
}

function buildInvalidReplay(input, blockers) {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'free_proxy_score_replay_invalid_input',
    recommendation: 'fix_candidate_projection_before_replay_keep_no_score_write',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    inputStatus: input.candidate?.status || (input.missing ? 'missing' : 'unknown'),
    replayControlPass: false,
    historicalBacktestPerformed: false,
    candidateScoreContributionPct: 0,
    falsePositiveGuard: 'not_evaluated',
    scoreWriteApproved: false,
    productionWriteApproved: false,
    scoreIntegrationApproved: false,
    eligibleForMainScore: false,
    blockers,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY
  };
}

function replayControls(candidate) {
  const controls = [
    {
      id: 'news_only',
      description: 'News-only event claims cannot create transport shock score contribution.',
      expectedContributionPct: candidate.hardCaps.newsOnlyContributionPct,
      observedContributionPct: 0,
      pass: candidate.hardCaps.newsOnlyContributionPct === 0
    },
    {
      id: 'single_chokepoint_only',
      description: 'Single chokepoint proxy without non-news confirmation cannot create contribution.',
      expectedContributionPct: candidate.hardCaps.singleChokepointOnlyContributionPct,
      observedContributionPct: 0,
      pass: candidate.hardCaps.singleChokepointOnlyContributionPct === 0
    },
    {
      id: 'stale_portwatch',
      description: 'Stale PortWatch input cannot create contribution.',
      expectedContributionPct: candidate.hardCaps.stalePortWatchContributionPct,
      observedContributionPct: 0,
      pass: candidate.hardCaps.stalePortWatchContributionPct === 0
    },
    candidate.status === 'free_proxy_score_candidate_blocked_no_score_write' ? {
      id: 'blocked_candidate',
      description: 'Blocked candidate projection must remain zero contribution.',
      expectedContributionPct: 0,
      observedContributionPct: candidate.candidateScoreContributionPct,
      pass: candidate.candidateScoreContributionPct === 0
    } : {
      id: 'ready_candidate_cap',
      description: 'Ready candidate projection must remain at or below the free-proxy cap.',
      expectedContributionPct: candidate.maxFutureMainScoreContributionPct,
      observedContributionPct: candidate.candidateScoreContributionPct,
      pass: candidate.maxFutureMainScoreContributionPct <= 3
        && candidate.candidateScoreContributionPct > 0
        && candidate.candidateScoreContributionPct <= candidate.maxFutureMainScoreContributionPct
    }
  ];
  return controls;
}

function buildReplay(input) {
  const blockers = validateCandidate(input);
  if (blockers.length > 0) return buildInvalidReplay(input, blockers);

  const candidate = input.candidate;
  const controls = replayControls(candidate);
  const replayControlPass = controls.every((control) => control.pass === true);
  return {
    schemaVersion: SCHEMA_VERSION,
    status: replayControlPass
      ? 'free_proxy_score_replay_scaffold_pass_no_score_write'
      : 'free_proxy_score_replay_scaffold_failed_no_score_write',
    recommendation: replayControlPass
      ? 'ready_for_historical_replay_sample_design_keep_no_score_write'
      : 'repair_hard_caps_before_any_score_review',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    inputSchemaVersion: candidate.schemaVersion,
    inputStatus: candidate.status,
    replayControlPass,
    historicalBacktestPerformed: false,
    historicalBacktestReady: false,
    replayScope: 'hard_cap_control_scaffold_only',
    inputStatus: candidate.status,
    candidateScoreContributionPct: candidate.candidateScoreContributionPct,
    maxFutureMainScoreContributionPct: candidate.maxFutureMainScoreContributionPct,
    falsePositiveGuard: replayControlPass ? 'zero_contribution_controls_pass' : 'hard_cap_control_failed',
    controls,
    nextRequiredEvidence: [
      'production_history_samples_with_transportShockCandidate',
      'same_direction_non_news_physical_confirmation',
      'market_confirmation_review_samples',
      'thermal_or_eia_anchor_samples',
      'replay_window_with_false_positive_review'
    ],
    scoreWriteApproved: false,
    productionWriteApproved: false,
    scoreIntegrationApproved: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    blockers: replayControlPass ? [] : ['hard_cap_control_failed'],
    warnings: [
      'artifact_only_replay_scaffold',
      'historical_backtest_not_performed',
      'score_integration_still_requires_separate_reviewed_pr'
    ],
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本 replay 只验证免费代理候选的硬性零贡献控制,尚未做历史回放或真实误报率评估;不得写入生产数据或今日总判断打分。'
  };
}

function printSummary(replay) {
  console.log(`Transport Shock free-proxy score replay scaffold: ${replay.status}`);
  console.log(`recommendation: ${replay.recommendation}`);
  console.log(`replayControlPass: ${replay.replayControlPass}`);
  console.log(`historicalBacktestPerformed: ${replay.historicalBacktestPerformed}`);
  console.log(`eligibleForMainScore: ${replay.eligibleForMainScore}`);
  console.log(`boundary: ${replay.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const replay = buildReplay(readCandidate(options.input));
    if (options.writeOutput) writeJson(options.output, replay);
    if (options.printJson) console.log(JSON.stringify(replay, null, 2));
    else printSummary(replay);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
