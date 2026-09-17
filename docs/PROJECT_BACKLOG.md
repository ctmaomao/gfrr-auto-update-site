# Project Backlog · GFRR Auto-Update Site

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
