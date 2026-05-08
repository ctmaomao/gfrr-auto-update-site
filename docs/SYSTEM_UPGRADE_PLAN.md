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

## v28.0K External AI API Design Baseline

v28.0K-0 是 design-only documentation PR，用于定义未来 DeepSeek / OpenAI / external AI API integration 的设计和输出审计边界。详细入口见 [`EXTERNAL_AI_API_DESIGN.md`](EXTERNAL_AI_API_DESIGN.md)。

当前 v28.0J rule-based `aiInterpretationLayer` 仍是 baseline：`contractVersion = v28.0J-0`、`mode = rule_based_structured_interpretation`、`generatedByExternalAi=false`、`usesExternalAiApi=false`。未来外部 AI 必须作为单独的 `externalAiInterpretationLayer` 设计，不得替换或覆盖现有 `aiInterpretationLayer`。

任何外部 AI API integration 都必须先从 design and output audit 开始，并保持 display-only / commentary-only 边界。不得直接进入 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。

v28.0K-1 是 prompt contract and sample fixtures only，入口见 [`EXTERNAL_AI_PROMPT_CONTRACT.md`](EXTERNAL_AI_PROMPT_CONTRACT.md)。本阶段不接 API、不写 secrets、不做 production display、不进入 scoring / decision integration；`docs/fixtures/external-ai/*.json` 仅为 offline/manual prompt design artifacts，不是 live data。

v28.0K-2 新增 offline external AI output validator and banned-copy checker：`npm run check:external-ai-output`，并纳入 `check:all`。本阶段仍不接 API、不做 production display、不进入 scoring / decision integration；validator 只检查本地 sample / future output artifact 的 contract、boundaries、source attribution、banned copy 和 overreach，不导入 runtime。

v28.0K-3A 新增 disabled-by-default production data scaffold：`externalAiInterpretationLayer`。该字段只记录 external AI 当前 disabled，并 fallback 到 rule-based `aiInterpretationLayer`；不接 API、不写 secrets、不做 frontend display、不进入 scoring / decision / execution / position。旧 data 缺少该字段时，`check:data` 可 warning 不失败，等待 Daily 在 fresh / aging realtime 条件下自然生成。

## v28.0K-3D Stable Observation Automation Gate

v28.0K-3D adds a read-only Stable Observation Audit automation gate before v28.0K-4. It provides local command `npm run audit:stable-observation` and GitHub Actions workflow `Stable Observation Audit`.

The gate checks whether the v28.0K baseline remains stable across design docs, prompt fixtures, offline validator, disabled `externalAiInterpretationLayer`, live data, Worker Health, realtime-data Health, frontend reachability, and forbidden-copy boundaries. This stage does not connect DeepSeek / OpenAI / external AI APIs, does not add frontend display, and does not affect scoring / decision / execution / position.

## v28.0K-4A Disabled-by-Default Manual API Test Design

v28.0K-4A adds [`EXTERNAL_AI_MANUAL_TEST_DESIGN.md`](EXTERNAL_AI_MANUAL_TEST_DESIGN.md). It is design-only: no API, no secrets, no provider SDK, no workflow for external AI calls, no frontend display, and no production data change.

This stage prepares future v28.0K-4B / v28.0K-4C manual test scaffolding by defining opt-in execution, environment-variable boundaries, non-production input/output handling, validator gating, fallback behavior, and production isolation. It does not affect scoring / decision / execution / position.

## v28.0K-4B Local Manual Test Scaffold

v28.0K-4B adds `npm run manual:external-ai:dry-run`, a local manual test scaffold that is disabled and no-network by default. It is not a provider adapter, does not call API, does not read secrets, does not write production data, and does not change frontend display or scoring / decision / execution / position.

The scaffold prints a readiness report from controlled sample input and prepares v28.0K-4C, where any provider adapter would still require explicit review and an environment gate.

## v28.0K-4C Disabled Provider Adapter Skeleton

v28.0K-4C adds disabled provider adapter structure and `npm run check:external-ai-provider-adapters`. It normalizes future provider values (`none`, `deepseek`, `openai`) and returns disabled metadata / diagnostics only.

This stage does not connect API, does not read secrets or API keys, does not use network, does not add provider SDKs, does not write production data, and does not change frontend display or scoring / decision / execution / position. `deepseek` and `openai` remain refused placeholders until a separate reviewed PR explicitly changes that boundary.

## v28.0K-4D DeepSeek Manual API Artifact Test

v28.0K-4D adds the first real DeepSeek manual API path. It is explicit opt-in, artifact-only, and validator-gated via `check:external-ai-output`.

This stage does not add scheduled external AI workflows, does not write production data, does not change frontend display, and does not affect scoring / decision / execution / position. OpenAI remains disabled. Production `externalAiInterpretationLayer` remains disabled and continues to fallback to the rule-based `aiInterpretationLayer`.

## v28.0K-4D-1 DeepSeek Manual Response Diagnostic Hardening

v28.0K-4D-1 is a narrow fix to the existing DeepSeek manual artifact path after an observed empty `message.content` response. It hardens JSON mode with thinking disabled, larger `max_tokens`, stronger JSON-only prompt language, and sanitized failure diagnostics for manual review.

This stage does not add dependencies, SDKs, secrets, production data writes, frontend display, Worker changes, workflows, or scoring / decision / execution / position impact. Manual artifacts remain ignored and must not be promoted into production data.

## v28.0K-3 Disabled External AI Scaffold Baseline

v28.0K-3A 已添加 disabled-by-default `externalAiInterpretationLayer` data scaffold。v28.0K-3B activation audit 已通过，live data 已包含 `externalAiInterpretationLayer.contractVersion = v28.0K-3A`。

该 scaffold 不是 external AI output，不调用 DeepSeek / OpenAI / 任何外部 AI API，不用户可见，并且 fallback 到现有 rule-based `aiInterpretationLayer`。它不影响 scoring / decision / execution / position，不改变 Action Queue、Trigger Monitor 或 Invalidation Rules。

未来 external AI 工作仍必须继续沿 promotion ladder 推进，并先通过 prompt contract、output validator、fallback handling、source attribution 和 display review。

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
