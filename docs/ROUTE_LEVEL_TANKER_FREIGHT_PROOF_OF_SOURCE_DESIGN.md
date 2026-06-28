# Route-Level Tanker Freight Proof-of-Source Design - v1

## 1. Status

- Design only.
- No live fetch.
- No production source approval.
- No production data write.
- No `data/radar-data.json` modification.
- No `realtime/*.json` modification.
- No workflow change.
- No frontend change.
- No Worker runtime change.
- No ODP `finalBias` change.
- No Brent promotion change.
- No scoring / decision / execution / position impact.

This design follows
[`ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md).
It does not implement a fetcher. It defines the proof-of-source contract that
must pass before a later manual artifact scaffold can exist.

## 2. Objective

The future route-level tanker freight layer should confirm whether a
`transportShockCandidate` from PortWatch is also visible in route-level tanker
freight. It should not replace PortWatch, StockQ BDTI/BCTI/BDI, ODP EIA weekly
anchors, Brent market confirmation, or oil-news event watch.

The minimum future confirmation question is:

```text
PortWatch chokepoint candidate -> route family mapped to same chokepoint ->
licensed/manual route freight evidence -> market confirmation remains display-only
```

## 3. Source Acceptance Gates

A route-level tanker freight source must satisfy all gates before any runtime
adapter can be considered.

| Gate | Requirement | Failure result |
|---|---|---|
| Route identity | Route code, vessel class, load/discharge geography, cargo type, and unit are documented | `source_rejected_route_definition_missing` |
| Source ownership | Source owner or licensed vendor path is identified | `source_rejected_owner_unknown` |
| Usage rights | Automated fetch, storage, compact redistribution, and citation rights are explicitly reviewed | `source_rejected_usage_rights_unproven` |
| Freshness | Expected cadence and latest timestamp semantics are documented | `source_rejected_freshness_unknown` |
| Unit semantics | Worldscale / dollar-per-ton / time-charter equivalent / futures settlement unit is explicit | `source_rejected_unit_unknown` |
| Sanitization | Raw provider response is not stored; compact fields only | `source_rejected_sanitizer_missing` |
| Fallback | Missing/stale/partial states are fail-closed | `source_rejected_fallback_missing` |
| Non-scoring boundary | Source remains audit-only/display-only until separate backtest and owner approval | `source_rejected_boundary_missing` |

No source can pass proof-of-source because it appears in a public page alone.
Public visibility is not the same as automated collection or redistribution
permission.

## 4. Route Mapping Contract

The route map is a **candidate mapping**, not production data.

| Future bucket | Candidate route codes | Candidate source family | Intended confirmation role |
|---|---|---|---|
| `hormuz_meg_crude` | `TD3C`, `TD2`, `TD8`; optional `TD34` only if formally published and licensed | Baltic route assessment / licensed vendor / freight futures | Strait of Hormuz and Middle East Gulf crude transport stress |
| `meg_clean_products` | `TC1`, `TC5`, `TC20` | Baltic route assessment / licensed vendor / freight futures | Middle East Gulf clean/product tanker stress |
| `red_sea_suez_cape_rerouting` | `TD15`, `TD20`, `TD22`, `TD25` | Baltic route assessment / licensed vendor / freight futures | Red Sea, Suez, Bab el-Mandeb, Cape rerouting confirmation |
| `aggregate_context_only` | `BDTI`, `BCTI`, `BDI` | Existing StockQ public aggregate layer | Broad context only; never route-level confirmation |

The future implementation must keep route values separated from aggregate
StockQ BDTI/BCTI/BDI. Aggregate indexes can provide context, but they cannot
turn `routeFreightConfirmation` into `confirmed`.

## 5. Manual Artifact Candidate Shape

The next allowed implementation step is a local/manual artifact scaffold. It
should read a user-provided file from `manual-artifacts/` and produce an
ignored review artifact only. It must not fetch the internet or write
production data.

Candidate input shape:

```json
{
  "schemaVersion": "route-level-tanker-freight-manual-input-v1",
  "preparedAt": "2026-06-28T00:00:00.000Z",
  "sourceReview": {
    "sourceOwner": "Baltic Exchange or licensed vendor",
    "licenseReviewed": false,
    "redistributionApproved": false,
    "operatorAttestation": "manual source review only"
  },
  "routes": [
    {
      "routeCode": "TD3C",
      "bucketKey": "hormuz_meg_crude",
      "assessmentDate": "YYYY-MM-DD",
      "unit": "Worldscale or USD/ton or futures_settlement_unit",
      "value": 0,
      "dailyChangePct": null,
      "weeklyChangePct": null,
      "sourceCitation": "operator-provided citation"
    }
  ]
}
```

Candidate review artifact shape:

```json
{
  "schemaVersion": "route-level-tanker-freight-proof-review-v1",
  "status": "dry_run_only",
  "promotionEligible": false,
  "productionWriteApproved": false,
  "routeFreightConfirmation": "not_connected",
  "eligibleForMainScore": false,
  "review": {
    "acceptedRouteCount": 0,
    "rejectedRouteCount": 0,
    "bucketCoverage": {}
  }
}
```

The scaffold must reject any artifact that claims `licenseReviewed=true` and
`redistributionApproved=true` without a separate compliance review. Those fields
are future gates, not operator shortcuts.

## 6. Future Production Contract

If a later production display-only integration is approved, the contract should
remain separate from the current `transportShockCandidate` until reviewed:

```text
macroDrivers.energyTransport.routeFreightConfirmation
  contractVersion: route-level-tanker-freight-confirmation-v1
  status: unavailable | insufficient_source_rights | no_route_confirmation | watch | confirmed | contradicted
  confidence: none | low | medium
  sourceStatus:
    routeAssessments: missing | manual_reviewed | licensed_live | stale
    freightFutures: not_connected | live_proxy | stale | missing
  routeBasket: compact sanitized route summaries
  confirmationFor:
    hormuz_meg_crude
    meg_clean_products
    red_sea_suez_cape_rerouting
  routeFreightConfirmation: not_connected | watch | confirmed | contradicted
  marketConfirmation: not_connected | futures_proxy | route_assessment_plus_futures
  eligibleForMainScore: false
```

Even this future production contract must stay display-only until a separate
scoring review is completed.

## 7. Main-Score Eligibility Gate

This design does not approve main-score use. Main-score eligibility requires a
later scoring gate with:

- licensed or legally usable source path
- at least 90 days of stable route observations, preferably 12+ months
- stale/missing false-positive review
- backtest against Brent direction and volatility windows
- conflict handling when route freight, PortWatch, news, and Brent disagree
- explicit cap on contribution to avoid double-counting oil/geopolitical risk
- owner approval to change `values.*` / scoring / decision contract

Until then:

```text
eligibleForMainScore=false
routeFreightConfirmation=not_connected
marketConfirmation=not_connected
```

## 8. No-Go Rules

- No network call in proof-of-source design.
- No route-level values in production data.
- No raw provider response storage.
- No screenshots or copied licensed tables committed.
- No automated scrape of Baltic, ICE, CME, or vendor pages.
- No secrets or provider SDKs.
- No workflow automation.
- No frontend display.
- No ODP `finalBias` change.
- No Brent promotion change.
- No scoring / decision / execution / position impact.
- No World Order weight or Global Risk Heatmap impact.
- No cross-validation matrix input.
- No claim that freight confirms blockade, war, supply outage, dark vessel
  behavior, or oil price direction.

## 9. Current Decision

This design is sufficient to start the next **manual artifact scaffold** slice:

```text
route_level_tanker_freight_manual_artifact_scaffold_dry_run_only
```

That next slice may add a local script and fixtures, but it must remain
dry-run-only and ignored-artifact-only.
