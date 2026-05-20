# CLAUDE.md — Navigation for AI agents

> 本文档是 Claude Code 启动时的导航入口。不复制规则,只指路。
> 规则的权威来源仍是 `AGENTS.md`。

## Project

Global Financial Risk Radar (GFRR) v28 — 每日更新的机构级宏观风险简报。
在线: <https://ctmaomao.github.io/gfrr-auto-update-site/>

## Tech stack

| 层 | 技术 |
|---|---|
| Runtime | Node.js 24 (engines locked, `.nvmrc`=24) |
| Frontend | Vanilla JS + ES modules + 单页 `index.html`,无框架、无打包器 |
| Realtime | Cloudflare Workers + KV (`workers/gfrr-realtime-worker`) |
| Data | JSON files in `data/`,无数据库 |
| CI/CD | GitHub Actions × 12 → GitHub Pages |
| Dependencies | **0 production deps**,只声明 engines |

## Key commands

```powershell
npm run check:all         # 71 项串联契约检查 (提交前必跑)
npm run build:data        # Daily pipeline → data/radar-data.json
npm run build:realtime    # Realtime fallback → realtime/market.json
npm run build:world-order # World Order Stress → data/world-order-stress.json
npm run check:data        # 单跑数据 schema 校验
npm run check:dom         # DOM id 契约
```

## Memory bank — load order

**L0 — 每会话自动加载** (你正在读 L0):
- `CLAUDE.md` (本文件)
- `docs/PROJECT_BACKLOG.md` — 项目自我记忆 + 当前活跃任务 + Session Handoff
- `docs/DATA_SOURCES.md` — 10+ 外部数据源边界

**L1 — 任务相关时按需读**:
- `AGENTS.md` — AI 开发规则合约 (sections 1-9 是规则,其余索引/历史已外迁)
- `DESIGN.md` — 前端设计契约 (改 `index.html` / `assets/styles.css` / `scripts/modules/render*.js` 前必读)
- `docs/DATA_CONTRACT.md` — 改 `data/radar-data.json` 字段前必读
- `docs/OPERATIONS.md` — 运维/排障/部署
- `docs/UNIFIED_DATA_PIPELINE_ARCHITECTURE.md` — 新增数据源 / 改管线分层时
- `docs/ADR/README.md` — 重大决策索引,涉及 "为什么" 时

**L2 — 索引层**:
- `docs/INDEX.md` — 全部文档的 Current / Conditional / Historical 权威分级
- `docs/MILESTONE_INDEX.md` — M-XX milestone 索引 (默认只读 Active 段)

**L3 — 历史层**: 仅在用户明确要求查阅时读 `MILESTONE_INDEX.md` 的 Archived 段及其引用文档。

## Architecture map

- 数据管线: `docs/UNIFIED_DATA_PIPELINE_ARCHITECTURE.md` + `scripts/run-daily-pipeline.mjs`
- 前端: `DESIGN.md` + `index.html` + `scripts/modules/*.js`
- Realtime worker: `workers/gfrr-realtime-worker/README.md`

## Project absolute rules

1. **`effectiveDisplayInputs` 是当前显示值的唯一来源** — 渲染层不得绕过它使用 raw realtime values (违反 → 前后端数据漂移,决策契约失效)
2. **Worker secondary diagnostics 不影响 scoring** — VIX/Gold/DXY/US10Y/SPX secondary 只写 `/market.secondary-preview.json`,不得污染主 preview 或 `values.*` (违反 → scoring 引入未审计源)
3. **World Order 是 regime overlay,不是第七个底层风险模块** — 不得加入 scoring/decision/execution/position (违反 → 风险模型被偷换概念)
4. **External AI 是只读展示层** — 不得让其 output 影响 scoring/decision/execution/position (违反 → AI 漂移直接污染决策)
5. **改 `index.html` / `scripts/app.js` / `scripts/modules/*.js` 必须同步 bump frontend asset cache version** — 用 `npm run bump:frontend-asset-version` 自动取当前值并 bump (违反 → 用户拿到旧 JS / 旧 CSS,debug 灾难)
6. **提交前必跑 `npm run check:all`** — 71 项全绿才能提交 (违反 → CI 红,Pages 部署中断)
7. **Serial trunk mode** — 一次只推进一个逻辑任务,no stacked PR,旧 PR 不继续堆改

## NEVER

- **NEVER** 直接修改 `data/*.json` / `realtime/*.json` 作为"临时修复" → 数据契约失效,validate-data 失守
- **NEVER** 把 Daily workflow 主输入从 `realtime-data` 切到 Worker endpoint → Daily vs Worker drift 是 audit-only,切换需另开版本评审
- **NEVER** 新增 npm 生产依赖 → 项目刻意保持 0 依赖,任何依赖引入需 ADR
- **NEVER** 把 `scripts/` 下的 `console.log` 当作 debug 残留删除 → 它们是 GitHub Actions 日志输出 (feature, 见 ADR-0005)
- **NEVER** 把已合并的 milestone (M-XX) 重新打开改动 — 按 AGENTS.md "Rule of Conflict Resolution",已合并的 scope-only doc 不再是 active authority

## Session lifecycle

- **开始任务**: 自动读 L0;如任务类型清晰,按上面 L1 表读对应文件
- **任务中切会话** (长任务): 提交前在 `docs/PROJECT_BACKLOG.md` 末尾 `## 🔄 Session Handoff (最新)` 更新四字段
- **任务结束**: 更新 `PROJECT_BACKLOG.md` Section 2 (Open Backlog) 与 Session Handoff;若做了重大架构决策,追加 `docs/ADR/00XX-*.md`;不要在 CLAUDE.md 里堆 changelog

### 撞限急救清单 (context 即将耗尽时)

当感知 context 已用 ~70% 或对话开始压缩历史:

1. **立即** 写 Session Handoff 4 字段到 `docs/PROJECT_BACKLOG.md` 末尾的 `## 🔄 Session Handoff (最新)`:
   - 上次会话结束于: `<最后一次 commit sha / 当前 worktree path / 未提交改动的简短描述>`
   - 当前进行中: `<具体 P 项 + 已完成 N/M 步>`
   - 下一步建议: `<一句话:下次开打 X 文件做 Y>`
   - 阻塞或等待: `<是/否 + 等什么>`
2. 若有未提交改动 → `git status` + `git diff --stat` 输出复制进 Handoff "上次会话结束于" 段(用代码块包裹)
3. 用户 `/clear` 后,新会话第一句对 Claude 说任一句即可恢复:
   - "读 L0,继续上次的 Handoff"
   - "L0 + Handoff,接着干"
   - "按 CLAUDE.md 启动,然后接 PROJECT_BACKLOG.md 的 Handoff"
4. **不要** 试图压缩长对话以续命;Handoff 的可靠性 > 当前对话的连续性
