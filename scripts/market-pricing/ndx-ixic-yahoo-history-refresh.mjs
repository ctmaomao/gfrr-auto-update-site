/*
 * v28.0M-91 Market Pricing NDX/IXIC Yahoo history refresh
 *
 * Fetches approved Yahoo chart data for ^NDX and ^IXIC, sanitizes it into
 * canonical weekly market-pricing records, and optionally commits those
 * records to data/market-pricing-history.json.
 *
 * Hard guarantees:
 *   - Daily/manual market-pricing path only; never Worker runtime
 *   - No environment-variable reads and no secret dependency
 *   - No new npm dependency
 *   - QQQ history is preserved byte-for-byte inside assets.qqq
 *   - SPX remains fallback_candidate_only
 *   - NDX/IXIC are display-only auxiliary comparison assets
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalizeWeeklyRecords, buildCoverage } from './yahoo-weekly-records.mjs';
import { fetchYahooChart, RANGE, INTERVAL } from './yahoo-weekly-chart.mjs';
import { createYahooHistoryRefreshCli } from './yahoo-history-refresh-cli.mjs';

const { parseCliArgs, resolveHistoryFile, resolveArtifactPath, toProjectRelative } = createYahooHistoryRefreshCli({
  root: process.cwd(), label: 'NDX/IXIC',
  artifactDefault: 'manual-artifacts/market-pricing/ndx-ixic-yahoo/ndx-ixic-yahoo-latest.json'
});
const CONTRACT_VERSION = 'v28.0M-91-ndx-ixic-yahoo-history-refresh-1';
const SOURCE_REVIEW_DOC = 'docs/MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md';
const DAILY_ONLY_MARKER = 'marketPricingDailyOnly';

const ASSETS = {
  ndx: {
    assetKey: 'ndx',
    symbol: 'NDX',
    yahooSymbol: '^NDX',
    yahooEncodedSymbol: '%5ENDX',
    expectedInstrumentType: 'INDEX',
    labelZh: '纳斯达克100指数',
    priority: 2,
    auxiliaryLabelZh: '纳斯达克 100 — 横向对照',
    plausibleClose: { min: 1000, max: 50000 }
  },
  ixic: {
    assetKey: 'ixic',
    symbol: 'IXIC',
    yahooSymbol: '^IXIC',
    yahooEncodedSymbol: '%5EIXIC',
    expectedInstrumentType: 'INDEX',
    labelZh: '纳斯达克综合指数',
    priority: 3,
    auxiliaryLabelZh: '纳斯达克综合指数 — 广度参照',
    plausibleClose: { min: 1000, max: 50000 }
  }
};

const ASSET_KEYS = Object.keys(ASSETS);

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildAssetHistory(config, records, sourceUrl, committedAt) {
  return {
    symbol: config.symbol,
    labelZh: config.labelZh,
    priority: config.priority,
    status: 'history_active_display_only',
    source: {
      vendor: 'yahoo_chart',
      downloadUrl: sourceUrl,
      chartRange: RANGE,
      chartInterval: INTERVAL,
      sourceReview: SOURCE_REVIEW_DOC,
      sourceApproval: 'owner_approved_m91',
      [DAILY_ONLY_MARKER]: true,
      workerRuntime: false,
      lastCommittedAt: committedAt,
      committedRecordsCount: records.length
    },
    frequency: 'weekly',
    currency: 'USD',
    records,
    coverage: buildCoverage(records),
    dataGaps: [
      '仅作为 Market Pricing auxiliary comparison 展示，不替代 QQQ primary。',
      '不进入 scoring、decision、execution、position、displayInputsBaseline 或 cross-validation。'
    ]
  };
}

function validateExistingHistory(history) {
  if (!isRecord(history) || !isRecord(history.assets)) {
    throw new Error('existing_history_schema_invalid');
  }
  if (!isRecord(history.assets.qqq) || !Array.isArray(history.assets.qqq.records)) {
    throw new Error('assets.qqq must remain present with records array');
  }
  if (history.assets.spx?.status !== 'fallback_candidate_only') {
    throw new Error('assets.spx.status must remain fallback_candidate_only');
  }
}

function buildCommittedHistory(history, assetReports, committedAt) {
  validateExistingHistory(history);
  const nextHistory = cloneJson(history);
  nextHistory.updatedAt = committedAt;
  nextHistory.generatedAt = committedAt;
  nextHistory.status = 'has_history';
  nextHistory.sourceMode = history.sourceMode || 'manual_weekly_input_committed';
  nextHistory.descriptionZh =
    '市场定价温度计历史数据。QQQ 继续作为 primary；M-91 已通过 Yahoo chart Daily/manual market-pricing path 接入 NDX / IXIC display-only auxiliary comparison。当前 status=has_history。';
  nextHistory.assets = {
    ...nextHistory.assets,
    ndx: buildAssetHistory(ASSETS.ndx, assetReports.ndx.records, assetReports.ndx.sourceUrl, committedAt),
    ixic: buildAssetHistory(ASSETS.ixic, assetReports.ixic.records, assetReports.ixic.sourceUrl, committedAt)
  };
  nextHistory.boundaries = {
    ...nextHistory.boundaries,
    scaffoldOnly: false,
    noFetch: true,
    noCalculation: true,
    displayOnly: true,
    notInvestmentAdvice: true,
    marketPricingDailyOnly: true,
    noWorkerRuntimeChange: true,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false
  };

  return nextHistory;
}

function writeJsonAtomically(filePath, value) {
  const tmpPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}

function writeArtifact(artifactPath, report) {
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function buildNdxIxicYahooHistoryRefreshReport(options = {}) {
  const dryRun = options.dryRun !== false;
  const historyFile = resolveHistoryFile(options.historyFile);
  const artifactPath = resolveArtifactPath(options.artifactPath);
  const generatedAt = nowIso();
  const assetReports = {};

  for (const assetKey of ASSET_KEYS) {
    const config = ASSETS[assetKey];
    const fetched = await fetchYahooChart(config.yahooEncodedSymbol);
    const records = canonicalizeWeeklyRecords(config, fetched.json, { today: todayIso(), range: RANGE, interval: INTERVAL });
    if (records.length === 0) {
      throw new Error(`${assetKey}: no_valid_weekly_records`);
    }
    assetReports[assetKey] = {
      assetKey,
      symbol: config.symbol,
      yahooSymbol: config.yahooSymbol,
      sourceUrl: fetched.url,
      plausibleClose: config.plausibleClose,
      recordsCount: records.length,
      earliestDate: records[0].date,
      latestDate: records.at(-1).date,
      earliestWeek: records[0].isoWeek,
      latestWeek: records.at(-1).isoWeek,
      previewFirst3: records.slice(0, 3),
      previewLast3: records.slice(-3),
      records
    };
  }

  const currentHistory = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  const committedHistory = buildCommittedHistory(currentHistory, assetReports, generatedAt);
  const report = {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_ndx_ixic_yahoo_history_refresh',
    generatedAt,
    status: dryRun ? 'dry_run' : 'committed',
    dryRun,
    writePerformed: false,
    historyFile: toProjectRelative(historyFile),
    artifactPath: toProjectRelative(artifactPath),
    marketPricingDailyOnly: true,
    workerRuntimeChanged: false,
    sourceReview: SOURCE_REVIEW_DOC,
    assetOrder: ASSET_KEYS,
    assets: assetReports,
    boundaries: {
      qqqPrimaryPreserved: true,
      ndxIxicAuxiliaryOnly: true,
      noWorkerRuntimeChange: true,
      noWorkflowChange: true,
      noDependencyAdded: true,
      noScoringChange: true,
      noDecisionChange: true,
      noExecutionChange: true,
      noPositionChange: true,
      noDisplayInputsBaselineChange: true,
      noCrossValidationChange: true,
      spxFallbackCandidateOnly: true
    }
  };

  writeArtifact(artifactPath, { ...report, assets: assetReports });

  if (!dryRun) {
    writeJsonAtomically(historyFile, committedHistory);
    report.writePerformed = true;
  }

  return report;
}

function printSummary(report, quiet) {
  if (quiet) return;
  console.log(`Market pricing NDX/IXIC Yahoo history refresh: ${report.dryRun ? 'DRY-RUN OK' : 'COMMITTED'}`);
  for (const assetKey of report.assetOrder) {
    const asset = report.assets[assetKey];
    console.log(`${assetKey}_records=${asset.recordsCount}`);
    console.log(`${assetKey}_range=${asset.earliestDate}..${asset.latestDate}`);
  }
  console.log(`artifact_path=${report.artifactPath}`);
  console.log(`history_write=${report.writePerformed}`);
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const report = await buildNdxIxicYahooHistoryRefreshReport(options);
    printSummary(report, options.quiet);
  } catch (error) {
    console.error('Market pricing NDX/IXIC Yahoo history refresh: FAIL');
    console.error(`reason=${error.message}`);
    process.exitCode = error.exitCode || 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();
}
