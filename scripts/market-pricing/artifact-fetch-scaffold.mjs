import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const CONTRACT_VERSION = 'v28.0M-9';
const DEFAULT_OUTPUT_PATH =
  'manual-artifacts/market-pricing/artifact-fetch-scaffold-latest.json';

const ASSET_CANDIDATES = {
  qqq: {
    assetKey: 'qqq',
    symbol: 'QQQ',
    role: 'preferred_primary_candidate'
  },
  ndx: {
    assetKey: 'ndx',
    symbol: 'NDX',
    role: 'index_candidate'
  },
  ixic: {
    assetKey: 'ixic',
    symbol: 'IXIC',
    role: 'index_candidate'
  },
  spx: {
    assetKey: 'spx',
    symbol: 'SPX',
    role: 'fallback_candidate_only'
  }
};

const CANDIDATE_SOURCES = new Set([
  'stooq_candidate',
  'yahoo_style_candidate',
  'fred_candidate',
  'future_licensed_candidate'
]);

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
      'Artifact fetch scaffold output must stay under manual-artifacts/market-pricing/.'
    );
  }
  return normalized;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    assetKey: 'qqq',
    candidateSource: 'stooq_candidate',
    allowNetworkRequested: false,
    output: DEFAULT_OUTPUT_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--asset') {
      options.assetKey = readOption(argv, index, arg).toLowerCase();
      index += 1;
      continue;
    }
    if (arg === '--candidate-source') {
      options.candidateSource = readOption(argv, index, arg);
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

  if (!ASSET_CANDIDATES[options.assetKey]) {
    throw new Error(`Unsupported asset candidate: ${options.assetKey}`);
  }
  if (!CANDIDATE_SOURCES.has(options.candidateSource)) {
    throw new Error(`Unsupported candidate source: ${options.candidateSource}`);
  }

  options.output = normalizeOutputPath(options.output);
  return options;
}

export function buildArtifactFetchScaffoldReport(options = {}) {
  const assetKey = (options.assetKey || 'qqq').toLowerCase();
  const candidateSource = options.candidateSource || 'stooq_candidate';
  const asset = ASSET_CANDIDATES[assetKey];
  const allowNetworkRequested = Boolean(options.allowNetworkRequested);

  if (!asset) {
    throw new Error(`Unsupported asset candidate: ${assetKey}`);
  }
  if (!CANDIDATE_SOURCES.has(candidateSource)) {
    throw new Error(`Unsupported candidate source: ${candidateSource}`);
  }

  const networkRequestRejected = allowNetworkRequested;

  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_artifact_fetch_scaffold_report',
    generatedAt: new Date().toISOString(),
    status: networkRequestRejected
      ? 'network_request_rejected_scaffold_only'
      : 'artifact_fetch_scaffold_only',
    sourceMode: 'scaffold_no_live_fetch',
    assetKey: asset.assetKey,
    symbol: asset.symbol,
    candidateRole: asset.role,
    candidateSource,
    allowNetworkRequested,
    networkAllowed: false,
    networkRequestRejected,
    apiCalled: false,
    secretsRead: false,
    productionDataWritten: false,
    historyFileModified: false,
    radarDataModified: false,
    calculationPerformed: false,
    records: [],
    recordsProduced: 0,
    weeklyRows: 0,
    hasAtLeast60Weeks: false,
    validation: {
      status: 'scaffold_only',
      recordsValidated: false,
      sourceComplianceReviewed: false,
      sourceSelected: false,
      readyForProductionWrite: false
    },
    candidatePolicy: {
      qqqPreferredPrimary: true,
      spxFallbackOnly: true,
      sourceSelectionFinalized: false,
      supportedAssets: Object.keys(ASSET_CANDIDATES),
      supportedCandidateSources: [...CANDIDATE_SOURCES]
    },
    boundaries: {
      artifactOnly: true,
      noLiveFetch: true,
      noProductionWrite: true,
      noCalculation: true,
      displayOnly: true,
      notInvestmentAdvice: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    notesZh: [
      '本报告仅为 market pricing artifact-only fetch scaffold。',
      '本轮不联网、不抓取真实行情、不写入生产数据。',
      '本轮不写入 data/market-pricing-history.json。',
      '本轮不计算 MA60、标准差或 z-score。',
      '若传入 allow-network，本版本仍会拒绝联网请求，等待后续单独审批。'
    ]
  };
}

export function writeArtifactFetchScaffoldReport(outputPath, options = {}) {
  const safeOutputPath = normalizeOutputPath(outputPath || DEFAULT_OUTPUT_PATH);
  const report = buildArtifactFetchScaffoldReport(options);
  fs.mkdirSync(path.dirname(safeOutputPath), { recursive: true });
  fs.writeFileSync(safeOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { outputPath: safeOutputPath, report };
}

function printSummary(result) {
  const { outputPath, report } = result;
  console.log('Market pricing artifact fetch scaffold report written.');
  console.log(`output=${outputPath}`);
  console.log(`status=${report.status}`);
  console.log(`assetKey=${report.assetKey}`);
  console.log(`candidateSource=${report.candidateSource}`);
  console.log(`allowNetworkRequested=${report.allowNetworkRequested}`);
  console.log(`networkAllowed=${report.networkAllowed}`);
  console.log(`apiCalled=${report.apiCalled}`);
  console.log(`productionDataWritten=${report.productionDataWritten}`);
  console.log(`calculationPerformed=${report.calculationPerformed}`);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = writeArtifactFetchScaffoldReport(options.output, options);
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
