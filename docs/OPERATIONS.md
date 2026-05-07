# Global Financial Risk Radar 运行排查手册

本文档用于日常维护排查。遇到页面数据过期、Daily 数据不一致、Brent 主值疑问、Transmission Delta 未显示或 Pages 部署失败时，优先按这里的顺序检查。

相关文档：

- [v27 稳定化基线](V27_BASELINE.md)：用于确认当前 v27.x 已完成升级、维护边界、保护网和下一阶段建议。
- [External AI API Design](EXTERNAL_AI_API_DESIGN.md)：用于未来 DeepSeek / OpenAI / external AI API 接入前的设计、输出审计和 fallback 边界。
- [External AI Prompt Contract](EXTERNAL_AI_PROMPT_CONTRACT.md)：用于未来 offline/manual prompt tests 的输入输出契约和非生产样例 fixture 边界。

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

`check:data` 等价于 `node scripts/validate-data.mjs`。v28.0G-10 Data Check Expected-Skip Noise Cleanup 后，默认检查不再为 local realtime / `dailyRealtimeInput` 时间不一致输出 warning；这是 expected skip，因为 Worker-first runtime 已是主链路，本地 realtime 属于 fallback / Daily baseline，可能不是同一快照。

`check:copy` 检查用户可见文案契约，防止“广义美元指数 / 亿美元 / 传导网络 Δ”等已修复文案回退。

`check:workflows` 检查 GitHub Actions workflow 合约，防止 Realtime / Daily / Pages 部署中的关键调度、Summary、校验和部署步骤被误删。

`check:docs` 检查 README.md、AGENTS.md 和 docs/*.md 中的本地 Markdown 链接是否指向不存在的文件；http / https / mailto / 纯锚点链接会跳过。

`check:syntax` 和 `check:modules` 均为自动发现模式；新增 `scripts/` 文件或 `scripts/modules/` 模块后，通常会自动纳入检查。

需要查看跳过原因时运行：

```bash
npm run check:data:verbose
```

需要强制本地 realtime 与 `dailyRealtimeInput` 同快照时运行：

```bash
npm run check:data:strict-live-alignment
```

如果当前本地 `realtime/market.json.updatedAt` 与 `dailyRealtimeInput.updatedAt` 不一致，strict 模式会失败；这不代表默认 `check:data` 失败，也不代表删除了 `validateRealtimeBaselineAlignment`。本轮不改 data/realtime、不改 Worker runtime、不改前端、不 deploy。

## v28.0I Cockpit baseline checks

v28.0I release review 与 v28.0I-8B post-deploy audit 已通过。日常排查 cockpit 解释层时，优先按以下顺序：

1. 先看页面 frontend version 是否为当前版本，当前应为 `28.0J-2`。
2. 检查 live `data/radar-data.json` 是否包含 `dailyBrief`、`divergenceLayer` 与 `brentPricingLayer`。
3. 检查 Worker Health；Check Worker Health 仍是 Worker-first runtime hard gate。
4. 检查 Realtime Health；Check Realtime Health 仍是 GitHub `realtime-data` fallback / Daily baseline soft observer。
5. 若页面显示 Daily Brief / Divergence Layer / Brent Pricing Layer fallback，先判断 Daily workflow 是否已在对应 contract 合并后运行并完成 Pages deploy。
6. 若 Brent Pricing Layer 缺失，不要手工改 `data/*.json`；应触发或等待 Daily workflow 自然生成。
7. 若 `aiInterpretationLayer` 缺失，先确认 Daily workflow 是否已在 v28.0J-0 之后运行；不要手工补 `data/radar-data.json`。
8. 若 World Order warning 仍为 GDELT stale / SIPRI manual_required / ACLED not_configured，属于已知非阻断观察状态。

v28.0I / v28.0J 新增的 `dailyBrief`、`divergenceLayer`、`macroDrivers.consumer`、`consumer_vs_asset_pricing`、`brentPricingLayer` 与 `aiInterpretationLayer` 均为解释层 / 审计层 / 展示层，不改变 `values.*`、`effectiveDisplayInputs`、Brent promotion、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。

## v28.0J AI Interpretation Layer baseline checks

v28.0J-2B post-deploy audit 已通过，当前 AI 解释层为 rule-based structured interpretation，不调用 DeepSeek / OpenAI / 外部 AI API。日常排查顺序：

1. 检查 live frontend version 是否为当前版本，当前应为 `28.0J-2`。
2. 检查 live `data/radar-data.json` 是否包含 `aiInterpretationLayer`。
3. 检查 `aiInterpretationLayer.contractVersion` 是否为 `v28.0J-0`。
4. 检查 `generatedByExternalAi=false` 与 `usesExternalAiApi=false`。
5. 若页面显示 AI fallback，先确认 Daily workflow 是否已在 v28.0J-0 之后运行，并确认 Pages deploy 是否完成。
6. 不要手工补 `data/radar-data.json`。
7. 若未来外部 AI 接入，必须检查 timeout、fallback、source attribution、禁用文案和不影响 scoring / decision 的边界。

## Future External AI operations note

未来如果新增 `externalAiInterpretationLayer`，排查时必须先确认该层是否通过 output audit。若外部 AI output 缺失、timeout、API error、rate limit、invalid JSON、unsafe output 或 stale input，应 fallback 到现有 rule-based `aiInterpretationLayer`。

若 AI output audit 失败，应隐藏 external output，不得手工编辑 `data/radar-data.json` 修复 AI 输出。外部 AI 输出不得影响 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。

v28.0K-1 的 `docs/fixtures/external-ai/*.json` 不影响 live operations。不要通过编辑这些 fixtures 排查或修复生产问题；未来 external AI production issues 必须按 output audit、source attribution 和 fallback rules 排查。

未来排查 external AI output 问题时，先运行：

```bash
npm run check:external-ai-output
```

如果 validation fails，应隐藏 external output 或 fallback 到 rule-based `aiInterpretationLayer`。不要手工编辑 `data/radar-data.json` 修复 external AI output。

v28.0K-3A 后，如果 `externalAiInterpretationLayer.status="disabled"`，这是预期状态，不代表 API failure；含义是当前回退到 rule-based `aiInterpretationLayer`。如果 live data 暂时缺少该字段，等待 v28.0K-3A 合并后的 Daily 自然刷新；只有 realtime health 为 fresh / aging 时才考虑手动触发 Daily。不要手工编辑 `data/radar-data.json` 补该字段。

## v28.0K-3 external AI disabled scaffold checks

日常或 incident 排查顺序：

1. 检查 live data 是否包含 `externalAiInterpretationLayer`。
2. 确认 `contractVersion` 为 `v28.0K-3A`。
3. 确认 `enabled=false` 且 `status=disabled`。
4. 确认 `provider=none` 且 `output=null`。
5. 确认 `externalAiGenerated=false` 且 `usesExternalAiApi=false`。
6. 确认 `fallback.fallbackLayer=aiInterpretationLayer`。
7. 如果本地缺失但 live 已存在，pull latest `main` 或等待 Daily data commit。
8. 不要手工编辑 `data/radar-data.json`。
9. 不要把 disabled scaffold 当成 API failure。
10. 不要在未另开评审版本前把该字段暴露到 frontend。

## Stable Observation Audit

v28.0K-3D adds a read-only stable observation gate for the v28.0K baseline.

Local command:

```bash
npm run audit:stable-observation
```

GitHub Actions workflow:

```text
Stable Observation Audit
```

Status meaning:

- PASS: live frontend, live data, disabled `externalAiInterpretationLayer`, rule-based `aiInterpretationLayer`, Worker Health, realtime-data health, and `check:external-ai-output` are stable enough. v28.0K-4 design planning may be considered.
- WARN: non-blocking observation issue. Review warnings before proceeding to v28.0K-4.
- FAIL: blocking issue. Do not proceed to v28.0K-4 until the issue is fixed.

The workflow is observation-only. It must not auto-fix, auto-open issues, auto-commit, auto-push, deploy Worker, trigger recovery workflows, or hand-edit `data/radar-data.json`. A disabled scaffold is expected and must not be treated as an API failure.

## v28.0K-4A Manual API Test Design

v28.0K-4A is design-only. It documents a future disabled-by-default manual API test process in [`EXTERNAL_AI_MANUAL_TEST_DESIGN.md`](EXTERNAL_AI_MANUAL_TEST_DESIGN.md), but it does not add API code, secrets, provider SDKs, external AI workflows, frontend display, or production data changes.

If future manual API tests exist, they must be explicitly opt-in. A failed manual test is a diagnostic event, not a production incident. Production fallback remains the rule-based `aiInterpretationLayer`, and production `externalAiInterpretationLayer` must remain disabled unless a separate reviewed version changes that boundary.

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

### 2A. Android Chrome 旧前端缓存排查

v28.0J-2 Frontend Asset Cache Busting 处理 Android Chrome cached old module graph：普通窗口可能缓存旧 `scripts/app.js` / ES module graph，导致页面仍显示 Actions/FRED 旧逻辑，例如 Brent 来源停留在 FRED 日度锚点；无痕窗口显示 Worker 独立生成 / 实时数据新鲜 / Yahoo + Trading Economics 双源确认，则说明线上 Worker-first runtime 正常，问题不在 Worker、DNS 或自定义域名。

当前处理方式：

```text
index.html app.js entry → ?v=28.0J-2
scripts/app.js and scripts/modules/*.js local imports → ?v=28.0J-2
window.__GFRR_FRONTEND_VERSION__ → 28.0J-2
```

浏览器 Console 可执行：

```js
window.__GFRR_FRONTEND_VERSION__
```

应返回 `"28.0J-2"`。本轮不改 Worker runtime、不改数据源、不新增 KV、不 deploy Worker。frontend asset cache version must be bumped when index.html or frontend JS changes：以后修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js` 时，必须同步 bump version 并替换所有本地 module import query。只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json` 或只 deploy Worker 不需要 bump；Worker runtime 改动不需要 bump frontend asset version，除非同时改前端 HTML / JS。

v28.0G-9B Frontend Asset Version Bump Helper 提供本地维护命令：

```bash
node scripts/bump-frontend-asset-version.mjs 28.0G-10
npm run bump:frontend-asset-version -- 28.0G-10
```

该工具用于以后前端 HTML / JS 改动时统一 bump cache version。当前正式版本仍是 `28.0J-2`，不要在没有前端发布需要时最终留下测试版本。工具不访问网络、不写 KV、不写 `data/*.json` / `realtime/*.json`、不 deploy Worker。

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

Realtime Health Watchdog 是只读诊断工具，只检查 `realtime-data/realtime/market.json` 的 freshness，不生成数据、不修复数据、不参与评分。v28.0G-2 起，它是 GitHub `realtime-data` fallback / Daily baseline 的 freshness observer，不再作为 Worker-first runtime hard fail gate；主运行链路 hard fail 由 `Check Worker Health` 承担。

v28.0G-3 起，GitHub Actions Summary 顶部会明确显示 `Realtime-data Health`、`Role: soft observer for fallback / Daily baseline`、当前 `Result` 和建议 `Action`。`stale` / `unavailable` 不代表 Worker-first runtime failure；若持续出现，再检查 `Build Realtime Market` 或 `realtime-data` 分支。

本地手动检查：

```bash
node scripts/check-realtime-health.mjs --soft
```

GitHub Actions watchdog 使用：

```bash
node scripts/check-realtime-health.mjs --github-output
```

如果结果是 `stale` 或 `unavailable`，workflow 会输出 warning / `shouldRecover` / `suggestedAction`，但不会 hard fail。优先检查：

- `Build Realtime Market` workflow 最近运行结果。
- `realtime-data` 分支的 `realtime/market.json` `updatedAt`。
- GitHub Actions schedule 是否延迟或未触发。
- workflow 权限是否异常。

如果 `realtime-data` stale 但 `Check Worker Health` overall ok，页面主链路仍健康；若 `Check Worker Health` unhealthy，则优先排查 Worker runtime。

### Realtime stale recovery

`Build Realtime Market` remains the primary realtime generation workflow. `Recover Stale Realtime Market` is a recovery workflow that first runs `check-realtime-health`; when realtime is fresh or aging, it skips generation, and when realtime is stale or unavailable, it runs `build:realtime` and pushes only `realtime/market.json` to the `realtime-data` branch. It does not change Brent primary value logic, scoring, decision output, or write to `main`.

## 4A. Worker-first Health Check 排查

`Check Worker Health` 是 v28.0F-2 新增的只读 Worker-first health workflow。它定时运行：

```bash
node scripts/check-worker-health.mjs --github-summary --fail-on-unhealthy
```

该检查只读取 Cloudflare Worker endpoint，不写 KV，不写 `data/*.json` / `realtime/*.json`，也不改变前端、Daily 或 Worker runtime。

v28.0G-3 起，GitHub Actions Summary 顶部会明确显示 `Worker-first Health Check`、`Role: hard gate for Cloudflare Worker runtime`、`Overall` 和建议 `Action`。只有该检查 unhealthy 才代表主运行链路 hard gate 失败，需要优先排查 Worker runtime。

重点看 GitHub Actions Summary：

- 主 `/market.worker-preview.json`：HTTP status、`updatedAt` / age、`sourceMode`、`healthScore`、`criticalMissing`、`unavailable`、核心 `values.*`、Brent promotion `moveStatus`、sourceProbe 频率 / 数量。
- 主 preview 隔离：不得出现 `secondarySources` / `secondaryDiagnostics` / `secondarySourceSummary`，也不得出现在 `workerGeneratedPreview.diagnostics` 内。
- 独立 `/market.secondary-preview.json`：VIX via Cboe、Gold via Yahoo `GC=F`、DXY via Yahoo `DX-Y.NYB`、US10Y via Yahoo `^TNX` 与 SPX via Yahoo `^GSPC` 是否存在，`participatesInPrimary` / `participatesInValidation` 是否均为 `false`；US10Y 还应显示 `rawValue`、`normalization` 与 `normalizationReason`。`rawValue > 20` 应 `divide-by-10`，`rawValue <= 20` 应 `no-op`。
- core secondary set 为 `vix` / `gold` / `dxy` / `us10y` / `spx`。这些 source 只属于 `/market.secondary-preview.json`，使用独立 KV key `market:secondary-preview`，30 分钟低频刷新，不影响主 `values.*`、scoring、decision、Brent promotion 或 sourceProbe。
- v28.0G-1 起，Summary 还会展示每个 core secondary source 的 `freshnessStatus`、`observedAgeHours` 与 `freshnessReason`。这些是 `check-worker-health` 基于 `observedAt` 的只读派生字段，不是 Worker payload 字段。

判断口径：

- 主 Worker preview 不健康会 fail。
- secondary endpoint HTTP / JSON 不可读会 fail。
- VIX / Gold / DXY / US10Y / SPX 单个 failed / unavailable 只作为 warning；五者都缺失、或任何 secondary source 参与 primary / validation，视为 fail。
- `stale-warning` / `stale-critical` / missing / unparsable freshness 初版只作为 warning，不阻断 workflow；market closed、交易时段和节假日造成的上一交易日 `observedAt` 不应直接视为错误。
- 该 workflow 只用于监控 Worker-first 运行健康，不触发 deploy，不修改数据源。

E-4 后先观察 Worker health workflow 与 secondary freshness，不继续堆新 secondary source。HY OAS、real10y、credit spread proxy、liquidity proxy 和其它 macro stress indicators 如需加入，必须另开版本、一轮一个、先进入 isolated secondary diagnostic，并继承 short timeout / try-catch / isolated payload / health warning-only 原则。

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

Daily 成功提交 `data/*.json` 后，Pages 部署通过 `Deploy Static Site to Pages` 的 `workflow_run` 触发器接续运行。若 Daily Summary 显示数据已更新但页面仍停留在旧 baseline，除检查 Daily 提交外，还应检查紧随其后的 Pages deploy 是否成功。

### Daily Realtime Input Audit

`Build Daily Radar Data` 在运行 `run-daily-pipeline.mjs` 读取 `origin/realtime-data:realtime/market.json` 后，会在日志与 GitHub Step Summary 中输出 **Daily Realtime Input Audit**（控制台前缀 `[Daily Realtime Audit]`，Summary 小节标题 `Daily Realtime Input Audit`）。用于确认本次 Daily 实际读到的 `updatedAt`、`ageMinutes`、按与站点一致的窗口划分的 `freshness`（fresh / aging / stale / unavailable）、`sourceMode`、`healthScore`、以及 `values.brent` 与 `brentValidation.consensus` 的推荐值 / `canPromoteToPrimary` / `confidence`。

当审计显示 **stale** 或 **unavailable**（`result: WARNING`）时，只表示输入快照偏旧或无法判定时效，**不会**中断 Daily 构建。排查宜优先：

- `Build Realtime Market` 最近是否成功、是否按时写入 `realtime-data`。
- `realtime/market.json` 的 `updatedAt` 是否持续更新。
- `Check Realtime Health` 是否连续失败。
- 上游行情源是否异常。

该审计仅用于诊断与可观测性，**不改变** scoring、decision、Brent 主值生成或任何 fallback 行为；主 Brent 仍以管线内的 `values.brent` 为准，推荐值不等于主值。

Daily 与前端共用 **`canUseRealtimePayloadValues`**（见 `docs/DATA_CONTRACT.md`）。若审计或 payload 显示 **cache-only**、**unavailable**、**healthScore 归零**、**criticalMissing 过高**，或 **degradedMode** 且非 **live-with-fallback**，则 Daily 应走现有 **buildFallback**，不得用该 realtime 重算 baseline；前端亦不应进入实时 overlay，而应呈现基线 / fallback 状态。此时优先核对 `sourceMode`、`cacheOnly`、`healthScore`、`criticalMissing`，并查看 **Check Realtime Health** 与 **Build Realtime Market** 是否异常。

### Daily vs Worker Input Audit

v28.0F-1 起，`Build Daily Radar Data` 在读取 `origin/realtime-data:realtime/market.json` 后，会运行：

```bash
node scripts/audit-daily-vs-worker.mjs --github-summary
```

该审计只比较 **Daily 实际消费的 realtime-data payload** 与当前 Cloudflare Worker `/market.worker-preview.json`，并把 drift summary 写入 GitHub Actions Summary。它不写 `data/*.json` 或 `realtime/*.json`，不改变 Daily 输入，不改变前端 runtime 优先级，也不阻塞 Daily 成功（除非本地 `realtime/market.json` 缺失或 JSON 非法）。

看到 drift 不一定是错误：Worker 可能比 Daily 消费的 `realtime-data` 更新。若未来考虑让 Daily 改用 Worker 作为输入，必须另开 F-2 / F-3 版本评审；F-1 只是 audit-only。

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

- 当前 **v28.0E** 已采用 Worker-first realtime 链路：前端优先读取 `/market.worker-preview.json`，通过 strict gate 后作为 realtime overlay。
- GitHub `realtime-data` 与 local fallback 仍保留为安全回退路径。
- Worker Cron 仍按 free-tier safe 策略运行，预览 KV 写入保持低频 / 单次写入边界。
- 仓库内 `workers/gfrr-realtime-worker/` 是当前 Worker backend 源码；部署与回滚以 Wrangler 与 Cloudflare 控制台为准，不改变现有 Pages 与 workflow 契约。
- **v28.0B-1 preview 管道（free-tier safe）**：Worker Cron 保持每 **3** 分钟运行，但每轮最多 **1** 次 KV write；成功时写 KV 键 **`market:latest-preview`**，失败时写 **`market:worker-heartbeat`** / status，不再每轮同时写 heartbeat 和 preview。`GET /market.preview.json` 用于自测 Worker API 与 KV 读写；观察成功刷新应优先看 `workerPreview.fetchedAt`，不要期待 heartbeat 每轮更新。heartbeat 只代表失败 / 状态记录，不再代表每轮成功心跳。可用 `node tools/observe-worker-preview.mjs --samples=24 --interval-minutes=15` 做本地观察；该脚本只读 `/market.preview.json`，不使用 Wrangler，不读取 heartbeat，不写 Cloudflare KV，因此不会消耗 KV write quota。**`market:latest` 仍未由该管道写入**；前端 **仍不** 读取 Worker；当前生产 realtime 链路 **仍是** GitHub Actions + `realtime-data`。
- **v28.0B-2A Worker-generated preview MVP**：Worker 可独立抓取 FRED / Gold API / Brent validation 轻量来源并写 KV 键 **`market:worker-generated-preview`**；`GET /market.worker-preview.json` 仅用于观察该 MVP。它不参与前端生产读取链路，不改变 Brent 主值链路（`values.brent` 仍以 FRED anchor 为准，consensus 仅作验证层），不改变 GitHub Actions。free-tier safe 策略保持：**3** 分钟 Cron、GitHub mirror preview 与 Worker generated preview 交替写入、每轮最多 **1** 次 KV write，因此单个 preview key 通常约 **6** 分钟刷新一次。
- **v28.0B-2A.1 Worker source diagnostics / fetch hardening**：Worker generated preview 会记录 `workerGeneratedPreview.diagnostics`，包括 FRED 是否全部失败、失败 status、各候选源 HTTP 摘要、retry / duration / content type / body length。若看到 `sourceMode: "worker-generated-unavailable"`，应先查看 diagnostics 判断是否为 Cloudflare Worker 出口到 FRED / Yahoo / Stooq / Google Finance / Trading Economics 的可达性或限流问题，**不应** 因该 preview 不可用而接入前端。Google Finance / Trading Economics 仅为 diagnostic-only experimental Brent 候选源，不参与 consensus，不覆盖 `values.brent`。GitHub Actions + `realtime-data` 仍是当前生产数据源，Worker generated preview 仍是实验观察层。
- **v28.0B-2B Worker vs mirror preview 对比**：可用 `node tools/compare-worker-vs-mirror.mjs --samples=24 --interval-minutes=15` 连续比较 `/market.worker-preview.json` 与 `/market.preview.json`。该脚本只读 HTTP endpoint，不使用 Wrangler，不读取 / 写入 KV，不消耗 KV write quota；只有当 Worker-generated preview 与 GitHub mirror preview 连续观察稳定后，才考虑后续 **v28.0C** 前端接入。
- **v28.0C-1 Worker candidate readiness**：前端开始只读 `/market.worker-preview.json` 并显示 `Worker候选源` 状态；该 candidate 不参与 GitHub realtime-data overlay、`effectiveDisplayInputs`、scoring、decision 或 fallback。当前生产 realtime overlay 来源仍是 GitHub `realtime-data`，页面显示 Worker 候选源可用只代表 readiness 观察，不代表已切换生产数据源。
- **v28.0C-2 Worker-first realtime source priority**：前端 runtime realtime 优先级升级为 **Worker generated preview → GitHub realtime-data → local fallback**。Worker 只有通过 strict safety gate 才能作为主 realtime source：HTTP 200、`workerGeneratedPreview.enabled === true`、`unavailable !== true`、`sourceMode === "worker-generated-preview"`、`healthScore >= 85`、`criticalMissing <= 1`、`updatedAt` 不超过 **10** 分钟，且 `values.brent / dxy / vix / hyOas / us10y / real10y` 均为 finite number。Worker 不通过时自动回退 GitHub；GitHub 不通过时自动回退 local fallback。本阶段不改变 Worker、GitHub Actions 或 data generation。
- **v28.0C-3 Worker-first rollback switch**：前端 realtime source preference 集中在 `scripts/modules/config.js` 的 `realtimeSourcePolicy`。默认：

```text
workerFirstEnabled: true
Worker generated preview → GitHub realtime-data → local fallback
```

紧急回退只改前端配置，不改 Worker、不改 GitHub Actions、不改数据生成逻辑。回退开关位置：

```text
scripts/modules/config.js
realtimeSourcePolicy.workerFirstEnabled
```

当 `workerFirstEnabled: false` 时，前端跳过 Worker 主源选择，优先级变为：

```text
GitHub realtime-data → local fallback
```

健康面板应显示 `GitHub优先（Worker已由配置关闭）`，这表示运营配置回退，不表示 Worker endpoint 出错。

紧急回退步骤：

1. 修改 `scripts/modules/config.js`：

```javascript
workerFirstEnabled: false
```

2. 运行检查：

```bash
node --check scripts/modules/config.js
node --check scripts/modules/realtime.js
node --check scripts/modules/health.js
npm run check:all
```

3. 提交并部署：

```bash
git add scripts/modules/config.js scripts/modules/realtime.js scripts/modules/health.js docs/OPERATIONS.md docs/DATA_CONTRACT.md
git commit -m "Temporarily disable Worker-first realtime source"
git pull --rebase origin main
npm run check:all
git push origin main
```

4. 验证页面健康面板显示：

```text
GitHub优先（Worker已由配置关闭）
```

重新启用 Worker-first：

1. 修改 `scripts/modules/config.js`：

```javascript
workerFirstEnabled: true
```

2. 运行同样检查：

```bash
node --check scripts/modules/config.js
node --check scripts/modules/realtime.js
node --check scripts/modules/health.js
npm run check:all
```

3. 提交：

```bash
git add scripts/modules/config.js scripts/modules/realtime.js scripts/modules/health.js docs/OPERATIONS.md docs/DATA_CONTRACT.md
git commit -m "Re-enable Worker-first realtime source"
git pull --rebase origin main
npm run check:all
git push origin main
```

回退触发条件：

- Worker age > **10** 分钟持续两次以上。
- Worker endpoint 非 200。
- `healthScore < 85`。
- `criticalMissing > 1`。
- `brent / dxy / vix / hyOas / us10y / real10y` 任一核心字段无效。
- 页面健康面板或主源显示出现明显异常。
- `node tools/compare-worker-vs-mirror.mjs --samples=24 --interval-minutes=15` 显示 Worker 与 GitHub 多字段持续 critical fail。

不应回退的情况：

- GitHub mirror stale 但 Worker fresh 且通过 strict gate。
- Worker 偶发 1 次 warn 后恢复。
- VIX 短时差异但没有 critical fail。
- GitHub Actions schedule 空窗，但 Worker 当前 fresh 且健康。

**v28.0D-1 / v28.0D-2-lite secondary diagnostics isolation**：D-1 曾尝试在 Worker generated preview 内加入 DXY、VIX、HY OAS、Gold、US10Y 第二源诊断；部署后 Worker scheduled preview 曾停止刷新，`/market.worker-preview.json` stale，前端安全闸门已正确回退到 GitHub。线上 Cloudflare Worker 已手动 rollback 到稳定版本 `679fb678-fe1d-4ff3-b9b9-53829d4d31f7`。v28.0D-2-lite 起，第二源诊断必须独立于主 Worker preview：`/market.worker-preview.json` 不得包含 `secondarySources` / `secondaryDiagnostics`，不得执行第二源外部请求；独立 endpoint 为 `/market.secondary-preview.json`，只读 KV key `market:secondary-preview`。该 key 默认不由 scheduled 写入；不存在时 endpoint 返回小型 unavailable payload，不影响主链路。

**v28.0D-3 secondary preview VIX-only producer**：独立 secondary preview 当前只接入 **VIX via Cboe**，不接入 DXY / HY OAS / Gold / US10Y / Brent。scheduled 在主 preview KV put 成功后才低频尝试更新 `market:secondary-preview`；若该 key 的 `updatedAt` / `generatedAt` 距今小于 **30** 分钟则跳过。Cboe 单源请求使用短超时，失败只写入 secondary unavailable payload 或被捕获，不影响主 `market:worker-generated-preview`、Worker-first strict gate、GitHub fallback 或 local fallback。前端当前不消费 `/market.secondary-preview.json`。

**v28.0E-0 Worker fetch timeout guard**：Worker 主 preview 的外部 fetch 统一带短超时保护，目标是限制 FRED / Yahoo / Stooq / Google Finance / Trading Economics / gold-api 等免费源慢响应对 Worker runtime 的影响，而不是新增数据源或改变主值选择。timeout 会作为 `sourceDetails` / `diagnostics` / `sourceProbe` 中的错误摘要返回，不应直接 throw 中断主 preview；critical source timeout 仍按原有 `criticalMissing` / `healthScore` 规则处理，不放松健康门槛。Brent promotion、D-6 moveStatus、D-8B sourceProbe 决策边界均保持不变。后续新增 DXY / US10Y / SPX 等 secondary source 前，必须继承该短超时和失败隔离原则。

**v28.0E-1 Gold secondary diagnostic**：独立 `/market.secondary-preview.json` 在既有 **VIX via Cboe** 之外新增 **Gold via Yahoo `GC=F`** 后台诊断。Gold secondary 只写入独立 KV key `market:secondary-preview`，不写入 `market:worker-generated-preview`，不覆盖主 preview 的 `values.gold`，不参与 scoring / decision，也不影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。Gold 请求使用短超时并被捕获；Gold 失败只记录在 `diagnostics.sources.gold`，不得阻止 VIX secondary 写入，也不得阻止主 Worker preview 写入。只有 VIX 与 Gold 都失败时，secondary preview 才可标记 unavailable。当前 secondary diagnostics 只包含 VIX via Cboe 与 Gold via Yahoo `GC=F`；后续如果 Gold secondary 连续稳定，才可另开版本讨论是否作为主 `gold-api.com` 源的验证层。

**v28.0D-4 Brent source audit**：Worker generated preview 会在 `brentValidation.audit` 中记录 Brent 主值选择与验证层摘要，包括 selected source/value、candidate source status/value/observedAt/error，以及 consensus promotion decision。该 audit 只用于诊断 `values.brent` 为什么仍来自当前主源；它不改变 `values.brent`、不将 `recommendedValue` promote 为主值、不影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`、不影响 Worker-first strict gate，也不影响 scoring / decision。

**v28.0D-5 Brent freshness-gated promotion**：FRED `DCOILBRENTEU` 仍是 Brent anchor，但当 FRED anchor 超过 **72** 小时、Yahoo `BZ=F` 在 **48** 小时内且 Trading Economics Brent diagnostic 与 Yahoo 的相对差距不超过 **2%** 时，Worker generated preview 可以把 `values.brent` promote 为 Yahoo / Trading Economics 平均值。Google Finance 的 `0` 和 Stooq parse fail 必须排除，不参与 promotion。promotion 成功时 `sourceDetails.brent.source` 必须明确标记 promoted over stale FRED anchor；promotion 失败时继续使用 FRED。该机制只修正 Brent 主值选择，不改变 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable` 规则，不影响 VIX secondary preview，也不改前端 scoring / decision。

**v28.0D-6 Brent extreme-move confirmation guard**：D-6 不把 Brent 大幅波动默认视为错误。Worker generated preview 会在生成前读取上一轮 `market:worker-generated-preview` 的小型 Brent 摘要，用于比较上一轮 accepted / promoted Brent。若 promoted Brent 相对上一轮变化不超过 **2%**，视为 `normal`；**2%–3%** 视为 `volatility-watch`，仍允许；超过 **3%** 时进入 extreme-move confirmation。若 Yahoo `BZ=F` 与 Trading Economics 均有效、Yahoo fresh 且两者 divergence <= **1%**，标记 `confirmed-extreme-move` 并允许进入 `values.brent`；否则标记 `unconfirmed-jump-hold`，保留上一轮 accepted Brent（无上一轮时回退 FRED）。confirmed extreme move 是高价值风险信号，不会降低 `healthScore`，也不改变 VIX secondary preview。

**v28.0G-4A Trading Economics observedAt audit（历史步骤）**：Worker generated preview 会尝试从 Trading Economics Brent 页面解析 `observedAt`，并在 `brentValidation.promotion.confirmationSources` 与 `brentValidation.audit.candidateSources` 显示 `observedAt` / `ageHours` / `freshnessStatus` / `freshnessReason`。G-4A 本身曾是 audit-only；当前线上已进入 G-4C hard gate，不能再按 audit-only 判断 Brent promotion。旧 Draft PR #53 superseded，不应 merge / cherry-pick。

**v28.0G-4B decision: Trading Economics freshness hard gate（历史决策）**：G-4B 是 decision review，不是 runtime change；它已决定进入 G-4C。当前线上已执行 G-4C：Trading Economics 必须 `ok === true`、value 为正 finite number、`observedAt` 可解析、`ageHours` finite，且 `ageHours <= BRENT_CONFIRMATION_FRESH_HOURS`（48 小时）。旧 PR #53 superseded，不应 merge；所有后续改动必须基于 latest main 串行 trunk flow。

**v28.0G-4C Trading Economics freshness hard gate（当前线上行为）**：G-4C 已将上述方案落到 Worker runtime。Brent promotion 现在要求 Yahoo fresh + Trading Economics `observedAt` fresh；TE `observedAt` 不可解析时 hold promotion，`reason = tradingeconomics-observedAt-invalid`；TE `observedAt` 超过 48 小时时 hold promotion，`reason = tradingeconomics-confirmation-stale`。Trading Economics candidate 仍保留 value/audit，observedAt failure does not make candidate ok false，hard hold 只在 promotion decision 层处理。D-6 `confirmed-extreme-move` 同样要求 TE freshness fresh。

## v28.0G-6 Operations Runbook / Decision Matrix

本节是 Worker-first 稳定化后的运维判断入口。先看 `Check Worker Health`，再看 `Check Realtime Health` / recovery，最后看 Brent、secondary 和 KV usage。不要把 soft observer warning 当成 Worker runtime failure。

### Check Worker Health

- `overall=ok`：主运行链路健康，不需要操作。
- `overall=warning`：主运行链路可用，检查 reasons，通常先观察。
- `overall=unhealthy`：暂停部署和新增数据源，优先排查 Worker runtime。
- `healthScore <85`、`criticalMissing >1`、`unavailable=true`、`sourceMode` 异常、worker `ageMinutes >10`：视为 hard gate 问题。
- GitHub runner acquisition / internal server error：平台侧失败，不等于 Worker failure；看下一轮是否恢复。

### Check Realtime Health

- `fresh` / `aging`：fallback `realtime-data` 可用。
- `stale` / `unavailable`：soft observer warning，不代表 Worker-first runtime failure。
- `shouldRecover=true`：检查 `Recover Stale Realtime Market` 和 `Build Realtime Market`。
- 如果 Worker Health ok，但 Realtime Health stale：页面主链路仍健康，先观察或查 fallback pipeline。
- 如果长期 stale：检查 build / recover workflow 和 `realtime-data` branch。

### Recover Stale Realtime Market

- workflow success 且下一轮 Realtime Health fresh / aging：恢复成功。
- workflow success 但 Realtime Health 仍 stale：检查是否实际写入 `realtime-data`。
- workflow failure：检查权限、checkout、branch push、build script。
- 不要因 recovery warning 回滚 Worker runtime。

### Brent promotion

- `promotionApplied=true` 且 `moveStatus=normal`：正常。
- `promotionApplied=false` 且 reason 是 freshness / divergence / confirmed hold：可能是正常防守，不等于故障。
- `moveStatus=volatility-watch`：观察，不自动回滚。
- `moveStatus=unconfirmed-jump-hold`：防止未确认大跳变，正常保护逻辑。
- `moveStatus=confirmed-extreme-move`：需要确认 Yahoo + TE 都 fresh 且 divergence <= 1%。
- `values.brent` 退回 FRED anchor 或 previous accepted reference：先看 reason，不直接修代码。

### Trading Economics freshness

- TE `freshnessStatus=fresh`：允许进入 Brent promotion divergence / D-6 gate。
- TE `freshnessStatus=unknown`：G-4C 后 promotion 应 hold，reason 为 `tradingeconomics-observedAt-invalid`。
- TE `freshnessStatus=stale`：G-4C 后 promotion 应 hold，reason 为 `tradingeconomics-confirmation-stale`。
- TE candidate value 可以 ok，但 observedAt invalid / stale 会在 promotion decision 层 hold。
- 不应在 candidate fetch 层把 `ok` 改为 false。

### SourceProbe

- `sourceProbeFrequencyMinutes=60`、`probeCount<=5`：正常。
- Google Finance / Stooq probe failed：正常 diagnostic-only，不影响 main values。
- sourceProbe missing 或 `probeCount >5`：检查 Worker payload contract。
- 不要把 Google Finance / Stooq 升级为 validation source，除非另开版本并有稳定证据。

### Secondary diagnostics

- core secondary set：`vix` / `gold` / `dxy` / `us10y` / `spx`。
- 单个 secondary failed 或 `stale-warning`：warning，通常不影响主链路。
- secondary endpoint unavailable：检查 secondary producer，但不直接等同主 preview failure。
- 主 preview 出现 `secondarySources` / `secondaryDiagnostics` / `secondarySourceSummary`：secondary pollution，需要修。
- US10Y normalization：`rawValue <=20` 时 `no-op`；`rawValue >20` 时 `divide-by-10`。
- secondary 不参与 `values.*` / scoring / decision。

### Gold / DXY / US10Y / SPX observations

- 主 `values.gold=0` 但 secondary gold 正常：先观察，若连续出现再开 audit。
- US10Y raw / value normalization 不一致：优先查 E-3A 规则。
- SPX / DXY secondary ok 但主 FRED values 不同：正常，因为 source 不同、延迟不同。
- 不要因为 secondary 与 main 不一致直接覆盖主链路。

### Cloudflare KV usage

- 50% warning：记录，不立即修。
- 80%：减少手动 deploy / 检查频率，观察是否接近 UTC reset。
- 90% 或连续多日 >800 writes/day：考虑 cron `*/3` -> `*/5` 或付费计划。
- 429：暂停非必要 Worker 写入和 deploy，等 UTC reset 或升级。
- 当前 KV write guard deferred：暂不做复杂 KV write guard。原因是它会增加 runtime 判断复杂度，未来数据字段多时 no-op skip 价值可能有限，且当前 writes 可解释并未超过 hard limit。

### Rollback

需要考虑 rollback：

- Worker preview HTTP 500 / JSON invalid。
- `sourceMode` 异常。
- `healthScore` 大幅下降。
- `criticalMissing` 增加。
- `unavailable=true`。
- Brent promotion 被错误阻断且 reason 不合理。
- secondary pollution 进入 main payload。

### No rollback

不需要 rollback：

- Realtime Health stale 但 Worker Health ok。
- 单次 GitHub runner failure。
- sourceProbe diagnostic failure。
- 单个 secondary source `stale-warning`。
- KV 50% usage warning。
- promotion hold reason 合理。

### Development sequencing

- runtime 改动必须基于最新 main、单一逻辑 PR / commit、先本地 checks、提交后 deploy preflight、deploy 后 live validation、再观察 1-2 轮 scheduled `Check Worker Health`。
- 文档 / Summary / check 脚本改动通常不需要 deploy。
- 不使用旧 PR / stacked PR；旧 PR #53 已 superseded。

## v28.0G-7A Health Summary Snapshot / Audit Export

v28.0G-7A 只增强 `Check Worker Health` 的只读输出。它保留既有 stdout 和 GitHub Step Summary，并在 workflow 中通过 `--snapshot-file health-worker-snapshot.json` 生成结构化 JSON，再上传 GitHub artifact `worker-health-snapshot`。该 snapshot 不写 Cloudflare KV，不写 `data/*.json` / `realtime/*.json`，不 deploy，也不是网站运行输入。

snapshot 用于回看历史健康状态，包含 Worker Health hard gate 结果、Brent promotion 与 Trading Economics freshness、sourceProbe 摘要、core secondary freshness、secondary pollution 状态和 reasons。`Check Worker Health` 仍是 Worker-first runtime hard gate；snapshot 不改变 fail 边界。`Check Realtime Health` 仍是 fallback / Daily baseline soft observer，不受 G-7A 影响。KV write guard deferred，继续先观察。

## v28.0G-7B Health Snapshot Review Helper

v28.0G-7B 新增本地只读 helper：

```bash
npm run review:worker-health-snapshot -- health-worker-snapshot.json
```

也可直接运行 `node scripts/review-worker-health-snapshot.mjs --file health-worker-snapshot.json`。该脚本读取下载后的 G-7A artifact JSON，输出 PASS / WARN / FAIL、Action、Worker Health、Brent / Trading Economics freshness、sourceProbe、secondary freshness 和 reasons。它不访问网络，不写 Cloudflare KV，不写 `data/*.json` / `realtime/*.json`，不修改 Worker runtime，也不需要 Worker deploy。

该 helper 只是历史 snapshot 快速审阅工具，不替代 `Check Worker Health` hard gate。若 review 输出 FAIL，应回到 runbook 的 `Check Worker Health` / Brent / secondary / rollback 规则定位原因。

**v28.0D-7 Brent source explainability UI**：页面“盘中快变量 / 布伦特”会显示 Brent 来源与 D-6 move status，例如 FRED 日度锚点、FRED 滞后且 Yahoo + Trading Economics 双源确认、正常 / 较大波动观察 / 已确认极端波动 / 未确认跳变。该 UI 仅用于解释 selected realtime payload，不改变 Worker 数据、Brent promotion、scoring、decision，也不读取或展示 secondary diagnostics preview。

**v28.0D-8 Brent source hygiene**：Google Finance Brent 继续只作为 HTML experimental diagnostic，可能命中 futures chain 中的 `0` 或非主价格；非正值必须标记 `excluded-non-positive-or-invalid`，不参与 consensus 或 promotion。Stooq `brn.f` 保留为观测源，但 CSV close 缺失时应明确记录 `csv-no-numeric-close` 或 `symbol-download-unavailable`。新增 `stooq:brn.c` alternate diagnostic probe，仅进入 audit candidateSources，不参与主值、consensus 或 promotion。当前 Brent 主值逻辑仍是 FRED anchor + Yahoo / Trading Economics confirmed promotion，失败的 Google Finance / Stooq 不影响 `healthScore` / `criticalMissing` / `unavailable`。

**v28.0D-8A Stooq role cleanup**：将 `stooq:brn.f` 标为 `diagnostic`、`participatesInConsensus: false`、`quality: csv-symbol-unstable`，不进入 `brentValidation.consensus`，避免误读为仍参与 Brent validation。此行 **不是** Google Finance / Stooq 抓取修复；不可靠 HTML / CSV 与符号问题应通过 **v28.0D-8B Source Probe** 另行处理。

**v28.0D-8B-lite Brent source probe**：Worker generated preview 在 `brentValidation.sourceProbe` 中记录低频隔离的 Google Finance / Stooq source probe。它每 **60** 分钟最多运行一次；60 分钟内复用上一轮 main preview 中的 `sourceProbe.probes`，并标记 `reused: true` / `source-probe-reused-within-60m`。当前只探测 Google Finance canonical / front-month 两个 URL，以及 Stooq `brn.f` / `brn.c` / `bz.f` 三个 symbol。它不保存完整 HTML 或完整 CSV，不参与 `brentValidation.consensus`、`brentValidation.promotion` 或 `values.brent`，也不影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。即使某个 probe 显示 `parseStatus: ok`，当前 Brent 主逻辑仍是 FRED anchor + Yahoo `BZ=F` / Trading Economics confirmed promotion；只有连续稳定后才应另开 D-8C 讨论是否升级为 validation source。

### v28.0D-8B Source Probe Findings

v28.0D-8B-lite **已上线运行并通过验证**。以下为一次典型线上 `sourceProbe.probes[]` **结论型快照**（diagnostic-only，不是主 Brent 来源；失败不得影响 `healthScore` / `criticalMissing` / `unavailable`，因为它们只是 probes）：

- `google-finance:BZW00:NYMEX` canonical：**`parseStatus = unreliable-html-parse`**
- `google-finance:BZY00:NYMEX` front-month：**`parseStatus = unreliable-html-parse`**
- `stooq:brn.f`：**`parseStatus = empty-body`**（不可靠 Brent close）
- `stooq:brn.c`：**`parseStatus = header-unrecognized`**（不可靠 Brent close）
- `stooq:bz.f`：**`parseStatus = empty-body`**（不可靠 Brent close）

**运维结论**：Google Finance 与 Stooq **在此观测窗口内均不能升级为 Brent validation source**；也 **不得** 进入：

- `brentValidation.consensus`
- `brentValidation.promotion`
- `values.brent`

**当前可靠 Brent 主逻辑仍应保持**：

1. **FRED `DCOILBRENTEU` anchor**
2. **Yahoo `BZ=F` freshness-gated confirmation**（D-5 条件仍然成立时的 fresh 约束）
3. **Trading Economics confirmation**（与 Yahoo 一起做 promotion confirmation pair）
4. **v28.0D-6 extreme-move confirmation guard**

若未来重新评估 Google / Stooq 是否“可升级候选”，必须先在 `sourceProbe` 中观察到**连续多轮**满足：

- **`parseStatus = ok`**（且不得靠放宽解析把不可靠 HTML / 非 CSV 误判为 ok）
- **`parsedValue > 0`**
- **时间戳 / 样本行可解释**（能解释数据来源与新鲜度边界）
- **与 Yahoo / Trading Economics 的数值关系合理接近**
- **仍需另开独立版本评审**（例如 **D-8C**），再决定是否允许升级为 validation source 或接入更高权限链路。

未来重新设计 secondary diagnostics 必须满足：

- 不阻塞主 Worker generated preview 写入。
- 低频运行，例如 **30–60 分钟**。
- 每轮最多 **1–2** 个 secondary source。
- 单源短超时。
- 失败只记录 diagnostics，不影响 `values.*`、`updatedAt`、`healthScore`、`criticalMissing`、`sourceMode`、`unavailable` 或 KV put。

## 10. 不要做的修复

- 不要为了让 validate 通过而削弱校验规则。
- 不要把 `brentValidation.consensus.recommendedValue` 直接改成 Brent 主值。
- 不要放松 local fallback 安全闸门。
- 不要绕过 `effectiveDisplayInputs` 直接用 raw realtime values。
- 不要在 render 层重新推导 `executionLock` / `positionGuidance`。
- 不要把 JSON 产物作为临时修复随意提交。
- 不要用 UI 文案反向修改数据契约或评分逻辑。
