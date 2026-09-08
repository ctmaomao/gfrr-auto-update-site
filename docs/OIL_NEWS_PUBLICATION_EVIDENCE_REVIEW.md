# 新闻原文时间证据：离线复核

## 范围与依据

Owner 于 2026-09-08 批准按建议连续实施、逐项校验/commit+push，并授权独立 AI 审阅通过后合并。本刀基于 #317 合并后的 main `e7a70307`；只实现本地证据包的核对，不抓发布者网站、不补写生产时间、不修改分类器/telemetry/cache/cohort/质量阈值。属于既有新闻链的 `artifact_sanitizer_layer`，没有独立数据管线或调度。

[ADR-0031](ADR/0031-web-ngrams-time-provenance.md) 的 Web `publishedAt=null` 继续有效。[Schema.org datePublished](https://schema.org/datePublished) 与 [dateModified](https://schema.org/dateModified) 语义不同；[Google Article 文档](https://developers.google.com/search/docs/appearance/structured-data/article)也分别描述发布和修改时间。这些字段的定义不能证明任意网页声明真实，更不授予采集该网页的权限。

本次只读验收已确认自然运行 [34189473112](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34189473112)（2026-09-08，schedule，success）生成 v5，不能再写作“等待首个 v5”。其脱敏 artifact `10041810753`（26,939 bytes，仅内存检查）对应 pair `20260908050100`：38 个 Web 候选，原文时间全部未知；TOC 时间有效且可比较 38，但同方向可比较候选、metadata 独立支持及跨 provider 支持均为 0。**补时间不是当前样本达标的充分条件。** 没有触发新闻/Daily/收费刷新。

## 输入契约

[`reviewPublicationEvidence`](../scripts/oil-directional/oil-news-publication-evidence.mjs) 接受 UTF-8 JSON 字符串或 Buffer，最多 256 KiB、100 个不同文章候选、每篇 16 条声明。对象均为闭合字段，未知字段/类型/版本、重复候选、超限或非法 UTF-8 拒绝。没有路径、凭证、批准字段、正文或标题字段。

```json
{
  "schemaVersion": "oil-news-publication-evidence-input-v1",
  "reviewedAt": "2026-09-08T10:00:00Z",
  "candidates": []
}
```

这是合法的空输入控制，不是已采集的证据。非空 `candidates` 中每项只含：

- `canonicalUrlHash`：既有 `buildArticleIdentity({url})` 得出的 64 位小写 SHA-256，不是标题 hash。
- `datasetObservedAt`：已知数据集观测时间，严格绝对 ISO 时间，不能晚于明确传入的 `reviewedAt`。
- `evidence`：每条只含 `kind`、`articleUrl`、`value`、`capturedAt`、`contentSha256`。URL 最多 4096 字符，时间原值/采集时间最多 128 字符；`value` 可为 null，内容摘要须 64 位小写 SHA-256。

`kind` 分区（新增类型需单独审阅，不自动猜测）：

| 类型 | 能否产生待审发布时间候选 |
|---|---|
| `publisher_jsonld_date_published` / `publisher_meta_published_time` / `publisher_visible_published_time` | 可以，但只是操作者声称的发布者声明，不认证身份 |
| `publisher_date_modified` / `feed_timestamp` / `search_reported_time` | 不可以 |
| `toc_timestamp` / `dataset_observed_at` / `http_last_modified` | 不可以 |

本工具不解析 HTML/JSON-LD/HTTP 日期，不运行脚本、不访问 URL、不从 hash 反查地址。证据须由操作者从合法持有且同文章的原件提取；不能把只有日期的字段加上虚构时区或 00:00:00。原文只有日粒度、相对时间或未披露时区时，应保留缺失，不伪造成此窄契约的绝对时间。类型、内容 hash、reviewedAt/capturedAt 都是调用方声明；本工具不验证内容原件或可信时间戳。

## 判定与隔离

- URL 必须 HTTPS、无凭证/非默认端口/空白控制字符；先拒绝危险格式再复用现有归一化。既有 `www`、tracking query、fragment 归一化不变，有业务含义的 query 仍参与文章 hash。身份不匹配不能借同标题补位。
- 时间复用严格日历/显式时区解析。无效时间、采集晚于审阅、时间晚于采集、发布声明晚于数据集观察均明确标记；不输出非法日期原值。任何无效条目都阻断该文章的候选时间。
- 多个有效发布声明只要标准化时间不同即冲突，不取最早/最晚、不按声明类型优先覆盖。等价时区不误报冲突。完全重复声明折叠，记录 occurrences；多个声明不等于多个独立来源。
- 采集晚于历史数据集观察的条目标记 retrospective；如果所有有效发布声明均如此，状态为 `retrospective_publication_candidate`。即使另有更早的声明，也不授予历史补写或质量资格。
- 无发布声明时 `no_publication_evidence`，无效为 `evidence_invalid`，冲突为 `conflicting_publication_claims`；一致声明最多为 `publication_candidate_unverified`。候选时间不是生产 `publishedAt`。
- 输出只含规范时间、固定状态/理由、hash 和次数，不回显 URL/正文/标题或异常。hash 只绑定输入，不保证隐私加密、来源真实性或再分发权利。
- 全部输出及每篇记录固定 `sourceAuthenticity=unverified`、`publicationFreshnessQualified=false`、`usedForQualityGates=false`、`productionEligible=false`、`baselineUpdated=false`、网络/生产写入次数 0。CLI 退出 0 只表示输入经过复核，不代表存在证据或可晋升。

CLI 为 [`node scripts/review-oil-news-publication-evidence.mjs`](../scripts/review-oil-news-publication-evidence.mjs)，只从 stdin 读合法持有的证据 JSON、向 stdout 输出脱敏报告，不接受任何参数。不提供网络、写文件、生产回填或批准开关；错误只输出 `publication_evidence_invalid` 和关闭的边界并退出 1。调用方若自行保存报告，仍不得导入生产或当作来源许可。

## 验证与后续

[回归](../tests/unit/oil-news-publication-evidence.test.mjs)覆盖完整类型分区、等价时区、冲突、身份/凭证、缺失/非法/未来时间、回溯采集、重复、闭合字段/伪造批准/容量、真实 CLI 无 fetch 与错误脱敏。纳入既有 shadow classifier 检查，不改旧断言；ADR-0031 的生产零晋升和历史 v2–v5 契约继续运行。

当前没有获准持有的对应原文证据包，历史脱敏 artifact 的 URL hash 不能恢复原文。本刀不虚构真实正例；后续自动 resolver 仍需具体发布者/合法读取通道、内容与时间语义核验、有界读取的独立实施评审。再决定是否建立新质量 cohort；原 30 天/120 样本、同事件/独立来源/全候选分母和切源评审不变，不重写旧历史。没有这些输入前继续加抓取器或补齐日期是不安全的，故停留在离线复核。
