#!/usr/bin/env node
// ODP PR2 — historical EIA cache builder (zero-dependency).
//
// Fetches the full weekly history of the 8 WPSR physical series via the EIA API
// v2 legacy route /v2/seriesid/PET.<id>.W, slices to >= RANGE_START, and writes
// data/oil-directional-history.json. This committed snapshot lets the backtest
// harness (check:oil-directional-backtest) replay OFFLINE and reproducibly —
// check:all never hits the network.
//
// ADR-0013: writes data/ -> zero-dependency (Node built-ins only; no devDeps).
// EIA key via process.env.EIA_API_KEY (trimmed). Short fetch timeout + fail-closed:
// a failed series is stored with sourceStatus 'missing' and no points (never fabricated).
//
// RANGE_START = 2014-01-01: the 2020 backtest window needs 5-year same-week
// baselines (2015-2019) plus a 13-week lookback, so history must reach back well
// before 2020. 2014 leaves a safety buffer.

import { writeFileSync, mkdirSync } from 'node:fs';

const OUT_PATH = 'data/oil-directional-history.json';
const EIA_BASE = 'https://api.eia.gov/v2/seriesid';
const RANGE_START = '2014-01-01';
const EIA_API_KEY = (process.env.EIA_API_KEY || '').trim();
const EIA_FETCH_TIMEOUT_MS = Number(process.env.EIA_FETCH_TIMEOUT_MS) || 20000;

const EIA_SERIES = [
  { key: 'crudeStocksExSpr',         id: 'WCESTUS1', unit: 'thousand barrels' },
  { key: 'sprStocks',                id: 'WCSSTUS1', unit: 'thousand barrels' },
  { key: 'distillateStocks',         id: 'WDISTUS1', unit: 'thousand barrels' },
  { key: 'gasolineStocks',           id: 'WGTSTUS1', unit: 'thousand barrels' },
  { key: 'refineryUtilization',      id: 'WPULEUS3', unit: 'percent' },
  { key: 'refinerCrudeInputs',       id: 'WCRRIUS2', unit: 'thousand barrels per day' },
  { key: 'demandGasolineSupplied',   id: 'WGFUPUS2', unit: 'thousand barrels per day' },
  { key: 'demandDistillateSupplied', id: 'WDIUPUS2', unit: 'thousand barrels per day' },
];

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
    return { ok: true, series };
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, reason: 'timeout' };
    if (e instanceof SyntaxError) return { ok: false, reason: 'non_json' };
    return { ok: false, reason: 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!EIA_API_KEY) {
    console.error('[odp-history] FATAL: EIA_API_KEY not set — aborting (fail-closed, no fabrication).');
    process.exit(1);
  }
  const builtAt = new Date().toISOString();
  const series = {};
  let okCount = 0;
  let totalPoints = 0;

  for (const cfg of EIA_SERIES) {
    const fetched = await fetchEiaSeries(cfg.id);
    if (!fetched.ok) {
      series[cfg.key] = {
        id: `PET.${cfg.id}.W`, unit: cfg.unit, source: `EIA:api-v2:seriesid:PET.${cfg.id}.W`,
        sourceStatus: 'missing', fetchReason: fetched.reason, count: 0, firstPeriod: null, lastPeriod: null, points: [],
      };
      console.log(`[odp-history] ${cfg.key.padEnd(24)} PET.${cfg.id}.W MISSING (${fetched.reason})`);
      continue;
    }
    const points = fetched.series.filter((p) => p.period >= RANGE_START);
    series[cfg.key] = {
      id: `PET.${cfg.id}.W`, unit: cfg.unit, source: `EIA:api-v2:seriesid:PET.${cfg.id}.W`,
      sourceStatus: 'live', count: points.length,
      firstPeriod: points.length ? points[0].period : null,
      lastPeriod: points.length ? points[points.length - 1].period : null,
      points,
    };
    okCount++;
    totalPoints += points.length;
    console.log(`[odp-history] ${cfg.key.padEnd(24)} PET.${cfg.id}.W live ${points.length} pts ${points[0]?.period}..${points[points.length - 1]?.period}`);
  }

  const out = {
    schemaVersion: 'odp-history-1',
    module: 'oil-directional-pressure-history',
    boundary: 'audit-only; EIA public-domain weekly physical history for backtest replay only; not scoring/decision/values',
    builtAt,
    rangeStart: RANGE_START,
    series,
  };

  mkdirSync('data', { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`[odp-history] wrote ${OUT_PATH} — ${okCount}/${EIA_SERIES.length} series live, ${totalPoints} total points, range ${RANGE_START}..present`);
}

main().catch((e) => {
  console.error('[odp-history] build failed:', e && e.message ? e.message : e);
  process.exit(1);
});
