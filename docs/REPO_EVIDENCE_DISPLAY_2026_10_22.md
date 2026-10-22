# 回购证据消费层收口 · 实施记录 · 2026-10-23

> 真实旧快照 2026-10-21 00:45 UTC，非当前市场、非准确率验证。未跑 Daily/realtime/provider/网络、未写 data、未 Git 写；完整检查由 Codex 执行。

## 1. 范围与文件

- `scripts/modules/macroOverviewNarrative.js`：新增 `classifyRepoEvidence`（finite + `repoSpreadDateStatus.bgcrSofr='same_day'` + 既有 regime）与共享 `repoEvidenceLabel`/`repoEvidenceNote`；policy summary/compact 按 pending/normal/stress 限定。
- `scripts/modules/renderMacroOverview.js`：pillar（保留 D0 两行严格 `Number.isFinite`、×100、`signedFixedWithZero`，合格时实际使用 `repoBp`；pending=待核验；隔夜句中性化）；C2（总是写 `c2-liquidity-repo-regime` 与 `c2-liquidity-repo-note`）；附录 `detail-fed-repo-regime` 总是写；n7 三态与 scoped 文案，score/isActive 原样。
- `index.html`：仅 C2 note id/文案、C2 分类 intro 中性方法说明、C2 与附录回购状态初始“待核验”；无 CSS/IA/颜色/字体变更。
- `tests/unit/repo-evidence-display.test.mjs`（新）：真实 render 模块（本地函数、数值 helper 与 imported display helper 均真实；仅 DOM sink 为 stub；每个 import 必须有真实 binding，否则 throw）在内联固定合成测试样本（非历史观测、非准确率证据；浏览器证据另用真实旧快照；仅真实 render 依赖字段；不读动态 `data/radar-data.json`）上调用 `deriveNarratives`/`renderC2GlobalLiquidity`/`renderDetailData`/`renderMacroDriversPillars`；逐项仅改 repo 字段，normal→stress→pending→normal(0) 恢复→pending 反复渲染验证写值与清旧态；derive 的 n1–n7 score/isActive 与基线逐项一致；TGCR 独立、malformed/0/same_day/mismatch；意外 catch 抛错。非源码 regex 代替渲染。
- `tests/unit/repo-spread-bp-display.test.mjs`（D0 单测按新资格调整）：合法 fixture 补 `same_day`+`正常`，缺失/非法断言改为待核验；保留全部原 case，继续验证真实数值 helper 的 ±2/+0 与严格排除 null/空串/false/[]/数字字符串。
- `docs/REPO_EVIDENCE_DISPLAY_2026_10_22.md`（本报告）、`docs/INDEX.md` 一行、`docs/PROJECT_BACKLOG.md` 一条、`package.json` 仅追加新测试、一次 asset bump `repo-evidence-release-1`、`docs/review-evidence/repo-evidence-20261023/` 8 图（before/after × n7/C2 × 1440/390）与 README。

## 2. 资格与文案

- 仅 `Number.isFinite(bgcrSofrSpread)`（真 0 有效）+ BGCR 腿 `same_day` + regime ∈ {正常,轻微偏离,压力,危机水平} 才判读；TGCR 错日不影响 BGCR 合格腿。
- pending（缺失/错日/unknown/未知 regime/非数字）统一“待核验”，不残留旧“正常/无压力/2019-09 不存在”。
- normal 只说该回购利差处于既有正常档，不断言三层整体；stress 只描述该利差档位；均不预测历史事件。
- n7 的 2019 组合三态：onRrp 缺失/未知名 → 无法确认；仅告急+confirmed stress → 满足（非历史概率）；其余未满足。

## 3. 验证（本地专项）

- `node --check` narrative/render/两个 test：exit 0。
- `node tests/unit/repo-evidence-display.test.mjs`：6/6 pass、0 skip（真实模块 harness，含真实 `renderDetailData`/C2/pillar 与内联 fixture baseline；非源码 regex）；`node tests/unit/repo-spread-bp-display.test.mjs`：3/3 pass、0 skip（真实 node:test harness 进程内）。
- 标准 `node --test --experimental-test-isolation=none` 合并两文件：**9/9 pass、0 fail、0 skip、exit 0**；plain `node --test` 在本 Harness `spawn EPERM`（环境性，非断言失败），由 Codex 复跑标准 runner。
- `check-null-zero-display-guards`、`check-macro-overview-narrative`、`check-dom`、`check-frontend-zh-copy`、`check-frontend-asset-version`、`check-doc-links`、`git diff --check` 均通过；完整 `check:changed`/`check:all` 由 Codex 运行，本报告不预称。
- Chrome 同快照验收（after）：主分 68/100、n7 47（潜伏）、nav 13；1440 scrollWidth 1425、390 scrollWidth 375；pillar 显示 `回购利差(BGCR-SOFR) 待核验`，C2 与附录均 `待核验`，n7 文案为“流动性模块未触发主线条件；该回购利差待核验。2019-09 组合条件无法确认。”；warm/paper 与 serif 未变；server 已停、viewport 已恢复。属 2026-10-21 旧快照，非当前市场、非准确率。

## 4. 边界

- 不改 `buildCrossValidationMatrix.js`、pipeline、生产 data、workflow、checker assertions、评分/decision、冻结 `realtime.js`、依赖。
- `docs/review-evidence/repo-evidence-20261023/` 的 8 图为原始字节未修改；before/after 同一真实旧快照（2026-10-21），非当前市场、非准确率；after fact 仅描述该快照下的显示状态。

## 5. r2 窄修（N1/N2/N3/N7）

- 附录同段去矛盾：`但美元流动性三层主流仍处于…状态` → `但美元流动性分项资料：模块状态…`；`SOFR/EFFR 锚定` → `SOFR/EFFR 参考读数`；`detail-fed-repo-regime` 去掉固定 `class="ok"`（无 class 的中性 code），不加 id/CSS，其它附录不动；静态断言锁定该段无“三层主流/锚定”且 repo 不固定 ok。
- 测试内联 fixture 替代动态 `data/radar-data.json`（真实浏览器仍读真实数据）；所有 import 真实 binding 否则抛错，无 `()=>0` 后备；C2/detail/pillar 增加 pending→normal 真 0 恢复；n1–n7 基线对账保留。
- 8 图仍为 n7/C2 视图（未受附录窄句影响），附录 r2 由 Codex 另做专项浏览器验收并在 delta review 覆盖；不第二次 bump，不改 matrix/evidenceHighlights/其它 null formatter。
- 附录 r2 真实验收（Codex Chrome，2026-10-23）：1440/390 均显示待核验、class 为空、墨色；main 68、nav 13、scroll 1425/375；证据 `d-r2-appendix-{1440,390}.jpg` 与 facts 在原 root 合同目录，不入本包正式截图；server 已停、视口已恢复。
