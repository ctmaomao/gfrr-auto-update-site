# ADR-0034: ACLED comparison uses complete calendar-month windows

- Status: Owner-authorized implementation; independent AI merge review required.
- Date: 2026-09-09.
- Scope: Monthly local normalization, its config checker and evidence wording. No monthly scoring migration or source-access change.

## Context and acceptance baseline

Owner authorized completing the ACLED configuration review after confirming that some weekly regions lag at the official source. Independent review found that `buildMonthlyTrend` selected the last 24 *observed* months without checking the cutoff or calendar continuity. The 2026-08-21 batch included incomplete August and emitted 0.023264 as a 12-month comparison. Missing months could also silently shift windows backward. This is separate from legitimate weekly upstream lag, already protected by ADR-0033.

## Decision

1. Anchor the comparison to the real `asOfDate`, never today's clock or the latest observed row. Conservatively exclude its whole month, including month-end releases: an as-of filename alone does not establish complete all-day ingestion. A future alternative requires explicit source coverage evidence and a reviewed contract change.
2. Construct exactly 24 consecutive calendar months immediately before that month. Compare the latest 12 against the preceding 12. Do not select merely the 24 most recent months with records or move backward to hide a missing month.
3. Require an observed total for every month using existence, not truthiness. Explicit zero is valid. Any missing month returns the existing whole `monthlyTrend: null` with a diagnostic. Do not insert synthetic zeros. This establishes calendar coverage only, not complete country coverage.
4. Preserve the existing five trend fields, six-decimal ratio and zero-denominator `null`. Validate calendar dates and integer source values. The country-month-year parser must reject blank event cells before numeric conversion so they cannot become observed zero months. Annual parsing/aggregates, rankings, confidence, source metadata, raw files and weekly metrics remain unchanged. The existing main entry gate requires all six monthly files to share one as-of date before parsing; retain this guard so a newer annual file cannot lend its cutoff to an older monthly file.
5. Strengthen the checker with exact calendar-window and ratio reconciliation assertions. Retain all old assertions and the existing whole-null allowance. This dedicated monthly-methodology PR explicitly reviews checker changes; no skip, relaxed assertion, new dependency or scoring alteration is permitted.
6. Evidence states actual comparison windows and excluded cutoff month, or reports insufficient complete-month coverage. Config is regenerated only through the existing local sanitizer using the same six owner-downloaded XLSX, not hand-edited numeric values. After independent review/merge, run the existing main World Order refresh and verify publication. This does not authorize Daily or an AI provider call.

## Actual-batch reconciliation

The unchanged country-month-year source contains 29,353 rows. Independent read-only workbook aggregation and the updated sanitizer agree:

| Window | Events |
|---|---:|
| 2025-08 through 2026-07 | 227740 |
| 2024-08 through 2025-07 | 219054 |
| Latest / prior − 1, six decimals | 0.039652 |

All 24 month keys exist. `asOfDate=2026-08-21`, `latestFullYear=2025` and annual political violence events 211629 are unchanged. This is a corrected comparison definition, not new source data or evidence that conflict worsened between two refreshes.

## Verification and recovery

Tests cover month-end, cross-year and leap-day cutoffs; inflated current-month rows; every missing month and no historical backfill; source-parser blank versus explicit zero; denominator zero; multiple countries and shuffled input; actual checker rejection of invalid windows/ratio; whole-null propagation through the local fetcher; real sanitizer CLI rejection of mixed as-of files before parsing, with a throwing test-only parser stub and unchanged config bytes. Verify unchanged raw hashes, annual/ranking fields and sanitizer idempotence, then full checks and independent exact-head review.

Rollback requires a reviewed revert of code and its generated config together. Preserve the earlier config backup and original inputs. Never roll back only the guard to admit incompatible windows or alter dates to satisfy freshness.
