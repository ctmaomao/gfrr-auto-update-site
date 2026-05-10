import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTRACT_VERSION = 'v28.0M-7';
const DEFAULT_OUTPUT_PATH = 'manual-artifacts/market-pricing/source-adapter-dry-run-latest.json';

function nowIso() {
  return new Date().toISOString();
}

export function buildDryRunReport(generatedAt = nowIso()) {
  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_source_adapter_dry_run_report',
    generatedAt,
    status: 'dry_run_only',
    sourceMode: 'adapter_design_only',
    networkAllowed: false,
    apiCalled: false,
    secretsRead: false,
    productionDataWritten: false,
    historyFileModified: false,
    calculationPerformed: false,
    assets: [
      {
        assetKey: 'qqq',
        symbol: 'QQQ',
        labelZh: '纳斯达克100 ETF',
        priority: 1,
        candidateRole: 'preferred_primary',
        adapterCandidates: [
          {
            adapterKey: 'stooq_candidate',
            status: 'candidate_only',
            networkEnabled: false,
            notesZh: '候选公开历史数据来源；本轮不抓取。'
          },
          {
            adapterKey: 'yahoo_style_candidate',
            status: 'candidate_requires_compliance_review',
            networkEnabled: false,
            notesZh: '候选数据来源；需合规和稳定性评估，本轮不抓取。'
          },
          {
            adapterKey: 'future_licensed_candidate',
            status: 'future_option',
            networkEnabled: false,
            notesZh: '未来可接入授权数据源，本轮不抓取。'
          }
        ],
        recordsProduced: 0,
        hasAtLeast60Weeks: false,
        nextAllowedStep: 'future_artifact_only_source_design'
      },
      {
        assetKey: 'ndx',
        symbol: 'NDX',
        labelZh: '纳斯达克100指数',
        priority: 2,
        candidateRole: 'index_candidate',
        adapterCandidates: [],
        recordsProduced: 0,
        hasAtLeast60Weeks: false,
        nextAllowedStep: 'future_source_selection'
      },
      {
        assetKey: 'ixic',
        symbol: 'IXIC',
        labelZh: '纳斯达克综合指数',
        priority: 3,
        candidateRole: 'index_candidate',
        adapterCandidates: [],
        recordsProduced: 0,
        hasAtLeast60Weeks: false,
        nextAllowedStep: 'future_source_selection'
      },
      {
        assetKey: 'spx',
        symbol: 'SPX',
        labelZh: '标普500指数',
        priority: 4,
        candidateRole: 'fallback_candidate_only',
        adapterCandidates: [],
        recordsProduced: 0,
        hasAtLeast60Weeks: false,
        nextAllowedStep: 'fallback_only_not_nasdaq_temperature'
      }
    ],
    boundaries: {
      dryRunOnly: true,
      noFetch: true,
      noCalculation: true,
      noProductionWrite: true,
      displayOnly: true,
      notInvestmentAdvice: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    notesZh: [
      '本报告仅为数据源适配器 dry-run 设计输出。',
      '本轮不抓取任何真实市场数据。',
      '本轮不写入 data/market-pricing-history.json。',
      '本轮不计算 MA60、标准差或 z-score。'
    ]
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') {
      args.output = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

export function writeDryRunReport(outputPath = DEFAULT_OUTPUT_PATH) {
  const report = buildDryRunReport();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return { outputPath, report };
}

export function main() {
  const { output } = parseArgs();
  const result = writeDryRunReport(output);
  console.log('Market pricing source adapter dry-run report: PASS');
  console.log(`output: ${result.outputPath}`);
  console.log('networkAllowed: false');
  console.log('productionDataWritten: false');
  console.log('calculationPerformed: false');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
