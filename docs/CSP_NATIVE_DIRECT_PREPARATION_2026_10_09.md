# CSP 原生直连与原始 alarm 取证候选

## 批准基线与现状

Owner 要求继续实施独立直连入口、只读 alarm 取证候选，并持续完成可独立推进的准备和验证。本轮基于 latest main `26667970`，分支 `codex/csp-native-direct-preparation`。后续明确批准新的独立 AI reviewer 只读代审本候选、推送该分支并创建以 main 为目标的独立 PR；没有新平台批次、merge/部署、真实访客传输、付费升级或删除授权。此前各批次的一次性批准不复用。

第二批真实 relay 序列已通过七次请求检查；八次预占后预算为 50/500，未用额度不退回，已恢复关闭版本 `09dd66b1-697a-4e8f-a04a-941edb0f744f`。此处为 10 月 8 日执行回执，非本轮平台读回。所有旧授权、marker、预算、归档锁和证据保留。本轮不运行任何 live CLI。

## 可选只读 inspection

既有 `/health` 默认 JSON、判定及 no-CORS 行为不变。仅 `/health?inspect=retention-v1` 将 `inspect:true` 传给相同 singleton RPC；仍由原有 trial admission 和 GET 限制保护，关闭时在获取 stub 前拒绝。

已初始化对象的响应添加 `observations`：`contract=csp-retention-inspection-v1`、`observedAt`、实际 `ctx.storage.getAlarm()` 的 `alarmAt`（毫秒或 null），以及原始 `last_cleaned_bucket`、`cleanup_completed_at`、`cleanup_started_at`、`cleanup_attempts`、`retention_days` 字符串/缺失 null。不计算预定时间代替实际 alarm；不返回 URL、正文、IP、sample、错误日志或任意 meta。额外查询固定五个已有键。默认不执行额外查询；inspection 不建表、不写 SQL、不调度、不修复 alarm。读失败仍 unknown/cannot-confirm，不返回部分 observations；未初始化仍 uninitialized。

## 原生投递与请求门

`tests/csp/native-direct.mjs` 用两个 localhost 合成页面触发 Chromium 的原生 legacy report-uri；通过 Playwright route 在发送前核实原始正文，随后 `route.continue()` 保留原生字节。没有 route.fetch、Node 转发或报告重写；不是 report-to 注册验收。

仅允许固定 loopback 文档及 `?synthetic=fiction-only`、固定指令/inline/disposition、固定候选策略、已知 Chromium 字段。referrer/sample 必须空或缺失；source-file 仅允许相同固定合成页面的无 query 或固定 query 形式。未知字段、重复、超限、过期或已失败全部在 transport 前拒绝。除两份本地文档和固定目标外，其余浏览器请求阻断；新 context 无 service worker/浏览器持久资料。同步预算门必须先落盘 attempt，才能 continue。异常锁存立即关闭 context，10 秒 deadline，finally 关闭 browser/server。

原生 report-uri 的响应被浏览器忽略，普通 Playwright response API 可能为 null；JSON 响应在 Chromium 可表现为 ORB。候选使用同一页面 CDP 的 requestId + responseReceivedExtraInfo 取得原始 HTTP 状态/头，不读取/重取响应正文。记录 `responseBodyInspected:false`；前后只读 ingest 增量须恰为 4，才能声明此受控序列的两份原生报告有对应入库证据。公开或并发流量仍可能干扰聚合归因，不能据此承诺生产可靠性或全账号硬费用上限。[W3C CSP 5.5](https://www.w3.org/TR/CSP3/#report-violation) 指定 legacy report-uri 的 redirect mode 为 error，并忽略响应；本地真实 Chromium 回归另证 307 不跟随且不发送第二页。

## 独立第三批准备

```powershell
node tests/csp/controlled-native-platform.mjs --dry-run
node --test tests/csp/native-direct.test.mjs
```

默认计划 approved=false、无网络、不改共享预算。固定 batch/account/target、50/500 基线、八次预占至 58/500；绑定新 runner/producer、已有 shared harness、Worker 源指纹和第二批成功 result SHA256。仅接受固定的新 `test-results/csp-native-direct-{authorization,closed-readback,open-readback,once}.json` 和 `csp-native-direct-live/`；共享原预算/锁，不自动恢复任何锁。

七次请求为 closed health、open inspection before、两份 native report、open inspection after、expired report、expired health。所有发送先持久记录，不重试/不退额；失败保留八次预占、marker、输出和锁，成功只释放本序列自己的锁。下一次 alarm 必须实际为未来毫秒，原始完成时间与清理日/retention 必须一致，started 空、attempts=0，否则停止。

独立审阅指出开窗结束后的两次过期检查可能越过五分钟总边界，候选已补统一截止时间：从序列入口起计 300 秒，授权 endAt 必须至少预留 25 秒。每次发送及响应完成均核对总截止；所有等待、Node 响应读取和原生 producer 受同一 deadline/AbortSignal 约束，超时关闭浏览器 context 并保留失败账本/锁。手动回归覆盖拒绝完整五分钟开窗、迟到响应、第二份原生发送、过期检查和最大合法窗口，以及真实 localhost Chromium 的共享取消；不能用开窗时间替代整个序列验收。

未来平台执行须新的具体批准：八次请求槽 50→58、现有 Worker 最多 **三次** 更新（关闭态部署含 inspection 的候选、开窗、显式关闭）、整个请求序列最长五分钟、现有 loopback origin/namespace/日志关闭、Free、无升级/新资源/生产 C。新源尚未部署，不能把上一批关闭版本冒充含新 inspection 字段的候选。部署前后仍需独立控制面读回；sourceFingerprint 仅标识本地字节，不是远端源码认证。参数必须经 JSON.parse + Node argv 数组保留 UTC 毫秒/Z。CLI 自身不执行任何部署。

## 实际过期删除与生产边界

已保存 10 月 7 日 SELECT 快照的最早桶为 2026-10-03。当前 14 天（含当天）规则在 2026-10-16 UTC 的阈值为 10-03（不删同阈值桶），10-17 为 10-04，故最早自然删除资格在 **2026-10-17 UTC**；不是保证该时点已删，也不是新平台快照。

优先自然观察，不缩短 retention、不回填旧日期、不注入过期行、不手动触发 alarm、不删除 SQL 数据。未来分别保留到期前同桶 obs/ledger 非零 aggregate、到期后归零、raw 完成时间/日/retention、平台 alarm 执行证据，才判断实际过期消失；清理标记、空表、健康状态单独均不构成实际删除证据。计划时间不能替代 getAlarm。Data Studio SELECT 消耗平台额度/留控制面审计，须新范围批准，不属于 HTTP 请求账本。

生产 C 继续锁定：原生报告保留 document-uri query，本地合成字段允许不等于真实访客隐私批准。平台日志关闭不等于平台不处理连接元数据；CORS 不作认证，拒绝请求仍消耗共享 Worker 额度。若 owner 要求 URL/query 完全不外传或绝不影响 realtime 共享额度，则此公开原生采集路线不满足。独立 review、真实传输决定、公开流量/额度选择及生产配置发布/回滚仍各自待完成；不自动改为自定义遥测、另一账号或付费方案。
