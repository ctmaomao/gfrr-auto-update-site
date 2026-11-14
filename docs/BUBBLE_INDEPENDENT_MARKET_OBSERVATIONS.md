# Independent Bubble market observations

## Scope and architecture

The owner's data-freshness upgrade adds a **display-only** snapshot at `data/bubble-market-observations.json`. This is an extension of the existing `daily_history_layer` collector and `frontend_display_layer`, not a new scoring pipeline. Its four rows reuse existing public providers: Multpl CAPE, StockAnalysis SPY holdings, StockAnalysis NVDA financial statistics, and Yahoo SPY/RSP daily closes. No new paid source or account is introduced. Source availability is not an inference of licensing rights.

The existing `Refresh Bubble Credit Spreads` workflow keeps its name, schedule and publication hooks. After its existing three FRED credit requests it collects at most five independent market requests. This reuses the same main-writer queue, complete validation and Pages/guarded EdgeOne publication rather than adding another build schedule. It commits only the existing credit display payload and the new market snapshot. The weekly builder does not read or overwrite the new snapshot.

## Hard separation and clocks

- No new weekly score, history, issue number, deterministic prose or AI input. Existing weekly JSON is not an input to the new collector, and the collector cannot write it. Quarterly disclosures are not relabelled as daily evidence.
- The frontend preserves the weekly score/27-card/article issue date, and separately labels each market observation's date and acquisition timestamp. The independent section explicitly says it does not update the weekly score or article. The existing credit section is reused without duplicate requests.
- Daily snapshots are not realtime quotes. The schedule requests Tuesday–Saturday 06:20 UTC, but GitHub can start late. Qualification uses **actual execution time**, not nominal schedule time. Yahoo excludes the current UTC date's potentially unfinished daily bar, even for a late run; both ETFs must share at least 100 dated sessions over a 150–200-day span and a latest common date no older than seven days.
- CAPE uses the dated Atom entry. Holdings and PE use their metric-specific update date, not a quote/last-checked clock. Holdings bind the symbol and weight columns of one qualified table, reject skipped/ambiguous rows, require unique symbols and descending weights, and sum the first five. PE binds a uniquely valued Forward P/E label. Invalid, future, undated or stale source observations cannot become fresh output.
- Each row is `fresh`, `fallback`, `stale`, or `missing`. A failed source preserves a previously validated value and its **original** dates; source date regression is not published as newer evidence. Without valid prior evidence it stays missing/null, never zero. Genuine zero ETF spread remains valid. Frontend age is recomputed while open and on visibility changes.

## Resource and publication bounds

Each collection has five allowlisted GET requests, no credentials, no retries, no alternate providers, no redirect following. Each response is capped at 2 MiB with a 12-second whole-response deadline; all requests run concurrently. The market path never calls search, SEC, Wind, DeepSeek or the approximately 500-symbol breadth fallback. Combined with unchanged credit collection, this is at most eight request starts per scheduled run. Response errors never expose response bodies or secrets in the public snapshot.

The writer defaults to dry-run, permits only the new snapshot path, validates before writing and refuses an intervening file change. The existing writer queue protects overlap with natural full weekly runs. A main branch advance outside that queue makes an ordinary push fail rather than silently rebasing unreviewed output. All existing check gates and source/paid-admission protections remain; the added offline snapshot check is part of `check:all`.

## Verification and limitations

Unit fixtures cover zero, source identity, invalid/future/duplicate dates, malformed first holdings rows, unrelated percentage columns, missing/stale/regressing providers, response bounds and timeout without retry. Frontend tests cover desktop/mobile, pending/unavailable data, malformed inputs, source identity, long-open age and unchanged weekly issue. New tests supplement, not replace, complete suite and independent review.

The initial snapshot is collected using the same bounded production entry point, not hand-entered. Any missing row remains unknown. The initial publish needs independent review, exact-head CI and both-site verification. Later schedule success, collection success and deployment success are distinct receipts. A source update or code merge alone is not proof that every market value is current.

A future daily **overall score** would need a separately reviewed evidence-carry/replay contract. ARR, insider rolling windows, Fed calendar/quote proofs and quarterly evidence cannot be re-dated simply because the market section was fetched today.
