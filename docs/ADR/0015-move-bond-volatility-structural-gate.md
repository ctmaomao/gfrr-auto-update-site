# ADR-0015 — MOVE (债券/利率波动率) 经结构门控接入,非第七风险模块

**Status**: Accepted (2026-06-01)

## Context

数据广度审计发现:喂"今日总判断"的 6 大底层风险模块(代码实际为
geopolitical / energy / inflation / liquidity / debt / banking)+ 结构门控,
已覆盖股市尾部波动(VIX)、信用利差(HY/IG OAS)、利率曲线(T10Y2Y)、
Fed 流动性(WALCL/ON RRP)、汇率、油价等,但**完全没有债券/利率市场波动率**
这一独立应激通道 —— 即"利率市场失灵"(2022 英国 gilt 危机、2023 SVB
国债波动),VIX(股)和 OAS(信用)都可能滞后。MOVE 指数正是该通道的标准度量。

owner 同意补 MOVE。问题:它应作为第 7 个底层模块?进 6 模块加权 score?
还是别的方式?这是动**受保护的打分核心**,须保守 + 可回测 + 评审。

经 Claude 提案 → Codex 对抗复核(交叉证伪)→ Claude 代码验证收敛。关键验证:
- `structuralScoreBump` 仅写入 `decisionModel` 展示,**`lockEngine` 不消费**——
  现有 5 个结构信号的"score 加分"是装饰性的,真正翻灯靠 `evaluateStructuralGating`
  的 `structuralRed/Yellow` 门控。故 MOVE 的实效完全在门控阈值,而非加分。
- 校准:红线初拟 180 会漏掉 2020(~164)/2022(~160)级危机;Codex 修正为
  **160**(>2 年峰值 ~140,仅真危机触发),黄线 140(近两年实测峰值)。

## Decision

**MOVE 经结构门控接入,定位为第 4 个"结构性评分例外"macroDriver
(继 `onRrp` / `t10y2y` / `igOas` 之后),不是第七个底层风险模块。**

1. 源:`macroDrivers.rateVol`,Yahoo 日频 `^MOVE`;合理性闸门 `[20,400]` +
   `instrumentType==='INDEX'` + ≤5 自然日新鲜;取数失败仅在上一轮值仍 fresh 时
   carry last-good,否则 fail-closed(`move=null` 不触发)并写明 stale。
2. 机制:新增结构信号 `moveVolStress`。MOVE ≥140 应激 → `structuralYellow`;
   ≥160 危机 → `structuralRed`(经 `evaluateStructuralGating` 翻黄/红)。平静(<140)
   零影响。**不进 6 模块公式、不改 `moduleWeights`、不写入 `values.*`。**
3. `structuralScoreBump.moveVolStress=8` 仅 `decisionModel` 展示(`lockEngine` 不消费);
   `positionGuidanceShifts.moveVolStress=-5`,叠加受新增 `positionGuidanceShiftFloor=-15`
   总下限保护。无 base `executionLock` 阈值(避免 base+structural 双入口)。
4. 影响分析:对全部历史/当前决策零扰动(MOVE 现~70 平静;且现有 39 天历史本已因
   ON RRP 结构红全红)。MOVE 是对"利率危机孤立爆发(信用/油/RRP 均平静)"这一
   当前盲区的前瞻保险。

**澄清(纠正可能的框架漂移)**:macroDrivers 总体为 display-only,但其**结构子集**
(`fedLiquidity.onRrp` / `curve.t10y2y` / `credit.igOas` / 本 ADR 的 `rateVol.move`)
经结构门控影响 `executionLock` / `positionGuidance`。受保护的"加权打分核心"是
**6 模块 score + `values.*`**;这些结构信号是 score 之外、经门控的"评分例外",
与 ADR-0003(secondary 不进 scoring)、ADR-0004(World Order 是 overlay)并行不悖。

## Consequences

- ✅ 补上唯一缺失的"利率市场失灵"应激通道,且不扰动既有校准模型。
- ✅ 零回测负担于 6 模块权重(未改);MOVE 只加一个结构门控分支。
- ✅ fail-closed-with-visibility:坏值/超龄不误翻灯,但 stale 可见。
- ❌ 不能说"MOVE 提示买/卖";只能在 ≥140/≥160 时翻黄/红并解释"利率市场应激/危机"。
- ❌ MOVE 平静(<140)时对决策无任何影响(设计如此,非 bug)。

⚠️ **NEVER** 把 MOVE 改成第 7 个底层风险模块,或塞进 6 模块加权 `score`。
⚠️ **NEVER** 给 MOVE 加 base `executionLock` 阈值制造第二套灯。
⚠️ **NEVER** 让陈旧/越界的 MOVE 值触发门控(必须 fail-closed)。
