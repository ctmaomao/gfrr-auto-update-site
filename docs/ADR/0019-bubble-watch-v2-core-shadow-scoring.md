# ADR-0019: Bubble Watch v2 使用固定 Core-23 + Shadow-4

- 状态: Accepted
- 日期: 2026-07-15
- 批准: Owner thread approval
- 扩展: ADR-0016 的专题页打分条款;ADR-0016 的独立页面、周更管线与 display-only 边界继续有效

## 背景

Bubble Watch 在 Stage × Trigger 升级后展示 27 张证据卡。若 27 卡全部等权,新增绿灯卡会在既有红灯不变时机械压低主分:当前 6 个红灯按 24 卡为 25.0%,按 27 卡为 22.2%。这属于分母漂移,不是风险真实改善。

现有历史共有 16 期,但只有 2026-06-18 起 5 期包含可完整重放的候选 Core-23 状态;更早点位使用不同分母或缺少单卡状态。因此当前证据只能验证打分合同和阈值行为,不能把本地周度序列称为长期预测回测,也不能输出泡沫破裂概率。

## 决策

1. **27 卡全部展示**。每张卡显式标注 `score_role = core | shadow`,页面同时展示全 27 卡灯色计数与固定核心计分口径。
2. **固定 Core-23 等权计分**。Core-23 为:
   - 估值:`cape` / `top5_weight` / `nvda_fpe`
   - 资金面:`hyperscaler_capex_yoy` / `mag4_fcf_yoy` / `vc_ai_share` / `nvda_invest_revenue`
   - 市场结构:`breadth_50d` / `spy_vs_rsp_6m` / `insider_sell_buy` / `ai_ipo_pipeline`
   - 信用:`hy_oas` / `dc_abs_spread` / `debt_capex_ratio` / `neocloud_credit`
   - 基本面:`token_volume_mom` / `arr_2nd_deriv` / `enterprise_deploy` / `cloud_rpo_growth`
   - 宏观:`accounting_events` / `fed_policy` / `capex_reaction` / `ceo_hedging`
3. **Shadow-4 只观察、不入分**:`private_secondary_marks` / `token_revenue_ratio` / `gpu_rental_price` / `frontier_progress`。前三项中的私募标价、GPU 租价、前沿能力缺少稳定连续历史;`token_revenue_ratio` 是平台用量与公开定价派生比值,与 Core 中 token 活动/收入基本面重叠且口径更脆弱。
4. **主分和所有升级输入只用 Core-23**:`primary_score_pct = red_pct = Core 红灯数 / 23`;`weighted_risk_score = (Core 红 + 0.5 × Core 黄) / 23`。Stage、Trigger、category scores、分类共振、周度动量、历史相似度和 verdict 都不得读取 Shadow-4。`weighted_risk_score` 仍只是趋势辅助,不直接决定档位。
5. **历史趋势只画 Core-23 可比回放**。旧 `red_pct/risk_score` 保留原发布口径以供审计;从有完整 Core-23 statuses 的周次派生 `core_*` 字段。不得把旧变分母点与 v2 线混画成连续预测历史。
6. **不采用学习权重、组内归一或迟滞规则**。当前样本不足以稳健估计这些参数;Core-23 内保持等权是最少假设、最可复算的定稿基线。
7. **Shadow 晋升必须另开契约迁移**。单卡至少满足 52 周观察、fresh 可用率 ≥90%、历史代理或回填审阅、非冗余/消融审阅、预登记目标上的样本外改善,并经独立 reviewed contract migration;禁止自动晋升。预登记目标为 Stage 的 12-24 个月估值/相对收益回落,以及 Trigger 的 13/26 周 NDX 或固定 AI 篮子最大回撤 ≥20%。

## 后果

- 当前展示仍为 `6 红 / 6 黄 / 15 绿`,展示红灯比例 22.2%;v2 主分改为 Core-23 的 `6 红 / 6 黄 / 11 绿 = 26.1%`,黄灯调整压力 39.1%。
- Stage 为 60.0,Trigger 为 23.1;分类共振仍把有效判读升级为「高风险预警」。该判读描述结构性泡沫风险状态,不是短期崩盘概率。
- `data/bubble-watch.json` 升为 `bubble-watch-v2`,`data/bubble-watch-history.json` 升为 `bubble-watch-history-v2`;checker 必须重放 Core/Shadow 边界和 Shadow 全红不改变主分的场景。
- 公开市场技术热度面板继续独立于 27 张证据卡与 Bubble Watch v2 计分。
- Bubble Watch 仍是独立 display-only 专题,不进入 GFRR 主雷达 scoring / decision / execution / position。
