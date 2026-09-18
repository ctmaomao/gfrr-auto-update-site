# ADR-0057: Publish checked current main and preserve ODP delivery without AI

## Status and scope

Owner authorized the 2026-09-18 health remediation, serial commits/pushes and
independent AI review before integration. This is a separate publication change,
including explicit review of the workflow checker assertion. It grants no source
requests, DeepSeek calls, subscription changes or override of release limits.

## Context

Pages queued events can retain an older event revision while EdgeOne already
checks out current main. On 2026-09-18 ODP updated successfully but the subsequent
Macro editorial job failed on news discovery, so that editorial completion could
not trigger EdgeOne. The 03:59 UTC readback was still inside the existing four-hour
delivery grace, not proof of an overdue outage. The three-hour scheduled publisher
already covers every allowlisted data file; adding every writer trigger is unnecessary.

## Decision

- Pages accepts only main and successful upstream completions. After waiting in
  its existing serial queue, checkout current main, record the actual SHA, run
  unchanged full checks, verify the SHA is unchanged and build that checkout.
- Add only `Refresh Oil Directional Pressure` to EdgeOne's existing completed,
  successful, main-branch workflow list. This adds at most one scheduled wakeup
  per daily ODP run, independent of AI eligibility. Manual ODP runs remain subject
  to existing release protections. All three editorial triggers remain.
- Keep latest-main coalescing, three-hour fallback schedule, no-change no-op and
  400 releases per 32 days hard stop. Additional scheduled wakeups are at most 32
  per 32 days, not a new guaranteed or paid build allowance. Operators must not
  override the guard when manual/other releases consume the remaining capacity.
- Update the checker's exact list to include all old names plus ODP; remove no
  assertion and preserve failure/main, token, budget and artifact protections.

## Acceptance

Workflow checks plus regressions for the exact trigger set, main-only admission,
checked-source binding and unchanged quota/no-change behavior; full checks and
independent review. After integration, inspect the exact deployment run and
two-site hashes. No content freshness rule or scoring contract changes.
