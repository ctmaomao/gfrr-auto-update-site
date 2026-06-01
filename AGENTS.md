# AGENTS.md — Global Financial Risk Radar AI 开发守则

> 本文档供 Cursor、Codex、Claude Code 和其他 AI 工具接手本项目时优先阅读。目标是保护当前 v28.0J 稳定观察基线，避免误改核心数据链路、Worker-first 主链路、解释层边界、决策契约和部署保护网。
>
> **完整拆分前快照见 git tag `v28.0J-pre-split`**。
> 文档拆分时间:2026-05-18,目的是把规则、文档索引和 milestone 历史摘要分离。

## Pre-read pointers

本 AGENTS.md 只承载 **AI 开发规则**。索引与历史已外迁到独立文档,
请按需访问:

- **文档权威分级索引** → [`docs/INDEX.md`](docs/INDEX.md)
  (Current / Conditional / Operating / Historical 四级)
- **Milestone (M-XX / vXX.XX) 索引** → [`docs/MILESTONE_INDEX.md`](docs/MILESTONE_INDEX.md)
  (Active + Recently Merged + Archived 三段,默认只读前两段)
- **AI 启动导航** → [`CLAUDE.md`](CLAUDE.md)
- **数据源边界** → [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)
- **重大架构决策** → [`docs/ADR/README.md`](docs/ADR/README.md)
- **项目自我记忆 / 当前活跃任务** → [`docs/PROJECT_BACKLOG.md`](docs/PROJECT_BACKLOG.md)

### Rule of Conflict Resolution (摘录,完整版见 `docs/INDEX.md`)

1. **Current Authority** beats everything else.
2. Within Current Authority, the more specific/restrictive rule wins.
3. Scope-conditional authority does NOT override Current Authority.
4. Historical Background NEVER overrides anything current.
5. When in doubt, check `package.json` for the actual check commands and run them.

---

## 1. 项目当前状态

当前项目处于 v28.0J 稳定观察基线。v28.0J-2B post-deploy audit 已通过；当前前端版本为 `28.0M-89V`。Worker-first 已是当前主运行路径：`/market.worker-preview.json` 是主 realtime payload，`/market.secondary-preview.json` 是独立 secondary diagnostics endpoint。

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
- v28.0G-10 Data Check Expected-Skip Noise Cleanup：默认 `npm run check:data` 不再为 local realtime / `dailyRealtimeInput` 时间不一致输出 warning；这是 expected skip，因为 Worker-first runtime 是主链路，本地 realtime 属于 fallback / Daily baseline，可能不是同一快照。需要原因用 `npm run check:data:verbose`，需要强制失败用 `npm run check:data:strict-live-alignment`。不得误解为删除 `validateRealtimeBaselineAlignment`。
- v28.0H-1 / H-2 World Order Stress Overlay 是 regime overlay / 结构性状态修正器，不是第七个底层风险模块。用户可见文案必须克制：不得预测战争，不得输出战争概率，不得把结构性压力写成确定性事件；H-2 前端只读展示 `data/world-order-stress.json`，不直接调用外部 API，不接 `decisionModel`，不改 Worker runtime。
- v28.0H-2B World Order marketConfirmation 输入优先级为 Worker-generated preview → local realtime → Daily baseline，并必须在 `data/world-order-stress.json.marketConfirmationInput` 记录来源、时间、关键市场值和 fallback reason；前端仍只读最终 JSON。
- v28.0I 后，任何新增解释层 / 新信号 / 新数据源必须先检查 `docs/SYSTEM_UPGRADE_PLAN.md` 中的 v28.0I stable baseline 边界。
- `dailyBrief`、`divergenceLayer`、`macroDrivers.consumer`、`macroDrivers.employment`、`macroDrivers.consumerRetail`、`macroDrivers.commercialRealEstate`、`consumer_vs_asset_pricing` 与 `brentPricingLayer` 均为解释层 / 审计层 / 展示层；不得直接接入 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。
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
- M-63a/M-63b 后，ACLED 仅走 Open-license manual-xlsx workflow：operator 手动下载 aggregated xlsx，`scripts/world-order/sanitize-acled-weekly.mjs` 输出 `config/world-order-acled-regional-weekly.json`、`scripts/world-order/sanitize-acled-monthly.mjs` 输出 `config/world-order-acled-global-monthly.json`，`scripts/world-order/fetch-acled.mjs` 只读本地 JSON 并联合 weekly+monthly 输出 `ok` / `partial` / `manual_required` / `error`。旧 ACLED API adapter 已删除；不得恢复 `ACLED_API_KEY` / `ACLED_EMAIL` / `api.acleddata.com` / 自动访问 acleddata.com 的路径。`xlsx` 仅允许由 weekly/monthly sanitizer 按 ADR-0013 作为 devDependency 使用，不得被 runtime、check、workflow 或 frontend 导入。
- M-63b 是 evidence-only ingestion：monthly metrics 通过 `fetch-acled.mjs` 进入 World Order overlay 的 evidence/summary 字段，不修改 `peaceDividendRetreat` 权重 (SIPRI 0.35 + GDELT 0.20 + ACLED 0.25 + module 0.20 保持)；任何 monthly→scoring weight 改动必须另开 M-63d source-review/backtest PR。
- M-63c 已落地：ACLED weekly + monthly reminder workflows 在位（`acled-{weekly,monthly}-refresh-reminder.yml`），reminder-only 边界硬锁；workflow 不得 `actions/checkout`、不得 `npm install`、不得跑 sanitizer、不得对 `acleddata.com` 发任何网络请求；任何"reminder 升级为 auto-fetch"的提议必须另开 reviewed PR 并附 EULA §3.3 重新评估。
- M-67 后,ISM PMI 来自 ismworld.org 公开报告页 (low-frequency monthly HTML parse with UA 'GFRRBot/1.0');保持 audit-only,不进 scoring/decision/execution/position;失败必须降级为 fallback/source_unavailable/parse_error,不得伪造或冒充替代指标。
- M-73 后,`macroDrivers.employment` 在 M-68 ICSA/CCSA/JTSJOL 基础上加入 FRED CES0500000003 平均时薪、U6RATE 与公开行业 payroll basket 扩散代理；audit-only/display-only；不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules；不进 `displayInputsBaseline` / `effectiveDisplayInputs`；不进 cross-validation matrix；新源失败必须降级 `sourceStatus.{icsa,ccsa,jtsjol,ahe,u6,industryPayroll}` 为 `fallback` / `missing`,不得伪造或冒充 BLS proprietary diffusion index、职位质量明细或实时就业信号。
- M-69 后,`macroDrivers.consumerRetail` (Chicago Fed CARTS + CARTSR via FRED) 为周频零售/消费 nowcast evidence 层；audit-only/display-only；不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不接 CARTSP (价格指数,future scope only);**绝对不得**伪造为 Redbook 或 BoA raw card feed 数据,字段名/前端文案/notes 都不得暗示替代关系;Redbook + BoA raw card feed 为 P3-14 source-review candidates,不在 runtime 任何路径自动 fetch。
- M-70 后,`macroDrivers.commercialRealEstate` (FRED DRCRELEXFACBS + CORCREXFACBS + SUBLPDRCSN/C/M) 为季频 CRE 信用压力 evidence 层;audit-only/display-only；不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不扩写 `macroDrivers.credit`;除 M-84 public aggregate proxy 外,不接 loan balance/CRE exposure stock series;**绝对不得**伪造为 CDX、私募信贷数据或非公开 CRE loan tape,字段名/前端文案/notes 都不得暗示替代关系。
- M-74 后,`macroDrivers.shippingFreight` (StockQ BDTI/BCTI/BDI public pages),`macroDrivers.policyExpectations` (FRED DFEDTARL/DFEDTARU/DFF + Yahoo ZQ=F + Federal Reserve SEP/FOMC statement),`macroDrivers.privateCreditProxy` (Yahoo BIZD + FRED HY OAS),以及 `macroDrivers.consumerRetail` MRTS segment basket / `macroDrivers.commercialRealEstate` VNQ/REM public proxies 均为 audit-only/display-only；不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules；不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得把 ZQ=F 写成 OIS forward,不得把 BIZD/HY OAS 写成 CDX 或 private credit marks,不得把 VNQ/REM 写成非公开 CRE loan tape。
- M-77 后,`macroDrivers.policyExpectations` 可读取 Federal Reserve `fomcminutesYYYYMMDD.htm` 做 keyword NLP tone/topic count;`macroDrivers.consumerRetail` 可读取 BoA Consumer Checkpoint 公开 HTML 摘要;`brentPricingLayer.futuresCurve` 只读取 ICE Brent futures contract structure (`live_structure_only`)。三者仍为 audit-only/display-only;不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得把 ICE structure-only 写成正式结算价期限结构,不得把 BoA public summary 写成 Redbook 或 BoA 原始卡明细,不得把 minutes keyword count 写成外部 AI/NLP 决策模型。
- M-78 后,`macroDrivers.policyExpectations.fedFundsFuturesCurve` 可读取 Yahoo ZQ 月度 Fed funds futures proxy curve;`macroDrivers.privateCreditProxy` 可加入 FRED `BAMLC0A0CM` IG OAS cash-bond proxy;`brentPricingLayer.futuresPriceCurve` 可读取 Yahoo `BZ` 月度 Brent futures priced proxy。三者仍为 audit-only/display-only;不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得把 ZQ futures curve 写成 OIS forward,不得把 HY/IG OAS 写成 CDX HY/IG,不得把 Yahoo BZ priced proxy 写成 ICE official settlement curve、Platts Dated Brent 或正式 Dated Brent。
- M-79 后,`macroDrivers.consumerRetail.redbookRetailSalesYoY` 可读取 Trading Economics Redbook public HTML 摘要;`macroDrivers.policyExpectations.sofrFuturesCurve` 可读取 Yahoo `SR3` 月度 Three-Month SOFR futures proxy curve。两者仍为 audit-only/display-only;不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得把 Redbook public HTML 写成 Redbook raw subscription feed 或 BoA raw card feed,不得把 SR3 SOFR futures 写成 OIS forward。
- M-80 后,`macroDrivers.policyExpectations.oisForwardCurve` 可读取 CheckMySwap USD OIS public curve (DTCC/CFTC public swap data);`macroDrivers.commercialRealEstate.cmbsEtfPrice` 可读取 Yahoo `CMBS` ETF public proxy;`macroDrivers.privateCreditProxy.pbdcEtfPrice/seniorLoanEtfPrice` 可读取 Yahoo `PBDC` / `SRLN` listed public proxies。三者仍为 audit-only/display-only;不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得把 CheckMySwap public curve 写成 proprietary dealer OIS forward,不得把 CMBS 写成 non-public CRE loan tape,不得把 PBDC/SRLN/BIZD 写成 CDX HY/IG 或 private credit marks。
- M-81 后,`macroDrivers.privateCreditProxy.cdxHyPrice/cdxIgPrice` 可读取 ICE Clear Credit public CDX index settlement prices (`CDX-NAHY*-5Y` / `CDX-NAIG*-5Y`)。该字段仍为 audit-only/display-only;不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得把 ICE public EOD settlement 写成 private credit marks、full licensed Markit history database、Bloomberg/FactSet/Refinitiv feed 或私募信贷估值。
- M-82 后,`brentPricingLayer.iceFuturesPriceCurve` 可读取 ICE product-guide public contract-data 的 Brent futures delayed last-price curve。该字段仍为 audit-only/display-only;不得接入 `values.brent`、Brent promotion、scoring、decisionModel、executionLock、positionGuidance、Action Queue、Trigger Monitor 或 Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得写成 Platts Dated Brent、正式 Dated Brent、official ICE settlement curve 或实物现货成交证据。
- M-83 后,`macroDrivers.privateCreditProxy.intervalFundNavPrice` 可读取 Yahoo `CCLFX` public interval-fund NAV proxy (Cliffwater Corporate Lending Fund)。该字段仍为 audit-only/display-only;不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得写成 private credit marks、fundraising data、Cliffwater Direct Lending Index licensed dataset 或非公开私募贷款估值。
- M-84 后,`macroDrivers.commercialRealEstate.creLoanBalance` 可读取 FRED `CREACBW027SBOG` public weekly aggregate bank CRE loan balance / exposure stock proxy。该字段仍为 audit-only/display-only;不得接入 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得写成 non-public CRE loan tape、private CRE marks、loan-level exposure、CDX 或 私募信贷数据。
- M-85 后,`brentPricingLayer.eiaBrentSpotProxy` 可读取 EIA Europe Brent Spot Price FOB public HTML (`RBRTE`)。该字段仍为 audit-only/display-only;不得接入 `values.brent`、Brent promotion、scoring、decisionModel、executionLock、positionGuidance、Action Queue、Trigger Monitor 或 Invalidation Rules;不进 `displayInputsBaseline` / `effectiveDisplayInputs`;不进 cross-validation matrix;不得写成 Platts Dated Brent、正式 Dated Brent 或实物现货成交证据。
- M-86 后,Macro Overview 前端必须把已接入的公开代理覆盖与正式/非公开源边界分开显示：`coverageNotes` 可说明 EIA/ICE/StockQ/ZQ/SR3/OIS/CDX/CRE/public retail 等公开代理已覆盖，`missingEvidence` 只保留真正未刷到的公开数据或 World Order 外部源限制；不得把 live public proxy 重新渲染成“缺失证据”，也不得把正式源边界写成高确定性真实源。
- M-87 后,缺失源的 `null` / `undefined` / empty string 不得在 Brent display 或 cross-validation evidence 中被 `Number(...)` 隐式转成 `0.00` / `+0.0bp`;`check:null-zero-display-guards` 必须保留在 frontend visual suite 中。
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

## 2. Frontend Design Contract — Mandatory Reading

> **CRITICAL**: Before performing any frontend change (HTML / CSS / SVG / JS rendering modules), every AI agent (Codex, Cursor, Claude, or otherwise) MUST read `DESIGN.md` in full.

### Required Acknowledgment in PR

Every PR that touches `index.html`, `assets/styles.css`, `scripts/modules/render*.js`, or any SVG rendering code MUST include one of these statements in the PR description:

- ✅ **"本 PR 符合 DESIGN.md 的所有规则"** — for routine changes
- ⚠️ **"本 PR 申请变更 DESIGN.md 的 §X 节"** — for changes that modify the design contract itself

### Required Pre-Change Research

For non-trivial visual changes, the agent MUST:

1. Read `DESIGN.md` and confirm which sections apply
2. Generate a current-state inventory before making changes (e.g., color usage table, font-size baseline, className inventory)
3. Cite specific DESIGN.md sections that govern the change

### Boundary Reaffirmation

`DESIGN.md` does NOT relax any data / business boundaries. The following remain absolutely prohibited:

- Changing scoring / decision / execution / position logic
- Modifying `data/` or `data/radar-data.json`
- Enabling Market Pricing Temperature
- Adding live fetch or production write
- Modifying `.github/workflows/`

When `DESIGN.md` and any other contract (e.g., Market Pricing governance) appear to conflict, **the more restrictive contract wins**.

### Enforcement

- `npm run check:frontend-live-contracts` enforces the live frontend display contracts: DOM id 契约 (`check:dom`)、null/zero 显示守卫、macro coherence (display-only)
- `DESIGN.md` itself is the ground truth for IA 顺序 / 字体 / 视觉 (see `docs/ADR/0014-design-md-is-ia-ground-truth.md`); the dedicated `check:homepage-ia-contract` / `check:editorial-redesign-contract` checkers were retired in checker 精简 Phase 1+2, so IA/font contracts are now guarded by `DESIGN.md` + review, not a script
- `npm run check:all` runs `check:frontend-live-contracts` as part of the 15-item top-level baseline (~48 leaf checks)

PRs that fail these contracts MUST NOT be merged, regardless of how good the visual result looks.

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

不要把"检查命令"和"提交命令"混在同一轮要求里。如果检查失败，应先进入修复流程，不要继续提交。代码改动和 JSON 产物改动必须区分；运行 daily / realtime 生成脚本后，要确认是否产生 JSON 产物，除非任务明确要求，否则恢复 JSON 产物。

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

## 10. `/goal` 自主循环 review 守则

本节为 Codex `/goal` 等自主循环工具的人工 review 强制要求。`/goal` 跑完声明 complete + `check:all` 全绿,不等于可以 merge。merge 前必须人工核对以下三点;任一点失败必须先修复或回滚,不得跳过。

- **方案一致性**:`/goal` 跑到中途 pause 请示时,用户拍板的方案(例如"走路线 1 不走路线 2")必须等于最终落地的代码。汇报里写"按方案 X 完成"不等于真的按方案 X 完成;必须打开实际文件核对实施清单与代码是否一致。常见的偏离是 pause 时同意路线 1,后续自主循环里"自己说服自己"改成路线 2 但汇报仍称走的是路线 1。
- **Contract checker 完整性**:必须确认 `/goal` 没有为了让 `check:all` PASS 而擅自放宽现有 contract checker。检查方法:在受影响的 contract / checker 文件上跑 `git diff`,确认 assertion 没被删、没被改宽、没被加 skip。Contract checker 的 assertion 变更属于 ADR-level 决策,必须独立 reviewed PR,不得隐藏在 presentation patch 里。
- **Ignore list 显性化**:任何新增的 coverage checker / contract checker 的 ignore list 必须在文件内对每一条 ignore 写明理由(为什么 ignore、对应哪个边界、unlock 路径)。空 ignore list 也必须在文件顶部注释说明"当前为何为空"。无注释的 ignore 是技术债,不得通过 review。

触发 pause 后,Codex 必须把"用户拍板的方案"原文写进 PROJECT_BACKLOG.md 对应任务条目下,作为最终交付物的 acceptance baseline;后续 review 以此为准。

`/goal` 指令模板默认 Done 条件中必须包含一条 self-audit step:在声明 complete 前自己跑一遍上述三点核对,把核对结果写进汇报,而不是只汇报 check:all 通过。

10.4 **AI 不得自主执行 git 状态变更**

Codex / Claude Code 等 AI 工具在执行任何任务时，不得自主执行任何改变 git 状态的命令，即使任务上下文暗示需要。受限命令包括但不限于：git commit、git merge、git push、git reset、git rebase、git checkout -b、git stash、git cherry-pick、git revert、git tag。

正确做法：发现 git 状态需要变更（如需要 commit 当前改动、需要 merge 远端、需要换分支、需要 stash WIP 等）时，必须 pause 并明确请示 owner，由 owner 在 PowerShell 手动执行 git 命令。AI 可以建议具体命令，但不得自主执行。

例外：只读 git 命令可以自主执行用于审计，包括但不限于 git status、git diff、git log、git show、git branch --show-current、git ls-files、git remote -v。

为什么需要这条规则：2026-05-23 M-92A source review 触发本规则。Codex 在没拍板的情况下自主跑了 git merge --ff-only origin/main、git add、git commit、git merge origin/main 等命令，把 V2 spec 和 merge commit 留在 M-91 旧分支上，污染了 git 历史。虽然没 push 到远端，但 owner 必须手动清理 reset + checkout + 新分支 + 重新 commit。本规则保护项目 serial trunk mode 纪律和 owner 对 git 历史的最终控制权。

---

## 历史 milestone reminder

M-36V～M-62 逐版本 scope reminder、G-9B 工具描述、以及更早的 v28.0L-3B-1 audit-sync、
L-3D readiness / L-3E implementation plan / L-3F provider-test workflow skeleton 等
设计文档段落已从本文件移出。Section 1 仍保留正在生效的 K-* 和 L-0~L-3C 等边界规则。
查阅位置:

- **MILESTONE_INDEX.md Archived 段**: [`docs/MILESTONE_INDEX.md`](docs/MILESTONE_INDEX.md)
- **完整快照**: `git show v28.0J-pre-split:AGENTS.md`
