import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(pathname) {
  return readFileSync(resolve(pathname), 'utf8');
}

const radarData = JSON.parse(readText('data/radar-data.json'));
const runDailyText = readText('scripts/run-daily-pipeline.mjs');
const renderMacroText = readText('scripts/modules/renderMacroOverview.js');
const renderText = readText('scripts/modules/render.js');
const matrixText = readText('scripts/modules/buildCrossValidationMatrix.js');
const dataContractText = readText('docs/DATA_CONTRACT.md');

const brentLayer = radarData?.brentPricingLayer;
if (!brentLayer || typeof brentLayer !== 'object') {
  fail('brentPricingLayer is missing or not an object');
} else {
  const m49Fields = ['ulsdPrice', 'ulsd4wChange', 'crackSpread', 'crackSpread4wChange', 'crackSpreadRegime'];
  for (const field of m49Fields) {
    if (!(field in brentLayer)) {
      console.warn(`[M-49 soft warn] brentPricingLayer.${field} key is absent in committed data. Expected until next daily-pipeline refresh.`);
    }
  }

  if (!('ulsdSourceStatus' in brentLayer)) {
    console.warn('[M-49 soft warn] brentPricingLayer.ulsdSourceStatus key is absent in committed data. Expected until next daily-pipeline refresh.');
  }

  if (!brentLayer.futuresCurve || typeof brentLayer.futuresCurve !== 'object') {
    fail('brentPricingLayer.futuresCurve is missing or not an object');
  } else {
    const allowedCurveStatuses = new Set(['live_structure_only', 'fallback_structure_only', 'missing']);
    if (!allowedCurveStatuses.has(brentLayer.futuresCurve.curveStatus)) {
      fail(`brentPricingLayer.futuresCurve.curveStatus is not supported: ${brentLayer.futuresCurve.curveStatus}`);
    }
    if (!Array.isArray(brentLayer.futuresCurve.contracts)) {
      fail('brentPricingLayer.futuresCurve.contracts must be an array');
    }
  }

  if ('crackSpread' in brentLayer && brentLayer.crackSpread !== null && !Number.isFinite(brentLayer.crackSpread)) {
    fail(`brentPricingLayer.crackSpread must be number or null, got: ${typeof brentLayer.crackSpread}`);
  }
  if ('crackSpread' in brentLayer && Number.isFinite(brentLayer.crackSpread)) {
    if (brentLayer.crackSpread < -30 || brentLayer.crackSpread > 120) {
      fail(`brentPricingLayer.crackSpread out of expected range [-30, 120], got: ${brentLayer.crackSpread} (likely unit conversion error: ULSD x 42 - Brent)`);
    }
  }
  if ('crackSpreadRegime' in brentLayer && brentLayer.crackSpreadRegime !== null && typeof brentLayer.crackSpreadRegime !== 'string') {
    fail(`brentPricingLayer.crackSpreadRegime must be string, got: ${typeof brentLayer.crackSpreadRegime}`);
  }

  if (Array.isArray(brentLayer.dataGaps)) {
    const hasCrackSpreadGap = brentLayer.dataGaps.some((gap) =>
      typeof gap === 'string' && gap.includes('裂解价差')
    );
    if (hasCrackSpreadGap) {
      console.warn('[M-49 soft warn] committed brentPricingLayer.dataGaps still contains crack-spread gap. Expected until next daily-pipeline refresh.');
    }
  }
}

const runDailyMarkers = [
  "fetchFredSeries('DHOILNYH', 60)",
  'async function resolveUlsd(prevBrentPricingLayer)',
  'function classifyCrackSpreadRegime(crackSpread)',
  'ulsdPrice * 42 - selectedBrent.value',
  'computed >= -30 && computed <= 120',
  'const crackSpreadRegime = classifyCrackSpreadRegime(crackSpread)',
  'resolveUlsd(prevData?.brentPricingLayer)',
  'async function resolveBrentFuturesCurve(prevBrentPricingLayer)',
  'ICE_BRENT_FUTURES_DATA_URL',
  'parseIceBrentFuturesContracts',
  'ulsdData'
];

for (const marker of runDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`scripts/run-daily-pipeline.mjs missing M-49 marker: ${marker}`);
  }
}

const renderMarkers = [
  'brentLayer.crackSpread',
  '柴油裂解价差',
  'Platts Dated Brent / 正式 Dated Brent 未接入。',
  'ICE Brent futuresCurve structure-only'
];

for (const marker of renderMarkers) {
  if (!renderMacroText.includes(marker)) {
    fail(`scripts/modules/renderMacroOverview.js missing M-49 marker: ${marker}`);
  }
}

const brentDetailRenderMarkers = [
  'ULSD 4周变化',
  'crack spread 4周变化',
  'brentPricingLayer.ulsdPrice',
  'brentPricingLayer.ulsd4wChange',
  'brentPricingLayer.crackSpread4wChange',
  'formatBrentFuturesCurve'
];

for (const marker of brentDetailRenderMarkers) {
  if (!renderText.includes(marker)) {
    fail(`scripts/modules/render.js missing Brent detail render marker: ${marker}`);
  }
}

const matrixMarkers = [
  'const crackSpread = finite(brentLayer.crackSpread);',
  'DHOILNYH-Brent',
  '实物供应紧张',
  '经济需求疲软'
];

for (const marker of matrixMarkers) {
  if (!matrixText.includes(marker)) {
    fail(`scripts/modules/buildCrossValidationMatrix.js missing M-49 marker: ${marker}`);
  }
}

const contractMarkers = [
  'FRED:DHOILNYH',
  'DHOILNYH × 42',
  'crackSpread4wChange',
  'ulsdSourceStatus',
  'futuresCurve'
];

for (const marker of contractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`docs/DATA_CONTRACT.md missing M-49 marker: ${marker}`);
  }
}

if (errors.length > 0) {
  console.error('Brent crack spread check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log('Brent crack spread check: PASS');
