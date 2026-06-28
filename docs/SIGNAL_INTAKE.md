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

### E. Crack spread / diesel stress

- 作用：识别原油向成品油和运输成本的传导。
- 初始级别：candidate。

### F. Shipping / freight stress

- 作用：识别能源与地缘风险向贸易成本传导。
- 初始级别：candidate。
- M-71 public proxy source review: Baltic Exchange freight benchmarks 与 Freightos Baltic Index 是 Level 1/2 source-review candidate。Baltic / Freightos 只能作为 shipping / freight stress public proxy review,不得写成 Platts Dated Brent、不得推断具体 crude cargo price、不得直接进入 scoring 或 decision。
- Route-level tanker freight confirmation source review: TD3C / TD8 / TC5 / TD15 / TD20 / TD22 / TD25 等路线级油轮运费只作为未来 `transportShockCandidate` 的确认层候选;当前 source-review only,不 live fetch,不写 production data,不改变 ODP `finalBias`、Brent promotion、scoring 或 decision。
- Route-level tanker freight proof-of-source design: 只允许 dry-run-only manual artifact scaffold;仍不得 live fetch、不得自动抓 Baltic/ICE/CME/vendor 页面、不得把 routeFreightConfirmation 从 `not_connected` 改成确认。
- Route-level tanker freight manual artifact scaffold: `review:route-level-tanker-freight-manual-artifact` 只做 local/manual dry-run review,输出 ignored manual artifact,不读 key、不联网、不写 production data、不保存 raw source text、不进入 route confirmation 或主判断打分。
- Route-level tanker freight manual sample collection/review: `review:route-level-tanker-freight-manual-samples` 只聚合多份 proof-review artifacts 的样本数、bucket coverage 与 repeated route observations;仍不读 key、不联网、不写 production data、不进入 route confirmation 或主判断打分。
- Route-level tanker freight display-only candidate contract: `route-level-tanker-freight-display-contract-v1` 只定义未来展示候选层形状,状态为 `contract_only_no_production_write`;不写 production data、不接 frontend/workflow/Worker、不改变 `routeFreightConfirmation=not_connected`,更不进入 ODP finalBias 或主判断打分。

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
