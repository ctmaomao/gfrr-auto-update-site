# GFRR v28.0.10 全仓库综合工程审查报告

**日期**：2026-06-24
**工作流**：工作流 1 — 全面代码审查
**参与成员**：Cody（代码审查师）· Archi（系统架构师）· Tessa（测试专家）
**审查范围**：gfrr-auto-update-site 全仓库（scripts/ · workers/ · data/ · config/ · .github/workflows/ · docs/）
**基线**：v28.0J 稳定观察基线 / v28.0.10 release
**主理人**：甄宇航（Zhen）· 工程督导

---

## 📌 TL;DR（执行摘要）

- **整体结论**：GFRR v28.0.10 在 v28.0J 稳定基线上**未发现基线边界违反或活跃安全漏洞**。6 条核心架构边界（解释层↔决策层隔离、External AI 隔离、版本分离、secondary diagnostics 隔离、World Order overlay、Brent freshness gate）均合规。三位成员独立产出后由主理人交叉验证关键发现点并去重合并。
- **严重度分布（原始审查）**：🔴严重 0 项 / 🟠高 4 项 / 🟡中 14 项 / 🟢低 8 项
- **整改复核（2026-06-26）**：4 项高优先级问题已全部关闭；#7 已关闭；#21 经当前代码复核后关闭；#23 降级为可选语义/fixture 补盲。剩余项均为 P1/P2 渐进式加固或需另开版本评审事项。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 有条件通过（P0 已关闭，剩余 P1/P2） |
| 阻塞项数量 | 0 |
| 高优先级问题 | 原始 4 项；2026-06-26 已关闭 4 项 |
| 关键行动项 | 7 条（见文末行动清单） |
| 基线边界违反 | 无 |
| 活跃安全漏洞 | 无 |
| 建议下一步 | ① 优先修复 #8/#10/#14 等小半径中优先级问题；② #9 作为前端安全 patch 单独推进；③ #15/#16/#20 按架构/文档评审处理 |

---

## 🔧 2026-06-26 整改复核状态

| 原发现 | 当前状态 | 证据 |
|--------|----------|------|
| #1 no-op ternary | ✅ 已关闭 | commit `f67cdcc7`：`confidence` 简化为直接 `'high'` |
| #2 非原子生产 JSON 写入 | ✅ 已关闭 | commit `57027461`：`writeJsonAtomically` tmp+rename 写入 |
| #3 frozen realtime 边界漂移 | ✅ 已关闭并改写方案 | commit `75d442db`：加 `@frozen` / config 注释 / `check:realtime-js-frozen`；同时让 asset bump helper 跳过 `scripts/modules/realtime.js`，不采用原报告里的 `git diff --exit-code` 守门 |
| #4 Worker 源码语法盲区 | ✅ 已关闭 | commit `73c2f7a2`：新增 `check:worker-syntax` 并接入 `check:all` |
| #7 Worker diagnostic finalUrl 泄露风险 | ✅ 已关闭 | Worker `finalUrl` 现统一走 `sanitizeDiagnosticUrl` 去除 query/hash；`check:workflows` 加回归守卫 |
| #15 ADR-0002 路径 | ✏️ 已改写为待办 | 正确路径为 `docs/ADR/0002-worker-first-realtime.md`，问题仍有效 |
| #20 ADR-0008 路径/措辞 | ✏️ 已改写为待办 | 正确路径为 `docs/ADR/0008-external-ai-read-only.md`，需区分 rule-based layer 与 live external layer |
| #19 CI workflow 计数 | ✏️ 已改写为待办 | `CLAUDE.md` 仍写 GitHub Actions ×12；当前 `.github/workflows` 为 21 个文件，应改为“以目录实际文件为准”或更新为 21 |
| #21 Pages failure-trigger 噪音 | ✅ 已关闭 | 当前 `.github/workflows/deploy-static-site-to-pages.yml` 已有 `if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'` |
| #23 treasury scripts 语法盲区 | ⬇️ 已降级 | `check:syntax` 已覆盖 `scripts/treasury-fiscal-data/*.mjs` 语法；剩余只是可选语义/fixture check |

---

## 🏗️ 交叉验证记录（主理人核实关键发现）

在汇编前，主理人对三位成员独立指出但值得交叉确认的发现点做了源码核实：

| 验证项 | 验证命令 | 结果 |
|--------|---------|------|
| Cody #1 / Archi #1：app.js 不 import realtime.js | `grep import scripts/app.js` | ✅ 确认。app.js 仅 import config.js + 动态 import renderMacroOverview/renderOilDirectional，realtime.js 全套 strict gate 逻辑保留但未接入 |
| Cody #4：worker-market-preview.js:875 no-op ternary | Read line 870-879 | ✅ 确认。`confidence: moveStatus === 'confirmed-extreme-move' ? 'high' : 'high'` 两分支同值，reason 字段才是真正区分点 |
| Archi #1 / Tessa #3 交叉：realtime.js 冻结状态 | `git log --oneline -- scripts/modules/realtime.js` | ✅ 确认。最近 5 个 commit 均触碰该文件（多为 bump 工具改 `?v=` 标签），印证冻结代码仍被间接触碰且无守门 |

---

## 🔍 审查发现（按严重度排序，去重合并）

### 🟠 高优先级（4 项）

| # | 类别 | 文件:行 | 问题描述 | 建议修复 | 来源 |
|---|------|---------|---------|---------|------|
| 1 | 正确性（已关闭） | workers/gfrr-realtime-worker/src/worker-market-preview.js:875 | 原始发现：`confidence: moveStatus === 'confirmed-extreme-move' ? 'high' : 'high'` 两分支同值。 | ✅ 已修复：commit `f67cdcc7` 简化为 `confidence: 'high'` | Cody |
| 2 | 正确性（已关闭） | scripts/write-external-ai-production-data.mjs:175 | 原始发现：`writeProductionData` 直接写 `data/radar-data.json`，非原子写入。 | ✅ 已修复：commit `57027461` 改为 `.tmp` + `fs.renameSync` 原子替换 | Cody |
| 3 | 架构漂移（已关闭） | scripts/modules/realtime.js（全文）+ scripts/modules/config.js:10 | 原始发现：frozen `realtime.js` 保留可用 worker strict-gate 逻辑但未接入，且 asset bump 会间接触碰。 | ✅ 已修复并改写方案：commit `75d442db` 加 frozen 注释/JSDoc，新增静态边界检查 `check:realtime-js-frozen`，并让 asset bump helper 跳过 frozen module；未采用 `git diff --exit-code` 方案 | Archi + Tessa 交叉 |
| 4 | 测试盲区（已关闭） | workers/gfrr-realtime-worker/src/*.js | 原始发现：`check:syntax` 只扫描 `scripts/`，不覆盖 Worker 源码。 | ✅ 已修复：commit `73c2f7a2` 新增 `check:worker-syntax` 并接入 `check:all` | Tessa |

### 🟡 中优先级（14 项）

| # | 类别 | 文件:行 | 问题描述 | 建议修复 | 来源 |
|---|------|---------|---------|---------|------|
| 5 | 正确性 | scripts/modules/realtime.js:37-42 | `fetchBaselineData`/`fetchHistoryData` 执行 `fetch(url).then(r => r.json())` 未检查 `response.ok`。GitHub Pages 返回 404/500 HTML 错误页时 `r.json()` 抛 SyntaxError，错误信息不含 HTTP 状态。同文件 `fetchWorldOrderStressData`(:44) 已有正确 `response.ok` 检查，存在不一致。 | `.then()` 中加 `if (!r.ok) throw new Error('baseline HTTP ' + r.status)` 再 `.json()` | Cody |
| 6 | 正确性 | scripts/modules/realtime.js:481 | catch 块 `lastError = \`${attempt.source}:${error.message}\`` 未做类型检查。若 error 非 Error 对象（如 `throw "string"`），`error.message` 为 undefined，产生 `"github-realtime-data:undefined"` 无用信息。 | 改为 `error instanceof Error ? error.message : String(error)` | Cody |
| 7 | 安全（已关闭） | workers/gfrr-realtime-worker/src/worker-market-preview.js:133,160 | 原始发现：`fetchTextWithDiagnostics` 中 `finalUrl: response.url \|\| url` 在 FRED API 调用时会存储含 `api_key` 查询参数的完整 URL。 | ✅ 已修复：Worker `finalUrl` 统一走 `sanitizeDiagnosticUrl` 去除 query/hash；`check:workflows` 加回归守卫 | Cody |
| 8 | 正确性 | workers/gfrr-realtime-worker/src/index.js:848-854 | `scheduled` handler 中 `await env.GFRR_MARKET_KV.put(...)` 无 try/catch。KV 写入失败（配额超限/网络错误）时异常传播到 Worker 运行时，scheduled event 静默失败且无诊断。Cloudflare Workers 默认不重试失败的 scheduled events。 | 包裹 try/catch，失败时 `console.warn` 记录错误信息（不含敏感数据） | Cody |
| 9 | 安全 | scripts/app.js:161 | `issueEl.innerHTML = \`<strong>ISSUE ${meta.issue}</strong>\`` 用 innerHTML 拼接 `meta.issue`。虽来自 pipeline 产出，但若 `radar-data.json` 被篡改可导致 XSS。`renderMacroOverview.js:53,62` 有类似 innerHTML 模式。 | 若 `meta.issue` 是纯标识符，用 `textContent` 替代；若需 HTML 格式，对动态值做转义 | Cody |
| 10 | 安全 | scripts/world-order/fetch-ofac.mjs:60 | `const url = config.recentActionsUrl \|\| 'https://ofac.treasury.gov/recent-actions'` 直接使用 config URL，未校验是否 HTTPS 或在允许域名列表内。config 来自版本控制，风险较低，但若 config 被篡改可致 SSRF。 | 添加 URL allowlist 校验：`ALLOWED_OFAC_HOSTS = ['ofac.treasury.gov']` | Cody |
| 11 | 可维护性 | scripts/modules/realtime.js:753-780 | `applyRealtimeOverlay` 大量未文档化魔法数字：`(brent-60)*2`、`(dxy-95)*8`、`(hy-2.5)*35`、`(vix-12)*7`、`(us10y-2.5)*22` 等。阈值和系数直接影响 scoring，无注释说明依据。 | 提取为命名常量并注释来源（如 `BRENT_RISK_BASE=60, BRENT_RISK_MULTIPLIER=2`） | Cody |
| 12 | 可维护性 | workers/gfrr-realtime-worker/src/index.js:434-547 | 5 个几乎完全相同的函数（`fetchCboeVixLatest`/`fetchYahooGoldSecondaryLatest`/`fetchYahooDxySecondaryLatest`/`fetchYahooUs10ySecondaryLatest`/`fetchYahooSpxSecondaryLatest`），仅 URL 和 parser 不同，约 110 行重复代码。 | 抽取为单一参数化函数 `fetchSecondarySource(url, parser, sourceName)` | Cody |
| 13 | 可维护性 | scripts/modules/decision.js:351-386 | `calculateStrategyStateEngine` 大量魔法数字：`+=18`/`+=10`/`+=6`/`-=14`/`+=24`/`+=14`/`+=12` 等，无命名常量，直接影响策略状态判定。 | 提取为命名常量对象 `SCORE_BUMP = { RECENT3D_DELTA_LARGE: 18, ... }` | Cody |
| 14 | 正确性 | workers/gfrr-realtime-worker/src/worker-market-preview.js:1004 | `parsePriceFromHtml` 最后 regex `(?:Brent\|BZW00\|Crude Oil)[\s\S]{0,600}?([0-9]{2,3}(?:\.[0-9]{1,4})?)` 可匹配 "Brent" 后 600 字符内任意 2-3 位数字。虽仅用于 TE 诊断候选（不参与 promotion consensus），但错误值会出现在 diagnostic 输出。 | 收紧 regex：要求数字前有价格上下文（`$`/`price`/`USD`），或缩小字符窗口 600→200 | Cody |
| 15 | 架构 | docs/ADR/0002-worker-first-realtime.md point 2 | ADR-0002 point 2「前端 strict gate 校验 worker preview 新鲜度」描述的是 M-94 前架构。M-94 V0 路径 C 后前端改读静态快照，不跑 strict gate。新接手者读 ADR-0002 会误以为前端仍跑 strict gate。 | 新开 ADR-0018 记录 M-94 V0 路径 C 决策；ADR-0002 追加 amendment 标注 point 2 superseded | Archi |
| 16 | 架构 | scripts/run-daily-pipeline.mjs:2463-2467 | Daily pipeline 开头检查 `previous?.externalAiInterpretationLayer`，若缺失/不符合 production-contract 直接 `throw`，阻断整个 Daily 构建。External AI 本应是「可禁用的只读展示层」（ADR-0008: 禁用不影响决策），但硬依赖 guard 使 External AI 层缺失会阻断 Daily pipeline，间接违背设计意图。 | **[需另开版本评审]** 将硬 throw 降级为 soft warning + fallback to null/placeholder layer。当前基线下记录为技术债 | Archi |
| 17 | 测试盲区 | bubble-watch.html + 渲染脚本 | `check:dom` 只校验 `index.html` vs `scripts/modules/*.js`。`bubble-watch.html` 是独立第二页面，其渲染 id 无契约守门。改名/typo 导致渲染静默失败。 | 新增 `check-bubble-watch-dom.mjs`：校验 bubble-watch 渲染脚本写入的字面 id 在 bubble-watch.html 中存在 | Tessa |
| 18 | 测试盲区 | data/market-pricing-metrics.json | 365KB 生产数据文件被前端 `renderMacroOverview.js` 消费，但 `check:market-pricing` suite 的 7 leaf 校验 history/scaffold/calculation 逻辑，不直接校验该 JSON 的 schema。schema 漂移导致前端渲染 undefined/NaN。 | 新增 `check-market-pricing-metrics-schema.mjs`：校验必需字段、数值类型、asset 覆盖，接入 check:market-pricing suite | Tessa |

### 🟢 低优先级（8 项）

| # | 类别 | 文件/位置 | 问题描述 | 建议修复 | 来源 |
|---|------|-----------|---------|---------|------|
| 19 | 文档漂移 | CLAUDE.md tech stack 表 | 称「CI ×12」，当前 `.github/workflows` 为 21 个 workflow 文件。 | ×12 → “以 .github/workflows/ 实际文件为准”，或更新为 21 | Archi + Tessa |
| 20 | 文档 stale | docs/ADR/0008-external-ai-read-only.md point 3 | 「当前默认 generatedByExternalAi=false、不调用任何 provider」描述 pre-production 态。当前 externalAiInterpretationLayer 已 live（provider=deepseek, status=valid）。 | reconcile point 3 措辞，区分 rule-based `aiInterpretationLayer`（仍不调 provider）与 `externalAiInterpretationLayer`（已 live） | Archi |
| 21 | CI 噪音（已关闭） | deploy-static-site-to-pages.yml:18-19 / job if | 原始担忧：`workflow_run: types: [completed]` 可能让失败 upstream 触发 deploy run。当前复核发现 deploy job 已有 success conclusion gate。 | ✅ 已关闭：当前 `jobs.deploy.if` 已要求 `workflow_run.conclusion == 'success'`，无需改动 | Archi |
| 22 | 测试盲区 | realtime/market.json 本地文件 | `validate-data.mjs` 仅校验文件存在 + JSON.parse + 部分 cross-validation。详细 schema 校验在 `check-realtime-health.mjs`（URL fetch，非本地文件）。本地快照结构异常只在 Daily check:data 间接暴露。 | 新增 `check-realtime-local-schema.mjs`：校验 values/sourceMode/healthScore/brentValidation 结构 | Tessa |
| 23 | 测试盲区（已降级） | scripts/treasury-fiscal-data/*.mjs | 原始担忧：3 个脚本有 npm script 但无 check:* 守门。当前复核：`check:syntax` 已递归覆盖 `scripts/treasury-fiscal-data/*.mjs` 的语法检查。 | ⬇️ 降级为可选语义/fixture check；不再作为语法盲区 | Tessa |
| 24 | CI 回归 | 无 pull_request 触发 check:all | check:all 只在 push(main) 和 workflow_run 触发。PR 合并前无自动 check:all 门。但 push(main) 会触发 deploy workflow 的 check:all，失败则不部署（post-merge 兜底）。 | 评估是否在 PR 加 check:all gate（权衡 CI 成本） | Tessa |
| 25 | CI 回归 | build-realtime-market.yml | build:realtime → 直接 commit 到 realtime-data branch，build 后无 check 守门。Daily pipeline 的 check:data 下游兜底。 | 可选加轻量 check 步骤 | Tessa |
| 26 | 时序滞后 | external-ai-production-refresh.yml (23:50) vs build-daily-radar-data.yml (22:30) | External AI Refresh 在 Daily pipeline 之后运行。Daily pipeline preserve 的是前一天的外部 AI 层，新外部 AI 层要到次日 22:30 才被 Daily 消费。1 天滞后对日频简报可接受，但需文档化。 | 在 OPERATIONS.md 文档化此 1 天滞后 | Archi |

---

## 🏛️ 架构影响评估（Archi 原始产出摘要）

### 边界合规性检查表（10 项）

| # | 边界 | 状态 | 关键证据 |
|---|------|------|---------|
| 1 | Worker-first 主链路完整性 | 🟢已加守门 | app.js 不 import realtime.js；realtime.js 保留但已加 frozen 标记、asset bump skip 与 `check:realtime-js-frozen` 守门（见发现 #3） |
| 2 | 解释层↔决策层隔离 | 🟢合规 | run-daily-pipeline.mjs:11185-11203 scoring 路径只读 scoringRealtime+macroDrivers，不读 dailyBrief/divergenceLayer/brentPricingLayer；buildAiInterpretationLayer 单向读取作 evidence context，不写回 |
| 3 | External AI 隔离边界 | 🟢合规（含漂移点） | 唯一生成路径 = external-ai-production-refresh workflow；ADR-0008 守护链在位；Daily pipeline 硬依赖 guard（见发现 #16） |
| 4 | 数据契约版本管理 | 🟢合规 | RELEASE_VERSION='v28.0.10' / DATA_CONTRACT_VERSION='v27.0' 清晰分离；app.js normalizeRadarReleaseVersion 只读展示归一化 |
| 5 | secondary diagnostics 隔离 | 🟢合规 | Worker 独立 endpoint `/market.secondary-preview.json` + 独立 KV key `market:secondary-preview` + sourceMode='secondary-preview' |
| 6 | World Order 是 regime overlay | 🟢合规 | app.js:74 只 fetch 静态快照，不接 decisionModel/scoring |
| 7 | CI/CD workflows 架构 | 🟢合规 | deploy workflow 虽监听 `completed`，但 job-level `if` 已要求 upstream conclusion success（发现 #21 已关闭） |
| 8 | ADR-0002 Worker-first | 🟡部分 stale | point 2「前端 strict gate」已由 M-94 V0 路径 C 改变（见发现 #15） |
| 9 | ADR-0007 effectiveDisplayInputs | 🟢合规 | freshness.js 共享信任闸门 + realtime.js buildEffectiveDisplayInputs 合成（冻结但合规） |
| 10 | ADR-0017 Wind paid fallback | 🟢合规（重点观察） | Wind 可进主分数，经 source-policy 仲裁 + score-impact guard + env + API key 四重门。评分输入面扩大——付费源首次进入 scoring |

### ADR 合规性总览

- 🟢合规：ADR-0001（零依赖）/ 0003（secondary）/ 0004（World Order）/ 0005（console.log）/ 0007（effectiveDisplayInputs）/ 0009（Brent freshness）/ 0017（Wind fallback）
- 🟡部分 stale / 措辞 stale：ADR-0002 point 2（见发现 #15）/ ADR-0008 point 3（见发现 #20）
- **ADR 缺口**：M-94 V0 路径 C 前端重写是重大架构变更，但无对应 ADR。建议新开 ADR-0018。

### 耦合热点

1. **Daily pipeline → externalAiInterpretationLayer 硬依赖**（🟡 需关注）— 见发现 #16
2. **aiInterpretationLayer 读取 decisionModel 作 context**（🟢 合规单向）— line 2339 显式标注 `decision_context_separated`
3. **Deploy 触发链含 External AI Production Refresh**（🟢 当前合规）— read-only 层完成后触发 Pages 合理；failure upstream 已由 job-level success gate 阻断（见发现 #21）

---

## 🧪 测试覆盖评估（Tessa 原始产出摘要）

### check:all 覆盖矩阵（23 顶层 / ~85 leaf checks，2026-06-26 复核）

| check 命令 | leaf 数 | 覆盖契约 | 状态 |
|------------|---------|---------|------|
| check:syntax | 1 | scripts/ 全目录 .mjs/.js 语法 | 🟢 |
| check:worker-syntax | 1 | workers/gfrr-realtime-worker/src/*.js 语法 | 🟢 |
| check:gdelt-cache-health | 1 | GDELT 三条 cache 路径只读健康复核（WATCH 不阻断默认 check） | 🟢 |
| check:modules | 1 | scripts/modules/*.js import 可加载性 | 🟢 |
| check:realtime-js-frozen | 1 | M-94 Path C frozen realtime module 边界、app.js 不重接入、asset bump helper skip | 🟢 |
| check:frontend-live-contracts | 8 | loading-state/observation-reaction/thematic-card-ia/null-zero-guards/dom/macro-overview-narrative/macro-overview-display-helpers/macro-coherence-display-only | 🟢 |
| check:external-ai | 10 | manual-workflow/provider-workflow/production-refresh-workflow/workflow-artifacts/output/production-contract/provenance-completeness/production-write-guard/frontend-hidden-scaffold/production-provider-path | 🟢 |
| check:data | 1 | radar-data.json + radar-history.json + realtime/market.json + radar-history-full.json 全量 schema（~150KB 脚本，~200+ 字段契约） | 🟢 |
| check:brent | 3 | promotion-audit-fields/crack-spread/public-proxy-source-review | 🟢 |
| check:macro-drivers | 9 | fed-liquidity-extended/repo-spread/credit-sloos/credit-nfci/consumer-pmi/employment/consumer-retail/commercial-real-estate/expanded-auto-ingestion | 🟢 |
| check:narrative-density | 3 | world-order/risk-asset-mismatch/overheat-confirmation | 🟢 |
| check:market-pricing | 7 | history/manual-weekly-input-sanitizer-scaffold/first-real-record-write-scaffold/weekly-history-buildup/metrics-calculation-scaffold/multi-asset/ndx-ixic-implementation | 🟢 |
| check:oil-directional | 21 | contract/freshness/seasonality/degradation/boundary/backtest/score/global-overlay/news-events-diagnosis/news-event-watch/.../firms-thermal-watch-review | 🟢 |
| check:bubble-watch | 7 | contract/scoring/freshness/provenance/boundary/history/public-copy | 🟢 |
| check:world-order-acled | 2 | weekly/monthly | 🟢 |
| check:frontend-zh-copy | 1 | 前端中文文案禁词 + 无 trade-action 词守门 | 🟢 |
| check:gdelt-cloud-fetcher-integration | 1 | GDELT Cloud fetcher 存在性 + workflow 标记 | 🟢 |
| check:gdelt-source-policy | 1 | 全仓 GDELT endpoint allowlist 扫描 | 🟢 |
| check:node-runtime | 1 | workflows actions/* 版本 Node24 pin 一致 | 🟢 |
| check:workflows | 1 | 当前 21 个 workflow 文件的 YAML 结构契约与 Pages 触发覆盖 | 🟢 |
| check:docs | 1 | docs/ markdown 链接有效性 | 🟢 |
| check:main-score-wind-fallback | 1 | main-score-source-policy 契约 + ADR-0017 | 🟢 |
| check:world-order | 1 | world-order-stress.json 契约 | 🟢 |

**评估结论**：validate-data.mjs 是极强的数据契约守门（~150KB / ~2400 行，覆盖 ~200+ 字段、source label 精确 Set、中文 regime enum、range guard、forbidden phrase）。check:all 是部署前置门，是最强回归门。

### 测试盲区清单（当前剩余）

- ✅ #4 Worker 源码语法盲区已关闭：`check:worker-syntax` 已接入 `check:all`。
- ✅ bump 工具触碰 frozen `realtime.js` 盲区已关闭：`check:realtime-js-frozen` + asset bump helper skip。
- ⬇️ #23 treasury 脚本语法盲区已降级：`check:syntax` 已覆盖语法，剩余为可选语义/fixture check。
- 仍待补盲：#17 Bubble Watch DOM、#18 market-pricing metrics schema、#22 local realtime schema。

### CI workflows 覆盖（当前 21 个，详见 Archi 评估中的 CI/CD 架构评估段）

关键回归风险：
- ✅ Worker 源码变更语法 check 已补（见发现 #4）
- 🟡 无 PR gate / realtime build 无 check；bump 盲区已关闭（见发现 #3）
- 🟢 continue-on-error by design（3 个 refresh workflow 的 build 步骤，fail-closed to last good）

---

## ✅ 做得好的地方（Cody 正面记录）

- **External AI 安全边界设计严谨**：`production-provider-path.mjs` + `write-external-ai-production-data.mjs` 通过 `REQUIRED_FALSE_PATHS`/`REQUIRED_TRUE_PATHS` 强制校验 boundaries，`assertSafeTarget` 限制写入路径，`isUnsafeOutputPath` 阻止写入敏感目录，`FORBIDDEN_SECRET_MARKERS` 防止 API key 泄露到 AI 输出。
- **DeepSeek API key 处理正确**：通过 `Authorization: Bearer` header 传递（非 URL），`safety-constants.mjs` 中 `FORBIDDEN_SECRET_MARKERS` 包含 `DEEPSEEK_API_KEY`/`Authorization`/`Bearer` 防泄露。
- **GDELT Cloud API key 安全**：通过 `Authorization: Bearer` header 传递，key 不在 URL 中。
- **Brent promotion 门控严格**：`buildBrentPromotionDecision` 要求 FRED anchor stale + Yahoo/TE 双确认 + divergence < 2% + 48h 新鲜度，多层门控防误提升。
- **数据契约保持**：`decision.js` 中 `contractVersion: 'v27.0'` 正确保留，未机械替换。
- **ODP classifier 预注册阈值**：`Object.freeze` 锁定阈值，注释说明 look-ahead-safe 设计。
- **QQQ Yahoo refresher 原子写入**：`writeJsonAtomically` 使用 tmp+rename 模式，路径校验严格（可作为发现 #2 的修复参照）。
- **fetchTextWithDiagnostics 重试+超时**：worker 中所有外部 fetch 都有 AbortController 超时和重试机制。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 触及基线? | 预期完成 |
|---|------|---------|--------|-----------|---------|
| 1 | 修复 worker-market-preview.js:875 no-op ternary（确认意图后简化或修正 else 分支） | 前端/worker 开发 | P0 | 否 | ✅ 已完成：`f67cdcc7` |
| 2 | write-external-ai-production-data.mjs:175 改用 writeJsonAtomically 原子写入（参照 qqq-yahoo-history-refresh.mjs 模式） | pipeline 开发 | P0 | 否 | ✅ 已完成：`57027461` |
| 3 | config.js `workerFirstEnabled` 旁加 FROZEN 注释；realtime.js 顶部加 `@frozen` JSDoc；新增静态 `check-realtime-js-frozen.mjs` 接入 check:all；asset bump helper 跳过 frozen module | 前端/测试 | P0 | 否 | ✅ 已完成：`75d442db` |
| 4 | 新增 `check-worker-syntax.mjs`：递归 `node --check workers/gfrr-realtime-worker/src/*.js`，接入 check:all（check:syntax 之后） | 测试 | P0 | 否 | ✅ 已完成：`73c2f7a2` |
| 5 | 新开 ADR-0018 记录 M-94 V0 路径 C 前端重写决策；ADR-0002 追加 amendment 标注 point 2 superseded | 架构 | P1 | 否 | 下一迭代 |
| 6 | 修复剩余 Cody 中优先级问题（#5/#6 realtime.js response.ok/error 类型、#8 worker KV try/catch、#9 app.js innerHTML、#10 OFAC allowlist、#11/#13 魔法数字、#12 重复函数、#14 regex 收紧） | 多角色 | P1 | 否 | 后续迭代分批 |
| 7 | 新增 `check-bubble-watch-dom.mjs` + `check-market-pricing-metrics-schema.mjs` 补测试盲区 | 测试 | P1 | 否 | 后续迭代 |

**需另开版本评审（不在本审查行动清单内，排入 backlog）**：
- Daily pipeline externalAiInterpretationLayer 硬依赖降级为 soft warning（发现 #16）
- realtime.js 冻结代码归档至 `_frozen/` 或加 lint 禁止 import（发现 #3 加固版）

---

## ⚠️ 待完善 / 已知局限

- **审查性质为抽样**：Cody 的代码审查为抽样审查（覆盖 worker/external-ai/world-order/market-pricing/oil-directional/modules/daily-pipeline 等区域），非全仓库逐行审查。未抽样的脚本（如 scripts/treasury-fiscal-data/、scripts/oil-directional/ 部分子模块）可能存在未发现的问题。
- **原始审查未运行 check:all**：原始 2026-06-24 审查为静态分析 + 源码阅读。2026-06-26 四个 P0 整改提交前均已运行相关定向检查与 `npm run check:all`。
- **Worker runtime 兼容性未验证**：`check:worker-syntax` 已覆盖 Worker 源码语法；但 Workers 用 Cloudflare Workers 运行时（非 Node.js），`node --check` 不能验证 Worker-specific API 兼容性。
- **ADR 体系完整性未全面审计**：Archi 评估了 10 个核心 ADR 的合规性，但 docs/ADR/ 下可能有更多 ADR 未纳入本次评估。
- **External AI 时序滞后**（发现 #26）对日频简报可接受，但若未来改为更高频率刷新需重新评估。

---

## 📚 数据来源 & 成员产出索引

- **Cody（代码审查师）原始产出**：17 条发现（4🟠高 + 8🟡中 + 5🟢低），覆盖 worker/external-ai/world-order/market-pricing/modules/daily-pipeline。完整发现已整合入本报告"审查发现"表（#1-#2, #5-#14）。结论：Approve with suggestions。
- **Archi（系统架构师）原始产出**：10 条边界检查 + 3 条耦合热点 + 10 条 ADR 合规性 + 原始 20 个 CI workflows 评估 + 6 条漂移风险 + 7 条改进建议。2026-06-26 复核当前 `.github/workflows` 为 21 个文件。完整产出已整合入本报告"架构影响评估"段及发现 #3/#15/#16/#19/#20/#21/#26。结论：6 条核心边界未违反，整体合规。
- **Tessa（测试专家）原始产出**：check:all 原始 20 顶层/~78 leaf 覆盖矩阵 + 原始 20 个 CI workflows 覆盖矩阵 + 6 条测试盲区 + 5 条回归风险点 + 6 条改进建议。2026-06-26 复核后当前 check:all 为 23 顶层/~85 leaf，当前 workflow 文件数为 21；#4 与 bump 盲区已关闭，#23 降级。完整产出已整合入本报告"测试覆盖评估"段及发现 #4/#17/#18/#22/#23/#24/#25。结论：测试体系高度成熟，剩余盲区可继续叠加 check 脚本补齐。
- **主理人（Zhen）交叉验证**：核实 app.js 不 import realtime.js、worker-market-preview.js:875 no-op ternary、realtime.js git log 冻结状态三个关键交叉发现点。

---

> 本报告由工程保障团队 AI 协作生成（主理人 Zhen 编排 + Cody/Archi/Tessa 独立产出 + 主理人交叉验证汇编），关键决策请由人类工程负责人复核。
