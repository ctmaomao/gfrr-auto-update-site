# Unified Data Pipeline Architecture - v28.0M-15A

## 1. Status

- Architecture sync only.
- No fetch.
- No production write.
- No workflow change.
- No frontend change.
- No market-pricing calculation.
- No `data/radar-data.json` change.
- No `data/market-pricing-history.json` record change.

## 2. Architecture Principle

All new data sources must be assigned to the unified data architecture before implementation.

Allowed layers:

- `daily_history_layer`
- `realtime_worker_layer`
- `github_actions_backup_validation_layer`
- `artifact_sanitizer_layer`
- `frontend_display_layer`

No isolated data pipelines are allowed. A new source must not be `standalone`, `ad_hoc`, or outside these layers.

## 3. Existing Primary Layers

### Daily GitHub Actions Layer

Role:

- slow variables
- historical data
- daily pipeline
- radar-data production
- external AI production refresh
- world order / macro history where applicable
- future market-pricing-history production path

Expected properties:

- auditable
- commit / artifact traceable
- production data write guard protected
- validator protected
- source freshness documented

### Cloudflare Worker Realtime Layer

Role:

- primary fast-variable refresh
- approximately 3-minute realtime cadence
- Brent / DXY / VIX / HY OAS / US10Y / Gold / SPX style fast variables
- realtime freshness / worker health
- frontend fast-variable overlay

Expected properties:

- fast, small, cache-aware
- no historical MA60 / z-score calculation
- no market-pricing-history production write
- no bypass of daily validators

### GitHub Actions Backup / Validation Layer

Role:

- high-frequency backup and health verification
- approximately six checks / refreshes per hour when configured
- fallback detection
- realtime stale / aging / expired checks
- Daily vs Worker audit
- source-health verification

Expected properties:

- backup and verification, not primary realtime engine
- must not bypass sanitizer
- must not directly write market-pricing-history records without approved writer

### Artifact Sanitizer Layer

Role:

- manual-artifacts and artifact-only reports
- market-pricing artifact validation
- external AI artifact validation
- no production write until separately approved

### Frontend Display Layer

Role:

- read-only display
- no data mutation
- no scoring / decision mutation from market-pricing display
- market temperature remains waiting-for-history until sufficient validated history and approved calculation exist

## 4. Market Pricing Integration

Market Pricing must integrate as follows:

- market-pricing-history belongs to daily_history_layer
- source-specific artifact fetch remains artifact-only until live fetch is separately approved
- market-pricing artifacts go through artifact_sanitizer_layer
- production history write requires a later approved writer PR
- market-pricing-temperature calculation requires at least 60 validated weekly observations and a later approved calculation PR
- frontend display remains waiting-for-history until the calculation layer is approved
- realtime worker may only provide current-price cross-validation or display context if separately approved; it must not be the primary weekly-history builder

Explicit architecture decisions:

- Market Pricing must not create a separate data pipeline.
- Market Pricing must not use Cloudflare Worker as the primary weekly-history builder.
- GitHub Actions backup checks must not bypass sanitizer or production writer approvals.

## 5. Data Source Registration Policy

Every new source must declare:

- `sourceKey`
- `sourceDomain`
- `assignedLayer`
- `primaryOwnerLayer`
- `freshnessCadence`
- `artifactOnlyBeforeProduction`
- `sanitizerRequired`
- `productionWriterRequired`
- `fallbackPolicy`
- `sourceComplianceStatus`
- `affectsScoring`
- `affectsDecisionModel`
- `affectsExecutionLock`
- `affectsPositionGuidance`

Allowed `assignedLayer` values:

- `daily_history_layer`
- `realtime_worker_layer`
- `github_actions_backup_validation_layer`
- `artifact_sanitizer_layer`
- `frontend_display_layer`

No value may be `standalone` or `ad_hoc`.

## 6. Current Market-Pricing Source Assignment

Current M-15 status:

- `qqq` / `stooq_public_csv_candidate` is proof-of-source metadata only.
- `assignedLayer=artifact_sanitizer_layer` for source-specific artifacts.
- `assignedLayer=daily_history_layer` for a future approved market-pricing-history writer.
- `sourceApproved=false`.
- `liveFetchApproved=false`.
- `productionDataWriteApproved=false`.
- `historyWriteApproved=false`.
- `marketTemperatureCalculationApproved=false`.
- `data/market-pricing-history.json` remains scaffold-only.
- no records.
- no prices.
- no calculation.

## 7. Guardrails

- no live fetch without source-specific network gate approval
- no production write without sanitizer + writer approval
- no direct Worker write into market-pricing-history
- no direct GitHub Actions backup write into market-pricing-history
- no calculation without 60 validated weekly observations
- no frontend activation while `waiting_for_history`
- no SPX-as-Nasdaq-temperature
- no source URL / secret / header persistence
- no trading advice fields

## 8. Future Implementation Sequence

M-16:

- Market Pricing Source-Specific Network Gate Design
- No live fetch / no production write

M-17:

- Unified pipeline source registry scaffold
- No fetch / no production write

M-18:

- Source-specific artifact-only live fetch behind explicit network gate
- No production write

M-19:

- Artifact sanitizer for real fetched records
- No production write

M-20:

- Approved market-pricing-history writer
- Still no calculation unless 60 weekly rows exist

M-21:

- Market temperature calculation layer
- Display-only
- No scoring / decision / execution / position impact unless separately approved

## 9. Current Decision

- M-15A completes unified data pipeline architecture sync.
- It does not change runtime behavior.
- It does not fetch data.
- It does not write production data.

Recommended next step:

```text
v28.0M-16 Market Pricing Source-Specific Network Gate Design - No Live Fetch / No Production Data Write
```
