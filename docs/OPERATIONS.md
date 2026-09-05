# Global Financial Risk Radar 运行排查手册

本文档用于日常维护排查。遇到页面数据过期、Daily 数据不一致、Brent 主值疑问、Transmission Delta 未显示或 Pages 部署失败时，优先按这里的顺序检查。

相关文档：

- [v27 稳定化基线](V27_BASELINE.md)：用于确认当前 v27.x 已完成升级、维护边界、保护网和下一阶段建议。
- [External AI API Design](EXTERNAL_AI_API_DESIGN.md)：用于未来 DeepSeek / OpenAI / external AI API 接入前的设计、输出审计和 fallback 边界。
- [External AI Prompt Contract](EXTERNAL_AI_PROMPT_CONTRACT.md)：用于未来 offline/manual prompt tests 的输入输出契约和非生产样例 fixture 边界。

## 1. 本地完整检查

提交前优先运行：

```bash
npm run check:all
```

该命令的实际组成以 `package.json` 的 `scripts.check:all` 为准。不要在运维文档中复制完整链路或硬编码检查数量,避免与 `package.json` 漂移。

默认 `check:all` 是只读验证链。external AI 的 artifact / projection / manual-input 生成能力保留为显式 opt-in 命令,不属于日常默认验证。

PR 还必须通过可量化纯逻辑覆盖率和单一 Chromium 浏览器 smoke。首次本地运行浏览器 smoke 前安装项目锁定版本对应的 Chromium；测试只读取本地静态文件，不调用生产 AI、Worker 写接口或 KV：

```bash
npm run test:unit:coverage
npx --no-install playwright install chromium
npm run test:e2e
```

`test:unit:coverage` 仅对命令中明确列出的核心纯逻辑文件执行 lines / branches / functions 门槛。`test:e2e` 先用与 Pages workflow 相同的 `build:pages-artifact` 生成 `_site` 白名单产物，再用一个全新 Chromium server/worker 验证桌面和手机的首页、Bubble Watch、缺失趋势日期、附属 JSON 缺失与 External AI fallback；不得复用 4173 端口上的旧 server。

`check:data` 等价于 `node scripts/validate-data.mjs`。v28.0G-10 Data Check Expected-Skip Noise Cleanup 后，默认检查不再为 local realtime / `dailyRealtimeInput` 时间不一致输出 warning；这是 expected skip，因为 Worker-first runtime 已是主链路，本地 realtime 属于 fallback / Daily baseline，可能不是同一快照。

版本排查时不要把根级 `data.version` 当成产品发布号。当前 release/display version 是 `v28.0.10`，页面 ISSUE 与新 Daily 输出应使用 `releaseVersion`；根级 `data.version` 与 `decisionModel.contractVersion` 的 `v27.0` 是兼容数据契约标记。`check:data` 成功输出为 `Validation passed (release v28.0.10; data contract v27.0)`。

`check:frontend-live-contracts` 聚合当前前端 live display contract。`check:frontend-zh-copy` 检查用户可见中文文案契约，防止“广义美元指数 / 亿美元 / 传导网络 Δ”等已修复文案回退。

`check:node-runtime` 检查本地 Node runtime 与 GitHub Actions runtime baseline，防止 Node 20 / Node 25 / 旧 action 版本回退。

`check:workflows` 检查 GitHub Actions workflow 合约，防止 Realtime / Daily / Pages 部署中的关键调度、Summary、校验和部署步骤被误删。

`check:docs` 检查 README.md、AGENTS.md 和 docs/*.md 中的本地 Markdown 链接是否指向不存在的文件；http / https / mailto / 纯锚点链接会跳过。

`check:syntax` 和 `check:modules` 均为自动发现模式；新增 `scripts/` 文件或 `scripts/modules/` 模块后，通常会自动纳入检查。

需要查看跳过原因时运行：

```bash
npm run check:data:verbose
```

需要强制本地 realtime 与 `dailyRealtimeInput` 同快照时运行：

```bash
npm run check:data:strict-live-alignment
```

如果当前本地 `realtime/market.json.updatedAt` 与 `dailyRealtimeInput.updatedAt` 不一致，strict 模式会失败；这不代表默认 `check:data` 失败，也不代表删除了 `validateRealtimeBaselineAlignment`。本轮不改 data/realtime、不改 Worker runtime、不改前端、不 deploy。

## v28.0I Cockpit baseline checks

v28.0I release review 与 v28.0I-8B post-deploy audit 已通过。日常排查 cockpit 解释层时，优先按以下顺序：

1. 先看页面 frontend version 是否为当前版本（以 `scripts/app.js` 的 `APP_VERSION` 为准，现 `bofa-report-review-1`）。
2. 检查 live `data/radar-data.json` 是否包含 `dailyBrief`、`divergenceLayer` 与 `brentPricingLayer`。
3. 检查 Worker Health；Check Worker Health 仍是 Worker-first runtime hard gate。
4. 检查 Realtime Health；Check Realtime Health 仍是 GitHub `realtime-data` fallback / Daily baseline soft observer。
5. 若页面显示 Daily Brief / Divergence Layer / Brent Pricing Layer fallback，先判断 Daily workflow 是否已在对应 contract 合并后运行并完成 Pages deploy。
6. 若 Brent Pricing Layer 缺失，不要手工改 `data/*.json`；应触发或等待 Daily workflow 自然生成。
7. 若 `aiInterpretationLayer` 缺失，先确认 Daily workflow 是否已在 v28.0J-0 之后运行；不要手工补 `data/radar-data.json`。
8. 若 World Order warning 仍为 GDELT stale / SIPRI manual_required / ACLED not_configured，属于已知非阻断观察状态。

v28.0I / v28.0J 新增的 `dailyBrief`、`divergenceLayer`、`macroDrivers.consumer`、`consumer_vs_asset_pricing`、`brentPricingLayer` 与 `aiInterpretationLayer` 均为解释层 / 审计层 / 展示层，不改变 `values.*`、`effectiveDisplayInputs`、Brent promotion、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。

## v28.0J AI Interpretation Layer baseline checks

v28.0J-2B post-deploy audit 已通过，rule-based `aiInterpretationLayer` 为 rule-based structured interpretation，不调用 DeepSeek / OpenAI / 外部 AI API。旧 `externalAiInterpretationLayer` 只保留数据兼容；首页当前可见的 DeepSeek 输出是独立 `macroRiskEditorialLayer`。日常排查顺序：

1. 检查 live frontend version 是否为当前版本（以 `scripts/app.js` 的 `APP_VERSION` 为准，现 `bofa-report-review-1`）。
2. 检查 live `data/radar-data.json` 是否包含 `aiInterpretationLayer`。
3. 检查 `aiInterpretationLayer.contractVersion` 是否为 `v28.0J-0`。
4. 检查 `generatedByExternalAi=false` 与 `usesExternalAiApi=false`。
5. 若页面显示 AI fallback，先确认 Daily workflow 是否已在 v28.0J-0 之后运行，并确认 Pages deploy 是否完成。
6. 不要手工补 `data/radar-data.json`。
7. 若未来外部 AI 接入，必须检查 timeout、fallback、source attribution、禁用文案和不影响 scoring / decision 的边界。

## Macro Risk Editorial operations（当前 · integrated visible read-only）

`macroRiskEditorialLayer` 是首页 `MACRO RISK OVERVIEW` 内的 DeepSeek 只读编辑层。它综合近 7 日 Tavily/Brave 新闻与站内结构化数据；不影响评分、六大模块、tail overlay、决策、执行、仓位、World Order、ODP 或 Bubble Watch。若 output 缺失、provider timeout/API error/rate limit、invalid JSON、unsafe wording、来源不足、`sourceDataUpdatedAt` 不匹配或超过 30 小时，前端隐藏编辑层，并继续显示规则生成的今日总判断，同时自动展开 `#macro-professional-evidence` 中的确定性压力来源、信号、引擎、交叉验证和跨市场依据。

若 AI output audit 失败，不得手工编辑 `data/radar-data.json` 修复 AI 输出，也不得在同一次运行内重复付费调用。先审阅 `manual-artifacts/macro-risk-editorial/deepseek-failure-latest.json` 的脱敏 diagnostics。

旧 `docs/fixtures/external-ai/*.json` 与 `externalAiInterpretationLayer` 工具仍供兼容/手动诊断，不是当前首页判读生产路径，不得把其中 artifact 手工复制到 `macroRiskEditorialLayer`。

排查当前宏观判读时先运行：

```bash
npm run check:macro-risk-editorial
```

如果 validation fails，应保留 deterministic macro overview fallback。不要手工编辑生产 JSON，也不要削弱契约、危险文案或来源守门。

页面 IA 排查还应运行 `npm run check:macro-overview-evidence-fold`。有效编辑层下专业证据默认收起属于正常状态；编辑层无资格时专业证据必须自动展开。不要用 `display:none` 删除这些确定性模块，也不要为修复折叠状态修改评分或 production JSON。

`externalAiInterpretationLayer` 的历史 production value 允许 Daily 继续 preserve，但它没有可见 DOM/renderer，也没有 scheduled provider refresh。不要为该旧字段触发付费修复。

## Macro Risk Editorial production checks

当前生产排查顺序：

1. 检查 live data 是否包含 `macroRiskEditorialLayer`。
2. 确认 `schemaVersion=macro-risk-editorial-production-v1`、`status=valid`、`displayEnabled=true`、`provider=deepseek`。
3. 确认 `sourceDataUpdatedAt === radarData.updatedAt`、`freshness.maxAgeHours=30`、`freshness.isStale=false`。
4. 确认 `validation.status=pass`、`qualityReview.status ∈ {pass,warn}`、`qualityReview.promotionEligible=false`、`provenance.humanApproved=false`。
5. 确认所有 `affects*` 边界均为 false，并运行 `npm run check:macro-risk-editorial-live -- --require-layer`。
6. 检查 `sourceLedger` 中新闻 URL 为 HTTPS、没有 snippet/raw provider response/API key，并确认 output 引用均能回到 ledger。
7. 若字段缺失或异常，查看 `Macro Risk Editorial Refresh` 日志与三天期 artifact；不要手工编辑生产 JSON。
8. provider failure 不得同 run 重试；待问题定位或下一次 scheduled refresh。

### Macro editorial refresh / Daily timing

GitHub Actions cron 使用 UTC。当前顺序为 `Build Daily Radar Data` 22:30、`Refresh World Order Stress` 23:00、`Refresh Oil Directional Pressure` 23:45、`Macro Risk Editorial Refresh` 00:05。Daily 不调用 DeepSeek；编辑 workflow 在主要站内数据完成后抓取近 7 日新闻、构建紧凑证据包并最多调用一次 DeepSeek。

`Macro Risk Editorial Refresh` 是 `macroRiskEditorialLayer` 的唯一生产写入路径。流程固定为 news discovery → compact input → one DeepSeek call → output contract → quality review → projection → guarded write → live layer check + `check:data` → protected-path assertion。只允许提交 `data/radar-data.json`；Pages 在 workflow 成功后自动部署。

普通质量 `warn`（例如只有一条可信新闻或正文偏离 4,000–5,600 字目标但仍在 2,000–6,800 兼容区间）允许只读展示并保留 warning。结构错误、零可信新闻、来源引用断裂、危险操作性文案、provider failure、陈旧/时间错配、路径越界或任何非零生产影响均 hard fail。

可见正文长度只统计页面真实渲染的标题、日期、正文、数据限制和置信度说明；`sourceRefIds`、module 枚举、claim type 与 audit flags 是机器元数据，不得因引用更充分而增加“可见字数”。prompt 要求按 section 预算并在输出前把真实可见正文控制在 6,200 字以内；validator 的 6,800 字 hard cap 不变。若仍出现长度失败，先查看 failure artifact 的 `visibleTextSectionLengths`，定位超长 section；不得提高上限、保存失败正文、在 adapter/writer 截断，或同 run 重试。

scheduled workflow 始终运行远端 `main`，本地修改或仅 push 到 feature branch 都不会修复下一次定时任务。Actions 故障只有在修复提交已成为 `origin/main` 的祖先、精确 workflow 重跑成功且下游 Pages/写入边界核对完成后才算线上闭环；否则只能报告“本地修复完成，线上仍未生效”。

零可信新闻不允许进入 provider/review/write。若 artifact 显示 Tavily 与 Brave 的所有 topic 查询均为 `ok`，但当期确实只有 `discovery_only`，workflow 会在 provider 前记录 `SKIPPED_NO_CREDIBLE_NEWS` 并以 expected fail-closed skip 结束；这表示本期没有生成新判读，不是 refresh 成功。确认 Summary 中 `DeepSeek calls: 0`、`Production data writes: 0`，并允许 deterministic overview 继续兜底。若任一搜索源不是 `ok`、artifact/schema 异常或已进入 provider 后失败，仍按真实故障处理，不得改成 skip。

Tavily/Brave keys 由 Macro Risk、Bubble Watch 与 Oil News 共享。`Refresh Oil News Event Watch` 固定每 6 小时运行；按 31 天最坏情形，全部 scheduled flows 合计 737 requests/provider/month，另保留 200 次 manual/diagnostic reserve，由 `check:workflows` 阻止预算超过 1,000。若 Macro artifact 出现 `http_432_plan_limit`（Tavily）或 `http_402_payment_required`（Brave），先检查同时间的 `data/oil-news-event-watch.json.sourceStatus.details`，确认是否为共享月度额度耗尽；不得把 source-health hard failure 降为 expected skip，也不得为此触发可能进入 DeepSeek 的完整手动 rerun。等待月度 reset，或由 owner 在 provider dashboard 更新 plan/key。

若 discovery 已有可信新闻但 review 报 `至少需要引用 1 条 official 或 cross_checked 新闻`，说明 provider 没有在任何事实对象的 `sourceRefIds` 中实际使用已枚举的可信新闻；只在 `sourceAttribution` 或 `dataGaps` 提及不算通过。保持 production write 为 0，审阅脱敏 artifact，并修订 provider prompt/回归；不得手工给 artifact 补引用，也不得同 run 或未经新授权再次付费调用。

如果 `radarData.updatedAt` 在 Daily 后变化而新判读尚未生成，前端会因 `sourceDataUpdatedAt` 不匹配而暂时隐藏编辑层；这是 fail-closed 预期状态。不得为几分钟的调度间隔手工改时间戳或重复调用 provider。

### Bubble Watch weekly editorial refresh

`Bubble Watch Weekly Editorial Refresh` 是
`data/bubble-watch.json.summary.weekly_editorial` 的唯一生产写入路径。正常由周一
`Refresh Bubble Watch` 成功后的 `workflow_run` 触发；在 `main` 手动运行时必须显式设置
`acknowledge_cost=true`。工作流复用现有 `external-ai-production-refresh` environment、
Tavily/Brave repository secrets 与 `DEEPSEEK_API_KEY`，每次最多一次 DeepSeek 请求，
不自动重试。

Provider 请求固定 `max_tokens=8000`，可见正文目标 2,600–3,400 中文字符。这一
长度以 2026-08-11 读取的参考站近 12 个已提交周度版本为标定：最近 5 期均值
2,947 字，P90 3,137 字，最大 3,278 字。Token budget 还需容纳 stable IDs、引用、
边界对象与 JSON 字段名，不得把 8,000 tokens 解读为 8,000 字用户可见正文。

生产顺序固定为：bounded Tavily + Brave discovery → compact input validation → 一次
DeepSeek JSON request → output validation → quality review → projection → guarded writer →
`check:bubble-watch` + `check:all` → exact-path assertion → 只提交
`data/bubble-watch.json`。两个新闻索引都必须有可用 live 结果；official/cross-checked 为 0
时禁止进入 provider/review/write。若 Tavily 与 Brave 的全部 6 个 topic 查询均为 `ok`、但确实
没有可信新闻，workflow 以 `SKIPPED_NO_CREDIBLE_NEWS` expected skip 结束，Summary 必须显示
DeepSeek calls=0、production writes=0；任一搜索源异常仍 hard fail。只有 1 条时可以继续，
但 discovery 必须标记 `partial`、quality review 必须
`warn`、`dataGaps` 必须披露，其余 discovery-only 事实段落必须同时引用站内指标。discovery、input、
provider output、review 与 projection 都是 ignored artifact，仅上传保存 3 天供诊断，
不得提交。

完整 discovery 可保留每 topic 5 条；进入 DeepSeek 前必须压缩为每 topic 最多 2 条、
总计最多 12 条，保留全部 27 个结构化指标且总输入小于 60 KiB。若 input size gate
失败，应修复 compact projection 或来源冗余，不得提高上限后直接付费调用。

故障处理：

- Collector/input failure 发生在付费调用前。先看 provider status、query diagnostics 和
  credible-story count；不得削弱双 provider 或来源质量门槛。
- Run `31999823886` 的 Tavily/Brave 均为 6/6 `ok`、30 条结果全部为 `discovery_only`；旧 workflow
  把这种健康但无可信新闻的数据状态报成 input failure。修复后该精确状态只走
  `SKIPPED_NO_CREDIBLE_NEWS`，并以不存在 input/output/review/projection、`git diff --quiet` 证明
  零副作用；不得为了强行调用 DeepSeek 把单一媒体报道提升为 official/cross_checked。
- Provider timeout/unavailable/invalid JSON 只生成 sanitized failure artifact，不写生产。
- Provider 连接在 HTTP/JSON envelope 前中断必须分类为 `provider_transport_error`，并只保留
  error name/code 等 sanitized transport diagnostics；HTTP 响应存在但 envelope 无法解析时使用
  `provider_response_envelope_invalid`。两者均不得在同一 run 重试，不得保存 raw body。
- Provider 已返回可解析 JSON、但候选输出未通过字段/引用/安全契约时必须分类为
  `provider_output_contract_invalid`；failure artifact 只保留 finish reason、可见字符数和脱敏
  validator errors，不保存候选正文。若 `finish_reason=length`，仍归类为
  `provider_output_truncated`。同一 run 不重试。
  若错误为 `relies only on discovery_only news`，应检查 provider prompt 的逐项引用自检与
  source ID 分组是否仍在；不得删除来源守门、自动伪造站内引用或把引用只补到
  `sourceAttribution`。事实对象的同一个 `sourceRefIds` 必须包含独立支撑。
  不得连续重跑付费失败；先审阅 failure classification 与 diagnostics。
- Validator、quality hard-fail、writer、protected-path 或 repository check 失败均阻止
  commit。不得把 provider artifact 复制进生产或手工编辑 `data/bubble-watch.json`。
- Editorial 缺失、过期或 as-of 不匹配是预期 fail-closed display 状态：
  `bubble-watch.html` 继续显示确定性 `bubble-watch-narrative-v2`。AI 层不影响
  Bubble Watch 分数或任何 GFRR scoring/decision/execution/position 路径。

本地 no-network 验证：

```bash
npm run check:bubble-watch-weekly-editorial-workflow
npm run check:bubble-watch
npx playwright test tests/e2e/site-smoke.spec.mjs --grep "Bubble Watch"
```

回滚必须 reviewed revert 最近一次 `chore: refresh Bubble Watch weekly editorial` 数据
commit，或 reviewed data update 同时关闭 `displayEnabled` 与
`frontendDisplayApproved`。回滚 display 层时不得改变确定性 verdict。

`invalid_provider_json` 排障必须先看 sanitized `finishReason`、`contentLength`、
`contentStartsWithObject` / `contentEndsWithObject`、`contentHasSingleJsonFence`、usage 和
reasoning-content presence；artifact 不保存正文。`finishReason=length` 归类为
`provider_output_truncated`。不得通过保存 raw response、放宽 output validator 或接受夹带
任意前后文的 JSON 片段来“修复”生成失败。

## Stable Observation Audit

v28.0K-3D originally added a read-only stable observation gate for the v28.0K baseline. M-44 deprecates that legacy gate because it was hard-coded to the disabled external-AI scaffold era and no longer matches the v28.0L+ production External AI state.

Do not restore or run the retired workflow/script. Use the v28.0L-aware checks for current coverage: `check:external-ai-production-contract`, `check:external-ai-production-write-guard`, `check:external-ai-provenance-completeness`, and the full `check:all` chain.

## v28.0K-4A Manual API Test Design

v28.0K-4A is design-only. It documents a future disabled-by-default manual API test process in [`EXTERNAL_AI_MANUAL_TEST_DESIGN.md`](EXTERNAL_AI_MANUAL_TEST_DESIGN.md), but it does not add API code, secrets, provider SDKs, external AI workflows, frontend display, or production data changes.

If manual API tests are run, they must be explicitly opt-in. A failed manual test is a diagnostic event, not a production incident. Production fallback remains the rule-based `aiInterpretationLayer`. _(历史 K-4A:当时要求 production layer 保持 disabled;自 v28.0L-3P+ 该层已 visible read-only,见 `docs/DATA_CONTRACT.md` 当前生产契约。)_

## External AI Manual Dry-Run Scaffold

v28.0K-4B adds a local no-network scaffold command:

```bash
npm run manual:external-ai:dry-run
```

Expected result: a dry-run scaffold report only. The command does not use network, does not read API keys, does not call a provider, and does not mutate production data. If it fails because provider is not `none`, that is expected safety behavior.

Do not use this command to troubleshoot production `externalAiInterpretationLayer`. _(历史 K-4B note;当前 production layer 为 visible read-only,排查见上文 “External AI production layer checks”。)_

## External AI Provider Adapter Skeleton

v28.0K-4C adds a disabled provider adapter skeleton for future manual tests. Local check command:

```bash
npm run check:external-ai-provider-adapters
```

Expected result: `External AI provider adapter skeleton: PASS`.

Non-`none` provider refusal is expected in v28.0K-4C. Do not treat `deepseek` / `openai` refusal as an incident; no API call is expected, no API key should be read. _(历史 K-4C note;此为手动测试 adapter skeleton 行为;生产 `externalAiInterpretationLayer` 现为 visible read-only,见 `docs/DATA_CONTRACT.md` 当前生产契约。)_

## External AI DeepSeek Manual Artifact Test

v28.0K-4D adds an explicit DeepSeek manual API test command. Dry-run remains no-network:

```bash
npm run manual:external-ai:dry-run
```

Manual DeepSeek artifact test:

```bash
npm run manual:external-ai:deepseek
```

Expected artifact path:

```text
manual-artifacts/external-ai/deepseek-output-latest.json
```

The DeepSeek command requires `DEEPSEEK_API_KEY`, `--allow-network`, `--validate-output`, and a safe `--output` path. Do not paste or print the API key. The command writes only a manual artifact, runs `check:external-ai-output` against it, and must fail closed if the API call, JSON parse, or validator fails.

Failure is a manual diagnostic event, not a production incident. Do not commit the artifact, do not copy it into `data/radar-data.json`, and do not use it to troubleshoot production `externalAiInterpretationLayer`. Rule-based fallback remains unchanged. _(历史 K-4D note;生产 `externalAiInterpretationLayer` 现为 visible read-only,见 `docs/DATA_CONTRACT.md` 当前生产契约。)_

After running `npm run manual:external-ai:deepseek`, do not run `git add manual-artifacts/` and do not commit artifacts. `manual-artifacts/` is ignored by git; delete local artifacts after review if they are no longer needed. A validator PASS means only that the artifact passed offline checks, not that it is approved for production promotion, frontend display, scoring, decision, execution, or position use.

v28.0K-4D-1 hardens the DeepSeek JSON artifact request after the first real test returned `DeepSeek response did not include message content`. This may indicate DeepSeek JSON Output returned empty `message.content`, including when thinking mode is left enabled. The request now explicitly disables thinking, uses a larger `max_tokens` budget, and repeats the JSON-only contract in the system prompt.

Failure artifacts may include sanitized `responseDiagnostics` such as response id/model, choices length, finish reason, message keys, content length, reasoning-content presence, usage keys, and a redacted API error summary. They must not include API keys, request headers, or the full raw API response. Do not repeatedly retry paid calls before reviewing these diagnostics.

v28.0K-4D-2 tightens the DeepSeek manual artifact prompt after a real provider response reached local validation but failed the output contract. If validation fails because `auditFlags` contains `投资建议`, similar investment / trading wording, or prose boundary sentences, do not weaken the validator. Tighten the prompt, keep `auditFlags` as neutral diagnostic tags such as `manual_artifact_only` or `sample_input_only`, and express boundary semantics through booleans such as `boundaries.notInvestmentAdvice=true`.

If a `sourceAttribution` warning appears, require `sourceAttribution` to be an array of objects with `sourceLayer`, `field`, `claimType`, and `noteZh`. Do not allow a string or an array of strings. Review the failed artifact before rerunning to avoid repeated paid calls.

If validation fails with `sourceAttribution must include site structured data or sample input attribution`, check whether each `sourceAttribution.noteZh` includes validator-recognized wording such as `样例`, `站内结构化`, or `sample input`. For sample/manual fixture based outputs, prefer `来自提供的样例结构化输入`; do not use only `来自提供的结构化输入`.

If validation fails because `modelJudgments`, `facts`, `inferences`, or another prose field contains unsafe wording such as `交易建议`, do not weaken the user-visible prose validator and do not repeatedly retry paid calls. Tighten the prompt globally so unsafe wording is excluded from display text. Boundary statements belong in the `boundaries` booleans, not in prose text, and `modelJudgments` should stay limited to evidence strength, data sufficiency, uncertainty, and low-confidence / watch conditions. A machine-only `modelJudgments[*].key` is not display copy and is exempt from the banned-copy list, but its sibling display fields remain checked.

If a live DeepSeek output passes validation but describes live radar input as sample input or repeats execution / position fields, do not promote the output and do not weaken the validator. Tighten prompt and input metadata, review the artifact, then rerun only after confirming local/live `radar-data.json` is attributed as `站内结构化数据` and `decisionContext` is treated as read-only system-state background.

On Windows PowerShell, read the artifact as UTF-8 to avoid encoding confusion:

```powershell
Get-Content manual-artifacts/external-ai/deepseek-output-latest.json -Raw -Encoding utf8
```

## External AI Live Site Manual Input Artifact

v28.0K-4E adds a manual-only input builder for real site-structured radar data. It writes an ignored artifact and does not call DeepSeek, read API keys, mutate production data, display frontend output, or change scoring / decision / execution / position logic.

Build manual input from local site data:

```bash
npm run manual:external-ai:build-input
```

Confirm the generated input artifact is ignored:

```bash
git check-ignore -v manual-artifacts/external-ai/manual-input-latest.json
```

Optional explicit live-site source, read-only and allowlisted:

```bash
node scripts/build-external-ai-manual-input.mjs --source-url https://radar.gfrfinradar.uk/data/radar-data.json --output manual-artifacts/external-ai/manual-input-live.json
```

Optional manual DeepSeek run using the generated input. Run this only when an operator explicitly intends a paid/manual provider call and has provided `DEEPSEEK_API_KEY` locally:

```bash
node scripts/run-external-ai-manual-test.mjs --provider deepseek --input manual-artifacts/external-ai/manual-input-latest.json --output manual-artifacts/external-ai/deepseek-output-latest.json --allow-network --validate-output
```

Validate a saved manual DeepSeek output:

```bash
npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json
```

Do not commit manual artifacts. Do not copy input or output artifacts into `data/radar-data.json`. Do not display external AI output in the frontend. Remove `DEEPSEEK_API_KEY` from the local shell after a manual test.

### DeepSeek timeout / aborted live-input troubleshooting

If a live-input DeepSeek call fails with `This operation was aborted`, do not repeatedly retry paid calls. First build the compact input artifact:

```bash
npm run manual:external-ai:build-input:compact
```

Then use compact input for the next deliberate manual test:

```bash
node scripts/run-external-ai-manual-test.mjs --provider deepseek --input manual-artifacts/external-ai/manual-input-compact-latest.json --output manual-artifacts/external-ai/deepseek-output-latest.json --allow-network --validate-output --timeout-ms 90000
```

If it still fails, inspect the failure artifact `requestDiagnostics` before another retry. The diagnostics include timeout, approximate input size, provider/model, and whether output validation was requested. They do not include the raw request body, headers, or API keys.

Artifacts remain manual-only and ignored. Do not copy compact input or provider output into production data, and do not display external AI output in the frontend.

### Manual DeepSeek provider failure classification

v28.0K-4E-4 failure artifacts include `failureClassification` so provider-side failures can be handled without mistaking them for valid external AI output.

- `provider_unavailable` / HTTP 503: stop repeated paid calls, do not run the output validator expecting PASS, retry later once, and do not treat this as a production incident.
- `provider_timeout`: use compact input, check `requestDiagnostics.inputApproxChars`, retry once later with `--timeout-ms 120000`, and stop if it repeats.
- `provider_invalid_json` or `provider_empty_content`: inspect the failure artifact and tighten prompt / input guidance before retrying.
- Failure artifacts are diagnostic only. Do not import them into `data/radar-data.json`, do not display them in the frontend, and do not use them for scoring / decision / execution / position logic.

If `npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json` is run against a failure artifact, the validator should fail with failure-artifact guidance rather than a long list of missing output fields. Failure artifacts must never be treated as PASS.

### Manual external AI quality review

v28.0K-4F adds an offline quality review gate for manual external AI artifacts. It does not call DeepSeek, does not read API keys, does not write production data, and writes only an ignored review artifact under `manual-artifacts/`.

After a successful manual DeepSeek output, first confirm the structural validator:

```bash
npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json
```

Then run the quality review:

```bash
npm run review:external-ai-artifact
```

Interpret the recommendation:

- `pass_for_manual_review`: the artifact may be considered in a later reviewed design PR, but is still not production.
- `needs_prompt_revision`: do not promote; tighten prompt or input guidance before another paid/manual run.
- `provider_failure_only`: provider issue only; this is not valid external AI output.
- `reject_for_promotion`: do not promote.

Promotion remains forbidden without a separate reviewed PR. Do not commit the quality review artifact, do not copy provider output into `data/radar-data.json`, and do not display external AI output in the frontend.

### External AI manual test baseline and stop rules

Stable v28.0K-4G manual test flow:

1. Build compact input:

```bash
npm run manual:external-ai:build-input:compact
```

2. Run DeepSeek manually only when needed, with local `DEEPSEEK_API_KEY` and explicit network / validation flags:

```bash
node scripts/run-external-ai-manual-test.mjs --provider deepseek --input manual-artifacts/external-ai/manual-input-live-compact.json --output manual-artifacts/external-ai/deepseek-output-latest.json --allow-network --validate-output --timeout-ms 120000
```

3. Validate output:

```bash
npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json
```

4. Run quality review:

```bash
npm run review:external-ai-artifact
```

Interpretation:

- `pass_for_manual_review`: may be considered in a later reviewed design PR, but is still not production.
- `needs_prompt_revision`: do not promote.
- `provider_failure_only`: provider issue, not valid output.
- `reject_for_promotion`: do not promote.

Stop rules:

- If `provider_unavailable` / HTTP 503 appears, stop repeated paid calls and retry later.
- If `provider_timeout` appears, retry at most once later with compact input and `--timeout-ms 120000`.
- If the validator fails, do not promote and do not repeatedly retry paid calls.
- If quality review returns `needs_prompt_revision` or `reject_for_promotion`, fix prompt/design first.

Security:

- Never paste API keys into chat, commits, docs, logs, or artifacts.
- Clear `DEEPSEEK_API_KEY` from the local shell after manual tests.
- Do not commit `manual-artifacts/`.

### External AI production integration design status（历史 staged-rollout note）

> **历史:** 以下 v28.0L-0…L-3G note 为旧 `externalAiInterpretationLayer` staged rollout 记录。该层曾在 v28.0L-3P+ 进入 visible read-only，现已退为 data compatibility/manual diagnostics；旧 scheduled workflow 与前端 panel 均已删除。当前首页 AI 运维以上方 `Macro Risk Editorial operations` 为准。

v28.0L-0 is documented in [`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md), but no production integration exists. Do not create GitHub secrets, scheduled provider calls, Daily provider calls, Worker provider calls, or frontend display until the L-0 design is reviewed and a later implementation PR is approved.

_(历史 L-0 note:撰写时无 production integration、layer 为 disabled scaffold；该旧 rollout 后续曾完成，现又已退场。见 `docs/DATA_CONTRACT.md` legacy compatibility contract。)_

v28.0L-1 readiness audit is documented in [`EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md`](EXTERNAL_AI_IMPLEMENTATION_READINESS_AUDIT.md). Operators must not add `DEEPSEEK_API_KEY` to GitHub Secrets until a reviewed `workflow_dispatch` artifact-only PR is approved. Do not run provider calls from Daily. Continue manual-only testing unless a later phase explicitly changes this boundary.

v28.0L-2 adds a disabled production provider path skeleton check:

```bash
npm run check:external-ai-production-provider-path
```

Do not set `DEEPSEEK_API_KEY` for L-2 checks. L-2 does not use secrets or network, and activation attempts must remain disabled.

v28.0L-3 designs a future manual `workflow_dispatch` artifact-only path. Operators must not add `DEEPSEEK_API_KEY` to GitHub Secrets until a reviewed workflow implementation PR requires it. Current allowed provider usage remains local/manual only. Any future workflow should use short-lived artifacts and explicit manual dispatch.

### External AI Manual Dry Run workflow

v28.0L-3B adds `External AI Manual Dry Run` in GitHub Actions. It is safe dry-run only and does not call DeepSeek.

How to run it:

1. Open GitHub Actions.
2. Select `External AI Manual Dry Run`.
3. Choose `Run workflow`.
4. Select `input_source=fixture_sample` for the default fixture dry-run, or `input_source=local_compact` to build a compact local input from repository data.
5. Leave `upload_artifacts=true` only when dry-run diagnostics should be retained briefly.

Expected behavior:

- no `DEEPSEEK_API_KEY` is required
- no GitHub secret is read
- no provider call is made
- no DeepSeek output is expected
- no production data is written
- no frontend output is changed
- artifacts are dry-run diagnostics only

If the workflow fails safety checks, do not bypass them. Do not edit the workflow to add provider-call arguments, provider inputs, allow-network inputs, or secret references. Any provider-call workflow requires a separate reviewed L-3C PR.

### External AI Manual Dry Run audit result

Successful dry-run validation:

- Run ID: `25583503038`
- Result: `PASS`
- Input source: `fixture_sample`
- Artifact: `external-ai-manual-dry-run-25583503038`

Use this run as proof that the dry-run skeleton works in GitHub Actions. Do not treat it as proof of provider-call readiness, do not add secrets based on this run, do not copy artifacts into production data, and do not use the dry-run artifact as external AI output.

If operators rerun the workflow, keep it dry-run only with the default `fixture_sample` input or `local_compact`. Artifacts remain short-lived diagnostics only and must not be promoted.

### External AI provider-call workflow design status

v28.0L-3C is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md). It is design-only.

Do not add `DEEPSEEK_API_KEY` to GitHub Secrets until a provider-call implementation PR is explicitly approved. Continue using the v28.0L-3B `External AI Manual Dry Run` workflow for no-secret validation. The dry-run workflow must remain `provider=none`, no-network, no-secret, and no-provider-call.

Provider-call artifacts, if implemented later, are still non-production manual diagnostics. A successful provider-call artifact would not imply Daily readiness, frontend readiness, production data readiness, or scoring / decision / execution / position readiness.

### External AI provider-call readiness checklist

v28.0L-3D is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md). It is a no-code readiness gate before any provider-call workflow implementation.

Current operator decision: provider-call implementation is still NO-GO. Do not add `DEEPSEEK_API_KEY` to GitHub Secrets until the L-3D checklist blockers are resolved and a separate implementation PR is approved. Do not run provider calls from GitHub Actions yet. Continue using only the v28.0L-3B dry-run workflow for GitHub Actions validation.

Before any future provider-call implementation, operators must finalize secret storage, rotation/revocation, trigger permissions, missing-secret failure behavior, artifact sanitization, cost budget, concurrency policy, and fail-closed exit policy. The first approved provider-call path must remain manual `workflow_dispatch`, artifact-only, non-production, and separate from Daily, frontend display, production data writes, and scoring / decision / execution / position logic.

### External AI provider-call implementation plan

v28.0L-3E is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md). It is a no-code implementation plan.

Do not add `DEEPSEEK_API_KEY` to GitHub Secrets yet. If L-3F is pursued, it should first add a missing-secret-safe workflow skeleton and static checks only: default dry-run must pass, provider-path requested without a secret must fail before provider command, and no real DeepSeek call should run.

Do not run a real provider call until L-3F is merged, audited, and followed by a separate approval that records secret location, rotation/revocation, cost acknowledgement, non-production acknowledgement, artifact sanitization, and operator approval. L-3F output must not be treated as production data.

### External AI Manual Provider Test workflow

v28.0L-3F adds `External AI Manual Provider Test` in GitHub Actions. It is a provider-call-capable skeleton, but L-3F intentionally blocks real provider calls.

Default safe run:

1. Open GitHub Actions.
2. Select `External AI Manual Provider Test`.
3. Choose `Run workflow`.
4. Use `dry_run=true`, `allow_network=false`, `acknowledge_cost=false`, `acknowledge_non_production=false`, `input_source=fixture_sample`, `max_attempts=1`.
5. Expected result: PASS, no secret read, no provider call, no DeepSeek output.

Missing-secret safety run:

1. Use `dry_run=false`, `allow_network=true`, `acknowledge_cost=true`, `acknowledge_non_production=true`, `validate_output=true`, `max_attempts=1`.
2. Do not configure `DEEPSEEK_API_KEY`.
3. Expected result: FAIL before provider command, no DeepSeek call, no provider output artifact, no production data write, no frontend display.

L-3F also blocks real provider calls if a secret is accidentally present. Do not add `DEEPSEEK_API_KEY` yet. Do not rerun repeatedly. Do not treat this workflow as real provider-call readiness; first record default dry-run PASS and missing-secret-safe FAIL in a later audit-sync PR.

### External AI Manual Provider Test audit result

v28.0L-3F-1 records the required L-3F provider workflow skeleton audit:

- Run `25591115649` = default dry-run PASS.
- Run `25591202053` = provider path without secret failed safely before provider command.

Operator interpretation:

- `DEEPSEEK_API_KEY` was empty in the second run.
- The second run failed in the missing-secret safe provider gate with `reason=missing_required_provider_secret` and `status=failed_before_provider_call`.
- No DeepSeek call occurred.
- No provider output artifact was produced.
- No production data, frontend, Worker, config, Daily, scoring, decision, execution, or position behavior changed.
- Do not add `DEEPSEEK_API_KEY` yet.
- Do not rerun the provider path repeatedly.
- The next step should be a separate decision PR before adding any secret or allowing any real provider call.

### External AI secret strategy and first provider-call gate

v28.0L-3G is documented in [`EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md`](EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md). It decides the future secret strategy but does not add any secret.

Operator guidance:

- Do not add `DEEPSEEK_API_KEY` yet.
- When explicitly approved later, create GitHub Environment `external-ai-manual`.
- Add Environment secret `DEEPSEEK_API_KEY` only after the approved unlock workflow is ready.
- Prefer required reviewer approval on the environment if available.
- Never paste the key into chat, logs, PR comments, artifacts, commits, `.env`, or terminal output.
- Never pass the key as a command-line argument.
- First provider call must use `input_source=fixture_sample`, not live data.
- First provider call must remain artifact-only and must not write production data or change frontend.

## 2. 页面显示“实时数据已过期”

排查顺序：

1. 先看页面“数据健康状态”模块，确认 freshness、数据时效、实时数据来源和状态标记。
2. 打开浏览器 Console。
3. 执行：

```js
window.__GFRR_RUNTIME__?.realtimeFetchAudit
```

按结果判断：

- `selectedSource = remote` 且 `remoteUpdatedAt` 很旧：前端已读到远端 realtime，但远端 payload 旧，优先检查 `Build Realtime Market` workflow 是否按 schedule 跑。
- `selectedSource = local-fallback`：远端 raw 读取失败，页面使用了本地 fallback。
- `selectedSource = none`：远端和本地 fallback 都不可用，页面只能走 baseline / degraded。
- `cacheBusted = true`：前端已经尝试绕过缓存，问题通常不在浏览器缓存。

### 2A. Android Chrome 旧前端缓存排查

`odp-gdelt-web-ngrams-auto-1` 是当前前端 cache token；同一 Frontend Asset Cache Busting 机制用于处理 Android Chrome cached old module graph：普通窗口可能缓存旧 `scripts/app.js` / ES module graph，导致页面仍显示旧逻辑，例如 Brent 来源停留在 FRED 日度锚点；无痕窗口显示 Worker 独立生成 / 实时数据新鲜 / Yahoo + Trading Economics 双源确认，则说明线上 Worker-first runtime 正常，问题不在 Worker、DNS 或自定义域名。

当前处理方式：

```text
index.html app.js entry → ?v=bofa-report-review-1
scripts/app.js and active scripts/modules/*.js local imports → ?v=bofa-report-review-1
scripts/modules/realtime.js → 未接入的冻结 runtime path;import query 不随当前 asset bump 更新
app.js APP_VERSION → 见 scripts/app.js（init console 打印 [app] … APP_VERSION=…）
```

核对前端版本：看 `scripts/app.js` init 时的 console 行 `[app] … APP_VERSION=<版本>`（当前 `bofa-report-review-1`），或检查已加载 `app.js?v=…` URL 的 token，两者须一致。本次 asset bump 对应 ODP 新闻事件观察中的 GDELT Web NGrams v2 自动 display-only 下载源状态、聚合计数与源文件时效展示；既有历史 sample-gate、FIRMS 脱敏请求健康与设施窗口质量行仍保留。该版本不新增 KV、不 deploy Worker、不改变评分/决策边界。frontend asset cache version must be bumped when index.html or frontend JS changes：以后修改 `index.html`、`scripts/app.js` 或当前入口实际加载的 `scripts/modules/*.js` 时，必须同步 bump version 并替换相关本地 module import query；M-94 后冻结且当前未接入的 `scripts/modules/realtime.js` 不属于当前入口,其 import query 应保持冻结旧图,不得因此视为前端 realtime overlay 已重接入。只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json` 或只 deploy Worker 不需要 bump；Worker runtime 改动不需要 bump frontend asset version，除非同时改前端 HTML / JS。

v28.0G-9B Frontend Asset Version Bump Helper 提供本地维护命令：

```bash
node scripts/bump-frontend-asset-version.mjs bofa-report-review-1
npm run bump:frontend-asset-version -- bofa-report-review-1
```

该工具用于以后前端 HTML / JS 改动时统一 bump cache version。当前正式版本仍是 `bofa-report-review-1`，不要在没有前端发布需要时最终留下测试版本。工具不访问网络、不写 KV、不写 `data/*.json` / `realtime/*.json`、不 deploy Worker。

## 3. Realtime workflow 排查

检查 GitHub Actions 中的：

```text
Build Realtime Market
```

重点看：

- 最近一次是否为 `Scheduled` 或手动触发成功。
- 运行时间是否接近 `7,17,27,37,47,57 * * * *`。
- Summary 中的 `updatedAt`。
- Summary 中的 `sourceMode`。
- Summary 中的 `healthScore`。
- Summary 中的 `Brent`。
- Summary 中的 `Brent consensus`。
- Summary 中的 `confidence`。
- Summary 中的 `canPromoteToPrimary`。

如果 workflow 没跑或失败，优先修复 Realtime workflow；不要直接改 JSON 产物来掩盖问题。

## 4. Realtime Health Watchdog 排查

Realtime Health Watchdog 是只读诊断工具，只检查 `realtime-data/realtime/market.json` 的 freshness，不生成数据、不修复数据、不参与评分。v28.0G-2 起，它是 GitHub `realtime-data` fallback / Daily baseline 的 freshness observer，不再作为 Worker-first runtime hard fail gate；主运行链路 hard fail 由 `Check Worker Health` 承担。

v28.0G-3 起，GitHub Actions Summary 顶部会明确显示 `Realtime-data Health`、`Role: soft observer for fallback / Daily baseline`、当前 `Result` 和建议 `Action`。`stale` / `unavailable` 不代表 Worker-first runtime failure；若持续出现，再检查 `Build Realtime Market` 或 `realtime-data` 分支。

本地手动检查：

```bash
node scripts/check-realtime-health.mjs --soft
```

GitHub Actions watchdog 使用：

```bash
node scripts/check-realtime-health.mjs --github-output
```

如果结果是 `stale` 或 `unavailable`，workflow 会输出 warning / `shouldRecover` / `suggestedAction`，但不会 hard fail。优先检查：

- `Build Realtime Market` workflow 最近运行结果。
- `realtime-data` 分支的 `realtime/market.json` `updatedAt`。
- GitHub Actions schedule 是否延迟或未触发。
- workflow 权限是否异常。

如果 `realtime-data` stale 但 `Check Worker Health` overall ok，页面主链路仍健康；若 `Check Worker Health` unhealthy，则优先排查 Worker runtime。

### Realtime stale recovery

`Build Realtime Market` remains the primary realtime generation workflow. `Recover Stale Realtime Market` is a recovery workflow that first runs `check-realtime-health`; when realtime is fresh or aging, it skips generation, and when realtime is stale or unavailable, it runs `build:realtime` and pushes only `realtime/market.json` to the `realtime-data` branch. It does not change Brent primary value logic, scoring, decision output, or write to `main`.

## 4A. Worker-first Health Check 排查

`Check Worker Health` 是 v28.0F-2 新增的只读 Worker-first health workflow。它定时运行：

```bash
node scripts/check-worker-health.mjs --github-summary --fail-on-unhealthy
```

该检查只读取 Cloudflare Worker endpoint，不写 KV，不写 `data/*.json` / `realtime/*.json`，也不改变前端、Daily 或 Worker runtime。

v28.0G-3 起，GitHub Actions Summary 顶部会明确显示 `Worker-first Health Check`、`Role: hard gate for Cloudflare Worker runtime`、`Overall` 和建议 `Action`。只有该检查 unhealthy 才代表主运行链路 hard gate 失败，需要优先排查 Worker runtime。

重点看 GitHub Actions Summary：

- 主 `/market.worker-preview.json`：HTTP status、`updatedAt` / age、`sourceMode`、`healthScore`、`criticalMissing`、`unavailable`、核心 `values.*`、Brent promotion `moveStatus`、sourceProbe 频率 / 数量。
- 主 preview 隔离：不得出现 `secondarySources` / `secondaryDiagnostics` / `secondarySourceSummary`，也不得出现在 `workerGeneratedPreview.diagnostics` 内。
- 独立 `/market.secondary-preview.json`：VIX via Cboe、Gold via Yahoo `GC=F`、DXY via Yahoo `DX-Y.NYB`、US10Y via Yahoo `^TNX` 与 SPX via Yahoo `^GSPC` 是否存在，`participatesInPrimary` / `participatesInValidation` 是否均为 `false`；US10Y 还应显示 `rawValue`、`normalization` 与 `normalizationReason`。`rawValue > 20` 应 `divide-by-10`，`rawValue <= 20` 应 `no-op`。
- core secondary set 为 `vix` / `gold` / `dxy` / `us10y` / `spx`。这些 source 只属于 `/market.secondary-preview.json`，使用独立 KV key `market:secondary-preview`，30 分钟低频刷新，不影响主 `values.*`、scoring、decision、Brent promotion 或 sourceProbe。
- v28.0G-1 起，Summary 还会展示每个 core secondary source 的 `freshnessStatus`、`observedAgeHours` 与 `freshnessReason`。这些是 `check-worker-health` 基于 `observedAt` 的只读派生字段，不是 Worker payload 字段。

判断口径：

- 主 Worker preview 不健康会 fail。
- secondary endpoint HTTP / JSON 不可读会 fail。
- VIX / Gold / DXY / US10Y / SPX 单个 failed / unavailable 只作为 warning；五者都缺失、或任何 secondary source 参与 primary / validation，视为 fail。
- `stale-warning` / `stale-critical` / missing / unparsable freshness 初版只作为 warning，不阻断 workflow；market closed、交易时段和节假日造成的上一交易日 `observedAt` 不应直接视为错误。
- 该 workflow 只用于监控 Worker-first 运行健康，不触发 deploy，不修改数据源。

E-4 后先观察 Worker health workflow 与 secondary freshness，不继续堆新 secondary source。HY OAS、real10y、credit spread proxy、liquidity proxy 和其它 macro stress indicators 如需加入，必须另开版本、一轮一个、先进入 isolated secondary diagnostic，并继承 short timeout / try-catch / isolated payload / health warning-only 原则。

## 5. Daily workflow 排查

检查 GitHub Actions 中的：

```text
Build Daily Radar Data
```

重点看 Daily Summary：

- `dailyRealtimeInput.commitSha`
- `dailyRealtimeInput.updatedAt`
- `dailyRealtimeInput.sourceMode`
- `dailyRealtimeInput.healthScore`
- baseline Brent / broad dollar / VIX / HY OAS / SPX
- Decision Summary
- Transmission Delta Summary

`dailyRealtimeInput.commitSha` 用于判断 Daily 当时消费的是哪一次 `realtime-data` payload。如果页面、`main` 数据和 `realtime-data` 暂时不同步，先用这个字段确认 Daily 的输入版本。

Daily 成功提交 `data/*.json` 后，Pages 部署通过 `Deploy Static Site to Pages` 的 `workflow_run` 触发器接续运行。若 Daily Summary 显示数据已更新但页面仍停留在旧 baseline，除检查 Daily 提交外，还应检查紧随其后的 Pages deploy 是否成功。

### Daily Realtime Input Audit

`Build Daily Radar Data` 在运行 `run-daily-pipeline.mjs` 读取 `origin/realtime-data:realtime/market.json` 后，会在日志与 GitHub Step Summary 中输出 **Daily Realtime Input Audit**（控制台前缀 `[Daily Realtime Audit]`，Summary 小节标题 `Daily Realtime Input Audit`）。用于确认本次 Daily 实际读到的 `updatedAt`、`ageMinutes`、按与站点一致的窗口划分的 `freshness`（fresh / aging / stale / unavailable）、`sourceMode`、`healthScore`、以及 `values.brent` 与 `brentValidation.consensus` 的推荐值 / `canPromoteToPrimary` / `confidence`。

当审计显示 **stale** 或 **unavailable**（`result: WARNING`）时，只表示输入快照偏旧或无法判定时效，**不会**中断 Daily 构建。排查宜优先：

- `Build Realtime Market` 最近是否成功、是否按时写入 `realtime-data`。
- `realtime/market.json` 的 `updatedAt` 是否持续更新。
- `Check Realtime Health` 是否连续失败。
- 上游行情源是否异常。

该审计仅用于诊断与可观测性，**不改变** scoring、decision、Brent 主值生成或任何 fallback 行为；主 Brent 仍以管线内的 `values.brent` 为准，推荐值不等于主值。

Daily 与前端共用 **`canUseRealtimePayloadValues`**（见 `docs/DATA_CONTRACT.md`）。若审计或 payload 显示 **cache-only**、**unavailable**、**healthScore 归零**、**criticalMissing 过高**，或 **degradedMode** 且非 **live-with-fallback**，则 Daily 应走现有 **buildFallback**，不得用该 realtime 重算 baseline；前端亦不应进入实时 overlay，而应呈现基线 / fallback 状态。此时优先核对 `sourceMode`、`cacheOnly`、`healthScore`、`criticalMissing`，并查看 **Check Realtime Health** 与 **Build Realtime Market** 是否异常。

### Daily vs Worker Input Audit

v28.0F-1 起，`Build Daily Radar Data` 在读取 `origin/realtime-data:realtime/market.json` 后，会运行：

```bash
node scripts/audit-daily-vs-worker.mjs --github-summary
```

该审计只比较 **Daily 实际消费的 realtime-data payload** 与当前 Cloudflare Worker `/market.worker-preview.json`，并把 drift summary 写入 GitHub Actions Summary。它不写 `data/*.json` 或 `realtime/*.json`，不改变 Daily 输入，不改变前端 runtime 优先级，也不阻塞 Daily 成功（除非本地 `realtime/market.json` 缺失或 JSON 非法）。

看到 drift 不一定是错误：Worker 可能比 Daily 消费的 `realtime-data` 更新。若未来考虑让 Daily 改用 Worker 作为输入，必须另开 F-2 / F-3 版本评审；F-1 只是 audit-only。

## 6. Brent 主值与验证层排查

页面主 Brent 来自：

```text
values.brent / effectiveDisplayInputs
```

`brentValidation.consensus.recommendedValue` 是验证层推荐值，不等于主值。`canPromoteToPrimary=false` 时不得提升为主值。

如果 Stooq / Yahoo / Oilprice 等来源不一致，优先检查：

- `confidence`
- `canPromoteToPrimary`
- `observedAt`
- `staleForConsensus`
- `weak-confirmation`
- `excludedFromConsensus`

常见判断：

- `confidence=none`：验证层没有可用推荐值。
- `weak-confirmation`：只能辅助确认，不能 promote。
- `observedAt-stale(...)`：该来源过旧，不应参与主值提升。

## 7. Transmission Delta 排查

如果页面节点显示：

```text
趋势待累计
```

这表示暂无可比较上一期节点数据，不一定是错误。

如果 Daily Summary 显示：

```text
matched nodes: 6
zero deltas: 6
pending deltas: 0
```

说明 delta 已经正常生成，只是本期节点分数没有变化。

如果 `pending deltas` 很多，依次检查：

- `transmissionDeltaMeta.source`
- `matchedNodes / totalNodes`
- `transmissionChain.nodes[*].delta`
- `data/radar-history-full.json` 最近记录是否有 `transmissionSnapshot`
- `data/radar-history.json` 最近记录是否有 `transmissionSnapshot`

不要为了让页面显示 `Δ` 而手写 JSON；应让 Daily pipeline 自然生成节点级 delta。

## 8. Pages 部署失败排查

`Deploy Static Site to Pages` 在上传 artifact 和部署前会自动运行默认只读验证链：

```bash
npm run check:all
npm run build:pages-artifact
```

失败时按类型排查：

- `check:syntax` 失败：查看具体 JS / MJS 文件语法错误。
- `check:dom` 失败：检查 `index.html` 是否误删关键 DOM id。
- `check:modules` 失败：检查模块 import / export，尤其是 `render.js` re-export 和 `scripts/modules/*`。
- `check:frontend-zh-copy` 失败：检查用户可见文案是否回退，例如“广义美元指数”被写成“广义美元 / 美元指数”，“亿美元”被写成“十亿美元”，或传导网络 delta 被写回“Δ --”。
- `Check workflow contract / check:workflows` 失败：检查 GitHub Actions workflow 是否误删关键保护项，例如 Realtime 每小时 6 次错峰调度、Daily 消费 origin/realtime-data、Daily / Decision / Transmission Summary、Pages 部署前检查链路、upload-pages-artifact / deploy-pages 步骤。
- `Check documentation links / check:docs` 失败：检查 README.md、AGENTS.md 和 docs/*.md 中的本地 Markdown 链接是否指向不存在的文件；http / https / mailto / 纯锚点链接会跳过。
- `Validate data contract / check:data` 失败：检查 `data/radar-data.json`、`realtime/market.json`、Brent validation、decision contract、transmission delta contract 等数据契约，并查看 `validate-data.mjs` 的输出信息。
- `actions/deploy-pages` 返回 `Deployment failed, try again later`：若前置 `check:all` 和 `upload-pages-artifact` 已成功，通常是 GitHub Pages deployment 环境的短时拒绝，不代表站点构建错误。Pages workflow 会按 90 / 180 / 300 秒退避最多重试 3 次；若仍失败，再检查相邻 Pages runs 是否也失败，必要时手动 rerun failed jobs。

`check:syntax` 会自动扫描 `scripts/` 下的 `.js` / `.mjs`；`check:modules` 会自动扫描 `scripts/modules/*.js`。

GitHub Actions workflow baseline 使用 Node 24 LTS compatible official actions：`actions/checkout@v6`、`actions/setup-node@v6` 和 `actions/upload-artifact@v7`；`setup-node` 使用 `node-version: 24`。每个 workflow 必须设置 top-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`。不要使用 `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`、`FORCE_JAVASCRIPT_ACTIONS_TO_NODE20`、Node 20 或 Node 25 作为默认项目 runtime。

`build:pages-artifact` 只允许两张 HTML、`assets` 静态类型、`data/realtime` JSON、`scripts/app.js` 与 `scripts/modules/*.js`，并拒绝任意层级的隐藏配置、非白名单扩展或 symlink。`validate-data.mjs` 的 warning 不等于失败；只有 exit code 非 0 才会阻止部署。Pages deploy 当前运行默认只读 `check:all`；如果 workflow 入口未来调整,以 `.github/workflows/deploy-static-site-to-pages.yml` 为准。

## 8A. EdgeOne 自定义域名低频发布通道

`ctmaomao.github.io/gfrr-auto-update-site/` 仍是 GitHub Pages 主发布站。腾讯云 EdgeOne 自定义域名只允许连接专用静态仓库 `ctmaomao/gfrr-edgeone-release`，不得重新直接连接本源码仓库的 `main`；源码仓库的高频数据提交会让 EdgeOne 对每个 commit 自动构建，并撞上免费版每月 500 分钟 Build times 限额。

`.github/workflows/publish-edgeone-release.yml` 是唯一受审发布入口：

- 每 3 小时的第 55 分钟运行，理论上最多 8 次/天、31 天最多 248 次；前端 HTML / CSS / JS 改动可额外即时发布。
- 每次先运行 `npm run check:all` 和 `npm run build:pages-artifact`，只同步 `_site` 白名单产物；产物无变化时不提交，因此不会触发 EdgeOne 构建。
- 排队后 checkout 显式读取运行时最新 `main`，在安装/校验/构建前固定实际 source SHA；发布提交和 Summary 使用这个 SHA，而不是可能已旧的触发事件 SHA。校验后不再更新源 checkout，避免产物与已验证代码脱节；三小时正常批次延迟仍是有意保留的配额边界。
- 专用仓库最近 32 天已有 400 次发布时 fail closed，保留至少 100 次额度缓冲；不要为了越过保护而改阈值或反复手动部署。
- 源码仓库只保存 Actions secret `EDGEONE_RELEASE_DEPLOY_KEY`；对应公钥仅作为专用仓库的单仓库 write deploy key。workflow 的源码仓库权限必须保持 `contents: read`，不得改用 broad PAT、EdgeOne API token 或源码仓库 write token。
- 首次迁移必须先让新 EdgeOne 项目的临时域名完整通过，再从旧项目解绑并把 `radar.gfrfinradar.uk` 绑定到新项目；不要先删除旧项目或旧域名。

日常排查顺序：

1. 查看 `Publish EdgeOne Release Channel` 最近一次 run 是否成功；若显示 `No published-file changes`，这是正常 no-op。
2. 查看 `ctmaomao/gfrr-edgeone-release` 最新 commit message 中的 source SHA，确认对应源码 `main`。
3. 查看 EdgeOne 项目的最近一次 Production deployment 是否使用同一 release commit。
4. 对 GitHub Pages、EdgeOne 临时域名和 `radar.gfrfinradar.uk` 使用 cache-busting query，比较 `scripts/app.js` 的 `APP_VERSION` 以及关键 JSON 的内容哈希。
5. 只有确有紧急前端修复且等待 3 小时不可接受时，才手动触发一次 workflow；不要在 EdgeOne 控制台连续点击 Redeploy。

若需要立即停用发布，先在源码仓库禁用该 workflow；若怀疑密钥泄露，同时删除专用仓库 deploy key `gfrr-edgeone-release-publisher` 和源码仓库 secret `EDGEONE_RELEASE_DEPLOY_KEY`，然后创建并替换一对新 key。密钥轮换不要求修改站点内容。

## v28.0L-3I-0 Workflow / runtime hygiene

Node 20 GitHub Actions warnings are blocking workflow hygiene issues. The project baseline is Node.js 24 LTS across local development, package engines, and GitHub Actions.

Required runtime baseline:

- `package.json` engines: `>=24 <25` or `24.x`.
- `.nvmrc`: `24`.
- `.node-version`: `24`.
- `actions/checkout@v6`.
- `actions/setup-node@v6` with `node-version: 24`.
- `actions/upload-artifact@v7`.
- top-level workflow env `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`.

Forbidden:

- Node 20 setup or `node20` actions.
- Node 25 as the default project runtime.
- `actions/checkout@v4` / `actions/checkout@v5`.
- `actions/setup-node@v4` / `actions/setup-node@v5`.
- `actions/upload-artifact@v4`.
- `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE20`.

Future workflow PRs must pass:

```bash
npm run check:node-runtime
npm run check:workflows
```

Runtime hygiene work does not approve provider calls, production data writes, frontend display, Daily integration, or `local_compact` implementation.

## 9. Cloudflare Worker realtime backend 规划

- 当前 **v28.0E** 已采用 Worker-first realtime 链路：前端优先读取 `/market.worker-preview.json`，通过 strict gate 后作为 realtime overlay。
- GitHub `realtime-data` 与 local fallback 仍保留为安全回退路径。
- Worker Cron 仍按 free-tier safe 策略运行，预览 KV 写入保持低频 / 单次写入边界。
- 仓库内 `workers/gfrr-realtime-worker/` 是当前 Worker backend 源码；部署与回滚以 Wrangler 与 Cloudflare 控制台为准，不改变现有 Pages 与 workflow 契约。
- **v28.0B-1 preview 管道（free-tier safe）**：Worker Cron 保持每 **3** 分钟运行，但每轮最多 **1** 次 KV write；成功时写 KV 键 **`market:latest-preview`**，失败时写 **`market:worker-heartbeat`** / status，不再每轮同时写 heartbeat 和 preview。`GET /market.preview.json` 用于自测 Worker API 与 KV 读写；观察成功刷新应优先看 `workerPreview.fetchedAt`，不要期待 heartbeat 每轮更新。heartbeat 只代表失败 / 状态记录，不再代表每轮成功心跳。可用 `node tools/observe-worker-preview.mjs --samples=24 --interval-minutes=15` 做本地观察；该脚本只读 `/market.preview.json`，不使用 Wrangler，不读取 heartbeat，不写 Cloudflare KV，因此不会消耗 KV write quota。**`market:latest` 仍未由该管道写入**；前端 **仍不** 读取 Worker；当前生产 realtime 链路 **仍是** GitHub Actions + `realtime-data`。
- **v28.0B-2A Worker-generated preview MVP**：Worker 可独立抓取 FRED / Gold API / Brent validation 轻量来源并写 KV 键 **`market:worker-generated-preview`**；`GET /market.worker-preview.json` 仅用于观察该 MVP。它不参与前端生产读取链路，不改变 Brent 主值链路（`values.brent` 仍以 FRED anchor 为准，consensus 仅作验证层），不改变 GitHub Actions。free-tier safe 策略保持：**3** 分钟 Cron、GitHub mirror preview 与 Worker generated preview 交替写入、每轮最多 **1** 次 KV write，因此单个 preview key 通常约 **6** 分钟刷新一次。
- **v28.0B-2A.1 Worker source diagnostics / fetch hardening**：Worker generated preview 会记录 `workerGeneratedPreview.diagnostics`，包括 FRED 是否全部失败、失败 status、各候选源 HTTP 摘要、retry / duration / content type / body length。若看到 `sourceMode: "worker-generated-unavailable"`，应先查看 diagnostics 判断是否为 Cloudflare Worker 出口到 FRED / Yahoo / Stooq / Google Finance / Trading Economics 的可达性或限流问题，**不应** 因该 preview 不可用而接入前端。Google Finance / Trading Economics 仅为 diagnostic-only experimental Brent 候选源，不参与 consensus，不覆盖 `values.brent`。GitHub Actions + `realtime-data` 仍是当前生产数据源，Worker generated preview 仍是实验观察层。
- **v28.0B-2B Worker vs mirror preview 对比**：可用 `node tools/compare-worker-vs-mirror.mjs --samples=24 --interval-minutes=15` 连续比较 `/market.worker-preview.json` 与 `/market.preview.json`。该脚本只读 HTTP endpoint，不使用 Wrangler，不读取 / 写入 KV，不消耗 KV write quota；只有当 Worker-generated preview 与 GitHub mirror preview 连续观察稳定后，才考虑后续 **v28.0C** 前端接入。
- **v28.0C-1 Worker candidate readiness**：前端开始只读 `/market.worker-preview.json` 并显示 `Worker候选源` 状态；该 candidate 不参与 GitHub realtime-data overlay、`effectiveDisplayInputs`、scoring、decision 或 fallback。当前生产 realtime overlay 来源仍是 GitHub `realtime-data`，页面显示 Worker 候选源可用只代表 readiness 观察，不代表已切换生产数据源。
- **v28.0C-2 Worker-first realtime source priority**：前端 runtime realtime 优先级升级为 **Worker generated preview → GitHub realtime-data → local fallback**。Worker 只有通过 strict safety gate 才能作为主 realtime source：HTTP 200、`workerGeneratedPreview.enabled === true`、`unavailable !== true`、`sourceMode === "worker-generated-preview"`、`healthScore >= 85`、`criticalMissing <= 1`、`updatedAt` 不超过 **10** 分钟，且 `values.brent / dxy / vix / hyOas / us10y / real10y` 均为 finite number。Worker 不通过时自动回退 GitHub；GitHub 不通过时自动回退 local fallback。本阶段不改变 Worker、GitHub Actions 或 data generation。
- **v28.0C-3 Worker-first rollback switch**：前端 realtime source preference 集中在 `scripts/modules/config.js` 的 `realtimeSourcePolicy`。默认：

```text
workerFirstEnabled: true
Worker generated preview → GitHub realtime-data → local fallback
```

紧急回退只改前端配置，不改 Worker、不改 GitHub Actions、不改数据生成逻辑。回退开关位置：

```text
scripts/modules/config.js
realtimeSourcePolicy.workerFirstEnabled
```

当 `workerFirstEnabled: false` 时，前端跳过 Worker 主源选择，优先级变为：

```text
GitHub realtime-data → local fallback
```

健康面板应显示 `GitHub优先（Worker已由配置关闭）`，这表示运营配置回退，不表示 Worker endpoint 出错。

紧急回退步骤：

1. 修改 `scripts/modules/config.js`：

```javascript
workerFirstEnabled: false
```

2. 运行检查：

```bash
node --check scripts/modules/config.js
node --check scripts/modules/realtime.js
node --check scripts/modules/health.js
npm run check:all
```

3. 提交并部署：

```bash
git add scripts/modules/config.js scripts/modules/realtime.js scripts/modules/health.js docs/OPERATIONS.md docs/DATA_CONTRACT.md
git commit -m "Temporarily disable Worker-first realtime source"
git pull --rebase origin main
npm run check:all
git push origin main
```

4. 验证页面健康面板显示：

```text
GitHub优先（Worker已由配置关闭）
```

重新启用 Worker-first：

1. 修改 `scripts/modules/config.js`：

```javascript
workerFirstEnabled: true
```

2. 运行同样检查：

```bash
node --check scripts/modules/config.js
node --check scripts/modules/realtime.js
node --check scripts/modules/health.js
npm run check:all
```

3. 提交：

```bash
git add scripts/modules/config.js scripts/modules/realtime.js scripts/modules/health.js docs/OPERATIONS.md docs/DATA_CONTRACT.md
git commit -m "Re-enable Worker-first realtime source"
git pull --rebase origin main
npm run check:all
git push origin main
```

回退触发条件：

- Worker age > **10** 分钟持续两次以上。
- Worker endpoint 非 200。
- `healthScore < 85`。
- `criticalMissing > 1`。
- `brent / dxy / vix / hyOas / us10y / real10y` 任一核心字段无效。
- 页面健康面板或主源显示出现明显异常。
- `node tools/compare-worker-vs-mirror.mjs --samples=24 --interval-minutes=15` 显示 Worker 与 GitHub 多字段持续 critical fail。

不应回退的情况：

- GitHub mirror stale 但 Worker fresh 且通过 strict gate。
- Worker 偶发 1 次 warn 后恢复。
- VIX 短时差异但没有 critical fail。
- GitHub Actions schedule 空窗，但 Worker 当前 fresh 且健康。

**v28.0D-1 / v28.0D-2-lite secondary diagnostics isolation**：D-1 曾尝试在 Worker generated preview 内加入 DXY、VIX、HY OAS、Gold、US10Y 第二源诊断；部署后 Worker scheduled preview 曾停止刷新，`/market.worker-preview.json` stale，前端安全闸门已正确回退到 GitHub。线上 Cloudflare Worker 已手动 rollback 到稳定版本 `679fb678-fe1d-4ff3-b9b9-53829d4d31f7`。v28.0D-2-lite 起，第二源诊断必须独立于主 Worker preview：`/market.worker-preview.json` 不得包含 `secondarySources` / `secondaryDiagnostics`，不得执行第二源外部请求；独立 endpoint 为 `/market.secondary-preview.json`，只读 KV key `market:secondary-preview`。该 key 默认不由 scheduled 写入；不存在时 endpoint 返回小型 unavailable payload，不影响主链路。

**v28.0D-3 secondary preview VIX-only producer**：独立 secondary preview 当前只接入 **VIX via Cboe**，不接入 DXY / HY OAS / Gold / US10Y / Brent。2026-08-03 free-tier CPU hardening 后，scheduled 只在轻量 GitHub mirror preview KV put 成功后低频尝试更新 `market:secondary-preview`，不再把 secondary CPU 叠加到 `market:worker-generated-preview` 时隙；若该 key 的 `updatedAt` / `generatedAt` 距今小于 **30** 分钟则跳过。Cboe parser 从 CSV 尾部寻找最新有效行，不再 materialize 完整历史。失败只写入 secondary unavailable payload 或被捕获，不影响主 `market:worker-generated-preview`、GitHub fallback 或 local fallback。前端当前不消费 `/market.secondary-preview.json`。

**v28.0E-0 Worker fetch timeout guard**：Worker 主 preview 的外部 fetch 统一带短超时保护，目标是限制 FRED / Yahoo / Stooq / Google Finance / Trading Economics / gold-api 等免费源慢响应对 Worker runtime 的影响，而不是新增数据源或改变主值选择。timeout 会作为 `sourceDetails` / `diagnostics` / `sourceProbe` 中的错误摘要返回，不应直接 throw 中断主 preview；critical source timeout 仍按原有 `criticalMissing` / `healthScore` 规则处理，不放松健康门槛。Brent promotion、D-6 moveStatus、D-8B sourceProbe 决策边界均保持不变。后续新增 DXY / US10Y / SPX 等 secondary source 前，必须继承该短超时和失败隔离原则。

**2026-08-03 Free Cron CPU recovery**：Cloudflare dashboard 的过去 24 小时指标显示 131 次错误全部为 `Exceeded CPU Time Limits`，版本 `3ed04da6` 的 CPU P50 为 9.94 ms、P90 为 29.11 ms；这与 Free Cron 10 ms 上限一致。生产 `free-tier-10ms` 路径因此执行三项 fail-safe 降耗：FRED API 固定 `sort_order=desc&limit=2`；不参与 consensus/promotion 的 Google Finance HTML candidate 与 sourceProbe 网络刷新标记 deferred 并复用旧摘要；secondary 刷新移到轻量 mirror 时隙且 Cboe VIX 只扫描 CSV 尾部。不得通过放松 `healthScore`、Brent freshness hard gate 或 secondary 隔离边界来消除错误。部署后验收必须同时看 Worker snapshot freshness、Cloudflare `Exceeded CPU Time Limits` 增量和 `Check Worker Health` rerun。

**v28.0E-1 Gold secondary diagnostic**：独立 `/market.secondary-preview.json` 在既有 **VIX via Cboe** 之外新增 **Gold via Yahoo `GC=F`** 后台诊断。Gold secondary 只写入独立 KV key `market:secondary-preview`，不写入 `market:worker-generated-preview`，不覆盖主 preview 的 `values.gold`，不参与 scoring / decision，也不影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。Gold 请求使用短超时并被捕获；Gold 失败只记录在 `diagnostics.sources.gold`，不得阻止 VIX secondary 写入，也不得阻止主 Worker preview 写入。只有 VIX 与 Gold 都失败时，secondary preview 才可标记 unavailable。当前 secondary diagnostics 只包含 VIX via Cboe 与 Gold via Yahoo `GC=F`；后续如果 Gold secondary 连续稳定，才可另开版本讨论是否作为主 `gold-api.com` 源的验证层。

**v28.0D-4 Brent source audit**：Worker generated preview 会在 `brentValidation.audit` 中记录 Brent 主值选择与验证层摘要，包括 selected source/value、candidate source status/value/observedAt/error，以及 consensus promotion decision。该 audit 只用于诊断 `values.brent` 为什么仍来自当前主源；它不改变 `values.brent`、不将 `recommendedValue` promote 为主值、不影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`、不影响 Worker-first strict gate，也不影响 scoring / decision。

**v28.0D-5 Brent freshness-gated promotion**：FRED `DCOILBRENTEU` 仍是 Brent anchor，但当 FRED anchor 超过 **72** 小时、Yahoo `BZ=F` 在 **48** 小时内且 Trading Economics Brent diagnostic 与 Yahoo 的相对差距不超过 **2%** 时，Worker generated preview 可以把 `values.brent` promote 为 Yahoo / Trading Economics 平均值。Google Finance 的 `0` 和 Stooq parse fail 必须排除，不参与 promotion。promotion 成功时 `sourceDetails.brent.source` 必须明确标记 promoted over stale FRED anchor；promotion 失败时继续使用 FRED。该机制只修正 Brent 主值选择，不改变 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable` 规则，不影响 VIX secondary preview，也不改前端 scoring / decision。

**v28.0D-6 Brent extreme-move confirmation guard**：D-6 不把 Brent 大幅波动默认视为错误。Worker generated preview 会在生成前读取上一轮 `market:worker-generated-preview` 的小型 Brent 摘要，用于比较上一轮 accepted / promoted Brent。若 promoted Brent 相对上一轮变化不超过 **2%**，视为 `normal`；**2%–3%** 视为 `volatility-watch`，仍允许；超过 **3%** 时进入 extreme-move confirmation。若 Yahoo `BZ=F` 与 Trading Economics 均有效、Yahoo fresh 且两者 divergence <= **1%**，标记 `confirmed-extreme-move` 并允许进入 `values.brent`；否则标记 `unconfirmed-jump-hold`，保留上一轮 accepted Brent（无上一轮时回退 FRED）。confirmed extreme move 是高价值风险信号，不会降低 `healthScore`，也不改变 VIX secondary preview。

**v28.0G-4A Trading Economics observedAt audit（历史步骤）**：Worker generated preview 会尝试从 Trading Economics Brent 页面解析 `observedAt`，并在 `brentValidation.promotion.confirmationSources` 与 `brentValidation.audit.candidateSources` 显示 `observedAt` / `ageHours` / `freshnessStatus` / `freshnessReason`。G-4A 本身曾是 audit-only；当前线上已进入 G-4C hard gate，不能再按 audit-only 判断 Brent promotion。旧 Draft PR #53 superseded，不应 merge / cherry-pick。

**v28.0G-4B decision: Trading Economics freshness hard gate（历史决策）**：G-4B 是 decision review，不是 runtime change；它已决定进入 G-4C。当前线上已执行 G-4C：Trading Economics 必须 `ok === true`、value 为正 finite number、`observedAt` 可解析、`ageHours` finite，且 `ageHours <= BRENT_CONFIRMATION_FRESH_HOURS`（48 小时）。旧 PR #53 superseded，不应 merge；所有后续改动必须基于 latest main 串行 trunk flow。

**v28.0G-4C Trading Economics freshness hard gate（当前线上行为）**：G-4C 已将上述方案落到 Worker runtime。Brent promotion 现在要求 Yahoo fresh + Trading Economics `observedAt` fresh；TE `observedAt` 不可解析时 hold promotion，`reason = tradingeconomics-observedAt-invalid`；TE `observedAt` 超过 48 小时时 hold promotion，`reason = tradingeconomics-confirmation-stale`。Trading Economics candidate 仍保留 value/audit，observedAt failure does not make candidate ok false，hard hold 只在 promotion decision 层处理。D-6 `confirmed-extreme-move` 同样要求 TE freshness fresh。

## v28.0G-6 Operations Runbook / Decision Matrix

本节是 Worker-first 稳定化后的运维判断入口。先看 `Check Worker Health`，再看 `Check Realtime Health` / recovery，最后看 Brent、secondary 和 KV usage。不要把 soft observer warning 当成 Worker runtime failure。

### Check Worker Health

- `overall=ok`：主运行链路健康，不需要操作。
- `overall=warning`：主运行链路可用，检查 reasons，通常先观察。
- `overall=unhealthy`：暂停部署和新增数据源，优先排查 Worker runtime。
- `healthScore <85`、`criticalMissing >1`、`unavailable=true`、`sourceMode` 异常、worker `ageMinutes >10`：视为 hard gate 问题。
- GitHub runner acquisition / internal server error：平台侧失败，不等于 Worker failure；看下一轮是否恢复。

### Check Realtime Health

- `fresh` / `aging`：fallback `realtime-data` 可用。
- `stale` / `unavailable`：soft observer warning，不代表 Worker-first runtime failure。
- `shouldRecover=true`：检查 `Recover Stale Realtime Market` 和 `Build Realtime Market`。
- 如果 Worker Health ok，但 Realtime Health stale：页面主链路仍健康，先观察或查 fallback pipeline。
- 如果长期 stale：检查 build / recover workflow 和 `realtime-data` branch。

### Recover Stale Realtime Market

- workflow success 且下一轮 Realtime Health fresh / aging：恢复成功。
- workflow success 但 Realtime Health 仍 stale：检查是否实际写入 `realtime-data`。
- workflow failure：检查权限、checkout、branch push、build script。
- 不要因 recovery warning 回滚 Worker runtime。

### Brent promotion

- `promotionApplied=true` 且 `moveStatus=normal`：正常。
- `promotionApplied=false` 且 reason 是 freshness / divergence / confirmed hold：可能是正常防守，不等于故障。
- `moveStatus=volatility-watch`：观察，不自动回滚。
- `moveStatus=unconfirmed-jump-hold`：防止未确认大跳变，正常保护逻辑。
- `moveStatus=confirmed-extreme-move`：需要确认 Yahoo + TE 都 fresh 且 divergence <= 1%。
- `values.brent` 退回 FRED anchor 或 previous accepted reference：先看 reason，不直接修代码。

### Trading Economics freshness

- TE `freshnessStatus=fresh`：允许进入 Brent promotion divergence / D-6 gate。
- TE `freshnessStatus=unknown`：G-4C 后 promotion 应 hold，reason 为 `tradingeconomics-observedAt-invalid`。
- TE `freshnessStatus=stale`：G-4C 后 promotion 应 hold，reason 为 `tradingeconomics-confirmation-stale`。
- TE candidate value 可以 ok，但 observedAt invalid / stale 会在 promotion decision 层 hold。
- 不应在 candidate fetch 层把 `ok` 改为 false。

### SourceProbe

- `sourceProbeFrequencyMinutes=60`、`probeCount<=5`：正常。
- Google Finance probe failed：正常 diagnostic-only，不影响 main values。（Stooq worker probe 已于 F6 删除。）
- sourceProbe missing 或 `probeCount >5`：检查 Worker payload contract。
- 不要把 Google Finance 升级为 validation source，除非另开版本并有稳定证据。

### Secondary diagnostics

- core secondary set：`vix` / `gold` / `dxy` / `us10y` / `spx`。
- 单个 secondary failed 或 `stale-warning`：warning，通常不影响主链路。
- secondary endpoint unavailable：检查 secondary producer，但不直接等同主 preview failure。
- 主 preview 出现 `secondarySources` / `secondaryDiagnostics` / `secondarySourceSummary`：secondary pollution，需要修。
- US10Y normalization：`rawValue <=20` 时 `no-op`；`rawValue >20` 时 `divide-by-10`。
- secondary 不参与 `values.*` / scoring / decision。

### Gold / DXY / US10Y / SPX observations

- 主 `values.gold=0` 但 secondary gold 正常：先观察，若连续出现再开 audit。
- US10Y raw / value normalization 不一致：优先查 E-3A 规则。
- SPX / DXY secondary ok 但主 FRED values 不同：正常，因为 source 不同、延迟不同。
- 不要因为 secondary 与 main 不一致直接覆盖主链路。

### Cloudflare KV usage

- 50% warning：记录，不立即修。
- 80%：减少手动 deploy / 检查频率，观察是否接近 UTC reset。
- 90% 或连续多日 >800 writes/day：考虑 cron `*/3` -> `*/5` 或付费计划。
- 429：暂停非必要 Worker 写入和 deploy，等 UTC reset 或升级。
- 当前 KV write guard deferred：暂不做复杂 KV write guard。原因是它会增加 runtime 判断复杂度，未来数据字段多时 no-op skip 价值可能有限，且当前 writes 可解释并未超过 hard limit。

### Rollback

需要考虑 rollback：

- Worker preview HTTP 500 / JSON invalid。
- `sourceMode` 异常。
- `healthScore` 大幅下降。
- `criticalMissing` 增加。
- `unavailable=true`。
- Brent promotion 被错误阻断且 reason 不合理。
- secondary pollution 进入 main payload。

### No rollback

不需要 rollback：

- Realtime Health stale 但 Worker Health ok。
- 单次 GitHub runner failure。
- sourceProbe diagnostic failure。
- 单个 secondary source `stale-warning`。
- KV 50% usage warning。
- promotion hold reason 合理。

### Development sequencing

- runtime 改动必须基于最新 main、单一逻辑 PR / commit、先本地 checks、提交后 deploy preflight、deploy 后 live validation、再观察 1-2 轮 scheduled `Check Worker Health`。
- 文档 / Summary / check 脚本改动通常不需要 deploy。
- 不使用旧 PR / stacked PR；旧 PR #53 已 superseded。

## v28.0G-7A Health Summary Snapshot / Audit Export

v28.0G-7A 只增强 `Check Worker Health` 的只读输出。它保留既有 stdout 和 GitHub Step Summary，并在 workflow 中通过 `--snapshot-file health-worker-snapshot.json` 生成结构化 JSON，再上传 GitHub artifact `worker-health-snapshot`。该 snapshot 不写 Cloudflare KV，不写 `data/*.json` / `realtime/*.json`，不 deploy，也不是网站运行输入。

snapshot 用于回看历史健康状态，包含 Worker Health hard gate 结果、Brent promotion 与 Trading Economics freshness、sourceProbe 摘要、core secondary freshness、secondary pollution 状态和 reasons。`Check Worker Health` 仍是 Worker-first runtime hard gate；snapshot 不改变 fail 边界。`Check Realtime Health` 仍是 fallback / Daily baseline soft observer，不受 G-7A 影响。KV write guard deferred，继续先观察。

## v28.0G-7B Health Snapshot Review Helper

v28.0G-7B 新增本地只读 helper：

```bash
npm run review:worker-health-snapshot -- health-worker-snapshot.json
```

也可直接运行 `node scripts/review-worker-health-snapshot.mjs --file health-worker-snapshot.json`。该脚本读取下载后的 G-7A artifact JSON，输出 PASS / WARN / FAIL、Action、Worker Health、Brent / Trading Economics freshness、sourceProbe、secondary freshness 和 reasons。它不访问网络，不写 Cloudflare KV，不写 `data/*.json` / `realtime/*.json`，不修改 Worker runtime，也不需要 Worker deploy。

该 helper 只是历史 snapshot 快速审阅工具，不替代 `Check Worker Health` hard gate。若 review 输出 FAIL，应回到 runbook 的 `Check Worker Health` / Brent / secondary / rollback 规则定位原因。

**v28.0D-7 Brent source explainability UI**：页面“盘中快变量 / 布伦特”会显示 Brent 来源与 D-6 move status，例如 FRED 日度锚点、FRED 滞后且 Yahoo + Trading Economics 双源确认、正常 / 较大波动观察 / 已确认极端波动 / 未确认跳变。该 UI 仅用于解释 selected realtime payload，不改变 Worker 数据、Brent promotion、scoring、decision，也不读取或展示 secondary diagnostics preview。

**v28.0D-8 Brent source hygiene**：Google Finance Brent 继续只作为 HTML experimental diagnostic，可能命中 futures chain 中的 `0` 或非主价格；非正值必须标记 `excluded-non-positive-or-invalid`，不参与 consensus 或 promotion。（**Stooq `brn.f` / `brn.c` worker diagnostic candidate 已于 F6（2026-06-02）删除**；不影响 `scripts/run-realtime.mjs` 的实时 Stooq Brent consensus 候选。）当前 Brent 主值逻辑仍是 FRED anchor + Yahoo / Trading Economics confirmed promotion，失败的 Google Finance 不影响 `healthScore` / `criticalMissing` / `unavailable`。

**v28.0F6 Stooq worker probe removal（2026-06-02）**：worker `worker-market-preview.js` 的 Stooq `brn.f` / `brn.c` diagnostic candidate 与 `/q/d/l/` sourceProbe（`brn.f` / `brn.c` / `bz.f`）已整体删除（dead-source 清理，零功能影响）。Google Finance sourceProbe 仍 diagnostic-only。`scripts/run-realtime.mjs` 的实时 Stooq Brent consensus 候选（`/q/l/?s=cb.f`）**未改动**。`check-workflows.mjs` 已加回归守卫禁止 worker 重新引入 Stooq Brent 探针。worker 改动需 `wrangler deploy` 生效。

**v28.0D-8B-lite Brent source probe**：Worker generated preview 在 `brentValidation.sourceProbe` 中保留低频隔离的 Google Finance source-probe contract。历史标准路径每 **60** 分钟最多运行一次；2026-08-03 起生产 `free-tier-10ms` 热路径不再主动下载 Google Finance HTML，而是标记 `refreshDeferred=true` / `source-probe-refresh-deferred-free-tier-cpu-budget` 并复用上一轮 `sourceProbe.probes`。标准/人工路径仍保留原 60 分钟实现。它不保存完整 HTML 或完整 CSV，不参与 `brentValidation.consensus`、`brentValidation.promotion` 或 `values.brent`，也不影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。

### v28.0D-8B Source Probe Findings

v28.0D-8B-lite **已上线运行并通过验证**。以下为一次典型线上 `sourceProbe.probes[]` **结论型快照**（diagnostic-only，不是主 Brent 来源；失败不得影响 `healthScore` / `criticalMissing` / `unavailable`，因为它们只是 probes）：

- `google-finance:BZW00:NYMEX` canonical：**`parseStatus = unreliable-html-parse`**
- `google-finance:BZY00:NYMEX` front-month：**`parseStatus = unreliable-html-parse`**

**运维结论**：Google Finance **在此观测窗口内不能升级为 Brent validation source**；也 **不得** 进入：

- `brentValidation.consensus`
- `brentValidation.promotion`
- `values.brent`

**当前可靠 Brent 主逻辑仍应保持**：

1. **FRED `DCOILBRENTEU` anchor**
2. **Yahoo `BZ=F` freshness-gated confirmation**（D-5 条件仍然成立时的 fresh 约束）
3. **Trading Economics confirmation**（与 Yahoo 一起做 promotion confirmation pair）
4. **v28.0D-6 extreme-move confirmation guard**

若未来重新评估 Google Finance 是否“可升级候选”，必须先在 `sourceProbe` 中观察到**连续多轮**满足：

- **`parseStatus = ok`**（且不得靠放宽解析把不可靠 HTML / 非 CSV 误判为 ok）
- **`parsedValue > 0`**
- **时间戳 / 样本行可解释**（能解释数据来源与新鲜度边界）
- **与 Yahoo / Trading Economics 的数值关系合理接近**
- **仍需另开独立版本评审**（例如 **D-8C**），再决定是否允许升级为 validation source 或接入更高权限链路。

未来重新设计 secondary diagnostics 必须满足：

- 不阻塞主 Worker generated preview 写入。
- 低频运行，例如 **30–60 分钟**。
- 每轮最多 **1–2** 个 secondary source。
- 单源短超时。
- 失败只记录 diagnostics，不影响 `values.*`、`updatedAt`、`healthScore`、`criticalMissing`、`sourceMode`、`unavailable` 或 KV put。

## 10. 不要做的修复

- 不要为了让 validate 通过而削弱校验规则。
- 不要把 `brentValidation.consensus.recommendedValue` 直接改成 Brent 主值。
- 不要放松 local fallback 安全闸门。
- 不要绕过 `effectiveDisplayInputs` 直接用 raw realtime values。
- 不要在 render 层重新推导 `executionLock` / `positionGuidance`。
- 不要把 JSON 产物作为临时修复随意提交。
- 不要用 UI 文案反向修改数据契约或评分逻辑。

## World Order source-health consistency

```bash
npm run review:world-order
npm run review:world-order -- --strict
```

该 helper 只读当前 `data/world-order-stress.json`，不联网、不触发 refresh、不写 artifact 或 production data。它按 GDELT / OFAC / SIPRI / ACLED 四源状态重算 `freshness` 和 `sourceMode`：状态错配、越界文案或 future-reference-only 边界破坏为 `FAIL`；源降级及降级时仍异常高置信为 `WARN`。默认 WARN 便于日常观察且退出 0；`--strict` 供 scheduled refresh 后人工硬复核。ACLED 缺失时应手工下载 weekly/monthly xlsx 并运行 sanitizer，不得恢复 API credential 路径。

## v28.0L-3H External AI provider-call workflow runbook

Before the first real provider call:

1. Create GitHub Environment `external-ai-manual`.
2. Add Environment secret `DEEPSEEK_API_KEY`.
3. Prefer required reviewer approval if available.
4. Do not add a repository-level secret unless that fallback is intentionally chosen.
5. Do not paste, print, or pass the key as a command-line argument.

Run the default dry-run first and confirm `provider command executed=false`.

First real fixture-only provider call:

```powershell
gh workflow run "External AI Manual Provider Test" `
  -f provider=deepseek `
  -f input_source=fixture_sample `
  -f dry_run=false `
  -f allow_network=true `
  -f acknowledge_cost=true `
  -f acknowledge_non_production=true `
  -f validate_output=true `
  -f timeout_ms=120000 `
  -f max_attempts=1 `
  -f upload_artifacts=true
```

Expected behavior:

- run may require `external-ai-manual` environment approval.
- one provider call at most.
- output remains artifact-only.
- `check:external-ai-output` runs.
- `review:external-ai-artifact` runs.
- artifact sanitizer runs before upload.
- no production data write.
- no frontend change.
- no Daily trigger.
- `promotionEligible=false`.

Stop and do not retry repeatedly if the provider returns unavailable, times out, validator fails, quality review fails, or sanitizer fails. Inspect the artifact diagnostics and record the run in a follow-up audit PR.

> **External AI provider-call workflow 阶段 operator-note 历史(B-consolidated 折叠 · L-3H-1 → L-3U-1):** 以下各阶段 audit/operator note 折成索引(完整历史见 git history + 对应 `EXTERNAL_AI_*.md`)。统一硬边界:provider artifact 为 non-production/artifact-only、不复制进 `data/`、`promotionEligible=false`、不接 frontend/Daily/Worker/scoring/decision/execution/position、不削弱 validator/quality-review/sanitizer。**当前运维以下方 L-4A production refresh runbook 为准。**

- **L-3H-1** provider-call audit handling:run `25592238444` 首个 fixture provider-call,output 过、quality review `needs_prompt_revision`、sanitizer 拦含 marker 的 diagnostic JSON;失败勿立即 rerun。
- **L-3H-2** fixture prompt rerun rule:no-provider-call prompt/quality 修订;下次 rerun 仅 `fixture_sample`,再失败则停,勿进 live/local/frontend/Daily/production write。
- **L-3H-3** second fixture provider-call audit:run `25593082968` 过(deepseek-v4-flash,quality `pass_for_manual_review`、sanitizer 过、artifactOnly);勿重复 rerun,下一步另开 PR。
- **L-3I** local_compact design note:design-only,勿跑 local_compact provider call,勿动 `DEEPSEEK_API_KEY`。

- **L-3J** first local_compact provider-call runbook:实现 local_compact workflow 路径(实现 PR 不跑 DeepSeek);首跑命令 `gh workflow run "External AI Manual Provider Test" -f input_source=local_compact -f dry_run=false -f allow_network=true …`,失败勿立即 rerun。
- **L-3J-1** local_compact sanitizer source path note:run `25598085025` 安全停在 `provider-test-dry-run-and-gate`;sanitizer 拦 source metadata `data/radar-data.json`(`apiCalled=false`/`secretsRead=false`);修后再跑一次。
- **L-3J-3** local_compact execution-language prompt fix:run `25598379612` quality review `executionLanguageSafety` 拦 `$.facts[5]` 的 `执行灯`;勿削 validator,prompt 修后单跑。
- **L-3J-4** local_compact provider-call audit:run `25598887574` 过(commit `ade9ca2`,deepseek-v4-flash,quality 过、sanitizer 过、`productionDataWritten=false`)作 local_compact artifact-only 审计记录;下一步 L-3K readiness review。

- **L-3K** production readiness note:readiness review([`EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md`](EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md)),未批 production;artifact 3 天过期、只留 doc 摘要。
- **L-3L** production data contract note:设计 production 契约([`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md)),未批 write;勿手插/手编 layer。
- **L-3M** production contract validator note:跑 `npm run check:external-ai-production-contract`;勿手插 layer;下一步 projection/dry-run。
- **L-3N** production projection dry-run note:跑 `npm run check:external-ai-production-projection`(只校验);projection artifact 勿进 `data/`。
- **L-3O** first controlled write guard note:跑 `npm run check:external-ai-production-write-guard`;首 write 须 data-only、独立审批 PR、revert 可回滚。
- **L-3P** first controlled production write:从 run `25598887574` 首次写入 layer(当时 `displayEnabled=false`);用 `npm run write:external-ai-production` + validators,勿手编。
- **L-3P-1** first write audit-sync:首 write post-merge 稳定(当时 `displayEnabled=false`/`frontendDisplayApproved=false`);后续走 validator/write flow。

- **L-3Q** frontend display design note:文档 future 只读 panel 设计;勿手设 `displayEnabled=true`;文案中文非 actionable;勿并入 Global Risk Heatmap。
- **L-3R** hidden frontend scaffold note(历史,已被 L-3T 取代):guarded scaffold,两 flag false 时隐藏;跑 `check:external-ai-frontend-hidden-scaffold`。
- **L-3S** visible display approval note:文档可见审批/data-flag 流程;data-only 即可可见,勿为显示 rerun DeepSeek。
- **L-3T** visible display flag note:**当时经批准 data flag 启用可见 panel**(`displayEnabled=true`/`frontendDisplayApproved=true` = 当时态)；该 panel 现已退场。
- **L-3T-1** visible display audit-sync:当时可见 flags 启用 + post-merge checks 通过；仅作历史记录。
- **L-3U** visible display UX polish note:仅视觉 polish,不改 provider content/data;panel 过大只调 UI,Heatmap 变动即 revert。
- **L-3U-1** visible display UX audit-sync:panel 可见、polished、audited;勿手编/为 polish rerun;可选下一步当时为 L-4A refresh workflow。

### Retired legacy External AI production operations（historical summary）

The former `External AI Production Refresh` workflow, `#external-ai-auxiliary` panel, navigation entry, and `renderExternalAi.js` were retired on 2026-08-11. Do not run or recreate the obsolete 23:50 UTC workflow, do not use its historical dispatch commands, and do not perform a paid refresh for `externalAiInterpretationLayer`.

Current operational rules:

- Use the top-level `Macro Risk Editorial operations` and `Macro Risk Editorial production checks` sections for the visible homepage AI layer.
- Daily may preserve a contract-valid legacy `externalAiInterpretationLayer` unchanged for data compatibility, or fail-soft to its disabled scaffold when invalid; the frontend must never consume it.
- Historical external-AI manual provider tools remain artifact-only and opt-in. They may not write `macroRiskEditorialLayer`, production JSON, or frontend output.
- Legacy incidents/runs `25611392014`, `27049623075`, `27084750986`, and related L-4A/L-4C/M-3H details remain available in git history and the `EXTERNAL_AI_*` phase documents; they are not current runbook actions.
- Never hand-edit either AI field, add automatic retries, copy artifacts into production, or weaken no-scoring/no-decision/no-execution/no-position boundaries.
> **Market Pricing + Editorial 阶段 operator-note 历史(B-consolidated 折叠 · M-4 → N-16):** 以下各阶段 operator note 折成索引(完整见 git history + `MILESTONE_INDEX.md` + 对应 scope docs)。统一边界:Market Pricing Temperature display-only;勿手编 `data/market-pricing-history.json` / `data/radar-data.json`、勿伪造 Nasdaq/QQQ/MA60/标准差/z-score、SPX 仅 fallback 不冒充 Nasdaq;各 scaffold 命令本地安全/不抓网/不写 production;editorial(N-*)为前端版面,不改 scoring/decision/execution/position。**当前 Market Pricing 运维以下方 M-24 first-real-record-write 与 M-91 NDX/IXIC refresh 为准。**

- **M-4** macro overview structure audit-sync:Macro Overview 稳定(M-1 skeleton→M-3 unified→M-3H preservation 后),为首读判断路径;Heatmap 独立。
- **M-5** market pricing temperature design note:温度模块数据源计划(当时未激活);waiting-for-history 非牛非熊,勿手填/伪造,display-only。
- **M-6** market pricing history scaffold note:scaffold-only history 契约 + `check:market-pricing-history`;勿手编 records,SPX 仅 fallback。
- **M-7** source adapter dry-run note:`market-pricing:source-adapter:dry-run` 本地安全(不抓网、不写 history),后续 fetch 须 artifact-only first。
- **M-8** artifact-only fetch design note:future artifact-only fetch 路径(不抓数据);<60 周观测则温度 waiting;勿自动 retry。
- **M-9** artifact fetch scaffold note:`market-pricing:artifact-fetch:scaffold` 本地(`--allow-network` 仍拒),勿手粘 records。
- **M-10** artifact sanitizer scaffold note:`market-pricing:artifact-sanitizer:scaffold` 本地;valid fixture 仅 `readyForProductionWrite=false` 过,拒则勿手改 data。
- **M-11** real-record contract design note:future real-record 契约(不抓数据);勿手加 records,计算须 ≥60 周观测 + 独立 PR。

- **M-12** real-record sanitizer scaffold note:`market-pricing:real-record-sanitizer:scaffold` 仅验 synthetic fixtures;勿导真实数据,拒则勿手改 production。
- **M-13** source selection review note:仅审候选资产/源,不批/不跑 fetch;不确定则 `liveFetchApproved=false`;`check:market-pricing-source-selection-review` 须过。
- **M-14** proof-of-source design note:future proof-of-source 路径(不批/不跑 Stooq/Yahoo/FRED/licensed);QQQ 仅 target metadata,下一步 scaffold 网络须禁用。
- **M-15** source-specific artifact fetch scaffold note:`market-pricing:source-specific-artifact-fetch:scaffold` 本地(网络禁用,`--allow-network` 拒);勿手批源/手粘。
- **M-15A** unified data pipeline architecture note:Daily=慢/历史/production write 层、Worker=realtime 快变层(~3min)、GitHub Actions backup=校验层;新源须先声明 `assignedLayer`(`daily_history_layer`/`realtime_worker_layer`/`github_actions_backup_validation_layer`/`artifact_sanitizer_layer`/`frontend_display_layer`),勿建 ad-hoc pipeline;`check:unified-data-pipeline-architecture` 须过。
- **M-16** network gate design note:定义 source-specific network gate 但不开网;勿手设 `networkGateApproved/networkGateOpen/networkAllowed=true`;`check:market-pricing-network-gate-design` 须过。
- **M-17** network gate scaffold note:`market-pricing:network-gate:scaffold` 本地 closed-gate(`--allow-network` 拒);拒因 `source_not_approved`/`live_fetch_not_approved`/`network_gate_not_approved`。
- **M-18** source compliance review scaffold note:`market-pricing:source-compliance-review:scaffold` 本地(`--mark-reviewed` 拒);7 项 checklist 全 false,合规须人工。

- **M-19** symbol mapping verification design note:design-only(无 scaffold script);保持 `symbolMappingVerified=false`、`noSpxSubstitution=true`(SPX 永不替 Nasdaq/QQQ);QQQ 仅候选。
- **M-20** source format verification design note:design-only;`noPriceFabrication=true`(缺价保持缺、勿插值/前推)、`noHtmlErrorPageMasquerade=true`(HTML 错误页勿当 CSV)。
- **M-21** network open throttled note:首个可 `fetch()` 的 M 命令,仅手动 throttled audit(`market-pricing:network-open-throttled:dry-run` 网络仍闭);手动 open 仅抓 manifest 单源(Stooq QQQ CSV),1 fetch/30s/1 retry,过 M-20 格式校验才写 artifact;**勿在 CI 跑 `--network=open-throttled`**。
- **M-22** manual weekly input sanitizer design note:2026-05-12 Stooq 端点变更后改道——M-21 auto-fetch 弃用,改手动下载 NASDAQ QQQ 周历史置于 `manual-artifacts/market-pricing/manual-weekly-input/`(design-only)。
- **M-23** manual weekly input sanitizer scaffold note:可执行 sanitizer,读 NASDAQ CSV→写 `manual-artifacts/market-pricing/sanitized-output/`(`market-pricing:manual-weekly-input-sanitizer:dry-run`/`:run`);勿 copy 进 history(M-24 才是首个 history-write)。

- **M-7U** homepage IA de-duplication note:Macro Risk Overview 为唯一主判断,Daily Brief 移为证据/源明细;重复模块查 DESIGN.md §4.1(ADR-0014)+ `check:frontend-live-contracts`;Heatmap 独立,勿手编生成内容。
- **M-7V** homepage reading path note:顶部导航映射真实可见段(今日总判断→压力来源→信号分层→四大驱动→市场温度→风险引擎→交叉验证→风险热力图→详细数据→方法说明),不改数据/AI 文本;clutter 调分组锚点非内容。
- **M-7V-1** homepage reading path audit-sync:10 步导航合并 + post-merge 审计;UX 问题查 DESIGN.md §4.1 + `check:frontend-live-contracts`,勿手编生成内容;`check:world-order` partial-freshness warning 在 `check:all` 过时非阻断。

- **N-1** editorial first-fold:首屏 editorial skin(frontend-only);保 DESIGN.md §4.1 IA 顺序/锚点;勿改 AI 文本/scoring/decision/execution/position/workflow,温度 waiting。
- **N-2** editorial pressure-source:压力来源版面 polish(`homepage-pressure-sources`);status class/count pill 仅展示。
- **N-3** editorial signal-layer:信号分层版面 polish(`homepage-signal-layers`);bucket/summary/card 仅展示,不改信号判定计算。
- **N-4** editorial paper/font:paper 背景 + Bubble Watch 字体栈基础;勿加外部 font/CDN/image URL,保 dark legacy 可读。
- **N-5** editorial macro-driver:四大驱动版面 polish(`homepage-macro-drivers`);growth/inflation/liquidity/policy 卡仅渲染证据,不改驱动判定。
- **N-6** editorial market-temperature waiting-state:温度 waiting-state polish(`homepage-market-temperature`);保 waiting-for-history、勿推冷/热状态、保 60周/MA60/z-score 缺口可见。
- **N-7** editorial risk-engine:风险引擎版面 polish(`homepage-risk-engines`);仅渲染证据,不改引擎判定,不转交易建议。
- **N-8** editorial cross-validation:交叉验证版面 polish(`homepage-cross-validation`);仅渲染,不从部分验证强推宏观结论。

- **N-9** editorial Global Risk Heatmap:热力图 polish(`global-risk-heatmap`/`world-heatmap`/`heatmap-list`);保独立、视觉突出,不改 heatmap scoring/region 计算。
- **N-10** editorial Detailed Data appendix:详细数据附录 polish(`detail-data`/`detail-data-header`);为次级审计附录,非首读路径。
- **N-11** editorial Method/Evidence/Boundary appendix:方法附录 polish(`method-evidence`);为 Detailed Data 之后的次级解释附录。
- **N-12** editorial External AI read-only panel:`external-ai-display-panel` polish;保 External AI 辅助只读 + hidden/aria-hidden 行为,不改 AI 文本/provider/schema/write。
- **N-13** editorial inline dark theme cleanup:清残留 dark inline 样式以统一 paper theme;勿加外部 font/CDN URL。
- **N-14** editorial Big Number + threshold scale:首屏大数字 + 阈值刻度 polish;保 `stageFromScore` 阈值 0-50/50-65/65-85/85-100 + score 计算不变(除非另开 reviewed logic PR)。
- **N-15** editorial Key Changes + Watch List:叙述块,为既有结构化数据/缺口/反证的摘要;勿加源、勿把 pending 变结论。
- **N-16** editorial redesign contract guard:guard/validation 层;触 editorial shell/macro overview renderer/paper theme 时跑 `npm run check:frontend-live-contracts` + 看 DESIGN.md §5.6(M-94 V0 视觉契约,ADR-0014);guard 非重设计 UI 的批准。

### v28.0M-24 market pricing first real record write operator note

v28.0M-24 adds the First Real Record Write scaffold with two-stage manual confirmation; M-62 upgrades it from one-shot replacement to weekly `isoWeek`-keyed merge. The script defaults to dry-run-commit mode. The --commit-to-history flag is required to actually write data/market-pricing-history.json. 8 sanity checks run before any write, including incoming-count, merged-count, and cross-seam monotonicity gates. Atomic write via .tmp + rename. CI never invokes the :commit path. No MA60 / std / z-score calculation (M-26), no scoring / decision / execution / position change, no workflow change, and no frontend change.

Operator guidance:

- Run `npm run market-pricing:first-real-record-write:dry-run` first and review incoming/added/updated/total counts, updated ISO weeks, date range, and preview.
- Run `npm run market-pricing:first-real-record-write:commit` only after the dry-run preview is accepted.
- Do not run the :commit path from CI or an automatic workflow.
- If a sanity check fails, do not manually patch data/market-pricing-history.json; fix the sanitized input and retry dry-run.

### v28.0M-91 market pricing NDX/IXIC auxiliary refresh operator note

M-91 adds Yahoo chart `^NDX` / `^IXIC` as approved Market Pricing auxiliary comparison inputs. This path is Daily/manual only and must not be moved into Worker runtime, GitHub Actions workflows, scoring, decision, execution, position, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation.

Operator guidance:

- Run `npm run market-pricing:ndx-ixic-yahoo:dry-run` to fetch and sanitize Yahoo chart weekly data into an ignored review artifact under `manual-artifacts/market-pricing/`.
- Run `npm run market-pricing:ndx-ixic-yahoo:commit` only when a refresh is intentionally approved; it writes `data/market-pricing-history.json.assets.ndx/ixic` and preserves QQQ primary history.
- Run `npm run market-pricing:metrics-calculation:commit` after an approved NDX/IXIC history refresh so `data/market-pricing-metrics.json.assets.ndx/ixic` stays in sync.
- NDX label must remain `纳斯达克 100 — 横向对照`;IXIC label must remain `纳斯达克综合指数 — 广度参照`.
- SPX remains `fallback_candidate_only` and must never display as Nasdaq temperature.
- Required validation after an M-91 refresh: `npm run check:market-pricing` and `npm run check:all`.

### Market Pricing freshness/alignment review

```bash
npm run review:market-pricing-freshness
npm run review:market-pricing-freshness -- --strict
```

默认只读检查 QQQ / NDX / IXIC 的 history、metrics、coverage 与 source commit timestamp。周线超过 10 天或 NDX/IXIC 落后 QQQ 超过 7 天为 `WARN`；history/metrics 错位、未来日期或 active 资产缺失为 `FAIL`。`WARN` 默认退出 0，`--strict` 用于人工硬复核。NDX/IXIC WARN 后先 dry-run，再经人工批准执行 `market-pricing:ndx-ixic-yahoo:commit` 和 `market-pricing:metrics-calculation:commit`；不得把 M-91 manual-only 路径接入 GitHub Actions 或 Worker。

### Transport Shock P-score-57 path-boundary review

当 production refresh、runtime score policy 与 score-readiness 的输出看似冲突时,先运行 `npm run review:transport-shock-path-boundaries -- --dry-run`。`transport-shock-path-boundary-review-v1` 会把两个批准层并列显示:

- `paths.cappedFreeProxyRuntime` 是已批准的低权重运行路径,只允许沿既有 policy 在 `+3` hard cap 内工作。
- Daily 在提交前运行 `check:all` 时,production-refresh monitor 仍只读 `HEAD:data/radar-data.json`,而 runtime-score-policy monitor 会读工作树内刚生成的 `data/radar-data.json`。`cappedFreeProxyRuntime` 的 contribution 与 eligibility 必须来自同一份 runtime-score-policy 快照；已提交 candidate 仅作为独立 production-refresh 观测,不得与未提交 runtime contribution 混合形成假性 `boundary_drift_detected`。
- `paths.routeMarketConfirmedReadiness` 是更高置信 route/market-confirmed 路径；`not_connected` / blocked 仍表示必须另开 reviewed change,不是现有 capped path 的回滚指令。
- 正常组合为 `two_distinct_approval_layers_no_contradiction`。若输出 `boundary_drift_detected`,先修复三个既有 monitor 的合同漂移,不得提高 cap、连接新源或手工改 `data/radar-data.json`。
- 修改该 review 后运行 `npm run check:transport-shock-path-boundaries`,然后运行 `npm run check:oil-directional` 与 `npm run check:all`。

### GDELT P40 post-refresh context

在 Oil News、Bubble Watch 或 World Order 自然刷新后运行 `npm run review:gdelt-cache-health -- --no-output --strict`。严格模式在任何 WATCH/WARN/FAIL 上非零退出；先看 `rows[].refreshContext` 和 `summary.postRefresh`,不要仅凭全局 WATCH 调整缓存政策:

- `expected_error_cooldown_after_refresh`:较新的 Oil News production watch 已运行,但仍在 classified error cooldown 内；先读 `lastFetchFailure.errorClass/cooldownHours`（429=24h、timeout/network=4h、5xx=6h、other=12h）,等待对应窗口到期后的自然刷新,不要手动连发 workflow。
- `degraded_awaiting_post_cooldown_refresh_evidence`:wall-clock 已过 cooldown,但最新 production watch 生成于 cooldown 到期前；等待第一轮 post-cooldown 自然刷新,不得提前判为 persistent。
- `persistent_error_after_cooldown_expiry`:production watch 本身在 cooldown 到期后刷新且仍错误；检查 sanitized request category、调度与 cache write,但不要先放宽 TTL/backoff。
- `expected_pre_refresh_schedule_gap`:Bubble Watch 已越过 132h fresh TTL,但仍在周一 168h cadence + 12h grace 内；等待下一次周一刷新。
- `scheduled_refresh_overdue`:已越过 cadence grace；检查 workflow 或 cache commit,不得手工修改 production JSON。
- 每次 context/checker 变更后运行 `npm run check:gdelt-cache-health` 与 `npm run check:all`。

### GDELT Web NGrams automated display-only cache

`Refresh Oil News Event Watch` 现在会在 Oil News 主 build 内运行一次 bounded
Web NGrams pair fetch；同一 in-memory pair 同时供 display cache 和 article
shadow 使用。生产 display 字段 contract 为
`gdelt-web-ngrams-display-fallback-cache-v2`。排障顺序:

1. 查看 `Refresh oil news event watch` step 的
   `webNgramsShadowStatus` / `webNgramsShadowOutputPath`。
2. 查看 `sourceCaches.gdeltWebNgramsFallback.{status,automation,sourceHealth}`；
   `live` / `live_no_oil_terms_observed` 表示源文件可达,`stale` 只允许沿用 12h
   内上一份 v2 observation,`source_unavailable` 表示失败关闭。
3. 查看 `sourceCaches.gdeltWebNgramsArticleShadow`:只应有 aggregate metrics，
   `promotionEligible=false`；workflow 同时上传 35-day sanitized shadow artifact。
4. 运行 `npm run check:gdelt-web-ngrams-automated-display-cache`，再运行
   `npm run check:oil-news-event-watch`。

这是 automated display-only source-health cache,not a current Oil News signal。
不得把 aggregate hits/doc count 写成事件确认、headline feed、油价方向或评分
输入；不得手工修改 production JSON。

### GDELT Web NGrams article shadow readiness

`GDELT Web NGrams Article Shadow Readiness` 每日只读已提交的 Oil News watch
历史。它不联网查询新闻源、不读取 secrets、不刷新数据、不 commit/push；输出
仅为 GitHub Summary 和 35-day artifact。

本地等价检查：

```bash
npm run check:gdelt-web-ngrams-article-shadow-history-review
npm run review:gdelt-web-ngrams-article-shadow-history -- --no-output
```

- `insufficient_history`：尚无 aggregate shadow cache，或首个 post-merge
  refresh 尚未提交；等待正常 `Refresh Oil News Event Watch`。
- `collecting_shadow_history`（旧v1审阅产物）：已有真实样本，但 30 天/120 usable samples 或
  availability/coverage/support 任一门槛未过；查看 artifact 的 `gates[]`，不得
  为消除 WAIT 而放宽 classifier、pair validator 或独立来源规则。
- `legacy_samples_require_requalification`：已有旧计算口径样本，但尚无可用的
  v2同口径质量历史；旧历史保留在 `metrics`，不能混入新 `qualityMetrics`。
- `collecting_requalified_shadow_history`：已开始v2观察，但仍未通过原有全部
  质量门；查看 `qualityMetrics` 和脱敏诊断，区分方向候选少、日期不可用、
  时间不对齐与真实支持不足。不可更换支持率分母、推测发表日期或提前换主源。
- `ready_for_manual_cutover_review`：只表示可以另开人工 reviewed cutover PR。
  不得在当前 PR、readiness workflow 或 production JSON 中直接改变 source
  order。`promotionEligible` 和 `automaticCutoverApproved` 必须继续为 false。

当前运行顺序仍是 GDELT DOC → Tavily → Brave，Web NGrams 只在 shadow
观察。未来切换必须同时审阅误报样本、语言覆盖、Tavily/Brave 独立支持以及
GDELT DOC fallback 行为；单一 provider 或同 URL/title overlap 不能确认事件。

### FOMC minutes tone quality

FOMC minutes keyword NLP 的日常离线复核：

```bash
npm run review:fomc-minutes-tone-quality -- --no-output
```

默认 `PASS` 表示官方 URL/日期、鹰鸽差值 8 阈值、六类 topic count 与确定性摘要相互一致且证据龄不超过 70 天。生产文件的证据龄按 checker 实际执行时的 UTC 时间计算；只有 synthetic replay 使用冻结时间。`fallback`、70–120 天 `aging`、超过 120 天 `stale` 或完整 `missing/未知` 输出 `WATCH`,默认不阻断 `check:all`;scheduled refresh 后需要人工硬门时追加 `--strict`。`FAIL` 表示字段/语义冲突、非官方 URL、无效计数、摘要不可复现或出现预测/交易/决策语言。若 Daily 在 `Commit updated data files` 阶段失败，日志中的 `findings=` 会给出实际 failure code；先核对是否为真实未来日期或契约冲突，不得通过放宽官方 URL、计数或摘要门禁处理。该命令不联网、不刷新 Daily、不写 production data；默认 artifact 仅位于 ignored `manual-artifacts/fomc-minutes/`。

### ODP P59 FIRMS request-health operator note

Oil Thermal FIRMS refresh now emits only categorized request diagnostics. Never restore raw provider bodies, raw/redacted Area API URLs, MAP_KEY fragments, or free-form upstream errors to production artifacts.

Operator guidance:

- Treat `authentication_error` and `request_rejected` as configuration/request investigation; they are deliberately not retried.
- Treat `timeout`, `network_error`, `rate_limited`, and `server_error` as bounded transient classes. One logical request may retry once, but the whole 42-facility run may consume at most six retries and five seconds backoff per retry.
- Inspect `data/oil-thermal-watch.json.aggregate.requestDiagnostics` after a production refresh: `failuresByCategory`, `recoveredAfterRetryCount`, `retryBudgetExhaustedCount`, and `failedRequestCount` are the audit entry points.
- If the run is `partial` or `source_unavailable`, do not repeatedly dispatch the workflow. Review the sanitized category mix and upstream health first.
- Run `npm run check:firms-request-policy`, `npm run check:oil-thermal-watch`, and then `npm run check:all` after request-policy changes.
- P26 health gate changes the default interpretation of baseline review artifacts: `summary.sampleCount` and `summary.sampleWindowDays` are now healthy-sample-only. Use `summary.totalSampleCount`, `summary.quarantinedSampleCount`, `summary.sampleEligibility`, and `summary.facilityP95ChangedCountAfterQuarantine` to see what was excluded.
- `health_filtered_candidate_ready_post_policy_observation_required` means the healthy-only candidate is numerically established, but no healthy production sample has yet confirmed the P59 diagnostics contract. `refresh:oil-thermal-baseline-candidate` must stop at `prepared_health_gate_hold`, and `monitor:oil-thermal-baseline-quality` must report `observe_post_policy_health_sample` with `manualAction.requiredNow=false`.
- A future promotion packet must contain at least one health-eligible sample whose `aggregate.requestDiagnostics.policyVersion` is the literal machine value `firms-request-policy-1`. A successful bounded retry may remain eligible when all logical requests ultimately succeed and coverage/counts match.
- `promote:oil-thermal-baseline-candidate` and `refresh:oil-thermal-baseline-candidate -- --write-production-baseline` must reject stale P25 artifacts, unhealthy candidates, and P26/P47 packets whose shared P60 health gate is not satisfied.
- Do not promote an Oil Thermal baseline solely because the healthy `sampleWindowDays` crossed 7 or 30 days. Health-gated candidate math still requires a separate human-reviewed baseline change.

### ODP P61 FIRMS baseline promotion record

The 2026-07-29 reviewed promotion used `--max-commits 240 --max-samples 100`. The packet contained 69 eligible healthy samples, 31 quarantined samples, 16 post-P59 diagnostics-confirmed eligible samples, a 14.46-day healthy window, and 42/42 facilities ready. Human review found no blocker or warning before the explicit `--write-production-baseline` run.

- The production config is now 42-row `established` with `baselineQuality=starter_observation_window`; this is an improving 7–30 day baseline, not a mature seasonal baseline.
- The post-promotion live refresh completed 126/126 logical requests with zero final error. It emitted one non-elevated `repeated_watch` row (Sweeny: 3/3 sources, 15 rows, max FRP 39.71); treat this only as an operator review prompt, not an incident or disruption claim.
- Re-run `npm run prepare:oil-thermal-baseline-review -- --max-commits 240 --max-samples 100 --json` before any later promotion. Review quarantine composition, p95 changes, and high-background industrial flare rows before writing.
- A facility-specific high p95 is background calibration, not incident evidence. Repeated observation still requires the existing multi-source and above-baseline gates and remains a manual-review prompt.
- Never copy ignored review packets into tracked data. Production config may only be written by an explicit reviewed promotion command.
- P61 does not change FIRMS request policy, repeated-observation thresholds, ODP `finalBias`, scoring, decision, execution, position, Brent promotion, Global Risk Heatmap, or cross-validation.

### ODP P65 FIRMS 30-day history-window capacity

The shared baseline preparation, rolling refresh, and quality monitor defaults
are now 240 commits / 240 samples. The former 100-sample ceiling covered only
about 14.46 healthy days at the observed cadence and could not reach the
existing 30-day quality gate.

Run the no-write capacity check first:

```bash
npm run check:oil-thermal-history-window-capacity
npm run monitor:oil-thermal-baseline-quality -- --dry-run --no-output
```

Dry-run discovers candidate history but reviews only samples already
materialized in the existing archive directory. To materialize the expanded
history and review the same set, run the artifact-only monitor:

```bash
npm run monitor:oil-thermal-baseline-quality
```

This writes only ignored `manual-artifacts/` outputs and never writes the
production baseline. For a separate current ignored review packet, run:

```bash
npm run prepare:oil-thermal-baseline-review -- --max-commits 240 --max-samples 240 --json
```

The 30-day threshold, P60 health filtering, and post-policy gate are unchanged.
Crossing the threshold is a prompt for human review, not approval to write the
production baseline. Do not add `--write-production-baseline` until the packet,
quarantine composition, facility p95 changes, and current request health have
been reviewed separately.

### ODP P68 FIRMS facility-window baseline quality gate

Promotion must commit the baseline config together with a watch snapshot rebuilt
by the existing generator. Run its no-output dry-run first, then the live build
with an explicitly configured local key, inspect request health, and run
`check:oil-thermal-watch` plus `check:all`. Never hand-edit snapshot statistics or
weaken config/snapshot alignment checks to permit a config-only promotion.

**2026-09-05 reviewed update:** the owner authorized the follow-up work and the
fresh 240-snapshot packet contains 193 healthy / 47 quarantined snapshots.
All 42 facilities have 193 samples and a 35.48-day effective window. Independent
recalculation of all 252 p95 values agrees with the candidate. The existing
promotion CLI updates the production config to `established_observation_window`
without changing thresholds, facility IDs, request policy or score boundaries.
This supersedes the July time-blocked snapshot below, not the standing guards.
There are 41 healthy all-zero snapshots and 16 all-zero p95 rows: snapshots are
not independent overpasses, and absence of detections is not operational proof.
Future refreshes must repeat health/window review rather than auto-promoting.

Do not use global `sampleWindowDays` alone to decide baseline maturity. It is
the healthy-history audit horizon. The effective quality gate is the minimum
`windowDays` across all ready/promoted facilities.

The 2026-07-30 no-write review found:

- 239 valid unique history samples, 182 healthy eligible, 57 quarantined;
- P60 health gate satisfied with 23 post-policy diagnostics-confirmed samples;
- 42/42 facilities ready by sample count;
- global audit horizon 36.20 days;
- minimum/effective facility window 27.74 days;
- 12/42 facilities at 30 days, 30/42 still below target.

Accordingly, the candidate remains `starter_observation_window`; the monitor
must report `collect_until_30d_quality_gate` with `manualAction.requiredNow=false`.
Do not run `--write-production-baseline` until a fresh no-write packet shows
`effectiveQualityWindowDays>=30`, all 42 facilities at target, and the separate
human review remains clear.

Run:

```bash
npm run check:oil-thermal-facility-window-quality
npm run prepare:oil-thermal-baseline-review -- --max-commits 240 --max-samples 240
npm run promote:oil-thermal-baseline-candidate -- --json
npm run monitor:oil-thermal-baseline-quality -- --dry-run --no-output --max-commits 240 --max-samples 240 --json
```

The first future healthy sample at or after the youngest facility cohort's
30-day boundary can satisfy elapsed time, but wall-clock passage alone is not
enough: the sample must enter the health-gated packet. P68 does not change
baseline status, repeated/elevated calculations, request policy, P60 health
gating, or any ODP/scoring/decision/execution boundary.

### ODP P64/P66 verdict history monitor

Run the monitor locally without writing an artifact:

```bash
npm run monitor:oil-directional-verdict-history -- --dry-run --no-output
```

The scheduled workflow runs daily at 01:29 UTC with full git history and
`contents: read` only. It uploads
`manual-artifacts/oil-directional/oil-directional-verdict-history-monitor-latest.json`
and appends a GitHub Summary.

- `stable_current_verdict`: continue read-only monitoring.
- `watch_active_price_physical_divergence`: review the existing price/physical
  divergence; do not change thresholds merely to remove the warning.
- `watch_recent_verdict_churn`: inspect recent evidence timestamps, freshness,
  and transition context before interpreting the latest headline.
- `watch_latest_evidence_degraded` / `watch_latest_data_insufficient`: wait for
  or diagnose a complete ODP refresh; do not substitute missing evidence.
- `no_valid_verdict_history`: confirm `fetch-depth: 0`, repository history, and
  the committed ODP schema before rerunning.

P66 adds an orthogonal confidence observation. When the latest seven valid
samples are all `low`, `trend.persistentLowConfidence=true` and
`manualAction.suggestedNow=true`, while the primary status can remain
`stable_current_verdict` and `manualAction.requiredNow` remains false. Review
the existing evidence-quality caps and their source/freshness context; do not
weaken the classifier or caps merely to clear the observation.

The monitor never fetches sources, triggers refresh, writes production data,
recalculates the classifier, or creates a new score. Its artifact is evidence
for operator review only and must not be copied into production data.
