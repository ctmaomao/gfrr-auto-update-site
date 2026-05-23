import fs from 'node:fs';

// Ignore list: empty. M-92A uses explicit selectors and bounded helper block
// markers, so no legacy renderer range needs to be skipped for this contract.
const IGNORE_RANGES = [];

const RENDER_PATH = 'scripts/modules/renderMacroOverview.js';
const source = fs.readFileSync(RENDER_PATH, 'utf8');
const errors = [];

const summaryElements = [
  'overall-judgment',
  'score-trend',
  'top-risks',
  'noise-divergence',
  'data-health',
  'state-conclusion',
];

const allowedStatePhrases = [
  '数据降级，维持观察',
  '系统性风险观察',
  '局部冲击观察',
  '压力上升观察',
  '压力边际缓和',
  '维持当前判断',
  '常态观察',
  '证据不足，等待确认',
];

const forbiddenMarkers = [
  'decisionModel',
  'executionLock',
  'positionGuidance',
  'Action Queue',
  'Trigger Monitor',
  'Invalidation Rules',
  '操作建议',
  '交易建议',
  '建议减仓',
  '建议加仓',
  '买入',
  '卖出',
  '做多',
  '做空',
];

function fail(message) {
  errors.push(message);
}

function requireIncludes(haystack, needle, context) {
  if (!haystack.includes(needle)) fail(`${context} missing marker: ${needle}`);
}

function getTodayRenderBlock() {
  const start = source.indexOf("const today = appendSection(container, '今日总判断', 'macro-overview-hero editorial-first-fold', 'homepage-today-judgment')");
  const end = source.indexOf("const pressure = appendSection(container, '主要压力来源'", start);
  if (start === -1 || end === -1 || end <= start) {
    fail('renderMacroRiskOverview must create a bounded homepage-today-judgment block before pressure sources');
    return '';
  }
  return source.slice(start, end);
}

function getHelperBlocks() {
  const blocks = [];
  const startMarker = '// M-92A today-summary helper block start.';
  const endMarker = '// M-92A today-summary helper block end.';
  let offset = 0;
  while (offset < source.length) {
    const start = source.indexOf(startMarker, offset);
    if (start === -1) break;
    const end = source.indexOf(endMarker, start);
    if (end === -1) {
      fail('M-92A helper block start must have a matching end marker');
      break;
    }
    blocks.push(source.slice(start + startMarker.length, end));
    offset = end + endMarker.length;
  }
  if (!blocks.length) fail('M-92A helper block markers are required');
  return blocks;
}

function checkIgnoreList() {
  if (IGNORE_RANGES.length !== 0) fail('today-summary checker ignore list must remain empty unless each range is justified');
  if (!source.includes('TODAY_SUMMARY_STATE_PHRASES')) fail('renderer must define TODAY_SUMMARY_STATE_PHRASES');
}

function checkTodaySelectors() {
  requireIncludes(source, 'homepage-today-judgment', RENDER_PATH);
  const todayBlock = getTodayRenderBlock();

  for (const element of summaryElements) {
    const marker = `data-today-summary-element', '${element}'`;
    requireIncludes(source, marker, RENDER_PATH);
    requireIncludes(todayBlock, marker, 'homepage-today-judgment render block');
  }

  requireIncludes(todayBlock, 'today.appendChild(summaryGrid)', 'homepage-today-judgment render block');
  if (/container\.appendChild\(\s*summaryGrid\s*\)/u.test(todayBlock)) {
    fail('today summary grid must be appended under the today section, not directly under the container');
  }
}

function checkScoreChange7d() {
  const todayBuilderStart = source.indexOf('function buildTodayJudgment');
  const todayBuilderEnd = source.indexOf('function buildPressureSources', todayBuilderStart);
  const builderBlock = todayBuilderStart >= 0 && todayBuilderEnd > todayBuilderStart
    ? source.slice(todayBuilderStart, todayBuilderEnd)
    : '';
  if (!builderBlock) fail('buildTodayJudgment block must be discoverable');
  requireIncludes(builderBlock, 'scoreChange7d', 'buildTodayJudgment');
  requireIncludes(source, "data-summary-metric', 'score-change-7d'", RENDER_PATH);
  requireIncludes(source, '7日变化', RENDER_PATH);
}

function checkStateConclusionEnum() {
  for (const phrase of allowedStatePhrases) {
    requireIncludes(source, phrase, 'TODAY_SUMMARY_STATE_PHRASES');
  }

  const helperSource = getHelperBlocks().join('\n');
  const selectorStart = helperSource.indexOf('function selectTodayStateConclusion');
  const selectorSource = selectorStart >= 0 ? helperSource.slice(selectorStart) : '';
  for (const phrase of allowedStatePhrases) {
    requireIncludes(helperSource, phrase, 'M-92A helper block');
  }
  if (!/function\s+selectTodayStateConclusion\s*\(/u.test(helperSource)) {
    fail('selectTodayStateConclusion helper is required');
  }
  if (/return\s+['"`]/u.test(selectorSource)) {
    fail('state conclusion helper must return TODAY_SUMMARY_STATE_PHRASES enum values, not inline phrases');
  }
  if (!/stateConclusion\s*=\s*selectTodayStateConclusion/u.test(source)) {
    fail('buildTodayJudgment must derive stateConclusion via selectTodayStateConclusion');
  }
}

function checkForbiddenHelperMarkers() {
  const helperSource = getHelperBlocks().join('\n');
  for (const marker of forbiddenMarkers) {
    if (helperSource.includes(marker)) {
      fail(`M-92A helper block must not reference forbidden marker: ${marker}`);
    }
  }
}

function main() {
  checkIgnoreList();
  checkTodaySelectors();
  checkScoreChange7d();
  checkStateConclusionEnum();
  checkForbiddenHelperMarkers();

  if (errors.length > 0) {
    console.error('Today summary card contract: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Today summary card contract: PASS');
}

main();
