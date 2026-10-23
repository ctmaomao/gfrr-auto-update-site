# 四层风险证据展示 — review evidence (E)

- Four JPEGs: before/after Hero at 1440 and 390. All are real worktree captures, not mockups; before from `e-release-before-hero-*.jpg`, after from `e-release-after-hero-*.jpg`.
- Same real snapshot on both sides: `data/radar-data.json` = `2026-10-23T00:48:31.687Z`, sha256 `e0d5c94194fbc7e4e9094b15ecff96aaa5d79f7313964af6cefff621f4397cf6`. The central `e-release-browser-baseline.json` covers 17 JSON files and its hashes were verified with 0 mismatch before implementation.
- Worktree/base: `manual-artifacts/release-worktrees/four-lane-release`, base `6a2329fa39decfbe3080c1d5f83e827bfde7710f` (latest main after D).
- Before facts: main score 68/100, nav 13, scrollWidth 1425 at 1440, 375 at 390. After facts: main score 68/100 (unchanged), nav 13, 4 four-lane rows, scrollWidth 1425/375 (no horizontal overflow), paper/serif/ink/warm tokens retained. Both 1440 captures are 1425×990; both 390 captures are 375×812.
- Image hashes:
  - `before-hero-1440.jpg` — 1425×990, sha256 `50a280b63405fe2267b2a793dd7c0e381ea9c16866c320354821333c09deb4f9`
  - `before-hero-390.jpg` — 375×812, sha256 `f45bc63f565007984b4fd52787d1da146a37376d21a9973a590a126ce3bed9db`
  - `after-hero-1440.jpg` — 1425×990, sha256 `423ec64e25d78321038386eaf8c963571a8e7d7ae865eb61a3edff6b29278f60`
  - `after-hero-390.jpg` — 375×812, sha256 `fcb72f1d8fbb4504fffcb4c8ac4fee523e83e1b777ee6dd07ff855329e40118f`
- Display scope: Hero internal only; no new section, nav item, score, threshold, source, or provider. The row floor is the old tail-overlay floor and is rendered as “原模型保底阈值 68”; transport applied=false/0 is not counted as an alert; missing/invalid/valid-empty tail records remain distinguishable; full `check:changed`/coverage/independent review are still pending.
