# NFCI 展示修复 — review evidence (F)

- Four JPEGs: before/after NFCI card at 1440 and 390. They are display comparisons only; not accuracy evidence, not historical market labels.
- Real data on both sides: `data/radar-data.json` = `2026-10-23T00:48:31.687Z`, sha256 `e0d5c94194fbc7e4e9094b15ecff96aaa5d79f7313964af6cefff621f4397cf6`; 17 JSON hashes match central `f-release-browser-baseline.json`.
- After facts: main score 68/100, nav 13, n6 “分数 32 · 潜伏” unchanged; NFCI `-0.496`, 4w `+0.032`, regime 温和宽松; status `status-bar green`; paper/serif/ink/warm retained; scrollWidth 1425 at 1440 and 375 at 390; after 390 target card top ≈0. Before: same data/score, card status YELLOW.
- Provenance:
  - `before-nfci-1440.jpg` is the actual F-worktree pre-change desktop capture.
  - `before-nfci-390.jpg` is a **parent-tree preview recapture**, not a pre-change F-worktree capture: initial 390 framing shifted away from NFCI after reflow; the invalid framing is retained only in the central directory as `f-release-before-nfci-390-framing-invalid.jpg` and is **not** part of this evidence. The final 390 image was taken by Codex in the clean `four-lane-release` worktree at immutable HEAD `b4506653c13ab6e20fb8620c8f18d26b2f794e28`, whose Git tree `12bf434fc3d8c36a1d7eebf0b8c9630bb07ea2f6` is exactly the F parent `552a0c13` tree; its 17 JSON hashes are identical. It is a preview of the immutable parent version, not a historical live-site screenshot and not a mock.
  - `after-nfci-1440.jpg` / `after-nfci-390.jpg` are the real F current state; the 390 target card is correctly framed and shows GREEN.
- Image hashes:
  - `before-nfci-1440.jpg` — 1425×990, sha256 `cdffa6cf9062705b7c2afcba80e2a97b7eb112ff4c916dbd3ffe6e3046f57c1b`
  - `before-nfci-390.jpg` — 375×812, sha256 `488a4f3bbcd0e3957ce9e7fd02295c10e9e651020f2975d0c147bdecaa8eadf8`
  - `after-nfci-1440.jpg` — 1425×990, sha256 `fd686877d1424e6ce3039ed78934d49743adf86d05276619957e4f5324cddd3f`
  - `after-nfci-390.jpg` — 375×812, sha256 `56abe41c52f16dd7b9446c069a440a285ddc9357307376f47c11b12c144db9dc`
- Full `check:changed`/coverage/CI and independent review are still pending; these images are registered for that review/freeze, not a claim of full-suite completion.
