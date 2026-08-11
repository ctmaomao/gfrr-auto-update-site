# Bubble Watch Weekly Editorial — DeepSeek 生产设计

## 1. 状态与目标

- 状态: Owner approved for staged implementation, 2026-08-11.
- 目标: 在不改变 Bubble Watch v2 评分合同的前提下，用 DeepSeek 将经过审计的周度
  新闻和站内结构化数据编辑为更丰富的「本周判读」。
- 参考结构: 周内时间线 → 分数变化 → 关键矛盾 → 分类分析 → 历史差异 → 下周观察。
- 非目标: 预测泡沫破裂日期、生成交易建议、修改灯色或让 AI 成为数据源。

## 2. 不可突破的边界

1. Core-23 / Shadow-4、主分、Stage / Trigger、分类共振、momentum、similarity 和
   `verdict_label` 只能由现有 builder / checker 决定。
2. `summary.verdict_desc` 和 `bubble-watch-narrative-v2` 永远保留为确定性 fallback。
3. DeepSeek 只能读 allowlisted compact input；provider 不浏览、不抓网页、不读取 secrets。
4. 新闻只作解释层 evidence。任何新闻失败不降低 Bubble Watch 数据与评分有效性。
5. 用户可见输出不得含交易、仓位、现金、敞口、执行、确定性崩盘或无来源市场数字。
6. 参考站 `summary.verdict_desc` 不进入 input，不复制到 output。

## 3. 统一数据架构归属

| 子路径 | assignedLayer | primaryOwnerLayer | 说明 |
|---|---|---|---|
| Tavily / Brave 周度发现 | `github_actions_backup_validation_layer` | `github_actions_backup_validation_layer` | 周一 Bubble Watch 数据完成后运行 |
| transient news discovery / compact input / provider output / review | `artifact_sanitizer_layer` | `artifact_sanitizer_layer` | ignored / workflow artifact，不是 production data |
| `summary.weekly_editorial` | `frontend_display_layer` | `frontend_display_layer` | 仅写 `data/bubble-watch.json` 的独立只读字段 |

禁止 `standalone` / `ad_hoc`，禁止 Worker、Daily radar、realtime 或浏览器端外部请求。

## 4. Source registry

### 4.1 站内结构化来源

- `data/bubble-watch.json`: Core-23 / Shadow-4、各指标来源、narrative plan、WoW、历史相似度。
- `data/radar-data.json`: allowlisted 宏观/市场背景摘要；只取 compact 字段。
- `data/oil-news-event-watch.json`: 只取已清洗的聚合状态和 data gaps，不把其 proxy 写成
  油价方向或供应中断确认。

### 4.2 新闻发现来源

- Tavily Search API `topic=news`,最多 6 个预登记 topic、每 topic 最多 5 条。
- Brave News Search API `freshness=pw`,相同 topic、每 topic 最多 5 条。
- 一期不新增 GDELT endpoint。现有 GDELT Bubble cache 仍只服务 `ceo_hedging`。
- 搜索结果只在 transient artifact 中保留 bounded title / URL / snippet；production 只投影
  provider 实际引用的 title / URL / domain / publishedAt / topic / evidence status。

### 4.3 预登记 topics

1. `ai_capex_earnings`
2. `ai_financing_credit`
3. `ai_demand_fundamentals`
4. `market_structure_valuation`
5. `macro_policy`
6. `accounting_regulatory`

Collector 必须按 canonical URL + title fingerprint 去重。官方来源可标 `official`；至少两个
独立 domain 的同一 story cluster 可标 `cross_checked`；其余只能 `discovery_only`，不得作为
AI `facts` 的唯一依据。

## 5. Contract family

### 5.1 News discovery

- `schemaVersion = bubble-watch-weekly-news-discovery-v1`
- 包含 `generatedAt`、`window`、`sourceStatus`、`topics[]`、`stories[]`、`dataGaps[]`。
- `stories[]` 每项包含稳定 `id`、topic、bounded title/snippet、canonical URL、domain、
  publishedAt、providers、evidenceStatus。
- 禁止 raw response、headers、API key、完整正文和不受限数组。

### 5.2 DeepSeek compact input

- `schemaVersion = bubble-watch-weekly-editorial-input-v1`
- 包含:
  - `asOfDate`
  - `scoringSnapshot`
  - `narrativeBaseline`
  - `structuredFacts[]`
  - `newsContext`
  - `historicalContext`
  - `sourceRefs[]`
  - `dataGaps[]`
  - `boundaries`
- `sourceRefs[].id` 是所有 output 引用的唯一主键。
- Input 不包含 `summary.weekly_editorial`，防止模型自我复述。
- 完整 discovery artifact 可保留每 topic 最多 5 条；DeepSeek compact input 再按既有
  evidence-quality/date 顺序压缩为每 topic 最多 2 条、总计最多 12 条，并移除 query-run
  诊断明细。27 个结构化指标必须全部保留，最终 input 必须小于 60 KiB。

### 5.3 Provider output

- `schemaVersion = bubble-watch-weekly-editorial-output-v1`
- `provider=deepseek`
- `mode=external_ai_weekly_editorial`
- 必需字段:
  - `headlineZh`
  - `leadZh`
  - `weeklyTimeline[]`
  - `scorecardSynthesisZh`
  - `keyTensions[]`
  - `categoryAnalysis[]`
  - `historicalComparison`
  - `watchNextWeek[]`
  - `dataGaps[]`
  - `sourceAttribution[]`
  - `confidence`
  - `auditFlags[]`
  - `boundaries`
- 所有事实性段落必须带 `sourceRefIds` 或 `sourceIndicatorIds`；引用必须存在于 input。
- `sourceAttribution[]` 必须逐一覆盖 output 实际使用的全部 `sourceRefIds`。Provider 若遗漏已引用来源，adapter
  只可从 input `sourceRefs[]` 确定性补齐 attribution row；不得改写 AI 正文、增加引用或把
  `discovery_only` 冒充 official/cross-checked。
- 2026-08-11 长度标定样本为参考站最近 12 个已提交周度版本：全样本均值
  1,976 字，最近 5 期均值 2,947 字，P90 3,137 字，最大 3,278 字。早期短稿
  不代表当前成熟版，因此 production prompt 以最近 5 期均值为主标定。
- Provider 生成目标为用户可见中文 2,600–3,400 字，覆盖参考站近期均值并
  保留约 15% 上侧篇幅余量；同时对 timeline/tension/category/
  history/watch/gap/attribution 各字段设置数量和字符硬上限；quality review 对 1,800–4,200
  保留兼容接受窗口。不以堆砌内容凑长度，必须在 token budget 内闭合完整 JSON。

### 5.4 Quality review

- `schemaVersion = bubble-watch-weekly-editorial-review-v1`
- 状态 `pass | warn | fail`。
- `warn` 只用于非安全类质量维度，例如分类覆盖略低，或 Tavily/Brave 都成功但
  本周只形成 1 条 official/cross_checked 新闻。后一种情形必须在 `dataGaps`
  披露覆盖限制，其余事实性段落必须同时引用站内指标；可展示但必须披露 warning。
- `fail` 包括 invalid refs、unsafe copy、来源不足、结构错误、评分越权、外部验证虚构或
  provider failure；两个索引均无可用结果或 official/cross_checked 为 0 也必须 fail，
  不得 production write。
- `promotionEligible=false` 恒成立，表示不得晋升为评分输入。

### 5.5 Production layer

- `schemaVersion = bubble-watch-weekly-editorial-production-v1`
- 路径: `data/bubble-watch.json.summary.weekly_editorial`
- visible 条件:
  - `status=valid`
  - `displayEnabled=true`
  - `boundaries.frontendDisplayApproved=true`
  - `asOfDate === data.as_of_date`
  - `freshness.isStale=false`
  - `validation.status=pass`
  - `qualityReview.status in {pass,warn}`
- `qualityReview.promotionEligible=false`、`provenance.humanApproved=false` 恒成立。

## 6. DeepSeek request

- 复用仓库 DeepSeek endpoint / model 默认值，provider 固定为 DeepSeek。
- `response_format={type:"json_object"}`。
- 默认 `max_tokens=8000`、timeout `120000ms`。8,000 是 provider JSON 序列化预算，不是用户
  可见正文字数；它覆盖约 3,000 中文可见正文以及 stable IDs、引用、边界和
  JSON 字段名的额外序列化成本。
- 每个 workflow 最多一次调用，retry=0。
- 输入在调用前必须通过 sanitizer / contract validation。
- Prompt 必须声明:
  - 只使用 input；不浏览、不发明数据。
  - 新闻 snippet 是 discovery context，不等于独立事实核验。
  - `discovery_only` 不能单独进入 facts。
  - 只能解释既有评分，不能改分。
  - 所有引用使用 input 的 stable IDs。
  - 输出一个 JSON object，无 markdown。

## 7. 生产工作流

新增 `Bubble Watch Weekly Editorial Refresh`：

1. `workflow_run` 监听成功的 `Refresh Bubble Watch`，另保留 manual dispatch。
2. checkout / fast-forward latest main。
3. 构建 bounded 新闻发现 artifact。
4. 构建并验证 compact input。
5. 调用 DeepSeek 一次。
6. output validation。
7. quality review。
8. projection + production writer。
9. production contract + writer guard + Bubble Watch checker + frontend smoke。
10. protected path assertion：只允许 `data/bubble-watch.json`。
11. 仅在字段变化时 commit / push main。

Workflow 使用现有 `external-ai-production-refresh` environment 的 `DEEPSEEK_API_KEY`，
并读取 repository secrets `TAVILY_API_KEYS` / `BRAVE_API_KEYS`。不新增或提交 secret。

## 8. Frontend

- Hero 使用 `weekly_editorial.output.headlineZh` + `leadZh`；无有效层时继续显示
  `verdict_label` + `verdict_desc`。
- Hero 后增加纸媒式长文 section：时间线、关键矛盾、分类、历史差异、观察条件、数据限制。
- 展示 provider / model / generatedAt / confidence / quality warnings / 来源链接。
- `confidence.score` 的生产/展示口径固定为 0–100；provider 若返回常见 0–1 比例，adapter
  确定性换算为百分制。用户界面把 confidence / quality / source evidence class 枚举映射为
  中文，不直接暴露 `medium` / `warn` / `site_structured` / `cross_checked` 等内部值。
- 不新增 SaaS card、彩色 pill、圆角或阴影；390px 单列且无横向溢出。

## 9. Fallback / rollback

- Collector source unavailable: 不调用 DeepSeek，保留确定性正文。
- Provider unavailable / timeout / invalid JSON: 不写 production；不自动重试。
- Validator / review fail: 不写 production；artifact 仅供诊断。
- Stale / as-of mismatch: 前端忽略 AI 层。
- Rollback: revert 最近一次 `chore: refresh Bubble Watch weekly editorial` data commit，或通过
  reviewed data update 将 `displayEnabled=false` 与 `frontendDisplayApproved=false` 同时关闭。

## 10. 验收标准

- Fixture contract positive / negative self-tests PASS。
- News collector dry-run / fixture test PASS；无 secrets / raw response / unbounded body。
- Provider failure、timeout、invalid JSON、unknown ref、unsafe copy 均 fail closed。
- Writer guard 证明除 `summary.weekly_editorial` 外没有语义变化。
- `npm run check:bubble-watch`、`npm run check:all`、`git diff --check` PASS。
- Playwright 1440px / 390px runtime 与 missing/stale layer fallback PASS。
- Main 上一次授权 DeepSeek workflow run 成功后，核对 Pages JSON 与 DOM。

## 11. 分阶段实施状态（2026-08-11）

- Stage 1 complete: ADR / contract family / positive-negative fixtures / machine validator。
- Stage 2 complete: Tavily + Brave bounded collector、URL/title 去重、evidence status、27-card + radar/oil compact input；默认 no-network，输出仅允许 `manual-artifacts/bubble-watch-weekly-editorial/`。
- Stage 3 complete: DeepSeek 单次 JSON request、prompt contract、output validation、quality review、production projection、source ledger、原子 writer 与 protected-target/write-semantic guard。离线 provider replay 证明 call=1 / retry=0，timeout / invalid JSON / fixture promotion / unsafe target 均 fail closed。
- Stage 4 complete: GitHub post-refresh/manual workflow、protected path、Bubble Watch 长篇 frontend、240h/as-of fallback、1440px/390px runtime acceptance 与 Pages trigger 均已实现；本地 full check 作为该阶段提交前硬门禁。
- Stage 5 production code deployed / live output pending: main workflow、Pages 与 fallback 已上线；
  run `31455140609` 证明旧 prompt 在 5,000 tokens 截断，未写 production。Owner 随后明确
  授权按参考站近期篇幅重新标定：prompt 目标 2,600–3,400 字，provider 预算 8,000
  tokens，同时保留 compact 12-story + per-field hard caps。下一次真实调用仍只允许
  单次/no-retry，成功后才可写 production；失败时 DOM 继续回退 deterministic verdict。
