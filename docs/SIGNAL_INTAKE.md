# Signal Intake Framework

## 1. Purpose / 目的

本文件用于规范新宏观指标、新视频观点、新研究报告、新数据源如何进入系统，避免“看到一个新指标就随便加一个模块”。

任何新信号进入系统前，都必须先明确它是什么、来自哪里、能解释什么、不能解释什么，以及是否只适合作为 audit-only / diagnostic-only / display-only 观察信号。

## 2. Signal Classification / 信号分类

每个新信号必须先判断：

- 属于哪个宏观驱动：增长 / 通胀 / 流动性 / 政策 / 地缘 / 金融脆弱性 / 资产定价。
- 是领先指标、同步指标还是滞后指标。
- 是事实数据、市场价格、模型推断、新闻事件还是人工判断。
- 是 primary source、validation source、secondary diagnostic、audit-only，还是 AI commentary only。
- 数据频率：realtime / daily / weekly / monthly / quarterly。
- 是否有稳定、公开、可抓取、可审计的数据源。

分类完成前，不得把新信号接入 scoring、decision、execution、仓位或 Action Queue。

## 3. Promotion Ladder / 晋升阶梯

新信号必须按以下顺序晋升：

- Level 0: Research note only
- Level 1: Manual observation
- Level 2: Audit-only data field
- Level 3: Diagnostic-only display
- Level 4: Cross-validation signal
- Level 5: Scoring candidate
- Level 6: Decision modifier candidate
- Level 7: Full decision integration

明确规则：

- 默认最多到 Level 3 或 Level 4。
- 不得直接跳到 scoring 或 decision。
- 进入 Level 5 以上必须另开版本、另做稳定性观察、另做数据契约。

## 4. Required Signal Registry Fields / 信号登记字段

以下是信号登记字段示例。此示例只用于说明字段，不代表本轮创建 config 文件：

```json
{
  "key": "brentPhysicalPremium",
  "labelZh": "Brent 实物溢价",
  "category": "energy_inflation_chain",
  "macroDriver": "inflation",
  "riskChain": ["energy", "inflation", "rates", "asset_pricing"],
  "frequency": "daily",
  "sourceTier": "audit-only",
  "sourceStatus": "candidate",
  "entersScoring": false,
  "entersDecision": false,
  "displayOnly": true,
  "promotionCriteria": "30 days stable observation before scoring review"
}
```

## 5. Example Candidate Signals / 候选信号示例

以下信号只列出，不在本文件中实现。

### A. Brent futures vs Brent spot / physical proxy spread

- 作用：识别纸面油价与实体油价是否背离。
- 当前级别：Level 2/3 data contract active（v28.0I-5A）。
- 仅为 public proxy observation。
- 不等同于 Platts Dated Brent。
- 不改变 `values.brent`。
- 不进入 scoring、不进入 decision。
- M-71 public proxy source review: EIA Europe Brent Spot Price FOB 是 Level 1/2 source-review candidate,只可作为 public Brent spot proxy comparison;不等同于正式 Dated Brent。

### B. US10Y pressure vs equity pricing

- 作用：识别长端利率压力是否被股市忽略。
- 初始级别：cross-validation / display-only。
- 不改变 `executionLock`。

### C. Michigan Consumer Sentiment vs S&P 500

- 作用：识别消费者体感与资产价格背离。
- 当前级别：Level 2/3 data contract active（v28.0I-4A）。
- 仍为 audit-only / display-only。
- FRED `UMCSENT` 为月频慢变量，不是 realtime 指标。
- 不进入 Worker required fields。
- 不进入 Worker、不进入 scoring、不进入 decision。

### D. Brent term structure

- 作用：识别近端供需是否紧张。
- 初始级别：candidate。
- 需要稳定数据源后再接入。
- M-71 public proxy source review: ICE Brent futures curve / ICE Data Services 是 Level 1/2 source-review candidate。任何 futures curve 接入必须先完成 source-specific proof-of-source design,不得直接进入 `values.brent`、Brent promotion、scoring 或 decision。
- M-74 proof-of-source design: `ice_brent_futures_curve` 仅进入 proof contract,要求至少 front 6 contracts、contractMonth / priceType / observedAt / delayStatus 等字段定义;仍 `sourceApproved=false`、`liveFetchApproved=false`、`brentTermStructureConnected=false`。
- M-75 production proxy display: `brentPricingLayer.termStructureProxy` 使用 Yahoo chart payload 的 Brent futures contract symbols (`BZ*.NYM`) 生成公开延迟期货曲线代理;只能 display-only / audit-only,不得写成 ICE 官方 settlement curve,不得进入 `values.brent`、Brent promotion、scoring 或 decision。

### E. Crack spread / diesel stress

- 作用：识别原油向成品油和运输成本的传导。
- 初始级别：candidate。

### F. Shipping / freight stress

- 作用：识别能源与地缘风险向贸易成本传导。
- 初始级别：candidate。
- M-71 public proxy source review: Baltic Exchange freight benchmarks 与 Freightos Baltic Index 是 Level 1/2 source-review candidate。Baltic / Freightos 只能作为 shipping / freight stress public proxy review,不得写成 Platts Dated Brent、不得推断具体 crude cargo price、不得直接进入 scoring 或 decision。
- M-74 proof-of-source design: `baltic_exchange_freight_benchmarks` 为 licensed freight benchmark proof target, crude review 优先 tanker routes;`freightos_baltic_index` 只能作为 container freight public proxy proof target,不得写成 crude tanker freight。两者仍 `sourceApproved=false`、`liveFetchApproved=false`、`shippingFreightConnected=false`。
- M-75 production proxy display: `brentPricingLayer.shippingFreightProxy` 仅显示 source status;Baltic tanker freight 仍需授权,Freightos FBX 仍只能作为 container freight proxy review,当前不得输出 freight 数值。

### G. Platts Dated Brent / formal Dated Brent

- 作用：正式实物端 Brent benchmark,只能在授权后作为独立 proof / licensed integration track。
- 当前级别：future licensed source only。
- M-71 public proxy source review: S&P / Platts Dated Brent 只登记为 future licensed source,不进入 public proxy implementation。
- M-74 proof-of-source design: `sp_global_platts_dated_brent` 需要 license / redistribution terms / assessment identifier / publication timestamp policy 完整审查;仍 `formalPlattsDatedBrentConnected=false`,不得用 ICE/FRED/Yahoo/EIA/Freightos/Baltic proxy 冒充正式 Dated Brent。
- M-75 production proxy display: `brentPricingLayer.formalDatedBrent` 只显示 licensed path 状态;无授权时必须 `value=null` / `status=license_required`,不得把任何 public proxy 显示为正式 Dated Brent 数值。

## 6. Rejection Rules / 拒绝或暂缓规则

以下情况不得接入：

- 没有稳定数据源。
- 只有视频口述、没有可核验数据。
- 需要付费数据但没有授权。
- 数据定义不清。
- 与现有指标高度重复。
- 容易造成用户误解。
- 会诱导恐慌性表述。
- 会直接影响仓位但没有足够验证。

## 7. AI Interpretation Layer Rules / AI 解释层规则

v28.0J-0 的 AI Interpretation Layer 只建立规则化结构解释 contract，不调用外部 AI API。任何 AI 输出都必须严格区分：

- 已验证事实。
- 数据推断。
- 模型判断。
- 情景假设。
- 数据缺口。
- 反证条件。

未来如接入外部 AI API，必须另开版本，单独评审数据源、提示词、输出审计、禁用文案、成本、隐私和 fallback。不得让 AI 文案越权改变评分、仓位、执行灯、Action Queue、Trigger Monitor 或 Invalidation Rules。

外部 AI 输出属于 high-risk signal source。默认只允许 commentary / display-only，不得跳过 promotion ladder 直接进入 scoring、decision、execution 或 position。

### External AI as high-risk commentary source

DeepSeek / OpenAI / external AI output 必须视为 high-risk commentary source，而不是 primary market data source。未来任何接入必须先阅读 [`EXTERNAL_AI_API_DESIGN.md`](EXTERNAL_AI_API_DESIGN.md)，并通过输出审计后才允许进入可见展示路径。

默认最高晋升层级为 display-only。不得跳过 promotion ladder，不得直接进入 scoring / decision / execution / position。任何输出都必须通过 banned copy、source attribution、事实 / 推断区分、数据缺口、越权决策和站内数据冲突检查。

v28.0K-1 prompt fixtures are Level 1/2 offline design artifacts. They are not live signals, not production data, and not scoring candidates. Any future promotion beyond offline/manual prompt testing must follow the ladder in [`EXTERNAL_AI_API_DESIGN.md`](EXTERNAL_AI_API_DESIGN.md) and pass output audit first.

## 8. Copywriting Rules / 文案规则

所有用户可见文案必须：

- 中文。
- 克制。
- 专业。
- 区分事实、推断、模型判断、情景假设。
- 证据不足时写“数据不足”或“暂不足以判断”。
- 不写“危机已经爆发”“必然崩盘”“战争概率”等煽动性表达。
