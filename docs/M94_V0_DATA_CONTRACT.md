# M-94 V0 — Data Consumption Contract v3.1

> **STATUS (2026-06):** This file **remains the authority** for the M-94 data-consumption contract (JSON fields → frontend display) and the mock v2.1 visual baseline. But its body also retains **PR 2b / Path C implementation-period language** — acceptance checklists, 不动清单, and module / checker / renderer references — and **any such reference that conflicts with the current tree is historical implementation residue, not a current instruction.** In particular, `#plain-summary-card` / `renderPlainSummary.js` / `check-plain-summary-card-contract.mjs` were **retired** across the M-94 V0 Path C cleanup/rebuild path after this v3.1 contract was written (`check-plain-summary-card-contract.mjs` deleted in `5eff6ab` stage 1; `renderPlainSummary.js` in `c8229574` stage 2; `#plain-summary-card` DOM removed in `91d06f3d`) — **retired, not pending** — so in-body lines such as "plain summary 完全保留 / 已稳定 / `check:plain-summary-card-contract` / `git diff … renderPlainSummary.js 必须为 0` / 不动 plain-summary-card assertion" are stale. (The orphaned `assets/styles.css .plain-summary-section` CSS is tracked as a separate frontend cleanup.)

> **Status**: V0 Draft v3.1 (PR 2b ✅ merged + 路径 C 启动 — Mock v2.1 成为唯一权威视觉基准)
> **PR 路径**: PR 1 ✅ merged · PR 2a ✅ merged · PR 2b ✅ merged · PR 2c = **路径 C 前台从零重写(7 stages,详见 docs/m94-v0/M94_V0_FRONTEND_REBUILD_PLAN.md)**
> **Scope**: 前端展示 only · 不动 scoring / decision / execution / position / Worker / data pipeline / JSON 生产结构
> **Approach**: Mock 视觉 = 不变契约。任何当前实现与 mock 冲突,以 mock 为准。
> **Visual Reference**: `manual-artifacts/m94-v0/m94-v0-FINAL-mock-v2.html` (v2.1, 121.05 KB) — 自 PR 2c 起,本文件取代 v1 mock 作为唯一视觉权威基准
> **Date**: 2026-05-25

---

## §0.5 路径 C 序列说明(2026-05-26 新增)

PR 2b 把 mock 8 runtime block + 8 主题卡阵注入了新 section,但旧 `<body>` 一行没动,导致两套 IA 同时渲染。Robert 决定走**路径 C**:前台从零重写 + 后台一行不动。

### 路径 C 与本契约的关系

- 本契约(M94_V0_DATA_CONTRACT.md)定义**数据消费契约**(JSON 字段 → 前端展示),保持有效
- 路径 C 的 7-stages 实施计划在 `docs/m94-v0/M94_V0_FRONTEND_REBUILD_PLAN.md`
- 视觉权威基准从 `mock v1`(91.59 KB)升级为 `mock v2.1`(121.05 KB):
  - 主路径(masthead / plain summary / 8 runtime block / 8 主题卡阵 / 6 cells heatmap)= v1 完全保留
  - 附录区(5 details)= v2 重写为报纸式叙事(完整保留原有数据消费,只改外观)
  - 5 details 默认折叠态 = v2.1 新增硬约束

### 路径 C 不动清单(后台)

本契约定义的所有数据生产 / 算法 / pipeline / Worker 部分**全部不动**。具体清单:
- `data/*.json` 全部
- `scripts/run-daily-pipeline.mjs` / `run-realtime.mjs` / `build-world-order-stress.mjs` / `write-external-ai-production-data.mjs` / `validate-data.mjs`
- `scripts/market-pricing/*` / `scripts/world-order/*` / `scripts/external-ai/*`
- `workers/` 全部
- `.github/workflows/` 全部
- `scripts/modules/buildCrossValidationMatrix.js`(算法保留,渲染壳重写)
- `scripts/modules/displayStatusThresholds.js` / `health.js` / `decision.js` / `realtime.js` / `freshness.js` / `config.js` / `format.js`

### 路径 C 删除清单(前端)

详见 `docs/m94-v0/M94_V0_FRONTEND_REBUILD_PLAN.md` §1.2 与 §3。

### 折叠态硬约束(2026-05-26 Robert 新增)

mock v2.1 的 5 个 appendix `<details class="editorial-folded-content">` 元素**全部不带 `open` 属性**,初始为收起状态。Stage 3 落地 `index.html` 时必须保持此约束,Stage 6 写专门 checker 拦截违规。

详见 DESIGN.md v2 §5.4。

## v2.5 → v3.0 关键变更(给读过 v2.5 的人快速过)

PR 2a merge 进 main 后(commit `ec5b462` "M94 v23 pr2a (#252)"),Claude 在 PR 2b 启动前做了完整侦察,发现 5 个**契约 v2.5 与代码现状的严重失配**:

### 失配 1 — 8 个 runtime block 视觉 **已经全部用 editorial-* 体系 render**,不是契约 v2.5 §8 描述的"工程术语堆积"

**契约 v2.5 假设**(§8):
> "重写 8 个 build 函数的 HTML 生成部分(按 §8.1-§8.8 详细指引)。`buildMacroDrivers`(616 行)+ `buildPressureSources`(160 行)+ `buildRiskEngines`(256 行)是重点。"

**真实代码状态**(`renderMacroOverview.js` 3375 行 / 186KB):
- `renderMacroRiskOverview` 入口(line 3215-3375)已经按 `editorial-*` 体系 render 8 runtime block
- styles.css 已定义 165 个 editorial-* selector,JS 使用 133 个,覆盖率 100%
- 前 5 个 milestone(M-92A / M-93 / M-54 / M-55a / M-55b)已经完成了 editorial-* 视觉重写
- **当前每张卡是"密集 dossier"**:每张 `editorial-pressure-card / -signal-card / -driver-card / -engine-card / -validation-card` 含 strip + head + badge + main + explanation + 5 sublist(evidence / coverageNotes / missingEvidence / counterEvidence / noiseWarning)+ footer(confidence / coverage / source / updatedAt)

**根因**:Claude 写 v2.5 时凭旧印象描述 §8 "需重写视觉",没意识到前面 5 个 milestone 已经做过视觉重写。

### 失配 2 — Mock 的视觉**比当前实现更轻量**,方向相反

**Mock 设计**(91KB / 1631 行):
- `runtime-block` + `mini-grid` 6 张 mini-card(label + num + 一行 status,无 sublist 无 footer)
- `runtime-block` + `narrative-list`(emoji + name + score + 1 段说明)
- `runtime-block` + `consistency-block`(bar + 一句话)
- `editorial-big-number` 2 列 hero + 阈值尺 + 8 周 SVG 趋势

**结论**:Mock 是 "Bubble Watch 报纸轻量风格",当前代码是"政策研究报告密集 dossier 风格"。两者不兼容。

### 失配 3 — `index.html` `<head><style>` 块 506 行 inline style + 47 处硬编码色值 + 36 个 `.macro-overview-*` selector 当前仍在,**Mock 完全不用 `.macro-overview-*`**

### 失配 4 — Today Judgment 6 格视觉(M-92A 引入)与 mock 的 `editorial-big-number` 2 列 hero 视觉**不兼容**

`check-today-summary-card-contract.mjs` 锁的是 M-92A 的 6 格视觉(score-trend / overall-judgment / data-health / top-risks / noise-divergence / state-conclusion),与 mock 的 hero 完全是两套视觉。

### 失配 5 — 字段消费现状远超 mock

当前 build function 装配的字段大部分在 mock 里不显示。如果按"保留所有字段消费"原则,会出现"代码读 100 个字段,UI 显示 30 个"的浪费。

---

### Robert 决策(2026-05-25 拍板)

**Robert 原话**:
> "我就要 mock 网站的效果,完全推翻以前的样子,完全按昨天你生成的 mock 网页的效果来,就是我的不变目标。"
>
> "你说这些细节我无法理解,昨天的 mock 网页的视觉呈现,和各个分页数据显示和逻辑我都非常满意。就严格按照 mock 怎么展示的,最终落地就要一样效果就完事了。"

**含义**:Mock = 视觉与字段消费的双重最终契约。任何当前实现与 mock 冲突时,以 mock 为准。

### v3.0 据此做的 8 项重大调整

| # | 调整项 | 调整方向 | 影响章节 |
|---|---|---|---|
| 1 | Today Judgment Hero | 推翻 M-92A 6 格视觉,改为 mock 的 `editorial-big-number` 2 列 + 阈值尺 + 8 周 SVG | §4.2b / §8.1 |
| 2 | `check-today-summary-card-contract.mjs` | 重写 enforcement,锁 mock 的 editorial-big-number 视觉 | §4.2b / §8.1 |
| 3 | 8 runtime block 视觉 | 全面采用 mock 的 runtime-block + mini-grid / narrative-list / consistency-block 风格 | §4.2b / §8.2-§8.8 |
| 4 | 现有 editorial-* 视觉体系 | 删除 `editorial-pressure-card / -signal-card / -driver-card / -engine-card / -validation-card` 及其 sublist / footer / category-counts 体系 | §4.2b / §8 |
| 5 | append-editorial-* helper | 全部废弃,改写为 mock 风格新 helper | §4.2b / §8 |
| 6 | 字段消费策略 | **Mock 显示什么,build function 装配什么。不显示的字段从 build function 删除装配代码** | §4.2b / §8 |
| 7 | `index.html` `<head><style>` | 全部清理 — 506 行 inline style + 47 处硬编码 + 36 个 `.macro-overview-*` 删除 | §4.2b |
| 8 | 受影响的 checker | `check-today-summary-card-contract.mjs` / `check-editorial-redesign-contract.mjs` / `check-frontend-visual-m54/m55a/m55b.mjs` 全部按 mock 重写 enforcement | §4.2b / §9.1 |

### 范围量级

| 维度 | 数字 |
|---|---|
| 改动文件数 | ~12 个 |
| `renderMacroOverview.js` 改动 | 3375 行 → ~1500 行(净 -1875 行) |
| `assets/styles.css` 改动 | 净 -800 行(删 165 旧 selector + 加 50 新 selector) |
| `index.html` `<head><style>` 块 | -506 行(全删) |
| Checker 改动 | 5 个 |
| Cache version | `28.0M-94` → `28.0M-95`(用 bump helper) |
| 推翻的 milestone 视觉 | M-92A / M-93 / M-54 / M-55a / M-55b |
| 总代码净删 | ~3200 行 + 大量 HTML/CSS 结构重写 |
| 实施 stage 数 | 12 个(每 stage 改 1 个 block + 跑 check:all) |

### 风险等级:🔴 项目自启动以来最大规模 PR

**对照风险管控措施**:
- §4.3 铁律 3:每 stage 必须独立跑 `check:all`,不绿就停
- §0.4 加新铁律 6:"Mock = 不变契约,任何当前实现与 mock 冲突以 mock 为准,Codex 不许凭印象偏离"
- §9.2 加新验收项:**Codex 完成所有 stage 后用本地浏览器打开 index.html 对照 mock 视觉,每个 block 截图同位置比较**

---

## v2.4 → v2.5 关键变更(给读过 v2.4 的人快速过)

PR 2a 进入阶段 4(`scripts/app.js` import + cache version bump)期间,Codex 严格按契约 v2.4 §9.7 边界验收 + §2.6.1 铁律 1 + §4.3 铁律 3 执行,**第三次在动文件前停下报告**。这次发现的不是契约假设错误,而是契约范围错误 — cache version bump 在项目里是 **13+ 文件同步动作**,远超 v2.4 §9.7 列的 8 文件。

[v2.5 完整内容沿用 v2.5 原文]

详见 §0.3 / §4.2a.1 / §9.7 三节。

---

## v2.3 → v2.4 关键变更(给读过 v2.3 的人快速过)

PR 2a 启动阶段 1 基线检查期间,Codex 按契约 §4.3 铁律 3 + §2.6.1 铁律 1 严格执行,发现 **2 个契约 v2.3 假设错误**,在动文件前停下报告。

1. `classifyZScoreBucket` 没被 export → §4.2a 加 1 行 export 改动
2. Render 主流程在 `scripts/app.js` 不在 `scripts/modules/render.js` → §4.2a 把 render.js 改为 app.js

详见 §4.2a / §0.3。

---

## v2.2 → v2.3 关键变更(给读过 v2.2 的人快速过)

PR 1 实际执行用了 4 轮 Codex 迭代才收敛,**4 轮全部被"停 → 报告 → 授权 → 继续"工作流接住**,没有产生坏 commit,但暴露契约 4 个真实缺陷,v2.3 全部修复:

| 缺陷 | v2.3 修复位置 |
|---|---|
| 1. §2.6 字面量同步表只列 2 个 IA-enforcement checker,漏第 3 个 | §2.6 表格增加;§2.6.1 新增 grep 铁律 |
| 2. PR 1 让 mock 入库的 `.gitignore` 改动撞坏 checker regex | §0.3 加 `.gitignore` 单行约束 |
| 3. 契约 v2.1 让 PR 1 改 IA checker 但不改 index.html → checker 必挂 | v2.2 已通过 §2.7 + §4.1 PR 1 范围扩大解决 |
| 4. PR 拆分粒度不够细 — PR 2 把"thematic cards 填充"与"8 runtime block 视觉重写"绑在一起 | §4.2 拆分为 §4.2a + §4.2b |

新增 3 条方法论铁律(§2.6.1 / §2.8 / §4.3)。

---

## v2.1 → v2.2 关键变更

v2.1 的 PR 1 范围设计有"先有鸡还是先有蛋"陷阱(改 IA checker 但不改 index.html),v2.2 把 PR 1 范围**扩到包含 `index.html` nav + 空 section 容器骨架**。详见 §4.1。

---

## 与 v2 相比的关键变更

v2 是 Codex 第三轮审核后的字段精校版。Codex 6 段审核结论 100% 消化。

**5 个硬错误已修正**:
1. `data.modules.geopolitical` 是扁平数字,不是 `.score` 子字段
2. NDX vs SPX 30 日相对强弱无现成数据,改为 NDX 60w z-score(决策 C)
3. `privateCreditProxy` 6-proxy z-score 数据不足,降级为 8 字段直显(决策 B)
4. `warningSystem + triggerPanel` 不是 MacroOverview 观察清单数据源
5. checker 字面量同步遗漏:5 处"14 项"硬编码必须改"15 项"

**Visual Reference 锁定**:Robert 已对 `m94-v0-FINAL-mock.html` 完成视觉确认。任何与该 mock 不一致的实施都视为契约违反。**v3.0 把此原则上升为铁律 6**。

---

## 文档读者

本文档面向 4 类执行者:

1. **Codex / Cursor / AI 实施者** — 看 §4 / §6 / §7 / §8 知道改哪些文件;遵守 §0.4 铁律 6
2. **Robert(项目运营者)** — 看 §0 / §1 / §2 知道 M-94 做什么
3. **审核 PR 的人** — 看 §9 知道怎么验收
4. **未来想扩展数据接入的 milestone** — 看 §3 / §5 知道占位接口在哪

---

## §0 M-94 任务定义(锁死,不再讨论)

### §0.1 目标一句话

**让 index.html 首页渲染按 mock(`manual-artifacts/m94-v0/m94-v0-FINAL-mock.html`)1:1 落地,把 renderMacroOverview.js 的输出从当前"密集 dossier"重写为 mock 的"轻量 mini-grid",并完成 #macro-thematic-cards 主题卡阵填充。**

**PR 拆分**:M-94 用 3 个 PR 实施:

- **PR 1** ✅ merged:契约文档 + DESIGN.md + 3 个 IA checker + `index.html` nav 第 15 项 + 空 `#macro-thematic-cards` section 容器骨架。
- **PR 2a** ✅ merged(commit `ec5b462`):`renderThematicCards.js` 新建 + `displayStatusThresholds.js` 新建 + `check-thematic-cards-contract.mjs` 新建 + `assets/styles.css` 加主题卡 selector + `scripts/app.js` 引入 module + cache version bump 到 `28.0M-94`。
- **PR 2b**:`renderMacroOverview.js` 8 个 build function 完全重写(按 mock 严格 1:1)+ `assets/styles.css` 删旧 editorial-* selector + 加 mock selector + `index.html` `<head><style>` 块 506 行整段删除 + 5 个 checker 重写 enforcement + cache version bump 到 `28.0M-95`。

### §0.2 路径选择(已锁)

采用 **Path C**:保留原 IA 8 个 runtime block,新增 1 个 `#macro-thematic-cards` section。IA 从 14 项扩为 15 项。视觉层全面按 mock 落地。

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
| 改 `.gitignore` 内 `manual-artifacts/` 字面量写法 | `check-market-pricing-network-open-throttled-scaffold.mjs` regex 要求单独成行 |
| 改 `scripts/modules/buildCrossValidationMatrix.js` 任何函数 / 任何算法 | 项目核心一致性矩阵算法,不动(PR 2a 已追加 1 行 export,此后不再动) |
| **手动编辑任何 cache version 字面量** | 必须用 `npm run bump:frontend-asset-version <new-version>` helper |
| **改 `scripts/modules/decision.js / realtime.js / renderPlainSummary.js / renderExternalAi.js / health.js / freshness.js / renderThematicCards.js / displayStatusThresholds.js`**(v3.0 强化) | 项目宪法 + 已稳定模块 |
| **改 `scripts/check-thematic-cards-contract.mjs`**(v3.0 新增) | PR 2a 已 merged,不动 |

### §0.3.1 PR 2b 特殊不动项

| 文件 | 理由 |
|---|---|
| `index.html` nav 区 | 已 PR 1 落地 |
| `index.html` body 主体 section 容器(`#macro-risk-overview / #macro-thematic-cards / #global-risk-heatmap` 等) | 已 PR 1 落地,只动其 inner |
| `index.html` `#macro-thematic-cards` section header / mount 锚点 | PR 2a 已 merged 不动 |
| `scripts/check-workflows.mjs` 业务逻辑 | 仅允许 cache bump helper 同步 `frontendAssetVersion` 常量值 |
| `--paper-* / --risk-* / --font-*` token | 保留全部 token 体系 |
| Google Fonts CDN link | 保留 Playfair Display / Noto Serif SC / IBM Plex Mono 三家族 |
| `package.json` `dependencies` / `devDependencies` | 不动 |

### §0.3.2 PR 2b 允许动但严格限制的项

| 文件 | 允许的改动 | 严禁 |
|---|---|---|
| `scripts/check-today-summary-card-contract.mjs` | 整体重写 enforcement 为锁 mock 的 editorial-big-number 视觉 + 阈值尺 + 8 周 SVG | 不许保留 M-92A 6 格视觉的任何 assertion |
| `scripts/check-editorial-redesign-contract.mjs` | 删除当前锁的 `editorial-pressure-card / -signal-card / -driver-card / -engine-card / -validation-card` enforcement;新增锁 mock 的 `runtime-block / mini-card / narrative-item / consistency-block / wow-item` enforcement | 不许保留任何旧 editorial-* 卡片 assertion;不许动与 `#macro-thematic-cards` / `plain-summary-card` 相关的 assertion |
| `scripts/check-frontend-visual-m54.mjs / m55a.mjs / m55b.mjs` | 重写 enforcement 为锁 mock 视觉 | 不许保留旧视觉 assertion |
| `index.html` `<head><style>` 块 | **整块删除**(从 `<style>` 到 `</style>`)| 任何样式都用 `assets/styles.css` |
| `assets/styles.css` | 删除 165 个 editorial-* 旧 selector + 加 50 个 mock 新 selector | 不许动 `.reader-cat-block / .indicator-card / .badge / .agg-rows` 等 PR 2a 已落地 selector |

### §0.4 Mock 是不变契约 — PR 2b 铁律 6(v3.0 新增)

**铁律 6**:任何当前代码实现与 mock(`manual-artifacts/m94-v0/m94-v0-FINAL-mock.html`)冲突时,以 mock 为准。Codex 在实施 PR 2b 时:

- 不许凭"代码现状很好"偏离 mock
- 不许凭"保留所有字段消费"理由抗拒 mock 的精简
- 不许凭"M-92A 已稳定"理由保留与 mock 冲突的 6 格视觉
- 不许凭"editorial-* 体系完备"理由保留与 mock 冲突的卡片
- 遇到任何模棱两可,直接打开 mock 文件相应 line 看,不臆测

**Codex 验证步骤**:
- 每改一个 block 之后,本地打开 `index.html` 看渲染效果
- 对照 mock 同位置(本地打开 `manual-artifacts/m94-v0/m94-v0-FINAL-mock.html`)
- 视觉不一致就停 → 报告 Robert + Claude → 等授权

---

## §1 字段消费基准表(基于真实 radar-data.json schema)

[§1 全文沿用 v2.5,详细字段表见 v2.5 原文 §1.1-§1.10]

### 重要变更(v3.0)

- §1.x 字段定义保留,但 v3.0 **按 mock 决定哪些字段进 UI**,不进 UI 的字段不再要求 build function 装配。
- 详见 §8.x 各 block 的"字段消费裁剪"段。

---

## §2 IA 变更范围(精确锁死)

[§2 全文沿用 v2.5。15 项 jump nav / staticRequiredIds / expectedOrder / 3 IA-enforcement checker / 字面量同步表 / §2.6.1 grep 铁律 / §2.7 容器骨架已 PR 1 落地 / §2.8 enforcement-implementation 同 PR 铁律]

---

## §3 8 大主题卡片清单与字段映射

[§3.1-§3.8 全文沿用 v2.5。8 主题 38 卡 + agg-rows + intro 段。PR 2a 已 merged 落地]

---

## §4 文件改动清单

### §4.1 PR 1(已 merged,commit `9b8e91f` + PR #250)

[沿用 v2.5 原文]

### §4.2a PR 2a(已 merged,commit `ec5b462` + PR #252)

[沿用 v2.5 原文]

### §4.2a.1 Cache version bump 实施步骤(v2.5 — 项目惯例)

[沿用 v2.5 原文。helper:`npm run bump:frontend-asset-version <version>` 同步 8 固定文件 + 全部 modules]

### §4.2b PR 2b:Mock 视觉 1:1 落地(v3.0 完全重写)

**目标**:把 `#macro-risk-overview` 内 8 个 runtime block 的视觉与字段消费**严格对齐到 mock**。推翻当前 editorial-* 密集 dossier 实现,落地 mock 的 runtime-block + mini-grid + narrative-list + consistency-block 轻量风格。同步清理 `index.html` `<head><style>` 块 506 行 inline style。

**新增文件**:无。

**修改文件(12 个)**:

#### A 组 — 核心实施(7 个)

| 文件 | 改动 | 边界 |
|---|---|---|
| `scripts/modules/renderMacroOverview.js` | 完整重写 8 个 build function + `renderMacroRiskOverview` 入口 + 8 个新 append helper。废弃所有 editorial-* 旧 helper。详见 §8.1-§8.8 | 不动 line 1-200 的 formatter 常量;不动 `buildMacroOverview` 出参签名;不动 `classifyZScoreBucket` export(被 thematic-cards 用) |
| `assets/styles.css` | 删除 165 个 editorial-* 旧 selector;新增 50 个 mock selector(`.runtime-block / .runtime-block-header / .runtime-block-body / .mini-grid / .mini-card / .mini-card.red/.yellow/.green / .narrative-list / .narrative-item / .narrative-item.active / .narrative-item .head / .emoji / .name / .score / .consistency-block / .consistency-bar / .consistency-bar-wrap / .consistency-bar .fill / .consistency-label / .consistency-value / .consistency-detail / .threshold-block / .threshold-header / .threshold-bar / .threshold-bar-wrap / .threshold-bar .zone / .zone.t-green/.t-yellow/.t-orange/.t-red / .zone-label / .zone-pct / .threshold-bar .marker / .threshold-bar .marker.override / .marker-label / .trend-block / .trend-block-header / .trend-svg-wrap / .editorial-big-number / .big-left / .big-right / .big-footer / .big-left .label / .big-left .value / .big-left .breakdown / .big-right .verdict-kicker / .big-right h2 / .big-right p / .big-footer .k / .big-footer .v / .wow-section / .wow-grid / .wow-item / .wow-tag / .wow-tag.is-up/.is-down/.is-flat / .wow-text / .wow-source / .wow-label`) | 不动 `.reader-cat-block / .indicator-card / .badge / .agg-rows / .cat-intro / .card-grid` 等 PR 2a 已落地的 selector;不动 `--paper-* / --risk-* / --font-*` token |
| `index.html` `<head><style>` 块 | **整块删除**(从 `<style>` 标签到 `</style>` 标签,共 506 行) | 不动 nav / body 主体 section 容器 |
| `scripts/check-today-summary-card-contract.mjs` | 重写 enforcement:锁 mock 的 editorial-big-number 视觉(`#homepage-today-judgment.editorial-big-number` 存在 + `.big-left .value` 含 score + `.big-right h2` 含 verdict + `.big-footer` 含 3 列 DOMINANT RISK CHAIN / WEEKLY CHANGE / DATA HEALTH);删除所有 today-summary-grid / today-summary-cell / today-summary-* 6 格 assertion;新增 enforcement 锁 `.threshold-block` 和 `.trend-block` 存在 | 不许保留任何 M-92A 6 格视觉 assertion |
| `scripts/check-editorial-redesign-contract.mjs` | 删除当前锁 `editorial-pressure-card / -signal-card / -driver-card / -engine-card / -validation-card / -sublist / -footer / -category-counts / -count-pill` 的所有 enforcement;新增锁 `.runtime-block / .mini-card / .narrative-item / .consistency-block` 的 enforcement | 不动 `requiredMarkers` 数组中与 `#macro-thematic-cards` / `plain-summary-card` 相关的项 |
| `scripts/check-frontend-visual-m54.mjs` | 重写 enforcement:删除当前锁 NARRATIVE_EMOJI 在 `editorial-signal-card` 内的 assertion;新增锁 NARRATIVE_EMOJI 在 mock `.narrative-item .emoji` 内 | NARRATIVE_EMOJI 常量本身保留 |
| `scripts/check-frontend-visual-m55a.mjs / m55b.mjs` | 按照 mock 视觉重写 enforcement(具体 assertion 在实施 stage 时根据 mock 对应位置确定) | 不动 checker 文件之外的逻辑 |

#### B 组 — Cache version bump helper 自动同步(~5-9 个)

跑 `npm run bump:frontend-asset-version 28.0M-95` 后由 helper 同步:

| 文件 | helper 改动 |
|---|---|
| `scripts/check-workflows.mjs` | `frontendAssetVersion` 常量值 `28.0M-94 → 28.0M-95`(允许的唯一改动) |
| `index.html` | `?v=28.0M-94 → ?v=28.0M-95` 同步 |
| `scripts/app.js` | `?v=28.0M-94 → ?v=28.0M-95` + `__GFRR_FRONTEND_VERSION__` 常量 |
| `scripts/modules/*.js` 中含 `?v=28.0M-94` 字面量的文件 | 同步 |
| `README.md / AGENTS.md / docs/OPERATIONS.md / docs/DATA_CONTRACT.md / workers/gfrr-realtime-worker/README.md` | 文档内 cache version 字面量 |

#### PR 2b 不动文件(铁律)

| 文件 | 理由 |
|---|---|
| `scripts/modules/decision.js / realtime.js / buildCrossValidationMatrix.js` | 项目宪法 |
| `scripts/modules/renderPlainSummary.js / renderExternalAi.js / health.js / freshness.js` | 已稳定 |
| `scripts/modules/renderThematicCards.js / displayStatusThresholds.js` | PR 2a 已 merged |
| `scripts/check-thematic-cards-contract.mjs` | PR 2a 已 merged |
| `data/*.json` / `workers/*` / `.github/workflows/*` | 项目宪法 |
| `DESIGN.md / .gitignore` | 已稳定 |
| `package.json` | PR 2b 不新增 script(可能减少 1 个 — 若 cross-validation-education-appendix checker 被废弃) |
| `index.html` nav 区 / `#macro-thematic-cards` section / mount 锚点 | PR 2a 已 merged |

### §4.2b.1 Cache version bump(PR 2b 实施)

**新 cache version = `28.0M-95`**(PR 2a 是 `28.0M-94`,PR 2b bump 到 `28.0M-95`)。

**实施步骤**:
1. 完成 §4.2b A 组 7 个文件的核心改动(stage 1-11)
2. 跑 `npm run check:all`,全绿
3. 跑 `npm run bump:frontend-asset-version 28.0M-95`
4. 跑 `npm run check:all`,全绿
5. `git status` 看 B 组实际 diff 文件清单
6. commit + push

**Codex 实施 §4.2b.1 时禁止做**(与 §4.2a.1 相同):
- ❌ 手动 grep 替换 `?v=28.0M-94 → 28.0M-95`
- ❌ 手动改 `scripts/check-workflows.mjs` 的 `frontendAssetVersion` 常量
- ❌ 手动改文档中的 cache version

### §4.3 方法论铁律 1-5(沿用 v2.5)

- **铁律 1 §2.6.1**:实施前预飞 grep — Codex 改任何 enforcement / 字面量前,先 `Select-String -Path "scripts\check-*.mjs" -Pattern "<关键词>"` 找全锁了相关字面量的 checker
- **铁律 2 §2.8**:Enforcement 与 implementation 必须同 PR 落地
- **铁律 3 §4.3**:大改动(>200 行)分阶段验证 — 每改 1 个文件 / 1 个 build 函数,跑 `npm run check:all`,不绿就停
- **铁律 4 §4.2a.1**:Cache version bump 必须用 helper,禁止手动
- **铁律 5 §0.3**:任何 PR 都必须遵守不做范围清单

**新增铁律 6**(v3.0):见 §0.4 "Mock 是不变契约"。

---

## §5 数据消费充分性审计

[§5 全文沿用 v2.5。42 个 radar-data 顶层字段中,18 个进入 M-94 主路径]

---

## §6 Codex 第三轮审核已解决问题

[§6 / §6.1 / §6.2 全文沿用 v2.5]

---

## §7 卡片密度规范

[§7.1-§7.4 全文沿用 v2.5。三档密度 / agg-rows 视觉规范 / note 写作准则 / 主题级 intro 段。PR 2a 已落地]

---

## §8 8 runtime block 实施指引(v3.0 完全重写)

> 本节给 Codex 实施 `renderMacroOverview.js` + 5 个 checker 改动时的精确指引。**Mock = 不变契约**。每个 block 含 4 部分:Mock 设计引用 / 当前代码 before / 目标代码 after / 字段消费裁剪。

### §8.1 #homepage-today-judgment(Hero · editorial-big-number + 阈值尺 + 8 周趋势)

#### Mock 设计(对照 `manual-artifacts/m94-v0/m94-v0-FINAL-mock.html` line ~625-720)

```html
<!-- HERO (homepage-today-judgment) -->
<article class="editorial-big-number" id="homepage-today-judgment">
  <div class="big-left">
    <div class="label">TODAY JUDGMENT · 今日总判断</div>
    <div>
      <div class="value">56<sup>/100</sup></div>
      <div class="breakdown">
        6 底层模块中 <strong>2 红 / 2 黄 / 2 绿</strong><br/>
        World Order overlay: 70(升档提示)
      </div>
    </div>
  </div>
  <div class="big-right">
    <div class="verdict-kicker">THIS ISSUE · 滞胀冲击 / 通胀冲击</div>
    <h2>今日主线是能源 → 通胀 → 利率压力;最大背离为能源定价背离观察。</h2>
    <p>原始 56 落在 40–60 高风险预警带。World Order overlay 70 触发橙色升档指针。
      HY OAS 仍在 4% 以下、VIX 16.8 没有同步恐慌,判读保持观察语气而非危机定性。</p>
  </div>
  <div class="big-footer">
    <div><div class="k">DOMINANT RISK CHAIN</div><div class="v">能源 → 通胀 → 利率压力</div></div>
    <div><div class="k">WEEKLY CHANGE</div><div class="v">+2 (WoW)</div></div>
    <div><div class="k">DATA HEALTH</div><div class="v">23/23 OK · 数据正常</div></div>
  </div>
</article>

<!-- 阈值尺 + 8 周趋势 -->
<div class="threshold-block">
  <div class="threshold-header">
    <h4>触发阈值标尺 <em>· Threshold Scale</em></h4>
    <div class="now">原始 56(高风险预警) · overlay 升档 → 系统性顶部带</div>
  </div>
  <div class="threshold-bar-wrap">
    <div class="threshold-bar">
      <div class="zone t-green"  style="flex:25"><span class="zone-label">观察期</span><span class="zone-pct">0–25</span></div>
      <div class="zone t-yellow" style="flex:15"><span class="zone-label">中度警戒</span><span class="zone-pct">25–40</span></div>
      <div class="zone t-orange" style="flex:20"><span class="zone-label">高风险预警</span><span class="zone-pct">40–60</span></div>
      <div class="zone t-red"    style="flex:40"><span class="zone-label">系统性顶部</span><span class="zone-pct">≥60</span></div>
      <div class="marker" style="left:56%"><span class="marker-label">原始 56</span></div>
      <div class="marker override" style="left:80%"><span class="marker-label">overlay 70</span></div>
    </div>
  </div>
</div>
<div class="trend-block">
  <div class="trend-block-header">
    <h4>8 周趋势 <em>· 8-Week Trend</em></h4>
    [图例]
  </div>
  <div class="trend-svg-wrap">
    <svg viewBox="0 0 800 200">[轴线 + 阈值线 + 2 条 polyline + W-7 / W-5 / W-3 / W-1 / NOW 标签]</svg>
  </div>
</div>
```

#### 当前代码 before(line 3220-3286 in renderMacroOverview.js)

```js
const today = appendSection(container, '今日总判断', 'macro-overview-hero editorial-first-fold', 'homepage-today-judgment');
appendText(today, 'p', 'editorial-risk-overline', 'GLOBAL RISK SCORE / SYSTEMIC RISK STAGE');
const summaryGrid = document.createElement('div');
summaryGrid.className = 'today-summary-grid';

const scoreTrend = document.createElement('article');
scoreTrend.className = 'today-summary-cell today-summary-score';
// ... 6 cell 的渲染(score-trend / overall-judgment / data-health / top-risks / noise-divergence / state-conclusion)
```

#### 目标代码 after

```js
// in renderMacroRiskOverview 入口
const today = document.createElement('article');
today.className = 'editorial-big-number';
today.id = 'homepage-today-judgment';
container.appendChild(today);
appendEditorialBigNumber(today, overview.today);

const thresholdBlock = document.createElement('div');
thresholdBlock.className = 'threshold-block';
container.appendChild(thresholdBlock);
appendThresholdBlock(thresholdBlock, overview.today);

const trendBlock = document.createElement('div');
trendBlock.className = 'trend-block';
container.appendChild(trendBlock);
appendTrendBlock(trendBlock, overview.today, data);
```

新 helper:`appendEditorialBigNumber(root, today)` / `appendThresholdBlock(root, today)` / `appendTrendBlock(root, today, data)`。

#### 字段消费裁剪(buildTodayJudgment 89 行 → ~50 行)

**Mock 用到的字段**(保留):
- `data.score`(big-left .value)
- `data.modules` 6 子的 RED/YELLOW/GREEN 计数(big-left .breakdown)— **新增派生函数 `buildModuleColorCounts(data)`**
- `worldOrderStress.score`(breakdown 内 "World Order overlay: 70(升档提示)")
- `data.currentCrisisPhase` 或 `dailyBrief.macroState`(big-right .verdict-kicker "THIS ISSUE · ...")
- `data.dailyBrief.oneLineConclusion`(big-right h2)
- 1 段 verdict body(派生 1 句话:落入哪一带 + 主反证)— **新增派生函数 `buildVerdictBody(today)`**
- `dailyBrief.dominantRiskChain.labelZh`(big-footer DOMINANT RISK CHAIN)
- `data.scoreChange7d`(big-footer WEEKLY CHANGE,格式 "+2 (WoW)")
- `healthDashboard.score` + 总源数(big-footer DATA HEALTH,格式 "23/23 OK · 数据正常" 或 "降级 / 数据正常")

**8 周趋势 SVG 数据**:
- 8 周 score 历史值:从 `data.history.scores`(若有)派生最近 8 周;否则 `data.timeDimension`;否则用 `data.score` + `data.scoreChange1d/7d/30d` 单点反推近似(标"近似派生")
- 8 周 overlay 历史值:从 `worldOrderStress.history.scores`(若有)派生

**阈值尺数据**:
- 当前 score 位置百分比(原始 56 / 100)
- overlay 位置(若 World Order overlay >= 60 显示)

**当前 buildTodayJudgment 装配但 mock 不用的(删除)**:
- `topRisks`(给 today-summary 6 格用,删)
- `noiseDivergences`(同上,删)
- `dataHealth.tone / dataHealth.updates`(简化为单字符串)
- `stateConclusion`(`pressureRising / marginalRelief / ...` 8 个 phrase,删)
- `evidenceStrength`(删)
- `TODAY_SUMMARY_STATE_PHRASES` 常量(删)
- `buildTodayTopRisks / buildTodayNoiseDivergences / buildTodayDataHealth / selectTodayStateConclusion / formatTodayEvidenceLine / compactSummaryText` 全部删
- `evidenceStrengthFromConfidence / hasPartialWorldOrder` 等只被 today 用的 helper — 检查别处是否用,只 today 用就删

**Codex 警告级**:🔴 极高 — 推翻 M-92A 6 格视觉,改 `check-today-summary-card-contract.mjs` checker

#### Checker 改动 — `scripts/check-today-summary-card-contract.mjs`

**删除**:所有 `today-summary-grid / today-summary-cell / today-summary-label / today-summary-score / today-summary-overall / today-summary-health / today-summary-risks / today-summary-noise / today-summary-state` 相关 assertion

**新增**:
- `#homepage-today-judgment.editorial-big-number` 存在
- `.editorial-big-number .big-left .value` 存在 + 含数字
- `.editorial-big-number .big-left .breakdown` 存在 + 含 "红 / 黄 / 绿" 字样
- `.editorial-big-number .big-right .verdict-kicker` 存在
- `.editorial-big-number .big-right h2` 存在
- `.editorial-big-number .big-footer` 含 3 个 .k/.v 列(DOMINANT RISK CHAIN / WEEKLY CHANGE / DATA HEALTH)
- 同级 `.threshold-block` 存在 + 含 `.threshold-bar` + 4 个 `.zone` (t-green / t-yellow / t-orange / t-red)
- 同级 `.trend-block` 存在 + 含 `.trend-svg-wrap svg`

---

### §8.2 #homepage-pressure-sources(runtime-block + mini-grid 6 卡)

#### Mock 设计(对照 mock line ~750-770)

```html
<div class="runtime-block" id="homepage-pressure-sources">
  <div class="runtime-block-header">
    <h3>压力来源 <span class="en">PRESSURE SOURCES</span></h3>
    <div class="meta">六大底层模块 · data.modules 扁平数字 · data.moduleTrends 趋势</div>
  </div>
  <div class="mini-grid">
    <div class="mini-card red"><div class="label">Energy 能源</div><div class="num">82</div><div class="status">↑ 能源传导主线</div></div>
    <div class="mini-card red"><div class="label">Geopolitical 地缘</div><div class="num">78</div><div class="status">↑ multi_theater</div></div>
    <div class="mini-card yellow"><div class="label">Inflation 通胀</div><div class="num">52</div><div class="status">→ 横盘观察</div></div>
    <div class="mini-card yellow"><div class="label">Liquidity 流动性</div><div class="num">48</div><div class="status">↑ 边际收紧</div></div>
    <div class="mini-card green"><div class="label">Debt 债务</div><div class="num">31</div><div class="status">→ 杠杆稳定</div></div>
    <div class="mini-card green"><div class="label">Banking 银行</div><div class="num">29</div><div class="status">↓ 持续改善</div></div>
  </div>
</div>
```

#### 目标代码 after

```js
const pressure = appendRuntimeBlock(container, 'homepage-pressure-sources', '压力来源', 'PRESSURE SOURCES', '六大底层模块 · data.modules 扁平数字 · data.moduleTrends 趋势');
appendMiniGrid(pressure, overview.pressures);  // 渲染 6 mini-card
```

新 helper:
- `appendRuntimeBlock(root, id, titleZh, titleEn, meta) → bodyElement`
- `appendMiniGrid(bodyRoot, items)` → 渲染 mini-grid 容器 + N 张 mini-card
- `appendMiniCard(gridRoot, { label, num, status, tone })` 其中 tone ∈ {red, yellow, green}

#### 字段消费裁剪(buildPressureSources 162 行 → ~50 行)

**Mock 用到的字段**(保留):
- 6 张 mini card:label(中英双语 `Energy 能源`)+ num(0-100 扁平数字)+ status(箭头 + 短文字)
- 数据源:`data.modules.{energy, geopolitical, inflation, liquidity, debt, banking}` 6 扁平数字 + `data.moduleTrends.{energy, geopolitical, ...}` 6 趋势符号

**tone 派生规则**:score >= 70 → red,50 <= score < 70 → yellow,score < 50 → green

**status 文字派生规则**:趋势符号(`↑` / `↓` / `→`)+ 主要驱动短描述(从 `dailyBrief.dominantRiskChain` 或派生),简化为不超过 12 个中文字符

**当前 buildPressureSources 装配但 mock 不用的(删除)**:
- 6 类 judgment 的 evidence list、coverageNotes、missingEvidence、counterEvidence、noiseWarning 全部删
- explanation / sourceType / updatedAt / priority / dataCoverage / confidence 全部删
- `buildPressureCategorySummary / buildPressureCounts / appendPressureCountPill / pressureStatusClass / appendEditorialPressureCard / appendEditorialPressureSublist` 全部删

**buildPressureSources 改写后返回**:
```js
[
  { id: 'energy',       label: 'Energy 能源',       num: 82, status: '↑ 能源传导主线',  tone: 'red' },
  { id: 'geopolitical', label: 'Geopolitical 地缘', num: 78, status: '↑ multi_theater', tone: 'red' },
  { id: 'inflation',    label: 'Inflation 通胀',    num: 52, status: '→ 横盘观察',      tone: 'yellow' },
  { id: 'liquidity',    label: 'Liquidity 流动性',  num: 48, status: '↑ 边际收紧',      tone: 'yellow' },
  { id: 'debt',         label: 'Debt 债务',         num: 31, status: '→ 杠杆稳定',      tone: 'green' },
  { id: 'banking',      label: 'Banking 银行',      num: 29, status: '↓ 持续改善',      tone: 'green' },
]
```

**Codex 警告级**:🟡 中

#### Checker 改动 — `scripts/check-editorial-redesign-contract.mjs`

**删除**:`editorial-pressure-* / editorial-pressure-card / editorial-pressure-grid / editorial-pressure-sublist` 相关 assertion

**新增**:
- `#homepage-pressure-sources.runtime-block` 存在
- `.runtime-block-header h3` 含 "压力来源"
- `.runtime-block-header .en` 含 "PRESSURE SOURCES"
- `.mini-grid` 存在 + `.mini-card` 数量 = 6
- 每张 mini-card 含 `.label / .num / .status`
- mini-card.red/.yellow/.green 三态都出现

---

### §8.3 #homepage-signal-layers(runtime-block + narrative-list)

#### Mock 设计

```html
<div class="runtime-block" id="homepage-signal-layers">
  <div class="runtime-block-header">
    <h3>信号分层 <span class="en">SIGNAL LAYERS · 7 NARRATIVES</span></h3>
    <div class="meta">7 个 active narratives 中:3 active / 4 latent · NARRATIVE_EMOJI 映射</div>
  </div>
  <div class="narrative-list">
    <div class="narrative-item active">
      <div class="head"><span class="emoji">⚡</span><span class="name">energy_shock 能源冲击</span><span class="score">score 78 · ACTIVE</span></div>
      <p>Brent + crack spread 同步走阔,2022 模式重演。下一节是是否传导至 CPI / breakeven。</p>
    </div>
    [... 7 个 narrative-item 总共,3 个 .active + 4 个 latent]
  </div>
</div>
```

#### 目标代码 after

```js
const signals = appendRuntimeBlock(container, 'homepage-signal-layers', '信号分层', 'SIGNAL LAYERS · 7 NARRATIVES', deriveSignalMeta(overview.signalLayers));
appendNarrativeList(signals, overview.signalLayers);
```

新 helper:`appendNarrativeList(root, items)` + `appendNarrativeItem(listRoot, { key, name, score, body, isActive })`

#### 字段消费裁剪(buildSignalLayers 108 行 → ~50 行)

**Mock 用到的字段**(保留):
- 7 个 narrative-item:emoji(从 NARRATIVE_EMOJI 映射,已存在 line 30-38)+ name(中英双语)+ score + ACTIVE/LATENT + 1 段说明
- isActive 派生规则:score >= 50 → active

**删除**:evidence list / coverageNotes / missingEvidence / counterEvidence / noiseWarning(5 sublist)+ buildSignalCategorySummary / buildSignalCounts / signalStatusClass / signalBucketLabel / appendEditorialSignalCard / appendEditorialSignalSublist 全部删

**Codex 警告级**:🟡 中

#### Checker 改动 — `check-editorial-redesign-contract.mjs` + `check-frontend-visual-m54.mjs`

**新增**:
- `#homepage-signal-layers.runtime-block` 存在
- `.narrative-list` 存在 + `.narrative-item` 数量 = 7
- NARRATIVE_EMOJI 7 个全部出现(`⚡⚖️📉🔥💰💧🌐` 各至少 1 次,出现在 `.narrative-item .emoji` 内)

---

### §8.4 #homepage-macro-drivers(runtime-block + 4 列 pillar + 子模块列表行)

#### Mock 设计

```html
<div class="runtime-block" id="homepage-macro-drivers">
  <div class="runtime-block-header">
    <h3>四大驱动 <span class="en">MACRO DRIVERS · 13 SUB-MODULES IN 4 PILLARS</span></h3>
    <div class="meta">...</div>
  </div>
  <div class="runtime-block-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
    <div>
      <strong>Fed Liquidity</strong>
      <p>三层均无压力。WALCL / reserveBalances 3.62T / repo BGCR-SOFR +2bp / SOFR-EFFR 锚定。</p>
    </div>
    <div>[Policy Expectations]</div>
    <div>[Curve]</div>
    <div>[Credit]</div>
    <div style="grid-column:1/-1;border-top:1px dashed #aaa;">
      子模块完整列表:fedLiquidity / policyExpectations / curve / credit / consumer / shippingFreight / employment / consumerRetail / commercialRealEstate / privateCreditProxy / activeSignals / gatingEvaluation
    </div>
  </div>
</div>
```

#### 目标代码 after

```js
const drivers = appendRuntimeBlock(container, 'homepage-macro-drivers', '四大驱动', 'MACRO DRIVERS · 13 SUB-MODULES IN 4 PILLARS', '...meta...');
appendDriverPillarGrid(drivers, overview.drivers4Pillars);
```

新 helper:`appendDriverPillarGrid(root, { fed, policy, curve, credit, subModuleListText })`

#### 字段消费裁剪(buildMacroDrivers 618 行 → ~80-100 行)

**Mock 用到的字段**(保留):
- 4 列 pillar,每列:label + 1 段总结(派生 1 句话 ~30-50 字)
  - **Fed Liquidity**:从 `macroDrivers.fedLiquidity` 派生
  - **Policy Expectations**:从 `macroDrivers.policyExpectations.futureMinusTargetMid` 派生
  - **Curve**:从 `macroDrivers.curve.{t10y2y, regime}` 派生
  - **Credit**:从 `macroDrivers.credit.{hyOas, igOas, nfci, sloosTighteningMax}` 派生
- 底部 dashed border 一行:13 子模块名拼接成 mono 字体一行

**buildMacroDrivers 改写后返回**:
```js
{
  fed: { label: 'Fed Liquidity', sentence: '...' },
  policy: { label: 'Policy Expectations', sentence: '...' },
  curve: { label: 'Curve', sentence: '...' },
  credit: { label: 'Credit', sentence: '...' },
  subModuleListText: '子模块完整列表:fedLiquidity / policyExpectations / curve / credit / consumer / shippingFreight / employment / consumerRetail / commercialRealEstate / privateCreditProxy / activeSignals / gatingEvaluation',
}
```

**删除**:13 子模块的 evidence / coverageNotes / missingEvidence / counterEvidence / noiseWarning 详细装配大部分删,仅保留 fedLiquidity / policyExpectations / curve / credit 4 个的 1 句话总结派生。其他 9 子模块的详细 judgment 装配代码全部删。`buildDriverCategorySummary / driverTypeClass / driverStatusClass / driverTypeLabel / findDriverByType / appendDriverTypePill / appendEditorialDriverSublist / appendEditorialDriverCard` 全部删

**关键说明**:9 个被裁掉的子模块**在 `#macro-thematic-cards` section 已经用 indicator-card 完整展示**(PR 2a 已 merged)。所以字段消费在主题卡阵保留,runtime block 主区精简不损失数据展示。

**Codex 警告级**:🔴 高 — 项目最大 build function,删除最多代码

#### Checker 改动 — `check-editorial-redesign-contract.mjs`

**新增**:
- `#homepage-macro-drivers.runtime-block` 存在
- `.runtime-block-header .en` 含 "MACRO DRIVERS · 13 SUB-MODULES IN 4 PILLARS"
- `.runtime-block-body` 含 4 个 `<div>` 内 `<strong>` 标签,标签文字 = Fed Liquidity / Policy Expectations / Curve / Credit
- 末尾 `<div>` 含 `子模块完整列表:` 字样

---

### §8.5 #homepage-market-temperature(runtime-block + 2 列布局)

#### Mock 设计

```html
<div class="runtime-block" id="homepage-market-temperature">
  <div class="runtime-block-header">
    <h3>市场温度 <span class="en">MARKET PRICING TEMPERATURE</span></h3>
    <div class="meta">QQQ 60 周均值 + z-score · NDX/IXIC 广度对照 · 本数据为统计描述,不构成投资建议</div>
  </div>
  <div class="runtime-block-body">
    <div style="display:grid;grid-template-columns:auto 1fr;gap:24px;">
      <div>
        <div>极度过热 · extreme-hot</div>
        <div style="font-size:48px;font-weight:900;color:var(--risk-yellow);">+2.18σ</div>
        <div>QQQ vs 60 周均值 · 历史第二极端</div>
      </div>
      <div>
        <p>QQQ 当前价格距 60 周均值 2.18 个标准差,处于历史第二极端区间。NDX +2.22σ / IXIC +1.92σ,整个美国成长股板块同步极端。</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
          <div>close: $708.93</div>
          <div>ma60: $579.84</div>
          <div>stdDev60: $59.23</div>
          <div>zScoreRange: [-2.64, +2.83]</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

#### 目标代码 after

```js
const temp = appendRuntimeBlock(
  container,
  'homepage-market-temperature',
  '市场温度',
  'MARKET PRICING TEMPERATURE',
  'QQQ 60 周均值 + z-score · NDX/IXIC 广度对照 · 本数据为统计描述,不构成投资建议'
);
appendMarketTemperatureBody(temp, overview.marketTemperature, marketPricingMetricsData);
```

新 helper:`appendMarketTemperatureBody(root, judgment, metricsData)`

**等待状态处理**:若 `marketPricingMetricsData` 缺失或 records 为空 → 显示 "等待历史周线数据接入"(必须包含此 checker 锁定文本)+ "本数据为统计描述,不构成投资建议。"

#### 字段消费裁剪(helper 体系 1015 行 → ~400 行)

**Mock 用到的字段**(保留):
- bucket label(`极度过热 / 显著偏热 / 中性区间 / 显著偏冷 / 极度偏冷`)
- σ 数字 = QQQ 60 周 z-score 当前值
- 描述句 = `MARKET_TEMPERATURE_BUCKETS[bucket].interpretation(distance)` 派生
- NDX/IXIC σ 值 = `getAuxiliaryMarketPricingContexts(metricsData)` 派生
- 4 字段 mono 网格 = close / ma60 / stdDev60 / zScoreRange
- 必须包含的 checker 锁定文本:`等待历史周线数据接入` / `本数据为统计描述,不构成投资建议。` / `60 周均值` / `z-score` / `QQQ`

**保留的 helper**(继续使用,核心算法不动):
- `classifyZScoreBucket` / `MARKET_TEMPERATURE_BUCKETS` / `getMarketTemperatureBucketInfo` / `getMarketPricingMetricContext` / `getAuxiliaryMarketPricingContexts` / `getAssetMetricContext` / `getMetricRecords` / `getZScoreRange` / `isValidMetricRecord` / `formatSignedDecimal` / `formatCurrency` / `MARKET_TEMPERATURE_WAITING_STATUS` 常量 / `MARKET_TEMPERATURE_DISCLAIMER` 常量 / `AUXILIARY_MARKET_LABELS` 常量

**删除**:`appendMarketTemperatureChecklist / appendMarketTemperatureDisabledScale / appendAuxiliaryMarketTemperatureCard / appendAuxiliaryMarketTemperature / appendMetricValue / appendEditorialMarketTemperature / buildMarketTemperatureSummary`

**保留但 export 给其他 module 用的 helper**:`renderMarketTemperatureCard / renderMarketTemperatureWaitingState`(可能被 main.js 直接调,保留 export 但内部改用新风格)

**Codex 警告级**:🟡 中

#### Checker 改动 — `check-editorial-redesign-contract.mjs` + `check-market-pricing-temperature-display-activated.mjs`

**新增**:
- `#homepage-market-temperature.runtime-block` 存在
- `.runtime-block-header h3` 含 "市场温度"
- `.runtime-block-header .meta` 含 "本数据为统计描述,不构成投资建议" + "60 周均值" + "z-score"

`check-market-pricing-temperature-display-activated.mjs` 保留对 5 bucket label / 等待文本 / QQQ / 60 周均值 / z-score 的 assertion。

---

### §8.6 #homepage-risk-engines(runtime-block + mini-grid 6 卡)

#### Mock 设计

```html
<div class="runtime-block" id="homepage-risk-engines">
  <div class="runtime-block-header">
    <h3>风险引擎 <span class="en">RISK ENGINES · 6 ENGINES + AUXILIARY</span></h3>
    <div class="meta">data.modules 6 引擎 + divergenceLayer + privateCreditProxy + worldOrderStress + marketTemperature 等多源派生</div>
  </div>
  <div class="mini-grid">
    <div class="mini-card red"><div class="label">B1 Energy</div><div class="num">RED</div><div class="status">能源冲击主导</div></div>
    <div class="mini-card yellow"><div class="label">B2 Liquidity</div><div class="num">YEL</div><div class="status">流动性边际收紧</div></div>
    <div class="mini-card green"><div class="label">B3 Credit</div><div class="num">GRN</div><div class="status">信用反向证据</div></div>
    <div class="mini-card green"><div class="label">B4 Debt</div><div class="num">GRN</div><div class="status">杠杆稳定</div></div>
    <div class="mini-card yellow"><div class="label">B5 Consumer</div><div class="num">YEL</div><div class="status">实际工资压制</div></div>
    <div class="mini-card red"><div class="label">B6 Geopolitical</div><div class="num">RED</div><div class="status">multi_theater</div></div>
  </div>
</div>
```

#### 目标代码 after

```js
const engines = appendRuntimeBlock(container, 'homepage-risk-engines', '风险引擎', 'RISK ENGINES · 6 ENGINES + AUXILIARY', '...meta...');
appendMiniGrid(engines, overview.riskEngines);  // 复用 §8.2 的 appendMiniGrid
```

#### 字段消费裁剪(buildRiskEngines 258 行 → ~60-80 行)

**Mock 用到的字段**(保留):
- 6 张 mini card,每张:label(`B1 Energy` 等)+ num(RED/YEL/GRN 文本)+ status(短描述)
- tone 派生规则:RED → red,YEL → yellow,GRN → green

**buildRiskEngines 改写后返回**:
```js
[
  { id: 'B1', label: 'B1 Energy',       num: 'RED', status: '能源冲击主导',     tone: 'red' },
  { id: 'B2', label: 'B2 Liquidity',    num: 'YEL', status: '流动性边际收紧',   tone: 'yellow' },
  { id: 'B3', label: 'B3 Credit',       num: 'GRN', status: '信用反向证据',     tone: 'green' },
  { id: 'B4', label: 'B4 Debt',         num: 'GRN', status: '杠杆稳定',         tone: 'green' },
  { id: 'B5', label: 'B5 Consumer',     num: 'YEL', status: '实际工资压制',     tone: 'yellow' },
  { id: 'B6', label: 'B6 Geopolitical', num: 'RED', status: 'multi_theater',    tone: 'red' },
]
```

**多源派生 status 文字规则**:优先用 `data.modules[engineKey]` 配套的 `dailyBrief.dominantRiskChain.evidence[0].summaryZh`(短截);否则用 `divergenceLayer.checks` 中匹配 engineKey 的 summaryZh;否则通用 fallback。长度 ≤ 12 中文字符。

**删除**:6 引擎的 evidence / coverageNotes / missingEvidence / counterEvidence / noiseWarning 全部删;多源派生的详细 evidence 装配(divergenceLayer / privateCreditProxy / worldOrderStress / marketTemperature)— 仅保留 status 派生需要的最小字段读取;`buildEngineCategorySummary / engineTypeClass / engineStatusClass / engineTypeLabel / buildEngineCounts / appendEngineCountPill / appendEditorialEngineSublist / appendEditorialEngineCard` 全部删

**Codex 警告级**:🟡 中

#### Checker 改动 — `check-editorial-redesign-contract.mjs`

**新增**:
- `#homepage-risk-engines.runtime-block` 存在
- `.runtime-block-header h3` 含 "风险引擎"
- `.runtime-block-header .en` 含 "RISK ENGINES · 6 ENGINES + AUXILIARY"
- `.mini-grid` 存在 + `.mini-card` 数量 = 6
- 6 个 label 必须含 `B1 Energy / B2 Liquidity / B3 Credit / B4 Debt / B5 Consumer / B6 Geopolitical`

---

### §8.7 #homepage-cross-validation(runtime-block + consistency-block)

#### Mock 设计

```html
<div class="runtime-block" id="homepage-cross-validation">
  <div class="runtime-block-header">
    <h3>交叉验证 <span class="en">CROSS VALIDATION MATRIX</span></h3>
    <div class="meta">buildCrossValidationMatrix() · narratives + consistencyScore + oneLineSummary</div>
  </div>
  <div class="consistency-block">
    <div class="consistency-label">一致性 / Consistency</div>
    <div class="consistency-bar-wrap">
      <div class="consistency-bar"><div class="fill"></div></div>
    </div>
    <div class="consistency-value">72<span>/100</span></div>
    <div class="consistency-detail">
      5 strong_confirmation / 2 contradiction / 1 insufficient_data<br/>
      能源 + 通胀 + Fed 路径同向支持;HY OAS + VIX 提供反向证据。
    </div>
  </div>
</div>
```

#### 目标代码 after

```js
const cross = appendRuntimeBlock(container, 'homepage-cross-validation', '交叉验证', 'CROSS VALIDATION MATRIX', '...meta...');
appendConsistencyBlock(cross, overview.crossValidationMatrix);
```

新 helper:`appendConsistencyBlock(root, matrix)`

#### 字段消费裁剪

**Mock 用到的字段**(保留):
- `consistencyScore`(0-100,bar fill width + 数字)
- assessments 计数(`5 strong_confirmation / 2 contradiction / 1 insufficient_data`)— 从 `narratives.map(n => n.assessment)` 统计派生
- `oneLineSummary`(详细第二行)

**算法不动**:`buildCrossValidationMatrix(data)` 在 `scripts/modules/buildCrossValidationMatrix.js`,项目宪法不动

**删除**:N 个 narrative 的详细装配为 `editorial-validation-card` 全部删;`appendCrossValidationEducationAppendix`(教育 appendix,87 行)**整段删除**;`validationStatusClass / validationTypeLabel / buildValidationCounts / buildValidationCategorySummary / appendValidationCountPill / appendEditorialValidationSublist / appendEditorialValidationEvidenceItems / appendEditorialValidationCard / formatStructuredEvidenceItem / appendCrossValidationEducationParagraph / appendCrossValidationEducationList / appendCrossValidationEducationSection` 全部删

**保留**:`buildCrossValidation` 8 行 facade + `buildCrossValidationMatrix` 算法 + `ASSESSMENT_LABELS` 常量

**Codex 警告级**:🟡 中

#### Checker 改动 — `check-editorial-redesign-contract.mjs` + 检查 `check-cross-validation-education-appendix.mjs`(若存在)

**新增**:
- `#homepage-cross-validation.runtime-block` 存在
- `.consistency-block` 存在 + `.consistency-bar .fill`(width 百分比)+ `.consistency-value`(含数字)+ `.consistency-detail`(含 oneLineSummary)

**`check-cross-validation-education-appendix.mjs`** — 若此 checker 存在,**从 `package.json` 删除对应 npm script,且删除 checker 文件本身**。

⚠️ Codex 实施时必须先 `Select-String -Path "scripts\check-*.mjs" -Pattern "cross-validation-education"` 确认。

---

### §8.8 #wow-key-changes(wow-section + wow-grid + wow-item)

#### Mock 设计

```html
<section class="wow-section" id="wow-key-changes">
  <div class="wow-label">本期关键变化 · Week-over-Week</div>
  <h3>能源链加压,信用反向证据,地缘 overlay 升档 <em>· this issue's deltas</em></h3>
  <div class="wow-grid">
    <div class="wow-item">
      <span class="wow-tag is-up">▲ 风险升高 · 通胀与能源</span>
      <div class="wow-text">Brent 周内 +6.2,crack spread 同步走阔到 48.37。<span class="wow-source">brentPricingLayer.crackSpread4wChange +19.87</span></div>
    </div>
    [... 6 个 wow-item 共,3 个 is-up + 2 个 is-down + 1 个 is-flat]
  </div>
</section>
```

#### 目标代码 after

```js
appendWowSection(container, overview.keyChanges, overview.dailyBriefHeadline);
```

新 helper:`appendWowSection(root, items, headline)`

#### 字段消费裁剪(buildKeyChanges 58 行 → ~40 行;buildWatchList 完全删除)

**Mock 用到的字段**(保留):
- N 个 wow-item:tag(▲/▼/━ 前缀 + 风险方向 + 类别)+ text(WoW 描述句)+ source(字段路径)
- headline 派生:从 `dailyBrief.oneLineConclusion` 简化或派生

**删除**:
- `appendEditorialKeyChanges`(整段重写为新 `appendWowSection`)
- `editorial-category-kicker` / `editorial-category-summary` 段(mock wow-section 不需要)
- `editorial-section-body wow-body` 容器
- `wow-key-changes-root` 锚点(若不被外部 module 引用则删,需 grep 确认)

**Watch List 完全删除**:
- `buildWatchList`(line 2009-2052,44 行)— **整段删除**
- `appendEditorialWatchList`(line 3189-3214,26 行)— **整段删除**
- `watchItem`(line 2005-2008)— 整段删除
- `collectMissingEvidence`(line 2001-2004)— 若仅被 watchList 用,整段删除;若别处用则保留
- 在 `renderMacroRiskOverview` 入口删除最后一行 `appendEditorialWatchList(container, buildWatchList(overview, data));`

**理由**:Mock 不显示 `editorial-watch-list`。Watch List 的内容在 `#macro-thematic-cards` 主题卡阵已通过 indicator-card 展示,不再需要独立 watch list section。

**Codex 警告级**:🟢 低

#### Checker 改动 — `check-editorial-redesign-contract.mjs`

**删除**:`editorial-watch-list / editorial-watch-grid / editorial-watch-icon / editorial-watch-item / editorial-watch-item-title / editorial-watch-item-desc / editorial-watch-item-meta / editorial-watch-kicker / editorial-watch-title / editorial-watch-summary / editorial-wow-category` 相关 assertion

**新增**:
- `#wow-key-changes.wow-section` 存在
- `.wow-label` 含 "本期关键变化 · Week-over-Week"
- `<h3>` 含 `<em>` 子元素
- `.wow-grid` 存在 + `.wow-item` 数量 ≥ 4
- `.wow-tag.is-up / .wow-tag.is-down / .wow-tag.is-flat` 三态都出现
- 每个 wow-item 含 `.wow-text` + `.wow-source`

---

## §9 验收清单(PR 2b 合并条件)

### §9.1 必须全绿的检查(PR 2b 收口合并)

```
npm run check:all
npm run check:homepage-ia-contract
npm run check:editorial-redesign-contract           ← 已重写
npm run check:plain-summary-card-contract
npm run check:thematic-cards-contract
npm run check:today-summary-card-contract            ← 已重写
npm run check:market-pricing-temperature-display-activated
npm run check:market-pricing-network-open-throttled-scaffold
npm run check:mobile-first-fold-compaction           ← 可能需要重写
npm run check:frontend-visual-m54                    ← 已重写
npm run check:frontend-visual-m55a                   ← 已重写
npm run check:frontend-visual-m55b                   ← 已重写
```

⚠️ **`check-mobile-first-fold-compaction.mjs`**:Codex 实施前必须 grep 确认此 checker 是否锁定 today-summary-grid 或 macro-overview-* 字面量;若锁定,必须按 mock 重写。

### §9.2 视觉验收 — 与 mock 1:1 对齐

**铁律 6 验证**(§0.4):Codex 完成所有 stage 后,本地浏览器打开 `index.html`,与 `manual-artifacts/m94-v0/m94-v0-FINAL-mock.html` 同位置截图做对比。

**视觉对照清单**(逐 block):

1. **Today Judgment**:
   - editorial-big-number 2 列布局(big-left 大数字 + big-right verdict)
   - 深墨底反白文字
   - big-footer 3 列(DOMINANT RISK CHAIN / WEEKLY CHANGE / DATA HEALTH)
   - 同级 threshold-block 含 4 zone(green/yellow/orange/red)+ 2 marker
   - 同级 trend-block 含 SVG(8 周折线 + 3 阈值线 + W-7/W-5/W-3/W-1/NOW 标签)
2. **Pressure Sources**:runtime-block + mini-grid 6 卡
3. **Signal Layers**:runtime-block + narrative-list 7 条
4. **Macro Drivers**:runtime-block + 4 列 pillar + 底部 dashed border 一行子模块列表
5. **Market Temperature**:runtime-block + 2 列(左 bucket + σ + 副文,右 描述句 + 4 字段 mono 网格)
6. **Risk Engines**:runtime-block + mini-grid 6 卡(B1-B6,num 显示 RED/YEL/GRN)
7. **Cross Validation**:runtime-block + consistency-block
8. **WoW Key Changes**:wow-section 深墨反白 + wow-grid N 条(三态 wow-tag)

**视觉验收必须确认**:
- ✅ 主页**已不再出现**任何 `editorial-pressure-card / editorial-signal-card / editorial-driver-card / editorial-engine-card / editorial-validation-card` 卡片
- ✅ 主页**已不再出现**任何 `editorial-category-counts / editorial-count-pill / today-summary-grid / today-summary-cell` 元素
- ✅ 主页**已不再出现**任何 `editorial-watch-list / editorial-watch-item`(全部下沉到主题卡阵)
- ✅ 8 runtime block 视觉与 mock 完全一致
- ✅ index.html 内已**完全删除** `<style>` 块,所有样式来自 `assets/styles.css`

### §9.3 数据消费验收

- 所有指标数字来自 `__effectiveDisplayInputs` 或明示派生路径
- 无任何 `data.values.*` 引用
- buildPressureSources / buildRiskEngines 返回数组每个元素含 `{id, label, num, status, tone}`,**不再含** evidence / coverageNotes / missingEvidence / counterEvidence / noiseWarning
- buildSignalLayers 返回数组每个元素含 `{key, name, score, body, isActive}`,**不再含** 5 sublist
- buildMacroDrivers 返回对象含 `{fed, policy, curve, credit, subModuleListText}`,**不再含** 13 子模块详细 judgment
- buildTodayJudgment 返回对象含 mock 需要的字段,**不再含** topRisks / noiseDivergences / dataHealth.tone / dataHealth.updates / stateConclusion / evidenceStrength
- buildMarketTemperature 返回包含 bucket / σ / 描述句 / 4 字段网格 + 锁定文本
- buildCrossValidation 8 行 facade 不动,buildCrossValidationMatrix 算法不动
- buildKeyChanges 返回 wow-item 数组
- buildWatchList **已删除**,renderMacroRiskOverview 入口**已不再调用**

### §9.4 边界验收

- `git diff --name-only -- data .github/workflows` 必须为空
- `git diff --stat scripts/modules/decision.js` 必须为 0
- `git diff --stat scripts/modules/realtime.js` 必须为 0
- `git diff --stat scripts/modules/buildCrossValidationMatrix.js` 必须为 0
- `git diff --stat scripts/modules/renderPlainSummary.js` 必须为 0
- `git diff --stat scripts/modules/renderExternalAi.js` 必须为 0
- `git diff --stat scripts/modules/health.js` 必须为 0
- `git diff --stat scripts/modules/freshness.js` 必须为 0
- `git diff --stat scripts/modules/renderThematicCards.js` 必须为 0(PR 2a 已稳定)
- `git diff --stat scripts/modules/displayStatusThresholds.js` 必须为 0(PR 2a 已稳定)
- `git diff --stat scripts/check-thematic-cards-contract.mjs` 必须为 0(PR 2a 已稳定)
- `git diff --stat workers/` 必须为 0
- `package.json` `dependencies` / `devDependencies` 数量不变
- `package.json` `scripts` 数量可能减少(若 check:cross-validation-education-appendix 被删则减 1)

### §9.5 PR 描述必须声明

> "本 PR 实施 M-94 V0 PR 2b:Mock 视觉 1:1 落地"
> "本 PR 完全推翻 M-92A / M-93 / M-54 / M-55a / M-55b 几个 milestone 在 today-summary-grid + editorial-* 卡片体系上的视觉成果,以 mock(`manual-artifacts/m94-v0/m94-v0-FINAL-mock.html`)为新视觉契约"
> "本 PR 不改 scoring / decision / execution / position / Worker / data pipeline / JSON 生产结构"
> "本 PR 重写 5 个 checker enforcement:check-today-summary-card-contract.mjs / check-editorial-redesign-contract.mjs / check-frontend-visual-m54.mjs / check-frontend-visual-m55a.mjs / check-frontend-visual-m55b.mjs(可能含 check-mobile-first-fold-compaction.mjs / check-cross-validation-education-appendix.mjs)"
> "字段消费按 mock 决定 — mock 不显示的字段从 build function 删除装配代码"
> "renderMacroOverview.js 净 -1875 行;styles.css 净 -800 行;index.html `<head><style>` 块整段 -506 行"
> "cache version `28.0M-94 → 28.0M-95` 通过 `npm run bump:frontend-asset-version 28.0M-95` helper 同步,未手动改任何 cache version 字面量"
> "符合契约 v3.0 §4.2b + §4.2b.1 + §8.1-§8.8 + §9 + §0.4 铁律 6"
> "实施期间已 grep `Select-String -Path "scripts\check-*.mjs" -Pattern "<关键字段>"` 确认无遗漏 enforcement"
> "实施按 §4.3 铁律 3 + §0.4 铁律 6 分 12 stage 执行,每 stage 跑 npm run check:all,不绿停 + 报告"
> "本地浏览器打开 index.html 对照 mock,8 个 block 逐一视觉一致"
> "`npm run check:all` 通过(贴日志片段)"

### §9.6 PR 1 专属验收(已 merged,仅参考)

[沿用 v2.5 原文]

### §9.7 PR 2a 专属验收(已 merged,仅参考)

[沿用 v2.5 原文]

### §9.8 PR 2b 实施 stage 顺序(v3.0 新增 — 对应 §4.3 铁律 3)

**Stage 0 — 准备工作**:
- Codex 切到新分支 `m94-v25-pr2b`
- `npm run check:all` 确认基线绿
- 用 PowerShell `Select-String -Path "scripts\check-*.mjs" -Pattern "today-summary"` 找全相关 checker
- 同上 grep `editorial-pressure-card / editorial-signal-card / editorial-driver-card / editorial-engine-card / editorial-validation-card / editorial-watch-list / macro-overview- / cross-validation-education`

**Stage 1 — 准备 CSS(新增 mock selector,保留旧 selector)**:
- `assets/styles.css` 末尾追加 50 个 mock 新 selector
- **暂不删除旧 editorial-* selector**(留 Stage 11 删,避免本 stage 改太多)
- `npm run check:all` 必须全绿

**Stage 2 — 改 wow-key-changes(最简单)**:
- `renderMacroOverview.js` 改写 `appendEditorialKeyChanges` 为 `appendWowSection`
- 删除 `buildWatchList` + `appendEditorialWatchList` + 入口 `appendEditorialWatchList(container, ...)` 调用
- `check-editorial-redesign-contract.mjs` 同步删除 editorial-watch-list 相关 assertion + 新增 wow-section 相关
- `npm run check:all` 全绿

**Stage 3 — 改 cross-validation**:
- 改写 render 部分为 `appendConsistencyBlock`,删除 `editorial-validation-card` 渲染 + `appendCrossValidationEducationAppendix` 调用
- 删除大量旧 helper
- `check-editorial-redesign-contract.mjs` 同步
- 若 `check-cross-validation-education-appendix.mjs` 存在,从 `package.json` 删除 npm script + 删除 checker 文件
- `npm run check:all` 全绿

**Stage 4 — 改 market-temperature**:
- 改写 `appendEditorialMarketTemperature` 为 `appendMarketTemperatureBody`
- 删除 `appendMarketTemperatureChecklist / appendMarketTemperatureDisabledScale / appendAuxiliaryMarketTemperature*` 等
- 保留 classifyZScoreBucket / MARKET_TEMPERATURE_BUCKETS / getMarketPricingMetricContext / waiting state 派生
- `check-editorial-redesign-contract.mjs` + `check-market-pricing-temperature-display-activated.mjs` 同步
- `npm run check:all` 全绿

**Stage 5 — 改 pressure-sources**:
- 改写 `buildPressureSources` 大幅精简
- 改写入口的 pressure section render 为 `appendRuntimeBlock + appendMiniGrid`
- 删除相关旧 helper
- `check-editorial-redesign-contract.mjs` 同步
- `npm run check:all` 全绿

**Stage 6 — 改 risk-engines**:
- 改写 `buildRiskEngines` 大幅精简
- 改写入口的 engines section render
- 删除相关旧 helper
- `check-editorial-redesign-contract.mjs` 同步
- `npm run check:all` 全绿

**Stage 7 — 改 signal-layers**:
- 改写 `buildSignalLayers` 精简
- 改写入口的 signals section render 为 `appendRuntimeBlock + appendNarrativeList`
- 删除相关旧 helper
- `check-editorial-redesign-contract.mjs` + `check-frontend-visual-m54.mjs` 同步
- `npm run check:all` 全绿

**Stage 8 — 改 macro-drivers(最危险,项目最大 build function)**:
- 改写 `buildMacroDrivers` **大幅删减**(618 行 → ~80-100 行)
- 改写入口的 drivers section render 为 `appendRuntimeBlock + appendDriverPillarGrid`
- 删除相关旧 helper
- `check-editorial-redesign-contract.mjs` 同步
- `npm run check:all` 全绿

**Stage 9 — 改 today-judgment(推翻 M-92A,高风险)**:
- 改写 `buildTodayJudgment` 精简
- 改写入口的 today section render 为 `appendEditorialBigNumber + appendThresholdBlock + appendTrendBlock`
- 新增 3 个 helper
- 删除 6 格相关 helper + TODAY_SUMMARY_STATE_PHRASES
- **`check-today-summary-card-contract.mjs` 整体重写 enforcement**
- `check-editorial-redesign-contract.mjs` + `check-frontend-visual-m55a.mjs / m55b.mjs` 同步
- 若 `check-mobile-first-fold-compaction.mjs` 锁了 today-summary,同步重写
- `npm run check:all` 全绿

**Stage 10 — 清理 styles.css 旧 editorial-* selector**:
- 删除 165 个不再使用的 editorial-* selector(保留与 `#macro-thematic-cards / plain-summary-card` 相关的不动)
- 用 grep 验证删除后无 selector 被 JS / index.html / 其他 mjs 引用
- `npm run check:all` 全绿

**Stage 11 — 清理 index.html `<head><style>` 块**:
- 整段删除从 `<style>` 标签到 `</style>` 标签的 506 行内容
- 若有任何样式仍被使用,迁移到 `assets/styles.css`
- `npm run check:all` 全绿

**Stage 12 — Cache version bump + 最终验收**:
- 跑 `npm run bump:frontend-asset-version 28.0M-95`
- helper 同步所有文件
- `npm run check:all` 全绿
- 本地浏览器打开 index.html 对照 mock,8 个 block 视觉一致
- commit + push + open PR

---

## §10 与契约 v1 / v2 / v2.1 / v2.2 / v2.3 / v2.4 / v2.5 关键差异

[§10 全文沿用 v2.5,v3.0 列追加]

| 维度 | v2.5 | v3.0 |
|---|---|---|
| 设计原则 | "保留所有字段消费,仅改外壳" | **Mock = 不变契约,mock 不显示就从 build function 删除装配代码** |
| Today Judgment | M-92A 6 格视觉 | mock 的 editorial-big-number 2 列 + 阈值尺 + 8 周 SVG |
| 8 runtime block | 当前 editorial-* 密集 dossier | mock 的 runtime-block + mini-grid / narrative-list / consistency-block |
| editorial-* 旧 helper | 保留 | 全部废弃 |
| index.html `<head><style>` | 不动 | 整块删除(506 行) |
| Checker 改动 | 0 | 5 个重写 + 可能 1 个删除 |
| Cache version | 28.0M-94 | 28.0M-95 |
| 推翻的 milestone 视觉 | 无 | M-92A / M-93 / M-54 / M-55a / M-55b |
| 新增方法论铁律 | 5 | 6(新增铁律 6 "Mock 是不变契约") |
| 代码改动量 | ~600-1500 行 | ~3200 行净删 |
| 风险等级 | 中 | 🔴 项目自启动以来最大 |
| 实施 stage 数 | 12 | 12 |

---

## §11 文档历史

| 日期 | 变更 | 触发事件 |
|---|---|---|
| 2026-05-23 | v1 初稿,53KB,80% 字段虚构 | Robert 启动 M-94 |
| 2026-05-24 | v2 重写,基于直接读取项目源码,5 个 TODO | Codex 2 轮审核 + 5 决策点拍板 + Path C+B 混合选择 + Filesystem 直读权限 |
| 2026-05-24 | v2.1 字段精校,0 TODO,5 硬错误修正,17 处字段补充 | Codex 第三轮代码层审核 + Robert 视觉确认 FINAL mock + 3 决策(CRE / NDX z-score / Private Credit 降级) |
| 2026-05-24 | v2.2 PR 范围修正 | Codex 第四轮 PR 1 实施时识别"先有鸡先有蛋"陷阱 |
| 2026-05-24 | v2.3 整合 PR 1 全部教训 + 拆分 PR 2 为 PR 2a + PR 2b | PR 1 ✅ merged(commit `9b8e91f` + PR #250);Robert 选 PR 2 拆分选项 B |
| 2026-05-25 | v2.4 PR 2a 启动期间的契约 / 代码失配微修 | Codex 在 PR 2a 阶段 1 严格按铁律执行,直读源码确认 2 个契约假设错误 |
| 2026-05-25 | v2.5 PR 2a 阶段 4 cache version bump 项目惯例发现 | Codex 在 PR 2a 阶段 4 第三次停下报告,Claude 读 bump helper 源码后发现项目早就有官方 helper |
| 2026-05-25 | **v3.0 PR 2b 启动前的全面重写 — Mock = 不变契约**:(1) 顶部新增 v2.5 → v3.0 关键变更导读,详述 5 个契约 v2.5 与代码现状的失配;(2) §0.3 新增 §0.3.1 PR 2b 特殊不动项 + §0.3.2 允许动但严格限制项 + §0.4 铁律 6 Mock 是不变契约;(3) §4.2b 完全重写为"Mock 视觉 1:1 落地",改动文件清单 12 个 + cache version `28.0M-95`;(4) §8 完全重写,8 个 block 每个含 mock 设计引用 / 当前代码 before / 目标代码 after / 字段消费裁剪 / checker 改动;(5) §9 完全重写,新增视觉对照清单 + 字段消费验收 + 12 stage 实施顺序 | Claude 在 PR 2b 启动前做完整侦察(读完 mock 1631 行 + renderMacroOverview.js 3375 行 + styles.css 3744 行 + index.html `<head><style>` 506 行),发现 5 个失配:(1) 8 runtime block 视觉已用 editorial-* 体系 render,不是契约 v2.5 §8 描述的"工程术语堆积";(2) mock 比当前实现更轻量,方向相反;(3) index.html `<head><style>` 块 506 行 inline style 在 mock 全不用;(4) M-92A 6 格视觉与 mock editorial-big-number 不兼容;(5) 字段消费现状远超 mock。Robert 选 "完全推翻以前的样子,完全按 mock 落地"。Claude 根据"mock 是不变契约"原则自行拍板 8 项技术决策,推翻 M-92A / M-93 / M-54 / M-55a / M-55b 几个 milestone 的视觉成果,重写 5 个 checker,共 ~3200 行净删 |
| 2026-05-26 | v3.1 / 2026-05-26 / 路径 C 启动,视觉基准升级到 mock v2.1 | PR 2b merged 后,Robert 决定 PR 2c 走路径 C:前台从零重写 + 后台一行不动;新增 §0.5 说明 7-stage 序列、后台不动清单与 5 details 默认折叠硬约束 |

---

**契约 v3.0 结束。**

下一步:
1. Robert 审阅本契约 v3.0(主要看顶部"v2.5 → v3.0 关键变更"导读 + §0.4 铁律 6 + §4.2b + §8.1-§8.8 + §9.8 12 stage)
2. 把 v3.0 commit + push 到 main 分支(PR 2a 已 merged,工作区干净,v3.0 是契约文档单独 commit)
3. 开新分支 `m94-v25-pr2b`
4. Codex 严格按 §9.8 12 stage 执行,每 stage 跑 check:all + 不绿停报告
5. Codex 完成后 Claude review remote diff
6. Robert GitHub web review 后 merge PR 2b
7. PR 2b merge 后 M-94 完成度 100%
8. 开 M-95 接入 P1 占位卡片真实数据
9. (可选)M-CLEANUP-1:checker 退役清扫(82 → 35-45 个)
