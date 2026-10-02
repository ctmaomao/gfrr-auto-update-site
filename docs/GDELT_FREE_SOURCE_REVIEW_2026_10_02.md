# GDELT 免费来源审阅 · 2026-10-02

## 已批准范围

Owner 不付费，选择先停止 Cloud 自动请求、保留明确过期的历史证据、
验证免费候选；评分替换另行评审。本轮不新增订阅、申请延期、删除凭据、
修改现行评分/校准/权重、写生产数据、启用定时抓取或发布。

## 当前接线与不等价性

- World Order 用 Cloud v2 的国家冲突事件聚合，`gdelt-pressure-v2` 在独立
  World Order 观察分中使用这些计数；它不进入主风险分。
- GDELT DOC 是新闻检索；Web NGrams 是按文件/文档统计的短语频次。
  二者都不能直接替换国家冲突事件数、死亡人数或七日事件覆盖。
- 原始 GDELT Events 的 CAMEO 编码与 Cloud 的独立编码亦不能假定一致。
  如后续选此路线，需独立来源审阅、窗口/去重规则、校准与旧模型对照。

## 免费路线

| 候选 | 免费能力 | 本项目处理 |
|---|---|---|
| Cloud 免费网页 / API Arena | 每月 50 QU 的人工查询；到期后不包含长期 API/MCP | 不能作为自动生产来源 |
| GDELT DOC | 公开无需 Cloud 账户的新闻检索；有上游限流 | 保留现有 Oil News/Bubble Watch 路径，不新增查询 |
| Web NGrams v5 legacy | 公开下载的短语频次文件与 TOC | 复用现有手动诊断；候选验证，不晋升观察分 |
| 原始 Events/GKG 下载 | 原始公开数据，可本地加工 | 后续设计候选，本轮未下载整库或接入 |

不选 BigQuery 作为本轮路径：免费数据不意味着无限免费计算，避免引入
计费账户或扫描成本。免费文件亦须考虑下载量、磁盘与运行时间。

## 来源与账户证据

账户邮件注明 Explore evaluation 于 2026-09-23 结束、使用 11/1000 QU；
后续邮件明确 API 请求被阻断。邮箱原文未复制到仓库。
当前 Cloud 价格页区分免费网页与程序接口；一次性延长七天不能解决长期依赖。

- [Cloud 套餐](https://gdeltcloud.com/pricing)
- [Cloud 数据与独立编码说明](https://gdeltcloud.com/data)
- [原始 GDELT 免费数据](https://gdeltproject.org/data.html)
- [Web NGrams v5 文件结构与暂时性](https://blog.gdeltproject.org/using-the-new-web-ngrams-dataset-to-find-relevant-coverage/)

## 实施与验收口径

`free_only` 不依赖密钥是否存在：Cloud 网络请求为零，fresh Cloud cache 亦
不晋升为当前覆盖。优先保留带有效原时间的 previous summary，缺失时才读取
既有 Cloud cache；没有合法历史证据则 unavailable/null。历史 Cloud 数据仍
按既有 stale 折扣处理，未修改观察分公式或校准。不会输出/重写 Cloud cache。

网络 smoke 仅证明本机本时刻所探测窗口可达性，不能证明未来稳定性、全日
覆盖或 Cloud 指标等价性。生产停用必须等代码集成后才生效。

本地现有快照的离线 smoke 退出 0：网络请求为 0，原计数 1629、
原时间 `2026-09-23T01:14:09.713Z` 均保留，状态仍为 stale，
独立观察分保持 21，未产生 Cloud cache artifact；未写回生产快照。

## 免费候选实测

- `npm run diagnose:gdelt-web-ngrams -- --dry-run --no-output --max-probes 12`
  退出 0，确认无网络/无写入。
- 首次限定 12 个最近候选的 live smoke 退出 1，未找到文件；诊断读回的
  候选响应为 404。该结果只表示所探测窗口未命中。
- 扩展为既有默认 96 个探测上限后，live smoke 退出 0：
  `selectedFile=20261002074600`，`attempts=2`，
  `discovery: found=true probes=1/96`，`hits=364`，`uniqueDocCount=52`。
  文件时间为 2026-10-02 07:46 UTC。这些数字是诊断词表命中的短语/文档代理，
  不是冲突事件数，也不是 World Order 七日覆盖；不作为评分输入。
- 所有 smoke 均使用 `--no-output`，未保存原始文件或生产 JSON。
  初次未命中、随后命中符合公开文件 heartbeat/发布时间的可达性变化；
  不据此承诺连续供数。未请求 Cloud、DOC 或 BigQuery，不产生订阅费用。

本地完整检查结果见 PROJECT_BACKLOG.md 的本任务交接。
