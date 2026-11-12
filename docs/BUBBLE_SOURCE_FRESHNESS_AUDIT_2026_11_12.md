# Bubble source freshness audit — 2026-11-12

Scope: current Bubble acquisition, dated observations and cadence. This is not a claim that every provider is realtime or that future retrievals will succeed. No paid provider or production refresh was run for this audit.

## Confirmed repair

SPY/RSP six-month spread previously discarded observation dates, used each series' own first/last point, and published retrieval day as `as_of`. A truncated or delayed series could distort the spread and conceal its age.

The repair uses common dated sessions and identical endpoints, retains the existing unadjusted-close price-return formula and percentage-point thresholds, and publishes the last common observation date. It requires at least 100 common sessions, a 150–200 calendar-day span and an endpoint no older than 7 days. Missing, invalid, duplicate or future dates and nonpositive prices fail to the existing dated fallback. These are completeness/freshness requirements, not new score thresholds. No new source or network request is added. Live read-only Yahoo probes returned 128 rows for each ETF with matching endpoints; this establishes present availability only.

## Remaining source classes

| Source/indicator | Current behavior / limitation | Next useful step |
|---|---|---|
| CAPE / SPY holdings / NVDA forward PE | Existing public HTML scrapers attach retrieval-day `as_of`; source-date extraction is not established | Bind metric-specific dates before claiming observation freshness; do not use generic page modification date |
| SEC hyperscaler capex / cash flow | Complete quarter qualification and 120-day age checks; fiscal calendars retained | Keep quarterly cadence and period semantics; daily polling cannot make disclosures realtime |
| Barchart breadth / Yahoo fallback | Dated source requirement; full universe fallback aligns session and coverage | Retain guards; full-universe requests are expensive and should not be made frequent blindly |
| Credit spreads | FRED daily observations; full builder refresh is weekly, separate credit-only tool is manual | Daily close is not live intraday credit pricing |
| VC share / neocloud credit | Current package falls back to dated evidence when recent complete coverage cannot be proved | Preserve explicit gaps; search success alone is not current-period coverage |
| OpenRouter volume / spend proxy | Public dated chart plus current model catalogue; spend assumes 80/20 input/output blend and is not actual vendor revenue | Bind chart period to observation date; catalogue availability does not certify historical realized pricing |
| IPO pipeline / accounting events / CEO caution | Public filings/news-derived proxies, not complete issuance/incident inventories; free-search and evidence gates apply | Retain scope/date/coverage limits; do not treat no result as proof of no event |
| Debt/capex funding split / AI-specific ABS | Broad public research estimate or qualified/manual evidence, not live issuer credit quotes | Keep proxy labels and unknown states; no free like-for-like live feed established |
| ARR acceleration | Underlying milestone is stale and score unknown | Require newer underlying milestones, not a newly downloaded old archive |
| Private marks / GPU rental / frontier progress / enterprise deployment | Curated or reviewed observations with explicit source windows | No verified free like-for-like realtime replacement established |
| Insider / Fed / capex event panels | Qualified evidence paths with explicit source/period checks | Preserve event/filing timing and limits; no source substitution solely to obtain a number |

## Cadence

The full Bubble refresh is weekly (Monday 05:30 UTC). Tuesday–Friday source audits restore production files and do not publish new observations. Separate qualified refresh and credit-spread tools have narrower scopes and are manual, not a daily publication schedule. Increasing full-build frequency would also increase broad scraping/search and does not solve metric-date ambiguity; a selective dated market snapshot is a separate reviewed upgrade, not silently enabled here.

## Boundaries

No production JSON, frozen research, score formula, budget, source rights or publication gate changed. Source availability and true observation freshness must remain distinct. The audit does not equate a new package generation date with fresh constituent observations.
