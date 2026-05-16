# M-55a IA Restructure Phase 2a

M-55a is a frontend information-architecture-only change. It moves already-rendered static UI blocks to better reading positions without changing data acquisition, scoring, decision, execution, position logic, backend scripts, workflows, or `data/*.json`.

## Scope

- Realtime band uplift: the Brent / DXY / VIX / HY OAS / US10Y / Gold / SPX strip moves out of the folded `#detail-data` area into a new top-level static aside, `#homepage-realtime-band`.
- External AI uplift: `#external-ai-auxiliary` moves from the old late-page nav position to the semantic slot directly after cross-validation and before WoW changes.
- Nav contract sync: the dashboard jump nav remains 13 anchors, with External AI moved to position 9.
- Detail-data cleanup: the former "AUDIT INPUTS — 实时输入与数据健康" subsection is renamed to "数据健康" because the realtime strip no longer lives there.

## 13-Anchor Contract

M-55a keeps the `DESIGN.md` "13 项" nav contract unchanged. No realtime nav anchor is added. The realtime band is an embedded static aside, not a primary IA destination.

New nav order:

| # | Label | Href |
|---|---|---|
| 1 | 今日总判断 | `#homepage-today-judgment` |
| 2 | 压力来源 | `#homepage-pressure-sources` |
| 3 | 信号分层 | `#homepage-signal-layers` |
| 4 | 四大驱动 | `#homepage-macro-drivers` |
| 5 | 市场温度 | `#homepage-market-temperature` |
| 6 | 风险引擎 | `#homepage-risk-engines` |
| 7 | 交叉验证 | `#homepage-cross-validation` |
| 8 | 本期关键变化 | `#wow-key-changes` |
| 9 | 外部 AI | `#external-ai-auxiliary` |
| 10 | 风险热力图 | `#global-risk-heatmap` |
| 11 | 详细数据 | `#detail-data` |
| 12 | 方法说明 | `#method-evidence` |
| 13 | 执行风控 | `#execution-risk-detail` |

The synchronized contract locations are:

- `index.html` dashboard jump nav
- `scripts/check-homepage-ia-contract.mjs` `navContract`
- `scripts/check-homepage-ia-contract.mjs` physical `expectedOrder`
- `scripts/check-editorial-redesign-contract.mjs` `expectedLinks`

## Realtime DOM IDs

All existing realtime DOM IDs are preserved so `renderRealtimeStrip` remains position-independent:

- `rt-brent`, `rt-brent-delta`, `rt-brent-source`, `rt-brent-move`
- `rt-dxy`, `rt-dxy-delta`
- `rt-vix`, `rt-vix-delta`
- `rt-hy`, `rt-hy-delta`
- `rt-us10y`, `rt-gold`, `rt-spx`
- `rt-source-mode`
- `realtime-updated-at`, `realtime-notes`

## Spacing

The old realtime card inherited Group B spacing through:

```css
.editorial-subsection > section.full-width-section > article.card
```

Because M-55a moves the card out of `.editorial-subsection`, the new parent uses an equivalent rule:

```css
.editorial-subsection-equivalent > section.full-width-section > article.card
```

This preserves the `display: flex`, column direction, and `18px` internal gap expected by the card.

## Boundaries

- No `data/*.json` regeneration.
- No `.github/workflows/*` modification.
- No backend script changes.
- No `DESIGN.md` change.
- No narrative card folding. That remains deferred to M-55b.
- No scoring, decision, execution, or position logic change.

