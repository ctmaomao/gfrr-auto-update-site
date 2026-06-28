# Route-Level Tanker Freight Production Write Readiness - v1

> **Manual/local readiness gate only.** This document defines the pre-write
> readiness gate for a possible future route-level tanker freight production
> field, but it does not approve a production write.
>
> The current status remains **no production write**: no live fetch, no API key,
> no workflow, no Worker runtime, no frontend implementation, no ODP `finalBias`,
> no Brent promotion, no scoring, no decision, no execution, no position, no
> Global Risk Heatmap, and no cross-validation.

---

## 1. Purpose

The route-level tanker freight chain now has:

- source review
- proof-of-source design
- manual artifact review
- manual sample review
- display-only candidate contract
- production display projection
- production display projection review
- frontend display brief

This readiness gate combines the latest reviewed projection, display contract,
and frontend brief into one artifact:

```text
route-level-tanker-freight-production-write-readiness-v1
```

It answers a narrow question:

```text
Is there enough reviewed non-production evidence to start a separate production
writer contract design?
```

It does **not** answer:

```text
Can the project write macroDrivers.energyTransport.routeFreightConfirmation now?
```

That answer stays no.

---

## 2. Command

```powershell
npm run review:route-level-tanker-freight-production-write-readiness -- `
  --projection-review manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-production-display-projection-review-latest.json
```

Default output:

```text
manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-production-write-readiness-latest.json
```

The helper is local/manual only. It reads only `manual-artifacts/` or
`docs/fixtures/`, writes only ignored `manual-artifacts/`, and never reads
secrets or network sources.

---

## 3. Required Inputs

| Input | Required state |
|---|---|
| Projection review | `route-level-tanker-freight-production-display-projection-review-v1`, `status=pass` |
| Display contract | `route-level-tanker-freight-display-contract-v1`, `contract_only_no_production_write` |
| Frontend brief | `route-level-tanker-freight-frontend-display-brief-v1`, `docs_only_no_frontend_implementation` |

The readiness gate requires reviewed projection/sample evidence, but it keeps
source-rights as `manual_review_required`. That is intentional: source-rights
approval must be a separate human/compliance decision before any production
writer can be implemented.

---

## 4. Output Semantics

Allowed readiness output:

```text
status=pass
recommendation=ready_for_separate_production_write_design_keep_non_production
nextAllowedStep=separate_production_writer_contract_design
productionWriteApproved=false
routeFreightConfirmation=not_connected
```

This means the next engineering step may design a production writer contract.
It does not mean the writer exists, is enabled, or may write production data.

Immediate production write remains blocked by:

- `source_rights_and_redistribution_not_approved`
- `production_writer_contract_not_reviewed`
- `production_write_workflow_not_approved`
- `live_fetch_not_approved`
- `frontend_implementation_not_approved`
- `scoring_backtest_not_approved`

---

## 5. Boundary

The readiness artifact must keep:

- `productionDataWriteApproved=false`
- `productionWriteApproved=false`
- `frontendImplementationApproved=false`
- `workflowAutomationApproved=false`
- `liveFetchApproved=false`
- `mainScoreApproved=false`
- `odpFinalBiasApproved=false`
- `brentPromotionApproved=false`
- `globalRiskHeatmapApproved=false`
- `crossValidationApproved=false`

It must not change:

- `data/radar-data.json`
- `data/oil-directional-pressure.json`
- `index.html`
- `scripts/modules/renderOilDirectional.js`
- Worker runtime
- GitHub workflows
- scoring / decision / execution / position paths

---

## 6. Verification

The guard is:

```powershell
npm run check:route-level-tanker-freight-production-write-readiness
```

That checker verifies:

- the helper is no-network / no-env / no-production-write
- the fixture output can reach design-readiness while still blocking immediate
  production write
- runtime/frontend/data files do not contain readiness markers
- authority docs register the boundary

---
