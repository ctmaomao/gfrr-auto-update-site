# ADR-0026: Tiered Git authorization

## Status

Accepted and merged in PR #304 after [owner-authorized AI review](../REVIEW_2026-09-06_CLOSEOUT.md#accepted-pr304). That reviewer exception applies only to PR #304; general review requirements remain unchanged. Owner adoption on 2026-09-06 supersedes generic owner-manual Git restrictions and older receipt/ADR wording; domain-specific provider, source-rights, credential, data-release and platform-trust requirements remain unchanged.

## Decision

The agent may autonomously inspect Git, fetch without deletion/prune, create task branches or isolated worktrees, switch safely, stage only the current task's changes, and make local commits after required checks pass. Updating the current branch is fast-forward-only with a clean worktree/index and is included in routine local authorization. A non-fast-forward state requires analysis of the actual affected work, not automatic history rewriting.

Push, feature-branch integration merges and deployment/publication they trigger require explicit authorization for the task, target and action. Once authorized, the agent can execute the commands; the owner need not type them. Existing human review and production acceptance gates remain applicable. Pushing main may deploy Pages, so local-commit permission is not publishing permission.

Force-push, discarding changes, rewriting shared history and deleting branches/worktrees require confirmation of the concrete operation after identifying affected objects and recovery options. Preserve unrelated working-tree and staged changes; do not use indiscriminate staging. If changes cannot be separated, pause only that Git operation.

Serial trunk mode, latest main and no stacked PR remain the baseline. Permission does not require an unnecessary branch, commit, cleanup or remote operation. A local instruction-editing task can finish without deployment.

## Authority and impact

This expands local Git execution autonomy and lets an agent execute already-approved remote/integration operations. Model confidence is not authorization. Historical statements that Git must be owner-executed describe the old policy; they do not override this explicit adoption. Mandatory independent contract-checker review still governs any assertion change.

## Verification

Root permission text and current navigation/handoff references are synchronized. Existing serial-trunk assertions and all production gates are preserved. See the [Markdown review receipt](../REVIEW_2026-09-06_MARKDOWN_FINAL.md) for checks and limits.
