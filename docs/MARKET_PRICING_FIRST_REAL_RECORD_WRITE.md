# Market Pricing First Real Record Write (v28.0M-24)

## Purpose

This is the FIRST step that writes records to `data/market-pricing-history.json`. All previous M-series steps were design or scaffold layers that produced no history records. M-24 takes the sanitized output from M-23 and commits it to the production data file.

## Two-stage manual confirmation pattern

Stage 1: Dry-run preview. Run `npm run market-pricing:first-real-record-write:dry-run`. This reads the latest sanitized output, runs 5 sanity checks, and prints a preview of what would be written. No file write occurs.

Stage 2: Actual commit. After verifying the dry-run output, run `npm run market-pricing:first-real-record-write:commit`. This re-runs the same 5 sanity checks and, only if all pass, writes `data/market-pricing-history.json` atomically.

## 5 sanity checks

1. Sanitized input exists and parses as JSON array.
2. Record count is at least 50.
3. Every record has `date` / `isoWeek` / `close` in correct format.
4. Records are strictly ascending by date, with no duplicate ISO weeks.
5. All close values are in $80-$1000, with no future-dated records.

## Atomicity guarantee

The write goes to `data/market-pricing-history.json.tmp` first, then `fs.renameSync` replaces the target. This prevents corruption if the process is killed during the write.

## Idempotency

The same input produces identical output after the first commit. The first commit for a new input updates `generatedAt`; a repeated commit against identical records preserves that timestamp so the second run is byte-stable.

## CI safety

`--commit-to-history` is a manual-only flag. CI never invokes it. The `:commit` npm script is intentionally excluded from `check:all`.

## Recovery from failure

If any sanity check fails, the script exits with a specific non-zero code (11-15) and clearly identifies which check failed and why. No partial write occurs.

## What this step does NOT do

- Does not calculate MA60, std, z-score (M-26).
- Does not activate frontend display (M-27).
- Does not modify scoring, decision, execution, or position logic.
- Does not call any network endpoint.
- Does not read environment variables.

## Next steps

- M-25: validate accumulated history has at least 60 weekly records (sufficient for MA60).
- M-26: add MA60 / std / z-score calculation layer.
- M-27: activate frontend display.
