# External AI Manual API Test Design

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Purpose / 目的

This document designs a future manual API test process for DeepSeek / OpenAI / external AI providers. Current production does not call external AI APIs, and the current `externalAiInterpretationLayer` remains disabled.

This document is not an implementation. It does not enable external AI, add secrets, add provider SDKs, add network calls, add frontend display, or change scoring, decision, execution, or position logic.

## 2. Current Baseline / 当前基线

The v28.0K-3D Stable Observation Audit passed with the recommendation that v28.0K-4 design-only manual API test planning may be considered.

Current baseline:

- Rule-based `aiInterpretationLayer` remains the interpretation baseline.
- `externalAiInterpretationLayer` is present in live data but disabled.
- `enabled=false`
- `status=disabled`
- `provider=none`
- `output=null`
- `externalAiGenerated=false`
- `usesExternalAiApi=false`
- no DeepSeek / OpenAI / external AI API is connected
- no scoring / decision / execution / position impact

## 3. Manual Test Philosophy / 手动测试原则

Manual API tests must be opt-in and disabled by default. They must not run in scheduled production workflows, must not modify `data/radar-data.json`, must not publish frontend output, and must not change scoring / decision / execution / position logic.

Manual API tests must use sample or explicitly prepared input only. They may produce local or artifact-only output. Every manual output must pass the external AI output validator before any future display consideration.

## 4. Provider Scope / Provider 范围

Future supported provider values are design-only:

- `deepseek`
- `openai`
- `none`

Provider metadata should include:

- `provider`
- `model`
- `endpointType`
- `generatedAt`
- `inputVersion`
- `timeoutMs`
- `sourceStatus`
- `externalAiGenerated=true` only for actual test output
- `usesExternalAiApi=true` only for actual manual test output

`provider=none` remains the production default. No provider is active in this PR.

## 5. Secrets and Environment Policy / Secrets 与环境变量策略

Future manual testing must follow these rules:

- Never commit secrets.
- Never commit `.env`.
- Never put API keys in data files.
- Never put API keys in docs examples.
- Missing secrets must result in a clean skip, not a failure, unless an explicitly required manual test is being run.

Future local manual tests may use environment variables such as:

- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`
- `EXTERNAL_AI_PROVIDER`
- `EXTERNAL_AI_MODEL`

If a future GitHub Actions manual test is ever added, it must use repository secrets and `workflow_dispatch` only. No scheduled workflow may call external AI by default.

## 6. Future Manual Input Design / 未来手动输入设计

Manual API test input should come from controlled files or generated sample input, not live production mutation.

Allowed future manual input sources:

- `docs/fixtures/external-ai/sample-input-v28.0K-1.json`
- a future generated local artifact under a non-production temp path
- a future manually prepared input artifact that excludes secrets and user private data

Forbidden input sources:

- secrets
- raw credentials
- personal financial account details
- unpublished local files
- unapproved external news/web data
- arbitrary GitHub logs
- production data mutation

## 7. Future Manual Output Design / 未来手动输出设计

Manual API test output must be written only to non-production locations, such as:

- local temp path
- GitHub Actions artifact
- logs / summary
- future ignored manual-test output folder

Manual output must not be committed by default.

Manual output must include:

- `contractVersion`
- `generatedAt`
- `provider`
- `model`
- `mode`
- `summaryZh`
- `facts`
- `inferences`
- `modelJudgments`
- `scenarioHypotheses`
- `dataGaps`
- `invalidationSignals`
- `sourceAttribution`
- `auditFlags`
- `confidence`
- `boundaries`

Manual output boundaries must include:

```json
{
  "displayOnly": true,
  "externalAiGenerated": true,
  "usesExternalAiApi": true,
  "affectsScoring": false,
  "affectsDecisionModel": false,
  "affectsExecutionLock": false,
  "affectsPositionGuidance": false,
  "notInvestmentAdvice": true
}
```

## 8. Validation Gate / 输出验证闸门

Every manual output must pass:

```bash
npm run check:external-ai-output path/to/output.json
```

When passing an argument through npm locally, use:

```bash
npm run check:external-ai-output -- path/to/output.json
```

The gate must reject banned copy, invalid JSON, missing source attribution, scoring / decision / execution / position overreach, investment advice, and deterministic crisis wording. If validation fails, output must be hidden and not promoted.

## 9. Fallback Design / 回退设计

If an API call fails, times out, hits a rate limit, returns invalid JSON, or fails validation:

- Do not write production data.
- Do not display output.
- Do not change `externalAiInterpretationLayer`.
- Continue using rule-based `aiInterpretationLayer`.
- Report failure as a manual test diagnostic.
- Keep production `externalAiInterpretationLayer` disabled.

## 10. Timeout / Rate Limit / Error Policy

Future manual implementation must define:

- `timeoutMs`
- retry count, preferably 0 or 1 for manual tests
- rate limit handling
- invalid JSON handling
- unsafe output handling
- provider unavailable handling

Recommended first manual defaults:

- `timeoutMs: 30000`
- `retries: 0`
- fail closed
- output hidden unless validator passes

## 11. Production Isolation / 生产隔离

Manual API tests must not:

- run in Daily pipeline
- run in Realtime pipeline
- run in Worker
- run in Pages deploy
- run in scheduled stable observation audit
- change `data/radar-data.json`
- change the live production `externalAiInterpretationLayer` field
- change frontend rendering
- change scoring / decision / execution / position

## 12. Future Implementation Ladder / 后续实施阶梯

- v28.0K-4A Design only
- v28.0K-4B Local manual test scaffold, disabled and no network by default
- v28.0K-4C Disabled provider adapter skeleton, no network and no provider calls
- v28.0K-4D DeepSeek manual API test to validator-gated artifact, no production display
- v28.0K-4E Live site manual input artifact
- v28.0K-4F Hidden diagnostic comparison, still no frontend
- v28.0K-4G Separate frontend comparison design review

### v28.0K-4B Local Dry-Run Scaffold

v28.0K-4B adds a local dry-run scaffold command only:

```bash
npm run manual:external-ai:dry-run
```

This command reads the non-production sample input fixture only for readiness inspection. It does not call a provider, does not use network, does not read API keys, does not read secrets, does not write production data, and does not affect frontend display.

The output is an `external_ai_manual_test_scaffold_report`, not external AI provider output. It must not be displayed, must not be committed as production data, and must not be treated as a replacement for the sample output fixture or live `externalAiInterpretationLayer`.

Production `externalAiInterpretationLayer` remains disabled. v28.0K-4C is required before any provider adapter may exist, and that adapter must be behind explicit review and an environment gate.

### v28.0K-4C Disabled Provider Adapter Skeleton

v28.0K-4C adds a provider adapter skeleton only. The skeleton recognizes `none`, `deepseek`, and `openai` as future provider values, but every adapter remains disabled and no-network.

Current K-4C boundaries:

- no provider call
- no network
- no API key read
- no secrets
- no provider SDK
- `deepseek` and `openai` are placeholders only and must be refused
- `provider=none` remains the only successful dry-run path
- output remains a scaffold report, not external AI provider output
- production `externalAiInterpretationLayer` remains disabled

Future real provider adapters require a separate reviewed PR. They must stay opt-in, validator-gated, isolated from production data, and must not affect scoring / decision / execution / position.

### v28.0K-4D DeepSeek Manual Artifact Test

v28.0K-4D adds the first real DeepSeek manual API call path. It is explicit opt-in only, artifact-only, validator-gated, and isolated from production.

Manual command:

```bash
npm run manual:external-ai:deepseek
```

Required gates:

- `--provider deepseek`
- `--allow-network`
- `--validate-output`
- safe `--output` path outside production / frontend / workflow directories
- `DEEPSEEK_API_KEY` present in the environment

The command uses the sample input fixture as explicit manual input and writes only to a manual artifact path such as `manual-artifacts/external-ai/deepseek-output-latest.json`. The `manual-artifacts/` directory is ignored by git, and manual DeepSeek output artifacts must not be committed. Artifacts are for local/manual review only; they must not be imported into `data/radar-data.json`, must not be treated as production data, and must not be displayed in the frontend.

OpenAI remains unsupported in v28.0K-4D. Production `externalAiInterpretationLayer` remains disabled and `provider=none`; the manual artifact path does not modify Daily, Worker, Pages deploy, scoring, decision, execution, or position logic.

### v28.0K-4D-1 DeepSeek JSON Mode Hardening

v28.0K-4D-1 keeps the same explicit DeepSeek manual artifact path but hardens JSON mode after an observed empty `message.content` response. The DeepSeek request disables thinking, increases `max_tokens`, and strengthens the system prompt so the provider is repeatedly instructed to return one valid JSON object with no markdown or explanation outside JSON.

Failure artifacts may include sanitized `responseDiagnostics` for review, including finish reason, message keys, content length, reasoning-content presence, usage keys, and a redacted provider error summary. The artifact remains manual-only and must not include API keys, request headers, or a full raw provider response.

This stage does not write production data, does not display external AI output in the frontend, and does not affect scoring, `decisionModel`, execution, or position logic.

### v28.0K-4D-2 DeepSeek Output Contract Prompt Tightening

v28.0K-4D-2 keeps the same explicit DeepSeek manual artifact path and tightens the prompt after a real manual artifact reached the validator but failed output contract checks.

Manual output `auditFlags` must be short neutral diagnostic tags such as `manual_artifact_only`, `sample_input_only`, `site_structured_data_only`, `validator_required`, `non_production_output`, or `no_frontend_display`. `auditFlags` must not contain prose safety sentences or investment / trading boundary wording. Boundary expression belongs in boolean fields such as `boundaries.notInvestmentAdvice=true`, not in `auditFlags`.

Manual output `sourceAttribution` must be an array of metadata objects, not a string and not an array of strings. Each object must include `sourceLayer`, `field`, `claimType`, and `noteZh`, and factual claims should map back to the provided structured input layers only. Manual artifacts must not claim external web, news, or market verification.

The validator remains strict. This stage does not weaken validation, does not write production data, does not display external AI output in the frontend, and does not affect scoring, `decisionModel`, execution, or position logic.

### v28.0K-4D-3 Source Attribution Keyword Alignment

v28.0K-4D-3 keeps the same manual DeepSeek artifact boundary and aligns prompt `sourceAttribution.noteZh` wording with the existing validator keyword rule. Sample/manual fixture based outputs should use wording such as `来自提供的样例结构化输入`, while future production site data outputs should include `站内结构化数据`.

This stage does not weaken the validator, does not write production data, does not display external AI output in the frontend, and does not affect scoring, `decisionModel`, execution, or position logic.

### v28.0K-4E Live Site Manual Input Artifact

v28.0K-4E adds a deterministic local builder for manual external AI input artifacts:

```bash
npm run manual:external-ai:build-input
```

The builder reads real site-structured radar data from local `data/radar-data.json` by default and writes only to `manual-artifacts/external-ai/manual-input-latest.json`. It may also read from an explicitly allowlisted live site `radar-data.json` URL when `--source-url` is provided. The live URL path is read-only, rejects non-allowlisted URLs, sends no secrets, and does not call DeepSeek / OpenAI / external AI APIs.

The generated input artifact remains manual-only, artifact-only, and non-production. It must not be committed, copied into `data/radar-data.json`, displayed in the frontend, or used to change scoring, `decisionModel`, execution, or position logic. Production `externalAiInterpretationLayer` remains disabled and continues to fallback to the rule-based `aiInterpretationLayer`.

DeepSeek remains a separate explicit manual command. The input builder itself does not read `DEEPSEEK_API_KEY`, does not read `OPENAI_API_KEY`, does not call DeepSeek, and does not write production data. Any manual DeepSeek output generated from this input must still pass `check:external-ai-output` before review.

### v28.0K-4E-1 Compact Live Input and Timeout Diagnostics

v28.0K-4E-1 adds compact manual input mode for live site-structured data:

```bash
npm run manual:external-ai:build-input:compact
```

Compact input keeps the same manual-only / artifact-only boundary, but limits large lists and omits historical arrays, chart arrays, raw recovery dumps, raw realtime dumps, verbose diagnostics, and full action queues. It preserves the explanation layers, disabled external AI scaffold state, compact decision context, data-health summary, risk-module summaries, and boundary flags needed for manual external AI explanation tests. The artifact declares `inputVersion = v28.0K-4E-1-live-site-manual-input-compact` and includes `compaction` metadata documenting omissions.

The manual DeepSeek runner also supports:

```bash
--timeout-ms 90000
```

The default manual DeepSeek timeout is 90000 ms, with an upper limit of 180000 ms. Timeout / abort failures must write a failure artifact with clearer wording and `requestDiagnostics`, including timeout, approximate input bytes/chars, provider, model, validation flag, and safe output status. Diagnostics must not include API keys, headers, or raw request bodies.

This stage does not run DeepSeek automatically, does not add production external AI, does not write production data, does not display external AI output in the frontend, and does not affect scoring, `decisionModel`, execution, or position logic.

### v28.0K-4E-2 Global Unsafe Wording Prompt Guard

v28.0K-4E-2 tightens the manual DeepSeek prompt after compact live input reached DeepSeek and returned an artifact, but validation failed because `modelJudgments` contained `交易建议`. The compact input and timeout diagnostics path worked; the remaining failure was output wording contract.

The prompt now applies the unsafe wording guard globally across all returned string fields, including `summaryZh`, `facts`, `inferences`, `modelJudgments`, `scenarioHypotheses`, `dataGaps`, `invalidationSignals`, `sourceAttribution.noteZh`, `auditFlags`, and `confidence.reasonZh`. Boundary statements must be expressed through the `boundaries` booleans instead of prose disclaimers.

The validator remains strict and unchanged. This stage does not write production data, does not display external AI output in the frontend, and does not affect scoring, `decisionModel`, execution, or position logic.

### v28.0K-4E-3 Live Data Semantics and Execution-Language Guard

v28.0K-4E-3 tightens semantics after a compact live-site DeepSeek artifact passed validation but quality review found sample wording and repeated execution / position details. The input builder now marks local and allowlisted live `radar-data.json` artifacts as `site_structured_data`, with sample flags set to false and compact artifacts marked as site-structured summaries.

The manual prompt now tells DeepSeek to use `来自站内结构化数据` and `claimType=site_structured_data` for live/local radar input, reserving sample wording only for sample fixtures. It also prevents repeating concrete execution / position fields from `decisionContext`; that layer may only be summarized as read-only system-state background. Confidence guidance is low but non-zero for live/local site structured input without external independent verification.

The validator remains strict and unchanged. This stage does not write production data, does not display external AI output in the frontend, and does not affect scoring, `decisionModel`, execution, or position logic.

### v28.0K-4E-4 Provider Failure Classification

v28.0K-4E-4 classifies manual provider failures in the failure artifact. HTTP 503 / `service_unavailable_error` is `provider_unavailable`, timeout / abort is `provider_timeout`, and other provider response failures receive normalized categories such as `provider_empty_content`, `provider_content_filter`, `provider_length_truncated`, `provider_insufficient_resource`, `provider_invalid_json`, or `provider_unknown_error`.

Provider unavailable and timeout failures are non-production provider availability issues. They should stop repeated paid calls and guide a later single retry, not trigger production recovery. Failure artifacts remain diagnostic-only and are not valid external AI output.

The output validator remains strict. If a failure artifact is passed to `check:external-ai-output`, it must fail with clear operator guidance instead of masquerading as a valid output.

### v28.0K-4F External AI Artifact Quality Review Gate

v28.0K-4F adds an offline manual quality gate:

```bash
npm run review:external-ai-artifact
```

The gate reviews an existing external AI output artifact or provider failure artifact. It checks semantic integrity, execution / position language, unsupported external market or news verification claims, source attribution coverage, confidence reasonableness, structure quality, incremental value over rule-based interpretation, and strict display-only boundaries.

This gate separates technical validation from product-quality eligibility. `check:external-ai-output` can pass while the quality review still returns `needs_prompt_revision` or `reject_for_promotion`. Provider failure artifacts return `provider_failure_only` and are not valid external AI output.

The review artifact remains manual-only and ignored under `manual-artifacts/`. `promotionEligible` must remain `false`; no output is promoted to production, displayed in the frontend, copied into data files, or connected to scoring / decision / execution / position logic.

### v28.0K-4G Stable Manual Test Baseline

v28.0K-4G baseline commands:

```bash
npm run manual:external-ai:build-input
npm run manual:external-ai:build-input:compact
```

The manual DeepSeek command remains explicit and paid; run only when an operator intentionally provides local `DEEPSEEK_API_KEY`:

```bash
node scripts/run-external-ai-manual-test.mjs --provider deepseek --input manual-artifacts/external-ai/manual-input-live-compact.json --output manual-artifacts/external-ai/deepseek-output-latest.json --allow-network --validate-output --timeout-ms 120000
```

Validate output:

```bash
npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json
```

Run quality review:

```bash
npm run review:external-ai-artifact
```

Provider-side failures are classified as diagnostic-only artifacts, including `provider_unavailable`, `provider_timeout`, and quality-review `provider_failure_only`.

Passing `check:external-ai-output` is not enough for production. Passing `review:external-ai-artifact` is not enough for production. Any Daily, frontend, production data, scoring, decision, execution, position, workflow, or Worker integration requires a separate reviewed PR.

## 13. Promotion Criteria / 晋升条件

Before any external AI output becomes user-visible:

- Stable Observation Audit must pass.
- Manual output validator must pass.
- Source attribution must be present.
- Fallback behavior must be tested.
- Timeout behavior must be tested.
- No forbidden copy.
- No scoring / decision / execution / position impact.
- Separate frontend display review must be completed.
- User-facing text must remain Chinese, restrained, and non-sensational.

## 14. Non-goals / 非目标

Outside the explicit v28.0K-4D DeepSeek manual artifact command, this work does not:

- add production API integration
- add provider SDK
- add secrets
- add `.env`
- add workflow for external AI API calls
- modify frontend
- modify Worker
- modify Daily pipeline
- modify data files
- modify scoring
- modify decision
- modify execution
- modify position
- display external AI output
- enable `externalAiInterpretationLayer`

## 15. Open Questions / 待确认问题

- Which provider should be tested first: DeepSeek or OpenAI?
- Which model should be used for low-cost manual tests?
- Should manual outputs be stored as GitHub Actions artifacts or local ignored files?
- Should provider comparison be side-by-side with the rule-based layer?
- What is the maximum acceptable cost per manual test?
- What input size limit should be enforced?
- Should the first implementation support only one provider to reduce complexity?
