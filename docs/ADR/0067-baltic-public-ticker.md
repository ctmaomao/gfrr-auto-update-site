# ADR-0067：公开 Baltic 聚合指数与准确来源迁移

## Status

Owner-authorized on 2026-10-11; independent contract review required before runtime migration.

## Context

StockQ 的 BDTI/BCTI 缓存仍为 2026-08-10，BDI 缺失。Baltic 官方首页的公开客户端脚本 `components/page/basepage/clientlibs.min.js` 调用 `https://blacksun-api.balticexchange.com/api/ticker`。本轮直接 GET 返回 200、4470 字节 JSON，其中 BDI=2917、BDTI=7964、BCTI=2403，各自 current.indexDate 为 2026-10-09，并有 previous.value/indexDate。

用户明确要求自动采集、缓存、公开发布，并说明个人研究用途、接受法律风险、不以官方许可或有效订阅作为本任务的前置条件。这是 owner 对本项目旧接入条件的窄范围修订，**不是数据权利方授权，也不宣称个人研究或风险接受能消除第三方条款**。官方 [Data Policy](https://www.balticexchange.com/en/site-services/data-policy.html) 保留为已知限制。只处理 BDI/BDTI/BCTI 聚合指数，不改旧 route-level source-rights fixtures、TD/TC 路线确认或其它源的限制。

## Decision

1. 先以独立 reviewed PR 扩展来源契约，随后才实施采集与展示。保留旧 `StockQ:BDTI; StockQ:BCTI; StockQ:BDI`，只增加 `BalticExchangePublicTicker`。三项来源按 BDTI/BCTI/BDI 固定顺序登记，允许且仅允许两种提供方的八种组合；不允许任意字符串、其它指数或未知提供方。其余 validator 数值、日期、比例、状态与 route-level 断言保持原样。
2. Runtime 属于既有 daily_history_layer：一次公共 ticker GET，8 秒总超时、64 KiB 上限、零重试、禁止重定向；不登录、不绕过访问控制、不调用收费服务。每个指数独立核验身份、正整数、真实日期、最多七天 freshness，坏项不污染其它项。失败才使用既有 StockQ 路径及 last-good 缓存，缺失不变零，不把采集时刻写成观测日期。
3. `indexDate` 无时区的时间不伪装成已知 UTC 时刻；只保留经过日历校验的原观测日，以 UTC 零点表示日期。涨跌幅只从有效、较早且相邻期距不超过七天的 previous 值计算；无合格上一期则 null，不拼接旧涨跌。
4. 输出保持 `macroDrivers.shippingFreight` 原字段形状，source 各项准确反映新值或沿用缓存的来源。只保存三指数紧凑值/日期/涨跌比例，不能留存或公开整个原始数据集。网站读已发布 JSON，不在浏览器直接请求第三方。
5. 只恢复 broad freight context；不接入 scoring、decision、execution、position、Brent、ODP、cross-validation 或 routeFreightConfirmation。保留 `not_connected`。

## Consequences and acceptance

这不是官方承诺支持的 API，没有可用性保证；结构变化、限流、封禁或过期时按既有 fallback/missing 降级。周末沿用上一个交易日不改日期。无需镜像或周报推导，也不新增依赖、服务、密钥或 schedule。

验收须包括：未知来源/符号拒绝，真实响应结构离线回归，逐项失败隔离，日期及涨跌校验、超时/大小/重定向保护，单次实时读取，既有缓存来源不被洗成新提供方，以及正常 Daily 发布后两站展示。不得手改生产 JSON 伪装恢复，不得运行 DeepSeek 或额外付费链。
