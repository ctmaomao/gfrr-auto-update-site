# M-94 V0 路径 C — Frontend Rebuild Plan v1.0

> **Status**: Plan v1.0,Stage 0 已完成,Stage 1 待启动
> **决策日期**: 2026-05-26
> **决策人**: Robert
> **执行模型**: Claude(设计) + Codex(实施) + Robert(本地 QA + merge)
> **视觉权威基准**: `manual-artifacts/m94-v0/m94-v0-FINAL-mock-v2.html` (121.05 KB,简称 "mock v2.1")
> **范围**: 前端展示层(`index.html` + `assets/styles.css` + `scripts/app.js` + 部分 `scripts/modules/*.js` + 9 个 frontend checker)

---

## 1. 背景与路径选择

### 1.1 为什么走路径 C

PR 2b 把 mock 8 runtime block 注入 `#macro-risk-overview`,把 8 主题卡阵注入 `#macro-thematic-cards`,但**没有删除旧 `<body>` 内容**。旧 hero、旧 jump nav、`#homepage-realtime-band` 7 cards、`#world-heatmap` SVG、旧 appendix、旧 footer 全部仍在,与新 mock 内容并存,Robert 浏览器实地访问看到的页面是**两套 IA 同时渲染**的视觉混乱。

PR 2c 尝试 #1 在分支 `m94-v25-pr2c` 上"大范围重写 body + 不动 checker"撞红了 9 个 frontend checker(`check-dom-ids` / `check-homepage-ia-contract` / `check-editorial-redesign-contract` / `check-mobile-first-fold-compaction` / `check-plain-summary-card-contract` / `check-detail-data-dom-containment` / `check-realtime-band-completeness` / `check-frontend-visual-m54.m55a.m55b`)。根因:**这 9 个 checker 都为保护"旧 first-fold + 旧 appendix"存在**,与 mock 1:1 复刻目标根本性冲突。

考虑的 4 个选项:
- **路径 A**:严格 1:1 复刻 mock + 双契约共存(旧前端 + 新前端) → 复杂度爆炸
- **路径 B**:接受 PR 2b 现状 + 微调 → 视觉契约被永久妥协
- **路径 C**:前台从零重写 + 删除 9 个 checker + 后台一行不动 → 干净
- **路径 D**:回退到 PR 2a + 重新设计 → 浪费 PR 2b 工作

Robert 选择**路径 C**。原文:"网站前台在此期间彻底没有也无所谓。因为我这本来就是个人和少数朋友自用的。还没有到正式向外发布的阶段。"

### 1.2 路径 C 的硬边界

**绝对不动**(后台 / 数据 / 业务逻辑):
- `scripts/run-daily-pipeline.mjs` / `run-realtime.mjs` / `build-world-order-stress.mjs` / `write-external-ai-production-data.mjs` / `validate-data.mjs`
- `scripts/market-pricing/*` / `scripts/world-order/*` / `scripts/external-ai/*`
- `workers/` 全部
- `data/*.json` 全部(包括 `radar-data.json` / `market-pricing-metrics.json` / `world-order-stress.json` / `external-ai-production-data.json`)
- `.github/workflows/` 全部
- `package.json` 数据相关 scripts(daily / realtime / world-order / external-ai / validate)
- `scripts/modules/buildCrossValidationMatrix.js`(算法模块)
- `scripts/modules/displayStatusThresholds.js`(阈值分桶 helper)
- `scripts/modules/health.js` / `decision.js` / `realtime.js` / `freshness.js` / `config.js` / `format.js`

**全部可删 / 重写**(前端展示层):
- `index.html`(13.35 KB,旧骨架)
- `assets/styles.css`(旧视觉 token + 旧 IA selector)
- `scripts/app.js`(旧主流程)
- `scripts/modules/render.js`(59.42 KB,旧 renderer)
- `scripts/modules/renderCharts.js` / `renderTables.js` / `renderAudit.js` / `renderPlainSummary.js` / `renderExternalAi.js` / `displayTextBuilders.js`
- `scripts/modules/renderMacroOverview.js`(60.35 KB,PR 2b 重写,本 stage 再次重写)
- `scripts/modules/renderThematicCards.js`(PR 2a 写,本 stage 重写)
- 9 个 frontend checker(详见 §3.2)

**可选保留 / 改造**:
- `scripts/modules/buildCrossValidationMatrix.js` — 算法模块,**保留**;但渲染壳由新 render.js 提供
- `scripts/check-suite.mjs` — 移除 `frontend-visual-history` 套件
- `package.json` 的 `check:*` 系列 — 移除已删 checker 引用

---

## 2. 视觉契约权威基准

### 2.1 唯一基准文件

**`manual-artifacts/m94-v0/m94-v0-FINAL-mock-v2.html`**(121.05 KB,简称 "mock v2.1")。

任何关于"该卡片是什么颜色 / 文字大小多少 / 哪些 ID 应当存在 / 哪个区域默认折叠"的疑问,**都以 mock v2.1 为准**。本计划文档、DESIGN.md v2、M94_V0_DATA_CONTRACT.md v3.1 都是 mock v2.1 的文字描述,**当任何文档与 mock v2.1 冲突时,以 mock v2.1 为准**。

### 2.2 视觉契约关键约束

以下约束在 Stage 3 / Stage 4 / Stage 5 实施时必须严格遵守:

**结构约束**:
1. 全站只有 **1 个 `<header class="masthead">`** + **1 个 `<nav class="dashboard-jump-nav">`(15 项)** + **1 个 `<section class="plain-summary-section" id="plain-summary-card">`**
2. **8 runtime block** 全部包在 `<section class="editorial-section" id="macro-risk-overview">` 的 `<div class="macro-overview-shell">` 内,顺序固定:hero(`#homepage-today-judgment`) → 阈值尺 → 8 周趋势 → `#homepage-pressure-sources` → `#homepage-signal-layers` → `#homepage-macro-drivers` → `#homepage-market-temperature` → `#homepage-risk-engines` → `#homepage-cross-validation` → `#wow-key-changes`
3. **8 主题卡阵** 在 `<section class="editorial-section" id="macro-thematic-cards">`,内含 8 个 `<div class="reader-cat-block">`,每个 block 标题为 C1 通胀与能源 / C2 全球流动性 / C3 信用与企业债 / C4 美国经济温度 / C5 世界经济 / C6 中国宏观 / C7 市场情绪 / C8 地缘与世界秩序,38 个 `<article class="indicator-card">` 总数
4. **6 cells 静态 heatmap** 在 `<section class="editorial-section" id="global-risk-heatmap">`(M-94 阶段静态,M-95+ 接入真实区域算法)
5. **5 个 appendix details** 顺序:`#detail-data` / `#world-order-stress-section` / `#method-evidence` / `#external-ai-auxiliary` / `#execution-risk-detail`
6. **1 个 footer**:`<footer class="method">` 含 method-grid 4 项

**折叠态硬约束(§5.4 of DESIGN.md v2)**:
- 5 个 appendix `<details class="editorial-folded-content">` 元素**全部不带 `open` 属性**
- 初始渲染时全部为收起状态,用户主动点击 `<summary>` 才展开
- **任何把 `open` 属性加进 `index.html` 的改动都视为视觉契约违规,Stage 1-7 必须拦截**
- 这条约束同样适用于将来 M-95+ 的任何 milestone

**禁止反弹的旧 IA 元素**(必须从 index.html 永久消失):
- 旧 `<section id="homepage-realtime-band">`(7 cards `#rt-brent` / `#rt-dxy` / ... + 16 source/delta 子元素)
- 旧 `<section id="world-heatmap">` SVG 投影(由 6 cells 静态 grid 替代)
- 旧 hero / 旧 jump nav 14 项 / 旧 appendix DOM 结构
- 旧 `<style>` 内联块在 `<head>` 中(M94_V0_DATA_CONTRACT.md §I.6 已禁止)

### 2.3 视觉契约执行机制

- **Stage 0(本 stage)**:写文档,把 mock v2.1 设为权威基准
- **Stage 1**:删 9 个失业 checker(它们都在保护旧 IA,与 mock v2.1 冲突)
- **Stage 3**:从零写 `index.html`,逐节对照 mock v2.1
- **Stage 6**:写新 frontend checker(精简版),只保护新 IA 关键合约(主要是 mock v2.1 关键 ID 存在 + 折叠态)
- **Stage 7**:Robert 在本地 Chrome 实地 QA,与 mock v2.1 并列截图对比,所有视觉差异必须 fix 后才能合并

---

## 3. 7-stages 实施计划

### Stage 0:文档(本 plan + DESIGN.md v2 + M94_V0_DATA_CONTRACT.md v3.1) ← **现在**

- 新建 `docs/m94-v0/M94_V0_FRONTEND_REBUILD_PLAN.md`(本文档)
- 重写 `DESIGN.md` v1 → v2
- 追加 `docs/M94_V0_DATA_CONTRACT.md` v3.0 → v3.1 章节
- **不动任何代码 / checker / index.html / styles.css**
- 退出条件:`npm run check:all` 全绿 + Robert review 3 个文档通过

### Stage 1:删除 9 个失业 frontend checker

被删除文件清单:
1. `scripts/check-dom-ids.mjs`
2. `scripts/check-homepage-ia-contract.mjs`
3. `scripts/check-editorial-redesign-contract.mjs`(870 行怪兽)
4. `scripts/check-mobile-first-fold-compaction.mjs`
5. `scripts/check-plain-summary-card-contract.mjs`
6. `scripts/check-detail-data-dom-containment.mjs`
7. `scripts/check-backend-frontend-coverage.mjs`(Robert 已确认删除)
8. `scripts/check-realtime-band-completeness.mjs`
9. `scripts/check-frontend-visual-m54.mjs` + `m55a.mjs` + `m55b.mjs`(3 个,作为同一 stage 删除)

配套改动:
- `package.json`:从 `check:all` / `check:contracts` / `check:frontend` 等聚合 script 中移除上述 checker 的引用
- `scripts/check-suite.mjs`:移除 `frontend-visual-history` 套件;`dom-ids` / `homepage-ia-contract` / `editorial-redesign-contract` 等套件全部移除
- **不动**:`scripts/check-data-contract.mjs` / `check-realtime-source-coverage.mjs` / `check-external-ai-contract.mjs` / `check-world-order-stress.mjs` 等数据 / 后台 checker 全部保留

退出条件:`npm run check:all` 全绿(因为只删 checker,index.html 旧元素仍在,但旧 checker 不存在了所以不会断言失败)

### Stage 2:删除前端渲染层文件(暂时让前台空白)

被删除文件清单:
- `index.html`(被替换为最小骨架占位 — 仅 `<head><meta>` + 空 `<body><div id="root"></div></body>`)
- `assets/styles.css`(整文件删,Stage 3 重写)
- `scripts/app.js`(整文件删,Stage 4 重写)
- `scripts/modules/render.js`(59.42 KB,整文件删)
- `scripts/modules/renderCharts.js`
- `scripts/modules/renderTables.js`
- `scripts/modules/renderAudit.js`
- `scripts/modules/renderMacroOverview.js`(PR 2b 重写过,本 stage 再删)
- `scripts/modules/renderThematicCards.js`(PR 2a 写过,本 stage 再删)
- `scripts/modules/renderPlainSummary.js`
- `scripts/modules/renderExternalAi.js`
- `scripts/modules/displayTextBuilders.js`

**不动**:
- `scripts/modules/buildCrossValidationMatrix.js` — 算法,保留
- `scripts/modules/displayStatusThresholds.js` — 阈值 helper,保留
- `scripts/modules/health.js` / `decision.js` / `realtime.js` / `freshness.js` / `config.js` / `format.js` — 全保留
- `data/*.json` 全部不动
- `workers/` 全部不动

退出条件:`npm run check:all` 全绿(因为 Stage 1 已删 frontend checker,Stage 2 删完前端文件后,只剩数据 / 后台 checker 仍能通过)。本地打开 `index.html` 是**完全空白页**,这是预期状态。

### Stage 3:从零写 `index.html`(mock v2.1 1:1 静态 DOM)+ `assets/styles.css`

- `index.html`:严格按 mock v2.1 的 `<body>` 结构 1:1 复制(剔除 mock 专用的 `.path-tag` sticky banner + `.codex-todo-section` Codex TODO 注解块),所有动态文本预留为占位符或空 element(由 Stage 4 / Stage 5 的 JS 注入)
- `assets/styles.css`:把 mock v2.1 的全部 `<style>` 块迁出为外部 CSS,使用 CSS 变量 + 全部 selector 完整迁移
- **关键**:5 个 `<details class="editorial-folded-content">` 都不带 `open` 属性
- **不动**:JS 渲染逻辑,留给 Stage 4 / Stage 5

退出条件:本地打开 `index.html` 看到的视觉**与 mock v2.1 完全一致**,所有数字暂时是占位符(如 "—" 或空字符串)。`npm run check:all` 全绿。

### Stage 4:新 `scripts/app.js` 主流程 + 新 `scripts/modules/renderMacroOverview.js`(8 runtime block 注入)

- 新 `app.js`:fetch `data/radar-data.json` → 调用 renderMacroOverview() 注入 8 runtime block + heatmap 6 cells(静态) + appendix 5 details 数据填充
- 新 `renderMacroOverview.js`:消费 `data.modules` / `data.moduleTrends` / `data.divergenceLayer` / `data.macroDrivers` / `data.marketPricing` / `data.worldOrderStress` / `data.aiInterpretationLayer` 等字段,把它们渲染进 mock v2.1 8 runtime block 的 DOM 占位符
- **复用**:`buildCrossValidationMatrix()`(算法模块) + `displayStatusThresholds.classify*()`(阈值分桶 helpers)

退出条件:本地打开 `index.html` 看到 8 runtime block 显示真实数据,**视觉仍与 mock v2.1 一致**。

### Stage 5:新 `scripts/modules/renderThematicCards.js`(8 主题卡阵 × 38 indicator-card)+ 新 `renderPlainSummary.js`

- 新 `renderThematicCards.js`:消费 `data.macroDrivers` / `data.brentPricingLayer` / `data.privateCreditProxy` / `data.commercialRealEstate` 等字段,按 mock v2.1 的 C1-C8 8 个 reader-cat-block 结构注入 38 张 indicator-card
- 新 `renderPlainSummary.js`:消费 `data.dailyBrief.plainSummary` 字段,填 `#plain-summary-card` 的 ps-story + ps-meta
- **不动**:appendix 5 details(由 Stage 4 已处理,或 Stage 5 内独立 render 函数)

退出条件:本地打开 `index.html` 看到完整页面(masthead → plain summary → 8 runtime block → 8 主题卡阵 → 6 cells heatmap → 5 details 全折叠 → footer),视觉与 mock v2.1 完全一致,数字全部来自真实 `data/radar-data.json`。

### Stage 6:写新 frontend checker(精简版,只保护新 IA 关键合约)

新 checker(暂定名):
- `scripts/check-frontend-ia-m94v0.mjs` — 断言 mock v2.1 关键 ID 全部存在:
  - `#plain-summary-card` / `#macro-risk-overview` / `#macro-thematic-cards` / `#global-risk-heatmap`
  - 8 runtime block 的 8 个 ID:`#homepage-today-judgment` / `#homepage-pressure-sources` / `#homepage-signal-layers` / `#homepage-macro-drivers` / `#homepage-market-temperature` / `#homepage-risk-engines` / `#homepage-cross-validation` / `#wow-key-changes`
  - 5 appendix details 的 5 个 ID:`#detail-data` / `#world-order-stress-section` / `#method-evidence` / `#external-ai-auxiliary` / `#execution-risk-detail`
- `scripts/check-frontend-folded-default.mjs` — 断言 5 个 `<details class="editorial-folded-content">` **全部不带 `open` 属性**(折叠态硬约束)
- `package.json`:把这 2 个新 checker 加入 `check:all`

退出条件:`npm run check:all` 全绿,新 checker 能正确检测违规(如手动加一个 `open` 属性,本地 run 应失败)。

### Stage 7:Robert 本地 QA + 与 mock v2.1 并列截图对比 + 合并 PR

- Robert 在本地 Chrome 打开 `index.html` + 在另一个 tab 打开 `mock v2.1`,逐区域对比
- 任何视觉差异必须 fix 后再合并(回到对应 Stage 修补)
- 全部通过 → push 远程 + 开 PR + Robert merge

---

## 4. 工作流约束(本次 milestone 专属)

### 4.1 单分支多 stage,每 stage push 远程但不开 PR

PR 2c 走"工作流 B+":
- 全部 Stage 0-7 在同一分支 `m94-v0-pr2c-path-c`(或类似命名)上推进
- 每个 stage 完成后 push 远程,Claude review 远端 diff,Robert review 远端 commit
- **只在 Stage 7 全部通过后开 PR**,不分多个 PR

### 4.2 Stage 之间停下等待 review

每个 stage 完成后,Codex / Claude **必须停下**,等 Robert review + ✅ 后才启动下一 stage。**禁止**一次性跑完 Stage 0-7。

### 4.3 main 分支可红的允许

路径 C 期间(Stage 1-6),main 分支的 GitHub Pages 部署可能视觉异常或失败,**这是允许的**。Robert 已确认:"网站前台在此期间彻底没有也无所谓。"

### 4.4 不动后台的硬保证

每个 stage 的 commit diff 必须 self-check:**不包含任何 `data/` / `workers/` / `scripts/run-*.mjs` / `scripts/market-pricing/` / `scripts/world-order/` / `scripts/external-ai/` / `.github/workflows/` 改动**。如果发现意外改动,必须立刻 revert。

---

## 5. ACLED 数据集成(项目背景约束)

本 milestone 与 ACLED 数据集成**无关**,但 Codex 在任何 stage 都**不得**:
- 在 CI / GitHub Actions 中添加 ACLED URL 的自动 fetch
- 修改 `scripts/world-order/*` 中与 ACLED 相关的代码
- 触碰 `data/world-order-stress-acled-*.json` 或类似 ACLED 派生数据

ACLED EULA §3.3 禁止 scraping/crawling。Robert 是 Open license,**手动下载唯一**。

---

## 6. 文档版本

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0 | 2026-05-26 | 路径 C 初版,Stage 0 启动 |
