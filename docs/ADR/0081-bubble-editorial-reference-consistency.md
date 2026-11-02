# ADR-0081：周评同段站内引用的一致性补全

## Status

2026-11-03 owner 要求修复周评引用输出一致性、使用已保留失败产物离线验证，审核通过后上线修复，禁止付费重跑。沿用本任务 owner 指定的 Codex AI review，不冒称独立人工。此独立契约修复 PR 不涉及展示改版；合并前完成实际 diff 审核、完整检查和 CI。

## Context

生产 run 41534908718 同段明确列出 hyperscaler_capex_yoy / enterprise_deploy，却漏掉其 indicator:* 引用。数字本身存在于输入，旧校验器仍正确拒绝缺少配对的段落。此前 run 41526065601 的旧输入省略 HY 阈值单位、41531578149 的百分比连字符问题已由 #493/#494 修复；历史产物仅作诊断。

## Decision

仅在 Bubble 周评 provider adapter 中、现有 attribution 补全及严格 validator 之前，补齐同一事实对象已明确声明的站内 indicator ID / source reference 的另一种表示。本节是设计文档原“不得增加引用”的明确、窄范围替代，不授权猜测来源。

- 输入必须存在唯一 fact:id、唯一 indicator:id 来源；fact.sourceRefIds 与 source.indicatorIds 必须精确互指，source.kind=indicator / sourceClass=site_structured。重复、错配、不完整、未知注册不能建立映射。
- 只遍历 weeklyTimeline、keyTensions、categoryAnalysis、historicalComparison 的同段数组；两数组必须存在、为字符串数组且无重复。不根据文字、数字、其它段落、全局评分摘要或新闻猜 ID。
- 只补本段已明确声明的一侧，保留全部既有引用与声明，不删除未知/错误声明；不添加新闻来源、不改变新闻资格、不修复缺失/错误事实。新增后不得超出原引用数量上限。
- 不修改模型正文、金额、单位、日期、置信度或语义；已有 attribution 映射继续按原规则补齐。补全幂等，输入和原响应不变；仅保留补全计数作为诊断。
- 原 validator、数值与引述 grounding、source readiness、quality review、projection、writer、freshness 和成本/no retry 均保持。直接 validator 对未配对引用仍拒绝；provider 只修复明确声明的重复字段表示。

## Consequences / verification

使用纯函数在生产适配器与离线诊断中共用同一路径。回归覆盖双向遗漏、幂等与无正文改写，并保留未知来源、跨段借用、错误数字/货币、重复/损坏输入和数量上限的拒绝。离线验证原输入 digest 与文件哈希；旧 HY 输入按原样仍应拒绝，再单独展示当前输入编码的诊断结果，不能伪称原输入精确通过。

本轮只上线代码契约修复：不调用真实 provider/搜索，不写生产 JSON，不将任何历史失败候选晋升。回滚为撤销本 PR，恢复原适配器拒绝行为；原严格 validator 不变。
