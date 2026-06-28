# Route-Level Tanker Freight Confirmation Source Review - v1

## 1. Status

- Review only.
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

This review adds the source-review rung for a future **route-level oil tanker
freight confirmation layer**. In plain contract language, this is a
route-level oil tanker freight confirmation layer source review only. It does
not connect route-level Baltic tanker
assessments, freight futures, Vortexa, Kpler, LSEG, Argus, Platts, Clarksons,
Signal Ocean, or any other licensed route-level feed.

Current production state remains:

```text
macroDrivers.energyTransport.transportShockCandidate.routeFreightConfirmation = not_connected
```

## 2. Purpose

`macroDrivers.shippingFreight` already displays aggregate BDTI / BCTI / BDI
pressure through StockQ. That is useful as broad shipping context, but it is
too coarse to confirm a specific oil transport shock around Hormuz, Suez,
Bab el-Mandeb, Cape of Good Hope, or Middle East Gulf product routes.

The future confirmation layer should answer a narrower question:

```text
Did route-level tanker freight move in the same direction as the PortWatch
chokepoint candidate, and did it do so on routes that map to the stressed
chokepoint?
```

This review defines the candidate route basket and the source compliance
boundary before any adapter, artifact, or production display work is allowed.

## 3. Candidate Route Basket

Route selection is intentionally sparse. The goal is confirmation of a
transport shock candidate, not a full freight screen.

| Confirmation bucket | Candidate route family | Why it matters |
|---|---|---|
| Hormuz / Middle East Gulf crude | Baltic dirty tanker routes such as `TD3C`, `TD2`, `TD8`, plus event-specific `TD34` if formally published and licensed | Maps closest to Strait of Hormuz and Middle East Gulf crude export stress |
| Middle East Gulf clean products | Baltic clean tanker routes such as `TC1`, `TC5`, `TC20` | Helps separate crude-only shock from wider product tanker stress |
| Suez / Red Sea / Cape rerouting | Suezmax / Aframax / VLCC routes touching West Africa, US Gulf, Europe, China, or Cape rerouting lanes such as `TD15`, `TD20`, `TD22`, `TD25` | Helps confirm whether PortWatch red-sea-to-cape proxy is reflected in freight |
| Existing broad context | Aggregate `BDTI`, `BCTI`, `BDI` already in `macroDrivers.shippingFreight` | Keeps current card as context only; not route-level confirmation |

The candidate route set is not final source approval. Any production candidate
must prove exact route definitions, data delivery rights, freshness, storage
rights, and redistribution terms.

## 4. Candidate Source Review

### A. Baltic Exchange official tanker route assessments

- Website: <https://www.balticexchange.com/en/data-services/market-information0/tankers-services.html>
- Route documentation: <https://www.balticexchange.com/content/dam/balticexchange/consumer/documents/data-services/documentation/ocean-bulk-guides-policies/GMB.pdf>
- Candidate role: primary route-definition and benchmark source family.
- Candidate level: Level 1 source-review candidate.
- Intended future layer if separately approved: route-level freight confirmation
  for `macroDrivers.energyTransport.transportShockCandidate`.
- Current status: official source family identified, not approved for live
  fetch or production write in this review.

Strengths:

- Official route benchmark owner for Baltic tanker assessments.
- Public documentation defines named dirty and clean tanker routes.
- The route family can map directly to Hormuz, Middle East Gulf, Suez / Red Sea,
  Cape rerouting, and Atlantic substitution baskets.

Risks / limits:

- The public website does not by itself grant automated fetch, storage, or
  redistribution rights for route-level assessment values.
- Production use likely requires a licensed data product or approved vendor
  delivery path.
- A route assessment confirms freight pricing pressure, not a physical cargo
  disruption, blockade, war probability, or oil price direction.

Review outcome:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `routeValueRedistributionApproved=false`

### B. Baltic Exchange / ICE / CME freight derivative venues

- ICE wet freight overview: <https://www.ice.com/products/Futures-Options/Freight/Wet-Freight>
- CME Baltic wet freight futures overview: <https://www.cmegroup.com/markets/freight/baltic-freight.html>
- Candidate role: route-linked market confirmation source family.
- Candidate level: Level 1 / Level 2 source-review candidate.
- Intended future layer if separately approved: market-confirmed route freight
  layer, after exchange data licensing review.
- Current status: official venue family identified, not approved for live fetch
  or production write in this review.

Strengths:

- Freight futures can add market confirmation on top of physical freight route
  assessments.
- TD3C / wet freight contracts are particularly relevant for Middle East Gulf to
  Asia crude transport stress.

Risks / limits:

- Delayed quote pages, settlement data, and derivative contract metadata carry
  separate usage terms.
- Futures may be thinly traded or stale relative to physical assessment moves.
- Derivatives are confirmation only; they cannot replace route assessment data
  or PortWatch physical flow proxy.

Review outcome:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `marketConfirmationApproved=false`

### C. Paid route-level freight intelligence vendors

- Vortexa freight API / SDK source family.
- Kpler freight / vessel movement source family.
- LSEG / Refinitiv, Argus, S&P Global Commodity Insights / Platts, Clarksons,
  and Signal Ocean source families.
- Candidate role: future licensed route-level freight and vessel-flow
  confirmation.
- Candidate level: future licensed source-review only.
- Current status: not part of the no-secret public production path.

Strengths:

- These vendors can combine route-level freight, fixtures, vessel movements,
  cargo flows, and market intelligence.

Risks / limits:

- License, redistribution, and API terms must be reviewed before any adapter.
- Vendor sources must not be mixed into public-source fields or displayed as
  if they were free public benchmarks.
- AIS / vessel-flow products still require jamming, spoofing, dark-vessel, and
  lag caveats.

Review outcome:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `futureLicensedOnly=true`

### D. Existing aggregate StockQ BDTI / BCTI / BDI layer

- Existing production layer: `macroDrivers.shippingFreight`.
- Existing source label: `StockQ:BDTI; StockQ:BCTI; StockQ:BDI`.
- Candidate role: broad context only.
- Current status: already connected as aggregate display-only proxy; not
  route-level confirmation.

Strengths:

- Free public aggregate context is already present.
- Useful for broad shipping stress and front-end context.

Risks / limits:

- Aggregate BDTI / BCTI / BDI cannot distinguish Hormuz from Suez, Red Sea,
  Cape, Atlantic, or product tanker stress.
- It must not be promoted to route-level confirmation.

Review outcome:

- `aggregateContextOnly=true`
- `routeLevelConfirmationApproved=false`
- `eligibleForMainScore=false`

## 5. Future Contract Shape

The next implementation step, if approved later, should be artifact-only before
production. A future production contract may look like:

```text
macroDrivers.energyTransport.routeFreightConfirmation
  contractVersion: route-level-tanker-freight-confirmation-v1
  status: unavailable | insufficient_source_rights | watch | confirmed | contradicted
  confidence: none | low | medium
  routeBasket: [...]
  sourceStatus: {...}
  marketConfirmation: not_connected | futures_proxy | route_assessment_plus_futures
  eligibleForMainScore: false
```

Even after route-level data is connected, it should first remain display-only /
audit-only. Main-score eligibility would require a separate source compliance
review, historical backtest, false-positive analysis, and explicit owner
approval.

## 6. Required Future Sequence

The next allowed step is source-specific proof-of-source design, not runtime
implementation:

```text
source-specific proof-of-source design
  -> compliance review
  -> optional manual artifact scaffold
  -> sanitizer
  -> sample review
  -> production display-only integration review
  -> backtest / scoring review only if explicitly approved later
```

Any network-enabled step must define:

- exact source URL or API endpoint ownership
- route symbols and route definitions
- freshness cadence
- authentication and secret policy
- allowed use / redistribution status
- raw-response storage prohibition
- compact sanitizer fields
- fallback / stale behavior
- short timeout / try-catch behavior
- user-visible wording
- explicit non-scoring boundary

## 7. No-Go Rules

- No live fetch in this rung.
- No workflow automation.
- No new secrets.
- No provider SDKs or npm dependencies.
- No route-level data scraping from pages whose terms are not reviewed.
- No production write.
- No `data/radar-data.json` edit.
- No `realtime/*.json` edit.
- No Worker runtime change.
- No frontend change.
- No ODP `finalBias` change.
- No Brent promotion change.
- No scoring / `decisionModel` / `executionLock` / `positionGuidance` impact.
- No Action Queue / Trigger Monitor / Invalidation Rules impact.
- No World Order weight or Global Risk Heatmap impact.
- No cross-validation matrix input.
- No claim that route-level freight confirms a blockade, war, supply outage,
  dark vessel behavior, or oil price direction.

## 8. Current Decision

Route-level oil tanker freight is a valid confirmation direction, but only as a
controlled source-review candidate today.

Recommended next step:

```text
route_level_tanker_freight_proof_of_source_design_no_live_fetch_no_production_data_write
```

Current production state should remain unchanged:

```text
routeFreightConfirmation = not_connected
marketConfirmation = not_connected
eligibleForMainScore = false
```
