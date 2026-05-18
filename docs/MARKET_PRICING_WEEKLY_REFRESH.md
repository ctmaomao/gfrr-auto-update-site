# Market Pricing Weekly QQQ Refresh Runbook

This runbook covers the manual weekly QQQ refresh wrapper added after M-62. The script is `scripts/refresh-qqq-data.ps1`.

The wrapper is an operator tool, not a CI workflow. It keeps the Nasdaq browser download as a human step, then automates the local file move, sanitizer, M-24 `isoWeek` merge preview/commit, M-26 metrics recompute, `check:all`, and data commit/push.

## When To Run

Run this weekly after Nasdaq has published the latest QQQ historical close, usually Friday evening US time or the next local work session after markets close. If a week was missed, use Nasdaq's `6M` range selector instead of `1M` so the CSV covers the missing weeks.

Do not run it from CI. The script can write `data/market-pricing-history.json` and `data/market-pricing-metrics.json` after explicit operator confirmation.

## Basic Usage

From the repo root on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\refresh-qqq-data.ps1
```

Useful test / recovery variants:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\refresh-qqq-data.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File scripts\refresh-qqq-data.ps1 -CsvPath "$env:USERPROFILE\Downloads\HistoricalData_ABC.csv"
powershell -ExecutionPolicy Bypass -File scripts\refresh-qqq-data.ps1 -SkipBrowser
powershell -ExecutionPolicy Bypass -File scripts\refresh-qqq-data.ps1 -NoCommit
```

`-AutoConfirm` exists for trusted local automation, but normal manual operation should not use it. Same-ISO-week revisions need human review.

## The 14 Steps

1. Pre-flight checks: repo root, Node 24/25, git, input directory, and clean tracked data files.
2. Capture today's local `yyyy-MM-dd` date and script start timestamp.
3. Open <https://www.nasdaq.com/market-activity/etf/qqq/historical> in the default browser.
4. Poll `%USERPROFILE%\Downloads` for a fresh `HistoricalData_*.csv`.
5. Validate the first CSV line exactly equals `Date,Close/Last,Volume,Open,High,Low`.
6. Rename/move the CSV to `manual-artifacts/market-pricing/manual-weekly-input/<today>.csv`.
7. Run `npm run market-pricing:manual-weekly-input-sanitizer:run` and validate the latest `sanitization-report.json`.
8. Run `npm run market-pricing:first-real-record-write:dry-run` and parse `would_merge_summary`.
9. Ask for operator confirmation. If existing weeks will be updated, print the ISO weeks and warn loudly.
10. Run `npm run market-pricing:first-real-record-write:commit` and verify `data/market-pricing-history.json` parses.
11. Run `npm run market-pricing:metrics-calculation:commit` and verify `data/market-pricing-metrics.json` parses.
12. Run `npm run check:all`. If it fails, do not commit.
13. Commit and push the two refreshed data files with a count-bearing message.
14. Print final counts plus the latest metric records.

## Failure Modes And Recovery

### Header mismatch

The script stops if the CSV header is not exactly:

```text
Date,Close/Last,Volume,Open,High,Low
```

Recovery: open the downloaded CSV and confirm Nasdaq did not change the export format. Do not hand-edit the file into shape unless the source format has been reviewed. If Nasdaq changed the format, stop and open a code review PR for the sanitizer contract.

### No downloaded file detected

The script waits 5 minutes for a fresh `HistoricalData_*.csv` in `%USERPROFILE%\Downloads`.

Recovery: confirm the browser download completed, check whether the file name differs from `HistoricalData_*.csv`, then rerun with `-CsvPath <path>` if needed.

### Existing `<today>.csv` in manual input

The script prompts `[O]verwrite`, `[S]kip`, or `[A]bort`.

- `Overwrite`: use the newly downloaded CSV.
- `Skip`: keep the existing input file and continue.
- `Abort`: safest default; inspect both files manually.

### Sanitizer produced zero records

The M-23 sanitizer can exit 0 even when no weekly records were produced. The wrapper therefore reads `sanitization-report.json`.

Recovery: inspect `rowsAccepted`, `rowsRejected`, `rejectionsByReason`, and `fileReports`. Common causes are wrong filename, header mismatch, future date, or close values outside plausibility bounds.

### Cross-seam monotonicity violation

The M-24 dry-run fails if incoming records begin before the current history seam, unless the same `isoWeek` uses the same date.

Recovery: confirm you downloaded the right range. For a normal weekly refresh, `1M` should produce recent weeks after the current latest date. If you intentionally need a historical revision, the incoming same-`isoWeek` date must match the existing date. Otherwise stop and inspect the CSV before rerunning.

### Same-ISO-week revisions

If dry-run reports `updated > 0`, Nasdaq is revising already-recorded ISO weeks. This can be legitimate because historical closes can be republished.

Recovery: compare the updated ISO weeks and closes against Nasdaq manually. Proceed only if the revisions look correct. The script defaults to `N` on the confirmation prompt.

### `check:all` failure

The script stops before git commit if `npm run check:all` fails.

Recovery: read the failing check output. The two data files may already be modified locally. Either fix the source issue and rerun, or restore the files with normal git workflows if the refresh should be abandoned.

### Git commit or push failure

Recovery: run `git status --short`, inspect staged/unstaged files, and either commit/push manually or retry after resolving branch/auth issues. The script stages only `data/market-pricing-history.json` and `data/market-pricing-metrics.json`.

## Cleanup After Abort

The wrapper may leave review artifacts under `manual-artifacts/market-pricing/`. Those paths are gitignored by design.

If the script aborts before Step 10, tracked data files should be unchanged. If it aborts after Step 10 or Step 11, inspect:

```powershell
git diff -- data/market-pricing-history.json data/market-pricing-metrics.json
```

If the refresh should be abandoned, restore those two files before retrying. Do not manually edit generated market-pricing data.

## Boundaries

- Browser download remains manual.
- No network call is added to Node scripts.
- No CI workflow invokes `--commit-to-history` or `--commit-metrics`.
- M-23 sanitizer remains stateless and review-only until this wrapper invokes the approved downstream steps.
- M-24 merge semantics remain `isoWeek` keyed with incoming-wins revisions.
- M-26 remains the only calculation layer for MA60, standard deviation, and z-score.
