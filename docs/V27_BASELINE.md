# Global Financial Risk Radar v27 稳定化基线

本文档记录当前 v27.x 项目的稳定化基线，供未来 Cursor、Codex 和人工维护者快速判断“什么已经完成、什么不要随意改、下一步适合做什么”。

## 当前基线结论

项目已经进入 v27.x 稳定化阶段。当前重点不是继续大规模重构，而是保持 realtime、daily、frontend、workflow 和文档契约稳定。

后续改动应坚持小步、可验证、可回滚：优先补保护网、补文档、补小范围校验；避免一次性改变数据结构、决策状态机或核心 pipeline。

## 已完成的核心升级

### 数据链路

- Realtime workflow 已改为每小时 6 次错峰调度，降低远端实时数据过期风险。
- `realtime-data` 分支作为远端 realtime payload 来源，Pages 主站不直接依赖本地旧 realtime 产物。
- Daily workflow 先消费 `origin/realtime-data`，再生成 daily baseline 数据。
- `dailyRealtimeInput` 记录 Daily 实际消费的 realtime 输入与 commit 审计信息。
- `displayInputsBaseline` 提供 daily baseline fallback，避免页面直接暴露不稳定实时源。
- `effectiveDisplayInputs` 是前端最终显示契约，渲染层应以它作为展示入口。
- `realtimeFetchAudit` 记录 realtime 读取来源、fallback、cache busting 和失败原因。
- local fallback 安全闸门已建立，避免旧本地 realtime 覆盖更新的远端 payload。
- realtime freshness 已分为 fresh、aging、stale、unavailable 四档，用于解释实时数据新鲜度。
- v27.x baseline 包含只读 Realtime Health Watchdog，用于监控 `realtime-data/realtime/market.json` 的 freshness 状态；它不参与评分、不生成数据、不改变 realtime fallback、不改变 Brent 主值链路。

### Brent 验证层

- `values.brent` 是 Brent 主值。
- `brentValidation.consensus.recommendedValue` 只是验证层推荐值，不自动替代主值。
- `canPromoteToPrimary=false` 时不得切换 Brent 主值。
- 过旧的 `observedAt` 会被过滤，避免陈旧来源参与共识。
- Yahoo 来源已降权，减少单一网页源异常对验证层的影响。
- Oilprice 来源进入 weak-confirmation 角色，不能单独推动主值切换。
- confidence none 时安全置空，避免低置信验证结果被误用。

### 决策系统

- `decisionModel` 已作为决策输出主结构。
- `tradingSystem` 组织交易状态、执行约束和行动层。
- `executionLock` 表达当前是否允许行动及限制原因。
- `signalEngine` 汇总结构信号状态。
- `actionLayer` 承载行动队列与检查点。
- `riskControl` 承载硬阈值、重置阈值和风险约束。
- `positionGuidance` 给出仓位建议和风险预算约束。
- Daily workflow 输出 Daily Decision Summary，便于在 Actions Summary 审计决策结果。
- decision output contract 已进入数据校验，防止关键决策字段被误删。

### 页面与 UX

- 页面已形成三层结构：核心驾驶舱、风险解释层、高级分析与规则审计。
- 高级区默认折叠，降低主视图噪音。
- 快速导航已补充，方便在长页面中定位关键模块。
- 移动端防溢出已处理，减少窄屏横向滚动和内容遮挡。
- favicon 已修复。
- 页面已说明 realtime freshness，帮助用户理解实时数据是否新鲜。
- 页面已说明 transmission delta，帮助用户区分当期分数与趋势变化。

### Transmission Delta

- `transmissionChain.nodes[*].delta` 记录传导网络节点级变化。
- `transmissionDeltaMeta` 记录 delta 来源、匹配数量和总节点数。
- history 中的 `transmissionSnapshot` 为后续 delta 计算提供上一期快照。
- 页面显示 `Δ +n`、`Δ -n`、`Δ 0`。
- 无上一期可比数据时显示“趋势待累计”。
- delta 只用于趋势展示和审计，不参与评分和决策。

### 保护网 / 检查命令

完整本地检查入口：

```bash
npm run check:all
```

当前展开顺序：

```text
check:syntax
check:dom
check:modules
check:copy
check:workflows
check:docs
check:data
```

其中 `check:syntax` 保护脚本语法，`check:dom` 保护关键 DOM 挂载点，`check:modules` 保护模块 import/export，`check:copy` 保护用户可见文案契约，`check:workflows` 保护核心 GitHub Actions workflow 合约，`check:docs` 保护 README / docs 本地 Markdown 链接，`check:data` 保护数据契约。

v27.x workflow baseline 已兼容 Node 24：官方 checkout / setup-node actions 应使用 v6，`setup-node` 应运行 `node-version: 24`。

Pages deploy 也会在部署前分步骤运行这些检查，而不是直接运行 `npm run check:all`。保留分步骤运行，是为了部署失败时能快速定位失败类型。

## 当前必须遵守的维护边界

1. 不要把 `brentValidation.consensus.recommendedValue` 直接改成 Brent 主值。
2. 不要放松 local fallback 安全闸门。
3. 不要绕过 `effectiveDisplayInputs` 直接使用 raw realtime values。
4. 不要在 render 层重新推导 `executionLock` / `positionGuidance`。
5. 不要为了通过 validate 而削弱校验规则。
6. 不要随意提交 JSON 产物作为临时修复。
7. 不要大规模重写 `run-daily-pipeline.mjs`、`run-realtime.mjs`、`decision.js`。
8. 不要改内部字段名：`dxy`、`rt-dxy`、`values.dxy`、`displayInputsBaseline.dxy`。

## 当前仍需观察的点

- GitHub schedule 仍可能延迟或漏跑。
- Realtime 每小时 6 次错峰调度能降低风险，但不能保证绝对实时。
- Brent 网页来源仍可能解析失败。
- Transmission Delta 需要 Daily 连续运行后才更有观察价值。
- 本地 `validate-data` 可能出现 realtime 与 `dailyRealtimeInput` 不匹配 warning；只要最终 `Validation passed (v27.0)`，该 warning 可接受。

## 下一阶段推荐方向

### P1：近期可做

- 继续观察 Realtime schedule 稳定性。
- 观察 Transmission Delta 是否持续正常。
- 继续补小型文档和校验保护。
- 小步改善移动端高级区阅读体验。

### P2：中期可做

- 对 Daily pipeline helper 做小拆分，降低单文件维护压力。
- 对 Realtime Brent source helper 做小拆分，提升来源解析可维护性。
- 为 Decision contract 增加更细的测试或静态校验。
- 增加可视化 Brent validation 审计区，让验证层状态更透明。

### 暂不建议做

- 自动切换 Brent 主值。
- 大幅修改评分权重。
- 大规模重写 decision 状态机。
- 放松 fallback gate。
- 把 workflow 改成复杂多分支联动。
