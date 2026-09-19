import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);

/**
 * Per-category reason, boundary, and unlock path for every known exception.
 * AGENTS.md §10 forbids unexplained ignores: each category below states why the
 * script is out of `check:all`, what boundary that preserves, and what would have
 * to change before it could be added. Rationale in full:
 * docs/CHECK_ALL_COVERAGE_CLASSIFICATION.md §2.
 */
export const EXCEPTION_CATEGORIES = {
  '重复别名': {
    reason: '命令体与 check:all 内已执行的同名入口完全相同，重复执行只增时长。',
    boundary: '别名本身仍可手动运行，语义未变。',
    unlock: '若该别名开始承载与主入口不同的参数或断言，须重新分类并纳入。',
  },
  '参数变体': {
    reason: '与已纳入脚本共用同一脚本体，仅增加 flag（--verbose / --strict-live-alignment / live 输入）。',
    boundary: 'AGENTS.md §6 规定这些变体为按需诊断用途，非默认门禁。',
    unlock: '若某个变体成为常规提交要求，须单独提案并纳入 check:all。',
  },
  '已被其它入口执行': {
    reason: '实际执行已发生，由 check:all 内的其它入口调用或经等价 -runtime / 套件成员覆盖。',
    boundary: '覆盖来自现有入口，不新增执行。',
    unlock: '若上游入口停止调用它，须改为直接纳入 check:all。',
  },
  '设计上排除 · 需要网络或写入前置放行': {
    reason: '需要真实网络请求（Worker 端点）或属于生产写入前置流程，离线 check:all 不应引入。',
    boundary: '线上健康由对应 workflow 承担；离线套件保持零网络依赖。',
    unlock: '若引入可控 mock/stub 传输层，可移入 check:all。',
  },
  '设计上排除 · 写入或需手工制品': {
    reason: '会产生 ignored 的 manual-artifacts 写入或依赖手工制品。',
    boundary: 'AGENTS.md §5 规定零文件写入审计不运行该生成项。',
    unlock: '若改为只读校验已存在的制品，可移入 check:all。',
  },
  '本地开发者工具': {
    reason: 'check:changed 是 check:all 的调用方，纳入会构成自引用。',
    boundary: '它按工作区增量选择检查范围，属本地工具。',
    unlock: '不适用；由 check:all 反向调用，方向固定。',
  },
};

/** Script name -> category. Every entry must use a key defined above. */
export const EXCEPTION_CLASSIFICATIONS = {
  'check:external-ai:contract': '重复别名',
  'check:external-ai:with-artifacts': '重复别名',
  'check:data:verbose': '参数变体',
  'check:data:strict-live-alignment': '参数变体',
  'check:bubble-watch-weekly-editorial-live-input': '参数变体',
  'check:macro-risk-editorial-live': '参数变体',
  'check:bubble-watch-dom': '已被其它入口执行',
  'check:world-order-acled-weekly': '已被其它入口执行',
  'check:world-order-acled-monthly': '已被其它入口执行',
  'check:external-ai-provider-adapters': '已被其它入口执行',
  'check:external-ai-production-projection': '已被其它入口执行',
  'check:worker-health': '设计上排除 · 需要网络或写入前置放行',
  'check:external-ai-production-publish': '设计上排除 · 需要网络或写入前置放行',
  'check:external-ai-manual-scaffold': '设计上排除 · 写入或需手工制品',
  'check:external-ai-manual-input': '设计上排除 · 写入或需手工制品',
  'check:external-ai-manual-input:compact': '设计上排除 · 写入或需手工制品',
  'check:changed': '本地开发者工具'
};

/**
 * Extract the `const SUITES = {...}` object literal and evaluate it.
 *
 * Deliberately brace-balanced rather than sliced between two literal markers:
 * a marker-based slice silently breaks whenever other text in this file contains
 * the same literals, which is exactly the fragility that made the coverage
 * baseline hard to trust in the first place.
 *
 * The parsed value is round-tripped through JSON so callers receive ordinary
 * current-realm objects and arrays; `vm` otherwise yields foreign-realm values
 * whose prototypes differ, which breaks strict deep equality in tests.
 */
export function parseSuiteObject(source) {
  const start = source.indexOf('const SUITES');
  if (start === -1) throw new Error("scripts/check-suite.mjs must declare 'const SUITES'");
  const open = source.indexOf('{', start);
  if (open === -1) throw new Error("'const SUITES' must be an object literal");

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const parsed = vm.runInNewContext(`(${source.slice(open, index + 1)})`);
        return JSON.parse(JSON.stringify(parsed));
      }
    }
  }
  throw new Error('unbalanced braces in the SUITES object literal');
}

export function buildCoverageReport({ scripts, suites }) {
  const checkScripts = Object.keys(scripts).filter((name) => name.startsWith('check:')).sort();
  const reachable = new Set();
  const diagnostics = [];
  const expanding = [];

  function expand(name) {
    if (expanding.includes(name)) {
      diagnostics.push(`cycle: ${[...expanding, name].join(' -> ')}`);
      return;
    }
    if (reachable.has(name)) return;
    if (typeof scripts[name] !== 'string') {
      diagnostics.push(`missing script: ${name}`);
      return;
    }
    reachable.add(name);
    expanding.push(name);
    for (const match of scripts[name].matchAll(/npm run ([\w:-]+)/gu)) expand(match[1]);
    for (const match of scripts[name].matchAll(/node scripts\/check-suite\.mjs ([\w-]+)/gu)) {
      const suite = suites[match[1]];
      if (!suite) {
        diagnostics.push(`missing suite: ${match[1]}`);
      } else {
        for (const child of suite) expand(child);
      }
    }
    expanding.pop();
  }

  expand('check:all');
  const unreachable = checkScripts.filter((name) => !reachable.has(name));
  return {
    total: checkScripts.length,
    reachable: checkScripts.filter((name) => reachable.has(name)),
    unreachable,
    classifications: unreachable.map((name) => {
      const category = EXCEPTION_CLASSIFICATIONS[name] ?? '未分类';
      return { name, category, rationale: EXCEPTION_CATEGORIES[category] ?? null };
    }),
    diagnostics
  };
}

export function readRepositoryReport() {
  const packageJson = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));
  const suites = parseSuiteObject(readFileSync(new URL('scripts/check-suite.mjs', ROOT), 'utf8'));
  return buildCoverageReport({ scripts: packageJson.scripts, suites });
}

function printReport(report) {
  console.log('check:all 覆盖审阅（只读观察，不改变任何检查器）');
  console.log(`可达：${report.reachable.length} / ${report.total}`);
  console.log(`未达：${report.unreachable.length}`);

  // Group by category so each reason/boundary/unlock is printed once instead of
  // repeating the same paragraph for every affected script.
  const byCategory = new Map();
  for (const item of report.classifications) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, { rationale: item.rationale, names: [] });
    byCategory.get(item.category).names.push(item.name);
  }
  for (const [category, group] of byCategory) {
    console.log(`\n[${category}] ${group.names.length} 项`);
    if (group.rationale) {
      console.log(`  理由：${group.rationale.reason}`);
      console.log(`  边界：${group.rationale.boundary}`);
      console.log(`  unlock：${group.rationale.unlock}`);
    } else {
      console.log('  理由：未登记（需补 EXCEPTION_CATEGORIES 条目）');
    }
    for (const name of group.names) console.log(`  - ${name}`);
  }

  if (report.diagnostics.length) {
    console.log('\n诊断：');
    for (const diagnostic of report.diagnostics) console.log(`- ${diagnostic}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    printReport(readRepositoryReport());
  } catch (error) {
    console.log(`覆盖审阅无法完整读取，保持观察模式：${error.message}`);
  }
  process.exitCode = 0;
}
