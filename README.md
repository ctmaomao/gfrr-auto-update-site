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

当前处于 `v28.0J` 稳定观察基线；页面公开标签仍为 `v28.0C`，不要把工程内部版本同步误改成 UI 公开版本。v28.0J-2B post-deploy audit 已通过，当前前端版本为 `28.0M-66V`。

当前主运行状态：

- Worker-first 是主运行路径，前端通过 strict gate 选择 `/market.worker-preview.json`。
- `/market.secondary-preview.json` 是独立 secondary diagnostics endpoint，不污染主 preview。
- `realtime-data` 分支和本地 `./realtime/market.json` 只作为 fallback / Daily baseline 输入观察。
- Daily baseline 写入 `data/radar-data.json`、`data/radar-history.json` 和 `data/radar-history-full.json`。
- `displayInputsBaseline` 是 baseline fallback 的结构化当前值来源。
- 前端最终当前值由运行时 `effectiveDisplayInputs` 合成，渲染层不得绕过它改用 raw realtime values。
- Brent 主逻辑为 FRED anchor + Yahoo fresh confirmation + Trading Economics freshness gate + extreme-move guard。
- 当前 core secondary set 为 `vix` / `gold` / `dxy` / `us10y` / `spx`；VIX / Gold / DXY / US10Y / SPX secondary 当前只用于诊断，不进入主值、scoring 或 decision。
- v28.0G-4C Trading Economics freshness hard gate 已实现；`tradingeconomics-observedAt-invalid` / `tradingeconomics-confirmation-stale` 会 hold promotion，且 observedAt failure does not make candidate ok false。
- Operations Runbook 以 `docs/OPERATIONS.md` 为入口；`worker-health-snapshot` 和 `review:worker-health-snapshot` 只读审阅健康快照，PR #53 superseded，KV write guard deferred。
- World Order Stress Overlay 是 regime overlay / 结构性状态修正器，不是第七个底层风险模块。
- `dailyBrief`、`divergenceLayer`、`macroDrivers.consumer`、`consumer_vs_asset_pricing`、`brentPricingLayer` 和 `aiInterpretationLayer` 都是解释层 / 审计层 / 展示层。
- External AI production panel 是只读辅助层；manual / provider artifacts 不等于 scoring、Daily、frontend 或 production write readiness。
- Market Pricing Temperature 已进入 M-27 以后前端展示阶段，后续边界以对应 M-series docs 为准。
- Frontend asset cache version 当前为 `28.0M-66V`；修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js` 时必须同步 bump。
- `npm run check:all` 当前由 `package.json` 定义，包含 69 个串联检查项。
- Market Pricing first real record write / weekly merge scaffold 在任何写入前运行 8 sanity checks；细节以 `docs/OPERATIONS.md` 和 `docs/SYSTEM_UPGRADE_PLAN.md` 为准。

最近维护节奏：

- M-31 到 M-35 完成 editorial design contract compliance、DESIGN.md amendment、bias color semantics、Group A spacing governance、Group B spacing governance 和 footer redesign。
- M-36 仅删除已验证无依赖的 dead weight，并同步前端 asset cache version；不改变数据、工作流、决策、执行、仓位或 DESIGN.md contract。
- Section border consistency M-38 adds global `.editorial-section` border (`var(--paper-line-strong)`) to unify visual demarcation across 7 IA sections. `#macro-risk-overview` scoped reset prevents double-layer visual since its inner `.macro-overview-block` cards provide their own borders. Frontend display layer only.
- Brent promotion audit completeness M-39 adds `consensus.reason` as third fallback for `promotionAudit.promotionReason` and derives `anchorAgeHours` from `sourceDetails.ageSeconds` or fred-anchor `observedAt`. Backend reading logic only; no new data source. Frontend display unaffected until next pipeline run.
- Fed liquidity FRED extension M-41 adds FRED:DFF (effective federal funds rate) and FRED:SOFR (secured overnight financing rate) to `resolveFedLiquidity`. It formalizes `macroDrivers.fedLiquidity` DATA_CONTRACT for the first time. Backend pipeline only; visible in B3 政策代理 and B4 金融脆弱性 evidence after next scheduled daily-pipeline run.
- Fed liquidity triplet completion M-42 adds FRED:WRESBAL (bank reserve balances, weekly Wednesday, NSA, millions USD) to `resolveFedLiquidity` with 4-week change calculation. It completes the Fed liquidity triplet (M-41 DFF + SOFR rates, M-42 WRESBAL quantity). B4 financial fragility evidence grows from 4 to 5 lines. WRESBAL does not enter pressure score. Values populate on next scheduled daily-pipeline run.
- External AI provenance metadata completion M-43 fills 6 provenance fields (`runId`, `artifactName`, `artifactId`, `artifactDigest`, `sourceCommit`, `sourceDataUpdatedAt`) in `externalAiInterpretationLayer` via GitHub Actions env vars and SHA256 hash. No AI behavior change. Completes the last remaining M-39 audit null fields. Values populate on next `external-ai-production-refresh.yml` workflow run.
- Stable Observation Audit deprecation M-44: Removes the stale workflow and audit script that were hard-coded to v28.0K-3 phase expectations and have been failing daily for several months. v28.0L-aware checks (external-ai-production-contract, write-guard, provenance-completeness) already cover this functionality. Cleanup only — no behavior, schema, or data change.
- Frontend field synchronization M-45: Completes the frontend integration of M-41 (DFF/SOFR) and M-42 (WRESBAL) by adding evidence lines to driver-liquidity, updating driver-policy explanation to acknowledge DFF as official policy rate, passing fedLiquidity into cross-validation matrix for policy_path field. Also corrects market-pricing data file descriptionZh and displayLayerActive flag to reflect actual M-26/M-27 completion state. Frontend display improves immediately after merge.
- SLOOS bank loan standards M-46: Adds FRED:DRTSCILM (large/medium firms) and FRED:DRTSCIS (small firms) C&I loan tightening data to resolveCredit. Adds new fields to macroDrivers.credit with first formal DATA_CONTRACT section. Upgrades cross-validation liquidity_tightening narrative: SLOOS changes from hardcoded null to conditional supporting/contradicting/missing classification based on tightening level. Backend pipeline only; values populate on next scheduled daily-pipeline.yml run. Quarterly survey frequency means values update ~4 times per year.
- ISM Manufacturing PMI M-47: Adds FRED:NAPM (monthly) to resolveConsumerSentiment. Extends macroDrivers.consumer with 3 new fields (ismManufacturingPmi, ismManufacturingPmi3mChange, ismPmiRegime). Upgrades DATA_CONTRACT consumer section to table format. Updates source field from single-source 'FRED:UMCSENT' to multi-source 'FRED:UMCSENT; FRED:NAPM'. Upgrades cross-validation stagflation_pressure narrative: PMI changes from hardcoded null to conditional supporting/contradicting/missing classification based on absolute value thresholds. Backend pipeline only; values populate on next scheduled daily-pipeline.yml run.
- Chicago Fed NFCI Bank Stress Index M-48: Adds FRED:NFCI (Chicago Fed National Financial Conditions Index, weekly) to resolveCredit. Extends macroDrivers.credit with 3 new fields (nfci, nfci4wChange, nfciRegime). Upgrades cross-validation credit_spread_warning narrative: bank_stress_index changes from hardcoded null to conditional 5-tier classification (>0.5=significantly tight, 0.1-0.5=mildly tight, -0.1 to 0.1=neutral no-op, -0.5 to -0.1=mildly loose, <-0.5=significantly loose). Backend pipeline only; values populate on next scheduled daily-pipeline.yml run. NFCI 0-axis is OPPOSITE to igOas/hyOas (NFCI positive=tight=BAD).
- Diesel Crack Spread M-49: Adds FRED:DHOILNYH (NY Harbor ULSD spot price, daily) and computes diesel crack spread as DHOILNYH × 42 - Brent inside brentPricingLayer. Extends brentPricingLayer with ulsdPrice, ulsd4wChange, crackSpread, crackSpread4wChange, crackSpreadRegime, and ulsdSourceStatus. Removes crack spread from brentPricingLayer.dataGaps and upgrades cross-validation energy_shock narrative to conditional crack_spread classification. Backend pipeline only; values populate on next scheduled daily-pipeline.yml run.
- Repo Market Spread M-50: Adds FRED:BGCR + FRED:TGCR (NY Fed reference rates, daily) to resolveFedLiquidity. Extends macroDrivers.fedLiquidity with 5 new fields (bgcr, tgcr, bgcrSofrSpread, tgcrSofrSpread, repoSpreadRegime). Upgrades cross-validation liquidity_tightening narrative: repo_stress changes from hardcoded null to conditional 4-tier classification (>=25bp=crisis support, 10-25bp=pressure support, 5-10bp=mild stress support, <5bp=normal contradicting). Storage as %, display as bp (×100). Backend pipeline only; values populate on next scheduled daily-pipeline.yml run.
- World Order narrative density M-51: Enhances the `world_order_pressure_crossing` cross-validation narrative using existing `data/world-order-stress.json` fields: state/labelZh, dominantDrivers[0], economicWeaponization, capitalControlRisk, blocFormation, multiTheaterConflict, marketConfirmation, GDELT toneProxy, OFAC recent action count, and decisionModifier.riskBias. No new data source, no FRED series, no schema change, no data regeneration, and no scoring/decision/execution/position change.
- Risk Asset Mismatch Narrative Enhancement M-52: Enhances risk_asset_mismatch narrative density. Adds 5 cross-dimensional mismatch evidence types (NFCI vs HY, T10Y2Y vs QQQ, DXY vs QQQ, IG/HY vs VIX, BGCR-SOFR vs VIX). ALL thresholds reused 100% from M-46/47/48/50 already-merged code. Fixes qqq_zscore missing logic bug. Removes old vix_hy_oas contradicting evidence (replaced by ighy_vix_mismatch). Multi-level interpretation (6 levels based on supporting/contradicting/missing counts). No new FRED series. ZERO new data acquisition.
- Overheat Confirmation Narrative Enhancement M-53: Enhances overheat_confirmation narrative density. Adds 6 macro evidence types (PMI, SLOOS, hyOas, NFCI, UMCSENT 3m change, BGCR-SOFR) with symmetric supporting/contradicting branches. Fixes contradictingEvidence-always-empty design bug. Replaces credit_confirmation missing with hyOas_qqq_complacency contradicting. Redesigns assessment field (null→undefined fallback). Multi-level interpretation (7 levels). 78% threshold reuse from M-46/47/48/50/52; 4 new thresholds are stricter versions of reviewed milestones. No new FRED series. THIS PR COMPLETES 7/7 CROSS-VALIDATION NARRATIVE UPGRADES.
- Frontend Visual Upgrade Phase 1 M-54: Fixes evidence color semantic reversal bug (supporting → red, contradicting → green, missing → gray). Adds emoji prefix to 7 cross-validation narratives (⚡⚖️📉🔥💰💧🌐). Reorders evidence list (supporting → contradicting → missing). Adds typography type scale CSS variables. No data file regeneration. No backend logic change. This is Phase 1 of frontend visual upgrade (M-55 = IA restructure).
- IA Restructure Phase 2a M-55a: Frontend information architecture restructure. Realtime band (Brent/DXY/VIX/HY/US10Y/Gold/SPX) moved from #detail-data folded area to top static aside #homepage-realtime-band, visible on first screen. External AI section moved from nav position #12 to position #9 (adjacent to cross-validation for semantic coherence). Detail-data AUDIT INPUTS renamed to "数据健康" (now contains only health-dashboard-card after realtime moved out). All 13 nav anchors preserved (DESIGN.md "13 项" literal unchanged). 4 nav contract locations synced. All 16 realtime DOM ids preserved (check:dom unchanged). Group B spacing rebuilt for new realtime band parent. Cache bumped to 28.0M-55V.
- IA Restructure Phase 2b M-55b: Visual consistency upgrade + wow-key-changes physical re-anchoring. Realtime band repainted from cockpit-style monolithic card to main-module standard (7 sub-cards in editorial-realtime-grid, matching pressure/signal/engine/cross-validation visual pattern). wow-key-changes promoted from static HTML section to JS-runtime block inside macro-risk-overview-root, positioned between cross-validation and watch-list (fixes M-55a hidden bug where nav order #8 wow-key-changes was physically AFTER nav #9 external-ai). All 13 nav anchors preserved (DESIGN.md "13 项" literal unchanged). All 16 realtime DOM ids preserved with new sub-card parents. .editorial-subsection-equivalent CSS legacy removed. Cache bumped to 28.0M-55bV.
- M-56 validate-data consumer source whitelist: accepts both legacy `FRED:UMCSENT` and M-47+ `FRED:UMCSENT; FRED:NAPM`, unblocking Build #74 daily refresh and activating M-46~M-50 refreshed fields in `data/radar-data.json`. Backend validator fix only; no frontend cache bump.
- M-57 Market Temperature + Project Backlog: fixes `buildMarketTemperature` stub so judgment-layer state reflects active QQQ market-pricing metrics when records exist; creates `docs/PROJECT_BACKLOG.md` as persistent project self-memory; adds `check:project-backlog-format` to `check:all` (63 items). Cache bumped to 28.0M-57V. No data/workflow/backend/DESIGN.md changes.
- M-58 Realtime Band Field Completion: completes P1-6 from `docs/PROJECT_BACKLOG.md`. Adds delta + source fields to DXY/VIX/HY/US10Y/Gold/SPX realtime sub-cards, fixes Brent delta `|| 0` null-coercion, adds unit suffixes for all 7 deltas, and locks 9 new DOM ids with `check:realtime-band-completeness` (`check:all` = 64). Cache bumped to 28.0M-58V. No data/workflow/backend/DESIGN.md changes.
- M-59 GDELT Cloud v2 integration: completes P1-5 from `docs/PROJECT_BACKLOG.md`. Replaces the legacy GDELT DOC API fetcher with `scripts/world-order/fetch-gdelt-cloud.mjs`, adds daily `Refresh World Order Stress` workflow using `GDELT_CLOUD_API_KEY`, preserves `externalSources.gdelt.summary` legacy schema fields, and adds 4 world-order narrative supporting branches. Backend/data refresh workflow only; no frontend cache bump. ACLED was deferred to M-63 after Research/Partner tier API access was denied.
- M-60 Pages Trigger Coverage: centralizes Pages auto-deploy wiring in `deploy-static-site-to-pages.yml` via `workflow_run.workflows` for Build Daily Radar Data, Refresh World Order Stress, and External AI Production Refresh. Removes the PR #213 per-workflow `gh workflow run` step from Refresh World Order Stress, closes the latent External AI production refresh Pages latency hole, and adds `check:pages-trigger-coverage` heuristic scanning so future committing-to-main workflows must be registered or explicitly excluded (`check:all` = 66). No frontend cache bump.
- M-61 SIPRI manual-normalized integration: closes P1-3 from `docs/PROJECT_BACKLOG.md` by adding verified SIPRI 2024 military expenditure data (`config/world-order-sipri-normalized.json`, top 10 majorPowers + 5 regions + global aggregates) and 3 `world_order_pressure_crossing` supporting branches (`sipri_global_arms_race`, `sipri_major_powers_rising`, `sipri_gdp_share_rising`). SIPRI becomes `ok` after world-order build; annual April-May refresh is documented. No frontend cache bump; `check:all` remains 66.
- M-61b SIPRI annual refresh reminder: adds `.github/workflows/sipri-annual-refresh-reminder.yml` which opens a GitHub issue each May 1 via `actions/github-script@v7` with the full Excel-verification checklist. Idempotent (skips if an open issue with the same title and `sipri-annual-refresh` label already exists). Operator-nudge only — no data, code, or workflow side effects.
- M-62 enables weekly QQQ refresh by changing M-24 from integral replace to `isoWeek`-keyed merge. Adds 2 new sanity checks (cross-seam monotonicity and merged-count floor) while splitting incoming vs merged count checks. `check:all` stays 67. Preserves M-26 metrics, frontend, workers, scoring, decision, execution, and position. No data file changes.
- M-63a ACLED weekly regional sanitizer + importer: replaces the unreachable ACLED API adapter with a manual-xlsx-only importer, adds `xlsx@0.18.5` as the first ADR-0013 devDependency for the local sanitizer, creates the weekly input skeleton and `check:world-order-acled-weekly`, and changes `peaceDividendRetreat` to SIPRI 0.35 + GDELT 0.20 + ACLED 0.25 + module 0.20. Weekly only; monthly ingestion and reminder workflows are reserved for M-63b/M-63c. No frontend cache bump.
- M-64 IA contract reconciliation: aligns DESIGN.md §4.1, homepage DOM order, and IA check scripts. World Order Stress is promoted to an independent top-level regime overlay per ADR-0004, External AI returns to the post-method read-only auxiliary slot, `#wow-key-changes` remains a JS runtime block, and cache is bumped to 28.0M-64V. No data/workflow/scoring/decision/execution/position changes.
- M-65 method-evidence content cleanup: migrates the misplaced system overview subsection to `#detail-data` as SYSTEM OVERVIEW and folds recovery/system status into DATA HEALTH. `#method-evidence` now keeps methodology / evidence / boundary content only. Cache bumped to 28.0M-65V. No data/workflow/scoring/decision/execution/position changes.
- M-66 legacy anchor + subsection kicker polish: renames the old Detail Data header anchor to `detail-data-header`, adds subsection-meta kickers to top-level Method / Evidence and Execution / Risk subsections, and enforces kicker presence in `check:editorial-redesign-contract`. Cache bumped to 28.0M-66V. No data/workflow/scoring/decision/execution/position changes.

### Weekly QQQ refresh

`scripts/refresh-qqq-data.ps1` is the manual operator wrapper for weekly QQQ market-pricing refresh. The operator still downloads `HistoricalData_*.csv` from Nasdaq in a browser, then the script validates the CSV header, moves it into `manual-artifacts/market-pricing/manual-weekly-input/`, runs the M-23 sanitizer, previews/commits the M-24 `isoWeek` merge, recomputes M-26 metrics, runs `check:all`, and commits/pushes the two refreshed data files.

Prerequisites: Windows, PowerShell 5.1+ or PowerShell 7+, Node 24, git, and installed npm dependencies. Basic usage:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\refresh-qqq-data.ps1
```

This is a manual operator tool, not a CI workflow. Full runbook: `docs/MARKET_PRICING_WEEKLY_REFRESH.md`.

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

完整 Worker-first 数据流、fallback 优先级、`dailyRealtimeInput`、`displayInputsBaseline`、`effectiveDisplayInputs`、Brent validation、secondary diagnostics 与字段契约统一维护在 `docs/DATA_CONTRACT.md`。

## 决策系统

决策输出以 `decisionModel` 和 `tradingSystem` 为核心：

- `decisionModel`：策略状态、状态原因、主导驱动、仓位建议、动作队列、触发器和失效条件。
- `tradingSystem.executionLock`：执行灯与新增风险约束。
- `tradingSystem.positioning`：目标总仓位、现金缓冲、风险预算和核心配置。
- `tradingSystem.actionLayer`：今日动作、禁止事项和执行检查点。
- `tradingSystem.riskControl`：硬触发阈值与重置条件。

渲染层只展示和格式化这些结构，不应重新推导执行灯、仓位建议或策略状态。

## 前端与页面结构

首页信息架构以 `DESIGN.md` 为准。当前一级顺序是 Hero / Masthead、dashboard jump nav、Macro Risk Overview、top realtime band、External AI auxiliary、WoW Key Changes、Global Risk Heatmap，随后是折叠的 detail data、method evidence 和 execution risk detail。

前端约束：

- `DESIGN.md` 是视觉、IA、颜色、字体和组件 contract。
- `scripts/check-homepage-ia-contract.mjs` 约束首页 IA 顺序和稳定锚点。
- `scripts/check-editorial-redesign-contract.mjs` 约束字体 allowlist、DESIGN anchors 和 editorial structure。
- 修改 `index.html`、`assets/styles.css`、`scripts/modules/render*.js` 或 SVG rendering code 前必须读完 `DESIGN.md`。
- 触碰前端入口或本地 JS module graph 时必须 bump frontend asset cache version。

## 开发检查

推荐完整检查：

```bash
npm run check:all
```

常用分项：

```bash
npm run check:syntax
npm run check:dom
npm run check:homepage-ia-contract
npm run check:editorial-redesign-contract
npm run check:modules
npm run check:copy
npm run check:workflows
npm run check:docs
npm run check:data
```

`package.json` 是所有检查命令和 `check:all` 组成的权威来源。Pages deploy 的分步骤检查、Realtime / Daily workflow 审计和常见排查流程见 `docs/OPERATIONS.md`。

## GitHub Actions 速览

主要 workflow：

- `Build Realtime Market`：生成 realtime fallback payload 并发布到 `realtime-data` 分支。
- `Build Daily Radar Data`：读取 Daily 输入并生成 baseline 数据。
- `Refresh World Order Stress`：使用 GDELT Cloud v2 + SIPRI manual-normalized annual data + ACLED manual-xlsx-derived weekly JSON 刷新 `data/world-order-stress.json`；GDELT 需要仓库 secret `GDELT_CLOUD_API_KEY`，SIPRI 当前为 `ok` 慢变量，ACLED 无本地 xlsx 时为 `manual_required`。
- `Deploy Static Site to Pages`：通过 `workflow_run` 监听 Build Daily Radar Data、Refresh World Order Stress、External AI Production Refresh 成功完成后触发 Pages deploy。
- `Check Worker Health`：只读检查 Worker-first 主 endpoint 与 secondary endpoint。
- External AI manual / provider workflow families：仅按对应 reviewed phase 使用，artifact / provider / production write / frontend display 边界以 `AGENTS.md` 和 external-AI docs 为准。

Workflow 合约、runbook、rollback / no-rollback 判断、known warning baseline 和 operator notes 见 `docs/OPERATIONS.md`。

## 当前维护原则

- 单一目标、最小改动、可验证、可回滚。
- 不把 validation 推荐值直接当作主显示值。
- 不通过解析中文文案恢复结构化数据。
- 不削弱 fallback 闸门来掩盖旧 realtime 文件。
- 不在渲染层重算评分、决策状态或执行约束。
- 不让 External AI 输出影响 scoring、decision、execution 或 position。
- 不让 secondary diagnostics 覆盖或参与任何 `values.*` 主值。
- 不在没有明确任务时大规模重构或重写站点结构。
- 修改数据链路、决策契约或渲染结构时，必须运行对应检查。

## 文档入口

先读 `AGENTS.md` 的 Documentation Authority Index；它定义 Current Authority、Conditional Authority、Historical Background 和冲突解决规则。

常用入口：

- `DESIGN.md`：前端设计 contract。
- `AGENTS.md`：AI 开发守则、硬边界和文档权威索引。
- `docs/DATA_CONTRACT.md`：数据字段、Brent、Decision Output、Transmission Delta、Market Pricing 和 External AI production data contract。
- `docs/OPERATIONS.md`：运行排查、GitHub Actions、operator notes 和 validation baseline。
- `docs/SYSTEM_UPGRADE_PLAN.md`：升级路线、稳定基线和阶段记录。
- `docs/SIGNAL_INTAKE.md`：新信号纳入框架。
- `docs/WORLD_ORDER_STRESS.md`：World Order Stress Overlay scope。
- `docs/M-63_ACLED_INTEGRATION.md`：ACLED manual-xlsx ingestion、ADR-0013 dependency isolation、weekly sanitizer/check/importer runbook。
- `workers/gfrr-realtime-worker/README.md`：Realtime Worker scope。
- `docs/CODE_DEAD_WEIGHT_REMOVAL_M36.md`：M-36 dead weight removal audit note。

按任务类型优先查阅：

- 前端视觉、IA、字体、颜色：`DESIGN.md`。
- 首页 section 顺序和锚点：`scripts/check-homepage-ia-contract.mjs`。
- Editorial redesign guard：`scripts/check-editorial-redesign-contract.mjs`。
- 数据字段、显示值和 validation：`docs/DATA_CONTRACT.md`。
- Realtime / Daily / Pages deploy 排查：`docs/OPERATIONS.md`。
- Worker runtime：`workers/gfrr-realtime-worker/README.md`。
- World Order Stress：`docs/WORLD_ORDER_STRESS.md`。
- External AI API / prompt / production integration：对应 `docs/EXTERNAL_AI_*.md` 条目，以 `AGENTS.md` Authority Index 为准。
- Market Pricing Temperature：对应 `docs/MARKET_PRICING_*.md` 条目，以 `AGENTS.md` Authority Index 为准。
- 新宏观信号：`docs/SIGNAL_INTAKE.md` 和 `docs/SYSTEM_UPGRADE_PLAN.md`。
- 检查命令：`package.json`。
- 历史背景：只在需要 audit context 时查阅，不覆盖 Current Authority。

README 只保留入口级说明。若 README 与 `AGENTS.md`、`DESIGN.md`、`package.json` 或 scoped docs 冲突，按 `AGENTS.md` 的冲突解决规则处理。

不要把 README 的简化摘要当作替代 contract；实现前仍需阅读对应权威文档。

## 关键文件

- `index.html`：静态页面入口。
- `assets/styles.css`：全站 CSS。
- `scripts/app.js`：前端应用入口。
- `scripts/modules/*.js`：前端渲染、数据选择和 UI helpers。
- `scripts/run-realtime.mjs`：realtime fallback 构建。
- `scripts/run-daily-pipeline.mjs`：Daily baseline 构建。
- `scripts/validate-data.mjs`：数据契约校验。
- `package.json`：检查命令权威来源。

## 版本标记

- 页面公开标签：`v28.0C`。
- 工程稳定观察基线：`v28.0J`。
- 当前 frontend asset cache version：`28.0M-66V`。
- 当前 runtime status：Node.js 24 LTS。
- 当前 M-series note：M-66 renames the old Detail Data header anchor to `detail-data-header` and enforces subsection-meta kickers across top-level detail/method/execution subsections; M-65 moves the system overview and recovery/system status blocks out of `#method-evidence` into `#detail-data`, preserving all runtime DOM ids; M-64 aligns DESIGN.md §4.1, index.html top-level IA order, and homepage IA check scripts; World Order Stress becomes a top-level regime overlay per ADR-0004; External AI returns to the post-method read-only auxiliary slot; M-63a replaces the unreachable ACLED API adapter with a manual-xlsx weekly regional sanitizer/importer, adds `xlsx@0.18.5` under ADR-0013, and expands `check:all` to 68 with `check:world-order-acled-weekly`; M-62 changes M-24 from integral QQQ history replacement to `isoWeek`-keyed weekly merge with incoming-wins revisions, 8 sanity checks, and synthetic merge coverage; M-61 imports verified SIPRI 2024 military expenditure data and adds 3 SIPRI world_order_pressure_crossing supporting branches while documenting annual refresh; M-60 centralizes Pages auto-deploy triggers via `workflow_run.workflows` and adds `check:pages-trigger-coverage` heuristic scanning so all committing-to-main workflows are registered or explicitly excluded; M-59 replaces stale legacy GDELT DOC API access with GDELT Cloud v2 Bearer fetcher, daily world-order refresh workflow, and 4 new world-order narrative supporting branches while preserving schema; M-58 completes realtime band P1-6 by adding non-Brent delta/source fields, Brent null-safe delta formatting, unit suffixes, and `check:realtime-band-completeness`; M-57 aligns buildMarketTemperature judgment state with active QQQ market-pricing metrics and creates PROJECT_BACKLOG.md as checked project self-memory; M-56 fixes validate-data consumer source whitelist and Build #74 refresh activates M-46~M-50 data fields; M-55b repaints the realtime band to the main-module standard and promotes wow-key-changes to JS runtime before the watch-list while preserving 13 nav anchors; M-55a lifts the realtime band and External AI section for IA Phase 2a while preserving 13 nav anchors; M-54 fixes cross-validation evidence color semantics, adds narrative emoji prefixes, reorders evidence, and adds typography scale variables; M-53 enhances overheat_confirmation narrative density and completes 7/7 cross-validation narrative upgrades; M-52 enhances risk_asset_mismatch narrative density with 5 cross-dimensional mismatch evidence types; M-51 enhances world_order_pressure_crossing narrative density from existing world-order JSON fields; M-50 adds BGCR/TGCR repo market spreads to macroDrivers.fedLiquidity; M-49 adds DHOILNYH diesel crack spread to brentPricingLayer; M-48 adds Chicago Fed NFCI bank stress index to macroDrivers.credit; M-47 adds ISM Manufacturing PMI to macroDrivers.consumer; M-46 adds SLOOS bank loan standards and the first formal macroDrivers.credit contract; M-45 completes frontend field synchronization for Fed liquidity and market-pricing metadata; M-44 deprecates the stale Stable Observation Audit workflow/script; M-43 completes External AI provenance metadata from GitHub Actions run context and DeepSeek output SHA256; M-40 已跳过且无 PR。
