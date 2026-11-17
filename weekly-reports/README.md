# GFRR 每周周报发布与归档

- 只使用既有每周一 Pacific/Auckland 09:00 自动任务，不新增仓库定时器或重复任务。
- 规范正文路径为 reports/YYYY-MM-DD.html；每期完整UTF-8单HTML，样式和可选打印脚本内联，正文不请求实时数据。
- 新一期使用下方的原件保存与期次验收流程；生成器更新 weekly-reports.html（最新完整正文和近期目录）、reports/archive.html，以及 weekly-reports/index.html 和 weekly-reports/YYYY-MM-DD.html 旧路径兼容副本。
- 最近52期列在首页；更早期次只进入历史归档列表，固定URL、正文和Git历史保留。没有自动永久删除操作，也不因生成/发布失败清理任何旧文件。
- 历史日期页不得跟随最新数据重新计算或重写。必要纠错须明确版本与纠错说明；不静默改旧数值。
- 编辑核对参见[四项容易混用的来源](EDITORIAL-SOURCES.md)；该清单不改变生产取数，也不是自动发布门槛。
- 重要事实逐项链接具体文章、发布、表格或系列。记录观察/发布/获取时点，推算数字说明计算口径；未知时间保留未知。不混用Brent现货/期货或不同合约收益率。
- 旧GFRR模型分、作者研究分和现行OFR原始指数必须区分，不换算为危机概率。事实、推断、情景与来源局限分别披露。没有可核对的前周同口径数据就不发布周差。
- 首页右上三个常显标签；根入口默认周报，全球雷达使用 index.html?view=radar，原雷达锚点保持兼容。
- 发布前运行 check:changed（完整check:all）、周报路由与离线浏览器测试、Pages artifact和EdgeOne staging验证；仅在授权并通过独立审阅后集成发布，随后实测两站首页、日期正文、三标签和旧锚点。
- 发布后提供 GFRR_Weekly_YYYY-MM-DD.html 原文件附件，并如实报告提交、CI与部署状态。未通过部署验证不得称已上线。

## 原件、构建与发布回读

1. 对已完成内容与来源验收的完整 UTF-8 HTML，在原始文件上计算 SHA-256，独立记录预期期次日期和摘要。标题必须标识期次日期。完整性由验收原件及其摘要共同约束；摘要只能证明字节一致，不证明事实准确或来源已核查。原件不在时停止，不由摘要或旧期重建正文。
2. 在 latest main 的独立分支执行 `node scripts/weekly-original.mjs save YYYY-MM-DD SHA256 /path/to/accepted.html`。保存到 `weekly-originals/YYYY-MM-DD/SHA256.html`，并写入该日期的身份文件、回读校验。相同身份可重试，不同摘要不覆盖；异常中断重试相同期次和摘要。该目录随仓库提交保存、但不进入网站静态产物；只有提交并推送后才可从远端 Git 重取，单靠本地文件不是远端持久化。不要将未验收内容或凭据放入仓库。
3. 执行 `node scripts/weekly-original.mjs prepare YYYY-MM-DD SHA256` 从已保存原件写入固定日期页并生成入口；重试必须使用相同日期和摘要。再执行 `node scripts/weekly-original.mjs check YYYY-MM-DD SHA256`，确认原件、日期正文、最新期次和生成入口一致。缺失、错期或摘要不符即停止；常规 `check:weekly-reports` 不知道外部预期期次，不能代替这一显式检查。日期兼容页不覆盖，发生冲突应保留文件并调查，不自行删除历史。
4. 运行完整检查、浏览器测试和 Pages/EdgeOne staging 验证，按 serial trunk 策略仅提交本期文件并经独立审阅；必要时把保存原件作为同一任务分支上的先行提交，再推送以保证可从远端恢复。恢复时先读取并校验远端原件、分支与已有提交，不重新生成正文；CI 或部署失败保留原件和提交，修复后从失败阶段继续。仅有保存或构建成功不能称发布成功。
5. 集成并确认部署后，以实际发布的源码完整 commit SHA 执行 `node scripts/verify-weekly-publication.mjs YYYY-MM-DD SHA256 SOURCE_COMMIT`。脚本分别读取 Pages 与 EdgeOne 的日期页、兼容日期页、最新入口、兼容入口及历史入口，将每份字节与该提交逐一比较，并核对最新与历史入口的链接。保留输出的各 URL 与 SHA-256、源码提交、两站部署及 CI 记录。任一站点、链接或哈希失败即未完成发布，待修复后重试；实站三标签和旧锚点仍按上方浏览器验收。该步骤不会部署、触发付费服务或修改内容。
