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
- Transport Shock Confirmation Factor frontend card: `transport-shock-confirmation-factor-frontend-card-v1` 是 P-score-7 thematic card;前端只读 production payload 的 `macroDrivers.energyTransport.transportShockCandidate` 可选候选字段,缺失时显示数据不足;P-score-52 后可额外只读顶层 `transportShockScoringImpact` 展示 capped score-impact。前端不得读取 manual artifacts、不得写 production data、不得接 workflow/Worker、不得改变 ODP finalBias、Brent promotion、Global Risk Heatmap 或 cross-validation。
- Transport Shock Confirmation Factor production refresh verification: `transport-shock-confirmation-factor-production-refresh-v1` 是 P-score-8 read-only guard;只核验 Daily writer 是否具备 production payload 字段写入路径并只读 `data/radar-data.json`,缺字段时先输出 `awaiting_production_refresh` / WATCH,只有可信 git history 证明 writer activation 后连续 2 次 `chore: refresh radar data` Daily refresh commit 仍缺字段时才升级 FAIL;字段出现后校验 candidate-only 边界;不得触发 Daily、不得联网、不得写 production data、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor production refresh monitor: `transport-shock-confirmation-factor-production-refresh-monitor-p10` 是 P-score-9 artifact-only reminder;每天 23:19 UTC 或手动只读 committed `data/radar-data.json` 和 full git history(`fetch-depth: 0`),上传 ignored monitor artifact 和 GitHub Summary,用于观察 Daily 是否写出 `transportShockCandidate`;缺字段时保持 `awaiting_production_refresh`,除非可信 history 证明连续 2 次 post-writer Daily refresh commit 仍缺字段,此时可 fail 为 `missing_candidate_daily_refresh_threshold_exceeded`;不得注入 secrets、不得触发 Daily、不得写 production data、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor history sample archive: `transport-shock-confirmation-factor-history-sample-archive-p10` 是 P-score-10 local/manual ignored artifact sampler;只从 git history 的 committed `data/radar-data.json` 抽取 contract-valid `transportShockCandidate` compact 样本,当前字段未刷新时 `--allow-empty` 观察通过;不得联网、不得写 production data、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor history samples review / frontend caveat: `transport-shock-confirmation-factor-history-samples-review-v1` 仍是 P-score-11 ignored artifact review;P-score-12 前端 caveat 只从 production payload 派生 `样本质量` 与 `数据龄`,不得读取 ignored artifact,不得把样本审阅结果写成 route/market confirmation 或主判断打分资格。
- Transport Shock Confirmation Factor frontend scoring-gate row: P-score-18/P-score-52 只在现有 C1 卡展示 `入分闸门` 行;P-score-52 后优先由 production payload 的 `transportShockScoringImpact` 派生 capped +3 low-weight impact 状态,并继续显示 route / market gates。不得读取 P-score-17 artifact、不得写 production data、不得把 `marketConfirmation` 改成 connected、不得自行计算 contribution、不得改变 ODP finalBias、Brent promotion、Global Risk Heatmap 或 cross-validation。
- Transport Shock Confirmation Factor score-readiness matrix: `transport-shock-confirmation-factor-score-readiness-v1` 是 P-score-13 local/manual 入分前 hard gate;只读 production radar/Oil News/Oil Thermal/ODP、可选 P-score-11 ignored review artifact 与可选 `transport-shock-confirmation-factor-score-integration-preflight-v1`,输出 ignored readiness matrix。默认仍可为 `not_ready_for_score`;当 score-integration preflight 已通过且无剩余 hard blocker 时,只可升为 `ready_for_score_design_review_no_score_write`,并把旧 route/market/source-rights/news/thermal blocker 重分类为 design-review-required,不得写 production data、不得接 workflow/Worker/frontend、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor high-frequency confirmation review: `transport-shock-confirmation-factor-high-frequency-confirmation-v1` 是 P-score-35 local/manual Oil News × Oil Thermal 高频复核层;只读 Oil News claim ledger、可选 news manual gate 与 Oil Thermal watch/probe artifact,输出 ignored artifact。它只区分 `newsRepeatedElevatedObservation`、`thermalRepeatedObservation` 与 `thermalElevatedRepeatedObservation`;news manual gate clear 只能清新闻人工复核 blocker,不能清热异常/设施确认 blocker;`partial_progress_keep_display_only` 不是入分批准、生产数据、route/market confirmation 或油价方向确认。
- Transport Shock Confirmation Factor news manual gate: `transport-shock-confirmation-factor-news-manual-gate-v1` 是 P-score-36 local/manual 新闻人工复核闸门;只读 Oil News claim-ledger review,输出 ignored artifact。它把 sample sufficiency、repeated elevated samples、claim direction stability、source-tier risk 与 headline guard 拆成 `manualReviewBlockers`;`news_manual_gate_blocked_keep_manual_review` 不得作为确认输入,未来 gateClear 也只能进入 separate cross-confirmation review,仍 no score write。
- Transport Shock Confirmation Factor news operator review: `transport-shock-confirmation-factor-news-operator-review-v1` 是 P-score-41 local/manual delegated operator review;只读 Oil News claim-ledger review,输出 ignored artifact。它优先读取 claim ledger 的 `axisSplit=security_risk_vs_supply_flow_split`,允许 `codex_operator_delegate` 将 mixed claims 解释为咽喉/航运安全风险与供应去风险并存的 axis split,并把低置信高主张降级为非确认背景;通过时只能清 news manual gate 的 mixed/source-tier blockers,仍 no production write/no score write。
- Transport Shock Confirmation Factor news operator-review monitor: `transport-shock-news-operator-review-monitor-p42` 是 P-score-42 artifact-only monitor;默认重建 claim ledger 并运行 delegated operator review,输出 ignored artifact。它按 claim-ledger `lastSampleAt` 做 0-12h / 12-24h / 24-48h / >48h freshness aging,超过 48h 需重新复核。它只提示新闻人工复核是否仍可进入 cross-confirmation review,不得当作通道/断供/路线运费/油价方向确认,也不写 production 或 score。
- Transport Shock Confirmation Factor cross-confirmation review: `transport-shock-confirmation-factor-cross-confirmation-v1` 是 P-score-37/P-score-39/P-score-40 local/manual 交叉确认审阅层;只读 production Transport candidate、P-score-36 news manual gate、P-score-35 high-frequency confirmation、manual/display-only market-confirmation projection、P-score-40 PortWatch freshness probe 与 ODP 周度锚,输出 ignored artifact。它把 PortWatch freshness、route freight、market confirmation、news gate、high-frequency physical confirmation 和 ODP anchor 拆成 rows/hardBlockerIds;market projection ready 只能让 `market_confirmation` row 作为 supporting pass,PortWatch freshness probe ready 只能清理 `portwatch_physical_proxy_freshness`,不得写 production `marketConfirmation`;`cross_confirmation_blocked_keep_display_only` 不得作为确认输入,未来 crossConfirmationReady 也只能进入 separate score-design review,仍 no score write。
- Transport Shock Confirmation Factor score-integration preflight: `transport-shock-confirmation-factor-score-integration-preflight-v1` 是 P-score-38 local/manual 入分设计飞检层;只读 free-proxy score-readiness gate、P-score-37 cross-confirmation artifact 与可选 P-score-47 free-proxy bridge preflight artifact,输出 ignored artifact。它明确区分 `freeProxy gate passed`、`crossConfirmationReady` 与低权重 free-proxy path 的 route blocker 重分类;只有 cross 仅剩 `route_freight_confirmation` 且 bridge passed/无剩余 blocker 时才可 preflightPassed。ready 也只能进入 reviewed score-design PR,仍 no score write。
- Transport Shock Confirmation Factor score-integration preflight monitor: `transport-shock-score-integration-preflight-monitor-p43` 是 P-score-43 local/manual monitor;只运行 P-score-38 preflight,输出 ignored artifact。它把 `route_freight_confirmation` 归类为 source-rights/authorized route freight required,把 `high_frequency_physical_confirmation` 归类为 live physical confirmation required;`blocked_on_external_evidence_or_source_rights` 表示剩余 blocker 不能靠 code-only change 清理,仍 no production write/no score write/no ODP finalBias/no main judgment weighting。
- Transport Shock free freight alternative source-review: `transport-shock-free-freight-alternative-source-review-v1` 是 P-score-44 docs+fixture source-review;只把 PortWatch/StockQ/NOAA/Suez/Panama/EIA/IEA/CME/ICE/Solactive/Baltic TD/TC 分类为 free proxy、static context、link-only 或 blocked-without-rights。状态 `source_review_free_alternatives_no_route_freight_confirmation` 不批准 unauthorized scraping、不清 `route_freight_confirmation`,仍 no production write/no score write/no ODP finalBias/no main judgment weighting。
- Transport Shock satellite handling policy: `transport-shock-satellite-handling-policy-v1` 是 P-score-45 docs+fixture policy-review;只规定 Oil Thermal / FIRMS 卫星热异常未满足 repeated elevated observation 时不得降阈值、不得 bypass thermal blocker。no-detection 只能作为设施事故主张的负证据,不能清 `high_frequency_physical_confirmation`、`routeFreightConfirmation`、market blocker 或 score blocker;新闻/设施提及时只允许 `probe:oil-thermal-targeted` 生成 ignored targeted probe plan,且只有显式 `--run-diagnosis` 才可跑 1/3/5 天 FIRMS manual diagnostics,仍 no production write/no score write/no ODP finalBias/no main judgment weighting。
- Transport Shock free-proxy score bridge review: `transport-shock-free-proxy-score-bridge-review-v1` 是 P-score-46 docs+fixture bridge-review;只允许未来 artifact-only free-proxy preflight 把 `route_freight_confirmation` 视为低权重 free-proxy path 不要求的项,但不清 `routeFreightConfirmation=not_connected`。`high_frequency_physical_confirmation` 仍是硬 blocker,仍 no production write/no score write/no ODP finalBias/no main judgment weighting。
- Transport Shock free-proxy bridge preflight: `transport-shock-free-proxy-bridge-preflight-v1` 是 P-score-47 local/manual ignored artifact helper;只读 P46 bridge-review、free-proxy readiness gate 与 cross-confirmation artifacts。它可把 `route_freight_confirmation` 重分类为 `not_applicable_to_free_proxy_low_weight_path`,但保持 `routeFreightConfirmation=not_connected`;若剩余 `high_frequency_physical_confirmation`,状态 `free_proxy_bridge_preflight_blocked_on_high_frequency_no_score_write`,仍 no production write/no score write/no ODP finalBias/no main judgment weighting。
- Transport Shock Confirmation Factor free-proxy score-write design review: `transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1` 是 P-score-48 local/manual ignored artifact helper;只读 P-score-20 candidate 与 P-score-21 replay artifact/fixture。状态 `score_write_design_review_ready_no_production_write` 只代表免费代理 3% cap 与 replay controls 自洽,字段仍为 `scoreWriteApproved=false`,`productionWriteApproved=false`,`scoreIntegrationApproved=false`,`eligibleForMainScore=false`,`historicalBacktestPerformed=false`;下一步只能另开 `runtime_score_integration_design_review`,仍 no production write/no score write/no ODP finalBias/no main judgment weighting。
- Transport Shock Confirmation Factor runtime score integration design review: `transport-shock-confirmation-factor-runtime-score-integration-design-review-v1` 是 P-score-49 local/manual ignored artifact helper;只读 P-score-48 score-write design review artifact/fixture。状态 `runtime_score_integration_design_ready_no_production_write` 只列出 future source path、`feature_flag_default_off`、`hard_cap_three_pct`、fail-closed zero contribution、contract migration 与 rollback/kill-switch 等 runtime guard;字段仍为 `runtimeIntegrationApproved=false`,`scoreWriteApproved=false`,`productionWriteApproved=false`,`eligibleForMainScore=false`,仍 no production write/no score write/no ODP finalBias/no main judgment weighting。
- Transport Shock Confirmation Factor runtime scoring migration authorization: `transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1` 是 P-score-50 owner-approved authorization fixture;状态 `runtime_scoring_migration_authorized_capped_free_proxy`,授权 `macroDrivers.energyTransport.transportShockCandidate` 进入 free-proxy low-weight runtime scoring migration,`maxContributionPct=3`,`defaultContributionPct=0`,pressure-only,fail-closed;不授权 route/market confirmation connected,不授权 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch mutation。P-score-51 后,生产 payload 可输出顶层 `transportShockScoringImpact` (`transport-shock-scoring-impact-v1`),只在 PortWatch live/fresh 且候选 watch/elevated 时贡献 1/2/3 分,否则 0。
- Transport Shock Confirmation Factor frontend score-impact row: `transport-shock-confirmation-factor-frontend-score-impact-v1` 是 P-score-52 frontend-only refinement;C1 `Transport Shock` 卡新增 `主分影响` 行,只读 production payload 顶层 `transportShockScoringImpact`,显示当前 0/+3 或已触发 +1/+2/+3 contribution。它不新增数据源、不写 production data、不读取 manual artifacts、不连接 route/market confirmation、不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。
- Transport Shock Confirmation Factor frontend score attribution: `transport-shock-confirmation-factor-frontend-score-attribution-v1` 是 P-score-53 frontend-only attribution;`#homepage-risk-engines` 可显示 `Transport Shock 主分归因`,只读 production payload 顶层 `transportShockScoringImpact` 的 capped contribution、reason、scoreBeforeTransport 与 scoreAfterTransport。它不新增数据源、不写 production data、不读取 manual artifacts、不自行计算 score、不连接 route/market confirmation、不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。
- Transport Shock Confirmation Factor score-impact history monitor: `transport-shock-confirmation-factor-score-impact-history-monitor-v1` 是 P-score-54 artifact-only attribution monitor;只读 git history 中 committed `data/radar-data.json` 的 `transportShockScoringImpact`,输出最近 contribution/reason/score path 样本到 ignored artifact 或 GitHub Summary。它不新增数据源、不写 production data、不读取 manual artifacts、不自行计算 score、不连接 route/market confirmation、不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。
- Transport Shock Confirmation Factor runtime score policy review: `transport-shock-confirmation-factor-runtime-score-policy-review-v1` 是 P-score-55 artifact-only post-migration policy replay;只读 production `data/radar-data.json` 或 tracked fixture,复放 source live/fresh/eligible/watch/elevated/score threshold gate,验证 `transportShockScoringImpact` 当前 reason、contribution 与 guards 是否符合授权政策。它不新增数据源、不写 production data、不改 runtime scoring、不连接 route/market confirmation、不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。
- Transport Shock Confirmation Factor runtime score policy monitor: `transport-shock-runtime-score-policy-monitor-p56` 是 P-score-56 artifact-only drift monitor;包装 P-score-55 policy review,输出 zero/nonzero contribution 或 policy drift 状态。它不新增数据源、不写 production data、不改 runtime scoring、不连接 route/market confirmation、不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。
- Transport Shock Confirmation Factor PortWatch freshness probe: `transport-shock-confirmation-factor-portwatch-freshness-v1` 是 P-score-40 local/manual 新鲜度探针;只读 IMF PortWatch ArcGIS `Daily_Chokepoints_Data` 或 fixture/manual payload,输出 ignored artifact。它只判断 core chokepoints 是否满足 `supportsPortWatchFreshnessPass`;即使 pass 也只能提示可重新跑 cross-confirmation 清理 `portwatch_physical_proxy_freshness`,不得清理 route freight/news/high-frequency physical blockers,仍 no production write/no score write。
- Transport Shock Confirmation Factor score-readiness monitor: `transport-shock-score-readiness-monitor-p14` 每日 23:29 UTC 或手动运行本地 P-score-13 review,只上传 ignored monitor artifact/GitHub Summary;正常状态 `blockers_still_present`,未来若全部 blocker 清空也只能提示 `score_ready_requires_separate_review`,不得自动入分、不得写 production data、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor market-confirmation source-review: `transport-shock-confirmation-factor-market-confirmation-source-review-v1` 是 P-score-15 review-only,只审阅已接入 Brent curve/price、EIA Brent spot proxy、ODP raw market evidence 与 Oil News market-reaction aggregate 作为未来 marketConfirmation 样本候选;当前结论 `market_confirmation_source_review_ready_for_manual_sample_scaffold`,但 `marketConfirmation` 仍 `not_connected`,不得写 production data、不得接 workflow/Worker/frontend、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor market-confirmation manual sample scaffold: `transport-shock-market-confirmation-manual-sample-scaffold-v1` 是 P-score-16 local/manual ignored artifact helper;只读人工样本或 fixture,输出 `transport-shock-market-confirmation-manual-sample-review-v1`,聚合 Brent price-structure / Oil News market-reaction / ODP raw market-stress 观察;仍不得写 production data、不得把 `marketConfirmation` 改成 connected、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- Transport Shock Confirmation Factor market-confirmation display projection: `transport-shock-market-confirmation-display-projection-v1` 是 P-score-17 local/manual display-readiness dry-run;只读 P-score-16 review artifact,输出 ignored projection,最多给出 `manual_market_confirmation_review_ready_non_production` 供人工展示设计审阅;仍不得写 production data、不得把 `marketConfirmation` 改成 connected、不得接 frontend/workflow/Worker、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-19 free-proxy score design: `transport-shock-confirmation-factor-free-proxy-score-design-v1` 只是 design-only 入分路线契约;当路线级 TD/TC 授权数据不可用时,未来最多只能考虑免费代理低权重候选,cap 为 3%,news-only / single-chokepoint-only / stale-PortWatch contribution 均为 0;当前不得写 production data、不得 score write、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-20 free-proxy score candidate projection: `transport-shock-confirmation-factor-free-proxy-score-candidate-v1` 只是 local/manual artifact-only 候选投影;缺 score-readiness 时状态仍为 `free_proxy_score_candidate_blocked_no_score_write`,`candidateScoreContributionPct=0`;若 `transport-shock-confirmation-factor-score-readiness-v1` 已为 `ready_for_score_design_review_no_score_write`,可输出 `free_proxy_score_candidate_ready_no_score_write` 与 capped `candidateScoreContributionPct=3`,但仍不得写 production data、不得 score write、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-21 free-proxy score replay scaffold: `transport-shock-confirmation-factor-free-proxy-score-replay-v1` 只是 local/manual artifact-only 硬闸回放脚手架;状态 `free_proxy_score_replay_scaffold_pass_no_score_write`,`historicalBacktestPerformed=false`;对 blocked candidate 验证 news-only / single-chokepoint-only / stale-PortWatch / blocked-candidate 零贡献控制,对 ready candidate 追加 `ready_candidate_cap` 3% cap 控制;不得写 production data、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-22 free-proxy historical replay design: `transport-shock-confirmation-factor-free-proxy-historical-replay-design-v1` 只是 design-only 样本设计契约,状态 `design_only_no_replay_execution`,`historicalBacktestPerformed=false`;它定义 known disruption / headline-only false positive / single chokepoint noise / stale physical proxy / market divergence / benign baseline 六类历史回放样本与误报阈值;不得写 production data、不得执行 replay、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-23 free-proxy historical replay sample scaffold: `transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1` 只是 local/manual ignored artifact 单样本审查;当前 fixture 状态 `sample_review_ready_keep_no_score_write`,`historicalBacktestPerformed=false`,只验证 headline-only false positive 样本形状并把 citation 压缩为 hash/domain hint;不得写 production data、不得执行 replay、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-24 free-proxy historical replay sample set review: `transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1` 只是 local/manual ignored artifact 样本集审查;当前 fixture 状态 `historical_replay_sample_set_ready_keep_no_score_write`,`historicalBacktestPerformed=false`,只聚合 P-score-23 单样本审查、检查 known disruption 与零贡献控制覆盖,不得写 production data、不得执行 replay、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-25 free-proxy historical replay runner design: `transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design-v1` 只是 design-only runner 契约,状态 `runner_design_only_no_replay_execution`,`historicalBacktestPerformed=false`;它定义未来 artifact-only runner 的允许输入、输出、false-positive / known-disruption hit-rate 指标与 hard-fail claims,但当前不得写 production data、不得执行 replay、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-26 free-proxy historical replay runner dry-run scaffold: `transport-shock-confirmation-factor-free-proxy-historical-replay-runner-v1` 是 local/manual artifact-only dry-run runner,当前 fixture 状态 `dry_run_pass_no_score_write`,`historicalBacktestPerformed=false`;它只读 P-score-24 样本集审查 artifact 或 fixture 并计算 false-positive rate、known-disruption hit-rate 与贡献上限,不得写 production data、不得执行生产回测、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-27 free-proxy historical replay runner fixture review: `transport-shock-confirmation-factor-free-proxy-historical-replay-runner-review-v1` 是 local/manual artifact-only runner 输出审查,当前 fixture 状态 `runner_fixture_review_pass_keep_no_score_write`,`productionHistoricalReplayPerformed=false`,`historicalBacktestPerformed=false`;它只验证 P-score-26 dry-run runner 输出的 false-positive rate、known-disruption hit-rate、贡献上限与边界锁,不得写 production data、不得执行生产回测、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-28 free-proxy historical replay sample expansion: `transport-shock-confirmation-factor-free-proxy-historical-replay-sample-expansion-v1` 是 fixture/manual artifact-only 样本族扩展质量门,当前状态 `expanded_sample_family_coverage_pass_keep_no_score_write`,`historicalBacktestPerformed=false`;它把 replay fixture 覆盖扩展到 6 类样本(known disruption、headline-only、single chokepoint noise、stale physical proxy、market confirmation divergence、benign baseline),并验证 expanded runner false-positive rate=0、known-disruption hit-rate=1,不得写 production data、不得执行生产回测、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-29 free-proxy historical replay real-event sample intake: `transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-v1` 是 local/manual ignored artifact helper,当前 fixture 状态 `real_event_sample_intake_ready_keep_no_score_write`,`historicalBacktestPerformed=false`;它只把人工准备的真实事件候选样本转成 sanitized sample-review archive,原始 citation 只在输入中读取、输出仅保留 hash/domain hint,不得写 production data、不得执行生产回测、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-30 free-proxy historical replay real-event sample-set review: `transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review-v1` 是 local/manual ignored artifact 聚合审查,当前 fixture 状态 `real_event_sample_set_review_ready_keep_no_score_write`,`historicalBacktestPerformed=false`;它只聚合 P-score-29 sanitized real-event sample archives,检查样本数、known-disruption 覆盖、zero-control 覆盖与 raw URL 泄漏,`scoreReadinessApproved=false`,不得写 production data、不得执行生产回测、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-31 free-proxy score-readiness gate: `transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1` 是 local/manual ignored artifact gate,当前 starter fixture 状态 `score_readiness_gate_collect_more_keep_no_score_write`,`scoreReadinessApproved=false`,`historicalBacktestPerformed=false`;它只读取 P-score-30 real-event sample-set review,用 6 个真实事件样本、3 个 known-disruption 样本、3 个 zero-control 样本、false-positive rate<=20% 与 known-disruption hit-rate>=60% 做入分准备门槛,当前预期继续收集样本,不得写 production data、不得执行生产回测、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-32 free-proxy score-readiness gate monitor: `transport-shock-free-proxy-score-readiness-gate-monitor-p32` 是 local/manual ignored artifact monitor,当前 starter fixture 状态 `sample_targets_incomplete_collect_more`,`scoreWriteApproved=false`,`productionDataWriteApproved=false`;它只运行 P-score-31 gate,把样本目标差距整理为 real-event/known-disruption/zero-control remaining 与 nextSamplePriorities,不得写 production data、不得执行生产回测、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。
- P-score-33 free-proxy score-readiness gate monitor workflow: `transport-shock-free-proxy-score-readiness-gate-monitor.yml` 是 reminder-only GitHub Actions workflow,每天 23:39 UTC 或手动触发;2026-09-05起先用 P-score-30 `--manifest docs/evidence/transport-shock/free-proxy-real-event-review-manifest.json` 生成临时 review input，再运行 P-score-32 monitor 并上传 ignored artifact；缺失/无效manifest拒绝，不再以empty掩盖交接缺失。`contents: read`，不得使用 secrets、不得 commit/push、不得触发 Daily、不得写 production data、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。唯一允许的版本化输入是白名单脱敏元数据与哈希，原始人工材料仍ignored；详见[证据交接说明](evidence/transport-shock/README.md)。
- P-score-34 free-proxy real-event sample input prep: `transport-shock-confirmation-factor-free-proxy-real-event-sample-input-prep-v1` 是 local/manual ignored artifact draft helper,当前 fixture 状态 `sample_input_prep_ready_operator_required`,`scoreWriteApproved=false`,`productionDataWriteApproved=false`;它只读取 P-score-32 monitor 的样本缺口,生成 operator-required draft templates,当前目标为 2 个 known-disruption、3 个 zero-control,所有模板默认 `realEventCandidate=false` 且需要人工填源/复核,不得写 production data、不得执行生产回测、不得 score integration、不得自动入分、不得改变 ODP finalBias 或主判断打分。

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
