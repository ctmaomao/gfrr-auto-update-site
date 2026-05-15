# M-37 Documentation Version Drift Fix

M-37 is a text-replacement PR authorized by the local documentation drift diagnostic after M-36 reduced README duplication and bumped the frontend cache version to `28.0M-36V`.

This PR fixes stale current-version claims, stale sanity-check counts, and historical baseline text that had become misleading after M-24 through M-36. It does not change scoring, decision, execution, position, workflows, external-AI behavior, market-pricing logic, or DESIGN.md.

## Classification Summary

| Finding | File | Classification | Treatment |
|---|---|---|---|
| A-2 / A-3 | `README.md` | Current claim | `28.0M-36V` current frontend cache references updated to `28.0M-37V`. |
| A-4 | `docs/OPERATIONS.md`, `docs/DATA_CONTRACT.md`, `AGENTS.md`, `scripts/check-workflows.mjs` | Current command example / checker literal | Bump helper example updated from `28.0G-10` to `28.0M-37V` where it describes current usage. Historical `v28.0G-10` phase markers are preserved. |
| A-5 / A-8 | `README.md`, `docs/OPERATIONS.md`, `docs/SYSTEM_UPGRADE_PLAN.md` | Factual correction | `5 sanity checks` updated to `6 sanity checks` where present, with README retaining only an entry-level pointer. Count matches `scripts/market-pricing/first-real-record-write-scaffold.mjs`. |
| A-6 / A-9 | `docs/OPERATIONS.md`, `docs/DATA_CONTRACT.md` | Mixed | Current cache-version claims updated to `28.0M-37V`; `v28.0M-7V` phase headings and narrative are preserved as historical references. |
| A-7 | `docs/OPERATIONS.md` | Historical preservation | L-3R `displayEnabled=false` hidden-panel statement marked `(Historical, pre-L-3T)` and linked to L-3T enablement. |
| A-10 | `docs/DATA_CONTRACT.md` | Historical preservation | M-5 through M-16 market-pricing waiting/not-implemented baseline marked as pre-M-24/M-26/M-27 historical reference. |
| A-11 | `data/market-pricing-history.json` | Metadata correction | Only `descriptionZh` updated to reflect M-26 metrics and M-27 frontend activation. |

## Drift Fixes

| File | Before | After |
|---|---|---|
| `README.md` | `当前前端版本为 \`28.0M-36V\`` | `当前前端版本为 \`28.0M-37V\`` |
| `README.md` | `Frontend asset cache version 当前为 \`28.0M-36V\`` | `Frontend asset cache version 当前为 \`28.0M-37V\`` |
| `README.md` | `当前 frontend asset cache version：\`28.0M-36V\`` | `当前 frontend asset cache version：\`28.0M-37V\`` |
| `docs/OPERATIONS.md` | 当前应为 `28.0M-36V` | 当前应为 `28.0M-37V` |
| `docs/OPERATIONS.md` | `window.__GFRR_FRONTEND_VERSION__ -> 28.0M-36V` | `window.__GFRR_FRONTEND_VERSION__ -> 28.0M-37V` |
| `docs/OPERATIONS.md` | `node scripts/bump-frontend-asset-version.mjs 28.0G-10` | `node scripts/bump-frontend-asset-version.mjs 28.0M-37V` |
| `docs/OPERATIONS.md` | `Current frontend asset cache version is \`28.0M-7V\`` | `Current frontend asset cache version is \`28.0M-37V\`` |
| `docs/OPERATIONS.md` | hidden because `displayEnabled=false` | `(Historical, pre-L-3T)` hidden-panel statement, superseded by L-3T. |
| `docs/OPERATIONS.md` | `5 sanity checks run before any write` | `6 sanity checks run before any write` |
| `README.md` | no post-M-36 line for the M-24 sanity-check count | entry-level pointer says the scaffold runs `6 sanity checks` before writes. |
| `docs/SYSTEM_UPGRADE_PLAN.md` | `5 sanity checks run before any write` | `6 sanity checks run before any write` |
| `docs/DATA_CONTRACT.md` | current cache section says `28.0M-36V` | current cache section says `28.0M-37V` |
| `docs/DATA_CONTRACT.md` | `node scripts/bump-frontend-asset-version.mjs 28.0G-10` | `node scripts/bump-frontend-asset-version.mjs 28.0M-37V` |
| `docs/DATA_CONTRACT.md` | `The frontend asset cache version is \`28.0M-7V\`` | `The frontend asset cache version is \`28.0M-37V\`` |
| `docs/DATA_CONTRACT.md` | `status=waiting_for_history` / `marketPricingTemperatureLayer remains not implemented` | Preserved inside a `(Pre-M-24 / M-26 / M-27 Baseline - Historical Reference)` section. |
| `data/market-pricing-history.json` | `仍未启用 MA60 / 标准差 / z-score 计算（M-26），前端仍未激活真实数据显示（M-27）。` | `M-26 已启用 MA60 / 标准差 / z-score 计算；M-27 已激活前端温度展示。当前 status=has_history。` |
| `AGENTS.md` | current frontend version `28.0M-36V` | current frontend version `28.0M-37V` plus M-37 authority entry. |

## Preserved Historical References

- `v28.0M-7V` and `v28.0M-7V-1` phase headings and narrative are retained as historical phase records.
- Historical `v28.0G-10` Data Check Expected-Skip phase names are retained.
- M-36 code dead weight removal remains recorded as `28.0M-36V`; helper-induced drift was corrected so the M-36 historical cache string remains `?v=28.0M-36V`.
- Pre-M-24/M-26/M-27 market-pricing waiting/not-implemented language remains for audit value, with a new historical baseline marker.

## Data File Boundary

Only `data/market-pricing-history.json.descriptionZh` changes. All other top-level fields and nested values must remain byte-identical after deleting `descriptionZh` from both HEAD and working tree JSON before comparison.

Verification method:

```bash
jq 'del(.descriptionZh)' < git_show_HEAD_data/market-pricing-history.json > pre.json
jq 'del(.descriptionZh)' < data/market-pricing-history.json > post.json
diff pre.json post.json
```

The expected diff output is empty.
