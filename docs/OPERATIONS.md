# Global Financial Risk Radar 运行排查手册

本文档用于日常维护排查。遇到页面数据过期、Daily 数据不一致、Brent 主值疑问、Transmission Delta 未显示或 Pages 部署失败时，优先按这里的顺序检查。

相关文档：

- [v27 稳定化基线](V27_BASELINE.md)：用于确认当前 v27.x 已完成升级、维护边界、保护网和下一阶段建议。

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
npm run check:copy
npm run check:workflows
npm run check:docs
npm run check:data
```

`check:data` 等价于 `node scripts/validate-data.mjs`。

`check:copy` 检查用户可见文案契约，防止“广义美元指数 / 亿美元 / 传导网络 Δ”等已修复文案回退。

`check:workflows` 检查 GitHub Actions workflow 合约，防止 Realtime / Daily / Pages 部署中的关键调度、Summary、校验和部署步骤被误删。

`check:docs` 检查 README.md、AGENTS.md 和 docs/*.md 中的本地 Markdown 链接是否指向不存在的文件；http / https / mailto / 纯锚点链接会跳过。

`check:syntax` 和 `check:modules` 均为自动发现模式；新增 `scripts/` 文件或 `scripts/modules/` 模块后，通常会自动纳入检查。

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
- 运行时间是否接近 `7,17,27,37,47,57 * * * *`。
- Summary 中的 `updatedAt`。
- Summary 中的 `sourceMode`。
- Summary 中的 `healthScore`。
- Summary 中的 `Brent`。
- Summary 中的 `Brent consensus`。
- Summary 中的 `confidence`。
- Summary 中的 `canPromoteToPrimary`。

如果 workflow 没跑或失败，优先修复 Realtime workflow；不要直接改 JSON 产物来掩盖问题。

## 4. Realtime Health Watchdog 排查

Realtime Health Watchdog 是只读诊断工具，只检查 `realtime-data/realtime/market.json` 的 freshness，不生成数据、不修复数据、不参与评分。

本地手动检查：

```bash
node scripts/check-realtime-health.mjs --soft
```

GitHub Actions watchdog 使用：

```bash
node scripts/check-realtime-health.mjs --fail-on-stale
```

如果结果是 `stale` 或 `unavailable`，优先检查：

- `Build Realtime Market` workflow 最近运行结果。
- `realtime-data` 分支的 `realtime/market.json` `updatedAt`。
- GitHub Actions schedule 是否延迟或未触发。
- workflow 权限是否异常。

### Realtime stale recovery

`Build Realtime Market` remains the primary realtime generation workflow. `Recover Stale Realtime Market` is a recovery workflow that first runs `check-realtime-health`; when realtime is fresh or aging, it skips generation, and when realtime is stale or unavailable, it runs `build:realtime` and pushes only `realtime/market.json` to the `realtime-data` branch. It does not change Brent primary value logic, scoring, decision output, or write to `main`.

## 5. Daily workflow 排查

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

### Daily Realtime Input Audit

`Build Daily Radar Data` 在运行 `run-daily-pipeline.mjs` 读取 `origin/realtime-data:realtime/market.json` 后，会在日志与 GitHub Step Summary 中输出 **Daily Realtime Input Audit**（控制台前缀 `[Daily Realtime Audit]`，Summary 小节标题 `Daily Realtime Input Audit`）。用于确认本次 Daily 实际读到的 `updatedAt`、`ageMinutes`、按与站点一致的窗口划分的 `freshness`（fresh / aging / stale / unavailable）、`sourceMode`、`healthScore`、以及 `values.brent` 与 `brentValidation.consensus` 的推荐值 / `canPromoteToPrimary` / `confidence`。

当审计显示 **stale** 或 **unavailable**（`result: WARNING`）时，只表示输入快照偏旧或无法判定时效，**不会**中断 Daily 构建。排查宜优先：

- `Build Realtime Market` 最近是否成功、是否按时写入 `realtime-data`。
- `realtime/market.json` 的 `updatedAt` 是否持续更新。
- `Check Realtime Health` 是否连续失败。
- 上游行情源是否异常。

该审计仅用于诊断与可观测性，**不改变** scoring、decision、Brent 主值生成或任何 fallback 行为；主 Brent 仍以管线内的 `values.brent` 为准，推荐值不等于主值。

Daily 与前端共用 **`canUseRealtimePayloadValues`**（见 `docs/DATA_CONTRACT.md`）。若审计或 payload 显示 **cache-only**、**unavailable**、**healthScore 归零**、**criticalMissing 过高**，或 **degradedMode** 且非 **live-with-fallback**，则 Daily 应走现有 **buildFallback**，不得用该 realtime 重算 baseline；前端亦不应进入实时 overlay，而应呈现基线 / fallback 状态。此时优先核对 `sourceMode`、`cacheOnly`、`healthScore`、`criticalMissing`，并查看 **Check Realtime Health** 与 **Build Realtime Market** 是否异常。

## 6. Brent 主值与验证层排查

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

## 7. Transmission Delta 排查

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

## 8. Pages 部署失败排查

`Deploy Static Site to Pages` 在上传 artifact 和部署前会自动运行：

```bash
npm run check:syntax
npm run check:dom
npm run check:modules
npm run check:copy
npm run check:workflows
npm run check:docs
npm run check:data
```

失败时按类型排查：

- `check:syntax` 失败：查看具体 JS / MJS 文件语法错误。
- `check:dom` 失败：检查 `index.html` 是否误删关键 DOM id。
- `check:modules` 失败：检查模块 import / export，尤其是 `render.js` re-export 和 `scripts/modules/*`。
- `Check user-facing copy contract / check:copy` 失败：检查用户可见文案是否回退，例如“广义美元指数”被写成“广义美元 / 美元指数”，“亿美元”被写成“十亿美元”，或传导网络 delta 被写回“Δ --”。
- `Check workflow contract / check:workflows` 失败：检查 GitHub Actions workflow 是否误删关键保护项，例如 Realtime 每小时 6 次错峰调度、Daily 消费 origin/realtime-data、Daily / Decision / Transmission Summary、Pages 部署前检查链路、upload-pages-artifact / deploy-pages 步骤。
- `Check documentation links / check:docs` 失败：检查 README.md、AGENTS.md 和 docs/*.md 中的本地 Markdown 链接是否指向不存在的文件；http / https / mailto / 纯锚点链接会跳过。
- `Validate data contract / check:data` 失败：检查 `data/radar-data.json`、`realtime/market.json`、Brent validation、decision contract、transmission delta contract 等数据契约，并查看 `validate-data.mjs` 的输出信息。

`check:syntax` 会自动扫描 `scripts/` 下的 `.js` / `.mjs`；`check:modules` 会自动扫描 `scripts/modules/*.js`。

GitHub Actions workflow baseline 使用 Node 24-compatible official actions：`actions/checkout@v6` 和 `actions/setup-node@v6`；`setup-node` 使用 `node-version: 24`。不要用 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 或 `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` 作为 workaround。

`validate-data.mjs` 的 warning 不等于失败；只有 exit code 非 0 才会阻止部署。Pages deploy 是分步骤运行上述检查，不运行 `check:all`。

## 9. Cloudflare Worker realtime backend 规划

- 当前 **v27.1.x** 仍以 **GitHub Actions + realtime-data** 为生产 realtime 链路。
- **v28** 计划引入 **Cloudflare Workers + KV**：Worker Cron 目标每 **3** 分钟；KV 中 latest market 的 `cacheTtl` 目标 **30** 秒。
- 前端（未来）读取顺序规划：
  1. Cloudflare Worker API（`/market.json`）
  2. GitHub realtime-data fallback
  3. local fallback
- 仓库内 `workers/gfrr-realtime-worker/` 当前为 **脚手架**，**不参与生产**；部署与回滚以 Wrangler 与 Cloudflare 控制台为准，不改变现有 Pages 与 workflow 契约，除非后续版本明确切换读取源。

## 10. 不要做的修复

- 不要为了让 validate 通过而削弱校验规则。
- 不要把 `brentValidation.consensus.recommendedValue` 直接改成 Brent 主值。
- 不要放松 local fallback 安全闸门。
- 不要绕过 `effectiveDisplayInputs` 直接用 raw realtime values。
- 不要在 render 层重新推导 `executionLock` / `positionGuidance`。
- 不要把 JSON 产物作为临时修复随意提交。
- 不要用 UI 文案反向修改数据契约或评分逻辑。
