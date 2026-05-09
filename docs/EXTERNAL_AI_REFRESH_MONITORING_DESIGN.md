# External AI Refresh Monitoring / Failure Notification Design - v28.0L-4C

## 1. Status

This is a documentation-only monitoring and failure-notification design.

- No workflow implementation is added.
- No production data is changed.
- No frontend code is changed.
- No provider call is made.
- No workflow is triggered.
- No new schedule is added.
- No new automatic provider path is added.
- No secret is accessed.
- No scoring, decision, execution, or position path is affected.
- This design does not add notification automation yet.

## 2. Current refresh baseline

Current baseline for the existing refresh path:

- `External AI Production Refresh` workflow exists.
- Daily schedule: `23:50 UTC`.
- Manual `workflow_dispatch` exists.
- Environment: `external-ai-production-refresh`.
- Required environment secret: `DEEPSEEK_API_KEY`.
- First manual production refresh succeeded.
- Run ID: `25611392014`.
- Commit: `c32af65`.
- Artifact ID: `6898516584`.
- Runtime changed only `data/radar-data.json`.
- Final `check:all` passed.
- The external AI panel displays refreshed production data.

## 3. Monitoring goals

Monitoring should detect:

- Failed scheduled refresh.
- Failed manual refresh.
- Missing environment secret.
- Provider failure or timeout.
- Output validation failure.
- Quality review failure.
- Artifact sanitizer failure.
- Production contract failure.
- Write guard failure.
- `check:data` or `check:all` failure.
- Unexpected changed files.
- No refresh commit for too long.

Monitoring should also:

- Avoid duplicate provider calls.
- Avoid auto-retry loops without approval.
- Avoid noisy notifications.

## 4. Notification channels

### Phase 1 - GitHub native notifications

Use GitHub Actions built-in notifications first.

- Repository watchers or the workflow trigger user can receive GitHub web or email notifications.
- GitHub supports notifications for workflow runs.
- GitHub notification settings can be configured to notify only for failed workflow runs.
- Scheduled workflow notifications are sent to the user who created or last modified the cron.

Recommended initial approach:

- Use GitHub native failed-workflow notifications.
- Do not add Slack, email, webhook, or issue creation automation yet.

### Phase 2 - GitHub Issue notification, future optional

A future optional PR may create or update a GitHub issue when refresh fails.

This design PR does not implement issue notification automation.

### Phase 3 - External channels, future optional

A future optional PR may support email, Slack, or webhook notifications.

This design PR does not implement external notification channels, and no external notification secrets should be added now.

## 5. Failure classification

### A. Configuration failure

Examples:

- Missing `external-ai-production-refresh` environment.
- Missing `DEEPSEEK_API_KEY`.
- Required reviewers blocking automatic schedule.
- Permissions insufficient.

Severity: high.

Expected action: fix GitHub environment, secret, or permissions. Do not rerun provider repeatedly.

### B. Provider failure

Examples:

- DeepSeek timeout.
- DeepSeek 5xx.
- Network failure.
- Invalid provider response.

Severity: medium to high.

Expected action: perform manual review. Optionally rerun once manually after waiting. Do not add an auto-retry loop.

### C. Output safety failure

Examples:

- `check:external-ai-output` fails.
- Quality review fails.
- Unsafe wording is detected.
- Artifact sanitizer fails.

Severity: high.

Expected action: do not write production data. Inspect the artifact if a sanitized artifact exists. Fix prompt, validator, or review rules only through a reviewed PR when needed.

### D. Production write failure

Examples:

- Projection fails.
- Production contract fails.
- Write guard fails.
- `check:data` fails.
- `check:all` fails.
- Unexpected changed files are detected.

Severity: high.

Expected action: do not push. Inspect logs. Do not manually edit `data/radar-data.json`.

### E. No-change run

Examples:

- Provider output results in no meaningful `data/radar-data.json` diff.

Severity: informational.

Expected action: no notification is required beyond the normal Actions log.

### F. Post-refresh site issue

Examples:

- External AI panel disappears.
- Unsafe copy appears.
- Global Risk Heatmap layout changes.
- Stale data is visible.

Severity: high.

Expected action: revert the latest refresh commit or disable display flags through an approved data update.

## 6. Alert thresholds

- Immediate alert for any failed `External AI Production Refresh` run.
- Immediate alert if protected path assertion fails.
- Immediate alert if `check:all` fails.
- Warning if there is no successful refresh commit in more than 48 hours.
- Warning if artifacts are unavailable before review and the failure was recent.
- No alert for successful no-change runs.
- No alert for the known non-blocking `check:world-order` warning when `check:all` still passes.

## 7. Future implementation options

### Option A - GitHub native notifications only

Pros:

- No new workflow.
- No new secrets.
- Low complexity.

Cons:

- Less structured failure summary.

### Option B - Add a workflow_run failure monitor

Potential future trigger:

```yaml
on:
  workflow_run:
    workflows: ["External AI Production Refresh"]
    types: [completed]
```

Potential future behavior:

- If `conclusion != success`, create a GitHub issue or append a comment.
- If successful, do nothing.
- Must not call DeepSeek.
- Must not write production data.
- Must not trigger the provider workflow.
- Must not access `DEEPSEEK_API_KEY`.

### Option C - Add daily stale-refresh checker

Potential future schedule:

- Once daily after the expected refresh window.

Potential future behavior:

- Check the latest successful refresh commit or workflow run.
- Alert if the last success is older than the threshold.
- Must not call DeepSeek.
- Must not write data.
- Must not create noisy alerts.

None of these options are implemented in this PR.

## 8. Recommended initial operating procedure

For now:

1. Enable GitHub Actions notifications for failed workflows.
2. Confirm the repository is watched or notification settings are configured.
3. Keep the `external-ai-production-refresh` environment without required reviewers if full automation is desired.
4. Check the Actions tab after the first few scheduled runs.
5. If a failure occurs:
   - Open the failed run.
   - Inspect the failing step.
   - Confirm no `data/radar-data.json` commit was pushed if failure happened before final checks.
   - Check artifact availability.
   - Do not manually edit AI text.
   - Do not add retries without approval.

## 9. Future no-go rules

- Do not add auto-retry provider calls without explicit approval.
- Do not add more than one scheduled refresh per day without explicit approval.
- Do not add external notification secrets without explicit approval.
- Do not let a monitoring workflow call DeepSeek.
- Do not let a monitoring workflow write `data/radar-data.json`.
- Do not let a monitoring workflow change frontend files.
- Do not create alert spam on every success.

## 10. Current decision

- Monitoring design: complete in this PR.
- GitHub native failed-workflow notification: recommended first.
- Dedicated issue or webhook notification workflow: not implemented yet.
- Automatic provider retry: NO-GO.
- Additional schedules: NO-GO.
- External notification secrets: NO-GO.

Recommended next step:

```text
Either stop here, or later implement v28.0L-4D GitHub Native Notification Setup Notes / Issue-Based Failure Monitor - No Provider Call.
```
