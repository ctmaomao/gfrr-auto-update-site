# Bubble independent credit-history cadence

## Implemented scope

The existing `credit_spreads` display snapshot is refreshed Tuesday–Saturday at 06:20 UTC and on manual dispatch through `Refresh Bubble Credit Spreads`. It uses the already configured ICE BofA HY, CCC and investment-grade observations from public FRED CSV. The collector starts exactly three requests, each with a 12-second timeout and no application retry. No API credentials, paid provider, search, SEC collection or DeepSeek call is supplied. Existing publication enablement and recorded source-policy choice remain mandatory; the user's risk acceptance is not a claim of an ICE licence.

The existing writer permits only `data/bubble-watch.json.credit_spreads` to change. It retains all other fields exactly, including package date, generation time, 27 indicators, score, history seed and current/previous AI narrative. The external Bubble history file is untouched. The page already displays this separate section with individual observation dates and fallback status; the refresh does not make the weekly score, quarterly evidence or AI article current.

The shared main-writer queue, clean main sync, full `check:all` before commit, normal fast-forward-only push and guarded EdgeOne publisher are retained. Pages explicitly listens for this workflow’s successful completion because bot-token commits do not trigger ordinary push workflows. The workflow name is not a trigger for paid weekly editorial generation. A collector failure preserves validated prior points and their fetch dates; missing/invalid prior history blocks the existing writer instead of publishing fabricated values. HTTP success with old observations is explicitly stale. A regressing source cannot replace newer cached history. FRED publication lag, holidays and GitHub scheduling delays remain visible limitations, not realtime promises.

## Why not update the whole Bubble package daily?

A read-only replay of the 2026-11-10 production issue passes on its original date. Relabelling it 2026-11-11 fails five score/evidence checks, plus insider rolling-window and Fed calendar/quote proofs. Updating those old clocks would falsely claim a new collection. Keeping the old full-package date while replacing scoring indicators would also misbind score and evidence dates. These gates are unchanged.

A broader separate market observation layer could have useful independently dated CAPE, SPY concentration, NVDA forward PE and aligned SPY/RSP returns. It needs a reviewed display contract and strictly bounded source allowlist, not reuse of the full builder. Breadth must not invoke its roughly 500-symbol fallback daily. The technical panel needs a unified common observation endpoint and explicit age qualification first. Any later daily *overall score* requires an independently reviewed per-indicator evidence-carry contract, including expiry, immutable source-clock proof, score/history replay and old-narrative treatment.

## Acceptance and operational limits

Tests exercise the actual existing writer with injected in-memory files: permitted mutation, dry-run, publication disabled, invalid series and concurrent modification. Collector regressions cover request count, blanks versus genuine zero, malformed/duplicate/future dates, stale success, per-series outage, missing baseline and date regression. Workflow guards require serial publication and full validation, and prohibit credentials, broad builder or paid-editorial triggers.

Code merge and schedule activation are not proof of a successful production refresh. Confirm the natural run's commit and both public sites' `credit_spreads` dates/statuses before claiming updated data is live. Do not regenerate the full weekly issue just to make its date match this section.
