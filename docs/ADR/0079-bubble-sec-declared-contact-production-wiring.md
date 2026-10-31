# ADR-0079: Bubble SEC declared-contact production wiring

## Status

Implemented locally as a separate integration PR; merge/deployment acceptance pending. Owner authorized fault repair and necessary publication, prohibited using DeepSeek for coding, and explicitly appointed Codex to review on their behalf for this task. A separate single production editorial call was authorized, without retry. Codex prepared and reviewed this proposal; this is AI review and not a claim of independent human review. This patch depends on the existing source-repair patch being integrated first; the source-repair PR #487 has merged at 8ef2f4de before this branch was created; no stacked PR is used.

## Context

The source-repair patch provides declared-contact parsing and read-only audit wiring. The production refresh job is protected by a SHA-256 freeze. Its initial two-line modification failed that contract and was withdrawn. A production connection must be explicitly reviewed rather than silently changing the expected hash.

One owner-authorized local probe issued four SEC companyconcept requests, with no redirects/retries and a 20-second deadline per request. All returned HTTP 200; MSFT, ORCL and GOOGL passed the existing production period/freshness rules. AMZN remained excluded as stale. This is local diagnostic evidence, not GitHub-runner or production acceptance. Contact details and raw headers are excluded from this ADR and patch.

## Decision

- Add exactly one `BUBBLE_WATCH_EDGAR_CONTACT` secret binding in the existing `Refresh bubble watch data` step. No global/job-wide/candidate secret injection, permissions, schedule, source list, network retry or publication changes.
- The secret contains the declared application identity plus an owner-approved contact email. It is contact information, not an SEC API credential. Existing parsing validates format only; it cannot establish mailbox deliverability or guarantee SEC access.
- The shared EDGAR identity applies to existing SEC companyconcept, submissions, Form 4 XML, ticker lookup and press RSS calls, not solely RPO. This recipient/scope must be disclosed when contact consent is obtained. No new source is added.
- Keep the old exact production-job SHA-256 `d377b5ab1e2e7cf4a668a77c8ca44f85859953e8ad33db7c8ef4a99553cbef96` after removing the single approved env line, and additionally freeze the complete new job at `2cb6886717d47a0546037b9587eb33e9d80bace7d230cc906c36fc599d16f80b`. Existing candidate restrictions and other assertions stay intact. This explicit contract migration requires its own owner-designated reviewed PR; it is not part of the source-repair patch.
- No address in tracked files, logs or artifacts. Missing/invalid configuration retains the old identity and existing failure/fallback behavior. RPO still requires at least two companies, 120-day freshness and matching periods/samples.

## Verification and release gates

- Before application: verify a one-line workflow delta, unchanged candidate block, exact old/new hashes, no address in the patch, and `git apply --check` against the reviewed source-repair workspace.
- After application: standard contact/Epoch tests, workflow checks and `npm run check:changed` including `check:all`. Do not reuse source-repair test results as proof of this new patch.
- Owner-designated Codex review and successful CI are required before merge. The owner authorized push/merge/deployment and the approved SEC contact configuration for this task. No paid provider call is an acceptance test.
- Check bounded free SEC access from the actual GitHub runner and then normal workflow/data provenance before claiming production recovery. Local HTTP 200 alone is insufficient.

## Recovery

Remove or disable the separate contact secret to restore the existing identity on subsequent runs. If the wiring must be reverted, reverse the one-line workflow change and its paired reviewed hash migration together. Do not delete source evidence or manually alter production JSON.
