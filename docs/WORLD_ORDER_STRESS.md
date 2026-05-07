# World Order Stress Overlay

`v28.0H-1` 新增 World Order Stress Overlay 数据管道 MVP。该层用于识别长期结构性风险是否上升，以及市场是否已经部分确认该风险。它是 regime overlay / 结构性状态修正器，不是第七个底层风险模块。

## 定位边界

本模块不预测战争，不输出战争概率，不使用煽动性语言，也不直接修改现有 `decisionModel`、仓位、Action Queue 或 Worker runtime。最终前端只应读取 `data/world-order-stress.json`，不应直接调用外部 API。

禁止把结构性压力描述成确定性事件、概率倒计时或阶段进度。允许说明“不预测战争”“不输出战争概率”“不构成战争预测或投资建议”。

## 六个维度

- 和平红利退潮：观察军费慢变量、地缘模块和冲突报道是否共同抬升。
- 阵营化与联盟硬化：观察制裁、关键通道、区域阵营与脱钩压力。
- 多战区冲突：观察多个区域是否同时出现冲突压力。
- 经济金融武器化：观察制裁、出口管制、金融限制和执法活动。
- 资本管制与金融抑制风险：观察跨境限制、金融压力与流动性压力组合。
- 市场确认：观察黄金、Brent、VIX、DXY、HY OAS、SPX 等是否已经部分定价结构性风险。

## 五档状态

| state | 中文标签 | 分数 |
|---|---|---|
| `normal_globalization` | 全球化正常期 | 0-20 |
| `friction_rising` | 摩擦升温期 | 21-40 |
| `bloc_fragmentation` | 阵营化与脱钩期 | 41-60 |
| `multi_theater_stress` | 多战区压力期 | 61-75 |
| `war_economy_stress` | 战争经济压力期 | 76-100 |

这些状态只描述结构性压力层级，不等同于战争预测。

## 外部数据源

### GDELT

GDELT DOC 2.0 提供无需 API key 的新闻报道代理指标。H-1 查询战争、冲突、制裁、封锁、台湾、乌克兰、俄罗斯、伊朗、中东、红海、南海和朝鲜等主题，并输出压缩后的摘要。ACLED 未配置时，冲突事件层由 GDELT 代理估算。

### GDELT 稳定性与缓存策略

v28.0H-2C 加入 GDELT query throttle / partial success / stale cache fallback / 429 handling。GDELT 是 ACLED 未配置时的冲突事件代理数据源，因此构建脚本使用少量组合 query、串行请求和轻量 throttle，降低 GDELT 429 风险。

GDELT status 规则：

- `ok`：核心 query 多数成功，并生成非空摘要。
- `partial`：至少一个 query 成功，即使其它 query 失败或出现 429，也使用成功数据生成当前摘要。
- `stale`：本轮 query 全部失败，但旧 `data/world-order-stress.json` 中有可复用 GDELT summary；此时使用缓存并记录 cache reason。
- `error`：本轮 query 全部失败且没有旧 summary 可用。

`partial` / `stale` 会降低 confidence，但不会让模块崩溃，也不会把单个 429 伪装成成功。

### OFAC

OFAC Recent Actions 用于观察制裁清单更新、执法、General Licenses、Regulations and Guidance 等经济金融武器化信号。页面结构变化或抓取失败时，管道不会崩溃。

### SIPRI

SIPRI 是慢变量。H-1 只提供 importer / manual cache 框架，默认 `manual_required`，不会伪造军费趋势。后续导入标准化 SIPRI 数据后，可提高和平红利退潮维度置信度。

### SIPRI 手动标准化导入

v28.0H-3 支持 SIPRI manual normalized import。SIPRI 是慢变量，不需要盘中更新；只有用户手动准备并校验过的真实 normalized 数据才会参与评分。

真实数据文件路径：

```text
config/world-order-sipri-normalized.json
```

示例模板：

```text
config/world-order-sipri-normalized.example.json
```

模板包含 `exampleOnly` / `notForScoring`，示例数据不会参与评分。真实文件必须设置 `quality.isRealData=true`，并保留来源、方法说明、年份、全球军费趋势、主要大国和地区趋势等字段。Importer 会拒绝 example/template、`notForScoring` 或 `quality.isRealData !== true` 的文件。

未导入真实数据时，页面继续显示“SIPRI：慢变量 / 需要手动导入”。导入合法后，SIPRI 会影响 `peaceDividendRetreat` 维度和 confidence，并生成中文 evidence。不得伪造 SIPRI 数据，也不得把模板数据改名后当作真实宏观数据。

### ACLED

ACLED adapter 已预留。需要配置：

```bash
ACLED_EMAIL=<email>
ACLED_API_KEY=<key>
```

也支持：

```bash
ACLED_ACCESS_KEY=<key>
```

未配置时输出 `enabled=false`、`status=not_configured`，并说明当前冲突事件层由 GDELT 代理估算。

## 缓存与失败策略

- 单源失败不覆盖旧成功缓存为空。
- 如果旧 `data/world-order-stress.json` 中有该源摘要，本轮可沿用旧摘要并标记 `stale`。
- 如果没有旧缓存，则输出明确 empty summary，并标记 `error` / `manual_required` / `not_configured`。
- 外部源失败会降低 `confidence`，但不会阻止最终 JSON 生成。
- 不允许输出 `NaN`、`undefined` 或空白字段。

## 构建与检查

`npm run build:world-order` 用于显式刷新 World Order Stress 数据。它会访问 GDELT / OFAC / SIPRI / ACLED adapter，并写入 `data/world-order-stress.json`。因此 build:world-order is manual / explicit because it fetches external data and writes data/world-order-stress.json。

`npm run check:world-order` 只验证现有 `data/world-order-stress.json` 的结构、枚举、分数范围、证据字段和禁止文案，不抓取外部数据，不重写数据文件。

`npm run check:all` 已集成该检查：check:all includes check:world-order。正常 CI / 本地检查会验证 world-order-stress 数据产物，但不会自动刷新外部数据。

## v28.0H-4 手动刷新与工作流准备

当前 World Order Stress 使用手动刷新，不自动刷新，不新增 scheduled workflow。scheduled refresh 后续再评估，因为 GDELT 仍可能 timeout / 429，外部源刷新频率不应过高，先观察手动刷新稳定性。

手动刷新：

```bash
npm run build:world-order
```

`build:world-order` 会访问 GDELT / OFAC / SIPRI / ACLED adapter，并写入 `data/world-order-stress.json`。构建完成后会输出 World Order Stress Build Summary，包含 score、state、confidence、freshness、GDELT / OFAC / SIPRI / ACLED 状态、marketConfirmation 输入源和 warnings。

本地检查：

```bash
npm run check:world-order
npm run check:all
```

`check:world-order` 只验证本地 JSON，不访问外部源，不写文件。H-4 起检查通过时会输出 PASS summary，便于确认 freshness、marketConfirmation source 和四个外部源状态。

人工审阅：

```bash
npm run review:world-order
```

`review:world-order` 是只读 helper，不替代 `check:world-order`。它输出 PASS / WARN / FAIL 和建议动作，用于人工判断是否需要再次手动刷新、提供 SIPRI normalized data 或配置 ACLED credentials。

GDELT stale / partial 可接受条件：

- `partial`：至少一个 query 成功，status 明确，使用成功 query 生成当前摘要，confidence 降低。
- `stale`：当前全部 query 失败，但 `usedCachedSummary=true`，使用旧 summary，记录 cache reason，confidence 降低。

SIPRI `manual_required` 可接受：真实 normalized 数据未导入时，不伪造慢变量。ACLED `not_configured` 可接受：未提供 API credentials 时，GDELT 作为代理冲突事件层。

## H-2 前端展示

H-2 前端展示新增独立的“世界秩序压力层”区域，显示状态、压力分数、市场确认、主导驱动、六个维度、数据源状态、系统解读和免责声明。该区域只读展示 `data/world-order-stress.json`，并在读取失败或字段缺失时显示保守 fallback，不输出空白卡片、`NaN` 或 `undefined`。

前端只读取 data/world-order-stress.json。前端不调用外部 API，也不访问 GDELT、OFAC、SIPRI、ACLED 或其它外部数据源。外部源只由显式的 `npm run build:world-order` 管道处理。

H-2 不接入 decisionModel，不改变仓位、Action Queue、Trigger Monitor、Invalidation Rules 或 Worker-first realtime 逻辑。所有用户可见文案必须中文、克制、不预测战争、不输出战争概率。

## 市场确认输入源

v28.0H-2B 对齐 World Order marketConfirmation 与主站 Worker-first 链路。marketConfirmation 优先使用 Worker-generated preview：构建脚本显式读取 `/market.worker-preview.json`，并要求 HTTP 200、`sourceMode="worker-generated-preview"`、未 unavailable、`healthScore >= 85`、`criticalMissing <= 1`、`updatedAt` 可解析、`ageMinutes <= 15` 且 `values.brent` 为正数。

如果 Worker 输入不可用，fallback 到 local realtime，即仓库内 `realtime/market.json`。如果 local realtime 也不可用，再 fallback 到 Daily baseline，即 `data/radar-data.json` 的 `displayInputsBaseline`。

最终 `data/world-order-stress.json` 会写入 `marketConfirmationInput.source`、`updatedAt`、`ageMinutes`、关键市场值、Brent 来源与 fallback reason。若页面市场确认与主页面快变量不同，应先检查 `data/world-order-stress.json` 的 `marketConfirmationInput.source` / `marketConfirmationInput.updatedAt`，确认本次数据构建使用的是 Worker、local realtime 还是 Daily baseline。

前端仍只读取 data/world-order-stress.json，不直接调用 Worker、GDELT、OFAC、SIPRI、ACLED 或任何外部 API。

## 与 decisionModel 的关系

H-1 只输出：

```text
decisionModifier
```

它描述未来是否可以作为状态上修参考，但本轮不接入 `decisionModel`，不改仓位，不改 action queue。

规则：

- `score < 40`：`riskBias=neutral`，`maxStateBoost=0`
- `40 <= score < 61`：只增加解释，不修改状态
- `61 <= score <= 75` 且市场至少 `partial_confirmed`：`riskBias=upward`，`maxStateBoost=1`
- `score > 75` 且市场 `high_confirmed`：`riskBias=upward`，`maxStateBoost=1`

## 后续可扩展数据源

- WTO
- Global Trade Alert
- UN Comtrade
- IMF trade data

## 为什么不输出战争概率

公开数据源不足以稳定、可审计地支持战争概率判断。该层只做结构性风险识别和市场交叉验证，避免把长期压力误读成确定性事件预测。
