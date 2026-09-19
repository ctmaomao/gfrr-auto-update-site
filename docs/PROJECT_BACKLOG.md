# Project Backlog · GFRR Auto-Update Site

### 2026-09-18 整体健康度只读审计与验收基线

- **Acceptance baseline**：owner 要求评估项目健康度/强壮度并打分；随后授权把修正后的审计结论与 `check:all` 覆盖分类写入 `docs/`，并明确授权补记本 backlog 条目作为后续整改基线。审计全程只读：未运行源刷新、未付费调用、未写生产数据、未部署、未改任何 checker 断言或 `check:all` 组成。
- **结论**：综合 **7.6 / 10**（加权 7.625）。**未发现已证实的、可利用的高危漏洞**；主要问题性质为工程债务与外部依赖韧性。评分口径、实测证据表、修正记录与方法学边界见 [健康度审计](HEALTH_AUDIT_2026_09_18.md)。
- **验证**：`npm run check:all` 退出 0（展开 139 个叶子命令，约 363s）；`npm run test:unit:coverage` 896/896 通过退出 0；`npm run check:market-pricing-freshness` PASS；`npm audit` 0 漏洞；`npm run check:docs` 退出 0（246 个 md、0 链接/锚点问题）。改动范围为 2 个新增文档 + `INDEX.md` 登记 + 本条目；`git status` 显示 `scripts/`、`data/`、`.github/`、`package.json`、`index.html` 改动数为 0。
- **覆盖口径修正**：`check:all` 可达 `check:*` 为 **227 / 244**，未纳入 **17 项**，逐条分类与 meta-checker 需求见 [覆盖分类提案](CHECK_ALL_COVERAGE_CLASSIFICATION.md)。此次审计中该数字曾被连续误判两次（51 → 223 → 227），误因均为静态 grep 与不完整套件展开；17 项例外经核对**全部可解释，不存在未记录的覆盖缺口**。
- **待办（本审计派生，尚未实施，各自需独立授权与评审）**：
  1. `check:all` 覆盖 meta-checker——按 [覆盖分类提案](CHECK_ALL_COVERAGE_CLASSIFICATION.md) §3 落地只读检查器，17 项白名单逐条附理由、边界与 unlock 路径；建议纳入 `check:docs`。
  2. 巨型冻结文件的渐进拆分——对 `scripts/run-daily-pipeline.mjs`（11,212 行 / 435 个函数）等热点，沿用已验证的「提取纯函数 + 新旧输出等价比对」模式，并考虑制度化为改动时的强制伴随项。**不解除 `AGENTS.md` §3 的禁止大规模重写保护。**
  3. `LICENSE`（已完成，MIT 仅覆盖代码；第三方数据边界见 README 与 DATA_SOURCES.md）、`SECURITY.md`（已完成，报告与披露边界见根目录文件）、lint/format 配置、CSP 评估。
  4. 外部额度耗尽的用户可见「来源降级」状态，避免静默缺失。
  5. Pages 部署重试的可观测性：四次重试均带 `continue-on-error`，建议在 Summary 中显式保留初次失败、重试次数与总耗时。
- **未验证项**：线上站点仅验证 HTTP 200，未做内容级或数据一致性比对；未在本轮触发远端 CI；`npm run test:e2e` 未执行（34 项浏览器验收为上一轮回执）；`review:*` / `monitor:*` / `audit:*` 等手动入口未逐项核验；本地未跟踪残留目录未做内容级清理判定。

### 2026-09-18 Tavily 统一用量与实际限额

- **Acceptance baseline**：owner要求登录核查Tavily控制台，并立即实现统一用量记录和实际预算限制；owner随后明确要求“请上线生效”，授权本任务推送、集成和账本初始化；独立审阅要求仍保留，不新增付费搜索验收。
- **实施**：见 [ADR-0059](ADR/0059-tavily-runtime-budget.md)。四个Tavily入口共享独立GitHub账本，调用前读取官方用量并CAS预留；滚动31天950、自动800、手动150，账户保留50。缺失/损坏/不确定账本停止，失败不退额，不改频率/可信新闻或DeepSeek门槛。
- **验证**：`npm run check:changed` 执行完整 `check:all`，最终退出0；预算与密钥池专项25/25、Macro发现专项11/11、Epoch工作流专项16/16、文档检查和 `git diff --check` 均通过。新增回归覆盖并发末额度、未知写入、损坏/丢失账本、账户/模式限额、时钟、密钥轮换和实际collector零请求阻断。首次全套发现生产job哈希锁定；ADR明确记录仅新增账本token行的精确基线更新，保持严格等式并增加candidate无token断言，待独立审阅。无真实搜索、无生产数据写入；真实用量API/远端账本联调未执行。
- **上线准备**：已合入main的#406/#407并保留其实现；集成后完整 `check:changed`/`check:all` 退出0，预算专项26/26、workflow专项23/23通过。账本已获授权初始化并读回，初始head `243e31503736db230ed528bfb2624efb3b7e3b34`、记录0；新增只读状态workflow供合并后验证官方用量，零搜索/零预留。
- **待办**：完成独立人工审阅、远端CI、集成和只读用量验收后上线（上线授权已取得，账本已初始化）；账户1000/1000不因代码修复恢复。控制台单key圆环可点击显示1000/1000，总量包含已删除key；无可见请求明细/明确免费周期日期。


Current project state and open work. Dated implementation/approval receipts are preserved without deletion in [2026-09-18 handoff archive](PROJECT_HANDOFF_HISTORY.md#handoff-2026-09-18-health). Historical next steps are not current tasks or renewed budgets.

## Section 1 · 维护状态

本轮 owner 要求先核实四项旧问题，再逐项实施整体体检整改，沿用独立 AI 审阅、逐项 commit/push/合并授权。当前执行清单与待验边界见 [健康整改](HEALTH_REMEDIATION_2026_09_18.md)。Node/最终复验/请求保护已修复；本机 Playwright 漂移已修正，34 项浏览器验收通过。

| 项 | 当前依据 / 职责 |
|---|---|
| Release/display version | `v28.0.10`；以 package.json / release 定义为准 |
| Data/decision contract version | `data.version` / `decisionModel.contractVersion` 保持 `v27.0`，不可机械同步展示版本 |
| Cache version | `oil-news-quota-status-1` |
| 前端输入 | M-94 首页读取 `data/radar-data.json`；`scripts/modules/realtime.js` 冻结、未接入 |
| Worker 预览 | `/market.worker-preview.json` 主预览；`/market.secondary-preview.json` 仅 secondary diagnostics，不代表前端入口 |
| Daily 输入 | `realtime-data`；不切换到 Worker endpoint |
| 检查组成 | package.json / scripts/check-suite.mjs 为准，不手抄数量 |
| 当前任务 / 最新证据 | Section 2 与最新 Session Handoff；历史快照见[归档](PROJECT_COMPLETED_HISTORY.md#maintenance)，不据旧日期推断线上健康 |

跨任务权限、独立展示/主评分隔离、源权利与失效降级统一按 [AGENTS](../AGENTS.md)、[领域附件](AGENT_DOMAIN_BOUNDARIES.md)、[DATA_SOURCES](DATA_SOURCES.md) 和 [DATA_CONTRACT](DATA_CONTRACT.md)；运行/部署步骤见 [OPERATIONS](OPERATIONS.md)。Transport capped free-proxy 的现行窄范围例外见 P3-19a，不能把一般 display-only 规则误用为撤销该授权。

当前专题审阅入口：**Market Pricing freshness/alignment review**（display-only，`check:market-pricing-freshness`）、**FOMC Minutes tone/topic quality review**（display-only）、**World Order source-health consistency review**（overlay-only）。这些入口不触发抓取、付费或发布，时效与验收以本次实际检查为准。

---

## Section 2 · Open Backlog Items

### 当前实施与真实等待

- **本轮代码**：#403 搜索额度隔离、#404 Pages 实际 main 固定及 ODP 发布衔接均已审阅合并。#406 已关闭过期恢复入口并精简重复交接；最后的 12 个纯统计函数提取已实施；本轮交付状态按各提交的独立审阅、CI 和 PR 回执核对。每步仍须对应检查、独立审阅及 CI。
- **外部搜索额度**：Tavily 已观察到 432；本轮暂停耗尽密钥不能恢复账户余额。不新增订阅、付费重试或放宽可信新闻门槛，下轮已有计划自动探测。
- **ACLED**：#400 双站恢复已验收；#402 周一/三/五分频已上线，26/14/14、每周最多 54 请求，initial 已耗。尚无新分频自然运行回执；不以 dry-run 或重跑 initial 替代。现行自动化和源权利边界见 [运行说明](ACLED_AUTOMATIC_UPDATE.md) / ADR-0055/0056；旧 HAPI 候选不是已上线替代源。
- **压力研究**：冻结 cohort `pressure-shadow-29d69c0ecb7b98a0`，自然 schedule 35312632784（2026-09-18T05:54Z）已成功；当前已验 artifact 为 2 条记录、2 个不同输入、1 个经过日、0 个基准周，仍禁止晋升。继续现有自动采集；84 日/40 输入/12 周门槛及 [最终评审标准](PRESSURE_MODEL_FINAL_REVIEW_STANDARD.md) 不变，最早时间门槛 2026-12-10 UTC，不承诺届时晋升。
- **其它观察/源权利**：新闻 v5 的 30 天/120 样本、卫星设施窗口与独立晋升、ARR 跨周期回执、运输商业源和 ACLED/HAPI 资源许可按各自领域文档保留。未在本轮刷新取证的旧统计不冒称当前状态；归档不等于关闭。

### P0 Items

No active P0 item.

### P1 Items

No active P1 item. ACLED/SIPRI/GDELT、Pages trigger coverage、World Order refresh、market pricing history merge 和 check-suite compaction 已关闭;历史见 [MILESTONE_INDEX.md](MILESTONE_INDEX.md)。

### P2 Items

No active P2 item. P2-14 Bubble Watch weekly editorial 与 P2-15 Macro Risk DeepSeek 编辑层均已于 2026-08-11 完成并上线；边界见对应设计文档与 ADR。

- **2026-08-14 Macro Risk Editorial #6 source-readiness repair**: scheduled run `31764341561`
  的 Tavily/Brave 12/12 topic 查询均成功并返回 30 条脱敏结果，但全部被标为
  `discovery_only`，compact input 在 DeepSeek 前正确 fail closed；paid calls=0、production
  writes=0。artifact 中实际包含 `comptroller.nyc.gov` 官方页面，暴露 `.gov` 未纳入窄
  official allowlist 的分类缺口。修复把受资格约束的美国 `.gov` 根域/子域识别为 official，
  并增加双搜索完全健康但确无 credible news 时的 `SKIPPED_NO_CREDIBLE_NEWS` 路径：只上传
  脱敏 artifact/Summary，严格跳过 provider/review/write；源健康异常、schema/contract 或
  provider/write 故障仍 hard fail。未触发付费 rerun，生产验证等待下一次自然 schedule。
- **2026-08-14 Macro Risk Editorial #7 credible-reference follow-up**: owner 授权的单次 dispatch
  `31791928277` 已在 `main@8c515de2` 执行 exactly one DeepSeek call/no retry；discovery 成功把
  `comptroller.nyc.gov` 标为唯一 official，provider output 的结构、4,336 字长度、29 个来源、
  unsafe/scoring 边界均通过，但所有事实对象均未实际引用该 official ID，review 以
  `credibleNewsReferenceCount=0` fail closed，production write/commit=0。follow-up 只强化
  prompt：单独枚举 credible news IDs，并要求 weeklyTimeline 与全体事实对象引用并集至少
  实际引用 1 条；新增 provider 完全忽略可信新闻时仍 hard fail 的负向回归。不自动补引用、
  不改 reviewer、不重试本次付费调用。
- **2026-08-17 Bubble Watch Weekly Editorial #9 source-readiness repair**: post-refresh run
  `31999823886` 的 Tavily/Brave 均为 6/6 `ok`，30 条脱敏结果全部为 `discovery_only`；旧流程
  在 compact input 后以笼统的双 provider 错误非零退出，实际 DeepSeek calls=0、production
  writes=0。修复仅把“双索引完全健康但可信新闻为 0”归类为
  `SKIPPED_NO_CREDIBLE_NEWS` side-effect-free expected skip，并用 step outputs 守住 provider、
  review、writer、validation、commit 七个后续步骤；任一搜索源异常仍 hard fail，可信来源门槛、
  单次调用/no-retry 与 deterministic fallback 均未改变。真实失败 artifact replay 已证明
  不创建 input/output/review/projection、不写 production data。

### P3 Items

#### P3-10: Fed dot plot / OIS / FOMC 文本

- 已连接: FRED target range / DFF、Yahoo ZQ futures proxy、Fed SEP / statement、FOMC minutes keyword count、Yahoo SR3 SOFR futures proxy、CheckMySwap USD OIS public curve。
- **FOMC Minutes tone/topic quality review(2026-07-26)**:新增 `review:fomc-minutes-tone-quality` / `check:macro-drivers-fomc-minutes-tone-quality`,离线复算差值 8 语气阈值、六类 topic 排序与摘要,并检查官方 URL/日期、70/120 天证据龄、完整 missing/fallback 降级及预测/交易/决策语言。默认只写 ignored manual artifact；`WATCH` 不阻断 `check:all`,`FAIL` 阻断。保持 audit-only / display-only,不联网、不改 Daily parser/frontend/Worker,不写 production data,不进入 scoring/decision/execution/position/cross-validation。
- **Build Daily Radar Data 连续失败修复(2026-08-22)**:runs `32310598436` / `32426366840` / `32534582205` 均完成 Daily build、schema validation 与 Summary，最终在提交前 `check:all` 被 FOMC minutes quality checker 误阻断。根因是 checker 用 `2026-07-26` synthetic fixture 时钟审阅随生产更新的数据；新一期 `2026-07-29` minutes 因而被误判 `minutes_date_in_future`，并连带令 fallback 枚举断言失败。修复把生产 review 恢复为执行时真实 UTC，冻结时钟只用于固定 `2026-06-17` synthetic base；新增 post-fixture release 回归及 failure-code 日志。官方 URL/日期、计数、摘要、freshness 与 display-only 边界均未放宽。
- **2026-08-23 Daily + Macro Risk recurrence hardening**:Daily run `32603408325` 与前 3 次相同，仍在旧版 FOMC checker 上失败；原因不是新缺陷，而是 2026-08-22 修复尚未 commit/merge 到远端 `main`。Macro Risk run `32611546425` 完成双搜索、compact input 与单次 DeepSeek 请求，HTTP 200 / `finishReason=stop` / retry=0，但旧长度 checker 报可见正文 `8116` 超出 6800，保持 production write=0。审计发现旧 `visibleEditorialText()` 递归计入 `sourceRefIds` 等不在页面显示的机器字符串；近 11 个成功 production artifact 中该元数据贡献约 1,500–2,300 字，引用越充分越容易误撞长度门。修复改按实际前端字段计数，新增 citation-rich metadata 回归、真实正文超长 fail-closed 回归、section-level 脱敏长度 diagnostics，以及 6,200 字 prompt 分区预算。6,800 hard cap、来源/危险文案/review/writer 门禁、一次调用/no retry 与 deterministic fallback 均未放宽。
- **World Order source-health consistency review(2026-07-26)**:升级既有 `review:world-order`,按 GDELT/OFAC/SIPRI/ACLED 四源状态重算 `freshness` 与 `sourceMode`,并以 synthetic replay 锁定单源降级、聚合错配、降级高置信提示、source timestamp、结构性风险叙事及 `decisionModifier` future-reference-only 边界。同步移除旧“配置 ACLED credentials”运维提示,改为 weekly/monthly xlsx + sanitizer。默认 WARN 不阻断、FAIL 阻断,`--strict` 供人工硬复核；保持 read-only / overlay-only,不联网、不写 production data,不改评分、权重、前端或 workflow,不进入 values/main scoring/decision/execution/position/Worker/cross-validation。
- **Refresh World Order Stress #83 CI 修复(2026-07-27)**:scheduled run 在 `marketConfirmation.state=weak` 时命中 scorer 的 neutral `decisionModifier.appliesWhen`,旧文案缺“未来/参考”且含 `decisionModel`,被上项新 reviewer 同时判为 `decision_modifier_reference_boundary_missing` + `unsafe_prediction_or_action_language`,导致 build 成功后 `check:world-order` 失败。修复仅对齐 neutral/high-confirmed 两个 canonical 文案到 future-reference-only 契约,并新增 weak-market scorer replay、high-confirmed 文案与 coherent degraded `WARN` 枚举回归；不改 World Order score/state/weights/source、market-confirmation 计算、workflow、frontend 或任何 scoring/decision/execution/position 路径。
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

#### P3-16: China Macro Liquidity / Property Evidence Layer (70 城已实施 · 余 source-review)

- 可接入(官方操作级/公告级/指数级公开数据): **NBS 70 城房价指数 = 已实施(Stage 10 `d15f3da`)**;**PBOC OMO 公告 = 已实施(Stage 11 `53ca93a`,逆回购利率·期限·中标量,no-op 分支)**;**社融组件分项 = 已实施(Stage 12 `eb0c47e`)**;**MLF 招标公告 = 已实施(Stage 13 `9116bb0`,操作量·期限·可选利率,rate null 合法)**。**P3-16 实施源全部完成(70城/OMO/社融/MLF)。**
- 仅历史/inactive: PBOC SLO(滞后约 1 月披露、无近期常态操作;**≠ Fed SLOOS** = FRED `DRTSCILM`/`DRTSCIS`,已在 `macroDrivers.credit`)。
- 仍不可达: 逐机构/逐笔/逐交易对手 raw tape、社融贷款底层微观明细、70 城房源级原始成交。
- 边界: 若未来实现必为 audit-only/display-only;不进 scoring/decisionModel/executionLock/positionGuidance/Action Queue/Trigger Monitor/Invalidation Rules/`values.*`/`displayInputsBaseline`/`effectiveDisplayInputs`/cross-validation;公告级/指数级 ≠ raw tape;字段名/文案/notes 不得暗示替代。
- ✅ **pbc.gov.cn 地理封锁已绕过(2026-05-30)**: `pbc.gov.cn` 在 GitHub US runner 域名级地理封锁 → 三 pbc 源曾全 missing。**已全部改抓 EastMoney 搜索聚合并线上验证 live:`chinaTsf`(Stage 14)/ `chinaOmo`(Stage 15)/ `chinaMlf`(Stage 16)**。EastMoney 搜索 JSONP + 新闻/正文解析 + 硬验证门 + fail-closed,source 标聚合非官方。
- 状态: **70城(stats.gov.cn)+ 社融/OMO/MLF(EastMoney 聚合,Stage 14/15/16)四源全 live**;source 标聚合转载非 PBOC 官方,audit-only;SLO 仅历史/inactive。详见 [`CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md`](CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md)。
- unlock: **P3-16 四源代码全实施 + runtime 可达性全恢复(US runner 全 live)**;SLO 无近期常态操作不追;未来若要更细分项/更高频可另开 stage。

#### P3-17: 2026-06-02 Codex 审计终裁 — 剩余清理项

已完成 F1–F6 处置及 F7 文档归档线，原始复核与验收见[阶段记录](PROJECT_COMPLETED_HISTORY.md#p3-17)。F7 仅余大型 `.mjs` 拆分候选：这是独立重构建议，不是已授权任务或当前故障；没有具体收益与独立验证方案时不启动。

#### P3-18: 展示层 stale-display 收口(2026-06-02,用户报告)

**已关闭，无 pending 后续。** Tier-1/2 与 WIRE A–E 的实施、更正及验收见[原文](PROJECT_COMPLETED_HISTORY.md#p3-18)。新的前端维护按现行 DESIGN、asset bump 与冻结文件规则执行，不复用历史 `git checkout` 恢复指令作为默认动作。

#### P3-19: Oil Directional Pressure (ODP) 油价方向压力研判 — 能源专题(PR1–PR5 全 merged · ODP 收官)

- **状态与边界**：PR1–PR5 及后续证据展示已实施。ODP 是独立 audit-only / display-only 能源专题，与 Global Risk Heatmap 分离；不进入 `values.*`、主评分、decision/execution/position 或 cross-validation。EIA 周度物理锚、价格背离及慢变量 global overlay 按现有契约工作；不足时显式“暂不判断”，不将新闻、热异常或 AIS 代理解释为事故/封锁/断供确认。
- **契约入口**：[ODP source-of-record](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)、[数据契约](DATA_CONTRACT.md)、[数据源](DATA_SOURCES.md)、[energy 规则](AGENT_DOMAIN_BOUNDARIES.md#energy)。PR2 预登记窗口/回测门槛仍有效；[阶段原文](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md#odp-records)保留历史验收证据，当前实现见 `scripts/oil-directional/backtest-oil-directional.mjs` 与 `odp-classifier.mjs`，不事后调阈值制造通过。
- **Oil News / Web NGrams**：自动 aggregate display cache 与 article shadow 已接入；当前 discovery 仍为 `gdelt_doc_primary_web_ngrams_shadow`，依据 [routing policy](../config/oil-news-discovery-policy.json) 与 [GDELT 源契约](GDELT_SOURCE_POLICY.md)。Web 不作 current-signal/event-confirmation/scoring 输入，前端不读取标题/URL/正文。9 月 5 日分类修复后的 v2 口径须独立积累 30 天/120 usable samples，不混算旧历史；其余质量门和独立支持标准不变。通过 readiness 只允许提交人工切换审阅，`automaticCutoverApproved=false`；本轮未重新跑观察窗审阅或批准切源。
- **Oil Thermal / FIRMS**：9 月 5 日已完成 P68 成熟基线晋升；本轮读到的 [baseline config](../config/oil-thermal-watch-baseline.json) 为 42/42 设施、最短窗口 35.48 天、`established_observation_window`，旧 P60/P68 的“尚待首次晋升”不再是当前待办。继续按 [P65 容量规则](OIL_THERMAL_HISTORY_WINDOW_CAPACITY.md)与 [P60/P68 领域门槛](AGENT_DOMAIN_BOUNDARIES.md#energy)观察：健康样本过滤、全部设施最短 30 天窗口和后续人工 promotion 保留；成熟不代表事故确认或接入 ODP/scoring。这里核对的是本地已提交配置，未重做线上验收。
- **后续与验证**：保留 Web v2 同口径观察/独立切换审阅、FIRMS 后续健康/质量观察；不因时间经过自动晋升。ODP verdict monitor 的 persistent-low-confidence 只是观察提示，不单独要求立即操作或放松 classifier。改动验证遵守 AGENTS §5；`check:oil-directional` 的现行组成见 package.json/check-suite.mjs，完整检查已覆盖的专项不重复跑。

#### P3-19a: Energy Stress Phase 2 — OPEC spare capacity implementation + chokepoint source-review

- **已实施的证据层**：STEO OPEC spare capacity、OECD 库存/全球净抽库及 PortWatch compact chokepoint 摘要已接入；具体口径见 [Energy inventory source review](ENERGY_INVENTORY_BALANCE_SOURCE_REVIEW.md)、[DATA_SOURCES](DATA_SOURCES.md)与 [energy 规则](AGENT_DOMAIN_BOUNDARIES.md#energy)。这些慢变量不自行成为 Oil Bull Score / World Order weight / 主评分输入。PortWatch 保留 AIS-derived、缺失/陈旧降级和第三方再分发 caveat，不提交 raw AIS 历史。
- **现行窄范围入分授权**：[P-score-50 owner approval](fixtures/transport-shock-confirmation-factor/runtime-scoring-migration-authorization-v1.json)及 [P51–P56 runtime 规则](AGENT_DOMAIN_BOUNDARIES.md#transport-runtime)允许仅从 PortWatch free proxy 派生 `transportShockScoringImpact`：live、age≤7 天、eligible、watch/elevated_watch 且满足既有阈值时贡献 +1/+2/+3，硬上限 +3，默认 fail-closed 0，不降低主分。该授权不扩展至 ODP finalBias、Brent promotion、Heatmap、cross-validation 或 Bubble Watch。
- **仍未解锁的独立路径**：`routeFreightConfirmation` / `marketConfirmation` 仍 `not_connected`；高置信 readiness 仍须对应 source-rights/生产接入/独立设计审阅。旧 manual/replay/projection/preflight helper 的成功不等于 runtime、route、market 或发布批准。P30/P33 固定白名单 manifest 只解决证据交接，不把人工样本结果当模型历史回测；具体手工边界见 [transport-manual](AGENT_DOMAIN_BOUNDARIES.md#transport-manual)。
- **双路径审阅**：`review:transport-shock-path-boundaries` 按同一 runtime-policy 快照核对 eligibility 与 contribution，并独立列出高置信 readiness；已获批 capped runtime 与未获批路线/市场确认可以同时存在，不构成冲突。该审阅只输出 ignored artifact，不写分数、生产数据或扩大权限。
- **源权利与待办**：路线级油轮运费仍须独立 source-rights/production-write 批准；不新增官方 Baltic 源，删除/合并现有 StockQ BDTI/BCTI/BDI 须独立 deprecation review。StockQ 来源恢复依赖见 Section 2 的 9 月 5 日事项。PortWatch 现有 writer 使用 `imf_data_terms_pinned` 且 `redistributionCaveat=true`；[TOS pin 决策](PORTWATCH_TOS_PIN_REVIEW.md)保留 legacy `partial` 兼容，收窄 validator 前仍需指定 Daily proof 与对应审阅。
- **阶段原文**：[Energy / Transport 实施记录](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md#energy-transport-records)保留所有批准、失败、未解锁条件和证据。当前没有自动启动的新实施 milestone；本次只整理文档。

- **验证入口**：production-refresh、runtime-score-policy 及其 monitor 继续核对既有快照与入分政策；使用 `check:changed` 选择必要检查。这些检查不授权真实刷新、生产写入或改动评分。历史阶段/schema 由校验器直接读取领域历史文件（[ADR-0028](ADR/0028-energy-record-assertion-location.md)）。


#### P3-20: External AI 深化 — analyst_compact_v1（COMPLETED HISTORICAL；旧可见层已于 2026-08-11 退场）

**已完成并退役，无待实施阶段。** 旧可见层与 scheduled refresh 于 2026-08-11 被 integrated `macroRiskEditorialLayer` 取代；旧字段仅数据兼容/手工诊断。当前首页 AI 按 [Macro Risk 契约](MACRO_RISK_EDITORIAL_DESIGN.md)与[统一状态说明](LEGACY_DOCUMENT_STATUS.md#external-ai)执行，所有 AI 层继续不改 scoring/decision/execution/position。PR0–PR4b 和旧审批原文见[历史记录](PROJECT_COMPLETED_HISTORY.md#p3-20)。

#### P3-21: AI 泡沫监测第二页面(Bubble Watch · ADR-0016,一次性落地)

来源:2026-06-11 owner 提供外部静态页 zip,要求 1:1 动态复刻 + 与主页书签互切。**display-only 独立专题页,不进 GFRR scoring/decision/execution/position**(同 CLAUDE.md 绝对规则 3/4 的同类边界)。

- **数据管线**:`scripts/build-bubble-watch.mjs`(零依赖)→ `data/bubble-watch.json` + `data/bubble-watch-history.json`;周一 cron `refresh-bubble-watch.yml`(+dispatch),已登记 Pages workflow_run 清单 + push paths(`bubble-watch.html`)。周二至周五只读源健康审计 `.github/workflows/audit-bubble-watch-sources.yml`:`contents: read`,不提交、不触发 Pages,默认 `BUBBLE_WATCH_DISABLE_WIND=1`,只在手动 paid opt-in 时用 `WIND_API_KEY`;审计报告 artifact 来自 `scripts/audit-bubble-watch-sources.mjs`。24 指标 × 6 分类:**12 项自动实时接入**(FRED HY OAS/DFF/CPI + keyless CSV fallback、Yahoo SPY/RSP/全成份股广度实算、SEC EDGAR capex/FCF/NVDA 收入/RPO + StockAnalysis/Fiscal.ai RPO metrics 二级源、multpl CAPE、SPY holdings Top-5、SEC EDGAR Form 4 卖买比、stockanalysis NVDA fPE),**12 项 curated-origin** = `config/bubble-watch-curated.json` + `config/bubble-watch-source-candidates.json`;其中 11 项已 hybrid live(VC AI 占比、AI IPO pipeline、debt/capex ratio、neocloud credit events、token volume MoM、token/spend proxy ratio、AI ARR second derivative、enterprise deploy、会计/round-tripping 事件、capex reaction、CEO 对冲语言),先抓 Crunchbase News / Morgan Stanley public research / OpenRouter rankings + model catalog / CoreWeave-Lambda-Crusoe-Nebius public credit monitor / SaaStr ARR milestone monitor / Google Cloud-Deloitte public reports / SEC RSS + DOJ News API / StockAnalysis+Yahoo capex reaction proxy / GDELT / Tavily / Brave,失败再回人工快照或已登记 Wind paid final fallback。`dc_abs_spread` 为 Wind MCP `hybrid_paid_optional`,有 `WIND_API_KEY` 时用数据中心 ABS 样本 + 中国 ABS AAA 基准 + 新闻证据生成 paid proxy,无 key/证据不足则回人工快照。全部 fail-closed 沿用带日期快照。
- **打分 1:1 复刻并机器锁定**:red_pct 四档(25/40/60)+ 加权风险分 (红+0.5黄)/指标总数(当前 24) + 分类强制升级(红灯占比 ≥50% 的分类 ≥2 个 → 至少「高风险预警」);`check:bubble-watch`(6 leaf,入 check:all 第 18 项)对 verdict 全量 replay + provenance/stale 一致性 + boundary(app.js/index.html 不读专题数据、build 不碰 radar-data/realtime、双侧书签存在)。
- **前端**:`bubble-watch.html` 独立单文件页(内联 CSS/JS,原版报纸排版 1:1;Chart.js → 手写 SVG 平滑双线 + tooltip,守 ADR-0001 零依赖);历史种子取自上游 ai-bubble-monitor Issue 001-009 真实序列,WoW 翻灯按上期 statuses 比对。
- **书签互切**:`.page-bookmarks` 纯 CSS 彩色丝带(index 侧在 `assets/styles.css`、专题侧内联,双侧同构契约见 DESIGN.md §4.4)。
- **已知边界**:SEC EDGAR 对数据中心 IP(含 GitHub runner)整段 403(首轮 CI dispatch 实证)→ capex/FCF/NVDA 收入走 stockanalysis 季报镜像二级源(EDGAR→镜像→curated 三级 fail-closed);Cloud RPO 改为 EDGAR→StockAnalysis/Fiscal.ai metrics→curated 三级 fail-closed,当前本地实证 MSFT/ORCL/AMZN/GOOGL 全部由免费 metrics 镜像自动覆盖;Top-5 为 SPY 持仓口径、广度为全成份实算(非 Barchart S5FI 官方序列),均已在 source_name/note 标注。
- **上游周报自动同步**:编辑/研究类 12 项 + autoFallback 快照每轮 build 自动对 aibubble-cn.github.io 上游周报(端点 = ai-bubble-monitor `latest.json`)做「上游更新即采纳、回写 config 随 workflow 提交、拿不到下周一再查」滚动同步(`meta.upstream_sync` checker 强制);采纳/无采纳两分支均本地实证。同步入口已加固为 raw latest -> 上游 GitHub Pages latest -> GitHub API snapshots 最新快照,防止单一页面/单一 latest 失效。人工改 curated config 仍可用(asOfDate 更新后旧上游数据不会覆盖)。
- **上游依赖降级 / 源候选**:`bubble-watch-source-candidates-v1` 矩阵强制覆盖 12 项 curated-origin、11 个 `hybrid_live` builder 与 1 个 `hybrid_paid_optional` builder。目标不是抄上游,而是让可抓取证据先独立覆盖;已将 `debt_capex_ratio` 纳入 Morgan Stanley public research hybrid live,把 `accounting_events` 主源从易 403 的 SEC/DOJ 搜索页换成 SEC RSS + DOJ News API,并为 `ai_ipo_pipeline` / `accounting_events` / `token_revenue_ratio` / `enterprise_deploy` / `capex_reaction` / `ceo_hedging` 登记 Wind paid final fallback。Cloud RPO 已接入 StockAnalysis/Fiscal.ai 免费 metrics 二级源,Wind announcement/fundamental 路径仅作人工排查备选,不得自动付费改灯。免费 L&G/IMF/CRAI/Vantage/GDS/上交所等仍只作证据和校准;Wind 样本券专属估值利差为空时不得伪装成正式连续利差。`insider_sell_buy` / `ai_ipo_pipeline` / `capex_reaction` / `ceo_hedging` / `token_revenue_ratio` / `enterprise_deploy` 已升级为代理源置信度校准:`local_proxy_confidence_v1` 用本地多源/样本阈值决定是否降档,上游/curated 只可在 `maxAgeDays` 内作为显示值锚点,原始自动判级保留在 `provenance.detail.proxyConfidenceCalibration` 与 `meta.proxy_confidence_calibrations[]`。
- 状态:**全链 live**。本地实证 **24/24 auto/hybrid**、curated 0、fallback 0;代理源置信度校准覆盖 6 个易噪声指标,本轮实际触发 5 项,当前产物仍为 **4 红 / 8 黄 / 12 绿**;两页页脚显示 radar.gfrfinradar.uk 域名。

---

## Section 3 · Completed Items

仅保留完成摘要；完整阶段验收、commit/run ID 与旧实施步骤见[完成记录原文](PROJECT_COMPLETED_HISTORY.md#completed)，不重开已关闭任务。

| 已完成事项 | 现行边界 / 入口 |
|---|---|
| M-71 Brent public proxy source review | 公共代理和主值晋升隔离，见 [Brent source review](BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md) |
| M-91 / P2-12 Market Pricing NDX/IXIC implementation | QQQ primary、NDX/IXIC auxiliary，display-only；见 [M-91](MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md) |
| ACLED weekly/monthly 工具 | 手工输入、源权利及现行发布保护仍按 [M-63](M-63_ACLED_INTEGRATION.md) |
| 9 月 5 日来源、观察层与发布修复 | 完成证据和未关闭外部依赖见 Section 2 对应事项及 [验收清单](REVIEW_2026-09-05_CLOSEOUT.md) |
| 指令与文档治理 | 当前交接记录实现/验证状态；各阶段回执保留历史证据 |

---

## Section 4 · Future Considerations

- Brent physical side: pursue formal Platts / ICE settlement only through a separate reviewed source contract.
- Policy text: improve FOMC tone quality review without turning it into a decision engine.
- Backtesting: replay historical narrative triggers around 2008 / 2020 / 2022.
- Fed liquidity recalibration: follow [`FED_LIQUIDITY_RECALIBRATION_BRIEF.md`](FED_LIQUIDITY_RECALIBRATION_BRIEF.md) only as artifact-only research. Current verdict remains `needs_recalibration`; TGA remains `tga_incremental_signal_not_proven`; no runtime/formula/scoring/data integration is approved.
- 油价集中度校准(批 D 评审决议 = A,本轮不改):风险总分 **28.456%** 来自单一 Brent 标量(geo 0.72 + energy 0.82 + inflation 经 `oilInflationWeight` 0.35,均同一 `oilRisk`)。**非 bug、零决策影响**——去重在 $60–$120 全区间不翻转 executionLock/strategyState/positionGuidance(执行灯红/黄走**直接 Brent 阈值** ≥110/≥90,非加权 score)。若未来主动降集中度,最小且零决策影响的杠杆 = `config/rules.json oilInflationWeight 0.35→0`(掉约 4 分),须配回测 + 版本化评审,不在常规批次内做。
- Worker reliability: consider additional fallback only after current Worker-first health has enough observation time.
- Stooq 死源清理(2026-06-01 发现): Stooq 的**日线历史 CSV 端点** `/q/d/l/?s=...&i=d` 现对多数 symbol API-key 门控(返回 `Get your apikey:`)。已移除 realtime `gold`(xauusd)与 `spx`(^spx)两个**死 stooq alternate**(行为中性:dead source 从不产值,goldapi/FRED 仍为主源)。**剩余低优先清理**:worker `fetchStooqBrentCandidate`(`brn.f` 返空 / `brn.c` 被门控),属 diagnostic-only、不进 promotion/values。注:Stooq 的**实时报价端点** `/q/l/?s=...&e=csv` **仍可用**(realtime Brent `cb.f` 实测返 live close),故 worker Brent Stooq 可改走 `/q/l/` 或直接移除——但 Brent 本就多源充足,纯去误导性死代码,不急。owner 决议:gold 不加新 fallback(非关键展示值、gold-api 稳定、唯一现成源 Yahoo GC=F 撞 rule #2 字面)。
- Annual SIPRI refresh: update normalized data after SIPRI releases the new annual dataset.
- FRED sourcing policy (P2-13 起): 新增 FRED-able 数据一律走官方 API（`FRED_API_KEY`），不加 CSV 端点(疑似永久关闭)。2026-05-29 审计:现有 FRED-able 数据已基本全接 FRED;非-FRED 源多为 FRED 不提供者(Baltic 运价/ETF 代理/期货曲线/ISM PMI〔FRED 无授权〕/Cboe 盘中/gold-api/CFETS 篮子/HTML 摘要)。边缘候选(产品决策):DXY 卡接 `DTWEXBGS`(已抓,属展示接线)、CFETS RMB 用 `DEXCHUS` 双边代理(非篮子,需 proxy 声明)。CSV fallback 长期若确认废弃可一次性清理删除。

---

## Section 5 · Audit History

截至 2026-09-06 的逐次审计表已[原文归档](PROJECT_HANDOFF_HISTORY.md#audit-history)。当前维护结果见最新 Session Handoff；未关闭事项仍在 Section 2。归档不构成关闭或重新授权。

---

## Section 6 · 工作流约定

Add or update backlog items with these rules:

1. Keep one item per problem; do not bundle unrelated sources or UI work.
2. Record priority, current status, data boundary, expected output, and verification path.
3. When an item closes, keep only a one-line recent summary here and move detail to [MILESTONE_INDEX.md](MILESTONE_INDEX.md) or a scoped doc.
4. P3 / won't-fix / source-review items must state the boundary reason and the unlock path.
5. This file's required-section format is validated inside `npm run check:docs` (merged from the former `check:project-backlog-format` in checker Phase 2 / M-DOC-1) and runs as part of `npm run check:all`.

---

## 🔄 Session Handoff (最新)

- **当前任务**：2026-09-18 健康整改，逐项状态和实测见 [执行清单](HEALTH_REMEDIATION_2026_09_18.md)。#403 / #404 / #406 已合并；最后纯函数提取 PR 以精确 head 的独立审阅、CI 与合并回执为准。同日的**只读整体健康度审计**（7.6/10）与 `check:all` 覆盖分类已获 owner 授权写入 docs 并登记于本文件顶部日期条目；其 5 项派生待办尚未实施。
- **运行边界**：不补发付费 AI，不重跑已耗 ACLED 下载，不删除预算 refs、用户原件或历史；每一项保留原验收保护。审计派生的整改项各自需要独立授权与评审，不因本次登记自动获得实施、推送或发布许可。
- **待验**：自然计划运行与长期模型观察、外部额度恢复仍未完成。网站发布须核对实际 run 和双站哈希，不能用本地通过替代。审计的未验证项（线上内容级比对、远端 CI、浏览器验收、手动入口、本地残留清理）保持未验，不得据审计文档推断为已通过。
- **历史检索**：仅在核对具体旧事件时读取 [完整旧交接](PROJECT_HANDOFF_HISTORY.md#handoff-2026-09-18-health)，不重新执行其中的旧“下一步”。
