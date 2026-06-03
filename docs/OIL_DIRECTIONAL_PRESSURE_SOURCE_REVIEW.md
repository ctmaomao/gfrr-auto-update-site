# Oil Directional Pressure Model 油价方向压力研判 — Source Review（docs-only · source-review / feasibility）

> **Source-review / feasibility only。** 本文为可行性审计 + 数据可得性核验 + 模型设计 + 实施拆分的登记文档,**不写 fetcher、不接 runtime、不改 `data/*.json`、不改 frontend、不触发 GitHub Actions、不进 scoring/decision/execution/position**。
> **候选模块命名**:**Oil Directional Pressure Model**(内部代号 ODP),中文显示名「油价方向压力研判」。若未来实现,**必为 audit-only / display-only 的独立能源专题**。
> **Global Risk Heatmap 必须保持独立**——ODP 与其并列,不得合并、挤占或破坏它。
> 沿用 `BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md` / `CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md` 模板与边界纪律。

调研/裁决日期:2026-06-03。流程:Codex 只读审计 → Claude 交叉验证(代码级核 + EIA dnav live 核验)→ owner 终裁(2026-06-03):数据源优先级 / 落点 / PR 拆分已裁;**取数架构 = A-first**(EIA API v2 JSON,零依赖)—— PR1 先过 EIA API route discovery 硬 gate,**B 仅 fallback / manual seed**(见 §9/§12)。本文**不批准** live fetch、不写生产数据、不改 scoring。

---

## 0. 模块定位与硬边界

ODP 的目标**不是预测绝对油价点位**,而是判断当前原油价格更偏向哪种方向压力(强看涨 / 温和看涨 / 中性震荡 / 偏空 / 假性下跌但物理压力仍强 / 假性上涨但缺数据确认 / 成品油压力主导)。核心是**数据链条**(库存降速 → 柴油/馏分油 → 期限结构 → 炼厂开工 → SPR 缓冲),地缘风险仅辅助。

**硬边界**(与 World Order Stress overlay 同范式,见 `CLAUDE.md` 绝对规则 3「overlay 不是第七个底层风险模块」):

- **不接入** `scoring` / `decisionModel` / `executionLock` / `positionGuidance` / `Action Queue` / `Trigger Monitor` / `Invalidation Rules`。
- **不进** `values.*` / `displayInputsBaseline` / `effectiveDisplayInputs` / cross-validation matrix。
- **不并入、不挤占 Global Risk Heatmap**;ODP 是六大底层风险模块**之后**的独立能源专题。
- 公开公告级 / 周报级数据 ≠ 逐机构 / 逐笔 raw tape;字段名 / 前端文案 / notes 不得暗示替代关系。

---

## 1. 复用 vs 新增（"凡现有管道已能覆盖的必须复用,不得重复造轮子"）

### 1.1 复用现有 in-repo 字段（零新 fetch）

| ODP 需要 | 复用现有字段 | 现有来源（已验证） | 复用方式 |
|---|---|---|---|
| WTI 现货 | `macroDrivers.inflationEnergy.wti` | FRED `DCOILWTICO`（`run-daily-pipeline.mjs` 内 `fetchFredSeries`） | ODP build 读已构建的 `radar-data.json` 快照,不重抓 |
| Brent 现货 | `values.brent` / `brentPricingLayer.selectedBrent` | FRED `DCOILBRENTEU` + Yahoo `BZ=F` + TE promotion gate | 同上 |
| 柴油裂解价差 | `brentPricingLayer.crackSpread` | FRED `DHOILNYH` × 42 − Brent | 同上 — ⚠️ **这是价格/利润代理,不是馏分油库存**;库存走 §1.2 `WDISTUS1` |
| 期限结构 backwardation/contango | `brentPricingLayer.futuresPriceCurve.{slopeRegime, frontMinusBack, contracts[]}` | Yahoo `BZ` 月度期货代理（**已有,低置信**） | 复用;M1-M2 / M1-M6 可从 `contracts[]` 逐月价**派生**(仍低置信);缺则该信号降级"不参与裁决" |

> `macroDrivers.inflationEnergy` 已是一个 display-only 能源层（其 source note 即「tone 仅展示,不进 scoring/decision/execution/position」）——ODP 是它的天然兄弟,边界范式现成。

### 1.2 新增数据（EIA dnav 周度物理链 — 2026-06-03 live 核验确认）

dnav 模式:XLS = `eia.gov/dnav/pet/hist_xls/<ID>w.xls` · HTML = `eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=<ID>&f=W`

| ODP 指标 | dnav series ID | 确认标题 | 单位 | 频率 | 史起 | 喂给信号 |
|---|---|---|---|---|---|---|
| 商业原油库存 ex-SPR | `WCESTUS1` | Weekly U.S. Ending Stocks excluding SPR of Crude Oil | 千桶 | 周 | 1982-08 | inventoryDrawPressure |
| SPR 原油库存 | `WCSSTUS1` | Weekly U.S. Ending Stocks of Crude Oil in SPR | 千桶 | 周 | 1982-08 | sprBufferEffectiveness |
| 馏分油库存 | `WDISTUS1` | Weekly U.S. Ending Stocks of Distillate Fuel Oil | 千桶 | 周 | 1982-08 | dieselProductStress |
| 炼厂开工率 | `WPULEUS3` | Weekly U.S. Percent Utilization of Refinery Operable Capacity | % | 周 | 1990-11 | refineryConfirmation |
| 炼厂原油净投入 | `WCRRIUS2` | Weekly U.S. Refiner Net Input of Crude Oil | 千桶/日 | 周 | 1982-08 | refineryConfirmation |
| 汽油库存 | `WGTSTUS1` | Weekly U.S. Ending Stocks of Total Gasoline | 千桶 | 周 | 1990-01 | 成品油压力（辅） |
| 汽油 product supplied | `WGFUPUS2` | Weekly U.S. Product Supplied of Finished Motor Gasoline | 千桶/日 | 周 | — | demandDestructionRisk |
| 馏分油 product supplied | `WDIUPUS2` | Weekly U.S. Product Supplied of Distillate Fuel Oil | 千桶/日 | 周 | 1991-02 | demandDestructionRisk |

- **8 个系列全部存在、单位/频率/标题已 live 确认;EIA dnav WebFetch 可达**(对比:FRED 官网对抓取工具返 403)。
- **单位是「千桶」/「千桶/日」/「%」——不是「百万桶」**。原始需求结构里若写 `million barrels` 须改为 EIA 实际口径(千桶),否则单位 check 与真实数据对不上。
- **days-of-supply** 不需单独 series:用 `WCESTUS1 ÷ WCRRIUS2` 派生。
- 史起 1982–1991 → 2020 / 2022 / 2023-24 回测数据充分(见 §6)。

---

## 2. 数据源可得性裁决（D 级:期限结构单独标注难度）

| 源 | 免费 | 稳定 | 需 key | 频率 | 裁决 |
|---|---|---|---|---|---|
| **EIA Open Data API v2**(物理链,JSON) | ✅ | ✅ | ✅ 需免费 key | 周(WPSR) | **CI 自动首选**:JSON 零依赖解析,可在 GitHub Actions 直接写 `data/`(ADR-0013 clean) |
| **EIA dnav XLS**(物理链) | ✅ | ✅(官方公开页) | ❌ | 周(周三 WPSR) | 仅经 **dev-time/手动 sanitizer**(xlsx)写 `config/`,再零依赖 build 写 `data/`(ACLED 模式);**ADR-0013 禁止 xlsx 直写 `data/` 或在 CI production 路径运行** |
| **现有 FRED helper**(WTI/ULSD/Brent) | ✅ | ✅ | 已有 key | 日 | **复用已验证 series**,不扩新 series 除非另核 |
| **期限结构连续合约曲线**（M1-M2/M1-M6） | — | — | — | — | ⚠️ **高难度,单独标注**(见下) |
| Nasdaq Data Link / IEA MODS / 正式 ICE settlement / Stooq / Google Finance | — | — | — | — | **不接入**(新 vendor/key/订阅风险,或与现有公开代理边界冲突;F6 已删 worker Stooq probe) |

**⚠️ 期限结构难度单独说明**:免费、干净、可自动化的**连续合约价差**数据极难获得(Yahoo 连续合约有 roll 跳变;EIA/FRED 不直接给完整期货曲线)。**但项目已有低置信代理**:`brentPricingLayer.futuresPriceCurve`(Yahoo `BZ` 月度期货,带 `slopeRegime`/`frontMinusBack`/逐月 `contracts[]`/显式 `limitationZh`)。**降级方案**:复用该代理 + 从 `contracts[]` 派生近远月价差(低置信),数据缺失时把「期限结构确认度」降级为**低置信 / 不参与裁决**,绝不假设可直接接入完整曲线。

**⚠️ EIA dnav HTML 端点 latest-row 不可信(2026-06-03 实测教训)**:同属一份 WPSR、周三同步发布的系列,经 HTML `LeafHandler` 抓回的"最新日期"互相矛盾(SPR/炼厂 @2026-05-22,但原油 ex-SPR 被读成 @2025-03-28、馏分油/汽油 @2025-12 月)——这是把抽取套在「年×周」巨型网格表上的**抽取假象**,非真实数据状态。**结论:HTML 端点只能确认 series 存在/标题/单位/频率,不能取 latest-row 或新鲜度。**结构化来源 = EIA API v2 JSON(CI 自动、零依赖、ADR-0013 clean)或 dnav XLS(仅 dev-time sanitizer 用,见 §9 的 ADR-0013 约束)。

---

## 3. 频率对齐、陈旧度与季节性

混用 daily(油价)/ weekly(EIA 物理)/ monthly(未来 OECD/IEA)三种频率。规则:

- **每个指标带自己的 `asOfDate`**(数据点自身日期),**禁止**用单一全局日期掩盖时间差。
- **`maxAgeDays` 阈值**:daily=4;weekly(周三发布上周五数据)=10;monthly=45。超阈 → `sourceStatus:"stale"` → 该指标降级低置信 / 不参与裁决。
- **跨频率规则**:用周三库存与周五油价比较时,必须靠各自 `asOfDate` 显式暴露时间差;**禁止「用上周库存解释今天油价」而不标注时间差**(展示侧 PR4,数据侧 PR1 保证字段在)。
- **季节性**:库存的 5 年均值/区间比较**必须按 week-of-year(同周历史)对齐**,不用滚动均值;允许 ±1 week fallback;标 `seasonBucket`(winter_heating / summer_driving / shoulder)。柴油库存判断须区分采暖季(冬)与驾驶季(夏),夏季正常去库**不得**误判为供应危机。

---

## 4. 数据结构契约草案

落点(**建议折中,owner 倾向、UI 前再定,非已批准最终决策**):**PR1/PR2 先建独立文件** `data/oil-directional-pressure.json`(隔离周频、不污染日频评分管线);UI 前再决定是否把 latest compact snapshot 投影进 `radar-data.json` root。
依据:`scripts/app.js` 的 `loadAllData()` 当前恰好 4 个并行 fetch(radar-data / world-order-stress / market-pricing-metrics / radar-history)——**独立文件 = 第 5 个 fetch = 碰高风险 `app.js`**;root snapshot = 前端从已加载 `radarData` 直读、零新 fetch、PR4 最小碰 `app.js`。

PR1 只落 **evidence + freshness + seasonality**;`signals` / `finalBias` / `interpretation` 字段**预留为 null,PR1 不写**(契约前向兼容,contract check 对这些字段「允许缺失」)。

```jsonc
{
  "schemaVersion": "odp-1",
  "module": "oil-directional-pressure",
  "boundary": "audit-only/display-only; NOT in values/scoring/decisionModel/executionLock/positionGuidance",
  "builtAt": "<ISO>",                 // 本次 build 时间(≠ 数据本身日期)
  "evidence": {
    "crudeStocksExSpr": {
      "value": 0, "unit": "千桶",
      "asOfDate": "YYYY-MM-DD",        // 数据点自身日期,分字段、不共用全局日期
      "frequency": "weekly",
      "ageDays": 0, "maxAgeDays": 10,
      "sourceStatus": "live",          // live | fallback | stale | missing
      "source": "EIA:dnav:WCESTUS1",
      "sourceUrl": "https://www.eia.gov/dnav/pet/hist_xls/WCESTUS1w.xls",
      "change1w": 0, "change4w": 0, "change13w": 0,   // 客观派生(算术,非判断)
      "vs5yAvgPct": 0, "fiveYrRangePosition": 0.0     // 同周 5 年区间分位 0–1
    },
    "distillateStocks":   { "...同结构, maxAgeDays": 10 },
    "sprStocks":          { "..., change1w, sprReleaseRate(派生)" },
    "refineryUtilization":{ "..., unit": "%", "util4wChange": 0 },
    "refinerCrudeInputs": { "..." },
    "gasolineStocks":     { "..." },
    "demandDistillateSupplied": { "..." },
    "demandGasolineSupplied":   { "..." },

    "wtiPrice":   { "value":0,"unit":"$/bbl","frequency":"daily","maxAgeDays":4,"source":"radar-data:macroDrivers.inflationEnergy.wti" },
    "brentPrice": { "...","source":"radar-data:values.brent" },
    "crackSpread":{ "...","source":"radar-data:brentPricingLayer.crackSpread","note":"价格/裂解代理,非库存" },
    "curve":      { "slopeRegime":"backwardation|contango|flat|未知","frontMinusBack":0,
                    "confidence":"low","source":"radar-data:brentPricingLayer.futuresPriceCurve",
                    "limitationZh":"公开月度期货代理,非官方结算曲线" }
  },
  "seasonality": {
    "crudeStocksExSpr": { "weekOfYear":0,"fiveYrSameWeekMean":0,"fiveYrSameWeekMin":0,
                          "fiveYrSameWeekMax":0,"seasonBucket":"winter_heating|summer_driving|shoulder",
                          "windowFallback":"exact|±1week" }
    // …每个周度物理指标一条;week-of-year 对齐
  },

  // ↓ PR3 才写;PR1 预留 null,contract check 允许缺失
  "signals": null,
  "finalBias": null,
  "interpretation": null
}
```

---

## 5. 模型设计（PR3 — 可解释,非黑箱）

**6 子信号**:`inventoryDrawPressure`(库存降速 1w/4w/13w + 同周 5 年位置)、`dieselProductStress`(馏分油库存 + crack + 区分需求强 vs 炼厂供应不足)、`futuresCurveConfirmation`(backwardation/contango,**仅确认信号、非硬门槛、低置信**)、`refineryConfirmation`(开工率/投入,区分真实需求 / 检修 / 瓶颈)、`sprBufferEffectiveness`(**SPR 释放速度是否足以抵消商业库存降速**,而非看库存高低)、`demandDestructionRisk`(价涨但库存累积 + crack 走弱 + 开工下降时触发)。

**finalBias 枚举**:`strong_bullish` / `moderate_bullish` / `neutral_range` / `bearish` / `false_down_physical_stress` / `false_up_unconfirmed` / `product_crisis` / `insufficient_data`。

**信号冲突裁决(显式成文,不藏在加权黑箱)**:
- **物理信号**(库存、期限结构、馏分油、SPR 净效果、炼厂)**优先于** **金融/情绪信号**(价格表象、地缘溢价)。
- 三个必须保留的反直觉判断:① 油价跌但库存仍降 + backwardation 扩大 + 柴油仍低 → `false_down_physical_stress`;② 油价涨但库存回升 + 曲线走弱 + 柴油改善 → `false_up_unconfirmed`;③ 原油不强但柴油/crack 极紧 + 炼厂受限 → `product_crisis`(重通胀/物流压力,非油价本身)。
- **数据不足 → `insufficient_data`,不硬下结论**。

---

## 6. 历史回测可行性（PR2 — 作上线 GATE）

- 本地 `data/radar-history-full.json` 仅 ~40 条(2026-04-21 → 2026-06-03,约 6 周),**不足以**回测 2020/2022/2023-24。
- 可行路径:EIA dnav 物理链史起 1982–1991、FRED 价格史起 1980s,**单次 XLS 拉取即含完整历史**,可对模型做**历史 replay 回测**。
- 验收预期:2020 需求崩塌 → bearish / demand destruction;2022 供给冲击 → physical stress / product crisis;2023-24 → neutral_range / mixed(避免过度看涨)。
- **GATE 定性**:回测在已知拐点给不出合理方向之前,**不把 UI 文案写成高置信结论、不进 PR4**。这关系到模型是否值得上线,不只是"能不能跑"。

---

## 7. UI 集成（PR4）

- 位置:六大底层风险模块**之后**的独立能源专题(不塞进某个风险模块、不并入 Heatmap)。
- 路径:结论 → 一句话中文结论 → 原因拆解(库存降速/柴油/期限结构/炼厂/SPR)→ 证据(各指标值/最近变化/历史区间位置/对方向贡献)→ 展开详情(指标为何重要/当前数据说明什么/是否互相验证/哪些信号矛盾)。全中文;英文仅限变量名/内部字段。
- **IA 守卫现状(重要)**:`check-homepage-ia-contract.mjs` / `check-editorial-redesign-contract.mjs` **已在 checker 精简 Phase 1+2 退役**(见 `AGENTS.md` 当前 IA/font 权威说明)——**无自动 IA checker**。PR4 必须:① 手工同步 `DESIGN.md` §4.1 文档化阅读顺序(把新专题写进去)+ 人工 review(ADR-0014);② 过 `check:dom`(新 DOM id 两边一致,这个 checker 是活的);③ `npm run bump:frontend-asset-version`(并 `git checkout HEAD --` 还原被扇写的冻结 `scripts/modules/realtime.js`,保 diff=0)。**不得假设有 IA 自动脚本兜底。**
- **Global Risk Heatmap 仍独立显示。**

---

## 8. 检查脚本

新建 `check-suite.mjs` 的 **`oil-directional` 套件**;`package.json` 加 `check:oil-directional` 并入 `check:all` → **顶层项 15 → 16**(须同步 `CLAUDE.md` / `AGENTS.md` / `MILESTONE_INDEX.md` / `PROJECT_BACKLOG.md` 的计数字段)。

| # | check | 职责 | 阶段 |
|---|---|---|---|
| 1 | `check:odp-contract` | 字段/类型/单位枚举完整;`schemaVersion=odp-1`;`boundary` 标记在;预留字段(signals/finalBias)允许 null | **PR1** |
| 2 | `check:odp-freshness` | 每指标独立 `asOfDate`/`frequency`/`ageDays`/`maxAgeDays`/`sourceStatus`;ageDays 自洽;超阈必降级 | **PR1** |
| 3 | `check:odp-seasonality` | 同周 5 年基线存在;week-of-year 对齐(非滚动均值);`seasonBucket` 枚举合法;±1 week fallback 标注 | **PR1** |
| 4 | `check:odp-degradation` | 缺失/stale 禁止伪造 value;insufficient 下禁止填 finalBias;sourceStatus 正确降级（落实"数据不足→暂不判断") | **PR1** |
| 5 | `check:odp-boundary` | 守边界:ODP 字段**不出现**在 radar-data 的 values/scoring/decision/exec/position(同 brentPricingLayer/world-order 守卫范式) | **PR1** |
| 6 | `check:odp-score` | 分数范围/finalBias 枚举合法性 | PR3 |
| 7 | `check:odp-zh-copy` | 中文 UI 文案、无 action 词 | PR4 |

**关键**:数据缺失时网站**不得硬下结论**,必须显示「数据不足 / 暂不判断 / 缺哪些关键数据 / 当前仅低置信度判断」。

---

## 9. 抓取纪律（若未来实现,沿用 ISM/Redbook/NBS/EIA 纪律）

- ⚠️ **ADR-0013 硬约束(写 `data/` 的代码必须零依赖)**:`docs/ADR/0013-*.md` 明确 devDependency(含 `xlsx`)**不得**被任何写 `data/` 的代码、或任何 GitHub Actions production 路径脚本导入(line 30/36)。因此 **xlsx 不能用于直写 `data/oil-directional-pressure.json` 的 fetcher/build,也不能在 CI 自动 refresh 里跑**。两条合规路径:
    - **(A) CI 自动【owner 终裁 = 已选主路】**:EIA API v2 返 **JSON → 零依赖解析 → build 写 `data/`**;需免费 EIA key(GitHub secret,同 FRED/GDELT 管理);全程无 devDep。前置硬 gate 见 §12。
    - **(B) 手动 sanitizer(ACLED 模式)【fallback / manual seed / API 不通退路】**:operator 本地下 dnav `.xls` → `scripts/oil-directional/sanitize-*.mjs`(xlsx,dev-time entry,**只写 `config/`**)→ 零依赖 build 读 config 写 `data/`;xlsx 永不进 CI/`data/`(ADR-0013 line 23/29 sanctioned 模式)。**选 B 须同步放宽 `AGENTS.md`(:86)/ `DATA_SOURCES.md`(:317)的「xlsx 仅限 ACLED sanitizer」边界以纳入 ODP sanitizer(选 A 不动)。**
- **结构化解析**:无论 A/B,latest-row 都从结构化源取;**HTML LeafHandler 仅确认 series 存在/元数据,不取 latest-row**(见 §2 实测教训)。
- 低频 + 按日期缓存 + UA `GFRRBot/1.0`;不绕 SSO/captcha;只用官方显式端点 URL,不广扫站点。
- **Fail closed**:空记录 / schema 变化 / 非 200 / 解析失败 / 超期 → `missing` / `stale` / `fallback`,**不得伪造缺失值、不得把 stale 当 live**。
- source 标签:EIA dnav 物理链标 `EIA:dnav:<ID>`;复用字段标 `radar-data:<path>`。
- **EIA = 美国政府公共领域数据**,标注 source URL 即可(比 ACLED EULA 宽松,无 scraping 禁令)。

---

## 10. PR 拆分（serial trunk,逐个合并;PR1 不碰 UI/`app.js`）

1. **PR1** — **第一步过 EIA API route discovery 硬 gate(8 WPSR series live-proof,见 §12)** + source review + data contract + fetch/build 脚本(**零依赖写 `data/`**,见 §9 ADR-0013)+ 5 个 check + 一次性 build 初始 `data/oil-directional-pressure.json`;**不含 workflow**;**不渲染、不碰 `app.js`/`index.html`/`renderMacroOverview.js`/`validate-data.mjs`**;`radar-data.json` 零改动。
2. **PR1b** — 周度 refresh workflow(镜像 `refresh-world-order-stress.yml`)+ 按 `check-workflows.mjs` 接入 `deploy-static-site-to-pages.yml` 的 Pages trigger 覆盖。**与 PR1 分开**,避免第一刀扩到 workflow + trigger 接线(呼应原始约束「第一 PR 纯数据接入 + check」)。
3. **PR2** — 历史 cache + 2020/2022/2023-24 回测 harness(**GATE**:拐点方向合理才进 UI)。
4. **PR3** — `signals`/`finalBias`/`interpretation` 模型固化 + 物理>金融裁决,仍 display-only;启用 `check:odp-score`。
5. **PR4** — 中文 UI 独立能源专题;同步 `DESIGN.md` §4.1 + `check:dom` + asset version bump + 最小 `app.js`(整包升级 + `node --check`);决定 root snapshot 投影;启用 `check:odp-zh-copy`。
6. **PR5** — 稳定观察后,才让 `dailyBrief` / interpretation 层**只读引用**。

---

## 11. PR1 文件清单

**PR1 新建**:`scripts/oil-directional/build-oil-directional-pressure.mjs`(**零依赖**,写 `data/`)+ 取数路径按 §9 二选一(A=零依赖 EIA API client;B=`scripts/oil-directional/sanitize-*.mjs` 用 xlsx 写 `config/`)· `data/oil-directional-pressure.json`(初次 build)· `scripts/check-oil-directional-*.mjs` ×5 · 本文档。

**PR1 触碰**:`scripts/check-suite.mjs`(加套件)· `package.json`(加脚本 + 入 check:all)· `DATA_SOURCES.md`(主表 + 反向索引)· `DATA_CONTRACT.md`(新文件契约)· `PROJECT_BACKLOG.md`(backlog 项 + Handoff)· 计数字段(`CLAUDE.md` / `AGENTS.md` / `MILESTONE_INDEX.md` 15→16)· **`docs/INDEX.md`**(按其自身规则:新增文档必登记,放「Brent / energy public proxy source review scope」段)。

**PR1 触碰(仅 B 路径额外)**:`AGENTS.md`(:86)与 `docs/DATA_SOURCES.md`(:317)的「xlsx 仅限 ACLED sanitizer」边界须放宽以纳入 ODP sanitizer;选 A 则不动这条。

**PR1b 新建/触碰**:`.github/workflows/refresh-oil-directional-pressure.yml` + `.github/workflows/deploy-static-site-to-pages.yml`(Pages trigger 覆盖,`check-workflows.mjs` 强制)。

**明确不碰**:`scripts/app.js` · `index.html` · `scripts/modules/renderMacroOverview.js` · `scripts/validate-data.mjs` · `data/radar-data.json` · 前端 asset version。

---

## 12. PR1 source-review 开放问题（开工前必须先回答）

1. **取数架构 —— owner 2026-06-03 终裁:A-first**(EIA API v2 JSON,零依赖 + 免费 key,CI 自动);**B(手动 xlsx sanitizer→`config/`→零依赖 build)仅作 fallback / manual seed / API 不通退路**。**硬 gate(PR1 第一个动作)**:用 EIA key live-proof 8 个 WPSR series 的 API route(`petroleum` route 或 v2 `/seriesid/` legacy)—— 覆盖 / 返回结构 / 单位频率坐实才写正式 build;映射不稳或结构不适合才切 B。顺带查 dnav 是否另有零依赖 CSV 端点(若有则 A 连 key 都省)。**不接受**为自动化让 xlsx 进 CI 写 `data/`(撞 ADR-0013)。
2. **deploy-trigger 接线**:新 refresh workflow commit 到 main,`check-workflows` 是否强制它进 `deploy-static-site-to-pages.yml` 的 `workflow_run.workflows`?(PR1-3 前端尚未读此文件,理想是不触发 Pages 重建;须确认 checker 是否允许非部署型 commit workflow,否则接入即可,无害重建。)
3. **dnav 稳定性**:连续几次拉取确认 XLS 结构不变、无地理封锁(EIA 在 US runner 应可达,不同于 pbc.gov.cn)。
4. **`WGFUPUS2` / `WDIUPUS2` / days-of-supply**:确认 product-supplied 口径是否满足 `demandDestructionRisk` 需求;days-of-supply 采「`WCESTUS1 ÷ WCRRIUS2` 派生」。

---

## 13. 待办 / 注

- 本文为 source-review / feasibility,**无代码改动、无 runtime、无 data 写入、无 frontend 改动、无 workflow 触发**。
- 数据可得性核验状态:EIA 8 系列 2026-06-03 live 确认存在 + 单位/频率坐实(Codex 另用结构化 xlsx 复核 latest 行一致 @2026-05-22);前移的工程决策 = 取数架构按 ADR-0013 二选一(零依赖 EIA API JSON vs 手动 xlsx sanitizer→config→零依赖 build),HTML 仅元数据。
- 任何实现须各自另开 PR 走完整复核流程(outline → 实证 → brief → 复核 → 实施 → diff 复核),且永不进 scoring/decision/execution/position。

---

## 结论

ODP 适合作为 GFRR 的**独立能源专题、audit-only / display-only**(非第七个底层风险模块,Heatmap 保持独立)。核心物理链数据**可得**:dnav XLS 已证明**零 key 可得**(手动 B 路径);CI 自动主路 = EIA API v2(owner 终裁 A);PR1 先过 route discovery 硬 gate 确认 8 series 并配免费 key(见 §9/§12)。dnav XLS 提供原油/SPR/馏分油/汽油库存、炼厂开工率与投入、product-supplied 需求 proxy(2026-06-03 已 live 确认,史起 1982–1991),价格/裂解/曲线复用现有 FRED + Yahoo 字段。第一步**不碰 UI、不碰 `app.js`**,先做 source review + data contract + check scripts;期限结构只能低置信复用、缺则不参与裁决;回测作上线 GATE;数据不足时显式「暂不判断」。
