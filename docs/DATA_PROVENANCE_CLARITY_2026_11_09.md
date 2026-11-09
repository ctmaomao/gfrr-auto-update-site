# 数据口径、时间与解释清晰度核查（2026-11-09）

## 2026-11-09 整合与视觉验收回执

PR #511 以 `9f79438d` 与 main `3a8a44c1` 无冲突整合，代码及数据整合树为 `a5c6a5bea762e22f8cf9b0ea59b96f959ab059e2`。相对该 main，生产 `data/` 和 workflow 差异为空。协调方记录整合树 `npm run check:changed` 实际执行完整 `check:all`，exit 0；unit coverage 1616 pass、1 个既有 skip、0 fail，lines/branches/functions 分别为 99.86/93.23/97.96；35 项独立审阅专项、`node --check scripts/app.js` 和 whitespace 检查通过。独立 AI 审查完整 PR 相对 main 无 P1/P2，不是人工批准。首版 CI check-all job `128943387505` 的步骤成功；新 head 的 CI 尚待核验。

对同一生产快照的 1440px / 390px Chromium before/after 进行了真实截图和查看，详情及计算样式见[视觉证据](review-evidence/pr511-visual-20261109/README.md)。关键文案、展开/折叠和重复导航可读，未见横向溢出或页面脚本异常；Google Fonts 请求被代理限制，使用回退字体，网页字体的最终视觉效果尚未验证。用户已撤销本项目重复人工确认环节，质量门槛不变；新 head 的 CI 和发布验收仍待核验。本次不声称已上线。

## 范围与基线

owner 要求核查并实施第 4 项：分开观察、获取和计算时间；来源健康与时效；Brent 现货/期货、合约月份及日期；广义美元指数与 DXY；近期金融压力与慢变量结构脆弱性。后续研究先证明稳定可得，不增加未回测评分。基于 main `c59cc4b1` 的新隔离工作树，原预算工作树和周报工作保留。本 PR 符合 DESIGN.md 的所有规则。

使用既有 `.section-note`、指标卡 `.aux/.agg-rows/.note`、Hero `.hero-lane-*` 和附录 `dl`；沿用三字体栈、纸色/墨色和响应式布局，不新增 section、颜色、字体或卡片。强制 asset bump 产生的其它 JS 改动仅为 import query，不是业务修改。

## 已有实现与确认缺口

- OFR 已有原观察日、实际获取时间、派生组件时间，7 日历日失效保护和浏览器重算年龄；结构脆弱性已独立列示、无综合评分。主位不再使用旧模型阈值或仓位映射。
- 快照已区分采集时健康分与 36 小时生成年龄，但附录仍称“所有关键数据源实时”，不能由采集成功推导这一结论。
- 当前 `data/radar-data.json` 记录输入提交 `65f198f530e87a31e7ea5283547d73063d1aae70`。该提交的 `realtime/market.json` 实际 Brent 为 `fred:DCOILBRENTEU` 107.03，观察日 2026-11-03；广义美元为 `fred:DTWEXBGS` 121.6656，观察日 2026-10-30。相同输入的采集健康为 100/100，不证明这两个观察值都是采集当日。
- 旧 `selectedBrent.observedAt` 错用输入生成时刻 2026-11-08；公开现货字段保留 11-03，Yahoo 期货为 11-06。页面仍把二者的 8.71 差值渲染成直接价差，且未显示观察日/合约月。
- 主美元中文名称正确，但英文卡题仍写 DXY。配置的主序列是 FRED DTWEXBGS；Yahoo DX-Y.NYB 是独立 secondary diagnostics，二者不是同口径点位。

输入证据：[固定 Daily 输入](https://github.com/ctmaomao/gfrr-auto-update-site/blob/65f198f530e87a31e7ea5283547d73063d1aae70/realtime/market.json)。

## 本轮实际修改

1. `selectedBrentObservation` 只接受与已选源、已选有限数值严格匹配的真实 observedAt/timestamp；使用既有严格日期校验，缺失/非法/未来返回 null。不借获取、输入生成或 Daily 时间续期，不修改主值或来源仲裁。
2. Brent 卡显示各报价的实际日期；ICE 仅在近月价格与合约行一致时展示其合约月/日期。连续近月未记录月份时明确“未核实”，不由相同价格或月度曲线猜月。Yahoo、Trading Economics 和未知源分别标识，不把市场报价回退冒充 Yahoo 连续期货。
3. 异日、未知日期或未验证合约月份不显示直接代理价差；最大跨口径偏离改为比较边界说明。即使同日且月份有明确元数据，也仅展示已发布代理差，不解释为实物溢价。后台旧审计价差与主评分不重算。
4. 美元英文卡题改为 BROAD USD INDEX，说明 DTWEXBGS 与 ICE DXY 的篮子、权重和基期不同；生产快照未保留该点日期，因此页面明确缺口，不硬编码本次历史输入的日期。
5. OFR 主位附近单列观察、获取及派生计算时间；说明这是约滞后两个营业日的近期已实现压力，不是实时行情。慢变量结构脆弱性独立解释，OFR 偏低不代表结构安全。
6. 数据附录区分输入快照生成、Daily 采纳输入、Daily 计算起点以及当前快照年龄；去除“全部实时”保证，成功采集写为“在线采集”，缺时间/模式清为空缺状态。保留原健康分与时效门槛。

## 明确未解决的边界

- `displayInputsBaseline` 尚未逐项保留所有输入的观察/获取元数据。本轮不扩 schema，不用组时间填补逐项缺失；美元卡仍不能直接显示该点实际观察日。
- Wind 的旧备用问句仍允许 DXY/广义美元、Brent 现货/连续合约。仅改问句不能证明返回品种与当前主序列等价。真实修复需独立来源契约、响应标识验证及仲裁回归；本轮不悄悄修改源准入或旧评分输入。当前引用的输入使用 FRED，未采用 Wind。
- 连续 Yahoo 近月对应月份未由生产对象确认。ICE/按月 Yahoo 有月份，不能据此替连续序列推断月份。
- 本轮不改生产 JSON、不回填旧历史、不调用 Daily/realtime 生成、不调用付费数据或 AI、不修改 workflow、评分、阈值及仓位。

## 后续研究的可得性核查

仅核对现有接入代码、文档及已登记公告，不声称新做全历史抓取或取得完整样本。

- **上市公司现金流覆盖**：现有 SEC companyconcept 与季度财务镜像有 OCF/Capex/Revenue 基础，但 Capex/OCF 不是偿债覆盖率；10-Q YTD 要差分。需固定公司，逐季核对现金利息、到期本金/租赁本金、期间与修订记录，验证连续可得率后再谈指标。[数据源现有登记](DATA_SOURCES.md)。
- **债务期限**：现有公司公告和 SEC 检索提供融资事件，未证明稳定的公司级到期梯度；需要多期年报债务附注核验逐年本金、浮息、担保及租赁边界。见[候选源记录](../config/bubble-watch-source-candidates.json)。
- **私营 AI 融资**：官方公告可核验个别事件，不能证明完整连续面板。先区分公告/交割、融资工具、承诺上限/实缴与缺失；新闻未命中不是零融资，ARR 不是审计收入。不得把融资意向、承诺上限与已付投资相加，见[既有研究边界](NVIDIA_OIL_FOLLOWUP_2026_11_04.md)。

这些方向仅进入后续研究，不扩展页面或评分；入分仍需稳定覆盖、非冗余、历史回放和样本外检验。

## 验证与发布状态

- 初轮 `npm run check:changed` 实际执行完整 `check:all`，exit 0；后续来源标签修订和本报告完成后的最终验证另记下方。
- 初轮 `npm run test:unit:coverage`：1615 pass、1 个既有条件 skip、0 fail；既有 95/90/95 门槛通过。独立 AI 审阅发现两项来源标签 P2，已修复并以新增反例锁定；最终复核专项 29/29，无剩余 P1/P2，不声称人工审阅。
- 云环境 CFT 下载损坏，系统 Chromium 的本地 socket 被执行环境阻止；默认及提权运行均未启动页面，不计浏览器通过。现成云浏览器亦无法连接此隔离环境 localhost。转到已连接桌面的新隔离工作树补验，结果另记。
- 原 validator/checker 断言没有删改或 skip；新增测试并入既有检查入口。`data/` 与 `.github/workflows/` diff 为空。尚未推送、PR、合并或部署。

### 最终本地回执

最终 `npm run check:changed`（实际包含 `check:all`）exit 0；`npm run test:unit:coverage` 1616 pass / 1 个既有条件 skip / 0 fail，lines 99.86%、branches 93.23%、functions 97.96%，原门槛通过。29 项直接回归、新增文件 ESLint、`node --check scripts/app.js` 和 diff whitespace 通过。源码方案一致性、checker完整性及无新增ignore例外均已自检；独立AI复核无剩余P1/P2。

桌面新隔离树的文件接收因官方传输工具Windows扩展属性不支持而失败，未绕过要求，未执行浏览器验收。另一个云环境经核查仍是原沙箱。后续协调允许独立draft PR触发固定提交CI；标准浏览器门槛与真实视觉证据未齐前不合并、不宣称上线完成。
