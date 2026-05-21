# Brent Physical / Term / Freight Proof-of-Source Design - v28.0M-74

## 1. Status

- Design only.
- Source-specific proof-of-source only.
- No live fetch.
- No source approval.
- No production data write.
- No `data/radar-data.json` modification.
- No `realtime/*.json` modification.
- No workflow change.
- No frontend change.
- No Worker runtime change.
- No `values.brent` change.
- No Brent promotion change.
- No scoring / decision / execution / position impact.

This design starts the three M-71 follow-up tracks without pretending they are
connected:

1. Platts Dated Brent / formal Dated Brent.
2. Brent futures term structure.
3. Shipping / freight stress.

It does not connect Platts Dated Brent. It does not connect official Dated
Brent. It does not fetch ICE, Baltic Exchange, Freightos, or S&P / Platts data.

## 2. Purpose

M-71 identified the source families. M-74 defines the source-specific
proof-of-source contract for the next artifact-only step.

This PR answers a narrower question than production integration:

```text
What exact proof must be collected before any Brent physical / term /
freight source can be considered for audit-only runtime integration?
```

The answer is still conservative. Public pages and product descriptions are
not production data rights. Licensed benchmark products remain blocked until
license, redistribution, and display terms are reviewed.

## 3. Track A - Platts Dated Brent / Formal Dated Brent

- Source family: S&P Global Commodity Insights / Platts.
- Proof target: formal licensed Dated Brent source path.
- Public role: methodology and product-identification evidence only.
- Data status: licensed-only; no public fetch candidate in this PR.
- Runtime status: not connected.

Required proof before any future implementation:

- licensed data contract or written permission for the exact Dated Brent field
- allowed-use and redistribution terms
- delivery channel review (API, FTP, platform export, or manual licensed file)
- assessment identifier / symbol mapping review
- assessment timestamp / publication cadence review
- no raw vendor headers, request URLs, cookies, or credentials in artifacts
- explicit user-facing wording that this is licensed Platts Dated Brent only
  after approval, not a public proxy

Current decision:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `formalPlattsDatedBrentConnected=false`
- `licensedAccessRequired=true`
- `publicProxyAllowed=false`

## 4. Track B - Brent Term Structure

- Source family: ICE Brent Crude Futures / ICE Data Services.
- Proof target: ICE Brent futures curve shape.
- Public role: product / delayed quote / report-center availability evidence.
- Data status: no live fetch approved; future path must be manual artifact,
  export, or licensed data adapter.
- Runtime status: not connected.

Required proof before any future implementation:

- source page or licensed report identity
- allowed-use and redistribution terms
- whether prices are delayed, settlement, last, bid / ask, or indicative
- contract month mapping, including front-month roll policy
- observedAt and market date policy
- curve shape requirements: at least front 6 contracts for first proof
- required fields: `contractMonth`, `priceType`, `price`, `currency`,
  `unit`, `observedAt`, `delayStatus`, `sourceKey`
- sanitizer rule rejecting missing contract months, non-positive prices,
  unsorted curve records, and HTML error pages
- explicit wording: futures curve is not Platts Dated Brent and not physical
  cargo pricing

Current decision:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `brentTermStructureConnected=false`
- `officialDatedBrent=false`

## 5. Track C - Shipping / Freight Stress

### Baltic Exchange freight benchmarks

- Source family: Baltic Exchange data services / indices.
- Proof target: licensed freight benchmark path, with tanker routes preferred
  for any crude-specific review.
- Public role: benchmark family and licensing evidence.
- Data status: licensed / subscription path; no live fetch approved.
- Runtime status: not connected.

Required proof before any future implementation:

- index family and route list, including whether tanker, dry bulk, container,
  or air freight
- allowed-use and redistribution terms
- publication cadence and market date policy
- unit / route / vessel-class mapping
- route aggregation policy, if any
- explicit wording that freight stress is not Brent physical pricing

### Freightos Baltic Index

- Source family: Freightos Baltic Index / Freightos Terminal.
- Proof target: container freight public-proxy candidate.
- Public role: methodology and trade-lane evidence.
- Data status: public methodology / visual access may exist, but export,
  API, history, and redistribution require separate review.
- Runtime status: not connected.

Required proof before any future implementation:

- FBX lane identity and route mapping
- daily / weekly publication cadence
- whether values are public, account-based, subscription, or licensed export
- expected fields: `laneCode`, `laneName`, `containerSize`, `price`,
  `currency`, `observedAt`, `delayStatus`, `sourceKey`
- sanitizer rule rejecting crude-tanker wording for FBX container data
- explicit wording: container freight is a shipping proxy only, not crude
  tanker freight and not Dated Brent

Current decision for both freight tracks:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `shippingFreightConnected=false`
- `affectsScoring=false`
- `affectsDecisionModel=false`

## 6. Future Artifact Contract

The next allowed implementation rung is still artifact-only and manually
reviewed. It may create ignored artifacts under:

```text
manual-artifacts/brent-physical-proof-of-source/<timestamp>/
```

M-74 does not create that script and does not create any artifact records.

Future proof artifacts must keep raw source payloads out of committed files and
must expose only sanitized diagnostics such as:

```json
{
  "contractVersion": "future-brent-physical-proof-artifact",
  "kind": "brent_physical_proof_of_source_artifact",
  "status": "artifact_only_manual_review",
  "records": [],
  "sourceApprovals": {
    "sourceApproved": false,
    "liveFetchApproved": false,
    "productionDataWriteApproved": false
  }
}
```

## 7. Failure Behavior

- If Platts / S&P licensing is absent, formal Dated Brent remains unconnected.
- If ICE allowed-use or field mapping is unclear, Brent term structure remains
  unconnected.
- If Baltic Exchange licensing is absent, licensed freight benchmarks remain
  unconnected.
- If Freightos data is only visual or subscription-gated, it remains
  unconnected.
- If any artifact contains secrets, cookies, request headers, raw vendor
  payloads, or HTML error pages, the sanitizer must fail closed.
- If a future source artifact includes trading advice, scoring changes, or
  decision language, the sanitizer must fail closed.

## 8. No-Go Rules

- Do not claim formal Platts Dated Brent is connected.
- Do not claim official Dated Brent is connected.
- Do not label ICE futures as physical spot Dated Brent.
- Do not label Freightos FBX as crude tanker freight.
- Do not let freight stress alter scoring, decision, execution, or position.
- Do not use source pages as permission to scrape.
- Do not add a workflow, cron, secret, Worker fetch, frontend display, or data
  write in this rung.

## 9. Current Decision

M-74 starts the three requested tracks, but only as source-specific
proof-of-source design:

| Track | M-74 outcome | Still missing |
|---|---|---|
| Platts Dated Brent / formal Dated Brent | Licensed-only proof contract defined | License / delivery channel / production integration |
| Brent term structure | ICE futures curve proof contract defined | Artifact-only capture / sanitizer / later integration |
| Shipping / freight stress | Baltic + Freightos proof contracts defined | License or compliant public export / sanitizer / later integration |

The next allowed step is:

```text
brent physical proof-of-source artifact-only manual capture scaffold - no network by default / no production data write
```

## 10. Evidence Sources Checked

These references are source-family evidence only. They are not live-fetch
approval and are not production data inputs.

| Track | Evidence source |
|---|---|
| Formal Dated Brent | S&P Global Energy Platts Dated Brent price assessment explainer: <https://www.spglobal.com/energy/en/pricing-benchmarks/assessments/crude-oil/dated-brent-price-explained> |
| Formal Dated Brent delivery channel | S&P Global Energy market data overview: <https://www.spglobal.com/energy/en/products-solutions/market-data> |
| Brent term structure | ICE Brent Crude Futures product/data pages: <https://www.ice.com/products/219/Brent-Crude-Futures> |
| Brent reports | ICE Report Center: <https://www.ice.com/report-center> |
| Freight benchmarks | Baltic Exchange data services: <https://www.balticexchange.com/en/data-services.html> |
| Freight licensing | Baltic Exchange market data methodology/access note: <https://www.balticexchange.com/en/data-services/Methodology/market-data.html> |
| Container freight proxy | Freightos Baltic Index overview: <https://www.freightos.com/data/> |
