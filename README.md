# 全球金融风险雷达

当前稳定版：`v26.0A-rc1`

全球金融风险雷达是一个面向公开部署场景的静态风险监测页面。项目以静态基线数据为主，以 realtime 覆盖层为辅，并在前端统一展示 freshness、degraded、unavailable 和 Health Dashboard 状态。

## 发布状态
- 当前稳定版：`v26.0A-rc1`
- realtime 发布分支：`realtime-data`
- 当前能力：`baseline + realtime overlay + freshness + degraded + health dashboard`

## 架构概览
- `main`：承载 GitHub Pages 主站页面
- `data/radar-data.json`：静态基线数据
- `data/radar-history.json`：历史序列
- `realtime/market.json`：realtime 产物路径
- `realtime-data`：realtime JSON 发布分支

## 数据流
- baseline：页面先读取 `data/radar-data.json`，保证在没有 realtime 时也能正常渲染
- realtime：前端优先读取 `realtime-data` 分支上的远端 `realtime/market.json`
- fallback：如果远端 realtime 暂时不可用，前端回退到 `main` 中的 `./realtime/market.json`
- overlay：前端按字段级规则把 realtime 覆盖到 baseline，而不是整体替换
- unavailable：当 realtime 缺失或超过 freshness 阈值时，页面退回 `Baseline Only`

## 运行机制
- `baseline`：提供页面默认内容和安全兜底
- `realtime overlay`：提供盘中快变量、状态覆盖和实时增强
- `freshness`：区分 `fresh`、`aging`、`stale`、`unavailable`
- `degraded`：标记 fallback、cache-only、critical missing 或单源失败等非理想状态
- `Health Dashboard`：聚合 freshness、degraded、source status、health score 和问题摘要

## 健康状态说明
- `Healthy`：realtime 新鲜且无明显降级
- `Watch`：realtime 进入 aging 或存在轻微异常
- `Degraded`：realtime 可用，但存在 fallback、cache-only、critical missing 或源失败
- `Stale`：realtime 可用但已明显过旧
- `Baseline Only`：realtime unavailable，页面仅依赖 baseline

## 相关脚本
- `scripts/run-realtime.mjs`：生成 realtime payload
- `scripts/run-daily-pipeline.mjs`：生成静态基线与历史数据
- `scripts/validate-data.mjs`：验证基线、历史和 realtime 产物结构

## 发布与部署
1. `Build Realtime Market` 生成并发布 `realtime/market.json` 到 `realtime-data`
2. `Build Daily Radar Data` 生成 `data/radar-data.json` 与 `data/radar-history.json`
3. GitHub Pages 继续由 `main` 提供页面

## 维护提示
- `main` 中的 `./realtime/market.json` 仅作为兼容性 fallback，不保证是最新值
- realtime 发布与页面部署已经解耦；realtime 刷新不再依赖向 `main` 高频提交
- 如果页面出现 `Baseline Only`，优先检查 realtime 发布链路和 `realtime-data` 分支内容

## v26.0A 官方发布说明（Decision System Release）

### 版本定位

`v26.0A` 是《全球金融风险雷达》的关键架构版本。

这一版本将系统从“风险信息展示工具”升级为“可执行的风险决策系统”。

它的重点不在于增加更多图表，而在于将已有风险信息组织成统一的判断框架、仓位框架与动作框架。

### 核心变化

把“风险信息”压缩成“状态”，再把“状态”映射成“行动”。

### 新增核心能力

- `Strategy State`
  - 系统输出五档策略状态机：`Risk-On / Balanced / Caution / Defensive / Crisis`
- `Position Guidance`
  - 系统输出区间化总仓位建议，而不是单点仓位
- `Action Queue`
  - 系统输出当日动作优先级，区分优先动作、观察事项与禁止事项
- `Trigger Monitor`
  - 系统说明哪些条件会推动当前状态升级
- `Invalidation Rules`
  - 系统说明哪些条件意味着当前判断可以缓和或需要重审
- `Decision Header`
  - 首页首屏改为“决策优先”，先给结论，再看图表

### 系统结构

当前系统可以概括为三层：

1. 看见风险
   - 聚合总风险分数、六大风险模块、实时快变量、健康状态与历史变化
2. 理解风险
   - 将离散指标压缩为统一策略状态、主导风险源与状态变化解释
3. 执行动作
   - 输出仓位区间建议、动作队列、升级触发器与缓和条件

### 决策契约

`v26.0A` 引入了统一的 `decisionModel` 输出层，用于承接后续所有状态、仓位、动作与触发逻辑。

结构示意如下：

```text
decisionModel
├─ strategyState / stateLabel / stateReason / stateScore
├─ stateDrivers / dominantDrivers / stateMeta
├─ positionGuidance
├─ actionQueue
├─ triggerMonitor
└─ invalidationRules
```

这一层的意义在于让系统对外输出一个稳定、可消费、可扩展的决策对象，而不再只是分散展示多个指标。

### 使用方式

当前系统的定位需要明确：

- 这不是选股工具
- 这不是短线交易信号系统
- 这不是个股买卖点生成器

它的定位是：

- 宏观风险判断工具
- 风险状态识别工具
- 资产配置与仓位管理辅助工具

它更适合回答的问题是：

- 当前风险状态属于哪一档
- 当前应偏进攻还是偏防守
- 当前总仓位大致应落在哪个区间
- 当前最优先的动作是什么
- 什么情况下应该进一步升级防御，什么情况下可以缓和

### 当前版本状态

当前版本为：`v26.0A-rc1`

版本状态判断如下：

- 决策骨架已经完成
- 首页已经具备“结论优先”的决策首屏
- 状态、仓位、动作、触发器、失效条件已经形成统一输出
- 当前规则系统仍属于 `v1` 版本

这意味着：

- 结构已经完整
- 输出已经稳定
- 但规则阈值、历史匹配与文案统一仍有继续优化空间

### 下一阶段方向

后续如进入下一阶段，更合理的推进方向包括：

- `Historical Regime Matcher`
  - 增加历史相似风险阶段匹配能力
- `Schema Cleanup`
  - 收缩兼容字段，进一步明确 canonical fields
- `Rule Configuration`
  - 将关键阈值、区间与映射规则从逻辑中抽离
- `Language / Copy Unification`
  - 统一页面文案、状态表达与术语层级

### 总结

`v25：看到风险；v26：知道该做什么。`
