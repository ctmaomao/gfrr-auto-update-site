# Transport Shock Confirmation Factor Source Review

Status: **P-score-2 source-review only**

Contract version: `transport-shock-confirmation-factor-source-review-v1`

This document reviews two future input workstreams for the
`Transport Shock Confirmation Factor`:

- **Free Route-Linked Tanker Transport Pressure Proxy**
- **Baltic Weekly Tanker Report public route-signal**

It does not create a live adapter, production data field, frontend card,
shadow score, ODP `finalBias` change, or main judgment weighting.

---

## 1. Hard Boundary

Review only:

- No live fetch
- No production data write
- No workflow change
- No frontend change
- No Worker runtime change
- No shadow score
- No ODP `finalBias` change
- No Brent promotion change
- No main-score or today-judgment weighting
- No Global Risk Heatmap input
- No cross-validation input

Current production fields must remain unchanged:

```text
macroDrivers.energyTransport.transportShockCandidate.eligibleForMainScore = false
macroDrivers.energyTransport.transportShockCandidate.routeFreightConfirmation = not_connected
macroDrivers.energyTransport.transportShockCandidate.marketConfirmation = not_connected
```

---

## 2. Source Families Reviewed

| Source family | Public source evidence | Candidate role | P-score-2 status |
|---|---|---|---|
| IMF PortWatch chokepoints | PortWatch exposes daily chokepoint transit calls / trade-volume estimate datasets and Feature Service endpoints. | Physical route context already used by `macroDrivers.energyTransport`. | already connected as display-only context; not route freight confirmation |
| IEA Middle East Maritime Chokepoints monitor | IEA states its monitor shows Middle East chokepoint traffic flows and draws on IMF PortWatch. | Public context / sanity check for Middle East chokepoints. | link-only context candidate |
| Solactive Breakwave Wet Freight Futures Index | Solactive describes an index tracking tanker freight futures, weighted mainly to TD3C VLCC and TD20 Suezmax futures. | Free route-linked wet freight market proxy candidate. | source-review approved for future manual/link-only sample review, not live ingestion |
| CME TD3C public product page | CME publishes TD3C futures quotes/spec pages for Middle East to China Baltic route futures. | Link-only/manual reference for MEG-China freight pressure. | link-only/manual reference; no value scraping approved |
| ICE TD3C public product page | ICE describes TD3C FFA Middle East Gulf to China as a monthly cash-settled future based on the Baltic TD3C index. | Link-only/manual reference / source cross-check. | link-only/manual reference; no value scraping approved |
| Baltic Weekly Tanker Report | Baltic publishes public weekly tanker report pages under Weekly Market Roundups. | Low-frequency route text direction candidate. | public text source candidate, no paid daily route assessment use |
| Baltic tanker services / daily assessments | Baltic describes tanker market information including daily physical and forward assessments. | Rights boundary / non-approved source family. | not approved for scraping, caching, or value display |

Reference URLs:

- https://portwatch.imf.org/search?collection=dataset
- https://portwatch.imf.org/pages/data-and-methodology
- https://www.iea.org/data-and-statistics/data-tools/middle-east-maritime-chokepoints-shipping-monitor
- https://www.solactive.com/index/DE000SL0HLG3/
- https://www.cmegroup.com/markets/energy/freight/tanker-route-td3-middle-eastern-gulf-meg-to-japan-250k-metric-tons-freight-swap-futures.html
- https://www.cmegroup.com/markets/energy/freight/tanker-route-td3-middle-eastern-gulf-meg-to-japan-250k-metric-tons-freight-swap-futures.contractSpecs.html
- https://www.ice.com/products/57250507/TD3C-FFA-Middle-East-Gulf-to-China-%28Baltic%29-Future
- https://www.balticexchange.com/en/data-services/WeeklyRoundup.html
- https://www.balticexchange.com/en/data-services/market-information0/tankers-services.html

---

## 3. Free Route-Linked Tanker Transport Pressure Proxy

The free proxy basket can become useful only as a **confirmation layer**, not a
primary transport-shock detector.

Allowed future scope after this review:

- manual or link-only review of Solactive Breakwave Wet Freight Futures Index
- manual or link-only TD3C reference to CME / ICE public product pages
- comparison against PortWatch chokepoint direction and StockQ BDTI/BCTI broad
  tanker context
- compact route-pressure bucket such as `tightening`, `easing`, `mixed`, or
  `unavailable`

Not approved:

- automatic Solactive page scraping
- automatic CME / ICE value scraping
- route-level Baltic TD/TC value redistribution
- writing a production route-freight field
- scoring, ODP `finalBias`, or main judgment use

Interpretation rule:

```text
Free proxy can support transport-pressure confirmation only when it agrees with
PortWatch route stress and broad tanker freight context. It cannot confirm
chokepoint closure, war disruption, actual oil cargo flow, or oil-price
direction by itself.
```

---

## 4. Baltic Weekly Tanker Report Public Route Signal

Baltic Weekly Tanker Report can be considered only as a public weekly text
signal. It must not be treated as the licensed daily Baltic route assessment
feed.

Allowed future scope after this review:

- low-frequency weekly text-direction extraction
- route mention count by public route labels such as TD3C, TD20, TC5, TC14
- route-direction bucket such as `tightening`, `easing`, `mixed`, or
  `unavailable`
- link attribution to the public weekly report page

Not approved:

- scraping or storing paid daily Baltic route assessment values
- reconstructing route assessment history from Baltic public text
- redistributing Baltic route values
- treating weekly commentary as daily freight confirmation
- production write, frontend display, shadow score, or main-score use

Interpretation rule:

```text
Baltic Weekly route text can describe whether public commentary is broadly
tightening or easing. It cannot be the route-level assessed value source and
cannot by itself unlock routeFreightConfirmation.
```

---

## 5. Source-Rights Classification

| Candidate | Future status allowed by this review | Required next gate |
|---|---|---|
| IMF PortWatch / IEA chokepoint context | already display-only context | no scoring without shadow-score contract |
| Solactive Breakwave wet freight index | manual/link-only sample candidate | manual artifact scaffold and terms review |
| CME TD3C page | manual/link-only reference | no value scraping without explicit rights review |
| ICE TD3C page | manual/link-only reference | no value scraping without explicit rights review |
| Baltic Weekly Tanker Report | public weekly text candidate | text-only manual sample review |
| Baltic daily TD/TC route assessments | blocked | explicit source-rights approval required |

No source is approved for live production ingestion in P-score-2; the reviewed
sources are not approved for live production ingestion.

---

## 6. Next Allowed Step

The next allowed step is:

```text
transport_shock_confirmation_factor_manual_sample_scaffold_no_live_fetch_no_production_write
```

That step may create a local ignored artifact helper to review manually supplied
source observations. It still must not write production data or change display,
ODP, scoring, decision, execution, position, Brent promotion, Global Risk
Heatmap, or cross-validation.

---

## 7. Result

P-score-2 conclusion:

```text
source_review_ready_for_manual_sample_scaffold
```

The free route-linked proxy and Baltic Weekly route text are plausible future
confirmation inputs, but they remain **not connected**. The project should next
build an ignored manual sample scaffold before any shadow score or frontend card
is attempted.
