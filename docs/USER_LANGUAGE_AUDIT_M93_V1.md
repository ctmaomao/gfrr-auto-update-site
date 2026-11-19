# M-93 V1 用户语言审计报告

这是 2026-05-24 对旧版首页（`28.0M-92AV`）面向不熟悉金融术语的中文读者所做的静态文案审计，不是现行 UI 验收、开发清单或修改授权。原始位置、数字与 checker 行号都属于当时快照。[旧版文档状态](LEGACY_DOCUMENT_STATUS.md#retired-summary-designs)说明退役范围；现行界面依据 [DESIGN](../DESIGN.md)、[M-94 数据契约](M94_V0_DATA_CONTRACT.md)和实际代码，当前任务只查[工作表](PROJECT_BACKLOG.md#active-worktable)。

完整记录未改写：[固定提交原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md) · [下载原始 Markdown](https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md)。原文 244 行、39,004 字节；SHA-256 `6ab5f0ba83ccf9171069ccfee3cefc01b986bcad205342325f31bc64d935ada6`。

## Section 1 · Executive Summary

识别出 29 项工程术语、50 个金融英文缩写、覆盖 5 类数据的 15 个原始数据样本，以及 36 项行话和状态短语。对当时首页 14 个区块的评估为 5 个极严重、6 个严重、2 个中度、1 个轻度。 [查阅原节](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md#L9-L23)。

## Section 2 · 工程师术语清单

记录 `audit-only`、`Worker`、缓存版本等工程术语的出现位置，以及它们为何不能直接帮助读者理解风险。 [查阅原节](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md#L24-L57)。

## Section 3 · 金融英文缩写清单

保留缩写、全称与出现位置，例如 BGCR、TGCR 和 ON RRP。查术语时读原表，不把旧代码行号用作现行定位。 [查阅原节](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md#L58-L112)。

## Section 4 · 未解释原始数据清单

记录 Brent 曲线、高收益信用利差、回购利差、房地产代理等旧数值与解释示例。例值和建议措辞不是现行读数、来源资格或判断规则。 [查阅原节](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md#L113-L132)。

## Section 5 · 金融行话与状态短语清单

区分数据是否可用、压力是在上升还是扩散、以及风险是否已被确认。旧状态词和对应断言留作溯源，不从本表恢复旧公开建议。 [查阅原节](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md#L133-L173)。

## Section 6 · 影响范围矩阵

原矩阵按旧首页 14 个区块比较四类问题；旧总判断、压力来源、宏观驱动、详细数据和执行风控尤其难懂。严重度是当时的阅读评估，不是当前市场风险。 [查阅原节](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md#L174-L204)。

## Section 7 · 与现有 contract checker 的冲突预警

原文记录 15 项当时的文案、DOM、布局及其他断言冲突。现行检查以代码为准；不能因口语化把缺失写成零或正常、把观察写成已确认危机，或把解释改成交易/仓位建议。 [查阅原节](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md#L205-L235)。

## Section 8 · M-93 V2 spec 候选方向

原文比较了四种候选：只留高层解读、原始值与一句话解读并列、默认折叠专业明细、按需解释术语。这些是当时的备选方案，不代表采用或批准。 [查阅原节](https://github.com/ctmaomao/gfrr-auto-update-site/blob/de6a4b4b7289ed2a35a1be51eda963007bffa636/docs/USER_LANGUAGE_AUDIT_M93_V1.md#L236-L244)。
