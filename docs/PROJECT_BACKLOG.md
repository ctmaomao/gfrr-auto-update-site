# Project Backlog · GFRR Auto-Update Site

### 2026-10-09 CSP 独立 inspection 取证准备

- **Acceptance baseline**：owner 批准 #441 合并及随后具体归档失败锁；原字节/九项证据核对，58/500不退，不重跑。随后要求持续完成准备至授权门槛；本新候选不继承旧review、push/merge或平台批准。
- **当前任务**：latest main `2875b755`，分支 `codex/csp-inspection-probe-preparation`。新增独立GET-only入口与离线回归，新路径/新指纹及真实failed-result/归档锁/移动回执lineage，固定三槽58→61；原内容validator保持不变，内容拒绝前落盘脱敏诊断，不改Worker/SQL/alarm/retention/生产配置。
- **下一步 / 门槛**：完成离线/完整检查和自审后，请求新的独立AI只读review；远端push/独立PR及merge分别需对应批准。实际平台开窗/显式关闭最多两更新、三GET/五分钟须新具体批准，暂时公开端点及共享额度风险仍存在。详见[准备方案](CSP_INSPECTION_PROBE_PREPARATION_2026_10_09.md)。

### 2026-10-09 CSP 原生直连批次停止与 inspection 诊断

- **Acceptance baseline**：owner 要求开始已提议的新批次：既有隔离 Worker 八槽 50→58、最多三更新、整个请求序列不超过五分钟、仅合成报告；不升级/新资源/生产 C/删除/重试。PR #439 已合并 `aae12fe3`；不匹配现有站点发布路径，不自动部署 CSP Worker。
- **实际回执**：三次更新后已恢复关闭版本 `b9524593-ac3a-4508-a38a-df5c1a8303d8`，trial=false/空时间、loopback/原 namespace、日志追踪关闭。仅 closed health 503 和 open inspection before 200 两次请求；inspection 内容断言失败，runner exit 1，未发送原生报告。累计 58/500、不退额；失败锁/marker/全部旧证据保留。native/getAlarm/删除均未通过验收。
- **当前任务**：本次原 CLI 未保存失败 inspection 字段，仅 AssertionError，具体根因未确定。已补本地 fsync 脱敏快照与验证 verdict；保留全部原内容断言，未知字段/消息/URL 不落盘，不改 Worker 或清理。分支 `codex/csp-native-inspection-diagnostics` 基于 latest main `a6724d5a`；手动回归 19/19、`check:changed`（完整 `check:all`）均退出 0。自审原断言未放宽、无新增 ignore、Worker 无差异；新的独立审阅待批准。该离线模拟不冒充真实失败原因。
- **下一步 / 阻塞**：独立审阅修复与远端操作仍需对应批准；新取证批次须新路径/指纹/58 基线及具体授权，失败锁恢复另须可恢复方案/具体批准。三次平台更新和本批次八槽批准已耗尽，不补跑。隐私、公开流量/费用与生产 C 仍保留门槛，见 [停止回执](CSP_NATIVE_DIRECT_TRIAL_2026_10_09.md)。

### 2026-10-09 CSP 原生直连与原始 alarm 取证候选

- **Acceptance baseline**：owner 要求继续独立直连入口/只读 alarm 候选并持续完成可做的实施验证；追加明确批准新的独立 AI reviewer 只读代审、推送 `codex/csp-native-direct-preparation` 并创建以 main 为目标的独立 PR。不复用已耗尽平台批准，不授权 merge/部署/新开窗/付费/真实访客传输或删除。
- **最后基线 / 改动**：latest main `26667970`，分支 `codex/csp-native-direct-preparation`。默认 health 不变，显式 inspection 返回实际 getAlarm/五个原始 meta；新独立手动入口固定 50→58 八槽、原生 Chromium 发送前同步门及新指纹/前批 lineage。
- **当前任务**：原候选手动回归 12/12、既有相关回归 86/86、完整 `check:all` 与 cached Wrangler dry-run 均退出 0。独立审阅发现五分钟总序列边界缺口，已补统一截止、共享取消及 25 秒过期检查预留；修复后手动回归 17/17、`check:changed`（完整 `check:all`）均退出 0，独立代码复审通过，无新增阻断问题，最终不可变提交核对随后执行。旧断言未放宽、无新增 ignore。第二批七请求 pass、关闭版本 `09dd66b1` 与预算 50/500 保留为历史证据，不冒充本轮平台读回。不新增依赖或 CI/checker 接线。
- **下一步 / 阻塞**：最终提交核对后执行已批准的推送/独立 PR。新平台批次须最多三更新（新源关闭部署、开窗、关闭）、八槽/五分钟的新批准。自然实际删除最早资格 2026-10-17 UTC，仍须前后证据；不缩短保留期或注入过期数据。隐私、公开流量/共享额度与生产 C 仍待独立决定，见 [执行候选](CSP_NATIVE_DIRECT_PREPARATION_2026_10_09.md)。

### 2026-10-08 ARR 候选专用只读诊断入口

- **Acceptance baseline**：owner 明确批准实施候选专用诊断入口、独立 AI 审阅通过后合并，并执行一次免费 GitHub 元数据诊断。三 GET/15 秒、每响应 1 MiB、零重试；不请求 Epoch CSV/ZIP，不写生产，不复活旧 HAPI/heartbeat。
- **最后基线 / 改动**：latest main `819b1baf`，分支 `codex/arr-candidate-metadata-diagnostic`。新增固定事故 35591049191 的已完成运行诊断和 stdout CLI，复用原身份 validator，原定时 in_progress gate 不变。#437 已合并 `a7c736d6`，独立审阅/CI 通过。
- **当前任务**：离线专项 22/22、`check:changed`（完整 `check:all`）与独立 AI 审阅均通过，退出 0；提交后等待 CI，通过即按 owner 批准合并并执行一次真实只读诊断。未放宽 checker/ignore、未新增依赖或工作流。
- **下一步 / 阻塞**：诊断结果仅反映当前元数据，不能认证历史网络响应、ZIP digest 或收入事实。根据真实回执定位后续修复；跨周期验收及生产来源切换仍未完成。

### 2026-10-08 ACLED 自动更新验收与 ARR 历史诊断

- **Acceptance baseline**：owner 要求核实周/月 XLSX 更新并依次解决 ARR、HAPI 与暂停障碍。本轮先核实既有生产链，补 ARR 脱敏诊断；不重置 HAPI 锁/预算、不补跑候选或付费刷新、不降低校验、不自动晋升来源。
- **最后基线 / 改动**：基于 latest main `0ceefbe3`，分支 `codex/arr-history-diagnostics`。周一 37270618845 已下载 12 文件/26 请求、月表推进到 2026-09-25；周三 37580479475 已下载 6 周文件/14 请求、周表推进到 2026-09-26；两次登录退出与私有清理均确认。10 月 8 日 main、Pages、自定义域 World Order 字节 SHA256 同为 `c0abf846f83853715a82f134f7569c6751ed4999cb710b6dec4444f685b3d4ac`，ACLED status=ok。
- **当前任务**：ARR 37309378856 仍 candidate_failed/weekly_history_invalid。现存日志没有失败阶段，当前元数据不证明历史调用当时状态，根因未确认。增加固定阶段/HTTP 状态/请求计数，保留所有拒绝断言与预算；HAPI 四槽保持停止，作为备用源研究，不再阻塞已验收 XLSX 自动更新。
- **下一步 / 阻塞**：本修复通过验证和独立 review 后才合并；下一次自然周一候选可提供诊断，不制造 schedule 或复用旧预算。原 heartbeat 保持暂停，旧截止任务不伪装恢复；跨周期验收仍未完成，生产来源切换仍未批准。
- **验证**：ARR 专项 18/18、`npm run check:changed`（实际执行完整 `check:all`）及 `git diff --check` 均退出 0；CLI dry-run 零网络。新增离线失败阶段及真实 CLI 脱敏回归；未删除/放宽 checker 断言、未新增依赖或 ignore。不以离线通过声称线上根因已修复。

### 2026-10-06 Bubble 周度判读来源与简版改进

- **Acceptance baseline**：owner 同意执行来源审查方案：补齐官方识别，接受专业媒体/研究机构的注明出处单源证据，信息有限时允许简版；保留不编造、引用、时效、评分隔离及单次费用保护。仅本地实施与验证，不自动授权 push/merge/发布或真实付费补跑。
- **最后基线 / 改动**：隔离 worktree bubble-editorial-evidence，分支 codex/bubble-editorial-evidence，基于 latest origin/main `9c2d15d4`；原 CSP 工作区不改动。ADR-0062 明确记录本次 checker/contract 变更，不隐藏在 presentation patch。
- **当前任务**：本地实施与验收完成。来源分类、归因/摘要检查、简版 contract/prompt/review、来源中文标签已接线；新测试加入既有 news 检查入口。简版省略分类后发现 scorecard-only 指标在 production 回读丢失，已补齐该引用投影/回读并保留未知指标拒绝。未写生产 JSON。
- **追加授权与审阅（2026-10-06）**：owner 已授权推送并创建 PR #434，随后明确委托 AI 代审、无阻断问题则合并部署，并授权一次 DeepSeek 付费补跑；仅适用于本任务，不改变通用人工 review 要求。实际 diff 已核对来源准入、归因、简版及生产回读边界。远端首轮 CI 完整检查通过，但两项浏览器用例仍断言旧提示文案；已同步为含专业媒体摘要的新文案，保留其余布局/回退断言，须复验后合并。
- **下一步 / 阻塞**：等待修复后的完整检查与 PR CI；通过后按追加授权合并、验收部署并单次补跑。真实生成/生产发布结果以 Actions 与线上内容为准，不以离线重放代替。
- **验证**：`npm run check:changed` 选择 full 并完成 `check:all`，退出 0；新增单测 7/7、既有 contract/provider/news 负例保留，退出 0；`npx --no-install playwright test tests/e2e/site-smoke.spec.mjs --grep "Bubble Watch"` 6/6，退出 0；文档链接、中文/DOM 与 `git diff --check` 退出 0。完整套件只生成既有 ignored 手工输入，不调用真实 provider。
- **本周候选离线重放**：run `37310071904` 已保存 30 条候选重分类为 official=1、attributed_media=4、discovery_only=25，readiness=true；FT 订阅提示保持不能支撑正文。该重放仅复核已保存候选，不代表真实 AI 输出验收。
- **自审**：实际文件符合 owner 方案；契约新增类别及简版 min/count/confidence 变更在 ADR-0062 显性记录，未隐蔽删除既有负例或加 skip/ignore；评分、data/realtime、workflow/core 前端均无差异。页面仅文案/来源类别映射与空时间线标题处理，本 PR 符合 DESIGN.md 的所有规则。`check:frontend-asset-version` PASS，单文件 Bubble HTML 无 cache-bust 的既有限制保留；不改高风险入口制造无关 bump。自然语言归因/事实蕴含仍须审阅，机器检查不声称完整事实核验。


### 2026-10-02 GDELT 零订阅费用迁移：Cloud 停用与免费候选验证

- **Acceptance baseline**：owner 明确不付费，并选择「先停止 Cloud 自动请求，保留明确过期的历史证据；验证免费数据候选，评分替换另行评审」。不申请续费/试用、不新增依赖、不删除密钥，不手动生成或写入生产数据。随后 owner 明确要求 AI 审核本任务，无问题则合并发布 commit+push；本次审核授权仅适用于此任务，不改变通用人工审阅要求。
- **当前任务 / 实施**：`gdelt.accessPolicy=free_only` 在 Cloud 网络调用和 fresh-cache 路径之前生效；带有效原时间的旧摘要保持 stale，缺失/无日期/未来日期不伪造零或新时间；不生成 Cloud cache artifact。现行 World Order 过期折扣与所有评分公式保持原样。免费 DOC / Web NGrams 消费者未改动。
- **最后基线 / 改动**：隔离 worktree `gdelt-free-only`，任务分支 `codex/gdelt-free-only`，基于 main `20e1d435`；原工作区 EdgeOne 文档改动保留。改动为 rules、Cloud adapter、其现有单测及源策略/本交接；免费候选结论见 [审阅](GDELT_FREE_SOURCE_REVIEW_2026_10_02.md)。
- **下一步**：按本次 owner 授权完成 PR CI、合并至 main 与现有发布流程验收；免费源替换观察分须另行设计/评审，不得从免费或一次 smoke 通过推断同口径、稳定供数或 production readiness。
- **本地验收**：`node --test tests/unit/gdelt-cloud-access.test.mjs` 2/2 通过、退出 0；`npm run check:changed` 选择 full 并完成 `check:all`、退出 0；`git diff --check` 退出 0。现有快照离线 smoke 为零网络请求，保留 1629 计数、原时间与观察分 21。免费 Web NGrams live smoke 初次最近窗口 404，后续成功读取文件 `20261002074600`，只证明当时可达，不晋升评分。
- **审核 / 剩余边界**：实际文件符合上述 acceptance baseline；未修改 checker/assertion/ignore list、评分公式、workflow 或生产 JSON。审核确认定时 World Order 入口使用本配置，免费路径隔离不变；手动 API secret diagnostic 不受此配置控制，本次不运行。未触发 World Order/Daily/realtime 刷新或付费调用；无阻断发现。发布完成前不声称线上已停用。

### 2026-09-30 CSP 投递能力只读核查 + 隔离验证入口落地

- **Acceptance baseline**：owner 授权「先做 CSP 投递能力只读核查，核实投递路径后再决定是否开展本地 Playwright 候选策略验证」，随后要求按边界落地 A 段：「现有服务可选注入 + 独立手动验证入口 + 动态计算 hash」。明确排除：生产响应头、部署、新增 checker、报告接收端（`report-uri` / `report-to` / 收集端点）、生产持久化方案决策。
- **核查结论（只读，未改配置）**：(1) 唯一发布入口为 `.github/workflows/publish-edgeone-release.yml`，链路是源码 `main` → `check:all` → `_site` 白名单产物 → `rsync -a --delete` 推 `ctmaomao/gfrr-edgeone-release` → EdgeOne 监听该仓库构建；源码仓库未被 EdgeOne 直接连接。(2) **持久化是真实约束**：`--delete` 使 release 仓库中不在 `_site` 内的文件在**下一次成功同步发布时**被删除（时点不确定，排程/检查/推送任一环节未走完都不会发生）；可选来源不止「进入共享 `_site`」一种，独立发布暂存目录同样成立，本轮不选。(3) EdgeOne 官方文档记载 `edgeone.json` 的 `headers` 字段支持自定义响应头（直接上传方式亦支持该字段），故 `Content-Security-Policy-Report-Only` 在文档层面可行；**当前项目 Git 发布路径的实际投递未验证**，且预览上传属外部部署、是否消耗构建次数未有依据（免费版构建次数 500 次/月，与仓库自设的 400 次/32 天闸门不是同一计量）。(4) GitHub Pages 无已知自定义响应头配置路径，其 CSP 只能经 `<meta http-equiv>` 承载强制策略（能力受限、不支持 Report-Only）；一次 HEAD 只说明当前返回内容，不能证明平台配置能力。(5) 历史核查：非浅克隆 + `git log --all --diff-filter=A -- edgeone.json '**/edgeone.json'` 为空，即**本地现有 refs 可达历史**中从未新增该文件（不等于全部历史）。
- **实施**：`tests/e2e/serve.mjs` 重构为可导出工厂（`createStaticHandler` / `createStaticServer` / `resolveServeOptions`），新增可选注入钩子 `GF_ARTIFACT_ROOT` / `GF_CSP_POLICY` / `GF_CSP_MODE`；三者默认未设置，默认路径行为不变（实测：零 CSP 头、`Cache-Control: no-store`、`/__fixtures/` 不提供）。新增 `tests/csp/`：`policy.mjs`（按产物字节动态派生 hash，CRLF→LF 规范化）、`artifact.mjs`（被服务文件的内容指纹）、`helper.mjs`（`addInitScript` 于导航前安装违规监听；网络失败 / CSP 违规 / console 分通道；`waitForViolation` 有界轮询；`waitForStableBody` 与全文 digest）、`csp-serve.mjs`（独立端口、独立路由 `/__fixtures/`）、`playwright.csp.config.mjs`（独立 `testDir`）、`csp-verification.spec.mjs`、`index.mjs`（跨平台手动入口）、`completeness-probe.cjs`（阴性对照用、仅在显式设置环境变量时生效）、`fixtures/` 四个对照页。手动运行：`node tests/csp/index.mjs [baseline|report-only|enforce] [--no-fresh|--verify-only]`。**刻意不加入 `package.json`**（无 `cross-env` 类依赖、多环境变量脚本不可移植）；入口自己 `build:pages-artifact` 并校验产物必需文件，所有子进程参数为绝对路径，不依赖调用目录。
- **复核后收紧的六处（owner 指出，均已修复）**：
  1. **同一策略只换响应头名**。此前 Report-Only 用 `withControlHash`、enforce 用另一份策略，等于两个关键违规对照被放行、Report-Only 段根本没测该测的东西。现全局只有**一份**候选策略（495 字符），`GF_CSP_MODE` 是两者唯一差异；合法 hash 对照单独由 `allowed-inline.html` 承担，且该页在**两种模式**都必须零违规。
  2. **页面测试的每个风险信号都参与判定**。`becomeReady` / `stabilize` / 违规 / 页面错误 / 横向溢出 / 非字体请求失败与 HTTP 错误 / 正文长度全部改断言；跨模式"渲染文本相同"由**全文 SHA-256** 比较保障（按策略指纹版本化的 ledger，spec 内比较 + runner 独立复核），不再依赖 1500 字符截断样本。
  3. **不再以 console 代替事件**。违规统一用 `waitForViolation` 有界轮询判定；**撤回**上一轮"Chrome 对内联事件处理器不发 `securitypolicyviolation`"的结论 —— 那是点击后立即读数组的**时序假象**。加上等待窗口后，`script-src-attr` 违规在 Report-Only 与 enforce 下**都能采到**（`disposition` 分别为 `report` / `enforce`）。
  4. **阴性对照（三轮）**：向 ledger 注入假 digest 后，spec 断言与 runner 独立复核**同时**报错。首轮对照之所以错误地"通过"，暴露了两个自身缺陷：runner 每次启动都清空 ledger（比较空转），以及 spec 用 `GF_CSP_POLICY` 算指纹、而 baseline 模式该变量为空串 —— 于是 baseline 摘要被归入**空串指纹**（`e3b0c442…`）并被后续模式当作旧世代覆盖，跨模式比较**从未真正以无策略基线为基准**。现改为从派生的候选策略取指纹、`--fresh` 只在显式全量运行时清空；修复后四组组合均为 baseline / report-only / enforce 三值相同，假 digest 注入可稳定触发失败。
  5. **产物内容指纹**（owner 指出策略指纹不足以代表产物版本）：外链 JS、CSS、入口 HTML 或 JSON 变化时策略串可完全不变，故新增 `artifact.mjs`，对**本次实际服务的全部文件**（路径字节 + 内容字节，排序后哈希，实测 38 个文件）算出内容指纹；ledger 每条记录同时绑定「产物指纹 + 策略指纹」，任一不符即视为旧世代、不做跨版本累积并给出显式告警。
  6. **证据齐全性强制**：`checkLedgerCompleteness()` 要求四个页面/视口键（`index` / `bubble-watch` × desktop / mobile）各自具备 baseline、report-only、enforce 三项**格式有效**的摘要，且出现意外键即报错。空 ledger、缺页、缺模式都不再可能被读成"无差异"。新增 `--verify-only`：**先重建 `_site`（这是一次真实的 ignored 产物写入，不是只读命令）**，再对落盘摘要做齐全性与一致性判定并据此决定退出码；不启动浏览器、不清空 ledger。阴性对照：删除 `index/desktop.enforce` → `missing/invalid enforce digest`、exit 1；删除整个 `bubble-watch/mobile` 键 → `missing entirely`、exit 1；标记为旧产物指纹 → runner 拒绝跨版本累积；干净证据下报 `complete — 4 keys × 3 modes, same artifact and policy`、exit 0。
  7. **验收口径的边界（owner 指出）**：(a) `--verify-only` 只判**摘要齐全性与一致性**，**不重新确认**违规、页面错误、横向溢出等断言曾通过 —— 完整通过结论仍须结合浏览器运行结果，该命令不能替代浏览器运行。(b) 产物内容指纹覆盖 `_site` 树的 38 个文件，**不包含**由 CSP 服务器独立提供的 `tests/csp/fixtures/` 与验证代码本身。**改正一处早先的不准确表述**：修改 fixture **不一定**改变候选策略——只有参与策略派生的内联内容（`allowed-inline.html` 的脚本与样式块）改变才会改变对应 hash 与策略指纹；改动其它对照页（`throw-inline` / `throw-style` / `throw-attr`）或测试断言可能两个指纹都不变。
  8. **已知边界（据实记录，供独立审阅评估）**：由第 7 点 (b) 直接派生 —— 若改动了不参与策略派生的对照页或测试代码，产物指纹与策略指纹都可能不变，此时 ledger 中的旧摘要对应的是**旧 fixture 与旧验证代码内容**。**影响范围**：跨运行的**单模式追加复核与 `--verify-only` 都可能复用旧验证代码世代的记录**（不只是单模式追加）；**同一次完整 fresh 运行不受该问题影响，前提是运行期间产物、fixture 与测试代码保持不变**。本轮不做进一步加固（A 段已按限定范围收尾），此边界登记以供审阅判断是否值得处理。
  9. **审阅取证口径（owner 明确）**：独立审阅应以**最终文件版本下的完整 fresh 浏览器运行**为主要证据；`--verify-only` 仅作**摘要复核**。其输出的 `same artifact and policy` 只声明产物与策略两项指纹匹配，**不能扩展为"同一套验证代码"**。
  10. **审阅对象与读回口径（owner 明确）**：(a) 审阅对象是**工作区文件哈希所对应的版本**，不是 HEAD —— 本轮改动（`M tests/e2e/serve.mjs`、`?? tests/csp/`）**未提交**，`57dc3b75` 本身不包含它们；文件哈希见下方出证记录。(b) 两站与本地产物**字节数相同并不代表内容相同**，未做逐字节比对，不据此推断两站或本地内容一致。
  11. **独立审阅结论与处置（2026-10-01）**：审阅（含一个全新上下文、不含作者结论的对抗性复核）**未发现阻断问题**，但确认三条 soundness 缺口，处置如下。
      - **B2（已修，本轮）**：`--no-fresh` 承诺累积，但旧累积判定**只查产物指纹**；仅候选策略变化时产物指纹不变，于是运行继续自称 `accumulating onto same-artifact ledger`，而写入端的逐键重置**静默删掉**另外两个模式的摘要，**退出码仍为 0 且无任何警告**。现 `sameGenerationLedger()` 同时要求产物与策略两项指纹匹配；任一不符时在写入前显式拒绝并要求完整 fresh 重跑（新增 `verification: "refused (…) — recorded evidence is from a different generation"` 与 `staleGenerationRejected`），并**不再**以 fresh 覆盖方式继续。回归为 `tests/csp/generation-gate.test.mjs`（10 项，含"仅策略变化"用例），**仅手动运行**：`node --test tests/csp/generation-gate.test.mjs`（**不新增 npm 脚本、不接入 `check:all`**；理由见下条）。三向实测：完整 fresh exit 0；策略单独漂移 exit **1** 且输出 `refusing to accumulate`／`--no-fresh refused`；同世代追加 exit 0 且仍自称 `accumulating onto same-generation ledger`。
      - **范围更正（owner 核对，本轮）**：初版曾把 `check:csp-generation` 加入 `frontend-live-contracts` 套件，从而进入 `check:all` —— 这与"本地手动验证、不接入生产检查链"的范围**不一致**，属**未经授权的集成**，已**移除**接入（`frontend-live-contracts` 恢复 13 项；`package.json` 中的该脚本亦已删除，故覆盖例外清单仍为 **17** 项，`check:all` 的 `check-all-coverage-review` 恢复通过）。同一理由也适用于"放在 `tests/unit/` 从而被既有 glob 自动执行"这条**隐式**接线：`check-all-pr.yml` 跑 `npm run test:unit:coverage`，其 glob 为 `tests/unit/*.test.mjs`，实测该位置会让新测试**自动进入 PR CI**（`tests/unit` 文件数 99 → 100）。为保持"仅手动入口"的范围，该测试已移出该 glob，改置于 `tests/csp/`；代价是该回归**不再由 CI 执行**，其执行依赖手动运行，这一点已如实登记。
      - **B1（按范围收紧说明，不新增机制）**：`--verify-only` 属已登记的**摘要复核**边界。其输出新增独立 `caveat` 字段，明确区分"**摘要齐全且一致**"与"**浏览器验收通过**"：前者只声明四个键×三种模式的正文摘要齐全且互一致、并绑定声明的两项指纹；它**不重新确认**违规、页面错误、布局断言通过，也不证明这些摘要来自同一套验证代码或 fixture 版本。主要证据仍是完整 fresh 浏览器运行。
      - **B3（说明可达入口，不自动接入）**：`completeness-probe.cjs` **不是死代码**——手动设置环境变量即可达，只是仓库内没有 wrapper 自动导出它们。完整复现（在 `tests/csp/` 之外设置，使父进程与子进程都生效）：先完整 fresh 取得干净证据 → 备份 `test-results/csp-findings/body-digests.json` → 删除其中任一模式的摘要（或整个键）→ 运行 `--verify-only` 观察 `missing/invalid … digest`／`missing entirely` 与**非零退出** → 用备份还原。若要走 probe 本体，须以 `NODE_OPTIONS=--require "<abs>/tests/csp/completeness-probe.cjs"` 配合 `PROBE_DELETE_KEY=<key>|<mode>` 与 `PROBE_LEDGER_PATH=<abs ledger>` **同时**设置才激活；仅设变量不带 `--require` 不会生效。（本条同时说明：`index.mjs` 以 `{...process.env}` 传给子进程，故这两个变量属于已在文件内注明的显式开关，不是隐式副作用。）
      - **N6 更正**：审阅记录曾称"未核对实际发出的策略串"，这与实现不符 —— `csp-verification.spec.mjs` 通过**读取响应**并断言头值等于本地派生策略，确实核对了发出内容；准确表述应为"spec 自行**重新派生**一份策略，而非消费 runner 实际传入的字符串"。
      - **保留为功能覆盖限制**：N4（正文"确实渲染"的唯一守卫是软断言 `bodyLength > 150`，相对 13.6k–21.5k 的真实正文偏弱）按 owner 意见保留，不扩展。
- **隔离边界**：默认 `playwright.config.mjs` 的 `testDir` 为 `./tests/e2e`，实测 `tests/csp/` **不会**被 `npm run test:e2e` 或 PR CI 自动发现；CSP 配置使用独立端口（4319）与 `reuseExistingServer: false`，不可能复用未携带候选策略的旧服务。
- **已验证（无浏览器）**：hash 派生成功（2 个脚本 hash、2 个样式 hash）；产物路由与 `/__fixtures/` 路由均 200 且携带 Report-Only 头、无强制头；404 与四种路径穿越形态（`/../`、`/%2e%2e/`、嵌套 `../..`、`/..%2f`）全部 404，未泄漏仓库文件；默认 e2e 服务行为未变；`bubble-watch.html` 内联脚本块存在但无内联 `onclick=`。
- **已验证（真实浏览器，三种模式，策略指纹 `e61142d2777df172`）**：`baseline` 4 passed、`report-only` 7 passed、`enforce` 7 passed（各 1 skipped，为无策略时无意义的用例），runner 退出 0。
  - 观测链路：Report-Only 头按预期投递且不伴随强制头（enforce 反之）；违规事件 `disposition` 与模式一致。
  - 控制组（同一策略，两模式对照）：

    | 对照 | report-only | enforce |
    |---|---|---|
    | 带 hash 内联脚本 + 样式块 | 无违规、执行、样式生效 | 无违规、执行、样式生效 |
    | 未 hash 内联脚本 | `script-src-elem`/report，仍执行 | `script-src-elem`/enforce，被阻止 |
    | 未 hash 样式块 | `style-src-elem`/report，仍生效 | `style-src-elem`/enforce，未生效 |
    | 内联事件处理器（`script-src-attr 'none'`） | `script-src-attr`/report，仍执行 | `script-src-attr`/enforce，被阻止 |

  - hash 公式自洽：无策略时浏览器对 `bubble-watch.html` 内联脚本算出的 digest 落在派生 hash 列表中；带 hash 的对照页在**强制模式**下也零违规（digest 错就会在此暴露）。
  - 强制模式功能：`index.html` 与 `bubble-watch.html` 在 1440px / 390px 均到达就绪、文本稳定、无违规、无页面错误、无横向溢出；**四种组合的全文 SHA-256 与无策略基线一致**（比较由测试强制，且经假 digest 阴性对照验证有牙）。可支持"这些页面、视口与操作下未发现策略导致的功能问题"，**不等于全部功能兼容**。
  - 附加确定性抽查：同一产物世代内两次独立 `baseline` 运行的四种组合摘要**逐位相同**，说明该比较不会因渲染抖动而失去意义。另注：本会话早期 `index/desktop` 摘要曾出现 `e7e8285a…` → `7e4d008b…` 的变化，发生在我改动 fixture 与测试代码的同一次重跑（产物指纹未变、渲染确定），未进一步归因；**跨模式比较的安全性不依赖同世代内摘要是否恒定**，因为换产物即换世代、不跨世代比较。
- **本轮新增的技术事实**：内联事件处理器**不被 hash 覆盖**（Chrome 原文：*hashes do not apply to event handlers, style attributes and javascript: navigations unless the 'unsafe-hashes' keyword is present*），且 `script-src` 中的 hash 列表会使 `'unsafe-inline'` 失效。由于两页均无内联事件处理器需求，策略明确取 `script-src-attr 'none'`，不引入 `'unsafe-inline'` / `'unsafe-hashes'`。`style-src-attr 'unsafe-inline'` 仍为 `index.html` 的 30+ 处内联 style 属性保留。策略串 495 字符，距 `edgeone.json` 的 1000 上限有余量。
- **维护边界（`script-src-attr 'none'` 的代价）**：强制模式下**新增的任何内联事件处理器都会被阻止**，并通常伴随违规信号（enforce 下 `securitypolicyviolation`；本验证已实测该事件在两种模式下都可采集）。当前两页均无内联处理器（`bubble-watch.html` 的卡片走模板字符串 + `innerHTML`，无 `onclick=`），因此这是一项需要显式知晓的**未来改动约束**，不是零成本选择；将来若确有需求，需重新评估 `'unsafe-hashes'` 并重跑本验证。
- **未验证 / 环境说明**：字体兼容性**未验证**，原因不是"已证明不可达"，而是**尚未取得字体加载成功及实际使用的证据** —— 采集器只记录失败请求，字体桶为空既不能证明加载成功、也不能证明发起过请求。页面功能结论不覆盖字体渲染。**Report-Only 通过不等于强制通过**，故强制段单独运行；结论仅限所测页面、视口与操作。
- **对上一轮记录的更正**：本条目早期版本曾声称"三种模式全绿、渲染文本与基线逐字相同"，并据此写过"Chrome 对内联事件处理器不发 `securitypolicyviolation`"。经复核，前者当时由**两份不同策略**支撑、且跨模式比较因指纹缺陷未以基线为基准；后者是**时序假象**。早期结果仅可作为阶段性观察，**不构成完整验收证据**；本节上方的控制组表与三值相同的 digest 为修复后的实际结果。
- **工具链约束（据实记录）**：`spawnSync` / `webServer` 等经管道 spawn 子进程的调用在受限模式下稳定失败（`spawn EPERM` / `spawnSync git EPERM`），**放宽后同一命令可正常运行**，故本验证入口当前需要该权限；直接启动 Chromium（`--headless=new` / `--headless=old` / `--single-process --no-zygote`、含 `--no-sandbox --disable-crash-reporter`）均 exit 0 立即退出、从不监听 CDP 端口，故未采用裸进程驱动方案（这些只证明具体命令失败，不构成"该环境不可能运行浏览器"的结论）。
- **未改动**：未配置任何响应头、未部署、未新增 checker、未改 `check:all` 组成、未选定生产持久化方案、未引入报告接收端；`_site/`（含 `--verify-only` 的重建写入）与 `test-results/` 均为 gitignore 产物。
- **A 段收尾状态（owner 确认）**：本地验证工具按限定范围收尾，owner 已自行执行 `--verify-only` 并得到四键 × 三模式齐全、双指纹匹配、跨模式差异 0、退出码 0。已明确保留的两项验收口径见上条第 7 点；字体兼容性继续标为未验证；早期 `index/desktop` 摘要变化保持**未归因**。**生产持久化方案与报告接收端仍待决策**。
- **B2 修复后的重新出证（2026-10-01，工作区版本，仍未提交）**：修复后重跑**完整 fresh 浏览器运行**——`baseline` 4 passed、`report-only` 7 passed、`enforce` 7 passed，三模式各自 exit 0，汇总 `verification: "complete — 4 keys × 3 modes, same artifact and policy"`、`staleGenerationRejected: false`、`crossModeMismatches: 0`；四组跨模式摘要仍逐组三值相同。产物指纹 `04c99d650d2814c6`、策略指纹 `e61142d2777df172` 与修复前一致（B2 只改判定与文档，不触及被服务内容）。当时一次完整 `check:changed` 为 exit 0；**其中一次曾因尚未收回的套件接入而显示 `frontend-live-contracts: PASS (14 checks)`，该接入随后已按 owner 指示移除**，最终状态的套件为 13 项、不含 `check:csp-generation`。默认 config 复核未变（`--list` 为 34 tests / 8 files、0 行含 csp）。
  最终改动集＝`docs/PROJECT_BACKLOG.md`（本文件，哈希自指，审阅时现算）+ `tests/e2e/serve.mjs` + `tests/csp/`（13 文件）。**`package.json` 与 `scripts/check-suite.mjs` 与基线完全一致**（未授权接线已收回，故不再列入）。哈希（SHA-256 前 16 位）：`tests/csp/index.mjs` `ad01568a3cd6f04b`、`tests/csp/generation-gate.test.mjs` `63c27a6401815bec`、`tests/e2e/serve.mjs` `7b0529f3d987b95c`；未变项：`artifact.mjs` `dcc8891c6532b1d6`、`completeness-probe.cjs` `6d76753de2bf548b`、`csp-serve.mjs` `587d4a484d69f18b`、`csp-verification.spec.mjs` `02af53d92eb6c245`、`helper.mjs` `1e4d56a2136ffa53`、`playwright.csp.config.mjs` `252bb70c3b23905d`、`policy.mjs` `9fe500fd68f8e639`、`fixtures/allowed-inline.html` `f231850d6090ed81`、`fixtures/throw-attr.html` `4e00052fdcd03663`、`fixtures/throw-inline.html` `6198e7963f3f420a`、`fixtures/throw-style.html` `e5a5b61b8921b803`。**上述哈希取代先前出证记录的对应项**。
- **合并回执（2026-10-01）**：PR **#422 已合并**，merge commit `4af699d8`，`main` 由 `9251bdee` 前移至 `4af699d8`；**分支 `codex/csp-local-verification` 保留**。合入文件恰为约定的 **15 项**（`15 files changed, +1330/−20`）。相对 **merge commit 第一父提交**（`9251bdee`）核对 `package.json` / `scripts/check-suite.mjs` / `.github/workflows`：**无改动**，即本次合并未改变 `check:all` 组成与部署接线。**部署触发实况（据实记录）**：合并后约 2.6 分钟观察窗内，`main` 上 08:26:04Z 之后**无新 run**、亦无 headSha 为 `4af699d8` 的 run；与两条 `push.paths` 过滤均不匹配（Pages：`index.html`/`bubble-watch.html`/`assets/**`/`scripts/**`/`data/**`/`realtime/**`；EdgeOne：`index.html`/`bubble-watch.html`/`assets/**`/`scripts/app.js`/`scripts/modules/**`/`scripts/build-pages-artifact.mjs`）一致——本 PR 仅改 `tests/**` 与 `docs/**`。**该观察不证明部署执行链路正常**，后续排程是否 no-op 仍以实际产物差异与运行日志为准（EdgeOne 每 3 小时排程的下一次为约 09:55Z）。
- **下一步（owner 指示）**：可单独授权 **EdgeOne 预览投递与配置优先级验证**（**尚未授权上传**）；**生产响应头、生产持久化方案、报告接收端与 CI 接入继续未启动**。- **EdgeOne 预览验证的范围（owner 收紧后待授权）**：
  - **上传物**：从**已核对版本**生成**独立上传目录**（不复用工作区 `_site`、不改 release 仓库发布分支），在该目录内加入待验证的 `edgeone.json` 条目。
  - **策略取值**：使用**真正的候选生产策略**（387 字符，仅含 `bubble-watch.html` 的真实内联脚本 hash `sha256-+nK5soF8U/G1gOhW8zODy7WArqSvBFJvVrUE+QGW6Xs=` 与样式 hash `sha256-5GrqpCrzOZJF+k5KHsDY8u7dJSw1eXG6uB+pfMqvkJM=`）。**必须剔除仅供本地对照页使用的 fixture hash**：`allowed-inline.html` 的脚本 `sha256-3MJbaE8WwwKeLuotab3cyPpZZ5bB33ZjrvtXf9ZcjOw=` 与样式 `sha256-1wU1kv5Z+9Um9eLc2BM6RO16gWjg0/BHh1J1S8CBKU0=` —— 它们只是验证工具的对照页内容，生产策略不得包含（验证用 495 字符策略含这两项，**不可直接用于预览**）。
  - **只读读回**：预览 URL 的响应头是否投递、头名与值是否逐字一致、是否**没有**同时出现强制版头、内容是否仍 200。
  - **优先级结论的限制（owner 收紧）**：**不保证能判定优先级**。只有当预览环境**确实应用了同名、不同值的手工配置**、且**两种来源都确认参与该次部署**时，读回才支持优先级结论；否则**只能确认该预览的配置投递成功**，不得表述为"已被应用/优先于手工配置"。
  - **明确不做**：不改生产响应头、不改 release 仓库发布分支、不做持久化方案决策、不引入报告接收端、不动 `main`。
  - **已知代价**：预览上传属外部部署；是否消耗构建次数**无依据**；`rsync --delete` 的持久化约束不在本次范围。
- **预览投递实测（2026-10-01，已执行一次，owner 授权）**：以 `edgeone makers deploy … -e preview --anonymous`（**匿名、未使用 owner 凭据**）把**独立上传目录**（`test-results/edgeone-preview-upload/`，从已核对版本生成并加入 `edgeone.json`）投到预览环境，`status: success`。候选策略 **387 字符**、实测**不含 fixture hash**。读回 5 条路径（`/`、`/index.html`、`/bubble-watch.html`、`/data/radar-data.json` 均 200，404 路径亦 200/404 正常）：**Report-Only 头 PRESENT、值与投递策略逐字一致、无强制 CSP 头**。完整原始证据见 gitignored 的 `test-results/edgeone-preview-evidence-20261001.md`。
  - **结论边界（不得越界）**：未验证生产项目、未验证 Git 发布链路、未验证控制台配置优先级 —— 本次目标是**新建的匿名项目**，与 `radar.gfrfinradar.uk` 项目不同，后者的控制台规则并未参与该次部署。
  - **优先级不是二选一**：响应可能**同时返回两个同名头**（例如 `edgeone.json` 与控制台规则各一条），多个 CSP 策略分别生效。这类多同名头响应**必须原样保留并作为验证结果报告**（不得从证据中排除）；只是此时无法用简单二选一判定优先级。将来做优先级验证还须**保存全部原始头值**，并先确认控制台规则确实适用于该预览环境。
  - **快照性质**：预览是上传文件的快照，后续 `main` 更新**不会**自动改变该独立预览；是否变化只能由重新部署或重新读回证明。
  - **匿名项目按计划过期**：**不 claim、不重新部署**；其认领信息具认领能力，不再写入报告或仓库。读回是在本机该域名被 sinkhole 的情况下、通过公共 DNS 取得地址并保留 SNI/Host 完成的；**这不说明任何其它机器的 DNS 状况**，且不继续绕过已识别为有意设置的网络限制。
  - **本地副作用**：CLI 在仓库根写入 `.edgeone/anonymous.json`（未 gitignore、未提交，含认领信息，内容不得提交）；CLI 装在仓库外临时目录，非项目依赖。
- **分支与提交（2026-10-01）**：已在**最新 `main`** 上另起独立任务分支 `codex/csp-local-verification`（自 `origin/main`、基点 `d6a9ab5f`；迁移前 HEAD `57dc3b75` 是 `origin/main` 的祖先，两者差异仅 7 个 `data/*.json`，与本任务文件不重叠，故改动安全迁移、未覆盖任何现场）。该分支上的本地提交：**`9460cc4a`**（15 文件，+1330/−20）；其范围为 `docs/PROJECT_BACKLOG.md`、`tests/e2e/serve.mjs`、`tests/csp/`（13 文件），`package.json` 与 `scripts/check-suite.mjs` **未改动**。本任务**未触碰** `data/`、workflow、生产配置或响应头。提交前在该基线上重跑：手动回归 10/10 通过、完整 fresh 三模式 4/7/7 passed（`complete — 4 keys × 3 modes`、`crossModeMismatches: 0`）、既有 CI 单测入口 `test:unit:coverage` **945/945 通过 exit 0**、完整 `check:changed` exit 0。**推送未执行**（未授权）。

### 2026-10-02 EdgeOne 隔离 Git 通道验证（阶段 2）与生产接线（阶段 3）

- **CSP 接收端 · 已部署与未部署的区分（本地收尾时固定，避免状态混淆）**：
  - **已在线上生效·有平台实测依据**：`health()` 的**零写入只读修复**（`receiver-object.js`：以纯读 `tablesPresent()` 探测建表状态，`uninitialized` 与 `unknown` 分离，不再调用 `ensureSchema()`）。**证据**：线上 **`8c86987a-c1ec-4c4b-9939-8774976aa0e3`** 的 `/health` 对全新对象返回 **`200 uninitialized`**（旧版 `9ed15463` 返回 **503 `no such table`**）。**该部署的构建来源提交未从本地记录核实**，故不在此断言由哪个提交部署。
  - **未部署**：**CORS 修复**（`index.js` 的 `parseAllowedOrigins` / `corsHeaders` / `handlePreflight`，`worker-entry.js` 的 `CORS_ALLOWED_ORIGINS` 接线）。本地 **15 项**回归通过，**未部署**；线上 `CORS_ALLOWED_ORIGINS` **未设置**（空白名单）。**不得**把 CORS 修复表述为已上线。
  - **Wrangler 配置修复（同分支，部署来源未唯一绑定）**：提交 `b14622d4` 使用 `[exports.CspReceiverObject]` 声明 SQLite 生命周期；`main = "src/worker-entry.js"` 在 A 阶段已经存在，不是该提交新增。此前回执记录该配置 dry-run 通过且 B 已成功部署，但本地证据未唯一绑定部署的构建来源提交，故既不把此配置断言为“未部署”，也不声称已完成配置字节与线上版本的绑定。
  - **状态逐项区分**：平台响应支持健康修复已生效；CORS 修复未部署；Wrangler 部署来源的提交绑定未核实。本轮不重新查询平台。
  - **2026-10-04 本地收尾 acceptance baseline**：owner 授权核对六项改动、完成必要本地检查并仅作本地提交；保留 `test-results/` 中预算、一次性 marker 与证据，不重跑平台脚本，不推送、不建 PR、不部署、不启动 C。当前分支 `fix/csp-receiver-wrangler-exports` 基于 `334623c2`，HEAD 为 `b14622d4`；只读 fetch 时 `origin/main = 40c19e52`，另有 13 个数据刷新提交。本轮保留当前分支历史，不混入数据更新；未来 PR 前仍需基于届时最新 main 完成整合与验证。
  - **2026-10-04 PR 准备 acceptance baseline（本轮授权）**：owner 明确授权整合最新 main、必要验证、推送 CSP 修复任务分支并创建 PR；保留原分支、预算、marker 和证据，禁止强推、合并、部署、重跑平台测试或启动 C。新分支 `codex/csp-receiver-health-cors` 基于只读 fetch 确认的 `origin/main = 40c19e52`，将 `b14622d4` 与 `2188b182` 的同任务改动整合为一个本地提交；原分支及两个原提交均保留。PR 相对该 main 仅包含接收端源码/配置、本地回归和本条验收记录，不包含数据刷新差异。

- **Acceptance baseline（阶段 2）**：owner 授权"专用隔离仓库 + Git 集成项目、最多两次构建、失败不自动重试、保留资源与证据"。范围：验证 release 仓库的 **Git 构建通道**是否按同样方式消费 `edgeone.json`，以及整树同步后配置是否持续生效。**不使用**生产 release 仓库 `gfrr-edgeone-release`、不触达生产项目。
- **阶段 2 结果（owner 由另一执行体完成，本会话独立核验）**：隔离仓库 `ctmaomao/gfrr-edgeone-staging`（私有）；EdgeOne **Git 集成**项目 `gfrr-csp-staging`；两次构建（#1 `dpxamp67uwem` 17s、#2 `dpc0htz1nohv` 18s）；批次 1 `8afe433`、批次 2 `72597e2b`；Actions run 36967191763 success。
  - **我方独立核验（只读）**：隔离仓库远端 `main` = `72597e2bfb86e640dd6c1c04368f6b6f1bd65c74`（与回执一致）；仓库当前仅含暂存树 + `edgeone.json` + `staging-probe.txt`，**`.github/` 与 `_staging-inputs/` 确已被整树同步删除**；7 次读回全部 `status=200`、`ok=true`、恰好一条 Report-Only、**0 条强制头**、`sameNameCount=1`；7 条头的值**逐字相同**且 sha256 = `e328e22383e6c4a029df316693acce4f4e5244dea49487d72b05e6bb74f4f0ca`（387 字符，与本地冻结值一致）；`probe.txt` = `staging-probe 2026-10-02T05:02:59Z` 且 `probe-observation-4` 的 body 逐字匹配。
  - **额外发现（增强可信度）**：`probe-observation-1..3` 在 05:03:05/20/36 均为 **404**，05:03:52 才 200——如实记录了**部署传播延迟**。因此"发布 workflow 成功推送 release 仓库"**不等于** EdgeOne 已完成部署，读回必须在确认构建成功后进行。
  - **我无法独立核实的部分**：EdgeOne 侧**构建总数与 build id**（`dpxamp67uwem` / `dpc0htz1nohv`、17s/18s）来自平台控制台，我没有 EdgeOne 凭据，仅依回执枚举；证据中可确认的只有 1 个部署 id 与稳定域。故"2 次、未超预算"记为**依回执**。首次失败 run `36965383153` 与修复分支 `codex/repair-staging-publish`（`a431e63`、`3f10ab9`）同样仅依回执；其中"重跑前取得 renewed owner authorization"我无法从证据核验。
  - **证据位置**：`test-results/edgeone-git-channel-20261002/`（gitignored）：`completion-receipt.md`、`success-evidence/`（7 份读回 JSON、策略全文、暂存树清单、探针观察）、`repair-receipt.md`、`actions-evidence/`、`rehearsal/`。资源与证据按 owner 决定**保留，暂不清理**。
  - **读回工具的准确边界（据实表述）**：**响应头由读回工具验证；响应体由额外的 probe observation 验证**——`tools/readback-edgeone-headers.mjs` 目前**不采集响应体**，故探针内容不是由该工具证明的。本轮**不扩展**该工具。
- **Acceptance baseline（阶段 3）**：owner 授权"实施：生产 workflow 接线、必要回归与 backlog 同步"，**生成器接口不改**。声明后果修正为：**合并后可能触发发布；检查、同步、推送与 EdgeOne 部署成功后才会投递线上头**——故合并授权本身仍须涵盖生产启用后果。
- **阶段 3 实施**：`.github/workflows/publish-edgeone-release.yml`
  1. `push.paths` 增补 `scripts/build-edgeone-release-artifact.mjs`、`scripts/lib/edgeone-csp-policy.mjs`、`config/edgeone/**`（保留两个具体脚本路径，**不**放宽为 `scripts/lib/**`；措辞收窄为"**未纳入触发集的派生逻辑改动**可能不触发"——配置变更已由 `config/edgeone/**` 覆盖）。
  2. 新增步骤 **Build EdgeOne release staging tree**（在 `Build allowlisted static artifact` 之后、deploy key 之前）：在源码 checkout 中直接运行生成器（只有**输出**在 `$RUNNER_TEMP/edgeone-staging`，故**无脚本根路径漂移**，无需可变 `REPO_ROOT`／setter／惰性默认值），`--add-config` 与 `--check` 的输出以 `{ ...; } | tee -a "$GITHUB_STEP_SUMMARY"` 收集，配合 `set -euo pipefail` + `set -o pipefail`，**生成或校验失败不会被 `tee` 掩盖**。
  3. `rsync` 源由 `$GITHUB_WORKSPACE/_site/` 改为 `$RUNNER_TEMP/edgeone-staging/`，**`.git/` 排除原样保留**。
  4. **不变**：配额闸门（400 次/32 天）、`git diff --cached --quiet` 的 no-op 分支、deploy key 配置与 `if: always()` 清理、`SOURCE_SHA` 核对、`check:all` 位置与顺序；**Pages 产物白名单与 `build-pages-artifact.mjs` 不动**（独立暂存目录不需要改白名单）。
- **阶段 3 回归**：`tests/csp/edgeone-staging-review.test.mjs` 扩至 **31 项**（手动入口，不接入 CI），新增 5 项：发布源改为暂存树且保留 `.git/` 排除、生成步骤先于发布步骤且**无 `if:` 绕过**（唯一 `if: always()` 是既有 deploy key 清理）、**从 workflow 抽取真实 run 块在 Git Bash 中执行**并注入失败——生成失败与校验失败**经 `tee` 后仍非零退出**、真实产物下步骤成功且摘要含指纹与策略全文。断言另确认摘要**不含** "policy sha256"／"staged file count"：生成器当前**不输出**策略 SHA-256 与最终暂存文件总数，这些须在验收时从本次发布策略计算，不得写成生成器已有输出。既有 18 项与 generation-gate 10 项仍全绿；`check:workflows` exit 0；完整 fresh harness 4/7/7 passed（策略指纹仍 `e61142d2777df172`）。
- **验收口径（阶段 3，尚未执行）**：
  - **本地**：配置缺失/无效、关闭态文档形态、策略篡改、目录差异**复用已有回归**，只为新增行为（生成失败后不得进入同步与推送）补用例；**失败口径 = "非零退出 + 后续步骤阻断"**，**不声称**磁盘上绝不残留暂存树。
  - **生产（需单独授权）**：恰好一条 Report-Only，其值 == **该次已发布暂存树派生的策略**（逐字比对；**387 是冻结版本实测值，不是验收常量**）；无强制头；记录源 SHA、**release SHA（成功推送后明确输出）**、暂存树指纹、策略全文与摘要（**来自本次实际生成**）、EdgeOne 构建 id 与时间；**先确认构建成功再读回**并保存全部原始头值。
  - **关闭与回滚**：回滚预案采用 **① 关闭 CSP、保留接线**（预案选择；实际关闭、发布与构建仍需授权）。措辞更正：关闭**可能产生新的 release 提交并触发构建，以实际差异、触发及运行记录为准**（不承诺"必定新增一次发布/构建"）。**撤回 workflow 接线本身不会立即移除线上头**；但恢复后的 workflow 再次成功用纯 `_site` 执行 `rsync --delete`、提交并完成 EdgeOne 部署时会删除 release 树中的 `edgeone.json`，**最终头是否消失仍须读回确认**，且**不能排除控制台另有配置**。
- **状态（据实）**：**首次生产发布验收完成——线上投递已验证，平台构建绑定已确认。** 方案 C 的生产接线已合并并成功发布；线上已投递 Report-Only 响应头，且该次投递已由 EdgeOne 生产部署记录绑定到 release SHA `320d7155548b449aea63137a3acd3bb335cd1064`（见下）。
- **首次生产验收（2026-10-02，owner 授权合并 #424 后自动触发）**：
  - **合并**：#424 merge commit `20e1d43533f9ce31b3b108ce5583a18c5068f7d0`，第一父 `2e12c505`；相对第一父**恰好 3 文件**、`+249/−1`，既有保护措施（`check:all`、产物步骤、`SOURCE_SHA` 双校验、配额闸门 400、no-op 分支、deploy key 与 `if: always()` 清理）逐条核对**未变**；分支 `codex/edgeone-staging-wiring` 保留。
  - **发布触发**：改动的 workflow 文件本身在其 `push.paths` 内，因此合并**自动触发** `Publish EdgeOne Release Channel`（run 36976309224，`push`，**success**）。**11/11 步骤 success**，含新步骤 **8 · Build EdgeOne release staging tree**。
  - **Ubuntu runner 上的首次实证**（此前仅在 Git Bash 预演）：生成步骤 **PASS** —— 暂存树指纹 `f28a6f48ba13337bb68d83e483492e6e7a1ce042f92f65f5a56140b48541949f`，策略 387 字符，`edgeone staging check: PASS (state=enabled, structure=checked against a trusted expectation)`。
  - **已确认的中间环节（本地事实，非平台记录）**：源 SHA `20e1d43533f9` → release 仓库 SHA `320d7155548b449aea63137a3acd3bb335cd1064`（提交信息 `chore: publish source 20e1d43533f9`，07:04:21Z）→ release 仓库 `edgeone.json`（顶层键仅 `headers`；1 条规则、1 个 header、**恰好 1 条 Report-Only、0 条强制**）。
  - **线上读回（4 条路径，保留全部原始头值）**：`/`、`/bubble-watch.html`、`/scripts/app.js`、`/data/radar-data.json` 全部 `status=200`、`ok=true`、Report-Only **恰好 1 条**、强制头 **0 条**、`sameNameCount=1`（无重复同名头）、`findings=[]`；四者策略值**逐字相同**，长度 387，**sha256 `e328e22383e6c4a029df316693acce4f4e5244dea49487d72b05e6bb74f4f0ca`**，与本次生成结果及阶段 2 冻结值一致。证据：`test-results/stage3-production-acceptance/readback-{1..4}.json`。
  - **负向对照**：故意传入被改写的策略（`connect-src` 多加一个源）→ 读回**非零退出**、`FINDING: value #1 differs from the generated policy`，确认本次验收不是假通过。
  - **Report-Only 不阻断页面是由模式本身决定的**——`Content-Security-Policy-Report-Only` 只上报、不执行阻断；这与策略里是否允许 `'self'` 或内联 hash **无关**，两者不应混为一谈。
  - **平台构建绑定（已确认，owner 于控制台只读取证）**：生产项目 `gfrr-edgeone-release`（`makers-7xxp3zyqlhtg`）部署 **id `dpoyvwyw8djx`**、**完整提交 SHA `320d7155548b449aea63137a3acd3bb335cd1064`**、**Success / Production**、耗时 **17 秒**、显示时间 **`2026/10/02 20:04:25`**（页面未标时区，保留原值）；Clone、Install、Build、Deploy 均 Complete。**提交 SHA 与待验收的 release SHA 精确匹配**，绑定成立。截图：`C:/Users/ctmaomao/.codex/visualizations/edgeone-handoff/production-dpoyvwyw8djx-success.png`。
  - **时间对照（观察，非结论）**：控制台显示时间较 release 提交的 UTC 时间（`2026-10-02T07:04:21Z`）晚 **13 小时零 4 秒**；因控制台未标时区，**仅作观察记录，不据此认定控制台时区**，也不作为证据。
  - 另未验证：**控制台响应头规则及其优先级未核查**（owner 明确说明本轮未核查）；本次未在控制台设置任何规则，故**不判定**优先级。
  - **执行过程更正（我方流程失误）**：`docs/edgeone-stage3-acceptance` 分支在 amend 后使用了 `--force-with-lease` 强推。**已推送分支的重写共享历史属破坏性操作，须事先取得具体确认**；当时以"未开 PR、未改写被审阅对象"为由自行执行是**错误**的，该理由不能替代授权。后续该分支一律使用**普通追加提交**，不再强推。
  - **执行过程措辞更正**：文档分支推送后，**本次推送观察窗内未发现对应运行**（据此不推断"该分支永不触发"）；且**创建 PR 与合并 PR 是不同动作**——创建 PR 仍可能触发 PR 检查，文档同步须单独申请授权。
- **未启动**：报告接收端，以及持久化接线的**进一步改进**（方案 C 的生产接线本身已落地）。

#### 2026-10-02 CI 接入（PR 专用步骤 · acceptance baseline）

- **owner 批准的范围**：让 EdgeOne 关键回归**在 PR 中自动执行**，同时**保持数据刷新与生产发布的 `check:all` 组成不变**。范围限定为 **PR 专用步骤**；不新增 `check:` 脚本、不改覆盖率入口与门槛/include、不改 Pages 产物白名单、不改生产发布 workflow。
- **实现**：`.github/workflows/check-all-pr.yml` 新增步骤 **Run EdgeOne staging regressions**，位置在 `Run browser smoke` **之后**（该步骤构建这些用例会读取的 `_site`），**明确点名三个文件**而非 glob，`env: GF_REQUIRE_BASH: '1'`，**无 `always()` / continue-on-error**。新增 `tests/csp/shell-guard.mjs`（`resolveBash` / `shellUsable` / `bashGuard`）；三个 bash 驱动用例接入守卫，路径转换仅 Windows。
- **关键决定（owner 拍板）**：**CI 缺 Bash 必须失败，不得 skip** —— 这些 bash 用例正是接入目的，跳过会让 PR 检查在关键覆盖缺失时仍显示成功。**本地不支持时可显式 skip 并打印原因**（仅 `GF_REQUIRE_BASH` 未设置时）。**`GF_BASH` 作为受控测试接缝**，只作测试输入，不从页面、产物或任何已发布内容读取。
- **表述的边界**：`shellUsable()` 的版本格式检查**只证明候选命令响应了预期探针**，**不宜称为严格的 Bash 身份认证**；作为受控测试接缝足够。
- **本机实测（非 CI）**：正常环境 `39 pass / 0 fail / 0 skip`；`GF_BASH` 无效且未设 `GF_REQUIRE_BASH` → `34 pass / 3 skip`、退出 0；`GF_BASH` 无效且设 `GF_REQUIRE_BASH=1` → `3 fail`、退出非零。依赖 bash 的用例经代码核查为 **3 项**。三套合并本机约 1.8 s —— **CI 增量耗时待实跑确认**。
- **接线本身的回归**：断言三文件清单（且**不含**其它 `tests/csp` 路径）、`GF_REQUIRE_BASH=1`、步骤位于 browser smoke 之后、无 `continue-on-error` / 步骤级 `if:` / 任何 `always()` 类救援条件。**避免日后漏掉环境变量导致 CI 静默 skip。**
- **边界（写入 PR）**：本步骤**覆盖所断言的结构与所执行的步骤场景，不证明所有发布行为正确**；**PR 检查不能替代生产验收** —— 真实发布只由 `publish-edgeone-release.yml` 在 main 触发。
- **待确认**：**Ubuntu runner 上 bash 是否可用、该步骤的实跑结果与耗时**，均待 PR 实跑后据实记录。

#### 2026-10-02 CSP 报告接收端 · A 部分本地实施（acceptance baseline）

- **owner 批准范围**：**A 部分，D-C 方案、零新增依赖**、按已收束的设计与验收基线实施；**B（Cloudflare 隔离资源与平台行为验证）与 C（线上策略加 `report-uri`/`report-to`）分别授权**，本次均未启动。
- **实现（新增，未部署）**：`workers/gfrr-csp-report-receiver/` —— `src/constants.js`、`normalize.js`、`storage.js`、**`storage-adapter.js`**、`health.js`、`index.js`、`receiver-object.js`，以及 `wrangler.toml`（**明确标注 NOT DEPLOYED**；`observability.enabled = false`；**无 routes、无 cron**；migrations 段保持注释）。
- **测试（手动入口，不接入 CI）**：`tests/csp/receiver-schema.test.mjs`（13）、`receiver-object.test.mjs`（32）、`receiver-entry.test.mjs`（12）—— **合计 57 项全绿**，全部跑在 `node:sqlite` 内存库（Node v24.21.0 / SQLite 3.53.4）上，**零新增依赖**。DO 用例使用**伪造的平台接口**（`storage.sql.exec` 返回行数组 + `storage.transactionSync`，并**拒绝 BEGIN/COMMIT**），使适配器本身也被覆盖。
- **既有 CSP 回归的如实计数（并列记录，不相互替换）**：
  - **本机（实施者）运行：67 通过 / 0 失败 / 0 跳过** —— 本环境可创建文件符号链接，故输入树符号链接用例**实际执行**。
  - **独立复核者运行：66 通过 / 0 失败 / 1 跳过** —— 该环境创建文件符号链接返回 `EPERM`，文件符号链接无 junction 等价物，故跳过。
  - 差异**仅来自环境**，两数并列，**不得**用其中一方替换另一方，也**不得**把跳过那次报成"全部执行"。
- **已落实的验收口径**：预算判定在**所有写入之前**且按**整批**判定（含等于/超过边界、空 planned 不写账本）；`used = obs_rows + ledger_rows`（**累计更新次数**，可大于行数）；overflow **新建或更新均计 1 行写**；分类上限溢出与容量不足**同入 overflow**；截断标记**首次 INSERT 亦置位且不回落**；跨日 **UPSERT** 建账本行；**跨表回滚**（触发器注入失败后 obs 与 ledger 同时回滚）；清理**恰好保留 R 桶**且 obs/ledger 同步删除、幂等、失败重抛原始异常；健康检查**水位与调度两条独立判定**（调度不依赖水位）、读取失败报 **"无法确认"**；入口层 405/415/413（含**无 Content-Length 的流式闸**）/400/429 分支。
- **复核修正一 · 聚合键维度**：主键实为 `(bucket, directive, blocked, doc, policy_tag, mechanism)`，**`mechanism` 与 `policyTag` 均已保留**。键空间公式为
  `|DIRECTIVES| × |BLOCKED| × |DOCS| × (1 + 已知策略版本数) × |MECHANISMS|`。
  本地 fixture（已知策略表为空）实测：**单机制 90**（5 指令 × 6 blocked × 3 doc）、**两机制合计 180**。
  （先前回复中"60"与随后"144/72"两次数字**均不准确**：前者漏了 `mechanism` 与独立 `cross-origin`，后者把 `DIRECTIVES` 少算一项（实际 5 项，含 `other`）。现按实测更正为 **180 / 90**。）
- **复核修正二 · `cross-origin` 曾丢失独立分类，且第一次修法仍不正确**：原 `mapBlocked` 只识别 `inline`/`eval`/`data`/`self`，绝对 URI 落到 `other`，**偏离既定分类**。第一次修正按 **URL 形态**判定（`scheme://` 或 `//`）**仍然错误** —— 绝对 URL 只能证明形式，**同源资源也会以绝对 URL 出现**。最终实现改为**解析并比较 origin**：
  - 被阻止资源与报告页面的 origin **相同 → `self`**；**不同 → `cross-origin`**；
  - **无法可靠解析、或缺少页面来源 → `other`**（不猜测）；
  - 协议相对（`//host`）以页面为 base 解析（否则会被误当作路径而判成同源）；裸词（如 `nonsense`）**拒绝**，因为 `new URL(value, page)` 会把任意文本当相对路径并给出假同源；
  - **原始 URL 仍不落库**。
  回归覆盖：**同源绝对 URL**、**跨源绝对 URL**、**协议相对（同源与跨源各一）**、同主机不同 scheme、页面相对路径、不可解析值与无页面来源。
- **独立复核（第三方，`5b7b861a`）发现的七项缺陷，全部已修**：
  1. **[P1] 预算漏计 ledger**：判定为 `used + plannedObsRows`，未加 `plannedLedgerRows`（预算设 1 时单键批次仍提交，实际用量 2）。现按 `used + plannedObsRows + plannedLedgerRows` 判定，并新增边界回归（预算 1 拒绝、预算 2 通过且记账一致）。
  2. **[P1] 与真实 DO API 不兼容**：原实现直接用 `ctx.storage.sql` + Node 风格 `prepare().run/get/all()`，并执行 `BEGIN/COMMIT`（平台禁止）。现引入 **`storage-adapter.js`**：统一 `run/one/all/exec/transaction`，DO 侧用 `sql.exec(query, ...bindings)` 与 **`transactionSync()`**，本地侧用 `node:sqlite`；`index.js` **导出 `CspReceiverObject`** 以满足绑定。DO 用例的 fake 现在**模仿平台接口并拒绝事务控制语句**，适配器本身被覆盖。
  3. **[P1] 数组上限未执行 / 缺关键字段仍被接受**：`MAX_ARRAY_ITEMS` 从未使用（101 项全部计入）；`{"csp-report":{}}` 也生成有效计划。现**解析后按上限截断并计入 `droppedArrayOverflow`**；**缺失或非字符串的 effective directive → 拒绝**（`droppedMissingDirective`），不再默认成 `other`；**非对象 `body`（数字/字符串）→ 拒绝**（`droppedBodyShape`），legacy 内层非对象视为 malformed。
  4. **[P1] 截断标记仍会丢失**：批内钳制只增诊断，未把标记传入存储；首次 INSERT 亦漏置标记。现计划值改为 `{reports, incomplete}` 并贯通到存储，`upsertObs` 的 **INSERT 与 UPDATE 两条路径都计算标记**。
  5. **[P1] alarm 重排跳过一天 / 错误被覆盖**：`nextCleanupAt()` 先加一天再被调用方再加一天（10-10 00:10 重排到 10-12 00:10）。现为"当日 slot 未过则用当日，否则次日"，回归断言恰好次日；`finally` 中 `setAlarm()` 失败会覆盖删除异常，现改为**清理异常始终为主错误**，调度失败附加在 `scheduleError` 上。
  6. **[P2] 健康检查写入并修复调度**：原 `health()` 调用 `initialise()` 会写 meta 并在缺 alarm 时排程。现拆为 `ensureSchema()`（仅首次、只建表与补缺失 meta 键）与 `ensureAlarm()`（**仅 ingest 调用**）；`health()` **只读**，并新增回归断言"一次 health 调用不改变 meta、不改变 alarm 且仍报告 `schedule-missing`"。
  7. **[P2] 已知策略版本无法分类**：原返回 8 位 FNV 摘要，而允许集是 `p1..p4/unknown`，命中反而被丢弃。现 `buildPolicyTable()` 把配置的策略文本哈希为有限 tag，`mapPolicyTag()` 只返回该 tag 或 `unknown`；回归断言"已知策略被正确分类为 `p1` 而非丢弃"。
- **测试与记录更正（同轮复核指出）**：回滚回归原先在**第一条 obs INSERT 之前**就失败，不能证明部分写入后回滚；现用触发器让**第二条** obs 写入失败（首条已写入），并断言**首条确已撤销且 ledger 亦回滚**。键空间数字按上条更正为 **180 / 90**。
- **第二轮复核（`a7286bbe`）[P1] · RPC 基类缺失，已修**：`index.js` 调用 `stub.ingest()` / `stub.health()`，但对象类是普通类。平台要求**继承内置 `DurableObject`** 才能把公共方法暴露为 RPC，仅"从入口导出类"不够。修法：`receiver-object.js` 改为导出**工厂 `createCspReceiverObject(Base)`**（在构造函数中 `super(ctx, env)`），平台侧由**新增的 `worker-entry.js`** 注入真基类；`wrangler.toml` 的 `main` 改为 `src/worker-entry.js`（**唯一** `import 'cloudflare:workers'` 的模块），`index.js` 只保留可测逻辑与 `fetch` 处理函数。
  - 由此保持 **D-C 可在 Node 中测试**：本地用例用普通基类 `LocalBase` 调用同一工厂，**零新增依赖**；新增回归断言"类确实继承注入的基类、`super(ctx, env)` 被调用且三个方法存在"。
- **第三轮复核 · CORS 预检缺口（本地已修，未部署）**：修复前 `index.js` 对**任何非 POST**（含浏览器预检 `OPTIONS`）返回 **405**，响应头只有 `content-type` 与 `cache-control: no-store`。legacy `report-uri` 为 **no-cors**、无预检依赖；跨源 Reporting API 的预检按该代码会失败。这不是对真实浏览器已发送预检的实测，也不解释本地 Reporting API 零到达的根因。
  - **第三轮复核修正（凭据与 legacy 表述）**：规范采用 **`credentials: same-origin`**，故**Reporting API 的跨源报告不携带凭据，同源报告可能携带**；本接收端的白名单只约束跨源读取，**不启用 `Access-Control-Allow-Credentials`** 正是使"非通配白名单"在此严格安全的前提。另更正：**接收端未因 CORS 阻止 legacy 摄入**（`report-uri` 无预检依赖），但**真实浏览器投递仍未验证**，不得表述为"修复前后都能送达"。
  - **证据限制（如实保留）**：该结论由**源码**与**既有 GET → 405 的平台实测**支持；本轮**未实际发送 `OPTIONS`**，因此"预检被 405 拒绝"是**推断**而非实测。
  - **修法**：`index.js` 新增 `parseAllowedOrigins` / `corsHeaders` / `handlePreflight`，并让 POST 路径（**含全部既有错误响应**）统一经 `jsonResponse` 附加 CORS 头，保留 `cache-control: no-store`。
  - **CORS 策略（明确记录）**：允许来源取 **`CORS_ALLOWED_ORIGINS`**（逗号分隔）**精确白名单**，**默认空**（未配置即无任何跨源来源被允许）；**不使用 `*`**、**不回显请求来源**；允许方法仅 **POST、OPTIONS**，允许请求头仅 **`content-type`**；**不启用凭据**（无 `Access-Control-Allow-Credentials`）；`Access-Control-Max-Age` 取 **600 秒**；应答 `Vary: origin`；`Access-Control-Allow-Origin` 只返回**唯一命中的来源**；命中来源时另返回 `Access-Control-Expose-Headers: retry-after`。未列入的来源 / 非法方法 / 越界请求头 → **204 且不带 CORS 头**（浏览器判为预检失败）。
  - **`/health` 有意不开放跨源**：它是运维端点，开放浏览器来源只会无收益地暴露聚合用量；仍返回 `no-store`、无 CORS 头。
  - **OPTIONS 零副作用**：预检**不调用 DO、不建表、不写账本、不排程**（回归用记录型 stub 断言零调用）；POST 的媒体类型、体积（声明 + 流式）、JSON、预算闸门**均未改动**。
  - **回归**：新增 `tests/csp/receiver-cors.test.mjs`（**15 项**）覆盖合法/非法预检、越界方法或请求头、缺失 `Origin`、白名单空默认、POST 与**包括 413 与 429 在内的**错误响应的 CORS 头一致性（含命中来源时的 `Access-Control-Expose-Headers: retry-after`）、无 `Origin` 时不加头、`OPTIONS` 零 DO 调用、legacy 与 Reporting 两格式仍摄入、既有 405/415/413/400 闸门不变、`health` 零写入且无 CORS 头、白名单解析（含通配符不匹配）。接收端合计 **74 项**（15 + 59）全绿。
  - **明确不构成**：本地模拟通过**不能**记为**真实浏览器投递通过**；`report-to` 的端到端投递、真实预检往返、以及 `Reporting-Endpoints` 行为仍未验证。修复的**部署**与**浏览器平台测试**需分别授权。
- **B 阶段部分验证 · legacy 浏览器链路（平台运行 1 次，已复核通过）**：owner 授权「运行已审阅脚本一次，最多 10 次尝试（报告 ≤8、健康 ≤2），累计从 18/500 续用」。
  - **目标版本**：现有 `gfrr-csp-report-receiver`，线上 **`8c86987a-c1ec-4c4b-9939-8774976aa0e3`**；**本轮未部署**。
  - **实测**：4 次尝试（**2 次健康读取 + 2 次报告提交**，均 200）；页面产生 **2 条** CSP 违例（`script-src-elem`、`script-src-attr`）；两次提交均 `ok:true / action:"commit" / stored:1`；**`ingestUsed` 0 → 4**；累计预算 **22/500（剩余 478）**；7 项判据全通过；`reportTasksPeak = 2`（两份报告**同时在飞、各自独立预占**）；任务全部收尾后才释放共享锁；一次性 marker 保留；共享锁已释放。
  - **验证边界（必须同时陈述）**：本测试证明的是「**浏览器生成报告 ＋ 测试驱动转发至 Worker**」，**不等于浏览器原生直连投递**（驱动以 `route.fetch()` 自取响应再交付）；`report-to`/Reporting API **未启用故未验证**；`OPTIONS`、重定向、浏览器重试**本 run 均未发生（各 0）→ 未覆盖**；CORS 修复**未部署**、白名单仍为空。
  - **措辞更正（复核指出）**：`scopeViolations = 0` 表示**没有越界的浏览器请求**；两次获准的 `/health` **本就位于报告路径之外**，且两次**均不经过浏览器路由**（由 Node `fetch` 发出，不进入 `context.route` 处理器），故不参与该计数，也**未**被当作范围内的调用。**时序**：浏览器拦截（`context.route`）**先建立**，随后才发**前置** `/health`（**页面加载之前**）；**后置** `/health` 在**报告处理完成之后**发出。因此"两次读取均在拦截建立之前"**不准确**。
  - **状态**：**B 仅此一项可收束**，**不代表 B 全部完成，也不构成 C 的启动依据**；原生直连、Reporting API、CORS 部署及其余未验证项继续保留。**本脚本为一次性运行，不重跑。**
- **B 阶段 · Reporting API（`report-to`）本地有界归因（owner 授权第 1 项；已按建议停止继续归因）**：在**受测配置**下（本地页面 `127.0.0.1:8765` 仅设 `report-to`；端点分别取跨源 `127.0.0.1:8766` 与**同源** `/csp-report-to`；窗口 **180 秒**；无头 Chromium `153.0.8010.12`），**准确结论**为：
  > **Reporting API 报告仍为 `Queued`、已完成尝试数为 0、接收端零到达；端点成功注册尚未确立；未投递原因不明。**
  - **观测事实**：页面产生 2 条违规、Observer 记录 2 条；CDP `reportingApiReportAdded = 2`，`destination = "gfrr"`（**只证明报告关联该目标名称**）；`completedAttempts = 0`；`Reporting-Endpoints` 响应头文本可见；接收端到达 **0**（跨源与同源**均**如此）；`reportUpdated` 在约 120 s 后停止变化。
  - **不得据此排除的事项（规范将响应头解析、URL 校验与端点构建列为独立步骤）**：响应头可见 **≠** 端点已解析或已注册；**不可达 HTTPS 端点零到达不能排除"端点不可达"**；**无该头也零到达不能排除"注册缺失"**；**180 秒零到达只能说明延长至该窗口仍未成功，不能彻底排除调度延迟**；**同源同样失败说明跨源 CORS 不是全部结果的充分解释，不等于排除所有来源或预检问题**。
  - **阳性对照的范围**：legacy `report-uri` 在 15 秒内 2 次到达，仅证明**夹具能产生违规且 legacy 能到达**，**不证明 Reporting API 的注册与发送装置正常**。
  - **状态**：owner 选择**维持现状、停止继续归因**；**本轮未发任何平台请求**；真实预算 **22/500**、一次性 marker 与证据**保留**；**未部署 CORS、未扩展平台测试、未启动 C**。若日后重启该线索，需**不同性质**的手段并**另行授权**。
- **参数与键空间的不一致（待参数评审）**：144 **小于** `MAX_INPUT_KEYS_PER_BATCH=200` 与 `BUCKET_ROW_CAP=512`，故这两个候选值**无法经正常路径触发**；容量与 overflow 分支靠**注入 `bucketRowCap`** 覆盖 —— 这**只证明该参数值下的行为，不证明默认 512 可达**。键空间只有在已知策略表超过 1 项时才会越过 200。
- **明确未覆盖（属 B 阶段）**：平台计量（游标 `rowsWritten`/`rowsRead` 是否为权威计费值）、免费层额度与超限形态、alarm 实际触发与指数退避/最多六次重试、CPU 预算下的载荷上限、跨源投递（`no-cors`/`cors`）与 `Reporting-Endpoints`、Workers Logs 保留期与 IP、跨 DO 共享额度。**D-C 与 D-A 都不能替代这些验证。**
- **保留的边界**：拒绝/丢弃计数**仅作本次处理诊断**，不新增持久化统计行、不承诺跨请求累计、不默认写平台日志；`RESERVE` 类口径只降低摄入预算，**不是平台额度预留保证**。

### 2026-10-01 EdgeOne 发布暂存目录生成器（阶段 1 · 本地工具）

- **Acceptance baseline**：owner 授权「按修正后的范围开始阶段 1 本地实施」——配置、共享策略派生、暂存目录生成与校验、**手动**响应头读回工具、**手动**回归，以及本设计与 acceptance baseline 记入 backlog。边界：**不改 workflow、不自动接入 CI、不上传或发布、不修改生产项目或 release 分支**；读回工具测试优先使用本地 HTTP fixture（重复头保留、启用态与关闭态判定）。
- **设计（方案 C，独立 EdgeOne 发布暂存目录）**：链路为「构建并校验 `_site` → 复制到独立暂存目录 → 由**真实页面**派生 hash 生成 `edgeone.json` → 校验最终暂存目录 → 整树同步到 release 仓库 → 按实际差异提交发布」。关键取舍：**不采用 rsync 排除配置文件**（暂存目录每次全新生成、整树替换，故不存在来源不明的旧配置；release 内容恒等于暂存内容），且**必须保留现有 `--exclude='.git/'`**——"不需要排除"仅指不排除 `edgeone.json`。阶段顺序为 **阶段 1 本地工具 → 阶段 2 隔离 Git 通道验证 → 阶段 3 生产接线**（先取得 Git 通道证据，再谈生产接线）。
- **实施（阶段 1 交付物）**：`config/edgeone/csp-report-only.json`（`schemaVersion: 1`、`enabled`、`source`、指令模板，hash 用 `{{scriptHashes}}` / `{{styleHashes}}` 占位）；`scripts/lib/edgeone-csp-policy.mjs`（**权威**：配置校验、按页面派生 hash、双向集合校验、序列化；头名是常量，**无法生成强制版 CSP**）；`scripts/build-edgeone-release-artifact.mjs`（暂存目录生成 / `--check` / `--fingerprint`；本地必须显式 `--out-dir`，Actions 用 `--from-env` 读 `EDGEONE_STAGING_DIR`）；`tools/readback-edgeone-headers.mjs`（手动读回，支持 `--url` / `--file` / `--stdin`、`--expect enabled|disabled`）；`tests/csp/edgeone-staging.test.mjs`（**手动入口**）；`tests/csp/policy.mjs` 改为复用共享模块。
- **落实 owner 的五处修正**：(1) rsync 排除语义收窄；(2) hash **双向集合相等**校验，依据**最终暂存目录**中的页面，拒绝遗漏、额外项与错放指令；(3) 配置**缺失或无效即失败**，不再被当作撤除请求，`enabled: false` 是唯一关闭方式；(4) 撤回"退化触发情形"与任何时限承诺（发布与回滚**均不保证**在固定窗口内生效）；(5) 权威来源单一——JSON 只声明启用/路径/指令配置，共享函数负责校验、派生与序列化，harness 通过 `withAdditionalHashes()` 显式追加对照 hash。
- **关闭态写法定稿**：生成**合法的 `edgeone.json` 并省略 CSP 头规则**（不是写入空值、也不是不生成文件）；配置文件**无论启用或关闭都必须存在且有效**；关闭态的线上验收＝确认该头**确已消失**。
- **路径安全（新增硬性拒绝）**：空值、文件系统根、仓库根、受保护目录（`config/`、`scripts/`、`tests/`、`.git/`、`.github/`、`data/`、`assets/`）、与输入产物**双向重叠**、以及**未经 `--force` 确认的既有非空目录**。**允许显式指定的仓库外暂存目录**（如 `$RUNNER_TEMP/edgeone-staging`）。
- **验证（阶段 1，均在本地）**：手动回归 `node --test tests/csp/edgeone-staging.test.mjs` **18/18 通过**（含双向校验的漏 hash / 多 hash / 错放指令、路径安全七类拒绝与非空目录拒绝、`enabled:false` 文档形态、被篡改策略导致 `--check` 失败、读回工具的重复同名头保留与启用/关闭态判定）；本地自检：真实 `_site` 生成 → `production` **387 字符且不含任何 fixture hash**、`verification` 495 字符、`--check` PASS、暂存值 == production；既有 harness 未受影响——完整 fresh 三模式 4/7/7 passed、`crossModeMismatches: 0`，且**策略指纹仍为 `e61142d2777df172`**（证明重构后策略文本逐字节不变）。
- **未验证/未启动**：release 仓库 **Git 构建通道**是否同样消费 `edgeone.json`（阶段 2，另行授权，可先用隔离项目）；生产接线（阶段 3，另行授权；**一旦并入现有生产 workflow，合并后即可随 push 或排程发布响应头**，不得视为"仅安装工具"）；生产响应头、生产持久化决策、报告接收端、CI 接入均未启动。

- **复核后修复（2026-10-01，owner 复核 `93272177` 提出五点，均以普通追加提交修复）**：
  1. **真实读回丢重复头**：`fetchHeaderPairs()` 原用 `res.headers`，Node 会把两个同名 CSP 头合并成一个逗号连接值，工具因此报 `sameNameCount: 1`。改为从 **`res.rawHeaders`** 构造原始配对，并新增**真实本地 HTTP 服务**的回归（不再只测手工 JSON fixture）。
  2. **相同重复头仍判 PASS**：重复原先只写入 `notes`。现无论两个值是否相同，重复一律记为 **FAIL**，同时**保留并报告全部原始值**。
  3. **空 hash 集合仍通过**：双向校验接受"两边都为空"。现 `validatePolicyHashesAgainstPages()` 对空预期直接报错；`deriveExpectedHashSources()` 拒绝缺少内联块或清单为空的页面；`buildEdgeoneJson()` 拒绝空页面集与空 hash 来源。
  4. **最终目录校验不完整**：原仅查顶层条目。现对**输入与最终目录递归**拒绝符号链接/junction，逐文件核对 **size + SHA-256** 内容一致性，并拒绝多余嵌套文件；路径保护新增**解析已有父目录中的链接/junction**（`resolveThroughExistingAncestors`），避免通过链接别名落入受保护目录。
  5. **`--check` 未核对完整配置**：现从**最终目录的页面 + 配置重新生成预期文档**，再整体比较结构与策略（改写 `connect-src` 等非 hash 指令会被判失败）；头名识别改为**不区分大小写**（小写强制 `content-security-policy` 不再漏掉）；同时拒绝文档中出现两条 Report-Only 条目。
  - **回归**：新增 `tests/csp/edgeone-staging-review.test.mjs`（**17 项**，手动入口）覆盖上述五点；原 `tests/csp/edgeone-staging.test.mjs` 的两处旧断言按新语义更新（重复头判 FAIL、篡改策略由"整份文档比较"捕获），两组共 **35/35 通过**。既有 harness 未受影响（完整 fresh 三模式 4/7/7 passed、`crossModeMismatches: 0`、策略指纹仍为 `e61142d2777df172`）；真实 `_site` 生成 + `--check` 均 PASS。
  - **范围未变**：未改 workflow、未接入 CI、未上传或发布、未修改生产项目或 release 分支。

- **复核后修复（第二轮，2026-10-01 于 `81fb3732`）**：
  1. **`--check` 未验证完整目录**：原先只比策略，既未调用结构校验、也无法判断"缺失/多余"。现 `--check` 必须提供**可信锚点**——`--artifact-dir`（对输入产物）或 `--manifest`（`edgeone-staging-manifest-v1`，逐文件 size + SHA-256，可用 `--write-manifest` 生成）；未提供锚点时**明确判失败**并在输出标注 `structure=NOT checked`。结构比较会报告缺失、多余、大小与内容差异。**此前的实现缺陷是"调用校验函数但丢弃其结果"**（只调用、未读取 `problems`），现已读取并上报。回归经 `checkStagingDirectory()` 与 **CLI** 两条路径验证（含多余文件、缺失文件、内容篡改、manifest 锚点、无锚点）。
  2. **关闭态提前返回、绕过整份文档比较**：现启用与关闭**都**从最终页面与配置重新生成预期文档并**整体比较**（键序无关的规范化比较），且拒绝配置未声明的顶层字段；关闭态文档中出现重定向、或出现未声明的头规则，都会被判失败。
  3. **符号链接用例在 Windows 上 `symlink EPERM`**：原两项测试在创建 fixture 时即失败，属环境阻塞而非产品断言。现改为**优先真实符号链接、失败回退目录 junction（`mklink /J`，无需提权）**；两者都无法创建时用例**显式 `skip`**，绝不把未执行记为通过。本机实测 junction 路径生效。
  - **回归**：`tests/csp/edgeone-staging-review.test.mjs` 扩至 **26 项**（0 skipped）、`edgeone-staging.test.mjs` **18 项**、`generation-gate.test.mjs` **10 项**，合计 **54 项全绿**；真实 `_site` 生成 + 带锚点 `--check` 端到端 PASS。**范围未变**：未改 workflow、未接入 CI、未上传或发布、未修改生产项目或 release 分支。

### 2026-09-29 lint 试点首测（PR 2：手动 lint 试点）

- **Acceptance baseline**：owner 授权启动 PR 2（承接已合并的 PR 1 / #420）。授权范围为**手动 lint 试点**：落三套分离 ESLint 配置、加手动入口、完成首次**全量**扫描并交付报告。**明确边界：不接入 `check:all`、不接入任何 workflow、不启用 autofix、不批量格式化、不修改业务代码**（含不修复首测发现的诊断）。
- **报告入口**：[LINT_PILOT_FIRST_RUN.md](LINT_PILOT_FIRST_RUN.md)。首次全量扫描实测：645 文件（去重）、152 条诊断（`no-unused-vars` 120 / `no-undef` 31 / `no-dupe-keys` 1）、配置错误 0、解析失败 0、原始退出码 1。按目录 `scripts/` 116、`tests/` 32、`workers/` 4。
- **分类口径**：`no-undef` 31 项全部落在 `tests/e2e/**` 的 Playwright 浏览器求值回调内（`page.evaluate()` 19 项、`locator(...).evaluate()` 12 项），属**跨上下文诊断**独立单列，不计入确认缺陷，也**不**据此论证环境隔离生效——隔离改由配置层面证据支持（`--print-config` 实测 Node/browser/worker 三套 globals 互不混入）。120 项 `no-unused-vars` 归入**待判断**（其中 43 项带 `_` 前缀；命名只是统计特征，不等于已确认有意未使用）。1 项 `no-dupe-keys` 为**已确认的重复键问题**（`replay-transport-shock-confirmation-factor-free-proxy-score-candidate.mjs:260`，两处值相同，**尚未证明造成输出错误**）。
- **两个未决项（本试点未处理，需独立决策）**：(1) `^_` 前缀忽略约定是否采用——全仓 42 处 `_` 前缀声明，但无配置无文档；是否采用与这些绑定是否确属有意未使用是两个独立判断。(2) `bubble-watch.html` 的 1 个内联 `<script>` 列为已知盲区，未引入 HTML 插件。
- **验证**：`npm run check:all` 退出 0（新配置未扰动现有保护网）；`npm run lint` 退出 1 并报 152 问题（首测预期，未通过抑制变绿）；`npm run check:docs` 退出 0（250 md、0 链接问题，报告已登记 `docs/INDEX.md`）；`git diff --check` 清洁。CI `check-all` SUCCESS。

### 2026-09-29 lint 试点依赖批准（PR 1：依赖契约变更）

- **Acceptance baseline**：owner 批准「PR 1：安装精确版本 `eslint@10.11.0`、`globals@17.12.0`，同步 package、锁文件、精确 allowlist 和决策记录；完成必要验证后提交、推送并创建独立 PR。此次不授权合并，不启动 PR 2」。
- **批准范围**：仅依赖契约。`package.json` 的 `devDependencies` 由 2 项增至 4 项；`package-lock.json` 据实重生成；`scripts/check-market-pricing-ndx-ixic-implementation.mjs` 的 `devDependencies` 断言同步新增两项，**保留精确集合相等**（不改为子集判断、不允许任意开发依赖）。注释与错误消息同时指向 ADR-0013 与本条记录——ADR-0013 允许"开发期 linter"这一**类别**，本身不批准这两个包及其版本。
- **依据**：ADR-0013 允许开发期 linter/formatter 作为 `devDependencies`，条件是仅被开发期脚本使用、不被 Actions 生产路径或浏览器侧代码导入、PR 描述引用该 ADR 并说明理由。
- **实测数据（据实，非估算）**：新增 78 个包；`npm ci` 重装共 82 包；`audit` 报 0 漏洞；锁文件包条目 4 → 82，大小 2.2 KB → 36 KB，`lockfileVersion` 保持 3；`@playwright/test`、`playwright`、`playwright-core`、`xlsx` 四项锁条目逐字节未变；解析版本确认 `eslint 10.11.0` / `globals 17.12.0`。
- **验证**：`check:market-pricing-ndx-ixic-implementation` PASS；`check:xlsx-security` PASS（其断言仅针对 `xlsx`，不受影响）；`npm ci` 在隔离目录退出 0（证明锁文件与 `package.json` 同步）；`npm run check:all` 退出 0。
- **明确不包含**：不加 lint 配置、不加 `lint` 脚本、不改 `check:all`、不接入任何 workflow。以上属 PR 2，且需 PR 1 经独立复核并合并后，从最新 main 另起。本次不授权合并。
- **未改动**：`README.md`（其"执行 `npm ci` 安装锁定的开发依赖"表述仍然成立，不为留痕额外改动）；ADR-0001/0013 无"仅两个 devDependency"类表述，无需同步。

### 2026-09-26 CSS 纳入前端 asset bump 触发集

- **Acceptance baseline**：owner 授权按「选项 B」实施：把 `assets/styles.css` 纳入前端 asset bump 触发集。范围限定为检查器触发集与规则/文档，**不改 bump 工具**、不改历史定位算法、不做性能优化（该优化排在第 3 项后另开任务）。PR #419。
- **决策依据**：只读历史核查（窗口 2026-06-01 起，比较提交与其父提交的树内 `APP_VERSION`）显示所查样本中 42/42 触及 `assets/styles.css` 的提交同时改变了 `APP_VERSION`。**该计数仅描述所查提交样本**，比较"提交与父提交"不等同完整集成单元判定，**不据此推断发布历史**（无 push 审计、部署记录或用户侧证据）。
- **实施**：`scripts/review-frontend-asset-version.mjs` 触发集固定加入 `assets/styles.css`；`AGENTS.md` §1 规则点名补入，并说明该文件自身不带版本参数（参数在 `index.html` 引用上，由 bump 工具改写），因此纳入触发集无需改动工具；`docs/DATA_CONTRACT.md` 同步触发集描述；`docs/FRONTEND_ASSET_VERSION_CHECK_DESIGN.md` §3.1 由「作用域」改为「触发集」，覆盖边界段改写为决定记录。
- **复核修正**：独立复核发现三处问题并已修复——(1) 原按文件是否存在决定纳入，导致**删除已跟踪样式表时退出触发集并返回 PASS**，现改为路径无条件属于触发集；(2) 缺少"已提交 CSS 未 bump"的 FAIL 回归，现补上并区分未提交修改、已提交遗漏、删除、从未存在四种形态；(3) 文档曾把"提交与父提交比较"表述为"集成单元判定"并推导"从未单独发布"，已限定为所查样本范围。
- **验证**：`npm run check:all` 退出 0；`check:frontend-asset-version` 22/22 通过；`git diff --check` 清洁。真实仓库行为：干净 HEAD PASS（scope 18 files）；仅改 CSS 不 bump FAIL exit 1；同场景 bump 后 PASS；删除已跟踪 CSS FAIL exit 1。
- **已观察未处理**：该检查器在完整仓库上较慢（版本变更查找约 273 次 `git` 调用，实测约 12.6s），非本次引入，列为独立优化项。
- **不改动**：未触碰 scoring/decision/execution/position、`data/`、workflows、前端渲染代码；未运行源刷新、未付费调用、未部署。

### 2026-09-21 预算拒绝改为显式 skip（ADR-0060）

- **Acceptance baseline**：owner 在 PR #412 合并、Pages 部署成功后，追加授权「方案 D：把 `tavily_budget_*` 预网络拒绝归为显式 skip」，并选择 serial trunk 时序（#412 合并后再从最新 main 另起分支，不叠 PR）。本任务不改订阅、不付费调用、不放宽可信新闻门槛、不新增 provider 频率、不部署。
- **决策**：见 [ADR-0060](ADR/0060-budget-hold-explicit-skip.md)。只修正 ADR-0059 的 readiness/expected-skip 条款：本仓库自身在**发请求前**给出的预算拒绝（`tavily_budget_*`）不含索引/来源健康信息，在 0 可信故事时归为显式 skip（`reason=search_budget_exhausted`，`SKIPPED_SEARCH_BUDGET_EXHAUSTED`）；**只有全部不健康 provider 都是预算拒绝时才降级**，任何真实 provider 失败（HTTP 4xx/5xx、超时、解析失败、未分类错误、缺 key 未运行）仍保持 `news_source_health_incomplete` 硬失败。**不引入任何预留前拦截**（该子项已被 run `35482258943` 反证否决，见上一条目）。范围仅限 Macro Risk；Bubble Watch 同类情况留作独立决策。
- **实施**：`scripts/macro-risk/editorial-news.mjs` 增加预算拒绝识别与三分支 reason；`scripts/macro-risk/build-editorial-input.mjs` 按 reason 输出 skip 分类，并在 warning 与 step summary 中写入**有界诊断码**（`search_budget_exhausted` 时必含 `tavily_budget_account_limit`），使绿灯 run 也不隐藏预算耗尽；workflow 的 skip 校验步骤改为同时覆盖两类 skip（保留 `SKIPPED_NO_CREDIBLE_NEWS` 标记）。
- **checker 完整性（§10 自查）**：**未删除或放宽任何断言**。`check-macro-risk-editorial-core.mjs` 原有「source-health failures must remain hard failures」断言原样保留，并**新增 5 条**：预算拒绝→skip、预算拒绝不得掩盖第二个真实失败、预算集合内混入真实拒绝仍硬失败、缺 key 仍硬失败、预算 skip 不计入 readiness。
- **验证**：`check:macro-risk-editorial-core` **65/65 通过**（该套件此前 57，本任务 +8），`node --check` 全部改动文件退出 0。新增用例覆盖 5 种真实失败码仍硬失败、预算 skip 分类、混合失败、缺 key、以及 CLI 端到端两类结果（预算→退出 0 且输出分类与代码；真实失败→退出 1 且命名根因）。
- **已接受的残余风险（ADR-0060 明确记录）**：红叉消失后，额度耗尽不再自发告警；仓库内信号只有每日 `::warning`、step summary 与 skip 分类，需人工查看。读者侧效果是 AI 栏位在 freshness 窗口过后 fail-closed 消失（`renderMacroRiskEditorial.js` 要求 `freshness.isStale === false`），读者无法区分「未刷新」与「从未存在」——与既有待办「外部额度耗尽的用户可见『来源降级』状态」同源。
- **告警通道刻意留待决策**：给 `tavily-budget-status.yml` 加 `schedule:` **并不能**产生告警——ADR-0059 把额度耗尽定义为**成功**的 hold 验证，该 workflow 在账户耗尽时仍退出 0，只在不可用/畸形状态才失败。要成为告警需新增 required-eligibility 模式并改 schedule，属推翻 ADR-0059 部分条款的独立决策，本任务未做。
- **交付回执（2026-09-22）**：独立预合并审阅按 AGENTS.md §10 三点核对通过（方案与 ADR-0060 逐条一致；`check-macro-risk-editorial-core.mjs` 纯新增 +21/−0、原硬失败断言保留；未新增 ignore）。审阅另用 run `35677768492`（#83）真实 artifact 离线回放：`reason=search_budget_exhausted`、`expectedSkip=true`、`credibleCount=0/30`，CLI 退出 0 且未生成 input artifact。审阅发现 `docs/PROJECT_BACKLOG.md` Session Handoff 存在重复的「历史检索」行，已在同一任务内删除（commit `68cf404e`）。合并前分支已 merged 最新 main `e84576ae`（仅数据文件位移，无冲突），`npm run check:all` 本地 **exit 0**、CI `check-all`（run `35712622376`）**pass 6m13s**。PR **#415** 已合并为 main `451076f3`，Pages 部署 run `35713230139` **success**。下次自然 run（约 09-23 02:00 UTC）用于观察绿灯 skip 分类是否符合预期；读者侧 AI 栏位仍受 freshness 窗口约束。

### 2026-09-21 Macro Risk Editorial 失败归因与来源降级分类

- **Acceptance baseline**：owner 报告 `Macro Risk Editorial Refresh #80`（run `35552064845`，commit `23328fd`）失败，要求判断是项目缺陷还是偶发、能否彻底修复；owner 随后授权「代码加固：额度预检 + 明确失败分类」，并授权账本重建/初始化。本任务只做只读归因与实际可行的分类加固：不新增订阅、不付费调用、不放宽可信新闻门槛、不改 checker 断言、不部署、不改 workflow。
- **归因（只读，证据取自远端 run / artifact / 仓库只读探针）**：**不是代码缺陷，也不是偶发**。Tavily 账户实际用量 `planUsage=1007 / planLimit=1000`（只读探针 run `35326505710`，`paygoLimit=0`）。`scripts/lib/tavily-budget.mjs` 在发网络请求前即以 `tavily_budget_account_limit` 拒绝，6 个查询全部失败（首条为账户额度，其余 `tavily_budget_session_stopped`）；Brave 6/6 成功但 30 条故事全部 `discovery_only`，`credibleCount=0`。现行契约要求两个 provider 健康才允许 `expectedSkip`，故按 `news_source_health_incomplete` 硬失败（`check-macro-risk-editorial-core.mjs` 明示断言「source-health failures must remain hard failures」）。自 2026-09-17 起每天被 admit 的那一次运行 09-17/18/19/21 失败、09-20 成功；09-17 是另一种模式（质量审查 `displayEligible=false`，第 13 步失败）。额度不恢复则红叉按设计持续。
- **owner 原始方案的「预检拦截」子项经证据否决，未实施**：run `35482258943`（2026-09-20）在 `tavily=error`、`liveProviderCount=1` 下**成功刷新**，唯一可信故事来自 Brave（`federalreserve.gov`，`official`）。因此「Tavily 额度耗尽即判定 run 必然失败并抢在占用 day/input 配额前拦截」会误杀 Brave 单独可完成的合法刷新，属回归，不予采纳。
- **实施**：`scripts/macro-risk/editorial-news.mjs` 新增 `describeProviderHealth` / `formatProviderHealth`，只输出有界、已分类的 provider 诊断码（正则白名单；未分类值降级 `unrecognized`，缺失为 `missing`；因 `sourceStatus` 不在 discovery 校验契约内，额外做形状与计数防护）。`scripts/macro-risk/build-editorial-input.mjs` 在「0 可信故事 + provider 健康不完整」时以 `news_source_health_incomplete` 明确分类失败并写 step summary，替代原先误导性的 `input requires at least one official or cross_checked news story`。红叉、fail-closed 与 `expectedSkip` 语义均不变；`compactNews` 保留排序在前的可信故事，故该分支与旧校验失败路径等价。
- **验证**：`node --check` 三个改动文件退出 0；离线端到端三例——degraded 退出 1 且 stderr 命名 `tavily_budget_account_limit`、healthy-0 可信仍以 `no_credible_news` 干净跳过退出 0、含可信故事 happy path `PASS` 退出 0；`describeProviderHealth` 13 项断言（含不安全值不外泄、`PRIVATE` 不出现）全部通过。新增用例落在 `tests/unit/macro-editorial-discovery.test.mjs`，属 `check:macro-risk-editorial-core` 的受控集合。
- **验证 / 交付**：`npm run check:changed` 以完整 `check:all` 运行 **exit 0**；`npm run check:macro-risk-editorial-core` **57/57 通过**（原 54，本任务 +3）；`node --check` 三个改动文件退出 0，`git diff --check` 干净。本机沙箱默认禁止 `node --test` spawn 子进程（`spawn EPERM`，未改动的 `editorial-production.test.mjs` 同样受限，属环境限制），升级权限后跑通。已本地提交 `e8d715dd`（fix）/ `9531f010`（docs），push 分支 `codex/macro-editorial-degraded-source-classification` 并开 PR **#412**；远端 CI `check-all` **pass 5m44s**（run `35579154540`）。
- **交付与后续**：PR **#412 已合并**为 main `7fe5f73d`（merge commit），推送到 main 触发 Pages 部署 run `35582873249` **success**；独立人工审阅未另行取证。owner 追加授权的方案 D 已在 `codex/macro-editorial-budget-skip` 实施（见上方 ADR-0060 条目），等独立审阅与合并。
- **待 owner 决定**：①Tavily 容量——唯一能让红叉不再依赖代码降级的动作，属计费操作，且与现行「不新增订阅、不放宽可信新闻门槛」立场冲突，需 owner 明确取舍；②方案 D 已按 ADR-0060 实施并经 owner 追加授权；③「失败运行不占用当天 day/input 配额」需改动被测试锁定的「预留不可退」不变量，属 ADR 级；④额度耗尽的主动告警需新增 required-eligibility 模式，属 ADR 级；⑤账本 `tavily-usage-ledger` 经本项目 `validateLedger` 校验为**合法空基线**，且与 `emptyLedger()` 逐字节相同（分支仅 1 个无父提交 `243e3150`，2026-09-18T07:55:42Z，与上一轮记录一致），故重建/初始化为 no-op，09-18 前条目字段无法从日志忠实还原、伪造条目属禁止行为——**未执行**无意义的远端重置。

### 2026-09-18 整体健康度只读审计与验收基线

- **Acceptance baseline**：owner 要求评估项目健康度/强壮度并打分；随后授权把修正后的审计结论与 `check:all` 覆盖分类写入 `docs/`，并明确授权补记本 backlog 条目作为后续整改基线。审计全程只读：未运行源刷新、未付费调用、未写生产数据、未部署、未改任何 checker 断言或 `check:all` 组成。
- **结论**：综合 **7.6 / 10**（加权 7.625）。**未发现已证实的、可利用的高危漏洞**；主要问题性质为工程债务与外部依赖韧性。评分口径、实测证据表、修正记录与方法学边界见 [健康度审计](HEALTH_AUDIT_2026_09_18.md)。
- **验证**：`npm run check:all` 退出 0（展开 139 个叶子命令，约 363s）；`npm run test:unit:coverage` 896/896 通过退出 0；`npm run check:market-pricing-freshness` PASS；`npm audit` 0 漏洞；`npm run check:docs` 退出 0（246 个 md、0 链接/锚点问题）。改动范围为 2 个新增文档 + `INDEX.md` 登记 + 本条目；`git status` 显示 `scripts/`、`data/`、`.github/`、`package.json`、`index.html` 改动数为 0。
- **覆盖口径修正**：`check:all` 可达 `check:*` 为 **227 / 244**（2026-09-19 新增 `check:odp-news-source-health` 后为 228 / 245；2026-09-21 新增 `check:frontend-asset-version` 后为 229 / 246），未纳入 **17 项**，逐条分类与 meta-checker 需求见 [覆盖分类提案](CHECK_ALL_COVERAGE_CLASSIFICATION.md)。此次审计中该数字曾被连续误判两次（51 → 223 → 227），误因均为静态 grep 与不完整套件展开；17 项例外经核对**全部可解释，不存在未记录的覆盖缺口**。
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
| Cache version | `odp-news-source-attribution-3` |
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

- **2026-10-07 CSP 第二批入口 acceptance baseline**：owner 在关闭恢复和只读审计后要求告知下一步并直接开始；本轮本地实施 [第二批准备](CSP_PLATFORM_BATCH2_PREPARATION_2026_10_07.md)，基于 latest main `f60c2a52` 的独立分支 `codex/csp-platform-batch2-preparation`。不解除旧锁、不部署/请求/接受费用、不启用 C，#435 的发布授权不延伸。
  - **最后基线**：#435 已合并 `f60c2a52`，exact-head CI 与 Pages/EdgeOne 发布流程通过。前批预算预占 34→42 后仅关闭 health 503；PowerShell DateTime 转换导致开窗参数不规范，读回拒绝并停止，锁/marker/证据保留。另获批准的一次恢复已核实 `da71cbf7` 100%、false/空时间、loopback CORS、日志关闭。
  - **本轮改动 / 判据**：新增固定 batch2 CLI、前批证据与 runner/hash 绑定、42→50 的八次预占、新路径和 UTC 原样参数数组准备；复用七次受控序列，原 CLI 继续严格默认 34，旧断言不改。旧共享锁存在时零发送、零预算变动，不新增锁恢复代码。必要测试/完整检查和本地提交以本轮交付回执为准。
  - **当前证据 / 下一步**：Data Studio 两项只读 SELECT 已确认原始 watermark=2026-10-07、cleanup_completed=00:10:00.284 UTC、attempts=0，obs/ledger 无过期行；平台读额度和审计记录不等同接收端 HTTP 预算。next alarm 和实际过期删除尚未验证。新的独立 review、远端操作、具体锁恢复和第二批平台额度/更新范围仍需对应授权；真实预算保持 42/500。

- **2026-10-07 CSP 平台准备 acceptance baseline**：owner 在 #433 合并后批准开始本地准备并要求继续：明确保留 loopback CORS、准备受预算约束的新脚本与本地验证；不部署、不发接收端请求、不接受费用、不启动 C。独立分支 `codex/csp-platform-preparation` 基于 latest main `ddcc2af9`，#433 的 push/review/merge/发布例外不延伸。
  - **独立审阅与修复批准（2026-10-07）**：owner 明确授权新的独立 AI reviewer 只读审阅 `2f4644ed`；发现 P2：本地错误只存在 relay 私有状态，另一已开始的慢正文仍可能启动平台发送，虽不突破八次预算但违反异常即停。随后 owner 要求修复；增量审阅进一步复现同批正文完成时外层 await-catch 通知过晚的变体，最终将通知移到内部 task catch 同步执行。只修复共同失败通知和读体后/forward 前门控，新增三项纯内存并发回归，不扩大到部署、平台请求或生产 C。11/11 pass、0 skip；新完整检查与同候选独立增量复核以 `test-results/csp-platform-relay-fix-20261007/` 回执/交付汇报为准，旧 8/8 及原证据保留为历史结果。
  - **前轮完成**：#433 已按 owner 授权及新独立 AI 代审合并为 `ddcc2af9`；exact-head CI `37414141043` success。仅 docs/tests/receiver 文件，未命中 Pages/EdgeOne release push 路径；未由本合并执行接收端部署。旧受控候选交接保留为当时记录。
  - **本轮实施 / 判据**：[平台准备方案](CSP_PLATFORM_PREPARATION_2026_10_07.md)；`tests/csp/controlled-platform.mjs` 默认无网络计划，明确 `--keep-vars` + loopback CORS，真实执行需新批准和 reviewed Worker/harness 指纹。采用 localhost native → 白名单 relay → 隔离 Worker，不冒充原生直连验收；预算发送前预占 8 个名额、不退额，固定 7 次序列、异常锁存/无 retry。仅新增手动入口及回归，无 runtime/SQL/预算断言/CI/checker/ignore/data/生产 CSP 改动。
  - **验收与边界**：本地 8/8 pass，含真实 Chromium + fake 平台 transport；既有 Wrangler 4.147.0 closed/open 编译 dry-run 均 exit 0，无安装/升级或资源更新。完整 check:changed 以 `test-results/csp-platform-preparation-20261006/` 最终回执为准。真实预算仍 34/500，真实平台请求 0；两个版本更新与最多八次请求仅供下一轮明确批准。原生直连、raw watermark/alarm/删除、共享平台额度与生产 C 门槛仍独立待验。

- **2026-10-06 CSP 受控验收 acceptance baseline**：owner 批准按建议先完成本地保护与受控合成验收，生产报告保持关闭、优先保护共享 realtime 额度；不视为接受真实访客 URL/query 外传、公开试运行、接收端部署/平台请求或费用批准。独立分支 `codex/csp-controlled-acceptance` 基于 latest main `9c2d15d4`，不继续给已合并 #432 追加任务，其 review/远端操作例外不扩展。
  - **最后基线 / 改动**：新增默认关闭、固定最长 30 分钟 HTTP admission，覆盖报告与 health，慢上传到期复判；worker-entry 接到测试过的统一路由，Wrangler 候选默认 false。新增手动窗口回归和 localhost-only native Chromium + 内存 SQLite 验收，零依赖/CI/checker/生产配置/data/realtime/KV/SQL schema 或预算断言改动；旧证据/资源/分支保留。
  - **当前任务 / 判据**：接收端回归 81/81 pass；本地两份 native legacy 合成报告、2 聚合行、账本 4；关闭与过期拒绝后无新增写入。本轮完整 check:changed 与结果以 `test-results/csp-controlled-acceptance-20261006/` 回执为准；真实平台预算仍 34/500，本轮接收端平台请求 0。
  - **下一步 / 阻塞**：[受控验收与剩余门槛](CSP_CONTROLLED_ACCEPTANCE_2026_10_06.md)。Cloudflare 控制台已核实 Free、日志/跟踪/Issues 关闭且无导出，EdgeOne 已核实 Free 与 228/500 构建快照、生产 release `89a45fbc` 绑定成功构建 `dpqhva02894o`；DO 有一次 alarm 调用但 watermark/重排/删除仍未验。候选供独立 review；push/新 PR/合并/最多两次现有隔离 Worker 更新及最多八次受控请求都需对应明确授权，不消费旧一次性许可、不重跑旧工具，C 始终关闭。

- **2026-10-05 CSP 可选 report-uri 支持 acceptance baseline**：owner 在 C 准备交付后要求“请开始下一步”；按前序明确边界，仅本地实现独立评审的严格策略支持，不应用启用补丁、不推送/PR/合并/部署/启动 C，不发接收端请求，不新增依赖/费用或扩大 #430/#431 review 例外。隐私、公开流量、平台额度/日志/alarm 与 C 授权缺口继续保留。
  - **2026-10-06 review 替代与合并批准（仅限 PR #432）**：owner 明确要求“请代替我做独立人工契约review”，本次以未参与实施的独立 AI 审阅代理替代 #432 的人工契约检查，如实标明非真实人工；固定审阅 head `5fc6f492`，未发现阻塞缺陷，§10 方案/断言/ignore 三项通过，exact-head CI run `37287355267` success。owner 随后在确认隐私/公开流量/费用/启用验收问题仍未解决且不阻塞支持代码合并后，批准按计划合并 #432 到 main 并接受其自动触发既有 Pages/EdgeOne 流程。本次仅替代本任务早期 merge/既有发布禁止，不授权 C 启用、报告端点写入生产配置、接收端部署/请求、付费功能/升级或资源/分支/证据删除，也不扩展到其它 PR。
  - **2026-10-06 合并准备基线**：latest main `1c7efc05` 相对原基线仅七个数据文件更新，已普通 merge 到任务分支，支持代码/测试/配置字节不变；本轮仅追加本授权与审阅回执。新增 head 的本地完整检查、独立增量审阅、远端 CI 和实际 merge/自动发布结果以交付回执为准。预算仍 34/500，原证据和资源保留；C 相关隐私、流量、费用和启用验收缺口继续单列，不因支持代码合并而关闭。
  - **2026-10-05 PR 阶段追加授权（仅替代上条本地阶段的 push/PR 禁止）**：owner 明确授权推送 `codex/csp-report-uri-support` 并创建以 `main` 为目标的独立 PR。审阅对象为 `ed32aded` 的严格可选端点支持、手动回归、ADR-0061/索引和本任务交接；本轮仅补此授权记录。fetch 确认 main 仍为 `b307a5b748dd`，工作区/索引干净，未发现已有同分支 PR；无需整合其它提交。继续禁止合并、部署、生产配置启用、启动 C、平台请求或重跑一次性脚本；独立人工契约 review 和隐私/费用/验收/回滚批准仍保留，#430/#431 例外不扩展。必要检查、实际推送和 PR URL 以本轮交付回执为准。
  - **最后基线 / 改动**：干净 `codex/csp-c-preparation` HEAD `3d64d491`，非 prune fetch 确认 latest main 仍 `b307a5b748dd`；新本地分支 `codex/csp-report-uri-support` 从 main 起，旧分支及全部原提交保留，不叠加准备文档历史。改共享策略模块、新增手动回归、[ADR-0061](ADR/0061-csp-optional-report-uri.md)/索引及本交接；生产配置、接收端、workflow、checker、package/套件与数据不动。
  - **当前任务 / 判据**：required 指令清单原样，optional report-uri 仅接受指定单个 HTTPS 端点的精确字节；拒绝空值、多值、其它 URL、query/fragment、凭据及注入。缺省策略/文档逐字不变，显式移除端点恢复原策略，关闭态仍合法空 headers。保留原 hash/长度/目录锚点/全文比较断言，不新增 skip 或 ignore。手动回归与完整 check:changed 实际日志、退出结果、证据文件哈希核对保存在 `test-results/csp-report-uri-support-20261005/`，以交付回执为准。
  - **下一步 / 阻塞**：本地支持完成后仅供独立契约 review，ADR 状态不冒充 accepted；远端 push/PR 需明确授权，merge 仍需独立人工 review 及相应动作授权。C 配置启用、真实页面 URL/query 传输、公众流量/费用边界、观察窗口/预算/负责人、失败停止/回滚尚未批准。本轮不验证平台；真实预算与旧 marker/证据/工具保留，不能把应用计数当平台额度。

- **2026-10-04 CSP CORS 平台验证 acceptance baseline 与结果（覆盖下方 PR 准备的旧交接状态）**：owner 授权更新现有隔离 Worker 最多一次，仅允许 `http://127.0.0.1:8765`，平台验证最多 10 次请求、累计上限 500，从 22 续用；异常即停、不重试、不接受费用，保留资源与证据，不启动 C。#430 已按 owner 对该 PR 的明确人工 review 例外合并，源代码为 `0d977272`。
  - **部署**：现有 `gfrr-csp-report-receiver` 更新一次（exit 0），版本 `a96ec4ba-d522-4a87-8cbb-3ff3ca8134a3`；`--keep-vars --var CORS_ALLOWED_ORIGINS:http://127.0.0.1:8765`，保留其它变量。未修改仓库 wrangler 配置；不把本次仅供本地测试的允许来源用于生产页面。部署列表确认最新记录 100% 指向该版本；客户端请求时间与平台 Created 字段不用于证明精确生效时序。
  - **平台序列**：一次运行，8/8 通过、exit 0：两次 `/health` 200；允许来源的 OPTIONS 204 且精确 CORS 头；未列来源、PUT、越界请求头的 OPTIONS 各 204 且无 CORS 头；允许来源 Reporting 格式 POST 200/commit/stored=1；未列来源空批次 POST 200/stored=0 且无 CORS 头。`ingestUsed` 4→6；预算 22→30/500（剩余 470），请求前预占落盘，共享锁释放，新一次性 marker 保留。
  - **本地门禁与证据**：新增 ignored `test-results/codex-cors-platform.mjs` 与回归，6/6 通过（发送前计数、失败停止、重复运行不覆盖、损坏预算、预算不足、锁冲突）；语法及部署 dry-run exit 0。部署输出、新 marker 与 `codex-cors-platform-evidence.json` 保留；前轮 legacy marker/证据不覆盖、不重跑。授权预算文件仅按本轮预占更新。
  - **验收边界**：本轮是 Node HTTP 对接收端的 CORS 契约验证，非浏览器原生 Reporting API 投递、非浏览器预检自动往返证明；`report-to` 注册与端到端、原生直连、alarm 实际触发/清理/重试、平台计量维度仍未验证。此前“CORS 未部署”是历史状态，本轮后已部署但只有上述测试 origin 获准。费用判断沿用 owner 已确认的 Free 计划，本轮无升级/付费功能操作、无费用信号，未独立核查订阅或账单。C 仍未授权、未启动；该平台验证轮不推送、不建 PR、不清资源。
  - **2026-10-05 文档 PR acceptance baseline**：owner 另行授权整合最新 main、必要验证、推送验收记录分支并创建文档 PR；禁止合并、部署、重跑平台测试或启动 C。新分支 `codex/csp-cors-validation-record` 基于 `5f57f548`，只整合本条验收记录；原记录分支与 `35dd9021` 保留，预算 30/500、所有一次性 marker 与证据保留。#430 的人工 review 例外不扩展到本 PR。

- **当前任务（2026-10-04）**：CSP 修复 PR 准备；owner 已授权整合最新 main、验证、推送任务分支并建 PR。当前分支 `codex/csp-receiver-health-cors` 基于 `40c19e52`，包含 Wrangler 生命周期配置、health 只读探测、CORS 和本地回归；原分支 `fix/csp-receiver-wrangler-exports` 及 `b14622d4`、`2188b182` 保留。
- **基线与改动**：health 修复有既有平台响应依据，CORS 修复未部署；部署来源提交未唯一绑定。相对最新 main 的差异仅限本任务七个文件；不修改生产数据或现有 checker。
- **验证与边界**：接收端回归 74/74 通过；既有 CSP 暂存/生成闸门 66 通过、1 个文件符号链接用例因 `EPERM` 跳过；整合最新 main 后的完整 `check:changed` / `check:all` 结果见本次交付回执。真实预算 22/500、一次性 marker 与证据保留，不重跑平台脚本；推送及 PR 按本轮授权执行，以交付回执为准，不部署，C 未获授权。
- **下一步与阻塞**：本轮创建 PR 后停止，待独立 review；不合并、不部署、不启动 C。B 仅 legacy“浏览器生成报告＋驱动转发”部分验收有效，原生直连、Reporting API 及其它平台维度继续未验证。

### 前序交接（2026-09-22，保留作历史）

- **当前任务**：预算拒绝改为显式 skip（ADR-0060，见本文件顶部同日条目），是已合并 PR #412 的 owner 追加授权后续。前序归因确认 Tavily 账户额度耗尽（`1007/1000`）是唯一根因、属外部计费条件；#412 已合并为 main `7fe5f73d` 且 Pages 部署 run `35582873249` 成功。本轮按 ADR-0060 把本仓库自身在发请求前的预算拒绝归为显式 skip，真实 provider 失败仍硬失败；分支 `codex/macro-editorial-budget-skip` 等独立审阅与合并。
- **运行边界**：不新增订阅、不付费重试、不放宽可信新闻或 DeepSeek 门槛、不新增 provider 频率、不加 workflow schedule、不删预算 refs、不写账本远端内容；未删除或放宽任何 checker 断言（§10 自查见顶部条目）；2026-09-18 健康整改的授权范围不因本轮登记扩大。
- **待验**：本轮改动的本地完整检查与远端 CI 以实际回执为准；仍待独立人工审阅与合并授权，不得据本地通过推断为已发布。已接受的残余风险：额度耗尽不再自发告警，仅剩每日 `::warning`、step summary 与手动只读探针，读者侧 AI 栏位在 freshness 窗口后 fail-closed 消失。下一步取决 owner：Tavily 容量取舍，或新增 required-eligibility 主动告警（ADR 级）。
- **交付回执（2026-09-22）**：PR **#415**（ADR-0060 预算拒绝显式 skip）已合入 main `451076f3`；合并前完成 §10 三点核对、`check:all` 本地 exit 0 与 CI `check-all` pass，并通过 run `35677768492` 真实 artifact 离线回放验证分类与零副作用；Pages 部署 run `35713230139` success。Tavily 额度（`1007/1000`）本身仍未恢复，本 PR 只把自有闸门拒绝从红叉改为显式绿灯 skip。
- **下一步**：观察约 09-23 02:00 UTC 的自然 run 是否按 `SKIPPED_SEARCH_BUDGET_EXHAUSTED` 绿跑并写明原因；产能恢复取决于 owner 的 Tavily 计费取舍，主动告警需按 ADR-0060 单独立项（required-eligibility 模式 + schedule）。
- **历史检索**：仅在核对具体旧事件时读取 [完整旧交接](PROJECT_HANDOFF_HISTORY.md#handoff-2026-09-18-health-latest)，不重新执行其中的旧“下一步”。
