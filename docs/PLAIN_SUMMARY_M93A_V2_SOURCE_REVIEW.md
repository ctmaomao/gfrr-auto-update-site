# M-93A V2 Source Review Spec · 普通用户摘要 Section

> **STATUS (2026-06):** Historical artifact — preserved as a pre-implementation source-review / spec record. The 2026-05 runtime path reviewed here (`#plain-summary-card` / `renderPlainSummary.js` / `check-plain-summary-card-contract.mjs`) shipped and was later retired by the M-94 V0 Path C frontend rebuild (deleted in `c8229574`, "stage 2: delete 13 legacy frontend files"); residual style/contract references are tracked as **M-94 cleanup debt, not evidence that this spec is pending**. Not a current behavior contract; retained as milestone background only. Current frontend authority: `docs/M94_V0_DATA_CONTRACT.md` + `DESIGN.md`.

审阅日期: 2026-05-24  
输入依据: `docs/USER_LANGUAGE_AUDIT_M93_V1.md`、owner 拍板的 M-93A V0 设计、当前 `main` 已合并的 PR #244。  
目标用户: 中文普通用户,60+ 长辈类型,平时看新闻但不看金融报表、不懂金融术语。

## Section 1 · 范围与边界声明

M-93A 是 frontend display-only 改造: 在现有首页跳转导航之后、宏观风险总览之前新增一个普通用户摘要 section,用规则模板把已有数据解释成更口语的中文。M-93A 不改变 scoring、decision、execution、position、Worker、Daily workflow、数据结构或现有专业模式;专业模式保持原样、默认可见,本 milestone 不做折叠开关,也不改 M-92A 锁定的 8 个今日总判断状态短语。

严格不动的范围:

| 范围 | V3 边界 |
|---|---|
| `data/*.json`、`realtime/*.json` | 不读写生成产物,不修数据,不改 schema。 |
| `workers/`、`.github/workflows/` | 不改 Worker runtime,不加 workflow,不加 secret,不触发 provider call。 |
| `CLAUDE.md`、`DESIGN.md`、`docs/INDEX.md` | 完全不动。 |
| `README.md`、`AGENTS.md`、`docs/OPERATIONS.md`、`docs/DATA_CONTRACT.md`、`workers/gfrr-realtime-worker/README.md` | 严格不动逻辑、规则、约束和流程;仅 frontend asset version 字符串行在 V3 可由官方 bump 工具更新。 |
| `scripts/check-workflows.mjs` | 严格不动 checker 逻辑、contracts 数组、forbiddenRuntimePatterns 和断言范围;仅 `frontendAssetVersion` 常量值在 V3 可由官方 bump 工具更新。 |
| 其他现有 checker | 不改任何现有断言,只允许新增 `scripts/check-plain-summary-card-contract.mjs`。 |
| 现有 renderer | 除 frontend asset version import query 字符串外不改现有 renderer;新增普通模式逻辑必须放入 `scripts/modules/renderPlainSummary.js`。 |
| 现有 14 个 IA section DOM | 不改 ID、标题、顺序、jump nav label/href,不把新 section 加进 jump nav。 |

本 V2 spec 只记录、不实施的事项:

| 事项 | V2 处理 |
|---|---|
| V3 implementation 文件清单 | Section 9 记录预计新增/修改范围,本阶段不创建代码文件。 |
| cache version bump 清单 | Section 9 基于 grep 证据列出受影响文件,本阶段不 bump。 |
| `docs/PROJECT_BACKLOG.md` 漂移修复 | Section 11 记录为 separate optional docs-drift item,本阶段不修改。 |

Frontend asset version 例外已经 owner 拍板: V3 如果修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js`,必须通过 `node scripts/bump-frontend-asset-version.mjs 28.0M-93AV` 一次性原子更新版本字符串。该例外不扩展到任何其他 checker、`.github/workflows/`、`data/*.json`、`CLAUDE.md`、`DESIGN.md` 或 `docs/INDEX.md`。

## Section 2 · 普通用户摘要 section 设计

新增 DOM 位置: `</nav class="dashboard-jump-nav">` 之后、`<section id="macro-risk-overview">` 之前。新 section 可以有自己的 anchor ID,但不得加入 `.dashboard-jump-nav` 的 14 项阅读路径。

Section 容器:

```html
<section id="plain-summary-card" class="editorial-section plain-summary-section" aria-label="今天全球金融风险一览">
  ...
</section>
```

6 个元素规格:

| 元素 | `data-plain-summary-element` | 建议 tag | CSS class | 内容规则 |
|---|---|---|---|---|
| 标题 | `section-title` | `h2` | `plain-summary-title` | 固定文本: `今天全球金融风险一览`。 |
| 风险等级 pill | `risk-level` | `p` 或 `div` | `plain-summary-risk-level` | 只允许 5 级 enum: 风险较低 / 风险正常 / 风险偏高 / 风险很高 / 风险非常高。 |
| 风险分与趋势 | `score-trend` | `p` | `plain-summary-score-trend` | `风险分 N / 100` + 一周变化口语模板;N 必须是整数。 |
| 一句话主线 | `plain-story` | `p` | `plain-summary-story` | 用 `dailyBrief.dominantRiskChain.key` 查 `PLAIN_NARRATIVE_PHRASES`。 |
| 主要风险 3 条 | `top-risks` | `ul` | `plain-summary-risks` | 从 evidence key 映射出最多 3 条普通话短句;不足时补 fallback。 |
| 数据状态 | `data-health` | `p` | `plain-summary-data-health` | 只允许 3 级 enum: 数据正常 / 数据稍旧 / 数据不够新。 |
| 阅读提示 | `scroll-hint` | `p` | `plain-summary-scroll-hint` | 固定文本: `继续往下看专业分析与原始数据`。 |

建议 5 级风险分阈值:

| score | 输出 |
|---|---|
| 0-30 | 风险较低 |
| 31-50 | 风险正常 |
| 51-70 | 风险偏高 |
| 71-85 | 风险很高 |
| 86-100 | 风险非常高 |

建议 3 级数据健康阈值,参考 M-92A+ `buildTodayDataHealth` 的健康分和年龄思路:

| 条件 | 输出 |
|---|---|
| `healthScore >= 90` 且数据年龄 `<= 36h` | 数据正常 |
| `healthScore >= 70` 且数据年龄 `<= 72h` | 数据稍旧 |
| 其他或缺少关键字段 | 数据不够新 |

视觉草图:

```text
+------------------------------------------------+
| 今天全球金融风险一览                           |
| [风险偏高]                                     |
| 风险分 59 / 100    比一周前高 1 分             |
| 今天最值得关注: 油价推高物价和利息             |
| 目前看到的主要风险:                            |
| - 油价仍然偏高                                 |
| - 市场担心物价更高                             |
| - 长期借钱成本偏高                             |
| 数据正常                                       |
| 继续往下看专业分析与原始数据                   |
+------------------------------------------------+
```

V3 视觉目标: 朴素、可扫读、大字号、少层级。不要用复杂卡中卡;不要把专业缩写、原始小数和工程状态带入这个 section。

## Section 3 · Deterministic translation tables

翻译表必须是 deterministic hardcoded table,不调用 DeepSeek、OpenAI 或任何 external AI。翻译表值必须是面向普通用户的中文短句,建议不超过 22 个汉字;不得使用 V1 报告 Section 2、Section 3、Section 5 中列出的工程术语、金融缩写或状态行话。source key 本身是内部 key,可存在于代码字典键中,但不得作为最终 `textContent` 输出。

`PLAIN_NARRATIVE_PHRASES` 必须覆盖 `scripts/modules/renderMacroOverview.js` 中 `NARRATIVE_EMOJI` 的 7 个 key、当前 `data/radar-data.json` 实际出现的 `dailyBrief.dominantRiskChain.key` 值,以及 `unknown` fallback。当前静态扫描结果: `dominantRiskChain.key = energy_inflation_rates`。

| source key | 普通话输出 |
|---|---|
| `energy_shock` | 油价变贵推高物价 |
| `stagflation_pressure` | 东西变贵增长放慢 |
| `risk_asset_mismatch` | 股市价格和现实脱节 |
| `overheat_confirmation` | 市场过热需要降温 |
| `credit_spread_warning` | 企业借钱开始变难 |
| `liquidity_tightening` | 市场资金正在变紧 |
| `world_order_pressure_crossing` | 国际局势影响经济 |
| `energy_inflation_rates` | 油价推高物价和利息 |
| `unknown` | 今天没有单一主线 |

`PLAIN_EVIDENCE_PHRASES` 必须覆盖当前 `data/radar-data.json` 中 `dailyBrief.dominantRiskChain.evidence[].key` 的所有实际值。当前静态扫描结果: `breakeven10y`、`brent`、`us10y`。V3 可保留下面的扩展 key 作为未来数据形态的防守式字典,但最终输出仍只来自匹配到的 evidence。

| source key | 普通话输出 |
|---|---|
| `brent` | 油价仍然偏高 |
| `breakeven10y` | 市场担心物价更高 |
| `us10y` | 长期借钱成本偏高 |
| `vix` | 股市恐慌不明显 |
| `hy_oas` | 较弱公司借钱变难 |
| `ig_oas` | 大公司借钱成本上升 |
| `sofr` | 短期借钱利息偏高 |
| `dff` | 官方短期利息偏高 |
| `zq_curve` | 市场预计利息仍高 |
| `sr3_curve` | 未来借钱成本仍高 |
| `ois_curve` | 利息预期仍偏高 |
| `cdx_hy` | 较弱企业保险变贵 |
| `cdx_ig` | 大企业保险变贵 |
| `bizd` | 私募借贷基金走弱 |
| `pbdc` | 私募借贷基金走弱 |
| `srln` | 企业贷款基金走弱 |
| `cclfx` | 私募借贷基金走弱 |
| `vnq` | 房地产股票走弱 |
| `rem` | 抵押地产股票走弱 |
| `cmbs` | 商业地产债券走弱 |
| `bdti` | 原油运输仍偏贵 |
| `bcti` | 成品油运输仍偏贵 |
| `bdi` | 大宗货运有所升温 |
| `nfci` | 金融环境没有放松 |
| `walcl` | 市场资金没有明显变多 |
| `on_rrp` | 闲置资金正在减少 |
| `consumer_retail` | 消费支出变化不稳 |
| `employment` | 就业市场有点变弱 |
| `commercial_real_estate` | 商业地产仍需留意 |
| `shipping_freight` | 运输成本仍需留意 |
| `unknown` | null,不输出该条 |

Fallback 规则: narrative 未命中时输出 `今天没有单一主线`; evidence 未命中时跳过该条,不得输出 source key、缩写、原始数值或 `unknown` 字面量。

## Section 4 · 数据来源与映射规则

M-93A 只消费当前前端已经读取的 `data/radar-data.json` 对象,不得新增 fetch、不得改 data contract、不得把普通摘要输出反写回 JSON。当前实测字段: 根级 `score = 56`、根级 `scoreChange7d = 2`、`dailyRealtimeInput.healthScore = 100`、`dailyRealtimeInput.updatedAt = 2026-05-23T23:13:19.693Z`。

风险等级阈值建议:

| 输入 | 输出 | 说明 |
|---|---|---|
| `score === null` 或非有限数 | 风险正常 | 保守 fallback,但 score 文案显示 `暂无风险分`。 |
| `0 <= score <= 30` | 风险较低 | 明显低位,口径温和。 |
| `31 <= score <= 50` | 风险正常 | 低于 50 或接近中位,避免制造紧张。 |
| `51 <= score <= 70` | 风险偏高 | 当前 56 会落入此档。 |
| `71 <= score <= 85` | 风险很高 | 对应旧 today enum 的局部冲击附近,但不复用行话。 |
| `86 <= score <= 100` | 风险非常高 | 避免使用"危急"等确定性强词。 |

数据健康阈值建议:

| 输入条件 | 输出 | tone class 建议 |
|---|---|---|
| `healthScore >= 90` 且 `ageHours <= 36` | 数据正常 | `is-good` |
| `healthScore >= 70` 且 `ageHours <= 72` | 数据稍旧 | `is-watch` |
| 其他、缺少 `updatedAt`、缺少 `healthScore` | 数据不够新 | `is-stale` |

score trend 文案规则:

| 输入 | 输出 |
|---|---|
| `scoreChange7d > 0` | `比一周前高 N 分` |
| `scoreChange7d < 0` | `比一周前低 N 分` |
| `scoreChange7d === 0` | `和一周前基本一样` |
| `scoreChange7d === null` 或非有限数 | `暂无一周对比` |

数值格式规则:

| 字段 | 输出要求 |
|---|---|
| 风险分 | `Math.round(score)` 后显示整数 0-100;允许 `59 / 100` 这种整数形式。 |
| 一周变化 | `Math.round(Math.abs(scoreChange7d))`;不得显示小数。 |
| healthScore | 不直接显示具体分数,只显示 3 级数据状态。 |
| ageHours | 不显示小时数;只作为数据状态判断输入。 |

narrative 选取规则: 优先用 `dailyBrief.dominantRiskChain.key` 查 `PLAIN_NARRATIVE_PHRASES`;找不到时输出 `今天没有单一主线`。不得回退到 `dailyBrief.dominantRiskChain.labelZh`、`dailyBrief.oneLineConclusion` 或 `dailyBrief.macroState`,因为这些字段当前可能含金融行话。

top 3 risks 选取规则:

1. 从 `dailyBrief.dominantRiskChain.evidence` 取数组。
2. 只取每条 evidence 的 `key`,查 `PLAIN_EVIDENCE_PHRASES`。
3. 翻译表无此 key 或值为 `null` 时跳过。
4. 去重后最多显示 3 条。
5. 少于 3 条时补 `目前没有更多突出的风险点`。
6. 不读取 evidence 的 `labelZh`、`value`、`unit`、`status` 或原始数值字段。

## Section 5 · Checker bounded 扫描范围（关键）

新增 `scripts/check-plain-summary-card-contract.mjs` 必须是 bounded checker。它的目的不是全站语言审计,而是锁住新增普通摘要 section 的安全边界,防止 M-93A 又把专业术语带回默认首屏。

允许扫描的 3 个区域:

| 区域 | 范围 | 不得扫描 |
|---|---|---|
| DOM | `index.html` 中 `<section id="plain-summary-card">...</section>` 内部 HTML | `index.html` 其他 section、jump nav、现有 IA DOM。 |
| JS helper | `scripts/modules/renderPlainSummary.js` 整个文件 | 其他 renderer、`data/*.json`、现有 checker。 |
| CSS | `assets/styles.css` 中所有 `.plain-summary-` 开头 selector 块 | 其他 CSS selector、M-92A+ mobile block。 |

禁词检测范围:

| 检测项 | 只扫 | 不扫 |
|---|---|---|
| 禁词 | `renderPlainSummary.js` 中作为 `textContent`、`innerText`、`appendText(..., literal)`、`createTextNode(literal)` 输出的用户可见字符串字面量 | import path、source key 字符串、对象键、阈值数字常量、注释、测试数据、非输出辅助变量。 |
| 小数 regex | 同上,只扫最终用户可见字符串字面量 | `?v=28.0M-93AV`、score 阈值、health 阈值、文件名、版本号。 |

ignore list 顶部注释模板:

```javascript
// Ignore list: empty. M-93A plain-summary checker only scans
// (1) #plain-summary-card section in index.html,
// (2) user-visible string literals emitted by renderPlainSummary.js,
// (3) .plain-summary-* selectors in styles.css.
// It never scans existing IA sections, data/*.json, threshold constants,
// other renderer files, import paths, or other contract checkers.
const IGNORE_RANGES = [];
```

Checker 锁定的 7 项 contract:

| Contract | 断言伪代码 |
|---|---|
| DOM selector | `sliceElementById(html, 'plain-summary-card')` 存在;包含 7 个 `data-plain-summary-element` 值;位置在 nav 后、`#macro-risk-overview` 前。 |
| 翻译表存在 | `renderPlainSummary.js` 包含 `PLAIN_NARRATIVE_PHRASES`、`PLAIN_EVIDENCE_PHRASES`;包含 Section 3 的 required key。 |
| CSS class 存在 | `styles.css` 包含 `.plain-summary-section`、`.plain-summary-title`、`.plain-summary-risk-level`、`.plain-summary-score-trend`、`.plain-summary-story`、`.plain-summary-risks`、`.plain-summary-data-health`、`.plain-summary-scroll-hint`。 |
| 禁词列表 | 对用户可见字符串逐条 assert 不包含 Section 6 禁词 pattern。 |
| 小数 regex | 对用户可见字符串 assert `!/\d+\.\d+%?/u.test(text)`。 |
| 风险等级 enum | 输出 literal 只能来自 `['风险较低','风险正常','风险偏高','风险很高','风险非常高']`。 |
| 数据健康 enum | 输出 literal 只能来自 `['数据正常','数据稍旧','数据不够新']`。 |

Checker 还必须断言 `plain-summary-card` 不出现在 `.dashboard-jump-nav` 内任何 `<a href>` 中;这条保护 `check-homepage-ia-contract.mjs` 的 14 项 nav contract。

## Section 6 · 禁词与小数 regex 清单

V3 checker 禁词 pattern 总数建议为 99 项: 工程师术语 29 项、金融英文缩写 50 项、金融行话/状态短语 12 项、操作建议词 8 项。禁词只用于 M-93A plain-summary 用户可见字符串,不得用于全站扫描。

工程师术语 29 项:

| # | pattern |
|---:|---|
| 1 | `display-only` |
| 2 | `audit-only` |
| 3 | `sourceStatus` |
| 4 | `status=live` |
| 5 | `status=live_proxy_curve` |
| 6 | `status=live_public_curve` |
| 7 | `live_structure_only` |
| 8 | `live_proxy_priced` |
| 9 | `live_delayed_priced` |
| 10 | `manual_required` |
| 11 | `displayInputsBaseline` |
| 12 | `effectiveDisplayInputs|__effectiveDisplayInputs` |
| 13 | `contractVersion` |
| 14 | `schemaVersion` |
| 15 | `boundaries` |
| 16 | `affectsScoring=false` |
| 17 | `affectsDecisionModel=false` |
| 18 | `affectsExecutionLock=false` |
| 19 | `affectsPositionGuidance=false` |
| 20 | `realtime payload` |
| 21 | `Worker|Worker-first` |
| 22 | `Daily fallback|baseline` |
| 23 | `worker-generated-preview` |
| 24 | `cross-validation matrix` |
| 25 | `narrative` |
| 26 | `promotion|Brent promotion` |
| 27 | `proxy|public proxy` |
| 28 | `frontendDisplayApproved|productionWriteApproved` |
| 29 | `cache version|module graph` |

金融英文缩写 50 项:

```text
UMCSENT, ISM PMI, JOLTS, U-6, AHE, ICSA, CCSA, CARTS, CARTSR, MRTS,
SLOOS, HY OAS, IG OAS, SOFR, BGCR, TGCR, ZQ, SR3, OIS, NFCI,
CDX, CDX HY, CDX IG, BIZD, PBDC, SRLN, CCLFX, BDTI, BCTI, BDI,
VNQ, REM, CMBS, WALCL, ON RRP, QoQ, YoY, 4w-MA, bp, pp,
Brent, ULSD, Platts, SEP, FOMC, DFF, QQQ, NDX, IXIC, VIX
```

金融行话与状态短语 12 项:

```text
系统性风险观察, 压力上升观察, 维持当前判断, 证据不足，等待确认,
慢变量, 相对平稳, 边际, 滞胀冲击, 局部冲击观察, 压力较高,
数据降级维持观察, 压力边际缓和
```

操作建议词 8 项:

```text
买入, 卖出, 减仓, 加仓, 止损, 止盈, 建仓, 平仓
```

小数 regex:

```javascript
const USER_VISIBLE_DECIMAL_PATTERN = /\d+\.\d+%?/u;
```

说明: 普通摘要不得在用户可见 `textContent` 中显示具体小数,例如 `4.57%`、`2.40`、`+0.8%`。风险分整数 `59 / 100` 允许显示,因为它没有小数点,且是普通摘要的核心入口。

## Section 7 · 与现有 contract checker 的交互

M-93A 的核心策略是新增并隔离普通摘要,不重写现有专业模式。因此 V1 报告 Section 7 的 15 个冲突点大多数在 M-93A 中为 0 影响;真正要防的是新 section 被误加进 jump nav、移动端高度过高,以及 cache bump 时忘记 `check-workflows.mjs` 的版本常量。

| # | V1 冲突点 | M-93A 影响 | 应对 |
|---:|---|---|---|
| 1 | M-92A 今日卡片 8 个 state-conclusion enum 被硬锁 | 0 | M-93A 不改 `TODAY_SUMMARY_STATE_PHRASES`,普通摘要使用独立 5 级风险 enum。 |
| 2 | M-92A 今日卡片 6 个 DOM selector 被硬锁 | 0 | 不改 `homepage-today-judgment` 和 `data-today-summary-element`。 |
| 3 | M-92A helper block 禁止 decision/execution/position/action 文案 | 低 | 不动 today helper;新 checker 也禁止操作建议词,防止普通摘要越界。 |
| 4 | M-92A 7日变化标签被检查 | 0 | 不改 today card 的 `7日变化`;普通摘要可写"一周前"。 |
| 5 | 首页 14 项 IA label 和顺序被锁定 | 低 | `plain-summary-card` 不进入 `.dashboard-jump-nav`;新 checker 必须断言 nav 中无该 href。 |
| 6 | 旧 IA label 禁止回退 | 0 | 不改 nav label,不恢复旧标题。 |
| 7 | 宏观总览 header 静态结构被锁定 | 低 | 新 section 插在 nav 与 `#macro-risk-overview` 之间,不进入 macro header 内部。 |
| 8 | Editorial redesign checker 锁定 stage 文案 | 0 | 不改 stage 文案;普通摘要不用 `正常观察/压力上升/局部冲击观察/系统性风险观察`。 |
| 9 | Copy checker 锁定若干中文禁用词 | 低 | V3 要在普通摘要文案中避开 copy checker 旧禁词;新增 checker 可提前兜住。 |
| 10 | M-91 market pricing 多资产状态和标签被锁定 | 0 | 不改市场温度、NDX/IXIC、`display-only` 专业展示。 |
| 11 | M-91 NDX/IXIC 实现 checker 锁定辅助显示文字 | 0 | 不改 `AUXILIARY · DISPLAY ONLY` 或相关 label。 |
| 12 | Market pricing first-fold/cross-validation checker 锁定 QQQ z-score 和矩阵 shape | 0 | 不隐藏、不移动、不改市场温度与交叉验证现有 DOM。 |
| 13 | Cross-validation education 文案被断言 | 0 | 不改方法说明和教育附录。 |
| 14 | Macro driver 说明文案被多个 checker 锁定 | 0 | 普通摘要只读 dominantRiskChain evidence key,不改 macro driver cards。 |
| 15 | External AI 面板小标题被锁定 | 0 | 不改 external AI 面板,不启用 external AI。 |

影响分布: 0 影响 11 项,低影响 4 项,中影响 0 项,高影响 0 项。

重点确认:

| checker | M-93A 判断 |
|---|---|
| `scripts/check-today-summary-card-contract.mjs` | 不受影响;今日卡片 DOM、8 个 enum、helper block 均不改。 |
| `scripts/check-homepage-ia-contract.mjs` | 不受影响的条件是新 section 不进 nav,且不改变 14 项 label/order/href。 |
| `scripts/check-mobile-first-fold-compaction.mjs` | 有视觉高度风险: 新 section 会把 `#macro-risk-overview` 下推。V3 必须控制移动高度,但不能改 M-92A+ mobile compaction block 的既有 contract。 |
| `scripts/check-workflows.mjs` | cache version bump 会要求 `frontendAssetVersion` 更新到 `28.0M-93AV`;owner 已允许仅通过官方 bump 工具更新该常量值。 |

## Section 8 · 移动端约束

M-93A 不承诺普通摘要完整塞入首屏之内;它承诺新增 section 本身简洁、可扫读,并且不破坏 M-92A+ 已经锁定的 hero/nav/macro header mobile compaction contract。

| viewport | 目标 |
|---|---|
| 桌面 `1440x900` | `plain-summary-card` 总高度建议 `<= 500px`;hero 和 jump nav 后能看到完整普通摘要或大部分摘要。 |
| 移动 `375x667` | `plain-summary-card` 总高度目标 `<= 400px`;用户一屏内读完 6 个核心元素,但不要求同时看到下一段专业模式。 |

CSS 边界:

| 项 | 要求 |
|---|---|
| mobile block | 新增独立 `@media (max-width: 640px)` 中的 `.plain-summary-*` 规则,不得混入 M-92A+ today-summary 或 hero/nav compaction block。 |
| 布局 | 桌面可用 2 列或紧凑 grid;移动必须单列,稳定宽度,不让长文本撑破按钮或 pill。 |
| 字号 | 标题建议 24-32px 桌面、22-26px 移动;正文建议 15-17px;不使用 viewport-width 字号。 |
| padding | 桌面可 24-32px;移动建议 14-18px。 |
| 风险 pill | 只显示 5 级 enum,不附带英文、不附带原始小数。 |
| top risks | 最多 3 条,每条短句;不显示 ticker、单位、百分比、小数。 |

V3 必须用 Playwright 验证桌面和移动实际高度;如果移动高度超过 `400px`,应优先缩短普通摘要文案和 spacing,不得通过隐藏现有专业模式来达标。

## Section 9 · V3 implementation 文件清单（V2 仅记录，不实施）

V2 阶段只创建本 spec。下面清单供未来 V3 implementation 使用,不表示本阶段已经或应该修改这些文件。

新增文件 3 个:

| 文件 | 作用 |
|---|---|
| `scripts/modules/renderPlainSummary.js` | 独立普通摘要 renderer,包含翻译表、阈值映射和渲染函数。 |
| `scripts/check-plain-summary-card-contract.mjs` | 新 bounded checker,只检查 Section 5 定义的 3 个区域。 |
| `docs/PLAIN_SUMMARY_M93A_V2_SOURCE_REVIEW.md` | 本 spec;V2 阶段唯一产出。 |

修改文件清单:

| 文件 | V3 改动范围 |
|---|---|
| `index.html` | 在 jump nav 后、`#macro-risk-overview` 前新增 `#plain-summary-card` 容器;cache version `28.0M-92AV -> 28.0M-93AV`。 |
| `assets/styles.css` | 新增 `.plain-summary-*` selector 和独立 mobile block;不改现有 `.today-summary-*` / M-92A+ compaction block。 |
| `scripts/app.js` | 新增 `renderPlainSummary` import 和一次调用;cache version bump。 |
| `scripts/check-suite.mjs` | 注册新 checker。 |
| `package.json` | 新增 `check:plain-summary-card-contract` script。 |
| `scripts/modules/*.js` 既有文件 | 仅由 cache bump 工具更新本地 import query string;不得改逻辑。 |

### 9.X · Frontend Asset Version Cache Marker 豁免

Owner 拍板的 V3 豁免: 允许通过官方工具一次性原子更新 frontend asset cache version 字符串。

必须使用的命令:

```powershell
node scripts/bump-frontend-asset-version.mjs 28.0M-93AV
```

严格条件:

| 文件 | 允许变化 |
|---|---|
| `scripts/check-workflows.mjs` | 仅 `frontendAssetVersion` 常量值从 `28.0M-92AV` 改为 `28.0M-93AV`;不得改 contracts 数组、forbiddenRuntimePatterns 或任何断言逻辑。 |
| `README.md` | 仅 frontend asset version 引用文字;若工具无匹配项则保持 unchanged,不得手工补改。 |
| `AGENTS.md` | 仅 frontend asset version 引用文字行;不得改规则、约束、流程或 defaults。 |
| `docs/OPERATIONS.md` | 仅 frontend asset version 引用文字行。 |
| `docs/DATA_CONTRACT.md` | 仅 frontend asset version 引用文字行。 |
| `workers/gfrr-realtime-worker/README.md` | 仅 frontend asset version 引用文字行。 |

V3 跑 bump script 后必须立即执行:

```powershell
git diff --stat
git diff -- scripts/check-workflows.mjs README.md AGENTS.md docs/OPERATIONS.md docs/DATA_CONTRACT.md workers/gfrr-realtime-worker/README.md
```

如果上述 6 个豁免文件出现版本字符串以外的任何字符变化,必须立即 pause。

基于当前 grep 证据,cache version bump 影响文件如下:

| 类别 | 文件 |
|---|---|
| HTML/CSS/entry | `index.html`, `scripts/app.js` |
| workflow checker marker | `scripts/check-workflows.mjs` |
| module import query | `scripts/modules/config.js`, `scripts/modules/decision.js`, `scripts/modules/displayTextBuilders.js`, `scripts/modules/freshness.js`, `scripts/modules/health.js`, `scripts/modules/realtime.js`, `scripts/modules/render.js`, `scripts/modules/renderAudit.js`, `scripts/modules/renderCharts.js`, `scripts/modules/renderExternalAi.js`, `scripts/modules/renderMacroOverview.js`, `scripts/modules/renderTables.js` |
| docs/cache marker | `AGENTS.md`, `docs/OPERATIONS.md`, `docs/DATA_CONTRACT.md`, `workers/gfrr-realtime-worker/README.md` |
| official fixed target but current grep no `28.0M-92AV` hit | `README.md` |

当前 grep 证据显示 19 个文件存在实际 `28.0M-92AV` 或 frontend asset marker 命中;`README.md` 是官方 bump 工具固定目标,但当前未见可替换版本命中,V3 不得为让它变化而手工编辑。

重申严格不动范围: `data/*.json`、`realtime/*.json`、`workers/` runtime、`.github/workflows/`、`CLAUDE.md`、`DESIGN.md`、`docs/INDEX.md`、所有现有专业模式 DOM 和除 `scripts/check-workflows.mjs` 版本常量外的所有现有 checker 逻辑。

## Section 10 · V3 validation 标准（V2 仅记录，不实施）

V3 implementation 完成后必须验证下面项目。V2 阶段不运行 Playwright、不运行 `npm run check:all`,因为本阶段不改代码。

| 验证项 | 要求 |
|---|---|
| `npm run check:all` | exit 0;包含新增 checker;旧 suite 数量以 `package.json` 当前 `check:all` 为准,不得写死。当前只读核对为 23 个 top-level suites。 |
| 现有 checker | 所有既有 check suite PASS;不得为了普通摘要放宽现有 checker。 |
| 新 checker | `npm run check:plain-summary-card-contract` PASS;bounded 扫描范围符合 Section 5。 |
| Playwright 桌面 `1440x900` | `#plain-summary-card` 6 个核心元素可见;禁词列表 0 命中;不遮挡 `#macro-risk-overview`。 |
| Playwright 移动 `375x667` | `#plain-summary-card` 总高度 `<= 400px`;禁词列表 0 命中;文字不溢出、不重叠。 |
| 8 种数据状态 | 用 M-92A 8 个 state 对应的典型数据场景渲染普通摘要,都不输出禁词、缩写、小数和操作建议。 |
| data diff | `data/*.json`、`realtime/*.json` git diff 为空。 |
| authority docs diff | `CLAUDE.md`、`DESIGN.md`、`docs/INDEX.md` git diff 为空。 |
| cache marker docs diff | `AGENTS.md`、`docs/DATA_CONTRACT.md`、`docs/OPERATIONS.md`、`README.md`、`workers/gfrr-realtime-worker/README.md` 只允许 frontend asset version 字符串变化。 |
| Worker/workflow diff | `workers/` runtime 和 `.github/workflows/` git diff 为空;worker README 的 cache marker 例外不代表 runtime 豁免。 |
| `scripts/check-workflows.mjs` diff | 只允许 `frontendAssetVersion` 常量值变化。 |

V3 若任何验证失败,修复优先级为: 先修普通摘要新文件和 CSS,再修新 checker;不得通过修改 data、workflow、Worker 或放宽既有 checker 来让验证通过。

## Section 11 · Separate optional docs-drift item

当前 `docs/PROJECT_BACKLOG.md` Section 1 仍记录:

| 字段 | 当前文档值 | 实际上下文 |
|---|---|---|
| 当前生产状态 | `v28.0M-91 Market Pricing NDX/IXIC auxiliary implementation` | V1 审计时前端已是 `28.0M-92AV`,PR #244 已合并 V1 报告。 |
| Cache version | `28.0M-91V` | `index.html`、`scripts/app.js` 当前为 `28.0M-92AV`。 |

修复建议: 另开一个独立小 PR,或在 V3 implementation 完成后作为最后一个独立 commit 修复该 docs-drift。该修复不得与 M-93A 主实施 commit 混合,不得顺手改 backlog 其他段落。

本 V2 spec 不修改 `docs/PROJECT_BACKLOG.md`。owner 可选择是否合并该漂移修复;即使暂不合并,也不阻塞 M-93A 主实施。

## Section 12 · 失败回滚预案

M-93A 是新增式 frontend display-only 改造,回滚成本应保持低:

| 回滚项 | 操作 |
|---|---|
| HTML | 删除 `#plain-summary-card` section 容器。 |
| JS | 删除 `renderPlainSummary` import 和调用;删除 `scripts/modules/renderPlainSummary.js`。 |
| CSS | 删除 `.plain-summary-*` selector 和独立 mobile block。 |
| checker | 删除 `scripts/check-plain-summary-card-contract.mjs`;从 `package.json` 和 `scripts/check-suite.mjs` 移除注册。 |
| cache version | 若 V3 已发布 `28.0M-93AV`,回滚 PR 需要按同一官方工具 bump 到新的回滚版本,不得手工拼回旧 module graph。 |
| docs | 保留本 V2 spec 作为历史设计记录;除非 owner 明确要求,不删除已合并 spec。 |

不需要 data migration,因为 M-93A 不改 `data/*.json`。不需要 Worker rollback,因为 M-93A 不改 Worker runtime、KV、workflow 或 provider 调用。若上线后普通摘要不够清楚,优先追加 translation table 和文案规则的小步 PR,不要在同一回滚中重写专业模式。
