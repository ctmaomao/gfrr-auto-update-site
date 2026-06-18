# ADR-0017: Wind paid fallback may enter main radar scoring only through source arbitration and replay gates

- 状态: Accepted
- 日期: 2026-06-18

## 背景

GFRR 主雷达核心分数依赖 `brent` / `dxy` / `vix` / `hyOas` / `us10y` / `real10y` / `breakeven10y` / `spx` 等市场输入。此前项目中大量新源按 display-only / audit-only 处理,Wind 也主要作为 Bubble Watch 第二页面的 paid optional/final fallback 或人工复核源。

Owner 明确要求:如果 Wind 作为兜底源成功取得关键市场输入,它必须能够进入 GFRR 主雷达核心分数;否则兜底对站点核心目标没有意义。同时,主分数不能被单一路径、付费源冲突、时间戳错误或 source switch 噪音随意改写。

## 决策

1. Wind paid fallback 可以进入 GFRR 主雷达核心分数,但只限 `config/main-score-source-policy.json` 登记的核心输入。
2. `config/main-score-source-policy.json` 是该路径的机器可检查契约,当前版本为 `main-score-source-policy-v1`。它定义 eligible inputs、source priority、freshness、plausibility ranges、conflict tolerances 与 runtime boundary。
3. 仲裁规则固定为:Wind 不覆盖 fresh official/public primary;只有 official/public 主源 unavailable、stale、blocked 或 degraded 时,Wind 才能作为评分输入候选。两者同时 fresh 且冲突超容差时,official/public 主源胜出,Wind 只进入 `sourceConflictAudit`。
4. 任何 Wind 值若实际进入评分输入,必须标记 `sourceMode=wind_paid_fallback`、`paidWindFallback=true`、`participatesInMainScore=true`、`sourceConflictAudit`、原始时间戳与 fallback reason。
5. Wind source switch 必须经过分数影响守门:如果一次切源会导致超阈值主分数跳变、跨多档跳变、已有 yellow/red 档位自动降级或 `tailRiskOverlay` 开关翻转,自动写分数路径必须转为 `review_required_or_independent_confirmation`。
6. `scripts/audit-main-score-backtest.mjs` 必须输出 `windFallbackPolicy`。回放方法 `wind_fallback_conflict_replay_v1` 不调用 Wind,而是在 FRED 历史序列上注入 Wind/public-source 冲突压力场景,同时报告 raw conflict stress 与按 score-impact guard 处理后的 automatic switching 结果。
7. `windFallbackPolicy.pass=false` 时,不得启用 runtime Wind source switching 写入主分数输入。

## 后果

- Wind 主分数兜底与 Bubble Watch Wind fallback 分离治理:前者可进 GFRR 主分数,后者仍是第二页面 display-only。
- 新增 `check:main-score-wind-fallback`,并接入 `check:all`,防止契约、文档、ADR、回放脚本漂移。
- 常规检查不调用 Wind、不消耗 Wind 额度。付费源 runtime 接入仍需后续独立实现,并必须先让 `npm run audit:main-score-backtest` 的 `windFallbackPolicy` 通过。
- 该 ADR 不改变 External AI 只读边界,也不授权 DeepSeek / OpenAI / 新闻语义层进入 scoring。
