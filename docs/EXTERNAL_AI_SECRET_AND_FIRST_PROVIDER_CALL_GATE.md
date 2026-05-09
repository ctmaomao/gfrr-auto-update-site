# External AI Secret Decision and First Provider-Call Gate - v28.0L-3G

## 1. Status

This is a documentation-only decision record.

- No secret is added.
- No workflow is modified.
- No DeepSeek call is run.
- No provider output artifact is generated.
- No production data write is added.
- No frontend display is added.
- Existing v28.0L-3F workflow still blocks real provider calls.
- Real provider call remains not active.

## 2. Current verified baseline

The current verified provider-test workflow baseline is:

- L-3F default dry-run PASS: run `25591115649`.
- L-3F provider path without secret expected FAIL before provider command: run `25591202053`.
- `DEEPSEEK_API_KEY` was empty.
- No DeepSeek call occurred.
- No provider output artifact was produced.
- No production data change occurred.
- No frontend change occurred.

The L-3F provider-test workflow remains a no-real-provider-call skeleton. The L-3F-1 audit validates the dry-run and missing-secret safety behavior only.

## 3. Secret storage decision

Decision:

- Preferred secret location: GitHub Environment secret.
- Environment name: `external-ai-manual`.
- Secret name: `DEEPSEEK_API_KEY`.
- Required reviewer / approval should be used if available.
- Repository Actions secret is fallback only if Environment secret approval is unavailable or intentionally rejected.

Rationale:

- Environment secrets are scoped to jobs that reference the environment.
- Required reviewers can prevent secret access until approval.
- This is safer than repository-level secret access for manual provider tests.
- GitHub Actions secret references resolve as an empty string if the secret is not set, which preserves the existing missing-secret gate behavior.

This PR does not create the environment or the secret. Do not add `DEEPSEEK_API_KEY` yet.

## 4. First real provider-call gate requirements

Before the first real provider call is allowed, all of the following must be true:

- A separate PR explicitly modifies the L-3F workflow to allow a real provider call.
- The workflow remains `workflow_dispatch` only.
- The provider call remains artifact-only.
- The job uses environment `external-ai-manual`.
- `DEEPSEEK_API_KEY` is environment-scoped and step-scoped.
- The key is injected only in the provider-call step.
- The key is never passed as a CLI argument.
- `dry_run=false`.
- `allow_network=true`.
- `acknowledge_cost=true`.
- `acknowledge_non_production=true`.
- `validate_output=true`.
- `max_attempts=1`.
- `timeout_ms<=180000`.
- `check:external-ai-output` runs after provider output.
- `review:external-ai-artifact` runs after validation.
- Artifact sanitizer passes before upload.
- `promotionEligible=false`.
- No production data write.
- No frontend display.
- No Daily trigger.
- No scoring / decision / execution / position changes.

## 5. Required workflow behavior before first real call

The future PR that unlocks provider calls must:

- keep default dry-run path as safe PASS.
- keep missing-secret path as fail-before-provider-command.
- add a separate real-provider-call step only after all gates.
- fail closed if validator fails.
- fail closed if artifact sanitizer fails.
- fail closed if quality review is unsafe.
- upload artifacts for 3 days only.
- not write `data/radar-data.json`.
- not update frontend.
- not deploy Worker.
- not run `build:data`.
- not run `build:realtime`.
- not run `build:world-order`.

## 6. First real provider-call run plan

After the unlock PR is merged and the environment secret is added, the first real call should be:

- manually triggered.
- `provider=deepseek`.
- `input_source=fixture_sample` first, not live data.
- `dry_run=false`.
- `allow_network=true`.
- `acknowledge_cost=true`.
- `acknowledge_non_production=true`.
- `validate_output=true`.
- `max_attempts=1`.
- `timeout_ms=120000`.
- `upload_artifacts=true`.

Expected result:

- one provider call at most.
- output artifact validates or fails safely.
- quality review runs.
- no production data write.
- no frontend change.

## 7. Stop rules

Stop and do not retry repeatedly if:

- provider returns 503 / unavailable.
- provider times out.
- validator fails.
- quality review returns `needs_prompt_revision` or `reject_for_promotion`.
- artifact sanitizer fails.
- output contains unsafe investment / trading wording.
- workflow writes production data.
- workflow modifies frontend / Worker / config / data.
- any check fails.

## 8. Secret rotation / revocation

If a key is exposed in chat, terminal, logs, PR, artifact, or commit:

- revoke it immediately in the provider dashboard.
- create a new key.
- update the GitHub Environment secret only after revocation.
- record the incident in operations notes.

Always preserve these handling rules:

- Never paste the full key into chat or issue / PR comments.
- Never echo the key.
- Never pass the key as a CLI argument.
- Never upload raw provider headers or environment dumps.

## 9. Current go / no-go

Current decision:

- Secret strategy: decided.
- Real provider-call implementation: still NO-GO.
- Secret creation: still NO-GO.
- First real provider call: still NO-GO.

Allowed next PR, only after explicit user approval:

```text
v28.0L-3H Provider-Call Unlock Workflow - Environment Secret Gate / Artifact-Only / No Production Data
```

Not allowed:

- adding `DEEPSEEK_API_KEY` immediately.
- running a real provider call immediately.
- writing production data.
- frontend display.
- Daily integration.

## 10. v28.0L-3H workflow unlock status

v28.0L-3H implements the provider-call unlock workflow path, but only behind the GitHub Environment gate.

Implemented behavior:

- Workflow remains `workflow_dispatch` only.
- Default dry-run still runs without environment approval, without secret access, and without provider call.
- Provider-call path uses environment `external-ai-manual`.
- Environment secret name remains `DEEPSEEK_API_KEY`.
- Secret injection is scoped to the provider-call step only.
- First real provider-call input is restricted to `fixture_sample`.
- `local_compact` remains dry-run-only for L-3H; provider-call mode with `local_compact` fails before provider command with `l3h_first_provider_call_requires_fixture_sample`.
- Provider output remains artifact-only and non-production.
- Output must pass `check:external-ai-output`.
- Quality review must run and keep `promotionEligible=false`.
- Artifact sanitizer runs before upload.
- No production data, frontend, Worker, Daily, scoring, decision, execution, or position path is changed.

This PR does not create the GitHub Environment, does not add `DEEPSEEK_API_KEY`, and does not run DeepSeek. After merge, the next operator step is to create the environment secret, run the default dry-run, then run the first `fixture_sample` provider call with environment approval and record the audit in a follow-up PR.

## 11. v28.0L-3H-1 first fixture provider-call audit

GitHub Actions run `25592238444` recorded the first real `fixture_sample` DeepSeek provider call behind GitHub Environment `external-ai-manual`.

Observed result:

- `provider-test-dry-run-and-gate` passed.
- `provider-call-artifact-only` entered after environment approval.
- the provider key was injected by GitHub Actions as a masked value.
- DeepSeek provider call executed once.
- provider was `deepseek`.
- model was `deepseek-v4-flash`.
- External AI output validation passed.
- DeepSeek manual API test passed.
- warnings: 0.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- quality review failed with `needs_prompt_revision`.
- `promotionEligible=false`.
- artifact sanitizer blocked upload because `provider-test-gate-status.json` contained the diagnostic marker `DEEPSEEK_API_KEY`.

Interpretation:

- This was a safe failure.
- The sanitizer correctly rejected a forbidden marker.
- The blocked marker was the secret name in diagnostic JSON, not the secret value.
- No production data, frontend, Daily, Worker, config, scoring, decision, execution, or position path changed.
- Do not rerun the provider-call workflow until the diagnostic marker fix is merged.

v28.0L-3H-1 removes the literal secret name from workflow diagnostic JSON artifacts and records safer fields such as `secretConfigured` and `secretReference=environment_scoped_provider_key`. The strict sanitizer must continue rejecting `DEEPSEEK_API_KEY`, `Authorization`, `Bearer`, `api_key`, `secrets.`, `GITHUB_TOKEN`, `.env`, raw headers / responses, `data/radar-data.json`, `realtime/`, and `config/`.

Recommended next step after this PR:

```text
v28.0L-3H-2 Fixture Sample Prompt/Quality Revision - No Provider Call
```

## 12. v28.0L-3H-2 prompt revision before rerun

L-3H-2 responds to run `25592238444` without running another provider call.

Status:

- the first call reached DeepSeek behind the environment gate.
- output validation passed.
- DeepSeek manual API test passed.
- quality review blocked promotion with `needs_prompt_revision`.
- `promotionEligible=false`.
- production integration remains `not_ready`.
- frontend display remains `not_ready`.

L-3H-2 improves the fixture prompt contract before any rerun. It does not add secrets, does not read the provider key, does not trigger the workflow, and does not modify production data.

After L-3H-2 is merged and audited, the next real provider-call run must still be `fixture_sample` only. Live/local input remains blocked until fixture quality review passes.

## 13. v28.0L-3H-3 second fixture_sample provider-call audit

GitHub Actions run `25593082968` recorded the successful second `fixture_sample` DeepSeek provider-call audit for the `External AI Manual Provider Test` workflow.

Observed result:

- workflow completed with success.
- `provider-test-dry-run-and-gate` succeeded.
- `provider-call-artifact-only` succeeded.
- provider-call path entered through GitHub Environment `external-ai-manual`.
- `DEEPSEEK_API_KEY` was injected by GitHub Actions as a masked value.
- provider command executed once.
- `apiCalled=true`.
- `networkUsed=true`.
- provider was `deepseek`.
- model was `deepseek-v4-flash`.
- DeepSeek manual API test passed.
- External AI output validation passed.
- warnings: 0.
- External AI artifact quality review passed.
- recommendation was `pass_for_manual_review`.
- `promotionEligible=false`.
- artifact sanitizer passed.
- sanitized provider-call artifacts were uploaded.
- `productionDataWritten=false`.
- `frontendDisplayChanged=false`.
- `artifactOnly=true`.

Interpretation:

- The `fixture_sample` provider path is now audited through provider transport, validator, quality review, sanitizer, and artifact upload.
- Live/local provider path remains `not_ready`.
- Production integration remains `not_ready`.
- Frontend display remains `not_ready`.
- No provider artifact may be promoted into `data/radar-data.json`, Daily, frontend display, Worker payloads, scoring, decision, execution, or position logic.

## 14. v28.0L-3I local_compact provider-call gate design

v28.0L-3I designs a future `local_compact` provider-call path without implementing it.

Gate requirements remain:

- GitHub Environment `external-ai-manual` remains required.
- Environment secret `DEEPSEEK_API_KEY` remains required only for the provider-call step.
- Secret must remain step-scoped and must not be passed as a command-line argument.
- `local_compact` must still use the artifact-only route.
- `max_attempts=1` remains required.
- output validation, quality review, and artifact sanitizer remain required.
- `promotionEligible=false` remains required.
- no production data write.
- no frontend display.
- no Daily integration.
- no scoring / decision / execution / position changes.

The successful `fixture_sample` audit does not authorize production use, live/local execution, provider output promotion, or frontend display.

## 15. v28.0L-3I-0 Node 24 runtime hygiene boundary

v28.0L-3I-0 updates workflow runtime hygiene before any future `local_compact` provider-call implementation.

This does not change provider-call authorization:

- environment `external-ai-manual` remains required for provider calls.
- `DEEPSEEK_API_KEY` remains step-scoped only.
- provider output remains artifact-only.
- `promotionEligible=false` remains required.
- fixture success does not authorize production use.
- live/local provider execution remains blocked until a separate implementation PR is merged and audited.

## 16. v28.0L-3J-4 local_compact environment gate audit

Run `25598887574` confirms that the `external-ai-manual` environment gate has now protected both audited provider-call paths:

- `fixture_sample` passed in run `25593082968`.
- `local_compact` passed in run `25598887574`.

The Environment secret remains step-scoped to the provider-call step, and GitHub Actions injected it only as a masked value for the approved provider step.

This success does not authorize production data writes, frontend display, Daily integration, `externalAiInterpretationLayer` promotion, automatic scheduled provider calls, or scoring / decision / execution / position changes.

## 17. v28.0L-3K production readiness gate note

v28.0L-3K confirms that the `external-ai-manual` environment gate has successfully protected both the `fixture_sample` and `local_compact` provider-call audits.

Secret handling remains unchanged:

- Environment gate remains required.
- `DEEPSEEK_API_KEY` remains step-scoped to the provider-call step.
- Secrets must not be passed as command-line arguments.
- Secrets must not be printed or uploaded in artifacts.

No production write, frontend display, Daily integration, automatic provider call, or provider artifact promotion is approved by this readiness review.
