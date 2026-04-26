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
可用 realtime.values → displayInputsBaseline → null
```

当 realtime payload 处于以下任一状态时，不得使用 `realtime.values` 覆盖页面当前显示值，必须回退到 `displayInputsBaseline`：

```text
cache-only
healthScore <= 0
criticalMissing >= 4
```

页面文案、面板、触发器中凡是表达“当前值”的内容，都应基于 `effectiveDisplayInputs` 重建。

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
