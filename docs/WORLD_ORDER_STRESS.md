# World Order Stress Overlay

`v28.0H-1` 新增 World Order Stress Overlay 数据管道 MVP。该层用于识别长期结构性风险是否上升，以及市场是否已经部分确认该风险。它是 regime overlay / 结构性状态修正器，不是第七个底层风险模块。

## 定位边界

本模块不预测战争，不输出战争概率，不使用煽动性语言，也不直接修改现有 `decisionModel`、仓位、Action Queue 或 Worker runtime。最终前端只应读取 `data/world-order-stress.json`，不应直接调用外部 API。

禁止输出：

- `WW3 已确认`
- `世界大战即将爆发`
- `世界大战概率`
- `第三次世界大战已确认`
- `13 步已走`
- `世界大战第几步`

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

### OFAC

OFAC Recent Actions 用于观察制裁清单更新、执法、General Licenses、Regulations and Guidance 等经济金融武器化信号。页面结构变化或抓取失败时，管道不会崩溃。

### SIPRI

SIPRI 是慢变量。H-1 只提供 importer / manual cache 框架，默认 `manual_required`，不会伪造军费趋势。后续导入标准化 SIPRI 数据后，可提高和平红利退潮维度置信度。

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
