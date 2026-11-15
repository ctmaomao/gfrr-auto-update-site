import { readJson } from './lib/check-script-helpers.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const errors = [];

function readText(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function fail(message) {
  errors.push(message);
}

function requireIncludes(scope, text, token) {
  if (!text.includes(token)) {
    fail(`${scope}: missing required token "${token}"`);
  }
}

function requireAll(scope, text, tokens) {
  for (const token of tokens) requireIncludes(scope, text, token);
}

function forbidAll(scope, text, tokens) {
  for (const token of tokens) {
    let index = text.indexOf(token);
    while (index !== -1) {
      const previousChar = text[index - 1];
      const previousTwoChars = text.slice(Math.max(0, index - 2), index);
      if (previousChar !== '不' && previousTwoChars !== '不得') {
        fail(`${scope}: forbidden token present "${token}"`);
        break;
      }
      index = text.indexOf(token, index + token.length);
    }
  }
}

function sectionBetween(text, startToken, endToken) {
  const start = text.indexOf(startToken);
  if (start === -1) return '';
  const end = text.indexOf(endToken, start + startToken.length);
  if (end === -1) return text.slice(start);
  return text.slice(start, end);
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

const rendererPath = 'scripts/modules/renderOilDirectional.js';
const zhCopyCheckerPath = 'scripts/check-oil-directional-zh-copy.mjs';
const liveDataPath = 'data/oil-directional-pressure.json';
const fixturesPath = 'docs/fixtures/oil-directional/odp-narrative-consistency-fixtures.json';

const renderer = readText(rendererPath);
const zhCopyChecker = readText(zhCopyCheckerPath);
const liveData = readJson(liveDataPath);
const fixtures = readJson(fixturesPath);

if (fixtures.schemaVersion !== 'odp-narrative-consistency-fixtures-p44') {
  fail(`${fixturesPath}: unexpected schemaVersion ${fixtures.schemaVersion}`);
}

if (fixtures.boundary) {
  requireAll('fixture boundary', fixtures.boundary, [
    'display-only',
    'NOT in values/scoring/decision/execution/position/Heatmap/cross-validation',
  ]);
} else {
  fail(`${fixturesPath}: missing boundary`);
}

if (!Array.isArray(fixtures.cases) || fixtures.cases.length < 4) {
  fail(`${fixturesPath}: expected at least 4 narrative consistency cases`);
}

// The legacy fixtures remain historical classifier samples. The approved simplification
// replaces their predictive display wording with a strict objective presentation contract.
const objectiveCases = {
  false_down_physical_stress: ['价格下跌 · 美国周度供需仍紧', '价格回落', '美国周度供需仍偏紧', '不据此认定下跌会逆转'],
  false_up_unconfirmed: ['价格上涨 · 美国周度供需偏松', '价格走高', '美国周度供需偏松', '不据此认定上涨会逆转'],
  strong_bullish: ['美国周度供需明显偏紧', '当前压力不等于后续价格预测'],
  insufficient_data: ['数据不足 · 暂不判断', '本周美国供需数据不足或已超龄', '暂不给出方向判断', '不替代缺失的美国周度依据'],
};
const seenCases = new Set();
for (const testCase of fixtures.cases || []) {
  if (!testCase.name || !testCase.finalBias) {
    fail(`${fixturesPath}: fixture case missing name/finalBias`);
    continue;
  }
  if (seenCases.has(testCase.finalBias)) {
    fail(`${fixturesPath}: duplicate finalBias fixture ${testCase.finalBias}`);
  }
  seenCases.add(testCase.finalBias);
  const requiredTokens = objectiveCases[testCase.finalBias];
  if (!requiredTokens) fail(`fixture ${testCase.name}: no objective narrative contract for ${testCase.finalBias}`);
  else requireAll(`objective fixture ${testCase.name}`, renderer, requiredTokens);
}

for (const finalBias of Object.keys(objectiveCases)) {
  if (!seenCases.has(finalBias)) fail(`missing preserved narrative case ${finalBias}`);
}

requireAll('renderer FINAL_BIAS_ZH', renderer, [
  "false_down_physical_stress: '价格下跌 · 美国周度供需仍紧'",
  "false_up_unconfirmed: '价格上涨 · 美国周度供需偏松'",
  "insufficient_data: '数据不足 · 暂不判断'",
]);

requireAll('renderer DIVERGENCE_ZH', renderer, [
  "false_down_physical_stress: '价格下跌 · 美国周度供需仍紧'",
  "false_up_unconfirmed: '价格上涨 · 美国周度供需偏松'",
]);

const falseDownHeadline = sectionBetween(
  renderer,
  "case 'false_down_physical_stress':",
  "case 'false_up_unconfirmed':",
);
requireAll('false_down_physical_stress headline', falseDownHeadline, [
  '价格回落',
  '美国周度供需仍偏紧',
  '不据此认定下跌会逆转',
]);

const falseUpHeadline = sectionBetween(
  renderer,
  "case 'false_up_unconfirmed':",
  "case 'strong_bullish':",
);
requireAll('false_up_unconfirmed headline', falseUpHeadline, [
  '价格走高',
  '美国周度供需偏松',
  '不据此认定上涨会逆转',
]);

const insufficientHeadline = sectionBetween(
  renderer,
  'function buildHeadline(',
  'function sourceStatusShort',
);
requireAll('insufficient_data headline', insufficientHeadline, [
  '本周美国供需数据不足或已超龄',
  '暂不给出方向判断',
]);

const insufficientBranch = sectionBetween(
  renderer,
  '// insufficient_data ->',
  "setLeafText('odp-reason-inventory'",
);
requireAll('insufficient_data render branch', insufficientBranch, [
  '暂不判断',
  '本周美国供需数据不足或已超龄',
  '市场、新闻与月度背景',
  '不替代缺失的美国周度依据',
]);

// Historical joint news/thermal display has retired. Require the active news-only
// safeguards instead; keeping dead satellite copy is not a presentation contract.
requireAll('active news observation boundary', renderer, [
  '观察层失败关闭',
  '不把单一路径报道写成确认事件',
  '主张方向只显示聚合计数',
  '不展示原文标题',
  '不确认霍尔木兹关闭、断供、油轮流向、炼厂事故、制裁影响或油价方向',
]);

// No legacy artifact or frontend fallback may restore predictive confirmation language.
for (const token of ['假性下跌', '假性上涨', '确认假跌', '多源部分确认', '多源同向', 'deriveDisplayGlobalOverlay', '/3 确认']) {
  if (renderer.includes(token)) fail(`retired narrative must not return: ${token}`);
}
requireAll('qualified current display', renderer, [
  'qualifyOdpDisplay(oilData, radarData)',
  'const finalBias = qualified.displayBias',
  'priceContext: qualified.priceContext',
  '油价方向暂不足判断',
  '快照生成时间不代表报价观察时间',
  '不独立确认、不提高置信',
  '缺少同日同口径两腿报价与 ULSD 观察日，不判断收窄',
]);
const currentEntry = sectionBetween(renderer, 'export function renderOilDirectional(', '__end_of_file__');
const addendumEntry = sectionBetween(renderer, 'function renderEnergyAddendum(', 'function reasonInventory(');
for (const token of ['renderSatelliteThermalWatch(', 'renderCrossConfirmation(', 'renderEvidenceReadinessMatrix(', 'renderEvidenceTimingSummary(', 'renderGlobalOverlay(', 'renderPulseFactorCheck(', 'renderBrentBasisCheck(']) {
  if (currentEntry.includes(token) || addendumEntry.includes(token)) fail(`retired display invoked by active entry: ${token}`);
  if (renderer.includes(`function ${token}`)) fail(`retired display implementation must be removed: ${token}`);
}
if (currentEntry.includes('it.attribution') || currentEntry.includes('buildGlobalLadderText(') || currentEntry.includes('buildWatchLadderText(')) {
  fail('active display must not forward legacy attribution or global/watch conclusions');
}


forbidAll('renderer overreach language', renderer, fixtures.forbiddenOverreachTokens || []);
forbidAll('renderer second-score markers', renderer, fixtures.forbiddenSecondScoreTokens || []);

requireAll('zh-copy checker action guard', zhCopyChecker, [
  'FORBIDDEN_ACTION',
  'ODP UI copy must not contain trade-action word',
]);

const finalBias = liveData.finalBias;
const interpretation = liveData.interpretation || {};
if (finalBias !== interpretation.finalBias) {
  fail(`${liveDataPath}: finalBias (${finalBias}) must match interpretation.finalBias (${interpretation.finalBias})`);
}

if (finalBias === 'insufficient_data') {
  if (liveData.signals !== null) {
    fail(`${liveDataPath}: insufficient_data must not carry signals`);
  }
  if (interpretation.dataSufficiency !== 'insufficient') {
    fail(`${liveDataPath}: insufficient_data must keep dataSufficiency=insufficient`);
  }
} else {
  if (!liveData.signals || typeof liveData.signals !== 'object') {
    fail(`${liveDataPath}: non-insufficient finalBias must carry signals`);
  }
  if (interpretation.dataSufficiency === 'insufficient') {
    fail(`${liveDataPath}: non-insufficient finalBias must not keep dataSufficiency=insufficient`);
  }
}

if (interpretation.divergence && interpretation.divergence !== 'none' && interpretation.divergence !== finalBias) {
  fail(`${liveDataPath}: divergence (${interpretation.divergence}) must match finalBias (${finalBias}) when non-none`);
}

if (finalBias === 'false_down_physical_stress') {
  const priceContext = liveData.signals?.priceContext || {};
  if (!(Number(priceContext.brentChangePct4w) < 0)) {
    fail(`${liveDataPath}: false_down_physical_stress requires negative 4w Brent price context`);
  }
  if (priceContext.curveSlopeRegime !== 'backwardation') {
    fail(`${liveDataPath}: false_down_physical_stress requires backwardation market confirmation`);
  }
}

const attribution = interpretation.attribution;
if (attribution) {
  const attributionText = collectStrings(attribution).join('\n');
  forbidAll('live attribution overreach language', attributionText, fixtures.forbiddenOverreachTokens || []);
  forbidAll('live attribution second-score markers', attributionText, fixtures.forbiddenSecondScoreTokens || []);
  if (!String(attribution.boundary || '').includes('display-only')) {
    fail(`${liveDataPath}: attribution boundary must stay display-only`);
  }
}

if (errors.length) {
  console.error('Oil Directional Pressure narrative consistency check: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Oil Directional Pressure narrative consistency check: PASS (fixtures=${fixtures.cases.length}, live=${JSON.stringify(finalBias)})`);
