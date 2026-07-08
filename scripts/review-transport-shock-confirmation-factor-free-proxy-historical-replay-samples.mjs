#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';

const OUTPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1';
const SAMPLE_REVIEW_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1';
const CONTRACT_VERSION = 'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-samples-review-latest.json';
const DEFAULT_MIN_SAMPLES = 2;
const DEFAULT_MIN_ZERO_CONTROL_SAMPLES = 1;
const BOUNDARY = 'manual/local Transport Shock free-proxy historical replay sample set review only; writes ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const SAMPLE_FAMILIES = [
  'known_disruption_tightening',
  'headline_only_false_positive',
  'single_chokepoint_noise',
  'stale_physical_proxy',
  'market_confirmation_divergence',
  'benign_baseline'
];

const ZERO_CONTRIBUTION_FAMILIES = new Set([
  'headline_only_false_positive',
  'single_chokepoint_noise',
  'stale_physical_proxy',
  'market_confirmation_divergence',
  'benign_baseline'
]);

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-free-proxy-historical-replay-samples -- [options]

Options:
  --input <path>                 P-score-23 sample-review artifact. May be repeated.
  --input-dir <path>             Directory of sample-review JSON artifacts.
  --min-samples <n>              Minimum usable sample reviews. Default: ${DEFAULT_MIN_SAMPLES}
  --min-zero-control-samples <n> Minimum zero-contribution control samples. Default: ${DEFAULT_MIN_ZERO_CONTROL_SAMPLES}
  --output <path>                Ignored sample-set review artifact. Default: ${DEFAULT_OUTPUT}
  --allow-empty                  Exit 0 if no inputs exist.
  --strict                       Exit non-zero on WARN or FAIL.
  --json                         Print full JSON review to stdout.
  --no-output                    Do not write ignored artifact.
  --help                         Show this help.

Boundary:
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, replay execution, production data, frontend, workflow, Worker, ODP finalBias, or main judgment scoring.`);
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    minSamples: DEFAULT_MIN_SAMPLES,
    minZeroControlSamples: DEFAULT_MIN_ZERO_CONTROL_SAMPLES,
    output: DEFAULT_OUTPUT,
    allowEmpty: false,
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
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
      continue;
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
    if (arg === '--input') options.inputs.push(nextValue());
    else if (arg === '--input-dir') options.inputDirs.push(nextValue());
    else if (arg === '--min-samples') options.minSamples = Number(nextValue());
    else if (arg === '--min-zero-control-samples') options.minZeroControlSamples = Number(nextValue());
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 200) {
    throw new Error('Invalid --min-samples. Expected integer 1..200.');
  }
  if (!Number.isInteger(options.minZeroControlSamples) || options.minZeroControlSamples < 0 || options.minZeroControlSamples > 200) {
    throw new Error('Invalid --min-zero-control-samples. Expected integer 0..200.');
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function expandInputFiles(options) {
  const files = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    if (!isSafeInputPath(inputDir)) throw new Error(`Refusing to read directory outside allowed sample paths: ${inputDir}`);
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json')
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  return [...new Set(files)];
}

function readInput(filePath) {
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing to read input outside allowed sample paths: ${filePath}`);
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  return {
    safePath: safeRelativePath(filePath),
    artifact: JSON.parse(readFileSync(resolve(filePath), 'utf8'))
  };
}

function hashText(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value);
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
    noReplayExecution: true,
    noHistoricalBacktestPerformed: true,
    rawCitationStored: false,
    affectsScoring: false,
    affectsMainJudgment: false
  };
}

function emptyFamilyCoverage() {
  return Object.fromEntries(SAMPLE_FAMILIES.map((family) => [family, 0]));
}

function artifactBlockers(artifact) {
  const blockers = [];
  if (artifact.schemaVersion !== SAMPLE_REVIEW_SCHEMA) blockers.push('schema_version_invalid');
  if (artifact.status !== 'sample_review_ready_keep_no_score_write') blockers.push('status_not_ready_no_score_write');
  if (artifact.acceptedForFutureReplayDataset !== true) blockers.push('not_accepted_for_future_replay_dataset');
  if (!SAMPLE_FAMILIES.includes(artifact.familyKey)) blockers.push('family_key_invalid');
  if (!isIsoDate(artifact.sampleWindow?.startDate) || !isIsoDate(artifact.sampleWindow?.endDate)) blockers.push('sample_window_invalid');
  if (artifact.sampleWindow?.startDate > artifact.sampleWindow?.endDate) blockers.push('sample_window_order_invalid');
  if (artifact.historicalReplayRunnerImplemented !== false) blockers.push('historical_replay_runner_claimed');
  if (artifact.historicalBacktestPerformed !== false) blockers.push('historical_backtest_claimed');
  if (artifact.scoreIntegrationApproved !== false) blockers.push('score_integration_approved_claimed');
  if (artifact.scoreWriteApproved !== false) blockers.push('score_write_approved_claimed');
  if (artifact.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (artifact.mainScoreApproved !== false) blockers.push('main_score_approved_claimed');
  if (artifact.eligibleForMainScore !== false) blockers.push('eligible_for_main_score_claimed');
  if (artifact.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (artifact.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (artifact.boundaries?.noNetworkCall !== true) blockers.push('no_network_boundary_missing');
  if (artifact.boundaries?.noProductionWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (artifact.boundaries?.noScoreWrite !== true) blockers.push('no_score_write_boundary_missing');
  if (artifact.boundaries?.noReplayExecution !== true) blockers.push('no_replay_execution_boundary_missing');
  if (artifact.boundaries?.rawCitationStored !== false) blockers.push('raw_citation_boundary_missing');
  if (artifact.review?.rawCitationStored !== false) blockers.push('raw_citation_storage_claimed');
  if ((artifact.review?.compactEvidence || []).some((row) => row.rawCitationStored !== false)) blockers.push('compact_evidence_raw_citation_claimed');
  if (ZERO_CONTRIBUTION_FAMILIES.has(artifact.familyKey)) {
    if (Number(artifact.expectedContributionPct) !== 0) blockers.push('zero_control_expected_contribution_not_zero');
    if (Number(artifact.observedCandidateContributionPct) !== 0) blockers.push('zero_control_observed_contribution_not_zero');
  }
  return blockers;
}

function summarizeInput(input) {
  const artifact = input.artifact;
  const blockers = artifactBlockers(artifact);
  return {
    sampleReviewId: hashText(`${input.safePath}:${artifact.sampleId || ''}:${artifact.generatedAt || ''}`),
    sourcePath: input.safePath,
    sampleId: artifact.sampleId || null,
    generatedAt: artifact.generatedAt || null,
    familyKey: artifact.familyKey || null,
    sampleWindow: artifact.sampleWindow || null,
    expectedContributionPct: Number.isFinite(Number(artifact.expectedContributionPct)) ? Number(artifact.expectedContributionPct) : null,
    observedCandidateContributionPct: Number.isFinite(Number(artifact.observedCandidateContributionPct)) ? Number(artifact.observedCandidateContributionPct) : null,
    evidenceCount: Number(artifact.review?.evidenceCount || 0),
    usable: blockers.length === 0,
    blockers
  };
}

function minMaxDate(samples) {
  const starts = samples.map((sample) => sample.sampleWindow?.startDate).filter(Boolean).sort();
  const ends = samples.map((sample) => sample.sampleWindow?.endDate).filter(Boolean).sort();
  return {
    startDate: starts[0] || null,
    endDate: ends.at(-1) || null
  };
}

function buildReview(inputs, options) {
  const sampleReviews = inputs.map(summarizeInput);
  const usableSamples = sampleReviews.filter((sample) => sample.usable);
  const familyCoverage = emptyFamilyCoverage();
  for (const sample of usableSamples) {
    if (familyCoverage[sample.familyKey] !== undefined) familyCoverage[sample.familyKey] += 1;
  }
  const zeroControlSampleCount = usableSamples.filter((sample) => ZERO_CONTRIBUTION_FAMILIES.has(sample.familyKey)).length;
  const knownDisruptionSampleCount = usableSamples.filter((sample) => sample.familyKey === 'known_disruption_tightening').length;
  const zeroControlContributionPct = usableSamples
    .filter((sample) => ZERO_CONTRIBUTION_FAMILIES.has(sample.familyKey))
    .reduce((sum, sample) => sum + Number(sample.observedCandidateContributionPct || 0), 0);
  const blockers = sampleReviews.flatMap((sample) => sample.blockers.map((reason) => ({
    sampleReviewId: sample.sampleReviewId,
    sampleId: sample.sampleId,
    reason
  })));
  const warnings = [];
  if (usableSamples.length < options.minSamples) warnings.push('collect_more_usable_historical_replay_samples');
  if (zeroControlSampleCount < options.minZeroControlSamples) warnings.push('collect_more_zero_contribution_control_samples');
  if (knownDisruptionSampleCount < 1) warnings.push('collect_known_disruption_tightening_sample');
  if (zeroControlContributionPct !== 0) blockers.push({
    sampleReviewId: 'aggregate',
    sampleId: null,
    reason: 'zero_control_aggregate_contribution_not_zero'
  });

  let status = 'warn';
  let recommendation = 'collect_more_historical_replay_samples_keep_no_score_write';
  if (blockers.length > 0) {
    status = 'fail';
    recommendation = 'fix_sample_reviews_before_replay_dataset_use';
  } else if (usableSamples.length >= options.minSamples && zeroControlSampleCount >= options.minZeroControlSamples && knownDisruptionSampleCount >= 1) {
    status = 'pass';
    recommendation = 'historical_replay_sample_set_ready_keep_no_score_write';
  }

  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status,
    recommendation,
    generatedAt: new Date().toISOString(),
    minSamples: options.minSamples,
    minZeroControlSamples: options.minZeroControlSamples,
    inputCount: inputs.length,
    sampleReviewCount: sampleReviews.length,
    usableSampleReviewCount: usableSamples.length,
    zeroControlSampleCount,
    knownDisruptionSampleCount,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    familyCoverage,
    sampleWindow: minMaxDate(usableSamples),
    zeroControlContributionPct,
    historicalReplayRunnerImplemented: false,
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
    sampleReviews,
    blockers,
    warnings,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本审查只聚合人工历史回放样本审查结果,不执行历史回放,不生成分数,不写生产数据,不进入今日总判断打分。'
  };
}

function buildEmptyReview(options) {
  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status: options.allowEmpty ? 'empty' : 'fail',
    recommendation: 'provide_historical_replay_sample_reviews_under_manual_artifacts',
    generatedAt: new Date().toISOString(),
    minSamples: options.minSamples,
    minZeroControlSamples: options.minZeroControlSamples,
    inputCount: 0,
    sampleReviewCount: 0,
    usableSampleReviewCount: 0,
    zeroControlSampleCount: 0,
    knownDisruptionSampleCount: 0,
    blockerCount: 0,
    warningCount: 0,
    familyCoverage: emptyFamilyCoverage(),
    historicalReplayRunnerImplemented: false,
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
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY
  };
}

function printSummary(review) {
  console.log(`Transport Shock free-proxy historical replay samples review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`sampleReviewCount: ${review.sampleReviewCount}`);
  console.log(`usableSampleReviewCount: ${review.usableSampleReviewCount}`);
  console.log(`zeroControlSampleCount: ${review.zeroControlSampleCount}`);
  console.log(`knownDisruptionSampleCount: ${review.knownDisruptionSampleCount}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputFiles = expandInputFiles(options);
    const review = inputFiles.length > 0
      ? buildReview(inputFiles.map(readInput), options)
      : buildEmptyReview(options);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
    if (options.strict && ['warn', 'fail'].includes(review.status)) process.exitCode = 1;
    if (!options.allowEmpty && inputFiles.length === 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
