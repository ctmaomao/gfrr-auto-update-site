#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-input-v1';
const REVIEW_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1';
const OUTPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-v1';
const CONTRACT_VERSION = 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-manual-archive-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-sample.json';
const DEFAULT_OUTPUT_DIR = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-samples';
const BOUNDARY = 'manual/local Transport Shock free-proxy historical replay real-event sample intake/archive helper only; writes ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

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
  npm run intake:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample -- [options]

Options:
  --input <path>       Manual real-event sample input. Default: ${DEFAULT_INPUT}
  --output-dir <path>  Ignored archive output directory. Default: ${DEFAULT_OUTPUT_DIR}
  --dry-run            Build intake review without writing archive files.
  --no-output          Do not write archive files.
  --json               Print full JSON to stdout.
  --strict             Exit non-zero unless status is real_event_sample_intake_ready_keep_no_score_write.
  --help               Show this help.

Boundary:
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  Sanitizes source citations to hash/domain hints. No network, env, production data, frontend, workflow, Worker, ODP finalBias, or main judgment scoring.`);
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
    outputDir: DEFAULT_OUTPUT_DIR,
    dryRun: false,
    writeOutput: true,
    printJson: false,
    strict: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
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
    else if (arg === '--output-dir') options.outputDir = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isManualArtifactPath(options.input) && !isFixturePath(options.input)) {
    throw new Error(`Refusing to read input outside allowed paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.outputDir)) {
    throw new Error(`Refusing to write archive outside manual-artifacts/transport-shock-confirmation-factor/: ${options.outputDir}`);
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

function safeFileStem(value) {
  return String(value || 'sample')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 100) || 'sample';
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
    noProductionReplayExecution: true,
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
  if (sample?.sourceRights?.liveFetchApproved !== false) blockers.push('source_rights_live_fetch_not_false');
  if (sample?.sourceRights?.productionWriteApproved !== false) blockers.push('source_rights_production_write_not_false');
  if (sample?.sourceRights?.scoreApproved !== false) blockers.push('source_rights_score_not_false');
  if (sample?.sourceRights?.redistributionApproved !== false) blockers.push('source_rights_redistribution_not_false');
  if (sample?.operatorAttestation?.realEventCandidate !== true) blockers.push('operator_real_event_candidate_missing');
  if (sample?.operatorAttestation?.sourceRightsReviewed !== true) blockers.push('operator_source_rights_review_missing');
  if (sample?.operatorAttestation?.rawCitationStorageApproved !== false) blockers.push('operator_raw_citation_storage_not_false');
  if (sample?.operatorAttestation?.productionUseApproved !== false) blockers.push('operator_production_use_not_false');
  if (sample?.operatorAttestation?.scoreUseApproved !== false) blockers.push('operator_score_use_not_false');
  if (sample?.evidence?.some((row) => row?.rawCitationStored !== false)) blockers.push('raw_citation_storage_claimed');
  if (sample?.evidence?.some((row) => !row?.sourceFamily || !row?.sourceStatus || !row?.confirmationType || !row?.direction)) blockers.push('evidence_shape_invalid');
  return blockers;
}

function compactEvidenceRows(sample) {
  return (sample.evidence || []).map((row) => ({
    sourceFamily: row.sourceFamily,
    sourceStatus: row.sourceStatus,
    direction: row.direction,
    confirmationType: row.confirmationType,
    sourceCitationHash: row.sourceCitation ? sha256(row.sourceCitation) : null,
    sourceDomainHint: row.sourceCitation ? domainHint(row.sourceCitation) : null,
    rawCitationStored: false
  }));
}

function buildSampleReview(input, blockers) {
  const sample = input.sample || {};
  const accepted = blockers.length === 0;
  return {
    schemaVersion: REVIEW_SCHEMA,
    contractVersion: 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-manual-archive-v1',
    status: accepted ? 'sample_review_ready_keep_no_score_write' : 'sample_review_blocked_keep_no_score_write',
    recommendation: accepted
      ? 'archive_sanitized_real_event_sample_for_future_artifact_only_replay_dataset'
      : 'fix_real_event_sample_before_archive',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    sampleId: sample.sampleId || null,
    familyKey: sample.familyKey || null,
    sampleWindow: sample.sampleWindow || null,
    expectedContributionPct: Number.isFinite(Number(sample.expectedContributionPct)) ? Number(sample.expectedContributionPct) : null,
    observedCandidateContributionPct: Number.isFinite(Number(sample.observedCandidateContributionPct)) ? Number(sample.observedCandidateContributionPct) : null,
    confirmations: sample.confirmations || {},
    acceptedForFutureReplayDataset: accepted,
    realEventCandidate: sample.operatorAttestation?.realEventCandidate === true,
    historicalReplayRunnerImplemented: true,
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
    review: {
      evidenceCount: Array.isArray(sample.evidence) ? sample.evidence.length : 0,
      compactEvidence: accepted ? compactEvidenceRows(sample) : [],
      rawCitationStored: false,
      blockers,
      warnings: accepted ? ['manual_real_event_intake_only', 'future_replay_dataset_only'] : []
    },
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本 intake 只把人工真实事件候选样本转为 sanitized replay sample review,不执行生产回测,不生成分数,不写生产数据,不进入今日总判断打分。'
  };
}

function targetPaths(options, sampleReview) {
  const stem = safeFileStem(sampleReview.sampleId || 'sample');
  const hash = sha256(JSON.stringify({
    sampleId: sampleReview.sampleId,
    familyKey: sampleReview.familyKey,
    sampleWindow: sampleReview.sampleWindow,
    compactEvidence: sampleReview.review.compactEvidence
  })).slice(0, 12);
  return {
    reviewPath: resolve(options.outputDir, `${stem}-${hash}.review.json`),
    sidecarPath: resolve(options.outputDir, `${stem}-${hash}.archive-meta.json`)
  };
}

function buildSidecar(options, input, sampleReview, paths) {
  return {
    schemaVersion: 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-archive-meta-v1',
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    sourcePath: input.safePath,
    reviewPath: safeRelativePath(paths.reviewPath),
    sidecarPath: safeRelativePath(paths.sidecarPath),
    rawCitationStored: false,
    productionHistoricalReplayPerformed: false,
    historicalBacktestPerformed: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    eligibleForMainScore: false,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY
  };
}

function buildIntake(input, options) {
  const blockers = validateSample(input);
  const sampleReview = buildSampleReview(input, blockers);
  const paths = targetPaths(options, sampleReview);
  const sidecar = buildSidecar(options, input, sampleReview, paths);
  const ready = blockers.length === 0;
  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status: ready ? 'real_event_sample_intake_ready_keep_no_score_write' : 'real_event_sample_intake_blocked_keep_no_score_write',
    recommendation: ready
      ? 'archive_sanitized_review_under_manual_artifacts_keep_no_score_write'
      : 'fix_real_event_sample_before_archive',
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    inputPath: input.safePath,
    output: {
      outputDir: safeRelativePath(options.outputDir),
      reviewPath: safeRelativePath(paths.reviewPath),
      sidecarPath: safeRelativePath(paths.sidecarPath),
      writeAttempted: options.writeOutput && !options.dryRun
    },
    sampleReview,
    sidecar,
    blockerCount: blockers.length,
    warningCount: ready ? 2 : 0,
    blockers,
    warnings: ready ? ['manual_real_event_intake_only', 'raw_citations_sanitized_to_hash_domain_hint'] : [],
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
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本工具只归档 sanitized 人工真实事件样本审查结果,用于后续人工历史样本集扩展;它不抓取外部源,不执行生产回测,不写生产数据,不进入主判断打分。'
  };
}

function writeArchive(intake) {
  if (!intake.output.writeAttempted) return;
  mkdirSync(dirname(resolve(intake.output.reviewPath)), { recursive: true });
  writeFileSync(resolve(intake.output.reviewPath), `${JSON.stringify(intake.sampleReview, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(intake.output.sidecarPath), `${JSON.stringify(intake.sidecar, null, 2)}\n`, 'utf8');
}

function printSummary(intake) {
  console.log(`Transport Shock free-proxy real-event sample intake: ${intake.status}`);
  console.log(`recommendation: ${intake.recommendation}`);
  console.log(`sampleId: ${intake.sampleReview.sampleId || 'n/a'}`);
  console.log(`familyKey: ${intake.sampleReview.familyKey || 'n/a'}`);
  console.log(`reviewPath: ${intake.output.reviewPath}`);
  console.log(`boundary: ${intake.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const intake = buildIntake(readSample(options.input), options);
    if (options.writeOutput && !options.dryRun) writeArchive(intake);
    if (options.printJson) console.log(JSON.stringify(intake, null, 2));
    else printSummary(intake);
    if (options.strict && intake.status !== 'real_event_sample_intake_ready_keep_no_score_write') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
