# Market Pricing Temperature Display (v28.0M-27)

## Purpose

v28.0M-27 activates the editorial Market Pricing Temperature card on the homepage. The card reads precomputed QQQ metrics from `data/market-pricing-metrics.json` and displays the latest z-score, close, 60-week mean, 60-week standard deviation, historical z-score range, and a 7-week trend.

This is a frontend display layer only. It does not modify `data/market-pricing-metrics.json`, does not modify `data/market-pricing-history.json`, and does not change scoring, decision, execution, or position logic.

## Five-Bucket Specification

The frontend classifies the precomputed latest z-score into five display buckets:

| z-score threshold | Label | Display color |
|---|---|---|
| `z >= +2` | 极度过热 | `#7C1D1D` via `--risk-red` |
| `+1 <= z < +2` | 显著偏热 | `#A8761A` via `--risk-yellow` |
| `-1 < z < +1` | 中性区间 | `#1A1815` via `--paper-ink` |
| `-2 < z <= -1` | 显著偏冷 | `#666666` via `--paper-muted` |
| `z <= -2` | 极度偏冷 | `#1F4D2C` via `--risk-green` |

The raw z-score is displayed to two decimals and is not capped. If a future raw value exceeds `+3` or falls below `-3`, the card still displays the actual value.

## Graceful Degradation

If `data/market-pricing-metrics.json` cannot be loaded, cannot be parsed, or does not contain the expected records array, the card falls back to the v28.0N-6 waiting-state placeholder. The rest of the page continues rendering normally.

The failure is logged with `console.warn` for debugging. No additional visible user error appears beyond the waiting-state card.

## Data Flow

`data/market-pricing-metrics.json` -> local page fetch -> `renderMacroOverview.js` -> `#market-temperature-card-root`.

The card uses only the precomputed fields in the metrics file: `close`, `ma60`, `stdDev60`, and `zScore`. The frontend does not recompute the 60-week mean, standard deviation, or z-score.

## What This Step Does Not Do

- Does not change scoring, decision, execution, or position logic.
- Does not call any external network endpoint for metrics; the fetch is a local static data file read.
- Does not modify metrics or history data.
- Does not change the M-26 calculation layer.
- Does not change workflows or External AI behavior.

## Maintenance

When QQQ history is updated weekly, the operator path remains:

1. Run the M-23 manual weekly input sanitizer.
2. Run the M-24/M-62 history merge path (`isoWeek`-keyed, incoming wins on same-week revisions).
3. Run the M-26 metrics calculation commit path.
4. Commit the refreshed data files through the reviewed data-update route.

After `data/market-pricing-metrics.json` is updated, the card automatically displays the latest metrics. No frontend code change or frontend redeploy is needed unless the static asset cache version is intentionally bumped for a frontend release.
