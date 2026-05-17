# M-60 Pages Trigger Coverage

M-60 replaces the one-off M-59 fixup Pages trigger with a centralized
`workflow_run` contract in the Pages workflow, then adds a heuristic checker so
future workflows that commit to `main` cannot silently skip Pages deployment
wiring.

## Motivation

PR #212 added `Refresh World Order Stress`, which refreshes
`data/world-order-stress.json` and commits to `main`. The refresh succeeded, but
the Pages deploy workflow did not automatically run because bot commits made
with the default `GITHUB_TOKEN` do not trigger normal `push` workflows.

PR #213 fixed that workflow with a per-workflow `gh workflow run` step. That
worked for one file, but it was not systemic: every future committing workflow
would need to remember the same glue code.

The follow-up workflow audit found the same latent hole in
`external-ai-production-refresh.yml`: it commits `data/radar-data.json` to
`main` at 23:50 UTC, but did not auto-trigger Pages. The effect was mostly
masked because the next day's daily-radar workflow rewrites the same file, but
the worst-case user-visible latency was still roughly 22 hours.

## Root Cause

GitHub documents the anti-recursion rule for workflow-triggered repository
changes: events triggered by the repository `GITHUB_TOKEN` generally "will not
create a new workflow run", except for explicit `workflow_dispatch` and
`repository_dispatch` events.

Reference: [GitHub Docs: Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

The Pages `push` trigger remains useful for human or normal repository pushes,
but it is not enough for automated data refresh commits made by workflows.

## Strategy: workflow_run centralization

Pages now declares the committing upstream workflows directly in
`.github/workflows/deploy-static-site-to-pages.yml`:

```yaml
workflow_run:
  workflows:
    - Build Daily Radar Data
    - Refresh World Order Stress
    - External AI Production Refresh
  types:
    - completed
```

GitHub's `workflow_run` trigger is keyed to workflow completion rather than to
the bot's `push` event. The existing Pages job guard already keeps failed
upstream workflows from deploying:

```yaml
if: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}
```

After M-60, new main-committing workflows should be wired through the Pages
workflow list instead of adding per-workflow `gh workflow run` steps.

## Why heuristic auto-detection

A hardcoded expected list would still rely on maintainers remembering to update
the checker when adding a new workflow. M-59 showed that remember-to-wire-it
contracts are fragile.

`scripts/check-pages-trigger-coverage.mjs` scans all workflow files for
`git commit` plus `git push` patterns, categorizes them, and fails when a
workflow appears to commit to `main` but is not listed in the Pages
`workflow_run.workflows` block.

This gives the project a tripwire:

- New workflow commits to `main` and is registered in Pages: pass.
- New workflow commits to `main` and is not registered: fail.
- New workflow commits somewhere else: it must be explicitly excluded with a
  written reason.

## Pages Trigger Contract

Current workflows that trigger Pages through `workflow_run`:

- `Build Daily Radar Data`
- `Refresh World Order Stress`
- `External AI Production Refresh`

Current workflows excluded from Pages because they publish only to the
`realtime-data` branch:

- `Build Realtime Market`
- `Recover Stale Realtime Market`

Current read-only or diagnostic workflows that should not trigger Pages:

- `Check Realtime Health`
- `Check Worker Health`
- `External AI Manual Dry Run`
- `External AI Manual Provider Test`
- `Test API Secrets (Diagnostic)`

## Adding A New Committing Workflow

1. Add the workflow file under `.github/workflows/`.
2. If it commits to `main`, add its top-level `name:` value to
   `deploy-static-site-to-pages.yml` under `workflow_run.workflows`.
3. If it commits somewhere else, add it to `EXCLUDED_FROM_PAGES` in
   `scripts/check-pages-trigger-coverage.mjs` with a written reason.
4. Run `npm run check:pages-trigger-coverage`.
5. Run `npm run check:all`.

## Existing Workflow Changes

`Refresh World Order Stress` no longer contains the PR #213 explicit
`gh workflow run deploy-static-site-to-pages.yml --ref main` step. It now relies
on the centralized Pages `workflow_run` listener.

`External AI Production Refresh` itself is unchanged. M-60 only lists it as a
Pages upstream workflow, closing the latent Pages-latency hole without touching
the provider-call path, data writing logic, or artifact gates.

## Boundaries

M-60 changes workflow wiring, a local checker, and documentation only. It does
not change data files, workers, frontend cache version, nav anchors, DOM ids,
scoring, decision, execution, position logic, `scripts/run-daily-pipeline.mjs`,
`scripts/validate-data.mjs`, or `DESIGN.md`.
