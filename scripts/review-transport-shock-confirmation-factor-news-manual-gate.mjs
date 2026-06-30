#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-news-manual-gate-v1';
const CLAIM_LEDGER_SCHEMA = 'oil-news-claim-ledger-p52';
const DEFAULT_CLAIM_LEDGER = 'manual-artifacts/oil-news/oil-news-claim-ledger-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/news-manual-gate-latest.json';
const DEFAULT_MIN_SAMPLES = 8;
const BOUNDARY =
  'artifact-only Transport Shock news manual gate; reads Oil News claim-ledger review only; not production data; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-news-manual-gate -- [options]

Options:
  --claim-ledger <path>  Oil News claim-ledger review. Default: ${DEFAULT_CLAIM_LEDGER}
  --output <path>        Ignored manual gate artifact. Default: ${DEFAULT_OUTPUT}
  --min-samples <n>      Minimum claim-ledger samples. Default: ${DEFAULT_MIN_SAMPLES}
  --json                 Print full JSON review to stdout.
  --no-output            Do not write ignored artifact.
  --help                 Show this help.

Boundary:
  Reads only manual-artifacts/oil-news/ or docs/fixtures/...
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
  return relativePath?.startsWith('manual-artifacts/oil-news/') === true
    || relativePath?.startsWith('docs/fixtures/oil-news/') === true
    || relativePath?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isManualOutputPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function parseArgs(argv) {
  const options = {
    claimLedger: DEFAULT_CLAIM_LEDGER,
    output: DEFAULT_OUTPUT,
    minSamples: DEFAULT_MIN_SAMPLES,
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
    if (arg === '--claim-ledger') options.claimLedger = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--min-samples') options.minSamples = Number(nextValue());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 2 || options.minSamples > 30) {
    throw new Error('Invalid --min-samples. Expected integer 2..30.');
  }
  if (!isAllowedInputPath(options.claimLedger)) {
    throw new Error(`Refusing to read claim ledger outside allowed paths: ${options.claimLedger}`);
  }
  if (options.writeOutput && !isManualOutputPath(options.output)) {
    throw new Error(`Refusing to write news manual gate outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readInput(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return { present: false, path: safeRelativePath(filePath), ledger: null };
  }
  return {
    present: true,
    path: safeRelativePath(filePath),
    ledger: JSON.parse(readFileSync(absolutePath, 'utf8'))
  };
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
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
    noHeadlineTextOutput: true,
    noRawProviderResponseStored: true,
    noScoreWrite: true
  };
}

function repeatedElevatedSampleCount(ledger) {
  const outcomes = Array.isArray(ledger?.sampleOutcomes) ? ledger.sampleOutcomes : [];
  return outcomes.filter((sample) => (
    sample?.signalState === 'elevated_manual_review'
    && asNumber(sample?.liveSourceCount) >= 2
  )).length;
}

function evaluateGate(input, options) {
  const ledger = input.ledger;
  const blockers = [];
  const warnings = [];

  if (!input.present) blockers.push('claim_ledger_missing');
  if (ledger && ledger.reviewVersion !== CLAIM_LEDGER_SCHEMA) blockers.push('claim_ledger_schema_invalid');
  if (ledger?.promotionEligible === true) blockers.push('claim_ledger_promotion_eligible_claimed');
  if (ledger?.productionDisplayApproved === true) blockers.push('claim_ledger_production_display_approved_claimed');

  const sampleCount = asNumber(ledger?.summary?.sampleCount);
  const claimCount = asNumber(ledger?.summary?.claimCount);
  const lowConfidenceHighClaimCount = asNumber(ledger?.summary?.lowConfidenceHighClaimCount);
  const contradictionState = ledger?.contradiction?.state ?? null;
  const displayReadiness = ledger?.displayReadiness || {};
  const headlineDisplayAllowed = displayReadiness.directHeadlineDisplayAllowed === true
    || displayReadiness.originalHeadlineOutputAllowed === true
    || (Array.isArray(ledger?.sampleOutcomes) && ledger.sampleOutcomes.some((sample) => sample?.displayHeadlinesApproved === true));
  const elevatedSampleCount = repeatedElevatedSampleCount(ledger);

  if (sampleCount < options.minSamples) blockers.push('insufficient_claim_ledger_samples');
  if (claimCount <= 0) blockers.push('no_compact_claims');
  if (elevatedSampleCount < 2) blockers.push('repeated_elevated_news_samples_missing');
  if (contradictionState === 'mixed_claims') blockers.push('mixed_claims_require_manual_review');
  if (lowConfidenceHighClaimCount > 0) blockers.push('low_confidence_high_claims_require_primary_source_review');
  if (headlineDisplayAllowed) blockers.push('headline_display_guard_failed');

  if (contradictionState === 'risk_escalation_dominant' || contradictionState === 'risk_deescalation_dominant') {
    warnings.push('directional_claim_dominance_still_requires_market_physical_cross_check');
  }
  if (ledger?.status === 'warn') warnings.push('upstream_claim_ledger_warn_status');

  const gateClear = blockers.length === 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: gateClear
      ? 'news_manual_gate_clear_for_cross_confirmation_review_no_score_write'
      : 'news_manual_gate_blocked_keep_manual_review',
    recommendation: gateClear
      ? 'may_enter_separate_cross_confirmation_review_keep_no_score_write'
      : 'keep_news_in_manual_review_do_not_use_as_confirmation',
    generatedAt: new Date().toISOString(),
    inputPath: input.path,
    inputPresent: input.present,
    gateClear,
    gateDecision: {
      sampleSufficiency: sampleCount >= options.minSamples ? 'pass' : 'blocker',
      repeatedElevatedNewsSamples: elevatedSampleCount >= 2 ? 'pass' : 'blocker',
      claimDirectionStability: contradictionState === 'mixed_claims' ? 'blocker' : 'watch',
      sourceTierRisk: lowConfidenceHighClaimCount > 0 ? 'blocker' : 'pass',
      headlineGuard: headlineDisplayAllowed ? 'blocker' : 'pass'
    },
    evidence: {
      reviewVersion: ledger?.reviewVersion ?? null,
      upstreamStatus: ledger?.status ?? null,
      upstreamRecommendation: ledger?.recommendation ?? null,
      sampleCount,
      minSamples: options.minSamples,
      claimCount,
      repeatedElevatedSampleCount: elevatedSampleCount,
      firstSampleAt: ledger?.summary?.firstSampleAt ?? null,
      lastSampleAt: ledger?.summary?.lastSampleAt ?? null,
      uniqueTitleHashCount: ledger?.summary?.uniqueTitleHashCount ?? null,
      lowConfidenceHighClaimCount,
      contradictionState,
      polarityCounts: ledger?.polarityCounts ?? null,
      eventTypeCounts: ledger?.eventTypeCounts ?? null,
      sourceTierCounts: ledger?.sourceTierCounts ?? null,
      headlineDisplayAllowed
    },
    manualReviewRequired: !gateClear,
    manualReviewBlockers: blockers,
    warnings,
    scoreReadinessApproved: false,
    scoreIntegrationApproved: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    frontendDisplayApproved: false,
    eligibleForMainScore: false,
    promotionEligible: false,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本闸门只判断 Oil News claim ledger 是否可进入下一层交叉确认审阅;它不确认通道关闭/重开、断供、油轮流向、设施事故、制裁影响或油价方向,也不批准今日总判断打分。'
  };
}

function writeJson(outputPath, review) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock news manual gate: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`gateClear: ${review.gateClear}`);
  console.log(`sampleCount: ${review.evidence.sampleCount}`);
  console.log(`claimCount: ${review.evidence.claimCount}`);
  console.log(`contradictionState: ${review.evidence.contradictionState}`);
  console.log(`lowConfidenceHighClaimCount: ${review.evidence.lowConfidenceHighClaimCount}`);
  console.log(`manualReviewBlockers: ${review.manualReviewBlockers.join(', ') || 'none'}`);
  console.log(`scoreWriteApproved: ${review.scoreWriteApproved}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = evaluateGate(readInput(options.claimLedger), options);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
