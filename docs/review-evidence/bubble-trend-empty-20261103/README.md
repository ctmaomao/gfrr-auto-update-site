# Bubble 核心趋势空状态验收

本 PR 符合 DESIGN.md 的所有规则。owner 批准只修复空状态展示，保留证据与计分门槛；本聊天沿用 owner 指定 Codex AI 代审，不冒充独立人工 review。

相同已发布 Bubble JSON（2026-11-02，SHA256 `a66f87e33e264b119eedcad1f3cc32d5d0458dcd8118707dad913a0004dd4895`）的本地真实 Chromium 对照：

| 视口 | Before | After | 内容区高度 |
|---|---|---|---|
| 1440px | [原空态](before-1440.jpg) | [紧凑空态](after-1440.jpg) | 220 → 115px |
| 390px | [原空态](before-390.jpg) | [紧凑空态](after-390.jpg) | 220 → 184px |

计算样式与 DOM 实测：[before](before-facts.json)、[after](after-facts.json)。纸色 `rgb(251,247,240)`、深墨文字、serif 正文与 display 标题不变；标题仍 22px，空态正文 14px、次要边界说明 12px。两宽均无横向溢出或脚本错误。

空状态直接读取已发布核心清单、卡片灯色及 summary 的范围；当前 21/23，缺失为数据中心 ABS 利差与资本开支财报关联反应；红灯比例 30.4–39.1%，辅助压力 43.5–52.2 / 100。区间是证据缺口的数学上下界，不是概率或统计置信区间。固定 23 槽位未改变；缺卡仍计作缺口，影子项不入覆盖，不以缩分母重算风险。

五项浏览器回归由 `tests/e2e/bubble-trend-empty.spec.mjs` 验证：桌面/手机、缺卡/影子/名称转义、无效范围/真实零、空态与曲线双向切换及 resize/hover。合成 fixture 仅用于 UI 断言，不写生产或作为源证据。已有图表口径、数据、checker、计分、工作流与字体加载均未改动；没有新增依赖或 live fetch。
