# Project Backlog · GFRR Auto-Update Site

> Persistent backlog of open data/feature items, completed milestones, and audit history.
> This is project-self-memory across sessions. When starting a new session, fetch `docs/PROJECT_BACKLOG.md` first.

---

## Section 1 · 维护状态

| 项 | 值 |
|---|---|
| 当前生产状态 | v28.0M-74 (Brent physical / term / freight proof-of-source design; no live fetch/runtime/data/frontend change) |
| Cache version | `28.0M-72V` |
| check:all 项数 | 74 |
| 最后审计日期 | **2026-05-21** (M-74 Brent physical proof-of-source design; M-72 macro-driver date display fix; M-71 Brent public proxy source review; M-70 CRE FRED commercialRealEstate ingestion; M-69 Chicago Fed CARTS consumerRetail ingestion; M-68 employment breadth; M-67 ISM PMI source repair; M-63c ACLED reminder workflows; M-66 legacy anchor + subsection kicker polish; ADR-0014 IA contract authority hierarchy; M-63b ACLED monthly ingestion) |
| 最后 daily refresh | 2026-05-20 (Build Daily Radar Data run `26145627306`, commit `5de8d4d`) |
| GDELT 刷新 | M-59 起由 `Refresh World Order Stress` daily workflow 维护 |
| Pages auto-deploy | M-60 起集中由 `deploy-static-site-to-pages.yml` 的 `workflow_run.workflows` 列表维护，并由 `check:pages-trigger-coverage` 守护 |
| SIPRI 状态 | M-61 起 `config/world-order-sipri-normalized.json` 使用 SIPRI 2024 真实数据，world-order build 后为 `ok` |
| QQQ weekly refresh | M-62 起 M-24 history writer 由 integral replace 改为 `isoWeek` keyed merge；weekly sanitized batches 可增量延长历史 |
| ACLED 状态 | M-63a (weekly) + M-63b (monthly) 双 sanitizer + 联合 importer 落地；weekly/monthly 都 `isRealData=true` → `ok`；一边到位 → `partial`；两边都缺 → `manual_required`；evidence-only 进入 `peaceDividendRetreat`,不动权重；M-63c 起 weekly Tuesday / monthly 9th cron reminder workflows active |
| ISM PMI 状态 | M-67 起由 `scripts/run-daily-pipeline.mjs::fetchIsmManufacturingPmiReport` 低频解析 ismworld.org 公开报告页；audit-only/display-only；失败降级为 `fallback` / `source_unavailable` / `parse_error` |
| Employment 状态 | M-68 起 `macroDrivers.employment` 接入 FRED ICSA/CCSA/JTSJOL；audit-only/display-only；仅用于 Macro Drivers 前端卡片；不进 scoring/decision/execution/position、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation |
| Consumer Retail 状态 | M-69 起 `macroDrivers.consumerRetail` 接入 FRED CARTS/CARTSR (Chicago Fed weekly retail nowcast)；audit-only/display-only；仅用于 Macro Drivers 前端卡片；不进 scoring/decision/execution/position、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation；不接 CARTSP |
| CRE 状态 | M-70 起 `macroDrivers.commercialRealEstate` 接入 FRED DRCRELEXFACBS/CORCREXFACBS/SUBLPDRCSN/SUBLPDRCSC/SUBLPDRCSM 季频 CRE 信用压力 series；audit-only/display-only；独立于 `macroDrivers.credit`；不进 scoring/decision/execution/position、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation |
| Brent public proxy review | M-71 起完成 source-review only：EIA Europe Brent Spot Price FOB、ICE Brent futures curve、Baltic Exchange freight benchmarks、Freightos Baltic Index 与 future licensed S&P/Platts Dated Brent 已登记为候选；`sourceApproved=false` / `liveFetchApproved=false` / `productionDataWriteApproved=false`；Platts Dated Brent / 正式 Dated Brent 仍未接入 |
| Brent physical proof-of-source | M-74 起完成 proof-of-source design only：`sp_global_platts_dated_brent` licensed-only、`ice_brent_futures_curve` term-structure proof、`baltic_exchange_freight_benchmarks` licensed freight proof、`freightos_baltic_index` container freight proxy proof；仍不 live fetch、不写 production data、不改 frontend/Worker/Brent promotion/scoring/decision |
| ADR-0013 | 2026-05-19 落地 (PR #231)；ADR-0001 zero-deps 精化为 runtime zero-dep,本地开发工具可在 ADR-0013 约束下使用 devDependencies |
| First devDependency | M-63a 起 `xlsx@0.18.5` (SheetJS) 仅由 `scripts/world-order/sanitize-acled-weekly.mjs` 导入,runtime/check/workflow/frontend 不得引用 |
| 下次审计建议 | 2026-05-25 或下一次 milestone 合并时 |

---

## Section 2 · Open Backlog Items

### P0 Items (Critical — 必须做)

(All P0 items as of M-57 are resolved.)

### P1 Items (Recommended)

#### P1-4: ACLED 数据源配置 (closed — M-63 series)
- **描述**: `sources.acled.status` 已从 `not_configured` 升级为 `manual_required` / `partial` / `ok` 三态 (取决于 weekly/monthly sanitized JSON 是否可用)
- **数据源**: ACLED Open-license aggregated xlsx downloads (manual download;no scraping/crawling per EULA §3.3)
- **类型**: 类型 2
- **估计 PR**: M-63 分 3 个小 PR 推进
- **M-63a — ACLED weekly regional sanitizer + importer**: ✅ `done` (PR #232, merged 2026-05-19);weekly 6 regional files → `config/world-order-acled-regional-weekly.json`;API path removed;`xlsx@0.18.5` 进入 devDependencies
- **M-63b — ACLED monthly global aggregation**: ✅ `done` (this PR);monthly 6 global files → `config/world-order-acled-global-monthly.json`;`fetch-acled.mjs` 联合 weekly+monthly,引入 `partial` status;evidence-only,无 scoring 权重改动;`check:all` 68 → 69
- **M-63c — ACLED weekly + monthly reminder workflows**: ✅ `done` (this PR);PR γ/3 of M-63 series;GitHub reminder workflows only;date-stamped issue idempotency;no checkout/install/sanitize/network to acleddata.com

### P2 Items (Optional)

#### P2-7: 就业广度接入 (closed — M-68)
- **字段**: ICSA (Initial Claims), CCSA (Continuing Claims), JTSJOL (JOLTS)
- **状态**: ✅ `done` (this PR);新增 `macroDrivers.employment` 子树、`driver-employment` 前端卡片与 `check:macro-drivers-employment`
- **边界**: audit-only/display-only;不进 scoring/decision/execution/position、`displayInputsBaseline`、`effectiveDisplayInputs`、cross-validation 或 worker/realtime

#### P2-8: 高频消费证据 (closed — M-69; reframed to Chicago Fed CARTS)
- **历史 spec**: 原写 Redbook + BoA Card,实施时发现公开 API 不可达 (Redbook 商业订阅;BoA Card PDF only),改走 Path ε (Chicago Fed CARTS via FRED)
- **实际接入**: `macroDrivers.consumerRetail` 接 FRED `CARTS` + `CARTSR`;audit-only/display-only;不接 CARTSP
- **Redbook + BoA Card**: 降级为 P3-14 source-review candidates,不在 runtime 自动 fetch
- **状态**: ✅ `done` (this PR);新增 `macroDrivers.consumerRetail` 子树、`driver-consumer-retail` 前端卡片、`check:macro-drivers-consumer-retail`

#### P2-9: CRE / CDX / 私募信贷 (closed — M-70; reframed to CRE-only Path α)
- **历史 spec**: 原写 "CDX HY/IG, CRE delinquency, private credit fundraising",实施时发现:
  - CDX HY/IG = ICE/Markit 商业数据,无公开 API
  - 私募信贷 fundraising = Cliffwater / PitchBook / Preqin 商业订阅 / ToS 未明
  - CRE delinquency 是 FRED 公开,可直接 audit-only 接入
- **实际接入**: `macroDrivers.commercialRealEstate` 接 5 个 FRED 季频公开 CRE 信用压力 series
- **CDX + 私募信贷**: 降级为 **P3-15** source-review candidates,不在 runtime 自动 fetch
- **状态**: ✅ `done` (this PR);新增 `macroDrivers.commercialRealEstate` 子树、`driver-cre` 前端卡片、`check:macro-drivers-commercial-real-estate`

#### P2-10: Macro driver 卡片日期渲染 bug (closed — M-72)
- **描述**: M-68 / M-70 落地后线上验证发现两条 driver 卡片的日期字段渲染为 `undefined`/`NaN`:
  1. `driver-employment` 卡片证据行 `JOLTS:undefined NaN 6.87M` — 应为 `JOLTS 2026-03 6.87M`（或类似）;问题在 `joltsUpdatedAt` 的格式化路径 (`scripts/modules/renderMacroOverview.js` 第 600+ 行附近)
  2. `driver-cre` 卡片证据行 / footer 更新文案 `FRED 季频 Commercial Real Estate:QNaN NaN` — 应为 `FRED 季频 Commercial Real Estate: Q2 2026`（或类似）;问题在季频 asOfDate `2026-04-01` 格式化为 "QN YYYY" 的逻辑
- **影响**: 仅显示层 (audit-only/display-only),不影响 scoring / decision / execution / position / cross-validation;数值本身正确(JOLTS 6.87M / CRE 季频值都对),只是时间戳/期数字段拼接错误
- **数据源**: 不涉及外部数据,纯前端 format helper bug
- **类型**: frontend display fix
- **状态**: ✅ `done` (M-72);修 2 处 format helper + 1 个 frontend visual checker regex 守护避免回归
- **诊断日期**: 2026-05-21 (browse 线上 `https://ctmaomao.github.io/gfrr-auto-update-site/` 实测)

### P3 Items (Won't Fix — 设计 placeholder)

#### P3-10: Fed dot plot / OIS forward rates / FOMC 文本分析
- **不修原因**: 项目明确边界, 不接入官方预测路径

#### P3-11: Brent 期限结构 / Platts Dated Brent / Shipping freight (source-review + proof-of-source design)
- **正式源不修原因**: Platts Dated Brent / 正式 Dated Brent 与 Baltic / ICE / S&P commodity market data 仍需要商业订阅、授权与再展示条款评审；当前不能直接接入生产链路
- **公开代理轨道**: ✅ M-71 source-review only 已完成，候选为 EIA Europe Brent Spot Price FOB、ICE Brent futures curve、Baltic Exchange freight benchmarks、Freightos Baltic Index，以及 future licensed S&P/Platts Dated Brent
- **proof-of-source 轨道**: ✅ M-74 design only 已完成，锁定 Platts licensed-only、ICE Brent futures term-structure、Baltic licensed freight benchmark、Freightos FBX container freight proxy 的 artifact 字段、license 检查、sanitizer 失败条件与 no-go wording
- **当前边界**: `sourceApproved=false` / `liveFetchApproved=false` / `productionDataWriteApproved=false`；不改 `values.brent`、Brent promotion、scoring、decision、execution、position、Worker、workflow、frontend 或 `data/radar-data.json`
- **下一步**: artifact-only manual capture scaffold；no network by default；只写 ignored `manual-artifacts/brent-physical-proof-of-source/<timestamp>/`

#### P3-12: signal-noise bucket 硬编码
- **不修原因**: 设计为框架提醒

#### P3-13: ReliefWeb 冲突人道主义报告接入
- **不修原因**: API 被 bot 封锁（HTTP 406，"Blocked due to bot activity"）；解封须人工联系 hdx@un.org 申请白名单，性价比低；GDELT 已覆盖同类冲突信号
- **诊断日期**: 2026-05-20，本地 + CI 环境均复现，4 条查询全部 406
- **解封路径**: 若未来有 UN HDX 合作意愿，联系 hdx@un.org 后另开版本评估；在此之前不再跟进
- **前端状态**: `render.js` 限制提示已更新为"API 被 bot 封锁（HTTP 406），已列为 P3"

#### P3-14: Redbook + BoA Card 高频消费证据 (source-review candidates)
- **不修原因**:
  - Redbook 为 proprietary/subscription 数据源;官方发行通过 email/fax/conference call;公开页面与第三方聚合 (Trading Economics 等) 虽可见最新值,但 ToS/版权未解锁,不构成稳定可签合规 API
  - BoA Consumer Checkpoint 是月度公开 HTML/PDF 研究材料,PDF 含具体卡均消费数字,但属 BoA proprietary internal data,license/再分发未明,且 PDF layout 解析对版面变动敏感
  - 月度公开零售替代(RSAFS / MARTSSM / PCE)频率与"高频"语义不符
  - 商业 SDK 与 ADR-0001 0-prod-deps 边界硬冲突
- **诊断日期**: 2026-05-20 (M-69 source-review)
- **解封路径**: 若未来 Redbook 提供官方 API 或 BoA 提供机器可读授权 endpoint → 另开 source-review PR 评估接入
- **前端状态**: 不展示;`macroDrivers.consumerRetail` (CARTS) 已通过 M-69 满足"高频零售/消费证据"的可达层需求,不冒充 Redbook/BoA

#### P3-15: CDX HY/IG + 私募信贷 fundraising (source-review candidates)
- **不修原因**:
  - **CDX HY/IG**: ICE/Markit 商业数据,无公开 API;Bloomberg/FactSet/Refinitiv 全订阅;`macroDrivers.credit` 已通过 HY/IG cash-bond OAS (BAMLH0A0HYM2 / BAMLC0A0CM) 覆盖 cash-bond credit spreads,CDX 仅多 CDS-cash basis 边际信号,对 audit-only 价值低
  - **私募信贷 fundraising**: Cliffwater Direct Lending Index 公开页面 ToS/license 未明;PitchBook / Preqin 全商业订阅;Fed Z.1 Q&A (2026-02-26) 明确说当前 Z.1 **不发布** domestic/foreign private credit loans to nonfinancial business 的 transactions/levels 估计 — 公开 aggregate 路径也不可达
  - 商业 SDK 与 ADR-0001 0-prod-deps 边界硬冲突
- **诊断日期**: 2026-05-20 (M-70 source-review,Codex live probe verified)
- **解封路径**: CDX 需 ICE/Markit 提供官方 API + 评估订阅成本;私募信贷需 Cliffwater 或 Fed Z.1 公开 aggregate 出台 — 任一条件满足后另开 source-review PR
- **前端状态**: 不展示;`macroDrivers.commercialRealEstate` (CRE) 已通过 M-70 满足 P2-9 范围内可达层,不冒充 CDX/私募信贷

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
| M-63c | ACLED weekly + monthly reminder workflows (B+ date-stamped idempotency) | (this PR) | 2026-05-20 | ✅ Two cron workflows (Tuesday 00:00 UTC weekly / 9th 00:00 UTC monthly); date-stamped titles allow new issues per week/month; reminder-only, no checkout/install/sanitize/network to acleddata.com; check:all stays 69 |
| M-64 | IA contract reconciliation + top-level section restructure | (this PR) | 2026-05-20 | ✅ DESIGN.md §4.1 / index.html / IA check scripts aligned; World Order Stress promoted to top-level regime overlay; External AI moved after method evidence; cache bumped to 28.0M-64V |
| M-65 | method-evidence content cleanup | (this PR) | 2026-05-20 | ✅ "站内总览与核心风险明细" migrated to `#detail-data` SYSTEM OVERVIEW; "恢复状态与系统说明" merged into DATA HEALTH; all runtime DOM ids preserved; cache bumped to 28.0M-65V |
| M-66 | legacy anchor + subsection kicker consistency polish | (this PR) | 2026-05-20 | ✅ Detail Data header anchor renamed to `detail-data-header`; top-level method/execution subsections now carry subsection-meta kickers; `check:editorial-redesign-contract` enforces kicker consistency; cache bumped to 28.0M-66V |
| ADR-0014 | DESIGN.md §4.1 为 IA ground truth；appendix content boundaries codified；subsection-meta mandate enforced by check scripts | `6e99cee` | 2026-05-20 | ✅ IA authority hierarchy (ADR > DESIGN.md §4.1 > check scripts > HTML) established；top-down change direction mandated；M-64/65/66 三方漂移根因归档；`docs/ADR/0014-design-md-is-ia-ground-truth.md` |
| M-67 | ISM PMI source repair | (this PR) | 2026-05-20 | ✅ Broken FRED PMI path replaced with low-frequency parser for ISM public Manufacturing PMI report page; `sourceStatus.pmi` four-state contract added; zero new deps; PMI remains audit-only/display-only; `check:all` stays 69 |
| M-68 | macroDrivers.employment (ICSA/CCSA/JTSJOL) audit-only ingestion (P2-7) | (this PR) | 2026-05-20 | ✅ New employment breadth subtree with per-series fallback status; FRED ICSA/CCSA weekly SA + JTSJOL monthly (~6w lag); frontend `driver-employment` card; no scoring/decision/execution/position, worker/realtime, displayInputsBaseline/effectiveDisplayInputs, or cross-validation impact; `check:all` 69 → 70; cache bumped to 28.0M-68V |
| M-69 | macroDrivers.consumerRetail (Chicago Fed CARTS/CARTSR) audit-only ingestion (P2-8 Path ε) | (this PR) | 2026-05-20 | ✅ New consumerRetail subtree with per-series fallback status; FRED CARTS nominal + CARTSR real weekly retail nowcast; frontend `driver-consumer-retail` card; no scoring/decision/execution/position, worker/realtime, displayInputsBaseline/effectiveDisplayInputs, or cross-validation impact; Redbook/BoA downgraded to P3-14 source-review candidates; `check:all` 70 → 71; cache bumped to 28.0M-69V |
| M-70 | macroDrivers.commercialRealEstate (FRED CRE 5 series) audit-only ingestion (P2-9 CRE-only) | (this PR) | 2026-05-20 | ✅ New commercialRealEstate subtree with per-series fallback status; FRED CRE delinquency + charge-off + three SLOOS CRE tightening series; frontend `driver-cre` card; no scoring/decision/execution/position, worker/realtime, displayInputsBaseline/effectiveDisplayInputs, macroDrivers.credit, or cross-validation impact; CDX/private credit downgraded to P3-15 source-review candidates; `check:all` 71 → 72; cache bumped to 28.0M-70V |
| M-71 | Brent public proxy source review | (this PR) | 2026-05-21 | ✅ Review-only source intake for EIA Brent spot proxy, ICE Brent futures curve, Baltic Exchange freight benchmarks, Freightos Baltic Index, and future licensed S&P/Platts Dated Brent; no live fetch, no source approval, no production write, no frontend/workflow/runtime/data change; `check:all` 72 → 73 |
| M-72 | Macro driver date display fix (P2-10) | `e9727dd` | 2026-05-21 | ✅ Fixes JOLTS month and CRE quarter rendering so ISO vintage strings no longer surface malformed period labels; cache bumped to 28.0M-72V |
| M-74 | Brent physical proof-of-source design | (this PR) | 2026-05-21 | ✅ Defines proof contracts for licensed Platts Dated Brent, ICE Brent futures term structure, Baltic Exchange freight benchmarks, and Freightos FBX; adds `check:brent-physical-proof-of-source-design`; `check:all` 73 → 74; no live fetch/production write/frontend/workflow/Worker/Brent promotion/scoring/decision change |

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
| 2026-05-20 | M-63c ACLED weekly + monthly reminder workflows | Claude Code (audit) + Codex (impl) | P1-4 closed | Reminder-only GitHub issue workflows added; B+ date-stamped idempotency; no checkout/install/sanitize/network to acleddata.com; `check:all` stays 69 |
| 2026-05-20 | M-68 employment breadth | Claude Code (audit) + Codex (impl) | P2-7 closed | ICSA/CCSA/JTSJOL 接入 `macroDrivers.employment`; audit-only/display-only; frontend Macro Drivers 卡片; `check:all` 69 → 70 |
| 2026-05-20 | M-69 consumerRetail CARTS Path ε | Claude Code (source audit) + Codex (impl) | P2-8 closed; P3-14 added | FRED CARTS/CARTSR 接入 `macroDrivers.consumerRetail`; Redbook/BoA 降级为 source-review candidates; audit-only/display-only; frontend Macro Drivers 卡片; `check:all` 70 → 71 |
| 2026-05-20 | M-70 commercialRealEstate CRE Path α | Claude Code (source audit) + Codex (impl) | P2-9 closed; P3-15 added | FRED DRCRELEXFACBS/CORCREXFACBS/SUBLPDRCSN/SUBLPDRCSC/SUBLPDRCSM 接入 `macroDrivers.commercialRealEstate`; CDX/私募信贷降级为 source-review candidates; audit-only/display-only; frontend Macro Drivers 卡片; `check:all` 71 → 72 |
| 2026-05-21 | M-71 Brent public proxy source review | Codex | P3-11 reframed for public-proxy path | EIA / ICE / Baltic Exchange / Freightos / S&P-Platts source families reviewed as candidates only; Platts Dated Brent remains unconnected; no live fetch / production write / runtime / frontend / workflow change; `check:all` 72 → 73 |
| 2026-05-21 | M-72 macro-driver date display fix | Codex | P2-10 closed | JOLTS / CRE vintage formatter no longer surfaces malformed period labels; cache 28.0M-72V |
| 2026-05-21 | M-74 Brent physical proof-of-source design | Codex | P3-11 proof-of-source rung | Platts licensed-only, ICE term-structure, Baltic freight, and Freightos FBX proof contracts defined; no live fetch / production write / runtime / frontend / workflow change; `check:all` 73 → 74 |

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

### Session Handoff (2026-05-21 — M-74 Brent physical proof-of-source design ready)

- **上次会话结束于**: HEAD 待 PR。本 session (2026-05-21) 增量：(1) **M-74 Brent physical proof-of-source design**：新增 `docs/BRENT_PHYSICAL_PROOF_OF_SOURCE_DESIGN.md`、machine-readable fixture、`check:brent-physical-proof-of-source-design`；(2) 三条轨道均已开始但仍未生产接入：`sp_global_platts_dated_brent` = licensed-only formal Dated Brent proof path，`ice_brent_futures_curve` = Brent term-structure proof target，`baltic_exchange_freight_benchmarks` + `freightos_baltic_index` = shipping/freight proof targets；(3) `check:all` = **74 项**；(4) 本轮未改 frontend，所以 cache 仍为 `28.0M-72V`。未改 data/realtime/workflow/Worker/frontend/Brent promotion/scoring/decision/execution/position。
- **当前进行中**: M-74 proof-of-source design PR 待 review / merge。
- **下一步建议**: (a) 若要继续推进三项，下一 rung 做 `brent physical proof-of-source artifact-only manual capture scaffold`，默认 no network，只写 ignored `manual-artifacts/brent-physical-proof-of-source/<timestamp>/`；(b) Platts 正式 Dated Brent 必须先拿 license / redistribution / delivery channel 证据，不能用公开 proxy 冒充；(c) ICE term structure 与 Baltic/Freightos freight 先做 sanitizer + manual artifact 审查，再谈 runtime/display；(d) M-63c 跨周/monthly cron 仍按原时间点观察。
- **阻塞或等待**: 无技术阻塞。真正生产接入仍被授权与 source compliance 阻塞：Platts / Baltic 需要 license；ICE / Freightos 需要 allowed-use 与字段稳定性审查；M-74 本身不拿生产数据、不写生产数据。
