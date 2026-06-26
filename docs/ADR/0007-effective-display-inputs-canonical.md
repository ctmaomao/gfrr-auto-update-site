# ADR-0007 — `effectiveDisplayInputs` is the canonical current-value source

**Status**: Accepted (since v27.x → reaffirmed v28.0J)

## Context

前端可以从多个地方读到 "当前显示值":

- Worker preview (`/market.worker-preview.json`) 的 `values.*`
- GitHub realtime-data 分支的 `realtime/market.json`
- Daily pipeline 输出的 `data/radar-data.json` 的 `dailyRealtimeInput`
- Daily pipeline 写入的 `displayInputsBaseline`
- Worker secondary preview (诊断)

如果渲染层各自挑数据源,前后端、不同 section 间会出现数据不一致;决策契约
基于的 "当前值" 与用户看到的不是同一个。

## Decision

**所有当前值型显示统一来自 `data.__effectiveDisplayInputs`**:

来源优先级 (由 `buildRuntimeState` / safety gate 决定):

```
闸门判定可用时的 realtime.values → displayInputsBaseline → null
```

具体:

1. Daily pipeline 写入 `displayInputsBaseline` 作为 baseline fallback
2. 前端 `buildRuntimeState` 合成 `effectiveDisplayInputs`,合并 baseline 与
   经 strict gate 通过的 realtime overlay
3. **渲染层不得绕过它**直接使用 raw realtime values、`values.*`、
   `dailyRealtimeInput.*`
4. 修改字段命名 (`dxy`、`rt-dxy`、`values.dxy`、`displayInputsBaseline.dxy`)
   会破坏合成逻辑,**严格禁止**

## Consequences

- ✅ 所有 section 显示的 "当前 X" 完全一致
- ✅ 决策契约的 "当前输入" 与用户视觉一致
- ✅ Realtime 失败时自动 fallback 到 baseline,前端不需要分支
- ❌ 新增 value 字段需要同步出现在 `displayInputsBaseline` schema
- ❌ 任何 "我就直接读 worker preview" 的 shortcut 都会破坏契约

⚠️ **NEVER** 在 render 层用 raw realtime values 代替 `effectiveDisplayInputs`。
⚠️ **NEVER** 修改 `dxy` / `rt-dxy` / `values.dxy` / `displayInputsBaseline.dxy`
等字段名 (内部契约依赖)。

## 2026-06-26 Clarification: M-94 Path C static frontend

Decision point 2 describes the pre-M-94 frontend overlay path. Under the
current M-94 V0 Path C runtime recorded in
[ADR-0018](0018-m94-path-c-static-frontend-runtime.md), the homepage frontend
does not run `buildRuntimeState` or strict-gate Worker preview in-browser.

For the current homepage, `data.__effectiveDisplayInputs` is consumed from the
static Daily snapshot in `data/radar-data.json`. The frozen
`scripts/modules/realtime.js` path may still contain the older overlay
composition logic, but it is intentionally unconnected to the current frontend.

The canonical display rule still holds: renderers must not bypass
`data.__effectiveDisplayInputs` to read raw realtime values directly.

## References

- `docs/DATA_CONTRACT.md`
- AGENTS.md "严格禁止的高风险行为" §3 第 3 条
