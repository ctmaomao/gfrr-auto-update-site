import fs from 'node:fs';

const FILES = [
  'index.html',
  'scripts/modules/displayTextBuilders.js',
  'scripts/run-daily-pipeline.mjs',
  'scripts/modules/renderCharts.js',
  'scripts/modules/renderTables.js',
  'scripts/modules/renderAudit.js',
  'scripts/modules/render.js',
  'scripts/modules/decision.js'
];

const failures = [];

function contextOf(text, index, size = 36) {
  const start = Math.max(0, index - size);
  const end = Math.min(text.length, index + size);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function addFailure(file, rule, context) {
  failures.push({ file, rule, context });
  console.error(`FAIL ${file}`);
  console.error(`Copy contract failed: ${rule}`);
  console.error(`Context: ${context}`);
}

function checkSimpleIncludes(file, text, needle, rule) {
  const index = text.indexOf(needle);
  if (index !== -1) addFailure(file, rule, contextOf(text, index));
}

function checkBroadDollarAbbreviation(file, text) {
  const pattern = /广义美元(?!指数)/g;
  for (const match of text.matchAll(pattern)) {
    addFailure(
      file,
      'do not use 广义美元 as user-facing copy; use 广义美元指数.',
      contextOf(text, match.index ?? 0)
    );
  }
}

function checkDollarIndexOldName(file, text) {
  const needle = '美元指数';
  let index = text.indexOf(needle);
  while (index !== -1) {
    const prefix = text.slice(Math.max(0, index - 2), index);
    if (prefix !== '广义') {
      addFailure(
        file,
        'do not use 美元指数 as user-facing copy; use 广义美元指数.',
        contextOf(text, index)
      );
    }
    index = text.indexOf(needle, index + needle.length);
  }
}

for (const file of FILES) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP ${file}`);
    continue;
  }

  const text = fs.readFileSync(file, 'utf8');
  checkSimpleIncludes(file, text, '十亿美元', 'do not use 十亿美元 in user-facing copy; use 亿美元.');
  checkSimpleIncludes(file, text, 'Δ --', 'do not use Δ --; use 趋势待累计 when delta is unavailable.');
  checkBroadDollarAbbreviation(file, text);
  checkDollarIndexOldName(file, text);
}

if (failures.length > 0) {
  console.error(`Copy contract check failed: ${failures.length} issue(s) found`);
  process.exit(1);
}

console.log('Copy contract check passed');
