# 2026-09-18 项目健康度审计（只读）

## 范围与授权

Owner 要求对仓库做整体健康度/强壮度评估并打分。本文件记录该次**只读审计**的实测证据、修正过程和结论，经 owner 授权写入 `docs/` 作为可复用基线。

本文件不修改任何 checker 断言、不扩大 `check:all` 组成、不改变数据契约或发布契约。审计过程中未触发源刷新、付费调用、生产数据写入或部署。

## 结论摘要

- 综合评分 **7.7 / 10**（评分口径与权重见「评分明细」；本分数为加权值 7.65 的取整）。
- **未发现已证实的、可利用的高危漏洞。** 主要问题性质为工程债务与外部依赖韧性。
- 最可信的正面证据：`check:all` 离线全绿、896 项单元测试全绿、供应链锁定完整、三个线上入口均 200。
- 最可信的负面证据：`scripts/run-daily-pipeline.mjs` 为 11,212 行 / 435 个函数，且被 `AGENTS.md` §3 明文禁止大规模重写。

## 实测证据

全部命令在本机 `E:\vs mysite clone\gfrr-auto-update-site` 执行，基线 `6ab4138f`，Node v24.20.0 / npm 11.19.0。

| # | 检查项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 完整检查套件 | `npm run check:all` | exit 0，展开为 139 个叶子命令，耗时 362.8s |
| 2 | 单元测试 + 覆盖率门禁 | `npm run test:unit:coverage` | 896 / 896 通过，exit 0，69.8s |
| 3 | 覆盖率实际值 | 同上输出 | 仅 13 个 `--test-coverage-include` 文件：行 99.85% / 分支 94.10% / 函数 97.96% |
| 4 | 依赖漏洞 | `npm audit` | 0 漏洞（prod 1 / dev 4） |
| 5 | 生产依赖数量 | `package.json` | 0（无 `dependencies` 键；仅 2 个 devDependency） |
| 6 | 密钥泄漏扫描 | 6 类密钥正则扫全部 tracked 文件 | 0 命中 |
| 7 | 线上可用性 | 三个入口 HEAD 请求 | 首页 / `radar.gfrfinradar.uk` / `bubble-watch.html` 均 200 |
| 8 | CI 成功率 | `gh run list --limit 500` | 472 成功 / 22 失败 / 4 skipped / 2 cancelled = **94.4%** |
| 9 | Action 锁定 | 扫描全部 39 个 workflow | 全部使用完整 commit SHA 并附版本注释 |
| 10 | workflow 权限 | 扫描 `permissions:` 块 | 39 / 39 有显式最小权限块 |
| 11 | `check:*` 可达性 | 见 [分类提案](CHECK_ALL_COVERAGE_CLASSIFICATION.md) §1.1 的权威展开算法 | **227 / 244 可达，17 项不可达** |
| 12 | 市场定价时效 | `node scripts/check-market-pricing-freshness.mjs` | PASS（qqq:2026-09-11 / ndx:2026-09-04 / ixic:2026-09-04），exit 0 |
| 13 | 危险 DOM API | `git grep innerHTML` 限定生产渲染代码 | 0 命中 |

### CI 失败的时间分布

近 100 次 Pages 部署中，13 次失败集中在 **2026-09-17 10:35–22:23** 单一窗口，根因为 ACLED sanitizer 回归（断言期望 `weekly_validation_failed`、实得 `private_validation_failed`，并伴随 `path` 参数 `undefined`）。同日晚修复后全部成功。该事故**由检查网捕获**，非漏网故障。不应以该窗口的比例推断当前部署可靠性。

## 评分明细

| 维度 | 权重 | 得分 |
|---|---|---|
| 安全与依赖 | 15% | 9.0 |
| CI/CD 与自动化 | 20% | 8.5 |
| 测试 | 15% | 8.0 |
| 文档 | 10% | 8.0 |
| 数据可靠性与容错 | 15% | 8.0 |
| 架构与代码质量 | 15% | 5.5 |
| 可维护性与工程卫生 | 10% | 5.5 |
| **加权合计** | | **7.65 → 7.7** |

## 修正记录（重要）

首版审计存在两处**高估严重度**的错误，均已在复核中修正。保留记录以防后续重复误判。

### 修正 1：`check:all` 可达范围

| 轮次 | 结论 | 错误原因 |
|---|---|---|
| 首版审计 | 51 / 244 可达 | 只匹配 `npm run X` 文本，未展开 `check-suite.mjs` 的套件成员列表（成员为纯字符串，经 `spawnSync` 调用） |
| 首次复核 | 223 / 244 可达 | 复核脚本用的展开正则要求套件键带引号，漏掉当时唯一无引号的键 `brent:`，漏入其 3 个成员 |
| 第二次复核 | 226 / 244 可达 | 已补上 `brent` 套件；仍与项目权威算法相差 1，源于入口自身是否计入可达集合 |
| **定稿** | **227 / 244 可达** | 直接复用 `tests/unit/check-suite-wiring.test.mjs` 的权威展开算法（入口自身计入） |

根因说明：引号不一致只是**触发条件**，真正的缺陷是当时两个消费方都用

```js
source.slice(source.indexOf('const SUITES'), source.indexOf('const suiteName'))
```

按字面量切片。它会在文件中任何其它位置出现同名字面量时静默产出空切片。该脆弱点已修复：改为 `parseSuiteObject` 的括号配平解析（`scripts/review-check-all-coverage.mjs`），并对「字面量出现在对象之前」与跨 realm 相等性补充了回归测试。`check-suite.mjs` 的 9 个套件键已统一为带引号，并就地注释说明解析方式与失败行为。

首版据此提出的「保护网的心理安全感大于其实际密度」**不成立**，已撤销。实际结论是覆盖面接近完整，17 项例外均可解释（见分类提案）。

### 修正 2：`market-pricing-metrics.json` 时效

首版把该文件 `generatedAt` 早于审计日 6 天列为观察项。实测：

- workflow 为 `refresh-qqq-market-pricing.yml`，`cron: '0 8 * * 6'`，即**每周六 08:00 UTC**（周五美股收盘后）。
- `generatedAt=2026-09-12` 正是周六。
- 项目自有 checker `check:market-pricing-freshness` 返回 **PASS**。

**结论：非异常，首版观察项撤销。** 该现象是周更契约的正常表现。

### 维持不变的判断

- 生产渲染代码 0 处危险 DOM API（checker 源码中的 `/\.innerHTML\b/u` 等为正则守卫，不是 API 使用）。
- EdgeOne 的 deploy key 属发布通道凭证，与配额型数据 API（Tavily / Brave / DeepSeek / FRED / EIA / FIRMS / GDELT / Wind / ACLED）不是同类失败模式。
- 本地 Git 分支数与未跟踪残留属**本机工作区卫生**，非发布仓库质量。仓库实际跟踪 1,132 个文件。

## 成立的发现

1. **巨型冻结文件**（高优先级工程债务）：`run-daily-pipeline.mjs` 11,212 行 / 435 函数；`build-bubble-watch.mjs` 5,109 行；`validate-data.mjs` 3,335 行。`AGENTS.md` §3 禁止大规模重写它们，形成「风险最高的文件被最严格冻结」的死锁。既有缓解方向已被验证：`HEALTH_REMEDIATION_2026_09_18.md` 记录的「提取纯函数 + 6,000 次新旧输出等价比对」。建议将该模式制度化为改动时的强制伴随项，而非一次性整改。
2. **外部配额是可用性上限**：Tavily 账户额度已耗尽，恢复不在代码可控范围。现有 #403 密钥池隔离与 ADR-0059 共享账本只能减少浪费。建议在站点上显式呈现「来源降级」状态，避免静默缺失。
3. **少数未纳入主保护树的专项检查**：17 项，见 [分类提案](CHECK_ALL_COVERAGE_CLASSIFICATION.md)。非缺口，但缺显性记录。
4. **工程成熟度缺口**：无 `LICENSE`（公开仓库的法律与协作缺口，优先级最高）、无 `SECURITY.md`、无 lint / format 配置（无 eslint / prettier / editorconfig / tsconfig，`@ts-check` 0 文件）、无 CSP。
5. **可观测性改进项**：Pages 部署四次重试均带 `continue-on-error`，最终 step 汇总。设计正确，但「第 4 次重试才成功」的不稳定信号被吸收。

## 未验证项

以下在本次审计中**未**取得证据，不得据本文件推断为已通过：

- 三个线上站点仅验证 HTTP 200，未做内容级或数据一致性比对。
- `check:all` 在 CI（GitHub Actions）环境的通过情况仅依据历史运行记录，未在本轮触发。
- 浏览器验收（`npm run test:e2e`）本轮未执行；`HEALTH_REMEDIATION_2026_09_18.md` 记录的 34 项浏览器验收为上一轮回执。
- `review:*`（55）/ `monitor:*`（9）/ `audit:*`（5）共 69 个手动入口未逐项核验；非 `check:*` 脚本总计 171 个，`review|monitor|audit|diagnose|probe|analyze` 类合计 75 个。口径取前者时须注明只含三个前缀。
- 未跟踪的本地残留目录（`manual-artifacts` 815 MB、`.codex` 257 MB、`.codebase-memory` 112 MB）未做内容级清理判定。
- 未评估 Worker 运行时、KV 内容、EdgeOne 发布通道的实际线上状态。

## 方法学边界

本轮确认两条规则，建议后续审计沿用：

1. **行为与契约类结论**（可达性、时效性、降级行为、断言内容）以项目自身 checker、workflow 定义和实际运行回执为准，不以静态文件大小、文件名或 grep 计数推断。
2. **结构类结论**（文件行数、脚本数量、依赖数量）以实测度量本身为准，因为不存在为之背书的 checker；但必须区分**发布仓库事实**与**本机工作区状态**，后者不得计入项目健康度。

首版审计在规则 1 上违反两次（可达性、时效），在规则 2 上违反一次（把本机残留写为仓库膨胀）。三处均已修正。

## 关联文档

- [检查器覆盖分类提案](CHECK_ALL_COVERAGE_CLASSIFICATION.md)
- [2026-09-18 健康整改执行清单](HEALTH_REMEDIATION_2026_09_18.md)
- [项目 backlog](PROJECT_BACKLOG.md) · [文档索引](INDEX.md)
