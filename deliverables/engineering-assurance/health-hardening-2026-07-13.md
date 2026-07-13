# Engineering Health Hardening — Baseline

- Baseline tag: `pre-health-hardening-20260713`
- Baseline commit: `b0ca123708639ebf50376bd5990822cff22239fc`
- Branch: `codex/health-hardening-20260713`
- Captured: 2026-07-13 (Pacific/Auckland)

## Toolchain

- Node.js: `v24.15.0`
- npm: `11.12.1`
- Wrangler: `4.85.0`
- GitHub CLI: `2.92.0`
- `codebase_memory_mcp`: ready, 15,573 nodes / 38,665 edges, baseline change count 0

## Verification baseline

- `npm run check:all`: exit 0, 91.1 seconds
- `npm audit --include=dev`: exit 1, one High advisory on `xlsx@0.18.5`
- `npm audit --omit=dev`: exit 0
- Worker health hard gate: exit 0, health score 100, critical missing 0
- Worker warning: weekend VIX freshness only; US10Y and SPX classified as market-closed stale-ok

## Size and complexity baseline

| File | Bytes | Lines | Graph functions | Total cyclomatic | Total cognitive |
|---|---:|---:|---:|---:|---:|
| `scripts/run-daily-pipeline.mjs` | 535,289 | 12,073 | 476 | 1,022 | 1,443 |
| `scripts/modules/renderMacroOverview.js` | 164,720 | 3,709 | 189 | 657 | 1,037 |

The graph confirms that line count is not the defect by itself. The Daily file mixes source adapters, score arbitration, contract assembly, history and I/O. The renderer fans out to 26 section renderers and contains distinct trend, thematic, appendix and external-AI presentation clusters.

## GitHub and deployment baseline

- Latest successful GitHub Pages deployment: ID `5418374161`, Actions run `29219460142`, SHA `b0ca123708639ebf50376bd5990822cff22239fc`
- GitHub Pages URL: `https://ctmaomao.github.io/gfrr-auto-update-site/`
- Active Worker version: `3ed04da6-ce20-4474-8899-67b61bd06469`
- Production KV namespace: `GFRR_MARKET_KV` / `ef1be9a625b44b9aaec274efc16cfcac`
- Cloudflare Pages projects at baseline: none
- Open pull requests at baseline: none

The custom production URL `https://radar.gfrfinradar.uk/` is served by EdgeOne Pages, not by the GitHub Pages workflow. A cache-busted read showed that it was still serving a 2026-07-07 site snapshot while GitHub Pages matched current `main`. Production EdgeOne deployment remains outside this branch and must not be changed before the explicit production-deploy confirmation gate.

## Actions and commit-noise baseline

Exact window: 2026-06-13 through 2026-07-13.

- Actions runs: 2,492
- Successful: 2,454
- Failed: 28
- Cancelled: 5
- Success rate: 98.48%
- Commits on `main`: 680
- `github-actions[bot]` commits: 412 (60.6%)

Bot commit distribution:

| Writer | Commits |
|---|---:|
| Oil News Event Watch | 170 |
| Oil Thermal Watch | 121 |
| World Order Stress | 35 |
| Daily Radar Data | 34 |
| External AI | 30 |
| Oil Directional Pressure | 11 |
| Bubble Watch | 6 |
| QQQ weekly market data | 5 |

Moving the two high-frequency writers to a separate data branch could reduce automatic `main` commits by 70.6%, but it would also require the EdgeOne production path to overlay that branch. That production contract is not currently represented in this repository, so the branch migration is not approved by this hardening work without separate production evidence. A structural semantic-diff audit found at most 32 of 412 commits (7.8%) whose substantive payload appeared unchanged after volatile freshness metadata was excluded; this is an upper bound, not an approved guard, because those timestamps and age fields are part of the current freshness contract.

## Automatic commit-noise hardening decision

The eight `main` writers already use a physical `git diff` no-op guard, and all eight share `gfrr-main-writer-main` with `cancel-in-progress: false`. The repository therefore already has the safe baseline controls requested for no-op writes and a single-writer queue.

| Option | Measured reduction | Decision |
|---|---:|---|
| Ignore freshness-only fields | At most 32 / 412 = 7.8% | Rejected: `generatedAt` / `observedAt` / age changes are current evidence of observation freshness; skipping them would make successful refreshes look stale or require weakening the freshness contract. |
| Reduce Oil News / Thermal cadence | Up to 291 / 412 = 70.6% | Rejected: directly lowers freshness SLA. |
| Move Oil News / Thermal outputs to a data branch | 291 / 412 = 70.6% | Blocked: GitHub Pages could be adapted, but authoritative production is an EdgeOne deployment whose branch/overlay contract is absent from the repository. Merging this change could leave production stale. |
| Rewrite/amend bot history | Historical only | Prohibited by the task safety boundary. |

The maximum measured architecture-level reduction is 70.6%, but the immediately deployable safe reduction under the current production and freshness contracts is 0%. No workflow cadence, success signal or data field was changed to manufacture the 50% target. The next authorized step is to obtain the EdgeOne production build/branch contract, then validate a data-branch overlay in isolated staging before proposing that migration.

## Confirmed findings at baseline

### High

1. `xlsx@0.18.5` is affected by SheetJS prototype-pollution and ReDoS advisories. The official fixed Community Edition line is 0.20.2+, and the current official tarball is 0.20.3.
2. The custom EdgeOne production site is stale relative to `main` and GitHub Pages. This is an operational production blocker, not a code-cache false positive.

### Medium

1. The ACLED weekly/monthly XLSX sanitizers lack pre-parse file-size and row-count caps.
2. `FRED_API_KEY` is scoped at workflow level in Daily and Realtime workflows instead of only the generating step.
3. The Pages workflow uploads `path: .`; ignored check artifacts can enter the public Pages artifact.
4. The default check chain currently creates a GDELT projection under ignored `manual-artifacts/`, despite the documented read-only check contract.
5. There is no real-browser PR smoke, no formal `node:test` suite and no quantitative coverage gate.
6. Daily and Macro Overview have real responsibility concentration and source-marker coupling; mechanical line splitting would create checker blind spots.
7. Automatic data commits dominate `main`; the safe in-repo reduction ceiling is below 50% unless the untracked EdgeOne production contract is changed.

## Safety boundaries

- No manual edits to `data/*.json` or `realtime/*.json`.
- No changes to scoring, decision, execution, position, Brent promotion or contract semantics.
- External AI, World Order, macro-driver and ODP boundaries stay unchanged.
- No production Worker/KV reuse for staging.
- No production deployment or merge to `main` before explicit owner confirmation.
- Every implementation area is committed separately and can be reverted independently.

## Independent read-only reviews

The baseline was reviewed by six explicit roles: code mapper, security auditor, QA expert, architect reviewer, correctness reviewer and debugger. All six completed before implementation started.

## Implemented hardening results

- `xlsx` is locked to the official SheetJS `0.20.3` tarball and integrity. The two ACLED sanitizers now reject non-regular/symlinked or out-of-root inputs, enforce pre-parse byte caps, accept only `Sheet1`, and enforce worksheet row caps. A dedicated security checker locks the package source, integrity, import allowlist and input guards.
- PR validation now runs the complete development dependency audit, measured Node 24 coverage, the existing full check chain and one non-duplicated Playwright Chromium matrix. The four browser cases cover desktop/mobile, home/Bubble Watch, ancillary-data loss and ineligible External AI fallback.
- The cohesive Daily Brief planner moved to `scripts/daily/daily-brief.mjs`. Six available fixtures plus the unavailable fallback produced an exact normalized before/after JSON match after timestamp exclusion.
- The macro trend SVG cluster moved to `scripts/modules/renderMacroTrend.js`. Desktop and mobile before/after screenshots were byte-identical, and the asset version was advanced to `health-hardening-1` through the repository version script.
- The Pages workflow publishes an explicit `_site` allowlist instead of the repository root. FRED secrets are step-scoped. The default GDELT contract check no longer creates an ignored manual artifact.
- No scoring, decision, execution, position, Brent promotion, data contract, External AI, World Order, macro-driver or ODP semantics changed. `scripts/modules/realtime.js`, `data/*.json` and `realtime/*.json` have no branch diff.

Current measured coverage for the selected pure modules is 99.56% lines, 95.63% branches and 96.97% functions. The extracted Daily Brief module is 100% line/function and 91.18% branch covered. The Daily entry is 11,840 lines / 523,749 bytes (down 233 lines / 11,540 bytes); the macro renderer is 3,242 lines / 148,200 bytes (down 467 lines / 16,520 bytes).

## Isolated staging and observation

- Pages project: `gfrr-health-hardening-20260713`
- Stable endpoint: `https://gfrr-health-hardening-20260713.pages.dev`
- Initial deployment: `7efffbe7-19aa-41f3-a746-154a2af4f956`
- Immutable deployment endpoint: `https://7efffbe7.gfrr-health-hardening-20260713.pages.dev`
- Source: `5bd5d3b` from branch `staging`
- Artifact: 35 allowlisted files / 2,891,522 bytes; excludes `.codex`, `manual-artifacts`, secrets, package files and workflows
- Local equivalent dry-run: `wrangler pages dev` with compatibility date `2026-05-01`, exit 0
- Browser verification: local 4/4 and stable remote endpoint 4/4, exit 0
- Worker/KV: not created because Worker code was unchanged; production KV was not reused
- Monitor: Codex automation `gfrr-hardening-staging-monitor`, active every six hours through 2026-07-20 06:00 UTC
- Observation evidence: ignored `manual-artifacts/health-hardening/staging-observation.jsonl`; successful samples are intentionally not committed

The first staging sample is `WARN`, not a false `PASS`: the repository-local `realtime/market.json` fallback is old. M-94 frontend reads `data/radar-data.json`, so this does not invalidate the browser result. Subsequent isolated redeploys explicitly overlay `origin/realtime-data` and independently check the public Worker endpoint. Any reproducible branch-caused High/Medium regression restarts the seven-day observation window after its fix.
