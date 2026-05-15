# External AI Provenance Tracking M-43

M-43 completes the remaining external-AI provenance metadata from the M-39 data-audit follow-up.

## Scope

The projection step now fills six `externalAiInterpretationLayer.provenance` fields from existing workflow context and the DeepSeek output artifact:

| Field | Source | Format |
|---|---|---|
| `runId` | `GITHUB_RUN_ID` | Numeric string |
| `artifactName` | Projection helper | `external-ai-production-refresh-${runId}` |
| `artifactId` | `GITHUB_RUN_ID` + `GITHUB_RUN_ATTEMPT` | Composite string `${runId}-${runAttempt}` |
| `artifactDigest` | SHA256 of the DeepSeek output JSON bytes | 64-character lowercase hex |
| `sourceCommit` | `GITHUB_SHA` | 40-character lowercase hex |
| `sourceDataUpdatedAt` | `data/radar-data.json.updatedAt` at projection read time | ISO timestamp |

This is metadata completion only. It does not change the DeepSeek prompt, provider call, quality review, write guard, frontend display, scoring, decision, execution, or position logic.

## Projection Boundary

`scripts/project-external-ai-production-dry-run.mjs` remains the only place that computes these metadata values. The write step still writes the projected `externalAiInterpretationLayer` as-is and does not mutate provenance.

`artifactId` uses a run-attempt composite because the native GitHub artifact API ID is not available inside the projection step without an additional API call. M-43 avoids that call and keeps provenance derivation local to existing workflow metadata.

## Validation Boundary

M-43 adds `npm run check:external-ai-provenance-completeness`. The check verifies that the six fields exist and validates non-null formats. It emits soft warnings while committed `data/radar-data.json` still contains null values, because real values populate on the next scheduled `external-ai-production-refresh.yml` run.

`scripts/check-external-ai-production-contract.mjs` also validates non-null provenance formats. It deliberately does not enforce non-null so pre-refresh committed data and fixture projections remain valid.

## Data Boundary

No `data/*.json` file is regenerated in M-43. The current committed `externalAiInterpretationLayer` can continue to show null provenance until the next production refresh workflow writes a new projection.

M-43 follows the same audit-completion pattern as M-39 Brent promotionAudit and the M-41 / M-42 fed-liquidity schema additions: add reading/projection logic and guards first, let scheduled production data update afterward.
