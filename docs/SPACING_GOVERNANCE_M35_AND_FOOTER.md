# Spacing Governance M-35 and Footer Redesign

v28.0M-35 extends the spacing-governance pattern from M-32 and M-34, and replaces the minimal one-line footer with a restrained editorial method / disclaimer footer.

This is a frontend display-layer refinement only. It does not change data, scoring, decision, execution, position logic, IA order, workflows, or backend pipelines.

## Purpose

M-32 added outer folded-section breathing room:

```css
.editorial-folded-content > .editorial-section-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

M-34 added Group A inner governance for `article.card` elements that are direct children of `.editorial-subsection`.

M-35 extends that same inner governance to the Group B single-card wrapper pattern, where the `article.card` is wrapped by a `section.full-width-section`.

## Group B Definition

Group B means:

```css
.editorial-subsection > section.full-width-section > article.card
```

The current four Group B single-card wrapper members are:

| Group | Area | Pattern |
| --- | --- | --- |
| B1 | `#detail-data` 实时输入与数据健康 | `section.full-width-section > article.card` |
| B3 | `#detail-data` 时间序列 | `section.full-width-section > article.card` |
| B5 | `#detail-data` 传导网络 | `section.full-width-section > article.card` |
| B13 | `#execution-risk-detail` 行为纪律 | `section.full-width-section > article.card` |

Grid-wrapped subsections and `section.card` patterns remain outside this treatment.

## CSS Contract

M-35 adds local flex governance:

```css
.editorial-subsection > section.full-width-section > article.card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
```

It also resets direct child margins that would otherwise double-count spacing:

```css
.editorial-subsection > section.full-width-section > article.card > .metric-row {
  margin-top: 0;
}

.editorial-subsection > section.full-width-section > article.card > p {
  margin: 0;
}

.editorial-subsection > section.full-width-section > article.card > ul {
  margin-top: 0;
  margin-bottom: 0;
}
```

The global `.metric-row` base rule is intentionally preserved because non-Group contexts still rely on it.

## Footer Redesign

M-35 replaces the minimal footer:

```html
<footer class="footer">独立静态版 · 适配静态托管 · 数据由自动化流程每日生成</footer>
```

with a two-column editorial footer:

- 方法论: summarizes the site's three-layer risk framework.
- 免责: states the evidence-display / non-investment-advice boundary.

There is intentionally no "历史对照" column. GFRR does not perform historical bubble comparisons, and adding 1929 / 2000 / 2008 / dot-com style references would imply speculative historical analogy outside the site's evidence boundary.

## Token Adaptation

The footer uses GFRR DESIGN.md tokens:

| Purpose | Token |
| --- | --- |
| Main ink / border | `var(--paper-ink)` |
| Muted body text | `var(--paper-muted)` |
| Monospace type | `var(--font-mono)` |

It does not use template-only tokens such as `var(--ink)`, direct font strings, shadows, rounded cards, gradients, or external links.

## Future Rule

New folded subsections using the Group B single-card wrapper pattern automatically receive 18px direct-child spacing. If a future subsection needs grid-governed spacing or a different layout contract, it should use one of the existing grid / `section.card` patterns instead.
