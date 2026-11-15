# Macro editorial v2 visual review evidence

These are local Chrome element screenshots at **1440px and 390px viewport widths**. Image width is the article crop, not the viewport width. All four PNGs were visually inspected before copying; they are unmodified copies.

## Provenance and comparison scope

- **BEFORE (`before-intermediate-v2-*.png`) is an intermediate v2 candidate before its layout correction, NOT main, NOT production, and NOT a pre-feature baseline.** Source: the original `macro-ofr-editorial-20261108` worktree, `manual-artifacts/macro-ofr-editorial/before-fix-editorial-{1440,390}.png`.
- **AFTER (`after-fixed-v2-*.png`) is the fixed macro v2 source.** Source: the same worktree, `manual-artifacts/macro-ofr-editorial/editorial-{1440,390}.png`. The final renderer and stylesheet match the standalone Macro release tree: `git diff --no-index --ignore-space-at-eol` found no differences for `scripts/modules/renderMacroOverview.js` and `assets/styles.css`. Subsequent backend factual-validation fixes are not represented as a new visual capture.
- The local preview used `tests/fixtures/macro-editorial-ofr.mjs` through the original `manual-artifacts/macro-ofr-editorial/preview.mjs`: **synthetic article/provider output**, fixture clock `2026-11-01T12:00:00Z`, OFR 0.000 observed 2026-10-28 and weekly +0.500. The displayed provider badge is part of the fixture UI, not evidence of a provider call.
- This comparison shows continuous OFR explanatory prose, a full-width single timeline, consistent paper surfaces, translated source labels, and visible editorial coverage warnings. Mobile captures include the site's fixed page-bookmark ribbons overlapping the element crop; this is visible evidence, not retouched imagery.
- No live source verification, paid generation, publication, production data update, or deployment is established by these screenshots. External requests were blocked for the preview, including the font CDN; actual glyphs may use local font fallbacks.

## Computed-style corroboration (separate combined preview)

The following samples come **only** from the `macro-current`, width 390 entry of the combined integration preview's `manual-artifacts/editorial-integration/browser-report.json`, not from these four original PNG captures and not from production. That run served the combined Macro + Bubble tree with the synthetic Macro fixture at loopback, with external requests blocked.

- `body` and `#macro-risk-editorial`: background `rgb(251, 247, 240)`, text `rgb(26, 24, 21)`, font stack `"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif`.
- `#macro-risk-editorial h2`: text `rgb(251, 247, 240)`, transparent background, font stack `"Playfair Display", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif`.
- `#macro-risk-editorial .macro-editorial-meta`: text `rgb(251, 247, 240)`, transparent background, font stack `"IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace`.
- `.big-left`: background `rgb(26, 24, 21)`, text `rgb(251, 247, 240)`.

These are computed CSS stacks, not a claim that CDN fonts loaded. The combined preview recorded no horizontal overflow or JavaScript errors for the tested Macro states at 1440/390. It is corroboration of integration behavior, not a replacement for standalone release checks.

## Privacy and integrity

Visual inspection found no credentials, personal information, or unredacted sensitive data. The PNGs contain the synthetic article, public source labels and site UI only. No provider response artifacts or production JSON are included. SHA-256 hashes below identify the exact copied PNG bytes.

- `after-fixed-v2-1440.png`: `b01ea13cc6adc0921a500237ebf0cee61aa80c518dfd8341bf928b62c9e01821`
- `after-fixed-v2-390.png`: `f4c4ad7843636df6027b1ede50044f3c511d6439576b496b049061a80cb2dcb1`
- `before-intermediate-v2-1440.png`: `c5504464c84f843af355b1c17341d754fad1c27ddc5985d5ecf63cd1f90bcfff`
- `before-intermediate-v2-390.png`: `29d3ddfba846255e306221f6737f2fddecb5ba578586499e9fd27e362d2d52f9`

## Budget-first integration verification (2026-11-08)

The isolated Macro integration merges budget main `575462fc` into PR #507 head `7a132e51` without rewriting either parent. The provider preserves the shared accounting callback and sends the OFR system prompt from the actual frozen payload. Response-body cancellation and incomplete completion gates remain active. No provider call, ledger initialization, production configuration change, or data generation was performed.

- `npm run check:changed` completed the full `check:all` chain, exit 0.
- `npm run test:unit:coverage`: 1,574 passed, one existing conditional skip, zero failures; original aggregate coverage thresholds passed (lines 99.86%, branches 93.23%, functions 97.96%).
- Standard `npm run test:e2e`: initially 90 passed and five navigation-load timeouts. Saved traces show slow/pending Google Fonts requests. One unchanged `playwright test --last-failed` rerun passed all five, exit 0; no assertion or timeout was changed. This is 95 cases covered across the initial run and bounded rerun, not a claimed single all-green run.
- Real installed Chrome at 1440/390 passed current, stale, missing, legacy-current/history rejection and repeated restoration; no horizontal overflow or JavaScript errors. The new screenshots below were visually inspected and retain paper surfaces and the three CSS font stacks. The existing mobile fixed bookmarks overlap part of the element crop.
- New captures use the same synthetic OFR fixture clock and program-projected zero/weekly delta described above, with external requests blocked. They are not live provider output or production acceptance, and do not prove CDN font loading.
- Independent AI review found no P1/P2 and its separate targeted regressions passed 40/40. This does not impersonate GitHub human approval.

- after-budget-integration-1440.png: d5134d4910493d409bcd6cd4e134c1935b0db8cb341db237621f7b39112a43d2
- after-budget-integration-390.png: 3cca026c309783e736576f9c0beed8108a1c2a70ad5392ed0630e3ac62c11742
