# M-92 Gap Analysis V2: Revised after fact check

## 1. Audit Baseline

本报告为上一份 `docs/SUMMARY_VIEW_M92_GAP_ANALYSIS.md` 的事实核对后重做版。

审计基准：

- Git HEAD commit: `a57310f9c7fc91c3b97b026609b1a3e48c83686a`
- 当前前端 cache version: `28.0M-91V`
- Playwright 实测时间: `2026-05-23T06:24:05.304Z`
- 权威环境: 环境 A，真实生产环境 `https://radar.gfrfinradar.uk`
- 对照环境: 环境 B，GitHub Pages `https://ctmaomao.github.io/gfrr-auto-update-site/`; 环境 C，本地 HTTP server
- 测试方式: headless Chromium; 每个环境分别测 `375x667` 与 `1440x900`; `goto` 后 `waitForLoadState('networkidle')`，再等 2 秒，再回到 `scrollY=0` 量 DOM

环境核对结论：

- 环境 A/B/C 均成功注入 `#homepage-today-judgment`。
- 三个环境的几何结果一致：移动端 `375x667` 初始首屏看不到 today card; 桌面端 `1440x900` 初始首屏能看到 `59` 大数字和右侧一句话判断。
- 生产环境数据请求可信：`radar-data.json`、`market-pricing-metrics.json`、`world-order-stress.json`、Worker preview 均返回 `200`; 无 `requestfailed`; 无 `pageerror`。
- 用户截图与生产桌面实测一致：`#homepage-today-judgment .editorial-big-number-value` 在桌面首屏内，位置 `top=771,bottom=895`; `#homepage-today-judgment .editorial-verdict-title` 也在首屏内，位置 `top=725,bottom=958`。

## 2. Phase 0 Fact Check

### 0.1 today-judgment DOM 注入路径

`#homepage-today-judgment` 不是静态 HTML 中已有的 ID。静态 HTML 里只有：

- `#macro-risk-overview` section: `index.html:551`
- `#macro-risk-overview-root` 容器: `index.html:557`
- root 内的 market temperature waiting state: `index.html:558-572`
- 同一个 `#macro-risk-overview` 下还有静态 `#homepage-realtime-band`: `index.html:574-657`

动态注入路径：

- `scripts/app.js:31-38` 先等待 `fetchBaselineData()`、`fetchHistoryData()`、`fetchRealtimePayload()`、`fetchWorldOrderStressData()`，再构建 runtime state。
- `scripts/app.js:88` 第一次调用 `renderMacroRiskOverview(data, healthDashboard, worldOrderStressData)`。
- `scripts/app.js:89-91` 等 `market-pricing-metrics.json` 返回后第二次调用 `renderMacroRiskOverview(...)`，补市场温度指标。
- `renderMacroRiskOverview()` 默认容器为 `$('macro-risk-overview-root')`: `scripts/modules/renderMacroOverview.js:3051`。
- 它先 `container.replaceChildren()`: `scripts/modules/renderMacroOverview.js:3054`，清掉静态 waiting state。
- 然后第一行动态 section 就是 `appendSection(container, '今日总判断', ..., 'homepage-today-judgment')`: `scripts/modules/renderMacroOverview.js:3056`。
- `appendSection()` 通过 `root.appendChild(section)` 插入: `scripts/modules/renderMacroOverview.js:2985-2991`。

因此，`#homepage-today-judgment` 是 `#macro-risk-overview-root` 的第一个动态子节点。Playwright 生产环境也确认 `directChildren` 顺序为：

`0:homepage-today-judgment | 1:homepage-pressure-sources | 2:homepage-signal-layers | 3:homepage-macro-drivers | 4:homepage-market-temperature | 5:homepage-risk-engines | 6:homepage-cross-validation | 7:wow-key-changes | 8:(watch-list)`

数据依赖与失败行为：

- `fetchBaselineData()` 直接 fetch `./data/radar-data.json`: `scripts/modules/realtime.js:36-38`。
- 若 `radar-data.json` 加载失败，`Promise.all` 会 reject，`main().catch(...)` 只把 runtime badge 改为 `加载失败` 并写 `summary-text`: `scripts/app.js:198-203`。此时 `renderMacroRiskOverview()` 不会执行，`#homepage-today-judgment` 不会注入，root 内会保留静态 market temperature waiting state。
- `market-pricing-metrics.json` 失败不会阻止 today card 注入，因为 `fetchMarketPricingMetricsData()` 自带 catch 并返回 `null`: `scripts/app.js:11-26`。

### 0.2 三环境 Playwright 核对

| 环境 | Viewport | 数据请求 | today 注入 | today 位置 | score 位置 | one-line 位置 |
|---|---:|---|---|---|---|---|
| A production | `375x667` | 全部 `200` | 是 | `N:725-2415` | `N:897-974` | `N:1235-1429` |
| A production | `1440x900` | 全部 `200` | 是 | `Y:569-1447` | `Y:771-895` | `Y:725-958` |
| B GitHub Pages | `375x667` | 全部 `200` | 是 | `N:725-2415` | `N:897-974` | `N:1235-1429` |
| B GitHub Pages | `1440x900` | 全部 `200` | 是 | `Y:569-1447` | `Y:771-895` | `Y:725-958` |
| C local HTTP | `375x667` | 全部 `200` | 是 | `N:725-2415` | `N:897-974` | `N:1235-1429` |
| C local HTTP | `1440x900` | 全部 `200` | 是 | `Y:569-1447` | `Y:771-895` | `Y:725-958` |

`Y/N` 表示是否与当前 viewport 相交。

### 0.3 上一份审计的问题

上一份审计测的是环境 C：本地 HTTP server，不是生产 URL，也不是 `file://`。本次核对发现本地 HTTP 的几何结果与生产一致，但上一份报告作为最终判断仍不合格，原因有三点：

1. 它没有先用生产环境作为权威事实源。
2. 它把“6 元素完整验收 `0/6`”表达得过于像“桌面首屏没有 today card”。这与用户截图和生产桌面实测冲突。
3. 它对 `top=725,bottom=958` 的表述容易误导：生产桌面这个位置对应的是 `.editorial-verdict-title` 一句话判断，不是整个 `#homepage-today-judgment`。生产桌面整个 today section 是 `top=569,bottom=1447`; 生产移动端 today section 是 `top=725,bottom=2415`。

结论：**上一份审计无效，本次重做。** 更准确地说，上一份的移动端几何测量在生产环境可复现，但桌面可见性解释和最终推荐依据不够透明，不能作为 M-92 决策依据。

## 3. Phase 1 Element Coverage

本节只以环境 A 生产环境为权威数据。生产环境 runtime:

- `frontendVersion=28.0M-91V`
- `runtimeSource=worker-generated-preview`
- `dataScore=59`
- `baselineScore=56`
- `scoreChange1d=-1`
- `scoreChange7d=1`
- `dailyBrief.generatedAt=2026-05-22T23:38:06.539Z`
- `dailyRealtimeInput.updatedAt=2026-05-22T22:43:22.032Z`

### 元素 1：今日总判断（一句话）

现有覆盖度：部分覆盖

DOM 位置：`#homepage-today-judgment .editorial-verdict-title`。生产桌面首屏可见，`top=725,bottom=958`; 生产移动端首屏不可见，`top=1235,bottom=1429`。  
数据字段：`data/radar-data.json:15-16` 的 `dailyBrief.macroState` 与 `dailyBrief.oneLineConclusion`。  
渲染代码：`scripts/modules/renderMacroOverview.js:393-395` 读取 `dailyBrief.oneLineConclusion`; `scripts/modules/renderMacroOverview.js:422` 写入 `oneLine`; `scripts/modules/renderMacroOverview.js:3079-3081` 渲染 title/body。  
30 秒可读性：桌面 PASS / 移动端 FAIL。桌面用户能看到一句主判断，但句子偏审计化，含“最大背离”和 `display-only` 边界说明；移动端首屏无法看到。  
移动端首屏：FAIL。  
缺口：需要在移动端减少 hero/nav/header 占用或把 today card 前移；一句话本身也应更像“宏观态势摘要”，边界语可下放。

### 元素 2：风险分数 + 趋势

现有覆盖度：部分覆盖

DOM 位置：score 在 `#homepage-today-judgment .editorial-big-number-value`; 趋势在 `#homepage-today-judgment .editorial-meta-grid` 的 `1日变化`。生产桌面 score 可见 `top=771,bottom=895`; meta grid 不可见 `top=1161,bottom=1244`; 生产移动端 score 不可见 `top=897,bottom=974`。  
数据字段：`data/radar-data.json:827-830` 有 `score`、`scoreChange1d`、`scoreChange7d`、`scoreChange30d`。生产 runtime 也显示 `scoreChange1d=-1`, `scoreChange7d=1`。  
渲染代码：`scripts/modules/renderMacroOverview.js:363` 读取 score; `scripts/modules/renderMacroOverview.js:409` / `425` 只用 `scoreChange1d`; `scripts/modules/renderMacroOverview.js:3067-3075` 渲染大数字; `scripts/modules/renderMacroOverview.js:3096-3102` 渲染 `1日变化`。  
30 秒可读性：FAIL。桌面可见大数字，但 `vs 昨日` 在首屏下方，`vs 上周` 完全未渲染。  
移动端首屏：FAIL。  
缺口：`scoreChange7d` 已存在但顶部未消费; `1日变化` 和周变化需要和 score 放到同一视觉单元。

### 元素 3：Top 3 风险来源

现有覆盖度：部分覆盖

DOM 位置：`#homepage-pressure-sources` 与 `.editorial-pressure-card`。生产桌面 section 不可见 `top=1465,bottom=2933`; 前三张 pressure cards 均不可见 `top=1654,bottom=2506`。生产移动端 section 不可见 `top=2433,bottom=5174`。  
数据字段：`dailyBrief.dominantRiskChain.evidence` 已有 3 条主链证据 `data/radar-data.json:17-44`; `displayInputsBaseline` 从 `data/radar-data.json:838` 起; `macroDrivers` 从 `data/radar-data.json:886` 起。  
渲染代码：`scripts/modules/renderMacroOverview.js:431-590` 生成 5 个 pressure judgments 并按 `priority` 排序; `scripts/modules/renderMacroOverview.js:3109-3123` 渲染 pressure section。  
30 秒可读性：FAIL。排序和证据存在，但不在首屏，也不是三行摘要。  
移动端首屏：FAIL。  
缺口：需要将前三个风险来源压缩到 today summary 内，每条只保留一个证据; 下方详细 pressure cards 保持不变。

### 元素 4：Top 3 噪音/背离提示

现有覆盖度：部分覆盖

DOM 位置：`#homepage-signal-layers` 与 `.editorial-signal-card`。生产桌面 section 不可见 `top=2951,bottom=3634`; 四张 signal cards 均不可见 `top=3168,bottom=3615`。生产移动端 section 不可见 `top=5192,bottom=7213`。  
数据字段：`dailyBrief.largestDivergence` 在 `data/radar-data.json:46-67`; `divergenceLayer.primaryDivergence` 与 checks 从 `data/radar-data.json:130` 起; `dailyBrief.invalidationSignals` 在 `data/radar-data.json:75-80`。  
渲染代码：`scripts/modules/renderMacroOverview.js:592-697` 生成 verified / pending / noise / formal-boundary 四组; `scripts/modules/renderMacroOverview.js:615-630` 使用 `largestDivergence`; `scripts/modules/renderMacroOverview.js:671-683` 渲染通用噪音提示; `scripts/modules/renderMacroOverview.js:3125-3139` 渲染 signal section。  
30 秒可读性：FAIL。存在“待验证 / 噪音提示 / 正式源边界”，但不是明确 Top 3 矛盾信号，也不在首屏。  
移动端首屏：FAIL。  
缺口：需要从现有 divergence/signal 数据生成三条摘要化“噪音或背离”行; 不需要新增数据源。

### 元素 5：数据健康状态

现有覆盖度：部分覆盖

DOM 位置：`#homepage-today-judgment .editorial-big-number-breakdown`、`.editorial-verdict-meta`、`.editorial-meta-grid`。生产桌面这三项均不在首屏：breakdown `top=954,bottom=1014`; verdictMeta `top=1053,bottom=1116`; meta `top=1161,bottom=1244`。生产移动端也均不可见。  
数据字段：`dailyRealtimeInput.healthScore`、`updatedAt`、`capturedAt` 在 `data/radar-data.json:4-10`; `dailyBrief.generatedAt` 在 `data/radar-data.json:14`; confidence 在 `data/radar-data.json:87-90`。  
渲染代码：`scripts/modules/renderMacroOverview.js:364-368` 读取 health score; `scripts/modules/renderMacroOverview.js:390-392` 生成数据覆盖; `scripts/modules/renderMacroOverview.js:3071-3075` 与 `3098-3102` 渲染覆盖和更新时间。  
30 秒可读性：FAIL。生产页面有 `数据覆盖：100%` 与更新时间，但没有“良好 / 一般 / 降级”显式档位，也不在桌面首屏可见。  
移动端首屏：FAIL。  
缺口：需要一个明确 data health pill，并显示关键源更新时间; 可用现有字段推导。

### 元素 6：今日一句结论

现有覆盖度：部分覆盖

DOM 位置：`#homepage-today-judgment .editorial-verdict-body`。生产桌面首屏不可见，`top=972,bottom=998`; 生产移动端不可见，`top=1443,bottom=1496`。  
数据字段：`dailyBrief.keyTriggers` 在 `data/radar-data.json:68-74`; `dailyBrief.invalidationSignals` 在 `data/radar-data.json:75-80`; score/stage 在 `data/radar-data.json:827-834`。  
渲染代码：`scripts/modules/renderMacroOverview.js:374` 生成 stage 文案; `scripts/modules/renderMacroOverview.js:3079-3085` 渲染 verdict body 和主要压力。  
30 秒可读性：FAIL。当前正文是状态解释，不是综合 1-5 后的行动建议。  
移动端首屏：FAIL。  
缺口：需要硬编码模板输出“保持谨慎 / 趋稳 / 降级评估”等 display-only 建议，不能接 execution / position。

## 4. Phase 2 IA Structure Reassessment

### 真实 IA 结构

`#macro-risk-overview` 静态 HTML 直接子区块：

1. `.editorial-section-header`: `index.html:552-556`
2. `#macro-risk-overview-root`: `index.html:557-573`
3. `#homepage-realtime-band`: `index.html:574-656`

`#macro-risk-overview-root` 静态初始内容只有 `#homepage-market-temperature` waiting state: `index.html:558-572`。

JS runtime 动态注入顺序：

1. `#homepage-today-judgment`: `scripts/modules/renderMacroOverview.js:3056`
2. `#homepage-pressure-sources`: `scripts/modules/renderMacroOverview.js:3109`
3. `#homepage-signal-layers`: `scripts/modules/renderMacroOverview.js:3125`
4. `#homepage-macro-drivers`: `scripts/modules/renderMacroOverview.js:3141`
5. `#homepage-market-temperature`: `scripts/modules/renderMacroOverview.js:3156`
6. `#homepage-risk-engines`: `scripts/modules/renderMacroOverview.js:3161`
7. `#homepage-cross-validation`: `scripts/modules/renderMacroOverview.js:3177`
8. `#wow-key-changes`: `scripts/modules/renderMacroOverview.js:3195`
9. watch list: `scripts/modules/renderMacroOverview.js:3196`

折叠区默认状态：

- `#detail-data`: 有 `details.editorial-folded-content`，默认 `open=false`; source `index.html:687-699`
- `#world-order-stress-section`: 默认 `open=false`; source `index.html:1315-1326`
- `#method-evidence`: 默认 `open=false`; source `index.html:1398-1409`
- `#external-ai-auxiliary`: 默认 `open=false`; source `index.html:1452-1464`
- `#execution-risk-detail`: 默认 `open=false`; source `index.html:1468-1479`

### 对上一份推荐的修正

真实 IA 已经有“上层摘要 + 下层折叠详情”的架构。用户首屏看到的“主判断 -> 详细”层级关系在桌面端已经存在，生产截图对此是正确证据。

但这不等于 6 元素已经集中：

- today card 只集中了一句话、score、部分数据覆盖、阶段说明。
- Top 3 风险仍在 `#homepage-pressure-sources`，不在首屏。
- 噪音/背离仍在 `#homepage-signal-layers` / divergence detail，且不是 Top 3。
- `scoreChange7d` 数据存在但没有在顶部渲染。
- 数据健康没有“良好 / 一般 / 降级”显式状态。
- 今日一句结论不是行动建议。

所以问题不是“完全没有上层摘要架构”，而是“现有上层摘要卡没有把 6 元素压缩成同一个 30 秒视图”。这比上一份审计的说法更窄、更准确。

## 5. Phase 3 Revised Recommendation

修正推荐：**C：重组，但限定为局部 summary card 重组，而不是新增独立 M-92 视图，也不是重做整个首页 IA。**

四选一判断：

- A 足够：不成立。生产桌面只可见一句话与 score 的表层; 移动端初始首屏 `0/6`; 7 日趋势、Top 3 风险、Top 3 噪音、显式数据健康、行动建议都未达标。
- B 微调：不成立。CSS/字号/间距可以改善桌面密度，但不能补出未渲染的 `scoreChange7d`、Top 3 风险摘要、Top 3 噪音/背离摘要、健康档位和行动建议。B 的前提是“6 元素全部覆盖”，这里不满足。
- C 重组：成立。现有字段和 builder 大多够用，但需要把 6 元素组织进 `#homepage-today-judgment` 的同一张 30 秒 summary card。下方详细 pressure/signal/driver/market-temperature/risk-engine/cross-validation 模块可以保持原结构。
- D 新增：不成立。生产环境已经有 top summary entry point; 新增独立摘要视图会和 `#homepage-today-judgment` 重叠。应改造现有 today card，而不是另开平行模块。

推荐范围：

- 只调整 `#homepage-today-judgment` 内部结构和少量 CSS。
- 不改详细模块正文，不改下方压力卡/信号卡/驱动卡的详细信息。
- 不改数据产物，不新增数据源。
- 可消费现有 `scoreChange7d` 字段，但不改变 scoring。
- 所有文案保持硬编码模板，不引入 AI 生成。
- 如未来实现触及 frontend JS/HTML，按 `AGENTS.md:109` 同步 cache version。

与上一份推荐的差异：

- 上一份推荐 C 的理由偏粗，容易让人理解为“现有首页没有上层摘要结构”。
- 本次仍推荐 C，但修正为“局部重组 today summary card”。桌面已有 59 + 一句话首屏可见，这一点必须承认; 缺口在于 6 元素没有完整集中，尤其移动端和未渲染字段。

## 6. Phase 4 Self-Audit

1. 方案一致性：本次结论基于生产环境 Playwright 输出。关键实测值：生产桌面 `today=Y:569-1447`, `score=Y:771-895`, `oneLine=Y:725-958`; 生产移动 `today=N:725-2415`, `score=N:897-974`, `oneLine=N:1235-1429`; 生产数据请求全部 `200`，无 `requestfailed`。
2. Contract checker 完整性：本次只新增审计文档，不修改 checker，也不建议放宽 checker。若未来实施 C，应新增/增强前端 contract checker，而不是削弱现有检查。
3. Ignore list 显性化：本任务不涉及新增 checker 或 ignore list，跳过。
4. 事实核对透明度：已明确承认上一份审计没有以生产环境为权威，且把桌面“完整 6 元素不达标”表达成了容易误读的“首屏不可见”。错误来源是测试环境权威选择不当和结论表述不精确，不是 DOM 未注入。

## 7. Next Steps

建议最小后续 milestone：

`M-92A Today Summary Card Reflow`

范围：

- 只改 `#homepage-today-judgment` summary card 的 DOM 排布和对应 CSS。
- 目标是在 `375x667` 与 `1440x900` 初始首屏内完整显示 6 元素。
- 复用现有字段：`score`、`scoreChange1d`、`scoreChange7d`、`dailyBrief.oneLineConclusion`、`dailyBrief.dominantRiskChain`、`dailyBrief.largestDivergence`、`divergenceLayer.checks`、`dailyRealtimeInput`、`healthDashboard`。
- 保持所有 detailed modules 一字不改。
- 保持 `dailyBrief` / `divergenceLayer` / `macroDrivers` display-only / audit-only 边界，不接 scoring / decision / execution / position。
