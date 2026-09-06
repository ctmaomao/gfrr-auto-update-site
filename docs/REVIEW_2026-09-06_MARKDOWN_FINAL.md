# Git 授权、neat-freak 更新与 Markdown 复核

## 授权与本轮落实

Owner 于 2026-09-06 明确采纳 Git 分级方案，要求保留 neat-freak 核心、检查更新并再核查所有 Markdown 的精简空间。

根 AGENTS 已采用 [ADR-0026](ADR/0026-tiered-git-authorization.md)：本地常规 Git 可自主执行，远端/合并及关联发布按有效任务授权执行，破坏性操作保留具体确认。同步 CLAUDE、领域附件及 legacy input-contract 文档的通用手动 Git 条款；历史回执保留当时事实，现行权限由新 ADR 明确替代。没有移除人工 contract review、付费、数据/源权利或 Hook 信任保障。

## neat-freak 更新判断

公开上游为 [KKKKhazix/khazix-skills](https://github.com/KKKKhazix/khazix-skills/tree/main/neat-freak)。读取的 v3.0.0 固定于 commit `2b4a645cfdc894156ae347d897723562f719ce95`（2026-07-19）；这是本次检索到的上游版本，不把本地定制文件冒充为原封不动的 v3。原安装工具/来源锁未找到，保留这一溯源限制。

- 采纳新版的清晰触发排除：纯编码、普通数据/正文编辑，以及没有项目文档语境的“整理”不自动启用。
- 保留本地已修正的附录：不固定四处同步、不按七天/行数删除历史、不直接编辑受管记忆。
- 未整包覆盖：上游把存在协作/部署对象作为完整流程触发因素，并规定多状态/多阶段输出及固定自检。对本项目小改动会增加无关收尾工作，本地仍按实际任务范围选择检查。
- 当前 Git 规则由项目授权决定，技能不再固守被替代的 owner-manual 限制。原始 base/local/hash/diff 和已审阅上游 commit 一同保存在个人维护源；未运行上游安装器或脚本。

## 全量扫描范围与结果

项目扫描覆盖全部 Git 跟踪及未忽略的新 Markdown：起始 186 文件、2,729,887 bytes；扫描清单和匹配行位于 ignored `manual-artifacts/instructions-20260906/phase5/markdown-inventory.json`。核对所有文件的大小、执行/批准措辞、旧 Git 规则及退役检查名，并人工阅读命中上下文与直接权威文件。不是每个金融事实或历史事件的重新实证审计，也不包含依赖、构建产物、个人受管记忆和所有历史插件缓存。

### 高优先级发现

| 文件/原文 | 影响 | 处理与建议 |
|---|---|---|
| AGENTS：`AI 不自主执行改变 Git...`；CLAUDE：`等待 Git 人工操作`；领域附件：`Git 人工控制` | 已获授权仍会停止；与 owner 新决定冲突 | 已替换为分级授权及导航，不重复批准已授权命令 |
| EXTERNAL_AI_ANALYST_INPUT_CONTRACT_REVIEW：`需要提交时由 owner 手动执行` | 旧设计条款可能被误当作现行通用 Git 禁令 | 仅通用 Git 条款改为根规则，原 provider/secret/生产边界保留 |
| PROJECT_BACKLOG 维护条目重复前三轮过程，最新交接仍说 `Git 人工执行` | 恢复上下文后读到过期待办 | 当前维护条目压缩为现行状态和回执指针；历史回执不改写 |
| DESIGN：`check-frontend-ia-m94v0`、`check-frontend-folded-default`；ADR-0011/0014 的旧 IA checker 执行描述 | 当前 scripts/package/suite 已无这些入口，可能要求运行不存在的检查 | 建议单独修正文档的执行说明，保留 DESIGN + review 和现行 frontend-live-contracts；本轮未改变设计审批或新增替代脚本 |

### 进一步精简的候选与保留理由

1. **PROJECT_BACKLOG（扫描时约 353 KB）**：最近交接后仍挂大量旧会话增量。可把无活跃依赖的历史搬到已有 milestone/history 索引；先检查标题锚点、checker 的文字消费者及仍开放事项，再分段迁移。不能把所有“已完成”按日期删除。此项只提出建议，未搬迁历史。
2. **DATA_CONTRACT（约 345 KB）和 DATA_SOURCES（约 197 KB）**：存在多阶段状态叙事，但也包含真实字段、费用/源权利及失败隔离约束。适合按领域建立现行摘要和历史指针，不适合本轮机械删段。领域 checker 已与根解耦，但仍有文字断言消费者，迁移须保持约束。
3. **DESIGN 的重复与冲突**：§2.3 禁用 PingFang SC，但 §3.1 serif fallback 包含它；§6.1 的 `#999` 与“颜色必须用 token”冲突；§4.1/4.2 和 §5.6 的旧 mock/导航编号混杂。建议由设计契约评审明确例外/现行权威，再删重复清单。§4.3/§9.1 的 issue 讨论是明确审批要求，本轮保留，不用“精简”绕过。
4. **历史 scope/ADR/回执中的旧命令**：有明确历史用途的示例保留；现行执行入口以根规则、package/suite 和 workflow 为准。历史措辞不逐个替换成今天的状态，避免失去审计意义。

最终复扫共 188 份项目 Markdown，发现 13 组跨文件的重复长段落（标准化后至少 220 字符）。最大两类是 13 份 Market Pricing 文档重复的 1,426 字符状态说明，以及 14 份 External AI 文档重复的 744 字符状态说明。可保留每篇短状态提示，把现行权限/回退说明归入共同权威文档；需先确认消费者，不能连同 source-rights 禁令删除。证据见 ignored `phase5/markdown-final-scan.json`。

原领域约束、Core-23/Shadow-4、source-rights、financial/provider gate 等命中“必须”并非无用提示词，均保留。精简目标是降低常驻和重复规则，不是最少字节。

## 验证

- `npm run check:all`：exit 0；日志在 ignored `manual-artifacts/instructions-20260906/phase5/check-all.log`。本轮修改规则文件，使用完整检查。
- 最后 Git 快进同步的措辞澄清及回执/交接更新后，再跑 `npm run check:docs`、`npm run check:workflows` 和 `git diff --check`；其余未变的完整套件结果复用。
- neat-freak `quick_validate.py`：exit 0。个人维护 `test_manage.py`（10 项）与 `test_discover.py`（2 项）：exit 0；SessionStart handler 直接执行 exit 0、输出 `{}`。14 份安装目标与维护源 SHA-256 一致。
- `node manual-artifacts/instructions-20260906/phase5/verify-final.mjs`：exit 0；72 份领域 checker 仍仅迁移读源、153 条原领域约束保留。根 AGENTS 17,616 bytes + 全局 2,804 bytes；本轮增加 Git 分级操作边界，未为追求净缩短而省略必要权限。
- 本轮文件：AGENTS、CLAUDE、AGENT_DOMAIN_BOUNDARIES、EXTERNAL_AI_ANALYST_INPUT_CONTRACT_REVIEW、PROJECT_BACKLOG、INDEX、ADR 索引、新 ADR-0026 和本回执；仓库外为 neat-freak SKILL 及维护源的 manifest/local/diff/README。DESIGN 和其它历史/领域契约本轮仅审阅。

本地实现与验证完成。Git 规则已获 owner 采纳；此次任务不需要创建提交或远端动作。首次 Hook 信任和新任务真实触发仍为此前未完成的独立启用步骤，本轮未更改信任数据库。后续设计规则修订、历史迁移和重复状态说明收敛是审阅建议，不是已实施结果。
