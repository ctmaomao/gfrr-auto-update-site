#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-news-operator-review-v1';
const CLAIM_LEDGER_SCHEMA = 'oil-news-claim-ledger-p52';
const DEFAULT_CLAIM_LEDGER = 'manual-artifacts/oil-news/oil-news-claim-ledger-refresh-review.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/news-operator-review-latest.json';
const DEFAULT_MIN_SAMPLES = 8;
const BOUNDARY =
  'manual/local delegated operator review for Transport Shock Oil News claims; reads claim-ledger only; writes ignored manual-artifacts only; no headline output; no event confirmation; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-news-operator-review -- [options]

Options:
  --claim-ledger <path>  Oil News claim-ledger review. Default: ${DEFAULT_CLAIM_LEDGER}
  --output <path>        Ignored operator-review artifact. Default: ${DEFAULT_OUTPUT}
  --min-samples <n>      Minimum claim-ledger samples for delegated review. Default: ${DEFAULT_MIN_SAMPLES}
  --json                 Print full JSON review to stdout.
  --no-output            Do not write ignored artifact.
  --help                 Show this help.

Boundary:
  Reads only manual-artifacts/oil-news/ or docs/fixtures/...
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No raw headline output, network, env, production write, workflow, Worker,
  frontend, ODP finalBias, or main judgment scoring.`);
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
    throw new Error(`Refusing to write operator review outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readJson(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) throw new Error(`Input file does not exist: ${filePath}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function hashObject(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function sourceQualitySufficient(ledger) {
  const tiers = ledger?.sourceTierCounts || {};
  const primary = asNumber(tiers.primary_wire_or_official);
  const major = asNumber(tiers.major_financial_media);
  const low = asNumber(tiers.low_confidence);
  return primary + major >= 10 && low === 0;
}

function buildReview(ledger, options) {
  const blockers = [];
  if (ledger?.reviewVersion !== CLAIM_LEDGER_SCHEMA) blockers.push('claim_ledger_schema_invalid');
  const sampleCount = asNumber(ledger?.summary?.sampleCount);
  const claimCount = asNumber(ledger?.summary?.claimCount);
  const lowConfidenceHighClaimCount = asNumber(ledger?.summary?.lowConfidenceHighClaimCount);
  const contradictionState = ledger?.contradiction?.state ?? null;
  const contradictionDetails = Array.isArray(ledger?.contradiction?.details) ? ledger.contradiction.details : [];
  const chokepoint = contradictionDetails.find((item) => item?.eventType === 'chokepoint') || {};
  const supply = contradictionDetails.find((item) => item?.eventType === 'supply') || {};
  const sourceQualityOk = sourceQualitySufficient(ledger);
  const headlineGuardOk = ledger?.displayReadiness?.directHeadlineDisplayAllowed === false
    && ledger?.displayReadiness?.originalHeadlineOutputAllowed === false;
  const axisSplitSupported = contradictionState === 'mixed_claims'
    && asNumber(chokepoint.escalation) > 0
    && asNumber(supply.deescalation) > 0
    && asNumber(supply.escalation) === 0;

  if (sampleCount < options.minSamples) blockers.push('insufficient_claim_ledger_samples');
  if (claimCount <= 0) blockers.push('no_compact_claims');
  if (!headlineGuardOk) blockers.push('headline_guard_not_locked');
  if (!sourceQualityOk) blockers.push('source_quality_insufficient_for_delegated_review');
  if (contradictionState === 'mixed_claims' && !axisSplitSupported) blockers.push('mixed_claims_not_resolved_by_axis_split');
  if (lowConfidenceHighClaimCount > 0 && !sourceQualityOk) blockers.push('low_confidence_high_claims_unresolved');

  const approvedForCrossConfirmation = blockers.length === 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: approvedForCrossConfirmation
      ? 'operator_review_clear_for_cross_confirmation_no_score_write'
      : 'operator_review_blocked_keep_manual_review',
    recommendation: approvedForCrossConfirmation
      ? 'allow_news_manual_gate_to_treat_mixed_claims_as_reviewed_axis_split_keep_no_score_write'
      : 'keep_news_manual_gate_blocked_until_operator_review_blockers_clear',
    generatedAt: new Date().toISOString(),
    reviewerType: 'codex_operator_delegate',
    input: {
      claimLedgerPath: safeRelativePath(options.claimLedger),
      claimLedgerHash: hashObject(ledger),
      reviewVersion: ledger?.reviewVersion ?? null,
      sampleCount,
      minSamples: options.minSamples,
      claimCount
    },
    reviewFindings: {
      approvedForCrossConfirmation,
      mixedClaimsDisposition: axisSplitSupported
        ? 'axis_split_reviewed_not_direct_contradiction'
        : 'not_resolved',
      lowConfidenceHighClaimsDisposition: sourceQualityOk
        ? 'downgraded_to_non_confirming_context'
        : 'unresolved',
      headlineDisposition: headlineGuardOk ? 'headline_output_remains_blocked' : 'headline_guard_failed',
      eventInterpretation: axisSplitSupported
        ? 'chokepoint_security_risk_elevated_while_supply_flow_deescalation_claims_coexist'
        : 'claim_direction_not_stable_enough_for_delegated_clearance',
      sourceQuality: sourceQualityOk ? 'sufficient_for_aggregate_review' : 'insufficient',
      doesNotConfirm: [
        'hormuz_closure',
        'supply_disruption',
        'route_freight_confirmation',
        'oil_price_direction'
      ]
    },
    evidence: {
      contradictionState,
      contradictionDetails,
      polarityCounts: ledger?.polarityCounts ?? null,
      eventTypeCounts: ledger?.eventTypeCounts ?? null,
      sourceTierCounts: ledger?.sourceTierCounts ?? null,
      lowConfidenceHighClaimCount,
      directHeadlineDisplayAllowed: ledger?.displayReadiness?.directHeadlineDisplayAllowed === true,
      originalHeadlineOutputAllowed: ledger?.displayReadiness?.originalHeadlineOutputAllowed === true
    },
    blockers,
    warnings: [
      'Delegated review may clear news manual gate only for cross-confirmation review.',
      'Route freight and high-frequency physical confirmation remain independent blockers.',
      'No raw headlines or URLs are approved for frontend display by this artifact.'
    ],
    approvals: {
      newsManualGateCrossConfirmationReviewApproved: approvedForCrossConfirmation,
      scoreWriteApproved: false,
      productionWriteApproved: false,
      frontendDisplayApproved: false,
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
      noHeadlineTextOutput: true,
      noRawProviderResponseStored: true,
      noScoreWrite: true,
      delegatedOperatorReviewOnly: true
    },
    boundary: BOUNDARY,
    limitationZh: '本复核只允许新闻人工闸门进入下一层交叉确认审阅;不确认通道关闭/重开、供应中断、路线级运费、油价方向或今日总判断打分。'
  };
}

function writeJson(outputPath, review) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock news operator review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`approvedForCrossConfirmation: ${review.reviewFindings.approvedForCrossConfirmation}`);
  console.log(`mixedClaimsDisposition: ${review.reviewFindings.mixedClaimsDisposition}`);
  console.log(`lowConfidenceHighClaimsDisposition: ${review.reviewFindings.lowConfidenceHighClaimsDisposition}`);
  console.log(`blockers: ${review.blockers.join(', ') || 'none'}`);
  console.log(`scoreWriteApproved: ${review.approvals.scoreWriteApproved}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildReview(readJson(options.claimLedger), options);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
