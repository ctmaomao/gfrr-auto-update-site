# Macro Risk Editorial — 主总览 DeepSeek 生产设计

## 1. 状态与目标

- 状态: Owner approved for staged implementation, 2026-08-11.
- 目标: 把近 7 日经审计新闻和站内结构化宏观数据编辑成丰富的主页面本期判读。
- 用户可见标题: `本期宏观判读 · THIS ISSUE'S VERDICT`。
- 结构: 执行摘要 → 近 7 日时间线 → 分数变化 → 六大模块 → 跨市场矛盾 →
  历史差异 → 后续观察与反证。
- 非目标: 修改主分、预测危机日期/概率、生成交易建议、让新闻或 AI 成为评分数据源。

## 2. 不可突破的边界

1. `score`、六大模块、`tailRiskOverlay`、`dailyBrief`、`divergenceLayer`、
   `decisionModel` 和所有执行/仓位字段只能由现有 deterministic pipeline 决定。
2. `buildMacroOverviewHeadline` + `buildMacroOverviewVerdictBody` 永远保留为 fallback。
3. DeepSeek 只能读取 allowlisted compact input；provider 不浏览、不抓网页、不读 secrets。
4. 新闻只作解释 evidence；collector 失败不影响 radar data 或评分有效性。
5. 用户可见输出不得包含交易、仓位、现金、敞口、执行指令、战争概率、危机概率或
   确定性市场结论。
6. 生产主分的科学审计结论必须保留：它可识别同步压力，但未证明六个月预警能力。

## 3. 统一架构归属

| 子路径 | assignedLayer | primaryOwnerLayer | 说明 |
|---|---|---|---|
| Tavily / Brave 近 7 日发现 | `github_actions_backup_validation_layer` | `github_actions_backup_validation_layer` | provider 前的有界新闻 context |
| discovery / input / output / review | `artifact_sanitizer_layer` | `artifact_sanitizer_layer` | ignored / workflow artifact |
| `macroRiskEditorialLayer` | `frontend_display_layer` | `frontend_display_layer` | 只写 `data/radar-data.json` 的独立字段 |

禁止浏览器端外部请求，禁止 Worker、realtime 和 Bubble Watch 旁路写入。

## 4. Source registry

### 4.1 站内结构化来源

- `data/radar-data.json`: score/deltas、六模块、dailyBrief、macroDrivers、divergence、
  tail-risk、data health 和 rule-based baseline。
- `data/world-order-stress.json`: 状态、六维度、confidence、source status 和 market confirmation。
- `data/market-pricing-metrics.json`: QQQ/NDX/IXIC 温度与 vintage。
- `data/radar-history.json`: 有限期历史分数/状态对照。
- `data/oil-directional-pressure.json`: final/physical bias、反证、confidence、data sufficiency。
- `data/oil-news-event-watch.json`: 只取清洗后 event state / data gaps，不将新闻代理写成物理确认。

### 4.2 新闻发现来源

- Tavily Search API，`topic=news`，近 7 日，每 topic 最多 5 条。
- Brave News Search API，`freshness=pw`，相同 topic，每 topic 最多 5 条。
- 受注册资格约束的美国 `.gov` 根域及其子域按政府官方来源标记为 `official`；名称中仅含
  `gov` 的普通商业域不得获得该标记。
- production 只投影实际引用来源的 title / URL / domain / publishedAt / topic /
  evidence status；不提交 snippet、raw response、headers 或完整正文。

### 4.3 预登记 topics

1. `central_bank_inflation`
2. `energy_geopolitics`
3. `credit_liquidity`
4. `growth_employment_consumer`
5. `global_china_europe`
6. `market_volatility_valuation`

官方来源可标 `official`；至少两个独立 domain 的同一事件簇可标 `cross_checked`；其余为
`discovery_only`，不得单独支撑事实性判断。

## 5. Contract family

### 5.1 News discovery

- `schemaVersion = macro-risk-editorial-news-discovery-v1`
- 有界字段: `generatedAt`、`window`、`sourceStatus`、`topics[]`、`stories[]`、`dataGaps[]`。

### 5.2 Compact input

- `schemaVersion = macro-risk-editorial-input-v1`
- 包含 `sourceDataUpdatedAt`、`riskSnapshot`、`moduleSnapshot`、`structuredFacts[]`、
  `marketContext`、`historicalContext`、`newsContext`、`sourceRefs[]`、`dataGaps[]`、
  `boundaries`。
- 不包含 `macroRiskEditorialLayer` 或旧 `externalAiInterpretationLayer` 文本，避免自我复述。
- 新闻 compact 输入每 topic 最多 2 条、总计最多 12 条；全部 input 小于 64 KiB。

### 5.3 Provider output

- `schemaVersion = macro-risk-editorial-output-v1`
- 必需字段:
  - `headlineZh`
  - `leadZh`
  - `weeklyTimeline[]`
  - `scoreSynthesisZh`
  - `keyTensions[]`
  - `moduleAnalysis[]`（固定六模块）
  - `crossMarketAnalysis[]`
  - `historicalComparison`
  - `watchNext[]`
  - `dataGaps[]`
  - `sourceAttribution[]`
  - `confidence`
  - `auditFlags[]`
  - `boundaries`
- 事实性段落必须引用 input stable IDs；provider attribution 漏项只可从 input source ledger
  确定性补齐，不得改写正文或提升 evidence class。
- 目标可见中文 4,000–5,600 字；quality review 兼容窗口 2,000–6,800 字。可见字数只统计前端实际渲染的标题、日期、正文、数据限制与置信度说明，不得把 `sourceRefIds`、module 枚举、claim type 或 audit flags 等机器元数据计入正文长度。上限略高于 Bubble Watch 的 6,500 字，以容纳六大模块和跨市场归因，同时禁止为凑字数重复。

### 5.4 Quality review

- `schemaVersion = macro-risk-editorial-review-v1`
- `pass | warn | fail`。
- `warn`: 新闻交叉确认偏少、个别模块只有站内慢变量、历史对照不足等非安全质量问题；
  必须在页面披露。
- `fail`: 无 credible news、invalid refs、unsafe wording、结构错误、虚构外部验证、评分越权、
  provider failure 或 source-data mismatch。
- 上述“无 credible news”仍禁止生成、审阅或写入 AI output。仅当 Tavily 与 Brave 的所有
  topic 查询都为 `ok`、但结果确实为 0 条 credible news 时，workflow 可在 provider 前记录
  `SKIPPED_NO_CREDIBLE_NEWS` 并成功结束；该 expected skip 必须保持 DeepSeek calls=0、
  production writes=0，并继续使用 deterministic overview。任一搜索源不健康仍是 hard failure。
- `promotionEligible=false` 恒成立。

### 5.5 Production layer

- `schemaVersion = macro-risk-editorial-production-v1`
- 路径: `data/radar-data.json.macroRiskEditorialLayer`
- visible 条件:
  - `status=valid`
  - `displayEnabled=true`
  - `boundaries.frontendDisplayApproved=true`
  - `sourceDataUpdatedAt === radarData.updatedAt`
  - `freshness.isStale=false`
  - `validation.status=pass`
  - `qualityReview.status in {pass,warn}`
- `qualityReview.promotionEligible=false`、`provenance.humanApproved=false` 与所有 non-impact
  boundary 恒成立。

## 6. DeepSeek request

- provider/model 复用仓库已批准 DeepSeek adapter。
- `response_format={type:"json_object"}`。
- `max_tokens=8000`、timeout `120000ms`、temperature `0.2`。
- 每个 workflow 最多一次调用，retry=0。
- 输入必须先过 sanitizer / contract validation。
- Prompt 明确：只用 input、不浏览、不发明数据、新闻 discovery status 限制、不得改分、
  不得输出预测/交易/仓位文案、所有引用使用 stable IDs、只返回一个 JSON object。
- Prompt 必须给出按前端字段划分的字符预算，要求采用合同允许数量的低端组合并在输出前把真实可见正文压到 6,200 字以内，为 6,800 字 hard cap 留出缓冲；不得依赖 adapter/writer 截断或改写。provider contract failure 的脱敏 diagnostics 应记录各可见 section 的字符数，但不得保存未通过的候选正文。
- Provider user prompt 必须把 `discovery_only` 与可独立支撑的 site structured / official /
  cross-checked source IDs 分组列出，并要求对每个事实对象逐项自检；若使用
  `discovery_only`，同一个 `sourceRefIds` 数组必须同时包含独立支撑，不能只在
  `sourceAttribution` 补来源。无法满足时应放弃该新闻断言，不得削弱 validator。
- Provider user prompt 还必须单独枚举本期 `official` / `cross_checked` 新闻 ID，并要求
  `weeklyTimeline` 至少一个对象以及全体事实对象的引用并集实际引用其中至少 1 条；仅在
  `sourceAttribution` 列出可信新闻不算合格。reviewer 的零可信新闻引用 hard fail 不得削弱，
  也不得在 provider 后确定性补写引用来伪造 AI 已使用该来源。

## 7. 生产工作流迁移

新增 `Macro Risk Editorial Refresh`：

1. 每日 `00:05 UTC` schedule，另保留 owner 手动成本确认入口。
2. checkout / fast-forward latest main。
3. 读取完成后的 Daily Radar、World Order、ODP 和 market-pricing artifacts。
4. 构建 bounded 新闻 discovery 与 compact input。
5. 单次 DeepSeek call。
6. output validator + quality review。
7. production projection + single-field writer。
8. contract / writer guard / data / frontend scoped checks。
9. protected path 只允许 `data/radar-data.json`。
10. 字段变化时 commit / push main，并触发 Pages。

旧 `External AI Production Refresh` scheduled workflow 退役；原 protected environment 和
`DEEPSEEK_API_KEY` 供新 workflow 复用，不新增或提交 secrets。

## 8. Frontend

- 有效 AI 层时，Hero headline/body 使用 `headlineZh` + `leadZh`；否则使用现有确定性输出。
- Hero 后增加纸媒式长篇，不创建 SaaS card、彩色 pill、圆角或阴影。
- 展示 provider/model/generatedAt/confidence/quality warnings 和 HTTPS 来源账本。
- 枚举映射为中文，不暴露内部 `medium` / `warn` / `cross_checked` 等值。
- 删除 `#external-ai-auxiliary`、顶部“外部 AI”导航和旧 `renderExternalAi.js`。
- 390px 单列，无横向溢出；JSON 缺失、stale、mismatch 时 fail closed。
- ADR-0023 后，Hero → 有效编辑层 → 本期关键变化构成主叙事；压力来源、信号分层、风险引擎、交叉验证与跨市场印证统一置于 `#macro-professional-evidence`。
- 编辑层有效时该专业证据区默认收起；编辑层缺失、过期、mismatch、无资格或渲染失败时自动展开，确保 deterministic fallback 仍完整可见。

## 9. 兼容与 rollback

- `externalAiInterpretationLayer` 保留在数据合同与 Daily preserve path，暂不做破坏性删除。
- 它不再有 frontend consumer，也不再日常付费刷新。
- Collector/provider/validator/review/write 任一步失败：不写 production，主页面继续 deterministic。
- rollback 可 revert 最近一次 `chore: refresh macro risk editorial` 数据提交，或同时关闭
  `displayEnabled` / `frontendDisplayApproved`。

## 10. 验收标准

- Contract fixture positive/negative self-tests PASS。
- Collector no-network / fixture / live-input gate PASS。
- Provider timeout、invalid JSON、unknown refs、unsafe wording、second-call attempt 全部 fail closed。
- Writer guard 证明除 `macroRiskEditorialLayer` 外没有语义变化。
- 旧 External AI DOM/nav/renderer/workflow schedule 均不存在。
- `npm run check:data`、scoped macro editorial checks、`npm run check:all`、`git diff --check` PASS。
- Playwright 桌面/390px、missing/stale/mismatch fallback、HTTPS source links PASS。
- 一次 owner-authorized production workflow 成功后核对 Pages JSON、DOM、overflow 和截图。

## 11. 分阶段计划

- Stage 1: ADR + production design。
- Stage 2: contract/input/news/provider/review/writer + fixtures/checkers。
- Stage 3: workflow migration + frontend integration + old visible module removal。
- Stage 4: local full acceptance + commit/push。
- Stage 5: one owner-authorized production run + Pages/browser final review。
