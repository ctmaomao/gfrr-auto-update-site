# Market Pricing Metrics Calculation (v28.0M-26)

## Purpose

M-26 is the Market Pricing calculation layer. It reads QQQ weekly records from `data/market-pricing-history.json`, computes rolling 60-week MA, sample standard deviation, and z-score per record, and writes the derived output to a new file: `data/market-pricing-metrics.json`.

This step does not modify `data/market-pricing-history.json`. It does not activate frontend display.

## Two-stage manual confirmation

M-26 follows the same manual confirmation pattern as M-24.

- Stage 1: Dry-run preview. Run `npm run market-pricing:metrics-calculation:dry-run`. This reads QQQ history, runs 6 sanity checks, computes the metrics preview, and prints the first and last 3 records plus summary ranges. No file write occurs.
- Stage 2: Actual metrics commit. After reviewing the dry-run output, run `npm run market-pricing:metrics-calculation:commit`. This re-runs the same 6 sanity checks and writes `data/market-pricing-metrics.json` atomically only if every check passes.

CI never invokes `--commit-metrics`. The commit npm script is manual-only and is intentionally excluded from `check:all`.

## Calculation specification

- Window: 60 source records, ending at the current record inclusive.
- Output records correspond to source records at indices 59..N-1. The first 59 source records cannot form a complete 60-record window and are omitted from output.
- MA60: arithmetic mean of `close[i-59..i]`.
- StdDev60: sample standard deviation with divisor `N-1`, so the 60-record window divides squared deviations by 59, not 60.
- Z-score: `(close[i] - ma60) / stdDev60`.
- Degenerate case: if `stdDev60` is 0, z-score is 0.
- Numeric precision: `ma60`, `stdDev60`, and `zScore` are rounded to 4 decimal places.
- Z-score is not capped. Raw values are stored. Display capping is M-27's responsibility.

## 6 sanity checks

1. `history_file_valid_json`: `data/market-pricing-history.json` exists and parses as JSON.
2. `history_state_has_history`: `history.status === "has_history"`.
3. `target_asset_active`: `assets.qqq.status === "active"`.
4. `sufficient_records_for_window`: `assets.qqq.records.length >= 60`.
5. `records_sorted_unique`: records are strictly ascending by date, with no duplicate date or ISO week.
6. `records_close_finite_positive`: every record has a finite positive `close`.

## Atomicity

Commit mode writes to `data/market-pricing-metrics.json.tmp` first, then uses `fs.renameSync` to replace `data/market-pricing-metrics.json`. If the write fails before rename, the temporary file is removed.

## Idempotency

For the same source history, metrics output is identical except for `generatedAt` and `sourceCommit`. Record order, top-level key order, and numeric precision are deterministic.

## What this step does NOT do

- Does not modify `data/market-pricing-history.json`.
- Does not activate frontend display. That is M-27.
- Does not modify scoring, decision, execution, or position logic.
- Does not call any network endpoint.
- Does not read environment variables.
- Does not add dependencies.

## Relationship to M-24, M-25, and M-27

- M-24 commits and refreshes raw QQQ weekly records into the multi-asset history file via `isoWeek`-keyed merge. M-62 keeps this merge-safe for weekly history growth.
- M-25 verifies that the QQQ history buildup satisfies the 60-week minimum.
- M-26 computes rolling MA60 / sample StdDev60 / z-score metrics into a separate metrics file.
- M-27 will read `data/market-pricing-metrics.json` and activate frontend display.

## Manual operation workflow

1. After the M-26 PR is merged, run `npm run market-pricing:metrics-calculation:dry-run`.
2. Review the preview output: sanity checks, record counts, date range, and MA60 / StdDev60 / z-score ranges.
3. Run `npm run market-pricing:metrics-calculation:commit` to write `data/market-pricing-metrics.json`.
4. Commit the generated metrics file manually, using the actual metrics record count from the dry-run/commit output rather than a hard-coded historical count.
