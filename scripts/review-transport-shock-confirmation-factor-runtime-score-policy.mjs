#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-runtime-score-policy-review-v1';
const IMPACT_CONTRACT_VERSION = 'transport-shock-scoring-impact-v1';
const CANDIDATE_CONTRACT_VERSION = 'transport-shock-candidate-v1';
const DEFAULT_INPUT = 'data/radar-data.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/runtime-score-policy-review-latest.json';
const MAX_CONTRIBUTION_PCT = 3;
const STALE_AFTER_DAYS = 7;
const BOUNDARY =
  'artifact-only Transport Shock post-migration runtime score policy review; reads production data/radar-data.json or tracked fixtures only; writes ignored manual-artifacts only; no network, no production write, no runtime change, no new score calculation beyond policy replay, no route/market confirmation connection, and no effect on ODP finalBias, Brent promotion, Global Risk Heatmap, cross-validation, or Bubble Watch';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-runtime-score-policy -- [options]

Options:
  --input <path>   Production radar data or tracked fixture. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored review artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run        Do not write ignored artifact.
  --no-output      Do not write ignored artifact.
  --json           Print full JSON review.
  --help           Show this help.

Boundary:
  Replays the existing Transport Shock runtime score policy against the input payload.
  It does not change Daily runtime, production data, frontend, Worker, ODP, Brent, Heatmap,
  cross-validation, or Bubble Watch.`);
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isProductionInputPath(filePath) {
  return safeRelativePath(filePath) === DEFAULT_INPUT;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isSafeInputPath(filePath) {
  return isProductionInputPath(filePath) || isFixturePath(filePath);
}

function isManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function manualArtifactWritePathChain(filePath) {
  if (!isManualArtifactPath(filePath)) {
    throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${filePath}`);
  }
  const outputPath = resolve(filePath);
  const rootPath = resolve('manual-artifacts/transport-shock-confirmation-factor');
  const outputDir = dirname(outputPath);
  const relativeDir = relative(rootPath, outputDir);
  const paths = [rootPath];
  let cursor = rootPath;
  if (relativeDir) {
    for (const segment of relativeDir.split(/[\\/]+/u).filter(Boolean)) {
      cursor = resolve(cursor, segment);
      paths.push(cursor);
    }
  }
  paths.push(outputPath);
  return paths;
}

function assertManualArtifactWritePath(filePath) {
  for (const existingPath of manualArtifactWritePathChain(filePath)) {
    if (!existsSync(existingPath)) continue;
    if (lstatSync(existingPath).isSymbolicLink()) {
      const displayPath = safeRelativePath(existingPath) || existingPath;
      throw new Error(`Refusing output through symlink/junction path segment: ${displayPath}`);
    }
  }
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    writeOutput: true,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--dry-run' || arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
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

  if (!isSafeInputPath(options.input)) throw new Error(`Refusing input outside allowed paths: ${options.input}`);
  if (options.writeOutput) assertManualArtifactWritePath(options.output);
  return options;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function readJson(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) throw new Error(`Input not found: ${filePath}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function buildExpectedGuards(energyTransport) {
  const candidate = energyTransport?.transportShockCandidate;
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints || 'missing';
  const latestAgeDays = Number.isFinite(energyTransport?.latestAgeDays) ? energyTransport.latestAgeDays : null;
  const candidateScore = Number.isFinite(candidate?.score) ? candidate.score : null;
  return {
    candidatePresent: isPlainObject(candidate),
    sourceLive: sourceStatus === 'live',
    latestFresh: Number.isFinite(latestAgeDays) && latestAgeDays <= STALE_AFTER_DAYS,
    eligibleForMainScore: candidate?.eligibleForMainScore === true,
    candidateScorePositive: Number.isFinite(candidateScore) && candidateScore > 0,
    pressureStatus: candidate?.status === 'watch' || candidate?.status === 'elevated_watch',
    hardCapPct: MAX_CONTRIBUTION_PCT,
    routeFreightConfirmationConnected: false,
    marketConfirmationConnected: false
  };
}

function contributionFromCandidateScore(candidateScore) {
  if (!Number.isFinite(candidateScore)) return 0;
  if (candidateScore >= 75) return 3;
  if (candidateScore >= 60) return 2;
  if (candidateScore >= 50) return 1;
  return 0;
}

function expectedZero(reason, context) {
  return {
    runtimeScoringAuthorized: true,
    applied: false,
    contributionPct: 0,
    maxContributionPct: MAX_CONTRIBUTION_PCT,
    direction: 'transport_shock_pressure_only',
    reason,
    scoreBeforeTransport: context.baseScore,
    scoreAfterTransport: context.baseScore,
    sourceStatus: context.sourceStatus,
    latestAgeDays: context.latestAgeDays,
    candidateStatus: context.candidateStatus,
    candidateScore: context.candidateScore,
    guards: context.guards
  };
}

function buildExpectedImpact(payload) {
  const energyTransport = payload?.macroDrivers?.energyTransport;
  const candidate = energyTransport?.transportShockCandidate;
  const impact = payload?.transportShockScoringImpact;
  const guards = buildExpectedGuards(energyTransport);
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints || 'missing';
  const latestAgeDays = Number.isFinite(energyTransport?.latestAgeDays) ? energyTransport.latestAgeDays : null;
  const candidateScore = Number.isFinite(candidate?.score) ? candidate.score : null;
  const baseScore = Number.isFinite(impact?.scoreBeforeTransport)
    ? impact.scoreBeforeTransport
    : finiteNumberOrNull(payload?.tailRiskOverlay?.adjustedScore);
  const context = {
    baseScore,
    sourceStatus,
    latestAgeDays,
    candidateStatus: typeof candidate?.status === 'string' ? candidate.status : null,
    candidateScore,
    guards
  };

  if (!guards.candidatePresent) return expectedZero('candidate_missing_zero_contribution', context);
  if (!guards.sourceLive) return expectedZero('candidate_not_live_zero_contribution', context);
  if (!guards.latestFresh) return expectedZero('candidate_stale_zero_contribution', context);
  if (!guards.eligibleForMainScore) return expectedZero('candidate_not_eligible_zero_contribution', context);
  if (!guards.pressureStatus) return expectedZero('candidate_not_pressure_status_zero_contribution', context);
  if (!guards.candidateScorePositive) return expectedZero('candidate_score_not_positive_zero_contribution', context);
  if (!Number.isFinite(baseScore)) return expectedZero('base_score_missing_zero_contribution', context);

  const contributionPct = contributionFromCandidateScore(candidateScore);
  if (contributionPct <= 0) {
    return expectedZero('candidate_score_below_contribution_threshold_zero_contribution', context);
  }
  return {
    runtimeScoringAuthorized: true,
    applied: true,
    contributionPct,
    maxContributionPct: MAX_CONTRIBUTION_PCT,
    direction: 'transport_shock_pressure_only',
    reason: 'owner_approved_free_proxy_transport_pressure_low_weight_applied',
    scoreBeforeTransport: baseScore,
    scoreAfterTransport: Math.min(100, baseScore + contributionPct),
    sourceStatus,
    latestAgeDays,
    candidateStatus: candidate.status,
    candidateScore,
    guards
  };
}

function addBlocker(blockers, id, reasonZh, observed, expected) {
  blockers.push({ id, reasonZh, observed, expected });
}

function compareField(blockers, id, labelZh, observed, expected) {
  if (observed !== expected) addBlocker(blockers, id, `${labelZh} 与 runtime policy replay 不一致。`, observed, expected);
}

function validateContract(payload, blockers) {
  const impact = payload?.transportShockScoringImpact;
  const candidate = payload?.macroDrivers?.energyTransport?.transportShockCandidate;
  if (!isPlainObject(impact)) {
    addBlocker(blockers, 'impact_missing', '缺少 production transportShockScoringImpact。', impact ?? null, 'object');
    return;
  }
  if (impact.contractVersion !== IMPACT_CONTRACT_VERSION) {
    addBlocker(blockers, 'impact_contract_version_invalid', 'transportShockScoringImpact contractVersion 不匹配。', impact.contractVersion ?? null, IMPACT_CONTRACT_VERSION);
  }
  if (impact.sourcePath !== 'macroDrivers.energyTransport.transportShockCandidate') {
    addBlocker(blockers, 'impact_source_path_invalid', 'transportShockScoringImpact sourcePath 必须保持 approved production candidate。', impact.sourcePath ?? null, 'macroDrivers.energyTransport.transportShockCandidate');
  }
  if (impact.runtimeScoringAuthorized !== true) {
    addBlocker(blockers, 'runtime_scoring_authorization_missing', 'transportShockScoringImpact 必须显式记录 runtimeScoringAuthorized=true。', impact.runtimeScoringAuthorized ?? null, true);
  }
  if (impact.maxContributionPct !== MAX_CONTRIBUTION_PCT || impact.guards?.hardCapPct !== MAX_CONTRIBUTION_PCT) {
    addBlocker(blockers, 'hard_cap_invalid', 'Transport Shock runtime hard cap 必须保持 3%。', {
      maxContributionPct: impact.maxContributionPct,
      guardHardCapPct: impact.guards?.hardCapPct
    }, MAX_CONTRIBUTION_PCT);
  }
  if (impact.direction !== 'transport_shock_pressure_only') {
    addBlocker(blockers, 'direction_invalid', 'Transport Shock runtime 只能 pressure-only 加分。', impact.direction ?? null, 'transport_shock_pressure_only');
  }
  if (impact.guards?.routeFreightConfirmationConnected !== false) {
    addBlocker(blockers, 'route_freight_connected_claimed', '路线级油轮运费仍不得被声明为 connected。', impact.guards?.routeFreightConfirmationConnected ?? null, false);
  }
  if (impact.guards?.marketConfirmationConnected !== false) {
    addBlocker(blockers, 'market_confirmation_connected_claimed', '市场确认仍不得被声明为 connected。', impact.guards?.marketConfirmationConnected ?? null, false);
  }
  if (isPlainObject(candidate) && candidate.contractVersion !== CANDIDATE_CONTRACT_VERSION) {
    addBlocker(blockers, 'candidate_contract_version_invalid', 'transportShockCandidate contractVersion 不匹配。', candidate.contractVersion ?? null, CANDIDATE_CONTRACT_VERSION);
  }
  if (isPlainObject(candidate) && candidate.routeFreightConfirmation !== 'not_connected') {
    addBlocker(blockers, 'candidate_route_freight_not_locked', 'transportShockCandidate routeFreightConfirmation 必须保持 not_connected。', candidate.routeFreightConfirmation ?? null, 'not_connected');
  }
  if (isPlainObject(candidate) && candidate.marketConfirmation !== 'not_connected') {
    addBlocker(blockers, 'candidate_market_confirmation_not_locked', 'transportShockCandidate marketConfirmation 必须保持 not_connected。', candidate.marketConfirmation ?? null, 'not_connected');
  }
}

function compareActualToExpected(payload, expected, blockers) {
  const impact = payload?.transportShockScoringImpact;
  if (!isPlainObject(impact)) return;
  compareField(blockers, 'applied_policy_mismatch', 'applied', impact.applied, expected.applied);
  compareField(blockers, 'runtime_authorization_policy_mismatch', 'runtimeScoringAuthorized', impact.runtimeScoringAuthorized, expected.runtimeScoringAuthorized);
  compareField(blockers, 'contribution_policy_mismatch', 'contributionPct', impact.contributionPct, expected.contributionPct);
  compareField(blockers, 'reason_policy_mismatch', 'reason', impact.reason, expected.reason);
  compareField(blockers, 'score_before_policy_mismatch', 'scoreBeforeTransport', impact.scoreBeforeTransport, expected.scoreBeforeTransport);
  compareField(blockers, 'score_after_policy_mismatch', 'scoreAfterTransport', impact.scoreAfterTransport, expected.scoreAfterTransport);
  compareField(blockers, 'source_status_policy_mismatch', 'sourceStatus', impact.sourceStatus, expected.sourceStatus);
  compareField(blockers, 'latest_age_policy_mismatch', 'latestAgeDays', impact.latestAgeDays, expected.latestAgeDays);
  compareField(blockers, 'candidate_status_policy_mismatch', 'candidateStatus', impact.candidateStatus, expected.candidateStatus);
  compareField(blockers, 'candidate_score_policy_mismatch', 'candidateScore', impact.candidateScore, expected.candidateScore);

  for (const key of [
    'candidatePresent',
    'sourceLive',
    'latestFresh',
    'eligibleForMainScore',
    'candidateScorePositive',
    'pressureStatus',
    'hardCapPct',
    'routeFreightConfirmationConnected',
    'marketConfirmationConnected'
  ]) {
    compareField(
      blockers,
      `guard_${key}_policy_mismatch`,
      `guard ${key}`,
      impact.guards?.[key],
      expected.guards[key]
    );
  }
}

function falseImpactMap() {
  return {
    writesProductionData: false,
    modifiesRuntimeScoring: false,
    modifiesFrontend: false,
    modifiesWorkerRuntime: false,
    modifiesWorkflow: false,
    fetchesNetwork: false,
    readsSecrets: false,
    connectsRouteFreightConfirmation: false,
    connectsMarketConfirmation: false,
    affectsValues: false,
    affectsScoringByThisReview: false,
    affectsDecisionModelByThisReview: false,
    affectsExecutionLockByThisReview: false,
    affectsPositionGuidanceByThisReview: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false,
    affectsBubbleWatch: false
  };
}

function buildReview(payload, inputPath) {
  const blockers = [];
  const expectedImpact = buildExpectedImpact(payload);
  validateContract(payload, blockers);
  compareActualToExpected(payload, expectedImpact, blockers);
  const actualImpact = payload?.transportShockScoringImpact ?? null;
  const passed = blockers.length === 0;
  const status = passed
    ? actualImpact?.applied
      ? 'runtime_score_policy_review_passed_positive_contribution_observed'
      : 'runtime_score_policy_review_passed_zero_contribution_observed'
    : 'runtime_score_policy_review_blocked_policy_mismatch';

  return {
    schemaVersion: SCHEMA_VERSION,
    status,
    recommendation: passed
      ? actualImpact?.applied
        ? 'review_nonzero_transport_shock_contribution_but_keep_cap_and_boundaries'
        : 'continue_monitoring_until_transport_pressure_candidate_triggers_nonzero_contribution'
      : 'fix_runtime_policy_drift_before_next_score_expansion',
    generatedAt: new Date().toISOString(),
    inputPath: safeRelativePath(inputPath),
    reviewType: 'post_migration_runtime_score_policy_replay',
    observesExistingRuntimeScoring: true,
    scorePolicyReviewPassed: passed,
    blockerCount: blockers.length,
    blockers,
    policy: {
      contractVersion: IMPACT_CONTRACT_VERSION,
      sourcePath: 'macroDrivers.energyTransport.transportShockCandidate',
      maxContributionPct: MAX_CONTRIBUTION_PCT,
      staleAfterDays: STALE_AFTER_DAYS,
      direction: 'transport_shock_pressure_only',
      gateOrder: [
        'candidatePresent',
        'sourceLive',
        'latestFresh',
        'eligibleForMainScore',
        'pressureStatus',
        'candidateScorePositive',
        'scoreBeforeTransportFinite',
        'candidateScoreThreshold'
      ],
      thresholds: [
        { minCandidateScore: 75, contributionPct: 3 },
        { minCandidateScore: 60, contributionPct: 2 },
        { minCandidateScore: 50, contributionPct: 1 },
        { minCandidateScore: 0, contributionPct: 0 }
      ],
      zeroReasons: [
        'candidate_missing_zero_contribution',
        'candidate_not_live_zero_contribution',
        'candidate_stale_zero_contribution',
        'candidate_not_eligible_zero_contribution',
        'candidate_not_pressure_status_zero_contribution',
        'candidate_score_not_positive_zero_contribution',
        'base_score_missing_zero_contribution',
        'candidate_score_below_contribution_threshold_zero_contribution'
      ],
      positiveReason: 'owner_approved_free_proxy_transport_pressure_low_weight_applied'
    },
    currentObservation: {
      applied: actualImpact?.applied === true,
      runtimeScoringAuthorized: actualImpact?.runtimeScoringAuthorized === true,
      contributionPct: finiteNumberOrNull(actualImpact?.contributionPct),
      maxContributionPct: finiteNumberOrNull(actualImpact?.maxContributionPct),
      reason: actualImpact?.reason ?? null,
      expectedReason: expectedImpact.reason,
      scoreBeforeTransport: finiteNumberOrNull(actualImpact?.scoreBeforeTransport),
      scoreAfterTransport: finiteNumberOrNull(actualImpact?.scoreAfterTransport),
      expectedScoreAfterTransport: finiteNumberOrNull(expectedImpact.scoreAfterTransport),
      sourceStatus: actualImpact?.sourceStatus ?? null,
      latestAgeDays: finiteNumberOrNull(actualImpact?.latestAgeDays),
      candidateStatus: actualImpact?.candidateStatus ?? null,
      candidateScore: finiteNumberOrNull(actualImpact?.candidateScore),
      guards: actualImpact?.guards ?? null,
      expectedGuards: expectedImpact.guards
    },
    approvals: {
      scoreExpansionApproved: false,
      productionWriteApproved: false,
      runtimeChangeApproved: false,
      frontendChangeApproved: false,
      routeFreightConfirmationConnectionApproved: false,
      marketConfirmationConnectionApproved: false
    },
    productionImpact: falseImpactMap(),
    boundary: BOUNDARY,
    limitationZh: '本审查只复放当前已接入的 Transport Shock 低权重运行时入分政策,用于发现 policy drift;它不扩大权重、不新增数据源、不确认封锁/断供/路线级油轮运费,也不改变今日油价方向判断。'
  };
}

function writeReview(outputPath, review) {
  assertManualArtifactWritePath(outputPath);
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock runtime score policy review: ${review.status}`);
  console.log(`scorePolicyReviewPassed: ${review.scorePolicyReviewPassed}`);
  console.log(`currentContribution: ${review.currentObservation.contributionPct}/${review.currentObservation.maxContributionPct}`);
  console.log(`currentReason: ${review.currentObservation.reason}`);
  console.log(`expectedReason: ${review.currentObservation.expectedReason}`);
  console.log(`blockerCount: ${review.blockerCount}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildReview(readJson(options.input), options.input);
    if (options.writeOutput) writeReview(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
    if (!review.scorePolicyReviewPassed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
