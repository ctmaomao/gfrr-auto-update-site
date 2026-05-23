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

const ROOT = process.cwd();
const DEFAULT_HISTORY_FILE = 'data/market-pricing-history.json';
const DEFAULT_ARTIFACT_PATH = 'manual-artifacts/market-pricing/ndx-ixic-yahoo/ndx-ixic-yahoo-latest.json';
const CONTRACT_VERSION = 'v28.0M-91-ndx-ixic-yahoo-history-refresh-1';
const SOURCE_REVIEW_DOC = 'docs/MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md';
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const RANGE = '10y';
const INTERVAL = '1wk';
const TIMEOUT_MS = 8000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/u;
const DAILY_ONLY_MARKER = 'marketPricingDailyOnly';

const ASSETS = {
  ndx: {
    assetKey: 'ndx',
    symbol: 'NDX',
    yahooSymbol: '^NDX',
    yahooEncodedSymbol: '%5ENDX',
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

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function toProjectRelative(absolutePath) {
  return path.relative(ROOT, absolutePath).replace(/\\/g, '/');
}

function yahooChartUrl(config) {
  return `${YAHOO_CHART_BASE}/${config.yahooEncodedSymbol}?range=${RANGE}&interval=${INTERVAL}`;
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

    throw Object.assign(new Error(`Unknown NDX/IXIC refresh argument: ${arg}`), { exitCode: 2 });
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
      new Error('NDX/IXIC Yahoo artifact path must stay under manual-artifacts/market-pricing/.'),
      { exitCode: 2 }
    );
  }

  return resolved;
}

async function fetchYahooChart(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = yahooChartUrl(config);

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

function canonicalizeWeeklyRecords(config, chartJson) {
  const chart = chartJson?.chart;
  if (chart?.error) {
    throw new Error(`yahoo_chart_error: ${chart.error.description || chart.error.code || 'unknown'}`);
  }

  const result = chart?.result?.[0];
  const meta = result?.meta || {};
  if (meta.symbol !== config.yahooSymbol) {
    throw new Error(`symbol_mismatch: expected ${config.yahooSymbol}, got ${meta.symbol || 'missing'}`);
  }

  if (meta.instrumentType !== 'INDEX') {
    throw new Error(`instrument_type_invalid: expected INDEX, got ${meta.instrumentType || 'missing'}`);
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
    if (close < config.plausibleClose.min || close > config.plausibleClose.max) continue;

    const isoWeek = isoWeekFromDate(date);
    const record = {
      date,
      isoWeek,
      close: round4(close),
      sourceFile: `yahoo-chart-${config.yahooEncodedSymbol}-${RANGE}-${INTERVAL}.json`,
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
      throw new Error(`sanitized_record_invalid: ${config.assetKey} index ${index}`);
    }
    if (index > 0 && record.date <= records[index - 1].date) {
      throw new Error(`sanitized_record_order_invalid: ${config.assetKey} index ${index}`);
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
  const historyFile = resolveHistoryFile(options.historyFile || DEFAULT_HISTORY_FILE);
  const artifactPath = resolveArtifactPath(options.artifactPath || DEFAULT_ARTIFACT_PATH);
  const generatedAt = nowIso();
  const assetReports = {};

  for (const assetKey of ASSET_KEYS) {
    const config = ASSETS[assetKey];
    const fetched = await fetchYahooChart(config);
    const records = canonicalizeWeeklyRecords(config, fetched.json);
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
