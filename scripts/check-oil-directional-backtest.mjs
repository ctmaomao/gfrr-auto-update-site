// check:oil-directional-backtest — PR2 GATE (offline, over the committed history cache).
//
// (1) HISTORY-INTEGRITY gate: every series must be live, with sufficient count,
//     2014→present coverage, AND a points[] array that actually matches its metadata
//     (length/endpoints/monotonic/finite) — a blanked or truncated points[] with
//     intact metadata must NOT pass (Codex PR2 review negative case). The classifier
//     itself only flags `insufficient_data` on the 3 core stocks, so a degraded/short
//     cache must be hard-blocked HERE — it must not "legally pass" the backtest.
// (2) REGIME GATE: replay the locked physical classifier over fixed windows
//     (look-ahead-safe) and assert pre-registered regime-level criteria. No
//     cherry-picking — windows + allowed/forbidden sets are fixed in advance.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runBacktest, BULLISH_FAMILY, STRONG_OR_CRISIS, STRONG_OR_MODERATE } from './oil-directional/backtest-oil-directional.mjs';

const errors = [];
const fail = (m) => errors.push(m);

const history = JSON.parse(readFileSync(resolve('data/oil-directional-history.json'), 'utf8'));

// ---- (1) history-integrity gate ----
const REQUIRED = [
  'crudeStocksExSpr', 'sprStocks', 'distillateStocks', 'gasolineStocks',
  'refineryUtilization', 'refinerCrudeInputs', 'demandGasolineSupplied', 'demandDistillateSupplied',
];
const MIN_COUNT = 600;            // ~647 expected for 2014-present weekly
const COVER_FIRST_ON_OR_BEFORE = '2014-01-31';
const COVER_LAST_ON_OR_AFTER = '2026-05-22'; // committed snapshot's last week (tightened from 2026-01-01 per Codex PR2 review)

if (history.schemaVersion !== 'odp-history-1') fail(`history.schemaVersion must be 'odp-history-1', got '${history.schemaVersion}'`);
for (const k of REQUIRED) {
  const s = history.series && history.series[k];
  if (!s) { fail(`history.series.${k} missing`); continue; }
  if (s.sourceStatus !== 'live') fail(`history.series.${k}.sourceStatus must be 'live', got '${s.sourceStatus}' (degraded cache must not pass)`);
  if (!(Number.isFinite(s.count) && s.count >= MIN_COUNT)) fail(`history.series.${k}.count ${s.count} < ${MIN_COUNT}`);
  if (!(s.firstPeriod && s.firstPeriod <= COVER_FIRST_ON_OR_BEFORE)) fail(`history.series.${k}.firstPeriod ${s.firstPeriod} must be <= ${COVER_FIRST_ON_OR_BEFORE}`);
  if (!(s.lastPeriod && s.lastPeriod >= COVER_LAST_ON_OR_AFTER)) fail(`history.series.${k}.lastPeriod ${s.lastPeriod} must be >= ${COVER_LAST_ON_OR_AFTER}`);
  // points authenticity: the actual array must match the metadata, so a blanked /
  // truncated points[] with intact sourceStatus/count/first/last cannot pass.
  const pts = s.points;
  if (!Array.isArray(pts)) { fail(`history.series.${k}.points must be an array`); continue; }
  if (pts.length !== s.count) fail(`history.series.${k}.points.length ${pts.length} !== count ${s.count}`);
  if (pts.length > 0) {
    if (pts[0].period !== s.firstPeriod) fail(`history.series.${k}.points[0].period ${pts[0].period} !== firstPeriod ${s.firstPeriod}`);
    if (pts[pts.length - 1].period !== s.lastPeriod) fail(`history.series.${k}.points[last].period ${pts[pts.length - 1].period} !== lastPeriod ${s.lastPeriod}`);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p || typeof p.period !== 'string' || !Number.isFinite(p.value)) { fail(`history.series.${k}.points[${i}] invalid period/value`); break; }
      if (i > 0 && !(p.period > pts[i - 1].period)) { fail(`history.series.${k}.points not strictly increasing (${pts[i - 1].period} -> ${p.period})`); break; }
    }
  }
}

// ---- (1b) canonical weekly-grid alignment ----
// PR2 backtest semantics = "same physical-chain week", NOT "each series' last value
// on or before the target date". If one series is missing a week, idxAtOrBefore()
// silently uses the prior week and the GATE could still pass with a changed economic
// meaning. Pin every required series to crudeStocksExSpr's week grid.
const canonical = (history.series && history.series.crudeStocksExSpr && Array.isArray(history.series.crudeStocksExSpr.points))
  ? history.series.crudeStocksExSpr.points.map((p) => p.period)
  : null;
if (!canonical) {
  fail('canonical weekly grid unavailable: crudeStocksExSpr.points missing/invalid');
} else {
  for (const k of REQUIRED) {
    const s = history.series && history.series[k];
    if (!s || !Array.isArray(s.points)) continue; // already failed in (1)
    const periods = s.points.map((p) => p.period);
    if (periods.length !== canonical.length) {
      fail(`history.series.${k}.points.length ${periods.length} !== canonical grid length ${canonical.length} (crudeStocksExSpr)`);
      continue;
    }
    for (let i = 0; i < canonical.length; i++) {
      if (periods[i] !== canonical[i]) {
        fail(`history.series.${k}.points[${i}].period ${periods[i]} !== canonical grid ${canonical[i]} (first week-grid mismatch)`);
        break;
      }
    }
  }
}
if (errors.length > 0) {
  console.error('Oil Directional backtest check FAILED (history integrity):');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

// ---- (2) regime GATE (pre-registered) ----
const bt = runBacktest(history);
const inSet = (r, set) => set.reduce((a, b) => a + (r.counts[b] || 0), 0);

// 2020 collapse subwindow: bearish majority + ZERO strong/moderate bullish
{
  const r = bt['2020-collapse'];
  if (!(r && r.total > 0)) fail('2020-collapse: no sampled weeks');
  else {
    if (!((r.counts.bearish || 0) > r.total / 2)) fail(`2020-collapse: bearish not majority (${r.counts.bearish || 0}/${r.total}); counts=${JSON.stringify(r.counts)}`);
    if (inSet(r, STRONG_OR_MODERATE) !== 0) fail(`2020-collapse: forbidden strong/moderate_bullish present (${inSet(r, STRONG_OR_MODERATE)}); counts=${JSON.stringify(r.counts)}`);
  }
}
// 2020 full Q2 sanity: ZERO strong/moderate bullish (late-Q2 neutral allowed)
{
  const r = bt['2020-fullQ2'];
  if (!(r && r.total > 0)) fail('2020-fullQ2: no sampled weeks');
  else if (inSet(r, STRONG_OR_MODERATE) !== 0) fail(`2020-fullQ2: forbidden strong/moderate_bullish present (${inSet(r, STRONG_OR_MODERATE)}); counts=${JSON.stringify(r.counts)}`);
}
// 2022 Q2: bullish-family majority + ZERO bearish
{
  const r = bt['2022-Q2'];
  if (!(r && r.total > 0)) fail('2022-Q2: no sampled weeks');
  else {
    if (!(inSet(r, BULLISH_FAMILY) > r.total / 2)) fail(`2022-Q2: bullish-family not majority (${inSet(r, BULLISH_FAMILY)}/${r.total}); counts=${JSON.stringify(r.counts)}`);
    if ((r.counts.bearish || 0) !== 0) fail(`2022-Q2: forbidden bearish present (${r.counts.bearish}); counts=${JSON.stringify(r.counts)}`);
  }
}
// 2023-24 range: strong/crisis proportion <= 30% AND max consecutive <= 2 biweekly samples (~4 weeks)
{
  const r = bt['2023-24-range'];
  if (!(r && r.total > 0)) fail('2023-24-range: no sampled weeks');
  else {
    const prop = inSet(r, STRONG_OR_CRISIS) / r.total;
    if (!(prop <= 0.30)) fail(`2023-24-range: strong/crisis proportion ${(prop * 100).toFixed(1)}% > 30%; counts=${JSON.stringify(r.counts)}`);
    if (!(r.maxConsecStrongOrCrisis <= 2)) fail(`2023-24-range: max consecutive strong/crisis ${r.maxConsecStrongOrCrisis} > 2 biweekly samples`);
  }
}

if (errors.length > 0) {
  console.error('Oil Directional backtest GATE FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

const summary = Object.entries(bt).map(([n, r]) => `${n}:${r.total}w`).join(' ');
console.log(`Oil Directional backtest check: PASS (history integrity + regime GATE 2020/2022/2023-24; physical-only) [${summary}]`);
