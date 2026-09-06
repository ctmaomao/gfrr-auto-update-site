# ADR-0026: Tiered Git authorization

## Status

Owner explicitly accepted this policy on 2026-09-06. Effective for instruction execution now; normal independent review before merging repository changes remains required. This supersedes the generic owner-manual Git restriction in root AGENTS, its aliases, and earlier instruction-maintenance receipts/ADR wording. It does not change domain-specific provider, source-rights, credential, data-release or platform-trust requirements.

## Decision

The agent may autonomously inspect Git, fetch without deletion/prune, create task branches or isolated worktrees, switch safely, stage only the current task's changes, and make local commits after required checks pass. Updating the current branch is fast-forward-only with a clean worktree/index and is included in routine local authorization. A non-fast-forward state requires analysis of the actual affected work, not automatic history rewriting.

Push, feature-branch integration merges and deployment/publication they trigger require explicit authorization for the task, target and action. Once authorized, the agent can execute the commands; the owner need not type them. Existing human review and production acceptance gates remain applicable. Pushing main may deploy Pages, so local-commit permission is not publishing permission.

Force-push, discarding changes, rewriting shared history and deleting branches/worktrees require confirmation of the concrete operation after identifying affected objects and recovery options. Preserve unrelated working-tree and staged changes; do not use indiscriminate staging. If changes cannot be separated, pause only that Git operation.

Serial trunk mode, latest main and no stacked PR remain the baseline. Permission does not require an unnecessary branch, commit, cleanup or remote operation. A local instruction-editing task can finish without deployment.

## Authority and impact

This expands local Git execution autonomy and lets an agent execute already-approved remote/integration operations. Model confidence is not authorization. Historical statements that Git must be owner-executed describe the old policy; they do not override this explicit adoption. Mandatory independent contract-checker review still governs any assertion change.

## Verification

Root permission text and current navigation/handoff references are synchronized. Existing serial-trunk assertions and all production gates are preserved. See the [Markdown review receipt](../REVIEW_2026-09-06_MARKDOWN_FINAL.md) for checks and limits.
