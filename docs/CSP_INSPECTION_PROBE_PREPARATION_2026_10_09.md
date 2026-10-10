# CSP 独立 inspection 取证准备

## 当前基线与批准范围

Owner 要求持续完成可做的准备，直到需要授权。PR #441 已合并 `2875b755`，新的诊断逻辑已独立审阅；其批准不覆盖本入口。owner 又具体批准归档本轮失败锁，2026-10-09 已移动到 ignored `test-results/csp-native-lock-recovery-preparation-20261009/retired-native-direct.lock`，字节 SHA256 与独立副本一致，九项原件/副本核对通过，预算仍58/500。没有退款、删除、重跑或平台动作。

本候选基于 latest main `2875b755`，分支 `codex/csp-inspection-probe-preparation`。仅新增独立手动入口、离线回归及证据 fixture，不改旧原生入口、validator、Worker runtime、SQL、alarm、retention、CI、依赖或生产配置。历史关闭版本 `b9524593` 来自旧回执，不能冒充新平台检查。

## 新批次与预算

`tests/csp/controlled-inspection-probe.mjs` 默认/`--dry-run` 仅输出 approved=false 计划，不联网、不读取凭证、不修改预算。固定原 account/target/namespace/loopback，采用新 `csp-inspection-probe-{authorization,closed-readback,open-readback,once}.json` 与 `csp-inspection-probe-live/`，共享既有账本及锁。

只接受新58基线，三槽预占到61/500；固定三个 GET：closed `/health`、open `/health?inspect=retention-v1`、expired `/health`。不访问 `/csp-report`，不发送原生报告，不通过浏览器采集。失败不补请求、不退额度，保留本批次 marker/result/失败锁；正常成功只释放自己创建的锁。旧50→58入口和旧marker保持原样。

授权绑定新 runner、已合并 diagnostics、shared harness、Worker 源指纹及三份真实字节 lineage：此前 stopped result、归档锁、明确批准后的移动回执。fixture 仅包含这些已检查的非敏感操作字段，字节以 base64 保持跨系统换行后的哈希；base64不是脱敏措施，不能把它用于任意真实响应。CLI 仍读取原固定 ignored 证据，不把 fixture 当平台 lineage。

## 验证与失败留存

复用原 `validateInspection` 全部断言，验证完整响应，不放宽健康条件。HTTP 200 alert 或503 unknown 可在判断内容前保存既有有界脱敏快照，随后停止，validationPassed=false；未知字段、消息、URL及原正文不保存。原生投递、自然删除和生产可用性不因诊断成功被声明通过。

每次 transport 前 fsync attempt；响应上限16KiB，redirect=manual，不跟随跳转，单请求信号上限10秒。整个序列300秒，endAt至少预留25秒；等待开窗、响应正文与到期检查受统一 deadline/取消约束。读回须核对原account/namespace、Free、观测关闭及30秒内的控制面观察时间，开窗version须与关闭态不同。客户端 observedAt 是操作者观察声明，不是平台签名证明。

离线回归用临时账本及fake transport，覆盖healthy完整序列、200告警/503未知内容拒绝前留存、隐私字段隔离、预算/锁保留、旧批准/lineage/指纹/读回拒绝、迟到/超限/跳转/无效JSON与阶段截止。交付前运行专项、默认dry-run、`npm run check:changed`（完整检查）和 whitespace；检查通过不构成平台批准。

## 需要独立批准的后续

首先请求新的独立只读 reviewer 审阅本候选；通过后若获批准，可推送上述分支并创建以main为目标的独立PR。merge仍需相应批准。此前 #441 的review/远端批准不能复用到本新代码。

平台批次另须具体授权：三槽58→61、原Worker最多两次更新（开窗、显式关闭）、请求总序列五分钟，无重试；Free、不升级、不创建资源、不接生产。执行前刷新控制面/UI，确认源和观测配置、namespace、关闭态与配额选择，按Node JSON.parse/argv保留canonical UTC。新窗口在旧关闭部署含inspection且本地Worker源无变化前提下才使用两更新方案；若不符，停止并重提范围，不能追加关闭态候选部署。

CLI不部署；操作者在开窗前必须已准备显式关闭路径。不论诊断失败或超时，都在最多两更新范围内关闭并验证；关闭恢复失败则保留事故回执，不擅自增加更新或HTTP探测。开窗会暂时公开既有report端点；GET-only限制仅约束本工具，不能阻止外部请求或保证全账号零费用/不影响realtime共享额度。

现阶段隐私、公开流量/共享额度、费用和生产启用决定仍待完成；原生直连/实际alarm/自然删除仍待验收。归档旧锁不授权新窗口、SQL查询、手动alarm、数据删除或旧入口重跑。详见[本轮停止回执](CSP_NATIVE_DIRECT_TRIAL_2026_10_09.md)及[原生候选边界](CSP_NATIVE_DIRECT_PREPARATION_2026_10_09.md)。
