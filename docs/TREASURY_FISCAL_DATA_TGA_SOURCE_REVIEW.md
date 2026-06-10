# Treasury Fiscal Data TGA Source Review

> **Status:** source-review only.
> **Probe date:** 2026-06-10.
> **Candidate layer:** future `macroDrivers.fedLiquidity` input candidate, not implemented.

This review is intentionally narrow. It answers whether Treasury Fiscal Data's
Daily Treasury Statement(DTS) can support a future main-calculation candidate
for Treasury General Account(TGA) balance and fiscal liquidity impulse.

It does not approve runtime implementation.

## 1. Hard Boundary

- No live fetcher is added.
- No workflow is changed.
- No frontend display is added.
- No `data/*.json` or `realtime/*.json` file is written.
- No Worker runtime path is changed.
- No `values.*`, `displayInputsBaseline`, or `effectiveDisplayInputs` path is changed.
- No scoring, `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, or Invalidation Rules behavior is changed.
- No formula change is approved by this review.

Any future formula or weighting change requires a separate owner-approved
backtest / replay PR proving incremental signal versus the existing Fed
liquidity inputs.

## 2. Current Fed Liquidity Baseline

Current production logic already has a Fed liquidity block:

- FRED `WALCL`: Fed balance sheet assets, with 4-week change.
- FRED `RRPONTSYD`: ON RRP balance, with 1-week change.
- FRED `WRESBAL`: reserve balances, with 4-week change.
- FRED `DFF` / `SOFR`: policy and secured overnight funding rates.
- NY Fed `BGCR` / `TGCR`: repo-market reference rates.

In the current main calculation, liquidity pressure is driven primarily by
`walcl4wChange` and ON RRP level / week change. Reserve balances are already
stored as a quantity signal, but they are not a direct substitute for daily
Treasury cash-flow movement.

The candidate question is therefore not "can TGA be displayed?" It is:

```text
Can daily TGA balance and deposits/withdrawals add a non-duplicative fiscal
liquidity signal beyond ON RRP, WALCL, and reserve balances?
```

## 3. Official Source

Source family:

- Fiscal Data API documentation: <https://fiscaldata.treasury.gov/api-documentation/>
- Daily Treasury Statement dataset: <https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/>
- Bureau of the Fiscal Service DTS page: <https://fiscal.treasury.gov/accounting/daily-treasury-statement>

Official Treasury description, paraphrased: DTS summarizes the U.S. Treasury's
daily cash and debt operations, including operating cash balance and deposits /
withdrawals of operating cash. Treasury's operating cash is maintained in an
account at the Federal Reserve Bank of New York.

API base used for this review:

```text
https://api.fiscaldata.treasury.gov/services/api/fiscal_service
```

No API key was used in the probe.

## 4. Probe Endpoints

### TGA balance

Endpoint:

```text
/v1/accounting/dts/operating_cash_balance
```

Filter:

```text
account_type:eq:Treasury General Account (TGA) Closing Balance
```

Relevant fields:

- `record_date`
- `account_type`
- `open_today_bal`
- `src_line_nbr`

Observed stable row:

- `account_type = Treasury General Account (TGA) Closing Balance`
- `src_line_nbr = 4`
- API metadata type: `CURRENCY0`
- API metadata format: `$1,000,000`

### TGA deposits / withdrawals

Same endpoint:

```text
/v1/accounting/dts/operating_cash_balance
```

Filters:

```text
account_type:eq:Total TGA Deposits (Table II)
account_type:eq:Total TGA Withdrawals (Table II) (-)
```

Observed stable rows:

- deposits: `src_line_nbr = 2`
- withdrawals: `src_line_nbr = 3`

The separate detail endpoint
`/v1/accounting/dts/deposits_withdrawals_operating_cash` is available and
returned 178 TGA transaction-category rows for the latest observed date, but the
Table I total rows are preferable for a future production candidate. They avoid
category churn and remove the need to sum many detail rows.

## 5. Live Probe Result

Probe command shape:

```text
GET /v1/accounting/dts/operating_cash_balance
  ?fields=record_date,account_type,open_today_bal,src_line_nbr
  &filter=account_type:eq:<candidate row>
  &sort=-record_date
  &page[size]=60
```

Observed on 2026-06-10:

| Field | Result |
|---|---:|
| Latest DTS `record_date` | 2026-06-08 |
| TGA closing rows fetched | 60 |
| TGA deposit-total rows fetched | 60 |
| TGA withdrawal-total rows fetched | 60 |
| Latest TGA closing balance | 844,229 million USD |
| Latest total TGA deposits | 38,313 million USD |
| Latest total TGA withdrawals | 19,623 million USD |
| Latest deposits minus withdrawals | +18,690 million USD |

Balance changes from the TGA closing-balance row:

| Window | Definition | Change |
|---|---|---:|
| 1d | latest row minus previous DTS row | +18,689 million USD |
| 5d | latest row minus 5 DTS rows back | -12,613 million USD |
| 20d | latest row minus 20 DTS rows back | +5,068 million USD |

Recent combined rows:

| Date | TGA balance | Deposits | Withdrawals | Deposits - withdrawals |
|---|---:|---:|---:|---:|
| 2026-06-08 | 844,229 | 38,313 | 19,623 | +18,690 |
| 2026-06-05 | 825,540 | 15,580 | 34,561 | -18,981 |
| 2026-06-04 | 844,521 | 266,134 | 267,334 | -1,200 |
| 2026-06-03 | 845,722 | 24,707 | 45,061 | -20,354 |
| 2026-06-02 | 866,075 | 263,280 | 254,047 | +9,233 |
| 2026-06-01 | 856,842 | 280,267 | 327,307 | -47,040 |

The one-row difference between balance change(+18,689) and deposits minus
withdrawals(+18,690) is acceptable at source-review level and should be treated
as a rounding / table-unit issue until a future implementation validates the
official PDF / table semantics.

## 6. Candidate Signal Semantics

Possible future fields, if later approved:

```text
macroDrivers.fedLiquidity.tgaBalance
macroDrivers.fedLiquidity.tgaChange1d
macroDrivers.fedLiquidity.tgaChange5d
macroDrivers.fedLiquidity.tgaChange20d
macroDrivers.fedLiquidity.tgaNetDepositWithdrawal
macroDrivers.fedLiquidity.sourceStatus.tga
```

Directional interpretation:

- Rising TGA balance generally drains liquidity from the private banking system,
  all else equal.
- Falling TGA balance generally injects liquidity back into the private banking
  system, all else equal.
- Deposits minus withdrawals is a same-day fiscal cash-flow impulse candidate.

Important caveats:

- TGA is mechanically related to reserve balances and other Fed liability
  components, so it is not an independent "new risk module".
- Tax dates, debt-ceiling episodes, bill issuance, settlement calendars, and
  Treasury cash-management behavior can create large seasonal or one-off moves.
- The sign should not be interpreted as a market forecast by itself.
- Any formula must guard against double-counting with reserve balances, ON RRP,
  and WALCL.

## 7. Incremental Signal Review

### Versus ON RRP

ON RRP is already near its lower regime in current production data, so it can
become a less informative marginal buffer once depleted. TGA changes can still
move materially after ON RRP is already low. This gives TGA a plausible
incremental role as a daily fiscal drain / injection signal.

Verdict: plausible incremental signal, not proven.

### Versus WALCL

WALCL is a weekly Fed-asset quantity series. It captures balance-sheet size, not
daily Treasury cash operations. DTS TGA can move on a different daily cadence
and can explain liquidity pressure that WALCL does not move fast enough to
capture.

Verdict: likely non-duplicate cadence and mechanism.

### Versus reserve balances

Reserve balances are the closest conceptual neighbor. TGA changes are one of
the factors that can drain or add reserves, but reserve balances are broader and
weekly in the current implementation. DTS TGA can be useful as a leading /
decomposing input, but formula design must avoid counting both as independent
stress votes.

Verdict: useful explanatory / leading candidate, but highest double-count risk.

## 8. Review Outcome

| Question | Answer |
|---|---|
| Can DTS `operating_cash_balance` stably extract TGA balance? | Yes. Exact `account_type` filter and stable line 4 were observed. |
| Can it produce 1d / 5d / 20d changes? | Yes. 60 latest TGA rows were returned, enough for the requested windows. |
| Can deposits / withdrawals construct fiscal liquidity impulse? | Yes. Table I total rows line 2 and line 3 provide direct deposits and withdrawals totals. |
| Does it add signal beyond ON RRP / WALCL / reserve balances? | Plausible, but not proven. It adds daily fiscal-flow mechanism and cadence, but overlaps with reserve-balance mechanics. |
| Is runtime implementation approved? | No. |
| Is formula / scoring impact approved? | No. |
| Recommended next step | Artifact-only historical replay / backtest design, with no production data write. |

## 9. Required Future Gate

Before any runtime or main-calculation implementation:

1. Build an artifact-only replay against historical DTS TGA rows and existing
   GFRR history.
2. Compare candidate TGA features against current liquidity module behavior:
   ON RRP level / week change, WALCL 4-week change, reserve-balance 4-week
   change, and realized score regime transitions.
3. Prove that TGA reduces false positives / false negatives or improves regime
   timing without double-counting reserve balances.
4. Define hard freshness, finite-number, unit, and source-status validators.
5. Only then open a separate owner-approved formula / implementation PR.

## 10. Artifact-only Replay Follow-up(2026-06-10)

This next step has been implemented as an artifact-only local replay command:

```text
npm run treasury:tga-replay
```

The command:

- requires explicit `--allow-network` inside the npm script;
- fetches Treasury DTS `operating_cash_balance` only;
- reads local `data/radar-history-full.json` and `data/radar-data.json`;
- writes only ignored output under
  `manual-artifacts/treasury-fiscal-data/tga-replay-latest.json`;
- does not write `data/*.json`, `realtime/*.json`, workflow files, frontend
  files, Worker runtime files, or scoring code.

Observed replay output:

| Field | Result |
|---|---:|
| Replay status | `insufficient_local_history_for_formula_approval` |
| DTS rows fetched per series | 180 |
| DTS range | 2025-09-18 to 2026-06-08 |
| GFRR history rows aligned | 46 |
| Unique aligned DTS dates | 32 |
| Rows with TGA 20-row change | 46 |
| Rows with ON RRP / WALCL history | 46 / 46 |
| Reserve-balance rows in committed history | 0 |

Latest replayed DTS observation:

| Field | Value |
|---|---:|
| Date | 2026-06-08 |
| TGA balance | 844,229 million USD |
| TGA deposits | 38,313 million USD |
| TGA withdrawals | 19,623 million USD |
| Deposits minus withdrawals | +18,690 million USD |
| TGA 1-row change | +18,689 million USD |
| TGA 5-row change | -12,613 million USD |
| TGA 20-row change | +5,068 million USD |

Preliminary correlations from the committed local history, de-duplicated by
aligned DTS date:

| Diagnostic pair | n | r |
|---|---:|---:|
| TGA 5-row change vs next GFRR score change | 32 | -0.3028 |
| TGA 5-row change vs next liquidity-module change | 32 | -0.3383 |
| TGA 5-row change vs same-day liquidity module | 32 | +0.1556 |
| TGA 20-row change vs same-day liquidity module | 32 | +0.2154 |
| TGA 5-row change vs ON RRP level | 32 | +0.0621 |
| TGA 5-row change vs WALCL level | 32 | -0.6145 |

Interpretation:

- DTS extraction remains technically viable.
- The current committed GFRR history is too short for formula approval.
- The committed history also lacks reserve-balance history rows, so it cannot
  prove incremental value versus the closest overlap source.
- The candidate remains `plausible_not_proven`.
- No formula, threshold, score, decision, or runtime connection is approved.

Next allowed step:

```text
larger artifact-only replay using a longer historical baseline
```

That future replay must still remain artifact-only until it proves incremental
signal and receives separate owner approval for formula work.

## 11. Longer Liquidity Replay Scaffold(2026-06-10)

A broader source-history replay scaffold has been added:

```text
npm run treasury:liquidity-replay
```

This command is designed to answer the wider question that the first local
GFRR-history replay could not answer:

```text
Across a longer source-history baseline, does TGA add non-duplicative signal
versus ON RRP, WALCL, and WRESBAL?
```

The command:

- requires explicit `--allow-network` in the npm script;
- requires `FRED_API_KEY`;
- refuses to use the unsupported FRED CSV fallback;
- fetches Treasury DTS TGA balance / deposits / withdrawals;
- fetches FRED `RRPONTSYD`, `WALCL`, and `WRESBAL`;
- aligns those source histories by DTS report date;
- mirrors the current Fed liquidity pressure logic for ON RRP / WALCL;
- treats reserve balances as an overlap diagnostic, not as a newly approved
  scoring input;
- writes only ignored output under
  `manual-artifacts/treasury-fiscal-data/liquidity-replay-latest.json`.

The scaffold still cannot approve a formula. Its output keeps:

```text
formulaApproved=false
productionDataWritten=false
scoringChanged=false
runtimeChanged=false
```

Local verification on 2026-06-10:

- `node --check scripts/treasury-fiscal-data/liquidity-replay.mjs` passed.
- First `npm run treasury:liquidity-replay` run failed closed because local
  `FRED_API_KEY` was not present; no source fallback was used.
- A later run with a temporary local `FRED_API_KEY` file succeeded, wrote only
  ignored
  `manual-artifacts/treasury-fiscal-data/liquidity-replay-latest.json`, and
  reported:
  - `status=diagnostic_ready_for_human_review`
  - DTS aligned rows: 860
  - rows with full ON RRP / WALCL / WRESBAL context: 840
  - source-history range: 2023-02-01 to 2026-06-08
  - `formulaApproved=false`
  - `productionDataWritten=false`
  - `runtimeChanged=false`
  - `scoringChanged=false`

## 12. Long-History Fed Liquidity Backtest(2026-06-10)

A separate long-history artifact-only backtest has been added:

```text
npm run treasury:liquidity-long-backtest
```

This is intentionally separate from the DTS replay. Treasury Fiscal Data DTS
`operating_cash_balance` currently starts on 2022-04-18 for the reviewed TGA
balance / deposits / withdrawals rows, so it cannot provide a 5-10 year daily
DTS backtest by itself. The long-history backtest instead uses official FRED
H.4.1 weekly series:

| Series | Role |
|---|---|
| `WDTGAL` | Primary weekly TGA Wednesday-level proxy |
| `WTREGEN` | TGA week-average robustness proxy |
| `RRPONTSYD` | Existing ON RRP input |
| `WALCL` | Existing Fed balance-sheet input |
| `WRESBAL` | Reserve-balance diagnostic / target |
| `NFCI` | Broad financial-conditions target |
| `STLFSI4` | Broad financial-stress target |

The script:

- requires explicit `--allow-network`;
- uses FRED API when `FRED_API_KEY` is present, otherwise uses chunked official
  FRED `fredgraph.csv` downloads;
- mirrors the current `computeFedLiquidityPressure(walcl4wChange, onRrp,
  onRrpWeekChange)` logic;
- evaluates 8-week forward reserve drawdown and broad financial-stress screens;
- writes only ignored output under
  `manual-artifacts/treasury-fiscal-data/liquidity-long-backtest-latest.json`;
- does not write production data, runtime, scoring, workflows, Worker, or
  frontend files.

Observed default run:

| Field | Result |
|---|---:|
| Backtest status | `diagnostic_ready_for_human_review` |
| Full-target rows | 644 |
| Range | 2014-01-29 to 2026-05-27 |
| Current pressure >=45 count | 306 |
| TGA drain-shock count | 104 |
| 8w reserve-stress targets | 262 |
| 8w broad financial-stress targets | 194 |
| Assessment | `accuracy_not_proven_not_formula_approved` |

Modern-regime excerpt (`2021-01-06` to `2026-05-27`, n=282):

| Signal -> target | Precision | Recall | Balanced accuracy | Lift |
|---|---:|---:|---:|---:|
| Current pressure >=45 -> 8w broad financial stress | 0.0541 | 0.0597 | 0.3671 | 0.2275 |
| Current pressure >=45 -> 8w reserve stress | 0.2568 | 0.1919 | 0.4457 | 0.7314 |
| TGA 4w drain shock -> 8w reserve stress | 0.3191 | 0.1515 | 0.4883 | 0.9091 |
| Current pressure >=45 OR TGA drain -> 8w broad financial stress | 0.1557 | 0.2836 | 0.4023 | 0.6555 |

Interpretation:

- A 5-10 year artifact-only backtest is feasible, but DTS itself is not the
  long-history source; FRED H.4.1 weekly TGA proxies are required for that.
- The current ON RRP / WALCL pressure logic should not be described as a proven
  conservative warning screen until a target-matched cross-audit shows lift > 1.
  This run only proved that the broad-financial-stress target was weak for the
  current threshold logic.
- The simple TGA drain screen improves one diagnostic metric slightly in the
  modern regime, but absolute balanced accuracy and lift remain too weak for a
  formula brief.
- TGA remains `not_formula_approved`; no runtime/scoring/data integration is
  justified by this evidence.

## 13. Adversarial Model Cross-Audit(2026-06-10)

A stricter artifact-only cross-audit script was added:

```text
node scripts/treasury-fiscal-data/liquidity-model-cross-audit.mjs --allow-network
```

It is intentionally adversarial to the previous long-backtest and tests:

- multi-horizon targets: 4w / 8w / 13w / 26w;
- target separation: reserve drawdown, broad financial conditions, market risk,
  and true funding stress;
- causal TGA z-score signals instead of fixed-dollar TGA thresholds;
- signal-lag sensitivity for publication-lag lookahead;
- circular-shift permutation tests;
- episode-level detection and false-alarm clustering;
- walk-forward threshold tuning to check whether any stable out-of-sample
  model emerges.

The script output remains ignored:

```text
manual-artifacts/treasury-fiscal-data/liquidity-model-cross-audit-latest.json
```

Observed cross-audit output after tightening the candidate gate:

| Field | Result |
|---|---:|
| Grid rows | 1,225 |
| Range | 2002-12-18 to 2026-06-03 |
| Current logic inverted in modern regime | `true` |
| Tuned walk-forward shows stable skill | `false` |
| New model strong enough for formula PR | `false` |
| Formula approved | `false` |
| Production integration approved | `false` |

Modern-regime current-pressure result against 8w broad financial stress:

| Metric | Result |
|---|---:|
| n | 275 |
| Precision | 0.0597 |
| Recall | 0.0597 |
| Balanced accuracy | 0.3784 |
| Lift | 0.2450 |
| Permutation p-worse-than-chance | 0.0100 |

The only candidate cell that looked strong was `tgaRebuildWhenRrpThin` against
8w funding stress:

| Regime | Precision | Recall | Balanced accuracy | Lift |
|---|---:|---:|---:|---:|
| `modern_2021_present` | 0.6667 | 0.2500 | 0.6144 | 4.6000 |
| `qt_2022h2_present` | 0.6667 | 0.2500 | 0.6097 | 3.3833 |

That does **not** approve a formula because both cells belong to the same
nested `modern_rrp_depletion_family`; they are not independent regime evidence.
The script gate now requires passing cells from independent regime families,
so `newModelCandidateStrongEnoughForFormulaPr=false`.

Cross-audit verdict:

- Current liquidity pressure logic: `needs_recalibration`.
- TGA incremental signal: `tga_incremental_signal_not_proven`.
- New model candidate: not strong enough for formula PR.
- Best future direction, if pursued, is not production integration; it is a
  separately pre-registered formula/backtest brief focused on target-matched
  funding-stress definitions and regime-aware thresholds.
- Follow-up brief opened:
  [`FED_LIQUIDITY_RECALIBRATION_BRIEF.md`](FED_LIQUIDITY_RECALIBRATION_BRIEF.md).

Long-horizon feasibility:

- 10-year artifact replay is feasible.
- About 20 years is partially feasible with FRED weekly TGA proxies, but ON RRP
  level thresholds are not economically comparable before the fixed-rate ON RRP
  regime, and reserve-balance targets are not comparable across scarce-reserve
  and ample-reserve regimes.
- 30-year FRED-based TGA backtest is not feasible: observed `WDTGAL` /
  `WTREGEN` coverage starts on 2002-12-18, while broader outcome series can go
  back farther than the signal side.

## 14. No-Go Rules

- Do not connect DTS directly to `values.*`.
- Do not write TGA to `displayInputsBaseline` or `effectiveDisplayInputs`.
- Do not add a frontend card as a substitute for proving main-calculation value.
- Do not add workflow automation from this review.
- Do not treat TGA as an independent seventh risk module.
- Do not label deposits / withdrawals as a trading signal or market forecast.
- Do not double-count TGA and reserve balances as independent stress votes
  without a reviewed formula.
