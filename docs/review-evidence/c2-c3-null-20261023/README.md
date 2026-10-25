# C2/C3 null-display review evidence (G)

- Eight JPEGs (actual format JPEG, correct `.jpg` names; not PNG with a renamed extension): C2 1440/390 and C3 1440/390, before and after. They are display comparisons only — not accuracy evidence, not current-market labels.
- Data snapshot: `2026-10-23T00:48:31.687Z`, `data/radar-data.json` sha256 `e0d5c94194fbc7e4e9094b15ecff96aaa5d79f7313964af6cefff621f4397cf6`; all 17 JSON hashes match central `g-release-browser-baseline.json` (0 mismatch). The after capture was taken on Oct 24 but still uses the same 17-JSON snapshot; it is not same-day market data.
- `before-*` are the unmodified G worktree capture on Oct 23. `after-*` are the real G current display, captured Oct 24 against the same snapshot.
- Capture targets: C2 both widths = `#card-c2-usd-liquidity`; C3 desktop = `#card-c3-hy-oas`; C3 mobile = `#card-c3-cre`. Both after target rects are at top ≈0 with no horizontal overflow.
- After facts: main score 68/100, nav 13, n6 “分数 32 · 潜伏”; NFCI -0.496 / 温和宽松 / GREEN; CRE 1.53 / 稳定 / GREEN; all selected target fields have values. Missing/partial/true-0 cases are **synthetic tests only**; this README does not claim a real missing-data event occurred.
- Images:
  - `before-c2-1440.jpg` — 1425×990 — `296d93c28f77322522e8b91ae22225510630975a17948f98118e877e76048b18`
  - `before-c2-390.jpg` — 375×812 — `a3c705b1600895cbc70e0422a63afe34308a8a81eedba3ff8fada64c1bac18a3`
  - `after-c2-1440.jpg` — 1425×990 — `1e033b3cc032377b2d5b62d680acfb46a39bfa8054d64d89482711b917794a9f`
  - `after-c2-390.jpg` — 375×812 — `2b06bd9dfec3bcbb83328d672d58a2b9e1cd36142c1dc5de608d66211890fdd9`
  - `before-c3-1440.jpg` — 1425×990 — `fd686877d1424e6ce3039ed78934d49743adf86d05276619957e4f5324cddd3f`
  - `before-c3-390.jpg` — 375×812 — `63c9201923910ba1e4e340e97a438e1c2bf3c120e03615171b9302e49ee96845`
  - `after-c3-1440.jpg` — 1425×990 — `120dcee7f06f6081ab202caef36acbe676ed36105dad11da7e37183a4a87d8d1`
  - `after-c3-390.jpg` — 375×812 — `b3dee33db7222a6ec4309e0b67032dfde64560b41dbecccf28798f60a27f9b92`
- Full `check:changed`/coverage/independent review/CI and publication are still pending; this directory only registers review evidence.
