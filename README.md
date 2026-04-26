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

当前处于 `v27.x` 稳定化阶段。

已经具备：

- realtime 数据更新与 freshness / degraded / unavailable 状态展示。
- daily baseline 构建与 `displayInputsBaseline` fallback。
- 六大风险模块、热力图、传导网络、资产偏好矩阵和情景树。
- 决策系统、执行灯、仓位建议、Action Queue、Trigger Monitor 和 Invalidation Rules。
- GitHub Actions Summary 审计入口。
- 数据契约保护与 DOM / module / syntax smoke check。

一句话演进：`v25` 看见风险，`v26` 知道该做什么，`v27` 将风险状态、仓位约束和执行动作结构化。

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
Build Realtime Market
→ realtime-data 分支 / realtime/market.json
→ Build Daily Radar Data
→ main / data/radar-data.json
→ 前端读取 baseline + 远端 realtime
→ effectiveDisplayInputs
→ 页面渲染
```

关键边界：

- `realtime-data` 是前端远端 realtime payload 的主要来源。
- `dailyRealtimeInput` 记录 Daily 构建实际消费的 realtime 版本。
- `displayInputsBaseline` 是 baseline fallback 的结构化当前值来源。
- 前端当前值最终使用 `effectiveDisplayInputs`，按“可用 realtime values → displayInputsBaseline → null”的顺序选择。
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

`brentValidation.consensus.recommendedValue` 是验证层推荐值，不等于主值；系统不会自动切主值。`canPromoteToPrimary=false` 时不得提升为主值。

详细规则见 `docs/DATA_CONTRACT.md`。

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
npm run check:data
```

用途：

- `check:syntax`：统一检查核心 JS / MJS 文件语法。
- `check:dom`：检查关键 DOM 挂载点。
- `check:modules`：检查模块 import / export 是否断裂。
- `check:data`：检查数据契约、Brent validation、Decision Output Contract、Transmission Delta 等结构；底层运行 `node scripts/validate-data.mjs`。

如果 `check:data` 输出本地 `realtime/market.json` 与 `dailyRealtimeInput.updatedAt` 不匹配的 warning，但最终显示 `Validation passed (v27.0)`，这是可接受状态。本地 fallback 可能不是 Daily 实际消费的 realtime 版本。

## GitHub Actions 工作流

主要 workflow：

- `Build Realtime Market`：定时生成 realtime payload，并发布到 `realtime-data` 分支。
- `Build Daily Radar Data`：读取最新 `realtime-data` payload，生成 `data/radar-data.json` 与 history。
- `Deploy Static Site to Pages`：部署静态站点到 GitHub Pages。

Pages deploy 前自动运行：

```bash
npm run check:syntax
npm run check:dom
npm run check:modules
node scripts/validate-data.mjs
```

这些步骤分别检查 JS / MJS 语法、关键 DOM 挂载点、模块 import / export 和静态数据契约。Pages deploy 是分步骤运行这些检查，不运行 `npm run check:all`。

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

- 数据契约：`docs/DATA_CONTRACT.md`
- 运行排查手册：`docs/OPERATIONS.md`
- 核心入口：`index.html`
- 前端入口：`scripts/app.js`
- Realtime 构建：`scripts/run-realtime.mjs`
- Daily 构建：`scripts/run-daily-pipeline.mjs`
- 数据校验：`scripts/validate-data.mjs`
