# Bias Color Semantic Fix M-33

v28.0M-33 corrects bias tag color semantics in the asset return and asset preference tables. This is a frontend display-layer fix only: no data file, asset weight, scoring, decision, execution, or position logic changes.

## Scope

M-33 updates three visual issues:

- Bias badges now use financial semantics consistently: bullish states are green, cautious states are yellow / orange, and bearish states are red.
- The six `#method-evidence` sub-cards now share the DATA BOUNDARY warm callout background.
- `#ai-interpretation-layer-section .grid.hero-grid` receives a scoped `18px` top margin so the detail cards no longer touch the summary row.

## Bias Mapping

| Bias text | Badge class | Meaning | Color |
| --- | --- | --- | --- |
| `偏多` | `.badge.strong` | Bullish | `--risk-green` |
| `强配` | `.badge.strong` | Strong allocation / bullish | `--risk-green` |
| `中性偏多` | `.badge.strong-mid` | Mild bullish | `--risk-green-soft` |
| `谨慎偏多` | `.badge.cautious` | Cautious bullish | `--risk-yellow` |
| `中性偏空` | `.badge.cautious-bear` | Mild bearish | `--risk-orange` |
| `偏空` | `.badge.underweight` | Bearish | `--risk-red` |
| `低配` | `.badge.underweight` | Underweight / bearish | `--risk-red` |

`--risk-green` already exists in DESIGN.md §2.1. M-33 adds one supporting CSS token:

```css
--risk-green-soft: rgba(31, 77, 44, 0.78);
```

The new token supports the intermediate `中性偏多` state without reusing the stronger full-green status. DESIGN.md §2.2 allows `--risk-*` colors for status badges and risk bands.

## Cross-table Consistency

Before M-33, the same bias text rendered inconsistently across the two asset tables:

- In `#asset-return-body`, `中性偏多` matched the broad `includes('偏多')` logic and rendered as `.badge.strong`, which was red before the semantic fix.
- In `#asset-table-body`, `中性偏多` fell through to `.badge.neutral`, rendering with the neutral paper background.

After M-33, both tables map `中性偏多` to `.badge.strong-mid`, producing identical soft-green rendering.

## Method-card Background

Before M-33, the DATA BOUNDARY sub-card used `rgba(238, 231, 219, 0.86)` while the other five method cards used `rgba(255, 252, 245, 0.76)`.

M-33 unifies all six `#method-evidence` sub-cards on the warmer DATA BOUNDARY background:

```css
rgba(238, 231, 219, 0.86)
```

The `.editorial-method-boundary` class remains as a semantic marker, but no longer carries a special background override.

## Boundary

M-33 does not modify DESIGN.md. It implements the existing color semantics: green for constructive / bullish status, yellow / orange for caution, and red for negative / risk status. The PR description should use the standard frontend statement:

```text
本 PR 符合 DESIGN.md 的所有规则
```
