# Transport Shock Confirmation Factor Market Confirmation Source Review

Status: **P-score-15 market-confirmation source-review only**

Contract version:
`transport-shock-confirmation-factor-market-confirmation-source-review-v1`

This document reviews already-connected public market evidence that may later
support `macroDrivers.energyTransport.transportShockCandidate.marketConfirmation`.
It does not connect that field.

---

## 1. Hard Boundary

Review only:

- No live fetch
- No new data source
- No production data write
- No workflow change
- No frontend change
- No Worker runtime change
- No marketConfirmation write
- No score write
- No ODP `finalBias` change
- No Brent promotion change
- No main-score or today-judgment weighting
- No Global Risk Heatmap input
- No cross-validation input

Current production field must remain unchanged:

```text
macroDrivers.energyTransport.transportShockCandidate.marketConfirmation = not_connected
macroDrivers.energyTransport.transportShockCandidate.eligibleForMainScore = false
```

---

## 2. Source Families Reviewed

| Source family | Existing production evidence | Candidate market-confirmation role | P-score-15 status |
|---|---|---|---|
| Brent futures price curve proxy | `brentPricingLayer.futuresPriceCurve` / Yahoo BZ monthly futures proxy | Prompt/back structure and front-minus-back observation | connected display-only; candidate for manual market-confirmation sample review |
| ICE Brent futures structure context | `brentPricingLayer.futuresCurve` / ICE public contract structure | Contract calendar and structure context, not official settlement curve | connected display-only context; no price confirmation by itself |
| EIA Brent spot proxy | `brentPricingLayer.eiaBrentSpotProxy` / EIA RBRTE public HTML | Public spot proxy cross-check | connected display-only; may anchor price level freshness |
| ODP Brent/WTI price reaction proxy | ODP `brentPrice` / `wtiPrice` evidence and 4w change logic | Price reaction direction around transport stress | connected display-only; candidate only |
| ODP crack spread proxy | ODP `crackSpread` evidence | Product-market stress context | connected display-only; candidate only |
| Oil News market reaction bucket | `data/oil-news-event-watch.json` bucket classification | Headline-index market reaction context | connected display-only; still requires manual claim review |

---

## 3. Interpretation Rule

Market confirmation can only support a transport-shock hypothesis when it
agrees with the physical route layer and another non-news confirmation layer.

It cannot by itself confirm:

- chokepoint closure
- war disruption
- actual oil cargo flow
- route-level tanker freight tightness
- refinery or terminal outage
- oil price direction

Market evidence can be noisy because crude prices also react to demand, central
bank expectations, USD, positioning, inventory releases, and geopolitical risk
premium changes. A falling oil price with physical stress can remain consistent
with ODP's false-down framework; the market-confirmation layer must therefore
separate **price reaction** from **physical confirmation**.

---

## 4. Candidate Buckets

### Brent Price-Structure Confirmation

Candidate inputs:

- `brentPricingLayer.futuresPriceCurve.curveStatus`
- `brentPricingLayer.futuresPriceCurve.frontMinusBack`
- `brentPricingLayer.futuresPriceCurve.slopeRegime`
- `brentPricingLayer.eiaBrentSpotProxy.sourceStatus`
- ODP `curve` evidence

Allowed future output after a separate manual sample scaffold:

```text
price_structure_tightening | price_structure_easing | mixed | unavailable
```

Not approved in P-score-15:

- writing `marketConfirmation`
- writing `transportShockConfirmationFactor`
- changing ODP `finalBias`
- treating Yahoo BZ proxy as official ICE settlement curve
- treating EIA RBRTE as Platts Dated Brent or physical transaction evidence

### Oil News Market-Reaction Confirmation

Candidate inputs:

- `data/oil-news-event-watch.json.aggregate`
- Oil News claim ledger `market_reaction_only`
- source-health / fallback status

Allowed future output after a separate manual sample scaffold:

```text
market_reaction_present | market_reaction_absent | contested | unavailable
```

Not approved in P-score-15:

- headline text display
- using news alone as confirmation
- promoting `elevated_manual_review` to confirmed event
- using GDELT/Tavily/Brave output as a direct score input

### ODP Market-Stress Context

Candidate inputs:

- ODP Brent/WTI price evidence
- ODP crack spread evidence
- ODP curve evidence

Allowed future output after a separate manual sample scaffold:

```text
market_confirms_transport_stress | market_diverges_from_transport_stress | mixed | unavailable
```

Not approved in P-score-15:

- feeding ODP `finalBias` back into Transport Shock
- using ODP conclusion as an input
- bypassing route freight and thermal/news review blockers

---

## 5. Source-Rights Classification

| Candidate | Future status allowed by this review | Required next gate |
|---|---|---|
| Yahoo BZ futures proxy | existing display-only market proxy | manual sample scaffold; must keep proxy caveat |
| ICE futures structure page | existing structure-only context | no official settlement value claim |
| EIA RBRTE spot proxy | existing public spot proxy | manual sample scaffold; keep Dated Brent caveat |
| Oil News market reaction bucket | existing display-only aggregate | claim-ledger/manual review before any confirmation |
| ODP price/crack/curve evidence | existing ODP evidence layer | must use raw evidence only, not ODP `finalBias` |

No P-score-15 source is approved for a production `marketConfirmation` write.

---

## 6. Next Allowed Step

The next allowed step is:

```text
transport_shock_market_confirmation_manual_sample_scaffold_no_live_fetch_no_production_write
```

That step may create a local ignored artifact helper to review manually supplied
market-confirmation samples. It still must not write production data or change
display, ODP, scoring, decision, execution, position, Brent promotion, Global
Risk Heatmap, or cross-validation.

---

## 7. Result

P-score-15 conclusion:

```text
market_confirmation_source_review_ready_for_manual_sample_scaffold
```

The reviewed market evidence is plausible as a future confirmation layer, but
`marketConfirmation` remains **not_connected**. The next work should be an
ignored manual sample scaffold, not a production writer or score integration.
