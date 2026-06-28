# Transport Shock Confirmation Factor Source-to-Score Contract - P-score-1

> **Contract only.** This document defines the staged path for a future
> `Transport Shock Confirmation Factor` / `运输冲击确认因子`.
>
> Current state: no shadow score, no production field, no frontend card, and no
> ODP final-bias or main-judgment weighting change.

---

## 1. Decision

The contract version is:

```text
transport-shock-confirmation-factor-source-to-score-contract-v1
```

The intended future factor is:

```text
transportShockConfirmationFactor
```

The factor is meant to answer a narrower question than the existing ODP
physical-chain verdict:

```text
Are chokepoint, tanker freight, event, market, and facility signals confirming
an oil-transport shock strongly enough to become a small ODP confirmation
factor after shadow scoring and review?
```

It must not reuse ODP `finalBias` as an input. It may reuse raw evidence layers
that already feed ODP displays or `macroDrivers`, but it must avoid feeding an
ODP conclusion back into ODP.

---

## 2. Current Status

This P-score-1 step is only source-to-score contract design.

It does not approve:

- new live fetch
- Solactive value ingestion
- Baltic Weekly Tanker Report parsing
- CME / ICE TD3C value scraping
- route-level Baltic TD / TC route assessment scraping
- production data write
- frontend card implementation
- workflow automation
- Worker runtime changes
- ODP `finalBias` change
- Brent promotion
- main score / today total judgment weighting
- Global Risk Heatmap or cross-validation input

The current production state remains:

```text
transportShockConfirmationFactor = not_connected
transportShockConfirmationFactor.shadowScore = not_generated
macroDrivers.energyTransport.transportShockCandidate.eligibleForMainScore = false
macroDrivers.energyTransport.transportShockCandidate.routeFreightConfirmation = not_connected
```

---

## 3. Candidate Input Baskets

The future factor should combine existing production read-only layers with two
new source-review candidates.

| Basket | Source family | Current status | Target role | Target weight |
|---|---|---|---|---:|
| Chokepoint physical proxy | `macroDrivers.energyTransport` / IMF PortWatch | connected, display-only | Core transport anomaly | 30 |
| Aggregate tanker freight proxy | `macroDrivers.shippingFreight` / StockQ BDTI + BCTI | connected, display-only | Freight-pressure confirmation | 15 |
| Free route-linked wet freight proxy | Solactive wet freight futures index candidate + CME/ICE TD3C link-only/manual reference | source-review pending | Route-linked market proxy | 10 |
| Public weekly route text | Baltic Weekly Tanker Report public route-signal candidate | source-review pending | Weekly TD/TC route direction text | 15 |
| Oil news event layer | `data/oil-news-event-watch.json` | connected, display-only | Event claim / contradiction signal | 15 |
| Market confirmation | ODP Brent price, curve, crack spread evidence | connected, display-only | Price-structure confirmation | 10 |
| Facility / thermal confirmation | `data/oil-thermal-watch.json` | connected, display-only | Facility disruption cross-check | 5 |

Target weights sum to 100. Missing or not-yet-approved baskets must not be
silently redistributed in P-score-1. A later shadow-score implementation may
explicitly define missing-source handling, but only after source-review.

---

## 4. New Data Workstreams

### A. Free Route-Linked Tanker Transport Pressure Proxy

This workstream combines:

- IMF PortWatch / IEA chokepoint context as the physical route proxy.
- StockQ BDTI / BCTI as aggregate tanker freight pressure.
- Solactive wet freight futures index as a future free market proxy candidate.
- CME / ICE TD3C official contract pages as link-only / manual-reference
  candidates.

P-score-1 does not approve Solactive ingestion or CME/ICE value scraping.
P-score-2 must perform source-review before any adapter or production artifact
exists.

### B. Baltic Weekly Tanker Report Public Route Signal

This workstream may use Baltic's public weekly tanker report as a route-text
signal candidate, not as the paid daily route assessment feed.

Allowed future use, if source-review approves:

- low-frequency text-direction extraction
- compact route mention counts
- route-direction bucket such as `tightening`, `easing`, `mixed`, or
  `unavailable`
- source URL and report date

Forbidden without a later reviewed source-rights decision:

- scraping paid Baltic daily TD / TC route assessment values
- storing raw report text
- storing full route value tables
- presenting the text signal as official daily route assessment data
- using it as a single-source ODP direction override

---

## 5. Shadow-First Promotion Path

The only allowed sequence is:

```text
P-score-1 source-to-score contract
  -> P-score-2 free proxy + Baltic Weekly source-review
  -> P-score-3 shadow score builder
  -> P-score-4 frontend card display
  -> P-score-5 sample archive / history
  -> P-score-6 backtest / hit-rate review
  -> P-score-7 ODP candidate overlay
  -> P-score-8 low-weight ODP integration review
  -> P-score-9 frontend contribution explanation
  -> P-score-10 guard checks
```

Any step that writes production data, adds a card, or changes ODP judgment must
be separately reviewed and checker-gated.

---

## 6. Scoring Guardrails

Before this factor can affect the ODP direction, it must satisfy all of these:

- at least one physical transport input is fresh enough;
- at least one non-news confirmation input is present;
- news alone cannot create a positive shock score;
- a single chokepoint anomaly cannot override market and inventory evidence;
- route-level freight values cannot be used unless source rights are approved;
- Baltic Weekly route text cannot be treated as daily route assessment data;
- thermal detections require facility baseline and repeated-observation checks;
- demand destruction or EIA inventory relaxation must cap bullish transport
  shock contribution;
- backtest / sample review must show the factor adds information beyond the
  existing ODP physical-chain verdict.

Initial ODP integration, if later approved, must start as low weight only:

```text
5%-8% maximum contribution to ODP directional reconciliation
```

---

## 7. Boundary

This document does not create a runtime factor. It only locks the future
source-to-score path and prevents accidental shortcutting from source-review
into scoring.

Current boundary:

- no new data source
- no live fetch
- no production data write
- no frontend card
- no workflow automation
- no Worker runtime change
- no ODP `finalBias` change
- no Brent promotion
- no scoring / decision / execution / position impact
- no Global Risk Heatmap impact
- no cross-validation input

