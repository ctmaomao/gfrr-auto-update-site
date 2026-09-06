# Legacy document status and current authority

This is the shared status note for the linked phase documents. Their in-body historical no-go/rollout statements retain their original scope; this note neither grants new operations nor replaces current source/data/production contracts. Snapshot statements below retain their stated dates; verify current artifacts for freshness.

<a id="market-pricing"></a>

## Market Pricing

> **STATUS (2026-06):** Preserved as a phase / scope record. In-body "waiting-for-history / scaffold-only / records empty / not currently present / waiting_for_source / no MA60 / z-score" statements describe the phase named in their section and are **not** today's state unless restated as current. Today: `data/market-pricing-history.json` is `status=has_history` with 60+ weekly records for QQQ (primary) plus NDX / IXIC (auxiliary, landed via M-91), `sourceMode=manual_weekly_input_committed`; `data/market-pricing-metrics.json` carries computed MA60 / StdDev60 / z-score metrics for all three (`metrics_active_display_only`) via M-26 calculation + M-91; the homepage Market Pricing Temperature card is **live** (M-27). **Still mandatory:** display-only / audit-only — `affectsScoring=false` / `affectsDecisionModel=false` / `affectsExecutionLock=false` / `affectsPositionGuidance=false`; NDX / IXIC remain absent from `displayInputsBaseline` / `effectiveDisplayInputs` / `values` / Brent promotion / scoring / decision / execution / position. The conditional degradation rule still holds: any asset with <60 validated weekly records stays `insufficient_history` and its card falls back to the waiting-state placeholder (M-27 graceful degradation). Current authority: `docs/MARKET_PRICING_TEMPERATURE_DISPLAY.md` + `docs/MARKET_PRICING_METRICS_CALCULATION.md` + `docs/OPERATIONS.md` + the live `data/market-pricing-*.json`.

Current contract navigation: [temperature display](MARKET_PRICING_TEMPERATURE_DISPLAY.md), [metrics](MARKET_PRICING_METRICS_CALCULATION.md), [operations](OPERATIONS.md).

<a id="external-ai"></a>

## External AI

> **STATUS (2026-08-11):** This document is preserved as a historical phase / scope record. The former `externalAiInterpretationLayer` visible panel and `External AI Production Refresh` workflow have been retired; that field now remains only for data compatibility and manual diagnostics. The current homepage DeepSeek output is the separately contracted `macroRiskEditorialLayer`, integrated into `MACRO RISK OVERVIEW` and governed by `docs/MACRO_RISK_EDITORIAL_DESIGN.md`, `docs/DATA_CONTRACT.md`, `docs/OPERATIONS.md`, and ADR-0022. Historical disabled/visible rollout wording below describes its named phase only. The rule-based `aiInterpretationLayer` remains separate, and no AI layer may affect scoring / decision / execution / position.

Current contract navigation: [Macro Risk](MACRO_RISK_EDITORIAL_DESIGN.md), [ADR-0022](ADR/0022-macro-risk-editorial-integrated-overview.md), [data contract](DATA_CONTRACT.md), [operations](OPERATIONS.md).
