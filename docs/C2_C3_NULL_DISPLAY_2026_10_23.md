# C2/C3 缺失态展示修复 · 实施记录 · 2026-10-23

> 展示修复；不改评分/decision/data/workflow/source/frozen realtime/checker/deps。基于 `f6307052`（F 已合并）的 `c2-c3-null-display` worktree；本包实施 DeepSeek，after/full/coverage/独立 review 由 Codex 完成。

## 1. 范围与实现

- C2 选中流动性/政策字段：reserveBalances、walcl、onRrp 及各自 4w/WoW；SOFR/EFFR、BGCR/TGCR；policy futureMinusTargetMid、targetMid、fedFundsFutureFrontPrice/ImpliedRate、zq/sr3 front、ois 1y、dot。
- C3 选中字段：HY OAS、IG OAS、IG 1d/IG-HY ratio；CRE 违约率/QoQ、核销率、SLOOS 非农非住宅/建筑/多家庭/紧缩峰值。F NFCI 区块保持原样（tone/C3/pillar/n6）。
- 本地 `strictFiniteDisplay` 仅用于这些字段：`Number.isFinite`、真 0 有效、null/undefined/空串/布尔/数组/对象/数字字符串/NaN 不转 0；不替换全局 `asNumber`，不并入 DXY/gold/curve/铜金等其它 C2/C3 字段。
- 每片叶子总是重写；缺失 `—`。成对腿分别格式化（SOFR/EFFR、BGCR/TGCR、front/implied、zq/sr3），一腿缺失不抹掉另一腿；amount 与 change 也分别保留。所有有效值才进 `formatPct/formatBps/formatM/formatT`，避免内部 `asNumber(null)→0`；无 raw `.toFixed` 空值路径。
- HY 保持 `__effectiveDisplayInputs.hyOas → displayInputsBaseline.hyOas → credit.hyOas` 优先顺序；每候选 `Number.isFinite`，无效候选不阻断后续有效 fallback，真 0 优先。
- 缺 leaf 不重算 producer aggregate；聚合 regime 本身缺失/未知才 pending。badge 统一中文“待核验”，沿用既有 `.status-bar.pending`/`.badge.pending`。
- CRE 同卡：canonical 恶化 red、紧绷 yellow、稳定/改善/宽松 green；既有观察 yellow/压力 red alias；未知 pending。静态 meta 改“既有组合档位：违约 / 核销 / 信贷标准”，不改 producer 阈值/公式/不重算 grade；checker 无 assertion 变更（已跑 CRE checker）。
- HY/IG 静态 note 改中性用途说明：HY“高收益债利差用于观察企业融资风险，结合有效利差和周变化判读。”；IG“投资级债利差用于观察优质企业融资条件，结合有效利差与投资级/高收益比判读。”不新增 DOM id，不改 grade。
- 静态 3 处窄 hunk：HY note、IG note、CRE meta；其余静态不变；未改评分/n1–n7/decision。
- HY `windowStatus=ready` 时 changeBp/changePct 逐腿保留：一侧缺失显示“— / +x%”或“+xbp / —”，两侧都缺“— / —”；仅非 ready 才显示窗口进度。
- `c2-fed-path-aux` 按 pipeline 取数语义改为“市场定价与目标中值差”；数值×100、单位与 tone 阈值不变（`futureMinusTargetMid = impliedRate - targetMid`）。

## 2. 当前基线与事实

- 真实快照 `2026-10-23T00:48:31.687Z`，`data/radar-data.json` sha256 `e0d5…`；17 JSON hashes 与中央 `g-release-browser-baseline.json` 一致。
- before：main 68/100、nav 13、n6 分数 32 潜伏、scroll 1425/375；所有目标字段当前有值（真实未触发缺失）；CRE 违约 1.53/核销 0.143/SLOOS max -3.7/稳定 GREEN；NFCI -0.496/4w +0.032/温和宽松 GREEN。
- 缺失/非法/true0 均为合成验证，不称当前真实市场触发。Codex 已拍 before C2 两视口、C3 桌面 HY、手机 CRE；after 8 图待 Codex 重定位/登记。

## 3. 验证

- 新 `tests/unit/c2-c3-null-display.test.mjs`：真实 renderer、源码 query 动态 import、真实 helpers、仅 DOM stub、`console.error` 抛错、结束恢复 `global.document`；VM 仅提取真实 `classifyCreStressRegime`，不执行 pipeline。
- 覆盖 C2/C3 全 missing → 单腿/部分 missing → true0 → 正常；C2 成对腿/amount/change；C3 HY fallback（含 0 优先、空串/NaN/数字字符串不阻断）、ready 周变化双向 partial/true0、IG、CRE；重复清旧；CRE canonical/alias/unknown；F NFCI 保持；输入与 n1–n7 score/isActive 不变；静态 HY/IG note 与 CRE meta。
- 结果：G test **6/6 pass、0 skip**；F 4/4、旧 D0 3/3；node --check、null-zero、CRE、dom、zh-copy、doc-links、diff 通过。完整 full/coverage 由 Codex 执行，本报告不预称 full/CI。

## 4. 证据与边界

- `docs/review-evidence/c2-c3-null-20261023/` 已登记 before 4 图 + after 4 图（C2 两视口 + C3 桌面/手机，合计 8 图）与 README；实际格式为 JPEG（`.jpg` 正确，不是 PNG 误命名），已逐图验尺寸/SHA256。
- before 为 Oct 23 同 G worktree 未改版；after 为 Oct 24 对同一 17 JSON 快照的真实当前展示。**两批图都不是当日行情**；after 事实 main 68/nav13/n6 32、NFCI -0.496/温和宽松 GREEN、CRE 1.53/稳定 GREEN、目标 rect top≈0、无横溢。
- 当前所有目标字段有值；missing/partial/true0 仅为合成测试，不声称实际发生。四卡截图仅展示对照，不作准确率/历史标签。
- 本包仅本地证据登记与冻结；未 full/coverage/独立 review/publish/commit/push。Codex 完整检查待跑；本 PR 符合 DESIGN.md 的所有规则，无新 section/nav/颜色/字体/阈值。
