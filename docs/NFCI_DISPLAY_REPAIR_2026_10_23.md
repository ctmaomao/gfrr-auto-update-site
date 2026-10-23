# NFCI 展示映射与缺失态修复 · 实施记录 · 2026-10-23

> 展示修复，不替换生产评分。基于 `552a0c13`（E 已合并）的 `nfci-display-release` worktree；未跑 Daily/realtime/provider/网络，未改 data/pipeline/decision/scoring/workflow/frozen realtime/deps。本包实施：DeepSeek；检查组织：Codex；独立审阅：DeepSeek（非 owner 人审）。

## 1. 范围与文件

- `scripts/modules/renderMacroOverview.js`：`nfciToneFromRegime` 补 canonical 五档（显著宽松/温和宽松 green、中性/温和收紧 yellow、显著收紧 red；保留宽松/边际收紧/收紧/紧张 alias；未知 pending）。C3 NFCI number/aux/note/status/badge 每次重写；`Number.isFinite` 严格资格（真 0 有效，null/undefined/空串/布尔/对象/数组/数字字符串/NaN 不转 0）；缺失/未知用 `—`、待核验与既有 `.status-bar.pending`/`.badge.pending`。
- C3 note 改“正值表示较历史平均偏紧，负值表示偏松”；不再称“方向反转”。pillar-4 用显式缺失分支 `nfci !== null ? signedFixed(nfci, 2) : '—'`，保留 required 表达式的真实用途。
- n6：**保留旧 `const nfci = asNumber(...)` 供 `n6Raw/n6Score/n6Active`**；新增仅用于 description 的 `nfciDisplay` strict binding；缺失文本 `—`，score/isActive 不变。未改 n1–n7 其它绑定。
- `index.html`：NFCI 卡 number/aux/note/status/badge 改中性占位；note 用 canonical direction；meta 解释 producer 既有五档（不新增阈值/不重算 regime）。
- 未改全局 `asNumber/signedFixed/setIndicatorStatus`；未并入 G 的其它 C2/C3 字段、风险引擎、matrix/N5。
- 一次 `nfci-display-release-1` bump；本报告 + INDEX 一行 + backlog 一条；新增 `tests/unit/nfci-display.test.mjs` 并追加 package test。

## 2. 当前基线与修复

- 当前真实快照 `2026-10-23T00:48:31.687Z`：NFCI `-0.496`、producer `温和宽松`、4w `+0.032`（浏览器基线 `nfciChange`）；旧前端 tone 未识别 `温和宽松`，`setIndicatorStatus(null)` 不写，静态 YELLOW 残留。before：主分 68/100、nav 13、n6 分数 32（潜伏）、scroll 1425/375；17 JSON hashes 与中央 `f-release-browser-baseline.json` 一致。
- 修复后当前 C3 应为 `green`/既有温和宽松、number `-0.496`、aux 同步、note canonical direction；n6 description 使用同值，但 score/isActive 仍由旧绑定计算。
- 静态卡为 pending 中性；缺失值即使 regime 宽松也 pending，不残留旧 YELLOW/+0.18/收紧/刚转正。

## 3. 验证

- 新增 `tests/unit/nfci-display.test.mjs`：真实 producer classifier（VM 只提取 `classifyNfciRegime`，不执行 pipeline）、真实 render helper、实际 source query 动态 import、DOM stub、console.error 抛错、结束恢复 global document。
- 覆盖 canonical 5 档边界/legacy alias/未知；C3 缺失/undefined/空串/布尔/对象/数组/数字字符串/NaN/true0；重复 render 清旧；pillar/n6 文本；n6 score/isActive 与旧 `asNumber` 公式逐例对账；输入/主分不变；静态卡中性。测试 fixture 为**合成代表性样本**（nfci4wChange 0.037），不是历史观测/真实市场；真实浏览器基线为 +0.032。
- `node tests/unit/nfci-display.test.mjs` **4/4 pass、0 skip**；`node --check` render/test/app；checker（null-zero 等）与 doc-links/diff 见回执。after 1440/390 已验收（main 68/nav13/n6 32 不变，NFCI -0.496/4w +0.032/温和宽松，status-bar green，serif/ink/warm，scroll 1425/375）；四图+README 已登记 `docs/review-evidence/nfci-display-20261023/`。完整 check/coverage 由 Codex 组织检查，独立审阅由 DeepSeek 完成；本报告不预称 full/CI。
- 本 PR 符合 DESIGN.md 的所有规则；仅现有卡片的展示语义/文案，无新 section/nav/颜色/字体/阈值。

## 4. 证据与冻结说明

- `before-nfci-1440.jpg` 是 F 工作区改动前真实桌面图；`before-nfci-390.jpg` 是父版本预览重拍（`four-lane-release` HEAD `b4506653…` 的 Git tree `12bf434f…` 等同 F 父 `552a0c13`，17 JSON hashes 一致），**不是 F 工作区事前捕获、不是历史线上截图、不是 mock**。最初 390 取景被异步重排挤离 NFCI，已留存中央 `*-390-framing-invalid.jpg`，不入正式证据。
- `after-nfci-1440/390.jpg` 是 F 当前真实状态，390 目标卡 top≈0 且显示 GREEN；父版本为 YELLOW、同数据。四图仅展示对照，不作准确率或历史标签。
- 完整 check/coverage/CI 与独立审阅仍待 Codex；正式文件在本补丁冻结，未 commit/push。

## 5. 完整套件失败与窄修（r2）

- Codex `npm run test:unit:coverage` 的真实日志/exit 为 exit 1：1185 tests / 1181 pass / **3 fail** / 1 existing skip；functions 97.96（不是覆盖率门槛问题）。三个 fail 全部是旧 `repo-spread-bp-display.test.mjs` 的 real pillar，`ReferenceError: nfciToneFromRegime is not defined`。
- 根因：F 的 pillar 使用真实 `nfciToneFromRegime`，旧 D0 VM 只 extract `asNumber/signedFixed/signedFixedWithZero/renderMacroDriversPillars`，隔离源码缺该 helper。
- 窄修：仅在旧 test 的 VM source 列表增加 `extract('nfciToneFromRegime')`（真实源码函数，不 fake/常量 fallback）；原 3 case/断言/fixture/catch guard 全部未动；生产 mapping 未改。
- 验证：`node --test --experimental-test-isolation=none` 合并 F 4 + D0 3 = **7/7 pass、0 skip**；app syntax/diff 通过。coverage/full 由 Codex 独立复跑，本报告不预称 PASS。
