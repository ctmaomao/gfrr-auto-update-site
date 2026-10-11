# ADR-0066：同一 main 源码的保守 Pages 发布去重

## Status / Context

2026-10-11 owner 批准有界健康整改第三项；本独立 PR 增加发布前的只读判断及回归，不削弱已有 checker。已有两个 Pages 成功运行 `38100990671` / `38101007413` 重复发布同一源码 `9556e770`，其中上游 AI 工作流未实际刷新。这不是网站停机，但重复完整构建增加排队和维护成本。

## Decision

保留所有现行触发入口、main/上游成功保护、单一 pages 并发组和不取消运行。增加只读预检，checkout 当前 main，用最多三个固定 GitHub API GET、每次 6 秒、每响应 64 KiB、零重试核对：最新 github-pages 部署的 main SHA、成功状态及该库已成功完成的 Pages 工作流事件 SHA。只有三者与候选 SHA 一致才复用；其它情况继续正常部署。不获取响应给出的 log URL，不输出 token、响应体或原始错误。

这依赖项目既有 main 不回退和唯一受控 Pages 发布流。排队事件 SHA 与实际 checkout 不同、最新部署失败、字段不全、权限/网络故障均保守地继续发布；不把事件 SHA 冒充实际 checkout 的普遍证明。main 若在预检后前进，新的发布事件仍按原机制排队。未来修改这些前提需独立重新评审，不能沿用本优化。

预检 job 仅 contents/actions/deployments read。判断步骤异常时输出默认继续；只有明确且成功返回复用才可跳过。deploy 显式使用 !cancelled() 状态函数，避免 GitHub 的隐式 success() 在预检 checkout/setup 失败时抑制发布；预检 job 失败或输出不明确时继续，主动取消仍被尊重。`workflow_dispatch.force_deploy` 默认 true，保持已有手动强制重发能力；只有显式 false 才使用去重。进入 deploy 的每次发布仍 checkout latest main、记录真实 SHA、完整 check:all、绑定同一 SHA 构建，并保留原有三次平台重试。EdgeOne 的触发、额度与 no-change 机制不变。

## Acceptance / Consequences

原 Pages source-revision 测试全部断言保留，并正式加入现有 check:workflows；新增阴性用例覆盖各身份不符、失败/进行中状态、未知事件、恶意 URL、超时、HTTP/响应异常和手动强制。新增脚本仅平台元数据 GET，以及 Actions 输出/summary 写入；不写生产数据、不引入依赖、外部源或费用。

本地原型在当前已发布 main 上真实只读返回 reuse，七组离线回归通过；最终代码仍需完整检查、独立审阅和 CI。合并后先验证首次正常发布，再用一次显式 force_deploy=false 的受控调度证明部署 job 被跳过；若期间 main 前进，正常发布是正确结果，不反复调度。回滚仅撤销本去重 PR，保留原完整发布流，不删除运行证据或资源。
