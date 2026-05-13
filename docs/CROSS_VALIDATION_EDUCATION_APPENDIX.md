# Cross-validation Education Appendix (v28.0M-30)

## Purpose

v28.0M-30 adds a static educational appendix inside the homepage cross-validation section. The appendix explains how to read the consistency score and narrative matrix in plain language for non-professional readers.

This appendix is fixed content. It does not read `data/radar-data.json`, `data/market-pricing-metrics.json`, `data/world-order-stress.json`, or any other backend file.

## Content Summary

The appendix contains four educational sections plus a final boundary disclaimer:

- 一致性分数
- 信号同向的金融常识
- 矛盾信号的金融常识
- 数据缺口的影响
- 边界声明

The copy is intentionally non-data-driven. It does not mention the current consistency score, current narrative assessments, current z-score, or any live market value.

## Critical Boundary

Educational only. Does not generate judgments about current data. Does not provide investment advice.

The appendix describes common financial-research framing for signal consistency, divergence patterns, and data gaps. It does not infer whether current conditions are good, bad, hot, cold, actionable, or predictive.

## Rendering Contract

The appendix is rendered by `scripts/modules/renderMacroOverview.js` as a collapsed `<details>` element inside `#homepage-cross-validation`.

It appears after the cross-validation matrix content and uses the existing editorial folded-content visual pattern:

- `editorial-folded-content`
- `editorial-folded-summary`
- `fold-marker`
- `fold-label`

The additional classes are scoped to the appendix:

- `editorial-cross-validation-education`
- `editorial-cross-validation-education-body`
- `editorial-cross-validation-education-section`
- `editorial-cross-validation-education-reminder`

## Maintenance Note

If the locked copy needs to change later, the replacement text must be reviewed for boundary compliance:

- no current-data conclusion
- no trading-action language
- no dynamic data dependency
- no scoring, decision, execution, or position impact
- no new external source
