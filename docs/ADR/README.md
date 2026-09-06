# Architecture Decision Records (ADR)

> 项目重大架构决策的不可变记录。每个决策一个文件,**只追加,永不修改**。
> 决策被推翻时,创建新 ADR(`status: Accepted`)并把旧 ADR 状态改为 `Superseded by ADR-NNNN`。
>
> 格式参考 Michael Nygard ADR 模板。每个决策包含:Context / Decision / Consequences / Status。

## Active

| # | 标题 | 状态 |
|---|---|---|
| [ADR-0001](0001-zero-dependencies.md) | Zero production dependencies | Accepted |
| [ADR-0002](0002-worker-first-realtime.md) | Worker-first realtime as main runtime path | Accepted |
| [ADR-0003](0003-secondary-does-not-affect-scoring.md) | Secondary diagnostics do not affect scoring | Accepted |
| [ADR-0004](0004-world-order-is-overlay-not-risk-module.md) | World Order is regime overlay, not 7th risk module | Accepted |
| [ADR-0005](0005-console-log-in-scripts-is-feature.md) | `console.log` in `scripts/` is feature, not debug residue | Accepted |
| [ADR-0006](0006-isoweek-keyed-merge-for-qqq.md) | QQQ weekly history uses isoWeek-keyed merge (M-62) | Accepted |
| [ADR-0007](0007-effective-display-inputs-canonical.md) | `effectiveDisplayInputs` is the canonical current-value source | Accepted |
| [ADR-0008](0008-external-ai-read-only.md) | External AI is read-only display layer | Accepted |
| [ADR-0009](0009-brent-freshness-gated-promotion.md) | Brent promotion is freshness-gated (FRED anchor + Yahoo + TE) | Accepted |
| [ADR-0010](0010-node-24-only.md) | Node.js 24 only across CI and local | Accepted |
| [ADR-0011](0011-paper-not-dashboard-design.md) | UI is editorial paper aesthetic, not SaaS dashboard | Accepted |
| [ADR-0012](0012-check-all-composed-in-package-json.md) | `check:all` is composed in `package.json`, not separate config | Accepted |
| [ADR-0013](0013-dev-dependencies-allowed-for-local-tools.md) | devDependencies allowed for local development tools | Accepted |
| [ADR-0014](0014-design-md-is-ia-ground-truth.md) | DESIGN.md §4.1 is the IA ground truth; appendix sections have content boundaries | Accepted |
| [ADR-0015](0015-move-bond-volatility-structural-gate.md) | MOVE (债券/利率波动率) enters via structural gating, not a 7th risk module | Accepted |
| [ADR-0016](0016-bubble-watch-second-page.md) | AI 泡沫监测作为第二独立页面 + 自有周更数据管线 (display-only) | Accepted |
| [ADR-0017](0017-main-score-wind-fallback-policy.md) | Wind paid fallback may enter main radar scoring only through source arbitration and replay gates | Accepted |
| [ADR-0018](0018-m94-path-c-static-frontend-runtime.md) | M-94 Path C frontend consumes static daily snapshot | Accepted |
| [ADR-0019](0019-bubble-watch-v2-core-shadow-scoring.md) | Bubble Watch v2 使用固定 Core-23 + Shadow-4 | Accepted |
| [ADR-0020](0020-web-ngrams-primary-article-discovery.md) | Web NGrams as the primary Oil News article-discovery candidate | Accepted |
| [ADR-0021](0021-bubble-watch-weekly-editorial-read-only.md) | Bubble Watch weekly AI editorial is an independent read-only display layer | Accepted |
| [ADR-0022](0022-macro-risk-editorial-integrated-overview.md) | Macro Risk AI editorial is integrated into the main overview | Accepted |
| [ADR-0023](0023-macro-overview-narrative-first-evidence-on-demand.md) | Macro overview uses a narrative-first, evidence-on-demand reading path | Accepted |

## Pending human review

| # | 标题 | 状态 |
|---|---|---|
| [ADR-0024](0024-agent-domain-authority.md) | Domain assertions follow delegated authority | Implementation authorized; pending independent merge review |

| [ADR-0025](0025-proportionate-validation.md) | Proportionate local validation | Owner-authorized local implementation; pending merge review |

| [ADR-0026](0026-tiered-git-authorization.md) | Tiered Git authorization | Owner accepted; independent merge review retained |

| [ADR-0027](0027-design-document-consistency.md) | Scoped design-document consistency correction; partial supersession of ADR-0011/0014 enforcement references | Owner authorized; independent merge review retained |

| [ADR-0028](0028-energy-record-assertion-location.md) | Historical Energy/Transport assertions follow their records | Owner authorized; independent checker merge review retained |

## Superseded

(None yet)

## How to add a new ADR

1. 复制最近一个 ADR 作为模板
2. 文件名格式: `NNNN-kebab-case-title.md`,NNNN 紧接上一个编号
3. 在本 README 的 Active 表追加一行
4. 若推翻已有 ADR,把旧 ADR `Status` 改为 `Superseded by ADR-NNNN`,并把它从 Active 移到 Superseded
