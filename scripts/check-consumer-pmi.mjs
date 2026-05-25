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
  const pmiStatus = consumer.sourceStatus && typeof consumer.sourceStatus === 'object'
    ? consumer.sourceStatus.pmi
    : undefined;
  const validPmiStatuses = new Set(['live', 'fallback', 'source_unavailable', 'parse_error']);
  const isLegacyMissingPmi = pmiStatus === undefined || pmiStatus === 'missing';
  for (const field of m47Fields) {
    if (!(field in consumer)) {
      console.warn(`[M-67 soft warn] macroDrivers.consumer.${field} key is absent in committed data. Expected only for pre-M-67 committed snapshots.`);
    } else if (consumer[field] === null) {
      if (pmiStatus === 'live') {
        fail(`macroDrivers.consumer.${field} is null while sourceStatus.pmi is live`);
      } else if (pmiStatus === 'fallback') {
        console.warn(`[M-67 soft warn] macroDrivers.consumer.${field} is null while PMI fallback is active; previous report value was unavailable.`);
      } else if (pmiStatus === 'source_unavailable') {
        console.warn(`[M-67 soft warn] macroDrivers.consumer.${field} is null because ISM landing/report fetch failed; inspect consumer.diagnostics.pmi.`);
      } else if (pmiStatus === 'parse_error') {
        console.warn(`[M-67 soft warn] macroDrivers.consumer.${field} is null because ISM report HTML parsing failed; inspect consumer.diagnostics.pmi.`);
      } else if (isLegacyMissingPmi) {
        console.warn(`[M-67 soft warn] macroDrivers.consumer.${field} is null in a pre-M-67 committed snapshot; next Daily pipeline run should emit live/fallback/source_unavailable/parse_error.`);
      }
    }
  }

  if (consumer.sourceStatus && typeof consumer.sourceStatus === 'object') {
    if (!('umichSentiment' in consumer.sourceStatus)) {
      fail('macroDrivers.consumer.sourceStatus.umichSentiment is missing');
    }
    if (!('pmi' in consumer.sourceStatus)) {
      console.warn('[M-67 soft warn] macroDrivers.consumer.sourceStatus.pmi is absent in a pre-M-67 committed snapshot.');
    } else if (!validPmiStatuses.has(consumer.sourceStatus.pmi) && consumer.sourceStatus.pmi !== 'missing') {
      fail(`macroDrivers.consumer.sourceStatus.pmi must be live/fallback/source_unavailable/parse_error, got: ${consumer.sourceStatus.pmi}`);
    }
  } else if ('sourceStatus' in consumer) {
    fail('macroDrivers.consumer.sourceStatus must be an object');
  }

  if (typeof consumer.source === 'string' && consumer.source !== 'FRED:UMCSENT; ISM:ManufacturingPMI') {
    if (consumer.source === 'FRED:UMCSENT' || (consumer.source.startsWith('FRED:UMCSENT; FRED:') && !consumer.source.includes('ISM:'))) {
      console.warn(`[M-67 soft warn] consumer.source is legacy '${consumer.source}', expected 'FRED:UMCSENT; ISM:ManufacturingPMI' after next pipeline run.`);
    } else {
      fail(`consumer.source is '${consumer.source}', expected 'FRED:UMCSENT; ISM:ManufacturingPMI'`);
    }
  }

  const pmiDiagnostics = consumer.diagnostics?.pmi;
  if (!pmiDiagnostics || typeof pmiDiagnostics !== 'object' || Array.isArray(pmiDiagnostics)) {
    if (isLegacyMissingPmi) {
      console.warn('[M-67 soft warn] consumer.diagnostics.pmi is absent in the current pre-M-67 committed data.');
    } else if (pmiStatus === 'source_unavailable') {
      console.warn('[M-67 soft warn] consumer.diagnostics.pmi is absent while source_unavailable; next successful pipeline run should persist diagnostics.');
    } else {
      fail('consumer.diagnostics.pmi must exist and be an object for M-67 PMI statuses');
    }
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
  'function fetchIsmManufacturingPmiReport',
  "const ISM_PMI_USER_AGENT = 'GFRRBot/1.0'",
  'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/',
  'function classifyPmiRegime(pmi)',
  'ismManufacturingPmi: hasPreviousPmi ? prevConsumer.ismManufacturingPmi : null',
  'ismManufacturingPmi3mChange: hasPreviousPmi && Number.isFinite(prevConsumer.ismManufacturingPmi3mChange)',
  'ismPmiRegime: classifyPmiRegime(ismManufacturingPmi)',
  "source: 'FRED:UMCSENT; ISM:ManufacturingPMI'",
  "pmi: pmiStatus",
  "'source_unavailable'",
  "'parse_error'"
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-47 marker: ${marker}`);
  }
}

// PR 2b: M-47/M-67 PMI renderer markers in renderMacroOverview.js were removed in Stage 8
// per contract v3.0 sec 8.4 (buildMacroDrivers simplified to mock 4-pillar object;
// consumer sub-module's detailed evidence including ISM PMI / Redbook / CARTS narrative
// deleted from driver-consumer-retail and driver-employment nodes).
// Consumer PMI field consumption preserved in:
//   - renderThematicCards.js c1-ism-pmi card (consumes macroDrivers.consumer.ismManufacturingPmi)
//   - renderThematicCards.js c4-consumer-agg card (consumes broader consumer fields)
// PMI semantic contract is enforced in buildCrossValidationMatrix.js matrixMarkers
// (preserved below). Data field validation + 11 runDailyMarkers + 5 matrixMarkers +
// 9 contractMarkers all preserved.

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
  'ISM:ManufacturingPMI',
  'ismManufacturingPmi',
  'ismManufacturingPmi3mChange',
  'ismPmiRegime',
  'sourceStatus',
  'consumer.diagnostics.pmi',
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
