# External AI Production Data Contract Design - v28.0L-3L

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a documentation-only data contract design.

- No production write.
- No frontend display.
- No workflow change.
- No script change.
- No provider call.
- No secret access.
- No Daily integration.
- No automatic provider calls.
- No scoring / decision / execution / position changes.
- This design does not approve production implementation.

Current decision:

```text
production_data_contract_designed_write_no_go
```

## 2. Purpose

The future production contract should define how a validated, quality-reviewed, sanitized external AI artifact may be represented in production data in a read-only display layer.

The contract must preserve:

- display-only behavior.
- non-investment-advice boundaries.
- no scoring impact.
- no decision model impact.
- no execution lock impact.
- no position guidance impact.
- no frontend display until separately approved.
- no automatic provider call.

## 3. Proposed production location

Future production target:

```text
data/radar-data.json
```

Proposed field:

```text
externalAiInterpretationLayer
```

Contract boundary:

- The field remains disabled / absent / scaffold-only until a separate implementation PR.
- No write is made in this PR.
- The future field must be optional so the site works without it.
- Existing frontend must tolerate absence.

## 4. Proposed top-level schema

Future design shape:

```js
externalAiInterpretationLayer: {
  schemaVersion: "v28.0L-external-ai-production-1",
  status: "disabled" | "unavailable" | "valid" | "rejected" | "stale" | "provider_failed",
  displayEnabled: false,
  generatedAt: string | null,
  updatedAt: string | null,
  sourceMode: "manual_artifact" | "manual_local_compact" | "disabled",
  provider: "deepseek" | null,
  model: string | null,
  inputSource: "local_compact" | "fixture_sample" | null,
  sourceSemantics: "site_structured_data_compact_summary" | "sample_fixture" | null,
  summaryZh: string | null,
  facts: string[],
  inferences: string[],
  modelJudgments: object[],
  scenarioHypotheses: object[],
  dataGaps: string[],
  invalidationSignals: string[],
  sourceAttribution: object[],
  confidence: object,
  qualityReview: object,
  provenance: object,
  freshness: object,
  boundaries: object,
  auditFlags: string[]
}
```

This is a design target only. It is not an actual production data write.

## 5. Required boundaries

Future production object must always include:

```js
boundaries.displayOnly = true
boundaries.externalAiGenerated = true
boundaries.usesExternalAiApi = true
boundaries.affectsScoring = false
boundaries.affectsDecisionModel = false
boundaries.affectsExecutionLock = false
boundaries.affectsPositionGuidance = false
boundaries.notInvestmentAdvice = true
boundaries.productionWriteApproved = false
boundaries.frontendDisplayApproved = false
```

`boundaries.productionWriteApproved` may become true only after a separate explicit production write PR approves it. `boundaries.frontendDisplayApproved` may become true only after a separate explicit frontend PR approves it.

Required effects boundary:

- The AI layer must never alter risk scores.
- The AI layer must never alter decision lights.
- The AI layer must never alter execution locks.
- The AI layer must never alter portfolio / position guidance.
- The AI layer must never change Global Risk Heatmap layout.

## 6. Required status model

`disabled`:

- default state.
- no production AI interpretation available.
- frontend should not display AI layer.

`unavailable`:

- feature path exists but no valid artifact is available.

`valid`:

- artifact passed output validator, quality review, sanitizer, and production contract validator.
- still `displayEnabled=false` until frontend display approval.

`rejected`:

- validator / quality review / sanitizer rejected the artifact.

`stale`:

- artifact is older than allowed freshness window.

`provider_failed`:

- provider returned timeout, 503, or failure artifact.

Status interpretation:

- `status=valid` does not imply frontend display.
- `status=valid` does not imply `promotionEligible=true`.
- `status=valid` does not imply investment advice.

## 7. Required provenance model

Future provenance shape:

```js
provenance: {
  runId: string | null,
  artifactName: string | null,
  artifactId: string | null,
  artifactDigest: string | null,
  sourceCommit: string | null,
  sourceDataUpdatedAt: string | null,
  inputArtifactPath: string | null,
  outputArtifactPath: string | null,
  qualityReviewArtifactPath: string | null,
  generatedBy: "manual_workflow" | "disabled",
  humanApproved: false
}
```

Provenance restrictions:

- Do not store secrets.
- Do not store Authorization headers.
- Do not store raw provider request / response headers.
- Do not store raw provider response outside the validated contract.
- Artifact IDs and run IDs are allowed as audit metadata.
- Artifacts expire and are not durable production records.

## 8. Required freshness model

Future freshness shape:

```js
freshness: {
  artifactGeneratedAt: string | null,
  sourceDataUpdatedAt: string | null,
  maxAgeHours: number,
  isStale: boolean,
  staleReasonZh: string | null
}
```

Recommended freshness window:

- `maxAgeHours=24` for manual external AI artifact in production.
- Future changes require separate approval.

Freshness rules:

- If stale, status must not be `valid`.
- If source data is stale, confidence must be reduced or status should become `stale` / `unavailable`.
- Stale AI must not display by default.

## 9. Required quality review model

Future quality review shape:

```js
qualityReview: {
  status: "pass" | "warn" | "fail" | "not_run",
  recommendation: "pass_for_manual_review" | "needs_prompt_revision" | "reject_for_promotion" | "provider_failure_only" | null,
  promotionEligible: false,
  failedDimensions: string[],
  warningDimensions: string[],
  reviewedAt: string | null
}
```

Quality review rules:

- `promotionEligible` must remain false in this contract.
- Any future `promotionEligible=true` requires separate explicit approval.
- `fail` or `reject_for_promotion` must prevent production write.
- `warn` may allow manual review only, not automatic production.

## 10. Required content safety constraints

Production string fields must not include:

- 执行灯
- 执行
- 仓位
- 现金
- 敞口
- 交易
- 买入
- 卖出
- 加仓
- 减仓
- 做多
- 做空
- 建仓
- 平仓
- 止损
- 止盈
- 操作信号
- 行动信号
- 交易信号
- 配置建议
- 风险动作
- 风控动作

These terms are allowed only where they appear as fixed boolean field names such as `affectsExecutionLock`.

Content safety rules:

- `decisionContext` remains read-only background.
- `decisionContext` raw fields must not be surfaced.
- `sourceAttribution.noteZh` must not repeat operation language.
- `auditFlags` must be neutral tags only.

## 11. Required validator design

Future implementation must add a production contract validator before writing to `data/radar-data.json`.

The validator must check:

- `schemaVersion` present.
- `status` is allowed enum.
- `displayEnabled=false` by default.
- boundaries booleans are correct.
- `promotionEligible=false`.
- no unsafe execution / investment / trading wording.
- no secrets / headers / bearer tokens / `.env` / `rawHeaders`.
- no raw provider dump.
- `sourceAttribution` is structured.
- confidence is structured and conservative.
- `qualityReview` is structured.
- freshness is structured.
- provenance is structured.
- no scoring / decision / execution / position effect.
- data file remains valid after insertion.
- existing data validation still passes.

## 12. Required production write gates

Before any production write PR:

- separate explicit user approval.
- production contract validator exists.
- production write dry-run exists.
- no frontend display.
- no Daily integration.
- no automatic provider call.
- one manual `local_compact` artifact selected.
- artifact passed validator / review / sanitizer.
- production contract projection passed.
- protected path diff reviewed.
- rollback plan documented.
- `check:data` passes.
- `check:all` passes.

## 13. Required frontend gates

Before frontend display:

- separate explicit user approval.
- production data object exists and validates.
- frontend copy design reviewed.
- Chinese display text only.
- clearly labeled AI interpretation / display-only.
- not investment advice.
- no execution / action / position / cash / exposure wording.
- hidden or collapsed by default unless approved.
- fallback for absent / stale / rejected / provider_failed states.
- does not affect Global Risk Heatmap layout.
- does not affect scoring / decision / execution / position.

## 14. Recommended next phase

Recommended next phase:

```text
v28.0L-3M External AI Production Contract Validator Scaffold - No Production Write
```

This next phase should:

- add validator / checker for the proposed production contract.
- add fixture or sample contract object if useful.
- not write `data/radar-data.json`.
- not display frontend.
- not call DeepSeek.
- not trigger workflow.

## 15. Current decision

- Contract design: this PR.
- Production contract validator: not yet.
- Production write: NO-GO.
- Frontend display: NO-GO.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.
- Recommended next step: validator scaffold only.

## 16. v28.0L-3M validator scaffold status

v28.0L-3M adds the production contract validator scaffold:

- `scripts/check-external-ai-production-contract.mjs`.
- `docs/fixtures/external-ai/production-contract-valid-v28.0L.json`.
- `npm run check:external-ai-production-contract`.
- `check:all` coverage after `check:external-ai-output` and before manual scaffold checks.

This stage validates the proposed `externalAiInterpretationLayer` contract shape from a fixture only.

It does not:

- write `data/radar-data.json`.
- display external AI output on the frontend.
- call DeepSeek.
- trigger a workflow.
- read secrets.
- integrate with Daily.
- add automatic provider calls.
- change scoring / decision / execution / position logic.

Recommended next phase:

```text
v28.0L-3N External AI Production Projection Dry-Run - No Production Write
```

## 17. v28.0L-3N projection dry-run status

v28.0L-3N adds a deterministic projection dry-run scaffold:

- `scripts/project-external-ai-production-dry-run.mjs`.
- `npm run project:external-ai-production:dry-run`.
- `npm run check:external-ai-production-projection`.

The dry-run projects a validated external AI artifact into the proposed `externalAiInterpretationLayer` contract shape and writes only to:

```text
manual-artifacts/external-ai/external-ai-production-projection-latest.json
```

The projection output remains an ignored manual artifact. It is not `data/radar-data.json`, not production data, and not frontend-visible. The production contract validator validates the projected output before this path can be considered usable for later design work.

Current L-3N boundary:

- Production write: NO-GO.
- Frontend display: NO-GO.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.
- `promotionEligible=true`: NO-GO.
- Scoring / decision / execution / position effect: NO-GO.

Recommended next phase:

```text
v28.0L-3O First Controlled Production Write Design - No Frontend Display
```

## 18. v28.0L-3O first controlled write design status

v28.0L-3O adds [`EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md`](EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md) and a read-only production write guard:

- `scripts/check-external-ai-production-write-guard.mjs`.
- `npm run check:external-ai-production-write-guard`.
- `check:all` coverage after projection validation.

This stage designs the future first controlled write only. It does not write `data/radar-data.json`, does not add a write command, does not display external AI output on the frontend, and does not approve production integration.

Current L-3O boundary:

- Production write: NO-GO.
- Frontend display: NO-GO.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.
- Next step requires explicit approval before any data-only write phase.

## 19. v28.0L-3P first controlled write completion

v28.0L-3P completes the first controlled data-only write of the production `externalAiInterpretationLayer`.

Completion record:

- Source artifact run: `25598887574`.
- Source artifact name: `external-ai-manual-provider-test-provider-25598887574`.
- Production target: `data/radar-data.json`.
- Contract validator passed on `data/radar-data.json`.
- Write guard passed after insertion.
- `displayEnabled=false`.
- `boundaries.frontendDisplayApproved=false`.
- `qualityReview.promotionEligible=false`.
- Frontend display remains not approved.
- Daily integration remains not approved.
- Automatic provider calls remain not approved.
- Scoring / decision / execution / position effects remain blocked.

Recommended next phase:

```text
v28.0L-3P-1 First Production Write Audit Sync - No Frontend Display
```

## 20. v28.0L-3P-1 first write audit result

v28.0L-3P-1 records that the first controlled production write passed post-merge audit.

Audit result:

- The production contract is now present in `data/radar-data.json`.
- The inserted layer came from approved source run `25598887574`.
- `check:external-ai-production-contract -- data/radar-data.json` passed.
- `check:external-ai-production-write-guard` passed.
- `check:data` passed.
- `check:all` passed.
- `displayEnabled=false`.
- `boundaries.frontendDisplayApproved=false`.
- `qualityReview.promotionEligible=false`.

This audit does not enable automatic display. The next phase is frontend display design, not frontend implementation and not automatic display.

Recommended next step:

```text
v28.0L-3Q External AI Frontend Display Design - No Display Yet
```

## 21. v28.0L-3Q frontend display design status

v28.0L-3Q adds [`EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md`](EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md) as a documentation-only design for a future read-only display panel.

Status update:

- Frontend display design is documented.
- Display remains disabled: `displayEnabled=false`.
- Frontend approval remains false: `boundaries.frontendDisplayApproved=false`.
- No frontend code is added.
- No production data is changed.
- No provider call or workflow trigger is introduced.
- Daily integration and automatic provider calls remain disabled.

Recommended next step:

```text
v28.0L-3R External AI Frontend Display Scaffold - Hidden by Default
```

## 22. v28.0L-3S visible display flag design status

v28.0L-3S documents that visible display requires explicit data flags in the production contract.

Status update:

- Display flags are part of the production contract.
- Future visible display requires `displayEnabled=true`.
- Future visible display requires `boundaries.frontendDisplayApproved=true`.
- Current production data keeps both flags false.
- Enabling visible display does not imply a provider rerun.
- Enabling visible display does not imply new AI text content.
- Enabling visible display does not imply scoring / decision / execution / position impact.
- Automatic provider calls and Daily integration remain disabled.

Recommended next step:

```text
v28.0L-3T External AI Visible Display Flag Enablement - Data Only / No Provider Call
```

## 23. v28.0L-3T visible display contract status

v28.0L-3T updates the production contract checks to support the approved visible state when both display flags are true.

Status update:

- The production contract supports hidden state: `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`.
- The production contract supports approved visible state: `displayEnabled=true` and `boundaries.frontendDisplayApproved=true`.
- Mismatched display flags remain invalid.
- All non-impact boundaries remain required.
- `qualityReview.promotionEligible=false` remains required.
- `freshness.isStale=false` remains required for the visible production layer.
- Enabling visible display does not imply provider rerun, AI text changes, scoring impact, Daily integration, or automatic provider calls.

Recommended next step:

```text
v28.0L-3T-1 Visible Display Audit Sync - No Provider Call
```

## 24. v28.0L-3T-1 visible display contract audit

v28.0L-3T-1 records that the production contract supports the current approved visible state.

Audit result:

- Current approved visible state is supported by the production contract.
- `displayEnabled=true`.
- `boundaries.frontendDisplayApproved=true`.
- The data flags were enabled without provider refresh.
- AI text content was not changed.
- All non-impact boundaries remain required.
- Automatic provider calls and Daily integration remain disabled.

Recommended next step:

```text
v28.0L-3U External AI Visible Display UX Polish - No Provider Call
```

## 25. v28.0L-3U-1 visible display UX contract audit

v28.0L-3U-1 records that the UX polish did not alter the production contract.

Audit result:

- The production `externalAiInterpretationLayer` contract remains unchanged.
- `data/radar-data.json` was not modified by the UX polish.
- AI text content was not changed.
- `check:external-ai-production-contract -- data/radar-data.json` continued to pass.
- The production write guard continued to pass.
- Automatic provider calls and Daily integration remain disabled.
