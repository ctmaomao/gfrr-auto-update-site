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

## v28.0K-4E Live Site Manual Input Artifact

v28.0K-4E adds `npm run manual:external-ai:build-input`, a deterministic manual input artifact builder for real site-structured `radar-data.json`. It reads local `data/radar-data.json` by default, may read an explicitly allowlisted live site URL, and writes only to ignored `manual-artifacts/external-ai/*.json` paths.

This remains manual-only and validator-gated. It does not create production external AI, does not display external AI output in the frontend, does not call DeepSeek by itself, does not read API keys, and does not affect scoring / decision / execution / position. The purpose is to prepare manual real-data DeepSeek quality review without promoting artifacts into production.

## v28.0K-4E-1 Compact Live Input and Timeout Diagnostics

v28.0K-4E-1 adds compact manual input generation for live site-structured `radar-data.json` and improves DeepSeek manual timeout diagnostics. Compact artifacts are intended for real-data manual quality review after the full live input proved too large for the current JSON-mode request / timeout envelope.

This stage remains manual-only and artifact-only. It does not run a real DeepSeek call automatically, does not add secrets, SDKs, dependencies, workflows, frontend display, Worker changes, production data writes, or scoring / decision / execution / position impact. Timeout failure artifacts may include request diagnostics such as timeout and approximate input size, but must not include API keys, headers, or raw request bodies.

## v28.0K-4E-2 Global Unsafe Wording Prompt Guard

v28.0K-4E-2 tightens the manual DeepSeek prompt after compact live input successfully reached the provider but failed local output validation because unsafe wording appeared in `modelJudgments`. The fix applies unsafe wording rules globally across returned string fields and keeps boundary semantics in `boundaries` booleans.

This stage does not weaken the validator, does not run a real DeepSeek call automatically, does not write production data, does not display external AI output, and does not affect scoring / decision / execution / position.

## v28.0K-4E-3 Live Data Semantics and Execution-Language Guard

v28.0K-4E-3 improves manual DeepSeek output semantics after compact live input passed validation but still used sample wording and repeated concrete execution / position fields. Manual input artifacts now mark local/live `radar-data.json` as site-structured data, and the prompt reserves sample attribution only for fixture inputs.

This stage keeps `decisionContext` read-only, prevents concrete execution / position details from being repeated in external AI output, does not weaken the validator, does not run a real DeepSeek call automatically, does not write production data, and does not affect scoring / decision / execution / position.

## v28.0K-4E-4 Provider Unavailable Classification and Retry Guidance

v28.0K-4E-4 adds normalized failure categories and retry guidance for manual DeepSeek failure artifacts. Provider-side HTTP 503 and timeout / abort failures are classified as diagnostic, non-production availability issues, with guidance to stop repeated paid calls and retry later only after reviewing diagnostics.

This stage keeps failure artifacts manual-only and ignored. It does not weaken the output validator, does not run a real DeepSeek call automatically, does not write production data, does not display external AI output, and does not affect scoring / decision / execution / position.

## v28.0K-4F External AI Artifact Quality Review and Promotion Gate

v28.0K-4F adds an offline manual quality review gate for external AI artifacts. It separates structural validation from product-quality eligibility by checking incremental value, live/sample semantics, execution / position language, unsupported external verification claims, source attribution, confidence, output structure, and display-only boundaries.

This stage remains manual-only and artifact-only. `promotionEligible` stays false, provider failure artifacts cannot be promoted, and any future production or frontend integration still requires a separate reviewed PR.

## v28.0K-4G External AI Manual Test Baseline Sync

v28.0K-4G records the stable manual external AI baseline after v28.0K-4D / 4E / 4F:

- v28.0K-4D provides the explicit DeepSeek manual artifact path, gated by `--allow-network`, `--validate-output`, a safe manual artifact path, and local `DEEPSEEK_API_KEY`.
- v28.0K-4E provides local / allowlisted live / compact manual input artifacts for site-structured `radar-data.json`; compact live input reduced manual test size to roughly 13k-14k characters and one compact live DeepSeek artifact passed `check:external-ai-output` with warnings 0.
- v28.0K-4E-4 provides normalized provider failure classification for diagnostic artifacts, including `provider_unavailable` and `provider_timeout`.
- v28.0K-4F provides the offline artifact quality review gate and keeps `promotionEligible=false`.

External AI remains manual-only, artifact-only, validator-gated, quality-review-gated, non-production, and non-user-visible. No Daily pipeline, frontend display, production data write, scoring, decision, execution, position, GitHub Actions automation, or Worker runtime integration exists.

The next stage must be a separate reviewed design PR before any production integration. Passing `check:external-ai-output` or `review:external-ai-artifact` is not sufficient for production promotion.

## v28.0L-0 External AI Production Integration Design

v28.0L-0 adds [`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md). It is production integration design only: no code, no provider call, no secrets, no workflow automation, no production data write, no frontend display, and no scoring / decision / execution / position impact.

The design defines a future staged path from manual artifacts toward a disabled-by-default production integration. Any implementation must be split into later reviewed PRs with feature flags, validator and quality gates, provider failure handling, cost controls, rollback/disable switches, and frontend visibility reviewed separately.

## v28.0L-1 External AI Implementation Readiness Audit

v28.0L-1 adds [`EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md`](EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md). It is documentation-only and records the current decision as **NO-GO for production integration**.

The only recommended next implementation path is v28.0L-2 Disabled Production Provider Path Skeleton — No Provider Calls. Do not proceed directly to workflow provider calls, Daily integration, production data writes, frontend display, secrets, or enabled `externalAiInterpretationLayer`.

## v28.0L-2 Disabled Production Provider Path Skeleton

v28.0L-2 adds a disabled production provider path skeleton and `npm run check:external-ai-production-provider-path`. The skeleton is no-network, no-secret, no-workflow, no-frontend, and no-production-write; activation attempts still return a disabled state.

This stage does not call providers, does not read API keys, does not add GitHub secrets, does not write production data, does not change frontend display, and does not affect scoring / decision / execution / position.

## v28.0L-3 Manual Workflow Dispatch Artifact-Only Design

v28.0L-3 adds [`EXTERNAL_AI_MANUAL_WORKFLOW_DISPATCH_DESIGN.md`](EXTERNAL_AI_MANUAL_WORKFLOW_DISPATCH_DESIGN.md). It designs a future manual `workflow_dispatch` artifact-only external AI test path, but adds no workflow, no secret, no provider call, no artifact upload, no production data write, and no frontend display.

The next stage should be v28.0L-3B Manual Workflow Dispatch Dry-Run Skeleton — No Secret / No Provider Call. Do not jump from L-3 directly to provider-call workflow, Daily integration, production data write, or frontend display.

## v28.0L-3B Manual Workflow Dispatch Dry-Run Skeleton

v28.0L-3B adds `.github/workflows/external-ai-manual-dry-run.yml` and `npm run check:external-ai-manual-workflow`.

The workflow is `workflow_dispatch` only and dry-run-only. It has no provider input, no allow-network input, no secret reference, no provider call, no production data write, no frontend change, no Worker change, and no Daily integration. It can run the external AI dry-run scaffold and upload only sanitized dry-run diagnostics with short retention.

The next stage must be a separate L-3C PR if provider-call workflow behavior is ever considered.

## v28.0L-3B-1 Manual Dry-Run Workflow Audit Sync

v28.0L-3B-1 records successful manual GitHub Actions `workflow_dispatch` audit run `25583503038` for the dry-run workflow skeleton.

This stage changes documentation only. It makes no workflow change, no provider call, no secret addition, no production data write, no frontend change, no Worker change, and no scoring / decision / execution / position change.

The next possible stage remains L-3C as a separate reviewed PR if provider-call workflow behavior is pursued. L-3C must not be merged into this audit-sync PR.

## v28.0L-3C External AI Provider-Call Workflow Design

v28.0L-3C adds [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md). It is provider-call workflow design only.

This stage makes no workflow change, adds no secret, runs no provider call, writes no production data, changes no frontend, changes no Worker, and has no scoring / decision / execution / position impact. Existing v28.0L-3B dry-run workflow behavior remains dry-run-only.

Any provider-call implementation must be a separate reviewed PR and remain artifact-only / non-production unless a later reviewed phase explicitly changes that boundary.

## v28.0L-3D Provider-Call Workflow Readiness Checklist

v28.0L-3D adds [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md). It is a documentation-only readiness checklist and go/no-go gate before any provider-call workflow implementation.

This stage makes no workflow change, adds no secret, runs no provider call, writes no production data, changes no frontend, changes no Worker, changes no config/data/realtime files, and has no scoring / decision / execution / position impact. Existing v28.0L-3B dry-run workflow behavior remains dry-run-only.

Current readiness decision: provider-call implementation is still `not_ready_until_missing_items_resolved`. Missing items include GitHub secret storage decision, secret rotation/revocation, provider-call workflow static checker, missing-secret failure test plan, artifact sanitization checker, operator approval process, cost budget, and concurrency policy.

Recommended next PR is v28.0L-3E Provider-Call Workflow Implementation Plan — No Code. A faster missing-secret-safe workflow skeleton remains possible only if explicitly approved and must still avoid real provider calls.

## v28.0L-3E Provider-Call Workflow Implementation Plan

v28.0L-3E adds [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md). It is a documentation-only implementation plan that converts the L-3D readiness gaps into a concrete next-step plan.

This stage makes no workflow change, adds no secret, runs no provider call, writes no production data, changes no frontend, changes no Worker, changes no config/data/realtime files, and has no scoring / decision / execution / position impact. Existing v28.0L-3B dry-run workflow behavior remains dry-run-only.

The plan recommends v28.0L-3F Manual Provider-Call Workflow Skeleton — Missing-Secret Safe / No Real Provider Call. L-3F should test workflow structure, static checks, artifact sanitization, and missing-secret fail-before-provider-call behavior before any secret is configured or any real provider call is attempted.

## v28.0L-3F Manual Provider-Call Workflow Skeleton

v28.0L-3F adds `.github/workflows/external-ai-manual-provider-test.yml`, `npm run check:external-ai-provider-workflow`, and `npm run check:external-ai-workflow-artifacts`.

The provider-test workflow is `workflow_dispatch` only and missing-secret safe. Default runs are dry-run only. Provider-path runs without a configured `DEEPSEEK_API_KEY` fail before any provider command, and L-3F also blocks real provider calls if a secret is accidentally present.

This stage adds no GitHub secret, runs no real provider call, produces no provider output artifact, writes no production data, changes no frontend, changes no Worker, and has no scoring / decision / execution / position impact. Existing v28.0L-3B dry-run workflow behavior remains dry-run-only.

The next stage should be an audit-sync PR that records default dry-run PASS and provider-path-without-secret FAIL before any secret setup or real provider call is considered.

## v28.0L-3F-1 Provider Workflow Skeleton Audit Sync

v28.0L-3F-1 records the L-3F workflow audit results:

- Run `25591115649`: default dry-run PASS.
- Run `25591202053`: provider path without secret failed safely before provider command.

This stage changes documentation only. It adds no secret, runs no provider call, writes no production data, changes no frontend, changes no Worker, changes no config/data/realtime files, and has no scoring / decision / execution / position impact.

The missing-secret run confirmed `DEEPSEEK_API_KEY` was empty. The safety gate produced a missing-secret diagnostic and stopped before provider command execution. No DeepSeek call occurred and no provider output artifact was produced.

The next stage requires explicit approval before any secret or real provider call. Recommended next step:

```text
v28.0L-3G Secret Decision and First Real Provider-Call Gate Design - No Secret Yet
```

## v28.0L-3G Secret Decision and First Real Provider-Call Gate

v28.0L-3G adds [`EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md`](EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md). It documents the future secret strategy and first real provider-call gate requirements only.

Decision:

- Preferred secret path is GitHub Environment `external-ai-manual`.
- Secret name is `DEEPSEEK_API_KEY`.
- Required reviewer approval should be used if available.
- Repository Actions secret remains fallback only.

This stage changes documentation only. It adds no secret, changes no workflow, runs no provider call, writes no production data, changes no frontend, changes no Worker, changes no config/data/realtime files, and has no scoring / decision / execution / position impact.

The next possible implementation requires explicit approval before any secret or real provider call:

```text
v28.0L-3H Provider-Call Unlock Workflow - Environment Secret Gate / Artifact-Only / No Production Data
```

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

## v28.0L-3H Provider-Call Unlock Workflow

v28.0L-3H updates `External AI Manual Provider Test` so the first real DeepSeek provider-call path can run only behind GitHub Environment `external-ai-manual` and Environment secret `DEEPSEEK_API_KEY`.

This stage remains manual, artifact-only, and non-production:

- workflow remains `workflow_dispatch` only.
- default dry-run does not require environment approval and does not read secrets.
- provider-call job uses environment `external-ai-manual`.
- secret is step-scoped only and not passed as a CLI argument.
- first real call is restricted to `fixture_sample`.
- validator, quality review, artifact sanitizer, short retention, and post-run production safety assertions are required.
- no production data write.
- no frontend display.
- no Daily integration.
- no Worker change.
- no scoring / decision / execution / position impact.

After merge, the next step is manual audit: create the environment secret outside this PR, run default dry-run, run the first `fixture_sample` provider call with environment approval, inspect artifacts, and record the result in a follow-up audit PR.

## v28.0L-3H-1 Provider-Call Audit and Sanitizer Diagnostic Fix

Run `25592238444` recorded the first real `fixture_sample` DeepSeek provider call behind the `external-ai-manual` environment gate.

Observed status:

- provider transport worked for the approved fixture path.
- output validation passed.
- DeepSeek manual API test passed.
- quality review failed with `needs_prompt_revision`.
- `promotionEligible=false`.
- artifact sanitizer blocked upload because a diagnostic artifact contained the forbidden marker `DEEPSEEK_API_KEY`.
- no production data, frontend, Daily, Worker, config, scoring, decision, execution, or position path changed.

This is a safe failure. v28.0L-3H-1 fixes the diagnostic JSON so uploaded workflow artifacts do not contain the literal secret name, while keeping the sanitizer strict. Production integration remains `not_ready`, and frontend display remains `not_ready`.

Next recommended stage:

```text
v28.0L-3H-2 Fixture Sample Prompt/Quality Revision - No Provider Call
```

## v28.0L-3H-2 Fixture Sample Prompt and Quality Revision

v28.0L-3H-2 improves the prompt / quality guidance before any provider rerun.

It records that run `25592238444` proved provider transport and output validation for `fixture_sample`, while the offline quality review blocked promotion with `needs_prompt_revision` and `promotionEligible=false`.

This stage:

- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not write production data.
- does not modify frontend, Worker, Daily, config, scoring, decision, execution, or position logic.
- does not weaken the validator, sanitizer, or quality review.

The next real provider-call run, if approved after merge and audit, should be:

```text
v28.0L-3H-3 Second Fixture Sample Provider Call Audit
```

Live/local provider input remains `not_ready` until `fixture_sample` quality review passes.

## v28.0L-3H-3 Second Fixture Sample Provider Call Audit

v28.0L-3H-3 records the successful second `fixture_sample` DeepSeek provider-call audit from run `25593082968`.

Audit result:

- provider-call path entered through GitHub Environment `external-ai-manual`.
- provider was `deepseek`; model was `deepseek-v4-flash`.
- output validation PASS.
- DeepSeek manual API test PASS.
- quality review PASS with `recommendation=pass_for_manual_review`.
- `promotionEligible=false`.
- artifact sanitizer PASS.
- sanitized provider-call artifacts uploaded.
- no production data write.
- no frontend display.
- no Daily integration.
- no Worker, config, scoring, decision, execution, or position change.

Next phase should be separately approved. Recommended next stage:

```text
v28.0L-3I Live/Local Compact Provider-Call Design - No Provider Call
```

Live/local provider execution, production integration, frontend display, Daily integration, and `externalAiInterpretationLayer` promotion remain `not_ready`.

## v28.0L-3I Live/Local Compact Provider-Call Design

v28.0L-3I adds design documentation for a future `local_compact` provider-call path.

This stage:

- documents local compact provider-call constraints.
- uses the existing `manual-input-compact-latest.json` artifact style as the future input model.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not modify workflows.
- does not modify scripts.
- does not read or change secrets.
- does not write production data.
- does not modify frontend.
- does not integrate with Daily.
- does not affect scoring / decision / execution / position logic.

The `fixture_sample` provider path is verified, but `local_compact` execution remains `not_ready`. Production integration, frontend display, Daily integration, and `externalAiInterpretationLayer` promotion remain `not_ready`.

Recommended next stage, only after this design PR is merged and audited:

```text
v28.0L-3J Local Compact Provider-Call Workflow Path - Artifact-Only / No Production Data
```

## v28.0L-3I-0 Node 24 Runtime Baseline Unification

v28.0L-3I-0 unifies local and GitHub Actions runtime hygiene before any `local_compact` provider-call implementation.

This stage:

- standardizes the project on Node.js 24 LTS.
- constrains package engines to Node 24 only.
- adds `.nvmrc` and `.node-version` with `24`.
- updates GitHub Actions to Node 24-compatible official action majors.
- requires top-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`.
- adds `check:node-runtime`.
- strengthens workflow checks against Node 20 and outdated action versions.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not write production data.
- does not modify frontend.
- does not implement L-3J.

Recommended next stage remains:

```text
v28.0L-3J Local Compact Provider-Call Workflow Path - Artifact-Only / No Production Data
```

## v28.0L-3J Local Compact Provider-Call Workflow Path

v28.0L-3J implements the `local_compact` provider-call workflow path as an artifact-only, non-production route.

This stage:

- keeps the workflow manual `workflow_dispatch` only.
- preserves the Node 24 workflow baseline.
- preserves the `external-ai-manual` environment gate.
- keeps `DEEPSEEK_API_KEY` step-scoped to the provider-call step.
- allows `input_source=local_compact` only behind the same explicit provider gates as `fixture_sample`.
- builds `manual-artifacts/external-ai/manual-input-compact-latest.json` from local repository structured data.
- uses no source URL live fetch in the provider workflow path.
- keeps validator, quality review, artifact sanitizer, short retention, and post-run production safety assertion.
- does not call DeepSeek during the PR.
- does not trigger GitHub Actions during the PR.
- does not read or modify secrets.
- does not write production data.
- does not modify frontend, Worker, config, `data/*.json`, or `realtime/*.json`.
- does not integrate with Daily.
- does not affect scoring / decision / execution / position logic.

The `local_compact` provider call itself remains pending audit.

Recommended next stage:

```text
v28.0L-3J-1 First Local Compact Provider-Call Audit
```

## v28.0L-3J-1 Local Compact Sanitizer Source Path Fix

v28.0L-3J-1 fixes the sanitizer false positive found by run `25598085025`.

This stage:

- records that run `25598085025` stopped safely before the provider-call job.
- confirms no DeepSeek call occurred.
- confirms no secret was read.
- allows `manual-input-compact-latest.json` to reference `data/radar-data.json` only as read-only source metadata.
- keeps actual `data/radar-data.json` upload/write/copy forbidden.
- keeps provider output out of production data and frontend display.
- keeps production integration, Daily integration, scoring, decision, execution, and position changes out of scope.

Recommended next stage:

```text
v28.0L-3J-2 First Local Compact Provider-Call Audit Retry
```

## v28.0L-3J-3 Local Compact Execution-Language Prompt Fix

v28.0L-3J-3 responds to audit run `25598379612`, where the `local_compact` provider-call path reached DeepSeek, passed output validation, passed artifact sanitizer, uploaded sanitized artifacts, and preserved `productionDataWritten=false` / `frontendDisplayChanged=false`, but quality review rejected the output for `executionLanguageSafety`.

This stage:

- records that `$.facts[5]` contained operation-oriented language: `执行灯`.
- keeps `promotionEligible=false`.
- strengthens prompt guidance so `decisionContext` operation language cannot be repeated into facts, summary, inferences, model judgments, scenario hypotheses, invalidation signals, source attribution notes, or audit flags.
- adds a local dry-run prompt contract check for the new prohibitions.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not write production data.
- does not modify frontend, Worker, config, `data/*.json`, or `realtime/*.json`.
- does not weaken validator, quality review, artifact sanitizer, or `executionLanguageSafety`.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3J-4 Local Compact Provider-Call Audit Retry After Execution-Language Fix
```

## v28.0L-3J-4 Local Compact Provider-Call Audit Sync

v28.0L-3J-4 records the successful `local_compact` provider-call audit from run `25598887574`.

This stage:

- records workflow success for `External AI Manual Provider Test`.
- records successful local compact input build from local source metadata.
- records DeepSeek manual API test PASS.
- records External AI output validation PASS.
- records External AI artifact quality review PASS.
- records artifact sanitizer PASS.
- records sanitized provider-call artifact upload.
- keeps `promotionEligible=false`.
- keeps `productionDataWritten=false`.
- keeps `frontendDisplayChanged=false`.
- writes no production data.
- modifies no frontend.
- modifies no Daily integration.
- modifies no workflow or script.
- does not call DeepSeek during this documentation PR.
- does not trigger GitHub Actions during this documentation PR.
- does not read or modify secrets.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3K External AI Production Integration Readiness Review - No Production Write
```

## v28.0L-3K External AI Production Integration Readiness Review

v28.0L-3K adds [`EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md`](EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md) as a documentation-only readiness review.

This stage:

- records that manual artifact-only external AI paths are ready for audited manual use.
- records that `fixture_sample` is verified by run `25593082968`.
- records that `local_compact` is verified by run `25598887574`.
- records that output validator, quality review, artifact sanitizer, short-retention artifact upload, Node 24 workflow baseline, and protected-path assertion are verified.
- keeps production write as NO-GO.
- keeps frontend display as NO-GO.
- keeps Daily integration as NO-GO.
- keeps automatic provider calls as NO-GO.
- keeps `promotionEligible=true` as NO-GO.
- does not modify workflows or scripts.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not write production data.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3L External AI Production Data Contract Design - No Production Write
```

## v28.0L-3L External AI Production Data Contract Design

v28.0L-3L adds [`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md) as a documentation-only design for a future production `externalAiInterpretationLayer` contract.

This stage:

- designs the proposed production schema.
- defines required display-only and non-investment-advice boundaries.
- defines status, provenance, freshness, quality review, content safety, validator, write gate, and frontend gate requirements.
- keeps production write as NO-GO.
- keeps frontend display as NO-GO.
- keeps Daily integration as NO-GO.
- keeps automatic provider calls as NO-GO.
- keeps `promotionEligible=true` as NO-GO.
- does not modify workflows or scripts.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not modify production data.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3M External AI Production Contract Validator Scaffold - No Production Write
```

## v28.0L-3M External AI Production Contract Validator Scaffold

v28.0L-3M adds a validator scaffold for the future production `externalAiInterpretationLayer` contract.

This stage:

- adds `scripts/check-external-ai-production-contract.mjs`.
- adds a safe valid fixture at `docs/fixtures/external-ai/production-contract-valid-v28.0L.json`.
- adds `npm run check:external-ai-production-contract`.
- adds the validator to `check:all`.
- keeps production write as NO-GO.
- keeps frontend display as NO-GO.
- keeps Daily integration as NO-GO.
- keeps automatic provider calls as NO-GO.
- keeps `promotionEligible=true` as NO-GO.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not modify production data.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3N External AI Production Projection Dry-Run - No Production Write
```

## v28.0L-3N External AI Production Projection Dry-Run

v28.0L-3N adds a deterministic dry-run projection path for the future production `externalAiInterpretationLayer` contract.

This stage:

- adds `scripts/project-external-ai-production-dry-run.mjs`.
- adds `npm run project:external-ai-production:dry-run`.
- adds `npm run check:external-ai-production-projection`.
- writes projection output only under ignored `manual-artifacts/external-ai/`.
- validates the projected output with `check:external-ai-production-contract`.
- keeps production write as NO-GO.
- keeps frontend display as NO-GO.
- keeps Daily integration as NO-GO.
- keeps automatic provider calls as NO-GO.
- keeps `promotionEligible=true` as NO-GO.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not modify production data.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3O First Controlled Production Write Design - No Frontend Display
```

## v28.0L-3O First Controlled Production Write Design

v28.0L-3O adds first controlled production write design and a read-only production write guard.

This stage:

- adds `docs/EXTERNAL_AI_FIRST_PRODUCTION_WRITE_DESIGN.md`.
- adds `scripts/check-external-ai-production-write-guard.mjs`.
- adds `npm run check:external-ai-production-write-guard`.
- adds the guard to `check:all`.
- keeps production write as NO-GO.
- keeps frontend display as NO-GO.
- keeps Daily integration as NO-GO.
- keeps automatic provider calls as NO-GO.
- keeps `promotionEligible=true` as NO-GO.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not modify production data.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3P First Controlled Production Write - Data Only / No Frontend Display
```

only after explicit user approval.

## v28.0L-3P First Controlled Production Write

v28.0L-3P performs the first controlled data-only write of the production `externalAiInterpretationLayer`.

This stage:

- uses approved source artifact run `25598887574`.
- adds `scripts/write-external-ai-production-data.mjs`.
- adds `npm run write:external-ai-production`.
- writes `externalAiInterpretationLayer` into `data/radar-data.json`.
- keeps `displayEnabled=false`.
- keeps `boundaries.frontendDisplayApproved=false`.
- keeps `qualityReview.promotionEligible=false`.
- keeps production contract validation required.
- keeps write guard validation required.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not modify frontend files.
- does not modify workflows.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3P-1 First Production Write Audit Sync - No Frontend Display
```

## v28.0L-3P-1 First Production Write Audit Sync

v28.0L-3P-1 records the successful post-merge audit for the first controlled production write.

This stage:

- syncs the first controlled production write audit.
- records that the data write is stable.
- records source run `25598887574`.
- records `check:external-ai-production-contract -- data/radar-data.json` PASS.
- records `check:external-ai-production-write-guard` PASS.
- records `check:data` PASS.
- records `check:all` PASS.
- keeps frontend display disabled.
- keeps Daily integration disabled.
- keeps automatic provider calls disabled.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- does not modify production data.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3Q External AI Frontend Display Design - No Display Yet
```

## v28.0L-3Q External AI Frontend Display Design

v28.0L-3Q adds [`EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md`](EXTERNAL_AI_FRONTEND_DISPLAY_DESIGN.md) as documentation-only design for a future read-only AI interpretation panel.

This stage:

- designs frontend placement and display conditions.
- requires Chinese-only user-facing copy.
- requires `displayEnabled=true` and `boundaries.frontendDisplayApproved=true` before any future display.
- keeps current display disabled.
- keeps visible display as NO-GO.
- does not modify frontend files.
- does not modify `data/radar-data.json`.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- keeps Daily integration disabled.
- keeps automatic provider calls disabled.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3R External AI Frontend Display Scaffold - Hidden by Default
```

## v28.0L-3R External AI Frontend Display Scaffold

v28.0L-3R adds a hidden-by-default frontend scaffold for the production `externalAiInterpretationLayer`.

This stage:

- adds guarded frontend read/render logic.
- adds `external-ai-display-panel` as a hidden container.
- adds `check:external-ai-frontend-hidden-scaffold`.
- keeps the panel hidden because `displayEnabled=false`.
- keeps the panel hidden because `boundaries.frontendDisplayApproved=false`.
- does not modify `data/radar-data.json`.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- keeps Global Risk Heatmap layout unchanged.
- keeps Daily integration disabled.
- keeps automatic provider calls disabled.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3S External AI Visible Display Approval + Data Flag Design - No Automatic Provider Call
```

## v28.0L-3S External AI Visible Display Approval + Data Flag Design

v28.0L-3S adds [`EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md`](EXTERNAL_AI_VISIBLE_DISPLAY_APPROVAL_DESIGN.md) as documentation-only design for future visible-display approval.

This stage:

- documents the future data-flag process.
- keeps `displayEnabled=false`.
- keeps `boundaries.frontendDisplayApproved=false`.
- does not modify `data/radar-data.json`.
- does not modify frontend files.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not read or modify secrets.
- keeps Global Risk Heatmap layout unchanged.
- keeps Daily integration disabled.
- keeps automatic provider calls disabled.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3T External AI Visible Display Flag Enablement - Data Only / No Provider Call
```

## v28.0L-3T External AI Visible Display Flag Enablement

v28.0L-3T enables the existing external AI read-only panel through data flags.

This stage:

- sets `displayEnabled=true`.
- sets `boundaries.frontendDisplayApproved=true`.
- changes no AI text content.
- changes no frontend code.
- does not call DeepSeek.
- does not trigger GitHub Actions.
- does not refresh provider artifacts.
- does not read or modify secrets.
- keeps Global Risk Heatmap layout unchanged.
- keeps Daily integration disabled.
- keeps automatic provider calls disabled.
- does not affect scoring / decision / execution / position logic.

Recommended next stage:

```text
v28.0L-3T-1 Visible Display Audit Sync - No Provider Call
```
