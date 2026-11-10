# OFR主读数替代 · 实施准备与待决策清单

> **当前状态核对（2026-11-10）**：#491/#492 已分别合入 `b537a779` / `09412f1c`，OFR 主读数与旧公开建议退役已进入生产代码；2026-11-01 双站验收记录保存在[原文快照](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)。下方“未接 runtime/待最终确认/Proposed”保留原准备阶段语境，不是今天仍未迁移的结论。当前字段/消费者以 DATA_CONTRACT、DESIGN 及后续明确修订为准；原始/历史数据、冻结七候选、来源和不作概率/仓位映射的边界继续有效。

本任务把替代方案推进到实际代码和可审阅契约，不再增加待选自研模型。owner已批准退役旧公开建议，并授权本次issue、独立Codex代审及分项PR推送；当前生产激活为false，最终合并上线另行确认。依据[ADR-0080](ADR/0080-ofr-primary-pressure-migration.md)；它仍是Proposed，没有改写现行规则。

## 准备包#491的固定范围（历史阶段记录）

- `scripts/daily/ofr-pressure-readout.mjs`：官方CSV严格解析、原值/观察日/时效、日期对齐周变化、只用过去数据的十年辅助百分位、旧/新总指数snapshot修订比较（贡献项未比较）、单次15秒/6MB/无重试/拒绝重定向抓取函数。
- `tests/unit/ofr-pressure-readout.test.mjs`：真实零/负数/缺失、schema/date、窗口缺口、时间顺序、revision、HTTP/schema/超限故障隔离。使用明确标记的合成单元fixture，不发布为市场数据。
- 解析/抓取均未被Daily、Worker或浏览器导入，不存在生产writer，不修改`data.score`、`decisionModel`或旧七候选。标准纯函数检查登记测试，未放宽原断言。
- 本地ignored验收目录为主工作区 `manual-artifacts/main-score-audit/pressure-model/ofr-primary-migration-2026-11-01/`；包含真实来源收据、可复算结果、窗口敏感性、消费者定位、桌面/手机预览及检查回执。raw仅本地，不作为网站分发产物。

## 必须逐项迁移的消费者

| 当前消费者 | 具体入口/字段 | 推荐的新版本去向 |
|---|---|---|
| Hero主数、标题/归因/周变化 | `renderMacroOverview.js`的`renderHero`，`hero-score-value`等；macroOverviewNarrative | 显示OFR原值、观察日、相对自身平均及原值变化；辅助百分位明确名称；不保留旧/100主分含义 |
| 风险标尺和8周趋势 | `renderThresholdBlock`、`renderMacroTrend.js`及静态阈值线 | 新序列单列，新口径起点标记；不沿用旧25/40/60风险档，历史曲线不拼接 |
| World Order升档与观察层印证 | Hero/标尺overlay、observation reaction与cross-validation | 独立背景，不改变OFR主读数或替它升档；未定义关系时保持背景/待确认 |
| 六模块/四层证据 | pressure sources、risk engines、fourLaneReadout | 保留原始指标/独立警报及旧模型诊断身份；不当作OFR分解、独立确认或数值加分 |
| Daily状态、执行锁及仓位 | `regimeProb`、`lockEngine`、`decisionModel.stateScore`、`positionGuidance`、`tradingSystem` | owner已选择从对外当前建议中退役；原始值/历史归档保留，**不实施OFR到仓位映射** |
| 前端动作队列/触发器/失效规则 | `decision.js::buildDecisionModel`及merge/build helpers | 与上项同步停用当前建议或按获批隔离方案处理；不能让fallback重新输出旧建议 |
| 资产轮动、概率、风险预算 | pipeline asset bias、regimeProbabilities、rotation、decision riskBudget fallback | 不拿百分位代替旧模型输入；依赖旧分的建议同上退役，独立原始行情保留 |
| AI宏观正文与输入资格 | `macro-risk-editorial`及其contract/as-of资格 | 新口径不能冒充旧文的同模型输入；旧正文只能按明确历史身份处理。无provider调用或费用授权由本补丁授予 |
| 外部接口/历史与验证 | data contract、validate-data、history、Pages白名单及相关checker | 单独版本化字段/生效日；不把原`data.score`悄悄改义，不重写旧数据。旧安全检查保留，替换断言独立review |

这是有源码定位的迁移清单，不声称文本搜索穷尽动态alias。实施时需逐项实际差异/测试关闭，不能只替换Hero。

## 原子发布顺序与停止条件

1. 本准备补丁完成离线及一次真实artifact试跑、完整检查和本地预览；正式契约仍未改，线上不受影响。
2. owner已选择正式退役旧公式推导的公开状态/仓位/风险预算/动作建议，保留历史审计及安全闸门；[讨论#490](https://github.com/ctmaomao/gfrr-auto-update-site/issues/490)已创建。
3. 本次迁移另有明确独立Codex代审及分项推送授权，以已确认方案形成独立契约PR，记录具体DESIGN/data/checker迁移；实际补丁须独立审阅。不是复用PR488回执。
4. 按通过的契约实施单一迁移PR，覆盖来源缓存/修订留存、全部当前消费者、前后界面及缺失/失效场景；检查/独立审阅/源许可及生产接受均通过后再发布两站。发布失败按已审阅回滚方案恢复整版，不只恢复数字。

不再以自研七候选等待天数阻塞“来源明确的机构读数”提案评审，也不宣布它们的84/40/12或独立状态准确性门槛通过。新主读数的合格结论只覆盖测量/来源/发布；交易用途与预测需要另行证据。

## 研究推荐已收敛到实现要求

1. 保留机构原值为主、百分位为辅；固定5/10/全历史对照说明尺度漂移，不择优调窗口，不套用旧档位。
2. OFR修订与换源分开保存，不覆盖已发布快照；raw仅ignored，公开归因/日期/字节摘要。借鉴OFR指标迁移方法，不宣称历史源永不修订。
3. 融资利差按同族测量处理，银行余额按发布版本及结构调整解释；这些研究继续作为模块证据，不直接为OFR加分。
4. 分清压力、市场功能和长期脆弱性；独立状态研究继续，不把OFR符号或本站阈值生成真值。保留旧候选前瞻协议及失败记录，不回填或清空批次。

参考：[OFR定义](https://www.financialresearch.gov/financial-stress-index/)、[法律说明](https://www.financialresearch.gov/legal-notices/)、[指标迁移论文](https://www.financialresearch.gov/working-papers/files/OFRwp-23-07-transition-to-alternative-reference-rates-in-ofr-financial-stress-index.pdf)。源集中和两营业日左右时差必须显式展示；官方指标也不保证所有市场状态正确。

## 当前本地完整消费者补丁（未合并、未上线）

- 发布投影与严格validator退役旧公开建议；`publish-ofr-pressure.mjs`仅在既有Daily安全/连续性build完成后单次抓取，失败保留原日期缓存或缺失，不改旧公式/历史/Worker/冻结realtime。未运行真实Daily。
- 新`renderOfrPrimary.js`及入口计时器迁移主位、辅助十年位置、独立原值趋势和四层说明。旧JSON没有OFR时待更新；负值、0、缓存、过期、缺失分开处理，持续打开也重核源龄。六模块/传导明确为旧模型诊断，World Order不升档OFR。
- 执行、旧主分时间维度与资产预测模板保留兼容锚点，静态hidden/inert且CSS强制不显示，当前入口不调用旧执行renderer。结构观察与采集安全记录保留；旧AI当前/历史稿不移植，新admission在预算/检索前hold。
- 唯一既有checker断言替代已在ADR-0080显式登记；旧validator断言全部保留。既有E2E旧主位/旧AI展示预期按契约替代，新增两视口七状态；旧模型与历史AI资格单元测试仍保留。
- 本地真实CSV投影1440/390主位-1.829、13导航、无横溢或pageerror；不是生产观测、新发布vintage或准确率结果。完整检查、coverage、最终E2E及固定差异独立审阅以实际回执为准。

## 首次发布及回退边界

完整前端退役保护和Daily代码一起部署；初始旧JSON使主位待更新且无旧建议，下一次正常Daily通过原安全闸门后才写OFR。不得为迁移启动付费provider、额外调度或降低闸门。OFR故障保留有日期旧观察或待更新，不复活旧综合分；原CSV仅ignored，公开归因/日期/字节摘要/统计/紧凑观察，Git版本留存已发表组件。

故障时优先保留退役界面、隔离失效OFR并显示待更新；不直接退回会恢复仓位指令的旧HTML/旧建议版本。代码回退须审阅完整差异，保留退役保护和原始/历史数据。最终合并、两站部署及生产验收待完整补丁可审后owner确认。

受控前后界面和两视口验收见[视觉记录](review-evidence/ofr-primary-20261101/README.md)。
