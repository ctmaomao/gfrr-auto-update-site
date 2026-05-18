# ADR-0004 — World Order is regime overlay, not 7th risk module

**Status**: Accepted (v28.0H+)

## Context

项目核心是 6 大底层风险模块 (B1-B6: 增长 / 通胀 / 政策 / 信用 / 估值 / 地缘)。
World Order Stress Overlay 在 H-1 引入后,自然产生一个问题:它是不是第 7 个
底层风险模块?

如果作为 7th module:
- 进入 scoring 加权,影响 decisionModel / executionLock / positionGuidance
- World Order 数据源 (GDELT/OFAC/SIPRI/ACLED) 不确定性高,会让决策可靠性下降
- 用户可见文案要求 "战争概率" 之类的预测式输出,违反项目克制原则

## Decision

**World Order 是 regime overlay / 结构性状态修正器**,定位明确为:

1. 独立观察层,不进入 6 大风险模块的 scoring
2. 不影响 `decisionModel` / `executionLock` / `positionGuidance` / Action Queue /
   Trigger Monitor / Invalidation Rules
3. 通过 `decisionModifier.riskBias` 仅做 advisory bias,而非 hard override
4. 前端独立 section,不与 6 大模块并列展示
5. 用户可见文案克制:不预测战争,不输出战争概率,不把结构性压力写成确定性事件

外部源失败时:降级 status / confidence,**不得清空旧可用缓存**,GDELT
partial/stale/error 必须可解释,不得伪装成功或输出 NaN/undefined。

## Consequences

- ✅ 风险模型可解释性保持稳定 (6 模块加权清晰)
- ✅ World Order 数据源失败不阻断主决策
- ✅ 文案克制保护项目 credibility
- ❌ 不能直接说 "World Order 提示买/卖";只能说 "regime 是 X 状态"
- ❌ 不能把 SIPRI 等结构性指标作为短线 trigger

⚠️ **NEVER** 把 World Order 改成第 7 个底层风险模块。
⚠️ **NEVER** 让 World Order 输出战争概率或煽动性结论。
⚠️ **NEVER** 把新的 World Order 外部源直接接入 scoring,必须先 diagnosis →
source review → 另开版本接入。
