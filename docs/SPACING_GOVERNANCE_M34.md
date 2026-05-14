# Spacing Governance M-34

v28.0M-34 applies a local spacing-governance pattern to Group A folded appendix cards. This is a frontend display-layer refinement only: it does not change data, scoring, decision, execution, position logic, IA order, or any backend pipeline.

## Purpose

M-32 introduced outer-layer breathing room for folded sections:

```css
.editorial-folded-content > .editorial-section-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

M-34 applies the same governance idea one layer deeper, inside the folded `article.card` containers that previously relied on block flow and ad hoc child margins.

## Group A Definition

Group A means `article.card` containers nested directly inside `.editorial-subsection`.

The current seven Group A members are:

| Group | Section | Container |
| --- | --- | --- |
| A1 | `#daily-brief-section` | `article.card.full-width-card` |
| A2 | `#ai-interpretation-layer-section` | `article.card.full-width-card` |
| A3 | `#divergence-layer-section` | `article.card.full-width-card` |
| A4 | `#brent-pricing-layer-section` | `article.card.full-width-card` |
| A5 | `#world-order-stress-section` | `article.card.full-width-card` |
| A6 | `.decision-header-section` | `article.card.decision-header-card.full-width-card` |
| A7 | `.main-lock-section` | `article.card.execution-lock-card.full-width-card` |

## CSS Contract

M-34 adds this local rule:

```css
.editorial-subsection > article.card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
```

It also resets direct child margins that would otherwise double-count spacing:

```css
.editorial-subsection > article.card > .metric-row {
  margin-top: 0;
}

.editorial-subsection > article.card > p {
  margin: 0;
}
```

The global `.metric-row` base rule is intentionally preserved because it is used by non-Group-A surfaces.

## Fixed Zero-gap Pairs

M-34 fixes eight zero-gap pairs:

| Section | Pair |
| --- | --- |
| A1 `#daily-brief-section` | `.metric-row.two` to `.grid.hero-grid` |
| A3 `#divergence-layer-section` | `.metric-box.compact` to `details.editorial-subsection` |
| A4 `#brent-pricing-layer-section` | `.metric-row.three` to `.metric-box` |
| A4 `#brent-pricing-layer-section` | `.metric-box` to `details.editorial-subsection` |
| A4 `#brent-pricing-layer-section` | consecutive `details.editorial-subsection` pairs |
| A5 `#world-order-stress-section` | `.card-head` to `.world-order-grid` |
| A7 `.main-lock-section` | `.card-head` to `.execution-lock-grid` |
| A2 `#ai-interpretation-layer-section` | `.metric-row.two` to `.grid.hero-grid`, now governed by Group A rather than a one-off patch |

## Retired M-33 Patch

M-33 added this local patch:

```css
#ai-interpretation-layer-section .grid.hero-grid {
  margin-top: 18px;
}
```

M-34 removes it. The same 18px spacing is now supplied by the parent `article.card` gap. This prevents double spacing and keeps all Group A members governed by one local rule.

M-34 also removes the extra `margin-top: 18px` from the `.world-order-status-grid` inline style block in `index.html`; the parent gap now provides that spacing.

## Future Rule

Any future `article.card` added directly under `.editorial-subsection` will automatically receive 18px spacing between direct block-level children. If a new folded subsection should not use this behavior, it should not be modeled as Group A.

Group B (`.editorial-subsection > section`) and Group C (`.editorial-subsection > div`) are out of scope for M-34.
