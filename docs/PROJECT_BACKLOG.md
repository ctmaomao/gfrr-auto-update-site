# Project Backlog · GFRR Auto-Update Site

Persistent project self-memory for open work, current status, and maintenance rules. Milestone history lives in [MILESTONE_INDEX.md](MILESTONE_INDEX.md); this file keeps only the actionable backlog and compact recent context.

---

## Section 1 · 维护状态

| 项 | 当前值 |
|---|---|
| 当前生产状态 | v28.0N-1 editorial first-fold + C2 全球流动性 Cu/Au 铜金比 live display-only OBS 卡 |
| Cache version | `stage-c2-copper-gold-ratio-1` |
| check:all 项数 | 23 top-level suites |
| 最后审计日期 | 2026-05-29 |
| 主 runtime | Worker-first `/market.worker-preview.json` |
| secondary diagnostics | `/market.secondary-preview.json` only |
| 下次审计建议 | 下一次 stage / milestone 合并时 |

当前边界摘要:

- `macroDrivers.*`、`brentPricingLayer`、`consumer_vs_asset_pricing`、`dailyBrief`、`divergenceLayer` 和 `aiInterpretationLayer` 仍为 audit-only / display-only 解释层。
- 这些层不得进入 scoring、decision、execution、position、Worker main payload、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation matrix,除非另开 reviewed PR。
- Public proxy 必须继续清楚标注,不得冒充 Platts Dated Brent、official ICE settlement、private credit marks、non-public CRE loan tape、Redbook raw feed 或 BoA raw card feed。
- 详情字段和 schema 约束以 [DATA_CONTRACT.md](DATA_CONTRACT.md) 为准;运维流程以 [OPERATIONS.md](OPERATIONS.md) 为准。

---

## Section 2 · Open Backlog Items

### P0 Items

No active P0 item.

### P1 Items

No active P1 item. ACLED/SIPRI/GDELT、Pages trigger coverage、World Order refresh、market pricing history merge 和 check-suite compaction 已关闭;历史见 [MILESTONE_INDEX.md](MILESTONE_INDEX.md)。

### P2 Items

#### P2-13: FRED 抓取迁官方 API(韧性加固，进行中)

- **现状**：`run-realtime.mjs`(8s)与 `run-daily-pipeline.mjs` 的 `fetchFredSeries`(10s)均用公开 CSV 站点端点 `https://fred.stlouisfed.org/graph/fredgraph.csv`，无 API key。2026-05-29 FRED 大范围故障期间该端点超时、`api.stlouisfed.org` 504，导致 realtime / Worker / Daily `inflationEnergy` 全线降级(详见 Section 5)。
- **目标(选项 2)**：迁到官方 API `api.stlouisfed.org/fred/series/observations` + 免费 `FRED_API_KEY`(GitHub secret)，降低**日常**超时/限流。若仍不足，再做选项 3(Worker 侧非-FRED 兜底源)。
- **边界**：纯数据抓取链路，不改 scoring/decision/execution/position，不改前端。
- **预期产出 / 验证**：FRED 调用走官方 API；`npm run check:all` 全绿;合并后线上 realtime/Daily 回 live。
- **注**：对「FRED 整体宕机」这类外部故障无解(源头宕机谁都救不了)，目标是降低日常抖动。

### P3 Items

#### P3-10: Fed dot plot / OIS / FOMC 文本

- 已连接: FRED target range / DFF、Yahoo ZQ futures proxy、Fed SEP / statement、FOMC minutes keyword count、Yahoo SR3 SOFR futures proxy、CheckMySwap USD OIS public curve。
- 未连接: proprietary dealer OIS forward curve 和更完整的政策文本 NLP 质量模型。
- 边界: 不得把 public curve 写成 licensed dealer forward curve;政策文本不得进入 scoring 或 decision。

#### P3-11: Brent 实物端 / 期限结构 / freight

- 已连接: StockQ BDTI/BCTI/BDI freight proxy、ICE structure-only、Yahoo BZ priced proxy、ICE delayed last-price curve、EIA Europe Brent Spot Price FOB public HTML proxy。
- 未连接: Platts Dated Brent、formal Dated Brent、official ICE settlement curve。
- 边界: 不改 `values.brent`、Brent promotion、scoring、decision、execution、position、Worker 或 workflow。

#### P3-14: Redbook + BoA raw card 高频消费证据

- 已连接: Chicago Fed CARTS/CARTSR、FRED MRTS segment basket、BoA Consumer Checkpoint public HTML summary、Trading Economics Redbook public HTML latest summary。
- 未连接: Redbook raw subscription feed、BoA raw card feed。
- 边界: 不得把公开摘要写成 raw feed。

#### P3-15: CDX HY/IG + 私募信贷 fundraising

- 已连接: HY OAS、IG OAS、BIZD/PBDC/SRLN public proxies、ICE public CDX HY/IG settlement prices、CCLFX public interval-fund NAV proxy、FRED aggregate CRE loan balance、VNQ/REM/CMBS public proxies。
- 未连接: true private credit marks、licensed Markit history database、non-public CRE loan tape。
- 边界: 不得把 public ETF / OAS / settlement proxy 写成 private marks 或 non-public tape。

---

## Section 3 · Completed Items

Recent completed context only; full milestone archive is [MILESTONE_INDEX.md](MILESTONE_INDEX.md).

| Milestone | 一句话 |
|---|---|
| Daily degraded display refresh | Daily fallback 路径不再跳过 display-only macroDrivers:新增 `fetchDisplayOnlyMacroDrivers`,`buildFallback` 改 async 并 merge `worldEconomy`/`chinaEquity`/`inflationEnergy`/`copperGold` 四块,preserve-set 零覆盖。修复「realtime 降级时 C1/C5/C6/C2 展示卡数据永不进生产」。线上活体验证通过(降级态下 3 个 Yahoo 块 live,degradedMode 仍 true)。commit `d270176`。 |
| Stage C2 Cu/Au | C2 全球流动性 Cu/Au 铜金比从 P1 升级为 Yahoo `HG=F`/`GC=F` live 派生比率 display-only OBS 卡;接入 `macroDrivers.copperGold` (`results[13]`);schema 存原始 `ratio`,前端 render ×1000(`1.418`);`ratioChangePct` 两腿 `prev=price/(1+changePct)` 派生;不进 scoring/decision/execution/position/effectiveDisplayInputs/cross-validation。commit `80b2bac`。 |
| M-93A V3 | `#plain-summary-card` editorial section 上线;9 narrative + 31 evidence 翻译表 + 5 risk-level / 3 data-health enum;bounded checker + bump 工具命令示例 marker 覆盖;frontend display-only,不动 scoring/decision/execution/position guidance。 |
| M-93A0 | Homepage IA contract 新增 non-nav plain summary preface slot;DESIGN.md §4.1/§5.1/§10.2/§12 正式引入 `#plain-summary-card` 概念;`check-homepage-ia-contract.mjs` 添加 `checkOptionalPlainSummaryPreface()` 提供 optional allow + position guard。 |
| M-93A V2 | Plain User Summary section source review spec 落地 docs/PLAIN_SUMMARY_M93A_V2_SOURCE_REVIEW.md;12 sections 覆盖翻译表、bounded checker、cache marker 豁免边界、V3 实施清单。 |
| M-93 V1 | User Language Audit 完成,docs/USER_LANGUAGE_AUDIT_M93_V1.md 落地禁词清单与术语翻译基线。 |
| M-91 / P2-12 | Market Pricing keeps QQQ primary and adds Yahoo `^NDX` / `^IXIC` as Daily/manual display-only auxiliary comparison metrics;Worker/scoring/decision boundaries unchanged. |
| P2-11 | Backend/frontend coverage display completion merged to main; External AI raw runtime fields remain explicit ignore rather than frontend display. |
| P2-10 | Macro driver card date rendering rechecked; employment / CRE frontend output is guarded against `undefined` / `NaN` / `Invalid Date` date text. |
| M-87 | Null-to-zero display guards prevent missing sources from rendering as `0.00` or `+0.0bp`. |
| M-86 | Macro Overview separates public proxy coverage from formal / non-public boundary notes. |
| M-85 | EIA Europe Brent Spot Price FOB public HTML proxy added to `brentPricingLayer`. |
| M-84 | FRED aggregate bank CRE loan balance proxy added to `commercialRealEstate`. |
| M-83 | CCLFX public interval-fund NAV proxy added to `privateCreditProxy`. |
| M-82 | ICE public delayed Brent futures last-price curve added to `brentPricingLayer`. |
| M-81 | ICE public CDX NA HY/IG 5Y settlement prices added to `privateCreditProxy`. |
| M-80 | CheckMySwap USD OIS public curve, CMBS ETF, PBDC/SRLN public proxies added. |
| M-76 | Backend-present macro fields surfaced across Macro Drivers / Risk Engines / Brent detail. |
| M-75 | `check:all` grouped into 23 top-level suites while preserving atomic checks. |
| M-74 | shipping/freight, policy expectations, retail segments, private-credit proxy, CRE proxy connected as display-only layers. |
| M-71 Brent public proxy source review | EIA / ICE / Baltic / Freightos / future S&P-Platts source families reviewed without runtime wiring. |

---

## Section 4 · Future Considerations

- Brent physical side: pursue formal Platts / ICE settlement only through a separate reviewed source contract.
- Policy text: improve FOMC tone quality review without turning it into a decision engine.
- Backtesting: replay historical narrative triggers around 2008 / 2020 / 2022.
- Worker reliability: consider additional fallback only after current Worker-first health has enough observation time.
- Annual SIPRI refresh: update normalized data after SIPRI releases the new annual dataset.

---

## Section 5 · Audit History

Compact current audit trail:

| Date | Scope | Outcome |
|---|---|---|
| 2026-05-29 | Daily 降级模式 display-only 修复 + FRED 故障 RCA | 查实 Daily 长期走 `buildFallback`(realtime 降级)→ 跳过 `fetchMacroDrivers` → C1/C5/C6/C2 四块从未进生产数据。修复:fallback 也刷新 4 个 display-only 块(commit `d270176`,`check:all` 全绿,线上验证四块出现且 `degradedMode` 仍 true)。FRED RCA:realtime/Worker/Daily 全线降级源于公开 CSV 端点 `fred.stlouisfed.org/graph/fredgraph.csv` 大范围超时 + `api.stlouisfed.org` 504(独立网络复现,排除 CI-IP 封锁),始于 05-28 23:41Z;外部故障,自愈为主。开 P2-13 韧性加固。 |
| 2026-05-29 | Stage C2 Cu/Au 铜金比接入 (Yahoo `HG=F`/`GC=F` live display-only) | 7 步协作流程全过 (outline v1.0/v1.1 → Codex brief → Claude 逐行复核 → Codex 实施 → Claude diff 复核);commit `80b2bac` pushed to main;14 files +251/−33;`macroDrivers.copperGold` 作为 `results[13]` 接入,raw ratio 存储 / render ×1000 / OBS 中性 tone;边界守住(不进 scoring/decision/execution/position/effectiveDisplayInputs/cross-validation);无 data/realtime 手改,`build:data` 留给生产 CI;`check:all` 23 suites PASS;cache bump → `stage-c2-copper-gold-ratio-1`。 |
| 2026-05-24 | M-93 4 阶段全流程 (V1 audit / V2 spec / M-93A0 IA / V3 implementation) | PR #244/#245/#247/#248 全部 merged;新增 `#plain-summary-card` editorial section + bounded checker (`check-plain-summary-card-contract.mjs`) + `renderPlainSummary.js` 翻译表;cache version bump 28.0M-91V → 28.0M-93AV via 官方工具,工具同时扩展正则覆盖命令示例 marker;`check:all` 23 suites PASS;无 data/realtime/workers runtime/workflows 改动。 |
| 2026-05-23 | M-91 / P2-12 Market Pricing NDX/IXIC implementation | Yahoo `^NDX` / `^IXIC` added as Daily/manual auxiliary history + metrics;QQQ primary, SPX fallback, Worker/scoring/decision boundaries preserved;self-audit required by AGENTS.md Section 10 completed in delivery. |
| 2026-05-22 | M-87 null-zero display guards | Missing Brent / repo source values stay missing instead of rendering as zero. |
| 2026-05-22 | M-74 to M-86 macro public-source and frontend display work | Public proxies connected and displayed; formal/non-public boundaries preserved. |
| 2026-05-22 | M-75 check-suite compaction | Top-level `check:all` reduced to 23 suites; atomic checks retained. |
| 2026-05-20 to 2026-05-21 | M-67 to M-73 macro-driver and Brent source review | Employment, consumer retail, CRE, BGCR/TGCR, ISM PMI and Brent source-review tracks advanced. |
| 2026-05-17 to 2026-05-20 | M-57 to M-66 project memory, World Order, ACLED, IA | Backlog, SIPRI/ACLED/GDELT, Pages trigger coverage and homepage IA contracts stabilized. |

Historical detail belongs in [MILESTONE_INDEX.md](MILESTONE_INDEX.md), specific milestone docs, or git history. Do not re-copy long milestone prose into this file.

---

## Section 6 · 工作流约定

Add or update backlog items with these rules:

1. Keep one item per problem; do not bundle unrelated sources or UI work.
2. Record priority, current status, data boundary, expected output, and verification path.
3. When an item closes, keep only a one-line recent summary here and move detail to [MILESTONE_INDEX.md](MILESTONE_INDEX.md) or a scoped doc.
4. P3 / won't-fix / source-review items must state the boundary reason and the unlock path.
5. This file is checked by `npm run check:project-backlog-format` and `npm run check:all`.

---

## 🔄 Session Handoff (最新)

- **上次会话结束于**: commit `d270176`(已 push)— Daily 降级模式 display-only 修复上线 + 线上验证通过(Daily run `5991639` 写入四块,degradedMode 仍 true)。C2 接入(`80b2bac`)亦已上线。工作树:仅本次 PROJECT_BACKLOG 更新待提交。
- **当前进行中**: 启动 **P2-13(选项 2)= FRED 抓取迁官方 API + `FRED_API_KEY`**。下一动作 = Claude 写 outline → Codex 实证复审(走完整代码先行流程)。
- **下一步建议**: 先提交本次 backlog 收尾;然后开 P2-13 outline(目标文件 `scripts/run-realtime.mjs` + `scripts/run-daily-pipeline.mjs` 的 `fetchFredSeries`/`FRED_BASE`)。若 P2-13 仍不足 → 选项 3(Worker 侧非-FRED 兜底)。
- **阻塞或等待**: FRED 外部故障进行中(05-28 23:41Z 起,realtime/Worker/Daily inflationEnergy 全线降级),大概率自愈;P2-13 是降低**日常**抖动,不依赖本次故障是否结束。
