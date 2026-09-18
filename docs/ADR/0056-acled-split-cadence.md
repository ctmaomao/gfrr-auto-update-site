# ADR-0056: Separate weekly-file and monthly-file acquisition cadence

## Owner acceptance baseline

On 2026-09-18 the owner explicitly agreed to implementation of Monday, Wednesday
and Friday at 08:30 China Standard Time (00:30 UTC): Monday fetches the existing
six weekly plus six monthly inputs (at most 26 ACLED requests); Wednesday/Friday
fetch only the six weekly inputs (at most 14 each). The recurring weekly ceiling
is 54 requests, not three 26-request batches. Each request retains 15 seconds,
zero retry/redirect, private originals and failure-preserves-old-data behavior.
Commit/push, independent AI review and integration authority continues for this
task. No extra initial, catch-up or immediate live-test budget is created.

This narrowly supersedes ADR-0055's recurring Monday-only cadence. Its source
rights disclosure, spent initial claim, protected publication and other source/
API/HAPI budgets remain. Owner execution approval does not assert official ACLED
website automation permission; no access-denial or challenge bypass is allowed.

## Exact workflow policy and rollout

Policy and executable integration are separate reviewed changes. The new fixture
`tests/fixtures/acled-split-auto-workflow-approved.txt` is admitted only at
`.github/workflows/acled-auto-update.yml`, with LF SHA256
`5a281ebbe63b9f71105a56a698536f7abfac66d1f9c67b063f80749530b291d7`.
It adds two precise cron entries and passes `github.event.schedule` through a
step-scoped environment variable, not shell interpolation or arbitrary input.
The old exact digest remains a documented lower-frequency rollback version at
that same path, never a second automation or an additional budget. Both versions
must share their existing Monday and initial claim names. Other workflow
exceptions and all negative digest assertions stay intact.

## Required executable invariants

- Derive mode from the schedule event, one of the three exact cron strings and
  the current UTC day. Monday is `pair/26`; Wednesday/Friday is `weekly/14`.
  Unknown cron, wrong day, before 00:30 UTC, other event and retry attempt hold.
  A delayed event crossing the UTC day is not caught up on another date. GitHub
  scheduling is best-effort, not an exact start-time guarantee.
- Claim before login under the unchanged `acled-auto-attempt-v1/YYYY-MM-DD`
  namespace. Monday keeps the original Monday date key, Wednesday and Friday
  use their own date keys. Existing, failed or ambiguous claims block repeat
  access. The initial key is already spent and is never reset or renamed.
- Default collection/manifest/private validation remains the complete 12-file
  pair. Only an explicit internal `weekly` mode admits exactly the same six
  regional identities. No monthly-only, arbitrary subset, duplicates or partial
  success. Determine the six allowed detail pages before any request; weekly
  mode never discovers or downloads a monthly URL. Login and logout once each.
- Weekly mode runs the unchanged weekly sanitizer in an owned private temporary
  workspace. Byte/ZIP/row/deadline limits and confirmed logout/cleanup remain.
  Its candidate output contains only weekly JSON. Pair mode keeps both unchanged
  sanitizers and the full twelve-file contract.
- Reuse the pinned main monthly baseline as its exact original string/bytes in
  weekly mode. Do not refresh its preparedAt, preparedBy, asOfDate or filename.
  Reject unexpected candidate keys. Preserve baseline pins, full paired strict
  checkers, shared lock, CAS and receipt-bound refresh/Pages/EdgeOne chain.
  A monthly strict-validation failure can still hold a weekly publication; do
  not bypass that protection or silently fetch replacement monthly files.
- No semantic change means no mutation or refresh dispatch. A same-name file
  with revised contents is still compared. Failure never clears old usable data.
  Acquisition uses at most five separate bounded GitHub requests per attempt;
  downstream publication checks do not create extra ACLED requests.

## Verification and operation

Offline regressions cover all three days, year boundaries, invalid timing,
duplicate/legacy claims, exact six-region access, no monthly request, full-pair
defaults, exact monthly bytes through preparation/publication, unchanged output,
and failure isolation. Full checks and independent review precede integration.
A remote dry-run validates installation and the entry point only, not real
acquisition. No new source request is required for this implementation turn;
the next scheduled slots run automatically after deployment.

Reference: [GitHub scheduled events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
