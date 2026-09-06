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
| CI/CD | GitHub Actions（数量以 `.github/workflows/` 实际文件为准）→ GitHub Pages |
| Dependencies | **0 production deps**,只声明 engines |

## Key commands

```powershell
npm run check:changed     # 本地按变更选文档/完整检查；部署仍用 check:all
npm run check:all         # 完整检查，含 ignored 手工输入产物
npm run build:data        # Daily pipeline → data/radar-data.json
npm run build:realtime    # Realtime fallback → realtime/market.json
npm run build:world-order # World Order Stress → data/world-order-stress.json
npm run check:data        # 单跑数据 schema 校验
npm run check:dom         # DOM id 契约
```

## Memory bank — load order

**L0 — 开始任务读当前部分**（历史按需）:
- `CLAUDE.md` (本文件)
- `docs/PROJECT_BACKLOG.md` — 项目自我记忆 + 当前活跃任务 + Session Handoff
- `docs/DATA_SOURCES.md` — 数据源相关任务必读对应边界

**L1 — 任务相关时按需读**:
- `AGENTS.md` — 执行、审批与验证规则；按其表格读 `docs/AGENT_DOMAIN_BOUNDARIES.md` 领域附件
- `DESIGN.md` — 前端设计契约 (改 `index.html` / `assets/styles.css` / `scripts/modules/render*.js` 前必读)
- `docs/DATA_CONTRACT.md` — 改 `data/radar-data.json` 字段前必读
- `docs/OPERATIONS.md` — 运维/排障/部署
- `docs/UNIFIED_DATA_PIPELINE_ARCHITECTURE.md` — 新增数据源 / 改管线分层时
- `docs/ADR/README.md` — 重大决策索引,涉及 "为什么" 时

**L2 — 索引层**:
- `docs/INDEX.md` — 全部文档的 Current / Conditional / Historical 权威分级
- `docs/MILESTONE_INDEX.md` — M-XX milestone 索引 (默认只读 Active 段)

**L3 — 历史层**: 用户要求历史审阅，或当前排障确需核对历史决定且已有直接指针时，读取相关 Archived 条目；不递归全读，不让历史覆盖当前授权。

## Architecture map

- 数据管线: `docs/UNIFIED_DATA_PIPELINE_ARCHITECTURE.md` + `scripts/run-daily-pipeline.mjs`
- 前端: `DESIGN.md` + `index.html` + `scripts/modules/*.js`
- Realtime worker: `workers/gfrr-realtime-worker/README.md`

## 规则与任务交接

权限、模型边界、asset bump、必跑检查和提交规则统一见 [AGENTS.md](AGENTS.md)，本导航不重复定义。未获授权不运行上面的生成命令；生成数据不是检查。

- 实施或文档同步任务：按实际影响更新 PROJECT_BACKLOG.md 对应任务和最新四字段交接；重大架构决策才新增 ADR。不为每次回答加日志。
- 只读审计/解释/设计审阅：在回复中交接，不自动写 backlog 或个人记忆。
- context 压缩不结束任务，不要求另开会话；保留进展继续执行。确需交接时记录最后基线/改动、当前任务、下一步和阻塞，不把等待远端授权或人工 review 写成全部完成。
- 个人记忆遵循平台当前机制与授权，不把 AGENTS.md 当记忆库。
