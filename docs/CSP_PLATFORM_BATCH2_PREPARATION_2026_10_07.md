# CSP 第二批平台验收入口准备

## 本轮批准与基线

Owner 在关闭态恢复及只读清理核验后要求告知下一步并直接开始。本轮只实施独立第二批入口、UTC 参数保护和本地验证；不部署、不发送接收端请求、不解除失败锁、不删除或覆盖旧授权/marker/证据、不接受费用或启用生产 C。分支 `codex/csp-platform-batch2-preparation` 基于 main `f60c2a52`；#435 的远端和发布授权不延伸。

前批预占八次后仅关闭态 health 503 通过。操作者 PowerShell `ConvertFrom-Json` 把 UTC 字符串转成 DateTime，开窗部署参数丢失规范格式；远端读回拒绝、脚本停止、没有报告发送。另获批准的一次关闭恢复已读回版本 `da71cbf7-ef47-4314-a4ac-871df49e7841` 占 100%，trial=false/空时间，CORS 仅 `http://127.0.0.1:8765`。真实累计预算为 42/500，不退额。

只读 Data Studio SELECT 已核对 singleton：`last_cleaned_bucket=2026-10-07`、`cleanup_completed_at=1791331800284`（00:10:00.284 UTC）、started 空、attempts=0、retention=14；obs 七行与 ledger 三行均落在 10-03 至 10-05，无早于 09-24 的行。它确认原始清理字段与当前保留范围，不证明实际删除过过期行或下一次 alarm 时间。[Data Studio](https://developers.cloudflare.com/durable-objects/observability/data-studio/) 查询消耗 DO 平台额度并留控制面审计记录，不属于接收端 HTTP 预算；[getAlarm](https://developers.cloudflare.com/durable-objects/api/alarms/) 仍需独立直接读回，不能用计划时间冒充实际值。

## 新入口与原入口

```powershell
node tests/csp/controlled-platform-batch2.mjs --dry-run
node --test tests/csp/controlled-platform.test.mjs tests/csp/controlled-platform-batch2.test.mjs
```

默认计划无网络、不写预算，`approved:false`。新入口固定 batch/account、42/500 基线、八次预占到 50/500、全新的 batch2 授权/readback/marker/output，仍使用原来的共享预算与共享锁。复用原序列的七次请求、synthetic 白名单、十秒请求 deadline、90 秒人工 open-readback 等待、五分钟窗口、失败同步锁存和不重试/不退额规则。

共享序列只新增显式基线参数，支持已记录的 34、42 两种基线。原 CLI 默认仍要求 34，不接受第二批授权、不自动适配真实账本；旧测试断言不变。第二批 CLI 校验前批 stopped/单一关闭 health/八次预占与保留锁的证据形状，授权必须绑定前批 marker/result SHA-256、新 runner 指纹、共享 harness 指纹及 Worker 源指纹。路径不能由 CLI 改写；未知参数停止。

当前旧锁存在，新入口必须停止且不能创建新预算/marker/output。它没有归档、删除、解锁或自动恢复代码。未来的人工锁处理是单独具体批准步骤，即使记录 PID 已退出、8765 无监听也不自动执行；原失败证据必须可恢复、原预算保持 42。

## UTC 字符串的保护

`deploymentInvocation(authorizationText, phase)` 只通过 `JSON.parse` 解析原始 JSON，再返回固定 account 与参数数组；不执行 Wrangler。开窗的 start/end 必须满足既有 canonical UTC 字节检查。未来已批准的操作者部署使用 Node `spawn`/`spawnSync` 参数数组直接传递 `args`，并固定已有 Wrangler 路径与 `CLOUDFLARE_ACCOUNT_ID`；不得经 PowerShell DateTime 插值或拼接 shell 命令。回归通过真正的本地子进程 argv 回显验证毫秒与 Z 字节保留，并拒绝曾错误部署的本地化格式。任何远端变量与批准 JSON 不逐字相同都拒绝 readback，不补第三次更新或重试。

## 执行门槛

未来入口为 `--live --authorization test-results/csp-platform-batch2-authorization.json`，当前不创建此文件。必要检查和新的独立 review 后，才提供具体平台执行批准：新八次预占 42→50、现有隔离 Worker 至多两次更新、最长五分钟、loopback 合成报告、无费用/升级、异常即停；已关闭版本可先独立读回而无需重复更新。closed/open 回执仍为人工审阅控制面记录，不是远端源码哈希认证。

锁处理、新平台批次、push/新独立 PR/合并须各有对应批准；原授权及恢复批准均已完成其一次性范围。不得复用旧 marker/输出、退回预算、修改生产 CSP、增加 origin/route/domain/资源/依赖。原生直连、next alarm、实际过期删除、公开流量/共享额度与生产 C 的隐私/启用/回滚决定仍分别待验。
