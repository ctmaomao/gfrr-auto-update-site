# 前端 asset 版本检查器设计提案（只读）

## 目的

`AGENTS.md` §1 与 `docs/DATA_CONTRACT.md` 都要求：修改 `index.html`、`scripts/app.js` 或当前入口实际加载的 `scripts/modules/*.js` 时，必须同步执行 `npm run bump:frontend-asset-version`。

**但没有任何 checker 强制这条规则。** `check:all` 全绿不能保证缓存 token 已更新。

本文件给出一个只读检查器的设计与验证证据。**不修改任何现有 checker 断言、不改变 `check:all` 组成、不改动前端代码或数据。** 落地需独立评审与授权。

## 1. 触发本提案的实际缺陷

2026-09-19 的 `f88b2c6c`（ODP 新闻源额度耗尽降级提示）修改了 `scripts/modules/renderOilDirectional.js`，但未 bump `APP_VERSION`。实测证据：

| 项目 | 值 |
|---|---|
| `scripts/app.js` `APP_VERSION` | `editorial-history-1` |
| 线上 `radar.gfrfinradar.uk/scripts/app.js` | `editorial-history-1`（相同） |
| 线上 `renderOilDirectional.js` 含新函数 | **False** |

由于 `app.js` 以 `?v=${APP_VERSION}` 动态导入模块，版本 token 不变意味着回访者会复用浏览器缓存的旧模块图，新提示**永不出现**。该提交通过了当时执行的全部检查：

- 额度状态回归测试 5/5
- `check:frontend-live-contracts`、`check:frontend-zh-copy`
- 完整 `check:all`
- `git diff --check`

即：**现有保护网在结构上无法发现这类缺陷。** 修复见 `9e81019c`。

## 2. 为什么现有检查无法覆盖

现有相关 checker 检查的是**一致性**，不是**新鲜度**：

| 检查 | 覆盖内容 | 为何漏掉本缺陷 |
|---|---|---|
| `check:frontend-live-contracts` | DOM/渲染契约 | 与缓存 token 无关 |
| `check:realtime-js-frozen` | 冻结模块未被重新接入 | 只管 `realtime.js` |
| `check:workflows` | workflow 结构 | 不涉及前端 token |
| `check:frontend-zh-copy` | 文案规范 | 无关 |

bump 工具 `scripts/bump-frontend-asset-version.mjs` 是**写工具**，不参与校验。

## 3. 核心不变量

被检查的规则应为：

> 记最近一次 `APP_VERSION` **取值发生变化**的提交为基线 B。
> 从 B 到当前状态（含未提交工作区改动），**不得有**当前入口实际加载的前端文件被修改。

若成立，则 token 一定晚于所有前端内容变更，浏览器缓存必然失效、刷新。

### 3.1 作用域（与 bump 工具对齐）

| 集合 | 内容 |
|---|---|
| 入口文件 | `index.html`、`scripts/app.js` |
| 已加载模块 | `scripts/modules/*.js` **排除** `scripts/modules/realtime.js`（`FROZEN_FRONTEND_MODULE_FILES`，M-94 后冻结未接入） |

作用域必须与 bump 工具的 `fixedFiles` + `listModuleFiles()` 取交集语义一致，否则会产生误报（要求 bump 一个工具根本不会改的文件）或漏报。

> 注：bump 工具的 `fixedFiles` 还含 `AGENTS.md`、`README.md`、`docs/OPERATIONS.md` 等文档。这些只承载 token 的**记录**，不承载运行时内容，因此**不进入本检查器作用域**——改文档不应要求 bump。

### 3.2 基线定位算法

不能用 `git log -S`。本仓库实测反例：

- `git log -S"editorial-history-1"` 首选返回 `9e81019c`（当前提交），因为该提交在替换字符串的同时也**移除了**它。
- `git log -S"oil-news-quota-status-1"` 只返回 `9e81019c`。

正确做法：遍历改动过 `scripts/app.js` 的提交，对每个提交与其**自身父提交**比较 `APP_VERSION` 常量值，首个不同的提交即基线。

```js
// 概念实现；实测通过，见 §5
function findBumpCommit(git, appJsPath) {
  for (const rev of git('log', '--format=%H', '--', appJsPath).split('\n').filter(Boolean)) {
    let parent;
    try { parent = git('rev-parse', `${rev}^`); }
    catch { return rev; }                       // 根提交
    if (readVersionAt(git, rev, appJsPath) !== readVersionAt(git, parent, appJsPath)) return rev;
  }
  throw new Error('no APP_VERSION change found in history');
}
```

### 3.3 两个信号

| 信号 | 判定 | 说明 |
|---|---|---|
| A · 已提交 | `git diff --name-only <B>..HEAD -- <作用域>` 非空 | 基线之后有前端提交 |
| B · 未提交 | `git status --porcelain -- <作用域>` 非空 | 工作区脏改动 |

**信号 B 不可省略。** 开发者通常先改代码再跑检查，若只看已提交差异，最需要警告的时点恰好漏检。

> 实现注意：porcelain v1 格式为 `XY <path>`，其中 X 可为空格。必须用 `line.slice(2).trimStart()`，`slice(3)` 会吃掉路径首字符（原型实测得到 `cripts/modules/health.js`）。

### 3.4 补充的不变量（可选，独立于新鲜度）

可另加一条纯离线、无需 git 历史的断言：`index.html` 入口与 `app.js` 中各模块 import 的 `?v=` token 必须等于 `APP_VERSION`。

它检查的是**一致性**，与 §3.3 的**新鲜度**互补：前者防止 token 漂移，后者防止内容变更未被 stamp。两者都不覆盖对方。建议分开报告，便于定位。

## 4. 边界与排除项

| 情形 | 期望行为 | 理由 |
|---|---|---|
| 只改 `scripts/modules/realtime.js` | **不报** | 冻结模块不在 bump 作用域，其旧 token 由 `check:realtime-js-frozen` 守住 |
| 只改文档 / `data/*.json` / workflow | **不报** | `DATA_CONTRACT.md` 明文规定不需要 bump |
| 只改 `scripts/check-*.mjs` | **不报** | 非前端入口 |
| 基线提交本身 | **通过** | 基线定义为 token 变更提交，其自身提交内前端改动与该 token 同批 |
| 无 git 历史（shallow clone） | **跳过并说明**，不报失败 | 见 §6 局限 |
| 合并提交 / `main` 上的 merge | 按第一父链基线判定 | 与 `check-suite-wiring` 的展开语义一致 |

## 5. 实测验证证据

原型实现（临时脚本，验证后已删除）在真实仓库与真实历史上运行结果：

| 场景 | 基线 | 结果 | 期望 | 通过 |
|---|---|---|---|---|
| 当前干净 HEAD `9e81019c` | `9e81019c` | OK | OK | ✅ |
| 未提交改动 `scripts/modules/health.js` | `9e81019c` | STALE：`health.js` | 报出 | ✅ |
| 未提交改动冻结的 `realtime.js` | `9e81019c` | OK | 不报 | ✅ |
| 只改 `docs/OPERATIONS.md` | `9e81019c` | OK | 不报 | ✅ |
| **缺陷提交 `f88b2c6c`** | `89656263` | **STALE：`renderOilDirectional.js`** | **报出** | ✅ |
| 修复提交 `9e81019c` | `9e81019c` | OK | OK | ✅ |

关键在于最后两行：检查器**在缺陷提交上报出、在修复提交上通过**。这是它存在的唯一理由，已用真实历史（含临时 worktree 检出）验证。

## 6. 局限与诚实边界

1. **只验证 token 发生变化，不验证语义。** 该检查器无法判断新版本名是否有意义（例如把 `a-1` 改成 `a-2` 即通过）。它只保证"变了"，而"变了"正是缓存失效的充分条件。语义质量仍需人工/评审保证。
2. **依赖 git 历史。** 需非 shallow checkout。部署 workflow 已用 `fetch-depth: 0`，满足；但若在 shallow 环境运行必须跳过而非误报。
3. **性能。** 基线定位需遍历改动过 `app.js` 的提交，每次执行 `git show`。本仓库该提交数为数十量级，可接受；若未来显著增长，可改为在专用文件（如 `config/frontend-asset-version.json`）中记录当前 token 与其引入提交，O(1) 读取。
4. **不替代部署验收。** 通过本检查器不等于线上已更新；`OPERATIONS.md` 的线上版本核对（比较已加载 `app.js?v=…` token）仍须执行。
5. **不能自动修复。** 检查器只报告，不代为选择新版本名——版本名应由提交者按其改动语义命名。

## 7. 建议的落地形态（分两阶段）

按 `AGENTS.md` §10 与 ADR-0037 的既有模式，**先观测、后强制**：

### 阶段 1（推荐先做）：只读审阅器

- 新增 `scripts/review-frontend-asset-version.mjs` 与 `npm run review:frontend-asset-version`
- 只打印基线、作用域内改动文件与结论；**始终 exit 0**
- 不进入 `check:all`，无网络、无文件写入
- 目的：让规则日常可见，建立"改动前端即想起 bump"的习惯

### 阶段 2（独立提案，需单独评审）：强制项

仅当阶段 1 稳定、且确认无误报后，再提案进入 `check:all`。此时必须单独评审，因为它会**改变合并流程**——每次前端改动都会被拦下，且新增 fail-closed 断言属 §10 所指的 checker 断言变更。

## 8. 待决问题

1. 是否同时实现 §3.4 的 token 一致性断言，还是先只做新鲜度检查？
2. （已核实，建议**采用保守全集**）作用域是否应从"全部 `scripts/modules/*.js` 去冻结"改为"从 `app.js` 实际 import 图可达的模块"？

   实测结论——**建议维持保守全集**，不走 import 图：

   - 从 `app.js` 出发的可达集为 10 个模块：`buildCrossValidationMatrix`、`config`、`format`、`macroOverviewDisplayHelpers`、`macroOverviewNarrative`、`renderMacroOverview`、`renderMacroRiskEditorial`、`renderMacroTrend`、`renderOilDirectional`、`snapshotFreshness`。
   - 6 个不可达模块为 `decision.js`、`displayStatusThresholds.js`、`displayTextBuilders.js`、`freshness.js`、`health.js`、`realtime.js`。其中 `realtime.js` 已冻结；`decision.js` / `health.js` / `freshness.js` / `displayTextBuilders.js` 的引用方是冻结的 `realtime.js` 与各 checker，**均不在线上服务路径**；`displayStatusThresholds.js` 无任何引用方。
   - 但 bump 工具会重写这些模块内的 `?v=` token（实测 `config.js`、`decision.js`、`displayTextBuilders.js`、`freshness.js`、`health.js` 均报 `changed`）。因此以工具作用域为准可避免检查器与工具口径不一致。
   - **实现警示**：若将来改用 import 图，静态正则会漏掉多行 import 语句。本仓库 `renderMacroOverview.js` 的 `config.js` 与 `macroOverviewDisplayHelpers.js` 即为跨行 `import { … } from '…'` 形式，按行匹配会漏判。另需注意 `renderOilDirectional.js` 当前**没有任何 import**（自包含大文件），因此其内部 token 变化不影响可达性判定。

3. 阶段 1 的输出是否需要在 PR 上可见（例如接入 `check-all-pr.yml` 的 Summary）？

## 关联文档

- `AGENTS.md` §1（asset bump 规则）· `docs/DATA_CONTRACT.md` §Frontend asset cache version
- `scripts/bump-frontend-asset-version.mjs` · `docs/OPERATIONS.md`（线上版本核对步骤）
- [2026-09-18 项目健康度审计](HEALTH_AUDIT_2026_09_18.md)
