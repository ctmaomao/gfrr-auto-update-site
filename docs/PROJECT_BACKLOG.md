# Project Backlog · GFRR Auto-Update Site

> Persistent backlog of open data/feature items, completed milestones, and audit history.
> This is project-self-memory across sessions. When starting a new session, fetch `docs/PROJECT_BACKLOG.md` first.

---

## Section 1 · 维护状态

| 项 | 值 |
|---|---|
| 当前生产状态 | v28.0M-67 (+ ISM PMI source repair) |
| Cache version | `28.0M-66V` (M-67 不改前端,无 bump) |
| check:all 项数 | 69 |
| 最后审计日期 | **2026-05-20** (M-67 ISM PMI source repair; M-66 legacy anchor + subsection kicker polish; ADR-0014 IA contract authority hierarchy; M-63b ACLED monthly ingestion) |
| 最后 daily refresh | 2026-05-17 (Build #74, commit `e366b60`) |
| GDELT 刷新 | M-59 起由 `Refresh World Order Stress` daily workflow 维护 |
| Pages auto-deploy | M-60 起集中由 `deploy-static-site-to-pages.yml` 的 `workflow_run.workflows` 列表维护，并由 `check:pages-trigger-coverage` 守护 |
| SIPRI 状态 | M-61 起 `config/world-order-sipri-normalized.json` 使用 SIPRI 2024 真实数据，world-order build 后为 `ok` |
| QQQ weekly refresh | M-62 起 M-24 history writer 由 integral replace 改为 `isoWeek` keyed merge；weekly sanitized batches 可增量延长历史 |
| ACLED 状态 | M-63a (weekly) + M-63b (monthly) 双 sanitizer + 联合 importer 落地；weekly/monthly 都 `isRealData=true` → `ok`；一边到位 → `partial`；两边都缺 → `manual_required`；evidence-only 进入 `peaceDividendRetreat`,不动权重 |
| ISM PMI 状态 | M-67 起由 `scripts/run-daily-pipeline.mjs::fetchIsmManufacturingPmiReport` 低频解析 ismworld.org 公开报告页；audit-only/display-only；失败降级为 `fallback` / `source_unavailable` / `parse_error` |
| ADR-0013 | 2026-05-19 落地 (PR #231)；ADR-0001 zero-deps 精化为 runtime zero-dep,本地开发工具可在 ADR-0013 约束下使用 devDependencies |
| First devDependency | M-63a 起 `xlsx@0.18.5` (SheetJS) 仅由 `scripts/world-order/sanitize-acled-weekly.mjs` 导入,runtime/check/workflow/frontend 不得引用 |
| 下次审计建议 | 2026-05-25 或下一次 milestone 合并时 |

---

## Section 2 · Open Backlog Items

### P0 Items (Critical — 必须做)

(All P0 items as of M-57 are resolved.)

### P1 Items (Recommended)

#### P1-4: ACLED 数据源配置 (in progress — M-63 series)
- **描述**: `sources.acled.status` 已从 `not_configured` 升级为 `manual_required` / `ok` 双状态 (取决于是否有 weekly xlsx 导入)
- **数据源**: ACLED Open-license aggregated xlsx downloads (manual download;no scraping/crawling per EULA §3.3)
- **类型**: 类型 2
- **估计 PR**: M-63 分 3 个小 PR 推进
- **M-63a — ACLED weekly regional sanitizer + importer**: ✅ `done` (PR #232, merged 2026-05-19);weekly 6 regional files → `config/world-order-acled-regional-weekly.json`;API path removed;`xlsx@0.18.5` 进入 devDependencies
- **M-63b — ACLED monthly global aggregation**: ✅ `done` (this PR);monthly 6 global files → `config/world-order-acled-global-monthly.json`;`fetch-acled.mjs` 联合 weekly+monthly,引入 `partial` status;evidence-only,无 scoring 权重改动;`check:all` 68 → 69
- **M-63c — ACLED weekly + monthly reminder workflows**: status `planned`;PR γ/3 of M-63 series;GitHub reminder workflows only,after manual-ingestion contracts are reviewed

### P2 Items (Optional)

#### P2-7: 就业广度接入
- 字段: ICSA (Initial Claims), CCSA (Continuing Claims), JTSJOL (JOLTS)
- 估计 PR: ~100 行

#### P2-8: 高频消费证据
- 字段: Redbook Same-Store Sales, BoA Card Data
- 估计 PR: ~150 行

#### P2-9: CRE / CDX / 私募信贷
- 字段: CDX HY/IG, CRE delinquency, private credit fundraising
- 估计 PR: ~200 行

### P3 Items (Won't Fix — 设计 placeholder)

#### P3-10: Fed dot plot / OIS forward rates / FOMC 文本分析
- **不修原因**: 项目明确边界, 不接入官方预测路径

#### P3-11: Brent 期限结构 / Platts Dated Brent / Shipping freight
- **不修原因**: 商业数据成本高

#### P3-12: signal-noise bucket 硬编码
- **不修原因**: 设计为框架提醒

#### P3-13: ReliefWeb 冲突人道主义报告接入
- **不修原因**: API 被 bot 封锁（HTTP 406，"Blocked due to bot activity"）；解封须人工联系 hdx@un.org 申请白名单，性价比低；GDELT 已覆盖同类冲突信号
- **诊断日期**: 2026-05-20，本地 + CI 环境均复现，4 条查询全部 406
- **解封路径**: 若未来有 UN HDX 合作意愿，联系 hdx@un.org 后另开版本评估；在此之前不再跟进
- **前端状态**: `render.js` 限制提示已更新为"API 被 bot 封锁（HTTP 406），已列为 P3"

---

## Section 3 · Completed Items

| Milestone | 描述 | PR | 完成日期 | 验证状态 |
|---|---|---|---|---|
| M-46 | SLOOS Bank Loan Standards | #196 | 2026-05 | ✅ pipeline + data refreshed (Build #74) |
| M-47 | ISM PMI Growth Layer fields + narrative branches | #197 | 2026-05-16 | ⚠️ Source path superseded by M-67; fields/branches retained, active source is ISM public report parser |
| M-48 | NFCI Bank Stress Index | #198 | 2026-05 | ✅ pipeline + data refreshed (Build #74) |
| M-49 | Diesel Crack Spread | #199 | 2026-05 | ✅ pipeline + data refreshed (Build #74) |
| M-50 | Repo Market Spread | #200 | 2026-05-16 | ✅ pipeline + data refreshed (Build #74) |
| M-51 | World Order Pressure Narrative | #201 | 2026-05 | ✅ 7 narrative evidence active |
| M-52 | Risk Asset Mismatch Narrative | #202 | 2026-05 | ✅ strong_confirmation |
| M-53 | Overheat Confirmation Narrative | #203 | 2026-05 | ✅ strong_confirmation |
| M-54 | Frontend Visual Phase 1 | #204 | 2026-05 | ✅ emoji prefix + evidence color |
| M-55a | IA Restructure Phase 2a | #205 | 2026-05 | ✅ realtime band uplift + external-ai uplift |
| M-55b | IA Restructure Phase 2b | #206 | 2026-05 | ✅ main-module visual standard + wow-key-changes JS-runtime |
| M-56 | validate-data consumer source whitelist | #207 | 2026-05-17 | ✅ Build #74 PASS, M-46~M-50 fields activated |
| M-57 | buildMarketTemperature fix + PROJECT_BACKLOG.md creation | (this PR) | 2026-05-17 | ✅ judgment-render layer aligned + project memory established |
| M-58 | Realtime band field completion (P1-6) + Brent null-check fix + unit suffixes | (this PR) | 2026-05-17 | ✅ 9 new DOM ids locked |
| M-59 | GDELT Cloud v2 integration (P1-5) | (this PR) | 2026-05-17 | ✅ Replace legacy DOC API with Cloud v2; daily refresh; 4 new narrative supporting branches |
| M-60 | Pages deploy trigger coverage (workflow_run centralization + heuristic guard) | (this PR) | 2026-05-17 | ✅ Centralize Pages auto-deploy via Pages workflow_run.workflows list; remove ad-hoc `gh workflow run` from refresh-world-order-stress; resolve latent external-ai-production-refresh hole; add heuristic contract check guarding all committing-to-main workflows |
| M-61 | SIPRI manual-normalized integration (P1-3 close) | (this PR) | 2026-05-18 | ✅ Import verified 2024 SIPRI data (top 10 + 5 regions); add 3 narrative supporting branches (global arms race, major powers rising, GDP share rising); document annual refresh procedure; resolves last `manual_required` external source |
| M-62 | QQQ weekly history merge (M-24 replace → isoWeek merge) | (this PR) | 2026-05-18 | ✅ Enables incremental weekly QQQ refresh; incoming wins on same isoWeek; 8 sanity checks + synthetic merge coverage; no data file changes |
| ADR-0013 prep-1 | DATA_SOURCES.md ACLED canonical metadata lock | #230 | 2026-05-19 | ✅ M-63a prep blocker A — ACLED 边界 doc 锁定 (manual-xlsx-only, EULA §3.3) |
| ADR-0013 prep-2 | ADR-0013 Allow devDependencies for local development tools | #231 | 2026-05-19 | ✅ M-63a prep blocker B — refines ADR-0001 zero-deps scope; runtime 保持 zero-dep,local dev tools 可在 ADR-0013 约束下用 devDeps |
| M-63a | ACLED weekly regional sanitizer + importer (API path removed) | #232 | 2026-05-19 | ✅ First consumer of ADR-0013 (`xlsx@0.18.5`); weekly 6 regional xlsx → normalized JSON; ACLED 进入 `peaceDividendRetreat` (SIPRI 0.35 + GDELT 0.20 + ACLED 0.25 + module 0.20); `check:all` 67 → 68; old API adapter (`ACLED_API_KEY`/`ACLED_EMAIL`/`api.acleddata.com`) wholesale-removed |
| M-63b | ACLED monthly global sanitizer + 联合 importer (evidence-only) | (this PR) | 2026-05-20 | ✅ Monthly 6 global xlsx → `config/world-order-acled-global-monthly.json`; `fetch-acled.mjs` 联合 weekly+monthly,引入 `partial` 状态;global YoY (vs prior-3y avg) + last-12m vs prior-12m trend + top10 escalating/fatalities countries;`peaceDividendRetreat` 权重未改动 (方案 A);`check:all` 68 → 69 |
| M-64 | IA contract reconciliation + top-level section restructure | (this PR) | 2026-05-20 | ✅ DESIGN.md §4.1 / index.html / IA check scripts aligned; World Order Stress promoted to top-level regime overlay; External AI moved after method evidence; cache bumped to 28.0M-64V |
| M-65 | method-evidence content cleanup | (this PR) | 2026-05-20 | ✅ "站内总览与核心风险明细" migrated to `#detail-data` SYSTEM OVERVIEW; "恢复状态与系统说明" merged into DATA HEALTH; all runtime DOM ids preserved; cache bumped to 28.0M-65V |
| M-66 | legacy anchor + subsection kicker consistency polish | (this PR) | 2026-05-20 | ✅ Detail Data header anchor renamed to `detail-data-header`; top-level method/execution subsections now carry subsection-meta kickers; `check:editorial-redesign-contract` enforces kicker consistency; cache bumped to 28.0M-66V |
| ADR-0014 | DESIGN.md §4.1 为 IA ground truth；appendix content boundaries codified；subsection-meta mandate enforced by check scripts | `6e99cee` | 2026-05-20 | ✅ IA authority hierarchy (ADR > DESIGN.md §4.1 > check scripts > HTML) established；top-down change direction mandated；M-64/65/66 三方漂移根因归档；`docs/ADR/0014-design-md-is-ia-ground-truth.md` |
| M-67 | ISM PMI source repair | (this PR) | 2026-05-20 | ✅ Broken FRED PMI path replaced with low-frequency parser for ISM public Manufacturing PMI report page; `sourceStatus.pmi` four-state contract added; zero new deps; PMI remains audit-only/display-only; `check:all` stays 69 |

---

## Section 4 · Future Considerations

- **市场温度计扩展**: 当前仅 QQQ, 可考虑加入 SPY/IWM/EFA/EEM 多资产温度计 (需要各自 60 周历史)
- **Brent 实物端**: 若未来项目预算允许, 接入 Platts Dated Brent + Baltic shipping rates
- **NLP for FOMC**: 替代 P3-10, 用开源 FOMC minutes 文本分析做 hawkishness score
- **Backtesting layer**: 历史 narrative 触发回放, 验证在 2008/2020/2022 危机解释力
- **Worker reliability**: 当前 marketConfirmationInput 来源 single worker, 考虑双 worker fallback
- **Annual SIPRI data refresh**: 每年 4/5 月 SIPRI Fact Sheet / Military Expenditure Database 发布后，更新 `config/world-order-sipri-normalized.json` 最新年度数据并触发 `Refresh World Order Stress`。估计每年 20-30 分钟。

---

## Section 5 · Audit History

| Date | Type | Auditor | Outcome | Notes |
|---|---|---|---|---|
| 2026-05-17 | 全项目数据完整性审计 | Claude (Opus 4.7) | 13 Open items 识别 (2 P0, 4 P1, 3 P2, 4 P3) | M-55b 后审计 |
| 2026-05-17 | M-56 fix + Build #74 refresh | Claude Code 诊断 + Codex 实施 | P0-1 已完成 | validate-data.mjs 修复, refresh commit `e366b60` |
| 2026-05-17 | M-57 buildMarketTemperature fix + PROJECT_BACKLOG | Codex | P0-2 解决, backlog 文件建立 | 本文件进入 check:all |
| 2026-05-17 | P1-6 realtime band completion audit + M-58 implementation | Claude Code + Codex | P1-6 resolved | 9 new DOM ids + null-safe delta formatting |
| 2026-05-17 | P1-5 GDELT Cloud v2 integration | Claude Code + Codex | P1-5 resolved | Cloud v2 Bearer API + daily refresh workflow; ACLED deferred to later M-series |
| 2026-05-17 | M-60 Pages trigger coverage audit + implementation | Codex | Pages deploy trigger hole resolved | Centralized workflow_run listener + heuristic check:pages-trigger-coverage |
| 2026-05-18 | M-61 SIPRI manual-normalized integration | Codex | P1-3 resolved | SIPRI 2024 normalized data + 3 world-order narrative supporting branches |
| 2026-05-18 | M-62 QQQ weekly history merge | Codex | M-24 weekly refresh unblocked | Replaces integral history overwrite with isoWeek-keyed merge + cross-seam guard |
| 2026-05-19 | M-63a ACLED weekly regional sanitizer + importer | Claude Code (review) + Codex (impl) | P1-4 partially resolved (weekly track done; monthly = M-63b) | First ADR-0013 consumer (`xlsx@0.18.5` devDep); API adapter wholesale-removed; `peaceDividendRetreat` reweighted; `check:all` 67 → 68 |

---

## Section 6 · 工作流约定

### 添加新 backlog item
1. 在 Section 2 找到合适优先级 (P0/P1/P2/P3)
2. 用模板填写: 标题 + 详细描述 + 数据/字段位置 + 期望状态 + 数据源 + 类型 + 估计 PR 大小 + 备注
3. 优先级 P0 必须配修复方案; P1+ 可仅记录待评估
4. commit message: `chore: add backlog item <id> <title>`

### 完成 backlog item
1. PR merge 后, 移到 Section 3 (Completed Items) 表格
2. 填入 milestone 编号 / PR # / 完成日期 / 验证状态
3. 从 Section 2 删除原条目
4. 更新 Section 1 当前生产状态

### 归档已完成
- Completed items 不删除, 永久保留作历史
- 超过 20 项时, 按 milestone 块折叠

### 标记 Won't Fix (P3)
1. 移到 P3 sub-section
2. **必须**写明"不修原因"(设计 / 成本 / 边界)
3. 不归入 Completed Items

### 审计触发条件
1. 每次 milestone PR merge 后, 增量审计
2. 每月一次 full-project audit
3. 用户主动要求 ad-hoc audit

### Backlog 文件位置
- `docs/PROJECT_BACKLOG.md` (本文件)
- 进入 `check:all` 自动验证 (M-57 起)
- 是项目【一级契约】, 不可删除
- 应在每次 milestone PR 中 review 是否需要更新

### 新 session 启动
- AI 应主动 fetch `https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/main/docs/PROJECT_BACKLOG.md`
- 立刻知道当前状态 + 下一步该做什么

---

*本文档由 2026-05-17 全项目数据完整性审计 + M-57 实施。后续 milestone 必须维护本文件。*

---

## 🔄 Session Handoff (最新)

> 本段在每个会话结束时由 Claude 主动更新。新会话启动时优先读本段,快速对齐"上次到哪了"。
> 只保留**最新一次** handoff 状态;不要堆历史(历史看 git log)。

### Session Handoff (2026-05-20 晚)

- **上次会话结束于**: M-67 ISM PMI source repair 完成。M-47 的 broken FRED PMI path 已替换为 ismworld.org 公开 Manufacturing PMI report parser；`macroDrivers.consumer.source` 目标值为 `FRED:UMCSENT; ISM:ManufacturingPMI`；`sourceStatus.pmi` 为 `live` / `fallback` / `source_unavailable` / `parse_error`；PMI 仍 audit-only/display-only。
- **当前进行中**: 等用户审 diff 后 commit/push。未改 `data/radar-data.json`、`realtime/`、workflow、frontend JS/HTML/CSS。
- **下一步建议**: 等下一轮 Daily pipeline 观察 `consumer.diagnostics.pmi` 与 PMI 是否转为 `live`；之后可推进 M-63c reminder workflows 或 P2-7 就业广度接入。
- **阻塞或等待**: 无技术阻塞。若 ISM 页面连续两个发布周期未能解析,按 `docs/M-67_ISM_PMI_SOURCE_REPAIR.md` runbook 做 source review。
