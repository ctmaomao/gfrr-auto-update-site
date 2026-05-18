# ADR-0001 — Zero production dependencies

**Status**: Accepted (since project inception, v27.x baseline)

## Context

项目运行在 GitHub Pages (静态) + GitHub Actions (Node) + Cloudflare Workers
三个环境。Pages 不允许任何 npm runtime,Workers 有 1MB bundle 限制,
Actions 每次 cold start 需要 `npm install`。

如果引入 production 依赖:
- Workers bundle 可能超限
- Actions cold start 增加 30s-2min
- Supply chain 风险倍增 (项目处理金融数据)
- 依赖 transitive 更新 → 需要持续维护 dependabot / renovate

## Decision

**`package.json` 不声明任何 `dependencies` 或 `devDependencies`**。
只声明 `engines.node = ">=24 <25"` 和 `scripts`。

所有功能用 Node 24 内置 API (fetch, fs/promises, crypto, child_process) +
浏览器原生 API + Cloudflare Workers runtime。

## Consequences

- ✅ Pages 部署是纯静态文件复制,无构建
- ✅ Workers bundle 极小 (~5KB)
- ✅ Actions cold start ~5s (无 npm install)
- ✅ Supply chain 攻击面接近 0
- ❌ 不能用 Chart.js、D3、testing framework 等;必须手写 SVG + 浏览器原生 API
- ❌ 没有 prettier / eslint;靠 `scripts/check-*.mjs` 自定义契约守护
- ❌ 新 contributor 上手陡峭 (无熟悉的脚手架)

任何引入 npm 依赖的 PR 必须先开新 ADR 推翻本决策。
