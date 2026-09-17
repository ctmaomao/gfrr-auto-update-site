# ADR-0055: Owner-approved weekly ACLED XLSX automation

## Acceptance baseline and limited supersession

On 2026-09-18 the owner explicitly approved the initial acceptance and weekly
automatic execution proposed in the task: one new initial batch and one batch
each Monday, at most 26 free ACLED requests each, 15 seconds per request, no
retry/redirect, private temporary originals, failure preserves existing data.
The same task authorizes protected publication, independent AI review, commit,
push and merge. Earlier one-use budgets remain spent.

This reviewed exception applies ONLY to the new `acled-auto-update.yml` workflow
and its reviewed caller. It supersedes the manual-only acquisition restriction
for this path, not the old reminders, API/HAPI budgets, scoring or other sources.
Policy and executable integration are separate reviewed PRs.

## Source rights re-evaluation

[Current ACLED EULA section 3.3](https://acleddata.com/eula), checked 2026-09-18,
permits platform/API downloads but prohibits site scraping/crawling and credential
sharing. Non-commercial use does not remove those restrictions. No new ACLED
letter permitting website automation has been obtained. The owner knows this
distinction and explicitly directs this bounded use of their own account; that
is an owner execution authorization, NOT a legal conclusion or official license.
The workflow does not bypass login, challenges, access denial or payment gates.
Any refusal stops without retries. Credentials stay in step-scoped GitHub Secrets.

## Exact workflow and provenance contract

The approved fixture is `tests/fixtures/acled-auto-workflow-approved.txt`; the
path/digest binding in `scripts/acled-auth-workflow-policy.mjs` permits only its
LF-normalized exact bytes. Existing three exceptions and assertions remain.
Monday 00:30 UTC is weekly; manual execution defaults to a zero-I/O plan and may
consume only the independent, permanently named initial slot. Both are main-only,
first-attempt, serialized with the existing main writer queue, never canceled by
a newer run. No original artifact/cache, no parser lifecycle scripts.

`preparedBy` accepts exactly `manual` or `github-actions-acled-auto`. Existing
`source` identifiers containing `manual-normalized` remain legacy schema IDs,
not acquisition claims. Sanitizers remain unchanged; ONLY the reviewed automatic
caller labels its successfully validated pair with the automatic provenance.
Strict checkers add the same two-value constraint; all content/freshness checks
remain. These fields never assert official permission or uniform regional dates.

## Mandatory integration invariants

- Before login, atomically create a permanent GitHub ref under the fixed namespace
  `refs/tags/acled-auto-attempt-v1/`: `initial`, or the UTC Monday YYYY-MM-DD.
  Existing ref, failed/ambiguous claim or rerun stops before source access. Claims
  are not deleted or renamed; failure consumes the slot. Claim is not success.
- ACLED limits retain login + 12 fixed details + 12 files + logout; HTML 12 MiB,
  weekly 16 MiB/file and 64 MiB total, monthly 1 MiB/file and 2 MiB total,
  control responses 64 KiB each. No pagination, extra sources or retries.
- Complete batch, confirmed logout and temporary cleanup precede promotion.
  Preserve attribution, exact baseline/candidate pins, strict weekly/monthly
  validation, date non-regression and atomic paired CAS publication. Reviewed
  deterministic admission handles date advances and same-date revisions; it
  does not force newer dates or treat upstream delay as a local failure.
- GitHub operations are separately bounded: claim query/mutation, publication
  query/mutation, and one refresh dispatch, each 15 seconds with no retry or
  redirect. At most five requests in the normal path; response <=64 KiB each,
  publication request <=3 MiB. Mutation ambiguity is never reported as no write.
- Configuration publication is not site publication. Explicitly dispatch the
  existing World Order refresh with the published pair identity, then verify
  derived data, Pages and custom-domain deployment. Do not assume GITHUB_TOKEN
  commits trigger downstream workflows.
- After publication, refresh/deployment failure uses a source-free recovery path,
  never redownloads. Unknown publication requires read-only reconciliation first.
  No new paid AI invocation, new scoring formula or runtime ACLED network access.

## Verification and rollback

Exact-byte mutation tests, provenance allowlist regressions and full checks precede
independent review of this policy. Integration additionally needs synthetic whole
chain failures, persistent duplicate claims, real initial acceptance and both-site
readback. Disabling the new workflow stops future requests; preserve claims and old
data. This policy PR alone performs no source requests or production publication.
