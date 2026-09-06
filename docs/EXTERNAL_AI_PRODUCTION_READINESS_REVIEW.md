# External AI Production Integration Readiness Review - v28.0L-3K

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a documentation-only readiness review.

- No production write.
- No frontend display.
- No workflow change.
- No script change.
- No provider call.
- No secret access.
- No Daily integration.
- No scoring / decision / execution / position change.
- This review does not approve production integration.

Current decision:

```text
manual_artifact_only_ready_production_integration_no_go
```

## 2. Verified capabilities

The external AI manual artifact-only path has verified these capabilities:

- Environment-gated manual provider call works.
- GitHub Environment `external-ai-manual` gate works.
- `DEEPSEEK_API_KEY` remains step-scoped and masked.
- `fixture_sample` provider path works.
- `local_compact` provider path works.
- `local_compact` compact input builder works from local `data/radar-data.json` as read-only source metadata.
- Output validator works.
- Quality review works.
- Artifact sanitizer works.
- Short-retention artifact upload works.
- Node 24 workflow baseline works.
- Post-run protected-path safety assertion works.

These capabilities are sufficient for manual artifact-only audits. They are not sufficient for production data writes, frontend display, Daily integration, automatic provider calls, or scoring / decision / execution / position integration.

## 3. Verified audits

Fixture sample successful audit:

- Run `25593082968`.
- Provider path: `fixture_sample`.
- Output validator: PASS.
- Quality review: PASS.
- Artifact sanitizer: PASS.
- Sanitized artifacts uploaded.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- `promotionEligible=false`.

Local compact successful audit:

- Run `25598887574`.
- Commit `ade9ca2`.
- Provider path: `local_compact`.
- Local compact input build: PASS.
- `manual-input-compact-latest.json` created from local `data/radar-data.json` as read-only source metadata.
- `sourceType=local_file`.
- `compact=true`.
- `radarDataUpdatedAt=2026-05-08T23:29:12.835Z`.
- Provider path entered through `external-ai-manual`.
- Environment secret was step-scoped and masked.
- Provider: `deepseek`.
- Model: `deepseek-v4-flash`.
- DeepSeek manual API test: PASS.
- Output validator: PASS.
- Warnings: 0.
- Quality review: PASS.
- Artifact sanitizer: PASS.
- Sanitized provider-call artifacts uploaded.
- Post-run safety assertion: PASS.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- `promotionEligible=false`.
- `artifactOnly=true`.

Local compact uploaded artifacts:

- `external-ai-manual-provider-test-provider-25598887574`, artifact ID `6894997771`, size `8636` bytes, expires `2026-05-12`.
- `external-ai-manual-provider-test-gate-25598887574`, artifact ID `6894989939`, size `6502` bytes, expires `2026-05-12`.

Earlier safe failures:

- Run `25598085025`: first `local_compact` audit attempt stopped safely on a sanitizer false positive for read-only `data/radar-data.json` source metadata.
- Run `25598379612`: `local_compact` transport, validator, sanitizer, and artifact upload passed, but quality review failed closed on `executionLanguageSafety`.

Those failures proved the gates fail closed. The sanitizer source metadata rule and execution-language prompt boundary were fixed and re-audited before run `25598887574` succeeded.

## 4. Current readiness matrix

| Area | Status | Decision |
|---|---|---|
| Manual environment-gated provider call | ready / verified | Keep manual and environment-gated. |
| `fixture_sample` provider call | ready / verified | Use existing audit record; do not rerun unnecessarily. |
| `local_compact` provider call | ready / verified | Use existing audit record; do not rerun without an approved task. |
| Output validator | ready / verified | Keep required for all future artifacts. |
| Quality review | ready / verified | Keep required and fail closed. |
| Artifact sanitizer | ready / verified | Keep strict before any artifact upload or review. |
| Short-retention artifacts | ready / verified | Keep artifacts short-lived and non-production. |
| Node 24 workflow baseline | ready / verified | Keep `>=24 <25`, `.nvmrc=24`, `.node-version=24`, and Node 24 Actions baseline. |
| Protected path assertion | ready / verified | Keep post-run safety assertion required. |
| Production integration design | partially ready | Existing design exists, but production schema details need a dedicated data contract phase. |
| `externalAiInterpretationLayer` data contract | partially ready | Disabled scaffold exists; production schema is not approved. |
| Operator runbook for manual audit | partially ready | Manual audit notes exist; production promotion runbook does not exist. |
| Production data write | not_ready | NO-GO. |
| Frontend display | not_ready | NO-GO. |
| Daily integration | not_ready | NO-GO. |
| Scheduled / automatic provider calls | not_ready | NO-GO. |
| `promotionEligible=true` | not_ready | NO-GO. |
| Worker integration | not_ready | NO-GO. |
| Scoring / decision / execution / position integration | not_ready | Permanently blocked unless the project contract is explicitly redesigned. |
| Provider fallback / retry policy beyond `max_attempts=1` | not_ready | Needs separate design and cost controls. |
| Cost budget and spend monitoring for repeated production calls | not_ready | Needs separate owner, limits, and monitoring. |
| Incident rollback plan for bad AI output | not_ready | Needs separate rollback and disable procedure. |
| Artifact-to-production promotion tool | not_ready | No tool is approved or desired in this phase. |

## 5. Production integration risks

- AI may still hallucinate or overstate despite validator and quality review.
- `local_compact` is site-structured data only, not independent market verification.
- Provider availability may fail with 503, timeout, or other transient errors.
- Future production outputs may need stronger schema and versioning than manual artifacts.
- Frontend display could create perceived investment advice if wording is not tightly controlled.
- Production writes could accidentally affect `data/radar-data.json` or `externalAiInterpretationLayer` if not isolated.
- Repeated provider calls may create cost risk.
- Artifacts expire after 3 days and are not durable records.
- Prompt drift or model drift can change output quality.
- Secrets must remain environment-gated and step-scoped.

## 6. Required gates before any production write

Before any PR can write an external AI result into a production data file, all must be true:

- Separate explicitly approved PR.
- Design reviewed and documented.
- Production output target explicitly defined.
- Data contract for `externalAiInterpretationLayer` versioned.
- Production JSON validator updated.
- Production quality review gate updated.
- Sanitizer blocks raw provider output, secrets, headers, and unsafe wording.
- AI output remains display-only.
- `promotionEligible` remains false unless a separate approval exists.
- No scoring / decision / execution / position effect.
- Rollback plan documented.
- Manual one-run production dry-run performed without writing data.
- Artifact review performed before any write.
- Human approval before promotion.
- No automatic scheduled provider call.
- No frontend display until production data contract and UI copy are reviewed.

## 7. Required gates before frontend display

Before any frontend display:

- Separate explicitly approved PR.
- Display text must be Chinese.
- Display must be clearly labeled as AI interpretation / display-only.
- Must state not investment advice.
- Must not include trading / action / position / cash / exposure wording.
- Must not affect decision lights, execution locks, risk scores, or portfolio guidance.
- Must have fallback UI when AI output is absent, invalid, stale, failed, or rejected.
- Must include data freshness and confidence.
- Must pass copy contract checks.
- Must pass DOM / module checks.
- Must not make charts smaller or interfere with Global Risk Heatmap isolation.
- Must be disabled by default until production data path is verified.

## 8. Recommended next phase

Recommended next phase:

```text
v28.0L-3L External AI Production Data Contract Design - No Production Write
```

This next phase should:

- design the exact `externalAiInterpretationLayer` production schema.
- define how a provider artifact might map into production data in the future.
- define validator requirements.
- define freshness / staleness rules.
- define failure states.
- define frontend read-only display contract.
- still not write production data.

Do not proceed directly to production implementation.

## 9. Current decision

- Manual artifact-only external AI path: ready.
- `local_compact` provider-call audit path: ready.
- Production write: NO-GO.
- Frontend display: NO-GO.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.
- Recommended next step: data contract design only.

## 10. v28.0L-3L production data contract design note

v28.0L-3L adds [`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md) as the future `externalAiInterpretationLayer` production contract design.

Readiness update:

- Production data contract design is documented.
- Production contract validator is not yet implemented.
- Production write dry-run is not yet implemented.
- Production write remains NO-GO.
- Frontend display remains NO-GO.
- Daily integration remains NO-GO.
- Automatic provider calls remain NO-GO.

Recommended next step:

```text
v28.0L-3M External AI Production Contract Validator Scaffold - No Production Write
```

## 11. v28.0L-3M production contract validator scaffold note

v28.0L-3M adds a validator scaffold for the proposed production data contract.

Readiness update:

- Production data contract design: done.
- Production contract validator scaffold: this PR.
- Valid production contract fixture: this PR.
- Production write dry-run / projection: not yet.
- Production write: still NO-GO.
- Frontend display: still NO-GO.
- Daily integration: still NO-GO.
- Automatic provider calls: still NO-GO.

Recommended next step:

```text
v28.0L-3N External AI Production Projection Dry-Run - No Production Write
```

## 12. v28.0L-3N production projection dry-run note

v28.0L-3N adds a deterministic dry-run projection path for the future production contract.

Readiness update:

- Production data contract design: done.
- Production contract validator scaffold: done.
- Production projection dry-run: scaffolded.
- Projection artifact target: `manual-artifacts/external-ai/external-ai-production-projection-latest.json`.
- Production contract validator passes on the projected output.
- Production write: still NO-GO.
- Frontend display: still NO-GO.
- Daily integration: still NO-GO.
- Automatic provider calls: still NO-GO.

Recommended next phase:

```text
v28.0L-3O First Controlled Production Write Design - No Frontend Display
```

## 13. v28.0L-3O first controlled write design note

v28.0L-3O adds first controlled production write design and a read-only write guard.

Readiness update:

- Production projection dry-run: done.
- Production write guard: added.
- First controlled write design: documented.
- Production write: still NO-GO.
- Frontend display: still NO-GO.
- Daily integration: still NO-GO.
- Automatic provider calls: still NO-GO.

Recommended next step:

```text
v28.0L-3P First Controlled Production Write - Data Only / No Frontend Display
```

only after explicit user approval.

## 14. v28.0L-3P first controlled write readiness update

v28.0L-3P completes the first controlled data-only production write from approved run `25598887574`.

Readiness update:

- Production data write: first data-only write completed.
- Source artifact: `external-ai-manual-provider-test-provider-25598887574`.
- Contract validator passed on `data/radar-data.json`.
- Write guard passed after insertion.
- Frontend display: not_ready.
- Daily integration: not_ready.
- Automatic provider calls: not_ready.
- Scoring / decision / execution / position impact: blocked / out_of_scope.

Recommended next step:

```text
v28.0L-3P-1 First Production Write Audit Sync - No Frontend Display
```

## 15. v28.0L-3P-1 first write audit-sync readiness update

v28.0L-3P-1 records the post-merge audit for the first controlled production write.

Readiness update:

- Production data write: first controlled data-only write completed.
- Production contract validation: passed on `data/radar-data.json`.
- Production write guard: passed.
- `check:data`: passed.
- `check:all`: passed.
- Frontend display: still `not_ready`.
- Daily integration: still `not_ready`.
- Automatic provider calls: still `not_ready`.
- Scoring / decision / execution / position impact: blocked / out_of_scope.

Current decision:

- Production data layer: present and display-disabled.
- Frontend display: NO-GO until a separate frontend display design PR.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.

Recommended next step:

```text
v28.0L-3Q External AI Frontend Display Design - No Display Yet
```

## 16. v28.0L-3Q frontend display design readiness update

v28.0L-3Q documents the future frontend display design without implementing frontend display.

Readiness update:

- Frontend display design: this PR.
- Frontend implementation: `not_ready`.
- Visible display: `not_ready`.
- Production data write: already completed but display-disabled.
- Daily integration: `not_ready`.
- Automatic provider calls: `not_ready`.
- Scoring / decision / execution / position impact: blocked / out_of_scope.

Current decision:

- Display design: ready / documented.
- Hidden frontend scaffold: next phase only.
- Visible display: NO-GO.

Recommended next step:

```text
v28.0L-3R External AI Frontend Display Scaffold - Hidden by Default
```

## 17. v28.0L-3S visible display approval readiness update

v28.0L-3S documents the approval and data-flag process for future visible display without enabling display.

Readiness update:

- Frontend hidden scaffold: complete.
- Visible display approval design: this PR.
- Visible display flag enablement: `not_ready`.
- Production data write: already completed but display-disabled.
- Daily integration: `not_ready`.
- Automatic provider calls: `not_ready`.
- Scoring / decision / execution / position impact: blocked / out_of_scope.

Current decision:

- Hidden scaffold: ready.
- Visible display approval design: documented.
- Visible display flag enablement: next phase only.
- Visible display: NO-GO in this PR.

Recommended next step:

```text
v28.0L-3T External AI Visible Display Flag Enablement - Data Only / No Provider Call
```

## 18. v28.0L-3T visible display readiness update

v28.0L-3T enables visible display for the current production layer by setting only the approved data flags.

Readiness update:

- Frontend hidden scaffold: complete.
- Visible frontend display: enabled for the current production layer.
- Production data flags: `displayEnabled=true` and `boundaries.frontendDisplayApproved=true`.
- AI text content: unchanged.
- Provider calls: not run.
- Daily integration: `not_ready`.
- Automatic provider calls: `not_ready`.
- Scoring / decision / execution / position impact: blocked / out_of_scope.

Current decision:

- Current production layer display: enabled through data flags.
- Provider rerun: NO-GO.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.

Recommended next step:

```text
v28.0L-3T-1 Visible Display Audit Sync - No Provider Call
```

## 19. v28.0L-3T-1 visible display audit readiness update

v28.0L-3T-1 records that visible display flag enablement passed post-merge audit.

Readiness update:

- Visible frontend display: enabled through the existing scaffold.
- `displayEnabled=true` already audited.
- `boundaries.frontendDisplayApproved=true` already audited.
- AI text content: unchanged.
- Provider calls: not run.
- Daily integration: still `not_ready`.
- Automatic provider calls: still `not_ready`.
- Scoring / decision / execution / position impact: blocked / out_of_scope.

Current decision:

- Current production layer display: enabled and audited.
- Provider rerun: NO-GO.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.

Recommended next step:

```text
v28.0L-3U External AI Visible Display UX Polish - No Provider Call
```

## 20. v28.0L-3U-1 visible display UX readiness update

v28.0L-3U-1 records that visible display UX polish passed post-merge audit.

Readiness update:

- Visible frontend display: active.
- Visible display UX polish: completed and audited.
- AI text content: unchanged.
- Provider calls: not run.
- Recurring AI refresh: `not_ready`.
- Daily integration: still `not_ready`.
- Automatic provider calls: still `not_ready`.
- Scoring / decision / execution / position impact: blocked / out_of_scope.

Current decision:

- Current production layer display: active and polished.
- Provider rerun: NO-GO.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.
- Recurring AI refresh: NO-GO until separately designed.
