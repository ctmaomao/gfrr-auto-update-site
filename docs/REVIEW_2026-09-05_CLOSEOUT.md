# 2026-09-05 全模块修复与剩余门槛

首轮取证截至2026-09-05 08:47 UTC，后续授权执行见下节。起点为最新main `67eae2a8`，按owner授权串行处理；9项代码/数据事项均已独立commit并push。此文是本轮验收，不承诺所有外部数据永久可用、未来需求完成或绝对零缺陷。

## Owner授权后的执行回执（2026-09-05）

- Owner明确批准一次现有Daily（允许配置内Wind兜底）、提供六份手动下载ACLED周表，并要求重连MCP；其余观察期和来源授权门槛保留。
- ACLED仅复制Downloads内三份新文件到ignored输入目录，另外三份与原件SHA-256相同；旧输入及Downloads原件完整保留。非洲/中东/拉美表内最新WEEK为2026-08-21，欧洲中亚/美国加拿大/亚太仍为2026-08-14；不得把文件名中的周标签或下载时间当作统一数据日。当前汇总使用既有各区域最新窗口，地区日期不齐，不作为严格同窗全球比较证据。
- `6a04c891`独立提交推送周度汇总；既有main-only `acled:publish`触发[World Order run 33958873350](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/33958873350)，成功生成并推送`f36faebd`。最终weekly/monthly均`data_current`；周度eventsLast4Weeks=33122、latestWeek=2026-08-21。月度2026-07-31配置未变且仍aging；data_current仅表示配置已进入生产快照，不代表六区/月表均为最新。
- 唯一一次[Daily run 33958975125](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/33958975125)成功，数据提交`9c93507d`，radar.updatedAt=2026-09-05T09:48:43.787Z。Wind策略为`skipped_no_candidates`、candidateInputs=[]、appliedInputs=[]，未进入付费兜底分支；没有第二次Daily或额外DeepSeek调用。
- 生产BDI由污染值4.06变为null/missing；BDTI/BCTI仍保留8月10日旧值fallback，源可用性未恢复。MLF已live：2026-08-25、5000亿元、12个月、未披露利率null。BoA仍为五月缓存fallback，不能关闭生产恢复；同版本地只读fetch成功返回八月5.0%/6.3%/4.3%，云端日志未记录BoA失败分类，具体云端原因未确认，不以猜测替代诊断。
- Daily按原快照绑定规则移除失效macroRiskEditorialLayer，页面回退确定性正文；没有手工补入或付费重生成AI层。
- ACLED本地check:all、operator-safety、weekly/monthly status、publish、review:world-order均退出0；两次云端生成及其提交前check:all成功。新Daily快照的test:e2e为11/11、退出0。
- Pages runs `33958930869`（World Order）与`33959057073`（Daily）成功，cache-busted GitHub Pages两份JSON与本地committed文件逐字节一致。此时自定义域名仍为旧快照，等待既有EdgeOne三小时发布通道；不为本次数据刷新绕过配额保护。
- MCP连接恢复已验证：应用内`list_projects`、`index_status`、`search_graph`与`check_index_coverage`均成功，不再仅CLI可用；查询命中`574fa753`新增的`createBofaFailureDiagnostic`。最新代码full索引完成于10:07 UTC，24726 nodes/81458 edges、0 skipped、5处partial parse。路径coverage仍给出metadata_changed提示，保留源码回读，不把图谱视为完整性证明。此前裸CLI的secure-coordination endpoint错误可通过复用现有项目完整启动配置避开；没有改配置、删除协调文件或终止其他进程，也未冒称执行过应用Restart。连接恢复与索引已关闭，不再要求owner重启。

以下首轮记录中的“尚未执行Daily/尚未收到周表/MCP无法重索引”已由本节更新；未解除的BoA云端失败归因、StockQ/ARR来源、ACLED滞后地区/月表、新闻v2观察和运输商业授权继续保留。

## 已交付

| 项目 | 提交 | 实际结果与边界 |
|---|---|---|
| StockQ/Baltic | `fe4b7e06` | 阻断收益率4.06%误读成BDI=4.06，严格表列/日期绑定并隔离受污染缓存；只读解析已正确missing，尚未恢复源明文报价 |
| FIRMS成熟观察基线 | `5d7f5493` | 240样本中193健康、47隔离，42/42设施有效窗口35.48天；既有晋升入口与生成器原子更新配置/展示快照 |
| 市场周线/指标 | `5eb2cb72` | QQQ/NDX/IXIC对齐2026-09-04，各522周；每资产463个60周指标、共1389窗口独立复算吻合；不改变auxiliary/manual-only政策 |
| 运输证据云端交接 | `8ac9285d` | 6份人工事件审阅以固定白名单metadata/hash manifest交接，云端实际读到3扰动/3对照；不上传原件，不批准评分扩展 |
| BoA公开摘要 | `af0c6749` | 8月报告发现/每户同比语义恢复，live probe为5.0%/6.3%/4.3%；页面显示报告月份与降级状态，未知未来简写仍需审阅 |
| 中国MLF | `149fe924` | 无效primary会转备用查询；共享最多6篇正文预算；同笔绑定毛额/期限/利率，操作日真实非未来且45天内；live probe为8月25日5000亿元/12个月/未披露利率 |
| EdgeOne源快照 | `fec9ad4b` | 排队后取最新main，锁定实际检查/构建SHA用于归因；保留3小时、无变化不发布、32天400次额度保护，不改域名/DNS |
| 新闻影子质量v2 | `47d6a81b` | 对照文章与Web统一五语shadow分类；拒绝未来/非法日期及父子域伪独立，新增脱敏诊断；旧样本可读但不混入v2晋升统计 |
| ARR解析安全 | `4d18ab54` | 阻断其他公司金额、普通收入、否定/条件/疑问/未来目标与ARR-equivalent误入；真实日历校验；原4个公开来源仍解析4/14/30/44，不补新里程碑 |

FIRMS统计另有必要限制：29个设施至少一个p95发生变化，独立复算252个p95一致；41个健康快照全设施零检出，16个设施p95全零。193份快照不等于193次独立卫星过境，零检出不证明正常运营，较高热背景不等于火灾/停产。该里程碑是成熟观察基线，不是季节性基线或断供/油价预测。

运输manifest只包含已审贡献、来源枚举和hash等允许字段；6样本的命中/误报统计是小规模人工标注统计，不是历史预测回测。原空review被误判“已批准/已连接”的问题也已修复，真实越界输入仍拒绝。

主要改动文件分组：

- 公共源：`scripts/daily/{stockq-freight,bofa-checkpoint,china-mlf}.mjs`、`scripts/run-daily-pipeline.mjs`及各单元测试。
- FIRMS与市场数据：`config/oil-thermal-watch-baseline.json`、`data/oil-thermal-watch.json`、`data/market-pricing-{history,metrics}.json`。
- 运输交接：`scripts/lib/free-proxy-evidence-manifest.mjs`、P30/P31/P32 reviewer/monitor及检查、固定manifest、P33 workflow。
- 前端：BoA显示逻辑、对应HTML与e2e；既有工具同步asset token至`bofa-report-review-1`，冻结的`realtime.js`未改。
- 发布与新闻：EdgeOne workflow/检查，cross-source telemetry、shadow cache、history reviewer及各检查。
- ARR：`scripts/bubble-watch/{arr-milestone-parser,observation-freshness}.mjs`、builder及回归测试。
- 对应契约、数据源、运维和backlog同步；无新增依赖，无全局记忆写入。逐提交的完整文件清单以`git show --stat <提交>`为准。

## 验证

| 检查 | 退出码 | 结果 |
|---|---:|---|
| `npm run check:all`（每个代码/数据事项后） | 0 | 9项最终版本均通过；部分刻意保留的候选/来源WARN不等于批准 |
| `npm run test:unit:coverage`（最终） | 0 | 84/84；受覆盖率门保护的指定文件lines99.79%、branches93.36%、functions98.36%，非全仓覆盖率 |
| `npm run test:e2e`（最终） | 0 | 桌面/手机11/11，包括BoA报告状态及AI/数据缺失降级 |
| StockQ/BoA/MLF专项回归 | 0 | 31项；MLF其中16项、BoA12项、StockQ3项 |
| ARR单元测试/真实4篇公开文章只读解析 | 0 | 7组负例与4个原值全部通过；未真实运行Bubble生产build |
| Web telemetry/cache/history三项checker | 0 | 五语一致性、日期/域名、计数契约及旧新版本隔离通过 |
| `review:gdelt-web-ngrams-article-shadow-history -- --no-output` | 0 | legacy223、usable208、35.81天保持；v2为0，明确不具晋升资格 |
| `node scripts/check-worker-health.mjs` | 0 | 08:28 UTC左右主/secondary HTTP200，healthScore100、无核心缺失/污染 |
| `npm run check:docs` / `git diff --check` | 0 | 文档链接、backlog格式与diff检查通过 |

开发时发现的失败均保留语义并修复：FIRMS配置与展示快照初次不一致，已用既有生成器纠正后重跑全量；ARR独立review识别的7个语气/限定负例已补齐。没有削弱validator、制造审批或通过付费重试“刷绿”。

真实发布取证：

- 运输云端run [33953468989](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/33953468989)成功，下载artifact验证6/3/3、gatePassed=true、scoreIntegrationApproved=false、historicalBacktestPerformed=false。
- EdgeOne新workflow真实run [33955042289](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/33955042289)成功，actual-source记录步骤、全量、构建和配额发布步骤通过。
- 自定义域名`radar.gfrfinradar.uk`的radar、World Order、ODP、Oil News、Oil Thermal、Bubble Watch六份核心JSON，cache-busting请求全部HTTP200且与本地committed文件逐字节相同；两份market history/metrics另已验证一致。
- FIRMS成熟基线与市场历史/指标已上线。**JSON一致不等于已采用尚未运行的新Daily解析器**：StockQ/BoA/MLF代码已发布，但生产radar快照仍是本次改代码前的值。

## 不应修改的正常状态

- MRTS13条细分原序列的最新观察全部仍为2026-06-01，数值与项目一一对应；这不是管线漏更。FRED注明8月14日更新、下一次9月16日发布；不以较新advance estimate偷换MRTS口径。[FRED原序列](https://fred.stlouisfed.org/series/MRTSSM454USN)
- World Order #83、FOMC分钟纪要旧故障、ODP官方周频链与两套AI编辑层的实施故障已在此前只读复核中恢复；本轮未制造新的阈值修改。两套编辑层仍有新闻覆盖较少的质量限制，不能称为高覆盖研究完成。

## 尚不能关闭

| 事项 | 缺什么 / 下一步 | 本轮没有做什么 |
|---|---|---|
| 公共源生产恢复 | 等原Daily排程，或owner明确允许一次现有Daily手动刷新（可能启用已配置Wind付费兜底）；之后再核验生产BDI missing、BoA8月、MLF live | 未额外启动可能付费的Daily；未手改radar快照、未额外调用DeepSeek |
| StockQ源可用性 | 静态HTML仍不含可合法直接解析的新报价，需要合规新源证据或源页面恢复 | 未解码混淆、未把收益率/过期数冒充新指数 |
| ACLED | 操作者提供新版weekly/monthly汇总XLSX；现目录仍为8月15日文件/截至7月31日月表，生产latestWeek8月14日 | 未自动访问或下载ACLED；未仅凭文件mtime改观察日 |
| Web NGrams主源切换 | v2同口径30天/120可用样本及原质量门，随后独立人工cutover审阅；旧支持中位3.03%与0未过门 | 未降低阈值/改分母、未重算旧aggregate、未换主源；最新32候选仅2条明确方向，不能保证修复后就够格 |
| ARR新鲜自动序列 | 新的同公司、同ARR/run-rate口径、可核实观察日期序列及来源审阅；固定SaaStr最后一条仍5月28日 | 未把季度收入、其他公司金额或抓取日期补作新里程碑；保留curated fallback |
| 运输高置信与商业数据 | 原7类readiness阻塞、路线/市场确认及source-rights/重分发证据，需要独立评审 | 不改既有capped评分边界；不接未授权路线运费、正式现货/结算、raw card或私贷数据 |

其余正常运维不等于待开发功能。本轮没有改变主评分公式、decision/execution/position、ODP主判词规则、AI审批边界或商业授权。原有untracked `.agents/` 与 `skills-lock.json` 始终未加入提交。
