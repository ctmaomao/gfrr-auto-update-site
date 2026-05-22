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

  if (!brentLayer.futuresPriceCurve || typeof brentLayer.futuresPriceCurve !== 'object') {
    fail('brentPricingLayer.futuresPriceCurve is missing or not an object');
  } else {
    const allowedPriceCurveStatuses = new Set(['live_proxy_priced', 'fallback_proxy_priced', 'missing']);
    if (!allowedPriceCurveStatuses.has(brentLayer.futuresPriceCurve.curveStatus)) {
      fail(`brentPricingLayer.futuresPriceCurve.curveStatus is not supported: ${brentLayer.futuresPriceCurve.curveStatus}`);
    }
    if (!Array.isArray(brentLayer.futuresPriceCurve.contracts)) {
      fail('brentPricingLayer.futuresPriceCurve.contracts must be an array');
    }
  }

  if (!brentLayer.iceFuturesPriceCurve || typeof brentLayer.iceFuturesPriceCurve !== 'object') {
    fail('brentPricingLayer.iceFuturesPriceCurve is missing or not an object');
  } else {
    const allowedIcePriceCurveStatuses = new Set(['live_delayed_priced', 'fallback_delayed_priced', 'missing']);
    if (!allowedIcePriceCurveStatuses.has(brentLayer.iceFuturesPriceCurve.curveStatus)) {
      fail(`brentPricingLayer.iceFuturesPriceCurve.curveStatus is not supported: ${brentLayer.iceFuturesPriceCurve.curveStatus}`);
    }
    if (!Array.isArray(brentLayer.iceFuturesPriceCurve.contracts)) {
      fail('brentPricingLayer.iceFuturesPriceCurve.contracts must be an array');
    }
  }

  if (!brentLayer.eiaBrentSpotProxy || typeof brentLayer.eiaBrentSpotProxy !== 'object') {
    fail('brentPricingLayer.eiaBrentSpotProxy is missing or not an object');
  } else {
    const allowedEiaStatuses = new Set(['live', 'fallback', 'missing']);
    if (brentLayer.eiaBrentSpotProxy.source !== 'EIA:RBRTE') {
      fail(`brentPricingLayer.eiaBrentSpotProxy.source must be EIA:RBRTE, got: ${brentLayer.eiaBrentSpotProxy.source}`);
    }
    if (!allowedEiaStatuses.has(brentLayer.eiaBrentSpotProxy.sourceStatus)) {
      fail(`brentPricingLayer.eiaBrentSpotProxy.sourceStatus is not supported: ${brentLayer.eiaBrentSpotProxy.sourceStatus}`);
    }
    for (const field of ['price', 'dailyChange']) {
      if (brentLayer.eiaBrentSpotProxy[field] !== null && !Number.isFinite(brentLayer.eiaBrentSpotProxy[field])) {
        fail(`brentPricingLayer.eiaBrentSpotProxy.${field} must be number or null`);
      }
    }
    const limitation = String(brentLayer.eiaBrentSpotProxy.limitationZh || '');
    if (!limitation.includes('不是 Platts Dated Brent')) {
      fail('brentPricingLayer.eiaBrentSpotProxy.limitationZh must disclose it is not Platts Dated Brent');
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
  'async function resolveBrentFuturesPriceCurve(prevBrentPricingLayer)',
  'async function resolveIceBrentFuturesPriceCurve(prevBrentPricingLayer)',
  'async function resolveEiaBrentSpotProxy(prevBrentPricingLayer)',
  'parseEiaBrentSpotHtml',
  'ICE_BRENT_FUTURES_DATA_URL',
  'ICE_BRENT_CONTRACT_DATA_API_URL',
  'EIA_BRENT_SPOT_HTML_URL',
  "root: 'BZ'",
  'parseIceBrentFuturesContracts',
  'parseIceBrentContractDataRecord',
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
  'ICE Brent futuresCurve structure-only',
  'ICE Brent public delayed price curve',
  'Yahoo Brent priced futures proxy',
  'EIA Brent Spot Price FOB'
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
  'formatBrentFuturesCurve',
  'formatIceBrentFuturesPriceCurve',
  'formatBrentFuturesPriceCurve',
  'formatEiaBrentSpotProxy'
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
  'futuresCurve',
  'futuresPriceCurve',
  'iceFuturesPriceCurve',
  'eiaBrentSpotProxy',
  'EIA:RBRTE'
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
