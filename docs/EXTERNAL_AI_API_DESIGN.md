# External AI API Design & Output Audit Plan

## 1. Purpose / 目的

本文档定义未来接入 DeepSeek / OpenAI / external AI API 之前必须先满足的设计边界、输出契约和审计要求。当前系统不调用任何外部 AI API；现有 `aiInterpretationLayer` 仍是 `rule_based_structured_interpretation`，只基于站内结构化数据生成规则化解释。

v28.0K-0 仅为设计文档阶段，不实现 API 代码，不写入 secrets，不修改 Worker、Daily workflow、前端、评分、决策、执行或仓位系统。

## 2. Current Baseline / 当前基线

当前稳定基线为：

- `aiInterpretationLayer.contractVersion = v28.0J-0`
- `mode = rule_based_structured_interpretation`
- `generatedByExternalAi=false`
- `usesExternalAiApi=false`
- no DeepSeek / OpenAI / external AI API calls
- no effect on scoring / `decisionModel` / `executionLock` / `positionGuidance`
- frontend is read-only display

## 3. Design Principles / 设计原则

未来外部 AI 只能解释站内已有结构化数据，不得替代数据源，不得发明市场数据。任何输出必须与站内数据交叉检查，并清楚区分 facts、data inferences、model judgments、scenario hypotheses、data gaps 与 invalidation signals。

外部 AI 不得改变 scoring、positions、execution lights 或 trading advice。外部 AI 不得生成煽动性、确定性危机语言，不得把结构性压力写成已确认事件，也不得输出战争概率或世界大战预测。

## 4. Proposed Future Architecture / 未来架构建议

未来如接入外部 AI，应新增独立字段：

```text
externalAiInterpretationLayer
```

该字段不得覆盖现有 `aiInterpretationLayer`。规则化解释层仍作为 baseline 与 fallback 保留。

示例结构：

```json
{
  "externalAiInterpretationLayer": {
    "contractVersion": "v28.0K-future",
    "generatedAt": "2026-05-07T00:00:00.000Z",
    "provider": "openai-or-deepseek-or-other",
    "model": "model-name",
    "mode": "external_ai_structured_commentary",
    "inputDigest": {
      "inputVersion": "daily-payload-version",
      "sourceStatus": "site-structured-data-only",
      "layersUsed": []
    },
    "output": {
      "facts": [],
      "inferences": [],
      "modelJudgments": [],
      "scenarioHypotheses": [],
      "dataGaps": [],
      "invalidationSignals": []
    },
    "audit": {
      "auditFlags": [],
      "sourceAttribution": [],
      "bannedCopyPassed": false
    },
    "fallback": {
      "used": false,
      "reason": null,
      "fallbackLayer": "aiInterpretationLayer"
    },
    "boundaries": {
      "displayOnly": true,
      "externalAiGenerated": true,
      "affectsScoring": false,
      "affectsDecisionModel": false,
      "affectsExecutionLock": false,
      "affectsPositionGuidance": false,
      "notInvestmentAdvice": true
    }
  }
}
```

## 5. Input Scope / 输入范围

Allowed future inputs:

- `dailyBrief`
- `divergenceLayer`
- `brentPricingLayer`
- `macroDrivers.consumer`
- `aiInterpretationLayer` rule-based baseline
- data health summary
- selected `decisionModel` summary as read-only context
- approved `worldOrder` summary only if already present in approved data payload

Forbidden inputs:

- secrets
- API keys
- raw credentials
- user private information
- unpublished local files
- full GitHub logs unless explicitly needed
- unapproved sources outside the data pipeline

## 6. Output Contract / 输出契约

未来外部 AI 输出必须包含：

- `facts`
- `inferences`
- `modelJudgments`
- `scenarioHypotheses`
- `dataGaps`
- `invalidationSignals`
- `confidence`
- `sourceAttribution`
- `auditFlags`

必须保留以下边界：

```json
{
  "displayOnly": true,
  "externalAiGenerated": true,
  "affectsScoring": false,
  "affectsDecisionModel": false,
  "affectsExecutionLock": false,
  "affectsPositionGuidance": false,
  "notInvestmentAdvice": true
}
```

## 7. Output Audit / 输出审计

未来输出发布前必须检查：

- banned copy
- inference written as fact
- claims of unavailable data sources
- scoring / decision overreach
- war probability or world war prediction
- deterministic trading advice
- unsourced market data
- conflict with site data
- missing data gaps

审计失败时，外部 AI 输出必须隐藏或降级为 fallback，不得为了展示完整而绕过审计。

## 8. Forbidden Copy / 禁用文案

以下短语不得出现在未来外部 AI 用户可见输出中：

- 危机已经爆发
- 必然崩盘
- 必然逼空
- 世界大战
- 战争概率
- 已经进入第三次世界大战
- 13步已走几步
- guaranteed
- certainty
- sure thing
- risk-free
- 真实 Dated Brent 已接入
- Platts Dated Brent 已接入
- 实物油价已经确认
- DeepSeek 已验证市场事实
- OpenAI 已验证市场事实
- 外部 AI 已确认危机

## 9. Failure / Timeout / Fallback

未来实现必须处理：

- API timeout
- API error
- rate limit
- invalid JSON
- unsafe output
- stale input
- missing source data
- fallback to rule-based `aiInterpretationLayer`

建议 UI fallback copy：

```text
外部 AI 暂不可用，当前显示规则化解释层
```

## 10. Source Attribution / 数据归因

外部 AI 不得声称使用独立来源，除非该来源已被记录在输入和审计 metadata 中。如果只使用站内数据，必须说明：

```text
基于站内结构化数据
```

新闻数据需要单独的 news/source ingestion contract。未来输出必须展示 `provider`、`model`、`generatedAt`、`inputVersion` 与 `sourceStatus`。

## 11. Promotion Ladder / 晋升路径

外部 AI 接入必须按以下路径推进：

- Level 0: Design document only
- Level 1: Offline prompt draft
- Level 2: Local/manual test with saved sample input
- Level 3: CI/audit-only output artifact
- Level 4: hidden production diagnostic
- Level 5: user-visible commentary
- Level 6: comparison with rule-based layer
- Level 7: limited display with source attribution

No direct scoring / decision integration. No direct execution / position impact.

## 12. Implementation Phases / 未来实施阶段

- v28.0K-0 Design only
- v28.0K-1 Prompt contract and sample input/output fixtures
- v28.0K-2 Output validator and banned-copy checker
- v28.0K-3 External AI disabled-by-default scaffold
- v28.0K-4 Manual-run API test, no production display
- v28.0K-5 Hidden diagnostic artifact
- v28.0K-6 User-visible external AI comparison layer

每个阶段必须独立 PR、可验证、可回滚，并在进入下一阶段前完成审计边界确认。

## 13. Non-goals / 非目标

v28.0K-0 does not:

- connect API
- write secrets
- modify Worker
- modify Daily workflow
- modify frontend
- modify scoring
- modify decision
- modify execution
- modify position
- display external AI output
