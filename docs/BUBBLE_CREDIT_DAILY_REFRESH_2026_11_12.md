# Bubble independent credit-history cadence

## Implemented scope

The existing `credit_spreads` display snapshot is refreshed Tuesday–Saturday at 06:20 UTC and on manual dispatch through `Refresh Bubble Credit Spreads`. It uses the already configured ICE BofA HY, CCC and investment-grade observations from public FRED CSV. The collector starts exactly three requests, each with a 12-second deadline covering headers and streamed body, no redirects or application retries, and a 64 KiB decoded response cap. No API credentials, paid provider, search, SEC collection or DeepSeek call is supplied. Existing publication enablement and recorded source-policy choice remain mandatory; the user's risk acceptance is not a claim of an ICE licence.

The existing writer permits only `data/bubble-watch.json.credit_spreads` to change. It retains all other fields exactly, including package date, generation time, 27 indicators, score, history seed and current/previous AI narrative. The external Bubble history file is untouched. The page already displays this separate section with individual observation dates and fallback status; the refresh does not make the weekly score, quarterly evidence or AI article current.

The shared main-writer queue, clean main sync, full `check:all` before commit, normal fast-forward-only push and guarded EdgeOne publisher are retained. Pages explicitly listens for this workflow’s successful completion because bot-token commits do not trigger ordinary push workflows. The workflow name is not a trigger for paid weekly editorial generation. A collector failure preserves validated prior points and their fetch dates; missing/invalid prior history blocks the existing writer instead of publishing fabricated values. HTTP success with old observations is explicitly stale. A regressing source cannot replace newer cached history. FRED publication lag, holidays and GitHub scheduling delays remain visible limitations, not realtime promises.

## Why not update the whole Bubble package daily?

A read-only replay of the 2026-11-10 production issue passes on its original date. Relabelling it 2026-11-11 fails five score/evidence checks, plus insider rolling-window and Fed calendar/quote proofs. Updating those old clocks would falsely claim a new collection. Keeping the old full-package date while replacing scoring indicators would also misbind score and evidence dates. These gates are unchanged.

A broader separate market observation layer could have useful independently dated CAPE, SPY concentration, NVDA forward PE and aligned SPY/RSP returns. It needs a reviewed display contract and strictly bounded source allowlist, not reuse of the full builder. Breadth must not invoke its roughly 500-symbol fallback daily. The technical panel needs a unified common observation endpoint and explicit age qualification first. Any later daily *overall score* requires an independently reviewed per-indicator evidence-carry contract, including expiry, immutable source-clock proof, score/history replay and old-narrative treatment.

## Publication race handling

The shared main-writer queue serializes Actions writers but not PR merges. After both
independent collectors and the full production check succeed, the Bubble credit
publisher accepts a one-parent candidate changing only `data/bubble-watch.json` and/or
`data/bubble-market-observations.json`, with both present as regular files. If main
advances only through ordinary-file changes under `docs/` or `tests/`, it places the
same candidate on the new main in a separate worktree, runs `check:all` again, and
verifies the exact bytes of both outputs. Any other path (including either output),
non-regular concurrent file, divergent base, or validation failure holds publication.
At most three ordinary fast-forward push attempts; no force push, new source
requests, or candidate artifact. A successful no-change run still requests the
existing guarded EdgeOne publisher; a failed publication does not.

On [2026-11-19's run](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44559192493)
both collectors and checks passed, but a plain push of runner-local `d4e3b60b` was
rejected after [#691](https://github.com/ctmaomao/gfrr-auto-update-site/pull/691)
advanced main. That PR also changed a `scripts/` path, so it would not qualify for
automatic replay even if the original candidate bytes were available. The failed
run retained no artifact. Do not infer the candidate from logs, reconstruct it,
or use a new fetch as recovery evidence.

## Acceptance and operational limits

Tests exercise the actual existing writer with injected in-memory files: permitted mutation, dry-run, publication disabled, invalid series and concurrent modification. Collector regressions cover request count, blanks versus genuine zero, malformed/duplicate/future dates, strict two-column UTF-8 CSV (including blanks, BOM and CRLF), oversized/stalled or redirected responses, stale success, per-series outage, missing baseline and date regression. Workflow guards require serial publication and full validation, and prohibit credentials, broad builder or paid-editorial triggers.

Code merge and schedule activation are not proof of a successful production refresh. Confirm the natural run's commit and both public sites' `credit_spreads` dates/statuses before claiming updated data is live. Do not regenerate the full weekly issue just to make its date match this section.
