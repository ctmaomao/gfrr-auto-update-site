import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTRACT_VERSION = 'v28.0M-18-source-compliance-review-scaffold-1';
const DEFAULT_TARGET_ASSET = 'qqq';
const DEFAULT_TARGET_SYMBOL = 'QQQ';
const DEFAULT_SOURCE_CANDIDATE = 'stooq_public_csv_candidate';
const REQUIRED_COMPLIANCE_REJECTION_REASONS = [
  'compliance_review_requires_manual_human_review',
  'scaffold_cannot_auto_approve_compliance',
  'source_not_approved'
];
const NETWORK_REJECTION_REASONS = [
  'live_fetch_not_approved',
  'network_gate_not_approved'
];

function nowIso() {
  return new Date().toISOString();
}

function defaultTargetSymbol(targetAsset) {
  if (String(targetAsset).toLowerCase() === DEFAULT_TARGET_ASSET) {
    return DEFAULT_TARGET_SYMBOL;
  }

  return String(targetAsset || DEFAULT_TARGET_ASSET).toUpperCase();
}

function buildRejectionReasons(allowNetworkRequested) {
  const reasons = [...REQUIRED_COMPLIANCE_REJECTION_REASONS];

  if (allowNetworkRequested) {
    reasons.push(...NETWORK_REJECTION_REASONS);
  }

  return reasons;
}

export function buildMarketPricingSourceComplianceReviewScaffoldReport(options = {}) {
  const targetAsset = options.targetAsset || DEFAULT_TARGET_ASSET;
  const targetSymbol = options.targetSymbol || defaultTargetSymbol(targetAsset);
  const sourceCandidate = options.sourceCandidate || DEFAULT_SOURCE_CANDIDATE;
  const markReviewedRequested = options.markReviewedRequested === true;
  const allowNetworkRequested = options.allowNetworkRequested === true;

  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_source_compliance_review_scaffold',
    generatedAt: options.generatedAt || nowIso(),
    status: markReviewedRequested
      ? 'compliance_review_request_rejected_scaffold_only'
      : 'compliance_review_pending_scaffold_only',
    targetAsset,
    targetSymbol,
    sourceCandidate,

    complianceReviewChecklist: {
      tosAcceptableUseReviewed: false,
      tosAcceptableUseNote: 'Manual review required: confirm public CSV use is within source ToS.',
      robotsTxtReviewed: false,
      robotsTxtNote: 'Manual review required: confirm robots.txt does not disallow the candidate path.',
      rateLimitReviewed: false,
      rateLimitNote: 'Manual review required: confirm a conservative weekly cadence is within source rate limits.',
      attributionRequirementReviewed: false,
      attributionRequirementNote: 'Manual review required: confirm whether attribution is required and document it.',
      redistributionRightsReviewed: false,
      redistributionRightsNote: 'Manual review required: confirm whether redistribution is permitted; this project does not redistribute prices.',
      dataAccuracyDisclaimerReviewed: false,
      dataAccuracyDisclaimerNote: 'Manual review required: document that the source provides no accuracy guarantee.',
      sourceJurisdictionReviewed: false,
      sourceJurisdictionNote: "Manual review required: document the source's hosting jurisdiction and any export concerns."
    },

    sourceComplianceReviewed: false,
    sourceComplianceReviewStatus: 'not_reviewed',
    sourceComplianceApproved: false,

    sourceSelectionFinalized: false,
    sourceApproved: false,
    liveFetchApproved: false,
    networkGateApproved: false,
    networkGateOpen: false,
    networkAllowed: false,
    sourceFormatVerified: false,
    symbolMappingVerified: false,
    sourceUrlPersistenceAllowed: false,
    secretsAllowed: false,
    productionDataWriteApproved: false,
    historyWriteApproved: false,
    marketTemperatureCalculationApproved: false,
    readyForProductionWrite: false,

    markReviewedRequested,
    complianceReviewRequestRejected: markReviewedRequested,
    allowNetworkRequested,
    networkRequestRejected: allowNetworkRequested,
    rejectionReasons: buildRejectionReasons(allowNetworkRequested),

    artifactOnly: true,
    sanitizerRequired: true,
    productionWriterRequired: true,
    calculationRequiresSeparateApproval: true,

    unifiedPipelineAssignment: {
      sourceArtifactsLayer: 'artifact_sanitizer_layer',
      historyLayer: 'daily_history_layer',
      realtimeWorkerPrimaryWeeklyHistoryBuilder: false,
      backupValidationMayBypassSanitizer: false
    },

    records: [],
    apiCalled: false,
    secretsRead: false,
    productionDataWritten: false,
    historyFileModified: false,
    frontendChanged: false,
    workflowChanged: false,

    boundaries: {
      scaffoldOnly: true,
      noLiveFetch: true,
      noNetworkEnabled: true,
      noSourceApproval: true,
      noComplianceApproval: true,
      noProductionWrite: true,
      noHistoryWrite: true,
      noWorkflowChange: true,
      noCalculation: true,
      noFrontendChange: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },

    nextAllowedStep:
      'A later reviewed version requires manual human compliance review before any source can be approved. M-19 will add symbol mapping verification design only.'
  };
}

function assertManualArtifactOutputPath(outputPath) {
  if (!outputPath) {
    throw new Error('Output path is required when writing a source compliance review scaffold report.');
  }

  const root = process.cwd();
  const allowedRoot = path.resolve(root, 'manual-artifacts', 'market-pricing');
  const resolvedOutput = path.resolve(root, outputPath);

  if (
    resolvedOutput !== allowedRoot
    && !resolvedOutput.startsWith(`${allowedRoot}${path.sep}`)
  ) {
    throw new Error(
      'Source compliance review scaffold output must stay under manual-artifacts/market-pricing.'
    );
  }

  return resolvedOutput;
}

export function writeMarketPricingSourceComplianceReviewScaffoldReport(outputPath, options = {}) {
  const resolvedOutput = assertManualArtifactOutputPath(outputPath);
  const report = buildMarketPricingSourceComplianceReviewScaffoldReport(options);

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return { outputPath: resolvedOutput, report };
}

function parseCliArgs(argv) {
  const options = {
    markReviewedRequested: false,
    allowNetworkRequested: false,
    output: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--mark-reviewed') {
      options.markReviewedRequested = true;
      continue;
    }

    if (arg === '--allow-network') {
      options.allowNetworkRequested = true;
      continue;
    }

    if (arg === '--target-asset') {
      options.targetAsset = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--target-symbol') {
      options.targetSymbol = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--source-candidate') {
      options.sourceCandidate = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--output') {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown source compliance review scaffold argument: ${arg}`);
  }

  return options;
}

function main() {
  const { output, ...options } = parseCliArgs(process.argv.slice(2));
  const result = output
    ? writeMarketPricingSourceComplianceReviewScaffoldReport(output, options)
    : {
        outputPath: null,
        report: buildMarketPricingSourceComplianceReviewScaffoldReport(options)
      };

  console.log('Market pricing source compliance review scaffold: PASS');
  console.log(`status=${result.report.status}`);
  console.log(`sourceComplianceReviewed=${result.report.sourceComplianceReviewed}`);
  console.log(`sourceComplianceReviewStatus=${result.report.sourceComplianceReviewStatus}`);
  console.log(`complianceReviewRequestRejected=${result.report.complianceReviewRequestRejected}`);
  console.log(`networkAllowed=${result.report.networkAllowed}`);
  console.log(`productionDataWritten=${result.report.productionDataWritten}`);
  console.log(`historyFileModified=${result.report.historyFileModified}`);
  if (result.outputPath) {
    console.log(`output=${path.relative(process.cwd(), result.outputPath)}`);
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main();
}
