# CSP 原生直连批次停止回执与诊断修复

## 执行批准与实际结果

Owner 在已明确列出范围后要求开始下一步，批准这一新批次：固定既有 account/Worker/namespace，八槽 50→58、最多三次更新、整个请求序列不超过五分钟、仅合成报告；不升级、不创建资源、不启用生产 C、不删除或重试。PR #439 已合并 `aae12fe3`，本批次部署该审阅候选。此前批准、marker 和账本不复用。

执行前重新读回原关闭版本 `09dd66b1`、loopback origin 与 namespace；控制台确认 Workers Free 当前计划、Logs/Traces/Issues 关闭且无导出。已有 OAuth 凭证在同范围刷新，没有新增权限。Free 当前计划不等于全账号零处理成本或共享额度保证。

三次更新已执行：关闭态候选 `6edd928c-c948-400f-83de-300fa57ea9ba`、开窗 `571a4260-b6e0-4823-b207-f8ab6a999427`、显式关闭 `b9524593-ac3a-4508-a38a-df5c1a8303d8`。关闭态候选部署后才生成本批次新授权；Node JSON.parse/参数数组保留 UTC 字节。预定开窗为 2026-10-09 06:53:16.281Z 至 06:54:46.281Z；失败后提前关闭。

实际仅两次接收端请求：closed health 503、open inspection before 200；后者 HTTP 层通过，但 inspection 内容断言失败，runner 退出 1、outcome=stopped。未发送原生报告，未执行 after/expired 请求。所有 nativeDirect/rawCleanupWatermark/nextAlarm/deletionVerified 均 false。八槽预占不退，累计预算 **58/500**；marker、失败输出和共享锁保留。最终控制面及 UI 再次确认 trial=false/空 UTC、原 namespace/loopback、日志追踪关闭。没有额外接收端探测、解锁或第四次更新。

原始证据位于 ignored `test-results/csp-native-direct-execution-20261009/`、`csp-native-direct-live/` 及固定新 authorization/readback/once 文件。所有前批证据哈希保留；预算变化仅来自本批次预占。不得覆盖这些文件、解除失败锁、退回名额或用旧批准重跑。

## 诊断缺口与本地修复

原 CLI 只保存 AssertionError 名称，没有保存拒绝的 inspection 字段。因此当前证据不能确定哪条内容断言失败，不能推断 alarm、清理或远端代码的具体故障，也不能补造这次响应。

本地诊断修复基于 latest main `a6724d5a`，分支 `codex/csp-native-inspection-diagnostics`。在 inspection 验证前，先 fsync 落盘已知操作字段的脱敏快照、解析后响应 JSON 的 SHA256、观察时钟及 validationPassed=false；验证成功才置 true。仅保存已知状态/告警、整数、固定日期和有界数字文本；未知值标 invalid，告警快照最多 16 项并保留原数量，不保存消息、URL、任意字段或原始正文。

原 validateInspection 全部断言保留，仍检查原始完整响应；诊断裁剪不裁剪 validator 输入。health HTTP 通过与内容验证通过分开记录。失败仍在原生发送前停止、保留预算/marker/锁、不重试。Worker runtime、SQL、retention、alarm、旧 CLI 和生产配置无改动。新 runner 指纹不允许复用本次已耗尽授权。

离线回归覆盖告警/缺失 alarm 导致停止前已保存脱敏快照、零原生发送与锁/预算保留，以及任意消息/URL/未知字段不落盘。它验证诊断机制，不说明本次真实失败就是这两种情况。手动回归 19/19、`check:changed`（完整 `check:all`）均退出 0；自审原断言未放宽、无新增 ignore、Worker 无差异。新的独立审阅待批准；当前不推送、不创建 PR、不部署或开启新窗口。

## 后续边界

先独立审阅诊断修复，再按新具体批准处理远端 Git 和独立取证批次。共享失败锁的恢复须另有可恢复方案与具体批准；不能因为 PID 已退出就移除。新批次需新的路径/指纹/预算基线，不得在旧 marker 下重跑。

真实原生直连、实际 getAlarm、过期删除仍未验收。自然删除最早资格仍为 2026-10-17 UTC，需前后证据，不缩短 retention、不回填、不手动触发 alarm。隐私、公开流量/共享额度及生产 C 的启用/回滚决定继续保留独立门槛，见 [原候选边界](CSP_NATIVE_DIRECT_PREPARATION_2026_10_09.md)。
