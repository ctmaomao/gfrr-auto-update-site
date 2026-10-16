# ADR-0070 — Bubble capex bounded event inspection

- Status: Proposed for independent review; diagnostic collection only
- Date: 2026-10-16
- Owner acceptance: attempt the four-company event collector, free Actions verification; standing independent AI review, push and merge authorization. No new scoring admission or paid source.

## Problem

ADR-0069 r3 correctly holds capex pending. A rolling price return cannot establish the latest comparable capital-spending guidance event. The next step needs observable source discovery and failure evidence before any numeric contract migration.

## Decision

Add a manual, isolated collector for MSFT/META/AMZN/GOOGL. Use the [official SEC submissions API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), issuer-bound filing indexes and exactly one HTML EX-99.1 per selected quarterly earnings filing. Read recent filings and every declared historical partition intersecting a 370-day horizon, at most two; validate partition identity, dates, counts and accession uniqueness. `secFilingEnumerationComplete` refers only to that SEC API scope, never all IR/call/interim guidance. Refuse a newer earnings 8-K without its quarterly report, amended latest report or ambiguous attachment; do not skip to an older parseable event.

Extract guidance only from an unambiguous capex forecast clause with an annual year/basis and one USD billion amount/range. Reject competing revenue/income metrics. Preserve both endpoints; fiscal/calendar periods cannot be substituted. Explicit principal payments on finance leases are required for the principal-payment basis; generic lease additions remain incomparable. Reclassification or unclear basis holds the comparison. Evidence stores document/clause digests, source identity and derived facts, not entire source HTML.

Original publication metadata is required for a release-associated price window; SEC acceptance is archival evidence and never its replacement. Use the [Nasdaq 2026 cash-equity calendar](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule), America/New_York and the first complete regular session. Hold intraday, close-boundary, early-close, current-session and unreviewed-year cases. Fetch matched stock/QQQ latest-vintage adjusted daily closes only when timing is qualified. This is release association, not capex causality or point-in-time backtest evidence.

Calls, IR presentations and interim updates are not fully enumerated. `guidanceDiscoveryComplete`, `scoringEligible` and `productionEligible` remain false. `guidance_first_disclosure_not_verified` remains a gap even in synthetic complete SEC fixtures. No builder import, activeRevision/checker change, production data write, frontend integration or numeric capex light is included. A future complete adapter and scoring admission require a separately reviewed ADR/checker PR with actual four-company latest evidence.

## Request and storage boundaries

Default CLI is offline and writes nothing. `--allow-network` enables a single bounded inspection; `--write` writes only ignored `manual-artifacts/bubble-capex-event-panel-latest.json`. No user-provided destination or arbitrary URL. HTTPS host allowlist is data.sec.gov/www.sec.gov/query1.finance.yahoo.com. Max 36 requests, 9/company, 2 historical partitions/company, 12 seconds/request, 3 MiB/response, 18 MiB cumulative streaming threshold; the first over-limit chunk cancels reading and exhaustion prevents all later requests. SEC starts are spaced at least 300ms. No application retry or redirect; 401/403/429 opens a host circuit across companies. Errors are sanitized; unavailable material cannot generate qualified facts.

`Inspect Bubble Capex Events` is manual/main-only, contents:read, no credentials, no provider, no schedule and no deployment/production write. It uploads only the derived panel for 14 days. Network failure exits nonzero while retaining that panel; semantic evidence gaps remain explicit in a successful inspection and do not mean production eligibility. Do not use proxies, browser bypasses or repeated attempts to evade access failures.

## Verification and limits

Offline regressions cover real collector joins, truncated/wrong-issuer/duplicate inputs, declared partitions, latest-event holds, attachment ownership, guidance/range/lease ambiguity, calendar timing, stock/QQQ matching, source failures, cumulative budget stop, safe CLI and workflow isolation. Existing capex scoring checker and all old assertions remain unchanged. Full check:changed/check:all, fixed-head independent review and CI are required before merge; a single free main-branch inspection then establishes runner reachability. SEC access denial or absent metadata is a real remaining gap, not a reason to relax admission.
