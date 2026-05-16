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

const consumer = radarData?.macroDrivers?.consumer;
if (!consumer || typeof consumer !== 'object') {
  fail('macroDrivers.consumer is missing or not an object');
} else {
  const existingFields = [
    'umichSentiment',
    'previousValue',
    'threeMonthChange',
    'sixMonthChange',
    'regime',
    'sourceStatus',
    'source'
  ];
  for (const field of existingFields) {
    if (!(field in consumer)) {
      fail(`macroDrivers.consumer.${field} is missing (required)`);
    }
  }

  const m47Fields = ['ismManufacturingPmi', 'ismManufacturingPmi3mChange', 'ismPmiRegime'];
  for (const field of m47Fields) {
    if (!(field in consumer)) {
      console.warn(`[M-47 soft warn] macroDrivers.consumer.${field} key is absent in committed data. Expected until next daily-pipeline refresh.`);
    } else if (consumer[field] === null) {
      console.warn(`[M-47 soft warn] macroDrivers.consumer.${field} is null. Expected non-null after the corresponding FRED:NAPM fetch succeeds.`);
    }
  }

  if (consumer.sourceStatus && typeof consumer.sourceStatus === 'object') {
    if (!('umichSentiment' in consumer.sourceStatus)) {
      fail('macroDrivers.consumer.sourceStatus.umichSentiment is missing');
    }
    if (!('pmi' in consumer.sourceStatus)) {
      console.warn('[M-47 soft warn] macroDrivers.consumer.sourceStatus.pmi is absent in committed data. Expected until next daily-pipeline refresh.');
    }
  } else if ('sourceStatus' in consumer) {
    fail('macroDrivers.consumer.sourceStatus must be an object');
  }

  if (typeof consumer.source === 'string' && consumer.source !== 'FRED:UMCSENT; FRED:NAPM') {
    console.warn(`[M-47 soft warn] consumer.source is '${consumer.source}', expected 'FRED:UMCSENT; FRED:NAPM' after next pipeline run.`);
  }

  if ('ismManufacturingPmi' in consumer && consumer.ismManufacturingPmi !== null && !Number.isFinite(consumer.ismManufacturingPmi)) {
    fail(`ismManufacturingPmi must be number or null, got: ${typeof consumer.ismManufacturingPmi}`);
  }
  if ('ismManufacturingPmi' in consumer && Number.isFinite(consumer.ismManufacturingPmi)) {
    if (consumer.ismManufacturingPmi < 0 || consumer.ismManufacturingPmi > 100) {
      fail(`ismManufacturingPmi must be 0-100 PMI index, got: ${consumer.ismManufacturingPmi}`);
    }
  }
  if ('ismManufacturingPmi3mChange' in consumer && consumer.ismManufacturingPmi3mChange !== null && !Number.isFinite(consumer.ismManufacturingPmi3mChange)) {
    fail(`ismManufacturingPmi3mChange must be number or null, got: ${typeof consumer.ismManufacturingPmi3mChange}`);
  }
  if ('ismPmiRegime' in consumer && consumer.ismPmiRegime !== null && typeof consumer.ismPmiRegime !== 'string') {
    fail(`ismPmiRegime must be string, got: ${typeof consumer.ismPmiRegime}`);
  }
}

const requiredRunDailyMarkers = [
  "fetchFredSeries('NAPM', 420)",
  'function classifyPmiRegime(pmi)',
  'ismManufacturingPmi: Number.isFinite(prevConsumer.ismManufacturingPmi) ? prevConsumer.ismManufacturingPmi : null',
  'ismManufacturingPmi3mChange: Number.isFinite(prevConsumer.ismManufacturingPmi3mChange) ? prevConsumer.ismManufacturingPmi3mChange : null',
  'ismPmiRegime: classifyPmiRegime(ismManufacturingPmi)',
  "source: 'FRED:UMCSENT; FRED:NAPM'",
  "pmi: pmiStatus"
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-47 marker: ${marker}`);
  }
}

const requiredRenderMarkers = [
  'consumer.ismManufacturingPmi',
  'ISM 制造业 PMI',
  '就业广度和高频消费证据仍待接入。',
  '就业广度、盈利修正与高频消费证据等待接入。'
];
for (const marker of requiredRenderMarkers) {
  if (!renderMacroText.includes(marker)) {
    fail(`renderMacroOverview missing M-47 marker: ${marker}`);
  }
}

const requiredMatrixMarkers = [
  'const ismPmi = finite(consumer.ismManufacturingPmi);',
  'ISM 制造业 PMI 未接入',
  '深度收缩，制造业景气与增长同步走弱',
  '制造业处于收缩区间',
  '制造业明显扩张，不支持近端滞涨'
];
for (const marker of requiredMatrixMarkers) {
  if (!matrixText.includes(marker)) {
    fail(`buildCrossValidationMatrix missing M-47 marker: ${marker}`);
  }
}

const requiredContractMarkers = [
  'macroDrivers.consumer',
  'FRED:UMCSENT',
  'FRED:NAPM',
  'ismManufacturingPmi',
  'ismManufacturingPmi3mChange',
  'ismPmiRegime',
  'sourceStatus',
  '不参与 scoring、decisionModel、executionLock 或 positionGuidance'
];
for (const marker of requiredContractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`DATA_CONTRACT missing M-47 marker: ${marker}`);
  }
}

if (errors.length > 0) {
  console.error('Consumer PMI check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log('Consumer PMI check: PASS');
