# ADR-0052: One-use ACLED authenticated detail discovery

## Status

Owner explicitly approved 2026-09-17. Separate policy PR before implementation.
Independent AI review is authorized for this task; CI remains required before merge.

## Decision

Add an exact-content credential exception only for
`.github/workflows/acled-authenticated-detail-discovery.yml`, LF-normalized SHA256
`70d2976abaf877ffff8eff7bc0373290396f721cdf68ec4551644161341ed352`.
The reviewed fixture is `tests/fixtures/acled-detail-workflow-approved.txt`.
Only the existing two ACLED_DOWNLOAD Secret references are exempt. Preserve every
other workflow assertion and ADR-0051's independent single-file digest.
Each exception is exact-path/exact-bytes, not transferable; any change needs review.

The target is manual/main-only/first-attempt, default dry-run, contents read-only,
pinned actions, step-only Secrets, no dependency install/cache/artifact/raw saving.
Budget: one login POST, at most twelve fixed detail-page GETs, one logout POST;
HTML at most 1 MiB per page, control responses 64 KiB each, 15 seconds per request,
zero retries/redirects. Aggregate bound is 12 MiB plus 128 KiB. Stop collection on
failure and attempt logout after confirmed login. Interrupted login/logout must
disclose a possibly remaining session. No XLSX GET, API data query or production write.
Do not save authenticated HTML, cookies, tokens or credentials. Only strictly
validated public static file-link metadata may appear in the redacted receipt.

The public directory links to twelve restricted `/aggregated/` detail pages;
an unauthenticated monthly detail returned 403. These observations are not proof
that authenticated discovery will succeed or permission for sustained extraction.
The implementation must use those observed pages, not enumerate or guess URLs.

This narrow approval replaces the old no-authenticated-detail-request boundary
for one new execution only. It does not modify reminders, old spent diagnostics,
HAPI budgets, source rights for ongoing automation or production publication.
Record a unique run ID before any later dispatch decision; first-attempt alone is
not a global once ledger. Failure consumes the one-use execution opportunity.

## Verification and rollback

Policy-only delivery adds no executable workflow or source request. Test both
approved digests and wrong-path, cross-fixture and modified-byte rejection. Review
implementation separately before dispatch. Removing this new exception restores
the credential prohibition for this path without affecting ADR-0051.
