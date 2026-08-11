# ADR-0022: 宏观风险 AI 编辑层集成到主总览

- 状态: Accepted
- 日期: 2026-08-11
- 批准: Owner thread approval
- 扩展: ADR-0008、ADR-0011、ADR-0018、ADR-0021

## 背景

主页面 `MACRO RISK OVERVIEW · 宏观风险判断总览` 已有确定性 Hero、六大风险模块、
趋势、交叉验证、主题卡和规则化 `aiInterpretationLayer`。另有独立折叠卡
`外部 AI 解读 · External AI Auxiliary (read-only)`，由每日
`External AI Production Refresh` 写入 `externalAiInterpretationLayer`。

该独立卡与主阅读路径割裂，且现有外部 AI 输出以字段复述和附录式审计为主，没有充分利用
近 7 日新闻、周内时间线、跨模块矛盾、历史差异和反证条件。Bubble Watch 的周度长篇编辑层
已经证明，单次 DeepSeek JSON 调用、严格来源引用、质量审查和确定性 fallback 可以在不影响
评分的情况下显著提高解释质量。

## 决策

1. 新增顶层 `macroRiskEditorialLayer`，生产 schema 固定为
   `macro-risk-editorial-production-v1`。它属于主页面只读编辑展示层，不覆盖任何评分字段。
2. 用户可见名称为 `本期宏观判读 · THIS ISSUE'S VERDICT`，直接置于 Macro Risk Overview
   Hero 后，组织为：近 7 日时间线、分数与状态变化、六大模块、跨市场矛盾、历史差异、
   后续观察与数据限制。
3. 现有 Hero 的确定性 headline/body 永远保留为 fallback。AI 层缺失、过期、与当前
   `radar-data.updatedAt` 不一致、provider 失败、结构校验失败或质量 hard fail 时，页面只使用
   当前规则化输出。
4. 新层复用现有 DeepSeek provider 与 `external-ai-production-refresh` protected environment，
   但使用独立 input/output/review/production contract、独立 validator 和独立 writer。
5. 新闻发现只使用 Tavily / Brave 近 7 日结果，经 URL/title 去重与 evidence-class 标记后进入
   compact input。`discovery_only` 不能成为事实段落的唯一支撑。
6. Provider 每个生产周期最多一次调用、retry=0、`max_tokens=8000`、JSON object only。
   目标可见中文正文为 2,800–3,800 字；这比 Bubble Watch 的范围略宽，以覆盖六大宏观模块。
7. 新 workflow 每日一次，接在 Daily Radar、World Order 和 ODP 刷新之后；它取代旧
   `External AI Production Refresh` 的每日付费职责，不增加既有日频调用次数。
8. 删除主页面 `#external-ai-auxiliary`、导航入口、旧 renderer 与相应 frontend acceptance。
   `externalAiInterpretationLayer` 数据字段和离线工具暂时保留为兼容/审计历史，但停止日常
   provider 刷新，也不再有任何用户可见消费方。
9. `macroRiskEditorialLayer` 不得影响 `score`、六大模块、`tailRiskOverlay`、
   `decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor、
   Invalidation Rules、World Order、ODP、Bubble Watch 或 cross-validation。

## 后果

- 主页面的 AI 解读进入核心阅读路径，不再作为重复附录存在。
- 旧 External AI 可见模块和每日成本路径退场，但历史生产字段无需破坏性迁移。
- Daily 与 AI 写入仍解耦；AI 失败不会阻断 Daily，也不会降低主评分有效性。
- 新生产链需要独立新闻 collector、compact input、provider contract、quality review、writer、
  workflow、frontend fallback 和桌面/移动端验收。

## 不变量

- 生产公式和六大模块权重不变。
- 当前主分只表示同步压力温度，不得包装为危机概率或六个月预测。
- `aiInterpretationLayer` 继续是 rule-based、`generatedByExternalAi=false` 的确定性解释基线。
- 参考站与 Bubble Watch 输出只能用于结构和篇幅标定，不作为主页面生产输入。
- External AI 仍受 ADR-0008 的 read-only firewall 约束。

## 参考

- `docs/MACRO_RISK_EDITORIAL_DESIGN.md`
- `docs/BUBBLE_WATCH_WEEKLY_EDITORIAL_DESIGN.md`
- `docs/EXTERNAL_AI_API_DESIGN.md`
- `docs/EXTERNAL_AI_PROMPT_CONTRACT.md`
- `docs/DATA_CONTRACT.md`
- `docs/DATA_SOURCES.md`
- `docs/OPERATIONS.md`
