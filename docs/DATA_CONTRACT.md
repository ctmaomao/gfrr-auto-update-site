# Global Financial Risk Radar 数据契约说明

本文档定义 Global Financial Risk Radar 当前数据链路中的 canonical 字段、fallback 字段与验证/调试字段。后续升级应优先遵守这些契约，避免显示值、验证层、历史兼容字段被误用或误删。

## 总体数据链路

当前数据链路为：

```text
Build Realtime Market
→ realtime-data 分支
→ realtime/market.json

Build Daily Radar Data
→ 读取 realtime-data 的 realtime/market.json
→ 生成 data/radar-data.json
→ main 分支

前端
→ 读取 data/radar-data.json
→ 优先读取远端 realtime-data/realtime/market.json
→ buildRuntimeState
→ effectiveDisplayInputs
→ 页面渲染
```

Daily 构建必须先消费最新可用的 `realtime-data` payload，再生成 `data/radar-data.json`。前端运行时则以 `data/radar-data.json` 为基础，并在安全闸门通过后叠加远端 realtime payload。

## Canonical 当前显示值

当前值型显示应统一来自：

```text
data.__effectiveDisplayInputs
```

其来源优先级为：

```text
闸门判定可用时的 realtime.values → displayInputsBaseline → null
```

共享信任闸门 **`canUseRealtimePayloadValues`**（`scripts/modules/freshness.js`）统一约束：前端 **runtime overlay**、**`__effectiveDisplayInputs` 合成**、以及 **Daily pipeline 基于 realtime 的 baseline 重算** 仅在该函数返回 `true` 时允许消费 `realtime.values`。以下任一情况（及同类不可信状态）必须回退到 `displayInputsBaseline` / 基线模式，而不得用该 payload 驱动 overlay 或 Daily 主路径重算：

```text
缺少或无效的 values
cache-only（cacheOnly 或 sourceMode）
unavailable
healthScore <= 0
criticalMissing >= 4
degradedMode 且 sourceMode 不是 live-with-fallback（live-with-fallback 仍可作为可接受的降级实时模式）
```

`shouldApplyRealtimeOverlay` 与上述闸门对齐，并仍受元数据层 `realtimeUnavailable` 约束。`brentValidation.consensus.recommendedValue` 仅为验证层推荐值，不是主 Brent，也不得替代上述闸门。

页面文案、面板、触发器中凡是表达“当前值”的内容，都应基于 `effectiveDisplayInputs` 重建。

### effectiveDisplayInputs 运行时合成说明

`data/radar-data.json` 不序列化根级 `effectiveDisplayInputs`，也不要求存在根级 `values` 对象。

Daily pipeline 负责写入稳定基线字段，例如：

- `dailyRealtimeInput`
- `displayInputsBaseline`

浏览器前端在运行时读取 `data/radar-data.json` 后，再按 runtime source priority 选择 realtime overlay。v28.0C-3 起，runtime policy 由前端配置 `scripts/modules/config.js` 的 `realtimeSourcePolicy.workerFirstEnabled` 控制。

当 `workerFirstEnabled === true` 时，运行时优先级为：

```text
Worker generated preview
→ GitHub realtime-data
→ local fallback
```

当 `workerFirstEnabled === false` 时，Worker 不得成为 selected realtime payload，运行时优先级为：

```text
GitHub realtime-data
→ local fallback
```

Worker payload 必须在 `workerFirstEnabled === true` 且通过 strict gate 后，才能成为 selected realtime overlay：HTTP 200、`workerGeneratedPreview.enabled === true`、`unavailable !== true`、`sourceMode === "worker-generated-preview"`、`healthScore >= 85`、`criticalMissing <= 1`、`updatedAt` 不超过 10 分钟，且 `values.brent / dxy / vix / hyOas / us10y / real10y` 均为 finite number。未通过 gate 的 Worker candidate，以及 `workerFirstEnabled === false` 时的 Worker candidate，不得进入 `effectiveDisplayInputs`。

前端根据 `displayInputsBaseline` 与选中的 realtime payload 合成最终显示输入，并挂载为：

`data.__effectiveDisplayInputs`

因此，页面显示层应以运行时的 `data.__effectiveDisplayInputs` 作为有效显示输入，而不是要求 `radar-data.json` 预先序列化 `effectiveDisplayInputs`。

`realtimeSourcePolicy` 是前端运行时配置与 metadata，不序列化进 `data/radar-data.json`。`data.__effectiveDisplayInputs` 只能由 selected realtime payload 与 `displayInputsBaseline` 合成；未被 selected 的 Worker candidate 不得进入 `data.__effectiveDisplayInputs`。

### Worker generated runtime 状态

浏览器前端会读取 Cloudflare Worker generated preview endpoint，并把 Worker 状态挂载为：

`data.__workerGeneratedCandidate`

该字段只存在于浏览器运行时：

- 不序列化进 `data/radar-data.json`。
- 只有 `realtimeSourcePolicy.workerFirstEnabled === true`、通过 strict gate 并成为 selected realtime source 时，Worker payload 才能参与 realtime overlay 与 `data.__effectiveDisplayInputs`。
- `workerFirstEnabled === false`、未通过 gate 或未被 selected 的 Worker candidate 不参与 `data.__effectiveDisplayInputs`，不改变 canonical display values。
- 不参与 scoring 或 decision 公式。
- selected source 与 rollback 配置记录在 runtime metadata 的 `realtimeSource` / `realtimeSourcePriority` / `realtimeSourcePolicy` 中，均不序列化进 `radar-data.json`。

### Worker secondary source diagnostics isolation

v28.0D-2-lite 起，核心指标第二源诊断不得进入主 Worker preview payload。主 realtime endpoint：

```text
/market.worker-preview.json
```

必须保持只承载 Worker generated preview 主链路，不得包含 `secondarySources` / `secondaryDiagnostics`，也不得执行第二源外部请求。

第二源诊断只能通过独立 endpoint 暴露：

```text
/market.secondary-preview.json
```

该 endpoint 只读独立 KV key：

```text
market:secondary-preview
```

该结构只存在于 Worker secondary preview runtime payload：

- 不序列化进 `data/radar-data.json`。
- 不影响 `data.__effectiveDisplayInputs`。
- 不影响 selected source gate 或 Worker-first / GitHub / local fallback 优先级。
- 不影响 `healthScore` / `criticalMissing`，除非未来版本明确把某个来源升级为 validation。
- 不覆盖 `values.dxy` / `values.vix` / `values.hyOas` / `values.gold` / `values.us10y` / `values.brent`。
- 所有 candidate 必须声明 `participatesInPrimary: false` 与 `participatesInValidation: false`。
- DXY 与 HY OAS 的备用来源属于 proxy / experimental diagnostic，不得直接视为 canonical 等价源。
- 独立 secondary preview 不存在时，`/market.secondary-preview.json` 返回小型 unavailable payload；这不代表主 `/market.worker-preview.json` 异常。

## displayInputsBaseline 契约

`data/radar-data.json` 根层必须包含：

```json
"displayInputsBaseline": {
  "brent": "number|null",
  "dxy": "number|null",
  "vix": "number|null",
  "hyOas": "number|null",
  "us10y": "number|null",
  "real10y": "number|null",
  "breakeven10y": "number|null",
  "gold": "number|null",
  "spx": "number|null"
}
```

`displayInputsBaseline` 是 baseline fallback 的结构化当前值来源，不是中文文案，也不是从旧文案反解析出来的结果。不允许通过解析旧中文文案恢复这些值。Daily 构建必须先读取最新 `realtime-data`，再基于该 realtime payload 生成 `displayInputsBaseline`。

## dailyRealtimeInput 契约

`data/radar-data.json` 根层应包含：

```json
"dailyRealtimeInput": {
  "branch": "realtime-data",
  "commitSha": "string|null",
  "updatedAt": "ISO string",
  "sourceMode": "live|degraded|cache-only|fallback",
  "healthScore": "number|null",
  "capturedAt": "ISO string"
}
```

`dailyRealtimeInput` 用于记录 Daily 构建实际消费了哪一次 realtime payload，便于排查 Daily 与 Realtime 的先后顺序问题。它不参与评分，不参与决策，也不参与页面主显示。本地运行时如果没有 GitHub Actions 注入的 commit SHA，`commitSha` 可以为 `null`。

## GitHub Actions Summary 运行审计入口

GitHub Actions Summary 是 Daily / Realtime 运行时审计入口，用于人工排查输入、baseline 与决策输出是否一致。Summary 不参与计算，不改变 JSON，也不是页面数据源。

`Build Realtime Market` Summary 用于查看：

- `updatedAt`
- `sourceMode`
- `healthScore`
- `values.brent`
- `brentValidation.consensus.recommendedValue`
- `brentValidation.consensus.confidence`
- `brentValidation.consensus.canPromoteToPrimary`

其中 `values.brent` 是当前 Brent 主显示值来源之一；`brentValidation.consensus.recommendedValue` 只是验证层推荐值，不等于主值。`canPromoteToPrimary=false` 时不得切主值。

`Build Daily Radar Data` Summary 用于查看：

- `dailyRealtimeInput.commitSha`
- `dailyRealtimeInput.updatedAt`
- `dailyRealtimeInput.sourceMode`
- `dailyRealtimeInput.healthScore`
- `displayInputsBaseline.brent`
- `displayInputsBaseline.dxy`
- `displayInputsBaseline.vix`
- `displayInputsBaseline.hyOas`
- `displayInputsBaseline.spx`
- `Decision Summary`

其中 `dailyRealtimeInput` 用于判断 Daily 实际消费了哪一次 realtime payload；`displayInputsBaseline` 是 Daily 生成的 baseline fallback 当前值；`Decision Summary` 用于快速查看策略状态、执行锁、仓位建议、动作数量和阈值数量。

如果页面值、`realtime-data` 分支和 `main` 分支数据暂时不一致，优先检查：

1. Realtime Summary 的 `updatedAt` / `sourceMode` / `healthScore`
2. Daily Summary 的 `dailyRealtimeInput.commitSha` / `dailyRealtimeInput.updatedAt`
3. Daily Summary 的 `displayInputsBaseline`
4. Decision Summary 的 strategy / execution lock

如果 Realtime 在 Daily 之后又运行一次，`origin/realtime-data` 可能比 `origin/main:data/radar-data.json` 更新，这是正常的；应通过 `dailyRealtimeInput.commitSha` 判断 Daily 当时消费的是哪一次 realtime payload。

## Runtime Debug / Realtime Fetch Audit 契约

`realtimeFetchAudit` 是前端运行时调试字段，用于判断页面当前 realtime payload 的来源。它用于排查页面是否读取了远端 `realtime-data`、是否使用本地 fallback、是否完全没有可用 realtime，以及页面 stale / aging / unavailable 是由 workflow 未更新还是前端 fetch / fallback 问题导致。

浏览器调试路径为：

```js
window.__GFRR_RUNTIME__?.realtimeFetchAudit
window.__GFRR_RUNTIME__?.runtimeMetadata?.realtimeFetchAudit
```

常见字段包括：

- `attemptedAt`
- `remoteUrl`
- `cacheBusted`
- `selectedSource`
- `remoteUpdatedAt`
- `remoteSourceMode`
- `remoteHealthScore`
- `fallbackReason`

`selectedSource` 含义：

- `remote`：页面成功读取远端 `realtime-data` payload
- `local-fallback`：远端读取失败后使用本地 fallback payload
- `none`：远端和本地 fallback 都不可用，页面只能走 baseline / degraded

排查规则：

- 如果 `selectedSource=remote`、`cacheBusted=true`，但 `remoteUpdatedAt` 很旧，说明前端已经绕过缓存并成功读取远端，优先检查 `Build Realtime Market` workflow。
- 如果 `selectedSource=local-fallback`，说明远端读取失败或不可用，页面使用本地 fallback，需检查远端 raw URL、网络和 fallback 闸门。
- 如果 `selectedSource=none`，说明远端和本地 fallback 都不可用，页面只能使用 baseline，需检查 realtime payload 生成和前端读取路径。

`realtimeFetchAudit` 只用于调试，不参与评分，不参与决策，不改变页面主值，不改变 `values.brent`，不改变 `effectiveDisplayInputs`，不改变 fallback 安全闸门，也不是页面数据源。

## Realtime Freshness / 实时数据新鲜度契约

前端运行时会基于 realtime payload 的时间戳计算：

- `runtimeMetadata.realtimeAgeMinutes`
- `runtimeMetadata.realtimeFreshnessLevel`
- `runtimeMetadata.realtimeUnavailable`
- `runtimeMetadata.realtimeOverlayEnabled`

当前 freshness 分档为：

```text
0–30 分钟：fresh / 新鲜
31–90 分钟：aging / 老化
91–360 分钟：stale / 已过期
>360 分钟或 realtime 不可用：unavailable / 不可用
```

状态含义：

- `fresh / 新鲜`：近期成功读取 realtime，可正常用于 overlay。
- `aging / 老化`：realtime 仍可参考，但页面应提示用户谨慎。
- `stale / 已过期`：realtime 超出安全时效，页面应明确标识数据已过期。
- `unavailable / 不可用`：远端和可用 fallback 均不可用，页面应回退到 baseline / degraded 状态。

freshness 状态用于数据健康状态和显示安全判断。页面当前值仍必须遵守 `effectiveDisplayInputs` 契约：优先使用可用 realtime values，其次使用 `displayInputsBaseline`，最后为 `null`。当 realtime payload 处于 `cache-only`、`healthScore <= 0`、`criticalMissing >= 4` 等不安全状态时，不应覆盖 baseline。

渲染层不得绕过 `effectiveDisplayInputs` 直接使用 raw realtime values 展示当前值。UI 文案可以解释 freshness 状态，但不能反向修改数据契约、fallback 闸门或当前值选择规则。

freshness 与 `realtimeFetchAudit` 的职责不同：

- freshness 说明“当前 payload 有多旧”。
- `realtimeFetchAudit` 说明“页面这次到底读到了哪里”。
- 如果 `selectedSource=remote` 且 `cacheBusted=true`，但 `remoteUpdatedAt` 很旧，优先检查 `Build Realtime Market` workflow。
- 如果 `selectedSource=local-fallback` 或 `selectedSource=none`，优先检查远端 raw URL、网络读取和 fallback 闸门。

freshness 不直接改变评分权重，不直接改变 Brent 主值，不直接改变决策状态机。评分、Brent 主值和决策输出仍以各自的数据契约和 pipeline / decision 层产物为准。

## Decision Output / 决策输出契约

`decisionModel` 是决策层的结构化输出，用于承载策略状态、仓位建议、动作队列和一句话决策结论等信息。常见字段包括 `strategyState`、`riskMode`、`positionGuidance`、`actionQueue`、`decisionStatement`。具体字段以当前 `radar-data.json` 真实产物为准，不得凭空新增字段要求。

`tradingSystem` 是执行层与规则层输出，用于承载执行锁、信号引擎、动作层和风控规则。核心子结构包括 `executionLock`、`signalEngine`、`actionLayer`、`riskControl`。

`executionLock` 是当前是否允许新增风险、是否进入防守或减仓状态的核心执行门控。页面执行灯应以它或其派生结果为主要依据；不应在渲染层重新推导执行灯。文案可以重建，但执行含义不能在前端随意覆盖。

`positionGuidance` 是仓位建议结构，用于承载目标仓位区间、现金缓冲、风险预算等信息。当前常见字段包括 `totalExposureBand`、`targetGrossExposure`、`cashBufferTarget`、`riskBudget`。

`actionLayer` 是今日执行、检查点和控制动作的结构化来源。`checkpoints` 用于“今日执行检查点”；`controlActions` 或等价字段用于控制动作。此类动作不应散落写死到页面。

`riskControl` 是硬触发和重置条件的结构化来源，常见字段包括 `hardThresholds` 和 `resetThresholds`。这些规则阈值属于规则型文案，不应被当前值重建逻辑误替换；ON RRP 中文显示单位仍应遵守“亿美元”契约。

`decisionLine` 可作为当前页面的一句话决策输出或 fallback。`decisionStatement` 如存在，应包含 `headline`、`posture`、`actionBias`、`condition` 等结构化字段。Daily Summary 可从这些字段或 fallback 字段读取摘要；这些字段是解释输出，不应反向影响评分或状态机。

决策输出是 pipeline / decision 层产物，不应由 render 层重新推导。渲染层可以格式化和展示，但不能改变策略状态、执行锁或仓位建议。`validate-data.mjs` 已对关键决策结构做保守校验；Daily workflow 的 `Decision Summary` 只是审计展示，不参与计算。后续拆 `decision.js` 时，必须保持上述结构兼容。

## Brent 主值与验证层契约

页面主 Brent 当前仍来自：

```text
values.brent
```

而不是：

```text
brentValidation.consensus.recommendedValue
```

`brentValidation` 只是验证层 / 观察层。`fred-anchor` 只作低频锚点，不参与主值推荐。`recommendedValue` 不等于主值；只有 `canPromoteToPrimary === true` 才代表“理论上可考虑切主值”。当前即使 `confidence = medium`，也不得自动切主值。

当 weak-confirmation 参与时，`canPromoteToPrimary` 必须为 `false`。当 `confidence = none` 时，`recommendedValue` 和 `recommendedSource` 必须为 `null`。

## DXY / 广义美元指数契约

内部字段名仍然是 `dxy`，不要把内部字段改名。DOM id 仍然可以是 `rt-dxy`，数据字段仍然是：

```text
values.dxy
displayInputsBaseline.dxy
```

用户可见文案应显示为：

```text
广义美元指数
```

## ON RRP 单位契约

内部 ON RRP 单位仍是：

```text
billion USD
```

中文用户可见显示统一换算为：

```text
亿美元
```

换算规则：

```text
亿美元 = billion USD × 10
```

示例：

```text
0.082 billion USD → 0.82 亿美元
100 billion USD → 1000 亿美元
300 billion USD → 3000 亿美元
```

不要为了显示单位修改内部阈值数值。

## 当前值型文案重建规则

当前值型文案必须基于结构化字段重建，不允许字符串替换。

允许：

```text
基于 effectiveDisplayInputs.brent 生成“布伦特 103.4”
```

禁止：

```text
把旧文案里的 123.3 replace 成 103.4
```

阈值 / 规则型文案应保留，例如：

```text
布伦特 > 110
高收益利差 > 4.5%
波动率 < 18
```

不要把这些规则型阈值误当成当前值替换。

## Realtime fallback 契约

前端应优先使用远端 `realtime-data` payload。本地 `./realtime/market.json` 只作为 fallback，并且必须通过安全闸门：

- 结构完整。
- 时间可解析。
- 不超过 180 分钟。
- 关键字段足够。
- 包含 `fieldFreshness`。
- 包含 `brentValidation`。

不合格的本地 realtime payload 不得 overlay 页面。

## Transmission Delta / 传导网络 Δ 契约

`transmissionChain.nodes[*].delta` 是机构级宏观传导网络节点相对上一期同名节点 `score` 的变化值：

```text
delta = current.score - previous.score
```

示例：

```json
{
  "label": "油价压力",
  "score": 81,
  "delta": -2
}
```

页面显示为：

```text
Δ -2
```

如果找不到上一期同名节点，或当前分数 / 上一期分数不可比较，`delta` 必须为 `null`。`delta = null` 是合法状态，页面应显示：

```text
趋势待累计
```

这表示当前缺少可比较的上一期传导节点数据，不代表系统异常。

Daily pipeline 计算 `delta` 时，上一期传导节点来源优先级为：

1. 当前磁盘上的旧 `data/radar-data.json` 中的 `transmissionChain.nodes`
2. `data/radar-history-full.json` 中最近一条 `transmissionSnapshot.nodes`
3. `data/radar-history.json` 中最近一条 `transmissionSnapshot.nodes`
4. 如果都没有，则当前所有传导节点的 `delta = null`

节点匹配键优先级为：

```text
node.id → node.key → node.label
```

当前真实传导节点结构通常只有 `label`，因此目前主要按同名 `label` 匹配。

`data/radar-data.json` 根层可包含审计字段：

```json
"transmissionDeltaMeta": {
  "source": "previous-radar-data",
  "matchedNodes": 6,
  "totalNodes": 6
}
```

字段含义：

- `source`：本次 delta 使用的上一期来源，例如 `previous-radar-data`、`radar-history-full`、`radar-history` 或 `none`。
- `matchedNodes`：成功匹配上一期节点的数量。
- `totalNodes`：当前传导网络节点总数。

如果没有可用上一期来源，应记录为：

```json
"transmissionDeltaMeta": {
  "source": "none",
  "matchedNodes": 0,
  "totalNodes": 6
}
```

`transmissionDeltaMeta` 只用于调试和审计，不参与评分、不参与决策，也不改变页面当前分数。

Daily history 新记录可保存轻量传导网络快照：

```json
"transmissionSnapshot": {
  "nodes": [
    {
      "key": "战争冲击",
      "label": "战争冲击",
      "score": 82
    }
  ]
}
```

`transmissionSnapshot` 用于下一次 Daily 构建计算节点级 `delta`。它不用于直接渲染页面主值，不参与评分，不参与决策。旧历史记录没有 `transmissionSnapshot` 时必须保持兼容，不能视为数据错误。

边界规则：

- `delta` 是显示层趋势辅助信息，不是风险评分输入。
- `delta` 不改变当前节点 `score`。
- `delta` 不改变 `strategyState`、`executionLock`、`positionGuidance` 或其他决策输出。
- `delta = null` 是合法状态，表示趋势数据仍在累计。
- 页面显示“趋势待累计”表示暂无可比较上一期，不代表 pipeline 或页面异常。

## validate-data.mjs 契约

当前自动校验覆盖：

- `displayInputsBaseline` 9 个字段。
- live realtime 与 baseline 对齐。
- cache-only 时跳过 live 对齐。
- `brentValidation` 安全结构。
- weak-confirmation 不可 promote。
- FRED anchor 不参与推荐。
- stale source 必须有排除原因。
- `dailyRealtimeInput` 新鲜度与健康度。

这些校验用于阻止 Daily workflow 静默提交过旧、不健康或结构不完整的数据。

## Legacy / 兼容字段

以下字段虽然可能看起来重复，但可能仍被页面模块读取：

- `topRisks`
- `phaseSignals`
- `summary`
- `decisionLine`
- `triggerPanel`
- `assetMatrix`
- `scenarioTree`
- `tradingSystem`
- `decisionModel`

删除或重命名前必须先确认所有消费方，包括页面渲染、运行时 overlay、校验脚本和历史数据兼容逻辑。
