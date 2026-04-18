# 全球金融风险雷达 v24

全中文混合实时架构版宏观风险驾驶舱。

## 本版核心升级
- 保留 `data/radar-data.json` 作为慢变量静态骨架
- 新增 `realtime/market.json` 作为快变量实时覆盖层
- 页面加载时自动请求快变量，并重新计算执行状态灯、今日执行、目标仓位与部分流动性判断
- 新增 `Build Realtime Market` 工作流，每 15 分钟刷新一次快变量
- `Deploy Static Site to Pages` 现已监听 `realtime/**`
- 黄金数据改为可选源，不再阻断整次构建

## 当前架构
- 慢变量：GitHub Actions 定时静态构建
- 快变量：GitHub Actions 15 分钟刷新一次实时 JSON
- 前端：页面打开即合并两层数据并重算执行层

## 目录
- `data/`：慢变量
- `realtime/`：快变量
- `scripts/run-daily-pipeline.mjs`：慢变量构建
- `scripts/run-realtime.mjs`：快变量构建

## 部署
1. 上传全部文件到 GitHub 仓库根目录
2. 等 `Build Daily Radar Data` 与 `Build Realtime Market` 运行
3. 腾讯云 EdgeOne 自动重新部署
4. Cloudflare 域名无需变更
