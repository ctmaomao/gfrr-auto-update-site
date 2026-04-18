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
