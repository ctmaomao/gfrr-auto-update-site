# ACLED automatic XLSX update and recovery

## Scope

[ADR-0055](ADR/0055-acled-weekly-automation.md) defines the protected automatic
chain; [ADR-0056](ADR/0056-acled-split-cadence.md), implemented by PR #402,
sets the current Monday/Wednesday/Friday 00:30 UTC cadence. Monday collects six
weekly and six monthly files (at most 26 requests); Wednesday/Friday collect only
the six weekly files (14 each), retaining the exact monthly baseline bytes.
The weekly ceiling is 54 requests. The sole initial slot is already spent.
The exact reviewed workflow is `acled-auto-update.yml`, using existing account
Secrets; no HAPI/API replacement or additional catch-up budget is implied.
This document describes implementation; actual initial and site acceptance must
be recorded separately, not inferred from tests.

The command `node scripts/run-acled-auto-update.mjs --dry-run` performs no I/O.
A whole workflow dry-run still checks out code and installs locked dependencies;
it is **not** zero network or zero filesystem activity. No ACLED access occurs.

## Normal chain

1. Verify main/origin, clean checkout, pinned pair and execution context.
2. Query and atomically create a permanent `acled-auto-attempt-v1/initial` or UTC
   schedule-date tag before login (Monday keeps its old key). Existing, failed or ambiguous claims stop. Manual
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
The refresh retains the stable `Refresh World Order Stress` name used by existing
completion listeners. The API-returned run ID is the primary receipt; a display
title is not an identity proof. After a dispatch uncertainty, inspect the bounded
dispatch-time/main run window and compare all three receipt inputs in the matching
run's verification-step log before any recovery. Never select an arbitrary latest
run or send another event until the uncertain outcome is resolved.

## Initial live receipt (2026-09-18)

Acquisition [35290763672](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/35290763672)
completed with 26 requests, all 12 files HTTP 200, confirmed login/logout and
private cleanup; no original files were retained. Its permanent initial slot is
spent. The earlier preflight-only 35289495733 made zero requests and no claim.

- Config commit: `25619ed575f4b902fe2127b8989c13256437a1d8` (exactly two config files).
- Weekly: 6 files / 991218 rows / 2026-09-05;
  SHA256 `6c7b4c34c3f9863a23c86500f3e63753891f41fee77c822dfdf3c8482dbc5f30`.
- Monthly: 6 files / 43588 rows / 2026-09-11;
  SHA256 `f2890327957a99f05099ddb4dd7a52bc21457185a8aed1bd03af091ab69188c2`.
- Both inputs report `preparedBy=github-actions-acled-auto`.
- Automatic refresh [35290886868](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/35290886868)
  passed receipt/projection/full checks and pushed `4d589e98`, then dispatched
  EdgeOne run 35291164534. Configuration/refresh success is not both-site proof.
- EdgeOne 35291164534 succeeded. Custom-domain HTTP 200 readback matched the
  exact `4d589e98` JSON bytes (SHA256
  `a61f0ff3b65adc2cd1a4277842989392189da7533830ceb40026f3bafcb8030a`);
  Pages still served the old weekly/monthly dates at that check.

Pages did not appear in the bounded completion window. The run API exposed the
new dynamic run title as `name`, unlike its stable listener name. Removing that
dynamic name is a minimal compatibility repair, not a proven platform diagnosis;
verify by a source-free refresh with the original receipt. Final recovery and
two-site acceptance belong in the repair PR receipt; never redownload this batch.

### Current acceptance after recovery

PR #400 completed the source-free recovery and two-site acceptance; the initial
Pages mismatch above is a historical receipt, not a current pending task.
The 2026-09-18T03:59:50Z bounded publication probe again found both World Order
files identical to main `8f63fa23`, with no delivery error. No ACLED request was
made by that probe.

Split-cadence PR #402 is merged. Run 35300766848 is a successful **dry-run**, not
a live scheduled acquisition. As of this review, no new split-cadence natural
run receipt exists; the first next nominal slot is Monday 2026-09-21 00:30 UTC.
GitHub schedules can be delayed. Verify mode/request count, permanent date claim,
logout/cleanup, no-change or exact publication receipt, and both-site projection
after a natural slot. Do not repeat the spent initial run to manufacture proof.

## Publication uncertainty

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
