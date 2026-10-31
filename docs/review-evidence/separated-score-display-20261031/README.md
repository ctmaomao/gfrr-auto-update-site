# 六模块基础读数与实际加分 · 展示验收

本 PR 符合 DESIGN.md 的所有规则。适用§2/3/4/5.3/6/9；Hero原有四行/纸张色板/serif14px状态与13px明细/桌面两列手机单列保持，未新增CSS或IA。

基于main `5d63d596`，before为修改前真实页面、after为集成后页面；同一份2026-10-31T01:43:50.171Z已发布快照。综合分始终68，新增明确展示基础57、尾部保底+11、运输+0；这不是换公式或准确率证明。结构脆弱性仍未建立总分。

- 桌面1440：[before](before-1440.png) / [after](after-1440.png)
- 手机390：[before](before-390.png) / [after](after-390.png)
- 实测DOM/颜色/字体/字号：[before facts](before-facts.json) / [after facts](after-facts.json)

四行、nav13、综合68，两个宽度都无横向溢出和页面脚本异常；前后computed styles一致。图像只证明Hero展示，导航数量/无横溢/数值一致以facts为准。Chromium headless仅访问本地静态服务，外部请求阻止，外部字体可使用既有fallback；没有市场取数或生成生产JSON。

保留main原有missing/empty/invalid/partial尾部记录区分与阻塞运输不计警报的保护；完整归因缺失时仍展示原记录状态，新基础读数保持待确认。floor明确综合分下限，多条件不逐项相加，实际增量只读发布字段。使用与app相同的版本化模块实例进行单元验证。

owner已授权独立Codex代审PR #488作为本次人工review的窄范围替代，仍为AI审阅。首轮独立审阅发现“正尾部增量但原因为空”缺少警示，修订为部分记录待核验/原因待确认，补充与真实零增量的区分测试；after图/facts更新为该修订的真实页面。完整检查和最终固定提交复审回执见本任务PROJECT_BACKLOG条目/PR；此证据本身不授予生产模型迁移权限。
