# Global Financial Risk Radar

Global Financial Risk Radar 是一个静态部署的宏观风险驾驶舱。它把 realtime 快变量、Daily baseline、风险模块、解释层和运维检查组织成可审计的网站,用于观察宏观风险状态和策略约束。

在线访问:

- <https://ctmaomao.github.io/gfrr-auto-update-site/>
- <https://radar.gfrfinradar.uk/>
- AI 泡沫监测: <https://ctmaomao.github.io/gfrr-auto-update-site/bubble-watch.html>

## 核心定位

本项目回答:

- 当前宏观风险处于什么状态。
- 当前应偏进攻、均衡、谨慎还是防守。
- 当前仓位区间、现金缓冲和风险预算应如何约束。
- 哪些风险触发条件、缓和条件或数据缺口需要关注。

它不是选股工具、短线交易信号系统,也不是外部 AI 自动决策系统。

## 运行结构

- 首页由 `scripts/app.js` 读取 `data/radar-data.json` 静态快照，主数据就绪先呈现，附属 JSON 独立降级；不在浏览器重算主分或决策。
- Daily 从 `realtime-data` 分支读取输入，写入 radar 数据与历史；`displayInputsBaseline` 保留结构化基线值。
- Worker 独立生成 `/market.worker-preview.json`；它是 Worker 运行链的主预览，不是当前首页的直接数据入口。
- `scripts/modules/realtime.js` 保留为冻结的历史 overlay 路径，当前未接入；重新接入须单独评审。
- `/market.secondary-preview.json` 仅提供独立诊断，不覆盖主 preview 或 `values.*`。

## 数据边界

- Brent 主逻辑仍为 FRED anchor + Yahoo fresh confirmation + Trading Economics freshness gate + extreme-move guard。
- Public proxy 只能写成 public proxy,不得写成 Platts Dated Brent、formal Dated Brent、official ICE settlement、private credit marks、non-public CRE loan tape 或 BoA raw card feed。
- `dailyBrief`、`divergenceLayer`、`macroDrivers.*`、`consumer_vs_asset_pricing`、`brentPricingLayer` 和 `aiInterpretationLayer` 是解释层 / 审计层 / 展示层。
- 解释层不得进入 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 首页唯一可见外部 AI 为嵌入 `MACRO RISK OVERVIEW` 的 `macroRiskEditorialLayer`，由 DeepSeek 综合近 7 日可信新闻与站内结构化数据生成并受 validator/review/freshness gate 约束；旧 `externalAiInterpretationLayer` 仅保留数据兼容、无可见消费者。任何 AI 输出不得影响 scoring、decision、execution 或 position。
- Bubble Watch 的 DeepSeek 周度编辑层只解释既有 Core-23 / Shadow-4 与经校验新闻；provider/review/stale 失败时回退确定性判读，不改变任何灯色、分数或 verdict。
- World Order Stress Overlay 是 regime overlay,不是第七个底层风险模块;用户可见文案必须保持克制和可归因。

## 本地使用

使用 Node `>=24.20.0 <25`；在选定项目工作区执行 `npm ci` 安装锁定的开发依赖。

| 任务 | 入口 | 范围 |
|---|---|---|
| 日常修改后验证 | `npm run check:changed` | 自动选择文档或完整检查 |
| 完整提交/发布保护检查 | `npm run check:all` | 对生产数据只读，但生成 ignored analyst input |
| 单元行为与指定模块覆盖率 | `npm run test:unit:coverage` | 不是全仓覆盖率 |
| 桌面/手机浏览器验收 | `npm run test:e2e` | 生成本地 `_site` 和测试结果；首次先安装锁定 Chromium |
| 查看当前数据契约 | `npm run check:data` | 不刷新数据；expected skip 解释用 `check:data:verbose` |
| 查看全部可用脚本 | `npm run` | 完整定义以 [package.json](package.json) 为准 |

源刷新、手工样本、付费 AI、发布和历史诊断属于专项操作，按 [OPERATIONS](docs/OPERATIONS.md) 对应章节及 [AGENTS](AGENTS.md) 的授权边界执行。日常操作无需遍历全部历史脚本。

## 文档地图

- [AGENTS.md](AGENTS.md): AI 开发守则、硬边界、当前项目状态。
- [CLAUDE.md](CLAUDE.md): AI 启动导航和 L0/L1/L2 读取顺序。
- [DESIGN.md](DESIGN.md): 前端设计 contract;改 HTML/CSS/渲染模块前必须读。
- [docs/INDEX.md](docs/INDEX.md): 文档权威分级索引。
- [docs/OPERATIONS.md](docs/OPERATIONS.md): 运行排查、workflow、Pages deploy、known warnings。
- [docs/MILESTONE_INDEX.md](docs/MILESTONE_INDEX.md): M-series / v-series 当前与历史索引。
- [docs/PROJECT_BACKLOG.md](docs/PROJECT_BACKLOG.md): 当前 backlog、开放问题和维护约定。
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): 数据源边界。
- [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md): 数据字段和 contract。
- [docs/ADR/README.md](docs/ADR/README.md): 架构决策索引。

README 只保留入口级说明。若 README 与 `AGENTS.md`、`DESIGN.md`、`package.json` 或 scoped docs 冲突,按 [docs/INDEX.md](docs/INDEX.md) 的冲突解决规则处理。
