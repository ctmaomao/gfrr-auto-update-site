# ADR-0086: FIRMS S-NPP retirement and incomparable baseline guard

## Status

User-authorized module repair; the owner subsequently approved isolated integration on latest main, a draft PR and CI verification only. Merge and deployment remain unapproved. Independent code/contract review passed with no remaining blockers; full check:changed/check:all and 15 dedicated offline regressions passed. Browser visual acceptance was not run because of the existing preview permission limit; not published or deployed. No source subscription, source-rights expansion, baseline promotion, scoring change, or new collection cadence is authorized by this record.

## Context

NOAA permanently ended S-NPP data at 2026-11-02 15:40 UTC. NASA FIRMS also marks its coverage end as November 2. The existing production watch requests S-NPP, NOAA-20 and NOAA-21. HTTP-success empty S-NPP CSVs cannot establish current satellite coverage. The promoted September 5 baseline aggregates all three satellites, so silently comparing two-satellite totals with it is invalid.

Sources:
- [NOAA cessation notice](https://www.nesdis.noaa.gov/news/update-4-cessation-of-suomi-national-polar-orbiting-partnership-s-npp-data-users-november-02-2026-1540-utc-and-decommissioning-issued-november-2-2026-1800-utc)
- [NASA FIRMS VIIRS coverage](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)

## Decision

1. Add only the diagnostic category source_retired. Existing categories/assertions remain; retired current-window requests record zero attempts and zero retries. Historical request windows ending before retirement retain the existing route.
2. Keep the two existing NOAA sources and genuine aggregates. Missing/retired requests or a changed configured source set suppress baseline comparisons and repeated/elevated counts, with existing partial/source_unavailable state vocabulary. No new sensor or proxy source is introduced.
3. Reject missing, duplicate or changed source declarations from the three-source cohort, including legacy artifacts. The health-gate synthetic fixture now explicitly names its unchanged three sources; no existing assertion is removed. Quarantine all observations at/after retirement from the existing three-source sample cohort, including previously recorded HTTP-success artifacts. A separately reviewed source-set contract and facility baseline must precede any future two-source promotion. Existing baseline files, thresholds and historical data remain untouched.
4. Display actual snapshot time and degraded state. A snapshot older than its declared query window is historical reference, not current no-anomaly evidence. Source transition, missing data and partial coverage are unknown in cross-confirmation. Baseline maturity is not current-source health.
5. Reuse the existing shippingFreightDisplay in ODP's existing transport-readiness item, retaining per-index observation dates/fallback disclosure. BDTI/BCTI are broad oil-tanker indices; BDI is dry bulk. No route quotes or freight confirmation is connected.

## Consequences and checks

This is a conservative observation hold, not a complete two-source baseline migration. NOAA measurements remain visible; source_retired counts are logical unavailable requests, not network attempts. The numeric model and production files are unchanged. Dedicated tests cover retirement boundaries/history, zero requests, no retries, incomplete coverage, source-set changes, synthetic positive controls, old artifact quarantine, stale/future/missing display and freight missing-vs-zero boundaries. Full check:all and independent review are required before integration; publication remains a separate approval.

PortWatch's official service root and table currently disagree: table0 metadata and a one-row query return ArcGIS 400 Invalid URL before date parsing. No verified replacement is available. Preserve last-good and its original observation date; do not change URL case, bypass failures, or relabel AIS activity as freight rates.

The frontend remains within DESIGN.md sections 2–6 and 8: existing paper tokens, typography, DOM and readiness grid; no added card/section/style or scoring input. 本 PR 符合 DESIGN.md 的所有规则。
