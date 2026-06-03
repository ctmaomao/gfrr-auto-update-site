// ODP PR2 backtest harness — replays the LOCKED physical classifier over fixed
// historical windows. Look-ahead-safe: classifyAt() only uses points <= the test
// week. Physical-only — the PR2 classification trunk uses crude/distillate/SPR
// stocks + refinery UTILIZATION + product supplied. `gasolineStocks` and
// `refinerCrudeInputs` are in the history cache but NOT used by the PR2 classifier
// (reserved as evidence / future refinement) — see UNUSED_IN_BACKTEST.
//
// GATE windows + criteria are PRE-REGISTERED (see docs/PROJECT_BACKLOG.md P3-19).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyAt } from './odp-classifier.mjs';

export const BULLISH_FAMILY = ['strong_bullish', 'moderate_bullish', 'product_crisis'];
export const STRONG_OR_CRISIS = ['strong_bullish', 'product_crisis'];
export const STRONG_OR_MODERATE = ['strong_bullish', 'moderate_bullish'];
export const UNUSED_IN_BACKTEST = ['gasolineStocks', 'refinerCrudeInputs'];

// Fixed, pre-registered windows.
export const WINDOWS = [
  { name: '2020-collapse',  start: '2020-04-10', end: '2020-05-15', sample: 'weekly' },
  { name: '2020-fullQ2',    start: '2020-04-03', end: '2020-06-26', sample: 'weekly' },
  { name: '2022-Q2',        start: '2022-04-01', end: '2022-06-30', sample: 'weekly' },
  { name: '2023-24-range',  start: '2023-01-01', end: '2024-12-31', sample: 'biweekly' },
];

function periodsInRange(history, start, end, sample) {
  const pts = (history.series && history.series.crudeStocksExSpr && history.series.crudeStocksExSpr.points) || [];
  const inRange = pts.map((p) => p.period).filter((pr) => pr >= start && pr <= end);
  return sample === 'biweekly' ? inRange.filter((_, i) => i % 2 === 0) : inRange;
}

export function runBacktest(history) {
  const out = {};
  for (const w of WINDOWS) {
    const periods = periodsInRange(history, w.start, w.end, w.sample);
    const rows = periods.map((p) => ({ period: p, bias: classifyAt(history, p).bias }));
    const counts = {};
    for (const r of rows) counts[r.bias] = (counts[r.bias] || 0) + 1;
    let maxConsec = 0;
    let cur = 0;
    for (const r of rows) {
      if (STRONG_OR_CRISIS.includes(r.bias)) { cur += 1; maxConsec = Math.max(maxConsec, cur); } else cur = 0;
    }
    out[w.name] = { total: rows.length, counts, maxConsecStrongOrCrisis: maxConsec, rows };
  }
  return out;
}

// Standalone human-facing report.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('oil-directional/backtest-oil-directional.mjs')) {
  const history = JSON.parse(readFileSync(resolve('data/oil-directional-history.json'), 'utf8'));
  const bt = runBacktest(history);
  for (const [name, r] of Object.entries(bt)) {
    console.log(`[backtest] ${name.padEnd(16)} n=${r.total}  ${JSON.stringify(r.counts)}  maxConsecStrong/crisis=${r.maxConsecStrongOrCrisis}`);
  }
  console.log(`[backtest] physical-only; unused in PR2 classifier: ${UNUSED_IN_BACKTEST.join(', ')}`);
}
