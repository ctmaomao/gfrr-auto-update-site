# ADR-0054: One private ACLED batch acceptance

## Status

Owner requested the next step after the explicit 26-request budget proposal.
Independent AI review and integration are authorized for this task. Policy and
implementation remain separate PRs; actual execution follows both reviews and CI.

## Decision

Permit only `.github/workflows/acled-private-batch-acceptance.yml` with LF SHA256
`483b33300f716ed397a42847841e130dc0b56a5a6f63650aa0f6aad39bc2c060`.
Fixture: `tests/fixtures/acled-batch-workflow-approved.txt`.
Retain both earlier path/digest exceptions and all other checker assertions.

One new manual/main/first-attempt run, default dry-run, contents read-only.
ACLED budget: login + twelve fixed detail pages + twelve discovered XLSX files +
logout, maximum 26 requests, 15 seconds each, zero retries or redirects. HTML is
at most 12 MiB total; weekly XLSX 16 MiB each/64 MiB total; monthly XLSX 1 MiB
each/2 MiB total; controls 64 KiB each. Failure consumes this execution opportunity;
record the unique run ID and never repeat an ambiguous dispatch. Old budgets stay spent.

Pinned checkout/setup-node, no persisted Git credentials or package cache. Install
the existing lockfile's development parser with lifecycle scripts disabled before
step-scoped Secrets are injected. Dependency/platform traffic is separate from
the ACLED source-request budget. No production dependency is added.

Confirmed logout precedes private validation. Unmodified sanitizers run in a unique
temporary workspace with credential-free subprocess environments. Raw files are
never committed, uploaded as artifacts or cached; remove only this operation's
temporary directory. Cleanup failure revokes candidates and is disclosed.
The job outputs redacted status, counts, dates and hashes only, not source rows,
credentials, tokens, authenticated HTML or complete derived configurations.

No workflow schedule, production write, publication, source-rights expansion or
HAPI budget change. This is a one-use acceptance exception, not approval for
ongoing website extraction or evidence of workbook equivalence before execution.

## Verification and rollback

Test exact bytes, CRLF handling, wrong paths, swapped fixtures and mutations.
This policy PR adds no executable workflow. Review the separate implementation
before the single run. Removing this exception disables only the new workflow.
