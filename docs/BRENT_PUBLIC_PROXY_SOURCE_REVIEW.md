# Brent Public Proxy Source Review - v28.0M-71

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
- No Brent promotion change.
- No scoring / decision / execution / position impact.

This review executes the conservative public-proxy path for the P3-11 question:
Brent term structure, Platts Dated Brent, and shipping / freight stress.

It does not connect Platts Dated Brent. It does not connect official Dated Brent.
It does not claim physical oil transaction pricing is available.
Platts Dated Brent / 正式 Dated Brent remains unconnected.

## 2. Purpose

The purpose is to identify websites and source families that can support future
audit-only / display-only public proxy observation without confusing proxy data
with formal Platts Dated Brent.

This review is a source-intake rung, not an implementation rung. It gives future
work a controlled candidate list and a set of no-go boundaries before any
network-enabled scaffold or production write is considered.

## 3. Candidate Source Review

### A. EIA Europe Brent Spot Price FOB

- Website: <https://www.eia.gov/opendata/index.php/browser/petroleum/>
- Example table: <https://www.eia.gov/dnav/pet/hist/leafhandler.ashx?f=m&n=pet&s=rbrte>
- Candidate role: public Brent spot proxy comparison.
- Candidate level: Level 1 / Level 2 source-review candidate.
- Intended layer if later approved: daily history / public proxy observation.
- Current status: public candidate, not approved for new live fetch in this PR.

Strengths:

- Public agency source.
- Open Data API exists for petroleum datasets.
- Fits the existing `brentPricingLayer` public proxy framing.

Risks / limits:

- It is still a public Brent spot proxy, not Platts Dated Brent.
- It may overlap with current FRED `DCOILBRENTEU` anchor semantics.
- It should not be added as a second Brent main source without a separate
  source-contract review.

Review outcome:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `officialDatedBrent=false`

### B. ICE Brent Crude Futures / ICE data services

- Product page: <https://www.ice.com/products/219>
- Data services overview: <https://www.ice.com/data-services/derivatives/commodity-energy>
- Candidate role: Brent futures curve / term structure candidate.
- Candidate level: Level 1 / Level 2 source-review candidate.
- Intended layer if later approved: public proxy observation or licensed market
  data adapter, depending on access terms.
- Current status: official futures source family identified, not approved for
  live fetch in this PR.

Strengths:

- ICE is the official venue for Brent futures.
- The Brent futures product describes the contract family and long contract
  series, making it the correct source family for term-structure work.

Risks / limits:

- Official data delivery may require ICE Data Services, vendor terms, or a
  licensed redistribution path.
- Public product pages are not an approval to scrape or redistribute data.
- Futures term structure is not Platts Dated Brent and not physical spot
  transaction pricing.

Review outcome:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `officialDatedBrent=false`

### C. Baltic Exchange freight benchmarks

- Website: <https://www.balticexchange.com/en/data-services.html>
- Indices page: <https://www.balticexchange.com/en/data-services/market-information0/indices.html>
- Candidate role: shipping / freight stress source family.
- Candidate level: Level 1 / Level 2 source-review candidate.
- Intended layer if later approved: freight stress audit-only / diagnostic-only
  observation.
- Current status: official benchmark source family identified, not approved for
  live fetch in this PR.

Strengths:

- Official freight benchmark provider.
- Covers dry bulk, tanker, gas, container box, and air freight markets.
- Strong fit for future freight stress review.

Risks / limits:

- Data access and redistribution are likely governed by Baltic Exchange terms
  and vendor arrangements.
- Freight benchmarks do not equal Brent physical pricing.
- Freight stress must not be used to infer a specific oil cargo price without a
  separate methodology review.

Review outcome:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `officialDatedBrent=false`

### D. Freightos Baltic Index

- Website: <https://www.freightos.com/data/>
- Terminal / data overview: <https://terminal.freightos.com/about-freightos-data/>
- Candidate role: container freight public proxy candidate.
- Candidate level: Level 1 / Level 2 source-review candidate.
- Intended layer if later approved: shipping / freight stress public proxy
  observation.
- Current status: public / account-based candidate, not approved for live fetch
  in this PR.

Strengths:

- Daily container freight benchmark family.
- Some public/free access is advertised, with richer export / API paths tied to
  account or subscription terms.

Risks / limits:

- Container freight is not crude tanker freight.
- Free visual access does not automatically allow automated fetch, storage, or
  redistribution.
- Must be labeled as a container freight proxy if ever displayed.

Review outcome:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `officialDatedBrent=false`

### E. S&P Global Commodity Insights / Platts

- Market Data: <https://www.spglobal.com/commodity-insights/en/products-solutions/market-data>
- Platts Market Data: <https://commodityinsights.spglobal.com/plattsmarketdata.html>
- Candidate role: future licensed source for formal Platts Dated Brent.
- Candidate level: future licensed source only.
- Current status: not part of the public-proxy implementation path.

Strengths:

- Correct source family for formal Platts Dated Brent and broad commodity
  assessments.

Risks / limits:

- Requires subscription / contractual approval.
- Not suitable for this no-secret, no-live-fetch, public-proxy rung.

Review outcome:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `officialDatedBrent=false`
- `futureLicensedOnly=true`

## 4. Architecture Assignment

All future work must assign sources to existing architecture layers. No
standalone pipeline is approved.

| Candidate | Allowed future layer before approval | Disallowed path |
|---|---|---|
| EIA Brent spot proxy | `daily_history_layer` or `frontend_display_layer` review | Direct `values.brent` replacement |
| ICE Brent futures curve | `artifact_sanitizer_layer` or licensed `daily_history_layer` review | Scraped Worker term-structure fetch |
| Baltic Exchange freight | `artifact_sanitizer_layer` / audit-only review | Scoring or decision modifier |
| Freightos Baltic Index | `artifact_sanitizer_layer` / audit-only review | Crude tanker or Dated Brent claim |
| S&P / Platts | future licensed source-review only | Public-proxy implementation |

## 5. Required Future Sequence

The next allowed step is source-specific design, not runtime implementation:

```text
source-specific proof-of-source design -> source compliance review -> optional artifact-only scaffold -> sanitizer -> separate production integration review
```

Any network-enabled step must define:

- exact source URL or API endpoint ownership
- allowed use / redistribution status
- authentication and secret policy, if any
- freshness cadence
- failure fallback
- short timeout / try-catch behavior
- artifact sanitizer requirements
- production write guard
- explicit display wording

## 6. No-Go Rules

- No live fetch in this rung.
- No workflow automation.
- No new secrets.
- No provider SDKs or npm dependencies.
- No direct source URL persistence in production data.
- No `data/radar-data.json` write.
- No `realtime/*.json` write.
- No Worker runtime change.
- No frontend change.
- No `values.brent` change.
- No Brent promotion change.
- No scoring / `decisionModel` / `executionLock` / `positionGuidance` impact.
- No Action Queue / Trigger Monitor / Invalidation Rules impact.
- No claim that formal Platts Dated Brent or official Dated Brent is connected.

## 7. Current Decision

M-71 completes public-proxy source review only.

The conservative public-proxy path is viable for future audit-only observation,
with the strongest near-term candidates being:

1. EIA Europe Brent Spot Price FOB for public Brent spot proxy comparison.
2. ICE Brent futures source family for term-structure review.
3. Baltic Exchange / Freightos source families for shipping and freight stress
   review.

Formal Platts Dated Brent remains future licensed source only.

Recommended next step:

```text
v28.0M-72 Brent public proxy proof-of-source design - No live fetch / no production data write
```
