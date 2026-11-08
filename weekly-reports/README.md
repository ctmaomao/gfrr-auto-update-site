# GFRR 每周周报发布与归档

- 只使用既有每周一 Pacific/Auckland 09:00 自动任务，不新增仓库定时器或重复任务。
- 规范正文路径为 reports/YYYY-MM-DD.html；每期完整UTF-8单HTML，样式和可选打印脚本内联，正文不请求实时数据。
- 新一期写入后运行 npm run build:weekly-reports。生成器更新 weekly-reports.html（最新完整正文和近期目录）、reports/archive.html，以及 weekly-reports/index.html 和 weekly-reports/YYYY-MM-DD.html 旧路径兼容副本。
- 最近52期列在首页；更早期次只进入历史归档列表，固定URL、正文和Git历史保留。没有自动永久删除操作，也不因生成/发布失败清理任何旧文件。
- 历史日期页不得跟随最新数据重新计算或重写。必要纠错须明确版本与纠错说明；不静默改旧数值。
- 重要事实逐项链接具体文章、发布、表格或系列。记录观察/发布/获取时点，推算数字说明计算口径；未知时间保留未知。不混用Brent现货/期货或不同合约收益率。
- 旧GFRR模型分、作者研究分和现行OFR原始指数必须区分，不换算为危机概率。事实、推断、情景与来源局限分别披露。没有可核对的前周同口径数据就不发布周差。
- 首页右上三个常显标签；根入口默认周报，全球雷达使用 index.html?view=radar，原雷达锚点保持兼容。
- 发布前运行 check:changed（完整check:all）、周报路由与离线浏览器测试、Pages artifact和EdgeOne staging验证；仅在授权并通过独立审阅后集成发布，随后实测两站首页、日期正文、三标签和旧锚点。
- 发布后提供 GFRR_Weekly_YYYY-MM-DD.html 原文件附件，并如实报告提交、CI与部署状态。未通过部署验证不得称已上线。
