#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-display-projection-v1';
const SHADOW_SCHEMA = 'transport-shock-confirmation-factor-shadow-score-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/shadow-score-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/display-projection-latest.json';
const BOUNDARY = 'artifact-only Transport Shock Confirmation Factor display projection; not production data; no frontend implementation; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run project:transport-shock-confirmation-factor-display-projection -- [options]

Options:
  --input <path>   Shadow-score projection artifact. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored display projection artifact. Default: ${DEFAULT_OUTPUT}
  --json           Print full JSON projection to stdout.
  --no-output      Do not write ignored artifact.
  --strict         Exit non-zero unless projectionState is manual_shadow_projection_ready_non_production.
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
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isManualArtifactPath(options.input) && !isFixturePath(options.input)) {
    throw new Error(`Refusing to read input outside allowed Transport Shock artifact paths: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write display projection outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readShadow(inputPath) {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) throw new Error(`Input file does not exist: ${inputPath}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
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

function assertShadow(shadow) {
  if (shadow.schemaVersion !== SHADOW_SCHEMA) throw new Error(`Unexpected shadow schemaVersion: ${shadow.schemaVersion}`);
  if (shadow.status !== 'shadow_score_projected_non_production') throw new Error('Shadow score must be projected non-production.');
  if (shadow.recommendation !== 'shadow_score_projection_ready_for_manual_review_keep_non_production') {
    throw new Error('Shadow score projection is not ready for display projection.');
  }
  if (shadow.completeFactorScoreGenerated !== false) throw new Error('Shadow score must not claim complete factor score.');
  if (shadow.productionShadowScoreGenerated !== false) throw new Error('Shadow score must not claim production shadow score.');
  if (shadow.promotionEligible !== false) throw new Error('Shadow score must not be promotion eligible.');
  if (shadow.productionWriteApproved !== false) throw new Error('Shadow score must not approve production write.');
  if (shadow.productionDisplayApproved !== false) throw new Error('Shadow score must not approve production display.');
  if (shadow.frontendDisplayApproved !== false) throw new Error('Shadow score must not approve frontend display.');
  if (shadow.routeFreightConfirmation !== 'not_connected') throw new Error('routeFreightConfirmation must stay not_connected.');
  if (shadow.marketConfirmation !== 'not_connected') throw new Error('marketConfirmation must stay not_connected.');
  if (shadow.eligibleForMainScore !== false) throw new Error('Shadow score must not be main-score eligible.');
  if (shadow.boundaries?.noNetworkCall !== true) throw new Error('Shadow score missing noNetworkCall boundary.');
  if (shadow.boundaries?.noProductionWrite !== true) throw new Error('Shadow score missing noProductionWrite boundary.');
  if (shadow.productionImpact?.affectsScoring !== false) throw new Error('Shadow score scoring impact must be false.');
  if (shadow.productionImpact?.affectsMainJudgment !== false) throw new Error('Shadow score main judgment impact must be false.');
}

function signalLabelZh(direction) {
  if (direction === 'tightening_watch') return '运输压力偏紧观察';
  if (direction === 'easing_watch') return '运输压力缓和观察';
  if (direction === 'mixed_watch') return '运输压力混合观察';
  return '运输压力不可用';
}

function buildProjection(shadow, options) {
  assertShadow(shadow);
  const projectionState = 'manual_shadow_projection_ready_non_production';
  const score = Number.isFinite(Number(shadow.candidateShadowScore)) ? Number(shadow.candidateShadowScore) : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'dry_run_only',
    projectionState,
    recommendation: 'ready_for_frontend_card_design_review_keep_non_production',
    generatedAt: new Date().toISOString(),
    sourceMode: 'shadow_score_projection_dry_run',
    input: {
      sourcePath: safeRelativePath(options.input),
      schemaVersion: shadow.schemaVersion,
      status: shadow.status,
      recommendation: shadow.recommendation,
      generatedAt: shadow.generatedAt || null
    },
    displayCandidate: {
      futureThematicBlock: 'C1 通胀与能源',
      futureCardTitle: 'Transport Shock Confirmation Factor',
      futureCardTitleZh: '运输冲击确认因子',
      directDisplayApproved: false,
      frontendImplementationApproved: false,
      rawSourceTextDisplayed: false,
      state: shadow.candidateDirection,
      stateLabelZh: signalLabelZh(shadow.candidateDirection),
      confidence: shadow.confidence || 'low',
      candidateShadowScore: score,
      scoreCap: shadow.scoreCap,
      scoreScope: shadow.scoreScope,
      evidenceSummary: shadow.evidenceSummary || {},
      componentScores: shadow.componentScores || {},
      warnings: shadow.warnings || [],
      limitationZh: '仅为前端卡片设计审阅用 dry-run 投影;不是生产数据、不是完整因子分,不确认封锁、断供或油价方向。'
    },
    approvals: {
      productionDataWriteApproved: false,
      productionDisplayApproved: false,
      frontendDisplayApproved: false,
      workflowAutomationApproved: false,
      liveFetchApproved: false,
      completeFactorScoreApproved: false,
      mainScoreApproved: false,
      odpFinalBiasApproved: false,
      brentPromotionApproved: false,
      globalRiskHeatmapApproved: false,
      crossValidationApproved: false
    },
    currentProductionState: {
      transportShockConfirmationFactor: 'not_connected',
      routeFreightConfirmation: 'not_connected',
      marketConfirmation: 'not_connected',
      eligibleForMainScore: false
    },
    productionImpact: falseImpactMap(),
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      notProductionData: true,
      displayProjectionOnly: true
    },
    boundary: BOUNDARY
  };
}

function printSummary(projection) {
  console.log(`Transport Shock Confirmation Factor display projection: ${projection.status}`);
  console.log(`projectionState: ${projection.projectionState}`);
  console.log(`candidateShadowScore: ${projection.displayCandidate.candidateShadowScore ?? 'n/a'}`);
  console.log(`directDisplayApproved: ${projection.displayCandidate.directDisplayApproved}`);
  console.log(`eligibleForMainScore: ${projection.currentProductionState.eligibleForMainScore}`);
  console.log(`boundary: ${projection.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const projection = buildProjection(readShadow(options.input), options);
    if (options.writeOutput) writeJson(options.output, projection);
    if (options.printJson) console.log(JSON.stringify(projection, null, 2));
    else printSummary(projection);
    if (options.strict && projection.projectionState !== 'manual_shadow_projection_ready_non_production') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
