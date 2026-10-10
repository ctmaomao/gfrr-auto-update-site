# ADR-0064：免费 Events 的两个 World Order 冲突通道

状态：2026-10-10 owner 在既有设计后要求“请继续下一步”，批准本地实施与验证；独立审阅、远端集成和生产验收待执行。

## 方案与边界

在现有 World Order 独立 overlay 内新增 gdeltEvents，替换和平红利退潮的 GDELT 0.20 和多战区冲突的 GDELT 0.70 输入。其他权重不变；阵营化、经济金融武器化、资本管制保留历史 Cloud 代理及其时效折扣。新源不进入主风险打分、决策、执行、仓位或交叉验证的源证据。Cloud 的 free_only 和旧严格 parser/qualification 保留。

采用完整七个 UTC 日的 672 个 public Events 文件；按原研究定义去重 roots 18–20 的新闻编码记录。不是人工核实的冲突次数，全球国内暴力亦计入；DOC/Web NGrams 不用于填充数量。固定训练期 30 窗口、6 日隔离、7 窗口后检验的尺度区间 49,529～49,529.5；不在线重拟合。训练/检验研究证据见 [设计](../GDELT_EVENTS_SCORING_INTEGRATION_DESIGN_2026_10_10.md)。这不是预测能力认证。

## 新合同及 checker 变更

这是显性的评分/来源合同迁移，不能隐藏为展示修补。原严格统计和点尺度资格仍保持：含未知行的 qualified count / point scale 不晋升。独立新合同仅认证下界有效暴力数、上界下界加全部隔离行的保守区间；缺文件、冲突 ID、未知 ID 与有效 ID 重叠均阻断。相比设计的总分端点检查，实施进一步要求两个端点舍入后得到相同整数冲突通道分数，否则 hold。

check-world-order-stress 对新模型/字段新增来源、尺度、时间及置信度检查，旧模型历史产物仍按原合同验收。既有市场 modifier 合成 fixture 显式关闭新源，保留所有原断言；不是生产 skip。历史研究 harness 同样显式排除新 runtime，固定提交 replay 的模型差异守卫继续保留。无删断言、放宽旧 parser 或新增 ignore。

## 时效、缓存、失败与回滚

专用 producer 下载固定公开 host，不读密钥、不跟随重定向、15 秒短超时、零重试、128 MiB/20 分钟/200 万投影记录预算、连续三失败停止。仅完整可认证窗口保存专用 .cache/gdelt-events-runtime/days.json；不得复制 manual-artifacts 的研究缓存。首次 672 exports，此后正常缺一日 96 exports，加一次最新索引。七日缓存只留汇总、必要哈希和文件摘要；Actions cache 按 main/run 隔离并固定 action SHA。

索引不得未来或超过 3 小时；新值必须对应最近已完整 UTC 日。失败可保留原 acquisition/window/score，最长 72 小时，置信度上限 0.25，不因故障把分数折成低风险；无合格历史值时抛错，在 World Order 文件写入之前停止。正常置信度上限 0.55；未知行和历史三通道局限在页面披露。任何 ACLED receipt 输入触发 source-free 路径，新 Events 零网络请求、零缓存写入；无历史值时暂停而非借恢复操作冷启动。

回滚仅将 config/world-order-rules.json 的 gdeltEvents.enabled 置 false，恢复既有 free_only 历史评分路径；不恢复 Cloud 请求、不删除缓存。线上首轮需独立审阅后有明确发布授权；本地测试使用合成数据及临时目录，不生成生产 JSON。

## 本地验收回执

最终 check:changed/full check:all 退出 0，source-policy 27/27、新 runtime/发布合同 7/7、1440px/390px 浏览器 2/2；node --check scripts/app.js、文案、workflow 与 whitespace 检查通过。两处本轮失败（LF 投影识别、嵌套模板文案扫描）修复后保留原断言并复验。没有生产 JSON 改动、研究缓存晋升、真实 build 或 Cloud 调用。独立审阅、远端集成与线上验收仍未执行。
