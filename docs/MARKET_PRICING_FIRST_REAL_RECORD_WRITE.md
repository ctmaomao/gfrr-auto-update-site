# Market Pricing First Real Record Write / Weekly Merge (v28.0M-24, M-62 update)

## Purpose

M-24 is the first approved step that can write records to `data/market-pricing-history.json`. It originally served the one-time first QQQ history commit; M-62 keeps that first-write role and extends the same scaffold into the ongoing weekly refresh path.

The history file uses the existing multi-asset schema. The script writes only `assets.qqq.records` and the QQQ metadata needed to describe that committed history. `assets.ndx`, `assets.ixic`, and `assets.spx` are preserved unchanged.

## Two-stage manual confirmation pattern

Stage 1: Dry-run preview. Run `npm run market-pricing:first-real-record-write:dry-run`. This reads the latest sanitized output, runs 8 sanity checks, and prints a merge preview. No file write occurs.

Stage 2: Actual commit. After verifying the dry-run output, run `npm run market-pricing:first-real-record-write:commit`. This re-runs the same 8 sanity checks and, only if all pass, writes `data/market-pricing-history.json` atomically.

## Merge semantics

M-62 changes the M-24 commit path from integral replace to `isoWeek`-keyed merge:

- Existing `assets.qqq.records` are read from `data/market-pricing-history.json`.
- Incoming sanitized records are keyed by `isoWeek`.
- If an incoming `isoWeek` does not exist, it is appended into the merged set.
- If an incoming `isoWeek` already exists, incoming wins. This handles NASDAQ historical close revisions and overwrites `sourceFile` / `sourceVendor` with the fresh ingest metadata.
- The merged result is sorted ascending by `date` before writing.
- Dry-run output surfaces `incoming`, `added`, `updated`, and `total` counts, plus the updated ISO weeks (first 10 shown) so the operator can reject suspicious revisions.

## 8 sanity checks

1. `sanitized_input_valid_json`: sanitized input exists and parses as JSON array.
2. `incoming_record_count_minimum`: incoming records are at least 1, so a weekly 4-5 record batch is allowed.
3. `required_fields_present`: every record has `date` / `isoWeek` / `close` in correct format.
4. `strict_ascending_unique_per_week`: incoming records are strictly ascending by date, with no duplicate ISO weeks.
5. `plausibility_bounds_and_no_future`: all close values are in $80-$1000, with no future-dated records.
6. `existing_history_schema_integrity`: existing history schema is valid and preserved assets exist.
7. `cross_seam_monotonicity`: existing latest date must be `<=` incoming earliest date; same-ISO-week overlaps must keep the same Friday close date.
8. `merged_record_count_minimum`: merged QQQ history remains at least 50 records, preserving the original no-fake-history floor.

## Multi-asset schema write target

The commit path changes top-level `status` to `has_history`, `sourceMode` to `manual_weekly_input_committed`, sets `updatedAt` and `generatedAt` during the commit invocation, and changes `boundaries.scaffoldOnly` to `false` because real QQQ weekly data is present.

The commit path changes `assets.qqq.status` to `active`, sets fixed NASDAQ manual-download source attribution, merges sanitized records into `assets.qqq.records`, and recomputes `assets.qqq.coverage`.

Committed QQQ records contain only `date`, `isoWeek`, `close`, `sourceFile`, and `sourceVendor`. Sanitizer-only `referenceFields` such as open, high, low, and volume are not written to history.

## Atomicity guarantee

The write goes to `data/market-pricing-history.json.tmp` first, then `fs.renameSync` replaces the target. This prevents corruption if the process is killed during the write.

## Idempotency

The same input and existing history produce identical merged records except for `updatedAt`, `generatedAt`, and `assets.qqq.source.lastCommittedAt`, which are set during each explicit commit invocation.

## CI safety

`--commit-to-history` is a manual-only flag. CI never invokes it. The `:commit` npm script is intentionally excluded from `check:all`. The checker exercises merge behavior in-process with synthetic history and incoming batches instead of writing `data/market-pricing-history.json`.

## Recovery from failure

If any sanity check fails, the script exits with a specific non-zero code (11-18) and clearly identifies which check failed and why. No partial write occurs.

## What this step does NOT do

- Does not calculate MA60, std, z-score (M-26).
- Does not activate frontend display (M-27).
- Does not modify scoring, decision, execution, or position logic.
- Does not call any network endpoint.
- Does not read environment variables.

## Next steps

- Weekly operator refresh: M-23 sanitizer -> M-24 merge dry-run/commit -> M-26 metrics dry-run/commit -> data update PR.
- PR #3 of the QQQ merge series may add an operator PowerShell wrapper, but it must preserve the same reviewed M-23/M-24/M-26 boundaries.
