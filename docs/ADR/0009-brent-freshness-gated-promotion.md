# ADR-0009 — Brent promotion is freshness-gated (FRED anchor + Yahoo + TE)

**Status**: Accepted (v28.0G-4C, refined from v28.0D-5)

## Context

Brent 是核心 driver,影响 brentPricingLayer / energy_shock cross-validation /
overheat narrative。但 Brent 公开数据源各有缺陷:

- **FRED `DCOILBRENTEU`**: 权威但 EOD 延迟,周末/节假日明显 stale
- **Yahoo `BZ=F`**: 实时但非官方,数据偶有跳变
- **Stooq**: CSV,延迟与新鲜度都不稳定
- **Trading Economics**: 实时但是 scraped page,observedAt 容易解析失败
- **Google Finance**: 历史观察值不可靠

单一源都会在某些时段出错;naive 平均会让坏数据污染主值。

## Decision

采用 **freshness-gated promotion**:

1. **Anchor**: FRED `DCOILBRENTEU` 始终是 Brent 主值 (`values.brent`) 的默认源
2. **Promotion 条件** (全部满足才允许用 Yahoo / TE 修正 anchor):
   - FRED 标记为 stale
   - Yahoo `BZ=F` fresh (< 阈值)
   - Trading Economics observedAt fresh (< 48h) 且与 Yahoo 接近
   - Google Finance 返回 0 / Stooq 失败 时被排除
3. **D-6 extreme-move guard**: 相对上一轮 accepted Brent 的:
   - 2-3% 跳动 → watch (允许)
   - \> 3% 且 Yahoo + TE 高度一致 → confirmed extreme move (允许)
   - \> 3% 且不一致 → hold 到上一轮 accepted Brent / FRED
4. **G-4C hard gate**: TE observedAt 不可解析或 > 48h 会 hold promotion,
   但 observedAt failure does NOT make candidate `ok: false`;hard hold 只在
   promotion decision 层处理

## Consequences

- ✅ 周末 FRED stale 时,Yahoo + TE 双重确认才允许修正,降低单点失败
- ✅ 极端 move 时 guard 阻止数据跳变污染主值
- ✅ 失败可解释:`promotionAudit.promotionReason` 字段记录每轮决策原因
- ❌ Promotion 逻辑复杂,需要 `check-brent-promotion-audit-fields` 守护
- ❌ Stooq / Google Finance 永远不能成为 Brent 主源

⚠️ **NEVER** 把 `brentValidation.consensus.recommendedValue` 直接改成 Brent 主值
(必须经 promotion gate)。
⚠️ **NEVER** 让 Google Finance / Stooq sourceProbe 进入 Brent consensus / promotion
(只是 D-8B-lite sourceProbe)。

## Amendment — 2026-05-20 (`6fa4f7d`)

**Invariant: oilprice weak-confirmation 通道在 primary pair 已稳健时整体跳过。**

`scripts/run-realtime.mjs::applyOilpriceWeakConfirmation` 中新增早退条件：

```js
if (strongHighQualityCandidates.length >= 2) return annotatedCandidates;
```

其中 `strongHighQualityCandidates` 定义为：`participatesInConsensus=true` && `quality='high'` && `source≠yahoo` && `source≠oilprice`。

**背景**: oilprice 数据通常没有 `observedAt` 时间戳，按正常路径会因 `observedAt-missing` 被排除出 consensus。`applyOilpriceWeakConfirmation` 是专为 oilprice 设计的豁免通道——当其他高质量源仅有 1 个（即无法独立形成 primary pair）时，允许 oilprice 以 `consensusRole='weak-confirmation'` 补位参与。

**问题**: 当 FRED + 另一强源已构成稳健 primary pair（strongHighQualityCandidates ≥ 2），继续执行 weak-confirmation 逻辑会让 oilprice 有机会被提升为额外 consensus 参与者，影响 consensus 值计算，且无法通过 freshness gate 的正常语义来解释。

**修复**: primary pair 已存在时整体跳过 weak-confirmation 通道，oilprice 保持 `excludedFromConsensus: 'observedAt-missing'` 不变。weak-confirmation 豁免只在"primary 候选不足"时激活，符合该机制的原始设计意图。

⚠️ **NEVER** 在 `strongHighQualityCandidates.length >= 2` 的前提下，仍让 oilprice 以 weak-confirmation 身份进入 Brent consensus 计算。

## References

- `docs/BRENT_PROMOTION_AUDIT_M39.md`
- `docs/DATA_CONTRACT.md` Brent validation 段
- `scripts/check-brent-promotion-audit-fields.mjs`
- Workers `worker-market-preview.js` Brent promotion logic
