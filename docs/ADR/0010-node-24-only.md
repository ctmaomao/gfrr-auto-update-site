# ADR-0010 — Node.js 24 only across CI and local

**Status**: Accepted (v28.0L-3I-0)

## Context

Node 20 LTS 不支持 native fetch keepAlive options,某些 stream API 行为不一
致。Node 25 是 odd-numbered (非 LTS),稳定性不保证。混用版本会导致:

- GitHub Actions runner 与本地不一致的 fetch 行为
- Cloudflare Workers (V8) 与 Node runtime 字符串处理差异
- `import.meta.resolve` 等 API 在 20 上仍是 experimental

## Decision

**全项目锁定 Node.js 24**:

1. `.nvmrc` = `24`
2. `.node-version` = `24`
3. `package.json` `engines.node` = `">=24 <25"`
4. 所有 GitHub Actions workflow 必须用 `actions/setup-node@v4` + `node-version: 24`
5. `check:node-runtime` 校验本地 Node 24
6. `check:workflows-node24-only` 扫描所有 workflow YAML,确保:
   - 不使用 `node-version: 20` / `18` / 旧版本
   - 不使用 已废弃的 actions 旧 major (e.g. `actions/setup-node@v3`)
   - 防止 Node 20 / Node 25 / 旧 action 版本回退

## Consequences

- ✅ 本地与 CI 行为一致
- ✅ 所有 Node 24 native API (fetch with keepAlive, Test Runner, native WebSocket) 可用
- ✅ 0 production dep 决策 (ADR-0001) 在 Node 24 上更顺
- ❌ 不能用某些只在 LTS 上经过审计的库 (本项目无 dep,不影响)
- ❌ 用户本地需要 nvm 切到 24

任何想引入 Node 26/28 升级的 PR 需要先开新 ADR,并同步更新 4 个文件 +
`check:workflows-node24-only` 的扫描范围。
