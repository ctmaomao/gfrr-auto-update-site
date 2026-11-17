# External AI Frontend Display Design - v28.0L-3Q

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

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

## Historical progress archive

The sections below summarize dated phase receipts, not current visibility or a task queue. All original numbered headings are retained for links. [Complete pre-compaction original](https://github.com/ctmaomao/gfrr-auto-update-site/blob/00963b925bc0e416c910fcd0bca3d149b1c42a8b/docs/EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md) (488 lines; SHA256 `bd7478ed9a221e76f15755a4b02d84bb6719f710753d19664508695c0cf1e771`) preserves exact wording, next-step proposals and evidence. Current retirement/authority remains the [shared status](LEGACY_DOCUMENT_STATUS.md#external-ai); no provider, display or data permission changes here.

## 13. v28.0L-3R hidden scaffold status

Implemented the hidden `external-ai-display-panel` scaffold, guarded by `check:external-ai-frontend-hidden-scaffold`. Both display flags remained false, so no panel rendered; no production data, provider/workflow or scoring/decision/execution/position change. Heatmap layout remained unchanged.

## 14. v28.0L-3S visible display approval design status

Documented [the visible-display approval and data-flag design](EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md). Display remained disabled; no frontend/data/provider/workflow change. The proposed next step was a separately guarded, preferably data-only two-flag enablement, not permission granted by this document.

## 15. v28.0L-3T visible display flag enablement status

Enabled `displayEnabled=true` and `boundaries.frontendDisplayApproved=true` through data flags only. Existing read-only scaffold and outside-Heatmap placement remained; frontend code and AI text were unchanged. No provider call, automatic call, Daily integration or scoring/decision/execution/position effect was introduced.

## 16. v28.0L-3T-1 visible display audit sync

Recorded successful post-merge flag-enable audit. The panel became eligible to render read-only outside Heatmap; AI text was unchanged and no provider call ran. Further visual refinement required a separate PR.

## 17. v28.0L-3U visible display UX polish status

Polished the panel into summary, main observations, AI inferences, uncertainty, confidence and update-time sections. It remained secondary/read-only; production layer, AI text, provider output/artifact, display flags and Heatmap were unchanged. No provider/workflow/automatic call, Daily integration or model-path change.

## 18. v28.0L-3U-1 visible display UX audit sync

Recorded the successful post-merge UX audit: the then-visible panel used safe dynamic rendering and hid raw provider output, run/artifact IDs and raw provenance. No AI text/provider/workflow/automatic-call/Daily/model/Heatmap change. Historical decision: `visible_display_ux_audited_no_provider_call`.

## 19. v28.0L-4A production refresh workflow status

Added the then-approved `External AI Production Refresh` workflow: manual `workflow_dispatch` and once-daily `23:50 UTC`, preserving visible flags and reading `externalAiInterpretationLayer`. It was the sole automatic provider path at that phase, with no frontend/Heatmap/model-path change. **That workflow and panel are now retired; this is not current call authorization.**

## 20. v28.0L-4A-1 production refresh workflow audit sync

Recorded successful run `25611392014`, data-only commit `c32af65` and artifact `external-ai-production-refresh-25611392014` / ID `6898516584` with 3-day retention. Contract, quality, write guard, scaffold and display gates still applied; no frontend/Heatmap/model change. The expired artifact is not promised downloadable.

## 21. v28.0L-4B display coverage polish

Expanded capped safe summaries to `modelJudgments`, `scenarioHypotheses`, `sourceAttribution` and public `qualityReview`. Raw output/provenance/IDs/internal diagnostics stayed hidden. No provider call, production-data/AI-text change, new automatic call, Daily integration or Heatmap/model change.

## 22. v28.0L-4B-1 display coverage audit sync

Recorded successful post-merge coverage audit: dynamic content used `textContent`; raw `decisionContext`, output, provenance and run/artifact IDs remained hidden. No text/provider/workflow/automatic-call/Daily/model/Heatmap change. Historical decision: `display_coverage_audited_no_provider_call`.

## 23. v28.0M-7V homepage reading path placement note

Kept `external-ai-display-panel` and its gates as auxiliary explanation outside the primary 10-step navigation. It could not replace Macro Overview or enter Heatmap, `#detail-data` or `#method-evidence`. Reading-path repair could not edit AI text, rerun providers, trigger production refresh or change scoring/decision/execution/position.

## 24. v28.0M-7V-1 homepage reading path audit-sync note

Recorded post-merge reading-path audit with that auxiliary placement and no AI-text/provider-output/gate/frontend/data/workflow/model change.
