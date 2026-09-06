# 文档整理回执 · 2026-09-06

本轮仅处理 owner 点名的重复状态、历史交接和设计文档矛盾。之前 Git/技能维护结果见[前轮复核](REVIEW_2026-09-06_MARKDOWN_FINAL.md)。

## 改动与边界

- 13 篇 Market Pricing、14 篇 External AI 文档的重复状态改为指向[统一状态](LEGACY_DOCUMENT_STATUS.md)；原来的两段完整说明各保留一次，阶段正文和仍有效的 display-only、降级、生产契约边界均保留。日期快照不冒充今天的实测数据。
- PROJECT_BACKLOG 的旧会话交接与 Section 5 审计表[原文归档](PROJECT_HANDOFF_HISTORY.md)，现行章节锚点、Section 2 待办及未关闭观察项保留。归档中的旧“下一步”和批准不恢复为当前任务。
- 先记录 [ADR-0027](ADR/0027-design-document-consistency.md) 的例外，再修改 DESIGN：字体和颜色字面量可出现在 token 定义；使用处引用 token。`#999` 仅允许现有 `.indicator-card .meta` 的单条虚线边框。删除错误示例中的 PingFang SC，与实际 serif 栈一致。
- DESIGN 的退役 checker 要求改为实际检查加人工 review。ADR-0011/0014 只更新状态中的局部替代关系，保留历史决策正文。没有删除或放宽 checker assertion。

本次规则例外仅明确上述 token 定义和既有单条边框；没有授予新组件使用裸色值的权限。未来视觉/IA 变更的 issue/PR 审阅要求保留。CSS、HTML、renderer、生产数据和 workflow 未改；其它视觉漂移没有因此获准。

## 验证

保全核对已通过（exit 0）：27 份文件均只替换约定的状态段；原状态段各保留一次，历史交接及审计表原文各完整保留一次，backlog 原有章节锚点、既有任务/完成事项正文及旧 ADR 决策正文保全。生产/前端路径 diff 为空。

Backlog 从 352,319 bytes 降至 239,042 bytes，减少 32.2%。27 篇文件移除的重复正文为 21,817 bytes，新增统一状态入口为 3,021 bytes，净减约 18.8 KB；历史归档减少默认读取量，不代表删除历史。

| 命令 | 结果 |
|---|---|
| `python manual-artifacts/instructions-20260906/phase6/verify_preservation.py` | exit 0；内容保全及运行路径 diff 核对通过 |
| `npm run check:all` | exit 0；完整验证链通过 |
| `npm run check:docs` | exit 0；192 份 Markdown，链接/锚点问题 0；包含 13 项领域权威测试和 5 项文档分流测试 |
| `git diff --check` | exit 0 |

完整套件通过后，只更新索引、文档版本/回执等说明，并重跑受影响的文档检查与保全核对；不重复无变化的生产验证。日志位于 ignored `manual-artifacts/instructions-20260906/phase6/`。首次文档检查曾因尚未创建本回执而失败，补齐目标后通过；最终没有未解决失败。Git 的既有 CRLF→LF 提示不是检查失败。

这是本地文档交付，没有执行 commit/push、发布、真实 provider 调用或视觉改造。页面未变，本轮未新增浏览器截图验收。

## 剩余范围

Backlog Section 2 中较长的 ODP/Energy 实施过程仍混有当前授权、未解锁事项和 checker 所需标识；后续拆分应先确定每条现行状态及领域承接位置。本轮不通过删正文或弱化校验器来压缩。合并审阅、Hook 首次信任及此前生产观察事项按当前交接继续，不作为本次文档本地交付的额外门槛。
