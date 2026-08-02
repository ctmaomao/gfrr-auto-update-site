# 主评分科学验证口径

> 状态:现行审计契约。本文不修改生产公式、阈值、`decisionModel`、`executionLock`、`positionGuidance` 或前端数据路径。

## 1. 结论先行

“MACRO RISK OVERVIEW · 宏观风险判断总览”的主分数适合解释为**当前宏观/市场压力温度**，不适合解释为危机概率，也没有证据支持把它称为“未来六个月危机预警分数”。

截至 2026-08-02 的可复现实测分成两层:

| 验证层 | 覆盖 | 压力同步识别 | 六个月提前预警 | 科学结论 |
|---|---:|---:|---:|---|
| 现代主公式回放 | 2006-01 至 2026-07,1,074 周 | AUROC 0.875,AP 0.612 | AUROC 0.360,AP 0.040 | 能识别已经发生的压力,不能提前六个月预警 |
| 百年代理模型 | 1926-01 至 2026-06,1,206 月,100.41 年 | AUROC 0.780,AP 0.527 | AUROC 0.497,AP 0.091 | 长周期压力同步关系存在,提前预警不优于随机 |

两层不能混为一谈。现代回放复用生产评分引擎,但早期缺失的 OAS/SPX 等输入仍需历史代理或默认值;百年层则是完全不同的信用利差 + 工业生产三组件代理,不是六模块生产分数的历史重建。

## 2. 三种语义必须分开

1. **Stress Nowcast / 压力同步识别**:分数对当期 NBER recession stress 的排序能力。这是当前分数最有证据支持的用途。
2. **Early Warning 6M / 六个月提前预警**:仅在非衰退期评价未来 183 天内是否进入衰退。当前结果失败,不得进入前端或决策路径。
3. **Century Proxy / 百年代理**:在生产输入不存在的年代,用长期信用和实体活动代理检验“压力温度”概念能否跨制度存在。它永久 `auditOnly=true`、`productionFormulaReplay=false`、`eligibleForProductionScore=false`。

分数除以 100 只用于 Brier/ECE 诊断,不代表概率。页面和解释层不得写“55 分 = 55% 危机概率”。

## 3. 现代主公式回放

入口:

```text
npm run audit:main-score-backtest
```

审计输出只写 ignored `manual-artifacts/main-score-audit/main-score-backtest-latest.json`。生产 Daily 与回测共同调用 `scripts/main-score/main-score-engine.mjs`;`check:main-score-engine-parity` 用当前快照锁定公式一致性。

### 3.1 方法

- 每周取截至评分日最近可用的 FRED 观察值。
- DXY 历史分位每个评分日只用当日及以前数据做 expanding calibration,不再使用 2006-2026 全样本阈值回看过去。
- 结果标签为 FRED `USRECM`,只作事后评价,绝不进入评分输入。
- 预登记阈值为 45 / 55 / 65;主评价阈值 55。
- 报告 AUROC、Average Precision、recall、specificity、precision、false alarms/year、事件命中与 lead/delay。
- 置信区间按日历年做 1,000 次 block bootstrap;另做固定公式时间分段和六模块权重逐项 ±20% 后归一化的敏感性分析。

### 3.2 结果

压力同步识别 AUROC 0.875、AP 0.612。阈值 55 的 recall 65.6%、specificity 93.1%、precision 48.5%,约 3.26 个 false-alarm weeks/year。年度 block bootstrap 的 AUROC 95% 区间为 0.504–0.970,区间很宽,反映现代样本只包含两次 NBER recession episode。

时间稳定性并不理想:2006-2012 AUROC 0.910;2013-2019 没有正样本,指标不可识别;2020-2026 AUROC 只有 0.390。GFC 窗口阈值 55 覆盖 96%,但 2023 银行压力窗口只覆盖 10%。因此“全部预登记事件窗口的 max 分通过”不能单独当作准确率证据。

六个月提前预警 AUROC 0.360、AP 0.040;阈值 45/55/65 的 recall 全部为 0。2007 与 2020 两次 onset 均无提前命中,阈值 55 在衰退开始后才触发,中位延迟 74.5 天。这个任务明确不通过。

DXY 因果分位与旧全样本分位的平均绝对分差为 1.74 分,p95 为 5 分,最大 48 分;这说明前视校准虽不大幅改变总体结论,但对个别历史点影响重大。六模块权重逐项 ±20% 后,压力同步 AUROC 仍约 0.873–0.878,六个月预警仍约 0.357–0.362,核心结论没有翻转。

## 4. 百年代理验证

入口:

```text
npm run audit:main-score-century-proxy
```

代理模型对每个 outcome 月固定使用至少滞后一个月的输入,再用截至该信息截点的 expanding midrank percentile;这避免把月度 observation date 当成发布日期:

- Moody's BAA − AAA 信用利差:45%。
- 工业生产 12 个月收缩压力:35%。
- 工业生产 6 个月收缩压力:20%。

数据来自 FRED `BAA`、`AAA`、`INDPRO` 与 outcome-only `USREC`。原始序列只在进程内计算,不写入 audit artifact、不提交仓库;只保留本文件和 `docs/fixtures/main-score-validation/reference-results-2026-08-02.json` 的聚合统计。Moody's 序列存在再分发限制,不得把原始观察值晋升为生产缓存。

100.41 年样本内,压力同步 AUROC 0.780,年度 block bootstrap 95% 区间 0.685–0.862。阈值 60 的 recall 61.2%、specificity 80.7%、precision 38.8%。16 次 recession episode 中,当期压力命中 11 次。

六个月提前预警 AUROC 0.497,95% 区间 0.360–0.633;AP 0.091。阈值 60 只提前命中 3/16 个 episode,月度 recall 18.9%,同时约 1.76 个 false-alarm months/year。它没有证明稳定的危机前瞻能力。

## 5. 数据与识别限制

- 现代层和百年层都使用当前修订后的 FRED 数据,不是 ALFRED point-in-time vintage。FRED API 支持 realtime/vintage 参数,但本轮没有构建逐期 vintage panel。
- expanding calibration 消除了“用未来分布定过去阈值”的一类前视,不能消除历史数据修订和发布日期滞后。
- `USRECM` / `USREC` 是 NBER chronology 的事后标签。NBER 本身强调周期定年是回顾性的,不是实时交易信号。
- 现代回放的 2006-2026 只有两个 recession episode,bootstrap 区间和分段结果比单点 AUROC 更重要。
- 百年代理包含工业生产本身,因此高 nowcast AUROC 很大一部分是同步测量设计的结果,不能推导为投资择时收益。
- 未使用 Wind:公开 FRED/NBER 序列已足以完成两层审计;Wind 不会补出 1926 年生产六模块的 point-in-time 数据。

## 6. 可接受的产品表述

可写:

- “当前宏观与市场压力温度”。
- “历史上对已发生压力有一定同步识别能力,不同年代稳定性有限”。
- “不是危机概率,不是未来六个月预测”。

不可写:

- “百年准确回测证明主分数有效”。
- “能提前预测金融危机”。
- “55 分代表 55% 危机概率”。
- 把百年代理分数写入 `values.*`、主评分、decision、execution、position 或前端。

## 7. 可复现文件

- `config/main-score-validation.json`:现代验证标签、阈值与稳健性预登记。
- `config/main-score-century-proxy.json`:百年代理公式与永久隔离边界。
- `scripts/audit-main-score-backtest.mjs`:现代回放。
- `scripts/audit-main-score-century-proxy.mjs`:百年代理。
- `scripts/main-score/validation-metrics.mjs`:共享统计指标。
- `docs/fixtures/main-score-validation/reference-results-2026-08-02.json`:本轮聚合结果快照,不含原始序列。
