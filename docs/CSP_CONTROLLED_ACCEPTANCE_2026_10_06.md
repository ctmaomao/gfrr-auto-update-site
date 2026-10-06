# CSP 受控验收：默认关闭的接收端候选

状态：本地实现及验收候选，尚未推送、PR、合并或部署；生产 C 未启用。

## Acceptance baseline

2026-10-06 owner 要求继续解决隐私、公开流量、费用与启用验收，并批准“按你建议执行”。本次执行建议中的保守路线：先做本地保护与受控合成验收，生产报告保持关闭，优先保护 realtime 的共享额度。不是接受真实访客 URL/query 外传，也不是公开试运行授权。PR #432 的 push/merge/独立 AI review 替代批准仅限该 PR，不自动延伸到本候选。

基于 latest main `9c2d15d4`，独立分支 `codex/csp-controlled-acceptance`；保留旧分支、平台资源、预算、marker、工具与证据。仅接收端 HTTP admission、本地手动测试和本说明/交接。无新增依赖、CI 或 checker；不改生产 CSP 配置、数据、realtime/KV、SQL schema、预算断言、清理或 alarm 行为。

## 已核实的事实与剩余边界

| 项目 | 2026-10-06 核实 | 尚不能据此声称 |
| --- | --- | --- |
| 出站隐私 | [CSP URL stripping](https://www.w3.org/TR/CSP/#strip-url-for-use-in-reports) 不移除 query；本地虚构敏感字段不进入聚合计划 | 原生浏览器报告已出站脱敏，或 owner 接受真实 URL 传输 |
| 平台日志 | Cloudflare 接收端生产设置 Logs/Traces/Issues 关闭；无遥测导出目的地；CORS 仍仅 loopback | Cloudflare 不处理/不保留任何连接元数据，或没有其它平台内部处理 |
| Cloudflare 费用 | 控制台 Workers 当前 Free；今日请求快照 76/100000；DO 当日请求 1、duration 0.014 GB-s、读 4 行/写 5 行、SQL 24.58 kB | 实时剩余额度已预留、全账号账单为零，或公众流量不会影响 realtime |
| 清理 | DO 过去 24 小时 4 RPC/1 alarm、执行错误 0 | 过期记录已实际删除、清理 watermark/下次 alarm 已确认，或严格 14 天删除保证 |
| EdgeOne | 登录后控制台显示 Makers Free，30 日 Build times 228/500；生产 `gfrr-edgeone-release` 构建 `dpqhva02894o` Success，绑定 `89a45fbcff1b6096d06aea8a9781c57a2cea511c` | 400 releases/32 天等于平台构建额度，或该平台记录是本候选部署 |

控制台读数是时间点观察，范围不同（今日/过去 24 小时/30 日）不混加。控制台另显示 `gfrr-auto-update-site` 与 staging 项目，故不再把历史“源码仓库未连接 EdgeOne”当作全账号现状；本候选不改这些项目/接线，`radar.gfrfinradar.uk` 仍核对其 release 项目。

[Workers Free 限额](https://developers.cloudflare.com/workers/platform/limits/#daily-requests) 和 [DO Free 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/) 的超额路径是失败；不得升级或新增付费功能。Free 限额为账号共享，任何拒绝路径也可能消耗 Worker 请求。应用每日 INGEST_WRITE_BUDGET=2500 仍只覆盖原有 observation+ledger 计数，不覆盖所有 RPC、读取、alarm、schema/meta、删除等平台计量。

## 本地保护

运行时入口统一委托 `handleReceiverRequest()`，在正文/headers/DO binding 之前判定窗口。`/csp-report`（含 OPTIONS）与 `/health` 都受控；不支持的路径仍 404，开放窗口内 health 仅 GET。关闭返回 503、`status:unknown`、`trial-closed` 和 no-store，不冒充健康，不回显 URL、正文、配置或 IP。

需要同时具备三个明确变量才能开放：

```text
CSP_TRIAL_ENABLED=true
CSP_TRIAL_START_AT=<精确 UTC，YYYY-MM-DDTHH:mm:ss.sssZ>
CSP_TRIAL_END_AT=<精确 UTC，YYYY-MM-DDTHH:mm:ss.sssZ>
```

时间必须有效且 canonical，start <= now < end，end > start，跨度最长 30 分钟。不接受布尔/大小写/空白变体、缺省变量、不存在的日历日期、偏移时区或超长窗口。仓库 Wrangler 默认 false/空时间；不是一个滚动延长的 30 分钟计时器。

慢上传在读体之后与启动 RPC 之前再次判定，禁止过期后开始新 RPC。已启动的 RPC 不自动取消，已有 alarm/清理继续运行；不能声称到点后平台绝无任何操作。本候选不改 SQL/DO 内部契约，直接测试 leaf handler 的既有用例仍覆盖其原预算/事务行为；HTTP 真实入口的保护另外有回归锚定。

此门不是身份认证、反攻击或账号请求硬上限。CORS 不是入站认证；来源和正文可被伪造。Cloudflare [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#accuracy) 又是各 location 的 permissive/eventual-consistent 计数，不能冒充准确的全账号费用闸门，本轮不新增它。生产 report-uri 始终不启用；若未来要求绝不影响共享额度，当前账号公开采集方案仍不满足。

## 本地受控浏览器验收

手动入口，不自动加入 CI：

```powershell
node --test tests/csp/receiver-trial-window.test.mjs tests/csp/receiver-entry.test.mjs tests/csp/receiver-cors.test.mjs tests/csp/receiver-object.test.mjs tests/csp/receiver-schema.test.mjs
node tests/csp/receiver-trial-browser.mjs --out-dir test-results/<全新目录>
```

浏览器入口只绑定 127.0.0.1 随机端口，fixture 为本地合成 HTML（不复制真实访客页面或查询参数），report-uri 仅指向同一 localhost。临时独立 Chromium + 真正内存 SQLite，RPC 本地模拟；不接触平台或持久数据库。输出目录必须是 test-results 内全新目录，证据文件 create-only，不清理旧文件。接收请求计数上限 8，浏览器导航和报告等待有界；不是线上公众请求上限。

本轮结果：相关回归 81/81 pass，0 skip；两页各一份 native legacy 报告，2 aggregate rows，INGEST ledger=4；关闭/过期拒绝，无新增写入。日志/回执在 `test-results/csp-controlled-acceptance-20261006/`，最终完整检查以该目录日志及交付回执为准。本地成功不证明真实 Cloudflare RPC/配额/报警执行或生产浏览器投递。

## 未来平台验收提案（尚未获执行批准）

独立 PR/review、本地必要检查和明确动作批准后，最多两次更新**现有**隔离 `gfrr-csp-report-receiver`：先部署本候选默认关闭态，再设置一次固定、最长 5 分钟的合成测试窗口；保留 loopback CORS，不接生产来源、不新增资源或付费功能。到期自动关闭 HTTP admission，配置仍为已过期窗口；不要无限续期。下一轮测试需新的具体批准，不复用旧 B 阶段 marker/脚本。

客户端接收端请求上限 8：关闭态 health 一次；窗口内 health 前/后各一次；本地合成 fixture native legacy 两次；到期后报告/health 各一次；保留一次故障或关闭读回余量，不用于自动 retry。实际原生发送/浏览器后台行为的不确定性需新脚本预占与失败锁存，不能把用户驱动上限当作无限公众流量的批准。累计预算从 34/500 续用，按尝试前预占最多 8，最多到 42/500；deploy/control-plane API 与报表请求计量不同，不伪称均在 8 次内。确认异常、429/5xx（预期关闭态 503 除外）、超限、并发无法归因、费用或升级提示即停，保留证据、不重试/扩预算。

验收逐项分开：固定 reviewed source SHA → 当前 Worker 版本与变量绑定；关闭态零 DO RPC；窗口内原生投递 HTTP 状态、可归因账本增量；不得以 ORB 不可读正文声称 commit/stored 逐份通过；清理 watermark 与下次 alarm 需分别核对；到期新请求拒绝且账本不增加；平台 Worker/DO 各维度用量另核对。既有 alarm 调用记录只补平台触发证据，不替代 watermark/排程/删除验收。

停止新的本地请求不会止住直接公网请求。到期 admission 可以保护新增 DO 调用，但不能保护所有 Worker 请求额度。如平台攻击/未知流量需账号级止流，须先独立审阅并批准具体措施与恢复路径；本轮不删除或禁用资源，不承诺撤头即时止流。

## C 生产启用仍锁定

即使平台合成验收通过，C 仍需单独的真实 URL 传输决定、共享额度风险选择、公开入口保护、独立 review、生产配置/发布和回滚批准。要求 URL/query 不外传时，原生 report-uri 路线保持关闭，不能擅自改走客户端自定义遥测。保持原 Report-Only 策略；本候选不应用旧启用 patch，也不重跑旧一次性平台测试。
