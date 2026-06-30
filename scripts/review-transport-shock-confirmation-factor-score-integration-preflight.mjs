#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-score-integration-preflight-v1';
const FREE_PROXY_GATE_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1';
const CROSS_CONFIRMATION_SCHEMA = 'transport-shock-confirmation-factor-cross-confirmation-v1';
const DEFAULT_FREE_PROXY_GATE = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-latest.json';
const DEFAULT_CROSS_CONFIRMATION = 'manual-artifacts/transport-shock-confirmation-factor/cross-confirmation-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock score-integration preflight; reads free-proxy score-readiness gate and cross-confirmation artifacts only; not production data; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-score-integration-preflight -- [options]

Options:
  --free-proxy-gate <path>     P-score free-proxy readiness gate artifact. Default: ${DEFAULT_FREE_PROXY_GATE}
  --cross-confirmation <path>  P-score cross-confirmation artifact. Default: ${DEFAULT_CROSS_CONFIRMATION}
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
    if (arg === '--free-proxy-gate') options.freeProxyGate = nextValue();
    else if (arg === '--cross-confirmation') options.crossConfirmation = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isAllowedInputPath(options.freeProxyGate)) throw new Error(`Refusing to read free-proxy gate outside allowed paths: ${options.freeProxyGate}`);
  if (!isAllowedInputPath(options.crossConfirmation)) throw new Error(`Refusing to read cross-confirmation outside allowed paths: ${options.crossConfirmation}`);
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

function buildReview(inputs) {
  const checks = [
    evaluateFreeProxyGate(inputs.freeProxyGate),
    evaluateCrossConfirmation(inputs.crossConfirmation)
  ];
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
      crossConfirmationHardBlockerIds: checks.find((check) => check.id === 'cross_confirmation_review')?.evidence?.hardBlockerIds ?? []
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

function writeJson(outputPath, review) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock score-integration preflight: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`scoreIntegrationPreflightPassed: ${review.scoreIntegrationPreflightPassed}`);
  console.log(`blockerCount: ${review.summary.blockerCount}`);
  console.log(`blockers: ${review.summary.blockers.map((item) => `${item.checkId}:${item.id}`).join(', ') || 'none'}`);
  console.log(`crossConfirmationHardBlockers: ${review.summary.crossConfirmationHardBlockerIds.join(', ') || 'none'}`);
  console.log(`scoreWriteApproved: ${review.scoreWriteApproved}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputs = {
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
