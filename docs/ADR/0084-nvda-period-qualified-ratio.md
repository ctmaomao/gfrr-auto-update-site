# ADR-0084 — NVIDIA period-qualified commitment / revenue evidence

- Date: 2026-11-04 (UTC)
- Status: Owner-authorized local implementation; independent contract review and separate publication approval pending
- Scope: NVIDIA input eligibility and display, not a new score or a change to weights, light thresholds, denominator or source rights.

## Context

At main `a8bffc7e`, the published card shows approximately 1145% using $125B commitments and $10.918B revenue. Its recent receipt date does not establish recent revenue periods. The configuration also contains a newer November 1 text ledger, while the old parameter is dated June 7. Neither the cumulative commitment total nor a fresh date establishes a same-period, same-basis numerator. Guarantees, collateralized debt, future intentions and signed equity commitments are different measures.

The owner authorized integration that shows unknown/incomparable when comparability cannot be established. This is a narrow additional eligibility decision, explicitly exposed here because the r5 registered-gap checker changes. Existing check assertions, allowed gaps for other cards, formulae and source qualification thresholds remain intact. This is not hidden inside a presentation-only patch.

## Decision

1. The full active r5 build inspects the numerator before requesting revenue. A newer dated fallback ledger prevents an older parameter from replacing it. Text is never parsed into a new commitment amount. Missing/invalid/future/stale/unreviewed or mixed-basis records hold.
2. A future eligible structured numerator must explicitly declare USD/NVIDIA, exact period, accepted dated review, signed customer equity commitments in that period, and exclusions of guarantees and collateralized debt. Unique signed records must have positive amounts, dates within the period, official SEC/NVIDIA HTTPS references and an exactly replayed total. Existing 30-day ledger policy is read from the configuration; no current qualifying records are invented by this patch. A review marker alone is not independent verification of source truth or completeness; source/coverage review remains necessary before populating these records.
3. Revenue must identify NVIDIA/USD and an existing registered SEC companyconcept endpoint or quarterly income mirror. Four adjacent dated quarters must span a fiscal year (350–380 days), retain exact period boundaries and raw amounts, and end no more than the existing 120-day financial-observation limit before the audit date. Filing/retrieval time cannot renew an old period. Cumulative YTD amounts are differenced; a missing latest quarter, conflicting filing, unknown scale, gap, future filing or wrong issuer holds. The mirror requires a fifth dated quarter-end to establish the first start. A rejected old SEC concept may fall through to the next existing revenue concept.
4. Both periods must exactly match before dividing. The same existing strict `>30%` red / `>15%` yellow thresholds apply. This is a scale comparison of eligible commitments and revenue, not paid cash, causation, circular-revenue proof, or a crisis probability. Record replay checks arithmetic, period, source identity and light consistency.
5. When evidence is unavailable, only `nvda_invest_revenue` in r5 may use `nvda-period-aligned-ratio-v1` / `nvda_comparable_commitment_revenue_evidence_unavailable`, with `status=unknown`, null observation/ratio, false current eligibility, a same-issue actual check timestamp and explicit reason. It retains its Core-23 slot. The unchanged endpoint-completion formula produces uncertainty bounds; no smaller denominator or green substitution. Revisions 1–4 and other unregistered gaps remain rejected.
6. Historical/qualified-refresh-only carry remains byte-preserving for non-target cards under ADR-0083. No NVIDIA fetch or source-scope expansion enters that four-source workflow. Existing published data stays readable for audit. The page marks its legacy ratio unqualified and keeps the published lights/counts/scores with a prominent caveat; the browser never changes those scores. A later authorized full refresh is required to publish a new NVIDIA gap.

## Display clocks

Reuse the existing 35-day issue, recorded per-card maximum ages and 36-hour snapshot display policy. Missing policy/date is unknown; a newly published issue does not renew an old observation. Timers and foregrounding recheck age and expired AI eligibility without fetching or scoring. World Order shows snapshot and Events-window dates, partial/source states, historical/invalid/missing identity. Tail warnings distinguish missing, invalid and valid empty records; their unregistered expiry stays explicit. OFR's own qualification and no-overlay boundary stay unchanged.

## Consequences and verification

This deliberately withholds a current numeric NVIDIA ratio until comparable evidence exists. It does not certify the current text ledger or replace it with a researched total. No source credentials, retry policy, provider calls, production JSON, workflow, dependency or scoring weight changes are included.

Unit regressions cover period/issuer/unit/age/arithmetic failures, stale SEC tags, newer-ledger protection, narrow gap admission, fixed denominator, inline/helper parity and independent dates. Browser regressions cover legacy and new-gap display, long-open issue/card expiry, bad JSON and 1440/390px layouts. Full project checks and immutable evidence are required before the local delivery; independent review and separate release authorization remain pending. See [the integration report](../RADAR_INTEGRATION_2026_11_04.md).
