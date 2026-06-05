# Market Pricing Manual Weekly Input Sanitizer Design (v28.0M-22)

> **STATUS (2026-06):** Preserved as a phase / scope record. In-body "waiting-for-history / scaffold-only / records empty / not currently present / waiting_for_source / no MA60 / z-score" statements describe the phase named in their section and are **not** today's state unless restated as current. Today: `data/market-pricing-history.json` is `status=has_history` with 60+ weekly records for QQQ (primary) plus NDX / IXIC (auxiliary, landed via M-91), `sourceMode=manual_weekly_input_committed`; `data/market-pricing-metrics.json` carries computed MA60 / StdDev60 / z-score metrics for all three (`metrics_active_display_only`) via M-26 calculation + M-91; the homepage Market Pricing Temperature card is **live** (M-27). **Still mandatory:** display-only / audit-only — `affectsScoring=false` / `affectsDecisionModel=false` / `affectsExecutionLock=false` / `affectsPositionGuidance=false`; NDX / IXIC remain absent from `displayInputsBaseline` / `effectiveDisplayInputs` / `values` / Brent promotion / scoring / decision / execution / position. The conditional degradation rule still holds: any asset with <60 validated weekly records stays `insufficient_history` and its card falls back to the waiting-state placeholder (M-27 graceful degradation). Current authority: `docs/MARKET_PRICING_TEMPERATURE_DISPLAY.md` + `docs/MARKET_PRICING_METRICS_CALCULATION.md` + `docs/OPERATIONS.md` + the live `data/market-pricing-*.json`.

## Purpose

Define how a future sanitizer reads NASDAQ official CSV files placed manually in
the manual-weekly-input directory and converts them to weekly records ready for
history accumulation.

M-22 is design layer only. It adds no executable sanitizer and writes no records
to `data/market-pricing-history.json`.

## Why Manual Input

M-21 proved the throttled network gate and validation path, but the Stooq public
CSV endpoint returned API key instructions instead of CSV data. M-20 format
validation rejected that response and zero data contamination occurred.

The short-term route is manual weekly download from NASDAQ official historical
data. The long-term route, after M-27, is to research alternative truly-free
auto-fetch sources. See `docs/MARKET_PRICING_SOURCE_INCIDENT_LOG.md` for the
incident record.

## Workflow

User perspective:

1. Each Monday, open `https://www.nasdaq.com/market-activity/etf/qqq/historical`.
2. Select date range `1 month`.
3. Download CSV. NASDAQ may name it like `HistoricalData_<random>.csv`.
4. Rename it to `<yyyy-mm-dd>.csv`, where `yyyy-mm-dd` is today's date.
5. Place it in `manual-artifacts/market-pricing/manual-weekly-input/`.
6. For one-time initial backfill, use the same procedure with date range `10 years (MAX)`.

## Sanitizer Contract

- Reads files from `manual-artifacts/market-pricing/manual-weekly-input/`
  matching the `yyyy-mm-dd.csv` pattern.
- Validates header row exactly equals `Date,Close/Last,Volume,Open,High,Low`.
- Converts US `MM/DD/YYYY` dates to ISO `YYYY-MM-DD`.
- Maps column name `Close/Last` to internal `close`.
- Validates plausibility bounds from `$80` to `$1000`.
- Outputs ascending weekly records, one per ISO 8601 week, using the last trading
  day of that week.
- De-duplicates across overlapping weekly inputs; latest download wins per week.

## M-23 Scope

M-23 may add the executable sanitizer scaffold. It must still write only to
`manual-artifacts/` for review and must not write history.

## M-24 Scope

M-24 is the first planned step that may write approved records to history. M-62 updates that path to merge approved weekly records by `isoWeek` so 1-month refresh batches can extend history without replacing accumulated records.

## Boundaries

Market Pricing Temperature remains waiting-for-history. No calculation, no
frontend change, and no workflow change. M-21 script logic remains unchanged.
