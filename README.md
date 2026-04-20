# 全球金融风险雷达

当前稳定基线：`v26.0B`

本版本基于 `v26.0A-stable` 整包升级，保留原项目结构、原页面模块、原决策系统骨架、原 baseline + realtime overlay 架构，仅新增 决策结论 一句话决策输出。

## 发布状态
- 当前稳定基线：`v26.0B`
- realtime 发布分支：`realtime-data`
- 当前能力：`baseline + realtime overlay + freshness + degraded + health dashboard + decision model`

## 项目结构
- `index.html`：主站页面入口
- `assets/styles.css`：页面样式
- `scripts/app.js`：前端主逻辑与决策系统渲染
- `scripts/run-daily-pipeline.mjs`：生成静态基线与历史数据
- `scripts/run-realtime.mjs`：生成 realtime payload
- `scripts/validate-data.mjs`：验证基线、历史与 realtime 结构
- `data/radar-data.json`：静态基线数据
- `data/radar-history.json`：历史序列
- `realtime/market.json`：本地 fallback realtime 数据

## 数据流
1. 页面先读取 `data/radar-data.json` 作为安全兜底
2. 前端优先读取 `realtime-data` 分支中的远端 `realtime/market.json`
3. 如远端 realtime 不可用，则回退到 `./realtime/market.json`
4. 前端按字段级规则将 realtime 覆盖到 baseline，而不是整体替换
5. 当 realtime 缺失或超过 freshness 阈值时，页面退回 `Baseline Only`

## 健康状态级别
- `Healthy`：realtime 新鲜且无明显降级
- `Watch`：realtime 进入 aging 或存在轻微异常
- `Degraded`：realtime 可用，但存在 fallback、cache-only、critical missing 或源失败
- `Stale`：realtime 可用但明显过旧
- `Baseline Only`：realtime unavailable，页面仅依赖 baseline

## v26.0A 决策系统能力
- 统一 `decisionModel` 输出层
- 五档策略状态：`Risk-On / Balanced / Caution / Defensive / Crisis`
- 区间化总仓位建议
- 动作队列、触发条件、失效条件
- 首页首屏决策优先显示
- 执行状态灯、执行限制与健康状态联动

## 整包发布纪律
本项目从现在开始只允许整包升级，不允许：
- 单文件替换
- `scripts/app.js` 局部修改
- patch / diff / 行号替换
- 任何需要用户手动改代码的操作

## 高风险核心文件
`scripts/app.js` 视为高风险核心文件：
- 只能通过整包版本交付
- 如需修改，交付前必须通过 `node --check scripts/app.js`

## 回滚规则
如新版本异常，直接用上一个稳定整包整体覆盖回滚；不做现场修补，不做 conflict 修复。

## 常用命令
```bash
npm run build:data
npm run build:realtime
npm run validate
node --check scripts/app.js
```
