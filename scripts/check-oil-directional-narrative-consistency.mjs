import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const errors = [];

function readText(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
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
  requireAll(`fixture ${testCase.name}`, renderer, testCase.requiredRendererTokens || []);
}

requireAll('renderer FINAL_BIAS_ZH', renderer, [
  "false_down_physical_stress: '假性下跌 · 物理压力仍强'",
  "false_up_unconfirmed: '假性上涨 · 缺物理确认'",
  "insufficient_data: '数据不足 · 暂不判断'",
]);

requireAll('renderer DIVERGENCE_ZH', renderer, [
  "false_down_physical_stress: '价格下跌 · 物理仍紧'",
  "false_up_unconfirmed: '价格上涨 · 物理偏松'",
]);

const falseDownHeadline = sectionBetween(
  renderer,
  "case 'false_down_physical_stress':",
  "case 'false_up_unconfirmed':",
);
requireAll('false_down_physical_stress headline', falseDownHeadline, [
  '价格回落',
  '物理链仍偏紧',
  '下跌未获物理确认',
]);

const falseUpHeadline = sectionBetween(
  renderer,
  "case 'false_up_unconfirmed':",
  "case 'strong_bullish':",
);
requireAll('false_up_unconfirmed headline', falseUpHeadline, [
  '价格走高',
  '物理链偏松',
  '上涨缺物理确认',
]);

const insufficientHeadline = sectionBetween(
  renderer,
  "case 'insufficient_data':",
  'function sourceStatusShort',
);
requireAll('insufficient_data headline', insufficientHeadline, [
  '本周物理链数据不足',
  '暂不给出方向判断',
]);

const insufficientBranch = sectionBetween(
  renderer,
  '// insufficient_data ->',
  'renderGlobalOverlayCard',
);
requireAll('insufficient_data render branch', insufficientBranch, [
  '暂不判断',
  '本周物理链数据不足',
  '市场层等待完整物理链',
  '不替代缺失的周度物理锚',
]);

requireAll('high-frequency watch boundary', renderer, fixtures.watchLayerRequiredTokens || []);

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
