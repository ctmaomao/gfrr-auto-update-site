# ADR-0065：World Order 缓存 Action 的 Node 24 固定版本

## Status

2026-10-11 owner 授权有界健康整改第二项；本独立 PR 显性收紧 runtime checker，合并前须独立审阅。

## Context

World Order 专用免费 Events 缓存的 restore/save 使用官方 v4 固定提交，action.yml 声明 node20。工作流虽已有 FORCE_JAVASCRIPT_ACTIONS_TO_NODE24，不能据此宣称实际执行了旧运行时；问题是依赖声明和 Node 24 基线不一致，原 checker 对未登记 cache Action 只给警告。

## Decision

restore/save 升至官方 [v6.1.0](https://github.com/actions/cache/releases/tag/v6.1.0)，固定提交 `55cc8345863c7cc4c66a329aec7e433d2d1c52a9`。官方 [restore 元数据](https://github.com/actions/cache/blob/v6.1.0/restore/action.yml) 和 [save 元数据](https://github.com/actions/cache/blob/v6.1.0/save/action.yml) 均声明 node24；官方 runner 最低要求 2.327.1，已有生产日志的 Ubuntu runner 为 2.337.0。

在现有 runtime checker 登记 cache、cache/restore、cache/save 三个入口的同一固定版本；未登记的其它 Action 仍保留原警告规则。不删除、放宽原断言，不新增 ignore。CLI 合成回归验证固定新版通过、旧版和浮动 tag 失败。

## Consequences

保持缓存路径、key/restore-keys、ACLED receipt 路径的 source-free/save 禁止规则、预算和生产写入校验不变；不新增依赖或触发手动采集。实际缓存复用效果以升级后的自然运行日志为准，本地检查不冒称平台已执行。若平台出现兼容问题，保留已有缓存与失败证据，另行审阅修复或回退，不能为通过检查撤销固定版本保护。
