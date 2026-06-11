# ADR-0016: AI 泡沫监测作为第二独立页面 + 自有周更数据管线

- 状态: Accepted
- 日期: 2026-06-11

## 背景

Owner 提供了外部静态页「AI 泡沫监测 · The Bubble Watch」(23 项指标 × 6 分类的 AI 泡沫周报,报纸排版,与本站同一设计语言——它本就是 DESIGN.md 的设计参考),要求 1:1 动态复刻进本站:外观/语言/打分逻辑不变,静态数据全部换成外部源实时接入,并与主页通过书签组件互切。

## 决策

1. **独立页面,不并入 index.html IA**:`bubble-watch.html` 为站内第二页面,单文件(内联 CSS/JS),完整保留原版排版;`index.html` 的 §4.1 IA 锁定不受影响。两页以纯 CSS 书签丝带(`.page-bookmarks`)互切。
2. **自有数据管线**:`scripts/build-bubble-watch.mjs`(零依赖)周一 cron(`refresh-bubble-watch.yml`)产出 `data/bubble-watch.json` + `data/bubble-watch-history.json`;12 项指标实时接入(FRED / Yahoo Chart / SEC EDGAR / multpl / SPY holdings / Wikipedia 成份股 / OpenInsider),11 项编辑/研究类指标走 `config/bubble-watch-curated.json` 人工口径 + maxAgeDays 自动 STALE。所有自动指标 fail-closed 回退到带日期快照,不造数。
3. **打分逻辑预登记**:red_pct 四档(25/40/60)+ 加权风险分 (红+0.5黄)/23 + **分类强制升级**(红灯占比 ≥50% 的分类 ≥2 个 → 至少「高风险预警」);`check:bubble-watch` 对 verdict 做全量 replay,不可悄改。
4. **display-only 边界**:本专题不进 GFRR scoring/decision/execution/position/`effectiveDisplayInputs`;主站 `scripts/app.js` 与 `index.html` 不读 `bubble-watch.json`(boundary leaf 机器强制)。
5. **趋势图手写 SVG**:原版用 Chart.js;为守 ADR-0001 零依赖,以内联 SVG(平滑曲线 + 悬停 tooltip)等效复刻,不引入任何 vendored 库。

## 后果

- check:all 17→18 顶层项(`check:bubble-watch` 6 leaf)。
- Pages 部署清单与 push paths 登记 `Refresh Bubble Watch` / `bubble-watch.html`。
- SEC EDGAR 为新数据源(美国政府公共领域,UA 需携带联系方式);**实测 EDGAR 对数据中心 IP(含 GitHub runner)整段 403**,故 capex/FCF/NVDA 收入三项配 stockanalysis 季报镜像二级源(EDGAR → 镜像 → curated 三级 fail-closed),Cloud RPO 无镜像、EDGAR 不可达时落 curated。
- 编辑类 11 项的更新动作 = 改 `config/bubble-watch-curated.json`(value/status/note/asOfDate)后触发 workflow;超期未更新由 STALE 角标显式暴露,与原版「沿用旧口径」机制同构。
