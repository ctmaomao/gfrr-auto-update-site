# ADR-0058: Retire the expired editorial recovery route

## Status and scope

Owner-authorized 2026-09-18 health simplification; independent AI review and CI
required before merge. Supersedes only ADR-0045's executable one-use exception.
Historical authorization, spent day/input/recovery refs and evidence remain.

## Decision

Remove the expired permit, its special reservation branch, unused radar digest
calculation and workflow recovery input. Nonempty legacy recovery IDs and old
recovery-shaped admission plans fail closed before any GitHub budget request,
including when supplied with the formerly authorized date and input.

Normal manual acknowledgements, upstream identity/freshness, one attempt per day
AND input, atomic reservation, uncertain-write retention and no retries remain.
No Git refs are deleted, renamed, refunded or rewritten; no provider calls occur.

The old successful-recovery tests no longer describe an executable permission.
Replace them explicitly with denial/zero-request regressions; keep the original
negative context matrix and all normal admission, collision, stale-input and
uncertain-response tests. This assertion change requires independent review,
not an unexplained skip or a relaxed production checker.

## Documentation

Preserve the dated backlog verbatim in the existing handoff archive, retaining
source-rights and historical approvals. Current backlog keeps live constraints,
open product items and a single current handoff. Synchronize the ACLED runbook
with already approved ADR-0056 and recorded two-site acceptance. Natural cadence
and prospective research still require elapsed real time; documentation cleanup
does not close those observations or grant new requests.
