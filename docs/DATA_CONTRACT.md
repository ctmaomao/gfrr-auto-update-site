# Global Financial Risk Radar 数据契约说明

本文档定义 Global Financial Risk Radar 当前数据链路中的 canonical 字段、fallback 字段与验证/调试字段。后续升级应优先遵守这些契约，避免显示值、验证层、历史兼容字段被误用或误删。

## 版本语义

当前仓库采用“双版本”语义，避免把发布版本与兼容数据契约混用：

- **Release/display version**: `v28.0.10`。用于 GitHub release / package version / 页面 ISSUE 显示 / 新 Daily 输出的 `releaseVersion`。
- **Data contract version**: `v27.0`。根级 `data.version` 是历史兼容数据契约标记，不表示当前产品仍停留在 v27。
- **Decision contract version**: `v27.0`。`decisionModel.contractVersion` 继续标记现有 decision payload 兼容契约；只有另开 reviewed contract migration 才能改变。
- **Layer contract versions**: `aiInterpretationLayer.contractVersion`、`externalAiInterpretationLayer`、各 display-only layer 的 contractVersion 独立演进，不得被 release version 机械覆盖。
- **Frontend asset version**: `scripts/app.js` 的 `APP_VERSION` 只是浏览器 cache busting token，不是产品发布号。

新代码需要面向用户展示版本时应优先使用 `releaseVersion`；需要判断 JSON schema / 兼容契约时才使用 `version` 或 `decisionModel.contractVersion`。不得做 `v27.0 → v28.0.10` 的全局替换。

旧 `data/radar-data.json` 快照若尚未由 Daily 重新生成，可能仍缺少 `releaseVersion`，且根级 `decisionLine` / `summary` 中保留旧发布文案。前端入口会在内存中做只读展示归一化；不要为了修正文案直接手工编辑 `data/*.json`。下次 Daily pipeline 会自然写入 `releaseVersion` 与 `versionSemantics`。

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

2026-07-26 起，`review:world-order` 升级为 `world-order-source-health-consistency-review-v1` 只读复核：按 GDELT / OFAC / SIPRI / ACLED 四源状态重算 `freshness` 与 `sourceMode`，覆盖单源降级、聚合状态错配、异常高置信度提示、source timestamp、结构性风险文案及 `decisionModifier` 的 future-reference-only 边界。`check:world-order` 通过 synthetic replay 锁定这些规则；默认 `WARN` 不阻断，`FAIL` 阻断，人工硬复核可加 `--strict`。该复核不联网、不写 artifact/production data，不改变 overlay score、权重、前端、workflow、`values.*`、main scoring、decision、execution、position、Worker 或 cross-validation。

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

### `macroDrivers.consumer` 消费者与增长 contract (v28.0M-47)

`macroDrivers.consumer` 是消费者与增长层指标，汇总月频慢变量数据。所有字段为 audit-only / display-only，不参与 scoring、decisionModel、executionLock 或 positionGuidance。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `umichSentiment` | number \| null | 指数点（1966=100） | FRED:UMCSENT（月频） | 密歇根消费者信心指数 |
| `previousValue` | number \| null | 指数点 | 派生 | 上月值 |
| `threeMonthChange` | number \| null | 指数点 | 派生 | UMCSENT 3个月变化 |
| `sixMonthChange` | number \| null | 指数点 | 派生 | UMCSENT 6个月变化 |
| `regime` | string enum | n/a | 派生（基于 threeMonthChange） | `明显走弱` \| `走弱` \| `稳定` \| `改善` \| `未知` |
| `ismManufacturingPmi` | number \| null (optional) | PMI 指数 0-100 | ISM:ManufacturingPMI（月频公开报告页） | ISM 制造业 PMI（v28.0M-47 起字段;M-67 起修正数据源） |
| `ismManufacturingPmi3mChange` | number \| null (optional) | 指数点 | 派生 | ISM Manufacturing PMI 3个月变化（v28.0M-47 起字段;M-67 起修正数据源） |
| `ismPmiRegime` | string enum (optional) | n/a | 派生（基于 PMI 绝对值） | `扩张` \| `中性偏扩张` \| `收缩` \| `深度收缩` \| `未知` |
| `updatedAt` | string \| null | ISO 8601 | UMCSENT 最新数据点日期 | |
| `source` | string | n/a | 多源（M-67 起） | `FRED:UMCSENT; ISM:ManufacturingPMI`（之前可见 legacy `FRED:UMCSENT` / M-47 source label） |
| `notes` | string[] | n/a | 固定 | 说明 UMCSENT 为 FRED 月频,ISM Manufacturing PMI 来自公开报告页 |
| `sourceStatus` | object | n/a | 拉取状态 | `{ umichSentiment: 'live'\|'fallback'\|'missing', pmi: 'live'\|'fallback'\|'source_unavailable'\|'parse_error' }` |
| `diagnostics.pmi` | object (optional) | n/a | 派生 | 轻量诊断: `httpStatus`,`landingHttpStatus`,`latencyMs`,`parsedAt`,`reportUrl`,`reportMonthLabel`,`errorReason`,`parseStep`,`snippetSample` 均为可选;不保存完整 HTML |

`consumer.diagnostics.pmi` 是 M-67 起的 PMI source repair 诊断入口;它只保存轻量 fetch / parse metadata,不保存原始 HTML。

边界：
- 本字段层不改变 `values.*`、scoring、`decisionModel`、`executionLock`、`positionGuidance`
- 用于 `driver-growth` 和 `pressure-consumer` 渲染卡片的 audit-only 数据源
- 用于 cross-validation `stagflation_pressure` narrative 的条件分类（v28.0M-47 起）
- M-67 后 PMI fetcher 只解析 ismworld.org 公开报告页;若遇到 SSO/login/captcha 或 HTML schema drift,必须降级为 `parse_error`,不得伪造或用替代指标冒充 ISM PMI
- `regime`（基于 UMCSENT 变化率）与 `ismPmiRegime`（基于 PMI 绝对值）独立分类，可同时显示
- `ismManufacturing*` 字段标记为 optional 以保持向后兼容性
- 月频频率：两个 series 都是月频数据，pipeline 跑后即同步更新

`consumer_vs_asset_pricing` 的 `category` 为 `consumer_assets`。该 check 只能说明消费者信心与 S&P 500、VIX、HY OAS 之间是否存在观察性错配；不得写成实时交易信号，不得声称消费崩盘已确认，也不得改变任何仓位或交易建议。

### `macroDrivers.employment` 就业质量与广度 contract (v28.0M-68 / M-73)

`macroDrivers.employment` 是 FRED 劳动力市场 evidence 层，汇总 ICSA / CCSA 周频失业金申请、JTSJOL 月频职位空缺、CES0500000003 平均时薪、U6RATE 劳动力低利用率与公开行业 payroll basket 扩散代理。所有字段为 audit-only / display-only，不参与 scoring、decisionModel、executionLock 或 positionGuidance；不进入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation matrix。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `initialClaims` | number \| null | 人次 | FRED:ICSA（周频 SA） | 最新初请失业金人数 |
| `initialClaims4wAverage` | number \| null | 人次 | 派生 | ICSA 最近 4 个观测点平均 |
| `initialClaims4wChange` | number \| null | 人次 | 派生 | 当前 4w-MA 相对前 4 个观测点 4w-MA 的变化 |
| `continuingClaims` | number \| null | 人次 | FRED:CCSA（周频 SA，约 1 周滞后） | 最新续请失业金人数 |
| `continuingClaims4wAverage` | number \| null | 人次 | 派生 | CCSA 最近 4 个观测点平均 |
| `joltsOpenings` | number \| null | 人次 | FRED:JTSJOL（月频，约 6 周滞后） | 最新 JOLTS 职位空缺数；FRED 原始单位为 thousands，pipeline 存储时转换为人次 |
| `joltsOpeningsYoY` | number \| null | 比例 | 派生 | JOLTS 相对 12 个月前同月变化率 |
| `joltsUpdatedAt` | string \| null | ISO 8601 | JTSJOL 最新数据点日期 | 前端用于显示 JOLTS vintage，避免把月频滞后误读为实时数据 |
| `averageHourlyEarnings` | number \| null | USD/hour | FRED:CES0500000003（月频） | Total private average hourly earnings，公开工资增速代理 |
| `averageHourlyEarningsYoY` | number \| null | 比例 | 派生 | 平均时薪相对 12 个月前同月变化率 |
| `averageHourlyEarningsUpdatedAt` | string \| null | ISO 8601 | CES0500000003 最新数据点日期 | 工资数据 vintage |
| `u6Rate` | number \| null | % | FRED:U6RATE（月频） | U-6 劳动力低利用率 |
| `u6Rate3mChange` | number \| null | pp | 派生 | U-6 相对 3 个月前变化 |
| `u6UpdatedAt` | string \| null | ISO 8601 | U6RATE 最新数据点日期 | U-6 数据 vintage |
| `industryPayrollDiffusionPct` | number \| null | % | FRED industry payroll basket | 公开行业 payroll series 中环比增加的比例 |
| `industryPayrollPositiveCount` | number \| null | count | 派生 | 环比增加的行业 series 数量 |
| `industryPayrollSeriesCount` | number \| null | count | 派生 | 本次有效参与扩散计算的行业 series 数量 |
| `industryPayrollUpdatedAt` | string \| null | ISO 8601 | 行业 payroll basket 最新数据点日期 | 行业扩散 vintage |
| `claimsRegime` | string enum | n/a | 派生 | `明显走弱` \| `走弱` \| `稳定` \| `改善` \| `未知` |
| `joltsRegime` | string enum | n/a | 派生 | `紧张` \| `平衡` \| `宽松` \| `走弱` \| `未知` |
| `laborQualityRegime` | string enum | n/a | 派生 | `工资韧性` \| `扩散改善` \| `降温` \| `平衡` \| `未知` |
| `industryDiffusionRegime` | string enum | n/a | 派生 | `广泛扩张` \| `温和扩张` \| `分化` \| `收缩扩散` \| `未知` |
| `sourceStatus` | object | n/a | 拉取状态 | `sourceStatus.icsa` / `ccsa` / `jtsjol` / `ahe` / `u6` / `industryPayroll` 每项为 `live` \| `fallback` \| `missing` |
| `updatedAt` | string \| null | ISO 8601 | 各 series 中最新观测日期 | employment 子树更新时间 |
| `source` | string | n/a | 固定 | `FRED:ICSA; FRED:CCSA; FRED:JTSJOL; FRED:CES0500000003; FRED:U6RATE; FRED:industry-payroll-basket` |
| `notes` | string[] | n/a | 固定 | 说明本层为周频/月频公开 FRED evidence，且只用于展示 |

分类阈值：

- `claimsRegime`: `initialClaims4wAverage >= 260000` 或 `initialClaims4wChange >= 25000` → `明显走弱`；`initialClaims4wAverage >= 230000` 或 `initialClaims4wChange >= 10000` → `走弱`；`initialClaims4wChange <= -10000` 且 `initialClaims4wAverage <= 225000` → `改善`；否则 `稳定`。
- `joltsRegime`: `joltsOpenings >= 9000000` 或 `joltsOpeningsYoY >= 0.08` → `紧张`；`joltsOpenings < 6500000` 或 `joltsOpeningsYoY <= -0.12` → `走弱`；`joltsOpenings < 7200000` 或 `joltsOpeningsYoY < -0.04` → `宽松`；否则 `平衡`。
- `industryDiffusionRegime`: `industryPayrollDiffusionPct >= 70` → `广泛扩张`；`>= 55` → `温和扩张`；`>= 40` → `分化`；`< 40` → `收缩扩散`；缺失时为 `未知`。
- `laborQualityRegime`: U-6 三个月变化 `>= 0.4pp` 或行业扩散 `< 40%` → `降温`；工资 YoY `>= 4%` 且 U-6 未明显上行 → `工资韧性`；行业扩散 `>= 55%` 且 U-6 未明显上行 → `扩散改善`；否则 `平衡`。

边界：

- 本字段层不改变 `values.*`、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 本字段层不进入 `displayInputsBaseline` / `effectiveDisplayInputs`，前端只读 `data.macroDrivers.employment.*`。
- 本字段层不进入 `divergenceLayer.checks[]` / cross-validation matrix，也不扩展 `AI_INTERPRETATION_EVIDENCE_LAYERS`。
- 任一 FRED series 拉取失败必须逐 series 降级为 `fallback` 或 `missing`，不得伪造值，不得用非同义替代指标冒充 ICSA / CCSA / JTSJOL / AHE / U-6 / industry payroll basket。
- JTSJOL、AHE、U-6 与行业 payroll basket 均为月频慢变量，前端必须展示或暗示 vintage/慢变量语义，不得暗示它们是实时就业信号。
- 行业扩散只使用公开 FRED payroll basket 代理，不等于 BLS proprietary diffusion index 或职位质量明细。

### `macroDrivers.consumerRetail` 高频零售消费 contract (v28.0M-69 / M-74 / M-77 / M-79)

`macroDrivers.consumerRetail` 是 Chicago Fed CARTS via FRED 的周频零售/消费 nowcast evidence 层，并在 M-74 增加 FRED MRTS 月频细分零售品类扩散，在 M-77 增加 Bank of America Institute Consumer Checkpoint 公开 HTML 摘要解析，在 M-79 增加 Trading Economics Redbook public HTML same-store sales YoY 摘要解析。所有字段为 audit-only / display-only，不参与 scoring、decisionModel、executionLock 或 positionGuidance；不进入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation matrix。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `cartsNominal` | number \| null | USD billions | FRED:CARTS（周频 SA） | Chicago Fed Advance Retail Trade Summary 名义零售+餐饮销售（不含汽车）最新观测；pipeline 将 FRED 原始 millions 转为 billions |
| `cartsNominal4wAverage` | number \| null | USD billions | 派生 | CARTS 最近 4 个观测点平均 |
| `cartsNominalYoY` | number \| null | 比例 (-1 至 +∞) | 派生 | CARTS 相对 52 周前的 YoY 变化率 |
| `cartsReal` | number \| null | USD billions | FRED:CARTSR（周频 SA） | Chicago Fed CARTS 实际（通胀调整后）零售+餐饮销售最新观测 |
| `cartsReal4wAverage` | number \| null | USD billions | 派生 | CARTSR 最近 4 个观测点平均 |
| `cartsRealYoY` | number \| null | 比例 (-1 至 +∞) | 派生 | CARTSR 相对 52 周前的 YoY 变化率 |
| `retailSegments` | object[] | mixed | FRED:MRTS monthly retail trade segments | `MRTSSM441USN` 等 13 个细分零售品类，包含 `key` / `seriesId` / `labelZh` / `value` / `yoy` / `updatedAt` / `sourceStatus` |
| `segmentDiffusionPct` | number \| null | % | 派生 | 13 个 MRTS 细分品类中 YoY 为正的比例 |
| `segmentPositiveCount` / `segmentSeriesCount` | number \| null | count | 派生 | YoY 为正品类数 / 有效细分品类数 |
| `segmentRegime` | string enum | n/a | 派生 | `广泛改善` \| `温和改善` \| `分化` \| `广泛走弱` \| `未知` |
| `bofaCardSpendingYoY` | number \| null | ratio | BoA Consumer Checkpoint public HTML | Bank of America Institute card spending per household YoY |
| `bofaCardSpendingPriorYoY` | number \| null | ratio | BoA Consumer Checkpoint public HTML | 同一 report 中上一月 YoY 对比 |
| `bofaCardSpendingExGasYoY` | number \| null | ratio | BoA Consumer Checkpoint public HTML | Ex-gas card spending per household YoY |
| `bofaReportDate` / `bofaReportUrl` / `bofaPdfUrl` | string \| null | ISO / URL | BoA Consumer Checkpoint | report 月份、HTML URL 与 PDF URL |
| `bofaStatus` | string enum | n/a | 拉取状态 | `live` \| `fallback` \| `missing` |
| `redbookRetailSalesYoY` | number \| null | ratio | TradingEconomics:Redbook-public-html | Redbook same-store sales YoY public HTML summary |
| `redbookHistoricalAverageYoY` | number \| null | ratio | TradingEconomics:Redbook-public-html | Trading Economics page summary 中的长期均值 |
| `redbookRetailSalesDate` / `redbookReportUrl` | string \| null | ISO / URL | TradingEconomics Redbook page | Redbook 周频观测日期与公开页面 URL |
| `redbookStatus` | string enum | n/a | 拉取状态 | `live` \| `fallback` \| `missing` |
| `retailRegime` | string enum | n/a | 派生（优先 cartsRealYoY，缺失时使用 redbookRetailSalesYoY） | `明显走弱` \| `走弱` \| `稳定` \| `改善` \| `强劲` \| `未知` |
| `sourceStatus` | object | n/a | 拉取状态 | `sourceStatus.carts` / `sourceStatus.cartsr` / `sourceStatus.retailSegments` / `sourceStatus.bofaConsumerCheckpoint` / `sourceStatus.redbookPublicHtml` 每项为 `live` \| `fallback` \| `missing` |
| `updatedAt` | string \| null | ISO 8601 | 两个 series 中最新观测日期 | consumerRetail 子树更新时间；前端必须显示 vintage |
| `source` | string | n/a | 固定 | `FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments; BofA:ConsumerCheckpoint-public-html; TradingEconomics:Redbook-public-html` |
| `notes` | string[] | n/a | 固定 | 必须说明 CARTS/CARTSR + MRTS + BoA Consumer Checkpoint + Redbook public HTML 均为 audit-only / display-only |

分类阈值：

- `retailRegime`: 优先使用 `cartsRealYoY`；若缺失则使用 `redbookRetailSalesYoY`。`<= -0.03` → `明显走弱`；`< 0` → `走弱`；`>= 0.06` → `强劲`；`>= 0.03` → `改善`；否则 `稳定`；缺失时为 `未知`。
- `segmentDiffusionPct`: `>= 70` → `广泛改善`；`>= 55` → `温和改善`；`>= 40` → `分化`；`< 40` → `广泛走弱`；缺失时为 `未知`。

边界：

- 本字段层不改变 `values.*`、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 本字段层不进入 `displayInputsBaseline` / `effectiveDisplayInputs`，前端只读 `data.macroDrivers.consumerRetail.*`。
- 本字段层不进入 `divergenceLayer.checks[]` / cross-validation matrix，也不扩展 `AI_INTERPRETATION_EVIDENCE_LAYERS`。
- 任一 FRED / public HTML source 拉取失败必须逐 source 降级为 `fallback` 或 `missing`，不得伪造值，不得用月度 RSAFS / PCE 冒充 CARTS / CARTSR；MRTS 细分品类只能作为月频结构观察，不得写成 Redbook raw feed / BoA raw card feed。
- M-69 不接 `CARTSP` 价格指数；该价格 series 仅为 future scope，不能被本层前端或 validator 当作已接入数据。
- `macroDrivers.consumerRetail.redbookRetailSalesYoY` 只代表 Trading Economics public HTML 页面中的 Redbook same-store sales YoY 摘要，不代表 Redbook raw subscription feed、完整历史授权数据或 BoA raw card feed。
- M-77 的 BoA Consumer Checkpoint 只解析公开 HTML 摘要中的 card spending per household YoY / ex-gas YoY；它不是 Redbook，也不是 BoA 原始卡明细或非公开 raw feed。
- 2026-09-05 BoA兼容修复：明确每户模板可直接解析；简写模板必须匹配单独人工审阅的HTML/PDF口径配对（首个为2026年8月），不得把total aggregate任意映射为per-household。ratio仍是同比，不能取环比；同报告缺字段保留null，不拼接旧缓存。`bofaReportDate`仍是报告月份，不冒充观测月份或精确发布日期。新live报告月龄不超过62天；旧缓存可fallback但UI必须显示报告月份/沿用旧值，缺失或未来日期不得保留静态示例数字。

### `macroDrivers.commercialRealEstate` 商业地产信用压力 contract (v28.0M-70 / M-74 / M-80 / M-84)

`macroDrivers.commercialRealEstate` 是 FRED 季频 CRE 信用压力 evidence 层，汇总商业地产贷款拖欠率、核销率与 SLOOS 三个 CRE 子类贷款标准收紧度；M-74 增加 Yahoo `VNQ` / `REM` 公开市场代理；M-80 增加 Yahoo `CMBS` commercial MBS ETF public proxy；M-84 增加 FRED `CREACBW027SBOG` 周频银行 CRE loan balance aggregate exposure proxy。所有字段为 audit-only / display-only，不参与 scoring、decisionModel、executionLock 或 positionGuidance；不进入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation matrix。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `creDelinquencyRate` | number \| null | % | FRED:DRCRELEXFACBS（季频） | CRE loan delinquency rate 最新观测 |
| `creDelinquencyRateQoQChange` | number \| null | pp Δ | 派生 | CRE 拖欠率相对上一观测季度变化 |
| `creChargeOffRate` | number \| null | % | FRED:CORCREXFACBS（季频） | CRE loan charge-off rate 最新观测 |
| `creChargeOffRateQoQChange` | number \| null | pp Δ | 派生 | CRE 核销率相对上一观测季度变化 |
| `sloosCreNonfarmNonresidentialTightening` | number \| null | net % | FRED:SUBLPDRCSN（季频） | SLOOS 非农非住宅 CRE 贷款标准净收紧 |
| `sloosCreConstructionTightening` | number \| null | net % | FRED:SUBLPDRCSC（季频） | SLOOS 建设 / 土地开发 CRE 贷款标准净收紧 |
| `sloosCreMultifamilyTightening` | number \| null | net % | FRED:SUBLPDRCSM（季频） | SLOOS multifamily CRE 贷款标准净收紧 |
| `sloosCreTighteningMax` | number \| null | net % | 派生 | 三条 SLOOS CRE 子类中的最大净收紧值 |
| `reitEtfPrice` / `reitEtf4wChange` | number \| null | price / ratio | Yahoo:VNQ | 公开 REIT ETF 代理的价格与 4 周变化 |
| `mortgageReitEtfPrice` / `mortgageReitEtf4wChange` | number \| null | price / ratio | Yahoo:REM | mortgage REIT ETF 代理的价格与 4 周变化 |
| `cmbsEtfPrice` / `cmbsEtf4wChange` | number \| null | price / ratio | Yahoo:CMBS | commercial mortgage-backed securities ETF public proxy 的价格与 4 周变化 |
| `creLoanBalance` | number \| null | USD billions | FRED:CREACBW027SBOG（周频） | All commercial banks CRE loans aggregate exposure stock proxy |
| `creLoanBalance4wChange` | number \| null | ratio | 派生 | `creLoanBalance` 相对约 4 周前变化 |
| `creLoanBalanceYoY` | number \| null | ratio | 派生 | `creLoanBalance` 相对约 52 周前变化 |
| `creLoanBalanceUpdatedAt` | string \| null | ISO 8601 | FRED:CREACBW027SBOG | 银行 CRE loan balance 最新 observation date |
| `creLoanBalanceStatus` | string enum | n/a | 拉取状态 | `live` \| `fallback` \| `missing` \| `manual_required` |
| `crePublicMarketProxyRegime` | string enum | n/a | 派生 | `市场压力上升` \| `观察` \| `平稳` \| `未知` |
| `nonPublicCreStatus` | string enum | n/a | 固定 | `manual_required`，非公开 CRE loan tape / private marks 不从 runtime 抓取 |
| `creStressRegime` | string enum | n/a | 派生 | `恶化` \| `紧绷` \| `稳定` \| `宽松` \| `改善` \| `未知` |
| `sourceStatus` | object | n/a | 拉取状态 | FRED 子项与 `reitEtf` / `mortgageReitEtf` / `cmbsEtf` / `creLoanBalance` 为 `live` \| `fallback` \| `missing`；`nonPublicCre` 固定 `manual_required` |
| `updatedAt` | string \| null | ISO 8601 | 子源中最新观测日期 | commercialRealEstate 子树更新时间；FRED 季频 observation date 为季度起始日，`CREACBW027SBOG` 为周频 |
| `source` | string | n/a | 固定 | `FRED:DRCRELEXFACBS; FRED:CORCREXFACBS; FRED:SUBLPDRCSN; FRED:SUBLPDRCSC; FRED:SUBLPDRCSM; FRED:CREACBW027SBOG; Yahoo:VNQ; Yahoo:REM; Yahoo:CMBS` |
| `notes` | string[] | n/a | 固定 | 必须说明 `CREACBW027SBOG` 是 public aggregate exposure proxy，`VNQ` / `REM` / `CMBS` 是公开市场代理，不代表非公开 CRE loan tape 或 private marks |

分类阈值：

- `creStressRegime`: 任一核心压力项达到 `creDelinquencyRate >= 4.0`、`creChargeOffRate >= 1.0` 或 `sloosCreTighteningMax >= 35` → `恶化`；任一核心压力项达到 `creDelinquencyRate >= 2.0`、`creChargeOffRate >= 0.35` 或 `sloosCreTighteningMax >= 15` → `紧绷`；三项均可用且 `creDelinquencyRate <= 1.0`、`creChargeOffRate <= 0.10`、`sloosCreTighteningMax <= -10` → `改善`；三项均可用且 `creDelinquencyRate <= 1.25`、`creChargeOffRate <= 0.20`、`sloosCreTighteningMax <= 0` → `宽松`；否则 `稳定`；三项全部缺失时为 `未知`。

边界：

- 本字段层不改变 `values.*`、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 本字段层不进入 `displayInputsBaseline` / `effectiveDisplayInputs`，前端只读 `data.macroDrivers.commercialRealEstate.*`。
- 本字段层不进入 `divergenceLayer.checks[]` / cross-validation matrix，也不扩展 `AI_INTERPRETATION_EVIDENCE_LAYERS`。
- 本字段层不扩写 `macroDrivers.credit`；现有 credit 子树继续只覆盖 HY/IG cash-bond OAS、C&I SLOOS 与 NFCI。
- 任一 FRED series 拉取失败必须逐 series 降级为 `fallback` 或 `missing`，不得伪造值，不得用 CDX、私募信贷或非公开 loan tape 冒充 CRE 信用压力。
- `CREACBW027SBOG` 只可显示为公开 aggregate exposure proxy；`VNQ` / `REM` / `CMBS` 只可显示为公开市场代理；均不得写成非公开 CRE 贷款、私募信用 marks、CDX 或 loan tape。

### `macroDrivers.shippingFreight` / `energySpareCapacity` / `energyInventoryBalance` / `energyTransport` / `policyExpectations` / `privateCreditProxy` expanded ingestion contract (v28.0M-74 / M-77 / M-78 / M-79 / M-80 / M-81 / M-83 / Energy Stress Phase 2 / P6A)

M-74 新增三条 audit-only / display-only 生产数据层；Energy Stress Phase 2 在 owner-approved OPEC implementation 中新增 `macroDrivers.energySpareCapacity`，并在 owner-approved PortWatch implementation 中新增 `macroDrivers.energyTransport`。P6A 在 owner-approved ODP source-gap follow-up 中新增 `macroDrivers.energyInventoryBalance`,用于把 OECD 商业库存与全球净库存变化慢变量接入 ODP 证据边界说明。这些字段均不进入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor、Invalidation Rules、World Order weights、Global Risk Heatmap 或 cross-validation matrix。

| Layer | Source | Required fields | Notes |
|---|---|---|---|
| `macroDrivers.shippingFreight` | StockQ:BDTI; StockQ:BCTI; StockQ:BDI | `balticDirtyTankerIndex`, `balticCleanTankerIndex`, `balticDryIndex`, per-index daily change, `tankerFreightRegime`, `freightStressRegime`, `sourceStatus` | BDTI / BCTI / BDI 是 shipping / freight pressure proxy；不得影响 Brent promotion |
| `macroDrivers.energySpareCapacity` | EIA:STEO:COPS_OPEC | `spareCapacityMbpd`, `latestPeriod`, `latestIsForecast`, `forecast12mMbpd`, `forecast18mMbpd`, `bufferRegime`, `sourceStatus.spareCapacity`, `limitationZh` | EIA STEO OPEC surplus crude oil production capacity monthly estimate/forecast；display-only slow variable；不得写成实时物理闲置桶数、OPEC 官方配额执行或油价预测 |
| `macroDrivers.energyInventoryBalance` | EIA:STEO:PASC_OECD_T3/T3_STCHANGE_WORLD/PATC_WORLD | `oecdCommercialInventoryMbbl`, `oecdCommercialInventoryYoYMbbl`, `oecdCommercialInventoryVs5yPct`, `oecdCommercialInventoryDaysOfSupply`, `globalInventoryDrawMbpd`, `globalInventoryDraw3mAvgMbpd`, `worldConsumptionMbpd`, `worldConsumptionYoYMbpd`, `latestPeriod`, `latestIsForecast`, `forecast6mOecdCommercialInventoryMbbl`, `forecast12mOecdCommercialInventoryMbbl`, `inventoryRegime`, `globalDrawRegime`, `sourceStatus.inventoryBalance`, `series`, `units`, `limitationZh` | EIA STEO OECD commercial inventory + global net inventory withdrawals + global consumption monthly estimate/forecast；display-only slow variable；不得写成实时全球商业库存总量、Kpler/AIS oil-on-water 确认、OPEC 月报或油价预测 |
| `macroDrivers.energyTransport` | IMFPortWatch:Daily_Chokepoints_Data | `latestDate`, `latestAgeDays`, `windowDays`, `usageTermsPinned`, `redistributionCaveat`, `chokepoints.{suez,panama,bosporus,babElMandeb,malacca,hormuz,capeGoodHope,gibraltar}` compact latest + 7d/30d averages + deviations, `reroutingProxy`, optional forward-compatible `transportShockCandidate` (`contractVersion=transport-shock-candidate-v1`, `candidateOnly=true`, `auditOnly=true`, `eligibleForMainScore=false`, route/market confirmation `not_connected`), `sourceStatus.chokepoints`, `limitationZh` | PortWatch AIS-derived chokepoint proxy；只提交 compact 派生摘要,不提交 raw AIS-derived history；writer emits `usageTermsPinned=imf_data_terms_pinned` after TOS pin Phase A,while validator temporarily accepts legacy `partial` until Daily proof;`redistributionCaveat=true` 必须保留；`transportShockCandidate` 只是可入分前候选审计层,不接路线级油轮运费/市场确认前不得用于主分数；Route-level tanker freight confirmation 目前是 source-review only + proof-of-source design only,TD3C/TD8/TC5 等路线级候选未 live fetch、未 production write;下一步仅允许 dry-run-only manual artifact scaffold,`routeFreightConfirmation` 必须保持 `not_connected`;不得写成官方贸易统计、封锁确认、战争概率或油价预测 |

Route-level tanker freight proof-of-source 当前只是设计契约;route-level tanker freight manual artifact scaffold 的输出 schema 为 `route-level-tanker-freight-proof-review-v1`,只允许 ignored `manual-artifacts/route-level-tanker-freight/` 审阅产物,不得自动抓取 Baltic/ICE/CME/vendor 页面、不得读取 API key、不得写 production data、不得改变 `routeFreightConfirmation=not_connected`。route-level tanker freight manual samples review 的输出 schema 为 `route-level-tanker-freight-manual-samples-review-v1`,只聚合多份 proof-review artifact 的 sample count、bucket coverage、repeated route observation 与 blockers,仍不得写 production data、不得进入 route confirmation 或主判断打分。`route-level-tanker-freight-display-contract-v1` 是 display-only candidate contract,状态固定 `contract_only_no_production_write`;它不新增生产字段、不写 `macroDrivers.energyTransport.routeFreightConfirmation`,当前 `transportShockCandidate.routeFreightConfirmation` 仍必须保持 `not_connected`。`route-level-tanker-freight-production-display-projection-v1` 是 production display projection dry-run-only 输出 schema,由 `project:route-level-tanker-freight-production-display` 读取 manual samples review 后只写 ignored `manual-artifacts/` 投影产物;不得写 `data/radar-data.json`、不得接 frontend/workflow/Worker、不得批准 production display 或 main-score eligibility。`route-level-tanker-freight-production-display-projection-review-v1` 是 production display projection review artifact schema,由 `review:route-level-tanker-freight-production-display-projections` 聚合投影产物,仍不得批准 direct display、production write 或 main-score eligibility。`route-level-tanker-freight-frontend-display-brief-v1` 是 Route-level tanker freight frontend display brief,状态为 docs-only / no frontend implementation;它只定义未来 UI 应放在现有 ODP folded detail 中,不新增前端 DOM、不写 production data、不接 workflow/Worker、不 live fetch、不改变 `routeFreightConfirmation=not_connected`,也不批准 ODP `finalBias`、Brent promotion、主分数、Global Risk Heatmap 或 cross-validation。`route-level-tanker-freight-production-write-readiness-v1` 是 Route-level tanker freight production write readiness manual artifact;它只表示可进入单独 production writer contract design,source-rights 仍为 manual_review_required,immediate production write 仍 blocked,并固定 `productionWriteApproved=false` / `routeFreightConfirmation=not_connected`;no production write、no frontend、no workflow、no Worker、no scoring。`route-level-tanker-freight-thematic-card-brief-v1` 是 Route-level tanker freight thematic card brief,只记录未来可在 `C1 通胀与能源` 增加一张路线级油轮运费卡的目标;当前不新增 `c1-route-tanker-freight`,no production write,no scoring。`route-level-tanker-freight-production-writer-contract-design-v1` 是 Route-level tanker freight production writer contract design,状态为 `contract_design_only_no_writer`;它只定义未来 `macroDrivers.energyTransport.routeFreightConfirmation` 字段形状,no production data write、不接 frontend/workflow/Worker、不 live fetch、不读 API key,且 allowed status 故意排除 `confirmed`。`route-level-tanker-freight-source-rights-approval-gate-v1` 是 Route-level tanker freight source-rights approval gate,状态为 `manual_review_required_no_source_rights_approved`,block reason 为 `source_rights_and_redistribution_not_approved`;没有候选来源获得 live fetch、route-value redistribution、production write 或 frontend approval,因此仍不得写生产字段。`route-level-tanker-freight-source-rights-approval-template-v1` 是 Route-level tanker freight source-rights approval template,状态为 `template_only_no_approval`,block reason 为 `template_only_no_source_rights_approved`;它只定义未来人工审批证据字段,不授予任何 source/live fetch/redistribution/production/frontend approval。`route-level-tanker-freight-source-rights-artifact-review-v1` 是 Route-level tanker freight source-rights artifact review,由 `review:route-level-tanker-freight-source-rights-artifact` 只读 manual/fixture JSON 并输出 ignored artifact;即使输出 `fixture_only_reviewable_keep_blocked` 或 `reviewable_pending_separate_gate_update`,也不更新 gate、不写 production data、不批准 frontend/workflow/Worker 或 scoring。`route-level-tanker-freight-source-rights-gate-update-proposal-v1` 是 Route-level tanker freight source-rights gate update proposal,由 `project:route-level-tanker-freight-source-rights-gate-update` 只输出 ignored proposal artifact;fixture 输入固定 `fixture_only_proposal_keep_gate_blocked`,即使真实非 fixture 证据可标记 `ready_for_human_gate_update_review`,也固定 `gateUpdateApproved=false`、`writesGateFixture=false`、`productionWriteApproved=false`。`route-level-tanker-freight-source-rights-gate-update-proposal-review-v1` 是 Route-level tanker freight source-rights gate update proposal review,由 `review:route-level-tanker-freight-source-rights-gate-update-proposal` 只输出 ignored review artifact;fixture 固定 `fixture_only_review_keep_gate_blocked`,真实 proposal 最多 `ready_for_human_gate_update_pr_review`,仍固定 `applyApprovedByThisReview=false`、`writesGateFixture=false`、`productionWriteApproved=false`。`route-level-tanker-freight-baltic-context-policy-v1` 是 Route-level tanker freight Baltic context policy,当前 IA 决策为 `keep_baltic_freight_as_broad_context` 与 `additive_card_until_separate_deprecation_review`;现有 `Baltic Freight` / `macroDrivers.shippingFreight` 仍是 StockQ BDTI/BCTI/BDI 广义运费背景,不得当作路线级确认,删除或合并该卡必须另开 deprecation review。`route-level-tanker-freight-disabled-writer-scaffold-v1` 是 Route-level tanker freight disabled writer scaffold,由 `project:route-level-tanker-freight-disabled-writer` 只输出 ignored manual artifact,状态固定 `disabled_no_production_write`;candidate field 为 `route-level-tanker-freight-confirmation-v1` 但 `status=not_connected`、`sourceRightsStatus=manual_review_required`、`productionWriteAttempted=false`,仍不得写生产字段。

`route-level-tanker-freight-source-rights-input-v1` 是 Route-level tanker freight source-rights input prep 的 ignored local draft schema,由 `prepare:route-level-tanker-freight-source-rights-input` 只读 approval template fixture 并默认写入 `manual-artifacts/route-level-tanker-freight/source-rights-input.json`;状态为 `draft_manual_input_no_approval`,所有 approval claims 默认 false,不得被当作 source approval、live fetch approval、production write approval、frontend approval 或 scoring eligibility。

`transport-shock-confirmation-factor-source-to-score-contract-v1` 是 Transport Shock Confirmation Factor / `transportShockConfirmationFactor` 的 P-score-1 contract only。它只定义未来 shadow score 的输入篮子与入分顺序:PortWatch chokepoint、StockQ BDTI/BCTI、Free Route-Linked Tanker Transport Pressure Proxy、Baltic Weekly Tanker Report public route-signal、Oil News、ODP Brent/curve/crack 和 Oil Thermal;当前状态固定为 `contract_only_no_shadow_score`,不新增生产字段、不写 `data/radar-data.json`、不写 `data/oil-directional-pressure.json`、不接 frontend/workflow/Worker、不 live fetch,no ODP `finalBias`,不改变 ODP `finalBias` 或今日总判断打分。

`transport-shock-confirmation-factor-source-review-v1` 是 Transport Shock Confirmation Factor source-review 的 P-score-2 review-only 契约。它只审阅 Free Route-Linked Tanker Transport Pressure Proxy 与 Baltic Weekly Tanker Report public route-signal 两个候选源族,结论为 `source_review_ready_for_manual_sample_scaffold`;下一步仅允许 `transport_shock_confirmation_factor_manual_sample_scaffold_no_live_fetch_no_production_write`。该契约不新增生产字段、不写 `data/radar-data.json`、不写 `data/oil-directional-pressure.json`、不接 frontend/workflow/Worker、no live fetch、no production data write、不建立 shadow score、不改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-manual-sample-scaffold-v1` 是 Transport Shock Confirmation Factor manual sample scaffold 的 P-score-3 local/manual 契约;`review:transport-shock-confirmation-factor-manual-sample` 只读 `manual-artifacts/transport-shock-confirmation-factor/` 或 `docs/fixtures/transport-shock-confirmation-factor/`,输出 ignored `manual-artifacts/transport-shock-confirmation-factor/` 审查产物,产物 schema 为 `transport-shock-confirmation-factor-manual-sample-review-v1`。该 helper 不联网、不读 API key、不读 env、不写 `data/radar-data.json`、不写 `data/oil-directional-pressure.json`,并固定 `routeFreightConfirmation=not_connected`、`marketConfirmation=not_connected`、`eligibleForMainScore=false`;不得接 frontend/workflow/Worker、不得建立 shadow score、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-manual-samples-review-v1` 是 Transport Shock Confirmation Factor manual samples review 的 P-score-4 local/manual 聚合契约;`review:transport-shock-confirmation-factor-manual-samples` 只读 manual-sample review artifacts,聚合 bucket/source/direction coverage,输出 ignored `manual-artifacts/transport-shock-confirmation-factor/` 审查产物。即使输出 `manual_samples_review_ready_keep_non_production`,也只表示样本聚合可进入后续 shadow score 设计,不批准 production write、frontend display、shadow score、ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-shadow-score-v1` 是 Transport Shock Confirmation Factor shadow-score projection 的 P-score-5 local/manual artifact-only 契约;`project:transport-shock-confirmation-factor-shadow-score` 只读 `transport-shock-confirmation-factor-manual-samples-review-v1`,输出 ignored `manual-artifacts/transport-shock-confirmation-factor/` 投影产物。即使输出 `shadow_score_projected_non_production`,也只是 `manual_route_signal_slice_only`,固定 `completeFactorScoreGenerated=false`、`productionShadowScoreGenerated=false`、`routeFreightConfirmation=not_connected`、`marketConfirmation=not_connected`、`eligibleForMainScore=false`;不得写 production data、不得接 frontend/workflow/Worker、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-display-projection-v1` 是 Transport Shock Confirmation Factor display projection 的 P-score-6 local/manual dry-run 契约;`project:transport-shock-confirmation-factor-display-projection` 只读 `transport-shock-confirmation-factor-shadow-score-v1`,输出 ignored `manual-artifacts/transport-shock-confirmation-factor/` 投影产物。即使输出 `ready_for_frontend_card_design_review_keep_non_production` 与 `manual_shadow_projection_ready_non_production`,也固定 `directDisplayApproved=false`、`frontendDisplayApproved=false`、`productionDataWriteApproved=false`、`displayProjectionOnly=true`、`eligibleForMainScore=false`;不得写 production data、不得由 projection artifact 直接实现前端卡片、不得接 workflow/Worker、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-frontend-card-v1` 是 Transport Shock Confirmation Factor frontend card 的 P-score-7 thematic card 契约。它只允许 `scripts/modules/renderMacroOverview.js` 在 `C1 通胀与能源` 读取生产 payload 中的 `radarData.macroDrivers.energyTransport.transportShockCandidate` 可选候选字段;当前 committed payload 缺失该字段时必须展示为 `数据不足` / `候选字段待刷新`。该契约不读取 `manual-artifacts/`、不读取 P-score-5/P-score-6 投影 artifact、不批准 route-level tanker freight source rights、不写 `data/radar-data.json` 或 `data/oil-directional-pressure.json`、不接 workflow/Worker/live fetch。P-score-51/52 后,前端可额外展示已由 runtime 写入的顶层 `transportShockScoringImpact`,但不得自行计算分数、不得改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-production-refresh-v1` 是 Transport Shock Confirmation Factor production refresh verification 的 P-score-8 read-only 契约。`check:transport-shock-confirmation-factor-production-refresh` 只验证 Daily writer 已在 live/fallback/missing energy-transport 路径写入 `transportShockCandidate`,并只读 committed `data/radar-data.json`。当前 payload 未刷新出该可选字段时先输出 `awaiting_production_refresh` / WATCH;只有可信 git history 可证明 writer activation 后连续 2 次 `chore: refresh radar data` Daily refresh commit 仍缺字段时才升级 FAIL。浅历史、无 git history 或 schedule-only fallback 不得宣称 successful Daily refreshes,只能作为诊断。字段出现后必须满足 `contractVersion=transport-shock-candidate-v1`、`candidateOnly=true`、`auditOnly=true`、route/market confirmation `not_connected`;P-score-51 后,`eligibleForMainScore` 与 scoring/decision/execution/position boundary 只允许在 live/fresh pressure candidate 下按 `transportShockScoringImpact` 触发,其他 values、Brent promotion、World Order、Heatmap、cross-validation 边界仍必须 false。该契约不触发 Daily、不联网、不写 production data、不接 workflow/Worker、不改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-production-refresh-monitor-p10` 是 P-score-9 artifact-only monitor 契约。`monitor:transport-shock-confirmation-factor-production-refresh` 与 `transport-shock-confirmation-factor-production-refresh-monitor.yml` 只读取 committed `data/radar-data.json`,生成 ignored `manual-artifacts/transport-shock-confirmation-factor/production-refresh-monitor-latest.json` 和 GitHub Summary/artifact。当前 payload 缺 `macroDrivers.energyTransport.transportShockCandidate` 时 status 先保持 `awaiting_production_refresh`;workflow 必须使用 full git history(`fetch-depth: 0`) 统计真实 Daily refresh commits,且只有可信 history 证明 writer activation 后连续 2 次 Daily refresh commit 仍缺字段时才可 fail 为 `missing_candidate_daily_refresh_threshold_exceeded`。浅历史、无 git history 或 schedule-only fallback 只能诊断,不得触发 hard fail。字段出现后只报告 display-only candidate 可见状态,不授予入分资格。workflow 固定 `contents: read`,不得注入 secrets、不得触发 Daily、不得联网抓源、不得 commit/push、不得写 `data/*.json` / `realtime/*.json`,不得影响 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-history-sample-archive-p10` 是 P-score-10 local/manual ignored artifact 契约。`archive:transport-shock-confirmation-factor-history-samples` 只读取 git history 中 committed `data/radar-data.json`,当 `macroDrivers.energyTransport.transportShockCandidate` 已存在且满足 `transport-shock-candidate-v1` candidate-only 边界时,写入 compact sample + sidecar 到 ignored `manual-artifacts/transport-shock-confirmation-factor/history-samples/`。当前生产 payload 尚未刷新该字段时,`check:transport-shock-confirmation-factor-history-sample-archive` 使用 `--allow-empty` 输出 WARN 且不失败。该归档器不得联网、不得触发 Daily、不得写 production data、不得接 workflow/Worker、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-history-samples-review-v1` 是 P-score-11 local/manual history sample review 契约。`review:transport-shock-confirmation-factor-history-samples` 只读 P-score-10 ignored archive samples 或 fixtures,忽略 `.archive-meta.json` sidecar,聚合 sample window、latestDate/latestAgeDays、sourceStatus、candidate status/score/confidence,并输出 ignored `manual-artifacts/transport-shock-confirmation-factor/history-samples-review-latest.json`。即使输出 `history_samples_review_ready_keep_display_only`,也只表示 git-history candidate 样本足够进入 display-only 稳定性审阅;不批准 production write、frontend display、shadow score、route freight confirmation、market confirmation、ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-frontend-caveat-v1` 是 P-score-12 frontend display-only refinement 契约。现有 C1 `Transport Shock / 运输冲击确认因子` 卡可展示 `样本质量` 与 `数据龄` 两个 caveat,但只能由 production payload 的 `macroDrivers.energyTransport.latestAgeDays/sourceStatus` 与 `transportShockCandidate.confidence/routeFreightConfirmation/marketConfirmation` 派生。前端不得读取 `manual-artifacts/transport-shock-confirmation-factor/history-samples-review-latest.json`、不得把 P-score-11 review artifact 当作 production data、不得生成 route freight confirmation 或 market confirmation,不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-frontend-scoring-gate-v1` 是 P-score-18/P-score-52 frontend refinement 契约。现有 C1 `Transport Shock / 运输冲击确认因子` 卡可展示 `入分闸门` 行;P-score-52 后,该行优先由 production payload 顶层 `transportShockScoringImpact` 派生为 `已触发低权重入分` 或 `低权重闸门未触发`,并继续显示 route / market gate 边界。该行不得读取 P-score-17 projection artifact、不得写 production data、不得把 `marketConfirmation` 从 `not_connected` 改为 connected、不得自行批准 route/market confirmation、不得改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-frontend-blocker-row-v1` 是 P-score-40/P-score-52 frontend refinement 契约。现有 C1 `Transport Shock / 运输冲击确认因子` 卡可展示 `阻塞项` 行,但只能由 production payload 的 `transportShockScoringImpact.reason`、`transportShockCandidate.routeFreightConfirmation` / `marketConfirmation` 与 `macroDrivers.energyTransport.latestAgeDays` 派生为当前0贡献原因、路线级油轮运费未确认、市场确认未接入或 PortWatch 数据龄偏滞后等可读摘要。该行不得读取 P-score-17 projection artifact、P-score-13 score-readiness artifact 或 ignored manual artifacts,不得写 production data、不得生成 route/market confirmation、不得改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-frontend-score-impact-v1` 是 P-score-52 frontend score-impact row 契约。现有 C1 `Transport Shock / 运输冲击确认因子` 卡可展示 `主分影响` 行,但只能只读 production payload 顶层 `transportShockScoringImpact` 的 `applied`、`contributionPct`、`maxContributionPct=3`、`reason` 与 guards。该行不得自行计算 contribution、不得读取 ignored artifacts、不得连接 routeFreightConfirmation/marketConfirmation、不得确认封锁/断供/路线级油轮运费、不得改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-frontend-score-attribution-v1` 是 P-score-53 frontend score attribution 契约。`#homepage-risk-engines` 可展示 `Transport Shock 主分归因`,但只能复用 production payload 顶层 `transportShockScoringImpact` 的 capped score impact、reason 与 `scoreBeforeTransport` / `scoreAfterTransport`。该归因层不得自行计算主分、不得读取 ignored artifacts、不得写 production data、不得连接 routeFreightConfirmation/marketConfirmation、不得确认封锁/断供/路线级油轮运费、不得改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

`transport-shock-confirmation-factor-score-impact-history-monitor-v1` 是 P-score-54 artifact-only score-impact history monitor 契约。`monitor:transport-shock-confirmation-factor-score-impact-history` 只读 git history 中 committed `data/radar-data.json` 的顶层 `transportShockScoringImpact`,聚合最近样本的 contribution、reason、candidate status、source freshness 与 scoreBeforeTransport/scoreAfterTransport,默认只写 ignored `manual-artifacts/transport-shock-confirmation-factor/score-impact-history-latest.json` 或 GitHub Summary。该 monitor 不得联网、不得触发 Daily、不得写 production data、不得自行计算新 score、不得连接 routeFreightConfirmation/marketConfirmation、不得确认封锁/断供/路线级油轮运费、不得改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

`transport-shock-confirmation-factor-score-readiness-v1` 是 P-score-13 local/manual score-readiness matrix 契约。`review:transport-shock-confirmation-factor-score-readiness` 只读 production `radar-data` / Oil News / Oil Thermal / ODP JSON、可选 ignored P-score-11 history review artifact 与可选 `transport-shock-confirmation-factor-score-integration-preflight-v1`,输出 ignored `manual-artifacts/transport-shock-confirmation-factor/score-readiness-latest.json`。contract 可给出 `not_ready_for_score` 或 `ready_for_score_design_review_no_score_write`;缺口仍存在时 recommendation 仍为 `keep_display_only_collect_route_market_cross_confirmation`,preflight 已通过时才改为 `open_separate_reviewed_score_design_pr_do_not_auto_wire`。后者只表示 preflight 已把旧 route/market/source-rights/news/thermal blocker 重分类为 design-review-required,下一步必须另开 score-design review,不得自动入分。矩阵检查 production candidate、PortWatch freshness、history sample quality、route-level tanker freight confirmation、market confirmation、source-rights approval、Oil News cross-confirmation、Oil Thermal facility confirmation 与 ODP physical anchor。当前所有 approval flags 必须保持 `eligibleForMainScore=false`、`promotionEligible=false`、`productionWriteApproved=false`、`scoreWriteApproved=false`、`frontendDisplayApproved=false`;不得联网、不得写 production data、不得接 workflow/Worker/frontend、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-score-readiness-monitor-p14` 是 P-score-14 score-readiness monitor / artifact-only monitor 契约。`monitor:transport-shock-confirmation-factor-score-readiness` 只运行本地 P-score-13 readiness review,输出 ignored `manual-artifacts/transport-shock-confirmation-factor/score-readiness-monitor-latest.json`;workflow `transport-shock-score-readiness-monitor.yml` 每日 23:29 UTC 或手动运行,只上传 artifact/GitHub Summary,权限固定 `contents: read`。正常状态为 `blockers_still_present`;若未来所有 hard blockers 清空,只能报告 `score_ready_requires_separate_review` 并要求另开 reviewed score-design PR,不得自动写分。该契约不读取 secrets、不 live fetch、不触发 Daily、不 commit/push、不写 production data、不接 frontend/Worker、不改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-market-confirmation-source-review-v1` 是 P-score-15 market-confirmation source-review 契约。它只审阅已接入的 display-only 公开市场证据候选:Brent futures price curve proxy、ICE Brent futures structure context、EIA Brent spot proxy、ODP raw Brent/WTI/crack/curve evidence 与 Oil News market-reaction aggregate。结论为 `market_confirmation_source_review_ready_for_manual_sample_scaffold`,下一步仅允许 `transport_shock_market_confirmation_manual_sample_scaffold_no_live_fetch_no_production_write`。当前 `marketConfirmationWriteApproved=false`、`scoreWriteApproved=false`、`productionDataWriteApproved=false`,`marketConfirmation` 必须继续 `not_connected`;不得新增 live fetch / data source / production write / workflow / frontend / Worker,不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-market-confirmation-manual-sample-scaffold-v1` 是 P-score-16 local/manual ignored artifact helper 契约。`review:transport-shock-market-confirmation-manual-sample` 只读 `manual-artifacts/transport-shock-confirmation-factor/` 或 `docs/fixtures/transport-shock-confirmation-factor/`,输出 `transport-shock-market-confirmation-manual-sample-review-v1` 到 ignored manual artifact。该 helper 只聚合人工输入的 Brent price-structure / Oil News market-reaction / ODP raw market-stress 样本,并固定 `marketConfirmation` 继续 `not_connected`、`marketConfirmationWriteApproved=false`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`eligibleForMainScore=false`;不得联网、不得写 production data、不得接 workflow/Worker/frontend、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-market-confirmation-display-projection-v1` 是 P-score-17 local/manual display-readiness projection 契约。`project:transport-shock-market-confirmation-display-projection` 只读 `transport-shock-market-confirmation-manual-sample-review-v1`,输出 ignored `manual-artifacts/transport-shock-confirmation-factor/` 投影产物。即使输出 `manual_market_confirmation_review_ready_non_production`,也只表示人工 market-confirmation 样本的 Brent price-structure / Oil News market-reaction / ODP market-stress bucket 覆盖足以进入人工展示设计审阅;它固定 `marketConfirmation` 继续 `not_connected`、`marketConfirmationWriteApproved=false`、`scoreWriteApproved=false`、`productionDataWriteApproved=false`、`frontendDisplayApproved=false`、`eligibleForMainScore=false`;不得写 production data、不得由 projection artifact 直接实现前端卡片、不得接 workflow/Worker、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-free-proxy-score-design-v1` 是 P-score-19 design-only 契约。`TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_SCORE_DESIGN.md` 与 fixture 只定义未来 `free_proxy_only_low_weight_candidate` 的入分设计边界:若没有合法 route-level TD/TC 运费来源,只能考虑免费代理低权重路径,且 `maxFutureMainScoreContributionPct=3`;news-only、single-chokepoint-only、stale-PortWatch contribution 均为 0。该契约固定 `eligibleForMainScore=false`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`mainScoreApproved=false`;不得写 production data、不得新增 live fetch、不得接 workflow/Worker/frontend、不得把 `marketConfirmation` 从 `not_connected` 改成 connected、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-free-proxy-score-candidate-v1` 是 P-score-20 artifact-only 候选投影契约。`project:transport-shock-confirmation-factor-free-proxy-score-candidate` 只读 P-score-19 design fixture 或 ignored manual artifact,并可读 P-score-13 score-readiness matrix artifact,只写 ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-candidate-latest.json`。缺 readiness 时输出 `free_proxy_score_candidate_blocked_no_score_write`,`candidateScoreContributionPct=0`;readiness 为 `ready_for_score_design_review_no_score_write` 时可输出 `free_proxy_score_candidate_ready_no_score_write` 与 capped `candidateScoreContributionPct=3`。所有输出都必须保持 `scoreWriteApproved=false`,`productionWriteApproved=false`,`mainScoreApproved=false`,`eligibleForMainScore=false`,`routeFreightConfirmation=not_connected`,`marketConfirmation=not_connected`;不得写 production data、不得新增 live fetch、不得接 workflow/Worker/frontend、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

`transport-shock-confirmation-factor-free-proxy-score-replay-v1` 是 P-score-21 artifact-only replay scaffold 契约。`replay:transport-shock-confirmation-factor-free-proxy-score-candidate` 只读 P-score-20 candidate artifact 或 fixture,只写 ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-replay-latest.json`。当前 checker 固定验证 `free_proxy_score_replay_scaffold_pass_no_score_write`,`historicalBacktestPerformed=false`,`scoreIntegrationApproved=false`,`scoreWriteApproved=false`,`productionWriteApproved=false`,`eligibleForMainScore=false`;它验证 news-only / single-chokepoint-only / stale-PortWatch / blocked-candidate 零贡献控制,并对 ready candidate 验证 `ready_candidate_cap` 3% 上限控制,不得写 production data、不得接 workflow/Worker/frontend、不得改变 ODP `finalBias`、今日总判断打分、Brent promotion、Global Risk Heatmap 或 cross-validation。

| `macroDrivers.policyExpectations` | FRED:DFEDTARL/DFEDTARU/DFF; Yahoo:ZQ=F/ZQ-monthly-futures/SR3-monthly-SOFR-futures; CheckMySwap:USD-OIS-public-curve; FederalReserve:FOMC statement/SEP/minutes | `targetLower`, `targetUpper`, `targetMid`, `effectiveFedFundsRate`, `fedFundsFutureImpliedRate`, `fedFundsFuturesCurve`, `sofrFuturesCurve`, `oisForwardCurve`, `dotPlotMedianCurrentYear`, `statementUrl`, `policyTone`, `minutesUrl`, `minutesPolicyTone`, `minutesTopicCounts`, `policyExpectationRegime`, `oisForwardStatus` | Fed dot plot 使用 federalreserve.gov SEP accessible table 的 federal funds median；ZQ=F 与 ZQ monthly futures 是 Fed funds futures proxy；SR3 monthly SOFR futures 是担保融资利率曲线 proxy；CheckMySwap USD OIS public curve 来自 DTCC/CFTC public swap data；`fomcminutesYYYYMMDD.htm` 只做 keyword NLP 计数 |
| `macroDrivers.privateCreditProxy` | Yahoo:BIZD; Yahoo:PBDC; Yahoo:SRLN; Yahoo:CCLFX; FRED:BAMLH0A0HYM2; FRED:BAMLC0A0CM; ICE:CDX-index-settlement-public | `bdcEtfPrice`, `bdcEtf4wChange`, `pbdcEtfPrice`, `pbdcEtf4wChange`, `seniorLoanEtfPrice`, `seniorLoanEtf4wChange`, `intervalFundNavPrice`, `intervalFundNav4wChange`, `intervalFundNavUpdatedAt`, `intervalFundNavSymbol`, `intervalFundNavStatus`, `hyOas`, `igOas`, `igMinusHyOas`, `cdxHyPrice`, `cdxHyInstrument`, `cdxHyUpdatedAt`, `cdxIgPrice`, `cdxIgInstrument`, `cdxIgUpdatedAt`, `cdxHyStatus`, `cdxIgStatus`, `privateCreditMarksStatus`, `privateCreditProxyRegime`, `sourceStatus` | BIZD/PBDC 是 listed BDC public proxy；SRLN 是 senior loan ETF proxy；CCLFX 是 public interval-fund NAV proxy；HY/IG OAS 是 cash-bond spread proxy；ICE CDX 是 public EOD settlement price；private credit marks 仍只保留 manual/licensed input 状态 |
| `macroDrivers.worldEconomy` | Yahoo:^STOXX50E; Yahoo:^N225; Yahoo:^GDAXI; Yahoo:^FTSE; Yahoo:^FCHI; Yahoo:^STOXX; Yahoo:^KS11; Yahoo:^AXJO; Yahoo:^STI; Yahoo:^TWII; Yahoo:^NSEI; Yahoo:^BVSP | `stoxx50`, `nikkei225`, `dax`, `ftse100`, `cac40`, `stoxx600`, `kospi`, `asx200`, `sti`, `taiex`, `nifty50`, `bovespa`, per-index `price`, `changePct`, `changeWindow`, `updatedAt`, `sourceStatus`, parent `sourceStatus`, `updatedAt`, `source`, `notes` | STOXX 50 / Nikkei 225 / DAX / FTSE 100 / CAC 40 / STOXX 600 / KOSPI / ASX 200 / STI / TAIEX / Nifty 50 / Bovespa 是 C5 世界经济 display-only 公开指数代理；`changePct` 为 5d window decimal ratio；Nifty 数据完整度略低(Yahoo 偶缺 bar,resolver 已过滤非正/非 finite 点);V2X 留 pending，本层不接入 scoring / decision / execution / position |
| `macroDrivers.euroVolatility` | DeutscheBoerse:quote_box:V2TX; STOXX(fallback) | `value`, `refDate`, `changePct`, `updatedAt`, `sourceStatus`, `source`, `notes` | VSTOXX / V2TX 是 C5 欧元区波动率 display-only 公开指数代理；主源为 boerse-frankfurt quote_box JSON(`DE000A0C3QF1`),STOXX 官页仅作 fallback；`refDate` 使用 Europe/Berlin 日期且 freshness 超过 5 自然日 fallback/missing；`changePct` 为 day-over-day decimal ratio；不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaEquity` | Yahoo:000001.SS; Yahoo:^HSI; Yahoo:000300.SS | `sseComposite`, `hangSeng`, `csi300`, per-index `price`, `changePct`, `changeWindow`, `updatedAt`, `sourceStatus`, parent `sourceStatus`, `updatedAt`, `source`, `notes` | 上证综指 / 恒生指数 / 沪深 300 是 C6 中国宏观 display-only 公开股指代理；`changePct` 为 5d window decimal ratio；China PMI / CPI / 10Y / CFETS 留 pending，本层不接入 scoring / decision / execution / position |
| `macroDrivers.inflationEnergy` | FRED:CPIAUCSL; FRED:CPILFESL; FRED:DCOILWTICO; Yahoo:CL=F | `cpi` (`headlineIndex`, `headlineYoY`, `headlineMoM`, `coreIndex`, `coreYoY`, `coreMoM`, `yoyWindow`, `updatedAt`, `seriesStatus`, `sourceStatus`), `wti` (`price`, `changePct`, `changeWindow`, `updatedAt`, `sourceStatus`) and optional `wtiMarketProxy` (`price`, `changePct`, `changeWindow`, `updatedAt`, `sourceStatus`, `limitationZh`), parent `sourceStatus`, `updatedAt`, `source`, `notes` | US CPI headline/core 与 FRED WTI spot 是 C1 通胀与能源 display-only 公开 FRED 代理；`wtiMarketProxy` 为 Yahoo `CL=F` WTI futures 快速市场代理,用于 ODP T1 日频市场代理优先显示,不是 FRED 官方 spot；CPI YoY/MoM、WTI changePct 与 proxy changePct 均为 decimal ratio,render 层乘 100；tone 仅展示,不接入 scoring / decision / execution / position |
| `macroDrivers.copperGold` | gold-api:HG; gold-api:XAU(备援 Yahoo:HG=F/GC=F) | `copper` / `gold` leg objects (`symbol`, `labelZh`, `price`, `changePct`, `changeWindow`, `updatedAt`, `source`, `sourceStatus`), parent `sourceStatus.{copper,gold,ratio}`, raw `ratio`, `ratioChangePct`, `ratioWindow`, `updatedAt`, `source`, `notes` | 铜金比是 C2 全球流动性 display-only 公开现货价(gold-api HG/XAU 主源,Yahoo HG=F/GC=F 备援——不同厂商,两腿全覆盖,gold-api 宕机时整比率仍可出)；schema 存原始 `copper/gold` 比率,前端显示 `×1000`;`ratioChangePct` 为日变化(较前日,vs 上一轮 Daily)decimal ratio,render 层乘 100；gold-api 实时端点只给现货价,故 changePct 由上轮价派生,Yahoo 备援腿 changePct 置 null(不混窗口);不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaBond` | ChinaBond:MOF-yield-curve | `yield10y` object (`value`, `latestObsDate`, `updatedAt`, `source`, `sourceStatus`), parent `sourceStatus.yield10y`, `updatedAt`, `source`, `notes` | 中国 10 年国债收益率来自 ChinaBond 官方 `historyQuery` JSON；`value` 存 percent(例如 `1.72`),render 层显示 `%`；freshness 超过 7 天 fallback/missing；display-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.cfetsRmb` | ChinaMoney:CFETS-RmbIdx | `cfets`, `bis`, `sdr`, `latestObsDate`, parent `sourceStatus.cfets`, `updatedAt`, `source`, `notes` | CFETS 人民币篮子指数来自 ChinaMoney 官方 `RmbIdxHis` JSON,周频精确篮子,同记录含 BIS/SDR；freshness 超过 14 天 fallback/missing；display-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaInflation` | NBS:stats-zxfb; TradingEconomics:China-CPI-PPI-public-html | `cpi` / `ppi` leaf objects (`yoy`, `refMonth`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`), parent `sourceStatus.{cpi,ppi}`, `updatedAt`, `source`, `notes` | 中国 CPI/PPI 同比来自国家统计局发布正文；Trading Economics 公开 HTML 仅作 fallback；`yoy` 存 decimal ratio,render 层乘 100；freshness 使用 endOfRefMonth 或 publishedAt + 45 天；display-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaPmi` | NBS:stats-zxfb; TradingEconomics:China-NBS-Manufacturing-PMI-public-html | `pmi` leaf object (`value`, `refMonth`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`), parent `sourceStatus.pmi`, `updatedAt`, `source`, `notes` | 中国制造业 PMI 为国家统计局官方 PMI；Trading Economics `/china/business-confidence` 仅作 NBS PMI fallback,不得混用 RatingDog/S&P `/china/manufacturing-pmi`；`value` 存点值；freshness 使用 endOfRefMonth 或 publishedAt + 45 天；display-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaPropertyPrice` | NBS:70city-price-index | `refMonth`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`, `notes`, `newCitiesUp`, `newCitiesFlat`, `newCitiesDown`, `resaleCitiesUp`, `resaleCitiesFlat`, `resaleCitiesDown`, optional / nullable `tierBreakdown.{tier1,tier2,tier3}.{label,cityCount,new,resale}.{up,flat,down}` | NBS 70 城商品住宅价格指数为城市级价格指数计数摘要；从新建商品住宅 / 二手住宅两张表按环比指数 `>100 / =100 / <100` 统计上涨、持平、下降城市数；`tierBreakdown` 按 NBS 官方一线 4 / 二线 31 / 三线 35 城市划分保存全量城市方向数组,用于 C6 卡折叠明细；freshness 使用 publishedAt + 45 天，publishedAt 缺失时使用 endOfRefMonth + 60 天；display-only/audit-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation；城市级指数方向不得写成房源级成交 raw tape |
| `macroDrivers.chinaOmo` | EastMoney:OMO-aggregated-news | `opDate`, `announcementNo`, `operationType`, `termDays`, `operationRate`, `operationAmount`, `updatedAt`, `source`, `sourceStatus`, `notes` | 东方财富聚合转载的央行公开市场操作新闻为公告/新闻级逆回购 / 正回购观察层,非 PBOC 官方原始公告；`announcementNo` 因聚合新闻缺失为 null；按新闻毛额操作句提取 `operationRate` decimal rate(如 1.40% -> `0.014`)和 `operationAmount`(亿元),不存投标量、到期量、净投放或净回笼；EastMoney 新闻源不保留无操作 live 分支,搜不到 7 天内合格操作则 fallback/missing；freshness 使用 publishedAt/opDate + 7 自然日；display-only/audit-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation；公开市场操作数据不得写成逐机构 / 逐笔 raw tape |
| `macroDrivers.chinaTsf` | EastMoney:TSF-aggregated-report | `refMonth`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`, `notes`, `stockYoY`, `ytdIncrementYi`, `incrementPeriodLabel`, `componentsStatus`, `components[]` (`key`, `label`, `incrementYi`) | 东方财富聚合转载的央行社会融资规模月度报告为报告级社会融资规模观察层,非 PBOC 官方原始报告；`stockYoY` 存 decimal ratio,render 层乘 100；`ytdIncrementYi` 与分项 `incrementYi` 均为年内累计增量(亿元),`万亿元` 归一为亿元,`减少` / `下降` 取负；`componentsStatus` 为 complete / partial / missing,不做分项和等于总量的硬校验；freshness 使用 publishedAt + 45 天，publishedAt 缺失时使用 endOfRefMonth + 60 天；display-only/audit-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation；报告级累计分项不得写成贷款笔级 / 机构级 raw tape |
| `macroDrivers.chinaMlf` | EastMoney:MLF-aggregated-news | `opDate`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`, `notes`, `operationAmountYi`, `termMonths`, nullable `mlfRate` | 东方财富聚合转载的央行中期借贷便利 MLF 操作新闻为公告/新闻级 MLF 观察层,非 PBOC 官方原始公告；按新闻毛额操作句提取 `operationAmountYi`(亿元)和 `termMonths`,不取净投放、净回笼、到期金额或加量续作轧差；`mlfRate` 若披露则存 decimal rate(render 层乘 100),近年利率未披露时为 null 且不视作错误；金额、期限和披露利率必须绑定同一笔毛额操作，不能跨工具借用；freshness 以真实且非未来的 opDate 为准，最多 45 自然日，较新 publishedAt 不能洗新旧操作；主查询无有效候选后才使用备用关键词，两次查询合计最多读取 6 篇去重正文；display-only/audit-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation；公告/新闻级 MLF 操作不得写成逐机构 / 逐笔投标 raw tape |
| `macroDrivers.rateVol` | Yahoo:^MOVE | `move`, `moveUpdatedAt`, `moveAgeDays`, `moveRegime`, `freshnessStatus`, `source`, `sourceStatus.move`, `notes` | 债券/利率波动率 MOVE（Yahoo 日频 `^MOVE`）。**评分例外结构源**——继 `onRrp`/`t10y2y`/`igOas` 之后第 4 个进结构门控的 macroDriver：MOVE ≥140 应激→`structuralYellow`、≥160 危机→`structuralRed`，经 `evaluateStructuralGating` 翻黄/红；平静（<140）不影响打分。合理性闸门 `[20,400]` + `instrumentType==='INDEX'` + ≤5 自然日新鲜；取数失败仅在上一轮值仍 fresh 时 carry last-good，否则 fail-closed（`move=null` 不触发）。`structuralScoreBump`（rules.json `structuralGating.moveVolStress`）仅 `decisionModel` 展示、`lockEngine` 不消费。**非第七底层模块、与 World Order overlay 无关、不改 6 模块公式/权重**；`move` 仅经结构门控影响 `executionLock`/`positionGuidance`，不写入 `values.*`/`displayInputsBaseline`/`effectiveDisplayInputs`/6 模块 score/cross-validation |
| `Daily degraded display-only refresh` | Daily fallback path | When `buildFallback()` is used, only `macroDrivers.worldEconomy`, `macroDrivers.chinaEquity`, `macroDrivers.inflationEnergy`, `macroDrivers.copperGold`, `macroDrivers.chinaBond`, `macroDrivers.cfetsRmb`, `macroDrivers.chinaInflation`, `macroDrivers.chinaPmi`, `macroDrivers.euroVolatility`, `macroDrivers.chinaPropertyPrice`, `macroDrivers.chinaOmo`, `macroDrivers.chinaTsf`, `macroDrivers.chinaMlf`, `macroDrivers.energySpareCapacity`, `macroDrivers.energyInventoryBalance`, and `macroDrivers.energyTransport` may be independently refreshed and merged over the cloned previous data | This degraded-mode refresh is display-only; it preserves `recovery.degradedMode` / `safeOutput`, does not overwrite `fedLiquidity` / `policyExpectations` / `curve` / `credit` / `activeSignals` / `gatingEvaluation`, and does not affect scoring, decision, execution, position, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation |

`fomc-minutes-tone-quality-review-v1` 是 `macroDrivers.policyExpectations` 的离线只读质量审阅层。它复算现有 keyword NLP 的鹰/鸽差值 8 阈值、六类 topic count 排序和 `minutesSummaryZh`,并核对 Federal Reserve 官方 URL 与会议日期；生产数据审阅必须使用执行时的真实 UTC 时间计算证据龄，不得复用 synthetic fixture 的冻结时钟，否则新一期合法 minutes 可能被误判为未来日期。证据龄不超过 70 天为 `fresh`,70–120 天为 `aging`,超过 120 天为 `stale`。`fallback`、`manual_required`、`aging`、`stale` 和完整 `missing/未知` 只产生人工 `WATCH`,结构冲突、非官方 URL、负数/非整数计数、不可复现摘要或预测/交易/决策语言产生 `FAIL`。该 review 只可写 ignored `manual-artifacts/fomc-minutes/`,不得联网、不得写 `data/*.json` / `realtime/*.json`,不得改变 Daily parser、frontend、Worker、`values.*`、scoring、`decisionModel`、`executionLock`、`positionGuidance` 或 cross-validation。

失败边界：

- 网络或解析失败必须降级为 `fallback` 或 `missing`，不得把缺失值渲染为 `0.00`、`+0.0bp` 或其它假零。
- `sourceStatus.* = manual_required` 只说明需要人工/自有 licensed input，不得阻塞默认 `check:data`。
- 前端必须用明确标签区分事实源、公开代理与 manual/licensed 缺口。
- M-78 的 `fedFundsFuturesCurve` 只能标注为 Fed funds futures proxy curve，不得写成 OIS forward rate。
- M-79 的 `sofrFuturesCurve` 只能标注为 SR3 SOFR futures proxy curve，不得写成 OIS forward rate。
- M-80 的 `oisForwardCurve` 只能标注为 CheckMySwap USD OIS public curve / public swap-data curve，不得写成 proprietary dealer OIS forward。
- M-78 的 `igOas` / `hyOas` 只能标注为 cash-bond spread proxy，不得写成 CDX HY/IG。
- M-80 的 `PBDC` / `SRLN` 只能标注为 listed BDC / senior loan ETF public proxy，不得写成 CDX HY/IG 或 private credit marks。
- M-81 的 `cdxHyPrice` / `cdxIgPrice` 只能标注为 ICE public CDX index EOD settlement price，不得写成 private credit marks、full licensed Markit historical database、Bloomberg/FactSet/Refinitiv feed 或私募信贷估值。
- M-83 的 `intervalFundNavPrice` / `intervalFundNav4wChange` 只能标注为 CCLFX public interval-fund NAV proxy，不得写成 private credit marks、fundraising data、Cliffwater Direct Lending Index licensed dataset 或非公开私募贷款估值。
- Energy Stress Phase 2 的 `energySpareCapacity` 只能标注为 EIA STEO OPEC surplus crude oil production capacity estimate/forecast 慢变量，不得写成实时物理闲置桶数、OPEC 官方配额执行、断供概率或油价预测。
- P6A 的 `energyInventoryBalance` 只能标注为 EIA STEO OECD commercial inventory + global net inventory withdrawals + global consumption estimate/forecast 慢变量；`PASC_OECD_T3` 不是全球商业库存总量,`T3_STCHANGE_WORLD` 是净抽库/累库代理；不得写成实时全球库存、Kpler/AIS oil-on-water、OPEC 月报、断供概率或油价预测。
- Energy Stress Phase 2 的 `energyTransport` 只能标注为 PortWatch AIS-derived chokepoint proxy；公开 repo 只保存 compact 派生摘要，不提交 raw AIS-derived 120 天历史；TOS pin Phase A 可把 writer 输出从 legacy `partial` 迁到 `imf_data_terms_pinned`,但 `redistributionCaveat=true` 仍保留；不得写成官方贸易统计、实际油轮流量确认、封锁确认、战争概率、断供概率或油价预测。

#### macroDrivers.fedLiquidity

`macroDrivers.fedLiquidity` 是美联储资产负债表与利率层指标。所有字段为 audit-only / display-only，不参与 scoring、`decisionModel`、`executionLock` 或 `positionGuidance`。

字段 contract (v28.0M-50):

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `walcl` | number \| null | 百万美元 | FRED:WALCL（周频） | Fed 总资产 |
| `walcl4wChange` | number \| null | % | 派生 | 4 周百分比变化 |
| `onRrp` | number \| null | 十亿美元 | FRED:RRPONTSYD（日频） | ON RRP 余额 |
| `onRrpWeekChange` | number \| null | % | 派生 | 周百分比变化 |
| `effectiveFedFundsRate` | number \| null (optional) | % | FRED:DFF（日频） | 有效联邦基金利率（v28.0M-41 起） |
| `sofr` | number \| null (optional) | % | FRED:SOFR（业务日） | 担保隔夜融资利率（v28.0M-41 起） |
| `reserveBalances` | number \| null (optional) | 百万美元 | FRED:WRESBAL（周频 Wed，NSA） | 银行存放在 Fed 的准备金（v28.0M-42 起） |
| `reserveBalances4wChange` | number \| null (optional) | % | 派生 | 4 周百分比变化（v28.0M-42 起） |
| `bgcr` | number \| null (optional) | % | NY Fed Markets secured rates API（日频） | Broad General Collateral Rate（v28.0M-50 起；M-73 改为官方 NY Fed API） |
| `tgcr` | number \| null (optional) | % | NY Fed Markets secured rates API（日频） | Tri-Party General Collateral Rate（v28.0M-50 起；M-73 改为官方 NY Fed API） |
| `bgcrUpdatedAt` | string \| null (optional) | ISO 8601 | NYFED:secured-rates-latest | BGCR observation date |
| `tgcrUpdatedAt` | string \| null (optional) | ISO 8601 | NYFED:secured-rates-latest | TGCR observation date |
| `repoRatesSource` | string \| null (optional) | n/a | 固定 | `NYFED:secured-rates-latest` 或 fallback 来源标记 |
| `bgcrSofrSpread` | number \| null (optional) | % | 派生（bgcr − sofr） | BGCR 相对 SOFR 利差（v28.0M-50 起，存储为 %，显示为 bp） |
| `tgcrSofrSpread` | number \| null (optional) | % | 派生（tgcr − sofr） | TGCR 相对 SOFR 利差（v28.0M-50 起，存储为 %，显示为 bp） |
| `repoSpreadRegime` | string enum (optional) | n/a | 派生（基于 \|bgcrSofrSpread\|） | `正常` \| `轻微偏离` \| `压力` \| `危机水平` \| `未知`（v28.0M-50 起） |
| `regime` | string enum | n/a | 派生 | `快速缩表` \| `收缩中` \| `平稳` \| `扩张` \| `未知` |
| `onRrpLevel` | string enum | n/a | 派生 | `告急` \| `收紧` \| `快速消耗` \| `充裕` \| `未知` |
| `pressure` | number | 0-100 | 派生 | 综合流动性压力评分 |
| `sourceStatus` | object | n/a | 拉取状态 | `{ walcl, onRrp, effectiveFedFundsRate, sofr, reserveBalances, bgcr, tgcr }` 每项为 `live` \| `fallback` \| `missing` |

边界：

- 本字段层不改变 `values.*`、scoring、`decisionModel`、`executionLock`、`positionGuidance`。
- `effectiveFedFundsRate` / `sofr` / `reserveBalances` / `reserveBalances4wChange` 标记为 optional 以保持向后兼容性（v28.0M-42 之前的快照不包含全部字段）。
- `sourceStatus.reserveBalances` 只能为 `live` / `fallback` / `missing`。
- `bgcr` / `tgcr` / `bgcrSofrSpread` / `tgcrSofrSpread` / `repoSpreadRegime` 字段标记为 optional 以保持向后兼容性。
- `sourceStatus.bgcr` 与 `sourceStatus.tgcr` 只能为 `live` / `fallback` / `missing`。
- `bgcrSofrSpread` 和 `tgcrSofrSpread` 内部存储为 %（4 位小数），显示层渲染为 bp（× 100，整数）。
- M-73 起 BGCR/TGCR runtime source 为 `https://markets.newyorkfed.org/api/rates/secured/all/latest.json`；不得继续把不可用的 FRED `BGCR` / `TGCR` CSV id 当作 live source。
- 若 NY Fed API 不可用且无 fallback，`bgcr` / `tgcr` / spread 必须保持 `null`，前端不得渲染为 `0.00` 或 `+0bp`。
- BGCR/TGCR 历史从 2018-04 起，作为 NY Fed 与 SOFR 同步发布的回购参考利率。
- 正常市场中 `|bgcrSofrSpread|` 长期 < 5bp，`repoSpreadRegime` 通常显示 `正常`，仅压力事件期间跳出。

**单位差异说明 (v28.0M-42)**：

- `walcl` 和 `reserveBalances` 存储为百万美元（FRED 原始单位），渲染时除以 1,000,000 转换为 trillions。
- `onRrp` 存储为十亿美元（FRED 原始单位）。
- 该差异保留 FRED native units 以便回测 / cross-reference；前端渲染层负责统一转换。

### `macroDrivers.credit` 信用环境 contract (v28.0M-48)

`macroDrivers.credit` 是信用环境层指标，汇总市场利差（FRED + worker）、银行贷款调查数据（SLOOS）与金融状况指数（NFCI）。所有字段为 audit-only / display-only，不参与 scoring、decisionModel、executionLock 或 positionGuidance。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `igOas` | number \| null | % | FRED:BAMLC0A0CM（日频） | 投资级 OAS 利差 |
| `igOas1dChange` | number \| null | % | 派生 | IG OAS 1日变化 |
| `hyOas` | number \| null | % | realtime worker（output assembly 注入） | 高收益 OAS 利差 |
| `igHyRatio` | number \| null | 无量纲 | 派生：igOas ÷ hyOas | IG/HY 比率（信用分层） |
| `regime` | string enum | n/a | 派生 | `扩张` \| `偏紧` \| `正常` \| `偏宽松` \| `未知` |
| `sloosTighteningLargeFirms` | number \| null (optional) | 净百分比 | FRED:DRTSCILM（季度） | SLOOS 大型企业 C&I 净收紧度（v28.0M-46 起） |
| `sloosTighteningSmallFirms` | number \| null (optional) | 净百分比 | FRED:DRTSCIS（季度） | SLOOS 小型企业 C&I 净收紧度（v28.0M-46 起） |
| `sloosTighteningLargeQoQ` | number \| null (optional) | 百分点差 | 派生 | 大型企业 QoQ 变化（v28.0M-46 起） |
| `sloosTighteningSmallQoQ` | number \| null (optional) | 百分点差 | 派生 | 小型企业 QoQ 变化（v28.0M-46 起） |
| `sloosRegime` | string enum (optional) | n/a | 派生 | `显著收紧` \| `温和收紧` \| `中性` \| `放松` \| `未知` |
| `nfci` | number \| null (optional) | 标准分（0=历史均值） | FRED:NFCI（周频） | Chicago Fed 全国金融状况指数（v28.0M-48 起；正值=收紧，负值=宽松） |
| `nfci4wChange` | number \| null (optional) | 标准分 | 派生 | NFCI 4周变化（v28.0M-48 起） |
| `nfciRegime` | string enum (optional) | n/a | 派生（基于 NFCI 绝对值） | `显著收紧` \| `温和收紧` \| `中性` \| `温和宽松` \| `显著宽松` \| `未知`（v28.0M-48 起） |
| `sourceStatus` | object | n/a | 拉取状态 | `{ igOas: 'live'\|'fallback'\|'missing', sloos: 'live'\|'fallback'\|'missing', nfci: 'live'\|'fallback'\|'missing' }` |

边界：
- 本字段层不改变 `values.*`、scoring、`decisionModel`、`executionLock`、`positionGuidance`
- `sloos*` 字段标记为 optional 以保持向后兼容性
- SLOOS 为季度频率慢变量（年发布 4 次），fallback 路径沿用上一季度数据
- `sloosTighteningLargeFirms` 与 `sloosTighteningSmallFirms` 来自同一 SLOOS 调查，共享 `sourceStatus.sloos`
- `regime`（信用市场制度）与 `sloosRegime`（贷款标准制度）独立分类，可同时显示
- NFCI 0 轴方向与 igOas/hyOas 相反：NFCI 正值=金融状况收紧（不利于信用），NFCI 负值=金融状况宽松（有利于信用）。显示层应使用文字标签（`偏紧`/`偏松`）避免数值方向混淆。
- NFCI 周频数据（每周三发布上周五数据），fallback 路径使用上轮值。

### brentPricingLayer 公开代理价格层 contract

`v28.0I-5A` 在 `data/radar-data.json` 根级新增：

```text
brentPricingLayer
```

`brentPricingLayer` 是 Brent 公开代理价格层，用于把当前主 Brent 显示值、公开 Brent 现货代理、EIA Brent Spot Price FOB public proxy、公开 Brent 期货代理、ICE public delayed futures curve、Brent validation / confirmation sources 与公开代理价差分开记录。它是 audit-only / display-only 字段。

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
- `eiaBrentSpotProxy` 必须记录 EIA Europe Brent Spot Price FOB public HTML proxy: `source`、`sourceUrl`、`price`、`dailyChange`、`updatedAt`、`sourceStatus` 与 `limitationZh`。
- `futuresCurve` 必须记录 ICE Brent futures contract structure: `source`、`sourceUrl`、`curveStatus`、`fetchedAt`、`contracts[]` 与 `limitationZh`。
- `iceFuturesPriceCurve` 必须记录 ICE public delayed contract-data: `source`、`sourceUrl`、`curveStatus`、`updatedAt`、`frontPrice`、`backPrice`、`frontMinusBack`、`slopeRegime`、`contracts[]` 与 `limitationZh`。
- `confirmationSources` 必须为数组；每项记录 `source`、`labelZh`、`value`、`observedAt`、`status`、`role`、`participatesInPromotion`、`noteZh`。
- `proxySpread.status` 只能为 `normal` / `watch` / `stress` / `insufficient_data`。
- `confidence.level` 只能为 `low` / `medium` / `high`。
- `boundaries.displayOnly`、`boundaries.auditOnly` 必须为 `true`。
- `boundaries.affectsValuesBrent`、`affectsBrentPromotion`、`affectsScoring`、`affectsDecisionModel`、`affectsExecutionLock`、`affectsPositionGuidance` 必须为 `false`。

### `promotionAudit` 子字段 contract (v28.0M-39)

`brentPricingLayer.promotionAudit` 必须为 object，记录以下字段：

| 字段 | 类型 | 含义 | null 含义 |
|---|---|---|---|
| `promotionApplied` | boolean \| null | 上游 Worker 是否已 promote 副代理为主值 | null = 上游 realtime 源未提供 promotion 决定 |
| `moveStatus` | string \| null | Brent 移动状态分类（如 `normal` / `volatility-watch`） | null = 当前 realtime 源无 move-vs-previous engine |
| `promotionReason` | string \| null | promotion 判定的原因（中文叙述） | null = 所有 fallback (`promotion.reason` → `validation.reason` → `consensus.reason`) 都未提供 |
| `selectedSource` | string | 当前选中的 Brent 源 | 不应为 null |
| `anchorSource` | string | publicSpotProxy 的 anchor 源 | 不应为 null |
| `anchorAgeHours` | number \| null | anchor 数据的年龄（小时） | null = sourceDetails 和 candidates 都未提供时间信息 |

M-39 增加 `consensus.reason` 作为 `promotionReason` 的第三 fallback；增加 `sourceDetails.ageSeconds / 3600` 和 fred-anchor `observedAt` 衍生作为 `anchorAgeHours` 的衍生 fallback。

`publicSpotProxy.limitationZh` 必须说明该字段只是公开 Brent 现货代理观察，不等同于 Platts Dated Brent 或正式实物现货成交价。`futuresProxy.limitationZh` 必须说明该字段是公开期货 / 市场报价代理，仅用于验证层观察。

v28.0I-5C 前端展示只读消费 `brentPricingLayer`。v28.0I-8 起默认以 compact summary 展示，Brent 主值审计、验证源明细和数据限制放入折叠区。前端不得在 render 层反推 Brent 主值、Brent promotion、评分、仓位、执行灯或交易建议；当 `brentPricingLayer` 缺失时只显示温和 fallback。

### brentPricingLayer EIA Brent Spot Proxy 扩展 (v28.0M-85)

M-85 在 brentPricingLayer 新增 EIA Europe Brent Spot Price FOB public HTML 读取。该字段提供公开日频 Brent spot proxy 价格与日变化，用于前端审计显示；它不是 Platts Dated Brent、不是正式 Dated Brent，也不是实物现货成交证据。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `eiaBrentSpotProxy.source` | string | n/a | EIA | 固定为 `EIA:RBRTE` |
| `eiaBrentSpotProxy.sourceUrl` | string | URL | EIA | `https://www.eia.gov/dnav/pet/hist/rbrted.htm` |
| `eiaBrentSpotProxy.price` | number \| null | $/bbl | EIA table | 最新可解析 Europe Brent Spot Price FOB |
| `eiaBrentSpotProxy.dailyChange` | number \| null | $/bbl | 派生 | 最新价格减前一条可用日频价格 |
| `eiaBrentSpotProxy.updatedAt` | string \| null | ISO | EIA table date | 最新可解析价格日期 |
| `eiaBrentSpotProxy.sourceStatus` | enum | n/a | 管道 | `live` \| `fallback` \| `missing` |
| `eiaBrentSpotProxy.limitationZh` | string | n/a | 固定 | 必须说明当前不是 Platts Dated Brent |

边界：

- 不得把 `eiaBrentSpotProxy` 写成 Platts Dated Brent、正式 Dated Brent 或实物现货成交证据。
- 不得让 `eiaBrentSpotProxy` 改变 `values.brent`、Brent promotion、scoring、decision、execution 或 position。
- EIA HTML 返回空表、解析失败或网络失败时必须降级为 `fallback` / `missing`，不得把缺失价格渲染为 0.00。

### brentPricingLayer Futures Curve Structure 扩展 (v28.0M-77)

M-77 在 brentPricingLayer 新增 ICE Brent futures contract structure 读取。当前 ICE public product page 可验证 `contracts` 合约月份、`lastTrade` 与 `finalSettlement`，但未提供可稳定解析的官方 settlement/price ladder，因此本字段是 structure-only，不是 priced term structure。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `futuresCurve.source` | string | n/a | ICE public page | 固定为 `ICE:Brent-Crude-Futures-contract-data` |
| `futuresCurve.sourceUrl` | string | URL | ICE | `https://www.ice.com/products/219/Brent-Crude-Futures/data?marketId=6018430` |
| `futuresCurve.curveStatus` | enum | n/a | 管道 | `live_structure_only` \| `fallback_structure_only` \| `missing` |
| `futuresCurve.fetchedAt` | string \| null | ISO | 管道 | 本次公开页面读取时间 |
| `futuresCurve.contracts[]` | object[] | n/a | ICE HTML embedded contracts array | 前 12 个合约月份，每项含 `contract` / `lastTrade` / `finalSettlement` |
| `futuresCurve.limitationZh` | string | n/a | 固定 | 必须说明当前不是官方结算价期限结构 |

边界：

- 不得把 `futuresCurve` 写成 Platts Dated Brent 或正式 Dated Brent。
- 不得把 structure-only 合约月份列表渲染为价格曲线、backwardation/contango 结论或 Brent promotion 输入。
- 网络或解析失败必须降级为 `fallback_structure_only` 或 `missing`，不得把缺失价格渲染为 0。

### brentPricingLayer ICE Public Delayed Futures Price Curve 扩展 (v28.0M-82)

M-82 在 brentPricingLayer 新增 ICE product-guide `contract-data` public JSON 读取。该字段提供 ICE Brent futures 各合约的 delayed / last price、volume、last time 与 front/back 价差，用于前端审计显示；它不是 official ICE settlement curve、不是 Platts Dated Brent、不是正式 Dated Brent，也不是实物现货成交证据。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `iceFuturesPriceCurve.source` | string | n/a | ICE public contract-data | 固定为 `ICE:Brent-Crude-Futures-public-contract-data` |
| `iceFuturesPriceCurve.sourceUrl` | string | URL | ICE | `https://www.ice.com/products/219/Brent-Crude-Futures/data?marketId=6018430` |
| `iceFuturesPriceCurve.curveStatus` | enum | n/a | 管道 | `live_delayed_priced` \| `fallback_delayed_priced` \| `missing` |
| `iceFuturesPriceCurve.updatedAt` | string \| null | ISO | ICE `lastTime` | 最新成功合约报价时间 |
| `iceFuturesPriceCurve.frontPrice` | number \| null | $/bbl | ICE `lastPrice` | 第一个可用合约 delayed last price |
| `iceFuturesPriceCurve.backPrice` | number \| null | $/bbl | ICE `lastPrice` | 采样窗口最后一个可用合约 delayed last price |
| `iceFuturesPriceCurve.frontMinusBack` | number \| null | $/bbl | 派生 | frontPrice - backPrice |
| `iceFuturesPriceCurve.slopeRegime` | enum | n/a | 派生 | `backwardation` \| `contango` \| `flat` \| `未知` |
| `iceFuturesPriceCurve.contracts[]` | object[] | n/a | ICE public contract-data | 每项含 `marketId` / `contract` / `price` / `volume` / `updatedAt` / `changePct` |
| `iceFuturesPriceCurve.limitationZh` | string | n/a | 固定 | 必须说明当前只是 ICE public delayed last-price curve |

边界：

- 不得把 `iceFuturesPriceCurve` 写成 Platts Dated Brent、正式 Dated Brent 或 official ICE settlement curve。
- 不得让 `iceFuturesPriceCurve` 改变 `values.brent`、Brent promotion、scoring、decision、execution 或 position。
- ICE contract-data 返回 0、缺失价格或 Cloudflare HTML 时必须丢弃/降级，不得渲染为真实 0.00 价格。

### brentPricingLayer Futures Price Proxy 扩展 (v28.0M-78)

M-78 在 brentPricingLayer 新增 Yahoo `BZ` 月度 Brent futures priced proxy。该字段提供公开月度合约报价、front/back 价差与简单斜率标签，用于前端审计显示；它不是 ICE official settlement curve、Platts Dated Brent、正式 Dated Brent 或实物现货成交证据。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `futuresPriceCurve.source` | string | n/a | Yahoo Finance | 固定为 `Yahoo:BZ-monthly-futures` |
| `futuresPriceCurve.sourceUrl` | string \| null | URL | Yahoo | `https://finance.yahoo.com/quote/BZ=F` |
| `futuresPriceCurve.curveStatus` | enum | n/a | 管道 | `live_proxy_priced` \| `fallback_proxy_priced` \| `missing` |
| `futuresPriceCurve.updatedAt` | string \| null | ISO | Yahoo chart timestamp | 最新成功合约报价时间 |
| `futuresPriceCurve.frontPrice` | number \| null | $/bbl | Yahoo | 第一个可用月度合约价格 |
| `futuresPriceCurve.backPrice` | number \| null | $/bbl | Yahoo | 采样窗口最后一个可用月度合约价格 |
| `futuresPriceCurve.frontMinusBack` | number \| null | $/bbl | 派生 | frontPrice - backPrice |
| `futuresPriceCurve.slopeRegime` | enum | n/a | 派生 | `backwardation` \| `contango` \| `flat` \| `未知` |
| `futuresPriceCurve.contracts[]` | object[] | n/a | Yahoo monthly symbols | 每项含 `symbol` / `contractMonth` / `price` / `updatedAt` |
| `futuresPriceCurve.limitationZh` | string | n/a | 固定 | 必须说明当前只是公开 priced proxy |

边界：

- 不得把 `futuresPriceCurve` 写成 Platts Dated Brent、正式 Dated Brent 或 ICE official settlement curve。
- 不得让 `futuresPriceCurve` 改变 `values.brent`、Brent promotion、scoring、decision、execution 或 position。
- Yahoo chart 返回 0 或缺失价格时必须丢弃该点，不得渲染为真实 0.00 价格。

### brentPricingLayer Crack Spread 扩展 (v28.0M-49)

M-49 在 brentPricingLayer 新增柴油裂解价差字段，扩展能源链条下游证据。

字段 contract：

| 字段 | 类型 | 单位 | 来源 | 含义 |
|---|---|---|---|---|
| `ulsdPrice` | number \| null (optional) | $/gallon | FRED:DHOILNYH（日频） | NY Harbor ULSD 现货价（内部计算中间量）（v28.0M-49 起） |
| `ulsd4wChange` | number \| null (optional) | $/gallon | 派生 | ULSD 4 周变化（v28.0M-49 起） |
| `crackSpread` | number \| null (optional) | $/barrel | 派生 | ULSD × 42 - Brent，柴油炼制裂解价差（v28.0M-49 起） |
| `crackSpread4wChange` | number \| null (optional) | $/barrel | 派生 | Crack Spread 4 周变化（v28.0M-49 起） |
| `crackSpreadRegime` | string enum (optional) | n/a | 派生 | `供应紧张` \| `偏高` \| `正常` \| `需求疲软` \| `未知`（v28.0M-49 起） |
| `ulsdSourceStatus` | 'live'\|'fallback'\|'missing' | n/a | 管道 | DHOILNYH fetch 状态（v28.0M-49 起） |

边界：
- 本字段层不改变 `values.brent`、scoring、`decisionModel`、`executionLock`、`positionGuidance`
- 不等同于实物供应数据
- crackSpread 计算公式：`DHOILNYH × 42 − DCOILBRENTEU = $/barrel`
- 防御性检查：若计算结果 < -30 或 > 120，视为单位换算异常，crackSpread 设为 null
- crackSpread4wChange 为近似派生（基于 ULSD 4 周变化 × 42，未考虑 Brent 同步 4 周变化）
- DHOILNYH 为日度数据（EIA 工作日发布，T+1 滞后）
- crackSpread 用于 cross-validation `energy_shock` narrative 的条件分类

### oil-directional-pressure.json — Oil Directional Pressure (ODP) 独立文件 contract

ODP 是**独立数据文件** `data/oil-directional-pressure.json`(不在 `radar-data.json` 内),audit-only / display-only 能源专题。evidence + freshness + seasonality 自 PR1 起落地;**PR3 起 `signals` / `finalBias` / `interpretation` 由 classifier 模型填充**(见下「PR3 模型输出」),仍 display-only。

顶层:`schemaVersion` 必须为 `odp-1`;`module` 为 `oil-directional-pressure`;`boundary` 字符串声明 audit-only/display-only 且含「NOT in」scoring 路径;`builtAt` ISO;`ingestion` = `{mode:'A', provider:'EIA API v2', route:'/v2/seriesid/PET.<id>.W'}`。

`evidence`(12 项,每项带 freshness 四件套 `frequency`/`ageDays`/`maxAgeDays`/`sourceStatus`):
- 8 个 EIA(`crudeStocksExSpr`/`sprStocks`/`distillateStocks`/`gasolineStocks`/`refineryUtilization`/`refinerCrudeInputs`/`demandGasolineSupplied`/`demandDistillateSupplied`):`value`(number|null)、`unit` ∈ {`thousand barrels`,`thousand barrels per day`,`percent`}、`asOfDate`、`source` 以 `EIA:` 开头、`change1w/4w/13w`、`vs5yAvgPct`、`fiveYrRangePosition`、`historyWeeks`、`signalGroup`。
- 复用价格 3 项(`wtiPrice`/`brentPrice`/`crackSpread`):`unit` `$/bbl`、`source` 以 `radar-data:` 开头(复用,不重抓)。`wtiPrice` 优先复用 `radar-data:macroDrivers.inflationEnergy.wtiMarketProxy`(Yahoo `CL=F` WTI futures 快速市场代理,`maxAgeDays=3`),缺失或过期时回退 `radar-data:macroDrivers.inflationEnergy.wti`(FRED `DCOILWTICO` 官方 WTI spot,低噪声但可能滞后)。
- `curve`:`slopeRegime`、`frontMinusBack`(numeric,freshness 以此判定)、`confidence:'low'`、`limitationZh`、`source` 以 `radar-data:` 开头。
- **P9/P40a 证据分级 metadata**(每个 evidence entry 必须携带):`latencyTier` ∈ {`T1_daily_market_proxy`,`T2_weekly_official_anchor`}、`latencyTierZh`、`timelinessZh`、`sourceRole`、`directionalRole`、`directionalUse`、`calibrationNoteZh`。`directionalRole` ∈ {`core_physical_anchor`,`market_confirmation`,`global_slow_variable`,`high_frequency_watch`,`data_quality`}。当前 artifact 的 8 个 EIA 周度源均为 `T2_weekly_official_anchor` + `core_physical_anchor`;复用的 WTI / Brent / crack / curve 均为 `T1_daily_market_proxy` + `market_confirmation`。这些字段只服务证据时间节奏与前端判断链分层展示,不改变 `finalBias` / classifier / scoring / decision。

`seasonality`(仅 8 个 weekly EIA;missing series 不得携带):`weekOfYear`(1..53)、`seasonBucket` ∈ {`winter_heating`,`summer_driving`,`shoulder`}、`fiveYrSameWeekMean/Min/Max`、`sampleYears`(0..5)、`windowFallback` ∈ {`exact`,`±1week`}。

freshness 不变式:`value` 缺 → `missing`;present 且 `ageDays` 无 → `stale`;present 且 `ageDays > maxAgeDays` → `stale`;否则 `live`。

严格边界(同 brentPricingLayer / World Order overlay):不进 `values.*` / scoring / `decisionModel` / `executionLock` / `positionGuidance` / `displayInputsBaseline` / `effectiveDisplayInputs` / cross-validation;不并入 Global Risk Heatmap;缺数据不伪造、数据不足显式 `insufficient_data` 不硬判。校验 = `npm run check:oil-directional`(contract / freshness / seasonality / degradation / boundary / backtest / score / global-overlay replay / zh-copy);fetcher 零依赖(ADR-0013)。完整设计见 [`OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md`](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

**PR3 模型输出**(`signals` / `finalBias` / `interpretation`,display-only;classifier = `scripts/oil-directional/odp-classifier.mjs`):

- `finalBias` ∈ **8 枚举**(`FINAL_BIAS_VALUES`,classifier 单一来源):`strong_bullish` / `moderate_bullish` / `neutral_range` / `bearish` / `false_down_physical_stress` / `false_up_unconfirmed` / `product_crisis` / `insufficient_data`。**永不为 null**(build 总写一个判定,至少 `insufficient_data`)。
- `signals`(object | null):6 物理子信号(`inventoryDrawPressure` / `dieselProductStress` / `refineryConfirmation` / `sprBufferEffectiveness` / `demandDestructionRisk` / `futuresCurveConfirmation`)+ `priceContext`(`brentChangePct4w` number|null、`curveSlopeRegime` string|null、`crackChange4w`、`priceDirectionSource`)。**`signals` 为 null 当且仅当 `finalBias='insufficient_data'`**(数据不足→暂不判断)。
- `interpretation`(object,**非 null**):`physicalBias`、`finalBias`、`divergence` ∈ {`none`,`false_down_physical_stress`,`false_up_unconfirmed`}、`priceVsPhysical`、`drivers`(signal group 数组)、`confidence` ∈ {`low`,`moderate`,`high`}、`dataSufficiency` ∈ {`full`,`partial`,`insufficient`}、`note`(重申 audit-only)。
- **P6B `interpretation.globalOverlay`**(object|null):全球/月度慢变量确认层,读取 ODP build 当时的 `radar-data.macroDrivers.energyInventoryBalance` / `energySpareCapacity` / `energyTransport` 归一化上下文,用于解释 `finalBias` 的证据质量。字段:`status` ∈ {`active`,`unavailable`,`not_evaluated`};`effect` ∈ {`confirms_false_down`,`confirms_physical_tightness`,`caps_confidence_demand_watch`,`event_risk_watch`,`neutral`,`unavailable`,`insufficient_physical_data`};`supplyBuffer`、`inventoryBalance`、`demandState`、`transportRisk`;`confirmationCount`(0..3);`confidenceAdjustment` ∈ {`flat`,`up`,`up_with_demand_cap`,`down`};`confidence` ∈ {`low`,`moderate`,`high`};`drivers` / `reasons`;`sourceWindows`;`boundary`。它**不新增 finalBias 枚举、不覆盖周度物理链、不进入 scoring / decision / execution / position / Heatmap / cross-validation**;只能确认、降级保护或标注事件风险观察。PortWatch 分支仍为低置信 proxy,不得写成暗航行、封锁或实际油轮流量确认。
- **P41 `interpretation.attribution`**(object):ODP 方向归因与反证解释层,`schemaVersion="odp-attribution-1"`、`boundary` 必须声明 display-only / NOT in scoring paths。字段:`primaryThesis`、`supportEvidence[]`、`counterEvidence[]`、`confidenceCaps[]`、`viewChangeTriggers[]`;每个 item 仅允许定性 `role` / `label` / `stance` / `evidenceKeys[]` / `text`。它只解释现有 `finalBias` 为什么成立、哪些证据构成反证、置信度为什么被封顶、什么条件会改变判断;不得包含 score / weight / probability / decision / execution / position / actionQueue / triggerMonitor 等字段,不得改变 classifier、`finalBias`、scoring、decision、execution、Heatmap 或 cross-validation。

P42 新增 `check:oil-directional-attribution`:用 live artifact + `docs/fixtures/oil-directional/odp-attribution-fixtures.json` 离线回放强制 attribution 保持定性解释层。该 checker 校验 P41 schema、非空解释 lane、allowed role/evidence refs、无 score/weight/probability/directive keys、insufficient_data 不得让价格/新闻/卫星代理补位,并静态核对前端 attribution DOM/renderer marker。它不联网、不写 `data/*.json`,不接入 scoring / decision / execution / position / Heatmap / cross-validation。

P43 新增 `check:oil-directional-evidence-timing`:ODP 前端证据矩阵必须在证据列表前展示时效分层摘要,把 T2 官方周度锚、T1 日频市场代理、新闻/卫星高频观察层分开说明。该 checker 静态核对 DOM/CSS/renderer marker,并用 live ODP artifact 验证 8 个 T2 官方锚仍是 `core_physical_anchor`、至少 4 个 T1 市场代理仍是 `market_confirmation`;不得引入 timing/freshness/evidence score 或 weight。它只改变展示组织,不改变 `data/*.json`、classifier、`finalBias`、scoring、decision、execution、Heatmap 或 cross-validation。

P44 新增 `check:oil-directional-narrative-consistency`:ODP 标题、verdict、价格背离文案、`insufficient_data` 分支、新闻/卫星高频观察层和 attribution 文案必须围绕同一个 `finalBias` 自洽。该 checker 用 live ODP artifact + `docs/fixtures/oil-directional/odp-narrative-consistency-fixtures.json` 离线校验 `false_down_physical_stress`、`false_up_unconfirmed`、`strong_bullish`、`insufficient_data` 四类叙事不变量,并禁止断供/战争/封锁确认、交易动作词、概率/score/weight 等第二套方向评分 marker。它不联网、不写 `data/*.json`,不改 classifier、`finalBias`、scoring、decision、execution、Heatmap 或 cross-validation。

P45 新增 `check:oil-directional-reading-structure`:ODP 前端阅读路径固定为 `01 VERDICT` → `02 EVIDENCE CHAIN` → `03 COUNTERWEIGHT` → `04 证据矩阵与审计详情`,把结论、支撑链、反证/置信边界和折叠证据矩阵分层展示。该 checker 静态校验 DOM 顺序、ODP detail 默认折叠、关键 ID 保留、CSS 使用 DESIGN.md 字体/边框 token、frontend asset version 已 bump。它只改变展示组织,不改变 `data/*.json`、classifier、`finalBias`、scoring、decision、execution、Heatmap 或 cross-validation。

P46 新增 `check:oil-directional-responsive-readability`:ODP 前端在 760px 以下必须把方向结论、支撑链条、反证边界、证据时效摘要、证据矩阵改为单列阅读流;在 600px 以下必须把 meta、原因列表、能源补充 metrics 与核心资产行改为窄屏单列,并保持 ODP detail 默认折叠。该 checker 静态校验 ODP responsive CSS、asset bump、DESIGN.md token/no-shadow/no-radius 约束,并禁止 responsive/mobile/readability score 等第二套方向评分 marker。它只改变移动端展示密度与可读性,不改变 `data/*.json`、classifier、`finalBias`、scoring、decision、execution、Heatmap 或 cross-validation。

**物理>金融裁决**(grounded `OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md` §5):classifier 先出物理 bias(6 类),`finalizeBias()` 再叠**价格背离层**——价格表象与物理链背离时信物理:

- 油价跌 + 物理偏紧(库存 tight/drawAccel/extremeTight)+ backwardation + 柴油紧 → `false_down_physical_stress`;
- 油价涨 + 物理偏松(loose)+ contango + 柴油改善 → `false_up_unconfirmed`;
- 无背离 → `finalBias` = 物理 bias;**价格方向未知(`brentChangePct4w` null)→ 不产出 `false_*`**(fail-safe,物理 bias 站住)。

**预登记价格阈值**(`ODP_PRICE_THRESHOLDS`,`Object.freeze` locked,上线前锁定、零 cherry-tune;改判定须重登):

| 常量 | 值 | 含义 |
|---|---|---|
| `PRICE_DOWN_PCT` | −3 | Brent ~4 周 % 变动 ≤ → 「油价跌」 |
| `PRICE_UP_PCT` | +3 | ≥ → 「油价涨」 |

价格方向 = Brent ~4 周变动,从 committed `data/radar-history-full.json`(latest vs 最近 ~28 天前点,±10 天容差)零依赖派生;curve regime 复用 `radar-data` futuresPriceCurve。

**同周守卫**(live 路径,镜像 PR2 canonical-grid):`classifyAt` 按 `idxAtOrBefore` 取各 series,故 build 在调用前要求 **8 条 EIA 全 `live` 且 latest period 与 crude 同周**;否则 `finalBias='insufficient_data'`(不产出混周判定)。

**`dataSufficiency` 注**:枚举留 `full|partial|insufficient`,但**当前 PR3 live build 因同周守卫要求 8 条全 live,实际只产出 `full` 或 `insufficient` —— `partial` 暂不可达,保留作 forward-compatible / 未来放宽用,非当前语义承诺**。

PR3 校验新增 `check:oil-directional-score`(finalBias 枚举 + `interpretation` 镜像 + 背离一致性 + **replay `finalizeBias()` 比对** + `dataSufficiency` 枚举/双条件 + signals⟺insufficient);`contract` / `degradation` / `boundary` 从「signals 必须 null」放宽为校验填充后的 display-only 输出。

P6B 校验在 `check:oil-directional-contract` / `check:oil-directional-score` 中对可选 `interpretation.globalOverlay` 做枚举与 display-only boundary 校验;旧 committed ODP artifact 尚未重新 build 时该字段可缺失,前端仅做只读回填并标注来源,直到下一次 ODP build 写入 artifact。

P7 新增 `scripts/oil-directional/replay-global-overlay.mjs` + `check:oil-directional-global-overlay`:离线 replay `data/oil-directional-history.json` 的 PR2 预登记窗口,并用固定全球慢变量情景网格复核 P6B 阈值边界。该 checker 只验证 `evaluateGlobalOverlay()` 的不变量:不能写入或暴露 `finalBias` / `physicalBias`,不能 mutate `finalizeBias()` 结果,必须覆盖 unavailable / threshold-near-miss / confirms_false_down / demand cap / transport watch 分支。它不是油价收益回测,不联网,不写 `data/*.json`,不接入 scoring / decision / Heatmap。

P9 新增证据时点分级:ODP artifact 仍只含现有 12 条 evidence,但每条 evidence 都必须声明其时间节奏与校准角色。前端在 `#oil-directional-pressure` 折叠详情中按 `T1 日频市场代理` 与 `T2 周频官方锚` 分组显示,用于解释“快信号 vs 慢锚点”的权衡。P40a 在此基础上新增 `directionalRole`,把 evidence 的展示职责明确为 `core_physical_anchor` 或 `market_confirmation`,为后续 ODP Decision Ladder UI 提供只读分组依据;该字段不得在前端被解释为新模型权重、方向 call 或预测分数。P9/P40a 不接入新闻、FIRMS/VIIRS、Kpler/Vortexa 或任何新外部源;不新增方向枚举;不改变 `finalizeBias()`、`evaluateGlobalOverlay()`、Brent promotion、scoring、decision、execution、position、Heatmap 或 cross-validation。

P10 新增前端只读 `NEWS EVENT WATCH / 新闻事件观察`:该区不改变 `data/oil-directional-pressure.json` schema,不新增 ODP build 输入,只在浏览器端复用既有 `data/world-order-stress.json.externalSources.gdelt.summary` 与 `marketConfirmationInput.brent` 做广义新闻事件代理展示。它用于标注近实时事件背景与市场确认是否需要观察,不是 ODP 专用新闻 API、不是 FIRMS/VIIRS、不是 Kpler/Vortexa、不是船舶级 AIS 流向确认,也不得写成霍尔木兹通道中断、断供或油价方向的独立确认。它不进入 `finalBias` / classifier / `interpretation.globalOverlay` / `values.*` / scoring / `decisionModel` / `executionLock` / `positionGuidance` / `displayInputsBaseline` / `effectiveDisplayInputs` / Global Risk Heatmap / cross-validation。

P28 新增 manual/local `scripts/oil-directional/diagnose-oil-news-events.mjs` + `npm run diagnose:oil-news-events`。diagnosis artifact schema 为 `oil-news-events-diagnosis-p28`,默认 dry-run/no-network;只有显式 `--allow-network` 才访问 GDELT DOC 2.0 public search、Tavily Search API 与 Brave News Search API。Tavily/Brave key 可来自 `TAVILY_API_KEYS` / `BRAVE_API_KEYS` 或 ignored local key files under `manual-artifacts/oil-news/` / `manual-artifacts/local-secrets/`;artifact 只记录 key configured/sourceCount,不得记录 secret 值。输出只能写 ignored `manual-artifacts/oil-news/oil-news-events-diagnosis-latest.json`,包含 sourceResults、queryRuns、bucket summaries、topArticles、productionImpact false map、`promotionEligible=false` 与 `productionDisplayApproved=false`。该 helper 不新增 production schema、不写 `data/*.json` / `realtime/*.json`、不加 workflow、不修改 frontend,不得确认通道关闭、断供、油轮流向、炼厂事故、制裁影响或油价方向,也不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P29 新增独立生产只读 `data/oil-news-event-watch.json`:由 `Refresh Oil News Event Watch` workflow 调用 `npm run build:oil-news-event-watch`,读取 GitHub Secrets `TAVILY_API_KEYS` / `BRAVE_API_KEYS`(GDELT DOC public search 无 key),每 6 小时(第 37 分钟)或手动生成 sanitized compact artifact。artifact schema 为 `oil-news-event-watch-1`,只保存 sourceStatus、freshness、queryCoverage、aggregate、bucket summaries、redacted topArticles(domain/publishedAt/source/query/bucket ids only)、productionImpact false map、`promotionEligible=false`、`productionDisplayApproved=true`、boundary 与 limitationsZh;不得保存 API key、Authorization header、raw provider response、title、URL、snippet/body 或新闻正文。前端 ODP `NEWS EVENT WATCH` 只读消费该 JSON,并把 P10 World Order 泛新闻复用降级为缺文件 fallback;它不改变 `data/oil-directional-pressure.json` schema、不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。即使 signalState 为 `watch` 或 `elevated_manual_review`,也只能写成人工复核新闻事件代理,不得确认霍尔木兹关闭、航道中断、油轮流向、炼厂事故、断供、制裁影响或油价方向。

P30 新增 manual/local `scripts/oil-directional/review-oil-news-event-watch-samples.mjs` + `npm run review:oil-news-event-watch-samples`。该 helper 默认只读 git history 中最近触碰 `data/oil-news-event-watch.json` 的 sanitized production artifacts,也可读取 `--input` / `--input-dir` 中的 tracked fixtures 或 ignored manual artifacts;输出只能写 ignored `manual-artifacts/oil-news/oil-news-event-watch-samples-review-latest.json`。review artifact schema 为 `oil-news-event-watch-samples-review-p30`,用于比较多轮 sourceHealth、article-count range、bucketStability、topDomainFrequency、titleRisk 与 calibrationDecision,固定 `promotionEligible=false` 与 productionImpact false map。P30 不新增 production schema、不写 `data/*.json` / `realtime/*.json`、不改 frontend、不改变 P29 workflow、不显示 headline,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。若 titleRisk 出现 high-claim headline,结论必须保持 headline display not ready,不得把新闻标题写成霍尔木兹关闭、断供、油轮流向、炼厂事故、制裁影响或油价方向确认。

P31 扩展 `data/oil-news-event-watch.json` production schema:新增 `titleRisk` 与 `headlineDisplayReadiness`。`titleRisk.ruleVersion` 固定为 `oil-news-title-risk-p31`,记录 `evaluatedArticleCount`、`highClaimTitleCount`、`highClaimDomainCount`、`highClaimDomains`、`highClaimTerms` 与 `directHeadlineDisplayAllowed=false`;它只基于 build 内存中的 transient article title 做高主张标题风险计数,生产 JSON 只保存聚合结果,不得保存 title 或 URL。`headlineDisplayReadiness.displayHeadlinesApproved` 必须为 `false`;若 `highClaimTitleCount>0`,state 必须为 `not_ready_high_claim_title_noise`。`check:oil-news-event-watch` 必须拒绝 `displayHeadlinesApproved=true`、`directHeadlineDisplayAllowed=true` 或任何生产 article `title` / `url` 字段。P31 不新增抓取源、不修改 frontend、不改变 P29 workflow 节奏、不把标题展示批准为生产功能,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P32 前端只读消费 P31 的 `titleRisk` / `headlineDisplayReadiness` 聚合字段,在 ODP `NEWS EVENT WATCH` 中展示标题闸门与标题风险计数。该展示只能使用 readiness state、high-claim count、evaluated count、source-domain count 与"不展示标题原文"提示;不得读取或渲染 `topArticles` 标题列表。`check:oil-directional-zh-copy` 必须阻止 `renderOilDirectional.js` 引用 `topArticles`,并要求保留 headline readiness / title-risk 聚合 guard copy。P32 不改变 production artifact schema、不写 `data/*.json` / `realtime/*.json`、不新增抓取源、不改变 P29 workflow,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P33 前端只读消费 P29 artifact 既有 `sourceStatus` / `queryCoverage` / `aggregate.liveSourceCount`,在 ODP `NEWS EVENT WATCH` 中展示 `来源健康` 聚合文案:三源可用性、查询成功率、降级来源和失败关闭语义。该展示不得增加 artifact 字段,不得读取或渲染 `topArticles`,不得把 GDELT/Tavily/Brave 单一路径新闻报道写成事件确认;legacy World Order GDELT fallback 必须标明专用三源未接入。`check:oil-directional-zh-copy` 必须要求 source-health/fallback copy 保留"失败关闭"与"不把单一路径报道写成确认事件"边界。P33 不写 `data/*.json` / `realtime/*.json`、不新增抓取源、不改变 P29 workflow,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P34 新增 manual/local `scripts/oil-directional/review-oil-news-source-health-samples.mjs` + `npm run review:oil-news-source-health-samples`。该 helper 默认只读 git history 中最近触碰 `data/oil-news-event-watch.json` 的 sanitized production artifacts,也可读取 `--input` / `--input-dir` 中的 tracked fixtures 或 ignored manual artifacts;输出只能写 ignored `manual-artifacts/oil-news/oil-news-source-health-samples-review-latest.json`。review artifact schema 为 `oil-news-source-health-samples-review-p34`,用于复核多轮 `sourceStatus`、query success-rate range、per-source live/partial/error 分布、GDELT backup instability、Tavily/Brave cross-check readiness、fail-closed copy readiness 与 headline-display guard 状态;固定 `promotionEligible=false`、`productionDisplayApproved=false` 与 productionImpact false map,并且不在输出中保存 article title 字符串。P34 不新增 production schema、不写 `data/*.json` / `realtime/*.json`、不改 frontend、不改变 P29 workflow,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P52 新增 manual/local `scripts/oil-directional/review-oil-news-claim-ledger.mjs` + `npm run review:oil-news-claim-ledger`。该 helper 默认只读 git history 中最近触碰 `data/oil-news-event-watch.json` 的 sanitized production artifacts,也可读取 `--input` / `--input-dir` 中的 tracked fixtures 或 ignored manual artifacts;输出只能写 ignored `manual-artifacts/oil-news/oil-news-claim-ledger-latest.json`。review artifact schema 为 `oil-news-claim-ledger-p52`,用于把 compact title 内部分类为 `risk_escalation` / `risk_deescalation` / `mixed_or_contested` / `market_reaction_only` / `unclear_or_high_claim`,并按 `eventType`、`claimAxis`、`sourceTier`、`contradiction.state` 汇总。输出必须不保存原始 title 或 URL,只能保存 `titleHash`、domain、sourceTier、eventType、claimAxis、claimPolarity、trigger-term classes、bucket/query ids、`claimAxisCounts` / `axisCounts` / `axisSplit` 等人工复核字段。`axisSplit=security_risk_vs_supply_flow_split` 只表示 transport_security 与 supply_flow 两个命题轴可分离审阅,不得被解释为事件确认、路线级运费确认或方向预测。P52 不新增 production schema、不写 `data/*.json` / `realtime/*.json`、不改 frontend、不改变 P29 workflow、不批准 headline display,不得确认霍尔木兹关闭/重开、航道中断、断供、油轮流向、炼厂事故、制裁影响或油价方向,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P53 扩展 `data/oil-news-event-watch.json` production schema:新增 `claimPolarity` 聚合字段。`claimPolarity.ruleVersion` 固定为 `oil-news-claim-polarity-p53`,只从 committed compact article metadata 内部派生 `polarityCounts`、`eventTypeCounts`、`sourceTierCounts` 与 `contradiction.state`;允许主张枚举为 `risk_escalation` / `risk_deescalation` / `mixed_or_contested` / `market_reaction_only` / `unclear_or_high_claim`,允许状态枚举为 `mixed_claims` / `risk_escalation_dominant` / `risk_deescalation_dominant` / `no_directional_claim_dominance`。该字段必须 `displayMode=aggregate_only_no_headlines`、`directHeadlineDisplayAllowed=false`、`originalHeadlineDisplayAllowed=false`,且不得包含 `title`、`url`、`titleHash`、snippet/body/rawResponse。前端 ODP `NEWS EVENT WATCH` 只读展示该聚合计数,不得读取或渲染 `topArticles`,不得把主张聚合写成霍尔木兹关闭/重开、断供、油轮流向、炼厂事故、制裁影响或油价方向确认。P53 不新增抓取源、不改变 workflow cadence,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P54 新增 ODP 前端 `CROSS-CONFIRMATION / 交叉确认` display-only 组,只读比较四个既有输入:ODP/EIA 周度物理锚(`data/oil-directional-pressure.json`)、Worker/World Order 市场确认输入(`marketConfirmationInput`)、Oil News `claimPolarity` 聚合与 Oil Thermal facility baseline 聚合。该组不新增 production JSON 字段、不写 `data/*.json`、不读取新闻 `topArticles`,只在页面上说明新闻、市场、卫星/设施与 EIA 是否同向。输出不得改变 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation;不得把单一新闻、单一热异常或单一市场价格写成霍尔木兹关闭、断供、封锁、炼厂事故、制裁影响或油价方向确认。

P-score-35 新增 manual/local `scripts/review-transport-shock-confirmation-factor-high-frequency-confirmation.mjs` + `npm run review:transport-shock-confirmation-factor-high-frequency-confirmation`。review artifact schema 为 `transport-shock-confirmation-factor-high-frequency-confirmation-v1`,默认读取 ignored `manual-artifacts/oil-news/oil-news-claim-ledger-latest.json`、可选 ignored `manual-artifacts/transport-shock-confirmation-factor/news-manual-gate-latest.json` 与 production `data/oil-thermal-watch.json`,也可读取 tracked fixtures 或 ignored thermal probe artifact;输出只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/high-frequency-confirmation-latest.json`。字段必须包含 `newsRepeatedElevatedObservation`、`newsManualReviewRequired`、`thermalRepeatedObservation`、`thermalElevatedRepeatedObservation`,并保持 `eligibleForMainScore=false`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`frontendDisplayApproved=false`。news manual gate 只能清理新闻人工复核 blocker,不能替代热异常/设施确认。`partial_progress_keep_display_only` 只代表高频复核进度,不得写成断供、设施事故、封锁、霍尔木兹中断或油价方向确认,不得接入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P-score-36 新增 manual/local `scripts/review-transport-shock-confirmation-factor-news-manual-gate.mjs` + `npm run review:transport-shock-confirmation-factor-news-manual-gate`。review artifact schema 为 `transport-shock-confirmation-factor-news-manual-gate-v1`,默认读取 ignored `manual-artifacts/oil-news/oil-news-claim-ledger-latest.json`,也可读取 tracked fixtures;输出只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/news-manual-gate-latest.json`。字段必须包含 `gateDecision`、`manualReviewBlockers`、`manualReviewRequired`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`frontendDisplayApproved=false`、`eligibleForMainScore=false`。`news_manual_gate_blocked_keep_manual_review` 是当前预期状态之一;未来 `news_manual_gate_clear_for_cross_confirmation_review_no_score_write` 也只允许 separate cross-confirmation review,不得接 production write、frontend write、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-41 新增 manual/local `scripts/review-transport-shock-confirmation-factor-news-operator-review.mjs` + `npm run review:transport-shock-confirmation-factor-news-operator-review`。review artifact schema 为 `transport-shock-confirmation-factor-news-operator-review-v1`,默认读取 ignored `manual-artifacts/oil-news/oil-news-claim-ledger-refresh-review.json`,也可读取 tracked fixtures;输出只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/news-operator-review-latest.json`。字段必须包含 `reviewerType=codex_operator_delegate`、`reviewFindings.approvedForCrossConfirmation`、`mixedClaimsDisposition`、`lowConfidenceHighClaimsDisposition`、`evidence.axisSplit`、`approvals.scoreWriteApproved=false`、`approvals.productionWriteApproved=false`、`approvals.eligibleForMainScore=false`。`operator_review_clear_for_cross_confirmation_no_score_write` 优先以 claim-ledger `axisSplit=security_risk_vs_supply_flow_split` 作为 mixed claims 复核证据,只允许 `news_manual_gate` 把 mixed/source-tier blockers 标记为 operator-reviewed,不得接 production write、frontend write、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-42 新增 manual/local `scripts/monitor-transport-shock-confirmation-factor-news-operator-review.mjs` + `npm run monitor:transport-shock-confirmation-factor-news-operator-review`。monitor artifact schema 为 `transport-shock-news-operator-review-monitor-p42`,默认重建 ignored Oil News claim-ledger refresh review,再运行 operator review,最终只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/news-operator-review-monitor-latest.json`。字段必须包含 compact `claimLedger`、`operatorReview`、`newsManualGateHint.freshness`、`productionWriteApproved=false`、`scoreWriteApproved=false`。freshness 从 claim-ledger `lastSampleAt` 派生,超过 48 小时必须给出 `news_operator_review_expired_re_review_required` blocker。`news_operator_review_still_clear_for_cross_confirmation_no_score_write` 不是生产确认,只表示新闻人工复核状态仍适合进入 cross-confirmation review;不得接 production write、frontend write、workflow、Worker、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-37/P-score-39/P-score-40 新增/扩展 manual/local `scripts/review-transport-shock-confirmation-factor-cross-confirmation.mjs` + `npm run review:transport-shock-confirmation-factor-cross-confirmation`。review artifact schema 为 `transport-shock-confirmation-factor-cross-confirmation-v1`,默认读取 production `data/radar-data.json`、ignored `manual-artifacts/transport-shock-confirmation-factor/news-manual-gate-latest.json`、ignored `manual-artifacts/transport-shock-confirmation-factor/high-frequency-confirmation-latest.json`、ignored `manual-artifacts/transport-shock-confirmation-factor/market-confirmation-display-projection-latest.json`、ignored `manual-artifacts/transport-shock-confirmation-factor/portwatch-freshness-latest.json` 与 production `data/oil-directional-pressure.json`,也可读取 tracked fixtures;输出只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/cross-confirmation-latest.json`。字段必须包含 `crossConfirmationReady`、`summary.hardBlockerIds`、`rows`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`frontendDisplayApproved=false`、`eligibleForMainScore=false`。manual/display-only market projection ready 只能让 `market_confirmation` row supporting pass,PortWatch freshness probe ready 只能让 `portwatch_physical_proxy_freshness` row pass,不得写 production `marketConfirmation` 或 score。`cross_confirmation_blocked_keep_display_only` / `keep_transport_shock_candidate_display_only_until_blockers_clear` 是当前预期状态之一;未来 `cross_confirmation_candidate_ready_no_score_write` 也只允许 separate score-design review,不得接 production write、frontend write、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-38 新增 manual/local `scripts/review-transport-shock-confirmation-factor-score-integration-preflight.mjs` + `npm run review:transport-shock-confirmation-factor-score-integration-preflight`。review artifact schema 为 `transport-shock-confirmation-factor-score-integration-preflight-v1`,默认读取 ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-latest.json`、ignored `manual-artifacts/transport-shock-confirmation-factor/cross-confirmation-latest.json` 与可选 ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-bridge-preflight-latest.json`,也可读取 tracked fixtures;输出只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-latest.json`。字段必须包含 `scoreIntegrationPreflightPassed`、`summary.blockers`、`summary.crossConfirmationHardBlockerIds`、`summary.reclassifiedCrossConfirmationHardBlockerIds`、`summary.remainingCrossConfirmationHardBlockerIds`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`frontendDisplayApproved=false`、`eligibleForMainScore=false`。只有 cross-confirmation 仅剩 `route_freight_confirmation` 且 bridge preflight 明确 `bridgePreflightPassed=true` / `remainingHardBlockerIds=[]` 时,才允许 `score_integration_preflight_ready_for_design_review_no_score_write`;其他 blocker 仍必须输出 `score_integration_preflight_blocked_keep_no_score_write` / `clear_cross_confirmation_blockers_before_score_design`。未来 ready 状态也只允许 separate reviewed score-design PR,不得接 production write、frontend write、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-43 新增 manual/local score-integration preflight monitor:`scripts/monitor-transport-shock-confirmation-factor-score-integration-preflight.mjs` + `npm run monitor:transport-shock-confirmation-factor-score-integration-preflight`。monitor artifact schema 为 `transport-shock-score-integration-preflight-monitor-p43`,默认读取 ignored `score-integration-preflight` 依赖输入并运行 P-score-38 preflight,最终只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-monitor-latest.json`。字段必须包含 `preflight` compact 摘要、`hardBlockers[]`、`codeOnlyCompletion`、`manualAction`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`eligibleForMainScore=false`。`blocked_on_external_evidence_or_source_rights` 表示仍存在不能靠 code-only change 清理的 blocker;若 P-score-38 因 P-score-47 bridge + high-frequency confirmation 通过,monitor 也只能提示另开 reviewed score-design PR,仍不得接 production write、frontend write、workflow、Worker、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-44 新增 Transport Shock free freight alternative source-review。fixture schema 为 `transport-shock-free-freight-alternative-source-review-v1`,状态为 `source_review_free_alternatives_no_route_freight_confirmation`。该契约只允许把 IMF PortWatch、StockQ BDTI/BCTI、NOAA MarineCadastre AIS、Suez/Panama 官方统计、EIA/IEA chokepoint exposure、CME/ICE TD3C link/manual reference、Solactive wet freight index 与 Baltic daily TD/TC route assessments 分类为 free proxy / static weight / link-only / blocked source families。字段必须包含 `approvedFuturePath.pathKey=free_transport_pressure_proxy`、`approvedFuturePath.clearsRouteFreightConfirmation=false`、`currentProductionState.routeFreightConfirmation=not_connected`、`approvalState.unauthorizedScrapingApproved=false`、`approvalState.scoreWriteApproved=false`。它不得批准 unauthorized scraping、live fetch、production write、frontend、workflow、Worker、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-45 新增 Transport Shock satellite handling policy。fixture schema 为 `transport-shock-satellite-handling-policy-v1`,状态为 `policy_review_no_thermal_blocker_bypass`。该契约只规定 Oil Thermal / FIRMS 卫星热异常在 repeated elevated observation 不足时的处理边界:字段必须包含 `currentProductionState.highFrequencyPhysicalConfirmation=blocked`、`currentProductionState.thermalBlockerBypassApproved=false`、`currentProductionState.routeFreightConfirmation=not_connected`、`currentProductionState.eligibleForMainScore=false`、`baselineQualityWindows` 四档窗口、`thermalSupportRequirements.repeatedObservationRequired=true`、`thermalSupportRequirements.elevatedRepeatedObservationRequired=true`、`thermalSupportRequirements.clearsHighFrequencyPhysicalByItself=false`、`noDetectionPolicy.classification=negative_evidence_not_absence_proof`、`bypassPolicy.thermalBlockerBypassApprovedByThisPolicy=false`。所有 approvalState 必须为 false;它不得降低阈值、不得批准 thermal blocker bypass、production write、frontend、workflow、Worker、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-46 新增 Transport Shock free-proxy score bridge review。fixture schema 为 `transport-shock-free-proxy-score-bridge-review-v1`,状态为 `bridge_review_route_freight_reclassified_high_frequency_still_blocked_no_score_write`。该契约只允许把 `route_freight_confirmation` 在后续 free-proxy low-weight artifact preflight 中归类为 `not_applicable_to_free_proxy_low_weight_path`,但字段必须保持 `currentProductionState.routeFreightConfirmation=not_connected`、`bridgeDecision.routeFreightConfirmationCleared=false`、`bridgeDecision.trueRouteLevelTankerFreightStillUnavailable=true`、`bridgeDecision.maxFutureMainScoreContributionPct<=3`。`hardBlockersThatRemain` 必须包含 `high_frequency_physical_confirmation` 且 `clearedByThisBridge=false`;所有 approvalState 必须为 false。它不得批准 route freight confirmation、thermal blocker bypass、production write、frontend、workflow、Worker、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-47 新增 manual/local `scripts/review-transport-shock-free-proxy-bridge-preflight.mjs` + `npm run review:transport-shock-free-proxy-bridge-preflight`。review artifact schema 为 `transport-shock-free-proxy-bridge-preflight-v1`,只允许读取 P46 bridge-review、free-proxy readiness gate 与 cross-confirmation artifacts,默认输出 ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-bridge-preflight-latest.json`。输出必须包含 `routeFreightConfirmation=not_connected`、`routeFreightConfirmationCleared=false`、`freeProxyRouteFreightRequirement=not_applicable_to_free_proxy_low_weight_path`、`scoreWriteApproved=false`、`eligibleForMainScore=false`。当 route freight 被重分类但 `high_frequency_physical_confirmation` 仍存在时,状态必须是 `free_proxy_bridge_preflight_blocked_on_high_frequency_no_score_write`;它不得写 production data、frontend、workflow、Worker、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-48 新增 manual/local `scripts/review-transport-shock-confirmation-factor-free-proxy-score-write-design.mjs` + `npm run review:transport-shock-confirmation-factor-free-proxy-score-write-design`。review artifact schema 为 `transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1`,只允许读取 P-score-20 candidate 与 P-score-21 replay artifact/fixture,默认输出 ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-write-design-review-latest.json`。字段必须包含 `scoreWriteDesignReady`、`candidateScoreContributionPct`、`maxFutureMainScoreContributionPct`、`historicalBacktestPerformed=false`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`scoreIntegrationApproved=false`、`eligibleForMainScore=false`。`score_write_design_review_ready_no_production_write` 只代表 3% cap 与 replay controls 设计自洽,不得接 production write、frontend write、workflow、Worker、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-49 新增 manual/local `scripts/review-transport-shock-confirmation-factor-runtime-score-integration-design.mjs` + `npm run review:transport-shock-confirmation-factor-runtime-score-integration-design`。review artifact schema 为 `transport-shock-confirmation-factor-runtime-score-integration-design-review-v1`,只允许读取 P-score-48 score-write design review artifact/fixture,默认输出 ignored `manual-artifacts/transport-shock-confirmation-factor/runtime-score-integration-design-review-latest.json`。字段必须包含 `runtimeScoreIntegrationDesignReady`、`futureRuntimeSourcePath=macroDrivers.energyTransport.transportShockCandidate`、`futureRuntimeMode=disabled_until_separate_reviewed_score_pr`、`runtimeGuardsRequired[]`、`runtimeIntegrationApproved=false`、`scoreWriteApproved=false`、`productionWriteApproved=false`、`eligibleForMainScore=false`。`runtime_score_integration_design_ready_no_production_write` 只代表未来 runtime score integration 设计清单已成形;不得接 production write、frontend write、workflow、Worker、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-50 新增 owner-approved runtime scoring migration authorization fixture 与 checker。fixture schema 为 `transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1`,状态为 `runtime_scoring_migration_authorized_capped_free_proxy`,字段必须包含 `authorizedBy=owner_thread_approval`、`approvedRuntimeSourcePath=macroDrivers.energyTransport.transportShockCandidate`、`approvedScoreImpact.maxContributionPct=3`、`approvedScoreImpact.defaultContributionPct=0`、`requiredRuntimeOutputs[]` 包含 `transportShockScoringImpact` 与 `transportShockScoringImpact.runtimeScoringAuthorized`。P-score-51 后该 checker 改为验证运行时实现只落在授权范围内:不得连接 routeFreightConfirmation/marketConfirmation,不得改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。P-score-1 source-to-score contract fixture 也必须记录 `subsequentRuntimeScoringAuthorization.runtimeScoringAuthorized=true`,用于消除早期 contract-only 文档与后续 runtime 授权之间的状态漂移。

P-score-51 新增 runtime scoring migration scoped implementation。生产 payload 可新增顶层 `transportShockScoringImpact` (`transport-shock-scoring-impact-v1`):字段必须包含 `sourcePath=macroDrivers.energyTransport.transportShockCandidate`、`runtimeScoringAuthorized=true`、`applied`、`contributionPct`、`maxContributionPct=3`、`direction=transport_shock_pressure_only`、`scoreBeforeTransport`、`scoreAfterTransport`、`guards`。只有 PortWatch source live、latestAgeDays<=7、candidate `eligibleForMainScore=true`、status 为 watch/elevated_watch、candidateScore>0 时才允许正贡献;贡献采用 1/2/3 档并硬上限 +3,默认 fail-closed 0,不得降低主分。`transportShockCandidate` 仍保持 `candidateOnly=true`、`auditOnly=true`、`routeFreightConfirmation=not_connected`、`marketConfirmation=not_connected`;当且仅当 live pressure candidate 可入分时,其 boundary 可显示 affectsScoring/affectsDecisionModel/affectsExecutionLock/affectsPositionGuidance=true,其余 values、Brent promotion、World Order weights、Global Risk Heatmap、cross-validation 边界必须 false。

P-score-52 新增 frontend score-impact display refinement。C1 `Transport Shock / 运输冲击确认因子` 卡新增 `主分影响` 行,只读顶层 `transportShockScoringImpact` 并显示当前 `0/+3` 或 `+1/+2/+3` low-weight contribution;`入分闸门` 与 `阻塞项` 行也改为读取 `transportShockScoringImpact.reason`。该 refinement 不新增生产字段、不写 production data、不读取 manual artifacts、不改变 runtime scoring logic、不连接 route/market confirmation、不改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-53 新增 frontend score attribution display。`#homepage-risk-engines` 新增 `Transport Shock 主分归因` 区块,复用 `transportShockScoringImpact` 的 capped contribution、reason、scoreBeforeTransport 与 scoreAfterTransport,并新增 `score-attribution-applied-v1` fixture 覆盖非零 +3 展示路径。该 refinement 不新增生产字段、不写 production data、不读取 manual artifacts、不改变 runtime scoring logic、不连接 route/market confirmation、不改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-54 新增 score-impact history attribution monitor。`monitor:transport-shock-confirmation-factor-score-impact-history` 从 git history 读取 committed `data/radar-data.json` 的 `transportShockScoringImpact`,输出最近样本趋势、当前 0/+3 或非零 contribution、reason counts 与 score path,用于解释为什么 Transport Shock 当前没有贡献或未来何时触发低权重贡献。该 monitor 只写 ignored artifact / GitHub Summary,不新增生产字段、不写 production data、不读取 manual artifacts、不改变 runtime scoring logic、不连接 route/market confirmation、不改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-55 新增 runtime score policy replay review。`transport-shock-confirmation-factor-runtime-score-policy-review-v1` / `review:transport-shock-confirmation-factor-runtime-score-policy` 只读 production `data/radar-data.json` 或 tracked fixture,独立复放现有 `transportShockScoringImpact` 政策:contract `transport-shock-scoring-impact-v1`,sourcePath `macroDrivers.energyTransport.transportShockCandidate`,hard cap +3,stale window 7 天,pressure-only,threshold 75/60/50 -> +3/+2/+1,其余原因 fail-closed 0。review 输出 ignored `manual-artifacts/transport-shock-confirmation-factor/runtime-score-policy-review-latest.json`,字段包含 `scorePolicyReviewPassed`、`policy`、`currentObservation`、`approvals.*=false` 与 `productionImpact.modifiesRuntimeScoring=false`;它不新增生产字段、不写 production data、不改变 runtime scoring logic、不连接 routeFreightConfirmation/marketConfirmation、不改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-56 新增 runtime score policy drift monitor。`transport-shock-runtime-score-policy-monitor-p56` / `monitor:transport-shock-confirmation-factor-runtime-score-policy` 调用 P-score-55 review 的 `--no-output --json` 路径,输出当前 policy 状态、current contribution、expected reason、manualAction 与 productionImpact 到 ignored `manual-artifacts/transport-shock-confirmation-factor/runtime-score-policy-monitor-latest.json`。状态仅允许 `zero_contribution_observed`、`nonzero_contribution_observed`、`policy_drift_detected` 或 schema mismatch;只有 policy drift 才让 monitor 失败,非零贡献只提示人工复核。该 monitor 不新增生产字段、不写 production data、不改变 runtime scoring logic、不连接 routeFreightConfirmation/marketConfirmation、不改变 ODP `finalBias`、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-57 新增 `transport-shock-path-boundary-review-v1` / `review:transport-shock-path-boundaries`。该 read-only review 调用 production-refresh、runtime-score-policy 与 score-readiness 三个既有 monitor 的 `--dry-run --no-output --json` 路径,把 `paths.cappedFreeProxyRuntime` 与 `paths.routeMarketConfirmedReadiness` 分开报告。`interpretation=two_distinct_approval_layers_no_contradiction` 表示既有 capped free-proxy runtime path 可以 active 且受 `+3` hard cap 约束,同时更高置信 route/market-confirmed path 仍可因 `not_connected` / hard blockers 保持 blocked；不得用后者的 blocked 状态否定已批准的 capped policy,也不得用前者 active 状态绕过后者的 separate review。输出只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/path-boundary-review-latest.json`,所有 production write、score expansion、route/market connection、frontend、Worker、workflow 与 ODP/Brent/Heatmap/cross-validation/Bubble Watch 影响标志必须为 false。

P-score-40 新增 manual/local `scripts/review-transport-shock-confirmation-factor-portwatch-freshness.mjs` + `npm run review:transport-shock-confirmation-factor-portwatch-freshness`。review artifact schema 为 `transport-shock-confirmation-factor-portwatch-freshness-v1`,默认 live 读取 IMF PortWatch ArcGIS `Daily_Chokepoints_Data`,也可读取 `docs/fixtures/transport-shock-confirmation-factor/` 或 ignored manual payload;输出只能写 ignored `manual-artifacts/transport-shock-confirmation-factor/portwatch-freshness-latest.json`。字段必须包含 `supportsPortWatchFreshnessPass`、`missingCoreKeys`、`staleCoreKeys`、`preflightImpact.canClearHardBlockerId`、`preflightImpact.scoreWriteApproved=false`、`preflightImpact.eligibleForMainScore=false`。`portwatch_freshness_probe_fresh_no_production_write` 只说明可尝试清理 `portwatch_physical_proxy_freshness` blocker,不得清理路线级运费、新闻人工闸门或高频物理确认 blocker;不得接 production write、frontend write、score write、ODP `finalBias`、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P11 新增前端只读 `SATELLITE THERMAL WATCH / 卫星热异常观察`:该区不改变任何 JSON schema,不新增 ODP build 输入,不读取浏览器外部源,只显示 NASA FIRMS / VIIRS NRT 作为候选高频物理信号且当前待接入。正式接入前必须另开 reviewed PR 定义设施坐标白名单、MAP_KEY secret 边界、查询预算、FRP/置信度/昼夜/重复观测阈值、历史基线和 fail-closed fallback。P11 不新增 FIRMS API call、不写 `data/*.json`、不接 scoring / decision / execution / position / `values.*` / Brent promotion / ODP `finalBias` / Global Risk Heatmap / cross-validation,也不得写成炼厂事故确认、供应中断确认或油价预测。

P12 新增 `scripts/oil-directional/diagnose-firms-thermal.mjs` + `npm run diagnose:firms-thermal`,仅供 operator 本地/manual bounded-area FIRMS smoke/diagnostic。它读取环境变量 `FIRMS_MAP_KEY`,默认 `VIIRS_SNPP_NRT` / `47,23,58,31` / 1 day,只写 ignored `manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json`。header-only CSV 是有效诊断结果(`firms-api-ok-no-detections-in-bbox`)。P12 不新增 schema、不写 `data/*.json` / `realtime/*.json`、不加 workflow、不提交 MAP_KEY 或设施坐标、不改变前端,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P13 扩展同一 manual diagnostic 支持设施级批量模式:`--facilities <ignored-json>` + `--sources <comma-list>`。设施清单必须由 operator 放在 ignored `manual-artifacts/` 路径,每个设施使用小 bbox(max span 1.5°),单轮上限 50 facilities / 150 FIRMS requests;仓库只提交 `docs/fixtures/oil-thermal/facilities.example.json` schema 示例,不是生产白名单。批量 artifact schema 为 `firms-facility-thermal-diagnosis-1`,包含 per-source summary、facility aggregate、`sourceAgreement` 与 heuristic-only `anomalyLevel`;这些字段仍只供人工 source review,不得进入 ODP build / schema / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation,也不得写成事故、停产、断供或油价预测确认。

P14 仅新增本地 secret 读取便利性:`diagnose:firms-thermal` 先读 `FIRMS_MAP_KEY`,若缺失则读 ignored `manual-artifacts/oil-thermal/firms-map-key.txt` 或 `--map-key-file <path>`。artifact / console 只可记录 `mapKeySource`,不得记录 MAP_KEY 值。P14 不新增 workflow、不读取 GitHub secret、不提交 key、不改变任何 production schema 或 ODP 输出。

P15 仅新增 manual diagnostic progress logging:`diagnose:firms-thermal` 非 dry-run 默认向 stderr 输出设施/source 请求进度与 row count,最终 JSON 仍在 stdout;`--quiet` 可关闭。progress log 不得包含 MAP_KEY 或 raw URL,不得改变 artifact schema、production data、ODP schema 或任何 scoring/decision 路径。

P16 仅新增 manual facility-list bootstrap / strict validation:`npm run init:firms-facilities` 创建或校验 ignored `manual-artifacts/oil-thermal/facilities.json`,模板来自 `docs/fixtures/oil-thermal/facilities.example.json`;已有文件不得被覆盖。`--strict-facilities` 要求 facility `region` / `assetType` / `sourceNote`,并继续执行小 bbox、重复 id、请求预算等本地校验。P16 不新增 production schema、不提交真实设施坐标、不写 `data/*.json` / `realtime/*.json`、不加 workflow、不读取 GitHub secret,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P17 仅新增 manual diagnostic artifact review:`scripts/oil-directional/review-firms-thermal-diagnosis.mjs` + `npm run review:firms-thermal`,默认读取 ignored FIRMS diagnostic artifact,可写 ignored review artifact。review schema 为 `firms-thermal-review-p17`,固定 `promotionEligible=false`,只检查 schema / freshness / FIRMS URL redaction / manual boundary / example facility rows / metadata / detection review needs;不读取 MAP_KEY、不访问网络、不写 production data。`check:firms-thermal-review` 使用 `docs/fixtures/oil-thermal/firms-facility-diagnosis.example.json` 离线守门,并已加入 `check:oil-directional` suite。P17 不新增 ODP production schema、不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P18 仅新增 manual facility-list coverage review:`scripts/oil-directional/review-firms-facilities.mjs` + `npm run review:firms-facilities`,默认读取 ignored facility list,可写 ignored review artifact。review schema 为 `firms-facilities-review-p18`,固定 `promotionEligible=false`,只检查设施清单覆盖质量、metadata、bbox 小框约束、请求预算、example rows 与可选 required region coverage;不读取 MAP_KEY、不访问网络、不写 production data。`check:firms-facilities-review` 使用 `docs/fixtures/oil-thermal/facilities.example.json` 离线守门,并已加入 `check:oil-directional` suite。P18 不新增 ODP production schema、不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P19 仅新增 manual thermal-baseline repeatability review:`scripts/oil-directional/review-firms-thermal-baseline.mjs` + `npm run review:firms-thermal-baseline`,默认读取 ignored diagnosis artifact 与 ignored manual baseline artifact,可写 ignored review artifact。review schema 为 `firms-thermal-baseline-review-p19`,固定 `promotionEligible=false`,只比较当前 facility aggregate 与手动 baseline p95 字段,并要求 source repeatability + baseline exceedance 才输出 repeated/elevated watch。缺 baseline 必须显式 WARN 或在 `--require-baseline` 下 FAIL;不读取 MAP_KEY、不访问网络、不写 production data。`check:firms-thermal-baseline-review` 使用 synthetic committed fixtures 离线守门,并已加入 `check:oil-directional` suite。P19 不新增 ODP production schema、不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P20 仅新增 manual watch-pack aggregation review:`scripts/oil-directional/review-firms-thermal-watch.mjs` + `npm run review:firms-thermal-watch`,默认读取 ignored P17/P18/P19 review artifacts,可写 ignored combined review artifact。review schema 为 `firms-thermal-watch-review-p20`,固定 `promotionEligible=false`,只汇总 facility coverage、thermal artifact review 与 baseline repeatability review,并输出 `signalState` / `manualReviewReadiness` / `futureIntegrationGate`。它会拒绝 schema/version/boundary/productionImpact 不合格的上游 review,但即使输出 `elevated_manual_review_required` 也只代表人工复核包,不是生产展示、workflow、ODP build 输入、事故确认、断供确认或油价预测。`check:firms-thermal-watch-review` 使用 committed review fixtures 离线守门,并已加入 `check:oil-directional` suite。P20 不新增 ODP production schema、不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P21 新增 WTI 快速市场代理:`macroDrivers.inflationEnergy.wtiMarketProxy` 由 Daily pipeline 读取 Yahoo `CL=F` 公开 chart,作为 WTI futures market proxy。ODP `evidence.wtiPrice` 优先复用新鲜 `radar-data:macroDrivers.inflationEnergy.wtiMarketProxy`(`maxAgeDays=3`),缺失或过期时回退 `radar-data:macroDrivers.inflationEnergy.wti`(FRED `DCOILWTICO` 官方 WTI spot,低噪声但可能发布滞后)。该 proxy 只改变 ODP T1 日频市场代理展示的新鲜度与口径说明;不是官方 WTI spot,不进入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P22 新增独立生产只读 `data/oil-thermal-watch.json`:由 `Refresh Oil Thermal Watch` workflow 调用 `npm run build:oil-thermal-watch`,读取 GitHub Secret `FIRMS_MAP_KEY` 或本地 ignored key 文件,以及 committed `config/oil-thermal-watch-facilities.json` 设施白名单。artifact schema 为 `oil-thermal-watch-1`,只保存设施级聚合摘要、sourceStatus、freshness、facilityCoverage、aggregate、facilities sanitized rows、productionImpact false map、boundary 与 limitationsZh;不得保存 MAP_KEY、raw FIRMS URL 或原始火点明细。前端 ODP `SATELLITE THERMAL WATCH` 只读消费该 JSON,不改变 `data/oil-directional-pressure.json` schema、不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。历史基线未建立前,即使出现 `baseline_building_watch` 或 `baseline_building_elevated_watch`,也只能写成人工复核观察,不得写成炼厂事故、停产、断供或油价预测确认。

P23 将 production whitelist 从空白推进为 U.S. Gulf Coast starter set:`config/oil-thermal-watch-facilities.json` 使用 EIA/HIFLD `Petroleum_Refineries_US_EIA.zip` / `Petroleum_Refineries_US_2021.shp` 中的 12 个 Texas/Louisiana PADD 3 refinery point rows,每个点派生 `+/-0.05 degree` FIRMS query bbox。该 config 可包含 `sourceSelection` / `notes` 审计说明,但 build 只消费 `facilities[]` 的 `id`、`label`、`region`、`assetType`、`bbox`、`sourceNote`。该 starter set 不是完整全球设施覆盖,不是 product terminal coverage,不是精确 refinery polygon,不是事故或断供确认,也不是油价预测模型输入。

P24 新增 `config/oil-thermal-watch-baseline.json` 与 `data/oil-thermal-watch.json.baseline` / `facilities[].baselineComparison`。baseline config schema 为 `oil-thermal-baseline-production-v1`,允许 `status='not_established'` 且 `facilities=[]` 作为初始状态,也允许后续 reviewed PR 写入 `partial` / `established` facility p95 rows;policy 至少包含 `minSamplesPerFacility`、`minRepeatSources`、p95 margin 与 elevated FRP/confidence thresholds。production artifact 的 `baseline.status` / `aggregate.baselineStatus` ∈ {`missing`,`not_established`,`partial`,`established`};facility `baselineStatus` / `baselineComparison.status` ∈ {`not_established`,`insufficient_samples`,`established`};新 signalState 可为 `baseline_established_no_detections` / `baseline_established_no_repeated_signal` / `baseline_repeated_watch` / `baseline_elevated_repeated_watch`。只有 established baseline + multi-source repeatability + above-baseline strength 同时满足,才允许 `repeatedObservation=true`;否则 FIRMS 检出仍为基线建立期或低信号观察。P24 不改变 ODP schema,不把 thermal watch 接入 ODP build input / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P25 新增 manual/offline `scripts/oil-directional/review-oil-thermal-baseline-samples.mjs` + `npm run review:oil-thermal-baseline-samples`。review schema 为 `oil-thermal-baseline-samples-review-p25`,默认读取 `data/oil-thermal-watch.json`,也可重复传入 `--input` 或使用 `--input-dir`;默认输出 ignored `manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json`。它只接受 sanitized `oil-thermal-watch-1` artifact,拒绝 raw FIRMS Area API URL,并汇总 `rowCountP95` / `maxFrpP95` / `highConfidenceCountP95` / `frpOver50CountP95` / `frpOver100CountP95` / `sourcesWithDetectionsP95` 候选 baseline rows。输出固定 `promotionEligible=false`, `candidateBaseline.candidateOnly=true`, `summary.productionBaselineWriteApproved=false`, productionImpact 全 false。`check:oil-thermal-baseline-samples-review` 使用 committed synthetic watch fixtures 离线守门,并已加入 `check:oil-directional` suite。P25 不读取 MAP_KEY、不访问网络、不写 production baseline config、不写 `data/*.json` / `realtime/*.json`,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P26 新增 manual/local `scripts/oil-directional/archive-oil-thermal-watch-sample.mjs` + `npm run archive:oil-thermal-watch-sample`。archive metadata schema 为 `oil-thermal-watch-sample-archive-p26`,默认读取 `data/oil-thermal-watch.json`,校验 sanitized `oil-thermal-watch-1`、`module='oil-thermal-watch'`、valid `generatedAt`、`facilities[]`、无 raw FIRMS Area API URL、`productionImpact` 全 false,然后只写 ignored `manual-artifacts/oil-thermal/watch-samples/<generatedAt>.json` 与 `<generatedAt>.archive-meta.json`。输出 sidecar 的 productionImpact 全 false,包含下一步 P25 `--input-dir` review 命令;P25 input-dir 读取会跳过 `*.archive-meta.json`。`check:oil-thermal-watch-sample-archive` 使用 committed synthetic watch fixture dry-run 离线守门,并已加入 `check:oil-directional` suite。P26 不读取 MAP_KEY、不访问网络、不写 production baseline config、不写 `data/*.json` / `realtime/*.json`,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P27 新增 manual/local `scripts/oil-directional/archive-oil-thermal-watch-history-samples.mjs` + `npm run archive:oil-thermal-watch-history-samples`。history archive metadata schema 为 `oil-thermal-watch-history-sample-archive-p27`;脚本只读本地 git history,通过 `git log -- data/oil-thermal-watch.json` 找最近 commits,再用 `git show <hash>:data/oil-thermal-watch.json` 抽取 sanitized `oil-thermal-watch-1` artifact。它拒绝 raw FIRMS Area API URL、缺失或 truthy `productionImpact`、非法 schema/module/generatedAt/facilities,并跳过无设施行的早期 watch shell;随后按 `generatedAt` 与 content hash 去重,只写 ignored `manual-artifacts/oil-thermal/watch-samples/<generatedAt>.json` 与 `<generatedAt>.archive-meta.json`。已有样本在未传 `--overwrite` 时标记为 `already_archived`,便于重复运行。sidecar productionImpact 全 false,包含 source commit hash、committedAt、contentHash 与 P25 `--input-dir` review 命令。`check:oil-thermal-watch-history-sample-archive` 使用 dry-run + `--allow-empty` 离线守门,并已加入 `check:oil-directional` suite。P27 不读取 MAP_KEY、不访问网络、不请求 FIRMS、不写 production baseline config、不写 `data/*.json` / `realtime/*.json`,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P47 新增 manual/local `scripts/oil-directional/prepare-oil-thermal-baseline-review.mjs` + `npm run prepare:oil-thermal-baseline-review`。readiness schema 为 `oil-thermal-baseline-readiness-p47`;脚本串联 P27 git-history sample archive 与 P25 baseline sample review,只把 sanitized history samples 写入 ignored `manual-artifacts/oil-thermal/watch-samples/`,再写 ignored `manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json` 与 `manual-artifacts/oil-thermal/oil-thermal-baseline-readiness-latest.json`。readiness artifact 固定 `promotionEligible=false`、`productionBaselineWriteApproved=false`、productionImpact 全 false,并列出 archive/review summary、facility readiness、ready/not-ready facility ids 与下一步人工复核命令。`check:oil-thermal-baseline-readiness-prep` 使用 dry-run/no-output 离线守门,并已加入 `check:oil-directional` suite。P47 不读取 MAP_KEY、不访问网络、不请求 FIRMS、不写 `config/oil-thermal-watch-baseline.json`、不写 `data/*.json` / `realtime/*.json`;即使 readiness 显示 `baseline_candidate_ready_for_manual_promotion_review`,也只表示候选基线可进入人工 reviewed PR,不得自动晋升或进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P48 新增 reviewed production baseline promotion:`scripts/oil-directional/promote-oil-thermal-baseline-candidate.mjs` + `npm run promote:oil-thermal-baseline-candidate` 读取 P25/P47 ignored review artifacts,只有显式 `--write-production-baseline` 才写 `config/oil-thermal-watch-baseline.json`;同时新增 `scripts/check-oil-thermal-baseline-config.mjs` + `check:oil-thermal-baseline-config` 并加入 `check:oil-directional` suite。当前 baseline `status='established'`,含 12 个 U.S. Gulf Coast starter refinery rows,每个 row 来自 15 个 sanitized production watch samples,`sampleWindowDays=2.36`,并标记 `sourceReview.baselineQuality='starter_short_window'`。该 starter baseline 只启用 repeated-observation 人工复核分层;短窗口 caveat 必须保留,不得写成成熟季节性基线、炼厂事故、停产、断供、封锁或油价预测。P48 可由 `build:oil-thermal-watch` 刷新 `data/oil-thermal-watch.json` 的 `baseline.status='established'`,但仍不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P49 新增 baseline quality aging / rolling refresh:`scripts/oil-directional/refresh-oil-thermal-baseline-candidate.mjs` + `npm run refresh:oil-thermal-baseline-candidate` 串联 P47 准备与 P49 promotion helper。默认不写 production baseline;只有显式 `--write-production-baseline` 才更新 `config/oil-thermal-watch-baseline.json`。`sourceReview.baselineQuality` 必须按 `sampleWindowDays` 分级:`<7` 天为 `starter_short_window`,`7-30` 天为 `starter_observation_window`,`>=30` 天为 `established_observation_window`;`qualityTransition` 记录 `new/unchanged/upgraded/downgraded`,`previousBaseline` 保留上一版质量摘要。P49 实测 rolling refresh 将 baseline 从 15 个样本 / 2.36 天推进到 16 个样本 / 2.48 天,质量仍为 `starter_short_window` 且 `qualityTransition='unchanged'`。`build:oil-thermal-watch` 现在会在 `data/oil-thermal-watch.json.baseline.sourceReview` 透传精简质量摘要和 caveats,供前端/审计解释使用。P49 不改变 repeated-observation 判定数学、不新增事故/断供/油价方向语义,不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P50 只改 ODP 前端展示:`SATELLITE THERMAL WATCH` 读取 `data/oil-thermal-watch.json.baseline.sourceReview` 并新增 `基线质量` 行,显示 `baselineQuality`、`sampleCount`、`sampleWindowDays` 与 `qualityTransition`。`starter_short_window` 必须显示为短窗口 starter,并明确“设施基线已建立,但样本窗口仍小于 7 天,不是成熟季节性或长历史运行基线”。P50 不新增生产字段、不改 `data/*.json`、不改 repeated-observation 数学、不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P51 新增 oil thermal baseline quality reminder / artifact-only monitor:`scripts/oil-directional/monitor-oil-thermal-baseline-quality.mjs` + `npm run monitor:oil-thermal-baseline-quality` + `.github/workflows/oil-thermal-baseline-quality-reminder.yml`。该 workflow 每 12 小时或手动触发,使用 full git history 复用 P47/P25 样本准备链路,只比较 candidate sample window 与当前 `config/oil-thermal-watch-baseline.json.sourceReview.baselineQuality` 是否跨过 7 天或 30 天质量门槛,并上传 ignored `manual-artifacts/oil-thermal/oil-thermal-baseline-quality-monitor-latest.json` artifact / GitHub Summary。P51 workflow 权限为 `contents: read`,不注入 `FIRMS_MAP_KEY`,不请求 FIRMS,不运行 `build:oil-thermal-watch`,不 commit/push,不写 `config/oil-thermal-watch-baseline.json`、`data/*.json` 或 `realtime/*.json`;发现 `baseline_quality_threshold_ready` 时也只给出人工 review/promotion 命令。P51 不新增生产字段、不改 repeated-observation 数学、不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P55/P58 新增 Oil Thermal Watch Middle East starter facility expansion:不改变 `oil-thermal-watch-1` schema,但 `config/oil-thermal-watch-facilities.json` 的 production whitelist 从 12 个 US Gulf Coast rows 扩展到 42 个 rows,新增 `Middle East / Saudi Arabia`、`Middle East / Iran`、`Middle East / Israel`、`Middle East / UAE`、`Middle East / Qatar`、`Middle East / Kuwait`、`Middle East / Iraq` region labels 与 `oil_terminal`、`oil_processing_area`、`gosp`、`oil_field`、`port_terminal`、`refinery_area`、`energy_processing_area`、`refinery_area_proxy`、`export_terminal_proxy`、`energy_port_proxy`、`industrial_port_proxy`、`oilfield_proxy`、`refinery_terminal_proxy`、`refinery_port_proxy` assetType values。新增坐标来源必须是 NGA GNS official country-file feature points,每个 sourceNote 必须记录 GNS country file/country、full_name、desig_cd、fc、cc_ft、adm1、mod_dt_ft 与 sourceUrl;辅助官方网页可记录设施上下文,但不能替代 GNS 坐标审计。proxy assetType 是官方地名/港口/海湾/城市/油田点派生的小框,不得写成精确 refinery polygon。由于 `config/oil-thermal-watch-baseline.json` 仍只覆盖原 12 个 US Gulf Coast rows,production artifact `baseline.status` 必须保持 `partial`,新增中东 rows 的 `baselineStatus` 应保持 `not_established` / `insufficient_samples` 直到后续 P25/P47/P49 reviewed baseline promotion。P55/P58 只扩大 production read-only observation coverage;不得保存 MAP_KEY、raw FIRMS URL、raw GNS files 或原始火点明细,不得确认炼厂事故、停产、断供、封锁、霍尔木兹中断或油价预测,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P58 另新增 manual/local targeted probe artifact contract:`probe:oil-thermal-targeted` 输出 schema `oil-thermal-targeted-probe-plan-1` 到 ignored `manual-artifacts/oil-thermal/targeted-probe-plan-latest.json`。该 artifact 可包含 `matchedFacilities[]`、`matchedArticleCount`、`sourceDomains[]`、`evidenceHashes[]`、`diagnosisPlan.windowsDays=[1,3,5]`、`targetFacilities[]` 与 productionImpact false map;不得包含 raw title/headline/snippet/body/URL、MAP_KEY、raw FIRMS URL 或原始火点明细。若显式 `--run-diagnosis`,下游 1/3/5 天 FIRMS 结果仍只写 ignored `manual-artifacts/oil-thermal/targeted-probe-<window>d-latest.json`。该 contract 不新增 production JSON 字段,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P61 在不改变 `oil-thermal-baseline-production-v1` schema 的前提下,完成 P60 health-gated candidate 的独立人工晋升。当前 `config/oil-thermal-watch-baseline.json` 必须为 `status='established'`,覆盖 42 个 production whitelist facilities；`sourceReview.promotionVersion='oil-thermal-baseline-promotion-p60'`,`baselineQuality='starter_observation_window'`,`sampleCount=69`,`totalSampleCount=100`,`quarantinedSampleCount=31`,`diagnosticsConfirmedEligibleSampleCount=16`,`sampleWindowDays=14.46`,`sampleHealthGateVersion='oil-thermal-sample-health-gate-p60'`。候选统计只允许使用 status/source/request/facility coverage 全部健康的样本；`partial`、`source_unavailable`、最终 request error、coverage mismatch 或健康状态不可验证样本必须继续 quarantine。该 7–30 天 baseline 不是成熟季节性或长历史运行基线；facility-specific p95 只用于 repeated-observation 人工复核门,不得被解释为事故、停产、断供、封锁或油价方向,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P65 将 Oil Thermal history-window capacity 与质量阈值分离:`oil-thermal-history-window.mjs` 统一 baseline preparation / rolling refresh / quality monitor 的默认窗口为 240 commits / 240 samples,archive/preparation/refresh/monitor CLI 允许 1..500。`established_observation_window` 仍要求健康 `sampleWindowDays>=30`,P60 sample-health gate 与 post-policy diagnostics gate 不变。扩大 history window 只允许读取更多 committed sanitized `data/oil-thermal-watch.json` 历史并写 ignored review artifacts；不得据此自动 promotion 或写 `config/oil-thermal-watch-baseline.json`,不得改变 repeated-observation 数学、ODP build/classifier/`finalBias`/globalOverlay/`values.*`/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P68 修正 P65 后暴露的混合设施窗口语义:`sampleWindowDays` 继续表示全部 healthy eligible history 的全局审计跨度；质量分级改由 `effectiveQualityWindowDays=min(facilities[].windowDays)` 决定。新 promotion `oil-thermal-baseline-promotion-p68` 必须在 `sourceReview` 写入 `minimumFacilityWindowDays`、`maximumFacilityWindowDays`、`effectiveQualityWindowDays`、`baselineQualityBasis='minimum_facility_window_days'`、`qualityTargetDays=30`、`facilitiesMeetingQualityTarget` 与 `facilitiesBelowQualityTarget`，且 checker 必须逐行重算验证。只有所有已晋升设施均达到 30 天才可标记 `established_observation_window`。旧 P48/P49/P60 config 仍可兼容读取,但不得用旧兼容路径生成新的 P68 promotion。当前 2026-07-30 no-write packet 为 global 36.20d / effective 27.74d / 12 of 42 facilities at target,所以 candidate quality 仍为 `starter_observation_window`。P68 不改变 baseline `status`、P60 sample-health/post-policy gate、repeated-observation 数学或任何 ODP/scoring/decision/execution boundary。

P62 只增加 ODP 前端 `SATELLITE THERMAL WATCH / 请求健康` 展示行,不改变 `oil-thermal-watch-1` schema。renderer 只能读取 `aggregate.requestDiagnostics.policyVersion/logicalRequestCount/retryCount/recoveredAfterRetryCount/failedRequestCount/retryBudgetExhaustedCount/failuresByCategory`,且 `failuresByCategory` 只能通过固定 `firms-request-policy-1` category allowlist 映射为中文聚合计数；不得遍历显示未知分类,不得读取或显示 MAP_KEY、raw/redacted FIRMS URL、provider body、raw response、raw row、自由文本 error/message/stack。该行只说明请求链路健康,不得被解释为无事故、无断供或油价方向确认；不改 retry/backoff、baseline/repeated-observation 数学,不进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P56 新增 ODP frontend `READINESS / 证据成熟度矩阵` display-only 组,只读派生既有输入:ODP/EIA 周度物理链、Worker/World Order 市场确认、radar-data global energy overlay/energyTransport 摘要、Oil News claim/source health 与 Oil Thermal baseline/facility 聚合。该矩阵只做页面信息架构整理,把证据分为方向锚、确认/反证、慢变量、运输候选、新闻观察和卫星设施代理,并显式列出使用边界与闸门状态。ODP renderer 不直接读取 Transport Shock candidate 字段;具体路线/市场确认候选仍由 C1 Transport Shock 专属卡展示。P56 不新增 production JSON 字段、不写 `data/*.json` / `realtime/*.json`、不读取新闻 `topArticles` 或 manual artifacts、不新增外部源、不改变 refresh cadence;输出不得改变 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation,也不得确认通道关闭、断供、封锁、炼厂事故、制裁影响或油价方向。

P57 新增 ODP frontend Oil News `主张质量` display-only 行,只读 `data/oil-news-event-watch.json` 已有 `claimPolarity`、`headlineDisplayReadiness`、`titleRisk`、`sourceStatus`、`aggregate.liveSourceCount` 与 `queryCoverage` 聚合字段,把主张混合、未明/高主张、标题未批准、高主张标题、来源降级和多源不足汇总为一条人工复核质量提示。P57 不新增 production JSON 字段、不改 oil-news workflow cadence、不读取 `topArticles`、title、URL、snippet/body/raw response 或 ignored manual artifacts,不展示标题原文,不确认霍尔木兹关闭/重开、断供、油轮流向、炼厂事故、制裁影响或油价方向;不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

Oil News axis gate v1 在既有 `claimPolarity` 内增加 `axisGate`,复用 P52 的 `claimAxis` 口径,把 transport security、supply flow、sanctions policy、facility operations、market reaction 与 general context 分轴统计。单轴只有在至少 2 条同向主张、至少 2 个来源域且无反向/混合主张时才可 `gateOpen=true`;任一反向或 mixed claim 必须保持 `mixed_or_contested`。该 gate 仅作 aggregate-only display,`displayOnly=true`,`eligibleForScoring=false`,不得包含 title/URL/titleHash/snippet/body/rawResponse,不得改变 Oil News aggregate confidence、ODP `finalBias`、主分、Brent promotion 或任何 decision/execution/position 路径。

### oil-directional-history.json — ODP PR2 历史 cache + 回测 GATE contract

PR2 新增**第二个独立文件** `data/oil-directional-history.json`:8 个 WPSR weekly series 的 2014-至今全周度史 committed snapshot,供回测 harness 离线、可复现回放。**仅供 backtest GATE**,不进 live `oil-directional-pressure.json`、不进 `values.*` / scoring / `decisionModel` / `executionLock` / `positionGuidance` / cross-validation / Global Risk Heatmap。zero-dependency build(ADR-0013)+ fail-closed。

顶层:`schemaVersion` 必须为 `odp-history-1`;`module` = `oil-directional-pressure-history`;`boundary` 声明 audit-only + 「not scoring/decision/values」;`builtAt` ISO;`rangeStart` = `2014-01-01`;`series` = 8 key map(`crudeStocksExSpr`/`sprStocks`/`distillateStocks`/`gasolineStocks`/`refineryUtilization`/`refinerCrudeInputs`/`demandGasolineSupplied`/`demandDistillateSupplied`)。

每 series:`id`(`PET.<id>.W`)、`unit` ∈ {`thousand barrels`,`thousand barrels per day`,`percent`}、`source` 以 `EIA:api-v2:` 开头、`sourceStatus` ∈ {`live`,`missing`}、`count`、`firstPeriod`、`lastPeriod`、`points[]`(`{period:'YYYY-MM-DD', value:number}`,period 严格升序)。失败 series → `sourceStatus:'missing'` / `count:0` / `points:[]`,不伪造。

**分类器**(`scripts/oil-directional/odp-classifier.mjs`):纯函数 `classifyAt(history, period)`,**look-ahead-safe**(只读 `period <= target` 的点);physical-only —— crude exSPR / distillate / SPR 库存 + 炼厂开工率 + product supplied;`gasolineStocks` + `refinerCrudeInputs` 存于 cache 但 PR2 分类不用。输出 `bias` ∈ {`insufficient_data`,`strong_bullish`,`product_crisis`,`bearish`,`moderate_bullish`,`neutral_range`};价格背离类 `false_*` 需价格、PR2 不产出(PR3 在 live 上)。**PR2 该分类器仅被 backtest 调用 —— live `oil-directional-pressure.json` 的 `signals` / `finalBias` 仍为 `null`(productionize = PR3)。**

**预登记阈值**(`ODP_THRESHOLDS`,`Object.freeze` locked,作审计记录 —— 回测前锁定、零 cherry-tune;改判定逻辑须重新预登记):

| 常量 | 值 | 含义 |
|---|---|---|
| `VS5Y_TIGHT` | −5 | 库存 vs 5y 同周均值 %,≤ → 偏紧 |
| `VS5Y_LOOSE` | +5 | ≥ 且在建库 → 偏松 |
| `RANGEPOS_TIGHT` | 0.25 | 5y 同周 [min,max] 内位置,≤ → 偏紧 |
| `RANGEPOS_EXTREME` | 0 | < → 跌破 5y 同周地板(极紧) |
| `REFINERY_HIGH` | 90 | 炼厂开工率 4w 均 %,≥ |
| `REFINERY_LOW` | 85 | ≤ |
| `SPR_RELEASE_4W` | −3000 | SPR 4 周变动(千桶),≤ → 显著释储 |
| `DEMAND_FALLING` | 0.95 | product supplied 4w / 13w,< |
| `DEMAND_DESTRUCTION` | 0.90 | < → 需求破坏 |

**回测 GATE**(`scripts/check-oil-directional-backtest.mjs`,`oil-directional` 套件第 6 leaf,离线跑 committed cache):

- **(1) history-integrity + points 真实性 + 网格对齐**:8 series 全 `live`、`count ≥ 600`、`firstPeriod ≤ 2014-01-31` ∧ `lastPeriod ≥ 2026-05-22`;`points[]` 与 metadata 一致(`Array.isArray` / `length === count` / 首尾 period 对账 / 严格升序 + finite);且 8 series 须共享 `crudeStocksExSpr` 的 canonical 周网格(`length` 与逐 index `period` 全等)。任一 blanked / truncated / 少一周 / 网格漂移都 hard-block —— 杜绝「metadata 完整但 points 空 / 错位」legally pass(守「同周物理链 replay」语义)。
- **(2) regime GATE**(预登记窗口 + 判定,look-ahead-safe replay,窗口 / 允许集 / 禁止集全部预先固定、无 cherry-pick):`2020-collapse`(04-10..05-15,weekly)bearish 多数 ∧ 零 strong/moderate;`2020-fullQ2`(04-03..06-26,weekly)零 strong/moderate;`2022-Q2`(weekly)bullish-family 多数 ∧ 零 bearish;`2023-24-range`(biweekly)strong/crisis ≤ 30% ∧ max-consec ≤ 2。

校验 = `npm run check:oil-directional-backtest`;完整设计见 [`OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md`](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

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

v28.0J-2B post-deploy audit 已通过，当前 live data 已包含 `aiInterpretationLayer.contractVersion = v28.0J-0`。当前前端 asset cache 版本以 `scripts/app.js` 的 `APP_VERSION` 为准（现 `bofa-report-review-1`）。

稳定边界：

- `aiInterpretationLayer` 是 display-only / interpretation-only。
- `generatedByExternalAi=false`。
- `usesExternalAiApi=false`。
- rule-based `aiInterpretationLayer` 本身不调用 DeepSeek / OpenAI / 外部 AI API；新的可见 DeepSeek 编辑层使用独立 `macroRiskEditorialLayer`。
- 不参与 scoring / `decisionModel` / `executionLock` / `positionGuidance`。
- 不改变 `values.*`、`effectiveDisplayInputs`、Brent promotion、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 前端只能只读消费 `aiInterpretationLayer`，不得在 render 层生成、重算或补写解释。
- 外部 AI 通过独立 `macroRiskEditorialLayer` 嵌入宏观总览，不覆盖本 rule-based layer；旧 `externalAiInterpretationLayer` 仅保留数据兼容且无可见消费者。

#### macroRiskEditorialLayer 当前生产契约（integrated visible read-only）

`macroRiskEditorialLayer` 是根级可选字段，也是首页 `MACRO RISK OVERVIEW` 唯一可见的 DeepSeek 编辑层。生产 schema 固定为 `macro-risk-editorial-production-v1`；唯一写入路径为 `Macro Risk Editorial Refresh` workflow。该 workflow 每日 `00:05 UTC` 在 Daily / World Order / ODP 后运行，合并近 7 日 Tavily/Brave 新闻与站内紧凑结构化证据，每次最多一次 DeepSeek 调用、无同 run 重试，`max_tokens=8000`、timeout 120 秒。

新闻发现把受注册资格约束的美国 `.gov` 根域/子域标为 `official`，但不得把名称中仅含 `gov` 的普通域提升为官方来源。若 Tavily 与 Brave 全部 topic 查询均健康、却没有任何 `official` / `cross_checked` 新闻，workflow 必须在 provider 前以 `SKIPPED_NO_CREDIBLE_NEWS` fail-closed 结束：只保留脱敏 discovery artifact 与 GitHub Summary，不调用 DeepSeek、不创建 input/output/projection、不写生产数据。搜索源未完整健康、artifact 结构错误或后续 contract/review/provider/write 失败仍必须非零退出。

可见条件必须全部满足：

- `status=valid`、`displayEnabled=true`、`provider=deepseek`、`mode=external_ai_macro_risk_editorial`。
- `sourceDataUpdatedAt === radarData.updatedAt`。
- `validation.status=pass`、`qualityReview.status ∈ {pass,warn}`。
- `qualityReview.promotionEligible=false`、`provenance.humanApproved=false`。
- `freshness.maxAgeHours=30`、`freshness.isStale=false`，且生成时间未超过 30 小时。
- `boundaries.frontendDisplayApproved=true`、`displayOnly=true`、`notInvestmentAdvice=true`。
- `affectsGfrrScoring` / `affectsRiskModules` / `affectsTailRiskOverlay` / `affectsDecisionModel` / `affectsExecutionLock` / `affectsPositionGuidance` / `affectsWorldOrder` / `affectsOdp` / `affectsBubbleWatch` 全部为 false。

`output` 必须包含：标题与导语、3–5 条近 7 日脉络、总分解释、2–4 个关键张力、恰好 6 个模块判读、3–5 个跨资产观察、历史比较、3–5 个观察/失效条件、数据限制、来源归属、置信度与 audit boundaries。可见正文兼容范围为 2,000–6,800 字，质量目标为 4,000–5,600 字；长度只统计前端实际展示的标题、日期、正文、数据限制与置信度说明，`sourceRefIds`、module 枚举、claim type、audit flags 等机器元数据不得计入可见正文。上限略高于 Bubble Watch 的 6,500 字，为六大模块和跨市场归因留冗余。历史比较只能解释同期压力位置，不得写成危机概率或六个月提前预警。

`sourceLedger` 只保存被引用的紧凑来源元数据；新闻必须为 HTTPS，production ledger 不得包含 snippet、raw provider response、headers、API key 或全文。`discovery_only` 新闻不得单独支撑事实性判断。writer 必须证明除 `macroRiskEditorialLayer` 外 `data/radar-data.json` 字节语义不变。

Provider prompt 必须把 `official` / `cross_checked` 新闻 source IDs 与 `discovery_only` IDs 分开枚举，并要求 `weeklyTimeline` 至少一个对象及全体事实对象引用并集实际包含至少 1 个可信新闻 ID。`sourceAttribution` 单独列出不等于事实对象引用；provider 忽略全部可信新闻时 review 必须 hard fail，adapter/writer 不得自动补引用或改写 AI 正文。

当字段缺失、陈旧、时间错配或任一门控失败时，前端隐藏该编辑层并保留 deterministic macro overview；不得显示旧 `externalAiInterpretationLayer` 卡片。

#### externalAiInterpretationLayer legacy compatibility contract（no visible consumer）

`externalAiInterpretationLayer` 曾是首页 visible read-only 层；现只保留 data compatibility 与手动诊断 contract。`External AI Production Refresh` scheduled workflow、`#external-ai-auxiliary` DOM、导航入口和 `renderExternalAi.js` 已移除。Daily 可继续 preserve 已有字段以避免破坏旧数据契约，但前端不得消费，生产也不得为它执行日常付费 refresh。其历史 validator/manual provider tooling 保留用于兼容审计，不得把旧 artifact 写入 `macroRiskEditorialLayer`。

历史兼容规则：`qualityReview.status=warn` 曾是旧卡片的非阻断状态；`status=fail`、provider failure、安全/归因/结构 hard fail 与 write/path assertion 仍用于验证已保存的 legacy field。它不再触发 scheduled provider 或前端展示。

历史 PR3 expand-then-contract 后，legacy validator / projection / write guard 接受两套 source family：

- legacy: `schemaVersion=v28.0L-external-ai-production-1`, `sourceMode=manual_local_compact`, `inputSource=local_compact`, `sourceSemantics=site_structured_data_compact_summary`。
- analyst current/default: `schemaVersion=v28.0L-external-ai-production-analyst-1`, `sourceMode=manual_analyst_compact_v1`, `inputSource=analyst_compact_v1`, `sourceSemantics=site_structured_analyst_evidence_pack_v1`。

旧 `External AI Production Refresh` 已退役；下述 scheduled/default 语义仅为历史记录。手动 external AI provider tooling 仍是 artifact-only，不得写当前首页判读。

历史 PR4b-1/2 曾为旧层增加 `crossLayerSynthesis` / `keyDivergences` / `scenarioLean` / `dataQualityLens` 与前端折叠区；该折叠区现已删除。这些 optional 字段只作为 legacy data compatibility 保留。

边界：

- 不得覆盖现有 `aiInterpretationLayer`。
- 必须是 display-only / commentary-only。
- 必须包含 `provider` / `model` / `source` / `audit` / `fallback` metadata。
- 必须包含 source attribution 与 output audit flags。
- 不得影响 scoring / decision / execution / position。
- 不得影响 `values.*`、`effectiveDisplayInputs`、Brent promotion、Action Queue、Trigger Monitor 或 Invalidation Rules。

`docs/fixtures/external-ai/*.json` 是 v28.0K-1 prompt contract 的非生产样例，不属于 production data contract，不得被 runtime 消费，也不得作为 `data/*.json`、`realtime/*.json` 或 Worker payload 的替代输入。下文 K-3A/3B disabled scaffold 与 L-0…L-3F-1 段均为历史基线。

`scripts/check-external-ai-output.mjs` / `npm run check:external-ai-output` 只验证 sample 或 future external AI output artifacts；它不验证 production `data/radar-data.json`，不改变 `aiInterpretationLayer`，也不把 external AI 字段加入当前 production contract。

v28.0K-4A does not change the production data contract. _(历史:当时 live `externalAiInterpretationLayer` 为 disabled scaffold，之后曾在 v28.0L-3P+ 成为 visible read-only；现已退回 legacy compatibility，见上方当前契约。)_ Manual API test output must not overwrite live `data/radar-data.json` or the current `macroRiskEditorialLayer`.

v28.0L-3C provider-call workflow design does not change the production data contract. Future provider-call workflow artifacts, if implemented later, remain manual diagnostics and are not production data. They must not overwrite `data/radar-data.json`, `data/*.json`, `realtime/*.json`, config files, the legacy `externalAiInterpretationLayer`, or the current `macroRiskEditorialLayer` (historical L-3C note).

#### externalAiInterpretationLayer disabled scaffold contract（SUPERSEDED — 历史 v28.0K-3A/3B 基线）

> **SUPERSEDED:** 以下为 v28.0K-3A/3B 时期的 disabled-scaffold 基线,保留作历史。旧层曾在 v28.0L-3P+ 进入 visible read-only，现已退为无可见消费者的 legacy compatibility；当前可见层见上方 `macroRiskEditorialLayer` 契约。

v28.0K-3A 在 Daily radar data 根级新增 future-only disabled scaffold；v28.0K-3B activation audit 通过后，该字段进入 live data baseline（历史）：

```text
externalAiInterpretationLayer
```

该字段不是外部 AI 输出，也不代表 DeepSeek / OpenAI / external AI API 已接入。它只记录外部 AI 当前 disabled，并明确 fallback 到现有 rule-based `aiInterpretationLayer`。本地旧数据如果缺少该字段，`check:data` 可能 warning；pull latest `main` 或等待 Daily workflow 重新生成后即可对齐。

当时 contract：

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

`externalAiInterpretationLayer` in production data is a legacy compatibility field with no visible consumer or scheduled provider refresh. Manual DeepSeek output artifacts, manual input artifacts, provider failure artifacts, and quality review artifacts under `manual-artifacts/` must not be hand-copied into it or into the current `macroRiskEditorialLayer`.

Manual artifacts must not be copied into `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, or frontend display paths. A future production external AI data contract requires a separate reviewed version with explicit audit, validator, quality-review, fallback, disable-switch, and source-attribution boundaries.

#### v28.0L-0 production integration design note（历史 staged-rollout note）

> **历史:** 以下 v28.0L-0…L-3F-1 为分阶段 rollout 期间所写(撰写时该层尚 disabled、integration 尚未实现)。该 rollout 曾在 **v28.0L-3P+** 完成 visible read-only，现旧层已退为 legacy compatibility；当前可见层见上方 `macroRiskEditorialLayer`。下列各阶段 note 保留作历史。

[`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md) designed the historical production `externalAiInterpretationLayer` contract. _(历史 L-0 note；该旧层现只保留数据兼容。)_

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

#### GDELT source policy guard

P35 起,`docs/GDELT_SOURCE_POLICY.md` 是全站 GDELT 使用边界。`check:gdelt-source-policy` 必须在 `check:all` 中运行,并扫描 `scripts/`、`.github/workflows/` 与 `workers/` 下的 runtime/check 文件。除 policy allowlist 中登记的现有 endpoint-reference 文件外,不得新增 `api.gdeltproject.org/api/v2`、`gdeltcloud.com/api/v2` 或等价 GDELT endpoint marker。P35 是 guard-only:不改变 World Order、ODP oil-news 或 Bubble Watch runtime,不新增 production schema,不写 `data/*.json` / `realtime`,也不把 GDELT 信号接入 scoring / decision / execution / position / Brent promotion / ODP `finalBias` / Global Risk Heatmap / cross-validation。

P36 起,`scripts/gdelt/fetch-gdelt.mjs` 是 ODP oil-news 使用 GDELT DOC 的共享 wrapper。该 wrapper 必须保持 serial request queue、最小请求间隔、`Retry-After` 解析、有界重试、timeout 与 sanitized diagnostics;`scripts/oil-directional/diagnose-oil-news-events.mjs` 不得再包含直接 GDELT endpoint marker。P36 只收口 GDELT 请求入口与诊断元数据,不新增 production artifact 字段要求,不改变 P29 workflow cadence,不改变 `data/oil-news-event-watch.json` 的 promotion/display-only 边界,不接入 scoring / decision / execution / position / Brent promotion / ODP `finalBias` / Global Risk Heatmap / cross-validation。

P37 起,`data/gdelt-news-cache.json` 是 GDELT DOC compact cache artifact,`schemaVersion="gdelt-news-cache-p37"`、`module="gdelt-news-cache"`、`cacheScope="odp_oil_news_event_watch"`。ODP oil-news 的 GDELT 分支必须只使用一条 `gdelt_broad_oil_news` broad query,再在本地按 chokepoint / sanctions / supply disruption / facility / tanker shipping / market reaction buckets 分类;不得恢复一组 bucket 一个 GDELT 请求的 fan-out。P39a 起,Oil News GDELT DOC 必须保持低频 cache/cooldown policy:`cachePolicy.ttlMinutes >= 1440`,`cachePolicy.staleMaxHours >= 72`,`cachePolicy.errorCooldownHours >= 24`,且单次 Oil News live attempt 对 GDELT 不做第二次 retry;2 小时 workflow 仍可刷新 Tavily/Brave 快新闻,但不得绕过 GDELT cache/error cooldown 直接高频请求 DOC API。429/error 时可保留 `lastUsableCache` 作为 compact audit-only 上次可用缓存,但必须 `usedForCurrentSignal=false`,不得用旧 GDELT 文章增强当前 Oil News 信号。cache 只允许保存 compact `domain/publishedAt/buckets/queryIds`、脱敏 `requestDiagnostics`、cache policy、query metadata、productionImpact false map 与边界声明;不得保存 title、URL、snippet、body、raw response、Authorization header、API key、cookie 或 bearer token。`Refresh Oil News Event Watch` workflow 必须同时提交 `data/oil-news-event-watch.json` 与 `data/gdelt-news-cache.json`。该 cache 不改变前端展示字段,不进入 scoring / decision / execution / position / Brent promotion / ODP `finalBias` / Global Risk Heatmap / cross-validation。

P38 起,`data/gdelt-bubble-watch-cache.json` 是 Bubble Watch `ceo_hedging` 专用 GDELT DOC compact cache artifact,`schemaVersion="gdelt-bubble-watch-cache-p38"`、`module="gdelt-bubble-watch-cache"`、`cacheScope="bubble_watch_ceo_hedging"`。`scripts/build-bubble-watch.mjs` 不得再包含直接 GDELT endpoint marker,必须通过 `scripts/gdelt/fetch-gdelt.mjs` 共享 wrapper 执行串行请求/退避/timeout/脱敏 diagnostics。Bubble Watch build 优先读取 132 小时内 fresh cache,cache 超过该窗口才尝试 live GDELT;live 失败但 21 天内有 cache 时可读取 stale cache;无可用 cache 时才沿用既有 Tavily / Brave / Wind fallback 路径。`Refresh Bubble Watch` workflow 必须提交该 cache;`audit-bubble-watch-sources` 必须 snapshot/restore 该 cache,保持 source-health audit 只读。cache 只允许保存 compact title/url/domain/seendate、脱敏 diagnostics、cache policy、query metadata、productionImpact false map 与边界声明;不得保存正文、snippet、raw response、Authorization header、API key、cookie 或 bearer token。P38 不改变 Bubble Watch 打分公式、红灯多源确认规则、GFRR values、scoring、decision、execution、position、ODP finalBias、Brent promotion、Global Risk Heatmap 或 cross-validation。

P39 起,`data/gdelt-world-order-cache.json` 是 World Order Stress 的 GDELT Cloud v2 `events/summary` compact cache artifact,`schemaVersion="gdelt-world-order-cache-p39"`、`module="gdelt-world-order-cache"`、`cacheScope="world_order_gdelt_cloud"`。`scripts/world-order/fetch-gdelt-cloud.mjs` 不得再包含直接 `gdeltcloud.com/api/v2` endpoint marker 或直接 `fetch(`,必须通过 `scripts/gdelt/fetch-gdelt.mjs` 的 `fetchGdeltCloudJson` 共享 wrapper 执行串行请求/退避/timeout/脱敏 diagnostics。World Order build 优先读取 12 小时内 fresh cache;cache 超窗后最多单次 live Cloud attempt;live 失败但 72 小时内有 cache 时使用 stale cache;近期 error cache 6 小时内不重复硬打;最后才沿用 previous `data/world-order-stress.json.externalSources.gdelt` 摘要。`Refresh World Order Stress` workflow 必须同时提交 `data/world-order-stress.json` 与 `data/gdelt-world-order-cache.json`。cache 只允许保存 normalized summary、脱敏 diagnostics、cache policy、query metadata、productionImpact false map 与边界声明;不得保存 raw provider response、Authorization header、API key、cookie 或 bearer token。P39 不改变 World Order overlay-only 评分边界,不进入 `values.*`、main scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor、Invalidation Rules、ODP `finalBias`、Brent promotion、Global Risk Heatmap 或 cross-validation;也不得把 GDELT Cloud 单源摘要写成战争、封锁、断供、油价方向或交易动作确认。

P40 新增 read-only post-migration cache health review:`scripts/review-gdelt-cache-health.mjs` + `npm run review:gdelt-cache-health` + `check:gdelt-cache-health`。该 helper 只读取 `data/gdelt-news-cache.json`、`data/oil-news-event-watch.json`、`data/gdelt-bubble-watch-cache.json`、`data/gdelt-world-order-cache.json` 与 `data/world-order-stress.json`,用于复核 Oil News / Bubble Watch / World Order 三条 GDELT 路径是否已经进入 shared-wrapper + compact-cache 纪律,并区分 post-migration placeholder/seed/old-query state 与真实 schema/policy failure。默认只写 ignored `manual-artifacts/gdelt-cache-health/gdelt-cache-health-latest.json`;`--no-output` 完全不写 artifact;默认非严格模式下 `WATCH`/`WARN` 不使 `check:all` 失败,但 `FAIL` 会使 `check:all` 失败,`--strict` 仅供人工在 scheduled refresh 后做硬复核。P40 不访问网络、不请求 GDELT、不写 production `data/*.json` / `realtime/*.json`,不改变 Oil News/Bubble Watch/World Order production schema 或 workflow cadence,不得进入 `values.*`、scoring、decision、execution、position、ODP `finalBias`、Brent promotion、Global Risk Heatmap 或 cross-validation。

2026-07-26 P40 post-refresh context hardening 在既有 review row 上增加 `refreshContext`,并在 `summary.postRefresh` 聚合 `expectedErrorCooldownCount`、`awaitingPostCooldownRefreshCount`、`persistentAfterCooldownCount`、`expectedScheduleGapCount`、`scheduledRefreshOverdueCount` 与 bounded `nextActions`。Oil News 只有在 production watch 本身生成于 `cache.generatedAt + errorCooldownHours` 之后且仍 degraded 时,才标为 `persistent_error_after_cooldown_expiry`;cooldown 内保持 `expected_error_cooldown_after_refresh`,仅 wall-clock 已过 cooldown 但尚无 post-cooldown production refresh 证据时必须保持 `degraded_awaiting_post_cooldown_refresh_evidence`。Bubble Watch 的 132h fresh TTL 不等于 workflow 逾期:在周一 168h cadence + 12h grace 内标为 `expected_pre_refresh_schedule_gap`,越界才标 `scheduled_refresh_overdue`。这些状态不改变 row severity、strict exit 语义、cache TTL/backoff、workflow cadence、fallback authority 或任何 production/scoring 边界。

P41 新增 manual/local `scripts/oil-directional/diagnose-gdelt-web-ngrams.mjs` + `npm run diagnose:gdelt-web-ngrams`。该 helper 默认 dry-run/no-network;只有显式 `--allow-network` 才通过 `scripts/gdelt/fetch-gdelt.mjs` 的 `fetchGdeltWebNgramsText` 下载 GDELT Web NGrams v5 legacy `ngrams.txt.gz` 文件,扫描 Oil News 相关短语并输出 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json`。P42 起,该 helper 先用 `probeGdeltWebNgramsFile` 对 bounded heartbeat-style candidate timestamps 做 HEAD latest-file discovery,命中后只下载第一份可用 `ngrams.txt.gz`;`--timestamp` 仍可做固定文件复核,`--no-probe` 可回退旧式直接候选下载。artifact schema 为 `gdelt-web-ngrams-diagnosis-p41`,只保存 candidate timestamps、discovery/probe diagnostics、selected file diagnostics、term/bucket aggregate 与短语命中摘要;不读取或保存 TOC 标题/URL,不保存新闻正文或 raw provider response。P48 起 selected file 不再写 `selectedFile.url`,旧 ignored artifact 也必须经 sanitizer 清洗。P41/P42/P48 不写 `data/*.json` / `realtime/*.json`,不新增 production workflow、不修改 frontend,不得作为当前 Oil News 信号增强,不得进入 ODP build / classifier / `finalBias` / globalOverlay / `values.*` / scoring / decision / execution / position / Brent promotion / Global Risk Heatmap / cross-validation。

P43 新增 manual/local `scripts/oil-directional/review-gdelt-web-ngrams-samples.mjs` + `npm run review:gdelt-web-ngrams-samples`。该 reviewer 只读 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-*.json` 或 `docs/fixtures/oil-news/gdelt-web-ngrams-diagnosis-sample-*.json`,验证 `gdelt-web-ngrams-diagnosis-p41` 样本边界并输出 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-samples-review-latest.json`。review schema 为 `gdelt-web-ngrams-samples-review-p43`,只保存 sample count、discovery stability、hit/doc count range、bucket coverage、term coverage 与 warnings/blockers;不保存 raw ngrams examples、TOC 标题/URL、新闻正文或 raw provider response。即使 review 为 `pass`,也只表示 `ready_for_manual_web_ngrams_stability_review`,不得作为 production display fallback、Oil News current-signal enhancer、workflow/frontend wiring 或 scoring/ODP direction 授权。

P44 新增 manual/local `scripts/oil-directional/archive-gdelt-web-ngrams-samples.mjs` + `npm run archive:gdelt-web-ngrams-samples`。该 archive 只读 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json` / repeated `--input` / `--input-dir` 或 fixtures,验证 `gdelt-web-ngrams-diagnosis-p41` 后只写入 sanitized sample 到 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-samples/` 并写入 sidecar,随后可调用 P43 reviewer 输出稳定性状态。archive schema 为 `gdelt-web-ngrams-sample-archive-p44`,状态只允许 `insufficient_samples` / `stable_manual_review_ready` / `unstable_keep_manual_only`。P44/P48 不联网、不写 `data/*.json`/`realtime/*.json`,不新增 production workflow、不修改 frontend,也不授权 production display fallback、Oil News current-signal enhancer、ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P45 新增 `docs/GDELT_WEB_NGRAMS_FALLBACK_SOURCE_REVIEW.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-fallback-source-review-p45.json` + `npm run check:gdelt-web-ngrams-fallback-source-review`。contract version 为 `gdelt-web-ngrams-fallback-source-review-p45`,状态固定 `source_review_manual_fallback_candidate_no_production_display`,候选未来角色仅为 `oil_news_gdelt_web_ngrams_background_fallback_display_only`。P45 只允许把 Web NGrams 定义为 GDELT DOC 429/限流时的低频背景 phrase heat / source-health fallback 候选;`productionDisplayFallbackApproved=false`,`currentSignalEnhancementApproved=false`,`workflowApproved=false`,`frontendApproved=false`,`scoreApproved=false`。未来 P46 只有在 P44 样本达到至少 8 个 usable samples、至少 24h observation window、至少 2 个 selected timestamps 且无 raw title/URL/body/raw response 后,才可另开 production display-only fallback contract。P45 不写 production data、不新增 workflow、不修改 frontend,不得进入 Oil News current signal、ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P46 新增 `docs/GDELT_WEB_NGRAMS_PRODUCTION_DISPLAY_FALLBACK_CONTRACT.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-production-display-fallback-contract-p46.json` + `npm run check:gdelt-web-ngrams-production-display-fallback-contract`。contract version 为 `gdelt-web-ngrams-production-display-fallback-contract-p46`,状态固定 `contract_design_only_waiting_for_sufficient_p44_samples_no_production_write`,仅定义未来可能写入 `data/oil-news-event-watch.json` 的 `sourceCaches.gdeltWebNgramsFallback` 字段形状,display mode 固定为 `aggregate_source_health_only_no_headlines`。P46 仍要求 P44 `stable_manual_review_ready`、至少 8 个 usable samples、至少 24h observation window、至少 2 个 selected timestamps、覆盖 chokepoint/tanker_shipping/market_reaction 并至少覆盖 sanctions/supply_disruption/facility_event 之一,且不得出现 raw title/URL/body/snippet/raw Web NGrams rows/raw provider response/secrets/request headers。P46 保持 `productionWriteApproved=false`,`frontendApproved=false`,`workflowApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;不写 production data、不新增 workflow、不修改 frontend、不增强 Oil News current signal,不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P47 新增 `.github/workflows/gdelt-web-ngrams-sample-collector.yml` + `npm run check:gdelt-web-ngrams-sample-collector-workflow`。workflow name 为 `GDELT Web NGrams Sample Collector`,每 3 小时(`23 */3 * * *` UTC)或手动触发,只做 artifact-only sample collection:恢复上一轮 `gdelt-web-ngrams-samples` artifact、运行 live `diagnose:gdelt-web-ngrams -- --allow-network`、归档最新 diagnosis、用 8-sample gate 运行 `review:gdelt-web-ngrams-samples`,然后上传 diagnosis/samples/review artifact 与 GitHub Summary。P47 does not write production data,权限固定 `contents: read` + `actions: read`,不 commit/push,不运行 `build:oil-news-event-watch` / `build:oil-directional` / `build:data`,不读取 Tavily/Brave/GDELT Cloud/FIRMS secrets,不写 `data/*.json`/`realtime/*.json`,不得进入 frontend、Oil News current signal、ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P48 新增 Web NGrams artifact sanitizer:`scripts/oil-directional/sanitize-gdelt-web-ngrams-artifacts.mjs` + `npm run sanitize:gdelt-web-ngrams-artifacts` + `check:gdelt-web-ngrams-artifact-sanitizer`。sanitizer version 为 `gdelt-web-ngrams-artifact-sanitizer-p48`;它只允许重写 ignored `manual-artifacts/` 下的 Web NGrams diagnosis/sample artifacts,移除 legacy `selectedFile.url`、URL-bearing keys、raw title/body/snippet、raw rows 与 raw provider response markers。P47 workflow 现在恢复旧 sample artifact 后先运行 sanitizer,live diagnosis 后再运行 sanitizer,archive 则写 sanitized sample 而非 raw copy;P43 reviewer 也会阻断残留 `"url"` / `https://` / `http://` / raw title/body/response markers。P48 不写 production `data/*.json` / `realtime/*.json`,不批准 `sourceCaches.gdeltWebNgramsFallback`,不修改 frontend、不增强当前 Oil News signal,不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P49 新增 `docs/GDELT_WEB_NGRAMS_FALLBACK_GATE_REVIEW.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-fallback-gate-review-p49.json` + `npm run check:gdelt-web-ngrams-fallback-gate-review`。contract version 为 `gdelt-web-ngrams-fallback-gate-review-p49`,状态为 `sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write`:它只确认 collector artifact 的 P46 sample gate 已满足 8 个 usable samples、24 小时 observation window、2 个以上 selected timestamps、无 blockers、无 raw title/URL/body/raw-response exposure,并覆盖 chokepoint/tanker_shipping/market_reaction 加 sanctions/supply_disruption。P49 只允许下一步 `p50_display_only_fallback_projection_dry_run_no_production_write`;继续保持 `sourceCaches.gdeltWebNgramsFallback` 不写入 production data,`productionWriteApproved=false`,`frontendApproved=false`,`workflowApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;不修改 frontend/workflow,不增强当前 Oil News signal,不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P50 新增 `docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_PROJECTION.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-projection-p50.json` + `scripts/project-gdelt-web-ngrams-display-fallback-projection.mjs` + `npm run check:gdelt-web-ngrams-display-fallback-projection`。contract version 为 `gdelt-web-ngrams-display-fallback-projection-p50`,状态为 `display_only_fallback_projection_ready_no_production_write`:它只把 P49 已通过的 sample gate dry-run 投影为未来可能的 `sourceCaches.gdeltWebNgramsFallback` display-only compact shape,输出仅限 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-latest.json`。投影 display mode 固定为 `aggregate_source_health_only_no_headlines`,只包含 source-health、sample gate、bucket counts 与 term counts,不得包含 article title、URL、snippet、body、raw Web NGrams rows、raw provider response、secrets 或 request headers。P50 保持 `productionWriteApproved=false`,`frontendApproved=false`,`workflowApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;不写 production data、不新增 workflow、不修改 frontend、不增强当前 Oil News signal,下一步仅允许 `p51_display_only_fallback_projection_review_no_production_write`,不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P51 新增 `docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_PROJECTION_REVIEW.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-projection-review-p51.json` + `scripts/review-gdelt-web-ngrams-display-fallback-projections.mjs` + `npm run review:gdelt-web-ngrams-display-fallback-projections` + `npm run check:gdelt-web-ngrams-display-fallback-projection-review`。contract version 为 `gdelt-web-ngrams-display-fallback-projection-review-p51`,通过状态为 `display_fallback_projection_review_passed_no_production_write`:它只复核一份或多份 P50 projection artifact 是否仍满足 future field absent、aggregate-only display mode、无 article title/URL/body/raw response、sample gate 与 all approvals false。P51 输出仅限 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-review-latest.json`,保持 `productionWriteApproved=false`,`frontendApproved=false`,`workflowApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;不写 production data、不新增 workflow、不修改 frontend、不增强当前 Oil News signal,下一步仅允许 `p52_display_only_fallback_writer_contract_design_no_production_write`,不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P52 新增 `docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_WRITER_CONTRACT_DESIGN.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-writer-contract-design-p52.json` + `scripts/check-gdelt-web-ngrams-display-fallback-writer-contract-design.mjs` + `npm run check:gdelt-web-ngrams-display-fallback-writer-contract-design`。contract version 为 `gdelt-web-ngrams-display-fallback-writer-contract-design-p52`,状态为 `display_only_fallback_writer_contract_design_no_production_write`:它只设计未来可能写入 `data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback` 的 compact display-only cache shape,contract version 为 `gdelt-web-ngrams-display-fallback-cache-v1`,display mode 固定 `aggregate_source_health_only_no_headlines`。P52 仍保持该字段在 production data 中 absent,并保持 `productionWriteApproved=false`,`writerImplementationApproved=false`,`frontendImplementationApproved=false`,`workflowAutomationApproved=false`,`liveFetchApproved=false`,`apiKeyReadApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;不创建 writer、不写 production data、不新增 workflow、不修改 frontend、不增强当前 Oil News signal,下一步仅允许 `p53_display_only_fallback_disabled_writer_scaffold_no_production_write`,不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P53 新增 `docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_DISABLED_WRITER_SCAFFOLD.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-p53.json` + `scripts/project-gdelt-web-ngrams-display-fallback-disabled-writer.mjs` + `npm run project:gdelt-web-ngrams-display-fallback-disabled-writer` + `npm run check:gdelt-web-ngrams-display-fallback-disabled-writer-scaffold`。schema version 为 `gdelt-web-ngrams-display-fallback-disabled-writer-p53`,状态为 `disabled_no_production_write`,writerState 为 `disabled_scaffold_no_production_write`:它只把 P52 writer contract、P50 projection 与 P51 review 组装成 ignored manual artifact,默认输出 `manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-latest.json`。P53 仍保持 `sourceCaches.gdeltWebNgramsFallback` 在 production data 中 absent,并保持 `productionDataWriteApproved=false`,`productionWriteApproved=false`,`writerImplementationApproved=false`,`frontendImplementationApproved=false`,`workflowAutomationApproved=false`,`liveFetchApproved=false`,`apiKeyReadApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;不创建 production writer、不写 production data、不新增 workflow、不修改 frontend、不增强当前 Oil News signal,下一步仅允许 `p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write`,不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P54 新增 `docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_DISABLED_WRITER_REVIEW.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-review-p54.json` + `scripts/review-gdelt-web-ngrams-display-fallback-disabled-writer.mjs` + `npm run review:gdelt-web-ngrams-display-fallback-disabled-writer` + `npm run check:gdelt-web-ngrams-display-fallback-disabled-writer-review`。schema version 为 `gdelt-web-ngrams-display-fallback-disabled-writer-review-p54`,通过状态为 `disabled_writer_scaffold_review_passed_no_production_write`:它只复核 P53 disabled writer scaffold 是否仍满足 disabled/no-production-write、future field absent、aggregate-only、sample gate、no raw content 与 all approvals false。P54 输出仅限 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-review-latest.json`,保持 `productionDataWriteApproved=false`,`productionWriteApproved=false`,`writerImplementationApproved=false`,`frontendImplementationApproved=false`,`workflowAutomationApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;不写 production data、不新增 workflow、不修改 frontend、不增强当前 Oil News signal,下一步仅允许 `p55_display_only_fallback_production_write_readiness_gate_no_production_write`,不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P55 新增 `docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_PRODUCTION_WRITE_READINESS.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-production-write-readiness-p55.json` + `scripts/review-gdelt-web-ngrams-display-fallback-production-write-readiness.mjs` + `npm run review:gdelt-web-ngrams-display-fallback-production-write-readiness` + `npm run check:gdelt-web-ngrams-display-fallback-production-write-readiness`。schema version 为 `gdelt-web-ngrams-display-fallback-production-write-readiness-p55`,状态为 `production_display_only_write_ready_no_production_write`:它只作为 readiness gate,本身不写 production data,但在 P54 通过且 P53 projection 合格时授予下一步窄作用域 `p56ProductionDataWriteApproved=true` / `p56ProductionWriteApproved=true` / `p56WriterImplementationApproved=true`。P55 授权的 P56 scope 仅限 `data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback` 单字段 compact display-only cache(`gdelt-web-ngrams-display-fallback-cache-v1`,`aggregate_source_health_only_no_headlines`),且必须保持 `currentSignalEnhancement=false`,`eventConfirmationSource=false`,`headlineSource=false`,`oilDirectionInput=false`,`eligibleForScoring=false`;仍保持 `frontendImplementationApproved=false`,`workflowAutomationApproved=false`,`liveFetchApproved=false`,`apiKeyReadApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;下一步仅允许 `p56_display_only_fallback_production_display_write`;不得进入 ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P56(Web NGrams fallback) 新增 `docs/GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_PRODUCTION_DISPLAY_WRITE.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-production-display-write-p56.json` + `scripts/oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs` + `scripts/write-gdelt-web-ngrams-display-fallback-production-cache.mjs` + `npm run write:gdelt-web-ngrams-display-fallback-production-cache` + `npm run check:gdelt-web-ngrams-display-fallback-production-display-write`。production artifact `data/oil-news-event-watch.json` 现在允许且要求 `sourceCaches.gdeltWebNgramsFallback` 字段,contract 为 `gdelt-web-ngrams-display-fallback-cache-v1`,display mode 为 `aggregate_source_health_only_no_headlines`,并声明 `productionDataWriteApproved=true`。该字段只保存 P55 审核后的 sample gate、source health、observation window 与 limitation/warnings;不得保存 article title、URL、snippet、body、raw response、titleHash、source URL、request header 或 secret。字段必须保持 `frontendDisplayApproved=false`,`workflowAutomationApproved=false`,`liveFetchApproved=false`,`apiKeyReadApproved=false`,`currentSignalEnhancement=false`,`eventConfirmationSource=false`,`headlineSource=false`,`oilDirectionInput=false`,`eligibleForScoring=false`;不得改变 Oil News current signal、ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P63(Web NGrams frontend aggregate health) 新增 `docs/GDELT_WEB_NGRAMS_FRONTEND_AGGREGATE_HEALTH.md` + `docs/fixtures/oil-news/gdelt-web-ngrams-frontend-aggregate-health-p63.json` + `npm run check:gdelt-web-ngrams-frontend-aggregate-health`。P63 只后继修改 P56 cache 的 frontend approval marker 为 `frontendDisplayApproved=true`,并允许 `scripts/modules/renderOilDirectional.js` 从 `sourceCaches.gdeltWebNgramsFallback` 读取 contract/displayMode/approval、sampleGate 的 state/usableSampleCount/selectedTimestampCount/observationWindowHours/warningCount 与 sourceHealth.usedForCurrentSignal,渲染 aggregate-only 中文源健康。renderer 遇到缺字段、错误 contract、错误 displayMode 或未批准时必须 fail-closed;不得读取或展示 article list/title/URL/snippet/body/raw response。`currentSignalEnhancement=false`,`eventConfirmationSource=false`,`headlineSource=false`,`oilDirectionInput=false`,`eligibleForScoring=false`,`usedForCurrentOilNewsSignal=false`,`usedForOdpFinalBias=false`,`usedForMainScore=false`,`workflowAutomationApproved=false`,`liveFetchApproved=false`,`apiKeyReadApproved=false` 均保持;P63 不改变 Oil News signal、ODP build/classifier/finalBias、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P67(Web NGrams frontend sample age) 新增 `gdelt-web-ngrams-frontend-sample-age-p67` additive approval,在 P63 gate 不变、production cache 不改的前提下,额外允许 renderer 读取 `sampleGate.latestSelectedTimestamp` 与 `staleAfterHours`。时间戳必须严格按 UTC `yyyyMMddHHmmss` 解析；前端只可派生历史审阅样本截至日期、距今小时/天数与是否超过 cache `staleAfterHours`,无效或超过 1 小时未来值必须显示 unavailable。该 age 不是当前新闻 freshness、事件确认、oil direction input 或 score；不得读取/展示 headline/URL/snippet/body/raw response,不得改变 Oil News signal、ODP `finalBias`、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P64(ODP verdict history monitor) 新增 `oil-directional-verdict-history-monitor-p64`。该 artifact-only monitor 的唯一 production input 是 committed `data/oil-directional-pressure.json` git history;输出 contract 包含 `status`、`input`、`trend`、sanitized `samples`、`invalid`、`manualAction`、all-false `productionImpact` 与 `boundary`。`trend` 只聚合既有 final/physical bias counts、verdict/family transitions、recent seven-sample transitions、current streak、divergence count、confidence/data-sufficiency counts、max evidence age/degraded-evidence sample count 和 global-overlay effect counts。`productionDataWriteApproved=false`,`calculatesNewVerdict=false`,`calculatesNewScore=false`;不得写 `data/*.json` / `realtime/*.json`,不得触发 ODP/Daily/Worker,不得进入 `values.*`、scoring、decision、execution、position、Brent promotion、ODP `finalBias`、Global Risk Heatmap 或 cross-validation。

P66 将 monitor contract 升为 `oil-directional-verdict-history-monitor-p66`,在 `trend` 增加 `recentLowConfidenceCount` / `persistentLowConfidence`,并增加 `observations.persistentLowConfidence`。只有 recent window 达到 7 个有效样本且 7/7 `confidence='low'` 时 `active=true`;该观察固定 `changesPrimaryStatus=false`,`changesClassifier=false`。它可令 `manualAction.suggestedNow=true` 并建议审阅既有 confidence caps,但不得单独令 `manualAction.requiredNow=true`,不得替换 primary status,不得修改 classifier/caps、ODP `finalBias` 或任何 scoring/decision/execution/position 路径。

### GDELT Web NGrams automated display cache (2026-07-31)

`data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback` 支持
`gdelt-web-ngrams-display-fallback-cache-v2`。`Refresh Oil News Event Watch`
在主 build 内做一次 bounded pair fetch，并从同一 fetch 写入 source-file
timestamp、`sourceHealth`、`automation` 与 compact `aggregate` counts。
`workflowAutomationApproved=true` / `liveFetchApproved=true` 只批准该 keyless
automated display-only 写入；`apiKeyReadApproved=false`。

v2 不保存 headline、URL、snippet、body、raw Web NGrams row 或 raw provider
response。它 is not a current Oil News signal,并必须保持
`currentSignalEnhancement=false`,`eventConfirmationSource=false`,
`headlineSource=false`,`oilDirectionInput=false`,`eligibleForScoring=false`,
`usedForCurrentOilNewsSignal=false`,`usedForOdpFinalBias=false`,
`usedForMainScore=false`。live fetch 失败时,只有 12 小时内的上一份 v2
observation 可标为 `stale`;超窗必须 `source_unavailable`。

### GDELT Web NGrams article-pair adapter foundation (P69A)

`gdelt-web-ngrams-article-pair-v1` 只定义共享 GDELT wrapper 之上的
timestamp-matched `ngrams.txt.gz` + `toc.json.gz` 原子探测/下载边界。任一
half 缺失必须 `source_unavailable`;pair diagnostics 不得包含 provider URL、
raw NGRAMS/TOC rows、title、snippet、body、header 或 secret。P69A 没有
production artifact field、workflow、writer、current signal 或 frontend
approval。它必须保持 `usedForCurrentSignal=false` 与
`eligibleForScoring=false`;后续 article join / multilingual classification /
dedupe / cross-source confirmation / shadow gate 必须分阶段审核。

### GDELT Web NGrams sanitized article candidates (P69B)

`gdelt-web-ngrams-article-candidates-shadow-v1` 在同一 timestamp 的
NGRAMS/TOC pair 内按 document ID 连接 quadgram 命中与文章元数据，并先按
canonical URL 去重。query taxonomy 由
`odp-oil-news-web-ngrams-taxonomy-v1` 集中管理，避免诊断路径与 article
candidate 路径各自漂移。

raw title / URL 只允许在当前 Node 进程内参与后续分类与跨源匹配；sanitized
shadow shape 不保存 title / URL / snippet / body / raw NGRAMS/TOC rows /
provider response / header / secret。它可保留不可逆 SHA-256 URL/story cluster
hash、domain、publishedAt、language、term/bucket IDs、mention count 和 compact
join/dedupe metrics，但只允许进入 ignored shadow artifact。P69B 不新增
workflow 或 production writer，不写 `data/*.json` / `realtime/*.json`，并固定
`currentSignalEnhancement=false` / `eligibleForScoring=false`。后续仍需完成
多语言 claim/event classification、独立源确认与真实观察窗 shadow gate。

### GDELT Web NGrams multilingual shadow classification (P69C)

`gdelt-web-ngrams-multilingual-classification-shadow-v1` 只对 P69B 的进程内
article candidates 做规则分类。taxonomy v2 的显式语言集合为
`en` / `zh` / `ar` / `ru` / `es`；directional rules 把
`risk_escalation` / `risk_deescalation` 与普通 topic context 分开。仅命中
Hormuz / tanker / crude / market 等 context term 不得产生 directional claim；
同一标题同时命中升温和缓和规则时必须标为 `mixed_or_contested`。

shadow output 仅保留 hashes、domain/time/language、term/bucket IDs、rule IDs
和 aggregate language/polarity/event/axis counts，不保存命中的原始 pattern、
title 或 URL。`multilingualClassificationShadowOnly=true`,
`currentSignalEnhancement=false`,`eventConfirmationSource=false`,
`eligibleForScoring=false` 均为强制边界。P69C 仍无 workflow、production
writer 或 frontend approval；下一阶段必须用 Tavily/Brave 做独立来源确认。

### GDELT Web NGrams cross-source shadow telemetry (P69D)

`gdelt-web-ngrams-cross-source-telemetry-shadow-v1` 比较 P69C Web candidates
与进程内 Tavily/Brave normalized articles。相同 canonical URL 或 normalized
title hash 只记为 discovery overlap，不得记为事件确认。`independentSourceSupported`
要求不同 editorial domain、36 小时时间窗内、相同 claim axis、相同明确
directional polarity 且至少一个 bucket 重叠；`crossProviderSupported` 还要求
Tavily 与 Brave 都有支持且至少两个独立 supporting domains。

telemetry 只保存 hashes、domain/time/language、claim axis/polarity 与 provider/
domain counts，不保存 title、URL、snippet/body、命中原文、raw response、
header 或 secret。即使 `independentSourceSupported=true`，也必须保持
`independentSupportIsConfirmedEvent=false`,`eventConfirmationSource=false`,
`currentSignalEnhancement=false`,`eligibleForScoring=false`。P69D 仍是
library/check-only；下一步才能把 sanitized telemetry 接入 shadow workflow
并开始真实观察窗。

2026-09-05 当前计算版本为
`gdelt-web-ngrams-cross-source-telemetry-shadow-v2`。reference 与 Web 两侧使用
相同既有五语 shadow 分类器；不扩词表、不改变 production Oil News 主分类。
绝对发表日期必须通过真实日历校验且不晚于 Web 文件时间，缺失/非法/未来
分别计数，不能从相对时间或抓取时间推测。独立域排除同域及父子域，支持域
之间也按父子关系合并；这不是完整所有权或 public-suffix 认证。方向明确数、
日期可用数与时间窗可比较数只作诊断，原全候选支持率分母和36小时窗不变。

### GDELT Web NGrams automated article shadow cache (P69E)

`build:oil-news-event-watch` 现在复用同一轮 Tavily/Brave transient provider
results，并只做一次 timestamp-matched Web NGrams pair fetch；不再在 workflow
中运行第二次 diagnosis/download。它同时更新原
`gdeltWebNgramsFallback` v2 display cache，并写
`sourceCaches.gdeltWebNgramsArticleShadow` contract
`gdelt-web-ngrams-article-shadow-cache-v1`。该新字段只保存 source timestamp、
candidate/classification/cross-source aggregates 与 30-day observation policy，
不保存 article rows、hashes、domain、title、URL 或 raw content。

字段允许 `productionDataWriteApproved=true`,
`workflowAutomationApproved=true`,`liveFetchApproved=true`，但 Web shadow
模块本身不新增 API key 读取：`apiKeyReadApproved=false`，只复用既有 Oil
News provider results。它必须保持 `frontendDisplayApproved=false`,
`shadowObservationOnly=true`,`currentSignalEnhancement=false`,
`eventConfirmationSource=false`,`oilDirectionInput=false`,
`eligibleForScoring=false`,`promotionEligible=false`。合并后的首个成功 refresh
前字段可 absent；存在时必须通过 contract validator。每轮 sanitized per-article
shadow observation 仅上传 GitHub artifact，retention 35 days，不 commit。

### GDELT Web NGrams discovery cutover readiness gate (P69F)

`config/oil-news-discovery-policy.json` 固定当前模式为
`gdelt_doc_primary_web_ngrams_shadow`，目标模式仅登记为
`web_ngrams_primary_gdelt_doc_fallback`。当前 fallback 顺序仍是 GDELT DOC →
Tavily → Brave；目标顺序在独立 reviewed cutover PR 获批前不生效。
`webNgramsPrimaryApproved=false` 与 `automaticCutoverApproved=false` 是硬边界。

`review:gdelt-web-ngrams-article-shadow-history` 只读 git history 中已提交的
`data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsArticleShadow`，
验证所有 cache contract，按 `generatedAt` 去重，并计算真实观察天数、可用
样本数、pair availability、usable rate、candidate count、多语言覆盖率及
Tavily/Brave independent/cross-provider support。质量门槛固定为至少 30 天、
120 个可用样本、95% pair availability、80% usable rate、中位数候选数 10、
多语言覆盖率 70%、independent support 10%、cross-provider support 5%，且
invalid sample 必须为 0。

cache 容器保留 v1 兼容格式，以 `crossSourceTelemetryContractVersion` 区分
计算口径。无版本/旧v1样本仍可读且保留在全历史 `metrics`，不能当成v2。
`qualityMetrics` 与质量门仅使用v2 cohort（包括该口径失败轮次的可用率），
仍须满足原30天、120可用样本及全部阈值。全部legacy时状态为
`legacy_samples_require_requalification`，新口径不足为
`collecting_requalified_shadow_history`；不得重写旧aggregate或假称旧样本丢失。

即使全部门槛通过，review 也只能输出
`ready_for_manual_cutover_review`；`promotionEligible=false` 与
`automaticCutoverApproved=false` 始终不变。每日只读 workflow
`GDELT Web NGrams Article Shadow Readiness` 仅生成 GitHub Summary 和 35-day
ignored artifact，不读取 secrets、不访问新闻源、不 commit/push、不写
production data。它不会自动切换 discovery，也不改变 frontend/current signal/
event confirmation/ODP finalBias/scoring/decision/execution/position。

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

### Macro Overview public proxy coverage display boundary (M-86)

M-86 只调整前端 Macro Overview 的解释语义，不改变 production data contract、Daily/Worker runtime、Brent promotion、source fetch、scoring、decision、execution、position、workflow、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation。

前端 judgment object 可包含：

- `coverageNotes`: 已接入公开代理覆盖与正式源边界说明，例如 EIA Brent spot proxy、ICE delayed futures curve、StockQ BDTI/BCTI/BDI、ZQ/SR3/OIS public curve、ICE CDX public settlement、CCLFX/VNQ/REM/CMBS/FRED public proxies。
- `missingEvidence`: 仅保留真正未刷到的公开数据或 World Order 外部源限制。不得把 live public proxy 边界重新渲染成 `missingEvidence`。

Platts Dated Brent、official ICE settlement、private credit marks、non-public CRE loan tape、BoA raw card feed、Redbook raw subscription feed 等仍是边界说明；不得冒充正式/非公开源，也不得进入 scoring / decision / execution / position。

### Market Pricing multi-asset metrics schema (M-91)

M-91 extends Market Pricing Temperature beyond QQQ without adding another risk vote. QQQ remains the primary top-level metrics contract. NDX / IXIC are auxiliary display-only comparison metrics.

Data contract:

- `data/market-pricing-history.json.assets.qqq` remains the QQQ primary history path and keeps status `active`.
- `data/market-pricing-history.json.assets.ndx` and `assets.ixic` may contain real weekly records from Yahoo chart `^NDX` / `^IXIC` and use status `history_active_display_only`.
- `data/market-pricing-history.json.assets.spx.status` remains `fallback_candidate_only`; SPX must not be rendered as Nasdaq temperature.
- `data/market-pricing-metrics.json` keeps the top-level QQQ fields (`asset`, `records`, `sourceRecordsCount`, `metricsRecordsCount`, `latestMetricDate`, ranges) for backward compatibility.
- `data/market-pricing-metrics.json.assets.qqq` mirrors the top-level QQQ records with `role="primary"`.
- `data/market-pricing-metrics.json.assets.ndx` uses `displayLabelZh="纳斯达克 100 — 横向对照"` and `role="auxiliary_comparison"`.
- `data/market-pricing-metrics.json.assets.ixic` uses `displayLabelZh="纳斯达克综合指数 — 广度参照"` and `role="auxiliary_breadth_reference"`.
- Auxiliary assets use the same 60-week rolling mean, sample standard deviation (`N-1`), uncapped z-score method as QQQ, but each auxiliary z-score is computed independently from that asset's own weekly record series; NDX / IXIC must never reuse or mix QQQ's rolling window. If fewer than 60 weekly records exist, their status must be `insufficient_history` and the frontend must show cumulative progress.

Boundaries:

- NDX / IXIC are Daily/manual Market Pricing history inputs only; they do not enter Worker runtime.
- NDX / IXIC do not alter Brent promotion, scoring, `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, Invalidation Rules, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation.
- NDX / IXIC success must not hide QQQ failure; QQQ must not be substituted with NDX or IXIC.

2026-07-26 起，`market-pricing-freshness-review-v1` 只读核对 QQQ / NDX / IXIC 的 history latest、metrics latest、coverage latest 与 `source.lastCommittedAt`。active weekly record 超过 10 calendar days 或 NDX/IXIC 落后 QQQ 超过 7 calendar days 输出 `WARN`；history/metrics 错位、无效/未来日期或 active 资产缺数据输出 `FAIL`。`review:market-pricing-freshness` 默认不联网、不写 artifact/production data；`--strict` 仅供人工硬复核。该 review 不改变三资产角色、60 周算法、display-only 边界或 M-91 manual-only ingestion policy。

### Frontend asset cache version

bofa-report-review-1 Frontend Asset Cache Busting 只定义前端静态资源版本契约，不改变 Worker runtime、Brent promotion、sourceProbe、secondary diagnostics、KV 或 `data/*.json` / `realtime/*.json`。本轮触发原因是BoA消费证据行新增独立报告月份/旧值/缺失提示；cache busting用于避免浏览器沿用旧renderer/module graph，保留既有ODP新闻及宏观证据展示。

当前前端资源 cache 版本以 `scripts/app.js` 的 `APP_VERSION` 为准（现 `bofa-report-review-1`）。

要求：

- `index.html` 入口 module script 必须指向 `app.js?v=bofa-report-review-1`。
- `scripts/app.js` 与当前前端入口实际加载的 `scripts/modules/*.js` 本地相对 `.js` import 必须使用 `?v=bofa-report-review-1`；M-94 后有意冻结且当前未接入的 `scripts/modules/realtime.js` 不属于当前前端 runtime 入口,其 import query 不应随当前 asset bump 更新,由 `check:realtime-js-frozen` 守住。
- 核对线上版本:看 `scripts/app.js` init 时的 console 行 `[app] … APP_VERSION=<版本>`(当前 `bofa-report-review-1`),或检查已加载的 `app.js?v=…` URL token;两者须与 `?v=` 一致。
- frontend asset cache version must be bumped when index.html or frontend JS changes：以后修改 `index.html`、`scripts/app.js` 或当前入口实际加载的 `scripts/modules/*.js` 时，必须同步 bump version 并替换相关本地 module import query；冻结的 `scripts/modules/realtime.js` 仅在另开版本重新接入时再纳入。
- 只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json` 或只 deploy Worker 不需要 bump。

v28.0G-9B Frontend Asset Version Bump Helper 新增本地维护工具：

```bash
node scripts/bump-frontend-asset-version.mjs bofa-report-review-1
npm run bump:frontend-asset-version -- bofa-report-review-1
```

该工具用于以后前端 HTML / JS 改动时统一 bump cache version。当前正式版本仍是 `bofa-report-review-1`；它只更新前端 asset version、contract 和相关文档，不访问网络、不写 KV、不写 `data/*.json` / `realtime/*.json`、不 deploy Worker。Worker runtime 改动不需要 bump frontend asset version，除非同时改 `index.html`、`scripts/app.js` 或当前入口实际加载的 `scripts/modules/*.js`。

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

`asOf`(nullable ISO):baseline 值的真实生成时间 —— 主路径=本轮 isoNow;降级路径=沿用承载旧值那轮的时间戳(prevInputs.asOf ?? 上一份 updatedAt)。诊断/展示用,不进 scoring/decision/execution/position/values/cross-validation。

## 主分数校准与尾部风险 overlay

2026-06-16 起，Daily 主分数新增两个审计字段：

- `riskCalibration.dxyBroadDollar`: 记录 FRED `DTWEXBGS` 广义美元指数如何映射为 `dollarRisk`。映射方式从旧的单点线性公式 `dxyBase=95` / `dxyScale=8`，改为 `config/rules.json` 中 `riskCalibrations.dxyBroadDollar` 的 2006-01-01 至 2026-06-16 历史分位 piecewise calibration。`values.dxy` 的数据源仍为 GitHub `realtime-data` / `displayInputsBaseline`，Yahoo `DX-Y.NYB` secondary 仍只属于 diagnostics，不参与主值。
- `tailRiskOverlay`: 记录六模块加权基础分 `baseScore` 之后，是否因已验证的组合型尾部风险触发条件而设定条件性 floor。当前 overlay 只使用现有主输入与现有结构性 macroDrivers 派生风险，不新增外部源；它会影响 `score`、`decisionModel.stateScore`、execution / position 相关 downstream 判断，因此不是 display-only 字段。

`tailRiskOverlay.method` 当前为 `conditional_tail_floor_v1`。触发条件必须是多输入组合，例如波动率与信用同步冲击、能源与通胀尾部冲击、曲线倒挂与银行压力共振；不得因单一路径、单一新闻或单一代理源直接抬升主分数。

## 主分数 Wind paid fallback 契约

2026-06-18 起，Wind paid fallback 被定义为 **GFRR 主雷达核心分数的付费兜底候选源**，不再被一概限制为 display-only。正式契约见 `config/main-score-source-policy.json`，当前版本为 `main-score-source-policy-v1`。

允许范围严格限定为核心输入：`brent` / `dxy` / `vix` / `hyOas` / `us10y` / `real10y` / `breakeven10y` / `spx`。当且仅当对应官方或既有公共主源不可用、stale、结构性阻断或显式 degraded，并且 Wind 值通过 freshness、plausibility range 与 conflict tolerance 检查时，Wind 兜底成功可以进入 `values.*` / `displayInputsBaseline`，并参与 GFRR 主雷达核心分数。成功进入评分路径时必须记录 `sourceMode=wind_paid_fallback`、`paidWindFallback=true`、`participatesInMainScore=true` 与 `sourceConflictAudit`。

冲突仲裁规则：fresh official/public primary 永远优先；Wind 不得覆盖仍然 fresh 的官方或既有公共主源。如果 public primary 与 Wind 同时 fresh 但超过 `main-score-source-policy-v1` 的容差，public primary 胜出，Wind 只可作为冲突注记。若 public primary stale/blocked 而 Wind fresh 且 plausible，Wind 可作为实际评分输入，但必须保留原始时间戳、source priority、fallback reason、divergence diagnostics 与是否触发 source switch 的审计字段。

分数影响守门：Wind source switch 不得在缺少独立确认时自动造成超过契约阈值的主分数跳变、跨多档跳变、yellow/red 风险档位自动降级或 `tailRiskOverlay` 开关翻转。触发该守门时，Wind 值仍可作为 paid fallback evidence 记录，但自动评分输入必须进入 `review_required_or_independent_confirmation` 路径，直到有独立确认或下一轮公共主源恢复。

回放验证规则：任何 runtime Wind source-switch 实现前，必须运行 `npm run audit:main-score-backtest` 并检查报告字段 `windFallbackPolicy`。该回放使用 `wind_fallback_conflict_replay_v1`：不调用 Wind、不消耗 Wind 额度，而是在 2006 至今的公共历史序列上注入三组 Wind/public-source 冲突压力场景，验证事件窗口仍通过、`p95AbsScoreDelta` / `maxAbsScoreDelta` / `tierFlipPct` / `calmWindowAvgAbsDelta` 均未越界。`windFallbackPolicy.pass=false` 时不得启用 Wind 写入主分数输入。

2026-06-18 runtime 加固后，Daily pipeline 实现 `wind_paid_invalid_leaf_fallback_v1`：只有当整体 realtime payload 先通过 `canUseRealtimePayloadValues`，且某个核心叶子输入满足 `current_value_missing_or_nonfinite` / `source_detail_not_ok` / `source_status_missing_or_fallback` 时，才允许在 `GFRR_MAIN_SCORE_WIND_FALLBACK=1` 且 `WIND_API_KEY` 存在的情况下调用 Wind。该路径不合成完整 realtime payload，不覆盖有限且未显式 stale/fallback/degraded 的 official/public primary。

Daily 输出可包含根层 `mainScoreSourcePolicy` 审计对象，记录 `contractVersion=main-score-source-policy-v1`、`mode=wind_paid_invalid_leaf_fallback_v1`、runtime 开关状态、candidate/applied/reviewRequired/skipped inputs、`sourceConflictAudit` 与分数影响守门结果。该对象不得保存 raw Wind response、Authorization header、cookie 或 API key。若某个 Wind 值通过仲裁进入主分数，Daily 会在内部 scoring realtime 副本上标记 `sourceMode='live-with-fallback'`，并在对应输入的 source detail 中记录 `sourceMode='wind_paid_fallback'`、`paidWindFallback=true`、`participatesInMainScore=true`、`sourceConflictAudit`、`observedAt` 与 `fetchedAt`。

`mainScoreSourcePolicy.status` 当前允许：`skipped_realtime_trust_gate`、`skipped_no_candidates`、`skipped_disabled`、`skipped_no_wind_key`、`evaluated_no_switch`、`applied`、`review_required`、`error`。`applied` 才表示 Wind 已实际进入本轮主分数；`review_required` 表示 Wind 取得候选值但因冲突容差或分数影响守门未自动写入评分输入。

## dailyRealtimeInput 契约

`data/radar-data.json` 根层应包含：

```json
"dailyRealtimeInput": {
  "branch": "realtime-data",
  "commitSha": "string|null",
  "updatedAt": "ISO string",
  "sourceMode": "live|degraded|live-with-fallback|cache-only|fallback|mock",
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

GitHub `realtime-data` fallback producer 可在 `brentValidation.promotion` 中记录受控晋升：仅当 FRED `DCOILBRENTEU` anchor 观测时间超过 72 小时，且 ICE/Barchart/Stooq/MarketWatch/Oilprice/Yahoo 候选形成多源共识时，才允许把 `values.brent` 晋升为 `promotion.selectedValue`。晋升分两档：`high-confidence-consensus` 需要 `consensus.confidence="high"` 与 `canPromoteToPrimary=true`；`stale-anchor-guarded-medium-consensus` 只允许在 stale anchor 场景下使用，且必须有两条非 FRED 参与源、最佳配对偏差 `selectedPairDivergencePct <= 0.5`、至少一个 high-quality source、无 `weakConfirmation`。晋升必须同时记录 `anchorValue`、`anchorObservedAt`、`anchorAgeHours`、`selectedSource`、`selectedObservedAt`、`selectedPairSources`、`selectedPairDivergencePct`、`anchorDivergencePct` 和 `reason`。这不改变 Worker 的 G-4C hard gate：Worker Brent promotion 仍要求 Yahoo fresh + Trading Economics observedAt fresh。

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
- **Stooq `stooq:brn.f` / `stooq:brn.c` worker diagnostic candidate 已于 F6（2026-06-02）删除**；Brent candidate hygiene 现仅含 Google Finance `html-experimental` diagnostic + Yahoo / Trading Economics confirmation。（Stooq 的实时 Brent consensus 候选在 `scripts/run-realtime.mjs` `/q/l/?s=cb.f` 不受影响、未删。）
- `brentValidation.audit.candidateSources` 对 Google Finance 应提供 `source`、`role`、`participatesInConsensus`、`status`、`value`、`observedAt`、`error`、`reason` / `exclusionReason` 与 `quality`。

当前 Brent 主值逻辑仍是 FRED anchor + Yahoo `BZ=F` / Trading Economics confirmed promotion。Google Finance HTML experimental **不是可靠诊断源**。Google Finance 失败不得影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。

### Brent source probe

v28.0D-8B-lite 起，Worker generated preview 可在 `brentValidation.sourceProbe` 中附带低频隔离的 Brent source probe：

```text
brentValidation.sourceProbe
```

该字段只用于调查 Google Finance 是否存在稳定可用路径，不是 promotion 逻辑修复。它不得参与 `values.brent`、`brentValidation.consensus`、`brentValidation.promotion`、Worker-first strict gate、scoring 或 decision。

sourceProbe 每 **60** 分钟最多运行一次。生成新 main preview 前会读取上一轮 main preview 摘要；如果上一轮 `brentValidation.sourceProbe.generatedAt` 距今小于 60 分钟，则复用上一轮 `probes`，并标记 `reused: true` 与 `reason: source-probe-reused-within-60m`。该复用只使用既有上一轮 main preview KV read，不新增独立 KV key，也不增加 KV write 次数。

当前 sourceProbe 只保留最多 2 个 Google Finance probe（**Stooq `brn.f` / `brn.c` / `bz.f` 三路 worker probe 已于 F6（2026-06-02）删除**）：

- Google Finance canonical：`https://www.google.com/finance/quote/BZW00:NYMEX`
- Google Finance front-month：`https://www.google.com/finance/quote/BZY00:NYMEX`

Google Finance probe 用于记录 `httpStatus`、`contentType`、`bodyLength`、`finalUrl`、保守解析状态、`parsedValue`、`parseMethod`、`reason` 与小型 snippet / pattern 名称。解析不得接受 `value <= 0`，也不得把无法可靠定位主 quote price 的 HTML 标为 `ok`；此时应记录 `unreliable-html-parse` 或等价原因。

`sourceProbe` 必须保持小型：不保存完整 HTML，不保存完整 CSV，样本行最多 3 行，snippet / sample 字符串应截断。Google Finance probe 即使成功，也仍是 diagnostic-only；只有后续某个 probe 连续稳定，才可另开 D-8C 讨论是否升级为 validation source。当前 Brent 主逻辑仍是 FRED anchor + Yahoo `BZ=F` / Trading Economics confirmed promotion。

**sourceProbe findings（结论型快照，diagnostic-only）**：典型线上结果表明，Google Finance probe **未提供可靠 Brent primary quote**。下列 `parseStatus` 仅用于判断是否“存在稳定可用路径”，**不是** Brent 主值，也 **不构成** consensus / promotion 输入：

| probeId | parseStatus |
| --- | --- |
| `google-finance:BZW00:NYMEX` canonical | `unreliable-html-parse` |
| `google-finance:BZY00:NYMEX` front-month | `unreliable-html-parse` |

在上述观测窗口内，Google Finance **不得** 升级为 Brent validation source，也 **不得** 进入：

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

### World Order Stress history overlay snapshot

Daily history records may optionally include a `worldOrderStress` nested object on both `data/radar-history.json` and `data/radar-history-full.json`.

```json
"worldOrderStress": {
  "score": 72,
  "state": "multi_theater_stress",
  "labelZh": "多战区压力期",
  "observedAt": "2026-05-27T23:59:04.613Z",
  "confidence": 1,
  "freshness": "fresh"
}
```

Contract:

- `observedAt` is copied from `data/world-order-stress.json.updatedAt`; it is not the Daily snapshot date.
- The field is optional for old records and must remain backward compatible.
- The field is history/display-only. It does not enter scoring, `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, Invalidation Rules, Worker runtime, `displayInputsBaseline`, or `effectiveDisplayInputs`.
- No backfill is allowed. Historical records before this stage remain unchanged.
- Daily reruns on the same date must not erase an existing same-day `worldOrderStress` object if the current World Order file is missing or invalid.
- Frontend overlay trend rendering must treat insufficient history and stale observedAt separately: insufficient history may render a current-value reference line; stale tail rendering must preserve accumulated real history and only extend the tail horizontally.

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

> **External AI staged-rollout 历史阶段账本（style-B 折叠）:** 以下 `v28.0L-3H → v28.0M-3H-1` 各段记录旧 `externalAiInterpretationLayer` 从 provider-call 试验 → production 写入 → visible 展示的历史过程。该层现只保留 data compatibility、无可见消费者或 scheduled refresh；当前可见首页 AI 以 `macroRiskEditorialLayer` 契约为准。完整历史见 git history 与对应 `EXTERNAL_AI_*.md` 设计文档。

## v28.0L-3H External AI provider artifact boundary

`External AI Manual Provider Test` workflow 的 DeepSeek artifact 为 non-production、validator + quality-gated、`promotionEligible=false`;不进 `data/radar-data.json` / live layer / scoring·decision·execution·position。

## v28.0L-3H-1 provider-call audit data boundary

Run `25592238444` 首个 `fixture_sample` provider-call:output 验证过、quality review `needs_prompt_revision`、diagnostic JSON 因含 forbidden marker `DEEPSEEK_API_KEY` 被 artifact sanitizer 拦;均 non-production diagnostics,不进生产路径。

## v28.0L-3H-2 prompt quality revision data boundary

仅改 prompt / quality 指引;无 production data contract 变更;artifact 仍 non-production。

## v28.0L-3H-3 second fixture provider-call audit data boundary

Run `25593082968` 审计第二条 `fixture_sample` provider-call(transport/validation/quality/sanitizer/upload 全过);仍 non-production diagnostics。

## v28.0L-3I local_compact provider artifact data boundary

设计 future `local_compact` provider-call 路径;input/output artifact 仍 ignored / non-production,不进生产路径。

## v28.0L-3J local_compact workflow artifact data boundary

实现 `local_compact` provider-call workflow 路径(PR 内不跑 provider call);artifact 仍 non-production。

## v28.0L-3J-1 local_compact source metadata exception

compact input artifact 可只读引用 `data/radar-data.json` 作 source metadata;不等于上传/写 production data,artifact 仍 ignored / non-production。

## v28.0L-3J-3 local_compact execution-language output boundary

Run `25598379612`:quality review 正确拦截复述 `decisionContext`「执行灯」的 artifact;`decisionContext` 仅只读背景,output 不得复述 decision/execution/position 字段。

## v28.0L-3J-4 local_compact provider-call audit data boundary

Run `25598887574` 审计 `local_compact` provider-call 全链路过;仍 non-production,当时 production write/frontend/Daily 均 `not_ready`。

## v28.0L-3K production readiness data boundary

production integration readiness review;当时结论 production 仍 disabled / `not_ready`,future contract 设计须另开 reviewed phase。

## v28.0L-3L externalAiInterpretationLayer production contract design

设计 future production 契约([`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md));当时未实现、未写 production。要求:任何 write 前须有 production contract validator,拒不安全 execution/investment/trading wording、secrets、headers、raw dumps、stale artifacts、坏 provenance/freshness 及任何 scoring/decision/execution/position 影响。

## v28.0L-3M externalAiInterpretationLayer validator scaffold

新增 `npm run check:external-ai-production-contract` + valid fixture;字段当时仍未写入 `data/radar-data.json`。

## v28.0L-3N externalAiInterpretationLayer projection dry-run

新增 `npm run check:external-ai-production-projection`(只在 `manual-artifacts/external-ai/` 产 ignored projection);production write 当时仍 NO-GO,future write 须先过 contract validator。

## v28.0L-3O externalAiInterpretationLayer first write guard

新增 first-write 设计 + `npm run check:external-ai-production-write-guard`(在 frontend display approval / `promotionEligible=true` / 任何 scoring·decision·execution·position 影响时 fail);首次 write 须为独立 data-only PR。

## v28.0L-3P externalAiInterpretationLayer first controlled write

从 run `25598887574` 首次把 validated layer 写入 `data/radar-data.json`(当时 `displayEnabled=false` / `frontendDisplayApproved=false` / `promotionEligible=false`,data-only 非可见,不影响 scoring/decision/execution/position)。

## v28.0L-3P-1 externalAiInterpretationLayer first write audit

首次 data-only write 的 post-merge 审计通过(当时仍 `displayEnabled=false`、非可见);后续编辑须走 write script + production contract validator + write guard。

## v28.0L-3Q externalAiInterpretationLayer frontend display design

新增 [`EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md`](EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md)(文档-only);可见展示须 `displayEnabled=true` + `boundaries.frontendDisplayApproved=true`(当时两者仍 false)。

## v28.0L-3R externalAiInterpretationLayer hidden frontend scaffold

新增防御性 frontend scaffold:两 flag 非 true 时隐藏/清空 panel,不改 `data/radar-data.json`,不影响 scoring/decision/execution/position/Heatmap。

## v28.0L-3S externalAiInterpretationLayer visible display flag design

设计将 hidden scaffold 转可见的审批 + data-flag 流程(当时两 flag 仍 false,本阶段不改数据)。

## v28.0L-3T externalAiInterpretationLayer visible display flags

**历史上经数据 flag 启用 production external AI panel:`displayEnabled=true` + `boundaries.frontendDisplayApproved=true`(= 当时 visible 态)。** 仅批准展示(不批 provider rerun / AI text 改);`qualityReview.promotionEligible=false` 与 `boundaries.affectsScoring/DecisionModel/ExecutionLock/PositionGuidance=false` 仍必需。该 panel 现已退场。

## v28.0L-3T-1 externalAiInterpretationLayer visible display audit

visible display flag 态 post-merge 审计通过(`displayEnabled=true` + `frontendDisplayApproved=true` + 全部 affects*=false + `promotionEligible=false`)。

## v28.0L-3U-1 externalAiInterpretationLayer UX audit

visible display UX polish post-merge 审计通过,未改 `data/radar-data.json` / data contract / AI 文本;future 更新仍须过 contract validator + write guard + frontend scaffold check + `check:data` + `check:all`。

## v28.0L-4A externalAiInterpretationLayer production refresh

新增 `External AI Production Refresh` workflow 为 production layer 受控更新路径:只可改 `data/radar-data.json`,commit 前须过 production contract validation + write guard + frontend scaffold check + `check:data` + `check:all`;保留 `displayEnabled=true` / `frontendDisplayApproved=true`,`qualityReview.promotionEligible=false` 仍必需,不影响 scoring/decision/execution/position/Daily/Heatmap。

## v28.0L-4A-1 externalAiInterpretationLayer refresh audit

首个 refresh workflow 更新成功(run `25611392014`,commit `c32af65`):只 commit `data/radar-data.json`,未碰 manual artifact / 前端 / script / workflow / package / config / realtime / Worker;contract validation + write guard + protected-path assertion 均必需。

## v28.0L-4B externalAiInterpretationLayer display coverage

现有 layer 字段可作 capped / safe / read-only 摘要展示(`modelJudgments` / `scenarioHypotheses` / `sourceAttribution` / `qualityReview` 仍为 production data 字段);raw provenance / run ID / artifact ID / artifact path / raw headers / raw output 不展示;不影响 scoring/decision/execution/position/Daily/Heatmap。

## v28.0L-4B-1 externalAiInterpretationLayer display coverage audit

display coverage polish 不改 production contract;raw provenance / artifact IDs / run IDs / raw provider output / raw `decisionContext` 仍为 non-display;future data 改动仍须过 production contract validation + write guard。

## v28.0M-3H externalAiInterpretationLayer preservation

**【当前兼容规则】** `data/radar-data.json` 的普通 Daily refresh 可继续原样保留 contract-valid `externalAiInterpretationLayer`，不得编辑其历史文本或放宽 non-impact 边界；该字段没有可见消费者，也没有批准的 scheduled provider 写入路径。若字段缺失或 contract-invalid，Daily 可 fail-soft 写入 disabled scaffold，且不得阻断主数据构建或影响当前 `macroRiskEditorialLayer`。

## v28.0M-3H-1 externalAiInterpretationLayer preservation audit

**【当前兼容规则】** preservation hotfix 的数据兼容性仍保留：contract-valid legacy field 原样保存；缺失或 invalid 时可写 disabled scaffold。无论旧字段 flags 为何，前端不得消费；Daily 不得生成 provider 文本或调用外部 AI。任何兼容逻辑改动仍须过 production contract validation + write guard + `check:data` + `check:all`。

## v28.0M-4 macro overview read-only derivation boundary

Macro Overview 是前端只读派生层:render 不得 mutate `data/radar-data.json`、不得伪造 Nasdaq/QQQ 周历史/MA60/标准差/z-score,不影响 scoring/decisionModel/executionLock/positionGuidance;Global Risk Heatmap 为独立 display section(非嵌入 macro overview 卡内)。

### macro-overview-narrative-v1 local narrative planner

`scripts/modules/macroOverviewNarrative.js` 是首页 Macro Risk Overview 的本地叙事计划层。它只在浏览器前端读取已加载的 `radar-data.json`、`world-order-stress.json`、`market-pricing-metrics.json` 与独立 `oil-directional-pressure.json`,生成 render-time evidence pack / narrative plan / Hero concise verdict headline / Hero verdict body;不写任何 `data/*.json` 或 `realtime/*.json`,不调用外部 AI,不影响 scoring / `decisionModel` / `executionLock` / `positionGuidance` / cross-validation / Global Risk Heatmap。

叙事计划版本固定为 `macro-overview-narrative-v1`,source mode 为 `local_frontend_evidence_pack`。当前 sections 必须至少覆盖:

- `scorecard`:综合风险分、六模块红黄绿计数、World Order 升档语气。
- `oil_directional_pressure`:只读引用 ODP finalBias / 物理链 / 全球慢变量确认,用于解释油价方向压力;不得把 ODP 并入 scoring 或第七模块。
- `market_credit_confirmation`:市场温度、信用利差、VIX 反证。
- `policy_liquidity`:美联储政策、美元、长端利率、回购/逆回购水位。
- `conclusion`:触发条件与失效条件。

Hero headline 必须是类似 Bubble Watch 的短 verdict label,当前允许 `系统性顶部` / `高风险预警` / `中度警戒` / `观察期` / `判读待确认`;不得直接渲染 `dailyBrief.oneLineConclusion`,不得把“今日主线/最大背离/风险链箭头”放入大标题。长链条与背离信息应进入 Hero body 或 footer。

长度预算由 `MACRO_OVERVIEW_NARRATIVE_BYTE_BUDGET` 守门,当前为 900-2200 UTF-8 bytes;超出时使用 compact section 文案。`npm run check:macro-overview-narrative` 复算真实数据下的 narrative plan,要求 concise headline、至少 5 sections、12 evidence highlights、正文显式包含 ODP/油价/布伦特/信用/World Order 证据,并验证该 planner 未被 Daily、scoring、decision、realtime 或 cross-validation 路径引用。

## v28.0M-5 market pricing temperature design boundary

### (Pre-M-24 / M-26 / M-27 Baseline - Historical Reference)

The following M-5 through M-16 market-pricing sections preserve staged baseline language from before M-24 history write, M-26 metrics calculation, and M-27 frontend activation. Current production state is `status=has_history`, with M-26 MA60 / standard deviation / z-score calculation and M-27 frontend temperature display active. The display-only and no scoring / decision / execution / position boundaries still apply.

M-5(design-only):future `marketPricingTemperatureLayer` 须 display-only、须足够周观测才计算、不得伪造 Nasdaq/QQQ/MA60/标准差/z-score、不影响 scoring/decision/execution/position。

## v28.0M-6 market pricing history scaffold contract

(scaffold 阶段)`data/market-pricing-history.json` 当时 `status=waiting_for_history` / `sourceMode=scaffold_only`、records 空、须 ≥60 周观测才算 MA60/z-score、SPX 仅 fallback 候选、不进 scoring/decision/execution/position。

## v28.0M-7 market pricing source adapter dry-run boundary

(scaffold)source adapter dry-run report 为本地 non-production、不 commit、不含价格/计算/信号、不写 `data/market-pricing-history.json` 或 `data/radar-data.json`。

## v28.0M-8 market pricing artifact-only fetch design boundary

(design)future artifact-only fetch report 非 production、不 commit、须 validate + sanitize 后才考虑 history write;history records 当时仍空、不进 scoring/decision/execution/position。

## v28.0M-9 market pricing artifact fetch scaffold boundary

(scaffold)artifact-fetch scaffold report 为本地 non-production、不 commit、不含 fetched records/计算/信号;即便 `--allow-network` 也须拒网络;不写 history / radar-data。

## v28.0M-10 market pricing artifact sanitizer scaffold boundary

(scaffold)artifact-sanitizer scaffold report 非 production、不 commit;sanitizer 须拒 secrets/headers/cookies/tokens/source-URL/计算/交易建议/write flags;PASS ≠ 批准 history write(`readyForProductionWrite=false`)。

## v28.0M-11 market pricing real-record contract design boundary

(design)`docs/MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md` 定义 future real-record 契约;schema-only fixture `records=[]`、history 当时空;future real records 须过 sanitizer + 独立 history-write 审批,计算须 ≥60 周观测。

## v28.0M-12 market pricing real-record sanitizer scaffold boundary

(fixture-only)M-12 synthetic real-record fixtures(`assetKey=fixture_asset` / `symbol=FIXTURE`,**非** QQQ/NDX/IXIC/SPX);`recordsAcceptedForHistory=0`、`readyForProductionWrite=false`、无 MA60/z-score 计算。

## v28.0M-13 market pricing source selection review boundary

(fixture)source-selection review 仅记审查状态:无源批准 live fetch,`sourceSelectionFinalized/liveFetchApproved/productionDataWriteApproved/historyWriteApproved=false`,无 URL/endpoint/secret,history 空。

## v28.0M-14 market pricing proof-of-source design boundary

(fixture)proof-of-source design 仅记设计 metadata(QQQ 仅 target metadata);无源批准,全 approval flags=false,无 URL/secret,history 空,radar-data 不变。

## v28.0M-15 market pricing source-specific artifact fetch scaffold boundary

(fixture/scaffold)source-specific scaffold 仅记状态(QQQ=target、Stooq/public CSV 仅候选 label);无源批准 live fetch,approval flags=false,无 records/URL/secret,history 空。

## v28.0M-15A unified data pipeline architecture boundary

统一数据管线分层:`data/radar-data.json`=Daily/production display、`data/market-pricing-history.json`=`daily_history_layer`、realtime=`realtime_worker_layer`、backup=`github_actions_backup_validation_layer`、market-pricing artifacts=`artifact_sanitizer_layer`、frontend market-pricing=`frontend_display_layer`;不允许 isolated pipeline,architecture-sync checks 不写任何 data 文件。

## v28.0M-16 market pricing network gate design boundary

(fixture)network-gate design 仅记状态:`networkGateApproved/networkGateOpen/networkAllowed=false`,无 history write,无 URL/secret,history 空,radar-data 不变。

## v28.0M-7U homepage IA frontend-only boundary

仅改首页呈现,不动数据契约:Macro Risk Overview 只读派生、Daily Brief = 证据明细(非重复主判断)、External AI 受 production contract + display gate 管、Global Risk Heatmap 独立;frontend asset cache 版本以 `scripts/app.js` 的 `APP_VERSION` 为准;不改 `data/*.json` / `realtime/*.json` / scoring / decision / execution / position。

## v28.0M-7V homepage reading path frontend-only boundary

仅修首页导航/分组:不改任何 `data/*.json` / `realtime/*.json` / config;Macro Overview 只读派生、Daily Brief = 证据明细、External AI 只读受 display gate、Heatmap 独立;不改 scoring / decision / execution / position / Worker / workflow。

## v28.0M-7V-1 homepage reading path audit-sync data boundary

文档-only audit-sync:不 mutate `data/radar-data.json` / `data/market-pricing-history.json` / `data/*.json` / `realtime/*.json` / config;Macro Overview 只读派生;External AI / scoring / decision / execution / position 契约不变。

## bubble-watch 专题数据契约 (ADR-0016 / ADR-0019)

`data/bubble-watch.json` + `data/bubble-watch-history.json` 是第二页面「AI 泡沫监测」(`bubble-watch.html`)的专属数据,由 `scripts/build-bubble-watch.mjs` 周一 cron(`refresh-bubble-watch.yml`)生成,**display-only**:不进 scoring / decisionModel / executionLock / positionGuidance / `values.*` / `displayInputsBaseline` / `effectiveDisplayInputs` / cross-validation;主站 `scripts/app.js` 与 `index.html` 不得读取(`check:bubble-watch` boundary leaf 机器强制)。周二至周五的 `.github/workflows/audit-bubble-watch-sources.yml` 只是 source-health 只读审计:调用 `scripts/audit-bubble-watch-sources.mjs`,运行 builder 后恢复生产文件,只上传 artifact,不 commit、不 deploy;scheduled 默认 `BUBBLE_WATCH_DISABLE_WIND=1`,只有手动 dispatch paid opt-in 才可注入 `WIND_API_KEY`。

latest 文件关键字段:

- `contractVersion = "bubble-watch-v2"`;`issue_number`(周自增);`as_of_date`。历史文件为 `bubble-watch-history-v2`。
- `indicators[27]`:固定展示 id 集(见 `scripts/check-bubble-watch.mjs` EXPECTED_IDS),每项新增 `score_role = core | shadow`,并保留 `axis(stage|trigger) / category / name_en / name_zh / status(red|yellow|green) / value_display / note / threshold_text / source_name / as_of / stale / provenance`。固定 Core-23 为 `cape / top5_weight / nvda_fpe / hyperscaler_capex_yoy / mag4_fcf_yoy / vc_ai_share / nvda_invest_revenue / breadth_50d / spy_vs_rsp_6m / insider_sell_buy / ai_ipo_pipeline / hy_oas / dc_abs_spread / debt_capex_ratio / neocloud_credit / token_volume_mom / arr_2nd_deriv / enterprise_deploy / cloud_rpo_growth / accounting_events / fed_policy / capex_reaction / ceo_hedging`;Shadow-4 为 `private_secondary_marks / token_revenue_ratio / gpu_rental_price / frontier_progress`。27 卡全部展示,Shadow-4 不得进入任何 v2 判读输入。
- `summary` 的 `red_count / yellow_count / green_count / display_red_pct / display_weighted_risk_score / total_indicators` 表示全 27 卡展示口径;`scoring_red_count / scoring_yellow_count / scoring_green_count / scoring_total_indicators` 表示 Core-23。**页面与判读主分数固定为 `primary_score_pct = red_pct = Core 红灯数 ÷ 23 × 100`**;`primary_score_basis = core_red_light_ratio`。`weighted_risk_score=(Core 红+0.5×Core 黄)/23×100` 只是核心黄灯调整压力分,可用于可比趋势辅助,不得作为阈值分档、Hero 主分数或 `verdict_desc` 的本周主判读分。
- Stage/Trigger、`category_scores`、分类共振、`momentum`、`similarity` 与 verdict 只允许消费 Core-23。Stage/Trigger 以核心轴内红/黄/绿 = 100/50/0 取均值;stage 四档为 30/50/70,trigger 四档为 25/45/65。`similarity` 还必须排除无 reviewed 历史类比的 `spy_vs_rsp_6m`,并为每个时期输出实际 `denominator` + `basis=core_calibrated_indicators_only`。`verdict_desc_source = bubble-watch-narrative-v2`;`narrative_plan` 来自本地 `local_indicator_evidence_pack`,必须披露 Core-23 / Shadow-4 边界。生产正文不得直接采纳上游 `summary.verdict_desc`。
- `scoring.model_version = bubble-watch-v2-core23-shadow4`,`primary_universe=core`,`core_indicator_ids[23]`,`shadow_indicator_ids[4]`,`shadow_policy=display_only_no_score_impact`。`shadow_promotion_policy` 禁止自动晋升,要求至少 52 周观察、fresh 可用率 ≥90%、历史代理/回填、非冗余消融、预登记目标样本外改善与独立 contract migration。主分四档仍为 25/40/60;升级顺序仍为核心分类共振(核心红灯占比 ≥50% 的分类 ≥2 个 → 至少高风险预警),再检查核心两轴共振(stage ≥60 且 trigger ≥50 → 至少高风险预警;stage ≥60 且 trigger ≥65 → 系统性顶部)。checker 必须全量 replay,并证明 Shadow-4 全红也不改变核心主分。
- `market_technical_heat`:独立「公开市场技术热度」审计子面板,`contractVersion = "bubble-watch-market-technical-heat-v1"`;只读 `Yahoo Chart v8` 免费公开日线价格,构造 NVDA/AMD/MSFT/GOOGL/META/TSLA/AVGO/ORCL 等权 AI 篮子并与 QQQ/SPY 对照,固定 5 项审计项(`relative_momentum_21d` / `rsi_14d` / `bollinger_pct_b` / `sma_200_deviation` / `correlation_beta_60d`)。该字段必须声明 `display-only` 与排除 Bubble Watch core/shadow scoring,**不得进入 27 卡灯色计数、Core-23 主分、Stage/Trigger、分类共振、`verdict_desc`、GFRR scoring/decision/execution/position 或任何交易建议**。
- `history_seed` 最多尾 10 个 Core-23 可完整回放周次,不得混入旧变分母点;历史 entry 的旧 `red_pct/risk_score` 保留原发布口径,`core_red_pct/core_risk_score/core_stage_score/core_trigger_score` 为 v2 可比回放字段。`wow_changes` 只以 Core-23 翻灯驱动。
- `meta`:`auto_count + curated_count + fallback_count = indicators.length`、`hybrid_count`、`paid_wind_fallback_count`、`proxy_confidence_calibration_count` / `proxy_confidence_calibrations`、`source_candidates`、`fetch_failures`、`boundary` 声明。旧数据可能暂缺 `source_candidates`,但下一轮 build 应写入 `contractVersion`、`hybrid_live_ids`、`hybrid_paid_optional_ids` 与 `candidate_only_ids`。

ARR公开里程碑解析安全：`arr_2nd_deriv` 只能读取明确绑定Anthropic、金额和
ARR/annualized run-rate口径的主张，其他公司、普通收入/季度收入、融资估值、
疑问/否定/条件或前瞻句不能补位。明确已审标题优先于回顾正文；固定SaaStr
325206仅保留已审短续句结构，不锁金额。日期必须是真实日历，45天陈旧门不变；
修复解析不授予新来源/新里程碑，也不得用页面抓取日刷新底层观察。

### Bubble Watch 周度 DeepSeek 编辑层（ADR-0021）

经 owner 于 2026-08-11 批准，`data/bubble-watch.json.summary.weekly_editorial` 可承载独立的周度 AI 编辑展示层，生产 schema 固定为 `bubble-watch-weekly-editorial-production-v1`。该字段与主页 `externalAiInterpretationLayer` 平行，不得复用或覆盖后者，也不得覆盖 `summary.verdict_desc` / `bubble-watch-narrative-v2`。它属于 `frontend_display_layer`，只解释既有 Core-23 / Shadow-4 结构化证据和经校验的周度新闻 context；不改变指标状态、主分、weighted pressure、Stage / Trigger、分类共振、momentum、similarity 或 verdict label。

合同家族固定为 `bubble-watch-weekly-news-discovery-v1` → `bubble-watch-weekly-editorial-input-v1` → `bubble-watch-weekly-editorial-output-v1` → `bubble-watch-weekly-editorial-review-v1` → `bubble-watch-weekly-editorial-production-v1`。transient discovery / input / provider output / review 均属于 `artifact_sanitizer_layer`，不得作为生产数据提交；DeepSeek 只读已通过 sanitizer 的 compact input，不浏览、不读取 secrets / raw response / headers / HTML / 完整文章正文。Tavily / Brave 只作新闻发现和交叉确认，`discovery_only` 不得成为事实性段落的唯一来源。

生产可见必须同时满足 `status=valid`、`displayEnabled=true`、`boundaries.frontendDisplayApproved=true`、`asOfDate === data.as_of_date`、`freshness.isStale=false`、`validation.status=pass` 和 `qualityReview.status in {pass,warn}`，且浏览器按 `generatedAt` 独立复核不超过 240 小时。`qualityReview.promotionEligible=false`、`provenance.humanApproved=false` 以及所有 scoring / decision / execution / position non-impact flags 恒成立。合格层可在 Hero 后展示 lead、证据时间线、指标综合、关键矛盾、分类分析、历史差异、下周观察/反证条件、数据缺口与可点击来源账本；来源 URL 只接受 HTTPS。`confidence.score` 固定为 0–100，provider 的 0–1 比例必须在 validator 前确定性换算，前端必须把 confidence / quality / source evidence class 内部枚举映射为中文。缺失、过期、as-of 不匹配、collector/provider 失败、invalid JSON、未知引用、unsafe wording 或 quality hard fail 时不得写入或展示，Hero 与正文继续使用规则生成的 `verdict_label` + `verdict_desc`。专用 writer 只能改变 `summary.weekly_editorial`，完整设计与验收见 [`BUBBLE_WATCH_WEEKLY_EDITORIAL_DESIGN.md`](BUBBLE_WATCH_WEEKLY_EDITORIAL_DESIGN.md) 和 [`ADR-0021`](ADR/0021-bubble-watch-weekly-editorial-read-only.md)。

Stage 3 实现后，production layer 内嵌 `output`、`sourceLedger`、`validation`、`qualityReview`、`provenance`、`freshness`、`fallback` 与 `boundaries`。`sourceLedger` 只投影 provider 实际引用的站内指标/context及新闻 title/HTTPS URL/domain/date/topic/evidence class，禁止保存 snippet、文章正文、provider raw response 或 headers。`sourceAttribution[]` 必须逐一覆盖所有实际引用；provider 漏列时，adapter 只可按 input `sourceRefs[]` 确定性补齐 attribution，不改 AI 正文、不新增引用、不提升新闻 evidence class。质量闸要求至少 1 个 official/cross_checked 新闻引用、至少 5 个 Bubble 指标和 4 个分类；0 条 official/cross_checked 仍是 provider/review/write hard stop。若 Tavily 与 Brave 全部 6 个 topic 查询均健康、但可信新闻为 0，workflow 必须在 provider 前以 `SKIPPED_NO_CREDIBLE_NEWS` side-effect-free expected skip 结束：DeepSeek calls=0、production writes=0，不创建 input/output/review/projection，且不得把单一媒体结果伪装成 official/cross_checked。任一搜索源不健康仍非零失败。若 Tavily/Brave 都成功但只形成 1 条可信新闻，discovery 必须标记 `partial`，quality review 必须 `warn`，`dataGaps` 必须披露覆盖限制，而其余 discovery-only 事实段落必须同时由站内指标支撑。quality review 的兼容窗口为 1,800–4,200 字。长度标定读取参考站近 12 个已提交周度版本（最近 5 期均值 2,947 字、P90 3,137 字、最大 3,278 字），因此 provider 实际生成目标为 2,600–3,400 字，并对各结构字段设置明确数量/字符硬上限；结构/引用/unsafe/边界错误则 hard fail。DeepSeek 配置锁定 `deepseek-v4-flash`、JSON object、8,000 tokens、120s、一次调用、retry=0；8,000-token 预算同时覆盖约 3,000 字可见正文之外的 stable IDs、引用、边界与 JSON 字段名。CLI 无 `--allow-network` 必须拒绝。User prompt 必须使用 compact JSON；parser 只额外容忍一个完整的 `json` markdown fence，解析后仍执行同一严格 output validator。Writer 需要 `--confirm-production-write --data-only`，目标硬锁 `data/bubble-watch.json`，并以删除 `summary.weekly_editorial` 后的全对象语义相等证明没有其它改动。

Bubble Watch responsive/data-contract acceptance 由 `check:bubble-watch-responsive-acceptance.mjs` 与 Playwright smoke 共同锁定：静态门禁要求 720px 单列 breakpoint、溢出安全的卡片 grid 和窄屏趋势标签抽稀；运行验收在 1440px/390px 读取实际 `data/bubble-watch.json`,核对 27 张分类卡、Core-23、Shadow-4、Hero 主分与 Stage/Trigger 数值，并要求 390px 无横向溢出、趋势 SVG 不越界。专属 JSON 503 时必须 fail-closed 到错误态且不残留证据卡/趋势；这不改变 `bubble-watch-v2` 数据、评分、前端视觉或任何 GFRR 决策边界。

2026-07-14 当前 authority:curated-origin 总数已由 12 增至 15;新增 `private_secondary_marks` / `gpu_rental_price` / `frontier_progress` 均为 `candidate_only`,复用现有 aibubble-cn 上游周报同步 + 本地 curated/maxAgeDays STALE 链,并分别登记 Forge/Caplight/Hiive、Thunder Compute/getdeploying、METR/Epoch AI/ARC Prize 公开来源。在形成稳定可比面板前不新增直接抓取器,不得把间歇性公开材料伪装成连续交易 tape 或统一 benchmark。下段「12 项」仅描述升级前既有 12 项的 hybrid/paid 路由细节,不再代表当前 curated-origin 总数或源矩阵覆盖数。

编辑/研究类 12 项是 **curated-origin** 而非全部永久人工:人工快照来源仍为 `config/bubble-watch-curated.json`(改 value/status/note + asOfDate 后触发 workflow),但 `config/bubble-watch-source-candidates.json` 必须覆盖 12 项源候选。当前 `vc_ai_share`、`ai_ipo_pipeline`、`debt_capex_ratio`、`neocloud_credit`、`token_volume_mom`、`token_revenue_ratio`、`arr_2nd_deriv`、`enterprise_deploy`、`accounting_events`、`capex_reaction`、`ceo_hedging` 为 `hybrid_live`,build 先尝试 Crunchbase News / SEC EDGAR S-1/F-1/424B4 filing confirmation / OpenRouter public rankings API / OpenRouter model-ranking+catalog pricing / CoreWeave-Lambda-Crusoe-Nebius public credit-event monitor / SaaStr ARR milestone monitor / Google Cloud-Deloitte public reports / SEC RSS + DOJ News API / Morgan Stanley public data-center financing research / StockAnalysis+Yahoo capex reaction proxy / GDELT / Tavily / Brave 等免费公开源自动覆盖;成功时 `provenance.mode=auto`,失败时 fail-closed 沿用 curated 快照并记录 `fetch_failures`。`arr_2nd_deriv` 的 SaaStr 路径必须解析最新 ARR 里程碑自身日期并对照 curated `maxAgeDays`;网页本轮抓取成功不得覆盖底层观测已超龄的事实,超龄时必须以 `arr_underlying_observation_stale` 失败关闭并回到较新的 curated 快照。source-health audit 只可在该精确 reason code 与 `arr_2nd_deriv` 配对、且回退行本身未 stale 并满足 `ageDays <= maxAgeDays` 时把它列为 policy-driven expected WARN;任何其它 ARR fetch failure、缺失 freshness 元数据或过期 curated 回退仍必须 FAIL。`capex_reaction` 的本地价格侧必须使用 `capex_reaction_multi_window_v1`:MSFT/META/AMZN/GOOGL capex acceleration × 21/63/126 交易日相对 QQQ/SPY 多窗口价格反应,红灯需要 capex 仍加速且至少两个窗口出现系统性惩罚,不得由单一 21 日相对收益噪音直接升红。`vc_ai_share` 的 Crunchbase parser 必须采用 `ai_sector_total_global_vc_sentence_v2`:优先解析 AI sector / total global VC 句子,不得把同篇文章中 OpenAI/Anthropic/xAI/Waymo 等少数巨额轮次的 `$188B / 65%` 当作全 AI 行业占比。SEC submissions / ownership XML 是 `insider_sell_buy` 的唯一 live 路径,按 CIK 读取 SEC EDGAR Form 4 ownership XML,只解析非衍生 P/S 交易金额并在 `provenance.detail.sources[]` 标注 `sec_form4_primary`。该路径和 EDGAR companyconcept 一样可能被数据中心/GitHub runner 403;不可达时必须 fail-closed 沿用带日期快照,不得使用明文 HTTP 源或伪造成功。P38 后,`ceo_hedging` 的顺序固定为 GDELT DOC compact cache/shared wrapper(`data/gdelt-bubble-watch-cache.json`,fresh 132h,stale 21d) -> Tavily Search API + Brave News Search API free-credit cross-check/fallback -> Wind paid final fallback;Tavily 需 `TAVILY_API_KEYS`,Brave 需 `BRAVE_API_KEYS`,GDELT fresh/stale cache 可作为第一来源,live 不可用时 Tavily/Brave 仍作为免费兜底。红灯必须在 GDELT/Tavily/Brave 中至少两源确认;单一路径命中不得绕过 `local_proxy_confidence_v1` 升红门槛。`dc_abs_spread` 为 `hybrid_paid_optional`:有 `WIND_API_KEY` 时尝试 Wind MCP 付费代理(数据中心 ABS 样本识别 + 中国 ABS AAA 收益率基准方向 + 金融新闻证据),无 Key/证据不足/调用失败时 fail-closed 沿用 curated。已登记 paid final fallback 的 hybrid 指标只有在免费/公开主源失败后才尝试 Wind 新闻/结构化兜底;成功时必须标注 `paidWindFinalFallback=true`,失败仍 fail-closed。Wind 输出必须标注为 paid proxy/fallback;样本券专属估值利差为空时不得写成正式数据中心 ABS 连续利差,`debt_capex_ratio` 不得写成单一债券发行额或正式 IPO calendar。Cloud RPO 仍优先 SEC EDGAR,但 EDGAR 对运行环境不可达或样本不足时可用 StockAnalysis/Fiscal.ai metrics 免费二级源(MSFT/AMZN/GOOGL 季度 operating metrics + ORCL 年度 metrics)自动覆盖;Wind announcement/fundamental 路径仅作人工排查备选,不得自动付费改灯。候选矩阵仍记录欧洲、中国/香港、新加坡与中文公开入口作校准,但不得把叙事材料伪装成实时自动指标。自动 12 项抓取失败同样 fail-closed 沿用 curated 快照并标注「实时抓取失败,沿用 YYYY-MM-DD 快照」。`mag4_fcf_yoy` 保留历史 id 与同一主分数权重槽,但展示/主口径改造为 Big5 capex/OCF:AMZN/MSFT/GOOGL/META/ORCL realized TTM cash capex ÷ Operating Cash Flow,采用 Epoch AI / Apollo 式 hyperscaler cash-flow coverage 逻辑以更敏感捕捉 AI capex 对现金流的挤压;自动发布必须五家公司齐全,并在 `provenance.detail.selfContractAudit` 记录公式、样本、聚合回放、阈值回放与 `sourceIndependence=does_not_require_external_reference_site`。判级固定为 `capex/OCF >=75% 或 >=2 家公司超过 100%` 红,`>=60% 或 >=1 家超过 100%` 黄,否则绿。Wind `stock_data.get_stock_fundamentals` 可用来复核 OCF/Capex 原始列,但 Wind 或其它源的自带自由现金流派生列、前瞻 FCF、levered/unlevered FCF、单家公司压力不得直接混入该指标,除非另开口径变更。`config.autoFallback.mag4_fcf_yoy` 必须是 `local_big5_capex_ocf_snapshot_v1` 本地 Big5 capex/OCF 备用快照,且在上游同步 blocklist 中;上游/参考站若存在,只可写入 `externalReferenceAudit` 作为可选非权威漂移提示,参考站消失或停更不得影响本指标发布、fallback 或灯色仲裁。

2026-08-14 当前 Form 4 authority:上段「SEC submissions / ownership XML 是唯一 live 路径」已由 reviewed Xoomar HTTPS fallback 与本次 `insider-form4-partial-live-coverage-v1` 取代。SEC 仍是权威主路径;SEC 对 runner 返回 403 时可使用 Xoomar 的 48h 内新鲜、schema 合法、open-market P/S 数据。固定 NVDA/PLTR/AVGO 篮子若仅一只瞬态失败,只有另外两只均 live 且合计卖买比 ≥5x 时才允许以 `coverageStatus=partial`、`provenance.mode=auto` 发布「高卖压·覆盖受限」黄灯,并必须记录 `successfulSymbols` / `missingSymbols` / `sourceFailures` / `partialCoveragePolicy`。source-health audit 必须把该状态列为 WARN,不得视作 full coverage PASS;若仅 1/3 可用、2/3 比率 <5x、标的重复/越界或 totals 异常,仍须 fail-closed 回带日期快照并保留硬失败。该容错不改变 Core-23 槽位、阈值、权重或 GFRR 主链边界。

`breadth_50d` 优先读取 Barchart `$S5FI`(S&P 500 Stocks Above 50-Day Average)直接广度指数;该源与上游模板站的 S5FI 口径对齐。Barchart 页面解析失败时才回退到 Wikipedia S&P 500 成份股名单 + Yahoo Chart 单票 50 日均线实算。无论直接源或 fallback,该指标只影响 Bubble Watch display-only 卡片,不进入 GFRR 主评分、decision、execution 或 position。

`fed_policy` 当前审计版本为 `provenance.detail.policyPathEvidenceVersion="fed_policy_path_v2"`:目标区间来自 FRED `DFEDTARL/DFEDTARU`,有效联邦基金利率来自 `DFF`,通胀压力来自 `CPIAUCSL`,政策路径证据来自 Federal Reserve SEP federal funds median 与 Yahoo 年末 ZQ Fed funds futures proxy。SEP 或年末 futures 明显高于当前 target mid 时可发布红灯「年末路径隐含加息」,该标签只描述年末路径,不得写成下一次会议的确定性加息预测;缺失 SEP/futures 时降级回 DFF+CPI 口径,但不得把 CPI 单一压力伪装成明确加息路径。

**代理源置信度校准**: `insider_sell_buy`、`ai_ipo_pipeline`、`capex_reaction`、`ceo_hedging`、`token_revenue_ratio`、`enterprise_deploy` 属于容易被单一路径新闻/搜索/平台代理源推高或误降的指标。若自动结果更严重,且未达到本地二次确认门槛(独立 Form-4/SEC 聚合、具体发行/待发公司数、直接指引惩罚证据或新鲜上游研究周报确认的系统性市场重定价、多唯一高管直接表态、OpenRouter 高覆盖且显著越线、第二调查源确认低部署率等),发布 `status/value_display` 必须按 `local_proxy_confidence_v1` 多源/样本规则校准;自动原始判级和值保留在 `provenance.detail.proxyConfidenceCalibration.rawStatus/rawValueDisplay`,兼容别名 `templateCompatibilityCalibration` 仅供旧本地读者过渡,并在 `meta.proxy_confidence_calibration_count` 与 `meta.proxy_confidence_calibrations[]` 汇总。`insider_sell_buy` 若备用样本触及记录上限且买入分母接近零,校准后的公开值必须显示「高卖压·覆盖受限」,并说明极端原始倍数不可与完整周期聚合直接比较。该机制不是 fetch failure,不得记入 `fallback_count`;`capex_reaction` 可将新鲜上游红灯周报作为本地多窗口价格代理红灯的研究确认锚。上游/curated 快照只可在 `maxAgeDays` 内作为显示值锚点;过期后必须按 STALE 暴露或显示自动代理原始值。

**上游周报自动同步**:每轮 build 先检查 aibubble-cn.github.io 上游周报(实际端点 = ai-bubble-monitor `latest.json`),上游 `as_of_date` 更新时自动采纳 curated/autoFallback 的 status/value_display/note 并回写 config(workflow 一并提交;`meta.upstream_sync.checked` 必为 true,checker 强制),但 `summary.verdict_desc` 不进入生产正文(`meta.upstream_sync.summaryAdopted=false`)。上游同步必须保留多层入口:GitHub raw `latest.json` -> 上游 GitHub Pages `data/latest.json` -> GitHub contents API 枚举 `docs/data/snapshots/YYYY-MM-DD.json` 并取最新快照;若 latest 入口失效但 snapshots 仍在,仍可拿最近一期。全部上游不可达/未更新则沿用现状、下个周期再查。history 文件由 build 维护(同 ISO 周覆盖、新周追加、保留 16 周),不得手改。
