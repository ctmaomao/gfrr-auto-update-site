# ADR-0088: OFR 编辑契约与简版判读

## Status

2026-11-08 owner 已批准本地分阶段实施；独立 AI 复核、完整检查及实际生成/两站验收分别记录。当前不授权 push、合并、部署、搜索、DeepSeek 或其他付费调用。本补丁不得被当成成功生成回执。

## Decision

OFR 迁移后旧编辑输入仍复述六模块分数，所以不能仅删除 admission 的 model_contract_transition。新增独立 v2 input/output/production schema，并同时迁移 writer、publication validator 和浏览器消费者。完整新模型契约有效才替代该 hold；半套字段、旧稿和仓位复活仍在预算预留/搜索前阻止。原上游身份、30小时、日/输入双预算、单次调用与零重试不变。

- 输入 pressureSnapshot 采用已验证 mainPressureReadout 的白名单投影：官方原值、观察日、周变化及实际端点、严格过去十年百分位、缺失/缓存/陈旧与来源时间。负数和真零保留，null 不填零，不以 lastKnown 充作本期。历史最多12条同口径OFR观察，不能拼旧分。
- OFR数字标签只由程序注入生产层并由页面显示；pressureSynthesis只写解释，不复述数值。删除模型对总分、模块分数标签的控制。新稿不得包含旧 riskSnapshot/moduleSnapshot/scoreSynthesis/moduleAnalysis 或仓位、执行建议。
- 独立结构证据仅选已知单位及实际观察日的字段。未知日期不借全局更新时间补齐，覆盖不足宁缺毋滥。旧模块、World Order或运输分数不作为OFR分解。
- 新版篇幅800–2400字为建议；短稿、独立背景栏目不足、实际引用少于12个来源为 warning。仍保留非空标题、导语、压力解释、至少一个可观察条件与反证、至少一项数据限制、6800可见字/64KiB上限。
- 所有实际事实段落必须使用合法同段引用，至少实际引用一条 official/cross_checked 新闻；discovery_only 不可单独支撑事实。金额、币种、单位、日期及数值按被引证据作精确token核验；25bps与0.25个百分点仅按显式单位等价，不把利率水平与变化混同。复合金额的/桶、/吨不能丢弃。明确逐字引语必须在被引证据中出现。
- 这些确定性检查不能证明句子的所有经济含义或因果归属，不能称为完整事实核查。未解析的新表达可能被拒，应离线改进解析，不自动付费重试或删除不合格句子后发布。
- writer保留原input摘要、output摘要、完整输出和审阅重跑、source ledger比较，并比对程序注入的pressureSnapshot/freshness。production及publication额外复用浏览器静态shape/安全/来源/快照门禁。客户端仍按当前时间验30小时及观察时效，正文使用textContent。
- 旧v1验证和历史夹具保留；OFR页面拒绝其当前/上一期稿。v1数字标签另补与其原input一致性检查，不能继续接受999。本次未添加OFR上一期稿通道，后续Daily仍可能移除当前稿，不能冒称解决所有续期可见性问题。

## Explicit contract changes

1. 原整个迁移即hold，替代为完整OFR publication+时序/周差校验通过才可规划v2；不减费用或事件门槛。
2. 原 publication 禁任何 macroRiskEditorialLayer，替代为只允许严格v2、原快照相等、旧建议仍完整退役；旧v1/previous/规则叙事仍禁。
3. 旧2000字/六模块/12来源断言仍在v1分支；新v2采用上述硬底线及软目标，不给旧稿豁免。
4. 原 core checker 从实时生产JSON构造固定八月旧模型回归。现在仅在进程内显式移除OFR标记，使既有v1断言继续测v1；追加v2正反例及真实builder→writer→browser闭环，没有删除旧断言或新增skip。

## Evidence and limitations

[run 42333440572](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42333440572) 的job 128284902563日志确认 checkout a927904154ea1cedb60c389ca4c0c3134e12543f，并于2026-11-07T03:19:19Z报告 model_contract_transition；搜索、provider和writer步骤均跳过。离线回放取该真实提交的原JSON与当时钟，使用明确标注的合成可信manual事件壳（未保留原workflow_run event）。它只证明旧hold及新模型准入差异，不是原线上全链重演，不预留预算、不联网、不生成文章。

测试同时覆盖负数/真零/缺失/缓存/过期、未来时间、周差篡改、旧分/仓位复活、单位币种符号、伪引语、来源、写后篡改、provider未正常结束/响应体超时及重复渲染。独立审阅发现的问题须修复并对固定最终树复核；AI审阅不是人工批准。真实provider生成和两站发布未由离线检查证明。


## Local verification and presentation

- 独立AI审阅已关闭所发现的阻断；核心契约SHA256为 B8EA942A4C4B9B61DA6C2AE817D087C3C6B86142C6BD7DAA0D89D6C4FD8E28D6。审阅不是人工批准。
- 真实Chrome整页合成夹具在1440px/390px验收：真零、观察日/周差端点、全部5条覆盖提示、来源与限制可见；篡改或过期即清空正文、展开确定性依据；13导航、无横向溢出。外部请求全部阻断，未调用搜索/provider。它不是生产源验证或真实生成。
- 视觉复核修复短稿半空双栏和压力正文错格，并让覆盖提示默认可见、来源类别中文化。仅原宏观编辑CSS段改为纸张/墨色token、移除既有阴影/渐变/装饰圆角；共享样式也影响旧v1外观，v1渲染资格与正文逻辑未改。正文使用paper-bg，未把画布token推广到正文。此局部改动按DESIGN.md §2/3/4/6核对，IA不变；后续PR声明：本 PR 符合 DESIGN.md 的所有规则。
- 工作树ignored manual-artifacts/macro-ofr-editorial保留真实失败快照回放、完整检查日志、Chrome报告及before-fix/after截图。回放将原model_contract_transition复现为hold，完整新契约变为candidate；没有预算预留、provider调用或生产写入。
- 最终 npm run check:changed（实际包含check:all）exit0；test:unit:coverage为1451项、1450通过、0失败、1项既有本地真实原件条件skip。配置覆盖率范围内行99.86%、分支93.24%、函数97.96%，不将它称作所有新增代码的覆盖率。OFR专项41项均通过；改动专项eslint、app语法、diff空白与文档链接均通过。无push、合并、部署或真实付费运行。OFR新稿续期/历史留存未在本包实现。

## Serial release authorization and preflight

Owner subsequently confirmed the explicit request to push these Macro/Bubble changes to ctmaomao/gfrr-auto-update-site, create/update PRs, use independent AI review, then merge/deploy serially after checks. The earlier local-only receipt above remains historical. Actual paid generation and its spending limit remain separate: this candidate must not merge while that confirmation is pending, because a later eligible Daily/World Order/ODP completion can automatically resume paid Macro discovery and DeepSeek even without manual dispatch. No workflow disablement or budget-ref deletion is implied or performed.

The separate Macro release candidate carries the original implementation plus independently reproduced grounding fixes: unsupported Chinese rate expressions cannot disappear from numeric validation; US dollar(s)/U.S. dollar(s) bind the per-unit denominator; PER and English unit words accept case variants while SI symbols retain case. Exact Chinese evidence tokens are compared conservatively, not guessed equivalent to Arabic numerals. The shared Bubble numeric parser remains unchanged. Added positive, negative and final-writer regressions preserve existing assertions.

Local combined validation and the standalone Macro release gates are recorded in PROJECT_BACKLOG.md and the draft PR. AI review is not a claim of human approval. The next Bubble PR must wait for Macro to land on main; the combined local validation tree is not a stacked release PR. Production data, workflows, original worktrees and paid services remain untouched.
