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

- Worker-first 是主链路;前端通过 strict gate 选择 `/market.worker-preview.json`。
- `realtime-data` 分支和本地 `realtime/market.json` 仅作为 fallback / Daily baseline 输入观察。
- Daily pipeline 写入 `data/radar-data.json`、`data/radar-history.json` 和 `data/radar-history-full.json`。
- `displayInputsBaseline` 是 baseline fallback 的结构化当前值来源。
- 前端最终当前值由运行时 `data.__effectiveDisplayInputs` 合成;渲染层不得绕过它直接使用 raw realtime values。
- `/market.secondary-preview.json` 是独立 secondary diagnostics endpoint,不得污染主 preview 或覆盖 `values.*`。

## 数据边界

- Brent 主逻辑仍为 FRED anchor + Yahoo fresh confirmation + Trading Economics freshness gate + extreme-move guard。
- Public proxy 只能写成 public proxy,不得写成 Platts Dated Brent、formal Dated Brent、official ICE settlement、private credit marks、non-public CRE loan tape 或 BoA raw card feed。
- `dailyBrief`、`divergenceLayer`、`macroDrivers.*`、`consumer_vs_asset_pricing`、`brentPricingLayer` 和 `aiInterpretationLayer` 是解释层 / 审计层 / 展示层。
- 解释层不得进入 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 首页唯一可见外部 AI 为嵌入 `MACRO RISK OVERVIEW` 的 `macroRiskEditorialLayer`，由 DeepSeek 综合近 7 日可信新闻与站内结构化数据生成并受 validator/review/freshness gate 约束；旧 `externalAiInterpretationLayer` 仅保留数据兼容、无可见消费者。任何 AI 输出不得影响 scoring、decision、execution 或 position。
- Bubble Watch 的 DeepSeek 周度编辑层只解释既有 Core-23 / Shadow-4 与经校验新闻；provider/review/stale 失败时回退确定性判读，不改变任何灯色、分数或 verdict。
- World Order Stress Overlay 是 regime overlay,不是第七个底层风险模块;用户可见文案必须保持克制和可归因。

## 本地使用

```bash
npm install
npm run check:all
```

常用定向检查:

```bash
npm run check:docs
npm run check:data
npm run check:data:verbose
npm run check:data:strict-live-alignment
npm run check:workflows
```

`package.json` 是所有检查命令和 `check:all` 组成的权威来源。运维细节、发布状态、milestone 历史和版本维护规则不放在 README,请进入下方文档。

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
