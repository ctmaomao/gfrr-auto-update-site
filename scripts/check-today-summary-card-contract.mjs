import fs from 'node:fs';

const RENDER_PATH = 'scripts/modules/renderMacroOverview.js';
const source = fs.readFileSync(RENDER_PATH, 'utf8');
const errors = [];

const requiredMarkers = [
  'function buildTodayJudgment',
  'buildModuleColorCounts',
  'buildVerdictBody',
  'scoreHistory8w',
  'overlayHistory8w',
  'appendEditorialBigNumber',
  'appendThresholdBlock',
  'appendTrendBlock',
  "today.className = 'editorial-big-number'",
  "today.id = 'homepage-today-judgment'",
  "'big-left'",
  "'TODAY JUDGMENT · 今日总判断'",
  "'value'",
  "'breakdown'",
  "'big-right'",
  "'verdict-kicker'",
  "'big-footer'",
  'DOMINANT RISK CHAIN',
  'WEEKLY CHANGE',
  'DATA HEALTH',
  "'threshold-block'",
  "'threshold-header'",
  "'threshold-bar-wrap'",
  "'threshold-bar'",
  "'zone t-green'",
  "'zone t-yellow'",
  "'zone t-orange'",
  "'zone t-red'",
  "'marker override'",
  "'trend-block'",
  "'trend-block-header'",
  "'trend-svg-wrap'",
  "appendSvgNode(wrap, 'svg'",
];

const forbiddenLegacyMarkers = [
  'TODAY_SUMMARY_STATE_PHRASES',
  'today-summary-grid',
  'today-summary-cell',
  'today-summary-score',
  'today-summary-overall',
  'today-summary-health',
  'today-summary-risks',
  'today-summary-noise',
  'today-summary-state',
  'appendTodaySummaryList',
  'appendRiskStageScale',
  'selectTodayStateConclusion',
  'buildTodayTopRisks',
  'buildTodayNoiseDivergences',
  'buildTodayDataHealth(',
  'formatTodayEvidenceLine',
  'compactSummaryText',
  'score-change-7d',
];

// PR 2b forbidden markers preserved - these guard project constitution boundaries
// (no decision / position / action language leaking into renderer).
const forbiddenConstitutionMarkers = [
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

function checkRequiredMarkers() {
  for (const marker of requiredMarkers) {
    if (!source.includes(marker)) {
      fail(`renderMacroOverview missing mock today-judgment marker: ${marker}`);
    }
  }
}

function checkLegacyRemoved() {
  for (const marker of forbiddenLegacyMarkers) {
    if (source.includes(marker)) {
      fail(`renderMacroOverview must not retain legacy M-92A today-summary marker: ${marker}`);
    }
  }
}

function checkForbiddenConstitutionMarkers() {
  for (const marker of forbiddenConstitutionMarkers) {
    if (source.includes(marker)) {
      fail(`renderMacroOverview must not reference forbidden marker: ${marker}`);
    }
  }
}

function main() {
  checkRequiredMarkers();
  checkLegacyRemoved();
  checkForbiddenConstitutionMarkers();

  if (errors.length > 0) {
    console.error('Today summary card contract: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Today summary card contract: PASS (PR 2b mock editorial-big-number + threshold-block + trend-block)');
}

main();
