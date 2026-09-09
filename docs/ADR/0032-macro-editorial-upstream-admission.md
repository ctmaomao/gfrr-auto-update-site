# ADR-0032: Macro editorial upstream completion and durable admission

- Status: Owner-authorized implementation; independent merge review required.
- Date: 2026-09-09.
- Approval: Owner approved one existing production refresh, then upstream-completion integration with duplicate paid-call prevention. Prior task authorization covers commit/push and independent AI review/merge; cost and source gates remain separate.
- Scope: Refines ADR-0022's once-per-cycle scheduling, not its evidence, visibility or non-scoring contract.

## Context

Daily `34294949295` replaced the radar snapshot at 00:25 UTC. The previous valid editorial referenced the prior Daily snapshot and was not carried into the new one. Independent cron execution had actually started around 04:25 UTC on both preceding days, leaving a multi-hour morning gap. Changing a clock expression alone cannot guarantee order. The authorized one-call recovery `34305832339` succeeded and wrote `1cc123d1`; Pages `34305911160` and EdgeOne `34305985797` succeeded, with both live layers valid and timestamp-aligned.

## Decision

1. Replace Macro Risk's independent cron with completion events from Daily, World Order and ODP. Accept only successful, first-attempt, scheduled runs from the same repository's main branch and exact workflow paths. Manual upstream refreshes, forks, failures, replayed attempts and unrelated events do not authorize AI expense. Always execute trusted latest-main code, never an upstream artifact or checkout.
2. Under the existing global main-writer serialization, verify the triggering run and each latest scheduled upstream through bounded GitHub metadata reads. All must be successful and recent; no fallback to an older success. Radar/World/ODP snapshot timestamps must be fresh and at least as recent as the associated run start; World and ODP must not predate the current Daily snapshot. An early event waits without reserving budget. A later eligible completion can admit the cycle. Out-of-order/stalled upstreams remain an explicit hold, not a guarantee of availability.
3. Before any Tavily/Brave discovery or DeepSeek call, reserve two create-only Git refs: `refs/tags/macro-editorial-budget/v1/day-YYYY-MM-DD` and `refs/tags/macro-editorial-budget/v1/input-<sha256-of-canonical-Daily-updatedAt>`. Both point to the checked main commit. This caps attempts to one per UTC day and one per Daily input, across manual and automatic triggers. A current input already containing an editorial also skips, including pre-migration manual successes.
4. Only two confirmed HTTP 201 reference creations allow the pipeline. Existing refs, race collisions, uncertain POST responses, metadata failures or partial reservation fail closed. Never retry, overwrite or delete refs automatically. Reservations are conservative attempt markers, not evidence of provider success; even discovery failure/no-credible-news or pre-provider cancellation consumes that reservation. They are metadata only, not release tags, do not alter production JSON, and require no new secret or dependency. Existing `contents: write` is reused.
5. Manual dispatch still requires both network and cost acknowledgement and cannot bypass these ceilings. A retry within a reserved day/input requires separately reviewed, exact-scope owner recovery; do not erase tags or falsify timestamps merely to retry. Ordinary later fresh Daily cycles do not need manual unlocking. Ref retention is indefinite; any cleanup requires an explicit recovery/retention plan because it can remove duplicate protection.
6. GitHub metadata traffic has a maximum of 10 requests, each with a 10-second full-body deadline and 1 MiB limit, no redirects/retry, fixed repository/host and redacted errors. No provider token is exposed to admission. Manual/local dry inspection cannot reserve without explicit `--reserve`; runtime also requires Actions context and first attempt.
7. Keep all source/quality/freshness checks and the seven provider-through-commit readiness conditions; strengthen them with admission. Only the obsolete cron assertion is replaced, with corresponding negative/positive tests. Add successful Macro Risk completion to EdgeOne release triggers; preserve full checks, no-change skip and release quota. Pages already listens to the same completion.

## Verification and limits

Offline tests cover event identity, missing/future/stale input, incomplete or superseded upstreams, manual acknowledgement, existing output, day/input duplicates, concurrent ref collision, partial/ambiguous reservations, bounded/redacted metadata calls and dry-run behavior. Full project checks and independent exact-head review are required. The current one-call recovery proves the existing generation/publication chain; it does not prove a future natural event or GitHub-token reservation. Do not trigger new paid calls just to manufacture that acceptance.

Rollback is a reviewed revert of workflow/admission integration; keep reservations and existing data. Re-enabling the old cron alone removes the new budget protection and is not an automatic rollback action.

## API evidence

- [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run): completion chaining and trusted-workflow security considerations; schedule can be delayed.
- [Git references REST API](https://docs.github.com/en/rest/git/refs#create-a-reference): create-only references, write permission and 201/422 outcomes. A 422 is not assumed to mean a harmless duplicate; admission remains closed.
