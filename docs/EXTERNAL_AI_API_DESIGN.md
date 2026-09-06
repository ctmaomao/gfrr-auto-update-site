# External AI API Design & Output Audit Plan

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Purpose / 目的

本文档定义未来接入 DeepSeek / OpenAI / external AI API 之前必须先满足的设计边界、输出契约和审计要求。当前系统不调用任何外部 AI API；现有 `aiInterpretationLayer` 仍是 `rule_based_structured_interpretation`，只基于站内结构化数据生成规则化解释。

v28.0K-0 仅为设计文档阶段，不实现 API 代码，不写入 secrets，不修改 Worker、Daily workflow、前端、评分、决策、执行或仓位系统。

v28.0K-1 补充 future prompt contract 和非生产样例 fixtures，入口见 [`EXTERNAL_AI_PROMPT_CONTRACT.md`](EXTERNAL_AI_PROMPT_CONTRACT.md)。样例文件包括 [`sample-input-v28.0K-1.json`](fixtures/external-ai/sample-input-v28.0K-1.json)、[`sample-output-v28.0K-1.json`](fixtures/external-ai/sample-output-v28.0K-1.json) 和 [`sample-audit-result-v28.0K-1.json`](fixtures/external-ai/sample-audit-result-v28.0K-1.json)，仅用于未来 manual/offline prompt tests，不得被 production runtime 导入或当作 live data。

v28.0K-2 新增 offline external AI output validator and banned-copy checker：`npm run check:external-ai-output`。该 validator 只读取本地样例或显式传入的 output artifact，不调用 API，不接入 runtime，不读取 production data。未来任何 external AI output 进入展示前，都必须先通过该类 contract / boundary / source attribution / banned copy / overreach 检查。

v28.0K-3A 新增 disabled production scaffold：`externalAiInterpretationLayer`。该字段不是 external AI output，不调用 DeepSeek / OpenAI / external AI API，不读取 sample fixtures，也不进入 frontend display。未来真正 external AI output 仍必须经过 API design、prompt contract、output validator、fallback review、source attribution 和单独 display review。

v28.0K-3B activation audit 已确认 live data 包含 v28.0K-3A disabled scaffold。该 live scaffold 仍不是 API integration；未来 enabled external AI output 仍需要 output validator、fallback handling、source attribution、disabled-by-default release gate 和单独 frontend display review。

v28.0K-4A adds [`EXTERNAL_AI_MANUAL_TEST_DESIGN.md`](EXTERNAL_AI_MANUAL_TEST_DESIGN.md), a design-only plan for future disabled-by-default manual API tests. No API is connected in v28.0K-4A; production `externalAiInterpretationLayer` remains disabled, and future manual tests must be opt-in, isolated from production, and validator-gated.

v28.0K-4B adds a local dry-run scaffold command only. It does not enable DeepSeek / OpenAI, does not call any external API, does not read API keys or secrets, and does not affect production data or frontend display.

v28.0K-4C adds a disabled provider adapter skeleton only. It recognizes `none`, `deepseek`, and `openai` as future provider values, but does not connect DeepSeek / OpenAI, does not call external APIs, does not read API keys, and keeps production `externalAiInterpretationLayer` disabled.

v28.0K-4D introduces an explicit DeepSeek manual API test path only. It writes validator-gated manual artifacts outside production data and does not integrate with Daily, Worker, frontend display, scoring, decision, execution, or position systems. OpenAI remains disabled.

v28.0K-4G confirms that only manual artifact testing exists. There is no automated DeepSeek provider integration, no workflow provider call, no Daily provider call, no Worker provider call, and no frontend external AI display. The next production design must explicitly address scheduling, API key storage, retry/backoff, provider outage handling, cost control, validator gate, quality review gate, frontend display boundaries, rollback, and a disable switch before any integration PR is considered.

v28.0L-0 production integration design is now tracked in [`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md). That document supersedes informal production assumptions. It is still design-only and does not enable provider calls, workflow automation, production data writes, or frontend display.

v28.0L-1 readiness audit is tracked in [`EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md`](EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md). It says production API integration is not ready; the first implementation must be a disabled skeleton that does not call providers, read secrets, add workflows, write production data, or display frontend output. Future API calls must wait until a later reviewed phase.

v28.0L-2 adds a no-network / no-secret production provider path skeleton. `provider=none` remains the default, and no API call can occur in L-2.

v28.0L-3 designs a future manual `workflow_dispatch` provider test path. Any future workflow provider call must be artifact-only and manually triggered; no Daily/API production integration is allowed yet.

v28.0L-3B adds a manual `workflow_dispatch` dry-run skeleton only. It does not call any API, does not use or reference a provider secret, and does not create API integration. Provider-call workflow remains a later reviewed stage.

v28.0L-3C is tracked in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md). It identifies the future DeepSeek provider-call command, explicit operator gates, secret-injection boundary, validation, quality review, artifact, exit-code, and cost-control policy. No API path is active in L-3C, no workflow file is added or modified, and no provider call is run.

v28.0L-3D is tracked in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md). It is a documentation-only go/no-go checklist before provider-call implementation planning. Provider-call implementation, GitHub secret usage, production data writes, Daily integration, frontend display, and enabled `externalAiInterpretationLayer` remain not ready.

v28.0L-3E is tracked in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md). It is a documentation-only implementation plan for a future missing-secret-safe workflow skeleton. It does not add a workflow, secret, provider call, provider artifact, production data write, Daily integration, frontend display, or enabled `externalAiInterpretationLayer`.

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
- v28.0K-4 Manual-run design and disabled local scaffolds, no production display
- v28.0K-4C Disabled provider adapter skeleton, no API and no network
- v28.0K-4D DeepSeek manual artifact test, validator-gated and no production integration
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
