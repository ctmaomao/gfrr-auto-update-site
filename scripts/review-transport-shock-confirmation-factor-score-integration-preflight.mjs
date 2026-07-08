#!/usr/bin/env node
import { safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-score-integration-preflight-v1';
const FREE_PROXY_GATE_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1';
const CROSS_CONFIRMATION_SCHEMA = 'transport-shock-confirmation-factor-cross-confirmation-v1';
const FREE_PROXY_BRIDGE_PREFLIGHT_SCHEMA = 'transport-shock-free-proxy-bridge-preflight-v1';
const DEFAULT_FREE_PROXY_GATE = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-latest.json';
const DEFAULT_CROSS_CONFIRMATION = 'manual-artifacts/transport-shock-confirmation-factor/cross-confirmation-latest.json';
const DEFAULT_FREE_PROXY_BRIDGE_PREFLIGHT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-bridge-preflight-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock score-integration preflight; reads free-proxy score-readiness gate, cross-confirmation, and optional free-proxy bridge preflight artifacts only; not production data; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-score-integration-preflight -- [options]

Options:
  --free-proxy-gate <path>     P-score free-proxy readiness gate artifact. Default: ${DEFAULT_FREE_PROXY_GATE}
  --cross-confirmation <path>  P-score cross-confirmation artifact. Default: ${DEFAULT_CROSS_CONFIRMATION}
  --free-proxy-bridge-preflight <path>
                                Optional free-proxy bridge preflight artifact. Default: ${DEFAULT_FREE_PROXY_BRIDGE_PREFLIGHT}
  --output <path>              Ignored preflight artifact. Default: ${DEFAULT_OUTPUT}
  --json                       Print full JSON review to stdout.
  --no-output                  Do not write ignored artifact.
  --help                       Show this help.

Boundary:
  Reads only manual-artifacts/transport-shock-confirmation-factor/
  or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production write, workflow, Worker, frontend, ODP finalBias, or main judgment scoring.`);
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
    freeProxyGate: DEFAULT_FREE_PROXY_GATE,
    crossConfirmation: DEFAULT_CROSS_CONFIRMATION,
    freeProxyBridgePreflight: DEFAULT_FREE_PROXY_BRIDGE_PREFLIGHT,
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
    if (arg === '--free-proxy-gate') options.freeProxyGate = nextValue();
    else if (arg === '--cross-confirmation') options.crossConfirmation = nextValue();
    else if (arg === '--free-proxy-bridge-preflight') options.freeProxyBridgePreflight = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isAllowedInputPath(options.freeProxyGate)) throw new Error(`Refusing to read free-proxy gate outside allowed paths: ${options.freeProxyGate}`);
  if (!isAllowedInputPath(options.crossConfirmation)) throw new Error(`Refusing to read cross-confirmation outside allowed paths: ${options.crossConfirmation}`);
  if (!isAllowedInputPath(options.freeProxyBridgePreflight)) {
    throw new Error(`Refusing to read free-proxy bridge preflight outside allowed paths: ${options.freeProxyBridgePreflight}`);
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
    scoreIntegrationPreflightOnly: true
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
      recommendation: gate?.recommendation ?? null,
      gatePassed: gate?.gatePassed === true,
      scoreReadinessGatePassed: gate?.scoreReadinessGatePassed === true,
      sampleCount: gate?.observed?.sampleCount ?? null,
      usableSampleCount: gate?.observed?.usableSampleCount ?? null,
      knownDisruptionDirectionalHitRate: gate?.observed?.knownDisruptionDirectionalHitRate ?? null,
      falsePositiveRate: gate?.observed?.falsePositiveRate ?? null
    }
  };
}

function evaluateCrossConfirmation(input) {
  const review = input.data;
  const blockers = [];
  if (!input.present) blockers.push('cross_confirmation_missing');
  if (review?.schemaVersion !== CROSS_CONFIRMATION_SCHEMA) blockers.push('cross_confirmation_schema_invalid');
  if (review?.scoreWriteApproved === true || review?.eligibleForMainScore === true) blockers.push('cross_confirmation_score_approval_claimed');
  if (review?.crossConfirmationReady !== true) blockers.push('cross_confirmation_not_ready');
  const hardBlockerIds = Array.isArray(review?.summary?.hardBlockerIds) ? review.summary.hardBlockerIds : [];
  return {
    id: 'cross_confirmation_review',
    status: blockers.length === 0 ? 'pass' : 'blocker',
    blockers,
    evidence: {
      inputPath: input.path,
      schemaVersion: review?.schemaVersion ?? null,
      status: review?.status ?? null,
      recommendation: review?.recommendation ?? null,
      crossConfirmationReady: review?.crossConfirmationReady === true,
      hardBlockerCount: review?.summary?.hardBlockerCount ?? null,
      hardBlockerIds
    }
  };
}

function evaluateFreeProxyBridgePreflight(input, crossHardBlockerIds) {
  const bridge = input.data;
  const routeOnlyBlocked = crossHardBlockerIds.length === 1 && crossHardBlockerIds[0] === 'route_freight_confirmation';
  const blockers = [];
  if (!input.present) {
    if (routeOnlyBlocked) blockers.push('free_proxy_bridge_preflight_missing_for_route_reclassification');
  } else {
    if (bridge?.schemaVersion !== FREE_PROXY_BRIDGE_PREFLIGHT_SCHEMA) blockers.push('free_proxy_bridge_preflight_schema_invalid');
    if (bridge?.scoreWriteApproved === true || bridge?.eligibleForMainScore === true) {
      blockers.push('free_proxy_bridge_preflight_score_approval_claimed');
    }
    const reclassified = Array.isArray(bridge?.summary?.reclassifiedBlockerIds)
      ? bridge.summary.reclassifiedBlockerIds
      : [];
    const remaining = Array.isArray(bridge?.summary?.remainingHardBlockerIds)
      ? bridge.summary.remainingHardBlockerIds
      : [];
    const routeReclassified = bridge?.bridgePreflightPassed === true
      && reclassified.includes('route_freight_confirmation')
      && remaining.length === 0;
    if (routeOnlyBlocked && !routeReclassified) blockers.push('free_proxy_bridge_preflight_does_not_clear_route_only_path');
  }
  const reclassified = Array.isArray(bridge?.summary?.reclassifiedBlockerIds) ? bridge.summary.reclassifiedBlockerIds : [];
  const remaining = Array.isArray(bridge?.summary?.remainingHardBlockerIds) ? bridge.summary.remainingHardBlockerIds : [];
  const canReclassifyRemainingRouteBlocker = input.present
    && routeOnlyBlocked
    && bridge?.bridgePreflightPassed === true
    && reclassified.includes('route_freight_confirmation')
    && remaining.length === 0
    && blockers.length === 0;
  return {
    id: 'free_proxy_bridge_preflight',
    status: blockers.length > 0 ? 'blocker' : (canReclassifyRemainingRouteBlocker ? 'pass' : 'not_required'),
    blockers,
    evidence: {
      inputPath: input.path,
      inputPresent: input.present,
      schemaVersion: bridge?.schemaVersion ?? null,
      status: bridge?.status ?? null,
      recommendation: bridge?.recommendation ?? null,
      bridgePreflightPassed: bridge?.bridgePreflightPassed === true,
      routeFreightConfirmation: bridge?.routeFreightConfirmation ?? null,
      routeFreightConfirmationCleared: bridge?.routeFreightConfirmationCleared === true,
      freeProxyRouteFreightRequirement: bridge?.freeProxyRouteFreightRequirement ?? null,
      reclassifiedBlockerIds: reclassified,
      remainingHardBlockerIds: remaining,
      canReclassifyRemainingRouteBlocker
    }
  };
}

function buildReview(inputs) {
  const freeProxyGateCheck = evaluateFreeProxyGate(inputs.freeProxyGate);
  const crossConfirmationCheck = evaluateCrossConfirmation(inputs.crossConfirmation);
  const originalCrossHardBlockerIds = crossConfirmationCheck.evidence.hardBlockerIds;
  const bridgeCheck = evaluateFreeProxyBridgePreflight(inputs.freeProxyBridgePreflight, originalCrossHardBlockerIds);
  const effectiveCrossHardBlockerIds = bridgeCheck.evidence.canReclassifyRemainingRouteBlocker
    ? originalCrossHardBlockerIds.filter((id) => id !== 'route_freight_confirmation')
    : originalCrossHardBlockerIds;
  if (bridgeCheck.evidence.canReclassifyRemainingRouteBlocker) {
    crossConfirmationCheck.status = 'pass';
    crossConfirmationCheck.blockers = crossConfirmationCheck.blockers.filter((id) => id !== 'cross_confirmation_not_ready');
    crossConfirmationCheck.evidence.effectiveCrossConfirmationReady = true;
    crossConfirmationCheck.evidence.bridgePreflightApplied = true;
    crossConfirmationCheck.evidence.reclassifiedHardBlockerIds = ['route_freight_confirmation'];
    crossConfirmationCheck.evidence.remainingHardBlockerIdsAfterBridge = effectiveCrossHardBlockerIds;
  }
  const checks = [freeProxyGateCheck, crossConfirmationCheck, bridgeCheck];
  const blockers = checks.flatMap((check) => check.blockers.map((id) => ({ checkId: check.id, id })));
  const preflightPassed = blockers.length === 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: preflightPassed
      ? 'score_integration_preflight_ready_for_design_review_no_score_write'
      : 'score_integration_preflight_blocked_keep_no_score_write',
    recommendation: preflightPassed
      ? 'open_separate_score_design_pr_no_auto_wire'
      : 'clear_cross_confirmation_blockers_before_score_design',
    generatedAt: new Date().toISOString(),
    scoreIntegrationPreflightPassed: preflightPassed,
    summary: {
      checkCount: checks.length,
      blockerCount: blockers.length,
      blockers,
      crossConfirmationHardBlockerIds: originalCrossHardBlockerIds,
      reclassifiedCrossConfirmationHardBlockerIds: bridgeCheck.evidence.canReclassifyRemainingRouteBlocker ? ['route_freight_confirmation'] : [],
      remainingCrossConfirmationHardBlockerIds: effectiveCrossHardBlockerIds
    },
    checks,
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
    limitationZh: '本飞检只判断是否具备另开入分设计审查的前置条件;即使通过也不自动写分、不改主判断、不改 ODP finalBias。'
  };
}

function printSummary(review) {
  console.log(`Transport Shock score-integration preflight: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`scoreIntegrationPreflightPassed: ${review.scoreIntegrationPreflightPassed}`);
  console.log(`blockerCount: ${review.summary.blockerCount}`);
  console.log(`blockers: ${review.summary.blockers.map((item) => `${item.checkId}:${item.id}`).join(', ') || 'none'}`);
  console.log(`crossConfirmationHardBlockers: ${review.summary.crossConfirmationHardBlockerIds.join(', ') || 'none'}`);
  console.log(`reclassifiedCrossConfirmationHardBlockers: ${review.summary.reclassifiedCrossConfirmationHardBlockerIds.join(', ') || 'none'}`);
  console.log(`remainingCrossConfirmationHardBlockers: ${review.summary.remainingCrossConfirmationHardBlockerIds.join(', ') || 'none'}`);
  console.log(`scoreWriteApproved: ${review.scoreWriteApproved}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputs = {
      freeProxyGate: readJsonInput(options.freeProxyGate),
      crossConfirmation: readJsonInput(options.crossConfirmation),
      freeProxyBridgePreflight: readJsonInput(options.freeProxyBridgePreflight)
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
