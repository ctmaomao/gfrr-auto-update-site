# ADR-0003 — Secondary diagnostics do not affect scoring

**Status**: Accepted (v28.0D-2-lite → v28.0E consolidation)

## Context

v28.0D-1 曾尝试在 Worker generated preview payload 内加入核心指标第二数据源
诊断 (secondary sources)。部署后 Worker generated preview freshness 受
secondary fetch 拖累,线上 Worker 手动 rollback 到稳定版本
`679fb678-fe1d-4ff3-b9b9-53829d4d31f7`。

教训:secondary 源比主源不稳定 (Cboe VIX、Yahoo `^TNX` 等),让它们与主
preview 共享同步路径会污染主链路。

## Decision

把所有 secondary diagnostics 隔离到独立 KV key 与 endpoint:

1. **主 worker preview** (`/market.worker-preview.json` ← `market:worker-generated-preview`)
   不包含 `secondarySources` / `secondaryDiagnostics`,不执行 secondary 外部请求
2. **独立 secondary preview** (`/market.secondary-preview.json` ← `market:secondary-preview`)
   只承载 secondary diagnostic 数据
3. 主 KV 写入成功后,scheduled 才**低频** (30 分钟) 尝试更新 secondary;若该 key
   30 分钟内已更新则跳过
4. Secondary 失败只写 unavailable payload 或被捕获,**不得**影响主 worker preview
5. **当前 core secondary set**: VIX (Cboe) / Gold (Yahoo `GC=F`) / DXY (Yahoo `DX-Y.NYB`) /
   US10Y (Yahoo `^TNX`) / SPX (Yahoo `^GSPC`)
6. 这些 secondary **不影响** `values.*`、scoring、decision、healthScore、criticalMissing、
   sourceMode、unavailable、Brent promotion、sourceProbe

## Consequences

- ✅ 主 preview freshness 不被 secondary 拖累
- ✅ 增加新 secondary source 时风险隔离 (写新 KV key 即可)
- ✅ Scoring 永远只看经过严格 validation 的主 values
- ❌ 用户看到的 "实时第二数据" 滞后于主值 ~30 分钟 (可接受,标注为 diagnostic)
- ❌ 任何升级 secondary 为 scoring 输入的尝试都需要先另开 ADR

⚠️ **NEVER** 让 VIX/Gold/DXY/US10Y/SPX secondary 覆盖或参与任何 `values.*` 主值
(违反会让未经 validation 的源进入决策)。

⚠️ HY OAS、real10y、credit spread proxy、liquidity proxy 等新 macro stress
indicator 都必须先作为 isolated secondary diagnostic 观察,不得直接进主链路。
