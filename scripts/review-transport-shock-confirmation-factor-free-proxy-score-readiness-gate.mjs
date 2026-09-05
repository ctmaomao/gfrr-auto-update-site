#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, readJson, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import process from 'node:process';

const INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review-v1';
const OUTPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1';
const CONTRACT_VERSION = 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-samples-review-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-latest.json';
const DEFAULT_MIN_REAL_EVENT_SAMPLES = 6;
const DEFAULT_MIN_KNOWN_DISRUPTION_SAMPLES = 3;
const DEFAULT_MIN_ZERO_CONTROL_SAMPLES = 3;
const DEFAULT_MAX_FALSE_POSITIVE_RATE = 0.2;
const DEFAULT_MIN_KNOWN_DISRUPTION_DIRECTIONAL_HIT_RATE = 0.6;
const BOUNDARY =
  'manual/local Transport Shock free-proxy score-readiness gate using real-event sample-set review only; writes ignored manual-artifacts only; not production data; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-free-proxy-score-readiness-gate -- [options]

Options:
  --input <path>                                  P-score-30 real-event sample-set review. Default: ${DEFAULT_INPUT}
  --min-real-event-samples <n>                    Minimum usable real-event samples. Default: ${DEFAULT_MIN_REAL_EVENT_SAMPLES}
  --min-known-disruption-samples <n>              Minimum known-disruption samples. Default: ${DEFAULT_MIN_KNOWN_DISRUPTION_SAMPLES}
  --min-zero-control-samples <n>                  Minimum zero-control samples. Default: ${DEFAULT_MIN_ZERO_CONTROL_SAMPLES}
  --max-false-positive-rate <n>                   Maximum zero-control false-positive rate. Default: ${DEFAULT_MAX_FALSE_POSITIVE_RATE}
  --min-known-disruption-directional-hit-rate <n> Minimum known-disruption directional hit rate. Default: ${DEFAULT_MIN_KNOWN_DISRUPTION_DIRECTIONAL_HIT_RATE}
  --output <path>                                 Ignored gate artifact. Default: ${DEFAULT_OUTPUT}
  --json                                          Print full JSON gate to stdout.
  --no-output                                     Do not write ignored artifact.
  --strict                                        Exit non-zero if gate unexpectedly passes.
  --help                                          Show this help.

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

function parseBoundedNumber(label, value, { min, max }) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Invalid ${label}. Expected ${min}..${max}.`);
  }
  return number;
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    minRealEventSamples: DEFAULT_MIN_REAL_EVENT_SAMPLES,
    minKnownDisruptionSamples: DEFAULT_MIN_KNOWN_DISRUPTION_SAMPLES,
    minZeroControlSamples: DEFAULT_MIN_ZERO_CONTROL_SAMPLES,
    maxFalsePositiveRate: DEFAULT_MAX_FALSE_POSITIVE_RATE,
    minKnownDisruptionDirectionalHitRate: DEFAULT_MIN_KNOWN_DISRUPTION_DIRECTIONAL_HIT_RATE,
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
    else if (arg === '--min-real-event-samples') options.minRealEventSamples = parseBoundedNumber(arg, nextValue(), { min: 1, max: 500 });
    else if (arg === '--min-known-disruption-samples') options.minKnownDisruptionSamples = parseBoundedNumber(arg, nextValue(), { min: 1, max: 500 });
    else if (arg === '--min-zero-control-samples') options.minZeroControlSamples = parseBoundedNumber(arg, nextValue(), { min: 0, max: 500 });
    else if (arg === '--max-false-positive-rate') options.maxFalsePositiveRate = parseBoundedNumber(arg, nextValue(), { min: 0, max: 1 });
    else if (arg === '--min-known-disruption-directional-hit-rate') options.minKnownDisruptionDirectionalHitRate = parseBoundedNumber(arg, nextValue(), { min: 0, max: 1 });
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!isSafeInputPath(options.input)) throw new Error(`Refusing to read input outside allowed paths: ${options.input}`);
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write gate outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
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
    noProductionReplayExecution: true,
    noHistoricalBacktestPerformed: true,
    affectsScoring: false,
    affectsMainJudgment: false
  };
}

function addBlocker(blockers, id, reasonZh, observed, threshold) {
  blockers.push({ id, reasonZh, observed, threshold });
}

function inputBoundaryBlockers(review) {
  const blockers = [];
  if (review.schemaVersion !== INPUT_SCHEMA) addBlocker(blockers, 'input_schema_invalid', 'P-score-30 real-event sample-set review schema 不匹配。', review.schemaVersion ?? null, INPUT_SCHEMA);
  if (!['real_event_sample_set_review_ready_keep_no_score_write', 'real_event_sample_set_review_collect_more_keep_no_score_write'].includes(review.status)) {
    addBlocker(blockers, 'input_status_not_ready', 'P-score-30 real-event sample-set review 状态不是可用于 gate 的 no-score-write 状态。', review.status ?? null, 'ready_or_collect_more_no_score_write');
  }
  if (review.scoreReadinessApproved !== false) addBlocker(blockers, 'input_score_readiness_approval_claimed', '输入 review 不得批准 score readiness。', review.scoreReadinessApproved ?? null, false);
  if (review.scoreIntegrationApproved !== false) addBlocker(blockers, 'input_score_integration_approved_claimed', '输入 review 不得批准 score integration。', review.scoreIntegrationApproved ?? null, false);
  if (review.scoreWriteApproved !== false) addBlocker(blockers, 'input_score_write_approved_claimed', '输入 review 不得批准 score write。', review.scoreWriteApproved ?? null, false);
  if (review.productionWriteApproved !== false) addBlocker(blockers, 'input_production_write_approved_claimed', '输入 review 不得批准 production write。', review.productionWriteApproved ?? null, false);
  if (review.eligibleForMainScore !== false) addBlocker(blockers, 'input_main_score_eligibility_claimed', '输入 review 不得声明 eligibleForMainScore。', review.eligibleForMainScore ?? null, false);
  if (review.productionHistoricalReplayPerformed !== false) addBlocker(blockers, 'production_historical_replay_claimed', '输入 review 不得声明已经执行生产历史回放。', review.productionHistoricalReplayPerformed ?? null, false);
  if (review.historicalBacktestPerformed !== false) addBlocker(blockers, 'historical_backtest_claimed', '输入 review 不得声明已经执行历史回测。', review.historicalBacktestPerformed ?? null, false);
  if (review.routeFreightConfirmation !== 'not_connected') addBlocker(blockers, 'route_freight_confirmation_connected', '真实事件样本 review 不得把 routeFreightConfirmation 改成 connected。', review.routeFreightConfirmation ?? null, 'not_connected');
  if (review.marketConfirmation !== 'not_connected') addBlocker(blockers, 'market_confirmation_connected', '真实事件样本 review 不得把 marketConfirmation 改成 connected。', review.marketConfirmation ?? null, 'not_connected');
  if (review.boundaries?.noNetworkCall !== true) addBlocker(blockers, 'no_network_boundary_missing', '输入 review 缺少 noNetworkCall 边界。', review.boundaries?.noNetworkCall ?? null, true);
  if (review.boundaries?.noProductionWrite !== true) addBlocker(blockers, 'no_production_write_boundary_missing', '输入 review 缺少 noProductionWrite 边界。', review.boundaries?.noProductionWrite ?? null, true);
  if (review.boundaries?.noScoreWrite !== true) addBlocker(blockers, 'no_score_write_boundary_missing', '输入 review 缺少 noScoreWrite 边界。', review.boundaries?.noScoreWrite ?? null, true);
  if (review.boundaries?.noProductionReplayExecution !== true) addBlocker(blockers, 'no_production_replay_boundary_missing', '输入 review 缺少 noProductionReplayExecution 边界。', review.boundaries?.noProductionReplayExecution ?? null, true);
  if (String(JSON.stringify(review)).includes('https://')) addBlocker(blockers, 'raw_url_leaked_in_input_review', '输入 review 不得泄漏 raw URL。', 'raw_url_present', 'no_raw_url');
  return blockers;
}

function thresholdBlockers(review, options) {
  const blockers = [];
  const usableSampleCount = Number(review.usableSampleCount || 0);
  const knownDisruptionSampleCount = Number(review.knownDisruptionSampleCount || 0);
  const zeroControlSampleCount = Number(review.zeroControlSampleCount || 0);
  const falsePositiveRate = Number.isFinite(review.falsePositiveRate) ? review.falsePositiveRate : null;
  const knownHitRate = Number.isFinite(review.knownDisruptionDirectionalHitRate) ? review.knownDisruptionDirectionalHitRate : null;

  if (usableSampleCount < options.minRealEventSamples) addBlocker(blockers, 'real_event_sample_count_below_threshold', '真实事件样本数不足,不能进入入分设计审阅。', usableSampleCount, options.minRealEventSamples);
  if (knownDisruptionSampleCount < options.minKnownDisruptionSamples) addBlocker(blockers, 'known_disruption_sample_count_below_threshold', 'known-disruption 样本不足,无法证明冲击方向命中。', knownDisruptionSampleCount, options.minKnownDisruptionSamples);
  if (zeroControlSampleCount < options.minZeroControlSamples) addBlocker(blockers, 'zero_control_sample_count_below_threshold', 'zero-control 样本不足,无法估计误报率。', zeroControlSampleCount, options.minZeroControlSamples);
  if (options.minZeroControlSamples > 0 && falsePositiveRate === null) addBlocker(blockers, 'false_positive_rate_unavailable', '缺少 zero-control 样本时 false-positive rate 不可用。', null, `<=${options.maxFalsePositiveRate}`);
  if (falsePositiveRate !== null && falsePositiveRate > options.maxFalsePositiveRate) addBlocker(blockers, 'false_positive_rate_above_threshold', '真实事件样本集误报率超过阈值。', falsePositiveRate, `<=${options.maxFalsePositiveRate}`);
  if (knownHitRate === null) addBlocker(blockers, 'known_disruption_directional_hit_rate_unavailable', 'known-disruption directional hit rate 不可用。', null, `>=${options.minKnownDisruptionDirectionalHitRate}`);
  if (knownHitRate !== null && knownHitRate < options.minKnownDisruptionDirectionalHitRate) addBlocker(blockers, 'known_disruption_directional_hit_rate_below_threshold', 'known-disruption directional hit rate 低于阈值。', knownHitRate, `>=${options.minKnownDisruptionDirectionalHitRate}`);
  return blockers;
}

function buildGate(review, options) {
  const inputBlockers = inputBoundaryBlockers(review);
  const metricBlockers = thresholdBlockers(review, options);
  const blockers = [...inputBlockers, ...metricBlockers];
  const gatePassed = blockers.length === 0;

  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status: gatePassed
      ? 'score_readiness_gate_ready_for_separate_review_keep_no_score_write'
      : 'score_readiness_gate_collect_more_keep_no_score_write',
    recommendation: gatePassed
      ? 'open_separate_score_integration_review_no_auto_wire'
      : 'continue_collecting_real_event_samples_before_score_integration_review',
    generatedAt: new Date().toISOString(),
    inputPath: safeRelativePath(options.input),
    thresholds: {
      minRealEventSamples: options.minRealEventSamples,
      minKnownDisruptionSamples: options.minKnownDisruptionSamples,
      minZeroControlSamples: options.minZeroControlSamples,
      maxFalsePositiveRate: options.maxFalsePositiveRate,
      minKnownDisruptionDirectionalHitRate: options.minKnownDisruptionDirectionalHitRate
    },
    observed: {
      sampleCount: Number(review.sampleCount || 0),
      usableSampleCount: Number(review.usableSampleCount || 0),
      realEventCandidateCount: Number(review.realEventCandidateCount || 0),
      knownDisruptionSampleCount: Number(review.knownDisruptionSampleCount || 0),
      zeroControlSampleCount: Number(review.zeroControlSampleCount || 0),
      falsePositiveCount: Number(review.falsePositiveCount || 0),
      falsePositiveRate: Number.isFinite(review.falsePositiveRate) ? review.falsePositiveRate : null,
      knownDisruptionDirectionalHitCount: Number(review.knownDisruptionDirectionalHitCount || 0),
      knownDisruptionDirectionalHitRate: Number.isFinite(review.knownDisruptionDirectionalHitRate) ? review.knownDisruptionDirectionalHitRate : null,
      familyCoverage: review.familyCoverage || {}
    },
    gatePassed,
    scoreReadinessGatePassed: gatePassed,
    scoreReadinessApproved: false,
    scoreIntegrationApproved: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    frontendDisplayApproved: false,
    mainScoreApproved: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    productionHistoricalReplayPerformed: false,
    historicalBacktestPerformed: false,
    blockerCount: blockers.length,
    contributionBasis: 'manual_review_not_model_backtest',
    blockers,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本 gate 只聚合 P-score-30 人工事件样本；候选贡献与命中/误报统计来自人工标注，不是生产模型历史回测。通过只允许另开 reviewed score integration 设计，不批准生产写入或自动入分。'
  };
}

function printSummary(gate) {
  console.log(`Transport Shock free-proxy score-readiness gate: ${gate.status}`);
  console.log(`recommendation: ${gate.recommendation}`);
  console.log(`gatePassed: ${gate.gatePassed}`);
  console.log(`blockerCount: ${gate.blockerCount}`);
  console.log(`blockers: ${gate.blockers.map((blocker) => blocker.id).join(', ') || 'none'}`);
  console.log(`boundary: ${gate.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = readJson(options.input);
    const gate = buildGate(review, options);
    if (options.writeOutput) writeJson(options.output, gate);
    if (options.printJson) console.log(JSON.stringify(gate, null, 2));
    else printSummary(gate);
    if (options.strict && gate.gatePassed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
