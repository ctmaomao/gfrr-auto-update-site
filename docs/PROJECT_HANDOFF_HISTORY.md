# Project handoff and audit history — snapshot archived 2026-09-06

Historical session notes, preserved verbatim below. Their “current”, “next” and approvals describe the dated session, not fresh authorization or today’s task. Current work is in [PROJECT_BACKLOG.md](PROJECT_BACKLOG.md); current Git/approval policy is in [AGENTS.md](../AGENTS.md). A historical unresolved item is not evidence it remains unresolved today.

<a id="handoff-2026-09-05"></a>

- **上次会话结束于(2026-09-05 · 授权刷新后诊断补齐)**: `caa02939`之前的九项修复和追加ACLED/World Order/Daily数据均已独立推送；详细数据日期、run和验证见Section 2与[执行回执](REVIEW_2026-09-05_CLOSEOUT.md)。原有`.agents/`与`skills-lock.json`未跟踪、未改动。
- **当前进行中(2026-09-05 · BoA诊断)**: 补上BoA四阶段脱敏失败日志与15项离线回归；保持既有取数/重试/fallback/数据契约不变，本提交不运行Daily或外部AI、不写production JSON。
- **下一步建议(2026-09-05)**: 下一次自然Daily完成后查`[BoA source diagnostic]`并核对生产报告月；待具体错误证据再决定源/解析处理。检查EdgeOne自然发布后radar/World Order两JSON是否逐字节对齐；不要以Pages成功代替自定义域名发布证据。
- **阻塞或等待(2026-09-05)**: 一次Daily成本授权已使用，未触发Wind候选；BoA云端仍fallback，EdgeOne数据同步待自然发布。MCP应用连接和最终代码索引已恢复，不再阻塞。其余ACLED滞后地区/月表、StockQ/ARR来源、Web v2观察期及运输商业授权继续保留；不能自行制造审批或解除。

- **上次会话结束于(2026-08-31 · shared search API quota repair)**: 新 failure `Macro Risk Editorial Refresh` run `33360332836` 与 Oil News `2026-08-31T06:13:30Z` production artifact 交叉定位为 Tavily HTTP 432 plan limit + Brave HTTP 402，非 DeepSeek/provider-output 失败；连续两次 Macro run 均 0 paid call / 0 production write。
- **当前进行中(2026-08-31 · shared search API quota repair)**: 把 Oil News cadence 从 weekday 3h/weekend 4h 收口为 6h，shared scheduled budget 从约 1,144 降到最坏 737 requests/provider/month，并保留 200 manual reserve；Macro search diagnostics 改为固定脱敏 HTTP/transport category，source-health hard-fail contract 不变。
- **下一步建议(2026-08-31 · shared search API quota repair)**: 合并后等待 Tavily/Brave 月度额度重置或 owner 在 provider dashboard 更新 plan/key，再观察下一次 `Macro Risk Editorial Refresh`；未获新成本授权前不手动触发可能进入 DeepSeek 的完整 workflow。
- **阻塞或等待(2026-08-31 · shared search API quota repair)**: repo 可修复未来预算与诊断，但无法从 GitHub/代码侧重置第三方账户额度；即时恢复取决于 provider 月度 reset 或 owner 的账户操作。

- **上次会话结束于(2026-08-30 · recent Actions failure audit + QQQ fixture repair)**: 有界审计 2026-08-29 至 2026-08-30 的异常 Actions，确认三个 failure：Bubble Watch `33195869034` 是 SaaStr HTTP 429，免费只读 rerun `33304919106` 已自然恢复；Macro Risk `33294290068` 是 Tavily/Brave 各 6/6 `request_failed`，0 DeepSeek call / 0 production write，未做未经授权的付费 rerun；QQQ `33255659131` 是合成 freshness 场景的 commit timestamp 未随日期推进。PR #300 仅修 QQQ test fixture consistency。
- **当前进行中(2026-08-30 · QQQ fixture repair closeout)**: PR #300 已 squash merge 为 `c50dedcb`；manual verification run `33305249169`、data commit `8d88ad58`、Pages run `33305293573` 与 cache-busted live JSON 均已验证，当前无待提交的实现改动。用户未跟踪 `.agents/` / `skills-lock.json` 保持不动。
- **下一步建议(2026-08-30 · recent Actions audit)**: Macro Risk 只观察下一次自然 schedule，确认 Tavily/Brave collector 是否恢复；除非 owner 明确授权一次 DeepSeek 成本，不手动 rerun。Bubble Watch SaaStr 429 已由免费只读 run `33304919106` 验证自然恢复，无需扩大 fail-closed 白名单。
- **阻塞或等待(2026-08-30 · recent Actions audit)**: 无代码阻塞。`npm run check:market-pricing`、精确 2026-08-28 replay、`npm run check:all` 与 `git diff --check` 均 exit 0；Macro Risk 双搜索源是否恢复只能由后续无额外假设的真实 discovery 观察。

- **上次会话结束于(2026-08-12 · Macro Risk Editorial #3 grounding repair)**: 精确审阅 run `31557497174` 日志与三天期脱敏 artifact 后，确认 `provider_output_contract_invalid` 仅由 factual claim[1] 单独引用 `discovery_only` 新闻触发；`productionDataWritten=false`、`frontendChanged=false`，未污染评分/决策链。本地分支 `codex/fix-macro-risk-editorial-grounding` 已落地 prompt/source-ID 自检与第 6 个负向测试；用户未跟踪 `.agents/` / `skills-lock.json` 保持不动。
- **当前进行中(2026-08-12 · Macro Risk Editorial #3 grounding repair)**: 无代码阻塞。相邻异常中，Check All PR #40 已由 #41 修复并随 PR #290 合并；两个 Pages `skipped` 是上游失败的依赖行为，不是独立缺陷。
- **下一步建议(2026-08-12 · Macro Risk Editorial #3 grounding repair)**: PR 合并后，只有 owner 明确确认本次 DeepSeek 成本，才手动 rerun `Macro Risk Editorial Refresh`，再核对 provider/review/projection/guarded write/live validation 与 Pages。不得用重复付费调用、伪造站内引用或削弱 discovery-only validator 换取成功。
- **阻塞或等待(2026-08-12 · Macro Risk Editorial #3 grounding repair)**: 仅保留付费 workflow rerun 授权与生产路径验证；本地 `check:macro-risk-editorial`、`check:all`、`test:unit:coverage`、`test:e2e`、`git diff --check` 均 exit 0，Playwright 7/7 通过。

- **上次会话结束于(2026-08-11 · Macro Overview narrative-first IA)**: P2-15 后续 IA 收口已完成并上线。基于最新 `main` 重放后的 ADR/设计提交 `f30406cc`、前端实现 `99a54e41`、契约/E2E `7fb8efcf` 已推送至 `codex/macro-risk-weekly-editorial` 与 `main`。用户未跟踪 `.agents/` / `skills-lock.json` 保持不动。
- **当前进行中(2026-08-11 · Macro Overview narrative-first IA)**: 无。有效 DeepSeek 判读下 `#macro-professional-evidence` 默认收起；AI 无资格时自动展开五块 deterministic evidence；顶部导航 13 项。
- **下一步建议(2026-08-11 · Macro Overview narrative-first IA)**: 发布后观察一次自然 `Macro Risk Editorial Refresh`，确认新鲜 valid 层继续保持折叠、任何短暂 source-data mismatch 都自动回到展开兜底；不得删除确定性 renderer 或把 AI 接入评分。
- **阻塞或等待(2026-08-11 · Macro Overview narrative-first IA)**: 无。Pages run `31471461291` 成功，workflow 内 `check:all` 通过；本地 `test:e2e` 7/7 通过。线上桌面 1440px 与移动 390px 均确认 asset=`macro-evidence-fold-1`、WoW 紧随有效编辑层、专业证据默认收起且可展开，展开后 7 narratives / 6 engines / 7 coherence rows 完整，横向溢出为 0。

- **上次会话结束于(2026-08-11 · Bubble Watch weekly editorial)**: P2-14 已完成。生产 run `31462238973` / data commit `9ac2b911` / 最终 Pages run `31462975922` 全部成功；最终功能提交为 `32cafd17`，分支 `codex/bubble-watch-weekly-editorial` 与 `main` 已推送。用户未跟踪 `.agents/` / `skills-lock.json` 保持不动。
- **当前进行中(2026-08-11 · Bubble Watch weekly editorial)**: 无。线上 `summary.weekly_editorial` status=valid/displayEnabled=true/validation=pass/quality=warn，3,691 可见字符、3 timeline、2 tensions、6 categories、3 watch、26 sources；quality WARN 只披露 1 条 cross-checked 新闻和 partial discovery，不影响展示或评分。置信度按 0–100 显示为 60/100，动态 quality/source labels 与 legacy warnings 已中文化。
- **下一步建议(2026-08-11 · Bubble Watch weekly editorial)**: 正常观察下一次周一自动刷新；只有 provider/validator/review/freshness 失败时按 `docs/OPERATIONS.md` 排查，不因时间戳不同或单次 WARN 手工改 production JSON、重复付费调用或削弱 gate。
- **阻塞或等待(2026-08-11 · Bubble Watch weekly editorial)**: 无。最终线上桌面 viewport 1905px 无横向溢出，来源链接全部 HTTPS；本地 1440px/390px Bubble Watch Playwright 4/4 PASS，`check:bubble-watch`、`check:frontend-zh-copy`、`check:docs`、`check:all` 全部退出码 0。

- **上次会话结束于(2026-08-02 · Refresh QQQ Market Pricing calendar-drift repair)**: 基于 latest `main` 新建 `codex/fix-qqq-market-pricing-freshness`，只修改 freshness checker 的合成场景日期构造并同步本 Handoff。失败 run `30694893490` 的根因已由相同 QQQ=2026-07-31、NDX/IXIC=2026-07-24 状态复现。
- **当前进行中(2026-08-02 · QQQ freshness checker)**: 无代码工作。workflow 三步本地复放后 `check:market-pricing-freshness` 与完整 `check:all` 均通过；临时生成的两份 market-pricing production JSON 已精确恢复，未纳入改动。
- **下一步建议(2026-08-02 · QQQ freshness checker)**: 经 owner 授权后 push 分支、创建/合并窄范围 PR，再手动 rerun `Refresh QQQ Market Pricing` 验证 QQQ 数据提交与 Pages 后续触发。
- **阻塞或等待(2026-08-02 · QQQ freshness checker)**: 仅等待外部发布与 workflow rerun 授权；无实现或测试阻塞。`.agents/` 与 `skills-lock.json` 是用户未跟踪文件，不得提交。

- **上次会话结束于(2026-07-28 · Bubble Watch source audit #28 repair)**: 已从 Actions #28 原始日志确认不是 ARR 数据链失效,而是审计分类未适配已上线的 `arr_underlying_observation_stale` fail-closed 语义。修复提交 `d7eb0633` 已通过本地 source audit、`npm run check:all` 和远端 Audit run `30347669342`;远端结果为预期 WARN,artifact 上传成功,Pages 部署同步成功。
- **当前进行中(2026-07-28 · Bubble Watch source audit #28 repair)**: 无。审计器仅在精确 reason code、`arr_2nd_deriv` 配对和 curated 回退快照仍 fresh 三项同时成立时记为 policy-driven expected WARN；未改 Bubble Watch 指标值、评分权重、阈值、builder freshness gate、生产 JSON 或 workflow 权限。
- **下一步建议(2026-07-28 · Bubble Watch source audit #28 repair)**: 继续观察下一次 scheduled Audit 与 SaaStr 是否发布较新的 ARR 里程碑；有新鲜底层观测时 builder 自动恢复 live,没有时保持 fresh curated fallback + audit WARN。
- **阻塞或等待(2026-07-28 · Bubble Watch source audit #28 repair)**: 无。若 curated fallback 自身超过 `maxAgeDays`、freshness 元数据缺失或 ARR 出现其它抓取错误,新分类会继续 hard fail,不会掩盖真实来源故障。

- **上次会话结束于(2026-07-28 · Bubble Watch weekly score drift hardening)**: 已按三步 serial-trunk 收口会计执法误报、ARR 底层观测超龄和内部人/Fed 展示语义；每步均独立重建 Bubble Watch、运行 `npm run check:all`、commit 并 push。生产 JSON 当前为 7红/7黄/9绿 Core-23,主分 30.4%、加权 45.7%、Stage 60.0、Trigger 34.6。
- **当前进行中(2026-07-28 · Bubble Watch weekly score drift hardening)**: 无。`accounting_events=green`、`arr_2nd_deriv=yellow(auto_fallback)`、`insider_sell_buy=yellow(高卖压·覆盖受限)`、`fed_policy=red(年末路径隐含加息)`；Core-23/Shadow-4 合同、评分权重和阈值未改。
- **下一步建议(2026-07-28 · Bubble Watch weekly score drift hardening)**: 观察本次 Pages 部署与下一次周度 Refresh Bubble Watch；若 SaaStr 或其他公开源出现更新 ARR 里程碑,新鲜度门槛会自动恢复 live,否则继续 fail-closed 使用未超龄 curated 研究快照。
- **阻塞或等待(2026-07-28 · Bubble Watch weekly score drift hardening)**: 无。当前环境既有 SEC EDGAR 403 由 StockAnalysis/Xoomar 等既定路径降级,不影响本轮三项修订；GDELT CEO hedging 429 由既有缓存/免费搜索链处理。

- **上次会话结束于(2026-07-15 · Bubble Watch v2 Core-23 + Shadow-4 calibration)**: Owner 批准 27 卡全展示、固定核心计分集 + 候选卡影子观察。ADR-0019 定稿 Core-23 与 Shadow-4,数据契约升为 `bubble-watch-v2`,页面以纸媒式细边框印章标注「固定核心/影子观察」,Hero/双轴/趋势明确 Core-23 口径。
- **当前进行中(2026-07-15 · Bubble Watch v2 calibration)**: builder/checker/history/backtest/page/docs 已迁移;原有来源构建与 fail-closed 边界未改。Core 可比历史严格从 2026-06-18 起共 5 期;旧变分母点保留审计但不混入 v2 趋势。当前主分 26.1%,Stage 60.0,Trigger 23.1,有效判读「高风险预警」。
- **下一步建议(2026-07-15 · Bubble Watch v2 calibration)**: 本地完成全量验证与桌面/手机视觉复核后,由 owner 决定是否窄范围 commit/push。后续只需按周积累 Shadow 样本;任何晋升必须满足 ADR-0019 门槛并另开 reviewed contract migration。
- **阻塞或等待(2026-07-15 · Bubble Watch v2 calibration)**: 无模型实现阻塞。当前本地 public build 仍观察到既有 SEC EDGAR 403,StockAnalysis/Fiscal.ai/Xoomar 等既有路径正常回退;Wind 按 `BUBBLE_WATCH_DISABLE_WIND=1` 跳过。该来源状态未改变 Core/Shadow 定稿边界。

- **上次会话结束于(2026-06-26 · GDELT P40 post-migration cache health review)**: P35-P39 已把 Oil News、Bubble Watch、World Order 三条 GDELT 路径收口到 shared wrapper + compact cache discipline;P40 新增统一只读复核 `review:gdelt-cache-health` / `check:gdelt-cache-health`,用于区分真实 schema/policy failure 与 post-migration refresh lag。
- **当前进行中(2026-06-26 · GDELT P40)**: 本刀范围为 read-only cache health review + docs/check wiring。未改前端,未访问外部网络,未写 `data/*.json` / `realtime`,未改任何 workflow cadence、scoring、decision、execution、position、ODP finalBias、Brent promotion、Heatmap/cross-validation。
- **下一步建议(2026-06-26 · after P40)**: 等下一轮 `Refresh Oil News Event Watch`、`Refresh Bubble Watch`、`Refresh World Order Stress` 自然刷新后,运行 `npm run review:gdelt-cache-health -- --no-output` 或人工 `--strict` 复核 cache requestMode 是否从 old-query/placeholder/seed 进入 fresh/stale/error 的正常低频周期。
- **阻塞或等待(2026-06-26 · GDELT P40)**: 无产品阻塞。当前 `WATCH` 代表 post-migration 刷新尚未完全轮到,不是 scoring/decision 阻断;单一 GDELT 新闻/事件摘要仍不得确认战争、封锁、断供、油价方向或交易动作。

- **上次会话结束于(2026-06-17 · Bubble Watch CEO hedging GDELT hardening + Tavily/Brave cross-check)**: `ceo_hedging` 已从 `GDELT -> Wind` 改为 `GDELT -> Tavily/Brave -> Wind`:GDELT DOC 2.0 public search 仍是免费主源,默认小样本请求,429/5xx 时按 `Retry-After` 或短退避只重试一次;GDELT 成功时 Tavily Search API `topic=news` + `time_range=month` 与 Brave News Search API `freshness=pm` 做第二/第三新闻源确认,GDELT 失败时 Tavily/Brave 做免费兜底,Tavily/Brave 均失败或未配置时才进入 Wind paid final fallback。红灯必须 GDELT/Tavily/Brave 至少两源确认,单一路径红色信号封顶为黄。GitHub workflows `refresh-bubble-watch.yml` 与 `audit-bubble-watch-sources.yml` 已注入 `TAVILY_API_KEYS` / `BRAVE_API_KEYS`;source-candidates、DATA_CONTRACT、DATA_SOURCES 已同步。密钥不写入仓库。
- **当前进行中(2026-06-17 · Bubble Watch CEO hedging GDELT hardening + Tavily/Brave cross-check)**: 代码、workflow、checker 与文档已改并完成本地 secret smoke test。未改 `data/bubble-watch.json`、`data/bubble-watch-history.json`、`config/bubble-watch-curated.json`、主 GFRR `radar-data.json`、主 scoring/decision/execution/position 或 Worker runtime。
- **下一步建议(2026-06-17 · Bubble Watch CEO hedging GDELT hardening + Tavily/Brave cross-check)**: owner 已在 GitHub 设置 `TAVILY_API_KEYS` / `BRAVE_API_KEYS`;下一次 Refresh Bubble Watch / Audit Bubble Watch Sources 会在 Actions 环境继续验证真实免费搜索路径。本地已验证:直连 Tavily smoke test 返回 3 条 news 结果且 usage=1 credit;直连 Brave News smoke test 返回 3 条 news 结果;`node scripts/audit-bubble-watch-sources.mjs --github-summary` 在 GDELT 失败后通过 Tavily/Brave free fallback 让 `ceo_hedging` 保持 `hybrid_live OK (yellow 部分)`,未进入 Wind/curated fallback。
- **阻塞或等待(2026-06-17 · Bubble Watch CEO hedging GDELT hardening + Tavily/Brave cross-check)**: 无代码阻塞。提交前复核 `npm run check:all`、`git diff --check` 与生产数据 diff 为空。

- **上次会话结束于(2026-06-16 · Bubble Watch public market technical heat panel)**: 已新增「公开市场技术热度」独立审计子面板,页面位置在 Bubble Watch 本周关键变化之后、观察清单之前。builder 使用 Yahoo Chart v8 免费公开日线价格构造 NVDA/AMD/MSFT/GOOGL/META/TSLA/AVGO/ORCL 等权 AI 篮子,并计算 21D 相对 QQQ 动量、14D RSI、20D Bollinger %B、200D 均线偏离、60D 相关性/Beta 五项;当前快照为 `升温观察`、`30.0/100`、`1 红 / 1 黄 / 3 绿`。public-apis Finance 仅登记为 source-review fallback 候选;Wind paid API 保持最后兜底且本轮未接入。
- **历史边界(2026-06-16 · Bubble Watch public market technical heat panel)**: 该面板落地时未改当时的 24 项指标或主分;当前数量与计分权重以后续 ADR-0019 的 27 卡展示 / Core-23 / Shadow-4 为准。该面板继续独立于 Bubble Watch v2 与 GFRR 主链路。
- **下一步建议(2026-06-16 · Bubble Watch public market technical heat panel)**: 若 owner 要提交,窄范围 stage 当前 7 个 tracked 文件并排除 `.codex-remote-attachments/`。已验证:`BUBBLE_WATCH_DISABLE_WIND=1 npm run build:bubble-watch`(随后剥离旧 paid/fallback 指标漂移,仅保留新面板)、`npm run check:bubble-watch`、`npm run check:frontend-zh-copy`、`npm run check:docs`、`npm run check:all`、`git diff --check`,Browser 390px/1280px 实测新增面板无横向溢出且 console 无 error/warn。
- **阻塞或等待(2026-06-16 · Bubble Watch public market technical heat panel)**: 无技术阻塞。

- **上次会话结束于(2026-06-16 · homepage 8-week trend visual match)**: 首页「8 周趋势」已按 AI 泡沫页趋势图视觉语法收敛:上下 1px 墨线、透明纸底、220px 高度、风险分红线 2.5px/红点 r=4、overlay 黄线 1.5px + `3 3` 虚线/黄点 r=3、无点描边;动态 SVG 改为按 `.trend-svg-wrap` 实际宽度重算 `viewBox` 和 x 坐标,手机不再靠 800px 画布拉伸,并收紧手机日期标签避免尾部重叠。asset bump → `trend-visual-match-1`;冻结 `scripts/modules/realtime.js` 已保持零 diff;未改 `data/`、`.github/workflows/`、scoring/decision/execution/position 或 Worker runtime。
- **当前进行中(2026-06-16 · homepage 8-week trend visual match)**: 代码与文档已改并通过验证,等待按 owner 指令 commit/push。当前 dirty 范围为首页前端、活跃 module import cache bust、asset-version 文档快照与本 Handoff;`.codex-remote-attachments/` 仍为未跟踪附件目录,不应提交。
- **下一步建议(2026-06-16 · homepage 8-week trend visual match)**: 若 owner 要提交,窄范围 stage 当前 15 个 tracked 文件并排除 `.codex-remote-attachments/`。已验证:`node --check scripts/modules/renderMacroOverview.js`、`npm run check:modules`、`npm run check:frontend-live-contracts`、`npm run check:frontend-zh-copy`、`git diff --check`、`git diff --name-only -- data .github/workflows scripts/modules/realtime.js` 空、Browser 390px/desktop 实测趋势图参数对齐 AI 泡沫页且页面横向溢出 0、`npm run check:all`。
- **阻塞或等待(2026-06-16 · homepage 8-week trend visual match)**: 无技术阻塞。浏览器验证用本地 `127.0.0.1:8787` 静态服务器已关闭,浏览器 viewport 已 reset。

- **上次会话结束于(2026-06-16 · Bubble Watch proxy-confidence calibration)**: `scripts/build-bubble-watch.mjs` 已从模板兼容上限升级为 `local_proxy_confidence_v1`:6 个新闻/搜索/代理类指标(`insider_sell_buy` / `ai_ipo_pipeline` / `capex_reaction` / `ceo_hedging` / `token_revenue_ratio` / `enterprise_deploy`)若自动结果更严重且未过本地二次确认门槛,发布灯色按多源/样本阈值校准,raw auto 判级和值写入 `provenance.detail.proxyConfidenceCalibration`;旧 `templateCompatibilityCalibration` 仅作兼容别名。本轮 5 项实际触发校准(`ceo_hedging` 原始即黄灯),`meta.proxy_confidence_calibrations[]` 汇总,上游/curated 只在新鲜期内作为显示值锚点。
- **当前进行中(2026-06-16 · Bubble Watch proxy-confidence calibration)**: 文档已同步 `docs/DATA_CONTRACT.md` / `docs/DATA_SOURCES.md` / 本 backlog。原 Mag4 FCF 用 Wind `stock_data.get_stock_fundamentals` 对 AMZN/MSFT/GOOGL/META 最近 8 季 OCF/Capex 复核:按 realized TTM aggregate `OCF + Capex` 口径合计约 $186.0B vs $222.5B,同比约 -16.4%,与 StockAnalysis 镜像 -15.8% 同档黄灯。**后续 2026-06-30 已被同一 score slot 的 Big5 capex/OCF 口径改造覆盖,旧 realized FCF YoY 不再是发布主口径。**
- **下一步建议(2026-06-16 · Bubble Watch proxy-confidence calibration)**: 运行 `npm run build:bubble-watch`、`npm run check:bubble-watch`、`npm run check:docs`、`npm run check:all` 后再按 owner 需要 commit/push。2026-06-30 后,同一 `mag4_fcf_yoy` 历史 id 保留但主口径为 AMZN/MSFT/GOOGL/META/ORCL Big5 capex/OCF;若未来再引入前瞻 FCF 压力,必须继续在该卡契约内明确来源与阈值,不得新增主分数卡改变权重。
- **阻塞或等待(2026-06-16 · Bubble Watch proxy-confidence calibration)**: 无技术阻塞。EDGAR 403 仍按既有设计回 StockAnalysis/Fiscal.ai 镜像;GDELT 偶发 429/失败时可走 Wind paid fallback 或本地置信度校准,不会 fail-closed 推红。

- **上次会话结束于(2026-06-15 · Macro Overview verdict headline/card alignment)**: 首页 Macro Risk Overview 在 `macro-overview-narrative-v1` 上补齐短 verdict headline:Hero 大标题改由 `buildMacroOverviewHeadline()` 从原始分数 + World Order 升档派生,当前真实数据输出「高风险预警」;`dailyBrief.oneLineConclusion` 的“今日主线/最大背离”长句只保留在正文/footer 层级。黑色 score card 增加 `.big-left-score` 居中块,desktop 与 390px 浏览器验证 score block 相对黑框中心偏移约 9px。
- **当前进行中(2026-06-15 · Macro Overview verdict headline/card alignment)**: 无。范围为前端 HTML/CSS/render/module/check/docs + asset bump `macro-verdict-card-1`;未改 production data、Worker runtime、workflow 或 scoring/decision 逻辑。冻结 `scripts/modules/realtime.js` 在 bump 后已恢复为无 diff。
- **下一步建议(2026-06-15 · Macro Overview verdict headline/card alignment)**: 若 owner 确认页面效果,可按窄范围提交/推送。已验证:`git diff --check`、`npm run check:docs`、`npm run check:frontend-live-contracts`、`npm run check:frontend-zh-copy`、`npm run check:macro-overview-narrative`、`npm run check:all`;本地浏览器 desktop + 390px 检查显示 headline =「高风险预警」、score block 相对黑框中心偏移约 9px、console 无 error/warn、横向溢出 0 级别。
- **阻塞或等待(2026-06-15 · Macro Overview narrative v1 + ODP)**: 无技术阻塞。注意 `scripts/modules/realtime.js` 保持冻结旧 module graph,asset bump 后已恢复为无 diff。

---

> 以下为 2026-06-06 External AI 留档,当前状态以上方 2026-06-11 段为准。

- **上次会话结束于(2026-06-06 · 续7 — External AI scheduled/default 翻 analyst)**: analyst go-live 与 Daily 终证已完成后,小 PR #1 把 `External AI Production Refresh` 的 scheduled 分支与 `workflow_dispatch` default 从 `local_compact` 翻到 `analyst_compact_v1`;`local_compact` 仍保留为 manual dispatch rollback option + build 分支。workflow checker 同步改默认断言,并显式断言 rollback 分支 `if [ "$input_source" = "local_compact" ]; then` 存在。docs/DATA_CONTRACT + OPERATIONS 同步默认/rollback 语义。Set/守卫/data/前端零改;model 仍 `deepseek-v4-flash`;check:all 绿。
- **当前进行中(2026-06-06 · 续7)**: 无。PR0→PR3 + follow-up + go-live + Daily 终证 + default cutover 全收口。
- **下一步建议(2026-06-06 · 续7)**: **PR4** 输出 schema + 前端增强(`crossLayerSynthesis`/`keyDivergences`/`scenarioLean`/`dataQualityLens`),改前端前先读 DESIGN.md 并按 asset bump 纪律处理。
- **阻塞或等待(2026-06-06 · 续7)**: 无技术阻塞。

---

> 以下为同会话早段(PR2 canary + PR3 代码)留档,当前状态以上方「续6」段为准。

- **上次会话结束于(2026-06-06 · 续4 — External AI PR2 canary PASS + PR3 production 迁移落地)**: PR2 canary RUN 已跑(owner,flash)→ **PASS**:0 unsafe(全 66 blocklist)、12 attr/8 distinct layer、conf low/35 dataQuality 加权、timeout 17.9s,**模型 tier 定 `deepseek-v4-flash`**(Claude 独立复核 artifact 逐项吻合)。随后 **PR3 production contract migration(保守 expand-only + analyst opt-in)已落**:新 `production-contract.mjs` 集中 legacy+analyst 两套 Set(legacy 未删、model 固定 flash);validate-data/contract/write-guard/write/projection 容旧+新;projection analyst 保 per-layer sourceLayer(缺失即 fail)、legacy 仍 collapse,带 runRegressionChecks 自测;workflow 仅 dispatch 加 analyst、scheduled 默认仍 local_compact;`_manualDiagnostics` 记 token/timeout。**未改 committed `data/`**、affects*/promotion/humanApproved 强校验未动。Codex 实现 + Claude 逐行交叉核(data/ 零 diff、Set 容旧、sourceAttribution 不折叠、scheduled 未翻、boundary 未放宽,均坐实);check:all 绿。
- **当前进行中(2026-06-06 · 续4)**: 无。PR2(代码+canary)+ PR3 代码收口入 main。
- **下一步建议(2026-06-06 · 续4)**: **owner 手动 `workflow_dispatch` 选 `analyst_compact_v1`**(真调 DeepSeek、写 production data)→ 验 Daily 绿 → 再另开**小 PR 翻 scheduled 默认**;之后 **PR4**=输出 schema(crossLayerSynthesis/keyDivergences/scenarioLean/dataQualityLens)+ 前端(读 DESIGN.md + asset bump)。serial-trunk 逐刀。
- **阻塞或等待(2026-06-06 · 续4)**: 无技术阻塞;analyst 真上 production 需 owner 手动 dispatch + `DEEPSEEK_API_KEY`。

---

> 以下为同会话早段(PR2 代码)留档,当前状态以上方「续4」段为准。

- **上次会话结束于(2026-06-06 · 续3 — External AI PR2 代码完成待 canary RUN)**: External AI 深化 **PR2 代码已完成**(未调 provider/未读 key/未写 production):runner 增 `analyst_compact_v1` 分支与 4 个分析任务;新增 `scripts/external-ai/source-layers.mjs` 区分 legacy 7 层与 analyst 扩展层;output checker 新增 sourceLayer 白名单校验且 legacy 回归拒 `macroDrivers.rateVol`;review checker 收编第三份 `OPERATION_LANGUAGE_PHRASES`;ODP/World Order/decisionContext attribution 名称对齐 canonical;confidence 用合法 `medium` enum + score<=45(禁 `high`)。
- **当前进行中(2026-06-06 · 续3)**: PR2 代码 + 本 doc/backlog 对齐处于工作区待落地状态;未 stage/commit/push。provider canary RUN 未执行。
- **下一步建议(2026-06-06 · 续3)**: owner 明确授权后精确 stage 9 文件并 commit+push;入库后再由 owner 注入 `DEEPSEEK_API_KEY` 跑 analyst canary,记录 token/timeout/sourceLayer 覆盖/unsafe wording/增量价值,并在 canary 内裁模型 tier(flash vs 更强)。
- **阻塞或等待(2026-06-06 · 续3)**: 等 owner 明确 git 授权;canary RUN 还需 owner 确认模型 A/B 目标与本地 key 注入方式。

---

> 以下为同会话早段(PR1)留档,当前状态以上方「续3」段为准。

- **上次会话结束于(2026-06-05 · 续2 — External AI PR1 落地)**: External AI 深化 **PR1 已落**(`feat(external-ai)`):`build-external-ai-manual-input.mjs` 加 `--analyst-compact-v1` artifact-only 输入路径(全 27 macroDrivers + 全层紧凑 evidence pack,siteData ~25KB,gitignored artifact);写前共享 blocklist redaction(residual 0);**禁词单一真相源** `scripts/external-ai/safety-constants.mjs`,output/production-contract checker 改 import(byte 级忠实零掉词);decisionContext 仅 sanitized allowlist(裁 A,PR0 §4.2/§5.1/§12-Q4 已对齐)。Codex 实现 + Claude 逐行交叉核(独立证伪两风险:禁词重构无削弱 + redaction residual 0 含 substring `执行`/`交易`)。仅码、不碰 provider/production/workflow/frontend;check:all 绿。本批含 backlog P3-20 标 PR1 ✅ + 本 Handoff,一个 commit 收口。
- **当前进行中(2026-06-05 · 续2)**: 无。PR1 收口。
- **下一步建议(2026-06-05 · 续2)**: 下一刀 = **PR2 manual/provider canary**(需 provider 凭证、不写 production:升 prompt 4 分析任务 + 扩 sourceLayer 白名单 + 量 token/timeout/unsafe-wording/覆盖/增量,**模型 tier flash vs 更强** A/B 决)。serial-trunk,PR1 入库后才开 PR2。详见 [`EXTERNAL_AI_ANALYST_INPUT_CONTRACT_REVIEW.md`](EXTERNAL_AI_ANALYST_INPUT_CONTRACT_REVIEW.md) §7 + 记忆 `project_external_ai_deep_analysis`。
- **阻塞或等待(2026-06-05 · 续2)**: 无。(PR2 需 provider 凭证 + owner 触发,非阻塞。)

---

> 以下为更早段(worker-health + doc-slim + PR0)留档,当前状态以上方「续3」段为准。

- **上次会话结束于(2026-06-05 · 续 — worker-health 修复 + doc-slim 同步 push + External AI PR0)**: 三件均完成。① worker-health workflow 加 `if: always()`(失败时也上传 snapshot artifact),已 merged + push,origin/main 含该刀。② 发现整批 doc-slim 18 笔 + handoff **此前滞留本地未推**(origin 曾停在 ACLED `9fc995a1`),已随 worker-health 同次 fast-forward push 同步上 origin(无 force);Handoff 里被 rebase 改写的失效旧 SHA 已弱化为耐用措辞。③ External AI 深化 **PR0 设计契约** `docs/EXTERNAL_AI_ANALYST_INPUT_CONTRACT_REVIEW.md` 已 authored(Codex 起草 + Claude 逐行交叉核 5 轮)、check:docs 绿、doc 内自洽,**仍 untracked 未提交**。
- **当前进行中(2026-06-05 · 续)**: External AI 深化 PR0 = 完成待提交;本 P3-20 backlog 项 + 本 Handoff「续」段为 docs-only 补充(同 untracked,待同批提交)。
- **下一步建议(2026-06-05 · 续)**: owner 授权后提交 PR0 doc + 本 backlog/handoff(message 已拟);入库后再开 **PR1**(`extractAnalystSiteDataV2()` + redaction,只产 artifact、不碰生产)。serial-trunk 一刀一结,PR0 入库前不开 PR1。详见 [`EXTERNAL_AI_ANALYST_INPUT_CONTRACT_REVIEW.md`](EXTERNAL_AI_ANALYST_INPUT_CONTRACT_REVIEW.md) + 记忆 `project_external_ai_deep_analysis`。
- **阻塞或等待(2026-06-05 · 续)**: 等 owner 明确授权 git 提交(AGENTS 10.4);无技术阻塞。

---

> 以下为同日早段(.md doc-slim 审计)留档,当前状态以上方「续」段为准。

- **上次会话结束于(2026-06-05 — 全站 .md 文档审计/瘦身 1a→5余项 全轮收官)**: doc-slim audit 全部完成并在当前 main 序列(Batch 1a / 1b / 1c / 2 / 2b / 3 / 3b / 5-checkpoint / 4 / 5余项;原钉的 commit SHA 因 2026-06-05 push 前 rebase 换基已全部改写,故不再逐一钉旧哈希);各批 check:all 绿、git diff --check clean。Batch 1=三大 Operating Doc changelog tail 折 B-consolidated 索引;2/2b=External AI 簇收口(14 banner + READINESS_CHECKLIST 1111→422 折表);3/3b=Market Pricing 簇收口(13 banner + TEMPERATURE_DATA_SOURCE_DESIGN 529→340 折表);4=M92/M93 plain-summary 4 docs INDEX Historical + 2 banner;5余项=M94_V0/DESIGN plain-summary reconcile→retired + 三段 attribution(checker `5eff6ab` / renderer `c8229574` / DOM `91d06f3d`)。
- **当前进行中(2026-06-05 — doc audit)**: 无。整轮 .md doc-slim audit(Batch 1a→5余项)全部收官。
- **下一步建议(2026-06-05 — doc audit)**: 无后续 .md 审计 —— 整轮 doc-slim audit 收官。原列为唯一遗留的 `assets/styles.css` `.plain-summary-section` dead CSS cleanup **已完成**(删 5 行 orphaned CSS + cache bump `m94-css-cleanup-1` 扇出 + 标 INDEX debt resolved);顺带 bump 工具 inline current-version 快照盲区已 harden 进工具(2 紧锚正则,见记忆 `ops_bump_tool_blind_spots`)。本批提交均在当前 main 序列(SHA 因 push 前 rebase 换基已变,不再钉旧哈希)。日后若再瘦身须另立项。
- **阻塞或等待(2026-06-05 — doc audit)**: 无。

---

> 以下为 2026-06-04 ACLED monthly 留档,当前状态以上方 doc-audit 段为准。

- **上次会话结束于(2026-06-04 — ACLED monthly parity + sanitizer 幂等优化)**: monthly ACLED 补齐 weekly 同能力。capability = feat commit `4bded56`(稳定):新 `scripts/world-order/acled-monthly-status.mjs` + npm `acled:status:monthly`(+ `acled:status:weekly` 别名;`acled:status` 仍 weekly 不变)+ monthly reminder workflow 改一键 + M-63 §9/§9B 双向对称。裁决比对 fetch-acled.mjs 投进 `externalSources.acled.summary` 的全 7 字段月度签名(非仅 pvEvents),`monthlySourceFreshness` 排除(time-derived),asOfDate 单调键 `>=`;**lastFetchedAt 不可信**(反映 weekly preparedAt → monthly 必须比签名)。Codex P2(全签名)/P3(文档对称)已修。随后 sanitizer 幂等优化 commit `b5da04c`:weekly+monthly sanitizer 在内容除 `preparedAt` 外完全一致时跳过写入、保留旧时间戳 → 空跑不再脏工作区,且 `preparedAt` 改表「内容上次真正变化时间」(顺带消除 weekly `acled:status` 因 preparedAt 漂移误报 sanitized_not_refreshed 的隐患)。两次 check:all 均全绿。本轮 monthly(as-of 2026-05-29)+ weekly(events4w 33328→32758,ACLED 修订)两笔数据刷新已 push + 触发 "Refresh World Order Stress" 部署,git pull 后 data 全字段对齐,两个 `acled:status*` 均 data_current 且不再脏树。
- **当前进行中(2026-06-04 — ACLED monthly)**: 无。全部收官(capability + Codex 修复 + sanitizer 幂等优化 + 两笔数据刷新均已上线 data_current)。
- **下一步建议(2026-06-04 — ACLED monthly)**: 无后续。先前列为可选的「sanitizer preparedAt 噪音」优化已在 `b5da04c` 完成。若日后要 ACLED 增强(如新分项/更细窗口)须另立项。
- **阻塞或等待(2026-06-04 — ACLED monthly)**: 无。

---

> 以下为 2026-06-03 ODP PR5 留档,当前状态以上方 ACLED monthly 段为准。

- **上次会话结束于(2026-06-03 — ODP PR5 dailyBrief 只读引用 = ODP 收官)**: PR5 已 squash-merge 到 main(#263 = `c890ba35`,squash subject 干净无 wip;与建分支后落 main 的 3 笔 CI 数据刷新分离、squash 只含 PR5 文件)。决策 **A(frontend-only 显示 join)**:Hero「今日判断」(`.big-right`)加一行 muted 只读 ODP 交叉引用(`#hero-odp-ref-verdict` 由 `renderOilDirectional` set、链到 `#oil-directional-pressure`),读 PR4 已加载的 `oilDirectionalData`;**无 daily-pipeline / radar-data 改动、boundary 守卫不动**。asset bump `odp-hero-ref-1`(冻结 `realtime.js` 还原 diff=0);leaf 不变(仍套件 8、无新 check)。**Codex 审无 actionable finding**(boundary 守住:`data/`/`.github/`/pipeline/realtime 零 diff;Hero 放置不暗示打分;全检查绿)。`check:all` 16 项 / 套件 8 leaf 绿;cross-ref setter mock-DOM 三态验过(live / insufficient / unavailable)。
- **当前进行中(2026-06-03 ODP PR5)**: 无。PR5 已 squash-merge 到 main(#263);branch 已删;**ODP 五刀(PR1–PR5)全 merged 收官**(本 Handoff 在 post-merge 收尾 commit 内)。
- **下一步建议(2026-06-03 ODP PR5)**: 无后续 ODP PR —— 五刀全收官(数据接入 → 周度 workflow → 回测 GATE → productionize + 价格背离 → 中文 UI → dailyBrief 只读引用)。后续若要 ODP 增强(如 IEA/OECD 月频源、更细分项)须另立项。
- **阻塞或等待(2026-06-03 ODP PR5)**: 无。

---

> 以下为同日 ODP PR4 留档,当前状态以上方 PR5 段为准。

- **上次会话结束于(2026-06-03 — ODP PR4 中文 UI 独立能源专题)**: PR4 已 squash-merge 到 main(#262 = `60d97840`,squash subject 干净无 wip)。决策 **A+(i)**(owner 让 Codex 拍):app.js 第 5 个 fetch(ODP 保持独立文件、boundary 守卫不动)+ 主路径新一级 section `#oil-directional-pressure`(`#global-risk-heatmap` 后、附录前;jump-nav 15→16 第 11 项)。新 `renderOilDirectional.js`(finalBias→中文 verdict+tone+原因+证据,值走 setter 不写死)+ **正式 IA 变更** DESIGN §4.1/§4.2/§5.1/§5.6 + ADR-0014 + 新 `check:oil-directional-zh-copy`(套件 7→8 leaf)+ asset bump `odp-energy-theme-1`(冻结 `realtime.js` 还原 diff=0)。**Codex 两轮审查全闭合**(P2 headline 夸大→收窄到 classifier 保证事实 / P3 降级重渲染 stale→tone 重置+清 meta/reasons/证据,各 mock-DOM + in-browser 验)。`check:all` 16 项 / 套件 8 leaf 绿;真实浏览器渲染正确、零 console error;受限路径(`data/`/`.github/`/radar-data)零污染。
- **当前进行中(2026-06-03 ODP PR4)**: 无。PR4 已 squash-merge 到 main(#262);branch `codex/odp-pr4-ui` 已删(本 Handoff 在 post-merge 收尾 commit 内)。
- **下一步建议(2026-06-03 ODP PR4)**: **PR5**(稳定观察后让 dailyBrief / interpretation 层只读引用 ODP)= ODP 五刀收官;ODP UI 现已 live(`#oil-directional-pressure` 主路径 section)。
- **阻塞或等待(2026-06-03 ODP PR4)**: 无。

---

> 以下为同日 ODP PR3 留档,当前状态以上方 PR4 段为准。

- **上次会话结束于(2026-06-03 — ODP PR3 productionize classifier + 价格背离层)**: PR3 已 squash-merge 到 main(#261 = `ed265db6`,squash subject 干净无 wip)。把 PR2 锁定 classifier productionize 到 live:`finalizeBias()` 价格背离层(物理>金融,§5)填 `signals`/`finalBias`/`interpretation`(display-only)。**classifyAt/ODP_THRESHOLDS 纯追加未改、PR2 GATE 原样绿**;新增 `check:oil-directional-score`(套件 6→7 leaf);价格方向复用 committed `radar-history-full.json` Brent ~4w;同周守卫(8 EIA 全 live 同周才判,否则 insufficient)。**Codex 两轮审查全闭合**(P1 all-null / P2 不可能 false_* / P2 混周 / dataSufficiency 契约洞,各负例坐实;`partial` forward-compat 注已写)。`check:all` 16 项绿;live verdict = `false_down_physical_stress`。文档:DATA_CONTRACT(PR3 模型输出 + 背离层 + `ODP_PRICE_THRESHOLDS` 表 + 同周守卫 + dataSufficiency 注)/ DATA_SOURCES / 本 P3-19 + leaf ~54→~55·套件 7。
- **当前进行中(2026-06-03 ODP PR3)**: 无。PR3 已 squash-merge 到 main(#261);branch `codex/odp-pr3-productionize` 已删(本 Handoff 在 post-merge 收尾 commit 内)。
- **下一步建议(2026-06-03 ODP PR3)**: **PR4** = 中文 UI 独立专题(整包升级 `app.js` + DESIGN §4.1 + `check:dom` + asset bump + `check:odp-zh-copy`;决定是否投 `radar-data.json` root snapshot);之后 PR5 只读引用 dailyBrief/interpretation。
- **阻塞或等待(2026-06-03 ODP PR3)**: 无。

---

> 以下为同日 ODP PR2 留档,当前状态以上方 PR3 段为准。

- **上次会话结束于(2026-06-03 — ODP PR2 历史 cache + 回测 GATE)**: PR2 已 squash-merge 到 main(#260 = `93a41d96`,squash subject 干净无 wip)。代码:历史 cache `data/oil-directional-history.json`(8 series × ~647 周、2014-至今 committed snapshot,零依赖 build)+ 物理链分类器 `odp-classifier.mjs`(look-ahead-safe,预登记锁定阈值 `ODP_THRESHOLDS`)+ 回测 harness + GATE `check:oil-directional-backtest`(history-integrity + points 真实性 + canonical 周网格 + 2020/2022/2023-24 预登记 regime;`oil-directional` 套件 5→6 leaf)。**Codex review 放行**(实质模型 + GATE 过;唯一 P2 = history gate 过信 metadata → 已补 points 真实性 + canonical 周网格校验,负例 blanked / 删一周 / 网格漂移全 FAIL、真 cache PASS)。文档:DATA_SOURCES + DATA_CONTRACT(含预登记阈值表)+ 本 backlog P3-19 PR2 段 + leaf 计数 ~53→~54 / 套件 6 leaf。`check:all` 16 项绿;回测与 owner 独立跑逐一吻合;live `signals`/`finalBias` 仍 null(productionize=PR3)。
- **当前进行中(2026-06-03 ODP PR2)**: 无。PR2 已 squash-merge 到 main(#260);branch `codex/odp-pr2-backtest` 已删(本 Handoff 在 post-merge 收尾 commit 内)。
- **下一步建议(2026-06-03 ODP PR2)**: **PR3** = 把 classifier productionize 到 live(`signals`/`finalBias`,物理>金融,display-only);之后 PR4 中文 UI 独立专题、PR5 只读引用 dailyBrief/interpretation。
- **阻塞或等待(2026-06-03 ODP PR2)**: 无。

---

> 以下为 2026-06-03 ODP PR1 留档,当前状态以上方 PR2 段为准。

- **上次会话结束于(2026-06-03 — ODP PR1 油价方向压力研判 数据接入)**: owner 立项「油价方向压力研判 / ODP」独立能源专题;可行性审计经 Codex↔Claude↔owner 终裁、source-review 文档已 merge(PR #257)。**PR1 代码全部完成并已 squash-merge 到 main(#258 = `70876f5d`)**:① 零依赖 build `scripts/oil-directional/build-oil-directional-pressure.mjs`(EIA API v2 `/v2/seriesid/PET.<id>.W` 取 8 个 WPSR series + 复用 radar-data WTI/Brent/crack/curve;短超时 `EIA_FETCH_TIMEOUT_MS` + fail-closed;key 走 `process.env.EIA_API_KEY`,本地从 gitignored `manual-artifacts/eia-api-key.txt` 注入);② 初始 `data/oil-directional-pressure.json`(evidence + freshness + seasonality;`signals`/`finalBias`/`interpretation`=null);③ 5 个 `check:oil-directional-*` + check-suite `oil-directional` + package.json(check:all 15→16);④ 文档(本 backlog + DATA_SOURCES + DATA_CONTRACT + 计数 CLAUDE/AGENTS/MILESTONE)。build 经 3 轮 Codex、checks 经 2 轮 Codex + 负例自验;`check:all` 16 项绿;ADR-0013 守(写 `data/` 零依赖)。**PR1b(#259,merge `226a698f`)续上**:周度 refresh workflow(`refresh-oil-directional-pressure.yml`,Thu cron + dispatch)+ Pages-trigger + `build:oil-directional`;`EIA_API_KEY` repo secret 已设(`gh secret set` 从 gitignored key 文件)。
- **当前进行中(2026-06-03 ODP)**: 无。PR1 + PR1b **均已 squash-merge 到 main**([#258](https://github.com/ctmaomao/gfrr-auto-update-site/pull/258)=`70876f5d` / [#259](https://github.com/ctmaomao/gfrr-auto-update-site/pull/259)=`226a698f`);`check:all` 16 项绿;main 干净、PR 分支已删。
- **下一步建议(2026-06-03 ODP)**: **PR2** — 历史 cache + 2020/2022/2023-24 回测(**GATE**,拐点合理才进 UI);之后 PR3 模型(signals/finalBias/物理>金融)、PR4 中文 UI、PR5 只读引用。(PR1b 已 merge、`EIA_API_KEY` secret 已设;workflow 周四 cron 自动跑 / 可 manual dispatch。)完整 PR 拆分见 [`OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md`](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md) §10 + 记忆 `project_odp_oil_directional_pressure`。
- **阻塞或等待(2026-06-03 ODP)**: 无。`EIA_API_KEY` repo secret 已设;PR1b workflow 在产(Thu cron / manual dispatch)。

---

> 以下为同日早段(F6 验证 + ACLED 新鲜度)留档,当前状态以上方 ODP 段为准。

- **上次会话结束于(2026-06-03 — F6 验证 + ACLED 新鲜度可见性)**: ① **F6 实测确认生效**(`6efddfd`):线上 worker `/market.worker-preview.json` sourceProbe `probeCount=2`、整个 payload 零 stooq(fresh build 2026-06-02T23:45Z);F6 = repo + 线上 + 实测三重确认彻底关闭。② **ACLED 新鲜度可见性**(2 commit,asset `world-order-acled-freshness-1`):**item1 前端**(`46381c8`)世界秩序附录(`#world-order-stress-section`)新增「数据新鲜度」行,WIRE `worldOrderStressData.externalSources.acled.summary.{latestWeek,eventsLast4Weeks,monthlyAsOfDate}` + `gdelt.summary.conflictEvents`(display-only、**不改 overlay scoring/weights/pipeline**,只读既有字段;HTML 初值 `—` 防 stale 假值;`Number.isFinite`/字符串 guard 避 `asNumber(null)→0`;相邻硬编码「所有源 live/stress」中性化);**item2 脚本**(`6bc5812`)新 `npm run acled:status`(`scripts/world-order/acled-weekly-status.mjs`)= sanitize:weekly + check:weekly + **config-vs-data 多字段对比**(`preparedAt`↔`lastFetchedAt` + `latestWeek` + `events4w`)→ 4 状态(`data_current`/`sanitized_not_refreshed`/`config_missing_or_no_input`/`data_ahead_or_local_stale`);步骤非零退出 → `check_failed`+`exit 1`(不误报 data_current);read-mostly、不 commit/push/触发 CI。Codex 复审:方案轮 2 修正(边界话术 + 避 0-trap;单一→多字段对比)、diff 轮 2 block(脚本吞错误、HTML 硬编码默认)均修。push 撞 CI 自动提交(`4b436db` radar + `340f099` world-order refresh)→ `git pull --rebase` + 复跑 check:all 绿 → push,`main` = origin = `6bc5812`(其上叠本 backlog commit)。
- **当前进行中(2026-06-03)**: 无。
- **下一步建议(2026-06-03)**: ACLED 周刷新现已可见证:刷新后 `npm run acled:status` 看 status(`data_current`=已进仓 + 前端已反映;`sanitized_not_refreshed`=需 commit/push config + 触发 Refresh World Order Stress workflow)。前端世界秩序附录「数据新鲜度」行也会随 CI 刷新显示最新周/asOf。可选 backlog 候选:F7 `.mjs` 单体拆分(见 P3-17)。
- **阻塞或等待(2026-06-03)**: 无。

---

> 以下为 2026-06-02 续 session 留档,当前状态以上方 2026-06-03 段为准。

- **上次会话结束于(2026-06-02 · 续 — stale-display WIRE 收尾)**: 接上一 session 的 P3-18 余项,完成 deferred WIRE 两批并 push,`main` = origin = `4cf7220`。**批 A**(`975f501`,asset `frontend-stale-static-wire-1`)= DXY tone WIRE(新 `dxyTone()` ≥115 红 / ≥105 黄 / <105 绿;105=backend liquidityPressure 阈值;live 118.88 修正误显黄→红)+ Gold→OBS 中性 + C2/C3/C7/C8 分类计数 STRIP 留「N 张」。**批 B**(`4cf7220`,asset `frontend-stale-static-wire-2`)= Fed 附录数字 WIRE 镜像 `macroDrivers.fedLiquidity`/structuralSignals + commit-SHA/branch/采集时间 WIRE(`dailyRealtimeInput.*`)+ 侧栏 dd(healthScore/structural)WIRE + 「23/23 源 OK」STRIP→「数据源健康」+ 情景% prose STRIP(41/22/63)。流程:协调闸先读 M94 计划 + 核 app.js stage(确认重写已在产 Stage 5d-2、无 `renderThematicCards.js` → WIRE = 维护非丢弃)+ 问 owner(owner go);每批 Claude 实现 → bump → revert `realtime.js`(diff=0)→ check:dom + check:all 全绿 → 贴 diff → Codex 交叉复审通过 → push;三批均 fast-forward 无 CI 撞车。**批 C**(`5076658`,asset `frontend-stale-static-wire-3`,owner 指定保守版)= 「结构信号层激活 N 项」count WIRE 接 `decisionModel.structuralSignals.length`(无条件)+「0 项关键缺失 / 0 项 fallback」STRIP→「无关键缺失、无 fallback」(无稳定结构化源)。**批 D**(`d5ff2ef`,asset `frontend-stale-static-wire-4`,owner+Codex 指定保守扩围)= 0-信号边界修净(结构信号 `<p>` + 健康 callout 各拆 active/none span、`setHidden` 按 `structuralSignals.length` 切换、合并旧两块、`detail-fed-signal-label` WIRE)+ 降级模式/安全输出 WIRE(`recovery.degradedMode`/`safeOutput`)+「关键缺失/fallback」改 WIRE 接 `warningSystem.criticalCount`/`warningCount`(**推翻批 C「无稳定字段」误判** —— `warningCount` 即 fallback 计数)。**批 E**(`6f98cdb`,asset `frontend-stale-static-wire-5`,落实批 D 后续)= 数据健康整段叙述「正常/需关注」两态化:新 `healthDegraded`(`degradedMode‖criticalCount>0‖warningCount>0‖sourceMode 非空非live`)驱动 5 处乐观断言 + healthScore 分色(`setHidden` active/none + `setToneClass`),降级文案泛化覆盖 `mock`/`cache-only`/`fallback`;Codex 三轮复审(方案+diff+文案,采纳纳入 sourceMode + score 分色 + mock 文案泛化)。`main` = origin = `6f98cdb`(其上叠本 backlog 收尾 commit)。**P3-18 stale-display 收口完成(Tier-1/2 + WIRE A/B/C/D/E 共 7 批;6 deferred + 批 B/C 余项 + 0-信号边界 + 整段两态化全落地)。** **另:P3-17 F6 dead-source 删除**(`070ca80`)= 删 worker 全部 Stooq `/q/d/l/` Brent 诊断(7 文件 lockstep:worker −206 行 + `check-workflows.mjs` 拆 stooq required/加全 worker 回归守卫 + DATA_CONTRACT/OPERATIONS/DATA_SOURCES/Worker README/backlog 同步);行为中性、未碰 `run-realtime.mjs` 的实时 `/q/l/?s=cb.f`;Codex 方案×2 + diff 复审通过(diff 轮揪出 README:56 current-doc 残留、已修);check:all 绿;**owner 已 `wrangler deploy`(2026-06-02,Version `cf8e99fa`)** —— F6 repo + 线上均完成。
- **当前进行中(2026-06-02 · 续)**: 无。P3-18 全收口;**F6 dead-source 删除已 push(`070ca80`)+ `wrangler deploy`(Version `cf8e99fa`)线上生效** —— repo + 线上均完成。
- **下一步建议(2026-06-02 · 续)**: F6 已部署并 **2026-06-03 实测确认生效**(`/market.worker-preview.json` probeCount=2、零 stooq)。其余可选 backlog 候选:F7 `.mjs` 单体拆分(见 P3-17)。
- **阻塞或等待(2026-06-02 · 续)**: 无。(F6 worker 已于 2026-06-02 `wrangler deploy`,Version `cf8e99fa`。)
- **⚠️ 教训(2026-06-02 · 续)**: ① 协调闸有效:plan 文档(v1.0「Stage 1 待启动」)与实际 stage(app.js init log = Stage 5d-2)漂移时,先核 app.js stage 标记 + 查 `renderThematicCards.js` 是否存在,判定重写是否真在进行,别被陈旧 plan 误导成「WIRE 会被丢弃」。② bump 每次仍扇写冻结 `realtime.js`,五批都 revert 保 diff=0(根治 = 让 bump 工具排除冻结模块,仍未做)。③ **「无 live 源」类断言要先 grep pipeline 写入处再下结论** —— 批 C 误判「fallback 无稳定字段」STRIP,实则 `warningSystem.warningCount` = `realtime.fallbackCount`,被 Codex 批 D 证伪改回 WIRE;同类教训见 [[frontend_stale_static_display]]。④ 两态/状态化文案要覆盖**全部**降级子态:批 E 初版降级文案只写「降级/缓存/fallback」,漏了 `sourceMode='mock'`(非 degraded/fallback/cache),Codex 拦下后泛化为「非实时/非 live」。

---

> 以下为本 session 早段(2026-06-02 Codex 审计收口)留档,当前状态以上方「续」段为准。

- **上次会话结束于(2026-06-02)**: 本 session 各批工作均完成、经 Codex 逐轮复审、已 push,`main` 与 origin 同步。最新工作 commit=`1f7ff1e`(F7 A1 clean 折叠);其上叠 backlog 收尾 commit(本 handoff 即在其中,故实际 git HEAD = 最后一笔 backlog commit,非 `1f7ff1e`)。① 用 Workflow 起 7-agent 并行复核 Codex 只读审计(F1–F7),中立取证。② Codex 终裁(双向交叉校验):F2 DO_NOW、F1/F4/F5/F6/F7 BACKLOG;**F4 处 Codex 反向纠正我「降级过头」**(DESIGN.md 仍以 v2 mock 为视觉权威)。③ **F3+ext**(`a6e9101`):INDEX.md 删死 checker、AGENTS.md 改指 `check:frontend-live-contracts`+18→15、CLAUDE.md 18→15、DESIGN.md §8.2 改指 §4.1/§5.6+ADR-0014、OPERATIONS.md ~16 行 operator note 去死命令;rg 证明零死命令残留(M36/M94/SYSTEM_UPGRADE_PLAN 历史引用有意保留)。④ **backlog 持久化**(`7531259`,含本 P3-17;Codex 复审修了 F1 处置自相矛盾)。⑤ **F2**(`a74a4a2`):删 test-api-secrets.yml ACLED 两段 + check-workflows.mjs 加 5 条 ACLED 守卫(Codex 复审从 3→5 收紧、单测 10/10);push 撞 CI 自动提交 `8e721f0`(radar 刷新,零重叠)→ `git pull --rebase` 换基后复跑 check:all 仍绿。⑥ **F4**(`4c491f3`):`.gitignore` `manual-artifacts/` → `manual-artifacts/*` 修根因 + 跟踪 m94-v0 v2 mock(视觉权威);`git check-ignore` 实测 ACLED/external-ai/market-pricing 仍忽略、仅 v2 新可见;push 撞 CI `eb16134`(world-order 刷新,零重叠)→ rebase 重放、复跑 check:all 绿。⑦ **F1**(`c7a9db7`):`AGENTS.md:40` 措辞澄清 worker-first 分层(M-94 路径C 前端读静态快照、不跑前端 gate),仅 1 行、未碰 `realtime.js`;另修 Handoff HEAD-ref off-by-one(`0529b6c`)。⑧ **F7 文档归档增量**(`dec029a`/`0d27f39` A2/A3 + `1f7ff1e` A1 clean):A2 INDEX orphan 分类(M94_V0/M-63/M-67 标活契约、MARKET_PRICING_WEEKLY_REFRESH 标 fallback runbook、External-AI wildcard 注解)+ A3 backlog 两漏 + A1 用 41-agent 只读 workflow 核查(11 keep 活契约 / 14 clean collapsed / MP+Macro+Recent deferred)→ 折 Editorial M-31~38 + CrossVal M-51~53 + Frontend M-54~55b 三组为指针。每批 check:all 15/15 绿、各经 Codex 复审。新增记忆 `audit_m94_path_c_false_positive`。⑨ **展示层 stale-display 收口(用户报告,非审计 7 项)**:根因=M-94 静态骨架写死数字、JS 只刷 id+setter 元素;Tier-1(`0e7e76a`)WIRE c7-ndx-note + 传导柱宽、Tier-2(`00a83c7`)STRIP 5 处叙述数字,均 push;余 6 项 WIRE deferred(见 P3-18)。两轮 bump 都重写冻结 `realtime.js`、都 revert 保 diff=0。新增记忆 `frontend_stale_static_display`,并补 `ops_bump_tool_blind_spots` 反向盲区段。
- **当前进行中(2026-06-02)**: 无。Codex 审计 7 findings 全部收口;另**展示层 stale-display** 已 Tier-1+2(`0e7e76a` / `00a83c7`)收口 + push,余 6 项 WIRE deferred(见 Section 2 P3-18)。均已 push、各经 Codex 复审。
- **下一步建议(2026-06-02)**: **Codex 审计 7 findings 全部收口**(F1/F2/F3/F4 修复、F5/F6 = no action、F7 增量);无 pending 审计项。后续可选 backlog 候选(均非本审计、各自另开 serial task):**F7 余项** = A1 的 Market Pricing/Macro/Recent INDEX 组逐 doc 精修(混活契约 + MILESTONE_INDEX:112 反指)+ `.mjs` 单体大拆(高 churn);**F6 真删** = 专门 dead-source 批次(lockstep:worker + check-workflows + Worker README + backlog,勿误删 `run-realtime.mjs` `/q/l/`)。详见 Section 2 P3-17。**另:展示层 stale-display WIRE 批次** = P3-18 的 6 项 deferred(DXY/Gold tone / 分类计数 / Fed 附录 / 侧栏 dd / commit-SHA / 情景%);WIRE 前须读 M94 重写计划 + 问 owner「临时接线 vs 并入重写」(新 session 提示词已备)。
- **阻塞或等待(2026-06-02)**: 无。
- **⚠️ 教训(2026-06-02)**: ① 审计复核中立取证有效——Codex 7 条事实引用全准,但 F1「回归」定性、F5「market-pricing-history 当首屏」被证伪/纠正;F4 反被 Codex 纠正我降级过头(双向交叉校验,非单向)。② `check:frontend-live-contracts` = `null-zero-display-guards`+`dom`+`macro-coherence-display-only`,**不**校验 IA 顺序/字体——退役 IA/editorial checker 后权威落 `DESIGN.md §4.1/§5.6` + ADR-0014(人工 review),文案别再暗示有命令能校验 IA。③ 中文 commit message 经 PowerShell 5.1 易乱码 → 写 UTF-8 文件 + `git commit -F` 规避(bash heredoc 亦可,勿用 PS here-string)。

---

> 以下为 2026-06-01 session 留档,当前状态以上方 2026-06-02 段为准。

- **上次会话结束于**: 2026-06-01 长 session,HEAD=`c40f293`,工作树干净,全部已 push。本 session 六件事(详细审计行见 Section 5):① **check 计数修正 18→15**(`887d29f`,纯文档)。② **Check Worker Health 报红 = worker 部署漂移**(非代码/非 FRED/非配额)→ owner `wrangler deploy`(Version `b354e20e`)修复,顺带上线一直 pending 的 brent-held-age-cap;#317 验证绿。③ **死 Stooq fallback 清理**(`1e5d4bd`:realtime gold/spx alternates 移除;实证 Stooq 日线 CSV `/q/d/l/` 已 API-key 门控,`/q/l/` 报价端点仍可用)。④ **copperGold 源 Yahoo 期货→gold-api 现货**(`d814e67`)+ Yahoo 跨厂商 fallback 两腿全覆盖(`fe481a4`)+ Daily check:data validator expand(`b176deb`)+ changePct null 守卫 & validator contract(`93a9714`);**Daily #116 线上验证 copperGold live**(ratio×1000=1.363,vendor=gold-api)。⑤ **QQQ 周线历史改 Yahoo 自动**(`643b660` 代码 + `5159639` 首刷至 2026-05-29/W22)+ 每周六 cron workflow `refresh-qqq-market-pricing.yml`,替代手动 Nasdaq CSV(`refresh-qqq-data.ps1` 留 fallback);已注册进 Pages deploy 触发列表。⑥ **新增 MOVE 债券波动率维度**(ADR-0015,结构门控·评分例外·**非第7模块**):数据广度审计发现唯一缺口=利率市场失灵通道;**两轮 Codex 对抗复核**(第1轮:校准红线 180→160、证伪 structuralScoreBump 进 lockEngine;第2轮:fail-closed 硬约束+stale 语义+审计轨迹)→实施 `de09111`+`c40f293`;`macroDrivers.rateVol`(Yahoo 日频 `^MOVE`,≥140 黄/≥160 红),不动 6 模块公式/权重、全历史零扰动。新增记忆:`ops_worker_generated_preview_stale`、`ops_validate_data_source_changes`。cache 版本现 `move-bond-vol-2`。**⚠️ 待 owner 跑 Build Daily Radar Data 验证 copperGold(gold-api)+ QQQ(已自动跑过)+ rateVol(MOVE)三者线上落盘。**
- **当前进行中(2026-06-01)**: 无。
- **下一步建议(2026-06-01)**: ① (可选)GitHub Actions 手动触发一次 **Refresh QQQ Market Pricing** 确认 CI 端到端绿(本地已验证、数据已到 W22)。② copperGold 下次 Daily run 起 changePct 自动从过渡 0/null 变真实"较前日"值,无需干预。③ goldapi.io = **不接**(100/月限额 + 缺铜,残腿备份);ACLED(xlsx)仍**手动**(EULA §3.3 禁爬,自用也不豁免;官方 API 需账号 API 权限才可自动)。④ 无 pending owner 动作(brent-held-age-cap 已部署、copperGold 已 live、QQQ 已自动)。
- **阻塞或等待(2026-06-01)**: 无。
- **⚠️ 教训(2026-06-01)**: ① **改 data 的 source/window/枚举前必 grep `scripts/validate-data.mjs`**(`check:data` 校验器,**非** `check-*.mjs`;常硬编码 `source`/`changeWindow`/`ratioWindow`);用 expand-then-contract Set 容旧+新,Daily 刷新后再 contract;**本地 check:all 只校验 committed 旧数据 → 换源/改 window 类改动本地绿 ≠ Daily 绿**(copperGold 在 Daily #115 炸过)。记忆 `ops_validate_data_source_changes`。② **`wrangler` 命令必在 `workers/gfrr-realtime-worker/` 目录内跑**(根目录会误把整站当 `gfrr-v28-package` 静态 worker 部署);`wrangler.toml` 是 gitignored;OAuth 登录态坏先 `logout`+`login`。记忆 `ops_worker_generated_preview_stale`。③ **Check Worker Health「ageMinutes>10」不总是周末/cron 误报**——可能是部署漂移致 worker-generated 模式停摆(差分诊断:mirror key 新鲜 + generated key 冻结 + heartbeat 陈旧无 error)。④ **新增 commits-to-main 的 workflow 必须同步加进 `deploy-static-site-to-pages.yml` 的 `workflow_run.workflows`**(`check-workflows` 强制,否则 check:all 红 + 站点不重建)。⑤ **bash 工具里别用 PowerShell here-string `@'...'@`**(`@` 会漏进 commit message);用 bash heredoc `-F - <<'EOF'`。
---

> 以下为更早 session(2026-05-31 编辑改版系列)历史留档,当前状态以上方 2026-06-01 段为准。

- **(历史)上次会话结束于**: 系统终审六批(A/B/C/B-next/D/E)收口后,做了**编辑版面改版系列**:① 首屏改版(删本期速读 plain-summary 静态块、verdict body 接活数据成富判读、de-box 只框分数)`2497e65`;② C5/C6 跨市场印证更有存在感(分级全球广度 + 中国接结论主线,仍 display-only/守边界)`a20e2da`;③ 阈值标尺 1:1 复刻参考页(bar 56→64px、标题 18→22px、zone 12→13/9→10px + 600px 响应式)+ 删“本期判读”标题(commit `ba101f7`,asset `threshold-scale-1to1-1`)。①②③ 均已 push、check:all 绿、BOM 净、`data/*.json` 未动;工作树仅余**本 Handoff docs commit**。批 D 决议=A 见 `926b423`。
- **本 session 增量(2026-05-31)**: 交叉验证 / 跨市场印证两块的 `<div class="meta">` 去工程术语——`CROSS VALIDATION MATRIX` 的 `buildCrossValidationMatrix() · narratives + consistencyScore + oneLineSummary` 换成大白话「7 条风险逻辑链的同向印证与反向证据 · 综合为一致性评分」;`MACRO COHERENCE` 的 `buildMacroCoherence() · ` 函数名前缀去掉、保留「仅供观察的定性印证 · 不进打分」。纯 index.html display-only,无 checker 引用这两行 meta(已 grep 确认),无 render/数据/scoring 改动。asset bump → `xval-meta-plain-1`。**第二步**(owner 续):oneLineSummary 第三句措辞改写——`数据缺口: N 个 narrative` → `N 条逻辑链可接入更深佐证源`(0 时「佐证源已较完整」),因「数据缺口」易被误读为"判不了",实则 = 7 条里 missingEvidence 非空/insufficient_data 的条数(与确认/矛盾**重叠**,故三数不相加;当前 4 = 能源冲击/滞涨/信用利差/世界秩序,多为未接 Platts/CDX 深度源或边界声明)。改 `buildCrossValidationMatrix.js:959`(项目唯一无 BOM 源文件,已双向核对未误加 BOM),无 checker 锁此措辞。asset bump → `xval-gap-wording-1`(三处盲区同步见教训 ②)。**第三步**(owner 续):传导网络「资产冲击分解层」能源行徽章 `<code>` class `danger`→`ok`(`index.html:497`)——纯静态 HTML 颜色 typo,「正面」应绿(同美元/短票),规律=按资产方向上色 正面绿(`ok`)/负面·偏空红(`danger`)/中性黄(`warn`),能源是唯一漏网;该 6 行 `<li>` 无 id、非 render 注入、纯静态。asset bump → `energy-tone-fix-1`。**第四步**:修复 `bump:frontend-asset-version` 三处盲区(加 PROJECT_BACKLOG/MILESTONE_INDEX 进 fixedFiles + 3 紧锚正则,见教训 ②,commit `b230996`,端到端测试通过;工具改 + doc 教训,无 asset bump)。**第五步(本次「① 新首屏窄屏/手机」)**:/browse 实测多宽度发现**整页横向溢出**根因 = `.macro-overview-shell`(隐式 `auto` 列 grid)被最宽子块(`#homepage-signal-layers` min-content 350px,长 snake_case narrative 标识符不断行)撑出 278px 容器、hero `stretch` 填满 370px→溢出 36px。修法**全部在 `assets/styles.css` 末尾「MOBILE / NARROW-SCREEN OVERRIDES」段的 `@media` 内**(≤600px:`.macro-overview-shell{grid-template-columns:minmax(0,1fr)}` + `>*{min-width:0}` + `.big-left .value` 字号 clamp(44,13vw,72) + `.narrative-item .name`/`.appendix-narrative code` 断行;≤440px:`.big-footer` 单列 + 市场温度内联 `auto/1fr` 网格 `!important` 改单列)。实测 360/375/390/414/440/600/768/1024/1280/1440 **全宽度溢出=0**;桌面 1280 大数字仍 128px、footer 仍 3 列、shell 仍走基础 `auto` 列——**PC 完全不变**。asset bump → `mobile-narrow-overrides-1`。**教训**:`display:grid` 无 `grid-template-columns` 的隐式 `auto` 列**不受容器宽约束**,会被最宽子块的 min-content 撑爆 → 容器型 grid 在窄屏要显式 `minmax(0,1fr)`;媒体查询覆盖必须放在被覆盖基础规则**之后**(同 specificity 拼源码顺序),故统一收口到文件末尾。**第六步(候选 ⑥:非首屏块窄屏内部排版巡检)**:/browse 多宽度扫"块内部溢出"(`scrollWidth>clientWidth`),修 4 处——① 交叉验证 `.consistency-bar-wrap{min-width:280px}` 比窄屏块还宽→归零随块收缩;② 信号分层长 snake_case narrative 名丑断词→`.score` 移到独立行(`flex:0 0 100%`+`padding-left:26px`)让名字得整行宽几乎不断、去掉激进 `word-break`;③ 附录 `.appendix-twocol`(1fr 列同 shell 类问题→`minmax(0,1fr)`+子项 `min-width:0`);④ 附录段落纯文本无空格斜杠串(`NDX/QQQ/IXIC/…`)不可断→`.appendix-narrative p{overflow-wrap:anywhere}`。全在末尾 MOBILE 段 @media 内。实测 360–1440 页面溢出=0、390 **全页无内部块溢出**;桌面 1280 核对 consistency-bar minWidth 仍 280px / score 仍 margin-left:auto / head 仍 nowrap / appendix 仍 2 列 / 大数字仍 128px——**PC 全走基础值零改变**。asset bump → `mobile-narrow-blocks-1`。剩:传导网络 flow-strip / 资产表在折叠 `<details>` 内(默认收起·不可见·无页面溢出),展开后窄屏内部排版未深抠,留低优先。**第七步(owner 续:折叠区资产表移动端友好)**:资产收益矩阵 6 列表(`#detail-data` 折叠区内)在窄屏挤压 → 选**横向滚动容器**(非卡片化,避免给 48 单元格加 data-label、改动最小)。`index.html` 给 `<table class="asset-table">` 套 `<div class="asset-table-wrap">`(不动单元格 id);CSS 在 MOBILE 段 ≤600px:`.asset-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}` + `.asset-table-wrap .asset-table{min-width:540px}`。实测(/browse 展开 details):wrapper 278/表 540 容器内横滑、`wrapScrollable=true`、360/390/768 页面溢出=0;桌面 1280 wrapper `overflow-x:visible`/不滚动/表 `min-width:0`/宽 1112 满宽——**wrapper 在 PC 透明、零改变**。flow-strip 本就靠 `flex-wrap` 在窄屏竖向堆叠,无需改。asset bump → `mobile-asset-table-scroll-1`。**第八步(owner 续:窄屏满宽对齐)**:owner 反馈手机上分隔横线/标题满宽、但各模块两侧大留白字小。根因=容器链 `.container`20px → `.editorial-section`**28px** → `.editorial-section-body`**8px**(折叠区 `.editorial-folded-content` 同 28px),分隔线在 container 层(350)而模块被多缩进每侧 36px 到 278。修:MOBILE ≤600px 收掉 `.editorial-section`/`.editorial-section-body`/`details.editorial-folded-content` 的**左右** padding(只去横向、纵向节奏与上下边框不动,container 20px 仍作屏幕边距)。实测 390 masthead/nav/shell/hero **全部 = 350**(对齐分隔线)、展开 detail-data 内容也 = 350;360–1440(含 details 全展开)页面溢出=0、内部块无溢出(横滑表除外);桌面 1280 section padding 仍 28px/body 仍 8px——**PC 不变**。asset bump → `mobile-fullwidth-1`。**至此移动端线全部收口(①+⑥+折叠表+满宽)。** **第九步(owner 续:信号分层去重复图标)**:每行两个 emoji——静态 `<span class="emoji">` + render JS 把 emoji 前缀拼进 `.name`(`renderMacroOverview.js:643` setLeafText `item.name`;JS 不碰无 id 的 emoji span)。删 7 个静态 `.emoji` span(最左侧那个)、保留 name 内 JS 映射 emoji → 每行剩一个。顺带删 base 死规则 `.narrative-item .emoji`(已无元素匹配·PC 零影响)+ 去掉之前对齐 emoji 的 mobile `.score{padding-left:26px}`(孤儿缩进)。无 checker 锁 `.emoji`(已 grep)。实测桌面/手机 `emojiSpanGone=true`、name 含 1 emoji、页面溢出 0。asset bump → `signal-emoji-dedup-1`。**第十步(候选 ②:跨市场印证 metric 缺失 fallback)**:探针跑全量/QQQ z 缺失(mpm=null)/大面积缺失三场景——E1–E5 fallback 全合格(无 NaN/乱码,正确降级背景)。发现 E6/E7 `refRow`(过热/能源引用矩阵)真 bug:reason 写死「已在交叉验证矩阵确认」但 verdict 随矩阵 narrative 变,craft brent70+crack5 实证 `energy_shock=contradiction`→energy_ref verdict=背离却仍说「已确认」。修:reason 三分支随 verdict(印证=已确认 / 背离=反向证据 / 背景=证据不足或未激活),改 `buildCrossValidationMatrix.js` refRow(无-BOM 文件已核对)。check:macro-coherence-display-only 不锁此文案(只锁不进 scoring/不落盘/不碰 consistencyScore),check:all 绿。asset bump → `coherence-ref-fallback-1`。**第十一步(候选 ③:checker Phase 2 三个非防火墙 merge + Phase 1b)**:owner 选「三个非防火墙 merge」(external-AI 防火墙 M-EA-1/M-EA-2 缓做)。**M-NODE-1**:`check:workflows-node24-only`→`check-node-runtime.mjs`(纯追加 expectedNode24Actions 映射 + 通用 `uses:` 扫描,补 github-script@v8/upload-pages-artifact@v5/deploy-pages@v5 + unknown warn;node-runtime 原有断言一行不动→零回归)。**M-DOC-1**:`check:project-backlog-format`→`check-doc-links.mjs`(backlog 6 段 + 非桩内容校验作独立函数 `checkProjectBacklogFormat`,formatFailures 汇入退出)。**M-WF-1**:`check:pages-trigger-coverage`(254行)→`check-workflows.mjs`(包成全局部变量 `checkPagesTriggerCoverage()`,失败经 `addRuntimeFailure` 汇入,覆盖报告保留打印)。三个 source `.mjs` 已 `git rm`,package.json 删 3 脚本 + check:all 链移除,顶层项 **18→15**。每个 merge 单测目标 checker 通过 + 完整 check:all EXIT=0(断言零丢失:逐项核对差异后纯追加/忠实移植)。无 asset bump(只动 check-*.mjs + package.json,未碰 index.html/app.js/modules)。docs 里历史引用(ADR-0010/M-57/M-60/MILESTONE_INDEX/审计史)按保留历史不动,仅修 §6「checked by check:project-backlog-format」当前指令为 check:docs。**Phase 1b D-lite 已在 Phase 1 顺带完成**(INDEX.md 退役 Market Pricing 设计文档已移出 Conditional、入 Historical 第156行,本轮 grep 复核确认无需再动)。external-AI 防火墙 M-EA-1/M-EA-2 缓做(动防火墙+workflow,留 owner)。**第十二步(候选 ④:B-worker Brent-hold 年龄上限,owner 选「观测+软警告」)**:审计 `SYSTEM_AUDIT_REPORT_v0.1.md:34`——worker hold path 把 previous/anchor 写回 `values.brent` 无年龄上限、strict gate 不查 Brent 自身观测龄。澄清:**scoring 主链走 run-realtime→realtime-data→daily**(CLAUDE.md NEVER 禁 Daily 切 worker),worker preview 是前端 overlay 展示 + worldOrder marketConfirmation,故为 worker 展示层 Brent;run-realtime 的 brentValidation 是 fixture/fallback 无 live hold,**finding 为 worker-only**。改法纯加性·不丢 Brent·不降级 scoring:**worker** 加 `BRENT_HELD_MAX_AGE_HOURS=168`、`buildBrentAudit(+nowMs)` 用 `selectedDetail.timestamp` 算 `selectedAgeHours`+`heldBeyondAgeCap`(=`applied!==true && age>cap`)写进 `brentValidation.audit`(不动 values.brent/任何 gate);**前端** `realtime.js` 从 audit 提进 runtimeMetadata(缺失→false 优雅降级),`freshness.js buildRealtimeStatusLabel` 超龄追加软提示「Brent旧值风险(held ~N天)」——**绝不进 `canUseRealtimePayloadValues` 信任 gate**(不 drop/不换源)。worker `node --check`+`check:workflows` 过;前端合成 payload 实测 held=true 出/false/缺失不出;asset bump `brent-held-age-cap-1`;check:all 绿。**⚠️ 待 owner `wrangler deploy` worker**(我无 Cloudflare 凭证;部署前 worker 字段不存在、前端软提示 dormant,对现有展示零影响——可安全先合并、择时部署)。
- **当前进行中**: 无。owner 拟开**新 session 做广度排查(其他问题/功能检查)**,非续此编辑线。
- **下一步建议(新 session 候选排查点)**: ① ✅ **已完成**(本 session,asset `mobile-narrow-overrides-1`)新首屏手机/窄屏渲染——全宽度溢出归零、PC 不变;② ✅ **已完成**(本 session,asset `coherence-ref-fallback-1`)跨市场印证块 metric 缺失 fallback 审计——E1–E5 实测全合格(全缺时正确「背景+未刷新暂不判定」、QQQ z 缺失时 E2「美股温度暂缺」);修了 E6/E7 `refRow` 一处真 bug:reason 写死「已确认」而 verdict 随矩阵变,被引用 narrative 因数据缺失成 contradiction/insufficient 时出现「背离/背景 但说已确认」自相矛盾 → 改 reason 随 verdict(印证=已确认 / 背离=反向证据 / 背景=证据不足),实测 contradiction 场景已一致;③ ✅ **已完成**(本 session)checker Phase 2 三个非防火墙 merge(M-NODE-1/M-DOC-1/M-WF-1,顶层项 18→15)+ Phase 1b D-lite(INDEX 重分类 Phase 1 已顺带做);**external-AI 防火墙 M-EA-1/M-EA-2 → 已决议不合并**(owner 授权 Claude 拍板:防火墙边界风险 > 组织性收益,保留独立,见 Section 5 2026-05-31 行);④ ✅ **代码已完成 · 待 deploy**(本 session,asset `brent-held-age-cap-1`)B-worker Brent-hold 年龄上限——worker 加 `heldBeyondAgeCap`/`selectedAgeHours` 诊断(纯加性·不动 values.brent)+ 前端超龄软提示「Brent旧值风险」(不进信任 gate);**owner 需 `wrangler deploy` worker 才生效**(部署前软提示 dormant、零影响);⑤ ✅ **已完成**(本 session)数据链/功能巡检——/browse 桌面+手机实测无 console 错误/无回归/无 NaN、本 session 改动全完好、healthScore=100/riskScore=50;运维观察(非代码):FRED 多源 fallback、QQQ 周历史 ~2 周缺口、version v27.0 为有意数据契约版本(详见 Section 5);⑥ ✅ **已完成**(本 session,asset `mobile-narrow-blocks-1`)非首屏块窄屏内部排版巡检——signal-layers / cross-validation / appendix 4 处块内溢出已修、全页 390 无内部块溢出、PC 不变;⑥-后续 ✅ 折叠区资产表已做横滑容器(asset `mobile-asset-table-scroll-1`)、flow-strip 本就 flex-wrap 竖排 —— **折叠区也收口完毕**。参考页标尺样本 = `D:\PCTMoveData\Desktop\AI 泡沫监测 · The Bubble Watch.html`。
- **阻塞或等待**: 无。
- **🔧 2026-06-01 收尾更新**: ① **check 计数修正 18→15**(`check:all` 顶层项:Phase 2 checker merge 后实为 15,核对 package.json 确认;Section 1 + MILESTONE_INDEX 同步;commit `1037ba5`,纯文档、check:all 绿、无 asset bump)。② **Check Worker Health 红 = worker 部署漂移**(非代码 / 非 FRED / 非配额),已 `wrangler deploy` 修复(Version `b354e20e`),详见 Section 5 2026-06-01 行 + 记忆 `ops_worker_generated_preview_stale`。③ **上文「下一步建议 ④」与「本 session 增量 第十二步」标注"待 deploy"的 B-worker Brent-hold age-cap 已随本次部署上线生效**(Version `b354e20e`,原"待 deploy"作废,前端软提示已 active)。④ **教训**:`wrangler` 命令必须在 `workers/gfrr-realtime-worker/` 目录内跑(在仓库根目录跑会误把整站当 `gfrr-v28-package` 静态 worker 部署);`wrangler.toml` 是 gitignored 故部署 cron 无法从 repo 读;OAuth 登录态坏时先 `wrangler logout`+`login` 刷新。⑤ **更正下文教训 ⑤**:「Check Worker Health: worker ageMinutes>10」**不总是**周末/cron 误报,本次实证为部署漂移导致 worker-generated 模式停摆。
- **⚠️ 流程教训(2026-05-30)**: 多步任务的 **finalize commit 容易漏提交** —— Stage 16 finalize 曾被误判为已提交(owner「push 了」实指实施 commit),后由 Codex 报告 dirty 文件才发现。**防呆:每个 stage 收尾前先 `git log --oneline -3` 确认 finalize commit 真在 log 里,再开下一任务;serial-trunk 下若工作区出现非本轮的 dirty 文件,先停查 git status/log 别直接 add -A 混提交。**
- **⚠️ 教训(2026-05-31,C5 三批)**: ① **往已存在多 key 展示层加 key 必走 Option C**(validator Set 接受 legacy+target source、新 key「存在才校验」)——直接改严会让 committed 数据失效、push 触发 deploy check:all 红、Pages 断。② **PowerShell here-string helper 的 `Set-Content -NoNewline` 会删 UTF-8 BOM**;每批 diff 复核必查 6 个 helper-touched 文件 BOM 并字节级补回。③ **批 N+1 提交前先 `git pull --rebase`** 同步上批 Daily 的 committed 数据,否则本地旧 key 数据在新 Set 下 check:data 失败。
- **⚠️ 教训(2026-05-31,批 E)**: ① **BOM 不是全项目统一** —— `scripts/modules/buildCrossValidationMatrix.js` 是唯一**无** BOM 的源文件;brief 笼统写「所有源文件带 BOM」导致 Codex 给它**误加** BOM、污染首行 diff。**diff 复核查 BOM 要双向 + 对 HEAD 比对**(`git show HEAD:f | head -c3` vs 工作树),既防误删也防误加。② **大型 display 层走「同模块 + 纯定性 + 不碰既有分数」(Design B')最稳**:`consistencyScore` 算法 byte 不动 → 现有一堆 marker/density checker 零风险;新层只出定性判定不出第二个数字。③ **方向有歧义先让 Codex 独立复核再拍板**:批 E 的「并入 consistencyScore」二义性由 Codex 对抗复核收敛为 B'(去掉可见计数)。
- **⚠️ 教训(2026-05-31,编辑改版)**: ① owner 常在一项验证完就跳到下一需求/报错,**上一项 commit 易留工作区没提交**(本轮阈值标尺、之前批 D backlog 都中过)——收尾/换 session 前**必 `git status` 确认无遗留 dirty**。② **`bump:frontend-asset-version` 工具三处盲区已修复(2026-05-31)**:工具曾漏三处(`scripts/app.js` 的 `const APP_VERSION`、`PROJECT_BACKLOG.md`「Cache version」表格格、`MILESTONE_INDEX.md`「当前 \`X\`」),每次 bump 后立即 stale(`ea81863` 与编辑改版轮均中招)。现已把这两个 doc 加进工具 `fixedFiles` + 加 3 条紧锚正则(`APP_VERSION` 赋值 / 「Cache version」表格格 / 「当前 \`X\`」后接 \`check:all\` 锚定),端到端测试三处同步更新通过。**仍建议** bump 后 `grep` 旧版本串确认无活跃残留(Handoff/审计历史里对过往版本的引用属正常,不应被改)。③ **`DESIGN.md` 也是无 BOM 文件**(第 3 个,连同 `buildCrossValidationMatrix.js` / `MILESTONE_INDEX.md`)。④ **小幅前端 display-only 微调可 Claude 直接改 + 自验 + 给 commit**(C5/C6、阈值标尺即如此);大改 / 动逻辑仍走 Codex 实施→复核。⑤ **运维**:Daily「dailyRealtimeInput live payload is stale」与「Check Worker Health: worker ageMinutes>10」均为周末/cron 缺口的 freshness 闸误报,非代码,详见记忆 `ops_daily_realtime_freshness`。


<a id="audit-history"></a>

## Section 5 · Audit History

Compact current audit trail:

| Date | Scope | Outcome |
|---|---|---|
| 2026-06-05 | 全站 .md 文档审计 / 瘦身(Batch 1a→5余项,docs-only) | 以 115 个 git-tracked `.md` 为审计面做 audit+slim;纪律=只改 .md、不删 load-bearing history、不破 contract/marker、serial-trunk + Codex 对抗复核 + owner 手动 commit(AGENTS 10.4)。**Batch 1**=三大 changelog tail 折 B-consolidated 索引(1c DATA_CONTRACT / 1b OPERATIONS / 1a SYSTEM_UPGRADE_PLAN,2391→359);**Batch 2**=External AI 14 phase docs 加 visible-read-only STATUS banner;**2b**=READINESS_CHECKLIST 1111→422 stacked-band 原地折表;**Batch 3**=Market Pricing 13 docs 加 has_history/M-27-live banner;**3b**=TEMPERATURE_DATA_SOURCE_DESIGN 529→340 §14-25 折表。两大 scope-of-record 簇(External AI / Market Pricing)全闭合;各批 check:all 绿 + git diff --check clean;banner/fold 保留所有 still-true 规则与 run-ID/commit/artifact 锚点。**Batch 4**= M92/M93 plain-summary 4 docs 进 INDEX Historical + 2 spec banner;**Batch 5余项**= M94_V0_DATA_CONTRACT + DESIGN plain-summary residual reconcile→retired + 全局三段 attribution(checker `5eff6ab` / renderer `c8229574` / DOM `91d06f3d`)。**全轮 .md doc-slim audit(1a→5余项)收官**,各批 check:all 绿 + git diff --check clean;剩余仅独立 `assets/styles.css` frontend CSS cleanup(已 spawn chip,需 asset bump 故不进 .md 审计)。 |
| 2026-06-01 | 新增 MOVE 债券波动率维度(结构门控 · 评分例外 · ADR-0015) | 数据广度审计→决策层缺"利率市场失灵"通道(VIX 管股、OAS 管信用,无人管 2022 gilt/2023 SVB 式利率危机)。owner 同意补,走正式流程:Claude 提案→**Codex 对抗复核**→Claude 代码验证收敛。**Codex 关键修正(已验证采纳)**:① `structuralScoreBump` 仅 decisionModel 展示、`lockEngine` 不消费(现有结构信号加分是装饰性,真翻灯靠 gating)→ MOVE 实效全在门控阈值;② 红线 180→**160**(180 漏 2020~164/2022~160 级危机;160>2年峰值140 仅真危机触发)。**实施(结构信号-only,不动 6 模块公式/权重)**:`macroDrivers.rateVol`(Yahoo 日频 `^MOVE` + 闸门 `[20,400]`/INDEX/≤5d + fail-closed-with-visibility)→ 新结构信号 `moveVolStress`(≥140→structuralYellow、≥160→structuralRed,进 `evaluateStructuralGating`/`activeStructuralSignals`)+ `isAllStructuralSourcesMissing`/`structuralBandShift`(加 `-15` 总下限)接线 + decision.js 前端(标签/重算 fallback/extremeThresholds)+ `validateMacroDriversRateVol`(expand-then-contract)+ rules.json(rateVol/bump 8/shift -5/floor -15)+ DATA_SOURCES/DATA_CONTRACT + ADR-0015。**影响**:全历史零扰动(MOVE 现~70 平静;39 天历史本已 ON RRP 全红);情景表实测 70→不触发/140→黄/160→红;非第7模块、与 World Order 无关、不进 `values.*`/6 模块 score。asset bump `move-bond-vol-1`,check:all 全绿(commit `de09111`)。**第二轮 Codex 跟进复核(信心 0.88,无阻断)→ hardening**(`c40f293`,asset `move-bond-vol-2`):补 **fail-closed 硬约束**(validator:live/fallback→`move∈[20,400]`、stale/missing→`move=null`,封堵 `stale+move=200` 坏行)、**`stale` 不再触发信号**(三处只认 live/fallback)、**修我引入的 all-missing 旧数据 undefined bug**(`=== 'missing'`→`!== 'live' && !== 'fallback'`,覆盖 undefined+stale)、appendHistoryFull 加 `move`/`moveAgeDays`/`moveSourceStatus` 审计轨迹、moveVolStress 进橙色等级白名单。**⚠️ 待 owner 跑 Build Daily Radar Data 线上验证**:rateVol live(move~70/regime 平静/status live)、`activeSignals` 不含 moveVolStress(平静)、灯不变。 |
| 2026-06-01 | QQQ 周线历史改自动抓 Yahoo(替代手动 Nasdaq CSV · display-only) | owner 反馈手动总忘、无系统提醒,要求自动化。确认 QQQ 周线历史(`data/market-pricing-history.json` 主资产 + metrics)原走**手动 Nasdaq CSV**(`scripts/refresh-qqq-data.ps1`),且 market-pricing **不进 scoring/decision**(grep 证实 + 文件 boundaries display-only)。与 ACLED 不同——QQQ **无 EULA 禁爬**,且 NDX/IXIC 早已自动抓 Yahoo,故可仿做。**实现**:新增 `scripts/market-pricing/qqq-yahoo-history-refresh.mjs`(仿 ndx-ixic,Yahoo `QQQ` 周线 10y,**ETF** instrumentType,**overwrite** assets.qqq records/source/coverage,**保留** sourceMode/qqq status=active/priority=1/labelZh + ndx/ixic/spx)+ npm `market-pricing:qqq-yahoo:dry-run|commit` + 新 workflow `refresh-qqq-market-pricing.yml`(周六 08:00 UTC cron + dispatch → refresh → metrics:commit → check:all → commit+rebase+push)+ 把该 workflow 加进 Pages deploy `workflow_run.workflows`(check-workflows 强制 commits-to-main workflow 必列)。**防 copperGold 式踩坑**:提前 grep validator,确认 `source.vendor`/`sourceVendor` 仅校验非空串(可改 yahoo_chart),唯一硬编码 = `sourceMode==='manual_weekly_input_committed'`→保留不动。本地全程验证:dry-run→commit→metrics→check:all 全绿;qqq 522 records 至 2026-05-29(W22)、vendor=yahoo_chart、previousVendor 留痕、zScore 2.506、ndx/ixic/spx 未动。保留 ps1 作手动 fallback。纯管线+workflow+data,无前端改→无 asset bump。 |
| 2026-06-01 | copperGold 铜金比源 Yahoo→gold-api(display-only · 强壮性) | owner 选用 gold-api.com(免 key/无限实时/已是 gold 主源)做替代。实测 gold-api 覆盖**金属+加密**(XAU/XAG/XPT/XPD/**HG 铜**/BTC/ETH),**不含油/指数/汇**;故唯一在边界内的落点 = 把 copperGold 两腿(原 Yahoo `HG=F`/`GC=F` 期货)换成 gold-api `HG`/`XAU` 现货。改动:新增 `fetchGoldApiPrice`(复用 `fetchJsonText`)、`resolveCopperGold` 改抓 gold-api、legs `HG=F`/`GC=F`→`HG`/`XAU`、label 期货→现货、note 期货代理→现货价、source→`gold-api:HG; gold-api:XAU`。**changePct 口径变**:gold-api 实时端点只给现货价无 change → 改为**用上一轮 Daily 的 leg 价派生"较前日"**(window `5d`→`1d`;首轮 Yahoo→gold-api 过渡 source≠gold-api 时置 null 免 artifact)。前端 `renderMacroOverview` "近5日"→"较前日"、index.html C2 静态占位 meta/aux 同步。**复核抓到自身 bug**:`replace_all` `Yahoo:${config.symbol}` 误伤 worldEconomy/chinaEquity(同模式但仍 Yahoo)→ 已 revert,只 copperGold 2 处用 `COPPER_GOLD_CHANGE_WINDOW` 精确锚改回 gold-api。边界不变(display-only,不进 scoring/decision/…/cross-validation)。asset bump `copper-gold-goldapi-1`,check:all 全绿。**⚠️ 待 owner 手动触发 Build Daily Radar Data 线上验证**:copperGold live、source=gold-api、铜≈6.x/金≈4.5k、ratio×1000≈1.36、首轮 changePct 可能 null(过渡)次轮起有值。 |
| 2026-06-01 | Check Worker Health 红排查 + 修复(worker 部署漂移,非代码) | owner 早晨见 Check Worker Health 多次报红(`worker ageMinutes>10`)。**差分诊断**(纯 curl + 一条 wrangler kv):`/health` live、`/market.preview.json`(github-mirror key)`fetchedAt` 数分钟前新鲜 → **cron 在跑、KV 写正常**;但 `/market.worker-preview.json` 冻结于 `2026-05-31T18:39:36Z`(~5.5h)、secondary 同冻。读未经 HTTP 暴露的 `market:worker-heartbeat`(`wrangler kv key get`)= 停在 **2026-04-29 + `previewFetchStatus:ok`/`previewError:null`** → **证伪「构建抛错」**(抛错会写新鲜 error),实为 **worker-generated 模式不再被选中**:线上跑旧代码/旧 cron(heartbeat note `enabled` ≠ repo `attempted` = 部署漂移),`selectScheduledPreviewMode=floor(now/180000)%2` 在非 `*/3` cron 下永远落 mirror 槽。叠加**本地 OAuth 登录态坏了**(`whoami` 取不到账号)致初始无法部署。**修复**:`wrangler logout`+`login` 刷新鉴权 → 在 `workers/gfrr-realtime-worker/` 内 `npx wrangler deploy`(同步 repo HEAD + 本地 `*/3` cron;Version `b354e20e`;顺带上线 pending 的 brent-held-age-cap `cb413bd`)→ worker-generated 1 分钟内恢复刷新,health `unhealthy`→`warning`(EXIT=0,仅余周末 VIX stale-warning)。**影响有限**:冻结期前端 `workerMaxAgeMinutes:10` 超龄即回退 GitHub realtime,scoring 走 run-realtime→realtime-data→daily 不碰 worker。差分诊断法 + 判别表入记忆 `ops_worker_generated_preview_stale`。**教训**:`wrangler` 必在 worker 子目录内跑(根目录会误把整站当 `gfrr-v28-package` 静态 worker);`wrangler.toml` 是 gitignored,部署 cron 读不到 repo。 |
| 2026-05-31 | FRED fallback 根因修复(Daily FRED API 限流 → 串行+重试) | **根因(CI 日志铁证)**:最新 Daily run `26708754850` 日志含 **54× `[fred-api-fallback] fred:XXX: HTTP 429`**(全限流,时间戳挤在 ~0.7s)。Daily pipeline 把 ~55 个 FRED API 调用经嵌套 `Promise.allSettled` **并发齐发** → 撞 FRED 免费层限流(burst 429);`fetchFredSeries` API 路径**无重试**(单次 `fetchWithTimeout`)→ 429 即落**已死 CSV**(2026-05-29 关闭)→ throw → carry-over(fallback)。少数(WALCL/HYOAS/CPI)在限流前抢先成功 → live,解释"部分 live 部分 fallback"。影响:多为 display-only 宏观卡,但 onRrp/igOas/t10y2y/NFCI 也喂结构门控(走 last-good carry-over,慢变量失真小)。**修复(owner 选 C=对齐 worker sequential-with-retry)**:`run-daily-pipeline.mjs` 加全局 **FRED API 串行门** `runFredApiSerialized`(一次一个 + 150-300ms jitter 间隔,防 burst;出错不断链)+ API 路径改用 `retryFetch`(3 次/800·1600ms backoff,riding out 残留 429),CSV 仍作末级 fallback。**只改 FRED API 请求时序/并发 + 加重试,不动解析/fallback 语义/任何值**——数据正确性不变,只提鲁棒性。验证:`node --check` 过、串行门算法独立测(maxConcurrent=1 严格串行、出错隔离不断链)、check:all EXIT=0;**无 asset bump**(非前端)。**⚠️ 待真验证**:本地无 FRED_API_KEY 跑不了 pipeline,需 **owner 手动跑一次 Build Daily Radar Data**(realtime 须 <180min)看日志 429 是否清零、macroDrivers 多源回 live。worker 的 sequential-with-retry 早已对(9 系列不撞),本次把同范式补给 Daily(55 系列)。 |
| 2026-05-31 | ⑤ 数据链/功能巡检 + external-AI 防火墙 merge 决议 = 不合并 | **巡检通过,无功能 bug、无回归。** /browse 桌面 1280 + 手机 390 实测:无 console 错误、无网络失败、heroScore 50/100 / cv 71 / mtZ +2.18 全渲染、pageOverflow=0、手机 heroW=mastheadW=350(满宽对齐)、signal emojiSpanCount=0(单 emoji)、energy 徽章 class=ok、**无 NaN/Invalid/+0.0bp/undefined**(null-zero 守卫在大量 fallback 下仍稳);本 session 所有前端改动(①⑥折叠表满宽/去重 emoji/coherence/能源徽章/B-worker 软提示)全部完好。数据链:sourceMode=live、healthScore=100、riskScore=50、realtime 主链正常;China/worldEconomy/copperGold/euroVol 等全 live。**运维观察(非代码·非回归)**:最近 Daily 多个 FRED 派生 macroDrivers=fallback(employment 全 fallback、credit/consumer/CRE/inflationEnergy 多 fallback;display-only carry-over 不破 scoring;疑 FRED 可用性,若持续查 FRED API/重跑 Daily,见记忆 `fred_api_sourcing`/`ops_daily_realtime_freshness`)、QQQ 周历史 last=2026-05-15(~2 周 manual/weekly 刷新缺口);`version: v27.0` 经查为**有意的数据契约版本**(`contractVersion` 全 v27.0,区别于 v28 代码库,非 bug)。**external-AI 防火墙 merge(M-EA-1/M-EA-2)owner 授权 Claude 拍板 → 决定不合并**:这是项目最敏感边界(CLAUDE.md 规则4 + NEVER「不削弱防火墙校验器」),合并 4 个 BOUNDARY-INVARIANT 防火墙 checker + 改 workflow YAML 风险(丢防火墙断言/断 workflow)远大于纯组织性收益(顶层 check 名少几个);Phase 1b 决议已定项目文化=保留非激进清理,Phase 1+2 已拿到价值。**转 won't-merge,保留独立防火墙。** |
| 2026-05-31 | 批 D 油价三重计数 · 评审决议 = A(不改风险模型) | Claude + Codex 独立量化 + Claude 代码亲验:油价占总分 **28.456%**(geo 0.15×0.72 + energy 0.16×0.82 + inflation 0.18×0.72×0.35;同一 `oilRisk` 标量〔`run-daily-pipeline.mjs:8459`〕复用 3 通道,**非 3 独立测量**)。**决策影响 = 零**:$60–$120 Brent 扫描去重只动展示 score(最多 ±18),**从不翻转** executionLock/strategyState/positionGuidance——执行灯红/黄走**直接 Brent 阈值**(`8666-8675`,≥110/≥90)不经加权 score;且当前红灯是 **ON RRP 结构门控**(`onRrp 11.677 < 50`,`8629`)触发,与油价无关。结论:**非 bug、设计集中度、本轮不改**(Codex 信心 0.78;代码验证后 Claude 提至 ~0.85)。`oilInflationWeight` 记为未来回测候选(见 Section 4)。**🏁 系统终审六批 A/B/C/B-next/D/E 全部收口。** |
| 2026-05-31 | 全系统 6 路终审 + 展示层修复路线图(批 A-E) | 打分 / 结构门控 / 实时-Brent / 全 fetcher / 交叉验证-叙事 / 前端契约-overlay-校验器 6 路只读审计 + Codex 交叉证伪:**地基扎实,无确认级 critical bug**,真问题集中在展示层。路线图批 A(展示完整性)/ B(守卫)/ C(shippingFreight 补卡)/ B-next(数据龄)/ E(跨市场印证层 Macro Coherence)已落地;批 D(油价三重计数去重,动打分)缓做,需 owner 单独拍板是否改风险模型。报告 `.claude/stage-briefs/SYSTEM_AUDIT_REPORT_v0.1.md` + `MACRO_COHERENCE_AUDIT_REPORT_v0.1.md`、批 E 设计/实施 brief `BATCH_E_MACRO_COHERENCE_*`(均 gitignored)。 |
| 2026-05-31 | checker 精简 Phase 1(去 frozen 占位 checker + 修 null-zero coverage gap) | owner 觉得 checker 过多/过细 → Codex 深度审计(`.claude/stage-briefs/CHECKER_STREAMLINE_AUDIT.md`,80 个 check:* 全覆盖,每个 DELETE/MERGE 附"边界不丢"证明)→ Claude 复核拍板【分两段】,Phase 1 先行(安全大头)。删 19 个已完工分阶段 rollout 的 frozen 占位 checker:17 个 market-pricing `*-design`/`*-scaffold`/`*-dry-run`(含 unified-data-pipeline-architecture)+ 2 个 external-ai 别名(production-data-write-script=syntax-only 由 check:syntax 覆盖 / artifact-review=orphan)。交叉引用预排查:保留 checker / check-workflows / AGENTS / workflows【零反向引用】(仅 docs 文本提及,未动)。**顺带修 coverage gap**:`check:null-zero-display-guards`(AGENTS §104 规定应在 frontend suite 但实际没接进 check:all)经新建 `frontend-live-contracts` suite 接回。防火墙(external-ai output/contract/write-guard + market-pricing-history)+ ADR-0006 first-real-record-write-scaffold 全保留;未放宽任何保留 checker 的 assertion(AGENTS §313 = deliberate reviewed change)。market-pricing suite 24→7、external-ai 13→12、check:all leaf ~65→~48。commit `7fb9b3c`,check:all 全绿。仅改 package.json + check-suite.mjs + 删 17 个 checker 文件,无 frontend/scaffold 源/fixture/docs 改动。**Phase 2(6 个 MERGE,含改 workflow 的 M-EA-2)+ Phase 1b(删 scaffold 源/fixture/设计文档死重)待 owner 另议。** |
| 2026-05-30 | Stage 16 chinaMlf pbc→EastMoney 聚合新闻源切换(audit-only · 三卡收官) | 三张换源卡的最后一张(MLF)。DP0 可达性 Stage 14 probe 已证 → DP1 eastmoney MLF 新闻解析实证(最大风险=净投放 vs 操作量;新闻把期限内嵌「开展6000亿元1年期MLF操作」→ 现有 pbc 毛额正则会漏)→ Claude 复核拍 v1.1(单 AMOUNT_RE 容期限内嵌只取毛额、TERM 2-pattern+中文数字、RATE 严格 nullable、复用 Stage 14 helper)→ 读 MLF validator(mlfRate/opDate/ranges 已 nullable/适配,只改 source)→ brief → Codex 实施(opDate 自改进为「操作句前最近日期」绑定操作日)→ Claude 逐处 diff 复核(毛额 vs 净投放、期限内嵌、中文数字、死代码删净、不碰 values)→ 过渡容差解 committed 旧产物 → commit `8501a42`/push → 线上 Daily 验证 live → contract 收紧。check:all 全绿。**线上验证**:chinaMlf live/EastMoney/operationAmountYi=6000(毛额非净投放 1000-2000/到期 5000)/termMonths=12/mlfRate=null/opDate 2026-05-25。边界:聚合新闻非官方公告,不进 scoring/…。**🏁 三 pbc 卡(社融 Stage14 / OMO Stage15 / MLF Stage16)全部因 pbc geoblock 切 EastMoney 完毕,US runner 全 live。** |
| 2026-05-30 | Stage 15 chinaOmo pbc→EastMoney 聚合新闻源切换(audit-only) | 沿用 Stage 14 模板的第二张换源卡(OMO)。DP0 可达性已由 Stage 14 probe 证(eastmoney「逆回购」搜索 US runner 200)→ 直接 DP1 eastmoney OMO 新闻解析实证(关键:OMO 是新闻改写非官方原文,正则按新闻句重写;净投放 vs 毛额操作语义陷阱;announcementNo 缺;no-op 新闻不报道)→ Claude 复核拍 v1.1(eastmoney 单源 + operationRe/rateRe 双锚 + content-first + announcementNo→null + 砍 no-op + 复用 Stage 14 helper)→ 读 OMO validator/parse/render 核对(announcementNo 已 nullable 免改 validator;render 已优雅处理 null+no-op 免改)→ brief → Codex 实施 → Claude 逐处 diff 复核(operationRe 去 `|操作` 旁支、净投放靠结构排除、死代码删净、不碰 values)→ 过渡容差解 committed 旧产物 → commit `49d7236`/push → 线上 Daily 验证 live → contract 收紧。check:all 全绿。**线上 `affe934` 验证**:chinaOmo live/EastMoney/逆回购/7天/0.014/1230亿/announcementNo null。边界:聚合新闻非官方公告,不进 scoring/…。MLF 仍 pbc-blocked 待 Stage 16。 |
| 2026-05-30 | Stage 14 chinaTsf pbc→EastMoney 聚合源切换(audit-only) | 线上 Daily 实测 pbc.gov.cn 在 US runner 地理封锁(OMO/社融/MLF 三 pbc 源 missing,fail-closed 无伪造)→ 开换源调研。流程:outline v1.0 → **DP0 一次性 probe workflow**(`on: push` 诊断分支,US runner 实测 eastmoney/TE/mofcom 13/13 端点 200;eastmoney 可达,TE chart JSON base64 加密弃,mofcom .gov.cn 可达但最新 202512 滞后+缺政府债券分项弃)→ owner 拍板「TSF 先行单卡」→ DP1 eastmoney 解析实证(搜索 JSONP discovery + 8 分项正文锚 + 东财 linkify 的 `信托 贷款` 词内空格坑)→ Claude 复核拍板 v1.1(eastmoney 单源 + 硬验证 complete 门 + CJK 空格修复 + refMonth/publishedAt 改源 + 弃 TE/mofcom)→ brief → Codex 实施(7 文件)→ Claude 逐处 diff 复核 → check:data 撞 committed 旧产物耦合 → **expand-then-contract 过渡容差**解(本仓 M-56 先例)→ commit `5157183`/push → 手动触发 Daily 线上验证 live → contract 收紧严格断言。check:all 全绿。**线上 `f340127` 验证**:chinaTsf live/EastMoney/stockYoY 0.078/8-8 complete 含 trustLoans。边界:聚合转载非官方,不进 scoring/decision/execution/position/values/baseline/cross-validation。**教训**:进 main 的新 workflow 需顶层 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`(probe 抛弃式分支无所谓);source label 迁移需 expand-then-contract(committed 数据产物与 validator 耦合)。OMO/MLF 仍 pbc-blocked 待同法。 |
| 2026-05-30 | Stage 13 PBOC MLF 实施(P3-16 收官 live 源,audit-only) | P3-16 实施程序最后一源。7 步流程全过(outline→Codex DP0 实证「MLF 独立频道;近年招标公告不披露单一利率→mlfRate=null 正常;同列表有短 id 文章→discovery 必须 title-based 不靠 URL 日期」→ Claude 拍板〔amount+term hard gate、rate optional null、title 年月排序、加 publishedAt〕→ Codex brief → Claude 逐字符复核 helper + 19 anchor Count=1 + title-based discovery 排 self-link + **指出并修正 §9 asset bump 写法**(原手动 4 处会漏其它模块 ?v= → 改用 bump 工具)→ Codex 实施 → diff 复核 render 无 weld/不碰 values/版本串 stage-12 残留=0)。`macroDrivers.chinaMlf`:title-based discovery + amount 多格式 + term×12 + rate optional;render setLeafText 无 innerHTML。commit `9116bb0`(15 files +346/−38),check:all 全绿。边界:公告级≠raw tape,不进 scoring。**至此 P3-16(70城/OMO/社融/MLF)四源全部 live 收官,SLO 仅历史。** |
| 2026-05-30 | Stage 12 PBOC 社融实施(P3-16 第 3 个 live 源,audit-only) | 7 步流程全过(outline v1.0→v1.1:Codex DP0 实证「最新报告给存量同比+年内累计增量+累计分项,非当月;primary=金融统计数据报告」→ Claude 拍板〔用累计口径不做 derived 当月、8 分项无 sum-to-total、stockYoY fail-closed 闸〕→ Codex brief → Claude 逐字符复核 helper(assertArray/isFiniteNumberOrNull/monthNumberToRefMonth)+ 18 anchor Count=1 + 组件正则消歧增量/存量 + §5.2 两行块 LF → Codex 实施〔补 APP_VERSION〕→ diff 复核 render 无 weld/不碰 values/derivedMonthly 零)。`macroDrivers.chinaTsf`:discovery 排 self-link + headline/8 分项正则 + 万亿×10000/减少取负 + componentsStatus;render 折叠分项 DOM(复用 city-tier CSS)。3 类 wiring + render 早退前 + count 9→10 + validator optional + DATA_CONTRACT degraded 11→12 + DATA_SOURCES implemented。commit `eb0c47e`(15 files +519/−38;acled 周刷新 json 单独排除),check:all 全绿。边界:报告级累计≠raw tape,不进 scoring。线上待验证(chinaTsf live + componentsStatus complete)。 |
| 2026-05-30 | Stage 11 PBOC OMO 实施(P3-16 第 2 个 live 源,audit-only) | 7 步流程全过(outline v1.0→v1.1:Codex DP0 实证 **pbc.gov.cn 新域名 US runner 可达**〔UA 沿用,200,无需特殊 header〕+ discovery 列表页排 self-link + no-op 分支 → Claude 拍板〔tier...不,schema generic operationRate decimal、砍 netInjection/投标量、no-op live 分支〕→ Codex brief → Claude 逐字符复核 helper 全存在 + ~20 anchor Count=1 + discovery 排 self-link + no-op + DATA_CONTRACT 7.1→7.2 顺序 → Codex 实施〔顺手清 5 weld〕→ diff 复核 render 无 weld/不碰 values/netInjection 零)。`macroDrivers.chinaOmo`:公告 discovery + 双正则 normalize + term 交叉校验;operationRate decimal(render ×100);只存中标量;freshness publishedAt/opDate+7d。3 类 wiring + render(早退前)+ count 8→9 + validator optional + DATA_CONTRACT degraded 10→11 + DATA_SOURCES implemented。commit `53ca93a`(15 files +354/−38),check:all 全绿。边界:公告级≠raw tape,逆回购利率只展示不进 scoring/decision/…。线上待验证(chinaOmo live + 无操作日 no-op)。 |
| 2026-05-30 | 70 城城市明细折叠(P3-16 增强,tierBreakdown + `<details>`) | 7 步流程全过(outline v1.0→v1.1:Codex DP0 实证「数据页无 tier 标签、同日解读页给官方 4/31/35 划分」→ Claude 拍板 tier 名单**硬编码**〔不抓解读页,分级稳定〕+ 亲自校验 31/35 名单与 Stage 10 70 城常量精确对齐〔并集=70,无重叠/遗漏〕→ Codex brief → Claude 逐字符复核 10 anchor + helper + parse 不破坏 Stage 10 + fail-closed → Codex 实施 → diff 复核 render 无 innerHTML/不碰 values)。`tierBreakdown`(3 tier × 新房/二手 × up/flat/down 全城市名数组,optional/nullable);C6 卡原生 `<details>`(无 open、非 appendix class、DOM 构建);validator present 时严格(城市∈官方 tier+唯一+和=cityCount+合计70)。commit `e03c36a`(14 files +303/−44),check:all 全绿。边界:城市方向≠raw tape,不进 scoring/decision/…。线上待验证(tierBreakdown 每 tier 4/31/35)。 |
| 2026-05-30 | Deploy hotfix:world-order narrative checker market_confirmation 条件化 | Pages deploy 红(check:world-order-narrative-density),**与 Stage 10 无关**。根因:`check-world-order-narrative-density.mjs` 无条件要求 `world_order_market_confirmation` 在 `world_order_pressure_crossing` supportingEvidence,但 `buildCrossValidationMatrix.js:822` 仅在 `marketConfirmation.state ∈ {confirmed,partial_confirmed}` 时添加;world-order 刷新(`f4038f6`)把市场输入从陈旧偏紧(partial_confirmed)换成新鲜平静(weak)→ evidence 不在 → 红。修:checker 要求条件化(confirmed/partial 才强制;weak 反向保护),对齐同文件 M-51 gdelt 模式;checker-only,不动 builder/data/frontend,无 asset bump,其它 7 项无条件 evidence 未放松。commit `32237c9`,check:all 全绿。诊断按「未列 checker failure 先停报告」走 Codex 实施。 |
| 2026-05-29 | Stage 10 NBS 70 城房价实施(P3-16 第一个 live 源,audit-only) | 7 步协作全过(outline v1.0 → Codex 实证 DP0:可发现/可抓/可解析,**关键修正最新页是表格页非 headline 句** → v1.1 锁表格解析 → Codex brief → Claude 逐字符复核:全部 6C helper 精确名存在、`monthNumberToRefMonth` 0-indexed(month-1 正确)、18 anchor Count=1 → Codex 实施(剔除未用的 formatChinaPropertyCityCount)→ diff 复核 render 无 weld/resolver 不碰 values)。`macroDrivers.chinaPropertyPrice`:NBS 70 城月度页表格解析(表1新建/表2二手,70 城逐城环比列 >100/=100/<100 计数,齐 70 行否则 fail-closed);discovery `/sj/zxfbhjd/` 首页+index_1..4;freshness publishedAt+45/endOfRefMonth+60;UA 复用 6C。3 wiring(results[19]/[9]/落盘)+ render(renderC6 早退前)+ C6 count 7→8 + validator optional(和=70)+ DATA_CONTRACT 1 行/degraded 10 + DATA_SOURCES implemented + asset bump `stage-10-nbs-70city-1`。commit `d15f3da`(15 files +355/−39),check:all 全绿。边界:指数级计数≠房源级 raw tape,不进 scoring/decision/execution/position/cross-validation。线上 Daily run 待验证(live + 各表计数和=70)。 |
| 2026-05-29 | China Macro Liquidity / Property 可接入性 source-review(docs-only) | Codex 可接入性分析推翻 C6「均不可达」→ 三分类登记:① raw tape(逐机构/逐笔/房源级)仍不可达;② 操作级 OMO(例 2026-05-29 第102号 7天逆回购 1.40% 1230亿)、公告级 MLF(例 2026-05-25 6000亿 1年期)、分项级社融、指数级 NBS 70 城房价 官方公开可达;③ PBOC SLO 仅历史/inactive。最小落点:新 source-review doc + DATA_SOURCES 候选小节(Current Authority 登记)+ INDEX 新「China macro source review scope」(顺带补 CHINA_V2X 注册 gap)+ P3-16 + 本行。边界照 AGENTS audit-only 模板(不进 scoring/decision/execution/position/Action Queue/Trigger Monitor/Invalidation/values/baseline/cross-validation;公告级/指数级 ≠ raw tape;**PBOC SLO ≠ Fed SLOOS**)。候选层命名 China Macro Liquidity / Property Evidence Layer。**无** fetcher/runtime/data/frontend/workflow/asset bump。check:docs + check:project-backlog-format + check:all 全绿。C6 前端 intro 勘误延后 frontend stage。 |
| 2026-05-29 | Stage 8 小批收尾(ISM 深度收缩 tone + C2/C7 去 stale + source-review 勘误) | 路线图清空后 owner 选「以上全做」3 小项。Claude 实证三处皆真缺口/真陈旧(`classifyPmiRegime` PMI<45 真返「深度收缩」、`dxy12wHigh`/`spx52wHigh` Stage 5 已接 render 已覆盖、汇总表 source 已勘误)→ 因无 fetch/source 未知跳过 Codex 实证步,Claude 直接出 brief。改动:render `ismToneFromRegime` +深度收缩→red;index.html 去 C2「1 P2」+ C2 DXY/C7 SPX 静态卡去「P2 待接入」;`CHINA_V2X_SOURCE_REVIEW.md` 加实施后勘误 banner;asset bump。**Codex §E 全局 `rg "P2 待接入"` 检查抓到 brief 漏的 C7 SPX 平行 stale,Codex 停而不擅自加宽 → Claude 复核确认 in-scope 补 B3**(工作流自纠正典范)。commit `1975da9`(13 files +39/−33),check:all 全绿 + `git diff --check` 净 + index.html 零 P2 残留。仅 render+index+doc+版本串文件;无 scoring/decision/数据流/data/realtime 改动。asset bump `stage-8-cleanup-1`。 |
| 2026-05-29 | Stage 7 C5 World Order 暂代占位卡退场(纯静态 HTML) | 6-脆弱批收口后路线图最后一项。退场条件(M-95 接入欧/日/德/欧VIX)已由 Stage V2X 满足 → 删 C5「暂代」overlay 占位卡。Explore agent 穷尽实证零耦合:占位卡(`index.html:333`)纯静态、无 `id`、无 render 绑定(`renderMacroOverview` 只管 c5-stoxx50/nikkei225/dax)、无任何 checker 断言卡结构/count/overlay;`worldOrderStress` 仍服务 C8/hero/WOW/叙事/cross-validation(index.html 5 处保留)。因无 fetch/source/parse 实证未知 → 跳过 Codex 实证步,Claude 直接出 brief + 自验 3 anchor Count=1 → Codex 实施 → diff 复核。改动:删占位卡 + C5 count `1暂代·4live`→`4 live` + intro 改写 + asset bump;仅 `index.html` 本体 + 版本串文件。**无** render/checker/validator/DATA_CONTRACT/worldOrderStress 数据流/M-94 历史文档改动。commit `e489aac`(12 files +33/−33),check:all 全绿 + `git diff --check` 净。卡总数 38→37。asset bump `stage-7-overlay-retire-1`。Stage V2X 同步标线上已验证(见下行更新)。 |
| 2026-05-29 | Stage V2X 欧元区波动率(VSTOXX,boerse 主源 + STOXX fallback)实施 | 6-脆弱批收口。7 步协作全过(outline v1.0 → Codex 实证 DP0 闸门:已知干净源全死,新主源 = boerse-frankfurt quote_box JSON 无 token、fallback = STOXX 官页 HTML → v1.1 锁定 → Codex brief → Claude 逐字符复核 20 改动点 Count=1 + helper(`finiteNumberOrNull`/`isoNow`/`fetchJsonText` 4-arg)+ `validateNullableIsoString` 接受 date-only → Codex 实施 → diff 复核无 weld/resolver 不碰 values)。新增 `macroDrivers.euroVolatility`{value,refDate,changePct};freshness refDate Europe/Berlin ≤5d + fail-closed;plausible [5,100];vixSpread 仅 render 派生(`displayInputsBaseline.vix`,不回写)。5 处 wiring(results[18]+fetchDisplayOnly[8]+落盘)+ render(renderC5 早退前)+ index count/intro + validator optional + DATA_CONTRACT 1 行 + degraded 8→9 + source-review §5 勘误。commit `a92ee96`(15 files +272/−43;app.js 首字节因 PowerShell Set-Content 带 UTF-8 BOM,无害,check:all 全绿)。asset bump `stage-v2x-vstoxx-1`。**线上验证通过**(Daily `e25f001`):euroVolatility=live(boerse,GitHub US runner 可达 api.boerse-frankfurt.de),value=19.2053/refDate=2026-05-29/changePct=−0.0144。**至此 6-脆弱批(6A/6C/V2X)全部收口。** |
| 2026-05-29 | Stage 6C China CPI/PPI + China PMI(NBS primary + TE fallback)实施 | 7 步协作流程全过(outline v1.0→v1.1:Codex 实证复审锁两处必修——NBS 抓**正文**非标题、PMI fallback=`business-confidence` → Codex brief → Claude 逐字符复核 15 改动点 Count=1 + helper 存在性 + `retryFetch` UA option → Codex 实施 → Claude diff 复核:render 无 weld、9 bump 文件纯版本串)。`macroDrivers.chinaInflation`{cpi,ppi} + `chinaPmi`{pmi};NBS 多步(索引+分页 → `LINK_RE` 链接发现 → 抓正文 `htmlToPlainText` → `YOY_RE`/`PMI_RE`)+ TE fallback;CPI/PPI YoY decimal、PMI 点值;freshness 45d(publishedAt/endOfRefMonth)+ fail-closed;cpi/ppi 独立三态;display-only 不进 scoring/decision/baseline/effectiveDisplayInputs/cross-validation。commit `cd42b75`(14 files +497/−43),15 Assert Count=1 + check:all 全绿;asset bump `stage-6c-china-cpi-ppi-pmi-1`。**线上待验证**:Daily run 看 chinaInflation/chinaPmi live(NBS,GitHub US runner 可否抓 stats.gov.cn 正文)或 fallback(TE);PMI 须 ~50.x 官方口径不混 RatingDog。 |
| 2026-05-29 | Stage 6A China 10Y(ChinaBond)+ CFETS RMB(ChinaMoney)实施 | 实测发现 FRED OECD 中国 CPI(停 2025-04)/PPI(停 2022-12)、STOXX txt(2016 死)、Yahoo V2TX.DE(2016 死)均陈旧/死 → 6A 重定为 2 个 fresh 中国官方 JSON 源(China 10Y + CFETS,后者喂 C2+C6)。新增 `macroDrivers.chinaBond`/`cfetsRmb` display-only;选最新行 + freshness guard(7d/14d)+ plausible + fail-closed;fetchJsonText 复用;5 处 wiring(含 fetchDisplayOnlyMacroDrivers + 落盘);validator optional;DATA_CONTRACT 2 行 + degraded 6-block;asset bump `stage-6a-china-bond-cfets-1`。commit `9fe8b1b`,20 Assert Count=1 + check:all 全绿。线上 Daily run(`40e34bf`)验证 chinaBond/cfetsRmb=live(GitHub runner 可达中国站点)。CPI/PPI/PMI/V2X 归「NBS/脆弱批」延后。 |
| 2026-05-29 | Stage 6 难源调研(source-resolution,research-only) | Claude 设计 + Codex 全球搜寻 + Claude 端点交叉核对(实测 200+真实数据):China 10Y(ChinaBond `historyQuery` / ChinaMoney `ClsYldCurvHis` JSON,日频精确)、CFETS RMB(ChinaMoney `RmbIdxHis` JSON,周频精确,同记录含 BIS/SDR)、V2X(STOXX `h_vstoxx.txt` 日CSV)、China PPI(FRED OECD `CHNPIEATI01GYM`)均实测可达。5 卡 + China CPI 共 6 数据点全部找到 ≥2 优质源。owner 确认私用非商业 → ChinaMoney/ChinaBond JSON 低频+缓存可自动抓。交付 `docs/CHINA_V2X_SOURCE_REVIEW.md`(逐源对比 + 抓取指引 + 6A/6B/6C 实施分层)。无代码改动。 |
| 2026-05-29 | Stage 5 历史窗口字段(HY WoW / DXY 12w / Private Credit 6-proxy z / SPX 52w) | 新增顶层 display-only `historyWindowFields`;appendHistoryFull 每日 entry 追加 `spx`(真实 realtime.values.spx,缺失 null,不用 deriveRisk 的 5100 default)+ `privateCredit6` compact snapshot(BIZD/PBDC/SRLN/CCLFX/HY OAS/IG OAS,**不含 CDX**);`buildHistoryWindowFields` 在 appendHistoryFull 后用更新后的 full history 计算(N-1 z、stddev=0→0、不足→null);4 卡 render leaf-only 接线,partial 不上强 tone;validator optional;asset bump → `stage-5-history-window-1`。commit `4598e8a`,`check:all` 全绿。线上 Daily run(`edd214a`)验证四字段 windowStatus 符合预期。SPX/PrivCredit 从 0 累积,~364/84 天后自动 ready。 |
| 2026-05-29 | P2-13b Worker FRED 抓取迁官方 API(选项 3) | Cloudflare Worker 主 preview 的 FRED 抓取改 API-first(`maxAttempts:1`)+ CSV-fallback;`env.FRED_API_KEY` 沿链下传(index.js:694 + builder/fetchAllFredSeries/fetchFredSeries);新增 `latestTwoFredApiValues`/`buildFredApiUrl`/`fredApiFallbackFields`;`fetchTextWithDiagnostics` 加 `maxAttempts`(默认 2 不变);fallback 仅追加 `fredApi*` 诊断,不污染 sourceStatus。commit `d3adf69`,两 `node --check` + `check:workflows`/`check:modules`/`check:all` 全绿。Cloudflare secret 已配 + `wrangler deploy`(version `477574de`)。**线上验证**:CSV 端点仍宕时 worker preview `health=100/live/criticalMissing=0` → 前端主源恢复。至此 FRED-API 迁移三链路(Node daily/realtime + Worker)全完成。 |
| 2026-05-29 | P2-13 FRED 抓取迁官方 API(韧性加固) | `run-realtime.mjs` + `run-daily-pipeline.mjs` 的 FRED 抓取改 API-first + CSV-fallback;新增 `parseFredApiObservations`/`buildFredApiUrl`,API 单次尝试失败即回落现有 CSV(零回归);两个 build workflow env 注入 `FRED_API_KEY: ${{ secrets.FRED_API_KEY }}`;source 标签/validator/前端/Worker 不动。commit `d44c4f1`,`check:all` 全绿。`FRED_API_KEY` secret 已配。**线上验证通过(同日)**:官方 API 已恢复(快速 400)而 CSV 端点仍超时;手动触发两 workflow → realtime `health=100/live`、Daily `degradedMode=false` + `inflationEnergy` cpi/wti `live` + `fedLiquidity` 实值,全经官方 API。整条数据管线(realtime/Daily/前端 fallback)靠 P2-13 从 FRED CSV 故障中自救恢复;仅 Worker(选项 3)仍走 CSV。 |
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

---

<a id="instruction-maintenance-2026-09-07"></a>

## 指令维护过程与发布前交接（归档于 2026-09-07）

以下原文为 PR #304 合并前快照；已完成状态见[总回执](REVIEW_2026-09-06_CLOSEOUT.md#accepted-pr304)。

### 2026-09-06 指令与技能维护

- **当前 acceptance baseline**：owner 已明确采纳 Git 分级授权（ADR-0026）；本地常规 Git 可自主执行，远端/集成按任务授权，破坏性操作仍具体确认。保留必要验证与人工 contract review、付费/发布/source-rights 保障。
- **当前实现**：领域 checker 解耦、普通文档轻量分流、个人维护源和只读升级检测已落地；neat-freak 保留精简定制版，选择吸收上游 v3 触发边界。全量 Markdown 复核和剩余瘦身建议见 [最终复核](REVIEW_2026-09-06_MARKDOWN_FINAL.md)。不改既有无关 .agents/ 与 skills-lock.json。
- 前三轮执行证据保留在 [初轮](REVIEW_2026-09-06_INSTRUCTIONS.md)、[第二轮](REVIEW_2026-09-06_INSTRUCTIONS_PHASE2.md)、[第三轮](REVIEW_2026-09-06_INSTRUCTIONS_PHASE3.md)。其中旧 Git 手动要求/未启用轻量检查是当时状态，现行规则见根 AGENTS 与 ADR-0025/0026。
- **本次文档整理 acceptance baseline**：owner 授权合并 Market Pricing / External AI 重复状态、原文归档历史交接；字体/颜色例外先按 [ADR-0027](ADR/0027-design-document-consistency.md) 限定为 token 定义和现有单条 #999 边框，再修正文档。未批准其它视觉漂移；当前进度见 [整理回执](REVIEW_2026-09-06_DOC_CONSOLIDATION.md)。

- **ODP/Energy 后续整理 acceptance baseline**：owner 于本轮授权执行前轮建议；将 P3-19/P3-19a 实施历史原文迁出，保留当前授权、待办、回测预登记入口及既有 checker 标题依赖，不改 runtime/checker/审批门槛。结果见 [领域条目整理回执](REVIEW_2026-09-06_ENERGY_BACKLOG.md)。

- **标题/schema 依赖迁移 acceptance baseline**：owner 授权继续处理剩余依赖；按 [ADR-0028](ADR/0028-energy-record-assertion-location.md) 将 68 个校验器的历史记录读取目标迁至原文归档，76 项标识及全部断言保留，删除 backlog 兼容索引。独立 checker 合并审阅保留，记录不扩大权限；见 [迁移回执](REVIEW_2026-09-06_ENERGY_ASSERTIONS.md)。

- **本轮收尾 acceptance baseline**：owner 授权继续精简并 commit+push 本系列全部已完成的仓库改动。维护状态去快照计数、完成事项与旧 Open 条目原文归档；领域入口澄清阶段、删除空 ignore list 的解释负担，实际 ignore 理由与独立审阅保留。工作推送到独立任务分支，合并前人工 review 不被替代；见 [总回执](REVIEW_2026-09-06_CLOSEOUT.md)。

- **工作基线(2026-09-07)**: 本系列实现 `023500d9` 纳入 main `2a54303f` 后组合验收；最终主线 SHA 与 Pages 结果以 [PR #304](https://github.com/ctmaomao/gfrr-auto-update-site/pull/304) 交付记录为准。
- **当前任务状态(2026-09-07)**: 指令精简、验证分流、历史归档、授权 AI 审核与 Hook 实际启动验收已完成；owner 另行明确授权最新 main 验收、合并 PR 及其自动 Pages 发布，见[总回执](REVIEW_2026-09-06_CLOSEOUT.md)。
- **下一步建议(2026-09-07)**: 本次收尾按 PR/Actions 实际结果核对；不因旧“未授权合并”或 Hook 首次信任快照再次暂停。不扩展到新功能、数据生成、付费调用或额外 EdgeOne 发布。
- **阻塞或等待(2026-09-07)**: 前次 BoA/EdgeOne/来源授权观察项仍有效，本轮不替代其验证或制造成本授权。

<a id="instruction-closeout-pr304"></a>

## PR #304 交付过程原文


Owner 已授权完成建议并 commit+push。本系列仓库交付包含 AGENTS/CLAUDE 精简、领域规则承接、校验器文档读取解耦、按变更验证、设计例外、重复状态合并及 backlog 历史归档。此前各阶段回执是当时快照，其中“未 commit/push”不代表本轮最终交付状态。

## 本轮整理

维护状态只保留版本依据、前端/Worker/Daily 职责与现行契约入口，不手抄检查数量或旧健康快照。Completed 表、P3-17/18/20 和旧维护状态原文存入 [PROJECT_COMPLETED_HISTORY](PROJECT_COMPLETED_HISTORY.md)；原章节入口与当前待办保留。

领域附件纠正旧 v28.0J “当前基线”描述，增加 Transport 手工条目的按需导航，原领域规则正文保留。AGENTS 删除“空 ignore list 也解释为何为空”的形式要求；实际 ignore 的理由、边界、解锁路径和人工合并审阅仍保留。此修改不增加操作权限。

## 验证与交付

- `npm run check:changed`：exit 0；本系列含治理/校验器变更，自动选择完整 `check:all`，全部通过。
- `npm run check:docs`：exit 0；36 个指令/历史读取与验证分流测试通过，198 个 Markdown 文件的链接/锚点问题为 0。
- 本轮原文保全核对：exit 0；5 个归档块逐字保留，其余 8 个 Open 条目不变，领域附件 158 条列表行不变，862 个基线文件核对未发现范围外修改。Backlog 从 104,554 降至 43,402 字节。
- `git diff --check`：exit 0。Git SHA/远端核对结果在交付回复给出，提交和推送不代替独立人工合并审阅。

使用独立任务分支 `codex/instruction-docs-maintenance`，从 fetch 时的最新 origin/main 建立；只提交本系列仓库文件，不混入用户原有 `.agents/`、`skills-lock.json` 或 ignored 手工产物。独立人工 checker/治理 review 完成前不合并 main。分支 push 不是生产部署。

个人全局 AGENTS、技能与维护源位于仓库外，保留在现有个人维护来源，不复制到项目公开远端。`manage.py status --installed` exit 0，pending writes / conflicts / upstream review 均为 0；维护工具的 12 个单元测试通过（exit 0）。Hook 后续实证见下节。

## 后续评审与 Hook 验收

本系列实现为 `e268bef6`，评审准备为 `9158babb`，均已 push 并核对远端。Owner 随后明确授权：“我授权你帮我实际操作审核执行上述两项”。据此，由 AI 执行本次 PR #304 的审核与指定 Hook 信任/启动验收；这是仅针对这两项的执行人例外，不宣称独立人工签字，不扩展一般审核、其他 Hook 或合并/部署权限。

- **审核完成，未发现阻断项**：[PR #304](https://github.com/ctmaomao/gfrr-auto-update-site/pull/304) 的 ADR-0024 至 0028、权限和设计例外、文档分流、负向测试及范围已复核。73 个领域校验器反向替换后与 `ea1fecea` 完全相同，断言/阈值未变；check-workflows 的来源切换及根 serial trunk 检查单独核对。没有生产数据、运行时、前端、workflow 或依赖锁文件改动。轻量判定是保守启发式、链接解析不是完整 CommonMark，这些既有局限保留。
- **信任操作完成**：在 Codex CLI `0.153.0` 原生审阅界面核对并信任唯一用户 SessionStart 命令。原生 hooks/list 复查为 enabled/trusted、异步、startup/resume、8 秒超时，无 warnings/errors；hash 保持 `sha256:94e4c828c2ba141e5807c83db488f1982fe42f7901b43749324a45216d47078d`。未直接编辑信任存储或使用 bypass 参数。
- **真实启动执行通过**：原生 App Server 新建会话及最小首轮对话触发已安装脚本。会话 `01a07633-e994-7c41-a566-270bb4d31634` 的运行时 trace 记录 SessionStart/user/async 于 `2026-09-06T10:11:52.008374Z` 开始、`10:11:52.748339Z` 以 command_outcome=completed 结束。初期探针因未收到 hook/completed 通知而失败；后改为核对原生 command_runner trace，验证 exit 0。此证据来自生命周期执行，不是直接调用 handler。会话为 ephemeral、read-only，模型只返回固定 smoke 标识；未调用项目工具。
- `9158babb` 的 [PR CI run 34017717539](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34017717539) 已成功，涵盖依赖审计、单元测试覆盖、完整检查和 Chromium smoke；后续验收记录提交按其最终 CI 状态另行报告。

[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)规定按当前定义审阅/信任及 SessionStart 生命周期。此次两项按明确授权完成；未来 Hook 定义改变仍需按平台要求重新审阅。原始 trace 留在本机，不上传个人会话日志；本次证据摘要存于个人维护来源的 activation-verification.json。

2026-09-07 owner 进一步明确要求执行“最新 main 验收 → 合并 PR → 核对自动 Pages 发布”的收尾顺序，本次合并及其触发的 Pages 发布已获授权。先纳入 main `2a54303f` 的 6 次数据更新，仅 3 个 JSON 与其原文一致，保留用户未跟踪文件；在组合状态上运行完整检查和 PR CI，通过后合并。此次不触发额外 Daily/provider/EdgeOne 发布；最终合并 SHA、验证及 Pages run 结果记录在 [PR #304](https://github.com/ctmaomao/gfrr-auto-update-site/pull/304) 的交付记录中，不据早期“未合并”快照恢复审批等待。


<a id="handoff-2026-09-18-health"></a>

## 2026-09-18 health remediation: preserved backlog snapshot

The following is the complete pre-simplification text from main f7c5d015. Dated current/next claims are historical; current state and continuing boundaries are in PROJECT_BACKLOG.md. No historical approval or spent budget is renewed by this archive.

# Project Backlog · GFRR Auto-Update Site

### 2026-09-18 整体健康整改

- **Acceptance baseline**：owner 要求先核实 Node、Macro 最终复验、请求保护和开发依赖四项旧问题，再按顺序实施整体体检建议；沿用逐项 commit/push、独立 AI 有界审阅及合并授权。具体范围、旧问题实测及待验边界见[执行清单](HEALTH_REMEDIATION_2026_09_18.md)。
- **当前步骤**：搜索额度隔离 #403 已审阅合并，CI 35305671956 通过；开始 Pages 最新 main 发布基线修复。保留三小时 EdgeOne 批次和额度保护，不新增付费调用。

### 2026-09-18 Pages 检查依赖修复

- **Acceptance baseline**：owner 明确批准处理 Pages 部署阻塞，并另行固定压力模型最终评审标准。本步骤只补齐 Pages 检查环境；不修改 ACLED 源、生产配置或评分模型，不放宽原测试。
- **原因与修复**：失败 run 35277708546 / 35278373302 在三个 ACLED 私有校验测试停止，发生在 PR #389 合并前后；Pages 未安装开发依赖，PR CI 则有 `npm ci`。补充 `npm ci --include=dev --ignore-scripts`，保持 lockfile 和依赖版本不变。
- **验证**：新增缺失依赖回归，验证在 sanitizer 启动前 fail closed、清理本次私有目录且不交出候选。私有校验专项 5/5、`check:changed` 触发的完整 `check:all` 和 `git diff --check` 均退出 0；没有删改原断言。远端 CI/部署以本轮回执为准。
- **后续**：PR #392 已按 owner 审阅合并授权集成为 `28fae034`，远端完整 CI/浏览器检查通过；实际 Pages 验收 run 35281738967 的依赖安装、完整检查及部署均成功，线上页面 HTTP 200。评分评审清单另行交付，不把部署通过当作模型验证通过。

### 2026-09-18 压力模型最终评审标准

- **Acceptance baseline**：owner 明确批准固定最终评审标准，避免到观察期结束后根据结果临时选择指标或赢家。本步骤将既有协议落实为[人工评审清单](PRESSURE_MODEL_FINAL_REVIEW_STANDARD.md)，不更改七候选、阈值、源、模型指纹、收集门槛或自动化频率。
- **固定口径**：两个参考分别报告；主指标沿用 `(2×FN+FP)/N`，同样本两参考均不变差、至少一个改善且漏报不增加才进入描述性候选筛选；完整审阅持续误报/漏报、报警切换、输入/校准拆解及 HY 原始/代理切片，不把筛选通过当成显著优势或迁移批准。
- **证据限制**：84 日/40 输入/12 基准周是最低收集要求。现有相关性区间不足 26 配对观察不输出，且不是配对错误差显著性；少压力事件、参考冲突、版本缺口等仍可要求继续观察。结论固定为证据不足、尚未显示一致改善、有条件进入独立模型评审三类。
- **验证/下一步**：`check:changed` 触发完整 `check:all`、文档链接、`git diff --check` 和冻结指纹/84-40-12 门槛核对均退出 0；第 7–14 天为运行复盘，最早收集时间门槛为 2026-12-10 UTC，不承诺届时替换。Pages 依赖修复 PR #392 已合并；owner 明确要求审阅合并本清单，基于该 latest main 串行集成，保留同期 ACLED 交接内容。

### 2026-09-18 压力研究三项后续验收

- **Acceptance baseline**：owner 明确“123 都做”：验收修正后的远端批次、逐次解释参考指标偏离、持续拆解输入与校准变化。冻结七候选、生产公式、阈值及模型指纹；独立后处理不重置累计，不增加数据源或付费调用。
- **远端事实**：PR #386 Pages 部署成功；影子 run 35275075824 建立新 cohort，35275232188 恢复并去重，两份 ledger 逐字节相同，仍是一条真实 UTC 日期记录。没有拼接旧批次或把同日重复记成两天。
- **分析/实现**：359 周全部偏离清单及连续时段与原报告对账；新增原始 HY/BAA10Y 代理分组，207 周使用代理且包含大多数正压力周，不能用总指标声称替代模型优胜。新离线诊断输出双顺序变化分解、源年龄、缺分与日期间隔；独立 artifact 在有效 ledger 上传后生成。
- **验证与限制**：新增 7 项专项、保存快照的 359 周全量复算、`check:changed` 触发完整 `check:all` 及 `git diff --check` 均退出 0；最终诊断专项再次通过。见[验收与分析报告](PRESSURE_EVIDENCE_ACCEPTANCE_2026_09_18.md)。原模型指纹保持 `d3723b…001b`，当前无第二个真实日期可分解；新增 workflow 后处理上线及远端 CI 回执以本轮 PR 为准，不声称已满足生产替换门槛。

### 2026-09-17 今日总判断评分整改复验

- **Acceptance baseline**：owner 明确批准按本轮建议实施及必要授权；先纠正回测单位，再验证连续性、输入重复与 ON RRP 解释，并更新同样本比较。沿用 ADR-0044/0047 的 84 日、40 输入、12 基准周和独立模型评审，不以降分作为通过标准。
- **实施与证据**：历史 Brent 日变动改为与生产一致的四位小数绝对差；缺失/过期前值和场景来源可追溯。为既有七个冻结候选增加逐项重放和固定参数响应诊断，缺项不补分。一次 15 源免费复验全部成功，359 个共同周有 29 周旧模型分数受修复影响，最大 6 分；七候选当前约 54.56–60.91，不能当作生产 71 分的同口径替代。
- **验证/集成**：86 项相关测试、`check:changed` 触发的完整 `check:all`、`git diff --check` 均退出 0。提交前发现 ACLED PR #385 已更新主分支，保留双方内容并基于最新 main 复核；独立审阅和远端回执以本轮 PR 为准。没有修改生产公式、阈值、仓位或生产数据。详见 [ADR-0053](ADR/0053-pressure-score-remediation.md) 和 [整改报告](PRESSURE_SCORE_REMEDIATION_2026_09_17.md)。
- **后续门槛**：旧影子批次保留；实现指纹变更后自然运行建立新批次。本地新批次仅一条实际记录，0 日/1 输入/0 基准周；不声称满足生产迁移条件。

### 2026-09-16 GDELT Cloud 访问政策与试用评估

- **Acceptance baseline**：owner 批准按邮件评估建议逐步执行账户期限核验、有限免费试用对照、必要修正和验证；不因笼统授权购买未确定的持续订阅，不将新源直接晋升生产评分。
- **发现与修正**：官网已区分免费网页额度和后台 API 权限；删除旧每月 100 次免费描述，Cloud 403 不再冒充限流，401/402/403 提供对应账户排查提示。旧数据保留其原日期、低置信度与单次请求规则。
- **验证**：新增模拟 401/402/403/429 的零真实请求回归，检查旧摘要保留、日期不变、单次请求、凭据/正文不泄漏；纳入现有 Cloud 检查入口。`check:changed` 执行完整 `check:all` exit 0；最终 Cloud 专项复验、文档链接与 `git diff --check` exit 0。2026-09-17 基于 latest main 的完整 `check:changed` / `check:all` 再次 exit 0，独立 AI reviewer 审阅通过、无阻断项；账户实测完成，远端 CI 与集成以本次 PR 回执为准。
- **2026-09-17 实测完成**：账户显示试用至 9 月 23 日 16:38（页面时区未独立核实），API 权限有效、无付费订阅、自动充值关闭。4 次普通读取全部成功，用量 15→19 QU、赠额 999→995 QU、付费超额 0；未使用剩余 8 次预算。发现事件关联混杂、同源转载与日期推断限制；两个 Situation 均未返回现成周评。保留人工发现线索用途，不新增生产源/评分或订阅。详见 [访问与样本评估](GDELT_CLOUD_ACCESS_REVIEW.md)。

### 2026-09-16 Bubble AI 周内补检与刷新原因

- Owner acceptance baseline：增加一次周内补检、展示明确跳过原因、Bubble AI 更新直接触发自定义域名同步。周三 05:45 UTC 仅补检本期已证实零调用的新闻不足；每周最多一个持久预留，排队后复验，付费失败不重试。
- 设计审阅要求：检查全周运行、先预留再派发、消费前再次取得共享 writer 锁并复核期次/调用历史；已纳入实现。ADR-0050 / issue #369 记录追加只读状态 JSON 的 DESIGN §4.4 窄例外。
- 自动化/契约 PR #370 已独立审阅并合并（f025ca86），远端 check-all 通过；独立展示 PR 从该 latest main 开始。新增 6 项单元、9 项相关浏览器测试及 check:changed 全套通过；状态格式错误不能清空主页面。
- 旧六段展示仍在独立本地分支，本轮不混入。无本轮额外付费调用；状态-only 生产验收 run 35059831745 成功，published / status_only / reservations={}，未派发新 AI。现有 AI 输入、单次调用、引用/质量/新鲜度闸均保留。

Persistent project self-memory for open work, current status, and maintenance rules. Milestone history lives in [MILESTONE_INDEX.md](MILESTONE_INDEX.md); this file keeps only the actionable backlog and compact recent context.

---

## Section 1 · 维护状态

### 2026-09-18 ACLED 周/月分频自动更新

- **Acceptance baseline**：owner 已明确“同意，请实施”：北京时间周一/三/五08:30，周一周+月26请求，周三/五仅周14+14，每周上限54；每请求15秒、零重试/跳转，无变化不发布、失败保留旧数据。沿用独立AI审阅及commit/push/合并权限，不新增即时验收或initial预算。
- **策略/实现**：[ADR-0056](ADR/0056-acled-split-cadence.md)策略 PR #401 经独立AI审阅、完整本地检查与CI 35299316908通过后合并为73d81d51。后续独立实现接入精确cron+UTC日选择、仅周六文件模式和三日claim；周一沿用旧键，缺少schedule值或错日均停止。周模式月配置原始字节、日期和来源原样保留，仍运行双配置严格校验；旧提醒/API/HAPI/已耗initial不变。
- **验证/下一步**：离线回归覆盖14请求无月URL、默认12文件不放宽、真实合成XLSX六区域标准化、原月字节贯穿CAS载荷、重复claim、无变化/失败不发布、旧月严格校验阻断。实现的完整检查、独立审阅、CI和远端dry-run以本轮PR回执为准；本轮不请求真实ACLED，不把dry-run当作实际周内取数验收，合并后等待自然计划槽。
- **独立审阅修复**：既有刷新receipt要求两配置auto来源。周内若月配置被合法手工导入替换，提前以`monthly_baseline_receipt_hold`停止（claim/登录前零请求），不篡改provenance、不先提交后失败；周一完整采集可重新建立合格auto配对。当前生产两配置均auto，不受此边界影响；不放宽receipt/checker。
- **前次已完成回执**：PR #400 已合并；无下载恢复35292372786、Pages35292641799、EdgeOne35292612778成功，双站与ff711c00完全一致（周09-05/月09-11）；[最终验收](https://github.com/ctmaomao/gfrr-auto-update-site/pull/400#issuecomment-5723348751)结束下列旧交接中的Pages待验状态。

### 2026-09-18 ACLED 自动更新整链接入

- **真实回执/当前任务**：首次 35290763672 已完成 26 请求/12文件/退出与清理，永久 initial 现已耗用；双配置 `25619ed5`（周 09-05/月 09-11、均自动 provenance），自动刷新 35290886868 严格投影/完整检查通过并推送 `4d589e98`，派发 EdgeOne 35291164534。Pages 完成窗口未出现下游 run；API run name 为新动态标题而非既有监听名称。恢复固定名称作为最小兼容修复，仍需 source-free refresh 实证，不先断言平台因果。
- **下一步/边界**：沿用 owner 自动上线与恢复授权，独立审阅/CI后用原双哈希及配置提交触发无 ACLED 请求的刷新，核对 Pages/EdgeOne 与线上摘要。保留原 listener、不增加重复 Pages dispatch、不修改已耗 claim；精确回执与恢复说明见[自动更新运行说明](ACLED_AUTOMATIC_UPDATE.md)。
- **已验收站点**：EdgeOne 35291164534 成功，自定义域名 HTTP 200 且 world-order JSON 与 `4d589e98` 逐字节一致（周 09-05/月 09-11）；Pages 仍是旧 09-04/08-21，不能宣称双站完成。

- **首次上线验收修复**：PR #398 已合并 `2b3dfc0b`，最终 CI 35289012332/独立 AI 审阅通过。初次派发 35289495733 在 preflight 停止，GitHub/ACLED 请求均为 0，initial claim 只读查询不存在；官方 checkout origin 没有 `.git` 后缀，与三处身份检查不兼容。独立修复仅接受固定同仓 HTTPS 的带/不带 `.git` 两种精确拼写，补整链与错误地址拒绝测试，不改变 workflow、预算、源/发布门槛；通过审阅和检查后使用尚未领取的首次预算，不重跑旧 run。
- **刷新验收修复**：只读核对真实 builder 发现 published source 仅含 enabled/status/lastFetchedAt/summary，旧 verifier 却与 fetcher 内部八字段对象比较，必然误报。先按实际四字段契约投影 expected，再保留完整精确比较；测试直接执行现有 producer 的纯投影表达式，并验证完整 summary、日期、意外字段与 null/zero 不被放过。不改生产输出或模型。

- **Acceptance baseline**：沿用已明确批准的首次及每周26请求预算、受保护发布及独立AI审阅合并。策略 PR #397 已合并 43f2e571，CI 35286780031 全部通过；本实现不改精确 workflow fixture、预算、旧提醒或评分契约。
- **实施**：main首attempt校验、持久claim先于登录、既有12文件采集/退出/私有标准化清理、自动provenance、配对CAS发布；返回精确刷新run ID。World Order以提交/双哈希核对输入，校验完整ACLED投影后提交，再派发EdgeOne；Pages沿用完成事件。CLI dry-run零I/O不等同整workflow零网络。
- **最小正确性修复**：独立审阅确认比较器旧日期条件与 sanitizer 相反；修正为各区域结束日期不晚于 latestWeek，且区域最大值恰等于 latestWeek，允许真实地区滞后、拒绝伪造偏早/偏晚最大周。原严格内容、新鲜度与共同窗口校验不改。
- **验证/验收**：合成整链、真实本地Git严格准备、重复claim、丢失响应、退出/清理失败、未知发布/派发、来源及零值保护均纳入测试。完整检查及独立审阅/远端CI后仅执行本次initial；实际结果另记。不将配置提交或派发成功当作网站验收。详见[运行与恢复](ACLED_AUTOMATIC_UPDATE.md)。

### 2026-09-18 ACLED 首次及周一持续自动化批准

- **Acceptance baseline**：owner 明确回复“批准首次验收及每周自动运行”；新首次批次及每周一各最多 26 个免费请求、15秒/请求、零重试/跳转，临时私有原件、失败保留旧数据，沿用逐项提交推送/独立AI审阅合并及自动上线授权。旧 run 35277723078 仍已耗，不重跑。
- **政策**：[ADR-0055](ADR/0055-acled-weekly-automation.md)及精确 workflow fixture 先独立评审；持久 initial/UTC 周 claim 先于登录，默认手工 dry-run，来源字段显式区分自动处理。用户执行授权不冒充官方自动访问许可，保留 EULA 风险说明。
- **验证/后续**：本 policy 阶段不增加实际 workflow 或执行请求。后续接入下载/校验/原子发布、明确刷新衔接及 Pages/EdgeOne 读回；本地/远端检查和独立审阅以对应 PR 回执为准。前一步 PR #396 已合并 4d1756e7，完整 CI 35284695771 通过。

### 2026-09-18 ACLED 远端配对提交

- **Acceptance baseline**：owner 要求本步后连续推进直至自动上线，沿用逐项提交推送、独立 AI 审阅及合并授权。实施远端原子提交组件；新首次下载与每周运行预算已另行明确询问，未回复前不执行真实 ACLED 请求。
- **实施**：默认不执行；执行与来源使用两项明确 caller 授权、固定 repo/main、远端父提交核对后运行已审本地双配置准备。GitHub expectedHeadOid 原子追加恰好两份配置，不强推；校验单父提交与完整树，不能把 GitHub 作者导致的 commit hash 差异误判为内容变化。最多 2 次 GitHub 请求、64KiB 响应/3MiB 请求、15秒/次、零重试。写入可能已发生后的所有异常返回 publication_unknown，不伪称未发布。
- **验证/下一步**：7 项回归含真实 prepare 配合模拟远端树回执、冲突/校验失败、错误/超限/15秒超时、异步输入变化、脱敏与不重试；完整检查及独立审阅/CI 以本 PR 回执为准。无 CLI/workflow/真实发布；[远端发布说明](ACLED_PAIR_REMOTE_PUBLICATION.md)记录后续独立调度 policy、下载预算、刷新与部署验收要求。

### 2026-09-18 ACLED 锁内复核与双配置待发布提交

- **Acceptance baseline**：owner 要求接续 PR #393 的下一步，沿用独立 AI 审阅、提交推送及合并授权。本步实现本地候选提交准备，不将其混同生产写入或恢复已耗下载预算。
- **实施**：复用 common-dir 发布锁，锁内核对 HEAD/本地 origin/main/干净工作区与真实索引指纹；重读双基线并检查已审候选字节哈希。固定父提交的完整 checker 扫描面快照中运行原 strict 周/月 checker；私有 index 继承完整父树、一次装入双配置、验证允许路径和精确 blob 后生成 commit 对象，不更新 ref/push/dispatch。清理失败撤销交付结果，不删除悬空对象或别人的改动。
- **验证/下一步**：真实临时 Git 仓库回归覆盖成功、单轨变化、无变化、pins 不符、第二轨失败、锁竞争、环境覆盖、期间提交/暂存和清理失败。完整检查、独立审阅与 CI 以本 PR 回执为准。详见[提交准备边界](ACLED_PAIR_COMMIT_PREPARATION.md)。仍需生产 writer 的远端父提交复核、来源/发布门槛、非强推及刷新/部署验收；本地 tracking ref 不等于远端最新。

### 2026-09-18 ACLED 周/月候选修订比较

- **Acceptance baseline**：owner 要求开始受保护发布的下一步，沿用逐项提交、推送、独立 AI 审阅及合并授权。本步只做离线整对候选比较，不复用已耗下载预算、不启用调度或生产写入。
- **实施**：有界 stdin 接口接收两份基线及两份候选 JSON 原文；忽略项仅 preparedAt，键序标准化但数组序保留。区分未变、日期推进、同日修订、日期倒退；返回精确基线字节哈希并支持重读后的 pin 比较，失配 hold。报告只含固定字段与摘要，不输出原件行或国家名称。所有结果 productionEligible=false，哈希比较不冒充锁或原子发布。
- **本地实测**：十二份既有原件经隔离 sanitizer 后比较成功；周日期 09-04→09-05，仅 latestWeek/filesIngested/quality 变化，统计和行数未变；本地月表 08-21 与当前配置语义一致。12 原件与 2 配置共 14 文件哈希前后一致，临时原件清理确认。此处清单 URL 为离线身份用合成值，不证明新下载或云端 09-11 月表再次到站。
- **验证/下一步**：专项覆盖原件不变、空缺/重复身份、日历/数值/大小、两种变化、字节级并发差异、脱敏和 stdin 超时；完整检查及独立审阅/CI 以本 PR 回执为准。详见 [候选比较接口与发布边界](ACLED_CONFIG_PAIR_REVIEW.md)。后续 writer 仍需共享锁内重读、现行 validators、双配置共同提交及来源/发布门槛。

### 2026-09-18 ACLED 整批验收回执与周日期修复

- **Acceptance baseline**：沿用 owner 连续实施、独立 AI 审阅和集成授权；修复本次验收暴露的本地/云端日期差异，不重跑已耗用的一次下载，不直接修改生产配置。
- **真实验收**：实现 PR #390 已合并 `3a199489`；唯一 run [35277723078](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/35277723078) 成功，26 请求、十二文件全部 HTTP 200、登录/退出确认。周表 6 文件/991218 行/2026-09-05，月表 6 文件/43588 行/2026-09-11；`validated_not_published`、临时原件清理确认、生产未写入。预算已耗用，不重复派发。
- **修复证据**：现有欧洲周原件 XML 最大日期序号 46270 对应 2026-09-05；旧 `cellDates:true` 将本地零点转 UTC，在 Auckland 退到 09-04。保留 Excel 数值日期走既有显式 UTC 转换；真实解析器合成 OOXML 在 UTC/Auckland/Los Angeles 同日，旧选项负对照复现退一天。原件和生产配置不改写。
- **验证/边界**：多时区回归纳入两个周度检查入口；完整检查、独立审阅及 CI 以本次 PR 回执为准。当前生产日期不因验收自动更新；后续仍需候选修订比较、并发基线保护、持续来源与发布验收，不能称为全自动上线完成。

### 2026-09-18 ACLED 云端整批一次验收

- **实现进展**：policy PR #388已合并3776a0fe；独立实现接入精确workflow、默认dry-run且限定GitHub main/首次attempt/正确仓库与路径的CLI，成功只输出两类日期、行数和忽略preparedAt的候选摘要。不会保存候选配置、原件artifact或发布生产。
- **实施验收**：5项入口/编排回归通过，完整检查及独立审阅/CI后只派发一个真实run；后续实际run ID和结果记录在实现PR回执，不把首次attempt当作全局once保证。

- **Acceptance baseline**：owner在明确26请求预算提案后要求开始下一步；本轮落实单次GitHub登录/12详情/12文件/退出及私有校验，零重试/跳转，HTML12MiB、周文件64MiB/月文件2MiB、控制128KiB，15秒每请求，不发布。
- **policy阶段记录**：[ADR-0054](ADR/0054-acled-private-batch-acceptance.md)独立policy PR限定精确新workflow摘要；既有例外、源权利和已耗预算不变。该PR仅fixture及政策，无执行入口；当前入口进展见上文实现记录。
- **验收**：规则回归、完整检查、独立AI审阅及CI通过后再交实现PR。完成后只派发一个新run，记录唯一ID；失败或结果不明不重复派发。
- **限制**：不调度、不上传原件、不改生产。真实新文件内容与持续来源/发布仍不能由本policy通过推断。

### 2026-09-17 ACLED 十二详情页一次发现实现

- **Acceptance baseline**：沿用紧邻批准的14请求一次验收，policy PR #383已独立审阅并合并fc8fb943。当前独立实现PR不改已审定workflow摘要，不增加下载、重试、正文保存或生产发布权限。
- **实施**：固定十二个已观察页面；复用安全Cookie与完整响应超时读取器，控制响应仍64KiB，新HTML模式1MiB且读取正文前拒绝非HTML。登录身份/令牌确认后串行GET，任一失败停止并退出；仅204空响应确认退出，失败保留sessionMayRemain。页面静态链接须精确同源、正确身份且唯一，完整十二链接再通过已有manifest同月度版本校验；不执行JS或跟随文件。
- **验证/执行**：15项新旧专项通过，CLI默认dry-run并限定GitHub main/首次attempt/精确workflow；配置和原件不变。完整检查与独立审阅通过后才集成，再执行唯一真实run。首次attempt不是全局once，真实run ID需作为不可复用的执行回执记录；截至本段准备时尚未派发。
- **下一步/限制**：输出只含状态/字节/身份和完全通过后的静态链接元数据；完整HTML、账号、Cookie/令牌不保存或打印。发现链接不证明文件有效、最新、持续源权利或可上线；后续XLSX批量获取/私有暂存/修订/发布仍未实现，旧预算不恢复。

### 2026-09-17 ACLED 认证批次与私有标准化

- **Acceptance baseline**：owner要求连续完成十二文件全自动目标，沿用逐项提交、推送、独立AI审阅和合并授权。本步骤实现单会话采集与私有标准化，不复用旧已耗预算、不启用定时或生产发布；本阶段提出的26请求预算后由09-18继续指令推进，当前状态见上文一次验收记录。
- **实施**：注入transport的单次登录→12详情→12文件→退出，只有整批成功且退出确认才释放buffers；旧诊断入口不变。私有验证器创建唯一临时目录，复制七个现行标准化模块并链接锁定xlsx依赖，在隔离输入/输出运行两种sanitizer；子进程不继承凭证、日志不外传、限时120秒/类。失败不交出候选，清理仅本次目录，清理失败明确报告并撤销候选。
- **验证/证据**：7项合成会话/暂存测试通过，包括第二类失败及清理失败撤销候选。十二份现有原件零网络预演通过，两种候选配置可生成，12原件及2生产配置共14个SHA256前后相同，临时原件清理确认。合成URL仅供离线身份匹配，不代表新下载或来源证明。完整检查/独立审阅/集成以PR回执为准。
- **下一步/门槛**：云端精确workflow policy须独立PR；真实26请求、持续来源权利、生产修订/并发基线保护和发布验收尚未完成，不将本地旧文件成功等同于新版到站。

### 2026-09-17 ACLED 十二文件批量读取核心

- **Acceptance baseline**：owner要求继续十二文件下载、内容校验和保护发布。本轮先交独立传输核心及离线回归，不扩大已耗认证预算，不启用workflow、定时或生产写入。当前主工作区有其它评分任务改动，本任务使用隔离worktree。
- **实施**：完整清单先验，十二请求串行、每请求最多15秒、零重试/跳转；周表16MiB单件/64MiB合计，月表1MiB单件/2MiB合计，与现行sanitizer一致，另保留分组解压预算。仅注入transport，无默认fetch、凭证、CLI或文件写入。任一失败不返回部分批次，安全报告与成功的内存buffer分离；ZIP检查不冒充OOXML/行内容校验。
- **验证**：离线覆盖清单、串行、HTTP/HTML/ZIP失败、声明/实际/合计大小、长度不符、流及请求超时、脱敏与sanitizer上限一致性。完整检查、独立审阅和CI以PR回执为准。
- **下一步/限制**：会话所有者、私有暂存、两个sanitizer与原子配置发布尚未接通；真实批量下载须明确新的执行预算。此前详情发现run 35207409663已成功且耗用：14请求、12页面200、登录退出确认；六个月度链接标记09-11，六周表链接09-05，仅元数据，不是内容验证。

### 2026-09-17 ACLED 十二详情页一次认证发现授权

- **Acceptance baseline**：owner明确批准独立一次最多14请求：登录、十二个已观察详情页、退出；HTML每页1MiB、控制响应各64KiB，每请求15秒、零重试/跳转。不下载XLSX、不保存页面正文、不写生产。失败也消耗本次机会，不借旧单文件或HAPI预算。
- **事实**：公开目录的12链接是`/aggregated/`受限详情页，不是静态XLSX；一次未认证月表详情GET返回403、无跳转。尚未证明认证后可以提取文件链接。
- **当前阶段**：[ADR-0052](ADR/0052-acled-detail-discovery-policy.md)精确工作流摘要例外先独立审阅，旧单文件例外和其它checker断言不变。本policy PR只提供fixture及规则，无实际workflow或凭证读取。
- **下一步/限制**：policy集成后另交实现PR、离线边界测试、独立复审与CI；通过后仅一次GitHub真实验收并记录唯一run。不因批准推断持续下载、文件内容有效或生产切换。

### 2026-09-17 ACLED 月度六表只读内容预演

- **Acceptance baseline**：owner要求十二文件清单之后继续。本轮补齐现有monthly sanitizer的显式`--dry-run`，复用本地六原件及现有builder；不下载XLSX、读取Secrets、启用定时或写生产，默认无参数手工写入行为保持。
- **实施/验证**：保留原六slug、同as-of、ZIP/行/表头/时效及趋势计算；写入前输出脱敏汇总、warningCount、monthlyTrendAvailable和忽略preparedAt的配置比较。无输入/无识别输入不称成功校验，错误固定JSON，未知参数在读输入前拒绝。合成CLI回归覆盖缺表、混合日期、缺月、非法值、正常写入兼容、原件/配置字节及mtime不变，接入两个月表检查入口。并未审定或修复所有既有年度统计/解析边界。
- **真实证据**：6份现有原件共43,479行、as-of=2026-08-21、latestFullYear=2025，warningCount=0、monthlyTrendAvailable=true、matchesCurrentConfig=true，exit0。六原件和生产配置共7文件读取前后SHA256全部一致；不是取得新版或验证HAPI六指标等价。
- **链接发现/下一步**：一次无凭据公开目录读取200、84,829字节（15秒/1MiB上限、无重试/跳转），当前严格双引号href静态XLSX提取结果为0；仅说明该提取方式未取得链接，不证明目录无文件或登录后一定可发现。未猜URL、未点击文件。后续需核对实际链接载体及必要的已认证目录读取，再评审十二文件有界下载/私有暂存与保护发布。既有认证单文件once和HAPI四槽不扩展。

### 2026-09-17 ACLED 周表与月度链路十二文件清单

- **Acceptance baseline**：owner明确要求月度链路六文件一并纳入GitHub自动更新目标，并要求继续。完整目标为六地区周表加六指标文件（1月度、5年度），不是HAPI单指标候选试行替代。当前交付为离线清单身份校验，不启用下载、定时、凭证或生产写入。
- **实施**：`acled-download-manifest.mjs`接收外部提供的12条官网静态链接，要求恰好六区与六个现行monthly slug、无重复、monthly同as-of；仅接受HTTPS精确官网host及有界ASCII文件路径，拒绝认证信息、query/fragment、编码路径和非法日期。周表允许源日期不同，仍须内容sanitizer验证共同窗口；链接可识别不证明可下载、真实来源、新鲜度或发布许可。专项纳入两个月表检查入口，合成URL不是已发现的真实链接。
- **核对来源**：2026-09-17只读[官方聚合目录](https://acleddata.com/conflict-data/download-data-files/aggregated-data)列出这12类。未请求XLSX正文、未读取Secrets；既有一次认证下载预算和HAPI四槽均不变。
- **下一步/阻塞**：实际链接发现、月表只读内容预演、受限会话批量下载与临时私有文件、修订比较和保护发布仍待实施及验收；现行提醒workflow不升级，认证workflow精确摘要例外不扩展。持续源访问权利及真实执行预算须在对应接入评审明确。当前模块只返回identities_validated_only、contentValidated=false和productionEligible=false，不是下载器。

### 2026-09-17 ACLED 六区周表只读标准化预演

- **Acceptance baseline**：owner要求认证下载成功后继续下一步。本轮复用私有本地六区文件，只读验证现有标准化链；不新增下载请求、不调用凭证、不启用定时或写生产。新增 `node scripts/world-order/sanitize-acled-weekly.mjs --dry-run`，原无参数手工写入行为保留。
- **实施**：完整执行原ZIP/大小、六区覆盖、表头/行、连续共同12周及新鲜度检查和同一payload builder；写入前返回固定摘要、与当前配置忽略preparedAt的比较。错误仅固定脱敏JSON，无输入明确no_input；不输出原行或候选JSON。测试覆盖正常模式、无输入、有效/变化/非法/缺区、字节与mtime不变，纳入两个周表检查入口。
- **真实证据**：本地欧洲中亚原件SHA256为46ca8e5f16c4dd27204a0ec951fb4401c1df8cfa8d3a5f476751ef7a450fe2be，与云端run 35193588026完全相同。六区共991,218行，实际共同截止周2026-09-04、12周连续窗口；预演exit0、matchesCurrentConfig=true，生产配置前后hash相同。文件名09-05不是数据周日期，不擅自改为09-05。这里只证明通过现有sanitizer，不宣称所有历史校验缺陷已排除。
- **剩余**：云端只实测欧洲中亚一表；六区自动发现/下载、月表自动路径、云端原件私有暂存与解析、内容修订复核及保护发布尚未接通。8MiB单文件验收预算不足覆盖已知Africa约12.4MB和Asia-Pacific约9.7MB，后续须独立有界批量方案，不机械复制旧探针扩源。当前不改workflow/Secrets/来源权利/生产数据。

### 2026-09-17 ACLED 登录单文件一次验收

- **Acceptance baseline**：owner已配置两个 ACLED_DOWNLOAD Secrets，并明确批准最多3请求（登录POST→指定XLSX GET→退出POST）；每请求15秒，文件8MiB、登录/退出各64KiB，零重试/跳转，仅内存、不发布。授权只供一次新run，不复用匿名或HAPI预算、不启用定时采集。
- **已有证据**：PR #377 已合并；一次匿名run 35190625767确认HTTP302、same_origin_login，预算已耗。规则PR #378与实现PR #379均已独立审阅合并，认证run 35193588026成功：登录200、文件200/5,570,323字节、退出204，正好3请求，sessionMayRemain=false。未保存原件或写生产，本次预算已耗，不重试。
- **实施**：独立main-only手动workflow，默认dry-run、Secret仅执行步骤注入；验证登录身份及安全Drupal会话cookie后才下载，复用原容器校验，随后单次退出。所有报告固定枚举，无响应正文、cookie、token、账号；不保存原件、无生产写入。run_attempt不是全局once，实际唯一run ID须记入PR回执。
- **限制与验收**：登录中断或不合法响应可能已建立服务端会话但无法安全退出，明确sessionMayRemain；退出仅204空正文确认为成功，不追加请求。本次实证ACLED部署支持该文件登录下载/退出；8项专项、完整检查、CI均通过，详见PR #379回执。持续自动更新未完成，行内容的本地复用预演见上节。

### 2026-09-17 ACLED 跳转分类与登录方式核验

- **Acceptance baseline**：owner要求开始下一步；补充静态文件诊断的脱敏跳转分类及官方登录文档核验，不提交凭证、不跟随跳转、不启用定时下载或生产更新。本轮先完成离线实现；新的真实请求不复用此前已耗预算。
- **已有证据**：PR #376 已合并；唯一实测 run 35181736628 返回 HTTP302 / redirect_not_followed / receivedBytes=0，未保存 Location，无法从旧日志确认跳转目的。旧 run 不重试。
- **实施**：Location 仅在内存解析，输出 missing/invalid/unsafe/cross_origin/same_origin_login/same_origin_other 固定类别；不记录域名、路径、查询、片段或凭证。仅精确同源 /user/login 归入登录页，非 HTTPS/带凭证目标不作为可跟随链接。原单请求/15秒/8MiB/零重试/零重定向规则保留。
- **官方文档证据**：[ACLED Getting started](https://acleddata.com/api-documentation/getting-started)明确提供 JSON cookie 登录和 OAuth 密码登录；这是 API 认证说明，不证明该 XLSX 路径可用同样认证，也不授予持续网站抓取许可。未读取或配置 GitHub 登录 Secrets。
- **验收状态**：离线回归、完整检查及独立审阅以本次提交/PR回执为准；实际跳转目的和认证文件下载仍待新的一次验收，不把分类器实现当下载成功。

### 2026-09-17 ACLED 单文件云端下载诊断

- **Acceptance baseline**：owner批准GitHub手动单文件验收，固定其提供的欧洲中亚2026-09-05 XLSX，匿名最多1 GET/8MiB/15秒，零重试/重定向。不携带账号密码、不解析行、不发布，不把浏览器客户端拦截当云端结论。
- **实施**：新增main-only workflow_dispatch，默认dry-run、contents只读、无npm安装/secret/artifact/cache。CLI复查main、仓库、事件与首次run attempt；正文仅内存，原ZIP安全断言不改，仅导出复用，必要OOXML部件检查不冒充内容校验。
- **验证与执行**：8项合成回归及dry-run通过，包含审阅发现并修复的超时后主动取消流/迟到响应不再读取；完整检查、固定提交独立审阅、CI及唯一真实run ID以本次PR/执行回执记录。run_attempt=1只禁止同run重跑，不能阻止第二次dispatch；本轮只允许执行层派发一次，失败不重发。
- **限制**：任何非200、HTML、格式异常、超限均停止且不输出正文。官网定时下载许可/登录方式、实际内容/地区/日期验证和生产更新仍未完成；HAPI替代问题与这条XLSX过渡链分开，旧预算和观察保持不变。

### 2026-09-16 ACLED 行政身份离线诊断

- **Acceptance baseline**：owner要求连续完成可做工作并授权逐项提交/推送/独立AI审阅合并。本项仅固化现有私有证据诊断，零新增请求、不改变已耗once或生产主键，不去重/相加；来源权利、真实观察和临执行预算门槛不变。
- **实施与证据**：既有forensic `--review`在hash复验后输出精确connector模式及名称扩展键诊断。真实4,595行中135行国家connector、184行一级connector、4,276行其它；42冲突组分别4/38/0。加入区名后冲突0，仍3条额外重复。其它编码未认定为权威行政码，隐藏数据库身份、事件互斥和部署版本仍未证明。
- **验证**：新增合成测试保留原严格校验，覆盖精确模式、999/000不误判、非法行隔离、隐私、名称相同但数值冲突及国家命名空间；完整检查、独立审阅和CI以本次PR回执为准。
- **剩余门槛**：3条投影重复原因、同版本引用与全球行政覆盖、跨层互斥、六指标等价及周表自动来源尚未证明；不以代码模式解释代替生产验收。ARR第二周期与四槽自然等待继续。

### 2026-09-16 ACLED 独立重复取证

- **Acceptance baseline**：owner明确批准独立取证最多3免费请求/8MiB/10,002行、15秒每请求、零重试，仅私有保存不上线；沿用2025-01/PV/admin2全部返回范围、1,100ms间隔、零分页/重定向。此授权只新增一次取证，不重置旧scope/AFG/年度/四槽预算。
- **实施**：独立固定acled-admin2-forensic-20260916 once，复用原collector和quarantine分类器；成功响应也只保存取证文件，无candidate路径。主checkout、基线预验、hash、私有联系指针和失败耗用保持。
- **验证/真实结果**：19项专项及dry-run、pre-live独立审阅通过。一次live实际2请求均200，共1,723,981字节/4,596行；sample4,595行因duplicate_row停止，第3请求未发。私有取证保存及零网络hash复验通过：4,329有效行政键、多余重复266行、3组相同重复、42组冲突、单行无效0。42冲突组均有不同admin2_name，其中26组events不同、24组fatalities不同、4组admin1_name不同（可重叠）。完整检查/CI/集成见本次PR。
- **边界/下一步**：本次once已消耗，未用第3请求不是重试许可；metadataFence未完成。取证保存成功不等于源数据验收通过，不去重放行、不汇总全国或上线。新正文只能解释本次返回，不能补造旧版证据。行政键与区名存在歧义，需核对上游行政映射及原始粒度，不能直接改成按名称主键、求和或删行；原始形成原因尚未证明。

### 2026-09-16 ACLED 拒绝正文隔离取证准备

- **Acceptance baseline**：owner要求开始下一步；本轮仅实现私有quarantine和离线重复分类，不重新下载、不改变旧once ID/预算、不切生产。新的真实取证仍须独立预算批准。
- **实施**：完整、合法UTF8/JSON envelope且行数/字节未超限的sample才可隔离保存；candidate snapshot仍null/status仍stopped。独立quarantine文件及hash manifest，候选读取器拒绝；`--review-quarantine`在基线/联系读取前完成零网络只读分类。原严格行校验只导出复用，不放宽断言。
- **验证**：16项专项通过，覆盖相同/冲突/混合重复、非法行、满limit/超限/坏JSON/UTF8、围栏变化、hash破坏、候选隔离与once消耗。完整检查、独立审阅及CI见本次PR；本轮不执行live。
- **剩余**：上次仅attempt/receipt，历史失败正文无法恢复，真实duplicate_row原因仍未知。本次只是取证能力准备；没有跨国覆盖、数值等价、自动上线或新下载结论。

### 2026-09-16 ACLED 多国二级行政区返回范围验收

- **Acceptance baseline**：owner在独立方案审阅后明确批准固定2025-01/PV/admin2、不带国家筛选的一次独立采样：最多3免费HAPI请求，累计8MiB/10,002原始行，15秒每请求含正文、起始间隔≥1,100ms，零重试/分页/重定向。仅本地私有保存；不复用AFG、年度或四槽预算，不全国汇总或切源。
- **实施**：`collect:acled-admin2-scope`默认dry-run，先hash/schema复验年度与AFG基线，独立once占用后才请求；10,000样本行命中即停止，失败/中断不重跑。行政身份按国家隔离；AFG同版本双向完整字段比较，新增/消失/变化hold并保留证据。跨层仅比较国家月键，不判事件重复或互斥。
- **验证/真实结果**：10项离线专项、dry-run及独立pre-live审阅通过。真实运行第2请求后duplicate_row停止：2次HTTP200，共1,723,981字节/4,596原始行（metadata1行、sample4,595行）；第3请求未发送，没有重试。仅保存attempt/失败receipt，失败正文未落盘，无法离线辨认重复是否冲突，不能宣称覆盖或对照验收通过。本次once已消耗，不借未用请求重跑。旧validators/生产数据/调度未改；完整检查与集成见本次PR。
- **剩余**：本次只核对一个月的返回范围，未返回不等于无事件或不被覆盖；不同完整版本tuple记indeterminate。行政全集、48月多国覆盖、六表数值定义等价及周表自动渠道仍未完成；ARR/四槽自然观察保持。

### 2026-09-16 ACLED AFG 二级行政区一次验收

- **Acceptance baseline**：owner明确批准本次AFG/2025-01/PV/admin2最多3免费请求、累计1MiB/1,002原始行、15秒每请求、零重试/分页/重定向；仅本地私有保存，不借用四槽预算、不全国汇总或上线。此答复替代下方小样本方案“待批准”的状态，不扩其它国家月份。
- **实施**：独立once目录、metadata→sample→metadata、开始间隔≥1,100ms；满1,000行/空响应/月份层级错误/行政身份冲突/重复/超限拒绝。完整保存hash并最后落receipt，失败亦禁止重跑。行政代码仅源声明，未凭格式认定权威完备；原admin0/年度validators及预算未改。
- **真实结果**：2026-09-16 04:23 UTC三请求全部200，共150,768字节、400原始行（398样本+2metadata），返回34个admin1及398个admin2代码；来源08-28、围栏一致。保存档案零网络hash复验通过。`review:acled-geography -- --admin2`可加载该独立证据，保留其月份/时钟及全球缺口，不将单国单月变成全球已齐。
- **剩余/交接**：8采集专项、7地理专项及真实离线回执通过；真实请求前独立审阅通过，最终全套/CI/合并见本次PR。此次预算已消耗，不重试。其余参考国家、行政区权威全集、跨层互斥、同版本官网引用、其它类别/周表等价仍未证明；四槽及ARR自然观察仍按原时间执行。不能把“AFG在admin2存在”推广成全国或全球可自动替代。

### 2026-09-16 ACLED 地理覆盖与历史版本证据

- **Acceptance baseline**：owner要求继续完成剩余任务；本项为离线地理报告、公开代码/分类表及历史元数据研究，沿用逐项commit/push/独立AI审阅合并。新增正文请求预算仍须单独确认，不切源、不发邮件。
- **已完成**：`review:acled-geography` 复验年度私有档案后，以固定OCHA taxonomy核验36个名称/代码对，真实36对均匹配；24个有明确代码的原表参考国家全部未在admin0候选返回，另8名称继续未解决。报告不输出事件值、不模糊归并、不把24代码集当全球清单、不以名称身份替代领土等价。6项回归及真实零网络复验通过，独立代码审阅通过。
- **来源结论**：OCHA读取Non_HRP/HRP_1/HRP_2，无Admin1列设admin0，否则admin2；未发现跨层互斥校验或全国汇总。HDX历史元数据确有08-28，但与09-04共用download URL、声明hash/size不同，不能据旧metadata获取当前文件冒充旧版。同版本历史正文仍未取得。详见[地理及历史版本证据](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md#地理覆盖与历史版本证据2026-09-16)。
- **下一门槛**：已向owner提出独立AFG/2025-01/PV/admin2最多3请求、1MiB、1,002原始行、15秒、零重试的小样本预算；截至本记录尚未执行，等明确批准。无权威行政区清单时只能证明返回行有效，不证明地理完整，不全国汇总。完整全球/其它类别/六表同版本等价及周表自动渠道仍未完成；四槽与ARR真实等待不提前。

### 2026-09-16 ACLED 年度就绪报告与本地引用盘点

- **Acceptance baseline**：owner要求继续下一步；仅离线核对合法原件、国家映射线索和年度报告接入。沿用分项commit/push/独立AI审阅合并，不增加下载预算，不发邮件或切换生产。
- **完成**：`review:acled-replacement -- --annual` 先复验独立年度档案hash/schema/覆盖，再单列annualCandidate；仅在来源日期一致时将PV年度时间覆盖更新为2022–2025完整。默认24月报告不变；年度损坏直接失败，不静默回退；数值/全球覆盖/生产资格不升级。真实离线运行返回missingYears空，但整体仍not_ready_for_replacement。
- **原件证据**：Downloads仅发现既有六地区周表；项目monthly目录内六表均08-21。只读PV月表Sheet1有29,353数据行、年表2,765行，各250个国家/地区名称；候选218代码中182个精确同名。原表68名称及候选36名称无精确同名，尚不能把差异全当别名或缺国。两原件读取前后SHA256不变；HAPI08-28与原件08-21不一致，本次没有执行数值等价比较。
- **下一步/限制**：先核验国家代码对应及HAPI各行政层级覆盖，避免直接相加重复计数；找到合法同版本原件后再逐行对照。没有以改日期、补零或模糊匹配制造通过。ARR自然第二周期与四槽预算保持原样。方案独立审阅通过，专项10项比较测试及9项年度测试、完整检查和最终集成以本次PR回执为准。

### 2026-09-16 ACLED 年度候选与公开筛选规则核验

- **Acceptance baseline**：owner 要求先广泛检索官方、关联站及社区答案，不再立即发邮件；批准独立一次 PV/admin0 2022–2025 验收，最多4请求/16MiB/20,002原始行，15秒每请求、至少1,100ms间隔、零重试/分页/重定向，仅本地私有保存。此预算不占用或扩大既有四槽试行，不批准生产切源。
- **已完成**：新增年度 collector/store/CLI，复用原严格逐国家月 validator，按国家并集验证两分区完整覆盖；独立 once 目录先占用、失败不重跑、哈希复验、脱敏回执。真实请求前独立 AI 审阅及9项测试通过。4请求全部200，共3,723,475字节/10,466原始行（含2元数据行），218返回国家代码各48月，2022–2025完整；来源08-28，保存后离线复验通过。本次预算已使用，禁止重新下载。
- **研究结论**：官网已明确总死亡表为全部报告死亡、直接针对平民死亡表为直接针对平民事件产生的报告死亡；不等于所有战争平民死亡。HAPI枚举与Codebook范围描述仍有差异，OCHA转换器不重新执行事件级筛选；尚无六表等价证据或免费自动周表渠道。未发邮件。详见[年度验收与公开定义](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md#年度候选与公开筛选规则2026-09-16)。
- **剩余**：年度候选补齐时间不代表旧 `review:acled-replacement` 已接入年度档案；同版本合法引用、国家映射、实际逐行对照及其它类别仍待完成。生产、四槽调度及ARR自然第二周期保持不变；完整检查与集成结果见本任务PR。

### 2026-09-16 ACLED 免手工目标：逐指标替代验收

- **Acceptance baseline**：owner 要求按步骤推进到免手工更新，ARR 可一并优化；沿用分项 commit/push/独立 AI 审阅和合并。此目标不把部分月度数据当六表等价，不取消已有真实观察、临执行预算或来源权利门槛。
- **本刀**：新增 `review:acled-replacement`，零网络/零写入读取既有私有候选并复验 manifest、版本围栏和覆盖；六项分别报告定义、时间、地理、数值、生产状态。纯函数逐国家/月对照规范化引用，不汇总抵消差异、不把同 as-of 当同 revision；当前 CLI 未接 XLSX 引用，真实结果明确 reference_missing，不宣称已完成手工源数值对照。
- **实际缺口**：首槽24月2024-08至2026-07只有2025完整年；生产年度指标需2022–2025，2022/2023及2024前7月缺失。两个死亡数指标没有证明语义映射；周度地区/行政区4/12周统计不能从月表反推。原生产 config/data/workflows不变。
- **调度修复**：既有 `arr` heartbeat 更新为“ARR 验收与 ACLED 候选试行”，ARR仅周一/二按原截止/预算验收；ACLED仅周三/四20时检查，CLI仍强制实际请求≥168小时、四槽总预算与10-13绝对截止。单项终止不取消另一项，全部终止才pause；本机须运行。后续槽尚未执行，不能声称自动生产更新完成。
- **后续**：合法同版本引用及国家名/代码映射准备、PV逐行实际对照；独立设计四完整年及其它类别采样预算；死亡数/周表无等价来源时提出明确的部分改造方案，不暗中删指标。ARR等09-21自然第二周期，不提前请求或人工伪造schedule。

### 2026-09-16 ACLED 四槽候选试行（已批准）

- **Acceptance baseline**：owner 已明确批准四次低频试行：PV/admin0 返回范围的最近24完整月；每周最多一次、首次计入共四次，每槽≤3数据请求/8MiB/10,002原始行、15秒/请求、1,100ms间隔、零重试，合计≤12请求/32MiB。只在本地主checkout保留私有候选，不替换六指标、不切源、不上传原始行。
- **实施**：新artifact_sanitizer_layer入口 `acled:pilot`，逐国家复用原100行严格validator而不放宽断言；meta-only须复验旧候选hash，保留dataFetchedAt；源覆盖/更新时间/同步时间倒退暂停。按首槽起28天绝对截止、四个固定周槽、相邻attempt≥7天；漏槽不补，原子占槽和互斥锁，失败保留预算记录。64MiB本地保存上限，不自动删文件腾空间。
- **验证/运行**：方案与真实请求前代码独立审阅通过；12项专项及补充路径保护测试通过。首槽09-15 22:53 UTC执行成功：3请求全200、1,863,079字节、5,232样本行/218返回国家代码，每个具备2024-08至2026-07的24个月；来源仍08-28。重复执行返回not_due、零请求。绝对截止10-13 22:53:47 UTC，已用1槽；其余三槽尚未运行，完整CI/调度配置见PR回执。后续本线程heartbeat每次只调同一采集CLI一次；错误/锁定/结束时停止ACLED分支并报告，共享heartbeat按上文双任务规则停止，不依赖调度器保证请求上限。
- **未完成边界**：尚不能认定全球覆盖、六指标等价或生产自动更新。四周内无上游新版本时，不宣称真实修订路径验收完成。详见[四槽试行契约](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md#四槽候选试行2026-09-16)。

### 2026-09-16 ACLED 有界采集与版本围栏

- **Acceptance baseline**：owner 要求下一刀，并明确批准仅此次三请求验收：免费 HAPI、合计 ≤1 MiB / ≤102 原始行、每请求 15 秒、零重试，私有样本留本地，不发布或切源。此批准只替代旧两请求预算已耗尽的本次操作门槛，不是自动续跑或生产授权。
- **实施**：artifact_sanitizer_layer 中固定 PV/admin0 单国家月样本，按元数据→数据→元数据串行核验，开始间隔至少 1,100ms；复用离线候选校验器，不改生产导入器/提醒/workflow。CLI 默认 dry-run；固定一次性 attempt 目录拒绝重跑，原始候选只在完整校验后私有保存。
- **验证状态**：方案及真实请求前独立代码审阅通过；12 项合成回归和 dry-run exit 0。一次真实三请求全部200，共3行/3,047字节，前后元数据一致，保存候选离线复验通过；与前次真实样本无行内容变动，仍08-28版本。旧样本字节未改，未自动更新baseline。完整检查/最终审阅/集成回执见本任务 PR。
- **下一步边界**：双读元数据只排除可见漂移，不证明上游事务快照；不证明六指标等价，不自动晋升 baseline。完整采样、调度和生产切源仍需独立方案/预算评审。详见[有界采集说明](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md#有界采集与版本围栏2026-09-16)。

### 2026-09-16 ACLED 离线版本固定候选

- **Acceptance baseline**：owner 要求开始下一刀；承接前次方案，仅实现政治暴力国家月度事件数的本地 JSON 候选校验与跨快照比较，沿用分项 commit+push / 独立 AI 审阅授权。零网络、零新增下载预算、不写生产、不扩展其它五项映射。
- **已实现**：保存字节双 SHA256、来源元数据及 UTC 微秒时间绑定；严格声明范围、完整月份、缺行/null/零、重复冲突和截断检查；同版本冲突与不同版本修订分开报告。输出只有汇总诊断，默认没有基线，不自动晋升。
- **验证证据**：13 项专项回归通过；上次保留真实 JSON 离线 CLI 验收 exit 0，保存文件未变，结果为声明范围完整 / baseline_required。不是第二次采集，也不证明六指标或全球等价。完整检查和独立最终审阅见本次 PR 回执。
- **下一步边界**：需要独立审阅可复用采集器的版本一致性与取样预算，取得第二份可比快照；生产写入、调度、六指标替换仍未完成。详见[来源评审](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md#离线版本固定候选工具2026-09-16)。

### 2026-09-16 ACLED HDX/HAPI 许可与隔离样本验收

- **Acceptance baseline**：owner 在 ACLED 新回信分析后要求开始下一步；沿用本任务分项 commit+push 和独立 AI 审阅授权。本次仅来源许可/平台条款核验、一次 2 请求/200 行/1 MiB/15 秒/零重试的隔离验收；不切换生产、不自动访问 ACLED 官网、不扩展费用或公开原始数据。
- **已执行**：ACLED 09-15 明确许可与新版 HDX/HAPI 条款已核验，独立来源方案审阅通过；两次真实请求共 2 行/1,706 字节。初次关联校验使用旧字段而停止，修正 v2 资源字段后仅离线复核通过，没有追加网络请求。本地合法 XLSX 只读原哈希保持。
- **结论**：数据结构/来源关联通过；对应本地行缺失，且本地 08-21、HAPI 08-28、目录 09-04 三版不同，数值等价为 indeterminate。HAPI resource ID 稳定不证明版本同步。六指标整体替换与周表自动化未完成，官网抓取仍不允许。详见[来源评审](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md)。
- **下一步**：独立评审版本固定的月度候选适配方案及预算；部分可证明 evidence 不冒充六表无损替换。完整验证/提交/推送/最终独立审阅结果见本任务 PR 回执。本轮只同步三个相关文档，不混入并行 Bubble Watch 改动。

### 2026-09-16 Bubble source-health 审计修复（验证中）

- Owner acceptance baseline：修复 main 6732e894 的 Audit Bubble Watch Sources 失败。run 34957868183 的 build/check 均为 0，仅 VC 和 Neocloud 两条 ADR-0048 证据不足回退被旧审计分类器判为意外故障；前一成功 run 34586967372 尚未应用该证据保护。
- [ADR-0049](ADR/0049-bubble-evidence-gap-audit.md) 明示新的窄范围审计分类：全部来源本轮健康、有效且带完整诊断，并使用日期/年龄重新验证的有效研究快照时报告 WARN；真实源故障和过期快照仍 FAIL。保留全部既有 checker 断言与评分/日期/覆盖门槛。
- 本任务仅补充来源诊断与审计，不发布生成数据，不调用付费 Wind/DeepSeek；验证使用免费审计，并核对四个生产文件字节完全恢复。合并前需独立审阅本次契约修订。
- 验证：独立 AI reviewer 初审指出 VC 标题可能代替正文的健康诊断漏洞，修复原始响应/日期/URL检查及 Neocloud 对应公司检查后复审通过。7 项回归、语法、完整 `check:changed` / `check:all` 均 exit 0。实际免费本地审计 build/check=0、结果 WARN、四个生产文件 SHA256 完全恢复；补强后六个来源实时内容检查均为 ok。待 PR CI 与新版 GitHub 免费审计通过后集成。

### 2026-09-14 AI 基建信用利差图（已上线）

- 已完成：PR #357 合并 d9ee2a52，Pages 34835506397 / EdgeOne 34835506324 成功；两站三图、27卡和主分30.4%一致，实际浏览器与数据哈希验收通过。

- Owner acceptance baseline：在 Bubble Watch 的周度趋势之后、分类指标之前，按参考站 1:1 增加 HY / CCC / IG 一年信用利差三图。保持三列/720px 单列、20px gap、180px 图高、标题/数值/五观测间隔变化和 HY 350/500 虚线。此次复刻采用上游黄/红阈值线颜色，范围仅该独立页图表，不推广首页色板；沿用 DESIGN §4.4 独立页边界。
- FRED 序列为 BAMLH0A0HYM2 / BAMLH0A3HYC / BAMLC0A0CM；CCC 与 IG 是市场代理，并非 Neocloud / hyperscaler 专属券篮子。嵌入现有 Bubble builder 的可选 credit_spreads，属于 daily_history_layer → frontend_display_layer；日度观测随既有周一刷新，不新增 provider、workflow、生产依赖或计分输入。
- 数据复用前审阅 FRED 官方 ICE series notes：公开再发布须 ICE 书面许可。owner 在查看本地预览、验证结果与许可说明后，于 2026-09-14 明确要求忽视本次许可前置要求、自行承担风险并直接上线。配置 enabled=true / publicationRights=owner_risk_accepted 准确记录该决定，不宣称已取得 ICE 许可。此例外仅覆盖本次三条信用利差图。
- 单序列失败保留合格历史及原 fetchedAt；缺失不作零；拒绝未来/无效/倒序/重复日期、不足一年覆盖和来源倒退；展示按实际观测日独立判断超过 10 天，并披露 fallback/missing。增加源解析和浏览器回归，Core-23/Shadow-4、主分与判读输入不变。
- 前任务 PR #356 的 review 记录保持原范围；本次具体上线依据是 owner 对已交付预览和验证结果的最新直接发布指示。首次仅用 scripts/refresh-bubble-credit-spreads.mjs --write 免费刷新 credit_spreads，先 dry-run 并核对其余 JSON 语义完全不变；后续随既有 builder 更新，不重复触发 Wind/DeepSeek。验证与预览证据见 ignored manual-artifacts/bubble-credit-20260914/。

### 2026-09-14 Bubble Watch 更新与参考站差异修复（已上线）

- 完成记录：PR #356 合并 522c4e0，正式刷新 34827690283 成功，生产数据提交 26f7e99；Pages 34828000873 与 EdgeOne 34828119202 发布成功，三端 JSON SHA256 一致。正式主分 30.4%、压力 47.8、Stage 60、Trigger 38.5。下游编辑 34828000991 因可信新闻为零 expected skip，provider 调用与 AI 写入均为零。以下保留修订时审阅证据。

- Owner acceptance baseline: 先修复已确认的 VC 旧观测冒充新日期、Neocloud 覆盖不足判绿、RPO 可比期间/缺失披露、广度真实来源/交易日，再运行正式刷新链路；已明确授权该链路既有 Wind 付费回退及一次下游 DeepSeek 判读，不重复询问费用、不另行重复 dispatch AI。
- 2026-09-14 owner 明确授权本次由独立 AI reviewer 审阅 PR #356，通过后直接合并并正式刷新；本次例外不改变其它任务的人工 review 要求。独立 reviewer 已审阅代码 head `a7343d1673a7fe4e92d17dc225336d9501941099`，未发现阻断级问题，8 项纯单元用例及 diff 检查 exit 0；VC checker 修订与浏览器 fixture 修复均通过审阅。该 head 的 GitHub CI 34823284943 全绿，最终集成仍核对待合并 head 与检查状态。
- [ADR-0048](ADR/0048-bubble-source-evidence-policy.md) 明示 VC checker 从历史数值下限改为原文重放的契约修订，须独立 review 后集成。Core-23/Shadow-4 与阈值不变。
- 初查生产仍为 09-07、参考站为 09-13；当日 scheduled run 尚未启动，历史周一同任务曾延后数小时。免费隔离旧代码候选 30.4% / 45.7，与参考站 32% / 48 的差异来自计分集合及 insider/neocloud 状态，不是算术错误。
- 初轮 `npm run check:changed` 执行完整 `check:all`、源证据回归用例、语法及 diff 检查均 exit 0。免费隔离 build exit 0，候选七项 Bubble Watch 契约通过；修复后为 30.4% / 47.8、stage 60 / trigger 38.5，Neocloud 按既有研究回退转黄，VC 采用约 70%，广度真实观察日 09-11，RPO 披露 3/4 家与 06-30 报告期。最后补充的严格季度间隔、窄句型及广度研究回退标签守卫另经单元测试，未再次运行整条网络构建。
- [PR #356](https://github.com/ctmaomao/gfrr-auto-update-site/pull/356) 初轮 CI 34822582050 的 full suite 通过，浏览器 smoke 有 3 个既有宏观场景失败：样本仅令当期 AI 失效，未清除已批准新增的 `macroRiskEditorialPreviousIssue`，实际正确展示上一期，违背旧样本的隐藏预期。现补齐这 3 个无合格历史场景的数据模拟，保留全部原隐藏断言，既有 editorial-history 浏览器测试已覆盖 1440/390px 上一期显示、原日期/分数与当期依据展开的正向验收；生产 rendering 不变。
- 最后一次本地全套 `check:changed` / `check:all`、8 项源证据用例、全部既有浏览器用例、文档与语法检查均 exit 0；远端须以最新 PR head 的 CI 结果为准。
- 自查已核对四项实施与 acceptance baseline 一致；唯一既有 assertion 修订在 ADR-0048 明示，保留原文分母和 parser 断言，无新增 ignore/skip。正式刷新、下游判读和双站生产验收待独立 review 后执行。完整 27 项隔离对照保存在 ignored `manual-artifacts/bubble-compare-20260914/fixed-report.md`；最终分数以正式产物为准。

| 项 | 当前依据 / 职责 |
|---|---|
| Release/display version | `v28.0.10`；以 package.json / release 定义为准 |
| Data/decision contract version | `data.version` / `decisionModel.contractVersion` 保持 `v27.0`，不可机械同步展示版本 |
| Cache version | `editorial-history-1` |
| 前端输入 | M-94 首页读取 `data/radar-data.json`；`scripts/modules/realtime.js` 冻结、未接入 |
| Worker 预览 | `/market.worker-preview.json` 主预览；`/market.secondary-preview.json` 仅 secondary diagnostics，不代表前端入口 |
| Daily 输入 | `realtime-data`；不切换到 Worker endpoint |
| 检查组成 | package.json / scripts/check-suite.mjs 为准，不手抄数量 |
| 当前任务 / 最新证据 | Section 2 与最新 Session Handoff；历史快照见[归档](PROJECT_COMPLETED_HISTORY.md#maintenance)，不据旧日期推断线上健康 |

跨任务权限、独立展示/主评分隔离、源权利与失效降级统一按 [AGENTS](../AGENTS.md)、[领域附件](AGENT_DOMAIN_BOUNDARIES.md)、[DATA_SOURCES](DATA_SOURCES.md) 和 [DATA_CONTRACT](DATA_CONTRACT.md)；运行/部署步骤见 [OPERATIONS](OPERATIONS.md)。Transport capped free-proxy 的现行窄范围例外见 P3-19a，不能把一般 display-only 规则误用为撤销该授权。

当前专题审阅入口：**Market Pricing freshness/alignment review**（display-only，`check:market-pricing-freshness`）、**FOMC Minutes tone/topic quality review**（display-only）、**World Order source-health consistency review**（overlay-only）。这些入口不触发抓取、付费或发布，时效与验收以本次实际检查为准。

---

## Section 2 · Open Backlog Items

### 2026-09-13 分项交付与状态收敛

- **Acceptance baseline**：本轮第四项使用 neat-freak 仅同步受影响待办、验收计划和 ACLED 来源状态；沿用 owner 分项提交/推送、独立 AI 审阅与合并授权，不改个人记忆、全局指令、数据或历史原件。
- **已完成**：#351 上一期 AI 展示集成与双站交付；#353 只读巡检实现、部署及首次真实 artifact；#354 GDELT 自然限流执行复核。下方补齐 #350/#352 既有交付，旧阶段“待合并/待发布”不再作为当前任务。
- **不能提前关闭**：首次历史 AI 字段等待自然 Daily；ARR 新版周一链路最早等待 09-14 排程及后续跨运行证据；新闻 v5、压力研究 v2 和巡检 7/28 天分别累计自己的真实样本。ACLED/运输独立来源许可没有因本轮授权而获得第三方批准；不重复发信、付费请求或晋升基线。

### 2026-09-13 GDELT DOC 冷却自然验收

- **Acceptance baseline**：本轮第三项只复核现行策略的真实执行，按证据决定是否修改；owner 已授权分项提交/推送、独立 AI 审阅和合并。不为验收额外请求 GDELT，不增加付费调用或新来源。
- **结论**：最新 committed `data/gdelt-news-cache.json` 三次新代码自然尝试（09-11T00:38:42Z、09-12T04:56:40Z、09-13T05:18:32Z）全部 429，但均 attempts=1/retryCount=0；相邻间隔 28.30h、24.36h，24h 冷却确已生效。09-09 的两次请求属于旧版本，不是回归。Oil News [34739967496](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34739967496) 成功不代表 DOC 恢复；Tavily/Brave 各 4/4 查询成功，来源隔离正常。
- **处理**：保留既有代码/24h 冷却与 fail-closed，将 [来源台账](DATA_SOURCES.md#2026-07-31-gdelt-doc-resilience-follow-up) 的旧“一次重试”描述明确为非限流错误。四项既有离线限流测试退出 0，含真实 caller 持久化冷却与下次零请求；没有生产修改。
- **关闭与保留**：关闭“新代码首次自然请求/零重试验收”待办；DOC 上游不可用仍为来源缺口，最新 7 日成功 1/7、30 日 6/51，不声称恢复，也不降低新闻 v5 质量/观察门槛。
- **交付**：[PR #354](https://github.com/ctmaomao/gfrr-auto-update-site/pull/354) 已合并 `21a7dc71`；提交 `7d423ede`、完整本地检查和独立 AI 审阅通过，精确 CI `34751585371` 成功。仅文档，无需额外数据刷新或部署。

### 2026-09-13 双站发布快照只读巡检

- **Acceptance baseline**：沿用本轮 owner 完成可做事项及 commit/push、独立 AI 审阅、合并/上线验收授权。仅现有 Pages/custom 域名固定 6 个文件的只读巡检；没有 Daily/AI 重跑、来源接入、生产写入或自动恢复授权扩展。
- **实施**：单轮 12 请求、并发 4、含正文 10 秒/2 MiB 上限、无跳转/重试；逐文件提交时间的交付宽限（Pages 1h，custom 按既有 3h 排程加余量为 4h）、固定 HEAD hash、跨站版本/内容比较、JSON 交付年龄与原来源日期分离。来源降级单列警告。main-only 每 6 小时 workflow，权限 contents:read，90 天脱敏 artifact；默认本地命令只预演。详见 [验收计划](AUTONOMY_ACCEPTANCE_PLAN.md)。
- **验证与交付**：14 项离线测试、完整套件、独立 AI 审阅及精确 CI `34751187552` 通过；[PR #353](https://github.com/ctmaomao/gfrr-auto-update-site/pull/353) 提交 `cb86291c` 已合并为 `782c0ab4`。首次 main 运行 [34751353161](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34751353161) 成功，下载实查 artifact：10:15:14 UTC、固定基线 `782c0ab4`、12 个 HTTP 200、无交付错误，版本 `editorial-history-1` 和正文 hash 跨站一致；World/News 来源降级明确记 warn，没有触发恢复。此前本地 10:07:25 UTC 实读结果相同。
- **剩余验收**：7 天基线、28 天可靠性与 GitHub 外监测环境尚未完成，不能以初次成功替代长期验收。

### 2026-09-12 AI 更新间隙保留上一期判读

- **2026-09-13 集成授权**：owner 授权完成复核所列可完成工作及所需提交、推送、独立 AI 审阅、合并和发布。本项仅完成 #351：合入最新 main 时同时保留压力研究 vintage 检查、ADR-0047 与交接；最终提交须重新完整验证和独立审阅。其它三项另开串行 PR；不扩大付费调用、来源许可或观察期晋升。
- **Acceptance baseline**：owner 明确选择“保留每日更新，间隙展示上一期 AI”。沿用每日更新和既有费用预算，原日期及“上一期判读，当前数据已更新”显著披露，当前确定性依据继续展开；新一期合格后优先展示，不改旧日期、不把历史观点当作当前观点。实施与验证按 [ADR-0046](ADR/0046-editorial-previous-issue.md)，最终独立 AI 审阅已通过。
- **现场证据**：周六 Daily 于 00:27 UTC 更新；00:29/00:55 admission 等待上游，AI 于 01:38 生成。运行 34665377398 一次调用、零重试并成功写入；检查时 Pages 与自定义域均已正常显示同一期。原因是上游就绪间隔及当前编辑层必须匹配 Daily 时间，不是周末停更。
- **实施范围**：Daily 仅保留上一份生产快照中合格编辑层的原字节到可选历史字段；历史验收复验原期时钟、来源、摘要和展示边界，失败不覆盖合格旧期。前端同位置区分当前/历史/不可用；历史模式保留原期分数及日期说明，不折叠当前确定性依据。不修改 provider、预算、workflow、主分或生产 JSON。
- **本地验收**：21 项历史保留单元回归、3 项浏览器测试（含 1440/390 宽度历史→当前两个阶段）、真实生产快照只读保留预演、check:changed 实际执行完整 check:all、node --check scripts/app.js、git diff --check 均退出 0。原有 checker 断言、provider/writer、预算、生产 JSON 与 workflow diff 为空；规则/决策模块只有 asset query 同步。1440/390 像素截图及 CSS 取样已核对，沿用 DESIGN §2/3 字体与色板。
- **集成交付**：[PR #351](https://github.com/ctmaomao/gfrr-auto-update-site/pull/351) 已于 09-13T09:57:59Z 合并。GitHub 合并接口故障期间，将已独立审阅且 CI `34750481820` 通过的同一提交 `85181c98` 正常快进推送 main，无强推或历史改写；GitHub 随后确认 MERGED。Pages `34750625423`、EdgeOne `34750625287` 成功，双站实际脚本版本和正文已核对。
- **上线边界**：首次历史字段仍等待下一次成功自然 Daily 建立，不能以夹具浏览器通过冒充线上历史样本验收；本轮未调用付费 AI。

### 2026-09-13 压力模型现阶段验收与研究采集修复

- **Acceptance baseline**：owner 要求执行现在可完成的后续工作；沿用本任务模型研究、修复、独立 AI 验证、推送/PR/CI 后集成授权，主目标保持当下压力。另一个 PR #351 的 AI 展示任务保持原现场，本轮在基于 `5ba0de72` 的独立目录执行，不混入该 PR。
- **实际验收**：9 月 12/13 日自然 Daily 均成功并真正发布；结构源原日期保留。v1 自然影子运行 `34676417031` 成功续接两日真实记录并通过旧版重放；此前 PR #347 已合并、两站发布与桌面/手机验收通过，修正旧条目仍写“待回执”的历史状态。
- **问题与实施**：[ADR-0047](ADR/0047-pressure-evidence-continuity.md)、[后续报告](PRESSURE_MODEL_FOLLOWUP_2026_09_13.md)。修复整 Daily 文件 hash 误重置与单候选缺周阻断整条记录；v2 保留逐候选状态/null/有效分数，并提供同日期成对比较。增加历史版本严格审计、滚动校准漂移及有效观察块缺口披露。旧两天原样保留，新 v2 不借用旧时长；生产数值逻辑、阈值、数据及前端未改。
- **本地验收**：`check:changed` 实际执行完整 `check:all`、22 项专项、`test:unit:coverage`、`git diff --check` 均退出 0；单元 591 项，590 通过，1 项既有本地真实原件测试因独立目录没有 ignored 原件而按原规则跳过，无失败。独立 AI 实际复核通过。双站实读时间与上述 Daily 一致，结构原日期和主分均一致。已完成有界 ALFRED/FRED 真实取数、离线复算与两天候选变化分解；SPX 历史版本不可用、一个 VIX 版本含未来观察并拒绝，完整 PIT 尚未成立。
- **远端回执**：[PR #352](https://github.com/ctmaomao/gfrr-auto-update-site/pull/352) 已合并 `01a77891`，提交 `ad1b44e8` 的 CI `34730335762` 成功。新版真实影子运行 [34741965055](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34741965055) 成功：v2 cohort `pressure-shadow-a68f92b61895ef3b` 仅 1 条/1 个 distinct input、elapsedDays=0、benchmarkWeeks=0，所有门槛仍未通过；不借用 v1 旧两天。

### 2026-09-12 ACLED 自动准备 main 的发布入口

- **当前回执**：[PR #350](https://github.com/ctmaomao/gfrr-auto-update-site/pull/350) 已合并 `4fcfedbb`，提交 `698937b7` 的 CI `34654123831` 成功。本批配置已发布 `b06aaaf4`，World Order [34654473322](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34654473322) 成功；09-13 最新产物与双站复核确认六地区同窗、周截止 08-28、月 as-of 08-21。周来源 aging/partial 如实保留，不是本地配置未发布。原始 XLSX、备份、stash 和历史工作树未在本轮清理。

- **Acceptance baseline**：owner 要求改进 pull、monthly status、weekly status、publish 四条指令，使以后自动准确推送 main；实施新增显式入口 acled:publish:auto，继续使用原 main-only 发布器，不把功能分支合入 main。2026-09-12 owner 明确授权推送两项修复、创建 PR、进行一次独立 AI 审阅，在最终提交的 CI 和审阅通过后合并，再处理分支并发布本批 ACLED 数据；本次独立 AI 审阅替代人工仅适用于此 PR，不扩大付费 AI、其它数据刷新或删除范围。
- **实施**：只读预演；实际执行先取最新 origin/main，检查两边工作区/索引/历史，按允许路径备份并校验 ACLED 配置、保留 stash，安全释放其它干净工作树上的 main 并在当前目录快进，恢复配置原字节，再调用 main 的既有 status/发布器。保留其它工作目录、分支及 ignored XLSX；Git 公共目录锁阻止重复自动入口。无关改动、暂存、锁定/脏工作树、未推送 main、配置基线变化或未完成 Git 操作均停止，不强推或自动 rebase。
- **验证**：临时本地 Git 仓库的 20 项测试全部通过，覆盖功能分支未合并提交、main 占用、远端更新、配置/原始文件保留、仅调用 main 发布器、失败不发布、未上线入口拦截和 Windows CRLF；已接入既有 check:acled-operator-safety。check:changed 实际执行完整 check:all、git diff --check 均退出 0；只读预演回执见本任务结果。生产发布器/guard/checker 断言未放宽；本批用户配置不混入实现提交。

### 2026-09-12 ACLED 周度 CLI 测试夹具修复

- **Acceptance baseline**：owner 提供本地 weekly status 与 publish 失败日志；本轮修复已复现的测试数据问题，保留其新生成的六地区配置和原始 XLSX。后续明确集成、独立 AI 审阅与数据发布授权见上方自动入口记录，不沿用旧编辑层任务的授权。
- **根因与实施**：旧测试复制当前 operator 配置后只改顶层 latestWeek；重新标准化带有 common-week-grid-v1 证据时，窗口日期未同步，真实 checker 报 window version/date mismatch。测试改用独立合成配置，正常、过期及未来日期均带一致的十二周网格和源覆盖；追加真实 CLI 对日期不一致的拒绝与旧格式警告验证，保留六地区完整性、解析前拒绝和原字节保留检查。生产 checker、sanitizer、发布保护均未改动。
- **本地验证**：修复前复现同一错误；修复后 weekly aggregate 与四项测试通过，check:changed 实际执行完整 check:all 并退出 0，git diff --check 退出 0。用户配置 SHA-256 与修复前一致；生产 checker 与发布 guard 的 diff 为空。不以本地检查通过替代发布验收。
- **历史操作状态**：本条最初基于 `7dc7f80f`，当时用户配置未提交且 main 在另一工作树。该问题已由上项 #350 与 `b06aaaf4` 发布解决；不再按旧分支位置重复操作，未来发布仍须现场核对 main-only guard。

### 2026-09-11 额外一次 AI 恢复授权

- **Acceptance baseline**：owner 明确授权“今天针对本期输入，再做一次有界恢复：先审阅具体预算例外，再额外调用一次 DeepSeek”。执行 [ADR-0045](ADR/0045-editorial-single-recovery.md)：固定 Daily 时间及内容摘要、上海当日截止、手动 main 首次运行、原预算不动、独立一次性凭据；独立审阅与 CI 后才能调用。失败也不退款，不改变来源、输出、30 小时保护或评分。
- **交付边界**：本轮仅一个额外恢复机会，不扩大为自动重试或任意预算绕过；成功须检查产物、写入、Pages/EdgeOne 实际内容，失败如实报告并停止调用。

### 2026-09-11 AI 判读恢复与引用预算

- **Acceptance baseline**：owner 要求定位 AI 不可用、修复并手动跑一次；沿用本任务提交、推送、独立 AI 审阅和合并授权。单次 AI 调用已用于下列运行，不自动重试、不删除预算凭据。
- **上游恢复**：World Order 因 ACLED partial 来源证据遗漏停留旧快照，导致 AI admission 等待。既有 PR #345 已修复；本轮手动运行 `34567306501` 成功，提交 `0663b691`，无需重复修改。
- **调用结果**：手动 AI `34567451297` HTTP 200、finishReason=stop、一次调用/零重试，但唯一错误为 `output factual claim[15].sourceRefIds must be an array with length 1-12`，未写生产。脱敏产物未保留原始正文，不能确认具体为类型、空值或超量，也不得伪造修复后的正文。
- **修复范围**：提示词明确既有 1–12 项字符串数组约束、2–6 项建议预算及历史比较引用范围，超限须收窄论断而非裁掉证据；新增 null/空数组/字符串/13 项真实 adapter mock 回归。生产 validator、引用支撑、时效、单次调用和日预算均不变。修复减少同类生成错误，不保证随机模型永不违约；本期 AI 仍不可用，下一次真实调用须符合现有预算与独立恢复授权。

### 2026-09-11 当下压力模型研究与前瞻整改

- **Acceptance baseline**：owner 对七项模型风险授权全面整改，并明确主分目标为“当下市场与宏观压力”，预测与仓位分别验证；允许实施、推送、PR、CI 后集成及研究影子运行。本轮承接已完成的 `2a83f256` 实现修复，保持单一逻辑 PR，不堆叠分支。授权不等于验证通过，不按今天分数选择模型。
- **实施**：[ADR-0044](ADR/0044-contemporaneous-pressure-research.md) 与[研究报告](PRESSURE_MODEL_RESEARCH_2026_09_11.md)。七个固定候选、严格过去周校准、唯一输入归属、平滑尾部、缺失不打分、同窗旧模型对照与前瞻不可覆写 ledger；只读 Actions 每日采集，无付费/生产数据写入。原始来源缓存不上传，源码+协议 hash 隔离 cohort，失败 artifact 不覆盖成功 ledger。
- **研究结论**：371 个候选共同周，经同假定发布滞后的旧模型可用性筛选后有 360 个共同周、359 个参考配对周。候选与 STLFSI 更一致，但旧模型在 NFCI 部分指标更好；相关调整没有稳定胜过等权。不能宣称最佳或立即替换，继续前瞻记录；84 天/40 不同输入/12 参考周只是采集下限，仍需独立模型评审。七项线上模型风险尚不能宣布全部消除。
- **本地验收**：`npm run check:changed` 实际执行完整 `check:all`、557 项单元/覆盖率、12 项研究专项、`node --check scripts/app.js` 均退出 0；同批前端未再改动，沿用上项 22 项浏览器验收。独立 AI 最终复核通过研究/前瞻范围，独立注入错误观测和未来参照均拒绝。历史截止已冻结，旧模型前瞻键名统一为同滞后口径。既有 checker 断言、生产数值阈值及数据 diff 为空；远端 CI/合并/实际影子首轮仍待回执。

### 2026-09-11 主评分系统综合复核与输入保护

- **Acceptance baseline**：owner 要求再次综合检查主评分系统并修复问题与隐患，准确性优先。修复有证据的实现错误，开展当前规则重放与边界压力测试；不为改变当日分数任意调权重，不把公式一致作为预测校准，不手改生产数据或触发付费服务。本次尚无新的远端推送/合并授权。

- **后续授权**：owner 随后授权七项模型整改及远端集成，范围与验收条件见上方“当下压力模型研究与前瞻整改”。原本地验收记录保留，不把授权本身写成模型校准完成。
- **范围与实施**：[综合审计](SCORE_SYSTEM_AUDIT_2026_09_11.md) 和 [ADR-0043](ADR/0043-score-input-continuity.md)。配置消费、空值、时效、缓存原始日期、输入连续性、仓位目标、日历统计及冻结 fallback 的缺陷修复；已用证据丢失时 hold 发布并保留原快照时间。数值权重和尾部门槛不变，模型风险继续显性披露。DESIGN §2/3/4/5.3：沿用现有文本区域、字体/颜色/布局，未新增区块；仅缓存版本同步。
- **本地验收**：八个既有完整生产输出 fixture 保持一致；新增 18 项边界回归通过。`npm run check:changed` 实际执行完整 `check:all`、`npm run test:unit:coverage`（545 项）、`npm run test:e2e`（22 项）、`node --check scripts/app.js`、`git diff --check` 均退出 0。最终独立 AI 复核通过并独立执行 18 项专项；已修复其指出的派生输入丢失及 ON RRP 零分母迁移问题。原 checker/配置权重/阈值/生产数据/workflow diff 为空。公共历史审计退出 0、1,079 样本、六窗口 `pass_with_limitations`，明确不是预测或样本外证据。未推送或部署；模型校准隐患仍见报告，不能称为全部解决。

### 2026-09-11 World Order 的 ACLED 降级证据遗漏

- **Acceptance baseline**：owner 报告 `Refresh World Order Stress - main (cb3aed2)` 失败，延续故障检查与修复范围；修复已证实的证据遗漏，保留时效、同窗、评分和 checker 约束，不重跑取数或手改生产数据。
- **证据**：[失败运行 34548065660](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34548065660) 的生成和 `check:world-order` 成功；GDELT 为 ok、ACLED 为 partial，Commit 内完整检查报 `world_order_pressure_crossing missing source-status evidence: acled`，未提交新文件。前一次自然运行 34422897728 成功。失败候选 World Order 分为 61，属于未发布 overlay，不是主雷达分；无 artifact，不能恢复完整候选。旧发布 World Order 仍为 9 月 10 日 68。
- **根因与实施**：矩阵只处理 ACLED ok/manual_required/not_configured，漏掉合法 partial/error 及其它非正常状态。补齐缺失证据说明，非 ok 状态不进入支持证据；不放宽 `check-world-order-narrative-density.mjs`。本地真实 ACLED 只读 loader 返回 partial，旧周度汇总缺少六区域同窗证据；另覆盖时钟推进到偏旧的 partial 分支，不把两种原因混为一谈。复用 DESIGN §2/3/4/5.5 的现有交叉验证结构，未改变样式或布局。
- **本地验收**：新增 12 项回归在修复前 10 项失败、修复后全部通过，包含非正常/未知/缺失状态、健康分支、不可变输入和真实未修改 checker CLI。`npm run check:changed` 实际执行完整 `check:all`、527 项单元/覆盖率、22 项浏览器测试、`node --check scripts/app.js` 与 `git diff --check` 全部退出 0；独立 AI 审阅通过，原 checker 断言未改。两站实读仍为 9 月 10 日 `00:49:30.799Z`、World Order 68、历史 ACLED ok；本轮未推送或发布，修复上线及自然刷新成功前不声明恢复。
- **远端授权**：2026-09-11 owner 明确授权将此次修复推送、创建 PR，并在 CI 通过后合并到 main。实施提交 `51b0539e`，沿用已通过的独立 AI 复核；等待对应 CI、合并与部署回执。不额外手动刷新 World Order 或调用付费服务，数据刷新恢复仍以自然运行证据为准。

### 2026-09-11 主分跳升的输入、计算与展示复核

- **Acceptance baseline**：owner 要求分析并修复 48→68 跳分疑虑，准确性优先。本轮核实原输入、重放主计算并修复已证实的日历比较及展示口径错误；不为降低分数而改权重/尾部门槛，不手改生产 JSON 或额外付费刷新。
- **证据与结论**：[复核报告](SCORE_TRANSITION_2026_09_11.md)。旧发布 9 月 9 日为 45，当前 68=基础 53+尾部保底 15；实际输入回放完全一致，FRED 官方确认 9 月 9 日 Brent=109.51。历史索引把漏跑后的上一记录当 1 日、7 条当 7 日，需改为精确 UTC 日历日，缺失不补零。
- **实施**：新增日历比较纯函数，主计算公式不变；Hero/阈值不再把最终分称为原始分，并展示生产记录的基础分/尾部升档、独立 World Order 关系及 Brent 观测日。遵守 DESIGN §2/3/4/5.3，复用现有文本区域、字体和色彩；无新一级区块。
- **本地验收**：`npm run check:changed` 实际执行完整 `check:all`、`npm run test:unit:coverage`（515 项）、`npm run test:e2e`（22 项）、`node --check scripts/app.js` 与 `git diff --check` 均退出 0。独立 AI 最终审阅通过；生产计算回放、真实 validator 接受缺失比较值、桌面/手机展示及前后同输入截图已核对。既有 checker 断言未放宽。
- **远端授权与状态**：2026-09-11 owner 明确授权将本次修复推送、创建 PR，并在 CI 通过后合并到 main；沿用已完成的独立 AI 复核。本地修复提交 `5d8f0518`，生产数据未改；等待本次 PR 的 CI、合并与 Pages 发布回执。新日历比较值等待后续自然 Daily 生成，不额外触发付费刷新。

### 2026-09-11 重复 Actions 失败：旧 Macro Risk 判读过期隔离

- **Acceptance baseline**：owner 要求检查并修复今天的大量报错；本轮独立处理旧判读时效阻断普通检查，不追加付费刷新。独立 AI 验证沿用本任务要求；2026-09-11 owner 随后明确授权将本轮修复推送、创建 PR，并在 CI 通过后合并到 main。本轮远端集成回执单独记录，不把旧 PR #333 的合并结果当成本轮已发布。
- **证据**：最近窗口内 11 次 Thermal / Oil News / EdgeOne 失败均报 production layer/output timestamp stale，例如 [EdgeOne 34542189146](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34542189146)、[Thermal 34541033061](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34541033061)、[Oil News 34530501730](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34530501730)。另一次 Daily 34441694224 为 258 分钟输入过期，已有 #335 前置检查/免费恢复修复，仍待自然运行验收。
- **实施**：[ADR-0042](ADR/0042-editorial-retained-snapshot-expiry.md) 显式分离 retained snapshot 检查与新写入验收；仅两生成时钟均过期、原字节历史结构重验合格且实际前端隐藏时警告放行无关更新。严格 validator/live CLI/producer workflow 与 30 小时门不变；损坏、未来、混合时效、摘要/引用/边界失败仍拒绝。无生产数据或渲染代码修改。
- **本地验收**：`npm run check:changed` 执行完整 `check:all` 通过；最终 506 项单元/覆盖率、21 项过期专项及桌面 1440px/手机 390px 两项真实浏览器回归通过，退出码均为 0。独立 AI 审阅及测试夹具最终复核通过；严格 validator/writer/live CLI/producer workflow/renderer 的基线 diff 为空。验收时线上两域名仍为 9 月 9 日快照；本轮集成已获授权，等待远端 CI、合并和发布回执，不宣称线上恢复。

### 2026-09-10 长期自主运行与数据真实性整改

- **第八项实施 / ADR-0041**：GDELT Cloud事件总数不再复制到报道总数，query记录eventCount，去重报道数null；live/旧缓存/失败回退及cache artifact统一投影且保留原日期，真实零事件可复用缓存。ODP旧摘要展示仅用明确事件字段，缺失不转零、不把报道数当事件数。World Order校验器以明确countUnit分流：旧数字断言保留，新格式严格要求报道null和有效事件计数；真实CLI覆盖新旧通过与混用拒绝。见 [数量口径](ADR/0041-gdelt-event-and-article-units.md)，主评分/ODP方向不变；DESIGN §2/3/4/5现有位置/字体/配色不变。
- **第七项交付**：PR #341 已合并 `d7882056`，提交 `19b956cf`；本地完整检查、专项、最终独立审阅及 CI `34451345541` 通过。

- **第七项实施**：恢复生成按正常生成注入既有FRED secret，发布前使用同一check:realtime-local-schema；仍仅shouldRecover=true执行，保留原同窗writer并发、最近发布缓存和输出范围保护。离线验证两条路径顺序/条件及实际schema拒绝负Brent，不调用源。
- **第六项交付**：PR #340 已合并 `e988bf15`，提交 `5a6bdae5`；本地完整检查、5单元/3浏览器回归、最终独立审阅及 CI `34450656149` 通过。

- **第六项实施**：首页刊头/Hero按当前时间展示每日快照年龄，超过36小时（24小时周期+12小时排程恢复余量）显示更新延迟/历史快照；旧健康度明确为采集时记录。页面每分钟更新提示，时间异常不冒充新鲜；附录健康文案标明采集时。仅展示时效，不重算主分/决策；遵守 DESIGN §2/3/4/5.3，复用既有字体、颜色和版面，asset同步为 snapshot-age-1。
- **第五项交付**：PR #339 已合并 `43c8c7ff`，提交 `c644a4cf`；本地完整检查、专项、最终独立审阅及 CI `34449770394` 通过。

- **第五项实施 / ADR-0040**：六区域最晚共同截止周、连续 12 周及末 4 周用于全部汇总；缺周拒绝且保留旧文件，原来源范围保留。新增同窗证据结构校验；旧汇总保留为历史但排除周度指标/评分并明确降级，待原始六表重新标准化恢复。见 [同窗契约](ADR/0040-acled-common-week-window.md)。
- **第四项交付**：PR #338 已合并 `809e1776`，提交 `df9e6668`；本地完整检查、专项、最终独立审阅与 CI `34448923165` 通过。

- **第四项实施 / ADR-0039**：GDELT 保留原始权重，按 30 个真实历史日的固定中位参考尺度标准化，随后应用过期折扣；历史触顶恢复变化范围。新版 World Order 增加模型标识及不可跨版直接比较的警告，不宣称风险下降或预测准确性；主雷达公式不变。见 [模型依据](ADR/0039-gdelt-pressure-scale.md)。
- **第三项交付**：PR #337 已合并 `de184bd0`，提交 `e6b57f8a`；本地完整检查、最终 ACLED 专项、独立审阅及 CI `34447779490` 通过。

- **第三项实施 / ADR-0038**：ACLED 原始日期与数据保留，时间推移传递到 partial 状态、来源/证据置信度和警告；周度过期贡献按现行时效窗口衰减，失效贡献为零（排除证据，不代表和平）。World Order freshness bonus 仅对 ok 来源，整体置信度受可用来源比例封顶。默认 operator 检查仍拒绝过期输入；runtime 全套显式保留结构合格的历史文件，所有其它断言与原周/月回归保留，额外验证真实 scorer 的时间推进及未来/损坏拒绝。详见 [独立契约决策](ADR/0038-acled-runtime-freshness.md)；未改主雷达评分或抓取生产数据。
- **第二项交付**：PR #336 已合并 `d17f6da7`，提交 `5b704ffc`；两项专项、本地完整检查、最终独立审阅与 CI `34446541219` 通过。
- **第二项实施**：两条 realtime 写入流程在生成前共用 published-baseline loader，先 fetch realtime-data、固定提交，再加载该提交的原始缓存。输入不可读/结构异常/mock 时停止，不使用 checkout main 中的旧文件；保留 payload 和各叶子观察日期，既有信任/降级逻辑不变。恢复无需生成时不额外 fetch。离线覆盖新缓存覆盖旧文件、固定 SHA、防时间洗新、失败不覆盖和两条调用路径。
- **第一项交付**：PR #335 已合并 `8e792e6a`，提交 `2a6b10d0`；本地完整检查及最终四项专项、独立审阅、CI `34445834938` 通过。自然 Daily 运行仍待验收，不重复付费触发。
- **Acceptance baseline**：owner 明确授权完成本轮八项问题及相应 commit+push、PR、合并；沿用每项一次有界独立 AI 替代审阅，serial trunk、每项合并后才开始下一项。顺序：Daily 前置时效/恢复；realtime 最近成功缓存；ACLED 时效降级；GDELT 饱和/过期衰减；ACLED 同窗覆盖；首页快照时效；恢复路径校验一致性；事件/报道口径。评分与 checker 契约变更须独立 ADR/审阅，不通过弱化断言获得绿灯。
- **范围**：不额外手动付费刷新，不自动接入新数据服务、不恢复 ACLED 自动抓取、不更改主评分公式。独立交付监控、准确性评价与来源自动化边界的后续有界方案见 [验收计划](AUTONOMY_ACCEPTANCE_PLAN.md)，尚未部署新监控或验证长期指标；自然运行证据未取得时不得宣称长期无人值守验收完成。
- **第一项实施**：Daily 在可能付费的生成前，以既有 90 分钟输入窗口和信任门检查 realtime；不可用只 dispatch 一次既有免费 Build Realtime Market，并有界轮询新结果，失败中止本次 Daily。有效个别缺失叶子仍交既有 Wind invalid-leaf 策略，不制造完整替代 payload；固定所消费提交并保留输出校验。正常取数和原 workflow checker 均保留。新增四项离线回归覆盖初始取数失败可恢复、正常跳过、恢复成功、过期/未来/不可信拒绝、恢复失败及次数上限。

### 2026-09-10 恢复验收与交接同步

- **Acceptance baseline**：owner 要求完成 Daily 恢复验收、GDELT 冷却后自然请求验收、过期交接同步三项，明确授权本任务 commit+push、PR 与合并；沿用一次有界独立 AI 替代人工审阅。执行前已说明 Daily 启用既有 Wind fallback 且可能进入 Macro Risk 准入，本轮仅触发一次手动 Daily；不追加付费重跑，不提前请求 GDELT，不放宽时效或评分契约。
- **Daily 验收未完成**：[PR #333](https://github.com/ctmaomao/gfrr-auto-update-site/pull/333) 已合并为 `b06ef832`。手动 Daily [34441694224](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34441694224) 未再触发 PortWatch 比率错误，但在 Validate output 被 `dailyRealtimeInput live payload is stale: 258 minutes` 拦截，没有提交新 radar；消费的 realtime commit 为 `7f58847c`、时间 `2026-09-10T01:18:16.882Z`。这证明原错误未复现，不代表完整恢复；本次应先检查输入时效再触发 Daily。
- **输入恢复**：随后一次不启用 Wind/AI 的 Build Realtime Market [34442028076](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34442028076) 生成、校验、推送成功；`realtime-data` commit `46609c7e` 的 `updatedAt=2026-09-10T05:40:49.84Z`、`sourceMode=live`、`healthScore=100`，读取时年龄 0.5 分钟。此前 build/recover 均数小时没有新 schedule run，但最近 run 成功、workflow active，排程间隔原因尚未确认；当前 Actions operational 不能证明此前没有延迟。输入恢复仍不等于 Daily/页面恢复，等待后续自然 Daily 的完整校验、提交和线上验收。
- **GDELT 等待自然证据**：旧失败 `latestAttemptAt=2026-09-09T16:51:56.689Z`，24 小时冷却至北京时间 9 月 11 日 00:51:56。冷却缓存中的 `after 2 attempt(s)` 不能判为新代码回归；首次预计可请求的自然 news 排程为北京时间 9 月 11 日 02:37，实际执行可能延迟。验收须有更新的 attempt 时间；若新请求仍为 429，核对仅一次请求、零重试及冷却，同时检查 Tavily/Brave 隔离。只有 cooldown cache hit 不能关闭此项。
- **后续跟进**：已在本任务设置 `Daily 与 GDELT 自然恢复验收` 跟进（`gdelt`），北京时间每日 07:15 仅查看两类工作流各最近两次自然运行及对应发布证据；不 dispatch、重跑或调用 provider，状态不变保持安静，全部取证完成后暂停。本轮一次手动 Daily 已用完，按 [Operations 单次运行边界](OPERATIONS.md) 等待自然排程；不因文档合并关闭两项运行验收。
- **既有修复交付状态**：已核对 #330 / #331 / #332 / #333 均为 MERGED，merge commit 分别为 `7e9d7891` / `d03514ac` / `275af3be` / `b06ef832`。下方原实施记录保留，旧交接中的待推送、待审阅、待合并不再是当前任务。

### 2026-09-10 Daily PortWatch 比率越界隔离

- **Acceptance baseline（原实施阶段）**：owner 要求检查新报错并修复项目问题；原修复基于 `28470827`，同步至 `f3e545c2`；当时授权独立 AI 验证、通过后远端推送及创建 PR，未包括合并或付费刷新。只修复既有 PortWatch 契约的采集隔离，不放宽 validator、不改评分公式/源/生产 JSON。后续本任务合并及一次刷新授权与实际结果以上方恢复验收记录为准。
- **故障证据**：Daily [34421206990](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34421206990)（事件 SHA `d03514ac`）生成成功后，`hormuz.capacityTankerVs30dPct=2.0893` 超过既有 decimal-ratio `[-2,2]` 契约，校验阻止提交。该比率可能是真实极端变化，不宣称上游错误；失败 run 没有 artifact，未保存原始 AIS 历史。两站实读仍为 9 月 9 日 `00:25:44.247Z` 的同一旧 Daily；其它 Pages 成功不代表 Daily 恢复。
- **实施**：全部八个 chokepoint 的 count/capacity 比率在候选派生前检查，超出契约由原 resolver 捕获。仅沿用未超出 21 天展示缓存期限且比率合格的旧摘要，明确 fallback 并保留观测日期；无缓存/malformed 比率缓存返回 missing，过期仍 stale。fallback/missing/stale 的运输主分贡献为 0；7 天入分 gate 与最多 +3 不变。不截断为 +200%、不伪造 0、不重复请求；`fetchReason` 记录固定字段级原因。
- **验证与交付**：新增 9 项离线真实 resolver 回归覆盖 `2.0893`、八咽喉两字段、边界/真实零/零分母、旧缓存保留/污染/过期及 fail-closed 入分，接入原 expanded ingestion 全套入口；`npm run check:changed` 实际选择完整 `check:all`、`git diff --check` 均退出 0。另在内存中将同一越界输入的 fallback/missing 结果交给未修改的完整生产 validator，两者均退出 0、运输贡献为 0，无生产文件写入。PR #333 已合并；线上恢复仍以上方最新运行证据为准。

### 2026-09-10 历史审计判定完整性

- **Acceptance baseline**：owner 要求按复查建议合并修复事件样本不足仍通过、未评价与评分失败混淆；沿用本轮 commit+push、PR、一次有界独立 AI 替代审阅及合并授权。最终 head 审阅和 CI 通过后合并并验收自然 Pages，不调用真实源或付费服务。
- **实施**：事件门槛要求完整窗口及原评价周网格的 100% 有效评分点，去重、无效/网格外评分不计覆盖；明确 passed/score_failed/not_evaluated/partial_window/insufficient_coverage。failedEvents 只列评分失败，unpassedEvents 保留全部未通过项；整体 verdict 与 Wind 自动/原始回放共用覆盖逻辑，局部或稀疏结果不能晋升为完整验收通过。原分数阈值、eventWindowsMustPass 和生产路径不变；7 项专项及 check:changed → check:all 全部退出 0，既有 checker 未放宽。

### 2026-09-10 历史回测输入修复

- **Acceptance baseline**：owner 授权依次修复历史值过期、查询预热窗口、默认值披露，每项验证后 commit+push；授权本任务 PR 及合并，并明确允许一次有界独立 AI 审阅替代人工。最终 head 审阅与 CI 通过后合并并验收自然 Pages；不调用真实源、付费 provider 或改生产评分/数据。
- **第三项**：历史报告逐项披露 observationDate/ageDays/status 及 effectiveValue/valueOrigin/effectiveSourceKey/effectiveObservationDate；默认值、代理值和场景覆盖不冒充原始观察，原始缺失清单完整列出。inputCoverage 记录被排除日期、必需输入缺口与原因。21 项专项及 check:changed → check:all 退出 0；覆盖率 99.85% / 93.44% / 97.96%，单元 445 pass / 0 fail / 1 既有样本缺失 skip。
- **第二项**：API 查询及 CSV 保留窗口统一提前 42 日（28 日变化 + 最长 14 日年龄容差），评价日期仍严格从原 startDate 开始；报告新增 inputWindow。离线 API/CSV 同窗测试恢复起日 Brent +25%、RRP -50%、WALCL -12.5% 和曲线陡峭化，不增加评价样本；专项 5 项及 check:changed → check:all 退出 0。
- **第一项**：audit-only 日频序列最多沿用 7 个日历日，周频 WALCL 最多 14 日；容纳周末/节假日与一次缺周，不代表生产 freshness 或发布时间有效性。当前值、变化基准和冲突回放均用同一年龄闸门，过期必需输入跳过该评价日，过期可选输入保留缺失。18 项评分/历史专项及 check:changed → check:all 全部退出 0。

### 2026-09-10 节制体检整改

- **PR #330 单次审阅授权**：owner 明确要求先合并本 PR，并允许一次有界的独立 AI 审阅替代人工；仅在最终 head 审阅通过和 CI 通过后合并，适用范围仅 PR #330。复查发现的历史值过期、起点预热数据和默认值披露另行处理，本次不混入修复；不降低审阅阻断标准，不扩展付费或源刷新权限。

- **Acceptance baseline**：owner 授权按顺序处理四项体检问题及重复实现精简，每项检查通过后 commit+push；授权本任务 PR 审阅与合并。沿用独立人工 review 和生产验收要求；不启动深度扫描或多轮代理，不触发真实源刷新、付费调用或 Worker 部署。
- **顺序**：①回测复用生产评分函数并删除重复公式，披露历史输入缺口；②核实 GDELT 调用频率、减少限流下的无效请求并保留降级；③区分历史重演与样本外验证，增加时间隔离保障；④为评分和最终写入补充行为覆盖，保持原门槛。
- **第四项实施**：补充最终写入 43 项 envelope/篡改/边界/不变性回归，保留并复用既有完整输出与 writer 正负向用例；补评分缺失/覆盖输入及运输阈值、封顶、失效闸门矩阵。覆盖率范围 9→12 个模块，原 95/90/95 门槛不变；删除回测遗留未使用函数及重复查找。专项 61 项通过；check:changed → check:all 退出 0。指定模块覆盖率 lines 99.85% / branches 93.18% / functions 97.80%，单元 441 pass / 0 fail / 1 既有原始样本缺失 skip。
- **第三项实施**：历史回测报告增加规则摘要、校准截止日前后样本计数和明确的 retrospective/非预测状态；严格预测验证请求在网络和写入前拒绝。历史日期真实校验、缺失值不转零、观察值排序均有离线回归；真实 vintage 与冻结样本外数据尚未提供，不宣称预测验收完成。4 项专项测试及 check:changed → check:all 退出 0。
- **第二项实施**：已核对 6h workflow、24h fresh/error cooldown 和 72h stale fallback；限流源于 upstream 429，其他新闻源仍可用。仅 Oil News 禁止 429 的秒级重试，保留其他临时错误的一次重试及既有来源隔离。4 项 mock 回归验证实际调用者一次请求、冷却落盘与再次调用零请求；未调用真实源，check:changed → check:all 退出 0，既有断言未放宽。
- **第一项实施**：生产 deriveRisk 仅增加导出和默认规则参数，计算公式不变；回测删除重复校准、尾部闸门和评分公式，复用生产函数。历史适配补齐 Brent 前一观察值变化、曲线陡峭化与 RRP 周变化；运输候选缺失保持 0 并显式披露，FRED spot/BAA 代理不冒充实时输入。8 组旧生产完整输出摘要与历史适配/未来值不干扰等 11 项测试通过；check:changed → check:all 退出 0，既有断言未放宽。

### 2026-09-09 全项目审计整改（逐步提交）

- **本次集成授权**：owner 明确要求同步最新 main、处理冲突、检查、PR/审阅并最终合并。owner 随后明确批准仅 PR #329 以独立 AI 审阅替代人工；仅在最终提交的独立审阅和 CI 通过后执行合并及自然触发的 Pages/EdgeOne 验收，不扩展到其它 PR。此前只推送的范围限制由本次合并授权替代，真实付费、源刷新与 Worker 部署仍未授权。合并 b06a1781 时保留 ACLED 周/月保护、配置与生产产物；本任务 ADR 顺延为 0035/0036/0037，文档索引和 Backlog 双方内容均保留。整合后 check:changed → check:all、node --check scripts/app.js、单元覆盖率门槛及 diff 检查通过；单元 376 pass / 0 fail / 1 既有样本缺失 skip，桌面/手机浏览器 13/13。

- **第五步**：Daily 规则解释与 Bubble Watch HTML/SEP 解析抽离为纯函数，生成时间由 Daily 显式传入；抓取、打分、写入及失败语义保持原实现。9 组固定输入的旧输出摘要、HTML/SEP 正负向回归已纳入 check:all；旧源码逐段等价核对及现有 radar 数据输出逐字节比较通过。check:changed → check:all、单元覆盖率门槛和 diff 检查均退出 0；单元 366 pass / 1 既有本地原始样本缺失 skip / 0 fail。只新增验证入口，未放宽断言、增加 ignore 或改动生产数据。
- **Acceptance baseline**：owner 要求按审计建议顺序逐项实施，每一步必要验证通过后 commit+push，再进入下一步。从 latest main 建立独立整改分支，保留原工作区 ACLED 改动；本轮推送功能分支，不包含合并、生产刷新、付费调用或 Worker 部署。
- **顺序与验收**：①缺失值/市场输入可信性/首页加载修复及负向回归；②Node 24 补丁升级、实际运行版本门槛及 Playwright 常规升级；③AI 最终写入复验、实际 commit 溯源及既有网络请求超时/脱敏；④检查去重与当前运维入口整理；⑤Daily/Bubble Watch 纯函数渐进抽离及行为等价验证。每步运行 check:changed（代码变更触发完整套件），按范围补单元或浏览器检查。
- **第四步**：两项 GDELT 检查移除 check:all 顶层重复调用，仍经 oil-directional 完整执行；展开 npm 调用 226→218、唯一检查集合无损失。P63 改验完整传递路径，独立检查器审阅见 [ADR-0037](ADR/0037-check-suite-deduplication.md)。README 收拢日常命令，Operations 明确静态首页/Worker/历史路径与 ignored 产物副作用，不删除历史文件。验证：调用图回归、P63 原行为检查、当前文档链接/契约及 check:changed → check:all 全部退出 0；没有丢失检查、新增 ignore 或生产改动。
- **第三步**：Macro Risk writer 强制原始 compact input、双摘要/完整输出/质量审阅/来源账本复验，实际 checkout SHA 溯源；Worker 固定镜像 4 秒请求/body deadline，手动 GDELT 诊断有界且仅输出状态/计数。见 [ADR-0036](ADR/0036-final-editorial-write-revalidation.md)。验证：10 项最终 writer 负向案例、Worker 成功/失败/请求与正文超时、诊断脱敏与 CLI 回归通过；check:changed → check:all、单元覆盖率门槛及 diff 检查均退出 0。既有 assertion 未删除/放宽，无新 ignore；未执行真实 provider、诊断 dispatch 或 Worker 部署。
- **第二步**：本机 nvm 已安装并切换 Node 24.20.0（npm 11.19.0），保留旧版本；项目声明与实际 runtime 门槛收紧为 >=24.20.0 <25，Playwright 固定升级 1.63.0，SheetJS 保留官方 0.20.3。断言精确版本调整与原因见 [ADR-0035](ADR/0035-runtime-security-patch-baseline.md)。验证：check:changed → check:all、依赖 audit（0 已知漏洞）、单元覆盖率门槛及浏览器 13/13 均退出 0；无生产依赖或部署。
- **第一步**：World Order 缺失值不再转 0；Worker 时间复用 5 分钟未来容差，本地 realtime 复用可信性门与 90 分钟 fresh/aging 上限。首页主数据就绪先渲染、附属 JSON 8 秒请求/body deadline 后独立降级。遵守 DESIGN §2/3/4/5.4，布局、颜色、字体、IA 和折叠契约不变。验证：check:changed → check:all、node --check scripts/app.js 均退出 0；单元 355 pass / 1 本地原始样本缺失 skip / 0 fail，覆盖率门槛通过；浏览器 13/13 通过。原 checker 断言未删减，未新增 ignore；生产 JSON、workflow、原工作区配置不变。


### 2026-09-09 ACLED 周度测试发布兼容修复

- #326 精确 PR CI 通过后，Pages `34313341031` 在新增 CLI 用例失败：Pages 不执行 npm ci，而测试间接要求 XLSX devDependency。生产数据与 guard 未受损，部署未发布。
- #327 已合并 `e7082031`；修复测试 fixture：OS 临时目录、明确的 parser stub、任何 workbook read 都失败；继续跑真实 CLI 的无输入与缺地区覆盖保护，不 skip、不改生产依赖/checker/workflow。按 [ADR-0033 补充](ADR/0033-acled-weekly-completeness.md#deployment-regression-correction)在无 node_modules 的工作树完整验证通过，CI `34314059959` 和[独立审阅](https://github.com/ctmaomao/gfrr-auto-update-site/pull/327#issuecomment-5596203925)通过。Pages 恢复验收 run `34314283618`，不运行源刷新或付费 AI。

### 2026-09-09 ACLED 完整性与口径复核

- **Acceptance baseline**：owner 今日确认部分官网周表仍截止 8 月 14 日，授权按建议完成本地遗留配置备份对齐、六地区覆盖保护、月度比较口径复核；沿用逐项 commit+push、独立 AI 审阅和合并授权。不改变真实来源日期、源许可、评分、观察期或付费门槛。
- **本地对齐已完成**：两份旧配置 SHA-256 备份验证后安全快进至 `0f6e9bc4`。月表仅 preparedAt 不同；旧四地区周表不是待发布更新，已与已发布六地区版本对齐。备份保留在 ignored `manual-artifacts/acled-reconcile-20260909-044904/`，原始 XLSX 未改。
- **周度保护已合并**：[ADR-0033](ADR/0033-acled-weekly-completeness.md)；#326 合并 `16b24f99`，最终 `8cbe266e` 本地完整检查、CI `34313155765` 与[独立审阅](https://github.com/ctmaomao/gfrr-auto-update-site/pull/326#issuecomment-5596095328)通过。缺地区在解析/写入前失败，两数组严格六地区且唯一；保留 8/14 与 8/28 错峰日期和浏览器后缀，原始 XLSX 未改。
- **月度口径实施**：[ADR-0034](ADR/0034-acled-complete-month-windows.md)；一律排除 as-of 所在月（包括月末），比较连续完整 12 月与此前 12 月，缺任何月份整体不可得，不补零/借位。原六文件只读重算，独立核对 227740 / 219054 得 0.039652；日期、年度指标与排名不变。完整检查、独立审阅及合并后 World Order 双站发布按精确 PR 回执验收，不额外触发付费 AI。

### 2026-09-09 Macro Risk 上游衔接与付费去重

- **Acceptance baseline**：owner 批准一次现有刷新，随后要求判读与上游完成事件衔接并防止重复付费，减少空档；沿用本任务 commit+push、独立 AI 审阅及合并授权。来源、质量、30 小时时效及主评分隔离不变，不授权失败后的第二次付费重跑。
- **已恢复**：run `34305832339` 单次 DeepSeek 成功、retry=0、31 来源；只写编辑层，data commit `1cc123d1`。Pages `34305911160` / EdgeOne `34305985797` 成功；两站实读 `status=valid`、`displayEnabled=true`，生成 03:07 UTC，与今日 00:25 UTC Daily 时间戳一致。
- **实施**：[ADR-0032](ADR/0032-macro-editorial-upstream-admission.md)；去掉独立 cron，监听三项上游完成并核对当前就绪；discovery 前创建持久日/输入预算 refs，重复、失败、rerun、未知状态均不再付费。补 EdgeOne 的判读完成发布触发；不恢复旧 AI、不改变 Daily 构建、评分或前端兜底。
- **验证/限制**：离线并发/partial reservation/手动与自动重复/上游不齐等回归及完整检查、精确 CI、独立审阅按 PR 回执；真实新完成事件和 Actions token 预算创建仍须下一合格自然周期验收。当前一次恢复不是新触发链已经自然运行的证据，不额外付费制造验收。

### 2026-09-09 World Order 当前快照解读修复

- **Acceptance baseline**：owner 明确授权按顺序完成 World Order 展示修复、刷新/发布实际结果验收、FIRMS 晋升后质量复核及 ACLED 联系状态同步；每项必要验证后单独 commit+push、独立 AI 审阅通过后合并。本项只改展示，不动评分/权重、来源、付费、观察门槛或生产数据。
- **实施**：修复固定升档、部分确认写成已确认、混合频率写成近 30 天、来源健康度冒充市场确认等问题；读取当前市场 state、ACLED 周/月日期与时效、各维度 evidence 来源。无历史比较不声称变化；缺失/再次渲染清除旧值与风险色。保留 DESIGN §2/3/4/5.4 的纸色、字体、IA 和默认折叠，无 CSS 变更。
- **验证与下一步**：#322 已合并 `54cad6f7`；两项独立审阅 P2（空置信度隐式零、当前分数枚举冒充时间趋势）已修复，最终 `ce0625af` 精确 CI `34303772839`、本地完整检查及桌面/390px 验收通过，[独立回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/322#issuecomment-5594930683)。与并行 ACLED 发布仅发生 backlog 插入冲突，已保留双方记录；相对 main 无数据/config/workflow 变更。双发布 readback 见本轮回执；不触发 Daily、付费或源抓取。

### 2026-09-09 ACLED 手工数据发布

- **Acceptance baseline**：owner 要求更新本地已下载周度/月度 xlsx 并发布 GitHub；使用独立 main worktree，保留原工作区改动和原始文件。周度副本仅移除重复下载后缀，恢复全部六区域。
- **输入范围**：周度 Africa / Middle-East / Latin-America 截止 2026-08-28，其余三区仍为 2026-08-14；月度六文件截止 2026-08-21。不自动下载，不声称所有区域同日最新。
- **验收**：发布前 check:changed / 完整检查，随后现行 main-only 发布与 World Order Actions、main 产物、GitHub Pages 核验；精确运行回执见本次任务回复。


以下各阶段的验收基线按当时范围保留；已合并阶段中的旧“下一步”、单次批准及 MCP 故障不是当前待执行指令。当前交付/等待以本节最新结论和末尾 Session Handoff 为准，不因归档或检查通过而自动晋升数据。

### 2026-09-08 StockQ / 运输免费来源复核

- **Acceptance baseline**：沿用本轮逐项实施/验证/commit+push、独立 AI 审阅后合并授权；本项只做来源评审和真实基线核对，不购买、发信或新增 runtime。
- **已完成**：[免费替代源当前结论](TRANSPORT_SHOCK_FREE_FREIGHT_ALTERNATIVE_SOURCE_REVIEW.md#2026-09-08-免费替代源复核结论)。核对 Baltic/CME/Solactive 权利、NOAA 时效与覆盖、Panama 统计语义、StockQ 公开入口；没有确认兼具免费、自动/公开使用权利、时效与口径等价的通道。已提交 shipping 数据的 BDTI/BCTI 为 8 月 10 日 fallback、BDI 缺失，不冒充已恢复。
- **保留与解锁**：现行 PortWatch free proxy 及 P50/P51 最大 +3、默认 0 不变；路线/市场确认仍未接入，不删除既有 StockQ。需要具体资源许可和合格数据口径才能做新读取器；不以镜像、延迟报价或滞后美国 AIS 越过门槛。本项调查结束，等价来源接入仍未完成。

### 2026-09-08 新闻原文时间离线证据复核

- **Acceptance baseline**：沿用本轮连续实施、每项独立 commit+push、AI 独立审阅通过后合并授权；基于 #317 合并 `e7a70307`，不借此批准新发布者抓取、付费或生产切源。
- **已核实/实施**：[离线证据契约](OIL_NEWS_PUBLICATION_EVIDENCE_REVIEW.md)。自然 run `34189473112` 已生成 v5；38 条 TOC 可比较但原文时间缺失、同方向支持候选为 0。新增有界 stdin/stdout 复核器，核对精确文章身份、发布时间/其它时钟、冲突、回溯及错误脱敏；全部质量/生产资格固定 false，不改分类器、telemetry 或旧 cohort。
- **验证/下一步**：#318 已独立 AI 审阅并合并 `88e68caa`，新增 14 项回归和本地完整检查通过，CI `34219176654`、Pages `34219612651` 成功。原文证据包、具体合法读取通道和时间语义仍缺失；不制造正例、不补写旧观察期，保留 30 天/120 样本和全候选分母。当前离线工具交付完成，自动 resolver/质量晋升未完成。

### 2026-09-08 连续完善授权与 ARR 事实复核

- **Acceptance baseline**：owner 明确授权依次完成 ARR 事实/方法、新闻原文时间依据、ACLED 授权回复、运输免费来源及相应文档同步；每项验证后独立 commit+push，独立 AI 审阅通过后合并。保持 latest main / serial trunk；不扩大第三方源权利、付费临执行确认、真实观察/质量门槛或实质生产验收。
- **ARR 已完成的证据工作**：[18 行逐项判定与七篇原始公告复核](ARR_EPOCH_SOURCE_REVIEW.md#当前结论2026-09-08-逐条证据复核)。10:46 UTC 官方 CSV 单 GET，40,898 bytes / 67 行，hash 与之前相同；没有原文落盘或生产写入。5 月 15 日明确是插值，最新 7 月末仅给时间上界，金额含下限/近似，不能构成可靠四点斜率；保留当前方法与 45 天底层 freshness，不切生产。
- **本轮收敛**：ARR 逐项复核 #317、新闻离线复核 #318、ACLED 联系状态 #319、运输来源结论 #320 已各自验证、commit+push、独立 AI 审阅并合并；当前仅同步交接。没有待实施的已明确可行生产切源；解锁需要真实数据/许可/观测证据，不继续制造通用抓取器或改低门槛。真实周一 artifact 验收沿用已创建的 `arr` 应用任务，不重复创建，不以 mock 或手动刷新代替。

### 2026-09-08 ARR Epoch 周一候选接入（已合并 #316）

- **Acceptance baseline**：owner 明确要求“先独立审阅并合并 #315，再接入周一候选更新”；沿用每项 commit+push。#315 精确 head `37a660e7` 独立 AI 审阅通过，原 Linux crash 测试目录枚举顺序问题已修复，CI `34212973146` 全部成功；合并 `d3568a8f`，[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/315#issuecomment-5583317287)，Pages `34213453513` 成功。该单次 AI 合并例外不扩展到本刀。
- **实施**：[周一候选接入](ARR_EPOCH_SOURCE_REVIEW.md#2026-09-08-周一候选接入)。复用既有 Monday schedule，隔离只读 candidate job，首次 schedule run 才读取；固定官方 CSV 一次、hash-only artifact 30 天、同 workflow 成功 main 历史有界选择与完整取回校验、修订 Summary。无新 cron/生产值/评分/付费凭证或人工 dispatch；候选收集失败警告且不上传，不阻断现有 refresh。checkout/setup/upload 平台故障仍 hard fail，可能 hold 后续编辑层；不放宽原 workflow checker。
- **验证**：#316 精确 head `579c88d8` 经该 PR 专属独立 AI 审阅，CI `34214841758` 全部通过，合并 `8408f647`，Pages `34215725692` 成功；[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/316#issuecomment-5583728779)。离线回归覆盖 mock 跨 run、历史缺失/过期/修订、失败无上传、身份/权限/令牌隔离及有界超时。本轮 MCP 查询可用，coverage 提示 metadata_changed 的文件已直接回读，未改配置。
- **下一步/限制**：实现已合并部署，真实 scheduled 上传/后续跨 run 下载尚未发生。最近已完成周一 run `34111922834` 是 9 月 7 日、早于合并，不能用它验收新 job。首个预期周期为 9 月 14 日，下一周期 9 月 21 日（须实际成功，不保证日历到期即完成）；既有 `arr` 验收任务负责核对，需本地应用/电脑可运行。首次可能 baseline_required；跨运行即使同 hash 也应如实验收无变化，不能伪称发生真实修订。收入事实、日期精度、45 天底层时效及生产切源仍未通过。

### 2026-09-08 ARR Epoch 跨运行产物交接（已合并 #315）

- **Acceptance baseline**：owner 对跨运行留存/取回校验、再独立审阅低频更新、最后生产方法审阅的顺序回复“请开始，每完成一步就commit+push”。本刀基于 latest main `f72911b4`；#314 已获其专属独立 AI 审阅通过并合并，[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/314#issuecomment-5582444449)，Pages `34208909617` 成功。本刀提交/推送，不沿用 #314 例外合并新 PR。
- **实施**：[跨运行交接工具](ARR_EPOCH_SOURCE_REVIEW.md#2026-09-08-跨运行产物交接工具)。hash-only 打包、30 天历史上限、显式 run/artifact ID、固定 GitHub 仓库/工作流、成功 main 首次运行与 main 祖先核对、ZIP digest/单文件格式/内部生产者绑定；默认离线，仅显式 opt-in 才最多 5 GET/15 秒、零重试，签名存储跳转不携带 GitHub token。无上传、生产写入、基线指针或调度。
- **验证**：新增 14 项交接 synthetic 测试与 3 项归档真实子进程争用/写入故障/中断测试；只读核实官方 REST 契约及现有 workflow 身份，不将 mocked 下载称为真实跨 run 验收。完整检查和实际 commit/push 以本轮回执为准。MCP 仍 Transport closed，直接源码回读；没有另行修改本机配置。
- **下一步/限制**：新 PR 独立审阅后，才接入既有周一 candidate job，明确 artifact 上传、保留和历史选择的实际运行授权；目前没有真实候选 artifact 被本工具上传/下载，不能称全自动链路已上线。收入口径/日期精度/生产切源及付费保障继续保留。

### 2026-09-08 ARR Epoch 本地候选快照归档（已合并 #314）

- **Acceptance baseline**：owner 明确批准仅 #313 独立 AI 替代人工、通过后合并并继续下一刀。固定 `69dcdace` 独立评估无阻断、精确 CI `34205620671` 成功；08:53 UTC 合并 `3fd7f151`，[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/313#issuecomment-5582128852)。本刀基于该 latest main 单项 commit+push，不沿用 #313 例外合并本 PR。
- **实施**：[本地候选归档及调度方案](ARR_EPOCH_SOURCE_REVIEW.md#2026-09-08-本地候选快照归档)。固定 ignored 路径、默认 dry-run、显式 write、hash 命名、只新增不覆盖；锁/临时文件发布、旧文件身份校验、指定旧 hash 比较、128份/2 MiB 上限和损坏现场保留。不联网，不写 approved/latest 基线，不改生产或调度。
- **验证边界**：10 项 synthetic 回归，写入与 CLI 在独立临时目录，不改变用户 ignored 档案；没有新增真实下载/候选落盘。完整检查及实际提交/推送以本轮回执为准；MCP 仍 Transport closed，源码回读。
- **下一步**：独立审阅归档实现后，按现有周一 Bubble Watch 周期设计 candidate job 的跨 run artifact 留存和只读来源验证；不新建独立 cron、不借生产刷新测试，不因归档或 CI 通过而晋升经济口径/日期精度/评分。

### 2026-09-08 ARR Epoch 有界读取与跨快照比较（已合并 #313）

- **Acceptance baseline**：owner 明确批准仅 #312 由独立 AI 替代人工，通过后合并并继续本刀。固定 `ec1fcf3c` 复审 P2 已关闭、无阻断，CI `34204107683` 成功；08:27 UTC 合并 `15eb5e4d`，[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/312#issuecomment-5581783690)，Pages `34204613602` 成功。本刀基于 latest main 单项 commit+push，不沿用 #312 例外合并本 PR。
- **实施**：[固定官方读取器与 hash-only 快照比较](ARR_EPOCH_SOURCE_REVIEW.md#2026-09-08-有界读取与跨快照比较)。默认离线，opt-in 才单 GET/15 秒/1 MiB/无重定向/无凭证/无重试；旧快照严格校验，比较新增/删除/修订/多义键/重复次数，旧期更正也检测。同 hash 不刷新观测时间；不写基线、curated、生产 JSON，不启动调度或改评分。
- **真实验收**：08:33 UTC 单次响应 40,898 bytes/67 行/18 条目标候选，hash 与 06:41 回执相同，无原文落盘或基线更新；不能称为真实跨版本修订回放。新增 15 项 synthetic 测试含请求/body deadline、源目标、隐私、历史修订、CLI dry-run；最终检查/commit/push 以回执为准。
- **后续门槛**：本实现先独立审阅，再决定候选快照持久化和低频调度；逐条口径/日期精度/金额限定、生产方法与切源继续另审。本轮 MCP 仍 Transport closed，源码回读。

### 2026-09-08 ARR Epoch 离线候选 sanitizer（已合并 #312）

- **Acceptance baseline**：owner 对“仅此次 #311 由独立 AI 替代人工、通过后合并并继续校验器/测试/commit+push”回复批准。固定 head `1fe16579` 独立审阅无阻断，精确 CI `34196276865` 成功，09-08 07:42 UTC 合并为 `709b234f`；[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/311#issuecomment-5581217720)。基于该 latest main 开单项实施分支，不沿用 #311 例外合并本 PR。
- **实施范围**：18 列严格有界 CSV、公司/产品与 run-rate/ARR/期间金额分离、未知精度与金额限定 hold、45 天行日期诊断、脱敏 hash、重复及冲突修订；stdin/stdout only，所有候选 productionEligible=false，无网络、评分、writer、调度或生产数据改动。[契约及用法](ARR_EPOCH_SOURCE_REVIEW.md#2026-09-08-离线候选-sanitizer-实施)。
- **验证**：15 项 synthetic 回归含 CLI dry-run 已通过；纳入既有 Bubble Watch 完整检查，不用合成样本冒充真实 CSV 回放。最终完整检查及提交/推送以本轮回执为准；MCP 调用仍 Transport closed，源码回读。
- **后续边界**：先独立审阅本实施 PR；固定官方有界读取器、跨快照差异、逐条口径/日期限定复核和生产方法/切源继续分阶段。无新样本下载、付费或自动更新授权扩张。
- **#312 审阅收敛**：owner 授权先审阅 #312 再做读取器/跨快照比较；独立复核在 `89a463c0` 发现 P2 金额十进制静默舍入（原 CI `34201485535` 通过但未覆盖该边界）。先补三个金额列的规范十进制往返校验，无法保留有效位时 null+invalid hold，新增精度/误去重回归；仍保持单项 PR，不叠加读取器。复审、最终检查及 commit+push 以本轮回执为准，合并前独立人工审阅或本次 AI 替代批准仍需满足。

### 2026-09-08 ARR Epoch 免费来源评审与隔离核验（已合并 #311）

- **Acceptance baseline**：owner 明确不购买 Sacra，并批准 #310 独立 AI 审阅合并后直接做下一刀。该 PR 已于 06:40 UTC 合并为 `ec0cd27d`，[独立审阅回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/310#issuecomment-5580471956)无阻断；此次例外仅限 #310。新刀基于该 latest main，沿用单项 commit+push，范围为 Epoch 来源评审及一次性隔离验证，不改 ARR 生产链。
- **当前任务**：[来源评审与核验结果](ARR_EPOCH_SOURCE_REVIEW.md)。官方 CC BY 4.0 程序读取依据确认，真实 CSV 一个有界 GET、40,898 bytes、67 行/18 列、Anthropic 18 行；原始表只在进程内存，不保存/发布引文，无付费或生产写入。
- **下一步**：离线候选 sanitizer，分开公司/产品、run-rate/ARR/全年/季度、观测区间/报道日期及金额限定；再评审有界读取器与生产方法。当前不再以购买 Sacra 为前置条件，不把 39 天行日期直接当已核实的新鲜观测。
- **阻塞与证据**：实测日期精度、金额限定与来源角色仍需逐条核验；自动更新与 Core-23 切换未完成。来源评审 PR #311 已独立审阅合并，当前实施见上节。MCP `list_projects` 仍 `Transport closed`，源码回读；本轮不降低时效/许可/观察门槛。

### 2026-09-08 ACLED HDX/HAPI 月度候选来源评审

- **Acceptance baseline**：owner 在调查后要求“请做下一刀”，本刀交付[来源评审与隔离验证设计](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md)，沿用单项 commit+push。仅公开文档/目录元数据/现有源码与 JSON 对照，不开启数据正文下载、不发信、不恢复 ACLED API、不改生产；既有源权利与合并审阅要求保留，#309 例外不沿用。
- **当前任务**：六个 metric 候选映射、事件分类/死亡数/版本/地理/完整月份差异、授权询问信草稿及有界隔离验证方案。HAPI API 与 CSV 是同源分发方式，不是独立事实印证；不伪装六份手工输入。
- **用途确认与补充验收**：2026-09-08 owner 确认个人非商业、无广告/付费订阅/客户服务并要求继续；已记入 PR #310 同一来源评审。通过 HDX 官方源码定位并完整读取 OCHA 官方内容站八节 HAPI 条款，补充证据链和每秒一次的试验频率边界；非商业确认不扩大为下载、发信、付费、生产或 #310 AI 代人工合并批准。
- **2026-09-08 当前复核**：本轮连续实施/独立 AI 审阅合并授权下，已核实两封询问信于 03:23 UTC 发往 ACLED/HDX，未找到回复；owner 联系信息已提供，不再索要。公开仓库不保存个人邮箱或邮件内部 ID。下载目录顶层仍是六份已知周表，未找到符合已知命名的新版月表；详见[当前状态](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md#当前状态2026-09-08-授权联系复核)。本项仅文档状态修正，无重复发信、应用注册或数据请求。
- **下一步/真正阻塞**：等待有权方确认资源级许可/公开衍生成果适用性及六项定义，并取得合法持有的同版本对照原件；之后才能落实有界样本与 comparator。现有月表 as-of=2026-07-31；目录截止2026-08-28 不证明完整月或数值等价。条款入口部署一致性仍未确认；不降低容量/来源门槛，不改变缓存、生产或手工链。MCP 本轮已可用，历史连接错误仅为当时记录。

### 2026-09-08 新闻 TOC 时间依据与后续验收

- **Acceptance baseline**：owner 批准按建议连续实施、每步 commit+push。第一步按 [ADR-0031](ADR/0031-web-ngrams-time-provenance.md) 分离文件监测时间/TOC元数据时间/原文发布时间，严格日历校验；保留 shadow-only 支持链，不借用元数据充当原文时效，不改来源、评分、费用、阈值及分母。合并审阅、自然刷新与观察期门槛保留；#308 AI代人工例外不沿用。
- **当前任务**：candidate v2 / classification v3 / telemetry v5；Web原文发布时间固定null，metadata候选支持单独留在ignored产物，公开支持计数保持0；旧v2/v3/v4严格校验并留存。既有正例迁移到metadata诊断，同时断言公开资格关闭；不删除原断言的身份/去重保护。
- **当前验收**：自然 schedule run `34189473112` 已生成 v5，38 条 TOC 时间可比较、原文时间仍缺失、同方向支持候选为 0；不再等待首个 v5。后续离线原文证据复核器已合并 #318，见本节新事项。新版本不借用旧观察窗，原文时间缺失和支持链不足不能靠等待 30 天自动解决。
- **保留限制**：最初 MCP Transport closed 为历史故障，本轮调用可用；不因此声称永久修复。没有合法对应原文证据和合格的新 cohort 前不做自动 resolver/切源；本轮不触发 Daily/Oil News 刷新、不付费、不手改 production JSON。

### 2026-09-07 新闻同事件候选与脱敏支持链

- **已合并**：owner仅对#308批准独立AI替代人工，P2修复后复审无阻断，88回归、本地完整检查与CI通过；2026-09-08 01:14:54 UTC合并ac52ddda，Pages 34176008763成功。未手动触发新闻刷新；以下是当时实施记录，不再表示#308待批准。
- **本轮审阅（PR #308）**：owner 要求继续并审阅合并；合并动作已请求，但未沿用仅限 #307 的 AI 替代人工例外。独立 AI 对固定 `cc1ad868` 找到船名弯单引号漏识别/内部撇号截断 P2，本轮先修复成对引号与无法解析时弃权，追加4条回归（总88条）；修复后验证和独立复审结论以回执为准。TOC 另项保持未开始，不堆叠 PR。
- **Acceptance baseline**：owner 批准合并 PR #307 后开始下一刀，沿用逐项 commit+push；#307 的 AI 替代人工审阅例外仅限该 PR。本任务保持 shadow-only，不改主源、评分、费用、阈值或分母；同事件/转载 checker 语义收紧单独记录于 [ADR-0030](ADR/0030-web-ngrams-event-support-provenance.md)，本次不自行合并下一 PR。
- **实施**：标题同地点/对象族/事件类型及明确命名身份候选匹配；缺失/多义弃权，URL/标题去重；支持记录链接到固定哈希 ID 的脱敏 reference 表。公开 cache 仍只存既有 aggregate 字段，v4 与 v2/v3 历史隔离，历史仍严格校验，不改30天/120样本政策。
- **验证入口**：原56条标题回归加28条事件/支持链回归、单 pair stub builder、无原文/URL/船名/非法日期泄露、老版本严格验证及新 cohort；纳入既有 `check:all`。必要检查成功后独立提交推送，最终结果见本任务回执。
- **保留限制**：同地点/对象/事件类型不证明同一事实；无明确船名的相邻同类事件、改写转载及域名所有权仍有不确定性。TOC 发布时间语义未解决；生产刷新、新口径观察及独立切源审阅不能由本地测试替代。

### 2026-09-07 新闻 shadow 标题主张防护

- **已合并**：owner 对 PR #307 明确批准仅此次由独立 AI 替代人工审阅；独立审阅固定 head `6adde1e0`、复跑56回归及专项，无阻断。PR 云端检查成功后于09-07 08:09 UTC合并 `e6baad93`；Pages `34099069198` 成功。未触发付费新闻刷新，未把此例外延伸到后续 PR。

- **Acceptance baseline**：owner 在只读质量审阅后批准下一刀实施，完成后单独 commit+push。范围为 shadow 标题主题相关性、否定/争议/假设句及英文词形；不改主源、质量阈值/分母、生产分类器或评分，不触发刷新/付费。原断言固化的 `attacks` 漏识别按 [ADR-0029](ADR/0029-web-ngrams-shadow-claim-guards.md) 显性修正，独立 checker/merge review 仍保留。
- **实现**：Web 与已有 Tavily/Brave reference 共用标题防护；正文 bucket 不能借给无关标题，主题和方向须在同分句出现；不确定性保守弃权，主张加否认保留争议。classification v2 / telemetry v3 分离新旧计算口径，旧 v2 diagnostics 验证不放宽，历史不删除或重算；现有30天/120样本及全部门槛不变。
- **验收与边界**：56 项真实标题/离线回归纳入原 classifier check，覆盖池塘恢复、主张加否认、否定/假设/演习/词形、两侧匹配、单 pair stub build、脱敏及旧 v2 cohort。第一轮 `check:changed` / `check:all` exit 0；提交前追加“未关闭/演习/驳斥报道”负例，最终版本重新全量验证，最终结果见任务回执。真实 git-history 回放保留231有效/0无效旧记录，新 v3 样本为0、切源门保持关闭。规则不是完整语义理解；不证明事件真实或来源准确率。
- **后续独立事项**：同事件/地点绑定、转载及所有权去重、逐条支持链、TOC 日期语义；合并后的新口径观察与人工切源审阅仍待完成。本任务不自动实施后续事项。

### 2026-09-07 首页 AI 判读不可用修复（已恢复线上）

- **Acceptance baseline**：owner 要求分析并修复首页“AI 判读不可用”，尽量减少复发。本次只修既有新闻检索覆盖与跳过诊断，保留可信来源、逐事实引用、review、时间匹配、30 小时及单次 provider/no retry。2026-09-07 在展示本地提交 `26d8cf1d`、验证结果和推送/合并/发布及一次 DeepSeek 刷新验收请求后，owner 回复“请也恢复线上”，确认执行该具体恢复方案；授权一次生产刷新、最多一次 DeepSeek，失败不得重复付费调用。
- **实证原因**：9 月 6 日 run `34011529977` 两搜索源全部查询健康，但 30 条均为 `discovery_only`，因此 expected skip / DeepSeek 0 次 / production write 0；9 月 4/5 日为正常生成。9 月 6 日 23:11 UTC 自定义域名与 Pages 的 radar JSON SHA-256 均为 `db16cb4aec6ffc32be6ae423709c9847052a700af7984ba816a96f4d4baa7b61`，`updatedAt=2026-09-06T00:06:53.185Z` 且没有 `macroRiskEditorialLayer`。不是两部署通道缓存不一致；Daily 重建后没有新的合格判读可供展示。
- **实现**：重新分配两个现有 Tavily 查询到已登记 Fed/BLS 官方日期发布（general + 域名限制），保留另外四个及 Brave 六个新闻查询、basic/5 条/短超时；不增加源、查询次数或付费重试。日期路径按官方实页核对，先过滤缺日期/旧/未来资料再聚类；skip 加 warning annotation。新回归覆盖真实 collector 请求参数、预算、来源健康失败、官方日期、同发布者不算独立印证及无可信源继续关闭。
- **验证**：`npm run check:changed` 自动执行完整 `npm run check:all`，exit 0；11 项新回归、collector 无网络 dry-run、真实 skip artifact 回放和 `git diff --check` 通过。[PR #306](https://github.com/ctmaomao/gfrr-auto-update-site/pull/306) 云端完整检查、覆盖率和浏览器 smoke 通过后合并为 `14df108a`。修复未改现有 checker/validator/provider/writer 断言，无新增 ignore list。
- **线上验收（2026-09-07 01:27 UTC）**：[生产刷新 34072777981](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34072777981) 单次 DeepSeek 成功、无重试；实际找到两条 Fed 官方发布及一条 cross_checked 新闻，31 个引用来源、3574 字，review 为 warn（仅低于目标篇幅，兼容范围内）、0 blockers。提交 `a7278071` 只新增 AI 编辑层，删除该字段后前后 radar 数据语义完全相同。生成时间为 `01:22:53Z`；`sourceDataUpdatedAt` 与 `radarData.updatedAt` 均为当日 `00:10:36.294Z`。
- **发布与显示**：[Pages 34072833987](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34072833987) 与 [EdgeOne release 34072876721](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34072876721) 成功；EdgeOne release `9325b8b2` 对应 source `a7278071`。两域名 radar JSON SHA-256 均为 `e4f770af2af856b94fcf375639e76ab67784726784e38cbd45e1a53acf062760`。两端各 1440px/390px 浏览器验证：AI 正文可见、不可用提示消失、确定性依据默认折叠、无横向溢出/脚本错误、新闻来源均 HTTPS。保留未来真实证据不足/超时/陈旧时的降级，不承诺永久可用；下一次自然调度尚未观察。

### 2026-09-06 指令与技能维护

- **已完成**：指令/校验器解耦、验证分流、技能维护来源、历史归档及 Hook 验收已随 PR #304 合并并通过 Pages 验证；现行决策、限定执行人例外和历史证据统一见[总回执](REVIEW_2026-09-06_CLOSEOUT.md)。
- **本轮 acceptance baseline（2026-09-07）**：owner 要求完成四项后续整理：明确技能归属、更新 ADR 验收状态、合并根文件重复约束、收拢维护回执与交接；沿用本系列 commit+push 授权。不改变检查器、通用审核或生产发布权限。

### 2026-09-05 全模块完善（owner 授权逐项 commit + push）

- **09-07自然刷新后验收**：Daily `34068954340` 成功，生产 `updatedAt=2026-09-07T00:10:36.294Z`；BoA八月报告已为live，三项每户同比为5.0%/6.3%/4.3%，MLF保持live，BDI污染值保持null/missing。EdgeOne `34072876721`成功后，cache-busted双域名六份核心JSON与本地main全部逐字节一致；关闭BoA生产恢复与本次发布同步等待。9月5日失败的具体云端原因仍无可追溯日志，不能倒推；以下日期记录保留当时状态。MCP应用内full重索引完成于09-07 01:46 UTC，24922节点/82152边、0 skipped、5处partial parse；metadata_changed仍保留源码回读。详细证据见[自然刷新后复核](REVIEW_2026-09-05_CLOSEOUT.md#2026-09-07-自然刷新后复核)。
- **MCP连接已关闭故障项 / 最新状态**：应用内四项RPC（list_projects/index_status/search_graph/check_index_coverage）均成功，最新诊断函数可查询；10:07 UTC代码full索引为24726节点/81458边，0 skipped、5处partial parse。无需owner再执行Restart。以下09:47及更早记录中的“仍需重连”仅为当时故障历史，不是当前待办；metadata_changed与局部解析提示仍要求源码回读，不宣称索引绝对完整。
- **BoA云端降级取证补齐**：一次授权Daily已确认五月fallback，但旧Promise.allSettled路径未记录具体错误。新增log-only `[BoA source diagnostic]`，只输出固定source/stage/classification与HTTP状态码，区分landing/report请求、报告发现及解析；绝不输出原始异常/URL/正文/headers。离线真实fetch入口回归覆盖四阶段、成功不告警、原先首试+两次重试不增加，错误继续抛给原fallback路径。未运行第二次Daily，不写production JSON；云端原因仍需下一次自然Daily日志证据，不能因诊断代码补齐就宣称BoA恢复。
- **09-05追加授权执行**：一次Daily已成功（run `33958975125` / `9c93507d`），Wind=`skipped_no_candidates`，未付费兜底/未重跑。BDI污染值已清除、MLF已live；BoA云端仍五月fallback，本地八月probe成功但云端原因未记录，不能关闭恢复项。ACLED三份新周表+三份原样文件经main-only publisher提交`6a04c891`并成功刷新`f36faebd`（run `33958873350`）；六区实际日期为三份8月21日/三份8月14日，月表仍7月31日，weekly/monthly data_current不代表统一最新。Pages两份JSON逐字节一致，自定义域名等待原EdgeOne低频发布。MCP复用项目启动配置的官方CLI已恢复并full索引24799节点/81642边；应用连接仍需Restart，5处partial parse及coverage metadata_changed提示保留源码回读。执行记录优先于下列首轮待办描述，详见[追加授权回执](REVIEW_2026-09-05_CLOSEOUT.md#owner授权后的执行回执2026-09-05)。
- 验收基线：逐项修复、完整校验后独立提交推送；不以降低质量/授权门槛制造完成状态。不承诺外部源永久可用或绝对零缺陷。9项独立提交与最新验证/剩余输入见 [2026-09-05验收清单](REVIEW_2026-09-05_CLOSEOUT.md)。
- **StockQ 运价语义修复 / 已通过本地验收**：修复公开 HTML 隐藏指数值后，通用 summary-row fallback 将 `4.06%` 收益率误读成 `BDI=4.06`；改为页面身份 + 历史表头/列语义绑定、保留空列、最新日期及7天freshness gate，无可读新值时fallback/missing。隔离旧百分比误读签名/无日期/非正/非整数缓存，新报价缺涨跌幅时不拼接旧日期涨跌幅，同日冲突拒绝。独立review问题均已补回归；check:all、34单测、7浏览器smoke通过，纯logic回归接入原expanded-auto-ingestion check。live只读probe正确返回BDI missing，而非4.06；BDTI/BCTI仍为旧值fallback，源明文恢复未解决，生产JSON待自然Daily使用新parser刷新。
- 后续仅保留真实依赖：ACLED滞后地区/月表新版操作者材料、StockQ/ARR新源证据、Web v2同口径观察与独立切换审阅、运输商业授权。BoA生产恢复和双域名同步已于09-07实证关闭；MCP连接、运输交接、BoA/MLF/ARR解析、影子分类和发布代码修复不再列为待实施。
- **EdgeOne源快照 / 2026-09-05**：排队后显式checkout最新main，记录并锁定实际检查/构建的SHA，release提交不再误用触发事件SHA。保留3小时调度、无变化不发布、32天400次配额保护和独立静态仓库，未改DNS/域名。此前FIRMS成熟基线及两份市场历史/指标已经在自定义域名逐字节对齐；低频通道不是每笔高频数据提交立即发布。
- **Web NGrams影子质量 / 2026-09-05**：旧历史223有效/208可用/35.81天，独立支持中位3.03%、跨provider为0，不能晋升；最新32候选仅2条明确方向，支持率低不只是匹配缺陷。确认reference旧英文classifier与Web五语classifier不一致，修复为shadow-only统一分类并补日期/域名安全与脱敏诊断。v2计算口径独立重新积累原30天/120样本资格；旧历史完整保留、不混算、不改阈值/分母/主源/评分。没有真实逐篇近期artifact时，不猜测漏配原因占比，不承诺修复后门槛会通过。
- **ARR解析安全 / 2026-09-05**：修复无公司约束的通用ARR金额误归因及不存在日期被接受两项缺陷；只接受Anthropic与ARR/annualized run-rate直接绑定的主张，已审标题优先，唯一325206短续句按结构锁定、不硬编码金额。固定4个SaaStr来源ID与45天底层观察门保持；未补未经核实的新里程碑、未修改curated/production灯色，底层最新5月28日仍须降级。恢复自动新鲜来源仍需同口径新观察证据，不能只刷新页面抓取时间。
- **运输P30/P33证据交接 / 2026-09-05**：本地6份人工真实事件审阅（3扰动/3对照）原为ignored，云端checkout缺失；改为唯一固定路径的版本化白名单元数据/hash manifest，P33显式读取并重算，不提交原件/URL/自由文本。不再把空review缺字段误报为已批准评分/已连接确认，真正越界仍拒绝。人工贡献及命中/误报统计明确不是模型历史回测；评分审批false、route/market not_connected及既有capped runtime边界不变，仍需独立设计审阅。
- 运输交接发布验证：`8ac9285d`，实际云run `33953468989`成功；下载的artifact为6/3/3、gatePassed=true、scoreIntegrationApproved=false、historicalBacktestPerformed=false，完成本地/clean-checkout一致性交接。
- Market Pricing发布验证：`5eb2cb72`，Pages run `33953020935`成功，线上history/metrics两文件SHA-256均与9月4日提交快照一致。
- **BoA消费证据 / 2026-09-05**：修复旧摘要措辞绑定导致的五月fallback，按官方PDF人工核实8月HTML简写仍是每户同比；新增精确语义配对与旧明确模板回归，不自动认可未来未知简写。最新官方链接按报告月份排序，新live限定62天月龄；UI显示本报告月份和旧值/缺失状态，静态示例数字退场，当前asset token为`bofa-report-review-1`；不改评分或原始卡数据边界。
- BoA验收：09-05实时只读probe为八月报告0.05/0.063/0.043，12项解析测试与11项浏览器测试通过；09-07自然Daily生产快照及双域名文件现已核对相同八月值，生产恢复已关闭。旧失败根因未记录，不将当前成功写成历史错误分类已查明。
- **MLF查询与操作语义 / 2026-09-05**：确认primary搜索非空但全为逆回购时不会尝试备用MLF查询；修复为至多2次逻辑搜索，摘要先行、正文去重且全程上限6，正文优先明确MLF标题。逐操作绑定毛额/期限/利率，不能借其他工具或其他日期的字段；实际操作日期必须真实、非未来且45天内，新发布不能洗白旧操作，未披露利率为null。仍为EastMoney聚合公开新闻/display-only，不冒充PBOC原始公告，不改评分。 只读 live probe 已验证2026-08-25 / 5000亿元 / 12个月 / null利率；16项MLF负例和全量检查通过。生产radar快照仍须等待既有Daily刷新，不能把本地解析成功写成生产已恢复。
- **Market Pricing 周线对齐 / 2026-09-05**：既有 Yahoo manual 路径先 dry-run 再提交 history，QQQ/NDX/IXIC 均更新至 2026-09-04（各522条10年周线）；离线重算每资产463条60周指标。strict freshness 为 PASS / 0 WARN，逐窗独立复算1389组均吻合，SPX未变。QQQ primary、NDX/IXIC auxiliary、display-only与自动化边界不变；正常滚动10年源窗口不承诺永久保留窗口外历史。
- MCP历史取证：07:45 UTC曾full索引，08:47曾Transport closed并伴随裸CLI endpoint失败；后续已复用项目配置完成最后代码索引且应用RPC恢复，当前状态见本节顶部。历史失败不等于仍待重启，局部HTML/Markdown缺口仍需源码回读。
- FIRMS 发布验证：`5d7f5493` 的Pages run `33952848899`成功；后续EdgeOne已追平成熟窗口35.48天，cache-busted两通道热点JSON与提交快照SHA-256相同。08:45左右自定义域名六份核心JSON也已逐字节对齐，旧的14.46天发布滞后已关闭。
- **FIRMS P68成熟观察基线晋升 / 2026-09-05**：按本次owner明确授权，经独立只读复算252个p95无差异后，使用既有`promote:oil-thermal-baseline-candidate -- --write-production-baseline`更新配置：193健康/240总样本、47隔离、42/42设施窗口35.48天，`established_observation_window`；相比旧生产29设施统计变化，policy及设施ID不变。41个健康快照全设施零检出仍受卫星过境/日窗口影响，193快照不是193次独立观测；16设施p95全零并不证明正常运营；高FRP背景不等于火灾/停产。配置与展示快照必须原子提交：既有生成器实抓126/126请求成功，42设施投影通过契约检查；不接ODP或评分，部署后继续核对live投影。

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

- **ACLED 工作基线**：规则PR #383已合并fc8fb943；本轮`codex/acled-detail-discovery`为独立实现，已批准14请求预算尚待执行。
- **ACLED 当前完成**：固定十二页会话读取、HTML限额、链接身份、完整manifest和退出回执实现准备；15项新旧专项通过，无XLSX/生产写入。
- **ACLED 下一步**：完成独立实现审阅、全套和CI后合并，唯一真实dispatch并记录run；验收不自动续跑，文件批量下载与发布仍单独推进。
- **ACLED 仍未完成**：GitHub持续XLSX下载/分析/发布与HAPI六指标替代均未上线。两条路线分开；既有四槽后续与ARR第二周期自然等待不变。以下09-13回执为历史。

### 2026-09-13 交接（历史）

- **工作基线**：2026-09-13 收尾基于 main `21a7dc71`，分支 `codex/september-13-delivery-handoff`；此前 #351、#353、#354 均已分项验证/推送/独立审阅/合并。此文档提交自身的最终 SHA/CI/集成状态以对应 PR 回执为准。
- **当前完成**：上一期 AI 连续展示代码和双站版本已交付；只读巡检首次真实 artifact 验收完成；GDELT 限流自然执行确认完成；#350 ACLED 发布与 #352 研究采集回执已补齐。没有在本轮补发邮件、额外 Daily/AI 刷新、清理用户数据或自动晋升。
- **真实等待**：自然 Daily 的首次历史 AI 字段；09-14 及后续周一 ARR 上传/跨运行下载；新闻 v5 与压力 v2 新 cohort；巡检 7/28 天观测；ACLED 资源级许可与等价性。手工 ACLED 数据仍按原日期降级，不把文件生成时间当来源新鲜。
- **后续触发条件**：只在新自然运行、足量样本、来源许可/数据或真实故障出现时继续对应事项。GitHub 外监测环境尚未选择，不能以本轮 GitHub 内巡检宣称独立容灾。卫星质量没有当前必须晋升的动作；既有观察门槛保留。

### 2026-09-10 GDELT 交接（历史）

- **工作基线**：`d7882056`（PR #341 已合并）；本轮 `codex/gdelt-event-count-units` 基于 latest main，原工作区和历史分支保留。
- **当前任务**：八项整改第八项，GDELT 事件/报道口径及最终验收交接 PR；完整顺序及既有交付见 Section 2。
- **下一步**：必要检查、一次有界独立 AI 审阅与 CI 后合并最后一项，核对 Pages/自定义域部署；自然数据恢复仍独立取证。实际提交/PR/部署回执保留在本任务回复和 PR，不能用本地通过代替自然运行验收。
- **阻塞或等待**：Daily/GDELT 既有自然验收跟进继续每天北京时间 07:15 只读取证；不额外付费触发，不提前请求 GDELT，不把当前代码修复称为长期无人值守验证完成。

### 2026-09-10 历史审计任务交接（#332 合并前记录）

以下保留合并前快照，非当前操作指令。PR #332 已合并为 `275af3be`；不重复执行其旧“下一步”。

- **工作基线**：PR #331 已合并并验收；当前任务从 latest main 28470827 建立 codex/historical-audit-verdict，原工作区保留。
- **当前任务**：事件覆盖门槛与未评价状态修复完成，7 项专项及完整检查通过。
- **下一步**：必要检查通过后 commit+push，创建 PR，完成一次有界独立 AI 审阅、CI、合并与 Pages 验收。
- **阻塞或等待**：沿用本轮修复/集成/有界 AI 替代审阅授权；不扩大真实源或付费调用范围。

### 2026-09-09 刷新与卫星验收记录

- **刷新/发布**：Daily `34294949295`、World Order `34297470511`、ODP `34299783795` 均成功；Pages 当时六份核心 JSON 与 `69bf835f` 逐字节一致，EdgeOne 六份与 release `1a16b298` 所记录源 `d424e007` 一致。三个文件跨站不同源于 EdgeOne 23:44 UTC 发布早于今日生成，不是文件损坏；保留每 3 小时发布节奏。随后独立 ACLED 刷新 `34303417039` / Pages `34303500337` 成功，线上周/月日期为 2026-08-28 / 2026-08-21，部分地区周度仍 2026-08-14。Daily 00:25 UTC 使用 23:20 UTC 的 realtime-data 输入；当时 Macro Risk 编辑层缺失，不把生成成功当作 AI 判读可用，不手动付费重跑。#322 部署后的最终双站验收见本次 PR 回执。
- **FIRMS 质量**：隔离审计目录重新归档/审阅 240 份 committed sanitized history（2026-08-03 至 09-08），197 健康 / 43 隔离，42/42 设施最短候选窗 36.34 天，`mature_baseline_observing` / `manualAction.requiredNow=false`。未借用旧 ignored review 的 dry-run 结果作为新统计；原基线仍为 193 健康 / 35.48 天，文件 hash 不变。晋升后 20 份中 19 健康 / 1 隔离，最近隔离为 09-05 的网络失败，历史失败不冒充当前故障。
- **卫星线上投影**：09-08 23:24 UTC 快照 126/126 请求成功、0 重试/错误、42 设施；252 个 p95 投影值与基线配置一致，生产影响字段全 false。25 设施无检出、16 设施零 p95 不证明正常运营；Jazan 的一次 elevated repeated watch 仍只是卫星代理，不能确认事故/停产。审计未调用 FIRMS、未读 key、未晋升或写生产，仅新增 ignored 审计产物；无需代码修复。

### 2026-09-08 上轮已完成回执（历史）

| 上轮独立任务 | 实际提交 / 合并 | 精确 CI / 审阅证据 |
|---|---|---|
| ARR 逐行事实和生产方法复核 | `e81122a8` / #317 `e7a70307` | CI `34217707117`；[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/317#issuecomment-5584059570) |
| 新闻有界离线发布时间复核 | `245b1f13` / #318 `88e68caa` | CI `34219176654`；[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/318#issuecomment-5584260254)，Pages `34219612651` 成功 |
| ACLED 授权联系与输入状态 | `7952f2dd` / #319 `e6f47ecb` | CI `34219955752`；[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/319#issuecomment-5584342889) |
| 运输免费来源权利与适用性 | `8956a203` / #320 `2cad8015` | CI `34220592207`；[回执](https://github.com/ctmaomao/gfrr-auto-update-site/pull/320#issuecomment-5584430606) |

上轮四项均经本地 `check:changed` 完整检查及云端 CI；docs-only 项不符合 Pages push 路径过滤，不额外触发部署。所有修改均有独立审阅，未放宽 checker 或添加未解释 ignore。

### 未关闭的观察事项（本轮范围外状态不据旧记录推断）

- 09-13 新闻 readiness [34745747003](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34745747003)：现行 v5 仅 19 usable/5.01 天，qualityGatePassed=false、promotionEligible=false；全历史汇总的 236 usable/43.83 天不能借给 v5 的 30 天/120 样本门槛。
- 卫星质量 [34740216377](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34740216377)：42/42 设施，当前/候选都为成熟观察窗，manualAction.requiredNow=false；不因候选时长继续增长自动晋升。ARR 最新周一运行仍是 09-07，新链路尚无后续周一真实证据。ACLED、StockQ/运输许可缺口按 Section 2 保留。

此前逐会话记录原文见 [历史交接](PROJECT_HANDOFF_HISTORY.md#handoff-2026-09-05)。仅在核对对应日期事件时读取；不把旧“下一步”恢复成当前任务。

<a id="handoff-2026-09-18-health-latest"></a>

## 2026-09-18 健康整改收尾交接（归档于 2026-09-21）

- **当前任务**：2026-09-18 健康整改，逐项状态和实测见 [执行清单](HEALTH_REMEDIATION_2026_09_18.md)。#403 / #404 / #406 已合并；最后纯函数提取 PR 以精确 head 的独立审阅、CI 与合并回执为准。同日的**只读整体健康度审计**（7.6/10）与 `check:all` 覆盖分类已获 owner 授权写入 docs 并登记于本文件顶部日期条目；其 5 项派生待办尚未实施。
- **运行边界**：不补发付费 AI，不重跑已耗 ACLED 下载，不删除预算 refs、用户原件或历史；每一项保留原验收保护。审计派生的整改项各自需要独立授权与评审，不因本次登记自动获得实施、推送或发布许可。
- **待验**：自然计划运行与长期模型观察、外部额度恢复仍未完成。网站发布须核对实际 run 和双站哈希，不能用本地通过替代。审计的未验证项（线上内容级比对、远端 CI、浏览器验收、手动入口、本地残留清理）保持未验，不得据审计文档推断为已通过。
- **历史检索**：仅在核对具体旧事件时读取 [完整旧交接](PROJECT_HANDOFF_HISTORY.md#handoff-2026-09-18-health)，不重新执行其中的旧“下一步”。
