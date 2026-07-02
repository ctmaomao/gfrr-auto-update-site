#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-free-proxy-bridge-preflight-v1';
const BRIDGE_SCHEMA = 'transport-shock-free-proxy-score-bridge-review-v1';
const FREE_PROXY_GATE_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1';
const CROSS_CONFIRMATION_SCHEMA = 'transport-shock-confirmation-factor-cross-confirmation-v1';
const DEFAULT_BRIDGE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-bridge-review-v1.json';
const DEFAULT_FREE_PROXY_GATE =
  'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-latest.json';
const DEFAULT_CROSS_CONFIRMATION =
  'manual-artifacts/transport-shock-confirmation-factor/cross-confirmation-latest.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/free-proxy-bridge-preflight-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock free-proxy bridge preflight; reclassifies route freight only for the low-weight free-proxy path; not production data; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-free-proxy-bridge-preflight -- [options]

Options:
  --bridge-review <path>       P46 bridge-review fixture/artifact. Default: ${DEFAULT_BRIDGE}
  --free-proxy-gate <path>     P-score free-proxy readiness gate artifact. Default: ${DEFAULT_FREE_PROXY_GATE}
  --cross-confirmation <path>  P-score cross-confirmation artifact. Default: ${DEFAULT_CROSS_CONFIRMATION}
  --output <path>              Ignored preflight artifact. Default: ${DEFAULT_OUTPUT}
  --json                       Print full JSON review to stdout.
  --no-output                  Do not write ignored artifact.
  --help                       Show this help.

Boundary:
  Reads only docs/fixtures/transport-shock-confirmation-factor/
  or manual-artifacts/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production write, workflow, Worker, frontend, ODP finalBias, or main judgment scoring.`);
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isAllowedInputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true
    || relativePath?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isManualOutputPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function parseArgs(argv) {
  const options = {
    bridgeReview: DEFAULT_BRIDGE,
    freeProxyGate: DEFAULT_FREE_PROXY_GATE,
    crossConfirmation: DEFAULT_CROSS_CONFIRMATION,
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
    if (arg === '--bridge-review') options.bridgeReview = nextValue();
    else if (arg === '--free-proxy-gate') options.freeProxyGate = nextValue();
    else if (arg === '--cross-confirmation') options.crossConfirmation = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const [key, filePath] of Object.entries({
    bridgeReview: options.bridgeReview,
    freeProxyGate: options.freeProxyGate,
    crossConfirmation: options.crossConfirmation
  })) {
    if (!isAllowedInputPath(filePath)) throw new Error(`Refusing to read ${key} outside allowed paths: ${filePath}`);
  }
  if (options.writeOutput && !isManualOutputPath(options.output)) {
    throw new Error(`Refusing to write preflight outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readJsonInput(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return { present: false, path: safeRelativePath(filePath), data: null };
  }
  return {
    present: true,
    path: safeRelativePath(filePath),
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
    noProductionWrite: true,
    noRealtimeWrite: true,
    noWorkflowChange: true,
    noFrontendChange: true,
    noWorkerRuntimeChange: true,
    noScoreIntegration: true,
    noScoreWrite: true,
    noMainJudgmentEligibility: true,
    bridgePreflightOnly: true
  };
}

function evaluateBridge(input) {
  const bridge = input.data;
  const blockers = [];
  if (!input.present) blockers.push('bridge_review_missing');
  if (bridge?.contractVersion !== BRIDGE_SCHEMA) blockers.push('bridge_review_schema_invalid');
  if (bridge?.approvalState?.scoreWriteApproved === true || bridge?.currentProductionState?.eligibleForMainScore === true) {
    blockers.push('bridge_review_score_approval_claimed');
  }
  const decision = bridge?.bridgeDecision || {};
  if (decision.routeFreightConfirmationRequiredForFreeProxyPath !== false) blockers.push('route_freight_reclassification_not_approved');
  if (decision.routeFreightConfirmationCleared !== false) blockers.push('route_freight_clear_claimed');
  if (decision.maxFutureMainScoreContributionPct > 3) blockers.push('free_proxy_cap_above_3pct');
  if (decision.unauthorizedScrapingApproved !== false) blockers.push('unauthorized_scraping_claimed');
  return {
    id: 'free_proxy_score_bridge_review',
    status: blockers.length === 0 ? 'pass' : 'blocker',
    blockers,
    evidence: {
      inputPath: input.path,
      contractVersion: bridge?.contractVersion ?? null,
      status: bridge?.status ?? null,
      routeFreightConfirmationRequiredForFreeProxyPath: decision.routeFreightConfirmationRequiredForFreeProxyPath ?? null,
      routeFreightConfirmationCleared: decision.routeFreightConfirmationCleared ?? null,
      routeFreightBlockerReclassification: decision.routeFreightBlockerReclassification ?? null,
      maxFutureMainScoreContributionPct: decision.maxFutureMainScoreContributionPct ?? null
    }
  };
}

function evaluateFreeProxyGate(input) {
  const gate = input.data;
  const blockers = [];
  if (!input.present) blockers.push('free_proxy_gate_missing');
  if (gate?.schemaVersion !== FREE_PROXY_GATE_SCHEMA) blockers.push('free_proxy_gate_schema_invalid');
  if (gate?.scoreWriteApproved === true || gate?.eligibleForMainScore === true) blockers.push('free_proxy_gate_score_approval_claimed');
  if (gate?.gatePassed !== true || gate?.scoreReadinessGatePassed !== true) blockers.push('free_proxy_gate_not_passed');
  return {
    id: 'free_proxy_score_readiness_gate',
    status: blockers.length === 0 ? 'pass' : 'blocker',
    blockers,
    evidence: {
      inputPath: input.path,
      schemaVersion: gate?.schemaVersion ?? null,
      status: gate?.status ?? null,
      gatePassed: gate?.gatePassed === true,
      scoreReadinessGatePassed: gate?.scoreReadinessGatePassed === true,
      sampleCount: gate?.observed?.sampleCount ?? null,
      knownDisruptionDirectionalHitRate: gate?.observed?.knownDisruptionDirectionalHitRate ?? null,
      falsePositiveRate: gate?.observed?.falsePositiveRate ?? null
    }
  };
}

function evaluateCrossConfirmation(input, bridgeCheck) {
  const review = input.data;
  const blockers = [];
  if (!input.present) blockers.push('cross_confirmation_missing');
  if (review?.schemaVersion !== CROSS_CONFIRMATION_SCHEMA) blockers.push('cross_confirmation_schema_invalid');
  if (review?.scoreWriteApproved === true || review?.eligibleForMainScore === true) blockers.push('cross_confirmation_score_approval_claimed');
  const hardBlockerIds = Array.isArray(review?.summary?.hardBlockerIds) ? review.summary.hardBlockerIds : [];
  const canReclassifyRoute = bridgeCheck.status === 'pass';
  const reclassifiedBlockerIds = canReclassifyRoute && hardBlockerIds.includes('route_freight_confirmation')
    ? ['route_freight_confirmation']
    : [];
  const remainingHardBlockerIds = hardBlockerIds.filter((id) => !reclassifiedBlockerIds.includes(id));
  if (remainingHardBlockerIds.length > 0) blockers.push('remaining_cross_confirmation_blockers');
  return {
    id: 'cross_confirmation_review_after_bridge',
    status: blockers.length === 0 ? 'pass' : 'blocker',
    blockers,
    evidence: {
      inputPath: input.path,
      schemaVersion: review?.schemaVersion ?? null,
      status: review?.status ?? null,
      crossConfirmationReady: review?.crossConfirmationReady === true,
      originalHardBlockerIds: hardBlockerIds,
      reclassifiedBlockerIds,
      remainingHardBlockerIds
    }
  };
}

function classifyStatus(checks, remainingHardBlockerIds) {
  const setupBlockers = checks.flatMap((check) => check.blockers.filter((id) => id !== 'remaining_cross_confirmation_blockers'));
  if (setupBlockers.length > 0) return 'free_proxy_bridge_preflight_invalid_inputs_no_score_write';
  if (remainingHardBlockerIds.length === 0) return 'free_proxy_bridge_preflight_ready_for_separate_score_design_no_score_write';
  if (remainingHardBlockerIds.length === 1 && remainingHardBlockerIds[0] === 'high_frequency_physical_confirmation') {
    return 'free_proxy_bridge_preflight_blocked_on_high_frequency_no_score_write';
  }
  return 'free_proxy_bridge_preflight_blocked_on_remaining_cross_confirmation_no_score_write';
}

function buildReview(inputs) {
  const bridgeCheck = evaluateBridge(inputs.bridgeReview);
  const gateCheck = evaluateFreeProxyGate(inputs.freeProxyGate);
  const crossCheck = evaluateCrossConfirmation(inputs.crossConfirmation, bridgeCheck);
  const checks = [bridgeCheck, gateCheck, crossCheck];
  const remainingHardBlockerIds = crossCheck.evidence.remainingHardBlockerIds;
  const status = classifyStatus(checks, remainingHardBlockerIds);
  const ready = status === 'free_proxy_bridge_preflight_ready_for_separate_score_design_no_score_write';
  const blockers = checks.flatMap((check) => check.blockers.map((id) => ({ checkId: check.id, id })));
  return {
    schemaVersion: SCHEMA_VERSION,
    status,
    recommendation: ready
      ? 'open_separate_score_design_review_no_auto_wire'
      : 'keep_no_score_write_until_remaining_high_frequency_or_other_blockers_clear',
    generatedAt: new Date().toISOString(),
    bridgePreflightPassed: ready,
    summary: {
      checkCount: checks.length,
      blockerCount: blockers.length,
      blockers,
      reclassifiedBlockerIds: crossCheck.evidence.reclassifiedBlockerIds,
      remainingHardBlockerIds
    },
    checks,
    routeFreightConfirmation: 'not_connected',
    routeFreightConfirmationCleared: false,
    freeProxyRouteFreightRequirement: 'not_applicable_to_free_proxy_low_weight_path',
    highFrequencyPhysicalConfirmationRequired: remainingHardBlockerIds.includes('high_frequency_physical_confirmation'),
    scoreReadinessApproved: false,
    scoreIntegrationApproved: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    frontendDisplayApproved: false,
    mainScoreApproved: false,
    eligibleForMainScore: false,
    promotionEligible: false,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本飞检只把路线级运费缺失从低权重 free-proxy 路径中剥离,不确认路线运费,不绕过高频物理确认,不自动写分。'
  };
}

function writeJson(outputPath, review) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock free-proxy bridge preflight: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`bridgePreflightPassed: ${review.bridgePreflightPassed}`);
  console.log(`reclassifiedBlockers: ${review.summary.reclassifiedBlockerIds.join(', ') || 'none'}`);
  console.log(`remainingHardBlockers: ${review.summary.remainingHardBlockerIds.join(', ') || 'none'}`);
  console.log(`scoreWriteApproved: ${review.scoreWriteApproved}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputs = {
      bridgeReview: readJsonInput(options.bridgeReview),
      freeProxyGate: readJsonInput(options.freeProxyGate),
      crossConfirmation: readJsonInput(options.crossConfirmation)
    };
    const review = buildReview(inputs);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
