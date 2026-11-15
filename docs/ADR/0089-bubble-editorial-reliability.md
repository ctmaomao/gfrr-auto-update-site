# ADR-0089: Bubble 周评可靠性与原期历史保留

## Status

2026-11-08 owner 同意实施分阶段可靠性方案：先离线回归，再另行真实生成与两站验收。本轮仅隔离工作树实施与验证，不调用付费 provider，不推送、合并或部署。须独立审核后再安排后续阶段。

## Decision

本节窄范围替代周评设计中“两个搜索渠道均完全健康才可进入 provider”和“换期即彻底隐藏旧稿”的规定，不改变事实、引用、评分隔离、单次调用、无重试或费用门槛。

- 搜索渠道与事实来源分开判断。允许一个渠道完成全部六项查询、另一渠道受限时，仅使用健康渠道返回、日期在本期窗口、有效 URL/域名、至少80字符可用摘要的既有官方/交叉来源/登记专业媒体证据。必须至少一条合格证据，标记 limited_single_search、使用简版、置信度不超过70，并明确披露覆盖不足与未充分核实。仍无合格证据、两个渠道均受限、摘要缺失、标题/付费墙、来源未知、计数不一致均拒绝；只有原双渠道健康且零新闻规则可 expected skip，不新增补检或付费重试。
- 安全格式修复限既有 JSON fence、置信度单位、已明确声明引用配对、缺失归因和由实际渠道状态生成的固定限制说明。原稿数字/单位/日期/正文不改；错误或重复的现有 attribution 不再被清理掉，交由严格 validator 拒绝。任何补齐超出长度或数组上限仍拒绝，不截断正文。
- review 绑定输入与输出 SHA-256。projection 重新计算 review；transient projection 的 writeEvidence 保留原输入摘要和 review，绝不投影至公开 JSON。writer 重跑完整事实/引用/数字/引述校验、readiness 与 review，核对原输入 SHA、正文 SHA、当前 Bubble 非 AI 数据快照、结构化事实/评分/历史字段，重建 projection 精确比对。
- writer 仅允许匹配当前 Actions 的 main 周评工作流；时间必须真实合法、按 discovery/input/output/review/projection 顺序、无未来时钟。发现/输入/输出距写入不超过30小时，原数据期不超过240小时，新闻窗口与期次一致且不超过10天。metadataOnly 回读不宣称可重新核验已经移除的摘要。
- builder 只从既有生产数据保留一份通过原期契约、摘要校验及 Actions 溯源检查的 previous_weekly_editorial。原文章、日期、生成时间、模型/评分快照完整保留；不读取 manual artifacts、不重写旧稿、不晋升历史为现稿。浏览器使用原期快照校验和摘要核对，显著注明原数据期/生成时间/原分数；Hero 始终使用当期确定性正文，当前数据更新不冒充 AI 已更新。
- 状态任务必须同时看到成功发布步骤和匹配该 run/期次的有效生产正文才标记 published；只成功生成/校验不算发布。费用去重继续采用更保守的原期占位检查，不能因正文不合格而再次调用。

## Verification and rollout

新增离线正反例覆盖单渠道/零证据/错误渠道、置信度/披露/事实硬阻断、输入与正文篡改、同日数据漂移、旧期/未来/非法时钟、原摘要重新 grounding、错误 review 和 Actions、真实失败回放，以及历史保留/损坏/原日期/重复渲染。保护旧原件，不修改生产 JSON。

原有 checker 断言不删不跳过；provider-path 与 score 测试仅更新 fixture review/输入凭据以满足更强 writer 契约，新增负例证明拒绝。独立 review、真实付费生成及 Pages/EdgeOne 验收仍为后续阶段，不以离线 PASS 冒充。

回滚为撤销本补丁；恢复原双渠道门槛和确定性回退，旧历史字段无消费者，不自动生成或重发正文。


## Original local verification receipt (historical)

- `npm run check:changed`（full，包含 `check:all`）：exit 0；最后定向24项测试全通过，无skip。总检后增加缺失output对象的fail-closed防护、移除未使用局部绑定，已复跑受影响Bubble全套、24项专项、contract与lint；其它范围未改。文档/whitespace另验。
- 三个真实失败包保持原SHA与inputDigest：41531578149通过；41534908718只补同段引用后通过；41526065601原HY输入缺bps单位仍拒绝，未篡改原事实。
- 真实2d4bd025生产稿原日期2026-11-02、原生成22:44:02.525Z、run41539541399保留验证通过；1440/390预览原日期明显、Hero本期确定性、27卡、无溢出/JS错误。
- 独立AI审阅发现的跨渠道聚类污染及sourceRefs篡改已修复并重放原反例；不冒称人工review。
- 当前main的11/3快照已经没有旧AI字段，自动保留仅保护后续builder看到的已发布稿；恢复已丢稿须另行受审数据迁移，不能将本次ignored预览直接晋升。未调用付费provider、未写生产JSON、未推送/合并/部署。

## Combined independent review and serial release

Owner subsequently confirmed push/PR, independent AI review and serial merge/deploy after checks. The original local-only receipt above remains historical. Paid generation still requires separately confirmed spending and automatic-run scope; budget PR #508 and Macro PR #507 are now merged. Bubble is selectively integrated on main 719792ea in its own isolated branch for a non-stacked PR. The shared CNY 5 budget and free-search account-evidence gates remain fail-closed; release authorization does not authorize missing evidence, ledger initialization or provider calls.

Independent integration review reproduced a single-channel corroboration gap: an expired, future, undated, short or paywall-only row could donate a second domain or trusted classification before being rejected. Qualification now precedes trusted clustering. Rejected rows remain discovery-only and cannot donate source status, titles or supporting domains. Supporting-domain counts are checked consistently, with unchanged fact and budget requirements. New positive/negative regression assertions supplement the original suite.

Combined check:changed (including check:all) passed; measured unit suite passed 1474 tests with zero failures and one existing conditional skip. Final full browser suite passed 98/98. Three original current-invalid fixtures now explicitly omit retained historical issues, preserving their exact rejection assertions; companion tests independently require original historical content, dates and scores, deterministic current Hero, 27 cards, and no overflow/JS errors. The original failed-run artifacts are retained, not overwritten. Actual Chrome desktop/mobile validation also passed with the original 2026-11-02 history, without rewriting its date or generation time. These are offline/fixture validations, not paid generation or production deployment acceptance.

The first Macro release independently passed 1454 unit tests (one existing conditional skip), 95/95 browser cases and full checks. No production JSON, workflow, shared numeric parser or frozen realtime file was changed. No paid provider/search call, budget reservation, merge or deployment is claimed by this combined receipt.

## Budget-first serial integration (2026-11-08)

The final Bubble delta from 37e4a3cb to 64fe6d9b is selectively applied on main 719792ea, preserving the merged Macro OFR contract, shared provider callback and retired CEO paid Wind fallback. The new offline provider example explicitly injects the existing fixture budget; real default missing-configuration, over-limit and unresolved-ledger refusals remain covered separately. No production data or configuration is changed. Final-tree full checks, independent AI review, browser coverage and production static acceptance must be recorded separately; prior combined results above are not this tree's receipt.

Final-source integration verification: full check:changed/check:all exit 0, unit coverage 1,594 pass / one existing conditional skip / zero failures, standard E2E 98/98 first-run pass, and actual installed Chrome 1440/390 synthetic visual/overlapping-load acceptance pass. Independent AI review reports no P1/P2. See [evidence and limitations](../review-evidence/bubble-budget-integration-20261108/README.md). No live generation, ledger initialization or production acceptance is claimed.
