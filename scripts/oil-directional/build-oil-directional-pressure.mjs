#!/usr/bin/env node
// Oil Directional Pressure Model (ODP) — PR1 build (zero-dependency).
//
// Pulls EIA API v2 weekly petroleum physical series via the legacy route
//   /v2/seriesid/PET.<id>.W
// and reuses WTI / Brent / crack-spread / futures-curve from data/radar-data.json,
// then writes data/oil-directional-pressure.json (evidence + freshness + seasonality).
//
// ADR-0013: this code writes to data/ (production data path) -> it MUST stay
// zero-dependency. Only Node built-ins are imported (no xlsx / no devDeps).
// EIA key is read from process.env.EIA_API_KEY (GitHub secret in CI; injected
// from the gitignored manual-artifacts/eia-api-key.txt for local runs).
//
// Boundary (CLAUDE.md rule 3 analog): audit-only / display-only. ODP must NOT
// enter values/scoring/decisionModel/executionLock/positionGuidance and must NOT
// merge into Global Risk Heatmap. PR1 leaves signals/finalBias/interpretation null
// (those land in PR3); the contract is forward-compatible.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { classifyAt, finalizeBias } from './odp-classifier.mjs';

const SCHEMA_VERSION = 'odp-1';
const OUT_PATH = 'data/oil-directional-pressure.json';
const RADAR_PATH = 'data/radar-data.json';
const HISTORY_PATH = 'data/radar-history-full.json';
const EIA_BASE = 'https://api.eia.gov/v2/seriesid';
// Weekly WPSR cadence: week-ending Friday + ~5d EIA release lag + up to a 7d
// inter-release gap + slack. So the latest point is normally up to ~12-14d old
// right before the next release; >16d means a genuinely missed WPSR release.
const WEEKLY_MAX_AGE_DAYS = 16;
const DAY_MS = 86400000;
const EIA_API_KEY = (process.env.EIA_API_KEY || '').trim();
const EIA_FETCH_TIMEOUT_MS = Number(process.env.EIA_FETCH_TIMEOUT_MS) || 15000;

const EIA_SERIES = [
  { key: 'crudeStocksExSpr',         id: 'WCESTUS1', unit: 'thousand barrels',         signalGroup: 'inventoryDrawPressure' },
  { key: 'sprStocks',                id: 'WCSSTUS1', unit: 'thousand barrels',         signalGroup: 'sprBufferEffectiveness' },
  { key: 'distillateStocks',         id: 'WDISTUS1', unit: 'thousand barrels',         signalGroup: 'dieselProductStress' },
  { key: 'gasolineStocks',           id: 'WGTSTUS1', unit: 'thousand barrels',         signalGroup: 'dieselProductStress' },
  { key: 'refineryUtilization',      id: 'WPULEUS3', unit: 'percent',                  signalGroup: 'refineryConfirmation' },
  { key: 'refinerCrudeInputs',       id: 'WCRRIUS2', unit: 'thousand barrels per day', signalGroup: 'refineryConfirmation' },
  { key: 'demandGasolineSupplied',   id: 'WGFUPUS2', unit: 'thousand barrels per day', signalGroup: 'demandDestructionRisk' },
  { key: 'demandDistillateSupplied', id: 'WDIUPUS2', unit: 'thousand barrels per day', signalGroup: 'demandDestructionRisk' },
];

function round(n, dp = 2) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function ageDaysFrom(iso, builtMs) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.max(0, Math.round((builtMs - ms) / DAY_MS)) : null;
}

// Unified freshness gate for EVERY evidence entry (EIA + reuse + curve):
//   value absent                          -> 'missing'
//   value present but undatable (age null) -> 'stale'  (present, cannot confirm fresh)
//   value present + dated                  -> 'live', unless age > maxAgeDays -> 'stale'
function freshnessStatus(value, ageDays, maxAgeDays) {
  if (value === null || value === undefined) return 'missing';
  if (ageDays === null || ageDays === undefined) return 'stale';
  return ageDays > maxAgeDays ? 'stale' : 'live';
}

function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  return 1 + Math.round((d - firstThu) / (7 * DAY_MS));
}

function seasonBucket(dateStr) {
  const m = Number(dateStr.slice(5, 7));
  if ([11, 12, 1, 2, 3].includes(m)) return 'winter_heating';
  if ([5, 6, 7, 8, 9].includes(m)) return 'summer_driving';
  return 'shoulder';
}

async function fetchEiaSeries(id) {
  const url = `${EIA_BASE}/PET.${id}.W?api_key=${encodeURIComponent(EIA_API_KEY)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EIA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'GFRRBot/1.0' }, signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const j = await res.json();
    if (j && j.error) return { ok: false, reason: 'api_error' };
    const data = j && j.response && j.response.data;
    if (!Array.isArray(data) || !data.length) return { ok: false, reason: 'no_data' };
    const series = data
      .map((it) => ({ period: String(it.period), value: Number(it.value) }))
      .filter((it) => /^\d{4}-\d{2}-\d{2}$/.test(it.period) && Number.isFinite(it.value))
      .sort((a, b) => (a.period < b.period ? -1 : 1));
    if (!series.length) return { ok: false, reason: 'no_numeric' };
    return { ok: true, series, frequency: j.response.frequency || 'weekly' };
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, reason: 'timeout' };
    if (e instanceof SyntaxError) return { ok: false, reason: 'non_json' };
    return { ok: false, reason: 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

function changeNObsAgo(series, n) {
  if (series.length <= n) return null;
  return round(series[series.length - 1].value - series[series.length - 1 - n].value, 3);
}

// Same week-of-year over the prior `years` years: snap to the nearest weekly
// observation within +/-10 days of the same calendar date (ISO-week aligned,
// with a +/-1 week fallback), NOT a rolling mean.
function sameWeekPriorYears(series, years = 5) {
  const latestMs = Date.parse(series[series.length - 1].period + 'T00:00:00Z');
  const picks = [];
  for (let k = 1; k <= years; k++) {
    const target = latestMs - k * 365.2425 * DAY_MS;
    let best = null;
    let bestDiff = Infinity;
    for (const o of series) {
      const diff = Math.abs(Date.parse(o.period + 'T00:00:00Z') - target);
      if (diff < bestDiff) { bestDiff = diff; best = o; }
    }
    if (best && bestDiff <= 10 * DAY_MS) picks.push({ value: best.value, diffDays: Math.round(bestDiff / DAY_MS) });
  }
  return picks;
}

function missingEvidence(cfg, reason) {
  return {
    value: null, unit: cfg.unit, asOfDate: null, frequency: 'weekly',
    ageDays: null, maxAgeDays: WEEKLY_MAX_AGE_DAYS, sourceStatus: 'missing',
    source: `EIA:api-v2:seriesid:PET.${cfg.id}.W`,
    sourceUrl: `https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=${cfg.id}&f=W`,
    change1w: null, change4w: null, change13w: null, vs5yAvgPct: null,
    fiveYrRangePosition: null, historyWeeks: 0, signalGroup: cfg.signalGroup,
    fetchReason: reason,
  };
}

function buildEiaEvidence(cfg, fetched, builtMs) {
  if (!fetched.ok) return [missingEvidence(cfg, fetched.reason), null];
  const { series } = fetched;
  const latest = series[series.length - 1];
  const ageDays = ageDaysFrom(latest.period + 'T00:00:00Z', builtMs);
  const sourceStatus = freshnessStatus(latest.value, ageDays, WEEKLY_MAX_AGE_DAYS);

  const picks = sameWeekPriorYears(series);
  const vals = picks.map((p) => p.value);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const min = vals.length ? Math.min(...vals) : null;
  const max = vals.length ? Math.max(...vals) : null;

  const evidence = {
    value: round(latest.value, 3),
    unit: cfg.unit,
    asOfDate: latest.period,
    frequency: 'weekly',
    ageDays,
    maxAgeDays: WEEKLY_MAX_AGE_DAYS,
    sourceStatus,
    source: `EIA:api-v2:seriesid:PET.${cfg.id}.W`,
    sourceUrl: `https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=${cfg.id}&f=W`,
    change1w: changeNObsAgo(series, 1),
    change4w: changeNObsAgo(series, 4),
    change13w: changeNObsAgo(series, 13),
    vs5yAvgPct: mean ? round(((latest.value - mean) / mean) * 100, 2) : null,
    fiveYrRangePosition: (min !== null && max !== null && max > min)
      ? round((latest.value - min) / (max - min), 3) : null,
    historyWeeks: series.length,
    signalGroup: cfg.signalGroup,
  };
  const season = {
    weekOfYear: isoWeek(latest.period),
    seasonBucket: seasonBucket(latest.period),
    fiveYrSameWeekMean: round(mean, 3),
    fiveYrSameWeekMin: round(min, 3),
    fiveYrSameWeekMax: round(max, 3),
    sampleYears: vals.length,
    windowFallback: picks.length && picks.every((p) => p.diffDays <= 3) ? 'exact' : '±1week',
  };
  return [evidence, season];
}

// Reuse already-fetched price/curve fields from radar-data.json (do NOT re-fetch
// FRED/Yahoo). These stay $/bbl daily-cadence context fields, NOT the physical chain.
function reuseFromRadar(builtMs) {
  let radar;
  try { radar = JSON.parse(readFileSync(RADAR_PATH, 'utf8')); }
  catch { return { _radarMissing: true }; }
  const bp = radar.brentPricingLayer || {};
  const wti = ((radar.macroDrivers || {}).inflationEnergy || {}).wti || {};
  const sb = bp.selectedBrent || {};
  const fpc = bp.futuresPriceCurve || {};
  const num = (v) => (Number.isFinite(Number(v)) ? round(Number(v), 3) : null);
  const priceField = (value, iso, maxAge, source) => {
    const v = num(value);
    const a = ageDaysFrom(iso, builtMs);
    return {
      value: v, unit: '$/bbl', asOfDate: iso || null, frequency: 'daily',
      ageDays: a, maxAgeDays: maxAge,
      sourceStatus: freshnessStatus(v, a, maxAge),
      source,
    };
  };
  const crackAge = ageDaysFrom(radar.updatedAt, builtMs);
  const curveAge = ageDaysFrom(fpc.updatedAt, builtMs);
  const curveFmb = num(fpc.frontMinusBack);
  const curveHasData = curveFmb !== null && !!fpc.curveStatus && fpc.curveStatus !== 'missing';
  return {
    wtiPrice: priceField(wti.price, wti.updatedAt, 10, 'radar-data:macroDrivers.inflationEnergy.wti'),
    brentPrice: priceField(sb.value, sb.observedAt, 5, 'radar-data:brentPricingLayer.selectedBrent'),
    crackSpread: {
      value: num(bp.crackSpread), unit: '$/bbl', asOfDate: radar.updatedAt || null,
      frequency: 'daily', ageDays: crackAge, maxAgeDays: 10,
      sourceStatus: freshnessStatus(num(bp.crackSpread), crackAge, 10),
      change4w: num(bp.crackSpread4wChange), regime: bp.crackSpreadRegime || null,
      note: '价格/裂解代理,非馏分油库存',
      source: 'radar-data:brentPricingLayer.crackSpread',
    },
    curve: {
      slopeRegime: fpc.slopeRegime || null, frontMinusBack: curveFmb,
      frontPrice: num(fpc.frontPrice), backPrice: num(fpc.backPrice),
      confidence: 'low', curveStatus: fpc.curveStatus || null,
      frequency: 'daily', asOfDate: fpc.updatedAt || null,
      ageDays: curveAge, maxAgeDays: 4,
      sourceStatus: curveHasData ? freshnessStatus(curveFmb, curveAge, 4) : 'missing',
      source: 'radar-data:brentPricingLayer.futuresPriceCurve',
      limitationZh: '公开月度期货代理,非官方结算曲线',
    },
  };
}

// Crude price direction for the divergence overlay: Brent ~4-week % change from the
// committed daily radar history (zero-dep reuse). Returns null when the history is
// missing/short or lacks a point near ~4w ago -> the overlay then emits no false_*.
function brentChange4wFromHistory() {
  let hist;
  try { hist = JSON.parse(readFileSync(HISTORY_PATH, 'utf8')); }
  catch { return null; }
  if (!Array.isArray(hist) || hist.length < 2) return null;
  const pts = hist.filter((d) => d && typeof d.date === 'string' && Number.isFinite(Number(d.brent)));
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const lastMs = Date.parse(last.date + 'T00:00:00Z');
  const target = lastMs - 28 * DAY_MS;
  let best = null;
  let bestDiff = Infinity;
  for (const d of pts) {
    const diff = Math.abs(Date.parse(d.date + 'T00:00:00Z') - target);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  if (!best || bestDiff > 10 * DAY_MS) return null;
  const prev = Number(best.brent);
  const cur = Number(last.brent);
  if (!(prev > 0)) return null;
  return round(((cur - prev) / prev) * 100, 2);
}

async function main() {
  if (!EIA_API_KEY) {
    console.error('[odp] FATAL: EIA_API_KEY not set — aborting (fail-closed, no fabrication).');
    process.exit(1);
  }
  const builtAt = new Date().toISOString();
  const builtMs = Date.parse(builtAt);

  const evidence = {};
  const seasonality = {};
  const history = { series: {} };
  let liveCount = 0;

  for (const cfg of EIA_SERIES) {
    const fetched = await fetchEiaSeries(cfg.id);
    const [ev, season] = buildEiaEvidence(cfg, fetched, builtMs);
    evidence[cfg.key] = ev;
    if (season) seasonality[cfg.key] = season;
    history.series[cfg.key] = { sourceStatus: ev.sourceStatus, points: fetched.ok ? fetched.series : [] };
    if (ev.sourceStatus === 'live') liveCount++;
    console.log(`[odp] ${cfg.key.padEnd(24)} PET.${cfg.id}.W ${ev.sourceStatus}` +
      (ev.value !== null
        ? ` value=${ev.value} ${ev.unit} asOf=${ev.asOfDate} 1w=${ev.change1w} 4w=${ev.change4w} vs5y=${ev.vs5yAvgPct}%`
        : ` (${ev.fetchReason})`));
  }

  const reuse = reuseFromRadar(builtMs);
  if (reuse._radarMissing) {
    console.log('[odp] WARN: data/radar-data.json unreadable — reuse price/curve fields skipped.');
  } else {
    Object.assign(evidence, reuse);
  }

  // PR3 — productionize the LOCKED physical classifier + the price-divergence overlay.
  // SAME-WEEK GUARD (mirrors PR2's canonical-grid check, for the LIVE path): the physical
  // chain must be ONE week. classifyAt() takes idxAtOrBefore per series, so a single series
  // lagging a week (yet within maxAgeDays) would silently mix weeks. Require EVERY EIA series
  // live and sharing crude's latest period; otherwise emit insufficient_data (no mixed-week verdict).
  const crudePts = (history.series.crudeStocksExSpr || {}).points || [];
  const canonicalPeriod = crudePts.length ? crudePts[crudePts.length - 1].period : null;
  const sameWeekAligned = !!canonicalPeriod && EIA_SERIES.every((cfg) => {
    const s = history.series[cfg.key];
    const pts = s && s.points;
    return s && s.sourceStatus === 'live' && Array.isArray(pts) && pts.length && pts[pts.length - 1].period === canonicalPeriod;
  });
  const physical = sameWeekAligned
    ? classifyAt(history, canonicalPeriod)
    : { period: canonicalPeriod, bias: 'insufficient_data', signals: {} };

  const brentChangePct4w = brentChange4wFromHistory();
  const curveSlopeRegime = (!reuse._radarMissing && reuse.curve) ? reuse.curve.slopeRegime : null;
  const crackChange4w = (!reuse._radarMissing && reuse.crackSpread) ? reuse.crackSpread.change4w : null;
  const reconcile = finalizeBias(physical, { changePct4w: brentChangePct4w, curveSlopeRegime });

  const insufficient = reconcile.finalBias === 'insufficient_data';
  const dataSufficiency = insufficient ? 'insufficient' : (liveCount === EIA_SERIES.length ? 'full' : 'partial');

  // signals carry the physical chain + the low-confidence price context (display-only).
  // Insufficient data -> null signals (honest "暂不判断"), finalBias 'insufficient_data'.
  const signals = insufficient ? null : {
    ...physical.signals,
    priceContext: {
      brentChangePct4w,
      curveSlopeRegime,
      crackChange4w,
      priceDirectionSource: brentChangePct4w === null ? 'unavailable' : 'radar-history-full:brent~4w',
    },
  };

  const interpretation = {
    physicalBias: reconcile.physicalBias,
    finalBias: reconcile.finalBias,
    divergence: reconcile.divergence,
    priceVsPhysical: reconcile.priceVsPhysical,
    drivers: reconcile.drivers,
    confidence: 'low',
    dataSufficiency,
    note: 'physical-chain verdict; price-divergence overlay is a low-confidence confirm. Audit-only/display-only, NOT in scoring/decision.',
  };

  const out = {
    schemaVersion: SCHEMA_VERSION,
    module: 'oil-directional-pressure',
    boundary:
      'audit-only/display-only; NOT in values/scoring/decisionModel/executionLock/positionGuidance; Global Risk Heatmap independent',
    builtAt,
    ingestion: { mode: 'A', provider: 'EIA API v2', route: '/v2/seriesid/PET.<id>.W' },
    evidence,
    seasonality,
    // PR3 — physical classifier + price-divergence overlay (display-only).
    signals,
    finalBias: reconcile.finalBias,
    interpretation,
  };

  mkdirSync('data', { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`[odp] wrote ${OUT_PATH} — ${liveCount}/${EIA_SERIES.length} EIA series live; ` +
    `finalBias=${reconcile.finalBias} (physical=${reconcile.physicalBias}, divergence=${reconcile.divergence}, ` +
    `brent4w=${brentChangePct4w == null ? 'n/a' : brentChangePct4w + '%'}); builtAt ${builtAt}`);
}

main().catch((e) => {
  console.error('[odp] build failed:', e && e.message ? e.message : e);
  process.exit(1);
});
