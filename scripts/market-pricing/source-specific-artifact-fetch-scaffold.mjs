import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const CONTRACT_VERSION = 'v28.0M-15';
const DEFAULT_OUTPUT_PATH =
  'manual-artifacts/market-pricing/source-specific-artifact-fetch-scaffold-latest.json';

const SUPPORTED_TARGET_ASSET = {
  targetAsset: 'qqq',
  targetSymbol: 'QQQ'
};

const SUPPORTED_SOURCE_CANDIDATE = 'stooq_public_csv_candidate';

function readOption(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function normalizeOutputPath(outputPath) {
  const normalized = path.normalize(outputPath).replaceAll('\\', '/');
  if (!normalized.startsWith('manual-artifacts/market-pricing/')) {
    throw new Error(
      'Source-specific artifact fetch scaffold output must stay under manual-artifacts/market-pricing/.'
    );
  }
  return normalized;
}

function assertSupportedTarget(targetAsset) {
  if (targetAsset !== SUPPORTED_TARGET_ASSET.targetAsset) {
    throw new Error(
      `Unsupported target asset for v28.0M-15 source-specific scaffold: ${targetAsset}`
    );
  }
}

function assertSupportedSource(sourceCandidate) {
  if (sourceCandidate !== SUPPORTED_SOURCE_CANDIDATE) {
    throw new Error(
      `Unsupported source candidate for v28.0M-15 source-specific scaffold: ${sourceCandidate}`
    );
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    targetAsset: SUPPORTED_TARGET_ASSET.targetAsset,
    sourceCandidate: SUPPORTED_SOURCE_CANDIDATE,
    allowNetworkRequested: false,
    output: DEFAULT_OUTPUT_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target-asset') {
      options.targetAsset = readOption(argv, index, arg).toLowerCase();
      index += 1;
      continue;
    }
    if (arg === '--source-candidate') {
      options.sourceCandidate = readOption(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--output') {
      options.output = normalizeOutputPath(readOption(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--allow-network') {
      options.allowNetworkRequested = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  assertSupportedTarget(options.targetAsset);
  assertSupportedSource(options.sourceCandidate);
  options.output = normalizeOutputPath(options.output);
  return options;
}

export function buildSourceSpecificArtifactFetchScaffoldReport(options = {}) {
  const targetAsset = (options.targetAsset || SUPPORTED_TARGET_ASSET.targetAsset).toLowerCase();
  const sourceCandidate = options.sourceCandidate || SUPPORTED_SOURCE_CANDIDATE;
  const allowNetworkRequested = Boolean(options.allowNetworkRequested);

  assertSupportedTarget(targetAsset);
  assertSupportedSource(sourceCandidate);

  const networkRequestRejected = allowNetworkRequested;

  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_source_specific_artifact_fetch_scaffold_report',
    generatedAt: new Date().toISOString(),
    status: networkRequestRejected
      ? 'network_request_rejected_scaffold_only'
      : 'source_specific_artifact_fetch_scaffold_only',
    targetAsset,
    targetSymbol: SUPPORTED_TARGET_ASSET.targetSymbol,
    sourceCandidate,
    sourceApproved: false,
    sourceSelectionFinalized: false,
    liveFetchApproved: false,
    productionDataWriteApproved: false,
    historyWriteApproved: false,
    marketTemperatureCalculationApproved: false,
    networkAllowed: false,
    allowNetworkRequested,
    networkRequestRejected,
    apiCalled: false,
    secretsRead: false,
    sourceUrlPersisted: false,
    sourceEndpointPersisted: false,
    sourceComplianceReviewed: false,
    sourceFormatVerified: false,
    symbolMappingVerified: false,
    adjustedCloseAvailable: 'unknown',
    weeklyAggregationPolicy: 'not_implemented',
    records: [],
    recordsProduced: 0,
    recordsAcceptedForHistory: 0,
    weeklyRows: 0,
    hasAtLeast60Weeks: false,
    readyForProductionWrite: false,
    productionDataWritten: false,
    historyFileModified: false,
    radarDataModified: false,
    calculationPerformed: false,
    boundaries: {
      scaffoldOnly: true,
      networkDisabled: true,
      noLiveFetch: true,
      noSourceApproval: true,
      noProductionWrite: true,
      noHistoryWrite: true,
      noCalculation: true,
      displayOnly: true,
      notInvestmentAdvice: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    notesZh: [
      '本报告仅为 source-specific artifact fetch scaffold。',
      '本轮不联网、不抓取真实行情、不写入生产数据。',
      'Stooq/public CSV 仅为设计候选，不是已批准生产源。',
      'QQQ 仅作为目标元数据，不包含价格记录。'
    ]
  };
}

export function writeSourceSpecificArtifactFetchScaffoldReport(
  outputPath,
  options = {}
) {
  const safeOutputPath = normalizeOutputPath(outputPath || DEFAULT_OUTPUT_PATH);
  const report = buildSourceSpecificArtifactFetchScaffoldReport(options);
  fs.mkdirSync(path.dirname(safeOutputPath), { recursive: true });
  fs.writeFileSync(safeOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { outputPath: safeOutputPath, report };
}

function printSummary(result) {
  const { outputPath, report } = result;
  console.log('Market pricing source-specific artifact fetch scaffold report written.');
  console.log(`output=${outputPath}`);
  console.log(`status=${report.status}`);
  console.log(`targetAsset=${report.targetAsset}`);
  console.log(`sourceCandidate=${report.sourceCandidate}`);
  console.log(`allowNetworkRequested=${report.allowNetworkRequested}`);
  console.log(`networkAllowed=${report.networkAllowed}`);
  console.log(`apiCalled=${report.apiCalled}`);
  console.log(`productionDataWritten=${report.productionDataWritten}`);
  console.log(`calculationPerformed=${report.calculationPerformed}`);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = writeSourceSpecificArtifactFetchScaffoldReport(
    options.output,
    options
  );
  printSummary(result);
  return result.report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
