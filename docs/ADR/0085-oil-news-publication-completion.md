# ADR-0085 — Oil-news completion publication tail

- Date: 2026-11-04 (UTC)
- Status: Owner-authorized local implementation; fixed-patch independent review required; new remote publication approval pending
- Scope: Add one existing producer's successful completion to the existing EdgeOne publisher. No data collection, score, credential, retry, quota or platform permission change.

## Context

The November 3 oil-news mismatch was at main-to-release, rather than an unproven CDN cache problem. The publisher checked out an earlier main before the oil-news writer committed its new snapshot. Pages subsequently held the new main file while the custom domain matched the older release repository. An unrelated later publication restored parity but did not add the missing producer completion trigger.

`Refresh Oil News Event Watch` already commits to main and is already in the Pages completion list. EdgeOne listens to four other producers, and its push path filter intentionally excludes generic data changes. Its periodic backup can be delayed; it does not establish a post-news-completion publication tail.

## Decision

1. Append exactly `Refresh Oil News Event Watch` to EdgeOne's existing `workflow_run.workflows` list. Retain all four prior names, `completed`, main-only filtering and the successful-upstream job gate.
2. Preserve the latest-main checkout at job start, record the actual checked SHA before validation, and build/publish that immutable checked tree. Do not pull a newer revision after validation. A producer completion that arrives after an earlier checkout permits a subsequent publisher to see the committed news snapshot.
3. Preserve the three-hour backup, serialized/coalescing publisher, no-change skip, 400-release/32-day hard guard, read-only source token, separate release deploy key, full checks and allowlisted artifact. Do not add `data/**` push publication, queue source refreshes, or change the news producer's schedule or search budget.
4. Update the strict workflow/checker and cross-workflow test literals to the exact five-name list. This is a visible narrow admission change, not a relaxed assertion. Regression evidence must preserve success/main admission, old triggers, immutable attribution and all existing publication protections. A local Git fixture reproduces an earlier pinned snapshot and a later producer commit, then verifies a post-completion latest-main checkout.

## Consequences

The added completion can start another publisher check and, only when the artifact changes and the existing guard permits, one release commit. It does not run Tavily, Brave, DeepSeek or the oil-news collector. It cannot guarantee delivery latency during GitHub or hosting outages, a failed upstream run, a quota hold or another publication failure. Live source/release/two-site hashes remain the acceptance evidence after a separately authorized deployment.

The parallel NVIDIA work is an offline primary-source evidence audit, not a data-source admission or runtime change. Its incomplete numerator and disclosed revenue reconciliation difference cannot become a production ratio. See [the follow-up report](../NVIDIA_OIL_FOLLOWUP_2026_11_04.md).
