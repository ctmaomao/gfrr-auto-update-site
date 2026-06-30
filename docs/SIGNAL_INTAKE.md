# Signal Intake Framework

## 1. Purpose / 目的

本文件用于规范新宏观指标、新视频观点、新研究报告、新数据源如何进入系统，避免“看到一个新指标就随便加一个模块”。

任何新信号进入系统前，都必须先明确它是什么、来自哪里、能解释什么、不能解释什么，以及是否只适合作为 audit-only / diagnostic-only / display-only 观察信号。

## 2. Signal Classification / 信号分类

每个新信号必须先判断：

- 属于哪个宏观驱动：增长 / 通胀 / 流动性 / 政策 / 地缘 / 金融脆弱性 / 资产定价。
- 是领先指标、同步指标还是滞后指标。
- 是事实数据、市场价格、模型推断、新闻事件还是人工判断。
- 是 primary source、validation source、secondary diagnostic、audit-only，还是 AI commentary only。
- 数据频率：realtime / daily / weekly / monthly / quarterly。
- 是否有稳定、公开、可抓取、可审计的数据源。

分类完成前，不得把新信号接入 scoring、decision、execution、仓位或 Action Queue。

## 3. Promotion Ladder / 晋升阶梯

新信号必须按以下顺序晋升：

- Level 0: Research note only
- Level 1: Manual observation
- Level 2: Audit-only data field
- Level 3: Diagnostic-only display
- Level 4: Cross-validation signal
- Level 5: Scoring candidate
- Level 6: Decision modifier candidate
- Level 7: Full decision integration

明确规则：

- 默认最多到 Level 3 或 Level 4。
- 不得直接跳到 scoring 或 decision。
- 进入 Level 5 以上必须另开版本、另做稳定性观察、另做数据契约。

## 4. Required Signal Registry Fields / 信号登记字段

以下是信号登记字段示例。此示例只用于说明字段，不代表本轮创建 config 文件：

```json
{
  "key": "brentPhysicalPremium",
  "labelZh": "Brent 实物溢价",
  "category": "energy_inflation_chain",
  "macroDriver": "inflation",
  "riskChain": ["energy", "inflation", "rates", "asset_pricing"],
  "frequency": "daily",
  "sourceTier": "audit-only",
  "sourceStatus": "candidate",
  "entersScoring": false,
  "entersDecision": false,
  "displayOnly": true,
  "promotionCriteria": "30 days stable observation before scoring review"
}
```

## 5. Example Candidate Signals / 候选信号示例

以下信号只列出，不在本文件中实现。

### A. Brent futures vs Brent spot / physical proxy spread

- 作用：识别纸面油价与实体油价是否背离。
- 当前级别：Level 2/3 data contract active（v28.0I-5A）。
- 仅为 public proxy observation。
- 不等同于 Platts Dated Brent。
- 不改变 `values.brent`。
- 不进入 scoring、不进入 decision。
- M-71 public proxy source review: EIA Europe Brent Spot Price FOB 是 Level 1/2 source-review candidate,只可作为 public Brent spot proxy comparison;不等同于正式 Dated Brent。

### B. US10Y pressure vs equity pricing

- 作用：识别长端利率压力是否被股市忽略。
- 初始级别：cross-validation / display-only。
- 不改变 `executionLock`。

### C. Michigan Consumer Sentiment vs S&P 500

- 作用：识别消费者体感与资产价格背离。
- 当前级别：Level 2/3 data contract active（v28.0I-4A）。
- 仍为 audit-only / display-only。
- FRED `UMCSENT` 为月频慢变量，不是 realtime 指标。
- 不进入 Worker required fields。
- 不进入 Worker、不进入 scoring、不进入 decision。

### D. Brent term structure

- 作用：识别近端供需是否紧张。
- 初始级别：candidate。
- 需要稳定数据源后再接入。
- M-71 public proxy source review: ICE Brent futures curve / ICE Data Services 是 Level 1/2 source-review candidate。任何 futures curve 接入必须先完成 source-specific proof-of-source design,不得直接进入 `values.brent`、Brent promotion、scoring 或 decision。

### E. Crack spread / diesel stress

- 作用：识别原油向成品油和运输成本的传导。
- 初始级别：candidate。

### F. Shipping / freight stress

- 作用：识别能源与地缘风险向贸易成本传导。
- 初始级别：candidate。
- M-71 public proxy source review: Baltic Exchange freight benchmarks 与 Freightos Baltic Index 是 Level 1/2 source-review candidate。Baltic / Freightos 只能作为 shipping / freight stress public proxy review,不得写成 Platts Dated Brent、不得推断具体 crude cargo price、不得直接进入 scoring 或 decision。
- Route-level tanker freight confirmation source review: TD3C / TD8 / TC5 / TD15 / TD20 / TD22 / TD25 等路线级油轮运费只作为未来 `transportShockCandidate` 的确认层候选;当前 source-review only,不 live fetch,不写 production data,不改变 ODP `finalBias`、Brent promotion、scoring 或 decision。
- Route-level tanker freight proof-of-source design: 只允许 dry-run-only manual artifact scaffold;仍不得 live fetch、不得自动抓 Baltic/ICE/CME/vendor 页面、不得把 routeFreightConfirmation 从 `not_connected` 改成确认。
- Route-level tanker freight manual artifact scaffold: `review:route-level-tanker-freight-manual-artifact` 只做 local/manual dry-run review,输出 ignored manual artifact,不读 key、不联网、不写 production data、不保存 raw source text、不进入 route confirmation 或主判断打分。
- Route-level tanker freight manual sample collection/review: `review:route-level-tanker-freight-manual-samples` 只聚合多份 proof-review artifacts 的样本数、bucket coverage 与 repeated route observations;仍不读 key、不联网、不写 production data、不进入 route confirmation 或主判断打分。
- Route-level tanker freight display-only candidate contract: `route-level-tanker-freight-display-contract-v1` 只定义未来展示候选层形状,状态为 `contract_only_no_production_write`;不写 production data、不接 frontend/workflow/Worker、不改变 `routeFreightConfirmation=not_connected`,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight production display projection: `route-level-tanker-freight-production-display-projection-v1` 只由 `project:route-level-tanker-freight-production-display` 做 dry-run-only manual artifact 投影;不写 `data/radar-data.json`、不批准直接展示、不接 frontend/workflow/Worker、不改变 `routeFreightConfirmation=not_connected`,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight production display projection review: `route-level-tanker-freight-production-display-projection-review-v1` 只由 `review:route-level-tanker-freight-production-display-projections` 聚合 dry-run projection artifacts;不批准 direct display、不写 production data、不接 frontend/workflow/Worker、不改变 `routeFreightConfirmation=not_connected`,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight frontend display brief: `route-level-tanker-freight-frontend-display-brief-v1` 只是 docs-only future UI contract,未来若展示也只能放进现有 ODP folded detail;当前不加 DOM、不改 renderer、不写 production data、不接 workflow/Worker、不改变 `routeFreightConfirmation=not_connected`,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight production write readiness: `route-level-tanker-freight-production-write-readiness-v1` 只是 manual/local pre-write gate;通过也只表示可另开 production writer contract design,source-rights 仍 manual_review_required,immediate production write 仍 blocked,`productionWriteApproved=false`,不写 production data、不接 frontend/workflow/Worker、不改变 `routeFreightConfirmation=not_connected`,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight thematic card brief: `route-level-tanker-freight-thematic-card-brief-v1` 只是 docs-only final UI target,记录未来可在 `C1 通胀与能源` 增加一张路线级油轮运费卡;当前不新增路线级油轮运费 DOM、不改 renderer、不写 production data、不接 workflow/Worker、不改变 `routeFreightConfirmation=not_connected`,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight production writer contract design: `route-level-tanker-freight-production-writer-contract-design-v1` 只是 contract design only,定义未来 `macroDrivers.energyTransport.routeFreightConfirmation` 字段形状;状态为 `contract_design_only_no_writer`,不写 production data、不接 frontend/workflow/Worker、不 live fetch、不读 API key,allowed status 故意排除 `confirmed`,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight source-rights approval gate: `route-level-tanker-freight-source-rights-approval-gate-v1` 只是 manual source-rights gate;状态为 `manual_review_required_no_source_rights_approved`,block reason 为 `source_rights_and_redistribution_not_approved`;没有候选来源获得 live fetch、route-value redistribution、production write 或 frontend approval,因此不写生产字段、更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight source-rights approval template: `route-level-tanker-freight-source-rights-approval-template-v1` 只是未来人工审批证据模板;状态为 `template_only_no_approval`,block reason 为 `template_only_no_source_rights_approved`,不授予 source/live fetch/redistribution/production/frontend approval,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight source-rights input prep: `route-level-tanker-freight-source-rights-input-v1` 只是 ignored local draft;`prepare:route-level-tanker-freight-source-rights-input` 只生成待人工填写的 `draft_manual_input_no_approval`,所有 approval claims 默认 false,不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight source-rights artifact review: `route-level-tanker-freight-source-rights-artifact-review-v1` 只是 local/manual ignored artifact reviewer;`review:route-level-tanker-freight-source-rights-artifact` 最多产出 `reviewable_pending_separate_gate_update`,不更新 source-rights gate、不写 production data、不接 frontend/workflow/Worker,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight source-rights gate update proposal: `route-level-tanker-freight-source-rights-gate-update-proposal-v1` 只是 dry-run ignored proposal artifact;`project:route-level-tanker-freight-source-rights-gate-update` 不写 gate fixture,即使输出 `ready_for_human_gate_update_review` 也仍需另开人工审核 PR,不接 frontend/workflow/Worker,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight source-rights gate update proposal review: `route-level-tanker-freight-source-rights-gate-update-proposal-review-v1` 只是 manual/local ignored proposal reviewer;`review:route-level-tanker-freight-source-rights-gate-update-proposal` 不应用 proposal、不写 gate fixture,真实 proposal 最多进入 human-authored PR review,更不进入 ODP finalBias 或主判断打分。
- Route-level tanker freight Baltic context policy: `route-level-tanker-freight-baltic-context-policy-v1` 只是 docs/checker-only coexistence policy;当前决策为 `keep_baltic_freight_as_broad_context` 与 `additive_card_until_separate_deprecation_review`,不删除现有 `Baltic Freight` 卡,也不把 BDTI/BCTI/BDI 当作路线级确认或主判断打分输入。
- Route-level tanker freight disabled writer scaffold: `route-level-tanker-freight-disabled-writer-scaffold-v1` 只是 manual-artifact-only disabled projection;`project:route-level-tanker-freight-disabled-writer` 只输出 ignored artifact,状态为 `disabled_no_production_write`,candidate field 保持 `not_connected` / `manual_review_required` / `productionWriteAttempted=false`,不写生产字段、不接 frontend/workflow/Worker,更不进入 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor source-to-score contract: `transport-shock-confirmation-factor-source-to-score-contract-v1` 是 P-score-1 contract only,把 Free Route-Linked Tanker Transport Pressure Proxy 与 Baltic Weekly Tanker Report public route-signal 列为未来输入候选,并复用 PortWatch/StockQ/Oil News/Oil Thermal/Brent curve 等现有证据作为未来 shadow score 输入;该 contract 固定 `contract_only_no_shadow_score`,不抓新源、不写 production data、不从 P-score-1 直接加前端卡、不改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor source-review: `transport-shock-confirmation-factor-source-review-v1` 是 P-score-2 review-only,只审阅 Free Route-Linked Tanker Transport Pressure Proxy 与 Baltic Weekly Tanker Report public route-signal 两个候选源族;当前结论为 `source_review_ready_for_manual_sample_scaffold`,下一步只允许 manual sample scaffold,no live fetch/no production write/no frontend/no shadow score,不改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor manual sample scaffold: `transport-shock-confirmation-factor-manual-sample-scaffold-v1` 只是 P-score-3 local/manual ignored artifact helper;`review:transport-shock-confirmation-factor-manual-sample` 只读 manual-artifacts/transport-shock-confirmation-factor 或 fixture,只写 ignored manual-artifacts review JSON,不联网、不读 key、不写 production data、不接 frontend/workflow/Worker、不建立 shadow score、不改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor manual samples review: `transport-shock-confirmation-factor-manual-samples-review-v1` 是 P-score-4 local/manual ignored artifact 聚合 helper;`review:transport-shock-confirmation-factor-manual-samples` 只聚合 manual-sample review artifacts 的 bucket/source/direction coverage,不联网、不写 production data、不接 frontend/workflow/Worker、不建立 shadow score、不改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor shadow-score projection: `transport-shock-confirmation-factor-shadow-score-v1` 是 P-score-5 local/manual ignored artifact 投影 helper;`project:transport-shock-confirmation-factor-shadow-score` 只读 manual samples review,输出 capped `manual_route_signal_slice_only` 候选影子分,不联网、不写 production data、不接 frontend/workflow/Worker、不生成 complete factor score、不改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor display projection: `transport-shock-confirmation-factor-display-projection-v1` 是 P-score-6 local/manual ignored artifact 投影 helper;`project:transport-shock-confirmation-factor-display-projection` 只读 shadow-score projection,输出 `manual_shadow_projection_ready_non_production` 前端卡片设计候选,不联网、不写 production data、不接 frontend/workflow/Worker、不批准 direct display、不改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor frontend card: `transport-shock-confirmation-factor-frontend-card-v1` 是 P-score-7 display-only thematic card;前端只读 production payload 的 `macroDrivers.energyTransport.transportShockCandidate` 可选候选字段,缺失时显示数据不足,不得读取 manual artifacts、不得写 production data、不得接 workflow/Worker、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor production refresh verification: `transport-shock-confirmation-factor-production-refresh-v1` 是 P-score-8 read-only guard;只核验 Daily writer 是否具备 production payload 字段写入路径并只读 `data/radar-data.json`,缺字段时先输出 `awaiting_production_refresh` / WATCH,只有可信 git history 证明 writer activation 后连续 2 次 `chore: refresh radar data` Daily refresh commit 仍缺字段时才升级 FAIL;字段出现后校验 candidate-only 边界;不得触发 Daily、不得联网、不得写 production data、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor production refresh monitor: `transport-shock-confirmation-factor-production-refresh-monitor-p10` 是 P-score-9 artifact-only reminder;每天 23:19 UTC 或手动只读 committed `data/radar-data.json` 和 full git history(`fetch-depth: 0`),上传 ignored monitor artifact 和 GitHub Summary,用于观察 Daily 是否写出 `transportShockCandidate`;缺字段时保持 `awaiting_production_refresh`,除非可信 history 证明连续 2 次 post-writer Daily refresh commit 仍缺字段,此时可 fail 为 `missing_candidate_daily_refresh_threshold_exceeded`;不得注入 secrets、不得触发 Daily、不得写 production data、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor history sample archive: `transport-shock-confirmation-factor-history-sample-archive-p10` 是 P-score-10 local/manual ignored artifact sampler;只从 git history 的 committed `data/radar-data.json` 抽取 contract-valid `transportShockCandidate` compact 样本,当前字段未刷新时 `--allow-empty` 观察通过;不得联网、不得写 production data、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor history samples review / frontend caveat: `transport-shock-confirmation-factor-history-samples-review-v1` 仍是 P-score-11 ignored artifact review;P-score-12 前端 caveat 只从 production payload 派生 `样本质量` 与 `数据龄`,不得读取 ignored artifact,不得把样本审阅结果写成 route/market confirmation 或主判断打分资格。
- Transport Shock Confirmation Factor frontend scoring-gate row: P-score-18 只在现有 C1 卡展示 `入分闸门` 行,由 production payload 的 route / market gates 派生;不得读取 P-score-17 artifact、不得写 production data、不得把 `marketConfirmation` 改成 connected、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor score-readiness matrix: `transport-shock-confirmation-factor-score-readiness-v1` 是 P-score-13 local/manual 入分前 hard gate;只读 production radar/Oil News/Oil Thermal/ODP 与可选 P-score-11 ignored review artifact,输出 ignored readiness matrix。当前预期 `not_ready_for_score`,并把 route freight confirmation、market confirmation、source-rights、news claim review、thermal repeated anomaly 与 PortWatch freshness 列为入分前缺口;不得写 production data、不得接 workflow/Worker/frontend、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor score-readiness monitor: `transport-shock-score-readiness-monitor-p14` 每日 23:29 UTC 或手动运行本地 P-score-13 review,只上传 ignored monitor artifact/GitHub Summary;正常状态 `blockers_still_present`,未来若全部 blocker 清空也只能提示 `score_ready_requires_separate_review`,不得自动入分、不得写 production data、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor market-confirmation source-review: `transport-shock-confirmation-factor-market-confirmation-source-review-v1` 是 P-score-15 review-only,只审阅已接入 Brent curve/price、EIA Brent spot proxy、ODP raw market evidence 与 Oil News market-reaction aggregate 作为未来 marketConfirmation 样本候选;当前结论 `market_confirmation_source_review_ready_for_manual_sample_scaffold`,但 `marketConfirmation` 仍 `not_connected`,不得写 production data、不得接 workflow/Worker/frontend、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor market-confirmation manual sample scaffold: `transport-shock-market-confirmation-manual-sample-scaffold-v1` 是 P-score-16 local/manual ignored artifact helper;只读人工样本或 fixture,输出 `transport-shock-market-confirmation-manual-sample-review-v1`,聚合 Brent price-structure / Oil News market-reaction / ODP raw market-stress 观察;仍不得写 production data、不得把 `marketConfirmation` 改成 connected、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor market-confirmation display projection: `transport-shock-market-confirmation-display-projection-v1` 是 P-score-17 local/manual display-readiness dry-run;只读 P-score-16 review artifact,输出 ignored projection,最多给出 `manual_market_confirmation_review_ready_non_production` 供人工展示设计审阅;仍不得写 production data、不得把 `marketConfirmation` 改成 connected、不得接 frontend/workflow/Worker、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-19 free-proxy score design: `transport-shock-confirmation-factor-free-proxy-score-design-v1` 只是 design-only 入分路线契约;当路线级 TD/TC 授权数据不可用时,未来最多只能考虑免费代理低权重候选,cap 为 3%,news-only / single-chokepoint-only / stale-PortWatch contribution 均为 0;当前不得写 production data、不得 score write、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-20 free-proxy score candidate projection: `transport-shock-confirmation-factor-free-proxy-score-candidate-v1` 只是 local/manual artifact-only 候选投影;当前状态 `free_proxy_score_candidate_blocked_no_score_write`,`candidateScoreContributionPct=0`,因为 PortWatch live、非新闻物理确认、market-confirmation review、thermal/EIA anchor、history samples、backtest/replay gate 均未满足;不得写 production data、不得 score write、不得自动入分、不得改变 ODP finalBias 或主判断打分。

## 6. Rejection Rules / 拒绝或暂缓规则

以下情况不得接入：

- 没有稳定数据源。
- 只有视频口述、没有可核验数据。
- 需要付费数据但没有授权。
- 数据定义不清。
- 与现有指标高度重复。
- 容易造成用户误解。
- 会诱导恐慌性表述。
- 会直接影响仓位但没有足够验证。

## 7. AI Interpretation Layer Rules / AI 解释层规则

v28.0J-0 的 AI Interpretation Layer 只建立规则化结构解释 contract，不调用外部 AI API。任何 AI 输出都必须严格区分：

- 已验证事实。
- 数据推断。
- 模型判断。
- 情景假设。
- 数据缺口。
- 反证条件。

未来如接入外部 AI API，必须另开版本，单独评审数据源、提示词、输出审计、禁用文案、成本、隐私和 fallback。不得让 AI 文案越权改变评分、仓位、执行灯、Action Queue、Trigger Monitor 或 Invalidation Rules。

外部 AI 输出属于 high-risk signal source。默认只允许 commentary / display-only，不得跳过 promotion ladder 直接进入 scoring、decision、execution 或 position。

### External AI as high-risk commentary source

DeepSeek / OpenAI / external AI output 必须视为 high-risk commentary source，而不是 primary market data source。未来任何接入必须先阅读 [`EXTERNAL_AI_API_DESIGN.md`](EXTERNAL_AI_API_DESIGN.md)，并通过输出审计后才允许进入可见展示路径。

默认最高晋升层级为 display-only。不得跳过 promotion ladder，不得直接进入 scoring / decision / execution / position。任何输出都必须通过 banned copy、source attribution、事实 / 推断区分、数据缺口、越权决策和站内数据冲突检查。

v28.0K-1 prompt fixtures are Level 1/2 offline design artifacts. They are not live signals, not production data, and not scoring candidates. Any future promotion beyond offline/manual prompt testing must follow the ladder in [`EXTERNAL_AI_API_DESIGN.md`](EXTERNAL_AI_API_DESIGN.md) and pass output audit first.

## 8. Copywriting Rules / 文案规则

所有用户可见文案必须：

- 中文。
- 克制。
- 专业。
- 区分事实、推断、模型判断、情景假设。
- 证据不足时写“数据不足”或“暂不足以判断”。
- 不写“危机已经爆发”“必然崩盘”“战争概率”等煽动性表达。
