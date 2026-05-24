# DESIGN.md — Editorial Design Contract

> **本文档是设计合约。** 任何前端改动（无论由人工、Codex、Cursor、Claude 或其他 AI 执行）在动手之前都必须读完本文档，并在 PR 描述中声明"本 PR 符合 DESIGN.md 的所有规则"。违反本合约的视觉改动会被 `check:editorial-redesign-contract` 拦截。
>
> 本合约的视觉真实基准是参考网站 **The Bubble Watch / AI 泡沫监测**（Editorial Data Journalism 风格），不是任何 SaaS dashboard 或交易终端。

---

## 1. 设计哲学（不可妥协的根基）

GFRR 是一份**每日更新的机构级风险简报**，不是实时监控大屏。所有视觉决策必须服务于这个定位：

| 错误参考系 | 正确参考系 |
|---|---|
| Bloomberg Terminal（深色 dashboard） | The Economist（纸张研究简报） |
| TradingView 实时图表 | Bloomberg Weekly（每周头版分析） |
| SaaS 产品官网 | Wall Street Journal Markets 版面 |
| AI 创业公司 landing page | 央行金融稳定报告 |

**核心原则**：
- **纸张感优先**：暖纸张底色 + 深墨文字，不是冷蓝深色 dashboard
- **报纸节奏优先**：清晰的 section header + 色带 + 阅读顺序，不是密集网格仪表盘
- **风险色克制使用**：红/黄/绿仅用于语义状态指示，不做装饰
- **字体三栈分工严格**：display / serif / mono 各司其职，禁止混用 sans-serif
- **边框驱动视觉**：用 1px 实线、3px 双线、4px 顶部色带做层次，不用 box-shadow，不用大圆角

---

## 2. 色彩系统（仅允许使用 CSS Token）

### 2.1 核心色板

所有颜色必须通过 CSS 变量引用，**禁止直接写色值**。

```css
:root {
  /* 纸张主题 - 全站基底 */
  --paper-bg: #FBF7F0;        /* 暖纸张色，全站默认背景 */
  --paper-bg-canvas: #F5F0E5; /* 图表 / 画布容器背景，略深于纸张主背景 */
  --paper-ink: #1A1815;       /* 深墨色，全站默认文字 + 强边框 */
  --paper-warm: #3A3530;      /* 暖墨色，正文重点 */
  --paper-muted: #666666;     /* 灰色，次要文字 + 元数据 */
  --paper-line: rgba(26, 24, 21, 0.16);  /* 浅边框 */
  --paper-line-strong: #1A1815;          /* 强边框 */

  /* 语义风险色 - 仅用于状态指示 */
  --risk-red: #7C1D1D;        /* 高风险 / 警告 */
  --risk-yellow: #A8761A;     /* 中风险 / 观察 */
  --risk-orange: #C25E2A;     /* 高风险预警 / override */
  --risk-green: #1F4D2C;      /* 低风险 / 正常 */
  --risk-severe: #5A0F0F;     /* 系统性危机（深酒红，仅热力图最高档使用）*/
}
```

`--paper-bg-canvas` 用于图表 / 画布容器的次级纸张底色。它与 `--paper-bg`
保持同一暖纸张色相，但亮度约低 3%，用于在不引入阴影、冷色或卡片化处理的
前提下，让 canvas / chart 容器与页面主纸张背景产生可感知分隔。

### 2.2 颜色使用规则

| 用途 | 允许的 token | 禁止 |
|---|---|---|
| 所有 section / card 主背景 | `--paper-bg` | 任何蓝色系、灰色渐变、box-shadow |
| 图表 / 画布容器背景 | `--paper-bg-canvas` | 冷色背景、阴影、渐变主背景 |
| 所有正文文字 | `--paper-ink` | 蓝灰色、冷白色 |
| 次要文字 / 元数据 | `--paper-muted` | 蓝灰、暗紫 |
| 边框（强） | `--paper-line-strong` | 蓝色边框、彩色 box-shadow |
| 边框（弱） | `--paper-line` | 同上 |
| 状态徽章 / 色带 / SVG 区域色 | `--risk-*` | 高饱和警报色（如 `#FF0000`）|
| 反白区块（Hero/WoW）的背景 | `--paper-ink` 即 `#1A1815` | 任何渐变、阴影 |
| 反白区块内文字 | `--paper-bg` 即 `#FBF7F0` | 灰色（除非明确次要）|

### 2.3 禁用色清单

以下色值**禁止出现**在任何 CSS / HTML / SVG 渲染代码中：

```text
# 深色 dashboard 时代残留
#07111f, #0c1930, rgba(15,23,42,*), rgba(20,31,48,*)

# 科技蓝
#65b4ff, #3f7dff, #82d9ff, #4f86ff

# 冷白 / 蓝灰
#f2f7ff, #f8fafc, #e2e8f0, #dbeafe, #9eb4d8, #aebed2, #94a3b8

# 亮警报色
#ff6b7a, #ffd46a, #ff9d57, #2fd38a

# 任何 sans-serif 系统字体名
Inter, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont
PingFang SC, Microsoft YaHei, Helvetica, Arial, Roboto, Open Sans
```

---

## 3. 字体系统（三栈严格分工）

### 3.1 字体栈定义

```css
:root {
  --font-display: "Playfair Display", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  --font-serif:   "Noto Serif SC", "Source Han Serif SC", "Songti SC", "PingFang SC", serif;
  --font-mono:    "IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace;
}
```

### 3.2 字体职责分工

| 字体栈 | 角色 | 应用场景 |
|---|---|---|
| `--font-display` | 头版气质 | 主标题 / 大数字 / Hero h1 / section title / metric value / verdict 大字 |
| `--font-serif` | 阅读流 | 正文 / 解释文字 / section note / WoW 描述 / 表格 td / 列表项 |
| `--font-mono` | 数据感 | English kicker / 标签 / badge / 状态徽章 / 元数据 / 时间戳 / 表格 th / 图例 / 折叠按钮 |

### 3.3 字体加载

**唯一允许的外部字体加载方式**（通过 Google Fonts CDN）：

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Noto+Serif+SC:wght@400;500;600;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
```

**禁止**：
- 加载任何其他 Google Fonts 字体家族（Roboto / Open Sans / Inter / Lato 等）
- 加载非 Google Fonts 的外部字体 CDN（jsDelivr / unpkg 字体 / Adobe Fonts 等）
- 在 CSS 中直接 `@import url()` 任何外部字体
- 使用 `font-family` 直接指定上述 §2.3 禁用色清单中的字体名

### 3.4 字体规则强制层

所有 `font-family` 声明必须使用 `var(--font-*)` 变量，**禁止**直接写字体名字符串。

---

## 4. 信息架构（IA 合约，section 顺序不可随意改动）

### 4.1 一级 section 顺序（不可变更）

```text
═══ 第一层：核心阅读路径（不折叠，始终展开）═══
1. Hero / Masthead              (顶部品牌 + 日期 + 数据健康)
2. dashboard-jump-nav            (顶部跳转导航 14 项)

═══ Non-nav preface block（可选，不计入 IA 编号）═══
#plain-summary-card           普通用户 preface block
   - 位于 <main> 内、dashboard-jump-nav 后、#macro-risk-overview 前
   - 不计入 14 项 jump-nav IA section
   - 不改变现有 IA section 顺序与编号
   - 可使用 editorial-section plain-summary-section 类
   - 不要求标准 editorial-section-header / English kicker / 色带
   - 必须保留为可选（optional）：缺失时不构成 IA 违规
   - 如出现，必须严格位于上述位置
   - V3 implementation 由独立 contract checker 强制其存在性

3. #macro-risk-overview          (宏观风险判断总览)
   ├─ runtime block: #homepage-today-judgment
   ├─ runtime block: #homepage-pressure-sources
   ├─ runtime block: #homepage-signal-layers
   ├─ runtime block: #homepage-macro-drivers
   ├─ runtime block: #homepage-market-temperature
   ├─ runtime block: #homepage-risk-engines
   ├─ runtime block: #homepage-cross-validation
   ├─ runtime block: #wow-key-changes      (M-55b: JS runtime 注入，不是顶级 section)
   └─ supporting strip: #homepage-realtime-band (盘中快变量，不是顶级 section)
4. #global-risk-heatmap          (全球风险热力图)

═══ 第二层：附录区（可折叠，默认收起）═══
5. #detail-data                  (详细数据与图表)
6. #world-order-stress-section   (World Order regime overlay；独立 section，见 ADR-0004)
7. #method-evidence              (方法说明)
8. #external-ai-auxiliary        (外部 AI 解读 - 只读辅助)
9. #execution-risk-detail        (执行与风控详情)
```

### 4.2 修改 IA 顺序的流程

若需要新增 section 或调整顺序：

1. 必须先开 issue 讨论变更理由
2. 同步更新 `scripts/check-homepage-ia-contract.mjs`（IA 合约脚本）
3. 同步更新本文档 §4.1
4. 同步更新 `scripts/check-editorial-redesign-contract.mjs` 中的 nav 顺序断言
5. PR 必须包含 IA 变更的视觉对比截图

---

## 5. 组件规范（核心组件的 HTML 结构和样式）

### 5.1 editorial-section（一级 section 容器）

**标准 HTML 结构**：

```html
<section id="..." class="editorial-section" style="--section-accent: var(--risk-red);">
  <header class="editorial-section-header">
    <span class="section-kicker">ENGLISH KICKER</span>
    <span class="section-title">中文标题</span>
    <span class="section-note">说明文字...</span>
  </header>
  <div class="editorial-section-body">
    <!-- 内容 -->
  </div>
</section>
```

**色带颜色**：通过 `--section-accent` 在 inline style 中指定。

| Section | 色带 token | 语义 |
|---|---|---|
| `#macro-risk-overview` | `var(--risk-red)` | 主判断 |
| `#wow-key-changes` | `var(--risk-yellow)` | `#macro-risk-overview` 内 runtime block；变化语义 |
| `#homepage-realtime-band` | n/a | `#macro-risk-overview` 内 supporting strip；盘中快变量 |
| `#global-risk-heatmap` | `var(--risk-red)` | 风险数据 |
| `#detail-data` | `var(--paper-ink)` | 中性 appendix |
| `#world-order-stress-section` | `var(--risk-orange)` | regime overlay；独立结构性观察层 |
| `#method-evidence` | `var(--paper-ink)` | 中性 appendix |
| `#external-ai-auxiliary` | `var(--paper-muted)` | 辅助层 |
| `#execution-risk-detail` | `var(--risk-red)` | 风控严重性 |
| `#plain-summary-card` | n/a (preface, no accent band required) | non-nav preface block |

**视觉规范**：
- 顶部 `border-top: 4px solid var(--section-accent)`
- 底部 `border-bottom: 1px solid var(--paper-line)`
- 内边距 `padding: 24px 28px 20px 28px`
- `section-kicker`：mono 字体，11px，letter-spacing 0.28em，uppercase
- `section-title`：display 字体，22-30px clamp，font-weight 700
- `section-note`：serif 字体，13px，line-height 1.7

### 5.2 editorial-folded-content（折叠容器）

```html
<details class="editorial-folded-content">
  <summary class="editorial-folded-summary">
    <span class="fold-marker">+</span>
    <span class="fold-label">展开详细数据</span>
  </summary>
  <div class="editorial-section-body">
    <!-- 折叠内容 -->
  </div>
</details>
```

**规则**：
- 默认收起（不加 `open` 属性）
- 展开标记用 ASCII `+` / `−`（不用 Unicode 装饰字符）
- 后缀 "· 展开" / "· 收起" 由 CSS `::after` 自动生成
- 字体 mono 12-13px

### 5.3 editorial-big-number（Hero 反白卡）

```html
<article class="editorial-big-number">
  <div class="label">GLOBAL RISK SCORE</div>
  <div class="value">59</div>
  <div class="breakdown">压力上升 · 证据强度: 中等</div>
  <div class="footer">UPDATED: ...</div>
</article>
```

**视觉规范**：
- 背景 `#1A1815` 深墨
- 文字 `#FBF7F0` 反白
- 数值字号 `clamp(80px, 14vw, 144px)`，Playfair Display 900 weight
- `letter-spacing: -0.04em`，`line-height: 0.9`

### 5.4 wow-item（本期关键变化条目）

```html
<article class="wow-item">
  <span class="wow-tag is-up">▲ 风险升高</span>
  <p class="wow-text">变化描述...</p>
  <span class="wow-source">数据来源</span>
</article>
```

**tag 颜色**：
- `.is-up` → `var(--risk-yellow)` 背景 + 反白文字
- `.is-down` → `var(--risk-green)` 背景 + 反白文字
- `.is-flat`, `.is-gap` → `var(--paper-muted)` 背景 + 反白文字

### 5.5 dashboard-jump-nav

顶部跳转导航，14 项链接，对应首页核心 runtime anchors 与顶级 section 锚点。

- 字体 mono 11px，`letter-spacing: 0.18em`，uppercase
- 默认色 `var(--paper-muted)`
- hover 时 `color: var(--paper-ink)` + `border-bottom: 1px solid var(--risk-red)`
- 上下边框 `1px solid var(--paper-line)`

---

## 6. 边框 / 间距 / 阴影规范

### 6.1 边框

| 用途 | 规则 |
|---|---|
| section 顶部色带 | `border-top: 4px solid var(--section-accent)` |
| Hero 底部 / Method footer 顶部 | `border-bottom/top: 3px double var(--paper-ink)` |
| section 内部分隔 | `border-bottom: 1px solid var(--paper-line)` |
| 强分隔（category-header） | `border-bottom: 2px solid var(--paper-ink)` |
| 指标卡边框 | `border: 1px solid var(--paper-line-strong)` |
| 卡片内 meta 分隔 | `border-top: 1px dashed #999` |
| 状态条（指标卡顶部） | `4px` 高，色彩按 status 着色 |

### 6.2 圆角

**全站默认 `border-radius: 0`**。仅以下例外允许圆角：

| 例外用途 | 允许的 radius |
|---|---|
| Watch list 编号圆圈（① ② ③）| 视觉上的圆形装饰 |
| 头像 / 用户标识 | `50%` |

**禁止**：`border-radius: 8px / 12px / 22px / 999px` 任何形式的"圆角卡片" SaaS 风格。

### 6.3 box-shadow

**全站禁用 box-shadow**。所有视觉层次必须用边框 + 间距实现。

### 6.4 间距节奏

| 元素 | 默认间距 |
|---|---|
| section 之间 | `margin: 40px 0` |
| section header padding | `24px 28px 20px 28px` |
| section body padding | `0 8px` |
| grid gap（指标卡）| `16px` |
| grid gap（WoW 内部）| `24px 32px` |
| 反白卡内 padding | `28-32px` |

### 6.5 容器宽度

```css
.container { max-width: 1280px; margin: 0 auto; padding: clamp(20px, 4vw, 48px); }
```

**禁止**：超宽容器（>1660px）或全屏铺开布局——那是 dashboard 风格。

---

## 7. SVG 图表规范

### 7.1 线条颜色

| 用途 | 颜色 | 样式 |
|---|---|---|
| 主数据线 | `var(--risk-red)` `#7C1D1D` | 实线 |
| 次数据线 | `var(--risk-yellow)` `#A8761A` | 虚线 `stroke-dasharray: 4 4` |
| 第三线（如有） | `var(--paper-muted)` `#666666` | 点线 |
| 网格线 / 坐标轴 | `rgba(26, 24, 21, 0.08)` | 实线 |

### 7.2 文字标签

- 颜色 `var(--paper-muted)`
- 字体 IBM Plex Mono
- 字号 10-11px

### 7.3 热力图区域色（离散四档 + fallback）

| 风险等级 | 阈值 | 颜色 |
|---|---|---|
| 低风险 | < 50 | `#1F4D2C`（暗绿）|
| 中风险 | 50-69 | `#A8761A`（金棕）|
| 高风险 | 70-84 | `#7C1D1D`（暗红）|
| 严重 | ≥ 85 | `#5A0F0F`（深酒红）|
| 无数据 | - | `#E8E0D4`（浅纸张）|

**禁止**：在 SVG 中使用任何蓝色系、亮饱和色、深色背景矩形。

---

## 8. 禁止清单（任何 AI / 人工 都不允许做的事）

### 8.1 视觉禁令

1. ❌ 使用任何形式的圆角卡片（除 §6.2 例外）
2. ❌ 使用任何 `box-shadow`
3. ❌ 使用任何蓝色系颜色作为主色或装饰色
4. ❌ section / card 主背景使用任何渐变 (gradient as primary surface background)
   ✅ 装饰性 ::before / ::after 伪元素允许使用透明度递减的 fade overlay 渐变 (decorative gradient overlays)
   ✅ 数据可视化色阶 (如 .legend-bar) 允许使用功能性渐变
5. ❌ 使用任何 sans-serif 系统字体（§2.3 禁用色清单）
6. ❌ 使用 Unicode 装饰字符做折叠展开标记（用 ASCII `+` / `−`）
7. ❌ 使用 `box-shadow` 或亮色作为 hover 反馈（用 border-bottom 下划线）

说明 (M-32 修订): 区分"主背景"与"装饰层":
  - 主背景: section / card / body 的 background 属性
  - 装饰层: ::before / ::after 伪元素，或纯视觉性 z-index < 0 元素
本规则只禁止主背景渐变；装饰性 fade overlay 不受限制。

### 8.2 结构禁令

1. ❌ 改变 §4.1 的 IA 顺序（除非走 §4.2 流程）
2. ❌ 添加新的一级 section 而不更新 `check:homepage-ia-contract` 和本文档
3. ❌ 把"主路径 section"改为折叠
4. ❌ 把"附录 section"提升到主路径
5. ❌ 使用非标准的 className 派系（如 `editorial-heatmap-*`, `editorial-appendix-*`, `ia-detail-panel`, `advanced-panel` 作为顶层容器）

### 8.3 字体禁令

1. ❌ 引入任何非 Bubble Watch 三栈的字体
2. ❌ 在 CSS 中直接写字体名字符串（必须用 `var(--font-*)`）
3. ❌ 加载额外的 Google Fonts 家族（即使是衬线字体）

### 8.4 数据 / 业务边界禁令（不可触碰）

1. ❌ 改变任何 scoring / decision / execution / position 逻辑
2. ❌ 改变 `data/` 或 `data/radar-data.json` 内容
3. ❌ 启用 Market Pricing Temperature 任何相关逻辑
4. ❌ 添加 live fetch 或 production write
5. ❌ 修改 `.github/workflows/` 任何 workflow

---

## 9. 变更流程

### 9.1 设计变更必须走的流程

任何会影响视觉的 PR 必须：

1. **PR 描述必须明确声明**："本 PR 符合 DESIGN.md 的所有规则" 或 "本 PR 申请变更 DESIGN.md 的 §X 节"
2. **如果是 DESIGN.md 变更**：必须先开 issue 讨论，PR 同时更新本文档
3. **必须通过的检查**：
   - `npm run check:all` 全绿
   - `npm run check:editorial-redesign-contract` 全绿
   - `npm run check:homepage-ia-contract` 全绿
4. **必须包含的 PR 描述内容**：
   - 视觉对比截图（before / after）
   - Headless Chrome 实测取样（关键 selector 的 background / color / font-family）
   - 受限路径检查：`git diff --name-only -- data .github/workflows` 必须为空

### 9.2 AI 协作的特殊要求

任何 AI（Codex / Cursor / Claude 等）在执行视觉改动前必须：

1. **先读本文档**：在动手前完整读完 DESIGN.md
2. **先调研后改造**：复杂改动必须先生成"现状清单"（如颜色用途清单、字号清单），再决定改造策略
3. **保留命名而非删除**：当需要弃用一个元素时，优先 `display: none` 隐藏而非删除 DOM（除非合约脚本无依赖）
4. **静态分析代替临时测试**：不要在脚本中插入临时测试代码再删除
5. **PR 描述要包含调研结果**

### 9.3 DESIGN.md 修订历史

- M-32 (PR #?): 首次修订 DESIGN.md。修订 §2.1 新增 `--paper-bg-canvas`;
  修订 §2.2 允许图表 / 画布容器使用次级纸张背景; 修订 §8.1 #4，区分主背景
  与装饰层，允许 `::before` / `::after` 装饰性 fade overlay 渐变，同时继续禁止
  section / card 主背景使用渐变。

---

## 10. 字段引用速查表

### 10.1 CSS 变量速查

```css
/* 背景色 */
var(--paper-bg)               /* #FBF7F0 */
var(--paper-bg-canvas)        /* #F5F0E5 - chart / canvas container */
var(--paper-ink)              /* #1A1815 - 反白卡背景 */

/* 文字色 */
var(--paper-ink)              /* #1A1815 主文字 */
var(--paper-warm)             /* #3A3530 暖正文 */
var(--paper-muted)            /* #666666 次要 */
var(--paper-bg)               /* #FBF7F0 反白卡文字 */

/* 边框 */
var(--paper-line)             /* rgba(26,24,21,0.16) 弱边框 */
var(--paper-line-strong)      /* #1A1815 强边框 */

/* 风险色 */
var(--risk-red)               /* #7C1D1D */
var(--risk-yellow)            /* #A8761A */
var(--risk-orange)            /* #C25E2A */
var(--risk-green)             /* #1F4D2C */

/* 字体 */
var(--font-display)           /* Playfair Display */
var(--font-serif)             /* Noto Serif SC */
var(--font-mono)              /* IBM Plex Mono */
```

### 10.2 一级 section ID 速查

```text
#macro-risk-overview          宏观风险判断总览（红色带）
  #wow-key-changes            本期关键变化（runtime 注入，不是顶级 section）
  #homepage-realtime-band     盘中快变量（supporting strip，不是顶级 section）
#global-risk-heatmap          全球风险热力图（红色带）
#detail-data                  详细数据与图表（墨色带，折叠）
#world-order-stress-section   世界秩序压力层（regime overlay，橙色带，折叠）
#method-evidence              方法说明（墨色带，折叠）
#external-ai-auxiliary        外部 AI 解读（灰色带，折叠）
#execution-risk-detail        执行与风控详情（红色带，折叠）

─── non-nav preface（可选，不进 jump nav，不计入 IA 编号）───
#plain-summary-card           普通用户 preface block（M-93A0 / 优化路径 3）
```

---

## 11. 视觉真实基准

本文档的所有视觉规则的最终参考是：

**The Bubble Watch / AI 泡沫监测** — 一份以"风险研究头版"为定位的 Editorial Data Journalism 网站。

任何视觉判断的最终标准都是："**这样做更像 The Bubble Watch 还是更像 SaaS dashboard？**" 若答案是后者，则违反本合约。

---

## 12. 文档历史

| 日期 | 变更 | PR |
|---|---|---|
| 2026-05 | 初版创建。基于 PR #153-#163 完成的 editorial redesign 改造，确立 Bubble Watch 风格设计合约 | PR #164（本 PR） |
| 2026-05 | M-93A0: 引入 `#plain-summary-card` 非 nav preface block 概念；jump nav 14 项与 IA section 编号均不变；同步更新 `scripts/check-homepage-ia-contract.mjs` 和 `scripts/check-editorial-redesign-contract.mjs` | PR #<待 owner 填> |
