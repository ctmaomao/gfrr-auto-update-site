# M-55b IA Restructure Phase 2b

M-55b completes IA Restructure Phase 2 for the homepage display layer.

Scope is frontend-only:

- No new FRED series.
- No new data acquisition.
- No `data/*.json` regeneration.
- No backend, scoring, decision, execution, position, workflow, Worker, or narrative logic change.
- `DESIGN.md` remains unchanged; the 13-item nav contract remains unchanged.

## 1. Hidden M-55a IA bug fixed

M-55a moved External AI near cross-validation but left `wow-key-changes` as a static HTML section after External AI. The nav still listed:

1. `#wow-key-changes`
2. `#external-ai-auxiliary`

But the physical DOM order was:

```text
#homepage-realtime-band
#external-ai-auxiliary
#wow-key-changes
```

This made the "本期关键变化" nav item scroll to a position after "外部 AI", which violated the semantic reading path.

M-55b promotes `wow-key-changes` into the `renderMacroRiskOverview` runtime sequence:

```text
homepage-today-judgment
homepage-pressure-sources
homepage-signal-layers
homepage-macro-drivers
homepage-market-temperature
homepage-risk-engines
homepage-cross-validation
wow-key-changes
editorial-watch-list
homepage-realtime-band
external-ai-auxiliary
global-risk-heatmap
detail-data
method-evidence
execution-risk-detail
```

The static HTML section was removed from `index.html`; the runtime section still preserves:

- `id="wow-key-changes"`
- `id="wow-key-changes-root"`

`renderEditorialKeyChanges` remains position-independent because it still targets the preserved root id after the macro overview has rendered.

## 2. Realtime band repainted to main-module standard

M-55a made the realtime band visible near the top of the page but preserved the old cockpit-style monolithic `realtime-strip-card` structure.

M-55b replaces that structure with the homepage main-module pattern:

- `macro-overview-block`
- `editorial-category`
- `editorial-category-kicker`
- `editorial-category-summary`
- `editorial-category-counts`
- `editorial-realtime-grid`
- 7 `editorial-realtime-card` sub-cards

The 7 realtime sub-cards are:

| Card | Value id | Extra ids |
|---|---|---|
| Brent | `rt-brent` | `rt-brent-delta`, `rt-brent-source`, `rt-brent-move` |
| DXY | `rt-dxy` | `rt-dxy-delta` |
| VIX | `rt-vix` | `rt-vix-delta` |
| HY OAS | `rt-hy` | `rt-hy-delta` |
| US10Y | `rt-us10y` | none |
| Gold | `rt-gold` | none |
| SPX | `rt-spx` | none |

The count pills preserve:

- `realtime-updated-at`
- `rt-source-mode`

The trailing notes list preserves:

- `realtime-notes`

## 3. Realtime DOM id preservation

All 16 M-55a realtime DOM ids are preserved:

```text
rt-brent
rt-brent-delta
rt-brent-source
rt-brent-move
rt-dxy
rt-dxy-delta
rt-vix
rt-vix-delta
rt-hy
rt-hy-delta
rt-us10y
rt-gold
rt-spx
rt-source-mode
realtime-updated-at
realtime-notes
```

`renderRealtimeStrip` continues to use `document.getElementById`, so it remains position-independent.

## 4. Legacy M-55a wrapper removed

M-55a introduced `.editorial-subsection-equivalent` to rebuild Group B spacing after moving the old card outside `#detail-data`.

M-55b no longer needs that compatibility wrapper because the realtime band is now drawn as its own main module. The legacy CSS rule was removed, and `check-frontend-visual-m55a.mjs` was updated to stop requiring it while still preserving the M-55a realtime DOM id assertions.

## 5. IA contract sync points

M-55b synchronizes:

- `scripts/check-homepage-ia-contract.mjs` `macroRuntimeIds`
- `scripts/check-homepage-ia-contract.mjs` `staticRequiredIds`
- `scripts/check-homepage-ia-contract.mjs` `expectedOrder`
- `scripts/check-frontend-visual-m55a.mjs`
- new `scripts/check-frontend-visual-m55b.mjs`
- `package.json` `check:all`

The dashboard jump nav remains exactly 13 anchors, with the same labels and href order as M-55a.

## 6. Validation contract

M-55b adds:

```bash
npm run check:frontend-visual-m55b
```

`check:all` increases from 61 to 62 items.

The new checker verifies:

- Realtime band uses `editorial-realtime-*` main-module classes.
- Exactly 7 realtime sub-cards are present.
- All 16 realtime DOM ids are present.
- Static `<section id="wow-key-changes">` is removed from `index.html`.
- Runtime `appendEditorialKeyChanges` and `'wow-key-changes'` literal exist in `renderMacroOverview.js`.
- `.editorial-subsection-equivalent` is removed.
- Cache version is `28.0M-55bV`.
