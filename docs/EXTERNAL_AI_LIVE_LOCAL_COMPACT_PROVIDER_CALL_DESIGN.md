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
