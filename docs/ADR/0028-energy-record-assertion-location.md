# ADR-0028: Historical Energy/Transport assertions follow their records

## Status

Accepted and merged in PR #304 after [owner-authorized AI review](../REVIEW_2026-09-06_CLOSEOUT.md#accepted-pr304). That reviewer exception applies only to PR #304; general review requirements remain unchanged. The decision grants no source, runtime, scoring, publication or Git permission.

## Context

P3-19/P3-19a implementation records were preserved verbatim in `docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md`, but 68 checkers still require 76 historical title/schema strings in PROJECT_BACKLOG. Keeping a compatibility list there increases default context and couples current-task prose to completed implementation records.

## Decision

- Redirect only those checkers' PROJECT_BACKLOG reads and associated diagnostic labels to the existing Energy/Transport history file. Preserve all markers, assertions, thresholds, branches and runtime tests. Do not combine backlog and history as a fallback.
- Current operational authority stays in AGENTS.md, AGENT_DOMAIN_BOUNDARIES.md, DATA_SOURCES.md, DATA_CONTRACT.md and the corresponding source/runtime contracts. The migrated assertions establish that a phase record exists; they do not approve the historical operation or promote its old state to current authority.
- Remove the backlog compatibility list and schema bookkeeping. Retain current status, explicit approval boundaries, unresolved work, applicable verification and links to the records. Existing backlog section/format checks and non-Energy consumers remain unchanged.
- Exercise real checker read shapes with three cases: a concise backlog succeeds; deleting a history marker fails; a missing history file fails. Returning every original record from the legacy backlog must not conceal either failure. Test injection changes child-process reads only, never actual authority files.

## Consequences and validation

No duplicate record index or new runtime abstraction is introduced. The history file remains protected by its existing literal assertions and strict Markdown link checks. Further changes to those records must preserve or explicitly review their consumers.

Review the mechanical path/diagnostic substitutions separately from product changes; no assertion or ignore list is relaxed. Run the new negative tests through `check:docs`, then the full `check:changed` validation and `git diff --check`. Results are recorded in the [migration receipt](../REVIEW_2026-09-06_ENERGY_ASSERTIONS.md).
