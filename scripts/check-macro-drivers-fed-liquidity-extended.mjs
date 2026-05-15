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
const renderMacroText = readText('scripts/modules/renderMacroOverview.js');
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
  }
}

const requiredSourceMarkers = [
  "fetchFredSeries('DFF', 30)",
  "fetchFredSeries('SOFR', 30)",
  'effectiveFedFundsRate: Number.isFinite(effectiveFedFundsRate) ? effectiveFedFundsRate : null',
  'sofr: Number.isFinite(sofr) ? sofr : null',
  "sourceStatus: { walcl: 'missing', onRrp: 'missing', effectiveFedFundsRate: 'missing', sofr: 'missing' }"
];
for (const marker of requiredSourceMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-41 marker: ${marker}`);
  }
}

const requiredRenderMarkers = [
  'fedLiquidity.effectiveFedFundsRate',
  '联邦基金利率',
  'SOFR',
  '隔夜担保融资压力'
];
for (const marker of requiredRenderMarkers) {
  if (!renderMacroText.includes(marker)) {
    fail(`renderMacroOverview missing M-41 marker: ${marker}`);
  }
}

const requiredContractMarkers = [
  'macroDrivers.fedLiquidity',
  'FRED:DFF',
  'FRED:SOFR',
  'effectiveFedFundsRate',
  'RESBALNS'
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
