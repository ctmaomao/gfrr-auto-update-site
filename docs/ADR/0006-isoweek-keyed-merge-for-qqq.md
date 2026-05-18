# ADR-0006 — QQQ weekly history uses isoWeek-keyed merge

**Status**: Accepted (M-62, 2026-05-18)

## Context

M-24 first real record write 最初的设计是 **integral replace**:每次手动周
度刷新会用 sanitizer 输出整个 `market-pricing-history.json`,覆盖旧文件。

问题:每周操作员只刷新最近 N 周的 sanitized batch (通常 8-12 周),不是完整
历史。integral replace 意味着每次刷新都会**截短历史**,无法逐周延长。
M-26 metrics calculation 也因此被锁定在固定 record count。

## Decision

把 M-24 history writer 从 integral replace 改为 **`isoWeek`-keyed merge**:

1. 每条 record 用 ISO week (`YYYY-Www`) 作为唯一 key
2. 新 batch 中已存在 key 的 record 更新对应字段;新 key 追加
3. 排序按 `isoWeek` 升序
4. 新增 sanity checks:
   - **incoming vs merged count split**: 区分新加入 vs 更新
   - **cross-seam monotonicity**: 跨 batch 接缝处 isoWeek 必须递增
   - **merged-count floor**: 合并后总数不得 < 合并前
   - report 增加 `added` / `updated` / `merged` 三字段
5. 旧 M-26 metrics、frontend、workers、scoring、decision、execution、position
   全部不变;仅替换 writer 函数

## Consequences

- ✅ 历史可逐周延长,operator 工作流不变
- ✅ 同一周的 record 重刷会更新而非追加,避免重复
- ✅ Cross-seam monotonicity check 守护 isoWeek 顺序
- ❌ 跨年 isoWeek (W52 / W53 / W01) 边界需要特殊关注;`scripts/check-market-pricing-first-real-record-write-scaffold.mjs` 包含 cross-seam 检查
- ❌ 任何把 M-24 改回 integral replace 的尝试都需要另开 ADR

## References

- README 末尾 M-62 段
- `scripts/market-pricing/first-real-record-write-scaffold.mjs`
- `scripts/check-market-pricing-first-real-record-write-scaffold.mjs`
- M-28 z-score check decoupling (PR #226) 配合本决策,把 cross-validation matrix
  check 与硬编码 z-score 解耦
