# External AI Provider-Call Workflow Readiness Checklist — v28.0L-3D

## 1. Status

This is a documentation-only readiness checklist.

## v28.0L-3J-4 readiness update

Run `25598887574` completed the `local_compact` DeepSeek provider-call audit successfully.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Fixture_sample provider path | verified | Run `25593082968` passed provider transport, validation, quality review, sanitizer, and artifact upload. | No | Keep fixture path available and gated. |
| Local_compact provider path | verified | Run `25598887574` passed provider transport, validation, quality review, sanitizer, and artifact upload. | No | Do not rerun repeatedly without a new approved task. |
| Provider transport | verified | Run `25598887574` entered through `external-ai-manual`, used step-scoped masked secret injection, and executed `provider=deepseek` / model `deepseek-v4-flash`. | No | Keep environment-gated and step-scoped. |
| Local compact input build | verified | `manual-input-compact-latest.json` was created with `sourceType=local_file`, `compact=true`, and `radarDataUpdatedAt=2026-05-08T23:29:12.835Z`. | No | Keep local source metadata read-only. |
| Output validator | verified | External AI output validation passed with `warnings=0`. | No | Keep validator required. |
| Quality review | verified_for_local_compact | External AI artifact quality review passed. | No | Keep quality review required and keep `promotionEligible=false`. |
| Artifact sanitizer | verified_for_local_compact | Artifact sanitizer passed. | No | Keep sanitizer strict before upload. |
| Artifact upload | verified | Sanitized provider-call artifacts uploaded. | No | Continue artifact-only retention and review. |
| Production data write | not_ready | `productionDataWritten=false`; no data promotion is approved. | Yes | Separate reviewed production integration phase required. |
| Frontend display | not_ready | `frontendDisplayChanged=false`; external provider output remains non-user-visible. | Yes | Separate reviewed display phase required. |
| Daily integration | not_ready | No Daily integration was added or approved. | Yes | Separate future Daily phase required. |
| Automatic scheduled provider call | not_ready | L-3J-4 records one approved manual audit only. | Yes | Separate reviewed scheduling phase required, if ever. |
| `promotionEligible=true` | not_ready | Run `25598887574` kept `promotionEligible=false`. | Yes | Keep false until a separate reviewed production integration PR changes the boundary. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | L-3J-4 changes no scoring, decision, execution, or position logic. | Yes | Keep external AI output outside these paths. |

Current L-3J-4 decision:

```text
local_compact_provider_path_audited_production_integration_not_ready
```

Recommended next PR:

```text
v28.0L-3K External AI Production Integration Readiness Review - No Production Write
```

## v28.0L-3K readiness update

v28.0L-3K is documented in [`EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md`](EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md). It reviews whether the external AI path is ready for future production integration, without implementing production integration.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Manual artifact-only provider path | ready | `fixture_sample` and `local_compact` audits both passed through provider transport, validation, quality review, sanitizer, and artifact upload. | No | Keep manual, artifact-only, and environment-gated. |
| Fixture_sample provider path | verified | Run `25593082968` passed validator, quality review, sanitizer, and artifact upload. | No | Use as fixture audit record. |
| Local_compact provider path | verified | Run `25598887574` passed validator, quality review, sanitizer, and artifact upload. | No | Use as local compact audit record. |
| Production write | not_ready | No production output target, schema, validator, promotion gate, or rollback plan is approved. | Yes | Next phase must be production data contract design only. |
| Frontend display | not_ready | No reviewed UI copy, fallback behavior, freshness display, or display contract exists. | Yes | Separate frontend/display PR required after data contract design. |
| Daily integration | not_ready | No Daily provider-call or production write path is approved. | Yes | Keep Daily disconnected. |
| Automatic provider calls | not_ready | Manual audit success does not approve scheduled or repeated calls. | Yes | Separate scheduling and cost-control design required, if ever. |
| `promotionEligible=true` | not_ready | All audited paths keep `promotionEligible=false`. | Yes | Keep false unless a separate explicit approval changes the boundary. |

Current L-3K decision:

```text
manual_artifact_only_ready_production_write_no_go
```

Recommended next PR:

```text
v28.0L-3L External AI Production Data Contract Design - No Production Write
```

## v28.0L-3L readiness update

v28.0L-3L is documented in [`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md). It designs the future production `externalAiInterpretationLayer` contract without implementing writes.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Production data contract design | ready / documented | L-3L defines the proposed schema, boundaries, status model, provenance, freshness, quality review, content safety, validator requirements, and write gates. | No | Use as validator scaffold input. |
| Production contract validator | not_ready | No validator/checker is implemented in L-3L. | Yes | L-3M should add validator scaffold only. |
| Production write dry-run | not_ready | No projection or dry-run writer exists. | Yes | Requires later reviewed phase after validator scaffold. |
| Production write | not_ready | No production data file write is approved. | Yes | Keep NO-GO. |
| Frontend display | not_ready | No frontend contract or display implementation is approved. | Yes | Keep hidden / absent. |

Current L-3L decision:

```text
production_contract_design_ready_validator_not_ready_write_no_go
```

Recommended next PR:

```text
v28.0L-3M External AI Production Contract Validator Scaffold - No Production Write
```

## v28.0L-3M readiness update

v28.0L-3M adds the production contract validator scaffold and valid fixture.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Production contract validator | ready / scaffolded | `check:external-ai-production-contract` validates the proposed contract fixture and is included in `check:all`. | No | Keep required before any projection/write phase. |
| Production contract valid fixture | ready | `production-contract-valid-v28.0L.json` passes the scaffold validator. | No | Use as a safe contract sample only. |
| Production write dry-run / projection | not_ready | No dry-run projection exists in L-3M. | Yes | Next phase should be projection dry-run only. |
| Production write | not_ready | No production data file write is approved. | Yes | Keep NO-GO. |
| Frontend display | not_ready | No frontend display path is approved. | Yes | Keep hidden / absent. |

Current L-3M decision:

```text
production_contract_validator_scaffolded_write_no_go
```

Recommended next PR:

```text
v28.0L-3N External AI Production Projection Dry-Run - No Production Write
```

## v28.0L-3N readiness update

v28.0L-3N adds the production projection dry-run scaffold and validates its ignored output with the production contract validator.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Production contract validator | ready | `check:external-ai-production-contract` validates both the contract fixture and projected dry-run output. | No | Keep required for every future projection/write stage. |
| Production projection dry-run | ready / scaffolded | `check:external-ai-production-projection` writes only `manual-artifacts/external-ai/external-ai-production-projection-latest.json` and validates it. | No | Use as dry-run evidence only. |
| Production write | not_ready | No production data file write is approved or implemented. | Yes | Separate explicit L-3O design required before any write stage. |
| Frontend display | not_ready | No frontend display path is approved or implemented. | Yes | Keep hidden / absent. |
| Daily integration | not_ready | No Daily integration or scheduled provider call is approved. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | Projection is local and deterministic; it does not call a provider. | Yes | Separate scheduling and cost-control design required, if ever. |

Current L-3N decision:

```text
production_projection_dry_run_ready_production_write_no_go
```

Recommended next stage:

```text
v28.0L-3O First Controlled Production Write Design - No Frontend Display
```

This stage confirms:

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

## v28.0L-3O readiness update

v28.0L-3O adds first controlled production write design and a read-only production write guard.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Production projection dry-run | ready | `check:external-ai-production-projection` remains the source projection gate. | No | Keep required before any write design. |
| Production write guard | ready / scaffolded | `check:external-ai-production-write-guard` confirms the current repo remains display-disabled and non-impacting. | No | Keep in `check:all`. |
| First controlled write design | documented | `EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md` records future target, source, gates, rollback, and acceptance criteria. | No | Requires explicit user approval before data-only write. |
| Production write | not_ready | No production data file write is approved or implemented. | Yes | Separate explicitly approved data-only PR required. |
| Frontend display | not_ready | No frontend display path is approved or implemented. | Yes | Keep hidden / absent. |
| Daily integration | not_ready | No Daily integration or scheduled provider call is approved. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No automatic provider call is approved or implemented. | Yes | Separate scheduling and cost-control design required, if ever. |

Current L-3O decision:

```text
first_write_design_ready_production_write_no_go
```

Recommended next stage:

```text
v28.0L-3P First Controlled Production Write - Data Only / No Frontend Display
```

only after explicit user approval.

## v28.0L-3P readiness update

v28.0L-3P completes the first controlled data-only production write.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Production data write | first controlled data-only write done | `data/radar-data.json` now contains a contract-valid `externalAiInterpretationLayer` from run `25598887574`. | No | Audit sync next; no frontend display. |
| Production contract validator | passed | `check:external-ai-production-contract -- data/radar-data.json` passes. | No | Keep required for future edits. |
| Production write guard | passed | `check:external-ai-production-write-guard` passes after insertion. | No | Keep in `check:all`. |
| Frontend display | not_ready | `displayEnabled=false` and frontend files are unchanged. | Yes | Separate frontend display design required. |
| Daily integration | not_ready | No Daily integration is approved or implemented. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No automatic provider call is approved or implemented. | Yes | Separate scheduling and cost-control design required, if ever. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | Inserted layer has all affect flags false. | Yes | Keep external AI out of these paths. |

Current L-3P decision:

```text
first_controlled_data_write_done_frontend_display_no_go
```

Recommended next stage:

```text
v28.0L-3P-1 First Production Write Audit Sync - No Frontend Display
```

## v28.0L-3P-1 readiness update

v28.0L-3P-1 records the successful post-merge audit for the first controlled data-only layer.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Production data write | completed_for_first_data_only_layer | `data/radar-data.json` contains the contract-valid layer from run `25598887574`. | No | Keep future edits validator/write-guard gated. |
| Production contract validator | passed | `check:external-ai-production-contract -- data/radar-data.json` passed in the post-merge audit. | No | Keep required for future edits. |
| Production write guard | passed | `check:external-ai-production-write-guard` passed in the post-merge audit. | No | Keep required in `check:all`. |
| Frontend display | not_ready | `displayEnabled=false`; no frontend display is approved. | Yes | Next phase is frontend display design only. |
| Frontend display design | next_phase | Design must precede any display implementation. | Yes | Start v28.0L-3Q as no-display design. |
| Daily integration | not_ready | No Daily integration is approved or implemented. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No scheduled or automatic provider calls are approved or implemented. | Yes | Keep manual-only unless a separate future phase approves otherwise. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | Inserted layer keeps all affect flags false. | Yes | Keep external AI out of these paths. |

Current L-3P-1 decision:

```text
first_production_write_audited_frontend_display_design_next
```

Recommended next step:

```text
v28.0L-3Q External AI Frontend Display Design - No Display Yet
```

## v28.0L-3Q readiness update

v28.0L-3Q documents the future frontend display design without adding frontend code.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Production data write | done | First controlled data-only layer exists in `data/radar-data.json`. | No | Keep future edits validator/write-guard gated. |
| Frontend display design | documented | `EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md` defines placement, display conditions, fallback states, safe copy, allowed fields, and guard strategy. | No | Use as input for hidden scaffold only. |
| Frontend scaffold | not_ready | No frontend read logic is implemented in L-3Q. | Yes | Separate L-3R hidden-by-default scaffold required. |
| Visible display | not_ready | `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`. | Yes | Do not display until a later explicit approval. |
| Daily integration | not_ready | No Daily integration is approved or implemented. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No scheduled or automatic provider calls are approved or implemented. | Yes | Keep manual-only unless a separate future phase approves otherwise. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | Display design preserves all affect flags as false. | Yes | Keep external AI out of these paths. |

Current L-3Q decision:

```text
frontend_display_design_ready_visible_display_no_go
```

Recommended next step:

```text
v28.0L-3R External AI Frontend Display Scaffold - Hidden by Default
```

## v28.0L-3R readiness update

v28.0L-3R adds a hidden-by-default frontend scaffold while keeping visible display disabled.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Production data write | done | First controlled data-only layer exists in `data/radar-data.json`. | No | Keep validator and write-guard checks. |
| Frontend hidden scaffold | ready | `renderExternalAiPanel` reads the production layer defensively and hides unless all display gates pass. | No | Keep hidden until explicit visible-display approval. |
| Hidden scaffold guard | ready | `check:external-ai-frontend-hidden-scaffold` verifies current flags remain false and the container is hidden by default. | No | Run with frontend checks. |
| Visible display | not_ready | Current data has `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`. | Yes | Separate L-3S approval / flag design required. |
| Daily integration | not_ready | No Daily integration is approved or implemented. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No scheduled or automatic provider calls are approved or implemented. | Yes | Keep manual-only unless a separate future phase approves otherwise. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | All affect flags remain false and no scoring / decision / execution / position code is changed. | Yes | Keep external AI out of these paths. |

Current L-3R decision:

```text
frontend_hidden_scaffold_ready_visible_display_no_go
```

Recommended next step:

```text
v28.0L-3S External AI Visible Display Approval + Data Flag Design - No Automatic Provider Call
```

## v28.0L-3S readiness update

v28.0L-3S documents the visible-display approval and data flag process without enabling visible display.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Frontend hidden scaffold | ready | L-3R added guarded read/render logic and a hidden panel. | No | Keep hidden until flags are explicitly approved. |
| Visible display approval design | documented | `EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md` defines flag changes, gates, guard strategy, copy constraints, placement constraints, and rollback. | No | Use as input for L-3T only. |
| Visible display data flags | not_ready | Current data keeps `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`. | Yes | Separate data-only flag PR required. |
| Visible display | not_ready | No data flags are enabled and no visible display is approved. | Yes | Do not display in this PR. |
| Daily integration | not_ready | No Daily integration is approved or implemented. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No scheduled or automatic provider calls are approved or implemented. | Yes | Keep manual-only unless a separate future phase approves otherwise. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | All affect flags remain false and no related logic may change. | Yes | Keep external AI out of these paths. |

Current L-3S decision:

```text
visible_display_approval_design_ready_flag_enablement_no_go
```

Recommended next step:

```text
v28.0L-3T External AI Visible Display Flag Enablement - Data Only / No Provider Call
```

## v28.0L-3T readiness update

v28.0L-3T enables visible display flags for the current production layer without a provider call.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Frontend hidden scaffold | ready | L-3R scaffold remains the render path. | No | Keep guard checks active. |
| Visible display flags | enabled | `displayEnabled=true` and `boundaries.frontendDisplayApproved=true`. | No | Audit the visible display in L-3T-1. |
| AI text content | unchanged | This PR changes display flags only. | No | Do not edit text manually. |
| Visible display | enabled_for_current_layer | Existing scaffold may render the read-only panel. | No | Monitor copy and layout through audit. |
| Daily integration | not_ready | No Daily integration is approved or implemented. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No scheduled or automatic provider calls are approved or implemented. | Yes | Keep manual-only unless a separate future phase approves otherwise. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | All affect flags remain false and no related logic changes. | Yes | Keep external AI out of these paths. |

Current L-3T decision:

```text
visible_display_flags_enabled_no_provider_call
```

Recommended next step:

```text
v28.0L-3T-1 Visible Display Audit Sync - No Provider Call
```

## v28.0L-3T-1 readiness update

v28.0L-3T-1 records the post-merge audit for visible display flag enablement.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Visible display flags | enabled / audited | `displayEnabled=true` and `boundaries.frontendDisplayApproved=true` passed post-merge audit. | No | Keep guard checks active. |
| Frontend scaffold | active | Existing scaffold may render the read-only panel. | No | Future UX changes require separate PR. |
| AI text content | unchanged | L-3T did not change AI text content. | No | Do not edit text manually. |
| Daily integration | not_ready | No Daily integration is approved or implemented. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No scheduled or automatic provider calls are approved or implemented. | Yes | Keep manual-only unless a separate future phase approves otherwise. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | All affect flags remain false and no related logic changes. | Yes | Keep external AI out of these paths. |

Current L-3T-1 decision:

```text
visible_display_flags_audited_no_provider_call
```

Recommended next step:

```text
v28.0L-3U External AI Visible Display UX Polish - No Provider Call
```

## v28.0L-3U readiness update

v28.0L-3U polishes the visible external AI read-only panel without changing provider output or production data.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Visible display | active | The existing scaffold may render the current production layer. | No | Keep guard checks active. |
| Visible display UX polish | implemented | Panel structure now separates summary, observations, AI inferences, uncertainty, confidence, and timestamp. | No | Audit UX in L-3U-1. |
| AI text content | unchanged | No generated external AI text is edited or refreshed. | No | Do not edit text manually. |
| Daily integration | not_ready | No Daily integration is approved or implemented. | Yes | Keep disconnected. |
| Automatic provider calls | not_ready | No scheduled or automatic provider calls are approved or implemented. | Yes | Keep manual-only unless a separate future phase approves otherwise. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | All affect flags remain false and no related logic changes. | Yes | Keep external AI out of these paths. |

Current L-3U decision:

```text
visible_display_ux_polished_no_provider_call
```

Recommended next step:

```text
v28.0L-3U-1 Visible Display UX Audit Sync - No Provider Call
```

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

## 15. v28.0L-3H-1 readiness update

Run `25592238444` changed the readiness picture without changing production readiness.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Provider-call transport | works_for_fixture_sample | Environment-gated `provider-call-artifact-only` entered and executed one DeepSeek call for `fixture_sample`. | No | Keep first-call path manual and fixture-only. |
| Output validator | works | External AI output validation passed and DeepSeek manual API test passed. | No | Keep validator required before quality review. |
| Quality review | blocked_promotion | Quality review failed with `needs_prompt_revision`; `promotionEligible=false`. | Yes | Revise fixture prompt / quality behavior in a no-provider-call PR before rerun. |
| Artifact sanitizer | works_but_diagnostic_marker_fix_needed | Sanitizer blocked upload because diagnostic JSON contained the forbidden marker `DEEPSEEK_API_KEY`; this was the secret name, not the secret value. | Yes | Remove the literal marker from generated diagnostic artifacts and keep the sanitizer strict. |
| Production integration | not_ready | No production data, frontend, Daily, Worker, config, scoring, decision, execution, or position path changed. | Yes | Separate reviewed production integration phase remains required. |
| Frontend display | not_ready | Provider output remains artifact-only and failed quality review. | Yes | Do not display external AI output. |

Current L-3H-1 decision:

```text
fixture_provider_transport_observed_quality_blocked_sanitizer_fix_required
```

Do not rerun the provider-call workflow until the diagnostic marker fix is merged. Do not run live/local input provider calls until a later `fixture_sample` quality review passes.

## 16. v28.0L-3H-2 readiness update

v28.0L-3H-2 updates prompt and quality guidance before any rerun.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Provider-call transport | verified_for_fixture_sample | Run `25592238444` reached DeepSeek once behind the environment gate. | No | Keep next run fixture-only. |
| Output validator | verified | Run `25592238444` output validation passed. | No | Keep validator required. |
| Quality review | needs_prompt_revision | Run `25592238444` failed offline quality review with `promotionEligible=false`. | Yes | Merge and audit L-3H-2 prompt guidance before rerun. |
| Fixture_sample provider rerun | pending_l3h2_merge | Prompt now avoids mixed source markers and strengthens attribution / confidence / incremental-value guidance. | Yes | Next real run should be `v28.0L-3H-3 Second Fixture Sample Provider Call Audit`. |
| Live/local provider call | not_ready | Fixture quality review has not passed yet. | Yes | Do not run live/local provider input. |
| Production integration | not_ready | Output remains artifact-only; no production paths are connected. | Yes | Separate reviewed production integration phase required. |
| Frontend display | not_ready | External AI output is still not approved for display. | Yes | Do not make `externalAiInterpretationLayer` visible. |

Current L-3H-2 decision:

```text
fixture_prompt_quality_revised_no_provider_call
```

## 17. v28.0L-3H-3 readiness update

Run `25593082968` completed the second `fixture_sample` provider-call audit successfully.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Fixture_sample provider call | audited / ready | Run `25593082968` completed successfully with `provider=deepseek`, model `deepseek-v4-flash`, `apiCalled=true`, and `networkUsed=true`. | No | Do not rerun fixture repeatedly; use this as the fixture path audit record. |
| Provider transport | verified | The provider command executed through environment `external-ai-manual`; the provider key was masked by GitHub Actions. | No | Keep environment-gated, step-scoped secret handling. |
| Output validator | verified | DeepSeek manual API test PASS and External AI output validation PASS. | No | Keep validator required for future artifacts. |
| Quality review | verified_for_fixture_sample | External AI artifact quality review PASS with `recommendation=pass_for_manual_review`. | No | Keep quality review required and keep `promotionEligible=false`. |
| Artifact sanitizer | verified | Artifact sanitizer PASS. | No | Keep sanitizer strict before upload. |
| Artifact upload | verified | Sanitized provider-call artifacts uploaded. | No | Continue artifact-only retention and review. |
| Live/local compact provider call | not_ready | L-3H-3 audited only `fixture_sample`. | Yes | Requires separate design/review before any live/local execution. |
| Production data write | not_ready | `productionDataWritten=false`; no data promotion is approved. | Yes | Separate reviewed production integration phase required. |
| Frontend display | not_ready | `frontendDisplayChanged=false`; external provider output remains non-user-visible. | Yes | Separate reviewed display phase required. |
| Daily integration | not_ready | No Daily integration was added or approved. | Yes | Separate future Daily phase required. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | L-3H-3 does not change scoring, decision, execution, or position logic. | Yes | Keep external AI output outside these paths. |

Current L-3H-3 decision:

```text
fixture_sample_provider_path_audited_live_local_not_ready
```

## 18. Current readiness decision

Overall readiness:

```text
fixture_sample_provider_path_audited
```

Live/local provider-call readiness:

```text
not_ready_requires_separate_design_review
```

Production integration:

```text
not_ready
```

Recommended next PR:

```text
v28.0L-3I Live/Local Compact Provider-Call Design - No Provider Call
```

L-3H-3 records fixture path audit success only. It does not approve live/local provider execution, production data writes, frontend display, Daily integration, `externalAiInterpretationLayer` promotion, or scoring / decision / execution / position changes.

## 19. v28.0L-3I readiness update

v28.0L-3I documents the future live/local compact provider-call design without implementing it.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Fixture_sample provider path | verified | Run `25593082968` passed provider transport, validation, quality review, sanitizer, and artifact upload. | No | Keep fixture path available and gated. |
| Local_compact design | ready / documented | [`EXTERNAL_AI_LIVE_LOCAL_COMPACT_PROVIDER_CALL_DESIGN.md`](EXTERNAL_AI_LIVE_LOCAL_COMPACT_PROVIDER_CALL_DESIGN.md) records constraints, input preparation, prompt semantics, gates, artifact policy, stop rules, and acceptance criteria. | No | Use as the implementation reference. |
| Local_compact implementation | not_ready | No workflow or script change exists in L-3I. | Yes | Requires separate reviewed L-3J implementation PR. |
| Live/local provider call | not_ready | L-3I does not execute a provider call. | Yes | Do not run until L-3J or later is merged and audited. |
| Production integration | not_ready | Provider output remains artifact-only and `promotionEligible=false`. | Yes | Separate reviewed production phase required. |
| Frontend display | not_ready | External AI output remains non-user-visible. | Yes | Separate reviewed display phase required. |

Current L-3I decision:

```text
local_compact_design_ready_implementation_not_ready
```

## 20. v28.0L-3J readiness update

v28.0L-3J implements the `local_compact` workflow path but does not run the provider call.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Fixture_sample provider path | verified | Run `25593082968` passed provider transport, validation, quality review, sanitizer, and artifact upload. | No | Keep fixture path available and gated. |
| Local_compact workflow path | implemented / pending audit | The provider workflow can build `manual-input-compact-latest.json` and select it as the provider input behind the manual gates. | No | Run one manually approved audit after merge. |
| Local_compact provider call | not_yet_audited | L-3J does not call DeepSeek and does not trigger GitHub Actions. | Yes | Complete `v28.0L-3J-1 First Local Compact Provider-Call Audit`. |
| Production integration | not_ready | Provider artifacts remain `artifactOnly=true` and `promotionEligible=false`; no data promotion is connected. | Yes | Separate reviewed production integration phase required. |
| Frontend display | not_ready | External AI output remains non-user-visible. | Yes | Separate reviewed display phase required. |
| Daily integration | not_ready | No Daily provider-call integration exists. | Yes | Separate future Daily phase required. |
| Scoring / decision / execution / position impact | blocked / out_of_scope | L-3J changes only provider workflow gating and docs. | Yes | Keep external AI output outside these paths. |

Current L-3J decision:

```text
local_compact_workflow_path_implemented_provider_call_pending_audit
```

## 21. v28.0L-3J-1 readiness update

Run `25598085025` attempted the first `local_compact` provider-call audit and stopped safely at artifact sanitization.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Local compact input generation | verified_for_gate_job | `manual-input-compact-latest.json` was built with `sourceType=local_file`, `compact=true`, `productionDataWritten=false`, `frontendDisplayChanged=false`, `secretsRead=false`, and `apiCalled=false`. | No | Keep builder read-only and artifact-only. |
| Provider gates | satisfied | Run inputs satisfied the `local_compact` provider-call gates. | No | Keep the same explicit gates. |
| Artifact sanitizer | false_positive_fix_needed | Sanitizer blocked read-only source metadata `data/radar-data.json` in the compact input artifact. | Yes | Merge L-3J-1 before retry. |
| Provider call | not_run | `provider-call-artifact-only` did not run; no DeepSeek call occurred. | Yes | Retry once after sanitizer fix merges. |
| Secret usage | not_read | Provider job did not run and no secret was read. | No | Keep Environment secret step-scoped. |
| Production integration | not_ready | No production data, frontend, Daily, Worker, config, scoring, decision, execution, or position path changed. | Yes | Separate reviewed production phase required. |

Current L-3J-1 decision:

```text
sanitizer_source_metadata_fix_needed_provider_call_pending_retry
```

Recommended next PR:

```text
v28.0L-3J-2 First Local Compact Provider-Call Audit Retry
```

## 22. v28.0L-3J-3 readiness update

Run `25598379612` verified the `local_compact` transport path through provider execution, validation, sanitizer, and artifact upload, but quality review blocked promotion on execution-language safety.

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Local_compact transport | verified | Run `25598379612` built compact local input and executed the provider-call job. | No | Keep workflow manual and environment-gated. |
| Local_compact validator | verified | External AI output validation passed. | No | Keep validator required. |
| Local_compact sanitizer | verified | Artifact sanitizer passed and sanitized artifacts uploaded. | No | Keep sanitizer strict. |
| Local_compact quality review | blocked_due_executionLanguageSafety | Quality review failed because `$.facts[5]` contained `执行灯`. | Yes | Merge L-3J-3 prompt revision before retry. |
| Local_compact prompt revision | this_pr | Prompt now forbids repeating `decisionContext` operation language into user-facing output fields. | Yes | Retry once after merge and audit result. |
| Production integration | not_ready | Provider output remains artifact-only and `promotionEligible=false`. | Yes | Separate reviewed production integration phase required. |
| Frontend display | not_ready | External AI output remains non-user-visible. | Yes | Separate reviewed display phase required. |

Current L-3J-3 decision:

```text
local_compact_transport_verified_quality_blocked_prompt_revision_required
```

Recommended next PR:

```text
v28.0L-3J-4 Local Compact Provider-Call Audit Retry After Execution-Language Fix
```

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
