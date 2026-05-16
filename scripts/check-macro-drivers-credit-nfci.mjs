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
const matrixText = readText('scripts/modules/buildCrossValidationMatrix.js');
const dataContractText = readText('docs/DATA_CONTRACT.md');

const credit = radarData?.macroDrivers?.credit;
if (!credit || typeof credit !== 'object') {
  fail('macroDrivers.credit is missing or not an object');
} else {
  const m48Fields = ['nfci', 'nfci4wChange', 'nfciRegime'];
  for (const field of m48Fields) {
    if (!(field in credit)) {
      console.warn(`[M-48 soft warn] macroDrivers.credit.${field} key is absent in committed data. Expected until next daily-pipeline refresh.`);
    } else if (credit[field] === null) {
      console.warn(`[M-48 soft warn] macroDrivers.credit.${field} is null. Expected non-null after the corresponding FRED:NFCI fetch succeeds.`);
    }
  }

  if (credit.sourceStatus && typeof credit.sourceStatus === 'object') {
    if (!('nfci' in credit.sourceStatus)) {
      console.warn('[M-48 soft warn] macroDrivers.credit.sourceStatus.nfci is absent in committed data. Expected until next daily-pipeline refresh.');
    }
  } else if ('sourceStatus' in credit) {
    fail('macroDrivers.credit.sourceStatus must be an object');
  }

  if ('nfci' in credit && credit.nfci !== null && !Number.isFinite(credit.nfci)) {
    fail(`nfci must be number or null, got: ${typeof credit.nfci}`);
  }
  if ('nfci' in credit && Number.isFinite(credit.nfci)) {
    if (credit.nfci < -3 || credit.nfci > 8) {
      fail(`nfci out of expected range [-3, 8], got: ${credit.nfci}`);
    }
  }
  if ('nfci4wChange' in credit && credit.nfci4wChange !== null && !Number.isFinite(credit.nfci4wChange)) {
    fail(`nfci4wChange must be number or null, got: ${typeof credit.nfci4wChange}`);
  }
  if ('nfciRegime' in credit && credit.nfciRegime !== null && typeof credit.nfciRegime !== 'string') {
    fail(`nfciRegime must be string, got: ${typeof credit.nfciRegime}`);
  }
}

const requiredRunDailyMarkers = [
  "fetchFredSeries('NFCI', 60)",
  'function classifyNfciRegime(nfci)',
  'nfci: Number.isFinite(nfci) ? nfci : null',
  'nfci4wChange: Number.isFinite(nfci4wChange) ? nfci4wChange : null',
  'nfciRegime: classifyNfciRegime(nfci)',
  "nfci: 'missing'"
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-48 marker: ${marker}`);
  }
}

const requiredRenderMarkers = [
  'credit?.nfci',
  '金融状况指数 (NFCI)',
  '偏紧',
  '偏松',
  '私募信贷、CRE、CDX 与更细信用指标等待接入。'
];
for (const marker of requiredRenderMarkers) {
  if (!renderMacroText.includes(marker)) {
    fail(`renderMacroOverview missing M-48 marker: ${marker}`);
  }
}

const requiredMatrixMarkers = [
  'const nfci = finite(credit.nfci);',
  'const nfciRegime = typeof credit.nfciRegime',
  '银行压力指数（NFCI）尚未接入',
  '金融状况显著收紧',
  '金融状况温和收紧',
  '金融状况显著宽松',
  '金融状况温和宽松'
];
for (const marker of requiredMatrixMarkers) {
  if (!matrixText.includes(marker)) {
    fail(`buildCrossValidationMatrix missing M-48 marker: ${marker}`);
  }
}

const requiredContractMarkers = [
  'macroDrivers.credit',
  'FRED:NFCI',
  'nfci',
  'nfci4wChange',
  'nfciRegime',
  'sourceStatus',
  'NFCI 0 轴方向与 igOas/hyOas 相反',
  '`偏紧`/`偏松`',
  '不参与 scoring、decisionModel、executionLock 或 positionGuidance'
];
for (const marker of requiredContractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`DATA_CONTRACT missing M-48 marker: ${marker}`);
  }
}

if (errors.length > 0) {
  console.error('Macro drivers credit NFCI check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log('Macro drivers credit NFCI check: PASS');
