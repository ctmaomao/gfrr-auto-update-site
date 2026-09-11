# ADR-0045: One additional editorial attempt for the 2026-09-11 input

Status: owner authorized; independent review and CI required before invocation.

The owner explicitly authorized one additional paid DeepSeek attempt today for the current input after failed run 34567451297 and prompt fix PR #348. This is a narrow exception to ADR-0032, not a reusable override or a refund.

## Fixed scope

- Manual main workflow dispatch only, run attempt 1, both existing network/cost acknowledgements, exact recovery ID `2026-09-11-input-recovery-1`.
- Daily `2026-09-11T00:21:21.451Z`; SHA-256 of `JSON.stringify(radar)` must equal `9a86808887b2ef1008615563fe33742297c0625429a436f9790405ec9330e5b1`. The CLI computes this from the actual file; callers cannot supply it as a workflow input.
- Admission window `[2026-09-11T06:00:00Z, 2026-09-11T16:00:00Z)`, ending at Shanghai midnight. All three snapshot freshness and existing-layer checks remain.
- Both original day/input reservation refs must still exist and point to failed attempt checkout `0663b6916d63aa179b3988eb3113247cc44b9b70`. Never delete, rewrite or refund them.
- Create exactly one separate durable ref `refs/tags/macro-editorial-budget/v1/recovery-2026-09-11-input-recovery-1` before discovery. A pre-existing ref, uncertain response or collision does not admit a call. Failure/skip consumes the token permanently.
- Retain single provider call, no retry, credible-news admission, output contract, quality review, provenance, 30-hour write/display protections and production path guard. No reused failure output or manual artifact promotion.

The exception expires automatically; future inputs, days and arbitrary IDs are rejected. Normal manual/scheduled paths keep the existing budget. Cleanup, if later requested, removes code only through a reviewed change; durable refs remain.

## Verification

Offline coverage checks success, ordinary budget preservation, duplicate/concurrent requests, bad ID/input/digest/date/context, original reservation failure, dry run and ambiguous create results. Full checks and one independent AI review precede the additional invocation. Record the actual run/result; authorization and green CI do not prove AI output acceptance.
