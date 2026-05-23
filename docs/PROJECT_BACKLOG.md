# Project Backlog · GFRR Auto-Update Site

Persistent project self-memory for open work, current status, and maintenance rules. Milestone history lives in [MILESTONE_INDEX.md](MILESTONE_INDEX.md); this file keeps only the actionable backlog and compact recent context.

---

## Section 1 · 维护状态

| 项 | 当前值 |
|---|---|
| 当前生产状态 | v28.0M-90 backend/frontend coverage display patch |
| Cache version | `28.0M-90V` |
| check:all 项数 | 23 top-level suites |
| 最后审计日期 | 2026-05-22 |
| 主 runtime | Worker-first `/market.worker-preview.json` |
| secondary diagnostics | `/market.secondary-preview.json` only |
| 下次审计建议 | 2026-05-25 或下一次 milestone 合并时 |

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

#### P2-12: M-91 Market Pricing Temperature 扩展到 NDX/IXIC

- 状态: source review + contract design; implementation not started.
- 边界: 在 source review + contract review 完成并由 owner 拍板前,不接入 NDX (`^NDX`) 或 IXIC (`^IXIC`) 任何 fetcher、sanitizer、history write 或 metrics 计算路径;不改 Worker runtime;不改 displayInputsBaseline / effectiveDisplayInputs;不改 Brent promotion 或 scoring/decision/execution/position 主链。
- 现状基线: Market Pricing Temperature 当前只覆盖 QQQ;Yahoo `^GSPC` 已在 secondary diagnostics 但状态为 `fallback_candidate_only`,未进入 metrics;NDX 和 IXIC 在 `data/market-pricing-history.json` 里仍为 `waiting_for_source`。
- Source review 输出: `docs/MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md` 给出 7 个关键决策点的推荐答案与 M-91 implementation spec 草案。
- Contract guard: `npm run check:market-pricing-ndx-ixic-source-review-design` 锁定当前阶段仍为 source-review-only,并确认 NDX/IXIC 未写入 history 或 metrics、未进入 Worker runtime。
- 下一步: 等 owner review 决定是否进入独立 implementation PR;implementation 阶段必须另做 checker、cache bump、Playwright DOM verification 与 Yahoo Finance spot check。

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

- Market Pricing Temperature: extend beyond QQQ only after history and contract review.
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
