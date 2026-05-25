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
const matrixText = readText('scripts/modules/buildCrossValidationMatrix.js');
const dataContractText = readText('docs/DATA_CONTRACT.md');

const fedLiquidity = radarData?.macroDrivers?.fedLiquidity;
if (!fedLiquidity || typeof fedLiquidity !== 'object') {
  fail('macroDrivers.fedLiquidity is missing or not an object');
} else {
  const m50Fields = ['bgcr', 'tgcr', 'bgcrSofrSpread', 'tgcrSofrSpread', 'repoSpreadRegime'];
  for (const field of m50Fields) {
    if (!(field in fedLiquidity)) {
      console.warn(`[M-50 soft warn] macroDrivers.fedLiquidity.${field} key is absent in committed data. Expected until next daily-pipeline refresh.`);
    }
  }

  if (fedLiquidity.sourceStatus && typeof fedLiquidity.sourceStatus === 'object') {
    if (!('bgcr' in fedLiquidity.sourceStatus)) {
      console.warn('[M-50 soft warn] macroDrivers.fedLiquidity.sourceStatus.bgcr is absent in committed data. Expected until next daily-pipeline refresh.');
    }
    if (!('tgcr' in fedLiquidity.sourceStatus)) {
      console.warn('[M-50 soft warn] macroDrivers.fedLiquidity.sourceStatus.tgcr is absent in committed data. Expected until next daily-pipeline refresh.');
    }
  }

  if ('bgcr' in fedLiquidity && fedLiquidity.bgcr !== null && !Number.isFinite(fedLiquidity.bgcr)) {
    fail(`bgcr must be number or null, got: ${typeof fedLiquidity.bgcr}`);
  }
  if ('bgcr' in fedLiquidity && Number.isFinite(fedLiquidity.bgcr) && (fedLiquidity.bgcr < 0 || fedLiquidity.bgcr > 20)) {
    fail(`bgcr out of expected range [0, 20], got: ${fedLiquidity.bgcr}`);
  }
  if ('tgcr' in fedLiquidity && fedLiquidity.tgcr !== null && !Number.isFinite(fedLiquidity.tgcr)) {
    fail(`tgcr must be number or null, got: ${typeof fedLiquidity.tgcr}`);
  }
  if ('tgcr' in fedLiquidity && Number.isFinite(fedLiquidity.tgcr) && (fedLiquidity.tgcr < 0 || fedLiquidity.tgcr > 20)) {
    fail(`tgcr out of expected range [0, 20], got: ${fedLiquidity.tgcr}`);
  }
  if ('bgcrSofrSpread' in fedLiquidity && fedLiquidity.bgcrSofrSpread !== null && !Number.isFinite(fedLiquidity.bgcrSofrSpread)) {
    fail(`bgcrSofrSpread must be number or null, got: ${typeof fedLiquidity.bgcrSofrSpread}`);
  }
  if ('bgcrSofrSpread' in fedLiquidity && Number.isFinite(fedLiquidity.bgcrSofrSpread) && Math.abs(fedLiquidity.bgcrSofrSpread) > 1) {
    fail(`bgcrSofrSpread out of expected range [-1, 1], got: ${fedLiquidity.bgcrSofrSpread} (likely unit error; spread should be < 1% = 100bp)`);
  }
  if ('repoSpreadRegime' in fedLiquidity && fedLiquidity.repoSpreadRegime !== null && typeof fedLiquidity.repoSpreadRegime !== 'string') {
    fail(`repoSpreadRegime must be string, got: ${typeof fedLiquidity.repoSpreadRegime}`);
  }
}

const runDailyMarkers = [
  'NY_FED_SECURED_RATES_LATEST_URL',
  'async function fetchNyFedSecuredRatesLatest()',
  'const bgcrRecord = nyFedSecuredRates?.BGCR || null;',
  'const tgcrRecord = nyFedSecuredRates?.TGCR || null;',
  'function classifyRepoSpreadRegime(bgcrSofrSpread)',
  "bgcr: 'missing'",
  "tgcr: 'missing'",
  'const bgcrSofrSpread = Number.isFinite(bgcr) && Number.isFinite(sofr)',
  'const tgcrSofrSpread = Number.isFinite(tgcr) && Number.isFinite(sofr)',
  'repoSpreadRegime: classifyRepoSpreadRegime(bgcrSofrSpread)'
];

for (const marker of runDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`scripts/run-daily-pipeline.mjs missing M-50 marker: ${marker}`);
  }
}

// PR 2b: M-50 repo spread renderer markers in renderMacroOverview.js were removed in
// Stage 8 per contract v3.0 sec 8.4 (buildMacroDrivers simplified from ~618 lines to
// mock 4-pillar object; driver-liquidity sub-module's detailed evidence array and
// coverageNotes deleted). The 3 markers ('fedLiquidity?.bgcrSofrSpread' optional-chain
// literal, '回购利差 (BGCR-SOFR)' Chinese label, '跨市场融资压力等待接入。' boundary
// declaration) lived in the driver-liquidity node and are no longer rendered there.
//
// M-50 field consumption + semantic protection is preserved in:
//   - renderMacroOverview.js 4-pillar fed sentence: consumes fedLiquidity.bgcrSofrSpread
//     and renders inline as 'BGCR-SOFR ${spread}bp'
//   - renderThematicCards.js c2-usd-liquidity card: consumes fedLiquidity.bgcr /
//     fedLiquidity.tgcr / fedLiquidity.repoSpreadRegime via agg-rows '回购 BGCR / TGCR'
//     and 'repoSpreadRegime'. Enforced by check-thematic-cards-contract.mjs.
//   - matrixMarkers below: 5 markers still enforce buildCrossValidationMatrix.js
//     algorithm-side semantic contract (bgcrSofrSpread field consumption + repo
//     market pressure state classification phrases)
//   - runDailyMarkers below: 10 markers still enforce NY Fed secured rates API
//     ingestion + classifyRepoSpreadRegime function
//   - data field validation above: bgcr / tgcr / bgcrSofrSpread type + range +
//     sourceStatus validation all preserved
// Mock does not display repo spread detailed evidence in macro-drivers block per
// contract v3.0 sec 0.4 ironclad rule 6.

const matrixMarkers = [
  'const bgcrSofrSpread = finite(fed.bgcrSofrSpread);',
  'BGCR/TGCR 回购利差指标未接入',
  '回购市场压力显著确认流动性收紧',
  '回购市场正常运行，不支持流动性收紧叙事',
  'SLOOS 大型企业贷款标准净收紧'
];

for (const marker of matrixMarkers) {
  if (!matrixText.includes(marker)) {
    fail(`scripts/modules/buildCrossValidationMatrix.js missing M-50/M-46 marker: ${marker}`);
  }
}

const contractMarkers = [
  '字段 contract (v28.0M-50)',
  'NY Fed Markets secured rates API',
  'NYFED:secured-rates-latest',
  'bgcrSofrSpread',
  'repoSpreadRegime',
  '显示层渲染为 bp'
];

for (const marker of contractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`docs/DATA_CONTRACT.md missing M-50 marker: ${marker}`);
  }
}

if (errors.length > 0) {
  console.error('Fed liquidity repo spread check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log('Fed liquidity repo spread check: PASS');
