#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'manual-artifacts/treasury-fiscal-data/liquidity-replay-latest.json';
const DEFAULT_START_DATE = '2023-01-01';
const DEFAULT_DTS_ROWS = 1500;
const FETCH_TIMEOUT_MS = Number(process.env.TREASURY_FISCAL_DATA_FETCH_TIMEOUT_MS) || 20000;
const FRED_FETCH_TIMEOUT_MS = Number(process.env.FRED_FETCH_TIMEOUT_MS) || 20000;
const FRED_API_KEY = (process.env.FRED_API_KEY || '').trim();

const DTS_OPERATING_CASH_BALANCE_ENDPOINT =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance';
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const DTS_SERIES = {
  tgaClosingBalance: {
    accountType: 'Treasury General Account (TGA) Closing Balance',
    expectedLine: '4'
  },
  tgaDeposits: {
    accountType: 'Total TGA Deposits (Table II)',
    expectedLine: '2'
  },
  tgaWithdrawals: {
    accountType: 'Total TGA Withdrawals (Table II) (-)',
    expectedLine: '3'
  }
};

const FRED_SERIES = {
  onRrp: { id: 'RRPONTSYD', unit: 'billions_usd', cadence: 'daily' },
  walcl: { id: 'WALCL', unit: 'millions_usd', cadence: 'weekly' },
  reserveBalances: { id: 'WRESBAL', unit: 'millions_usd', cadence: 'weekly' }
};

const SCREENING_THRESHOLDS = {
  tgaDrain5dMillions: 50000,
  tgaInjection5dMillions: -50000,
  tgaDrain20dMillions: 150000,
  tgaInjection20dMillions: -150000,
  reserve4wDropPct: -1,
  pressureElevated: 45
};

function readRules() {
  return JSON.parse(fs.readFileSync(path.resolve('config', 'rules.json'), 'utf8'));
}

const RULES = readRules();

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function finiteNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    output: DEFAULT_OUTPUT,
    startDate: DEFAULT_START_DATE,
    dtsRows: DEFAULT_DTS_ROWS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--allow-network') {
      options.allowNetwork = true;
      continue;
    }

    if (arg === '--output') {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--start-date') {
      options.startDate = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--dts-rows') {
      options.dtsRows = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(options.startDate || ''))) {
    throw new Error('--start-date must be YYYY-MM-DD.');
  }

  if (!Number.isInteger(options.dtsRows) || options.dtsRows < 120 || options.dtsRows > 5000) {
    throw new Error('--dts-rows must be an integer between 120 and 5000.');
  }

  return options;
}

function resolveOutputPath(outputPath) {
  const root = process.cwd();
  const allowedRoot = path.resolve(root, 'manual-artifacts', 'treasury-fiscal-data');
  const resolved = path.resolve(root, outputPath);

  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Liquidity replay output must stay under manual-artifacts/treasury-fiscal-data.');
  }

  return resolved;
}

async function fetchJsonWithTimeout(url, label, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'GFRR-source-review/1.0',
        ...headers
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${label}:http_${response.status}`);
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label}:timeout_${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildDtsUrl(accountType, rows) {
  return `${DTS_OPERATING_CASH_BALANCE_ENDPOINT}`
    + '?fields=record_date,account_type,open_today_bal,src_line_nbr'
    + `&filter=account_type:eq:${encodeURIComponent(accountType)}`
    + '&sort=-record_date'
    + `&page[size]=${rows}`;
}

async function fetchDtsSeries(seriesConfig, rows) {
  const json = await fetchJsonWithTimeout(
    buildDtsUrl(seriesConfig.accountType, rows),
    `dts:${seriesConfig.expectedLine}`,
    FETCH_TIMEOUT_MS
  );

  const data = Array.isArray(json.data) ? json.data : [];
  const points = data
    .map((row) => ({
      date: String(row.record_date || ''),
      accountType: String(row.account_type || ''),
      value: finiteNumberOrNull(row.open_today_bal),
      sourceLine: String(row.src_line_nbr || '')
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)
      && row.accountType === seriesConfig.accountType
      && Number.isFinite(row.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (!points.length) throw new Error(`DTS series returned no usable rows: ${seriesConfig.accountType}`);

  return {
    accountType: seriesConfig.accountType,
    expectedLine: seriesConfig.expectedLine,
    observedLatestLine: points[points.length - 1]?.sourceLine || null,
    count: points.length,
    firstDate: points[0]?.date || null,
    latestDate: points[points.length - 1]?.date || null,
    points
  };
}

function buildFredApiUrl(seriesId, startDate) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: FRED_API_KEY,
    file_type: 'json',
    observation_start: startDate,
    sort_order: 'asc',
    limit: '100000'
  });
  return `${FRED_API_BASE}?${params.toString()}`;
}

async function fetchFredSeries(seriesId, startDate) {
  const json = await fetchJsonWithTimeout(
    buildFredApiUrl(seriesId, startDate),
    `fred:${seriesId}`,
    FRED_FETCH_TIMEOUT_MS
  );

  const observations = Array.isArray(json.observations) ? json.observations : [];
  const points = observations
    .map((item) => ({
      date: String(item.date || ''),
      value: finiteNumberOrNull(item.value)
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (!points.length) throw new Error(`FRED series returned no usable rows: ${seriesId}`);
  return {
    id: seriesId,
    count: points.length,
    firstDate: points[0].date,
    latestDate: points[points.length - 1].date,
    points
  };
}

function combineDtsSeries(closing, deposits, withdrawals, startDate) {
  const byDate = new Map();

  for (const point of closing.points) {
    byDate.set(point.date, {
      date: point.date,
      tgaBalance: point.value,
      sourceLines: { tgaBalance: point.sourceLine }
    });
  }

  for (const point of deposits.points) {
    const row = byDate.get(point.date);
    if (row) {
      row.tgaDeposits = point.value;
      row.sourceLines.tgaDeposits = point.sourceLine;
    }
  }

  for (const point of withdrawals.points) {
    const row = byDate.get(point.date);
    if (row) {
      row.tgaWithdrawals = point.value;
      row.sourceLines.tgaWithdrawals = point.sourceLine;
    }
  }

  const rows = [...byDate.values()]
    .filter((row) => row.date >= startDate && Number.isFinite(row.tgaBalance))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    row.tgaChange1d = index >= 1 ? row.tgaBalance - rows[index - 1].tgaBalance : null;
    row.tgaChange5d = index >= 5 ? row.tgaBalance - rows[index - 5].tgaBalance : null;
    row.tgaChange20d = index >= 20 ? row.tgaBalance - rows[index - 20].tgaBalance : null;
    row.tgaChange60d = index >= 60 ? row.tgaBalance - rows[index - 60].tgaBalance : null;
    row.tgaNetDepositWithdrawal = Number.isFinite(row.tgaDeposits) && Number.isFinite(row.tgaWithdrawals)
      ? row.tgaDeposits - row.tgaWithdrawals
      : null;
  }

  return rows;
}

function latestOnOrBefore(points, date) {
  let selected = null;
  for (const point of points) {
    if (point.date <= date) selected = point;
    else break;
  }
  return selected;
}

function valueAgo(points, currentDate, days) {
  const currentTime = Date.parse(`${currentDate}T00:00:00Z`);
  if (!Number.isFinite(currentTime)) return null;
  const targetTime = currentTime - days * 24 * 3600 * 1000;
  let best = null;
  let bestDiff = Infinity;
  for (const point of points) {
    if (point.date > currentDate) break;
    const time = Date.parse(`${point.date}T00:00:00Z`);
    const diff = Math.abs(time - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = point.value;
    }
  }
  return Number.isFinite(best) ? best : null;
}

function pctChange(current, ago) {
  if (!Number.isFinite(current) || !Number.isFinite(ago) || ago === 0) return null;
  return +(((current - ago) / ago) * 100).toFixed(3);
}

function classifyFedAssetTrend(pct4w) {
  if (!Number.isFinite(pct4w)) return 'unknown';
  const cfg = RULES.macroDrivers.fedLiquidity;
  if (pct4w <= cfg.walcl4wRapidContractionAlert) return 'rapid_contraction';
  if (pct4w <= cfg.walcl4wContractionAlert) return 'contracting';
  if (pct4w >= cfg.walcl4wExpansionSignal) return 'expanding';
  return 'stable';
}

function classifyOnRrpLevel(onRrp, weekChangePct) {
  if (!Number.isFinite(onRrp)) return 'unknown';
  const cfg = RULES.macroDrivers.fedLiquidity;
  if (onRrp < cfg.onRrpCriticalThreshold) return 'critical';
  if (onRrp < cfg.onRrpTightThreshold) return 'tight';
  if (Number.isFinite(weekChangePct) && weekChangePct <= cfg.onRrpWeekRapidDropPct) return 'rapid_depletion';
  return 'ample';
}

function computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange) {
  const cfg = RULES.macroDrivers.fedLiquidity;
  let pressure = 0;
  if (Number.isFinite(walcl4wChange)) {
    if (walcl4wChange <= -2) pressure += 40;
    else if (walcl4wChange <= -1) pressure += 25;
    else if (walcl4wChange <= -0.3) pressure += 10;
  }
  if (Number.isFinite(onRrp)) {
    if (onRrp < cfg.onRrpCriticalThreshold) pressure += 45;
    else if (onRrp < cfg.onRrpTightThreshold) pressure += 25;
  }
  if (Number.isFinite(onRrpWeekChange) && onRrpWeekChange <= -15) pressure += 15;
  return clamp(pressure);
}

function computeLiquidityRiskProxies(row) {
  const cfg = RULES.macroDrivers.fedLiquidity;
  const sw = RULES.moduleSubWeights.liquidity;
  const fedAssetRisk = Number.isFinite(row.walcl4wChange)
    ? clamp(-row.walcl4wChange * 18)
    : null;
  let onRrpRisk = null;
  if (Number.isFinite(row.onRrp)) {
    if (row.onRrp < cfg.onRrpCriticalThreshold) onRrpRisk = 85;
    else if (row.onRrp < cfg.onRrpTightThreshold) onRrpRisk = 55;
    else if (Number.isFinite(row.onRrpWeekChange) && row.onRrpWeekChange <= cfg.onRrpWeekRapidDropPct) onRrpRisk = 45;
    else onRrpRisk = 15;
  }
  const weightedParts = [
    Number.isFinite(fedAssetRisk) ? { key: 'fedAssetRisk', value: fedAssetRisk, weight: sw.fedAssetWeight } : null,
    Number.isFinite(onRrpRisk) ? { key: 'onRrpRisk', value: onRrpRisk, weight: sw.onRrpWeight } : null
  ].filter(Boolean);
  const weightedProxy = weightedParts.length
    ? weightedParts.reduce((sum, part) => sum + part.value * part.weight, 0)
      / weightedParts.reduce((sum, part) => sum + part.weight, 0)
    : null;
  return { fedAssetRisk, onRrpRisk, currentLiquiditySignalProxy: Number.isFinite(weightedProxy) ? clamp(weightedProxy) : null };
}

function buildAlignedRows(dtsRows, fred) {
  return dtsRows.map((dts) => {
    const onRrpPoint = latestOnOrBefore(fred.onRrp.points, dts.date);
    const walclPoint = latestOnOrBefore(fred.walcl.points, dts.date);
    const reservePoint = latestOnOrBefore(fred.reserveBalances.points, dts.date);

    const onRrp = onRrpPoint?.value ?? null;
    const walcl = walclPoint?.value ?? null;
    const reserveBalances = reservePoint?.value ?? null;
    const onRrpWeekChange = pctChange(onRrp, valueAgo(fred.onRrp.points, dts.date, 7));
    const walcl4wChange = pctChange(walcl, valueAgo(fred.walcl.points, dts.date, 28));
    const reserveBalances4wChange = pctChange(reserveBalances, valueAgo(fred.reserveBalances.points, dts.date, 28));
    const pressure = computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange);

    const row = {
      date: dts.date,
      tgaBalance: dts.tgaBalance,
      tgaDeposits: dts.tgaDeposits ?? null,
      tgaWithdrawals: dts.tgaWithdrawals ?? null,
      tgaNetDepositWithdrawal: dts.tgaNetDepositWithdrawal,
      tgaChange1d: dts.tgaChange1d,
      tgaChange5d: dts.tgaChange5d,
      tgaChange20d: dts.tgaChange20d,
      tgaChange60d: dts.tgaChange60d,
      onRrp,
      onRrpDate: onRrpPoint?.date ?? null,
      onRrpWeekChange,
      onRrpLevel: classifyOnRrpLevel(onRrp, onRrpWeekChange),
      walcl,
      walclDate: walclPoint?.date ?? null,
      walcl4wChange,
      walclRegime: classifyFedAssetTrend(walcl4wChange),
      reserveBalances,
      reserveBalancesDate: reservePoint?.date ?? null,
      reserveBalances4wChange,
      currentPressure
        : pressure,
      fiscalDrain5d: Number.isFinite(dts.tgaChange5d)
        ? dts.tgaChange5d >= SCREENING_THRESHOLDS.tgaDrain5dMillions
        : false,
      fiscalInjection5d: Number.isFinite(dts.tgaChange5d)
        ? dts.tgaChange5d <= SCREENING_THRESHOLDS.tgaInjection5dMillions
        : false,
      fiscalDrain20d: Number.isFinite(dts.tgaChange20d)
        ? dts.tgaChange20d >= SCREENING_THRESHOLDS.tgaDrain20dMillions
        : false,
      fiscalInjection20d: Number.isFinite(dts.tgaChange20d)
        ? dts.tgaChange20d <= SCREENING_THRESHOLDS.tgaInjection20dMillions
        : false,
      reserveDrop4w: Number.isFinite(reserveBalances4wChange)
        ? reserveBalances4wChange <= SCREENING_THRESHOLDS.reserve4wDropPct
        : false,
      currentPressureElevated: pressure >= SCREENING_THRESHOLDS.pressureElevated
    };

    return { ...row, ...computeLiquidityRiskProxies(row) };
  });
}

function pearson(rows, xKey, yKey) {
  const pairs = rows
    .map((row) => [finiteNumberOrNull(row[xKey]), finiteNumberOrNull(row[yKey])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return { n: pairs.length, r: null };
  const avgX = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const avgY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  for (const [x, y] of pairs) {
    const dx = x - avgX;
    const dy = y - avgY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }
  if (denominatorX === 0 || denominatorY === 0) return { n: pairs.length, r: null };
  return { n: pairs.length, r: +(numerator / Math.sqrt(denominatorX * denominatorY)).toFixed(4) };
}

function avgFinite(rows, key) {
  const values = rows.map((row) => finiteNumberOrNull(row[key])).filter(Number.isFinite);
  return values.length ? +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3) : null;
}

function summarizeRows(rows) {
  const fiscalDrains = rows.filter((row) => row.fiscalDrain5d);
  const independentDrains = fiscalDrains.filter((row) => !row.currentPressureElevated && !row.reserveDrop4w);
  const fiscalInjections = rows.filter((row) => row.fiscalInjection5d);
  return {
    rows: rows.length,
    firstDate: rows[0]?.date || null,
    latestDate: rows[rows.length - 1]?.date || null,
    fiscalDrain5d: fiscalDrains.length,
    fiscalDrain5dPct: rows.length ? +(fiscalDrains.length / rows.length).toFixed(4) : null,
    fiscalInjection5d: fiscalInjections.length,
    currentPressureElevated: rows.filter((row) => row.currentPressureElevated).length,
    reserveDrop4w: rows.filter((row) => row.reserveDrop4w).length,
    drainOverlapCurrentPressure: fiscalDrains.filter((row) => row.currentPressureElevated).length,
    drainOverlapReserveDrop: fiscalDrains.filter((row) => row.reserveDrop4w).length,
    drainIndependentOfCurrentPressureAndReserveDrop: independentDrains.length,
    avgTgaChange5d: avgFinite(rows, 'tgaChange5d'),
    avgTgaChange20d: avgFinite(rows, 'tgaChange20d'),
    avgOnRrpWeekChange: avgFinite(rows, 'onRrpWeekChange'),
    avgWalcl4wChange: avgFinite(rows, 'walcl4wChange'),
    avgReserveBalances4wChange: avgFinite(rows, 'reserveBalances4wChange'),
    avgCurrentPressure: avgFinite(rows, 'currentPressure'),
    avgCurrentLiquiditySignalProxy: avgFinite(rows, 'currentLiquiditySignalProxy')
  };
}

function windowSummary(alignedRows) {
  const windows = [
    { key: 'debt_ceiling_rebuild_2023', start: '2023-06-01', end: '2023-08-31' },
    { key: 'normalization_2024', start: '2024-01-01', end: '2024-12-31' },
    { key: 'recent_2025_2026', start: '2025-01-01', end: '2099-12-31' }
  ];

  return Object.fromEntries(windows.map((window) => {
    const rows = alignedRows.filter((row) => row.date >= window.start && row.date <= window.end);
    return [window.key, { window, ...summarizeRows(rows) }];
  }));
}

function topRows(rows, key, direction = 'desc', count = 8) {
  return [...rows]
    .filter((row) => Number.isFinite(finiteNumberOrNull(row[key])))
    .sort((a, b) => direction === 'asc' ? a[key] - b[key] : b[key] - a[key])
    .slice(0, count)
    .map((row) => ({
      date: row.date,
      tgaBalance: row.tgaBalance,
      tgaChange5d: row.tgaChange5d,
      tgaChange20d: row.tgaChange20d,
      tgaChange60d: row.tgaChange60d,
      tgaNetDepositWithdrawal: row.tgaNetDepositWithdrawal,
      onRrp: row.onRrp,
      onRrpWeekChange: row.onRrpWeekChange,
      walcl4wChange: row.walcl4wChange,
      reserveBalances4wChange: row.reserveBalances4wChange,
      currentPressure: row.currentPressure,
      currentLiquiditySignalProxy: row.currentLiquiditySignalProxy
    }));
}

function buildReport({ options, dts, fred, dtsRows, alignedRows }) {
  const rowsWithFullContext = alignedRows.filter((row) => Number.isFinite(row.tgaChange20d)
    && Number.isFinite(row.onRrp)
    && Number.isFinite(row.walcl4wChange)
    && Number.isFinite(row.reserveBalances4wChange));
  const summary = summarizeRows(rowsWithFullContext);
  const enoughRows = rowsWithFullContext.length >= 250;

  return {
    schemaVersion: 'treasury-liquidity-replay-1',
    kind: 'treasury_fiscal_data_liquidity_artifact_only_replay',
    generatedAt: new Date().toISOString(),
    status: enoughRows ? 'diagnostic_ready_for_human_review' : 'insufficient_history_for_formula_review',
    artifactOnly: true,
    formulaApproved: false,
    productionDataWritten: false,
    runtimeChanged: false,
    scoringChanged: false,
    outputPath: options.output,
    inputs: {
      startDate: options.startDate,
      dtsRowsRequestedPerSeries: options.dtsRows,
      dtsEndpoint: DTS_OPERATING_CASH_BALANCE_ENDPOINT,
      fredSeries: FRED_SERIES,
      fredApiKeyPresent: Boolean(FRED_API_KEY),
      noSecretsWritten: true
    },
    sourceFetch: {
      dts: {
        tgaClosingBalance: { ...dts.closing, points: undefined },
        tgaDeposits: { ...dts.deposits, points: undefined },
        tgaWithdrawals: { ...dts.withdrawals, points: undefined }
      },
      fred: {
        onRrp: { ...fred.onRrp, points: undefined },
        walcl: { ...fred.walcl, points: undefined },
        reserveBalances: { ...fred.reserveBalances, points: undefined }
      }
    },
    coverage: {
      dtsRows: dtsRows.length,
      dtsFirstDate: dtsRows[0]?.date || null,
      dtsLatestDate: dtsRows[dtsRows.length - 1]?.date || null,
      alignedRows: alignedRows.length,
      rowsWithFullContext: rowsWithFullContext.length,
      alignedFirstDate: alignedRows[0]?.date || null,
      alignedLatestDate: alignedRows[alignedRows.length - 1]?.date || null
    },
    currentFormulaMirror: {
      fedLiquidityPressure: 'computeFedLiquidityPressure(walcl4wChange,onRrp,onRrpWeekChange)',
      liquidityRiskProxy: 'current formula sub-legs only: fedAssetRisk and onRrpRisk; base market liquidity is not reconstructed here',
      reserveBalances: 'included as overlap diagnostic, not treated as current scoring input'
    },
    thresholds: SCREENING_THRESHOLDS,
    summary,
    windowSummary: windowSummary(rowsWithFullContext),
    correlations: {
      tgaChange5d_vs_reserveBalances4wChange: pearson(rowsWithFullContext, 'tgaChange5d', 'reserveBalances4wChange'),
      tgaChange20d_vs_reserveBalances4wChange: pearson(rowsWithFullContext, 'tgaChange20d', 'reserveBalances4wChange'),
      tgaChange5d_vs_onRrpWeekChange: pearson(rowsWithFullContext, 'tgaChange5d', 'onRrpWeekChange'),
      tgaChange20d_vs_onRrpWeekChange: pearson(rowsWithFullContext, 'tgaChange20d', 'onRrpWeekChange'),
      tgaChange20d_vs_walcl4wChange: pearson(rowsWithFullContext, 'tgaChange20d', 'walcl4wChange'),
      tgaChange5d_vs_currentPressure: pearson(rowsWithFullContext, 'tgaChange5d', 'currentPressure'),
      tgaChange5d_vs_currentLiquiditySignalProxy: pearson(rowsWithFullContext, 'tgaChange5d', 'currentLiquiditySignalProxy'),
      note: 'Preliminary diagnostics only; no threshold or formula approval.'
    },
    eventScreens: {
      topFiscalDrains5d: topRows(rowsWithFullContext, 'tgaChange5d', 'desc'),
      topFiscalInjections5d: topRows(rowsWithFullContext, 'tgaChange5d', 'asc'),
      topFiscalDrains20d: topRows(rowsWithFullContext, 'tgaChange20d', 'desc'),
      topReserveDrops4w: topRows(rowsWithFullContext, 'reserveBalances4wChange', 'asc')
    },
    assessment: {
      incrementalSignal: 'not_evaluated_by_formula',
      formulaApproval: false,
      reason: enoughRows
        ? 'Long source-history replay is available for human review. It still does not approve any formula or production integration.'
        : 'Not enough fully aligned source-history rows for formula review.',
      nextAllowedStep: 'Human review of artifact statistics; if promising, draft a separate pre-registered formula/backtest brief before implementation.'
    },
    boundaries: {
      noDataJsonWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      affectsValues: false,
      affectsDisplayInputsBaseline: false,
      affectsEffectiveDisplayInputs: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsActionQueue: false,
      affectsTriggerMonitor: false,
      affectsInvalidationRules: false
    },
    alignedRows: rowsWithFullContext
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.allowNetwork) {
    throw new Error('Liquidity replay requires explicit --allow-network; no source calls were made.');
  }

  if (!FRED_API_KEY) {
    throw new Error('FRED_API_KEY is required for long liquidity replay; refusing to use unsupported CSV fallback.');
  }

  const outputPath = resolveOutputPath(options.output);
  const [closing, deposits, withdrawals, onRrp, walcl, reserveBalances] = await Promise.all([
    fetchDtsSeries(DTS_SERIES.tgaClosingBalance, options.dtsRows),
    fetchDtsSeries(DTS_SERIES.tgaDeposits, options.dtsRows),
    fetchDtsSeries(DTS_SERIES.tgaWithdrawals, options.dtsRows),
    fetchFredSeries(FRED_SERIES.onRrp.id, options.startDate),
    fetchFredSeries(FRED_SERIES.walcl.id, options.startDate),
    fetchFredSeries(FRED_SERIES.reserveBalances.id, options.startDate)
  ]);

  const dtsRows = combineDtsSeries(closing, deposits, withdrawals, options.startDate);
  const fred = { onRrp, walcl, reserveBalances };
  const alignedRows = buildAlignedRows(dtsRows, fred);
  const report = buildReport({
    options,
    dts: { closing, deposits, withdrawals },
    fred,
    dtsRows,
    alignedRows
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[liquidity-replay] wrote ${options.output}`);
  console.log(`[liquidity-replay] status=${report.status}`);
  console.log(`[liquidity-replay] rowsWithFullContext=${report.coverage.rowsWithFullContext}`);
  console.log('[liquidity-replay] formulaApproval=false; productionDataWritten=false');
}

main().catch((error) => {
  console.error('[liquidity-replay] FATAL:', error?.message || error);
  process.exit(1);
});
