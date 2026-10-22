# 原始观察日期链路 · 实施记录 · 2026-10-23

> 实施记录，非生产替换。DeepSeek 开发；本轮合并前 review 由 owner 指定的 Codex+DeepSeek 交叉 AI 审阅替代（非人审）。生产 HOLD、`accuracy=not_assessed`。未部署、未跑 Daily/realtime、未写 `data/`、未提交 Git。

## 1. 范围与文件

自含最小发布包，共 8 个文件：

1. `scripts/daily/source-observation.mjs`（新）— 严格日期/同条观测 helper。
2. `scripts/run-daily-pipeline.mjs` — 仅 1 个 import 与 5 个函数：`resolveFedLiquidity`、`resolveCredit`、`buildMissingCommercialRealEstate`、`normalizePreviousCommercialRealEstate`、`resolveCommercialRealEstate`。
3. `tests/unit/source-observation.test.mjs`（新）— VM 提取真实 resolver/normalizer 的回归测试。
4. `docs/DATA_CONTRACT.md` — 仅 optional 日期 metadata 段（Fed / Credit / CRE）。
5. `package.json` — 仅把新测试追加到 `check:pipeline-pure-helpers`。
6. `docs/PROJECT_BACKLOG.md` — 本任务 entry。
7. `docs/SOURCE_OBSERVATION_REPAIR_2026_10_22.md` — 本报告（自含）。
8. `docs/INDEX.md` — 本报告一行。

本包不改：`docs/DATA_SOURCES.md`、NFCI 方向契约（已由 ADR-0074/PR #475 处理）、回购 null 文案（ADR-0075/PR #476）、前端/asset bump、checker assertions、`data/`、scoring、decision、execution、position、workflow、冻结的 `scripts/modules/realtime.js`、依赖。

## 2. 实现

### 2.1 日期 helper（`scripts/daily/source-observation.mjs`）

- 仅接受严格 `YYYY-MM-DD` 或带时区的完整 ISO 8601；拒绝合法日期后的垃圾、Feb 30、未来日期、缺时区、越界时分秒/偏移。
- `latestDatedObservation` 只取最后一行，且该行 `value` 必须 finite；非法日期返回 `null`，不倒序寻找其它行。
- `fallbackObservation` 只在 previous value 为 finite 时返回，并单独校验 previous 日期，因此不会借用组的 `updatedAt`。
- `sameObservationDay` 对两侧做同一种严格归一化；任一侧非法返回 `null`（未知），不当作 same-day。

### 2.2 Fed（`resolveFedLiquidity`）

- 本次 run 固定 `nowIso`；DFF / SOFR / WRESBAL 用 `latestDatedObservation` 取**同一行** `{ value, date }`。
- 新增 `sourceObservedAt.{effectiveFedFundsRate,sofr,reserveBalances}`（`YYYY-MM-DD`）与 `sofrSource`。
- NYFed SOFR 只在 FRED 无值时兜底，并保存其 `effectiveDate`；FRED fallback 优先时不偷用 NYFed 新日期。
- BGCR/TGCR 保留自身 `*UpdatedAt`（ISO UTC 零点标签）；新增 `repoSpreadDateStatus.{bgcrSofr,tgcrSofr}`，**两腿独立同日 gate**：仅 `same_day` 且 value finite 才计算该腿 spread；BGCR 腿不合格时 `bgcrSofrSpread=null` 且 `repoSpreadRegime='未知'`；TGCR 错日只清 TGCR spread，不影响 BGCR/regime。

### 2.3 Credit（`resolveCredit`）

- 同一行取 NFCI / SLOOS 大 / SLOOS 小值与日期；新增 `sourceObservedAt.{nfci,sloosLarge,sloosSmall}`。
- 新增 `sourceStatus.sloosLarge` / `sloosSmall` 独立状态；**保留**旧 `sourceStatus.sloos` 共享字段及其语义（初始 `{ igOas, sloos, nfci }` 字面结构不变，再单独赋两个新键）。
- 小企业失败时 `sloosSmall='fallback'`，不再伪装成大企业 live；legacy 无日期保持 `null`。

### 2.4 CRE（`buildMissingCommercialRealEstate` / `normalizePreviousCommercialRealEstate` / `resolveCommercialRealEstate`）

- `buildMissingCommercialRealEstate` 为 5 项新增日期提供 `null` 初始值。
- `normalizePreviousCommercialRealEstate` 逐项保留/校验 5 个日期；fallback 逐项沿用对应日期；旧快照无日期保持 `null`。
- `resolveCommercialRealEstate` 每项用 `latestDatedObservation` 取值/日期，新增 `creDelinquencyUpdatedAt`、`creChargeOffUpdatedAt`、`sloosCreNonfarmNonresidentialUpdatedAt`、`sloosCreConstructionUpdatedAt`、`sloosCreMultifamilyUpdatedAt`（ISO UTC 零点标签）；fallback 逐项复用各自日期；组 `updatedAt` 不再充当季度 observation；`creLoanBalanceUpdatedAt` 原样不动。

## 3. 日期语义与边界

- 日期仅表示 **observation period**，不是 publication/PIT，也不代表 data 已重新生成。
- 原始指标值、0 表示、`sourceStatus` 语义与主分/decision 不变；派生回购利差新增“同日资格”：错日或日期未知时该腿 spread 可由有限值变 `null`（`repoSpreadDateStatus` 对应为 `mismatch`/`unknown`），从而改变 cross-validation 证据汇总。这是日期资格收紧，不是原始值改写。
- 非法/未来/缺失日期一律 `null`/`unknown`，不以 0、`updatedAt` 或其它腿日期补齐。
- `sourceStatus.*` 只是 **fetch 状态**，不是日期核验：`live` 可以与 `sourceObservedAt`/`*UpdatedAt` 为 `null` 并存；日期缺失/非法按 unknown 处理。
- FRED SOFR 值 finite 时 **NYFed 不替换**（即使 NYFed 同日），因此该腿可保守为 `null`/`未知`；NYFed SOFR 仅在 FRED 无 finite 值时兜底。这是既有 FRED 优先策略，本包不新增源选择规则、不改第 6 个函数。
- optional 字段在 catch-all 降级或旧快照中缺席时同样按 unknown/missing 处理；不以组 `updatedAt` 或另一腿日期补齐。
- 日期 helper 服务本次 run 的 US 日期标签/UTC 日期（`YYYY-MM-DD`），**不是通用时区 instant 归一化**；带偏移的跨日标签可能被判为 unknown。

## 4. 契约与当前数据

- `docs/DATA_CONTRACT.md` 仅新增 Fed `sourceObservedAt.*` / `sofrSource` / `repoSpreadDateStatus`、Credit `sourceObservedAt.{nfci,sloosLarge,sloosSmall}` + `sourceStatus.sloosLarge/sloosSmall`（保留 `sourceStatus.sloos`）、CRE 5 个 `*UpdatedAt`，并声明这些字段为 optional。
- 新增字段需**部署后下一次 Daily** 自然生成；当前已发布 `data/radar-data.json` 仍可能缺这些日期，不能把本次代码实施当作现有快照已有日期。

## 5. 验证

- `node --check scripts/run-daily-pipeline.mjs`、`scripts/daily/source-observation.mjs`、`tests/unit/source-observation.test.mjs`：exit 0。
- `node tests/unit/source-observation.test.mjs`（真实 `node:test` harness，进程内）：**9/9 pass、0 fail、0 skip**，exit 0。覆盖：严格日期/Feb30/未来/无时区/零值；Fed 同条日期与逐腿 gate（含 BGCR mismatch + TGCR same-day、unknown/缺失腿、真实 0 → `正常`）；真实 `classifyRepoSpreadRegime`（null/NaN → `未知`）；Fed/NYFed fallback 不借日期、FRED SOFR off-date/有限 fallback 与 NYFed same-day 兜底；CRE normalizer/resolver 连续两轮与 legacy 无日期；Credit IG 分支（`latestValue` + `sourceStatus.igOas==='live'`）与 NFCI/SLOOS 大/小独立状态、legacy null。
- `node --test tests/unit/source-observation.test.mjs`：**exit 1 = `spawn EPERM`**（本 Harness 沙箱环境限制，非测试失败）；完整 runner 不可用，未以隔离运行冒充标准 runner。
- `node scripts/validate-data.mjs`：`Validation passed`，exit 0（未重生成 data）。
- `node scripts/check-macro-drivers-credit-nfci.mjs`、`node scripts/check-fed-liquidity-repo-spread.mjs`、`node scripts/check-null-zero-display-guards.mjs`、`node scripts/check-doc-links.mjs`、`git diff --check`：全部 exit 0。
- 完整 `check:changed` / `check:all` 由 Codex 运行；本报告不预称其通过。

## 6. 限制与未验证

- 观察日不是 publication/PIT；上层 snapshot 的时间约束本轮仅在“不晚于本次 run”层面保证，未把 legacy fallback 与上一快照顶层 `updatedAt` 的关系伪称已校验。
- 未部署、未重生成 `data/`，因此新字段在线上快照中尚不存在；不声称已生效。
- 未评估阈值/准确率，未改变评分、decision、position 或生产模型；`accuracy=not_assessed`。
- 未新增网络、provider、依赖、provider key、data 写入或 Git 提交；未跑 Daily/realtime。
- FRED SOFR 优先、`sourceStatus` 非日期核验、optional 缺席按 unknown、helper 仅 US 日期标签——这些是**已记录限制**，本包不扩展为新的源选择策略或 status 重构。

## 7. 修订记录（r2，2026-10-23）

- 仅测试与文档：Credit sandbox 补 `latestValue` 并断言 IG 值/live；repo spread 测试改用真实 `classifyRepoSpreadRegime`，补 BGCR mismatch/TGCR same-day、unknown 腿、真实 0；补 FRED SOFR off-date/有限 fallback 与 NYFed same-day 案例。
- 文档窄说明：FRED 优先不替换、`sourceStatus`≠日期核验、optional 缺席视为 unknown、helper 日期标签范围。
- 生产实现、pipeline、package、INDEX 未改；r2 后 hash 变化，**需 Codex 重新完整 `check:changed`/`check:all`**，不能沿用 r1 hash 审阅。
