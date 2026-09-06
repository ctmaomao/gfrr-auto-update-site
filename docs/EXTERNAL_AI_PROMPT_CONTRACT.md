# External AI Prompt Contract and Sample Fixtures

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

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

v28.0K-4D adds a DeepSeek manual artifact path. Any saved manual output artifact must still follow this prompt/output contract, must use Chinese restrained user-facing text, must include source attribution, and must pass `npm run check:external-ai-output -- <artifact-path>` before any future display review. The artifact is not production data.

v28.0K-4D-2 tightens the manual DeepSeek output expectation. `auditFlags` must be neutral diagnostic tags only, not prose sentences and not investment / trading boundary text. Use boolean `boundaries` fields, including `boundaries.notInvestmentAdvice=true`, for safety boundaries. `sourceAttribution` must be an array of objects only; each item must include `sourceLayer`, `field`, `claimType`, and `noteZh`, and must map claims to the provided structured input rather than external web/news/market verification.

v28.0K-4D-3 aligns source attribution wording with the existing validator keyword rule. `sourceAttribution` must be an object array. Each item should include validator-recognized attribution wording in `noteZh`: for sample/manual fixture based outputs, include `样例结构化输入`; for future production site data outputs, include `站内结构化数据`. Do not use only `结构化输入`, because it may not satisfy attribution detection.

v28.0K-4E input artifacts may contain real site-structured data from `data/radar-data.json` or an allowlisted public site `radar-data.json` URL. They are still site-structured context only, not external market data, not private user data, and not secrets. They must remain manual-only artifacts under `manual-artifacts/`, must not be committed, and must not be treated as production data or frontend display data.

v28.0K-4E-1 compact input artifacts are still site-structured context only. Compaction must not add external market data, infer missing market facts, or include secrets/private data. Omitted fields should be documented in the artifact `compaction.omittedLargeFields` metadata so a reviewer can understand why historical arrays, chart arrays, raw diagnostics, or full action queues are absent.

v28.0K-4E-2 applies the unsafe wording guard globally across every returned string field, not only `auditFlags`. Manual external AI output must not use prose disclaimers containing `投资建议` or `交易建议`; boundary semantics belong only in boolean fields such as `boundaries.notInvestmentAdvice=true`, `boundaries.affectsScoring=false`, `boundaries.affectsDecisionModel=false`, `boundaries.affectsExecutionLock=false`, and `boundaries.affectsPositionGuidance=false`. `modelJudgments` must focus on evidence strength, data sufficiency, uncertainty, and watch / insufficient-data / low-confidence conditions, not trading, execution, portfolio action, or position language.

v28.0K-4E-3 distinguishes sample fixture input from live/local site-structured radar input. Live or local `radar-data.json` input must use source attribution wording such as `来自站内结构化数据` and `claimType=site_structured_data`; only sample fixture input may use `样例结构化输入` or `claimType=sample_input`. External AI output must not repeat concrete execution / position fields such as execution-light labels, exposure bands, cash targets, or position details; `decisionContext` is read-only system-state background only.

v28.0K-4F adds a separate offline quality review gate. An external AI artifact can pass the structural validator and still fail quality review if it confuses live data with sample input, repeats execution / position language, claims unsupported external verification, has weak attribution, lacks useful synthesis, or uses unreasonable confidence. The quality gate is intentionally stricter about execution / position language and live/sample semantics, and it never promotes output to production.

v28.0K-4G records the stable manual-test baseline. The prompt contract is stable enough for manual artifact testing only; both `check:external-ai-output` and `review:external-ai-artifact` are required before an artifact can even be considered for a later reviewed design PR. Output must avoid live/sample confusion, execution / position / exposure / cash-buffer language, unsupported external news or market verification claims, and overconfident conclusions. Source attribution must distinguish sample fixtures with `样例结构化输入` / `sample_input` from live or local site data with `站内结构化数据` / `site_structured_data`. Confidence should remain conservative unless a future reviewed metadata contract explicitly supports stronger evidence.

## 13. v28.0L-3H-2 Fixture Prompt Quality Contract

v28.0L-3H-2 strengthens the real provider-call prompt for the next `fixture_sample` run only. It does not call DeepSeek, trigger a workflow, read secrets, or promote any artifact.

The strengthened prompt must:

- keep output artifact-only and non-production.
- add incremental analytical value beyond restating input fields.
- clearly separate `facts`, `inferences`, `modelJudgments`, `scenarioHypotheses`, `dataGaps`, `invalidationSignals`, `sourceAttribution`, `auditFlags`, `confidence`, and `boundaries`.
- keep `decisionContext` as read-only background only.
- avoid repeating concrete execution, cash, exposure, position, target-band, or trade/action wording from `decisionContext`.
- use evidence sufficiency language in `modelJudgments`, not directional action language.
- frame `scenarioHypotheses` as watch conditions and invalidation logic, not predictions.
- make `dataGaps` specific enough for a reviewer to act on.
- attribute the main factual claims and inference/model-judgment claims to provided structured input layers.
- keep fixture confidence low or low-medium; do not use score `0` when structured input is usable, and do not overstate certainty.
- explain in `summaryZh` what the site-structured data suggests, what remains uncertain, and what would invalidate the interpretation.
- keep strict non-advice wording by avoiding investment/trading/action phrases in every string field.

For source semantics:

- `fixture_sample` output may include `sample_input_only` and `claimType=sample_input`.
- live/local site-structured output may include `site_structured_data_only` and `claimType=site_structured_data`.
- an output must not include both `sample_input_only` and `site_structured_data_only`.

The existing `sample-output-v28.0K-1.json` fixture remains a historical non-production fixture. L-3H-2 does not replace it with a fake DeepSeek success artifact. Local review diagnostics may be run against it, but a real second provider-call audit must still use `fixture_sample` only after this PR is merged and audited.

## 14. v28.0L-3I Local Compact Source Semantics

`fixture_sample` and future `local_compact` provider calls have different source semantics.

For `fixture_sample` output:

- `auditFlags` may include `sample_input_only`.
- `sourceAttribution.claimType` may use `sample_input`.
- `sourceAttribution.noteZh` may use `样例结构化输入`.

For future `local_compact` output:

- `sourceSemantics` should be `site_structured_data_compact_summary`.
- `auditFlags` must use `site_structured_data_only`.
- `auditFlags` must not include `sample_input_only`.
- output must never include both `sample_input_only` and `site_structured_data_only`.
- `sourceAttribution.claimType` must use `site_structured_data`.
- `sourceAttribution.noteZh` should include `站内结构化数据`.
- `sourceAttribution` must cite the provided site structured layers, such as `dailyBrief`, `divergenceLayer`, `brentPricingLayer`, `macroDrivers`, `dataHealth`, or `decisionContext`.
- confidence should normally remain low or low-medium, with score 20-40 if structured input is usable.
- confidence should not be 0 when the structured input is usable.
- output must not claim external web, news, or market verification.
- output must not repeat concrete execution, position, cash, exposure, target-band, or trade/action wording from `decisionContext`.

L-3J implements the `local_compact` workflow path but does not run the provider call. The first audited `local_compact` output must use `site_structured_data_only`, must not use `sample_input_only`, and must keep `decisionContext` as read-only background only.
- `decisionContext` remains read-only background only.

## 15. v28.0L-3J-3 Local Compact Execution-Language Prompt Fix

The first `local_compact` provider-call audit retry reached the provider and passed structural validation, but quality review correctly rejected the artifact for `executionLanguageSafety` because `$.facts[5]` repeated the decisionContext phrase `执行灯`.

L-3J-3 tightens prompt guidance before any retry:

- `decisionContext` remains read-only background only and must not be quoted into user-facing output fields.
- `facts` must avoid `decisionContext` operation fields and should prefer non-decisionContext layers such as `dailyBrief`, `divergenceLayer`, `brentPricingLayer`, `macroDrivers.consumer`, `dataHealth`, and `aiInterpretationLayer`.
- `summaryZh`, `facts`, `inferences`, `modelJudgments`, `scenarioHypotheses`, `invalidationSignals`, `sourceAttribution.noteZh`, and `auditFlags` must not repeat execution / operation / position / cash / exposure language from `decisionContext`.
- `sourceAttribution` may use `sourceLayer=decisionContext` only as neutral background; preferred `noteZh` is `只读系统状态背景，不作为解释层结论来源。`
- `执行灯` is explicitly forbidden in any model string output.
- Execution boundaries remain boolean-only through `boundaries.displayOnly=true`, `boundaries.affectsScoring=false`, `boundaries.affectsDecisionModel=false`, `boundaries.affectsExecutionLock=false`, `boundaries.affectsPositionGuidance=false`, and `boundaries.notInvestmentAdvice=true`.
- Do not weaken `executionLanguageSafety`, the offline validator, quality review, artifact sanitizer, or `promotionEligible=false` to make a provider artifact pass.

## 16. Non-goals / 非目标

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

## 17. v28.0L-3J-4 Local Compact Prompt Quality Audit

Run `25598887574` validated the L-3J-3 local compact execution-language prompt fix through a successful quality review.

Prompt contract status:

- `local_compact` output used site-structured data semantics.
- `decisionContext` remains read-only background.
- execution / operation / position / cash / exposure / trading terms remain forbidden in model string outputs.
- output validation passed.
- quality review passed.
- artifact sanitizer passed.
- `promotionEligible=false` remains required.

This audit does not change production prompt contracts, enable frontend display, or approve provider output promotion.

## 18. v28.0L-3K Production Readiness Prompt Boundary

v28.0L-3K reviews production integration readiness only. It does not approve a production prompt, production write, or frontend display path.

Future production data contract design must preserve these prompt boundaries:

- output remains display-only.
- `decisionContext` remains read-only background.
- execution / operation / position / cash / exposure / trading terms remain forbidden in model string outputs.
- source attribution must distinguish site-structured data from independent market verification.
- `promotionEligible=false` remains required unless a separate explicit approval changes the boundary.
- no prompt output may affect scoring / decision / execution / position logic.

## 19. v28.0L-3L Production Contract Prompt Constraints

v28.0L-3L carries the prompt safety rules into the future production data contract design.

Future production `externalAiInterpretationLayer` string fields must not include execution / operation / position / cash / exposure / trading wording. `decisionContext` remains read-only background, and raw `decisionContext` fields must not be surfaced as external AI prose.

The production contract design does not approve production prompt use, production write, frontend display, or `promotionEligible=true`.
