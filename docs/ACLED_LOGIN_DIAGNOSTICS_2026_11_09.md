# ACLED login refusal diagnostics

## Verified incident and limits

The [November 6 acquisition](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42179326748)
completed 14 requests with confirmed login/logout and private validation. Its
weekly data was unchanged (latest week October 24; retained monthly as-of October
23). That is evidence that this same login/download path recently worked.

The [November 9 acquisition](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42576711961)
at 07:02 UTC stopped after its first source request: the JSON login returned HTTP
403. No detail pages or workbooks were fetched; neither configuration nor site
publication occurred. Its permanent `2026-11-09` claim is spent. The report's
`loginBytes: 0` means the client cancelled the rejected response body, not that
ACLED sent an empty response. Login and logout were unconfirmed; the existing
`sessionMayRemain: true` remains a conservative uncertainty, not proof that a
session exists. Do not clear the owner's browser session or reset credentials.

The owner's successful interactive login does not prove that the separate
GitHub runner's JSON login is accepted. Current [ACLED authentication guidance](https://acleddata.com/api-documentation/getting-started)
still documents the exact `/user/login?_format=json` cookie endpoint used by the
XLSX collector. It also documents a separate OAuth data-API flow; this is not
evidence that the cookie endpoint has been retired, and this patch does not
switch sources or request tokens. [Official error guidance](https://acleddata.com/api-documentation/elements-acleds-api)
lists distinct 403 causes including consent, required profile fields and access
denial. The retained incident log cannot distinguish them from other denials.

## Narrow implementation

- Only the existing exact login POST may classify its already-received HTTP
  400/403 JSON denial. The existing 64 KiB response cap, declared-length checks,
  full-response deadline, manual redirect policy and single request remain.
- Exact documented messages map to fixed codes: `credentials_rejected`,
  `consent_required`, `profile_required_fields`, `access_denied`, `invalid_url`.
  Unknown or malformed JSON stays `unclassified_denial`. HTML/non-JSON becomes
  `non_json_denial` without reading it. Neither classification identifies an
  anti-bot product or proves an account permission cause by itself.
- HTTP 401 and 429 remain denied; only status-derived `unauthorized` and
  `rate_limited` are returned, without reading their bodies. Redirects, other
  statuses, targets and methods retain immediate cancellation.
- Reports expose only the fixed `loginFailure` code and existing status/byte
  metadata. They never expose raw body, arbitrary message, headers, cookies,
  tokens, credentials or account identity. Known-message bodies containing
  extra secret-like fields are covered by non-disclosure tests.
- Every refusal remains `ok: false`, login unconfirmed, no download or retry,
  no production publication and no unsafe logout. No workflow, budget, permanent
  claim, credential, source, consent or data-quality gate is changed.

This patch fixes missing diagnostic evidence, not the upstream refusal. It makes
zero live ACLED requests. The next already-authorized natural slot may provide
a safe code; successful interactive login may have resolved a consent/profile
prompt, but that is not established. Unknown denials need source-side evidence.
The owner's report came after the failed scheduled request. There has been no
new acquisition confirming whether the owner's successful login resolved it.
Do not replay the spent run, bypass access denial, accept new terms or expand
access in order to manufacture a successful result.

## Validation and release

The 43 focused tests cover the existing acquisition/probe/detail callers plus
error classification, non-disclosure, immediate 401/429/redirect cancellation,
byte caps, malformed content and body deadlines. All pass offline; the six new
cases are added to the existing `check:acled-admin2-scope` suite without removing
any previous file. Full unit coverage passed with 1,655 tests passing, one existing
skip and no failures (lines 99.86%, branches 93.23%, functions 97.96%). Independent
review found no P1/P2 and passed 23 additional in-memory boundary cases. Full
`check:changed` / nested `check:all` completed with exit 0, including the new test
suite wiring. Final document links and whitespace also pass. The existing two
unused-variable lint findings in `acled-authenticated-probe.mjs` are unchanged
from the baseline; no new lint finding was introduced. The first full-check
session ended without a result after a platform network-approval cancellation;
the subsequent complete run above succeeded, without permitting a source call.
Exact-head remote CI remains a release gate. Live recovery is not established
by offline tests.
