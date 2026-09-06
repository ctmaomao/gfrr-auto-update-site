# DESIGN.md — Editorial Design Contract

> **Version**: v2.2 (ADR-0027 documentation consistency,2026-09-06; visual layout unchanged)
>
> **本文档是设计合约。** 任何前端改动（无论由人工、Codex、Cursor、Claude 或其他 AI 执行）在动手之前都必须读完本文档，并在 PR 描述中声明"本 PR 符合 DESIGN.md 的所有规则"。视觉/IA 由本合约与人工 review 约束；现行可执行检查见 §9.1，退役 checker 不再作为门禁。
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

颜色使用处必须引用 CSS token。token 定义和文档色板可以写明色值；唯一已明确的旧声明例外见 §6.1。其它现有裸色值不因此自动获准（[ADR-0027](docs/ADR/0027-design-document-consistency.md)）。

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
  --font-serif:   "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
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

字体使用处的 `font-family` 必须引用 `var(--font-*)`；只有 §3.1 的三个 token 定义可列字体名。PingFang SC 不在允许的 serif 栈中。

---

## 4. 信息架构（IA 合约，section 顺序不可随意改动）

### 4.1 首页一级阅读顺序（不可变更）

M-94 V0 起,首页按 `mock v2.1` 的报纸式阅读路径组织。主路径不折叠,附录区默认折叠。

```text
═══ 第一层：核心阅读路径（不折叠，始终展开）═══
1. <header class="masthead">              顶部品牌 / 日期 / 数据健康 / 观察边界
2. <nav class="dashboard-jump-nav">       顶部跳转导航 13 项

═══ Non-nav preface block（不计入 nav 编号）═══
#plain-summary-card                       普通用户 preface block（2026-05 Bubble Watch 改版已退场)
   - 位于 <main> 内、dashboard-jump-nav 后、#macro-risk-overview 前
   - 使用 plain-summary-section 叙事结构
   - 不计入 jump-nav IA section

═══ Macro narrative path（主叙事展开 + 专业证据按需展开）═══
3. #macro-risk-overview                   宏观风险判断总览
   └─ .macro-overview-shell
      ├─ #homepage-today-judgment         Hero / 今日判断
      ├─ #macro-risk-editorial             本期宏观判读（DeepSeek 只读编辑层；失败时隐藏）
      ├─ #wow-key-changes                 本期关键变化
      ├─ .threshold-block                 风险阈值尺
      ├─ .trend-block                     8 周趋势
      ├─ #homepage-macro-drivers          宏观驱动
      ├─ #homepage-market-temperature     Market Pricing Temperature
      └─ #macro-professional-evidence     专业证据与模型诊断（局部 details）
          ├─ #homepage-pressure-sources   压力来源
          ├─ #homepage-signal-layers      信号层
          ├─ #homepage-risk-engines       六大风险引擎
          ├─ #homepage-cross-validation   交叉验证矩阵
          └─ #homepage-macro-coherence    跨市场印证

═══ Thematic reader path（8 主题卡阵）═══
4. #macro-thematic-cards                  C1-C8 主题卡阵,52 张 indicator-card；C5/C6 观察层视觉置底

═══ Static risk map（M-94 静态,M-95+ 再接真实区域算法）═══
5. #global-risk-heatmap                   6 cells 静态 heatmap

═══ Energy theme（PR4 · 独立能源专题,主路径可见 + 折叠详情）═══
6. #oil-directional-pressure              油价方向压力研判(ODP,display-only;不进打分/执行/Heatmap)

═══ 第二层：附录区（4 个 details,默认收起）═══
7. #detail-data                           详细数据与图表
8. #world-order-stress-section            World Order regime overlay
9. #method-evidence                       方法说明与证据链
10. #execution-risk-detail                执行与风控详情

═══ Footer（不进 jump nav）═══
<footer class="method">                   method-grid 4 项
```

### 4.2 dashboard-jump-nav 13 项（顺序锁定）

顶部跳转导航必须是 13 项,按以下顺序指向主路径锚点:

1. `#homepage-today-judgment`
2. `#macro-risk-editorial`（嵌入 `#macro-risk-overview`；只读、fail-closed）
3. `#wow-key-changes`
4. `#homepage-macro-drivers`
5. `#homepage-market-temperature`
6. `#macro-professional-evidence`
7. `#macro-thematic-cards`（`.new` 主题卡阵入口）
8. `#global-risk-heatmap`
9. `#oil-directional-pressure`（PR4 · 独立能源专题）
10. `#detail-data`
11. `#world-order-stress-section`
12. `#method-evidence`
13. `#execution-risk-detail`

### 4.3 修改 IA 顺序的流程

若需要新增 section 或调整顺序：

1. 必须先开 issue 讨论变更理由
2. 同步更新 `DESIGN.md` §4 与 M-94 数据契约
3. 涉及现有自动检查覆盖的契约时，同步更新对应检查；未覆盖的 IA/视觉条款按本文件 review，不要求恢复退役 checker。
4. 同步更新 `index.html` 静态骨架与对应 render module
5. PR 必须包含 IA 变更的视觉对比截图

### 4.4 第二页面(bubble-watch.html)与页面切换书签

站点自 2026-06-11 起有两个独立页面(见 ADR-0016):

- `index.html` — 全球金融风险雷达(本合约 §4.1-4.3 的 IA 锁定仅约束此页)。
- `bubble-watch.html` — AI 泡沫监测 · The Bubble Watch,**独立单文件页**(内联 CSS + 内联渲染 JS,沿用外部原版的报纸排版与本站 editorial paper 语言),自带视觉契约,不受 §4.1 一级阅读顺序约束;数据只读 `data/bubble-watch.json`,display-only,不进雷达打分/决策链。
- Bubble Watch v2 必须全量展示 27 张证据卡,并以克制的 mono 小印章区分「固定核心」与「影子观察」;Hero、Stage × Trigger、历史趋势须明确标注 Core-23 口径。角色标签只能使用纸媒式细边框/虚线印章,不得改成彩色 SaaS pill、开关或独立 dashboard 面板。
- 合格的 `summary.weekly_editorial` 在 Hero 后使用同一 editorial paper 语言展示周度长篇判读：时间线、指标综合、关键矛盾、分类、历史差异、下周条件、数据限制和来源账本。不得把它画成 SaaS 卡片墙、聊天框或独立 AI dashboard；缺失/过期/as-of 不匹配时整个长篇区隐藏，Hero 必须回退到规则 `verdict_label` + `verdict_desc`。
- Bubble Watch 响应式验收固定覆盖 1440px 桌面与 390px 手机视口。390px 下 Hero 与 Stage × Trigger 必须为单列,全页不得产生横向溢出,趋势 SVG 不得宽于容器；运行态必须显示 27 / Core-23 / Shadow-4 对应的 27 张分类证据卡、23 个核心印章和 4 个影子印章,且 Hero/两轴数值须与专属 JSON 一致。专属 JSON 不可用时只显示错误态,不得保留旧卡片或趋势图。
- 两页通过左上角 `.page-bookmarks` 彩色书签丝带互切:默认缩在角落只露带尾(当前页饱和度更高、带光环圆点),hover / 键盘聚焦滑出显示页名;纯 CSS、无 JS。组件契约**双侧同构**:`assets/styles.css`(index 侧)与 `bubble-watch.html` 内联(专题侧)各持一份,**改任一侧必须同步另一侧**,由 `check:bubble-watch` 的 boundary leaf 守卫两侧存在性。
- 书签是 fixed overlay 导航,不属于 §4.1 的 section,不进 dashboard-jump-nav。

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
| `#macro-risk-overview` | `var(--risk-red)` | 主判断、编辑判读、WoW 与按需专业证据 |
| `#macro-thematic-cards` | `var(--risk-green)` | 主题汇编,跨分析层的读者类别入口 |
| `#global-risk-heatmap` | `var(--risk-red)` | 6 cells 静态风险热力图 |
| `#oil-directional-pressure` | `var(--risk-red)` | PR4 独立能源专题(ODP,display-only;物理>金融,verdict 动态上色) |
| `#detail-data` | `var(--paper-ink)` | 中性 appendix |
| `#world-order-stress-section` | `var(--risk-orange)` | regime overlay;独立结构性观察层 |
| `#method-evidence` | `var(--paper-ink)` | 中性 appendix |
| `#macro-risk-editorial` | `var(--paper-ink)` | 主总览内嵌 DeepSeek 只读编辑层；不是独立一级 section |
| `#execution-risk-detail` | `var(--risk-red)` | 风控严重性 |
| `#plain-summary-card` | n/a (preface, no accent band required) | non-nav preface block — 已退场 / historical preface block(M-94 退场) |

**视觉规范**：
- 顶部 `border-top: 4px solid var(--section-accent)`
- 底部 `border-bottom: 1px solid var(--paper-line)`
- 内边距 `padding: 24px 28px 20px 28px`
- `section-kicker`:mono 字体,11px,letter-spacing 0.28em,uppercase
- `section-title`:display 字体,22-30px clamp,font-weight 900(2026-06-11 对齐 Bubble Watch 原版分类标题字重;原 700)
- `section-note`:serif 字体,13px,line-height 1.7

### 5.2 macro-overview-shell 与 narrative-first runtime path

`#macro-risk-overview` 内部必须使用 `.macro-overview-shell` 包裹所有 runtime 内容。ADR-0023 后顺序固定如下；专业证据保留原 id 与 renderer，但移入局部 disclosure:

```html
<section class="editorial-section" id="macro-risk-overview">
  <div class="macro-overview-shell">
    <article id="homepage-today-judgment" class="editorial-big-number">...</article>
    <article id="macro-risk-editorial" class="macro-editorial" hidden>...</article>
    <section id="wow-key-changes" class="wow-section">...</section>
    <section class="threshold-block">...</section>
    <section class="trend-block">...</section>
    <section id="homepage-macro-drivers" class="runtime-block">...</section>
    <section id="homepage-market-temperature" class="runtime-block">...</section>
    <details id="macro-professional-evidence" class="macro-evidence-fold">
      <summary>专业证据与模型诊断...</summary>
      <div class="macro-evidence-content">
        <section id="homepage-pressure-sources" class="runtime-block">...</section>
        <section id="homepage-signal-layers" class="runtime-block">...</section>
        <section id="homepage-risk-engines" class="runtime-block">...</section>
        <section id="homepage-cross-validation" class="runtime-block">...</section>
        <section id="homepage-macro-coherence" class="runtime-block">...</section>
      </div>
    </details>
  </div>
</section>
```

runtime block 的基准结构:

```html
<section id="homepage-pressure-sources" class="runtime-block">
  <header class="runtime-block-header">
    <span class="runtime-kicker">PRESSURE SOURCES</span>
    <h3>压力来源</h3>
    <p>一段叙事说明...</p>
  </header>
  <div class="runtime-block-body">
    <!-- mini-grid / narrative-list / consistency-block / themed body -->
  </div>
</section>
```

### 5.3 editorial-big-number（Hero 反白卡）

```html
<article class="editorial-big-number" id="homepage-today-judgment">
  <div class="big-left">
    <div class="label">GLOBAL RISK SCORE</div>
    <div class="value">59</div>
    <div class="breakdown">压力上升 · 证据强度: 中等</div>
  </div>
  <div class="big-right">
    <div class="verdict-kicker">TODAY'S JUDGMENT</div>
    <h2>今日判断标题</h2>
    <p>今日判断叙事...</p>
  </div>
  <div class="big-footer">...</div>
</article>
```

**视觉规范**：
- （2026-05 Bubble Watch 改版:只分数反白,判读敞开)`.big-left`(TODAY JUDGMENT + 分数)为深墨反白块:背景 `var(--paper-ink)`、文字 `var(--paper-bg)`
- `.big-right`(判读 kicker/headline/body)与 `.big-footer` 在纸色背景上、深字 `var(--paper-ink)`,不再整卡反白
- 数值字号 `clamp(80px, 14vw, 144px)`,Playfair Display 900 weight
- 数值 `line-height: 0.9`
- `big-footer` 为 3 列元数据:DOMINANT RISK CHAIN / WEEKLY CHANGE / DATA HEALTH

### 5.4 折叠态硬约束（appendix details）

4 个 appendix `<details class="editorial-folded-content">` 元素**全部不带 `open` 属性**,初始渲染时全部为收起状态。任何把 `open` 属性加进 `index.html` 的改动都视为视觉契约违规。

`#macro-professional-evidence.macro-evidence-fold` 同样不得在静态 HTML 中带 `open`。区别是它由 `renderMacroOverview` 按 AI 编辑层资格设置初始运行态：有效编辑层时保持收起；AI 判读不可用时自动展开（包括编辑层缺失、过期、mismatch、无资格或渲染失败）。此行为是 deterministic fallback，不把 AI 接入评分或模型计算。

适用范围:`#detail-data` / `#world-order-stress-section` / `#method-evidence` / `#execution-risk-detail`,以及 M-95+ 将来新增的任何 `<details class="editorial-folded-content">`。`#macro-risk-editorial` 是主路径内嵌 article，仅其来源账本使用局部 `<details>`，不属于 appendix。

执行机制：附录默认折叠由本节和人工 review 核对；宏观专业证据的静态/动态折叠由 `check:macro-overview-evidence-fold` 验证，已包含在 `check:frontend-live-contracts`。不声称它覆盖所有附录视觉约束。

```html
<details id="detail-data" class="editorial-folded-content">
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
- 默认收起,不加 `open` 属性
- 展开标记用 ASCII `+` / `−`
- 后缀 "· 展开" / "· 收起" 由 CSS `::after` 自动生成
- 字体 mono 12-13px

### 5.5 mock v2.1 专属组件族

**8 主题卡阵**:
- `#macro-thematic-cards` 内必须有 8 个 `.reader-cat-block`
- 视觉标题顺序为 C1 通胀与能源 / C2 全球流动性 / C3 信用与企业债 / C4 美国经济温度 / C7 市场情绪 / C8 地缘与世界秩序 / C5 世界经济 / C6 中国宏观
- C5 世界经济与 C6 中国宏观保留历史编号、DOM id prefix 与 renderer 绑定,但视觉上必须置于 C7/C8 之后,作为区域 / 外部扩散观察层收尾
- 总计 52 个 `article.indicator-card`
- C1 通胀与能源包含新增 `Transport Shock / 运输冲击确认因子` 展示观察卡；它只读生产 payload 中的 `macroDrivers.energyTransport.transportShockCandidate` 与顶层 `transportShockScoringImpact`,不得读取 manual artifacts。
- Transport Shock 卡片可显示 `入分闸门` 行,但只能由 production payload 的 capped score-impact 与 route / market gate 派生;该行只解释低权重 +3 cap 是否触发,不得改写 ODP finalBias、Brent promotion 或 route/market confirmation。
- Transport Shock 卡片可显示 `主分影响` 行,只展示 `transportShockScoringImpact` 的当前贡献与 +3 上限;routeFreightConfirmation/marketConfirmation 仍必须保持独立边界。
- `#homepage-risk-engines` 可显示 `Transport Shock 主分归因`,但只能复用顶层 `transportShockScoringImpact` 的 capped score impact、reason 与 scoreBeforeTransport/scoreAfterTransport;不得由前端自行计算主分或连接 route / market confirmation。
- 每张卡必须只显示公开代理 / 审计层 / 展示层证据,不得暗示正式源或非公开数据已接入
- 观察层反应徽章必须表达“与有效主判断的关系”: `印证` 的颜色跟随有效主判断等级(观察期=绿 / 中度警戒=黄 / 高风险预警=橙 / 系统性顶部=红);`背离` 的颜色表达反向证据方向(缓和反证=绿,压力反证=黄);`背景` 与 `数据不足` 保持中性 / pending

**mini-grid / mini-card**:
- `#homepage-pressure-sources` 与 `#homepage-risk-engines` 使用 `.mini-grid`
- ADR-0023 后两者位于 `#macro-professional-evidence` 内；渲染和数据含义保持不变
- `.mini-card.red/.yellow/.green` 仅使用 `--risk-*` 语义色
- mini-card 只承载 label / num / status 一行,避免旧 dossier sublist 回流

**narrative-list / narrative-item**:
- `#homepage-signal-layers` 使用 `.narrative-list`
- 每个 `.narrative-item` 含 `.emoji` / `.name` / `.score` / 一段 body
- `.narrative-item.active` 仅表达当前重点,不得替代 scoring 或 decision

**consistency-block**:
- `#homepage-cross-validation` 使用 `.consistency-block`
- `.consistency-bar .fill` 只展示一致性百分比
- 详细矩阵算法仍来自 `buildCrossValidationMatrix.js`,render 层不得重算核心逻辑

**wow-section / wow-item**:

```html
<section class="wow-section" id="wow-key-changes">
  <div class="wow-label">本期关键变化 · Week-over-Week</div>
  <h3>变化标题 <em>· this issue's deltas</em></h3>
  <div class="wow-grid">
    <article class="wow-item">
      <span class="wow-tag is-up">风险升高</span>
      <div class="wow-text">变化描述...<span class="wow-source">字段来源</span></div>
    </article>
  </div>
</section>
```

tag 颜色:
- `.is-up` → `var(--risk-yellow)` 背景 + 反白文字
- `.is-down` → `var(--risk-green)` 背景 + 反白文字
- `.is-flat`, `.is-gap` → `var(--paper-muted)` 背景 + 反白文字

**dashboard-jump-nav**:
- 顶部跳转导航固定 13 项
- 第 7 项 `#macro-thematic-cards` 必须带 `.new`
- 字体 mono 11px,`letter-spacing: 0.18em`,uppercase
- 默认色 `var(--paper-muted)`
- hover 时 `color: var(--paper-ink)` + `border-bottom: 1px solid var(--risk-red)`
- 上下边框 `1px solid var(--paper-line)`

---

## 5.6 M-94 V0 路径 C 视觉契约

M-94 V0 起,本站视觉权威基准为 `manual-artifacts/m94-v0/m94-v0-FINAL-mock-v2.html`(简称 mock v2.1,121.05 KB)。

任何视觉合约疑问以 mock v2.1 为准。本 DESIGN.md v2 是 mock v2.1 的文字化描述。

**PR4 增补(超出 mock v2.1)**:`#oil-directional-pressure` 独立能源专题是 mock v2.1 之后新增的一级 section(§4.1 #6 / jump-nav 第 11 项),**复用 `editorial-section` + `editorial-folded-content` 既有视觉族 + paper 色板**,无新增视觉范式;verdict(`#odp-verdict`)按 `finalBias` 动态上 red/yellow/green;内部 `<details>` 不带 `open`(同 §5.4 折叠约束)。display-only,不进打分/执行/Heatmap。见 `docs/ADR/0014-design-md-is-ia-ground-truth.md`。

**PR5 增补**:Hero `#homepage-today-judgment`(`.big-right`)内新增一行 muted 只读 ODP 交叉引用(`.hero-odp-ref`,`#hero-odp-ref-verdict` 由 `renderOilDirectional` set、链到 `#oil-directional-pressure`)。**非 IA 变更**(Hero 子元素,不动 §4.1 section 顺序 / §4.2 jump-nav 计数);display-only,明标「仅供观察,不进打分」,只 POINT 到独立专题、不混入打分判断。

**永久禁用的旧 IA 元素**(任何 PR 不得引入):
- 旧 `<section id="homepage-realtime-band">` 及其内部所有元素(`#rt-brent-source` / `#rt-brent-delta` 等 16 个子 ID)
- 旧 `<section id="world-heatmap">` SVG 投影层(由 6 cells 静态 grid 替代)
- 旧 jump nav 14 / 16 项结构(ADR-0023 后固定 13 项 + .new 主题卡阵)
- 旧 `#core-dashboard` / 旧 hero `.hero-*` selector 全套
- `<head>` 内联 `<style>` 块(M94_V0_DATA_CONTRACT.md §I.6 禁止)

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
| 既有 `.indicator-card .meta` 分隔 | `border-top: 1px dashed #999`（仅此旧声明例外） |
| 状态条（指标卡顶部） | `4px` 高，色彩按 status 着色 |

`#999` 例外仅限 assets/styles.css 中现有 `.indicator-card .meta` 的 border-top；不得推广至其它选择器或新组件。新边框继续使用允许的 token，未来迁移该旧声明须单独验证视觉差异。

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
- 字体 `var(--font-mono)`（IBM Plex Mono 栈）
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

1. ❌ 改变 §4.1 的 IA 顺序（除非走 §4.3 流程）
2. ❌ 添加新的一级 section 而不同步更新 §4.1 IA 顺序 / §5.6 视觉契约、未按 ADR-0014 的边界记录新决策，或未运行 `npm run check:frontend-live-contracts`
3. ❌ 把 Hero、AI 判读、WoW、阈值、趋势、四大驱动或市场温度改为折叠；ADR-0023 明确批准的局部 `#macro-professional-evidence` 除外
4. ❌ 把"附录 section"提升到主路径
5. ❌ 使用非标准的 className 派系（如 `editorial-heatmap-*`, `editorial-appendix-*`, `ia-detail-panel`, `advanced-panel` 作为顶层容器）

### 8.3 字体禁令

1. ❌ 引入任何非 Bubble Watch 三栈的字体
2. ❌ 在字体使用处直接写字体名字符串（使用 `var(--font-*)`；§3.1 的 token 定义除外）
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
   - `npm run check:all` 全绿，复用其中已执行的 `check:frontend-live-contracts` 专项；组成以 package.json / check-suite.mjs 为准。IA/字体/色彩未被脚本覆盖的条款仍须 review。
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
- 2026-06-11 视觉统一微调(对齐 Bubble Watch 原版,display-only、零数据/逻辑改动):
  masthead 题号 56→64px、下距 24→32px、kicker 字距 0.3em、issue-meta 正文墨色
  仅末行弱化;Hero 大数字回归 §5.3 契约 14vw/144(修复 CSS 漂移的 12vw/128)、
  判读标题改 display 字体 24-36px/1.2、正文 17px/1.7 暖墨、判读 kicker 橙→红;
  §5.1 section-title 字重 700→900。
- 2026-06-11(二批)runtime block / mini-card 移植 Bubble Watch 视觉语法(纯 CSS、
  零 DOM/数据/逻辑改动,owner 预览拍板):runtime-block 边框发丝线→1px 实墨、
  页眉下边框 1px 发丝线→2px 实墨、h3 18px/700→21px/900;mini-card 边框实墨化 +
  卡顶 4px 红/黄/绿状态条(同原版 indicator status-bar)、数字 20→26px display。
  布局与信息形态不变;"全卡片化"方案经评估否决(矩阵/叙事/图表的信息形态不适配
  卡片网格),统一手段 = 页眉/边框/状态条三条语法。
- 2026-06-11(三批)同套语法扩展到 ODP 一级 section 与 5 个折叠附录(纯 CSS):
  `.editorial-section-header` 统一加 2px 实墨下边框(覆盖全部一级 section 含 ODP);
  折叠附录 `details.editorial-folded-content` 外框升级为 1px 实墨(原仅上下线,
  保留 4px 墨色上缘)、summary 18px/700→21px/900、展开态 summary 获 2px 实墨
  下边框;窄屏(≤600px,横向 padding 归零)去侧边框防贴字。折叠行为/DOM 不变。
  补:嵌套在一级 section 内的折叠块(如 ODP「证据与详情」)**不加侧边框**——
  墨框语法只用于画布上的独立单元(顶级附录/卡片),section 内部用横线分隔,
  避免「框中框」失调(owner 发现并拍板)。

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
  #macro-risk-editorial       本期宏观判读（DeepSeek 只读编辑层；校验失败时隐藏）
  #wow-key-changes            本期关键变化（runtime 注入，不是顶级 section）
  #macro-professional-evidence 专业证据与模型诊断（AI 有效时默认收起；AI 失败时自动展开）
#macro-thematic-cards         宏观主题卡阵（绿色带）
#global-risk-heatmap          全球风险热力图（红色带）
#detail-data                  详细数据与图表（墨色带，折叠）
#world-order-stress-section   世界秩序压力层（regime overlay，橙色带，折叠）
#method-evidence              方法说明（墨色带，折叠）
#execution-risk-detail        执行与风控详情（红色带，折叠）

─── non-nav preface（可选，不进 jump nav，不计入 IA 编号）───
#plain-summary-card           普通用户 preface block（M-93A0 / 优化路径 3 · 已退场 / historical preface block,M-94 退场）
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
| 2026-05 | M-93A0: 引入 `#plain-summary-card` 非 nav preface block 概念；jump nav 15 项与 IA section 编号均不变；同步更新 `scripts/check-homepage-ia-contract.mjs` 和 `scripts/check-editorial-redesign-contract.mjs` | PR #<待 owner 填> |
| 2026-05 | M-94 V0 PR 1: IA 扩为 15 项，新增 `#macro-thematic-cards` 绿色带 section 容器骨架，并同步 DESIGN.md 与 IA checker 契约 | PR #<待 owner 填> |
| 2026-06 | IA 合约变更: 主题卡阵视觉顺序改为 C1/C2/C3/C4/C7/C8/C5/C6,将世界经济与中国宏观观察层置底,并新增 checker 锁定顺序 | PR #<待 owner 填> |
| 2026-06 | 观察层反应徽章语义更新: `印证` 颜色跟随有效主判断等级,`背离` 保留反向证据方向色;同步 checker 行为样例 | PR #<待 owner 填> |
| 2026-08 | ADR-0023: Macro Overview 改为叙事优先；WoW 紧随有效编辑层，五块确定性模型证据统一进入条件折叠区，AI 无资格时自动展开 | owner approved implementation |
| 2026-09 | ADR-0027：明确 token 定义及单条旧边框例外，纠正字体示例和退役检查器说明；页面未改 | owner approved documentation correction |
