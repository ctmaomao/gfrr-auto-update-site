# Project Backlog · GFRR Auto-Update Site

> Persistent backlog of open data/feature items, completed milestones, and audit history.
> This is project-self-memory across sessions. When starting a new session, fetch `docs/PROJECT_BACKLOG.md` first.

---

## Section 1 · 维护状态

| 项 | 值 |
|---|---|
| 当前生产状态 | v28.0M-86 (frontend public proxy coverage semantics) |
| Cache version | `28.0M-86V` |
| check:all 项数 | 23 |
| 最后审计日期 | **2026-05-22** (M-86 frontend proxy coverage semantics; M-85 public source tranche 11; M-84 public source tranche 10; M-83 public source tranche 9; M-82 public source tranche 8; M-81 public source tranche 7; M-80 public source tranche 6; M-79 public source tranche 5; M-78 public source tranche 4; M-77 public source tranche 3; M-76 frontend macro field surfacing; M-75 check suite compaction; M-74 expanded macro data auto ingestion; M-73 BGCR/TGCR NY Fed secured rates runtime fix + employment quality public FRED expansion; M-71 Brent public proxy source review; M-70 CRE FRED commercialRealEstate ingestion; M-69 Chicago Fed CARTS consumerRetail ingestion; M-68 employment breadth; M-67 ISM PMI source repair; M-63c ACLED reminder workflows; M-66 legacy anchor + subsection kicker polish; ADR-0014 IA contract authority hierarchy; M-63b ACLED monthly ingestion) |
| 最后 daily refresh | 2026-05-22 (local M-85 rebuild from `origin/realtime-data` baseline; local `realtime/market.json` refreshed) |
| GDELT 刷新 | M-59 起由 `Refresh World Order Stress` daily workflow 维护 |
| Pages auto-deploy | M-60 起集中由 `deploy-static-site-to-pages.yml` 的 `workflow_run.workflows` 列表维护，并由 `check:pages-trigger-coverage` 守护 |
| SIPRI 状态 | M-61 起 `config/world-order-sipri-normalized.json` 使用 SIPRI 2024 真实数据，world-order build 后为 `ok` |
| QQQ weekly refresh | M-62 起 M-24 history writer 由 integral replace 改为 `isoWeek` keyed merge；weekly sanitized batches 可增量延长历史 |
| ACLED 状态 | M-63a (weekly) + M-63b (monthly) 双 sanitizer + 联合 importer 落地；weekly/monthly 都 `isRealData=true` → `ok`；一边到位 → `partial`；两边都缺 → `manual_required`；evidence-only 进入 `peaceDividendRetreat`,不动权重；M-63c 起 weekly Tuesday / monthly 9th cron reminder workflows active |
| ISM PMI 状态 | M-67 起由 `scripts/run-daily-pipeline.mjs::fetchIsmManufacturingPmiReport` 低频解析 ismworld.org 公开报告页；audit-only/display-only；失败降级为 `fallback` / `source_unavailable` / `parse_error` |
| Employment 状态 | M-73 起 `macroDrivers.employment` 在 ICSA/CCSA/JTSJOL 基础上接入 FRED 平均时薪 CES0500000003、U6RATE 与公开行业 payroll basket 扩散代理；audit-only/display-only；仅用于 Macro Drivers 前端卡片；不进 scoring/decision/execution/position、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation |
| Consumer Retail 状态 | M-69 起 `macroDrivers.consumerRetail` 接入 FRED CARTS/CARTSR (Chicago Fed weekly retail nowcast)；M-74 起加入 FRED MRTS 13 个细分零售行业 basket 和扩散指标；M-77 起加入 BoA Consumer Checkpoint 公开 HTML card-spending YoY 摘要；audit-only/display-only；仅用于 Macro Drivers 前端卡片；不进 scoring/decision/execution/position、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation；不接 CARTSP、不冒充 Redbook 或 BoA raw card feed |
| CRE 状态 | M-70 起 `macroDrivers.commercialRealEstate` 接入 FRED DRCRELEXFACBS/CORCREXFACBS/SUBLPDRCSN/SUBLPDRCSC/SUBLPDRCSM 季频 CRE 信用压力 series；M-74 起加入 Yahoo VNQ/REM public market proxy；M-80 起加入 Yahoo CMBS commercial MBS ETF public proxy；M-84 起加入 FRED CREACBW027SBOG weekly public aggregate bank CRE loan balance / exposure stock proxy；audit-only/display-only；独立于 `macroDrivers.credit`；不进 scoring/decision/execution/position、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation；不冒充非公开 CRE loan tape |
| Expanded macro 状态 | M-74 起 `macroDrivers.shippingFreight` 接入 StockQ BDTI/BCTI/BDI；`macroDrivers.policyExpectations` 接入 FRED DFEDTARL/DFEDTARU/DFF、Yahoo ZQ=F、Federal Reserve SEP/FOMC statement；M-77 起加入 FOMC minutes keyword NLP；M-78 起加入 Yahoo ZQ monthly Fed funds futures proxy curve；M-79 起加入 Yahoo SR3 monthly SOFR futures proxy curve；M-80 起加入 CheckMySwap USD OIS public curve；`macroDrivers.consumerRetail` M-79 起加入 Trading Economics Redbook public HTML 摘要；`macroDrivers.privateCreditProxy` 接入 Yahoo BIZD + FRED HY OAS，M-78 加入 FRED IG OAS，M-80 加入 Yahoo PBDC/SRLN public proxies，M-81 加入 ICE CDX public settlement prices，M-83 加入 Yahoo CCLFX public interval-fund NAV proxy；`macroDrivers.commercialRealEstate` M-84 加入 FRED CREACBW027SBOG aggregate CRE loan balance proxy；private marks/non-public CRE 保留 `manual_required`。M-76/M-81/M-83/M-84/M-85 起 Macro Drivers / Risk Engines / Brent detail 展开显示这些后端字段；M-86 起 Macro Overview 将 live public proxy coverage 与正式/非公开源边界分开显示；仍为 display-only |
| Brent public proxy review | M-71 起完成 source-review only：EIA Europe Brent Spot Price FOB、ICE Brent futures curve、Baltic Exchange freight benchmarks、Freightos Baltic Index 与 future licensed S&P/Platts Dated Brent 已登记为候选；M-77 起 `brentPricingLayer.futuresCurve` 只读取 ICE contract structure (`live_structure_only`)；M-78 起 `brentPricingLayer.futuresPriceCurve` 读取 Yahoo BZ monthly priced proxy (`live_proxy_priced`)；M-82 起 `brentPricingLayer.iceFuturesPriceCurve` 读取 ICE public delayed last-price curve (`live_delayed_priced`)；M-85 起 `brentPricingLayer.eiaBrentSpotProxy` 读取 EIA Europe Brent Spot Price FOB public HTML (`live`/`fallback`/`missing`)；Platts Dated Brent / 正式 Dated Brent 与官方 ICE settlement curve 仍未接入 |
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

#### P2-8: 高频消费证据 (closed — M-69/M-77; reframed to public sources)
- **历史 spec**: 原写 Redbook + BoA Card,实施时发现公开 API 不可达 (Redbook 商业订阅;BoA Card PDF only),改走 Path ε (Chicago Fed CARTS via FRED)
- **实际接入**: `macroDrivers.consumerRetail` 接 FRED `CARTS` + `CARTSR`;M-74 接 MRTS 13 个细分零售行业 basket;M-77 接 BoA Consumer Checkpoint 公开 HTML 摘要; audit-only/display-only;不接 CARTSP
- **Redbook + BoA raw card feed**: Redbook 仍为 P3-14 source-review candidate;BoA 原始卡明细/非公开 feed 不在 runtime 自动 fetch
- **状态**: ✅ `done` (this PR);新增 `macroDrivers.consumerRetail` 子树、`driver-consumer-retail` 前端卡片、`check:macro-drivers-consumer-retail`

#### P2-9: CRE / CDX / 私募信贷 (closed — M-70; reframed to CRE-only Path α)
- **历史 spec**: 原写 "CDX HY/IG, CRE delinquency, private credit fundraising",实施时发现:
  - CDX HY/IG 当时未接 runtime；M-81 后改从 ICE Clear Credit public settlement endpoint 读取最新 EOD index price
  - 私募信贷 fundraising = Cliffwater / PitchBook / Preqin 商业订阅 / ToS 未明
  - CRE delinquency 是 FRED 公开,可直接 audit-only 接入
- **实际接入**: `macroDrivers.commercialRealEstate` 接 5 个 FRED 季频公开 CRE 信用压力 series
- **CDX + 私募信贷**: CDX public settlement 已在 M-81 接入 `macroDrivers.privateCreditProxy`；M-83 加入 CCLFX public interval-fund NAV proxy；真实私募信贷 marks / fundraising 仍为 **P3-15** source-review/manual candidates
- **状态**: ✅ `done` (this PR);新增 `macroDrivers.commercialRealEstate` 子树、`driver-cre` 前端卡片、`check:macro-drivers-commercial-real-estate`

#### P2-10: Macro driver 卡片日期渲染 bug (open — 2026-05-21 线上验证发现)
- **描述**: M-68 / M-70 落地后线上验证发现两条 driver 卡片的日期字段渲染为 `undefined`/`NaN`:
  1. `driver-employment` 卡片证据行 `JOLTS:undefined NaN 6.87M` — 应为 `JOLTS 2026-03 6.87M`（或类似）;问题在 `joltsUpdatedAt` 的格式化路径 (`scripts/modules/renderMacroOverview.js` 第 600+ 行附近)
  2. `driver-cre` 卡片证据行 / footer 更新文案 `FRED 季频 Commercial Real Estate:QNaN NaN` — 应为 `FRED 季频 Commercial Real Estate: Q2 2026`（或类似）;问题在季频 asOfDate `2026-04-01` 格式化为 "QN YYYY" 的逻辑
- **影响**: 仅显示层 (audit-only/display-only),不影响 scoring / decision / execution / position / cross-validation;数值本身正确(JOLTS 6.87M / CRE 季频值都对),只是时间戳/期数字段拼接错误
- **数据源**: 不涉及外部数据,纯前端 format helper bug
- **类型**: frontend display fix
- **估计 PR**: 1 个小 PR (修 2 处 format helper + 1 个 frontend visual checker 补 regex 守护避免回归)
- **诊断日期**: 2026-05-21 (browse 线上 `https://ctmaomao.github.io/gfrr-auto-update-site/` 实测)

### P3 Items (Deferred / Source-Review / Partially Connected)

#### P3-10: Fed dot plot / OIS forward rates / FOMC 文本分析 (partially connected — M-74/M-77/M-78/M-79/M-80)
- **当前状态**: M-74 已把可公开自动化部分接入 `macroDrivers.policyExpectations`：FRED `DFEDTARL` / `DFEDTARU` / `DFF`、Yahoo `ZQ=F` front Fed funds futures proxy、Federal Reserve SEP accessible table 的 fed funds median，以及最新 FOMC statement 的 keyword tone count；M-77 增加最新 FOMC minutes keyword NLP tone/topic count；M-78 增加 Yahoo ZQ monthly Fed funds futures proxy curve；M-79 增加 Yahoo SR3 monthly Three-Month SOFR futures proxy curve；M-80 增加 CheckMySwap USD OIS public curve；前端 `driver-policy` / rates-liquidity engine 已展示这些 audit-only/display-only 字段。
- **仍未接入**: proprietary dealer OIS forward curve 仍未接入；不得把 CheckMySwap public curve 写成 licensed dealer forward curve，也不得让 policy text tone 进入 scoring 或 decision。
- **解封路径**: 若未来有 dealer screen /授权 OIS forward source 或用户提供 manual input file，另开 reviewed PR 定义 parser、source attribution、quality gate 与展示文案。

#### P3-11: Brent 期限结构 / Platts Dated Brent / Shipping freight (partially connected — M-74/M-77/M-78/M-82/M-85)
- **正式源不修原因**: Platts Dated Brent / 正式 Dated Brent 与 Baltic / ICE / S&P commodity market data 仍需要商业订阅、授权与再展示条款评审；当前不能直接接入生产链路
- **公开代理轨道**: ✅ M-71 source-review only 已完成，候选为 EIA Europe Brent Spot Price FOB、ICE Brent futures curve、Baltic Exchange freight benchmarks、Freightos Baltic Index，以及 future licensed S&P/Platts Dated Brent
- **M-74 已接入**: shipping / freight / 油轮运费压力已通过 StockQ `BDTI` / `BCTI` / `BDI` public pages 写入 `macroDrivers.shippingFreight` 并显示到 Macro Drivers；这是航运/油轮压力 proxy，不是 Platts Dated Brent、不是 Brent 期限结构。
- **M-77 已接入**: `brentPricingLayer.futuresCurve` 读取 ICE Brent futures public page 的合约月份、lastTrade 与 finalSettlement，状态为 `live_structure_only` / `fallback_structure_only` / `missing`；这是 structure-only，不是带价格的官方期限结构。
- **M-78 已接入**: `brentPricingLayer.futuresPriceCurve` 读取 Yahoo `BZ` monthly futures priced proxy，状态为 `live_proxy_priced` / `fallback_proxy_priced` / `missing`；这是公开 priced proxy，不是 ICE official settlement curve、Platts Dated Brent 或正式 Dated Brent。
- **M-82 已接入**: `brentPricingLayer.iceFuturesPriceCurve` 读取 ICE product-guide public contract-data delayed last price curve，状态为 `live_delayed_priced` / `fallback_delayed_priced` / `missing`；这是 ICE public delayed last-price futures curve，不是 official ICE settlement curve、Platts Dated Brent 或正式 Dated Brent。
- **M-85 已接入**: `brentPricingLayer.eiaBrentSpotProxy` 读取 EIA Europe Brent Spot Price FOB public HTML，状态为 `live` / `fallback` / `missing`；这是公开 spot proxy，不是 Platts Dated Brent、正式 Dated Brent 或实物现货成交证据。
- **当前边界**: 不改 `values.brent`、Brent promotion、scoring、decision、execution、position、Worker 或 workflow；Platts Dated Brent / 正式 Dated Brent 与官方 ICE settlement curve 仍未接入。

#### P3-12: signal-noise bucket 硬编码
- **不修原因**: 设计为框架提醒

#### P3-13: ReliefWeb 冲突人道主义报告接入
- **不修原因**: API 被 bot 封锁（HTTP 406，"Blocked due to bot activity"）；解封须人工联系 hdx@un.org 申请白名单，性价比低；GDELT 已覆盖同类冲突信号
- **诊断日期**: 2026-05-20，本地 + CI 环境均复现，4 条查询全部 406
- **解封路径**: 若未来有 UN HDX 合作意愿，联系 hdx@un.org 后另开版本评估；在此之前不再跟进
- **前端状态**: `render.js` 限制提示已更新为"API 被 bot 封锁（HTTP 406），已列为 P3"

#### P3-14: Redbook + BoA raw card 高频消费证据 (partially connected — BoA public HTML in M-77; Redbook public HTML in M-79)
- **不修原因**:
  - Redbook raw subscription feed 仍为 proprietary/subscription 数据源;官方发行通过 email/fax/conference call;M-79 仅接 Trading Economics Redbook public HTML latest summary,不接完整授权 feed
  - BoA Consumer Checkpoint 是月度公开 HTML/PDF 研究材料;M-77 只解析公开 HTML 摘要中的 card spending per household YoY / ex-gas YoY;PDF layout 与 raw card feed 不在 runtime 抓取
  - 月度公开零售替代(RSAFS / MARTSSM / PCE)频率与"高频"语义不符
  - 商业 SDK 与 ADR-0001 0-prod-deps 边界硬冲突
- **诊断日期**: 2026-05-20 (M-69 source-review)
- **解封路径**: 若未来 Redbook 提供官方 API / raw subscription export 或 BoA 提供机器可读 raw feed endpoint → 另开 source-review PR 评估接入
- **前端状态**: M-77 起展示 `macroDrivers.consumerRetail` 的 CARTS/CARTSR、FRED MRTS 细分零售扩散与 BoA Consumer Checkpoint public HTML 摘要；M-79 起展示 Trading Economics Redbook public HTML same-store sales YoY 摘要；仍不展示/不冒充 Redbook raw subscription feed 或 BoA raw card feed

#### P3-15: CDX HY/IG + 私募信贷 fundraising (partially connected — M-81 CDX public settlement; M-83 CCLFX NAV proxy)
- **不修原因**:
  - **CDX HY/IG**: M-81 已接入 ICE Clear Credit public index instruments endpoint 的最新 CDX NA HY/IG 5Y EOD settlement price；完整 licensed Markit history database、intraday quotes 与 Bloomberg/FactSet/Refinitiv feed 仍不接
  - **私募信贷 fundraising / true marks**: M-83 已接入 CCLFX public interval-fund NAV proxy；Cliffwater Direct Lending Index 完整数据、PitchBook / Preqin 全商业订阅与真实私募贷款 marks 仍不接;Fed Z.1 Q&A (2026-02-26) 明确说当前 Z.1 **不发布** domestic/foreign private credit loans to nonfinancial business 的 transactions/levels 估计 — 公开 aggregate 路径也不可达
  - 商业 SDK 与 ADR-0001 0-prod-deps 边界硬冲突
- **诊断日期**: 2026-05-20 (M-70 source-review,Codex live probe verified)
- **解封路径**: 私募信贷需 Cliffwater / PitchBook / Preqin / Fed Z.1 公开 aggregate 或用户自有 manual file；完整 CDX history 或 intraday quote 需另开 licensed feed parser
- **M-74/M-78/M-80/M-81/M-83 已接入**: `macroDrivers.privateCreditProxy` 已展示 Yahoo `BIZD` / `PBDC` listed BDC ETF、Yahoo `SRLN` senior-loan ETF、Yahoo `CCLFX` public interval-fund NAV proxy、FRED `BAMLH0A0HYM2` HY OAS、FRED `BAMLC0A0CM` IG OAS 与 ICE CDX NA HY/IG public settlement prices。
- **前端状态**: M-81 起展示 ICE CDX HY/IG public settlement price；M-83 起展示 CCLFX NAV proxy；M-84 起展示 FRED public aggregate CRE loan balance proxy；private credit marks 与 non-public CRE loan tape 继续显示/校验为 `manual_required`，不冒充真实非公开源。

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
| M-73 | macro data auto ingestion tranche 1 | (this PR) | 2026-05-21 | ✅ BGCR/TGCR repo spread fetch repaired to NY Fed secured rates API; `macroDrivers.employment` extended with FRED CES0500000003 / U6RATE / public industry payroll basket; frontend employment driver surfaces wage/U-6/diffusion; no scoring/decision/execution/position, worker/realtime, displayInputsBaseline/effectiveDisplayInputs, or cross-validation expansion; `check:all` remains 73; cache bumped to 28.0M-73V |
| M-74 | expanded macro data auto ingestion tranche 2 | (this PR) | 2026-05-22 | ✅ `macroDrivers.shippingFreight` from StockQ BDTI/BCTI/BDI; `macroDrivers.policyExpectations` from FRED target/DFF + Yahoo ZQ=F + Fed SEP/FOMC statement; `macroDrivers.privateCreditProxy` from Yahoo BIZD + FRED HY OAS; FRED MRTS retail segment diffusion; Yahoo VNQ/REM CRE public proxy; OIS/CDX/private marks/non-public CRE remain `manual_required`; no scoring/decision/execution/position, worker/realtime, displayInputsBaseline/effectiveDisplayInputs, or cross-validation expansion; `check:all` 73 → 74; cache bumped to 28.0M-74V |
| M-75 | check:all suite compaction | (this PR) | 2026-05-22 | ✅ Added `scripts/check-suite.mjs` and grouped same-family checks into top-level suites; `check:all` top-level entries 74 → 23 while preserving all atomic check scripts; no runtime/frontend/workflow/data/scoring/decision/execution/position change; no cache bump |
| M-76 | frontend macro field surfacing | (this PR) | 2026-05-22 | ✅ Macro Drivers / Risk Engines / Brent detail now display already-present backend fields for policy expectations, Fed repo liquidity, MRTS retail segments, shipping freight, private-credit status, CRE public/private proxy status, employment source status, credit/NFCI/SLOOS deltas, and ULSD/crack-spread 4w fields; no data/workflow/scoring/decision/execution/position/cross-validation behavior change; cache bumped to 28.0M-76V |
| M-77 | public source tranche 3 | (this PR) | 2026-05-22 | ✅ Fed FOMC minutes keyword NLP, BoA Consumer Checkpoint public HTML summary, and ICE Brent futures contract structure-only; audit-only/display-only; no scoring/decision/execution/position, worker/realtime, displayInputsBaseline/effectiveDisplayInputs, or cross-validation expansion; `check:all` remains 23; cache bumped to 28.0M-77V |
| M-78 | public source tranche 4 | (this PR) | 2026-05-22 | ✅ Yahoo ZQ monthly Fed funds futures proxy curve, FRED IG OAS inside privateCreditProxy, and Yahoo BZ monthly Brent priced futures proxy; audit-only/display-only; OIS/CDX/private marks/Platts/official ICE settlement/non-public CRE remain unconnected/manual; `check:all` remains 23; cache bumped to 28.0M-78V |
| M-79 | public source tranche 5 | (this PR) | 2026-05-22 | ✅ Trading Economics Redbook public HTML same-store sales YoY summary and Yahoo SR3 monthly Three-Month SOFR futures proxy curve; audit-only/display-only; OIS forward, Redbook raw subscription feed, BoA raw card feed, CDX/private marks/Platts/non-public CRE remain unconnected/manual; `check:all` remains 23; cache bumped to 28.0M-79V |
| M-80 | public source tranche 6 | (this PR) | 2026-05-22 | ✅ CheckMySwap USD OIS public curve, Yahoo CMBS ETF public CRE proxy, and Yahoo PBDC/SRLN listed private-credit / senior-loan proxies; audit-only/display-only; at M-80 close proprietary dealer OIS, CDX/private marks/Platts/non-public CRE remained unconnected/manual; `check:all` remains 23; cache bumped to 28.0M-80V |
| M-81 | public source tranche 7 | (this PR) | 2026-05-22 | ✅ ICE Clear Credit public CDX NA HY/IG 5Y EOD settlement prices now feed `macroDrivers.privateCreditProxy`; private marks/Platts/non-public CRE remain unconnected/manual; `check:all` remains 23; cache bumped to 28.0M-81V |
| M-82 | public source tranche 8 | (this PR) | 2026-05-22 | ✅ ICE Brent public delayed last-price futures curve now feeds `brentPricingLayer.iceFuturesPriceCurve`; Platts/official ICE settlement/non-public sources remain unconnected/manual; `check:all` remains 23; cache bumped to 28.0M-82V |
| M-83 | public source tranche 9 | (this PR) | 2026-05-22 | ✅ Yahoo CCLFX public interval-fund NAV proxy now feeds `macroDrivers.privateCreditProxy.intervalFundNavPrice`; true private marks/fundraising remain unconnected/manual; `check:all` remains 23; cache bumped to 28.0M-83V |
| M-84 | public source tranche 10 | (this PR) | 2026-05-22 | ✅ FRED CREACBW027SBOG weekly public aggregate bank CRE loan balance now feeds `macroDrivers.commercialRealEstate.creLoanBalance`; non-public CRE loan tape/private marks remain manual_required; `check:all` remains 23; cache bumped to 28.0M-84V |
| M-85 | public source tranche 11 | (this PR) | 2026-05-22 | ✅ EIA Europe Brent Spot Price FOB public HTML now feeds `brentPricingLayer.eiaBrentSpotProxy`; Platts Dated Brent/formal Dated Brent remains unconnected; `check:all` remains 23; cache bumped to 28.0M-85V |
| M-86 | frontend public proxy coverage semantics | (this PR) | 2026-05-22 | ✅ Macro Overview separates `coverageNotes` from `missingEvidence`; live public proxies now read as coverage while formal/non-public sources remain boundary notes; no data/scoring/decision/execution/position/workflow/cross-validation changes; cache bumped to 28.0M-86V |

---

## Section 4 · Future Considerations

- **市场温度计扩展**: 当前仅 QQQ, 可考虑加入 SPY/IWM/EFA/EEM 多资产温度计 (需要各自 60 周历史)
- **Brent 实物端**: 若未来项目预算允许, 接入 Platts Dated Brent 与 official ICE settlement curve；M-74 已接入 BDTI/BCTI/BDI shipping/freight proxy,M-78 已接入 Yahoo BZ priced proxy,M-82 已接入 ICE public delayed futures last-price curve,M-85 已接入 EIA Europe Brent Spot Price FOB public spot proxy；M-86 起这些公开代理在 Macro Overview 中显示为 coverage 而非缺失
- **NLP for FOMC**: M-74 已接入 statement keyword tone count；M-77 已接入 FOMC minutes keyword NLP；未来可另开 hawkishness quality review
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
| 2026-05-21 | M-73 macro data auto ingestion tranche 1 | Codex | BGCR/TGCR missing fixed; employment quality partially connected | NY Fed secured rates API supplies BGCR/TGCR; FRED CES0500000003/U6RATE/industry payroll basket supplies wage/U-6/diffusion; at M-73 close commercial freight, dot plot/OIS, and CDX/private credit still remained source-review, later partly superseded by M-74 |
| 2026-05-22 | M-74 expanded macro data auto ingestion tranche 2 | Codex | shipping/freight, policy expectations, retail segments, private-credit public proxy, CRE public-market proxy partially connected | StockQ BDTI/BCTI/BDI, FRED target/DFF, Yahoo ZQ=F, Fed SEP/FOMC statement, FRED MRTS segments, Yahoo BIZD/VNQ/REM, and FRED HY OAS now feed audit-only/display-only macro drivers; OIS/CDX/private marks/non-public CRE remain `manual_required`; `check:all` 73 → 74 |
| 2026-05-22 | M-75 check:all suite compaction | Codex | check runner noise reduced without dropping coverage | `scripts/check-suite.mjs` preserves every atomic check while `check:all` top-level entries shrink 74 → 23; grouped suites cover frontend visual history, external AI, Brent, macro drivers, narrative density, market pricing, and ACLED |
| 2026-05-22 | M-77 public source tranche 3 | Codex | first recommended public-source tranche connected | Federal Reserve minutes keyword NLP, BoA Consumer Checkpoint public HTML card spending YoY, and ICE Brent contract structure-only now feed display-only layers; priced Brent term structure/Platts/OIS/CDX/private marks remain unconnected/manual |
| 2026-05-22 | M-78 public source tranche 4 | Codex | second recommended public-source tranche connected | Yahoo ZQ monthly Fed funds futures proxy curve, FRED IG OAS cash-bond proxy, and Yahoo BZ monthly Brent priced futures proxy now feed display-only layers; OIS/CDX/private marks/Platts/official ICE settlement/non-public CRE remain unconnected/manual |
| 2026-05-22 | M-79 public source tranche 5 | Codex | third recommended public-source tranche connected | Trading Economics Redbook public HTML same-store sales YoY and Yahoo SR3 monthly SOFR futures proxy curve now feed display-only layers; OIS forward, Redbook raw feed, BoA raw card feed, CDX/private marks/Platts/non-public CRE remain unconnected/manual |
| 2026-05-22 | M-80 public source tranche 6 | Codex | fourth recommended public-source tranche connected | CheckMySwap USD OIS public curve, Yahoo CMBS ETF proxy, and Yahoo PBDC/SRLN public credit proxies now feed display-only layers; proprietary dealer OIS, CDX/private marks/Platts/non-public CRE remain unconnected/manual |
| 2026-05-22 | M-81 public source tranche 7 | Codex | fifth recommended public-source tranche connected | ICE Clear Credit public CDX NA HY/IG 5Y EOD settlement prices now feed display-only privateCreditProxy; private marks/Platts/non-public CRE remain unconnected/manual |
| 2026-05-22 | M-82 public source tranche 8 | Codex | sixth recommended public-source tranche connected | ICE product-guide public contract-data now feeds display-only `brentPricingLayer.iceFuturesPriceCurve`; Platts/official ICE settlement/non-public sources remain unconnected/manual |
| 2026-05-22 | M-83 public source tranche 9 | Codex | seventh recommended public-source tranche connected | Yahoo CCLFX public interval-fund NAV proxy now feeds display-only `macroDrivers.privateCreditProxy`; true private marks/fundraising remain unconnected/manual |
| 2026-05-22 | M-84 public source tranche 10 | Codex | eighth recommended public-source tranche connected | FRED CREACBW027SBOG weekly public aggregate bank CRE loan balance now feeds display-only `macroDrivers.commercialRealEstate`; non-public CRE loan tape/private marks remain manual_required |
| 2026-05-22 | M-85 public source tranche 11 | Codex | ninth recommended public-source tranche connected | EIA Europe Brent Spot Price FOB public HTML now feeds display-only `brentPricingLayer.eiaBrentSpotProxy`; Platts Dated Brent/formal Dated Brent remains unconnected |
| 2026-05-22 | M-76 frontend macro field surfacing | Codex | backend-present field display gap closed | Frontend display calculations now consume already-present policy/repo/retail/freight/private-credit/CRE/employment/credit/Brent detail fields in Macro Drivers, Risk Engines, and Brent Pricing Layer; no production data or decision-path behavior changed |
| 2026-05-22 | M-86 frontend proxy coverage semantics | Codex | public-proxy display no longer looks like broad missing data | Macro Overview adds `coverageNotes`, keeps formal/non-public source boundaries out of `missingEvidence`, and runtime smoke showed total `missingEvidence` reduced to World Order-only limits |

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

### Session Handoff (2026-05-22 — M-86 frontend proxy coverage semantics)

- **本次会话结束状态**: 当前工作在 `codex/macro-data-auto-ingestion`；M-86 修复 Macro Overview “新接入数据仍看起来像缺失”的前端语义问题。仍沿用 M-75 `check:all` 23 顶层 suite。
- **本次修复内容**: `buildMacroOverview` / `renderMacroRiskOverview` 增加 `coverageNotes`，并在 Today、Pressure Sources、Signal Layers、Macro Drivers、Risk Engines 卡片中显示“公开代理覆盖”。EIA/ICE/StockQ/ZQ/SR3/OIS/CDX/CRE/retail/private-credit public proxy 作为 coverage 展示；Platts/official settlement/private marks/non-public tape/BoA raw/Redbook raw 作为边界说明，不再渲染成主要缺失。
- **当前边界**: 本轮是 frontend display-only，不改生产数据、不 fetch 新源、不改 Worker/workflow，不接入 scoring/decision/execution/position、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation。正式 Platts Dated Brent、official ICE settlement、private credit marks、non-public CRE loan tape 等仍未接入。
- **前端状态**: cache bumped to `28.0M-86V`；Macro Overview runtime smoke 显示总 `missingEvidence` 从公开代理相关缺失降为仅 World Order 外部源限制。PR 描述需包含 `本 PR 符合 DESIGN.md 的所有规则`。
- **验证结果**: M-86 已通过 `node --check scripts/app.js`、`node --check scripts/modules/renderMacroOverview.js`、`npm run check:dom`、`npm run check:homepage-ia-contract`、`npm run check:editorial-redesign-contract`、`npm run check:docs`、`npm run check:brent`、`npm run check:macro-drivers`、`npm run check:all`，并通过一次 `buildMacroOverview` runtime smoke。Codex in-app Browser pane 当前不可用，未完成真实浏览器截图验证。
- **下一步建议**: 若还想继续降低“缺失感”，下一批应单独处理 World Order 外部源 partial/manual 限制，而不是把正式/非公开金融源边界伪装成已接入。
