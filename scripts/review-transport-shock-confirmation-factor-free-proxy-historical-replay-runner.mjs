#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-v1';
const OUTPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-review-v1';
const CONTRACT_VERSION = 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-fixture-review-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-runner-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-runner-review-latest.json';
const BOUNDARY = 'manual/local Transport Shock free-proxy historical replay runner fixture review only; writes ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const FALSE_IMPACT_KEYS = [
  'writesProductionData',
  'modifiesFrontend',
  'modifiesWorkerRuntime',
  'modifiesWorkflow',
  'affectsValues',
  'affectsDisplayInputsBaseline',
  'affectsEffectiveDisplayInputs',
  'affectsScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance',
  'affectsBrentPromotion',
  'affectsOdpFinalBias',
  'affectsMainJudgment',
  'affectsGlobalRiskHeatmap',
  'affectsCrossValidation'
];

const TRUE_BOUNDARY_KEYS = [
  'outputOnlyToManualArtifacts',
  'noNetworkCall',
  'noEnvironmentRead',
  'noProductionDataRead',
  'noProductionWrite',
  'noRealtimeWrite',
  'noWorkflowChange',
  'noFrontendChange',
  'noWorkerRuntimeChange',
  'noScoreWrite',
  'noProductionReplayExecution',
  'dryRunOnly'
];

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-free-proxy-historical-replay-runner -- [options]

Options:
  --input <path>   P-score-26 runner artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored runner review artifact. Default: ${DEFAULT_OUTPUT}
  --strict         Exit non-zero unless status is runner_fixture_review_pass_keep_no_score_write.
  --json           Print full JSON review to stdout.
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

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    strict: false,
    printJson: false,
    writeOutput: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
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
    if (arg === '--input') options.input = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isManualArtifactPath(options.input) && !isFixturePath(options.input)) {
    throw new Error(`Refusing to read runner artifact outside allowed paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readInput(inputPath) {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) {
    return {
      missing: true,
      safePath: safeRelativePath(inputPath),
      artifact: null
    };
  }
  return {
    missing: false,
    safePath: safeRelativePath(inputPath),
    artifact: JSON.parse(readFileSync(absolutePath, 'utf8'))
  };
}

function falseImpactMap() {
  return Object.fromEntries(FALSE_IMPACT_KEYS.map((key) => [key, false]));
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
    noProductionReplayExecution: true,
    dryRunOnly: true,
    rawCitationStored: false,
    affectsScoring: false,
    affectsMainJudgment: false
  };
}

function artifactBlockers(input) {
  const artifact = input.artifact;
  const blockers = [];
  if (input.missing) blockers.push('runner_artifact_missing');
  if (!artifact || typeof artifact !== 'object') blockers.push('runner_artifact_not_object');
  if (artifact?.schemaVersion !== INPUT_SCHEMA) blockers.push('runner_schema_invalid');
  if (artifact?.contractVersion !== 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-dry-run-v1') blockers.push('runner_contract_invalid');
  if (artifact?.status !== 'dry_run_pass_no_score_write') blockers.push('runner_status_not_pass_no_score_write');
  if (artifact?.replayExecutionMode !== 'dry_run_manual_artifact_only') blockers.push('runner_execution_mode_not_manual_dry_run');
  if (artifact?.dryRunReplayPerformed !== true) blockers.push('dry_run_replay_not_performed');
  if (artifact?.productionHistoricalReplayPerformed !== false) blockers.push('production_historical_replay_claimed');
  if (artifact?.historicalBacktestPerformed !== false) blockers.push('historical_backtest_claimed');
  if (artifact?.scoreIntegrationApproved !== false) blockers.push('score_integration_approved_claimed');
  if (artifact?.scoreWriteApproved !== false) blockers.push('score_write_approved_claimed');
  if (artifact?.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (artifact?.productionDisplayApproved !== false) blockers.push('production_display_approved_claimed');
  if (artifact?.frontendDisplayApproved !== false) blockers.push('frontend_display_approved_claimed');
  if (artifact?.mainScoreApproved !== false) blockers.push('main_score_approved_claimed');
  if (artifact?.eligibleForMainScore !== false) blockers.push('eligible_for_main_score_claimed');
  if (artifact?.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (artifact?.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');

  const metrics = artifact?.metrics || {};
  if (Number(metrics.usableSampleCount || 0) < 2) blockers.push('usable_sample_count_too_low');
  if (Number(metrics.zeroControlSampleCount || 0) < 1) blockers.push('zero_control_sample_count_too_low');
  if (Number(metrics.knownDisruptionSampleCount || 0) < 1) blockers.push('known_disruption_sample_count_too_low');
  if (Number(metrics.zeroControlContributionPct) !== 0) blockers.push('zero_control_contribution_not_zero');
  if (Number(metrics.falsePositiveRate) > 0.2) blockers.push('false_positive_rate_above_threshold');
  if (Number(metrics.knownDisruptionDirectionalHitRate) < 0.6) blockers.push('known_disruption_hit_rate_below_threshold');
  if (Number(metrics.maximumCandidateContributionPct) > 3) blockers.push('candidate_contribution_above_cap');

  const rules = artifact?.passFailRules || {};
  if (Number(rules.maximumFalsePositiveRate) !== 0.2) blockers.push('false_positive_threshold_missing');
  if (Number(rules.minimumKnownDisruptionDirectionalHitRate) !== 0.6) blockers.push('known_disruption_threshold_missing');
  if (Number(rules.maximumCandidateContributionPct) !== 3) blockers.push('candidate_cap_threshold_missing');
  if (Number(rules.zeroControlContributionPct) !== 0) blockers.push('zero_control_threshold_missing');

  for (const key of FALSE_IMPACT_KEYS) {
    if (artifact?.productionImpact?.[key] !== false) blockers.push(`production_impact_${key}_not_false`);
  }
  for (const key of TRUE_BOUNDARY_KEYS) {
    if (artifact?.boundaries?.[key] !== true) blockers.push(`boundary_${key}_not_true`);
  }
  if (artifact?.boundaries?.rawCitationStored !== false) blockers.push('raw_citation_boundary_missing');
  if (artifact?.boundaries?.affectsScoring !== false) blockers.push('affects_scoring_boundary_missing');
  if (artifact?.boundaries?.affectsMainJudgment !== false) blockers.push('affects_main_judgment_boundary_missing');
  if (Array.isArray(artifact?.blockers) && artifact.blockers.length > 0) blockers.push('runner_contains_blockers');
  return blockers;
}

function buildReview(input) {
  const blockers = artifactBlockers(input);
  const artifact = input.artifact || {};
  const passed = blockers.length === 0;
  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status: passed ? 'runner_fixture_review_pass_keep_no_score_write' : 'runner_fixture_review_blocked_keep_no_score_write',
    recommendation: passed
      ? 'expand_historical_replay_samples_before_any_score_candidate_keep_no_score_write'
      : 'fix_runner_output_before_sample_expansion',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    reviewedRunnerSchemaVersion: artifact.schemaVersion || null,
    reviewedRunnerStatus: artifact.status || null,
    blockerCount: blockers.length,
    warningCount: passed ? 2 : 0,
    metrics: {
      usableSampleCount: artifact.metrics?.usableSampleCount ?? null,
      zeroControlSampleCount: artifact.metrics?.zeroControlSampleCount ?? null,
      knownDisruptionSampleCount: artifact.metrics?.knownDisruptionSampleCount ?? null,
      falsePositiveRate: artifact.metrics?.falsePositiveRate ?? null,
      knownDisruptionDirectionalHitRate: artifact.metrics?.knownDisruptionDirectionalHitRate ?? null,
      maximumCandidateContributionPct: artifact.metrics?.maximumCandidateContributionPct ?? null
    },
    passFailRules: artifact.passFailRules || null,
    dryRunReplayPerformed: artifact.dryRunReplayPerformed === true,
    productionHistoricalReplayPerformed: false,
    historicalBacktestPerformed: false,
    scoreIntegrationApproved: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    productionDisplayApproved: false,
    frontendDisplayApproved: false,
    mainScoreApproved: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    blockers,
    warnings: passed ? ['runner_output_fixture_only', 'sample_count_not_sufficient_for_score_candidate'] : [],
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本审查只验证 dry-run runner 输出是否守住误报率、已知扰动命中率、贡献上限和不入分边界;它不是生产回测,也不会让运输冲击因子进入今日总判断打分。'
  };
}

function printSummary(review) {
  console.log(`Transport Shock free-proxy historical replay runner review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`falsePositiveRate: ${review.metrics.falsePositiveRate}`);
  console.log(`knownDisruptionDirectionalHitRate: ${review.metrics.knownDisruptionDirectionalHitRate}`);
  console.log(`maximumCandidateContributionPct: ${review.metrics.maximumCandidateContributionPct}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildReview(readInput(options.input));
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
    if (options.strict && review.status !== 'runner_fixture_review_pass_keep_no_score_write') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
