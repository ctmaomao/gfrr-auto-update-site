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
- v28.0K-3A / 3B 后，live `externalAiInterpretationLayer` 只是 disabled scaffold，必须保持 disabled，直到另一个经过评审的版本明确启用 API；不得把它显示成 active external AI，不得替换 `aiInterpretationLayer`。
- v28.0K-3D Stable Observation Audit 是只读 gate；不得用它 auto-fix、auto-commit、auto-push、deploy 或触发 recovery。PASS 可允许规划 v28.0K-4，FAIL 阻止 v28.0K-4。
- v28.0K-4A 后，任何 external AI API calls implementation 必须先阅读 `docs/EXTERNAL_AI_MANUAL_TEST_DESIGN.md`；manual API test 必须 opt-in、validator-gated，并与 production data / scoring / decision / execution / position 隔离。
- v28.0K-4B 的 `scripts/run-external-ai-manual-test.mjs` 必须保持 no-network dry-run scaffold；不得在未另开 K-4C reviewed PR 前加入 provider calls，不得读取 API keys。
- v28.0K-4C 的 `scripts/external-ai/provider-adapters.mjs` 只是 disabled provider skeleton；不得把它改成真实 provider call，不得读取 API keys。任何真实 DeepSeek / OpenAI provider call 必须另开 reviewed PR。
- v28.0K-4D 的 DeepSeek manual artifact test 只能在用户明确要求且提供 `DEEPSEEK_API_KEY` 环境变量时运行；不得打印 API key，不得提交 `manual-artifacts/` 或其中的 output artifact，不得把 artifact 提升为生产数据或前端展示，除非另开 reviewed PR 且 validator 通过。
- v28.0K-4E 的 manual input artifact 只能作为 ignored `manual-artifacts/` 手动输入；不得提交，不得当作 production data，不得复制进 `data/radar-data.json`，不得从 Daily、workflow 或自动流程触发 DeepSeek。
- v28.0K-4E-1 后，paid DeepSeek live-data manual test 前应优先使用 compact input；若出现 timeout / aborted failure，不得反复重试，应先审阅 failure artifact 的 `requestDiagnostics`。
- v28.0K-4E-2 后，不得通过削弱 unsafe wording validator 来让 external AI artifact 通过；unsafe wording 必须从所有 external AI output text fields 中排除，而不只是 `auditFlags`。
- v28.0K-4E-3 后，live/local `radar-data.json` manual input 必须按站内结构化数据归因，不得写成 sample input；external AI output 不得复述具体 execution / position / exposure / cash buffer 字段。
- v28.0K-4E-4 后，manual DeepSeek failure artifact 的 `provider_unavailable` 或 `provider_timeout` 不得反复付费重试；先审阅 `failureClassification` / diagnostics。failure artifact 不得进入 output promotion logic，也不得通过削弱 validator 让 failure artifact 通过。
- v28.0K-4F 后，`check:external-ai-output` 通过不等于可晋升；还必须运行 `npm run review:external-ai-artifact`。不得晋升 provider failure artifact，不得晋升包含 execution / position language 的输出；`promotionEligible` 必须保持 false，直到另开 reviewed integration PR。
- v28.0K-4G 后，任何 external AI work 前必须先读 `docs/EXTERNAL_AI_MANUAL_TEST_DESIGN.md`、`docs/EXTERNAL_AI_PROMPT_CONTRACT.md`、`docs/EXTERNAL_AI_API_DESIGN.md`、`docs/DATA_CONTRACT.md` 与 `docs/OPERATIONS.md`。不得 promotion manual artifacts，不得把 DeepSeek 接入 Daily 或 frontend，除非另开 reviewed design PR；不得削弱 validator / quality review gate；`provider_unavailable` / `provider_timeout` 后不得反复付费重试；`promotionEligible` 必须保持 false，直到独立 integration PR 明确改变。
- v28.0L-0 后，任何 external AI production implementation 前必须先读 `docs/EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`。不得跳过 staged rollout；不得在 design PR 中加入 secrets / workflows / provider calls；不得未经 separate reviewed PR 就让 external AI 前端可见；external AI 仍不得影响 scoring / decision / execution / position。
- v28.0L-1 后，readiness status 是 `partially_ready_for_disabled_skeleton_only`，不是 production-ready。不得跳过 L-2；不得在 L-1 或 L-2 实现 workflow / provider call / frontend；不得在 reviewed workflow_dispatch 阶段前添加 GitHub secret；不得通过 readiness docs 让 external AI production-visible。
- v28.0L-2 skeleton 必须保持 disabled；不得把它改成读取 env vars、调用 provider、连接 Daily / frontend，或让 `maybeCreateExternalAiProductionLayer` 激活 provider。未来 activation 必须另开 L-3+ reviewed PR。
- v28.0L-3 是 workflow design only；不得在 L-3 添加 workflow / provider call / secrets。第一个 workflow implementation 必须是 dry-run-only 且 no-secret / no-provider；不得从 L-3 直接跳到 provider-call workflow 或 Daily。Workflow artifacts 不是 production data，绝不得上传 secrets 或 raw provider headers。
- v28.0L-3B dry-run workflow 必须保持 dry-run-only；不得加入 provider call、provider input、allow_network input、dry_run=false path、secret reference 或 provider output upload。不得把该 workflow 改成 production workflow；任何 provider-call workflow 必须另开 reviewed L-3C PR。
- v28.0L-3C 是 provider-call workflow design only；不得把 L-3C design 改成 implementation，不得添加 secrets、provider-call workflow、workflow secret reference、SDKs、dependencies 或真实 DeepSeek call。不得修改 L-3B dry-run workflow 让它调用 provider，除非另开 reviewed implementation PR。未来 provider-call artifacts 仍不是 production data；即使未来 provider-call 成功，也不代表 frontend、Daily、production data、scoring、decision、execution 或 position readiness。
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
- `docs/EXTERNAL_AI_MANUAL_TEST_DESIGN.md`：未来 manual API test 设计入口；任何 API test 实现前必须确认 opt-in、disabled-by-default、validator-gated、no production data mutation。
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

## 10. v28.0L-3B-1 audit-sync reminder

v28.0L-3B-1 only records that the `External AI Manual Dry Run` workflow passed one manual GitHub Actions dry-run dispatch (`25583503038`). Do not confuse this audit success with provider-call readiness.

Audit-sync PRs must not add secrets, provider-call workflow behavior, provider inputs, `allow_network`, `dry_run=false`, SDKs, dependencies, production data writes, frontend visibility, or scoring / decision / execution / position changes.

Dry-run artifacts remain diagnostics only. Do not promote them, copy them into `data/radar-data.json`, or treat them as external AI output.

## 11. v28.0L-3C provider-call design reminder

v28.0L-3C may document future provider-call workflow gates, but it must not implement them. Do not add or modify workflow files, do not add `DEEPSEEK_API_KEY` to secrets, do not read API keys, do not create `.env` files, and do not run a real DeepSeek call in an L-3C design PR.

Provider-call artifacts remain non-production manual diagnostics. Provider-call success in a later implementation would still not imply frontend display readiness, Daily integration readiness, production data write readiness, or scoring / decision / execution / position readiness.

## 12. v28.0L-3D provider-call readiness checklist reminder

v28.0L-3D is a documentation-only readiness checklist and must not be treated as approval to implement a provider-call workflow.

Checklist PRs must not add secrets, provider-call workflow behavior, provider inputs, `allow_network`, `dry_run=false`, SDKs, dependencies, production data writes, frontend visibility, or scoring / decision / execution / position changes. They must not add or modify workflow files.

Resolve the missing readiness items before implementation: GitHub secret storage decision, secret rotation/revocation, trigger permissions, missing-secret failure behavior, provider-call static checker, artifact sanitization checker, cost budget, concurrency policy, and operator approval process.

Even if a future provider-call workflow succeeds, that success still will not imply production integration readiness, frontend display readiness, Daily integration readiness, production data write readiness, or scoring / decision / execution / position readiness.

## 13. v28.0L-3E provider-call implementation plan reminder

v28.0L-3E is a no-code implementation plan only. Do not jump from L-3E to a real provider call.

The next implementation, if approved, must be v28.0L-3F Manual Provider-Call Workflow Skeleton — Missing-Secret Safe / No Real Provider Call. L-3F must first prove default dry-run behavior, missing-secret fail-before-provider-call behavior, static workflow checks, and artifact sanitization before any GitHub secret is added.

Do not add GitHub secrets in L-3E. Do not read or print API keys. Do not use provider-call workflow output as production data. Do not copy manual or workflow artifacts into `data/radar-data.json`, frontend display paths, Daily, Worker, scoring, decision, execution, or position logic.

## 14. v28.0L-3F provider-test workflow skeleton reminder

v28.0L-3F adds a missing-secret-safe provider-test workflow skeleton only. Do not configure `DEEPSEEK_API_KEY` in L-3F or in an L-3F audit-sync PR.

Do not modify the provider-test workflow to run a real provider call, remove the missing-secret gate, pass secrets as command-line arguments, add `--allow-network` to executable shell, or upload provider output artifacts. L-3F must keep blocking real provider calls even if a secret is present.

After L-3F, the next step is audit only: run the default dry-run path expecting PASS, and run provider-path-without-secret expecting FAIL before provider command. Do not treat those results as production, frontend, Daily, scoring, decision, execution, or position readiness.

## 15. v28.0L-3F-1 provider workflow skeleton audit reminder

v28.0L-3F-1 only records successful L-3F skeleton audits: run `25591115649` default dry-run PASS and run `25591202053` provider path without secret expected FAIL before provider command. The second run confirmed `DEEPSEEK_API_KEY` was empty.

Do not treat L-3F-1 audit success as approval to add secrets or run real provider calls. Any next real-provider step must be separate and explicitly approved; recommended next stage is v28.0L-3G Secret Decision and First Real Provider-Call Gate Design - No Secret Yet.

## 16. v28.0L-3G secret decision reminder

v28.0L-3G decides the future secret strategy only: prefer GitHub Environment `external-ai-manual` with Environment secret `DEEPSEEK_API_KEY`, using required reviewer approval if available. Repository Actions secret is fallback only.

Do not add secrets or unlock provider calls unless the user explicitly asks. The first provider call, if later approved, must be `fixture_sample` first, artifact-only, `max_attempts=1`, validator-gated, quality-review-gated, sanitizer-gated, and non-production. It must not write production data, modify frontend, trigger Daily, or affect scoring / decision / execution / position.

## 17. v28.0L-3H provider-call unlock reminder

v28.0L-3H unlocks the provider-call workflow only behind GitHub Environment `external-ai-manual` and Environment secret `DEEPSEEK_API_KEY`.

Do not bypass the `external-ai-manual` environment gate. Do not move `DEEPSEEK_API_KEY` to global env or job env; keep it step-scoped to the provider-call step only. Do not pass the secret as a CLI argument and do not print it.

Provider output remains artifact-only and non-production. Do not write provider output to `data/radar-data.json`, do not display provider output in frontend, do not trigger Daily, and do not let provider output affect scoring / decision / execution / position logic.

Do not run live/local provider-call input before the `fixture_sample` workflow audit passes and is recorded in a follow-up PR.

## 18. v28.0L-3H-2 fixture prompt quality reminder

v28.0L-3H-2 is prompt / quality guidance only. Do not run DeepSeek or trigger the provider workflow while making this change.

Do not bypass quality review. Do not weaken `review:external-ai-artifact`, `check:external-ai-output`, or artifact sanitizer rules to make a provider artifact pass. Do not run live/local provider-call input until `fixture_sample` quality review passes in a later audit PR. Provider artifacts remain non-production and must not enter frontend, Daily, Worker, production data, scoring, decision, execution, or position logic.

## 19. v28.0L-3H-3 fixture provider-call audit reminder

v28.0L-3H-3 only records that the second `fixture_sample` provider-call audit passed in run `25593082968`: provider transport, output validation, quality review, artifact sanitizer, and sanitized artifact upload all passed, with `promotionEligible=false`.

Do not treat L-3H-3 success as permission to write production data, display provider output, enable `externalAiInterpretationLayer`, trigger Daily, or affect scoring / decision / execution / position logic. Live/local provider call requires a separate explicitly approved PR/task. Do not rerun `fixture_sample` unnecessarily.

## 20. v28.0L-3I local compact provider-call design reminder

v28.0L-3I is documentation-only design for a future `local_compact` provider-call path. Do not run a `local_compact` provider call until a separate approved implementation PR exists and is merged.

Do not treat local compact input or output as production data. Do not write local compact output to `data/`, do not display it on frontend, do not trigger Daily, and do not let it affect scoring / decision / execution / position logic. Future `local_compact` output must use `site_structured_data_only` semantics and remain artifact-only unless a later reviewed production integration PR explicitly changes that boundary.

## 21. v28.0L-3I-0 Node 24 runtime baseline reminder

Project runtime baseline is Node.js 24 LTS. `package.json` engines must remain `>=24 <25` or `24.x`; `.nvmrc` and `.node-version` must remain exactly `24`. Do not make Node 25 the default project runtime.

All GitHub Actions workflows must use the Node 24 baseline: `actions/checkout@v6`, `actions/setup-node@v6` with `node-version: 24`, `actions/upload-artifact@v7`, and top-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`. Do not use Node 20, `node20` actions, `actions/checkout@v4` / `@v5`, `actions/setup-node@v4` / `@v5`, `actions/upload-artifact@v4`, `FORCE_JAVASCRIPT_ACTIONS_TO_NODE20`, or `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`. Future Codex PRs must not regress runtime versions.

## 22. v28.0L-3J local compact provider-call workflow reminder

v28.0L-3J implements the `local_compact` provider-call workflow path, but it does not run the provider call and does not approve production integration.

Do not run the `local_compact` provider call more than once without a recorded audit. Do not write local compact input or provider output to `data/`. Do not display local compact output on the frontend. Do not proceed to production integration before the `local_compact` audit passes and a separate reviewed production PR explicitly changes the boundary.

## 23. v28.0L-3J-1 local compact source metadata reminder

`manual-input-compact-latest.json` may reference `data/radar-data.json` only as read-only local source metadata. Do not treat that source metadata reference as a production data write.

Never upload actual `data/radar-data.json` as an artifact. Never write provider output to `data/`, never copy provider output into `data/radar-data.json`, and never display local compact provider output on the frontend without a separate reviewed production/display PR.

## 24. v28.0L-3J-3 local compact execution-language prompt reminder

v28.0L-3J-3 fixes prompt guidance after run `25598379612` passed provider transport, validator, sanitizer, and artifact upload, but quality review rejected promotion because `$.facts[5]` repeated `执行灯` from `decisionContext`.

Never allow provider output to repeat execution / operation / position / cash / exposure / trading terms from `decisionContext` in facts, summary, inferences, model judgments, scenario hypotheses, invalidation signals, source attribution notes, audit flags, or any user-facing output field.

Never weaken `executionLanguageSafety`, `review:external-ai-artifact`, `check:external-ai-output`, or artifact sanitizer to make an artifact pass. Do not continue toward production integration, frontend display, Daily integration, data writes, scoring, decision, execution, or position changes until a `local_compact` quality review passes and a separate reviewed production PR explicitly changes the boundary.

## 25. v28.0L-3J-4 local compact provider-call audit reminder

v28.0L-3J-4 only records that run `25598887574` passed the `local_compact` provider-call audit: local compact input build, provider transport, output validation, quality review, artifact sanitizer, and sanitized artifact upload all passed with `promotionEligible=false`.

Do not treat L-3J-4 success as permission to write production data, display provider output, enable `externalAiInterpretationLayer`, trigger Daily, schedule automatic provider calls, or affect scoring / decision / execution / position logic. Any production integration or frontend display requires a separate explicitly approved PR. Do not rerun `local_compact` provider calls unnecessarily.

## 26. v28.0L-3K production readiness review reminder

v28.0L-3K is documentation-only and reviews readiness for future production integration. It does not approve production write, frontend display, Daily integration, automatic provider calls, `externalAiInterpretationLayer` promotion, `promotionEligible=true`, or scoring / decision / execution / position changes.

Do not treat provider audit success as production approval. No production write or frontend display may happen without a separate explicitly approved data contract/design PR. Keep `promotionEligible=false` unless a future explicit approval says otherwise.

## 27. v28.0L-3L production data contract design reminder

v28.0L-3L is documentation-only and designs the future production `externalAiInterpretationLayer` contract. It does not implement the validator, dry-run projection, production write, frontend display, Daily integration, or automatic provider calls.

Do not implement production write before an L-3M validator scaffold and later L-3N dry-run projection are explicitly approved. Never write an external AI artifact directly into `data/radar-data.json` without a production contract validator. Do not expose `externalAiInterpretationLayer` in the frontend without separate approval.

## 28. v28.0L-3M production contract validator reminder

v28.0L-3M adds `check:external-ai-production-contract` and a safe fixture for the future production `externalAiInterpretationLayer` contract. Future `externalAiInterpretationLayer` changes must pass this check.

Do not bypass the production contract validator. No production write is allowed before a later projection / dry-run stage is explicitly approved. Do not expose external AI output in the frontend, connect it to Daily, or let it affect scoring / decision / execution / position logic.

## 29. v28.0L-3N production projection dry-run reminder

v28.0L-3N adds a deterministic projection dry-run that writes only under ignored `manual-artifacts/external-ai/` and validates the result with `check:external-ai-production-contract`.

Projection dry-run output must not be copied into `data/` or `data/radar-data.json`. No production write is allowed before explicit L-3O approval. Any future production projection or write stage must pass the production contract validator and must not expose `externalAiInterpretationLayer` in the frontend without separate approval.

## 30. v28.0L-3O first controlled production write guard reminder

v28.0L-3O adds first controlled production write design and `check:external-ai-production-write-guard`, but it does not approve or perform a production write.

Do not write `externalAiInterpretationLayer` into `data/radar-data.json` without explicit user approval. Any first production write must be data-only, no frontend display, no workflow change, no Daily integration, and no automatic provider call. `check:external-ai-production-write-guard` must pass before and after any future first-write PR.

## 31. v28.0L-3P first controlled production write reminder

v28.0L-3P writes a display-disabled production `externalAiInterpretationLayer` into `data/radar-data.json` from approved run `25598887574`.

Future edits to `externalAiInterpretationLayer` must use the validator/write workflow. Do not set `displayEnabled=true` or `boundaries.frontendDisplayApproved=true` without a separate approved frontend PR. Do not connect this layer to frontend display, Daily, automatic provider calls, scoring, decision, execution, or position logic without separate explicit approval.

## 32. v28.0L-3P-1 first production write audit-sync reminder

v28.0L-3P-1 records that the first controlled production write passed post-merge audit. `externalAiInterpretationLayer` now exists in `data/radar-data.json`, remains display-disabled, and remains non-impacting.

Do not edit the layer manually. Future updates must pass `check:external-ai-production-contract` and `check:external-ai-production-write-guard`. Do not set `displayEnabled=true` without explicit frontend display approval. Frontend display remains a separate phase.

## 33. v28.0L-3Q frontend display design reminder

v28.0L-3Q is documentation-only and designs a future read-only frontend panel. It does not add frontend code, does not display `externalAiInterpretationLayer`, and does not change `data/radar-data.json`.

Do not implement external AI frontend display without an explicit frontend display task. Do not set `displayEnabled=true` or `boundaries.frontendDisplayApproved=true`. Future user-facing copy must be Chinese-only, non-actionable, and must preserve Global Risk Heatmap layout.

## 34. v28.0L-3R hidden frontend scaffold reminder

v28.0L-3R adds a hidden-by-default frontend scaffold for `externalAiInterpretationLayer`. The scaffold must remain non-visible while `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`.

Do not set `displayEnabled=true` or `boundaries.frontendDisplayApproved=true` without a separate explicitly approved visible-display PR. Future visible display requires a separate PR, must keep Global Risk Heatmap layout unchanged, and must keep scoring / decision / execution / position logic untouched.

## 35. v28.0L-3S visible display approval design reminder

v28.0L-3S is documentation-only and defines the future visible-display approval and data flag process. It does not enable visible display.

Do not enable visible display without a separate explicit data-flag PR. Visible display does not require a provider call; do not add DeepSeek reruns, automatic provider calls, Daily integration, workflow schedules, scoring changes, decision changes, execution changes, or position changes for frontend display. Preserve Global Risk Heatmap layout.

## 36. v28.0L-3T visible display flag enablement reminder

v28.0L-3T approves visible display only for the current production `externalAiInterpretationLayer` by setting `displayEnabled=true` and `boundaries.frontendDisplayApproved=true`.

Do not set `qualityReview.promotionEligible=true`. Do not modify external AI text manually. Do not add automatic provider calls, Daily integration, provider reruns, workflow schedules, scoring changes, decision changes, execution changes, or position changes. Preserve Global Risk Heatmap layout.

## 37. v28.0L-3T-1 visible display audit-sync reminder

v28.0L-3T-1 records that visible display is enabled and audited for the current production data layer only.

Do not modify external AI text manually. Do not add automatic provider calls, Daily integration, provider reruns, workflow schedules, scoring changes, decision changes, execution changes, or position changes. Preserve Global Risk Heatmap layout.

## 38. v28.0L-3U visible display UX polish reminder

v28.0L-3U polishes the visible external AI read-only panel only.

Do not modify external AI generated text, provider data, `data/radar-data.json`, provider artifacts, or provider workflows for UX polish. Do not add trading/action copy, automatic provider calls, Daily integration, scoring changes, decision changes, execution changes, or position changes. Preserve Global Risk Heatmap layout.

## 39. v28.0L-3U-1 visible display UX audit-sync reminder

v28.0L-3U-1 records that the visible external AI display is live, polished, and audited for the current production data layer.

Do not change AI generated text manually. Do not add provider refresh automation without explicit approval. Preserve Global Risk Heatmap layout and preserve no scoring / decision / execution / position impact. Future updates must pass `check:external-ai-production-contract`, `check:external-ai-production-write-guard`, `check:external-ai-frontend-hidden-scaffold`, and `check:all`.

## 40. v28.0L-4A production refresh workflow reminder

v28.0L-4A adds `External AI Production Refresh` as the only approved automatic provider call path. It may run manually or once daily at `23:50 UTC` after the `external-ai-production-refresh` environment and `DEEPSEEK_API_KEY` environment secret are configured.

Do not add additional schedules, retries beyond one provider attempt, or provider refresh automation outside this workflow without explicit approval. During refresh, commit only `data/radar-data.json` and only when `externalAiInterpretationLayer` changes. Preserve `displayEnabled=true`, `boundaries.frontendDisplayApproved=true`, `qualityReview.promotionEligible=false`, and all non-impact boundaries. Do not change frontend logic, Global Risk Heatmap layout, scoring, decision, execution, or position logic.
