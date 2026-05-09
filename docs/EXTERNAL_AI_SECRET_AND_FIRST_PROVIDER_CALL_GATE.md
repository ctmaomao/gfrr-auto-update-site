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
