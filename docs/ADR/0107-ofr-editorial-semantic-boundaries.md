# ADR-0107: OFR editorial semantic boundaries

## Status and authorization

2026-11-11，继续已授权的 AI 生成修复。原候选从 main `d2905d325e55a63833e62a680b921836f856ba8c` 的独立工作树准备并完成独审；#539 隔离合并后，本包在 main `90cd0d1e7bda5d60e5c1661419abd10cb4405ca6` 的新工作树串行集成，再按最终实际树验证和独审，不创建 stacked PR。本包不生成新稿，不修改生产 JSON、历史正文、预算、授权标签或工作流，不执行 provider/search/新来源请求。真实验证名额已经消耗，离线成功不授权再次调用。

## Problem and evidence

Macro run `42950570179` 的已提交正文把负 OFR 原值解释为“历史相对偏低”“低位”“宽松底色”，但绑定的严格过去十年 midrank 为 74.18850215095816（1897/2557 个历史读数更低）。原值 -1.079 是低于 OFR 校准历史均值，不能推出当前十年样本中的低位置。另把站内 `contributionsPublished=false` 误述为“OFR未公布贡献分解”。[官方来源说明](https://www.financialresearch.gov/financial-stress-index/)提供类别及地区贡献；本站暂不发布贡献项是尚未覆盖贡献修订比较的本地范围限制。

这些数字只是本次缺陷证据，不进入代码阈值或硬编码黑名单。原 transient 新闻摘要不可用，本包不宣称重现原完整 provider 输入或完成历史稿全文事实核查。已有正文隔离由独立任务负责，原 commit 保留证据。

## Decision

1. 在既有 `structuredFacts` 中补全原值相对校准均值和百分位相对严格过去十年样本中位位置的说明。原值负/零/正、百分位低于/等于/高于样本排序中点与缺失均逐项处理，不能互相替代。新增 `site:ofr:coverage` 描述本站快照未包含类别/地区贡献，并与官方提供贡献的事实区分；不读取、输出贡献值。
2. v2 prompt 在所有可见栏目要求同一分句明确比较基准、方向和对应引用。`contributionsPublished=false` 只能表述为本站快照/输入缺项。无依据不写绝对宽松、紧张或危机等级，不依赖 writer 改稿。
3. 新 `editorial-ofr-semantics.mjs` 对登记的中文比较表达做窄范围确定性检查。只检查有 OFR 主体、继承 OFR 主体的分句及压力标题/解释；独立指标有自己的主体，不因同段引用 OFR 而被当成 OFR 原值。基准不能从另一字段或分句借用。校准均值方向比对原值正负；严格过去十年位置比对 midrank 在样本排序中点的哪侧。这只是方向一致性，不新增“低压力”阈值或评级。缺失不推断。引用分别要求 `site:ofr:pressure` / `site:ofr:percentile`；站内缺项要求 `site:ofr:coverage`。
4. 贡献缺项表达必须让本站快照/输入成为主语；“本站认为OFR未公布”仍是机构归因错误。明确否定这种推断或带条件的未来观察，不当成当前状态断言。否定遇转折、并列或因果连接即结束；每个缺项断言独立匹配主语，地点“在本站”不把 OFR 官方变成本站发布者。一个分句有多个肯定比较时要求拆开明确基准，避免后续结论借用前项基准。
5. `validateOfrEditorialOutput` 增加上述断言，原 numeric/unit/currency/date/quote/source/unsafe/size 检查全部保留。provider 输出、review、projection 和最终原始 input writer 重验均经过此检查。错误只拒绝该稿，不剪句、改写或再次付费。安全回执只新增固定 `ofr_semantic_boundary` 分类及已登记来源 ID，不输出正文。

## Compatibility and explicit contract change

这是 ADR-level 新稿断言增强，不是现有断言放宽。没有 schema、模型、得分、数值、日期或 snapshot 投影变更。旧 v1 分支不变；生产读取/历史读取不 retroactively 调用新的完整输入语义检查，因此原文件的读取兼容与审计可保留。兼容不表示已知错误稿可重新发布：新增或改写必须携原 input，通过全部既有 writer 摘要/快照/来源/review 检查及新增语义断言。去掉新输入说明不能绕过基于 snapshot 的关系检查。

未新增 checker ignore/skip，不删除旧测试。新回归加入 `check:macro-risk-editorial-core`（因此进入 `check:all`）及现有全量 unit coverage glob。生产部署与实际内容验收仍是单独步骤。

## Bounded guarantees and limitations

检查可阻止已登记的原值/历史位置混同、方向反转、跨字段借基准及本站缺项归属错误；它不是中文语义理解器，不验证全部同义表达、转述观点、经济因果或新闻事实。自然语言歧义可能保守拒绝，例如同一分句同时提到 OFR 与 NFCI 的“低位”比较应拆成各自有主体的分句；未覆盖的新说法也可能漏检，须独立内容核查后有证据地扩展回归，不能自动付费重试。只通过检查不能证明事实正确或未来生成必过。

回归覆盖已知坏句、显式且正确的来源/本站表述、任意负/零/正与不同百分位组合、缺失、独立指标、否定、条件、source binding、各可见字段、改 digest 后 final writer 拒绝、旧读兼容，以及不改变层外数据。完整检查、coverage、最终 tree/blob 和独审结果由交付回执记录，未执行的发布/生产验收不得声称已通过。
