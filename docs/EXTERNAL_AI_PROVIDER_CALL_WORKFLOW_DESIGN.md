# External AI Provider-Call Workflow Design - v28.0L-3C

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a documentation-only provider-call workflow design.

No provider-call workflow is added. No workflow file is added or modified. No GitHub secret is added. No `DEEPSEEK_API_KEY` is read. No DeepSeek call is run. No provider output artifact is generated. No production data write is added. No frontend display is added. No Daily integration is added. No scoring / decision / execution / position behavior changes.

`externalAiInterpretationLayer` remains the disabled scaffold. The existing v28.0L-3B dry-run workflow remains dry-run-only.

## 2. Baseline

Reviewed baseline:

- v28.0K-4D manual DeepSeek artifact path: local/manual only, explicit opt-in, validator-gated, and outside production data.
- v28.0K-4E compact live input path: manual artifacts can be built from site-structured data, including compact input.
- v28.0K-4E-4 provider failure classification: failure artifacts classify `provider_unavailable`, `provider_timeout`, and related provider failures.
- v28.0K-4F quality review gate: `review:external-ai-artifact` keeps `promotionEligible=false`.
- v28.0K-4G manual baseline: external AI remains manual-only, artifact-only, non-production, and non-user-visible.
- v28.0L-0 production integration design: production integration is future-only and staged.
- v28.0L-1 readiness audit: production integration remains `not_ready`.
- v28.0L-2 disabled provider skeleton: no-network, no-secret, no-provider-call skeleton exists.
- v28.0L-3 manual `workflow_dispatch` artifact-only design: workflow provider tests must be manually triggered and artifact-only.
- v28.0L-3B dry-run workflow skeleton: `External AI Manual Dry Run` is dry-run-only and references no provider secret.
- v28.0L-3B-1 successful dry-run audit: run `25583503038` checked out commit `2ae6e5e`, stayed `provider=none`, made no DeepSeek call, read no secret, wrote no production data, changed no frontend, and passed post-run safety assertions.

## 3. Future provider-call workflow purpose

A future provider-call workflow should:

- remain manual `workflow_dispatch` only
- call DeepSeek only after explicit operator input
- use a GitHub Actions secret for `DEEPSEEK_API_KEY`
- use compact site-structured input only
- validate provider output with `check:external-ai-output`
- run `review:external-ai-artifact`
- upload sanitized artifacts only
- write no production data
- change no frontend
- not trigger Daily
- not run on schedule
- not run on push
- not run on `pull_request`
- not run on `workflow_run`
- not enable `externalAiInterpretationLayer`
- not affect scoring / decision / execution / position

## 4. Proposed future workflow evolution

Future provider-call implementation should modify the existing dry-run workflow or create a separate workflow only in a later reviewed PR.

Recommended future workflow name:

```text
External AI Manual Provider Test
```

Trigger:

```text
workflow_dispatch only
```

No schedule. No push. No `pull_request`. No `workflow_run`.

Recommended future inputs:

- `provider`
  - default: `deepseek`
  - allowed: `deepseek` only
- `input_source`
  - default: `live_compact`
  - allowed: `live_compact`, `local_compact`, `fixture_sample`
- `dry_run`
  - default: `true`
  - provider call allowed only if `dry_run=false`
- `allow_network`
  - default: `false`
  - provider call allowed only if `allow_network=true`
- `validate_output`
  - default: `true`
  - must remain `true`
- `timeout_ms`
  - default: `120000`
  - max: `180000`
- `upload_artifacts`
  - default: `true`
- `max_attempts`
  - default: `1`
  - max: `1` for first provider-call implementation
- `acknowledge_cost`
  - default: `false`
  - provider call allowed only if `true`
- `acknowledge_non_production`
  - default: `false`
  - provider call allowed only if `true`

Provider call should require all gates:

```text
dry_run=false
allow_network=true
provider=deepseek
validate_output=true
max_attempts=1
acknowledge_cost=true
acknowledge_non_production=true
DEEPSEEK_API_KEY available as secret env var
```

## 5. Secret strategy

This is design only. L-3C does not add or require this secret.

Future secret:

```text
DEEPSEEK_API_KEY
```

Preferred order:

1. Protected GitHub Environment secret with required manual approval, if available.
2. Repository Actions secret if environment protection is not available.

Requirements:

- secret must never be committed
- secret must never be printed
- secret must not be passed as a CLI argument
- secret must be injected only as an environment variable into the provider-call step
- only the provider-call step should receive `DEEPSEEK_API_KEY`
- preflight, build-input, validator, and review steps should not receive `DEEPSEEK_API_KEY`
- workflow logs must not echo secret
- workflow must not run on `pull_request` from forks
- workflow must not expose secrets to untrusted events
- secret rotation procedure must exist before implementation
- emergency revocation procedure must exist before implementation
- if a key is exposed, rotate immediately and record an incident note

## 6. Future job design

Recommended future provider-call job steps:

1. Checkout repository.
2. Setup Node.js.
3. Install dependencies using existing project convention.
4. Run preflight checks:

```bash
npm run check:external-ai-manual-workflow
npm run check:external-ai-production-provider-path
npm run check:external-ai-manual-scaffold
```

5. Build compact input:

- `live_compact` should use the allowlisted live radar-data URL.
- `local_compact` should use local `data/radar-data.json`.
- `fixture_sample` should use the docs fixture.

6. Run dry-run path first and record dry-run diagnostics.
7. Evaluate provider-call gates.
8. If gates are not satisfied:

- skip provider call
- upload dry-run diagnostics only

9. If gates are satisfied:

- inject `DEEPSEEK_API_KEY` only into the provider-call step
- run:

```bash
node scripts/run-external-ai-manual-test.mjs --provider deepseek --input manual-artifacts/external-ai/manual-input-live-compact.json --output manual-artifacts/external-ai/deepseek-output-latest.json --allow-network --validate-output --timeout-ms 120000
```

10. Run:

```bash
npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json
```

11. Run:

```bash
npm run review:external-ai-artifact
```

12. Upload sanitized artifacts only.
13. Do not commit anything.
14. Do not push anything.
15. Do not write `data/radar-data.json`.
16. Do not modify frontend or Worker.

## 7. Artifact policy

Allowed future artifacts:

- `manual-artifacts/external-ai/manual-input-live-compact.json`
- `manual-artifacts/external-ai/workflow-dry-run-report.json`
- `manual-artifacts/external-ai/deepseek-output-latest.json`
- `manual-artifacts/external-ai/external-ai-quality-review-latest.json`
- provider failure artifact, if sanitized

Allowed artifacts are still non-production and may be uploaded only if sanitized.

Forbidden artifact contents:

- API keys
- Authorization headers
- raw request headers
- `.env` files
- GitHub tokens
- raw provider response if unsafe
- private user data
- production data modifications
- frontend-visible generated output
- `data/radar-data.json`
- `realtime/*.json`
- `config/*.json`

Artifact settings:

- `retention-days: 3` by default
- artifact name must include run ID and provider status
- artifact upload does not equal promotion
- artifacts must not be copied into production data
- artifacts must not be displayed in frontend

## 8. Provider output and validation policy

Successful provider output must pass:

1. Structural validator:

```bash
npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json
```

2. Quality review:

```bash
npm run review:external-ai-artifact
```

Quality recommendation handling:

- `pass_for_manual_review`
  - artifact may be manually inspected
  - still non-production
  - no frontend display
  - no data write
- `needs_prompt_revision`
  - do not promote
  - prompt/design fix required
- `provider_failure_only`
  - provider issue
  - not valid external AI output
  - do not promote
- `reject_for_promotion`
  - do not promote

`promotionEligible` remains false.

## 9. Failure classification and exit policy

Expected classifications:

- `provider_unavailable`
- `provider_timeout`
- `provider_http_error`
- `provider_empty_content`
- `provider_invalid_json`
- `provider_content_filter`
- `provider_length_truncated`
- `provider_unknown_error`

Recommended exit policy for the first provider-call workflow: fail closed for provider-call mode, while keeping dry-run skip successful.

Rationale: the first provider-call workflow should make provider-call problems visible without treating provider artifacts as production output. Dry-run mode can remain successful because it proves the no-secret/no-provider path.

Policy:

- dry-run success with provider skipped:
  - workflow success
- provider call success plus validator pass plus quality review pass/warn:
  - workflow success, artifact-only
- `provider_unavailable` / 503:
  - workflow fail
  - do not retry repeatedly
  - upload sanitized failure artifact if safe
- `provider_timeout`:
  - workflow fail
  - do not retry repeatedly
  - upload sanitized failure artifact if safe
- validator fail:
  - workflow fail
  - upload artifact if sanitized
- quality review `reject_for_promotion`:
  - workflow fail
  - no promotion
- quality review `needs_prompt_revision`:
  - workflow fail
  - no promotion
- quality review `provider_failure_only`:
  - workflow fail
  - no promotion
- missing secret:
  - workflow fail before provider step
- unsafe artifact scan fail:
  - workflow fail

## 10. Cost control policy

Future provider-call workflow must enforce:

- `workflow_dispatch` only
- `max_attempts=1`
- no schedule
- no push
- no `workflow_run` loop
- no automatic retry
- compact input only by default
- max timeout `180000`
- default timeout `120000`
- input size diagnostics
- explicit `acknowledge_cost=true` required
- no repeated paid calls after `provider_unavailable`
- no repeated paid calls after `provider_timeout`
- no concurrent provider-call storm
- consider a concurrency group specific to provider calls
- manual operator must inspect result before rerun

## 11. Security and log redaction

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
- artifact name / run ID

Future logs must not include:

- `DEEPSEEK_API_KEY`
- Authorization header
- raw request headers
- raw provider response if unsafe
- GitHub token
- `.env` content
- secrets context
- full environment dump

Provider-call step should not use `set -x`.

## 12. Production data / frontend / Daily boundaries

Future provider-call workflow must not:

- write `data/radar-data.json`
- write `data/*.json`
- write `realtime/*.json`
- write `config/*.json`
- modify `externalAiInterpretationLayer` in production data
- make frontend visible
- change `index.html`
- change `scripts/app.js`
- change `scripts/modules/*.js`
- change Worker
- trigger Daily
- trigger Pages deployment through data changes
- change scoring
- change decision model
- change execution lock
- change position guidance

Provider-call workflow remains artifact-only.

## 13. Required implementation checks for future PR

Future implementation PR must include static/deterministic checks proving:

- workflow is `workflow_dispatch` only
- no schedule / push / `pull_request` / `workflow_run`
- provider-call requires all gates
- secret is referenced only in provider-call step
- dry-run path remains default
- `max_attempts` is `1`
- artifacts are short-retention
- forbidden artifact names are guarded
- `data/radar-data.json` is not written
- frontend/Worker files are not modified
- no production data write commands exist
- no `build:data` / `build:realtime` / `build:world-order`
- no `wrangler deploy`
- no Pages deployment changes

## 14. Acceptance criteria before provider-call implementation

Before implementing provider-call workflow:

- L-3C design merged and green.
- v28.0L-3D readiness checklist reviewed and green.
- Secret storage decision completed.
- Secret rotation/revocation documented.
- Exit policy selected.
- Artifact retention confirmed.
- Cost budget confirmed.
- Concurrency policy confirmed.
- Operator approval process agreed.
- No production data write remains agreed.
- No frontend display remains agreed.
- L-3B dry-run workflow remains green.
- `check:all` remains green.

## 15. Acceptance criteria after provider-call implementation

After future provider-call implementation:

- Run dry-run mode first.
- Confirm dry-run still `provider=none`.
- Confirm provider-call mode only runs with explicit gates.
- Confirm missing secret fails safely.
- Confirm provider failure artifact is sanitized.
- Confirm successful output passes validator.
- Confirm quality review runs.
- Confirm `promotionEligible` remains false.
- Confirm no production data changes.
- Confirm no frontend changes.
- Confirm no Daily trigger.

## 16. Non-goals

v28.0L-3C does not:

- add provider-call workflow
- modify existing workflow
- add secrets
- read secrets
- call DeepSeek
- upload provider artifacts
- write production data
- change frontend
- change Worker
- change Daily
- change scoring
- change decisions
- change execution
- change position guidance
- enable `externalAiInterpretationLayer`
- promote manual artifacts

## 17. Final decision

Current decision:

```text
Provider-call workflow design may be reviewed, but implementation is not included in v28.0L-3C.
```

Recommended next PR if this design is accepted:

```text
v28.0L-3D Provider-Call Workflow Readiness Checklist - No Code
```

v28.0L-3D is the gate before implementation. L-3C design alone is not approval to add a provider-call workflow, add GitHub secrets, reference `DEEPSEEK_API_KEY`, or run DeepSeek from GitHub Actions.

v28.0L-3E is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md). It is the no-code implementation plan; it still adds no workflow, no secret, and no provider call.

Recommended next implementation PR after L-3E review:

```text
v28.0L-3F Manual Provider-Call Workflow Skeleton - Missing-Secret Safe / No Real Provider Call
```

Any implementation PR must be separate and must preserve all artifact-only and non-production boundaries.

## 18. v28.0L-3F provider-test skeleton note

v28.0L-3F implements a provider-call-capable skeleton only. It adds `External AI Manual Provider Test` as a manual `workflow_dispatch` workflow, plus static workflow and artifact safety checks.

The skeleton intentionally blocks real provider calls:

- default path is dry-run only
- provider path requires explicit gates
- provider path fails before provider command when `DEEPSEEK_API_KEY` is missing
- provider path also fails closed if a secret is present, because L-3F is no-real-provider-call
- executable workflow shell does not run the DeepSeek provider command
- no provider output artifact is uploaded
- no production data, frontend, Daily, scoring, decision, execution, or position behavior changes

The next step after L-3F is an audit-sync PR that records default dry-run PASS and provider-path-without-secret FAIL before any real provider call is considered.

## 19. v28.0L-3F-1 provider-test skeleton audit note

v28.0L-3F-1 records that the L-3F skeleton was tested through both required GitHub Actions paths:

- Run `25591115649`: default dry-run PASS.
- Run `25591202053`: provider path without secret failed safely before provider command.

Both safety outcomes matched expectations. The missing-secret run confirmed `DEEPSEEK_API_KEY` was empty and the workflow stopped in the missing-secret gate before any provider command.

The real provider-call path remains blocked. This audit does not approve adding `DEEPSEEK_API_KEY`, running DeepSeek, uploading provider output artifacts, writing production data, changing frontend display, or integrating with Daily / Worker / scoring / decision / execution / position behavior.

## 20. v28.0L-3G secret gate and first-call design note

v28.0L-3G is documented in [`EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md`](EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md). It decides that the first real provider-call workflow, if separately approved later, should use GitHub Environment `external-ai-manual` and Environment secret `DEEPSEEK_API_KEY`.

The first real provider-call path must:

- remain manual `workflow_dispatch` only.
- use the environment secret only in the provider-call step.
- keep the key out of CLI arguments and logs.
- run `fixture_sample` first, not live data.
- remain artifact-only.
- run validator, quality review, and artifact sanitizer gates.
- keep `promotionEligible=false`.
- write no production data and display nothing in frontend.

L-3G does not add the secret, does not modify workflows, and does not run DeepSeek. The real provider-call path remains blocked until a separate approved implementation PR changes the workflow.
