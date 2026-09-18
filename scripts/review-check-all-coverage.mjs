import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);

const EXCEPTION_CLASSIFICATIONS = {
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

function loadSuites(source) {
  return vm.runInNewContext(`${source.slice(source.indexOf('const SUITES'), source.indexOf('const suiteName'))}\nSUITES`);
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
    classifications: unreachable.map((name) => ({ name, category: EXCEPTION_CLASSIFICATIONS[name] ?? '未分类' })),
    diagnostics
  };
}

export function readRepositoryReport() {
  const packageJson = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));
  const suites = loadSuites(readFileSync(new URL('scripts/check-suite.mjs', ROOT), 'utf8'));
  return buildCoverageReport({ scripts: packageJson.scripts, suites });
}

function printReport(report) {
  console.log('check:all 覆盖审阅（只读观察，不改变任何检查器）');
  console.log(`可达：${report.reachable.length} / ${report.total}`);
  console.log(`未达：${report.unreachable.length}`);
  for (const item of report.classifications) console.log(`- ${item.name} · ${item.category}`);
  if (report.diagnostics.length) {
    console.log('诊断：');
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
