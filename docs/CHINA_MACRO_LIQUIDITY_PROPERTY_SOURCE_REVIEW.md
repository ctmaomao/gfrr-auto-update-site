# China Macro Liquidity / Property Evidence Source Review(docs-only · source-review）

> **Source-review only。** docs/backlog 候选登记,**不写 fetcher、不接 runtime、不改 `data/*.json`、不改 frontend、不触发 GitHub Actions、不进 scoring/decision/execution/position**。
> **触发**:2026-05-29 Codex 可接入性分析推翻 C6 China Macro 旧结论「央行 SLO/MLF/OMO 原始 tape、社融组件分项、70 城房价原始数据均不可达」。
> **候选层命名**:**China Macro Liquidity / Property Evidence Layer**(若未来实现,必为 audit-only / display-only)。
> 沿用 `BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md` / `CHINA_V2X_SOURCE_REVIEW.md` 模板与边界纪律。

调研日期:2026-05-29。Claude 设计/边界复核 + Codex 可接入性实证分析。本文**不批准** live fetch、不写生产数据、不改 scoring。

---

## 0. 结论修正(从「均不可达」到三分类)

旧表述(C6 China Macro 类目 intro + 历史认知):

> 央行 SLO/MLF/OMO 原始 tape、社融组件分项、70 城房价原始数据均不可达。

**修正为三分类**:

1. **官方逐机构 / 逐笔投标级 raw tape 仍不可达。**
2. **官方操作级 / 公告级 / 指数级公开数据是可达的。**
3. 因此可作为 GFRR 的 **China Macro Liquidity / Property Evidence Layer** 候选,先做 **audit-only / display-only** source-review,**不进入主风险评分链路**。

> 注:C6 前端 intro 仍写「…均不可达」,与本结论不一致;**frontend 改动本次不做**(docs-only),列为未来 frontend stage 的待办(见 §7)。

---

## 1. 可接入(官方操作级 / 公告级 / 指数级公开数据)

| 数据 | 口径(公开层) | 公开内容 | 示例 | Source(官方公开页) |
|---|---|---|---|---|
| **OMO 公开市场操作** | 操作级 / 公告级 | 操作日期、期限、利率、投标量、中标量 | 2026-05-29 第 102 号,7 天期逆回购,1.40%,1230 亿元 | `https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/125475/2026052908453642546/index.html`(央行「公开市场业务交易公告」) |
| **MLF 中期借贷便利** | 操作级 / 公告级 | MLF 招标公告 / 操作表(期限、规模) | 2026-05-25 开展 6000 亿元 1 年期 MLF | `https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125437/125446/125873/2026052217453752767/index.html`(央行 MLF 招标公告) |
| **社融组件分项** | 统计报告级 / 分项级 | 社融存量 / 增量分项:人民币贷款、外币贷款、委托贷款、信托贷款、未贴现银承、企业债、政府债、股票融资等 | 央行金融统计数据报告月度分项表 | `https://www.pbc.gov.cn/diaochatongjisi/116219/116225/2026051417030520490/index.html`(央行金融统计数据报告) |
| **70 城房价** | 指数级 / 城市级 | 月度城市级新建商品住宅 / 二手住宅销售价格指数表(同比/环比指数) | NBS 月度 70 城价格指数 | `https://www.stats.gov.cn/sj/zxfbhjd/202604/t20260416_1963320.html`(NBS 70 城价格指数页) |

- 全部为**官方机构自身公开页**的操作公告 / 统计报告 / 指数表,非第三方聚合、非订阅 feed。
- 频率:OMO 工作日级、MLF 月度(操作日不定)、社融月度、70 城月度。
- 这是**公告级/指数级**口径 —— **不是** raw tape(见 §3)。

## 2. 仅历史 / 低频 / inactive(可登记但须标 inactive)

| 数据 | 现状 | 标记要求 |
|---|---|---|
| **PBOC SLO(短期流动性调节工具)** | 央行曾披露历史 SLO 操作公告,公开规则称结果滞后约一个月披露;当前公开索引看起来**不属于常态化实时 source**(无近期常态操作) | 必须标 `historical` / `inactive` / `no_recent_operation`;**不得伪装为实时稳定数据源**;若未来登记,只能作历史/低频证据,缺近期操作时显式 inactive,不得伪造或冒充实时值 |

> ⚠️ **PBOC SLO ≠ Fed SLOOS**。PBOC SLO 是中国人民银行的「短期流动性调节工具」(公开市场操作家族);Fed SLOOS 是美联储「Senior Loan Officer Opinion Survey」(银行贷款官员意见调查,已通过 FRED `DRTSCILM`/`DRTSCIS` 接入 `macroDrivers.credit`)。两者**完全不同**,字段命名 / 文案 / notes 绝不得混淆或互相暗示。

## 3. 仍不可达(raw tape / 微观底层)

- 央行**逐机构投标、逐成交、逐交易对手 raw tape**。
- **社融贷款底层微观明细**(机构级/笔级)。
- **70 城真实成交微观价格 / 房源级原始成交数据**。

公告级 OMO/MLF、分项级社融、指数级 70 城价格**永不得**被写成上述 raw tape;字段名/前端文案/notes 不得暗示存在底层微观明细。

## 4. 候选层定位 + 硬边界

**候选层**:`China Macro Liquidity / Property Evidence Layer`(proposed,未实现)。若未来实现,**必为 audit-only / display-only**,边界与现有 macro evidence 层(M-69~M-85、CHINA_V2X、ChinaBond/CFETS)一致:

- **不接入** `scoring` / `decisionModel` / `executionLock` / `positionGuidance` / `Action Queue` / `Trigger Monitor` / `Invalidation Rules`。
- **不进** `values.*` / `displayInputsBaseline` / `effectiveDisplayInputs` / `cross-validation matrix`。
- 公告级/指数级 ≠ raw tape(§3);**绝对不得**伪造为逐机构/逐笔/房源级原始数据,字段名/前端文案/notes 都不得暗示替代关系。
- **PBOC SLO ≠ Fed SLOOS**(§2)。
- 本 review **不批准** live fetch / runtime 接入 / 生产数据写入 / frontend 改动 / workflow 触发。任何未来实现须各自**另开 stage 走完整复核流程**(outline → 实证 → brief → 复核 → 实施 → diff 复核)。

## 5. 实施分层建议(未来 stage,优先级 owner 定)

- **最干净先做**:70 城房价(NBS 指数表,与 6C NBS 抓取纪律同源,HTML 表解析)、OMO 公告(结构化公告页,字段固定)。
- **次之**:MLF 公告(操作日不定,需 release-discovery)、社融分项(月度报告多分项表,解析量大)。
- **最后/可选**:PBOC SLO 仅作历史/inactive 登记,不追实时。
- 跨类:本层若落地,**新建** `macroDrivers.*` evidence 块(命名待定,如 `chinaMacroLiquidity` / `chinaPropertyPrice`),**不扩写** 现有 `macroDrivers.credit` 或 World Order。

## 6. 抓取纪律(若未来实现,沿用 ISM/Redbook/NBS 纪律)

- 低频 + 按日期缓存 + UA `GFRRBot/1.0`;不绕 SSO/captcha;只取所需 headline/表格,不存全 HTML;只用从官方页发现的显式端点 URL,绝不广扫站点路径。
- **Fail closed**:空记录 / schema 变化 / 非 200 / 解析失败 / 超期 → `source_unavailable` / `parse_error` / `inactive`,**不得伪造缺失值、不得把 stale 当 live**。
- 保留 source 标签:`PBOC:OMO-announcement`、`PBOC:MLF-announcement`、`PBOC:SReFin-report`、`NBS:70city-price-index`、`PBOC:SLO-historical`。
- 私用非商业姿态;法律/ToS 对本用途非阻断,但须低频 + 缓存。

## 7. 待办 / 注

- **C6 前端 intro 勘误(延后,frontend stage)**:`index.html` C6 类目 intro 仍写「…央行 SLO/MLF/OMO 原始 tape、社融组件分项、70 城房价原始数据均不可达」。本次 docs-only **不改 frontend**;未来若做 frontend,应改为「逐机构/逐笔/房源级 raw tape 不可达,操作级/公告级/指数级公开数据可作 audit-only 候选」类措辞。
- 本文为 source-review,**无代码改动、无 runtime、无 data 写入**。

---

## 结论

C6 旧结论「均不可达」**过严**:逐机构/逐笔/房源级 **raw tape 确实不可达**,但**操作级 OMO、公告级 MLF、分项级社融、指数级 70 城房价是官方公开可达的**,可作为未来 **China Macro Liquidity / Property Evidence Layer** 的 audit-only / display-only 候选;PBOC SLO 仅历史/inactive。任何实现须另开 stage,且永不进 scoring/decision/execution/position。本次仅 docs/source-review 登记。
