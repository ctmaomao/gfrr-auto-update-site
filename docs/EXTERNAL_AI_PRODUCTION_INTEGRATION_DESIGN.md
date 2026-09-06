# External AI Production Integration Design — v28.0L-0

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a design-only document.

No production external AI integration exists yet. No Daily provider call exists. No frontend display exists. No production data write exists. No workflow automation exists. `externalAiInterpretationLayer` remains the disabled scaffold in production data.

Manual input artifacts, DeepSeek output artifacts, provider failure artifacts, and quality review artifacts remain non-production manual artifacts under `manual-artifacts/`. `promotionEligible` remains false until a separate reviewed implementation PR explicitly changes that boundary.

## 2. Current baseline

The stable v28.0K-4G manual-test baseline is:

- v28.0K-4D: explicit DeepSeek manual artifact path exists. It is manual-only, artifact-only, validator-gated, and requires explicit network / validation flags plus local `DEEPSEEK_API_KEY`.
- v28.0K-4E: local, allowlisted live, and compact manual input artifacts can be built from site-structured `radar-data.json`.
- v28.0K-4E-4: provider failure artifacts have normalized classifications such as `provider_unavailable`, `provider_timeout`, and quality-review `provider_failure_only`.
- v28.0K-4F: offline artifact quality review gate exists via `review:external-ai-artifact`, and always keeps `promotionEligible=false`.
- v28.0K-4G: stable manual baseline is documented. Passing structural validation or quality review is not enough for production.

External AI is still manual-only, artifact-only, validator-gated, quality-review-gated, non-production, and non-user-visible.

## 3. Proposed production architecture

Future production integration should remain disabled by default and follow this path:

```text
site structured data
→ compact external AI input builder
→ provider adapter
→ external AI output
→ structural validator
→ quality review
→ production-safe externalAiInterpretationLayer
→ frontend display only if enabled
```

The layer must be display-only. It must not affect scoring, `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, Invalidation Rules, Worker source selection, Brent promotion, or any position / execution logic.

The production path must have a feature flag disabled by default. Provider execution, production data writes, and frontend visibility must be separate gates.

## 4. Feature flags and disable switch

Future implementation must define explicit flags:

- `EXTERNAL_AI_ENABLED=false` by default
- `EXTERNAL_AI_PROVIDER=none` by default
- `EXTERNAL_AI_DAILY_ENABLED=false` by default
- `EXTERNAL_AI_FRONTEND_VISIBLE=false` by default
- `EXTERNAL_AI_REQUIRE_QUALITY_REVIEW=true`
- `EXTERNAL_AI_MAX_DAILY_CALLS=1`
- `EXTERNAL_AI_ALLOW_MANUAL_OVERRIDE=false` by default

Design requirements:

- A hard kill switch must disable provider calls.
- Frontend visibility must be separate from provider call enablement.
- Provider output write must be separate from frontend visibility.
- If structural validation or quality review fails, output must not be promoted.
- A provider call may be enabled while frontend display remains disabled.
- A diagnostic write may be enabled while user-facing display remains disabled.

## 5. API key and secrets design

This document does not add secrets.

Future requirements:

- `DEEPSEEK_API_KEY` must never be committed.
- GitHub Actions integration must use repository or environment secrets.
- The secret must only be available to the specific workflow that needs it.
- Secrets must not be printed.
- Logs must not include request headers or raw secret-bearing values.
- Local manual tests should continue to use a PowerShell/session environment variable only.
- Future implementation must document key rotation.
- Future workflows must not expose secrets to `pull_request` events from forks.
- Production key usage should require manual enablement or a protected environment when available.

## 6. Provider API behavior assumptions

Known provider behavior from manual testing:

- Provider may return HTTP 503 / `service_unavailable`.
- Provider may timeout or keep the connection open during high load.
- Provider JSON Output requires explicit JSON-mode request and prompt contract.
- Provider can return empty content even in JSON mode.
- `max_tokens` must be set to reduce truncation risk.
- A future implementation should support timeout and retry/backoff, but must stop after limited attempts.

This design does not claim any provider SLA.

## 7. Provider request design

Future provider requests should include:

- compact site-structured input only
- no private user data
- no API keys in payload
- no raw large histories
- no chart arrays
- no frontend HTML
- no manual artifacts
- no scoring instructions
- no decision / execution / position instructions
- `response_format` JSON object mode
- explicit JSON schema in the prompt
- global unsafe wording guard
- source attribution rules
- live vs sample semantics
- conservative confidence rules
- reasonable `max_tokens`
- reasonable timeout
- sanitized provider diagnostics

The prompt must not ask the provider to make trading, execution, portfolio, or position recommendations.

## 8. Data contract design

A future production `externalAiInterpretationLayer` should include:

- `contractVersion`
- `enabled`
- `status`
- `provider`
- `model`
- `generatedAt`
- `inputDigest`
- `output`
- `validation`
- `qualityReview`
- `failureClassification`
- `fallback`
- `boundaries`
- `audit`

When `enabled=false`:

- `status=disabled`
- `provider=none`
- `output=null`

When provider failure occurs:

- `status=provider_failure`
- `output=null`
- `failureClassification` populated
- `fallback.used=true`
- no frontend display unless a future diagnostic-only admin mode exists

When valid output exists but quality review fails:

- `status=quality_rejected`
- `output=null` or retained only in a non-user-visible audit object
- `frontendVisible=false`
- `fallback.used=true`

When valid output and quality review pass:

- `status=ready_for_display_review` or `display_candidate`
- frontend visibility still requires a separate flag and separate reviewed PR
- `promotionEligible` remains false until implementation explicitly changes it in a reviewed PR

Boundaries must always include:

- `displayOnly=true`
- `affectsScoring=false`
- `affectsDecisionModel=false`
- `affectsExecutionLock=false`
- `affectsPositionGuidance=false`
- `notInvestmentAdvice=true`

## 9. Validator and quality gates

Future production path must require:

1. `check:external-ai-output` style structural validation.
2. failure artifact detection.
3. unsafe wording detection.
4. source attribution object array.
5. quality review gate.
6. no promotion if `provider_failure_only`.
7. no promotion if `needs_prompt_revision`.
8. no promotion if `reject_for_promotion`.
9. quality review result stored for audit.

Structural validator PASS is not enough. Quality review PASS is not enough by itself. Frontend visibility still requires a separate reviewed integration PR.

## 10. Retry / backoff / stop rules

Future stop rules:

- `provider_unavailable` / HTTP 503: do not repeatedly call provider; retry later only once or according to a strict budget; mark `provider_failure`; fallback to rule-based `aiInterpretationLayer`.
- `provider_timeout`: use compact input; retry once later with extended timeout; then stop and fallback.
- `provider_invalid_json`: no immediate retry unless prompt fix exists; mark prompt / quality issue.
- `provider_empty_content`: retry once later or require prompt review.
- `provider_content_filter`: do not retry unchanged; prompt/input review required.
- `provider_length_truncated`: reduce input or output before retry.

Cost-control stop rules:

- maximum calls per Daily run
- maximum calls per day
- no retry storm
- no looped workflow triggering
- manual override only in protected path

## 11. Cost control design

Future implementation must include:

- daily call budget
- retry budget
- token/input size budget
- compact input only
- no full historical arrays
- no chart arrays
- no repeated paid calls on `provider_unavailable` or `provider_timeout`
- explicit manual test commands
- no uncontrolled background calls
- logs that record estimated input chars/bytes and provider status, not raw secrets

## 12. Daily workflow integration plan — future only

Each phase requires a separate reviewed PR.

Phase L-1:

- docs-only design accepted

Phase L-2:

- add disabled production provider adapter path
- no scheduled call
- no frontend

v28.0L-2 adds the disabled production provider path skeleton. It has no provider calls, no secrets, no workflow, no frontend display, and no production data write. The skeleton defaults to disabled and refuses activation attempts by returning a disabled state with `disabledBecause = v28.0L-2_does_not_allow_provider_activation`.

Phase L-3:

- add manual `workflow_dispatch` test with GitHub secret
- artifact-only
- no production data

Phase L-4:

- add Daily disabled-by-default provider call
- feature flag off by default
- fallback required

Phase L-5:

- write `externalAiInterpretationLayer` into production data only when enabled and validated
- still not frontend-visible by default

Phase L-6:

- frontend read-only display behind separate visibility flag
- no scoring / decision impact

## 13. Frontend display design — future only

If future frontend display is allowed:

- show as "AI解释辅助层" or similar
- clearly mark display-only
- show confidence and data gaps
- show source attribution
- show provider status if degraded
- do not show execution / position / trade language
- do not place it above 今日主判断 unless explicitly reviewed
- do not merge it into Global Risk Heatmap
- do not merge it into World Order Stress Overlay
- do not modify scoring/decision cards
- provide hidden/disabled default

## 14. Fallback behavior

If provider is unavailable, invalid, rejected, or disabled:

- use rule-based `aiInterpretationLayer`
- `externalAiInterpretationLayer.output=null`
- `fallback.used=true`
- status explains reason
- no broken UI
- no reduced scoring validity
- no Daily failure unless a hard gate is explicitly configured later

## 15. Audit and observability

Future implementation should log or record:

- provider
- model
- timestamp
- input digest
- input approx bytes/chars
- `timeoutMs`
- provider status
- validation status
- quality review status
- failure category
- fallback status
- productionImpact false flags

Must not log:

- API key
- raw headers
- full raw provider response if unsafe
- private user data
- manual artifacts into production

## 16. Security and privacy

Only site-structured data may be sent. No private user data may be sent. No secrets may be included in prompts, payloads, diagnostics, artifacts, comments, or logs.

Local manual artifacts must not become production data. GitHub tokens and workflow secrets must not appear in logs. Secrets must be rotated if exposed. Manual test users must clear local environment variables after testing.

## 17. Acceptance criteria before implementation

Before any implementation PR:

- K-4G baseline remains green.
- v28.0L-1 readiness audit has passed and confirmed the next allowed step.
- Manual compact live artifact has at least one recent successful validator PASS.
- Quality review has been run on a successful artifact.
- Provider failure handling is documented.
- Feature flags and data contract are agreed.
- Cost budget is agreed.
- Frontend placement is agreed.
- Rollback plan is agreed.

v28.0L-1 readiness audit is the gate before implementation. L-2 must be a disabled skeleton only, with no provider calls and no secret reads. Do not proceed from L-0 directly to workflow automation, Daily integration, production data writes, or frontend display.

v28.0L-3 designs a future manual `workflow_dispatch` artifact-only path in [`EXTERNAL_AI_MANUAL_WORKFLOW_DISPATCH_DESIGN.md`](EXTERNAL_AI_MANUAL_WORKFLOW_DISPATCH_DESIGN.md). L-3 does not add workflow automation. The first implementation should be a dry-run workflow skeleton only, with no secret and no provider call.

v28.0L-3B adds that dry-run workflow skeleton only. It is `workflow_dispatch` only, has no provider or allow-network inputs, references no provider secrets, uploads only sanitized dry-run diagnostics, and still performs no provider call, no production data write, and no frontend display. It does not change the L-0 production architecture status: production external AI remains not implemented.

v28.0L-3C provider-call workflow design is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md). It remains design-only. A future provider-call workflow would still be artifact-only and would not be production integration. L-3C allows no Daily integration, frontend display, production data write, enabled `externalAiInterpretationLayer`, or scoring / decision / execution / position change.

v28.0L-3D provider-call workflow readiness checklist is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md). It is the no-code go/no-go gate before provider-call implementation planning. The current readiness decision remains NO-GO for provider-call implementation until secret storage, rotation/revocation, static checks, missing-secret behavior, artifact sanitization, operator approval, cost budget, and concurrency policy are resolved.

v28.0L-3E provider-call workflow implementation plan is documented in [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md). It remains no-code and plans a future L-3F missing-secret-safe skeleton only. L-3E does not make provider calls, add secrets, write production data, enable Daily integration, or change frontend visibility.

## 18. Non-goals

v28.0L-0 does not:

- implement provider calls
- add secrets
- add workflow automation
- write production data
- change frontend
- change scoring
- change decisions
- change execution locks
- change position guidance
- replace rule-based `aiInterpretationLayer`

## 19. Open questions

- Should production external AI call run daily, manually, or only on demand?
- Should provider call be GitHub Actions only or Worker-side?
- Should output be visible to users initially or admin-only?
- What is acceptable daily cost budget?
- What exact UI placement is acceptable?
- Should quality review be automated or human-reviewed before display?
- Should fallback output be shown or hidden?
- Which provider model should be used if DeepSeek service is unstable?
- Should there be a second provider later, or keep DeepSeek-only?
