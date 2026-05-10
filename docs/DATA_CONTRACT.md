# Global Financial Risk Radar 数据契约说明

本文档定义 Global Financial Risk Radar 当前数据链路中的 canonical 字段、fallback 字段与验证/调试字段。后续升级应优先遵守这些契约，避免显示值、验证层、历史兼容字段被误用或误删。

## 总体数据链路

当前数据链路为：

```text
Build Realtime Market
→ realtime-data 分支
→ realtime/market.json

Build Daily Radar Data
→ 读取 realtime-data 的 realtime/market.json
→ 生成 data/radar-data.json
→ main 分支

前端
→ 读取 data/radar-data.json
→ 优先读取远端 realtime-data/realtime/market.json
→ buildRuntimeState
→ effectiveDisplayInputs
→ 页面渲染
```

Daily 构建必须先消费最新可用的 `realtime-data` payload，再生成 `data/radar-data.json`。前端运行时则以 `data/radar-data.json` 为基础，并在安全闸门通过后叠加远端 realtime payload。

## Canonical 当前显示值

当前值型显示应统一来自：

```text
data.__effectiveDisplayInputs
```

其来源优先级为：

```text
闸门判定可用时的 realtime.values → displayInputsBaseline → null
```

共享信任闸门 **`canUseRealtimePayloadValues`**（`scripts/modules/freshness.js`）统一约束：前端 **runtime overlay**、**`__effectiveDisplayInputs` 合成**、以及 **Daily pipeline 基于 realtime 的 baseline 重算** 仅在该函数返回 `true` 时允许消费 `realtime.values`。以下任一情况（及同类不可信状态）必须回退到 `displayInputsBaseline` / 基线模式，而不得用该 payload 驱动 overlay 或 Daily 主路径重算：

```text
缺少或无效的 values
cache-only（cacheOnly 或 sourceMode）
unavailable
healthScore <= 0
criticalMissing >= 4
degradedMode 且 sourceMode 不是 live-with-fallback（live-with-fallback 仍可作为可接受的降级实时模式）
```

`shouldApplyRealtimeOverlay` 与上述闸门对齐，并仍受元数据层 `realtimeUnavailable` 约束。`brentValidation.consensus.recommendedValue` 仅为验证层推荐值，不是主 Brent，也不得替代上述闸门。

页面文案、面板、触发器中凡是表达“当前值”的内容，都应基于 `effectiveDisplayInputs` 重建。

### effectiveDisplayInputs 运行时合成说明

`data/radar-data.json` 不序列化根级 `effectiveDisplayInputs`，也不要求存在根级 `values` 对象。

Daily pipeline 负责写入稳定基线字段，例如：

- `dailyRealtimeInput`
- `displayInputsBaseline`

浏览器前端在运行时读取 `data/radar-data.json` 后，再按 runtime source priority 选择 realtime overlay。v28.0C-3 起，runtime policy 由前端配置 `scripts/modules/config.js` 的 `realtimeSourcePolicy.workerFirstEnabled` 控制。

当 `workerFirstEnabled === true` 时，运行时优先级为：

```text
Worker generated preview
→ GitHub realtime-data
→ local fallback
```

当 `workerFirstEnabled === false` 时，Worker 不得成为 selected realtime payload，运行时优先级为：

```text
GitHub realtime-data
→ local fallback
```

Worker payload 必须在 `workerFirstEnabled === true` 且通过 strict gate 后，才能成为 selected realtime overlay：HTTP 200、`workerGeneratedPreview.enabled === true`、`unavailable !== true`、`sourceMode === "worker-generated-preview"`、`healthScore >= 85`、`criticalMissing <= 1`、`updatedAt` 不超过 10 分钟，且 `values.brent / dxy / vix / hyOas / us10y / real10y` 均为 finite number。未通过 gate 的 Worker candidate，以及 `workerFirstEnabled === false` 时的 Worker candidate，不得进入 `effectiveDisplayInputs`。

前端根据 `displayInputsBaseline` 与选中的 realtime payload 合成最终显示输入，并挂载为：

`data.__effectiveDisplayInputs`

因此，页面显示层应以运行时的 `data.__effectiveDisplayInputs` 作为有效显示输入，而不是要求 `radar-data.json` 预先序列化 `effectiveDisplayInputs`。

`realtimeSourcePolicy` 是前端运行时配置与 metadata，不序列化进 `data/radar-data.json`。`data.__effectiveDisplayInputs` 只能由 selected realtime payload 与 `displayInputsBaseline` 合成；未被 selected 的 Worker candidate 不得进入 `data.__effectiveDisplayInputs`。

### Realtime-data soft health observer

v28.0G-2 起，`Check Realtime Health` 只观察 GitHub `realtime-data/realtime/market.json` 作为 fallback / Daily baseline input 的 freshness。它保留 `freshness`、`result`、`shouldRecover` 与 `suggestedAction` 输出，但 workflow 不再因 `stale` / `unavailable` hard fail。

Worker-first runtime 的 hard health gate 是 `Check Worker Health`，不是 `Check Realtime Health`。当 `realtime-data` stale 但 Worker Health ok 时，页面主链路仍可视为健康；当 Worker Health unhealthy 时，才应优先排查 Worker runtime。G-2 不改变 Worker payload、前端 runtime priority、Daily 输入、`values.*`、scoring 或 decision。

v28.0G-3 只清理两个 health workflow 的 stdout / GitHub Summary 文案。`Check Worker Health` Summary 明确标记为 Worker-first hard gate；`Check Realtime Health` Summary 明确标记为 fallback / Daily baseline soft observer。G-3 不改变 fail 边界，不改变 workflow 触发规则，不改变 Worker payload、前端 runtime、data/realtime 产物或任何数据源。

### Data check expected skip

v28.0G-10 Data Check Expected-Skip Noise Cleanup 只调整 `scripts/validate-data.mjs` 的 local realtime / `dailyRealtimeInput` mismatch 提示方式，不改变数据契约强度，不修改 `data/*.json` / `realtime/*.json`，不改 Worker runtime、不改前端、不 deploy。Worker-first runtime 已是主链路；仓库里的 `realtime/market.json` 是 fallback / Daily baseline 相关文件，可能不是 `data/radar-data.json` 中 `dailyRealtimeInput.updatedAt` 的同一次快照。

默认 `npm run check:data` 遇到这种不同快照时会安静执行 expected skip，继续保留并运行其它 contract checks。`validateRealtimeBaselineAlignment`、`validateDisplayInputsBaseline` 和 `validateDailyRealtimeInput` 仍保留；如果两个 `updatedAt` 相同，live realtime / `displayInputsBaseline` alignment 仍按原逻辑逐字段检查。

需要排查 skip reason 时运行：

```bash
npm run check:data:verbose
```

需要把本地 live alignment mismatch 视为失败时运行：

```bash
npm run check:data:strict-live-alignment
```

### World Order Stress 数据产物

`v28.0H-1` 新增 `data/world-order-stress.json`，作为 World Order Stress Overlay 的独立数据产物。该产物用于结构性风险识别和市场交叉验证，不预测战争，不输出战争概率，不直接修改 `decisionModel`、仓位或 action queue。

关键 contract：

- `score` 与各维度 `score` 必须为 `0-100`。
- `confidence` 必须为 `0-1`。
- `freshness` 只能为 `fresh` / `stale` / `partial` / `error`。
- `state` 只能为 `normal_globalization` / `friction_rising` / `bloc_fragmentation` / `multi_theater_stress` / `war_economy_stress`。
- `externalSources` 必须包含 `gdelt` / `ofac` / `sipri` / `acled`。
- `marketConfirmationInput` 必须记录市场确认使用的输入源、时间和关键市场值。
- `dimensions` 必须包含和平红利退潮、阵营化与联盟硬化、多战区冲突、经济金融武器化、资本管制与金融抑制风险和市场确认。
- `decisionModifier` 只用于解释未来潜在状态修正，不在 H-1 接入现有决策状态机。
- `warnings` 必须包含“该模块用于结构性风险识别，不构成战争预测或投资建议。”

构建与检查：

```bash
npm run build:world-order
npm run check:world-order
```

`data/world-order-stress.json` 由 `check:world-order` 校验，并已纳入 `check:all`。默认完整检查只验证现有 JSON，不运行 `build:world-order`，因此不会自动访问外部数据源或重写该数据产物。

H-2 前端独立 UI 只读消费 `data/world-order-stress.json`，用于展示状态、压力分数、市场确认、六维度、数据源状态和免责声明。该 UI 不直接调用 GDELT、OFAC、SIPRI、ACLED 或其它外部 API，不接入 `decisionModel`，不改变仓位、Action Queue 或任何 realtime / baseline 计算。

H-5 UI 可以根据 `externalSources`、`confidence` 与 `marketConfirmationInput` 派生 confidence explanation 和 data quality badge。这些都是展示层派生，不改变 JSON contract，不改变 scoring，也不把任何新外部源接入生产数据链路。

H-5A 的 UI source / trend / direction labels 也是 presentation-only derivations，不改变 JSON contract，不改变 `externalSources`、`marketConfirmationInput` 或 World Order scoring。

H-4 的 build summary / check summary / review helper 只改变 stdout 可读性，不改变 JSON contract。`check:world-order` 已纳入 `check:all`，但 `build:world-order` 仍需显式运行，不得加入默认完整检查。

### dailyBrief 解释层 contract

`v28.0I-1` 在 `data/radar-data.json` 根级新增：

```text
dailyBrief
```

`dailyBrief` 是解释层 / display-only 字段，用于未来首页“今日总判断层”。它只压缩已有 daily baseline、realtime input、macro drivers、模块分数和数据健康信息，不参与 scoring，不参与 `decisionModel`，不参与 `executionLock`，不参与 `positionGuidance`，不改变 `effectiveDisplayInputs`。

字段 contract：

- `contractVersion` 必须为 `v28.0I-1`。
- `generatedAt` 必须为可解析 ISO 字符串。
- `macroState`、`oneLineConclusion` 必须为中文字符串。
- `dominantRiskChain` 必须包含 `key`、`labelZh`、`stageZh`、`summaryZh`、`evidence`。
- `largestDivergence` 必须包含 `key`、`labelZh`、`statusZh`、`summaryZh`、`evidence`。
- `keyTriggers`、`invalidationSignals`、`dataGaps` 必须为数组。
- `confidence.level` 只能为 `low` / `medium` / `high`，`confidence.score` 必须为 `0-100`。
- `boundaries.displayOnly` 必须为 `true`。
- `boundaries.affectsScoring`、`affectsDecisionModel`、`affectsExecutionLock`、`affectsPositionGuidance` 必须为 `false`。

v28.0I-2 前端展示只读消费 `dailyBrief`。前端不得在 render 层反推评分、仓位、执行灯、Action Queue 或任何 decision contract；当 `dailyBrief` 缺失时只显示温和 fallback。证据不足时应显示“数据不足”或“暂不足以判断”，不得为了显示漂亮伪造数据。

### divergenceLayer 背离解释层 contract

`v28.0I-3A` 在 `data/radar-data.json` 根级新增：

```text
divergenceLayer
```

`divergenceLayer` 是“实体压力与金融定价背离”的解释层 / audit-only / display-only 字段。它只读取现有 Daily pipeline 与 realtime 输入中的公开 proxy、验证层、模块分数和数据健康信息，用于未来前端展示前的数据契约准备。

严格边界：

- 不参与 scoring。
- 不参与 `decisionModel`。
- 不参与 `executionLock`。
- 不参与 `positionGuidance`。
- 不改变 `effectiveDisplayInputs`。
- 不改变 Brent promotion。
- 不改变 Worker-first runtime priority。
- 不改变 Action Queue、Trigger Monitor 或 Invalidation Rules。

字段 contract：

- `contractVersion` 必须为 `v28.0I-3A`。
- `generatedAt` 必须为可解析 ISO 字符串。
- `score` 必须为 `0-100` finite number。
- `state` 只能为 `normal` / `watch` / `stress` / `high_stress` / `insufficient_data`。
- `primaryDivergence` 必须包含 `key`、`labelZh`、`status`、`statusZh`、`summaryZh`、`evidence`。
- `checks` 必须为数组；每项必须包含 `key`、`labelZh`、`category`、`status`、`score`、`summaryZh`、`evidence`、`dataUsed`、`limitations`。
- `category` 只能为 `energy_pricing` / `rates_assets` / `liquidity_credit` / `risk_complacency` / `consumer_assets`。
- `confidence.level` 只能为 `low` / `medium` / `high`，第一版一般不应为 `high`。
- `boundaries.displayOnly`、`boundaries.auditOnly` 必须为 `true`。
- `boundaries.affectsScoring`、`affectsDecisionModel`、`affectsExecutionLock`、`affectsPositionGuidance` 必须为 `false`。

Brent 相关观察只能说明公开 Brent proxy / validation 层状态，不等同于 Platts Dated Brent，不代表真实 Dated Brent 已接入，也不能证明真实实物现货溢价。不得把 FRED Brent、Yahoo `BZ=F`、Trading Economics Brent 混同为同一个价格，不得把 `brentValidation.consensus.recommendedValue` 直接当作 Brent 主值。

v28.0I-3B 前端展示只读消费 `divergenceLayer`。v28.0I-8 起默认以 compact summary 展示，检查明细和数据缺口放入折叠区。前端不得在 render 层反推评分、仓位、执行灯、Action Queue 或任何 decision contract；当 `divergenceLayer` 缺失时只显示温和 fallback。证据不足时必须显示“数据不足”或“暂不足以判断”，不得伪造不存在的数据。

#### macroDrivers.consumer

`v28.0I-4A` 在 `macroDrivers` 中新增：

```text
macroDrivers.consumer
```

该字段使用 FRED `UMCSENT`（University of Michigan: Consumer Sentiment）作为月频慢变量，只在 Daily pipeline 中抓取，用于消费者体感与风险资产定价背离的 audit-only 观察。

字段 contract：

- `umichSentiment`、`previousValue`、`threeMonthChange`、`sixMonthChange` 为 finite number 或 `null`。
- `sourceStatus.umichSentiment` 只能为 `live` / `fallback` / `missing`。
- `updatedAt` 为可解析 ISO 字符串或 `null`。
- `source` 必须为 `FRED:UMCSENT`。
- `notes` 必须为数组，并说明 UMCSENT 是月频慢变量。

严格边界：

- 不进入 Worker。
- 不进入 realtime overlay。
- 不进入 Worker required fields。
- 不参与 scoring。
- 不参与 `decisionModel`。
- 不参与 `executionLock` 或 `positionGuidance`。
- 只用于 `divergenceLayer.checks[]` 中 `consumer_vs_asset_pricing` 的解释层 / 审计层观察。

`consumer_vs_asset_pricing` 的 `category` 为 `consumer_assets`。该 check 只能说明消费者信心与 S&P 500、VIX、HY OAS 之间是否存在观察性错配；不得写成实时交易信号，不得声称消费崩盘已确认，也不得改变任何仓位或交易建议。

### brentPricingLayer 公开代理价格层 contract

`v28.0I-5A` 在 `data/radar-data.json` 根级新增：

```text
brentPricingLayer
```

`brentPricingLayer` 是 Brent 公开代理价格层，用于把当前主 Brent 显示值、公开 Brent 现货代理、公开 Brent 期货代理、Brent validation / confirmation sources 与公开代理价差分开记录。它是 audit-only / display-only 字段。

严格边界：

- 不等同于 Platts Dated Brent。
- 不等同于正式实物成交价。
- 不代表付费 Dated Brent 数据已接入。
- 不改变 `values.brent`。
- 不改变 Brent promotion。
- 不参与 scoring。
- 不参与 `decisionModel`。
- 不参与 `executionLock` 或 `positionGuidance`。
- 不改变 Action Queue、Trigger Monitor 或 Invalidation Rules。

字段 contract：

- `contractVersion` 必须为 `v28.0I-5A`。
- `mode` 必须为 `public_proxy_observation`。
- `selectedBrent`、`publicSpotProxy`、`futuresProxy` 必须记录 `source`、`value`、`observedAt`、`status` 与中文说明。
- `confirmationSources` 必须为数组；每项记录 `source`、`labelZh`、`value`、`observedAt`、`status`、`role`、`participatesInPromotion`、`noteZh`。
- `proxySpread.status` 只能为 `normal` / `watch` / `stress` / `insufficient_data`。
- `confidence.level` 只能为 `low` / `medium` / `high`。
- `boundaries.displayOnly`、`boundaries.auditOnly` 必须为 `true`。
- `boundaries.affectsValuesBrent`、`affectsBrentPromotion`、`affectsScoring`、`affectsDecisionModel`、`affectsExecutionLock`、`affectsPositionGuidance` 必须为 `false`。

`publicSpotProxy.limitationZh` 必须说明该字段只是公开 Brent 现货代理观察，不等同于 Platts Dated Brent 或正式实物现货成交价。`futuresProxy.limitationZh` 必须说明该字段是公开期货 / 市场报价代理，仅用于验证层观察。

v28.0I-5C 前端展示只读消费 `brentPricingLayer`。v28.0I-8 起默认以 compact summary 展示，Brent 主值审计、验证源明细和数据限制放入折叠区。前端不得在 render 层反推 Brent 主值、Brent promotion、评分、仓位、执行灯或交易建议；当 `brentPricingLayer` 缺失时只显示温和 fallback。

### aiInterpretationLayer 规则化结构解释层 contract

`v28.0J-0` 在 `data/radar-data.json` 根级新增：

```text
aiInterpretationLayer
```

`aiInterpretationLayer` 是规则化结构解释层，用于把现有 Daily 数据中的事实、数据推断、模型判断、情景假设、数据缺口和反证条件分开记录。该层不调用外部 AI，不接 DeepSeek / OpenAI，不新增外部网络请求。

严格边界：

- 只读取当前 Daily pipeline 已有结构。
- 不读取 `data/world-order-stress.json`。
- 不参与 scoring。
- 不参与 `decisionModel`。
- 不参与 `executionLock`。
- 不参与 `positionGuidance`。
- 不改变 Action Queue、Trigger Monitor 或 Invalidation Rules。
- 不改变 Brent promotion、Worker-first runtime priority、`values.*` 或 `effectiveDisplayInputs`。

字段 contract：

- `contractVersion` 必须为 `v28.0J-0`。
- `mode` 必须为 `rule_based_structured_interpretation`。
- `facts` 只记录已有数据明确支持的事实，不写预测。
- `dataInferences` 只记录从已有数据可合理推断的观察性内容，必须使用克制措辞。
- `modelJudgments` 只记录模型层判断，`modelSource` 只能为 `dailyBrief` / `divergenceLayer` / `brentPricingLayer` / `macroDrivers` / `decisionModel` / `combined`。
- `scenarioHypotheses` 只能写条件句，每项必须包含 `triggerConditions` 与 `invalidationConditions`。
- `dataGaps`、`invalidationSignals` 必须为数组。
- `evidenceLinks.layer` 只能引用 `dailyBrief` / `divergenceLayer` / `brentPricingLayer` / `macroDrivers.consumer` / `worldOrder` / `decisionModel`。
- `confidence.level` 只能为 `low` / `medium` / `high`，`confidence.score` 必须为 `0-100`。
- `boundaries.displayOnly`、`boundaries.interpretationOnly` 必须为 `true`。
- `boundaries.generatedByExternalAi`、`usesExternalAiApi`、`affectsScoring`、`affectsDecisionModel`、`affectsExecutionLock`、`affectsPositionGuidance` 必须为 `false`。

v28.0J-2 前端只读消费 `aiInterpretationLayer`。首页在“今日主判断”下方显示 compact summary，并把 facts、dataInferences、modelJudgments、scenarioHypotheses、dataGaps、invalidationSignals 与 evidenceLinks 放入默认折叠 details。前端不得在 render 层重算、生成解释、调用外部 AI、改写数据对象或把 AI 文案接入评分 / 决策 / 执行 / 仓位；当 `aiInterpretationLayer` 缺失时只能显示温和 fallback。

#### v28.0J stable boundary summary

v28.0J-2B post-deploy audit 已通过，当前 live data 已包含 `aiInterpretationLayer.contractVersion = v28.0J-0`，当前前端版本为 `28.0L-4B`。

稳定边界：

- `aiInterpretationLayer` 是 display-only / interpretation-only。
- `generatedByExternalAi=false`。
- `usesExternalAiApi=false`。
- 当前不调用 DeepSeek / OpenAI / 外部 AI API。
- 不参与 scoring / `decisionModel` / `executionLock` / `positionGuidance`。
- 不改变 `values.*`、`effectiveDisplayInputs`、Brent promotion、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 前端只能只读消费 `aiInterpretationLayer`，不得在 render 层生成、重算或补写解释。
- 未来如接入外部 AI，必须使用单独字段或明确 source metadata，不得覆盖现有 rule-based layer。

#### future externalAiInterpretationLayer contract note

`externalAiInterpretationLayer` 是 future-only contract candidate，当前数据产物不得要求或生成该字段。未来如接入 DeepSeek / OpenAI / external AI API，必须先遵守 [`EXTERNAL_AI_API_DESIGN.md`](EXTERNAL_AI_API_DESIGN.md)。

边界：

- 不得覆盖现有 `aiInterpretationLayer`。
- 必须是 display-only / commentary-only。
- 必须包含 `provider` / `model` / `source` / `audit` / `fallback` metadata。
- 必须包含 source attribution 与 output audit flags。
- 不得影响 scoring / decision / execution / position。
- 不得影响 `values.*`、`effectiveDisplayInputs`、Brent promotion、Action Queue、Trigger Monitor 或 Invalidation Rules。

`docs/fixtures/external-ai/*.json` 是 v28.0K-1 prompt contract 的非生产样例，不属于 production data contract，不得被 runtime 消费，也不得作为 `data/*.json`、`realtime/*.json` 或 Worker payload 的替代输入。External AI production contract 仍为 future-only。

`scripts/check-external-ai-output.mjs` / `npm run check:external-ai-output` 只验证 sample 或 future external AI output artifacts；它不验证 production `data/radar-data.json`，不改变 `aiInterpretationLayer`，也不把 external AI 字段加入当前 production contract。

v28.0K-4A does not change the production data contract. The live `externalAiInterpretationLayer` remains the disabled scaffold, and any future manual API test output must not overwrite live `data/radar-data.json` or the production scaffold field.

v28.0L-3C provider-call workflow design does not change the production data contract. Future provider-call workflow artifacts, if implemented later, remain manual diagnostics and are not production data. They must not overwrite `data/radar-data.json`, `data/*.json`, `realtime/*.json`, config files, or the production disabled `externalAiInterpretationLayer` scaffold.

#### externalAiInterpretationLayer disabled scaffold contract

v28.0K-3A 在 Daily radar data 根级新增 future-only disabled scaffold；v28.0K-3B activation audit 通过后，该字段已进入 live data baseline：

```text
externalAiInterpretationLayer
```

该字段不是外部 AI 输出，也不代表 DeepSeek / OpenAI / external AI API 已接入。它只记录外部 AI 当前 disabled，并明确 fallback 到现有 rule-based `aiInterpretationLayer`。本地旧数据如果缺少该字段，`check:data` 可能 warning；pull latest `main` 或等待 Daily workflow 重新生成后即可对齐。

当前 contract：

- `contractVersion` 必须为 `v28.0K-3A`。
- `enabled=false`，`status="disabled"`。
- `provider="none"`，`model=null`。
- `mode="external_ai_disabled_scaffold"`。
- `output=null`。
- `externalAiGenerated=false`，`usesExternalAiApi=false`。
- `fallback.used=true`，`fallback.fallbackLayer="aiInterpretationLayer"`。
- `boundaries.displayOnly=true`，`boundaries.diagnosticOnly=true`。
- `boundaries.externalAiGenerated=false`，`boundaries.usesExternalAiApi=false`。
- `boundaries.affectsScoring=false`，`boundaries.affectsDecisionModel=false`，`boundaries.affectsExecutionLock=false`，`boundaries.affectsPositionGuidance=false`。
- `boundaries.notInvestmentAdvice=true`。

该字段是 diagnostic scaffold only，当前不得用户可见，不得被视为 enabled external AI，不得替换 `aiInterpretationLayer`，不得进入 scoring / decision / execution / position，也不得读取 `docs/fixtures/external-ai/*.json`。

#### v28.0K-4G manual artifact boundary

`externalAiInterpretationLayer` in production data remains the disabled scaffold. Manual DeepSeek output artifacts, manual input artifacts, provider failure artifacts, and quality review artifacts under `manual-artifacts/` are not part of the production data contract.

Manual artifacts must not be copied into `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, or frontend display paths. A future production external AI data contract requires a separate reviewed version with explicit audit, validator, quality-review, fallback, disable-switch, and source-attribution boundaries.

#### v28.0L-0 production integration design note

[`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md) designs a future production `externalAiInterpretationLayer` contract, but it is not implemented. The current production data contract remains the v28.0K-3A disabled scaffold: `enabled=false`, `status="disabled"`, `provider="none"`, and `output=null`.

v28.0L-1 readiness audit does not change the production data contract. [`EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md`](EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md) confirms production external AI data writes are not ready, and `externalAiInterpretationLayer` remains the disabled scaffold.

v28.0L-2 disabled skeleton state is not written to `data/radar-data.json`. The production `externalAiInterpretationLayer` remains the existing disabled scaffold from Daily output, and future wiring requires a separate reviewed PR.

v28.0L-3 workflow artifact outputs are not production data. Future workflow artifacts must not be copied to `data/radar-data.json`, and the production data contract remains the disabled scaffold.

v28.0L-3B dry-run workflow artifacts are also not production data. `workflow-dry-run-report.json` and any compact input artifact uploaded by the dry-run workflow must not be copied into `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, or frontend display paths. Production `externalAiInterpretationLayer` remains the existing disabled scaffold.

v28.0L-3D provider-call workflow readiness checklist does not change the production data contract. It adds only a no-code readiness gate; no provider-call workflow, GitHub secret, provider artifact, production data write, frontend display, Daily integration, or enabled `externalAiInterpretationLayer` is added. Future provider-call workflow artifacts, if implemented later, remain non-production diagnostics and must not be copied into `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, or frontend display paths.

v28.0L-3E provider-call workflow implementation plan also does not change the production data contract. It plans a future missing-secret-safe workflow skeleton only; no workflow artifact from L-3E exists, no provider output is generated, and production `externalAiInterpretationLayer` remains the disabled scaffold.

v28.0L-3F provider-test workflow artifacts are not production data. `workflow-dry-run-report.json`, `provider-test-gate-status.json`, `provider-test-missing-secret.json`, `provider-test-secret-present-blocked.json`, and any compact input artifact uploaded by the provider-test workflow must not be copied into `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, or frontend display paths. No provider output enters `data/radar-data.json`, and production `externalAiInterpretationLayer` remains the existing disabled scaffold.

v28.0L-3F-1 provider workflow audit artifacts remain diagnostics only. Run `25591115649` default dry-run PASS and run `25591202053` missing-secret safe failure do not create production data and do not approve any artifact promotion. `provider-test-missing-secret.json` and any workflow diagnostics must not be copied to `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, config files, or frontend display paths.

v28.0L-3G secret decision does not change the production data contract. Any first real provider-call artifact from a later approved workflow remains non-production diagnostics and must not be copied into `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, config files, or frontend display paths.

### v28.0I contract boundary summary

v28.0I release review 与 v28.0I-8B post-deploy audit 已通过。当前 live data 已包含 `dailyBrief.contractVersion = v28.0I-1`、`divergenceLayer.contractVersion = v28.0I-3A`、`macroDrivers.consumer`、`consumer_vs_asset_pricing` 与 `brentPricingLayer.contractVersion = v28.0I-5A`。

边界总结：

- `dailyBrief`、`divergenceLayer` 与 `brentPricingLayer` 都是解释层 / 审计层 / 展示层字段。
- `macroDrivers.consumer` 是 Daily 月频慢变量，仅用于消费者体感与风险资产定价背离观察。
- `consumer_vs_asset_pricing` 只是 `divergenceLayer.checks[]` 中的背离 check。
- 这些字段不得反向影响 `values.*`、`effectiveDisplayInputs`、Brent promotion、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 前端只能只读消费这些结构，不能在 render 层反推分数、生成主判断、改写数据对象或伪造缺失结论。

#### marketConfirmationInput

v28.0H-2B 起，`data/world-order-stress.json` 必须包含：

```text
marketConfirmationInput
```

`source` 枚举：

```text
worker-generated-preview
local-realtime
daily-baseline
unavailable
```

输入优先级为 Worker-generated preview → local realtime fallback → Daily baseline。Worker 输入必须通过安全 gate 后才能使用；否则构建不会失败，而是记录 `fallbackReason` 并继续 fallback。

字段 contract：

- `updatedAt` 为可解析 ISO 字符串或 `null`。
- `ageMinutes`、`healthScore`、`criticalMissing` 为 finite number 或 `null`。
- `brent`、`gold`、`vix`、`dxy`、`hyOas`、`us10y`、`real10y`、`spx` 为 finite number 或 `null`。
- `brentSource`、`brentPromotionReason`、`fallbackReason` 为字符串或 `null`。
- `brentPromotionApplied` 为 boolean。
- 当 `source="worker-generated-preview"` 时，`updatedAt`、`healthScore`、`criticalMissing` 必须有效，且 `brent` 必须为正数。

#### GDELT summary

v28.0H-2C 起，`externalSources.gdelt.summary` 必须明确记录 query throttle / partial success / stale cache fallback 状态。

字段 contract：

- `totalArticles`、`conflictEvents`、`sanctionsEvents`、`blockadeOrChokepointEvents`、`successCount`、`failureCount`、`rateLimitedCount` 必须为 finite number。
- `regionsCovered`、`topThemes`、`errors` 必须为数组。
- `queriesRun` 必须为数组，每项至少包含 `label`、`status`、`articleCount`、`error`。
- `queriesRun[].status` 只能为 `ok` / `partial` / `error` / `rate_limited` / `skipped`。
- `usedCachedSummary` 必须为 boolean。
- `cacheReason` 必须为字符串或 `null`。
- 当 `externalSources.gdelt.status="partial"` 时，`successCount >= 1`。
- 当 `externalSources.gdelt.status="stale"` 时，`usedCachedSummary=true` 且 `cacheReason` 非空。
- 当 `externalSources.gdelt.status="error"` 时，`successCount=0`。

#### SIPRI normalized input

v28.0H-3 起，SIPRI 支持手动标准化导入。真实输入路径为：

```text
config/world-order-sipri-normalized.json
```

模板路径为：

```text
config/world-order-sipri-normalized.example.json
```

模板必须包含 `exampleOnly=true` 与 `notForScoring=true`，不得参与评分。真实输入必须满足：

- `source="sipri-milex-manual-normalized"`。
- `updatedYear` 为 finite number。
- `preparedAt` 为可解析 ISO 字符串。
- `quality.isRealData=true`。
- `quality.confidence` 为 `0-1`。
- `global`、`majorPowers`、`regions`、`quality` 均存在。
- `trend` 枚举只能为 `rising` / `stable` / `falling` / `unknown`。
- 所有数值字段必须为 finite number 或 `null`。

`externalSources.sipri.summary` contract：

- 必须包含 `updatedYear`、`globalMilitarySpendTrend`、`majorPowerMilitarySpendTrend`、`militarySpendShareOfGDPTrend`、`sourceFreshness`、`noteZh`。
- 当 `status="ok"` 时，`updatedYear`、`confidence`、`majorPowersTracked`、`regionsTracked` 必须有效。
- 当 `status="manual_required"` 时，`noteZh` 必须说明“手动导入”或“尚未导入”。
- example/template 数据不得以 `ok` 状态进入 `data/world-order-stress.json`。

### Frontend asset cache version

v28.0L-4B Frontend Asset Cache Busting 只定义前端静态资源版本契约，不改变数据契约、Worker runtime、Brent promotion、sourceProbe、secondary diagnostics、KV 或 `data/*.json` / `realtime/*.json`。触发原因是 Android Chrome cached old module graph：普通窗口缓存旧 `scripts/app.js` / ES module graph 后，仍可能显示 Actions/FRED 旧逻辑；无痕窗口正常则证明线上 Worker-first runtime 正常。

当前前端资源版本为：

```text
28.0L-4B
```

要求：

- `index.html` 入口 module script 必须指向 `app.js?v=28.0L-4B`。
- `scripts/app.js` 与 `scripts/modules/*.js` 的本地相对 `.js` import 必须使用 `?v=28.0L-4B`。
- `scripts/app.js` 必须暴露 `window.__GFRR_FRONTEND_VERSION__`，浏览器 Console 中应返回 `"28.0L-4B"`。
- frontend asset cache version must be bumped when index.html or frontend JS changes：以后修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js` 时，必须同步 bump version 并替换所有本地 module import query。
- 只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json` 或只 deploy Worker 不需要 bump。

v28.0G-9B Frontend Asset Version Bump Helper 新增本地维护工具：

```bash
node scripts/bump-frontend-asset-version.mjs 28.0G-10
npm run bump:frontend-asset-version -- 28.0G-10
```

该工具用于以后前端 HTML / JS 改动时统一 bump cache version。当前正式版本仍是 `28.0L-4B`；它只更新前端 asset version、contract 和相关文档，不访问网络、不写 KV、不写 `data/*.json` / `realtime/*.json`、不 deploy Worker。Worker runtime 改动不需要 bump frontend asset version，除非同时改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js`。

### Worker generated runtime 状态

浏览器前端会读取 Cloudflare Worker generated preview endpoint，并把 Worker 状态挂载为：

`data.__workerGeneratedCandidate`

该字段只存在于浏览器运行时：

- 不序列化进 `data/radar-data.json`。
- 只有 `realtimeSourcePolicy.workerFirstEnabled === true`、通过 strict gate 并成为 selected realtime source 时，Worker payload 才能参与 realtime overlay 与 `data.__effectiveDisplayInputs`。
- `workerFirstEnabled === false`、未通过 gate 或未被 selected 的 Worker candidate 不参与 `data.__effectiveDisplayInputs`，不改变 canonical display values。
- 不参与 scoring 或 decision 公式。
- selected source 与 rollback 配置记录在 runtime metadata 的 `realtimeSource` / `realtimeSourcePriority` / `realtimeSourcePolicy` 中，均不序列化进 `radar-data.json`。

### Worker secondary source diagnostics isolation

v28.0D-2-lite 起，核心指标第二源诊断不得进入主 Worker preview payload。主 realtime endpoint：

```text
/market.worker-preview.json
```

必须保持只承载 Worker generated preview 主链路，不得包含 `secondarySources` / `secondaryDiagnostics`，也不得执行第二源外部请求。

第二源诊断只能通过独立 endpoint 暴露：

```text
/market.secondary-preview.json
```

该 endpoint 只读独立 KV key：

```text
market:secondary-preview
```

该结构只存在于 Worker secondary preview runtime payload：

- 不序列化进 `data/radar-data.json`。
- 不影响 `data.__effectiveDisplayInputs`。
- 不影响 selected source gate 或 Worker-first / GitHub / local fallback 优先级。
- 不影响 `healthScore` / `criticalMissing`，除非未来版本明确把某个来源升级为 validation。
- 不覆盖 `values.dxy` / `values.vix` / `values.hyOas` / `values.gold` / `values.us10y` / `values.brent`。
- 所有 candidate 必须声明 `participatesInPrimary: false` 与 `participatesInValidation: false`。
- DXY 与 HY OAS 的备用来源属于 proxy / experimental diagnostic，不得直接视为 canonical 等价源。
- 独立 secondary preview 不存在时，`/market.secondary-preview.json` 返回小型 unavailable payload；这不代表主 `/market.worker-preview.json` 异常。

v28.0D-3 的独立 secondary preview 只接入 VIX via Cboe；v28.0E-1 在同一独立 endpoint 中新增 Gold via Yahoo `GC=F` 后台诊断；v28.0E-2 继续在同一独立 endpoint 中新增 DXY via Yahoo `DX-Y.NYB` 后台诊断；v28.0E-3 新增 US10Y via Yahoo `^TNX` 后台诊断；v28.0E-4 新增 SPX via Yahoo `^GSPC` 后台诊断：

```text
diagnostics.sources.vix
diagnostics.sources.gold
diagnostics.sources.dxy
diagnostics.sources.us10y
diagnostics.sources.spx
```

这些字段只用于观察第二诊断源可达性与最新可解析值。当前 secondary diagnostics 包含：

- VIX via Cboe：`diagnostics.sources.vix`
- Gold via Yahoo `GC=F`：`diagnostics.sources.gold`
- DXY via Yahoo `DX-Y.NYB`：`diagnostics.sources.dxy`
- US10Y via Yahoo `^TNX`：`diagnostics.sources.us10y`
- SPX via Yahoo `^GSPC`：`diagnostics.sources.spx`

上述 5 个字段构成当前 core secondary set：`vix` / `gold` / `dxy` / `us10y` / `spx`。它们使用独立 KV key `market:secondary-preview`，按 30 分钟低频刷新，只写 `/market.secondary-preview.json`，不写 `market:worker-generated-preview`。单个 source failed / unavailable 只应成为 health warning，不应触发主链路失败；只有 core secondary set 全部缺失时，Worker health check 才应把 secondary payload 视为不健康。

Gold、DXY、US10Y 与 SPX secondary 只写入 `/market.secondary-preview.json` 的独立 KV payload，不得覆盖或参与主 `/market.worker-preview.json` 的 `values.gold` / `values.dxy` / `values.us10y` / `values.spx`，不得进入 `data.__effectiveDisplayInputs`，不得参与 scoring / decision，也不得影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。VIX、Gold、DXY、US10Y 与 SPX secondary 均必须声明 `participatesInPrimary: false` 与 `participatesInValidation: false`。

v28.0E-3A 起，US10Y via Yahoo `^TNX` 必须保留 `rawValue`、归一化后的 diagnostic `value`、`normalization` 与 `normalizationReason`。Yahoo `^TNX` 可能返回两种形态：

- `rawValue > 20`：视为 yield-times-10，`value = rawValue / 10`，`normalization = "divide-by-10"`，`normalizationReason = "raw-yahoo-tnx-appears-times-10"`。
- `rawValue <= 20`：视为已经是 percent yield，`value = rawValue`，`normalization = "no-op"`，`normalizationReason = "raw-yahoo-tnx-already-percent"`。

如果没有可用 Yahoo `^TNX` 值，US10Y secondary 应保留结构并输出 `value: null`、`rawValue: null`、`normalization: "unknown"`、`normalizationReason: "no-valid-yahoo-tnx-value"`。不得把 `rawValue` 直接接入主 `values.us10y`，也不得把 US10Y secondary 升级为 validation source；后续若要升级必须另开版本。

Gold / DXY / US10Y / SPX secondary 失败只应记录在各自 `diagnostics.sources.*` 字段，SPX 失败不得阻止 VIX / Gold / DXY / US10Y secondary 写入，也不得阻止主 Worker preview 写入。只有 VIX、Gold、DXY、US10Y 与 SPX 全部失败时，secondary preview 才可标记 `sourceMode: "secondary-preview-unavailable"` / `unavailable: true`。如果后续 Gold via Yahoo `GC=F`、DXY via Yahoo `DX-Y.NYB`、US10Y via Yahoo `^TNX` 或 SPX via Yahoo `^GSPC` 连续稳定，必须另开版本讨论是否作为主值验证层；v28.0E-1 / v28.0E-2 / v28.0E-3 / v28.0E-4 不做升级。

前端当前不消费 `/market.secondary-preview.json`；该 payload 不得进入 Worker-first strict gate、`__effectiveDisplayInputs`、scoring 或 decision。

E-4 后应暂停继续堆新 secondary source，先观察 Worker health workflow、secondary freshness 与各 source failure pattern。HY OAS、real10y、credit spread proxy、liquidity proxy 和其它 macro stress indicators 都是 future candidates；后续新增必须一轮一个、另开版本，并继承 short timeout、try/catch、isolated payload 与 health warning-only 原则。任何 source 从 secondary diagnostic 升级为 validation 或 primary 都必须另开版本，并有稳定性观察依据。

### Worker fetch timeout guard

v28.0E-0 起，Worker 主 preview 对外部 HTTP source 使用统一短超时保护。该 guard 只限制慢响应对 Worker runtime 的影响，不新增数据源，不改变 `values.*` 选择逻辑，不改变 Brent promotion、D-6 moveStatus 或 D-8B sourceProbe 决策逻辑。

timeout 结果应作为普通 source diagnostics 返回，例如进入 `sourceDetails`、`workerGeneratedPreview.diagnostics.sourceHttpSummary`、`brentValidation.diagnostics` 或 `brentValidation.sourceProbe.probes[*]` 的 `error` / `reason` 字段。`fetchTextWithDiagnostics` 不应因 timeout 直接 throw 到主 preview 生成流程；critical source timeout 仍应按原有 finite value / `criticalMissing` / `healthScore` / `unavailable` 规则自然反映，不得通过 timeout guard 放松健康门槛。

secondary diagnostics（VIX via Cboe、Gold via Yahoo `GC=F`、DXY via Yahoo `DX-Y.NYB`、US10Y via Yahoo `^TNX`、SPX via Yahoo `^GSPC`）仍只属于 `/market.secondary-preview.json`，使用独立短超时和失败隔离。secondary timeout 不得影响 `/market.worker-preview.json`，也不得影响 `values.gold` / `values.dxy` / `values.us10y` / `values.spx`、Brent promotion、scoring 或 decision。未来新增其它 secondary source 时，必须继承短超时、try/catch 捕获和独立 KV 隔离原则。

### Worker-first health check

v28.0F-2 起，仓库提供只读脚本：

```bash
node scripts/check-worker-health.mjs
```

该脚本只读取 `/market.worker-preview.json` 与 `/market.secondary-preview.json`，用于检查 Worker-first 主 payload 健康、secondary diagnostics 隔离、Brent promotion / sourceProbe 可读性，以及 VIX / Gold / DXY / US10Y / SPX secondary 的 diagnostic-only flags。它不写 KV，不写 `data/*.json` / `realtime/*.json`，不改变 payload contract，也不参与页面 runtime 选择。

`Check Worker Health` workflow 使用 `--fail-on-unhealthy`：主 preview 不健康或 secondary endpoint 不可读会失败；VIX / Gold / DXY / US10Y / SPX 单个 diagnostic source failed / unavailable 只作为 warning。该检查不改变 `values.*`、scoring、decision、Daily 输入或前端 fallback 逻辑。

Contract boundary: `Check Worker Health` is the Worker-first runtime hard gate, while `Check Realtime Health` is the fallback / Daily baseline soft observer. A stale fallback payload does not imply Worker-first runtime failure when Worker Health is ok.

v28.0G-1 起，`check-worker-health` 对 core secondary set 的 `observedAt` 派生 freshness / age audit，输出 `freshnessStatus`、`observedAgeHours` 与 `freshnessReason`。这些字段不是 Worker payload contract，不写入 `/market.secondary-preview.json`，只存在于 health check stdout / GitHub Summary。`parseObservedAt` 支持 ISO 时间和 Cboe `MM/DD/YYYY` 日期。`freshnessStatus` 可为 `fresh`、`market-closed-stale-ok`、`stale-warning`、`stale-critical`、`missing-observedAt`、`unparsable-observedAt` 或 `not-applicable`。

secondary stale 不等于错误；市场关闭、交易时段和节假日可能让 US10Y / SPX / VIX 等 `observedAt` 停留在上一交易日。G-1 初版中 `stale-warning` / `stale-critical` / missing / unparsable 只让 health check overall 进入 warning，不直接 fail workflow。若未来要让 `stale-critical` fail，必须另开版本。

Operational fields such as `promotionApplied`, `promotionReason`, `moveStatus`, and TE confirm `freshnessStatus` / `freshnessReason` explain why Brent promotion did or did not apply. They are audit / decision fields, not render-layer inputs. Secondary diagnostics must not create secondary pollution in main preview: `secondarySources`, `secondaryDiagnostics`, and `secondarySourceSummary` belong outside `/market.worker-preview.json`. Cloudflare KV usage is not a payload contract, but it is an operational constraint; KV write guard deferred and tracked through the Operations Runbook rather than encoded as a data field.

v28.0G-7A adds a Check Worker Health snapshot artifact named `worker-health-snapshot`. The JSON snapshot is an audit export of the health summary only: it may include Worker Health, Brent / Trading Economics freshness, sourceProbe, secondary freshness, and reasons. It is not a website runtime input, not a `data/*.json` or `realtime/*.json` product, and not a payload contract for `/market.worker-preview.json` or `/market.secondary-preview.json`. The snapshot does not change `Check Worker Health` hard gate semantics or `Check Realtime Health` soft observer semantics.

v28.0G-7B adds `scripts/review-worker-health-snapshot.mjs` and `review:worker-health-snapshot`, a local read-only helper for downloaded G-7A artifacts. It reports PASS / WARN / FAIL from the snapshot fields and does not access network, write KV, write `data/*.json` / `realtime/*.json`, or change runtime behavior. The review output is an operational convenience, not a data contract and not a replacement for the scheduled hard gate.

## displayInputsBaseline 契约

`data/radar-data.json` 根层必须包含：

```json
"displayInputsBaseline": {
  "brent": "number|null",
  "dxy": "number|null",
  "vix": "number|null",
  "hyOas": "number|null",
  "us10y": "number|null",
  "real10y": "number|null",
  "breakeven10y": "number|null",
  "gold": "number|null",
  "spx": "number|null"
}
```

`displayInputsBaseline` 是 baseline fallback 的结构化当前值来源，不是中文文案，也不是从旧文案反解析出来的结果。不允许通过解析旧中文文案恢复这些值。Daily 构建必须先读取最新 `realtime-data`，再基于该 realtime payload 生成 `displayInputsBaseline`。

## dailyRealtimeInput 契约

`data/radar-data.json` 根层应包含：

```json
"dailyRealtimeInput": {
  "branch": "realtime-data",
  "commitSha": "string|null",
  "updatedAt": "ISO string",
  "sourceMode": "live|degraded|cache-only|fallback",
  "healthScore": "number|null",
  "capturedAt": "ISO string"
}
```

`dailyRealtimeInput` 用于记录 Daily 构建实际消费了哪一次 realtime payload，便于排查 Daily 与 Realtime 的先后顺序问题。它不参与评分，不参与决策，也不参与页面主显示。本地运行时如果没有 GitHub Actions 注入的 commit SHA，`commitSha` 可以为 `null`。

### Daily vs Worker input audit

v28.0F-1 起，仓库提供只读脚本：

```bash
node scripts/audit-daily-vs-worker.mjs
```

该脚本比较本地 `realtime/market.json`（Daily workflow 从 `origin/realtime-data` 写入的实际输入）与当前 Cloudflare Worker `/market.worker-preview.json`。输出只用于 GitHub Actions Summary / 人工审计，不序列化进 `data/radar-data.json`，不改变 `dailyRealtimeInput`，不改变 Daily 主路径输入，不改变前端 Worker-first runtime 选择。

`drift.materialDriftFields` 表示观察到的字段差异，不代表错误，也不会默认阻塞 Daily。Worker 可能比 Daily 消费的 `realtime-data` 更新；是否把 Daily 输入切到 Worker 必须另开 F-2 / F-3 版本讨论。

## GitHub Actions Summary 运行审计入口

GitHub Actions Summary 是 Daily / Realtime 运行时审计入口，用于人工排查输入、baseline 与决策输出是否一致。Summary 不参与计算，不改变 JSON，也不是页面数据源。

`Build Realtime Market` Summary 用于查看：

- `updatedAt`
- `sourceMode`
- `healthScore`
- `values.brent`
- `brentValidation.consensus.recommendedValue`
- `brentValidation.consensus.confidence`
- `brentValidation.consensus.canPromoteToPrimary`

其中 `values.brent` 是当前 Brent 主显示值来源之一；`brentValidation.consensus.recommendedValue` 只是验证层推荐值，不等于主值。`canPromoteToPrimary=false` 时不得切主值。

`Build Daily Radar Data` Summary 用于查看：

- `dailyRealtimeInput.commitSha`
- `dailyRealtimeInput.updatedAt`
- `dailyRealtimeInput.sourceMode`
- `dailyRealtimeInput.healthScore`
- `displayInputsBaseline.brent`
- `displayInputsBaseline.dxy`
- `displayInputsBaseline.vix`
- `displayInputsBaseline.hyOas`
- `displayInputsBaseline.spx`
- `Decision Summary`
- `Daily vs Worker Input Audit`

其中 `dailyRealtimeInput` 用于判断 Daily 实际消费了哪一次 realtime payload；`displayInputsBaseline` 是 Daily 生成的 baseline fallback 当前值；`Decision Summary` 用于快速查看策略状态、执行锁、仓位建议、动作数量和阈值数量。

如果页面值、`realtime-data` 分支和 `main` 分支数据暂时不一致，优先检查：

1. Realtime Summary 的 `updatedAt` / `sourceMode` / `healthScore`
2. Daily Summary 的 `dailyRealtimeInput.commitSha` / `dailyRealtimeInput.updatedAt`
3. Daily Summary 的 `displayInputsBaseline`
4. Decision Summary 的 strategy / execution lock

如果 Realtime 在 Daily 之后又运行一次，`origin/realtime-data` 可能比 `origin/main:data/radar-data.json` 更新，这是正常的；应通过 `dailyRealtimeInput.commitSha` 判断 Daily 当时消费的是哪一次 realtime payload。

## Runtime Debug / Realtime Fetch Audit 契约

`realtimeFetchAudit` 是前端运行时调试字段，用于判断页面当前 realtime payload 的来源。它用于排查页面是否读取了远端 `realtime-data`、是否使用本地 fallback、是否完全没有可用 realtime，以及页面 stale / aging / unavailable 是由 workflow 未更新还是前端 fetch / fallback 问题导致。

浏览器调试路径为：

```js
window.__GFRR_RUNTIME__?.realtimeFetchAudit
window.__GFRR_RUNTIME__?.runtimeMetadata?.realtimeFetchAudit
```

常见字段包括：

- `attemptedAt`
- `remoteUrl`
- `cacheBusted`
- `selectedSource`
- `remoteUpdatedAt`
- `remoteSourceMode`
- `remoteHealthScore`
- `fallbackReason`

`selectedSource` 含义：

- `remote`：页面成功读取远端 `realtime-data` payload
- `local-fallback`：远端读取失败后使用本地 fallback payload
- `none`：远端和本地 fallback 都不可用，页面只能走 baseline / degraded

排查规则：

- 如果 `selectedSource=remote`、`cacheBusted=true`，但 `remoteUpdatedAt` 很旧，说明前端已经绕过缓存并成功读取远端，优先检查 `Build Realtime Market` workflow。
- 如果 `selectedSource=local-fallback`，说明远端读取失败或不可用，页面使用本地 fallback，需检查远端 raw URL、网络和 fallback 闸门。
- 如果 `selectedSource=none`，说明远端和本地 fallback 都不可用，页面只能使用 baseline，需检查 realtime payload 生成和前端读取路径。

`realtimeFetchAudit` 只用于调试，不参与评分，不参与决策，不改变页面主值，不改变 `values.brent`，不改变 `effectiveDisplayInputs`，不改变 fallback 安全闸门，也不是页面数据源。

## Realtime Freshness / 实时数据新鲜度契约

前端运行时会基于 realtime payload 的时间戳计算：

- `runtimeMetadata.realtimeAgeMinutes`
- `runtimeMetadata.realtimeFreshnessLevel`
- `runtimeMetadata.realtimeUnavailable`
- `runtimeMetadata.realtimeOverlayEnabled`

当前 freshness 分档为：

```text
0–30 分钟：fresh / 新鲜
31–90 分钟：aging / 老化
91–360 分钟：stale / 已过期
>360 分钟或 realtime 不可用：unavailable / 不可用
```

状态含义：

- `fresh / 新鲜`：近期成功读取 realtime，可正常用于 overlay。
- `aging / 老化`：realtime 仍可参考，但页面应提示用户谨慎。
- `stale / 已过期`：realtime 超出安全时效，页面应明确标识数据已过期。
- `unavailable / 不可用`：远端和可用 fallback 均不可用，页面应回退到 baseline / degraded 状态。

freshness 状态用于数据健康状态和显示安全判断。页面当前值仍必须遵守 `effectiveDisplayInputs` 契约：优先使用可用 realtime values，其次使用 `displayInputsBaseline`，最后为 `null`。当 realtime payload 处于 `cache-only`、`healthScore <= 0`、`criticalMissing >= 4` 等不安全状态时，不应覆盖 baseline。

渲染层不得绕过 `effectiveDisplayInputs` 直接使用 raw realtime values 展示当前值。UI 文案可以解释 freshness 状态，但不能反向修改数据契约、fallback 闸门或当前值选择规则。

freshness 与 `realtimeFetchAudit` 的职责不同：

- freshness 说明“当前 payload 有多旧”。
- `realtimeFetchAudit` 说明“页面这次到底读到了哪里”。
- 如果 `selectedSource=remote` 且 `cacheBusted=true`，但 `remoteUpdatedAt` 很旧，优先检查 `Build Realtime Market` workflow。
- 如果 `selectedSource=local-fallback` 或 `selectedSource=none`，优先检查远端 raw URL、网络读取和 fallback 闸门。

freshness 不直接改变评分权重，不直接改变 Brent 主值，不直接改变决策状态机。评分、Brent 主值和决策输出仍以各自的数据契约和 pipeline / decision 层产物为准。

## Decision Output / 决策输出契约

`decisionModel` 是决策层的结构化输出，用于承载策略状态、仓位建议、动作队列和一句话决策结论等信息。常见字段包括 `strategyState`、`riskMode`、`positionGuidance`、`actionQueue`、`decisionStatement`。具体字段以当前 `radar-data.json` 真实产物为准，不得凭空新增字段要求。

`tradingSystem` 是执行层与规则层输出，用于承载执行锁、信号引擎、动作层和风控规则。核心子结构包括 `executionLock`、`signalEngine`、`actionLayer`、`riskControl`。

`executionLock` 是当前是否允许新增风险、是否进入防守或减仓状态的核心执行门控。页面执行灯应以它或其派生结果为主要依据；不应在渲染层重新推导执行灯。文案可以重建，但执行含义不能在前端随意覆盖。

`positionGuidance` 是仓位建议结构，用于承载目标仓位区间、现金缓冲、风险预算等信息。当前常见字段包括 `totalExposureBand`、`targetGrossExposure`、`cashBufferTarget`、`riskBudget`。

`actionLayer` 是今日执行、检查点和控制动作的结构化来源。`checkpoints` 用于“今日执行检查点”；`controlActions` 或等价字段用于控制动作。此类动作不应散落写死到页面。

`riskControl` 是硬触发和重置条件的结构化来源，常见字段包括 `hardThresholds` 和 `resetThresholds`。这些规则阈值属于规则型文案，不应被当前值重建逻辑误替换；ON RRP 中文显示单位仍应遵守“亿美元”契约。

`decisionLine` 可作为当前页面的一句话决策输出或 fallback。`decisionStatement` 如存在，应包含 `headline`、`posture`、`actionBias`、`condition` 等结构化字段。Daily Summary 可从这些字段或 fallback 字段读取摘要；这些字段是解释输出，不应反向影响评分或状态机。

决策输出是 pipeline / decision 层产物，不应由 render 层重新推导。渲染层可以格式化和展示，但不能改变策略状态、执行锁或仓位建议。`validate-data.mjs` 已对关键决策结构做保守校验；Daily workflow 的 `Decision Summary` 只是审计展示，不参与计算。后续拆 `decision.js` 时，必须保持上述结构兼容。

## Brent 主值与验证层契约

页面主 Brent 当前仍来自：

```text
values.brent
```

而不是：

```text
brentValidation.consensus.recommendedValue
```

`brentValidation` 是验证层 / 观察层。`recommendedValue` 不等于主值，不得被无条件写入 `values.brent`。v28.0D-5 起，只有 `brentValidation.promotion.applied === true` 时，才允许按 freshness-gated promotion 规则切换 Brent 主值。

当 weak-confirmation 参与时，`canPromoteToPrimary` 必须为 `false`。当 `confidence = none` 时，`recommendedValue` 和 `recommendedSource` 必须为 `null`。

### Brent source audit

v28.0D-4 起，Worker generated preview 可在 `brentValidation.audit` 中附带小型 Brent source selection audit：

```text
brentValidation.audit
```

该字段用于解释 `values.brent` 的最终来源、验证层推荐值，以及 freshness-gated promotion 是否触发：

- `selectedSource` / `selectedValue` / `selectedObservedAt` 记录当前主 Brent 来源。
- `candidateSources` 记录各候选源的 status / value / observedAt / error 摘要。
- `promoteDecision` 记录 promotion 使用的 `recommendedValue` / `canPromoteToPrimary` / `confidence` / `reason`。
- audit 本身不覆盖 `values.brent`；只有 `brentValidation.promotion.applied === true` 的受控路径可以覆盖 Brent 主值。
- audit 不影响 `data.__effectiveDisplayInputs`。
- audit 不影响 Worker-first strict gate、`healthScore`、`criticalMissing`、`sourceMode`、`unavailable`。
- audit 不参与 scoring 或 decision。

### Brent freshness-gated promotion

v28.0D-5 起，FRED `DCOILBRENTEU` 仍是 Brent anchor。只有同时满足以下条件，Worker generated preview 才能把 `values.brent` promote 到市场确认值：

- FRED anchor `ok`，且 value 为正的 finite number。
- FRED `observedAt` 超过 72 小时。
- Yahoo `BZ=F` `ok`，value 为正的 finite number，且 observedAt 不超过 48 小时。
- Trading Economics Brent diagnostic `ok`，value 为正的 finite number，`observedAt` 可解析，且 `ageHours <= 48`。
- Yahoo 与 Trading Economics 相对差距不超过 2%。
- Google Finance 的 0 或其他非正值必须排除。
- Stooq parse fail 或 unavailable 必须排除。

promotion 成功时：

- `values.brent` 使用 Yahoo 与 Trading Economics 的平均值。
- `sourceDetails.brent.source` 必须标记 promoted source，不能伪装成 FRED。
- `brentValidation.promotion.applied` 必须为 `true`，并记录 anchor、confirmation sources、divergence 与 reason。

promotion 失败时，`values.brent` 继续使用 FRED anchor。promotion 成功或失败都不得改变 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable` 的计算规则，也不得影响 VIX secondary preview。

v28.0G-4A 起，Trading Economics Brent 会额外输出 `observedAt` audit：`brentValidation.promotion.confirmationSources` 与 `brentValidation.audit.candidateSources` 可显示 Trading Economics 的 `observedAt`、`ageHours`、`freshnessStatus` 与 `freshnessReason`。G-4A 字段仍保留，但当前不再只是 audit-only；v28.0G-4C 会使用这些字段参与 hard gate。旧 Draft PR #53 superseded，不应 merge / cherry-pick；后续必须基于 latest main 串行 trunk flow。

### G-4B / G-4C Trading Economics freshness hard gate

v28.0G-4B 是历史 decision review，不是 runtime change；当前线上已到 v28.0G-4C。G-4C 是当前 Brent promotion contract：Trading Economics `observedAt` 已不只是 audit 字段，会参与 promotion hard gate。

G-4C 中 Trading Economics confirmation 应同时满足 `ok === true`、value 为正的 finite number、`observedAt` 可解析、`ageHours` 为 finite number，且 `ageHours <= BRENT_CONFIRMATION_FRESH_HOURS`（48 小时）。TE fresh 时才可进入 divergence / D-6 gate。

G-4C 计划中的 hard hold 条件：

- Trading Economics `observedAt` 不可解析：阻止 promotion，reason 使用 `tradingeconomics-observedAt-invalid`；`confirmationSources` 仍显示 `freshnessStatus = unknown` 与 `freshnessReason = tradingeconomics-observedAt-unparsed`。
- Trading Economics `observedAt` 超过 48 小时：阻止 promotion，reason 使用 `tradingeconomics-confirmation-stale`；`confirmationSources` 显示 `freshnessStatus = stale` 与 `freshnessReason = tradingeconomics-observedAt-stale`。
- D-6 `confirmed-extreme-move` 也应要求 Trading Economics freshness fresh；如果 Yahoo fresh 但 Trading Economics stale / unknown，不应确认 extreme move。

v28.0G-4C implements the Trading Economics freshness hard gate. Brent promotion now requires Yahoo fresh plus Trading Economics `observedAt` fresh: Trading Economics must be `ok === true`, value must be a positive finite number, `observedAt` must be parseable, `ageHours` must be finite, and `ageHours <= BRENT_CONFIRMATION_FRESH_HOURS` (48 hours). If `observedAt` is not parseable, promotion is held with `reason = tradingeconomics-observedAt-invalid`; `confirmationSources` still shows `freshnessStatus = unknown` and `freshnessReason = tradingeconomics-observedAt-unparsed`. If `observedAt` is older than 48 hours, promotion is held with `reason = tradingeconomics-confirmation-stale`; `confirmationSources` shows `freshnessStatus = stale` and `freshnessReason = tradingeconomics-observedAt-stale`.

Trading Economics candidate fetch remains value/audit oriented: observedAt failure does not make candidate ok false. The hard hold is applied only in `buildBrentPromotionDecision`, after value validity is known. D-6 `confirmed-extreme-move` also requires Trading Economics freshness fresh; if Yahoo is fresh but Trading Economics is stale or unknown, the move must not be confirmed as an extreme move. G-4C is a runtime change and requires deploy preflight, live validation, and 1-2 rounds of scheduled `Check Worker Health` observation. PR #53 remains superseded and is not used.

### Brent source hygiene

v28.0D-8 起，Brent candidate source hygiene 只改善 audit 可读性，不改变主值选择：

- Google Finance `google-finance:BZW00:NYMEX` 必须保持 `role: diagnostic`、`participatesInConsensus: false`、`quality: html-experimental`。HTML 解析可能命中 futures chain 中的 `0` 或非主价格；0、负数、null、NaN 必须标记 `excluded-non-positive-or-invalid`，不得进入 promotion confirmation sources。
- Stooq `stooq:brn.f`（v28.0D-8A）必须为 `role: diagnostic`、`participatesInConsensus: false`、`quality: csv-symbol-unstable`；不进入 `brentValidation.consensus`，不进入 promotion confirmation sources；CSV close 缺失时记录 `csv-no-numeric-close`，下载不可用时记录 `symbol-download-unavailable`。这是 **role/audit 表达清理**，不是抓取修复；可靠 Stooq 符号与 CSV 解析应另做 **v28.0D-8B Source Probe**。
- Stooq alternate `stooq:brn.c` 只作为 `quality: experimental-alt-symbol` diagnostic probe，进入 `brentValidation.candidates` 与 `brentValidation.audit.candidateSources`，但不参与 consensus 或 promotion。`brn.f` / `brn.c` 当前均可能无法返回可解析 close，仍为 experimental。
- `brentValidation.audit.candidateSources` 对 Google Finance、Stooq `brn.f`、Stooq `brn.c` 应提供 `source`、`role`、`participatesInConsensus`、`status`、`value`、`observedAt`、`error`、`reason` / `exclusionReason` 与 `quality`。

当前 Brent 主值逻辑仍是 FRED anchor + Yahoo `BZ=F` / Trading Economics confirmed promotion。Google Finance HTML experimental 与 Stooq CSV 探测均 **不是可靠诊断源**，抓取层面的真正修复（含 Google Finance 非主价 / futures-chain zero、Stooq 符号与列映射）应通过 **D-8B** 另行设计。Google Finance 或 Stooq 失败不得影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。

### Brent source probe

v28.0D-8B-lite 起，Worker generated preview 可在 `brentValidation.sourceProbe` 中附带低频隔离的 Brent source probe：

```text
brentValidation.sourceProbe
```

该字段只用于调查 Google Finance 与 Stooq 是否存在稳定可用路径，不是 promotion 逻辑修复。它不得参与 `values.brent`、`brentValidation.consensus`、`brentValidation.promotion`、Worker-first strict gate、scoring 或 decision。

sourceProbe 每 **60** 分钟最多运行一次。生成新 main preview 前会读取上一轮 main preview 摘要；如果上一轮 `brentValidation.sourceProbe.generatedAt` 距今小于 60 分钟，则复用上一轮 `probes`，并标记 `reused: true` 与 `reason: source-probe-reused-within-60m`。该复用只使用既有上一轮 main preview KV read，不新增独立 KV key，也不增加 KV write 次数。

当前 D-8B-lite 只保留最多 5 个 probe：

- Google Finance canonical：`https://www.google.com/finance/quote/BZW00:NYMEX`
- Google Finance front-month：`https://www.google.com/finance/quote/BZY00:NYMEX`
- Stooq：`brn.f`
- Stooq：`brn.c`
- Stooq：`bz.f`

Google Finance probe 用于记录 `httpStatus`、`contentType`、`bodyLength`、`finalUrl`、保守解析状态、`parsedValue`、`parseMethod`、`reason` 与小型 snippet / pattern 名称。解析不得接受 `value <= 0`，也不得把无法可靠定位主 quote price 的 HTML 标为 `ok`；此时应记录 `unreliable-html-parse` 或等价原因。

Stooq probe 会对 `https://stooq.com/q/d/l/?s=<symbol>&i=d` CSV 响应做 header-aware 解析，记录 header、最多 3 行截断样本、列名、`parseStatus`、`parsedValue`、`parsedObservedAt`、`closeColumnUsed` 与原因。不得假设 close 一定是第 5 列；没有可识别 header、HTML / 空内容或无正数 close 时必须记录诊断状态。

`sourceProbe` 必须保持小型：不保存完整 HTML，不保存完整 CSV，样本行最多 3 行，snippet / sample 字符串应截断。Google Finance / Stooq probe 即使成功，也仍是 diagnostic-only；只有后续某个 probe 连续稳定，才可另开 D-8C 讨论是否升级为 validation source。当前 Brent 主逻辑仍是 FRED anchor + Yahoo `BZ=F` / Trading Economics confirmed promotion。

**v28.0D-8B findings（结论型快照，diagnostic-only）**：一次典型线上结果表明，这五路 probe **均未提供可靠 Brent primary quote**。下列 `parseStatus` 仅用于判断是否“存在稳定可用路径”，**不是** Brent 主值，也 **不构成** consensus / promotion 输入：

| probeId | parseStatus |
| --- | --- |
| `google-finance:BZW00:NYMEX` canonical | `unreliable-html-parse` |
| `google-finance:BZY00:NYMEX` front-month | `unreliable-html-parse` |
| `stooq:brn.f` | `empty-body` |
| `stooq:brn.c` | `header-unrecognized` |
| `stooq:bz.f` | `empty-body` |

在上述观测窗口内，Google Finance / Stooq **不得** 升级为 Brent validation source，也 **不得** 进入：

- `brentValidation.consensus`
- `brentValidation.promotion`
- `values.brent`

`sourceProbe` 的失败或不可靠解析 **不得** 影响 Worker generated preview 的 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`（它们不参与主链路门禁）。

若要重新评估“是否可能升级”，至少需要连续多轮 `parseStatus = ok`、`parsedValue > 0`、时间与样本可解释，并与 Yahoo / Trading Economics **合理接近**；仍应另开 **D-8C** 再做结构升级决策（而不是在 D-8B 的结论层直接改 promotion）。

### Brent extreme-move confirmation guard

v28.0D-6 起，Worker generated preview 会在生成前读取上一轮 `market:worker-generated-preview` 的小型 Brent 摘要：

```text
previousUpdatedAt
previous values.brent
previous brentValidation.promotion.selectedValue
previous brentValidation.promotion.selectedSource
previous brentValidation.promotion.moveStatus
previous sourceDetails.brent.source
```

读取失败或解析失败不得中断主 preview。该读取只用于 Brent move audit，不增加 KV write。

`brentValidation.promotion` 必须包含：

```text
previousReferenceValue
previousReferenceSource
previousUpdatedAt
promotedChangePct
moveStatus
moveReason
extremeMoveConfirmedBy
```

`moveStatus` 取值：

```text
no-previous
normal
volatility-watch
confirmed-extreme-move
unconfirmed-jump-hold
```

规则：

- previous reference 缺失时，`moveStatus = no-previous`，不阻止 D-5 promotion。
- promoted change <= 2% 时，`moveStatus = normal`，允许 promotion。
- promoted change > 2% 且 <= 3% 时，`moveStatus = volatility-watch`，允许 promotion 并记录 audit。
- promoted change > 3% 时，只有 Yahoo 与 Trading Economics 同时有效、Yahoo fresh 且 divergence <= 1%，才允许并标记 `confirmed-extreme-move`。
- > 3% 且未被双源确认时，`moveStatus = unconfirmed-jump-hold`，不得使用 candidate promoted value；应保留上一轮 accepted Brent，若不可用再回退 FRED anchor。

`confirmed-extreme-move` 是风险信号，不是数据错误；不得降低 `healthScore`，不得影响 `criticalMissing` / `sourceMode` / `unavailable`，也不得改变 scoring / decision。

### Brent source explainability UI

v28.0D-7 起，前端“盘中快变量 / 布伦特”会读取 selected realtime payload 中的 `brentValidation.promotion` 与 `brentValidation.audit`，展示短文本来源解释与波动状态。该 UI 只解释当前 `values.brent` 的来源：

- FRED anchor：`布伦特来源：FRED 日度锚点`
- Yahoo + Trading Economics promotion：`布伦特来源：FRED 滞后，Yahoo + Trading Economics 双源确认`
- `moveStatus` 会映射为中文短状态；`promotedChangePct` 存在时显示相邻周期变化。

该显示不读取 `/market.secondary-preview.json`，不改变 Worker payload，不改变 `effectiveDisplayInputs`、scoring、decision 或 Worker-first strict gate。

## DXY / 广义美元指数契约

内部字段名仍然是 `dxy`，不要把内部字段改名。DOM id 仍然可以是 `rt-dxy`，数据字段仍然是：

```text
values.dxy
displayInputsBaseline.dxy
```

用户可见文案应显示为：

```text
广义美元指数
```

## ON RRP 单位契约

内部 ON RRP 单位仍是：

```text
billion USD
```

中文用户可见显示统一换算为：

```text
亿美元
```

换算规则：

```text
亿美元 = billion USD × 10
```

示例：

```text
0.082 billion USD → 0.82 亿美元
100 billion USD → 1000 亿美元
300 billion USD → 3000 亿美元
```

不要为了显示单位修改内部阈值数值。

## 当前值型文案重建规则

当前值型文案必须基于结构化字段重建，不允许字符串替换。

允许：

```text
基于 effectiveDisplayInputs.brent 生成“布伦特 103.4”
```

禁止：

```text
把旧文案里的 123.3 replace 成 103.4
```

阈值 / 规则型文案应保留，例如：

```text
布伦特 > 110
高收益利差 > 4.5%
波动率 < 18
```

不要把这些规则型阈值误当成当前值替换。

## Realtime fallback 契约

前端应优先使用远端 `realtime-data` payload。本地 `./realtime/market.json` 只作为 fallback，并且必须通过安全闸门：

- 结构完整。
- 时间可解析。
- 不超过 180 分钟。
- 关键字段足够。
- 包含 `fieldFreshness`。
- 包含 `brentValidation`。

不合格的本地 realtime payload 不得 overlay 页面。

## Transmission Delta / 传导网络 Δ 契约

`transmissionChain.nodes[*].delta` 是机构级宏观传导网络节点相对上一期同名节点 `score` 的变化值：

```text
delta = current.score - previous.score
```

示例：

```json
{
  "label": "油价压力",
  "score": 81,
  "delta": -2
}
```

页面显示为：

```text
Δ -2
```

如果找不到上一期同名节点，或当前分数 / 上一期分数不可比较，`delta` 必须为 `null`。`delta = null` 是合法状态，页面应显示：

```text
趋势待累计
```

这表示当前缺少可比较的上一期传导节点数据，不代表系统异常。

Daily pipeline 计算 `delta` 时，上一期传导节点来源优先级为：

1. 当前磁盘上的旧 `data/radar-data.json` 中的 `transmissionChain.nodes`
2. `data/radar-history-full.json` 中最近一条 `transmissionSnapshot.nodes`
3. `data/radar-history.json` 中最近一条 `transmissionSnapshot.nodes`
4. 如果都没有，则当前所有传导节点的 `delta = null`

节点匹配键优先级为：

```text
node.id → node.key → node.label
```

当前真实传导节点结构通常只有 `label`，因此目前主要按同名 `label` 匹配。

`data/radar-data.json` 根层可包含审计字段：

```json
"transmissionDeltaMeta": {
  "source": "previous-radar-data",
  "matchedNodes": 6,
  "totalNodes": 6
}
```

字段含义：

- `source`：本次 delta 使用的上一期来源，例如 `previous-radar-data`、`radar-history-full`、`radar-history` 或 `none`。
- `matchedNodes`：成功匹配上一期节点的数量。
- `totalNodes`：当前传导网络节点总数。

如果没有可用上一期来源，应记录为：

```json
"transmissionDeltaMeta": {
  "source": "none",
  "matchedNodes": 0,
  "totalNodes": 6
}
```

`transmissionDeltaMeta` 只用于调试和审计，不参与评分、不参与决策，也不改变页面当前分数。

Daily history 新记录可保存轻量传导网络快照：

```json
"transmissionSnapshot": {
  "nodes": [
    {
      "key": "战争冲击",
      "label": "战争冲击",
      "score": 82
    }
  ]
}
```

`transmissionSnapshot` 用于下一次 Daily 构建计算节点级 `delta`。它不用于直接渲染页面主值，不参与评分，不参与决策。旧历史记录没有 `transmissionSnapshot` 时必须保持兼容，不能视为数据错误。

边界规则：

- `delta` 是显示层趋势辅助信息，不是风险评分输入。
- `delta` 不改变当前节点 `score`。
- `delta` 不改变 `strategyState`、`executionLock`、`positionGuidance` 或其他决策输出。
- `delta = null` 是合法状态，表示趋势数据仍在累计。
- 页面显示“趋势待累计”表示暂无可比较上一期，不代表 pipeline 或页面异常。

## validate-data.mjs 契约

当前自动校验覆盖：

- `displayInputsBaseline` 9 个字段。
- live realtime 与 baseline 对齐。
- cache-only 时跳过 live 对齐。
- `brentValidation` 安全结构。
- weak-confirmation 不可 promote。
- FRED anchor 不参与推荐。
- stale source 必须有排除原因。
- `dailyRealtimeInput` 新鲜度与健康度。

这些校验用于阻止 Daily workflow 静默提交过旧、不健康或结构不完整的数据。

## Legacy / 兼容字段

以下字段虽然可能看起来重复，但可能仍被页面模块读取：

- `topRisks`
- `phaseSignals`
- `summary`
- `decisionLine`
- `triggerPanel`
- `assetMatrix`
- `scenarioTree`
- `tradingSystem`
- `decisionModel`

删除或重命名前必须先确认所有消费方，包括页面渲染、运行时 overlay、校验脚本和历史数据兼容逻辑。

## v28.0L-3H External AI provider artifact boundary

The `External AI Manual Provider Test` workflow may produce a DeepSeek output artifact after the `external-ai-manual` environment gate is approved, but that artifact remains non-production.

Contract boundary:

- Provider output must not be copied into `data/radar-data.json`.
- Provider output must not modify the live `externalAiInterpretationLayer`.
- Production `externalAiInterpretationLayer` remains disabled / non-user-visible.
- Provider output remains artifact-only, validator-gated, quality-review-gated, and `promotionEligible=false`.
- No scoring, decision, execution, position, Worker, Daily, frontend, `values.*`, or `effectiveDisplayInputs` contract changes are introduced by L-3H.

## v28.0L-3H-1 provider-call audit data boundary

Run `25592238444` produced the first real `fixture_sample` provider-call result, but it did not change the production data contract.

Audit result:

- output validation passed.
- DeepSeek manual API test passed.
- quality review failed with `needs_prompt_revision`.
- `promotionEligible=false`.
- provider artifacts remain non-production diagnostics.
- artifact upload was blocked by the sanitizer because diagnostic JSON contained the forbidden marker `DEEPSEEK_API_KEY`.

The sanitizer failure was a diagnostic marker issue, not approval to copy provider output into production. No provider output, quality review output, failure artifact, or provider-test diagnostic artifact may be copied into `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, config files, frontend display paths, Daily inputs, scoring, decision, execution, or position logic.

## v28.0L-3H-2 prompt quality revision data boundary

v28.0L-3H-2 changes prompt / quality guidance only. It does not change the production data contract.

No external AI provider artifact, quality review artifact, dry-run artifact, prompt diagnostic, or manual artifact may enter `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, config files, frontend display paths, Daily inputs, scoring, decision, execution, or position logic.

Production `externalAiInterpretationLayer` remains disabled and non-user-visible. Production integration remains `not_ready`.

## v28.0L-3H-3 second fixture provider-call audit data boundary

Run `25593082968` successfully audited the second `fixture_sample` provider-call path, including provider transport, output validation, quality review, artifact sanitizer, and sanitized artifact upload.

This does not change the production data contract:

- provider artifacts remain non-production diagnostics.
- even quality-reviewed provider output cannot enter `data/radar-data.json` yet.
- production `externalAiInterpretationLayer` remains disabled and non-user-visible.
- `promotionEligible=false` remains required.
- no provider output may enter `data/*.json`, `realtime/*.json`, Worker payloads, config files, frontend display paths, Daily inputs, scoring, decision, execution, or position logic.

## v28.0L-3I local_compact provider artifact data boundary

v28.0L-3I designs a future `local_compact` provider-call path only. It does not change the production data contract.

Future `local_compact` input and output artifacts remain non-production diagnostics:

- `manual-artifacts/external-ai/manual-input-compact-latest.json` must stay ignored and artifact-only.
- provider output must not enter `data/radar-data.json`.
- provider output must not enter any `data/*.json` or `realtime/*.json` production path.
- provider output must not modify Worker payloads or config files.
- provider output must not enter Daily inputs.
- provider output must not affect scoring, decision, execution, or position logic.
- production `externalAiInterpretationLayer` remains disabled and non-user-visible.
- `promotionEligible=false` remains required unless a separate reviewed production integration PR explicitly changes that boundary.

## v28.0L-3J local_compact workflow artifact data boundary

v28.0L-3J implements the `local_compact` provider-call workflow path, but it does not change the production data contract and does not run the provider call in the PR.

Contract boundary:

- `manual-artifacts/external-ai/manual-input-compact-latest.json` remains an ignored diagnostic artifact.
- Any future `local_compact` provider output remains non-production.
- No provider output enters `data/radar-data.json`.
- No provider output enters `data/*.json`, `realtime/*.json`, Worker payloads, config files, Daily inputs, or frontend display paths.
- Production `externalAiInterpretationLayer` remains disabled and non-user-visible.
- `promotionEligible=false` remains required.
- Scoring, decision, execution, and position logic remain unchanged.

## v28.0L-3J-1 local_compact source metadata exception

`manual-artifacts/external-ai/manual-input-compact-latest.json` may reference `data/radar-data.json` as read-only local source metadata.

This reference is not a production data write and is not approval to upload or copy production data:

- the compact input artifact remains ignored and non-production.
- actual `data/radar-data.json` must not be uploaded as a workflow artifact.
- provider output must not be copied into `data/radar-data.json`.
- provider output must not enter `data/*.json`, `realtime/*.json`, Worker payloads, config files, Daily inputs, or frontend display paths.
- production `externalAiInterpretationLayer` remains disabled and non-user-visible.
- scoring, decision, execution, and position logic remain unchanged.

## v28.0L-3J-3 local_compact execution-language output boundary

Run `25598379612` proved the `local_compact` provider-call path can reach validation and sanitizer, but quality review correctly blocked a provider artifact because a fact repeated the decisionContext phrase `执行灯`.

This does not change the production data contract:

- `decisionContext` remains read-only background.
- `local_compact` provider output may not expose decision, execution, position, cash, exposure, target-band, light/status, or trading-action fields in display strings.
- `facts`, `summaryZh`, `inferences`, `modelJudgments`, `scenarioHypotheses`, `invalidationSignals`, `sourceAttribution.noteZh`, and `auditFlags` must not repeat `decisionContext` operation language.
- provider output remains artifact-only and non-production.
- production `externalAiInterpretationLayer` remains disabled and non-user-visible.
- no provider output may enter `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, config files, Daily inputs, or frontend display paths.
- scoring, decision, execution, and position logic remain unchanged.

## v28.0L-3J-4 local_compact provider-call audit data boundary

Run `25598887574` successfully audited the `local_compact` provider-call path, including provider transport, output validation, quality review, artifact sanitizer, and sanitized artifact upload.

This does not change the production data contract:

- `local_compact` provider artifacts remain non-production diagnostics.
- even quality-reviewed provider output cannot enter `data/radar-data.json` yet.
- production `externalAiInterpretationLayer` remains disabled and non-user-visible.
- `promotionEligible=false` remains required.
- no provider output may enter `data/*.json`, `realtime/*.json`, Worker payloads, config files, frontend display paths, Daily inputs, scoring, decision, execution, or position logic.
- production data writes remain `not_ready`.
- frontend display remains `not_ready`.
- Daily integration remains `not_ready`.

## v28.0L-3K production readiness data boundary

v28.0L-3K reviews production integration readiness but does not change the production data contract.

Current data contract decision:

- External AI production data contract remains disabled / `not_ready`.
- Production `externalAiInterpretationLayer` remains disabled and non-user-visible.
- Provider artifacts remain non-production diagnostics.
- Provider output must not be copied into `data/radar-data.json`.
- Provider output must not enter `data/*.json`, `realtime/*.json`, Worker payloads, config files, Daily inputs, frontend display paths, scoring, decision, execution, or position logic.
- `promotionEligible=false` remains required.

Future production data contract design must be a separate reviewed phase.

## v28.0L-3L externalAiInterpretationLayer production contract design

v28.0L-3L designs the future production data contract in [`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md). It does not implement the contract and does not write production data.

Current contract boundary:

- `externalAiInterpretationLayer` remains disabled / absent / scaffold-only in production data.
- The layer remains non-user-visible.
- No data write is approved.
- No frontend display is approved.
- No Daily integration or automatic provider call is approved.
- Provider artifacts remain non-production diagnostics.
- Provider output must not be copied into `data/radar-data.json`.
- `promotionEligible=false` remains required.

Before any future write to `data/radar-data.json`, a production contract validator must exist and pass. The future validator must reject unsafe execution / investment / trading wording, secrets, headers, raw provider dumps, stale artifacts, malformed provenance, malformed freshness metadata, and any scoring / decision / execution / position effect.

## v28.0L-3M externalAiInterpretationLayer validator scaffold

v28.0L-3M adds `npm run check:external-ai-production-contract` and a valid fixture for the proposed production contract.

Current data contract boundary:

- The production contract validator scaffold exists.
- `externalAiInterpretationLayer` is still not written to `data/radar-data.json`.
- The layer remains disabled / absent / scaffold-only in production data.
- Frontend display remains disabled.
- Daily and automatic provider calls remain disabled.
- Future write requires a projection / dry-run stage and explicit approval.
- Future write must pass the production contract validator before any production data file is changed.

## v28.0L-3N externalAiInterpretationLayer projection dry-run

v28.0L-3N adds a local projection dry-run for the future production contract.

Current data contract boundary:

- `npm run check:external-ai-production-projection` generates and validates an ignored projection artifact.
- Projection output is written only under `manual-artifacts/external-ai/`.
- Projection output is not `data/radar-data.json`.
- `externalAiInterpretationLayer` remains absent / disabled / scaffold-only in production data.
- Frontend display remains disabled.
- Daily and automatic provider calls remain disabled.
- Production write remains NO-GO until a separate explicitly approved production write design and implementation phase.
- Future writes must still pass `check:external-ai-production-contract` before any production data file is changed.

## v28.0L-3O externalAiInterpretationLayer first write guard

v28.0L-3O adds first controlled production write design and `npm run check:external-ai-production-write-guard`.

Current data contract boundary:

- `externalAiInterpretationLayer` production write remains not approved.
- The write guard checks that current production data remains disabled / non-impacting.
- The write guard fails on frontend display approval, `promotionEligible=true`, or scoring / decision / execution / position impact.
- First production write must be a separate data-only PR with explicit approval.
- First production write must not include frontend display, workflow schedule changes, Daily integration, or automatic provider calls.
- Rollback for the future first write is reverting that isolated PR.

## v28.0L-3P externalAiInterpretationLayer first controlled write

v28.0L-3P writes the first validated production `externalAiInterpretationLayer` into `data/radar-data.json` from run `25598887574`.

Current data contract boundary:

- `externalAiInterpretationLayer` now exists in `data/radar-data.json`.
- The layer is display-disabled: `displayEnabled=false`.
- `boundaries.frontendDisplayApproved=false`.
- `qualityReview.promotionEligible=false`.
- The field is read-only metadata for now.
- Frontend code must ignore the field until a separate frontend PR explicitly approves display.
- The layer must not affect scoring, `decisionModel`, `executionLock`, or `positionGuidance`.

## v28.0L-3P-1 externalAiInterpretationLayer first write audit

v28.0L-3P-1 records the successful post-merge audit of the first controlled data-only write.

Current data contract boundary:

- `externalAiInterpretationLayer` exists in production `data/radar-data.json`.
- `displayEnabled=false`.
- `boundaries.frontendDisplayApproved=false`.
- `qualityReview.promotionEligible=false`.
- The field is data-only and non-user-visible.
- Frontend code must continue ignoring the field until a separate explicitly approved frontend PR changes that boundary.
- Future edits must use the production contract validator and write guard flow.
- No scoring, `decisionModel`, `executionLock`, or `positionGuidance` effect is approved.
- Daily integration and automatic provider calls remain disabled.
- Future edits to the layer must use the write script and production contract validator.

## v28.0L-3Q externalAiInterpretationLayer frontend display design

v28.0L-3Q adds [`EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md`](EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md) as a documentation-only design for a future read-only frontend panel.

Current data contract boundary:

- `externalAiInterpretationLayer` exists in `data/radar-data.json`, but it is not frontend-visible.
- Future frontend display must require `displayEnabled=true`.
- Future frontend display must require `boundaries.frontendDisplayApproved=true`.
- Current production data keeps both values false.
- The layer remains data-only and non-user-visible.
- The layer must not affect scoring, `decisionModel`, `executionLock`, `positionGuidance`, Global Risk Heatmap layout, Daily integration, or automatic provider calls.

## v28.0L-3R externalAiInterpretationLayer hidden frontend scaffold

v28.0L-3R adds a defensive frontend scaffold that can read `externalAiInterpretationLayer` without making it visible.

Current data contract boundary:

- `externalAiInterpretationLayer` remains present in `data/radar-data.json`.
- Current production data keeps `displayEnabled=false`.
- Current production data keeps `boundaries.frontendDisplayApproved=false`.
- The frontend scaffold hides and clears the panel unless both flags are explicitly true.
- The scaffold does not modify `data/radar-data.json`.
- The scaffold does not affect scoring, `decisionModel`, `executionLock`, `positionGuidance`, Global Risk Heatmap layout, Daily integration, or automatic provider calls.
- Visible frontend display remains not approved.

## v28.0L-3S externalAiInterpretationLayer visible display flag design

v28.0L-3S documents the future approval and data-flag process for making the existing hidden scaffold visible.

Current data contract boundary:

- Visible display will require `displayEnabled=true`.
- Visible display will require `boundaries.frontendDisplayApproved=true`.
- Current production data keeps both values false.
- This PR does not change `data/radar-data.json`.
- Future visible-display flag enablement should be data-only where possible if the hidden scaffold remains sufficient.
- Future visible-display flag enablement must not update AI text content, rerun DeepSeek, refresh provider artifacts, add automatic provider calls, or change frontend code unless a separate approval requires it.
- The layer must continue to have no scoring, `decisionModel`, `executionLock`, `positionGuidance`, Global Risk Heatmap, Daily, or automatic provider-call effect.

## v28.0L-3T externalAiInterpretationLayer visible display flags

v28.0L-3T enables the existing production external AI panel through data flags.

Current data contract boundary:

- `externalAiInterpretationLayer.displayEnabled=true`.
- `externalAiInterpretationLayer.boundaries.frontendDisplayApproved=true`.
- This approves display only.
- This does not approve a provider rerun.
- This does not approve AI text changes.
- `qualityReview.promotionEligible=false` remains required.
- `boundaries.affectsScoring=false` remains required.
- `boundaries.affectsDecisionModel=false` remains required.
- `boundaries.affectsExecutionLock=false` remains required.
- `boundaries.affectsPositionGuidance=false` remains required.
- Global Risk Heatmap, Daily integration, and automatic provider calls remain unaffected.

## v28.0L-3T-1 externalAiInterpretationLayer visible display audit

v28.0L-3T-1 records that the visible display flag state passed post-merge audit.

Current data contract boundary:

- `externalAiInterpretationLayer` is display-enabled.
- `externalAiInterpretationLayer.displayEnabled=true`.
- `externalAiInterpretationLayer.boundaries.frontendDisplayApproved=true`.
- `qualityReview.promotionEligible=false`.
- `boundaries.affectsScoring=false`.
- `boundaries.affectsDecisionModel=false`.
- `boundaries.affectsExecutionLock=false`.
- `boundaries.affectsPositionGuidance=false`.
- Display approval does not approve provider reruns, AI text edits, Daily integration, automatic provider calls, or scoring / decision / execution / position impact.

## v28.0L-3U-1 externalAiInterpretationLayer UX audit

v28.0L-3U-1 records that the visible display UX polish passed post-merge audit without changing the data contract.

Current data contract boundary:

- `data/radar-data.json` was not modified during UX polish.
- `externalAiInterpretationLayer` remains the production source for the panel.
- The production data contract remained unchanged.
- AI-generated text was not edited or refreshed.
- Future data updates still require the production contract validator, production write guard, frontend scaffold check, `check:data`, and `check:all`.
- Provider refresh automation, Daily integration, and automatic provider calls remain unapproved.

## v28.0L-4A externalAiInterpretationLayer production refresh

v28.0L-4A adds the `External AI Production Refresh` workflow as the controlled update path for the production external AI layer.

Current data contract boundary:

- The workflow may update `externalAiInterpretationLayer` inside `data/radar-data.json`.
- The workflow must not update other production data fields.
- Production contract validation is required before commit.
- Production write guard is required before commit.
- Frontend scaffold check is required before commit.
- `check:data` and `check:all` are required before commit.
- `displayEnabled=true` is preserved from the current production layer.
- `boundaries.frontendDisplayApproved=true` is preserved from the current production layer.
- `qualityReview.promotionEligible=false` remains required.
- Scoring, `decisionModel`, `executionLock`, `positionGuidance`, Daily integration, and Global Risk Heatmap layout remain unaffected.

## v28.0L-4A-1 externalAiInterpretationLayer refresh audit

v28.0L-4A-1 records that the first `External AI Production Refresh` workflow update succeeded.

Current data contract boundary:

- `externalAiInterpretationLayer` can now be updated by the `External AI Production Refresh` workflow.
- The first workflow update ran as run `25611392014` and committed `c32af65`.
- The refresh workflow may commit only `data/radar-data.json`.
- Production contract validation is required before commit.
- Production write guard is required before commit.
- Protected path assertion is required before commit.
- The successful refresh changed only `data/radar-data.json`.
- No manual artifact, frontend file, script, workflow file, package file, config file, realtime file, or Worker file was committed by the refresh.
- `qualityReview.promotionEligible=false`, non-impact boundaries, and visible display gates remain required.

## v28.0L-4B externalAiInterpretationLayer display coverage

v28.0L-4B does not change the production data contract.

Current data contract boundary:

- Existing `externalAiInterpretationLayer` fields may be displayed in capped, safe, read-only summaries.
- `modelJudgments`, `scenarioHypotheses`, `sourceAttribution`, and `qualityReview` remain production data fields, not frontend-derived data.
- Display coverage polish must not edit AI-generated text or production data.
- Raw provenance, provider artifacts, run IDs, artifact IDs, artifact paths, raw headers, and raw provider output remain hidden from normal display.
- Display coverage must not affect scoring, `decisionModel`, `executionLock`, `positionGuidance`, Daily integration, or Global Risk Heatmap layout.

## v28.0L-4B-1 externalAiInterpretationLayer display coverage audit

v28.0L-4B-1 confirms that display coverage polish does not change the production contract.

Current data contract boundary:

- `externalAiInterpretationLayer` fields may be displayed as capped read-only summaries.
- Displayed fields may include `modelJudgments`, `scenarioHypotheses`, `sourceAttribution` summary, and public `qualityReview` status.
- Raw provenance remains a non-display field.
- Artifact identifiers remain non-display fields.
- Run IDs remain non-display fields.
- Raw provider output remains a non-display field.
- Raw `decisionContext` remains a non-display field.
- The production contract remains unchanged by display coverage polish.
- Future data changes still require production contract validation and production write guard.

## v28.0M-3H externalAiInterpretationLayer preservation

`data/radar-data.json` must retain a contract-valid `externalAiInterpretationLayer` across ordinary radar data refreshes.

Current data contract boundary:

- Normal radar refresh may update market data, risk modules, daily brief, history inputs, and related radar fields.
- Normal radar refresh must preserve the existing contract-valid `externalAiInterpretationLayer` unless the approved `External AI Production Refresh` workflow explicitly updates that layer.
- Normal radar refresh must not delete `displayEnabled`, `boundaries.frontendDisplayApproved`, `qualityReview.promotionEligible`, or the non-impact boundary flags.
- Normal radar refresh must not edit external AI generated text.
- `External AI Production Refresh` remains the only approved automatic provider path for changing external AI content.
- Future data updates still require production contract validation and production write guard.

## v28.0M-3H-1 externalAiInterpretationLayer preservation audit

v28.0M-3H-1 records that the preservation hotfix passed post-merge audit.

Current data contract boundary:

- `data/radar-data.json` must retain a valid `externalAiInterpretationLayer` across ordinary radar refreshes.
- Ordinary radar refresh must preserve the existing layer instead of replacing it with a disabled scaffold.
- `External AI Production Refresh` remains the only approved path that updates external AI content.
- `displayEnabled` must remain a boolean.
- `boundaries.frontendDisplayApproved` must remain a boolean.
- `qualityReview.promotionEligible=false` remains required.
- Non-impact boundaries must remain valid: no scoring, decision, execution, or position impact.
- Future data changes still require production contract validation, production write guard, frontend scaffold check, `check:data`, and `check:all`.

## v28.0M-4 macro overview read-only derivation boundary

The Macro Overview is a frontend read-only derivation layer.

Current data contract boundary:

- Macro overview rendering must not mutate `data/radar-data.json`.
- It reads from existing site data and displays missing-data states when required inputs are unavailable.
- Market Pricing Temperature remains a waiting state until historical weekly data exists.
- Nasdaq / QQQ weekly history, MA60, standard deviation, and z-score values must not be fabricated.
- Macro overview judgment cards must not change scoring, `decisionModel`, `executionLock`, or `positionGuidance`.
- Global Risk Heatmap remains a separate display section, not nested inside macro overview cards.

## v28.0M-5 market pricing temperature design boundary

v28.0M-5 is design-only and does not change production data.

Future data contract boundary:

- Future `marketPricingTemperatureLayer` must remain display-only.
- Future market pricing history must require sufficient weekly observations before calculation.
- Current production `data/radar-data.json` remains unchanged by this design.
- Current macro overview must keep Market Pricing Temperature in waiting-for-history state until valid weekly history exists.
- Nasdaq / QQQ / MA60 / standard deviation / z-score values must not be fabricated.
- The temperature layer must not affect scoring, `decisionModel`, `executionLock`, or `positionGuidance` unless a separate approved phase changes that boundary.

## v28.0M-6 market pricing history scaffold contract

`data/market-pricing-history.json` exists as a scaffold-only contract.

Current data contract boundary:

- The file must keep `status=waiting_for_history` and `sourceMode=scaffold_only`.
- `records` arrays must remain empty until a future approved fetch/data-write PR.
- `check:market-pricing-history` must pass.
- At least 60 weekly observations are required before any MA60, standard deviation, z-score, band, or temperature calculation.
- SPX may be listed only as fallback candidate and must not be mislabeled as Nasdaq / QQQ temperature.
- The scaffold does not feed scoring, `decisionModel`, `executionLock`, or `positionGuidance`.
- `marketPricingTemperatureLayer` remains not implemented / waiting.
