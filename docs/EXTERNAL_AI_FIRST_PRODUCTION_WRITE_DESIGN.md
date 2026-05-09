# External AI First Controlled Production Write Design - v28.0L-3O

## 1. Status

This is a design + guard stage only.

- No production write.
- No `data/radar-data.json` modification.
- No frontend display.
- No workflow change.
- No provider call.
- No secret access.
- No Daily integration.
- No automatic provider calls.
- No scoring / decision / execution / position changes.
- This PR does not approve the first write.

## 2. Purpose

The purpose of the future first controlled production write is to insert a validated, quality-reviewed, sanitized, contract-valid `externalAiInterpretationLayer` object into `data/radar-data.json` in a read-only, display-disabled state.

The future first write must be:

- one-time.
- manual.
- explicitly approved.
- contract-validated.
- projection-validated.
- rollback-ready.
- no frontend display.
- no scoring / decision / execution / position impact.

## 3. Proposed future write target

Future target:

```text
data/radar-data.json
```

Future field:

```text
externalAiInterpretationLayer
```

Required target behavior:

- The field must be optional.
- If absent, the site must behave exactly as now.
- If present, the frontend must still not display it until a separate frontend PR.
- The first write must set `displayEnabled=false`.
- The first write must set `boundaries.frontendDisplayApproved=false`.
- The first write must set `boundaries.productionWriteApproved=true` only in the separate explicitly approved write PR, not this PR.

## 4. Future write source

Future write source should be:

```text
manual-artifacts/external-ai/external-ai-production-projection-latest.json
```

or another specified validated projection artifact.

Before write, the source must pass:

- `check:external-ai-output` if derived from provider output.
- `check:external-ai-production-contract`.
- `check:external-ai-production-projection`.
- `check:external-ai-workflow-artifacts` if the artifact came from workflow.
- `check:data` after hypothetical insertion.
- `check:all` after hypothetical insertion.

## 5. Required future write command design

Future command design:

```bash
npm run write:external-ai-production -- --input manual-artifacts/external-ai/external-ai-production-projection-latest.json --target data/radar-data.json --confirm-production-write
```

This command is not implemented by this PR.

If a scaffold command is added in any future pre-write stage, it must be disabled by default, refuse to write, exit non-zero, and print `NO-GO`.

## 6. Required future write gates

Before a future production write PR can actually modify `data/radar-data.json`, all must be true:

- Explicit user approval in chat.
- Separate PR title includes `First Controlled Production Write`.
- Input projection artifact exists.
- Production contract validator passes.
- Projection dry-run passes.
- Source artifact provenance is documented.
- `qualityReview.status` is `pass` or `warn`.
- `qualityReview.recommendation` is `pass_for_manual_review`.
- `qualityReview.promotionEligible=false`.
- `boundaries.displayOnly=true`.
- `boundaries.affectsScoring=false`.
- `boundaries.affectsDecisionModel=false`.
- `boundaries.affectsExecutionLock=false`.
- `boundaries.affectsPositionGuidance=false`.
- `boundaries.notInvestmentAdvice=true`.
- `displayEnabled=false`.
- `frontendDisplayApproved=false`.
- No unsafe execution / trading / position wording.
- No secrets, headers, or raw provider response.
- `data/radar-data.json` remains valid after insertion.
- `check:data` passes.
- `check:all` passes.
- Rollback plan exists.
- No frontend code changes.
- No workflow schedule changes.
- No automatic provider calls.

## 7. Future write rollback plan

Rollback requirements:

- Before write, save current git commit SHA.
- First write must be a small isolated PR.
- Rollback is reverting that PR.
- No manual editing of `data/radar-data.json` outside git.
- No frontend dependency on the field in the first write.
- If data validation fails, revert immediately.
- If frontend unexpectedly changes, revert immediately.

## 8. Future write acceptance criteria

Future first write PR acceptance:

- Only `data/radar-data.json` and directly necessary docs/checks may change.
- `externalAiInterpretationLayer` appears exactly once.
- `displayEnabled=false`.
- `frontendDisplayApproved=false`.
- `productionWriteApproved=true` only if explicitly approved in that PR.
- `check:external-ai-production-contract` passes on the inserted layer or full data object.
- `check:data` passes.
- `check:all` passes.
- Git diff is small and reviewable.
- No frontend files changed.
- No workflow files changed.
- No provider call in the write PR unless separately approved.

## 9. Current decision

- First write design: this PR.
- Write guard scaffold: this PR.
- Actual production write: NO-GO.
- Frontend display: NO-GO.
- Daily integration: NO-GO.
- Automatic provider calls: NO-GO.

Recommended next step:

```text
v28.0L-3P First Controlled Production Write Dry-Run Guard Audit - No Data Write
```

or, only after explicit user approval:

```text
v28.0L-3P First Controlled Production Write - Data Only / No Frontend Display
```
