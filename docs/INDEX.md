# Documentation Authority Index

> 本文档定义本仓库所有 `.md` 文档的权威等级。
> 抽取自 `AGENTS.md` (v28.0J-pre-split tag) 的 "Documentation Authority Index" 段。
> 任何新增、删除、迁移文档时,必须同步更新本索引。

## Rule of Conflict Resolution

如两份文档冲突:

1. **Current Authority** beats everything else.
2. 先核对路径、阶段和操作；明确记录的 reviewed supersession / owner-approved 窄范围例外仅在指定范围优先，无例外的同范围同状态冲突才取更严格者。检查通过不是授权。
3. Scope-conditional authority 不自行覆盖 Current Authority；根规则明确引用的领域附件在对应范围执行，旧 helper 禁令不否定已记录的独立 runtime 授权。
4. Historical Background NEVER overrides anything current.
5. When in doubt, check `package.json` for the actual check commands and run them.

---

## Current Authority (must follow)

定义"项目当前是什么"。所有 PR 必须符合:

| 文档 | 角色 |
|---|---|
| `CLAUDE.md` | AI 启动导航 (新增于 v28.0J-pre-split 后) |
| `DESIGN.md` | 前端设计契约 (视觉/IA/色彩/字体/组件) |
| `AGENTS.md` | AI 开发规则合约 (规则锚点,索引/历史已外迁) |
| `package.json` | 所有 check 命令与 `check:all` 组成权威源；`check:all` 对生产数据只读；当前包含生成 ignored analyst input 的子命令，零文件写入任务先查副作用 |
| `docs/PROJECT_BACKLOG.md` | 项目自我记忆 + 跨会话 active task |
| `docs/DATA_SOURCES.md` | 10+ 外部数据源边界 (新增于 v28.0J-pre-split 后) |
| `docs/ADR/README.md` | 重大架构决策索引 (新增于 v28.0J-pre-split 后) |

---

## Conditional Authority (authoritative only within their scope)

- [AGENT_DOMAIN_BOUNDARIES.md](AGENT_DOMAIN_BOUNDARIES.md)：根 AGENTS.md 明确委托的领域规则附件；按任务读对应段落。原阶段约束只管各自路径，现行窄范围例外见附件开头；领域 checker 直接校验本附件，保留原断言，根只保留导航和通用规则。迁移决策见 [ADR-0024](ADR/0024-agent-domain-authority.md)。

仅在对应 PR / 子系统范围内权威。**默认会话不应将其作为全项目规则。**

> External AI / Market Pricing 阶段文档的状态与现行契约入口统一见[阶段状态说明](LEGACY_DOCUMENT_STATUS.md)，不在各导航入口重复维护快照。

### Market Pricing scope (M-14 → M-91)

- `docs/MARKET_PRICING_SOURCE_FORMAT_VERIFICATION_DESIGN.md` (M-20)
- `docs/MARKET_PRICING_NETWORK_OPEN_THROTTLED.md` (M-21)
- `docs/MARKET_PRICING_FIRST_REAL_RECORD_WRITE.md` (M-24)
- `docs/MARKET_PRICING_METRICS_CALCULATION.md` (M-26)
- `docs/MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md` (M-91 implementation reference; source review completed, implementation landed)
- 其余 M-14 / M-22 / M-23 / M-25 / M-27 → M-30 阶段文档已移入 Historical Background；文件保留，但默认不加载。

### Editorial / Visual scope (M-31 → M-39)

- M-31 → M-38(8 个 editorial/visual 已合并 milestone scope docs)— 已在 `docs/MILESTONE_INDEX.md` ## Archived › M-series 逐条登记,默认不加载(A1 验证 2026-06-02:纯历史、无活引用)。
- `docs/BRENT_PROMOTION_AUDIT_M39.md` (M-39) — 保留(A1 验证:被 ADR-0009 References 引用,非纯历史)

### Macro driver expansion scope (M-41 → M-50)

- `docs/M-41_FED_LIQUIDITY_EXTENDED_DRIVERS.md`
- `docs/M-49_DIESEL_CRACK_SPREAD.md`
- `docs/M-50_REPO_MARKET_SPREAD.md`
- `docs/M-67_ISM_PMI_SOURCE_REPAIR.md` — ISM PMI **active source contract**(`docs/M-47_ISM_PMI_GROWTH_LAYER.md` §Current Source 明确指向它;FRED:NAPM 404 后现行源为 `ISM:ManufacturingPMI`)。**仍有效,非历史**;audit-only/display-only。
- `docs/TREASURY_FISCAL_DATA_TGA_SOURCE_REVIEW.md` — Treasury Fiscal Data DTS / TGA source-review only; future `macroDrivers.fedLiquidity` candidate, no runtime / formula / scoring approval.
- `docs/FED_LIQUIDITY_RECALIBRATION_BRIEF.md` — brief-only research contract for funding-stress target, regime-aware ON RRP buffer/velocity, and near-zero percentage-noise recalibration; no runtime / formula / scoring approval.
- M-42 / M-45 → M-48 阶段文档已移入 Historical Background；ISM 当前源边界以 M-67 为准。

### Cross-validation narrative density scope (M-51 → M-53)

- M-51 → M-53(3 个 narrative-density 已合并 milestone scope docs)— 已在 `docs/MILESTONE_INDEX.md` ## Archived 逐条登记,默认不加载(A1 验证 2026-06-02:纯历史、无活引用)。

### Brent / energy public proxy source review scope

- `docs/BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md` (M-71)
- `docs/OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md` (Oil Directional Pressure Model / ODP — feasibility + source review; this doc stays a source-review artifact, but PR1 ingestion + checks are implemented: `data/oil-directional-pressure.json` + `scripts/oil-directional/` + `check:oil-directional`)
- `docs/OIL_DIRECTIONAL_VERDICT_HISTORY_MONITOR.md` (P64/P66 artifact-only git-history monitor for existing ODP verdict transitions/divergence/evidence age plus orthogonal persistent-low-confidence observation; no network, production write, refresh trigger, new verdict, or score)
- `docs/OIL_THERMAL_HISTORY_WINDOW_CAPACITY.md` (P65 shared 240-sample baseline review capacity; existing P60 health gate, 30-day threshold, and manual promotion boundary unchanged)
- `docs/OPEC_SPARE_CAPACITY_SOURCE_REVIEW.md` (Energy Stress Phase 2 source-review + owner-approved implementation follow-up; EIA STEO `COPS_OPEC` → `macroDrivers.energySpareCapacity`)
- `docs/ENERGY_INVENTORY_BALANCE_SOURCE_REVIEW.md` (P6A source-review + implementation follow-up; EIA STEO OECD commercial inventory + global net inventory withdrawals → `macroDrivers.energyInventoryBalance`)
- `docs/ENERGY_TRANSPORT_CHOKEPOINT_SOURCE_REVIEW.md` (Energy Stress Phase 2 source-review + implementation follow-up; IMF PortWatch chokepoint source → `macroDrivers.energyTransport`)
- `docs/ENERGY_TRANSPORT_CHOKEPOINT_IMPLEMENTATION_BRIEF.md` (owner-approved PortWatch implementation design contract; first runtime scope limited to Daily `macroDrivers.energyTransport` + validator/check/docs)
- `docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_TO_SCORE_CONTRACT.md` (transport-shock-confirmation-factor-source-to-score-contract-v1; P-score-1 contract only for a future `transportShockConfirmationFactor`; no shadow score / no frontend / no ODP finalBias or main-judgment weighting change)
- `docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_REVIEW.md` (transport-shock-confirmation-factor-source-review-v1; P-score-2 review of Free Route-Linked Tanker Transport Pressure Proxy + Baltic Weekly Tanker Report public route-signal; no live fetch / no production write / no frontend / no shadow score)
- `docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_MARKET_CONFIRMATION_SOURCE_REVIEW.md` (transport-shock-confirmation-factor-market-confirmation-source-review-v1; P-score-15 review of already-connected Brent curve/price and Oil News market-reaction candidates; no marketConfirmation write / no score write / no production write)
- `docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_SCORE_DESIGN.md` (transport-shock-confirmation-factor-free-proxy-score-design-v1; P-score-19 design-only free-proxy low-weight score path; maxFutureMainScoreContributionPct=3; no score write / no production write / no ODP finalBias)
- `docs/TRANSPORT_SHOCK_FREE_PROXY_SCORE_BRIDGE_REVIEW.md` (transport-shock-free-proxy-score-bridge-review-v1; P-score-46 bridge-review that reclassifies route freight as not required for the low-weight free-proxy path while keeping high-frequency physical confirmation blocked; no score write / no production write / no ODP finalBias)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md` (route-level tanker freight confirmation source-review only; future confirmation candidate for `transportShockCandidate`, no live fetch / no production write)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN.md` (route-level tanker freight proof-of-source design; next allowed step is dry-run-only manual artifact scaffold, no live fetch / no production write)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_FRONTEND_DISPLAY_BRIEF.md` (route-level tanker freight frontend display brief; docs-only future UI contract inside existing ODP folded detail, no frontend implementation / no production write)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITE_READINESS.md` (route-level tanker freight production write readiness; manual/local pre-write gate only, source-rights/manual blockers remain, no production write)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_THEMATIC_CARD_BRIEF.md` (route-level tanker freight thematic card brief; docs-only final target for a future C1 通胀与能源 card, no frontend implementation / no production write)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITER_CONTRACT_DESIGN.md` (route-level tanker freight production writer contract design; future `macroDrivers.energyTransport.routeFreightConfirmation` field contract only, no writer / no production write)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_GATE.md` (route-level tanker freight source-rights approval gate; manual source-rights gate keeps production writes blocked until explicit approval)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_TEMPLATE.md` (route-level tanker freight source-rights approval template; template-only manual evidence shape, grants no approval)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_INPUT_PREP.md` (route-level tanker freight source-rights input prep; creates ignored local draft, grants no approval)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_ARTIFACT_REVIEW.md` (route-level tanker freight source-rights artifact review; local/manual ignored artifact reviewer, no gate update approval)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL.md` (route-level tanker freight source-rights gate update proposal; dry-run proposal artifact, does not update gate)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL_REVIEW.md` (route-level tanker freight source-rights gate update proposal review; manual proposal reviewer, no apply/update)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md` (route-level tanker freight Baltic context policy; keeps existing Baltic Freight as broad context unless a separate deprecation/merge review is approved)
- `docs/ROUTE_LEVEL_TANKER_FREIGHT_DISABLED_WRITER_SCAFFOLD.md` (route-level tanker freight disabled writer scaffold; manual-artifact-only disabled projection, no production write)
- `docs/ENERGY_STRESS_FRONTEND_DISPLAY_BRIEF.md` (owner-approved docs-only frontend display brief for surfacing OPEC spare capacity + PortWatch inside existing ODP details; no UI implementation yet)
- `docs/PORTWATCH_TOS_PIN_REVIEW.md` (docs-only terms pin review; exact ArcGIS `Daily_Chokepoints_Data` licenseInfo points to IMF terms, runtime enum change deferred)

### China macro source review scope

- `docs/CHINA_V2X_SOURCE_REVIEW.md` (Stage 6 China 难源调研 + V2X 源)
- `docs/CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md` (China central-bank operation / SReFin / property index candidates, source-review only)

### Frontend visual + IA restructure scope (M-54 → M-55b)

- M-54 → M-55b(3 个 frontend-visual / IA-restructure 已合并 milestone scope docs;M-54 已被 M-94 推翻)— 已在 `docs/MILESTONE_INDEX.md` ## Archived 逐条登记,默认不加载(A1 验证 2026-06-02:纯历史、无活引用)。

### Recent milestones (M-57 → M-62)

- `docs/M-60_PAGES_TRIGGER_COVERAGE.md` — Pages trigger coverage 的现行保护边界仍有效；实现已合并进 `check:workflows`。
- `docs/M-61_SIPRI_INTEGRATION.md` — SIPRI manual normalized source 的现行数据边界仍有效。
- M-57 → M-59 已移入 Historical Background；其实现状态以当前 checker、runbook 与数据契约为准。
- (M-43 provenance, M-62 isoWeek merge — 见 MILESTONE_INDEX.md)

### M-94 V0 Path C frontend rebuild scope (current — 仍有效,非历史)

- `docs/M94_V0_DATA_CONTRACT.md` — M-94 V0 数据消费契约 v3.1 + 视觉权威基准(mock v2.1);文件自述「保持有效」,被 `AGENTS.md` 与 `DESIGN.md §5.6` 引用。前端 display-only,不动 scoring/decision/execution/position/Worker/pipeline。
- `docs/m94-v0/M94_V0_FRONTEND_REBUILD_PLAN.md` — 路径 C 前端重写 7-stage 计划参考(位于 `docs/m94-v0/` 子目录,非 `docs/` 顶层)。

### External AI scope

- `docs/EXTERNAL_AI_API_DESIGN.md`
- `docs/EXTERNAL_AI_PROMPT_CONTRACT.md`
- `docs/EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`
- `docs/EXTERNAL_AI_MANUAL_TEST_DESIGN.md`
- `docs/BUBBLE_WATCH_WEEKLY_EDITORIAL_DESIGN.md` — Bubble Watch 独立 DeepSeek 周度编辑层；只读展示，不影响 Core-23 / Shadow-4 或 GFRR 主链。
- `docs/MACRO_RISK_EDITORIAL_DESIGN.md` — 首页 Macro Risk DeepSeek 编辑层；嵌入主总览、每日单次调用、fail-closed，只解释不改分。
- `docs/EXTERNAL_AI_PROVENANCE_TRACKING_M43.md`
- `docs/EXTERNAL_AI_*_DESIGN.md` (其他;wildcard 覆盖未逐条列出的 External AI 设计文档 — 本轮有意不逐文件展开)

### World Order / Signal Intake scope

- `docs/WORLD_ORDER_STRESS.md`
- `docs/WORLD_ORDER_SOURCE_REVIEW.md`
- `docs/SIGNAL_INTAKE.md`
- `docs/M-63_ACLED_INTEGRATION.md` — ACLED manual-xlsx 接入操作契约(**仍有效,非普通历史**):含 EULA §3.3 硬边界(禁 workflow/script/crawler/browser 自动访问 `acleddata.com`);`acled-{weekly,monthly}-refresh-reminder.yml` 仍指向其 Runbook(Section 3 + Section 9)。

### Architecture (conditional, not current operating contract)

- `docs/UNIFIED_DATA_PIPELINE_ARCHITECTURE.md` — 下一阶段架构,不是当前运行合约

### Realtime worker scope

- `workers/gfrr-realtime-worker/README.md`

---

## Operating Document (large, mixed content; consult selectively)

包含当前规则与历史混合内容。阅读时只看 "current" 段,忽略 phase history 除非明确相关:

- `README.md` — 项目入口概览
- `docs/DATA_CONTRACT.md` — 数据契约 (规则与历史混合)
- `docs/OPERATIONS.md` — 运维与排查 (命令与版本历史混合)
- `docs/SYSTEM_UPGRADE_PLAN.md` — 升级计划与稳定基线 (规则与已完成阶段混合)
- `docs/MARKET_PRICING_WEEKLY_REFRESH.md` — QQQ 周线**手动 fallback runbook**(`scripts/refresh-qqq-data.ps1` operator 工具,非 CI)。QQQ 周历史已改 Yahoo cron 自动(`refresh-qqq-market-pricing.yml`),本 runbook 退为手动 fallback,非历史死档。

---

## Historical Background (NOT current authority)

仅作为历史背景,绝不覆盖任何 current 规则:

- [历史交接与审计表](PROJECT_HANDOFF_HISTORY.md)：从 backlog 原文迁出的日期记录，按需读取；不承载当前任务授权。

- `docs/V27_BASELINE.md` — v27.x 历史基线
- `docs/EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md` — readiness 历史审计
- `docs/EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md` — readiness 历史审计
- `docs/EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md` — readiness 历史
- `docs/EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md` — 历史 gate
- `docs/MARKET_PRICING_SOURCE_INCIDENT_LOG.md` — 历史 incident 记录
- Market Pricing 中间阶段设计文档(对应 checker 已于 checker 精简 Phase 1 退休)— 文件未删,仅作历史设计背景保留、移出 active 导航:`MARKET_PRICING_ARTIFACT_ONLY_FETCH_DESIGN.md`、`MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md`、`MARKET_PRICING_SOURCE_SELECTION_REVIEW.md`、`MARKET_PRICING_PROOF_OF_SOURCE_DESIGN.md`、`MARKET_PRICING_NETWORK_GATE_DESIGN.md`、`MARKET_PRICING_NETWORK_GATE_SCAFFOLD.md`、`MARKET_PRICING_SOURCE_COMPLIANCE_REVIEW_SCAFFOLD.md`、`MARKET_PRICING_SYMBOL_MAPPING_VERIFICATION_DESIGN.md`
- Market Pricing 已完成阶段文档(M-14 / M-22 / M-23 / M-25 / M-27 → M-30)— 文件未删,仅作历史设计/实施背景保留:`MARKET_PRICING_TEMPERATURE_DATA_SOURCE_DESIGN.md`、`MARKET_PRICING_MANUAL_WEEKLY_INPUT_SANITIZER_DESIGN.md`、`MARKET_PRICING_MANUAL_WEEKLY_INPUT_SANITIZER_SCAFFOLD.md`、`MARKET_PRICING_WEEKLY_HISTORY_BUILDUP.md`、`MARKET_PRICING_TEMPERATURE_DISPLAY.md`、`MARKET_PRICING_FIRST_FOLD_AND_CROSS_VALIDATION.md`、`MARKET_PRICING_MACRODRIVERS_SURFACING.md`、`CROSS_VALIDATION_EDUCATION_APPENDIX.md`
- Macro driver 已完成阶段文档(M-42 / M-45 → M-48)— 文件未删,仅作历史实施背景保留:`M-42_FED_LIQUIDITY_RESERVE_BALANCES.md`、`M-45_FRONTEND_FIELD_SYNCHRONIZATION.md`、`M-46_SLOOS_BANK_LOAN_STANDARDS.md`、`M-47_ISM_PMI_GROWTH_LAYER.md`、`M-48_NFCI_BANK_STRESS_INDEX.md`;ISM 当前源契约以 `M-67_ISM_PMI_SOURCE_REPAIR.md` 为准。
- Recent milestones 已完成阶段文档(M-57 → M-59)— 文件未删,仅作历史实施背景保留:`M-57_MARKET_TEMPERATURE_FIX_AND_PROJECT_BACKLOG.md`、`M-58_REALTIME_BAND_FIELD_COMPLETION.md`、`M-59_GDELT_CLOUD_INTEGRATION.md`;M-60 / M-61 因仍承载现行保护边界而保留在 Conditional。
- M-92 / M-93 today-summary-card + 普通用户 plain-summary 源审计 / spec 文档(`SUMMARY_VIEW_M92A_SOURCE_REVIEW.md`、`SUMMARY_VIEW_M92_GAP_ANALYSIS_V2.md`、`PLAIN_SUMMARY_M93A_V2_SOURCE_REVIEW.md`、`USER_LANGUAGE_AUDIT_M93_V1.md`)— 描述 2026-05 已 shipped、后被 M-94 V0 Path C 前端重写退场的 runtime path(checker / renderer / DOM 分别于 `5eff6ab`(stage 1)/ `c8229574`(stage 2)/ `91d06f3d` 退场);纯历史 pre-impl 审计/spec,2 个 spec doc 顶部带 STATUS banner。DESIGN / `M94_V0_DATA_CONTRACT.md` 的 plain-summary residual = M-94 cleanup debt,待 Batch 5余项 处理(`assets/styles.css` 的孤儿 `.plain-summary-section`/`.ps-kicker`/`.ps-story`/`.ps-meta` 选择器已于 `7f2ee0fd` 删除收口,2026-06-05;残留债仅剩 DESIGN / `M94_V0_DATA_CONTRACT.md` 文案)。
- 所有已合并 milestone 的 scope-only doc (按 Conditional Authority 处理,但默认不主动加载;见 `docs/MILESTONE_INDEX.md` Archived 段)

- [Energy / ODP / Transport 实施历史](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md)：P3-19/P3-19a 的逐阶段原文与证据，按需查阅；当前授权入口在 backlog 和领域附件，归档不取消仍有效的阶段约束。

- [完成事项与维护快照归档](PROJECT_COMPLETED_HISTORY.md)：原 backlog Section 1/3、P3-17/18/20 日期化原文；当前状态与未关闭事项留在 backlog。

## 指令维护验证策略

- [ADR-0025](ADR/0025-proportionate-validation.md)：普通文档本地轻量检查适用边界；CI/部署完整验证保持。
- [第三轮回执](REVIEW_2026-09-06_INSTRUCTIONS_PHASE3.md)：GPT-6 Astra 官方依据、规则精简、升级检测和信任步骤。

- [Git 分级授权](ADR/0026-tiered-git-authorization.md)：owner 已采纳，替代通用手动 Git 要求。
- [Markdown 最终复核](REVIEW_2026-09-06_MARKDOWN_FINAL.md)：全部项目 Markdown 扫描、neat-freak 上游判断和后续精简候选。

- [阶段文档统一状态](LEGACY_DOCUMENT_STATUS.md)：Market Pricing / External AI 历史文件的共同状态说明；实际操作仍遵守对应现行契约。
- [设计文档一致性决策](ADR/0027-design-document-consistency.md)：token 定义、单条旧边框例外及当前验证机制。
- [文档整理回执](REVIEW_2026-09-06_DOC_CONSOLIDATION.md)：状态合并、历史归档和设计修订的保全证据。

- [ODP/Energy backlog 整理回执](REVIEW_2026-09-06_ENERGY_BACKLOG.md)：现行状态、授权与历史分离，保全及验证结果。

- [历史记录断言迁移](ADR/0028-energy-record-assertion-location.md)：Energy/Transport 阶段记录由原文归档承接，现行操作权限仍按领域契约。
- [迁移回执](REVIEW_2026-09-06_ENERGY_ASSERTIONS.md)：机械差异、故障注入及完整验证结果。

- [本系列提交收尾回执](REVIEW_2026-09-06_CLOSEOUT.md)：范围、验证、Git 交付与仓库外维护状态。
