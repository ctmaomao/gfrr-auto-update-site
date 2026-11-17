# ADR-0119 — Daily completion publication tail

- Date: 2026-11-17 (UTC)
- Status: Authorized implementation; independent review and release verification required.
- Scope: One existing producer listener; no collection, data, credentials or quota changes.

## Decision and evidence

Daily run `44018873993` committed `3bad022f` and Pages published it, while the
EdgeOne Macro-triggered run `44019497021` correctly skipped publication for an
uninitialized editorial budget. A later ODP completion restored parity, but did
not repair the missing Daily listener. As in [ADR-0114](0114-thermal-publication-completion.md),
append exactly `Build Daily Radar Data` to the existing six-name completion list.
Update exact checker/test expectations visibly, retaining completed/main/success
admission and all prior names. Daily uses normal publication admission, not Macro
budget evidence; Macro skip behavior remains unchanged.

Keep latest-main checkout and immutable checked SHA, full checks, allowlisted
artifact, serialized/non-cancelling publisher, no-change skip, 400 releases per
32 days, read-only source permission, separate release deploy key and three-hour
backup. No generic data push listener, forced publication or producer dispatch.
Extra completion checks may consume runner time; actual releases remain capped.

## Verification and recovery

Require producer-name/admission and existing negative, source-revision, late
checkout and quota regressions, full checks, unit coverage and exact-head CI.
After integration, inspect a natural successful Daily completion and its EdgeOne
run, checked source, release and both sites' bytes. A push-triggered deployment
or unrelated producer restoring parity does not verify Daily event delivery.
No manual collection or workflow dispatch is needed. Revert this one listener
and its exact expectations to restore previous batching if necessary.
