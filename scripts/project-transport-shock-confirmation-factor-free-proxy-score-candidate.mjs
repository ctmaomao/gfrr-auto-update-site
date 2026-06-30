#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-free-proxy-score-candidate-v1';
const INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-design-v1';
const DEFAULT_INPUT = 'docs/fixtures/transport-shock-confirmation-factor-free-proxy-score-design-v1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-candidate-latest.json';
const BOUNDARY = 'artifact-only Transport Shock Confirmation Factor free-proxy score candidate projection; no score write; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run project:transport-shock-confirmation-factor-free-proxy-score-candidate -- [options]

Options:
  --input <path>   Free-proxy score design fixture or ignored manual artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored candidate artifact. Default: ${DEFAULT_OUTPUT}
  --json           Print full JSON projection to stdout.
  --no-output      Do not write ignored artifact.
  --help           Show this help.

Boundary:
  Reads only docs/fixtures/transport-shock-confirmation-factor-free-proxy-score-design-v1.json or manual-artifacts/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production data write, frontend, workflow, Worker, ODP finalBias, or main judgment scoring.`);
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

function isAllowedDesignFixture(filePath) {
  return safeRelativePath(filePath) === DEFAULT_INPUT;
}

function isSafeInputPath(filePath) {
  return isAllowedDesignFixture(filePath) || isManualArtifactPath(filePath);
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
    throw new Error(`Refusing to read input outside allowed design paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write candidate artifact outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readDesign(inputPath) {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) {
    return {
      missing: true,
      safePath: safeRelativePath(inputPath),
      design: null
    };
  }
  return {
    missing: false,
    safePath: safeRelativePath(inputPath),
    design: JSON.parse(readFileSync(absolutePath, 'utf8'))
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
    noRawProviderResponseStored: true,
    artifactOnlyCandidateProjection: true
  };
}

function validateDesign(input) {
  const blockers = [];
  const design = input.design;
  if (input.missing) blockers.push('input_missing');
  if (!design || typeof design !== 'object') blockers.push('input_not_object');
  if (design?.contractVersion !== INPUT_SCHEMA) blockers.push('input_contract_version_invalid');
  if (design?.status !== 'design_only_no_score_write') blockers.push('input_status_not_design_only');
  if (design?.scoreCap?.maxFutureMainScoreContributionPct !== 3) blockers.push('score_cap_not_three_pct');
  if (design?.scoreCap?.newsOnlyContributionPct !== 0) blockers.push('news_only_cap_not_zero');
  if (design?.scoreCap?.singleChokepointOnlyContributionPct !== 0) blockers.push('single_chokepoint_cap_not_zero');
  if (design?.scoreCap?.stalePortWatchContributionPct !== 0) blockers.push('stale_portwatch_cap_not_zero');
  if (design?.currentProductionState?.productionScoreWritten !== false) blockers.push('production_score_written_claimed');
  if (design?.currentProductionState?.mainScoreAffected !== false) blockers.push('main_score_affected_claimed');
  if (design?.currentProductionState?.eligibleForMainScore !== false) blockers.push('eligible_for_main_score_claimed');
  if (design?.currentProductionState?.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (design?.currentProductionState?.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (design?.approvalState?.scoreWriteApproved !== false) blockers.push('score_write_approved_claimed');
  if (design?.approvalState?.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (design?.approvalState?.mainScoreApproved !== false) blockers.push('main_score_approved_claimed');
  if (design?.approvalState?.odpFinalBiasApproved !== false) blockers.push('odp_final_bias_approved_claimed');
  if (design?.boundaries?.noProductionDataWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (design?.boundaries?.noScoreWrite !== true) blockers.push('no_score_write_boundary_missing');
  return blockers;
}

function plannedComponentCaps(maxContributionPct) {
  return {
    portwatchChokepointPhysicalProxyPct: 1,
    nonNewsPhysicalCrossCheckPct: 0.75,
    marketConfirmationProxyPct: 0.75,
    historyBacktestStabilityPct: 0.5,
    totalCapPct: maxContributionPct
  };
}

function buildBlockedProjection(input, blockers) {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'free_proxy_score_candidate_invalid_input',
    recommendation: 'fix_free_proxy_score_design_keep_no_score_write',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    inputStatus: input.design?.status || (input.missing ? 'missing' : 'unknown'),
    maxFutureMainScoreContributionPct: null,
    candidateScoreContributionPct: 0,
    confidence: 'none',
    scoreScope: 'free_proxy_only_low_weight_candidate',
    scoreWriteApproved: false,
    productionWriteApproved: false,
    mainScoreApproved: false,
    freeProxyScoreGenerated: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    blockers,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY
  };
}

function buildProjection(input) {
  const blockers = validateDesign(input);
  if (blockers.length > 0) return buildBlockedProjection(input, blockers);

  const design = input.design;
  const maxContributionPct = design.scoreCap.maxFutureMainScoreContributionPct;
  const scoreBlockers = [
    'portwatch_live_not_verified',
    'non_news_physical_confirmation_missing',
    'market_confirmation_review_missing',
    'thermal_or_eia_anchor_missing',
    'history_sample_review_missing',
    'backtest_or_replay_review_missing'
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'free_proxy_score_candidate_blocked_no_score_write',
    recommendation: 'collect_required_confirmations_before_separate_score_pr',
    generatedAt: new Date().toISOString(),
    inputPath: input.safePath,
    inputContractVersion: design.contractVersion,
    inputStatus: design.status,
    futureFactorKey: design.futureFactorKey,
    futureMode: design.futureMode,
    maxFutureMainScoreContributionPct: maxContributionPct,
    candidateScoreContributionPct: 0,
    confidence: 'none',
    scoreScope: 'free_proxy_only_low_weight_candidate',
    capRationale: design.scoreCap.reason,
    plannedComponentCapsPct: plannedComponentCaps(maxContributionPct),
    gateStatus: {
      productionCandidatePresent: design.currentProductionState.candidatePresent === true ? 'pass_by_design_fixture' : 'missing',
      candidateOnlyTrue: design.currentProductionState.eligibleForMainScore === false ? 'pass_by_design_fixture' : 'missing',
      portWatchLive: 'not_verified_in_artifact_only_projection',
      nonNewsPhysicalConfirmation: 'missing',
      marketConfirmationReview: 'missing',
      thermalOrEiaAnchor: 'missing',
      historySampleReview: 'missing',
      backtestOrReplayReview: 'missing',
      noSingleSourceOverride: 'pass_by_design_fixture',
      newsAloneCannotScore: 'pass_by_design_fixture',
      routeFreightUnavailableConfidenceCap: 'pass_by_design_fixture'
    },
    hardCaps: {
      newsOnlyContributionPct: design.scoreCap.newsOnlyContributionPct,
      singleChokepointOnlyContributionPct: design.scoreCap.singleChokepointOnlyContributionPct,
      stalePortWatchContributionPct: design.scoreCap.stalePortWatchContributionPct
    },
    requiredBeforeScorePr: design.minimumConditionsBeforeSeparateScorePr,
    eligibleFreeProxyFamilies: design.eligibleFreeProxyFamilies.map((family) => ({
      familyKey: family.familyKey,
      role: family.role,
      canScoreAlone: family.canScoreAlone,
      productionScoringApprovedByThisProjection: false
    })),
    excludedUntilSeparateApproval: design.excludedUntilSeparateApproval,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    mainScoreApproved: false,
    freeProxyScoreGenerated: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    blockers: scoreBlockers,
    warnings: [
      'artifact_only_projection',
      'score_cap_design_exists_but_no_score_write',
      'requires_separate_reviewed_score_pr'
    ],
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本投影只把免费代理低权重入分设计转成候选审阅 artifact;当前所有关键确认门仍未满足,候选贡献固定为 0,不得写入生产数据或今日总判断打分。'
  };
}

function writeJson(outputPath, projection) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
}

function printSummary(projection) {
  console.log(`Transport Shock free-proxy score candidate projection: ${projection.status}`);
  console.log(`recommendation: ${projection.recommendation}`);
  console.log(`candidateScoreContributionPct: ${projection.candidateScoreContributionPct}`);
  console.log(`maxFutureMainScoreContributionPct: ${projection.maxFutureMainScoreContributionPct ?? 'n/a'}`);
  console.log(`eligibleForMainScore: ${projection.eligibleForMainScore}`);
  console.log(`boundary: ${projection.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const projection = buildProjection(readDesign(options.input));
    if (options.writeOutput) writeJson(options.output, projection);
    if (options.printJson) console.log(JSON.stringify(projection, null, 2));
    else printSummary(projection);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
