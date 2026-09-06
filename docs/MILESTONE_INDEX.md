# Milestone Index

> Milestone (M-XX 与 vXX.XX) 一行索引。本文件是 milestone 历史的默认入口;
> `README.md` 只保留项目入口摘要,不再承载 milestone 流水账。
>
> **加载策略**:默认会话只读 日期化会话交接和逐次审计表见 [历史归档](PROJECT_HANDOFF_HISTORY.md)，只在核对对应事件时读取；当前待办仍以 PROJECT_BACKLOG 为准。

ODP/Energy/Transport 的逐阶段细节见 [P3-19/P3-19a 原文归档](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md)；按当前 backlog 指针读取对应范围。

旧 Completed 表与 P3-17/18/20 过程见[完成记录](PROJECT_COMPLETED_HISTORY.md)，不作为新任务入口。

## Active 与 ## Recently Merged 段。
> ## Archived 段仅在用户明确要求查阅历史时读取。
> 这避免每次会话被 70+ 历史 milestone 文档污染。

## Active

当前未关闭、影响进行中工作的 milestone 与状态:

- **当前生产**: 最后正式 milestone = v28.0M-91;其后增量工作改走 Stage-brief 流程(不再发 M-XX,如 P3-16 China aggregator 换源 / A-scope 文案 / checker streamline Phase 1 / C5 world-economy 加股指批次 / 系统终审批 A-E(展示完整性·守卫·死重·数据龄·跨市场印证层),详见 `docs/PROJECT_BACKLOG.md`)。frontend cache 已改描述式版本串(非 `28.0M-NNV`),当前 `odp-thermal-facility-window-quality-1`;P64/P66 ODP verdict history monitor、P65 FIRMS 30-day history-window capacity repair、P67 Web NGrams historical sample-age display、P68 FIRMS facility-window baseline quality gate 已落地；`check:all` 组成以 `package.json` 为准。M-91 Market Pricing NDX/IXIC auxiliary implementation 已落地；M-87 null-zero display guards 已落地；M-86 frontend proxy coverage semantics 已落地；M-85 public source tranche 11 已落地；M-84 public source tranche 10 已落地；M-83 public source tranche 9 已落地；M-82 public source tranche 8 已落地；M-81 public source tranche 7 已落地；M-80 public source tranche 6 已落地；M-79 public source tranche 5 已落地；M-78 public source tranche 4 已落地；M-77 public source tranche 3 已落地；M-76 frontend macro field surfacing 已落地；M-75 check suite compaction 已落地；M-74 expanded macro data auto ingestion 已落地；M-73 BGCR/TGCR NY Fed secured rates runtime fix + employment quality public FRED expansion 已落地；M-71 Brent public proxy source review 已落地；M-70 commercialRealEstate (CRE) 已落地；M-69 consumerRetail (CARTS) 已落地；M-68 employment breadth 已落地；M-67 ISM PMI source repair 已落地；ADR-0014 IA contract authority hierarchy 已落地；M-63b ACLED monthly evidence-only ingestion 已落地；M-63c ACLED reminder workflows 已落地
- **下一步**: 见 `docs/PROJECT_BACKLOG.md` Section 2 Open Backlog Items
- **Open backlog 主线**: P1-4 ACLED 接入完整闭合 (M-63a/b/c 全部落地)；P2-7 employment breadth 已落地；P2-8 high-frequency consumer evidence 已落地并关闭；P2-9 CRE/CDX/私募信贷已落地并关闭（M-70 CRE-only;CDX/私募信贷=P3-15）；P3-* 已明确 won't fix
- **年度提醒**: M-61b SIPRI 每年 5 月 1 日 GitHub Actions issue (`sipri-annual-refresh-reminder.yml`)

## Recently Merged (最近 5 个,详细可读对应 doc)

| # | 一句话 | 主要 doc |
|---|---|---|
| **M-91** | Market Pricing NDX/IXIC implementation: QQQ remains primary;Yahoo `^NDX` / `^IXIC` become Daily/manual display-only auxiliary comparison metrics;cache 28.0M-91V | `docs/MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md` / `scripts/check-market-pricing-multi-asset.mjs` |
| **M-87** | Null-zero display guards: missing Brent/repo values stay missing instead of rendering as `0.00` or `+0.0bp`; cache 28.0M-87V | `scripts/check-null-zero-display-guards.mjs` |
| **M-86** | Frontend Proxy Coverage Semantics: Macro Overview separates public proxy coverage from formal/non-public source boundary notes; cache 28.0M-86V | `scripts/modules/renderMacroOverview.js` / `docs/DATA_CONTRACT.md` |
| **M-85** | Public Source Tranche 11: EIA Europe Brent Spot Price FOB public HTML proxy inside brentPricingLayer; audit-only/display-only;cache 28.0M-85V | `docs/DATA_CONTRACT.md` |
| **M-84** | Public Source Tranche 10: FRED CREACBW027SBOG public aggregate bank CRE loan balance proxy inside commercialRealEstate; audit-only/display-only;cache 28.0M-84V | `docs/DATA_CONTRACT.md` |
## Archived (历史 milestone,scope-only,默认不加载)

> 全部已合并,作为 Conditional Authority 仅在对应历史 PR 范围内权威。
> 阅读它们前先确认任务边界是否真的需要历史细节;通常不需要。

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

## How to add a new milestone

1. PR 合并后,在 `## Recently Merged` 表顶部加一行,把旧的最后一行下移到 `## Archived` 相应段
2. 如果 milestone 影响 active backlog,同步更新 `docs/PROJECT_BACKLOG.md`
3. 不要修改已存在的 milestone 行(它们已是历史事实)
