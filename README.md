# Global Financial Risk Radar

全球金融风险雷达是一个面向公开部署场景的宏观风险监控与策略状态判断网站。它不只是展示图表，而是把 realtime 快变量、daily baseline、六大风险模块和决策系统组织成一个可审计的风险驾驶舱。

在线访问：<https://ctmaomao.github.io/gfrr-auto-update-site/>

## 项目定位

本项目用于辅助回答：

- 当前宏观风险处于什么状态。
- 当前应偏进攻、均衡、谨慎还是防守。
- 当前仓位区间、现金缓冲和风险预算应如何约束。
- 哪些条件会触发风险升级，哪些条件允许判断缓和。

它不是选股工具，也不是短线交易信号系统。

## 当前版本状态

当前处于 `v28.0E-0` 工程进度；页面公开标签仍为 `v28.0C`。

已经具备：

- Worker-first 实时主源，前端按 strict gate 选择 Worker generated preview。
- GitHub `realtime-data` fallback 与本地 `./realtime/market.json` fallback。
- realtime freshness / degraded / unavailable 状态展示。
- daily baseline 构建与 `displayInputsBaseline` fallback。
- 六大风险模块、热力图、传导网络、资产偏好矩阵和情景树。
- 决策系统、执行灯、仓位建议、Action Queue、Trigger Monitor 和 Invalidation Rules。
- secondary diagnostics 独立 endpoint `/market.secondary-preview.json`，当前接入 VIX via Cboe 与 Gold via Yahoo `GC=F` 诊断。
- Brent audit、freshness-gated promotion、extreme-move confirmation guard、D-8B-lite sourceProbe 与 Brent source explainability UI。
- D-8B findings 已确认 Google Finance / Stooq 当前不可升级为 Brent validation source，仍只保留 diagnostic sourceProbe。
- Worker fetch timeout guard 已上线，外部免费源慢响应只进入 diagnostics，不改变主值选择。
- Daily vs Worker Input Audit 已上线，用于观察 Daily 消费的 `realtime-data` payload 与当前 Worker preview 的差异；该审计不改变 Daily 输入或前端 Worker-first 选择逻辑。
- Daily 成功刷新数据后触发 Pages deploy handoff。
- GitHub Actions Summary 审计入口。
- 数据契约保护与 DOM / module / syntax smoke check。

一句话演进：`v25` 看见风险，`v26` 知道该做什么，`v27` 将决策结构化，`v28` 将实时数据源、Worker-first、Brent promotion 与诊断隔离工程化。

## 核心架构

当前系统分为三层：

1. 看见风险：聚合总风险分数、六大风险模块、实时快变量、健康状态与历史变化。
2. 理解风险：将离散指标压缩为策略状态、主导风险源和状态解释。
3. 执行动作：输出执行灯、仓位区间、动作队列、升级触发器和失效条件。

主分支与数据职责：

- `main`：GitHub Pages 主站页面和 daily baseline 数据。
- `realtime-data`：远端 realtime payload 发布分支。
- `data/radar-data.json`：页面 baseline 与决策主数据。
- `data/radar-history.json` / `data/radar-history-full.json`：历史序列与审计快照。
- `realtime/market.json`：realtime payload 路径；`main` 中的本地文件只作为 fallback。

## 数据链路

```text
Cloudflare Worker generated preview
→ GitHub realtime-data
→ local fallback
→ Build Daily Radar Data
→ main / data/radar-data.json
→ 前端读取 baseline + selected realtime
→ effectiveDisplayInputs
→ 页面渲染
```

关键边界：

- 前端 realtime 优先级为 `Worker generated preview → GitHub realtime-data → local fallback`。
- Worker generated preview 必须通过 strict gate：HTTP 200、`workerGeneratedPreview.enabled === true`、freshness、`healthScore`、`criticalMissing` 与关键字段有限值检查。
- `realtime-data` 是 Worker 不可用或被策略关闭时的远端 fallback。
- `dailyRealtimeInput` 记录 Daily 构建实际消费的 realtime 版本。
- `displayInputsBaseline` 是 baseline fallback 的结构化当前值来源。
- 前端当前值最终使用 `effectiveDisplayInputs`，按“可用 realtime values → displayInputsBaseline → null”的顺序选择。
- `effectiveDisplayInputs` 仅在前端运行时合成并挂到 `data.__effectiveDisplayInputs`；`radar-data.json` 根级不序列化该字段，也不要求根级 `values` 对象（详见 `docs/DATA_CONTRACT.md` 中「effectiveDisplayInputs 运行时合成说明」）。
- 本地 `./realtime/market.json` 只是 fallback，不保证是最新 realtime。

完整字段契约见 `docs/DATA_CONTRACT.md`。

## 决策系统

决策输出以 `decisionModel` 和 `tradingSystem` 为核心：

- `decisionModel`：策略状态、状态原因、主导驱动、仓位建议、动作队列、触发器和失效条件。
- `tradingSystem.executionLock`：执行灯与新增风险约束。
- `tradingSystem.positioning`：目标总仓位、现金缓冲、风险预算和核心配置。
- `tradingSystem.actionLayer`：今日动作、禁止事项和执行检查点。
- `tradingSystem.riskControl`：硬触发阈值与重置条件。

渲染层只展示和格式化这些结构，不应重新推导执行灯、仓位建议或策略状态。

## 页面结构

页面按三层信息架构组织：

- 核心驾驶舱：决策首屏、realtime strip、健康状态、总览和执行灯。
- 风险解释层：风险模块、流动性、热力图、资产偏好和关键解释。
- 高级分析与规则审计：30日时间维度、机构级传导网络、预警规则、情景树、恢复状态和行为纪律。

高级区默认折叠，避免首屏信息过载。

## Brent 验证边界

Brent 主显示值仍来自：

```text
values.brent
```

FRED `DCOILBRENTEU` 仍是 Brent anchor，但 v28.0D 起允许在严格条件下切换主值：

- 当 FRED anchor stale，且 Yahoo `BZ=F` 与 Trading Economics Brent 均有效、fresh / 可用且 divergence 在阈值内时，允许 freshness-gated promotion。
- `>3%` 的相邻周期大幅跳动不会默认视为错误；如果 Yahoo + Trading Economics 双源确认，可标记 `confirmed-extreme-move` 并进入 `values.brent`。
- 未被双源确认的大幅跳动会 `hold`，保留上一轮 accepted Brent 或回退 FRED anchor。
- Google Finance 的 `0`、failed / null 来源和未满足条件的 diagnostic candidate 不参与 promotion。
- 页面“盘中快变量 / 布伦特”会显示 Brent 来源解释与 D-6 move status。

`brentValidation.consensus.recommendedValue` 仍只是验证层推荐值，不得绕过 freshness-gated promotion 与 extreme-move confirmation guard 直接写入 `values.brent`。

详细规则见 `docs/DATA_CONTRACT.md`。

## Secondary diagnostics 边界

secondary diagnostics 已从主 Worker preview 隔离：

- 主 `/market.worker-preview.json` 不得包含 `secondarySources` / `secondaryDiagnostics` / `secondarySourceSummary`。
- `/market.secondary-preview.json` 是独立诊断 endpoint，读取独立 KV key。
- 当前接入 VIX via Cboe 与 Gold via Yahoo `GC=F` secondary diagnostics。
- 前端主页面暂不消费 secondary diagnostics；它们只用于后台诊断，不影响 `effectiveDisplayInputs`、`values.*`、scoring、decision 或 Worker-first strict gate。

## 开发检查与提交前验收

提交前推荐直接运行完整检查：

```bash
npm run check:all
```

该命令会依次运行：

```bash
npm run check:syntax
npm run check:dom
npm run check:modules
npm run check:copy
npm run check:workflows
npm run check:docs
npm run check:data
```

用途：

- `check:syntax`：自动扫描 `scripts/` 下所有 `.js` / `.mjs` 文件并执行 `node --check`。
- `check:dom`：检查关键 DOM 挂载点。
- `check:modules`：自动扫描 `scripts/modules/*.js` 并执行动态 import 检查。
- `check:copy`：检查用户可见文案契约，防止“广义美元指数 / 亿美元 / 传导网络 Δ”等已修复文案回退。
- `check:workflows`：检查 GitHub Actions workflow 合约，防止 Realtime / Daily / Pages 部署中的关键调度、Summary、校验和部署步骤被误删。
- `check:docs`：检查 `README.md`、`AGENTS.md` 和 `docs/*.md` 中的本地 Markdown 链接，防止 DATA_CONTRACT / OPERATIONS 等文档入口失效。
- `check:data`：检查数据契约、Brent validation、Decision Output Contract、Transmission Delta 等结构；底层运行 `node scripts/validate-data.mjs`。

新增 `scripts/` 脚本或 `scripts/modules/` 模块后，通常会自动纳入对应检查，无需手动维护检查列表。

如果 `check:data` 输出本地 `realtime/market.json` 与 `dailyRealtimeInput.updatedAt` 不匹配的 warning，但最终显示 `Validation passed (v27.0)`，这是可接受状态。本地 fallback 可能不是 Daily 实际消费的 realtime 版本。

## GitHub Actions 工作流

主要 workflow：

- `Build Realtime Market`：定时生成 realtime payload，并发布到 `realtime-data` 分支。
- `Build Daily Radar Data`：读取最新 `realtime-data` payload，生成 `data/radar-data.json` 与 history。
- `Deploy Static Site to Pages`：Daily 成功提交 `data/*.json` 后，通过 `workflow_run` 触发并部署静态站点到 GitHub Pages。

Pages deploy 前自动运行：

```bash
npm run check:syntax
npm run check:dom
npm run check:modules
npm run check:copy
npm run check:workflows
npm run check:docs
npm run check:data
```

这些步骤分别检查 JS / MJS 语法、关键 DOM 挂载点、模块 import / export、用户可见文案契约、GitHub Actions workflow 合约、文档本地链接和静态数据契约。Pages deploy 是分步骤运行这些检查，不运行 `npm run check:all`。

其中数据契约检查等价于 `npm run check:data`。如果 `validate-data.mjs` 输出本地 realtime 与 `dailyRealtimeInput.updatedAt` 不匹配的 warning，但最终显示 `Validation passed (v27.0)`，属于可接受状态；只有校验进程以非 0 退出才会阻止部署。

Realtime / Daily workflow 会在 GitHub Actions Summary 输出关键审计信息，包括 `sourceMode`、`healthScore`、Brent、`dailyRealtimeInput`、`displayInputsBaseline` 和 Decision Summary。

## 关键数据契约

详细数据契约统一维护在：

- `docs/DATA_CONTRACT.md`

其中记录：

- 数据链路与 canonical 当前值。
- `displayInputsBaseline` 与 `dailyRealtimeInput`。
- Brent 主值与验证层边界。
- Decision Output Contract。
- `realtimeFetchAudit`。
- Transmission Delta / 传导网络 Δ。
- ON RRP 单位。
- DXY / 广义美元指数命名。
- realtime fallback 与 validate 规则。

## 当前维护原则

- 不把 validation 推荐值直接当作主显示值。
- 不通过解析中文文案恢复结构化数据。
- 不削弱 fallback 闸门来掩盖旧 realtime 文件。
- 不在渲染层重算评分、决策状态或执行约束。
- 修改数据链路、决策契约或渲染结构时，必须运行对应检查。

## 文档入口

- [AI 开发守则](AGENTS.md)
- [v27 稳定化基线](docs/V27_BASELINE.md)：历史稳定基线与维护边界，不代表当前 v28.0E-0 工程进度。
- 数据契约：`docs/DATA_CONTRACT.md`
- 运行排查手册：`docs/OPERATIONS.md`
- 核心入口：`index.html`
- 前端入口：`scripts/app.js`
- Realtime 构建：`scripts/run-realtime.mjs`
- Daily 构建：`scripts/run-daily-pipeline.mjs`
- 数据校验：`scripts/validate-data.mjs`
