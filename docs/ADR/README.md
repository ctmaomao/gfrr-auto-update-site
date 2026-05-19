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

## Superseded

(None yet)

## How to add a new ADR

1. 复制最近一个 ADR 作为模板
2. 文件名格式: `NNNN-kebab-case-title.md`,NNNN 紧接上一个编号
3. 在本 README 的 Active 表追加一行
4. 若推翻已有 ADR,把旧 ADR `Status` 改为 `Superseded by ADR-NNNN`,并把它从 Active 移到 Superseded
