# v28.0I System Upgrade Plan

## 1. Purpose / 目的

本文件用于指导 v28.0I 之后的结构升级，解决当前“模块多、数据多，但用户看完仍然迷糊”的问题。

v28.0I 的目标不是继续堆数据，而是把现有数据、风险模块、Worker-first realtime、World Order overlay 和决策输出组织成更清楚的判断系统。后续升级应围绕以下能力展开：

- 今日总判断
- 主导风险链
- 最大背离
- 关键触发器
- 反证条件
- 新信号纳入机制

所有新增能力都必须先明确边界：哪些只是解释，哪些只是 audit-only / diagnostic-only / display-only，哪些未来才可能进入 scoring / decision。

## 2. Current Stable Baseline / 当前稳定基线

当前稳定基线来自 v28.0H 后段：

- Worker-first runtime 是主链路。
- Check Worker Health 是 hard gate。
- Check Realtime Health 是 fallback / Daily baseline soft observer。
- World Order Stress Overlay v1 已完成 release review，当前仅作为独立 regime overlay 观察。
- Global Risk Heatmap 必须继续独立显示。
- World Order Stress Overlay 必须继续独立显示。
- 六大底层风险模块仍保留。
- 不得把 World Order 当成第七个底层风险模块。
- 不得输出战争概率或煽动性结论。

v28.0I 的任何结构升级都必须保护以上基线，不得通过重写页面或重排数据链路来绕过现有稳定边界。

## v28.0I Stable Baseline

v28.0I release review 与 v28.0I-8B post-deploy audit 已通过。v28.0I 已完成从“多模块数据驾驶舱”到“宏观判断压缩层 + 背离校验层 + Brent 代理审计层”的第一阶段结构升级。

已上线并进入稳定观察：

- Daily Brief / 今日主判断。
- Divergence Layer / 实体压力与金融定价背离。
- Consumer vs Asset Divergence / 消费者体感与风险资产背离。
- Brent Public Proxy Pricing Layer / Brent 公开代理价格层。
- Compact cockpit layout，v28.0I release 对应前端版本为 `28.0I-8`。

当前 live data 已包含 `dailyBrief.contractVersion = v28.0I-1`、`divergenceLayer.contractVersion = v28.0I-3A`、`macroDrivers.consumer`、`consumer_vs_asset_pricing` 与 `brentPricingLayer.contractVersion = v28.0I-5A`。

这些解释层均为 display-only / audit-only / interpretation-only，不影响 `values.*`、`effectiveDisplayInputs`、Brent promotion、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。Worker-first runtime 仍为主链路，Check Worker Health 仍是 hard gate，Check Realtime Health 仍是 fallback / Daily baseline soft observer。World Order Stress Overlay 仍是独立 regime overlay，不是第七个底层风险模块；Global Risk Heatmap 仍必须独立显示。

下一阶段若继续开发，应优先考虑：

1. AI Interpretation Layer Contract。
2. 页面解释文案进一步压缩。
3. Brent term structure candidate。
4. Crack spread / diesel stress candidate。
5. World Order data quality improvement。

任何新信号、新解释层或新数据源都不得直接接入 scoring / decision，必须先按 `docs/SIGNAL_INTAKE.md` 走 audit-only / diagnostic-only / display-only 观察路径。

## v28.0J Stable Baseline

v28.0J 已完成规则化 AI 解释层的 contract、live data activation、frontend display 和 post-deploy audit。v28.0J-2B post-deploy audit 已通过，当前前端版本为 `28.0J-2`。

当前 live data 已包含：

- `dailyBrief.contractVersion = v28.0I-1`
- `divergenceLayer.contractVersion = v28.0I-3A`
- `brentPricingLayer.contractVersion = v28.0I-5A`
- `aiInterpretationLayer.contractVersion = v28.0J-0`

`aiInterpretationLayer.mode` 当前为 `rule_based_structured_interpretation`。它不是外部 AI 输出，而是 rule-based structured interpretation：只把站内结构化数据拆分为已验证事实、数据推断、模型判断、情景假设、数据缺口、反证条件和证据链接，避免把不同确定性层级混在一起。

当前 AI 解释层不调用 DeepSeek / OpenAI / 外部 AI API，`generatedByExternalAi=false`，`usesExternalAiApi=false`。它仅为 display-only / interpretation-only，不参与 scoring、`decisionModel`、`executionLock` 或 `positionGuidance`，也不是投资建议或外部 AI 预测系统。

下一阶段如继续开发，可选方向：

1. External AI API Design / DeepSeek Integration Design。
2. AI output audit and moderation contract。
3. AI news explanation layer。
4. AI one-line conclusion comparison against site data。
5. AI explanation fallback and timeout handling。

任何外部 AI 接入都必须另开版本，先完成 API 接入设计文档、输出审计 contract、禁用文案检查、fallback / timeout / error display，并保持不影响 scoring / decision / execution / position。

> **External AI v28.0K/L design-baseline 阶段史(B-consolidated 折叠 · K-0 → L-3G + K-3):** 以下各阶段为 External AI staged-rollout 的设计/审计/baseline 登记。**当前态:External AI 已 live visible read-only**(`provider=deepseek`,见 `docs/DATA_CONTRACT.md`「当前生产契约」+ 本文下方 L-3P→M-3H 段);各段当时反复声明的 "disabled / NO-GO / non-production / not_ready / non-user-visible" 已被取代。rule-based `aiInterpretationLayer` baseline(`contractVersion=v28.0J-0`、`generatedByExternalAi=false`、`usesExternalAiApi=false`)仍独立成立、不被 external 层覆盖。统一边界:external AI 不进 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules。完整历史见 git history + 对应 `EXTERNAL_AI_*.md`。

- **K-0 / K-1 / K-2 / K-3A** API design baseline:K-0 design-only API/输出审计边界([`EXTERNAL_AI_API_DESIGN.md`](EXTERNAL_AI_API_DESIGN.md));K-1 prompt contract + fixtures([`EXTERNAL_AI_PROMPT_CONTRACT.md`](EXTERNAL_AI_PROMPT_CONTRACT.md),offline-only,非 live data);K-2 offline output validator `check:external-ai-output`(入 check:all);K-3A disabled-by-default `externalAiInterpretationLayer` scaffold(当时 fallback rule-based)。
- **K-3D** stable observation gate:只读 stable-observation audit gate;**M-44 已 deprecate**(绑 disabled-scaffold 期、不匹配 v28.0L+ live 态)。
- **K-4A** manual API test design([`EXTERNAL_AI_MANUAL_TEST_DESIGN.md`](EXTERNAL_AI_MANUAL_TEST_DESIGN.md)):design-only,定义 opt-in/env 边界/validator gating。
- **K-4B** local manual test scaffold:`manual:external-ai:dry-run`(disabled/no-network)。
- **K-4C** disabled provider adapter skeleton:`check:external-ai-provider-adapters`;`deepseek`/`openai` 当时为 refused placeholder。
- **K-4D / K-4D-1** DeepSeek manual API artifact test:首条真实 DeepSeek manual 路径(opt-in/artifact-only/validator-gated via `check:external-ai-output`);K-4D-1 JSON-mode/`max_tokens`/timeout diagnostics hardening。
- **K-4E / 4E-1…4E-4** live/compact manual input:`manual:external-ai:build-input`(读本地 radar-data,写 ignored artifact);compact 输入(~13-14k 字符)、unsafe-wording 全字段守卫、live-data 语义/execution-language 守卫、provider unavailable/timeout 分类 + retry 指引(勿反复付费重试)。
- **K-4F** artifact quality review + promotion gate:offline quality review(`promotionEligible=false`,failure artifact 不可晋升)。
- **K-4G** manual test baseline sync:稳定 manual baseline(K-4D/4E/4F 后);当时仍 manual-only/non-production/non-user-visible,production 须另开 reviewed design PR。

- **L-0** production integration design([`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md)):design-only staged 路径(feature flags/validator/quality/失败处理/cost/rollback 须后续 reviewed PR 分拆)。
- **L-1** implementation readiness audit([`EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md`](EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md)):当时 **NO-GO**,下一步 L-2 disabled skeleton。
- **L-2** disabled production provider path skeleton:`check:external-ai-production-provider-path`(no-network/no-secret;activation 仍返 disabled)。
- **L-3** manual workflow_dispatch artifact-only design([`EXTERNAL_AI_MANUAL_WORKFLOW_DISPATCH_DESIGN.md`](EXTERNAL_AI_MANUAL_WORKFLOW_DISPATCH_DESIGN.md))。
- **L-3B / L-3B-1** dry-run workflow skeleton:`external-ai-manual-dry-run.yml`(dispatch/dry-run-only,无 secret/provider,`check:external-ai-manual-workflow`);L-3B-1 audit run `25583503038` PASS。
- **L-3C** provider-call workflow design([`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md)):design-only。
- **L-3D** provider-call readiness checklist([`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md)):当时 `not_ready_until_missing_items_resolved`(缺 secret 决策/rotation/checker/cost/concurrency 等)。
- **L-3E** provider-call implementation plan([`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md)):no-code 计划。
- **L-3F / L-3F-1** provider-call workflow skeleton:`external-ai-manual-provider-test.yml`(dispatch-only/missing-secret-safe;`check:external-ai-provider-workflow`/`check:external-ai-workflow-artifacts`);L-3F-1 audit run `25591115649` dry-run PASS + `25591202053` missing-secret 安全 FAIL(无 DeepSeek call)。
- **L-3G** secret decision + first provider-call gate([`EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md`](EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md)):决议 GitHub Environment `external-ai-manual` + secret `DEEPSEEK_API_KEY`(repo Actions secret 仅 fallback)。

- **K-3** disabled scaffold baseline:K-3A/3B disabled `externalAiInterpretationLayer` scaffold 进 live(`contractVersion=v28.0K-3A`,当时不调用 API、fallback rule-based、不进 scoring/decision/execution/position)。

## 3. Core Problem / 核心问题

当前系统的问题不是数据不够，而是判断层压缩不足：

- 首页判断压缩不足。
- 模块之间因果链不够显性。
- 缺少“实体压力 vs 金融定价”的背离校验。
- 新指标纳入没有制度化。
- 用户容易看到很多模块但不知道今天最重要的风险链条是什么。

因此，v28.0I 应优先升级信息架构和解释契约，而不是直接增加更多指标、外部源或评分权重。

## 4. Target Information Architecture / 目标信息架构

未来首页应采用以下层级。

### A. 今日总判断层

- 今日宏观状态
- 今日一句话结论
- 今日主导风险链
- 今日最大背离
- 今日关键触发器
- 今日反证条件

### B. Global Risk Heatmap

- 必须独立大块显示。

### C. World Order Stress Overlay

- 必须独立区域显示。
- 只作为 regime overlay。

### D. 四大宏观驱动层

- 增长
- 通胀
- 流动性
- 政策

### E. 风险链条层

- 能源 -> 通胀 -> 利率 -> 资产重新定价
- 流动性 -> 信用 -> 银行 / 杠杆压力
- 世界秩序 -> 供应链 / 能源 / 制裁 -> 市场确认
- 消费者体感 -> 股市定价背离

### F. 六大底层风险模块

- 继续保留，但作为底层风险引擎，不再承担首屏主判断职责。

### G. 高级审计区

- 传导网络、规则审计、情景树、历史趋势等继续默认折叠或放在后段。

## 5. Six-Phase Upgrade Roadmap / 六阶段升级路线

### Phase 0: System Upgrade Plan & Signal Intake Framework

- docs only
- 不改 runtime
- 不改 data
- 不改 frontend
- 不改 Worker

### Phase 1: Daily Brief Data Contract

- 新增 `dailyBrief` / `dominantRiskChain` / `largestDivergence` / `invalidationSignals`。
- 不改变 `decisionModel` / `executionLock` / `positionGuidance`。
- 先在 Daily pipeline 生成结构化解释字段。
- v28.0I-1 introduces dailyBrief data contract.
- Still no frontend rendering.
- Still no scoring / decision integration.

### Phase 2: Daily Brief Frontend Display

- 首页新增今日主判断区域。
- 修改前端时必须 bump frontend asset version。
- 只展示，不改评分。
- v28.0I-2 adds the read-only Daily Brief frontend display.
- Missing `dailyBrief` must render a gentle fallback.
- Still no scoring / decision / execution integration.

### Phase 3: Divergence Layer MVP

- 新增实体压力与金融定价背离层。
- 第一版优先使用现有数据，不新增外部源。
- 先 audit-only / display-only。
- 不进入主评分。
- v28.0I-3A introduces `divergenceLayer` data contract.
- Still no scoring / decision / execution integration.
- Uses existing Daily pipeline and realtime fields only.
- v28.0I-3B adds the read-only Divergence Layer frontend display.
- Missing `divergenceLayer` must render a gentle fallback.

### Phase 4: Consumer vs Asset Divergence

- 接入或使用月频消费者信心数据。
- 与 S&P 500 做背离观察。
- 先 Daily / baseline 层，不放入 Worker required fields。
- v28.0I-4A introduces consumer sentiment data contract and consumer-vs-asset divergence check.
- No frontend rendering yet.
- Still no scoring / decision / execution integration.

### Phase 5: Brent Physical/Futures Proxy Formalization

- 明确 Brent spot / physical proxy、Brent futures proxy、confirmation source 的边界。
- 可先使用公开 proxy，不等同于 Platts Dated Brent。
- 不改变 `values.brent` 和 Brent promotion。
- v28.0I-5A introduces Brent public proxy pricing layer data contract.
- Uses existing data only.
- No Brent promotion / scoring / decision integration.
- v28.0I-5C adds the read-only Brent public proxy pricing layer frontend display.
- Missing `brentPricingLayer` must render a gentle fallback.
- v28.0I-8 compacts the cockpit layout by moving data health earlier and folding Divergence / Brent audit details by default.

### Phase 6: AI Interpretation Layer Contract

将 AI 解释层拆成：

- 已验证事实
- 数据推断
- 模型判断
- 情景假设
- 数据缺口
- 反证条件

不允许 AI 生成无来源、煽动性、确定性危机文案。

- v28.0J-0 introduces `aiInterpretationLayer` data contract.
- Rule-based structured interpretation only.
- No external AI API; no DeepSeek / OpenAI integration.
- v28.0J-2 adds read-only compact frontend rendering under Daily Brief.
- Facts, data inferences, model judgments, scenarios, data gaps, invalidations and evidence links remain folded by default.
- No scoring / decision / execution / position integration.

## 6. Risk Boundaries / 风险边界

明确禁止：

- 不得让新指标直接改变 `executionLock`。
- 不得让新指标直接改变 `positionGuidance`。
- 不得把 Brent validation `recommendedValue` 直接当主值。
- 不得绕过 `effectiveDisplayInputs`。
- 不得把 secondary diagnostics 接入主 `values.*`。
- 不得把 World Order 接入 `decisionModel`，除非未来另开版本并明确评审。
- 不得把 World Order 写成战争预测。
- 不得让新增数据源缺少 timeout / fallback / diagnostics / sourceStatus。
- 不得为了显示漂亮而伪造或填充数据。

## 7. Validation Strategy / 验证策略

后续每个阶段必须：

- 一个 PR 一个逻辑任务。
- 基于 latest main。
- 修改前端必须 bump frontend asset version。
- 修改 JS/MJS 必须 `npm run check:all`。
- 修改数据契约必须 `npm run check:data` 和 `npm run check:all`。
- 修改 docs 必须 `npm run check:docs` 和 `npm run check:all`。
- 不把 commit/push 混入开发指令。

> **External AI / Market Pricing / Editorial 阶段 roadmap 史(B-consolidated 折叠 · L-3H → M-3H-1):** 以下各阶段为升级路线的设计/实施/审计登记。**当前态以 `docs/DATA_CONTRACT.md`「当前生产契约」+ `docs/OPERATIONS.md` 运维 runbook 为准**(External AI 已 live visible read-only;Market Pricing Temperature 已 has_history / M-27 active);各段当时的 "NO-GO / not_ready / disabled / waiting-for-history" 已被取代。统一边界:不进 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules;market-pricing 勿手编/伪造,editorial(N-*)为前端版面。完整历史见 git history + 对应 scope docs。

- **L-3H** Provider-Call Unlock Workflow:`External AI Manual Provider Test` 首条真实 DeepSeek 路径仅经 Environment `external-ai-manual` + step-scoped `DEEPSEEK_API_KEY`,首跑限 `fixture_sample`;artifact-only/non-production。
- **L-3H-1** provider-call audit + sanitizer fix:run `25592238444`(transport/output 过,quality `needs_prompt_revision`,sanitizer 拦含 marker 的 diagnostic JSON);修 diagnostic JSON 不含字面 secret 名。
- **L-3H-2** fixture prompt/quality revision:仅改 prompt/quality 指引(不跑 provider);live/local 仍 not_ready until fixture quality 过。
- **L-3H-3** second fixture provider-call audit:run `25593082968` PASS(deepseek-v4-flash,quality `pass_for_manual_review`,sanitizer PASS)。
- **L-3I** local_compact provider-call design:future local_compact 路径设计(不跑 provider)。
- **L-3I-0** Node 24 runtime baseline unification:统一 Node 24 LTS(`.nvmrc`/`.node-version`、engines、actions majors、`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`、`check:node-runtime`)。
- **L-3J** local_compact provider-call workflow path:实现 local_compact artifact-only 路径(PR 不跑 provider);input 自本地结构化数据,无 source-URL live fetch。
- **L-3J-1** local_compact sanitizer source path fix:修 run `25598085025` sanitizer 误报;允许引用 `data/radar-data.json` 作只读 source metadata,禁上传实际文件。

- **L-3J-3** local_compact execution-language prompt fix:run `25598379612` quality 拦 `$.facts[5]` 的 `执行灯`;强化 prompt 禁复述 `decisionContext` 操作语言 + dry-run prompt contract check。
- **L-3J-4** local_compact provider-call audit sync:run `25598887574` PASS(全链路过,`promotionEligible=false`/`productionDataWritten=false`)。
- **L-3K** production integration readiness review([`EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md`](EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md)):manual artifact-only 就绪(`fixture_sample`/run `25593082968`、`local_compact`/run `25598887574` 已验);production write/frontend/Daily/auto-call 当时 NO-GO。
- **L-3L** production data contract design([`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md)):设计 production schema(status/provenance/freshness/quality/content-safety/validator/write-gate/frontend-gate);当时 NO-GO。
- **L-3M** production contract validator scaffold:`scripts/check-external-ai-production-contract.mjs` + valid fixture + `check:external-ai-production-contract`(入 check:all);当时 NO-GO。
- **L-3N** production projection dry-run:`project:external-ai-production:dry-run` + `check:external-ai-production-projection`(只写 ignored artifact + 校验);当时 NO-GO。

- **L-3O** first controlled write design + guard:`docs/EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md` + `check:external-ai-production-write-guard`(入 check:all);当时 write NO-GO。
- **L-3P** first controlled production write:从 run `25598887574` 首次 data-only 写入 layer(`scripts/write-external-ai-production-data.mjs` / `write:external-ai-production`;当时 `displayEnabled=false`/`promotionEligible=false`)。
- **L-3P-1** first write audit-sync:首 write post-merge 稳定(contract / write-guard / check:data / check:all PASS;当时 frontend disabled)。
- **L-3Q** frontend display design([`EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md`](EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md)):中文文案;须 `displayEnabled=true`+`frontendDisplayApproved=true` 才显示(当时 NO-GO)。
- **L-3R** hidden frontend scaffold:`external-ai-display-panel` hidden 容器 + `check:external-ai-frontend-hidden-scaffold`(两 flag false 时隐藏)。
- **L-3S** visible display approval + data-flag design([`EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md`](EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md)):文档 data-flag 流程(当时两 flag 仍 false)。
- **L-3T** visible display flag enablement:**当时置 `displayEnabled=true` + `boundaries.frontendDisplayApproved=true`(= 当时 visible 态)**;不改 AI 文本/前端代码。该旧 panel 已于 2026-08-11 退场。
- **L-3T-1** visible display audit-sync:可见 flags post-merge 审计 PASS(contract / write-guard / hidden-scaffold / check:data / check:all)。

- **L-3U** visible display UX polish:仅 polish 已可见 panel(`data/radar-data.json` / AI 文本不变)。
- **L-3U-1** visible display UX audit-sync:UX polish post-merge PASS;External AI 展示线收官。
- **L-4A** production refresh workflow:`External AI Production Refresh`(dispatch + daily `23:50 UTC`,env `external-ai-production-refresh` + `DEEPSEEK_API_KEY`);每轮 1 次 DeepSeek→validate→quality→sanitize→project→只写 `externalAiInterpretationLayer`,保 visible flags,Daily 管线分离。
- **L-4A-1** refresh workflow audit-sync:首个 manual run `25611392014` PASS(commit `c32af65`,只改 `data/radar-data.json`,artifact `…-25611392014` / ID `6898516584` / 3天)。
- **L-4B** display coverage polish:展示 `modelJudgments` / `scenarioHypotheses` / `sourceAttribution` / `qualityReview` 的 capped 安全摘要(`textContent`;raw provider output/provenance/run ID/artifact ID 隐藏)。
- **L-4B-1** display coverage audit-sync:coverage post-merge PASS;External AI integration / visible / refresh / coverage 线收官。
- **L-4C** refresh monitoring / failure notification design([`EXTERNAL_AI_REFRESH_MONITORING_DESIGN.md`](EXTERNAL_AI_REFRESH_MONITORING_DESIGN.md)):定义监控/失败类/阈值/no-go;首推 GitHub native failed-workflow 通知;issue/webhook/Slack/email 自动化未实现;无 provider retry loop / 无额外 schedule。

- **M-1** homepage IA skeleton:首页转向 `宏观风险判断总览`(只读;judgment/pressure/signal/driver/温度占位/risk-engine/cross-validation);rule-based AI 降为次级证据(保 DOM id);External AI panel 独立 gated;Heatmap 独立。
- **M-2** homepage judgment content calibration:校准总览文案(score/stage 解读、pressure 优先级、signal 分层、driver 摘要、保守 cross-validation);温度 waiting。
- **M-3** unified judgment data structure:统一 macro overview 卡片判断对象(status/direction/evidence/missing/counter/noise/confidence/coverage/explanation/conclusion);温度 waiting。
- **M-24** market pricing first real record write:首个可写 `data/market-pricing-history.json` 的 step(两阶段手动确认;**M-62 升级为 weekly `isoWeek`-keyed merge**;`--commit-to-history` 才真写、8 项 sanity check + atomic write;CI 不跑 :commit;无 MA60/z-score)。**运维命令以 `docs/OPERATIONS.md` M-24 节为准。**
- **M-5** temperature data source design([`MARKET_PRICING_TEMPERATURE_DATA_SOURCE_DESIGN.md`](MARKET_PRICING_TEMPERATURE_DATA_SOURCE_DESIGN.md)):记录数据可得性(SPX 有、Nasdaq/NDX/QQQ/Russell 当时无)+ 候选源 + no-go 防伪造;温度 waiting。
- **M-6** history contract scaffold:`data/market-pricing-history.json` scaffold-only(QQQ/NDX/IXIC/SPX 空 records,SPX fallback)+ `check:market-pricing-history`。
- **M-7** source adapter dry-run design:`market-pricing:source-adapter:dry-run` + checker(本地、不抓网、只写 ignored artifact)。
- **M-8** artifact-only fetch design([`MARKET_PRICING_ARTIFACT_ONLY_FETCH_DESIGN.md`](MARKET_PRICING_ARTIFACT_ONLY_FETCH_DESIGN.md)):future artifact-only fetch 设计 + checker。

- **M-9** artifact-only fetch scaffold:`market-pricing:artifact-fetch:scaffold` + checker(`--allow-network` 仅记录并拒绝;只写 ignored artifact)。
- **M-10** artifact sanitizer design/scaffold:`market-pricing:artifact-sanitizer:scaffold` + valid/invalid fixtures + checker(拒敏感字段/source URL/计算/交易建议/write flags)。
- **M-11** real-record contract design([`MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md`](MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md)):future artifact/record-level 周记录契约 + checker(fixture `records=[]`)。
- **M-12** real-record sanitizer scaffold:扩 sanitizer 验 synthetic real-record fixtures + checker(`recordsAcceptedForHistory=0`/`readyForProductionWrite=false`)。
- **M-13** source selection review([`MARKET_PRICING_SOURCE_SELECTION_REVIEW.md`](MARKET_PRICING_SOURCE_SELECTION_REVIEW.md)):治理-only(QQQ preferred、SPX fallback;全 approval flags=false)。
- **M-14** proof-of-source design([`MARKET_PRICING_PROOF_OF_SOURCE_DESIGN.md`](MARKET_PRICING_PROOF_OF_SOURCE_DESIGN.md)):source-specific proof 设计(QQQ target,Stooq/public CSV design-only;全 approval flags=false)。

- **M-15** source-specific artifact fetch scaffold:`market-pricing:source-specific-artifact-fetch:scaffold`(QQQ target meta、Stooq/public CSV label-only;网络禁用、拒 `--allow-network`;全 approval flags=false)+ checker。
- **M-15A** unified data pipeline architecture sync([`UNIFIED_DATA_PIPELINE_ARCHITECTURE.md`](UNIFIED_DATA_PIPELINE_ARCHITECTURE.md)):定义五层(daily_history/realtime_worker/github_actions_backup_validation/artifact_sanitizer/frontend_display)+ checker;market-pricing-history 归 daily_history、source-specific artifact 归 artifact_sanitizer;禁 standalone/ad hoc 管线。
- **M-16** network gate design([`MARKET_PRICING_NETWORK_GATE_DESIGN.md`](MARKET_PRICING_NETWORK_GATE_DESIGN.md)):定义未来网络闸门(全 gate flags=false)+ checker。
- **M-17** network gate scaffold:closed gate(`network-gate:scaffold`;`--allow-network` 仍拒;rejection reasons `source_not_approved`/`live_fetch_not_approved`/`network_gate_not_approved`)+ checker。
- **M-18** source compliance review scaffold:`source-compliance-review:scaffold`(`sourceComplianceReviewed=false`、7 项 checklist false、拒 `--mark-reviewed`、无 URL/secret)+ checker。
- **M-19** symbol mapping verification design([`MARKET_PRICING_SYMBOL_MAPPING_VERIFICATION_DESIGN.md`](MARKET_PRICING_SYMBOL_MAPPING_VERIFICATION_DESIGN.md)):design-only(`symbolMappingApproved=false`、`noSpxSubstitution=true`)+ checker。
- **M-20** source format verification design([`MARKET_PRICING_SOURCE_FORMAT_VERIFICATION_DESIGN.md`](MARKET_PRICING_SOURCE_FORMAT_VERIFICATION_DESIGN.md)):design-only(`sourceFormatApproved=false`、`noPriceFabrication`/`noHtmlErrorPageMasquerade=true`)+ checker。
- **M-21** network open (throttled):**首个可跑 fetch() 的 step**(default dry-run、需 `--network=open-throttled`;max 1 fetch/30s/1 retry;URL 取自 manifest;只写 `manual-artifacts/.../network-fetch-attempts/`、`records=[]`)+ checker。
- **M-22** manual weekly input sanitizer design([`MARKET_PRICING_MANUAL_WEEKLY_INPUT_SANITIZER_DESIGN.md`](MARKET_PRICING_MANUAL_WEEKLY_INPUT_SANITIZER_DESIGN.md) + [`MARKET_PRICING_SOURCE_INCIDENT_LOG.md`](MARKET_PRICING_SOURCE_INCIDENT_LOG.md)):因 2026-05-12 Stooq 端点变更正式弃用 M-21 auto-fetch(脚本留存待重启)、改人工周度下载;design-only + checker。
- **M-23** manual weekly input sanitizer scaffold:executable(`manual-weekly-input-sanitizer:dry-run`/`:run`;读 `manual-weekly-input/` CSV → `sanitized-output/`;不写 history=M-24)+ checker。

> **Editorial redesign 史(N 系列,display-layer only)** — 全部仅前端展示层(Bubble Watch-inspired 编辑式皮肤),不改 data/scoring/decision/execution/position/workflows/External AI/Market Pricing;温度 waiting-for-history 不变。按文件历史顺序:

- **N-1** first fold:hero 转 masthead-style briefing header + display-only 风险阶段刻度。
- **N-2** pressure source reading polish:压力来源转 evidence category + status counts/指示卡。
- **N-3** signal layer reading polish:信号分层转 evidence taxonomy(verified/pending/noise/data-gap bucket counts)。
- **N-4** paper background + font stack:暖纸背景 + display/serif/mono 字体栈变量(无外部 font/CDN URL)。
- **N-5** macro drivers reading polish:四大驱动转 evidence category(growth/inflation/liquidity/policy 分列)。
- **N-6** market temperature waiting-state polish:温度区转 intentional editorial waiting-state(QQQ/Nasdaq weekly/MA60/std/z-score gap 可见)。
- **N-7** risk engines reading polish:风险引擎转 risk-transmission evidence category。
- **N-8** cross-validation reading polish:交叉验证转 evidence-confirmation category。
- **N-9** global risk heatmap polish:Heatmap 转 editorial standalone visual block(保 `global-risk-heatmap`/`world-heatmap`/`heatmap-list`)。
- **N-10** detailed data appendix polish:详细数据转 secondary editorial appendix(保 `detail-data`/realtime inputs/charts/tables)。
- **N-11** method/evidence/boundary appendix polish:方法说明转 secondary appendix(保 `method-evidence`)。
- **N-12** external AI read-only panel polish:External AI panel paper-style 处理、保 auxiliary read-only(`external-ai-display-panel`、hidden/aria-hidden)。
- **N-13** inline dark theme cleanup:清 index.html 残留 dark inline 样式以统一 paper theme(无外部 font/CDN URL)。
- **N-14** big number + threshold scale polish:强化 `GLOBAL RISK SCORE` Big Number + `TODAY'S VERDICT` 卡(阈值带对齐 `stageFromScore`)。
- **N-15** key changes + watch list:`KEY CHANGES` + `WHAT TO WATCH`/下一步验证清单 叙事块(仅用既有结构化数据/missing/counter/pending)。
- **N-16** editorial redesign contract guard:guard/validation-only,保护 editorial 结构 / paper theme / 温度 waiting / External AI read-only / Heatmap standalone 边界。

- **M-7U** homepage de-duplication + detail collapse:Macro Risk Overview 单一主判断入口、Daily Brief 降为 collapsible evidence;+ `check:homepage-ia-contract`;bump asset `28.0M-7U`。
- **M-7V** homepage reading path repair:顶部导航走客户路径(今日总判断→压力来源→信号分层→四大驱动→市场温度→风险引擎→交叉验证→风险热力图→详细数据→方法说明);生成前 7 块真锚点;`#detail-data`/`#method-evidence` 分组;bump asset `28.0M-7V`。
- **M-7V-1** reading path UX audit sync:M-7V merged `f9b1d4c #126`、post-merge audit PASS;生成锚点稳定(`homepage-today-judgment`…`homepage-cross-validation`);non-blocking `check:world-order` warn(gdelt stale/sipri manual/acled not_configured)。
- **M-4** macro overview structure audit sync:记录 M-1/M-2/M-3/M-3H/M-3H-1 line 完成;当前结构=今日总判断/主要压力来源/信号分层/四大宏观驱动/市场定价温度计 waiting/五大风险引擎摘要/风险交叉验证。
- **M-3H** external AI layer preservation hotfix（历史实现，兼容规则仍保留）:普通 radar refresh 可原样保留 contract-valid `externalAiInterpretationLayer`；旧 `External AI Production Refresh` 已于 2026-08-11 退役，旧字段无可见消费者。**当前契约以 `docs/DATA_CONTRACT.md` 为准**。
- **M-3H-1** preservation hotfix audit sync:记录 M-3H post-merge audit PASS(`check:external-ai-production-contract`/`-write-guard`/`-frontend-hidden-scaffold`/`check:all` 全 PASS)。
