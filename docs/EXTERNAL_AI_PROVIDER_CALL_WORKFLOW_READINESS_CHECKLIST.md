# External AI Provider-Call Workflow Readiness Checklist — v28.0L-3D

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a documentation-only readiness checklist.

## v28.0L-3J-4 → L-4C readiness updates (compact)

> Folded from the original per-phase readiness-update tables (B-consolidated; full per-phase tables remain in git history). **Shared boundary — holds for every row unless its delta says otherwise:** `promotionEligible=false`, provider output artifact-only, no Daily-pipeline integration, and no scoring / decision / execution / position impact. Rows record only the per-phase delta + any unique constraint.

| Phase | Run / commit / artifact | Delta + unique constraints | Decision → next |
|---|---|---|---|
| L-3J-4 | run `25598887574` | local_compact provider path verified (transport / validator / quality / sanitizer / upload); input `manual-input-compact-latest.json` (`sourceType=local_file`, `compact=true`, `radarDataUpdatedAt=2026-05-08T23:29:12.835Z`), model `deepseek-v4-flash` | `local_compact_provider_path_audited_production_integration_not_ready` → L-3K |
| L-3K | runs `25593082968` + `25598887574` | manual artifact-only path ready; production write NO-GO; review → [`EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md`](EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md); next = data-contract design only | `manual_artifact_only_ready_production_write_no_go` → L-3L |
| L-3L | — | production data-contract design ready, validator not_ready → [`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md) | `production_contract_design_ready_validator_not_ready_write_no_go` → L-3M |
| L-3M | — | validator scaffolded: `check:external-ai-production-contract` in check:all; fixture `production-contract-valid-v28.0L.json` | `production_contract_validator_scaffolded_write_no_go` → L-3N |
| L-3N | — | projection dry-run scaffolded: `check:external-ai-production-projection` writes only `manual-artifacts/external-ai/external-ai-production-projection-latest.json` | `production_projection_dry_run_ready_production_write_no_go` → L-3O |
| L-3O | — | first-write design documented + read-only write guard `check:external-ai-production-write-guard` in check:all → [`EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md`](EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md); write needs explicit user approval | `first_write_design_ready_production_write_no_go` → L-3P |
| L-3P | layer source run `25598887574` | **first controlled data-only production write done** — `data/radar-data.json` gains contract-valid `externalAiInterpretationLayer`; contract + write-guard pass; display still `displayEnabled=false` | `first_controlled_data_write_done_frontend_display_no_go` → L-3P-1 |
| L-3P-1 | — | first-write post-merge audited (contract + write-guard pass); display design is next phase | `first_production_write_audited_frontend_display_design_next` → L-3Q |
| L-3Q | — | frontend display design documented, no frontend code → [`EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md`](EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md); flags still `displayEnabled=false` / `frontendDisplayApproved=false` | `frontend_display_design_ready_visible_display_no_go` → L-3R |
| L-3R | — | hidden-by-default scaffold ready: `renderExternalAiPanel` + `check:external-ai-frontend-hidden-scaffold`; panel hidden while flags false | `frontend_hidden_scaffold_ready_visible_display_no_go` → L-3S |
| L-3S | — | visible-display approval + data-flag process documented → [`EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md`](EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md); flags still false | `visible_display_approval_design_ready_flag_enablement_no_go` → L-3T |
| L-3T | — | **visible display flags enabled: `displayEnabled=true` + `boundaries.frontendDisplayApproved=true`** (data-only flag change; AI text unchanged); scaffold may now render read-only panel | `visible_display_flags_enabled_no_provider_call` → L-3T-1 |
| L-3T-1 | — | flag enablement post-merge audited | `visible_display_flags_audited_no_provider_call` → L-3U |
| L-3U | — | visible-panel UX polish (summary / observations / inferences / uncertainty / confidence / timestamp); AI text unchanged | `visible_display_ux_polished_no_provider_call` → L-3U-1 |
| L-3U-1 | — | UX polish audited — **visible display line complete** | `visible_display_ux_audited_display_line_complete` → L-4A (optional) |
| L-4A | — | **first production refresh workflow** `External AI Production Refresh` (`workflow_dispatch`, `input_source=local_compact`). **Constraints:** single daily cron **`23:50 UTC` — add no other schedule**; only approved automatic provider call; commits only `data/radar-data.json` when `externalAiInterpretationLayer` changes; preserves `displayEnabled=true` / `frontendDisplayApproved=true` | `production_refresh_workflow_ready_single_daily_schedule` → L-4A-1 |
| L-4A-1 | run `25611392014`; commit `c32af65`; artifact `6898516584` (3-day retention) | first manual refresh verified end-to-end (provider → validate → quality → sanitize → project → write → contract → write-guard → scaffold → check:data → check:all → protected-path). **Constraints:** refresh is the **only** approved automatic provider path; no extra schedules / retry loops / refresh workflows; Daily pipeline stays disconnected | `first_production_refresh_manual_run_verified_daily_schedule_ready` → L-4B |
| L-4B | — | display-coverage polish: capped summaries for model judgments / scenario hypotheses / source attribution / public review status; no provider call or write this PR; refresh stays the only auto provider path | (no decision token; recommended) → L-4B-1 |
| L-4B-1 | refresh baseline run `25611392014` | display coverage audited — visible / UX / coverage line complete; `23:50 UTC` schedule ready; no extra automation | (no decision token; recommended) → L-4C |
| L-4C | — | refresh monitoring / failure-notification **design only** → [`EXTERNAL_AI_REFRESH_MONITORING_DESIGN.md`](EXTERNAL_AI_REFRESH_MONITORING_DESIGN.md) (goals / failure-classes / thresholds / no-go); GitHub-native failed-workflow notification recommended. **Constraints:** adds no notification automation / issue-creation / Slack-email-webhook / provider auto-retry / additional schedule beyond daily `23:50 UTC` | (no decision token; recommended) → L-4D |

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

## 14. v28.0L-3H → L-3J-3 readiness updates (compact)

> Folded from the original per-phase readiness-update tables (B-consolidated; full per-phase tables remain in git history). **Shared boundary — holds for every row unless its delta says otherwise:** `promotionEligible=false`, provider output artifact-only, no production data write, no frontend display, no Daily integration, and no scoring / decision / execution / position impact. Rows record only the per-phase delta + any unique constraint.

| Phase | Run / commit / artifact | Delta + unique constraints | Decision → next |
|---|---|---|---|
| L-3H | — | environment-gated provider-call workflow implemented (split no-secret dry-run/gate job + `environment: external-ai-manual` provider-call job); artifact gates = validator + quality review + strict sanitizer + short retention + post-run safety assertion. **Constraints:** secret `DEEPSEEK_API_KEY` is operator action (Environment `external-ai-manual`, prefer required-reviewer); real call only `input_source=fixture_sample` after all gates; secret injected step-scoped only, never a CLI arg | `ready_for_manual_fixture_sample_provider_call_after_environment_secret_exists` → L-3H run |
| L-3H-1 | run `25592238444` (first real fixture_sample call) | provider transport works; validator pass; **quality blocked `needs_prompt_revision`**; **sanitizer blocked upload** — diagnostic JSON contained the literal marker `DEEPSEEK_API_KEY` (the secret *name*, not value). **Constraints:** do not rerun until marker-fix merged; remove literal marker, keep sanitizer strict | `fixture_provider_transport_observed_quality_blocked_sanitizer_fix_required` → L-3H-2 |
| L-3H-2 | run `25592238444` (re-evaluated) | prompt / quality guidance revised (no mixed-source markers; stronger attribution / confidence / incremental-value); no provider call this PR | `fixture_prompt_quality_revised_no_provider_call` → L-3H-3 |
| L-3H-3 | run `25593082968` (second fixture_sample call) | **fixture_sample path audited / ready**: `apiCalled=true`, `networkUsed=true`, model `deepseek-v4-flash`, validator + quality (`pass_for_manual_review`) + sanitizer + upload pass; `promotionEligible=false` kept; live/local still not_ready | `fixture_sample_provider_path_audited_live_local_not_ready` → L-3I |
| L-3I | fixture record run `25593082968` | live/local compact design documented → [`EXTERNAL_AI_LIVE_LOCAL_COMPACT_PROVIDER_CALL_DESIGN.md`](EXTERNAL_AI_LIVE_LOCAL_COMPACT_PROVIDER_CALL_DESIGN.md); no implementation (needs separate L-3J PR) | `local_compact_design_ready_implementation_not_ready` → L-3J |
| L-3J | — | local_compact workflow path implemented (builds `manual-input-compact-latest.json`, selects it behind manual gates); no provider call, no Actions trigger; artifacts `artifactOnly=true` | `local_compact_workflow_path_implemented_provider_call_pending_audit` → L-3J-1 |
| L-3J-1 | run `25598085025` (first local_compact audit attempt) | compact input built (`sourceType=local_file`, `compact=true`, `apiCalled=false`); gates satisfied; **stopped safely at sanitizer false-positive** (blocked read-only `data/radar-data.json` source metadata) — provider call NOT run. **Constraints:** merge fix before retry; keep Environment secret step-scoped | `sanitizer_source_metadata_fix_needed_provider_call_pending_retry` → L-3J-2 |
| L-3J-3 | run `25598379612` | local_compact transport verified through provider / validator / sanitizer / upload; **quality blocked execution-language safety** (`$.facts[5]` contained `执行灯`); prompt revised to forbid repeating `decisionContext` operation-language into user-facing fields | `local_compact_transport_verified_quality_blocked_prompt_revision_required` → L-3J-4 |

**Post-L-3H-3 readiness rollup (was §18 "Current readiness decision"):** overall `fixture_sample_provider_path_audited`; live/local `not_ready_requires_separate_design_review`; production integration `not_ready`. L-3H-3 approves the fixture path audit only — not live/local execution, production write, frontend display, Daily integration, `externalAiInterpretationLayer` promotion, or scoring / decision / execution / position changes.

## 23. Historical v28.0L-3D final readiness decision

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
