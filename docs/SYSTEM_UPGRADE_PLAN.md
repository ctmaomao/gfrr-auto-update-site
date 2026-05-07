# v28.0I System Upgrade Plan

## 1. Purpose / 目的

本文件用于指导 v28.0I 之后的结构升级，解决当前“模块多、数据多，但用户看完仍然迷糊”的问题。

v28.0I 的目标不是继续堆数据，而是把现有数据、风险模块、Worker-first realtime、World Order overlay 和决策输出组织成更清楚的判断系统。后续升级应围绕以下能力展开：

- 今日总判断
- 主导风险链
- 最大背离
- 关键触发器
- 反证条件
- 新信号纳入机制

所有新增能力都必须先明确边界：哪些只是解释，哪些只是 audit-only / diagnostic-only / display-only，哪些未来才可能进入 scoring / decision。

## 2. Current Stable Baseline / 当前稳定基线

当前稳定基线来自 v28.0H 后段：

- Worker-first runtime 是主链路。
- Check Worker Health 是 hard gate。
- Check Realtime Health 是 fallback / Daily baseline soft observer。
- World Order Stress Overlay v1 已完成 release review，当前仅作为独立 regime overlay 观察。
- Global Risk Heatmap 必须继续独立显示。
- World Order Stress Overlay 必须继续独立显示。
- 六大底层风险模块仍保留。
- 不得把 World Order 当成第七个底层风险模块。
- 不得输出战争概率或煽动性结论。

v28.0I 的任何结构升级都必须保护以上基线，不得通过重写页面或重排数据链路来绕过现有稳定边界。

## v28.0I Stable Baseline

v28.0I release review 与 v28.0I-8B post-deploy audit 已通过。v28.0I 已完成从“多模块数据驾驶舱”到“宏观判断压缩层 + 背离校验层 + Brent 代理审计层”的第一阶段结构升级。

已上线并进入稳定观察：

- Daily Brief / 今日主判断。
- Divergence Layer / 实体压力与金融定价背离。
- Consumer vs Asset Divergence / 消费者体感与风险资产背离。
- Brent Public Proxy Pricing Layer / Brent 公开代理价格层。
- Compact cockpit layout，当前前端版本为 `28.0I-8`。

当前 live data 已包含 `dailyBrief.contractVersion = v28.0I-1`、`divergenceLayer.contractVersion = v28.0I-3A`、`macroDrivers.consumer`、`consumer_vs_asset_pricing` 与 `brentPricingLayer.contractVersion = v28.0I-5A`。

这些解释层均为 display-only / audit-only / interpretation-only，不影响 `values.*`、`effectiveDisplayInputs`、Brent promotion、scoring、`decisionModel`、`executionLock`、`positionGuidance`、Action Queue、Trigger Monitor 或 Invalidation Rules。Worker-first runtime 仍为主链路，Check Worker Health 仍是 hard gate，Check Realtime Health 仍是 fallback / Daily baseline soft observer。World Order Stress Overlay 仍是独立 regime overlay，不是第七个底层风险模块；Global Risk Heatmap 仍必须独立显示。

下一阶段若继续开发，应优先考虑：

1. AI Interpretation Layer Contract。
2. 页面解释文案进一步压缩。
3. Brent term structure candidate。
4. Crack spread / diesel stress candidate。
5. World Order data quality improvement。

任何新信号、新解释层或新数据源都不得直接接入 scoring / decision，必须先按 `docs/SIGNAL_INTAKE.md` 走 audit-only / diagnostic-only / display-only 观察路径。

## 3. Core Problem / 核心问题

当前系统的问题不是数据不够，而是判断层压缩不足：

- 首页判断压缩不足。
- 模块之间因果链不够显性。
- 缺少“实体压力 vs 金融定价”的背离校验。
- 新指标纳入没有制度化。
- 用户容易看到很多模块但不知道今天最重要的风险链条是什么。

因此，v28.0I 应优先升级信息架构和解释契约，而不是直接增加更多指标、外部源或评分权重。

## 4. Target Information Architecture / 目标信息架构

未来首页应采用以下层级。

### A. 今日总判断层

- 今日宏观状态
- 今日一句话结论
- 今日主导风险链
- 今日最大背离
- 今日关键触发器
- 今日反证条件

### B. Global Risk Heatmap

- 必须独立大块显示。

### C. World Order Stress Overlay

- 必须独立区域显示。
- 只作为 regime overlay。

### D. 四大宏观驱动层

- 增长
- 通胀
- 流动性
- 政策

### E. 风险链条层

- 能源 -> 通胀 -> 利率 -> 资产重新定价
- 流动性 -> 信用 -> 银行 / 杠杆压力
- 世界秩序 -> 供应链 / 能源 / 制裁 -> 市场确认
- 消费者体感 -> 股市定价背离

### F. 六大底层风险模块

- 继续保留，但作为底层风险引擎，不再承担首屏主判断职责。

### G. 高级审计区

- 传导网络、规则审计、情景树、历史趋势等继续默认折叠或放在后段。

## 5. Six-Phase Upgrade Roadmap / 六阶段升级路线

### Phase 0: System Upgrade Plan & Signal Intake Framework

- docs only
- 不改 runtime
- 不改 data
- 不改 frontend
- 不改 Worker

### Phase 1: Daily Brief Data Contract

- 新增 `dailyBrief` / `dominantRiskChain` / `largestDivergence` / `invalidationSignals`。
- 不改变 `decisionModel` / `executionLock` / `positionGuidance`。
- 先在 Daily pipeline 生成结构化解释字段。
- v28.0I-1 introduces dailyBrief data contract.
- Still no frontend rendering.
- Still no scoring / decision integration.

### Phase 2: Daily Brief Frontend Display

- 首页新增今日主判断区域。
- 修改前端时必须 bump frontend asset version。
- 只展示，不改评分。
- v28.0I-2 adds the read-only Daily Brief frontend display.
- Missing `dailyBrief` must render a gentle fallback.
- Still no scoring / decision / execution integration.

### Phase 3: Divergence Layer MVP

- 新增实体压力与金融定价背离层。
- 第一版优先使用现有数据，不新增外部源。
- 先 audit-only / display-only。
- 不进入主评分。
- v28.0I-3A introduces `divergenceLayer` data contract.
- Still no scoring / decision / execution integration.
- Uses existing Daily pipeline and realtime fields only.
- v28.0I-3B adds the read-only Divergence Layer frontend display.
- Missing `divergenceLayer` must render a gentle fallback.

### Phase 4: Consumer vs Asset Divergence

- 接入或使用月频消费者信心数据。
- 与 S&P 500 做背离观察。
- 先 Daily / baseline 层，不放入 Worker required fields。
- v28.0I-4A introduces consumer sentiment data contract and consumer-vs-asset divergence check.
- No frontend rendering yet.
- Still no scoring / decision / execution integration.

### Phase 5: Brent Physical/Futures Proxy Formalization

- 明确 Brent spot / physical proxy、Brent futures proxy、confirmation source 的边界。
- 可先使用公开 proxy，不等同于 Platts Dated Brent。
- 不改变 `values.brent` 和 Brent promotion。
- v28.0I-5A introduces Brent public proxy pricing layer data contract.
- Uses existing data only.
- No Brent promotion / scoring / decision integration.
- v28.0I-5C adds the read-only Brent public proxy pricing layer frontend display.
- Missing `brentPricingLayer` must render a gentle fallback.
- v28.0I-8 compacts the cockpit layout by moving data health earlier and folding Divergence / Brent audit details by default.

### Phase 6: AI Interpretation Layer Contract

将 AI 解释层拆成：

- 已验证事实
- 数据推断
- 模型判断
- 情景假设
- 数据缺口
- 反证条件

不允许 AI 生成无来源、煽动性、确定性危机文案。

- v28.0J-0 introduces `aiInterpretationLayer` data contract.
- Rule-based structured interpretation only.
- No external AI API; no DeepSeek / OpenAI integration.
- No frontend rendering yet.
- No scoring / decision / execution / position integration.

## 6. Risk Boundaries / 风险边界

明确禁止：

- 不得让新指标直接改变 `executionLock`。
- 不得让新指标直接改变 `positionGuidance`。
- 不得把 Brent validation `recommendedValue` 直接当主值。
- 不得绕过 `effectiveDisplayInputs`。
- 不得把 secondary diagnostics 接入主 `values.*`。
- 不得把 World Order 接入 `decisionModel`，除非未来另开版本并明确评审。
- 不得把 World Order 写成战争预测。
- 不得让新增数据源缺少 timeout / fallback / diagnostics / sourceStatus。
- 不得为了显示漂亮而伪造或填充数据。

## 7. Validation Strategy / 验证策略

后续每个阶段必须：

- 一个 PR 一个逻辑任务。
- 基于 latest main。
- 修改前端必须 bump frontend asset version。
- 修改 JS/MJS 必须 `npm run check:all`。
- 修改数据契约必须 `npm run check:data` 和 `npm run check:all`。
- 修改 docs 必须 `npm run check:docs` 和 `npm run check:all`。
- 不把 commit/push 混入开发指令。
