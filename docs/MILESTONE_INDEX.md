# Milestone Index

本页是已完成 milestone 的历史入口，不重复维护跨任务状态。开始工作先读 [PROJECT_BACKLOG](PROJECT_BACKLOG.md) 的当前条目和最新交接；只有核对历史决定、证据或具体回归时才读取下面对应阶段，无需逐篇预读。

## Active

- 当前入口：周报/雷达/Bubble 三标签；雷达 OFR 主读数、旧建议退役，详见 [DESIGN](../DESIGN.md) 与 [DATA_CONTRACT](DATA_CONTRACT.md)。
- 当前任务、生产验收缺口及持续来源限制：[PROJECT_BACKLOG Section 2](PROJECT_BACKLOG.md#section-2--open-backlog-items)。
- 前端 cache 版本以 [scripts/app.js](../scripts/app.js) 的 APP_VERSION 为准，不再维护第二份易失效的版本快照；检查组成以 package.json 为准。
- M-91 之后按具体任务/ADR 演进，不把早期 M-series 称为最近生产发布。SIPRI 年度入口和其它排程以对应 workflow/OPERATIONS 为准。

## Recently Merged

截至 2026-11-10 main `eeb7a1a3` 的最近代码整合；不是生产数据健康或付费运行验收证明。后续状态查实际 PR/main，无需每次数据提交更新本表。

| PR | 已合入内容 | 决策 / 证据 |
|---|---|---|
| [#533](https://github.com/ctmaomao/gfrr-auto-update-site/pull/533) | Editorial normalization / safe diagnostics | [ADR-0103](ADR/0103-editorial-review-diagnostics.md) |
| [#532](https://github.com/ctmaomao/gfrr-auto-update-site/pull/532) | 行政发布页标题与有效正文证据 | [ADR-0102](ADR/0102-administrative-release-evidence.md) |
| [#531](https://github.com/ctmaomao/gfrr-auto-update-site/pull/531) | Bubble r6 观察日与证据修复 | [ADR-0101](ADR/0101-bubble-observation-evidence-r6.md) |
| [#530](https://github.com/ctmaomao/gfrr-auto-update-site/pull/530) | 共享编辑新闻摘要清理 | [ADR-0099](ADR/0099-shared-editorial-news-hygiene.md) |
| [#529](https://github.com/ctmaomao/gfrr-auto-update-site/pull/529) | 隔离不合格 Bubble 旧稿 | Git/PR 回执；不把旧稿重新晋升 |

历史交接见[2026-09 至 2026-11 快照](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)、[更早交接](PROJECT_HANDOFF_HISTORY.md)；已完成清理见[完成记录](PROJECT_COMPLETED_HISTORY.md)。ODP/Energy/Transport 逐阶段原文见[专档](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md)，其中有效门槛不因归档取消。

## Archived (历史 milestone,scope-only,默认不加载)

> 全部已合并,作为 Conditional Authority 仅在对应历史 PR 范围内权威。
> 阅读它们前先确认任务边界是否真的需要历史细节;通常不需要。

### 最近五个 M-series milestone（原索引快照）

| # | 当时内容 | 主要 doc |
|---|---|---|
| **M-91** | Market Pricing NDX/IXIC implementation: QQQ remains primary;Yahoo `^NDX` / `^IXIC` become Daily/manual display-only auxiliary comparison metrics;cache 28.0M-91V | `docs/MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md` / `scripts/check-market-pricing-multi-asset.mjs` |
| **M-87** | Null-zero display guards: missing Brent/repo values stay missing instead of rendering as `0.00` or `+0.0bp`; cache 28.0M-87V | `scripts/check-null-zero-display-guards.mjs` |
| **M-86** | Frontend Proxy Coverage Semantics: Macro Overview separates public proxy coverage from formal/non-public source boundary notes; cache 28.0M-86V | `scripts/modules/renderMacroOverview.js` / `docs/DATA_CONTRACT.md` |
| **M-85** | Public Source Tranche 11: EIA Europe Brent Spot Price FOB public HTML proxy inside brentPricingLayer; audit-only/display-only;cache 28.0M-85V | `docs/DATA_CONTRACT.md` |
| **M-84** | Public Source Tranche 10: FRED CREACBW027SBOG public aggregate bank CRE loan balance proxy inside commercialRealEstate; audit-only/display-only;cache 28.0M-84V | `docs/DATA_CONTRACT.md` |

### M-series (M-31 → M-66)

- ADR-0014 DESIGN.md §4.1 为 IA ground truth；authority hierarchy (ADR > DESIGN.md > checks > HTML)；appendix content boundaries codified — `docs/ADR/0014-design-md-is-ia-ground-truth.md`
- M-66 Detail Data header anchor 改名为 `detail-data-header`;三大 appendix 顶级 subsection kicker 一致性加 checker 守护 — (无独立 doc;见 PR / git history)
- M-65 `#method-evidence` 内容清理;系统总览迁入 `#detail-data`;恢复/系统状态合并入 DATA HEALTH — (无独立 doc;见 PR / git history)
- M-64 首页 IA 三方契约对齐;World Order Stress 提升为顶级 regime overlay;External AI 回到 method 之后 — (见 DESIGN.md §4.1 + PR / git history)
- M-63a ACLED weekly regional sanitizer + importer;`xlsx@0.18.5` devDep;`peaceDividendRetreat` 重加权;旧 API adapter 移除 — (见 PROJECT_BACKLOG 历史摘要 + PR / git history)
- M-62 QQQ weekly history isoWeek-keyed merge + cross-seam monotonicity check — (无独立 doc;见 PR / git history)
- M-61 SIPRI 2024 真实数据 + 3 world_order supporting branch — `docs/M-61_SIPRI_INTEGRATION.md`
- M-60 Pages auto-deploy workflow_run 集中 + check:pages-trigger-coverage — `docs/M-60_PAGES_TRIGGER_COVERAGE.md`
- M-59 GDELT Cloud v2 Bearer fetcher + daily refresh workflow — `docs/M-59_GDELT_CLOUD_INTEGRATION.md`
- M-58 Realtime band 补齐 6 子卡 delta/source 字段 — `docs/M-58_REALTIME_BAND_FIELD_COMPLETION.md`
- M-31 editorial design contract compliance — `docs/EDITORIAL_DESIGN_CONTRACT_COMPLIANCE_M31.md`
- M-32 DESIGN.md amendment + visual refinement — `docs/EDITORIAL_DESIGN_CONTRACT_AMENDMENT_M32.md`
- M-33 bias color semantic fix — `docs/BIAS_COLOR_SEMANTIC_FIX_M33.md`
- M-34 Group A article.card spacing — `docs/SPACING_GOVERNANCE_M34.md`
- M-35 Group B spacing + footer — `docs/SPACING_GOVERNANCE_M35_AND_FOOTER.md`
- M-36 code dead weight removal — `docs/CODE_DEAD_WEIGHT_REMOVAL_M36.md`
- M-37 documentation version drift fix — `docs/DOCUMENTATION_VERSION_DRIFT_FIX_M37.md`
- M-38 section border consistency — `docs/SECTION_BORDER_CONSISTENCY_M38.md`
- M-39 Brent promotionAudit completeness — `docs/BRENT_PROMOTION_AUDIT_M39.md`
- M-40 (skipped — audit scanner false positives)
- M-41 Fed liquidity DFF + SOFR — `docs/M-41_FED_LIQUIDITY_EXTENDED_DRIVERS.md`
- M-42 Fed liquidity WRESBAL — `docs/M-42_FED_LIQUIDITY_RESERVE_BALANCES.md`
- M-43 External AI provenance metadata — `docs/EXTERNAL_AI_PROVENANCE_TRACKING_M43.md`
- M-44 Stable Observation Audit deprecation (cleanup only)
- M-45 frontend field synchronization — `docs/M-45_FRONTEND_FIELD_SYNCHRONIZATION.md`
- M-46 SLOOS bank loan standards — `docs/M-46_SLOOS_BANK_LOAN_STANDARDS.md`
- M-47 ISM PMI growth layer — `docs/M-47_ISM_PMI_GROWTH_LAYER.md`
- M-48 NFCI bank stress index — `docs/M-48_NFCI_BANK_STRESS_INDEX.md`
- M-49 Diesel crack spread — `docs/M-49_DIESEL_CRACK_SPREAD.md`
- M-50 Repo market spread — `docs/M-50_REPO_MARKET_SPREAD.md`
- M-51 World order narrative density — `docs/M-51_WORLD_ORDER_NARRATIVE_ENHANCEMENT.md`
- M-52 Risk asset mismatch narrative density — `docs/M-52_RISK_ASSET_MISMATCH_NARRATIVE_ENHANCEMENT.md`
- M-53 Overheat confirmation narrative density (7/7 narrative upgrades done) — `docs/M-53_OVERHEAT_CONFIRMATION_NARRATIVE_ENHANCEMENT.md`
- M-54 Frontend visual upgrade Phase 1 — `docs/M-54_FRONTEND_VISUAL_UPGRADE_PHASE1.md`
- M-55a IA restructure Phase 2a — `docs/M-55a_IA_RESTRUCTURE_PHASE2A.md`
- M-55b IA restructure Phase 2b — `docs/M-55b_IA_RESTRUCTURE_PHASE2B.md`
- M-56 validate-data consumer source whitelist (unblock Build #74)
- M-57 Market temperature judgment + PROJECT_BACKLOG.md — `docs/M-57_MARKET_TEMPERATURE_FIX_AND_PROJECT_BACKLOG.md`

### v28.0L series — External AI staged rollout (设计/审计 only,无生产数据影响)

- L-0 production integration design entry
- L-1 partially_ready_for_disabled_skeleton_only
- L-2 disabled skeleton
- L-3 workflow design (dry-run-only)
- L-3B dry-run workflow scaffold
- L-3C provider-call workflow design
- L-3D readiness checklist
- L-3E implementation plan
- L-3F provider-test workflow skeleton
- L-3F-1 skeleton audit
- L-3G secret decision
- L-3H provider-call unlock
- L-3H-2 fixture prompt quality
- L-3H-3 fixture provider-call audit
- L-3I local compact provider-call design
- L-3I-0 Node 24 runtime baseline
- L-3J local compact provider-call workflow
- L-3J-1 / J-3 / J-4 local compact metadata + execution-language + audit
- L-3K production readiness review
- L-3L production data contract design
- L-3M production contract validator
- L-3N production projection dry-run
- L-3O / L-3P / L-3P-1 first controlled production write (guard / write / audit-sync)
- L-3Q frontend display design
- L-3R hidden frontend scaffold
- L-3S / L-3T / L-3T-1 / L-3U / L-3U-1 visible display approval → enablement → audit → UX polish
- L-4A / L-4A-1 production refresh workflow
- L-4C refresh monitoring design

### v28.0M series — Market Pricing + Editorial + Visual

- M-1 → M-7V homepage IA / judgment calibration / reading path / external AI display coverage
- M-7U homepage IA de-duplication
- M-7V / M-7V-1 reading path + audit-sync
- M-15 market pricing source-specific artifact fetch scaffold
- M-15A unified data pipeline architecture
- M-16 → M-29 (见上 Conditional Authority Market Pricing scope)
- M-30 cross-validation education appendix
- M-31 → M-58 (见上 Recently Merged + M-series 段)

### v28.0N series — Editorial layout (cockpit 改为报纸式版面)

- N-1 editorial first-fold
- N-2 editorial pressure-source
- N-3 editorial signal-layer
- N-4 editorial paper/font
- N-5 editorial macro-driver
- N-6 editorial market-temperature waiting-state
- N-7 editorial risk-engine
- N-8 editorial cross-validation
- N-9 editorial Global Risk Heatmap
- N-10 editorial Detailed Data appendix
- N-11 editorial Method / Evidence / Boundary appendix
- N-12 editorial External AI read-only panel
- N-13 editorial inline dark theme cleanup
- N-14 editorial Big Number + threshold scale
- N-15 editorial Key Changes + Watch List
- N-16 editorial redesign contract guard

### v28.0K series — External AI manual/offline scaffolds (已被 L-series 取代)

- K-1 / K-2 / K-3A / K-3B / K-3D / K-4A / K-4B / K-4C / K-4D / K-4E / K-4E-1~4 / K-4F / K-4G

### v28.0G / H / I series — Health / World Order / Cockpit

- G-1 ~ G-10 Worker secondary diagnostics, freshness audit, Brent promotion gates
- H-1 / H-2 / H-2B World Order Stress Overlay v1
- I 系列 cockpit-to-editorial-judgment 第一阶段升级

### v27.x — Historical baseline

- 见 `docs/V27_BASELINE.md` (deprecated;仅历史背景)

---

## How to maintain this index

当前工作只维护 PROJECT_BACKLOG 对应条目；milestone 完成时在本页保留简短结论和证据链接，不复制实时版本、来源健康、费用余额或未完成清单。历史事实保留；错误事实可附带日期和依据更正，已替代决策标明后续 ADR，不把整理变成重写授权/验收历史。
