import fs from 'node:fs';

const RENDER_PATH = 'scripts/modules/renderMacroOverview.js';
const PROTECTED_PATHS = [
  'data/market-pricing-history.json',
  'data/market-pricing-metrics.json',
  'data/radar-data.json',
  'data/world-order-stress.json',
];

const errors = [];
const protectedBefore = new Map(PROTECTED_PATHS.map((path) => [path, fs.readFileSync(path)]));

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readText(path) {
  return fs.readFileSync(path, 'utf8');
}

function countMatches(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function sliceFrom(source, marker, length = 2200) {
  const start = source.indexOf(marker);
  return start >= 0 ? source.slice(start, start + length) : '';
}

function assertProtectedFilesUnchanged() {
  for (const [path, before] of protectedBefore.entries()) {
    const after = fs.readFileSync(path);
    assert(Buffer.compare(before, after) === 0, `${path} must remain byte-identical during macroDrivers surfacing check`);
  }
}

const renderSource = readText(RENDER_PATH);
const macroDriversSource = sliceFrom(renderSource, 'function buildMacroDrivers', 7600);
const policySource = sliceFrom(renderSource, "id: 'driver-policy'", 1300);
const financialFragilitySource = sliceFrom(renderSource, "id: 'engine-financial-fragility'", 1600);
const radarData = JSON.parse(readText('data/radar-data.json'));
const macroDrivers = radarData.macroDrivers || {};

assert(renderSource.includes('投资级利差') || renderSource.includes('igOas'), 'B1 must surface investment-grade credit spread / igOas');
assert(renderSource.includes('IG/HY 比率') || renderSource.includes('igHyRatio'), 'B1 must surface IG/HY ratio');

assert(renderSource.includes('onRrp') || renderSource.includes('ON RRP'), 'B2 must surface ON RRP');
assert(renderSource.includes('t10y2y') || renderSource.includes('10Y-2Y') || renderSource.includes('期限利差'), 'B2 must surface 10Y-2Y term spread');
assert(renderSource.includes('walcl4wChange') || renderSource.includes('Fed 资产负债表'), 'B2 must surface Fed balance sheet 4-week change');

assert(policySource && countMatches(policySource, /等待接入/gu) === 0, 'B3 policy card context must not keep waiting-state wording');
assert(policySource.includes('基于代理信号观察'), 'B3 policy card must show proxy-signal observation status');
assert(macroDriversSource.includes('onRrp') && macroDriversSource.includes('us10y') && macroDriversSource.includes('dxy'), 'B3 policy card must reference ON RRP, US10Y, and DXY proxy signals');

assert(financialFragilitySource.includes('onRrp') || financialFragilitySource.includes('ON RRP'), 'B4 financial fragility card must reference ON RRP');

assert(countMatches(renderSource, new RegExp(['fe', 'tch\\('].join(''), 'gu')) === 0, 'renderMacroOverview.js must not add browser data fetches');
assert(!renderSource.includes(['process', 'env'].join('.')), 'renderMacroOverview.js must not read environment variables');
assert(countMatches(renderSource, /MA60|standardDeviation|zscore.*=.*[(]/gu) === 0, 'renderMacroOverview.js must not add MA60/stdDev/z-score calculation');

assert(Number.isFinite(macroDrivers?.fedLiquidity?.onRrp), 'radar-data macroDrivers.fedLiquidity.onRrp must be present');
assert(Number.isFinite(macroDrivers?.fedLiquidity?.walcl4wChange), 'radar-data macroDrivers.fedLiquidity.walcl4wChange must be present');
assert(Number.isFinite(macroDrivers?.curve?.t10y2y), 'radar-data macroDrivers.curve.t10y2y must be present');
assert(Number.isFinite(macroDrivers?.credit?.igOas), 'radar-data macroDrivers.credit.igOas must be present');
assert(Number.isFinite(macroDrivers?.credit?.igHyRatio), 'radar-data macroDrivers.credit.igHyRatio must be present');
assert((macroDrivers?.activeSignals || []).some((signal) => signal?.key === 'onRrpCritical'), 'radar-data macroDrivers.activeSignals must include onRrpCritical');
assert(macroDrivers?.gatingEvaluation?.structuralRed === true, 'radar-data macroDrivers.gatingEvaluation.structuralRed must remain true');

assertProtectedFilesUnchanged();

if (errors.length) {
  console.error('Market pricing macroDrivers surfacing: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Market pricing macroDrivers surfacing: PASS');
