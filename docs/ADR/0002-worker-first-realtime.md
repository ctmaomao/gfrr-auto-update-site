# ADR-0002 — Worker-first realtime as main runtime path

**Status**: Accepted (v28.0B+)

## Context

v27 时代 realtime 来自 GitHub Actions 调度的 `build-realtime-market.yml`
写入 `realtime-data` 分支的 `realtime/market.json`。问题:

- GitHub Actions 调度最快 5 分钟,实际抖动到 15-30 分钟
- realtime-data 分支 commit 历史快速膨胀
- 用户感知 "实时" 但实际是延迟 6-15 分钟的快照

迁移到 Cloudflare Workers + KV 可以做到 3 分钟刷新,且不污染 git 历史。
但 Worker 也不可靠 (timeout / quota / 上游 source fail),不能完全替代 GitHub
Actions 兜底。

## Decision

采用 **Worker-first 主链路 + GitHub Actions 兜底** 的混合架构:

1. **Worker** 写 `market:worker-generated-preview` (KV),通过
   `/market.worker-preview.json` 暴露
2. **前端 strict gate** 校验 worker preview 的新鲜度、关键字段完整性;通过
   则用作 realtime overlay
3. **不通过** 则回退到 GitHub `realtime-data` 分支的 `realtime/market.json`
4. **Daily pipeline** 仍消费 `origin/realtime-data:realtime/market.json`
   作为 baseline (不切到 Worker endpoint,见 ADR-0007)
5. **Worker free-tier safe**:每轮 scheduled 最多 1 次 KV 写;GitHub mirror
   preview 与 worker generated preview 交替写

## Consequences

- ✅ 前端体感刷新 ~3 分钟 (Worker scheduled)
- ✅ Worker 失败时无缝回退 GitHub 兜底
- ✅ KV writes 受 free-tier 800/day 保护
- ❌ 两套 fetcher 逻辑 (Worker + GitHub Actions) 需要保持语义一致;`check-worker-health` 守护
- ❌ Daily vs Worker drift 永远存在,只能 audit-only 观察,不能 cross-input

⚠️ **NEVER** 把 Daily pipeline 的主输入从 `realtime-data` 切到 Worker
endpoint (违反会破坏 Daily 与 realtime 的 baseline-vs-overlay 关系);
任何切换需另开 ADR。

## 2026-06-26 Amendment: frontend strict gate superseded by ADR-0018

Decision point 2 described the pre-M-94 frontend behavior. M-94 V0 Path C
changed the current homepage frontend into a static Daily snapshot reader:
the homepage now reads `data/radar-data.json` and does not import or run the
old frontend worker strict gate. The retained `scripts/modules/realtime.js`
module is intentionally frozen and unconnected.

Worker-generated `/market.worker-preview.json` remains the main Worker
realtime preview endpoint for Worker health and diagnostics. Daily pipeline
input still remains GitHub `realtime-data`, as stated above.

The current frontend runtime decision is recorded in
[ADR-0018](0018-m94-path-c-static-frontend-runtime.md).
