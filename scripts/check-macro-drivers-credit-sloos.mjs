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
  const existingFields = ['igOas', 'igOas1dChange', 'igHyRatio', 'regime', 'sourceStatus'];
  for (const field of existingFields) {
    if (!(field in credit)) {
      fail(`macroDrivers.credit.${field} is missing`);
    }
  }

  const m46Fields = [
    'sloosTighteningLargeFirms',
    'sloosTighteningSmallFirms',
    'sloosTighteningLargeQoQ',
    'sloosTighteningSmallQoQ',
    'sloosRegime'
  ];
  for (const field of m46Fields) {
    if (!(field in credit)) {
      console.warn(`[M-46 soft warn] macroDrivers.credit.${field} key is absent in committed data. Expected until next daily-pipeline refresh.`);
    } else if (credit[field] === null) {
      console.warn(`[M-46 soft warn] macroDrivers.credit.${field} is null. Expected non-null after the corresponding SLOOS FRED fetch succeeds.`);
    }
  }

  if (credit.sourceStatus && typeof credit.sourceStatus === 'object') {
    if (!('sloos' in credit.sourceStatus)) {
      console.warn('[M-46 soft warn] macroDrivers.credit.sourceStatus.sloos is absent in committed data. Expected until next daily-pipeline refresh.');
    }
  } else if ('sourceStatus' in credit) {
    fail('macroDrivers.credit.sourceStatus must be an object');
  }

  for (const field of m46Fields.slice(0, 4)) {
    if (field in credit && credit[field] !== null && !Number.isFinite(credit[field])) {
      fail(`macroDrivers.credit.${field} must be number or null, got: ${typeof credit[field]}`);
    }
  }
  if ('sloosRegime' in credit && credit.sloosRegime !== null && typeof credit.sloosRegime !== 'string') {
    fail(`macroDrivers.credit.sloosRegime must be string, got: ${typeof credit.sloosRegime}`);
  }
}

const requiredRunDailyMarkers = [
  "fetchFredSeries('DRTSCILM', 180)",
  "fetchFredSeries('DRTSCIS', 180)",
  'sloosTighteningLargeFirms: Number.isFinite(sloosTighteningLargeFirms) ? sloosTighteningLargeFirms : null',
  'sloosTighteningSmallFirms: Number.isFinite(sloosTighteningSmallFirms) ? sloosTighteningSmallFirms : null',
  'sloosTighteningLargeQoQ: Number.isFinite(sloosTighteningLargeQoQ) ? sloosTighteningLargeQoQ : null',
  'sloosTighteningSmallQoQ: Number.isFinite(sloosTighteningSmallQoQ) ? sloosTighteningSmallQoQ : null',
  'sloosRegime: classifySloosRegime(sloosTighteningLargeFirms)',
  "sourceStatus: { igOas: 'missing', sloos: 'missing', nfci: 'missing' }"
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-46 marker: ${marker}`);
  }
}

const requiredRenderMarkers = [
  'credit?.sloosTighteningLargeFirms',
  '银行贷款标准 (SLOOS C&I 大型)',
  '季度调查',
  '信用环境',
  '跨市场融资压力等待接入。',
  '私募信贷、CRE、CDX 与更细信用指标等待接入。'
];
for (const marker of requiredRenderMarkers) {
  if (!renderMacroText.includes(marker)) {
    fail(`renderMacroOverview missing M-46 marker: ${marker}`);
  }
}

const requiredMatrixMarkers = [
  'const credit = isPlainObject(data?.macroDrivers?.credit) ? data.macroDrivers.credit : {};',
  'const sloosTighteningLargeFirms = finite(credit.sloosTighteningLargeFirms);',
  'SLOOS 大型企业贷款标准净收紧',
  'SLOOS 大型企业贷款标准净放松',
  '反驳流动性收紧叙事'
];
for (const marker of requiredMatrixMarkers) {
  if (!matrixText.includes(marker)) {
    fail(`buildCrossValidationMatrix missing M-46 marker: ${marker}`);
  }
}

const requiredContractMarkers = [
  'macroDrivers.credit',
  'FRED:BAMLC0A0CM',
  'FRED:DRTSCILM',
  'FRED:DRTSCIS',
  'sloosTighteningLargeFirms',
  'sloosTighteningSmallFirms',
  'sourceStatus.sloos',
  '不参与 scoring、decisionModel、executionLock 或 positionGuidance'
];
for (const marker of requiredContractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`DATA_CONTRACT missing M-46 marker: ${marker}`);
  }
}

if (errors.length > 0) {
  console.error('Macro drivers credit SLOOS check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log('Macro drivers credit SLOOS check: PASS');
