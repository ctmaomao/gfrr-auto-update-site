# ACLED manual input

This directory holds raw ACLED xlsx downloads. The xlsx files themselves are gitignored — only this README and the `.gitkeep` files are tracked.

## Subdirectories
- `weekly/` — 6 regional aggregated data files, refreshed weekly per ACLED's Monday/Tuesday cadence
- `monthly/` — 6 global aggregated data files, refreshed monthly (reserved for M-63b)

Monthly filenames may keep common browser duplicate suffixes after the date, such as
`_0`, ` (1)`, or `-copy`. The sanitizer still requires the canonical dataset slug,
an `as-of-DDMmmYYYY` date, all six datasets on one date, and valid workbook headers.

## Source
Operator manually downloads from https://acleddata.com/conflict-data/download-data-files. Per ACLED EULA Section 3.3, **no automation may scrape or crawl the ACLED site**.

Sanitizers consume these xlsx files and emit derived JSON to
`config/world-order-acled-regional-weekly.json` and
`config/world-order-acled-global-monthly.json` in overwrite mode.

## 一条命令发布

把手工下载的周/月 XLSX 放入对应目录后，在本仓库目录或其子目录运行：

```powershell
npm run acled:publish:auto
```

无需先运行 `git pull origin main` 或两个 status 命令。此入口先确认工作区，fetch 最新 main，备份并暂存未提交的 ACLED 配置，安全切换并快进 main，再恢复配置原字节；随后调用 main 上现有的周/月标准化、检查、配置提交、`main:main` 推送、World Order 刷新与结果复核。功能分支提交不会合入 main。

可先预演（只读本地引用，不联网、不写文件、不切分支、不发布）：

```powershell
npm run acled:publish:auto -- --dry-run
```

如果 main 被另一干净工作目录占用，该目录保留原提交、所有文件和原始 XLSX，只转为 detached HEAD；main 移到当前工作目录。暂存区非空、无关改动/未跟踪文件、占用 main 的目录有改动或被锁定、本地 main 有未推送提交、远端 ACLED 配置与本地编辑基线不同、Git 操作未完成时停止。发生冲突或 push 失败不会 force push、自动 rebase 或继续刷新。

配置备份及 SHA-256 清单保留在输出所示 Git 公共目录的 `acled-publish-backups/`，对应 stash 也保留，不自动删除。失败时按输出路径核对备份和 Git 状态；不要反复重跑或直接覆盖文件。并发锁位于同一公共目录的 `acled-publish-auto.lock`；异常退出后的锁需确认没有发布进程后人工处理。

此命令调用仓库现有发布链，会推送生产 main 并触发既有刷新/部署；需要已安装项目依赖和已登录 GitHub CLI。实现修复须先完成审阅并合入 main，之后再用于实际发布。`git pull --ff-only origin main` 只更新当前分支，不会把功能分支变成 main。

`npm run acled:publish` remains main-only. It refuses to publish from a feature branch or
from a stale/dirty `main`, pushes explicitly to `main`, and dispatches the World Order
workflow explicitly with `--ref main`.
