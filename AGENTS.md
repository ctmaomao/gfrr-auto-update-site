# AGENTS.md — Global Financial Risk Radar AI 开发守则

## 适用范围与优先级

保护现有数据链、模型契约和部署保护网；普通任务采用最小可验证改动。用户当前明确指令优先于技能建议；系统、开发者和实际工具权限不由本文件改变。
先判断规则点名的路径、阶段和操作。明确记录的 reviewed supersession / owner-approved 窄范围例外仅在指定范围优先；其它范围仍遵守原约束。同范围、同状态且无明确替代关系的冲突才取更严格者，只暂停受影响步骤并继续独立工作。
文档权威分级见 [docs/INDEX.md](docs/INDEX.md)。旧阶段的“下一步”不是全项目当前任务；检查通过本身不构成批准。

## 执行与批准

授权任务连续推进至必要验证完成；常规选择自行判断，缺失关键信息才询问。只读审阅不写文件，设计授权不自动进入实施。批准沿用同任务有效范围，明确的临执行确认、owner 手动操作和费用重确认除外。仅暂停实际触及门槛的步骤，并先完成可独立准备的可审阅结果。
发消息、部署、发布、删除、付费调用/交易及通知仍须对应明确授权；技能不提供这些权限，也不默认授权安装或更新。

<a id="git-human-control"></a>

## Git 分级授权

决策记录见 [ADR-0026](docs/ADR/0026-tiered-git-authorization.md)。

2026-09-06 owner 已批准以本节替代通用“Git 只能由 owner 手动执行”的要求；历史记录不撤销该授权。保持 serial trunk mode：基于 latest main、一次一个逻辑任务、no stacked PR；旧 PR 不追加其它任务。Git 权限按操作影响判断，不按模型名称或置信度放宽。

- **本地常规操作自主执行**：可读取状态、fetch（不附带删除/prune）、创建任务分支或隔离 worktree、安全切换，以及只暂存本任务改动并在必要检查通过后本地 commit。同步当前分支仅允许工作区/索引干净时 fast-forward，该同步属于本地常规授权；无法快进则保留现场，先确定范围，不自动重写历史。
- **远端/集成操作按任务授权执行**：push、集成功能分支的 merge 及其触发的部署/发布须有相应目标和动作的明确授权；有效授权可沿用，由 AI 执行，无需 owner 手动敲命令。合并前的独立人工 review 和生产验收要求仍保留。推送到 main 可能触发 Pages，不能把本地 commit 授权当作发布授权。
- **破坏性操作保留具体确认**：强制推送、丢弃改动、重写共享历史、删除分支/worktree 等，先提供受影响对象与恢复方案，再取得针对具体操作的确认；不靠笼统“收尾”推断。

执行前核对分支、目标、工作区与索引；保留用户和其它任务的改动，不使用全量暂存混入无关文件。无法安全区分改动时只暂停相关 Git 操作。允许 Git 操作不等于必须制造分支或提交；按当前任务需要执行。源权利、付费调用、凭证、数据发布和平台 Hook 信任等单独保障不变。

## Pre-read pointers

开始任务读本文件、[CLAUDE.md](CLAUDE.md) 和 [PROJECT_BACKLOG.md](docs/PROJECT_BACKLOG.md) 当前任务/最新交接。数据源任务必读 [DATA_SOURCES.md](docs/DATA_SOURCES.md) 对应段落；不全量加载历史。

| 涉及改动 | 操作前必读 |
|---|---|
| 前端 HTML/CSS/SVG/rendering | [DESIGN.md](DESIGN.md) 全文及本文件 §2 |
| Worker/Brent/health/realtime | [runtime](docs/AGENT_DOMAIN_BOUNDARIES.md#runtime)、[general](docs/AGENT_DOMAIN_BOUNDARIES.md#general)、[Operations Runbook](docs/OPERATIONS.md) |
| External AI/DeepSeek | [external-ai](docs/AGENT_DOMAIN_BOUNDARIES.md#external-ai) 及其中规定的设计/输入输出/生产契约 |
| 宏观源/World Order/ACLED | [sources](docs/AGENT_DOMAIN_BOUNDARIES.md#sources)、[DATA_SOURCES.md](docs/DATA_SOURCES.md) |
| Energy/ODP/route freight | [energy](docs/AGENT_DOMAIN_BOUNDARIES.md#energy) 及对应 ODP/source-rights 契约 |
| Transport 手工样本与工具 | [transport-manual](docs/AGENT_DOMAIN_BOUNDARIES.md#transport-manual) 对应点名工具，仍隔离于生产 |
| Transport 已批准 runtime | [transport-runtime](docs/AGENT_DOMAIN_BOUNDARIES.md#transport-runtime)，不把 helper 通过当作 runtime 授权 |
| JSON 字段/管线架构 | [DATA_CONTRACT.md](docs/DATA_CONTRACT.md)、[UNIFIED_DATA_PIPELINE_ARCHITECTURE.md](docs/UNIFIED_DATA_PIPELINE_ARCHITECTURE.md) |

## 1. 项目当前状态与跨任务硬边界

- Release/display version 为 v28.0.10；data.version / decisionModel.contractVersion 保留 v27.0。asset cache 读 scripts/app.js 的 APP_VERSION，不机械替换历史版本。
- Worker 主 preview 为 /market.worker-preview.json；M-94 前端当前读 data/radar-data.json，scripts/modules/realtime.js 冻结且未接入，重接 overlay 需另开评审。
- core secondary set 为 vix / gold / dxy / us10y / spx，只写 /market.secondary-preview.json，不参与 values.* 或主评分。不得绕过有效显示输入或在 render 重算 decision/execution/position。
- v28.0G-4C Trading Economics freshness hard gate：Yahoo 与 TE 均须 fresh。tradingeconomics-observedAt-invalid / tradingeconomics-confirmation-stale 在 promotion 层 hard hold；observedAt failure does not make candidate ok false。PR #53 superseded；KV write guard deferred。
- worker-health-snapshot 与 review:worker-health-snapshot 只读，不写 KV/数据或触发恢复/部署。Daily 输入仍为 realtime-data，不切 Worker；health warning 与 hard-fail 边界不混淆。
- External AI 仅独立展示，不影响 scoring/decision/execution/position。现行 Macro Risk / Bubble Watch 生产路径仍须成本授权、单次 provider call/no retry、validator/review/freshness；不覆盖 deterministic 输出，不晋升 manual artifacts，不打印凭证。
- World Order 为独立 regime overlay，不是第七个模块；新增源需 source review / 独立接入授权。ACLED 仅手工 xlsx 标准化，不自动抓取或恢复旧 API；失败不伪造数据或清空可用缓存。
- 宏观代理保留来源/时效/缺失披露。macroDrivers.employment 含 FRED CES0500000003 平均时薪，sourceStatus.{icsa,ccsa,jtsjol,ahe,u6,industryPayroll} 失败降级。macroDrivers.consumerRetail 可展示 Redbook public HTML / BoA 公开摘要，不冒充原始卡数据。macroDrivers.commercialRealEstate 不得伪造为 CDX、私募信贷数据或非公开 CRE loan tape。M-74 后代理按对应源契约 display-only。
- Transport 的 transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1 是既有 owner_thread_approval，状态 runtime_scoring_migration_authorized_capped_free_proxy、maxContributionPct=3；P51 transport-shock-scoring-impact-v1 只准现行 free-proxy gate 的 +1/+2/+3、默认 fail-closed 0。routeFreightConfirmation/marketConfirmation 仍 not_connected；不扩展 ODP/Brent promotion/Heatmap/cross-validation/Bubble Watch。
- route-level tanker freight source-rights 和生产写入须独立批准，manual/preflight 成功不是授权。不降低 checker/validator 或篡改生产 JSON 让检查通过；不删除用户文件、数据、配置或日志。
- 不引入未经批准的依赖；零生产依赖策略、新增须 ADR 保留。保持现有模块和架构；领域细则无损迁移至 [规则附件](docs/AGENT_DOMAIN_BOUNDARIES.md)，按上表读取。
- 修改 index.html、scripts/app.js 或 scripts/modules/*.js 必须运行 `npm run bump:frontend-asset-version` 同步入口和本地 module import query；仅 Worker/docs/check/workflow/JSON 改动无需 bump。scripts/ 的 console.log 可能是 Actions 日志功能，不作为 debug 残留删除。

## 2. Frontend Design Contract — Mandatory Reading

任何 HTML/CSS/SVG/JS rendering 改动前必须完整阅读 DESIGN.md。非简单视觉改动先盘点当前颜色/字体/className 等受影响现状，并引用适用设计章节。

触及 index.html、assets/styles.css、scripts/modules/render*.js 或 SVG rendering 的 PR 描述必须包含：普通变更用 **“本 PR 符合 DESIGN.md 的所有规则”**；变更设计契约用 **“本 PR 申请变更 DESIGN.md 的 §X 节”**。

仅获前端展示授权时，不得更改 scoring/decision/execution/position、data/、启用 Market Pricing Temperature、增加 live fetch/生产写入或修改 .github/workflows/。专门后端/workflow 任务按独立授权执行；DESIGN.md 不授予业务/数据权限。

check:frontend-live-contracts 覆盖 DOM、null/zero 和 display-only macro coherence；IA/字体/视觉以 DESIGN.md + review 为准（ADR-0014），已退役的 homepage-ia/editorial-redesign checker 不再运行。适用契约未通过不得合并。完整套件及副作用见 §5。

## 3. 严格禁止的高风险行为

1. 不要把 `brentValidation.consensus.recommendedValue` 直接改成 Brent 主值。
2. 不要放松 local fallback 安全闸门。
3. 不要绕过 `effectiveDisplayInputs` 直接使用 raw realtime values。
4. 不要在 render 层重新推导 `executionLock` / `positionGuidance`。
5. 不要为了让检查通过而削弱 `validate-data.mjs`。
6. 不要随意提交 `data/*.json` 或 `realtime/*.json` 作为临时修复。
7. 不要大规模重写 `scripts/run-daily-pipeline.mjs`、`scripts/run-realtime.mjs`、`scripts/modules/decision.js`。
8. 不要修改内部字段名：`dxy`、`rt-dxy`、`values.dxy`、`displayInputsBaseline.dxy`。
9. 不要把用户可见文案改回：`十亿美元`、`美元指数`、`广义美元`、`Δ --`。
10. `scripts/app.js` 是高风险核心文件；如果修改它，最终必须通过 `node --check scripts/app.js`。
11. 已授权实施任务应修改真实文件并验证；审计、设计和修改前审阅只交结论与建议，可提供短 diff。冲突文件编辑与 Git 操作按各自授权处理。
12. 不要在未被要求时改变数据结构。
13. 不要把 `secondarySources` / `secondaryDiagnostics` / `secondarySourceSummary` 混入 `/market.worker-preview.json`。
14. 不要让 VIX / Gold / DXY / US10Y / SPX secondary 覆盖或参与任何 `values.*` 主值。
15. 不要让 Google Finance sourceProbe 进入 Brent consensus / promotion（Stooq Brent 诊断 sourceProbe 已于 F6 删除;此禁令保留作 anti-regression 守卫,与 `check-workflows.mjs` 的 F6 守卫一致）。
16. 不要新增外部源却不加短超时、try/catch 和 diagnostics-only 失败隔离。
17. 不要把 Daily workflow 的主输入从 `realtime-data` 改成 Worker endpoint；Daily vs Worker drift 只能作为 audit-only 信息。
18. 不要让 Worker health check 修改 Worker runtime、payload contract、KV、data/realtime 产物或前端 fallback 逻辑。
19. 不要把 Check Realtime Health 恢复成 Worker-first runtime hard gate；`realtime-data` stale 不应阻断主运行链路监控。

## 4. 默认开发流程

1. 读取当前任务和适用规则，检查基线与工作区；不改用户已有无关改动。
2. 完成授权范围内的实施、修复和必要检查，不因常规选择或步骤切换暂停。
3. 检查失败先归因：本次引入且在范围内的失败必须修复；既有失败/环境阻塞报告证据，不扩大修复范围。必需检查未通过时不得声称全部完成或满足提交条件。
4. 报告实际文件、检查命令/退出码及限制；Git 操作遵守前置分级授权。

必要检查成功后才提交；报告实际执行的操作和结果，不因已授权的 Git 步骤再次暂停。
默认验证不运行 Daily/realtime 生成脚本。获授权运行后核对产物差异；非目标产物只恢复本轮自身造成且可明确分离的内容，不覆盖用户数据，不运行未经授权的 Git 恢复命令。无法安全分离时保留现场，仅暂停相关写入并说明。

## 5. 验证入口与副作用

本地交付/提交准备运行 `npm run check:changed`，自动比较整个工作区与 HEAD（含 staged、unstaged、未忽略的新文件）。`-- --plan` 仅预览，不能算验证通过。实现与判定边界见 [ADR-0025](docs/ADR/0025-proportionate-validation.md)。

- 普通 Markdown 说明改动：文档链接/锚点、既有文档契约和 diff whitespace 检查。
- 代码、配置、workflow、数据、AGENTS/CLAUDE/DESIGN/SKILL、ADR、规则/契约或被 checker 消费的文档，以及删除、命令示例和权限措辞：仍跑 `npm run check:all`。语义上影响行为、授权或契约的改动即使未被自动识别，也必须完整检查；不确定时取完整检查。
- 发布/部署和明确点名的专项验收保持原要求。CI/Pages 仍跑 check:all；不能用轻量检查替代生产保护网。相同文件/输入已成功执行的检查不重复跑，除非出现新改动、失败或未解风险。无改动的只读审计不自动跑全套。

`check:all` 组成以 package.json / scripts/check-suite.mjs 为准。对生产数据只读不等于零文件写入：external-ai 套件的 check:external-ai-manual-input:analyst 写 ignored manual-artifacts/external-ai/manual-input-analyst-latest.json；不是 provider 调用或生产写入授权。零文件写入审计不运行该生成项。

## 6. 专项验证

按改动选最直接的专项检查；全套中已成功执行的专项计入验收：HTML 用 check:dom，workflow 用 check:workflows，文案用 check:frontend-zh-copy，数据契约用 check:data。data:verbose 用于解释 expected skip；仅明确要求严格时间对齐时使用 check:data:strict-live-alignment。
Daily/realtime 生成操作仍须授权，按 §4 核对产物并保留用户改动。修改 scripts/app.js 仍须 node --check；前端 asset bump 规则不变。

## 7. 用户可见文案规则

- dxy 显示为“广义美元指数”，ON RRP 单位为“亿美元”；delta 显示 Δ +n / Δ -n / Δ 0 或“趋势待累计”，禁止 Δ --。
- 前端中文优先，禁止直接显示工程边界英文、snake_case 枚举或裸 camelCase 字段；使用 labelZh/中文映射。边界文案统一为“仅供参考,不参与平台的风险打分与决策”。
- 报刊双语刊头/副标题、金融标准缩写以及已登记的审计溯源标识符可以保留。不要放宽 check:frontend-zh-copy；新增允许项须显式登记并遵循 §10 的 checker 评审要求。
- 不把缺失值隐式转为 0；保留 check:null-zero-display-guards。新文案仍按 §6 验证。

## 8. 工作流与部署保护

Pages 部署验证以 .github/workflows/deploy-static-site-to-pages.yml 为准，当前仍为 check:all；副作用见 §5。Realtime/Daily 的 Actions Summary 提供输出、baseline、Decision 与 Transmission Delta 的人工审计记录。

## 9. 推荐输出格式

按用户请求交付。实施任务报告改动文件、结果、检查命令/退出码、未验证项和实际风险；审计任务报告证据与建议。可按需给短 diff，默认不贴整文件，不重复列举未涉及的高风险模块。

如有未完成的验证或待 owner 操作/批准，明确说明；无需固定列四种状态。目标包括尚未执行的发布/合并时不得宣称全部完成；仅要求本地实现时不另造发布要求。授权工作和必要验证完成即交付，不因可选美化或无关历史问题延长任务。

## 10. `/goal` 自主循环 review 守则

本节为 Codex `/goal` 等自主循环工具的人工 review 强制要求。`/goal` 跑完声明 complete + `check:all` 全绿,不等于可以 merge。merge 前必须人工核对以下三点;任一点失败必须先修复或回滚,不得跳过。

- **方案一致性**：merge 前人工打开实际文件，核对实施清单与 owner 拍板的方案一致；不能以汇报声称一致代替检查，不能未经批准改走其它方案。
- **Contract checker 完整性**:必须确认 `/goal` 没有为了让 `check:all` PASS 而擅自放宽现有 contract checker。检查方法:在受影响的 contract / checker 文件上跑 `git diff`,确认 assertion 没被删、没被改宽、没被加 skip。Contract checker 的 assertion 变更属于 ADR-level 决策,必须独立 reviewed PR,不得隐藏在 presentation patch 里。
- **Ignore list 显性化**:任何新增的 coverage checker / contract checker 的 ignore list 必须在文件内对每一条 ignore 写明理由(为什么 ignore、对应哪个边界、unlock 路径)。无注释的 ignore 是技术债,不得通过 review。

实施或文档同步任务触发实际审批后，将用户拍板方案记录在 PROJECT_BACKLOG.md 对应任务作为 acceptance baseline；只读审计在回复中记录。记录不扩大授权，也无需为记录本身再次请示。

`/goal` 指令模板默认 Done 条件中必须包含一条 self-audit step:在声明 complete 前自己跑一遍上述三点核对,把核对结果写进汇报,而不是只汇报 check:all 通过。

### 10.4 Git 权限

执行文件前部的 [Git 分级授权](#git-human-control)。本节保留旧章节入口，不重复定义权限。

---

## 历史与领域规则

历史索引见 [MILESTONE_INDEX.md](docs/MILESTONE_INDEX.md)，旧拆分快照可只读执行 `git show v28.0J-pre-split:AGENTS.md`。当前领域细则见 [规则附件](docs/AGENT_DOMAIN_BOUNDARIES.md)，按路径读取。
