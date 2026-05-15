# M-38 Section Border Consistency Governance

M-38 implements the existing DESIGN.md border-driven visual contract for homepage editorial sections. It adds one broad-selector governance rule for `.editorial-section` and one scoped reset for `#macro-risk-overview`.

This is frontend display layer only. It does not change data, workflows, scoring, decision, execution, position logic, external-AI behavior, Market Pricing logic, or DESIGN.md.

## Rule

```css
.editorial-section {
  border: 1px solid var(--paper-line-strong);
}

#macro-risk-overview {
  border: none;
}
```

The color token is `--paper-line-strong`, which resolves to `#1A1815`. This matches the strong ink border pattern used by M-31 heatmap-frame and the border-driven hierarchy described in DESIGN.md.

## Section Outcomes

| Section | M-38 border source | Result |
|---|---|---|
| `#macro-risk-overview` | `#macro-risk-overview { border: none; }` | Keeps current outer-border-free visual. Inner `.macro-overview-block` cards continue to provide structure. |
| `#wow-key-changes` | existing inline `.editorial-section-wow` rule | Keeps its existing `border: 1px solid var(--paper-line)` and yellow top stripe. |
| `#global-risk-heatmap` | new global `.editorial-section` rule | Gains `1px solid var(--paper-line-strong)` outer border. |
| `#detail-data` | new global `.editorial-section` rule | Gains `1px solid var(--paper-line-strong)` outer border. |
| `#method-evidence` | new global `.editorial-section` rule | Gains `1px solid var(--paper-line-strong)` outer border. |
| `#external-ai-auxiliary` | existing `.editorial-external-ai-panel` rule | Keeps `1px solid var(--paper-line-strong)` through its own later rule. |
| `#execution-risk-detail` | new global `.editorial-section` rule | Gains `1px solid var(--paper-line-strong)` outer border. |

## Rationale

The pre-M-38 homepage had inconsistent editorial-section outer borders. Four sections reported as visually borderless were:

- `#global-risk-heatmap`
- `#detail-data`
- `#method-evidence`
- `#execution-risk-detail`

`#macro-risk-overview` also lacked a section self-border, but it already reads as structured because its inner `.macro-overview-block` cards use strong borders. M-38 therefore resets the macro overview outer border to avoid a dense double-frame effect.

## Governance Pattern

M-38 follows the same broad-selector governance approach as:

- M-34 Group A spacing governance for `.editorial-subsection > article.card`
- M-35 Group B single-card spacing governance for `.editorial-subsection > section.full-width-section > article.card`

The global rule standardizes the base editorial-section contract. The scoped reset handles the one section whose inner card structure already provides sufficient border hierarchy.

## Preserved Boundaries

- `.editorial-section-header` top accent remains unchanged.
- `.editorial-section-wow` inline border remains unchanged.
- `.editorial-external-ai-panel` border remains unchanged.
- `.heatmap-frame` border and `--paper-bg-canvas` background remain unchanged.
- M-32 folded-content `display:flex; gap:16px` remains unchanged.
- M-34 Group A card `display:flex; gap:18px` remains unchanged.
- M-35 Group B card `display:flex; gap:18px` remains unchanged.
- M-36 dead-code removals remain unchanged.
