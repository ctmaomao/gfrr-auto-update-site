# CSP 隔离接收端平台验收准备

## 授权与交付范围

Owner 在 PR #433 合并后要求开始准备，并于 2026-10-07 要求继续。本轮只准备部署参数、新的受控脚本与本地验证，不部署、不发接收端请求、不接受费用、不启动生产 C。基于 main `ddcc2af9`，新分支 `codex/csp-platform-preparation`；不继续向已合并 #433 追加任务，其独立 AI review、push/merge 和发布批准不延伸到本候选。

#433 已合并并不等于接收端已更新。既有平台版本记录为 `a96ec4ba-d522-4a87-8cbb-3ff3ca8134a3`，需要未来执行前重新读回。真实累计预算文件 `test-results/b-budget-state.json` 当前为 34/500；本轮只读，不重置或覆盖。旧平台工具、markers、证据、资源和分支保留。

## CORS 与部署参数

[Wrangler 官方命令说明](https://developers.cloudflare.com/workers/wrangler/commands/workers/)规定：`--keep-vars` 保留 dashboard 变量；`--var` 显式值覆盖配置中的同名值。不能仅用注释保证 loopback CORS。两次拟议更新均使用 `--keep-vars`，并显式传入 `CORS_ALLOWED_ORIGINS:http://127.0.0.1:8765`；不开通生产 origin，不添加 route、domain、cron 或新资源。仓库 Wrangler 配置仍默认关闭，不改运行时代码、SQL、预算、清理/alarm 或 observability。

默认命令只打印计划，不联网、不写预算，不调用 Wrangler：

```powershell
node tests/csp/controlled-platform.mjs --dry-run
```

输出 `approved:false`、Worker 和测试脚本的 SHA-256 指纹、两个参数数组。参数数组是可审阅数据，不自动执行。

- `closedArgs`：显式 false、空 start/end、loopback CORS。
- `openArgs`：显式 true、精确 UTC 固定 start/end、loopback CORS。
- 两个数组均使用固定接收端 config 和 `--keep-vars`。不得去掉 `--dry-run` 就把本地编译检查当作部署批准。

已用既有缓存的 Wrangler **4.147.0** 分别执行 closed/open 参数的 `deploy --dry-run --outdir <本轮新目录>`，两次均退出 0。没有安装/升级依赖或更新资源。实际执行前必须重新生成未过期窗口、核对 reviewed 指纹，并完成独立 review 与具体批准。

## 测试链路与预算

本候选明确采用 **localhost 原生 CSP 报告 → 字段白名单转发器 → 现有隔离 Worker**。Chromium 的报告端点始终为 `http://127.0.0.1:8765/csp-report`；浏览器不直接访问 Cloudflare。转发器只接受两个合成路径和固定 `?synthetic=fiction-only`，传输 document-uri、effective-directive、blocked-uri、disposition 四项验证过的合成字段，不转发 referrer/sample 或任意元数据。

这避免依赖“Playwright 必能拦截 Chromium 后台原生报告”的未验假设。它验证原生生成与平台转发链路；**不证明浏览器原生直连 Cloudflare、report-to 注册或真实访客出站脱敏**。此前原生直连提案的这部分判据继续待验，不能因本脚本通过而划掉。

首次发送前，脚本取得与旧工具共用的 `b-budget-state.json.lock`，要求累计数恰为 34、limit 恰为 500；创建全新的 marker/输出目录，**一次性持久预占全部 8 次**到 42/500。未用名额不退回，失败也不退额。每次发送前另落盘 attempt，并重新核对共享预算。控制台/API/部署调用不是这 8 次接收端请求；平台额度也不等于应用预算。

固定序列使用 7 次，余下 1 次只保留为已预占的安全余量，本脚本不使用它自动恢复、retry 或追加探测：

| 顺序 | 请求 | 判据 |
| --- | --- | --- |
| 1 | 默认关闭 health | 503 / unknown / trial-closed |
| 2 | 窗口内 health-before | healthy、无 alerts、有效 ingestUsed/budget |
| 3–4 | 两页 native legacy 报告经 relay 转发 | 每份 200 / commit / stored=1 |
| 5 | 窗口内 health-after | healthy；账本相对 before 恰 +4 |
| 6–7 | 到期 report 与 health | 503 / unknown / trial-closed |

窗口 start 必须在启动后两分钟内，end 在启动后五分钟内，窗口本身最长五分钟，半开区间 `[start,end)`。跨 UTC 日运行会使账本增量判据失效并停止，不安排跨日窗口。响应最多 16 KiB、请求 10 秒 deadline、禁止跟随 redirect；本地浏览器导航/报告等待有界。异常、重复报告、HTTP 状态不符、quota/账本漂移、缺失/损坏预算、锁或旧证据冲突即停。成功只释放自己的共享锁；失败/崩溃保留锁与 marker，需人工核对剩余在飞请求及预算，不能自动删锁重跑。

## 未来执行前的具体准备（当前未批准）

1. 对本候选完成必要检查与独立 review；另行批准本分支 push/独立 PR/合并（若选择纳入 main），以及最多两次现有 Worker 更新和最多八次请求的范围/成本。
2. 用 reviewed 指纹生成新计划；审阅两组参数与固定 resource/account/binding，核实 Free、共享额度、日志/Traces/Issues 与导出关闭。若平台有费用或升级提示停止。
3. 获批准后仅执行第一组 closed 更新；人工从 control plane 读回 100% 版本、来源/指纹、四个非敏感变量和日志等设置，写全新 `test-results/csp-platform-closed-readback.json`。不得把本地 bundle 指纹冒充远端已绑定证据。
4. 保存新的 `test-results/csp-platform-authorization.json`，包含明确批准记录与以下结构；`approved:true` 只能在对应 owner 批准后填写，文件本身不能授予权限。不能提交授权文件/凭证。

```json
{
  "approved": false,
  "target": "https://gfrr-csp-report-receiver.gfrrriskradar2026.workers.dev",
  "sourceFingerprint": "<reviewed Worker bytes SHA-256>",
  "harnessFingerprint": "<reviewed harness bytes SHA-256>",
  "maxRequests": 8,
  "cumulativeBefore": 34,
  "limit": 500,
  "delivery": "local-native-relay",
  "startAt": "<YYYY-MM-DDTHH:mm:ss.sssZ>",
  "endAt": "<YYYY-MM-DDTHH:mm:ss.sssZ>"
}
```

5. 获批准后才运行下面的 opt-in 入口。它先发送 closed-health，随后最多等待 90 秒，**不自己执行第二次部署**。操作者核实 closed-health 成功后，执行已批准的 open 参数；独立读回后才创建 `test-results/csp-platform-open-readback.json`，继续合成测试。不得提前制造 open 回执或在测试失败后开窗。

```powershell
node tests/csp/controlled-platform.mjs --live --authorization test-results/csp-platform-authorization.json
```

readback 结构：`reviewed:true`、固定 target、sourceFingerprint、version UUID、percent=100、plan=Free、logs/traces/issues=false、exportDestinations=[]，以及 vars 的上述三个 trial 变量和精确 loopback CORS。回执是人工审阅平台记录的摘要，不是脚本独立认证平台状态；应另保存非敏感控制台/部署证据。open 与 closed 必须为不同的已观察版本。

真实运行固定使用新的 `csp-platform-controlled-once.json` marker 和 `csp-platform-controlled-live/` 输出目录。存在旧路径即停止，不删除或复用它们。部署/回执窗口未能按时完成即停，不自动延长或补第三次更新。到期 admission 关闭，但已经启动的 RPC 和旧 alarm 不取消，也不能阻止公众直接访问消耗 Worker 请求额度。

## 判据不能混用

`controlled-sequence-pass` 只确认上面七次序列。health 的 healthy/expectedWatermark 不提供实际 raw watermark 或 alarmAt；不能冒充原始清理与排程证据。到期 health 被拒绝，也不能声称已再次读到“账本不增加”。需另行审阅 DO 原始 watermark、下次 alarm、删除/保留记录及各平台计量维度；本脚本明确输出 `nativeDirectVerified:false`、`rawCleanupWatermarkVerified:false`、`deletionVerified:false`。

本轮手动回归命令：

```powershell
node --test tests/csp/controlled-platform.test.mjs
```

8/8 pass、0 skip，含真实 localhost Chromium + fake 平台 transport；没有真实平台请求。证据目录 `test-results/csp-platform-preparation-20261006/` 保留起始日名称，2026-10-07 继续交付；最终完整检查以该目录日志/回执为准。无新增依赖、CI 接线、checkers 或 ignore list，不修改旧断言、真实账本、markers 或证据。

本候选不解除真实 URL/query 传输、公开流量/共享额度、生产 C 启用或回滚审批门槛。
