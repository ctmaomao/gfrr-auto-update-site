# 指令与文档治理提交回执 · 2026-09-06

Owner 已授权完成建议并 commit+push。本系列仓库交付包含 AGENTS/CLAUDE 精简、领域规则承接、校验器文档读取解耦、按变更验证、设计例外、重复状态合并及 backlog 历史归档。此前各阶段回执是当时快照，其中“未 commit/push”不代表本轮最终交付状态。

## 本轮整理

维护状态只保留版本依据、前端/Worker/Daily 职责与现行契约入口，不手抄检查数量或旧健康快照。Completed 表、P3-17/18/20 和旧维护状态原文存入 [PROJECT_COMPLETED_HISTORY](PROJECT_COMPLETED_HISTORY.md)；原章节入口与当前待办保留。

领域附件纠正旧 v28.0J “当前基线”描述，增加 Transport 手工条目的按需导航，原领域规则正文保留。AGENTS 删除“空 ignore list 也解释为何为空”的形式要求；实际 ignore 的理由、边界、解锁路径和人工合并审阅仍保留。此修改不增加操作权限。

## 验证与交付

- `npm run check:changed`：exit 0；本系列含治理/校验器变更，自动选择完整 `check:all`，全部通过。
- `npm run check:docs`：exit 0；36 个指令/历史读取与验证分流测试通过，198 个 Markdown 文件的链接/锚点问题为 0。
- 本轮原文保全核对：exit 0；5 个归档块逐字保留，其余 8 个 Open 条目不变，领域附件 158 条列表行不变，862 个基线文件核对未发现范围外修改。Backlog 从 104,554 降至 43,402 字节。
- `git diff --check`：exit 0。Git SHA/远端核对结果在交付回复给出，提交和推送不代替独立人工合并审阅。

使用独立任务分支 `codex/instruction-docs-maintenance`，从 fetch 时的最新 origin/main 建立；只提交本系列仓库文件，不混入用户原有 `.agents/`、`skills-lock.json` 或 ignored 手工产物。独立人工 checker/治理 review 完成前不合并 main。分支 push 不是生产部署。

个人全局 AGENTS、技能与维护源位于仓库外，保留在现有个人维护来源，不复制到项目公开远端。`manage.py status --installed` exit 0，pending writes / conflicts / upstream review 均为 0；维护工具的 12 个单元测试通过（exit 0）。Hook 首次信任/真实 SessionStart 激活仍未实证，必须与脚本自身测试区分。
