# ARR：Epoch AI 免费来源评审与隔离核验

## 结论与本轮范围

2026-09-08，owner 明确不购买 Sacra；在建议改用 Epoch 免费来源评审及隔离验证后，批准 PR #310 独立 AI 审阅合并并直接开始下一刀。本任务基于合并后的 main `ec0cd27d6f771e3f554b28c0368833644646ab8c`，沿用单项 commit + push。

**免费程序读取渠道及真实 CSV 已核实；ARR 生产替换尚未通过。** 本轮只有公开来源评审、一次性内存核验和文档交付，没有新增定时抓取器、解析器或 runtime 配置，没有修改灯色、curated、评分、生产 JSON 或工作流。#310 的 AI 代人工例外不延伸到本 PR。

Sacra 不再是本任务的付费方案，不注册账户、不购买、不调用其 API，也不绕过付费墙。现有生产路径保留；本结论不声称 Epoch 与 Sacra 完整数据库等价。

## 来源与许可依据

- [Epoch AI 数据页](https://epoch.ai/data/ai-companies)：明确提供收入 CSV 和程序读取示例；来源包括公司披露与公开报道，而非专有数据库。页面及[下载目录](https://epoch.ai/data/ai-companies-documentation/downloads)标注收入表更新日为 2026-08-31。
- [官方概述](https://epoch.ai/data/ai-companies-documentation)：说明数据可免费使用、分发、复制，要求署名；其每日更新描述不是每天存在新收入观测的承诺。
- 数据页许可链接指向 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，[完整条款](https://creativecommons.org/licenses/by/4.0/legalcode.en)要求保留署名/许可/免责声明等适用信息，标明修改，不暗示背书；仅覆盖许可方有权授予的权利。
- [字段说明](https://epoch.ai/data/ai-companies-documentation/records)区分 `Date`（数据所属日期）、`Report date`（报道日期）、来源与可信度。收入表仍须按实际 schema 验证，不能只照网页字段列表编写解析器。

这为低频读取官方 CSV 提供了明确依据，不再把“联系 Sacra 取得自动访问许可”当成本路线前置条件。Epoch 的许可不能转授 Bloomberg、FT 等链接目标的自动访问权；不跟随源链接批量抓取、不复制第三方报道全文。公开报告优先保留事实字段、必要出处和限制，避免重发 Notes 中的长引文。

署名基线：Josh You、John Croxton、Venkat Somala、Yafah Edelman，Epoch AI，*Data on AI Companies*；链接官方数据页及 CC BY 4.0，标注获取日期。此文只列字段核验结果与风险分类，属于对原数据的筛选和概括，不是原始收入表，也不代表 Epoch 背书。本轮不发布 CSV/Notes 原文。

## 一次性真实读取回执

用户批准的隔离验证采用保守预算：一个官方 CSV GET、15 秒中止、1 MiB 解码前流式容量上限、不跟随重定向、不重试、不提供凭证。解析限制 1,000 数据行、32 列；不写原始文件、不访问记录中的来源链接。

| 项 | 实测 |
|---|---|
| URL | `https://epoch.ai/data/ai_companies_revenue_reports.csv` |
| 获取时间 | `2026-09-08T06:41:39.902Z` |
| HTTP / 类型 | `200` / `text/csv` |
| 大小 / SHA-256 | 40,898 bytes / `f0297f9f9c38bde55f0ff74b0f768dab82d05f1a09cb7ca30fe60dd8c8796b9e` |
| 结构 | 67 数据行、18 列；严格 CSV 解析通过，表头无重复，记录列数匹配 |
| Anthropic 记录 | 18 条；按原始类别计：14 条公司整体年化 run-rate、1 条公司整体 ARR、2 条全年收入、1 条产品/部门 run-rate |
| 网络 / 文件副作用 | 1 次真实数据请求；没有保存原始表，没有生产写入或付费调用 |

首次在本机通过 CommonJS 加载 bundled artifact-tool 失败，发生于网络请求前，不计作数据重试；随后使用 bundled Node 有界获取及 bundled Python 标准库严格 CSV 解析，退出 0。未安装依赖。解析和原始数据只存在该进程内存，因此 hash 是本次响应身份，不代表仓库保存了可重放原件；未来验证须明确新响应的 hash/版本差异。

真实表头依序为：`Id`、`Company`、`Date`、`Annualized revenue (USD)`、`Annualized revenue type`、`Scope`、`Revenue amount (normalize to annual)`、`Period revenue`、`Period type`、`Other revenue info`、`Confidence`、`Source 1`、`Source 2`、`Source 3`、`Notes`、`Report date`、`Source type`、`Graph note`。

本次只证明渠道可用、响应身份及结构和候选差异；没有独立核验全部收入事实、日期精度、全表去重或来源独立性。结构通过不是生产验收。

## 与现有 ARR 的实测差异

现行 [builder](../scripts/build-bubble-watch.mjs) 的 `fetchArrSecondDerivativeFromSaastr` 固定读取四个已审文章 ID；要求至少四期、相邻间隔大于半个月且收入递增，再比较最后两段月增量比。底层观测仍受 45 天门槛约束。[现行 parser](../scripts/bubble-watch/arr-milestone-parser.mjs) 只服务已审 SaaStr 主张，不能直接用来处理任意新增文章。以下不改变这些算法或边界。

| 实测例子 | 不可直接替换的原因 / 后续处理 |
|---|---|
| 最新公司 run-rate 行 `Date=2026-07-31`，`Report date=2026-08-17`，`Confidence=Likely` | 9 月 8 日距行日期 39 天，距报道日期 22 天；只能作为待审候选，不能用报道/下载/目录日期续命。须核对 7 月末是实际观测还是月份锚点；若仅知 7 月，须保留区间并按最早可能日期评估时效 |
| 另一行 `Date=2026-05-15`，官方来源链接为 Series H，`Report date=2026-05-28` | 字段日期相差 13 天；本次未证明 5 月 15 日是精确收入观测。不得静默改成发布日期，也不得把它当已证实点日期计算斜率 |
| `Scope=Product/division` 的 Claude Code 行 | 不能借 `Revenue amount (normalize to annual)` 补成公司整体值；该行公司整体年化字段实际为空 |
| 两条 `Period type=Year` 的全年收入 | 不是时点 run-rate，不年化补位，不与同日 run-rate 相加或互相覆盖 |
| `Annual recurring revenue (ARR)` 与 `Annualized run rate` 同表 | 指标需分别保留，未经等价审阅不混算；同样不能加入未来可能出现的季度乘四推算 |
| `Source type=Company disclosure,Media report` | 实际存在多标签字符串，虽然网页将它描述为单选；不能按单标签假设静默丢行或一律当官方披露 |
| 早期公司 run-rate 低于当前 parser 的 1B 下界，且早期序列不始终递增 | 不能放宽现行范围/递增断言来吞下全表；选择新观测窗口属于后续显性方法审阅 |
| Notes、其它收入说明和 Graph note 含条件或近似表述 | 简单关键词命中只能提示复核，不足以区分该收入主张与同段未来计划；“未命中”也不能证明精确历史值。不得依靠关键词扫描自动授予 point/actual 资格 |

`Source 1/2/3` 是出处线索，三个链接不等于三个独立事实来源；Epoch 与其引用的公司公告也是分发与原始出处关系，不能双计独立印证。`Id` 为短描述，不应未验证就假设为永久唯一 ID。URL 中实际有尾部空格及查询参数，归一化需显性保留来源身份；不能将任何该列内容直接作为抓取目标。

## 后续实现的归属与验收基线

本节是后续提案，不创建新 registry 或开启生产。依据[统一数据架构](UNIFIED_DATA_PIPELINE_ARCHITECTURE.md)：

| 字段 | 候选值 |
|---|---|
| sourceKey / sourceDomain | `epoch_ai_company_revenue_candidate` / `epoch.ai` |
| assignedLayer | `artifact_sanitizer_layer` |
| primaryOwnerLayer | 未来由既有 Bubble Watch builder / 周度刷新负责，归 `daily_history_layer`；不另建独立定时链 |
| freshnessCadence | 低频文件变化检测；观测 freshness 独立按收入所属时间检查，不按文件日期 |
| artifactOnlyBeforeProduction / sanitizerRequired / productionWriterRequired | 全部 true |
| sourceComplianceStatus | 官方 CSV 免费程序读取及署名依据已核实；第三方全文权利不继承，生产署名投影待审 |
| fallbackPolicy | 失败、未知枚举、日期/口径不明确时保留旧生产数据和原日期，不刷新灯色 |
| affectsScoring / affectsDecisionModel / affectsExecutionLock / affectsPositionGuidance | 本刀全部 false；以后接 `arr_2nd_deriv` 会影响 Bubble Watch Core-23 专题主分，必须另审，不能以 GFRR display-only 掩盖这一点 |

1. **先完成 offline sanitizer**：独立候选输出，强制 `productionEligible=false`，无网络、灯色、斜率或 writer。输入记录保留公司、范围、原始指标/单位、金额限定、观测区间和日期精度、报道日期、来源角色、修订 hash；未知明确保留 unknown/hold，而不是自行补点值。
2. **补齐回归再读新样本**：CSV 引号/多行/空值/重复表头/错列/超限；实际多标签及未知标签；公司与产品混用；全年/季度/ARR/run-rate 混用；缺失日期、月份锚点、未来日期、45 天边界；下限/估计/预测/更正；重复键与冲突修订、同源转载、原文及 URL 不外泄。不能用测试 fixture 代替真实证据核验。
3. **读取器另做窄范围实现**：只允许固定官方 CSV，短超时/容量上限、脱敏异常、无凭证、无跨域跳转；默认离线，不抓 `Source 1/2/3`。同 hash 可跳过处理但不更新观测时间；hash 变化触发差异审阅，不 last-write-wins 覆盖更正。不得为省下载忽略旧期修订。
4. **生产前单独审阅方法与发布**：明确是否保持/修改四点窗口、半月间隔、递增要求与金额上下界；验证日期区间及限定金额对斜率的影响，必要时弃权。保留 45 天底层时效、旧快照回退、出处/署名及修改披露；不导出第三方引文，不以人工候选覆盖 deterministic 输出。

目前可继续做免费候选 sanitizer；不需要先购买 Sacra，也无需为本轮官方 CSV 读取额外索取书面许可。仍未完成：可靠的逐条口径/日期/限定词验证、持续自动更新实现、生产方法与来源切换审阅。不能把“CSV 可自动下载”说成“ARR 已实现全自动生产更新”。

## 2026-09-08 离线候选 sanitizer 实施

Owner 已批准仅 #311 独立 AI 替代人工审阅，通过后合并并继续校验器、测试及 commit+push。#311 固定 head `1fe16579` 审阅无阻断，已合并为 `709b234f`；[独立审阅回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/311#issuecomment-5581217720)。该例外不扩展到本次实施 PR。

实现为 [`epoch-arr-candidate.mjs`](../scripts/bubble-watch/epoch-arr-candidate.mjs) 的纯离线函数和 [`review-epoch-arr-candidates.mjs`](../scripts/review-epoch-arr-candidates.mjs) 的 stdin/stdout CLI。用法：将**已获准持有**的 UTF-8 CSV 内容通过 stdin 传入 `node scripts/review-epoch-arr-candidates.mjs --as-of YYYY-MM-DD`（日期须替换成实际审阅日）；没有路径、URL、网络或写入参数。npm 入口为 `npm run review:arr-epoch-candidates -- --as-of YYYY-MM-DD`，机器解析 JSON 时直接调用 node，避免 npm 自身输出混入。

- 输入固定为上述 18 列及顺序，最多 1 MiB、1,000 数据行、每格 16,384 字符；支持 BOM/CRLF、引号、逗号、转义和多行格。缺列、重复/未知/重排表头、坏引号、非法 UTF-8 或超限时整份拒绝，CLI 仅输出固定错误码并非零退出，不输出原始异常。
- 仅投影 Anthropic；公司整体年化、归一年化、期间收入分别保留 USD 数字，不互相补位、不季度乘四。空值是 null，0 保留为 0 并 hold；run-rate、ARR、产品/全年/季度及未知枚举明确分开。金额范围只作现有 1–80B 运行边界提示，不修改该边界。
- 日期只保留合法的表列日期与报道日期；缺失不填补，未来/倒置日期 hold。`dateAgeDiagnostic` 按原 45 天规则只描述**行日期年龄**，即使显示 fresh，观测区间仍为 null、precision 为 unknown，绝不表示底层观测已核实新鲜。
- 限定词、预测/历史场景、来源证据、独立性始终 unknown/unverified；不会从 Notes 关键词有无推导精确点值。所有候选恒定 `productionEligible=false`，无斜率、灯色、评分或 writer。
- 原输入与每行保留 SHA-256；完全重复合并并保留 CSV 记录序号，同描述键冲突修订同时保留，疑似同观测不同描述也 hold。只做单快照诊断，跨快照修订比较尚未实现。URL 仅本地检查 HTTPS 后保留 hash，不读取目标，不输出原 URL/Notes/Graph note/其它收入说明/原 Id。hash 是比对标识，不证明来源真实性、许可、独立性，也不提供加密保密保证；输入明确标记 `caller_supplied_unverified`。
- 候选带 Epoch 数据集及 CC BY 4.0 归属提示、修改说明；这不是对任意 stdin 来源的认证，也不是生产署名投影或第三方全文再发布许可。结构成功退出 0 仅表示产生待审报告，不表示可晋升；无目标行明确 `no_target_rows`。

回归见 [`epoch-arr-candidate.test.mjs`](../tests/unit/epoch-arr-candidate.test.mjs)，使用自行编写的 synthetic CSV，包含 stdin CLI 无网络 dry-run，纳入既有 `check:bubble-watch` / `check:all`，没有删除或放宽旧断言。本轮未再下载真实 CSV，因此不声称已回放上节 67 行真实快照或完成逐条经济口径复核。

下一步仍是单独审阅并实现固定官方 CSV 有界读取器及跨快照差异；持续运行、生产方法与切源另审。本次不修改 SaaStr builder、curated、生产 JSON、调度或 Core-23。
