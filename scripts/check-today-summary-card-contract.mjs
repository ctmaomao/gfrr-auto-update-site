import fs from 'node:fs';

// M-94 PR 2b: legacy M-92A 6-cell today-summary visual replaced by mock editorial-big-number hero.
// - Stage 5 (current): minimal rewrite to unblock pressure-sources entry refactor.
//   M-92A assertions (today-summary-grid / today-summary-cell / TODAY_SUMMARY_STATE_PHRASES /
//   selectTodayStateConclusion / 8 state phrases / 6 summary elements / scoreChange7d marker)
//   all removed per contract v3.0 sec 0.4 ironclad rule 6 (mock = unchanging contract).
// - Stage 9 (todo): rewrite this checker to lock mock editorial-big-number visual:
//     #homepage-today-judgment.editorial-big-number exists
//     .big-left .value contains numeric score
//     .big-left .breakdown contains '红' / '黄' / '绿' counts
//     .big-right .verdict-kicker exists
//     .big-right h2 exists
//     .big-footer contains 3 .k/.v columns (DOMINANT RISK CHAIN / WEEKLY CHANGE / DATA HEALTH)
//     sibling .threshold-block exists + .threshold-bar + 4 .zone (t-green/t-yellow/t-orange/t-red)
//     sibling .trend-block exists + .trend-svg-wrap svg
//   See contract v3.0 sec 8.1 for full mock specification.

const RENDER_PATH = 'scripts/modules/renderMacroOverview.js';
const source = fs.readFileSync(RENDER_PATH, 'utf8');
const errors = [];

// PR 2b forbidden markers preserved - these guard project constitution boundaries
// (no decision / position / action language leaking into renderer).
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

// Minimal PR 2b stage 5 contract: today-judgment block still exists in renderer.
// Full mock visual assertions (editorial-big-number / threshold-block / trend-block)
// land in stage 9 when today-judgment is rewritten per contract v3.0 sec 8.1.
function checkTodayBlockExists() {
  if (!source.includes('homepage-today-judgment')) {
    fail('renderMacroOverview must still produce a homepage-today-judgment block (mock visual to be enforced in stage 9 per contract v3.0 sec 8.1)');
  }
}

function checkForbiddenMarkers() {
  for (const marker of forbiddenMarkers) {
    if (source.includes(marker)) {
      fail(`renderMacroOverview must not reference forbidden marker: ${marker}`);
    }
  }
}

function main() {
  checkTodayBlockExists();
  checkForbiddenMarkers();

  if (errors.length > 0) {
    console.error('Today summary card contract: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Today summary card contract: PASS (PR 2b stage 5 minimal contract; full mock editorial-big-number assertions to land in stage 9)');
}

main();
