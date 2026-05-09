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

当前处于 `v28.0J` 稳定观察基线；页面公开标签仍为 `v28.0C`，不要把工程内部版本同步误改成 UI 公开版本。v28.0J-2B post-deploy audit 已通过，当前前端版本为 `28.0J-2`。

已经具备：

- Worker-first 实时主源，前端按 strict gate 选择 Worker generated preview。
- GitHub `realtime-data` fallback 与本地 `./realtime/market.json` fallback。
- realtime freshness / degraded / unavailable 状态展示。
- daily baseline 构建与 `displayInputsBaseline` fallback。
- 六大风险模块、热力图、传导网络、资产偏好矩阵和情景树。
- 决策系统、执行灯、仓位建议、Action Queue、Trigger Monitor 和 Invalidation Rules。
- secondary diagnostics 独立 endpoint `/market.secondary-preview.json`，当前接入 VIX via Cboe、Gold via Yahoo `GC=F`、DXY via Yahoo `DX-Y.NYB`、US10Y via Yahoo `^TNX` 与 SPX via Yahoo `^GSPC` 诊断。
- Brent audit、freshness-gated promotion、extreme-move confirmation guard、D-8B-lite sourceProbe 与 Brent source explainability UI。
- D-8B findings 已确认 Google Finance / Stooq 当前不可升级为 Brent validation source，仍只保留 diagnostic sourceProbe。
- Worker fetch timeout guard 已上线，外部免费源慢响应只进入 diagnostics，不改变主值选择。
- Daily vs Worker Input Audit 已上线，用于观察 Daily 消费的 `realtime-data` payload 与当前 Worker preview 的差异；该审计不改变 Daily 输入或前端 Worker-first 选择逻辑。
- Worker-first Health Check 已上线，定时只读检查主 `/market.worker-preview.json` 与独立 `/market.secondary-preview.json` 的健康、隔离和诊断字段。
- Check Realtime Health 已对齐为 soft-fail：只观察 GitHub `realtime-data` fallback / Daily baseline freshness，stale / unavailable 只报告 warning 与 `shouldRecover`，Worker-first runtime hard gate 由 Check Worker Health 承担。
- Recover Stale Realtime Market 只处理 fallback `realtime-data` 恢复，不回滚或修正 Worker-first runtime。
- v28.0G-3 只清理健康检查 Summary 文案：Check Worker Health 明确为 hard gate，Check Realtime Health 明确为 fallback / Daily baseline soft observer；不改变数据源、Worker 或前端。
- v28.0G-4A 增加 Trading Economics Brent observedAt audit-only：只在 Brent promotion / audit 输出中展示 observedAt freshness 诊断，不改变 `values.brent` 或 promotion hard gate。
- v28.0G-4B decision：建议另开 G-4C 实现 Trading Economics freshness hard gate；G-4B does not change runtime behavior。G-4C 方案为 TE `observedAt` 可解析且 `ageHours <= 48` 小时，否则用 `tradingeconomics-observedAt-invalid` 或 `tradingeconomics-confirmation-stale` hold promotion；旧 PR #53 已 superseded，不再使用。
- v28.0G-4C 实现 Trading Economics freshness hard gate：Brent promotion 要求 Yahoo fresh + TE observedAt fresh；TE observedAt 不可解析或超过 48 小时会 hold promotion。TE candidate 仍保留 value/audit，observedAt failure does not make candidate ok false；D-6 confirmed-extreme-move 也要求 TE freshness fresh。
- v28.0G-6 Operations Runbook 已加入 `docs/OPERATIONS.md`：运维判断、rollback / No rollback、KV usage 和 development sequencing 以该 runbook 为准。PR #53 superseded；KV write guard deferred，先观察。
- v28.0G-7A Health Summary Snapshot / Audit Export：`Check Worker Health` 生成 `worker-health-snapshot` artifact，用于回看 Worker / Brent TE freshness / sourceProbe / secondary / reasons；不写 KV，不写 data/realtime，不改变 fail 边界。
- v28.0G-7B Health Snapshot Review Helper：`npm run review:worker-health-snapshot -- health-worker-snapshot.json` 本地只读审阅 artifact，输出 PASS / WARN / FAIL；不访问网络，不写 KV / data / realtime，不替代 hard gate。
- v28.0H-2 / H-5 / H-5A World Order Stress Overlay UI Shell：前端资源版本统一为 `?v=28.0J-2`，并新增“世界秩序压力层”独立展示区。H-5 会解释 confidence / data quality limitations；H-5A 使用中文趋势 / 来源标签和更清晰的 evidence attribution。前端只读取 `data/world-order-stress.json`，不直接调用外部 API，不接入 `decisionModel`，不改变 Worker runtime、数据源、KV 或 realtime / baseline 计算。
- v28.0G-9B Frontend Asset Version Bump Helper：新增本地只读维护工具 `node scripts/bump-frontend-asset-version.mjs 28.0G-10` / `npm run bump:frontend-asset-version -- 28.0G-10`，用于以后前端 HTML / JS 改动时统一 bump cache version。当前正式版本仍是 `28.0J-2`；该工具不访问网络、不写 KV、不写 `data/*.json` / `realtime/*.json`、不 deploy Worker。
- v28.0G-10 Data Check Expected-Skip Noise Cleanup：`npm run check:data` 默认不再为 local realtime / `dailyRealtimeInput` 时间不一致输出 warning；这是 expected skip，因为 Worker-first runtime 已是主链路，本地 realtime 属于 fallback / Daily baseline，可能不是同一快照。需要细节时运行 `npm run check:data:verbose`，需要把 mismatch 当作失败时运行 `npm run check:data:strict-live-alignment`。本轮不改 data/realtime、不改 Worker runtime、不改前端、不 deploy。
- v28.0H-1 World Order Stress Overlay Data Pipeline MVP：新增 `data/world-order-stress.json` 与本地构建 / 检查脚本。该层只做结构性风险识别和市场交叉验证，不预测战争、不输出战争概率。`npm run check:world-order` 校验该数据产物，并已纳入 `npm run check:all`。H-2 已加入独立 UI shell；H-2B 起 market confirmation 会记录输入来源；H-2C 起 GDELT 支持 partial success 与 stale cache fallback；H-3 起支持 SIPRI manual normalized import；H-4 增强 `npm run build:world-order` / `npm run check:world-order` summary，并新增 `npm run review:world-order` 只读审阅。详细说明见 `docs/WORLD_ORDER_STRESS.md`。
- v28.0I Cockpit Structure Upgrade：已上线 Daily Brief / 今日主判断、Divergence Layer / 实体压力与金融定价背离、Consumer vs Asset Divergence、Brent Public Proxy Pricing Layer 与 compact cockpit layout。当前 live data 包含 `dailyBrief.contractVersion = v28.0I-1`、`divergenceLayer.contractVersion = v28.0I-3A`、`macroDrivers.consumer`、`consumer_vs_asset_pricing` 与 `brentPricingLayer.contractVersion = v28.0I-5A`。这些字段均为 display-only / audit-only / interpretation-only，不接入 scoring / decision。详见 `docs/SYSTEM_UPGRADE_PLAN.md`、`docs/DATA_CONTRACT.md` 与 `docs/OPERATIONS.md`。
- v28.0J AI Interpretation Layer：已上线 rule-based / non-external-AI display layer。当前 live data 包含 `aiInterpretationLayer.contractVersion = v28.0J-0`，mode 为 `rule_based_structured_interpretation`；该层只把站内结构化数据拆分为事实、推断、模型判断、情景假设、数据缺口、反证条件和证据链接，不调用 DeepSeek / OpenAI / 外部 AI API，不进入 scoring / decision / execution / position。详见 `docs/SYSTEM_UPGRADE_PLAN.md`、`docs/DATA_CONTRACT.md` 与 `docs/OPERATIONS.md`。
- v28.0K-0 External AI API Design：新增 future DeepSeek / OpenAI / external AI API design and output audit plan；当前不接 API、不显示外部 AI 输出、不改变 rule-based `aiInterpretationLayer`。详见 `docs/EXTERNAL_AI_API_DESIGN.md`。
- v28.0K-1 External AI Prompt Contract：新增 future prompt contract 与非生产 sample fixtures；当前不接 API、不写 secrets、不改变 runtime。详见 `docs/EXTERNAL_AI_PROMPT_CONTRACT.md`。
- v28.0K-2 External AI Output Validator：新增 `npm run check:external-ai-output`，用于离线验证非生产 external AI output fixture / artifact 的 contract、source attribution、banned copy 与越权文案；不调用 API，不接入 runtime。
- v28.0K-3 Disabled External AI Scaffold：live data 已包含 disabled `externalAiInterpretationLayer` scaffold。它是 diagnostic-only，不是 active external AI，不调用 DeepSeek / OpenAI / 外部 AI API，不进入 scoring / decision / execution / position。
- v28.0K-3D Stable Observation Audit：新增只读 workflow 监控 v28.0K baseline，并作为是否考虑 v28.0K-4 design planning 的 gate。
- v28.0K-4A External AI Manual API Test Design：新增 future manual external AI API test design；production 仍保持 disabled，不接 API、不写 secrets、不改变 runtime。
- v28.0K-4B External AI Manual Dry-Run Scaffold：新增 `npm run manual:external-ai:dry-run`，仅输出 no-network scaffold report，不调用 provider。
- v28.0K-4C External AI Provider Adapter Skeleton：新增 disabled provider adapter skeleton 与 `npm run check:external-ai-provider-adapters`；`deepseek` / `openai` 仍只是 refused placeholders，不联网、不读 API keys。
- v28.0K-4D DeepSeek Manual Artifact Test：新增显式 opt-in 的 `npm run manual:external-ai:deepseek`，仅写 manual artifact 并通过 validator gate；不写生产数据、不显示前端、不影响 scoring / decision / execution / position。OpenAI 仍 disabled。
- v28.0K-4E Live Site Data Manual Input Artifact：新增 `npm run manual:external-ai:build-input`，从本地或 allowlisted live `radar-data.json` 生成 ignored manual input artifact；不调用 DeepSeek、不读 API keys、不写生产数据、不显示前端。
- v28.0K-4E-1 Live Input Compaction and Timeout Diagnostics：新增 compact manual input artifact 与 `--timeout-ms` 诊断，用于降低 live-data DeepSeek manual test 的输入体积；仍不自动调用 DeepSeek、不写生产数据、不显示前端。
- v28.0K-4G External AI Manual Test Baseline：External AI API 仍未 production-enabled。当前只存在本地 / 手动 DeepSeek artifact path，输出必须先通过 `check:external-ai-output` 与 `review:external-ai-artifact`；尚无 frontend / Daily / Worker / workflow / production data integration。
- v28.0L-0 External AI Production Integration Design：新增 production integration design doc；当前仍无 production external AI、无 Daily provider call、无 frontend display、无 production data write。
- v28.0L-1 External AI Implementation Readiness Audit：新增 readiness audit；结论为 production integration not ready，下一阶段只允许 disabled skeleton/no provider calls。
- v28.0L-2 Disabled Production Provider Path Skeleton：新增 disabled production provider skeleton 与安全检查；无 production external AI active、无 provider call、无 secrets、无 frontend / Daily integration。
- v28.0L-3 Manual Workflow Dispatch Design：仅设计 future manual workflow testing；当前无 workflow、无 provider call、无 GitHub secret、无 production data write。
- v28.0L-3B External AI Manual Dry Run Workflow：新增 manual `workflow_dispatch` dry-run workflow，仅跑安全检查和 dry-run diagnostics；不调用 DeepSeek，不使用 secrets，不写 production data。
- v28.0L-3B-1 External AI Manual Dry Run Audit：已记录一次 GitHub Actions manual dispatch dry-run PASS（run `25583503038`）；这仍不调用 DeepSeek，也不代表 provider-call readiness。
- v28.0L-3C External AI Provider-Call Workflow Design：仅新增 future provider-call workflow design；当前仍无 DeepSeek workflow call、无 GitHub secret、无 provider artifact、无 production data write。
- v28.0L-3D Provider-Call Workflow Readiness Checklist：仅新增 no-code readiness checklist；provider-call workflow 仍未实现，不添加 GitHub secret，不运行 DeepSeek，不写 production data，不显示 frontend，implementation 仍为 `not_ready_until_missing_items_resolved`。
- v28.0L-3E Provider-Call Workflow Implementation Plan：仅新增 no-code implementation plan；provider-call implementation 已规划但仍未激活，下一步建议为 L-3F missing-secret-safe / no-real-provider-call skeleton。
- v28.0L-3F Manual Provider-Call Workflow Skeleton：新增 manual provider-test workflow skeleton 与静态检查；默认 dry-run，provider path missing-secret safe，且即使 secret 存在也阻断真实 provider call。仍无 GitHub secret、无 DeepSeek call、无 provider output、无 production data、无 frontend display。
- v28.0L-3F-1 Provider Workflow Skeleton Audit：provider workflow skeleton 已通过 default dry-run 与 missing-secret safety audit；real provider calls 仍保持 disabled，且不批准添加 `DEEPSEEK_API_KEY`。
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
- Check Realtime Health 只观察 `realtime-data` fallback / Daily baseline freshness；即使 stale，也不代表 Worker-first runtime unhealthy。
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
- 当前接入 VIX via Cboe、Gold via Yahoo `GC=F`、DXY via Yahoo `DX-Y.NYB`、US10Y via Yahoo `^TNX` 与 SPX via Yahoo `^GSPC` secondary diagnostics。
- 当前 core secondary set 为 `vix` / `gold` / `dxy` / `us10y` / `spx`，只写 `/market.secondary-preview.json` 的 `diagnostics.sources.*`。
- 前端主页面暂不消费 secondary diagnostics；它们只用于后台诊断，不影响 `effectiveDisplayInputs`、`values.*`、scoring、decision 或 Worker-first strict gate。
- v28.0G-1 起，`check-worker-health` 会对 secondary `observedAt` 派生 `freshnessStatus` / `observedAgeHours` / `freshnessReason`；这是只读 health summary，不是 Worker payload 字段。market-closed 或节假日造成的 stale 初版只 warning，不阻断 workflow。
- E-4 后暂停继续堆新 secondary source，先观察 Worker health workflow 与 secondary freshness；HY OAS、real10y、credit spread proxy、liquidity proxy 和其它 macro stress indicators 必须另开版本，且先进入 isolated secondary diagnostic。

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
- `check:data:verbose`：输出 live realtime / `displayInputsBaseline` alignment 的 expected skip reason。
- `check:data:strict-live-alignment`：要求本地 `realtime/market.json.updatedAt` 与 `dailyRealtimeInput.updatedAt` 是同一快照，否则失败。
- `build:world-order`：手动刷新 World Order Stress 外部数据并写入 `data/world-order-stress.json`。
- `check:world-order`：只读检查现有 World Order Stress JSON，已纳入 `check:all`。
- `review:world-order`：只读审阅现有 World Order Stress JSON，输出 PASS / WARN / FAIL 和建议动作。
- `diagnose:gdelt`：只读诊断 GDELT timeout / 429，不修改生产数据。
- `diagnose:reliefweb`：只读诊断 ReliefWeb 备用源可行性，不修改生产数据。

新增 `scripts/` 脚本或 `scripts/modules/` 模块后，通常会自动纳入对应检查，无需手动维护检查列表。

前端静态资源维护规则：frontend asset cache version must be bumped when index.html or frontend JS changes。以后只要修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js`，必须同步 bump frontend asset cache version，并替换 `index.html` 入口脚本与所有本地 module import query。当前 frontend asset cache version 是 `28.0J-2`。推荐使用：

```bash
node scripts/bump-frontend-asset-version.mjs 28.0G-10
npm run bump:frontend-asset-version -- 28.0G-10
```

不需要 bump 的情况包括只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json`，或只 deploy Worker。

v28.0G-10 起，默认 `check:data` 会安静跳过本地 realtime 与 `dailyRealtimeInput` 时间不一致时的 live alignment，这是 expected skip，不代表删除了 `validateRealtimeBaselineAlignment`。本地 fallback 可能不是 Daily 实际消费的 realtime 版本；若需要确认原因，用 `npm run check:data:verbose`，若需要强制同快照，用 `npm run check:data:strict-live-alignment`。

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
- 系统升级路线：`docs/SYSTEM_UPGRADE_PLAN.md`
- 新信号纳入框架：`docs/SIGNAL_INTAKE.md`
- 核心入口：`index.html`
- 前端入口：`scripts/app.js`
- Realtime 构建：`scripts/run-realtime.mjs`
- Daily 构建：`scripts/run-daily-pipeline.mjs`
- 数据校验：`scripts/validate-data.mjs`
