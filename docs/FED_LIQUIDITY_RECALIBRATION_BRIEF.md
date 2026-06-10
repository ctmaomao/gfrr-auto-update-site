# Fed Liquidity Recalibration Brief(funding-stress target · regime-aware RRP)

> **Brief-only research contract.** This document opens a separate recalibration
> study for the Fed liquidity sublogic. It does **not** approve runtime,
> scoring, data, workflow, Worker, or frontend changes.
>
> Date: 2026-06-10.

---

## 0. Decision

Open a narrow, artifact-only recalibration study for the Fed liquidity pressure
logic.

The study exists because the Treasury/TGA cross-audit found:

- current ON RRP / WALCL pressure logic is `needs_recalibration`;
- TGA incremental signal is `tga_incremental_signal_not_proven`;
- no new model candidate is strong enough for formula PR;
- broad financial-stress targets (`NFCI` / `STLFSI4`) are too mismatched for
  judging plumbing-style liquidity signals;
- row-level funding-stress skill exists in a narrow modern-regime slice, but
  episode-level evidence is dominated by one 2025 funding-stress episode and is
  not sufficient for production use.

Therefore:

```text
Do not connect TGA.
Do not connect a new formula.
Do not change scoring.
Do not change production data.
Study only whether a target-matched, regime-aware liquidity formula can be
pre-registered and falsified.
```

---

## 1. Scope

This brief is limited to a research design for:

1. a better **funding-stress target**;
2. a **regime-aware ON RRP buffer / velocity** signal family;
3. a **near-zero denominator guard** for ON RRP percentage changes;
4. strict out-of-sample / walk-forward validation gates.

Allowed in a future implementation PR that explicitly cites this brief:

- one artifact-only research script under `scripts/treasury-fiscal-data/`;
- ignored outputs under `manual-artifacts/treasury-fiscal-data/`;
- source-cache files under the same ignored artifact tree;
- docs updates summarizing result and verdict.

Disallowed:

- `data/*.json` writes;
- `realtime/*.json` writes;
- `.github/workflows/*` edits;
- Worker runtime edits;
- frontend edits;
- `values.*`, `displayInputsBaseline`, `effectiveDisplayInputs`;
- scoring / `decisionModel` / `executionLock` / `positionGuidance`;
- Action Queue / Trigger Monitor / Invalidation Rules;
- changing validators to make a model look acceptable.

---

## 2. Evidence Baseline

The research starts from these artifact-only results:

| Artifact | Current verdict |
|---|---|
| `manual-artifacts/treasury-fiscal-data/liquidity-long-backtest-latest.json` | `accuracy_not_proven_not_formula_approved` |
| `manual-artifacts/treasury-fiscal-data/liquidity-model-cross-audit-latest.json` | current logic `needs_recalibration`; TGA `not_proven`; no strong formula candidate |

Key cross-audit facts to preserve:

- `WDTGAL` / `WTREGEN` observed FRED coverage starts on 2002-12-18.
- A FRED-based 10-year replay is feasible.
- A roughly 20-year panel is partially feasible, but ON RRP absolute levels are
  not economically comparable before the fixed-rate ON RRP regime, and reserve
  targets are not comparable across scarce-reserve / ample-reserve regimes.
- A FRED-based 30-year TGA liquidity replay is not feasible without another
  signal source family.
- Modern broad-financial-stress evaluation was poor:
  - `mirrorPressure45 -> 8w financialStress`: precision `0.0597`, balanced
    accuracy `0.3784`, lift `0.2450`, p-worse-than-chance `0.0100`.
- The only apparently strong candidate, `tgaRebuildWhenRrpThin`, passed only in
  nested modern/QT windows and therefore counts as one regime family, not two.

---

## 3. Target Redefinition

The primary target must be **funding stress**, not broad market stress.

Broad stress (`NFCI`, `STLFSI4`, VIX, HY OAS) may remain diagnostic context, but
must not be the primary success target for a plumbing signal unless the study
explicitly argues that product goal changed.

### 3.1 Primary Target Candidate

Preferred modern target:

```text
SOFR minus administered rate >= 10bp within a forward window
```

Administered-rate hierarchy:

| Period | Candidate administered rate | Caveat |
|---|---|---|
| 2021-07 onward | `IORB` | Cleanest modern target leg |
| 2018-04 to 2021-07 | `IOER` only if stable fetch is solved | Must use FRED API + `FRED_API_KEY`; keyless `fredgraph.csv` timed out in cross-audit and cannot be silently treated as missing evidence |
| pre-SOFR | no direct equivalent | Use separate legacy regime target, not a blended score |

Forward windows to test:

- 4w / 28d
- 8w / 56d
- 13w / 91d
- 26w / 182d

If `IOER` coverage is not solved, funding-stress walk-forward folds before the
`IORB` era have no modern SOFR-admin target and must be reported as
target-unavailable folds, not as negative or weak evidence.

### 3.2 Legacy / Secondary Targets

Legacy target candidates:

- `TEDRATE >= 50bp` for bank-funding / money-market stress through its
  discontinued history.
- repo-spread proxies only if source availability and definitions are pinned.

The TED-era target must be paired with a curated event-label table. Known
technical / regulatory repricing episodes, such as 2016 money-market-fund
reform and the 2018 LIBOR-OIS widening, must be labeled
`technical_not_plumbing` and either excluded from funding-plumbing episode
recall or reported in a separate column. They cannot be used as evidence that a
reserve-plumbing model generalized.

Secondary diagnostics:

- future `WRESBAL` drawdown;
- `NFCI` / `STLFSI4`;
- VIX / HY OAS / IG OAS;
- episode labels around known plumbing events.

These secondary diagnostics are not success gates by themselves.

---

## 4. Signal Redesign Candidates

### 4.1 Existing Mirror Baseline

Always include the current mirror as a baseline:

```text
computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange)
```

Report its components separately:

- WALCL contraction leg;
- ON RRP level leg;
- ON RRP weekly percentage-change leg.

Do not compare a new model only against zero. It must beat the current mirror
on the same target and regime.

### 4.2 Regime-Aware ON RRP Buffer

Replace raw absolute interpretation with explicitly labeled regimes:

| Regime | Example rule shape | Interpretation |
|---|---|---|
| `not_meaningful_pre_frfa` | date before fixed-rate ON RRP regime | ON RRP level not a comparable buffer signal |
| `large_buffer` | ON RRP well above runoff thresholds | drain can be absorbed without immediate reserve stress |
| `thin_buffer` | ON RRP near depletion zone | TGA rebuild or QT can transmit faster to reserves |
| `depleted_buffer` | ON RRP near zero | absolute level is state, not repeated new signal |

Candidate buffer features:

- `onRrp / reserveBalances`;
- `onRrp / WALCL`;
- `onRrp - criticalThreshold`;
- `daysSinceBufferDepletion`;
- `rrpAbsorptionCapacity = max(onRrp - floor, 0)`;
- `tgaRebuildWhenRrpThin = tgaZ4w >= X && onRrp <= Y`.

The study must pre-register which of these are tested and must not tune the
reported formula after seeing all outcomes.

### 4.3 ON RRP Velocity

Percentage changes become unstable when ON RRP is near zero. Test velocity
features that are not dominated by denominator noise:

- absolute 1w / 4w dollar change;
- 4w change as share of reserve balances;
- 4w change as share of WALCL;
- slope over 4-13 weeks;
- buffer-depletion speed: `max(0, priorBuffer - currentBuffer)` divided by
  window days;
- capped percent change with a hard denominator floor.

The current `onRrpWeekChange <= -15%` leg may remain as a baseline, but any
new formula must prove that it is not firing only because `onRrp` is close to
zero.

### 4.4 Near-Zero Percentage Noise Guard

Any future candidate must define a denominator guard before evaluation:

```text
If prior ON RRP < denominatorFloor, do not use raw percent change.
```

Candidate floors to test only inside training folds:

- 25 billion USD;
- 50 billion USD;
- 100 billion USD.

Allowed replacement behavior:

- mark the percent leg `not_applicable_near_zero`;
- switch to absolute velocity;
- switch to depleted-buffer state duration;
- cap percent contribution at a pre-registered maximum.

Forbidden:

- treating a move from tiny balances as a fresh stress shock simply because the
  percentage looks large;
- letting the same depleted-buffer state add new stress points every week
  without a new deterioration event.

---

## 5. Validation Plan

The next artifact-only experiment must report both row-level and episode-level
metrics.

Required row-level metrics:

- base rate;
- signal rate;
- true positives / false positives / true negatives / false negatives;
- precision;
- recall;
- specificity;
- balanced accuracy;
- lift;
- permutation p-values.

Required episode-level metrics:

- episode count;
- detected episodes within 4w / 8w / 13w;
- false-alarm clusters;
- per-episode lead time;
- whether a detected episode is unique or duplicated across nested regimes.

Required validation design:

- expanding-window or rolling walk-forward;
- thresholds tuned only on training folds;
- out-of-sample metrics reported separately from in-sample metrics;
- nested regimes collapsed into independent regime families for model-gate
  decisions;
- no formula candidate may pass by double-counting one episode in overlapping
  windows.

Minimum gate for a future **formula brief**, not implementation:

| Gate | Minimum |
|---|---:|
| OOS balanced accuracy | >= 0.60 |
| OOS lift | >= 1.50 |
| Permutation p-better-than-chance | <= 0.05 |
| Independent regime families passing | >= 2 |
| Episode recall on funding-stress target | >= 0.60 |
| False-alarm clusters | explained and materially lower than baseline |

The episode-recall gate is active only when the test set contains at least 3
funding-stress episodes spanning at least 2 independent regime families. If the
sample does not meet that minimum, the strongest allowed verdict is
`regime_aware_buffer_candidate_plausible`; it may not reach
`candidate_strong_enough_for_formula_brief` even if row-level gates pass.

Even if all gates pass, the next step is a separate formula/backtest brief, not
runtime integration.

---

## 6. Required Negative Controls

A candidate must fail gracefully under these negative-control checks:

- broad-financial-stress target should not be used to claim funding accuracy;
- broad-market stress should be reported separately from plumbing stress;
- pre-fixed-rate ON RRP history must not be treated as comparable to post-2013
  ON RRP level history;
- 2025-only success must be labeled single-episode evidence;
- a one-episode modern funding-stress sample cannot satisfy the formula-brief
  gate, even with perfect recall;
- TED-era technical / regulatory spread events must be labeled separately from
  reserve-plumbing events;
- `modern_2021_present`, `qt_2022h2_present`, and `rrp_depleted_2024_present`
  must collapse into one `modern_rrp_depletion_family` for strong-candidate
  gates;
- final-vintage FRED data must be labeled as an upper bound where revisions
  matter;
- signal-side publication lag must be tested by lagging inputs at least 7 days.

---

## 7. Output Contract For Future Script

If a future artifact-only script is written, suggested name:

```text
scripts/treasury-fiscal-data/liquidity-recalibration-experiment.mjs
```

Suggested output:

```text
manual-artifacts/treasury-fiscal-data/liquidity-recalibration-experiment-latest.json
```

Required top-level fields:

```json
{
  "kind": "artifact_only_liquidity_recalibration_experiment",
  "artifactOnly": true,
  "formulaApproved": false,
  "productionDataWritten": false,
  "runtimeChanged": false,
  "scoringChanged": false,
  "candidateStrongEnoughForFormulaBrief": false,
  "boundaries": {
    "affectsValues": false,
    "affectsScoring": false,
    "affectsDecisionModel": false,
    "affectsExecutionLock": false,
    "affectsPositionGuidance": false
  }
}
```

The script must refuse output paths outside
`manual-artifacts/treasury-fiscal-data/`.

---

## 8. Decision Ladder

Allowed outcomes:

| Verdict | Meaning |
|---|---|
| `keep_current_logic_as_warning_screen` | Only allowed if target-matched lift > 1 and episode evidence is acceptable |
| `needs_recalibration` | Current expected state |
| `near_zero_pct_leg_should_be_disabled` | ON RRP percent leg fails denominator-noise tests |
| `regime_aware_buffer_candidate_plausible` | Candidate passes diagnostics but not formula gates |
| `candidate_strong_enough_for_formula_brief` | Candidate passes all artifact gates; still no runtime approval |
| `not_worth_formula_work` | No stable out-of-sample skill |

Current pre-brief default:

```text
needs_recalibration
```

---

## 9. No-Go Rules

- Do not connect TGA to the production formula.
- Do not add a new liquidity score, funding score, or regime overlay to
  production.
- Do not alter `config/rules.json` thresholds from this brief.
- Do not change `computeFedLiquidityPressure` from this brief.
- Do not relax any existing checker or validator.
- Do not claim that one 2025 episode proves a model.
- Do not use broad financial stress as proof of funding-stress skill.
- Do not use near-zero ON RRP percentage changes as shock evidence without a
  denominator guard.
