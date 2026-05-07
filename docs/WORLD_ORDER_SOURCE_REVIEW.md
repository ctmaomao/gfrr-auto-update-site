# World Order Source Review

`v28.0H-4A` 是 GDELT timeout diagnosis / source alternatives review。本轮不接入新外部源，不改变 production scoring，不写 `data/world-order-stress.json`。

## 当前结论

GDELT DOC 2.0 仍是 World Order Stress 第一版主代理源，但应先用 `npm run diagnose:gdelt` 判断 stale 的主要原因：query 太重、GDELT / 网络可用性、rate limit，还是本地 runtime 网络问题。诊断结果再决定后续是否继续优化 GDELT query、改为更轻 query、增加备用公开源或暂缓 scheduled workflow。

## 候选源评审

| Source | 用途 | API key | 自动抓取 | 适合当前 v28.0H | 风险 | 推荐状态 |
|---|---|---|---|---|---|---|
| GDELT DOC 2.0 | 新闻报道代理、冲突和制裁主题密度 | 否 | 是，但需节流 | 是 | 429、timeout、query 复杂度敏感 | keep |
| GDELT Context 2.0 | 更轻的 article-level fallback / context signals | 否 | 可能 | 后续评估 | contract 与字段稳定性需验证 | later |
| GDELT Events / GKG files | 事件 / 知识图谱批处理 | 否 | 可批处理 | 暂不适合 | 数据量大、解析复杂、对小型站点过重 | later |
| ACLED API | 冲突事件层、区域事件密度 | 是 | 是 | 等 credentials | 需要 key、许可和配额 | requires_key |
| ReliefWeb / humanitarian feeds | 冲突和人道事件备用公开源 | 多数无需 key | 可能 | 需另开版本验证 | 语义与 World Order scoring 需校准 | later |
| OFAC / sanctions feeds | 制裁、金融限制、经济武器化 | 否 | 是 | 当前已接入 | 页面结构变化 | keep |
| SIPRI manual slow variable | 军费慢变量、和平红利退潮 | 否，手动 | 不适合高频自动 | 当前已支持 manual normalized import | 手动数据质量依赖人工 | keep manual |
| WTO / Global Trade Alert / UN Comtrade / IMF trade data | 贸易、阵营化、供应链慢变量 | 视来源而定 | 后续批处理 | 不急 | 口径复杂、时滞、字段映射需评审 | later |

## 推荐路径

1. 继续保留 GDELT DOC 2.0 作为 first-line public proxy。
2. 先使用 `diagnose:gdelt` 判断当前 stale 是否来自 production query complexity、rate limit 或网络可用性。
3. ACLED 等用户提供 credentials 后再接入。
4. ReliefWeb / GDELT Context 2.0 可作为 later fallback 候选，但必须另开版本验证，不直接进入 scoring。
5. WTO / Global Trade Alert / UN Comtrade / IMF trade data 更适合贸易和阵营化慢变量，后续另开 slow-variable pipeline。

`not_now` 表示该来源或接入方式当前不应进入 production scoring，需要先完成单独诊断、字段契约和稳定性验证。

## v28.0H-4B ReliefWeb Probe

ReliefWeb 目前只作为 feasibility probe。本轮不接入 scoring，不写 data/world-order-stress.json，不修改 `build:world-order`，也不改变当前正式 World Order 数据链路。

只读诊断命令：

```bash
npm run diagnose:reliefweb
```

诊断枚举解释：

- `reliefweb-currently-healthy`：ReliefWeb API 可访问，至少两个 probe 成功且有匹配报告。
- `reliefweb-query-too-narrow`：API 可访问，但当前 query 大多没有匹配，需要扩大关键词或测试 country/theme filters。
- `reliefweb-network-or-availability`：多数请求 timeout、fetch error 或访问被阻断，当前不适合接入。
- `reliefweb-rate-limited`：429 较多，应保持手动 probe，不适合 scheduled use。
- `reliefweb-api-contract-changed`：HTTP 200 但响应结构不符合预期，需要先更新 adapter contract。

如果未来接入，应另开版本，例如 `v28.0H-4C ReliefWeb Fallback Adapter`。ReliefWeb 更适合做人道 / 冲突报告密度 proxy，但不能替代 ACLED 的政治暴力事件结构数据。

任何 production integration 都必须先完成：

- adapter
- normalized summary
- cache fallback
- confidence impact
- check-world-order contract
- UI source status

当前 H-4B probe 结果：`diagnosis=reliefweb-network-or-availability`。当前网络下 ReliefWeb reports API 快速返回 HTTP 406，并提示 blocked due to bot activity；未获得可用于 feasibility 判断的 reports JSON。脚本使用当前可用的 ReliefWeb reports endpoint 版本进行探测，v1 endpoint 已不适合作为后续 adapter 假设。建议暂不接入 ReliefWeb；后续如另开 `v28.0H-4C ReliefWeb Fallback Adapter`，应先确认可用 appname / runner 网络 / API contract。
