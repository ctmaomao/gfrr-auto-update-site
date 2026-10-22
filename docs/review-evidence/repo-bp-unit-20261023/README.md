# Repo spread bp unit — review evidence (D0)

- All four images are **JPEG bytes** (`FF D8 FF`) with `.jpg` extensions: `before-1440.jpg`/`after-1440.jpg` = 1425×990 (1440 viewport), `before-390.jpg`/`after-390.jpg` = 375×812 (390 viewport).
- Source: real old snapshot 2026-10-21 00:45 UTC, same data for before/after; no synthetic fixture. Baseline commit `624e55c2`; frontend identical to `875beb25` (PR #477 changed backend dates only), so both views use the same real snapshot.
- Copied unchanged from the main-root contract artifact (`d0-before-{1440,390}.jpg`, `d0-after-{1440,390}.jpg`); no local server or browser attachment was created by the implementer.
- After acceptance (same snapshot, local same-input): pillar changed from `-0bp` to `-2bp`; nav 13; main score 68/100; app version `repo-bp-unit-1`; paper `rgb(251, 247, 240)`, body `rgb(58, 53, 48)`, serif stack `Noto Serif SC / Source Han Serif SC / Songti SC / serif`; 1440 scrollWidth 1425, 390 scrollWidth 375.
- Detailed browser facts (not shipped): `manual-artifacts/repo-bp-review/browser-acceptance.json` in this worktree.
- hashes: before-1440 `b97106516391f44207d827a62ea790e4d9f4f33b23945b0327b23059c296ef7f`; before-390 `f12de98b541d5cb34596dfddcd19ea5dad5226b310dcd3b34ccf0a13357bf7f3`; after-1440 `614903c76befcd0e106a9b44e233e8c489aca5d70f8ddbf3c6c22b16261e3837`; after-390 `307a12a0ffe3847b83d66268bd5ffcae8b843e6da522587614377d938f7a0304`.
- Disclosure: this is a display-unit check on an old snapshot, **not** a current-market judgment and **not** accuracy validation.
