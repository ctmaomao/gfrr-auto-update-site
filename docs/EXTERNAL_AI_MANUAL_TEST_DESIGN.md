# External AI Manual API Test Design

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
- v28.0K-4C Provider request/response adapter behind explicit environment gate
- v28.0K-4D Manual sample input to manual output artifact, no production display
- v28.0K-4E Validator-gated manual artifact review
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

This PR does not:

- call API
- add API client
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
