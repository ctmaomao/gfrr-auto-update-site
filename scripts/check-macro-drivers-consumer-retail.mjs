import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(filePath) {
  return readFileSync(resolve(filePath), 'utf8');
}

function isFiniteNumberOrNull(value) {
  return value === null || Number.isFinite(value);
}

function formatValue(value) {
  return Number.isFinite(value) ? String(value) : 'null';
}

const radarData = JSON.parse(readText('data/radar-data.json'));
const runDailyText = readText('scripts/run-daily-pipeline.mjs');
const renderMacroText = readText('scripts/modules/renderMacroOverview.js');
const dataContractText = readText('docs/DATA_CONTRACT.md');
const dataSourcesText = readText('docs/DATA_SOURCES.md');
const agentsText = readText('AGENTS.md');
const backlogText = readText('docs/PROJECT_BACKLOG.md');

const consumerRetail = radarData?.macroDrivers?.consumerRetail;
const sourceStatuses = new Set(['live', 'fallback', 'missing']);
const retailRegimes = new Set(['明显走弱', '走弱', '稳定', '改善', '强劲', '未知']);
const expectedSource = 'FRED:CARTS; FRED:CARTSR';

if (!consumerRetail || typeof consumerRetail !== 'object' || Array.isArray(consumerRetail)) {
  fail('macroDrivers.consumerRetail is missing or not an object');
} else {
  const requiredFields = [
    'cartsNominal',
    'cartsNominal4wAverage',
    'cartsNominalYoY',
    'cartsReal',
    'cartsReal4wAverage',
    'cartsRealYoY',
    'retailRegime',
    'sourceStatus',
    'updatedAt',
    'source',
    'notes'
  ];
  for (const field of requiredFields) {
    if (!(field in consumerRetail)) {
      fail(`macroDrivers.consumerRetail.${field} is missing`);
    }
  }

  for (const field of [
    'cartsNominal',
    'cartsNominal4wAverage',
    'cartsNominalYoY',
    'cartsReal',
    'cartsReal4wAverage',
    'cartsRealYoY'
  ]) {
    if (field in consumerRetail && !isFiniteNumberOrNull(consumerRetail[field])) {
      fail(`macroDrivers.consumerRetail.${field} must be finite number or null`);
    }
  }

  if (!retailRegimes.has(consumerRetail.retailRegime)) {
    fail(`macroDrivers.consumerRetail.retailRegime must be one of ${[...retailRegimes].join('/')}`);
  }

  if (!consumerRetail.sourceStatus || typeof consumerRetail.sourceStatus !== 'object' || Array.isArray(consumerRetail.sourceStatus)) {
    fail('macroDrivers.consumerRetail.sourceStatus must be an object');
  } else {
    for (const key of ['carts', 'cartsr']) {
      if (!sourceStatuses.has(consumerRetail.sourceStatus[key])) {
        fail(`macroDrivers.consumerRetail.sourceStatus.${key} must be live/fallback/missing`);
      }
    }
  }

  if (consumerRetail.source !== expectedSource) {
    fail(`macroDrivers.consumerRetail.source must be ${expectedSource}`);
  }
  if (!Array.isArray(consumerRetail.notes) || consumerRetail.notes.some((note) => typeof note !== 'string')) {
    fail('macroDrivers.consumerRetail.notes must be a string array');
  }
  if (consumerRetail.updatedAt !== null && (!consumerRetail.updatedAt || !Number.isFinite(Date.parse(consumerRetail.updatedAt)))) {
    fail('macroDrivers.consumerRetail.updatedAt must be null or parseable ISO string');
  }
}

const requiredRunDailyMarkers = [
  'function classifyRetailRegime(cartsRealYoY)',
  'async function resolveConsumerRetail(prevConsumerRetail)',
  "fetchFredSeries('CARTS', 1500)",
  "fetchFredSeries('CARTSR', 1500)",
  "source: 'FRED:CARTS; FRED:CARTSR'",
  'consumerRetail: macroDrivers.consumerRetail'
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-69 marker: ${marker}`);
  }
}

const requiredRenderMarkers = [
  "id: 'driver-consumer-retail'",
  '高频零售消费 CONSUMER RETAIL',
  'CARTS 名义',
  'CARTSR 实际',
  'Chicago Fed CARTS:'
];
for (const marker of requiredRenderMarkers) {
  if (!renderMacroText.includes(marker)) {
    fail(`renderMacroOverview missing M-69 marker: ${marker}`);
  }
}

const requiredContractMarkers = [
  'macroDrivers.consumerRetail',
  'FRED:CARTS',
  'FRED:CARTSR',
  'cartsNominal4wAverage',
  'cartsRealYoY',
  'retailRegime',
  '不代表 Redbook 或 BoA Card 数据',
  'audit-only / display-only',
  '不参与 scoring、decisionModel、executionLock 或 positionGuidance'
];
for (const marker of requiredContractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`DATA_CONTRACT missing M-69 marker: ${marker}`);
  }
}

const requiredSourceMarkers = [
  '`CARTS`',
  '`CARTSR`',
  'macroDrivers.consumerRetail'
];
for (const marker of requiredSourceMarkers) {
  if (!dataSourcesText.includes(marker)) {
    fail(`DATA_SOURCES missing M-69 marker: ${marker}`);
  }
}

if (!agentsText.includes('macroDrivers.consumerRetail') || !agentsText.includes('Redbook + BoA Card 为 P3-14 source-review candidates')) {
  fail('AGENTS.md missing M-69 consumerRetail boundary note');
}

if (!backlogText.includes('P3-14: Redbook + BoA Card 高频消费证据')) {
  fail('PROJECT_BACKLOG missing P3-14 Redbook + BoA source-review note');
}

if (errors.length > 0) {
  console.error('Macro drivers consumerRetail check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log(
  `Macro drivers consumerRetail check: PASS (CARTS=${formatValue(consumerRetail.cartsNominal)}, ` +
  `CARTSR=${formatValue(consumerRetail.cartsReal)}, cartsNominalYoY=${formatValue(consumerRetail.cartsNominalYoY)}, ` +
  `cartsRealYoY=${formatValue(consumerRetail.cartsRealYoY)}, retailRegime=${consumerRetail.retailRegime}, ` +
  `sourceStatus=${JSON.stringify(consumerRetail.sourceStatus)})`
);
