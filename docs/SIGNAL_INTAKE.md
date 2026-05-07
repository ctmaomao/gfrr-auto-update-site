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
- 初始级别：audit-only / display-only。
- 不等同于 Platts Dated Brent。
- 不改变 `values.brent`。

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

### E. Crack spread / diesel stress

- 作用：识别原油向成品油和运输成本的传导。
- 初始级别：candidate。

### F. Shipping / freight stress

- 作用：识别能源与地缘风险向贸易成本传导。
- 初始级别：candidate。

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

## 7. Copywriting Rules / 文案规则

所有用户可见文案必须：

- 中文。
- 克制。
- 专业。
- 区分事实、推断、模型判断、情景假设。
- 证据不足时写“数据不足”或“暂不足以判断”。
- 不写“危机已经爆发”“必然崩盘”“战争概率”等煽动性表达。
