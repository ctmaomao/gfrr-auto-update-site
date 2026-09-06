# ADR-0024: Domain assertions follow delegated authority

## Status

Implementation authorized by owner on 2026-09-06; pending independent human review before merge. This is instruction/checker governance work, not a presentation patch. It does not authorize AI Git operations.

## Context

The root AGENTS.md had been reduced from 105,265 to 23,751 bytes by moving 153 domain rules to `docs/AGENT_DOMAIN_BOUNDARIES.md`. Existing checkers still required dozens of tool names in the root, forcing duplicate text into every task's context. The names belong with the corresponding domain constraints.

## Decision

- Redirect the 72 macro/route/Transport checkers' authority reads and error labels to the delegated domain file. Preserve every existing assertion, marker, threshold, branch, and runtime test; do not use combined root+domain text as a fallback.
- In the workflow checker, migrate the three domain document lists and G-6 domain marker source. Keep serial trunk requirements in root AGENTS because they are general execution policy.
- Remove the root's tool-name compatibility list. Keep domain reading pointers and general permission rules in root.
- Strengthen `check:docs` to verify the root's actual delegation destination and explicit domain anchors. Link labels and prose can change freely. Exercise six real checker read/assertion shapes with both missing-file and missing-marker fault injection; a legacy root containing all rules must not hide a missing domain rule.
- Do not lower runtime, source-rights, cost, scoring, or publication checks. Keep the existing full-check policy during this migration. A separate validation-depth review proposes an ordinary-prose exception; it is not enacted by this ADR.

## Consequences

Root tool names no longer control domain validation. Domain rules remain enforceable in one location. A change to that location must migrate its consumers and preserve failure behavior. Existing literal domain assertions remain intentionally strict; this decision changes their location, not their semantic expressiveness.

Human review should compare the mechanical path substitutions and the workflow-specific diff, then inspect the new negative tests. No assertions are deleted, widened, or skipped; no ignore list is added. Prior approved instruction edits are prerequisites, and this migration should be reviewed as a dedicated governance change rather than mixed with unrelated product work.

## Verification

Run `npm run check:docs`, `npm run check:all`, and `git diff --check`. Detailed results and the validation-depth review are recorded in [the phase-two receipt](../REVIEW_2026-09-06_INSTRUCTIONS_PHASE2.md).
