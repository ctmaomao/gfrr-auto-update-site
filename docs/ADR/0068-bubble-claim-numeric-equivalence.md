# ADR-0068: Bubble 金融数字依据与提示分级

- 状态：Owner-authorized repair; independent contract review required before merge
- 日期：2026-10-13
- 批准范围：owner 要求修复 run `38344215167` 的数字误拦并系统检查类似问题，停止逐个故障付费试错；owner 随后要求研究门槛是否过细，优先保留有效信息；本轮无真实 provider 调用。
- Narrow supersession：仅替代 ADR-0062 第 3/5 项的逐摘要字面数字/引述匹配实现；媒体资格、点名归因、摘要限制、有限版、费用及生产边界保留。

## 证据与决定

本次失败显示 CNBC 的 `$50 billion` 被译作 `500亿美元`，月份写作 `9`；Morningstar 段落含 `50 / 35% / 6.3% / 5`。后两项百分比存在于输入的市场广度/等权比较指标中，但原校验不查看同段指标引用。旧模型原文未保留，不能恢复具体语境或确认旧段落已具备配对引用。

旧 `evidence.includes(number)` 同时会误放行 `50` 对 `150`，且每条被引媒体都必须含整段全部数字/引述，导致有效混合引用失败。输入阶段又把 collector 已保存的 360 字符摘要截到 180，可能切掉定量依据。

1. 同段证据只取其实际 `sourceRefIds` 指向的 official/cross_checked/attributed_media 摘要，及同段同时具有 `sourceIndicatorIds` 和 `indicator:<id>` 配对引用的 `structuredFacts.factZh`。不得从其它段落或全输入借数字，不给未知/discovery-only/标题来源增加资格。
2. 硬数字门槛只覆盖可精确解析的金融金额、币种和无依据比例。日期、代码、普通数量、未精确解析的中文金融数词及相同数值的百分比/百分点差异降为中文 review warning，不阻止整篇显示；这些提示不表示内容已核实。数字诊断按类型与精确十进制值比较，使用 BigInt 系数/十进制指数，不采用浮点容差、四舍五入或汇率。金额保留币种，支持 billion/million/trillion、明确的金额缩写及亿/万等量级；百分比、百分点、基点、符号、分组逗号、全角字符分别处理。指标代码内的数字不变成普通数量。
3. 裸 `$` 按美国财经新闻惯例为 USD；出现明确其它 dollar 币种地域/代码时不作该默认，明确非美 dollar 前缀保留其币种。无法判断、币种矛盾及混合金额/百分比单位不支持。该约定不作外汇换算或真实性保证。
4. 仅日历语境中的英文月份、有效 ISO/中文/英文具体日期可比较；`may`/`march` 动词不作月份。日期降低精度可以支持月份，不凭月份补出具体日。区间仅支持明确端点，不推断中间值。中文拼写金额、科学计数和非标准逗号小数不在本次精确解析范围，提示要求金融数值使用阿拉伯数字；未解析金融数词显式提示，不因表达格式拒绝。日期/代码/功率等解析只辅助诊断，没有对应的硬显示门槛；新增硬门槛须另行契约审阅。
5. 引述仍须逐字存在于同段明确引用的上述证据中，不作翻译或语义近似。多来源不要求每份摘要都重复所有引述；必须保留每个媒体的点名归因。未知引用、编造引述等负例保留。
6. 输入保留 collector 的 360 字符有界摘要，仍受真实 live-input 的 60 KiB hard gate，超过预算在付费前失败。更新提示与 bounded 诊断使其遵循同一证明函数，避免生成规则/validator/诊断再次分叉。
7. 现行 unsafe 文案规则检查全部输出字符串，包含前端实际显示的 `sourceAttribution.noteZh`，不再只检查篇幅统计字段；不新增禁止文案模式。
8. 契约拒绝后的 normalized candidate 放入现有 failure artifact 的 `replayCandidate`，标记 `replayOnly=true / productionEligible=false`，绑定原输入 digest。仅保留已定义的输出顶层字段，移除 HTTP/凭证类字段并遮蔽本次注入的 key；限制 4000 nodes、12 层、每字符串 20000 字符及整份 128 KiB，截断/移除/遮蔽均显式记录。它是待检查的生成正文，不是原始 HTTP response 或可发布输出，可能含模型错误，沿用现有 artifact 三天保留期。
   - 2026-10-31 保留期窄修订（不改任何 assertion）：常规 `bubble-watch-weekly-editorial-<run_id>` 集合仍为 3 天；**仅失败运行**额外上传 `bubble-watch-weekly-editorial-failure-<run_id>`（只含 `editorial-input-latest.json` 与 `deepseek-failure-latest.json`）并保留 **30 天**。说明：30 天是**本次 Actions 排障修复授权范围内由实施方选定、经 Codex AI 审核**的实施方案，不是 owner 亲自挑选的天数，也不构成人工 review。此修订只影响证据留存，不构成正文恢复、promotion 或生产验收授权。
9. `node scripts/bubble-watch/replay-weekly-editorial-failure.mjs --input <原输入文件> --failure <失败记录>` 只读原输入和候选、复核 digest，再运行当前 validator；不读 key/env、不联网、不生成 output/projection，不调用 writer。输出始终 `productionEligible=false`，完整或已脱敏回放的区别显式显示。免费复验不构成 promotion 授权，禁止从候选绕过唯一生产 workflow 发布。旧失败没有保存正文时仍无法补回，不再为重现校验错误单独付费。

## 验收与保留边界

独立契约 PR 必须显式呈现现有 assertion/测试预期变更：旧全摘要逐字规则改为同段引用证明、精确等值；金融不等值、未知引用、缺引用、虚构引述仍拒绝。Core-23 等非金融数字的旧拒绝预期显式改为 warning；百分比/百分点同值、中文金融数词仅提示，这是本次批准的收窄而非事实核验。新增测试证明 warning 经 review/projection 保留且可显示。新增成组正反例、真实 provider mock → validator → review → projection → guarded writer roundtrip，固定测试数值不依赖下一次市场数据刷新。专项与完整检查通过后才能提交/合并；不靠付费验证发现单位分支。

不改 Macro Risk、workflow、费用预算/单次调用/no retry、6500 字上限、freshness、unsafe wording 模式、scoring、Stage/Trigger、生产字段或主数据。unsafe 扫描范围显式补齐；生产回读仍只检查元数据，不声称重验已丢弃的原摘要。

范围限制：此检查证明同段所引材料含等值数值/字面引述，不证明数值归属实体、因果、变化率相对/绝对语义或新闻真实性；评分总结等非事实段落及既有 official-only 的额外语义审阅范围未扩张。模型仍可能返回未知 ID、截断 JSON、无依据内容，外部服务也可能失败；不能承诺以后零失败。本轮不得以本地/CI 通过宣称当前 AI 正文已发布或获得新的付费授权。
