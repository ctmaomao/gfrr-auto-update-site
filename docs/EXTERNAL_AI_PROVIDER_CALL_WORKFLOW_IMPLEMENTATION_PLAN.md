# External AI Provider-Call Workflow Implementation Plan — v28.0L-3E

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a documentation-only implementation plan.

- No provider-call workflow is added.
- No workflow file is added or modified.
- No GitHub secret is added.
- No `DEEPSEEK_API_KEY` is read.
- No DeepSeek call is run.
- No provider output artifact is generated.
- No production data write is added.
- No frontend display is added.
- No Daily integration is added.
- No scoring / decision / execution / position behavior changes.
- `externalAiInterpretationLayer` remains the disabled scaffold.
- Existing v28.0L-3B dry-run workflow remains dry-run-only.

## 2. Baseline reviewed

Reviewed baseline:

- v28.0L-3B dry-run workflow has passed one real `workflow_dispatch` audit: run `25583503038`, commit `2ae6e5e`, `provider=none`, `networkAllowed=false`, `apiCalled=false`, `secretsRead=false`, `productionDataWritten=false`, `frontendDisplayChanged=false`, no DeepSeek call, no provider output artifact, and no quality review artifact.
- v28.0L-3C provider-call workflow design is merged and documents future gates, secret boundaries, validation, quality review, artifact policy, exit policy, and cost control.
- v28.0L-3D readiness checklist is merged and records provider-call implementation as `not_ready_until_missing_items_resolved`.
- v28.0L-3D post-merge audit passed: `check:docs`, `check:all`, `check:external-ai-manual-workflow`, and `check:data` passed, and `docs/EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md` exists.
- Provider-call implementation remains not active.
- GitHub secret usage remains not active.
- Production integration remains not active.

## 3. Implementation strategy

The next implementation should not perform a real provider call yet.

Recommended next implementation PR:

```text
v28.0L-3F Manual Provider-Call Workflow Skeleton — Missing-Secret Safe / No Real Provider Call
```

Purpose of L-3F:

- Add a provider-call-capable workflow skeleton.
- Keep provider-call path blocked by missing-secret / disabled gates.
- Add static checker for provider-call workflow.
- Add missing-secret fail-before-provider-call behavior.
- Add artifact sanitization checker stub or deterministic scan.
- Do not configure `DEEPSEEK_API_KEY`.
- Do not run real DeepSeek.
- Do not upload provider output.
- Do not write production data.
- Do not change frontend.

This lets the repository test workflow structure and failure gates before spending any provider call.

## 4. Resolved plan for missing readiness items

### 4.1 GitHub secret storage decision

Planned decision:

- Prefer protected GitHub Environment secret named `DEEPSEEK_API_KEY` under an environment such as `external-ai-manual`.
- If environment protection is unavailable, use repository Actions secret named `DEEPSEEK_API_KEY` only after separate approval.
- Do not create the secret in L-3E or L-3F.
- The first implementation PR should test missing-secret behavior only.

### 4.2 Secret rotation / revocation procedure

Planned procedure:

- If a key is exposed in chat, logs, artifact, or commit, immediately revoke it at the provider dashboard.
- Create a new key.
- Update GitHub secret only after revocation.
- Record the incident in operations notes.
- Never paste the full key into chat or issue/PR comments.
- Never pass the key as a command-line argument.
- Never echo the key.

### 4.3 Provider-call workflow static checker

Planned implementation in L-3F:

Add a checker such as:

```text
scripts/check-external-ai-provider-workflow.mjs
```

It should verify:

- workflow is `workflow_dispatch` only
- no schedule
- no push
- no `pull_request`
- no `workflow_run`
- `dry_run` default true
- `allow_network` default false
- `acknowledge_cost` default false
- `acknowledge_non_production` default false
- `max_attempts` max 1
- provider is DeepSeek only
- `DEEPSEEK_API_KEY` appears only in the provider-call step
- secret is injected through env only
- secret is not passed as CLI argument
- provider call command is gated
- missing secret check happens before provider call
- `check:external-ai-output` runs after provider output
- `review:external-ai-artifact` runs after provider output or failure artifact
- artifact upload uses `retention-days: 3`
- forbidden file uploads are blocked
- no `data/radar-data.json` writes
- no frontend / Worker / config / data writes
- no `build:data` / `build:realtime` / `build:world-order`
- no `wrangler`
- no Pages deploy
- no Daily trigger

### 4.4 Missing-secret failure test plan

Planned L-3F behavior:

- Provider-call path may be structurally present.
- `DEEPSEEK_API_KEY` must not be configured.
- If provider-call gates are requested but secret is missing, workflow must fail before provider call.
- Failure message should say missing required provider secret without printing the secret value or environment.
- Static checker must verify this preflight exists.

### 4.5 Provider-call artifact sanitization checker

Planned L-3F behavior:

Add deterministic artifact safety scan, either as a workflow step or script, that rejects:

- `DEEPSEEK_API_KEY`
- `Authorization`
- `Bearer`
- `api_key`
- `secrets.`
- `.env`
- GitHub token
- raw headers
- `data/radar-data.json`
- `realtime/*.json`
- `config/*.json`
- unsafe provider raw dump

In L-3F, since no provider output is created, the checker can validate dry-run and failure artifacts only.

### 4.6 Operator approval process

Planned process for the first real provider-call run after L-3F:

Operator must confirm:

- workflow is manual only
- `max_attempts=1`
- `acknowledge_cost=true`
- `acknowledge_non_production=true`
- output is artifact-only
- no production data write
- no frontend display
- no Daily trigger

Approval can be documented in the PR or operations notes before the first real provider-call run.

### 4.7 Cost budget confirmation

Planned budget:

- `max_attempts=1`
- no automatic retry
- no scheduled runs
- no rerun loop
- compact input only
- default `timeout_ms=120000`
- max `timeout_ms=180000`
- do not rerun repeatedly after `provider_unavailable` or `provider_timeout`
- if provider fails, inspect diagnostics before any rerun

### 4.8 Concurrency policy

Planned policy:

- Use provider-call-specific concurrency group:

```text
external-ai-manual-provider-test
```

- `cancel-in-progress: false`
- Purpose: prevent overlapping provider-call runs.
- Dry-run workflow can keep its own separate concurrency group.

## 5. Proposed L-3F implementation scope

L-3F should be the next implementation PR.

Allowed L-3F scope:

- Add a new provider-test workflow file, or add a separate job to existing workflow only if safer.
- Prefer separate workflow:

```text
.github/workflows/external-ai-manual-provider-test.yml
```

- `workflow_dispatch` only
- `dry_run` default true
- `allow_network` default false
- `acknowledge_cost` default false
- `acknowledge_non_production` default false
- `max_attempts` default 1, max 1
- provider choice DeepSeek only
- missing-secret preflight
- static workflow checker
- artifact sanitizer
- no actual provider call unless all gates pass and secret exists
- because no secret should be configured yet, first run should fail safely before provider call if provider path is requested
- default dry-run path should pass
- upload dry-run diagnostics only
- no production data
- no frontend

Forbidden L-3F scope:

- Adding `DEEPSEEK_API_KEY` to GitHub Secrets.
- Running a real DeepSeek call.
- Writing `data/radar-data.json`.
- Displaying output in frontend.
- Daily integration.
- Scoring / decision / execution / position changes.
- Adding OpenAI provider.
- Adding SDKs/dependencies.
- Uploading provider output artifacts from a real call.

## 6. Proposed L-3F workflow inputs

Future L-3F provider-test workflow inputs:

- `provider`
  - type: choice
  - options: `deepseek`
  - default: `deepseek`
- `input_source`
  - type: choice
  - options: `fixture_sample`, `local_compact`
  - default: `fixture_sample`
  - `live_compact` should remain out of L-3F if avoiding network is preferred, or included only if explicitly allowed.
- `dry_run`
  - type: choice or boolean
  - default: `true`
  - provider path requires `false`
- `allow_network`
  - type: choice or boolean
  - default: `false`
  - provider path requires `true`
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
  - must reject anything except `1`
- `acknowledge_cost`
  - default: `false`
- `acknowledge_non_production`
  - default: `false`

In L-3F, because the secret is not configured, provider-call attempt should fail before provider call.

## 7. Proposed L-3F workflow behavior

Default run:

- `dry_run=true`
- provider call skipped
- no secret read
- no network
- dry-run diagnostics produced
- sanitized dry-run artifact optionally uploaded
- workflow success

Provider-path requested without secret:

- `dry_run=false`
- `allow_network=true`
- `acknowledge_cost=true`
- `acknowledge_non_production=true`
- `max_attempts=1`
- `DEEPSEEK_API_KEY` not configured
- workflow fails before provider command
- no provider call
- no provider output
- no production data
- no frontend

Gate mismatch:

- any required acknowledgement missing
- workflow fails or skips safely before provider command
- no provider call

Invalid `max_attempts`:

- workflow fails before provider command
- no provider call

## 8. Proposed L-3F commands

Default dry-run command:

```bash
node scripts/run-external-ai-manual-test.mjs --dry-run --input docs/fixtures/external-ai/sample-input-v28.0K-1.json > manual-artifacts/external-ai/workflow-dry-run-report.json
```

Provider command should exist only behind gates and missing-secret preflight:

```bash
node scripts/run-external-ai-manual-test.mjs --provider deepseek --input manual-artifacts/external-ai/manual-input-compact-latest.json --output manual-artifacts/external-ai/deepseek-output-latest.json --allow-network --validate-output --timeout-ms 120000
```

But in L-3F the expected provider-path test is missing-secret fail-before-provider-command.

The secret must be injected only as env in the provider step:

```yaml
DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
```

Do not pass key as CLI argument.

## 9. Proposed L-3F artifact policy

Allowed artifacts in L-3F:

- `workflow-dry-run-report.json`
- `manual-input-compact-latest.json` if generated
- missing-secret diagnostic artifact if sanitized

Forbidden artifacts in L-3F:

- `deepseek-output-latest.json` from real provider call
- `external-ai-quality-review-latest.json` from real provider call
- `.env`
- `data/radar-data.json`
- `realtime/*.json`
- `config/*.json`
- raw provider response
- raw headers
- authorization header
- GitHub token

Retention:

- 3 days

## 10. Proposed L-3F validation commands

L-3F should run locally:

```bash
node --check scripts/check-external-ai-provider-workflow.mjs
npm run check:external-ai-provider-workflow
npm run check:external-ai-manual-workflow
npm run check:external-ai-production-provider-path
npm run check:workflows
npm run check:docs
npm run check:all
git diff --check
git status --short
```

If L-3F adds an artifact sanitizer script, also run:

```bash
node --check scripts/check-external-ai-workflow-artifacts.mjs
npm run check:external-ai-workflow-artifacts
```

## 11. Proposed L-3F GitHub Actions tests

After L-3F merge, manually trigger:

1. Default dry-run:
   - expected PASS
   - no secret
   - no provider call
2. Provider-path requested without secret:
   - `dry_run=false`
   - `allow_network=true`
   - `acknowledge_cost=true`
   - `acknowledge_non_production=true`
   - expected FAIL before provider command
   - no provider output artifact
   - no DeepSeek call
3. Invalid `max_attempts`:
   - `max_attempts=2`
   - expected FAIL before provider command

These tests must be recorded in a later audit-sync PR.

## 12. Stop rules

Stop L-3F rollout if:

- workflow reads secret in dry-run mode
- workflow runs provider command without secret
- workflow passes provider path when secret is missing
- workflow uploads forbidden files
- workflow writes production data
- workflow modifies frontend
- workflow triggers Daily
- static checker fails
- `check:all` fails

## 13. Production boundaries

Even after L-3F:

- no production integration
- no Daily integration
- no frontend display
- no `externalAiInterpretationLayer` enablement
- no scoring change
- no decision model change
- no execution lock change
- no position guidance change

L-3F is still infrastructure hardening only.

## 14. Non-goals

v28.0L-3E does not:

- add workflow
- modify workflow
- add scripts
- modify package
- add secrets
- read secrets
- call DeepSeek
- run provider workflow
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

## 15. Final decision

Current decision:

```text
Implementation plan ready for review.
```

Recommended next PR:

```text
v28.0L-3F Manual Provider-Call Workflow Skeleton — Missing-Secret Safe / No Real Provider Call
```

Do not proceed directly to:

- adding GitHub secret
- first real provider call
- production data write
- Daily integration
- frontend display

## 16. v28.0L-3F implementation note

v28.0L-3F adds the first `External AI Manual Provider Test` workflow skeleton and supporting checks.

L-3F behavior:

- provider-test workflow skeleton exists
- trigger remains `workflow_dispatch` only
- default path is dry-run only
- provider path is missing-secret safe
- provider path fails before provider command when `DEEPSEEK_API_KEY` is missing
- L-3F blocks real provider calls even if a secret is present
- no provider output artifact is produced
- no production data is written
- no frontend display is added
- existing L-3B dry-run workflow remains dry-run-only

New checks:

- `npm run check:external-ai-provider-workflow`
- `npm run check:external-ai-workflow-artifacts`

Next audit should manually run, after merge:

1. Default provider-test dry-run:
   - expected PASS
   - no secret
   - no provider call
2. Provider-path requested without secret:
   - expected FAIL before provider command
   - no DeepSeek call
   - no provider output artifact

Do not add `DEEPSEEK_API_KEY` or run a real provider call until the L-3F behavior is audited in a later PR.

## 17. v28.0L-3F-1 Provider workflow skeleton audit result

v28.0L-3F-1 records the post-merge GitHub Actions audit for the L-3F provider-test workflow skeleton.

Default dry-run audit:

- Workflow: `External AI Manual Provider Test`
- Run ID: `25591115649`
- Commit: `4df4fd6`
- Inputs: `provider=deepseek`, `input_source=fixture_sample`, `dry_run=true`, `allow_network=false`, `acknowledge_cost=false`, `acknowledge_non_production=false`, `validate_output=true`, `timeout_ms=120000`, `max_attempts=1`, `upload_artifacts=true`
- Result: `success` / `PASS`
- Findings: `provider path requested=false`, `provider command executed=false`, `apiCalled=false`, `networkUsed=false`, `productionDataWritten=false`, `frontendDisplayChanged=false`, artifact safety check PASS, no DeepSeek call, no provider output artifact, no production data write, and no frontend change.

Provider path without secret audit:

- Workflow: `External AI Manual Provider Test`
- Run ID: `25591202053`
- Commit: `4df4fd6`
- Inputs: `provider=deepseek`, `input_source=fixture_sample`, `dry_run=false`, `allow_network=true`, `acknowledge_cost=true`, `acknowledge_non_production=true`, `validate_output=true`, `timeout_ms=120000`, `max_attempts=1`, `upload_artifacts=true`
- Result: expected `failure`, classified as safety `PASS`
- Findings: `provider path requested=true`, `DEEPSEEK_API_KEY` was empty, failed in `Missing-secret safe provider gate`, `provider-test-missing-secret.json` was created with `reason=missing_required_provider_secret` and `status=failed_before_provider_call`, `apiCalled=false`, `secretsRead=false`, `networkUsed=false`, `productionDataWritten=false`, `frontendDisplayChanged=false`, artifact safety check PASS, `provider command executed=false`, no DeepSeek call, no provider output artifact, no production data write, and no frontend change.

Important audit clarification:

- Earlier log reading could confuse printed shell script text with an executed branch.
- The actual GitHub Actions result showed `DEEPSEEK_API_KEY` empty.
- The second test is correctly classified as a missing-secret safe failure before the provider command.

L-3F skeleton audit decision:

- L-3F workflow skeleton is validated.
- Default dry-run path works.
- Missing-secret gate works.
- No DeepSeek call occurred.
- No provider output artifact was produced.
- No production data was written.
- No frontend was changed.
- This audit does not approve adding `DEEPSEEK_API_KEY`.
- This audit does not approve a real provider call.

Recommended next stage:

```text
v28.0L-3G Secret Decision and First Real Provider-Call Gate Design - No Secret Yet
```

## 18. v28.0L-3G secret decision and first-call gate

v28.0L-3G is documented in [`EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md`](EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md). It decides the future secret strategy only.

Decision:

- Preferred secret location: GitHub Environment secret.
- Environment name: `external-ai-manual`.
- Secret name: `DEEPSEEK_API_KEY`.
- Required reviewer / approval should be used if available.
- Repository Actions secret is fallback only if Environment secret approval is unavailable or intentionally rejected.

L-3G does not add the environment, does not add `DEEPSEEK_API_KEY`, does not modify workflows, does not run DeepSeek, and does not produce provider output. The existing L-3F workflow still blocks real provider calls.

Next implementation requires explicit approval. The next possible implementation PR is:

```text
v28.0L-3H Provider-Call Unlock Workflow - Environment Secret Gate / Artifact-Only / No Production Data
```

## 19. v28.0L-3H provider-call unlock implementation

v28.0L-3H implements the approved unlock step for the existing `External AI Manual Provider Test` workflow.

Implementation summary:

- The workflow is split into a no-secret dry-run/gate job and an environment-gated provider-call job.
- The dry-run/gate job has no environment, reads no secret, runs dry-run diagnostics, validates inputs, writes `provider-test-gate-status.json`, and exposes `provider_path_requested`.
- The provider-call job runs only when all explicit gates are satisfied and uses environment `external-ai-manual`.
- `DEEPSEEK_API_KEY` is injected only into the provider-call step environment and is never passed as a CLI argument.
- L-3H allows real provider calls only with `input_source=fixture_sample`; `local_compact` is still dry-run-only.
- The first provider command remains:

```bash
node scripts/run-external-ai-manual-test.mjs --provider deepseek --input docs/fixtures/external-ai/sample-input-v28.0K-1.json --output manual-artifacts/external-ai/deepseek-output-latest.json --allow-network --validate-output --timeout-ms 120000
```

The workflow uses the validated `timeout_ms` input, capped at `180000`.

Required gates after provider output:

- `npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json`
- `npm run review:external-ai-artifact -- --input manual-artifacts/external-ai/deepseek-output-latest.json --output manual-artifacts/external-ai/external-ai-quality-review-latest.json`
- `npm run check:external-ai-workflow-artifacts -- --workflow-provider-test`

The output remains artifact-only. The workflow writes no production data, changes no frontend, triggers no Daily workflow, and does not affect scoring, decision, execution, or position logic.

First run sequence after merge:

1. Run the default dry-run path and confirm provider command executed=false.
2. Create or confirm GitHub Environment `external-ai-manual` and Environment secret `DEEPSEEK_API_KEY`.
3. Manually run the first `fixture_sample` provider call with environment approval.
4. Inspect sanitized artifacts, validator result, and quality review.
5. Record the audit in a follow-up PR before considering any live/local input provider call.

## 20. v28.0L-3H-1 provider-call audit and diagnostic fix

Run `25592238444` executed the first real `fixture_sample` provider call after the `external-ai-manual` environment approval.

Audit summary:

- provider transport works for the approved fixture path.
- provider was `deepseek`; model was `deepseek-v4-flash`.
- exactly one provider call executed.
- output validation passed.
- DeepSeek manual API test passed.
- warnings were 0.
- quality review failed with recommendation `needs_prompt_revision`.
- `promotionEligible=false`.
- no production data was written.
- no frontend display changed.
- no Daily integration, Worker change, config change, scoring change, decision change, execution change, or position change occurred.
- artifact upload was blocked because a diagnostic JSON artifact contained the literal marker `DEEPSEEK_API_KEY`.

Implementation fix:

- workflow diagnostic JSON must not write the literal secret name.
- missing-secret diagnostics use `secretConfigured=false`.
- provider-call diagnostics use `secretConfigured=true`.
- diagnostics use `secretReference=environment_scoped_provider_key`.
- strict artifact sanitizer remains strict and continues to reject forbidden markers.
- failed quality review should still be inspectable through uploaded artifacts when the sanitizer passes.

Operational decision:

- do not rerun the provider-call workflow until this fix is merged.
- do not run live/local input provider calls until `fixture_sample` quality review passes in a later audit.
- next recommended PR is `v28.0L-3H-2 Fixture Sample Prompt/Quality Revision - No Provider Call`.

## 21. v28.0L-3H-2 fixture prompt and quality revision

v28.0L-3H-2 is a prompt / quality guidance revision only.

Scope:

- no provider call.
- no workflow dispatch.
- no secret read or secret change.
- no production data write.
- no frontend, Worker, Daily, config, scoring, decision, execution, or position change.
- no validator weakening.
- no sanitizer weakening.
- no quality review downgrade.

Run `25592238444` proved that provider transport and output validation work for the approved `fixture_sample` path. The offline quality review still blocked promotion with `needs_prompt_revision` and `promotionEligible=false`.

L-3H-2 tightens the prompt so the next fixture output should avoid mixed sample/live source markers, avoid execution / position repetition, provide stronger source attribution, keep confidence conservative but non-zero for usable structured input, and provide more incremental cross-layer synthesis.

The next real provider-call run after this PR must be the second `fixture_sample` provider-call audit only. Do not run live/local input until `fixture_sample` quality review passes.

Recommended next stage:

```text
v28.0L-3H-3 Second Fixture Sample Provider Call Audit
```

## 22. v28.0L-3H-3 second fixture_sample provider-call audit status

Run `25593082968` completed the second `fixture_sample` provider-call audit successfully.

Status update:

- provider transport passed for `provider=deepseek`.
- model was `deepseek-v4-flash`.
- the provider-call job entered through environment `external-ai-manual`.
- the provider key was injected only as a masked GitHub Actions value.
- output validation passed.
- DeepSeek manual API test passed.
- quality review passed with recommendation `pass_for_manual_review`.
- `promotionEligible=false`.
- artifact sanitizer passed.
- sanitized provider-call artifacts uploaded.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.

L-3H-3 confirms that the approved fixture artifact-only path works end to end: provider transport, validator, quality review, sanitizer, and artifact upload all passed. It does not approve production data writes, frontend display, Daily integration, `externalAiInterpretationLayer` promotion, or scoring / decision / execution / position changes.

Recommended next stage:

```text
v28.0L-3I Live/Local Compact Provider-Call Design - No Provider Call
```

The next step may design a live/local compact provider-call path, but it should not execute live/local provider input yet.

## 23. v28.0L-3I live/local compact provider-call design

v28.0L-3I is documented in [`EXTERNAL_AI_LIVE_LOCAL_COMPACT_PROVIDER_CALL_DESIGN.md`](EXTERNAL_AI_LIVE_LOCAL_COMPACT_PROVIDER_CALL_DESIGN.md).

Design status:

- The `fixture_sample` path is verified by run `25593082968`.
- Provider transport, validator, quality review, sanitizer, and artifact upload are verified for the fixture path.
- `local_compact` design is now documented.
- `local_compact` implementation remains separate.
- A future `local_compact` implementation must remain artifact-only.
- A future `local_compact` implementation must not write production data.
- A future `local_compact` implementation must not display output in frontend.
- A future `local_compact` implementation must not trigger Daily or affect scoring / decision / execution / position logic.

Recommended next implementation, only after L-3I is merged and audited:

```text
v28.0L-3J Local Compact Provider-Call Workflow Path - Artifact-Only / No Production Data
```

## 24. v28.0L-3I-0 Node 24 runtime baseline before L-3J

v28.0L-3I-0 is a workflow hygiene prerequisite before any L-3J implementation.

It standardizes local and GitHub Actions runtime on Node.js 24 LTS, updates action majors, adds `check:node-runtime`, and strengthens workflow checks. It does not implement `local_compact`, does not call DeepSeek, does not trigger workflows, does not read secrets, and does not change production data or frontend behavior.

## 25. v28.0L-3J local_compact workflow path

v28.0L-3J implements the `local_compact` provider-call workflow path without running a provider call in the PR.

Status update:

- The `fixture_sample` provider-call path remains verified by run `25593082968`.
- The `local_compact` workflow path is implemented behind the same manual `workflow_dispatch` and `external-ai-manual` environment gate.
- `local_compact` input is built as `manual-artifacts/external-ai/manual-input-compact-latest.json` from repository local structured data.
- The path remains artifact-only and non-production.
- No production data write, frontend display, Daily integration, or scoring / decision / execution / position path is connected.
- Validator, quality review, artifact sanitizer, short artifact retention, and post-run safety assertion remain required.

The first `local_compact` provider call after merge must be one manually approved audit run only. If the validator, quality review, or sanitizer fails, stop; do not rerun immediately and do not proceed to production or frontend work.

Recommended next stage:

```text
v28.0L-3J-1 First Local Compact Provider-Call Audit
```

## 26. v28.0L-3J-1 local_compact sanitizer source path fix

Run `25598085025` was the first attempted `local_compact` provider-call audit. It stopped safely in the dry-run/gate job because the sanitizer treated `data/radar-data.json` inside `manual-input-compact-latest.json` as a forbidden production path marker.

Audit interpretation:

- Compact input generation succeeded from local source metadata.
- Provider gates were satisfied for `input_source=local_compact`.
- The provider-call job did not run.
- No DeepSeek call occurred.
- No secret was read.
- `apiCalled=false` and `networkUsed=false`.
- `productionDataWritten=false` and `frontendDisplayChanged=false`.

L-3J-1 narrows the sanitizer exception for `manual-input-compact-latest.json` only. The artifact may reference `data/radar-data.json` as read-only source metadata, while actual production data upload/write/copy remains forbidden.

Recommended next stage:

```text
v28.0L-3J-2 First Local Compact Provider-Call Audit Retry
```

## 27. v28.0L-3J-3 local_compact execution-language prompt fix

Run `25598379612` completed the `local_compact` provider-call retry through provider transport, output validation, artifact sanitizer, sanitized artifact upload, and non-production safety checks.

Audit interpretation:

- The `local_compact` workflow path works through validator and sanitizer.
- The provider call executed only inside the approved manual provider-call path.
- `productionDataWritten=false` and `frontendDisplayChanged=false`.
- Quality review blocked promotion with `failedDimensions=executionLanguageSafety`.
- The blocking error was `$.facts[5] contains operation-oriented language: 执行灯`.
- `promotionEligible=false` remained correct.

L-3J-3 revises prompt guidance before retry so `decisionContext` operation language is not repeated into facts, summary, inferences, model judgments, scenario hypotheses, invalidation signals, source attribution notes, or audit flags.

This stage does not weaken the validator, quality review, artifact sanitizer, or promotion gate. It does not call DeepSeek, trigger workflows, add secrets, write production data, modify frontend, or change scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3J-4 Local Compact Provider-Call Audit Retry After Execution-Language Fix
```

## 28. v28.0L-3J-4 local_compact provider-call audit sync

Run `25598887574` completed the approved `local_compact` provider-call audit successfully.

Status update:

- The `fixture_sample` path is verified by run `25593082968`.
- The `local_compact` path is now verified by run `25598887574`.
- The `local_compact` input builder produced `manual-input-compact-latest.json` from local `data/radar-data.json` as read-only source metadata.
- Provider transport passed for `provider=deepseek`, model `deepseek-v4-flash`.
- External AI output validation passed.
- External AI artifact quality review passed.
- Artifact sanitizer passed.
- Sanitized provider-call artifacts uploaded.
- `promotionEligible=false`.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.

Implementation interpretation:

- The manual provider-call workflow now has audited `fixture_sample` and `local_compact` artifact-only paths.
- This does not approve a production write path.
- This does not approve frontend display.
- This does not approve Daily integration.
- This does not approve automatic scheduled provider calls.
- This does not approve `promotionEligible=true`.

Next phase:

```text
v28.0L-3K External AI Production Integration Readiness Review - No Production Write
```

The next phase must be production integration design/readiness review only. It should not write production data, display provider output, trigger Daily, or connect provider output to scoring / decision / execution / position logic.

## 29. v28.0L-3K production readiness review

v28.0L-3K adds [`EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md`](EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md) as a documentation-only readiness review.

Status update:

- Production readiness has been reviewed.
- Manual artifact-only provider paths are ready for audited manual use.
- `fixture_sample` remains verified by run `25593082968`.
- `local_compact` remains verified by run `25598887574`.
- No production integration is approved.
- No production data write is approved.
- No frontend display is approved.
- No Daily integration or automatic provider call is approved.
- `promotionEligible=true` remains not ready.

Next phase:

```text
v28.0L-3L External AI Production Data Contract Design - No Production Write
```

The next phase should design the production `externalAiInterpretationLayer` data contract only. It should not write production data.

## 30. v28.0L-3L production data contract design

v28.0L-3L adds [`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md) as a documentation-only contract design.

Status update:

- Future `externalAiInterpretationLayer` production schema is designed.
- Required boundaries, statuses, provenance, freshness, quality review, content safety, validator checks, write gates, and frontend gates are documented.
- No production write is implemented.
- No frontend display is implemented.
- No Daily integration or automatic provider call is implemented.
- No workflow, script, package, data, realtime, config, frontend, or Worker file is changed by this design.

Next phase:

```text
v28.0L-3M External AI Production Contract Validator Scaffold - No Production Write
```

## 31. v28.0L-3M production contract validator scaffold

v28.0L-3M adds a production contract validator scaffold and safe fixture:

- `scripts/check-external-ai-production-contract.mjs`.
- `docs/fixtures/external-ai/production-contract-valid-v28.0L.json`.
- `npm run check:external-ai-production-contract`.

Status update:

- The proposed `externalAiInterpretationLayer` production contract can be validated from a fixture.
- `check:all` now runs the production contract validator after `check:external-ai-output`.
- No production write is implemented.
- No frontend display is implemented.
- No Daily integration or automatic provider call is implemented.
- No provider call or workflow dispatch is part of this stage.

Recommended next stage:

```text
v28.0L-3N External AI Production Projection Dry-Run - No Production Write
```

## 32. v28.0L-3N production projection dry-run scaffold

v28.0L-3N adds a deterministic projection dry-run for the proposed production contract:

- `scripts/project-external-ai-production-dry-run.mjs`.
- `npm run project:external-ai-production:dry-run`.
- `npm run check:external-ai-production-projection`.

Status update:

- A validated fixture external AI artifact can be projected into the future `externalAiInterpretationLayer` contract shape.
- Projection writes only to ignored `manual-artifacts/external-ai/`.
- Projected output is validated with `check:external-ai-production-contract`.
- No production data write is implemented.
- No frontend display is implemented.
- No Daily integration or automatic provider call is implemented.
- No provider call or workflow dispatch is part of this stage.

Recommended next stage:

```text
v28.0L-3O First Controlled Production Write Design - No Frontend Display
```

## 33. v28.0L-3O first controlled production write design

v28.0L-3O adds first controlled production write design and a read-only write guard:

- [`EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md`](EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md).
- `scripts/check-external-ai-production-write-guard.mjs`.
- `npm run check:external-ai-production-write-guard`.

Status update:

- No provider call is added or run.
- No workflow file is changed.
- No production write is implemented.
- The write guard proves the current repo remains in NO-GO production-write state.
- Frontend display remains unimplemented.
- Daily integration and automatic provider calls remain unimplemented.

Recommended next stage:

```text
v28.0L-3P First Controlled Production Write - Data Only / No Frontend Display
```

only after explicit user approval.

## 34. v28.0L-3P first controlled production write

v28.0L-3P performs the first controlled data-only write of `externalAiInterpretationLayer`.

Status update:

- Source artifact run: `25598887574`.
- Source artifact name: `external-ai-manual-provider-test-provider-25598887574`.
- Write target: `data/radar-data.json`.
- Write script: `scripts/write-external-ai-production-data.mjs`.
- No provider call is added or run by this PR.
- No workflow file is changed.
- No frontend display is implemented.
- Daily integration and automatic provider calls remain unimplemented.
- Scoring / decision / execution / position behavior remains unchanged.

Recommended next stage:

```text
v28.0L-3P-1 First Production Write Audit Sync - No Frontend Display
```

Next phase:

```text
v28.0L-3N External AI Production Projection Dry-Run - No Production Write
```

## 35. v28.0L-3P-1 first production write audit sync

v28.0L-3P-1 records the successful post-merge audit for the first controlled data-only production write.

Status update:

- First production write audit is synced.
- Source run `25598887574` remains the approved real provider artifact source.
- `data/radar-data.json` contains the contract-valid `externalAiInterpretationLayer`.
- No further provider call is run.
- No workflow file is changed.
- No frontend display is implemented.
- No Daily integration or automatic provider call is implemented.
- Scoring / decision / execution / position behavior remains unchanged.

Recommended next stage:

```text
v28.0L-3Q External AI Frontend Display Design - No Display Yet
```

## 36. v28.0L-3Q frontend display design

v28.0L-3Q adds a documentation-only design for future frontend display of the production `externalAiInterpretationLayer`.

Status update:

- Frontend display design is documented.
- No frontend code is added.
- No production data is changed.
- No provider call is added or run.
- No workflow file is changed.
- Visible display remains NO-GO.
- Daily integration and automatic provider calls remain unimplemented.
- Scoring / decision / execution / position behavior remains unchanged.

Recommended next stage:

```text
v28.0L-3R External AI Frontend Display Scaffold - Hidden by Default
```

## 37. v28.0L-3S visible display approval and data flag design

v28.0L-3S documents the approval and data-flag process for a future visible display step.

Status update:

- Visible display approval design is documented.
- Future visible display is defined as a data-flag change plus guard update.
- No production data is changed in this PR.
- No frontend code is changed in this PR.
- No provider call is added or run.
- No workflow file is changed.
- No automatic provider call or Daily integration is added.
- Visible display remains NO-GO in this PR.
- Scoring / decision / execution / position behavior remains unchanged.

Recommended next stage:

```text
v28.0L-3T External AI Visible Display Flag Enablement - Data Only / No Provider Call
```
