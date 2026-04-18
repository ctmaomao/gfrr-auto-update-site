# 全球金融风险雷达 v24.1.1
当前版本：v24.1.1 正式运行版

## 项目状态
**全球金融风险雷达**

- 当前稳定版：v24.1.1
- 当前开发版：v25.0.0
- 当前阶段：T1 数据发布解耦

### 阶段状态
- T1 数据发布解耦：进行中
- T2 前端三层数据模型：未开始
- T3 实时抓取器稳态化：未开始
- T4 freshness/stale 机制：未开始
- T5 数据健康状态面板：未开始
- T6 文档与工作流收口：未开始

全中文混合实时交易引擎版宏观风险驾驶舱。

## 本版核心升级
- 快变量构建改成多源冗余：官方 FRED 为主，黄金与部分市场价格支持备用源
- 自动 fallback：单一数据源失败不再阻断整次构建
- 实时权重融合：页面加载后用快变量重新融合风险分数、执行状态灯、目标仓位与今日动作
- executionLock 真正锁死：直接输出“允许/禁止/强制”动作
- 风险 → 仓位自动映射：总仓位、现金缓冲、核心仓位随风险自动变化
- API 失败不影响系统：若个别源失败则回退上次有效值；若多项关键源失败则进入缓存模式但页面不崩

## 当前架构
- 慢变量：`data/radar-data.json`
- 快变量：`realtime/market.json`
- 页面逻辑：先加载慢变量，再覆盖快变量，并实时重算执行层

### T1 发布说明
- 主站继续由 `main` 提供。
- 实时 `market.json` 现在发布到 `realtime-data` 分支。
- 前端优先读取远端 realtime URL，再覆盖静态基线。
- `main` 中的 `./realtime/market.json` 仅作为兼容性 fallback。
- fallback 的作用是避免远端 realtime 暂时不可用时页面直接失效。
- fallback 数据不保证是最新值。
- 后续 v25 的 T2 / T4 将继续处理 freshness / stale 标记问题。

## 目录
- `scripts/run-daily-pipeline.mjs`：慢变量构建（以 realtime 快照为主，不重复外抓）
- `scripts/run-realtime.mjs`：快变量构建（多源冗余）
- `.github/workflows/build-daily-radar-data.yml`
- `.github/workflows/build-realtime-market.yml`

## 部署
1. 覆盖上传到原 GitHub 仓库根目录
2. 运行 `Build Realtime Market`
3. 再运行 `Build Daily Radar Data`
4. 查看网站是否切换到 v24.1
