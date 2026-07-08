#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath } from './lib/check-script-helpers.mjs';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const MONITOR_VERSION = 'transport-shock-news-operator-review-monitor-p42';
const CLAIM_LEDGER_SCRIPT = 'scripts/oil-directional/review-oil-news-claim-ledger.mjs';
const OPERATOR_REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-news-operator-review.mjs';
const DEFAULT_CLAIM_LEDGER_OUTPUT =
  'manual-artifacts/oil-news/oil-news-claim-ledger-refresh-review.json';
const DEFAULT_OPERATOR_REVIEW_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/news-operator-review-latest.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/news-operator-review-monitor-latest.json';
const DEFAULT_MAX_COMMITS = 80;
const DEFAULT_MAX_SAMPLES = 12;
const DEFAULT_MIN_SAMPLES = 8;
const BOUNDARY =
  'artifact-only Transport Shock news operator review monitor; runs local Oil News claim ledger and delegated operator review only; writes ignored manual-artifacts only; no network, env, production data, workflow, Worker, frontend, ODP finalBias, Brent promotion, score write, main judgment weighting, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run monitor:transport-shock-confirmation-factor-news-operator-review -- [options]

Options:
  --claim-ledger <path>          Existing claim-ledger artifact. Default: rebuild from git history.
  --claim-ledger-output <path>   Ignored claim-ledger output when rebuilding. Default: ${DEFAULT_CLAIM_LEDGER_OUTPUT}
  --operator-review-output <path> Ignored operator-review output. Default: ${DEFAULT_OPERATOR_REVIEW_OUTPUT}
  --output <path>                Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --max-commits <n>              Claim-ledger git commits to inspect. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>              Claim-ledger sample cap. Default: ${DEFAULT_MAX_SAMPLES}
  --min-samples <n>              Minimum samples for monitor/gate hint. Default: ${DEFAULT_MIN_SAMPLES}
  --now <iso>                    Deterministic clock for checks. Default: current time.
  --dry-run                      Do not write ignored artifacts; requires --claim-ledger.
  --no-output                    Do not write final monitor artifact.
  --json                         Print full JSON result.
  --help                         Show this help.

Boundary:
  No network, secrets, production writes, workflow, Worker, frontend, ODP finalBias, or main judgment scoring.`);
}

function parseArgs(argv) {
  const options = {
    claimLedger: null,
    claimLedgerOutput: DEFAULT_CLAIM_LEDGER_OUTPUT,
    operatorReviewOutput: DEFAULT_OPERATOR_REVIEW_OUTPUT,
    output: DEFAULT_OUTPUT,
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    minSamples: DEFAULT_MIN_SAMPLES,
    now: null,
    dryRun: false,
    writeOutput: true,
    printJson: false
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
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--claim-ledger') options.claimLedger = nextValue();
    else if (arg === '--claim-ledger-output') options.claimLedgerOutput = nextValue();
    else if (arg === '--operator-review-output') options.operatorReviewOutput = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--max-commits') options.maxCommits = Number(nextValue());
    else if (arg === '--max-samples') options.maxSamples = Number(nextValue());
    else if (arg === '--min-samples') options.minSamples = Number(nextValue());
    else if (arg === '--now') options.now = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.maxCommits) || options.maxCommits < 1 || options.maxCommits > 500) {
    throw new Error('Invalid --max-commits. Expected integer 1..500.');
  }
  if (!Number.isInteger(options.maxSamples) || options.maxSamples < 1 || options.maxSamples > 100) {
    throw new Error('Invalid --max-samples. Expected integer 1..100.');
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 2 || options.minSamples > 30) {
    throw new Error('Invalid --min-samples. Expected integer 2..30.');
  }
  if (options.claimLedger && !isAllowedClaimLedgerPath(options.claimLedger)) {
    throw new Error(`Refusing claim ledger outside allowed paths: ${options.claimLedger}`);
  }
  if (options.dryRun && !options.claimLedger) {
    throw new Error('--dry-run requires --claim-ledger so the monitor does not create intermediate artifacts.');
  }
  if (options.now && !isoOrNull(options.now)) {
    throw new Error('Invalid --now. Expected ISO timestamp.');
  }
  if (!isManualArtifactPath(options.claimLedgerOutput)) {
    throw new Error(`Refusing claim-ledger output outside manual-artifacts/: ${options.claimLedgerOutput}`);
  }
  if (!isTransportShockManualArtifactPath(options.operatorReviewOutput)) {
    throw new Error(`Refusing operator-review output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.operatorReviewOutput}`);
  }
  if (!isTransportShockManualArtifactPath(options.output)) {
    throw new Error(`Refusing monitor output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function isTransportShockManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isAllowedClaimLedgerPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath?.startsWith('manual-artifacts/oil-news/') === true
    || relativePath?.startsWith('docs/fixtures/oil-news/') === true
    || relativePath?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function manualArtifactWritePathChain(filePath) {
  if (!isManualArtifactPath(filePath)) throw new Error(`Refusing output outside manual-artifacts/: ${filePath}`);
  const outputPath = resolve(filePath);
  const rootPath = resolve('manual-artifacts');
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

function runJson(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return JSON.parse(String(result.stdout || ''));
}

function runClaimLedger(options) {
  if (options.claimLedger) {
    return {
      path: safeRelativePath(options.claimLedger),
      generatedByMonitor: false,
      review: JSON.parse(readFileSync(resolve(options.claimLedger), 'utf8'))
    };
  }
  assertManualArtifactWritePath(options.claimLedgerOutput);
  const review = runJson([
    CLAIM_LEDGER_SCRIPT,
    '--max-commits',
    String(options.maxCommits),
    '--max-samples',
    String(options.maxSamples),
    '--min-samples',
    '2',
    '--output',
    options.claimLedgerOutput,
    '--json'
  ]);
  return {
    path: safeRelativePath(options.claimLedgerOutput),
    generatedByMonitor: true,
    review
  };
}

function runOperatorReview(options, claimLedgerPath) {
  const args = [
    OPERATOR_REVIEW_SCRIPT,
    '--claim-ledger',
    claimLedgerPath,
    '--min-samples',
    String(options.minSamples),
    '--json'
  ];
  if (options.dryRun) args.push('--no-output');
  else {
    assertManualArtifactWritePath(options.operatorReviewOutput);
    args.push('--output', options.operatorReviewOutput);
  }
  return runJson(args);
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function repeatedElevatedSampleCount(ledger) {
  const outcomes = Array.isArray(ledger?.sampleOutcomes) ? ledger.sampleOutcomes : [];
  return outcomes.filter((sample) => (
    sample?.signalState === 'elevated_manual_review'
    && asNumber(sample?.liveSourceCount) >= 2
  )).length;
}

function headlineDisplayAllowed(ledger) {
  const displayReadiness = ledger?.displayReadiness || {};
  return displayReadiness.directHeadlineDisplayAllowed === true
    || displayReadiness.originalHeadlineOutputAllowed === true
    || (Array.isArray(ledger?.sampleOutcomes)
      && ledger.sampleOutcomes.some((sample) => sample?.displayHeadlinesApproved === true));
}

function freshnessState(ledger, nowIso) {
  const referenceAt = isoOrNull(ledger?.summary?.lastSampleAt) ?? isoOrNull(ledger?.generatedAt);
  if (!referenceAt) {
    return {
      status: 'unknown_re_review_required',
      referenceAt: null,
      ageHours: null,
      confidenceAdjustment: 'none',
      requiresReReview: true,
      reason: 'claim_ledger_reference_time_missing'
    };
  }
  const ageHours = (Date.parse(nowIso) - Date.parse(referenceAt)) / 36e5;
  if (!Number.isFinite(ageHours) || ageHours < 0) {
    return {
      status: 'invalid_re_review_required',
      referenceAt,
      ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(2)) : null,
      confidenceAdjustment: 'none',
      requiresReReview: true,
      reason: 'claim_ledger_reference_time_invalid'
    };
  }
  if (ageHours <= 12) {
    return {
      status: 'current_0_12h',
      referenceAt,
      ageHours: Number(ageHours.toFixed(2)),
      confidenceAdjustment: 'full',
      requiresReReview: false,
      reason: 'fresh_claim_window'
    };
  }
  if (ageHours <= 24) {
    return {
      status: 'recent_12_24h',
      referenceAt,
      ageHours: Number(ageHours.toFixed(2)),
      confidenceAdjustment: 'strong_but_aging',
      requiresReReview: false,
      reason: 'recent_claim_window'
    };
  }
  if (ageHours <= 48) {
    return {
      status: 'aging_24_48h',
      referenceAt,
      ageHours: Number(ageHours.toFixed(2)),
      confidenceAdjustment: 'reduced',
      requiresReReview: false,
      reason: 'aging_claim_window_recheck_soon'
    };
  }
  return {
    status: 'expired_over_48h',
    referenceAt,
    ageHours: Number(ageHours.toFixed(2)),
    confidenceAdjustment: 'none',
    requiresReReview: true,
    reason: 'claim_ledger_too_old_re_review_required'
  };
}

function rawNewsGateBlockers(ledger, options) {
  const blockers = [];
  const sampleCount = asNumber(ledger?.summary?.sampleCount);
  const claimCount = asNumber(ledger?.summary?.claimCount);
  const lowConfidenceHighClaimCount = asNumber(ledger?.summary?.lowConfidenceHighClaimCount);
  const contradictionState = ledger?.contradiction?.state ?? null;
  const elevatedSampleCount = repeatedElevatedSampleCount(ledger);
  if (ledger?.reviewVersion !== 'oil-news-claim-ledger-p52') blockers.push('claim_ledger_schema_invalid');
  if (sampleCount < options.minSamples) blockers.push('insufficient_claim_ledger_samples');
  if (claimCount <= 0) blockers.push('no_compact_claims');
  if (elevatedSampleCount < 2) blockers.push('repeated_elevated_news_samples_missing');
  if (contradictionState === 'mixed_claims') blockers.push('mixed_claims_require_manual_review');
  if (lowConfidenceHighClaimCount > 0) blockers.push('low_confidence_high_claims_require_primary_source_review');
  if (headlineDisplayAllowed(ledger)) blockers.push('headline_display_guard_failed');
  return blockers;
}

function gateHint(ledger, operatorReview, options, freshness) {
  const rawBlockers = rawNewsGateBlockers(ledger, options);
  const operatorApproved = operatorReview?.reviewFindings?.approvedForCrossConfirmation === true
    && operatorReview?.approvals?.scoreWriteApproved === false
    && operatorReview?.approvals?.eligibleForMainScore === false;
  const finalBlockers = operatorApproved
    ? rawBlockers.filter((blocker) => ![
      'mixed_claims_require_manual_review',
      'low_confidence_high_claims_require_primary_source_review'
    ].includes(blocker))
    : rawBlockers;
  if (freshness.requiresReReview) finalBlockers.push('news_operator_review_expired_re_review_required');
  return {
    status: finalBlockers.length === 0
      ? 'would_clear_news_manual_gate_for_cross_confirmation_review_no_score_write'
      : 'would_remain_blocked_keep_manual_review',
    gateClearCandidate: finalBlockers.length === 0,
    operatorReviewApplied: operatorApproved,
    rawRuleBlockers: rawBlockers,
    remainingBlockers: finalBlockers,
    sampleCount: asNumber(ledger?.summary?.sampleCount),
    minSamples: options.minSamples,
    repeatedElevatedSampleCount: repeatedElevatedSampleCount(ledger),
    contradictionState: ledger?.contradiction?.state ?? null,
    axisSplitState: ledger?.axisSplit?.state ?? null,
    freshness,
    lowConfidenceHighClaimCount: asNumber(ledger?.summary?.lowConfidenceHighClaimCount),
    headlineDisplayAllowed: headlineDisplayAllowed(ledger),
    doesNotConfirm: [
      'hormuz_closure',
      'supply_disruption',
      'route_freight_confirmation',
      'oil_price_direction'
    ]
  };
}

function falseImpactMap() {
  return {
    writesProductionData: false,
    modifiesFrontend: false,
    modifiesWorkerRuntime: false,
    modifiesWorkflow: false,
    triggersDaily: false,
    fetchesNetwork: false,
    affectsValues: false,
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

function buildResult(options) {
  const nowIso = isoOrNull(options.now) ?? new Date().toISOString();
  const claimLedger = runClaimLedger(options);
  const operatorReview = runOperatorReview(options, claimLedger.path);
  const freshness = freshnessState(claimLedger.review, nowIso);
  const hint = gateHint(claimLedger.review, operatorReview, options, freshness);
  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: nowIso,
    status: hint.gateClearCandidate
      ? 'news_operator_review_still_clear_for_cross_confirmation_no_score_write'
      : 'news_operator_review_monitor_blocked_keep_manual_review',
    dryRun: options.dryRun,
    productionWriteApproved: false,
    scoreWriteApproved: false,
    inputs: {
      claimLedgerPath: claimLedger.path,
      claimLedgerGeneratedByMonitor: claimLedger.generatedByMonitor,
      operatorReviewPath: options.dryRun ? null : safeRelativePath(options.operatorReviewOutput),
      maxCommits: options.maxCommits,
      maxSamples: options.maxSamples,
      minSamples: options.minSamples
    },
    claimLedger: {
      reviewVersion: claimLedger.review?.reviewVersion ?? null,
      status: claimLedger.review?.status ?? null,
      recommendation: claimLedger.review?.recommendation ?? null,
      generatedAt: claimLedger.review?.generatedAt ?? null,
      summary: claimLedger.review?.summary ?? null,
      contradiction: claimLedger.review?.contradiction ?? null,
      claimAxisCounts: claimLedger.review?.claimAxisCounts ?? null,
      axisSplit: claimLedger.review?.axisSplit ?? null
    },
    operatorReview: {
      schemaVersion: operatorReview?.schemaVersion ?? null,
      status: operatorReview?.status ?? null,
      recommendation: operatorReview?.recommendation ?? null,
      generatedAt: operatorReview?.generatedAt ?? null,
      reviewerType: operatorReview?.reviewerType ?? null,
      approvedForCrossConfirmation: operatorReview?.reviewFindings?.approvedForCrossConfirmation === true,
      mixedClaimsDisposition: operatorReview?.reviewFindings?.mixedClaimsDisposition ?? null,
      lowConfidenceHighClaimsDisposition: operatorReview?.reviewFindings?.lowConfidenceHighClaimsDisposition ?? null,
      eventInterpretation: operatorReview?.reviewFindings?.eventInterpretation ?? null,
      blockers: operatorReview?.blockers ?? [],
      scoreWriteApproved: operatorReview?.approvals?.scoreWriteApproved === true,
      eligibleForMainScore: operatorReview?.approvals?.eligibleForMainScore === true
    },
    newsManualGateHint: hint,
    nextAction: hint.gateClearCandidate
      ? 'news_layer_can_remain_in_cross_confirmation_review_wait_for_route_freight_and_physical_confirmation'
      : 'review_news_operator_monitor_blockers_before_using_news_as_cross_confirmation_input',
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
    limitationZh: '本监控只复核 Oil News claim ledger 与 delegated operator review 是否仍可进入交叉确认审阅;不确认通道关闭/重开、断供、路线级运费、设施事故或油价方向,不批准今日总判断打分。'
  };
}

function writeJson(outputPath, result) {
  assertManualArtifactWritePath(outputPath);
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function printSummary(result) {
  console.log(`Transport Shock news operator review monitor: ${result.status}`);
  console.log(`claimLedger: ${result.claimLedger.status}`);
  console.log(`operatorReview: ${result.operatorReview.status}`);
  console.log(`newsManualGateHint: ${result.newsManualGateHint.status}`);
  console.log(`remainingBlockers: ${result.newsManualGateHint.remainingBlockers.join(', ') || 'none'}`);
  console.log(`scoreWriteApproved: ${result.scoreWriteApproved}`);
  console.log(`boundary: ${result.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildResult(options);
    if (!options.dryRun && options.writeOutput) writeJson(options.output, result);
    if (options.printJson) console.log(JSON.stringify(result, null, 2));
    else printSummary(result);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
