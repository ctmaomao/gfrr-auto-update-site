# ADR-0092: Delegated AI review without repeated project confirmation

## Status

Owner requested on 2026-11-09; governance implementation and independent AI review complete, exact-head CI and merge pending. This decision partially supersedes ADR-0026's generic human-only merge-review requirement and same-scope repeat-confirmation language in current project navigation. The original ADR and historical receipts remain unchanged except for an explicit status pointer.

## Context

The owner asked for GFRR review and quality control to be handled by AI instead of repeatedly asking them to confirm and permit the same work. Root instructions still required human review even when the task already had valid authorization and independent AI review. This created a redundant gate rather than additional evidence.

The change concerns the project's review workflow. This repository is not the authority for platform permissions, security decisions, third-party rights or credentials. It does not copy or preserve external permission settings: each action uses the user's current instructions and permissions, including any later restriction or withdrawal.

## Decision

1. Continue an authorized task through implementation, review, required tests and acceptance without asking again just because the stage changes or a same-scope repair/retry is needed. A read-only or design-only request stays read-only or design-only. New targets, purposes, data, costs or material consequences require the applicable authorization.
2. Use an independent AI reviewer who did not implement the change before integration. Review actual files and diff against the accepted task baseline; identify base/head or reviewed tree/blob identity, findings, corrections, checks and remaining limits. An implementer's self-audit, model confidence or a green test suite alone is insufficient. Describe AI review honestly, never as human approval.
3. Preserve the existing serial trunk / latest main / no stacked PR workflow. Publish, merge or deploy only when the current user authorization covers the target and action; this ADR is not publication authorization. No repeated project confirmation is added for already covered actions. Check the final head's required CI before integration and verify the actual deployed revision and relevant behavior afterward. Do not claim completion when production acceptance is still pending.
4. Keep AGENTS.md section 10's three review gates: plan consistency, contract-checker integrity, and justified ignore lists. Unresolved P1/P2 findings, failed or missing required checks block merging. Re-review affected changes and rerun necessary checks after the reviewed head/base changes. If independent review is unavailable, pause integration rather than substitute self-approval or a user click.
5. An assertion change remains an ADR-level decision in a separate independently reviewed PR. Never weaken a checker, add an unexplained skip/ignore, alter production data to pass a check, or drop CI, coverage, browser or production-acceptance gates to reduce confirmation friction.

## Boundaries that remain

- Existing source-rights, paid-provider budgets and admission, credential handling, persistent-access, data-release and platform trust requirements remain. AI review cannot grant third-party rights or create new approval for a paid call, sensitive transmission or new production path.
- Concrete destructive Git operations and other actions requiring specific confirmation or user performance retain those requirements. Do not change repository protection settings, environment reviewers, credentials, secrets or payment rules as part of this migration.
- Domain fields that attest to real human annotation, source validation or manual sample provenance are facts, not generic workflow labels. Do not fabricate their values or reclassify existing manual artifacts as reviewed production evidence. Technical review can be performed by AI when authorized, but a schema/state migration needs its own scoped implementation and verification.
- Earlier stage instructions to seek a human merge review or final confirmation do not by themselves block currently authorized, same-scope work. They also do not unlock a still-unauthorized operation. Check the relevant scope and current evidence instead of globally replacing every occurrence of “manual”, “approved” or “confirmation”.

## Implementation and verification

Root AGENTS.md and CLAUDE.md navigation define the new review responsibility. ADR-0026 receives a supersession pointer; the ADR/document indexes, domain-boundary preface and operations guide point to the same rule. No runtime code, workflow, checker assertion, production JSON, source policy, budget rule or protection setting changes.

Because this changes governance, run `npm run check:changed` including the full `check:all`, plus the existing PR coverage and Chromium gates. Review the final diff independently, preserve serial integration after PR #513, and record exact results and any environment limits in the task handoff and PR. No frontend asset bump is needed for a documentation-only change.

Local verification: full `check:changed` / `check:all` passed; coverage 1,639 pass / one existing skip / zero fail, with 99.86/93.23/97.96 line/branch/function coverage; EdgeOne staging 67/67 passed. Independent AI review found no remaining P1/P2. Local standard browser smoke could not launch the absent locked Chromium executable; all 104 cases failed at browser startup, so exact-head remote browser success remains mandatory before merge. All 55 Pages artifact files match the base revision byte for byte. These governance files are outside both site publishers' push paths and static allowlist; merging this documentation requires no separate site deployment.
