# Project Backlog · GFRR Auto-Update Site

本页只保留当前工作、未解依赖与维护入口。已完成任务的过程见[历史交接与完成原件](MILESTONE_INDEX.md#immutable-handoffs)。旧“待合并/下一步”不覆盖下方已核实的 main 状态，合并也不自动证明生产验收完成。

<a id="brave-private-manual-one-shot-acceptance-baseline--november-18-2026"></a>
<a id="brave-private-proof-continuity-acceptance-baseline--november-18-2026"></a>

**Brave 常规恢复验收基线（切换前；现况见[来源质量](#active-worktable)）**：改由同一已核 Search Postpaid 计划的 Free credits only 执行唯一扣费硬停，现有私有证明只用来匹配实际 Actions key；不改计费或原账本、不续期、不预留、不发实时试探请求。常规配置默认关闭。核验当前保护与同一 key 后，独立审查通过才仅打开 Oil News 自然排程，观察 Brave 有结果或明确只停 Brave、Tavily/GDELT 原路径仍有效。其余路径不随本次切换启用；未产生自然回执不得称生产验收。详见[运行说明](OPERATIONS.md#shared-editorial-budget-and-free-search-admission)。

**Brave 单次验收与当时边界（历史）**：[手动免费 canary 44252310781](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44252310781) 的只读预检和单次测试均成功，仅验收这次测试，当时未恢复五个业务工作流的 Brave 调用；[#748](https://github.com/ctmaomao/gfrr-auto-update-site/pull/748) 仅离线演练并保留已耗 canary，不授权重跑。原证明、账本历史和收据保留，不变更计费设置。参见 [ADR-0111](ADR/0111-brave-shared-free-only.md#one-fixed-private-manual-canary-separate-from-business-restoration)和[固定版原验收基线](https://github.com/ctmaomao/gfrr-auto-update-site/blob/989d67b650903e461d16d38916594ddda84dc37a/docs/PROJECT_BACKLOG.md#brave-private-manual-one-shot-acceptance-baseline--november-18-2026)。

**Brave 官方 Oil News 单次手动搜索（历史）**：本次范围只包括一次手动官方来源发现，不恢复旧 canary 或五条常规调用，不改变计费或扣费上限。先校验此前私有证明与账本收据、当期免费硬停、对应运行 SHA 与固定 EIA RSS 发布源；只读预览不调用 Brave 或写账本。实际运行仍按同一账本预留并结算一次：只有可核实的同一份 EIA 首发来源可输出一条官方链接和发布日期；无合格命中则如实记录无匹配，不保存 Brave 标题、结果链接、摘要或响应。暂不接入站点产物、事件确认、油价或风险分；不得自动开启后续调用。离线检查不等于私有配置、生产预览或实际查询已完成。

## Section 1 · 维护状态

历史核对：11/18 main `08e3f137` 的 #637–#640 Daily／双站见[验收快照](#recent-data-fix-acceptance)；11/15 main `d14055f7` 覆盖 #503、#569–#577。原过程见[收口前固定版本](https://github.com/ctmaomao/gfrr-auto-update-site/blob/7a23c8d4911b7a35c5a17e6e01c6fcf9e606698c/docs/PROJECT_BACKLOG.md)；当前状态以[单一工作表](#active-worktable)为准。

| 项 | 当前依据 / 职责 |
|---|---|
| Release/display version | `v28.0.10`；以 package.json / release 定义为准 |
| Data/decision contract version | `data.version` / `decisionModel.contractVersion` 保持 `v27.0`，不可机械同步展示版本 |
| Cache version | [scripts/app.js](../scripts/app.js) 中的 `APP_VERSION` |
| 前端输入 | 首页读取静态 JSON；默认入口与跨页导航见 [DESIGN §4.5](../DESIGN.md#45-周报默认入口与三标签2026-11-09)；`scripts/modules/realtime.js` 冻结、未接入 |
| 雷达主读数 | OFR 已发表 FSI；旧模型保留审计，旧公开仓位/状态/风险预算/动作建议已退役，不把百分位当风险分或概率 |
| Worker / Daily | `/market.worker-preview.json` 是 Worker 主预览，secondary 只作诊断；Daily 仍消费 `realtime-data` |
| 检查组成 | package.json / scripts/check-suite.mjs；不手抄检查数量 |

执行/权限见 [AGENTS](../AGENTS.md)；来源与字段见 [DATA_SOURCES](DATA_SOURCES.md)、[DATA_CONTRACT](DATA_CONTRACT.md)；运行步骤见 [OPERATIONS](OPERATIONS.md)。适用领域规则按 [AGENT_DOMAIN_BOUNDARIES](AGENT_DOMAIN_BOUNDARIES.md) 选择，不全量读取历史。

现有专题入口：**Market Pricing freshness/alignment review**（display-only）、**FOMC Minutes tone/topic quality review**（display-only）、**World Order source-health consistency review**（overlay-only）。这些检查不是取数、付费或发布授权。

## Section 2 · Open Backlog Items

<a id="active-worktable"></a>
### 单一工作表 · 当前推进队列

局部核对：11/25 UTC main `4af16fd6`，仅整理精简项与验收状态；其他行保留各自的证据时间（[核对原版](https://github.com/ctmaomao/gfrr-auto-update-site/blob/4af16fd62da73438102890e632e449a3a4bc0507/docs/PROJECT_BACKLOG.md#active-worktable)）。合并、部署、自然采用分验；新证据更新原行。

| 工作包 / 优先级 | 当前阶段与价值 | 单一职责 / 下一步 | 阻塞与完成标准 |
|---|---|---|---|
| 交付与自然采用 / P0 | 11/26 UTC：[Daily](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45754018510) 04:15 启动，比计划晚 5 小时 45 分；备用行情过期后自动恢复一次，采用约 17 秒前的 `c6433bb3`，发布 `4012915f`（[Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45754584998)／[EdgeOne](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45754584980)）。[World Order](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45756785376) 自动发布 `419acccc`（[Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45757614851)／[EdgeOne](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45757614868)，EdgeOne release `8fe9199`）。两份数据均分别回读双站，与 Git 原件字节一致。 | Daily 已验收自动恢复和双站发布，启动延迟原因未明，继续观察是否按时启动；11/23 周报定时未通过回读；已补发原件（同一期，不重写）。[#763](https://github.com/ctmaomao/gfrr-auto-update-site/pull/763) 保留 r1；[#766](https://github.com/ctmaomao/gfrr-auto-update-site/pull/766) 读者版 r2 已在 [Pages](https://ctmaomao.github.io/gfrr-auto-update-site/reports/2026-11-23-r2.html)／[EdgeOne](https://radar.gfrfinradar.uk/reports/2026-11-23-r2.html) 逐字节验收，r1 未变。下一期 12/01 Auckland 09:00，正文聚焦金融新闻及影响，后台记录另存；按[既有接线与回读](../weekly-reports/README.md#原件构建与发布回读)验自动交付 | [#753](https://github.com/ctmaomao/gfrr-auto-update-site/pull/753) 修复叙事证据门槛；本次发布不验证低分边界。World Order 仍为 `partial`（三个维度仍使用历史 Cloud 代理），双站一致不等于来源都新鲜 |
| Bubble credit / market 独立发布 / P0 | [自然运行 44764158996](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44764158996) 验收：校验后首试推送 `be188d00`，[Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44764967057)／[EdgeOne](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44764946485) 实发；两站与 Git 原件字节一致 | 仅更新独立市场观测及 `credit_spreads`；SHA-256（信用所在文件／市场观测）：`c4e0dff6205e92adda250d43eb9dc287ea4540dff1c9fab76366739d3ed713b4`／`e1dbb899a9bf144c28cb8db0f146f771a9c444c31966d5374326c24d5a27e873` | [#693 限次重放](BUBBLE_CREDIT_DAILY_REFRESH_2026_11_12.md#publication-race-handling) 未触发；全量另见下行 |
| Bubble 全量恢复 / P1 | [自然全量](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45132478128) 第 34 期，11/23 07:40:34.087 UTC；`e1ee31f` 两站实物与 Git 一致。[#764](https://github.com/ctmaomao/gfrr-auto-update-site/pull/764) 修复来源识别与缺口展示，双站页面已验收，未改第 34 期数据 | [独立编辑任务](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45133319498) 在调用 DeepSeek 前停止，单独留待验收。下一次自然全量检查 VC 是否从 Crunchbase 自动采纳同季度全球同口径证据 | 全量数据验收不代替独立编辑或信用重放验收；Neocloud 近期覆盖及可比 ARR 仍不足，不把历史或其他收入口径当新证据 |
| 来源质量 / P1 | Census 9 月手验；[#720 托管](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44846634404) HEAD 200 缺长度、无产物，[#721](https://github.com/ctmaomao/gfrr-auto-update-site/pull/721) 单字节探测待实证。[#722](https://github.com/ctmaomao/gfrr-auto-update-site/pull/722) HKAB／HKMA 仅证据；Daily 已走 [#729](https://github.com/ctmaomao/gfrr-auto-update-site/pull/729) FRED 主路（WALCL／WRESBAL 11/18），[H.4.1](#daily-fed-h41-fallback) 未尝试；[#731](https://github.com/ctmaomao/gfrr-auto-update-site/pull/731) ON RRP 备用待自然 Daily | 油市 EIA：11/26 自然运行两项超时、四项落后一周；[离线回放](../tools/oil-directional/replay-eia-dnav-weekly.mjs) 已核八项同周及历史窗口。下一步验证托管环境的同源备用取数；尚未接生产。依 [Census 月度回执](../.github/workflows/census-import-cost-shadow.yml)核对限额、成员身份、CRC；CARTS/CRE 离线，[H.8](DATA_SOURCES.md#h8-cre-manual-check)仅手验。备用依[运维手册](OPERATIONS.md)验收，不造故障、不强发 EdgeOne | 无效未知不填零，Census 不入油价或评分，HKMA 不改运行或评分。[Oil News](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45063506620) 误记联网；[#745](https://github.com/ctmaomao/gfrr-auto-update-site/pull/745) 仅据实际 HTTP 记请求；[#759](https://github.com/ctmaomao/gfrr-auto-update-site/pull/759)／[#760](https://github.com/ctmaomao/gfrr-auto-update-site/pull/760) 只恢复 Oil News 定时 Brave。[自然运行](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45295877920) Brave 4/4、Tavily 成功、GDELT 仍受限；其余 Brave 调用仍关闭，不改调度、计费或预算 |
| 卫星热观察 / P1 | [自然 FIRMS](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45513830086) 11/24 23:54:36.691 UTC，`55bce65d`；EdgeOne 同源 release `d1a29360`，11/25 双站实物与 Git 一致，SHA-256 `07ea991c9120ae710d734c4294f75266f3580527677f3c2c432c18ff36ecf1e9`。 | NOAA20/21：84 个实际请求，42 个 S-NPP 槽退役未联网；公开产物 102 行、15 个探测框有检出，首轮回执含 97 个去重观测 ID（不同口径）。覆盖／过境／云况未知，不推断运营；旧三源比较仍停 | 按[回溯协议](OIL_THERMAL_RETROSPECTIVE_PROTOCOL.md)验配准、云／热质量、有效分母、独立事件／对照；历史地区／GOES 不证实 VIIRS 覆盖，仅复用既有配对。离线：[#743](https://github.com/ctmaomao/gfrr-auto-update-site/pull/743) 拒绝首尾空白标识、不改写；[#746](https://github.com/ctmaomao/gfrr-auto-update-site/pull/746) 门槛成对且有限（增益 0–1、每百负例容许新增误报 0–100）；缺一或无效不下结论，全省略仅描述。[#756](https://github.com/ctmaomao/gfrr-auto-update-site/pull/756) 已合并离线比较器：回执时间无效保留封存窗口、整组不估计；封存时钟仍须有效，不构成统计验证。不改生产、数据或调度，不增取数、费用、告警、方向或评分 |
| 私有预算与安全恢复 / P1 | DeepSeek 共享预算未初始化；#661 在准入前跳过（见[自然接续回执](#nov-19-natural-adoption)），账本及 proof 代码与真实激活分离 | 主动改进限定单包；复杂约束先独立设计复核，再做最小闭环 | 保留 CNY 10 合并预算、凭据保密、原账本与 receipts；不伪造证据、不绕过 disabled。下方专题及 ADR 是具体步骤，旧自设门槛可审查改进但不得默默绕开 |
| 代码与流程精简 / P1 | [#772](https://github.com/ctmaomao/gfrr-auto-update-site/pull/772) 移除 EdgeOne 只读比较的无用安装；[#774](https://github.com/ctmaomao/gfrr-auto-update-site/pull/774) 收窄 Pages 触发，随后 #773 的纯后台主干提交未触发 Pages。四个历史样本产物未变却多跑共 930 秒，不是未来节时预测。 | [#773](https://github.com/ctmaomao/gfrr-auto-update-site/pull/773) 共用 Realtime 发布脚本，运行代码净减 21 行；两条 YAML 的启动回归由 [#776](https://github.com/ctmaomao/gfrr-auto-update-site/pull/776) 修复，[#777](https://github.com/ctmaomao/gfrr-auto-update-site/pull/777) 在原 CI 中解析全部工作流，实测拦住两处历史错误。 | 11/25 UTC：[Build](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45689641907)／[Recovery](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45689545762) 已分别实际写入备用分支 `f34f71a9`／`1f252b76`；[EdgeOne 自然同树预检](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45687085087) 未安装依赖、未部署。[#770](https://github.com/ctmaomao/gfrr-auto-update-site/pull/770) 仍待纯周报说明提交的自然实例。不造触发；去冗余须证明等效，保留数据、费用、凭据、权限与防并发覆盖／重复发布保护。 |
| 文档与工作表 / P2 | 本表为当前调度入口；历史只保留固定证据入口；Pages/EdgeOne 共用[双站发布排查](OPERATIONS.md#static-publication) | 主动改进维护同一行；周审找矛盾、失效链接和缺口 | 不新建重复总结；当前事实与历史明确分离，仍有效边界不可因归档丢失 |
| Brent 模型研究 / P2 | 研究候选，不是已验证预测或生产评分 | 每日油价研究拥有冻结协议与阶段结论；工程只承接明确实施包 | point-in-time、版本/定义断点、基线与样本外检验齐备；阶段结论允许有效、无增量或不可行，不无限追加特征 |
| 独立审计 / P2 | 周审覆盖全项目盲点及优先级，不复制日检 | 周审检查本表遗漏和验收证据，必要时调整同一队列 | 报告新增风险、已关闭项、真实阻塞；无新证据不重启已完成修复 |

<a id="execution-contract"></a>
### 调度与验收入口

- 每个工作包只保留一个实施负责人和一个独立验收入口；可并行处理互不重叠的小包，main 集成保持串行。例行实施/测试优先最新 Sol，复杂架构、模型论证与独立复核优先最新 Astra；不得以模型名称代替独立证据。
- 调度提示词保留职责、频率、报告条件和本页入口；具体运行号、提交、一次性失败与下一步写入对应工作项。等待自然运行的条目仅在出现新运行或超过合理更新时间后检查，不通过重复 dispatch 制造进展。
- 每轮记录：目标、实际基线、已交付阶段、证据入口、下一步、真实阻塞。合并、CI、部署、自然采用分列；修复完成但自然运行未到，状态为“等待采用”，不是继续重复修复。
- 执行权限与检查规则以 [AGENTS](../AGENTS.md) 为准，日常操作以 [OPERATIONS](OPERATIONS.md) 为准；周报执行以 [weekly-reports/README](../weekly-reports/README.md) 为准。精简提示词不扩展付费、凭据、来源、评分或发布权限，不删预算、失败回报和事实校验保证。
- 紧急风险、费用异常、交付阻断或需要用户决定时及时报告；普通进展合并汇报。无变化不重复通知，研究阴性结论和安全降级也应如实登记。

### 当前实施与真实等待

- **EdgeOne 定时无变化预检（[#670](https://github.com/ctmaomao/gfrr-auto-update-site/pull/670) 已验收自然早退）**：[2026-11-18 20:56 UTC 计划运行](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44396177825) 复核候选 `fed93155` 与发布仓库 `f4999a52` 完整 Git 树一致（`a427ee4e`）；预检含安装约 3.46 秒，publish job 跳过全套、私钥与推送。这一次证据不代表新平台部署或普遍节时；此前 12 个定时 no-op 的安装与全套共 44.4 分钟、中位 216.6 秒。差异或未知照常完整验证，见[双站排查](OPERATIONS.md#static-publication)。油 writer 暂缓：另抽样 24 次均成功，含 2 次独立文件并发的热监测 rebase；仅允许文档会阻断这 2 次，未发现产品错误。

- **Realtime 发布分支探测复用（[#668](https://github.com/ctmaomao/gfrr-auto-update-site/pull/668) 已验收两个自然路径）**：2026-11-18 UTC，[16:35 自动恢复](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44348897398) 推送 `8345e42`；同日后续手动恢复后的 [20:55 计划 Build](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44396116778) 使用同一脚本，生成、校验和非强推发布成功，远端为 `4844db2`。这是两个经确认的发布样本，不保证后续调度不延迟。真实缺基线仍在生成前停止；无匹配分支才可走原建分支路径，Git 探测失败保留失败码。

- **Daily / World Order 发布候选验证去重**：以 main `b003bb12` 为基线，发布和失败回执共用候选父提交、产物路径与文件模式检查。Git 按原始路径识别并发变更，中文文档名不再误判为数据输入，跨范围移动仍触发原保护。保留全量验证、有限重试、输出范围与回执；不重取数据，不变更调度或费用。以本地 Git 回归、独审和精确 CI 验证；[11/19](#nov-19-natural-adoption) 仅验收首次推送正常路径。

- **Transport 离线影响声明去重（[#662](https://github.com/ctmaomao/gfrr-auto-update-site/pull/662) 已合并）**：23 个离线 CLI 共用一份全 false 声明；保留字段顺序和值、新对象独立性及冻结输入的 CLI 输出。不共用不同 schema，不改生产边界。

- **热观察基线 JSON 数值保护**：仅基线配置读入接受有限、非负 JSON 数字，保留真零；空值、布尔、字符串、容器不当作零 P95，缺必要 P95 时不能建立比较；无效策略值使用既有默认。旧全局质量窗口只在其有效窗口字段未提供时沿用，明确缺失/无效的有效窗口保持未知。完整三源合成回放可复现旧缺值被当零后触发重复提示；目前冻结配置 42 行核心 P95 均为数字，S-NPP 退役后的旧三源比较仍暂停，未发现实际生产误报。不新增 FIRMS 请求，不改基线文件、历史、评分、源启用或晋升，专项、独审、全套、精确 CI、部署与未来自然采用分别验收。

- **Bubble 周评最终验证去重（[#658](https://github.com/ctmaomao/gfrr-auto-update-site/pull/658) 已合并）**：成稿后的 `check:all` 只跑一次；调用前仍验证脚本图可达 `check:bubble-watch`。预算、写入锁、质量门禁、产物及调度不变，不为验收触发周评。

- **Bubble 独立信用曲线响应边界**：仅加固现有三条 ICE BofA / FRED CSV 请求（HY、CCC、IG），保持每次 12 秒上限并覆盖完整流式响应、64 KiB 字节上限、禁止重定向/重试，CSV 必须是对应系列的两列。三条官方短样本均为 `observation_date,系列ID`；保留 `DATE`、CRLF、BOM、空白/点缺失和真实零兼容。单源拒绝不冒充新鲜数据，保留该源历史和原时点；不改来源权利、刷新周期、数据历史、评分或编辑调用。专项、独审、全套、精确 CI、部署与下一自然信用刷新分别验收。见[信用曲线运维说明](BUBBLE_CREDIT_DAILY_REFRESH_2026_11_12.md)。

- **银行 CRE 贷款余额精确周参照**：验收基线为 [H.8 / FRED CREACBW027SBOG](https://fred.stlouisfed.org/series/CREACBW027SBOG) 周三观测只比较恰好 28/364 日前的独立有效端点，不取近邻。缺一项不影响另一项；参考值为零不给比率。来源不可用时仅留先前水平和有效原观察日，旧比较不续用。官方 2026-11-04 观察（11 月 13 日更新）仍为 31576.162 亿美元，四周 +0.14%、52 周 +3.81%；合成缺周才复现旧错误，不重写生产历史、不改其它 CRE 系列、请求、评分或工作流。专项、独审、完整 CI、部署和自然采用分别验收。

- **CARTS 48 期参照**：验收基线为名义/实际同比仅比较上年同月同槽，四期均值仅用连续四槽；缺槽、重复或无效不借近邻，缓存只留水平与原观察日，不保留未经验证的比较。FRED 的 07/14/21/28 为芝加哥联储每月四期标签；见[来源说明](DATA_SOURCES.md)。2026-10-28 名义公开实样 615931 对 561937.6，仍为 9.61%；缺槽错误由合成验证，不称旧实样错报。不改外部请求、其他零售序列、发布历史或评分；专项、独审、精确 CI、部署与之后的自然产物分别验收。

- **周报发布链及入口已交付（#644–#648）**：[#644](https://github.com/ctmaomao/gfrr-auto-update-site/pull/644) 加入原件持久交接、固定期次和摘要、Git 端点核验及不可覆盖的日期页；[#645](https://github.com/ctmaomao/gfrr-auto-update-site/pull/645) 将历史、原件下载及四标签置于可再生成的站点入口，不改冻结正文；[#647](https://github.com/ctmaomao/gfrr-auto-update-site/pull/647) 加入同一期独立版号与逐版交接回读，保持固定 URL、历史和回滚约束。对应合并为 `28536984`、`ed2fff7c`、`b3b5bad0`；后两项精确 CI 分别为 [44203221470](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44203221470)、[44205967046](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44205967046)。详见[同一期修订与回滚边界](../weekly-reports/README.md#同一期修订与回滚边界)。

  - **已公开期次**：[#648](https://github.com/ctmaomao/gfrr-auto-update-site/pull/648) 合并于 `07009ac5`。2026-11-16 的 **r3** 已在 [Pages](https://ctmaomao.github.io/gfrr-auto-update-site/reports/2026-11-16-r3.html) 和 [EdgeOne](https://radar.gfrfinradar.uk/reports/2026-11-16-r3.html) 发布。双站共四个固定日期入口均与 45,268 字节原件一致，SHA-256 为 `43263cd4fa687526eea6d601bd329a406b69be5f6239c0114d1a0c3f3dc1d1b1`；双站的最新入口、兼容入口和历史入口也与发布提交对应文件一致。r1、r2 保留在交接链中，未加入站点、不覆盖也不补刊。
  - **发布复核**：[精确 head CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44210966439) 与该合并提交的 [Pages 部署](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44212619899)、[EdgeOne 部署](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44212619657) 通过；独立审阅、手机/桌面、离线及原件下载证据见 #648。此次仅验收已审 r3 发布，**未验收下一次自然定时周报能自动完成生成、持久交接、预期身份校验和双站发布**。定时任务配置已单独核实（见[接线状态](../weekly-reports/README.md#原件构建与发布回读)），配置不等于自然采用，也不以周报发布代替下方 Daily 采用验收。

- **Bubble 发布回执测试夹具固定**：[#646](https://github.com/ctmaomao/gfrr-auto-update-site/pull/646) 已合并 `35392117`，独立审阅与[精确 head CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44201772800) 通过。main `5e6633b3` 自然刷新后，离线测试的固定回执时钟与移动生产快照冲突；改用固定的完整测试快照与来源摘要，并验证未来或缺失的生产快照不影响测试。不改生产 validator、数据、工作流，不回滚刷新，也不授权发布周评或恢复 provider。

- **中国官方数值缺失类型**：仅收紧ChinaBond/CFETS及中国CPI/PPI/PMI缓存共用数值helper，拒绝null、空白、布尔及容器转0/数组转数；真实零、负数及正常字符串保持。无缓存fallback返回missing而非再次解引用抛错，缺失不伪造成0或BIS/SDR零值。当前生产正常值未证明错误；来源、取数、时效、评分及历史不变。当前验收与下一步见[近期修复验收快照](#recent-data-fix-acceptance)。

- **Claims连续周窗口**：ICSA/CCSA四周均值要求连续7日观察，初请变化要求连续8周；缺周不挪用更老行。缓存有可回算窗口证明才续用均值/变化与原时钟，否则仅留水平并重算regime。CARTS共享行均值、来源请求、主评分及生产历史不动。合成缺周会触发旧+25k/明显走弱；当前官方均值195250/1707750正常。当前验收与下一步见[近期修复验收快照](#recent-data-fix-acceptance)。

- **UMCSENT日历月与解释缺失**：前值/3月/6月变化按各自精确月份，不以90/180日最近点伪造；缓存原月/参照回算，无证明不续用变化或稳定标签。保留源要求1个月延迟的观察月，不误报当前Sep48.1/Jun49.5=-1.4。PMI、主评分、请求与历史不动；背离展示check标数据不足并排除平均，规则/交叉验证缺证据时降级。当前验收与下一步见[近期修复验收快照](#recent-data-fix-acceptance)。

- **CPI 日历同比与缓存参照（2026-11-17）**：仅在同一日历月上年观测/紧邻前月存在时计算同比/环比，不以365日附近的相邻月替代；重复月/无效顺序拒绝。原始观察与参照值按headline/core分别保存，仅可回算的缓存比较保留原系列时钟，旧无证明缓存只留指数；不改来源请求、WTI、评分、前端或生产历史。潜在缺陷可离线复现，未证明当前实样错报；当前验收与下一步见[近期修复验收快照](#recent-data-fix-acceptance)。

<a id="recent-data-fix-acceptance"></a>

**#637–#640 验收快照（2026-11-18 UTC）**：四项本地完整检查、专项与独立审阅已通过，PR 已合并，以下精确 head CI 与 merge SHA 的 Pages 部署均成功。**代码交付、自然 Daily 采用与双站产物均已核实；#640 异常值路径仅离线验证**。此前过程文字保留于[本轮修改前固定版本](https://github.com/ctmaomao/gfrr-auto-update-site/blob/23c167856d3c69c0ae5b68d264f76d3301b42d43/docs/PROJECT_BACKLOG.md)。

| 修复 | 已合并 / CI / Pages证据 | 自然采用验收条件 |
|---|---|---|
| [#637 CPI](https://github.com/ctmaomao/gfrr-auto-update-site/pull/637) | `11fe9d2e`；[CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44080248624)；[Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44081689347) | 新产物含逐系列 `comparisonEvidence`，原观察/同比/环比参照可回算，缺参照不假造比较 |
| [#638 UMCSENT](https://github.com/ctmaomao/gfrr-auto-update-site/pull/638) | `026927fc`；[CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44088369248)；[Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44089817795) | `sentimentReferences` 与1/3/6日历月一致；缺失比较/缓存降级及原观察月正确 |
| [#639 Claims](https://github.com/ctmaomao/gfrr-auto-update-site/pull/639) | `e8a214d3`；[CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44098147986)；[Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44100105726) | `claimsWindowEvidence` 支持连续4/8周；均值/变化可回算，缺失不借旧行或组合时钟 |
| [#640 中国数值](https://github.com/ctmaomao/gfrr-auto-update-site/pull/640) | `a7efaee0`；[CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44119170392)；[Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44120787670) | 无新增身份字段，须确认自然Daily实际使用包含修复的代码并完成生成/校验/提交；正常值本身不能证明缺失分支被触发 |

- **自然 Daily 与双站验收**：[自然运行 44232725217](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44232725217) 于 2026-11-18 03:46 UTC 启动，同步、生成、校验与提交步骤通过。该运行触发 SHA `18de2528` 已包含四项修复；[产物提交 `c0492f57`](https://github.com/ctmaomao/gfrr-auto-update-site/commit/c0492f57bd9049040ba31694d45b951e83d12e8e) 于 03:51 UTC 记录 `updatedAt=2026-11-18T03:47:03.711Z`。[Pages 原件](https://ctmaomao.github.io/gfrr-auto-update-site/data/radar-data.json) 和 [EdgeOne 原件](https://radar.gfrfinradar.uk/data/radar-data.json) 回读与该 Git 原件同为 SHA-256 `ceb9e9ff86f004d17a5ae932588e1a0dbd2bb4190de149b98d5e4db547e97ad9`（此为核验时快照，不要求在线文件以后仍为同一版本）。
- **证据与边界**：CPI 两系列十月 YoY 参照缺失、同比留空，MoM 用各自 9 月值回算；UMCSENT 九月读数保留 8/6/3 月参照；Claims 初请 8 周和续请 4 周证据均连续，4 周均值分别为 195250 和 1707750。中国数值修复已进入运行代码，ChinaBond/CFETS/CPI/PPI/PMI 正常返回，不能据此称空值等异常分支在生产触发。此次产物早于 #652 CARTS、#654 CRE 和 #661 Macro 准入，不关闭这些项目，也不代替任何独立 Bubble / World Order / 周报验收。

- **World Order 发布竞态（2026-11-18 UTC）**：[自然运行 44234237553](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44234237553) 完成生成和校验，但 main 并发推进使候选未推送；该失败时两站仍一致提供前次结果。修复 [#653](https://github.com/ctmaomao/gfrr-auto-update-site/pull/653) 已合并 `41e8a144`，main 后续已有 `91585db3`、`b3226a02` 刷新；这些提交本身不证明自然采用或双站验收。独立审阅的修复边界：仅限 World Order 既有两个生产输出，优先确认发布结果，最多三次非强制推送；只允许在无生成输入变更的 docs/tests 并发后重验原候选，其他变更停止；已校验而未确认发布的两个文件及摘要保留三天。保留 Events 缓存和 ACLED 专用发布顺序，不新增取数、provider 重试或手动调度；本修复不恢复失败运行的候选；下一次正常推送及两站实物见下方回执，不能替代竞态分支验收。

<a id="nov-19-natural-adoption"></a>

- **11/19 自然 Daily（UTC）**：[44453516528](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44453516528) 03:44 启动并通过；预检复用 `realtime-data` 的 `e22cb1d8`（02:27:21，约 77 分钟），未触发恢复。#652 CARTS、#654 CRE 正常路径已采用，缺槽/缺周及失败分支仍仅离线验证；#667 常规推送首试成功。03:49 提交 [808a02a8](https://github.com/ctmaomao/gfrr-auto-update-site/blob/808a02a8/data/radar-data.json)，[Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44454067335) 与 [EdgeOne](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44454067163)（release `24b35b19`）至 03:54 均回读到同一 SHA-256：`6f51aa7f60e07af009c981424bece2eb6d7c1a821de21058d83cac3eda8dec92`。下游 [#661](https://github.com/ctmaomao/gfrr-auto-update-site/pull/661) [运行](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44454067031) 已触发，因预算未初始化在 OFR 准入前跳过；未验证实际准入、未调用付费 provider、未写账本。
- **11/19 自然 World Order（UTC）**：[44454948885](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44454948885) 03:57 启动，验证通过并于 04:03 首试常规推送成功（`attempts:1`）；#653/#667 仅确认代码可用和正常路径采用，未走竞态重放或保留候选。唯一改动 [data/world-order-stress.json](https://github.com/ctmaomao/gfrr-auto-update-site/blob/c35c588a/data/world-order-stress.json)（04:00:13 生成）与 [Pages 回执](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44455717002)、[EdgeOne 后续发布回执](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44459649089) 对应的两站实物一致，SHA-256 为 `4c170425e3c417854c6c02ecc90fe29d3c4d652f948060286b1c6a0f3e0afd3e`。EdgeOne 没有 World Order 完成或本次数据路径的直接发布触发；后续合格发布 `8bd07391` 从 `b005131f` 带入同一文件。时效仍为 partial：免费 GDELT Events 更新至 11/18；9/26 GDELT Cloud 缓存未变且过期。发布成功不代表来源覆盖恢复。
- **调度仍需观察**：11/18 UTC 配置为 Daily 22:30、World Order 23:00；上述自然运行实际均晚约五小时。保留节奏问题，不以一次成功推送和双站回读关闭。

- **DeepSeek 私有账本：离线交付已完成，生产仍暂停**。[#632](https://github.com/ctmaomao/gfrr-auto-update-site/pull/632) 固定私有存储身份与只读状态，[#633](https://github.com/ctmaomao/gfrr-auto-update-site/pull/633) 收窄月度公开诊断，下一阶段分别完成跨 key 合成验证与显式注入的初始化器/运行时：

  | 阶段 | 合并提交与精确 PR head CI |
  |---|---|
  | 私有存储 | `da345ca3`；[CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44055322084) |
  | 月度公开诊断脱敏 | `92f26367`；[CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44060726736) |
  | [#635 跨 key 债务合成测试](https://github.com/ctmaomao/gfrr-auto-update-site/pull/635) | `7ef118be`；[CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44070051814) |
  | [#636 显式注入生命周期](https://github.com/ctmaomao/gfrr-auto-update-site/pull/636) | `cb6ed0e4`；[CI](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44076410697)；[该合并提交的 Pages](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/44077897334) |

  四个 PR 均记录独立审阅，CI 成功；#636 同时记录完整本地检查通过。Pages 成功只证明该站点构建，不验证私有仓库权限、真实账本或付费恢复。依 [ADR-0121](ADR/0121-private-budget-offline-store.md)，实际恢复仍需分别核验：旧调用路径停用及在途请求排空、旧负债与未知结果处理、最小权限及两个 key 的真实环境/调用绑定、独立核验的现价和全额隔离初始化。真实账本未初始化，本轮未接线、未读写凭据、未调用 provider；共用月上限仍为 CNY10，不重置已耗名额或释放旧预留。

- **政策目标双端一致性**：DFEDTARL/U 仅同日生效观察且上下界有序才合成区间，缓存须双端日期与中点可核；缺失不恢复旧派生差或旧regime。所有明确相对目标中点的差值统一重算/置空，保留原市场曲线和时钟，不接评分或增请求。当前3.75–4.00中点3.875正常，调息日错配仅为离线可复现缺陷；实样/异常回归、独审、全套、CI与自然采用分别验收。

- **准备金四周参照**：WRESBAL仅以本期观察日前28日的唯一周平均计算，缺参照不以最近周/本期伪造；缓存保留原观察日并须参照值可回算，无证明仅留水平。实际Nov11/Oct14样本仍为-2.036%，潜在缺陷与当前错报分开；不改WALCL/RRP评分、研究回放、来源请求或历史数据。专项、完整检查、独审、CI与自然采用分别验收。

- **Daily ON RRP 同口径备用**：按「来源质量」单包执行。以 `fe6367fa` 为基线，FRED 水平可用时不取副源；不可用时最多一次纽约联储公开请求，按 Treasury 实际接受额及操作日取值，仅更新合格且比可用缓存更新的备用值。保留既有周参照、零参照语义、缓存、评分和发布闸门；不改调度、不花费。离线实样回放与合成反例、独审、精确 CI 分别验收，运行采用仅在自然触发时核对。

<a id="daily-fed-h41-fallback"></a>

- **Daily Fed 同口径备用**：见工作表「来源质量」合并与部署回执。WALCL／WRESBAL 分别保留 FRED 首选；仅 FRED 不可用的序列尝试官方 [H.4.1](DATA_SOURCES.md) 同口径备用，可用缓存平局、既有评分公式和 publication hold 不变。比较端点要求恰好 28 日前，准备金可单独保留水平。正常路径与待验备用见[单一工作表](#active-worktable)，按[运维手册](OPERATIONS.md)查回执，不触发补跑。

- **就业篮子同月与含义（2026-11-17）**：保持既有11序列/等权正增长公式，不换源、不增请求或改评分；校正零售与贸易运输公用事业的嵌套说明，不能包装成独立行业广度或BLS扩散指数。验收基线为全部11序列同月且有唯一前月，缺失不出新数；新method标记的已验缓存才可原月fallback，旧无标记快照只作未核验历史。前端明确观察月份、自定义/重叠/非BLS，按设计与移动端核验；真实当前7/11仍63.6%，不追算历史。专项、全套、独审、CI与自然采用分别验收。
- **退役 AI 展示记录精简**：仅压缩两份旧展示设计的重复阶段进度，保留前部完整字段/门槛/回滚、所有原标题锚点及固定提交原文与 SHA256；不删文件、不改 checker 或现行授权。链接/原文可恢复性、独审与文档检查分别验收，不将旧可见/定时调用记录解释为当前状态。

- **Daily → EdgeOne 发布尾链**：仅补成功 Daily 完成 listener，保留既有六生产者、main/success、Macro 暂停、完整检查、固定来源 SHA、串行/无变化/400次限额；不采集或派发工作流。自然 Daily 及 EdgeOne 线上验收见[11/19 回执](#nov-19-natural-adoption)，详见 [ADR-0119](ADR/0119-daily-publication-completion.md)。

- **Brent 接收版本用途隔离**：离线重验原字节后区分起点特征、训练标签与后验评估候选；接收晚于起点拒绝历史用途，接收较早也不自证真实性/日历/标签成熟，后验候选不授予训练许可。复用私有30行快照做时钟反例，不取数、不拟合、不新增采样计划；专项、独审及全套分别核验。

- **宏观信用变化参照（2026-11-17）**：验收基线为 NFCI 四周变化必须有整 28 日前观测，SLOOS 大/小企业季环比必须有上一日历季度起始观测；缺参照不以最近边界或本期值伪造变化。缓存无参照日期证明时仅保留水平，不复用变化；两个既有 SLOOS 请求回看从 180 改 270 日以覆盖正常发布延迟，不增加请求/来源；不改评分或生产快照，不涉及油价/pressure 双轨。当前自然快照未证明错报，缺陷通过稀疏/缺季合成样本复现；离线专项、全套、独审、CI 与下一自然产物分别验收。

- **背离解释层缺失语义**：仅对 divergenceLayer 输入做 null-safe 数值读取，避免缺失 VIX/HY/Brent 被当成零值、市场平静或消费者稳定证据；合法数值/零和阈值保持；利率压力存在而信用/波动率缺失且无已知扩张证据时明确不足判断，不再以缺失推断未扩张。数据不足仍沿用有限 score=0 加 insufficient_data 契约。不接主评分、不改快照或取数；全缺失、部分缺失及正常输入回归、独审和完整验证分别验收。

- **Brent 新接收快照可复核入口**：固定单次免费短窗口获得新身份30条报价，私有保留原字节与接收证据；离线校验保留返回槽位、区分私有数值与无价格公开摘要，不把接收回填为原始首发，不恢复失踪旧CSV。真实样本解析、合成反例、独审与发布分别验收，未计算收益或开放v2拟合；详见[来源审计](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

- **NY Fed 利率缺失语义**：仅加固 secured-rates parser，拒绝缺失/布尔/容器值成为零利率，缺失成交量保持 null；真实零、精度、日期及原缓存/fallback策略不变。合成实际 parser→fetch→Fed resolver 回归验证缺失利差不伪造，独审、全套与精确 CI 分别验收；不取数、不改生产快照或全局数值转换。

- **EIA 周度类型隔离**：压力/history 共用严格数值投影，拒绝 null/布尔/容器/空白强转零；保留真实零与正常数值字符串。任一无效行整 series missing，不筛掉中间缺失后伪造周差分；保守降级可能减少可用覆盖。模拟 fetch→evidence、独审、全套与自然运行分开验收，不触发采集或改生产快照。详见[来源审计](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

- **FRED JSON 数值类型保护**：共享 Daily/realtime parser 拒绝 null、布尔及容器值，避免隐式转换为 0/1 或数组中的数值；保留真正数值零、负值、字符串数字、顺序与 CSV 行为。验收基线为合成解析及实际 fetchRows 模拟不足行 fallback，不新增请求/重试策略、不取数或改历史产物；专项、全套、独审与精确 CI 分别验收。

- **Brave私有证明分层（未启用）**：owner选择保持暂停并开发私有方案；新增固定proof适配原型，公开投影排除账户/plan/key指纹/账单与裸身份哈希，私有随机nonce的HMAC约束防止换proof重归属历史。保留旧门槛/CAS/pending，无自动初始化/续期/迁移，不改权限。owner随后具体批准repository secret私有存储及五个main步骤注入；本轮仅接线与离线回归，真实secret保存/公开项目记录审批/初始化分别核验，不把代码合并说成已恢复搜索。

- **Brave可见身份绑定**：按owner修复要求新增显式v3登录身份/plan/key证据协议，不把邮箱或标签冒称服务ID；实际生产key必须匹配且受全Search plan免费硬停保护，每grant≤50预留、≤24小时。保留v1/v2、950/31天、并发CAS、pending和未知历史，不自动迁移/续期或建账，不调用provider。首次初始化仍须证据与操作独审，代码交付不等于激活。

- **宏观月度比较基准**：仅在目标日历月真实存在有限数值时计算月度同比/变化，移除缺月后无条件退回365天近邻的跨口径替代，避免U6三个月变化误算成年变化及零变化、工资/JOLTS/零售同比误用邻月。保留已知当前水平、真实零值和正常月份，缺基准保持null；不改评分/门槛、来源请求或生产快照，不触碰中止的压力双轨。离线真实就业/零售函数回归、全套与独审分别验收。

- **Oil Thermal 历史窗口边界精度**：本轮仅离线样本 review 与设施窗口汇总保留毫秒跨度换算的原始天数，避免 6.999/29.999 天因提前四舍五入跨过既有 7/30 天质量门槛；字段名/number 类型、阈值及整数/两位输入保持。用阈值 ±1ms 合成样本验证真实 CLI→候选元数据、质量与达标计数一致；不采集、自动晋升/改写生产基线、恢复卫星展示或修改压力双轨。既有手工产物及验证器容差不在本轮追溯修复范围。专项、完整检查、独审和精确 CI 分别验收。

- **手工产物路径保护**：修复共享guard漏过悬空文件/目录链接；只收紧链接检测，保留普通新路径及既有前缀/扩展名边界。不运行采集、不改生产数据，真实临时文件系统负例、全套及独审分别验收；见 [ADR-0116](ADR/0116-manual-artifact-dangling-links.md)。 后续独立Transport边界审阅器同步悬空链接检测，保留原非JSON文件名支持；不机械套用共享JSON限制。

- **Bubble 刷新后历史回归隔离**：历史 r6 迁移、观测语义和浏览器回归固定使用 2026-11-10 三条目配置快照，避免合法上游同步推进 review/report 日期后误阻整期提交；生产证明、日期与评分校验保持原样，不重跑采集或付费。离线模拟日期前移、专项、全套和独审分别验收。

- **独立 realtime 日历合法性**：复现无效 `2026-02-30` 被 Date.parse 归一后进入新鲜度/共识。复用既有严格观察日期解析，canonical 日期/带时区 ISO 必须真实有效；HTML canonical 时间在归一前拒绝且保持 unavailable，不能误作缺日期弱确认。保留五分钟容差、合法日线、epoch/月份文字时间路径；日期前缀数字时刻要求显式 ISO 时区，不将 malformed 当缺时刻；不改 Worker、前端、取数配置或生产数据。专项、全套、独审、CI及自然采用分开验收。

- **独立 realtime 时钟保护**：延续 owner 2026-11-16 准确性审核，验收基线为复用既有 5 分钟容差、原始年龄判界；未来/无效候选不能经 `null <= 120` 或 Stooq 日线例外进入共识，未来锚点不晋升，缓存年龄未知不伪零。异常 live 观察走既有失败/fallback 路径；有效过去日期、年龄上限、来源与请求/重试配置保持。仅离线生产函数回归，不重跑采集、改生产 JSON 或 Worker；专项、全套、独审、CI 与自然采用分别验收。

- **Baltic 必需约束完整性**：延续 owner 准确性/维护性审核，实证旧 checker 接受缺失或空 approval/boundary 对象。本轮仅在该 checker 锁定 11/17 必需键及对象形状，保留原逐值布尔检查与全部实质断言；不改通用 helper、fixture、运行逻辑或来源权限。逐键删除/错误类型负例须旧红新绿，专项、完整检查、独审与精确 CI 分别验收；见 [ADR-0115](ADR/0115-baltic-policy-single-authority.md#follow-up-required-policy-keys-2026-11-16)。

- **Baltic 政策单一入口**：owner 要求进一步精简可维护性；仅将一项 checker 的重复文档标记集中至专题政策/既有 fixture，六入口验证链接，保留全部 fixture/DOM/生产/renderer/registration 断言。验收为变异负例、旧新实质断言对照、完整检查和独审；不扩大来源或运行权限。见 [ADR-0115](ADR/0115-baltic-policy-single-authority.md)。

- **共享时效时钟保护**：owner 2026-11-16 全项目准确性审核授权下，验收基线为共享 freshness helper 不再把超过既有健康检查 5 分钟容差的未来时钟钳为新鲜；边界用未舍入年龄判断，非有限/负分类输入不可用。仅 Daily 输入审计及共享元数据 helper，冻结 realtime 模块与独立生产采集器不改；不增加取数、评分输入或数据写入。专项、全套、独审、CI 与部署分别验收；此修复不代表旧生产快照恢复。

- **四页导航**：owner 2026-11-16 明确要求四页右上角互切；仅将油市观察加入同构常显导航、更新 §4.5 并重建周报入口，固定日期周报不改。保留默认周报、雷达旧锚点、当前页 aria-current、纸媒样式及390px键盘/触屏验收。无数据、模型、取源或 workflow 改动；Issue 创建被工具拒绝，未绕过。独审、全套、精确 CI 和线上验收分别核验。当前导航说明统一引用 DESIGN §4.5，清除启动规则/索引/维护表中的旧三标签现状；不改设计、历史证据或断言。

- **退役摘要文档精简（2026-11-16）**：owner 要求进一步提升可维护性；本轮仅归并 M-92/M-93 三篇已退役摘要设计，保留关键误判纠正、阶段边界、固定 Git 原文与 SHA256，迁移入口。无生产代码、checker、数据或权限变更；完整检查和独立审阅后方可集成。见[归档入口](LEGACY_DOCUMENT_STATUS.md#retired-summary-designs)。

- **WPSR 文档链接基准保护**：本轮验收基线为含 href 的 base 元素必须整体拒绝，不能忽略浏览器基准而把相对 PDF 误判为本期官方地址；空值/隐藏/无效 base 保守拒绝，仅 target 与 script/comment 字面标签保持兼容。仅离线 parser、合成回归和证据说明；真实目录/一份 issue 两次有界 HTML 核验新旧结果一致，不取价格、改冻结协议、拟合或公开概率。旧红新绿、专项、全套、独审与精确 CI 分别验收。

- **WPSR 元信息上下文修复**：延续 owner 的概率研究与完善授权，本轮验收基线为无效/隐藏/未闭合行不得提供或保留后续行继承月份，未闭合年份标题不得建立上下文；保留合法缺 tr 恢复及重新显式建立上下文。仅离线 parser、合成回归与说明，不取数、不拟合、不改变冻结协议或公开资格。专项、全套与独立审阅分别验收，尚未声称部署。

- **Daily 发布竞争保护**：自然运行 `43791327331` 在生成和完整验证后，遇 PR 合并推进 main，常规 push 被拒，旧快照未被覆盖。验收基线：只对 docs/tests 的非符号链接变动重放固定三个候选文件，重新完整检查，最多三次常规 push；任何运行输入/代码/config/data 变化均保守停止，不重新取源、不强推。失败后仅保留已完成本地验证候选及 SHA256/提交身份三天，不能直接晋升；原失败运行没有 artifact，不可补造候选。实现、独审、CI 与自然生产采用分别验收。

- **WPSR 官方 HTML 研究解析**：owner 授权实现离线原字节/receipt一致性、目录与 issue 元信息解析，验收基线为可见日期而非URL推断、同日多成员/隐式行/隐藏内容与冲突保守处理，真实来源完整性不晋升。旧模板只证发行日时保持部分状态，页面数据周未知，不能解除已停止抓取批次。仅 Python 标准库及合成测试桥，不把原HTML或原始价格序列入库，不联网/拟合/接评分；独审、全套与精确CI后串行发布。后续历史获取使用独立有界批次，不由本解析器授权或自动触发。

- **WPSR 独立报告时点验证（仅合成）**：owner 授权预登记并验证报告批次/输入可知时点，验收基线为独立于 ALFRED v1、同日成员齐全、未知支持不跳过、closure 可知时间纳入成熟和 purge，不生成真实收益/模型或公开概率。协议已冻结，纯合成 validator 的独审、全套和 CI 分别验收；已有七报告不构成完整历史，后续真实输入可行性验证与长期留存须保持单独边界。

- **Brent 接收元信息接缝（默认关闭）**：owner 授权先做脱敏、有界、失败隔离的真实取数路径接缝；验收基线为不保存原始报价序列、不改请求/重试/fallback/生产解析和 payload，observer 异常不影响来源处理，未启用 workflow、上传或持久账本。当前仅模拟网络验证真实 fetchRows 路径与独审，最终全套/CI/合并分别验收；自然采集及长期前瞻标签尚未建立，禁止将 hash 元信息当价格数据或提供方首次发布。

- **Brent v2 固定合成图草稿**：本轮仅独立draft协议与声明case graph质量覆盖，保留原始槽位、全部availability批次、特征/anchor/endpoint与中间缺失依赖；异常只隔离不重排，closure未知不可用。不改v1、不读取真实价格/拟合/取数，依赖完整性和真实性不由声明自证；8组合成回归、全套与独审分别验收，未freeze或开启真实入口。见[来源审计](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

- **Brent 现货概率研究（研究隔离）**：owner 授权建立有期限、可校准的方向概率研究，验收基线为冻结协议、真实可用时点、防前视、训练/校准/独立测试和保守不可用输出，不接评分或公开预测。纯合成 case、固定训练/校准及配对评估模块已实现，逐阶段专项与独审、最终全套检查和发布分别验收；工程正确不等于预测有效。ALFRED 官方归档发现可用日早于报价日，v1 真实拟合已停止，未删点、修日或计算真实收益；详见 [来源审计](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

- **独立油市观察页**：owner 要求将价格、运费、航道及卫星证据集中呈现，结论接回全球雷达。本轮验收基线为 `oil-market.html` 从现有 ODP 区进入，不改变首页三标签或13项锚点；复用同一 `qualifyOdpDisplay` 供需资格闸门，市场与卫星各守自身观察时点。卫星仅实验性原始聚合，无事故、覆盖完整或价格方向推断；零运力标记数据不足。仅增加现有静态发布白名单与该页触发，不新增取数、付费调用或评分输入。已通过 #584 合并、精确 CI、1440/390 及缺失/超龄四态实图独审和两站资源验收；不代表卫星预测已获验证。本轮后续修复将油页标题与雷达在缺少合格价格时的“油价方向暂不足判断”保持一致，独列美国周度供需状态，不修改资格门槛或生产数据；正常、缺价、缺供需、超龄和跨页一致性为验收基线，该修复已由 #586 合并 `b0ad7534`，精确 CI、四态实图独审及两站资源验收完成；不代表预测验证通过。

- **离线审阅器精简**：[#578](https://github.com/ctmaomao/gfrr-auto-update-site/pull/578) 将三个 Oil News 审阅器逐字重复的只读 Git 历史读取提取为共用 helper；各自采样截断、路径授权、错误、来源元数据与安全边界声明保持。新增真实临时 Git 仓库回归；原补丁完整检查和独审通过，最新主干集成仍以精确提交验收为准。

- **本轮精简**：文档盘点与状态收口已通过 #574 合并 `1d1db609`，范围及未改项见[2026-11-15 核查](MARKDOWN_MAINTENANCE_2026_11_15.md)。代码 [#575](https://github.com/ctmaomao/gfrr-auto-update-site/pull/575) 将 QQQ/NDX/IXIC 重复周线归一化与覆盖计算提取为共用纯函数，并加入离线回归；不改日期标签、价格、范围闸门、取数/写入或评分策略。已合并 `325d7307`，完整本地检查、独审与精确 CI `43758369574` 通过；自然采用仍按实际产物核验。既有进行中周线接受行为仍保持，不把精简称为来源语义修复。后续 #576 已合并 `7a6de1b8`，归并删除 10 个重复阶段说明，保留完整固定原文和 SHA256；本轮再归并 1 篇旧生产 readiness 复核后停止此类批量清理，不删来源契约、机器断言或生产证据。
- **已合并的新修复**：#503 FIRMS 停源/空响应、#571 Bubble 独立市场观察、#572 QQQ 周线日期标签、#573 铜金比日变化均在本基线 main；合并证据及剩余验收见 Section 3。不能把已合并写成待 CI，也不能把合并写成自然产物已采用或最新两站健康。
- **Brent 观察审计元数据**：[#568](https://github.com/ctmaomao/gfrr-auto-update-site/pull/568) 已合并 `498f83f5`。白名单来源/品种/合约/观察时钟/获取时钟/hold 原因与输入身份、可比性及 null 拒绝已实现；未改选源、阈值或评分。下一次使用该版本的自然 Daily 日志仍待验收；此前 [Daily 43547163286](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43547163286) 早于合并，不能代替验收，历史缺失元数据不能回填。
- **已合并来源修复的自然采用**：#553/#555 的 Bubble 日期和缺失值修复已入 main，但本基线全量快照仍为 `2026-11-10T06:14:30.988Z`；信用独立更新不证明全量采用。#561 黄金获取时钟/null 日变动修复已合并，真实生产采用仍单列待核验，不把 provider 获取时间称作交易所报价时点。
- **World Order V2 来源与不确定性迁移**：#559/#560 的纯区间、历史/展示适配器、来源元数据与预备 checker 已合并但未启用。缺失值不能归零制造低风险；真实观察语义、来源更新日历、美元口径校准、全部消费者/历史接线及桌面手机验收仍未完成。设计及阶段边界见 [迁移设计](WORLD_ORDER_UNCERTAINTY_MIGRATION.md)。 本轮 [PR #570](https://github.com/ctmaomao/gfrr-auto-update-site/pull/570) 按 owner 最新继续迁移授权增加未接生产的原始记录/选中值、系列身份、日历时钟和 fallback/held 离线预检；所有来源仍未获资格，六判据保持 unknown，不使用美元 105 阈值、不缩小条件界限、不改生产评分。已合并 `9080fe7d`；代码可用不代表来源获资格或生产迁移完成。
- **来源覆盖缺口**：Bubble ARR 加速、VC/Neocloud 当期覆盖和 AI 专项 ABS 等仍需合格证据；新获取时间不使旧里程碑变新。热观察历史基线截至 9 月 5 日，成熟窗口不证明近期适用；0 条观测不能证明设施安全。已完成的是缺口/旧基线披露，不是恢复全部来源或确认风险消失。

- **Bubble 候选发布准备**：[#548](https://github.com/ctmaomao/gfrr-auto-update-site/pull/548) 已合并 `95a5681c`；纯离线准备器仅重放精确已审候选。新候选仍需认证原 run/artifact/ledger、独立事实复核与原 writer 时效及 CAS 门槛；不代表已生成或上线。见[发布准备契约](BUBBLE_REVIEWED_PUBLICATION.md)。

- **DeepSeek key 私密核验与 Bubble 单次准备**：#546/#547/#550 已合并，涵盖不访问 provider 的私密身份诊断、单次候选准备和私密 claim。代码可用不代表预算已激活或新稿已调用/发布。网站用途需与账户其它 key 区分，旧名额消耗和永久预留保持；实际私密配置、证据时效和新稿事实复核仍待完成，不在公开文档披露账户材料。

- **Brave 免费额度记录**：[#544](https://github.com/ctmaomao/gfrr-auto-update-site/pull/544) 已合并 `df5e8dcc`，v2 共享免费硬限与核验入口已实现；历史不重置。生产激活必须由真实证据和 create-only 流程确认，不能以代码合并宣称恢复调用。见 [ADR-0111](ADR/0111-brave-shared-free-only.md)。

- **两篇编辑月预算 CNY10 / 余额识别**：[#543](https://github.com/ctmaomao/gfrr-auto-update-site/pull/543) 已合并 `dc444239`，仅新 monthly v2 genesis 为 10 元；旧 monthly v1 hold、旧 grant/price digest、已耗四次永久预留与事实门槛保持。代码上线与账户激活分开，尚不能宣称自动编辑已恢复。见 [ADR-0110](ADR/0110-monthly-cny-ten-and-balance.md)。

- **Macro 预算暂停重复告警**：[#542](https://github.com/ctmaomao/gfrr-auto-update-site/pull/542) 已合并 `a9f6cab6`。monthly 双空配置在网络前分类为 expected skip，不作无意义发布；真实 API、账本、配置、价格或生成失败仍保留。此项不恢复预算或文章，见 [ADR-0109](ADR/0109-macro-budget-pause-notifications.md)。

- **Bubble 来源语义与日期绑定修复**：#538 已合并 `2591d3b4`，落地 [ADR-0106](ADR/0106-bubble-evidence-semantics.md) 与有界当前文案迁移，并保留 #537 新稿隔离及随后自然数据更新。验收基线是 RPO/百分点/发行待发管线/HY 广义代理语义纠错、新时间线报道日绑定；数值、评分、所有原期时钟、provenance 和历史 AI 正文不变，当前 AI 层保持缺席。双站验收仍由协调任务按实际回执核实；不调用 provider、不恢复已耗授权。

- **Macro / Bubble 事实隔离与已耗调用**：#532–#536 的两次新授权调用（合计上限 CNY4.33）已完成，但两稿独立事实复核失败；#537/#539 已隔离稿件，#538/#540 修复输入/单位/日期与 OFR 语义，不据此恢复文章。Bubble 原稿 `423c9dc7`（run `42935389410`）、Macro 原稿 `d2905d32`（run `42950570179`）保留；安全回执仅含摘要/哈希。两个名额均已消耗，各永久预留 CNY2.161152、合计 CNY4.322304，token 回执不等于实际结算。旧 monthly 预检失败 run `42946982770` 不恢复名额；单次调用/no retry、全部账本/标签、来源资格与最终 writer/review 门槛保持。具体事实错误、精确恢复和原始运行过程见[收口前固定记录](https://github.com/ctmaomao/gfrr-auto-update-site/blob/7a23c8d4911b7a35c5a17e6e01c6fcf9e606698c/docs/PROJECT_BACKLOG.md)、[提示恢复记录](EDITORIAL_PROMPT_RECOVERY_2026_11_10.md)、[OFR 语义契约](ADR/0107-ofr-editorial-semantic-boundaries.md)。当前预算/私密配置仍待上方各项核验；本轮不调用 provider，也不声称文章恢复或重验线上。
- **ACLED 候选比较修复**：[#541](https://github.com/ctmaomao/gfrr-auto-update-site/pull/541) 已合并 `f4da1dd8`；随后 `18fa663b` 已提交 reviewed weekly/monthly pair，不再把旧 `42975462379` 的阻塞写作现状。当前源仍按周/月频与自己的观察日解释，非实时事件确认；后续健康按实际运行核验。[运行说明](ACLED_AUTOMATIC_UPDATE.md)与 [ADR-0108](ADR/0108-acled-common-window-comparison.md)保留规则和原失败脉络。
- **压力研究**：冻结 cohort `pressure-shadow-29d69c0ecb7b98a0` 继续现有采集；84 日/40 输入/12 周及[最终评审标准](PRESSURE_MODEL_FINAL_REVIEW_STANDARD.md)不变，最早时间门槛 2026-12-10 UTC。旧 2 条样本的快照不是当前计数，未重新核对实际 ledger，不声明达标或晋升。OFR 生产主读数迁移不代表七候选研究通过。
- **CSP**：采集线冻结，生产 C 不启用；原生投递、alarm/清理、隐私、共享额度和真实平台验收缺口保留。原回执、预算、一次性 marker 与锁见[归档](https://github.com/ctmaomao/gfrr-auto-update-site/blob/87fa3710a2975d4d96ea0175c1b51d362089ac66/docs/PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)，不把归档当重启或重复试验许可。
- **其它观察与源权利**：Oil News 同口径窗口、FIRMS 后续质量与独立晋升、ARR 跨周期证据、路线级运费权利和 HAPI 候选条件保留；没有新证据不制造待办或宣称恢复。旧失败次数、账户额度和样本计数按原日期保留，不冒充最新状态。

### P0 / P1 / P2

本次文档核查不重新评定运行事故优先级。历史 P0/P1/P2 完成项已归档；当前编辑恢复、来源待验与其它进行中事项以上方清单和实际最新回执为准，不再笼统声明“无 active P2”。

### P3 · 研究候选与受限来源

以下是持续边界/候选，不是自动启动的实施队列。新功能按具体任务及来源契约推进，不需要为无关历史阶段重复审批。

#### P3-10: Fed dot plot / OIS / FOMC 文本

现有公开利率、SEP、期货/公共 OIS 代理与政策文本按 [DATA_SOURCES](DATA_SOURCES.md) 使用。proprietary dealer forward curve 和更完整 NLP 尚未连接；公开代理不冒充 licensed curve，政策文本不进入 scoring/decision。历史质量修复原文已归档。

#### P3-11: Brent 实物端 / 期限结构 / freight

现有公开 Brent、期限结构与广义运价仅按源契约使用；Platts Dated Brent、formal Dated Brent 和 official ICE settlement 不因代理可用而解锁。Baltic 公共 ticker 与 StockQ 缓存按 [ADR-0067](ADR/0067-baltic-public-ticker.md)，不再把 StockQ-only 当现行要求。

#### P3-14: Redbook + BoA raw card 高频消费证据

CARTS、MRTS、BoA 和 Redbook 公开摘要已连接；raw subscription/card feed 未连接。公开摘要不得写成原始交易数据，具体字段/失败降级见 [DATA_SOURCES](DATA_SOURCES.md)。

#### P3-15: CDX HY/IG + 私募信贷 fundraising

已有 OAS、ETF、公开 settlement、NAV 与 CRE 代理；true private credit marks、licensed Markit history、non-public CRE loan tape 未连接。保留 public proxy 身份，不把它们包装为非公开底层数据。

#### P3-16: China Macro Liquidity / Property Evidence Layer

70 城、社融、OMO、MLF 的已实施来源和聚合转载身份见 [China source review](CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md) / [DATA_SOURCES](DATA_SOURCES.md)。不把旧成功时点称作今日全 live；SLO 仅历史，不等于 Fed SLOOS。微观 raw tape 未连接，继续 display-only。

#### P3-17 / P3-18 · 已完成清理

F1–F6、stale-display 与 WIRE A–E 已关闭，见[完成记录](https://github.com/ctmaomao/gfrr-auto-update-site/blob/87fa3710a2975d4d96ea0175c1b51d362089ac66/docs/PROJECT_COMPLETED_HISTORY.md)。大型模块拆分只是候选，须有明确收益、范围与验证，不能从旧下一步自动启动；现行 DESIGN、asset bump 与冻结边界保持。

#### P3-19: Oil Directional Pressure (ODP)

ODP 为独立 audit-only/display-only 专题；不改变主分、Brent promotion、Heatmap 或 cross-validation。源/预登记回测门槛见 [source-of-record](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)、[energy](AGENT_DOMAIN_BOUNDARIES.md#energy) 与[实施历史](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md#odp-records)。

Web NGrams 同口径观察、独立切源审查与 `automaticCutoverApproved=false` 保留，新闻/热异常/AIS 不作事故确认。FIRMS 首次成熟晋升已经完成，后续仍按 [P65 容量](OIL_THERMAL_HISTORY_WINDOW_CAPACITY.md)及 P60/P68 质量门槛，不因时间经过自动放宽。未在本轮重跑观察窗或核查线上数据。

#### P3-19a: Energy Stress Phase 2

STEO、库存与 PortWatch 摘要已接入；现行 [P50 授权](fixtures/transport-shock-confirmation-factor/runtime-scoring-migration-authorization-v1.json) / [P51–P56 runtime](AGENT_DOMAIN_BOUNDARIES.md#transport-runtime)仅允许合格 free proxy 的 +1/+2/+3、上限 +3、默认 fail-closed 0。该旧模型诊断路径不抬高 OFR 主读数。

`routeFreightConfirmation` / `marketConfirmation` 仍 `not_connected`；手工/replay/preflight 成功不构成 runtime、路线权利或生产批准。来源授权、PortWatch 条款差异与未解依赖见[领域附件](AGENT_DOMAIN_BOUNDARIES.md#transport-manual)和[历史记录](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md#energy-transport-records)，仍须保留，不借本轮整理解锁。

#### P3-20: External AI 深化（旧路径已完成并退役）

旧 `externalAiInterpretationLayer` 仅兼容/手工诊断；当前首页 [Macro Risk](MACRO_RISK_EDITORIAL_DESIGN.md) 与 Bubble 编辑层另有生产契约，均不改 scoring/decision/execution/position。旧阶段入口见[统一状态](LEGACY_DOCUMENT_STATUS.md#external-ai)。

#### P3-21: Bubble Watch

当前 Core-23 / Shadow-4、已批准 revision 和逐项来源资格以 [ADR-0069](ADR/0069-bubble-qualified-evidence-and-score-bounds.md)、[数据契约](DATA_CONTRACT.md)与实际配置为准。旧 24 指标、固定灯数、“24/24 全 live”属于历史，不能作当前保证；每次真实刷新仍验证证据日期、缺失/缓存、来源边界和独立编辑层资格。

- **周一全量刷新与采用验收**：只把原 [全量工作流](../.github/workflows/refresh-bubble-watch.yml) 移至周一 00:15 UTC（新西兰夏令 13:15／标准时 12:15），仍以 UTC 周为边界，不另开全量触发。现有来源、预算、发布与编辑层准入不变。
- **观察与运行边界**：[只读采用监控](../.github/workflows/monitor-bubble-watch-adoption.yml) 于周一 04:30 UTC 检查首个计划运行的首次尝试、排队／执行／检查／提交状态、main 绑定提交及 Pages 和 EdgeOne 的同一全量快照标识。独立信用、市场或编辑层覆盖不冒充全量；同一快照不等于逐字节一致或所有来源新鲜。超过观察时间仍未看到运行、提交或双站采用会分别报告，并注明实际观察时间，不倒推 04:30 状态。不取消、不重试、不触发发布或付费调用。新节奏的真实自然运行和双站采用仍须验收。

## Section 3 · Completed Items

### 2026-11-15 增量：代码已合并，不代替运行验收

| 事项 | main 证据 | 保留边界 / 下一步 |
|---|---|---|
| FIRMS S-NPP 停源与空响应 | #503 `9d3c179a`；[ADR-0086](ADR/0086-oil-thermal-source-retirement.md) | S-NPP 当前窗不再请求；保留 NOAA 实测，暂停旧三源基线比较并隔离停源后样本。空值不证明安全；退役前台不恢复。后续自然产物及两站按实际回执核验 |
| Bubble 独立市场观察 | #571 `d3961806`；[契约](BUBBLE_INDEPENDENT_MARKET_OBSERVATIONS.md) | 五次固定免费请求；信用不重复取数。新观察不刷新周分、27 卡、历史或文章，无效来源不晋升；自然运行与线上状态另验 |
| QQQ / NDX 周线日期 | #572 `5638c383` | 日期仅为来源周线标签，年龄不等于真实报价年龄；同标签不确认同期收盘。实际收盘日/完整周证据仍缺，数值/评分不变 |
| 铜金比日变化 | #573 `6c212d96` | 获取时钟不提供前交易日基准；无证据时日变化为 null，不用上轮 Daily 价差替代。下一自然 Daily 采用待验，不手改生产 JSON |
| World Order V2 离线来源预检 | #570 `9080fe7d` | 未接生产；来源资格、六判据与完整消费者迁移仍待完成 |
| 文档状态收口 | #534 `e1939f86`、#569 `a4e91eb7` | [11 月 10 日记录](MARKDOWN_MAINTENANCE_2026_11_10.md)的 338 文件属于当时盘点，不冒充当前总数 |

### 2026-11-14 收口：合并与运行证据分列

| 事项 | 已核实代码 / 运行证据 | 验收边界 |
|---|---|---|
| ICE Brent 候选 / 隔夜 OMO / CARTS 独立观察日 | #551 `54c3ec91`、#552 `dde79b43`、#554 `9f214f28`；后续 Daily 产物 `338083e5`、`376312e7` | 修复已入 main；保留现货/期货、获取/观察日期和天然发布滞后，不宣称全部实时 |
| Bubble SPY/RSP 对齐、CAPE/持仓/PE/FRED 日期与空值 | #553 `95aa69e3`、#555 `0dd3c8ff` | 代码已合并；全量新快照采用仍待验证，不能用信用更新替代 |
| 独立信用历史刷新 | #556 `d78ef3c3`；[自然运行 43444779335](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43444779335) 成功、产物 `3713fb90` | 周二至周六 06:20 UTC 计划；实际首次 11 月 13 日 14:39 UTC 执行，计划非准时承诺；仅信用展示、不重算周分数 |
| ACLED 测试隔离 / World Order 无效时钟 | #557 `d009e4cc`、#558 `1fbfe682` | 已合并，不再待实现；不证明全部来源新鲜或 V2 可启用 |
| 黄金真实获取时间 | #561 `7a2aaddc` | 已合并；生产采用另待核验，单报价日变动为 null |
| 热观察基线披露 / 完成后直接发布 | #562 `abded283`、#563 `e1798ac3`；[thermal 43540690722](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43540690722) → `765ea955` → [EdgeOne 43541207646](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43541207646) 成功 | 已有自然端到端验收回执：两站与本轮文件 SHA256 `8769b21ac6cf497b6d68cf732558d7aec9c923bb60938173d13566a429534bc5` 一致；该轮无卫星观测，旧基线仍受限 |
| 前后台 null/日期/覆盖/图表表达 | #564 `abe9107d`、#565 `555316a4`、#566 `bae3b06d`、#567 `2a032d70` | 已合并且协调任务记录桌面手机实图及双站验收；不是本次重新验图，也不代表来源缺口已修复 |
| FRED 等价解析 / 语法有界并行 | #545 `9b29bc6c`、#520 `dfbdd250` | 已合并；不改来源资格、评分、预算或发布保护 |

以下只列已核实的代码整合或已有验收记录；不把合并等同最新数据健康。

| 已完成事项 | 证据 / 当前入口 |
|---|---|
| M-71 Brent public proxy source review | [Brent source review](BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md)，公共代理和主值晋升隔离 |
| M-91 / P2-12 Market Pricing NDX/IXIC implementation | [M-91](MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md)，QQQ primary、NDX/IXIC auxiliary、display-only |
| OFR 主读数及旧公开建议退役 | #491/#492；[ADR-0080](ADR/0080-ofr-primary-pressure-migration.md)，2026-11-01 双站验收原文已归档 |
| 周报默认首页与历史档案 | #510；[周报入口](WEEKLY_HOMEPAGE_VISUAL_2026_11_09.md)，历史正文与固定 URL 保留 |
| 独立 AI 审查与同范围免重复确认 | #514 / `34c2df15`；[ADR-0092](ADR/0092-delegated-ai-review.md) |
| 近期来源/证据与编辑修复 | #511/#513、#515–#519、#521–#533 已在本次基线 main；各自 ADR 与原始回执保留，不追加旧 PR |

## Section 4 · Future Considerations

候选不自动成为任务：正式 Brent/路线运费源、政策文本质量、模块拆分、[Fed 流动性校准](FED_LIQUIDITY_RECALIBRATION_BRIEF.md)及年度 SIPRI 更新。来源权利、离线研究和独立模型评审在各自契约中定义；不重新启用旧公开建议、修改冻结协议或按旧油价占比快照直接调权重。

## Section 5 · Audit History

- [历史交接与完成原件](MILESTONE_INDEX.md#immutable-handoffs)：保留迁移前完整 backlog、成本、失败、CSP 负例、来源审查及当时未验项。
- [Energy/Transport 历史](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md)：保留原始证据与适用的领域约束。
- [本轮 Markdown 核查](MARKDOWN_MAINTENANCE_2026_11_10.md)：覆盖口径、精简选择与验证限制。归档不取消未解条件，也不是新授权。

## Section 6 · 工作流约定

每个问题保留一个当前条目：目标/基线、状态、下一步、真实阻塞；状态变化直接更新同一条，不在顶部持续叠加相互矛盾的“最新”。完成后保留一行结论和证据入口，详细过程移到对应历史或任务文档。仅在有意义的实施/验收变化时更新，普通问答不用追加日志。

现有 `check:docs` 验证六个必需章节、内容与链接；不为排版删除其契约。规则、命令、权限或 checker 消费文档改动仍走完整检查及独立审查，按 [AGENTS](../AGENTS.md) 复用相同输入的成功结果，CI/生产验收要求不减。

## 🔄 Session Handoff (最新)

当前交接使用[单一工作表](#active-worktable)与[调度与验收入口](#execution-contract)，不保留独立的第二份“最新任务”列表。每次接续先核对远端 main 和对应证据，再更新原行；已完成记录与历史快照不代表当前待办。
