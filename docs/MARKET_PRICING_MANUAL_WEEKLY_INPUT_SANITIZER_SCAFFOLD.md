# Market Pricing Manual Weekly Input Sanitizer Scaffold (v28.0M-23)

## Purpose

This is the FIRST executable scaffold on the manual-input route. It reads NASDAQ CSV files placed in `manual-artifacts/market-pricing/manual-weekly-input/` and produces sanitized weekly records as JSON, plus a sanitization report.

It does NOT write to `data/market-pricing-history.json`. That step is M-24.

## Usage

User workflow:

- Place one or more `<yyyy-mm-dd>.csv` files in `manual-artifacts/market-pricing/manual-weekly-input/`.
- Run `npm run market-pricing:manual-weekly-input-sanitizer:dry-run`.
- Inspect the printed summary: files processed, rows accepted/rejected, and weeks produced.
- If dry-run looks good, run `npm run market-pricing:manual-weekly-input-sanitizer:run`.
- The scaffold writes to `manual-artifacts/market-pricing/sanitized-output/<timestamp>/`.
- Inspect `sanitized.json` and `sanitization-report.json` manually.

## Input Contract

Input files follow the NASDAQ CSV format defined in the M-22 design fixture at `docs/fixtures/market-pricing/manual-weekly-input-sanitizer-design-v28.0M-22.json`.

Required CSV header:

```text
Date,Close/Last,Volume,Open,High,Low
```

The scaffold accepts both CRLF and LF line endings.

## Validation Rules

The scaffold records these rejection reasons:

- `header_mismatch`
- `date_format_invalid`
- `date_out_of_range`
- `future_date`
- `close_not_numeric`
- `close_out_of_plausibility_bounds`

Header mismatch rejects the entire file. Row-level rejections are logged in `sanitization-report.json` and do not stop processing of other valid rows.

## Output Contract

Output records are:

- converted from US `MM/DD/YYYY` to ISO `YYYY-MM-DD`;
- mapped from NASDAQ `Close/Last` to internal `close`;
- grouped by ISO 8601 week;
- represented by the last trading day in each ISO week;
- de-duplicated by ISO week, with the latest input file winning;
- sorted ascending by date.

Output remains review-only and is not production history.

## What This Scaffold Does Not Do

- Does not write to `data/*`; history insertion is M-24.
- Does not call any network endpoint.
- Does not read `process.env`.
- Does not activate Market Pricing Temperature.
- Does not calculate MA60, standard deviation, or z-score.

## Recovery From Sanitization Failures

If `header_mismatch` appears, confirm the first line exactly matches `Date,Close/Last,Volume,Open,High,Low`.

If `date_format_invalid` or `date_out_of_range` appears, confirm the file uses US month-first dates such as `05/11/2026`.

If `future_date` appears, confirm the NASDAQ download range and local filename date.

If `close_not_numeric` appears, inspect the `Close/Last` cell for an empty or non-numeric value.

If `close_out_of_plausibility_bounds` appears, inspect the row manually before any future history import.

## Next Step

M-24 is the first record write to history. M-24 requires explicit human approval per import.
