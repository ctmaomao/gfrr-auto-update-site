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

1. 先看页面 frontend version 是否为当前版本（以 `scripts/app.js` 的 `APP_VERSION` 为准，现 `health-hardening-2`）。
2. 检查 live `data/radar-data.json` 是否包含 `dailyBrief`、`divergenceLayer` 与 `brentPricingLayer`。
3. 检查 Worker Health；Check Worker Health 仍是 Worker-first runtime hard gate。
4. 检查 Realtime Health；Check Realtime Health 仍是 GitHub `realtime-data` fallback / Daily baseline soft observer。
5. 若页面显示 Daily Brief / Divergence Layer / Brent Pricing Layer fallback，先判断 Daily workflow 是否已在对应 contract 合并后运行并完成 Pages deploy。
6. 若 Brent Pricing Layer 缺失，不要手工改 `data/*.json`；应触发或等待 Daily workflow 自然生成。
7. 若 `aiInterpretationLayer` 缺失，先确认 Daily workflow 是否已在 v28.0J-0 之后运行；不要手工补 `data/radar-data.json`。
8. 若 World Order warning 仍为 GDELT stale / SIPRI manual_required / ACLED not_configured，属于已知非阻断观察状态。

v28.0I / v28.0J 新增的 `dailyBrief`、`divergenceLayer`、`macroDrivers.consumer`、`consumer_vs_asset_pricing`、`brentPricingLayer` 与 `aiInterpretationLayer` 均为解释层 / 审计层 / 展示层，不改变 `values.*`、`effectiveDisplayInputs`、Brent promotion、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。

## v28.0J AI Interpretation Layer baseline checks

v28.0J-2B post-deploy audit 已通过，rule-based `aiInterpretationLayer` 为 rule-based structured interpretation，不调用 DeepSeek / OpenAI / 外部 AI API（独立的 `externalAiInterpretationLayer` 已由 approved workflow 用 DeepSeek,visible read-only,见 `docs/DATA_CONTRACT.md` 当前生产契约）。日常排查顺序：

1. 检查 live frontend version 是否为当前版本（以 `scripts/app.js` 的 `APP_VERSION` 为准，现 `health-hardening-2`）。
2. 检查 live `data/radar-data.json` 是否包含 `aiInterpretationLayer`。
3. 检查 `aiInterpretationLayer.contractVersion` 是否为 `v28.0J-0`。
4. 检查 `generatedByExternalAi=false` 与 `usesExternalAiApi=false`。
5. 若页面显示 AI fallback，先确认 Daily workflow 是否已在 v28.0J-0 之后运行，并确认 Pages deploy 是否完成。
6. 不要手工补 `data/radar-data.json`。
7. 若未来外部 AI 接入，必须检查 timeout、fallback、source attribution、禁用文案和不影响 scoring / decision 的边界。

## External AI operations note（已实现 · visible read-only）

`externalAiInterpretationLayer` 已实现并为 visible read-only 展示层（见 `docs/DATA_CONTRACT.md` 当前生产契约）。排查时先确认该层是否通过 output audit / `check:external-ai-production-contract`。若外部 AI output 缺失、timeout、API error、rate limit、invalid JSON、unsafe output 或 stale input，应 fallback 到现有 rule-based `aiInterpretationLayer`。

若 AI output audit 失败，应隐藏 external output，不得手工编辑 `data/radar-data.json` 修复 AI 输出。外部 AI 输出不得影响 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。

v28.0K-1 的 `docs/fixtures/external-ai/*.json` 不影响 live operations。不要通过编辑这些 fixtures 排查或修复生产问题；未来 external AI production issues 必须按 output audit、source attribution 和 fallback rules 排查。

未来排查 external AI output 问题时，先运行：

```bash
npm run check:external-ai-output
```

如果 validation fails，应隐藏 external output 或 fallback 到 rule-based `aiInterpretationLayer`。不要手工编辑 `data/radar-data.json` 修复 external AI output。

_(历史 v28.0K-3A:当时 `status="disabled"` 为预期、回退 rule-based layer。)_ 当前 live `externalAiInterpretationLayer.status=valid`、visible read-only。任何情况下都不要手工编辑 `data/radar-data.json` 补/改该字段;缺失或异常时等待 `External AI Production Refresh` / Daily 自然刷新,或 fallback rule-based `aiInterpretationLayer`。

## External AI production layer checks（当前 · v28.0L visible read-only）

> 历史 v28.0K-3 disabled-scaffold 排查清单已 superseded(当时验证 `enabled=false`/`status=disabled`)。当前 live 为 visible read-only,排查顺序：

1. 检查 live data 是否包含 `externalAiInterpretationLayer`。
2. 确认 `status=valid`、`displayEnabled=true`、`boundaries.frontendDisplayApproved=true`(visible read-only)。
3. 确认 `provider=deepseek`、`qualityReview.status ∈ {pass,warn}`、`recommendation=pass_for_manual_review`。
4. 确认硬边界:`qualityReview.promotionEligible=false`、`provenance.humanApproved=false`,且不影响 scoring/decision/execution/position/`values.*`。
5. 用 `npm run check:external-ai-production-contract` 验证字段/边界契约(含 `auditFlags` 必含项)。
6. 如果本地缺失但 live 已存在，pull latest `main` 或等待 `External AI Production Refresh` / Daily data commit。
7. 不要手工编辑 `data/radar-data.json`(唯一写入路径是 validator+quality 门控的 `External AI Production Refresh` workflow)。
8. 输出异常时 fallback 到 rule-based `aiInterpretationLayer`,不要手改产物。
9. `External AI Production Refresh` 的 scheduled 默认源为 `analyst_compact_v1`；rollback 时手动 `workflow_dispatch` 选择 `input_source=local_compact`。

### External AI refresh / Daily consumption timing

GitHub Actions cron 使用 UTC。当前 `Build Daily Radar Data` 每日 `22:30 UTC` 运行，`External AI Production Refresh` 每日 `23:50 UTC` 运行。该顺序是预期状态：Daily 普通刷新不会调用 DeepSeek，也不会生成新的 external AI 文本；它只会 preserve 上一次已通过生产契约的 `externalAiInterpretationLayer`，若该层缺失或不兼容则回退到 disabled scaffold + rule-based `aiInterpretationLayer`。

`External AI Production Refresh` 是独立的 production layer 写入路径。它在 provider output、quality review、projection、`check:external-ai-production-contract`、`check:external-ai-production-write-guard`、`check:data` 与 `check:all` 全部通过后，只允许提交 `data/radar-data.json`。因此一次成功的 23:50 refresh 可以在 Pages 重新部署后让页面看到新的 `externalAiInterpretationLayer`，但它会晚于当天 22:30 Daily；下一次 Daily 才会把该生产层作为 previous data preserve 进入新的 Daily output。

如果看到 `data/radar-data.json` 中 Daily 生成时间与 `externalAiInterpretationLayer.generatedAt` 不同，不要按事故处理，也不要为对齐时间而重跑付费 provider 或手工编辑 JSON。日频简报允许这类约 1 天内的时序差；只有当 external AI output contract 失败、质量审查失败、provider failure、缺失超过预期刷新窗口，或显示层没有 fallback 到 rule-based `aiInterpretationLayer` 时，才按 external AI incident 排查。

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

If validation fails because `modelJudgments`, `facts`, `inferences`, or another prose field contains unsafe wording such as `交易建议`, do not weaken the validator and do not repeatedly retry paid calls. Tighten the prompt globally so unsafe wording is excluded from every returned string field. Boundary statements belong in the `boundaries` booleans, not in prose text, and `modelJudgments` should stay limited to evidence strength, data sufficiency, uncertainty, and low-confidence / watch conditions.

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

> **历史:** 以下 v28.0L-0…L-3G note 为分阶段 rollout 期间所写(当时 production layer 尚 disabled、integration 尚未实现)。该 rollout 已在 **v28.0L-3P+** 完成:当前 production `externalAiInterpretationLayer` 为 **visible read-only**,由 `External AI Production Refresh` workflow(validator + quality 门控)写入;`DEEPSEEK_API_KEY` secret 与 refresh workflow 已就位。当前态见 `docs/DATA_CONTRACT.md` 当前生产契约。下列各阶段 note 保留作历史。

v28.0L-0 is documented in [`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md), but no production integration exists. Do not create GitHub secrets, scheduled provider calls, Daily provider calls, Worker provider calls, or frontend display until the L-0 design is reviewed and a later implementation PR is approved.

_(历史 L-0 note:撰写时无 production integration、layer 为 disabled scaffold。该 rollout 已在 v28.0L-3P+ 完成,当前 production `externalAiInterpretationLayer` 为 visible read-only,由 `External AI Production Refresh` workflow 写入;见 `docs/DATA_CONTRACT.md` 当前生产契约。)_

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

safe-dom-rendering-1 是当前前端 cache token；同一 Frontend Asset Cache Busting 机制用于处理 Android Chrome cached old module graph：普通窗口可能缓存旧 `scripts/app.js` / ES module graph，导致页面仍显示旧逻辑，例如 Brent 来源停留在 FRED 日度锚点；无痕窗口显示 Worker 独立生成 / 实时数据新鲜 / Yahoo + Trading Economics 双源确认，则说明线上 Worker-first runtime 正常，问题不在 Worker、DNS 或自定义域名。

当前处理方式：

```text
index.html app.js entry → ?v=health-hardening-2
scripts/app.js and active scripts/modules/*.js local imports → ?v=health-hardening-2
scripts/modules/realtime.js → 未接入的冻结 runtime path;import query 不随当前 asset bump 更新
app.js APP_VERSION → 见 scripts/app.js（init console 打印 [app] … APP_VERSION=…）
```

核对前端版本：看 `scripts/app.js` init 时的 console 行 `[app] … APP_VERSION=<版本>`（当前 `health-hardening-2`），或检查已加载 `app.js?v=…` URL 的 token，两者须一致。本次 asset bump 对应 Macro Overview 趋势 SVG 与 External AI 展示簇模块拆分，本身不新增 KV、不 deploy Worker、不改变 DOM/文案/布局/fallback。frontend asset cache version must be bumped when index.html or frontend JS changes：以后修改 `index.html`、`scripts/app.js` 或当前入口实际加载的 `scripts/modules/*.js` 时，必须同步 bump version 并替换相关本地 module import query；M-94 后冻结且当前未接入的 `scripts/modules/realtime.js` 不属于当前入口,其 import query 应保持冻结旧图,不得因此视为前端 realtime overlay 已重接入。只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json` 或只 deploy Worker 不需要 bump；Worker runtime 改动不需要 bump frontend asset version，除非同时改前端 HTML / JS。

v28.0G-9B Frontend Asset Version Bump Helper 提供本地维护命令：

```bash
node scripts/bump-frontend-asset-version.mjs health-hardening-2
npm run bump:frontend-asset-version -- health-hardening-2
```

该工具用于以后前端 HTML / JS 改动时统一 bump cache version。当前正式版本仍是 `health-hardening-2`，不要在没有前端发布需要时最终留下测试版本。工具不访问网络、不写 KV、不写 `data/*.json` / `realtime/*.json`、不 deploy Worker。

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

**v28.0D-3 secondary preview VIX-only producer**：独立 secondary preview 当前只接入 **VIX via Cboe**，不接入 DXY / HY OAS / Gold / US10Y / Brent。scheduled 在主 preview KV put 成功后才低频尝试更新 `market:secondary-preview`；若该 key 的 `updatedAt` / `generatedAt` 距今小于 **30** 分钟则跳过。Cboe 单源请求使用短超时，失败只写入 secondary unavailable payload 或被捕获，不影响主 `market:worker-generated-preview`、Worker-first strict gate、GitHub fallback 或 local fallback。前端当前不消费 `/market.secondary-preview.json`。

**v28.0E-0 Worker fetch timeout guard**：Worker 主 preview 的外部 fetch 统一带短超时保护，目标是限制 FRED / Yahoo / Stooq / Google Finance / Trading Economics / gold-api 等免费源慢响应对 Worker runtime 的影响，而不是新增数据源或改变主值选择。timeout 会作为 `sourceDetails` / `diagnostics` / `sourceProbe` 中的错误摘要返回，不应直接 throw 中断主 preview；critical source timeout 仍按原有 `criticalMissing` / `healthScore` 规则处理，不放松健康门槛。Brent promotion、D-6 moveStatus、D-8B sourceProbe 决策边界均保持不变。后续新增 DXY / US10Y / SPX 等 secondary source 前，必须继承该短超时和失败隔离原则。

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

**v28.0D-8B-lite Brent source probe**：Worker generated preview 在 `brentValidation.sourceProbe` 中记录低频隔离的 Google Finance source probe。它每 **60** 分钟最多运行一次；60 分钟内复用上一轮 main preview 中的 `sourceProbe.probes`，并标记 `reused: true` / `source-probe-reused-within-60m`。当前只探测 Google Finance canonical / front-month 两个 URL（**Stooq `brn.f` / `brn.c` / `bz.f` 三路 probe 已于 F6 删除**）。它不保存完整 HTML 或完整 CSV，不参与 `brentValidation.consensus`、`brentValidation.promotion` 或 `values.brent`，也不影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。即使某个 probe 显示 `parseStatus: ok`，当前 Brent 主逻辑仍是 FRED anchor + Yahoo `BZ=F` / Trading Economics confirmed promotion；只有连续稳定后才应另开 D-8C 讨论是否升级为 validation source。

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
- **L-3T** visible display flag note:**经批准 data flag 启用可见 panel**(`displayEnabled=true`/`frontendDisplayApproved=true` = 当前态);回滚 = revert 或两 flag 置 false;不安全文案或 Heatmap 变动即 revert。
- **L-3T-1** visible display audit-sync:可见 flags 启用 + post-merge checks 过,panel 现可显示;勿手编 AI 文本/为显示 rerun。
- **L-3U** visible display UX polish note:仅视觉 polish,不改 provider content/data;panel 过大只调 UI,Heatmap 变动即 revert。
- **L-3U-1** visible display UX audit-sync:panel 可见、polished、audited;勿手编/为 polish rerun;可选下一步当时为 L-4A refresh workflow。

### v28.0L-4A production refresh workflow runbook

v28.0L-4A adds the first production refresh workflow for the visible external AI read-only panel.

Schedule:

- Workflow: `External AI Production Refresh`.
- Refresh schedule: `23:50 UTC`.
- The schedule intentionally runs after `Build Daily Radar Data` (`22:30 UTC`) so the refresh can use the latest daily site data while the next Daily run preserves the refreshed layer.
- Scheduled runs use `input_source=analyst_compact_v1` by default. `local_compact` remains available as a manual dispatch rollback option.
- Do not add additional schedules.

Required GitHub environment:

- Environment name: `external-ai-production-refresh`.
- Environment secret: `DEEPSEEK_API_KEY`.
- For true automatic daily refresh, this environment must not require manual reviewers. If required reviewers are configured, scheduled runs wait for approval and are not fully automatic.

Manual analyst/default refresh:

```bash
gh workflow run "External AI Production Refresh" \
  -f input_source=analyst_compact_v1 \
  -f allow_network=true \
  -f acknowledge_cost=true \
  -f validate_output=true \
  -f timeout_ms=120000
```

Manual legacy rollback refresh:

```bash
gh workflow run "External AI Production Refresh" \
  -f input_source=local_compact \
  -f allow_network=true \
  -f acknowledge_cost=true \
  -f validate_output=true \
  -f timeout_ms=120000
```

If a refresh fails provider output validation, quality review, production contract validation, write guard, `check:data`, or `check:all`, do not rerun repeatedly; inspect sanitized artifacts and use manual `local_compact` rollback only after confirming analyst output is the failure source.

Refresh behavior:

- Builds the selected input from current site data: scheduled/default `analyst_compact_v1`, or manual-dispatch rollback `local_compact`.
- Calls DeepSeek once.
- Runs output validation.
- Runs external AI artifact quality review.
- Runs artifact sanitizer before upload.
- Projects the output into the production `externalAiInterpretationLayer` contract.
- Preserves `displayEnabled=true` and `boundaries.frontendDisplayApproved=true`.
- Writes only `externalAiInterpretationLayer` into `data/radar-data.json`.
- Runs production contract validation, write guard, frontend scaffold check, `check:data`, and `check:all`.
- Commits only `data/radar-data.json` when the refreshed layer actually changes.

Failure behavior:

- Provider failure, validator failure, quality review failure, sanitizer failure, `check:data` failure, or `check:all` failure stops the workflow.
- Failed runs must not write or commit production data.
- Manual artifacts remain workflow artifacts only and must not be committed.

Rollback:

- Revert the latest `chore: refresh external AI interpretation layer` commit if the refreshed content should be removed.
- If only display must be disabled, set `displayEnabled=false` and `boundaries.frontendDisplayApproved=false` through an approved data update.
- If unsafe copy appears, revert immediately.
- If Global Risk Heatmap layout changes, revert immediately.

- **L-4A-1** production refresh workflow audit sync:首个成功 manual run `25611392014`(commit `c32af65`,只改 `data/radar-data.json` 33+/37−,`productionDataWritten=true`/`displayEnabled=true`/`promotionEligible=false`,全 checks 过);scheduled `23:50 UTC` refresh 就绪,勿手编 layer/加 schedule/retry。
- **L-4B** display coverage polish note:frontend-only,显示更多已验证 layer 字段的 capped 安全摘要;勿 rerun/编辑 AI 文本;过长则在 `scripts/modules/renderExternalAi.js` 降 cap;raw provenance/run ID/artifact ID 仍隐藏。
- **L-4B-1** display coverage audit-sync:coverage 完成(frontend-only);`External AI Production Refresh` 仍是唯一批准自动 provider 路径。

### v28.0L-4C refresh monitoring / failure notification design

v28.0L-4C documents monitoring and failure-notification handling for the existing `External AI Production Refresh` workflow. It does not add a workflow, trigger a run, call DeepSeek, read secrets, change production data, or change frontend behavior.

Monitoring baseline:

- `External AI Production Refresh` runs on the daily `23:50 UTC` schedule and by manual `workflow_dispatch`.
- The first successful manual production refresh was run `25611392014`.
- That run committed `c32af65` and changed only `data/radar-data.json`.
- The recommended first notification channel is GitHub native failed-workflow notification.
- Dedicated issue, webhook, Slack, or email notification automation is not implemented yet.

Failure review procedure:

- Open the failed `External AI Production Refresh` run in GitHub Actions.
- Inspect the first failing step and determine whether the failure is configuration, provider transport, output safety, production write, check, or protected-path related.
- Confirm whether a production commit was pushed. If failure happened before final checks, there should be no `data/radar-data.json` commit.
- Check whether a sanitized artifact is available before reviewing output details.
- Treat the known non-blocking `check:world-order` warning as not an external AI refresh failure when `check:all` still passes.

Allowed rollback actions:

- Revert the latest refresh commit if the refreshed production layer must be removed.
- Rerun one validated manual refresh only when operator review says a rerun is appropriate.
- Disable display flags through an approved data update if display must be hidden.

Do not:

- Manually edit AI text or `externalAiInterpretationLayer`.
- Add provider auto-retry loops.
- Add another refresh schedule.
- Add issue, webhook, Slack, email, or external notification secrets without explicit approval.
- Let monitoring write `data/radar-data.json`, call DeepSeek, trigger provider refresh, or change frontend files.

Design reference:

- `docs/EXTERNAL_AI_REFRESH_MONITORING_DESIGN.md`

### v28.0M-3H external AI layer preservation hotfix

Ordinary radar data refresh must preserve the current production `externalAiInterpretationLayer` when it is contract-valid. `External AI Production Refresh` remains the only approved automatic path for changing external AI content.

If `check:external-ai-production-write-guard` fails after a `chore: refresh radar data` commit:

- Inspect `data/radar-data.json.externalAiInterpretationLayer`.
- Check whether `displayEnabled`, `boundaries.frontendDisplayApproved`, and `qualityReview.promotionEligible=false` were lost or malformed.
- Run `npm run check:external-ai-production-contract -- data/radar-data.json`.
- Run `npm run check:external-ai-frontend-hidden-scaffold`.
- Do not manually edit external AI generated text.
- Do not call DeepSeek or rerun the provider just to repair ordinary refresh damage.
- Repair by preserving the last valid production external AI layer from git history, or rerun the approved `External AI Production Refresh` only after the preservation bug is fixed and operator review says a refresh is appropriate. If the previous layer is missing or contract-invalid before an ordinary Daily refresh starts, the Daily pipeline may fail soft to a disabled scaffold and rule-based `aiInterpretationLayer` fallback instead of blocking the whole radar build.

Rollback and repair boundaries:

- A normal radar refresh may update current market and radar fields, but must carry forward the existing valid external AI layer unchanged.
- If no valid external AI layer is available, a normal radar refresh may write the disabled scaffold only as a fallback; it must not call DeepSeek, generate new provider text, or mark external AI display as approved.
- If unsafe copy appears or display gates are malformed, revert the damaging data refresh or restore the latest contract-valid layer.
- Treat the known non-blocking `check:world-order` warning as separate from external AI preservation when `check:all` passes.

### v28.0M-3H-1 preservation hotfix audit-sync operator note

v28.0M-3H-1 records that the preservation hotfix passed post-merge audit after PR #118.

Operator guidance:

- If `check:external-ai-production-write-guard` fails after `chore: refresh radar data`, first inspect whether ordinary radar refresh preserved `externalAiInterpretationLayer`.
- Ordinary radar refresh should not overwrite a valid production `externalAiInterpretationLayer` with the disabled scaffold.
- If the previous layer is missing or production-contract-invalid, ordinary radar refresh may write the disabled scaffold and fall back to rule-based `aiInterpretationLayer` rather than fail the whole Daily build.
- Do not manually edit external AI generated text.
- Do not rerun the provider repeatedly to repair ordinary radar refresh damage.
- `External AI Production Refresh` remains the only approved automatic path for changing external AI content.
- Allowed rollback path is reverting the faulty radar refresh or restoring the last valid `externalAiInterpretationLayer` only through an approved hotfix.
- Continue treating the known `check:world-order` warning as non-blocking when `check:all` passes.

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
