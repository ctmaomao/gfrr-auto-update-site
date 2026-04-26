# Global Financial Risk Radar 运行排查手册

本文档用于日常维护排查。遇到页面数据过期、Daily 数据不一致、Brent 主值疑问、Transmission Delta 未显示或 Pages 部署失败时，优先按这里的顺序检查。

## 1. 本地完整检查

提交前优先运行：

```bash
npm run check:all
```

该命令等价于依次执行：

```bash
npm run check:syntax
npm run check:dom
npm run check:modules
node scripts/validate-data.mjs
```

如果输出：

```text
[validate-data] Skipping live realtime/displayInputsBaseline alignment...
Validation passed (v27.0)
```

这是可接受 warning，不是失败。它表示本地 `realtime/market.json` 不是 Daily 实际消费的 realtime 版本，因此跳过本地 realtime 与 baseline 的对齐检查。

## 2. 页面显示“实时数据已过期”

排查顺序：

1. 先看页面“数据健康状态”模块，确认 freshness、数据时效、实时数据来源和状态标记。
2. 打开浏览器 Console。
3. 执行：

```js
window.__GFRR_RUNTIME__?.realtimeFetchAudit
```

按结果判断：

- `selectedSource = remote` 且 `remoteUpdatedAt` 很旧：前端已读到远端 realtime，但远端 payload 旧，优先检查 `Build Realtime Market` workflow 是否按 schedule 跑。
- `selectedSource = local-fallback`：远端 raw 读取失败，页面使用了本地 fallback。
- `selectedSource = none`：远端和本地 fallback 都不可用，页面只能走 baseline / degraded。
- `cacheBusted = true`：前端已经尝试绕过缓存，问题通常不在浏览器缓存。

## 3. Realtime workflow 排查

检查 GitHub Actions 中的：

```text
Build Realtime Market
```

重点看：

- 最近一次是否为 `Scheduled` 或手动触发成功。
- 运行时间是否接近 `7,22,37,52 * * * *`。
- Summary 中的 `updatedAt`。
- Summary 中的 `sourceMode`。
- Summary 中的 `healthScore`。
- Summary 中的 `Brent`。
- Summary 中的 `Brent consensus`。
- Summary 中的 `confidence`。
- Summary 中的 `canPromoteToPrimary`。

如果 workflow 没跑或失败，优先修复 Realtime workflow；不要直接改 JSON 产物来掩盖问题。

## 4. Daily workflow 排查

检查 GitHub Actions 中的：

```text
Build Daily Radar Data
```

重点看 Daily Summary：

- `dailyRealtimeInput.commitSha`
- `dailyRealtimeInput.updatedAt`
- `dailyRealtimeInput.sourceMode`
- `dailyRealtimeInput.healthScore`
- baseline Brent / broad dollar / VIX / HY OAS / SPX
- Decision Summary
- Transmission Delta Summary

`dailyRealtimeInput.commitSha` 用于判断 Daily 当时消费的是哪一次 `realtime-data` payload。如果页面、`main` 数据和 `realtime-data` 暂时不同步，先用这个字段确认 Daily 的输入版本。

## 5. Brent 主值与验证层排查

页面主 Brent 来自：

```text
values.brent / effectiveDisplayInputs
```

`brentValidation.consensus.recommendedValue` 是验证层推荐值，不等于主值。`canPromoteToPrimary=false` 时不得提升为主值。

如果 Stooq / Yahoo / Oilprice 等来源不一致，优先检查：

- `confidence`
- `canPromoteToPrimary`
- `observedAt`
- `staleForConsensus`
- `weak-confirmation`
- `excludedFromConsensus`

常见判断：

- `confidence=none`：验证层没有可用推荐值。
- `weak-confirmation`：只能辅助确认，不能 promote。
- `observedAt-stale(...)`：该来源过旧，不应参与主值提升。

## 6. Transmission Delta 排查

如果页面节点显示：

```text
趋势待累计
```

这表示暂无可比较上一期节点数据，不一定是错误。

如果 Daily Summary 显示：

```text
matched nodes: 6
zero deltas: 6
pending deltas: 0
```

说明 delta 已经正常生成，只是本期节点分数没有变化。

如果 `pending deltas` 很多，依次检查：

- `transmissionDeltaMeta.source`
- `matchedNodes / totalNodes`
- `transmissionChain.nodes[*].delta`
- `data/radar-history-full.json` 最近记录是否有 `transmissionSnapshot`
- `data/radar-history.json` 最近记录是否有 `transmissionSnapshot`

不要为了让页面显示 `Δ` 而手写 JSON；应让 Daily pipeline 自然生成节点级 delta。

## 7. Pages 部署失败排查

`Deploy Static Site to Pages` 在上传 artifact 和部署前会自动运行：

```bash
npm run check:syntax
npm run check:dom
npm run check:modules
node scripts/validate-data.mjs
```

失败时按类型排查：

- `check:syntax` 失败：查看具体 JS / MJS 文件语法错误。
- `check:dom` 失败：检查 `index.html` 是否误删关键 DOM id。
- `check:modules` 失败：检查模块 import / export，尤其是 `render.js` re-export 和 `scripts/modules/*`。
- `validate-data.mjs` 失败：检查 `data/radar-data.json`、`realtime/market.json`、Brent validation、decision contract、transmission delta contract 等数据契约。

`validate-data.mjs` 的 warning 不等于失败；只有 exit code 非 0 才会阻止部署。Pages deploy 是分步骤运行上述检查，不运行 `check:all`。

## 8. 不要做的修复

- 不要为了让 validate 通过而削弱校验规则。
- 不要把 `brentValidation.consensus.recommendedValue` 直接改成 Brent 主值。
- 不要放松 local fallback 安全闸门。
- 不要绕过 `effectiveDisplayInputs` 直接用 raw realtime values。
- 不要在 render 层重新推导 `executionLock` / `positionGuidance`。
- 不要把 JSON 产物作为临时修复随意提交。
- 不要用 UI 文案反向修改数据契约或评分逻辑。
