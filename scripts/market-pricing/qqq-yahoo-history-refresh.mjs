/*
 * QQQ Market Pricing weekly history auto-refresh (Yahoo chart)
 *
 * Mirrors scripts/market-pricing/ndx-ixic-yahoo-history-refresh.mjs but for the
 * QQQ PRIMARY asset, replacing the manual Nasdaq.com CSV download flow
 * (scripts/refresh-qqq-data.ps1, kept as a fallback) with an automated Yahoo
 * chart fetch so the weekly refresh no longer depends on an operator remembering
 * to download a CSV.
 *
 * Hard guarantees:
 *   - Daily/manual market-pricing path only; never Worker runtime
 *   - No environment-variable reads and no secret dependency
 *   - No new npm dependency (uses global fetch)
 *   - Market Pricing history is display-only: does NOT feed scoring, decision,
 *     execution, position, displayInputsBaseline, or cross-validation
 *   - Preserves top-level sourceMode and the ndx / ixic / spx assets untouched;
 *     only assets.qqq records / source / coverage are updated
 *   - Preserves qqq's status (active), priority (1), labelZh, frequency,
 *     currency, and dataGaps from the existing history
 *
 * QQQ close note: QQQ is an ETF, so Yahoo's raw quote.close equals Nasdaq's
 * "Close/Last" traded price for the same date (no index/adjusted divergence),
 * which is why a full overwrite is safe and keeps one consistent date convention.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalizeWeeklyRecords, buildCoverage } from './yahoo-weekly-records.mjs';
import { fetchYahooChart, RANGE, INTERVAL } from './yahoo-weekly-chart.mjs';
import { createYahooHistoryRefreshCli } from './yahoo-history-refresh-cli.mjs';

const { parseCliArgs, resolveHistoryFile, resolveArtifactPath, toProjectRelative } = createYahooHistoryRefreshCli({
  root: process.cwd(), label: 'QQQ',
  artifactDefault: 'manual-artifacts/market-pricing/qqq-yahoo/qqq-yahoo-latest.json'
});
const CONTRACT_VERSION = 'qqq-yahoo-history-refresh-1';

const ASSET = {
  assetKey: 'qqq',
  symbol: 'QQQ',
  yahooSymbol: 'QQQ',
  yahooEncodedSymbol: 'QQQ',
  expectedInstrumentType: 'ETF',
  plausibleClose: { min: 50, max: 2000 }
};

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

function buildUpdatedHistory(history, records, sourceUrl, committedAt) {
  if (!isRecord(history) || !isRecord(history.assets) || !isRecord(history.assets.qqq)) {
    throw new Error('existing_history_schema_invalid: assets.qqq with records array required');
  }
  if (!Array.isArray(history.assets.qqq.records)) {
    throw new Error('assets.qqq.records must be an array');
  }

  const next = cloneJson(history);
  next.updatedAt = committedAt;
  next.generatedAt = committedAt;
  // Preserve sourceMode: check-market-pricing-history asserts the exact string
  // 'manual_weekly_input_committed'. Kept as a legacy file-mode label even though
  // qqq is now auto-refreshed; per-asset source vendor records the real source.
  next.sourceMode = history.sourceMode || 'manual_weekly_input_committed';

  const existingQqq = next.assets.qqq;
  next.assets = {
    ...next.assets,
    qqq: {
      ...existingQqq,
      // Preserve symbol / labelZh / priority / status / frequency / currency /
      // dataGaps from the existing primary asset; only update the data + source.
      records,
      source: {
        vendor: 'yahoo_chart',
        downloadUrl: sourceUrl,
        chartRange: RANGE,
        chartInterval: INTERVAL,
        autoRefresh: true,
        marketPricingDailyOnly: true,
        workerRuntime: false,
        previousVendor: existingQqq?.source?.vendor ?? null,
        lastCommittedAt: committedAt,
        committedRecordsCount: records.length
      },
      coverage: buildCoverage(records)
    }
  };

  return next;
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

export async function buildQqqYahooHistoryRefreshReport(options = {}) {
  const dryRun = options.dryRun !== false;
  const historyFile = resolveHistoryFile(options.historyFile);
  const artifactPath = resolveArtifactPath(options.artifactPath);
  const generatedAt = nowIso();

  const fetched = await fetchYahooChart(ASSET.yahooEncodedSymbol);
  const records = canonicalizeWeeklyRecords(ASSET, fetched.json, { today: todayIso(), range: RANGE, interval: INTERVAL });
  if (records.length === 0) {
    throw new Error('qqq: no_valid_weekly_records');
  }
  if (records.length < 60) {
    throw new Error(`qqq: insufficient_weekly_records (${records.length} < 60)`);
  }

  const currentHistory = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  const updatedHistory = buildUpdatedHistory(currentHistory, records, fetched.url, generatedAt);

  const report = {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_qqq_yahoo_history_refresh',
    generatedAt,
    status: dryRun ? 'dry_run' : 'committed',
    dryRun,
    writePerformed: false,
    historyFile: toProjectRelative(historyFile),
    artifactPath: toProjectRelative(artifactPath),
    marketPricingDailyOnly: true,
    workerRuntimeChanged: false,
    asset: {
      assetKey: ASSET.assetKey,
      symbol: ASSET.symbol,
      yahooSymbol: ASSET.yahooSymbol,
      sourceUrl: fetched.url,
      plausibleClose: ASSET.plausibleClose,
      recordsCount: records.length,
      earliestDate: records[0].date,
      latestDate: records.at(-1).date,
      earliestWeek: records[0].isoWeek,
      latestWeek: records.at(-1).isoWeek,
      previewFirst3: records.slice(0, 3),
      previewLast3: records.slice(-3)
    },
    boundaries: {
      qqqPrimaryPreserved: true,
      ndxIxicSpxPreserved: true,
      sourceModePreserved: true,
      noWorkerRuntimeChange: true,
      noDependencyAdded: true,
      noScoringChange: true,
      noDecisionChange: true,
      noExecutionChange: true,
      noPositionChange: true,
      noDisplayInputsBaselineChange: true,
      noCrossValidationChange: true
    }
  };

  writeArtifact(artifactPath, { ...report, records });

  if (!dryRun) {
    writeJsonAtomically(historyFile, updatedHistory);
    report.writePerformed = true;
  }

  return report;
}

function printSummary(report, quiet) {
  if (quiet) return;
  console.log(`Market pricing QQQ Yahoo history refresh: ${report.dryRun ? 'DRY-RUN OK' : 'COMMITTED'}`);
  console.log(`qqq_records=${report.asset.recordsCount}`);
  console.log(`qqq_range=${report.asset.earliestDate}..${report.asset.latestDate}`);
  console.log(`qqq_latest_week=${report.asset.latestWeek}`);
  console.log(`artifact_path=${report.artifactPath}`);
  console.log(`history_write=${report.writePerformed}`);
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const report = await buildQqqYahooHistoryRefreshReport(options);
    printSummary(report, options.quiet);
  } catch (error) {
    console.error('Market pricing QQQ Yahoo history refresh: FAIL');
    console.error(`reason=${error.message}`);
    process.exitCode = error.exitCode || 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();
}
