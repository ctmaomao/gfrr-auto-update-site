# M-94 V0 — Data Consumption Contract v2.2

> **Status**: V0 Draft v2.2 (Codex 第四轮反馈:PR 1 范围与 checker enforcement 不可同步问题修正)
> **PR 路径**: PR 1 = 本契约 + DESIGN.md + checker + index.html 容器骨架 · PR 2 = render logic implementation
> **Scope**: 前端展示 only · 不动 scoring / decision / execution / position / Worker / data pipeline / JSON 生产结构
> **Approach**: Path C 结构(保留 14 项 IA + 新增 1 项 `#macro-thematic-cards`) + Path B 卡片密度
> **Visual Reference**: `manual-artifacts/m94-v0/m94-v0-FINAL-mock.html` 是本契约的视觉权威基准
> **Date**: 2026-05-24

---

## v2.1 → v2.2 关键变更(给读过 v2.1 的人快速过)

v2.1 的 PR 1 范围设计有"先有鸡还是先有蛋"陷阱:

- v2.1 让 PR 1 改两个 IA checker 到 15 项,但 `index.html` 仍是 14 项 nav + 没有 `#macro-thematic-cards` section
- 结果:`npm run check:all` 必挂(checker 强制要求 15 项但 index 没有)
- 必须把 enforcement 和 implementation 同步,不能拆

**v2.2 修正方案**(Codex 第四轮提交时发现并报告,Robert 选项 A):

PR 1 范围**扩到包含 `index.html` 的 nav + 空 section 容器骨架**,但仍**不引入 render logic**。具体:
- PR 1 改 `index.html`:nav 加第 9 项 + 加空 `<section id="macro-thematic-cards">` 容器(类似 M-93A0 中 `#plain-summary-card` 先到位、`renderPlainSummary.js` 后填充的模式)
- PR 1 **不动**:`scripts/modules/render*.js` 任何文件、`assets/styles.css`、`data/*`、`workers/*`
- PR 2 才填:`scripts/modules/renderThematicCards.js` + `renderMacroOverview.js` 视觉重写 + styles.css 补充 + `scripts/modules/render.js` 调用

这个拆分和 M-93A0 当年的处理一致:**IA + 容器骨架先到位,内容渲染随后**。

**改动范围**:契约改 8 处,主要在 §0.1 / §0.3 / §2.1 / §4.1 / §4.2 / §9。0 字段层面改动,0 视觉规范改动。

---

## 与 v2 相比的关键变更(给读过 v2 的人快速过)

v2 是 Codex 第三轮审核后的字段精校版。Codex 6 段审核结论 100% 消化。

**5 个硬错误已修正**:
1. `data.modules.geopolitical` 是扁平数字,不是 `.score` 子字段
2. NDX vs SPX 30 日相对强弱无现成数据,改为 NDX 60w z-score(决策 C)
3. `privateCreditProxy` 6-proxy z-score 数据不足,降级为 8 字段直显(决策 B)
4. `warningSystem + triggerPanel` 不是 MacroOverview 观察清单数据源,删除"合并复用"措辞
5. checker 字面量同步遗漏:5 处"14 项"硬编码必须改"15 项"

**3 处决策落地**:
- A — 信用类加 CRE 第 5 卡(`macroDrivers.commercialRealEstate.*`)
- C — 市场情绪 NDX 卡改为 60w z-score(复用 `classifyZScoreBucket`)
- B — Private Credit 降级 + note 预留"M-96+ 接 6-proxy z-score"

**9 处字段补充**:Brent 5 字段 / Fed Liquidity 3 字段 / Fed Path 7 字段 / Employment 3 字段 / Consumer 4 字段 / NFCI 3 字段 / 等

**6 个 §6 TODO 全部由 Codex 给出确凿答案**(NFCI 路径 / modules 结构 / preface 位置 / NDX 派生路径 / 6-proxy z-score 不存在 / contractVersion 不进 UI)。

**1 处工作量警告**:`buildPressureSources` + `buildMacroDrivers` 共 776 行,§8 实施指引措辞要从"简化"改成"保留所有字段消费,仅改外壳"。

**Visual Reference 锁定**:Robert 已对 `m94-v0-FINAL-mock.html` 完成视觉确认。任何与该 mock 不一致的实施都视为契约违反。

---

## 文档读者

本文档面向 4 类执行者:

1. **Codex / Cursor / AI 实施者** — 看 §4 / §6 / §7 知道改哪些文件
2. **Robert(项目运营者)** — 看 §0 / §1 / §2 知道 M-94 做什么
3. **审核 PR 的人** — 看 §9 知道怎么验收
4. **未来想扩展数据接入的 milestone** — 看 §3 / §5 知道占位接口在哪

---

## §0 M-94 任务定义(锁死,不再讨论)

### §0.1 目标一句话

**让 index.html 首页渲染遵守已有 DESIGN.md,把 renderMacroOverview.js 的输出从工程术语堆积改成 Bubble Watch 报纸节奏,并新增一个"宏观主题卡阵"section 提供按读者类别组织的入口。**

**PR 拆分**:M-94 用 2 个 PR 实施,严格按 M-93A0 的拆分模式(IA 与容器骨架先到位,渲染逻辑后填充):

- **PR 1**:契约文档 + DESIGN.md + 2 个 IA checker + **`index.html` nav 第 15 项 + 空 `#macro-thematic-cards` section 容器骨架**。零 render logic 改动。
- **PR 2**:`scripts/modules/renderThematicCards.js` 新建 + `renderMacroOverview.js` 视觉重写 + `assets/styles.css` 补充 + `scripts/modules/render.js` 调用。

### §0.2 路径选择(已锁)

采用 **Path C**:
- 保留 DESIGN.md §4.1 现有 14 项 IA + 8 个 runtime block 的金融逻辑骨架
- 在 `#macro-risk-overview` 与 `#global-risk-heatmap` 之间**新增 1 个 top-level section** `#macro-thematic-cards`
- IA 从 14 项扩为 15 项(jump nav 多 1 个锚点)
- 视觉层全面 Bubble Watch 风格化(纸张色 / 三栈字体 / 报纸节奏)

### §0.3 不做范围(项目宪法硬约束)

| 禁止 | 来源 |
|---|---|
| 改 scoring / decision / execution / position 逻辑 | DESIGN.md §8.4 #1 |
| 改 `data/radar-data.json` 或任何 data 生产结构 | DESIGN.md §8.4 #2 |
| 启用 Market Pricing Temperature 进入主评分 | DESIGN.md §8.4 #3 |
| 加 live fetch / production write | DESIGN.md §8.4 #4 |
| 改 `.github/workflows/*` | DESIGN.md §8.4 #5 |
| 改 Worker / pipeline / heartbeat | 项目宪法 |
| 加生产 npm 依赖 | 项目宪法 0 deps |
| 把 External AI 接入评分 | 项目宪法第 4 条 |
| 把 World Order 接入评分 | 项目宪法第 3 条 |
| 清理商业付费数据 docs(独立 M-XX) | Codex 审核第五节 |
| 接入未来数据源(P1+ 独立 milestone) | M-94 仅做架构槽位 |

### §0.4 取舍方向回顾

Codex 第二轮审核 5 节处理结论:

| 节 | 决定 |
|---|---|
| §1 字段错误(7 项) | 100% 接受,本契约 §1 全部修正 |
| §2 24 派生模块识别 | 大部分接受 + MacroRiskOverview "逻辑内核留组织结构换" |
| §3 DESIGN/checker 冲突 | 基本反驳 + 接受字体 CDN |
| §4 mock 硬错误(4 项) | 100% 接受 |
| §5 商业付费清理 | 完全接受,移出 M-94 |
| §6 Codex 第三轮审核(v2.1 新增) | 100% 接受 5 硬错误 + 17 处修正,本契约相应章节已更新 |

---

## §1 字段消费基准表(基于真实 radar-data.json schema)

> 上一版契约 60% 字段名是错的。本节字段来自 2026-05-23T23:29:22Z 时刻 `data/radar-data.json` 的实际 schema(via 直接读取项目文件)。

### §1.1 渲染数据**主**来源:`__effectiveDisplayInputs`(注:不是唯一)

**真实运行时**:`scripts/modules/realtime.js` 的 `buildEffectiveDisplayInputs()` 函数派生出 `data.__effectiveDisplayInputs`,作为前端"指标即时值"的**主**消费入口。

**重要事实**(Codex 第三轮审核确认):
1. **raw `data/radar-data.json` 不直接包含 `__effectiveDisplayInputs` 字段**,它仅在 runtime 由 `realtime.js` 派生
2. 当前 `renderMacroOverview.js` 实际**仍大量消费 `data.displayInputsBaseline.*`** 作为 fallback 路径,M-94 不会全部改完
3. M-94 主题卡阵新代码**必须优先**使用 `data.__effectiveDisplayInputs.*`,但允许在 runtime 字段缺失时回落 `data.displayInputsBaseline.*`
4. M-94 **不重写** `realtime.js` / `buildEffectiveDisplayInputs()` 函数

**派生规则**(简化版,详情见 realtime.js):
- baseline = `data.displayInputsBaseline.{brent, dxy, vix, hyOas, us10y, real10y, breakeven10y, gold, spx}`(9 个字段,**真实存在**)
- 如果 Worker preview / secondary preview 可用,覆盖 baseline
- 如果 Worker 失败,回落 baseline
- 输出 `data.__effectiveDisplayInputs.{brent, dxy, vix, hyOas, us10y, real10y, breakeven10y, gold, spx}`

**禁止用法**(契约 v1 错误):
- ❌ `data.values.brent` — 不存在
- ❌ `data.values.*` — 不存在
- ❌ `data.brent` 直接 — 不存在

**正确用法**:
```js
const brent = data.__effectiveDisplayInputs?.brent ?? data.displayInputsBaseline?.brent;
```

### §1.2 dailyBrief 真实字段(替换契约 v1 全部虚构字段)

**真实字段树**(12 keys):

```js
data.dailyBrief = {
  contractVersion,            // 例如 "v28.0I-1"
  generatedAt,                // ISO datetime
  macroState,                 // "滞胀冲击 / 通胀冲击"(原项目语言)
  oneLineConclusion,          // "今日主线是能源 → 通胀 → 利率压力..."
  dominantRiskChain: {
    key,                      // 例如 "energy_inflation_rates"
    labelZh,                  // 例如 "能源 → 通胀 → 利率压力"
    stageZh,                  // 例如 "能源与通胀向利率端传导"
    summaryZh,                // 长解释
    evidence: [               // 3 个 item
      {
        source,               // 例如 "displayInputsBaseline"
        key,                  // 例如 "brent"
        labelZh,              // 例如 "布伦特"
        value,                // 实际数值
        summaryZh,            // 一句话
      },
      ...
    ]
  },
  largestDivergence: {        // 结构同上
    key, labelZh, statusZh, summaryZh, evidence
  },
  keyTriggers: [5 strings],   // 触发清单(替代虚构的 watchItems)
  invalidationSignals: [5 strings],  // 反证清单
  dataGaps: [3 strings],      // 数据缺口
  confidence: { level, score, reasonZh },
  boundaries: { displayOnly, affectsScoring, affectsDecisionModel,
                affectsExecutionLock, affectsPositionGuidance },
  evidence: [4 items]
}
```

**契约 v1 字段错误对照表**:

| v1 错(不存在) | v2 正(真实) |
|---|---|
| `dailyBrief.headline` | `dailyBrief.dominantRiskChain.labelZh` |
| `dailyBrief.summary` | `dailyBrief.oneLineConclusion` 或 `dominantRiskChain.summaryZh` |
| `dailyBrief.dominantChain` | `dailyBrief.dominantRiskChain` |
| `dailyBrief.dataHealth` | `data.dailyRealtimeInput.healthScore` |
| `dailyBrief.weeklyChange` | `data.scoreChange7d` |
| `dailyBrief.watchItems` | `dailyBrief.keyTriggers` + `dailyBrief.invalidationSignals` |

### §1.3 macroDrivers 真实字段(13 子模块,确认存在)

**真实子模块清单**(`data.macroDrivers.*`):

```text
fedLiquidity / policyExpectations / curve / credit /
consumer / shippingFreight / employment / consumerRetail /
commercialRealEstate / privateCreditProxy / activeSignals /
gatingEvaluation / allSourcesMissing
```

**关键字段名校正**(来自 Codex §1 + 第三轮审核):

| 子模块 | v1 错 | v2.1 正 |
|---|---|---|
| `credit` | `iggOas` | `igOas` |
| `credit.nfci` | 未识别 | **真实存在**,完整:`nfci / nfci4wChange / nfciRegime / sourceStatus.nfci` |
| `fedLiquidity` | `wresbal` | `reserveBalances` + `walcl / walcl4wChange / onRrp / onRrpWeekChange / effectiveFedFundsRate / sofr / reserveBalances4wChange / bgcr / tgcr / repoSpreadRegime / sourceStatus` |
| `consumer` | `pmi` | `ismManufacturingPmi`、`ismManufacturingPmi3mChange`、`ismPmiRegime` |
| `modules.geopolitical` (顶层非 macroDrivers) | `data.modules.geopolitical.score` 子字段 | **扁平数字** `data.modules.geopolitical` = 78,趋势在 `data.moduleTrends.geopolitical` |

**fedLiquidity 详细字段**(确认 + Codex 补充):
```text
walcl, walcl4wChange, onRrp, onRrpWeekChange,
effectiveFedFundsRate, sofr, reserveBalances, reserveBalances4wChange,
bgcr, tgcr,                       // ← Codex 补充:回购利率二项
repoSpreadRegime,                  // ← Codex 补充:回购利差状态
sourceStatus                       // ← Codex 补充:源状态(仅 Appendix 显示)
```

**credit 详细字段**(确认 + Codex 补充 NFCI):
```text
igOas, igOas1dChange, igHyRatio, regime,
sloosTighteningLargeFirms, sloosTighteningSmallFirms,
sloosTighteningLargeQoQ, sloosTighteningSmallQoQ,
nfci, nfci4wChange, nfciRegime,    // ← Codex 第三轮确认:这 3 项真实存在
sourceStatus.nfci                  // ← Codex 补充:源状态
```

**consumer 详细字段**(确认):
```text
umichSentiment, previousValue, threeMonthChange, sixMonthChange, regime,
ismManufacturingPmi, ismManufacturingPmi3mChange, ismPmiRegime
```

**employment 详细字段**(Codex 补充):
```text
initialClaims, initialClaims4wAverage, initialClaims4wChange,
continuingClaims, continuingClaims4wAverage,
joltsOpenings, joltsOpeningsYoY, joltsUpdatedAt,
averageHourlyEarningsYoY,          // ← Codex 补充:AHE
u6UnemploymentRate,                // ← Codex 补充:U-6
industryDiffusionPct,              // ← Codex 补充:11 行业扩张占比
industryDiffusionRegime,           // ← Codex 补充
sourceStatus                       // ← Codex 补充
```

**consumerRetail 详细字段**(Codex 补充):
```text
cartsNominal, cartsNominal4wAverage, cartsNominalYoY,
cartsReal, cartsReal4wAverage, cartsRealYoY,
retailSegments, segmentPositiveCount,
segmentDiffusionPct,               // ← Codex 补充:13 类品类正增长占比
strongestSegment, weakestSegment,  // ← Codex 补充
bofaCardSpendingExGasYoY,          // ← Codex 补充:BoA 数据
redbookYoY,                        // ← Codex 补充
sourceStatus                       // ← Codex 补充
```

**commercialRealEstate 详细字段**(M-94 v2.1 决策 A 新增主题卡):
```text
creDelinquencyRate, creDelinquencyRateQoQChange,
creChargeOffRate, creChargeOffRateQoQChange,
sloosCreNonfarmNonresidentialTightening,
sloosCreConstructionTightening,
sloosCreMultifamilyTightening,
sloosCreTighteningMax              // ← 三类紧缩最大值,主题卡阈值判定
```

**policyExpectations 详细字段**(Codex 补充):
```text
targetLower, targetUpper, targetMid, effectiveFedFundsRate, targetUpdatedAt,
fedFundsFutureFrontPrice, fedFundsFutureImpliedRate, futureMinusTargetMid,
zqCurveFrontImpliedRate,           // ← Codex 补充:ZQ 期货曲线
sr3CurveFrontImpliedRate,          // ← Codex 补充:SR3 期货曲线
oisForward12MRate,                 // ← Codex 补充:OIS 12 月远期
sepDotMid2026,                     // ← Codex 补充:SEP 点阵 2026 中位
statementMinutesTone,              // ← Codex 补充:声明 / 会议纪要 tone
sourceStatus                       // ← Codex 补充
```

**privateCreditProxy 详细字段**(确认):
```text
bdcEtfPrice, bdcEtf4wChange, bdcEtfUpdatedAt,
pbdcEtfPrice, pbdcEtf4wChange, pbdcEtfUpdatedAt,
seniorLoanEtfPrice, seniorLoanEtf4wChange,
intervalFundNav, intervalFundNavWoWChange,   // ← Codex 补充:CCLFX NAV
privateCreditProxyRegime,                    // ← Codex 补充
sourceStatus
```

**重要**(Codex 第三轮 Q5 确认):`privateCreditProxy` **没有 12 周历史窗口**。"6-proxy z-score"派生公式**不成立**,主题卡阵中此卡降级为"8 字段直显 + note 预留接口"(决策 B)。

### §1.3.5 顶层 `modules` / `moduleTrends` 字段(Codex 第三轮 Q2 修正)

**真实结构**:6 项**扁平数字**,不是嵌套对象。

```js
data.modules = {
  geopolitical: 78,      // 数字,不是 {score: 78, ...}
  energy:       82,
  inflation:    52,
  liquidity:    48,
  debt:         31,
  banking:      29
}

data.moduleTrends = {
  geopolitical: "↑",     // 或 "→" / "↓"
  energy:       "↑",
  inflation:    "→",
  liquidity:    "↑",
  debt:         "→",
  banking:      "↓"
}
```

**契约 v1/v2 错误**:`data.modules.geopolitical.score` ❌ → 正确路径 `data.modules.geopolitical`(直接数字)+ `data.moduleTrends.geopolitical`(趋势符号)。

### §1.4 divergenceLayer 真实结构

```js
data.divergenceLayer = {
  contractVersion,            // "v28.0I-3A"
  generatedAt,
  score,                      // 0-100 整数
  state,                      // 例如 "stress"
  stateZh,                    // 例如 "背离压力"
  summaryZh,                  // 长解释
  primaryDivergence: {        // 主要背离
    key,                      // 例如 "energy_pricing_gap_watch"
    labelZh,                  // 例如 "能源定价背离观察"
    status,                   // 例如 "stress"
    statusZh,
    summaryZh,
    evidence: [...]
  },
  checks: [5 items],          // 5 类背离 check
  dataGaps: [...],
  confidence: { level, score, reasonZh },
  boundaries: {
    displayOnly: true,
    auditOnly: true,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false
  }
}
```

**checks 内 item 结构**:
```js
{
  key,                        // 例如 "energy_pricing_gap_watch"
  labelZh,                    // 中文标签
  category,                   // 例如 "energy_pricing"
  status,                     // "stress" / "neutral" / "ease"
  score,                      // 0-100
  summaryZh,                  // 长解释
  evidence: [...],            // 引用 displayInputsBaseline / brentValidation
  dataUsed: [...],            // 真实使用字段列表
  limitations: [...]          // 边界说明
}
```

### §1.5 brentPricingLayer 真实结构(24 字段)

主路径展示需要的关键字段:

```js
data.brentPricingLayer = {
  contractVersion, generatedAt,
  mode,                       // "public_proxy_observation"
  summaryZh,
  selectedBrent: { value, source, observedAt, status, noteZh },
  publicSpotProxy: { labelZh, source, value, observedAt, status, limitationZh },
  futuresProxy: { labelZh, source, value, observedAt, status, limitationZh },
  proxySpread: {
    spotMinusFutures,
    selectedMinusFutures,
    maxProxyDivergencePct,
    status, statusZh, interpretationZh
  },
  ulsdPrice,                  // ULSD/heating oil price
  ulsd4wChange,
  crackSpread,                // 真实字段名
  crackSpread4wChange,
  crackSpreadRegime,          // 例如 "供应紧张"
  ulsdSourceStatus,           // "live" / "stale" etc.
  promotionAudit: {
    promotionApplied, moveStatus, promotionReason,
    selectedSource, anchorSource, anchorAgeHours
  },
  confirmationSources: [7 items],
  dataGaps, limitations,
  confidence, boundaries
}
```

**注**:契约 v1 提到的"Brent 主值 / 代理 / 实物紧张度三层证据链",在 schema 中分别对应:
- 主值 → `selectedBrent`
- 公开代理 → `publicSpotProxy` + `futuresProxy` + `proxySpread`
- 实物紧张度 → `crackSpread` + `crackSpreadRegime`(柴油裂解价差)

**Codex 第三轮补充**:M-94 主题卡 Brent 卡的 agg-rows 必须覆盖以下 5 字段(已落地于 FINAL mock C1):
```text
brentPricingLayer.eiaBrentSpotProxy.price            // 公开现货代理 EIA 价格
brentPricingLayer.futuresPriceCurve.frontPrice       // Yahoo BZ 期货 front 价格
brentPricingLayer.iceFuturesPriceCurve.frontPrice    // ICE 期货 front 价格
brentPricingLayer.proxySpread.spotMinusFutures       // 现货 - 期货 差额
brentPricingLayer.proxySpread.maxProxyDivergencePct  // 最大代理偏离百分比
```

此外 ULSD/crack spread 字段(`ulsdPrice / ulsd4wChange / ulsdSourceStatus`)用于 Crack spread 主题卡。

### §1.6 worldOrderStress 真实结构(独立文件 data/world-order-stress.json)

```js
worldOrderStress = {
  version, updatedAt,
  sourceMode,                 // "computed_with_external_sources"
  score,                      // 0-100 整数
  state,                      // 例如 "multi_theater_stress"
  labelZh,                    // 例如 "多战区压力期"
  confidence, freshness,
  marketConfirmationInput: {  // 替代 v1 误写的 worldOrderStress.marketConfirmation
    source, sourceUrl, path, updatedAt, ageMinutes,
    healthScore, criticalMissing, brent
  },
  externalSources: {          // ← Codex 第三轮补充:进 buildWorldOrderNarrative 消费
    gdelt: { ... },           // GDELT 事件数据
    ofac:  { ... },           // OFAC 制裁数据
    sipri: { ... },           // SIPRI 军费数据
    acled: { ... }            // ACLED 冲突数据(weekly 6 + monthly 6,Open license 手动下载)
  },
  dimensions: {               // 真实路径(替代 v1 误写的顶层 marketConfirmation)
    peaceDividendRetreat: { score, labelZh, trend, evidence },
    blocFormation:        { score, labelZh, trend, evidence },
    multiTheaterConflict: { score, labelZh, trend, evidence },
    economicWeaponization:{ score, labelZh, trend, evidence },
    capitalControlRisk:   { score, labelZh, trend, evidence },
    marketConfirmation:   { score, labelZh, state, evidence }    // ← 真实路径
  },
  dominantDrivers: [3 items],
  systemInterpretationZh,
  decisionModifier: {         // ← Codex 第三轮补充:M-94 仅 Appendix 展示
    enabled,
    riskBias,                 // 偏移方向
    maxStateBoost,
    appliesWhen
  },
  warnings: [...]
}
```

**Codex 第三轮重要说明**:`decisionModifier.riskBias` **不进**主题卡,仅在 Appendix `#world-order-stress-section` 章节展示。M-94 主题卡 C8 地缘类只读 `dimensions.*` 子字段。

### §1.7 market-pricing-metrics.json schema(QQQ z-score 真实字段)

```js
{
  contractVersion: "v28.0M-91-multi-asset-metrics-1",
  asset: "qqq",
  windowSize: 60,
  stdDevFormula: "sample",
  primaryAsset: "qqq",
  auxiliaryAssets: ["ndx", "ixic"],
  ma60Range: { min, max },
  stdDev60Range: { min, max },
  zScoreRange: { min, max },  // 例如 [-2.6359, +2.8311]
  assets: {
    qqq: {
      asset: "qqq",
      records: [
        {
          date,                 // ISO date
          close,                // 例如 708.93
          ma60,                 // 60 周均值
          stdDev60,             // 60 周标准差
          zScore                // z-score
        },
        ...
      ]
    },
    ndx: { ... },
    ixic: { ... }
  }
}
```

**QQQ z-score 分桶**(buildCrossValidationMatrix.js 实测):
```js
zScore >= 2  → 'extreme-hot'  → "极度过热"
zScore >= 1  → 'hot'          → "显著偏热"
zScore <= -2 → 'extreme-cold' → "极度偏冷"
zScore <= -1 → 'cold'         → "显著偏冷"
else         → 'neutral'      → "中性区间"
```

(常量定义:`BUCKET_LABELS` in buildCrossValidationMatrix.js)

### §1.8 其他派生层关键字段(来自 Codex 24 模块清单)

| 字段路径 | 用途 | M-94 消费位置 |
|---|---|---|
| `data.liquidityIndex.{score, regime, pillars, structuralSignals}` | 流动性合成指数 | 主路径 macro-drivers 块 + 主题卡阵 流动性类 |
| `data.timeDimension.{trend30d, scoreChange30d, transmissionSpeed}` | 30 日趋势 + 传导速度 | Appendix 详情(不进主路径) |
| `data.transmissionChain.{nodes, layers, decomposition}` | 冲击节点链路 | Appendix 详情 |
| `data.regimeProbabilities.{disinflationaryGrowth, ...}` (6 regime) | 情景概率 | Appendix 详情 |
| `data.heatmap[]` (7 items) | 区域热力图 | `#global-risk-heatmap` |
| `data.assetMatrix[]` (7 items) | 资产偏好矩阵 | Appendix 详情 |
| `data.assetReturnMap.{horizon, rows}` | 收益/回撤映射 | Appendix 详情 |
| `data.scenarioTree[]` (4 items) | 四情景树 | Appendix 详情 |
| `data.warningSystem.{status, alerts, rules, criticalCount}` | 警报系统 | `#execution-risk-detail` 独立展示 — **不进主题卡阵 watch list**(Codex 第三轮硬错误 4 确认) |
| `data.triggerPanel.{critical, drivers, watchlist}` | 触发面板 | `#execution-risk-detail` 独立展示 — **不进主题卡阵 watch list**(同上) |
| `data.aiInterpretationLayer.{facts, dataInferences, modelJudgments, scenarioHypotheses}` | 站内规则化 AI 解读 | Appendix 详情 |
| `data.externalAiInterpretationLayer.{summaryZh, qualityReview.promotionEligible, sourceAttribution, provenance}` | 外部 AI 只读 | `#external-ai-auxiliary` |
| `<各派生层>.contractVersion / generatedAt / sourceCommit` | 元数据 | **仅 Appendix `#detail-data` 章节展示**(Codex 第三轮 Q6 确认) — 主题卡阵 + 主路径 runtime block 一律不显示 |

**核心边界**:全部为 display-only。任何字段的 `boundaries.affectsScoring === false`(已校对)。

**Codex 第三轮硬错误 4 说明**:契约 v2 暗示"watchList 与 warningSystem/triggerPanel 合并复用"是凭空设计,**当前代码 buildWatchList() 不消费 warningSystem 或 triggerPanel**。M-94 **不动 watchList 数据源**,warningSystem/triggerPanel 仍独立位于 `#execution-risk-detail` section。

### §1.9 卡片状态判定(red/yellow/green/orange)

M-94 引入"display-only 状态分级",**不影响 scoring**。判定来自:

**优先级 1**:字段自带的 `regime` 或 `status` 字段
- `macroDrivers.curve.regime` → 直接映射
- `macroDrivers.credit.regime` → 直接映射
- `worldOrderStress.state` = `multi_theater_stress` → orange overlay

**优先级 2**:阈值常量(M-94 新增,集中定义于新文件 `scripts/modules/displayStatusThresholds.js`):
- Brent: `>100` red, `>80` yellow, else green
- HY OAS: `>5%` red, `>3.5%` yellow, else green
- IG OAS: `>1.5%` red, `>1%` yellow, else green
- VIX: `>30` red, `>20` yellow, else green
- NFCI: `>0.5` red, `>0` yellow, else green

**优先级 3**:`unknown` / `missing` → pending(灰色)

**重要**:阈值常量**仅用于卡片着色**,不进入任何 score 计算。新文件 `displayStatusThresholds.js` 必须导出常量数组,不能调用任何 worker / data 改写函数。

### §1.10 dailyRealtimeInput 顶层字段(Codex 第三轮补充)

被 `buildTodayJudgment` 和 `buildKeyChanges` 消费,M-94 Hero 与 WoW 区域必须使用:

```js
data.dailyRealtimeInput = {
  branch,                       // 例如 "main"
  commitSha,                    // git commit
  updatedAt,                    // ISO datetime — 最新更新时间
  sourceMode,                   // worker_first / fallback / etc.
  healthScore,                  // 0-100 数据健康分数(进 plain-summary buildDataHealth)
  capturedAt                    // ISO datetime — 数据捕获时间
}
```

**消费路径**:
- Hero footer "DATA HEALTH" 显示 `${healthScore}/100`
- plain-summary `dataHealth` 翻译表(`renderPlainSummary.js` `buildDataHealth()` 已有逻辑)
- WoW 区域用 `updatedAt` 标识本期周期

---

## §2 IA 变更范围(精确锁死)

### §2.1 IA 从 14 项扩为 15 项

**当前**(DESIGN.md §4.1):

```
1. Hero / Masthead
2. dashboard-jump-nav (14 项)
   [非 nav preface] #plain-summary-card
3. #macro-risk-overview
   ├─ runtime: #homepage-today-judgment
   ├─ runtime: #homepage-pressure-sources
   ├─ runtime: #homepage-signal-layers
   ├─ runtime: #homepage-macro-drivers
   ├─ runtime: #homepage-market-temperature
   ├─ runtime: #homepage-risk-engines
   ├─ runtime: #homepage-cross-validation
   ├─ runtime: #wow-key-changes
   └─ strip:   #homepage-realtime-band
4. #global-risk-heatmap
═ 折叠区 ═
5. #detail-data
6. #world-order-stress-section
7. #method-evidence
8. #external-ai-auxiliary
9. #execution-risk-detail
```

**M-94 后**:

```
1. Hero / Masthead
2. dashboard-jump-nav (15 项)         ← +1
   [非 nav preface] #plain-summary-card  (不变)
3. #macro-risk-overview  (内部 8 runtime block 完整保留,视觉重写)
4. #macro-thematic-cards              ← NEW
5. #global-risk-heatmap
═ 折叠区 ═
6. #detail-data
7. #world-order-stress-section
8. #method-evidence
9. #external-ai-auxiliary
10. #execution-risk-detail
```

### §2.2 jump nav 第 15 项

**新增 nav item**(放在原第 8 `#wow-key-changes` 之后、原第 9 `#global-risk-heatmap` 之前):

```js
['宏观主题卡阵', '#macro-thematic-cards']
```

完整 15 项 nav contract(用于 `check-homepage-ia-contract.mjs` + `check-editorial-redesign-contract.mjs` 同步更新):

```js
const navContract = [
  ['今日总判断',     '#homepage-today-judgment'],
  ['压力来源',       '#homepage-pressure-sources'],
  ['信号分层',       '#homepage-signal-layers'],
  ['四大驱动',       '#homepage-macro-drivers'],
  ['市场温度',       '#homepage-market-temperature'],
  ['风险引擎',       '#homepage-risk-engines'],
  ['交叉验证',       '#homepage-cross-validation'],
  ['本期关键变化',   '#wow-key-changes'],
  ['宏观主题卡阵',   '#macro-thematic-cards'],    // ← NEW
  ['风险热力图',     '#global-risk-heatmap'],
  ['详细数据',       '#detail-data'],
  ['世界秩序',       '#world-order-stress-section'],
  ['方法说明',       '#method-evidence'],
  ['外部 AI',        '#external-ai-auxiliary'],
  ['执行风控',       '#execution-risk-detail'],
];
```

### §2.3 静态 staticRequiredIds 扩展

`check-homepage-ia-contract.mjs` 的 `staticRequiredIds` 数组需要追加 `'macro-thematic-cards'`:

```js
const staticRequiredIds = [
  'homepage-realtime-band',
  'macro-thematic-cards',   // ← NEW
  'global-risk-heatmap',
  'detail-data',
  'world-order-stress-section',
  'method-evidence',
  'external-ai-auxiliary',
  'execution-risk-detail',
];
```

### §2.4 `checkOrdering()` 期望顺序更新

```js
const expectedOrder = [
  ...macroRuntimeIds,           // 8 个 runtime block 不变
  'homepage-realtime-band',
  'macro-thematic-cards',       // ← NEW(在 realtime-band 与 global-risk-heatmap 之间)
  'global-risk-heatmap',
  'detail-data',
  'world-order-stress-section',
  'method-evidence',
  'external-ai-auxiliary',
  'execution-risk-detail',
];
```

### §2.5 `editorial-section` 色带

新 section 色带:`var(--risk-green)`(寓意"信息汇编层",视觉与 macro-risk-overview 的 risk-red 区分)

DESIGN.md §5.1 表格追加:

| Section | 色带 token | 语义 |
|---|---|---|
| `#macro-thematic-cards` | `var(--risk-green)` | 主题汇编,跨分析层的读者类别入口 |

### §2.6 字面量同步清单(Codex 第三轮硬错误 5 — PR 必挂如不做)

Codex 第三轮在源码中找到 **5 处硬编码"14 项"字面量**,改 IA 到 15 项时必须同步全部修改,否则 `npm run check:all` 必挂。

| # | 文件 | 行号 | 现状 | 改为 |
|---|---|---|---|---|
| 1 | `DESIGN.md` | §4.1 第 144 行附近 | `2. dashboard-jump-nav            (顶部跳转导航 14 项)` | `2. dashboard-jump-nav            (顶部跳转导航 15 项)` |
| 2 | `DESIGN.md` | §10 第 285 行附近 | 同上(若 §10 速查表也有) | 同上 |
| 3 | `DESIGN.md` | §12 第 520 行附近(若有) | 同上(若文档历史段也有) | 同上 |
| 4 | `scripts/check-homepage-ia-contract.mjs` | `checkNav()` 报错文案 | `top nav must follow the exact 14-step reading-path order` | `top nav must follow the exact 15-step reading-path order` |
| 5 | `scripts/check-editorial-redesign-contract.mjs` | `checkHomepageIa()` 报错文案 | `homepage nav must keep the exact 14-item editorial IA order and labels` | `homepage nav must keep the exact 15-item editorial IA order and labels` |
| 6 | `scripts/check-editorial-redesign-contract.mjs` | `checkDesignContractDoc()` requiredMarkers 数组 | `'dashboard-jump-nav            (顶部跳转导航 14 项)'` | `'dashboard-jump-nav            (顶部跳转导航 15 项)'` |

**Codex 实施提醒**:这 6 处字面量必须**完整同步**才能让 PR 1 全绿。任何遗漏一处,`npm run check:all` 必挂。Codex 在实施时建议先全文 grep `14 项` 和 `14-step` / `14-item` 确认无遗漏。

### §2.7 PR 1 阶段 `#macro-thematic-cards` 空容器骨架规范

**关键约束**(v2.2 新增):PR 1 改 IA checker 后,checker 会要求 `index.html` 包含 `id="macro-thematic-cards"` 元素 + nav 第 9 项指向它。**两者必须同步 PR 1 落地**,否则 `npm run check:all` 必挂(`check-homepage-ia-contract.mjs:checkRequiredIds()` 和 `checkOrdering()` 会同时报错)。

**PR 1 阶段空容器 HTML**(放在 `index.html` 内,`#macro-risk-overview` 闭合标签之后、`#global-risk-heatmap` 之前):

```html
<section id="macro-thematic-cards" class="editorial-section" style="--section-accent: var(--risk-green);">
  <header class="editorial-section-header">
    <span class="section-kicker">MACRO THEMATIC CARDS · 宏观主题卡阵</span>
    <span class="section-title">8 读者类别 红黄绿指标卡</span>
    <span class="section-note">本 section 容器骨架由 M-94 PR 1 落地,内容由 PR 2 通过 renderThematicCards.js 填充。</span>
  </header>
  <div class="editorial-section-body" id="macro-thematic-cards-root">
    <!-- PR 2 在此插入 8 个读者类别 block + 38 张指标卡 -->
  </div>
</section>
```

**为什么这样设计**:
- 用 `editorial-section` 类,自动继承 DESIGN.md §5.1 标准结构,无需 `assets/styles.css` 新增任何 selector(PR 1 不改 styles.css 的硬约束保留)
- `--section-accent: var(--risk-green)` 用 inline style 设定,符合 DESIGN.md §5.1 规范
- `editorial-section-body` 内有空 `<div id="macro-thematic-cards-root">` 作为 PR 2 的 mount 锚点,模仿现有 `#macro-risk-overview-root` 模式
- section-note 明示"内容由 PR 2 填充",PR 1 后页面上会显示这一行说明,但不影响主路径阅读

**nav 第 9 项 HTML**(放在 `<a href="#wow-key-changes">本期关键变化</a>` 之后、`<a href="#global-risk-heatmap">风险热力图</a>` 之前):

```html
<a href="#macro-thematic-cards">宏观主题卡阵</a>
```

**PR 1 完成后的视觉效果**:
- jump nav 从 14 项变成 15 项
- 首页中段(`#macro-risk-overview` 之后、`#global-risk-heatmap` 之前)多一个**绿色色带的空 section**,header 显示标题 + "PR 2 填充" 说明
- 主路径其他部分**完全不变**(因为 `renderMacroOverview.js` / 8 个 runtime block 都不动)
- 视觉上是"占位章节",和 M-93A0 PR 1 时 `#plain-summary-card` 刚到位但还没有数据的状态等价

**Codex 实施 PR 1 时禁止做**:
- ❌ 在 `#macro-thematic-cards-root` 内填任何卡片 / 内容(那是 PR 2 范围)
- ❌ 改 `scripts/modules/*` 任何文件
- ❌ 改 `assets/styles.css`(空容器用现有 token,无需新 selector)
- ❌ bump cache version(没有 implementation 改动,无需 bump)
- ❌ 引入 `renderThematicCards.js` 或它的引用

---

## §3 8 大主题卡片清单与字段映射

### §3.1 主题 1 · 通胀与能源 (`#cat-inflation-energy`)

**section header**:
- kicker:`INFLATION & ENERGY`
- title:`通胀与能源`
- note:`能源链与通胀指标。本类卡片源自 brentPricingLayer / macroDrivers.consumer.ismManufacturingPmi。CPI / WTI 为 P1 占位,M-95 起接入。`

**卡片清单**(5 张):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | Brent 布伦特原油 | 主数字 `data.__effectiveDisplayInputs.brent`(fallback `displayInputsBaseline.brent`);agg-rows 5 字段:`brentPricingLayer.{eiaBrentSpotProxy.price, futuresPriceCurve.frontPrice, iceFuturesPriceCurve.frontPrice, proxySpread.spotMinusFutures, proxySpread.maxProxyDivergencePct}` | 阈值 §1.9 | **HIGHEST**(agg-rows 5 行 + 30 字 note) |
| 2 | Crack spread 炼油利润 | `data.brentPricingLayer.{crackSpread, crackSpread4wChange, crackSpreadRegime}` | `crackSpread > 40` red | HIGH |
| 3 | ISM 制造业 PMI | `data.macroDrivers.consumer.{ismManufacturingPmi, ismManufacturingPmi3mChange, ismPmiRegime}` | `< 45` red, `< 50` yellow | HIGH |
| 4 | US CPI | P1 占位,无字段 | pending | LOW(灰占位卡) |
| 5 | WTI | P1 占位,无字段 | pending | LOW(灰占位卡) |

**主题级 intro 段**(在 section 头部下方,卡片上方):
> 能源是当前主线的第一环。Brent 主值与公开代理价格的距离反映现货溢价压力;crack spread 是能源向下游柴油 / 汽油传导的中间证据;ISM PMI 看美国制造业能否消化能源成本。CPI / WTI 后续接入。

### §3.2 主题 2 · 全球流动性 (`#cat-global-liquidity`)

**section header**:
- kicker:`GLOBAL LIQUIDITY`
- title:`全球流动性`
- note:`美元 / 黄金 / 利率曲线 / Fed 流动性 / Fed 政策路径。本类卡片源自 __effectiveDisplayInputs 与 macroDrivers.{fedLiquidity, policyExpectations, curve}。`

**卡片清单**(7 张):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | DXY 广义美元指数 | `data.__effectiveDisplayInputs.dxy`;**12 周高位标识** 当前无现成字段,标 **P2 占位**(后续 milestone 接入前端派生 helper)| `> 115` red | HIGH |
| 2 | Gold 黄金 | `data.__effectiveDisplayInputs.gold` | 趋势驱动 | MEDIUM |
| 3 | US 10Y + 2s10s 曲线 | `data.__effectiveDisplayInputs.us10y` + `data.macroDrivers.curve.{t10y2y, t10y2yWeekChange, regime, steepeningAlert}` | `regime` 直接映射 | HIGH(双数字 + 4 行 agg-rows) |
| 4 | USD Liquidity 三层聚合 | `data.macroDrivers.fedLiquidity.{walcl, walcl4wChange, onRrp, onRrpWeekChange, reserveBalances, reserveBalances4wChange, sofr, effectiveFedFundsRate, bgcr, tgcr, repoSpreadRegime}` agg-rows 全显(11 字段) | `liquidityIndex.regime` 同步 | **HIGHEST**(6 行 agg-rows + 60 字 note + boundary 标注) |
| 5 | Fed 政策路径分歧 | `data.macroDrivers.policyExpectations.{targetMid, fedFundsFutureFrontPrice, fedFundsFutureImpliedRate, futureMinusTargetMid, zqCurveFrontImpliedRate, sr3CurveFrontImpliedRate, oisForward12MRate, sepDotMid2026, statementMinutesTone}`(9 字段)| `\|futureMinusTargetMid\| > 50bp` red | **HIGHEST**(7 行 agg-rows) |
| 6 | Cu/Au 铜金比 | P1 占位 | pending | LOW |
| 7 | CFETS RMB 人民币篮子 | P1 占位 | pending | LOW |

**主题级 intro 段**:
> 全球流动性来自四条管线:美元 / 黄金 / 利率 / 美联储资产负债表。任意管线收紧都会向风险资产传导。当前美联储流动性三层(水位 / 回购 / 隔夜)均无 2019-09 形态信号。

### §3.3 主题 3 · 信用与企业债 (`#cat-credit-corporate`)

**section header**:
- kicker:`CREDIT & CORPORATE`
- title:`信用与企业债`
- note:`高收益与投资级利差、NFCI、私募信贷公开代理、商业地产风险。源自 __effectiveDisplayInputs 与 macroDrivers.{credit, privateCreditProxy, commercialRealEstate}。`

**卡片清单**(5 张 — v2.1 决策 A 新增 CRE 第 5 卡):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | HY OAS 高收益债利差 | `data.__effectiveDisplayInputs.hyOas` 主数字;WoW 变化**当前无现成字段**,aux 写"等待 history WoW 接入" | §1.9 | HIGH |
| 2 | IG OAS 投资级利差 | `data.macroDrivers.credit.{igOas, igOas1dChange, igHyRatio}` | §1.9 | HIGH |
| 3 | NFCI 芝加哥联储 FCI | `data.macroDrivers.credit.{nfci, nfci4wChange, nfciRegime}`(Codex 第三轮 Q1 确认存在) | §1.9 + 方向反转说明 | HIGH(必须强调"正值=收紧") |
| 4 | Private Credit Proxy 私募代理 | `data.macroDrivers.privateCreditProxy.{intervalFundNav, bdcEtfPrice, bdcEtf4wChange, pbdcEtfPrice, pbdcEtf4wChange, seniorLoanEtfPrice, seniorLoanEtf4wChange, privateCreditProxyRegime}`(8 字段直显) | display-only | HIGH(明确边界:公开代理,不是 private marks。**6-proxy z-score 数据不足,Codex 第三轮 Q5 确认派生不成立,降级为 8 字段直显 + note 预留"M-96+ 接 6-proxy z-score"接口**) |
| 5 | **Commercial RE 商业地产风险**(v2.1 决策 A 新增) | `data.macroDrivers.commercialRealEstate.{creDelinquencyRate, creDelinquencyRateQoQChange, creChargeOffRate, creChargeOffRateQoQChange, sloosCreNonfarmNonresidentialTightening, sloosCreConstructionTightening, sloosCreMultifamilyTightening, sloosCreTighteningMax}`(8 字段) | `creDelinquencyRate > 1.5%` red | **HIGHEST**(6 行 agg-rows:违约率 + 核销率 + SLOOS 三类紧缩 + max) |

**主题级 intro 段**:
> 信用层回答的不是"压力高不高",而是"压力有没有从价格变成融资约束"。HY OAS 与 IG OAS 是企业借钱难易的市场定价;NFCI 综合 100+ 跨市场信号;私募代理用上市 BDC ETF 篮子近似公开市场看不见的私募信贷;CRE 看商业地产融资压力(账面 + 银行紧缩双轨证据)。

### §3.4 主题 4 · 美国经济温度 (`#cat-us-economy`)

**section header**:
- kicker:`US ECONOMIC TEMPERATURE`
- title:`美国经济温度`
- note:`就业 + 消费两条管线 + 四象限判读。源自 macroDrivers.{employment, consumerRetail, consumer}。`

**卡片清单**(2 张聚合卡 + 1 个四象限说明文字):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | Employment 就业聚合 | `data.macroDrivers.employment.{initialClaims, initialClaims4wAverage, initialClaims4wChange, continuingClaims, continuingClaims4wAverage, joltsOpenings, joltsOpeningsYoY, averageHourlyEarningsYoY, u6UnemploymentRate, industryDiffusionPct, industryDiffusionRegime}`(11 字段) | `initialClaims > 280k` red | **HIGHEST**(7 行 agg-rows:claims/continuing/JOLTS/U-6/AHE/diffusion%/diffusion regime + 50 字 note) |
| 2 | Consumer 消费聚合 | `data.macroDrivers.consumerRetail.{cartsNominal, cartsNominal4wAverage, cartsNominalYoY, cartsReal, cartsReal4wAverage, cartsRealYoY, retailSegments, segmentPositiveCount, segmentDiffusionPct, strongestSegment, weakestSegment, bofaCardSpendingExGasYoY, redbookYoY}` + `data.macroDrivers.consumer.{umichSentiment, threeMonthChange}`(15 字段)| `cartsRealYoY < 0` red | **HIGHEST**(7 行 agg-rows:cartsReal/segmentDiffusion/strongest/weakest/UMich/BoA/Redbook) |

**主题级 intro 段**(四象限说明):
> **四象限 · 就业 × 消费**:就业供给端 + 消费需求端,只有同向才是真趋势。当前位 = 就业偏强 / 消费偏弱 → 实际工资被通胀压制(2022-2023 模式)。

### §3.5 主题 5 · 世界经济 (`#cat-world-economy`)

**section header**:
- kicker:`WORLD ECONOMY`
- title:`世界经济`
- note:`P1 占位区。本类 M-94 阶段除 World Order overlay 暂代外无字段。STOXX/Nikkei/DAX/V2X 等 M-95 起接入。`

**卡片清单**(1 张暂代 + 4 张 P1 占位):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | World Order 暂代 | `worldOrderStress.{score, state, labelZh}` | `state` 直接 | MEDIUM(明确"暂代,M-95 后退场") |
| 2 | STOXX 50 | P1 | pending | LOW |
| 3 | Nikkei 225 | P1 | pending | LOW |
| 4 | DAX | P1 | pending | LOW |
| 5 | V2X 欧元区波动率 | P1 | pending | LOW |

### §3.6 主题 6 · 中国宏观 (`#cat-china-macro`)

**section header**:
- kicker:`CHINA MACRO`
- title:`中国宏观`
- note:`类别整体 P1 占位。M-95/M-96 起接入公开数据(Yahoo 股指 + TE 公开 PMI/CPI/10Y + Stooq CFETS)。央行 SLO/MLF/OMO 原始 tape、社融组件分项、70 城房价原始不可达。`

**卡片清单**(7 张全 P1 占位,平铺,不折叠 — Robert 立场:架构槽位预留):

| # | 卡名 | 字段来源 | 状态 |
|---|---|---|---|
| 1 | SSE Composite 上证 | P1(Yahoo `000001.SS`) | pending |
| 2 | Hang Seng 恒生 | P1(Yahoo `^HSI`) | pending |
| 3 | CSI 300 沪深 300 | P1(Yahoo `000300.SS`) | pending |
| 4 | China PMI | P1(TE 公开 HTML) | pending |
| 5 | China CPI/PPI | P1(TE + FRED mirror) | pending |
| 6 | China 10Y | P1(TE 公开 HTML) | pending |
| 7 | CFETS RMB | P1(Stooq / TE) | pending |

**视觉**:全部用 dashed border + 灰底 + `pending` badge + "next: P1 / P2" 标识。

### §3.7 主题 7 · 市场情绪 (`#cat-market-sentiment`)

**section header**:
- kicker:`MARKET SENTIMENT`
- title:`市场情绪`
- note:`VIX / SPX / NDX 60w z-score(广度参照)。市场温度主卡(QQQ z-score)已在上方 #homepage-market-temperature 完整展示,此处不重复。`

**卡片清单**(3 张 — v2.1 决策 C:NDX 卡从"NDX vs SPX 30 日差"换为 NDX 60w z-score,因为 Codex 第三轮 Q4 实证 SPX 历史数据不存在):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | VIX 隐含波动率 | `data.__effectiveDisplayInputs.vix` | `> 25` red | HIGH |
| 2 | SPX 标普 500 | `data.__effectiveDisplayInputs.spx`;**52 周高位标识** 当前无现成字段,标 **P2 占位**(同 DXY) | `距高 -15%+` red | MEDIUM |
| 3 | **NDX 60w z-score**(v2.1 决策 C 替换) | `data/market-pricing-metrics.json.assets.ndx.records[]` → 最新 z-score;调用 `classifyZScoreBucket(getLatestMetric(ndxAssetData).zScore)` 复用 `buildCrossValidationMatrix.js` 现有 helper(无需新建派生逻辑) | z-score 分桶 §1.7 | HIGH(明确"与 QQQ 同步极端,确认整个美国成长股板块过热") |

**实施提醒**(Codex 第三轮 Q4 + T3):
- 调用方式:`import { classifyZScoreBucket } from './buildCrossValidationMatrix.js'`
- helper 已存在,渲染时只需:
  ```js
  const ndxRecords = marketPricingMetricsData.assets.ndx.records;
  const latestNdx = ndxRecords[ndxRecords.length - 1];
  const ndxZ = latestNdx.zScore;
  const bucket = classifyZScoreBucket(ndxZ);  // 复用现有
  ```
- **不**新建 `renderThematicCards.js` 内的 z-score helper

### §3.8 主题 8 · 地缘与世界秩序 (`#cat-geopolitics`)

**section header**:
- kicker:`GEOPOLITICS & WORLD ORDER`
- title:`地缘与世界秩序`
- note:`底层地缘评分 + World Order overlay + 经济武器化 + 军备冲突。源自 modules.geopolitical 与 worldOrderStress.dimensions。`

**卡片清单**(4 张):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | Geopolitical 底层评分 | **`data.modules.geopolitical`(扁平数字,不是 `.score` 子字段)+ `data.moduleTrends.geopolitical`(趋势符号)**;Codex 第三轮 Q2 修正 | `> 70` red | HIGH(明确"进 scoring") |
| 2 | World Order overlay | `worldOrderStress.{score, state, labelZh}` | `state` 直接 | HIGH(明确"regime overlay,不进 scoring") |
| 3 | Economic Weaponization | `worldOrderStress.dimensions.economicWeaponization.{score, labelZh, trend}` | 阈值 §1.9 | MEDIUM |
| 4 | Arms & Conflict | `worldOrderStress.dimensions.peaceDividendRetreat.{score, labelZh, trend}` | 阈值 §1.9 | MEDIUM(标 "MANUAL · ANNUAL") |

---

## §4 文件改动清单(implementation 范围,PR 1 + PR 2)

### §4.1 PR 1:契约 + DESIGN.md + checker + index.html 容器骨架(v2.2 范围扩大)

**新增**:
- `docs/M94_V0_DATA_CONTRACT.md`(本文档 v2.2)
- `manual-artifacts/m94-v0/m94-v0-FINAL-mock.html`(视觉权威基准)

**修改**:

| 文件 | 改动 | Codex 第三轮提醒 |
|---|---|---|
| `DESIGN.md` §4.1 | IA 表追加 `#macro-thematic-cards`(在 #global-risk-heatmap 之前)+ **同步把"14 项"字面量全部改 15 项**(§2.6 表 #1-3) | 全文 grep `14 项` 不能有遗漏 |
| `DESIGN.md` §5.1 | section 色带表追加 `#macro-thematic-cards: var(--risk-green)` | — |
| `DESIGN.md` §10.2 | ID 速查表追加 `#macro-thematic-cards   宏观主题卡阵(绿色带)` | — |
| `DESIGN.md` §12 文档历史 | 追加一行 M-94 修订记录 | — |
| `scripts/check-homepage-ia-contract.mjs` | `navContract` 14 → 15 项,`staticRequiredIds` 增加 `'macro-thematic-cards'`,`expectedOrder` 同步;**报错文案 14-step → 15-step**(§2.6 表 #4) | 文案 grep 确认无 `14-step` 残留 |
| `scripts/check-editorial-redesign-contract.mjs` | `checkHomepageIa()` 内 `expectedLinks` 14 → 15 项;`checkDesignContractDoc()` 内 `requiredMarkers` 数组追加 `'#macro-thematic-cards'` **并把 `'dashboard-jump-nav            (顶部跳转导航 14 项)'` 字面量改 15 项**(§2.6 表 #5-6);报错文案 14-item → 15-item | 文案 grep 确认无 `14-item` 残留 |
| **`index.html` nav 区**(v2.2 新增) | 在 `<a href="#wow-key-changes">本期关键变化</a>` 之后、`<a href="#global-risk-heatmap">风险热力图</a>` 之前,插入 `<a href="#macro-thematic-cards">宏观主题卡阵</a>` | 让 IA checker 通过 |
| **`index.html` body 主区**(v2.2 新增) | 在 `<section id="macro-risk-overview">` 闭合 `</section>` 之后、`<section id="global-risk-heatmap">` 起始之前,插入 §2.7 规范的**空 `#macro-thematic-cards` section 容器骨架**(包含 header + 空 body + `id="macro-thematic-cards-root"` mount 锚点) | 让 IA checker 通过 |

**PR 1 不改的 implementation 文件**(v2.2 明确):

| 文件 | 理由 |
|---|---|
| `scripts/modules/render*.js` 任何文件 | render logic 全部留 PR 2 |
| `scripts/modules/buildCrossValidationMatrix.js` | 算法不动 |
| `scripts/modules/realtime.js` | Worker / runtime 派生不动 |
| `assets/styles.css` | 空容器用现有 `--paper-* / --risk-*` token,无需新 selector |
| `data/*` 任何文件 | 数据生产不动 |
| `workers/*` | 不动 |
| `.github/workflows/*` | 不动 |
| `package.json` | PR 1 不新增 npm script(`check:thematic-cards-contract` 留 PR 2 引入) |
| `index.html` `<head><style>` 区 | 不删除现有硬编码色值,只动 nav 和 body 区 |

**PR 1 验收**:`npm run check:all` 必须全绿(因 nav + section 容器同步到位,IA checker 不会再 fail)。具体见 §9.6。

### §4.2 PR 2:render logic implementation(v2.2 范围调整)

**v2.2 关键说明**:nav 第 15 项 + 空 `#macro-thematic-cards` section 容器骨架已在 PR 1 落地。PR 2 只需填充内容,不再改 nav 或新建 section 容器。

**新增**:

| 文件 | 用途 |
|---|---|
| `scripts/modules/renderThematicCards.js` | 渲染 `#macro-thematic-cards` section 全部内容(8 主题块 + 38 张卡片 — 注:v2 误写为 37,实际 v2.1+ 是 5+7+5+2+5+7+3+4=**38 张卡**,其中信用类含 CRE 新卡 + 市场情绪类 NDX 换字段不增减数量) |
| `scripts/modules/displayStatusThresholds.js` | 卡片状态判定阈值常量(red/yellow/green/orange)**仅常量,不含计算逻辑** |
| `scripts/check-thematic-cards-contract.mjs` | 新 section 内容契约 checker(类似 check-plain-summary-card-contract 模式)**必须在 `package.json` 注册并加入 `check:suite.mjs`**(Codex 第三轮提醒) |

**修改**:

| 文件 | 改动 |
|---|---|
| `index.html` | (1) `<head><style>` 块删除所有 `.macro-overview-*` 类的硬编码色值,改用 `var(--paper-*) / var(--risk-*)` token;(2) **PR 1 已落地的空 `#macro-thematic-cards-root` mount 锚点不再改动**,renderThematicCards.js 通过 `document.getElementById('macro-thematic-cards-root')` 填充内容;(3) `<body>` 末尾引入 `renderThematicCards.js` 模块;(4) **bump cache version `28.0M-93AV` → `28.0M-94`** |
| `scripts/modules/renderMacroOverview.js` | 重写 8 个 build 函数的 **HTML 生成部分**,改为 Bubble Watch 风格(参考 §8 详细指引)。**Codex 第三轮警告**:`buildPressureSources`(160 行)+ `buildMacroDrivers`(616 行)总共 776 行,改写时必须**保留所有现有字段消费**,只改外壳,不要"简化成 mini card / 四列摘要"导致字段被绕过(详见 §8) |
| `scripts/modules/render.js` | 在主渲染流程加入 `renderThematicCards(data, root)` 调用 |
| `assets/styles.css` | 补充新选择器(`.reader-cat-block / .reader-cat-header / .indicator-card / .agg-rows / .badge.{red,yellow,green,orange,pending} / .indicator-card.pending / .cat-intro` 等),用现有 `--paper-* / --risk-*` token,无新 token 创建;**注**:当前 styles.css 是 `--paper-*` 与 `--editorial-*` 两套并存,M-94 沿用,不动旧 `--editorial-*` |
| `package.json` `scripts` | 新增 `"check:thematic-cards-contract": "node --check scripts/check-thematic-cards-contract.mjs && node scripts/check-thematic-cards-contract.mjs"`;**`check:all` 必须加入此项**(否则即使 checker 写对也不会被执行)|
| `scripts/check-suite.mjs`(如存在)| 注册 thematic-cards 检查 |

**v2.2 PR 2 不再做的事**(原本 v2.1 PR 2 范围,已迁移到 PR 1):
- ~~`index.html` jump nav 14 → 15 项~~ → 已在 PR 1
- ~~`index.html` 新增 `<section id="macro-thematic-cards">` 容器~~ → 已在 PR 1
- ~~更新 PR 1 阶段 section-note "PR 2 填充" 说明文字~~ → PR 2 在 renderThematicCards.js 首次成功渲染后,移除 PR 1 留下的 "本 section 容器骨架由 M-94 PR 1 落地,内容由 PR 2 通过 renderThematicCards.js 填充" 这段 placeholder note(或保留作为方法说明,Codex 实施时和 Robert 确认)

**不修改**(铁律):

| 文件/目录 | 理由 |
|---|---|
| `data/*.json` 任何文件 | 项目宪法,M-94 不动数据生产 |
| `scripts/modules/decision.js` | 决策模型,不动 |
| `scripts/modules/realtime.js` | Worker / realtime 派生,不动 |
| `scripts/modules/buildCrossValidationMatrix.js` | 一致性算法,不动 |
| `scripts/modules/renderPlainSummary.js` | M-93A0 已稳定,本契约不改 plain-summary-card |
| `scripts/modules/renderExternalAi.js` | External AI 边界,不动 |
| `scripts/modules/health.js / freshness.js` | 不动 |
| `workers/*` | 不动 |
| `realtime/*` | 不动 |
| `.github/workflows/*` | 项目宪法第 5 条 |

---

## §5 数据消费充分性审计(对照原 schema)

> 这一节回答:M-94 主路径是不是把项目已有数据用尽了?

| 顶层字段 | M-94 主路径消费? | 消费位置 |
|---|---|---|
| `dailyBrief` | ✅ | plain-summary-card preface + Hero verdict + Watch list |
| `divergenceLayer` | ✅ | signal-layers + cross-validation + WoW |
| `brentPricingLayer` | ✅ | 通胀与能源主题(Brent + Crack) |
| `score / scoreChange{1d,7d,30d}` | ✅ | Hero 大数字 + plain-summary + WoW |
| `currentMacroRegime / currentCrisisPhase` | ✅ | Hero kicker + verdict |
| `displayInputsBaseline` | ✅ | runtime 派生 `__effectiveDisplayInputs`,主路径每个数字卡 |
| `topRisks` | ✅ | plain-summary-card |
| `modules` (6 子模块) | ✅ | risk-engines + 地缘卡 |
| `moduleTrends` | ✅ | 8 周趋势图 |
| `regimeProbabilities` | ⚠️ Appendix only | detail-data 章节 |
| `phaseSignals` | ✅ | Hero verdict breakdown |
| `macroDrivers` (13 子) | ✅ | macro-drivers runtime block + 主题卡阵 多类 |
| `liquidityIndex` | ✅ | macro-drivers 全球流动性聚合 |
| `timeDimension` | ⚠️ Appendix only | detail-data |
| `heatmap` | ✅ | `#global-risk-heatmap` |
| `transmissionChain` | ⚠️ Appendix only | detail-data |
| `transmissionDeltaMeta` | ⚠️ Appendix only | detail-data |
| `assetMatrix` | ⚠️ Appendix only | detail-data |
| `assetReturnMap` | ⚠️ Appendix only | detail-data |
| `scenarioTree` | ⚠️ Appendix only | detail-data |
| `warningSystem / triggerPanel` | ✅ | `#execution-risk-detail` 完整展示 |
| `confidenceNotes` | ✅ | plain-summary + verdict footer |
| `recovery` | ✅ | `#detail-data` 系统状态 |
| `tradingSystem` | ⚠️ Appendix only | `#execution-risk-detail` |
| `decisionModel` | ⚠️ Appendix only | `#execution-risk-detail` |
| `aiInterpretationLayer` | ⚠️ Appendix only | detail-data |
| `externalAiInterpretationLayer` | ✅ | `#external-ai-auxiliary`(quality review gated) |
| `worldOrderStress` (整文件) | ✅ | 地缘主题 + `#world-order-stress-section` |
| `marketPricingMetrics` (整文件) | ✅ | market-temperature runtime block 主卡 |

**审计结论**:42 个 radar-data 顶层字段中,**18 个进入 M-94 主路径**(占 43%),**剩余进 Appendix 折叠区**或保留至未来 milestone。没有任何字段被遗弃。

---

## §6 Codex 第三轮审核已解决问题(从 v2 待办升级为 v2.1 确认结论)

> 本节是 v2 留下的 5 个 TODO + 新增 Q6 contractVersion 展示问题,**Codex 第三轮审核已全部给出代码层确认答案**。v2.1 据此修正契约相应章节。

| Q | v2 问题 | Codex 第三轮答案 | 在本契约 v2.1 的落实位置 |
|---|---|---|---|
| Q1 | `data.macroDrivers.credit.nfci` 是否存在? | **存在**,完整路径:`data.macroDrivers.credit.{nfci, nfci4wChange, nfciRegime}` + `sourceStatus.nfci`(见 `data/radar-data.json:1242-1260` + `renderMacroOverview.js:1002, 1104, 1431`)| §1.3 已加完整字段;§3.3 NFCI 卡 #3 已升级 HIGH 密度 |
| Q2 | `data.modules.geopolitical.score` 路径准确? | **错**。`data.modules` 是 6 项**扁平数字**(`geopolitical: 78` 直接是数字),趋势在 `data.moduleTrends.geopolitical`(见 `data/radar-data.json:857-872` + `decision.js:459-480`)| §1.3.5 已新增节;§3.8 第 1 卡字段路径已修正 |
| Q3 | `#macro-thematic-cards` 是否撞 `checkOptionalPlainSummaryPreface()`? | **不撞**。只要 `plain-summary-card` 仍在 nav 后 / `macro-risk-overview` 前(见 `check-homepage-ia-contract.mjs:279-311`)即可。新增 thematic-cards 在 macro-risk-overview 之后,不影响 preface 检查 | §2.1 IA 顺序已确认;FINAL mock 视觉已确认 |
| Q4 | NDX vs SPX 30 日相对强弱有现成派生? | **无 SPX 历史数据**。`data/market-pricing-metrics.json.assets` 只有 ndx/ixic,无 SPX。"NDX vs SPX 30 日"卡**不可行**,改为 **NDX 60w z-score** 复用 `classifyZScoreBucket` helper(决策 C) | §3.7 第 3 卡已替换;调用方式已说明 |
| Q5 | privateCreditProxy 6-proxy z-score 公式? | **数据不足,公式不成立**。`privateCreditProxy` 只有最新价格 + 4w change,**无 12 周历史窗口**(见 `data/radar-data.json:1567-1612`)。M-94 阶段不引入 z-score 派生,改为 8 字段直显 + note "M-96+ 接 6-proxy z-score" 占位(决策 B) | §3.3 第 4 卡已降级 HIGH 密度 + 边界 note |
| Q6 | contractVersion 是否展示? | **主 UI 不展示**。它是 render gate / fallback contract;若展示,只能进 Appendix `#detail-data` 章节作为方法审计(见 `render.js:482, 688, 851, 1043` + `renderExternalAi.js:285-303`) | §1.8 表已加 contractVersion 处理行;§9 验收清单已明确 |

**结论**:Codex 第三轮 6 个问题全部解决,无遗留 TODO。M-94 PR 1(本契约 + DESIGN.md + checker 更新)可以直接交付实施。

## §6.1 Codex 第三轮发现的"契约 v2 缺失字段"全部纳入 v2.1

| 缺失字段 | 消费位置 | v2.1 落实位置 |
|---|---|---|
| `dailyRealtimeInput.{healthScore, updatedAt, capturedAt}` | `buildTodayJudgment`, `buildKeyChanges` | §1.10 新增节 |
| `brentPricingLayer.{eiaBrentSpotProxy, futuresCurve, futuresPriceCurve, iceFuturesPriceCurve, ulsdPrice*}` | `buildTodayJudgment`, `buildPressureSources`, `buildSignalLayers`, §3.1 Brent 主题卡 | §1.5 + §3.1 卡 #1 |
| `macroDrivers.*.sourceStatus` | `buildMacroDrivers` 多处 | §1.3 各子模块字段已加 `sourceStatus`,主题卡不显示(避免冗余) |
| `macroDrivers.commercialRealEstate.*` | `buildMacroDrivers`, **§3.3 主题卡 #5 新增**(决策 A)| §1.3 + §3.3 |
| `worldOrderStress.{externalSources.*, decisionModifier.riskBias}` | `buildWorldOrderNarrative` | §1.6 已补充 |
| `marketPricingMetricsData.{sourceCommit, assets.ndx, assets.ixic, progress}` | `buildMarketTemperature`, `getAuxiliaryMarketPricingContexts` | §1.7 已说明 |
| `divergenceLayer.checks[].{key, status, severity}` | `buildRiskEngines:1639-1641` | §1.4 checks item 结构已说明 |
| `warningSystem / triggerPanel` | **不**进 MacroOverview watch list(Codex 第三轮硬错误 4) | §1.8 已修正;§3 已删除"合并复用"暗示 |

## §6.2 Codex 第三轮工作量警告(§8 实施指引已根据此调整)

| build 函数 | 当前规模 | Codex 警告 | v2.1 §8 处理 |
|---|---|---|---|
| `buildTodayJudgment` | 87 行 + render 段 | `editorial-big-number` 只有 CSS,无 JS helper;`appendRiskStageScale()` 已有但未调用 | §8.1 加备注:Codex 需新建 `appendEditorialBigNumber()` helper,**调用现有** `appendRiskStageScale()` |
| `buildPressureSources` | 160 行 | "改成 6 模块 mini card **会损失现有压力证据**" | §8.2 已改为"保留现有 6 类压力证据结构,仅改视觉外壳" |
| `buildSignalLayers` | 106 行 | `NARRATIVE_EMOJI` 已存在,卡片 helper 可复用 | §8.3 无需大改 |
| `buildMacroDrivers` | **616 行** | "'四列摘要' **会绕开大量已消费字段**" | §8.4 已改为"保留所有字段消费,仅按 fed/policy/curve/credit 4 组重新视觉分组" |
| `buildMarketTemperature` | 48 行 + append | checker 紧,必须保留 QQQ primary、NDX/IXIC、60 周均值、z-score、免责声明 | §8.5 已锁定 |
| `buildRiskEngines` | 256 行 | "源自 `data.modules`" 不准确,实际还吃 divergence/private credit/world order/market temp | §8.6 修正为"多源派生" |
| `buildCrossValidation` | 6 行 facade + 48KB matrix | 视觉可改,算法不要动 | §8.7 锁定 |
| `buildKeyChanges / buildWatchList` | 56 + 42 行 | `wow-item` / `editorial-watch-list` 已有 helper,改动相对小 | §8.8 锁定 |

---

## §7 卡片密度规范(借鉴 Path B,统一应用)

### §7.1 三档密度

| 密度 | 包含元素 | 用途 |
|---|---|---|
| **HIGHEST** | status bar + head + number + aux + agg-rows(4-6 行 key/value) + 长 note(40-60 字) + meta 行 | 聚合卡(privateCreditProxy, employment, consumerRetail, fedLiquidity) |
| **HIGH** | status bar + head + number + aux + note(25-40 字) + meta 行 | 标准卡(Brent, HY OAS, VIX, etc.) |
| **MEDIUM** | status bar + head + number + 短 note(10-20 字) + meta 行 | 次要卡(Crack, Gold, NDX 相对强弱) |
| **LOW(pending)** | dashed border + grey number "—" + P1/P2 标识 + meta 行 | P1 占位卡 |

### §7.2 agg-rows 视觉规范

```html
<div class="agg-rows">
  <div><span class="k">水位</span> · <span class="v">reserveBalances 3.62T</span> ↑</div>
  <div><span class="k">回购压力</span> · <span class="v">BGCR-SOFR +2bp</span></div>
  <div><span class="k">隔夜</span> · <span class="v">SOFR 5.31 / DFF 5.33</span></div>
</div>
```

CSS:
```css
.agg-rows {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--paper-muted);
  line-height: 1.7;
  border-top: 1px dotted #aaa;
  padding-top: 6px;
}
.agg-rows .k { color: var(--paper-muted); }
.agg-rows .v { color: var(--paper-ink); font-weight: 600; }
```

### §7.3 note 写作准则(对接金融意义)

每张 HIGH/HIGHEST 卡的 `note` 必须包含 1-2 句**金融意义解释**,不是数据复述。

✅ 好例: "强美元说明全球融资环境收紧,尚未到单独危机程度。"
❌ 差例: "DXY 当前值 119.3,周内 +1.4。"

### §7.4 主题级 intro 段

每个 reader-cat-block 在 header 与 card-grid 之间放一段 60-100 字的 intro 段,说明这一类指标背后的金融逻辑(参见 §3.1-3.8 各主题 intro)。

视觉:
```html
<p class="cat-intro">
  能源是当前主线第一环。Brent 主值与公开代理价格的距离反映现货溢价压力 ...
</p>
```

CSS:
```css
.cat-intro {
  font-family: var(--font-serif);
  font-size: 13px;
  background: var(--paper-bg-canvas);
  border-left: 3px solid var(--paper-ink);
  padding: 10px 14px;
  color: var(--paper-warm);
  line-height: 1.7;
  margin: 0 0 14px 0;
}
```

---

## §8 macro-risk-overview 内 8 runtime block 视觉重写要点

> 本节是给 Codex 实施 `renderMacroOverview.js` 改动时的精确指引。**只改 HTML 输出结构,不改 build 函数内部聚合逻辑**。

### §8.1 #homepage-today-judgment(Hero)

旧:`.macro-overview-hero` div with `.macro-overview-kicker / .macro-overview-one-line`
新:`<article class="editorial-big-number">` 结构,参考 mock Path B/C 的 Hero(深墨底反白文字 + 大数字 + verdict)

关键文本(对接 dailyBrief 真实字段):
- 大数字 = `data.score`
- 副文 = `${score} / 6 底层模块中 ${redCount} 红 / ${yellowCount} 黄 / ${greenCount} 绿`
- verdict kicker = `data.dailyBrief.macroState`(例如 "滞胀冲击 / 通胀冲击")
- verdict h2 = `data.dailyBrief.oneLineConclusion`
- footer = dominant chain `labelZh` + WoW change + data health

### §8.2 #homepage-pressure-sources

旧:展开式 list
新:`.mini-grid` 6 张 mini card,源自 `data.modules`(6 子模块**扁平数字**)

**Codex 第三轮警告**:`buildPressureSources` 当前 160 行,**实际消费的不只是 `data.modules`**,还包含 `data.modules` 的 6 类压力证据派生(每类有 evidence list、状态原因等)。改写时**必须**:
- 保留现有 6 类压力证据的内部 build 逻辑(`buildPressureCategorySummary` / `buildPressureCounts` 等)
- 仅替换 HTML 外壳为 mini-card 视觉
- **不允许**直接读 `data.modules[k]` 数字然后丢弃证据结构

如果改写后只剩 6 个数字,说明绕过了现有 build 函数,会损失大量字段消费。

### §8.3 #homepage-signal-layers

旧:展开式 list
新:`.narrative-list`,每条带 emoji 前缀(`NARRATIVE_EMOJI` 常量,已存在于 renderMacroOverview.js)+ score + 长 summary

### §8.4 #homepage-macro-drivers

旧:展开式 mini grid
新:**按 fed/policy/curve/credit 4 组重新视觉分组,并在底部加一行"子模块完整列表"**

**Codex 第三轮警告**:`buildMacroDrivers` 当前 616 行,是项目最大的 build 函数。如果改写成"四列摘要"绕过 616 行字段消费,会失去大量金融判读逻辑。改写时**必须**:
- 保留现有所有字段消费(13 子模块全部)
- 4 列视觉仅展示 fedLiquidity / policyExpectations / curve / credit 4 个**主**判读句
- 其他 9 个子模块(consumer/shippingFreight/employment/consumerRetail/commercialRealEstate/privateCreditProxy/activeSignals/gatingEvaluation/allSourcesMissing)在底部用 mono 字体一行列出,**它们已经在主题卡阵中详细展示**
- 严禁删除任何 buildXXX 子函数

### §8.5 #homepage-market-temperature

旧:动态卡
新:大数字 + 温度文字(`极度过热 / 显著偏热 / 中性区间 / 显著偏冷 / 极度偏冷`)+ 7 周 sparkline + NDX/IXIC 广度对照
保留所有现有 checker 要求文本(`等待历史周线数据接入` / `本数据为统计描述,不构成投资建议。` / `60 周均值` / `z-score`)

### §8.6 #homepage-risk-engines

旧:6 张展开卡
新:`.mini-grid` 6 张 mini card

**Codex 第三轮修正**:`buildRiskEngines` 当前 256 行,**多源派生**(不只是 `data.modules`):
- `data.modules` 6 引擎得 RED/YELLOW/GREEN
- 加 `divergenceLayer` / `privateCreditProxy` / `worldOrderStress` / `marketTemperature` 作为辅助判读
- 改写时保留所有多源派生逻辑,只换外壳为 mini-card

### §8.7 #homepage-cross-validation

旧:文本列表
新:一致性条(`<div class="consistency-bar"><div class="fill" style="width:${score}%"></div></div>`)+ 一致性数字 + 支持/反向/缺失分类列表
数据来自 `buildCrossValidationMatrix(data)` 返回的 `{narratives, consistencyScore, oneLineSummary}`

### §8.8 #wow-key-changes

旧:展开式
新:`.wow-section` 深墨反白板 + `.wow-grid` + `.wow-item` 含 `.wow-tag.is-up/is-down/is-flat`
数据来自 `buildKeyChanges(data)` 返回的 6-8 条 WoW item

---

## §9 验收清单(PR 2 合并条件)

### §9.6 PR 1 专属验收(v2.2 新增)

PR 1 范围:契约 + DESIGN.md + 2 个 IA checker + index.html nav + 空 section 容器。

**必须全绿的检查**:
```
npm run check:all
npm run check:homepage-ia-contract
npm run check:editorial-redesign-contract
npm run check:plain-summary-card-contract
```

**PR 1 视觉验收**:
- jump nav 显示 15 项,新增"宏观主题卡阵"位于第 9 位
- 首页中段(#macro-risk-overview 之后、#global-risk-heatmap 之前)出现绿色色带的空 section
- 该 section header 显示"MACRO THEMATIC CARDS · 宏观主题卡阵 / 8 读者类别 红黄绿指标卡 / 本 section 容器骨架由 M-94 PR 1 落地,内容由 PR 2 通过 renderThematicCards.js 填充"
- section body 为空(<div id="macro-thematic-cards-root"> 不含任何子元素)
- 其他所有 section 视觉**完全不变**(因为没动 styles.css / renderMacroOverview.js / index.html `<head><style>`)

**PR 1 不验收的事**(留 PR 2):
- 8 个 runtime block 视觉是否升级 Bubble Watch 风格 → PR 2
- 38 张主题卡是否填充 → PR 2
- styles.css 是否补充 .reader-cat-block 等 selector → PR 2
- cache version 是否 bump → PR 2

**PR 1 边界验收**:
- `git diff --name-only main..m94-v0-contract` 必须只含:
  ```
  docs/M94_V0_DATA_CONTRACT.md
  manual-artifacts/m94-v0/m94-v0-FINAL-mock.html
  .gitignore
  DESIGN.md
  scripts/check-homepage-ia-contract.mjs
  scripts/check-editorial-redesign-contract.mjs
  index.html
  ```
- 不能出现任何 `scripts/modules/*` / `assets/styles.css` / `data/*` / `workers/*` / `.github/workflows/*` 改动

**PR 1 PR 描述必须声明**:
- "本 PR 实施 M-94 V0 PR 1:契约 + DESIGN.md + IA checker + index.html nav 与空 section 容器骨架"
- "本 PR 不动任何 render logic,所有 render 改动留 PR 2"
- "字面量同步:DESIGN.md 内 X 处'14 项→15 项',checker 内 Y 处'14-step/item→15-step/item'"
- "`npm run check:all` 通过(贴截图或日志片段)"

### §9.1-§9.5 PR 2 验收清单(沿用 v2.1)

### §9.1 必须全绿的检查(PR 2 合并)

```
npm run check:all
npm run check:homepage-ia-contract
npm run check:editorial-redesign-contract
npm run check:plain-summary-card-contract
npm run check:thematic-cards-contract        ← 新增
npm run check:market-pricing-temperature-display-activated
npm run check:editorial-redesign-contract
```

### §9.2 视觉验收

- jump nav 15 项,新增"宏观主题卡阵"位于第 9 位
- `#macro-thematic-cards` 出现在 `#wow-key-changes` 之后、`#global-risk-heatmap` 之前
- 8 个主题块全部存在,顺序与 §3 一致
- 中国宏观 block 7 张 P1 占位卡平铺
- 所有 `<style>` 内联色值改用 `var(--paper-*) / var(--risk-*)` token
- 所有字体声明使用 `var(--font-*)` 变量,不写字面量
- 8 个 runtime block 视觉已升级为 Bubble Watch 风格(对照 §8 检查)
- 卡片密度按 §7.1 三档应用

### §9.3 数据消费验收

- 所有指标数字来自 `__effectiveDisplayInputs` 或明示的派生路径
- 无任何 `data.values.*` 引用
- `dailyBrief.dominantRiskChain.evidence` 进入主路径展示
- `dailyBrief.keyTriggers + invalidationSignals` 进入 watch list / WoW
- External AI gate `qualityReview.promotionEligible === false` 时显示占位

### §9.4 边界验收

- `git diff --name-only -- data .github/workflows` 必须为空
- `git diff --stat scripts/modules/decision.js` 必须为 0
- `git diff --stat scripts/modules/realtime.js` 必须为 0
- `git diff --stat scripts/modules/buildCrossValidationMatrix.js` 必须为 0
- `git diff --stat workers/` 必须为 0
- `package.json` `dependencies` / `devDependencies` 数量不变

### §9.5 PR 描述必须声明

> "本 PR 符合 DESIGN.md 的所有规则(M-94 修订版,§4.1 IA 扩为 15 项)"
> "本 PR 不改 scoring / decision / execution / position / Worker / data pipeline / JSON 生产结构"
> "本 PR 不接入任何新数据源,不启用商业付费数据 / Market Pricing Temperature scoring / External AI scoring"

---

## §10 与契约 v1 / v2 / v2.1 关键差异(供 Robert 一目了然)

| 维度 | v1 | v2 | v2.1 | v2.2 |
|---|---|---|---|---|
| IA 结构 | 8 类读者类别完全替换 14 项 | 14 项 IA 保留 + 新增 1 项 = 15 项 | 同 v2 + checker 字面量同步 | 同 v2.1 + PR 1 容器骨架明确 |
| token | 拟新建 `--gfrr-*` | 沿用 `--paper-*` | 同 v2 | 同 v2.1 |
| 字体 CDN | 拟禁用 | 保留 Google Fonts 三家族 | 同 v2 | 同 v2.1 |
| MacroRiskOverview | 拟下沉 Appendix | 内核保留视觉重写 | 同 v2 + §8 措辞修正 | 同 v2.1 |
| plainSummaryCard | 拟吸收翻译表 | M-93A0 不动 | 同 v2 | 同 v2.1 |
| 商业付费数据清理 | 第 5 章占大篇幅 | 移出 M-94 | 同 v2 | 同 v2.1 |
| 字段名 | 60% 虚构 | 100% 真实 | **100% Codex 第三轮代码层确认** | 同 v2.1 |
| CrossValidationMatrix | 漏识别 | 主路径 + consistency bar | 同 v2 | 同 v2.1 |
| marketPricingTemperature | 浅识别 | 完整保留 | 同 v2 | 同 v2.1 |
| 24 派生模块 | 漏 10 | 全部纳入 | 同 v2 + CRE 升主路径 | 同 v2.1 |
| 卡片密度 | 全 HIGH | 三档 | 4 档 + HIGHEST 增多 | 同 v2.1 |
| Codex 5 节审核(2 轮) | 未消化 | 100% 消化 | 同 v2 | 同 v2.1 |
| Codex 第三轮 | — | — | **100% 消化** | 同 v2.1 |
| 字段路径错误 | 60% 错 | 9 处需校 | **0 错** | 同 v2.1 |
| §6 待办 | — | 5 TODO | **0 TODO** | 同 v2.1 |
| modules 字段 | — | 误以为有 `.score` | 修正扁平数字 | 同 v2.1 |
| privateCreditProxy z-score | — | 拟新建派生 | 数据不足降级 | 同 v2.1 |
| NDX 卡 | — | NDX vs SPX 30 日差 | NDX 60w z-score | 同 v2.1 |
| 信用类卡数 | — | 4 张 | 5 张(新增 CRE) | 同 v2.1 |
| checker 字面量同步 | — | 未明确 | §2.6 列 6 处 | 同 v2.1 |
| **PR 1 范围** | — | — | 仅契约 + DESIGN.md + checker | **加 index.html nav + 空 section 容器骨架(避免 checker 与 implementation 不同步)** |
| **Codex 第四轮反馈** | — | — | — | **PR 1 范围与 enforcement 不同步问题,选项 A 修正** |

---

## §11 文档历史

| 日期 | 变更 | 触发事件 |
|---|---|---|
| 2026-05-23 | v1 初稿,53KB,80% 字段虚构 | Robert 启动 M-94 |
| 2026-05-24 | v2 重写,基于直接读取项目源码,5 个 TODO | Codex 2 轮审核 + 5 决策点拍板 + Path C+B 混合选择 + Filesystem 直读权限 |
| 2026-05-24 | v2.1 字段精校,0 TODO,5 硬错误修正,17 处字段补充 | Codex 第三轮代码层审核 + Robert 视觉确认 FINAL mock + 3 决策(CRE / NDX z-score / Private Credit 降级) |
| 2026-05-24 | **v2.2 PR 范围修正**:PR 1 加 index.html nav + 空 section 容器骨架(避免 checker enforcement 与 implementation 不同步) | Codex 第四轮 PR 1 实施时识别"先有鸡先有蛋"陷阱并报告;Robert 选项 A 拍板 |

---

**契约 v2.2 结束。**

下一步:
1. Robert 审阅本契约 v2.2(主要看 §0.1 / §2.7 / §4.1 / §4.2 / §9.6 这 5 节是否符合预期)
2. 把 v2.2 替换覆盖仓库中的 `docs/M94_V0_DATA_CONTRACT.md`,push 到 `m94-v0-contract` 分支
3. 让 Codex 基于 v2.2 + FINAL mock + 现有代码,开 PR 1(契约 + DESIGN.md + checker + index.html 容器骨架)
4. Codex 实施 PR 1 通过 `npm run check:all` 后,Claude review 远程 diff
5. Robert 在 GitHub web review 后 merge PR 1
6. 开 PR 2(render logic implementation),严格按 §4.2 改动清单 + §7 卡片密度规范 + §8 8 runtime block 视觉重写要点
7. PR 2 验收按 §9.1-§9.5 清单
