# External AI Frontend Display Design - v28.0L-3Q

## 1. Status

This is a documentation-only frontend display design.

- No frontend display.
- No frontend code.
- No data change.
- No provider call.
- No workflow trigger.
- No scoring / decision / execution / position impact.
- This design does not approve frontend implementation.

Current decision:

```text
frontend_display_design_only_visible_display_no_go
```

## 2. Current production data state

`data/radar-data.json` contains a contract-valid `externalAiInterpretationLayer`.

Current inserted layer state:

- `schemaVersion=v28.0L-external-ai-production-1`.
- `status=valid`.
- `displayEnabled=false`.
- `boundaries.frontendDisplayApproved=false`.
- `qualityReview.promotionEligible=false`.
- `qualityReview.status=pass`.
- `qualityReview.recommendation=pass_for_manual_review`.
- `sourceMode=manual_local_compact`.
- `provider=deepseek`.
- `model=deepseek-v4-flash`.
- `inputSource=local_compact`.
- `sourceSemantics=site_structured_data_compact_summary`.
- `boundaries.affectsScoring=false`.
- `boundaries.affectsDecisionModel=false`.
- `boundaries.affectsExecutionLock=false`.
- `boundaries.affectsPositionGuidance=false`.

Because `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`, the current production layer must remain hidden.

## 3. Purpose of future display

Future frontend display should show a read-only, clearly labeled AI interpretation of existing site-structured data.

It must not:

- look like a trading signal.
- look like investment advice.
- affect the existing risk score.
- affect Global Risk Heatmap.
- affect the decision model.
- affect the execution lock.
- affect position guidance.
- replace the existing rule-based AI interpretation layer.

The display must remain explanatory, secondary, and non-actionable.

## 4. Proposed UI placement

Future display placement:

- Add a separate panel below the existing main dashboard summary or near the AI interpretation section.
- Do not place it inside Global Risk Heatmap.
- Do not place it beside six base risk modules if it makes charts smaller.
- Make it collapsible or clearly secondary.
- Keep it visually subordinate to the primary dashboard and risk modules.
- Do not alter the existing heatmap layout.

Suggested Chinese heading:

```text
外部 AI 解读（只读）
```

Suggested status badge:

```text
仅供解释，不构成投资建议
```

## 5. Display conditions

Future frontend may display the panel only when all conditions are true:

- `externalAiInterpretationLayer` exists.
- `schemaVersion` is `v28.0L-external-ai-production-1`.
- `status=valid`.
- `displayEnabled=true`.
- `boundaries.frontendDisplayApproved=true`.
- `boundaries.displayOnly=true`.
- `boundaries.notInvestmentAdvice=true`.
- `boundaries.affectsScoring=false`.
- `boundaries.affectsDecisionModel=false`.
- `boundaries.affectsExecutionLock=false`.
- `boundaries.affectsPositionGuidance=false`.
- `qualityReview.promotionEligible=false`.
- `qualityReview.status` is `pass` or `warn`.
- `freshness.isStale=false`.
- `sourceMode=manual_local_compact`.
- `inputSource=local_compact`.

Current production data has `displayEnabled=false`, so frontend display must remain hidden.

## 6. Fallback states

Future frontend must show nothing or a minimal disabled state when:

- layer is absent.
- `status=disabled`.
- `status=unavailable`.
- `status=rejected`.
- `status=stale`.
- `status=provider_failed`.
- `displayEnabled=false`.
- `boundaries.frontendDisplayApproved=false`.
- quality review failed.
- `freshness.isStale=true`.
- contract validation fails.

Do not show raw error details to normal users.

## 7. Safe copy design

All user-facing copy must be Chinese.

Allowed copy examples:

- 外部 AI 解读（只读）
- 该内容仅用于解释站内结构化数据，不构成投资建议。
- 当前解读基于站内已有数据生成，未改变任何风险评分或决策规则。
- 数据可能滞后，请结合更新时间和置信度查看。

Forbidden copy / wording:

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
- 仓位
- 现金
- 敞口
- 执行灯
- 交易信号
- 操作建议
- 配置建议
- 立即行动
- 投资建议

## 8. Fields allowed for future display

Future frontend may display only:

- `summaryZh`.
- selected `facts`.
- selected `inferences`.
- selected `modelJudgments`.
- `dataGaps`.
- `invalidationSignals`.
- `confidence.level`.
- `confidence.score`.
- `confidence.reasonZh`.
- `generatedAt` / `updatedAt`.
- `freshness.artifactGeneratedAt`.
- `sourceAttribution` summary count or source layer names.

Do not display:

- raw provider output.
- raw provenance artifact paths by default.
- run IDs by default.
- artifact IDs by default.
- any `decisionContext` raw fields.
- quality review internal `failedDimensions` unless in debug mode.
- any execution / position / cash / exposure wording.

## 9. Required future frontend checks

Before frontend display implementation:

- `check:data` must pass.
- `check:external-ai-production-contract -- data/radar-data.json` must pass.
- `check:external-ai-production-write-guard` must be updated or scoped to allow display only in an explicit frontend PR.
- `check:copy` must pass.
- `check:dom` must pass.
- `check:modules` must pass.
- `check:all` must pass.
- Visual layout must not shrink Global Risk Heatmap.

## 10. Guard strategy for frontend PR

Future display PR must either:

- update `check-external-ai-production-write-guard` so it allows approved frontend display only when an explicit guard flag or contract state is present, or
- add a separate frontend display guard.

The guard must still fail if:

- `displayEnabled=true` but `boundaries.frontendDisplayApproved=false`.
- `boundaries.frontendDisplayApproved=true` but `boundaries.affectsScoring=true` or `boundaries.affectsDecisionModel=true`.
- external AI content affects execution / position guidance.
- unsafe trading / action wording appears in frontend copy.

## 11. Recommended next phase

Recommended next phase:

```text
v28.0L-3R External AI Frontend Display Scaffold - Hidden by Default
```

That next phase should:

- add frontend read logic.
- keep the panel hidden because `displayEnabled=false`.
- not change data.
- not call DeepSeek.
- not enable display.
- include fallback state.
- include copy checks.
- preserve heatmap layout.

Do not move directly to visible display.

## 12. Current decision

- Frontend display design: this PR.
- Frontend implementation: not yet.
- Visible display: NO-GO.
- Data write: already completed but display-disabled.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.

Recommended next step:

```text
v28.0L-3R External AI Frontend Display Scaffold - Hidden by Default
```

## 13. v28.0L-3R hidden scaffold status

v28.0L-3R implements the guarded frontend scaffold for reading `externalAiInterpretationLayer`, but it keeps the panel hidden in the current production state.

Status update:

- Hidden scaffold implemented.
- Hidden container `external-ai-display-panel` is hidden by default.
- Frontend read logic requires both `displayEnabled=true` and `boundaries.frontendDisplayApproved=true` before any visible render.
- Current production data keeps `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`, so no visible panel is rendered.
- No `data/radar-data.json` change is made.
- No DeepSeek call or workflow trigger is introduced.
- No scoring / decision / execution / position path is changed.
- Global Risk Heatmap layout remains unchanged.
- `check:external-ai-frontend-hidden-scaffold` guards the hidden scaffold.

Recommended next step:

```text
v28.0L-3S External AI Visible Display Approval + Data Flag Design - No Automatic Provider Call
```

## 14. v28.0L-3S visible display approval design status

v28.0L-3S adds [`EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md`](EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md) as the approval and data-flag design for a future visible display step.

Status update:

- Visible display approval and data flag design is documented.
- Display remains disabled in this PR.
- No frontend code is changed.
- No `data/radar-data.json` change is made.
- No DeepSeek call or workflow trigger is introduced.
- The future visible-display step should be data-only where possible.
- The future visible-display step should only flip `displayEnabled` and `boundaries.frontendDisplayApproved` after guard approval.

Recommended next step:

```text
v28.0L-3T External AI Visible Display Flag Enablement - Data Only / No Provider Call
```

## 15. v28.0L-3T visible display flag enablement status

v28.0L-3T enables the existing read-only panel through data flags.

Status update:

- Visible display is now enabled through `displayEnabled=true`.
- Visible display is now approved through `boundaries.frontendDisplayApproved=true`.
- Rendering remains read-only and gated by the existing scaffold.
- The panel remains outside Global Risk Heatmap.
- No frontend code is changed.
- No AI text content is changed.
- No scoring / decision / execution / position impact is introduced.
- No provider call, automatic provider call, or Daily integration is added.

Recommended next step:

```text
v28.0L-3T-1 Visible Display Audit Sync - No Provider Call
```

## 16. v28.0L-3T-1 visible display audit sync

v28.0L-3T-1 records the successful post-merge audit for visible display flag enablement.

Status update:

- The external AI panel is now eligible to render through the existing scaffold.
- Display remains read-only.
- The panel must not affect score / decision / execution / position logic.
- The panel remains outside Global Risk Heatmap.
- No AI text changed.
- No provider call was run.
- Future visual refinements require a separate PR.

Recommended next step:

```text
v28.0L-3U External AI Visible Display UX Polish - No Provider Call
```

## 17. v28.0L-3U visible display UX polish status

v28.0L-3U improves the visible read-only panel layout without changing the production data layer or provider output.

Status update:

- Visible panel UX polish is implemented.
- The panel now separates summary, main observations, AI inferences, uncertainty signals, confidence, and update time.
- The panel remains read-only and secondary.
- No `data/radar-data.json` change is made.
- No AI text content is refreshed or edited.
- No DeepSeek call or workflow trigger is introduced.
- No provider artifact is refreshed.
- No automatic provider call or Daily integration is added.
- No scoring / decision / execution / position path is changed.
- Global Risk Heatmap layout remains protected.

Recommended next step:

```text
v28.0L-3U-1 Visible Display UX Audit Sync - No Provider Call
```
