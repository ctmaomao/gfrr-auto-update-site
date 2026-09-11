# ADR-0042: Separate retained editorial expiry from new production acceptance

Status: Local implementation and independent AI contract review passed on 2026-09-11; integration authorization and remote CI remain pending.

## Context

Eleven failed Oil Thermal, Oil News and EdgeOne runs on 2026-09-10 reached the same full-suite failure: the optional Macro Risk editorial retained in radar-data.json exceeded 30 hours. Its frontend already hides it and opens the deterministic evidence. Applying a new-write freshness check to every unrelated publication instead blocked their updates. The earlier Daily stale-input failure is separately addressed by PR #335.

## Decision

Keep `validateEditorialProduction`, final writer revalidation, the strict `check:macro-risk-editorial-live` command and the producer workflow's `--require-layer` invocation unchanged. A new AI write must still pass the real current-time 30-hour gates, digests, grounding, source-data alignment and display-only boundaries.

The full suite invokes a distinct read-only retained-snapshot check. It first runs that same strict validator at the real inspection time. Missing optional data retains its existing optional status. Only when both recorded generation clocks are valid and older than 30 hours may it replay every existing validator assertion against unchanged bytes at the later of those recorded clocks. This checks historical structural consistency, not present freshness. It also requires the actual frontend visibility predicate to hide the layer now. Success is explicitly `expired_hidden` with a warning, never proof of a new AI refresh.

Invalid/future clocks, mixed fresh/expired clocks, clocks more than 30 hours apart, bad digests, broken references, source-data mismatch and all non-time defects still fail. No assertion is removed from the production validator; no timestamps, production JSON, frontend, scoring or workflow dispatch logic are changed. This is an explicit checker contract transition in a standalone ADR and review, not an ignore list or a blanket stale-data exemption. The replay cannot authenticate original generation time beyond existing digest/provenance guarantees.

## Verification and consequences

Use synthetic offline fixtures for exact 30-hour boundaries, long-retained history, corruptions and immutable input. Execute the real strict and runtime CLIs on identical expired bytes; strict acceptance must fail while runtime inspection warns. Test both desktop and 390px browser fallback using otherwise approved, enabled but expired editorial data. Keep existing producer tests and full checks.

Retained inspection permits unrelated publication while the AI overview is unavailable. It does not repair Daily freshness or create new AI content; operators still need successful natural Daily/editorial receipts for that. No paid retry or provider call is authorized by this decision. Main integration and affected workflow/deployment receipts are required before reporting the online incident closed.
