#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'manual-artifacts/main-score-audit/main-score-backtest-latest.json';
const DEFAULT_START_DATE = '2006-01-01';
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_CSV_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const FRED_API_KEY = (process.env.FRED_API_KEY || '').trim();
const FETCH_TIMEOUT_MS = Number(process.env.MAIN_SCORE_BACKTEST_FETCH_TIMEOUT_MS) || 30000;
const SOURCE_POLICY_PATH = path.resolve('config', 'main-score-source-policy.json');

const SERIES = {
  brent: 'DCOILBRENTEU',
  dxy: 'DTWEXBGS',
  vix: 'VIXCLS',
  hyOas: 'BAMLH0A0HYM2',
  us10y: 'DGS10',
  real10y: 'DFII10',
  breakeven10y: 'T10YIE',
  spx: 'SP500',
  walcl: 'WALCL',
  onRrp: 'RRPONTSYD',
  t10y2y: 'T10Y2Y',
  igOas: 'BAMLC0A0CM',
  baa10y: 'BAA10Y'
};

const EVENT_WINDOWS = [
  { key: 'gfc_2008', label: '2008 Global Financial Crisis', start: '2008-09-15', end: '2009-03-09', expected: 'high_stress', minMaxScore: 75 },
  { key: 'euro_2011', label: '2011 Euro / US debt stress', start: '2011-08-01', end: '2011-10-31', expected: 'elevated', minMaxScore: 55 },
  { key: 'covid_2020', label: '2020 COVID liquidity shock', start: '2020-02-20', end: '2020-04-30', expected: 'high_stress', minMaxScore: 75 },
  { key: 'inflation_2022', label: '2022 inflation / rates shock', start: '2022-06-01', end: '2022-10-31', expected: 'elevated', minMaxScore: 65 },
  { key: 'banking_2023', label: '2023 regional-bank stress', start: '2023-03-08', end: '2023-05-15', expected: 'watch', minMaxScore: 50 },
  { key: 'calm_2017', label: '2017 low-volatility expansion', start: '2017-01-01', end: '2017-12-31', expected: 'calm', maxAvgScore: 45 }
];

const rules = JSON.parse(fs.readFileSync(path.resolve('config', 'rules.json'), 'utf8'));
const mainScoreSourcePolicy = JSON.parse(fs.readFileSync(SOURCE_POLICY_PATH, 'utf8'));

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    output: DEFAULT_OUTPUT,
    startDate: DEFAULT_START_DATE,
    endDate: new Date().toISOString().slice(0, 10),
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`${name} must be YYYY-MM-DD.`);
  }
  if (options.startDate > options.endDate) throw new Error('--start-date must be on or before --end-date.');
  return options;
}

function resolveOutputPath(outputPath) {
  const root = process.cwd();
  const allowedRoot = path.resolve(root, 'manual-artifacts', 'main-score-audit');
  const resolved = path.resolve(root, outputPath);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Main-score audit output must stay under manual-artifacts/main-score-audit.');
  }
  return resolved;
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

function makeWeeklyDates(startDate, endDate) {
  const out = [];
  let currentMs = dateToMs(startDate);
  const endMs = dateToMs(endDate);
  while (currentMs <= endMs) {
    out.push(msToDate(currentMs));
    currentMs += 7 * 24 * 3600 * 1000;
  }
  return out;
}

function parseFredApiObservations(payload) {
  const observations = Array.isArray(payload?.observations) ? payload.observations : [];
  return observations
    .map((item) => ({ date: item?.date, value: Number(item?.value) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) && Number.isFinite(row.value));
}

function parseFredCsv(text) {
  return String(text || '')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, rawValue] = line.split(',');
      const value = Number(rawValue);
      return { date, value };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) && Number.isFinite(row.value));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'gfrr-main-score-backtest/1.0' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function fetchFredSeries(seriesId, options) {
  const errors = [];
  if (options.preferFredApi && FRED_API_KEY) {
    try {
      const params = new URLSearchParams({
        series_id: seriesId,
        api_key: FRED_API_KEY,
        file_type: 'json',
        observation_start: options.startDate,
        observation_end: options.endDate,
        sort_order: 'asc'
      });
      return {
        rows: parseFredApiObservations(await fetchJson(`${FRED_API_BASE}?${params.toString()}`)),
        fetchMode: 'fred_api'
      };
    } catch (error) {
      errors.push(`api:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    const params = new URLSearchParams({ id: seriesId });
    const rows = parseFredCsv(await fetchText(`${FRED_CSV_BASE}?${params.toString()}`))
      .filter((row) => row.date >= options.startDate && row.date <= options.endDate);
    return { rows, fetchMode: 'fred_csv', apiErrors: errors };
  } catch (error) {
    errors.push(`csv:${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`FRED ${seriesId} fetch failed: ${errors.join('; ')}`);
  }
}

function latestOnOrBefore(rows, date) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let left = 0;
  let right = rows.length - 1;
  let found = null;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (rows[mid].date <= date) {
      found = rows[mid];
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return found;
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function normalizedCalibrationPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map((point) => ({ value: Number(point?.value), risk: Number(point?.risk), label: point?.label || null }))
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.risk))
    .sort((a, b) => a.value - b.value);
}

function riskFromCalibration(value, calibration, fallbackBase, fallbackScale) {
  const fallbackRisk = clamp((value - fallbackBase) * fallbackScale);
  const points = normalizedCalibrationPoints(calibration?.points);
  if (!Number.isFinite(value) || points.length < 2) return fallbackRisk;
  if (value <= points[0].value) return clamp(points[0].risk);
  if (value >= points[points.length - 1].value) return clamp(points[points.length - 1].risk);
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (value >= left.value && value <= right.value) {
      const span = right.value - left.value;
      const pct = span > 0 ? (value - left.value) / span : 0;
      return clamp(left.risk + (right.risk - left.risk) * pct);
    }
  }
  return fallbackRisk;
}

function weightedAvg(entries) {
  let weightSum = 0;
  let valueSum = 0;
  for (const [value, weight] of entries) {
    if (Number.isFinite(value) && Number.isFinite(weight)) {
      weightSum += weight;
      valueSum += value * weight;
    }
  }
  return weightSum > 0 ? valueSum / weightSum : null;
}

function buildTailRiskOverlay(inputs) {
  const reasons = [];
  let floor = null;
  const add = (candidateFloor, key) => {
    floor = Math.max(floor ?? 0, candidateFloor);
    reasons.push(key);
  };
  if (inputs.vixRisk >= 95 && inputs.hyRisk >= 55) add(82, 'systemic_liquidity_credit_shock');
  else if (inputs.vixRisk >= 85 && (inputs.hyRisk >= 45 || inputs.baseLiquidity >= 65 || inputs.bankingRisk >= 65)) add(72, 'systemic_liquidity_credit_watch');
  if (inputs.oilRisk >= 85 && inputs.inflationRisk >= 60 && (inputs.vixRisk >= 45 || inputs.rateRisk >= 40 || inputs.dollarRisk >= 65)) add(68, 'energy_inflation_tail');
  if ((inputs.curveInversionRisk ?? 0) >= 60 && inputs.vixRisk >= 70 && (inputs.bankingRisk >= 35 || (inputs.nimPressureRisk ?? 0) >= 70)) add(66, 'banking_curve_stress');
  const baseScore = clamp(inputs.baseScore);
  const overlayFloor = Number.isFinite(floor) ? clamp(floor) : null;
  const adjustedScore = overlayFloor === null ? baseScore : clamp(Math.max(baseScore, overlayFloor));
  return { applied: adjustedScore > baseScore, floor: overlayFloor, adjustedScore, scoreAdd: adjustedScore - baseScore, reasons };
}

function buildValuesForDate(date, seriesRows) {
  return Object.fromEntries(Object.keys(SERIES).map((key) => [key, latestOnOrBefore(seriesRows[key], date)?.value ?? null]));
}

function deriveRiskForDate(date, seriesRows, valueOverrides = null) {
  const values = buildValuesForDate(date, seriesRows);
  if (valueOverrides && typeof valueOverrides === 'object') {
    for (const [key, value] of Object.entries(valueOverrides)) {
      if (Object.hasOwn(values, key) && Number.isFinite(value)) values[key] = value;
    }
  }
  const rb = rules.riskBaselines;
  const creditSpread = Number.isFinite(values.hyOas) ? values.hyOas : values.baa10y;
  for (const key of ['brent', 'dxy', 'vix', 'us10y', 'real10y']) {
    if (!Number.isFinite(values[key])) return null;
  }
  if (!Number.isFinite(creditSpread)) return null;
  const brent = values.brent;
  const dxy = values.dxy;
  const vix = values.vix;
  const hy = creditSpread;
  const creditProxyUsed = !Number.isFinite(values.hyOas) && Number.isFinite(values.baa10y);
  const us10y = values.us10y;
  const real10y = values.real10y;
  const breakeven = Number.isFinite(values.breakeven10y) ? values.breakeven10y : rules.defaults.breakeven10y;
  const spx = Number.isFinite(values.spx) ? values.spx : rules.defaults.spx;

  const oilRisk = clamp((brent - rb.brentBase) * rb.brentScale);
  const dollarRisk = riskFromCalibration(dxy, rules.riskCalibrations?.dxyBroadDollar, rb.dxyBase, rb.dxyScale);
  const hyRisk = clamp((hy - rb.hyBase) * rb.hyScale);
  const vixRisk = clamp((vix - rb.vixBase) * rb.vixScale);
  const rateRisk = clamp((us10y - rb.us10yBase) * rb.us10yScale);
  const realRisk = clamp((real10y - rb.real10yBase) * rb.real10yScale);
  const inflationRisk = clamp((breakeven - rb.breakevenBase) * rb.breakevenScale + oilRisk * rb.oilInflationWeight);
  const spxRisk = clamp((5300 - spx) / 6);
  const baseLiquidity = clamp((dollarRisk * 0.35) + (hyRisk * 0.35) + (vixRisk * 0.18) + (rateRisk * 0.12));
  const baseDebt = clamp((realRisk * 0.45) + (rateRisk * 0.3) + (hyRisk * 0.25));
  const baseBanking = clamp((hyRisk * 0.55) + (vixRisk * 0.2) + (dollarRisk * 0.25));

  const walcl = values.walcl;
  const walclAgo = latestOnOrBefore(seriesRows.walcl, addDays(date, -28))?.value ?? null;
  const walcl4wChange = pctChange(walcl, walclAgo);
  const onRrp = values.onRrp;
  const t10y2y = values.t10y2y;
  const igOas = values.igOas;
  const baa10y = values.baa10y;
  let fedAssetRisk = Number.isFinite(walcl4wChange) ? clamp((-walcl4wChange) * 18) : null;
  let onRrpRisk = null;
  const fedCfg = rules.macroDrivers.fedLiquidity;
  if (Number.isFinite(onRrp)) {
    if (onRrp < fedCfg.onRrpCriticalThreshold) onRrpRisk = 85;
    else if (onRrp < fedCfg.onRrpTightThreshold) onRrpRisk = 55;
    else onRrpRisk = 15;
  }
  const curveInversionRisk = Number.isFinite(t10y2y) ? (t10y2y < 0 ? clamp(Math.abs(t10y2y) * 80) : 10) : null;
  const curveSteepeningRisk = null;
  let igOasRisk = null;
  const creditCfg = rules.macroDrivers.credit;
  if (Number.isFinite(igOas)) {
    if (igOas >= creditCfg.igOasCriticalThreshold) igOasRisk = 90;
    else if (igOas >= creditCfg.igOasStressThreshold) igOasRisk = 70;
    else if (igOas >= creditCfg.igOasWatchThreshold) igOasRisk = 45;
    else igOasRisk = 20;
  } else if (Number.isFinite(baa10y)) {
    if (baa10y >= 3.0) igOasRisk = 90;
    else if (baa10y >= 2.5) igOasRisk = 70;
    else if (baa10y >= 2.0) igOasRisk = 45;
    else igOasRisk = 20;
  }
  const nimPressureRisk = Number.isFinite(t10y2y) ? (t10y2y < -0.5 ? 75 : t10y2y < 0 ? 50 : 20) : null;
  let reservePressure = null;
  if (Number.isFinite(onRrp)) {
    reservePressure = onRrp < fedCfg.onRrpCriticalThreshold ? 85 : onRrp < fedCfg.onRrpTightThreshold ? 50 : 15;
  }

  const sw = rules.moduleSubWeights;
  const liquidity = clamp(weightedAvg([[baseLiquidity, sw.liquidity.baseWeight], [fedAssetRisk, sw.liquidity.fedAssetWeight], [onRrpRisk, sw.liquidity.onRrpWeight]]) ?? baseLiquidity);
  const debt = clamp(weightedAvg([[baseDebt, sw.debt.baseWeight], [curveInversionRisk, sw.debt.curveInversionWeight], [curveSteepeningRisk, sw.debt.curveSteepeningWeight]]) ?? baseDebt);
  const banking = clamp(weightedAvg([[baseBanking, sw.banking.baseWeight], [igOasRisk, sw.banking.igOasWeight], [nimPressureRisk, sw.banking.nimPressureWeight], [reservePressure, sw.banking.reservePressureWeight]]) ?? baseBanking);
  const modules = {
    geopolitical: clamp((oilRisk * 0.72) + (vixRisk * 0.28)),
    energy: clamp(oilRisk * 0.82),
    inflation: clamp((inflationRisk * 0.72) + (realRisk * 0.08)),
    liquidity,
    debt,
    banking
  };
  const mw = rules.moduleWeights;
  const baseScore = clamp(modules.geopolitical * mw.geopolitical + modules.energy * mw.energy + modules.inflation * mw.inflation + modules.liquidity * mw.liquidity + modules.debt * mw.debt + modules.banking * mw.banking);
  const overlay = buildTailRiskOverlay({ baseScore, oilRisk, inflationRisk, vixRisk, hyRisk, rateRisk, dollarRisk, baseLiquidity, bankingRisk: banking, curveInversionRisk, nimPressureRisk });

  return {
    date,
    score: overlay.adjustedScore,
    baseScore,
    overlayApplied: overlay.applied,
    overlayFloor: overlay.floor,
    overlayReasons: overlay.reasons,
    modules,
    inputs: { brent, dxy, vix, hyOas: hy, creditProxyUsed, us10y, real10y, breakeven10y: breakeven, spx },
    components: { oilRisk, dollarRisk, hyRisk, vixRisk, rateRisk, realRisk, inflationRisk, spxRisk, fedAssetRisk, onRrpRisk, curveInversionRisk, igOasRisk, nimPressureRisk, reservePressure }
  };
}

function percentile(values, pct) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((pct / 100) * (sorted.length - 1))));
  return sorted[index];
}

function summarizeRows(rows) {
  if (!rows.length) return { observations: 0, min: null, avg: null, max: null, p50: null, p75: null, p90: null, overlayAppliedPct: 0 };
  const scores = rows.map((row) => row.score).filter(Number.isFinite);
  return {
    observations: rows.length,
    min: round(Math.min(...scores), 2),
    avg: round(scores.reduce((sum, value) => sum + value, 0) / scores.length, 2),
    max: round(Math.max(...scores), 2),
    p50: round(percentile(scores, 50), 2),
    p75: round(percentile(scores, 75), 2),
    p90: round(percentile(scores, 90), 2),
    overlayAppliedPct: round(rows.filter((row) => row.overlayApplied).length / rows.length * 100, 2)
  };
}

function summarizeEvent(rows, event) {
  const subset = rows.filter((row) => row.date >= event.start && row.date <= event.end);
  const summary = summarizeRows(subset);
  let pass = true;
  let rule = null;
  if (Number.isFinite(event.minMaxScore)) {
    pass = Number.isFinite(summary.max) && summary.max >= event.minMaxScore;
    rule = `max >= ${event.minMaxScore}`;
  }
  if (Number.isFinite(event.maxAvgScore)) {
    pass = Number.isFinite(summary.avg) && summary.avg <= event.maxAvgScore;
    rule = `avg <= ${event.maxAvgScore}`;
  }
  return { ...event, rule, pass, ...summary };
}

function adjustByPct(value, pct) {
  if (!Number.isFinite(value) || !Number.isFinite(pct)) return null;
  return value * (1 + pct / 100);
}

function adjustByAbs(value, delta) {
  if (!Number.isFinite(value) || !Number.isFinite(delta)) return null;
  return value + delta;
}

function boundedPolicyValue(key, value) {
  const policyKey = key === 'baa10y' ? 'hyOas' : key;
  const range = mainScoreSourcePolicy.windPaidFallback?.plausibilityRanges?.[policyKey];
  if (!Number.isFinite(value)) return null;
  if (range) {
    if (Number.isFinite(range.min) && value < range.min) return range.min;
    if (Number.isFinite(range.max) && value > range.max) return range.max;
  }
  return value;
}

function buildWindScenarioOverrides(values, scenario) {
  const adjustments = scenario?.adjustments && typeof scenario.adjustments === 'object' ? scenario.adjustments : {};
  const overrides = {};
  const pctFields = [
    ['brentPct', 'brent'],
    ['dxyPct', 'dxy'],
    ['vixPct', 'vix'],
    ['spxPct', 'spx']
  ];
  for (const [adjustmentKey, valueKey] of pctFields) {
    if (Number.isFinite(adjustments[adjustmentKey])) {
      const adjusted = boundedPolicyValue(valueKey, adjustByPct(values[valueKey], adjustments[adjustmentKey]));
      if (Number.isFinite(adjusted)) overrides[valueKey] = adjusted;
    }
  }
  const absFields = [
    ['us10yAbsPctPoint', 'us10y'],
    ['real10yAbsPctPoint', 'real10y'],
    ['breakeven10yAbsPctPoint', 'breakeven10y']
  ];
  for (const [adjustmentKey, valueKey] of absFields) {
    if (Number.isFinite(adjustments[adjustmentKey])) {
      const adjusted = boundedPolicyValue(valueKey, adjustByAbs(values[valueKey], adjustments[adjustmentKey]));
      if (Number.isFinite(adjusted)) overrides[valueKey] = adjusted;
    }
  }
  if (Number.isFinite(adjustments.hyOasAbsPctPoint)) {
    const creditKey = Number.isFinite(values.hyOas) ? 'hyOas' : 'baa10y';
    const adjusted = boundedPolicyValue(creditKey, adjustByAbs(values[creditKey], adjustments.hyOasAbsPctPoint));
    if (Number.isFinite(adjusted)) overrides[creditKey] = adjusted;
  }
  return overrides;
}

function scoreTier(score) {
  if (!Number.isFinite(score)) return 'unknown';
  const boundaries = mainScoreSourcePolicy.replayValidation?.scoreTierBoundaries || {};
  const normalMax = Number.isFinite(boundaries.normalMaxExclusive) ? boundaries.normalMaxExclusive : 55;
  const watchMax = Number.isFinite(boundaries.watchMaxExclusive) ? boundaries.watchMaxExclusive : 65;
  const yellowMax = Number.isFinite(boundaries.yellowMaxExclusive) ? boundaries.yellowMaxExclusive : 82;
  if (score < normalMax) return 'normal';
  if (score < watchMax) return 'watch';
  if (score < yellowMax) return 'yellow';
  return 'red';
}

function scoreTierRank(tier) {
  return { unknown: -1, normal: 0, watch: 1, yellow: 2, red: 3 }[tier] ?? -1;
}

function windAutomaticSwitchGuardReasons(baseRow, stressedRow) {
  const guard = mainScoreSourcePolicy.windPaidFallback?.scoreImpactGuards || {};
  const reasons = [];
  const delta = stressedRow.score - baseRow.score;
  const maxDelta = guard.maxAutomaticScoreDeltaWithoutReview;
  if (Number.isFinite(maxDelta) && Math.abs(delta) > maxDelta) reasons.push('score_delta_review_required');
  const maxTierJump = guard.maxAutomaticTierJumpWithoutReview;
  const baseTier = scoreTier(baseRow.score);
  const stressedTier = scoreTier(stressedRow.score);
  const tierJump = Math.abs(scoreTierRank(stressedTier) - scoreTierRank(baseTier));
  if (Number.isFinite(maxTierJump) && tierJump > maxTierJump) reasons.push('tier_jump_review_required');
  const downgradeFrom = guard.riskTierDowngradeRequiresConfirmationFrom;
  if (typeof downgradeFrom === 'string' && scoreTierRank(baseTier) >= scoreTierRank(downgradeFrom) && scoreTierRank(stressedTier) < scoreTierRank(baseTier)) {
    reasons.push('risk_tier_downgrade_requires_confirmation');
  }
  if (guard.tailOverlaySwitchRequiresConfirmation === true && baseRow.overlayApplied !== stressedRow.overlayApplied) {
    reasons.push('tail_overlay_switch_requires_confirmation');
  }
  return reasons;
}

function summarizeWindScenario(baseRows, stressedRows, scenario) {
  const byDate = new Map(stressedRows.map((row) => [row.date, row]));
  const deltas = [];
  const absDeltas = [];
  const rawDeltas = [];
  const rawAbsDeltas = [];
  let tierFlips = 0;
  let rawTierFlips = 0;
  const largestDeltas = [];
  const largestRawDeltas = [];
  const automaticRows = [];
  const guardedSwitches = [];
  for (const baseRow of baseRows) {
    const stressed = byDate.get(baseRow.date);
    if (!stressed) continue;
    const rawDelta = stressed.score - baseRow.score;
    rawDeltas.push(rawDelta);
    rawAbsDeltas.push(Math.abs(rawDelta));
    if (scoreTier(baseRow.score) !== scoreTier(stressed.score)) rawTierFlips += 1;
    largestRawDeltas.push({
      date: baseRow.date,
      baselineScore: baseRow.score,
      stressedScore: stressed.score,
      delta: rawDelta,
      baselineTier: scoreTier(baseRow.score),
      stressedTier: scoreTier(stressed.score)
    });
    const guardReasons = windAutomaticSwitchGuardReasons(baseRow, stressed);
    const automaticRow = guardReasons.length ? baseRow : stressed;
    automaticRows.push(automaticRow);
    if (guardReasons.length) {
      guardedSwitches.push({
        date: baseRow.date,
        reasons: guardReasons,
        baselineScore: baseRow.score,
        stressedScore: stressed.score,
        rawDelta
      });
    }
    const delta = automaticRow.score - baseRow.score;
    deltas.push(delta);
    absDeltas.push(Math.abs(delta));
    if (scoreTier(baseRow.score) !== scoreTier(automaticRow.score)) tierFlips += 1;
    largestDeltas.push({
      date: baseRow.date,
      baselineScore: baseRow.score,
      stressedScore: automaticRow.score,
      delta,
      baselineTier: scoreTier(baseRow.score),
      stressedTier: scoreTier(automaticRow.score)
    });
  }
  largestDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  largestRawDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const calmEvent = EVENT_WINDOWS.find((event) => event.key === 'calm_2017');
  const calmRows = calmEvent
    ? baseRows.filter((row) => row.date >= calmEvent.start && row.date <= calmEvent.end)
    : [];
  const calmAbsDeltas = calmRows
    .map((baseRow) => {
      const automatic = automaticRows.find((row) => row.date === baseRow.date);
      return automatic ? Math.abs(automatic.score - baseRow.score) : null;
    })
    .filter(Number.isFinite);
  const eventSummaries = EVENT_WINDOWS.map((event) => summarizeEvent(automaticRows, event));
  const rawEventSummaries = EVENT_WINDOWS.map((event) => summarizeEvent(stressedRows, event));
  const failedEvents = eventSummaries.filter((event) => !event.pass).map((event) => event.key);
  const rawFailedEvents = rawEventSummaries.filter((event) => !event.pass).map((event) => event.key);
  const observations = deltas.length;
  return {
    key: scenario.key,
    description: scenario.description,
    adjustments: scenario.adjustments,
    observations,
    avgScoreDelta: round(observations ? deltas.reduce((sum, value) => sum + value, 0) / observations : null, 2),
    p95AbsScoreDelta: round(percentile(absDeltas, 95), 2),
    maxAbsScoreDelta: round(absDeltas.length ? Math.max(...absDeltas) : null, 2),
    tierFlipPct: round(observations ? tierFlips / observations * 100 : null, 2),
    calmWindowAvgAbsDelta: round(calmAbsDeltas.length ? calmAbsDeltas.reduce((sum, value) => sum + value, 0) / calmAbsDeltas.length : null, 2),
    guardedSwitchPct: round(observations ? guardedSwitches.length / observations * 100 : null, 2),
    guardedSwitches: guardedSwitches.slice(0, 20).map((row) => ({
      ...row,
      rawDelta: round(row.rawDelta, 2)
    })),
    rawConflictStress: {
      avgScoreDelta: round(observations ? rawDeltas.reduce((sum, value) => sum + value, 0) / observations : null, 2),
      p95AbsScoreDelta: round(percentile(rawAbsDeltas, 95), 2),
      maxAbsScoreDelta: round(rawAbsDeltas.length ? Math.max(...rawAbsDeltas) : null, 2),
      tierFlipPct: round(observations ? rawTierFlips / observations * 100 : null, 2),
      failedEvents: rawFailedEvents,
      largestDeltas: largestRawDeltas.slice(0, 10).map((row) => ({
        ...row,
        delta: round(row.delta, 2)
      }))
    },
    failedEvents,
    events: eventSummaries,
    largestDeltas: largestDeltas.slice(0, 10).map((row) => ({
      ...row,
      delta: round(row.delta, 2)
    }))
  };
}

function evaluateWindScenario(summary, thresholds, eventWindowsMustPass) {
  const failures = [];
  if (!summary.observations) failures.push(`${summary.key}:no_observations`);
  if (eventWindowsMustPass && summary.failedEvents.length) {
    failures.push(`${summary.key}:event_windows_failed:${summary.failedEvents.join(',')}`);
  }
  if (Number.isFinite(thresholds.p95AbsScoreDeltaMax) && summary.p95AbsScoreDelta > thresholds.p95AbsScoreDeltaMax) {
    failures.push(`${summary.key}:p95_abs_delta>${thresholds.p95AbsScoreDeltaMax}`);
  }
  if (Number.isFinite(thresholds.maxAbsScoreDeltaMax) && summary.maxAbsScoreDelta > thresholds.maxAbsScoreDeltaMax) {
    failures.push(`${summary.key}:max_abs_delta>${thresholds.maxAbsScoreDeltaMax}`);
  }
  if (Number.isFinite(thresholds.tierFlipPctMax) && summary.tierFlipPct > thresholds.tierFlipPctMax) {
    failures.push(`${summary.key}:tier_flip_pct>${thresholds.tierFlipPctMax}`);
  }
  if (Number.isFinite(thresholds.calmWindowAvgAbsDeltaMax) && summary.calmWindowAvgAbsDelta > thresholds.calmWindowAvgAbsDeltaMax) {
    failures.push(`${summary.key}:calm_avg_abs_delta>${thresholds.calmWindowAvgAbsDeltaMax}`);
  }
  if (Number.isFinite(thresholds.guardedSwitchPctMax) && summary.guardedSwitchPct > thresholds.guardedSwitchPctMax) {
    failures.push(`${summary.key}:guarded_switch_pct>${thresholds.guardedSwitchPctMax}`);
  }
  return failures;
}

function buildWindFallbackPolicyReplay(baseRows, seriesRows) {
  const replayCfg = mainScoreSourcePolicy.replayValidation || {};
  const thresholds = replayCfg.passThresholds || {};
  const eventWindowsMustPass = replayCfg.eventWindowsMustPass !== false;
  const scenarios = Array.isArray(replayCfg.stressScenarios) ? replayCfg.stressScenarios : [];
  const scenarioReports = scenarios.map((scenario) => {
    const stressedRows = baseRows
      .map((baseRow) => {
        const values = buildValuesForDate(baseRow.date, seriesRows);
        const overrides = buildWindScenarioOverrides(values, scenario);
        return deriveRiskForDate(baseRow.date, seriesRows, overrides);
      })
      .filter(Boolean);
    const summary = summarizeWindScenario(baseRows, stressedRows, scenario);
    return {
      ...summary,
      pass: evaluateWindScenario(summary, thresholds, eventWindowsMustPass).length === 0
    };
  });
  const failures = scenarioReports.flatMap((summary) => evaluateWindScenario(summary, thresholds, eventWindowsMustPass));
  return {
    contractVersion: mainScoreSourcePolicy.contractVersion,
    method: replayCfg.method || 'wind_fallback_conflict_replay_v1',
    currentState: mainScoreSourcePolicy.runtimeBoundary?.currentState || null,
    participatesInMainScore: mainScoreSourcePolicy.windPaidFallback?.participatesInMainScore === true,
    eligibleInputs: mainScoreSourcePolicy.windPaidFallback?.eligibleInputs || [],
    sourceConflictArbitration: {
      sourcePriority: mainScoreSourcePolicy.windPaidFallback?.sourcePriority || [],
      activationRules: mainScoreSourcePolicy.windPaidFallback?.activationRules || [],
      freshnessHours: mainScoreSourcePolicy.windPaidFallback?.freshnessHours || {},
      plausibilityRanges: mainScoreSourcePolicy.windPaidFallback?.plausibilityRanges || {},
      conflictTolerances: mainScoreSourcePolicy.windPaidFallback?.conflictTolerances || {}
    },
    passThresholds: thresholds,
    eventWindowsMustPass,
    pass: failures.length === 0,
    failures,
    scenarios: scenarioReports
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.allowNetwork) throw new Error('Refusing network access. Re-run with --allow-network.');
  const outputPath = resolveOutputPath(options.output);

  const seriesRows = {};
  const seriesStatus = {};
  for (const [key, seriesId] of Object.entries(SERIES)) {
    const result = await fetchFredSeries(seriesId, options);
    seriesRows[key] = result.rows;
    seriesStatus[key] = {
      seriesId,
      fetchMode: result.fetchMode,
      observations: result.rows.length,
      firstDate: result.rows[0]?.date ?? null,
      lastDate: result.rows[result.rows.length - 1]?.date ?? null,
      apiErrors: result.apiErrors || []
    };
  }

  const rows = makeWeeklyDates(options.startDate, options.endDate)
    .map((date) => deriveRiskForDate(date, seriesRows))
    .filter(Boolean);
  const events = EVENT_WINDOWS.map((event) => summarizeEvent(rows, event));
  const failedEvents = events.filter((event) => !event.pass);
  const windFallbackPolicy = buildWindFallbackPolicyReplay(rows, seriesRows);
  const report = {
    generatedAt: new Date().toISOString(),
    options,
    verdict: failedEvents.length || !windFallbackPolicy.pass ? 'needs_review' : 'pass_with_limitations',
    limitations: [
      'Backtest uses FRED historical series only; intraday Brent public-consensus promotion cannot be replayed before this implementation.',
      'HY/IG OAS exact FRED API coverage may be short in this environment; BAA10Y is used as a long-history credit-spread proxy only for this audit when exact OAS rows are unavailable.',
      'This audit tests score logic and historical regime behavior; it does not prove investable timing by itself.',
      'Wind fallback replay is a deterministic conflict-stress simulation over public historical data; it does not call Wind and does not assert Wind data accuracy.',
      'Raw Wind/public conflict stress is reported separately; automatic score switching is evaluated after score-impact guards reject large source-switch jumps for review or independent confirmation.'
    ],
    formula: {
      dxyCalibration: rules.riskCalibrations?.dxyBroadDollar || null,
      tailRiskOverlay: 'conditional_tail_floor_v1'
    },
    sourcePolicy: {
      path: path.relative(process.cwd(), SOURCE_POLICY_PATH),
      contractVersion: mainScoreSourcePolicy.contractVersion
    },
    seriesStatus,
    distribution: summarizeRows(rows),
    events,
    failedEvents: failedEvents.map((event) => event.key),
    windFallbackPolicy,
    sampleRows: rows
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[main-score-backtest] verdict=${report.verdict}`);
  console.log(`[main-score-backtest] observations=${rows.length}, p50=${report.distribution.p50}, p90=${report.distribution.p90}, max=${report.distribution.max}`);
  for (const event of events) {
    console.log(`[main-score-backtest] ${event.key}: pass=${event.pass}, avg=${event.avg}, max=${event.max}, overlay=${event.overlayAppliedPct}%`);
  }
  console.log(`[main-score-backtest] windFallbackPolicy=${windFallbackPolicy.pass ? 'pass' : 'needs_review'} scenarios=${windFallbackPolicy.scenarios.length}`);
  console.log(`[main-score-backtest] wrote ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(`[main-score-backtest] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
