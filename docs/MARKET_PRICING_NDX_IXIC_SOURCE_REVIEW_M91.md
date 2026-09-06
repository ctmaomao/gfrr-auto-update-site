# M-91 Market Pricing NDX / IXIC Source Review And Implementation Spec Draft

> **STATUS:** Historical phase record; current Market Pricing state and still-mandatory display-only/degradation boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#market-pricing). Read that note before interpreting the phase-specific restrictions below.

## Status

- Phase: source review + contract design.
- Implementation status: not implemented.
- Source approval status: not approved.
- `^NDX` / `^IXIC` fetcher status: not connected.
- History write status: not approved.
- Metrics calculation status: not approved.
- Frontend display status: not implemented.

## Hard Boundary

M-91 does not add a fetcher, sanitizer, history writer, metrics calculation path, frontend renderer, Worker runtime change, workflow, dependency, or production data write.

Until owner approval of this source review and implementation spec, NDX / IXIC must remain:

- `data/market-pricing-history.json.assets.ndx.status = "waiting_for_source"`.
- `data/market-pricing-history.json.assets.ixic.status = "waiting_for_source"`.
- absent from `data/market-pricing-metrics.json` metrics calculation.
- absent from frontend Market Pricing Temperature display.
- absent from `displayInputsBaseline`, `effectiveDisplayInputs`, Brent promotion, scoring, decision, execution, position guidance, Action Queue, Trigger Monitor, and Invalidation Rules.

## Current Baseline

- QQQ is the only active Market Pricing Temperature asset.
- QQQ history lives in `data/market-pricing-history.json.assets.qqq.records`.
- QQQ metrics live in `data/market-pricing-metrics.json` with top-level `asset = "qqq"`.
- `assets.ndx` and `assets.ixic` already exist in the history file, but both have empty records and `waiting_for_source` status.
- SPX is only `fallback_candidate_only` and must not be mislabeled as Nasdaq / QQQ temperature.
- Yahoo `^GSPC` secondary diagnostics does not make SPX a Market Pricing Temperature metric source.

## Manual Source Availability Probe

This probe was run manually on 2026-05-23 for source review only. It was not added as a repository fetcher and did not write production data.

Probe URLs:

- `https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?range=1mo&interval=1d`
- `https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?range=1mo&interval=1d`

Observed result:

| Symbol | HTTP | Returned symbol | Instrument type | Exchange | Currency | Daily points | Observed range |
|---|---:|---|---|---|---|---:|---|
| `^NDX` | 200 | `^NDX` | `INDEX` | `NIM` | `USD` | 22 | 2026-04-23 to 2026-05-22 |
| `^IXIC` | 200 | `^IXIC` | `INDEX` | `NIM` | `USD` | 22 | 2026-04-23 to 2026-05-22 |

Interpretation:

- Yahoo chart currently appears technically reachable for both symbols.
- The symbols are index series, not ETFs.
- This does not approve Yahoo as a production source.
- This does not approve automated endpoint use.
- Compliance, stability, rate-limit behavior, and weekly aggregation must still be reviewed in a later implementation PR.

## Decision Point Recommendations

### 1. Correlation / Duplicate Counting

Recommendation: do not count QQQ, NDX, and IXIC as three independent risk signals.

Reason:

- QQQ tracks Nasdaq 100 and is expected to be highly correlated with NDX.
- NDX is an index-level reference for the same economic exposure that QQQ already proxies.
- IXIC broadens the lens to Nasdaq Composite, but still overlaps heavily with mega-cap technology and growth exposure.

Contract:

- Market Pricing Temperature remains display-only.
- QQQ remains the primary market-temperature metric.
- NDX and IXIC may be shown only as auxiliary comparison metrics.
- No scoring, decision, cross-validation strength, or risk module count may increase simply because NDX / IXIC exist.

### 2. Display Semantics

Recommendation: use "QQQ primary, NDX / IXIC auxiliary".

Reason:

- QQQ is the existing validated history path and the only active metric file contract.
- NDX is useful as an index-level cross-check for QQQ drift.
- IXIC is useful as a broader Nasdaq breadth proxy, not as a duplicate QQQ replacement.

Rejected for M-91:

- Three equal-weight Market Pricing Temperature cards.
- NDX replacing QQQ.
- IXIC replacing QQQ.
- Aggregating QQQ / NDX / IXIC into a single composite score without a later reviewed methodology.

### 3. History File Shape

Recommendation: keep NDX / IXIC in the existing `data/market-pricing-history.json` multi-asset file.

Reason:

- The current history file already has an `assets` map with `qqq`, `ndx`, `ixic`, and `spx` slots.
- Reusing the existing file preserves the M-24 isoWeek merge semantics and avoids a parallel history system.
- Separate history files would increase drift risk and checker surface without adding clear value.

Implementation draft:

- Add records under `assets.ndx.records` and `assets.ixic.records`.
- Keep per-asset `source`, `coverage`, `status`, and `dataGaps`.
- Preserve QQQ record shape and existing QQQ history semantics.

### 4. Z-Score Window / Thresholds

Recommendation: reuse QQQ's current 60-week lookback, sample standard deviation (`N-1`), uncapped z-score, and five display buckets for first implementation.

Reason:

- Reusing the existing method makes NDX / IXIC horizontally comparable with QQQ.
- Independent calibration would require backtest / source-review evidence that M-91 does not provide.
- Per-asset z-scores should be computed from each asset's own 60-week window; the method is shared, the input series is independent.

Contract:

- No asset may compute z-score until it has at least 60 valid weekly records.
- Thresholds are display thresholds only and must not affect scoring or decision logic.

### 5. Status Model

Current M-91 status:

- `ndx = waiting_for_source`.
- `ixic = waiting_for_source`.

Recommended future implementation statuses:

1. `source_reviewed_not_approved`: source review completed, no fetch/write.
2. `history_active_display_only`: weekly records committed after approved source + sanitizer + writer.
3. `metrics_active_display_only`: MA60 / StdDev60 / z-score computed after approved metrics extension.

Do not use `live` for NDX / IXIC in Market Pricing unless a later PR explicitly defines "live" for weekly market-pricing history. `live` can be confused with Worker realtime preview; M-91 recommends `metrics_active_display_only` after approved implementation.

### 6. Ingestion Path

Recommendation: Daily/manual market-pricing pipeline only, not Worker realtime preview.

Reason:

- Market Pricing history belongs to the daily history layer.
- Weekly history should not be built by Cloudflare Worker realtime preview.
- Worker runtime must not write market-pricing history.

Implementation draft:

- Future implementation may reuse the existing Yahoo fetcher style: short timeout, try/catch, finite positive price filtering, diagnostics, and no secret dependency.
- Reuse should mean code pattern and guardrails, not adding NDX / IXIC to Worker runtime.
- Approved artifacts should flow through the Market Pricing sanitizer and M-24 history writer pattern.

### 7. Failure / Fallback Strategy

Recommendation: independent graceful degradation; no cross-substitution.

Rules:

- NDX failure must not block QQQ.
- IXIC failure must not block QQQ.
- QQQ failure must not be hidden by NDX / IXIC success.
- QQQ must not be substituted with NDX.
- NDX must not be substituted with QQQ.
- IXIC must not be substituted with QQQ or NDX.
- SPX must remain fallback candidate only and must not be displayed as Nasdaq / QQQ temperature.

Frontend behavior after future implementation:

- Show available auxiliary metrics.
- Mark unavailable NDX / IXIC as `source_unavailable`, `waiting_for_source`, or `insufficient_history`.
- Keep QQQ primary state independent.

## M-91 Implementation Spec Draft

This section is a draft for a later owner-approved implementation PR. It is not approval to implement.

### Expected File Change Scope

Fetcher / source artifact:

- Add a Market Pricing source artifact path for NDX / IXIC under `manual-artifacts/market-pricing/`.
- Reuse Yahoo chart fetch guard patterns only after owner approval.
- Do not add Worker runtime endpoints or KV writes.

Sanitizer:

- Extend the M-23 sanitizer pattern to produce canonical weekly `{ date, isoWeek, close, sourceFile, sourceVendor }` records per asset.
- Preserve no price fabrication and no HTML error page masquerade.
- Add per-asset plausible close ranges:
  - QQQ: keep existing range.
  - NDX: separate index range requiring source-review bounds.
  - IXIC: separate index range requiring source-review bounds.

History:

- Merge into `data/market-pricing-history.json.assets.ndx.records` and `assets.ixic.records`.
- Reuse M-24 isoWeek merge semantics.
- Keep `assets.spx.status = "fallback_candidate_only"`.

Metrics:

- Extend metrics calculation to support asset list `qqq`, `ndx`, `ixic`.
- Preserve existing top-level QQQ contract for backward compatibility or provide an explicit migration PR if changing shape.
- Add per-asset records with same 60-week MA / sample StdDev / z-score method.
- Do not feed metrics into scoring, decision, execution, or position.

Frontend:

- Keep QQQ primary.
- Render NDX / IXIC as auxiliary comparison rows or compact subcards inside Market Pricing Temperature.
- Label NDX as index-level Nasdaq 100.
- Label IXIC as Nasdaq Composite.
- Do not present NDX / IXIC as independent risk module votes.
- Bump frontend cache version in the implementation PR.

Docs:

- Update Market Pricing display docs.
- Update Data Contract with the new multi-asset metrics schema.
- Update Operations runbook with the approved refresh path.
- Update Project Backlog completion state.

Checkers:

- Add a contract checker for NDX / IXIC source artifact shape.
- Add a contract checker for multi-asset history status / coverage.
- Add a contract checker for metrics per-asset shape and finite z-score range.
- Extend frontend visual checker to cover NDX / IXIC display labels.
- Preserve `check:market-pricing` and `check:all` coverage.

### Implementation Non-Goals

- No Worker runtime change.
- No `displayInputsBaseline` / `effectiveDisplayInputs` change.
- No Brent promotion change.
- No scoring / decision / execution / position change.
- No new npm dependency.
- No licensed-source claim.
- No SPX substitution.

## Current Review Conclusion

M-91 recommends proceeding to owner review with a narrow implementation path:

1. Keep QQQ primary.
2. Add NDX / IXIC only as display-only auxiliary comparison metrics after approved source + sanitizer + history + metrics changes.
3. Use existing history file and existing M-24 / M-26 patterns.
4. Keep ingestion in the Market Pricing daily/manual pipeline, not Worker runtime.
5. Preserve all no-scoring / no-decision / no-execution / no-position boundaries.
