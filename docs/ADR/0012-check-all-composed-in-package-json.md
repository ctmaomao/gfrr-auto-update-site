# ADR-0012 — `check:all` is composed in `package.json`, not separate config

**Status**: Accepted (since v27.x → reaffirmed v28.0M-62)

## Context

项目有 ~50+ 个独立 `check:*` 脚本,串成 `check:all` (当前 67 项)。可能的
组织方式:

- **A**: 独立配置文件 (`check-config.json` / `Makefile` / `tasks.yml`)
- **B**: 单一长字符串 `&&` chain 写在 `package.json` 的 `scripts.check:all`
- **C**: shell 脚本 `scripts/check-all.sh`

A 看起来更"工程化",但会:
- 引入新的配置文件格式,违反 ADR-0001 "0 依赖" 精神
- 让 `npm run check:all` 与 "checks in package.json" 不同步
- 添加 npm script 时必须同步两处

## Decision

**`check:all` 永远是 `package.json` 的 `scripts.check:all` 长 `&&` 链**。

- `package.json` 是所有 check 命令的 **唯一权威源**
- 添加新 check 时:
  1. 在 `scripts.<check:NAME>` 添加新条目
  2. 在 `scripts.check:all` 末尾或合适位置 `&& npm run check:NAME`
  3. 在 `docs/PROJECT_BACKLOG.md` 的 "check:all 项数" 字段加 1
- AGENTS.md `## Documentation Authority Index` 明确把 `package.json` 列为
  Current Authority
- `npm run check:all` 失败时,GitHub Actions Job Summary 会清晰显示是哪个
  子 check 失败 (因为是顺序 `&&`)

## Consequences

- ✅ 唯一权威源,无配置漂移
- ✅ 任何 contributor 只需读 `package.json` 就能知道完整 check 流水
- ✅ `npm run check:NAME` 子命令可独立运行做局部调试
- ❌ `package.json` `scripts.check:all` 单行可能 > 5KB (当前 ~6KB),阅读体感差
  → 用 IDE word wrap 解决
- ❌ 增加新 check 必须同步更新 BACKLOG 计数

⚠️ **NEVER** 把 check:all 抽到独立 config 文件 (会让 `npm run check:all` 不再是
权威源)。
⚠️ **NEVER** 让 `check:all` 通过削弱单个 check 的失败条件来通过 (违反 AGENTS.md
"不要为了让检查通过而削弱 validate-data.mjs" 等条款)。

## References

- `package.json` `scripts.check:all`
- AGENTS.md "Documentation Authority Index"
- `docs/PROJECT_BACKLOG.md` "Section 1 维护状态" 的 `check:all 项数`
