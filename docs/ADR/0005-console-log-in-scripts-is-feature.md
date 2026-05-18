# ADR-0005 — `console.log` in `scripts/` is feature, not debug residue

**Status**: Accepted (since v27.x baseline)

## Context

`scripts/` 下的 `.mjs` 文件包含 ~470 处 `console.log` / `console.warn` /
`console.error`。表面上看像 debug 残留,常见 lint 规则会要求清理。

但这些 `console.*` 全部是 **GitHub Actions Job Summary 与日志输出**:

- Daily pipeline (`build-daily-radar-data.yml`) 用 stdout 输出每个 driver 的拉取摘要
- `check:*` 脚本用 stdout 输出违反项与通过项
- Worker health check 用 stdout 输出 freshness diagnostics
- 这些日志是运维排障的第一手数据,见 `docs/OPERATIONS.md`

## Decision

**`scripts/**/*.mjs` 中的 `console.log` / `console.warn` / `console.error`
是项目设计的一部分,不是 debug 残留**。

- 不设置 lint 规则禁用 `console.*`
- 不批量删除 `console.log`
- 新增的 `check:*` 脚本必须用 `console.log` / `console.error` 输出结果
  (而非抛异常或静默退出)
- `process.exit(1)` 配合 `console.error` 让 GitHub Actions 红框显示原因

前端 (`scripts/modules/*.js` + `scripts/app.js`) **不属于**本 ADR 范围;前端
`console.log` 应慎用,只在调试期添加,提交前清理。

## Consequences

- ✅ GitHub Actions 日志可读性高 (每步骤都有上下文)
- ✅ 用户报 bug 时可以直接附 Actions 日志做诊断
- ✅ 没有 lint 噪声
- ❌ Future Claude 不能用 "清理 console.log" 作为重构任务
- ❌ 如果未来引入 lint,必须 scope 到前端 only

⚠️ **NEVER** 把 `scripts/**/*.mjs` 里的 `console.*` 当 debug 残留删除。
