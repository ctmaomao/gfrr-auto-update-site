#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1';
const OUTPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-v1';
const CONTRACT_VERSION = 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-dry-run-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-samples-review-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-runner-latest.json';
const BOUNDARY = 'manual/local Transport Shock free-proxy historical replay runner dry-run scaffold only; writes ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const ZERO_CONTRIBUTION_FAMILIES = new Set([
  'headline_only_false_positive',
  'single_chokepoint_noise',
  'stale_physical_proxy',
  'market_confirmation_divergence',
  'benign_baseline'
]);

function usage() {
  console.log(`Usage:
  npm run replay:transport-shock-confirmation-factor-free-proxy-historical-replay -- [options]

Options:
  --input <path>   P-score-24 sample-set review artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored dry-run replay artifact. Default: ${DEFAULT_OUTPUT}
  --json           Print full JSON to stdout.
  --no-output      Do not write ignored artifact.
  --strict         Exit non-zero unless status is dry_run_pass_no_score_write.
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
    throw new Error(`Refusing to read input outside allowed paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write replay output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readInput(inputPath) {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) {
    return {
      missing: true,
      safePath: safeRelativePath(inputPath),
      data: null
    };
  }
  return {
    missing: false,
    safePath: safeRelativePath(inputPath),
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
    noScoreWrite: true,
    noProductionReplayExecution: true,
    dryRunOnly: true,
    rawCitationStored: false,
    affectsScoring: false,
    affectsMainJudgment: false
  };
}

function inputBlockers(input) {
  const blockers = [];
  const data = input.data;
  if (input.missing) blockers.push('input_missing');
  if (!data || typeof data !== 'object') blockers.push('input_not_object');
  if (data?.schemaVersion !== INPUT_SCHEMA) blockers.push('input_schema_invalid');
  if (data?.status !== 'pass') blockers.push('sample_set_review_not_pass');
  if (data?.historicalBacktestPerformed !== false) blockers.push('historical_backtest_claimed');
  if (data?.scoreIntegrationApproved !== false) blockers.push('score_integration_approved_claimed');
  if (data?.scoreWriteApproved !== false) blockers.push('score_write_approved_claimed');
  if (data?.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (data?.eligibleForMainScore !== false) blockers.push('eligible_for_main_score_claimed');
  if (data?.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (data?.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (data?.boundaries?.noNetworkCall !== true) blockers.push('no_network_boundary_missing');
  if (data?.boundaries?.noProductionWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (data?.boundaries?.noScoreWrite !== true) blockers.push('no_score_write_boundary_missing');
  if (data?.boundaries?.rawCitationStored !== false) blockers.push('raw_citation_boundary_missing');
  if (!Array.isArray(data?.sampleReviews) || data.sampleReviews.length === 0) blockers.push('sample_reviews_missing');
  return blockers;
}

function buildReplayMetrics(sampleSetReview) {
  const samples = (sampleSetReview.sampleReviews || []).filter((sample) => sample.usable);
  const zeroControls = samples.filter((sample) => ZERO_CONTRIBUTION_FAMILIES.has(sample.familyKey));
  const knownDisruptions = samples.filter((sample) => sample.familyKey === 'known_disruption_tightening');
  const falsePositiveCount = zeroControls.filter((sample) => Number(sample.observedCandidateContributionPct || 0) > 0).length;
  const knownDisruptionHitCount = knownDisruptions.filter((sample) => Number(sample.observedCandidateContributionPct || 0) > 0).length;
  const maximumCandidateContributionPct = samples.reduce(
    (max, sample) => Math.max(max, Number(sample.observedCandidateContributionPct || 0)),
    0
  );
  return {
    usableSampleCount: samples.length,
    familyCoverage: sampleSetReview.familyCoverage || {},
    zeroControlSampleCount: zeroControls.length,
    knownDisruptionSampleCount: knownDisruptions.length,
    zeroControlContributionPct: Number(sampleSetReview.zeroControlContributionPct || 0),
    falsePositiveCount,
    falsePositiveRate: zeroControls.length > 0 ? falsePositiveCount / zeroControls.length : null,
    knownDisruptionDirectionalHitCount: knownDisruptionHitCount,
    knownDisruptionDirectionalHitRate: knownDisruptions.length > 0 ? knownDisruptionHitCount / knownDisruptions.length : null,
    maximumCandidateContributionPct
  };
}

function replayBlockers(metrics) {
  const blockers = [];
  if (metrics.zeroControlContributionPct !== 0) blockers.push('zero_control_contribution_not_zero');
  if (metrics.falsePositiveRate !== null && metrics.falsePositiveRate > 0.2) blockers.push('false_positive_rate_above_threshold');
  if (metrics.knownDisruptionDirectionalHitRate !== null && metrics.knownDisruptionDirectionalHitRate < 0.6) blockers.push('known_disruption_hit_rate_below_threshold');
  if (metrics.maximumCandidateContributionPct > 3) blockers.push('candidate_contribution_above_cap');
  return blockers;
}

function buildReplay(input) {
  const blockers = inputBlockers(input);
  const metrics = blockers.length === 0 ? buildReplayMetrics(input.data) : null;
  const metricBlockers = metrics ? replayBlockers(metrics) : [];
  const allBlockers = [...blockers, ...metricBlockers];
  const passed = allBlockers.length === 0;
  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status: passed ? 'dry_run_pass_no_score_write' : 'dry_run_blocked_no_score_write',
    recommendation: passed
      ? 'dry_run_replay_metrics_ready_for_fixture_review_keep_no_score_write'
      : 'fix_sample_set_review_before_replay_runner_review',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    replayExecutionMode: 'dry_run_manual_artifact_only',
    dryRunReplayPerformed: passed,
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
    metrics: metrics || {
      usableSampleCount: 0,
      zeroControlSampleCount: 0,
      knownDisruptionSampleCount: 0,
      zeroControlContributionPct: null,
      falsePositiveRate: null,
      knownDisruptionDirectionalHitRate: null,
      maximumCandidateContributionPct: null
    },
    passFailRules: {
      maximumFalsePositiveRate: 0.2,
      minimumKnownDisruptionDirectionalHitRate: 0.6,
      maximumCandidateContributionPct: 3,
      zeroControlContributionPct: 0
    },
    blockers: allBlockers,
    warnings: passed ? ['dry_run_only', 'fixture_or_manual_artifact_replay_only'] : [],
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本 dry-run runner 只读取人工样本集审查 artifact 并计算审计指标,不读取生产数据,不执行生产回测,不生成主分数,不进入今日总判断打分。'
  };
}

function writeJson(outputPath, replay) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(replay, null, 2)}\n`, 'utf8');
}

function printSummary(replay) {
  console.log(`Transport Shock free-proxy historical replay dry-run: ${replay.status}`);
  console.log(`recommendation: ${replay.recommendation}`);
  console.log(`usableSampleCount: ${replay.metrics.usableSampleCount}`);
  console.log(`falsePositiveRate: ${replay.metrics.falsePositiveRate}`);
  console.log(`knownDisruptionDirectionalHitRate: ${replay.metrics.knownDisruptionDirectionalHitRate}`);
  console.log(`maximumCandidateContributionPct: ${replay.metrics.maximumCandidateContributionPct}`);
  console.log(`boundary: ${replay.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const replay = buildReplay(readInput(options.input));
    if (options.writeOutput) writeJson(options.output, replay);
    if (options.printJson) console.log(JSON.stringify(replay, null, 2));
    else printSummary(replay);
    if (options.strict && replay.status !== 'dry_run_pass_no_score_write') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
