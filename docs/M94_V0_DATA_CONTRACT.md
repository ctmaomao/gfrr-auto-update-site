# M-94 V0 — Data Consumption Contract v2.5

> **Status**: V0 Draft v2.5 (PR 2a 阶段 4 发现 cache version bump 是 13+ 文件同步,契约把项目惯例 bump helper 正式纳入)
> **PR 路径**: PR 1 ✅ merged · PR 2a = Thematic Cards 填充(本次扩范围) · PR 2b = 8 Runtime Block 视觉重写
> **Scope**: 前端展示 only · 不动 scoring / decision / execution / position / Worker / data pipeline / JSON 生产结构
> **Approach**: Path C 结构(保留 14 项 IA + 新增 1 项 `#macro-thematic-cards`) + Path B 卡片密度
> **Visual Reference**: `manual-artifacts/m94-v0/m94-v0-FINAL-mock.html` 是本契约的视觉权威基准
> **Date**: 2026-05-25

---

## v2.4 → v2.5 关键变更(给读过 v2.4 的人快速过)

PR 2a 进入阶段 4(`scripts/app.js` import + cache version bump)期间,Codex 严格按契约 v2.4 §9.7 边界验收 + §2.6.1 铁律 1 + §4.3 铁律 3 执行,**第三次在动文件前停下报告**。这次发现的不是契约假设错误,而是契约范围错误 — cache version bump 在项目里是 **13+ 文件同步动作**,远超 v2.4 §9.7 列的 8 文件。

### 错误 — Cache version bump 是 13+ 文件同步,不是手动逐个改

**契约 v2.4 假设**(§4.2a 修改 index.html / scripts/app.js 行):
- 在 `scripts/app.js` 内手动改 `__GFRR_FRONTEND_VERSION__` + 所有 `?v=28.0M-93AV → 28.0M-94`
- 在 `index.html` 内手动 bump 2 处 cache version
- 通过手动同步保证 8 文件清单完整

**真实代码状态**(`scripts/bump-frontend-asset-version.mjs` 与 `scripts/check-workflows.mjs:263+`):
- 项目设有官方 helper:`npm run bump:frontend-asset-version <new-version>`
- 该 helper 一次性同步以下 **8 个固定文件 + 全部 `scripts/modules/*.js`**:
  ```
  index.html
  scripts/app.js
  scripts/check-workflows.mjs         ← 内部硬编码 frontendAssetVersion = '28.0M-93AV'
  README.md
  AGENTS.md
  docs/OPERATIONS.md
  docs/DATA_CONTRACT.md
  workers/gfrr-realtime-worker/README.md
  + scripts/modules/*.js (新加的 renderThematicCards.js / displayStatusThresholds.js 也会包括)
  ```
- `scripts/check-workflows.mjs` 同时是 enforcement(line 第 263 行硬编码 `frontendAssetVersion = '28.0M-93AV'`)和需要同步的文件
- 它会扫描 index.html / app.js / scripts/modules/*.js 的所有 `?v=` 字面量,要求与 `frontendAssetVersion` 常量一致

**根因**:Claude 写契约 v2.1-v2.4 时没读 `bump-frontend-asset-version.mjs` 源码,完全错过这条项目惯例,把 cache bump 误以为是"手动 grep 替换"动作。

**v2.5 修复**:
1. §4.2a 加新条目 §4.2a.1 "**cache version bump 用项目惯例 helper,不要手动改**":Codex 在阶段 4 必须跑 `npm run bump:frontend-asset-version 28.0M-94`,**让 helper 同步全部 8 固定文件 + 全部 modules**
2. §9.7 边界验收 8 文件 → 17 文件清单(原 8 文件 + 5 文档 + 3 个被 bump helper 间接改的文件,实际数量看 helper 输出)
3. §0.3 加新硬约束:**禁止手动编辑 cache version 字面量**,必须用 bump helper
4. §11 文档历史加 v2.5 行

### 同步连带改动

- §0.3 不做范围:`scripts/check-workflows.mjs` 整体仍不许改,但 **bump:frontend-asset-version helper 对其的精确同步行为是允许的例外**(只动 `frontendAssetVersion` 常量值,不动其他)
- §4.3 阶段 4 实施顺序细化:bump helper 跑完后必须立即 `npm run check:all` 验证全部文件同步成功

**改动范围统计**:契约改 4 处。0 字段层面改动,0 视觉规范改动。

**好消息**:这次 PR 2a 已经做了 3 个新文件(displayStatusThresholds.js / check-thematic-cards-contract.mjs / renderThematicCards.js 骨架)+ buildCrossValidationMatrix.js 一行 export + scripts/app.js 部分改动,但因为 check:all 没绿,**这些改动还在 working tree,尚未 commit**。Codex 可以:
1. 把 scripts/app.js / index.html 的手动 cache bump 改动撤销(`git checkout -- scripts/app.js index.html`)
2. 重新做阶段 4:加 import + 加 main() call(不动 cache),然后跑 `npm run bump:frontend-asset-version 28.0M-94`
3. helper 会自动同步所有 13+ 文件

---

## v2.3 → v2.4 关键变更(给读过 v2.3 的人快速过)

PR 2a 启动阶段 1 基线检查期间,Codex 按契约 §4.3 铁律 3 + §2.6.1 铁律 1 严格执行,发现 **2 个契约 v2.3 假设错误**,在动文件前停下报告。Claude 直读源码确认 100% 是契约问题,不是 Codex 误判。

### 错误 1 — `classifyZScoreBucket` 没被 export

**契约 v2.3 假设**(§3.7 NDX 卡 + §9.7 PR 2a 验收):
```js
import { classifyZScoreBucket } from './buildCrossValidationMatrix.js';
```

**真实代码状态**(`scripts/modules/buildCrossValidationMatrix.js` line 67 + line 末尾):
- `classifyZScoreBucket` 在 line 67 定义,但**只是模块内私有函数**
- 文件末尾只 `export { ASSESSMENT_LABELS }` + `export function buildCrossValidationMatrix`
- 上述 import 会 fail

**根因**:Codex 第三轮审核(v2.1 期间)给出"复用建议",我当时没核实 export 状态,契约 v2.1 / v2.2 / v2.3 全部沿袭这个错误假设。

**v2.4 修复**:在 §4.2a 修改文件清单中**显式打开**对 `scripts/modules/buildCrossValidationMatrix.js` 的 1 行精确改动 — 在文件末尾追加 `export { classifyZScoreBucket };` (或合并到 line `export { ASSESSMENT_LABELS };`)。其他全文不动。

### 错误 2 — Render 主流程在 `scripts/app.js` 不在 `scripts/modules/render.js`

**契约 v2.3 假设**(§4.2a 修改文件清单):
> `scripts/modules/render.js` — 在主渲染流程加入 `renderThematicCards(data, root)` 调用

**真实代码状态**(`scripts/app.js` line 88-104):
- `scripts/app.js` 的 `main()` 函数才是 render orchestrator
- `app.js` line 7 显式 `import { renderMacroRiskOverview } from './modules/renderMacroOverview.js'`
- `app.js` line 88-95 直接 call `renderPlainSummary / renderMacroRiskOverview / renderDailyBrief` 等
- `scripts/modules/render.js` 只 export helper render 函数(`renderRealtimeStrip / renderHealthDashboard` 等),**不是主入口**
- 契约 v2.3 让 Codex 改 render.js 加 `renderThematicCards` 调用,会被挂错位置(没人调它)

**根因**:Claude 写契约 v2.3 时凭模块名假设,没读 `app.js` 实际结构。

**v2.4 修复**:在 §4.2a 修改文件清单中把 `scripts/modules/render.js` 替换为 `scripts/app.js`,并明确改动内容:
- line 1-9 import 区追加 `import { renderThematicCards } from './modules/renderThematicCards.js?v=28.0M-94'`
- line 88-104 main() 渲染序列追加 `renderThematicCards(data, ...)` 调用(具体位置看 marketPricingMetricsPromise 后)
- cache version 同步 bump

### 同步连带改动

- §9.7 PR 2a 边界验收清单:7 文件 → 8 文件(加 `scripts/modules/buildCrossValidationMatrix.js` 仅 1 行)+ `scripts/modules/render.js` 替换为 `scripts/app.js`
- §0.3 不做范围:`scripts/modules/buildCrossValidationMatrix.js` 严格"不动"约束放宽为"只允许追加 export 一行,严禁改其他任何行"
- §11 文档历史加 v2.4 行

**改动范围统计**:契约改 5 处。0 字段层面改动,0 视觉规范改动,0 工作流改动。

**好消息**:这是 PR 2a 阶段 1(基线检查)就发现的问题,**还没有任何文件改动**,工作区干净。修契约 → push v2.4 → 重启 PR 2a 阶段 1,影响极小。

---

## v2.2 → v2.3 关键变更(给读过 v2.2 的人快速过)

v2.2 → v2.3 不动数据契约 / 字段映射 / 8 主题 / 38 卡 / 视觉规范。变更只在**方法论**与**PR 拆分**两个维度。

### 1. PR 1 实施期间的方法论教训(全部归档进契约)

PR 1 实际执行用了 4 轮 Codex 迭代才收敛(理论上应 1 轮)。**4 轮全部被"停 → 报告 → 授权 → 继续"工作流接住**,没有产生坏 commit,但暴露契约 4 个真实缺陷:

| 缺陷 | v2.3 修复位置 |
|---|---|
| 1. §2.6 字面量同步表只列 2 个 IA-enforcement checker,漏第 3 个(`check-mobile-first-fold-compaction.mjs`) | §2.6 表格增加第 7-8 行,把 `check-mobile-first-fold-compaction.mjs` 正式纳入;§2.6.1 新增"未来 milestone 加 IA 项时必须先 grep 全部 99 个 checker"方法论铁律 |
| 2. PR 1 让 mock 入库的 `.gitignore` 改动撞坏 `check-market-pricing-network-open-throttled-scaffold.mjs` 的 regex `(^|\r?\n)manual-artifacts\/?(\r?\n|$)`(此 checker 强制 `.gitignore` 必须有 `manual-artifacts/` 单独一行) | §0.3 不做范围加一行 ".gitignore 内 `manual-artifacts/` 必须保持单独一行(满足 `check-market-pricing-network-open-throttled-scaffold.mjs` regex),让 mock / 后续 manual artifact 入库时用 `!` 例外子目录而不是改 `manual-artifacts/*` 写法" |
| 3. 契约 v2.1 让 PR 1 改 IA checker 但不改 index.html,导致 `check:all` 必挂(先有鸡先有蛋陷阱) | v2.2 已通过 §2.7 + §4.1 PR 1 范围扩大解决;v2.3 在新增的 §2.8 把"任何 enforcement 改动必须与对应 implementation 同 PR 落地"提升为铁律 |
| 4. PR 拆分粒度不够细 — v2.2 的 PR 2 把"thematic cards 填充"与"8 runtime block 视觉重写"绑在一起,工作量预估约 800-1500 行,出错概率高 | §4.2 拆分为 §4.2a(PR 2a Thematic Cards Fill)+ §4.2b(PR 2b Runtime Block Rewrite);§9 验收清单同步拆 §9.7(PR 2a)+ §9.1-§9.5(沿用为 PR 2b) |

### 2. 新增 2 条方法论铁律(§4.3 — 给 PR 2a / PR 2b / 未来所有 milestone)

**铁律 1 — 实施前预飞 grep**:Codex 开始动文件前,必须自己 grep 一轮 `scripts/check-*.mjs` 找全所有锁了关键字面量的 checker,不能凭契约清单做假设。命令:`Select-String -Path "scripts\check-*.mjs" -Pattern "<关键词>"`。

**铁律 2 — 大改动分阶段验证**:任何超过 200 行改动的 PR,Codex 必须按"改 1 个 build 函数或 1 个新文件 → 立即跑 `npm run check:all` → 不绿就停 → 绿就继续下一个"的循环,不要一次性改完所有再跑。

### 3. PR 2a 与 PR 2b 拆分边界(详见 §4.2a + §4.2b)

| PR | 范围 | 量级 | 视觉效果 |
|---|---|---|---|
| **PR 2a** Thematic Cards Fill | 新建 `renderThematicCards.js` + `displayStatusThresholds.js` + `check-thematic-cards-contract.mjs` + styles.css 加主题卡 selector + index.html 引入 module + `render.js` 调用 + cache bump | ~600-1000 行 | 首页空 section 填充 8 主题块 + 38 张指标卡。8 个 runtime block 视觉**不变**(仍旧风格) |
| **PR 2b** Runtime Block Rewrite | 改写 `renderMacroOverview.js` 8 个 build 函数 HTML 外壳(`buildMacroDrivers` 616 行是重点)+ styles.css 补充更多 selector + index.html `<head><style>` token 化 | ~600-1500 行 | 8 个 runtime block 升级为 Bubble Watch 风格;styles.css 不动旧 `--editorial-*` |

**关键好处**:
- PR 2a 合上去后,主题卡阵立即可见,网站 M-94 完成度达到 ~70%,Robert 即获视觉反馈
- PR 2a 跑通证明 thematic cards 框架对,再去 PR 2b 改 runtime block 风险更可控
- 即使 PR 2b 撞墙,PR 2a 成果已经在 main 上
- 风格短暂不一致(几天到一周内主页一半新风格一半旧风格)是可接受的——M-93A0 当年也是这样

**改动范围统计**:契约改 11 处,主要在顶部 metadata / §0.3 / §2.6 / §2.6.1 / §2.8 / §4.2a / §4.2b / §4.3 / §9.7 / §10 / §11。0 字段层面改动。

---

## v2.1 → v2.2 关键变更(给读过 v2.1 的人快速过)

v2.1 的 PR 1 范围设计有"先有鸡还是先有蛋"陷阱:

- v2.1 让 PR 1 改两个 IA checker 到 15 项,但 `index.html` 仍是 14 项 nav + 没有 `#macro-thematic-cards` section
- 结果:`npm run check:all` 必挂(checker 强制要求 15 项但 index 没有)
- 必须把 enforcement 和 implementation 同步,不能拆

**v2.2 修正方案**(Codex 第四轮提交时发现并报告,Robert 选项 A):

PR 1 范围**扩到包含 `index.html` 的 nav + 空 section 容器骨架**,但仍**不引入 render logic**。具体:
- PR 1 改 `index.html`:nav 加第 9 项 + 加空 `<section id="macro-thematic-cards">` 容器(类似 M-93A0 中 `#plain-summary-card` 先到位、`renderPlainSummary.js` 后填充的模式)
- PR 1 **不动**:`scripts/modules/render*.js` 任何文件、`assets/styles.css`、`data/*`、`workers/*`
- PR 2 才填:`scripts/modules/renderThematicCards.js` + `renderMacroOverview.js` 视觉重写 + styles.css 补充 + `scripts/modules/render.js` 调用

这个拆分和 M-93A0 当年的处理一致:**IA + 容器骨架先到位,内容渲染随后**。

**改动范围**:契约改 8 处,主要在 §0.1 / §0.3 / §2.1 / §4.1 / §4.2 / §9。0 字段层面改动,0 视觉规范改动。

---

## 与 v2 相比的关键变更(给读过 v2 的人快速过)

v2 是 Codex 第三轮审核后的字段精校版。Codex 6 段审核结论 100% 消化。

**5 个硬错误已修正**:
1. `data.modules.geopolitical` 是扁平数字,不是 `.score` 子字段
2. NDX vs SPX 30 日相对强弱无现成数据,改为 NDX 60w z-score(决策 C)
3. `privateCreditProxy` 6-proxy z-score 数据不足,降级为 8 字段直显(决策 B)
4. `warningSystem + triggerPanel` 不是 MacroOverview 观察清单数据源,删除"合并复用"措辞
5. checker 字面量同步遗漏:5 处"14 项"硬编码必须改"15 项"

**3 处决策落地**:
- A — 信用类加 CRE 第 5 卡(`macroDrivers.commercialRealEstate.*`)
- C — 市场情绪 NDX 卡改为 60w z-score(复用 `classifyZScoreBucket`)
- B — Private Credit 降级 + note 预留"M-96+ 接 6-proxy z-score"

**9 处字段补充**:Brent 5 字段 / Fed Liquidity 3 字段 / Fed Path 7 字段 / Employment 3 字段 / Consumer 4 字段 / NFCI 3 字段 / 等

**6 个 §6 TODO 全部由 Codex 给出确凿答案**(NFCI 路径 / modules 结构 / preface 位置 / NDX 派生路径 / 6-proxy z-score 不存在 / contractVersion 不进 UI)。

**1 处工作量警告**:`buildPressureSources` + `buildMacroDrivers` 共 776 行,§8 实施指引措辞要从"简化"改成"保留所有字段消费,仅改外壳"。

**Visual Reference 锁定**:Robert 已对 `m94-v0-FINAL-mock.html` 完成视觉确认。任何与该 mock 不一致的实施都视为契约违反。

---

## 文档读者

本文档面向 4 类执行者:

1. **Codex / Cursor / AI 实施者** — 看 §4 / §6 / §7 知道改哪些文件
2. **Robert(项目运营者)** — 看 §0 / §1 / §2 知道 M-94 做什么
3. **审核 PR 的人** — 看 §9 知道怎么验收
4. **未来想扩展数据接入的 milestone** — 看 §3 / §5 知道占位接口在哪

---

## §0 M-94 任务定义(锁死,不再讨论)

### §0.1 目标一句话

**让 index.html 首页渲染遵守已有 DESIGN.md,把 renderMacroOverview.js 的输出从工程术语堆积改成 Bubble Watch 报纸节奏,并新增一个"宏观主题卡阵"section 提供按读者类别组织的入口。**

**PR 拆分**:M-94 用 3 个 PR 实施(v2.3 把 PR 2 进一步拆为 PR 2a + PR 2b,降低单 PR 出错概率):

- **PR 1** ✅ merged:契约文档 + DESIGN.md + 3 个 IA checker + `index.html` nav 第 15 项 + 空 `#macro-thematic-cards` section 容器骨架。零 render logic 改动。
- **PR 2a**:`scripts/modules/renderThematicCards.js` 新建 + `scripts/modules/displayStatusThresholds.js` 新建 + `scripts/check-thematic-cards-contract.mjs` 新建 + `assets/styles.css` 加主题卡 selector + `index.html` 引入 module + `scripts/modules/render.js` 调用 + cache version bump。**不动 `renderMacroOverview.js`**。
- **PR 2b**:`scripts/modules/renderMacroOverview.js` 视觉重写 8 个 build 函数 + `assets/styles.css` 补充 runtime block selector + `index.html` `<head><style>` token 化。**不动 thematic cards 已合入的部分**。

### §0.2 路径选择(已锁)

采用 **Path C**:
- 保留 DESIGN.md §4.1 现有 14 项 IA + 8 个 runtime block 的金融逻辑骨架
- 在 `#macro-risk-overview` 与 `#global-risk-heatmap` 之间**新增 1 个 top-level section** `#macro-thematic-cards`
- IA 从 14 项扩为 15 项(jump nav 多 1 个锚点)
- 视觉层全面 Bubble Watch 风格化(纸张色 / 三栈字体 / 报纸节奏)

### §0.3 不做范围(项目宪法硬约束)

| 禁止 | 来源 |
|---|---|
| 改 scoring / decision / execution / position 逻辑 | DESIGN.md §8.4 #1 |
| 改 `data/radar-data.json` 或任何 data 生产结构 | DESIGN.md §8.4 #2 |
| 启用 Market Pricing Temperature 进入主评分 | DESIGN.md §8.4 #3 |
| 加 live fetch / production write | DESIGN.md §8.4 #4 |
| 改 `.github/workflows/*` | DESIGN.md §8.4 #5 |
| 改 Worker / pipeline / heartbeat | 项目宪法 |
| 加生产 npm 依赖 | 项目宪法 0 deps |
| 把 External AI 接入评分 | 项目宪法第 4 条 |
| 把 World Order 接入评分 | 项目宪法第 3 条 |
| 清理商业付费数据 docs(独立 M-XX) | Codex 审核第五节 |
| 接入未来数据源(P1+ 独立 milestone) | M-94 仅做架构槽位 |
| **改 `.gitignore` 内 `manual-artifacts/` 字面量写法**(v2.3 新增) | `scripts/check-market-pricing-network-open-throttled-scaffold.mjs:assertManualArtifactsIgnored()` 的 regex `(^|\r?\n)manual-artifacts\/?(\r?\n|$)` 强制要求 `manual-artifacts/` 必须**单独成行**,前后必须是换行/文件边界。让 mock / 后续 manual artifact 入库时**必须**用 `!manual-artifacts/<sub>/` 例外子目录,**禁止**改成 `manual-artifacts/*` 写法 |
| **改 `scripts/modules/buildCrossValidationMatrix.js` 任何函数 / 任何算法**(v2.4 放宽) | 项目核心一致性矩阵算法,不动。**唯一例外**:PR 2a 允许在文件末尾追加 `export { classifyZScoreBucket };`(把已有的内部函数升级为 module export),以让 `renderThematicCards.js` 能 import 复用。这是契约 v2.3 假设但实际未落地的 export。其他任何函数体 / 命名 / 顺序 / 注释 / import 一律不动 |
| **手动编辑任何 cache version 字面量**(v2.5 新增) | 项目设有官方 helper `npm run bump:frontend-asset-version <new-version>`(源码:`scripts/bump-frontend-asset-version.mjs`),它会一次性同步 8 固定文件(`index.html / scripts/app.js / scripts/check-workflows.mjs / README.md / AGENTS.md / docs/OPERATIONS.md / docs/DATA_CONTRACT.md / workers/gfrr-realtime-worker/README.md`)+ 全部 `scripts/modules/*.js`。**禁止**手动 grep 替换 `?v=` 字面量或 `frontendAssetVersion` / `__GFRR_FRONTEND_VERSION__` 常量。**禁止**手动改 `scripts/check-workflows.mjs` 任何代码,**唯一例外**是 bump helper 同步它的 `frontendAssetVersion` 常量值 |

### §0.4 取舍方向回顾

Codex 第二轮审核 5 节处理结论:

| 节 | 决定 |
|---|---|
| §1 字段错误(7 项) | 100% 接受,本契约 §1 全部修正 |
| §2 24 派生模块识别 | 大部分接受 + MacroRiskOverview "逻辑内核留组织结构换" |
| §3 DESIGN/checker 冲突 | 基本反驳 + 接受字体 CDN |
| §4 mock 硬错误(4 项) | 100% 接受 |
| §5 商业付费清理 | 完全接受,移出 M-94 |
| §6 Codex 第三轮审核(v2.1 新增) | 100% 接受 5 硬错误 + 17 处修正,本契约相应章节已更新 |

---

## §1 字段消费基准表(基于真实 radar-data.json schema)

> 上一版契约 60% 字段名是错的。本节字段来自 2026-05-23T23:29:22Z 时刻 `data/radar-data.json` 的实际 schema(via 直接读取项目文件)。

### §1.1 渲染数据**主**来源:`__effectiveDisplayInputs`(注:不是唯一)

**真实运行时**:`scripts/modules/realtime.js` 的 `buildEffectiveDisplayInputs()` 函数派生出 `data.__effectiveDisplayInputs`,作为前端"指标即时值"的**主**消费入口。

**重要事实**(Codex 第三轮审核确认):
1. **raw `data/radar-data.json` 不直接包含 `__effectiveDisplayInputs` 字段**,它仅在 runtime 由 `realtime.js` 派生
2. 当前 `renderMacroOverview.js` 实际**仍大量消费 `data.displayInputsBaseline.*`** 作为 fallback 路径,M-94 不会全部改完
3. M-94 主题卡阵新代码**必须优先**使用 `data.__effectiveDisplayInputs.*`,但允许在 runtime 字段缺失时回落 `data.displayInputsBaseline.*`
4. M-94 **不重写** `realtime.js` / `buildEffectiveDisplayInputs()` 函数

**派生规则**(简化版,详情见 realtime.js):
- baseline = `data.displayInputsBaseline.{brent, dxy, vix, hyOas, us10y, real10y, breakeven10y, gold, spx}`(9 个字段,**真实存在**)
- 如果 Worker preview / secondary preview 可用,覆盖 baseline
- 如果 Worker 失败,回落 baseline
- 输出 `data.__effectiveDisplayInputs.{brent, dxy, vix, hyOas, us10y, real10y, breakeven10y, gold, spx}`

**禁止用法**(契约 v1 错误):
- ❌ `data.values.brent` — 不存在
- ❌ `data.values.*` — 不存在
- ❌ `data.brent` 直接 — 不存在

**正确用法**:
```js
const brent = data.__effectiveDisplayInputs?.brent ?? data.displayInputsBaseline?.brent;
```

### §1.2 dailyBrief 真实字段(替换契约 v1 全部虚构字段)

**真实字段树**(12 keys):

```js
data.dailyBrief = {
  contractVersion,            // 例如 "v28.0I-1"
  generatedAt,                // ISO datetime
  macroState,                 // "滞胀冲击 / 通胀冲击"(原项目语言)
  oneLineConclusion,          // "今日主线是能源 → 通胀 → 利率压力..."
  dominantRiskChain: {
    key,                      // 例如 "energy_inflation_rates"
    labelZh,                  // 例如 "能源 → 通胀 → 利率压力"
    stageZh,                  // 例如 "能源与通胀向利率端传导"
    summaryZh,                // 长解释
    evidence: [               // 3 个 item
      {
        source,               // 例如 "displayInputsBaseline"
        key,                  // 例如 "brent"
        labelZh,              // 例如 "布伦特"
        value,                // 实际数值
        summaryZh,            // 一句话
      },
      ...
    ]
  },
  largestDivergence: {        // 结构同上
    key, labelZh, statusZh, summaryZh, evidence
  },
  keyTriggers: [5 strings],   // 触发清单(替代虚构的 watchItems)
  invalidationSignals: [5 strings],  // 反证清单
  dataGaps: [3 strings],      // 数据缺口
  confidence: { level, score, reasonZh },
  boundaries: { displayOnly, affectsScoring, affectsDecisionModel,
                affectsExecutionLock, affectsPositionGuidance },
  evidence: [4 items]
}
```

**契约 v1 字段错误对照表**:

| v1 错(不存在) | v2 正(真实) |
|---|---|
| `dailyBrief.headline` | `dailyBrief.dominantRiskChain.labelZh` |
| `dailyBrief.summary` | `dailyBrief.oneLineConclusion` 或 `dominantRiskChain.summaryZh` |
| `dailyBrief.dominantChain` | `dailyBrief.dominantRiskChain` |
| `dailyBrief.dataHealth` | `data.dailyRealtimeInput.healthScore` |
| `dailyBrief.weeklyChange` | `data.scoreChange7d` |
| `dailyBrief.watchItems` | `dailyBrief.keyTriggers` + `dailyBrief.invalidationSignals` |

### §1.3 macroDrivers 真实字段(13 子模块,确认存在)

**真实子模块清单**(`data.macroDrivers.*`):

```text
fedLiquidity / policyExpectations / curve / credit /
consumer / shippingFreight / employment / consumerRetail /
commercialRealEstate / privateCreditProxy / activeSignals /
gatingEvaluation / allSourcesMissing
```

**关键字段名校正**(来自 Codex §1 + 第三轮审核):

| 子模块 | v1 错 | v2.1 正 |
|---|---|---|
| `credit` | `iggOas` | `igOas` |
| `credit.nfci` | 未识别 | **真实存在**,完整:`nfci / nfci4wChange / nfciRegime / sourceStatus.nfci` |
| `fedLiquidity` | `wresbal` | `reserveBalances` + `walcl / walcl4wChange / onRrp / onRrpWeekChange / effectiveFedFundsRate / sofr / reserveBalances4wChange / bgcr / tgcr / repoSpreadRegime / sourceStatus` |
| `consumer` | `pmi` | `ismManufacturingPmi`、`ismManufacturingPmi3mChange`、`ismPmiRegime` |
| `modules.geopolitical` (顶层非 macroDrivers) | `data.modules.geopolitical.score` 子字段 | **扁平数字** `data.modules.geopolitical` = 78,趋势在 `data.moduleTrends.geopolitical` |

**fedLiquidity 详细字段**(确认 + Codex 补充):
```text
walcl, walcl4wChange, onRrp, onRrpWeekChange,
effectiveFedFundsRate, sofr, reserveBalances, reserveBalances4wChange,
bgcr, tgcr,                       // ← Codex 补充:回购利率二项
repoSpreadRegime,                  // ← Codex 补充:回购利差状态
sourceStatus                       // ← Codex 补充:源状态(仅 Appendix 显示)
```

**credit 详细字段**(确认 + Codex 补充 NFCI):
```text
igOas, igOas1dChange, igHyRatio, regime,
sloosTighteningLargeFirms, sloosTighteningSmallFirms,
sloosTighteningLargeQoQ, sloosTighteningSmallQoQ,
nfci, nfci4wChange, nfciRegime,    // ← Codex 第三轮确认:这 3 项真实存在
sourceStatus.nfci                  // ← Codex 补充:源状态
```

**consumer 详细字段**(确认):
```text
umichSentiment, previousValue, threeMonthChange, sixMonthChange, regime,
ismManufacturingPmi, ismManufacturingPmi3mChange, ismPmiRegime
```

**employment 详细字段**(Codex 补充):
```text
initialClaims, initialClaims4wAverage, initialClaims4wChange,
continuingClaims, continuingClaims4wAverage,
joltsOpenings, joltsOpeningsYoY, joltsUpdatedAt,
averageHourlyEarningsYoY,          // ← Codex 补充:AHE
u6UnemploymentRate,                // ← Codex 补充:U-6
industryDiffusionPct,              // ← Codex 补充:11 行业扩张占比
industryDiffusionRegime,           // ← Codex 补充
sourceStatus                       // ← Codex 补充
```

**consumerRetail 详细字段**(Codex 补充):
```text
cartsNominal, cartsNominal4wAverage, cartsNominalYoY,
cartsReal, cartsReal4wAverage, cartsRealYoY,
retailSegments, segmentPositiveCount,
segmentDiffusionPct,               // ← Codex 补充:13 类品类正增长占比
strongestSegment, weakestSegment,  // ← Codex 补充
bofaCardSpendingExGasYoY,          // ← Codex 补充:BoA 数据
redbookYoY,                        // ← Codex 补充
sourceStatus                       // ← Codex 补充
```

**commercialRealEstate 详细字段**(M-94 v2.1 决策 A 新增主题卡):
```text
creDelinquencyRate, creDelinquencyRateQoQChange,
creChargeOffRate, creChargeOffRateQoQChange,
sloosCreNonfarmNonresidentialTightening,
sloosCreConstructionTightening,
sloosCreMultifamilyTightening,
sloosCreTighteningMax              // ← 三类紧缩最大值,主题卡阈值判定
```

**policyExpectations 详细字段**(Codex 补充):
```text
targetLower, targetUpper, targetMid, effectiveFedFundsRate, targetUpdatedAt,
fedFundsFutureFrontPrice, fedFundsFutureImpliedRate, futureMinusTargetMid,
zqCurveFrontImpliedRate,           // ← Codex 补充:ZQ 期货曲线
sr3CurveFrontImpliedRate,          // ← Codex 补充:SR3 期货曲线
oisForward12MRate,                 // ← Codex 补充:OIS 12 月远期
sepDotMid2026,                     // ← Codex 补充:SEP 点阵 2026 中位
statementMinutesTone,              // ← Codex 补充:声明 / 会议纪要 tone
sourceStatus                       // ← Codex 补充
```

**privateCreditProxy 详细字段**(确认):
```text
bdcEtfPrice, bdcEtf4wChange, bdcEtfUpdatedAt,
pbdcEtfPrice, pbdcEtf4wChange, pbdcEtfUpdatedAt,
seniorLoanEtfPrice, seniorLoanEtf4wChange,
intervalFundNav, intervalFundNavWoWChange,   // ← Codex 补充:CCLFX NAV
privateCreditProxyRegime,                    // ← Codex 补充
sourceStatus
```

**重要**(Codex 第三轮 Q5 确认):`privateCreditProxy` **没有 12 周历史窗口**。"6-proxy z-score"派生公式**不成立**,主题卡阵中此卡降级为"8 字段直显 + note 预留接口"(决策 B)。

### §1.3.5 顶层 `modules` / `moduleTrends` 字段(Codex 第三轮 Q2 修正)

**真实结构**:6 项**扁平数字**,不是嵌套对象。

```js
data.modules = {
  geopolitical: 78,      // 数字,不是 {score: 78, ...}
  energy:       82,
  inflation:    52,
  liquidity:    48,
  debt:         31,
  banking:      29
}

data.moduleTrends = {
  geopolitical: "↑",     // 或 "→" / "↓"
  energy:       "↑",
  inflation:    "→",
  liquidity:    "↑",
  debt:         "→",
  banking:      "↓"
}
```

**契约 v1/v2 错误**:`data.modules.geopolitical.score` ❌ → 正确路径 `data.modules.geopolitical`(直接数字)+ `data.moduleTrends.geopolitical`(趋势符号)。

### §1.4 divergenceLayer 真实结构

```js
data.divergenceLayer = {
  contractVersion,            // "v28.0I-3A"
  generatedAt,
  score,                      // 0-100 整数
  state,                      // 例如 "stress"
  stateZh,                    // 例如 "背离压力"
  summaryZh,                  // 长解释
  primaryDivergence: {        // 主要背离
    key,                      // 例如 "energy_pricing_gap_watch"
    labelZh,                  // 例如 "能源定价背离观察"
    status,                   // 例如 "stress"
    statusZh,
    summaryZh,
    evidence: [...]
  },
  checks: [5 items],          // 5 类背离 check
  dataGaps: [...],
  confidence: { level, score, reasonZh },
  boundaries: {
    displayOnly: true,
    auditOnly: true,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false
  }
}
```

**checks 内 item 结构**:
```js
{
  key,                        // 例如 "energy_pricing_gap_watch"
  labelZh,                    // 中文标签
  category,                   // 例如 "energy_pricing"
  status,                     // "stress" / "neutral" / "ease"
  score,                      // 0-100
  summaryZh,                  // 长解释
  evidence: [...],            // 引用 displayInputsBaseline / brentValidation
  dataUsed: [...],            // 真实使用字段列表
  limitations: [...]          // 边界说明
}
```

### §1.5 brentPricingLayer 真实结构(24 字段)

主路径展示需要的关键字段:

```js
data.brentPricingLayer = {
  contractVersion, generatedAt,
  mode,                       // "public_proxy_observation"
  summaryZh,
  selectedBrent: { value, source, observedAt, status, noteZh },
  publicSpotProxy: { labelZh, source, value, observedAt, status, limitationZh },
  futuresProxy: { labelZh, source, value, observedAt, status, limitationZh },
  proxySpread: {
    spotMinusFutures,
    selectedMinusFutures,
    maxProxyDivergencePct,
    status, statusZh, interpretationZh
  },
  ulsdPrice,                  // ULSD/heating oil price
  ulsd4wChange,
  crackSpread,                // 真实字段名
  crackSpread4wChange,
  crackSpreadRegime,          // 例如 "供应紧张"
  ulsdSourceStatus,           // "live" / "stale" etc.
  promotionAudit: {
    promotionApplied, moveStatus, promotionReason,
    selectedSource, anchorSource, anchorAgeHours
  },
  confirmationSources: [7 items],
  dataGaps, limitations,
  confidence, boundaries
}
```

**注**:契约 v1 提到的"Brent 主值 / 代理 / 实物紧张度三层证据链",在 schema 中分别对应:
- 主值 → `selectedBrent`
- 公开代理 → `publicSpotProxy` + `futuresProxy` + `proxySpread`
- 实物紧张度 → `crackSpread` + `crackSpreadRegime`(柴油裂解价差)

**Codex 第三轮补充**:M-94 主题卡 Brent 卡的 agg-rows 必须覆盖以下 5 字段(已落地于 FINAL mock C1):
```text
brentPricingLayer.eiaBrentSpotProxy.price            // 公开现货代理 EIA 价格
brentPricingLayer.futuresPriceCurve.frontPrice       // Yahoo BZ 期货 front 价格
brentPricingLayer.iceFuturesPriceCurve.frontPrice    // ICE 期货 front 价格
brentPricingLayer.proxySpread.spotMinusFutures       // 现货 - 期货 差额
brentPricingLayer.proxySpread.maxProxyDivergencePct  // 最大代理偏离百分比
```

此外 ULSD/crack spread 字段(`ulsdPrice / ulsd4wChange / ulsdSourceStatus`)用于 Crack spread 主题卡。

### §1.6 worldOrderStress 真实结构(独立文件 data/world-order-stress.json)

```js
worldOrderStress = {
  version, updatedAt,
  sourceMode,                 // "computed_with_external_sources"
  score,                      // 0-100 整数
  state,                      // 例如 "multi_theater_stress"
  labelZh,                    // 例如 "多战区压力期"
  confidence, freshness,
  marketConfirmationInput: {  // 替代 v1 误写的 worldOrderStress.marketConfirmation
    source, sourceUrl, path, updatedAt, ageMinutes,
    healthScore, criticalMissing, brent
  },
  externalSources: {          // ← Codex 第三轮补充:进 buildWorldOrderNarrative 消费
    gdelt: { ... },           // GDELT 事件数据
    ofac:  { ... },           // OFAC 制裁数据
    sipri: { ... },           // SIPRI 军费数据
    acled: { ... }            // ACLED 冲突数据(weekly 6 + monthly 6,Open license 手动下载)
  },
  dimensions: {               // 真实路径(替代 v1 误写的顶层 marketConfirmation)
    peaceDividendRetreat: { score, labelZh, trend, evidence },
    blocFormation:        { score, labelZh, trend, evidence },
    multiTheaterConflict: { score, labelZh, trend, evidence },
    economicWeaponization:{ score, labelZh, trend, evidence },
    capitalControlRisk:   { score, labelZh, trend, evidence },
    marketConfirmation:   { score, labelZh, state, evidence }    // ← 真实路径
  },
  dominantDrivers: [3 items],
  systemInterpretationZh,
  decisionModifier: {         // ← Codex 第三轮补充:M-94 仅 Appendix 展示
    enabled,
    riskBias,                 // 偏移方向
    maxStateBoost,
    appliesWhen
  },
  warnings: [...]
}
```

**Codex 第三轮重要说明**:`decisionModifier.riskBias` **不进**主题卡,仅在 Appendix `#world-order-stress-section` 章节展示。M-94 主题卡 C8 地缘类只读 `dimensions.*` 子字段。

### §1.7 market-pricing-metrics.json schema(QQQ z-score 真实字段)

```js
{
  contractVersion: "v28.0M-91-multi-asset-metrics-1",
  asset: "qqq",
  windowSize: 60,
  stdDevFormula: "sample",
  primaryAsset: "qqq",
  auxiliaryAssets: ["ndx", "ixic"],
  ma60Range: { min, max },
  stdDev60Range: { min, max },
  zScoreRange: { min, max },  // 例如 [-2.6359, +2.8311]
  assets: {
    qqq: {
      asset: "qqq",
      records: [
        {
          date,                 // ISO date
          close,                // 例如 708.93
          ma60,                 // 60 周均值
          stdDev60,             // 60 周标准差
          zScore                // z-score
        },
        ...
      ]
    },
    ndx: { ... },
    ixic: { ... }
  }
}
```

**QQQ z-score 分桶**(buildCrossValidationMatrix.js 实测):
```js
zScore >= 2  → 'extreme-hot'  → "极度过热"
zScore >= 1  → 'hot'          → "显著偏热"
zScore <= -2 → 'extreme-cold' → "极度偏冷"
zScore <= -1 → 'cold'         → "显著偏冷"
else         → 'neutral'      → "中性区间"
```

(常量定义:`BUCKET_LABELS` in buildCrossValidationMatrix.js)

### §1.8 其他派生层关键字段(来自 Codex 24 模块清单)

| 字段路径 | 用途 | M-94 消费位置 |
|---|---|---|
| `data.liquidityIndex.{score, regime, pillars, structuralSignals}` | 流动性合成指数 | 主路径 macro-drivers 块 + 主题卡阵 流动性类 |
| `data.timeDimension.{trend30d, scoreChange30d, transmissionSpeed}` | 30 日趋势 + 传导速度 | Appendix 详情(不进主路径) |
| `data.transmissionChain.{nodes, layers, decomposition}` | 冲击节点链路 | Appendix 详情 |
| `data.regimeProbabilities.{disinflationaryGrowth, ...}` (6 regime) | 情景概率 | Appendix 详情 |
| `data.heatmap[]` (7 items) | 区域热力图 | `#global-risk-heatmap` |
| `data.assetMatrix[]` (7 items) | 资产偏好矩阵 | Appendix 详情 |
| `data.assetReturnMap.{horizon, rows}` | 收益/回撤映射 | Appendix 详情 |
| `data.scenarioTree[]` (4 items) | 四情景树 | Appendix 详情 |
| `data.warningSystem.{status, alerts, rules, criticalCount}` | 警报系统 | `#execution-risk-detail` 独立展示 — **不进主题卡阵 watch list**(Codex 第三轮硬错误 4 确认) |
| `data.triggerPanel.{critical, drivers, watchlist}` | 触发面板 | `#execution-risk-detail` 独立展示 — **不进主题卡阵 watch list**(同上) |
| `data.aiInterpretationLayer.{facts, dataInferences, modelJudgments, scenarioHypotheses}` | 站内规则化 AI 解读 | Appendix 详情 |
| `data.externalAiInterpretationLayer.{summaryZh, qualityReview.promotionEligible, sourceAttribution, provenance}` | 外部 AI 只读 | `#external-ai-auxiliary` |
| `<各派生层>.contractVersion / generatedAt / sourceCommit` | 元数据 | **仅 Appendix `#detail-data` 章节展示**(Codex 第三轮 Q6 确认) — 主题卡阵 + 主路径 runtime block 一律不显示 |

**核心边界**:全部为 display-only。任何字段的 `boundaries.affectsScoring === false`(已校对)。

**Codex 第三轮硬错误 4 说明**:契约 v2 暗示"watchList 与 warningSystem/triggerPanel 合并复用"是凭空设计,**当前代码 buildWatchList() 不消费 warningSystem 或 triggerPanel**。M-94 **不动 watchList 数据源**,warningSystem/triggerPanel 仍独立位于 `#execution-risk-detail` section。

### §1.9 卡片状态判定(red/yellow/green/orange)

M-94 引入"display-only 状态分级",**不影响 scoring**。判定来自:

**优先级 1**:字段自带的 `regime` 或 `status` 字段
- `macroDrivers.curve.regime` → 直接映射
- `macroDrivers.credit.regime` → 直接映射
- `worldOrderStress.state` = `multi_theater_stress` → orange overlay

**优先级 2**:阈值常量(M-94 新增,集中定义于新文件 `scripts/modules/displayStatusThresholds.js`):
- Brent: `>100` red, `>80` yellow, else green
- HY OAS: `>5%` red, `>3.5%` yellow, else green
- IG OAS: `>1.5%` red, `>1%` yellow, else green
- VIX: `>30` red, `>20` yellow, else green
- NFCI: `>0.5` red, `>0` yellow, else green

**优先级 3**:`unknown` / `missing` → pending(灰色)

**重要**:阈值常量**仅用于卡片着色**,不进入任何 score 计算。新文件 `displayStatusThresholds.js` 必须导出常量数组,不能调用任何 worker / data 改写函数。

### §1.10 dailyRealtimeInput 顶层字段(Codex 第三轮补充)

被 `buildTodayJudgment` 和 `buildKeyChanges` 消费,M-94 Hero 与 WoW 区域必须使用:

```js
data.dailyRealtimeInput = {
  branch,                       // 例如 "main"
  commitSha,                    // git commit
  updatedAt,                    // ISO datetime — 最新更新时间
  sourceMode,                   // worker_first / fallback / etc.
  healthScore,                  // 0-100 数据健康分数(进 plain-summary buildDataHealth)
  capturedAt                    // ISO datetime — 数据捕获时间
}
```

**消费路径**:
- Hero footer "DATA HEALTH" 显示 `${healthScore}/100`
- plain-summary `dataHealth` 翻译表(`renderPlainSummary.js` `buildDataHealth()` 已有逻辑)
- WoW 区域用 `updatedAt` 标识本期周期

---

## §2 IA 变更范围(精确锁死)

### §2.1 IA 从 14 项扩为 15 项

**当前**(DESIGN.md §4.1):

```
1. Hero / Masthead
2. dashboard-jump-nav (14 项)
   [非 nav preface] #plain-summary-card
3. #macro-risk-overview
   ├─ runtime: #homepage-today-judgment
   ├─ runtime: #homepage-pressure-sources
   ├─ runtime: #homepage-signal-layers
   ├─ runtime: #homepage-macro-drivers
   ├─ runtime: #homepage-market-temperature
   ├─ runtime: #homepage-risk-engines
   ├─ runtime: #homepage-cross-validation
   ├─ runtime: #wow-key-changes
   └─ strip:   #homepage-realtime-band
4. #global-risk-heatmap
═ 折叠区 ═
5. #detail-data
6. #world-order-stress-section
7. #method-evidence
8. #external-ai-auxiliary
9. #execution-risk-detail
```

**M-94 后**:

```
1. Hero / Masthead
2. dashboard-jump-nav (15 项)         ← +1
   [非 nav preface] #plain-summary-card  (不变)
3. #macro-risk-overview  (内部 8 runtime block 完整保留,视觉重写)
4. #macro-thematic-cards              ← NEW
5. #global-risk-heatmap
═ 折叠区 ═
6. #detail-data
7. #world-order-stress-section
8. #method-evidence
9. #external-ai-auxiliary
10. #execution-risk-detail
```

### §2.2 jump nav 第 15 项

**新增 nav item**(放在原第 8 `#wow-key-changes` 之后、原第 9 `#global-risk-heatmap` 之前):

```js
['宏观主题卡阵', '#macro-thematic-cards']
```

完整 15 项 nav contract(用于 `check-homepage-ia-contract.mjs` + `check-editorial-redesign-contract.mjs` 同步更新):

```js
const navContract = [
  ['今日总判断',     '#homepage-today-judgment'],
  ['压力来源',       '#homepage-pressure-sources'],
  ['信号分层',       '#homepage-signal-layers'],
  ['四大驱动',       '#homepage-macro-drivers'],
  ['市场温度',       '#homepage-market-temperature'],
  ['风险引擎',       '#homepage-risk-engines'],
  ['交叉验证',       '#homepage-cross-validation'],
  ['本期关键变化',   '#wow-key-changes'],
  ['宏观主题卡阵',   '#macro-thematic-cards'],    // ← NEW
  ['风险热力图',     '#global-risk-heatmap'],
  ['详细数据',       '#detail-data'],
  ['世界秩序',       '#world-order-stress-section'],
  ['方法说明',       '#method-evidence'],
  ['外部 AI',        '#external-ai-auxiliary'],
  ['执行风控',       '#execution-risk-detail'],
];
```

### §2.3 静态 staticRequiredIds 扩展

`check-homepage-ia-contract.mjs` 的 `staticRequiredIds` 数组需要追加 `'macro-thematic-cards'`:

```js
const staticRequiredIds = [
  'homepage-realtime-band',
  'macro-thematic-cards',   // ← NEW
  'global-risk-heatmap',
  'detail-data',
  'world-order-stress-section',
  'method-evidence',
  'external-ai-auxiliary',
  'execution-risk-detail',
];
```

### §2.4 `checkOrdering()` 期望顺序更新

```js
const expectedOrder = [
  ...macroRuntimeIds,           // 8 个 runtime block 不变
  'homepage-realtime-band',
  'macro-thematic-cards',       // ← NEW(在 realtime-band 与 global-risk-heatmap 之间)
  'global-risk-heatmap',
  'detail-data',
  'world-order-stress-section',
  'method-evidence',
  'external-ai-auxiliary',
  'execution-risk-detail',
];
```

### §2.5 `editorial-section` 色带

新 section 色带:`var(--risk-green)`(寓意"信息汇编层",视觉与 macro-risk-overview 的 risk-red 区分)

DESIGN.md §5.1 表格追加:

| Section | 色带 token | 语义 |
|---|---|---|
| `#macro-thematic-cards` | `var(--risk-green)` | 主题汇编,跨分析层的读者类别入口 |

### §2.6 字面量同步清单(v2.3 整合 PR 1 实际 grep 结果 — 共 3 个 IA-enforcement checker)

**v2.3 重要修正**:契约 v2.1 / v2.2 此表只列 2 个 IA-enforcement checker,PR 1 实施期间 Codex 撞到第 3 个(`check-mobile-first-fold-compaction.mjs`)。Claude 之后 grep 全部 99 个 `scripts/check-*.mjs`,确认 IA-enforcement checker **总共就 3 个**,无第 4 个。完整表如下,未来 milestone 改 IA 项时必须同步全部 8 处字面量,否则 `npm run check:all` 必挂。

| # | 文件 | 行号 | 现状 | 改为 |
|---|---|---|---|---|
| 1 | `DESIGN.md` | §4.1 IA 表 | `2. dashboard-jump-nav            (顶部跳转导航 14 项)` | `2. dashboard-jump-nav            (顶部跳转导航 15 项)` |
| 2 | `DESIGN.md` | §10 速查表(若有) | 同上 | 同上 |
| 3 | `DESIGN.md` | §12 文档历史(若有) | 同上 | 同上 |
| 4 | `scripts/check-homepage-ia-contract.mjs` | `navContract` 数组 + `staticRequiredIds` + `expectedOrder` | 14 项 / 缺 `'macro-thematic-cards'` | 15 项 / 加入 |
| 5 | `scripts/check-homepage-ia-contract.mjs` | `checkNav()` 报错文案 | `exact 14-step reading-path order` | `exact 15-step reading-path order` |
| 6 | `scripts/check-editorial-redesign-contract.mjs` | `checkHomepageIa()` `expectedLinks` 数组 | 14 项 | 15 项(含 `['宏观主题卡阵', '#macro-thematic-cards']` 第 9 位) |
| 7 | `scripts/check-editorial-redesign-contract.mjs` | `checkHomepageIa()` 报错文案 + `checkDesignContractDoc()` `requiredMarkers` 数组(2 处) | `exact 14-item editorial IA` + `'dashboard-jump-nav            (顶部跳转导航 14 项)'` | `exact 15-item editorial IA` + 字面量同步 + 数组追加 `'#macro-thematic-cards'` |
| 8 | **`scripts/check-mobile-first-fold-compaction.mjs`**(v2.3 新增 — PR 1 实施期间发现) | `navContract` 数组 | 14 项 | 15 项,第 9 位 `['宏观主题卡阵', '#macro-thematic-cards']`,与 `check-homepage-ia-contract.mjs` 完全同步 |

**Codex 实施提醒**:这 8 处字面量必须**完整同步**。PR 1 期间 Codex 用 `Select-String -Path "scripts\check-*.mjs" -Pattern "14 项|14-step|14-item|navContract|dashboard-jump-nav|jump nav labels|nav labels|expectedLinks"` 命令 grep 全部 99 个 checker,确认只此 3 个 checker 锁 nav 内容。

### §2.6.1 方法论铁律 1(v2.3 新增) — 未来 milestone 改 IA 项时的预飞 grep 要求

**触发条件**:任何未来 milestone 增加 / 减少 / 重命名 jump nav 项(本质是 `navContract` 数组改动)。

**强制流程**:
1. **改任何 IA enforcement checker 前**,先在仓库根目录运行(PowerShell):
   ```powershell
   Select-String -Path "scripts\check-*.mjs" -Pattern "navContract|dashboard-jump-nav|jump nav labels|nav labels|expectedLinks|<N> 项|<N>-step|<N>-item"
   ```
   其中 `<N>` 是当前 nav 项数(M-94 后是 15)。
2. **列出所有匹配的文件 + 行号 + 匹配字符串**。
3. **逐个判断**每个匹配是否真的锁了 nav 字面量内容(有的只是用 `dashboard-jump-nav` 作为位置 selector,不锁内容,如 `check-plain-summary-card-contract.mjs`)。
4. **更新本契约 §2.6 表**:把新发现的 enforcement 文件追加进表,不要让契约和代码脱钩。
5. **任何在第 4 步发现的新文件**,都必须纳入当前 PR 的允许改动清单,否则 `check:all` 必挂。

**反例**(PR 1 期间发生):契约 v2.1 / v2.2 凭记忆列 2 个 IA-enforcement checker,实际有 3 个,Codex 撞墙后停下报告,Claude 才补 grep。这个反例是本铁律的成因。

### §2.7 PR 1 阶段 `#macro-thematic-cards` 空容器骨架规范

**状态(v2.3 更新)**:**已 PR 1 merged**,本节作为历史归档保留,PR 2a/2b 实施时不再活跃 — 仅供未来 milestone 参考"同步 enforcement 与 implementation"的做法。

**原始约束(v2.2 记录)**:PR 1 改 IA checker 后,checker 会要求 `index.html` 包含 `id="macro-thematic-cards"` 元素 + nav 第 9 项指向它。**两者必须同步 PR 1 落地**,否则 `npm run check:all` 必挂(`check-homepage-ia-contract.mjs:checkRequiredIds()` 和 `checkOrdering()` 会同时报错)。

**PR 1 阶段空容器 HTML**(放在 `index.html` 内,`#macro-risk-overview` 闭合标签之后、`#global-risk-heatmap` 之前):

```html
<section id="macro-thematic-cards" class="editorial-section" style="--section-accent: var(--risk-green);">
  <header class="editorial-section-header">
    <span class="section-kicker">MACRO THEMATIC CARDS · 宏观主题卡阵</span>
    <span class="section-title">8 读者类别 红黄绿指标卡</span>
    <span class="section-note">本 section 容器骨架由 M-94 PR 1 落地,内容由 PR 2 通过 renderThematicCards.js 填充。</span>
  </header>
  <div class="editorial-section-body" id="macro-thematic-cards-root">
    <!-- PR 2 在此插入 8 个读者类别 block + 38 张指标卡 -->
  </div>
</section>
```

**为什么这样设计**:
- 用 `editorial-section` 类,自动继承 DESIGN.md §5.1 标准结构,无需 `assets/styles.css` 新增任何 selector(PR 1 不改 styles.css 的硬约束保留)
- `--section-accent: var(--risk-green)` 用 inline style 设定,符合 DESIGN.md §5.1 规范
- `editorial-section-body` 内有空 `<div id="macro-thematic-cards-root">` 作为 PR 2 的 mount 锚点,模仿现有 `#macro-risk-overview-root` 模式
- section-note 明示"内容由 PR 2 填充",PR 1 后页面上会显示这一行说明,但不影响主路径阅读

**nav 第 9 项 HTML**(放在 `<a href="#wow-key-changes">本期关键变化</a>` 之后、`<a href="#global-risk-heatmap">风险热力图</a>` 之前):

```html
<a href="#macro-thematic-cards">宏观主题卡阵</a>
```

**PR 1 完成后的视觉效果**:
- jump nav 从 14 项变成 15 项
- 首页中段(`#macro-risk-overview` 之后、`#global-risk-heatmap` 之前)多一个**绿色色带的空 section**,header 显示标题 + "PR 2 填充" 说明
- 主路径其他部分**完全不变**(因为 `renderMacroOverview.js` / 8 个 runtime block 都不动)
- 视觉上是"占位章节",和 M-93A0 PR 1 时 `#plain-summary-card` 刚到位但还没有数据的状态等价

**Codex 实施 PR 1 时禁止做**:
- ❌ 在 `#macro-thematic-cards-root` 内填任何卡片 / 内容(那是 PR 2 范围)
- ❌ 改 `scripts/modules/*` 任何文件
- ❌ 改 `assets/styles.css`(空容器用现有 token,无需新 selector)
- ❌ bump cache version(没有 implementation 改动,无需 bump)
- ❌ 引入 `renderThematicCards.js` 或它的引用

### §2.8 方法论铁律 2(v2.3 新增) — Enforcement 与 Implementation 必须同 PR 落地

**规则**:任何对 `scripts/check-*.mjs` 内 enforcement 数组 / 字面量 / requiredMarkers 的改动,必须与对应的 `index.html` / `assets/styles.css` / `scripts/modules/*` implementation 改动**同一个 PR** 落地。**不允许只改一边**。

**适用场景**:
1. 改 checker `navContract` 数组 → 同 PR 必须改 `index.html` nav 字面量
2. 改 checker `staticRequiredIds` 数组 → 同 PR 必须在 `index.html` 加对应 `id`
3. 改 checker `requiredMarkers` 数组 → 同 PR 必须在 `DESIGN.md` 或 implementation 加对应字面量
4. 改 checker `requiredStyleMarkers` / CSS selector check → 同 PR 必须改 `assets/styles.css`

**反例**(PR 1 期间发生):契约 v2.1 让 PR 1 只改 IA checker(扩 15 项)但不改 `index.html`(仍是 14 项 nav + 没 `#macro-thematic-cards` section)→ `check-homepage-ia-contract.mjs:checkRequiredIds()` 必挂。Codex 第 1 轮停下报告。Robert 选项 A 把 PR 1 范围扩到含 `index.html` 容器骨架,问题解决。

**例外情况**:可以拆 PR 但必须保证 `npm run check:all` 在每个 PR 合上去之后都全绿。例如 M-93A0 当年做法:PR 1 同 PR 加 checker + index.html 容器骨架(同步)+ 后续 PR 2 才填渲染逻辑(此时 checker 已绿,不会挂)。

**给 Codex 的检查清单**:
1. 改 checker 之前,先查 checker 的所有 `assert` / `requireMarker` / `fail` 调用,列出**这次改动会让哪些**断言变成"必须在 implementation 侧也存在"
2. 把那些 implementation 侧的对应改动加进同一个 PR
3. 跑 `npm run check:all`,全绿才提交
4. 如果发现某个改动**不可能在本 PR 完成**(例如改 checker 要求某个 helper 函数存在,但 helper 在另一个 PR),就**不要改这个 checker**,等 helper 所在 PR 先合并

---

## §3 8 大主题卡片清单与字段映射

### §3.1 主题 1 · 通胀与能源 (`#cat-inflation-energy`)

**section header**:
- kicker:`INFLATION & ENERGY`
- title:`通胀与能源`
- note:`能源链与通胀指标。本类卡片源自 brentPricingLayer / macroDrivers.consumer.ismManufacturingPmi。CPI / WTI 为 P1 占位,M-95 起接入。`

**卡片清单**(5 张):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | Brent 布伦特原油 | 主数字 `data.__effectiveDisplayInputs.brent`(fallback `displayInputsBaseline.brent`);agg-rows 5 字段:`brentPricingLayer.{eiaBrentSpotProxy.price, futuresPriceCurve.frontPrice, iceFuturesPriceCurve.frontPrice, proxySpread.spotMinusFutures, proxySpread.maxProxyDivergencePct}` | 阈值 §1.9 | **HIGHEST**(agg-rows 5 行 + 30 字 note) |
| 2 | Crack spread 炼油利润 | `data.brentPricingLayer.{crackSpread, crackSpread4wChange, crackSpreadRegime}` | `crackSpread > 40` red | HIGH |
| 3 | ISM 制造业 PMI | `data.macroDrivers.consumer.{ismManufacturingPmi, ismManufacturingPmi3mChange, ismPmiRegime}` | `< 45` red, `< 50` yellow | HIGH |
| 4 | US CPI | P1 占位,无字段 | pending | LOW(灰占位卡) |
| 5 | WTI | P1 占位,无字段 | pending | LOW(灰占位卡) |

**主题级 intro 段**(在 section 头部下方,卡片上方):
> 能源是当前主线的第一环。Brent 主值与公开代理价格的距离反映现货溢价压力;crack spread 是能源向下游柴油 / 汽油传导的中间证据;ISM PMI 看美国制造业能否消化能源成本。CPI / WTI 后续接入。

### §3.2 主题 2 · 全球流动性 (`#cat-global-liquidity`)

**section header**:
- kicker:`GLOBAL LIQUIDITY`
- title:`全球流动性`
- note:`美元 / 黄金 / 利率曲线 / Fed 流动性 / Fed 政策路径。本类卡片源自 __effectiveDisplayInputs 与 macroDrivers.{fedLiquidity, policyExpectations, curve}。`

**卡片清单**(7 张):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | DXY 广义美元指数 | `data.__effectiveDisplayInputs.dxy`;**12 周高位标识** 当前无现成字段,标 **P2 占位**(后续 milestone 接入前端派生 helper)| `> 115` red | HIGH |
| 2 | Gold 黄金 | `data.__effectiveDisplayInputs.gold` | 趋势驱动 | MEDIUM |
| 3 | US 10Y + 2s10s 曲线 | `data.__effectiveDisplayInputs.us10y` + `data.macroDrivers.curve.{t10y2y, t10y2yWeekChange, regime, steepeningAlert}` | `regime` 直接映射 | HIGH(双数字 + 4 行 agg-rows) |
| 4 | USD Liquidity 三层聚合 | `data.macroDrivers.fedLiquidity.{walcl, walcl4wChange, onRrp, onRrpWeekChange, reserveBalances, reserveBalances4wChange, sofr, effectiveFedFundsRate, bgcr, tgcr, repoSpreadRegime}` agg-rows 全显(11 字段) | `liquidityIndex.regime` 同步 | **HIGHEST**(6 行 agg-rows + 60 字 note + boundary 标注) |
| 5 | Fed 政策路径分歧 | `data.macroDrivers.policyExpectations.{targetMid, fedFundsFutureFrontPrice, fedFundsFutureImpliedRate, futureMinusTargetMid, zqCurveFrontImpliedRate, sr3CurveFrontImpliedRate, oisForward12MRate, sepDotMid2026, statementMinutesTone}`(9 字段)| `\|futureMinusTargetMid\| > 50bp` red | **HIGHEST**(7 行 agg-rows) |
| 6 | Cu/Au 铜金比 | P1 占位 | pending | LOW |
| 7 | CFETS RMB 人民币篮子 | P1 占位 | pending | LOW |

**主题级 intro 段**:
> 全球流动性来自四条管线:美元 / 黄金 / 利率 / 美联储资产负债表。任意管线收紧都会向风险资产传导。当前美联储流动性三层(水位 / 回购 / 隔夜)均无 2019-09 形态信号。

### §3.3 主题 3 · 信用与企业债 (`#cat-credit-corporate`)

**section header**:
- kicker:`CREDIT & CORPORATE`
- title:`信用与企业债`
- note:`高收益与投资级利差、NFCI、私募信贷公开代理、商业地产风险。源自 __effectiveDisplayInputs 与 macroDrivers.{credit, privateCreditProxy, commercialRealEstate}。`

**卡片清单**(5 张 — v2.1 决策 A 新增 CRE 第 5 卡):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | HY OAS 高收益债利差 | `data.__effectiveDisplayInputs.hyOas` 主数字;WoW 变化**当前无现成字段**,aux 写"等待 history WoW 接入" | §1.9 | HIGH |
| 2 | IG OAS 投资级利差 | `data.macroDrivers.credit.{igOas, igOas1dChange, igHyRatio}` | §1.9 | HIGH |
| 3 | NFCI 芝加哥联储 FCI | `data.macroDrivers.credit.{nfci, nfci4wChange, nfciRegime}`(Codex 第三轮 Q1 确认存在) | §1.9 + 方向反转说明 | HIGH(必须强调"正值=收紧") |
| 4 | Private Credit Proxy 私募代理 | `data.macroDrivers.privateCreditProxy.{intervalFundNav, bdcEtfPrice, bdcEtf4wChange, pbdcEtfPrice, pbdcEtf4wChange, seniorLoanEtfPrice, seniorLoanEtf4wChange, privateCreditProxyRegime}`(8 字段直显) | display-only | HIGH(明确边界:公开代理,不是 private marks。**6-proxy z-score 数据不足,Codex 第三轮 Q5 确认派生不成立,降级为 8 字段直显 + note 预留"M-96+ 接 6-proxy z-score"接口**) |
| 5 | **Commercial RE 商业地产风险**(v2.1 决策 A 新增) | `data.macroDrivers.commercialRealEstate.{creDelinquencyRate, creDelinquencyRateQoQChange, creChargeOffRate, creChargeOffRateQoQChange, sloosCreNonfarmNonresidentialTightening, sloosCreConstructionTightening, sloosCreMultifamilyTightening, sloosCreTighteningMax}`(8 字段) | `creDelinquencyRate > 1.5%` red | **HIGHEST**(6 行 agg-rows:违约率 + 核销率 + SLOOS 三类紧缩 + max) |

**主题级 intro 段**:
> 信用层回答的不是"压力高不高",而是"压力有没有从价格变成融资约束"。HY OAS 与 IG OAS 是企业借钱难易的市场定价;NFCI 综合 100+ 跨市场信号;私募代理用上市 BDC ETF 篮子近似公开市场看不见的私募信贷;CRE 看商业地产融资压力(账面 + 银行紧缩双轨证据)。

### §3.4 主题 4 · 美国经济温度 (`#cat-us-economy`)

**section header**:
- kicker:`US ECONOMIC TEMPERATURE`
- title:`美国经济温度`
- note:`就业 + 消费两条管线 + 四象限判读。源自 macroDrivers.{employment, consumerRetail, consumer}。`

**卡片清单**(2 张聚合卡 + 1 个四象限说明文字):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | Employment 就业聚合 | `data.macroDrivers.employment.{initialClaims, initialClaims4wAverage, initialClaims4wChange, continuingClaims, continuingClaims4wAverage, joltsOpenings, joltsOpeningsYoY, averageHourlyEarningsYoY, u6UnemploymentRate, industryDiffusionPct, industryDiffusionRegime}`(11 字段) | `initialClaims > 280k` red | **HIGHEST**(7 行 agg-rows:claims/continuing/JOLTS/U-6/AHE/diffusion%/diffusion regime + 50 字 note) |
| 2 | Consumer 消费聚合 | `data.macroDrivers.consumerRetail.{cartsNominal, cartsNominal4wAverage, cartsNominalYoY, cartsReal, cartsReal4wAverage, cartsRealYoY, retailSegments, segmentPositiveCount, segmentDiffusionPct, strongestSegment, weakestSegment, bofaCardSpendingExGasYoY, redbookYoY}` + `data.macroDrivers.consumer.{umichSentiment, threeMonthChange}`(15 字段)| `cartsRealYoY < 0` red | **HIGHEST**(7 行 agg-rows:cartsReal/segmentDiffusion/strongest/weakest/UMich/BoA/Redbook) |

**主题级 intro 段**(四象限说明):
> **四象限 · 就业 × 消费**:就业供给端 + 消费需求端,只有同向才是真趋势。当前位 = 就业偏强 / 消费偏弱 → 实际工资被通胀压制(2022-2023 模式)。

### §3.5 主题 5 · 世界经济 (`#cat-world-economy`)

**section header**:
- kicker:`WORLD ECONOMY`
- title:`世界经济`
- note:`P1 占位区。本类 M-94 阶段除 World Order overlay 暂代外无字段。STOXX/Nikkei/DAX/V2X 等 M-95 起接入。`

**卡片清单**(1 张暂代 + 4 张 P1 占位):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | World Order 暂代 | `worldOrderStress.{score, state, labelZh}` | `state` 直接 | MEDIUM(明确"暂代,M-95 后退场") |
| 2 | STOXX 50 | P1 | pending | LOW |
| 3 | Nikkei 225 | P1 | pending | LOW |
| 4 | DAX | P1 | pending | LOW |
| 5 | V2X 欧元区波动率 | P1 | pending | LOW |

### §3.6 主题 6 · 中国宏观 (`#cat-china-macro`)

**section header**:
- kicker:`CHINA MACRO`
- title:`中国宏观`
- note:`类别整体 P1 占位。M-95/M-96 起接入公开数据(Yahoo 股指 + TE 公开 PMI/CPI/10Y + Stooq CFETS)。央行 SLO/MLF/OMO 原始 tape、社融组件分项、70 城房价原始不可达。`

**卡片清单**(7 张全 P1 占位,平铺,不折叠 — Robert 立场:架构槽位预留):

| # | 卡名 | 字段来源 | 状态 |
|---|---|---|---|
| 1 | SSE Composite 上证 | P1(Yahoo `000001.SS`) | pending |
| 2 | Hang Seng 恒生 | P1(Yahoo `^HSI`) | pending |
| 3 | CSI 300 沪深 300 | P1(Yahoo `000300.SS`) | pending |
| 4 | China PMI | P1(TE 公开 HTML) | pending |
| 5 | China CPI/PPI | P1(TE + FRED mirror) | pending |
| 6 | China 10Y | P1(TE 公开 HTML) | pending |
| 7 | CFETS RMB | P1(Stooq / TE) | pending |

**视觉**:全部用 dashed border + 灰底 + `pending` badge + "next: P1 / P2" 标识。

### §3.7 主题 7 · 市场情绪 (`#cat-market-sentiment`)

**section header**:
- kicker:`MARKET SENTIMENT`
- title:`市场情绪`
- note:`VIX / SPX / NDX 60w z-score(广度参照)。市场温度主卡(QQQ z-score)已在上方 #homepage-market-temperature 完整展示,此处不重复。`

**卡片清单**(3 张 — v2.1 决策 C:NDX 卡从"NDX vs SPX 30 日差"换为 NDX 60w z-score,因为 Codex 第三轮 Q4 实证 SPX 历史数据不存在):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | VIX 隐含波动率 | `data.__effectiveDisplayInputs.vix` | `> 25` red | HIGH |
| 2 | SPX 标普 500 | `data.__effectiveDisplayInputs.spx`;**52 周高位标识** 当前无现成字段,标 **P2 占位**(同 DXY) | `距高 -15%+` red | MEDIUM |
| 3 | **NDX 60w z-score**(v2.1 决策 C 替换) | `data/market-pricing-metrics.json.assets.ndx.records[]` → 最新 z-score;调用 `classifyZScoreBucket(getLatestMetric(ndxAssetData).zScore)` 复用 `buildCrossValidationMatrix.js` 现有 helper(无需新建派生逻辑) | z-score 分桶 §1.7 | HIGH(明确"与 QQQ 同步极端,确认整个美国成长股板块过热") |

**实施提醒**(Codex 第三轮 Q4 + T3):
- 调用方式:`import { classifyZScoreBucket } from './buildCrossValidationMatrix.js'`
- helper 已存在,渲染时只需:
  ```js
  const ndxRecords = marketPricingMetricsData.assets.ndx.records;
  const latestNdx = ndxRecords[ndxRecords.length - 1];
  const ndxZ = latestNdx.zScore;
  const bucket = classifyZScoreBucket(ndxZ);  // 复用现有
  ```
- **不**新建 `renderThematicCards.js` 内的 z-score helper

### §3.8 主题 8 · 地缘与世界秩序 (`#cat-geopolitics`)

**section header**:
- kicker:`GEOPOLITICS & WORLD ORDER`
- title:`地缘与世界秩序`
- note:`底层地缘评分 + World Order overlay + 经济武器化 + 军备冲突。源自 modules.geopolitical 与 worldOrderStress.dimensions。`

**卡片清单**(4 张):

| # | 卡名 | 字段来源 | 状态判定 | 密度 |
|---|---|---|---|---|
| 1 | Geopolitical 底层评分 | **`data.modules.geopolitical`(扁平数字,不是 `.score` 子字段)+ `data.moduleTrends.geopolitical`(趋势符号)**;Codex 第三轮 Q2 修正 | `> 70` red | HIGH(明确"进 scoring") |
| 2 | World Order overlay | `worldOrderStress.{score, state, labelZh}` | `state` 直接 | HIGH(明确"regime overlay,不进 scoring") |
| 3 | Economic Weaponization | `worldOrderStress.dimensions.economicWeaponization.{score, labelZh, trend}` | 阈值 §1.9 | MEDIUM |
| 4 | Arms & Conflict | `worldOrderStress.dimensions.peaceDividendRetreat.{score, labelZh, trend}` | 阈值 §1.9 | MEDIUM(标 "MANUAL · ANNUAL") |

---

## §4 文件改动清单(implementation 范围,PR 1 + PR 2)

### §4.1 PR 1:契约 + DESIGN.md + checker + index.html 容器骨架(v2.2 范围扩大)

**新增**:
- `docs/M94_V0_DATA_CONTRACT.md`(本文档 v2.2)
- `manual-artifacts/m94-v0/m94-v0-FINAL-mock.html`(视觉权威基准)

**修改**:

| 文件 | 改动 | Codex 第三轮提醒 |
|---|---|---|
| `DESIGN.md` §4.1 | IA 表追加 `#macro-thematic-cards`(在 #global-risk-heatmap 之前)+ **同步把"14 项"字面量全部改 15 项**(§2.6 表 #1-3) | 全文 grep `14 项` 不能有遗漏 |
| `DESIGN.md` §5.1 | section 色带表追加 `#macro-thematic-cards: var(--risk-green)` | — |
| `DESIGN.md` §10.2 | ID 速查表追加 `#macro-thematic-cards   宏观主题卡阵(绿色带)` | — |
| `DESIGN.md` §12 文档历史 | 追加一行 M-94 修订记录 | — |
| `scripts/check-homepage-ia-contract.mjs` | `navContract` 14 → 15 项,`staticRequiredIds` 增加 `'macro-thematic-cards'`,`expectedOrder` 同步;**报错文案 14-step → 15-step**(§2.6 表 #4) | 文案 grep 确认无 `14-step` 残留 |
| `scripts/check-editorial-redesign-contract.mjs` | `checkHomepageIa()` 内 `expectedLinks` 14 → 15 项;`checkDesignContractDoc()` 内 `requiredMarkers` 数组追加 `'#macro-thematic-cards'` **并把 `'dashboard-jump-nav            (顶部跳转导航 14 项)'` 字面量改 15 项**(§2.6 表 #5-6);报错文案 14-item → 15-item | 文案 grep 确认无 `14-item` 残留 |
| **`index.html` nav 区**(v2.2 新增) | 在 `<a href="#wow-key-changes">本期关键变化</a>` 之后、`<a href="#global-risk-heatmap">风险热力图</a>` 之前,插入 `<a href="#macro-thematic-cards">宏观主题卡阵</a>` | 让 IA checker 通过 |
| **`index.html` body 主区**(v2.2 新增) | 在 `<section id="macro-risk-overview">` 闭合 `</section>` 之后、`<section id="global-risk-heatmap">` 起始之前,插入 §2.7 规范的**空 `#macro-thematic-cards` section 容器骨架**(包含 header + 空 body + `id="macro-thematic-cards-root"` mount 锚点) | 让 IA checker 通过 |

**PR 1 不改的 implementation 文件**(v2.2 明确):

| 文件 | 理由 |
|---|---|
| `scripts/modules/render*.js` 任何文件 | render logic 全部留 PR 2 |
| `scripts/modules/buildCrossValidationMatrix.js` | 算法不动 |
| `scripts/modules/realtime.js` | Worker / runtime 派生不动 |
| `assets/styles.css` | 空容器用现有 `--paper-* / --risk-*` token,无需新 selector |
| `data/*` 任何文件 | 数据生产不动 |
| `workers/*` | 不动 |
| `.github/workflows/*` | 不动 |
| `package.json` | PR 1 不新增 npm script(`check:thematic-cards-contract` 留 PR 2 引入) |
| `index.html` `<head><style>` 区 | 不删除现有硬编码色值,只动 nav 和 body 区 |

**PR 1 验收**:`npm run check:all` 必须全绿(因 nav + section 容器同步到位,IA checker 不会再 fail)。具体见 §9.6。

### §4.2a PR 2a:Thematic Cards Fill(v2.3 新增 — PR 2 第一半)

**目标**:把 PR 1 留下的空 `#macro-thematic-cards-root` 容器填充为 8 主题块 + 38 张指标卡。

**新增文件**(3 个):

| 文件 | 用途 | 量级估计 |
|---|---|---|
| `scripts/modules/renderThematicCards.js` | 主入口 `renderThematicCards(data, root)`:8 主题块 × 38 卡 + agg-rows + status 判定 + intro 段 + section header | ~600-900 行 |
| `scripts/modules/displayStatusThresholds.js` | 阈值常量导出(`THRESHOLDS.brent / hyOas / vix / nfci / ...`)+ `classifyByThreshold(value, key)` helper。**仅常量与纯函数**,不调用 worker / data | ~80-150 行 |
| `scripts/check-thematic-cards-contract.mjs` | 内容契约 checker(类似 `check-plain-summary-card-contract.mjs`)。校验:8 个 reader-cat-block 存在 + 38 张卡 + 每张卡有 status badge + intro 段非空 + 阈值常量复用 | ~200-400 行 |

**修改文件**(v2.4 调整 — 4 个改为 5 个):

| 文件 | 改动 | 边界 |
|---|---|---|
| `index.html` | (1) **cache version `28.0M-93AV` → `28.0M-94` 由 `npm run bump:frontend-asset-version 28.0M-94` 自动完成,Codex 不要手动改**(详见 §4.2a.1);(2) **是否需要单独引入 `renderThematicCards.js` 模块,取决于 `scripts/app.js` 的 import 模式** — 当前 app.js 直接 import 所有 module(line 1-9 显式列出),所以 PR 2a 在 `app.js` 顶部 import 区追加 `import { renderThematicCards }` 即可,**index.html 不需要单独 script tag** | **不动 `<head><style>` 区任何硬编码色值**(留给 PR 2b);**不动**已 PR 1 落地的 nav / section 容器;**不动**已 PR 1 落地的 `#macro-thematic-cards` section header / mount 锚点 |
| **`scripts/app.js`**(v2.4 替换原 render.js · v2.5 去掉手动 cache bump 描述) | (1) line 1-9 import 区追加:`import { renderThematicCards } from './modules/renderThematicCards.js?v=28.0M-94';`(2)`main()` 函数渲染序列追加 `renderThematicCards(data, document.getElementById('macro-thematic-cards-root'), marketPricingMetricsData)` 调用 — **挂载位置**:看 `app.js` line 88-104 的 marketPricingMetricsPromise.then(...) 块,因为 thematic-cards 需要 marketPricingMetricsData(NDX 60w z-score 卡用),应放在 `.then()` 回调内,与第二次 `renderMacroRiskOverview` 调用同步;(3) **`__GFRR_FRONTEND_VERSION__` 常量值以及所有 `?v=28.0M-93AV` → `?v=28.0M-94` 同步,统一由 `npm run bump:frontend-asset-version 28.0M-94` 完成**(详见 §4.2a.1)。Codex 不需要手动 grep 替换 cache version 字面量 | **不改 `main()` 其他渲染调用顺序**;**不改 fetchBaselineData / fetchHistoryData / fetchRealtimePayload / fetchWorldOrderStressData 任何函数**;**不动**任何 decision / position / action 设置代码 |
| **`scripts/modules/buildCrossValidationMatrix.js`**(v2.4 新增 — 精确 1 行) | 在文件末尾 `export { ASSESSMENT_LABELS };` 一行**之后**追加新一行 `export { classifyZScoreBucket };`;或合并为 `export { ASSESSMENT_LABELS, classifyZScoreBucket };`。**禁止**改任何函数体 / 算法 / 注释 / 顺序 / 其他 export | 文件其他 1100+ 行一字不动 |
| `assets/styles.css` | **仅新增**主题卡阵相关 selector:`.reader-cat-block / .reader-cat-header / .cat-intro / .indicator-card / .indicator-card.pending / .agg-rows / .agg-rows .k / .agg-rows .v / .badge.red / .badge.yellow / .badge.green / .badge.orange / .badge.pending`,全部用 `var(--paper-* / --risk-* / --font-*)` token。**禁止删除或修改任何现有 selector**(包括 `check-editorial-redesign-contract.mjs:579-598` 锁的 `.badge.strong / .badge.strong-mid / .badge.cautious-bear / .badge.underweight` 4 个旧 badge);**禁止新建 `--*` token** | 不动 `--editorial-*` 旧 token 体系 |
| `package.json` `scripts` | 新增 `"check:thematic-cards-contract": "node --check scripts/check-thematic-cards-contract.mjs && node scripts/check-thematic-cards-contract.mjs"`;**`check:all` 必须把这一项加入序列** | 不改其他 script |

### §4.2a.1 Cache version bump 实施步骤(v2.5 新增 — 项目惯例)

**重要**:Cache version `28.0M-93AV → 28.0M-94` bump 在项目里是 **8 固定文件 + 全部 scripts/modules/*.js 同步**,不是手动 grep 替换。**必须**用项目惯例 helper:

```powershell
npm run bump:frontend-asset-version 28.0M-94
```

**这个 helper 会同步以下文件**(来自 `scripts/bump-frontend-asset-version.mjs` 第 8-17 行的 `fixedFiles` 数组 + listModuleFiles):

```
固定文件(8 个):
1. index.html                                          (改 ?v= 字面量)
2. scripts/app.js                                      (改 ?v= + __GFRR_FRONTEND_VERSION__ 常量)
3. scripts/check-workflows.mjs                         (改 frontendAssetVersion 常量值,这是唯一允许的 check-workflows.mjs 改动)
4. README.md                                           (改文档内 cache version 提示)
5. AGENTS.md                                           (同上)
6. docs/OPERATIONS.md                                  (同上)
7. docs/DATA_CONTRACT.md                               (同上)
8. workers/gfrr-realtime-worker/README.md              (同上)

scripts/modules/*.js 全部(改各文件内 ?v= 字面量):
- scripts/modules/buildCrossValidationMatrix.js
- scripts/modules/config.js
- scripts/modules/decision.js
- scripts/modules/displayStatusThresholds.js          ← PR 2a 新建,bump 时会被一起改
- scripts/modules/displayTextBuilders.js
- scripts/modules/format.js
- scripts/modules/freshness.js
- scripts/modules/health.js
- scripts/modules/realtime.js
- scripts/modules/render.js
- scripts/modules/renderAudit.js
- scripts/modules/renderCharts.js
- scripts/modules/renderExternalAi.js
- scripts/modules/renderMacroOverview.js
- scripts/modules/renderPlainSummary.js
- scripts/modules/renderTables.js
- scripts/modules/renderThematicCards.js              ← PR 2a 新建,bump 时会被一起改
```

总计 8 + ~17 = **25 个文件被 bump helper 同步**。其中大部分文件(modules/*.js 多个 + 5 个文档)**当前并不含 `?v=28.0M-93AV` 字面量,bump 后也仍不含**,所以这些文件 git diff 中不会出现改动 — 实际 git diff 出现改动的文件是 8-13 个之间(取决于哪些 modules 现在含 `?v=` 字面量)。

**实施流程**(放在 §4.3 阶段 4 末尾):
1. 在 `scripts/app.js` 顶部 import 区追加新 import `import { renderThematicCards } from './modules/renderThematicCards.js?v=28.0M-93AV';`(**注意:暂用当前 cache version `28.0M-93AV`**,因为 bump 前要全文件一致;bump helper 会自动改为 `28.0M-94`)
2. 在 `scripts/app.js` `main()` 的 `marketPricingMetricsPromise.then(...)` 内追加 `renderThematicCards(...)` 调用
3. `npm run check:all` 必须绿(此时所有文件仍是 `28.0M-93AV`,一致)
4. 跑 `npm run bump:frontend-asset-version 28.0M-94`
5. 看 helper 输出 — 列出所有被改的文件,记录(用于 PR 描述)
6. `npm run check:all` 必须绿(所有文件已同步到 `28.0M-94`)
7. `git status` 看实际 diff 影响哪些文件,把它们加入 PR 边界验收(§9.7)

**为什么这样设计**:
- 项目历史上吃过亏(`frontendAssetDocText` enforcement 里写着 "Android Chrome cached old module graph"),原因是 cache version 漏改某个文件,导致 Android Chrome 用旧 module graph 加载新代码,JS 错乱
- 所以项目设计了 `check-workflows.mjs:frontendAssetVersion` 全局校验 + `bump-frontend-asset-version.mjs` 一键同步 helper
- helper 用正则 `?v=[A-Za-z0-9._-]+` 全文件扫描替换,**任何手动改都可能漏文件,任何手动改都禁止**

**Codex 实施 §4.2a.1 时禁止做**:
- ❌ 手动 grep 替换 `?v=28.0M-93AV → 28.0M-94`(会漏文件)
- ❌ 手动改 `scripts/check-workflows.mjs` 的 `frontendAssetVersion` 常量(让 bump helper 来做)
- ❌ 手动改文档(README.md / AGENTS.md / docs/* / workers/* README)中的 cache version(让 bump helper 来做)
- ❌ 跑 bump helper 前没先在 `app.js` 加好新 import(`renderThematicCards.js` import 必须先加,bump 才能把它的 `?v=` 也改到 28.0M-94)

**PR 2a 不改文件**(铁律,与契约 §0.3 一致):

| 文件 | 理由 |
|---|---|
| **`scripts/modules/renderMacroOverview.js`** | **整个 PR 2b 范围**,PR 2a 完全不碰 |
| `scripts/modules/decision.js / realtime.js / buildCrossValidationMatrix.js / renderPlainSummary.js / renderExternalAi.js / health.js / freshness.js` | 项目宪法 + 已稳定模块 |
| `data/*.json` 任何文件 | 项目宪法 |
| `workers/*` | 项目宪法 |
| `.github/workflows/*` | 项目宪法第 5 条 |
| `DESIGN.md` | 已 PR 1 落地,PR 2a 不动 |
| `index.html` `<head><style>` 块所有硬编码色值 | 留给 PR 2b token 化 |
| `index.html` 已 PR 1 落地的 nav / section 容器 / `#macro-thematic-cards` section header / mount 锚点 | 不再动 |
| `.gitignore` | 已 PR 1 稳定 |

**PR 2a 视觉效果**:
- PR 1 留下的空 `#macro-thematic-cards-root` 填满 8 主题块 + 38 张指标卡
- 8 个 runtime block(today-judgment / pressure-sources / signal-layers / macro-drivers / market-temperature / risk-engines / cross-validation / wow-key-changes)**视觉不变**(因为 PR 2a 不动 `renderMacroOverview.js` 和 `<head><style>` 块)
- 主页一半新风格(`#macro-thematic-cards` 区)+ 一半旧风格(`#macro-risk-overview` 区)— **可接受的短暂状态**,等待 PR 2b 收口

**PR 2a 实施顺序建议**(对应 §4.3 铁律 2):
1. 先创建 `scripts/modules/displayStatusThresholds.js`(最小常量文件)→ 跑 `npm run check:syntax`
2. 创建 `scripts/check-thematic-cards-contract.mjs`(只放空 main + 占位 assert)→ 加入 `package.json` + `check:all` → 跑 `npm run check:all` 确认基线绿
3. 创建 `scripts/modules/renderThematicCards.js` 骨架(8 空 reader-cat-block 占位)→ 在 `render.js` 加调用 → 在 `index.html` 引入 module + bump cache → 跑 `npm run check:all`
4. 在 `assets/styles.css` 加主题卡 selector(配 §7.2 + §7.4 CSS 规范)→ 跑 `npm run check:all`
5. 在 `renderThematicCards.js` 逐主题填充:主题 1 通胀与能源 5 卡 → 跑 `check:all` → 主题 2 全球流动性 7 卡 → 跑 `check:all` → ... → 主题 8 地缘 4 卡 → 跑 `check:all`
6. 把 `check-thematic-cards-contract.mjs` 内的 assert 补全(8 主题 + 38 卡 + agg-rows 验证)→ 跑 `npm run check:all`
7. 全绿 → commit + push + open PR
8. **每跑一次 `npm run check:all` 不绿就停,报告 Robert + Claude,等待授权**

**PR 2a 验收**:见 §9.7。

### §4.2b PR 2b:8 Runtime Block Rewrite(v2.3 新增 — PR 2 第二半)

**目标**:把 `#macro-risk-overview` 内 8 个 runtime block 的视觉从"工程术语堆积"重写为 Bubble Watch 报纸风格。**保留所有现有字段消费**(契约 §6.2 + §8 警告)。

**新增文件**:无。

**修改文件**(3 个):

| 文件 | 改动 | 边界 |
|---|---|---|
| `scripts/modules/renderMacroOverview.js` | 重写 8 个 build 函数的 **HTML 生成部分**(按 §8.1-§8.8 详细指引)。`buildMacroDrivers`(616 行)+ `buildPressureSources`(160 行)+ `buildRiskEngines`(256 行)是重点。**保留全部字段消费**,仅改外壳 | **禁止简化字段消费**;**禁止删除任何 buildXXX 子函数**;**禁止改 `appendSection` / `appendRiskStageScale` 等已有 helper 函数签名** |
| `assets/styles.css` | 补充 runtime block 相关 selector:`.editorial-big-number / .editorial-verdict / .mini-grid / .narrative-list / .consistency-bar / .wow-section / .wow-grid / .wow-item / .wow-tag.is-up/.is-down/.is-flat` 等。检查 `check-editorial-redesign-contract.mjs:checkEditorialStructures()` 的 `requiredMarkers` 数组,确保新 selector 与现有 enforcement 兼容 | 同 PR 2a,只加不删 / 不改旧 selector |
| `index.html` `<head><style>` 块 | **删除**所有 `.macro-overview-*` 类的硬编码色值(`#FBF7F0`、`#1A1815`、`#7C1D1D`、`#666666`、`#A8761A` 等),全部改用 `var(--paper-* / --risk-*)` token | **保留** `.editorial-section-wow / .macro-temperature-card / .secondary-ai-panel / .auxiliary-explanation-heading / .global-visualization-heading / .world-order-* / .external-ai-*` 等其他 selector(它们不在 PR 2b 范围) |

**PR 2b 不改文件**(铁律):

| 文件 | 理由 |
|---|---|
| `scripts/modules/renderThematicCards.js` 等 PR 2a 新建文件 | 已 PR 2a 落地,不动 |
| `scripts/modules/displayStatusThresholds.js` | 同上 |
| `scripts/check-thematic-cards-contract.mjs` | 同上 |
| `scripts/modules/decision.js / realtime.js / buildCrossValidationMatrix.js / renderPlainSummary.js / renderExternalAi.js / health.js / freshness.js` | 项目宪法 |
| `data/*.json` / `workers/*` / `.github/workflows/*` | 项目宪法 |
| `DESIGN.md` | 已 PR 1 落地 |
| `index.html` 主体结构(nav / section 容器 / 已 PR 2a 引入的 module reference) | 不动 |
| `.gitignore` | 已稳定 |
| `package.json` | PR 2b 不新增 script |

**PR 2b 视觉效果**:
- 8 个 runtime block 全部升级 Bubble Watch 风格,与 PR 2a 的主题卡阵在视觉上**一致**
- 主页视觉收口,M-94 完成度达到 100%

**PR 2b 实施顺序建议**(对应 §4.3 铁律 2 + Codex §6.2 警告):
1. 先 token 化 `index.html` `<head><style>` 块(只改色值,不改结构)→ 跑 `npm run check:all`(此时所有 selector 还在,只是用 token,不会挂)
2. 在 `assets/styles.css` 加新 selector(`.editorial-big-number / .mini-grid` 等)→ 跑 `npm run check:all`
3. 改 `renderMacroOverview.js` 第 1 个 build 函数:`buildTodayJudgment`(87 行) → 跑 `npm run check:all`
4. 改第 2 个:`buildSignalLayers`(106 行)→ 跑 `check:all`
5. 改第 3 个:`buildMarketTemperature`(48 行)→ 跑 `check:all`(注意保留 checker 要求文本)
6. 改第 4 个:`buildCrossValidation`(6 行 facade,**算法不动**)→ 跑 `check:all`
7. 改第 5 个:`buildKeyChanges / buildWatchList`(56 + 42 行)→ 跑 `check:all`
8. 改第 6 个:`buildRiskEngines`(256 行)→ 跑 `check:all`(保留多源派生)
9. 改第 7 个:`buildPressureSources`(160 行)→ 跑 `check:all`(保留 6 类压力证据结构)
10. 改第 8 个:`buildMacroDrivers`(**616 行**,最危险)→ 跑 `check:all`(保留 13 子模块全部字段)
11. 全绿 → commit + push + open PR
12. **每步 `check:all` 不绿就停**

**PR 2b 验收**:见 §9.1-§9.5(沿用 v2.2 验收清单)。

### §4.3 方法论铁律 3(v2.3 新增) — 大改动分阶段验证

**规则**:任何超过 200 行改动的 PR,Codex 必须按"改 1 个 build 函数或 1 个新文件 → 立即跑 `npm run check:all` → 不绿就停 → 绿就继续下一个"的循环,不要一次性改完所有再跑。

**理由**:`npm run check:all` 跑完 ~100 个 checker 大约 30 秒。多跑 10 次也只多 5 分钟,但避免一次性改 800-1500 行后撞墙时,Codex 不知道是哪个改动引入的问题。分阶段跑能精确定位。

**适用判定**:
- PR 改动行数预估 > 200 → 必须分阶段
- PR 涉及 ≥ 2 个新建文件 → 必须分阶段
- PR 改动 ≥ 2 个 `scripts/modules/*` 文件 → 必须分阶段
- PR 涉及 `assets/styles.css` 新增 selector 同时改 `checker` → 必须分阶段(改 css 但 checker 没同步,checker 会挂)

**给 Codex 的执行模板**:
```
对于每个阶段:
  1. 改这个阶段的文件
  2. git add -p 看 diff,确认改动只影响本阶段意图
  3. npm run check:all
  4. 全绿:进入下一阶段
  5. 不全绿:停,把错误日志贴给 Robert,等 Claude 分析 + 授权
```

**禁止做法**:
- ❌ 一次性改完 8 个 build 函数才跑 `check:all`(撞墙时找不到根因)
- ❌ 改 styles.css 但跳过 checker 验证(后续 build 必挂)
- ❌ commit + push 之前没跑 `check:all`(PR 描述会被验证脚本拒绝)

**不修改**(铁律):

| 文件/目录 | 理由 |
|---|---|
| `data/*.json` 任何文件 | 项目宪法,M-94 不动数据生产 |
| `scripts/modules/decision.js` | 决策模型,不动 |
| `scripts/modules/realtime.js` | Worker / realtime 派生,不动 |
| `scripts/modules/buildCrossValidationMatrix.js` | 一致性算法,不动 |
| `scripts/modules/renderPlainSummary.js` | M-93A0 已稳定,本契约不改 plain-summary-card |
| `scripts/modules/renderExternalAi.js` | External AI 边界,不动 |
| `scripts/modules/health.js / freshness.js` | 不动 |
| `workers/*` | 不动 |
| `realtime/*` | 不动 |
| `.github/workflows/*` | 项目宪法第 5 条 |

---

## §5 数据消费充分性审计(对照原 schema)

> 这一节回答:M-94 主路径是不是把项目已有数据用尽了?

| 顶层字段 | M-94 主路径消费? | 消费位置 |
|---|---|---|
| `dailyBrief` | ✅ | plain-summary-card preface + Hero verdict + Watch list |
| `divergenceLayer` | ✅ | signal-layers + cross-validation + WoW |
| `brentPricingLayer` | ✅ | 通胀与能源主题(Brent + Crack) |
| `score / scoreChange{1d,7d,30d}` | ✅ | Hero 大数字 + plain-summary + WoW |
| `currentMacroRegime / currentCrisisPhase` | ✅ | Hero kicker + verdict |
| `displayInputsBaseline` | ✅ | runtime 派生 `__effectiveDisplayInputs`,主路径每个数字卡 |
| `topRisks` | ✅ | plain-summary-card |
| `modules` (6 子模块) | ✅ | risk-engines + 地缘卡 |
| `moduleTrends` | ✅ | 8 周趋势图 |
| `regimeProbabilities` | ⚠️ Appendix only | detail-data 章节 |
| `phaseSignals` | ✅ | Hero verdict breakdown |
| `macroDrivers` (13 子) | ✅ | macro-drivers runtime block + 主题卡阵 多类 |
| `liquidityIndex` | ✅ | macro-drivers 全球流动性聚合 |
| `timeDimension` | ⚠️ Appendix only | detail-data |
| `heatmap` | ✅ | `#global-risk-heatmap` |
| `transmissionChain` | ⚠️ Appendix only | detail-data |
| `transmissionDeltaMeta` | ⚠️ Appendix only | detail-data |
| `assetMatrix` | ⚠️ Appendix only | detail-data |
| `assetReturnMap` | ⚠️ Appendix only | detail-data |
| `scenarioTree` | ⚠️ Appendix only | detail-data |
| `warningSystem / triggerPanel` | ✅ | `#execution-risk-detail` 完整展示 |
| `confidenceNotes` | ✅ | plain-summary + verdict footer |
| `recovery` | ✅ | `#detail-data` 系统状态 |
| `tradingSystem` | ⚠️ Appendix only | `#execution-risk-detail` |
| `decisionModel` | ⚠️ Appendix only | `#execution-risk-detail` |
| `aiInterpretationLayer` | ⚠️ Appendix only | detail-data |
| `externalAiInterpretationLayer` | ✅ | `#external-ai-auxiliary`(quality review gated) |
| `worldOrderStress` (整文件) | ✅ | 地缘主题 + `#world-order-stress-section` |
| `marketPricingMetrics` (整文件) | ✅ | market-temperature runtime block 主卡 |

**审计结论**:42 个 radar-data 顶层字段中,**18 个进入 M-94 主路径**(占 43%),**剩余进 Appendix 折叠区**或保留至未来 milestone。没有任何字段被遗弃。

---

## §6 Codex 第三轮审核已解决问题(从 v2 待办升级为 v2.1 确认结论)

> 本节是 v2 留下的 5 个 TODO + 新增 Q6 contractVersion 展示问题,**Codex 第三轮审核已全部给出代码层确认答案**。v2.1 据此修正契约相应章节。

| Q | v2 问题 | Codex 第三轮答案 | 在本契约 v2.1 的落实位置 |
|---|---|---|---|
| Q1 | `data.macroDrivers.credit.nfci` 是否存在? | **存在**,完整路径:`data.macroDrivers.credit.{nfci, nfci4wChange, nfciRegime}` + `sourceStatus.nfci`(见 `data/radar-data.json:1242-1260` + `renderMacroOverview.js:1002, 1104, 1431`)| §1.3 已加完整字段;§3.3 NFCI 卡 #3 已升级 HIGH 密度 |
| Q2 | `data.modules.geopolitical.score` 路径准确? | **错**。`data.modules` 是 6 项**扁平数字**(`geopolitical: 78` 直接是数字),趋势在 `data.moduleTrends.geopolitical`(见 `data/radar-data.json:857-872` + `decision.js:459-480`)| §1.3.5 已新增节;§3.8 第 1 卡字段路径已修正 |
| Q3 | `#macro-thematic-cards` 是否撞 `checkOptionalPlainSummaryPreface()`? | **不撞**。只要 `plain-summary-card` 仍在 nav 后 / `macro-risk-overview` 前(见 `check-homepage-ia-contract.mjs:279-311`)即可。新增 thematic-cards 在 macro-risk-overview 之后,不影响 preface 检查 | §2.1 IA 顺序已确认;FINAL mock 视觉已确认 |
| Q4 | NDX vs SPX 30 日相对强弱有现成派生? | **无 SPX 历史数据**。`data/market-pricing-metrics.json.assets` 只有 ndx/ixic,无 SPX。"NDX vs SPX 30 日"卡**不可行**,改为 **NDX 60w z-score** 复用 `classifyZScoreBucket` helper(决策 C) | §3.7 第 3 卡已替换;调用方式已说明 |
| Q5 | privateCreditProxy 6-proxy z-score 公式? | **数据不足,公式不成立**。`privateCreditProxy` 只有最新价格 + 4w change,**无 12 周历史窗口**(见 `data/radar-data.json:1567-1612`)。M-94 阶段不引入 z-score 派生,改为 8 字段直显 + note "M-96+ 接 6-proxy z-score" 占位(决策 B) | §3.3 第 4 卡已降级 HIGH 密度 + 边界 note |
| Q6 | contractVersion 是否展示? | **主 UI 不展示**。它是 render gate / fallback contract;若展示,只能进 Appendix `#detail-data` 章节作为方法审计(见 `render.js:482, 688, 851, 1043` + `renderExternalAi.js:285-303`) | §1.8 表已加 contractVersion 处理行;§9 验收清单已明确 |

**结论**:Codex 第三轮 6 个问题全部解决,无遗留 TODO。M-94 PR 1(本契约 + DESIGN.md + checker 更新)可以直接交付实施。

## §6.1 Codex 第三轮发现的"契约 v2 缺失字段"全部纳入 v2.1

| 缺失字段 | 消费位置 | v2.1 落实位置 |
|---|---|---|
| `dailyRealtimeInput.{healthScore, updatedAt, capturedAt}` | `buildTodayJudgment`, `buildKeyChanges` | §1.10 新增节 |
| `brentPricingLayer.{eiaBrentSpotProxy, futuresCurve, futuresPriceCurve, iceFuturesPriceCurve, ulsdPrice*}` | `buildTodayJudgment`, `buildPressureSources`, `buildSignalLayers`, §3.1 Brent 主题卡 | §1.5 + §3.1 卡 #1 |
| `macroDrivers.*.sourceStatus` | `buildMacroDrivers` 多处 | §1.3 各子模块字段已加 `sourceStatus`,主题卡不显示(避免冗余) |
| `macroDrivers.commercialRealEstate.*` | `buildMacroDrivers`, **§3.3 主题卡 #5 新增**(决策 A)| §1.3 + §3.3 |
| `worldOrderStress.{externalSources.*, decisionModifier.riskBias}` | `buildWorldOrderNarrative` | §1.6 已补充 |
| `marketPricingMetricsData.{sourceCommit, assets.ndx, assets.ixic, progress}` | `buildMarketTemperature`, `getAuxiliaryMarketPricingContexts` | §1.7 已说明 |
| `divergenceLayer.checks[].{key, status, severity}` | `buildRiskEngines:1639-1641` | §1.4 checks item 结构已说明 |
| `warningSystem / triggerPanel` | **不**进 MacroOverview watch list(Codex 第三轮硬错误 4) | §1.8 已修正;§3 已删除"合并复用"暗示 |

## §6.2 Codex 第三轮工作量警告(§8 实施指引已根据此调整)

| build 函数 | 当前规模 | Codex 警告 | v2.1 §8 处理 |
|---|---|---|---|
| `buildTodayJudgment` | 87 行 + render 段 | `editorial-big-number` 只有 CSS,无 JS helper;`appendRiskStageScale()` 已有但未调用 | §8.1 加备注:Codex 需新建 `appendEditorialBigNumber()` helper,**调用现有** `appendRiskStageScale()` |
| `buildPressureSources` | 160 行 | "改成 6 模块 mini card **会损失现有压力证据**" | §8.2 已改为"保留现有 6 类压力证据结构,仅改视觉外壳" |
| `buildSignalLayers` | 106 行 | `NARRATIVE_EMOJI` 已存在,卡片 helper 可复用 | §8.3 无需大改 |
| `buildMacroDrivers` | **616 行** | "'四列摘要' **会绕开大量已消费字段**" | §8.4 已改为"保留所有字段消费,仅按 fed/policy/curve/credit 4 组重新视觉分组" |
| `buildMarketTemperature` | 48 行 + append | checker 紧,必须保留 QQQ primary、NDX/IXIC、60 周均值、z-score、免责声明 | §8.5 已锁定 |
| `buildRiskEngines` | 256 行 | "源自 `data.modules`" 不准确,实际还吃 divergence/private credit/world order/market temp | §8.6 修正为"多源派生" |
| `buildCrossValidation` | 6 行 facade + 48KB matrix | 视觉可改,算法不要动 | §8.7 锁定 |
| `buildKeyChanges / buildWatchList` | 56 + 42 行 | `wow-item` / `editorial-watch-list` 已有 helper,改动相对小 | §8.8 锁定 |

---

## §7 卡片密度规范(借鉴 Path B,统一应用)

### §7.1 三档密度

| 密度 | 包含元素 | 用途 |
|---|---|---|
| **HIGHEST** | status bar + head + number + aux + agg-rows(4-6 行 key/value) + 长 note(40-60 字) + meta 行 | 聚合卡(privateCreditProxy, employment, consumerRetail, fedLiquidity) |
| **HIGH** | status bar + head + number + aux + note(25-40 字) + meta 行 | 标准卡(Brent, HY OAS, VIX, etc.) |
| **MEDIUM** | status bar + head + number + 短 note(10-20 字) + meta 行 | 次要卡(Crack, Gold, NDX 相对强弱) |
| **LOW(pending)** | dashed border + grey number "—" + P1/P2 标识 + meta 行 | P1 占位卡 |

### §7.2 agg-rows 视觉规范

```html
<div class="agg-rows">
  <div><span class="k">水位</span> · <span class="v">reserveBalances 3.62T</span> ↑</div>
  <div><span class="k">回购压力</span> · <span class="v">BGCR-SOFR +2bp</span></div>
  <div><span class="k">隔夜</span> · <span class="v">SOFR 5.31 / DFF 5.33</span></div>
</div>
```

CSS:
```css
.agg-rows {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--paper-muted);
  line-height: 1.7;
  border-top: 1px dotted #aaa;
  padding-top: 6px;
}
.agg-rows .k { color: var(--paper-muted); }
.agg-rows .v { color: var(--paper-ink); font-weight: 600; }
```

### §7.3 note 写作准则(对接金融意义)

每张 HIGH/HIGHEST 卡的 `note` 必须包含 1-2 句**金融意义解释**,不是数据复述。

✅ 好例: "强美元说明全球融资环境收紧,尚未到单独危机程度。"
❌ 差例: "DXY 当前值 119.3,周内 +1.4。"

### §7.4 主题级 intro 段

每个 reader-cat-block 在 header 与 card-grid 之间放一段 60-100 字的 intro 段,说明这一类指标背后的金融逻辑(参见 §3.1-3.8 各主题 intro)。

视觉:
```html
<p class="cat-intro">
  能源是当前主线第一环。Brent 主值与公开代理价格的距离反映现货溢价压力 ...
</p>
```

CSS:
```css
.cat-intro {
  font-family: var(--font-serif);
  font-size: 13px;
  background: var(--paper-bg-canvas);
  border-left: 3px solid var(--paper-ink);
  padding: 10px 14px;
  color: var(--paper-warm);
  line-height: 1.7;
  margin: 0 0 14px 0;
}
```

---

## §8 macro-risk-overview 内 8 runtime block 视觉重写要点

> 本节是给 Codex 实施 `renderMacroOverview.js` 改动时的精确指引。**只改 HTML 输出结构,不改 build 函数内部聚合逻辑**。

### §8.1 #homepage-today-judgment(Hero)

旧:`.macro-overview-hero` div with `.macro-overview-kicker / .macro-overview-one-line`
新:`<article class="editorial-big-number">` 结构,参考 mock Path B/C 的 Hero(深墨底反白文字 + 大数字 + verdict)

关键文本(对接 dailyBrief 真实字段):
- 大数字 = `data.score`
- 副文 = `${score} / 6 底层模块中 ${redCount} 红 / ${yellowCount} 黄 / ${greenCount} 绿`
- verdict kicker = `data.dailyBrief.macroState`(例如 "滞胀冲击 / 通胀冲击")
- verdict h2 = `data.dailyBrief.oneLineConclusion`
- footer = dominant chain `labelZh` + WoW change + data health

### §8.2 #homepage-pressure-sources

旧:展开式 list
新:`.mini-grid` 6 张 mini card,源自 `data.modules`(6 子模块**扁平数字**)

**Codex 第三轮警告**:`buildPressureSources` 当前 160 行,**实际消费的不只是 `data.modules`**,还包含 `data.modules` 的 6 类压力证据派生(每类有 evidence list、状态原因等)。改写时**必须**:
- 保留现有 6 类压力证据的内部 build 逻辑(`buildPressureCategorySummary` / `buildPressureCounts` 等)
- 仅替换 HTML 外壳为 mini-card 视觉
- **不允许**直接读 `data.modules[k]` 数字然后丢弃证据结构

如果改写后只剩 6 个数字,说明绕过了现有 build 函数,会损失大量字段消费。

### §8.3 #homepage-signal-layers

旧:展开式 list
新:`.narrative-list`,每条带 emoji 前缀(`NARRATIVE_EMOJI` 常量,已存在于 renderMacroOverview.js)+ score + 长 summary

### §8.4 #homepage-macro-drivers

旧:展开式 mini grid
新:**按 fed/policy/curve/credit 4 组重新视觉分组,并在底部加一行"子模块完整列表"**

**Codex 第三轮警告**:`buildMacroDrivers` 当前 616 行,是项目最大的 build 函数。如果改写成"四列摘要"绕过 616 行字段消费,会失去大量金融判读逻辑。改写时**必须**:
- 保留现有所有字段消费(13 子模块全部)
- 4 列视觉仅展示 fedLiquidity / policyExpectations / curve / credit 4 个**主**判读句
- 其他 9 个子模块(consumer/shippingFreight/employment/consumerRetail/commercialRealEstate/privateCreditProxy/activeSignals/gatingEvaluation/allSourcesMissing)在底部用 mono 字体一行列出,**它们已经在主题卡阵中详细展示**
- 严禁删除任何 buildXXX 子函数

### §8.5 #homepage-market-temperature

旧:动态卡
新:大数字 + 温度文字(`极度过热 / 显著偏热 / 中性区间 / 显著偏冷 / 极度偏冷`)+ 7 周 sparkline + NDX/IXIC 广度对照
保留所有现有 checker 要求文本(`等待历史周线数据接入` / `本数据为统计描述,不构成投资建议。` / `60 周均值` / `z-score`)

### §8.6 #homepage-risk-engines

旧:6 张展开卡
新:`.mini-grid` 6 张 mini card

**Codex 第三轮修正**:`buildRiskEngines` 当前 256 行,**多源派生**(不只是 `data.modules`):
- `data.modules` 6 引擎得 RED/YELLOW/GREEN
- 加 `divergenceLayer` / `privateCreditProxy` / `worldOrderStress` / `marketTemperature` 作为辅助判读
- 改写时保留所有多源派生逻辑,只换外壳为 mini-card

### §8.7 #homepage-cross-validation

旧:文本列表
新:一致性条(`<div class="consistency-bar"><div class="fill" style="width:${score}%"></div></div>`)+ 一致性数字 + 支持/反向/缺失分类列表
数据来自 `buildCrossValidationMatrix(data)` 返回的 `{narratives, consistencyScore, oneLineSummary}`

### §8.8 #wow-key-changes

旧:展开式
新:`.wow-section` 深墨反白板 + `.wow-grid` + `.wow-item` 含 `.wow-tag.is-up/is-down/is-flat`
数据来自 `buildKeyChanges(data)` 返回的 6-8 条 WoW item

---

## §9 验收清单(PR 2 合并条件)

### §9.6 PR 1 专属验收(v2.2 新增)

PR 1 范围:契约 + DESIGN.md + 2 个 IA checker + index.html nav + 空 section 容器。

**必须全绿的检查**:
```
npm run check:all
npm run check:homepage-ia-contract
npm run check:editorial-redesign-contract
npm run check:plain-summary-card-contract
```

**PR 1 视觉验收**:
- jump nav 显示 15 项,新增"宏观主题卡阵"位于第 9 位
- 首页中段(#macro-risk-overview 之后、#global-risk-heatmap 之前)出现绿色色带的空 section
- 该 section header 显示"MACRO THEMATIC CARDS · 宏观主题卡阵 / 8 读者类别 红黄绿指标卡 / 本 section 容器骨架由 M-94 PR 1 落地,内容由 PR 2 通过 renderThematicCards.js 填充"
- section body 为空(<div id="macro-thematic-cards-root"> 不含任何子元素)
- 其他所有 section 视觉**完全不变**(因为没动 styles.css / renderMacroOverview.js / index.html `<head><style>`)

**PR 1 不验收的事**(留 PR 2):
- 8 个 runtime block 视觉是否升级 Bubble Watch 风格 → PR 2
- 38 张主题卡是否填充 → PR 2
- styles.css 是否补充 .reader-cat-block 等 selector → PR 2
- cache version 是否 bump → PR 2

**PR 1 边界验收**:
- `git diff --name-only main..m94-v0-contract` 必须只含:
  ```
  docs/M94_V0_DATA_CONTRACT.md
  manual-artifacts/m94-v0/m94-v0-FINAL-mock.html
  .gitignore
  DESIGN.md
  scripts/check-homepage-ia-contract.mjs
  scripts/check-editorial-redesign-contract.mjs
  index.html
  ```
- 不能出现任何 `scripts/modules/*` / `assets/styles.css` / `data/*` / `workers/*` / `.github/workflows/*` 改动

**PR 1 PR 描述必须声明**:
- "本 PR 实施 M-94 V0 PR 1:契约 + DESIGN.md + IA checker + index.html nav 与空 section 容器骨架"
- "本 PR 不动任何 render logic,所有 render 改动留 PR 2"
- "字面量同步:DESIGN.md 内 X 处'14 项→15 项',checker 内 Y 处'14-step/item→15-step/item'"
- "`npm run check:all` 通过(贴截图或日志片段)"

### §9.7 PR 2a 专属验收(v2.3 新增 — Thematic Cards Fill)

PR 2a 范围:新建 3 个文件 + 改 4 个文件,填空 PR 1 留下的 `#macro-thematic-cards-root` 容器。

**必须全绿的检查**:
```
npm run check:all
npm run check:thematic-cards-contract        ← PR 2a 新增
npm run check:homepage-ia-contract
npm run check:editorial-redesign-contract
npm run check:mobile-first-fold-compaction
npm run check:plain-summary-card-contract
npm run check:market-pricing-network-open-throttled-scaffold
```

**PR 2a 视觉验收**(对照 FINAL mock `manual-artifacts/m94-v0/m94-v0-FINAL-mock.html`):
- `#macro-thematic-cards` section body 填充 8 个 `<section class="reader-cat-block">`,顺序:通胀与能源 / 全球流动性 / 信用与企业债 / 美国经济温度 / 世界经济 / 中国宏观 / 市场情绪 / 地缘与世界秩序
- 每个 reader-cat-block 有 header(kicker + title + note)+ 主题级 intro 段 + indicator-card 网格
- 38 张 indicator-card 总数对齐:5+7+5+2+5+7+3+4 = 38
- 信用类 5 张含 CRE 新卡 #5(`creDelinquencyRate / creChargeOffRate / sloosCre*Tightening`)
- 市场情绪 NDX 卡用 60w z-score(调用 `classifyZScoreBucket`)
- 私募信贷卡为 8 字段直显,有 "M-96+ 接 6-proxy z-score" note
- HIGHEST 卡(Brent / USD Liquidity / Fed Path / Employment / Consumer / CRE)有 4-6 行 `.agg-rows` + 长 note(40-60 字)
- HIGH 卡 25-40 字 note
- MEDIUM 卡 10-20 字 note
- LOW(pending)卡 dashed border + 灰底 + `pending` badge + "P1 / P2" 标识
- 主题级 intro 段背景 `var(--paper-bg-canvas)` + 左边深墨 3px 边框
- status badge 配色按 §1.9 阈值正确(red/yellow/green/orange/pending)
- **8 个 runtime block 视觉完全不变**(留给 PR 2b)
- cache version 已 bump 到 `28.0M-94`

**PR 2a 数据消费验收**:
- 所有指标数字来自 `__effectiveDisplayInputs` 或明示的派生路径(§1)
- 无任何 `data.values.*` 引用
- 8 字段 / 11 字段 / 15 字段 聚合卡 agg-rows 完整覆盖契约 §3 列出的全部字段
- `classifyZScoreBucket` 从 `buildCrossValidationMatrix.js` import 复用,**不复制**
- 阈值常量从 `displayStatusThresholds.js` import 复用,**不写死在 renderThematicCards.js**

**PR 2a 边界验收**(v2.5 重写 — 把 bump helper 同步范围正式纳入):

`git diff --name-only main..pr-2a-branch` 应包含以下两组文件:

**A 组 — PR 2a 功能性新建/修改**(8 个,与 v2.4 一致):
```
scripts/modules/renderThematicCards.js                  (new)
scripts/modules/displayStatusThresholds.js              (new)
scripts/check-thematic-cards-contract.mjs               (new)
scripts/app.js                                          (modified, 加 import + main() 内 call)
scripts/modules/buildCrossValidationMatrix.js           (modified, 仅追加 1 行 export classifyZScoreBucket)
assets/styles.css                                       (modified, 仅加 selector)
index.html                                              (modified, 仅 ?v= bump,无其他改动)
package.json                                            (modified, 仅加 check:thematic-cards-contract script)
```

**B 组 — bump:frontend-asset-version helper 同步**(预计 ~5-9 个,由 helper 自动产生):
```
scripts/check-workflows.mjs                             (modified, ONLY frontendAssetVersion 常量值)
README.md                                               (modified, ONLY 文档内 cache version 提示)
AGENTS.md                                               (modified, ONLY 文档内 cache version 提示)
docs/OPERATIONS.md                                      (modified, ONLY 文档内 cache version 提示)
docs/DATA_CONTRACT.md                                   (modified, ONLY 文档内 cache version 提示)
workers/gfrr-realtime-worker/README.md                  (modified, ONLY 文档内 cache version 提示)
scripts/modules/<现有 modules 内含 ?v=28.0M-93AV 字面量的 js 文件>  (modified, ONLY ?v= 同步)
```

**B 组实际数量取决于哪些文档/模块当前含 `?v=28.0M-93AV` 字面量,bump helper 跑完后看 `git status` 输出确认。**

**预计总文件数:13-17 个**(A 组 8 个 + B 组 5-9 个)。

**bump helper 同步行为允许例外**(v2.5 加):
- `scripts/check-workflows.mjs` 改动**必须**只是 `frontendAssetVersion = '28.0M-93AV'` → `'28.0M-94'` 一行,**严禁**其他逻辑改动
- 5 个文档(README / AGENTS / OPERATIONS / DATA_CONTRACT / workers README)改动**必须**只是 cache version 字面量 + bump 命令例句更新,**严禁**其他内容改动
- `scripts/modules/*.js` 改动**必须**只是 `?v=28.0M-93AV` → `?v=28.0M-94`,**严禁**其他 import 路径 / 代码改动

**严禁出现的改动**(与 v2.4 一致):
- **不能出现** `scripts/modules/renderMacroOverview.js / decision.js / realtime.js / render.js / renderPlainSummary.js / renderExternalAi.js / health.js / freshness.js / renderAudit.js / renderCharts.js / renderTables.js / displayTextBuilders.js / format.js / config.js` 的 **业务逻辑** 改动(只有上面 §0.3 允许的 cache version 同步行为是例外)
- **不能出现** `data/* / workers/*` 业务代码 / `.github/workflows/* / DESIGN.md / .gitignore` 任何改动(`workers/gfrr-realtime-worker/README.md` 是 cache version 同步文档,允许)
- **不能出现** `index.html` `<head><style>` 块改动(留给 PR 2b)
- **不能出现** `scripts/check-workflows.mjs` 除 `frontendAssetVersion` 常量值外的任何改动
- `git diff scripts/modules/buildCrossValidationMatrix.js` 必须**精确显示**:1 行新增 `export { classifyZScoreBucket };` + ?v= 字面量同步,无其他变化
- `git diff scripts/app.js` 必须**精确显示**:1 个 import 追加 + 1 个 main() 内 call + 1 个 `__GFRR_FRONTEND_VERSION__` 常量值 bump + 若干 `?v=` 同步

**review 命令**(Claude 用来验收):
```powershell
git diff --name-only main..HEAD                          # 看完整文件清单
git diff scripts/check-workflows.mjs                     # 必须只有 frontendAssetVersion 一行
git diff scripts/modules/buildCrossValidationMatrix.js   # 必须只有 1 行 export 追加 + ?v= 同步
git diff README.md AGENTS.md docs/OPERATIONS.md docs/DATA_CONTRACT.md workers/gfrr-realtime-worker/README.md  # 必须只有 cache version 字面量改动
```

**PR 2a PR 描述必须声明**:
- "本 PR 实施 M-94 V0 PR 2a:Thematic Cards 填充 — 8 主题块 + 38 张指标卡 + 3 新建文件 + 5 改文件(功能)+ ~5-9 个 bump helper 同步文件"
- "本 PR 不动 `renderMacroOverview.js` 与 `index.html` `<head><style>` 块,留 PR 2b 处理"
- "本 PR 不改 scoring / decision / execution / position / Worker / data pipeline / JSON 生产结构"
- "符合契约 v2.5 §4.2a + §4.2a.1 + §9.7 + §4.3 铁律 3 分阶段验证"
- "cache version `28.0M-93AV → 28.0M-94` 通过 `npm run bump:frontend-asset-version 28.0M-94` helper 同步,未手动改任何 cache version 字面量"
- "实施期间已 grep `Select-String -Path "scripts\check-*.mjs" -Pattern "<关键字段>"` 确认无遗漏 enforcement"
- "`npm run check:all` 通过(贴日志片段)"
- "已对照 FINAL mock 完成视觉一致性检查"

### §9.1-§9.5 PR 2b 验收清单(沿用 v2.2,作为 PR 2b 收口验收)

### §9.1 必须全绿的检查(PR 2b 收口合并)

```
npm run check:all
npm run check:homepage-ia-contract
npm run check:editorial-redesign-contract
npm run check:plain-summary-card-contract
npm run check:thematic-cards-contract        ← 新增
npm run check:market-pricing-temperature-display-activated
npm run check:editorial-redesign-contract
```

### §9.2 视觉验收

- jump nav 15 项,新增"宏观主题卡阵"位于第 9 位
- `#macro-thematic-cards` 出现在 `#wow-key-changes` 之后、`#global-risk-heatmap` 之前
- 8 个主题块全部存在,顺序与 §3 一致
- 中国宏观 block 7 张 P1 占位卡平铺
- 所有 `<style>` 内联色值改用 `var(--paper-*) / var(--risk-*)` token
- 所有字体声明使用 `var(--font-*)` 变量,不写字面量
- 8 个 runtime block 视觉已升级为 Bubble Watch 风格(对照 §8 检查)
- 卡片密度按 §7.1 三档应用

### §9.3 数据消费验收

- 所有指标数字来自 `__effectiveDisplayInputs` 或明示的派生路径
- 无任何 `data.values.*` 引用
- `dailyBrief.dominantRiskChain.evidence` 进入主路径展示
- `dailyBrief.keyTriggers + invalidationSignals` 进入 watch list / WoW
- External AI gate `qualityReview.promotionEligible === false` 时显示占位

### §9.4 边界验收

- `git diff --name-only -- data .github/workflows` 必须为空
- `git diff --stat scripts/modules/decision.js` 必须为 0
- `git diff --stat scripts/modules/realtime.js` 必须为 0
- `git diff --stat scripts/modules/buildCrossValidationMatrix.js` 必须为 0
- `git diff --stat workers/` 必须为 0
- `package.json` `dependencies` / `devDependencies` 数量不变

### §9.5 PR 描述必须声明

> "本 PR 符合 DESIGN.md 的所有规则(M-94 修订版,§4.1 IA 扩为 15 项)"
> "本 PR 不改 scoring / decision / execution / position / Worker / data pipeline / JSON 生产结构"
> "本 PR 不接入任何新数据源,不启用商业付费数据 / Market Pricing Temperature scoring / External AI scoring"

---

## §10 与契约 v1 / v2 / v2.1 / v2.2 关键差异(供 Robert 一目了然)

| 维度 | v1 | v2 | v2.1 | v2.2 | v2.3 |
|---|---|---|---|---|---|
| IA 结构 | 8 类读者类别完全替换 14 项 | 14 项 IA 保留 + 新增 1 项 = 15 项 | 同 v2 + checker 字面量同步 | 同 v2.1 + PR 1 容器骨架明确 | 同 v2.2 |
| token | 拟新建 `--gfrr-*` | 沿用 `--paper-*` | 同 v2 | 同 v2.1 | 同 v2.2 |
| 字体 CDN | 拟禁用 | 保留 Google Fonts 三家族 | 同 v2 | 同 v2.1 | 同 v2.2 |
| MacroRiskOverview | 拟下沉 Appendix | 内核保留视觉重写 | 同 v2 + §8 措辞修正 | 同 v2.1 | 同 v2.2 |
| plainSummaryCard | 拟吸收翻译表 | M-93A0 不动 | 同 v2 | 同 v2.1 | 同 v2.2 |
| 商业付费数据清理 | 第 5 章占大篇幅 | 移出 M-94 | 同 v2 | 同 v2.1 | 同 v2.2 |
| 字段名 | 60% 虚构 | 100% 真实 | **100% Codex 第三轮代码层确认** | 同 v2.1 | 同 v2.2 |
| CrossValidationMatrix | 漏识别 | 主路径 + consistency bar | 同 v2 | 同 v2.1 | 同 v2.2 |
| marketPricingTemperature | 浅识别 | 完整保留 | 同 v2 | 同 v2.1 | 同 v2.2 |
| 24 派生模块 | 漏 10 | 全部纳入 | 同 v2 + CRE 升主路径 | 同 v2.1 | 同 v2.2 |
| 卡片密度 | 全 HIGH | 三档 | 4 档 + HIGHEST 增多 | 同 v2.1 | 同 v2.2 |
| Codex 5 节审核(2 轮) | 未消化 | 100% 消化 | 同 v2 | 同 v2.1 | 同 v2.2 |
| Codex 第三轮 | — | — | **100% 消化** | 同 v2.1 | 同 v2.2 |
| 字段路径错误 | 60% 错 | 9 处需校 | **0 错** | 同 v2.1 | 同 v2.2 |
| §6 待办 | — | 5 TODO | **0 TODO** | 同 v2.1 | 同 v2.2 |
| modules 字段 | — | 误以为有 `.score` | 修正扁平数字 | 同 v2.1 | 同 v2.2 |
| privateCreditProxy z-score | — | 拟新建派生 | 数据不足降级 | 同 v2.1 | 同 v2.2 |
| NDX 卡 | — | NDX vs SPX 30 日差 | NDX 60w z-score | 同 v2.1 | 同 v2.2 |
| 信用类卡数 | — | 4 张 | 5 张(新增 CRE) | 同 v2.1 | 同 v2.2 |
| checker 字面量同步 | — | 未明确 | §2.6 列 2 个 checker / 6 处 | 同 v2.1 | **§2.6 列 3 个 checker / 8 处 + §2.6.1 grep 铁律** |
| PR 1 范围 | — | — | 仅契约 + DESIGN.md + checker | 加 index.html nav + 空容器骨架 | **已 merged**(commit `9b8e91f` + PR #250) |
| **PR 2 拆分** | — | — | 单 PR | 单 PR | **拆 PR 2a(Thematic Cards Fill)+ PR 2b(Runtime Block Rewrite)** |
| **方法论铁律** | — | — | — | — | **铁律 1 预飞 grep / 铁律 2 enforcement-implementation 同 PR / 铁律 3 大改动分阶段验证** |
| **`.gitignore` 约束** | — | — | — | — | **`manual-artifacts/` 必须单独成行,禁止改 `manual-artifacts/*` 写法** |

---

## §11 文档历史

| 日期 | 变更 | 触发事件 |
|---|---|---|
| 2026-05-23 | v1 初稿,53KB,80% 字段虚构 | Robert 启动 M-94 |
| 2026-05-24 | v2 重写,基于直接读取项目源码,5 个 TODO | Codex 2 轮审核 + 5 决策点拍板 + Path C+B 混合选择 + Filesystem 直读权限 |
| 2026-05-24 | v2.1 字段精校,0 TODO,5 硬错误修正,17 处字段补充 | Codex 第三轮代码层审核 + Robert 视觉确认 FINAL mock + 3 决策(CRE / NDX z-score / Private Credit 降级) |
| 2026-05-24 | v2.2 PR 范围修正:PR 1 加 index.html nav + 空 section 容器骨架(避免 checker enforcement 与 implementation 不同步) | Codex 第四轮 PR 1 实施时识别"先有鸡先有蛋"陷阱并报告;Robert 选项 A 拍板 |
| 2026-05-24 | **v2.3 整合 PR 1 全部教训 + 拆分 PR 2 为 PR 2a + PR 2b**:§2.6 列全 3 个 IA-enforcement checker(增加 `mobile-first-fold-compaction`)、§0.3 加 `.gitignore` 单行约束、§2.6.1 / §2.8 / §4.3 三条方法论铁律、§4.2 拆为 §4.2a + §4.2b、§9.7 新增 PR 2a 验收 | PR 1 ✅ merged(commit `9b8e91f` + PR #250);Robert 选 PR 2 拆分选项 B(2a + 2b) |
| 2026-05-25 | **v2.4 PR 2a 启动期间的契约 / 代码失配微修**:(1) §4.2a 把 `scripts/modules/render.js` 改为 `scripts/app.js`(实际 render orchestrator 在 app.js 不在 render.js);(2) §4.2a 加 `scripts/modules/buildCrossValidationMatrix.js` 精确 1 行 export 改动(因 `classifyZScoreBucket` 在 v2.1-v2.3 假设 export 但实际未 export);(3) §0.3 放宽 buildCrossValidationMatrix.js 约束为"只允许追加 export 一行";(4) §9.7 边界验收 7 文件 → 8 文件 | Codex 在 PR 2a 阶段 1 基线检查期间严格按 §4.3 铁律 + §2.6.1 铁律执行,在动文件前直读源码确认 2 个契约假设错误,**没有产生坏 commit**。Claude 直读源码 100% 确认。工作区干净,可直接换 v2.4 重启 PR 2a |
| 2026-05-25 | **v2.5 PR 2a 阶段 4 cache version bump 项目惯例发现**:(1) §0.3 加新硬约束"禁止手动编辑 cache version 字面量,必须用 bump helper";(2) §4.2a `scripts/app.js` 行去掉手动 cache bump 描述,改为引用 §4.2a.1;(3) §4.2a `index.html` 行去掉手动 cache bump 描述,改为引用 §4.2a.1;(4) §4.2a 后新增 §4.2a.1 "Cache version bump 实施步骤(项目惯例)",详细说明 `npm run bump:frontend-asset-version 28.0M-94` helper 同步 8 固定文件 + scripts/modules/*.js 全部,共 25 个潜在文件,实际 git diff 8-13 个;(5) §9.7 边界验收 8 文件 → 13-17 文件(A 组 8 个功能改动 + B 组 5-9 个 bump helper 同步);(6) §9.7 加 review 命令清单 | Codex 在 PR 2a 阶段 4 第三次停下报告 — `scripts/check-workflows.mjs:263` 硬编码 `frontendAssetVersion = '28.0M-93AV'` 强制全 frontend asset 文件 cache version 一致,Codex 改动 app.js / index.html 后 `check:workflows` 失败但不能改 check-workflows.mjs(超出 v2.4 §9.7 允许)。Claude 读 `scripts/bump-frontend-asset-version.mjs` 源码后发现项目早就有官方 helper,fixedFiles 数组列了 8 个文件 + listModuleFiles 扫所有 modules。**契约 v2.1-v2.4 完全错过这条惯例,根因是 Claude 没读 bump helper 源码**。Robert 选方案 C(契约 v2.5 + 用 bump helper) |

---

**契约 v2.5 结束。**

下一步:
1. Robert 审阅本契约 v2.5(主要看顶部"v2.4 → v2.5 关键变更"导读段 + §0.3 / §4.2a / §4.2a.1 / §9.7 这 5 节)
2. 把 v2.5 替换覆盖仓库中的 `docs/M94_V0_DATA_CONTRACT.md`,**仍在 `m94-v23-pr2a` 分支上 commit**(因为 PR 2a 实施还在进行中,工作区可能有未 commit 的 app.js / index.html 改动 — 这些改动需要先 revert,因为新流程用 bump helper 而不是手动改)
3. **PR 2a 阶段 4 重做**:Codex 先 `git checkout -- scripts/app.js index.html`(撤销手动 cache bump 改动),然后:
   a. 在 `scripts/app.js` 加新 import,**用 OLD cache version `?v=28.0M-93AV`**(让全文件保持一致)
   b. 加 `renderThematicCards(...)` 调用到 marketPricingMetricsPromise.then 内
   c. `npm run check:all` 应该绿(所有文件仍是 `28.0M-93AV`,一致)
   d. 跑 `npm run bump:frontend-asset-version 28.0M-94`
   e. helper 输出列出被改的文件
   f. `npm run check:all` 必须绿(全部同步到 `28.0M-94`)
   g. `git status` 看实际 diff 文件清单,贴给 Claude review
4. Codex 继续阶段 5-9(styles.css 主题卡 selector → 8 主题块逐个填卡 → 字段消费完整性自查 → 完成 check-thematic-cards-contract.mjs assert → 视觉对照 + commit + push)
5. Claude review 远程 diff(对照 §9.7 v2.5 版 A 组 + B 组清单)
6. Robert 在 GitHub web review 后 merge PR 2a
7. PR 2a merge 后,开新分支 `m94-v25-pr2b`,开 PR 2b(按 §4.2b 改动清单)
8. Codex 实施 PR 2b 严格按 §8.1-§8.8 + Codex 第三轮警告(`buildMacroDrivers` 616 行保留全部字段消费)
9. PR 2b 验收按 §9.1-§9.5 清单
10. PR 2b merge 后 M-94 完成度 100%,开 M-95 接入 P1 占位卡片真实数据
11. (可选)M-CLEANUP-1:checker 退役清扫(82 → 35-45 个),按 Robert 问及 checker 数量过多的讨论结果安排
