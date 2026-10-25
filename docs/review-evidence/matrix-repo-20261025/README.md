# Matrix repo-spread qualification review evidence (H)

- Four JPEGs (actual format JPEG, `.jpg` correct): before/after matrix at 1440 and 390. Captured **2026-10-25** (before 14:09, after 14:17 local worktree time) against the same data snapshot `2026-10-25T00:26:37.771Z`.
- Target: `#homepage-cross-validation`. Both widths have no horizontal overflow; 390 scroll = 375; 390 target top = 0.34375 (≈0). After facts: main **68/100**, nav **13**, n6 **分数 35 · 潜伏**, matrix consistency **71** (5 strong / 0 partial / 2 contradiction).
- Valid input before/after screenshots are **pixel-identical** (same sha256). Matrix evidence `detail` is not directly rendered; these images do **not** prove the repo-detail wording change; the actual matrix JSON comparison is the wording evidence. Screenshots verify matrix/cross-market section layout, consistency 71/5-0-2 and no horizontal overflow; Hero main 68/nav13/n6 35 are verified by before/after facts/data and DOM, not in these screenshots.
- Before and after each show the same normal valid values; no missing case was a real occurrence. The 71→86 probe is **synthetic-only** (removing the liquidity repo contradiction leaves three supports and makes liquidity strong); it is not risk/accuracy improvement and is not fixed in H.
- 17 JSON hashes used by both captures (all verified 0 mismatch):
  ```
  data/bubble-watch-editorial-status.json 48676963461595871b416710dce85a4a0b456ccc6da02b3f5d0c29f1aa0bada2
  data/bubble-watch-history.json d49fe11068c2e640815de18763e3a2aa878e5ac741d58f3082675fa569261162
  data/bubble-watch.json 1094e307ad49bf5de7b23fea25350f6bb012ffcb865b6fa4a5ed82b745f0b6be
  data/gdelt-bubble-watch-cache.json bd3a7376b12645a330f7052f51d63447c9eb57d2d439f0384128f86a9fd630ea
  data/gdelt-news-cache.json 9c50f62e9e58f759b3a2e5fbedb01436891da69d56212f2e8678f2202085e3bc
  data/gdelt-world-order-cache.json 6f2e7f624d60816a66215c8183f535416e086a029fd1bc5e028f67604234a445
  data/market-pricing-history.json 1b4760c9e0ec1072baa0025a2444cd5849642a0931d17f20f6ef342d7154b0c8
  data/market-pricing-metrics.json 28b9f112de9cfaee3d21254b188ff5f96c2c59bb5031885121cb790ef9a1081a
  data/oil-directional-history.json 977ce1c25c1c1898b3e96a82b57a29de3f6906f5ec5d0229f8d84ba0e6287039
  data/oil-directional-pressure.json b4859566fd3c9d00ad9e183b3a496313ec7cc6f09ef95ea598ea6a854e62722f
  data/oil-news-event-watch.json 7546189fab75e8f16dc18721f11a9b97250b368d26c8af1aae60be8cfa172a77
  data/oil-thermal-watch.json 68ba0d710144819f45ccaf092f61d737c3cbced2e866689486ebdcaa375f8d3a
  data/radar-data.json 7de15bd49d6889d84cccce5febadf5ba836926b8325945448377e96f32f7099a
  data/radar-history-full.json 6952c1df10b2dc8fd5794e0f71a4336fde90f912267c57b6cb6c2fc1c01c2264
  data/radar-history.json 82a3b35245ff4f865bc3f9c61dd518b4e3d328d3f5a94ebe3d7a925061121fbe
  data/world-order-stress.json 2d5cb5d64ef73d7875bfa06a7004bfed35428e2ff02df8d39a7361dda86ef7bb
  realtime/market.json ea561f7fa99a8b836c9ee0691fae13c598cb79c1d748868b358124a570e7a471
  ```
- Images:
  - `before-matrix-1440.jpg` 1425×990, sha256 `aa9224c6af770a76dbfee69ab9ca52fb03b23da0ed6cd92c2ba6f3cd5f92cd9c`
  - `before-matrix-390.jpg` 375×812, sha256 `a01370113a647ab57752fe25f1cae5ff73be322761df32b69a8454a868278119`
  - `after-matrix-1440.jpg` 1425×990, sha256 `aa9224c6af770a76dbfee69ab9ca52fb03b23da0ed6cd92c2ba6f3cd5f92cd9c`
  - `after-matrix-390.jpg` 375×812, sha256 `a01370113a647ab57752fe25f1cae5ff73be322761df32b69a8454a868278119`
- Full `check:changed`/coverage/independent review/CI and publication remain pending; this directory registers evidence only.
