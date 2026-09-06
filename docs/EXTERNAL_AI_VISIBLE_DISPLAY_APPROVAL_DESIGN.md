# External AI Visible Display Approval + Data Flag Design - v28.0L-3S

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a documentation-only approval and data flag design.

- No data change.
- No frontend code change.
- No visible display.
- No provider call.
- No workflow trigger.
- No automatic provider call.
- No Daily integration.
- No scoring / decision / execution / position impact.
- This design does not approve visible display yet.

## 2. Current hidden state

Current production state:

- `data/radar-data.json` contains `externalAiInterpretationLayer`.
- The frontend hidden scaffold exists.
- The `external-ai-display-panel` container exists but is hidden.
- Visible rendering requires both `displayEnabled=true` and `boundaries.frontendDisplayApproved=true`.

Current production data has:

- `displayEnabled=false`.
- `boundaries.frontendDisplayApproved=false`.
- `qualityReview.promotionEligible=false`.
- `boundaries.affectsScoring=false`.
- `boundaries.affectsDecisionModel=false`.
- `boundaries.affectsExecutionLock=false`.
- `boundaries.affectsPositionGuidance=false`.

Therefore the external AI panel remains invisible.

## 3. Purpose of future visible display approval

The next visible-display step should only turn on the already-scaffolded read-only panel. It must not call DeepSeek, fetch new data, change provider output, or add automatic provider calls.

The future visible display approval is only a data-flag change plus guard updates.

It must remain:

- read-only.
- Chinese-only.
- display-only.
- not investment advice.
- not a trading signal.
- no scoring impact.
- no decision model impact.
- no execution lock impact.
- no position guidance impact.
- no Global Risk Heatmap layout impact.

## 4. Future data flag change design

Future target file:

```text
data/radar-data.json
```

Future target field:

```text
externalAiInterpretationLayer
```

Future flag changes:

- `externalAiInterpretationLayer.displayEnabled`: `false` -> `true`.
- `externalAiInterpretationLayer.boundaries.frontendDisplayApproved`: `false` -> `true`.

Everything else must remain unchanged:

- `qualityReview.promotionEligible=false`.
- `boundaries.affectsScoring=false`.
- `boundaries.affectsDecisionModel=false`.
- `boundaries.affectsExecutionLock=false`.
- `boundaries.affectsPositionGuidance=false`.
- `boundaries.notInvestmentAdvice=true`.
- `status=valid`.
- `sourceMode=manual_local_compact`.
- `inputSource=local_compact`.
- `sourceSemantics=site_structured_data_compact_summary`.

Future flag PR boundaries:

- Do not update the AI text content.
- Do not rerun DeepSeek.
- Do not refresh provider artifacts.
- Do not modify frontend code if the hidden scaffold is sufficient.
- The visible-display PR should be small and data-only where possible.

## 5. Future visible display gates

Before setting the flags to true, all must pass:

- `npm run check:external-ai-production-contract -- data/radar-data.json`.
- `npm run check:external-ai-production-write-guard` or an approved visible-display-specific guard.
- `npm run check:external-ai-frontend-hidden-scaffold`.
- `npm run check:dom`.
- `npm run check:modules`.
- `npm run check:copy`.
- `npm run check:data`.
- `npm run check:all`.

The future visible-display guard must confirm:

- `displayEnabled=true`.
- `boundaries.frontendDisplayApproved=true`.
- `qualityReview.promotionEligible=false`.
- `status=valid`.
- `freshness.isStale=false`.
- no unsafe trading / action wording.
- no scoring / decision / execution / position effect.
- Global Risk Heatmap layout remains unchanged.
- no automatic provider calls.
- no workflow change.

## 6. Guard strategy

The current production write guard is intentionally conservative. It may fail if `displayEnabled=true` or `boundaries.frontendDisplayApproved=true`.

Future visible-display implementation must update the guard narrowly.

Allowed only when:

- `schemaVersion=v28.0L-external-ai-production-1`.
- `status=valid`.
- `displayEnabled=true`.
- `boundaries.frontendDisplayApproved=true`.
- `boundaries.displayOnly=true`.
- `boundaries.notInvestmentAdvice=true`.
- `qualityReview.promotionEligible=false`.
- `qualityReview.status` is `pass` or `warn`.
- `freshness.isStale=false`.
- `boundaries.affectsScoring=false`.
- `boundaries.affectsDecisionModel=false`.
- `boundaries.affectsExecutionLock=false`.
- `boundaries.affectsPositionGuidance=false`.
- frontend hidden scaffold checks pass.
- no forbidden copy appears.

Still forbidden:

- `promotionEligible=true`.
- `boundaries.affectsScoring=true`.
- `boundaries.affectsDecisionModel=true`.
- `boundaries.affectsExecutionLock=true`.
- `boundaries.affectsPositionGuidance=true`.
- any provider call.
- any workflow schedule.
- any automatic provider call.
- any Global Risk Heatmap layout change.

## 7. Future user-facing copy constraints

All visible copy must remain Chinese.

Allowed:

- 外部 AI 解读（只读）
- 仅解释站内结构化数据，不构成投资建议。
- 不影响风险评分、决策模型或任何执行规则。
- 数据可能滞后，请结合更新时间和置信度查看。

Forbidden:

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

## 8. Future visual placement constraints

Future visible display must:

- not be inside Global Risk Heatmap.
- not reduce Global Risk Heatmap size.
- not be placed beside the six base risk modules if it reduces readability.
- remain secondary to existing dashboard structure.
- be clearly labeled read-only.
- not visually resemble an action signal or trading signal.
- be easy to collapse or ignore.

## 9. Rollback plan

If visible display causes any issue:

- revert the visible-display PR.
- set `displayEnabled=false`.
- set `boundaries.frontendDisplayApproved=false`.
- do not remove the production data layer unless contract validation fails.
- if unsafe copy appears, revert immediately.
- if Global Risk Heatmap layout is affected, revert immediately.

## 10. Current decision

Current decision:

- Visible display approval design: this PR.
- Data flag enablement: not yet.
- Visible display: NO-GO in this PR.
- Automatic provider calls: NO-GO.
- Daily integration: NO-GO.

Recommended next step:

```text
v28.0L-3T External AI Visible Display Flag Enablement - Data Only / No Provider Call
```

## 11. v28.0L-3T visible display flag enablement status

v28.0L-3T enables visible display through the approved data flags only.

Status update:

- `externalAiInterpretationLayer.displayEnabled=true`.
- `externalAiInterpretationLayer.boundaries.frontendDisplayApproved=true`.
- Data change is limited to the two display flags.
- Existing AI text content is unchanged.
- No provider call is run.
- No provider artifact is refreshed.
- No automatic provider call is added.
- No Daily integration is added.
- The existing frontend scaffold may now render the read-only panel.
- Safety gates remain active through the production contract validator, data validator, production write guard, and frontend display scaffold checker.

Recommended next step:

```text
v28.0L-3T-1 Visible Display Audit Sync - No Provider Call
```

## 12. v28.0L-3T-1 visible display audit sync

v28.0L-3T-1 records that the visible display flag enablement completed and passed post-merge audit.

Audit result:

- Visible display flag enablement completed.
- Post-merge audit passed.
- `externalAiInterpretationLayer.displayEnabled=true`.
- `externalAiInterpretationLayer.boundaries.frontendDisplayApproved=true`.
- `qualityReview.promotionEligible=false`.
- No AI text changed.
- No provider call was run.
- No workflow was triggered.
- No automatic provider call was added.
- No Daily integration was added.
- Global Risk Heatmap layout remains protected.
- Scoring / decision / execution / position logic remains unchanged.

Recommended next step:

```text
v28.0L-3U External AI Visible Display UX Polish - No Provider Call
```

## 13. v28.0L-3U-1 visible display UX audit sync

v28.0L-3U-1 records the post-merge audit for the visible display UX polish.

Audit note:

- Visible display data flags were already enabled in L-3T.
- L-3U polished the visible panel without changing data flags.
- L-3U did not change AI text content.
- Visible display remains approved only for the current production layer.
- No provider call, workflow trigger, automatic provider call, or Daily integration was introduced.
- Global Risk Heatmap layout remains protected.
