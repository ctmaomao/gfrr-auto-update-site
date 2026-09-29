# Lint 试点首测报告（2026-09-29）

- **基线**：`dacf5193`（含 PR #420 依赖契约变更）
- **范围**：手动 lint 试点；**未**接入 `check:all`、**未**接入任何 workflow、**未**启用 autofix
- **命令**：`npm run lint`（即 `eslint scripts tests workers`）
- **原始退出码**：**1**（存在 error 级诊断，符合预期，因为本阶段不抑制）
- **状态**：仅报告。不预设修复、不预设忽略；是否抑制/修复/建基线留待本报告之后决定。

## 1. 扫描规模与配置健康

| 指标 | 值 |
|---|---|
| ESLint 实际处理的文件数（去重） | **645** |
| 有诊断的文件 | 47 |
| 无诊断的文件 | 598 |
| **配置错误数**（`ruleId=null` 且非 fatal） | **0** |
| **解析失败数**（fatal） | **0** |

配置错误与解析失败均为 **0**，说明三套环境配置本身可用，下面的诊断都可归因到具体规则。

## 2. 告警分布

| 规则 | 数量 |
|---|---|
| `no-unused-vars` | **120** |
| `no-undef` | **31** |
| `no-dupe-keys` | **1** |
| **合计** | **152**（全部 error 级，warning 0） |

按顶层目录：

| 目录 | 数量 |
|---|---|
| `scripts/` | 116 |
| `tests/` | 32 |
| `workers/` | 4 |

## 3. 跨上下文诊断（单列，不计入确认缺陷）

按试点方案的约定，环境配置或跨上下文造成的诊断必须单列。

| 项 | 值 |
|---|---|
| `no-undef` 总数 | 31 |
| 其中位于 `tests/e2e/**` | **31** |
| 其中位于 `tests/e2e/**` **之外** | **0** |

**31 项全部是 `tests/e2e/*.spec.mjs` 中 `page.evaluate()` 回调内的浏览器标识符**（`document`、`window`、`getComputedStyle`、`innerWidth`）。这些回调由 Playwright 序列化后在**浏览器上下文**执行，而 ESLint 按 spec 文件的 Node 环境静态分析，因此必然报告未定义。

**结论：这 31 项不是缺陷，是已知的静态分析局限。** 按方案约定，它们**不计入"确认缺陷"数量**。

同时值得记录的是：`scripts/**` 与 `workers/**` 的 `no-undef` 为 **0**——即生产脚本与 Worker 源码中**没有**真实的未定义引用。这是环境分离配置生效的直接证据（若三套 globals 混用，这项结论就不可信）。

## 4. 分类

### 4.1 no-unused-vars（120）按性质细分

| 性质 | 数量 | 说明 |
|---|---|---|
| `_` 前缀绑定 | **43** | 事实上的"有意不使用"约定 |
| 未使用的**导入** | **13** | |
| `catch` 参数 | **3** | |
| 其它 / 未分类 | **61** | 多数为未使用的局部变量与函数 |

### 4.2 no-dupe-keys（1）—— 唯一可确认为缺陷的项

```
scripts/replay-transport-shock-confirmation-factor-free-proxy-score-candidate.mjs:260
  Duplicate key 'inputStatus'.
```

已打开核对：同一对象字面量中 `inputStatus` 在 **L255 与 L260 各出现一次**，值相同（均为 `candidate.status`），后者静默覆盖前者。**语法分析无法发现**此类问题，这正是 lint 相对现有 `check:syntax`（仅 `node --check`）的增量价值。

### 4.3 三分类汇总

| 类别 | 数量 | 依据 |
|---|---|---|
| **C. 不确定（跨上下文）** | 31 | `page.evaluate()` 回调，非缺陷 |
| **B. 有意用法** | 43 | `_` 前缀绑定 |
| **A. 确认缺陷** | **1** | `no-dupe-keys`，已逐行核对 |
| **待判断** | 77 | 13 未使用导入 + 3 catch 参数 + 61 其它 |

**"待判断"不等于缺陷**：未使用的导入**绑定**不代表整个导入无副作用（被导入模块可能有顶层副作用），因此逐项需要看代码，本报告不做此判断。

## 5. 需要后续决策的两个配置问题（本报告不处理）

### 5.1 `_` 前缀约定未被配置或记录

- 全仓 `scripts/`+`workers/` 有 **42 处** `_` 前缀声明（如 `_err`），属事实约定
- 但**无 ESLint 配置**、**无文档记录**（已搜索 `AGENTS.md`、`CLAUDE.md`、`docs/ADR/`）

因此这 43 项究竟是"配置缺失"还是"真实未使用"，取决于该项目是否承认 `^_` 为有意忽略。**这需要决定**：要么承认并在配置中明确（如 `varsIgnorePattern`/`argsIgnorePattern`），要么按真实未使用处理。本报告未擅自添加该选项。

### 5.2 内联脚本盲区

`bubble-watch.html` 含 1 个内联 `<script>`。ESLint 默认不处理 HTML，本试点**按方案约定将其列为盲区**，未引入 HTML 插件。

## 6. 复现方式

```powershell
npm run lint
# 或机器可读：
npx eslint --no-config-lookup --config eslint.config.mjs --format json scripts tests workers
```

配置要点（`eslint.config.mjs`）：

- 三套环境**范围互斥**：Node 块显式排除 `scripts/app.js` 与 `scripts/modules/**`，因为 flat config 下多块匹配同一文件时 `languageOptions.globals` 是**合并**而非替换
- Worker 块使用 `globals.worker`（实测覆盖所需 9/9 个全局），**未**手工加入 `env`、`ctx`、`ExecutionContext`、`scheduled`——前者是函数参数、后者是类型名，加入会掩盖真实的未定义引用
- 规则集为 9 条正确性规则，**无任何格式/风格规则**

## 7. 边界

- 本试点**未**接入 `check:all`、**未**接入 workflow、**未**启用 autofix、**未**批量格式化
- 仅报告，无代码修复
- `lint` 退出码为 1 是当前真实状态，未通过抑制手段使其变绿
