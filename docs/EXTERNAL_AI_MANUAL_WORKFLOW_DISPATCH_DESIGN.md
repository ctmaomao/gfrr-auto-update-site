# External AI Manual Workflow Dispatch Design — v28.0L-3

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a documentation-only workflow design.

No GitHub Actions workflow is added. No `workflow_dispatch` trigger is added. No GitHub secret is added. No provider call is added. No DeepSeek call is run. No production data write is added. No frontend display is added. No scoring / decision / execution / position behavior changes.

`externalAiInterpretationLayer` remains the disabled scaffold. The v28.0L-2 disabled provider skeleton remains no-network, no-secret, and no-production-write.

## 2. Baseline

Reviewed baseline:

- v28.0K-4D manual DeepSeek artifact path.
- v28.0K-4E compact live input path.
- v28.0K-4E-4 provider failure classification.
- v28.0K-4F quality review gate.
- v28.0K-4G manual baseline.
- v28.0L-0 production integration design.
- v28.0L-1 readiness audit.
- v28.0L-2 disabled provider skeleton.

v28.0L-3 does not change runtime behavior.

## 3. Future workflow goal

A future `workflow_dispatch` should:

- run only when manually triggered
- use a GitHub Actions secret for `DEEPSEEK_API_KEY`
- build compact site-structured input
- call DeepSeek only behind explicit workflow input and feature gate
- validate output
- run quality review
- upload sanitized artifacts only
- write no production data
- change no frontend
- not trigger Daily
- not run on schedule
- not run on `pull_request`
- not run from forks
- not make `externalAiInterpretationLayer` enabled
- not affect scoring / decision / execution / position

## 4. Proposed future workflow name and trigger

Future workflow name:

```text
External AI Manual Provider Test
```

Trigger:

```text
workflow_dispatch only
```

No schedule. No push. No `pull_request`. No `workflow_run`.

Future workflow inputs should be designed as:

- `provider`
  - default: `deepseek`
  - allowed: `deepseek` only for first implementation
- `input_source`
  - default: `live_compact`
  - allowed: `live_compact`, `local_compact`, `fixture_sample`
- `allow_network`
  - default: `false`
  - must be explicitly `true` to call provider
- `validate_output`
  - default: `true`
  - must remain `true`
- `timeout_ms`
  - default: `120000`
  - max: `180000`
- `upload_artifacts`
  - default: `true`
- `dry_run`
  - default: `true`
  - must be `false` plus `allow_network=true` before provider call
- `max_attempts`
  - default: `1`
  - max: `1` for first implementation

The first implemented workflow should require both `dry_run=false` and `allow_network=true`, so accidental dispatches remain dry-run.

## 5. Secret design

This section is design-only. L-3 does not add or require this secret.

Future secret:

```text
DEEPSEEK_API_KEY
```

Preferred storage:

- protected GitHub Environment secret if repository supports environments and manual approvals
- otherwise repository Actions secret

Requirements:

- secret must never be committed
- secret must never be printed
- secret must not be passed as a CLI argument
- secret should be injected only as an environment variable into the one provider-call step
- logs must not echo secret
- workflow should not expose secrets to `pull_request` from forks
- secret rotation procedure must be documented before implementation
- emergency revocation procedure must be documented before implementation

## 6. Future workflow job design

Future job should run on `ubuntu-latest` or the current repo-supported runner.

Recommended steps:

1. Checkout repository.
2. Set up Node using project engine.
3. Run install using existing project convention.
4. Run safety checks:

```bash
npm run check:external-ai-production-provider-path
npm run check:external-ai-manual-scaffold
```

5. Build compact input:

```bash
node scripts/build-external-ai-manual-input.mjs --compact --source-url https://radar.gfrfinradar.uk/data/radar-data.json --output manual-artifacts/external-ai/manual-input-live-compact.json
```

6. If `dry_run=true`:

```bash
npm run manual:external-ai:dry-run
```

Then skip provider call.

7. If `dry_run=false` and `allow_network=true`, run the DeepSeek manual command using env `DEEPSEEK_API_KEY`, output to `manual-artifacts/external-ai/deepseek-output-latest.json`, and validate output.

8. Run:

```bash
npm run review:external-ai-artifact
```

9. Upload sanitized artifacts only.
10. Do not commit anything.
11. Do not push anything.
12. Do not write `data/radar-data.json`.

## 7. Artifact upload design

Future workflow may upload artifacts for manual inspection only.

Allowed artifact paths:

- `manual-artifacts/external-ai/manual-input-live-compact.json`
- `manual-artifacts/external-ai/deepseek-output-latest.json`
- `manual-artifacts/external-ai/external-ai-quality-review-latest.json`

Upload only after a safety scan confirms they contain no secrets.

Forbidden artifact contents:

- API keys
- raw request headers
- Authorization headers
- raw provider response if unsafe
- `.env`
- GitHub token
- private user data
- production data writes
- workflow logs containing secrets

Artifact settings:

- short retention, e.g. 3 to 7 days
- name includes run id and provider status
- no long retention by default
- no upload on `pull_request` from forks
- use current supported `upload-artifact` version at implementation time
- artifact upload must not be treated as promotion

## 8. Log redaction and diagnostics

Future logs may include:

- provider name
- model
- status
- `failureCategory`
- `timeoutMs`
- `inputApproxBytes`
- `inputApproxChars`
- validator status
- quality review recommendation
- productionImpact false flags

Future logs must not include:

- `DEEPSEEK_API_KEY`
- Authorization header
- raw request headers
- full raw request body if it could include secrets
- GitHub token
- `.env` content

## 9. Provider failure behavior

Future workflow must classify:

- `provider_unavailable`
- `provider_timeout`
- `provider_http_error`
- `provider_empty_content`
- `provider_invalid_json`
- `provider_content_filter`
- `provider_length_truncated`
- `provider_unknown_error`

Rules:

- `provider_unavailable` / HTTP 503:
  - do not retry repeatedly
  - max attempts 1 for first implementation
  - mark `provider_failure_only`
  - upload failure artifact if sanitized
  - workflow should complete with clear failure or warning depending selected mode
- `provider_timeout`:
  - max attempts 1 for first implementation
  - use compact input
  - no retry storm
  - upload failure artifact if sanitized
- invalid JSON / content filter:
  - do not retry unchanged
  - require prompt/design review

## 10. Cost control

Future workflow must include:

- `max_attempts=1` for first implementation
- no scheduled runs
- no automatic retries
- no `workflow_run` loops
- compact input only by default
- timeout limit
- input size diagnostic
- provider call must require explicit manual dispatch inputs
- no repeated paid calls after `provider_unavailable` or `provider_timeout`
- no Daily invocation
- no concurrent provider storm

Open question:

- Should GitHub concurrency be used to prevent overlapping manual provider tests?

## 11. Production data and frontend boundaries

Future workflow must not:

- write `data/radar-data.json`
- write `data/*.json`
- write `realtime/*.json`
- modify production `externalAiInterpretationLayer`
- make frontend visible
- change `index.html`
- change `scripts/app.js`
- change `scripts/modules/*.js`
- change Worker
- trigger Pages deploy because of data changes
- affect scoring / decision / execution / position

Future workflow output remains artifact-only.

## 12. Quality gate behavior

Future workflow must run:

1. `check:external-ai-output` on successful provider output.
2. `review:external-ai-artifact` after provider output or failure artifact.

Interpretation:

- `pass_for_manual_review`: artifact may be inspected manually, but is not production and not frontend visible.
- `needs_prompt_revision`: do not promote; prompt/design fix required.
- `provider_failure_only`: provider issue, not valid output; do not promote.
- `reject_for_promotion`: do not promote.

`promotionEligible` remains false.

## 13. Security acceptance criteria before implementation

Before adding the actual workflow:

- L-3 design merged and green.
- Secret storage decision made.
- Secret rotation / revocation documented.
- Trigger permissions agreed.
- Artifact retention agreed.
- Cost budget agreed.
- No fork PR secret exposure path.
- No scheduled provider call.
- No production data write.
- No frontend display.
- Logs are sanitized.
- Failure artifacts are sanitized.

## 14. Proposed future implementation stages

Recommended future path:

L-3A:

- documentation-only design accepted

L-3B:

- add workflow file in disabled/dry-run-only mode
- no secret use
- no provider call
- artifact upload of dry-run diagnostics only

L-3C:

- add `workflow_dispatch` provider-call path behind explicit inputs and environment secret
- still artifact-only
- no production data
- no frontend

L-3D:

- audit manual workflow run results
- no production promotion

Each must be a separate PR.

## 15. Non-goals

v28.0L-3 does not:

- add workflow file
- add `workflow_dispatch` trigger
- add GitHub secret
- call DeepSeek
- read secret
- upload artifacts
- write production data
- change frontend
- change Worker
- change scoring
- change decisions
- change execution
- change position guidance
- enable `externalAiInterpretationLayer`
- promote manual artifacts

## 16. Final decision

Current decision:

```text
Design ready for future artifact-only workflow planning, but implementation not yet allowed in this PR.
```

Recommended next PR after L-3 merge:

```text
v28.0L-3B Manual Workflow Dispatch Dry-Run Skeleton — No Secret / No Provider Call
```

Do not proceed directly to:

- provider-call workflow
- Daily integration
- production data write
- frontend display

## 17. v28.0L-3B dry-run workflow skeleton

v28.0L-3B adds the first manual workflow skeleton: `.github/workflows/external-ai-manual-dry-run.yml`.

This workflow is intentionally dry-run-only:

- trigger is `workflow_dispatch` only
- no schedule, push, pull request, or workflow_run trigger
- no provider input
- no allow_network input
- no dry_run=false path
- no GitHub secret
- no provider call
- no production data write
- no frontend display
- no Daily / Worker integration

The workflow runs the existing no-network checks, optionally builds a local compact manual input from repository data, runs `scripts/run-external-ai-manual-test.mjs --dry-run`, writes a dry-run report under `manual-artifacts/`, and may upload only sanitized dry-run diagnostics with short retention.

Uploaded artifacts are diagnostics only. They are not production data, are not valid DeepSeek output, and must not be copied into `data/radar-data.json`.

The static guard is:

```bash
npm run check:external-ai-manual-workflow
```

The next stage, if approved, must be a separate L-3C PR. L-3C must not be smuggled into this dry-run workflow by adding provider-call arguments, secrets, allow-network inputs, or provider output uploads.

## v28.0L-3B-1 Manual dry-run workflow audit result

One real GitHub Actions manual dispatch has validated the v28.0L-3B dry-run skeleton:

- Run ID: `25583503038`
- Commit: `2ae6e5e`
- Trigger: `workflow_dispatch`
- Input source: `fixture_sample`
- Upload artifacts: `true`
- Timeout metadata: `120000`
- Result: `PASS`
- Artifact name: `external-ai-manual-dry-run-25583503038`
- Artifact ID: `6890255520`
- Artifact final size: `5895 bytes`
- Retention: `3 days`

Validated safety findings:

- workflow ran as dry-run only
- provider stayed `none`
- `networkAllowed=false`
- `apiCalled=false`
- `secretsRead=false`
- `productionDataWritten=false`
- `frontendDisplayChanged=false`
- no DeepSeek call
- no provider output artifact
- no quality review artifact
- post-run safety assertion passed

This audit does not enable provider calls. It does not add or require `DEEPSEEK_API_KEY`, does not write production data, does not make external AI frontend-visible, and does not change scoring / decision / execution / position behavior.

Artifacts from this run are dry-run diagnostics only. They are not production data, are not external AI output, and must not be copied into `data/radar-data.json` or any frontend-visible path.

## v28.0L-3C provider-call workflow design note

v28.0L-3C is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md). It designs a future provider-call workflow path only.

The existing v28.0L-3B workflow remains dry-run-only. Do not modify the dry-run workflow to call a provider, add provider inputs, add `allow_network`, add a `dry_run=false` path, reference secrets, or upload provider output in the L-3C design PR. Any implementation must be a separate reviewed PR.

## v28.0L-3D provider-call readiness checklist note

v28.0L-3D is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md). It is a documentation-only readiness checklist and does not change workflow behavior.

The v28.0L-3B `External AI Manual Dry Run` workflow remains dry-run-only: no provider input, no `allow_network`, no `dry_run=false` path, no GitHub secret reference, no provider call, no provider output artifact, no production data write, no frontend display, and no Daily integration. L-3D is not approval to modify that workflow.

## v28.0L-3E provider-call implementation plan note

v28.0L-3E is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md). It is a documentation-only plan for a future L-3F provider-test skeleton.

L-3E does not change the v28.0L-3B dry-run workflow. If L-3F is pursued, it should use a missing-secret-safe / no-real-provider-call skeleton first and must keep the existing L-3B dry-run workflow behavior intact.

## v28.0L-3F provider-test workflow skeleton

v28.0L-3F adds a separate `External AI Manual Provider Test` workflow at `.github/workflows/external-ai-manual-provider-test.yml`.

This new workflow does not change the v28.0L-3B `External AI Manual Dry Run` workflow. The L-3B workflow remains dry-run-only with no provider input, no `allow_network`, no `dry_run=false` path, no secret reference, no provider call, and no provider output upload.

The L-3F provider-test workflow is also no-real-provider-call:

- default run is dry-run only
- provider path is structurally gated
- missing `DEEPSEEK_API_KEY` fails before provider command
- secret-present state also fails closed in L-3F
- no DeepSeek command is executed
- no provider output artifact is produced
- artifacts remain diagnostics only

## v28.0L-3F-1 provider-test workflow audit

The `External AI Manual Provider Test` workflow has passed the L-3F skeleton audit:

- Run `25591115649` validated the default dry-run path as PASS.
- Run `25591202053` validated the provider path without secret as an expected failure before provider command.

The workflow remains no-real-provider-call. `DEEPSEEK_API_KEY` was empty in the missing-secret test, no DeepSeek call occurred, no provider output artifact was produced, and no production data or frontend path changed.
