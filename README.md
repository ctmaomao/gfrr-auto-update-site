# Global Financial Risk Radar

Global Financial Risk Radar 是一个静态部署的宏观风险驾驶舱。它把 realtime 快变量、Daily baseline、六大风险模块、解释层和运维检查组织成可审计的网站,用于观察宏观风险状态和策略约束。

在线访问: <https://ctmaomao.github.io/gfrr-auto-update-site/>

## 核心定位

本项目回答:

- 当前宏观风险处于什么状态。
- 当前应偏进攻、均衡、谨慎还是防守。
- 当前仓位区间、现金缓冲和风险预算应如何约束。
- 哪些风险触发条件、缓和条件或数据缺口需要关注。

它不是选股工具、短线交易信号系统,也不是外部 AI 自动决策系统。

## 当前快照

| 项 | 当前值 |
|---|---|
| 公开页面标签 | `v28.0C` |
| 稳定观察基线 | `v28.0J` |
| 前端资源版本 | `28.0M-87V` |
| 主 runtime | Worker-first `/market.worker-preview.json` |
| secondary diagnostics | `/market.secondary-preview.json` only |
| Node.js | 24 LTS |
| 完整检查 | `npm run check:all` |

当前 M-series 摘要: M-87 补上 null-to-zero display guards,防止缺失源被渲染成 `0.00` 或 `+0.0bp`;M-86 已把 Macro Overview 中的 live public proxy coverage 与 formal / non-public source boundary notes 分开;M-85 已把 EIA Europe Brent Spot Price FOB public HTML proxy 接入 `brentPricingLayer.eiaBrentSpotProxy`,但不改变 `values.brent`、Brent promotion、scoring、decision、execution 或 position。

## 运行结构

- Worker-first 是主链路;前端通过 strict gate 选择 `/market.worker-preview.json`。
- `realtime-data` 分支和本地 `realtime/market.json` 仅作为 fallback / Daily baseline 输入观察。
- Daily pipeline 写入 `data/radar-data.json`、`data/radar-history.json` 和 `data/radar-history-full.json`。
- `displayInputsBaseline` 是 baseline fallback 的结构化当前值来源。
- 前端最终当前值由 `effectiveDisplayInputs` 合成;渲染层不得绕过它直接使用 raw realtime values。
- `/market.secondary-preview.json` 只承载 core secondary set: `vix` / `gold` / `dxy` / `us10y` / `spx` secondary diagnostics,不得污染主 preview 或覆盖 `values.*`。

## Runtime Guard Markers

- v28.0G-4C Trading Economics freshness hard gate 已上线;`tradingeconomics-observedAt-invalid` 和 `tradingeconomics-confirmation-stale` 会 hold Brent promotion。
- `observedAt failure does not make candidate ok false`;hard hold 只在 promotion decision 层处理。
- `worker-health-snapshot` artifact 与 `review:worker-health-snapshot` helper 均为只读审阅路径,不得替代 scheduled hard gate 或写 KV / data / realtime。

## 数据边界

- Brent 主逻辑仍为 FRED anchor + Yahoo fresh confirmation + Trading Economics freshness gate + extreme-move guard。
- Public proxy 只能写成 public proxy,不得写成 Platts Dated Brent、formal Dated Brent、official ICE settlement、private credit marks、non-public CRE loan tape 或 BoA raw card feed。
- `dailyBrief`、`divergenceLayer`、`macroDrivers.*`、`consumer_vs_asset_pricing`、`brentPricingLayer` 和 `aiInterpretationLayer` 是解释层 / 审计层 / 展示层。
- 解释层不得进入 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- External AI 仍受 staged workflow 和 artifact review 约束;任何 AI 输出不得影响 scoring、decision、execution 或 position。
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

`package.json` 是所有检查命令和 `check:all` 组成的权威来源。`check:data` 默认静默处理 Worker-first runtime 与 fallback / Daily baseline 的 expected skip;需要原因用 `check:data:verbose`,需要强制对齐用 `check:data:strict-live-alignment`。

## 前端资源版本

Frontend Asset Cache Busting 用于处理 Android Chrome cached old module graph。修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js` 时,frontend asset cache version must be bumped when index.html or frontend JS changes。

当前版本标记为 `v28.0M-87V`,前端入口也有 `__GFRR_FRONTEND_VERSION__`。Frontend Asset Version Bump Helper:

```bash
npm run bump:frontend-asset-version -- 28.0M-87V
node scripts/bump-frontend-asset-version.mjs 28.0M-87V
```

只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` 或 `realtime/*.json` 时,通常不需要 bump 前端资源版本。

## 运维入口

- Operations Runbook: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- PR #53 superseded;不要 merge 或 cherry-pick 旧 G-4C 替代实现。
- KV write guard deferred;只有持续写入压力或 KV 限流迹象出现时再另开版本设计。
- Worker health checks 是只读监控,不得写 KV、写数据产物或触发 deploy。
- Pages deploy、workflow trigger coverage、known warning baseline 和 rollback / no-rollback 判断以 Operations Runbook 为准。

## 文档地图

- [AGENTS.md](AGENTS.md): AI 开发守则、硬边界、当前项目状态。
- [CLAUDE.md](CLAUDE.md): AI 启动导航和 L0/L1/L2 读取顺序。
- [DESIGN.md](DESIGN.md): 前端设计 contract;改 HTML/CSS/渲染模块前必须读。
- [docs/INDEX.md](docs/INDEX.md): 文档权威分级索引。
- [docs/MILESTONE_INDEX.md](docs/MILESTONE_INDEX.md): M-series / v-series 当前与历史索引。
- [docs/PROJECT_BACKLOG.md](docs/PROJECT_BACKLOG.md): 当前 backlog、开放问题和维护约定。
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): 数据源边界。
- [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md): 数据字段和 contract。
- [docs/ADR/README.md](docs/ADR/README.md): 架构决策索引。
- [workers/gfrr-realtime-worker/README.md](workers/gfrr-realtime-worker/README.md): Realtime Worker scope。

README 只保留入口级说明。若 README 与 `AGENTS.md`、`DESIGN.md`、`package.json` 或 scoped docs 冲突,按 [docs/INDEX.md](docs/INDEX.md) 的冲突解决规则处理。
