# AGENTS.md — Global Financial Risk Radar AI 开发守则

本文档供 Cursor、Codex 和其他 AI 工具接手本项目时优先阅读。目标是保护当前 v28.0E 工程阶段基线，避免误改核心数据链路、Worker-first 主链路、决策契约和部署保护网。

## 1. 项目当前状态

当前项目处于 v28.0E 工程阶段。Worker-first 已是当前主运行路径：`/market.worker-preview.json` 是主 realtime payload，`/market.secondary-preview.json` 是独立 secondary diagnostics endpoint。

维护重点是稳定性、可观测性、数据契约、Worker 隔离边界和小步改进。没有明确任务时，不应大规模重构，不应重写站点结构，不应把项目改成 demo 或简化版。

当前关键边界：

- Worker-first 主链路读取 `/market.worker-preview.json`，并由前端 strict gate 决定是否使用。
- `/market.secondary-preview.json` 只承载独立 secondary diagnostics，当前包含 VIX via Cboe、Gold via Yahoo `GC=F`、DXY via Yahoo `DX-Y.NYB`、US10Y via Yahoo `^TNX` 与 SPX via Yahoo `^GSPC`；不得污染主 preview。
- 当前 core secondary set 为 `vix` / `gold` / `dxy` / `us10y` / `spx`。E-4 后应先观察 Worker health workflow 与 secondary freshness，暂停继续堆新 secondary source。
- Brent 主逻辑为 FRED `DCOILBRENTEU` anchor + Yahoo `BZ=F` fresh confirmation + Trading Economics confirmation + D-6 extreme-move guard。
- v28.0G-4A Trading Economics observedAt 仅为 audit-only；`tradingeconomics-observedAt-unparsed` 不得阻止 Brent promotion，Trading Economics freshness 不得在未另开 G-4B 前进入 hard gate。
- v28.0G-4B decision 建议另开 G-4C 实现 Trading Economics freshness hard gate；G-4B does not change runtime behavior。G-4C 才能引入 `tradingeconomics-observedAt-invalid` / `tradingeconomics-confirmation-stale` hard hold reason；旧 PR #53 已 superseded，不得 merge 或 cherry-pick。
- Google Finance / Stooq 只保留 D-8B-lite sourceProbe；D-8B findings 已确认当前不可升级为 validation source，除非另开版本连续验证。
- VIX / Gold / DXY / US10Y / SPX secondary 当前只用于诊断，不影响 `values.*`、scoring、decision、healthScore、criticalMissing 或 unavailable。
- Worker fetch timeout guard 已上线；后续新增外部源必须继承短超时、try/catch、diagnostics-only 和失败隔离原则。
- Daily vs Worker Input Audit 只是 Summary 审计；Daily 仍消费 `origin/realtime-data:realtime/market.json`，不得在未另开版本评审时切到 Worker 作为 Daily 输入。
- Worker-first Health Check 是只读监控；不得把健康检查脚本改成写 KV、写数据产物或触发 deploy。
- Check Realtime Health 是 `realtime-data` fallback / Daily baseline freshness observer；stale / unavailable 只应 warning 与输出 `shouldRecover`，Worker-first runtime hard fail 由 Check Worker Health 承担。
- v28.0G-3 只优化 health workflow Summary 文案；不得借此改变 fail 边界、workflow 触发、Worker runtime、前端或数据产物。
- v28.0G-1 secondary freshness audit 只在 `check-worker-health` 中派生 `freshnessStatus` / `observedAgeHours` / `freshnessReason`；不得把这些字段当作 Worker payload contract，也不得让 stale warning 直接阻断 workflow。
- HY OAS、real10y、credit spread proxy、liquidity proxy 和其它 macro stress indicators 都是 future candidates；不得直接进主链路，必须另开版本并先作为 isolated secondary diagnostic 观察。

每次任务应尽量做到：

- 单一目标。
- 最小改动。
- 可验证。
- 可回滚。

必须保留完整项目结构和现有主要模块，包括 realtime、health、decision、action queue、trigger monitor、invalidation rules、heatmap 和六大风险模块。

## 2. AI 工具必须先读的文档

- `README.md`：项目入口和当前运行方式概览。README 不应塞入过细字段细节。
- `docs/V27_BASELINE.md`：历史 v27.x 稳定化基线。做架构或功能判断前可作为背景阅读，但当前运行边界以 README、DATA_CONTRACT 与 OPERATIONS 的 v28.0E 状态为准。
- `docs/DATA_CONTRACT.md`：数据字段、显示值、Brent validation、Decision Output、Transmission Delta 等契约。改数据字段或显示值前，先读此文档。
- `docs/OPERATIONS.md`：运行排查手册。排查 realtime stale、Daily、Brent、Transmission Delta、Pages deploy 等问题前，先读此文档。

## 3. 严格禁止的高风险行为

1. 不要把 `brentValidation.consensus.recommendedValue` 直接改成 Brent 主值。
2. 不要放松 local fallback 安全闸门。
3. 不要绕过 `effectiveDisplayInputs` 直接使用 raw realtime values。
4. 不要在 render 层重新推导 `executionLock` / `positionGuidance`。
5. 不要为了让检查通过而削弱 `validate-data.mjs`。
6. 不要随意提交 `data/*.json` 或 `realtime/*.json` 作为临时修复。
7. 不要大规模重写 `scripts/run-daily-pipeline.mjs`、`scripts/run-realtime.mjs`、`scripts/modules/decision.js`。
8. 不要修改内部字段名：`dxy`、`rt-dxy`、`values.dxy`、`displayInputsBaseline.dxy`。
9. 不要把用户可见文案改回：`十亿美元`、`美元指数`、`广义美元`、`Δ --`。
10. `scripts/app.js` 是高风险核心文件；如果修改它，最终必须通过 `node --check scripts/app.js`。
11. 不要只交 diff 或让用户手动合并冲突；必须直接修改真实仓库文件。
12. 不要在未被要求时改变数据结构。
13. 不要把 `secondarySources` / `secondaryDiagnostics` / `secondarySourceSummary` 混入 `/market.worker-preview.json`。
14. 不要让 VIX / Gold / DXY / US10Y / SPX secondary 覆盖或参与任何 `values.*` 主值。
15. 不要让 Google Finance / Stooq sourceProbe 进入 Brent consensus / promotion。
16. 不要新增外部源却不加短超时、try/catch 和 diagnostics-only 失败隔离。
17. 不要把 Daily workflow 的主输入从 `realtime-data` 改成 Worker endpoint；Daily vs Worker drift 只能作为 audit-only 信息。
18. 不要让 Worker health check 修改 Worker runtime、payload contract、KV、data/realtime 产物或前端 fallback 逻辑。
19. 不要把 Check Realtime Health 恢复成 Worker-first runtime hard gate；`realtime-data` stale 不应阻断主运行链路监控。

## 4. 默认开发流程

每个任务按以下流程执行：

1. 理解任务边界。
2. 只修改允许范围内文件。
3. 不顺手改无关文件。
4. 运行必要检查。
5. 报告实际修改文件和检查结果。
6. 等待人工确认后再提交。

不要把“检查命令”和“提交命令”混在同一轮要求里。如果检查失败，应先进入修复流程，不要继续提交。代码改动和 JSON 产物改动必须区分；运行 daily / realtime 生成脚本后，要确认是否产生 JSON 产物，除非任务明确要求，否则恢复 JSON 产物。

## 5. 当前完整检查命令

推荐完整检查：

```bash
npm run check:all
```

当前顺序：

```text
check:syntax → check:dom → check:modules → check:copy → check:workflows → check:docs → check:data
```

含义：

- `check:syntax`：自动扫描 `scripts/` 下 `.js / .mjs` 并执行语法检查。
- `check:dom`：检查关键 DOM 挂载点。
- `check:modules`：自动扫描 `scripts/modules/*.js` 并动态 import。
- `check:copy`：检查用户可见文案契约。
- `check:workflows`：检查 GitHub Actions workflow 合约。
- `check:docs`：检查 `README.md`、`AGENTS.md` 和 `docs/*.md` 中的本地 Markdown 链接；跳过 `http / https / mailto / 纯锚点`。
- `check:data`：等价于 `node scripts/validate-data.mjs`，检查数据契约。

如果 `check:data` 输出本地 realtime 与 `dailyRealtimeInput.updatedAt` 不匹配的 warning，但最终显示 `Validation passed (v27.0)`，属于可接受状态。

## 6. 不同类型任务的检查要求

| 任务类型 | 必须运行 |
|---|---|
| 只改 README / AGENTS / docs | `npm run check:docs` 和 `npm run check:all` |
| 改 HTML | `npm run check:dom` 和 `npm run check:all` |
| 改 JS / MJS | `npm run check:all` |
| 改 workflow | `npm run check:workflows` 和 `npm run check:all` |
| 改用户可见文案 | `npm run check:copy` 和 `npm run check:all` |
| 改数据契约 / validate | `npm run check:data` 和 `npm run check:all` |
| 运行 daily / realtime 生成脚本 | 必须确认是否产生 JSON 产物；除非任务明确要求，否则恢复 JSON 产物 |

## 7. 用户可见文案规则

`dxy` 用户可见名称必须是：

```text
广义美元指数
```

ON RRP 用户可见单位必须是：

```text
亿美元
```

传导网络 delta 不可显示：

```text
Δ --
```

应显示：

```text
Δ +n / Δ -n / Δ 0
```

或：

```text
趋势待累计
```

## 8. 工作流与部署保护

Pages deploy 当前分步骤运行：

```text
check:syntax
check:dom
check:modules
check:copy
check:workflows
check:docs
check:data
```

不要误写成 Pages deploy 直接运行 `check:all`。分步骤运行用于快速判断失败类型。

Realtime / Daily workflow 也有 GitHub Actions Summary，用于人工审计 realtime 输出、Daily baseline、Decision Summary 和 Transmission Delta Summary。

## 9. 推荐输出格式

AI 完成任务后只输出：

1. 实际修改了哪些文件。
2. 做了什么改动。
3. 明确没有修改哪些高风险内容。
4. 运行了哪些检查。
5. 检查是否通过。
6. 如有 warning，说明是否可接受。
7. 不输出整文件源码。
8. 不输出 patch / diff。