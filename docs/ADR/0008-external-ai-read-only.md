# ADR-0008 — External AI is read-only display layer

**Status**: Accepted (v28.0J → v28.0L production staged rollout)

## Context

项目可选接入 DeepSeek / OpenAI 等 external AI provider 生成解释层文本。但
LLM 输出有以下风险:

- 不确定性:相同输入可能产生不同输出
- 幻觉:可能引用不存在的数据字段或编造数字
- prompt injection:外部数据源被攻击者植入恶意指令
- 漂移:provider 模型升级后语义可能变化

如果让 LLM 输出直接影响 scoring/decision,会让一份严格基于公开数据的金融
风险简报变成不可审计的黑盒。

## Decision

**External AI 是只读展示层** (`externalAiInterpretationLayer`),严格边界:

1. **不影响 scoring / decision / execution / position / Action Queue /
   Trigger Monitor / Invalidation Rules**
2. 与 rule-based `aiInterpretationLayer` 并行存在,**不替换** rule-based 层
3. 当前默认 `generatedByExternalAi=false`、`usesExternalAiApi=false`,
   不调用任何 provider
4. Manual / staged rollout 通过 `external-ai-production-refresh.yml` workflow,
   产物写入 `externalAiInterpretationLayer` 但有以下守护:
   - `check:external-ai-output` validator (offline)
   - `check:external-ai-production-contract` (schema)
   - `check:external-ai-production-write-guard` (write protection)
   - `review:external-ai-artifact` (manual review)
   - `unsafe wording validator` (禁用文案)
5. `promotionEligible` 必须保持 `false`,直到独立 integration PR 明确改变
6. **不得复述具体 execution / position / exposure / cash buffer 字段**

## Consequences

- ✅ LLM 输出可在任何时刻被禁用 (toggle flag),决策不受影响
- ✅ 即使 LLM 输出离谱,主决策契约依然可审计
- ✅ Provider 切换 (DeepSeek ↔ OpenAI) 不影响主链路
- ❌ External AI 永远不能成为 "AI 选股工具" 的卖点
- ❌ Manual artifact 不能直接 promotion;每次接入都要经审计

⚠️ **NEVER** 让 external AI 输出直接影响 scoring / decision / execution / position。
⚠️ **NEVER** 把 manual artifacts 当作 production data,不得复制进
`data/radar-data.json`。
⚠️ **NEVER** 通过削弱 unsafe wording validator 让 artifact 通过。

## References

- `docs/EXTERNAL_AI_API_DESIGN.md`
- `docs/EXTERNAL_AI_PRODUCTION_INTEGRATION_DESIGN.md`
- `docs/EXTERNAL_AI_PROMPT_CONTRACT.md`
- v28.0L 系列 staged rollout (见 MILESTONE_INDEX.md)
