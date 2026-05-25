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
const radarData = JSON.parse(readText('data/radar-data.json'));
const macroDrivers = radarData.macroDrivers || {};

assert(renderSource.includes('投资级利差') || renderSource.includes('igOas'), 'B1 must surface investment-grade credit spread / igOas');
// PR 2b: igHyRatio field consumption migrated to renderThematicCards.js c3-ig-oas card
// per contract v3.0 sec 8.4 (mock 4-pillar credit sentence in buildMacroDrivers uses
// hyOas/igOas/nfci/sloosMax, does not display igHyRatio). The field consumption + UI
// display is enforced by check-thematic-cards-contract.mjs c3-ig-oas card.

assert(renderSource.includes('onRrp') || renderSource.includes('ON RRP'), 'B2 must surface ON RRP');
assert(renderSource.includes('t10y2y') || renderSource.includes('10Y-2Y') || renderSource.includes('期限利差'), 'B2 must surface 10Y-2Y term spread');
assert(renderSource.includes('walcl4wChange') || renderSource.includes('Fed 资产负债表'), 'B2 must surface Fed balance sheet 4-week change');

// PR 2b: driver-policy node was removed in Stage 8 per contract v3.0 sec 8.4
// (buildMacroDrivers simplified to mock 4-pillar object). The 4-pillar policy sentence
// uses '等待刷新' (not legacy '等待接入') when data is missing. This assertion now scans
// the entire macroDriversSource for any '等待接入' regression in the 4-pillar block.
assert(macroDriversSource && countMatches(macroDriversSource, /等待接入/gu) === 0,
  'B3 policy 4-pillar sentence must not regress to legacy "等待接入" wording (PR 2b: was previously locked to driver-policy node which was removed in Stage 8 per contract v3.0 sec 8.4; now scans macroDriversSource for the 4-pillar block)');

// PR 2b: '基于代理信号观察' was legacy driver-policy node status text wording (M-92A era).
// Stage 8 mock 4-pillar policy sentence uses structured format
// 'target midpoint X% / ZQ implied Y% / market vs Fed Zpp / regime ...', which more
// precisely expresses proxy-signal observation status. Enforcement migrated to
// check-thematic-cards-contract.mjs c2-fed-path card which locks structured policy markers.

// PR 2b: Stage 8 4-pillar macroDrivers sentences consume:
//   - onRrp (4-pillar fed sentence)
//   - t10y2y (4-pillar curve sentence; macroDrivers.curve.t10y2y is the project curve field)
//   - dxy belongs to displayInputsBaseline, not macroDrivers, and is rendered in c2-dxy.
// The us10y / dxy field consumption enforcement is preserved in
// check-thematic-cards-contract.mjs c2-us10y-curve / c2-dxy cards.
assert(macroDriversSource.includes('onRrp') || macroDriversSource.includes('ON RRP'),
  'B3 policy/liquidity ON RRP must surface in macro-drivers block (PR 2b: us10y/dxy enforcement migrated to check-thematic-cards-contract.mjs c2-us10y-curve / c2-dxy cards per contract v3.0 sec 8.4)');

// PR 2b: B4 was renamed from 'engine-financial-fragility' to 'B4 Debt' per contract v3.0
// sec 8.6 mock spec (6-card mini-grid: B1 Energy / B2 Liquidity / B3 Credit / B4 Debt /
// B5 Consumer / B6 Geopolitical). Mock does not display evidence detail on mini-cards;
// ON RRP field consumption is preserved in buildMacroDrivers driver-liquidity node.
// The macroDriversSource check below preserves the project-constitution protection that
// ON RRP must surface somewhere in the macro-drivers block.
assert(macroDriversSource.includes('onRrp') || macroDriversSource.includes('ON RRP'),
  'ON RRP must surface in macro-drivers block (PR 2b: was previously locked to engine-financial-fragility B4 card; now consumed in driver-liquidity evidence per mock sec 8.6)');

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
