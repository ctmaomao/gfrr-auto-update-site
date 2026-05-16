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

该命令等价于依次执行：

```bash
npm run check:syntax
npm run check:dom
npm run check:modules
npm run check:copy
npm run check:workflows
npm run check:docs
npm run check:data
```

`check:data` 等价于 `node scripts/validate-data.mjs`。v28.0G-10 Data Check Expected-Skip Noise Cleanup 后，默认检查不再为 local realtime / `dailyRealtimeInput` 时间不一致输出 warning；这是 expected skip，因为 Worker-first runtime 已是主链路，本地 realtime 属于 fallback / Daily baseline，可能不是同一快照。

`check:copy` 检查用户可见文案契约，防止“广义美元指数 / 亿美元 / 传导网络 Δ”等已修复文案回退。

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

1. 先看页面 frontend version 是否为当前版本，当前应为 `28.0M-47V`。
2. 检查 live `data/radar-data.json` 是否包含 `dailyBrief`、`divergenceLayer` 与 `brentPricingLayer`。
3. 检查 Worker Health；Check Worker Health 仍是 Worker-first runtime hard gate。
4. 检查 Realtime Health；Check Realtime Health 仍是 GitHub `realtime-data` fallback / Daily baseline soft observer。
5. 若页面显示 Daily Brief / Divergence Layer / Brent Pricing Layer fallback，先判断 Daily workflow 是否已在对应 contract 合并后运行并完成 Pages deploy。
6. 若 Brent Pricing Layer 缺失，不要手工改 `data/*.json`；应触发或等待 Daily workflow 自然生成。
7. 若 `aiInterpretationLayer` 缺失，先确认 Daily workflow 是否已在 v28.0J-0 之后运行；不要手工补 `data/radar-data.json`。
8. 若 World Order warning 仍为 GDELT stale / SIPRI manual_required / ACLED not_configured，属于已知非阻断观察状态。

v28.0I / v28.0J 新增的 `dailyBrief`、`divergenceLayer`、`macroDrivers.consumer`、`consumer_vs_asset_pricing`、`brentPricingLayer` 与 `aiInterpretationLayer` 均为解释层 / 审计层 / 展示层，不改变 `values.*`、`effectiveDisplayInputs`、Brent promotion、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。

## v28.0J AI Interpretation Layer baseline checks

v28.0J-2B post-deploy audit 已通过，当前 AI 解释层为 rule-based structured interpretation，不调用 DeepSeek / OpenAI / 外部 AI API。日常排查顺序：

1. 检查 live frontend version 是否为当前版本，当前应为 `28.0M-47V`。
2. 检查 live `data/radar-data.json` 是否包含 `aiInterpretationLayer`。
3. 检查 `aiInterpretationLayer.contractVersion` 是否为 `v28.0J-0`。
4. 检查 `generatedByExternalAi=false` 与 `usesExternalAiApi=false`。
5. 若页面显示 AI fallback，先确认 Daily workflow 是否已在 v28.0J-0 之后运行，并确认 Pages deploy 是否完成。
6. 不要手工补 `data/radar-data.json`。
7. 若未来外部 AI 接入，必须检查 timeout、fallback、source attribution、禁用文案和不影响 scoring / decision 的边界。

## Future External AI operations note

未来如果新增 `externalAiInterpretationLayer`，排查时必须先确认该层是否通过 output audit。若外部 AI output 缺失、timeout、API error、rate limit、invalid JSON、unsafe output 或 stale input，应 fallback 到现有 rule-based `aiInterpretationLayer`。

若 AI output audit 失败，应隐藏 external output，不得手工编辑 `data/radar-data.json` 修复 AI 输出。外部 AI 输出不得影响 scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。

v28.0K-1 的 `docs/fixtures/external-ai/*.json` 不影响 live operations。不要通过编辑这些 fixtures 排查或修复生产问题；未来 external AI production issues 必须按 output audit、source attribution 和 fallback rules 排查。

未来排查 external AI output 问题时，先运行：

```bash
npm run check:external-ai-output
```

如果 validation fails，应隐藏 external output 或 fallback 到 rule-based `aiInterpretationLayer`。不要手工编辑 `data/radar-data.json` 修复 external AI output。

v28.0K-3A 后，如果 `externalAiInterpretationLayer.status="disabled"`，这是预期状态，不代表 API failure；含义是当前回退到 rule-based `aiInterpretationLayer`。如果 live data 暂时缺少该字段，等待 v28.0K-3A 合并后的 Daily 自然刷新；只有 realtime health 为 fresh / aging 时才考虑手动触发 Daily。不要手工编辑 `data/radar-data.json` 补该字段。

## v28.0K-3 external AI disabled scaffold checks

日常或 incident 排查顺序：

1. 检查 live data 是否包含 `externalAiInterpretationLayer`。
2. 确认 `contractVersion` 为 `v28.0K-3A`。
3. 确认 `enabled=false` 且 `status=disabled`。
4. 确认 `provider=none` 且 `output=null`。
5. 确认 `externalAiGenerated=false` 且 `usesExternalAiApi=false`。
6. 确认 `fallback.fallbackLayer=aiInterpretationLayer`。
7. 如果本地缺失但 live 已存在，pull latest `main` 或等待 Daily data commit。
8. 不要手工编辑 `data/radar-data.json`。
9. 不要把 disabled scaffold 当成 API failure。
10. 不要在未另开评审版本前把该字段暴露到 frontend。

## Stable Observation Audit

v28.0K-3D originally added a read-only stable observation gate for the v28.0K baseline. M-44 deprecates that legacy gate because it was hard-coded to the disabled external-AI scaffold era and no longer matches the v28.0L+ production External AI state.

Do not restore or run the retired workflow/script. Use the v28.0L-aware checks for current coverage: `check:external-ai-production-contract`, `check:external-ai-production-write-guard`, `check:external-ai-provenance-completeness`, and the full `check:all` chain.

## v28.0K-4A Manual API Test Design

v28.0K-4A is design-only. It documents a future disabled-by-default manual API test process in [`EXTERNAL_AI_MANUAL_TEST_DESIGN.md`](EXTERNAL_AI_MANUAL_TEST_DESIGN.md), but it does not add API code, secrets, provider SDKs, external AI workflows, frontend display, or production data changes.

If future manual API tests exist, they must be explicitly opt-in. A failed manual test is a diagnostic event, not a production incident. Production fallback remains the rule-based `aiInterpretationLayer`, and production `externalAiInterpretationLayer` must remain disabled unless a separate reviewed version changes that boundary.

## External AI Manual Dry-Run Scaffold

v28.0K-4B adds a local no-network scaffold command:

```bash
npm run manual:external-ai:dry-run
```

Expected result: a dry-run scaffold report only. The command does not use network, does not read API keys, does not call a provider, and does not mutate production data. If it fails because provider is not `none`, that is expected safety behavior.

Do not use this command to troubleshoot production `externalAiInterpretationLayer`; the production field remains a disabled scaffold until a separate reviewed version changes it.

## External AI Provider Adapter Skeleton

v28.0K-4C adds a disabled provider adapter skeleton for future manual tests. Local check command:

```bash
npm run check:external-ai-provider-adapters
```

Expected result: `External AI provider adapter skeleton: PASS`.

Non-`none` provider refusal is expected in v28.0K-4C. Do not treat `deepseek` / `openai` refusal as an incident; no API call is expected, no API key should be read, and production `externalAiInterpretationLayer` remains disabled.

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

Failure is a manual diagnostic event, not a production incident. Do not commit the artifact, do not copy it into `data/radar-data.json`, and do not use it to troubleshoot production `externalAiInterpretationLayer`. Production remains disabled and rule-based fallback remains unchanged.

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

### External AI production integration design status

v28.0L-0 is documented in [`EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`](EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md), but no production integration exists. Do not create GitHub secrets, scheduled provider calls, Daily provider calls, Worker provider calls, or frontend display until the L-0 design is reviewed and a later implementation PR is approved.

Manual testing remains the only allowed provider usage. Production `externalAiInterpretationLayer` remains the disabled scaffold.

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

v28.0M-55bV Frontend Asset Cache Busting 处理 Android Chrome cached old module graph：普通窗口可能缓存旧 `scripts/app.js` / ES module graph，导致页面仍显示 Actions/FRED 旧逻辑，例如 Brent 来源停留在 FRED 日度锚点；无痕窗口显示 Worker 独立生成 / 实时数据新鲜 / Yahoo + Trading Economics 双源确认，则说明线上 Worker-first runtime 正常，问题不在 Worker、DNS 或自定义域名。

当前处理方式：

```text
index.html app.js entry → ?v=28.0M-55bV
scripts/app.js and scripts/modules/*.js local imports → ?v=28.0M-55bV
window.__GFRR_FRONTEND_VERSION__ → 28.0M-55bV
```

浏览器 Console 可执行：

```js
window.__GFRR_FRONTEND_VERSION__
```

应返回 `"28.0M-55bV"`。本轮不改 Worker runtime、不改数据源、不新增 KV、不 deploy Worker。frontend asset cache version must be bumped when index.html or frontend JS changes：以后修改 `index.html`、`scripts/app.js` 或 `scripts/modules/*.js` 时，必须同步 bump version 并替换所有本地 module import query。只改 Worker runtime、docs、check scripts、GitHub Actions、`data/*.json` / `realtime/*.json` 或只 deploy Worker 不需要 bump；Worker runtime 改动不需要 bump frontend asset version，除非同时改前端 HTML / JS。

v28.0G-9B Frontend Asset Version Bump Helper 提供本地维护命令：

```bash
node scripts/bump-frontend-asset-version.mjs 28.0M-55bV
npm run bump:frontend-asset-version -- 28.0M-55bV
```

该工具用于以后前端 HTML / JS 改动时统一 bump cache version。当前正式版本仍是 `28.0M-55bV`，不要在没有前端发布需要时最终留下测试版本。工具不访问网络、不写 KV、不写 `data/*.json` / `realtime/*.json`、不 deploy Worker。

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

`Deploy Static Site to Pages` 在上传 artifact 和部署前会自动运行：

```bash
npm run check:syntax
npm run check:dom
npm run check:modules
npm run check:copy
npm run check:workflows
npm run check:docs
npm run check:data
```

失败时按类型排查：

- `check:syntax` 失败：查看具体 JS / MJS 文件语法错误。
- `check:dom` 失败：检查 `index.html` 是否误删关键 DOM id。
- `check:modules` 失败：检查模块 import / export，尤其是 `render.js` re-export 和 `scripts/modules/*`。
- `Check user-facing copy contract / check:copy` 失败：检查用户可见文案是否回退，例如“广义美元指数”被写成“广义美元 / 美元指数”，“亿美元”被写成“十亿美元”，或传导网络 delta 被写回“Δ --”。
- `Check workflow contract / check:workflows` 失败：检查 GitHub Actions workflow 是否误删关键保护项，例如 Realtime 每小时 6 次错峰调度、Daily 消费 origin/realtime-data、Daily / Decision / Transmission Summary、Pages 部署前检查链路、upload-pages-artifact / deploy-pages 步骤。
- `Check documentation links / check:docs` 失败：检查 README.md、AGENTS.md 和 docs/*.md 中的本地 Markdown 链接是否指向不存在的文件；http / https / mailto / 纯锚点链接会跳过。
- `Validate data contract / check:data` 失败：检查 `data/radar-data.json`、`realtime/market.json`、Brent validation、decision contract、transmission delta contract 等数据契约，并查看 `validate-data.mjs` 的输出信息。

`check:syntax` 会自动扫描 `scripts/` 下的 `.js` / `.mjs`；`check:modules` 会自动扫描 `scripts/modules/*.js`。

GitHub Actions workflow baseline 使用 Node 24 LTS compatible official actions：`actions/checkout@v6`、`actions/setup-node@v6` 和 `actions/upload-artifact@v7`；`setup-node` 使用 `node-version: 24`。每个 workflow 必须设置 top-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`。不要使用 `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`、`FORCE_JAVASCRIPT_ACTIONS_TO_NODE20`、Node 20 或 Node 25 作为默认项目 runtime。

`validate-data.mjs` 的 warning 不等于失败；只有 exit code 非 0 才会阻止部署。Pages deploy 是分步骤运行上述检查，不运行 `check:all`。

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
- Google Finance / Stooq probe failed：正常 diagnostic-only，不影响 main values。
- sourceProbe missing 或 `probeCount >5`：检查 Worker payload contract。
- 不要把 Google Finance / Stooq 升级为 validation source，除非另开版本并有稳定证据。

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

**v28.0D-8 Brent source hygiene**：Google Finance Brent 继续只作为 HTML experimental diagnostic，可能命中 futures chain 中的 `0` 或非主价格；非正值必须标记 `excluded-non-positive-or-invalid`，不参与 consensus 或 promotion。Stooq `brn.f` 保留为观测源，但 CSV close 缺失时应明确记录 `csv-no-numeric-close` 或 `symbol-download-unavailable`。新增 `stooq:brn.c` alternate diagnostic probe，仅进入 audit candidateSources，不参与主值、consensus 或 promotion。当前 Brent 主值逻辑仍是 FRED anchor + Yahoo / Trading Economics confirmed promotion，失败的 Google Finance / Stooq 不影响 `healthScore` / `criticalMissing` / `unavailable`。

**v28.0D-8A Stooq role cleanup**：将 `stooq:brn.f` 标为 `diagnostic`、`participatesInConsensus: false`、`quality: csv-symbol-unstable`，不进入 `brentValidation.consensus`，避免误读为仍参与 Brent validation。此行 **不是** Google Finance / Stooq 抓取修复；不可靠 HTML / CSV 与符号问题应通过 **v28.0D-8B Source Probe** 另行处理。

**v28.0D-8B-lite Brent source probe**：Worker generated preview 在 `brentValidation.sourceProbe` 中记录低频隔离的 Google Finance / Stooq source probe。它每 **60** 分钟最多运行一次；60 分钟内复用上一轮 main preview 中的 `sourceProbe.probes`，并标记 `reused: true` / `source-probe-reused-within-60m`。当前只探测 Google Finance canonical / front-month 两个 URL，以及 Stooq `brn.f` / `brn.c` / `bz.f` 三个 symbol。它不保存完整 HTML 或完整 CSV，不参与 `brentValidation.consensus`、`brentValidation.promotion` 或 `values.brent`，也不影响 `healthScore` / `criticalMissing` / `sourceMode` / `unavailable`。即使某个 probe 显示 `parseStatus: ok`，当前 Brent 主逻辑仍是 FRED anchor + Yahoo `BZ=F` / Trading Economics confirmed promotion；只有连续稳定后才应另开 D-8C 讨论是否升级为 validation source。

### v28.0D-8B Source Probe Findings

v28.0D-8B-lite **已上线运行并通过验证**。以下为一次典型线上 `sourceProbe.probes[]` **结论型快照**（diagnostic-only，不是主 Brent 来源；失败不得影响 `healthScore` / `criticalMissing` / `unavailable`，因为它们只是 probes）：

- `google-finance:BZW00:NYMEX` canonical：**`parseStatus = unreliable-html-parse`**
- `google-finance:BZY00:NYMEX` front-month：**`parseStatus = unreliable-html-parse`**
- `stooq:brn.f`：**`parseStatus = empty-body`**（不可靠 Brent close）
- `stooq:brn.c`：**`parseStatus = header-unrecognized`**（不可靠 Brent close）
- `stooq:bz.f`：**`parseStatus = empty-body`**（不可靠 Brent close）

**运维结论**：Google Finance 与 Stooq **在此观测窗口内均不能升级为 Brent validation source**；也 **不得** 进入：

- `brentValidation.consensus`
- `brentValidation.promotion`
- `values.brent`

**当前可靠 Brent 主逻辑仍应保持**：

1. **FRED `DCOILBRENTEU` anchor**
2. **Yahoo `BZ=F` freshness-gated confirmation**（D-5 条件仍然成立时的 fresh 约束）
3. **Trading Economics confirmation**（与 Yahoo 一起做 promotion confirmation pair）
4. **v28.0D-6 extreme-move confirmation guard**

若未来重新评估 Google / Stooq 是否“可升级候选”，必须先在 `sourceProbe` 中观察到**连续多轮**满足：

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

### v28.0L-3H-1 provider-call audit handling

Run `25592238444` is the first recorded real `fixture_sample` DeepSeek provider-call audit:

- provider transport worked behind `external-ai-manual` environment approval.
- output validation passed.
- DeepSeek manual API test passed.
- quality review failed with `needs_prompt_revision`.
- `promotionEligible=false`.
- artifact sanitizer blocked upload because diagnostic JSON contained the literal marker `DEEPSEEK_API_KEY`.
- no production data was written.
- no frontend, Daily, Worker, config, scoring, decision, execution, or position path changed.

Operator rule:

- If quality review fails, do not rerun immediately.
- Inspect the uploaded quality review artifact if available.
- If artifacts are blocked by sanitizer, fix diagnostic / sanitizer behavior before rerun.
- Do not run live/local input provider calls until `fixture_sample` quality review passes.
- Do not weaken the sanitizer to permit secret names, authorization markers, raw headers / responses, production data paths, realtime paths, or config paths.

### v28.0L-3H-2 fixture prompt rerun rule

L-3H-2 is a no-provider-call prompt and quality guidance revision.

Operator rule:

- Do not rerun the provider-call workflow until L-3H-2 is merged and its local checks are audited.
- The next rerun must use `fixture_sample` only.
- Do not run live/local provider input before `fixture_sample` quality review passes.
- If the second fixture quality review fails, stop again; do not proceed to live/local, frontend display, Daily integration, or production data writes.
- Do not weaken `review:external-ai-artifact`, `check:external-ai-output`, or the artifact sanitizer to make a provider output pass.

### v28.0L-3H-3 second fixture provider-call audit note

Run `25593082968` succeeded for the second `fixture_sample` DeepSeek provider-call audit.

Operator audit result:

- provider-call path entered through `external-ai-manual`.
- provider was `deepseek`; model was `deepseek-v4-flash`.
- output validation passed.
- quality review passed with `recommendation=pass_for_manual_review`.
- `promotionEligible=false`.
- artifact sanitizer passed.
- sanitized provider-call artifacts uploaded.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- output remained `artifactOnly=true`.

Operator rule:

- Do not rerun `fixture_sample` repeatedly now that the path is audited.
- Do not proceed to live/local provider input without a separate PR.
- Do not copy provider artifacts into `data/` or production data.
- Do not display provider output in frontend, trigger Daily, or connect it to scoring / decision / execution / position logic.
- The next real-call step must be separately approved and should likely be `local_compact` / live structured input under artifact-only mode.

### v28.0L-3I local_compact design operator note

L-3I is design-only. Do not run a `local_compact` provider call yet.

Operator rule:

- The next step is design/audit first.
- Do not trigger the provider workflow for `local_compact` from L-3I.
- Do not read, print, add, remove, or modify `DEEPSEEK_API_KEY` for L-3I.
- When eventually allowed by a separate implementation PR, the first `local_compact` provider run should be one call only.
- If that future run fails quality review, stop and revise prompt / source semantics before any retry.
- Do not copy `local_compact` input or provider output into `data/`.
- Do not display `local_compact` provider output in frontend, trigger Daily, or connect it to scoring / decision / execution / position logic.

### v28.0L-3J first local_compact provider-call audit runbook

L-3J implements the `local_compact` provider-call workflow path, but the implementation PR does not run DeepSeek and does not trigger GitHub Actions.

First audit command after merge and approval:

```powershell
gh workflow run "External AI Manual Provider Test" `
  -f provider=deepseek `
  -f input_source=local_compact `
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

- The run requires `external-ai-manual` environment approval.
- The provider-call job builds compact input from the repository local `data/radar-data.json`.
- DeepSeek is called once, only after the manual gates, environment approval, and step-scoped Environment secret are present.
- The output validator runs.
- The quality review runs.
- The artifact sanitizer runs before upload.
- Artifacts upload only if sanitized.
- No production data is written.
- No frontend display is changed.
- No Daily, Worker, scoring, decision, execution, or position path changes.

Stop rule:

- If the `local_compact` run fails validator, quality review, or sanitizer, do not rerun immediately.
- Do not copy artifacts into `data/`.
- Do not proceed to production integration or frontend display.

### v28.0L-3J-1 local_compact sanitizer source path note

Run `25598085025` stopped safely in `provider-test-dry-run-and-gate`.

Observed result:

- `manual-input-compact-latest.json` was built from local source metadata.
- `sourceType=local_file`.
- input was `data/radar-data.json`.
- `compact=true`.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- `secretsRead=false`.
- `apiCalled=false`.
- Provider gates were satisfied for `local_compact`.
- The artifact sanitizer blocked upload on the source metadata string `data/radar-data.json`.
- The provider-call job did not run.
- No DeepSeek call occurred.
- No secret was read.

Operator rule:

- Do not rerun `local_compact` until the sanitizer source metadata fix is merged.
- After the fix is merged, rerun the `local_compact` provider-call audit once.

### v28.0L-3J-3 local_compact execution-language prompt fix note

Run `25598379612` reached the `local_compact` provider call and passed output validation plus artifact sanitizer, but quality review failed with `failedDimensions=executionLanguageSafety`.

Blocking quality review error:

```text
$.facts[5] contains operation-oriented language: 执行灯
```

Operator guidance:

- Do not rerun `local_compact` until L-3J-3 is merged and audited.
- Do not weaken `review:external-ai-artifact`, `check:external-ai-output`, artifact sanitizer, or `executionLanguageSafety`.
- Do not promote the failed artifact; `promotionEligible=false` is correct.
- The next retry must be one run only.
- If `executionLanguageSafety` fails again, stop and revise the prompt again before any further paid run.
- Do not copy compact input or provider output into `data/`, frontend display paths, Daily, Worker, scoring, decision, execution, or position logic.
- Treat `data/radar-data.json` inside `manual-input-compact-latest.json` as source metadata only.
- Never upload actual `data/radar-data.json`.
- Never copy provider output into `data/radar-data.json`.

### v28.0L-3J-4 local_compact provider-call audit note

Run `25598887574` succeeded for the `local_compact` DeepSeek provider-call audit.

Operator audit result:

- workflow: `External AI Manual Provider Test`.
- commit: `ade9ca2`.
- `provider-test-dry-run-and-gate` succeeded.
- `provider-call-artifact-only` succeeded.
- local compact input was built successfully from local `data/radar-data.json` as read-only source metadata.
- `manual-input-compact-latest.json` was created.
- provider-call path entered through `external-ai-manual`.
- provider was `deepseek`; model was `deepseek-v4-flash`.
- DeepSeek manual API test passed.
- output validation passed with `warnings=0`.
- quality review passed.
- artifact sanitizer passed.
- sanitized provider-call artifacts uploaded.
- `promotionEligible=false`.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- no data/radar-data.json write occurred.
- no frontend display, Daily integration, scoring, decision, execution, or position change occurred.

Operator guidance:

- Use run `25598887574` as the `local_compact` artifact-only audit record.
- Do not rerun `local_compact` repeatedly without a new approved task.
- Do not copy artifacts into `data/`.
- Do not enable frontend display.
- Do not trigger Daily from provider output.
- Any next step toward production must be a separate design/readiness PR.
- If a future `local_compact` run fails validator, quality review, or sanitizer, stop and revise before retry.

Recommended next stage:

```text
v28.0L-3K External AI Production Integration Readiness Review - No Production Write
```

### v28.0L-3K production readiness operational note

v28.0L-3K reviews production integration readiness in [`EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md`](EXTERNAL_AI_PRODUCTION_READINESS_REVIEW.md). It does not approve production integration.

Operator guidance:

- Do not run more provider calls unless tied to a specific approved task.
- Do not copy artifacts into `data/`.
- Do not enable frontend display.
- Do not trigger Daily from provider output.
- Do not add scheduled or automatic provider calls.
- Production integration requires a new explicit design PR.
- Artifacts expire after 3 days; keep audit summaries in docs, not raw artifact copies.

Recommended next stage:

```text
v28.0L-3L External AI Production Data Contract Design - No Production Write
```

### v28.0L-3L production data contract operator note

v28.0L-3L designs the future production `externalAiInterpretationLayer` contract in [`EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md`](EXTERNAL_AI_PRODUCTION_DATA_CONTRACT_DESIGN.md). It does not approve production writes.

Operator guidance:

- Do not copy provider artifacts into `data/radar-data.json`.
- Do not manually create or edit `externalAiInterpretationLayer` in production data.
- Wait for the validator scaffold and later dry-run projection stages before any production data write is considered.
- Do not enable frontend display.
- Do not trigger Daily or scheduled provider calls.
- Artifacts expire after 3 days; docs contain audit summaries only, not raw artifact copies.

Recommended next stage:

```text
v28.0L-3M External AI Production Contract Validator Scaffold - No Production Write
```

### v28.0L-3M production contract validator operator note

v28.0L-3M adds a local production contract validator scaffold.

Operator guidance:

- Run `npm run check:external-ai-production-contract` before any future production write design.
- Do not manually insert `externalAiInterpretationLayer` into `data/radar-data.json`.
- Do not copy provider artifacts into `data/radar-data.json`.
- The next stage must be projection / dry-run only.
- Production write remains NO-GO.
- Frontend display remains NO-GO.
- Daily and automatic provider calls remain NO-GO.

Recommended next stage:

```text
v28.0L-3N External AI Production Projection Dry-Run - No Production Write
```

### v28.0L-3N production projection dry-run operator note

v28.0L-3N adds a deterministic local projection dry-run for the future production `externalAiInterpretationLayer` contract.

Operator guidance:

- Run `npm run check:external-ai-production-projection` before any future production write design.
- The projection artifact is for validation only.
- Do not copy `manual-artifacts/external-ai/external-ai-production-projection-latest.json` into `data/`.
- Do not manually insert `externalAiInterpretationLayer` into `data/radar-data.json`.
- Do not enable frontend display from the projection artifact.
- Production write remains NO-GO until a separate explicitly approved L-3O phase.
- Frontend display remains NO-GO.
- Daily and automatic provider calls remain NO-GO.

Recommended next stage:

```text
v28.0L-3O First Controlled Production Write Design - No Frontend Display
```

### v28.0L-3O first controlled write guard operator note

v28.0L-3O adds first controlled production write design and a read-only guard.

Operator guidance:

- Run `npm run check:external-ai-production-write-guard` before any future first-write task.
- Do not manually edit `data/radar-data.json`.
- Do not manually copy projection artifacts into `data/`.
- The first write must be data-only, no frontend, no workflow change, no Daily integration, and no automatic provider call.
- The first write must be a separate explicitly approved PR.
- Rollback is reverting that isolated PR.
- If the guard fails, stop and resolve the NO-GO signal before any further write planning.

Recommended next stage:

```text
v28.0L-3P First Controlled Production Write - Data Only / No Frontend Display
```

only after explicit user approval.

### v28.0L-3P first controlled production write operator note

v28.0L-3P writes the first production `externalAiInterpretationLayer` into `data/radar-data.json` from approved run `25598887574`.

Operator guidance:

- Do not manually edit `externalAiInterpretationLayer`.
- Use `npm run write:external-ai-production` and validators for any future data-layer edit.
- Run `npm run check:external-ai-production-contract -- data/radar-data.json` after any future edit.
- Run `npm run check:external-ai-production-write-guard` after any future edit.
- Frontend display remains disabled; do not set `displayEnabled=true`.
- Do not copy new artifacts into `data/` by hand.
- Rollback is reverting the first write PR.

Recommended next stage:

```text
v28.0L-3P-1 First Production Write Audit Sync - No Frontend Display
```

### v28.0L-3P-1 first production write audit-sync operator note

v28.0L-3P-1 records that the first controlled production write is stable after post-merge audit.

Operator guidance:

- Production `externalAiInterpretationLayer` now exists in `data/radar-data.json`.
- The layer is not displayed: `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`.
- Do not manually edit `externalAiInterpretationLayer`.
- Future updates must use the validator/write flow.
- Run `npm run check:external-ai-production-contract -- data/radar-data.json` after any future layer edit.
- Run `npm run check:external-ai-production-write-guard` after any future layer edit.
- Frontend display requires a separate approved frontend PR.
- Rollback remains reverting the first write PR.

Recommended next stage:

```text
v28.0L-3Q External AI Frontend Display Design - No Display Yet
```

### v28.0L-3Q frontend display design operator note

v28.0L-3Q documents a future read-only frontend display design. It does not add frontend code and does not approve visible display.

Operator guidance:

- Do not set `displayEnabled=true` manually.
- Do not set `boundaries.frontendDisplayApproved=true` manually.
- Do not manually edit `externalAiInterpretationLayer`.
- Frontend display must be a separate explicitly approved PR.
- Future user-facing external AI copy must be Chinese and must remain non-actionable.
- If an external AI panel appears before approval, revert the display change immediately.
- Do not shrink or embed into Global Risk Heatmap.

Recommended next stage:

```text
v28.0L-3R External AI Frontend Display Scaffold - Hidden by Default
```

### v28.0L-3R hidden frontend scaffold operator note

(Historical, pre-L-3T) v28.0L-3R adds guarded frontend read/render scaffolding, but the external AI panel remains hidden because current production data has `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`. Superseded by L-3T visible display flag enablement.

Operator guidance:

- Run `npm run check:external-ai-frontend-hidden-scaffold` after any future external AI frontend scaffold change.
- Do not manually set `displayEnabled=true`.
- Do not manually set `boundaries.frontendDisplayApproved=true`.
- If an external AI panel appears before explicit visible-display approval, revert the display change immediately.
- Keep Global Risk Heatmap layout unchanged.
- Visible display requires a separate explicitly approved PR.

Recommended next stage:

```text
v28.0L-3S External AI Visible Display Approval + Data Flag Design - No Automatic Provider Call
```

### v28.0L-3S visible display approval operator note

v28.0L-3S documents the approval and data-flag process for a future visible external AI panel. It does not enable visible display.

Operator guidance:

- Do not set `displayEnabled=true` manually.
- Do not set `boundaries.frontendDisplayApproved=true` manually.
- Future visible-display flag enablement should be data-only where possible.
- No provider call is needed just to make the current layer visible.
- Do not rerun DeepSeek for visible display flag enablement.
- Do not add automatic provider calls or Daily integration for visible display.
- Preserve Global Risk Heatmap layout.

Recommended next stage:

```text
v28.0L-3T External AI Visible Display Flag Enablement - Data Only / No Provider Call
```

### v28.0L-3T visible display flag operator note

v28.0L-3T enables the external AI panel through the approved data flags. The existing scaffold may now render the current production layer.

Operator guidance:

- Do not manually edit external AI text content.
- Do not rerun the provider just for display.
- Do not add automatic provider calls or Daily integration.
- Rollback is reverting this PR or setting `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`.
- If unsafe copy appears, revert immediately.
- If Global Risk Heatmap layout changes, revert immediately.
- Future content refresh remains a separate provider/artifact/update phase.

Recommended next stage:

```text
v28.0L-3T-1 Visible Display Audit Sync - No Provider Call
```

### v28.0L-3T-1 visible display audit-sync operator note

v28.0L-3T-1 records that the visible display flags are enabled and post-merge checks passed.

Operator guidance:

- The external AI panel may now appear on the site.
- Do not manually edit external AI text content.
- Do not rerun the provider just for display.
- Rollback is reverting the L-3T PR or setting `displayEnabled=false` and `boundaries.frontendDisplayApproved=false`.
- If unsafe copy appears, revert immediately.
- If Global Risk Heatmap layout changes, revert immediately.
- Do not add automatic provider calls or Daily integration for visible display.

Recommended next stage:

```text
v28.0L-3U External AI Visible Display UX Polish - No Provider Call
```

### v28.0L-3U visible display UX polish operator note

v28.0L-3U polishes the external AI read-only panel UI only. It does not update provider content, production data, or provider automation.

Operator guidance:

- Treat this as visual-only polish.
- Do not manually edit external AI text content.
- Do not rerun the provider for UX polish.
- Do not add automatic provider calls or Daily integration.
- If the panel layout appears too large, adjust the UI only.
- If Global Risk Heatmap layout changes, revert or adjust the UI immediately.
- Keep scoring / decision / execution / position logic unchanged.

Recommended next stage:

```text
v28.0L-3U-1 Visible Display UX Audit Sync - No Provider Call
```

### v28.0L-3U-1 visible display UX audit-sync operator note

v28.0L-3U-1 records that the external AI read-only panel is visible, polished, and audited.

Operator guidance:

- Do not manually edit external AI text content.
- Do not rerun the provider just for UX polish.
- Do not add automatic provider calls without a separate approved task.
- Roll back a UX-only issue by reverting L-3U.
- If display must be disabled, revert L-3T or set `displayEnabled=false` and `boundaries.frontendDisplayApproved=false` through an approved data update.
- If unsafe copy appears, revert immediately.
- If Global Risk Heatmap layout changes, revert immediately.
- Keep scoring / decision / execution / position logic unchanged.

Optional future stage:

```text
v28.0L-4A External AI Manual Refresh Workflow Design - No Automatic Provider Call
```

### v28.0L-4A production refresh workflow runbook

v28.0L-4A adds the first production refresh workflow for the visible external AI read-only panel.

Schedule:

- Workflow: `External AI Production Refresh`.
- Daily schedule: `23:50 UTC`.
- The schedule is intended to run after the current data generation time around `23:29 UTC`.
- Do not add additional schedules.

Required GitHub environment:

- Environment name: `external-ai-production-refresh`.
- Environment secret: `DEEPSEEK_API_KEY`.
- For true automatic daily refresh, this environment must not require manual reviewers. If required reviewers are configured, scheduled runs wait for approval and are not fully automatic.

Manual refresh:

```bash
gh workflow run "External AI Production Refresh" \
  -f input_source=local_compact \
  -f allow_network=true \
  -f acknowledge_cost=true \
  -f validate_output=true \
  -f timeout_ms=120000
```

Refresh behavior:

- Builds local compact input from current site data.
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

### v28.0L-4A-1 production refresh workflow audit sync

v28.0L-4A-1 records the first successful manual run of `External AI Production Refresh`.

Audit result:

- Run ID: `25611392014`.
- Trigger: `workflow_dispatch`.
- Workflow status: success.
- DeepSeek provider call: success.
- External AI output validation: PASS.
- DeepSeek manual API test: PASS.
- Quality review: PASS with `recommendation=pass_for_manual_review` and `promotionEligible=false`.
- Production projection: PASS.
- Production contract validation on projection: PASS.
- Artifact sanitizer: PASS.
- Artifact upload: success.
- Artifact name: `external-ai-production-refresh-25611392014`.
- Artifact ID: `6898516584`.
- Artifact retention: 3 days.
- Production write: PASS with `productionDataWritten=true`.
- Frontend display state: `frontendDisplayChanged=false`, `displayEnabled=true`, `promotionEligible=false`.
- Final production contract validation: PASS.
- Production write guard: PASS.
- Frontend scaffold check: PASS.
- `check:data`: PASS.
- `check:all`: PASS.
- Protected path assertion: PASS.
- Commit back to main: success.

Workflow commit:

- Commit: `c32af65 chore: refresh external AI interpretation layer`.
- Runtime diff: only `data/radar-data.json` changed.
- Diff size: 1 file changed, 33 insertions, 37 deletions.
- No `manual-artifacts/` files were committed.
- No frontend, workflow, script, package, config, realtime, or Worker files changed.

Post-refresh local audit:

- `git pull` updated `main` from `a75728f` to `c32af65`.
- `npm run check:external-ai-production-contract -- data/radar-data.json`: PASS.
- `npm run check:external-ai-production-write-guard`: PASS.
- `npm run check:external-ai-frontend-hidden-scaffold`: PASS.
- `npm run check:data`: PASS.
- `npm run check:all`: PASS.
- `git diff --check`: PASS.
- `git status --short`: clean.

Operational notes:

- The daily `23:50 UTC` production refresh schedule is ready to operate through `External AI Production Refresh`.
- Rollback is reverting commit `c32af65` or rerunning a validated refresh when that is the appropriate operator action.
- Do not manually edit `externalAiInterpretationLayer` or any external AI generated text in `data/radar-data.json`.
- Do not add extra schedules, retry loops, or provider refresh paths without explicit approval.

### v28.0L-4B external AI display coverage polish operator note

v28.0L-4B is frontend-only display coverage polish for the already-visible external AI read-only panel.

Operator guidance:

- The panel reveals more of the existing validated `externalAiInterpretationLayer` through capped, safe summaries.
- It does not refresh, rewrite, or alter AI-generated text.
- Do not rerun DeepSeek or `External AI Production Refresh` just for display coverage.
- Do not edit `data/radar-data.json` to make the panel shorter or longer.
- If the panel becomes too long, reduce caps in `scripts/modules/renderExternalAi.js` rather than editing AI text.
- Keep raw provider output, raw provenance, run IDs, artifact IDs, and internal diagnostics hidden from normal display.
- Keep Global Risk Heatmap layout, scoring, decision, execution, and position logic unchanged.

### v28.0L-4B-1 display coverage audit-sync operator note

v28.0L-4B-1 records that external AI panel display coverage is complete for the current safe fields.

Operator guidance:

- Display coverage remains frontend-only.
- It reveals more of the existing validated production `externalAiInterpretationLayer`.
- Do not edit AI text manually.
- Do not rerun the provider just for display coverage.
- If the panel becomes too long, reduce display caps in `scripts/modules/renderExternalAi.js` in a future frontend-only PR.
- If unsafe copy appears, revert immediately.
- If Global Risk Heatmap layout is affected, revert immediately.
- `External AI Production Refresh` remains the only approved automatic provider path.

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

Ordinary radar data refresh must preserve the current production `externalAiInterpretationLayer`. `External AI Production Refresh` remains the only approved automatic path for changing external AI content.

If `check:external-ai-production-write-guard` fails after a `chore: refresh radar data` commit:

- Inspect `data/radar-data.json.externalAiInterpretationLayer`.
- Check whether `displayEnabled`, `boundaries.frontendDisplayApproved`, and `qualityReview.promotionEligible=false` were lost or malformed.
- Run `npm run check:external-ai-production-contract -- data/radar-data.json`.
- Run `npm run check:external-ai-frontend-hidden-scaffold`.
- Do not manually edit external AI generated text.
- Do not call DeepSeek or rerun the provider just to repair ordinary refresh damage.
- Repair by preserving the last valid production external AI layer from git history, or rerun the approved `External AI Production Refresh` only after the preservation bug is fixed and operator review says a refresh is appropriate.

Rollback and repair boundaries:

- A normal radar refresh may update current market and radar fields, but must carry forward the existing valid external AI layer unchanged.
- If unsafe copy appears or display gates are malformed, revert the damaging data refresh or restore the latest contract-valid layer.
- Treat the known non-blocking `check:world-order` warning as separate from external AI preservation when `check:all` passes.

### v28.0M-3H-1 preservation hotfix audit-sync operator note

v28.0M-3H-1 records that the preservation hotfix passed post-merge audit after PR #118.

Operator guidance:

- If `check:external-ai-production-write-guard` fails after `chore: refresh radar data`, first inspect whether ordinary radar refresh preserved `externalAiInterpretationLayer`.
- Ordinary radar refresh should not overwrite `externalAiInterpretationLayer` with the disabled scaffold.
- Do not manually edit external AI generated text.
- Do not rerun the provider repeatedly to repair ordinary radar refresh damage.
- `External AI Production Refresh` remains the only approved automatic path for changing external AI content.
- Allowed rollback path is reverting the faulty radar refresh or restoring the last valid `externalAiInterpretationLayer` only through an approved hotfix.
- Continue treating the known `check:world-order` warning as non-blocking when `check:all` passes.

### v28.0M-4 macro overview structure audit-sync operator note

v28.0M-4 records that the Macro Overview structure line is stable after the M-1 skeleton, M-2 calibration, M-3 unified judgment structure, and M-3H preservation hotfix.

Operator guidance:

- The macro overview is now the first read path for judgment, pressure sources, signal layers, macro drivers, market temperature waiting state, risk engines, and cross-validation.
- If future ordinary radar refresh fails external AI guards, inspect `externalAiInterpretationLayer` preservation first.
- Do not manually edit external AI generated text.
- Do not proceed to Market Pricing Temperature implementation until the historical weekly data source is separately designed.
- Do not fabricate Nasdaq / QQQ / MA60 / standard deviation / z-score values.
- Global Risk Heatmap must remain a standalone large section.
- `External AI Production Refresh` remains the only approved automatic path for changing external AI content.

### v28.0M-5 market pricing temperature design operator note

v28.0M-5 documents the Market Pricing Temperature data-source plan only. The module is not active yet.

Operator guidance:

- Do not manually enter Nasdaq / QQQ / NDX values.
- Do not use fake history.
- Do not interpret the waiting-for-history state as bearish or bullish.
- Do not calculate MA60, standard deviation, or z-score until validated weekly history exists.
- Do not treat +2σ as a top or -2σ as a bottom in future UI copy.
- Future data-source changes require a dedicated validator and audit trail.
- Market Pricing Temperature must remain display-only until a separate approved phase changes that boundary.

### v28.0M-6 market pricing history scaffold operator note

v28.0M-6 adds a scaffold-only market pricing history contract and validator.

Operator guidance:

- Do not manually edit `data/market-pricing-history.json` records.
- Do not paste Nasdaq / QQQ / NDX values manually.
- `npm run check:market-pricing-history` must pass.
- If the scaffold file has records before an approved fetch implementation, treat it as invalid.
- SPX is fallback candidate only and must not be displayed as Nasdaq / QQQ temperature.
- Market temperature UI should remain waiting-for-history.
- Future source work should start as dry-run or artifact-only before any production data write.

### v28.0M-7 market pricing source adapter dry-run operator note

v28.0M-7 adds a local-only dry-run source adapter scaffold.

Operator guidance:

- `npm run market-pricing:source-adapter:dry-run` is safe to run locally.
- The dry-run does not call external sources.
- The dry-run does not write `data/market-pricing-history.json`.
- The dry-run report is written under ignored `manual-artifacts/market-pricing/`.
- `npm run check:market-pricing-source-adapter-dry-run` must pass.
- If a future adapter fetch is added, it must be artifact-only first.
- Do not manually paste market data into `data/market-pricing-history.json` or `data/radar-data.json`.

### v28.0M-8 market pricing artifact-only fetch design operator note

v28.0M-8 documents the future artifact-only fetch path. It does not fetch market data and does not write production data.

Operator guidance:

- Future artifact-only fetch output must be validated before any history write.
- If artifact fetch fails, do not manually paste data into `data/market-pricing-history.json`.
- If artifact validation fails, keep Market Pricing Temperature waiting-for-history.
- If fewer than 60 weekly observations are available, Market Pricing Temperature remains waiting.
- Do not retry sources automatically or add automation without approval.
- Do not treat SPX fallback candidate output as Nasdaq / QQQ temperature.
- `npm run check:market-pricing-artifact-fetch-design` must pass.

### v28.0M-9 market pricing artifact fetch scaffold operator note

v28.0M-9 adds a local scaffold command for future artifact fetch reporting. It still does not fetch market data and does not write production data.

Operator guidance:

- `npm run market-pricing:artifact-fetch:scaffold` is safe to run locally.
- The scaffold writes only `manual-artifacts/market-pricing/artifact-fetch-scaffold-latest.json`.
- If `--allow-network` is supplied, the script still rejects network access in v28.0M-9.
- Do not manually paste scaffold output into `data/market-pricing-history.json` or `data/radar-data.json`.
- Do not manually add QQQ / NDX / IXIC weekly records.
- Do not treat SPX fallback candidate output as Nasdaq / QQQ temperature.
- Future live fetch requires separate approval and an artifact sanitizer.
- `npm run check:market-pricing-artifact-fetch-scaffold` must pass.

### v28.0M-10 market pricing artifact sanitizer scaffold operator note

v28.0M-10 adds a local sanitizer scaffold command for future market pricing artifacts. It does not fetch market data and does not write production data.

Operator guidance:

- `npm run market-pricing:artifact-sanitizer:scaffold` is safe to run locally.
- The sanitizer writes only `manual-artifacts/market-pricing/artifact-sanitizer-scaffold-latest.json`.
- A valid scaffold fixture can pass only with `readyForProductionWrite=false`.
- Invalid fixtures must be rejected, not repaired by manually editing `data/market-pricing-history.json`.
- Do not manually paste sanitizer reports into `data/market-pricing-history.json` or `data/radar-data.json`.
- Do not manually add QQQ / NDX / IXIC weekly records.
- If sanitizer rejects an artifact, do not override by editing data files.
- Future live fetch must remain artifact-only until sanitizer and history writer stages are separately approved.
- `npm run check:market-pricing-artifact-sanitizer-scaffold` must pass.

### v28.0M-11 market pricing real-record contract design operator note

v28.0M-11 documents the future real-record contract for market pricing artifacts. It does not fetch market data and does not write production data.

Operator guidance:

- Do not manually add real records.
- Do not paste QQQ / NDX / IXIC / SPX history into `data/market-pricing-history.json`.
- Do not treat `docs/fixtures/market-pricing/real-record-contract-design-v28.0M-11.json` as data.
- Future artifacts with real records must remain artifact-only until sanitizer and production-write PRs are approved.
- Future calculation review requires at least 60 validated weekly observations and a separate approved PR.
- `npm run check:market-pricing-real-record-contract-design` must pass.

### v28.0M-12 market pricing real-record sanitizer scaffold operator note

v28.0M-12 extends the sanitizer scaffold so it can validate synthetic real-record-like fixtures only. It does not fetch market data and does not write production data.

Operator guidance:

- `npm run market-pricing:real-record-sanitizer:scaffold` is safe to run locally.
- The sanitizer writes only ignored reports under `manual-artifacts/market-pricing/`.
- Do not use the scaffold to import real market data.
- If real artifacts appear, keep them under `manual-artifacts/market-pricing/` and do not write data files.
- Do not manually add QQQ / NDX / IXIC / SPX weekly records.
- If the sanitizer rejects an artifact, do not override it by editing production data.
- No production history write is allowed until an explicit approved history writer PR exists.
- `npm run check:market-pricing-real-record-sanitizer-scaffold` must pass.

### v28.0M-13 market pricing source selection review operator note

v28.0M-13 reviews candidate assets and sources only. It does not approve or run a source fetch.

Operator guidance:

- Do not run source fetch from source selection review.
- Do not manually approve source candidates by editing fixtures or data files.
- Source-specific proof-of-source requires a later approved PR.
- If source licensing, compliance, stability, symbol mapping, or adjustedClose availability is uncertain, keep `liveFetchApproved=false`.
- Do not paste market history into `data/market-pricing-history.json`.
- Do not treat SPX fallback review as Nasdaq / QQQ temperature.
- `npm run check:market-pricing-source-selection-review` must pass.

### v28.0M-14 market pricing proof-of-source design operator note

v28.0M-14 designs a future source-specific proof-of-source path. It does not approve or run Stooq, Yahoo-style, FRED, or licensed-source fetches.

Operator guidance:

- Do not run source fetch from proof-of-source design.
- Do not manually approve Stooq, Yahoo-style, FRED, or future licensed sources.
- Do not paste source-specific proof data into `data/market-pricing-history.json` or other data files.
- The next source-specific artifact scaffold must keep network disabled unless a later approved task explicitly changes that boundary.
- Keep QQQ target metadata separate from real records and prices.
- Do not treat SPX fallback review as Nasdaq / QQQ temperature.
- `npm run check:market-pricing-proof-of-source-design` must pass.

### v28.0M-15 market pricing source-specific artifact fetch scaffold operator note

v28.0M-15 adds a local source-specific scaffold with network disabled. It does not approve or run Stooq / public CSV, Yahoo-style, FRED, or licensed-source fetches.

Operator guidance:

- `npm run market-pricing:source-specific-artifact-fetch:scaffold` is safe to run locally because network is disabled.
- The scaffold writes only ignored reports under `manual-artifacts/market-pricing/`.
- Do not pass `--allow-network` expecting a fetch; the current version rejects it.
- Do not manually paste scaffold reports into `data/market-pricing-history.json` or `data/radar-data.json`.
- Do not manually approve source candidates by editing fixtures or data files.
- Do not add QQQ / NDX / IXIC / SPX prices or weekly records.
- `npm run check:market-pricing-source-specific-artifact-fetch-scaffold` must pass.

### v28.0M-15A unified data pipeline architecture operator note

v28.0M-15A records that future market-pricing source work must join the existing unified data architecture.

Operator guidance:

- Daily GitHub Actions is the slow / historical / production write layer.
- Cloudflare Worker is the primary realtime fast-variable layer, with approximately 3-minute cadence.
- GitHub Actions backup validation is the backup / check layer, with approximately six checks per hour where configured.
- Market Pricing History must not be manually written.
- Backup checks must not bypass sanitizer.
- New source requests must declare `assignedLayer` before implementation.
- Valid `assignedLayer` values are `daily_history_layer`, `realtime_worker_layer`, `github_actions_backup_validation_layer`, `artifact_sanitizer_layer`, and `frontend_display_layer`.
- Do not create standalone or ad hoc data pipelines.
- `npm run check:unified-data-pipeline-architecture` must pass.

### v28.0M-16 market pricing network gate design operator note

v28.0M-16 defines the future source-specific network gate but does not allow network use.

Operator guidance:

- Do not set approval flags manually.
- Do not set `networkGateApproved=true`, `networkGateOpen=true`, or `networkAllowed=true`.
- Do not add source URLs, endpoints, secrets, headers, cookies, or auth tokens.
- Do not write `data/market-pricing-history.json` from source-specific fetch.
- Do not use the network gate to bypass sanitizer.
- Future live fetch requires a separate approved PR.
- `npm run check:market-pricing-network-gate-design` must pass.

### v28.0M-17 market pricing network gate scaffold operator note

v28.0M-17 adds a local closed-gate scaffold report and checker. It still does not approve source use, live fetch, network access, production writes, history writes, or Market Pricing Temperature calculation.

Operator guidance:

- `npm run market-pricing:network-gate:scaffold` is safe to run locally; it writes only under `manual-artifacts/market-pricing/`.
- Passing `--allow-network` must remain rejected in the scaffold report.
- Required rejection reasons are `source_not_approved`, `live_fetch_not_approved`, and `network_gate_not_approved`.
- Do not add source URLs, endpoints, secrets, headers, cookies, auth tokens, or provider calls.
- Do not write `data/radar-data.json` or `data/market-pricing-history.json`.
- Keep records empty and Market Pricing Temperature waiting-for-history.
- `npm run check:market-pricing-network-gate-scaffold` must pass.

### v28.0M-18 market pricing source compliance review scaffold operator note

v28.0M-18 adds a local source compliance review scaffold. Compliance review status remains `not_reviewed`; the scaffold does not approve compliance, source use, live fetch, network access, production writes, history writes, or Market Pricing Temperature calculation.

Operator guidance:

- `npm run market-pricing:source-compliance-review:scaffold` is safe to run locally; it writes only under `manual-artifacts/market-pricing/`.
- Passing `--mark-reviewed` must remain rejected in the scaffold report.
- Required rejection reasons are `compliance_review_requires_manual_human_review`, `scaffold_cannot_auto_approve_compliance`, and `source_not_approved`.
- Keep all seven compliance checklist items false.
- Do not add actual compliance answers, source URLs, endpoints, secrets, headers, cookies, auth tokens, or provider calls.
- Do not write `data/radar-data.json` or `data/market-pricing-history.json`.
- Keep records empty and Market Pricing Temperature waiting-for-history.
- `npm run check:market-pricing-source-compliance-review-scaffold` must pass.

### v28.0M-19 market pricing symbol mapping verification design operator note

v28.0M-19 adds a design layer for future symbol mapping verification. It does not add an executable scaffold script, and it does not verify or approve any mapping.

Operator guidance:

- `npm run check:market-pricing-symbol-mapping-verification-design` must pass.
- `scripts/market-pricing/symbol-mapping-verification-design.mjs` must not exist.
- Keep `symbolMappingVerified=false`, `symbolMappingVerificationStatus="not_verified"`, and `symbolMappingApproved=false`.
- Treat QQQ as a recorded candidate only, not an approved symbol.
- Keep all six verification checklist items false until separate manual approval.
- Keep `noSpxSubstitution=true`; SPX must never substitute for Nasdaq / QQQ temperature.
- Do not add provider URLs, source URLs, endpoints, secrets, headers, cookies, auth tokens, provider calls, live fetch, production writes, or history writes.
- Keep records empty and Market Pricing Temperature waiting-for-history.

### v28.0M-20 market pricing source format verification design operator note

v28.0M-20 adds a design layer for future source format verification. It does not add an executable scaffold script, and it does not verify or approve any source format.

Operator guidance:

- `npm run check:market-pricing-source-format-verification-design` must pass.
- `scripts/market-pricing/source-format-verification-design.mjs` must not exist.
- Keep `sourceFormatVerified=false`, `sourceFormatVerificationStatus="not_verified"`, and `sourceFormatApproved=false`.
- Keep all seven source format verification checklist items false until separate manual approval.
- Keep `noPriceFabrication=true`; missing prices must remain missing and must never be interpolated, extrapolated, or copied forward.
- Keep `noHtmlErrorPageMasquerade=true`; HTML error pages must never be parsed as CSV.
- Do not add provider URLs, source URLs, endpoints, secrets, headers, cookies, auth tokens, provider calls, live fetch, production writes, or history writes.
- Keep records empty and Market Pricing Temperature waiting-for-history.

### v28.0M-21 market pricing network open throttled operator note

v28.0M-21 adds the first M-series command that can run `fetch()`, but only for manual, throttled, audit-only source inspection.

Operator guidance:

- `npm run market-pricing:network-open-throttled:dry-run` is safe to run locally because the network stays closed.
- Do not run `--network=open-throttled` from CI or automated workflows.
- A manual throttled-open run may fetch only the manifest source at `docs/fixtures/market-pricing/network-open-throttled-manifest-v28.0M-21.json`.
- The manifest contains exactly one allowed source: Stooq public CSV for QQQ.
- Runtime limits are max 1 fetch per invocation, 30s timeout, and max 1 retry.
- M-20 format validation must pass before the fetched body is written as an artifact.
- Response artifacts must remain under `manual-artifacts/market-pricing/network-fetch-attempts/` and must not be committed.
- Do not paste fetched CSV into `data/market-pricing-history.json` or `data/radar-data.json`.
- Keep `records=[]`, `sourceApproved=false`, `liveFetchApproved=false`, `sourceComplianceReviewed=false`, `symbolMappingVerified=false`, and `sourceFormatVerified=false`.
- Do not calculate MA60, standard deviation, z-score, bands, or Market Pricing Temperature.
- `npm run check:market-pricing-network-open-throttled-scaffold` must pass and must not open the network.

### v28.0M-22 market pricing manual weekly input sanitizer design operator note

v28.0M-22 records the route fork after the 2026-05-12 Stooq endpoint change. The M-21 auto-fetch path is deprecated, and manual NASDAQ weekly download is the short-term source path.

Operator guidance:

- `npm run check:market-pricing-manual-weekly-input-sanitizer-design` must pass.
- M-22 is design only; `scripts/market-pricing/manual-weekly-input-sanitizer-design.mjs` must not exist.
- Future weekly QQQ history files should be placed manually under `manual-artifacts/market-pricing/manual-weekly-input/`.
- The intended manual source is the NASDAQ official QQQ historical data page.
- Do not paste downloaded files into `data/market-pricing-history.json` or `data/radar-data.json`.
- Do not run M-21 Stooq auto-fetch unless a later approved source reactivation changes the manifest status.
- Keep `sourceApproved=false`, `liveFetchApproved=false`, `sourceComplianceReviewed=false`, `symbolMappingVerified=false`, and `sourceFormatVerified=false`.
- Keep records empty and Market Pricing Temperature waiting-for-history.
- Do not calculate MA60, standard deviation, z-score, bands, or Market Pricing Temperature.

### v28.0M-23 market pricing manual weekly input sanitizer scaffold operator note

v28.0M-23 adds the executable Manual Weekly Input Sanitizer scaffold. It reads NASDAQ CSV files placed in `manual-artifacts/market-pricing/manual-weekly-input/` and writes sanitized review artifacts only under `manual-artifacts/market-pricing/sanitized-output/`.

Operator guidance:

- Use `npm run market-pricing:manual-weekly-input-sanitizer:dry-run` first.
- Use `npm run market-pricing:manual-weekly-input-sanitizer:run` only after dry-run output is acceptable.
- Do not commit files under `manual-artifacts/`.
- Do not copy scaffold output into `data/market-pricing-history.json`; M-24 is the first approved history-write step.
- Do not add live fetch, workflow automation, MA60, standard deviation, z-score, bands, or Market Pricing Temperature calculation.
- Keep records out of production data and Market Pricing Temperature waiting-for-history.
- `npm run check:market-pricing-manual-weekly-input-sanitizer-scaffold` must pass.

### v28.0M-7U homepage IA de-duplication operator note

v28.0M-7U makes Macro Risk Overview the single primary homepage judgment and moves Daily Brief into raw evidence / source detail.

Operator guidance:

- If users report duplicate judgment modules, run `npm run check:homepage-ia-contract`.
- Do not manually edit generated Daily Brief, AI, decision, execution, or position content to fix UX confusion.
- Use grouping, collapsible detail sections, or copy around static section headings instead.
- External AI remains a read-only auxiliary explanation and must keep display gates.
- Global Risk Heatmap remains standalone and not collapsed by default.
- Current frontend asset cache version is `28.0M-47V`.

### v28.0M-7V homepage reading path operator note

v28.0M-7V repairs the homepage reading path without changing data, workflows, generated AI text, or scoring / decision / execution / position logic.

Operator guidance:

- Top navigation must map to real visible content sections in this order: 今日总判断 → 压力来源 → 信号分层 → 四大驱动 → 市场温度 → 风险引擎 → 交叉验证 → 风险热力图 → 详细数据 → 方法说明.
- No nav item may land on an empty heading or abstract divider.
- Macro Overview provides the primary conclusion / pressure / signal / driver / temperature / engine / cross-validation path.
- Daily Brief is evidence detail, not a second primary judgment.
- External AI remains auxiliary read-only explanation and must keep display gates.
- Global Risk Heatmap remains standalone, visible, and not collapsed.
- If users report clutter, adjust grouping and anchors, not generated content.

### v28.0M-7V-1 homepage reading path audit-sync operator note

v28.0M-7V-1 records that the homepage reading path repair is merged and post-merge audited.

Operator guidance:

- The homepage primary reading path is the 10-step nav: 今日总判断 → 压力来源 → 信号分层 → 四大驱动 → 市场温度 → 风险引擎 → 交叉验证 → 风险热力图 → 详细数据 → 方法说明.
- If users report confusing navigation, inspect `npm run check:homepage-ia-contract` before changing layout.
- Do not fix homepage UX by manually editing generated AI text, Daily Brief output, external AI text, or radar data.
- Macro Overview remains the primary conclusion / pressure / signal / driver / temperature / engine / cross-validation layer.
- Daily Brief remains evidence / source detail.
- External AI remains auxiliary read-only explanation.
- Global Risk Heatmap must remain standalone and visible.
- Known `check:world-order` warnings with partial freshness, stale GDELT, SIPRI manual-required, and ACLED not-configured remain non-blocking when `check:all` passes.

### v28.0N-1 editorial first-fold operator note

v28.0N-1 introduces an editorial first-fold homepage skin. It is frontend display layer only.

Operator guidance:

- Preserve the homepage reading path order and anchors protected by `npm run check:homepage-ia-contract`.
- Do not edit generated AI text, Daily Brief output, scoring, decision, execution, position, workflow, or data pipeline logic for the editorial skin.
- Market Pricing Temperature remains waiting-for-history; do not add market-pricing records or calculate MA60, standard deviation, z-score, bands, or temperature.
- External AI remains read-only auxiliary explanation and must keep its boundaries.

### v28.0N-2 editorial pressure-source operator note

v28.0N-2 introduces editorial pressure-source reading polish. It is frontend display layer only.

Operator guidance:

- Preserve `homepage-pressure-sources` and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Treat pressure-source status classes and count pills as display-only presentation.
- Do not edit generated AI text, Daily Brief output, scoring, decision, execution, position, workflow, or data pipeline logic for the pressure-source polish.
- Market Pricing Temperature remains waiting-for-history and must not be activated.

### v28.0N-3 editorial signal-layer operator note

v28.0N-3 introduces editorial signal-layer reading polish. It is frontend display layer only.

Operator guidance:

- Preserve `homepage-signal-layers` and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Treat signal bucket classes, summaries, count pills, and cards as display-only presentation.
- Do not edit generated AI text, Daily Brief output, scoring, signal judgment calculation, decision, execution, position, workflow, or data pipeline logic for the signal-layer polish.
- Market Pricing Temperature remains waiting-for-history and must not be activated.

### v28.0N-4 editorial paper/font operator note

v28.0N-4 introduces the editorial paper background and Bubble Watch-style font stack foundation. It is frontend display layer only.

Operator guidance:

- Do not add external font, CDN, image, or provider URLs for the paper/font foundation.
- Preserve the homepage reading path and anchors protected by `npm run check:homepage-ia-contract`.
- Preserve dark legacy panel readability while the lower dashboard remains only partially converted.
- Do not edit generated AI text, Daily Brief output, scoring, pressure or signal judgment calculation, decision, execution, position, workflow, or data pipeline logic.
- Market Pricing Temperature remains waiting-for-history and must not be activated.

### v28.0N-5 editorial macro-driver operator note

v28.0N-5 introduces editorial macro-driver reading polish. It is frontend display layer only.

Operator guidance:

- Preserve `homepage-macro-drivers` and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Keep growth, inflation, liquidity, and policy driver cards as rendered evidence only; do not change macro driver judgment calculation.
- Preserve the N-1 first fold, N-2 pressure section, N-3 signal section, N-4 paper/font foundation, homepage IA order, and anchors.
- Do not change scoring, decision, execution, position logic, data pipeline, workflows, External AI, or Market Pricing calculations.
- Market Pricing Temperature remains waiting-for-history and must not be activated.

### v28.0N-6 editorial market-temperature waiting-state operator note

v28.0N-6 introduces editorial Market Temperature waiting-state polish. It is frontend display layer only.

Operator guidance:

- Preserve `homepage-market-temperature` and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Keep Market Pricing Temperature waiting-for-history; do not infer market cold, normal, hot, or overheated status.
- Keep QQQ / Nasdaq weekly history, 60+ weeks, MA60, standard deviation, and z-score gaps visible.
- Do not add live fetch, market-pricing records, history writes, MA60, standard deviation, z-score, calculation, production writes, workflows, External AI changes, or scoring/decision/execution/position logic changes.

### v28.0N-7 editorial risk-engine operator note

v28.0N-7 introduces editorial risk-engine reading polish. It is frontend display layer only.

Operator guidance:

- Preserve `homepage-risk-engines` and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Keep risk-engine type/status classes, summaries, count pills, and cards as rendered evidence only; do not change risk-engine judgment calculation.
- Preserve evidence, missing evidence, and counter-evidence visibility.
- Do not convert risk mechanisms into trading advice or change scoring, decision, execution, position logic, data pipeline, workflows, External AI, or Market Pricing calculations.
- Market Pricing Temperature remains waiting-for-history and must not be activated.

### v28.0N-8 editorial cross-validation operator note

v28.0N-8 introduces editorial cross-validation reading polish. It is frontend display layer only.

Operator guidance:

- Preserve `homepage-cross-validation` and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Keep cross-validation status classes, summaries, count pills, and cards as rendered evidence only; do not change cross-validation judgment calculation.
- Preserve evidence, missing evidence, counter-evidence, noise warnings, and data gaps.
- Do not force macro conclusions from partial validation or change scoring, decision, execution, position logic, data pipeline, workflows, External AI, or Market Pricing calculations.
- Market Pricing Temperature remains waiting-for-history and must not be activated.

### v28.0N-9 editorial Global Risk Heatmap operator note

v28.0N-9 introduces editorial Global Risk Heatmap polish. It is frontend display layer only.

Operator guidance:

- Preserve `global-risk-heatmap`, `world-heatmap`, `heatmap-list`, and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Keep Global Risk Heatmap standalone and visually prominent as a visual evidence layer.
- Do not change heatmap scoring, region data calculation, data pipeline, workflows, External AI, Market Pricing, or decision/execution/position logic.
- Market Pricing Temperature remains waiting-for-history and must not be activated.

### v28.0N-10 editorial Detailed Data appendix operator note

v28.0N-10 introduces editorial Detailed Data appendix polish. It is frontend display layer only.

Operator guidance:

- Preserve `detail-data`, `risk-explainer`, and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Keep detailed data as a secondary audit appendix, not the first reading path.
- Keep realtime inputs, data health, charts, asset tables, execution/risk details, and collapsible panels available.
- Do not change data, charts, calculations, workflows, External AI, Market Pricing, scoring, decision, execution, or position logic.

### v28.0N-11 editorial Method / Evidence / Boundary appendix operator note

v28.0N-11 introduces editorial Method / Evidence / Boundary appendix polish. It is frontend display layer only.

Operator guidance:

- Preserve `method-evidence` and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Keep method content as a secondary explanatory appendix after Detailed Data.
- Keep Market Pricing Temperature waiting-for-history and External AI as read-only auxiliary explanation.
- Do not change data, charts, calculations, workflows, External AI, Market Pricing, scoring, decision, execution, or position logic.

### v28.0N-12 editorial External AI read-only panel operator note

v28.0N-12 introduces editorial External AI read-only panel polish. It is frontend display layer only.

Operator guidance:

- Preserve `external-ai-display-panel`, hidden / aria-hidden behavior, and the homepage reading path protected by `npm run check:homepage-ia-contract`.
- Keep External AI auxiliary and read-only.
- Do not change External AI generated text, provider path, workflow, output schema, production write, scoring, decision, execution, position logic, data pipeline, or Market Pricing calculations.
- Keep Market Pricing Temperature waiting-for-history.

### v28.0N-13 editorial inline dark theme cleanup operator note

v28.0N-13 cleans up residual dark inline theme styles in index.html so the editorial paper theme can apply consistently. It is frontend display layer only.

Operator guidance:

- Keep the warm paper background, Bubble Watch-style font stack variables, homepage IA order, and anchors intact.
- Do not add external font/CDN URLs.
- Keep External AI behavior and Market Pricing Temperature waiting-for-history unchanged.
- Do not change data, scoring, decision, execution, position logic, workflows, External AI behavior, or Market Pricing calculations.

### v28.0N-14 editorial Big Number and threshold scale operator note

v28.0N-14 deepens the editorial first-fold Big Number and threshold scale presentation. It is frontend display layer only.

Operator guidance:

- Preserve existing `stageFromScore` thresholds and score calculation.
- Keep threshold bands aligned to 0-50 / 50-65 / 65-85 / 85-100 unless the renderer semantics are separately changed in a reviewed logic PR.
- Keep Market Pricing Temperature waiting-for-history.
- Do not change data, workflows, External AI, Market Pricing, decision, execution, or position logic.

### v28.0N-15 editorial Key Changes and Watch List operator note

v28.0N-15 introduces editorial Key Changes and Watch List narrative blocks. It is frontend display layer only.

Operator guidance:

- Treat Key Changes and Watch List as narrative summaries of existing structured data, gaps, counter-evidence, and pending confirmations.
- Do not add data sources or convert pending/gap items into conclusions.
- Keep Market Pricing Temperature waiting-for-history.
- Do not change data, scoring, decision, execution, position logic, workflows, External AI behavior, or Market Pricing calculations.

### v28.0N-16 editorial redesign contract guard operator note

v28.0N-16 adds an editorial redesign contract guard. It is guard / validation layer only.

Operator guidance:

- Use `npm run check:editorial-redesign-contract` when touching the editorial homepage shell, macro overview renderer, or paper theme styles.
- The guard protects the Bubble Watch-inspired editorial structures, paper theme, Market Pricing waiting state, External AI read-only boundary, and Global Risk Heatmap standalone status.
- Do not treat the guard as approval to redesign UI or change data, scoring, decision, execution, position logic, workflows, External AI behavior, or Market Pricing calculations.

### v28.0M-24 market pricing first real record write operator note

v28.0M-24 adds the First Real Record Write scaffold with two-stage manual confirmation. The script defaults to dry-run-commit mode. The --commit-to-history flag is required to actually write data/market-pricing-history.json. 6 sanity checks run before any write. Atomic write via .tmp + rename. Idempotent. CI never invokes the :commit path. Market Pricing Temperature remains waiting-for-history at the frontend level until M-27. No MA60 / std / z-score calculation (M-26). No scoring / decision / execution / position change. No workflow change. No frontend change.

Operator guidance:

- Run `npm run market-pricing:first-real-record-write:dry-run` first and review the record count, date range, and preview.
- Run `npm run market-pricing:first-real-record-write:commit` only after the dry-run preview is accepted.
- Do not run the :commit path from CI or an automatic workflow.
- If a sanity check fails, do not manually patch data/market-pricing-history.json; fix the sanitized input and retry dry-run.
