# ADR-0051: ACLED authenticated single-file diagnostic exception

## Status

Owner authorized 2026-09-17; independent policy review required before integration.
This policy-only PR precedes the authenticated probe implementation PR.

## Decision

Retain the global prohibition on ACLED credentials in workflows, with one exact-content
exception for `.github/workflows/acled-authenticated-file-probe.yml`. Bind the exception
to SHA256 `39334de90d2b5320f40f2ecf882743e420c825564ac1fba36271f5f95bc9991c` after CRLF-to-LF normalization.
Only `secrets.ACLED_DOWNLOAD_USERNAME` and `secrets.ACLED_DOWNLOAD_PASSWORD` are exempt;
all API/curl/fetch and other existing assertions still apply. Different path or changed
bytes lose the credential exemption (the original credential ban applies if credentials remain).
This is not a rule requiring the diagnostic workflow to exist or contain Secrets.
Any digest change requires independent policy review; no wildcard
ignore list or general ACLED exemption is introduced.

The reviewed target is manual workflow_dispatch, default dry-run, main-only and first
run attempt, contents read-only, pinned checkout/setup-node, no persisted Git credential,
no cache/artifact/install, and Secrets only in the live execution step. The approved
implementation budget is at most one login POST (64 KiB), one owner-specified XLSX GET
(8 MiB), one logout POST (64 KiB), 15 seconds each, no redirects/retries or publication.
The actual workflow and executable paths require their own implementation review.

This supersedes the blanket credential ban only for this diagnostic. It does not authorize
scheduled website scraping, restore the old API adapter, alter reminders, publish data,
relax XLSX validation, or renew any spent request budget. A unique real run receipt must
be recorded; run_attempt=1 alone is not a global once ledger.

## Evidence and rollback

The owner supplied the fixed file and explicitly approved this three-request test after
GitHub Secret setup. Previous anonymous run 35190625767 confirmed same-origin login
redirection. [ACLED login documentation](https://acleddata.com/api-documentation/getting-started)
and [Drupal logout documentation](https://www.drupal.org/node/2720655) support protocol
design only, not proof of authenticated XLSX access or ongoing extraction rights.

Reverting the helper/import/exception restores the blanket ban. No live workflow is added
by this policy PR; no credentials read or requests dispatched. Production remains unchanged.
