# External AI Implementation Readiness Audit — v28.0L-1

> **STATUS:** Historical phase record; legacy AI retirement, current Macro Risk authority and no-scoring boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#external-ai). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This is a documentation-only readiness audit.

No implementation is added. No provider call is added. No secret is added. No workflow is added. No production data write is added. No frontend display is added. No scoring / decision / execution / position behavior changes. `externalAiInterpretationLayer` remains the disabled scaffold. `promotionEligible` remains false.

## 2. Baseline reviewed

This audit reviewed:

- v28.0K-4D manual DeepSeek artifact path.
- v28.0K-4E compact live input path.
- v28.0K-4E-4 provider failure classification.
- v28.0K-4F quality review gate.
- v28.0K-4G stable manual test baseline sync.
- v28.0L-0 production integration design.
- v28.0L-0 post-merge audit passed state.

External AI remains manual-only, artifact-only, validator-gated, quality-review-gated, non-production, and non-user-visible.

## 3. Readiness summary

| Area | Status | Evidence | Blocking? | Required next action |
|---|---|---|---|---|
| Manual DeepSeek call path | ready | v28.0K-4D manual artifact path exists and has passed validator with sample input. | No | Keep manual-only until later reviewed phases. |
| Compact live input builder | ready | v28.0K-4E / 4E-1 can build compact live/local site-structured input artifacts. | No | Continue using compact input for manual tests. |
| Structural validator | ready | `check:external-ai-output` exists and detects invalid/failure artifacts. | No | Keep strict; do not weaken. |
| Provider failure classification | ready | `provider_unavailable`, `provider_timeout`, and failure-artifact handling exist. | No | Preserve classification in future production path. |
| Quality review gate | ready | `review:external-ai-artifact` exists and keeps `promotionEligible=false`. | No | Require quality result in future audit trail. |
| L-3B dry-run workflow skeleton | ready | v28.0L-3B dry-run workflow skeleton has been validated once by manual GitHub Actions `workflow_dispatch` run `25583503038`. | No | Keep it dry-run-only; do not add provider-call behavior in audit-sync PRs. |
| Provider-call workflow design | design_ready | v28.0L-3C documents future provider-call gates, secret handling, artifacts, exit policy, and cost controls. | No | Treat as design only; do not implement directly from L-3C. |
| Provider-call readiness checklist | added | v28.0L-3D adds [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md) as the final no-code gate before implementation planning. | Yes | Resolve checklist blockers before any provider-call workflow implementation. |
| Provider-call implementation planning | ready_for_review | v28.0L-3E adds [`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md), resolving missing readiness items as a plan only. | No | Review plan before L-3F missing-secret-safe skeleton. |
| Provider-call workflow skeleton | ready / audited for no-real-provider-call skeleton | v28.0L-3F-1 records run `25591115649` default dry-run PASS and run `25591202053` provider-path-without-secret expected FAIL before provider command. `DEEPSEEK_API_KEY` was empty; no DeepSeek call, provider output artifact, production data write, or frontend change occurred. | No | Keep skeleton no-real-provider-call; next step requires a separate secret decision / first real provider-call gate design. |
| Real provider-call workflow implementation | not_ready | The L-3F provider-test workflow skeleton exists, but L-3F-1 only audited dry-run and missing-secret safety. L-3G decides secret location only; real provider command execution remains blocked, and no workflow file is approved to use a configured provider secret. | Yes | Requires a separate approved unlock workflow PR before any real call. |
| Secret location decision | decided | v28.0L-3G selects GitHub Environment `external-ai-manual` and Environment secret `DEEPSEEK_API_KEY`, with repository Actions secret as fallback only. | No | Do not create the secret until separately approved. |
| Baseline documentation | ready | v28.0K-4G and v28.0L-0 docs are present. | No | Keep docs linked before implementation. |
| Production data contract | design_only | L-0 designs a future shape; current production remains disabled scaffold. | Yes | Implement only in later staged PR after disabled skeleton. |
| Feature flags | design_only | L-0 defines required flags, but no implementation exists. | Yes | L-2 may add disabled flag shape without provider calls. |
| GitHub secret strategy | not_ready | No secret is added; repository/environment strategy is undecided. | Yes | Decide repository vs environment secret, rotation, and trigger permissions before L-3. |
| Workflow strategy | design_only | L-0 proposes staged workflow phases; no workflow exists. | Yes | First workflow must be later manual `workflow_dispatch`, artifact-only. |
| Cost budget | not_ready | Budget concepts exist only in design. | Yes | Select max calls/day, max retries, and input/token limits before provider workflow. |
| Provider retry/backoff | design_only | Stop rules are documented; production code does not exist. | Yes | Implement only after disabled provider skeleton. |
| Human review gate | partially_ready | Quality review gate exists; human approval process is not operationalized. | Yes | Define explicit approval before display or production data write. |
| Frontend display placement | not_ready | No UI placement is approved. | Yes | Separate reviewed frontend design required before display. |
| Rollback / disable switch | design_only | Kill switch is specified in L-0 but not implemented. | Yes | L-2 should define disabled skeleton and future kill-switch shape. |
| Audit / observability | design_only | Required audit fields are documented only. | Yes | Add audit shape in later disabled path. |
| Security / privacy | partially_ready | Manual rules exist, but production secret handling is not operational. | Yes | Define protected secret handling before L-3. |
| Provider stability | partially_ready | DeepSeek has succeeded once but also returned 503 / timeout. | Yes | Require fallback and retry budget before production path. |

## 4. Go / no-go decision

Current decision: **NO-GO for production integration**.

Reason:

- L-0 design exists, but implementation prerequisites are not yet implemented.
- No GitHub secret strategy has been operationally set up.
- No disabled production provider path exists.
- No `workflow_dispatch` artifact-only implementation exists.
- No production data contract implementation exists.
- No frontend placement has been approved.
- Provider has shown 503 / timeout instability.
- Cost budget is not implemented.
- Rollback and kill switch are design-only.

Allowed next step:

- v28.0L-2 Disabled Production Provider Path Skeleton — No Provider Calls.

Not allowed next steps:

- Direct Daily integration.
- Direct frontend display.
- Direct production data write.
- Adding GitHub secret and scheduled call in one PR.
- Making `externalAiInterpretationLayer` enabled by default.
- Letting external AI affect scoring / decision / execution / position.

## 5. Recommended next stage

Recommended next PR: **v28.0L-2 Disabled Production Provider Path Skeleton — No Provider Calls**.

Scope:

- Add production-oriented but disabled provider path skeleton.
- No API call.
- No GitHub secret.
- No workflow.
- No frontend.
- No data writes.
- Keep `provider=none` by default.
- Keep `enabled=false`.
- Keep `externalAiInterpretationLayer` disabled.
- Add feature flag shape / config schema only if safe.
- Add tests proving disabled path does not call provider or read secrets.

This is only a recommendation. L-2 must be a separate PR.

## 6. GitHub secret readiness

Design-only audit:

- `DEEPSEEK_API_KEY` is not set by this PR.
- Future GitHub Actions secret should be a repository or protected environment secret.
- Workflow can only read secrets when explicitly referenced.
- Secrets are not provided to fork `pull_request` workflows.
- Secrets must not be printed.
- Secrets should not be passed through command-line arguments.
- Prefer environment variable injection inside a protected job.
- Secret creation / rotation must be documented before L-3.
- No secret should be created until there is a reviewed `workflow_dispatch` artifact-only PR.

Readiness: `not_ready` / `design_only`.

Required next action:

- Decide repository secret vs environment secret.
- Decide protected environment if available.
- Define rotation and emergency revocation procedure.
- Define who can trigger provider workflow.

## 7. Workflow readiness

No workflow should be added in L-1.

The first workflow should be L-3 manual `workflow_dispatch` only. It must be artifact-only, must not write `data/radar-data.json`, must not trigger Daily, must not display frontend output, must use strict timeout and retry budget, must upload sanitized artifacts only if safe, must never upload secrets or raw provider headers, and must not run on `pull_request` from forks.

Readiness: `not_ready` / `design_only`.

## 8. Production data readiness

Current production `externalAiInterpretationLayer` remains the disabled scaffold.

Future implementation must add a production-safe contract only after:

- feature flags exist
- provider path disabled by default
- validator gate exists in production path
- quality review result is represented
- fallback is explicit
- `failureClassification` is represented
- `frontendVisible` is separated from `providerEnabled`

Readiness: `not_ready` / `design_only`.

## 9. Frontend readiness

No frontend display is approved yet.

Future UI must be read-only, display-only, below top-level macro judgment unless reviewed. It must show confidence, data gaps, source attribution, and provider degradation. It must avoid execution / position / trade language. It must not affect Global Risk Heatmap or World Order Stress Overlay layout. It must not affect scoring/decision cards. It must be hidden by default.

Readiness: `not_ready` / `design_only`.

## 10. Provider stability readiness

DeepSeek path has worked, but provider later returned 503 and timeout failures. Provider stability is partially ready at best.

Production integration requires fallback and no retry storm. Daily hard failure on provider outage is not acceptable. Provider failure should be represented as `status=provider_failure` with fallback.

Readiness: `partially_ready`.

## 11. Cost readiness

Manual testing has exposed cost risk. No automated budget enforcement exists yet.

Future implementation needs:

- max calls per run
- max calls per day
- max retries
- compact input only
- no repeated retry on `provider_unavailable` / `provider_timeout`
- visible diagnostics for call count and input size

Readiness: `not_ready` / `design_only`.

## 12. Security readiness

Manual key leakage happened in chat during testing and required key revocation. Future implementation must assume keys can leak if mishandled.

Requirements:

- never paste API keys into chat
- do not commit `.env`
- do not log secrets
- rotate exposed keys immediately
- clear local env after manual test
- use GitHub secrets only in reviewed protected workflows

Readiness: `partially_ready`.

## 13. Human review gate readiness

The quality review gate exists. `promotionEligible=false` still blocks automatic promotion.

Future production display should require:

- successful validator
- quality review pass
- no provider failure
- human review or explicit approval before frontend visibility
- separate PR to enable display

Readiness: `partially_ready`.

## 14. Acceptance criteria before L-2

- L-1 readiness audit merged and green.
- L-0 design remains linked.
- K-4G baseline remains green.
- No production external AI active.
- No manual artifacts committed.
- Agreement that L-2 is disabled skeleton only.
- Agreement that L-2 reads no secrets and calls no providers.

## 15. Acceptance criteria before L-3

- L-2 disabled skeleton merged and green.
- Secret strategy selected.
- `workflow_dispatch` artifact-only design reviewed.
- Cost budget selected.
- No production data write.
- No frontend display.
- Manual workflow must be disabled/protected by default where possible.

## 16. Acceptance criteria before L-4 / Daily

- L-3 manual `workflow_dispatch` has passed.
- Provider failure handling works in workflow context.
- Retry/backoff budget implemented.
- Daily integration remains disabled by default.
- Fallback tested.
- No frontend display.

## 17. Acceptance criteria before L-5 / production data write

- Disabled Daily provider path tested.
- Production `externalAiInterpretationLayer` contract implemented.
- Validator and quality review in path.
- Fallback and `failureClassification` represented.
- Production write feature flag off by default.
- No frontend display.

## 18. Acceptance criteria before L-6 / frontend display

- Production data write path stable.
- Frontend visibility flag separate.
- UI placement approved.
- Copy reviewed.
- No execution/position/trade language.
- No scoring/decision impact.
- Rollback tested.

## 19. Explicit non-goals

L-1 does not:

- add code
- add workflow
- add GitHub secret
- call DeepSeek
- write production data
- change frontend
- change Worker
- change scoring
- change decisions
- change execution
- change position guidance
- enable `externalAiInterpretationLayer`
- promote manual artifacts

## 20. Final readiness decision

Overall readiness: `partially_ready_for_disabled_skeleton_only`.

Production integration: `not_ready`.

Recommended next PR: v28.0L-2 Disabled Production Provider Path Skeleton — No Provider Calls.

v28.0L-2 adds the disabled skeleton only. Production integration remains `not_ready`; the next possible stage after L-2 is v28.0L-3 manual `workflow_dispatch` artifact-only design, and that must still be separately reviewed before any implementation.

v28.0L-3 is workflow design only. Production integration remains `not_ready`. The next implementation must be v28.0L-3B dry-run workflow skeleton, not a provider-call workflow.

v28.0L-3B adds the dry-run workflow skeleton only. Production integration remains `not_ready`; provider-call workflow remains `not_ready`; GitHub secret readiness remains `not_ready` / `design_only` because no secret is added or referenced. The only allowed L-3B workflow behavior is no-secret, no-provider-call, dry-run diagnostics.

v28.0L-3B-1 records one successful manual GitHub Actions `workflow_dispatch` validation of the L-3B dry-run workflow skeleton. The dry-run skeleton is `ready` for dry-run-only diagnostics. Provider-call workflow remains `not_ready`; GitHub secret usage remains `not_ready`; production integration remains `not_ready`.

v28.0L-3C adds provider-call workflow design only. Provider-call workflow design becomes `design_ready`, but provider-call implementation remains `not_ready`; GitHub secret usage remains `not_ready`; production integration remains `not_ready`.

v28.0L-3D adds the provider-call readiness checklist. The checklist is documentation-only and records current provider-call implementation readiness as `not_ready_until_missing_items_resolved`; GitHub secret usage remains `not_ready`; production integration remains `not_ready`.

v28.0L-3E adds the provider-call workflow implementation plan. Planning becomes `ready_for_review`, but provider-call implementation remains not active; GitHub secret usage remains not active; production integration remains `not_ready`.

v28.0L-3F adds a missing-secret-safe provider-test workflow skeleton. The skeleton is partially ready only for no-real-provider-call workflow structure testing. Real provider calls remain not active; GitHub secret usage remains not active; production integration remains `not_ready`.

The next possible stage after L-3F is an audit-sync PR recording the default dry-run and provider-path-without-secret workflow results. It must not be bundled with GitHub secret setup, real provider calls, Daily integration, production data writes, frontend display, or scoring / decision / execution / position changes.

v28.0L-3F-1 records that audit sync. The provider workflow skeleton is audited for its no-real-provider-call behavior: default dry-run passed, and the provider path without secret failed safely before provider command. This still adds no secret, runs no real provider call, writes no production data, changes no frontend, and does not make production integration ready.

v28.0L-3G resolves the secret-location decision only. It documents GitHub Environment `external-ai-manual` and Environment secret `DEEPSEEK_API_KEY` as the preferred future path, with repository Actions secret as fallback only. It adds no secret, modifies no workflow, runs no provider call, writes no production data, and keeps implementation inactive.

Do not proceed directly to:

- `workflow_dispatch` provider call
- Daily provider call
- production data write
- frontend display
