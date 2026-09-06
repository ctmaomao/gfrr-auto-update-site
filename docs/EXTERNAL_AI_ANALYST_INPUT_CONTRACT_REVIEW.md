# External AI Analyst Input Contract Review — PR0

> **STATUS (2026-08-11):** Historical source-review / design-contract for the legacy `externalAiInterpretationLayer`. The former visible panel and scheduled production refresh have been retired; the field remains only for data compatibility/manual diagnostics. Current visible homepage AI is the separate `macroRiskEditorialLayer` governed by `MACRO_RISK_EDITORIAL_DESIGN.md`, `DATA_CONTRACT.md`, `OPERATIONS.md`, and ADR-0022.

> **Hard boundary:** `externalAiInterpretationLayer` is now a non-visible legacy compatibility field. Neither it nor the current `macroRiskEditorialLayer` may affect scoring, `decisionModel`, `executionLock`, `positionGuidance`, `values.*`, Brent promotion, Action Queue, Trigger Monitor, Invalidation Rules, Worker runtime, Daily scoring, or portfolio / execution logic. `qualityReview.promotionEligible=false`, `provenance.humanApproved=false`, and all `boundaries.affects* = false` remain mandatory.

本文是 External AI Auxiliary 的 **PR0 design-contract / source-review**。目标不是把外部 AI 变成数据源,也不是让它接外部新闻 / 行情;目标是把当前过薄的 site-structured input 升级为一个受控的 **analyst evidence-pack**,让 provider 对站内已有结构化数据做更深的跨层综合、背离侦测、情景倾向和数据质量加权判断。

PR0 只锁定契约与迁移纪律。后续实现必须另开 PR,按 serial trunk 小步推进。

---

## 0. Scope / No-Go

本 PR0 只允许新增本文档。

**本 PR0 不批准:**

- 修改 `scripts/*.mjs`、`scripts/modules/*`、`.github/workflows/*`、`data/*.json`、`realtime/*.json`、`index.html`、`assets/*`。
- 调用 provider、读取 API key、运行 DeepSeek / OpenAI、写 `manual-artifacts/` 输出、写 `data/radar-data.json`。
- 改 `externalAiInterpretationLayer` 的 production data contract。
- 改 scoring / decision / execution / position 任一路径。
- 改 frontend 或 asset cache version。
- 本次 input-contract 审阅不自动授权远端 Git 操作；本地 Git 与后续已授权操作按根 AGENTS.md 的 Git 分级授权执行（2026-09-06 owner supersession），provider/secret/生产边界不变。

---

## 1. Current State Confirmed From Code

### 1.1 Input builder is narrow

`scripts/build-external-ai-manual-input.mjs` currently has two extraction modes:

- `extractCompactSiteData(...)` only sends `macroDrivers.consumer` under `siteData.macroDrivers`.
- `extractSiteData(...)` also only sends `macroDrivers.consumer`; the non-compact path is not a full rich radar-data dump.

Therefore the current provider input sees only a small subset of the site's macro-driver richness. The issue is not merely "compact mode is too compact"; the current input contract itself is early-stage and consumer-centric.

### 1.2 Prompt sourceLayer allowlist is old

`scripts/run-external-ai-manual-test.mjs` currently instructs provider output that `sourceLayer` must be one of:

`dailyBrief`, `divergenceLayer`, `brentPricingLayer`, `macroDrivers.consumer`, `aiInterpretationLayer`, `dataHealth`, or `decisionContext`.

This blocks faithful attribution to newer evidence layers such as full `macroDrivers.*`, `modules`, `regimeProbabilities`, `scenarioTree`, `transmissionChain`, ODP, World Order, and Market Pricing.

Provider call defaults are currently:

- provider model default: `deepseek-v4-flash`
- `temperature: 0.2`
- `max_tokens: 2400`
- JSON response mode

This document does not change those values. Any model-tier or token-budget change belongs in PR2 canary evidence, not PR0.

### 1.3 Production path is hard-locked to local_compact

The production refresh path is a contract migration problem, not a field-add problem:

- `.github/workflows/external-ai-production-refresh.yml` builds `manual-input-compact-latest.json` with `--compact`.
- The workflow input only allows `input_source=local_compact`.
- `scripts/validate-data.mjs` asserts the current production layer contract version, `sourceMode='manual_local_compact'`, `model='deepseek-v4-flash'`, and `inputSource='local_compact'`.
- `scripts/check-external-ai-production-contract.mjs` currently allows only `manual_artifact`, `manual_local_compact`, or `disabled` source modes, and only `local_compact`, `fixture_sample`, or `null` input sources.
- `scripts/project-external-ai-production-dry-run.mjs` maps site data projection to `sourceLayer='local_compact'` when item-level source metadata is absent.

Any future production analyst input must migrate these contracts deliberately using expand-then-contract.

### 1.4 Historical production layer was visible but non-impacting

At the time of this review, `externalAiInterpretationLayer` was visible read-only output written by `External AI Production Refresh`. That path is now retired; the following guards remain relevant to legacy/manual validation:

- visible only when display state and quality/freshness gates pass.
- `qualityReview.promotionEligible=false` always.
- `provenance.humanApproved=false` always.
- no scoring / decision / execution / position impact.
- output must pass structural validation, production contract validation, quality review, write guard, and frontend display guard.

---

## 2. Proposed Source Mode And Contract Version

### 2.1 New names

Future analyst input should use:

- `sourceMode`: `manual_analyst_compact_v1`
- `inputSource`: `analyst_compact_v1`
- `sourceSemantics`: `site_structured_analyst_evidence_pack_v1`
- input artifact version: `v28.0L-external-ai-analyst-input-v1`
- production schema candidate: `v28.0L-external-ai-production-analyst-1`

The production schema candidate is intentionally a new string rather than a silent reinterpretation of `v28.0L-external-ai-production-1`.

### 2.2 Expand-then-contract migration

PR3 must use expand-then-contract:

1. Expand validators and production projection to accept both legacy `local_compact` and new `analyst_compact_v1`.
2. Keep the existing production refresh path able to fall back to `local_compact`.
3. Run the new path through canary and at least one stable Daily / refresh observation.
4. Only after production refresh is stable, consider contracting away legacy `local_compact` in a later PR.

Reason: for source / mode / enum migrations, local `check:all` only validates committed data. It can go green while a later Daily / production refresh fails when new source-mode data is generated. Validators should accept old + new during transition, then contract only after generated production data proves stable.

### 2.3 Why not one hard cutover

A hard cutover would simultaneously change input shape, provider prompt, source attribution, production projection, data validation, workflow behavior, and frontend display semantics. That couples failure diagnosis across too many layers. The current `local_compact` path must remain the rollback path until `analyst_compact_v1` proves stable.

---

## 3. analyst_compact_v1 Evidence-Pack Schema

`analyst_compact_v1` must be a bounded evidence pack, not a raw `radar-data.json` dump.

Target size:

- normal target: 15-30 KB JSON payload after compaction.
- hard warning threshold: >40 KB.
- fail / require review threshold: >60 KB.
- no raw historical arrays, chart record arrays, full records, raw provider responses, raw action queues, raw recovery dumps, or raw realtime dumps.

### 3.1 Top-level shape

```jsonc
{
  "inputVersion": "v28.0L-external-ai-analyst-input-v1",
  "generatedAt": "ISO",
  "source": {
    "type": "local_file | allowed_live_url",
    "dataSemantics": "site_structured_data",
    "radarDataUpdatedAt": "ISO|null"
  },
  "siteData": {
    "dailyBrief": {},
    "macroDrivers": {},
    "riskModules": {},
    "regimeProbabilities": {},
    "scenarioTree": [],
    "transmissionChain": {},
    "heatmap": [],
    "divergenceLayer": {},
    "brentPricingLayer": {},
    "oilDirectionalPressure": {},
    "worldOrderStress": {},
    "marketPricing": {},
    "dataQuality": {},
    "ruleBasedBaseline": {},
    "decisionContext": {}
  },
  "boundaries": {
    "siteStructuredDataOnly": true,
    "noExternalMarketData": true,
    "noPrivateUserData": true,
    "noSecrets": true,
    "readOnlyContext": true
  },
  "compaction": {
    "mode": "analyst_compact_v1",
    "targetBytes": "15-30KB",
    "omitsRawHistory": true,
    "redactionApplied": true
  }
}
```

### 3.1.1 siteData key to sourceLayer mapping

The evidence-pack JSON may use compact, product-facing names, but output attribution must map back to canonical `sourceLayer` names. PR1 must keep this mapping explicit:

| Evidence-pack key | Canonical sourceLayer |
|---|---|
| `dailyBrief` | `dailyBrief` |
| `macroDrivers.<key>` | `macroDrivers.<key>` |
| `riskModules` | `modules` |
| `regimeProbabilities` | `regimeProbabilities` |
| `scenarioTree` | `scenarioTree` |
| `transmissionChain` | `transmissionChain` |
| `heatmap` | `heatmap` |
| `divergenceLayer` | `divergenceLayer` |
| `brentPricingLayer` | `brentPricingLayer` |
| `oilDirectionalPressure` | `oilDirectionalPressure` |
| `worldOrderStress` | `worldOrderStress` |
| `marketPricing` | `marketPricing` |
| `dataQuality` | `dataQuality` |
| `ruleBasedBaseline` | `aiInterpretationLayer` |
| `decisionContext` | `decisionContext.sanitized` |

Provider prompt examples, sourceAttribution validation, production projection, and frontend display labels must use the canonical `sourceLayer` values, not the compact evidence-pack aliases.

### 3.2 Included layers

| Layer | Include | Compaction rule |
|---|---|---|
| `dailyBrief` | yes | Keep macro state, one-line conclusion, dominant chain, top risks, triggers, invalidation signals, evidence top-N. |
| `macroDrivers.*` | yes | Include every current macro-driver subtree as compact read. Keep source/sourceStatus/freshness/status/regime/key numeric values/notes summary. Do not include verbose diagnostics or raw arrays. |
| `modules` + `moduleTrends` | yes | Six module scores and trends: geopolitical, energy, inflation, liquidity, debt, banking. |
| `regimeProbabilities` | yes | Include all regime probability keys and values. |
| `scenarioTree` | yes | Summary only: scenario name/probability/description plus sanitized trigger and invalidation concepts. Remove operation/action wording. |
| `transmissionChain` | yes | Include stressScore, leadShock, pathConfidence, dominantImpact, nodes, layers, assetImpacts, top summary lines. |
| `heatmap` | yes | Include regional risk scores and notes, no raw map assets. |
| `divergenceLayer` | yes | Include all divergence checks in compact form: id/key, state/status, score, summaryZh, limitations. |
| `brentPricingLayer` | yes | Include selectedBrent, public proxy fields, futures proxy / curve summary, crack spread summary, boundary and limitation notes. |
| `data/oil-directional-pressure.json` | summary only | Include finalBias, data sufficiency, top signals, key evidence top-N, freshness summary. No full evidence object if it breaches budget. |
| `data/world-order-stress.json` | summary + top-N only | Include score/state/confidence/freshness, dominant drivers, source statuses, marketConfirmationInput source, top country/evidence aggregates if present. No raw country/event dump. |
| `data/market-pricing-metrics.json` | summary + top-N only | Include primary asset status, latest metric date, z-score bucket, top auxiliary asset summaries, boundary role labels. No `records` array. |
| `dataQuality` | yes | Derived map of stale/fallback/missing/live by layer and source. Include `asOf`/age where available. |
| `ruleBasedBaseline` | yes | Compact `aiInterpretationLayer` as baseline/fallback for comparison; provider must add incremental analysis, not replace it. |
| `decisionContext` | neutral background only | Include only sanitized read-only system-state metadata if necessary. Never include raw execution, position, cash, exposure, target-band, action, or trade terms. |

### 3.3 Macro-driver compact read

The input builder should iterate all present `macroDrivers` keys rather than hardcoding only `consumer`. Current known keys include:

`fedLiquidity`, `policyExpectations`, `credit`, `curve`, `rateVol`, `consumer`, `employment`, `consumerRetail`, `commercialRealEstate`, `privateCreditProxy`, `shippingFreight`, `inflationEnergy`, `worldEconomy`, `chinaEquity`, `chinaBond`, `chinaPmi`, `chinaInflation`, `chinaMlf`, `chinaOmo`, `chinaTsf`, `chinaPropertyPrice`, `cfetsRmb`, `copperGold`, `euroVolatility`, `gatingEvaluation`, `activeSignals`, `allSourcesMissing`.

Future keys should be included automatically if they pass the same compact/redaction rules.

---

## 4. Redaction Contract

The safest prompt is one where forbidden strings never enter the model input in user-facing form. PR1 must redact before provider input is built; relying only on output validators is too late.

### 4.1 Unsafe wording classes

The authoritative blocklist for provider-visible input redaction must come from the same single truth source used by the External AI output checkers. PR1 should refactor or share these checker constants rather than hand-copying a separate list:

- `BANNED_COPY` and `UNSAFE_CLAIMS` from `scripts/check-external-ai-output.mjs`.
- `UNSAFE_CONTENT` from `scripts/check-external-ai-production-contract.mjs`.
- Any future added checker blocklist for secrets, headers, unsupported external claims, or deterministic crisis wording.

The following examples explain the classes; they are not a complete normative list:

- trading/action words: `买入`, `卖出`, `加仓`, `减仓`, `满仓`, `清仓`, `交易`, `做多`, `做空`, `建仓`, `平仓`, `止损`, `止盈`, `必须买`, `必须卖`.
- execution words: `执行`, `执行灯`, `立即执行`, `执行交易`, `操作信号`, `行动信号`, `交易信号`, `风险动作`, `风控动作`.
- portfolio/position words: `仓位`, `现金`, `敞口`, `现金缓冲`, `风险敞口`, `敞口带`, `总风险敞口`, `配置建议`.
- advice / certainty words: `投资建议`, `交易建议`, `确定赚钱`, `无风险`, `guaranteed`, `certainty`, `sure thing`, `risk-free`.
- deterministic crisis / unsupported verification claims: `危机已经爆发`, `必然崩盘`, `必然逼空`, `世界大战`, `战争概率`, `已经进入第三次世界大战`, `已确认危机`, `外部 AI 已确认`, `外部 AI 已确认危机`, `DeepSeek 已验证市场事实`, `OpenAI 已验证市场事实`.

English equivalents in source data should be sanitized too: `position`, `cash`, `exposure`, `trade`, `buy`, `sell`, `execute`, `portfolio action`, `target band`, `risk budget`.

### 4.2 Known high-risk source fields

| Source | Risk | Required treatment |
|---|---|---|
| `decisionContext.positionGuidance` | may contain cash / exposure / position / target-band semantics | Do not pass raw. PR1 may emit only a sanitized allowlist object with `readOnly=true`, `rawControlFieldsOmitted=true`, and safe non-operational system-state fields such as `strategyState`, `stateLabel`, `stateScore`, and `riskControlStatus`. |
| `decisionContext.executionLock` or `tradingSystem.executionLock` | execution/status/light wording | Do not pass raw labels/reasons. If context is useful for canary analysis, emit only the sanitized allowlist above plus an explicit omission marker. |
| `tradingSystem.positioning` | position/cash/exposure semantics | Exclude. |
| `scenarioTree.triggers` / `scenarioTree.assets` | may contain action-style text from current site copy | Sanitize into non-operational trigger/invalidation concepts; remove action terms. |
| `world-order-stress.json.decisionModifier` | "decision modifier" can be confused with decision path | Either exclude or rename to `readOnlyOverlayModifierSummary`; remove action words. |
| `world-order-stress.json.systemInterpretationZh` / warnings | geopolitical copy can overstate certainty | Keep restrained summary only; remove war-probability / deterministic event language if present. |
| `marketPricing` records | raw arrays are large and can induce spurious precision | Exclude records; pass latest bucket and top-N evidence only. |
| ODP interpretation | can contain directional pressure language | Keep as evidence classification, not instruction. Preserve display-only boundary note. |

### 4.3 Redaction mechanics

PR1 input builder must:

1. Build or import a shared External AI blocklist module used by input redaction and by the output / production contract checkers. The redaction list must not be hand-maintained separately from checker ground truth.
2. Walk every string field in the future evidence pack.
3. Replace unsafe phrases with neutral alternatives or omit the field.
4. Record a redaction summary:

```jsonc
{
  "redaction": {
    "applied": true,
    "blocklistSource": "external-ai-checker-shared-constants",
    "removedFieldCount": 0,
    "rewrittenFieldCount": 0,
    "blockedPhrasesPresentAfterRedaction": false,
    "blockedPhraseClasses": ["execution", "position", "trading", "advice", "certainty", "deterministic_crisis"]
  }
}
```

5. Fail the canary input build if any unsafe phrase remains in provider-visible strings.

---

## 5. Source Attribution Fidelity

`analyst_compact_v1` must preserve per-layer attribution. It must not collapse all claims to `local_compact`.

### 5.1 Required sourceLayer expansion

Prompt allowlist, output validator assumptions, production projection, production contract validation, and quality review must be able to recognize at least:

- `dailyBrief`
- `aiInterpretationLayer`
- `dataHealth`
- `macroDrivers.fedLiquidity`
- `macroDrivers.policyExpectations`
- `macroDrivers.credit`
- `macroDrivers.curve`
- `macroDrivers.rateVol`
- `macroDrivers.consumer`
- `macroDrivers.employment`
- `macroDrivers.consumerRetail`
- `macroDrivers.commercialRealEstate`
- `macroDrivers.privateCreditProxy`
- `macroDrivers.shippingFreight`
- `macroDrivers.inflationEnergy`
- `macroDrivers.worldEconomy`
- `macroDrivers.chinaEquity`
- `macroDrivers.chinaBond`
- `macroDrivers.chinaPmi`
- `macroDrivers.chinaInflation`
- `macroDrivers.chinaMlf`
- `macroDrivers.chinaOmo`
- `macroDrivers.chinaTsf`
- `macroDrivers.chinaPropertyPrice`
- `macroDrivers.cfetsRmb`
- `macroDrivers.copperGold`
- `macroDrivers.euroVolatility`
- `macroDrivers.gatingEvaluation`
- `modules`
- `regimeProbabilities`
- `scenarioTree`
- `transmissionChain`
- `heatmap`
- `divergenceLayer`
- `brentPricingLayer`
- `oilDirectionalPressure`
- `worldOrderStress`
- `marketPricing`
- `dataQuality`
- `decisionContext.sanitized`

Future unknown `macroDrivers.<key>` should be allowed if the input builder emits it through the same compact/redaction pipeline and the sourceLayer string matches `macroDrivers.<safeKey>`.

### 5.2 Projection rule

Production projection must map provider attribution from `item.sourceLayer`, not from an absent `item.source` fallback. For `analyst_compact_v1`, missing or unrecognized `sourceLayer` should fail quality review or projection rather than silently becoming `local_compact`.

Minimum sourceAttribution quality for canary:

- at least 8 attribution objects.
- at least 5 distinct `sourceLayer` values.
- every main factual claim and model judgment must have at least one attribution.
- all `noteZh` values must include `站内结构化数据`.
- `usesExternalMarketData` must not be true.
- no sourceAttribution text may contain unsafe wording.

---

## 6. Confidence Strategy

`analyst_compact_v1` still uses only site-structured data. It must not claim independent external verification.

Initial confidence cap:

- max `confidence.level`: `medium` (the legal enum used for low-to-medium semantics; `high` is not allowed for `analyst_compact_v1`)
- max `confidence.score`: `45`
- default range if usable: 25-40
- score above 40 requires at least 5 distinct source layers, no stale critical layers, and no quality-review warning about weak attribution.
- current output validators only allow `low | medium | high`; do not emit `low-medium` as a literal enum unless a later contract migration changes validators and schema together.

Suggested `confidence.reasonZh`:

> 基于站内结构化数据的跨层证据包生成,未接入外部独立取数或新闻验证;多层证据可支持低至中低置信度观察,但不构成高置信度结论。

The cap may be revisited only after canary evidence proves stable source attribution, zero unsafe wording, consistent data-quality handling, and useful incremental analysis across multiple refreshes.

---

## 7. Canary Gate (PR2)

PR2 is manual/provider canary only. It must not write production data and must not change frontend display.

### 7.1 Canary metrics

| Dimension | Gate |
|---|---|
| Input size | target 15-30 KB; warn >40 KB; fail / review >60 KB. |
| Provider timeout | current manual runner default is 90000 ms; analyst canary should explicitly record the configured timeout and should pass at 120000 ms before production migration. If timeout occurs, inspect failure artifact once and do not repeatedly retry paid calls. |
| Output validation | `check:external-ai-output` PASS. |
| Quality review | `review:external-ai-artifact` PASS or WARN only if warnings are non-safety and explicitly reviewed. |
| Unsafe wording | 0 occurrences in input and output. |
| Unsupported external claims | 0 claims of independent market/news/web verification. |
| sourceLayer coverage | at least 5 distinct source layers; target 8+. |
| Incremental value | output must synthesize relationships across at least 3 evidence families; not just restate `dailyBrief` or rule-based `aiInterpretationLayer`. |
| Data quality handling | stale/fallback/missing layers must lower certainty or appear in `dataQualityLens` / data gaps. |
| Failure behavior | provider failure artifacts are diagnostic only and never projected. |

### 7.2 Model-tier A/B decision

The canary should explicitly test whether `deepseek-v4-flash` is sufficient for analyst synthesis. A stronger reasoning model may produce better cross-layer analysis, but changing model is a production contract change because current validation asserts `deepseek-v4-flash`.

Model-tier decision belongs in PR2 canary:

- compare flash vs stronger model only if cost and provider availability are acceptable.
- measure JSON validity, unsafe wording rate, source attribution coverage, latency, timeout, and incremental value.
- do not update `validate-data` model assertions until a later contract migration PR.

---

## 8. Output Schema Extension Plan (PR4, Not PR0)

Deeper analysis should come from structured output fields, not simply increasing `max_tokens`.

Future production output may add:

```jsonc
{
  "crossLayerSynthesis": [
    {
      "theme": "string",
      "summaryZh": "string",
      "supportingLayers": ["macroDrivers.credit", "macroDrivers.rateVol", "marketPricing"],
      "conflictingLayers": ["sourceLayer"],
      "confidence": "low|medium"
    }
  ],
  "keyDivergences": [
    {
      "titleZh": "string",
      "evidenceFor": ["sourceLayer.field"],
      "evidenceAgainst": ["sourceLayer.field"],
      "whyItMattersZh": "string",
      "invalidationConditions": ["string"]
    }
  ],
  "scenarioLean": {
    "leanZh": "string",
    "scenarioRefs": ["scenarioTree[0]"],
    "triggerConditions": ["string"],
    "invalidationConditions": ["string"],
    "confidence": "low|medium"
  },
  "dataQualityLens": {
    "summaryZh": "string",
    "staleLayers": [],
    "fallbackLayers": [],
    "missingLayers": [],
    "confidenceImpactZh": "string"
  }
}
```

PR4a implements these fields as an opt-in, non-production `analyst_pr4_schema_canary` mode only. The default `analyst_compact_v1` production prompt must continue to use existing output fields and must not emit these PR4-only fields until PR4b accepts them in projection / production contract / frontend. New field layer references must use canonical sourceLayer names from `scripts/external-ai/source-layers.mjs` (for example `macroDrivers.rateVol`, not bare `rateVol`); `scenarioRefs` point to `scenarioTree` entries and are not sourceLayer references.

PR4a follow-up keeps that isolation and adds a canary-only output budget after the first provider canary hit `finish_reason=length` at the default 2400 completion cap. Default / scheduled analyst production remains at `max_tokens=2400` and still must not emit PR4-only fields. Only `--analyst-pr4-schema-canary` uses the higher `max_tokens=5000` headroom, and the checker enforces hard caps: `crossLayerSynthesis <= 2`, `keyDivergences <= 2`, source/evidence/layer arrays `<= 3`, trigger/invalidation arrays `<= 3`, and `scenarioRefs <= 3`.

These fields require updates to prompt schema, output validator, production contract validator, projection, data contract docs, and frontend renderer before production display. Until validators and production contracts explicitly add another enum, PR4 subfield confidence values must reuse legal output enum values (`low | medium | high`). The `analyst_compact_v1` cap still forbids `high` and keeps score at or below 45 unless a separately reviewed contract migration changes that rule. PR4a canary validation is stricter for subfield confidence and accepts only `low | medium`.

`max_tokens` may be revisited after schema design, but `2400 -> 5000` must not be the first lever.

---

## 9. Hard Boundaries That Do Not Change

All future PRs must preserve:

- display-only / commentary-only external AI.
- `qualityReview.promotionEligible=false`.
- `provenance.humanApproved=false`.
- `boundaries.displayOnly=true`.
- `boundaries.externalAiGenerated=true`.
- `boundaries.usesExternalAiApi=true` only for actual provider-generated output.
- `boundaries.affectsScoring=false`.
- `boundaries.affectsDecisionModel=false`.
- `boundaries.affectsExecutionLock=false`.
- `boundaries.affectsPositionGuidance=false`.
- `boundaries.notInvestmentAdvice=true`.
- no scoring / decision / execution / position instructions in prompts or outputs.
- no external news / market / web claims unless a separate reviewed source ingestion contract exists.
- no replacement of rule-based `aiInterpretationLayer`; it remains baseline and fallback.
- no manual artifacts copied into `data/radar-data.json`.
- no provider failure artifact promoted or displayed as valid output.
- existing `check:external-ai-output`, `check:external-ai-production-contract`, and `check:external-ai-production-write-guard` remain guards; future changes should tighten or expand them for the new contract, not weaken them to pass provider output.

---

## 10. Rollback Path

`local_compact` remains the rollback path until a separate contraction PR removes it.

Rollback rules:

1. If PR1 input build fails size/redaction checks, do not run provider; keep production on `local_compact`.
2. If PR2 canary fails provider JSON, unsafe wording, timeout, attribution, or quality review, do not migrate production; revise input/prompt offline.
3. If PR3 production migration fails validation or refresh, restore workflow default to `local_compact` and keep validators accepting the legacy layer.
4. If a generated `analyst_compact_v1` layer fails production validation, do not write it to `data/radar-data.json`.
5. If frontend display PR4 reveals UX or copy risk, revert frontend rendering only; production input can remain hidden or legacy.

During transition, the site must always have one valid production path:

- legacy `local_compact` remains valid.
- new `analyst_compact_v1` is additive until proven stable.

---

## 11. PR0 -> PR4 Migration Map

### PR0 — this document

Files:

- create `docs/EXTERNAL_AI_ANALYST_INPUT_CONTRACT_REVIEW.md`

No runtime, data, workflow, checker, frontend, provider call, or git state change.

### PR1 — analyst evidence-pack builder

Expected files:

- `scripts/build-external-ai-manual-input.mjs`
- optional dedicated helper under `scripts/external-ai/` if local style prefers separation
- tests/checks for redaction and input-size budget if added in this stage
- docs update only if implementation details differ from this review

Scope:

- add `extractAnalystSiteDataV2()` or equivalent.
- add `--analyst-compact-v1` or explicit input-source flag.
- build ignored manual input artifact only.
- no provider call.
- no production data write.
- no workflow change.
- no frontend change.

### PR2 — manual/provider canary

Expected files:

- `scripts/run-external-ai-manual-test.mjs`
- `scripts/review-external-ai-artifact.mjs`
- `scripts/check-external-ai-output.mjs`
- provider canary docs / fixtures if needed

Scope:

- update prompt to ask four analytical tasks: cross-layer synthesis, divergence detection, scenario lean with triggers + invalidations, and data-quality-weighted confidence.
- expand prompt sourceLayer allowlist for non-production canary.
- add quality-review checks for `analyst_compact_v1`.
- run canary only when explicitly requested with provider credentials.
- decide model tier based on evidence.
- no production data write.

### PR3 — production contract migration

Expected files:

- `.github/workflows/external-ai-production-refresh.yml`
- `scripts/check-external-ai-production-refresh-workflow.mjs`
- `scripts/check-external-ai-production-contract.mjs`
- `scripts/check-external-ai-production-write-guard.mjs`
- `scripts/check-external-ai-output.mjs`
- `scripts/review-external-ai-artifact.mjs`
- `scripts/project-external-ai-production-dry-run.mjs`
- `scripts/write-external-ai-production-data.mjs`
- `scripts/validate-data.mjs`
- `docs/DATA_CONTRACT.md`
- `docs/OPERATIONS.md` if operator behavior changes

Scope:

- accept `manual_analyst_compact_v1` / `analyst_compact_v1` alongside legacy `manual_local_compact` / `local_compact`.
- preserve fallback to legacy path.
- preserve per-layer sourceAttribution in projection.
- update production schema candidate to `v28.0L-external-ai-production-analyst-1` only when projection and validators are ready.
- run full validation; no frontend display change.

### PR4 — output schema + frontend display

Expected files:

- `scripts/project-external-ai-production-dry-run.mjs`
- `scripts/check-external-ai-production-contract.mjs`
- `scripts/check-external-ai-output.mjs`
- `scripts/review-external-ai-artifact.mjs`
- `docs/DATA_CONTRACT.md`
- `index.html`
- `scripts/modules/renderMacroOverview.js` or a dedicated renderer if chosen
- `scripts/app.js` only if module loading changes
- `assets/styles.css` only if visual layout changes
- `DESIGN.md`
- `docs/ADR/0014-design-md-is-ia-ground-truth.md` only if IA semantics change

Scope:

- add `crossLayerSynthesis`, `keyDivergences`, `scenarioLean`, `dataQualityLens`.
- render deeper analysis in the existing External AI auxiliary area unless a design review explicitly changes IA.
- before frontend changes, read `DESIGN.md` in full and cite applicable sections in PR description.
- bump frontend asset version when touching `index.html`, `scripts/app.js`, frontend modules, or CSS.
- verify frozen `scripts/modules/realtime.js` remains unchanged if the bump helper fans out.

---

## 12. Open Questions For PR1 / PR2

1. Should `analyst_compact_v1` be implemented as a new option on `build-external-ai-manual-input.mjs` or a small helper module imported by that script?
2. What exact redaction failure mode should PR1 use: hard fail on any remaining unsafe phrase, or emit artifact with `blocked=true` and exit non-zero? Hard fail is recommended.
3. Which top-N values are enough for World Order and Market Pricing without losing useful signal? Suggested starting point: top 5 evidence items per external file, plus freshness/source-status summary.
4. Resolved in PR1: include a sanitized allowlist object rather than raw `decisionContext` or a pure marker. The object must keep `rawControlFieldsOmitted=true`, exclude raw control/action fields, pass canonical redaction with zero residual phrases, and attribute as `decisionContext.sanitized`.
5. How many canary runs are enough before PR3? Recommended: at least one successful local/site-data canary plus one successful production-refresh dry run, both with zero unsafe wording.
6. Should model-tier A/B compare only DeepSeek models, or include OpenAI later? Recommended: keep DeepSeek-only for the first canary to avoid widening provider governance.

---

## 13. PR0 Decision

Recommended path:

1. Approve `analyst_compact_v1` as the future source mode / inputSource family.
2. Build a redacted, budgeted evidence pack in PR1.
3. Prove it through manual/provider canary in PR2.
4. Migrate production contracts with expand-then-contract in PR3.
5. Add deeper output schema and frontend rendering only in PR4.

This keeps the core product goal -- deeper independent analysis over rich site data -- while preserving the project's strongest safety property: External AI is useful commentary, not an input to scoring, decisions, execution, or position guidance.
