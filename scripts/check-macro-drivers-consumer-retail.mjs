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
const dataContractText = readText('docs/DATA_CONTRACT.md');
const dataSourcesText = readText('docs/DATA_SOURCES.md');
const agentsText = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
const backlogText = readText('docs/PROJECT_BACKLOG.md');

const consumerRetail = radarData?.macroDrivers?.consumerRetail;
const sourceStatuses = new Set(['live', 'fallback', 'missing']);
const retailRegimes = new Set(['明显走弱', '走弱', '稳定', '改善', '强劲', '未知']);
const segmentRegimes = new Set(['广泛改善', '温和改善', '分化', '广泛走弱', '未知']);
const expectedSources = new Set([
  'FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments',
  'FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments; BofA:ConsumerCheckpoint-public-html',
  'FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments; BofA:ConsumerCheckpoint-public-html; TradingEconomics:Redbook-public-html'
]);

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
    'retailSegments',
    'segmentPositiveCount',
    'segmentSeriesCount',
    'segmentDiffusionPct',
    'segmentRegime',
    'strongestSegment',
    'weakestSegment',
    'segmentUpdatedAt',
    'bofaCardSpendingYoY',
    'bofaCardSpendingPriorYoY',
    'bofaCardSpendingExGasYoY',
    'bofaReportDate',
    'bofaReportUrl',
    'bofaPdfUrl',
    'bofaStatus',
    'bofaSummary',
    'redbookRetailSalesYoY',
    'redbookHistoricalAverageYoY',
    'redbookRetailSalesDate',
    'redbookReportUrl',
    'redbookStatus',
    'redbookSummary',
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
    'cartsRealYoY',
    'segmentPositiveCount',
    'segmentSeriesCount',
    'segmentDiffusionPct',
    'bofaCardSpendingYoY',
    'bofaCardSpendingPriorYoY',
    'bofaCardSpendingExGasYoY',
    'redbookRetailSalesYoY',
    'redbookHistoricalAverageYoY'
  ]) {
    if (field in consumerRetail && !isFiniteNumberOrNull(consumerRetail[field])) {
      fail(`macroDrivers.consumerRetail.${field} must be finite number or null`);
    }
  }

  if (!retailRegimes.has(consumerRetail.retailRegime)) {
    fail(`macroDrivers.consumerRetail.retailRegime must be one of ${[...retailRegimes].join('/')}`);
  }
  if (!segmentRegimes.has(consumerRetail.segmentRegime)) {
    fail(`macroDrivers.consumerRetail.segmentRegime must be one of ${[...segmentRegimes].join('/')}`);
  }
  if (!Array.isArray(consumerRetail.retailSegments)) {
    fail('macroDrivers.consumerRetail.retailSegments must be an array');
  }

  if (!consumerRetail.sourceStatus || typeof consumerRetail.sourceStatus !== 'object' || Array.isArray(consumerRetail.sourceStatus)) {
    fail('macroDrivers.consumerRetail.sourceStatus must be an object');
  } else {
    for (const key of ['carts', 'cartsr', 'retailSegments', 'bofaConsumerCheckpoint', 'redbookPublicHtml']) {
      if (!sourceStatuses.has(consumerRetail.sourceStatus[key])) {
        fail(`macroDrivers.consumerRetail.sourceStatus.${key} must be live/fallback/missing`);
      }
    }
  }

  if (!expectedSources.has(consumerRetail.source)) {
    fail(`macroDrivers.consumerRetail.source must be one of ${[...expectedSources].join(' | ')}`);
  }
  if (!Array.isArray(consumerRetail.notes) || consumerRetail.notes.some((note) => typeof note !== 'string')) {
    fail('macroDrivers.consumerRetail.notes must be a string array');
  }
  if (consumerRetail.updatedAt !== null && (!consumerRetail.updatedAt || !Number.isFinite(Date.parse(consumerRetail.updatedAt)))) {
    fail('macroDrivers.consumerRetail.updatedAt must be null or parseable ISO string');
  }
}

const requiredRunDailyMarkers = [
  'function classifyRetailRegime(cartsRealYoY, redbookRetailSalesYoY = null)',
  'function classifyRetailSegmentRegime(segmentDiffusionPct)',
  'CONSUMER_RETAIL_SEGMENT_SERIES',
  'function calculateRetailSegmentSnapshot(seriesResults)',
  'async function resolveConsumerRetail(prevConsumerRetail)',
  "fetchFredSeries('CARTS', 1500)",
  "fetchFredSeries('CARTSR', 1500)",
  'fetchTradingEconomicsRedbookIndex',
  'const CONSUMER_RETAIL_SOURCE =',
  'consumerRetail: macroDrivers.consumerRetail'
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-69 marker: ${marker}`);
  }
}

// PR 2b: M-69 consumerRetail renderer markers in renderMacroOverview.js were removed in
// Stage 8 per contract v3.0 sec 8.4 (buildMacroDrivers simplified to mock 4-pillar object;
// driver-consumer-retail sub-module's detailed evidence deleted).
// Consumer retail field consumption preserved in renderThematicCards.js c4-consumer-agg card
// (consumes macroDrivers.consumerRetail). Data field validation + 10 runDailyMarkers +
// 11 contractMarkers + 5 sourceMarkers + AGENTS + backlog markers all preserved.

const requiredContractMarkers = [
  'macroDrivers.consumerRetail',
  'FRED:CARTS',
  'FRED:CARTSR',
  'cartsNominal4wAverage',
  'cartsRealYoY',
  'segmentDiffusionPct',
  'retailRegime',
  'MRTS',
  'Redbook public HTML',
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
  '`MRTSSM441USN`',
  'Trading Economics Redbook public HTML',
  'macroDrivers.consumerRetail'
];
for (const marker of requiredSourceMarkers) {
  if (!dataSourcesText.includes(marker)) {
    fail(`DATA_SOURCES missing M-69 marker: ${marker}`);
  }
}

const hasConsumerRetailBoundary = agentsText.includes('macroDrivers.consumerRetail')
  && (
    agentsText.includes('Redbook public HTML')
    || agentsText.includes('Redbook + BoA Card 为 P3-14 source-review candidates')
    || agentsText.includes('BoA Consumer Checkpoint 公开 HTML 摘要')
  );
if (!hasConsumerRetailBoundary) {
  fail('docs/AGENT_DOMAIN_BOUNDARIES.md missing M-69 consumerRetail boundary note');
}

if (!backlogText.includes('P3-14: Redbook + BoA Card 高频消费证据')
    && !backlogText.includes('P3-14: Redbook + BoA raw card 高频消费证据')) {
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
  `cartsRealYoY=${formatValue(consumerRetail.cartsRealYoY)}, segmentDiffusion=${formatValue(consumerRetail.segmentDiffusionPct)}, ` +
  `redbook=${formatValue(consumerRetail.redbookRetailSalesYoY)}, ` +
  `retailRegime=${consumerRetail.retailRegime}, ` +
  `sourceStatus=${JSON.stringify(consumerRetail.sourceStatus)})`
);
