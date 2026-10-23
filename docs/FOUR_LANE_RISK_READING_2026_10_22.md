# 四层风险证据展示 · 实施记录 · 2026-10-23

> Display-only. 生产 HOLD、`fourTier=null`、`accuracy=not_assessed`。基于 `6a2329fa` latest main（D 已合并）的 `four-lane-release` worktree。未跑 Daily/realtime/provider/网络，未改 data/workflow/checker/scoring/冻结 realtime。

## 1. 范围与文件

- 新增 `scripts/modules/fourLaneReadout.js`、`scripts/modules/renderFourLaneReadout.js`；只读 `data/radar-data.json` 已发布字段，不建立新主分。
- `index.html` 仅在 Hero `.big-right`、`#hero-verdict-headline` 后插入 `<dl id="hero-four-lanes" class="hero-four-lanes" hidden></dl>`；无新一级 section/nav。
- `assets/styles.css` 仅新增 `.hero-four-lanes` / `.hero-lane-*` 规则，含 `.hero-four-lanes[hidden]{display:none}`；沿用 paper/serif/mono token，无新色/字体。
- `scripts/modules/renderMacroOverview.js` 仅新增 import 与 `renderFourLaneReadout({ radarData })` 调用（renderHero 后、threshold 前；radarData null 也会到 renderer 清空 host）。
- 测试：新增 `four-lane-readout.test.mjs`（真实 builder，3 tests）与 `four-lane-render.test.mjs`（真实 renderer+真实 builder、仅 fake DOM，5 tests）。
- `package.json` 仅追加上述两个展示 test；一次 asset bump `four-lane-release-1`；本报告 + INDEX 一行 + backlog 一条。
- **未复制** `four-lane-separation.test.mjs`、`four-lane-axis.json`、`scripts/research/four-lane-separation.mjs`；原 root 原样保留，不重跑 359 周研究。

## 2. 四层展示语义

- **连续金融压力**：总分 `null`，headline “综合读数待验证”；只列 HY OAS / IG OAS / NFCI / VIX 参考值及原始观察日。VIX 无已接入源日期时显示“观察日未知”，不借用快照 updatedAt；非法/未来/晚于快照的源日期被拒绝。真 0 是有效值，显示 `0.00`。
- **结构脆弱性**：总分 `null`，headline “未建立总分”，仅列杠杆/偿债/估值覆盖缺口。
- **独立冲击警报**：tail 每条记录保留 `floor`/状态/expiry；floor 明写“原模型保底阈值 68”等，不输出裸数冒充新压力分。`transport` 仅在 `applied=true` 时计入警报数；applied=false/0 贡献明确“未触发/阻塞，不计入警报”，但保留记录与历史/过期/未知状态。
- **tail 记录资格**：`reasons` 缺失 → “冲击记录未知”；存在但无有效记录 → “记录无法校验”；有效空数组 → “快照未记录触发”。tail 部分无法校验或 transport 未知时，标题保留已知计数并标“部分记录待核验”，不称完整确认；无已知记录时用“冲击记录未知/记录无法校验”。不把缺字段/坏记录静默说成无风险。
- **数据可信度**：数值覆盖、快照时效、源日期三分；`9/9` 时仍称“主表数值齐全，源日期未齐”；过期只称“历史快照记录”，不称当前正常。snapshot 标签沿用既有 `snapshotDisplayHealth`。
- **重复/null**：renderer 每次 `replaceChildren`，null radarData 清空并 `hidden=true`；`.hero-four-lanes[hidden]` 防止 grid 覆盖 HTML hidden。
- 不改主分、score、decision/position、tail floor 或 transport 贡献；不新增阈值/源/概率/准确率。

## 3. 验证（本地）

- `node --check` 两个模块 + 两个 test：exit 0。
- `node tests/unit/four-lane-readout.test.mjs`：**3/3 pass、0 skip**；`node tests/unit/four-lane-render.test.mjs`：**5/5 pass、0 skip**。
- 真实 latest snapshot 只读 render 抽样：4 行、主分字段未动；当前 `transport.applied=false/0` 显示“1 条快照记录”（tail 1，不计 transport）+“运输 未记录触发/阻塞 · 未触发/阻塞，不计入警报”；floor 显示“原模型保底阈值 68”。snapshot `2026-10-23T00:48:31.687Z`；before facts 为主分 68/100、nav 13、1440 scroll 1425、390 scroll 375。
- Chrome after（同 worktree、同 2026-10-23T00:48:31.687Z 快照）：1440/390 均 4 行；主分 68/100、nav 13；scrollWidth 1425/375；paper/serif/ink/warm 保持。before/after 四图与 README 已登记在 `docs/review-evidence/four-lane-20261023/`。
- 完整 `check:changed`/`check:all`、coverage 与独立 review 仍待 Codex 执行；本报告不预称通过。

## 4. 边界与后续

- 不改 `buildCrossValidationMatrix.js`、pipeline、生产 data、workflow、checker assertions、评分/decision、冻结 `realtime.js`、依赖；不新增付费/provider/Daily 调用。
- before/after 图为 `docs/review-evidence/four-lane-20261023/{before,after}-hero-{1440,390}.jpg`，README 记录 17 JSON hashes 基线与同快照事实；after 已完成，完整 check 尚待。
- 本 PR 符合 DESIGN.md 的所有规则；仅 Hero 内证据行，无新 section/nav/颜色/字体。
