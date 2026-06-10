#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'manual-artifacts/treasury-fiscal-data/liquidity-long-backtest-latest.json';
const DEFAULT_START_DATE = '2014-01-01';
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_CSV_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const FRED_API_KEY = (process.env.FRED_API_KEY || '').trim();
const FETCH_TIMEOUT_MS = Number(process.env.LIQUIDITY_LONG_BACKTEST_FETCH_TIMEOUT_MS) || 30000;
const FETCH_RETRIES = Number(process.env.LIQUIDITY_LONG_BACKTEST_FETCH_RETRIES) || 2;

const SERIES = {
  tgaWednesdayLevel: {
    id: 'WDTGAL',
    cadence: 'weekly',
    unit: 'millions_usd',
    role: 'candidate_tga_proxy_primary'
  },
  tgaWeekAverage: {
    id: 'WTREGEN',
    cadence: 'weekly',
    unit: 'millions_usd',
    role: 'candidate_tga_proxy_robustness'
  },
  onRrp: {
    id: 'RRPONTSYD',
    cadence: 'daily',
    unit: 'billions_usd',
    role: 'current_fed_liquidity_input'
  },
  walcl: {
    id: 'WALCL',
    cadence: 'weekly',
    unit: 'millions_usd',
    role: 'current_fed_liquidity_input'
  },
  reserveBalances: {
    id: 'WRESBAL',
    cadence: 'weekly',
    unit: 'millions_usd',
    role: 'diagnostic_target_and_existing_observation'
  },
  nfci: {
    id: 'NFCI',
    cadence: 'weekly',
    unit: 'index',
    role: 'outcome_target_broad_financial_conditions'
  },
  stlfsi4: {
    id: 'STLFSI4',
    cadence: 'weekly',
    unit: 'index',
    role: 'outcome_target_financial_stress'
  }
};

const SIGNALS = {
  currentPressure45: (row) => row.currentPressure >= 45,
  currentPressure60: (row) => row.currentPressure >= 60,
  walclContraction: (row) => Number.isFinite(row.walcl4wChange) && row.walcl4wChange <= -1,
  onRrpCritical: (row) => Number.isFinite(row.onRrp) && row.onRrp < 100,
  tgaDrain4wShock: (row) => row.tgaDrain4wShock === true,
  tgaDrain12wShock: (row) => row.tgaDrain12wShock === true,
  currentPressure45OrTgaDrain: (row) => row.currentPressure >= 45 || row.tgaDrainShock === true
};

const TARGETS = {
  reserveStress8w: (row) => row.reserveStress8w,
  nfciStress8w: (row) => row.nfciStress8w,
  stlfsi4Stress8w: (row) => row.stlfsi4Stress8w,
  financialStress8w: (row) => row.financialStress8w
};

const REGIMES = [
  {
    key: 'full_since_start',
    label: 'Full sample from requested start date',
    start: '0001-01-01',
    end: '9999-12-31'
  },
  {
    key: 'pre_rrp_buffer_2014_2020',
    label: 'Pre large ON RRP buffer regime',
    start: '2014-01-01',
    end: '2020-12-31'
  },
  {
    key: 'covid_transition_2020_2021',
    label: 'COVID / QE transition',
    start: '2020-03-01',
    end: '2021-12-31'
  },
  {
    key: 'rrp_buffer_2021_present',
    label: 'Large ON RRP buffer and QT-era regime',
    start: '2021-01-01',
    end: '9999-12-31'
  },
  {
    key: 'dts_api_overlap_2022_present',
    label: 'Treasury DTS API overlap window',
    start: '2022-04-18',
    end: '9999-12-31'
  }
];

function readRules() {
  return JSON.parse(fs.readFileSync(path.resolve('config', 'rules.json'), 'utf8'));
}

const RULES = readRules();

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
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
    endDate: isoToday(),
    preferFredApi: true
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

    if (arg === '--end-date') {
      options.endDate = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--no-fred-api') {
      options.preferFredApi = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [name, value] of Object.entries({ startDate: options.startDate, endDate: options.endDate })) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
      throw new Error(`--${name.replace('Date', '-date')} must be YYYY-MM-DD.`);
    }
  }

  if (options.startDate > options.endDate) {
    throw new Error('--start-date must be on or before --end-date.');
  }

  return options;
}

function resolveOutputPath(outputPath) {
  const root = process.cwd();
  const allowedRoot = path.resolve(root, 'manual-artifacts', 'treasury-fiscal-data');
  const resolved = path.resolve(root, outputPath);

  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Long liquidity backtest output must stay under manual-artifacts/treasury-fiscal-data.');
  }

  return resolved;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function dateToMs(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

function msToDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(date, days) {
  return msToDate(dateToMs(date) + days * 24 * 3600 * 1000);
}

function daysBetween(laterDate, earlierDate) {
  return Math.round((dateToMs(laterDate) - dateToMs(earlierDate)) / (24 * 3600 * 1000));
}

function pctChange(current, prior) {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return round(((current - prior) / prior) * 100, 3);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithTimeout(url, label, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,text/csv,text/plain,*/*',
        'User-Agent': 'GFRR-liquidity-long-backtest/1.0'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${label}:http_${response.status}`);
    return await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label}:timeout_${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function retryFetchText(url, label) {
  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      return await fetchTextWithTimeout(url, `${label}:attempt_${attempt + 1}`, FETCH_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRIES) await sleep(600 * (attempt + 1));
    }
  }
  throw lastError;
}

function buildFredApiUrl(seriesId, startDate, endDate) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: FRED_API_KEY,
    file_type: 'json',
    observation_start: startDate,
    observation_end: endDate,
    sort_order: 'asc',
    limit: '100000'
  });
  return `${FRED_API_BASE}?${params.toString()}`;
}

function parseFredApiObservations(text) {
  const json = JSON.parse(text);
  const observations = Array.isArray(json?.observations) ? json.observations : [];
  return observations
    .map((item) => ({
      date: String(item.date || ''),
      value: finiteNumberOrNull(item.value)
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.value));
}

function buildFredCsvUrl(seriesId, startDate, endDate) {
  const params = new URLSearchParams({
    cosd: startDate,
    coed: endDate,
    id: seriesId
  });
  return `${FRED_CSV_BASE}?${params.toString()}`;
}

function parseFredCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) continue;
    if (raw === undefined || raw.trim() === '' || raw.trim() === '.') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out.push({ date, value });
  }
  return out;
}

function buildDateChunks(startDate, endDate, chunkYears) {
  const chunks = [];
  let year = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));

  while (year <= endYear) {
    const chunkStart = year === Number(startDate.slice(0, 4)) ? startDate : `${year}-01-01`;
    const chunkEndYear = Math.min(year + chunkYears - 1, endYear);
    const chunkEnd = chunkEndYear === endYear ? endDate : `${chunkEndYear}-12-31`;
    chunks.push({ startDate: chunkStart, endDate: chunkEnd });
    year = chunkEndYear + 1;
  }

  return chunks;
}

async function fetchFredCsvSeries(seriesId, startDate, endDate, cadence) {
  const chunkYears = cadence === 'daily' ? 1 : 6;
  const chunks = buildDateChunks(startDate, endDate, chunkYears);
  const rows = [];
  for (const chunk of chunks) {
    const url = buildFredCsvUrl(seriesId, chunk.startDate, chunk.endDate);
    const text = await retryFetchText(url, `fred-csv:${seriesId}:${chunk.startDate}:${chunk.endDate}`);
    rows.push(...parseFredCsv(text));
  }
  return rows;
}

async function fetchFredSeries(seriesConfig, startDate, endDate, preferFredApi) {
  let sourceMode = 'fredgraph_csv_chunked';
  let points = null;
  let apiError = null;

  if (preferFredApi && FRED_API_KEY) {
    try {
      const text = await retryFetchText(
        buildFredApiUrl(seriesConfig.id, startDate, endDate),
        `fred-api:${seriesConfig.id}`
      );
      points = parseFredApiObservations(text);
      sourceMode = 'fred_api';
    } catch (error) {
      apiError = String(error?.message || error);
    }
  }

  if (!points) {
    points = await fetchFredCsvSeries(seriesConfig.id, startDate, endDate, seriesConfig.cadence);
  }

  const deduped = [...new Map(points.map((point) => [point.date, point])).values()]
    .filter((row) => row.date >= startDate && row.date <= endDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (!deduped.length) throw new Error(`FRED series returned no usable rows: ${seriesConfig.id}`);

  return {
    id: seriesConfig.id,
    cadence: seriesConfig.cadence,
    unit: seriesConfig.unit,
    role: seriesConfig.role,
    sourceMode,
    apiError,
    count: deduped.length,
    firstDate: deduped[0].date,
    latestDate: deduped[deduped.length - 1].date,
    points: deduped
  };
}

function valueAtOrBefore(rows, date, maxAgeDays = Infinity) {
  let best = null;
  for (const row of rows) {
    if (row.date > date) break;
    best = row;
  }
  if (!best) return null;
  const ageDays = daysBetween(date, best.date);
  if (ageDays < 0 || ageDays > maxAgeDays) return null;
  return { ...best, ageDays };
}

function valuesAfterThrough(rows, startDateExclusive, endDateInclusive) {
  return rows.filter((row) => row.date > startDateExclusive && row.date <= endDateInclusive);
}

function maxValue(rows) {
  let best = null;
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    if (!best || row.value > best.value) best = row;
  }
  return best;
}

function minPctChange(rows, base) {
  if (!Number.isFinite(base) || base === 0) return null;
  let min = null;
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    const change = ((row.value - base) / base) * 100;
    if (!Number.isFinite(min) || change < min) min = change;
  }
  return round(min, 3);
}

function computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange) {
  let pressure = 0;
  if (Number.isFinite(walcl4wChange)) {
    if (walcl4wChange <= -2) pressure += 40;
    else if (walcl4wChange <= -1) pressure += 25;
    else if (walcl4wChange <= -0.3) pressure += 10;
  }

  const md = RULES.macroDrivers.fedLiquidity;
  if (Number.isFinite(onRrp)) {
    if (onRrp < md.onRrpCriticalThreshold) pressure += 45;
    else if (onRrp < md.onRrpTightThreshold) pressure += 25;
  }

  if (Number.isFinite(onRrpWeekChange) && onRrpWeekChange <= md.onRrpWeekRapidDropPct) {
    pressure += 15;
  }

  return clamp(pressure);
}

function buildAlignedRows(sourceFetch, startDate, endDate) {
  const walclRows = sourceFetch.walcl.points;
  const onRrpRows = sourceFetch.onRrp.points;
  const reserveRows = sourceFetch.reserveBalances.points;
  const tgaRows = sourceFetch.tgaWednesdayLevel.points;
  const tgaAverageRows = sourceFetch.tgaWeekAverage.points;
  const nfciRows = sourceFetch.nfci.points;
  const stlfsi4Rows = sourceFetch.stlfsi4.points;

  const rows = [];
  for (const walclPoint of walclRows) {
    const date = walclPoint.date;
    if (date < startDate || date > endDate) continue;

    const walclAgo = valueAtOrBefore(walclRows, addDays(date, -28), 10);
    const onRrp = valueAtOrBefore(onRrpRows, date, 7);
    const onRrpAgo = valueAtOrBefore(onRrpRows, addDays(date, -7), 7);
    const reserve = valueAtOrBefore(reserveRows, date, 10);
    const reserveAgo = valueAtOrBefore(reserveRows, addDays(date, -28), 10);
    const tga = valueAtOrBefore(tgaRows, date, 10);
    const tgaAgo4w = valueAtOrBefore(tgaRows, addDays(date, -28), 10);
    const tgaAgo12w = valueAtOrBefore(tgaRows, addDays(date, -84), 10);
    const tgaAverage = valueAtOrBefore(tgaAverageRows, date, 10);
    const tgaAverageAgo4w = valueAtOrBefore(tgaAverageRows, addDays(date, -28), 10);
    const currentNfci = valueAtOrBefore(nfciRows, date, 10);
    const currentStlfsi4 = valueAtOrBefore(stlfsi4Rows, date, 10);

    const walcl4wChange = pctChange(walclPoint.value, walclAgo?.value);
    const onRrpWeekChange = pctChange(onRrp?.value, onRrpAgo?.value);
    const reserveBalances4wChange = pctChange(reserve?.value, reserveAgo?.value);
    const tgaChange4w = Number.isFinite(tga?.value) && Number.isFinite(tgaAgo4w?.value)
      ? round(tga.value - tgaAgo4w.value, 3)
      : null;
    const tgaChange12w = Number.isFinite(tga?.value) && Number.isFinite(tgaAgo12w?.value)
      ? round(tga.value - tgaAgo12w.value, 3)
      : null;
    const tgaAverageChange4w = Number.isFinite(tgaAverage?.value) && Number.isFinite(tgaAverageAgo4w?.value)
      ? round(tgaAverage.value - tgaAverageAgo4w.value, 3)
      : null;

    const currentPressure = computeFedLiquidityPressure(walcl4wChange, onRrp?.value, onRrpWeekChange);
    const futureReserveRows = valuesAfterThrough(reserveRows, date, addDays(date, 56));
    const futureNfciRows = valuesAfterThrough(nfciRows, date, addDays(date, 56));
    const futureStlfsi4Rows = valuesAfterThrough(stlfsi4Rows, date, addDays(date, 56));
    const futureNfciMax = maxValue(futureNfciRows);
    const futureStlfsi4Max = maxValue(futureStlfsi4Rows);
    const reserveMinChange8w = minPctChange(futureReserveRows, reserve?.value);
    const nfciMaxChange8w = Number.isFinite(futureNfciMax?.value) && Number.isFinite(currentNfci?.value)
      ? round(futureNfciMax.value - currentNfci.value, 3)
      : null;
    const stlfsi4MaxChange8w = Number.isFinite(futureStlfsi4Max?.value) && Number.isFinite(currentStlfsi4?.value)
      ? round(futureStlfsi4Max.value - currentStlfsi4.value, 3)
      : null;

    const tgaDrain4wShock = Number.isFinite(tgaChange4w) && tgaChange4w >= 150000;
    const tgaDrain12wShock = Number.isFinite(tgaChange12w) && tgaChange12w >= 250000;
    const tgaDrainShock = tgaDrain4wShock || tgaDrain12wShock;
    const reserveStress8w = Number.isFinite(reserveMinChange8w) ? reserveMinChange8w <= -5 : null;
    const nfciStress8w = Number.isFinite(futureNfciMax?.value) && Number.isFinite(nfciMaxChange8w)
      ? futureNfciMax.value >= 0.5 || nfciMaxChange8w >= 0.3
      : null;
    const stlfsi4Stress8w = Number.isFinite(futureStlfsi4Max?.value) && Number.isFinite(stlfsi4MaxChange8w)
      ? futureStlfsi4Max.value >= 0.5 || stlfsi4MaxChange8w >= 0.5
      : null;
    const financialStress8w = nfciStress8w === null && stlfsi4Stress8w === null
      ? null
      : Boolean(nfciStress8w || stlfsi4Stress8w);

    rows.push({
      date,
      walcl: walclPoint.value,
      walcl4wChange,
      onRrp: Number.isFinite(onRrp?.value) ? onRrp.value : null,
      onRrpObservationDate: onRrp?.date || null,
      onRrpObservationAgeDays: Number.isFinite(onRrp?.ageDays) ? onRrp.ageDays : null,
      onRrpWeekChange,
      reserveBalances: Number.isFinite(reserve?.value) ? reserve.value : null,
      reserveBalances4wChange,
      tgaWednesdayLevel: Number.isFinite(tga?.value) ? tga.value : null,
      tgaWeekAverage: Number.isFinite(tgaAverage?.value) ? tgaAverage.value : null,
      tgaChange4w,
      tgaChange12w,
      tgaAverageChange4w,
      currentPressure,
      tgaDrain4wShock,
      tgaDrain12wShock,
      tgaDrainShock,
      futureReserveMinChange8w: reserveMinChange8w,
      reserveStress8w,
      currentNfci: Number.isFinite(currentNfci?.value) ? currentNfci.value : null,
      futureNfciMax8w: Number.isFinite(futureNfciMax?.value) ? futureNfciMax.value : null,
      futureNfciMaxDate8w: futureNfciMax?.date || null,
      futureNfciMaxChange8w: nfciMaxChange8w,
      nfciStress8w,
      currentStlfsi4: Number.isFinite(currentStlfsi4?.value) ? currentStlfsi4.value : null,
      futureStlfsi4Max8w: Number.isFinite(futureStlfsi4Max?.value) ? futureStlfsi4Max.value : null,
      futureStlfsi4MaxDate8w: futureStlfsi4Max?.date || null,
      futureStlfsi4MaxChange8w: stlfsi4MaxChange8w,
      stlfsi4Stress8w,
      financialStress8w
    });
  }
  return rows;
}

function scoreSignal(rows, signalFn, targetFn) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const row of rows) {
    const target = targetFn(row);
    if (target === null || target === undefined) continue;
    const signal = Boolean(signalFn(row));
    if (signal && target) tp += 1;
    else if (signal && !target) fp += 1;
    else if (!signal && target) fn += 1;
    else tn += 1;
  }

  const n = tp + fp + tn + fn;
  const positives = tp + fn;
  const negatives = tn + fp;
  const signalCount = tp + fp;
  const precision = signalCount ? tp / signalCount : null;
  const recall = positives ? tp / positives : null;
  const specificity = negatives ? tn / negatives : null;
  const accuracy = n ? (tp + tn) / n : null;
  const balancedAccuracy = Number.isFinite(recall) && Number.isFinite(specificity)
    ? (recall + specificity) / 2
    : null;
  const baseRate = n ? positives / n : null;
  const signalRate = n ? signalCount / n : null;
  const lift = Number.isFinite(precision) && Number.isFinite(baseRate) && baseRate !== 0
    ? precision / baseRate
    : null;

  return {
    n,
    tp,
    fp,
    tn,
    fn,
    baseRate: round(baseRate, 4),
    signalRate: round(signalRate, 4),
    precision: round(precision, 4),
    recall: round(recall, 4),
    specificity: round(specificity, 4),
    accuracy: round(accuracy, 4),
    balancedAccuracy: round(balancedAccuracy, 4),
    lift: round(lift, 4)
  };
}

function pearson(rows, xKey, yKey) {
  const pairs = rows
    .map((row) => [row[xKey], row[yKey]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return { n: pairs.length, r: null };

  const avgX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const avgY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (const [x, y] of pairs) {
    const dx = x - avgX;
    const dy = y - avgY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denominator = Math.sqrt(denomX * denomY);
  return {
    n: pairs.length,
    r: denominator === 0 ? null : round(numerator / denominator, 4)
  };
}

function summarizeRows(rows) {
  const first = rows[0] || null;
  const latest = rows[rows.length - 1] || null;
  const countWhere = (fn) => rows.filter(fn).length;
  const avg = (key) => {
    const vals = rows.map((row) => row[key]).filter(Number.isFinite);
    return vals.length ? round(vals.reduce((sum, value) => sum + value, 0) / vals.length, 3) : null;
  };

  return {
    rows: rows.length,
    firstDate: first?.date || null,
    latestDate: latest?.date || null,
    currentPressure45: countWhere((row) => row.currentPressure >= 45),
    currentPressure60: countWhere((row) => row.currentPressure >= 60),
    tgaDrainShock: countWhere((row) => row.tgaDrainShock === true),
    reserveStress8w: countWhere((row) => row.reserveStress8w === true),
    financialStress8w: countWhere((row) => row.financialStress8w === true),
    avgCurrentPressure: avg('currentPressure'),
    avgTgaChange4w: avg('tgaChange4w'),
    avgTgaChange12w: avg('tgaChange12w'),
    avgWalcl4wChange: avg('walcl4wChange'),
    avgOnRrpWeekChange: avg('onRrpWeekChange'),
    avgReserveBalances4wChange: avg('reserveBalances4wChange')
  };
}

function buildMetrics(rows) {
  const metrics = {};
  for (const [signalKey, signalFn] of Object.entries(SIGNALS)) {
    metrics[signalKey] = {};
    for (const [targetKey, targetFn] of Object.entries(TARGETS)) {
      metrics[signalKey][targetKey] = scoreSignal(rows, signalFn, targetFn);
    }
  }
  return metrics;
}

function buildCorrelations(rows) {
  const xKeys = [
    'currentPressure',
    'walcl4wChange',
    'onRrpWeekChange',
    'tgaChange4w',
    'tgaChange12w',
    'tgaAverageChange4w'
  ];
  const yKeys = [
    'futureReserveMinChange8w',
    'futureNfciMaxChange8w',
    'futureStlfsi4MaxChange8w'
  ];
  const correlations = {};
  for (const xKey of xKeys) {
    correlations[xKey] = {};
    for (const yKey of yKeys) {
      correlations[xKey][yKey] = pearson(rows, xKey, yKey);
    }
  }
  return correlations;
}

function rowsInRegime(rows, regime, options) {
  const start = regime.key === 'full_since_start' ? options.startDate : regime.start;
  const end = regime.key === 'full_since_start' ? options.endDate : regime.end;
  return rows.filter((row) => row.date >= start && row.date <= end);
}

function buildRegimeSummary(rows, options) {
  const out = {};
  for (const regime of REGIMES) {
    const regimeRows = rowsInRegime(rows, regime, options);
    out[regime.key] = {
      label: regime.label,
      start: regime.key === 'full_since_start' ? options.startDate : regime.start,
      end: regime.key === 'full_since_start' ? options.endDate : regime.end,
      summary: summarizeRows(regimeRows),
      metrics: buildMetrics(regimeRows),
      correlations: buildCorrelations(regimeRows)
    };
  }
  return out;
}

function sampleRows(rows, predicate, limit, sortFn) {
  return rows
    .filter(predicate)
    .sort(sortFn)
    .slice(0, limit)
    .map((row) => ({
      date: row.date,
      currentPressure: row.currentPressure,
      tgaChange4w: row.tgaChange4w,
      tgaChange12w: row.tgaChange12w,
      onRrp: row.onRrp,
      onRrpWeekChange: row.onRrpWeekChange,
      walcl4wChange: row.walcl4wChange,
      reserveBalances4wChange: row.reserveBalances4wChange,
      futureReserveMinChange8w: row.futureReserveMinChange8w,
      futureNfciMaxChange8w: row.futureNfciMaxChange8w,
      futureStlfsi4MaxChange8w: row.futureStlfsi4MaxChange8w,
      reserveStress8w: row.reserveStress8w,
      financialStress8w: row.financialStress8w
    }));
}

function buildEventScreens(rows) {
  return {
    topCurrentPressure: sampleRows(
      rows,
      (row) => Number.isFinite(row.currentPressure),
      12,
      (a, b) => b.currentPressure - a.currentPressure || (a.date < b.date ? -1 : 1)
    ),
    topTgaDrains4w: sampleRows(
      rows,
      (row) => Number.isFinite(row.tgaChange4w),
      12,
      (a, b) => b.tgaChange4w - a.tgaChange4w
    ),
    currentPressureFalsePositivesFinancial8w: sampleRows(
      rows,
      (row) => row.currentPressure >= 45 && row.financialStress8w === false,
      12,
      (a, b) => b.currentPressure - a.currentPressure || (b.tgaChange4w || 0) - (a.tgaChange4w || 0)
    ),
    financialStressMisses8w: sampleRows(
      rows,
      (row) => row.financialStress8w === true && row.currentPressure < 45 && row.tgaDrainShock !== true,
      12,
      (a, b) => (b.futureNfciMaxChange8w || 0) - (a.futureNfciMaxChange8w || 0)
    )
  };
}

function metricAt(regimeSummary, regimeKey, signalKey, targetKey) {
  return regimeSummary?.[regimeKey]?.metrics?.[signalKey]?.[targetKey] || null;
}

function buildAssessment(regimeSummary) {
  const modernCurrentFinancial = metricAt(
    regimeSummary,
    'rrp_buffer_2021_present',
    'currentPressure45',
    'financialStress8w'
  );
  const modernCombinedFinancial = metricAt(
    regimeSummary,
    'rrp_buffer_2021_present',
    'currentPressure45OrTgaDrain',
    'financialStress8w'
  );
  const modernCurrentReserve = metricAt(
    regimeSummary,
    'rrp_buffer_2021_present',
    'currentPressure45',
    'reserveStress8w'
  );
  const modernTgaReserve = metricAt(
    regimeSummary,
    'rrp_buffer_2021_present',
    'tgaDrain4wShock',
    'reserveStress8w'
  );
  const preCurrentFinancial = metricAt(
    regimeSummary,
    'pre_rrp_buffer_2014_2020',
    'currentPressure45',
    'financialStress8w'
  );

  const combinedDelta = Number.isFinite(modernCombinedFinancial?.balancedAccuracy)
    && Number.isFinite(modernCurrentFinancial?.balancedAccuracy)
    ? round(modernCombinedFinancial.balancedAccuracy - modernCurrentFinancial.balancedAccuracy, 4)
    : null;
  const combinedBalancedAccuracy = modernCombinedFinancial?.balancedAccuracy ?? null;
  const combinedLift = modernCombinedFinancial?.lift ?? null;
  const tgaReserveLift = modernTgaReserve?.lift ?? null;
  const prePrecision = preCurrentFinancial?.precision ?? null;

  let verdict = 'accuracy_not_proven_not_formula_approved';
  const reasons = [];

  if (Number.isFinite(prePrecision) && prePrecision < 0.25) {
    reasons.push('The ON RRP absolute-threshold rule is regime-dependent; pre-2021 history should not be treated as a clean validation set.');
  }

  if (Number.isFinite(modernCurrentFinancial?.precision) && modernCurrentFinancial.precision < 0.4) {
    reasons.push('Modern-regime current-pressure precision against 8-week broad financial stress is weak; this behaves more like a warning screen than a directional predictor.');
  }

  if (
    Number.isFinite(combinedDelta)
    && Number.isFinite(combinedBalancedAccuracy)
    && Number.isFinite(combinedLift)
    && combinedDelta >= 0.03
    && combinedBalancedAccuracy >= 0.52
    && combinedLift >= 1.05
  ) {
    verdict = 'tga_incremental_signal_plausible_but_requires_preregistered_formula_backtest';
    reasons.push('Adding a simple TGA drain screen improves modern-regime balanced accuracy enough to justify a separate formula brief, but not direct runtime integration.');
  } else if (Number.isFinite(combinedDelta) && combinedDelta > 0) {
    reasons.push('The TGA combination improves one diagnostic metric, but absolute modern-regime balanced accuracy and lift remain too weak for a formula brief.');
  } else {
    reasons.push('The simple TGA drain screen does not yet prove enough incremental lift over current pressure to justify formula integration.');
  }

  if (Number.isFinite(tgaReserveLift) && tgaReserveLift > 1.2) {
    reasons.push('TGA drain shocks show some mechanical relationship to future reserve drawdowns, which is useful for audit review.');
  }

  return {
    verdict,
    formulaApproval: false,
    productionIntegrationApproval: false,
    modernCurrentPressureFinancialStress8w: modernCurrentFinancial,
    modernCombinedPressureOrTgaFinancialStress8w: modernCombinedFinancial,
    modernCurrentPressureReserveStress8w: modernCurrentReserve,
    modernTgaDrainReserveStress8w: modernTgaReserve,
    combinedBalancedAccuracyDelta: combinedDelta,
    reasons,
    nextAllowedStep: 'Human review of this artifact. If promising, draft a separate pre-registered formula/backtest PR before touching runtime, scoring, data, or frontend.'
  };
}

function compactSourceFetch(sourceFetch) {
  return Object.fromEntries(
    Object.entries(sourceFetch).map(([key, series]) => [
      key,
      {
        id: series.id,
        cadence: series.cadence,
        unit: series.unit,
        role: series.role,
        sourceMode: series.sourceMode,
        apiError: series.apiError || null,
        count: series.count,
        firstDate: series.firstDate,
        latestDate: series.latestDate
      }
    ])
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.allowNetwork) {
    throw new Error('Refusing network fetch without --allow-network.');
  }

  const outputPath = resolveOutputPath(options.output);
  const sourceFetch = {};

  for (const [key, seriesConfig] of Object.entries(SERIES)) {
    sourceFetch[key] = await fetchFredSeries(
      seriesConfig,
      options.startDate,
      options.endDate,
      options.preferFredApi
    );
  }

  const alignedRows = buildAlignedRows(sourceFetch, options.startDate, options.endDate);
  const rowsWithFullTargets = alignedRows.filter((row) => (
    Number.isFinite(row.walcl4wChange)
    && Number.isFinite(row.onRrp)
    && Number.isFinite(row.reserveBalances)
    && Number.isFinite(row.tgaWednesdayLevel)
    && row.reserveStress8w !== null
    && row.financialStress8w !== null
  ));

  const regimeSummary = buildRegimeSummary(rowsWithFullTargets, options);
  const artifact = {
    schemaVersion: 1,
    kind: 'artifact_only_liquidity_long_backtest',
    generatedAt: new Date().toISOString(),
    status: rowsWithFullTargets.length >= 200 ? 'diagnostic_ready_for_human_review' : 'insufficient_history',
    artifactOnly: true,
    formulaApproved: false,
    productionDataWritten: false,
    runtimeChanged: false,
    scoringChanged: false,
    outputPath: path.relative(process.cwd(), outputPath).replaceAll(path.sep, '/'),
    inputs: {
      startDate: options.startDate,
      endDate: options.endDate,
      fredApiKeyPresent: Boolean(FRED_API_KEY),
      noSecretsWritten: true,
      sourceMode: FRED_API_KEY && options.preferFredApi ? 'fred_api_preferred' : 'fredgraph_csv_chunked',
      series: SERIES
    },
    method: {
      currentPressureMirror: 'Replicates computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange) from scripts/run-daily-pipeline.mjs.',
      tgaProxy: 'Uses FRED WDTGAL Wednesday Level as primary long-history TGA proxy; WTREGEN week average is retained for robustness diagnostics.',
      targetWindows: 'Eight-week forward reserve drawdown and broad financial stress screens using WRESBAL, NFCI, and STLFSI4.',
      targetLeakageCaveat: 'This evaluates the Fed-liquidity sublogic, not the full GFRR score. It does not approve formula changes.'
    },
    sourceFetch: compactSourceFetch(sourceFetch),
    coverage: {
      alignedRows: alignedRows.length,
      rowsWithFullTargets: rowsWithFullTargets.length,
      firstDate: rowsWithFullTargets[0]?.date || null,
      latestDate: rowsWithFullTargets[rowsWithFullTargets.length - 1]?.date || null
    },
    summary: summarizeRows(rowsWithFullTargets),
    regimeSummary,
    correlations: buildCorrelations(rowsWithFullTargets),
    eventScreens: buildEventScreens(rowsWithFullTargets),
    assessment: buildAssessment(regimeSummary),
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
    alignedRows: rowsWithFullTargets
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`[liquidity-long-backtest] wrote ${artifact.outputPath}`);
  console.log(`[liquidity-long-backtest] status=${artifact.status}`);
  console.log(`[liquidity-long-backtest] rowsWithFullTargets=${artifact.coverage.rowsWithFullTargets}`);
  console.log(`[liquidity-long-backtest] assessment=${artifact.assessment.verdict}`);
  console.log('[liquidity-long-backtest] formulaApproval=false; productionDataWritten=false');
}

main().catch((error) => {
  console.error(`[liquidity-long-backtest] FATAL: ${error?.message || error}`);
  process.exit(1);
});
