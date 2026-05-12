import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTRACT_VERSION = 'v28.0M-17-network-gate-scaffold-1';
const DEFAULT_TARGET_ASSET = 'qqq';
const DEFAULT_TARGET_SYMBOL = 'QQQ';
const DEFAULT_SOURCE_CANDIDATE = 'stooq_public_csv_candidate';
const REQUIRED_REJECTION_REASONS = [
  'source_not_approved',
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

export function buildMarketPricingNetworkGateScaffoldReport(options = {}) {
  const targetAsset = options.targetAsset || DEFAULT_TARGET_ASSET;
  const targetSymbol = options.targetSymbol || defaultTargetSymbol(targetAsset);
  const sourceCandidate = options.sourceCandidate || DEFAULT_SOURCE_CANDIDATE;
  const allowNetworkRequested = options.allowNetworkRequested === true;

  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_network_gate_scaffold',
    generatedAt: options.generatedAt || nowIso(),
    status: allowNetworkRequested
      ? 'network_request_rejected_scaffold_only'
      : 'network_gate_closed_scaffold_only',
    targetAsset,
    targetSymbol,
    sourceCandidate,

    sourceSelectionFinalized: false,
    sourceApproved: false,
    liveFetchApproved: false,
    networkGateApproved: false,
    networkGateOpen: false,
    networkAllowed: false,
    sourceComplianceReviewed: false,
    sourceFormatVerified: false,
    symbolMappingVerified: false,
    sourceUrlPersistenceAllowed: false,
    secretsAllowed: false,
    productionDataWriteApproved: false,
    historyWriteApproved: false,
    marketTemperatureCalculationApproved: false,
    readyForProductionWrite: false,

    allowNetworkRequested,
    networkRequestRejected: allowNetworkRequested,
    rejectionReasons: [...REQUIRED_REJECTION_REASONS],

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
      'A later reviewed version may add a compliance review fixture, but live fetch still requires separate approval.'
  };
}

function assertManualArtifactOutputPath(outputPath) {
  if (!outputPath) {
    throw new Error('Output path is required when writing a scaffold report.');
  }

  const root = process.cwd();
  const allowedRoot = path.resolve(root, 'manual-artifacts', 'market-pricing');
  const resolvedOutput = path.resolve(root, outputPath);

  if (
    resolvedOutput !== allowedRoot
    && !resolvedOutput.startsWith(`${allowedRoot}${path.sep}`)
  ) {
    throw new Error(
      'Network gate scaffold output must stay under manual-artifacts/market-pricing.'
    );
  }

  return resolvedOutput;
}

export function writeMarketPricingNetworkGateScaffoldReport(outputPath, options = {}) {
  const resolvedOutput = assertManualArtifactOutputPath(outputPath);
  const report = buildMarketPricingNetworkGateScaffoldReport(options);

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return { outputPath: resolvedOutput, report };
}

function parseCliArgs(argv) {
  const options = {
    allowNetworkRequested: false,
    output: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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

    throw new Error(`Unknown network gate scaffold argument: ${arg}`);
  }

  return options;
}

function main() {
  const { output, ...options } = parseCliArgs(process.argv.slice(2));
  const result = output
    ? writeMarketPricingNetworkGateScaffoldReport(output, options)
    : { outputPath: null, report: buildMarketPricingNetworkGateScaffoldReport(options) };

  console.log('Market pricing network gate scaffold: PASS');
  console.log(`status=${result.report.status}`);
  console.log(`networkAllowed=${result.report.networkAllowed}`);
  console.log(`networkRequestRejected=${result.report.networkRequestRejected}`);
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
