# External AI Prompt Contract and Sample Fixtures

## 1. Purpose / 目的

本文档定义未来 DeepSeek / OpenAI / external AI API 实验的 prompt contract 和样例 fixture 边界。当前 production system 仍不调用外部 AI API；当前 `aiInterpretationLayer` 仍是 rule-based structured interpretation。

v28.0K-1 只准备 offline/manual prompt design 所需的文档和非生产样例，不实现 API，不接入 provider SDK，不写 secrets，不改变生产展示、评分、决策、执行或仓位。

## 2. Current Boundary / 当前边界

- Current `aiInterpretationLayer` is `rule_based_structured_interpretation`.
- `generatedByExternalAi=false`.
- `usesExternalAiApi=false`.
- No DeepSeek / OpenAI / external AI API currently connected.
- This document is for future offline/manual prompt design only.
- No production display, no scoring, no decision, no execution, no position impact.

## 3. Prompt Role / 未来外部 AI 角色

External AI may only:

- explain site-owned structured data
- compare its interpretation with rule-based `aiInterpretationLayer`
- identify data gaps
- identify contradictions between site layers
- produce restrained commentary

External AI must not:

- invent market data
- replace primary data sources
- directly change scores or decisions
- provide trading instructions
- produce deterministic crisis claims
- claim external verification unless source metadata exists

## 4. Allowed Input Object / 允许输入对象

Future prompt input must use a constrained object shape:

```json
{
  "inputVersion": "v28.0K-1-sample",
  "generatedAt": "ISO string",
  "siteData": {
    "dailyBrief": {},
    "divergenceLayer": {},
    "brentPricingLayer": {},
    "macroDrivers": {
      "consumer": {}
    },
    "aiInterpretationLayer": {},
    "dataHealth": {},
    "decisionContext": {}
  },
  "boundaries": {
    "siteStructuredDataOnly": true,
    "noExternalMarketData": true,
    "noPrivateUserData": true,
    "noSecrets": true,
    "readOnlyContext": true
  }
}
```

## 5. Forbidden Input / 禁止输入

Future prompt input must not include:

- secrets
- API keys
- raw credentials
- user private data
- unpublished local files
- full GitHub logs unless explicitly required
- unapproved web/news data
- any source outside approved pipeline
- personal financial account details

## 6. System Prompt Requirements / 系统提示词要求

The future system prompt must tell the model:

- Use only provided structured input.
- Do not browse.
- Do not invent data.
- Separate facts, inferences, model judgments, scenario hypotheses, data gaps, invalidation signals.
- Use Chinese for user-facing text.
- Use restrained, professional language.
- Do not provide investment advice.
- Do not change scoring, decisions, execution, or position.
- Mark insufficient evidence clearly.

## 7. Output JSON Contract / 输出 JSON 契约

Required future external AI output:

```json
{
  "contractVersion": "v28.0K-1-sample",
  "generatedAt": "ISO string",
  "provider": "sample",
  "model": "sample-model",
  "mode": "external_ai_explanation_sample",
  "summaryZh": "string",
  "facts": [],
  "inferences": [],
  "modelJudgments": [],
  "scenarioHypotheses": [],
  "dataGaps": [],
  "invalidationSignals": [],
  "sourceAttribution": [],
  "auditFlags": [],
  "confidence": {
    "level": "low | medium | high",
    "score": 0,
    "reasonZh": "string"
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
```

## 8. Output Style Rules / 输出文案规则

Future user-facing output must use Chinese, restrained, professional language. It must avoid sensational language, deterministic market claims, war probability, world war prediction, "guaranteed", "risk-free", and any claim of Platts Dated Brent / real physical oil unless approved data exists.

If evidence is insufficient, use wording such as:

```text
数据不足
暂不足以判断
```

## 9. Banned Copy / 禁用文案

Future external AI output must not contain:

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

## 10. Audit Requirements / 审计要求

Output must be rejected or hidden if:

- banned copy appears
- inference is written as fact
- source attribution is missing
- AI claims unavailable data
- AI conflicts with site data without noting the conflict
- AI gives trading instructions
- AI changes or implies changes to scoring / decision / execution / position
- JSON is invalid
- confidence is missing
- boundaries are missing or false where required

## 11. Sample Fixtures / 样例 fixtures

Files under `docs/fixtures/external-ai/` are non-production examples only. They must not be imported by runtime, must not be treated as live data, and are only for future manual/offline prompt tests.

Current sample fixtures:

- [`sample-input-v28.0K-1.json`](fixtures/external-ai/sample-input-v28.0K-1.json)
- [`sample-output-v28.0K-1.json`](fixtures/external-ai/sample-output-v28.0K-1.json)
- [`sample-audit-result-v28.0K-1.json`](fixtures/external-ai/sample-audit-result-v28.0K-1.json)

## 12. Validation / 离线验证

Future sample outputs must pass:

```bash
npm run check:external-ai-output
```

The validator checks required contract fields, array fields, `confidence`, `boundaries`, `sourceAttribution`, banned copy, deterministic crisis language, trading overreach and direct scoring / decision / execution / position claims. It uses only local files and Node built-in modules; it does not call DeepSeek / OpenAI / external AI APIs and does not import fixtures into runtime.

To validate a saved future output artifact manually:

```bash
node scripts/check-external-ai-output.mjs path/to/output.json
```

Fixtures remain non-production documentation samples.

v28.0K-3B activation audit 后，live data 中的 disabled `externalAiInterpretationLayer` scaffold 不消费这些 fixtures。未来任何真正 external AI output 仍必须通过 `npm run check:external-ai-output`。

v28.0K-4A adds the manual API test design in [`EXTERNAL_AI_MANUAL_TEST_DESIGN.md`](EXTERNAL_AI_MANUAL_TEST_DESIGN.md). Future manual API outputs must still follow this prompt/output contract, use Chinese restrained user-facing text, and pass `check:external-ai-output`. Prompt fixtures remain offline-only and must not be treated as production data.

v28.0K-4B adds a dry-run readiness scaffold that reads the sample input fixture only as explicit local manual input. It does not produce provider output, does not replace `sample-output-v28.0K-1.json`, and does not create valid external AI commentary. Future real manual provider output must still pass `check:external-ai-output`.

## 13. Non-goals / 非目标

This stage does not:

- call API
- store secrets
- implement provider SDK
- modify frontend
- modify pipeline
- modify worker
- modify data contracts used by production
- display external AI output
- change scoring / decision / execution / position
