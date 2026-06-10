#!/usr/bin/env node
// Artifact-only adversarial cross-audit of the Fed liquidity / TGA backtest direction.
//
// Purpose: independently falsify-or-confirm scripts/treasury-fiscal-data/liquidity-long-backtest.mjs.
// It is audit-only. It writes ONLY an ignored artifact under manual-artifacts/treasury-fiscal-data/.
// It does not touch data/*.json, realtime/*.json, workflows, Worker, frontend, scoring,
// decisionModel, executionLock, positionGuidance, Action Queue, Trigger Monitor, or Invalidation Rules.
//
// Design notes (cross-audit deltas vs liquidity-long-backtest.mjs):
// 1. Multi-horizon targets: 4w / 8w / 13w / 26w instead of a single 8w window.
// 2. Target separation: reserve drawdown vs broad financial conditions vs market risk
//    (VIX / HY OAS) vs TRUE funding stress (TED spread legacy + SOFR-minus-admin-rate modern).
// 3. Trailing z-score TGA signals (strictly causal, no absolute-dollar threshold) to remove
//    the regime dependence of fixed 150k / 250k million thresholds.
// 4. Circular-shift permutation tests that respect serial correlation of overlapping windows.
// 5. Episode-level detection / false-alarm clustering (rare-event honesty) instead of
//    row-level confusion matrices alone.
// 6. Walk-forward (expanding window, yearly folds) tuned variant to test whether ANY
//    threshold tuning yields stable out-of-sample skill.
// 7. Signal-lag variant (all signal-side inputs shifted 7 days older) to bound the
//    publication-lag lookahead present in same-date alignment.
// 8. Window completeness rule: a target may be true on partial forward data, but may only
//    be false when the outcome series actually covers the window end (the long-backtest
//    let truncated end-of-sample windows count as negatives).
// 9. DTS earliest-history probe: verifies the "DTS only goes back to 2022-04-18" claim and
//    documents the older account_type labels available for a label-mapped longer DTS path.
//
// All thresholds below are PREREGISTERED before evaluation (rationale in comments).
// The only tuned component is the walk-forward grid, where tuning happens strictly
// inside training folds.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'manual-artifacts/treasury-fiscal-data/liquidity-model-cross-audit-latest.json';
const DEFAULT_START_DATE = '1996-01-01'; // 30y ambition; per-series coverage reported honestly
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_CSV_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const DTS_BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance';
const FRED_API_KEY = (process.env.FRED_API_KEY || '').trim();
const FETCH_TIMEOUT_MS = Number(process.env.LIQUIDITY_CROSS_AUDIT_FETCH_TIMEOUT_MS) || 45000;
const FETCH_RETRIES = Number(process.env.LIQUIDITY_CROSS_AUDIT_FETCH_RETRIES) || 2;
const PREVIOUS_ARTIFACT = 'manual-artifacts/treasury-fiscal-data/liquidity-long-backtest-latest.json';

const SERIES = {
  tgaWednesdayLevel: { id: 'WDTGAL', cadence: 'weekly', unit: 'millions_usd', role: 'tga_proxy_primary' },
  tgaWeekAverage: { id: 'WTREGEN', cadence: 'weekly', unit: 'millions_usd', role: 'tga_proxy_robustness' },
  onRrp: { id: 'RRPONTSYD', cadence: 'daily', unit: 'billions_usd', role: 'current_input' },
  walcl: { id: 'WALCL', cadence: 'weekly', unit: 'millions_usd', role: 'current_input' },
  reserveBalances: { id: 'WRESBAL', cadence: 'weekly', unit: 'millions_usd', role: 'observed_input_and_target' },
  nfci: { id: 'NFCI', cadence: 'weekly', unit: 'index', role: 'target_broad_conditions' },
  stlfsi4: { id: 'STLFSI4', cadence: 'weekly', unit: 'index', role: 'target_broad_stress' },
  hyOas: { id: 'BAMLH0A0HYM2', cadence: 'daily', unit: 'percent', role: 'target_market_credit' },
  vix: { id: 'VIXCLS', cadence: 'daily', unit: 'index', role: 'target_market_vol' },
  ted: { id: 'TEDRATE', cadence: 'daily', unit: 'percent', role: 'target_funding_legacy_discontinued_2022' },
  sofr: { id: 'SOFR', cadence: 'daily', unit: 'percent', role: 'target_funding_modern' },
  iorb: { id: 'IORB', cadence: 'daily', unit: 'percent', role: 'admin_rate_2021plus' },
  ioer: { id: 'IOER', cadence: 'daily', unit: 'percent', role: 'admin_rate_2008_2021' }
};

// ---- PREREGISTERED constants -------------------------------------------------------------
// Rationale documented per item. None of these were chosen after looking at results.
const PRE = {
  horizonsDays: [28, 56, 91, 182],
  // Mirrors of the long-backtest target definitions (kept identical for comparability):
  reserveStressMinPct: -5,
  nfciLevel: 0.5, nfciRise: 0.3,
  stlfsiLevel: 0.5, stlfsiRise: 0.5,
  // Market stress: VIX 30 is the canonical equity-vol stress line; +150bp HY widening inside
  // the window is a standard meaningful credit repricing.
  vixLevel: 30, hyRisePp: 1.5, hyNowLevel: 6.0,
  // TRUE funding stress: TED >= 50bp covers 1998 / 2007-09 / 2011 era bank-funding stress;
  // SOFR printing >= 10bp above the admin rate (IOER/IORB) is the post-2018 repo-scarcity line
  // (Sep-2019 spiked ~ +290bp; 2018-12-31 ~ +60bp).
  tedLevel: 0.5, sofrAdminSpread: 0.10,
  // Audited threshold from the previous agent (NOT endorsed; replayed for comparability):
  tgaDrainFixed4wMillions: 150000,
  // Causal z-score config: 3y trailing window, >=1y warmup; z>=1.5 is a standard "unusual" line.
  tgaZWindow: 156, tgaZMin: 52, tgaZ: 1.5,
  // Mechanically-motivated composite: a TGA rebuild only drains reserves when the ON RRP
  // buffer cannot absorb it. 250bn sits between the production "tight" (300) and the
  // production "critical" (100) lines; z>=1.0 because the conditioning already filters.
  tgaZConditional: 1.0, rrpThinBillions: 250,
  // Reserve drain screen on the already-observed WRESBAL input: -2% in 4w is about one
  // standard 2022-era QT month; steeper than typical noise, far shallower than the -5% target.
  reserveDrain4wPct: -2,
  episodeGapDays: 35, episodeLeadDays: 91, episodeLeadShortDays: 56,
  signalLagDays: 7,
  windowSlackDaysWeekly: 10, windowSlackDaysDaily: 7,
  permutations: 300, permMinShiftRows: 26, permSeed: 0xC0FFEE,
  minCellN: 30, minCellPositives: 5,
  // Gates a NEW model candidate must pass before being called strong enough for a formula PR.
  // (Preregistered so the conclusion cannot be argued backwards from results.)
  strongGates: {
    oosBalancedAccuracy: 0.6,
    oosLift: 1.5,
    permutationP: 0.05,
    minRegimesPassing: 2,
    episodeRecall: 0.6
  }
};

const REGIMES = [
  { key: 'full_sample', start: '0001-01-01', end: '9999-12-31' },
  { key: 'pre_gfc_1996_2007', start: '1996-01-01', end: '2007-12-31' },
  { key: 'gfc_zirp_2008_2013', start: '2008-01-01', end: '2013-12-31' },
  { key: 'pre_buffer_2014_2020', start: '2014-01-01', end: '2020-12-31' },
  { key: 'covid_2020_2021', start: '2020-03-01', end: '2021-12-31' },
  { key: 'modern_2021_present', start: '2021-01-01', end: '9999-12-31' },
  { key: 'qt_2022h2_present', start: '2022-06-01', end: '9999-12-31' },
  { key: 'rrp_depleted_2024_present', start: '2024-01-01', end: '9999-12-31' }
];

const RULES = JSON.parse(fs.readFileSync(path.resolve('config', 'rules.json'), 'utf8'));

// ---- small utils -------------------------------------------------------------------------
function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(n))); }
function round(v, d = 4) { return Number.isFinite(v) ? Number(v.toFixed(d)) : null; }
function fin(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function dateToMs(d) { return Date.parse(`${d}T00:00:00Z`); }
function independentRegimeFamily(regimeKey) {
  if (['modern_2021_present', 'qt_2022h2_present', 'rrp_depleted_2024_present'].includes(regimeKey)) {
    return 'modern_rrp_depletion_family';
  }
  if (regimeKey === 'covid_2020_2021') return 'covid_transition_family';
  if (regimeKey === 'pre_buffer_2014_2020') return 'pre_buffer_family';
  if (regimeKey === 'gfc_zirp_2008_2013') return 'gfc_zirp_family';
  if (regimeKey === 'pre_gfc_1996_2007') return 'pre_gfc_family';
  return regimeKey;
}
function msToDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function addDays(d, n) { return msToDate(dateToMs(d) + n * 86400000); }
function isoToday() { return new Date().toISOString().slice(0, 10); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    output: DEFAULT_OUTPUT,
    startDate: DEFAULT_START_DATE,
    endDate: isoToday(),
    preferFredApi: true,
    includeRows: true,
    skipDtsProbe: false,
    useSourceCache: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--allow-network') { options.allowNetwork = true; continue; }
    if (a === '--output') { options.output = argv[++i]; continue; }
    if (a === '--start-date') { options.startDate = argv[++i]; continue; }
    if (a === '--end-date') { options.endDate = argv[++i]; continue; }
    if (a === '--no-fred-api') { options.preferFredApi = false; continue; }
    if (a === '--no-rows') { options.includeRows = false; continue; }
    if (a === '--skip-dts-probe') { options.skipDtsProbe = true; continue; }
    if (a === '--no-source-cache') { options.useSourceCache = false; continue; }
    throw new Error(`Unknown argument: ${a}`);
  }
  for (const [k, v] of [['start-date', options.startDate], ['end-date', options.endDate]]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) throw new Error(`--${k} must be YYYY-MM-DD.`);
  }
  if (options.startDate > options.endDate) throw new Error('--start-date must be on or before --end-date.');
  return options;
}

function resolveOutputPath(outputPath) {
  const root = process.cwd();
  const allowedRoot = path.resolve(root, 'manual-artifacts', 'treasury-fiscal-data');
  const resolved = path.resolve(root, outputPath);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Cross-audit output must stay under manual-artifacts/treasury-fiscal-data.');
  }
  return resolved;
}

// ---- fetch layer (FRED API preferred; chunked fredgraph CSV fallback) ----------------------
async function sleep(ms) { await new Promise((r) => setTimeout(r, ms)); }

async function fetchTextWithTimeout(url, label, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json,text/csv,text/plain,*/*', 'User-Agent': 'GFRR-liquidity-cross-audit/1.0' },
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
      return await fetchTextWithTimeout(url, `${label}:a${attempt + 1}`, FETCH_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRIES) await sleep(700 * (attempt + 1));
    }
  }
  throw lastError;
}

function parseFredApiObservations(text) {
  const json = JSON.parse(text);
  const obs = Array.isArray(json?.observations) ? json.observations : [];
  return obs
    .map((o) => ({ date: String(o.date || ''), value: fin(o.value) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.value));
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

// Per-series raw cache under the SAME ignored manual-artifacts dir, so slow FRED days do not
// force a full refetch on every audit iteration. Cache keyed by id+range; explicit opt-out
// via --no-source-cache.
const SOURCE_CACHE_DIR = path.resolve('manual-artifacts', 'treasury-fiscal-data', 'source-cache');

function cachePathFor(cfg, startDate, endDate) {
  return path.join(SOURCE_CACHE_DIR, `${cfg.id}_${startDate}_${endDate}.json`);
}

function readSeriesCache(cfg, startDate, endDate) {
  try {
    const file = cachePathFor(cfg, startDate, endDate);
    if (!fs.existsSync(file)) return null;
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached?.id !== cfg.id || !Array.isArray(cached?.points) || !cached.points.length) return null;
    return cached;
  } catch (_e) {
    return null;
  }
}

function writeSeriesCache(series, startDate, endDate) {
  try {
    fs.mkdirSync(SOURCE_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePathFor(series, startDate, endDate), JSON.stringify(series));
  } catch (_e) { /* cache is best-effort */ }
}

async function fetchFredSeries(cfg, startDate, endDate, preferApi) {
  let sourceMode = 'fredgraph_csv_chunked';
  let points = null;
  let apiError = null;
  if (preferApi && FRED_API_KEY) {
    try {
      const params = new URLSearchParams({
        series_id: cfg.id, api_key: FRED_API_KEY, file_type: 'json',
        observation_start: startDate, observation_end: endDate, sort_order: 'asc', limit: '100000'
      });
      points = parseFredApiObservations(await retryFetchText(`${FRED_API_BASE}?${params}`, `fred-api:${cfg.id}`));
      sourceMode = 'fred_api';
    } catch (error) {
      apiError = String(error?.message || error);
    }
  }
  if (!points) {
    const chunkYears = cfg.cadence === 'daily' ? 8 : 16;
    points = [];
    for (const chunk of buildDateChunks(startDate, endDate, chunkYears)) {
      const params = new URLSearchParams({ cosd: chunk.startDate, coed: chunk.endDate, id: cfg.id });
      points.push(...parseFredCsv(await retryFetchText(`${FRED_CSV_BASE}?${params}`, `fred-csv:${cfg.id}:${chunk.startDate}`)));
    }
  }
  const deduped = [...new Map(points.map((p) => [p.date, p])).values()]
    .filter((r) => r.date >= startDate && r.date <= endDate)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const series = {
    id: cfg.id, cadence: cfg.cadence, unit: cfg.unit, role: cfg.role,
    sourceMode, apiError,
    count: deduped.length,
    firstDate: deduped[0]?.date || null,
    latestDate: deduped[deduped.length - 1]?.date || null,
    points: deduped
  };
  if (deduped.length) writeSeriesCache(series, startDate, endDate);
  return series;
}

async function probeDtsHistory() {
  const out = { ok: false, datasetEarliestRecordDate: null, tgaClosingEarliestRecordDate: null, earliestDateAccountTypes: [], error: null };
  try {
    const earliest = JSON.parse(await retryFetchText(
      `${DTS_BASE}?fields=record_date&sort=record_date&page[size]=1`, 'dts-probe-earliest'));
    out.datasetEarliestRecordDate = earliest?.data?.[0]?.record_date || null;

    const tga = JSON.parse(await retryFetchText(
      `${DTS_BASE}?fields=record_date&filter=account_type:eq:${encodeURIComponent('Treasury General Account (TGA) Closing Balance')}&sort=record_date&page[size]=1`,
      'dts-probe-tga'));
    out.tgaClosingEarliestRecordDate = tga?.data?.[0]?.record_date || null;

    if (out.datasetEarliestRecordDate) {
      const labels = JSON.parse(await retryFetchText(
        `${DTS_BASE}?fields=record_date,account_type&filter=record_date:eq:${out.datasetEarliestRecordDate}&page[size]=60`,
        'dts-probe-labels'));
      out.earliestDateAccountTypes = [...new Set((labels?.data || []).map((r) => String(r.account_type || '')))].filter(Boolean);
    }
    out.ok = true;
  } catch (error) {
    out.error = String(error?.message || error);
  }
  return out;
}

// ---- series helpers ----------------------------------------------------------------------
function valueAtOrBefore(rows, date, maxAgeDays = Infinity) {
  let lo = 0; let hi = rows.length - 1; let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].date <= date) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (best < 0) return null;
  const row = rows[best];
  const age = Math.round((dateToMs(date) - dateToMs(row.date)) / 86400000);
  if (age > maxAgeDays) return null;
  return { ...row, ageDays: age };
}

function valuesInWindow(rows, startExclusive, endInclusive) {
  return rows.filter((r) => r.date > startExclusive && r.date <= endInclusive);
}

function maxIn(rows) {
  let best = null;
  for (const r of rows) if (Number.isFinite(r.value) && (!best || r.value > best.value)) best = r;
  return best;
}

function minPct(rows, base) {
  if (!Number.isFinite(base) || base === 0) return null;
  let min = null;
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue;
    const c = ((r.value - base) / base) * 100;
    if (!Number.isFinite(min) || c < min) min = c;
  }
  return round(min, 3);
}

function pctChange(cur, prior) {
  if (!Number.isFinite(cur) || !Number.isFinite(prior) || prior === 0) return null;
  return round(((cur - prior) / prior) * 100, 3);
}

// Production mirror (scripts/run-daily-pipeline.mjs::computeFedLiquidityPressure).
function computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange) {
  let pressure = 0;
  const legs = { walcl: 0, onRrpLevel: 0, rapidDrop: 0 };
  if (Number.isFinite(walcl4wChange)) {
    if (walcl4wChange <= -2) legs.walcl = 40;
    else if (walcl4wChange <= -1) legs.walcl = 25;
    else if (walcl4wChange <= -0.3) legs.walcl = 10;
  }
  const md = RULES.macroDrivers.fedLiquidity;
  if (Number.isFinite(onRrp)) {
    if (onRrp < md.onRrpCriticalThreshold) legs.onRrpLevel = 45;
    else if (onRrp < md.onRrpTightThreshold) legs.onRrpLevel = 25;
  }
  if (Number.isFinite(onRrpWeekChange) && onRrpWeekChange <= -15) legs.rapidDrop = 15;
  pressure = legs.walcl + legs.onRrpLevel + legs.rapidDrop;
  return { pressure: clamp(pressure), legs };
}

// Target evaluation with window-completeness semantics:
// true on partial evidence; false only when the series demonstrably covers the window end;
// otherwise null. This removes the long-backtest end-of-sample truncation bias.
function levelOrRiseTarget(rows, current, date, horizonEnd, level, rise, slackDays) {
  const windowRows = valuesInWindow(rows, date, horizonEnd);
  const futureMax = maxIn(windowRows);
  // "covered" requires the series to span the window on BOTH sides: it must already exist at
  // the anchor date and still publish through the window end. Otherwise absence of a hit is
  // missing data, not a negative.
  const covered = rows.length > 0
    && rows[0].date <= date
    && rows[rows.length - 1].date >= addDays(horizonEnd, -slackDays);
  const levelHit = Number.isFinite(futureMax?.value) && futureMax.value >= level;
  const riseHit = Number.isFinite(futureMax?.value) && Number.isFinite(current) && rise !== null
    ? (futureMax.value - current) >= rise : false;
  if (levelHit || riseHit) return true;
  if (covered && (windowRows.length > 0 || rows.length > 0)) {
    if (rise !== null && !Number.isFinite(current)) return null; // cannot assert "no rise" without baseline
    return false;
  }
  return null;
}

function buildSofrAdminSpread(sofrRows, iorbRows, ioerRows) {
  const admin = [...ioerRows, ...iorbRows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const adminDedup = [...new Map(admin.map((p) => [p.date, p])).values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out = [];
  for (const s of sofrRows) {
    const a = valueAtOrBefore(adminDedup, s.date, 7);
    if (!a) continue;
    out.push({ date: s.date, value: round(s.value - a.value, 4) });
  }
  return out;
}

// ---- aligned row construction --------------------------------------------------------------
function buildRows(src, options) {
  const grid = src.tgaWednesdayLevel.points.map((p) => p.date)
    .filter((d) => d >= options.startDate && d <= options.endDate);
  const sofrAdmin = buildSofrAdminSpread(src.sofr.points, src.iorb.points, src.ioer.points);

  const rows = [];
  for (const date of grid) {
    const sig = (lagDays) => {
      const at = lagDays ? addDays(date, -lagDays) : date;
      const walcl = valueAtOrBefore(src.walcl.points, at, 10);
      const walclAgo = valueAtOrBefore(src.walcl.points, addDays(at, -28), 10);
      const onRrp = valueAtOrBefore(src.onRrp.points, at, 7);
      const onRrpAgo = valueAtOrBefore(src.onRrp.points, addDays(at, -7), 7);
      const reserve = valueAtOrBefore(src.reserveBalances.points, at, 10);
      const reserveAgo = valueAtOrBefore(src.reserveBalances.points, addDays(at, -28), 10);
      const tga = valueAtOrBefore(src.tgaWednesdayLevel.points, at, 10);
      const tgaAgo4w = valueAtOrBefore(src.tgaWednesdayLevel.points, addDays(at, -28), 10);
      const tgaAgo13w = valueAtOrBefore(src.tgaWednesdayLevel.points, addDays(at, -91), 12);
      const walcl4wChange = pctChange(walcl?.value, walclAgo?.value);
      const onRrpWeekChange = pctChange(onRrp?.value, onRrpAgo?.value);
      const reserve4wChange = pctChange(reserve?.value, reserveAgo?.value);
      const tgaChange4w = Number.isFinite(tga?.value) && Number.isFinite(tgaAgo4w?.value) ? round(tga.value - tgaAgo4w.value, 1) : null;
      const tgaChange13w = Number.isFinite(tga?.value) && Number.isFinite(tgaAgo13w?.value) ? round(tga.value - tgaAgo13w.value, 1) : null;
      const p = computeFedLiquidityPressure(walcl4wChange, onRrp?.value, onRrpWeekChange);
      return {
        walcl: walcl?.value ?? null, walcl4wChange,
        onRrp: onRrp?.value ?? null, onRrpWeekChange,
        reserveBalances: reserve?.value ?? null, reserve4wChange,
        tga: tga?.value ?? null, tgaChange4w, tgaChange13w,
        pressure: p.pressure, pressureLegs: p.legs
      };
    };

    const s0 = sig(0);
    const sLag = sig(PRE.signalLagDays);

    const currentNfci = valueAtOrBefore(src.nfci.points, date, 10);
    const currentStlfsi = valueAtOrBefore(src.stlfsi4.points, date, 10);
    const currentHy = valueAtOrBefore(src.hyOas.points, date, 7);
    const currentVix = valueAtOrBefore(src.vix.points, date, 7);
    const currentTed = valueAtOrBefore(src.ted.points, date, 7);
    const currentSofrAdmin = valueAtOrBefore(sofrAdmin, date, 7);

    const targets = {};
    for (const h of PRE.horizonsDays) {
      const end = addDays(date, h);
      const reserveWindow = valuesInWindow(src.reserveBalances.points, date, end);
      const reserveCovered = src.reserveBalances.points.length > 0
        && src.reserveBalances.points[src.reserveBalances.points.length - 1].date >= addDays(end, -PRE.windowSlackDaysWeekly);
      const reserveMin = minPct(reserveWindow, s0.reserveBalances);
      let reserveStress = null;
      if (Number.isFinite(reserveMin) && reserveMin <= PRE.reserveStressMinPct) reserveStress = true;
      else if (reserveCovered && Number.isFinite(reserveMin)) reserveStress = false;

      const nfciStress = levelOrRiseTarget(src.nfci.points, currentNfci?.value, date, end, PRE.nfciLevel, PRE.nfciRise, PRE.windowSlackDaysWeekly);
      const stlfsiStress = levelOrRiseTarget(src.stlfsi4.points, currentStlfsi?.value, date, end, PRE.stlfsiLevel, PRE.stlfsiRise, PRE.windowSlackDaysWeekly);
      const financialStress = nfciStress === null && stlfsiStress === null ? null : Boolean(nfciStress || stlfsiStress);

      const vixStress = levelOrRiseTarget(src.vix.points, currentVix?.value, date, end, PRE.vixLevel, null, PRE.windowSlackDaysDaily);
      const hyStress = levelOrRiseTarget(src.hyOas.points, currentHy?.value, date, end, Infinity, PRE.hyRisePp, PRE.windowSlackDaysDaily);
      const marketStress = vixStress === null && hyStress === null ? null : Boolean(vixStress || hyStress);

      // Funding legs: TED (legacy, discontinued 2022-01) and SOFR-admin (2018-04+).
      const tedLeg = levelOrRiseTarget(src.ted.points, null, date, end, PRE.tedLevel, null, PRE.windowSlackDaysDaily);
      const sofrLeg = levelOrRiseTarget(sofrAdmin, null, date, end, PRE.sofrAdminSpread, null, PRE.windowSlackDaysDaily);
      const fundingStress = tedLeg === null && sofrLeg === null ? null : Boolean(tedLeg || sofrLeg);

      targets[`h${h}`] = { reserveStress, financialStress, marketStress, fundingStress };
    }

    rows.push({
      date,
      ...s0,
      lag: {
        pressure: sLag.pressure, tgaChange4w: sLag.tgaChange4w, tgaChange13w: sLag.tgaChange13w,
        onRrp: sLag.onRrp, walcl4wChange: sLag.walcl4wChange, reserve4wChange: sLag.reserve4wChange
      },
      now: {
        nfci: currentNfci?.value ?? null,
        stlfsi: currentStlfsi?.value ?? null,
        hy: currentHy?.value ?? null,
        vix: currentVix?.value ?? null,
        ted: currentTed?.value ?? null,
        sofrAdmin: currentSofrAdmin?.value ?? null
      },
      targets
    });
  }

  // Strictly causal trailing z-scores for TGA changes (exclude current row).
  const attachZ = (key, zKey) => {
    const hist = [];
    for (const row of rows) {
      const x = row[key];
      if (hist.length >= PRE.tgaZMin && Number.isFinite(x)) {
        const window = hist.slice(-PRE.tgaZWindow);
        const mean = window.reduce((s, v) => s + v, 0) / window.length;
        const sd = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
        row[zKey] = sd > 0 ? round((x - mean) / sd, 3) : null;
      } else {
        row[zKey] = null;
      }
      if (Number.isFinite(x)) hist.push(x);
    }
  };
  attachZ('tgaChange4w', 'tgaZ4w');
  attachZ('tgaChange13w', 'tgaZ13w');

  return rows;
}

// ---- signals -------------------------------------------------------------------------------
// Each returns true / false / null (null = inputs unavailable -> row excluded for that signal).
const SIGNALS = {
  mirrorPressure45: (r) => (Number.isFinite(r.walcl4wChange) || Number.isFinite(r.onRrp)) ? r.pressure >= 45 : null,
  mirrorPressure60: (r) => (Number.isFinite(r.walcl4wChange) || Number.isFinite(r.onRrp)) ? r.pressure >= 60 : null,
  onRrpCritical: (r) => Number.isFinite(r.onRrp) ? r.onRrp < RULES.macroDrivers.fedLiquidity.onRrpCriticalThreshold : null,
  onRrpTight: (r) => Number.isFinite(r.onRrp) ? r.onRrp < RULES.macroDrivers.fedLiquidity.onRrpTightThreshold : null,
  walclContraction: (r) => Number.isFinite(r.walcl4wChange) ? r.walcl4wChange <= -1 : null,
  tgaDrain4wFixed: (r) => Number.isFinite(r.tgaChange4w) ? r.tgaChange4w >= PRE.tgaDrainFixed4wMillions : null,
  tgaDrain4wZ: (r) => Number.isFinite(r.tgaZ4w) ? r.tgaZ4w >= PRE.tgaZ : null,
  tgaDrain13wZ: (r) => Number.isFinite(r.tgaZ13w) ? r.tgaZ13w >= PRE.tgaZ : null,
  tgaRebuildWhenRrpThin: (r) => (Number.isFinite(r.tgaZ4w) && Number.isFinite(r.onRrp))
    ? (r.tgaZ4w >= PRE.tgaZConditional && r.onRrp < PRE.rrpThinBillions) : null,
  reserveDrain4w: (r) => Number.isFinite(r.reserve4wChange) ? r.reserve4wChange <= PRE.reserveDrain4wPct : null,
  compositeReserveSqueeze: (r) => {
    const a = SIGNALS.reserveDrain4w(r);
    const b = SIGNALS.tgaRebuildWhenRrpThin(r);
    if (a === null && b === null) return null;
    return Boolean(a || b);
  },
  mirrorPressure45OrTgaFixed: (r) => {
    const a = SIGNALS.mirrorPressure45(r);
    const b = SIGNALS.tgaDrain4wFixed(r);
    if (a === null && b === null) return null;
    return Boolean(a || b);
  },
  baselineStressNow: (r) => {
    const n = Number.isFinite(r.now.nfci) ? r.now.nfci >= PRE.nfciLevel : null;
    const s = Number.isFinite(r.now.stlfsi) ? r.now.stlfsi >= PRE.stlfsiLevel : null;
    if (n === null && s === null) return null;
    return Boolean(n || s);
  },
  baselineNfciPositive: (r) => Number.isFinite(r.now.nfci) ? r.now.nfci >= 0 : null
};

const TARGET_KEYS = ['reserveStress', 'financialStress', 'marketStress', 'fundingStress'];

function scoreCell(rows, signalFn, horizon, targetKey) {
  let tp = 0, fp = 0, tn = 0, fnCount = 0;
  for (const row of rows) {
    const s = signalFn(row);
    const t = row.targets[`h${horizon}`][targetKey];
    if (s === null || t === null || t === undefined) continue;
    if (s && t) tp += 1; else if (s && !t) fp += 1; else if (!s && t) fnCount += 1; else tn += 1;
  }
  const n = tp + fp + tn + fnCount;
  const pos = tp + fnCount, neg = tn + fp, sc = tp + fp;
  const precision = sc ? tp / sc : null;
  const recall = pos ? tp / pos : null;
  const specificity = neg ? tn / neg : null;
  const balancedAccuracy = Number.isFinite(recall) && Number.isFinite(specificity) ? (recall + specificity) / 2 : null;
  const baseRate = n ? pos / n : null;
  const lift = Number.isFinite(precision) && Number.isFinite(baseRate) && baseRate > 0 ? precision / baseRate : null;
  return {
    n, tp, fp, tn, fn: fnCount,
    baseRate: round(baseRate), signalRate: round(n ? sc / n : null),
    precision: round(precision), recall: round(recall), specificity: round(specificity),
    balancedAccuracy: round(balancedAccuracy), lift: round(lift),
    lowPower: n < PRE.minCellN || pos < PRE.minCellPositives
  };
}

function regimeRows(rows, regime, options) {
  const start = regime.start === '0001-01-01' ? options.startDate : regime.start;
  const end = regime.end === '9999-12-31' ? options.endDate : regime.end;
  return rows.filter((r) => r.date >= start && r.date <= end);
}

// Circular-shift permutation test preserving serial structure of both vectors.
function permutationTest(rows, signalFn, horizon, targetKey, rng) {
  const pairs = [];
  for (const row of rows) {
    const s = signalFn(row);
    const t = row.targets[`h${horizon}`][targetKey];
    if (s === null || t === null || t === undefined) continue;
    pairs.push([s ? 1 : 0, t ? 1 : 0]);
  }
  const n = pairs.length;
  if (n < PRE.minCellN * 2) return { n, skipped: true };
  const score = (sig) => {
    let tp = 0, fp = 0, tn = 0, fnc = 0;
    for (let i = 0; i < n; i += 1) {
      const s = sig[i], t = pairs[i][1];
      if (s && t) tp += 1; else if (s && !t) fp += 1; else if (!s && t) fnc += 1; else tn += 1;
    }
    const pos = tp + fnc, neg = tn + fp;
    const recall = pos ? tp / pos : 0.5;
    const spec = neg ? tn / neg : 0.5;
    return (recall + spec) / 2;
  };
  const baseSig = pairs.map((p) => p[0]);
  const observed = score(baseSig);
  let ge = 0, le = 0, valid = 0;
  const span = n - 2 * PRE.permMinShiftRows;
  if (span <= 0) return { n, skipped: true };
  for (let k = 0; k < PRE.permutations; k += 1) {
    const offset = PRE.permMinShiftRows + Math.floor(rng() * span);
    const shifted = new Array(n);
    for (let i = 0; i < n; i += 1) shifted[i] = baseSig[(i + offset) % n];
    const s = score(shifted);
    if (s >= observed) ge += 1;
    if (s <= observed) le += 1;
    valid += 1;
  }
  return {
    n,
    observedBalancedAccuracy: round(observed),
    pBetterThanChance: round((ge + 1) / (valid + 1)),
    pWorseThanChance: round((le + 1) / (valid + 1)),
    permutations: valid
  };
}

// ---- episode analysis ------------------------------------------------------------------------
function detectEpisodes(rows, nowFn) {
  const flagged = rows.filter((r) => nowFn(r) === true).map((r) => r.date);
  const episodes = [];
  for (const d of flagged) {
    const last = episodes[episodes.length - 1];
    if (last && dateToMs(d) - dateToMs(last.end) <= PRE.episodeGapDays * 86400000) last.end = d;
    else episodes.push({ start: d, end: d });
  }
  return episodes;
}

const NOW_FNS = {
  financialNow: (r) => {
    const n = Number.isFinite(r.now.nfci) ? r.now.nfci >= PRE.nfciLevel : null;
    const s = Number.isFinite(r.now.stlfsi) ? r.now.stlfsi >= PRE.stlfsiLevel : null;
    if (n === null && s === null) return null;
    return Boolean(n || s);
  },
  fundingNow: (r) => {
    const t = Number.isFinite(r.now.ted) ? r.now.ted >= PRE.tedLevel : null;
    const s = Number.isFinite(r.now.sofrAdmin) ? r.now.sofrAdmin >= PRE.sofrAdminSpread : null;
    if (t === null && s === null) return null;
    return Boolean(t || s);
  },
  marketNow: (r) => {
    const v = Number.isFinite(r.now.vix) ? r.now.vix >= PRE.vixLevel : null;
    const h = Number.isFinite(r.now.hy) ? r.now.hy >= PRE.hyNowLevel : null;
    if (v === null && h === null) return null;
    return Boolean(v || h);
  }
};

function episodeAnalysis(rows, signalKeys) {
  const out = {};
  for (const [nowKey, nowFn] of Object.entries(NOW_FNS)) {
    const episodes = detectEpisodes(rows, nowFn);
    const perSignal = {};
    for (const sk of signalKeys) {
      const sfn = SIGNALS[sk];
      const fired = rows.filter((r) => sfn(r) === true).map((r) => r.date);
      const detected = [];
      for (const ep of episodes) {
        const leadStart = addDays(ep.start, -PRE.episodeLeadDays);
        const leadStartShort = addDays(ep.start, -PRE.episodeLeadShortDays);
        const hits = fired.filter((d) => d >= leadStart && d < ep.start);
        const hitsShort = fired.filter((d) => d >= leadStartShort && d < ep.start);
        detected.push({
          start: ep.start, end: ep.end,
          detectedLead13w: hits.length > 0,
          detectedLead8w: hitsShort.length > 0,
          leadDays: hits.length ? Math.round((dateToMs(ep.start) - dateToMs(hits[hits.length - 1])) / 86400000) : null
        });
      }
      // false-alarm clusters
      const clusters = [];
      for (const d of fired) {
        const last = clusters[clusters.length - 1];
        if (last && dateToMs(d) - dateToMs(last.end) <= PRE.episodeGapDays * 86400000) last.end = d;
        else clusters.push({ start: d, end: d });
      }
      let falseAlarms = 0;
      for (const c of clusters) {
        const justified = episodes.some((ep) => ep.start >= c.start && ep.start <= addDays(c.end, PRE.episodeLeadDays));
        const inside = episodes.some((ep) => c.start >= ep.start && c.start <= ep.end);
        if (!justified && !inside) falseAlarms += 1;
      }
      perSignal[sk] = {
        episodesTotal: episodes.length,
        episodesDetectedLead13w: detected.filter((d) => d.detectedLead13w).length,
        episodesDetectedLead8w: detected.filter((d) => d.detectedLead8w).length,
        signalClusters: clusters.length,
        falseAlarmClusters: falseAlarms,
        episodes: detected
      };
    }
    out[nowKey] = { episodes, perSignal };
  }
  return out;
}

// ---- walk-forward tuned variant ----------------------------------------------------------------
function walkForward(rows, horizon, targetKey, startTestYear, endTestYear) {
  const grid = [];
  for (const p of [30, 45, 60]) grid.push({ mode: 'pressureOnly', p, z: null });
  for (const z of [1.0, 1.5, 2.0]) grid.push({ mode: 'tgaOnly', p: null, z });
  for (const p of [30, 45, 60]) for (const z of [1.0, 1.5, 2.0]) grid.push({ mode: 'pressureOrTga', p, z });
  for (const z of [1.0, 1.5, 2.0]) grid.push({ mode: 'tgaAndRrpThin', p: null, z });

  const evalCfg = (cfg) => (r) => {
    const pSig = cfg.p !== null
      ? ((Number.isFinite(r.walcl4wChange) || Number.isFinite(r.onRrp)) ? r.pressure >= cfg.p : null)
      : null;
    const zVal = Number.isFinite(r.tgaZ4w) ? r.tgaZ4w : null;
    let zSig = null;
    if (cfg.mode === 'tgaOnly' || cfg.mode === 'pressureOrTga') zSig = zVal === null ? null : zVal >= cfg.z;
    if (cfg.mode === 'tgaAndRrpThin') {
      zSig = (zVal === null || !Number.isFinite(r.onRrp)) ? null : (zVal >= cfg.z && r.onRrp < PRE.rrpThinBillions);
    }
    if (cfg.mode === 'pressureOnly') return pSig;
    if (cfg.mode === 'tgaOnly' || cfg.mode === 'tgaAndRrpThin') return zSig;
    if (pSig === null && zSig === null) return null;
    return Boolean(pSig || zSig);
  };

  const folds = [];
  const oos = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (let year = startTestYear; year <= endTestYear; year += 1) {
    const train = rows.filter((r) => r.date < `${year}-01-01`);
    const test = rows.filter((r) => r.date >= `${year}-01-01` && r.date <= `${year}-12-31`);
    if (!test.length || train.length < 100) continue;
    let best = null;
    for (const cfg of grid) {
      const m = scoreCell(train, evalCfg(cfg), horizon, targetKey);
      if (!Number.isFinite(m.balancedAccuracy)) continue;
      if (!best || m.balancedAccuracy > best.m.balancedAccuracy
        || (m.balancedAccuracy === best.m.balancedAccuracy && (m.lift || 0) > (best.m.lift || 0))) {
        best = { cfg, m };
      }
    }
    if (!best) continue;
    const testM = scoreCell(test, evalCfg(best.cfg), horizon, targetKey);
    oos.tp += testM.tp; oos.fp += testM.fp; oos.tn += testM.tn; oos.fn += testM.fn;
    folds.push({
      testYear: year,
      chosen: best.cfg,
      trainBalancedAccuracy: best.m.balancedAccuracy,
      test: { n: testM.n, tp: testM.tp, fp: testM.fp, tn: testM.tn, fn: testM.fn, balancedAccuracy: testM.balancedAccuracy, lift: testM.lift }
    });
  }
  const n = oos.tp + oos.fp + oos.tn + oos.fn;
  const pos = oos.tp + oos.fn, neg = oos.tn + oos.fp, sc = oos.tp + oos.fp;
  const recall = pos ? oos.tp / pos : null;
  const spec = neg ? oos.tn / neg : null;
  const precision = sc ? oos.tp / sc : null;
  const baseRate = n ? pos / n : null;
  return {
    horizon, targetKey, folds,
    oosAggregate: {
      n, ...oos,
      baseRate: round(baseRate),
      precision: round(precision), recall: round(recall), specificity: round(spec),
      balancedAccuracy: round(Number.isFinite(recall) && Number.isFinite(spec) ? (recall + spec) / 2 : null),
      lift: round(Number.isFinite(precision) && baseRate > 0 ? precision / baseRate : null)
    },
    chosenParamsStability: [...new Set(folds.map((f) => JSON.stringify(f.chosen)))].length
  };
}

// Feasibility is computed from OBSERVED series start dates, not assumptions.
function buildFeasibility(src, options) {
  const fd = Object.fromEntries(Object.entries(src).map(([k, s]) => [k, s.firstDate]));
  const end = options.endDate;
  const yearsBack = (first) => first ? round((dateToMs(end) - dateToMs(first)) / (365.25 * 86400000), 1) : null;
  const coverYears = Object.fromEntries(Object.entries(fd).map(([k, v]) => [k, yearsBack(v)]));
  const tgaYears = coverYears.tgaWednesdayLevel;
  return {
    observedFirstDates: fd,
    observedCoverageYears: coverYears,
    tenYear: {
      feasible: Boolean(tgaYears && tgaYears >= 10 && coverYears.walcl >= 10 && coverYears.reserveBalances >= 10),
      note: 'TGA proxy / WALCL / WRESBAL / NFCI / STLFSI4 / VIX all cover 10y+. RRPONTSYD exists but is only economically meaningful from the 2013-09 fixed-rate facility (near-zero balances before).'
    },
    twentyYear: {
      feasible: Boolean(tgaYears && tgaYears >= 20) ? 'partial' : false,
      note: `Observed WDTGAL/WTREGEN history starts ${fd.tgaWednesdayLevel} (~${tgaYears}y), so a ~20y panel exists, but: (1) ON RRP cannot be used as a level signal before 2013-09 (balances were ~0; the production absolute-threshold rule degenerates); (2) pre-2008 reserves were corridor-era scarce reserves, so WRESBAL %-drawdown targets are not comparable pre/post 2008. A 20y model must either drop ON RRP or hard-split regimes.`
    },
    thirtyYear: {
      feasible: false,
      note: `NOT feasible with FRED weekly TGA proxies: observed WDTGAL starts ${fd.tgaWednesdayLevel} (~${tgaYears}y, not 30y). Outcome series (NFCI ${fd.nfci}, STLFSI4 ${fd.stlfsi4}, VIX ${fd.vix}, TED ${fd.ted}) do reach ~30y, but the TGA/liquidity SIGNAL side does not. A 30y TGA backtest would require digitizing pre-2003 H.4.1 releases or another source family - out of scope for FRED-based replay. Any 20y+/30y model also cannot depend on ON RRP (2003+ / meaningful 2013-09+) or WALCL (${fd.walcl}+).`
    },
    hyOasCaveat: src.hyOas.count
      ? `BAMLH0A0HYM2 via keyless fredgraph CSV returned only ${src.hyOas.firstDate}..${src.hyOas.latestDate} (${src.hyOas.count} rows) - ICE BofA download history appears restricted without the API; HY-based market-stress legs are null before that window.`
      : 'BAMLH0A0HYM2 fetch failed entirely; HY-based market-stress legs are null.',
    dtsDaily: {
      note: 'See dtsProbe: the current "Treasury General Account (TGA) Closing Balance" label starts 2022-04-18, but the operating_cash_balance dataset itself starts earlier under different account_type labels; a label-mapped DTS daily history is possible yet still far short of 10y.'
    }
  };
}

// ---- main ---------------------------------------------------------------------------------------
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.allowNetwork) throw new Error('Refusing network fetch without --allow-network.');
  const outputPath = resolveOutputPath(options.output);

  console.log('[cross-audit] fetching FRED series (API preferred, CSV fallback)...');
  const src = {};
  for (const [key, cfg] of Object.entries(SERIES)) {
    // TEDRATE was discontinued 2022-01; cap its request range to avoid source-side stalls.
    const seriesEnd = cfg.id === 'TEDRATE' && options.endDate > '2022-02-01' ? '2022-02-01' : options.endDate;
    try {
      const cached = options.useSourceCache ? readSeriesCache(cfg, options.startDate, seriesEnd) : null;
      if (cached) {
        src[key] = { ...cached, sourceMode: `${cached.sourceMode}+cache` };
        console.log(`[cross-audit] ${cfg.id}: ${cached.count} rows ${cached.firstDate}..${cached.latestDate} (cache)`);
        continue;
      }
      src[key] = await fetchFredSeries(cfg, options.startDate, seriesEnd, options.preferFredApi);
      console.log(`[cross-audit] ${cfg.id}: ${src[key].count} rows ${src[key].firstDate}..${src[key].latestDate} (${src[key].sourceMode})`);
    } catch (error) {
      // Soft-fail: an audit series that cannot be fetched degrades coverage honestly instead
      // of killing the audit. Dependent targets/signals become null for affected rows.
      src[key] = {
        id: cfg.id, cadence: cfg.cadence, unit: cfg.unit, role: cfg.role,
        sourceMode: 'fetch_failed', apiError: null, fetchError: String(error?.message || error),
        count: 0, firstDate: null, latestDate: null, points: []
      };
      console.log(`[cross-audit] ${cfg.id}: FETCH FAILED (${src[key].fetchError}) -> degraded to empty series`);
    }
  }
  if (!src.tgaWednesdayLevel.points.length) {
    throw new Error('WDTGAL (anchor grid) fetch failed; cross-audit cannot proceed without the TGA proxy grid.');
  }

  const dtsProbe = options.skipDtsProbe ? { ok: false, skipped: true } : await probeDtsHistory();
  if (dtsProbe.ok) {
    console.log(`[cross-audit] DTS dataset earliest=${dtsProbe.datasetEarliestRecordDate} tgaClosingEarliest=${dtsProbe.tgaClosingEarliestRecordDate}`);
  }

  console.log('[cross-audit] building aligned weekly rows...');
  const rows = buildRows(src, options);

  const signalKeys = Object.keys(SIGNALS);
  const regimeSummary = {};
  for (const regime of REGIMES) {
    const rr = regimeRows(rows, regime, options);
    const metrics = {};
    for (const sk of signalKeys) {
      metrics[sk] = {};
      for (const h of PRE.horizonsDays) {
        metrics[sk][`h${h}`] = {};
        for (const tk of TARGET_KEYS) metrics[sk][`h${h}`][tk] = scoreCell(rr, SIGNALS[sk], h, tk);
      }
    }
    regimeSummary[regime.key] = {
      start: regime.start, end: regime.end, rows: rr.length,
      firstDate: rr[0]?.date || null, latestDate: rr[rr.length - 1]?.date || null,
      metrics
    };
  }

  // Lag-7 sensitivity for the headline production signal.
  const lagSensitivity = {};
  for (const regimeKey of ['modern_2021_present', 'qt_2022h2_present', 'full_sample']) {
    const regime = REGIMES.find((x) => x.key === regimeKey);
    const rr = regimeRows(rows, regime, options);
    lagSensitivity[regimeKey] = {
      pressure45_sameDate: scoreCell(rr, SIGNALS.mirrorPressure45, 56, 'financialStress'),
      pressure45_lag7: scoreCell(rr, (r) => (Number.isFinite(r.lag.walcl4wChange) || Number.isFinite(r.lag.onRrp)) ? r.lag.pressure >= 45 : null, 56, 'financialStress'),
      tgaZ_sameDate: scoreCell(rr, SIGNALS.tgaDrain4wZ, 56, 'reserveStress'),
      tgaFixed_sameDate: scoreCell(rr, SIGNALS.tgaDrain4wFixed, 56, 'reserveStress'),
      tgaFixed_lag7: scoreCell(rr, (r) => Number.isFinite(r.lag.tgaChange4w) ? r.lag.tgaChange4w >= PRE.tgaDrainFixed4wMillions : null, 56, 'reserveStress')
    };
  }

  // Permutation tests on selected combos.
  console.log('[cross-audit] running circular-shift permutation tests...');
  const rng = mulberry32(PRE.permSeed);
  const permutationTests = {};
  for (const regimeKey of ['full_sample', 'pre_buffer_2014_2020', 'modern_2021_present', 'qt_2022h2_present']) {
    const regime = REGIMES.find((x) => x.key === regimeKey);
    const rr = regimeRows(rows, regime, options);
    permutationTests[regimeKey] = {};
    for (const sk of ['mirrorPressure45', 'tgaDrain4wFixed', 'tgaDrain4wZ', 'tgaRebuildWhenRrpThin', 'compositeReserveSqueeze', 'baselineStressNow']) {
      permutationTests[regimeKey][sk] = {};
      for (const h of [56, 91]) {
        permutationTests[regimeKey][sk][`h${h}`] = {};
        for (const tk of TARGET_KEYS) {
          permutationTests[regimeKey][sk][`h${h}`][tk] = permutationTest(rr, SIGNALS[sk], h, tk, rng);
        }
      }
    }
  }

  // Episode analysis (full sample; episodes are inherently rare).
  console.log('[cross-audit] running episode-level analysis...');
  const episodes = episodeAnalysis(rows, ['mirrorPressure45', 'tgaDrain4wFixed', 'tgaDrain4wZ', 'tgaRebuildWhenRrpThin', 'compositeReserveSqueeze']);

  // Walk-forward tuned variants.
  console.log('[cross-audit] running walk-forward folds...');
  const walkForwardResults = {
    financialStress_h56: walkForward(rows, 56, 'financialStress', 2016, Number(options.endDate.slice(0, 4))),
    reserveStress_h56: walkForward(rows, 56, 'reserveStress', 2016, Number(options.endDate.slice(0, 4))),
    fundingStress_h91: walkForward(rows, 91, 'fundingStress', 2016, Number(options.endDate.slice(0, 4)))
  };

  // Production decomposition: why does pressure fire, by year.
  const perYear = {};
  for (const row of rows) {
    if (!Number.isFinite(row.onRrp) && !Number.isFinite(row.walcl4wChange)) continue;
    const y = row.date.slice(0, 4);
    perYear[y] = perYear[y] || { rows: 0, p45: 0, p60: 0, onRrpLevelLeg45: 0, rapidDropLeg: 0, rapidDropWhileRrpBelow25: 0, walclLeg25plus: 0 };
    const b = perYear[y];
    b.rows += 1;
    if (row.pressure >= 45) b.p45 += 1;
    if (row.pressure >= 60) b.p60 += 1;
    if (row.pressureLegs.onRrpLevel === 45) b.onRrpLevelLeg45 += 1;
    if (row.pressureLegs.rapidDrop === 15) b.rapidDropLeg += 1;
    if (row.pressureLegs.rapidDrop === 15 && Number.isFinite(row.onRrp) && row.onRrp < 25) b.rapidDropWhileRrpBelow25 += 1;
    if (row.pressureLegs.walcl >= 25) b.walclLeg25plus += 1;
  }

  // Reproduction cross-check vs previous artifact (their row filter, their regime, my data).
  let previousComparison = null;
  try {
    const prev = JSON.parse(fs.readFileSync(path.resolve(PREVIOUS_ARTIFACT), 'utf8'));
    const prevCell = prev?.assessment?.modernCurrentPressureFinancialStress8w || null;
    const replicaRows = rows.filter((r) => r.date >= '2021-01-01'
      && Number.isFinite(r.walcl4wChange) && Number.isFinite(r.onRrp)
      && Number.isFinite(r.reserveBalances) && Number.isFinite(r.tga)
      && r.targets.h56.reserveStress !== null && r.targets.h56.financialStress !== null);
    const replicaCell = scoreCell(replicaRows, SIGNALS.mirrorPressure45, 56, 'financialStress');
    previousComparison = {
      previousArtifactGeneratedAt: prev?.generatedAt || null,
      previousModernPressure45FinancialStress8w: prevCell,
      thisAuditReplication: replicaCell,
      note: 'Replication uses the previous row filter (finite walcl4w/onRrp/reserve/tga + non-null 8w targets) on independently fetched data; small diffs from vintage/end-date are expected. This audit additionally enforces window completeness, which the previous artifact did not.'
    };
  } catch (_e) {
    previousComparison = { error: 'previous artifact not readable' };
  }

  // ---- automated assessment against preregistered gates ----------------------------------------
  const g = PRE.strongGates;
  const cell = (rk, sk, h, tk) => regimeSummary[rk]?.metrics?.[sk]?.[`h${h}`]?.[tk] || null;
  const perm = (rk, sk, h, tk) => permutationTests[rk]?.[sk]?.[`h${h}`]?.[tk] || null;

  const modernP45 = cell('modern_2021_present', 'mirrorPressure45', 56, 'financialStress');
  const modernP45Perm = perm('modern_2021_present', 'mirrorPressure45', 56, 'financialStress');
  const currentLogicInvertedModern = Boolean(
    Number.isFinite(modernP45?.balancedAccuracy) && modernP45.balancedAccuracy <= 0.45
    && Number.isFinite(modernP45Perm?.pWorseThanChance) && modernP45Perm.pWorseThanChance <= 0.10
  );

  let currentLogicAnySkill = false;
  for (const rk of ['modern_2021_present', 'qt_2022h2_present', 'full_sample', 'pre_buffer_2014_2020']) {
    for (const h of [56, 91]) {
      for (const tk of TARGET_KEYS) {
        const c = cell(rk, 'mirrorPressure45', h, tk);
        const p = perm(rk, 'mirrorPressure45', h, tk);
        if (c && !c.lowPower && Number.isFinite(c.balancedAccuracy) && c.balancedAccuracy >= 0.55
          && Number.isFinite(c.lift) && c.lift >= 1.2
          && Number.isFinite(p?.pBetterThanChance) && p.pBetterThanChance <= g.permutationP) {
          currentLogicAnySkill = true;
        }
      }
    }
  }

  const candidateRegimes = ['pre_buffer_2014_2020', 'modern_2021_present', 'qt_2022h2_present'];
  const candidateSignals = ['tgaDrain4wZ', 'tgaRebuildWhenRrpThin', 'compositeReserveSqueeze'];
  const candidateEvidence = [];
  for (const sk of candidateSignals) {
    let passes = 0;
    const details = [];
    const independentFamilies = new Set();
    for (const rk of candidateRegimes) {
      for (const h of [56, 91]) {
        for (const tk of ['reserveStress', 'fundingStress', 'financialStress']) {
          const c = cell(rk, sk, h, tk);
          const p = perm(rk, sk, h, tk);
          const pass = Boolean(c && !c.lowPower
            && Number.isFinite(c.balancedAccuracy) && c.balancedAccuracy >= g.oosBalancedAccuracy
            && Number.isFinite(c.lift) && c.lift >= g.oosLift
            && Number.isFinite(p?.pBetterThanChance) && p.pBetterThanChance <= g.permutationP);
          if (pass) {
            passes += 1;
            const regimeFamily = independentRegimeFamily(rk);
            independentFamilies.add(regimeFamily);
            details.push({ regime: rk, regimeFamily, horizon: h, target: tk, cell: c, perm: p });
          }
        }
      }
    }
    candidateEvidence.push({
      signal: sk,
      gatePassCount: passes,
      independentRegimeFamilyCount: independentFamilies.size,
      independentRegimeFamilies: [...independentFamilies],
      passingCells: details
    });
  }
  const newModelCandidateStrong = candidateEvidence.some((e) => (
    e.independentRegimeFamilyCount >= g.minRegimesPassing
  ));

  const wfFin = walkForwardResults.financialStress_h56.oosAggregate;
  const tunedHelps = Number.isFinite(wfFin?.balancedAccuracy) && wfFin.balancedAccuracy >= 0.55 && Number.isFinite(wfFin?.lift) && wfFin.lift >= 1.2;

  const assessment = {
    formulaApproved: false,
    productionIntegrationApproval: false,
    preregisteredGates: g,
    currentLogicAnyForwardSkillAtGates: currentLogicAnySkill,
    currentLogicInvertedInModernRegime: currentLogicInvertedModern,
    tunedWalkForwardShowsStableSkill: tunedHelps,
    newModelCandidateStrongEnoughForFormulaPr: newModelCandidateStrong,
    strongCandidateGateNote: 'Passing cells must come from independent regime families; nested modern / QT / RRP-depleted windows do not count as separate confirmation.',
    candidateEvidence,
    notes: [
      'All series are final-vintage FRED data; NFCI and STLFSI4 are revised indices, so any apparent real-time skill is an upper bound.',
      'Signal-side same-date alignment embeds ~1-7 days of publication lag lookahead; see lagSensitivity for the bound.',
      'Row-level metrics use overlapping forward windows on weekly rows; effective sample size is far below n. Permutation tests and episode counts are the honest power measures.',
      'True funding-stress episodes are rare (single digits in 30 years); no statistical screen on this sample can be called "proven" at episode level.'
    ]
  };

  const artifact = {
    schemaVersion: 1,
    kind: 'artifact_only_liquidity_model_cross_audit',
    generatedAt: new Date().toISOString(),
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
      sourceModePreferred: FRED_API_KEY && options.preferFredApi ? 'fred_api' : 'fredgraph_csv_chunked',
      preregistered: PRE,
      series: Object.fromEntries(Object.entries(SERIES).map(([k, v]) => [k, v.id]))
    },
    sourceFetch: Object.fromEntries(Object.entries(src).map(([k, s]) => [k, {
      id: s.id, cadence: s.cadence, unit: s.unit, role: s.role, sourceMode: s.sourceMode,
      apiError: s.apiError || null, count: s.count, firstDate: s.firstDate, latestDate: s.latestDate
    }])),
    dtsProbe,
    coverage: {
      gridRows: rows.length,
      firstDate: rows[0]?.date || null,
      latestDate: rows[rows.length - 1]?.date || null
    },
    longHorizonFeasibility: buildFeasibility(src, options),
    regimeSummary,
    lagSensitivity,
    permutationTests,
    episodeAnalysis: episodes,
    walkForward: walkForwardResults,
    pressureDecompositionPerYear: perYear,
    previousArtifactComparison: previousComparison,
    assessment,
    boundaries: {
      noDataJsonWrite: true, noRealtimeWrite: true, noWorkflowChange: true,
      noFrontendChange: true, noWorkerRuntimeChange: true,
      affectsValues: false, affectsDisplayInputsBaseline: false, affectsEffectiveDisplayInputs: false,
      affectsScoring: false, affectsDecisionModel: false, affectsExecutionLock: false,
      affectsPositionGuidance: false, affectsActionQueue: false, affectsTriggerMonitor: false,
      affectsInvalidationRules: false
    },
    rows: options.includeRows ? rows.map((r) => ({
      date: r.date,
      pressure: r.pressure,
      pressureLegs: r.pressureLegs,
      onRrp: round(r.onRrp, 3),
      onRrpWeekChange: r.onRrpWeekChange,
      walcl4wChange: r.walcl4wChange,
      reserve4wChange: r.reserve4wChange,
      tgaChange4w: r.tgaChange4w,
      tgaZ4w: r.tgaZ4w,
      tgaZ13w: r.tgaZ13w,
      now: r.now,
      targets: r.targets
    })) : undefined
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 1)}\n`);
  console.log(`[cross-audit] wrote ${artifact.outputPath}`);
  console.log(`[cross-audit] gridRows=${artifact.coverage.gridRows} ${artifact.coverage.firstDate}..${artifact.coverage.latestDate}`);
  console.log(`[cross-audit] currentLogicAnyForwardSkillAtGates=${assessment.currentLogicAnyForwardSkillAtGates}`);
  console.log(`[cross-audit] currentLogicInvertedInModernRegime=${assessment.currentLogicInvertedInModernRegime}`);
  console.log(`[cross-audit] newModelCandidateStrongEnoughForFormulaPr=${assessment.newModelCandidateStrongEnoughForFormulaPr}`);
  console.log('[cross-audit] formulaApproved=false; productionDataWritten=false; runtimeChanged=false; scoringChanged=false');
}

main().catch((error) => {
  console.error(`[cross-audit] FATAL: ${error?.message || error}`);
  process.exit(1);
});
