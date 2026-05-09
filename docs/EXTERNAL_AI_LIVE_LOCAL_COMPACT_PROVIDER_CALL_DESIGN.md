# External AI Live/Local Compact Provider-Call Design - v28.0L-3I

## 1. Status

This document is a design record only.

- No workflow change.
- No script change.
- No DeepSeek call.
- No workflow trigger.
- No secret change.
- No production data write.
- No frontend display.
- No Daily integration.
- Live/local compact provider call remains not yet implemented.

## 2. Verified baseline

The verified fixture baseline is GitHub Actions run `25593082968`.

- `fixture_sample` provider call succeeded.
- Provider transport works.
- External AI output validator works.
- External AI artifact quality review works.
- Artifact sanitizer works.
- Sanitized artifact upload works.
- Provider was `deepseek`.
- Model was `deepseek-v4-flash`.
- `promotionEligible=false`.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- Output remained artifact-only.

This verifies the fixture path only. It does not approve live/local input, production integration, frontend display, Daily integration, `externalAiInterpretationLayer` promotion, or scoring / decision / execution / position changes.

## 3. Why live/local compact is different from fixture_sample

`fixture_sample` proves provider transport and gates only. It uses a stable sample fixture to confirm the environment gate, provider command, validator, quality review, sanitizer, and artifact upload.

Live/local compact input is different because it would use current local site data from `data/radar-data.json`, summarized into the existing manual artifact style:

```text
manual-artifacts/external-ai/manual-input-compact-latest.json
```

That compact artifact may contain fresher site-structured data and more realistic combinations of `dailyBrief`, `divergenceLayer`, `brentPricingLayer`, `macroDrivers`, `dataHealth`, `decisionContext`, and related interpretation layers.

It is still not independently verified external market data. It must be treated as a site-structured data compact summary, not a live trading signal. It remains artifact-only and non-production.

## 4. Proposed live/local compact provider-call constraints

A future implementation must require all of the following:

- `workflow_dispatch` only.
- Environment `external-ai-manual`.
- Environment secret `DEEPSEEK_API_KEY`.
- `provider=deepseek`.
- `input_source=local_compact`.
- `dry_run=false`.
- `allow_network=true`.
- `acknowledge_cost=true`.
- `acknowledge_non_production=true`.
- `validate_output=true`.
- `max_attempts=1`.
- `timeout_ms<=180000`.
- No schedule trigger.
- No push trigger.
- No pull request trigger.
- No `workflow_run` trigger.
- No Daily integration.
- No production data write.
- No frontend display.
- No scoring / decision / execution / position changes.

## 5. Proposed input preparation

A future workflow should build compact input from local repository data only:

```bash
node scripts/build-external-ai-manual-input.mjs --compact --output manual-artifacts/external-ai/manual-input-compact-latest.json
```

The future workflow must:

- not fetch new live web data during the provider-call workflow.
- not run `build:data`.
- not run `build:realtime`.
- not run `build:world-order`.
- not mutate `data/radar-data.json`.
- use existing local `data/radar-data.json` as read-only input.
- record `sourceType=local_file`.
- record `productionDataWritten=false`.
- record `frontendDisplayChanged=false`.

## 6. Prompt / source semantics

A future `local_compact` provider call must ensure:

- `sourceSemantics=site_structured_data_compact_summary`.
- `auditFlags` use `site_structured_data_only`, not `sample_input_only`.
- output never includes both `sample_input_only` and `site_structured_data_only`.
- `sourceAttribution` cites site structured layers.
- confidence usually remains low or low-medium.
- confidence score should normally be 20-40 if structured input is usable.
- confidence score should not be 0 if structured input is usable.
- no external web, news, or market verification claims.
- no investment or trading advice.
- no execution, position, cash, or exposure repetition.
- `decisionContext` is read-only background only.

## 7. Required output gates

A future `local_compact` provider output must pass:

```bash
npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json
npm run review:external-ai-artifact -- --input manual-artifacts/external-ai/deepseek-output-latest.json --output manual-artifacts/external-ai/external-ai-quality-review-latest.json
npm run check:external-ai-workflow-artifacts -- --workflow-provider-test
```

If quality review returns `needs_prompt_revision` or `reject_for_promotion`:

- workflow should fail.
- artifacts may upload only if sanitizer passes.
- do not rerun immediately.
- do not proceed to production.
- do not proceed to frontend display.

## 8. Artifact policy

Allowed future artifacts:

- `manual-artifacts/external-ai/manual-input-compact-latest.json`
- `manual-artifacts/external-ai/deepseek-output-latest.json`
- `manual-artifacts/external-ai/external-ai-quality-review-latest.json`
- provider gate/status diagnostics

All future artifacts remain:

- ignored by git.
- artifact-only.
- `retention-days: 3`.
- not production data.
- not copied into `data/`.
- not displayed on frontend.

## 9. Stop rules

Stop and do not retry repeatedly if:

- DeepSeek returns 503.
- request times out.
- validator fails.
- quality review fails.
- artifact sanitizer fails.
- output contains unsafe advice/action wording.
- output invents unsupported external facts.
- output repeats execution, cash, exposure, or position details.
- any production path changes.
- any frontend path changes.

## 10. Acceptance criteria for future implementation PR

The future implementation PR should prove by static checks that:

- `local_compact` provider path is explicitly gated.
- `fixture_sample` path remains working.
- `local_compact` path does not alter production data.
- environment gate remains required.
- secret remains step-scoped.
- input builder runs read-only.
- validator, review, and sanitizer gates remain required.
- artifacts upload only after sanitizer success.
- no frontend, Daily, or production write occurs.

## 11. Current go/no-go

Decision:

- Design: ready after this PR.
- Implementation: not yet.
- Real `local_compact` provider call: NO-GO until a separate implementation PR is merged and audited.
- Production data write: NO-GO.
- Frontend display: NO-GO.
- Daily integration: NO-GO.

Recommended next PR:

```text
v28.0L-3J Local Compact Provider-Call Workflow Path - Artifact-Only / No Production Data
```

Only consider L-3J after this design PR is merged and audited.

## 12. v28.0L-3J implementation status

L-3J implements the `local_compact` provider-call workflow path as an artifact-only route.

- No DeepSeek call was run by this PR.
- No GitHub Actions workflow was triggered by this PR.
- The workflow path remains `workflow_dispatch` only.
- The provider-call job remains gated by environment `external-ai-manual`.
- `DEEPSEEK_API_KEY` remains an Environment secret reference and is step-scoped to the provider-call step.
- `local_compact` input is built from the repository local data through `manual-artifacts/external-ai/manual-input-compact-latest.json`.
- The provider output remains artifact-only and non-production.
- No production data is written.
- No frontend display is enabled.
- No Daily integration is enabled.
- No scoring / decision / execution / position logic is changed.

The next step after merge is one manually approved `local_compact` provider-call audit. If validator, quality review, or sanitizer fails, stop and revise before any rerun.

## 13. v28.0L-3J-1 sanitizer source path fix

Run `25598085025` attempted the first `local_compact` provider-call audit and stopped safely before the provider-call job.

- `provider-test-dry-run-and-gate` built `manual-artifacts/external-ai/manual-input-compact-latest.json`.
- The compact input source was local file metadata for `data/radar-data.json`.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- `secretsRead=false`.
- `apiCalled=false`.
- Provider gates were satisfied for `input_source=local_compact`.
- The artifact sanitizer blocked upload because it treated the read-only source metadata string `data/radar-data.json` as a production path marker.
- The provider-call job did not run.
- No DeepSeek call occurred.
- No secret was read.

L-3J-1 narrows the sanitizer rule: `manual-input-compact-latest.json` may reference `data/radar-data.json` only as read-only local source metadata. Actual production data upload, provider output copy, `data/*.json` artifact upload, frontend display, Daily integration, and scoring / decision / execution / position changes remain forbidden.

## 14. v28.0L-3J-3 execution-language prompt fix

Run `25598379612` completed the first `local_compact` provider-call audit retry far enough to prove the transport path:

- `input_source=local_compact`.
- `manual-input-compact-latest.json` built successfully with `sourceType=local_file` and `compact=true`.
- `productionDataWritten=false` and `frontendDisplayChanged=false`.
- `secretsRead=false` and `apiCalled=false` before the provider step.
- DeepSeek provider call executed.
- External AI output validation passed.
- Artifact sanitizer passed and sanitized provider-call artifacts uploaded.
- Quality review failed with `failedDimensions=executionLanguageSafety`.
- The blocking error was `$.facts[5] contains operation-oriented language: 执行灯`.
- `promotionEligible=false`.

Interpretation: workflow transport, environment gate, provider call, validator, sanitizer, artifact upload, and non-production boundaries worked. Quality review correctly blocked operation-language leakage from `decisionContext`.

L-3J-3 tightens the prompt so `decisionContext` is read-only background only, facts prefer non-decisionContext site layers, source attribution notes stay neutral, and model output must not repeat `执行灯` or equivalent execution / operation / trading language.

The next audit should retry `local_compact` once after L-3J-3 is merged. If `executionLanguageSafety` fails again, stop and revise the prompt again before any further paid run.

Recommended next stage:

```text
v28.0L-3J-2 First Local Compact Provider-Call Audit Retry
```

## 15. v28.0L-3J-4 local_compact provider-call audit result

Run `25598887574` recorded the successful `local_compact` DeepSeek provider-call audit for the `External AI Manual Provider Test` workflow at commit `ade9ca2`.

Inputs:

- `provider=deepseek`.
- `input_source=local_compact`.
- `dry_run=false`.
- `allow_network=true`.
- `acknowledge_cost=true`.
- `acknowledge_non_production=true`.
- `validate_output=true`.
- `timeout_ms=120000`.
- `max_attempts=1`.
- `upload_artifacts=true`.

Observed result:

- workflow completed with success.
- `provider-test-dry-run-and-gate` succeeded.
- `provider-call-artifact-only` succeeded.
- local compact input was built successfully as `manual-input-compact-latest.json`.
- local compact input used local `data/radar-data.json` as read-only source metadata.
- `sourceType=local_file`.
- `compact=true`.
- `radarDataUpdatedAt=2026-05-08T23:29:12.835Z`.
- provider path entered through GitHub Environment `external-ai-manual`.
- `DEEPSEEK_API_KEY` was injected by GitHub Actions as a masked step-scoped value.
- provider command executed.
- `apiCalled=true` and `networkUsed=true` during the provider step.
- provider was `deepseek`.
- model was `deepseek-v4-flash`.
- DeepSeek manual API test passed.
- External AI output validation passed.
- warnings: 0.
- External AI artifact quality review passed.
- artifact sanitizer passed.
- sanitized provider-call artifacts uploaded.
- post-run safety assertion passed.
- `promotionEligible=false`.
- `artifactOnly=true`.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.

Uploaded artifacts:

- `external-ai-manual-provider-test-provider-25598887574`, artifact ID `6894997771`, size `8636` bytes, expires `2026-05-12`.
- `external-ai-manual-provider-test-gate-25598887574`, artifact ID `6894989939`, size `6502` bytes, expires `2026-05-12`.

Interpretation:

- The `local_compact` artifact-only provider-call path is audited.
- Provider transport, output validation, quality review, artifact sanitizer, and sanitized artifact upload all passed for `local_compact`.
- Production data write remains `not_ready`.
- Frontend display remains `not_ready`.
- Daily integration remains `not_ready`.
- `externalAiInterpretationLayer` promotion remains `not_ready`.
- Scoring / decision / execution / position changes remain out of scope.
- No automatic scheduled provider call is approved.
- Do not rerun `local_compact` repeatedly without a new approved task.

Recommended next stage:

```text
v28.0L-3K External AI Production Integration Readiness Review - No Production Write
```

## 16. v28.0L-3K production readiness review note

v28.0L-3K records that the `local_compact` artifact-only provider-call path is verified by run `25598887574`.

This verification does not approve production integration:

- Production data write remains `not_ready`.
- Frontend display remains `not_ready`.
- Daily integration remains `not_ready`.
- Automatic provider calls remain `not_ready`.
- `externalAiInterpretationLayer` promotion remains `not_ready`.
- `promotionEligible=true` remains `not_ready`.

The next phase should be production data contract design only.
