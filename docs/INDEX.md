# Documentation Authority Index

> 本文档定义本仓库所有 `.md` 文档的权威等级。
> 抽取自 `AGENTS.md` (v28.0J-pre-split tag) 的 "Documentation Authority Index" 段。
> 任何新增、删除、迁移文档时,必须同步更新本索引。

## Rule of Conflict Resolution

如两份文档冲突:

1. **Current Authority** beats everything else.
2. Within Current Authority, the more specific/restrictive rule wins.
3. Scope-conditional authority does NOT override Current Authority.
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
| `scripts/check-homepage-ia-contract.mjs` | 首页 IA 顺序与 anchor 权威 |
| `scripts/check-editorial-redesign-contract.mjs` | 字体白名单 + IA + 设计 anchor 权威 |
| `package.json` | 所有 check 命令与 `check:all` 组成权威源 |
| `docs/PROJECT_BACKLOG.md` | 项目自我记忆 + 跨会话 active task |
| `docs/DATA_SOURCES.md` | 10+ 外部数据源边界 (新增于 v28.0J-pre-split 后) |
| `docs/ADR/README.md` | 重大架构决策索引 (新增于 v28.0J-pre-split 后) |

---

## Conditional Authority (authoritative only within their scope)

仅在对应 PR / 子系统范围内权威。**默认会话不应将其作为全项目规则。**

### Market Pricing scope (M-14 → M-29)

- `docs/MARKET_PRICING_TEMPERATURE_DATA_SOURCE_DESIGN.md`
- `docs/MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md` (尚未 production-enabled)
- `docs/MARKET_PRICING_NETWORK_GATE_SCAFFOLD.md` (M-17)
- `docs/MARKET_PRICING_SOURCE_COMPLIANCE_REVIEW_SCAFFOLD.md` (M-18)
- `docs/MARKET_PRICING_SYMBOL_MAPPING_VERIFICATION_DESIGN.md` (M-19)
- `docs/MARKET_PRICING_SOURCE_FORMAT_VERIFICATION_DESIGN.md` (M-20)
- `docs/MARKET_PRICING_NETWORK_OPEN_THROTTLED.md` (M-21)
- `docs/MARKET_PRICING_MANUAL_WEEKLY_INPUT_SANITIZER_DESIGN.md` (M-22)
- `docs/MARKET_PRICING_MANUAL_WEEKLY_INPUT_SANITIZER_SCAFFOLD.md` (M-23)
- `docs/MARKET_PRICING_FIRST_REAL_RECORD_WRITE.md` (M-24)
- `docs/MARKET_PRICING_WEEKLY_HISTORY_BUILDUP.md` (M-25)
- `docs/MARKET_PRICING_METRICS_CALCULATION.md` (M-26)
- `docs/MARKET_PRICING_TEMPERATURE_DISPLAY.md` (M-27)
- `docs/MARKET_PRICING_FIRST_FOLD_AND_CROSS_VALIDATION.md` (M-28)
- `docs/MARKET_PRICING_MACRODRIVERS_SURFACING.md` (M-29)
- `docs/CROSS_VALIDATION_EDUCATION_APPENDIX.md` (M-30)

### Editorial / Visual scope (M-31 → M-39)

- `docs/EDITORIAL_DESIGN_CONTRACT_COMPLIANCE_M31.md` (M-31)
- `docs/EDITORIAL_DESIGN_CONTRACT_AMENDMENT_M32.md` (M-32)
- `docs/BIAS_COLOR_SEMANTIC_FIX_M33.md` (M-33)
- `docs/SPACING_GOVERNANCE_M34.md` (M-34)
- `docs/SPACING_GOVERNANCE_M35_AND_FOOTER.md` (M-35)
- `docs/CODE_DEAD_WEIGHT_REMOVAL_M36.md` (M-36)
- `docs/DOCUMENTATION_VERSION_DRIFT_FIX_M37.md` (M-37)
- `docs/SECTION_BORDER_CONSISTENCY_M38.md` (M-38)
- `docs/BRENT_PROMOTION_AUDIT_M39.md` (M-39)

### Macro driver expansion scope (M-41 → M-50)

- `docs/M-41_FED_LIQUIDITY_EXTENDED_DRIVERS.md`
- `docs/M-42_FED_LIQUIDITY_RESERVE_BALANCES.md`
- `docs/M-45_FRONTEND_FIELD_SYNCHRONIZATION.md`
- `docs/M-46_SLOOS_BANK_LOAN_STANDARDS.md`
- `docs/M-47_ISM_PMI_GROWTH_LAYER.md`
- `docs/M-48_NFCI_BANK_STRESS_INDEX.md`
- `docs/M-49_DIESEL_CRACK_SPREAD.md`
- `docs/M-50_REPO_MARKET_SPREAD.md`

### Cross-validation narrative density scope (M-51 → M-53)

- `docs/M-51_WORLD_ORDER_NARRATIVE_ENHANCEMENT.md`
- `docs/M-52_RISK_ASSET_MISMATCH_NARRATIVE_ENHANCEMENT.md`
- `docs/M-53_OVERHEAT_CONFIRMATION_NARRATIVE_ENHANCEMENT.md`

### Frontend visual + IA restructure scope (M-54 → M-55b)

- `docs/M-54_FRONTEND_VISUAL_UPGRADE_PHASE1.md`
- `docs/M-55a_IA_RESTRUCTURE_PHASE2A.md`
- `docs/M-55b_IA_RESTRUCTURE_PHASE2B.md`

### Recent milestones (M-57 → M-62)

- `docs/M-57_MARKET_TEMPERATURE_FIX_AND_PROJECT_BACKLOG.md`
- `docs/M-58_REALTIME_BAND_FIELD_COMPLETION.md`
- `docs/M-59_GDELT_CLOUD_INTEGRATION.md`
- `docs/M-60_PAGES_TRIGGER_COVERAGE.md`
- `docs/M-61_SIPRI_INTEGRATION.md`
- (M-43 provenance, M-62 isoWeek merge — 见 MILESTONE_INDEX.md)

### External AI scope

- `docs/EXTERNAL_AI_API_DESIGN.md`
- `docs/EXTERNAL_AI_PROMPT_CONTRACT.md`
- `docs/EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`
- `docs/EXTERNAL_AI_MANUAL_TEST_DESIGN.md`
- `docs/EXTERNAL_AI_PROVENANCE_TRACKING_M43.md`
- `docs/EXTERNAL_AI_*_DESIGN.md` (其他)

### World Order / Signal Intake scope

- `docs/WORLD_ORDER_STRESS.md`
- `docs/WORLD_ORDER_SOURCE_REVIEW.md`
- `docs/SIGNAL_INTAKE.md`

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

---

## Historical Background (NOT current authority)

仅作为历史背景,绝不覆盖任何 current 规则:

- `docs/V27_BASELINE.md` — v27.x 历史基线
- `docs/EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md` — readiness 历史审计
- `docs/EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md` — readiness 历史审计
- `docs/EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md` — readiness 历史
- `docs/EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md` — 历史 gate
- `docs/MARKET_PRICING_SOURCE_INCIDENT_LOG.md` — 历史 incident 记录
- 所有已合并 milestone 的 scope-only doc (按 Conditional Authority 处理,但默认不主动加载;见 `docs/MILESTONE_INDEX.md` Archived 段)
