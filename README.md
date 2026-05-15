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

当前处于 `v28.0J` 稳定观察基线；页面公开标签仍为 `v28.0C`，不要把工程内部版本同步误改成 UI 公开版本。v28.0J-2B post-deploy audit 已通过，当前前端版本为 `28.0M-42V`。

当前主运行状态：

- Worker-first 是主运行路径，前端通过 strict gate 选择 `/market.worker-preview.json`。
- `/market.secondary-preview.json` 是独立 secondary diagnostics endpoint，不污染主 preview。
- `realtime-data` 分支和本地 `./realtime/market.json` 只作为 fallback / Daily baseline 输入观察。
- Daily baseline 写入 `data/radar-data.json`、`data/radar-history.json` 和 `data/radar-history-full.json`。
- `displayInputsBaseline` 是 baseline fallback 的结构化当前值来源。
- 前端最终当前值由运行时 `effectiveDisplayInputs` 合成，渲染层不得绕过它改用 raw realtime values。
- Brent 主逻辑为 FRED anchor + Yahoo fresh confirmation + Trading Economics freshness gate + extreme-move guard。
- 当前 core secondary set 为 `vix` / `gold` / `dxy` / `us10y` / `spx`；VIX / Gold / DXY / US10Y / SPX secondary 当前只用于诊断，不进入主值、scoring 或 decision。
- v28.0G-4C Trading Economics freshness hard gate 已实现；`tradingeconomics-observedAt-invalid` / `tradingeconomics-confirmation-stale` 会 hold promotion，且 observedAt failure does not make candidate ok false。
- Operations Runbook 以 `docs/OPERATIONS.md` 为入口；`worker-health-snapshot` 和 `review:worker-health-snapshot` 只读审阅健康快照，PR #53 superseded，KV write guard deferred。
- World Order Stress Overlay 是 regime overlay / 结构性状态修正器，不是第七个底层风险模块。
- `dailyBrief`、`divergenceLayer`、`macroDrivers.consumer`、`consumer_vs_asset_pricing`、`brentPricingLayer` 和 `aiInterpretationLayer` 都是解释层 / 审计层 / 展示层。
- External AI production panel 是只读辅助层；manual / provider artifacts 不等于 scoring、Daily、frontend 或 production write readiness。
- Market Pricing Temperature 已进入 M-27 以后前端展示阶段，后续边界以对应 M-series docs 为准。
- Frontend asset cache version 当前为 `28.0M-42V`；修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js` 时必须同步 bump。
- `npm run check:all` 当前由 `package.json` 定义，包含 50 个串联检查项。
- Market Pricing first real record write scaffold 在任何写入前运行 6 sanity checks；细节以 `docs/OPERATIONS.md` 和 `docs/SYSTEM_UPGRADE_PLAN.md` 为准。

最近维护节奏：

- M-31 到 M-35 完成 editorial design contract compliance、DESIGN.md amendment、bias color semantics、Group A spacing governance、Group B spacing governance 和 footer redesign。
- M-36 仅删除已验证无依赖的 dead weight，并同步前端 asset cache version；不改变数据、工作流、决策、执行、仓位或 DESIGN.md contract。
- Section border consistency M-38 adds global `.editorial-section` border (`var(--paper-line-strong)`) to unify visual demarcation across 7 IA sections. `#macro-risk-overview` scoped reset prevents double-layer visual since its inner `.macro-overview-block` cards provide their own borders. Frontend display layer only.
- Brent promotion audit completeness M-39 adds `consensus.reason` as third fallback for `promotionAudit.promotionReason` and derives `anchorAgeHours` from `sourceDetails.ageSeconds` or fred-anchor `observedAt`. Backend reading logic only; no new data source. Frontend display unaffected until next pipeline run.
- Fed liquidity FRED extension M-41 adds FRED:DFF (effective federal funds rate) and FRED:SOFR (secured overnight financing rate) to `resolveFedLiquidity`. It formalizes `macroDrivers.fedLiquidity` DATA_CONTRACT for the first time. Backend pipeline only; visible in B3 政策代理 and B4 金融脆弱性 evidence after next scheduled daily-pipeline run.
- Fed liquidity triplet completion M-42 adds FRED:WRESBAL (bank reserve balances, weekly Wednesday, NSA, millions USD) to `resolveFedLiquidity` with 4-week change calculation. It completes the Fed liquidity triplet (M-41 DFF + SOFR rates, M-42 WRESBAL quantity). B4 financial fragility evidence grows from 4 to 5 lines. WRESBAL does not enter pressure score. Values populate on next scheduled daily-pipeline run.

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

完整 Worker-first 数据流、fallback 优先级、`dailyRealtimeInput`、`displayInputsBaseline`、`effectiveDisplayInputs`、Brent validation、secondary diagnostics 与字段契约统一维护在 `docs/DATA_CONTRACT.md`。

## 决策系统

决策输出以 `decisionModel` 和 `tradingSystem` 为核心：

- `decisionModel`：策略状态、状态原因、主导驱动、仓位建议、动作队列、触发器和失效条件。
- `tradingSystem.executionLock`：执行灯与新增风险约束。
- `tradingSystem.positioning`：目标总仓位、现金缓冲、风险预算和核心配置。
- `tradingSystem.actionLayer`：今日动作、禁止事项和执行检查点。
- `tradingSystem.riskControl`：硬触发阈值与重置条件。

渲染层只展示和格式化这些结构，不应重新推导执行灯、仓位建议或策略状态。

## 前端与页面结构

首页信息架构以 `DESIGN.md` 为准。当前一级顺序是 Hero / Masthead、dashboard jump nav、Macro Risk Overview、WoW Key Changes、Global Risk Heatmap，随后是折叠的 detail data、method evidence、External AI auxiliary 和 execution risk detail。

前端约束：

- `DESIGN.md` 是视觉、IA、颜色、字体和组件 contract。
- `scripts/check-homepage-ia-contract.mjs` 约束首页 IA 顺序和稳定锚点。
- `scripts/check-editorial-redesign-contract.mjs` 约束字体 allowlist、DESIGN anchors 和 editorial structure。
- 修改 `index.html`、`assets/styles.css`、`scripts/modules/render*.js` 或 SVG rendering code 前必须读完 `DESIGN.md`。
- 触碰前端入口或本地 JS module graph 时必须 bump frontend asset cache version。

## 开发检查

推荐完整检查：

```bash
npm run check:all
```

常用分项：

```bash
npm run check:syntax
npm run check:dom
npm run check:homepage-ia-contract
npm run check:editorial-redesign-contract
npm run check:modules
npm run check:copy
npm run check:workflows
npm run check:docs
npm run check:data
```

`package.json` 是所有检查命令和 `check:all` 组成的权威来源。Pages deploy 的分步骤检查、Realtime / Daily workflow 审计和常见排查流程见 `docs/OPERATIONS.md`。

## GitHub Actions 速览

主要 workflow：

- `Build Realtime Market`：生成 realtime fallback payload 并发布到 `realtime-data` 分支。
- `Build Daily Radar Data`：读取 Daily 输入并生成 baseline 数据。
- `Deploy Static Site to Pages`：Daily 成功提交 `data/*.json` 后触发 Pages deploy。
- `Check Worker Health`：只读检查 Worker-first 主 endpoint 与 secondary endpoint。
- External AI manual / provider workflow families：仅按对应 reviewed phase 使用，artifact / provider / production write / frontend display 边界以 `AGENTS.md` 和 external-AI docs 为准。

Workflow 合约、runbook、rollback / no-rollback 判断、known warning baseline 和 operator notes 见 `docs/OPERATIONS.md`。

## 当前维护原则

- 单一目标、最小改动、可验证、可回滚。
- 不把 validation 推荐值直接当作主显示值。
- 不通过解析中文文案恢复结构化数据。
- 不削弱 fallback 闸门来掩盖旧 realtime 文件。
- 不在渲染层重算评分、决策状态或执行约束。
- 不让 External AI 输出影响 scoring、decision、execution 或 position。
- 不让 secondary diagnostics 覆盖或参与任何 `values.*` 主值。
- 不在没有明确任务时大规模重构或重写站点结构。
- 修改数据链路、决策契约或渲染结构时，必须运行对应检查。

## 文档入口

先读 `AGENTS.md` 的 Documentation Authority Index；它定义 Current Authority、Conditional Authority、Historical Background 和冲突解决规则。

常用入口：

- `DESIGN.md`：前端设计 contract。
- `AGENTS.md`：AI 开发守则、硬边界和文档权威索引。
- `docs/DATA_CONTRACT.md`：数据字段、Brent、Decision Output、Transmission Delta、Market Pricing 和 External AI production data contract。
- `docs/OPERATIONS.md`：运行排查、GitHub Actions、operator notes 和 validation baseline。
- `docs/SYSTEM_UPGRADE_PLAN.md`：升级路线、稳定基线和阶段记录。
- `docs/SIGNAL_INTAKE.md`：新信号纳入框架。
- `docs/WORLD_ORDER_STRESS.md`：World Order Stress Overlay scope。
- `workers/gfrr-realtime-worker/README.md`：Realtime Worker scope。
- `docs/CODE_DEAD_WEIGHT_REMOVAL_M36.md`：M-36 dead weight removal audit note。

按任务类型优先查阅：

- 前端视觉、IA、字体、颜色：`DESIGN.md`。
- 首页 section 顺序和锚点：`scripts/check-homepage-ia-contract.mjs`。
- Editorial redesign guard：`scripts/check-editorial-redesign-contract.mjs`。
- 数据字段、显示值和 validation：`docs/DATA_CONTRACT.md`。
- Realtime / Daily / Pages deploy 排查：`docs/OPERATIONS.md`。
- Worker runtime：`workers/gfrr-realtime-worker/README.md`。
- World Order Stress：`docs/WORLD_ORDER_STRESS.md`。
- External AI API / prompt / production integration：对应 `docs/EXTERNAL_AI_*.md` 条目，以 `AGENTS.md` Authority Index 为准。
- Market Pricing Temperature：对应 `docs/MARKET_PRICING_*.md` 条目，以 `AGENTS.md` Authority Index 为准。
- 新宏观信号：`docs/SIGNAL_INTAKE.md` 和 `docs/SYSTEM_UPGRADE_PLAN.md`。
- 检查命令：`package.json`。
- 历史背景：只在需要 audit context 时查阅，不覆盖 Current Authority。

README 只保留入口级说明。若 README 与 `AGENTS.md`、`DESIGN.md`、`package.json` 或 scoped docs 冲突，按 `AGENTS.md` 的冲突解决规则处理。

不要把 README 的简化摘要当作替代 contract；实现前仍需阅读对应权威文档。

## 关键文件

- `index.html`：静态页面入口。
- `assets/styles.css`：全站 CSS。
- `scripts/app.js`：前端应用入口。
- `scripts/modules/*.js`：前端渲染、数据选择和 UI helpers。
- `scripts/run-realtime.mjs`：realtime fallback 构建。
- `scripts/run-daily-pipeline.mjs`：Daily baseline 构建。
- `scripts/validate-data.mjs`：数据契约校验。
- `package.json`：检查命令权威来源。

## 版本标记

- 页面公开标签：`v28.0C`。
- 工程稳定观察基线：`v28.0J`。
- 当前 frontend asset cache version：`28.0M-42V`。
- 当前 runtime status：Node.js 24 LTS。
- 当前 M-series note：M-42 completes Fed liquidity triplet with WRESBAL reserve-buffer quantity evidence; M-40 已跳过且无 PR。
