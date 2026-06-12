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

### `macroDrivers.shippingFreight` / `energySpareCapacity` / `energyTransport` / `policyExpectations` / `privateCreditProxy` expanded ingestion contract (v28.0M-74 / M-77 / M-78 / M-79 / M-80 / M-81 / M-83 / Energy Stress Phase 2)

M-74 新增三条 audit-only / display-only 生产数据层；Energy Stress Phase 2 在 owner-approved OPEC implementation 中新增 `macroDrivers.energySpareCapacity`，并在 owner-approved PortWatch implementation 中新增 `macroDrivers.energyTransport`。这些字段均不进入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor、Invalidation Rules、World Order weights、Global Risk Heatmap 或 cross-validation matrix。

| Layer | Source | Required fields | Notes |
|---|---|---|---|
| `macroDrivers.shippingFreight` | StockQ:BDTI; StockQ:BCTI; StockQ:BDI | `balticDirtyTankerIndex`, `balticCleanTankerIndex`, `balticDryIndex`, per-index daily change, `tankerFreightRegime`, `freightStressRegime`, `sourceStatus` | BDTI / BCTI / BDI 是 shipping / freight pressure proxy；不得影响 Brent promotion |
| `macroDrivers.energySpareCapacity` | EIA:STEO:COPS_OPEC | `spareCapacityMbpd`, `latestPeriod`, `latestIsForecast`, `forecast12mMbpd`, `forecast18mMbpd`, `bufferRegime`, `sourceStatus.spareCapacity`, `limitationZh` | EIA STEO OPEC surplus crude oil production capacity monthly estimate/forecast；display-only slow variable；不得写成实时物理闲置桶数、OPEC 官方配额执行或油价预测 |
| `macroDrivers.energyTransport` | IMFPortWatch:Daily_Chokepoints_Data | `latestDate`, `latestAgeDays`, `windowDays`, `usageTermsPinned`, `redistributionCaveat`, `chokepoints.{suez,panama,bosporus,babElMandeb,malacca,hormuz,capeGoodHope,gibraltar}` compact latest + 7d/30d averages + deviations, `reroutingProxy`, `sourceStatus.chokepoints`, `limitationZh` | PortWatch AIS-derived chokepoint proxy；只提交 compact 派生摘要,不提交 raw AIS-derived history；writer emits `usageTermsPinned=imf_data_terms_pinned` after TOS pin Phase A,while validator temporarily accepts legacy `partial` until Daily proof;`redistributionCaveat=true` 必须保留；不得写成官方贸易统计、封锁确认、战争概率或油价预测 |
| `macroDrivers.policyExpectations` | FRED:DFEDTARL/DFEDTARU/DFF; Yahoo:ZQ=F/ZQ-monthly-futures/SR3-monthly-SOFR-futures; CheckMySwap:USD-OIS-public-curve; FederalReserve:FOMC statement/SEP/minutes | `targetLower`, `targetUpper`, `targetMid`, `effectiveFedFundsRate`, `fedFundsFutureImpliedRate`, `fedFundsFuturesCurve`, `sofrFuturesCurve`, `oisForwardCurve`, `dotPlotMedianCurrentYear`, `statementUrl`, `policyTone`, `minutesUrl`, `minutesPolicyTone`, `minutesTopicCounts`, `policyExpectationRegime`, `oisForwardStatus` | Fed dot plot 使用 federalreserve.gov SEP accessible table 的 federal funds median；ZQ=F 与 ZQ monthly futures 是 Fed funds futures proxy；SR3 monthly SOFR futures 是担保融资利率曲线 proxy；CheckMySwap USD OIS public curve 来自 DTCC/CFTC public swap data；`fomcminutesYYYYMMDD.htm` 只做 keyword NLP 计数 |
| `macroDrivers.privateCreditProxy` | Yahoo:BIZD; Yahoo:PBDC; Yahoo:SRLN; Yahoo:CCLFX; FRED:BAMLH0A0HYM2; FRED:BAMLC0A0CM; ICE:CDX-index-settlement-public | `bdcEtfPrice`, `bdcEtf4wChange`, `pbdcEtfPrice`, `pbdcEtf4wChange`, `seniorLoanEtfPrice`, `seniorLoanEtf4wChange`, `intervalFundNavPrice`, `intervalFundNav4wChange`, `intervalFundNavUpdatedAt`, `intervalFundNavSymbol`, `intervalFundNavStatus`, `hyOas`, `igOas`, `igMinusHyOas`, `cdxHyPrice`, `cdxHyInstrument`, `cdxHyUpdatedAt`, `cdxIgPrice`, `cdxIgInstrument`, `cdxIgUpdatedAt`, `cdxHyStatus`, `cdxIgStatus`, `privateCreditMarksStatus`, `privateCreditProxyRegime`, `sourceStatus` | BIZD/PBDC 是 listed BDC public proxy；SRLN 是 senior loan ETF proxy；CCLFX 是 public interval-fund NAV proxy；HY/IG OAS 是 cash-bond spread proxy；ICE CDX 是 public EOD settlement price；private credit marks 仍只保留 manual/licensed input 状态 |
| `macroDrivers.worldEconomy` | Yahoo:^STOXX50E; Yahoo:^N225; Yahoo:^GDAXI; Yahoo:^FTSE; Yahoo:^FCHI; Yahoo:^STOXX; Yahoo:^KS11; Yahoo:^AXJO; Yahoo:^STI; Yahoo:^TWII; Yahoo:^NSEI; Yahoo:^BVSP | `stoxx50`, `nikkei225`, `dax`, `ftse100`, `cac40`, `stoxx600`, `kospi`, `asx200`, `sti`, `taiex`, `nifty50`, `bovespa`, per-index `price`, `changePct`, `changeWindow`, `updatedAt`, `sourceStatus`, parent `sourceStatus`, `updatedAt`, `source`, `notes` | STOXX 50 / Nikkei 225 / DAX / FTSE 100 / CAC 40 / STOXX 600 / KOSPI / ASX 200 / STI / TAIEX / Nifty 50 / Bovespa 是 C5 世界经济 display-only 公开指数代理；`changePct` 为 5d window decimal ratio；Nifty 数据完整度略低(Yahoo 偶缺 bar,resolver 已过滤非正/非 finite 点);V2X 留 pending，本层不接入 scoring / decision / execution / position |
| `macroDrivers.euroVolatility` | DeutscheBoerse:quote_box:V2TX; STOXX(fallback) | `value`, `refDate`, `changePct`, `updatedAt`, `sourceStatus`, `source`, `notes` | VSTOXX / V2TX 是 C5 欧元区波动率 display-only 公开指数代理；主源为 boerse-frankfurt quote_box JSON(`DE000A0C3QF1`),STOXX 官页仅作 fallback；`refDate` 使用 Europe/Berlin 日期且 freshness 超过 5 自然日 fallback/missing；`changePct` 为 day-over-day decimal ratio；不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaEquity` | Yahoo:000001.SS; Yahoo:^HSI; Yahoo:000300.SS | `sseComposite`, `hangSeng`, `csi300`, per-index `price`, `changePct`, `changeWindow`, `updatedAt`, `sourceStatus`, parent `sourceStatus`, `updatedAt`, `source`, `notes` | 上证综指 / 恒生指数 / 沪深 300 是 C6 中国宏观 display-only 公开股指代理；`changePct` 为 5d window decimal ratio；China PMI / CPI / 10Y / CFETS 留 pending，本层不接入 scoring / decision / execution / position |
| `macroDrivers.inflationEnergy` | FRED:CPIAUCSL; FRED:CPILFESL; FRED:DCOILWTICO | `cpi` (`headlineIndex`, `headlineYoY`, `headlineMoM`, `coreIndex`, `coreYoY`, `coreMoM`, `yoyWindow`, `updatedAt`, `seriesStatus`, `sourceStatus`) and `wti` (`price`, `changePct`, `changeWindow`, `updatedAt`, `sourceStatus`), parent `sourceStatus`, `updatedAt`, `source`, `notes` | US CPI headline/core 与 WTI 是 C1 通胀与能源 display-only 公开 FRED 代理；CPI YoY/MoM 与 WTI changePct 均为 decimal ratio,render 层乘 100；tone 仅展示,不接入 scoring / decision / execution / position |
| `macroDrivers.copperGold` | gold-api:HG; gold-api:XAU(备援 Yahoo:HG=F/GC=F) | `copper` / `gold` leg objects (`symbol`, `labelZh`, `price`, `changePct`, `changeWindow`, `updatedAt`, `source`, `sourceStatus`), parent `sourceStatus.{copper,gold,ratio}`, raw `ratio`, `ratioChangePct`, `ratioWindow`, `updatedAt`, `source`, `notes` | 铜金比是 C2 全球流动性 display-only 公开现货价(gold-api HG/XAU 主源,Yahoo HG=F/GC=F 备援——不同厂商,两腿全覆盖,gold-api 宕机时整比率仍可出)；schema 存原始 `copper/gold` 比率,前端显示 `×1000`;`ratioChangePct` 为日变化(较前日,vs 上一轮 Daily)decimal ratio,render 层乘 100；gold-api 实时端点只给现货价,故 changePct 由上轮价派生,Yahoo 备援腿 changePct 置 null(不混窗口);不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaBond` | ChinaBond:MOF-yield-curve | `yield10y` object (`value`, `latestObsDate`, `updatedAt`, `source`, `sourceStatus`), parent `sourceStatus.yield10y`, `updatedAt`, `source`, `notes` | 中国 10 年国债收益率来自 ChinaBond 官方 `historyQuery` JSON；`value` 存 percent(例如 `1.72`),render 层显示 `%`；freshness 超过 7 天 fallback/missing；display-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.cfetsRmb` | ChinaMoney:CFETS-RmbIdx | `cfets`, `bis`, `sdr`, `latestObsDate`, parent `sourceStatus.cfets`, `updatedAt`, `source`, `notes` | CFETS 人民币篮子指数来自 ChinaMoney 官方 `RmbIdxHis` JSON,周频精确篮子,同记录含 BIS/SDR；freshness 超过 14 天 fallback/missing；display-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaInflation` | NBS:stats-zxfb; TradingEconomics:China-CPI-PPI-public-html | `cpi` / `ppi` leaf objects (`yoy`, `refMonth`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`), parent `sourceStatus.{cpi,ppi}`, `updatedAt`, `source`, `notes` | 中国 CPI/PPI 同比来自国家统计局发布正文；Trading Economics 公开 HTML 仅作 fallback；`yoy` 存 decimal ratio,render 层乘 100；freshness 使用 endOfRefMonth 或 publishedAt + 45 天；display-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaPmi` | NBS:stats-zxfb; TradingEconomics:China-NBS-Manufacturing-PMI-public-html | `pmi` leaf object (`value`, `refMonth`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`), parent `sourceStatus.pmi`, `updatedAt`, `source`, `notes` | 中国制造业 PMI 为国家统计局官方 PMI；Trading Economics `/china/business-confidence` 仅作 NBS PMI fallback,不得混用 RatingDog/S&P `/china/manufacturing-pmi`；`value` 存点值；freshness 使用 endOfRefMonth 或 publishedAt + 45 天；display-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| `macroDrivers.chinaPropertyPrice` | NBS:70city-price-index | `refMonth`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`, `notes`, `newCitiesUp`, `newCitiesFlat`, `newCitiesDown`, `resaleCitiesUp`, `resaleCitiesFlat`, `resaleCitiesDown`, optional / nullable `tierBreakdown.{tier1,tier2,tier3}.{label,cityCount,new,resale}.{up,flat,down}` | NBS 70 城商品住宅价格指数为城市级价格指数计数摘要；从新建商品住宅 / 二手住宅两张表按环比指数 `>100 / =100 / <100` 统计上涨、持平、下降城市数；`tierBreakdown` 按 NBS 官方一线 4 / 二线 31 / 三线 35 城市划分保存全量城市方向数组,用于 C6 卡折叠明细；freshness 使用 publishedAt + 45 天，publishedAt 缺失时使用 endOfRefMonth + 60 天；display-only/audit-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation；城市级指数方向不得写成房源级成交 raw tape |
| `macroDrivers.chinaOmo` | EastMoney:OMO-aggregated-news | `opDate`, `announcementNo`, `operationType`, `termDays`, `operationRate`, `operationAmount`, `updatedAt`, `source`, `sourceStatus`, `notes` | 东方财富聚合转载的央行公开市场操作新闻为公告/新闻级逆回购 / 正回购观察层,非 PBOC 官方原始公告；`announcementNo` 因聚合新闻缺失为 null；按新闻毛额操作句提取 `operationRate` decimal rate(如 1.40% -> `0.014`)和 `operationAmount`(亿元),不存投标量、到期量、净投放或净回笼；EastMoney 新闻源不保留无操作 live 分支,搜不到 7 天内合格操作则 fallback/missing；freshness 使用 publishedAt/opDate + 7 自然日；display-only/audit-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation；公开市场操作数据不得写成逐机构 / 逐笔 raw tape |
| `macroDrivers.chinaTsf` | EastMoney:TSF-aggregated-report | `refMonth`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`, `notes`, `stockYoY`, `ytdIncrementYi`, `incrementPeriodLabel`, `componentsStatus`, `components[]` (`key`, `label`, `incrementYi`) | 东方财富聚合转载的央行社会融资规模月度报告为报告级社会融资规模观察层,非 PBOC 官方原始报告；`stockYoY` 存 decimal ratio,render 层乘 100；`ytdIncrementYi` 与分项 `incrementYi` 均为年内累计增量(亿元),`万亿元` 归一为亿元,`减少` / `下降` 取负；`componentsStatus` 为 complete / partial / missing,不做分项和等于总量的硬校验；freshness 使用 publishedAt + 45 天，publishedAt 缺失时使用 endOfRefMonth + 60 天；display-only/audit-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation；报告级累计分项不得写成贷款笔级 / 机构级 raw tape |
| `macroDrivers.chinaMlf` | EastMoney:MLF-aggregated-news | `opDate`, `publishedAt`, `updatedAt`, `source`, `sourceStatus`, `notes`, `operationAmountYi`, `termMonths`, nullable `mlfRate` | 东方财富聚合转载的央行中期借贷便利 MLF 操作新闻为公告/新闻级 MLF 观察层,非 PBOC 官方原始公告；按新闻毛额操作句提取 `operationAmountYi`(亿元)和 `termMonths`,不取净投放、净回笼、到期金额或加量续作轧差；`mlfRate` 若披露则存 decimal rate(render 层乘 100),近年利率未披露时为 null 且不视作错误；freshness 使用 publishedAt/opDate + 45 自然日；display-only/audit-only,不接入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation；公告/新闻级 MLF 操作不得写成逐机构 / 逐笔投标 raw tape |
| `macroDrivers.rateVol` | Yahoo:^MOVE | `move`, `moveUpdatedAt`, `moveAgeDays`, `moveRegime`, `freshnessStatus`, `source`, `sourceStatus.move`, `notes` | 债券/利率波动率 MOVE（Yahoo 日频 `^MOVE`）。**评分例外结构源**——继 `onRrp`/`t10y2y`/`igOas` 之后第 4 个进结构门控的 macroDriver：MOVE ≥140 应激→`structuralYellow`、≥160 危机→`structuralRed`，经 `evaluateStructuralGating` 翻黄/红；平静（<140）不影响打分。合理性闸门 `[20,400]` + `instrumentType==='INDEX'` + ≤5 自然日新鲜；取数失败仅在上一轮值仍 fresh 时 carry last-good，否则 fail-closed（`move=null` 不触发）。`structuralScoreBump`（rules.json `structuralGating.moveVolStress`）仅 `decisionModel` 展示、`lockEngine` 不消费。**非第七底层模块、与 World Order overlay 无关、不改 6 模块公式/权重**；`move` 仅经结构门控影响 `executionLock`/`positionGuidance`，不写入 `values.*`/`displayInputsBaseline`/`effectiveDisplayInputs`/6 模块 score/cross-validation |
| `Daily degraded display-only refresh` | Daily fallback path | When `buildFallback()` is used, only `macroDrivers.worldEconomy`, `macroDrivers.chinaEquity`, `macroDrivers.inflationEnergy`, `macroDrivers.copperGold`, `macroDrivers.chinaBond`, `macroDrivers.cfetsRmb`, `macroDrivers.chinaInflation`, `macroDrivers.chinaPmi`, `macroDrivers.euroVolatility`, `macroDrivers.chinaPropertyPrice`, `macroDrivers.chinaOmo`, `macroDrivers.chinaTsf`, `macroDrivers.chinaMlf`, `macroDrivers.energySpareCapacity`, and `macroDrivers.energyTransport` may be independently refreshed and merged over the cloned previous data | This degraded-mode refresh is display-only; it preserves `recovery.degradedMode` / `safeOutput`, does not overwrite `fedLiquidity` / `policyExpectations` / `curve` / `credit` / `activeSignals` / `gatingEvaluation`, and does not affect scoring, decision, execution, position, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation |

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
- 复用价格 3 项(`wtiPrice`/`brentPrice`/`crackSpread`):`unit` `$/bbl`、`source` 以 `radar-data:` 开头(复用,不重抓)。
- `curve`:`slopeRegime`、`frontMinusBack`(numeric,freshness 以此判定)、`confidence:'low'`、`limitationZh`、`source` 以 `radar-data:` 开头。

`seasonality`(仅 8 个 weekly EIA;missing series 不得携带):`weekOfYear`(1..53)、`seasonBucket` ∈ {`winter_heating`,`summer_driving`,`shoulder`}、`fiveYrSameWeekMean/Min/Max`、`sampleYears`(0..5)、`windowFallback` ∈ {`exact`,`±1week`}。

freshness 不变式:`value` 缺 → `missing`;present 且 `ageDays` 无 → `stale`;present 且 `ageDays > maxAgeDays` → `stale`;否则 `live`。

严格边界(同 brentPricingLayer / World Order overlay):不进 `values.*` / scoring / `decisionModel` / `executionLock` / `positionGuidance` / `displayInputsBaseline` / `effectiveDisplayInputs` / cross-validation;不并入 Global Risk Heatmap;缺数据不伪造、数据不足显式 `insufficient_data` 不硬判。校验 = `npm run check:oil-directional`(contract / freshness / seasonality / degradation / boundary / backtest / score);fetcher 零依赖(ADR-0013)。完整设计见 [`OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md`](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

**PR3 模型输出**(`signals` / `finalBias` / `interpretation`,display-only;classifier = `scripts/oil-directional/odp-classifier.mjs`):

- `finalBias` ∈ **8 枚举**(`FINAL_BIAS_VALUES`,classifier 单一来源):`strong_bullish` / `moderate_bullish` / `neutral_range` / `bearish` / `false_down_physical_stress` / `false_up_unconfirmed` / `product_crisis` / `insufficient_data`。**永不为 null**(build 总写一个判定,至少 `insufficient_data`)。
- `signals`(object | null):6 物理子信号(`inventoryDrawPressure` / `dieselProductStress` / `refineryConfirmation` / `sprBufferEffectiveness` / `demandDestructionRisk` / `futuresCurveConfirmation`)+ `priceContext`(`brentChangePct4w` number|null、`curveSlopeRegime` string|null、`crackChange4w`、`priceDirectionSource`)。**`signals` 为 null 当且仅当 `finalBias='insufficient_data'`**(数据不足→暂不判断)。
- `interpretation`(object,**非 null**):`physicalBias`、`finalBias`、`divergence` ∈ {`none`,`false_down_physical_stress`,`false_up_unconfirmed`}、`priceVsPhysical`、`drivers`(signal group 数组)、`confidence` ∈ {`low`,`moderate`,`high`}、`dataSufficiency` ∈ {`full`,`partial`,`insufficient`}、`note`(重申 audit-only)。

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

v28.0J-2B post-deploy audit 已通过，当前 live data 已包含 `aiInterpretationLayer.contractVersion = v28.0J-0`。当前前端 asset cache 版本以 `scripts/app.js` 的 `APP_VERSION` 为准（现 `odp-buffer-tone-1`）。

稳定边界：

- `aiInterpretationLayer` 是 display-only / interpretation-only。
- `generatedByExternalAi=false`。
- `usesExternalAiApi=false`。
- rule-based `aiInterpretationLayer` 本身不调用 DeepSeek / OpenAI / 外部 AI API（独立的 `externalAiInterpretationLayer` 已用 DeepSeek,见下方当前生产契约）。
- 不参与 scoring / `decisionModel` / `executionLock` / `positionGuidance`。
- 不改变 `values.*`、`effectiveDisplayInputs`、Brent promotion、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 前端只能只读消费 `aiInterpretationLayer`，不得在 render 层生成、重算或补写解释。
- 外部 AI 已通过独立字段 `externalAiInterpretationLayer` 接入(visible read-only,见下方当前生产契约),不覆盖本 rule-based layer;任何进一步扩展仍须用单独字段 + source metadata,不得覆盖 rule-based layer。

#### externalAiInterpretationLayer 当前生产契约（已实现 · visible read-only）

`externalAiInterpretationLayer` 已实现,为 **visible read-only 展示层**:当前 live data 为 `schemaVersion = v28.0L-external-ai-production-analyst-1`、`status = valid`、`displayEnabled = true`、`boundaries.frontendDisplayApproved = true`、`provider = deepseek`,由 `External AI Production Refresh` workflow 经 `check:external-ai-production-contract` validator + quality review 写入。生产契约(权威定义见 `scripts/check-external-ai-production-contract.mjs`)要求:`displayEnabled === boundaries.frontendDisplayApproved`;visible 时须 `status=valid` + `qualityReview.status ∈ {pass,warn}` + `recommendation=pass_for_manual_review` + `freshness.isStale=false`;且**恒** `qualityReview.promotionEligible=false`、`provenance.humanApproved=false`,`auditFlags` 须含 `non_production_output` / `no_frontend_display`(后两者命名为历史遗留、与 visible 现态字面相左,属待另开协调改名项,非当前 docs slice)。接入与输出仍须遵守 [`EXTERNAL_AI_API_DESIGN.md`](EXTERNAL_AI_API_DESIGN.md)。

PR3 expand-then-contract 后,validator / projection / write guard 同时接受两套 production source family:

- legacy: `schemaVersion=v28.0L-external-ai-production-1`, `sourceMode=manual_local_compact`, `inputSource=local_compact`, `sourceSemantics=site_structured_data_compact_summary`。
- analyst current/default: `schemaVersion=v28.0L-external-ai-production-analyst-1`, `sourceMode=manual_analyst_compact_v1`, `inputSource=analyst_compact_v1`, `sourceSemantics=site_structured_analyst_evidence_pack_v1`。

`External AI Production Refresh` 的 scheduled cron 与 `workflow_dispatch` 默认源为 `analyst_compact_v1`;legacy `local_compact` 仍保留为手动 dispatch rollback 选项,直到另一个 reviewed PR 明确 contract。

PR4b-1 后,`analyst_compact_v1` production prompt 默认要求 4 个结构化字段: `crossLayerSynthesis` / `keyDivergences` / `scenarioLean` / `dataQualityLens`,并把 provider `max_tokens` 提升到 5000。生产数据契约**不 bump schema**:这 4 个字段为 additive optional,现有 committed analyst 层即使没有这些字段仍 valid;字段存在时必须通过与 PR4a canary 相同的结构校验(caps、canonical sourceLayer、direct layer arrays 仅 bare sourceLayer、sub-field confidence 仅 `low|medium`)。PR4b-2 前端在现有 `#external-ai-auxiliary` 折叠区内渲染这些 optional 字段;缺字段时保持隐藏 fallback,不改变 scoring / decision / execution / position。

边界：

- 不得覆盖现有 `aiInterpretationLayer`。
- 必须是 display-only / commentary-only。
- 必须包含 `provider` / `model` / `source` / `audit` / `fallback` metadata。
- 必须包含 source attribution 与 output audit flags。
- 不得影响 scoring / decision / execution / position。
- 不得影响 `values.*`、`effectiveDisplayInputs`、Brent promotion、Action Queue、Trigger Monitor 或 Invalidation Rules。

`docs/fixtures/external-ai/*.json` 是 v28.0K-1 prompt contract 的非生产样例，不属于 production data contract，不得被 runtime 消费，也不得作为 `data/*.json`、`realtime/*.json` 或 Worker payload 的替代输入。（External AI production contract 已在 v28.0L-3P+ 实现并 visible read-only,见上方当前生产契约;下文 832 起的 K-3A/3B disabled scaffold 与 L-0…L-3F-1 段为历史基线,保留作历史。）

`scripts/check-external-ai-output.mjs` / `npm run check:external-ai-output` 只验证 sample 或 future external AI output artifacts；它不验证 production `data/radar-data.json`，不改变 `aiInterpretationLayer`，也不把 external AI 字段加入当前 production contract。

v28.0K-4A does not change the production data contract. _(历史:当时 live `externalAiInterpretationLayer` 为 disabled scaffold;自 v28.0L-3P+ 已是 visible read-only,见上方当前生产契约。)_ Manual API test output must not overwrite live `data/radar-data.json` outside the approved `External AI Production Refresh` write path.

v28.0L-3C provider-call workflow design does not change the production data contract. Future provider-call workflow artifacts, if implemented later, remain manual diagnostics and are not production data. They must not overwrite `data/radar-data.json`, `data/*.json`, `realtime/*.json`, config files, or the approved production `externalAiInterpretationLayer` field (now visible read-only — see current contract above; this remains a historical L-3C note).

#### externalAiInterpretationLayer disabled scaffold contract（SUPERSEDED — 历史 v28.0K-3A/3B 基线）

> **SUPERSEDED:** 以下为 v28.0K-3A/3B 时期的 disabled-scaffold 基线,保留作历史。**当前态见上方「当前生产契约」**——自 v28.0L-3P+ 起该层已是 visible read-only(`status=valid`/`displayEnabled=true`/`provider=deepseek`),并由 `v28.0M-3H` preservation 规则跨日刷新保留。

v28.0K-3A 在 Daily radar data 根级新增 future-only disabled scaffold；v28.0K-3B activation audit 通过后，该字段进入 live data baseline（历史）：

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

`externalAiInterpretationLayer` in production data is the implemented visible read-only layer (see current contract above). The only approved write path is the validator + quality-review gated `External AI Production Refresh` workflow. Manual DeepSeek output artifacts, manual input artifacts, provider failure artifacts, and quality review artifacts under `manual-artifacts/` are not themselves the production data contract and must not be hand-copied into it.

Manual artifacts must not be copied into `data/radar-data.json`, `data/*.json`, `realtime/*.json`, Worker payloads, or frontend display paths. A future production external AI data contract requires a separate reviewed version with explicit audit, validator, quality-review, fallback, disable-switch, and source-attribution boundaries.

#### v28.0L-0 production integration design note（历史 staged-rollout note）

> **历史:** 以下 v28.0L-0…L-3F-1 为分阶段 rollout 期间所写(撰写时该层尚 disabled、integration 尚未实现)。该 rollout 已在 **v28.0L-3P+** 完成,当前 live `externalAiInterpretationLayer` 为 visible read-only(见上方「当前生产契约」)。下列各阶段 note 保留作历史。

[`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md) designed the production `externalAiInterpretationLayer` contract. _(历史 L-0 note:撰写时尚未实现;该设计已在 v28.0L-3P+ 落地,当前 live 为 visible read-only,见上方当前生产契约。)_

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

### Frontend asset cache version

odp-buffer-tone-1 Frontend Asset Cache Busting 只定义前端静态资源版本契约，不改变数据契约、Worker runtime、Brent promotion、sourceProbe、secondary diagnostics、KV 或 `data/*.json` / `realtime/*.json`。触发原因是 Android Chrome cached old module graph：普通窗口缓存旧 `scripts/app.js` / ES module graph 后，仍可能显示 Actions/FRED 旧逻辑；无痕窗口正常则证明线上 Worker-first runtime 正常。

当前前端资源 cache 版本以 `scripts/app.js` 的 `APP_VERSION` 为准（现 `odp-buffer-tone-1`）。

要求：

- `index.html` 入口 module script 必须指向 `app.js?v=odp-buffer-tone-1`。
- `scripts/app.js` 与 `scripts/modules/*.js` 的本地相对 `.js` import 必须使用 `?v=odp-buffer-tone-1`。
- 核对线上版本:看 `scripts/app.js` init 时的 console 行 `[app] … APP_VERSION=<版本>`(当前 `odp-buffer-tone-1`),或检查已加载的 `app.js?v=…` URL token;两者须与 `?v=` 一致。
- frontend asset cache version must be bumped when index.html or frontend JS changes：以后修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js` 时，必须同步 bump version 并替换所有本地 module import query。
- 只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json` 或只 deploy Worker 不需要 bump。

v28.0G-9B Frontend Asset Version Bump Helper 新增本地维护工具：

```bash
node scripts/bump-frontend-asset-version.mjs odp-buffer-tone-1
npm run bump:frontend-asset-version -- odp-buffer-tone-1
```

该工具用于以后前端 HTML / JS 改动时统一 bump cache version。当前正式版本仍是 `odp-buffer-tone-1`；它只更新前端 asset version、contract 和相关文档，不访问网络、不写 KV、不写 `data/*.json` / `realtime/*.json`、不 deploy Worker。Worker runtime 改动不需要 bump frontend asset version，除非同时改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js`。

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

> **External AI staged-rollout 历史阶段账本（style-B 折叠）:** 以下 `v28.0L-3H → v28.0M-3H-1` 各段记录 External AI 从 provider-call 试验 → 首次 production 写入 → visible 展示的分阶段落地。**当前态(visible read-only / `provider=deepseek` / `promotionEligible=false` / 不影响 scoring·decision·execution·position)以上方「externalAiInterpretationLayer 当前生产契约」为准**;各段当时反复声明的 "remains disabled / non-production / promotionEligible=false / not_ready" 已被当前契约 + 下方 M-3H preservation 取代,完整历史见 git history 与对应 `EXTERNAL_AI_*.md` 设计文档。

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

**经数据 flag 启用 production external AI panel:`displayEnabled=true` + `boundaries.frontendDisplayApproved=true`(= 当前 visible 态)。** 仅批准展示(不批 provider rerun / AI text 改);`qualityReview.promotionEligible=false` 与 `boundaries.affectsScoring/DecisionModel/ExecutionLock/PositionGuidance=false` 仍必需。

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

**【当前活规则,非纯历史】** `data/radar-data.json` 须跨日常 radar refresh 保留 contract-valid `externalAiInterpretationLayer`:普通 refresh **不得**删除 `displayEnabled` / `boundaries.frontendDisplayApproved` / `qualityReview.promotionEligible` / non-impact 边界 flags,**不得**编辑 external AI 生成文本;**`External AI Production Refresh` 是唯一批准的自动 provider 写入路径**;future data 更新仍须过 production contract validation + write guard。

## v28.0M-3H-1 externalAiInterpretationLayer preservation audit

**【当前活规则,非纯历史】** preservation hotfix post-merge 审计通过:普通 refresh 须保留 layer(而非以 disabled scaffold 覆盖);`displayEnabled` / `frontendDisplayApproved` 须为 boolean,`qualityReview.promotionEligible=false` 与 non-impact 边界(no scoring/decision/execution/position)仍必需;future 改动须过 production contract validation + write guard + frontend scaffold check + `check:data` + `check:all`。

## v28.0M-4 macro overview read-only derivation boundary

Macro Overview 是前端只读派生层:render 不得 mutate `data/radar-data.json`、不得伪造 Nasdaq/QQQ 周历史/MA60/标准差/z-score,不影响 scoring/decisionModel/executionLock/positionGuidance;Global Risk Heatmap 为独立 display section(非嵌入 macro overview 卡内)。

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

## bubble-watch 专题数据契约 (ADR-0016)

`data/bubble-watch.json` + `data/bubble-watch-history.json` 是第二页面「AI 泡沫监测」(`bubble-watch.html`)的专属数据,由 `scripts/build-bubble-watch.mjs` 周一 cron(`refresh-bubble-watch.yml`)生成,**display-only**:不进 scoring / decisionModel / executionLock / positionGuidance / `values.*` / `displayInputsBaseline` / `effectiveDisplayInputs` / cross-validation;主站 `scripts/app.js` 与 `index.html` 不得读取(`check:bubble-watch` boundary leaf 机器强制)。

latest 文件关键字段:

- `contractVersion = "bubble-watch-v1"`;`issue_number`(周自增);`as_of_date`。
- `summary`:`red_count / yellow_count / green_count / red_pct / weighted_risk_score(=(红+0.5黄)/23×100) / verdict_label(zh) / verdict_label_en / verdict_desc(模板生成,坦白 auto/curated 口径)`。
- `scoring`:`base_tier`(red_pct 四档 25/40/60)、`effective_tier`、`override_active`、`override_rule`(红灯占比 ≥50% 的分类 ≥2 个 → 至少「高风险预警」)、`resonant_categories`。checker 全量 replay,**阈值与升级规则不得悄改**。
- `indicators[23]`:固定 id 集(见 `scripts/check-bubble-watch.mjs` EXPECTED_IDS),每项 `category / name_en / name_zh / status(red|yellow|green) / value_display / note / threshold_text / source_name / stale / provenance`。`provenance.mode ∈ auto | curated | auto_fallback`;curated/auto_fallback 必带 `asOfDate` + `maxAgeDays`,`stale` 与超期状态机器一致(原版 STALE 角标语义)。
- `history_seed`(尾 10 周)与 `wow_changes`(翻灯优先,无翻灯时持平要点)。
- `meta`:`auto_count + curated_count + fallback_count = 23`、`fetch_failures`、`boundary` 声明。

编辑/研究类 11 项的人工口径唯一来源是 `config/bubble-watch-curated.json`(改 value/status/note + asOfDate 后触发 workflow);自动 12 项抓取失败 fail-closed 沿用该文件快照并标注「实时抓取失败,沿用 YYYY-MM-DD 快照」。**上游周报自动同步**:每轮 build 先检查 aibubble-cn.github.io 上游周报(实际端点 = ai-bubble-monitor `latest.json`),上游 `as_of_date` 更新时自动采纳 curated/autoFallback 的 status/value_display/note 并回写 config(workflow 一并提交;`meta.upstream_sync.checked` 必为 true,checker 强制),上游不可达/未更新则沿用现状、下个周期再查。history 文件由 build 维护(同 ISO 周覆盖、新周追加、保留 16 周),不得手改。
