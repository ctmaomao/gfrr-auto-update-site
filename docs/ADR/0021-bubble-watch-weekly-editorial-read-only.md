# ADR-0021: Bubble Watch 周度 AI 编辑为独立只读展示层

- 状态: Accepted
- 日期: 2026-08-11
- 批准: Owner thread approval
- 扩展: ADR-0008、ADR-0016、ADR-0019

## 背景

Bubble Watch v2 已有稳定的 Core-23 / Shadow-4 评分合同、周一数据刷新、
`bubble-watch-narrative-v2` 规则正文和多源 fail-closed 数据链。当前规则正文可复算，
但它主要按固定段落组织指标值，缺少参考站式的周内事件时间线、跨指标因果链、
历史差异和下周反证条件。

仓库已有受验证器、质量审阅和写入保护约束的 DeepSeek 生产路径。直接把 Bubble
Watch 输入并入主页 `externalAiInterpretationLayer` 会混淆两个数据契约，也会让
Bubble Watch 的周频刷新与主页日频解释层耦合。

## 决策

1. 新增独立的 `summary.weekly_editorial`，生产 schema 固定为
   `bubble-watch-weekly-editorial-production-v1`。它与主页
   `externalAiInterpretationLayer` 平行，不复用该字段、不覆盖 rule-based
   `summary.verdict_desc`。
2. DeepSeek 只能消费经过 allowlist、去重、时效和来源状态校验的周度证据包。
   Provider 不浏览网页，不读取 secrets、原始日志、HTML、完整新闻正文或任意本地文件。
3. 新闻发现仅属于 `github_actions_backup_validation_layer`，输入清洗属于
   `artifact_sanitizer_layer`，最终字段属于 `frontend_display_layer`。不创建 ad-hoc
   pipeline。
4. Tavily / Brave 只负责发现和交叉确认。生产层只保留必要的来源引用元数据；不提交
   provider raw response、完整新闻正文或 search snippet。
5. DeepSeek 只编辑解释文本，不得改变 27 卡状态、Core-23、Shadow-4、主分、
   weighted pressure、Stage / Trigger、分类共振、历史相似度或 verdict label。
6. `summary.verdict_desc` 始终保留为确定性 fallback。AI 层缺失、过期、provider
   失败、结构验证失败、质量审阅 hard fail 或来源不足时，页面必须只显示该 fallback。
7. DeepSeek 每个周度周期最多调用一次，不自动重试。`provider_unavailable`、timeout、
   invalid JSON、unsafe copy 或来源引用错误均停止写入，不触发第二次付费调用。
8. 生产写入必须经过专用 writer。Writer 只允许改
   `data/bubble-watch.json.summary.weekly_editorial`，并证明评分、指标、历史和其他
   Bubble Watch 字段保持不变。
9. 前端只读展示经批准的新鲜 `valid` 层，显示 provider、生成时间、置信度、数据限制
   与来源链接。用户可见文字保持中文、克制、非交易导向。

## 后果

- 规则正文继续提供可复算的稳定基线，DeepSeek 故障不会破坏页面或评分。
- 长篇编辑层可以增加周内时间线、关键矛盾、分类分析、历史差异和观察条件。
- 新闻搜索成本被限制为周频；DeepSeek 成本限制为每周一次。
- 新链路需要独立 input / output / review / production contract、workflow、writer guard、
  frontend fallback 和端到端验收。
- 参考站正文可用于结构校准，但不得作为 production 输入或被复制。

## 不变量

- `primary_score_pct = Core-23 red count / 23` 不变。
- Shadow-4 继续 `display_only_no_score_impact`。
- `summary.verdict_desc_source = bubble-watch-narrative-v2` 不变。
- `meta.upstream_sync.summaryAdopted=false` 不变。
- 不影响 GFRR `values.*`、scoring、decision、execution、position、Worker、Brent、ODP、
  World Order、Global Risk Heatmap 或 cross-validation。

## 参考

- `docs/BUBBLE_WATCH_WEEKLY_EDITORIAL_DESIGN.md`
- `docs/EXTERNAL_AI_API_DESIGN.md`
- `docs/EXTERNAL_AI_PROMPT_CONTRACT.md`
- `docs/DATA_CONTRACT.md`
- `docs/DATA_SOURCES.md`

