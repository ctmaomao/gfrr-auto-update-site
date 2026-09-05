#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { DEFAULT_MANIFEST_PATH, readEvidenceManifest } from './lib/free-proxy-evidence-manifest.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';

const INTAKE_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-v1';
const SAMPLE_REVIEW_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1';
const OUTPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review-v1';
const CONTRACT_VERSION = 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-set-review-v1';
const DEFAULT_INPUT_DIR = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-samples';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-samples-review-latest.json';
const DEFAULT_MIN_SAMPLES = 1;
const DEFAULT_MIN_KNOWN_DISRUPTION_SAMPLES = 1;
const DEFAULT_MIN_ZERO_CONTROL_SAMPLES = 0;
const BOUNDARY = 'manual/local Transport Shock free-proxy historical replay real-event sample-set aggregation/readiness review only; writes ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

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
  npm run review:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples -- [options]

Options:
  --input <path>                         P-score-29 intake artifact or sanitized sample review. May be repeated.
  --input-dir <path>                     Directory of P-score-29 archives. Default: ${DEFAULT_INPUT_DIR}
  --manifest <path>                      Reviewed compact metadata only: ${DEFAULT_MANIFEST_PATH}. Exclusive of input options.
  --min-samples <n>                      Minimum usable real-event samples. Default: ${DEFAULT_MIN_SAMPLES}
  --min-known-disruption-samples <n>     Minimum known-disruption samples. Default: ${DEFAULT_MIN_KNOWN_DISRUPTION_SAMPLES}
  --min-zero-control-samples <n>         Minimum zero-control samples. Default: ${DEFAULT_MIN_ZERO_CONTROL_SAMPLES}
  --output <path>                        Ignored review artifact. Default: ${DEFAULT_OUTPUT}
  --allow-empty                          Exit 0 if no inputs exist.
  --strict                               Exit non-zero on FAIL.
  --json                                 Print full JSON review to stdout.
  --no-output                            Do not write ignored artifact.
  --help                                 Show this help.

Boundary:
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/.
  Explicit manifest mode reads only the single reviewed evidence manifest above; never raw archives in that mode.
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
    inputs: [],
    inputDirs: [],
    manifest: null,
    minSamples: DEFAULT_MIN_SAMPLES,
    minKnownDisruptionSamples: DEFAULT_MIN_KNOWN_DISRUPTION_SAMPLES,
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
    else if (arg === '--manifest') {
      if (options.manifest) throw new Error('--manifest may only be supplied once.');
      options.manifest = nextValue();
    }
    else if (arg === '--min-samples') options.minSamples = Number(nextValue());
    else if (arg === '--min-known-disruption-samples') options.minKnownDisruptionSamples = Number(nextValue());
    else if (arg === '--min-zero-control-samples') options.minZeroControlSamples = Number(nextValue());
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.manifest && (options.inputs.length || options.inputDirs.length || options.allowEmpty)) {
    throw new Error('--manifest cannot be combined with --input, --input-dir or --allow-empty.');
  }
  if (!options.manifest && options.inputs.length === 0 && options.inputDirs.length === 0) options.inputDirs.push(DEFAULT_INPUT_DIR);
  for (const [name, value] of [
    ['--min-samples', options.minSamples],
    ['--min-known-disruption-samples', options.minKnownDisruptionSamples],
    ['--min-zero-control-samples', options.minZeroControlSamples]
  ]) {
    if (!Number.isInteger(value) || value < 0 || value > 500) throw new Error(`Invalid ${name}. Expected integer 0..500.`);
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
    if (!existsSync(absoluteDir)) {
      if (options.allowEmpty) continue;
      throw new Error(`Input directory does not exist: ${inputDir}`);
    }
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json')
      .filter((name) => !name.endsWith('.archive-meta.json'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  return [...new Set(files)];
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
    noProductionReplayExecution: true,
    noHistoricalBacktestPerformed: true,
    rawCitationStored: false,
    affectsScoring: false,
    affectsMainJudgment: false
  };
}

function emptyFamilyCoverage() {
  return Object.fromEntries(SAMPLE_FAMILIES.map((family) => [family, 0]));
}

function readInput(filePath) {
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing to read input outside allowed sample paths: ${filePath}`);
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  const artifact = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
  const sampleReview = artifact.schemaVersion === INTAKE_SCHEMA ? artifact.sampleReview : artifact;
  return {
    sourcePath: safeRelativePath(filePath),
    artifact,
    sampleReview
  };
}

function sampleBlockers(input) {
  const blockers = [];
  const sample = input.sampleReview;
  if (!sample || typeof sample !== 'object') blockers.push('sample_review_missing');
  if (input.artifact?.schemaVersion !== INTAKE_SCHEMA && sample?.schemaVersion !== SAMPLE_REVIEW_SCHEMA) blockers.push('unsupported_schema_version');
  if (input.artifact?.schemaVersion === INTAKE_SCHEMA && input.artifact?.status !== 'real_event_sample_intake_ready_keep_no_score_write') blockers.push('intake_status_not_ready');
  if (sample?.schemaVersion !== SAMPLE_REVIEW_SCHEMA) blockers.push('sample_review_schema_invalid');
  if (sample?.status !== 'sample_review_ready_keep_no_score_write') blockers.push('sample_review_status_not_ready');
  if (sample?.acceptedForFutureReplayDataset !== true) blockers.push('not_accepted_for_future_dataset');
  if (sample?.realEventCandidate !== true) blockers.push('real_event_candidate_missing');
  if (!SAMPLE_FAMILIES.includes(sample?.familyKey)) blockers.push('family_key_invalid');
  if (sample?.productionHistoricalReplayPerformed !== false) blockers.push('production_historical_replay_claimed');
  if (sample?.historicalBacktestPerformed !== false) blockers.push('historical_backtest_claimed');
  if (sample?.scoreIntegrationApproved !== false) blockers.push('score_integration_approved_claimed');
  if (sample?.scoreWriteApproved !== false) blockers.push('score_write_approved_claimed');
  if (sample?.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (sample?.eligibleForMainScore !== false) blockers.push('eligible_for_main_score_claimed');
  if (sample?.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (sample?.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (sample?.review?.rawCitationStored !== false) blockers.push('raw_citation_storage_claimed');
  if ((sample?.review?.compactEvidence || []).some((row) => row.rawCitationStored !== false || row.sourceCitation)) blockers.push('compact_evidence_raw_citation_claimed');
  if (JSON.stringify(sample || {}).includes('https://')) blockers.push('raw_url_leaked_in_sample_review');
  if (sample?.boundaries?.noNetworkCall !== true) blockers.push('no_network_boundary_missing');
  if (sample?.boundaries?.noProductionWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (sample?.boundaries?.noScoreWrite !== true) blockers.push('no_score_write_boundary_missing');
  if (sample?.boundaries?.noProductionReplayExecution !== true) blockers.push('no_production_replay_boundary_missing');
  if (sample?.boundaries?.rawCitationStored !== false) blockers.push('raw_citation_boundary_missing');
  if (ZERO_CONTRIBUTION_FAMILIES.has(sample?.familyKey) && Number(sample?.observedCandidateContributionPct || 0) !== 0) blockers.push('zero_control_observed_contribution_not_zero');
  return blockers;
}

function summarizeInput(input) {
  const sample = input.sampleReview || {};
  const blockers = sampleBlockers(input);
  return {
    sourcePath: input.sourcePath,
    sampleId: sample.sampleId || null,
    familyKey: sample.familyKey || null,
    generatedAt: sample.generatedAt || null,
    sampleWindow: sample.sampleWindow || null,
    observedCandidateContributionPct: Number.isFinite(Number(sample.observedCandidateContributionPct)) ? Number(sample.observedCandidateContributionPct) : null,
    evidenceCount: Number(sample.review?.evidenceCount || 0),
    realEventCandidate: sample.realEventCandidate === true,
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
  const samples = inputs.map(summarizeInput);
  const usableSamples = samples.filter((sample) => sample.usable);
  const familyCoverage = emptyFamilyCoverage();
  for (const sample of usableSamples) {
    if (familyCoverage[sample.familyKey] !== undefined) familyCoverage[sample.familyKey] += 1;
  }
  const zeroControlSampleCount = usableSamples.filter((sample) => ZERO_CONTRIBUTION_FAMILIES.has(sample.familyKey)).length;
  const knownDisruptionSampleCount = usableSamples.filter((sample) => sample.familyKey === 'known_disruption_tightening').length;
  const falsePositiveCount = usableSamples.filter((sample) => ZERO_CONTRIBUTION_FAMILIES.has(sample.familyKey) && Number(sample.observedCandidateContributionPct || 0) > 0).length;
  const knownDisruptionDirectionalHitCount = usableSamples.filter((sample) => sample.familyKey === 'known_disruption_tightening' && Number(sample.observedCandidateContributionPct || 0) > 0).length;
  const blockers = samples.flatMap((sample) => sample.blockers.map((reason) => ({ sampleId: sample.sampleId, reason })));
  const warnings = [];
  if (usableSamples.length < options.minSamples) warnings.push('collect_more_real_event_samples');
  if (knownDisruptionSampleCount < options.minKnownDisruptionSamples) warnings.push('collect_more_known_disruption_samples');
  if (zeroControlSampleCount < options.minZeroControlSamples) warnings.push('collect_more_zero_control_real_event_samples');
  if (usableSamples.length < 6) warnings.push('sample_set_below_full_family_fixture_coverage');

  const ready = blockers.length === 0
    && usableSamples.length >= options.minSamples
    && knownDisruptionSampleCount >= options.minKnownDisruptionSamples
    && zeroControlSampleCount >= options.minZeroControlSamples;

  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status: blockers.length > 0
      ? 'real_event_sample_set_review_blocked_keep_no_score_write'
      : ready
        ? 'real_event_sample_set_review_ready_keep_no_score_write'
        : 'real_event_sample_set_review_collect_more_keep_no_score_write',
    recommendation: ready
      ? 'continue_collecting_real_event_samples_before_score_readiness_keep_no_score_write'
      : 'collect_more_real_event_replay_samples_keep_no_score_write',
    generatedAt: new Date().toISOString(),
    minSamples: options.minSamples,
    minKnownDisruptionSamples: options.minKnownDisruptionSamples,
    minZeroControlSamples: options.minZeroControlSamples,
    inputCount: inputs.length,
    sampleCount: samples.length,
    usableSampleCount: usableSamples.length,
    realEventCandidateCount: usableSamples.filter((sample) => sample.realEventCandidate).length,
    zeroControlSampleCount,
    knownDisruptionSampleCount,
    falsePositiveCount,
    falsePositiveRate: zeroControlSampleCount > 0 ? falsePositiveCount / zeroControlSampleCount : null,
    knownDisruptionDirectionalHitCount,
    knownDisruptionDirectionalHitRate: knownDisruptionSampleCount > 0 ? knownDisruptionDirectionalHitCount / knownDisruptionSampleCount : null,
    familyCoverage,
    sampleWindow: minMaxDate(usableSamples),
    blockerCount: blockers.length,
    warningCount: warnings.length,
    promotionEligible: false,
    scoreReadinessApproved: false,
    scoreIntegrationApproved: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    productionDisplayApproved: false,
    frontendDisplayApproved: false,
    mainScoreApproved: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    productionHistoricalReplayPerformed: false,
    historicalBacktestPerformed: false,
    samples,
    blockers,
    warnings,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本 review 只聚合 sanitized 真实事件样本 archive,不执行生产回测,不生成分数,不写生产数据,不进入今日总判断打分。'
  };
}

function buildEmptyReview(options) {
  return {
    ...buildReview([], options),
    status: options.allowEmpty ? 'empty' : 'real_event_sample_set_review_blocked_keep_no_score_write',
    recommendation: 'provide_real_event_sample_intake_archives_under_manual_artifacts',
    blockerCount: options.allowEmpty ? 0 : 1,
    warningCount: 0,
    blockers: options.allowEmpty ? [] : [{ sampleId: null, reason: 'real_event_sample_archives_missing' }],
    warnings: []
  };
}

function printSummary(review) {
  console.log(`Transport Shock free-proxy real-event samples review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`usableSampleCount: ${review.usableSampleCount}`);
  console.log(`knownDisruptionSampleCount: ${review.knownDisruptionSampleCount || 0}`);
  console.log(`zeroControlSampleCount: ${review.zeroControlSampleCount || 0}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputs = options.manifest
      ? readEvidenceManifest(options.manifest)
      : expandInputFiles(options).map(readInput);
    const review = inputs.length > 0
      ? buildReview(inputs, options)
      : buildEmptyReview(options);
    if (options.manifest) {
      review.evidenceInputMode = 'reviewed_manifest_metadata_only';
      review.contributionBasis = 'manual_review_not_model_backtest';
      review.limitationZh = '仅聚合人工审阅的脱敏元数据；哈希用于原件追溯，不代表云端已重新验证原件；候选贡献为人工标注，不是模型历史回测结果，不批准任何生产写入或评分。';
    }
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
    if (options.strict && review.status === 'real_event_sample_set_review_blocked_keep_no_score_write') process.exitCode = 1;
    if (!options.allowEmpty && inputs.length === 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
