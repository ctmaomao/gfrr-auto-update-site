# External AI Provider-Call Workflow Readiness Checklist — v28.0L-3D

## 1. Status

This is a documentation-only readiness checklist.

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

This checklist reviews and preserves the current baseline:

- v28.0K-4D manual DeepSeek artifact path: explicit local/manual opt-in only, safe manual artifact path, validator-gated, and outside production data.
- v28.0K-4E compact live input path: manual live/local site-structured input can be generated as ignored artifacts, including compact input.
- v28.0K-4E-4 provider failure classification: failure artifacts classify `provider_unavailable`, `provider_timeout`, and related provider errors.
- v28.0K-4F quality review gate: `review:external-ai-artifact` exists and keeps `promotionEligible=false`.
- v28.0K-4G manual baseline: external AI remains manual-only, artifact-only, validator-gated, quality-review-gated, non-production, and non-user-visible.
- v28.0L-0 production integration design: production integration remains staged and future-only.
- v28.0L-1 readiness audit: production integration remains `not_ready`; only disabled skeleton work was allowed next.
- v28.0L-2 disabled provider skeleton: no-network, no-secret, no-provider-call skeleton exists.
- v28.0L-3 manual `workflow_dispatch` artifact-only design: workflow provider tests must be manually triggered and artifact-only.
- v28.0L-3B dry-run workflow skeleton: `External AI Manual Dry Run` exists and stays dry-run-only.
- v28.0L-3B-1 successful dry-run audit: run `25583503038` at commit `2ae6e5e` passed with `provider=none`, `networkAllowed=false`, `apiCalled=false`, `secretsRead=false`, `productionDataWritten=false`, `frontendDisplayChanged=false`, no DeepSeek call, no provider output artifact, no quality review artifact, and post-run safety assertion passed.
- v28.0L-3C provider-call workflow design: future provider-call gates, secret boundaries, validation, quality review, artifact policy, exit policy, and cost control are documented.
- v28.0L-3C post-merge audit passed: `check:docs`, `check:all`, `check:external-ai-manual-workflow`, and `check:data` passed, and `docs/EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md` exists.

## 3. Readiness summary

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| L-3B dry-run workflow | ready | Run `25583503038` PASS. | No | Keep dry-run-only. |
| Static workflow safety check | ready | `check:external-ai-manual-workflow` PASS in L-3C post-merge audit. | No | Keep checking the existing dry-run workflow. |
| Disabled provider skeleton | ready | `check:external-ai-production-provider-path` PASS. | No | Keep `provider=none` and disabled activation behavior. |
| Manual provider script | ready_for_manual_use | Local manual DeepSeek path exists and validator works. | No | Keep manual-only; do not treat as production. |
| Provider failure classification | ready | `provider_unavailable` / `provider_timeout` classification exists. | No | Preserve fail-closed handling and no repeated paid retry. |
| Quality review gate | ready | `review:external-ai-artifact` exists and `promotionEligible` remains false. | No | Require quality review for any future provider artifact. |
| GitHub secret storage decision | not_ready | No environment/repository secret decision recorded. | Yes | Choose protected Environment secret vs repository Actions secret. |
| Secret rotation / revocation procedure | not_ready | No final owner or emergency process recorded for GitHub workflow usage. | Yes | Document owner, rotation steps, and emergency revocation. |
| Provider-call workflow implementation | skeleton_ready / real_call_not_ready | L-3F added a provider-test workflow skeleton, and L-3F-1 audited dry-run plus missing-secret safety. Real provider command execution remains blocked. | Yes | Keep no-real-provider-call; next step requires separate secret decision / first real provider-call gate design. |
| Provider-call workflow static checker | not_ready | Existing checker covers dry-run workflow only. | Yes | Design and implement deterministic provider-call workflow checker in the implementation PR. |
| Missing-secret failure test plan | not_ready | No GitHub Actions missing-secret behavior test is documented. | Yes | Document and test fail-before-provider-call behavior. |
| Provider-call artifact sanitization checker | not_ready | No provider-call artifact upload sanitizer exists. | Yes | Define forbidden contents and fail upload when detected. |
| Exit policy | partially_ready | L-3C recommends fail-closed. | Yes | Confirm final provider failure / validator failure / quality review failure policy. |
| Cost budget | partially_ready | `max_attempts=1` and `acknowledge_cost` design exists. | Yes | Confirm acceptable spend, max calls per run, max calls per day, and rerun policy. |
| Concurrency policy | partially_ready | Cost-control design exists. | Yes | Choose provider-call-specific concurrency group and `cancel-in-progress` behavior. |
| Operator approval process | not_ready | No final approval flow for running provider-call workflow is recorded. | Yes | Define who can run it and what acknowledgements are required. |
| Production data write | blocked / out_of_scope | Provider-call workflow must remain artifact-only. | Yes | Keep blocked unless a later production integration PR explicitly changes boundary. |
| Frontend display | blocked / out_of_scope | No frontend display is approved. | Yes | Keep blocked; separate reviewed frontend/display PR required. |
| Daily integration | blocked / out_of_scope | No Daily provider call exists or is approved. | Yes | Keep blocked; separate future Daily phase required. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | External AI must remain display/commentary-only even in future phases. | Yes | Keep blocked permanently unless project contract is explicitly redesigned. |

v28.0L-3F readiness update:

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Provider-call workflow skeleton | partially_ready / missing-secret-safe | L-3F adds `External AI Manual Provider Test` with default dry-run path and missing-secret fail-before-provider-command behavior. | Yes | Audit default dry-run PASS and provider-path-without-secret FAIL after merge. |
| Real provider call | not_ready | L-3F intentionally blocks provider calls even if a secret is present. | Yes | Requires later reviewed PR after L-3F audit and explicit secret approval. |
| GitHub secret usage | not_ready | No secret is configured by L-3F; the only future secret reference is scoped to the missing-secret gate. | Yes | Do not add `DEEPSEEK_API_KEY` until separate approval. |
| Production integration | not_ready | L-3F writes no production data and keeps `externalAiInterpretationLayer` disabled. | Yes | Separate future production integration phase required. |

v28.0L-3F-1 audit update:

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Provider workflow skeleton | ready / audited | Run `25591115649` default dry-run PASS and run `25591202053` missing-secret provider path expected FAIL before provider command. | No | Keep skeleton no-real-provider-call. |
| Default dry-run path | ready | Run `25591115649` passed with `apiCalled=false`, `networkUsed=false`, no provider output artifact, no production data write, and no frontend change. | No | Continue using only for no-network diagnostics. |
| Missing-secret safe failure | ready | Run `25591202053` showed `DEEPSEEK_API_KEY` empty and failed in `Missing-secret safe provider gate` with `status=failed_before_provider_call`. | No | Do not rerun repeatedly; use as the safety audit record. |
| Real provider call | not_ready | L-3F-1 did not run DeepSeek and does not approve a provider command. | Yes | Requires a separate decision/design PR before any secret or real provider call. |
| GitHub secret usage | not_ready | No `DEEPSEEK_API_KEY` was configured or approved; the missing-secret result was the expected safety outcome. | Yes | Do not add GitHub secret until separately approved. |
| Production integration | not_ready | No production data, frontend, Worker, Daily, scoring, decision, execution, or position path changed. | Yes | Separate future production integration phase required. |

v28.0L-3G readiness update:

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Secret strategy | decided | [`EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md`](EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md) selects GitHub Environment `external-ai-manual` with Environment secret `DEEPSEEK_API_KEY`; repository Actions secret is fallback only. | No | Use this decision in a later unlock PR only after explicit approval. |
| Secret created | not_ready | L-3G does not create an environment or add `DEEPSEEK_API_KEY`. | Yes | Do not add secret until a separate approved step. |
| Real provider call | not_ready | L-3G modifies no workflow and the L-3F skeleton still blocks real provider calls. | Yes | Requires separate approved unlock workflow PR. |
| Production integration | not_ready | L-3G adds no production data, frontend, Daily, Worker, scoring, decision, execution, or position path. | Yes | Separate future production integration phase required. |

## 4. Go / no-go decision

Current L-3F-1 decision: **GO for the no-real-provider-call provider workflow skeleton as audited; NO-GO for real provider call, GitHub secret usage, or production integration**.

Current L-3G decision: **secret strategy decided; NO-GO for secret creation, real provider call, workflow unlock, or production integration**.

Reasons:

- Secret storage decision is not finalized.
- Secret rotation/revocation procedure is not finalized.
- Provider-call workflow static checker is not designed or implemented.
- Artifact sanitization checker is not implemented.
- Missing-secret failure test plan is not documented.
- Operator approval process is not finalized.
- Cost budget and concurrency policy require explicit confirmation.

Allowed next step:

```text
v28.0L-3E Provider-Call Workflow Implementation Plan — No Code
```

v28.0L-3E is tracked in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md). It resolves the missing readiness items as a plan only. Implementation itself remains separate, and secret setup plus any real provider call remain out of scope.

Alternative faster path only if explicitly approved:

```text
v28.0L-3E Manual Provider-Call Workflow Skeleton — Missing-Secret Safe / No Real Provider Call
```

Not allowed next steps:

- Add real provider-call workflow using `DEEPSEEK_API_KEY` immediately.
- Add GitHub secret and provider call in the same PR.
- Add schedule / Daily integration.
- Write production data.
- Display output in frontend.
- Enable `externalAiInterpretationLayer`.
- Let provider output affect scoring / decision / execution / position.

## 5. Required decisions before implementation

Decisions required before any real provider-call workflow:

1. Secret storage location: protected Environment secret vs repository Actions secret.
2. Secret rotation owner: who rotates `DEEPSEEK_API_KEY` if exposed.
3. Emergency revocation process: how to revoke if the key is pasted into chat, logs, or artifacts.
4. Trigger permissions: who is allowed to manually run provider-call workflow.
5. Exit policy: fail-closed on provider failure, validator failure, and quality review failure.
6. Cost budget: maximum calls per run, maximum calls per day, and maximum reruns after `provider_unavailable` / `provider_timeout`.
7. Concurrency: provider-call-specific concurrency group, and whether `cancel-in-progress` should be false.
8. Artifact retention: default 3 days unless explicitly changed.
9. Artifact upload scope: exact allowed files and forbidden files.
10. Sanitization checker: what must be scanned before upload.
11. Missing-secret behavior: workflow must fail before provider call.
12. Implementation structure: modify existing L-3B workflow vs create a separate provider-test workflow.

Recommended default decisions:

- Use protected Environment secret if available.
- Use repository Actions secret only if environment protection is unavailable.
- `max_attempts=1`.
- `retention-days=3`.
- Artifact-only.
- Fail-closed.
- Separate provider-test workflow is safer than modifying the dry-run workflow.
- Provider-call workflow must remain `workflow_dispatch` only.

## 6. Required implementation boundaries

Future implementation PR must:

- remain `workflow_dispatch` only
- use no schedule
- use no push trigger
- use no `pull_request` trigger
- use no `workflow_run` trigger
- require `dry_run=false`
- require `allow_network=true`
- require `acknowledge_cost=true`
- require `acknowledge_non_production=true`
- require `validate_output=true`
- require `max_attempts=1`
- inject `DEEPSEEK_API_KEY` only into provider-call step
- never pass secret via CLI arg
- keep dry-run path default
- run preflight checks before provider call
- build compact input
- run provider call only after all gates
- run `check:external-ai-output`
- run `review:external-ai-artifact`
- upload sanitized artifacts only
- never write production data
- never modify frontend
- never trigger Daily
- keep `promotionEligible=false`

Future implementation PR must not:

- write `data/radar-data.json`
- write `realtime/*.json`
- modify `config/*.json`
- modify `index.html`
- modify `scripts/app.js`
- modify `scripts/modules/*.js`
- modify `workers/**`
- use `wrangler`
- run `build:data`
- run `build:realtime`
- run `build:world-order`
- add SDK/dependencies
- add OpenAI provider call
- store secrets in files
- upload raw headers
- upload `.env`
- upload GitHub token
- upload unsafe raw provider response

## 7. Required future checks

Future provider-call implementation must add or extend a deterministic checker that verifies:

- workflow exists and is `workflow_dispatch` only
- no schedule / push / `pull_request` / `workflow_run`
- provider-call gates exist
- default `dry_run` remains true
- `allow_network` default false
- `acknowledge_cost` default false
- `acknowledge_non_production` default false
- `max_attempts` max 1
- provider is DeepSeek only
- secret reference appears only in provider-call step
- no secret in command-line args
- preflight checks run before provider step
- `check:external-ai-output` runs after provider output
- `review:external-ai-artifact` runs after output/failure artifact
- artifacts use `retention-days: 3`
- forbidden uploads are blocked
- no `data/radar-data.json` write
- no frontend / Worker / config / data writes
- no `build:data` / `build:realtime` / `build:world-order`
- no `wrangler`
- no Pages deploy
- no Daily trigger

Future checks must be included in `check:all`.

## 8. Required test matrix before any real provider-call run

Future implementation PR should test, without spending provider calls where possible:

1. Dry-run mode: default inputs; expected result is provider skipped and workflow success.
2. Missing secret mode: `dry_run=false` and `allow_network=true` but no secret configured; expected result is fail before provider call.
3. Gate mismatch: `dry_run=false` but `allow_network=false`; expected result is provider skipped or fail safely.
4. Missing acknowledgement: `acknowledge_cost=false`; expected result is provider skipped or fail safely.
5. Invalid `max_attempts`: `max_attempts > 1`; expected result is fail before provider call.
6. Artifact upload safety: forbidden files present; expected result is fail.
7. Static checker: unsafe workflow modifications detected.

Only after these pass should a real provider-call workflow run be considered.

## 9. Acceptance criteria before real provider-call run

Before the first real GitHub Actions provider-call run:

- Provider-call implementation PR merged.
- `check:all` green.
- Static workflow checker green.
- Secret storage decision finalized.
- `DEEPSEEK_API_KEY` stored in approved GitHub secret location.
- Secret rotation/revocation documented.
- Operator confirms cost acknowledgement.
- Operator confirms non-production acknowledgement.
- Dry-run workflow still passes.
- Missing-secret test passes safely.
- Artifact sanitization path passes.
- No production data write path exists.
- No frontend display path exists.
- No Daily trigger exists.

## 10. First real provider-call run requirements

The first real provider-call run must:

- be manually triggered
- use compact input
- use `max_attempts=1`
- use `timeout_ms=120000`
- require `acknowledge_cost=true`
- require `acknowledge_non_production=true`
- produce artifact-only output
- validate output
- run quality review
- keep `promotionEligible=false`
- upload artifacts with `retention-days=3`
- not write production data
- not change frontend
- not trigger Daily

After the run, record:

- run ID
- commit
- input source
- provider status
- validation result
- quality review result
- artifact names
- failure classification if any
- confirmation no production data/frontend changes occurred

## 11. Stop rules

Stop and do not proceed if:

- provider returns HTTP 503 / `provider_unavailable`
- provider times out
- missing secret check fails incorrectly
- workflow attempts to read secret outside provider step
- validator fails
- quality review returns `needs_prompt_revision`
- quality review returns `reject_for_promotion`
- unsafe artifact scan fails
- workflow writes production data
- workflow modifies frontend / Worker / config / data
- workflow triggers Daily
- `check:all` fails

In all cases:

- do not rerun repeatedly
- do not promote artifacts
- inspect diagnostics
- fix design/checks before retrying

## 12. Production boundaries

Provider-call workflow success, when implemented later, still will not mean:

- production integration is ready
- Daily integration is ready
- frontend display is ready
- `externalAiInterpretationLayer` should be enabled
- scoring should change
- decision model should change
- execution lock should change
- position guidance should change

Provider-call workflow remains artifact-only until a later reviewed phase explicitly changes the boundary.

## 13. Non-goals

v28.0L-3D does not:

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

## 14. v28.0L-3H readiness update

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Secret strategy | ready | v28.0L-3G selected GitHub Environment `external-ai-manual` and Environment secret `DEEPSEEK_API_KEY`. | No | Operator creates the environment secret after PR merge. |
| Environment-gated workflow | implemented | v28.0L-3H splits dry-run/gate and provider-call jobs; the provider-call job uses `environment: external-ai-manual`. | No | Run default dry-run, then first approved fixture call after secret exists. |
| Secret creation | operator_action_required | This PR does not add secrets. | Yes | Create Environment secret `DEEPSEEK_API_KEY`; prefer required reviewer approval if available. |
| Real provider call | ready_after_environment_secret_and_approval | Provider command can run only with `provider=deepseek`, `input_source=fixture_sample`, `dry_run=false`, `allow_network=true`, cost and non-production acknowledgements, `validate_output=true`, `max_attempts=1`, valid timeout, environment approval, and non-empty secret. | Yes | Run manually after merge and record audit. |
| Artifact gates | implemented | Validator, quality review, strict artifact sanitizer, short artifact retention, and post-run production safety assertion are required. | No | Inspect artifacts after first run. |
| Production integration | not_ready | Provider output remains artifact-only and `promotionEligible=false`; no production data, frontend, Daily, Worker, scoring, decision, execution, or position path is changed. | Yes | Separate reviewed integration PR required. |

Current L-3H decision:

```text
ready_for_manual_fixture_sample_provider_call_after_environment_secret_exists
```

Still not ready:

- live/local provider-call input
- production data write
- frontend display
- Daily integration
- scoring / decision / execution / position impact

## 15. Final readiness decision

Overall readiness:

```text
partially_ready_for_provider_call_implementation_planning
```

Provider-call implementation:

```text
not_ready_until_missing_items_resolved
```

Recommended next PR:

```text
v28.0L-3E Provider-Call Workflow Implementation Plan — No Code
```

v28.0L-3E documents the implementation plan but does not approve adding GitHub secrets or running a real provider call.

Alternative faster path only if explicitly approved:

```text
v28.0L-3E Manual Provider-Call Workflow Skeleton — Missing-Secret Safe / No Real Provider Call
```
