# `check:all` 覆盖分类提案（只读设计）

## 目的

本文件给出 `check:all` 可达范围的**准确口径**、17 项未纳入脚本的逐条分类，以及一个只读 meta-checker 的需求草案。

动机：2026-09-18 健康审计中，可达范围被连续误判两次（51 → 223 → 227）。误判源于静态 grep 与不完整套件展开，而非脚本本身有问题。**显性登记这 17 项，可防止后续再次误判覆盖范围。**

本文件为设计提案。**不修改任何 checker 断言、不改变 `check:all` 组成、不新增保护网。** 落地需独立评审与授权。

## 1. 口径定义

### 1.1 权威展开算法

以 `tests/unit/check-suite-wiring.test.mjs` 的现有算法为准（该测试已被 `check:docs` 覆盖）：

- 递归展开 `npm run <name>` 形式的引用；
- 递归展开 `node scripts/check-suite.mjs <suite>`，其成员取自 `check-suite.mjs` 的 `SUITES`；
- 入口自身计入可达集合；
- 遇环报错。

### 1.2 实测结果

| 指标 | 值 |
|---|---|
| npm 脚本总数 | 414 |
| `check:*` 脚本总数 | 244 |
| 从 `check:all` 可达的 `check:*` | **227** |
| 未可达的 `check:*` | **17** |

> 227 + 17 = 244。另有入口 `check:all` 本身计入可达集合（其命令内不含对自身的引用）。

### 1.3 关键结论

**17 项例外全部可解释，不存在未记录的覆盖缺口。** 按唯一脚本归类：

| 类别 | 项数 | 脚本 |
|---|---|---|
| 重复别名 | 2 | `check:external-ai:contract`、`check:external-ai:with-artifacts` |
| 参数变体 | 2 | `check:data:verbose`、`check:data:strict-live-alignment` |
| 已被其它入口执行 | 8 | `check:bubble-watch-dom`、`check:world-order-acled-weekly`、`check:world-order-acled-monthly`、`check:external-ai-provider-adapters`、`check:external-ai-production-projection`、`check:brent-promotion-audit-fields`、`check:brent-crack-spread`、`check:brent-public-proxy-source-review` |
| 设计上排除 · 需要网络或写入前置放行 | 2 | `check:worker-health`、`check:external-ai-production-publish` |
| 设计上排除 · 写入或需手工制品 | 3 | `check:external-ai-manual-scaffold`、`check:external-ai-manual-input`、`check:external-ai-manual-input:compact` |
| 本地开发者工具 | 1 | `check:changed` |
| **合计** | **17** | 与 §1.2 一致 |

> 注意：`check:external-ai-manual-input` 及其 `:compact` 变体同时被 `check:external-ai-manual-scaffold` 调用，但因其主要属性是产生 ignored 写入，归类为「写入或需手工制品」，不重复计入「已被其它入口执行」。

## 2. 分类明细

### 2.1 重复别名（2 项）

| 脚本 | 证据 | 处理 |
|---|---|---|
| `check:external-ai:contract` | 命令体与 `check:external-ai` 完全相同（`node --check scripts/check-suite.mjs && node scripts/check-suite.mjs external-ai`），后者已在 `check:all` | 保留为显式别名；登记理由，不纳入 |
| `check:external-ai:with-artifacts` | 同上，指向 `external-ai-with-artifacts` 套件，属制品在场时的强化变体 | 保留为显式别名；登记理由，不纳入 |

### 2.2 参数变体（2 项）

| 脚本 | 证据 | 处理 |
|---|---|---|
| `check:data:verbose` | `node scripts/validate-data.mjs --verbose`，与已纳入的 `check:data` 同一脚本，仅增加 expected-skip 解释 | 不纳入。`AGENTS.md` §6 已规定其用途为「解释 expected skip」 |
| `check:data:strict-live-alignment` | `node scripts/validate-data.mjs --strict-live-alignment` | 不纳入。`AGENTS.md` §6 规定「仅明确要求严格时间对齐时使用」 |

### 2.3 已被其它入口实际执行（8 项）

| 脚本 | 由谁执行 | 证据 |
|---|---|---|
| `check:bubble-watch-dom` | `check:bubble-watch`（已在 `check:all`） | 后者命令体末尾直接执行 `node scripts/check-bubble-watch-dom.mjs` |
| `check:world-order-acled-weekly` | `check:world-order-acled-weekly-runtime`（在 `check:all` 的 `world-order-acled` 套件内） | 两个脚本执行同 3 个测试文件：`acled-weekly-coverage` / `acled-weekly-dry-run` / `acled-weekly-timezone`；`-runtime` 额外含 `acled-source-freshness` 并加 `--runtime-history` |
| `check:world-order-acled-monthly` | `check:world-order-acled-monthly-runtime`（同上） | 执行同 3 个测试文件：`acled-monthly-trend` / `acled-download-manifest` / `acled-monthly-dry-run` |
| `check:external-ai-provider-adapters` | `check:external-ai-manual-scaffold` | 后者显式调用 `npm run check:external-ai-provider-adapters` |
| `check:external-ai-production-projection` | `external-ai-with-artifacts` 套件 | 该套件成员列表含此项；`check:all` → `check:external-ai` → `external-ai` 套件亦含同名制品变体 |
| `check:brent-promotion-audit-fields` | `brent` 套件 | `check:brent`（在 `check:all`）→ `SUITES.brent` 成员 |
| `check:brent-crack-spread` | `brent` 套件 | 同上 |
| `check:brent-public-proxy-source-review` | `brent` 套件 | 同上 |

> 说明：`check:brent-*` 三项在修正 1 之前被误判为不可达，原因是套件键 `brent:` 无引号，展开正则漏匹配。此处登记正是为了固化该结论。

### 2.4 设计上排除：需要网络或写入前置放行（2 项）

| 脚本 | 证据 | 处理 |
|---|---|---|
| `check:worker-health` | 直接 `fetch` Cloudflare Worker 端点（`gfrr-realtime-worker.../market.worker-preview.json`、`/market.secondary-preview.json`），超时 4500ms | **保持排除**。离线 `check:all` 不应引入网络依赖。线上由 `check-worker-health.yml`（`16,46 * * * *`）承担 |
| `check:external-ai-production-publish` | 组合 `check:external-ai-production-write-guard` + `check:data`，用于生产写入前的放行判定 | **保持排除**。属写入前置流程，非离线契约检查 |

### 2.5 设计上排除：产生文件写入或需手工制品（3 项）

| 脚本 | 证据 | 处理 |
|---|---|---|
| `check:external-ai-manual-input` | 调用 `manual:external-ai:build-input`，生成 ignored 的 `manual-artifacts/external-ai/manual-input-*.json` | **保持排除**。`AGENTS.md` §5 明确：零文件写入审计不运行该生成项 |
| `check:external-ai-manual-input:compact` | 同上，compact 变体 | 同上 |
| `check:external-ai-manual-scaffold` | 总编排器：含 `manual:external-ai:dry-run` 等手动目标 | 同上；仅作手动入口 |

### 2.6 本地开发者工具（1 项）

| 脚本 | 证据 | 处理 |
|---|---|---|
| `check:changed` | `node scripts/check-changed.mjs`，按工作区 vs `HEAD` 增量选择文档或完整检查 | 不纳入。它是 `check:all` 的**调用方**，纳入会构成自引用 |

## 3. meta-checker 需求草案

### 3.1 目标

提供一个**只读**检查器，回答「哪些 `check:*` 不在 `check:all` 内，以及每条的理由是什么」，防止覆盖范围被再次误判。

### 3.2 行为

- 使用 §1.1 的权威展开算法计算可达集合；
- 输出：可达数 / 总数 / 未可达清单（稳定排序）；
- 对未可达项，与白名单比对；白名单外的项即失败；
- 只读，不执行被检查的脚本本身，无网络、无文件写入。

### 3.3 白名单显性化要求

按 `AGENTS.md` §10 第三条，**每条 ignore 必须写明理由、对应边界与 unlock 路径**。据此，白名单条目格式为：

```
条目：check:worker-health
类别：设计上排除 · 需要网络
理由：直接 fetch Cloudflare Worker 端点，离线 check:all 不应引入网络依赖
边界：仅限离线契约检查；线上健康由 check-worker-health.yml 承担
unlock 路径：若未来引入可控 mock/stub 传输层，可移入 check:all
```

### 3.4 建议的白名单初始内容

即本文件 §2 的 17 项，逐条附上述三字段。

### 3.5 验收条件

- 白名单内项被移除时，检查器能报出「未登记的新增不可达项」；
- 白名单内项实际变为可达时，检查器能报出「已过期的白名单条目」；
- `check:all` 自身不被判为不可达；
- 断言不得包含 skip 或宽泛 ignore。

### 3.6 明确不做

- 不因本提案向 `check:all` 增删任何现有脚本；
- 不改写任何现有 checker 断言；
- 不把网络型检查引入离线套件。

## 4. 待决问题

1. 该 meta-checker 应纳入 `check:all` 还是 `check:docs`？建议纳入 `check:docs`（文档/接线一致性范畴）。
2. `check:worker-health` 是否值得引入可控 mock 传输层以纳入离线套件？属可选增强，非缺陷修复。
3. 17 项白名单是按「名称」还是「名称 + 类别」登记？建议含类别，便于后续统计排除原因分布。

## 关联文档

- [2026-09-18 项目健康度审计](HEALTH_AUDIT_2026_09_18.md)
- `tests/unit/check-suite-wiring.test.mjs` · `scripts/check-suite.mjs` · `package.json`
