# ACLED automatic XLSX update and recovery

## Scope

[ADR-0055](ADR/0055-acled-weekly-automation.md) and policy PR #397 authorize one
new initial run and a Monday 00:30 UTC run each week. The exact reviewed workflow
is `acled-auto-update.yml`. It collects six weekly regional and six monthly-chain
files using the existing account Secrets; no HAPI/API replacement is implied.
This document describes implementation; actual initial and site acceptance must
be recorded separately, not inferred from tests.

The command `node scripts/run-acled-auto-update.mjs --dry-run` performs no I/O.
A whole workflow dry-run still checks out code and installs locked dependencies;
it is **not** zero network or zero filesystem activity. No ACLED access occurs.

## Normal chain

1. Verify main/origin, clean checkout, pinned pair and execution context.
2. Query and atomically create a permanent `acled-auto-attempt-v1/initial` or UTC
   Monday tag before login. Existing, failed or ambiguous claims stop. Manual
   `execute_initial=true` can never mint a second initial slot.
3. Reuse bounded session collection, confirmed logout, private validation and
   cleanup. A failure does not return partial files or candidates for publication.
4. Label `preparedBy=github-actions-acled-auto`, retain legacy schema IDs and
   attribution, compare exact baselines, run strict paired preparation and publish
   using `expectedHeadOid`. No-change skips mutation and refresh. Date regression,
   invalid content, cleanup failure or changed main preserves prior configs.
   The comparison's regional-date check follows the sanitizer: every regional end
   is at most `latestWeek`, and their maximum equals it. Regions may genuinely lag;
   no dates are shifted to manufacture a common cutoff. Existing common-window and
   freshness validation remains in the unchanged sanitizer/strict content checkers.
5. Explicitly dispatch World Order with config commit and both SHA256 values.
   GitHub API version 2026-03-10 returns the exact run ID/URLs; never guess the
   run by querying the latest job. No dispatch retry after an uncertain response.
6. World Order verifies ancestor and pair hashes before generating; verifies the
   full local ACLED source projection before committing. After successful push,
   dispatch EdgeOne with its existing no-change/quota guards. Pages retains its
   existing successful World Order completion listener. Scheduled World Order
   without an ACLED receipt keeps its prior behavior.

The acquisition job releases its main-writer queue after dispatch; it does not
wait for another job holding the same queue. Download credentials never enter
refresh/deployment jobs. Git subprocesses used for pair admission are credential-
free. Original rows, cookies, passwords and full candidate JSON are not logged,
uploaded or cached. Runtime `fetch-acled.mjs` still reads local JSON only; automatic
evidence labels do not misrepresent it as a manual import.

ACLED budget is 26 requests, 15 seconds each, zero retries/redirects, with the
existing byte/ZIP/row limits. Acquisition uses at most five separate GitHub
requests (claim 2, publish 2, refresh dispatch 1), <=64 KiB response each and
<=3 MiB publication request. The refresh job has one separately bounded EdgeOne
dispatch, no additional ACLED requests. Platform/dependency and existing World
Order/Pages/EdgeOne traffic is separate; no new paid AI action is introduced.

API references: [GitHub createRef](https://docs.github.com/en/graphql/reference/git#createref)
and [workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

## Status and recovery

`refresh_dispatched_site_pending` means configuration committed and dispatch
accepted, **not website verified**. Retain `receipt` and exact refresh run ID from
the sanitized Actions log. Deployment acceptance compares the deployed World
Order ACLED projection at both Pages and the custom domain to the published pair.
The existing published-snapshot monitor continues to check cross-site drift.

Do not rerun the acquisition job to repair refresh/deployment. In GitHub Actions,
open **Refresh World Order Stress**, run on main with the three receipt values:
`acled_config_commit`, `acled_weekly_sha256`, `acled_monthly_sha256`. This uses no
ACLED credentials or source requests; a newer/different pair fails before refresh.
After a dispatch uncertainty, first inspect its matching run title containing the
exact config commit; do not send another event until its outcome is resolved.

`publication_unknown` requires read-only comparison of main's two config bytes
against `candidateSha256` and expected parent before any recovery. If publication
is confirmed, recover only the downstream stages. Never delete or rename attempt
tags, use rerun to reclaim a spent slot, or treat a claim as proof of completion.
Unconfirmed logout requires account/session inspection; the log retains
`sessionMayRemain`. Disable the new workflow while investigating uncertain state.
Ordinary upstream failure keeps old data and its actual dates; the next separately
approved weekly slot is not a retry of the failed slot.

Source permissions remain as disclosed in ADR-0055: the owner's execution approval
is not a representation that ACLED separately granted website automation rights.
