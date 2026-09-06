# ADR-0011 — UI is editorial paper aesthetic, not SaaS dashboard

**Status**: Accepted (v28.0N editorial restructure); historical checker enforcement references superseded by [ADR-0027](0027-design-document-consistency.md). The visual decision remains accepted.

## Context

宏观风险数据网站默认参考系往往是 Bloomberg Terminal、TradingView、Sentry
dashboard 等深色密集仪表盘。但本项目定位是 **每日更新的机构级风险简报**,
不是实时监控大屏。如果照搬 dashboard 美学:

- 大量数据并列展示让用户失去阅读路径
- 深色背景 + 高饱和色让风险色 (红/黄/绿) 失去语义对比
- 没有阅读节奏,用户感受是 "信息过载" 而非 "判断清晰"

## Decision

**视觉真实基准是 The Bubble Watch / AI 泡沫监测**(Editorial Data
Journalism 风格),具体:

| 错误参考系 | 正确参考系 |
|---|---|
| Bloomberg Terminal (深色 dashboard) | The Economist (纸张研究简报) |
| TradingView 实时图表 | Bloomberg Weekly (每周头版分析) |
| SaaS 产品官网 | Wall Street Journal Markets 版面 |
| AI 创业公司 landing page | 央行金融稳定报告 |

**核心原则**:

- **纸张感优先**:暖纸张底色 (`--paper-bg: #FBF7F0`) + 深墨文字 (`--paper-ink: #1A1815`)
- **报纸节奏优先**:清晰的 section header + 色带 + 阅读顺序,不是密集网格
- **风险色克制使用**:红/黄/绿仅用于语义状态,不做装饰
- **字体三栈分工严格**:display / serif / mono 各司其职,**禁止混用 sans-serif**
- **边框驱动视觉**:1px 实线、3px 双线、4px 顶部色带做层次,**不用 box-shadow**,
  **不用大圆角**

完整规则见 `DESIGN.md`,由 `check:editorial-redesign-contract` 与
`check:homepage-ia-contract` 强制执行。

## Consequences

- ✅ 用户首次访问能感受到 "严肃媒体" 而非 "AI 创业产品"
- ✅ 风险色语义清晰
- ✅ 长文档式阅读路径 (而非 "扫一眼仪表盘")
- ❌ 不能用流行 design system (Material / shadcn / Tailwind preset)
- ❌ 新增 UI 必须先读 `DESIGN.md`,违反会被 `check:editorial-redesign-contract` 拦截

⚠️ **NEVER** 在 frontend 加入深色主题、box-shadow、大圆角、sans-serif 装饰字体。
⚠️ **NEVER** 把 6 大风险模块改成 dashboard 式横向 grid (违反 IA contract)。

## References

- `DESIGN.md` 全文
- `scripts/check-editorial-redesign-contract.mjs`
- `scripts/check-homepage-ia-contract.mjs`
- v28.0N 系列 editorial restructure milestones
