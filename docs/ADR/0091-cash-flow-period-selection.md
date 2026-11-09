# ADR-0091: Qualify complete, dated cash-flow concepts before aggregation

- Date: 2026-11-09
- Status: Local implementation and independent AI review complete; coordinated integration and production refresh verification pending.
- Scope: Existing SEC companyconcept and StockAnalysis quarterly cash-flow sources for Big5 capex/OCF and hyperscaler capex YoY only.

## Acceptance baseline

The owner requested implementation of AI financing and cash-flow reliability improvements after first checking stable data availability, without expanding the page to fill a checklist or inserting unbacktested score thresholds. This patch corrects an existing accounting-input defect. It does not add financing/debt-maturity indicators, sources, dependencies, scoring rules or thresholds. Local implementation and offline checks are in scope; push, merge, deployment and any production generation remain coordinated separately.

## Defect and independently replayed evidence

On main `c59cc4b1`, `edgarConcept` returns the first tag with any USD facts. Amazon's PP&E concept ends at 2017-03-31, while its ProductiveAssets concept contains current cash purchases. The Big5 builder then intersects OCF and capex end dates and silently selects the old eight quarters. Its published AMZN values are OCF $17.5B/capex $7.4B, despite a 2026-11-02 fetch date. The self-audit replays that arithmetic but cannot establish the source period's fitness.

Independent requests to the same 20 existing SEC concept endpoints on 2026-11-09 returned 13 concept payloads and seven 404s. Original USD facts disclosed by 2026-11-02 were retained in `tests/fixtures/bubble-watch/sec-cash-flow-20261102.json`, with each exact source URL and full-response SHA-256. No future filings were admitted. A separate read-only request to the existing Amazon quarterly mirror on 2026-11-09 returned HTTP 200 and independently reproduced OCF $168.300B/capex $215.192B. Its original fact-row excerpt and response SHA-256 are preserved in `tests/fixtures/bubble-watch/amzn-quarterly-cash-flow-mirror-20261109.html`; the current page uses separate operating/investing tables, so their periods are parsed independently and then required to match. This single successful read demonstrates current accessibility, not sustained availability.

| Company | TTM period end | OCF USD B | Cash capex USD B |
|---|---|---:|---:|
| AMZN | 2026-09-30 | 168.300 | 215.192 |
| MSFT | 2026-09-30 | 195.878 | 135.921 |
| GOOGL | 2026-09-30 | 179.551 | 159.804 |
| META | 2026-09-30 | 133.087 | 104.438 |
| ORCL | 2026-08-31 | 46.940 | 75.660 |

The corrected sum is OCF $723.756B and cash capex $691.015B, or 95.476237848%. Two companies exceed 100%, rather than the published one. The published 84.336457862% already yields red; correcting these inputs does not itself change the red-light count or score. Four-company capex is $615.355B versus $329.758B, +86.608058030%, still yellow under the unchanged acceleration rule. This is a date-qualified accounting replay, not a prospective risk backtest or a claim that every company has the same fiscal year end.

## Decision

1. Keep the general `edgarConcept` behavior unchanged for unrelated consumers. Add a dedicated cash-flow collector that fetches each already-approved candidate once per build, with existing timeout/UA/HTTPS behavior and no retry or paid fallback. Reuse responses across the two affected builders.
2. Qualify each concept independently. Admit actual 10-Q/10-K disclosures and amendments available by the run's date, use the latest filing per original start/end pair, and derive quarterly values only from adjacent cumulative disclosures sharing a fiscal start. Never stitch tags. Conflicting facts and direct-quarter/cumulative differences reject the source rather than silently choosing a basis.
3. Require two complete consecutive four-quarter windows. Preserve exact starts/ends, require finite amounts and nonnegative SEC cash capex, and use the newest disclosed end, not the latest convenient complete subset. Reject a newer incomplete concept rather than backdating to an older concept. Conflicting overlapping facts remain a blocker even when an alternative concept lacks eight quarters.
4. Enforce a trusted maximum period age of 120 days, consistent with the existing quarterly revenue qualification convention. This is an input-quality ceiling covering quarterly cadence plus filing delay, not an empirically calibrated financial-risk threshold. Day 120 is admitted and day 121 rejected; fetching or re-filing historical data cannot reset age. A source returning only an old but still in-window quarter cannot prove that no newer filing exists; the gate is not a full submissions-based latest-filing audit.
5. Require all eight OCF/capex start/end pairs to match for each Big5 company. Do not intersect to an older common history. Five-company coverage and existing aggregate formulas remain required.
6. Apply the same dates, contiguity, finite-number and USD-scale tests to the existing mirror. Preserve cell position rather than filtering nulls. Retain each company's latest SEC period observed even during a failed attempt; the mirror may not fall below that floor. If SEC is unavailable without any period evidence, a properly dated mirror may still qualify under the same age limit.
7. Store original periods, selected tag/row, URL, facts and freshness in provenance. Set the indicator's observation date to the oldest participating company's selected period end; keep `fetchedAt` as retrieval metadata. No claim of comparable fiscal year ends across companies is introduced.
8. Preserve the dated curated fallback and all existing score/unknown/stale semantics if both live paths fail. Do not update curated values or historical production JSON by hand. Do not alter existing checker assertions or grant legacy records a new proof.

## Review and validation

The new offline suite is wired into `check:bubble-watch` and therefore `check:all`. It covers the original five-company facts, Amazon's discontinued tag, the actual two builder paths, cache/request bounds, 120/121-day boundaries, missing quarters, null/zero values, wrong identity/currency, incomplete latest concepts, alternative-concept conflicts, cumulative/direct conflicts, exact OCF/capex alignment, mirror fallback dates and the SEC-to-mirror period floor. Independent review found three P2 edge cases (cross-source backdating, incomplete alternative conflicts, direct-quarter masking); all have dedicated regression cases and are corrected in this candidate.

Final local validation: check:changed/check:all exit 0; source regressions 17/17; full unit coverage 1,617 pass, one existing skip, zero fail. New helper/test ESLint is clean; the builder has the same 12 pre-existing findings as the baseline and no new findings. Independent AI review has no remaining P1/P2 and is not a human approval. Self-audit confirms the narrow source scope, unchanged score and checker assertions, and no new skip/ignore list. Results and handoff are recorded in the current [project backlog](../PROJECT_BACKLOG.md). These tests do not run the full builder, call a provider, refresh production or replace the required integration review.

## Natural-refresh acceptance

After coordinated source-code integration and exact-commit CI, inspect the next authorized normal full Bubble refresh. It must publish selected tag/period evidence, use current date-qualified facts, retain five-company coverage or the existing explicitly dated fallback, and expose the actual oldest period end. The qualified-only four-source workflow does not refresh these two indicators and cannot validate this fix. Verify both hosted data copies and stale/failure handling without manually rewriting JSON or triggering paid AI/search. No successful production refresh is claimed by this local patch.
