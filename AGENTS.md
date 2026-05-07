# AGENTS.md — Global Financial Risk Radar AI 开发守则

本文档供 Cursor、Codex 和其他 AI 工具接手本项目时优先阅读。目标是保护当前 v28.0J 稳定观察基线，避免误改核心数据链路、Worker-first 主链路、解释层边界、决策契约和部署保护网。

## 1. 项目当前状态

当前项目处于 v28.0J 稳定观察基线。v28.0J-2B post-deploy audit 已通过；当前前端版本为 `28.0J-2`。Worker-first 已是当前主运行路径：`/market.worker-preview.json` 是主 realtime payload，`/market.secondary-preview.json` 是独立 secondary diagnostics endpoint。

维护重点是稳定性、可观测性、数据契约、Worker 隔离边界和小步改进。没有明确任务时，不应大规模重构，不应重写站点结构，不应把项目改成 demo 或简化版。

当前关键边界：

- Worker-first 主链路读取 `/market.worker-preview.json`，并由前端 strict gate 决定是否使用。
- serial trunk mode：所有任务基于 latest main，一次只推进一个逻辑任务，no stacked PR，旧 PR 不继续堆改。
- `/market.secondary-preview.json` 只承载独立 secondary diagnostics，当前包含 VIX via Cboe、Gold via Yahoo `GC=F`、DXY via Yahoo `DX-Y.NYB`、US10Y via Yahoo `^TNX` 与 SPX via Yahoo `^GSPC`；不得污染主 preview。
- 当前 core secondary set 为 `vix` / `gold` / `dxy` / `us10y` / `spx`。E-4 后应先观察 Worker health workflow 与 secondary freshness，暂停继续堆新 secondary source。
- Brent 主逻辑为 FRED `DCOILBRENTEU` anchor + Yahoo `BZ=F` fresh confirmation + Trading Economics confirmation + D-6 extreme-move guard。
- v28.0G-4A Trading Economics observedAt 仅为 audit-only；`tradingeconomics-observedAt-unparsed` 不得阻止 Brent promotion，Trading Economics freshness 不得在未另开 G-4B 前进入 hard gate。
- v28.0G-4B decision 建议另开 G-4C 实现 Trading Economics freshness hard gate；G-4B does not change runtime behavior。G-4C 才能引入 `tradingeconomics-observedAt-invalid` / `tradingeconomics-confirmation-stale` hard hold reason；旧 PR #53 已 superseded，不得 merge 或 cherry-pick。
- v28.0G-4C 已实现 Trading Economics freshness hard gate；Brent promotion 需要 Yahoo fresh + TE observedAt fresh。TE observedAt 不可解析或超过 48 小时应 hold promotion，但 observedAt failure does not make candidate ok false；hard hold 只在 promotion decision 层处理，D-6 confirmed-extreme-move 也要求 TE freshness fresh。
- v28.0G-6 Operations Runbook / Decision Matrix 是运维判断入口；看 `docs/OPERATIONS.md`。PR #53 superseded；KV write guard deferred，先观察，不在未另开版本时加入复杂 runtime guard。
- v28.0G-7A 只增强 `Check Worker Health` 只读输出，生成 `worker-health-snapshot` artifact；不得把 snapshot 当作网站输入，不得写 KV 或 data/realtime，不得改变 Worker Health fail 边界。
- v28.0G-7B 新增本地只读 `review:worker-health-snapshot` helper，用于审阅下载后的 snapshot 并输出 PASS / WARN / FAIL；不得让它访问网络、写 KV、写 data/realtime 或替代 scheduled hard gate。
- v28.0J-2 Frontend Asset Cache Busting 用 `?v=28.0J-2` 刷新 `index.html` 入口与前端 ES module graph，解决 Android Chrome cached old module graph 让普通窗口继续显示 Actions/FRED 旧逻辑的问题；`window.__GFRR_FRONTEND_VERSION__` 应返回 `28.0J-2`。无痕窗口正常代表 Worker-first runtime 正常；不改 Worker runtime、数据源、KV，也不 deploy Worker。
- v28.0G-9B Frontend Asset Version Bump Helper 新增 `node scripts/bump-frontend-asset-version.mjs 28.0G-10` / `npm run bump:frontend-asset-version -- 28.0G-10`，用于统一替换前端 asset cache version。当前正式版本仍是 `28.0J-2`；工具不访问网络、不写 KV、不写 data/realtime、不 deploy Worker。
- v28.0G-10 Data Check Expected-Skip Noise Cleanup：默认 `npm run check:data` 不再为 local realtime / `dailyRealtimeInput` 时间不一致输出 warning；这是 expected skip，因为 Worker-first runtime 是主链路，本地 realtime 属于 fallback / Daily baseline，可能不是同一快照。需要原因用 `npm run check:data:verbose`，需要强制失败用 `npm run check:data:strict-live-alignment`。不得误解为删除 `validateRealtimeBaselineAlignment`。
- v28.0H-1 / H-2 World Order Stress Overlay 是 regime overlay / 结构性状态修正器，不是第七个底层风险模块。用户可见文案必须克制：不得预测战争，不得输出战争概率，不得把结构性压力写成确定性事件；H-2 前端只读展示 `data/world-order-stress.json`，不直接调用外部 API，不接 `decisionModel`，不改 Worker runtime。
- v28.0H-2B World Order marketConfirmation 输入优先级为 Worker-generated preview → local realtime → Daily baseline，并必须在 `data/world-order-stress.json.marketConfirmationInput` 记录来源、时间、关键市场值和 fallback reason；前端仍只读最终 JSON。
- v28.0I 后，任何新增解释层 / 新信号 / 新数据源必须先检查 `docs/SYSTEM_UPGRADE_PLAN.md` 中的 v28.0I stable baseline 边界。
- `dailyBrief`、`divergenceLayer`、`macroDrivers.consumer`、`consumer_vs_asset_pricing` 与 `brentPricingLayer` 均为解释层 / 审计层 / 展示层；不得直接接入 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- v28.0J 后，`aiInterpretationLayer` 不得被改成外部 AI 输出，除非另开版本并新增 API / output audit contract。当前 `generatedByExternalAi=false`、`usesExternalAiApi=false`，不调用 DeepSeek / OpenAI / 外部 AI API。
- 不得让 AI 输出直接影响 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
- 任何 DeepSeek / OpenAI 接入必须从设计文档和审计 contract 开始，并先定义 timeout、fallback、source attribution 与禁用文案检查。
- 任何 DeepSeek / OpenAI / external AI API implementation 必须先阅读 `docs/EXTERNAL_AI_API_DESIGN.md`；external AI output 不得直接影响 scoring / decision / execution / position，未来也必须作为单独 layer 设计，不得覆盖当前 rule-based `aiInterpretationLayer`。
- v28.0K-1 的 `docs/fixtures/external-ai/*.json` 只允许作为 offline/manual prompt design samples；未来 external AI implementation 不得把这些 fixtures 当作 production data，不得导入 runtime。
- v28.0K-2 新增 `npm run check:external-ai-output` 离线 validator；未来 external AI output 不得绕过该 validator 进入展示路径，validator 不调用外部 API、不导入 runtime。
- v28.0I compact cockpit layout 不得被后续改动破坏，除非另开版本评审；Global Risk Heatmap 必须继续独立显示，World Order Stress Overlay 仍是独立 regime overlay，不是第七个底层风险模块。
- World Order 外部源失败必须降级 status / confidence，而不是清空旧可用缓存；GDELT partial / stale / error 必须可解释，不得伪装成功或输出 NaN / undefined。
- World Order UI 必须清楚显示低置信 / 数据限制，不得把 proxy、stale、manual_required 或 not_configured 数据包装成高确定性结论。
- World Order 用户可见 UI 文案必须中文化；source attribution 不得误导，多源 evidence 应尽量显示清楚来源组合。
- SIPRI normalized example/template 数据不得当作真实宏观数据参与 scoring；只有 `quality.isRealData=true` 的真实手动标准化文件才能让 SIPRI 进入 `ok`。
- World Order 外部数据刷新应先手动观察，再考虑 scheduled workflow；不要把 `build:world-order` 加入 `check:all`，H-4 的 `review:world-order` 只是本地只读人工审阅 helper。
- World Order 新外部源不得直接进入 scoring；必须先通过 diagnosis / source review，再另开版本接入。
- ReliefWeb 或任何新外部源不得直接进入 scoring；必须先通过 diagnosis / review，再另开 integration version。
- 修改 World Order Stress schema / scoring / data product 时，必须确保 `npm run check:world-order` 和 `npm run check:all` 通过；`check:all` 只检查现有 JSON，不应默认运行 `build:world-order`。
- frontend asset cache version must be bumped when index.html or frontend JS changes：以后修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js`，必须同步 bump 入口脚本和所有本地 JS module import query。只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json` 或只 deploy Worker 不需要 bump；Worker runtime 改动不需要 bump frontend asset version，除非同时改前端 HTML / JS。
- Worker runtime 改动流程：Cursor 实现 → 本地 checks → 提交 / push → deploy preflight → `wrangler deploy` → live validation → 观察 1-2 轮 scheduled Check Worker Health。文档 / check 脚本改动通常不需要 deploy。
- KV write guard deferred：只有持续 >800 writes/day、90% warning 或 429 时，才考虑 cron 调整、paid plan 或另开版本设计 guard。
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
- `docs/SYSTEM_UPGRADE_PLAN.md` 与 `docs/SIGNAL_INTAKE.md`：后续新增宏观指标、背离指标、新数据源或解释层前必须先读；新信号默认不得直接进入 scoring / decision，默认先 audit-only / diagnostic-only / display-only。
- `docs/EXTERNAL_AI_API_DESIGN.md`：未来 DeepSeek / OpenAI / external AI API 接入前必须先读；定义 external AI output audit、fallback、source attribution、禁用文案和 display-only 边界。
- `docs/EXTERNAL_AI_PROMPT_CONTRACT.md`：未来外部 AI prompt contract 与 sample fixtures 入口；`docs/fixtures/external-ai/*.json` 不得导入 runtime，不得作为生产数据。
- `scripts/check-external-ai-output.mjs`：离线检查 external AI sample/future output artifacts；不得把它改成 API caller、runtime dependency 或 production data writer。

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
- `check:data`：等价于 `node scripts/validate-data.mjs`，检查数据契约；local realtime / Daily baseline alignment 的 expected skip 默认静默。
- `check:data:verbose`：输出 expected skip reason。
- `check:data:strict-live-alignment`：把本地 realtime 与 `dailyRealtimeInput` 非同一快照视为失败。

v28.0G-10 起，如果本地 realtime 与 `dailyRealtimeInput.updatedAt` 不匹配，默认 `check:data` 会静默跳过 live alignment 并继续其它检查；`Validation passed (v27.0)` 表示数据契约通过。

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
