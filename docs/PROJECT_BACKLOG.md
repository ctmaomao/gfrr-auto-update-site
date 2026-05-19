# Project Backlog · GFRR Auto-Update Site

> Persistent backlog of open data/feature items, completed milestones, and audit history.
> This is project-self-memory across sessions. When starting a new session, fetch `docs/PROJECT_BACKLOG.md` first.

---

## Section 1 · 维护状态

| 项 | 值 |
|---|---|
| 当前生产状态 | v28.0M-62 |
| Cache version | `28.0M-58V` |
| check:all 项数 | 67 |
| 最后审计日期 | **2026-05-18** (M-55b audit + Build #74 refresh + M-57 + M-58 + M-59 + M-60 + M-61 + M-62) |
| 最后 daily refresh | 2026-05-17 (Build #74, commit `e366b60`) |
| GDELT 刷新 | M-59 起由 `Refresh World Order Stress` daily workflow 维护 |
| Pages auto-deploy | M-60 起集中由 `deploy-static-site-to-pages.yml` 的 `workflow_run.workflows` 列表维护，并由 `check:pages-trigger-coverage` 守护 |
| SIPRI 状态 | M-61 起 `config/world-order-sipri-normalized.json` 使用 SIPRI 2024 真实数据，world-order build 后为 `ok` |
| QQQ weekly refresh | M-62 起 M-24 history writer 由 integral replace 改为 `isoWeek` keyed merge；weekly sanitized batches 可增量延长历史 |
| ACLED 状态 | 延后至后续 M-series；等待 Research/Partner tier |
| 下次审计建议 | 2026-05-25 或下一次 milestone 合并时 |

---

## Section 2 · Open Backlog Items

### P0 Items (Critical — 必须做)

(All P0 items as of M-57 are resolved.)

### P1 Items (Recommended)

#### P1-4: ACLED 数据源配置
- **描述**: `sources.acled.status = "not_configured"`
- **数据源**: ACLED API (需 key)
- **类型**: 类型 2
- **估计 PR**: ~120 行

### P2 Items (Optional)

#### P2-7: 就业广度接入
- 字段: ICSA (Initial Claims), CCSA (Continuing Claims), JTSJOL (JOLTS)
- 估计 PR: ~100 行

#### P2-8: 高频消费证据
- 字段: Redbook Same-Store Sales, BoA Card Data
- 估计 PR: ~150 行

#### P2-9: CRE / CDX / 私募信贷
- 字段: CDX HY/IG, CRE delinquency, private credit fundraising
- 估计 PR: ~200 行

### P3 Items (Won't Fix — 设计 placeholder)

#### P3-10: Fed dot plot / OIS forward rates / FOMC 文本分析
- **不修原因**: 项目明确边界, 不接入官方预测路径

#### P3-11: Brent 期限结构 / Platts Dated Brent / Shipping freight
- **不修原因**: 商业数据成本高

#### P3-12: signal-noise bucket 硬编码
- **不修原因**: 设计为框架提醒

---

## Section 3 · Completed Items

| Milestone | 描述 | PR | 完成日期 | 验证状态 |
|---|---|---|---|---|
| M-46 | SLOOS Bank Loan Standards | #196 | 2026-05 | ✅ pipeline + data refreshed (Build #74) |
| M-47 | ISM PMI Growth Layer | #197 | 2026-05-16 | ✅ pipeline + data refreshed (Build #74) |
| M-48 | NFCI Bank Stress Index | #198 | 2026-05 | ✅ pipeline + data refreshed (Build #74) |
| M-49 | Diesel Crack Spread | #199 | 2026-05 | ✅ pipeline + data refreshed (Build #74) |
| M-50 | Repo Market Spread | #200 | 2026-05-16 | ✅ pipeline + data refreshed (Build #74) |
| M-51 | World Order Pressure Narrative | #201 | 2026-05 | ✅ 7 narrative evidence active |
| M-52 | Risk Asset Mismatch Narrative | #202 | 2026-05 | ✅ strong_confirmation |
| M-53 | Overheat Confirmation Narrative | #203 | 2026-05 | ✅ strong_confirmation |
| M-54 | Frontend Visual Phase 1 | #204 | 2026-05 | ✅ emoji prefix + evidence color |
| M-55a | IA Restructure Phase 2a | #205 | 2026-05 | ✅ realtime band uplift + external-ai uplift |
| M-55b | IA Restructure Phase 2b | #206 | 2026-05 | ✅ main-module visual standard + wow-key-changes JS-runtime |
| M-56 | validate-data consumer source whitelist | #207 | 2026-05-17 | ✅ Build #74 PASS, M-46~M-50 fields activated |
| M-57 | buildMarketTemperature fix + PROJECT_BACKLOG.md creation | (this PR) | 2026-05-17 | ✅ judgment-render layer aligned + project memory established |
| M-58 | Realtime band field completion (P1-6) + Brent null-check fix + unit suffixes | (this PR) | 2026-05-17 | ✅ 9 new DOM ids locked |
| M-59 | GDELT Cloud v2 integration (P1-5) | (this PR) | 2026-05-17 | ✅ Replace legacy DOC API with Cloud v2; daily refresh; 4 new narrative supporting branches |
| M-60 | Pages deploy trigger coverage (workflow_run centralization + heuristic guard) | (this PR) | 2026-05-17 | ✅ Centralize Pages auto-deploy via Pages workflow_run.workflows list; remove ad-hoc `gh workflow run` from refresh-world-order-stress; resolve latent external-ai-production-refresh hole; add heuristic contract check guarding all committing-to-main workflows |
| M-61 | SIPRI manual-normalized integration (P1-3 close) | (this PR) | 2026-05-18 | ✅ Import verified 2024 SIPRI data (top 10 + 5 regions); add 3 narrative supporting branches (global arms race, major powers rising, GDP share rising); document annual refresh procedure; resolves last `manual_required` external source |
| M-62 | QQQ weekly history merge (M-24 replace → isoWeek merge) | (this PR) | 2026-05-18 | ✅ Enables incremental weekly QQQ refresh; incoming wins on same isoWeek; 8 sanity checks + synthetic merge coverage; no data file changes |

---

## Section 4 · Future Considerations

- **市场温度计扩展**: 当前仅 QQQ, 可考虑加入 SPY/IWM/EFA/EEM 多资产温度计 (需要各自 60 周历史)
- **Brent 实物端**: 若未来项目预算允许, 接入 Platts Dated Brent + Baltic shipping rates
- **NLP for FOMC**: 替代 P3-10, 用开源 FOMC minutes 文本分析做 hawkishness score
- **Backtesting layer**: 历史 narrative 触发回放, 验证在 2008/2020/2022 危机解释力
- **Worker reliability**: 当前 marketConfirmationInput 来源 single worker, 考虑双 worker fallback
- **Annual SIPRI data refresh**: 每年 4/5 月 SIPRI Fact Sheet / Military Expenditure Database 发布后，更新 `config/world-order-sipri-normalized.json` 最新年度数据并触发 `Refresh World Order Stress`。估计每年 20-30 分钟。

---

## Section 5 · Audit History

| Date | Type | Auditor | Outcome | Notes |
|---|---|---|---|---|
| 2026-05-17 | 全项目数据完整性审计 | Claude (Opus 4.7) | 13 Open items 识别 (2 P0, 4 P1, 3 P2, 4 P3) | M-55b 后审计 |
| 2026-05-17 | M-56 fix + Build #74 refresh | Claude Code 诊断 + Codex 实施 | P0-1 已完成 | validate-data.mjs 修复, refresh commit `e366b60` |
| 2026-05-17 | M-57 buildMarketTemperature fix + PROJECT_BACKLOG | Codex | P0-2 解决, backlog 文件建立 | 本文件进入 check:all |
| 2026-05-17 | P1-6 realtime band completion audit + M-58 implementation | Claude Code + Codex | P1-6 resolved | 9 new DOM ids + null-safe delta formatting |
| 2026-05-17 | P1-5 GDELT Cloud v2 integration | Claude Code + Codex | P1-5 resolved | Cloud v2 Bearer API + daily refresh workflow; ACLED deferred to later M-series |
| 2026-05-17 | M-60 Pages trigger coverage audit + implementation | Codex | Pages deploy trigger hole resolved | Centralized workflow_run listener + heuristic check:pages-trigger-coverage |
| 2026-05-18 | M-61 SIPRI manual-normalized integration | Codex | P1-3 resolved | SIPRI 2024 normalized data + 3 world-order narrative supporting branches |
| 2026-05-18 | M-62 QQQ weekly history merge | Codex | M-24 weekly refresh unblocked | Replaces integral history overwrite with isoWeek-keyed merge + cross-seam guard |

---

## Section 6 · 工作流约定

### 添加新 backlog item
1. 在 Section 2 找到合适优先级 (P0/P1/P2/P3)
2. 用模板填写: 标题 + 详细描述 + 数据/字段位置 + 期望状态 + 数据源 + 类型 + 估计 PR 大小 + 备注
3. 优先级 P0 必须配修复方案; P1+ 可仅记录待评估
4. commit message: `chore: add backlog item <id> <title>`

### 完成 backlog item
1. PR merge 后, 移到 Section 3 (Completed Items) 表格
2. 填入 milestone 编号 / PR # / 完成日期 / 验证状态
3. 从 Section 2 删除原条目
4. 更新 Section 1 当前生产状态

### 归档已完成
- Completed items 不删除, 永久保留作历史
- 超过 20 项时, 按 milestone 块折叠

### 标记 Won't Fix (P3)
1. 移到 P3 sub-section
2. **必须**写明"不修原因"(设计 / 成本 / 边界)
3. 不归入 Completed Items

### 审计触发条件
1. 每次 milestone PR merge 后, 增量审计
2. 每月一次 full-project audit
3. 用户主动要求 ad-hoc audit

### Backlog 文件位置
- `docs/PROJECT_BACKLOG.md` (本文件)
- 进入 `check:all` 自动验证 (M-57 起)
- 是项目【一级契约】, 不可删除
- 应在每次 milestone PR 中 review 是否需要更新

### 新 session 启动
- AI 应主动 fetch `https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/main/docs/PROJECT_BACKLOG.md`
- 立刻知道当前状态 + 下一步该做什么

---

*本文档由 2026-05-17 全项目数据完整性审计 + M-57 实施。后续 milestone 必须维护本文件。*

---

## 🔄 Session Handoff (最新)

> 本段在每个会话结束时由 Claude 主动更新。新会话启动时优先读本段,快速对齐"上次到哪了"。
> 只保留**最新一次** handoff 状态;不要堆历史(历史看 git log)。

- **上次会话结束于**: 2026-05-19, commit `bbe28e4` (docs(agents): fix section numbering gap)
- **当前进行中**: 无活跃任务。Memory bank 定制已全部完成;check:all 67 项全绿
- **下一步建议**: 下一个功能任务从 Open Backlog 挑选 (P1-4 ACLED 或 P2-7/8/9);或直接等待下次 milestone 机会
- **阻塞或等待**: 无

