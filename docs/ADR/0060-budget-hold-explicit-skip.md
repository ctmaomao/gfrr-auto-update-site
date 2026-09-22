# ADR-0060: Pre-network search budget holds are explicit editorial skips

## Status

Owner-authorized implementation on 2026-09-21, after the `Macro Risk Editorial Refresh` failure investigation, as the approved follow-up to PR #412. Independent review remains required before merge. This amends only the readiness/expected-skip clause of [ADR-0059](0059-tavily-runtime-budget.md); every other ADR-0059 clause, including the ledger, the rolling limits, the atomic reservation and the no-refund rule, is unchanged. No paid search, subscription, provider-frequency change or loosened credible-news threshold is part of this decision.

## Context

`Macro Risk Editorial Refresh` failed at step `Build compact editorial evidence pack` on run `35552064845` (commit `23328fd`), and on every admitted run from 2026-09-17. The read-only budget probe recorded account use `planUsage 1007 / planLimit 1000` with pay-as-you-go disabled, so `scripts/lib/tavily-budget.mjs` refused all six Tavily queries **before any network request** (`tavily_budget_account_limit` for the first query, `tavily_budget_session_stopped` for the rest). Brave answered all six queries, but every surviving story was `discovery_only`, so `credibleCount` stayed 0.

ADR-0059 requires both search providers to be healthy before zero credible news may become an expected skip. A self-imposed budget hold was therefore reported as `news_source_health_incomplete` — textually indistinguishable from a broken index — and the workflow stayed red for the remainder of the billing period. The failure message handed to reviewers was the compact-input validator's `input requires at least one official or cross_checked news story`, which named a symptom and hid the cause.

A pre-reservation budget gate was considered and **rejected on evidence**. Run `35482258943` (2026-09-20) refreshed successfully with `tavily=error` and `liveProviderCount=1`; its only credible story came from Brave (`federalreserve.gov`, `official`). Because `credibleCount` counts `official`/`cross_checked` evidence independently of which provider produced it, refusing a run before collection would discard refreshes that Brave alone can complete.

## Decision

- A search failure raised by this repository's own guard **before any provider request** (`tavily_budget_*`) carries no information about index or source health. When zero credible news survives, it is classified as an explicit expected skip: reason `search_budget_exhausted`, reported as `SKIPPED_SEARCH_BUDGET_EXHAUSTED`.
- The downgrade applies **only** when every unhealthy provider is budget-held. Any real provider failure in the same collection — HTTP 4xx/5xx, timeout, malformed payload, unclassified error, or a provider that never ran because its key is absent — keeps `news_source_health_incomplete` and the hard failure.
- Zero credible news with both providers healthy remains `no_credible_news`. A collection with at least one `official` or `cross_checked` story is unaffected, including the Brave-only path proven by run `35482258943`.
- **No pre-reservation gate is introduced.** Collection still runs, no DeepSeek call and no production write occur on a skip, and the durable day/input ceiling is unchanged.
- Provider diagnostics stay bounded and classified. `sourceStatus` remains outside the validated discovery contract and is re-guarded before it may reach logs or step summaries.
- Scoped to the Macro Risk editorial path. `scripts/bubble-watch/weekly-editorial-news.mjs` keeps its current behaviour; applying the same rule there is a separate decision with its own assertions.
- The dedicated `Tavily Budget Status` workflow stays **manual-only and read-only**. This ADR does not add a schedule to it and does not change its exit semantics.

## Consequences and verification

Budget exhaustion no longer raises a red workflow. The operator-visible compensating signals are the daily `::warning`, the explicit skip classification and step summary, the uploaded discovery artifact, and the unchanged manual read-only probe. Hard-failure coverage is **preserved, not weakened**: the source-health hard-failure assertion in `scripts/check-macro-risk-editorial-core.mjs` and the malformed/HTTP-432 cases in `tests/unit/macro-editorial-discovery.test.mjs` all remain, and new assertions state positively that a budget hold becomes a skip and that a budget hold may never mask a real provider failure. No assertion is deleted or relaxed by this decision.

**Residual risk, accepted and named.** With no failing run, an exhausted account can hold the refresh for the rest of the billing period; the only in-repo signal is a warning and a summary that a human must read. The reader-visible effect is that the AI editorial panel fails closed and disappears once its freshness window lapses (`scripts/modules/renderMacroRiskEditorial.js` requires `freshness.isStale === false`), leaving the deterministic overview — and readers cannot distinguish "not refreshed" from "never present". This is the same gap already tracked as the audit follow-up「外部额度耗尽的用户可见「来源降级」状态，避免静默缺失」, with PR #411 as precedent on the ODP news path.

**Alert channel is deliberately left undecided here.** A schedule on `tavily-budget-status.yml` would **not** by itself produce an alert: ADR-0059 defines quota exhaustion as a *successful* verification of a hold, so that workflow exits 0 while the account is exhausted and fails only on unavailable or malformed state. Turning it into an alert requires a new required-eligibility mode plus a schedule, which reverses part of ADR-0059 and needs its own reviewed decision. Until then, no active alerting on budget exhaustion exists, and that is a known limitation of this ADR rather than an oversight.

## Rollback

Reverting this ADR restores the previous classification and the red workflow for budget-held refreshes. It does not touch the ledger, the reservation history, the account state or any provider frequency, and it must not be used to disable budget enforcement.
