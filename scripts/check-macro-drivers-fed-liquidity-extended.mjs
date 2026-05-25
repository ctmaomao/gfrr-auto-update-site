import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(filePath) {
  return readFileSync(resolve(filePath), 'utf8');
}

const radarData = JSON.parse(readText('data/radar-data.json'));
const runDailyText = readText('scripts/run-daily-pipeline.mjs');
const dataContractText = readText('docs/DATA_CONTRACT.md');

const fedLiquidity = radarData?.macroDrivers?.fedLiquidity;
if (!fedLiquidity || typeof fedLiquidity !== 'object') {
  fail('macroDrivers.fedLiquidity is missing or not an object');
} else {
  const requiredFields = [
    'walcl',
    'walcl4wChange',
    'onRrp',
    'onRrpWeekChange',
    'regime',
    'onRrpLevel',
    'pressure',
    'sourceStatus'
  ];
  for (const field of requiredFields) {
    if (!(field in fedLiquidity)) {
      fail(`macroDrivers.fedLiquidity.${field} is missing`);
    }
  }

  for (const field of ['effectiveFedFundsRate', 'sofr']) {
    if (!(field in fedLiquidity)) {
      console.warn(`[M-41 soft warn] macroDrivers.fedLiquidity.${field} key is absent in committed data. Expected until next daily-pipeline refresh.`);
    } else if (fedLiquidity[field] === null) {
      console.warn(`[M-41 soft warn] macroDrivers.fedLiquidity.${field} is null. Expected non-null after the corresponding FRED fetch succeeds.`);
    }
  }
  for (const field of ['reserveBalances', 'reserveBalances4wChange']) {
    if (!(field in fedLiquidity)) {
      console.warn(`[M-42 soft warn] macroDrivers.fedLiquidity.${field} key is absent in committed data. Expected until next daily-pipeline refresh.`);
    } else if (fedLiquidity[field] === null) {
      console.warn(`[M-42 soft warn] macroDrivers.fedLiquidity.${field} is null. Expected non-null after FRED:WRESBAL fetch succeeds.`);
    }
  }

  const sourceStatus = fedLiquidity.sourceStatus;
  if (!sourceStatus || typeof sourceStatus !== 'object') {
    fail('macroDrivers.fedLiquidity.sourceStatus is missing or not an object');
  } else {
    for (const key of ['walcl', 'onRrp']) {
      if (!(key in sourceStatus)) {
        fail(`macroDrivers.fedLiquidity.sourceStatus.${key} is missing`);
      }
    }
    for (const key of ['effectiveFedFundsRate', 'sofr']) {
      if (!(key in sourceStatus)) {
        console.warn(`[M-41 soft warn] macroDrivers.fedLiquidity.sourceStatus.${key} is absent in committed data. Expected until next daily-pipeline refresh.`);
      }
    }
    if (!('reserveBalances' in sourceStatus)) {
      console.warn('[M-42 soft warn] macroDrivers.fedLiquidity.sourceStatus.reserveBalances is absent in committed data. Expected until next daily-pipeline refresh.');
    }
  }
}

const requiredSourceMarkers = [
  "fetchFredSeries('DFF', 30)",
  "fetchFredSeries('SOFR', 30)",
  "fetchFredSeries('WRESBAL', 90)",
  'effectiveFedFundsRate: Number.isFinite(effectiveFedFundsRate) ? effectiveFedFundsRate : null',
  'sofr: Number.isFinite(sofr) ? sofr : null',
  'reserveBalances: Number.isFinite(reserveBalances) ? reserveBalances : null',
  'reserveBalances4wChange: Number.isFinite(reserveBalances4wChange) ? reserveBalances4wChange : null',
  "walcl: 'missing'",
  "onRrp: 'missing'",
  "effectiveFedFundsRate: 'missing'",
  "sofr: 'missing'",
  "reserveBalances: 'missing'"
];
for (const marker of requiredSourceMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-41 marker: ${marker}`);
  }
}

// PR 2b: Fed liquidity renderer markers in renderMacroOverview.js were removed in Stage 8
// per contract v3.0 sec 8.4 (buildMacroDrivers simplified from ~618 lines to mock 4-pillar
// object {fed, policy, curve, credit, subModuleListText}; driver-liquidity sub-module's
// detailed evidence array deleted). Stage 6 had already narrowed 2 markers to substring
// form ('担保融资' from '隔夜担保融资压力', '缓冲' from '系统流动性缓冲'); Stage 8 removed
// the entire driver-liquidity node where remaining markers lived.
//
// All M-41 field consumption is preserved in:
//   - renderThematicCards.js c2-usd-liquidity card: consumes 11 fedLiquidity fields
//     (reserveBalances, walcl, walcl4wChange, onRrp, onRrpWeekChange, sofr,
//      effectiveFedFundsRate, bgcr, tgcr, repoSpreadRegime, pressure, regime).
//     Enforced by check-thematic-cards-contract.mjs which locks 6 agg-row markers:
//     '水位 WALCL' / '准备金 reserveBalances' / 'ON RRP' / '隔夜 SOFR / EFFR' /
//     '回购 BGCR / TGCR' / 'repoSpreadRegime'
//   - 4-pillar fed sentence in buildMacroDrivers still references fedLiquidity.reserveBalances
//     and SOFR for the 1-sentence summary (sec 8.4)
//   - sourceMarkers below: 12 markers still enforced for scripts/run-daily-pipeline.mjs
//   - contractMarkers below: 9 markers still enforced for docs/DATA_CONTRACT.md
//   - data field validation: M-41 (DFF / SOFR / WRESBAL) + M-42 (reserveBalances) +
//     sourceStatus validation all preserved above
// Mock does not display Fed liquidity detailed evidence in macro-drivers block per
// contract v3.0 sec 0.4 ironclad rule 6.

const requiredContractMarkers = [
  'macroDrivers.fedLiquidity',
  'FRED:DFF',
  'FRED:SOFR',
  'FRED:WRESBAL',
  'effectiveFedFundsRate',
  'reserveBalances',
  'reserveBalances4wChange',
  'sourceStatus.reserveBalances',
  'WRESBAL'
];
for (const marker of requiredContractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`DATA_CONTRACT missing M-41 marker: ${marker}`);
  }
}

if (errors.length > 0) {
  console.error('Macro drivers fedLiquidity extended check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log('Macro drivers fedLiquidity extended check: PASS');
