# ADR-0082：免费 Events 索引等待与整日缓存检查点

## Status / acceptance baseline

2026-11-03 owner 明确要求继续修复 World Order 连续失败，优先处理 GDELT 索引时间和缓存、减少重复请求；不使用收费 API、不放宽来源和计分门槛，审核通过后上线并核验两站。沿用本聊天 Codex 代审授权，记录为 AI review，不冒称独立人工。此独立运行链修复 PR 不修改评分或来源资格。

## Context

run 41375748838 / 41401453164 在 publication hold 停止；历史源的七日窗口截至 10-28，acquisition 为 10-29，已超过回退期限。公开索引探测出现数分钟提前，但公开 ZIP 返回 200；不能据此认定限流或解释历史未保留的底层异常。旧逻辑对未来索引立即 hold，且只在完整窗口可发布后保存缓存，失败会重复采集已经完整的日数据。

## Decision

1. 对最多提前 15 分钟的索引，仅在原 20 分钟总预算内分段等待真实时钟到达，每段最多 30 秒。等待不重复 GET、不修改源时间、不以服务器 Date 替换本机时钟。超过等待上限、时钟不推进、超过总预算或索引超过三小时仍 hold。等待跨 UTC 午夜时，在等待后重新选择最近完整日。
2. **窄范围替代 ADR-0064 的缓存保存阶段**：允许保存当前目标窗口内、通过原 validateResearchDay 的完整 96 文件日投影。保留原文件摘要/digest、acquisition 与最多七日/50MiB 缓存格式；不保存未完成日、不复制研究/人工缓存。全窗口未合格时，日检查点只代表采集进度，不是生产来源。
3. 正常刷新在 GITHUB_OUTPUT 标明是否产生新完整日；只有该输出为 true 且无 ACLED source-free receipt 时，workflow 才允许在成功或失败后保存专用缓存。没有新日则不重复上传旧缓存；source-free 刷新仍为零 Events 请求/写入/上传。
4. 在 score gate 前输出有界、固定分类的 index/wait/target/cache/request/failure 诊断，让主故障与历史回退失败可分别归因；不打印凭据、请求头或原始数据。

## Unchanged gates

生产仍须完整七日 672 文件、无冲突/歧义 ID、原隔离上下界与相同舍入端点、同一固定尺度、最近完整 UTC 窗口、索引不得未来且不超过三小时、72 小时历史回退、原置信度上限。gdelt-events-score.mjs 和既有 checker 断言不改。下载仍固定公开 host、15 秒短超时、零重试/重定向、128MiB/20分钟/200万新投影记录预算。免费 Cloud policy、其它来源与权重、主站评分、Bubble 周评均不改。

## Verification / recovery

保留旧 7 项 runtime 断言，增加未来索引真实等待、过度未来/过期/停钟/超预算拒绝、跨午夜、完整日检查点及故障续采、source-free 与 workflow 保存边界。原来五个缓存日、随后一天成功一天失败的场景，恢复只需 97 请求，不重下前次已完成日；首次失败中的不完整日仍不保存。

合并前完整 check:changed/check:all、实际 diff 复核和 CI；合并后只走既有 main 免费刷新。若预算 hold 但已保存新完整日，可根据诊断从检查点继续，不能增加预算或降低资格。失败无新进度或 HTTP 访问限制不得盲目循环。两站须核对实际 JSON、窗口、acquisition、来源、模型与 ACLED 配置，不以绿灯或新 updatedAt 代替新来源。Cloud free_only 与下游 Macro admission 须在派发前确认，不引入付费调用。

回滚为撤销本 PR；已校验整日缓存仍使用原 v1 schema，旧 reader 可读，旧来源资格与计分规则没有变化；不删除缓存或历史数据。
