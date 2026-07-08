#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-input-v1';
const OUTPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1';
const CONTRACT_VERSION = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-scaffold-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-sample.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-latest.json';
const BOUNDARY = 'manual/local Transport Shock free-proxy historical replay sample scaffold only; writes ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const SAMPLE_FAMILIES = new Set([
  'known_disruption_tightening',
  'headline_only_false_positive',
  'single_chokepoint_noise',
  'stale_physical_proxy',
  'market_confirmation_divergence',
  'benign_baseline'
]);

const ZERO_CONTRIBUTION_FAMILIES = new Set([
  'headline_only_false_positive',
  'single_chokepoint_noise',
  'stale_physical_proxy',
  'market_confirmation_divergence',
  'benign_baseline'
]);

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-free-proxy-historical-replay-sample -- [options]

Options:
  --input <path>   Historical replay sample input. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored sample-review artifact. Default: ${DEFAULT_OUTPUT}
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
  if (!isManualArtifactPath(options.input) && !isFixturePath(options.input)) {
    throw new Error(`Refusing to read input outside allowed sample paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write sample review outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readSample(inputPath) {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) {
    return {
      missing: true,
      safePath: safeRelativePath(inputPath),
      sample: null
    };
  }
  return {
    missing: false,
    safePath: safeRelativePath(inputPath),
    sample: JSON.parse(readFileSync(absolutePath, 'utf8'))
  };
}

function sha256(text) {
  return createHash('sha256').update(String(text || '')).digest('hex');
}

function domainHint(citation) {
  try {
    return new URL(String(citation)).hostname.replace(/^www\./u, '');
  } catch {
    return null;
  }
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

function validateSample(input) {
  const blockers = [];
  const sample = input.sample;
  if (input.missing) blockers.push('input_missing');
  if (!sample || typeof sample !== 'object') blockers.push('input_not_object');
  if (sample?.schemaVersion !== INPUT_SCHEMA) blockers.push('input_schema_invalid');
  if (!sample?.sampleId || typeof sample.sampleId !== 'string') blockers.push('sample_id_missing');
  if (!SAMPLE_FAMILIES.has(sample?.familyKey)) blockers.push('sample_family_invalid');
  if (!isIsoDate(sample?.sampleWindow?.startDate) || !isIsoDate(sample?.sampleWindow?.endDate)) blockers.push('sample_window_invalid');
  if (sample?.sampleWindow?.startDate > sample?.sampleWindow?.endDate) blockers.push('sample_window_order_invalid');
  if (!Array.isArray(sample?.evidence) || sample.evidence.length === 0) blockers.push('evidence_missing');
  if (ZERO_CONTRIBUTION_FAMILIES.has(sample?.familyKey)) {
    if (Number(sample?.expectedContributionPct) !== 0) blockers.push('zero_control_expected_contribution_not_zero');
    if (Number(sample?.observedCandidateContributionPct) !== 0) blockers.push('zero_control_observed_contribution_not_zero');
  }
  if (sample?.evidence?.some((row) => row?.rawCitationStored !== false)) blockers.push('raw_citation_storage_claimed');
  if (sample?.evidence?.some((row) => !row?.sourceFamily || !row?.confirmationType || !row?.direction)) blockers.push('evidence_shape_invalid');
  return blockers;
}

function compactEvidenceRows(sample) {
  return (sample.evidence || []).map((row) => ({
    sourceFamily: row.sourceFamily,
    sourceStatus: row.sourceStatus || 'unknown',
    direction: row.direction,
    confirmationType: row.confirmationType,
    sourceCitationHash: row.sourceCitation ? sha256(row.sourceCitation) : null,
    sourceDomainHint: row.sourceCitation ? domainHint(row.sourceCitation) : null,
    rawCitationStored: false
  }));
}

function buildReview(input) {
  const blockers = validateSample(input);
  const sample = input.sample || {};
  const accepted = blockers.length === 0;
  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status: accepted ? 'sample_review_ready_keep_no_score_write' : 'sample_review_blocked_keep_no_score_write',
    recommendation: accepted
      ? 'include_sample_in_future_artifact_only_replay_dataset'
      : 'fix_sample_before_future_replay_dataset_inclusion',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    sampleId: sample.sampleId || null,
    familyKey: sample.familyKey || null,
    sampleWindow: sample.sampleWindow || null,
    expectedContributionPct: Number.isFinite(Number(sample.expectedContributionPct)) ? Number(sample.expectedContributionPct) : null,
    observedCandidateContributionPct: Number.isFinite(Number(sample.observedCandidateContributionPct)) ? Number(sample.observedCandidateContributionPct) : null,
    confirmations: sample.confirmations || {},
    acceptedForFutureReplayDataset: accepted,
    historicalReplayRunnerImplemented: false,
    historicalBacktestPerformed: false,
    scoreIntegrationApproved: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    mainScoreApproved: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    review: {
      evidenceCount: Array.isArray(sample.evidence) ? sample.evidence.length : 0,
      compactEvidence: accepted ? compactEvidenceRows(sample) : [],
      rawCitationStored: false,
      blockers,
      warnings: accepted ? ['artifact_only_sample_review', 'future_replay_dataset_only'] : []
    },
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本审查只验证单条人工历史回放样本形状,不执行历史回放,不生成分数,不写生产数据,不进入今日总判断打分。'
  };
}

function printSummary(review) {
  console.log(`Transport Shock free-proxy historical replay sample review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`sampleId: ${review.sampleId || 'n/a'}`);
  console.log(`familyKey: ${review.familyKey || 'n/a'}`);
  console.log(`acceptedForFutureReplayDataset: ${review.acceptedForFutureReplayDataset}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildReview(readSample(options.input));
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
