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

const ROOT = process.cwd();
const DEFAULT_HISTORY_FILE = 'data/market-pricing-history.json';
const DEFAULT_ARTIFACT_PATH = 'manual-artifacts/market-pricing/qqq-yahoo/qqq-yahoo-latest.json';
const CONTRACT_VERSION = 'qqq-yahoo-history-refresh-1';
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const RANGE = '10y';
const INTERVAL = '1wk';
const TIMEOUT_MS = 8000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/u;

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

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function toProjectRelative(absolutePath) {
  return path.relative(ROOT, absolutePath).replace(/\\/g, '/');
}

function yahooChartUrl() {
  return `${YAHOO_CHART_BASE}/${ASSET.yahooEncodedSymbol}?range=${RANGE}&interval=${INTERVAL}`;
}

function isoWeekFromDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function parseCliArgs(argv) {
  const options = {
    historyFile: DEFAULT_HISTORY_FILE,
    artifactPath: DEFAULT_ARTIFACT_PATH,
    dryRun: true,
    commitHistory: false,
    quiet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      options.commitHistory = false;
      continue;
    }

    if (arg === '--commit-history') {
      options.dryRun = false;
      options.commitHistory = true;
      continue;
    }

    if (arg === '--history-file') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for --history-file'), { exitCode: 2 });
      }
      options.historyFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--history-file=')) {
      options.historyFile = arg.slice('--history-file='.length);
      continue;
    }

    if (arg === '--artifact-path') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for --artifact-path'), { exitCode: 2 });
      }
      options.artifactPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--artifact-path=')) {
      options.artifactPath = arg.slice('--artifact-path='.length);
      continue;
    }

    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }

    throw Object.assign(new Error(`Unknown QQQ refresh argument: ${arg}`), { exitCode: 2 });
  }

  return options;
}

function resolveHistoryFile(rawHistoryFile) {
  const resolved = path.resolve(ROOT, rawHistoryFile || DEFAULT_HISTORY_FILE);
  const required = path.resolve(ROOT, DEFAULT_HISTORY_FILE);

  if (resolved !== required) {
    throw Object.assign(new Error(`History file target must be ${DEFAULT_HISTORY_FILE}`), {
      exitCode: 2
    });
  }

  return resolved;
}

function resolveArtifactPath(rawArtifactPath) {
  const resolved = path.resolve(ROOT, rawArtifactPath || DEFAULT_ARTIFACT_PATH);
  const allowedRoot = path.resolve(ROOT, 'manual-artifacts', 'market-pricing');

  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw Object.assign(
      new Error('QQQ Yahoo artifact path must stay under manual-artifacts/market-pricing/.'),
      { exitCode: 2 }
    );
  }

  return resolved;
}

async function fetchYahooChart() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = yahooChartUrl();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GFRRBot/1.0',
        Referer: 'https://finance.yahoo.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`yahoo_chart_http_${response.status}`);
    }

    return {
      url,
      json: await response.json()
    };
  } finally {
    clearTimeout(timeout);
  }
}

function canonicalizeWeeklyRecords(chartJson) {
  const chart = chartJson?.chart;
  if (chart?.error) {
    throw new Error(`yahoo_chart_error: ${chart.error.description || chart.error.code || 'unknown'}`);
  }

  const result = chart?.result?.[0];
  const meta = result?.meta || {};
  if (meta.symbol !== ASSET.yahooSymbol) {
    throw new Error(`symbol_mismatch: expected ${ASSET.yahooSymbol}, got ${meta.symbol || 'missing'}`);
  }

  if (meta.instrumentType !== ASSET.expectedInstrumentType) {
    throw new Error(`instrument_type_invalid: expected ${ASSET.expectedInstrumentType}, got ${meta.instrumentType || 'missing'}`);
  }

  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];
  const byIsoWeek = new Map();
  const today = todayIso();

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    const close = Number(closes[index]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(close)) continue;

    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    if (!DATE_PATTERN.test(date) || date > today) continue;
    if (close < ASSET.plausibleClose.min || close > ASSET.plausibleClose.max) continue;

    const isoWeek = isoWeekFromDate(date);
    const record = {
      date,
      isoWeek,
      close: round4(close),
      sourceFile: `yahoo-chart-${ASSET.yahooEncodedSymbol}-${RANGE}-${INTERVAL}.json`,
      sourceVendor: 'yahoo_chart'
    };
    const existing = byIsoWeek.get(isoWeek);
    if (!existing || record.date > existing.date) {
      byIsoWeek.set(isoWeek, record);
    }
  }

  const records = [...byIsoWeek.values()].sort((left, right) => left.date.localeCompare(right.date));
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!DATE_PATTERN.test(record.date) || !ISO_WEEK_PATTERN.test(record.isoWeek)) {
      throw new Error(`sanitized_record_invalid: qqq index ${index}`);
    }
    if (index > 0 && record.date <= records[index - 1].date) {
      throw new Error(`sanitized_record_order_invalid: qqq index ${index}`);
    }
  }

  return records;
}

function buildCoverage(records) {
  return {
    weeklyRows: records.length,
    hasAtLeast60Weeks: records.length >= 60,
    oldestDate: records[0]?.date || null,
    latestDate: records.at(-1)?.date || null
  };
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
  const historyFile = resolveHistoryFile(options.historyFile || DEFAULT_HISTORY_FILE);
  const artifactPath = resolveArtifactPath(options.artifactPath || DEFAULT_ARTIFACT_PATH);
  const generatedAt = nowIso();

  const fetched = await fetchYahooChart();
  const records = canonicalizeWeeklyRecords(fetched.json);
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
