# ADR-0074: NFCI direction contract correction

Status: Owner-authorized implementation; Codex design AI review passed; human merge review pending. This ADR is an atomic contract correction and does not authorize production model replacement or claim that human review is complete.

## Context

`docs/DATA_CONTRACT.md` and `docs/DATA_SOURCES.md` described NFCI as directionally opposite to IG/HY OAS. The runtime `classifyNfciRegime` and the production narrative already treat a higher NFCI as tighter financial conditions. The Chicago Fed explains that positive NFCI values indicate conditions tighter than average and negative values indicate looser-than-average conditions: <https://www.chicagofed.org/research/data/nfci/about>. NFCI is not a crisis probability.

`scripts/check-macro-drivers-credit-nfci.mjs` hard-locked the erroneous sentence, so a documentation-only correction could not pass.

## Decision

Correct only the NFCI direction wording in `docs/DATA_CONTRACT.md` and `docs/DATA_SOURCES.md`:

- NFCI and IG/HY OAS are both “higher = tighter”; their zero-axis levels differ.
- Positive NFCI = tighter financial conditions; negative = looser.
- Display labels `偏紧`/`偏松` remain mandatory.

Replace the single contract marker in `check-macro-drivers-credit-nfci.mjs` from the erroneous sentence to the factual marker `NFCI 与 igOas/hyOas 均为数值越高越紧`. Preserve all other contract, runtime, matrix and data assertions, including the backticked `偏紧`/`偏松` marker.

Add a real-module regression test: VM-extract the runtime `classifyNfciRegime` (no copied implementation), cover threshold sides and `0/null/NaN/Infinity/string`, and assert the real `buildCrossValidationMatrix` maps positive NFCI to tightening and negative to loosening using its actual return shape. Assert the corrected contract text exists and the old sentence is absent.

## Consequences and boundaries

This is a wording/assertion correction only. Runtime scoring, data, workflows, dependencies, thresholds, matrix normal/stress classification and the production model are unchanged. It does not establish accuracy, replace a model, add a provider or authorize deployment. The separate repo-spread null-wording contract remains ADR-0075 and is not mixed into this change.

The checker change is an ADR-level assertion change in its own reviewed contract PR, not a presentation-patch workaround. No old sentence is retained in comments or hidden text to satisfy `includes`.
