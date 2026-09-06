# Energy/Transport 标题与 schema 断言迁移 · 2026-09-06

本轮按 owner 的继续精简授权实施 [ADR-0028](ADR/0028-energy-record-assertion-location.md)。此前历史原文迁移结果见[前轮回执](REVIEW_2026-09-06_ENERGY_BACKLOG.md)。

## 改动

- 68 个领域校验器改为直接读取现有 `ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md` 中的阶段记录。76 项标题/schema 标识和所有断言保留；关联报错名称随目标更新，没有旧 backlog 拼接兜底。
- backlog 删除历史标题兼容索引和纯校验用 schema 记录，保留当前状态、授权、未解锁事项与对应文档入口。
- `check:docs` 接入 18 项真实 checker 的读取隔离测试：简短 backlog 可通过，历史文件缺失或标识被删必须失败，即使旧 backlog 仍保存全部历史也不能掩盖。
- package.json、INDEX、ADR 索引及最新交接同步。现行运行规则和其它 backlog 消费者未迁移；历史文件没有被提升为新的操作批准来源。

## 验证

Backlog 从 109,088 bytes 降至 104,554 bytes，净减 4,534 bytes。更主要的收益是解除后续编辑必须保留这 76 项历史文字的约束；没有新增另一份重复记录。

机械迁移核对 exit 0：68 个文件的修改逐字等于预定的路径/诊断名称替换，历史文件字节不变、76 项标识均保留，861 个已有文件中的非目标内容保全。18 项读取隔离测试全通过（exit 0），同时覆盖精简成功与故障不能被旧位置内容掩盖。

| 命令 | 结果 |
|---|---|
| `node --test tests/unit/energy-record-authority.test.mjs` | exit 0；18/18 通过，已纳入 check:docs |
| `npm run check:changed` | exit 0；自动选择 full，完整 `check:all` 通过 |
| `npm run check:docs` | exit 0；196 份 Markdown，链接/锚点问题 0；既有 13+5 项测试与新增 18 项测试通过 |
| `python manual-artifacts/instructions-20260906/phase8/verify_migration.py` | exit 0；机械差异、历史保全、其它任务及非目标文件核对通过 |
| `git diff --check` | exit 0 |

完整检查后仅更新回执，重新验证文档与保全。没有未解决的检查失败；现有 CRLF→LF 提示不是失败。证据保存在 ignored `manual-artifacts/instructions-20260906/phase8/`。

## 边界与剩余事项

本轮不改变运行时、生产数据、评分、来源权利或发布权限。现有断言的严格程度保留；独立治理/checker 合并审阅仍须完成。没有执行 commit/push 或部署。

Energy/Transport 的历史文字不再限制当前 backlog 写法。其它领域仍有独立的 backlog 消费者；本轮保留它们和必需章节检查，不为一并清空依赖而扩大范围。
