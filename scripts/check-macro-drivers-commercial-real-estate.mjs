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

const cre = radarData?.macroDrivers?.commercialRealEstate;
const sourceStatuses = new Set(['live', 'fallback', 'missing', 'manual_required']);
const creStressRegimes = new Set(['恶化', '紧绷', '稳定', '宽松', '改善', '未知']);
const crePublicMarketRegimes = new Set(['市场压力上升', '观察', '平稳', '未知']);
const expectedSource = 'FRED:DRCRELEXFACBS; FRED:CORCREXFACBS; FRED:SUBLPDRCSN; FRED:SUBLPDRCSC; FRED:SUBLPDRCSM; Yahoo:VNQ; Yahoo:REM; Yahoo:CMBS';

if (!cre || typeof cre !== 'object' || Array.isArray(cre)) {
  fail('macroDrivers.commercialRealEstate is missing or not an object');
} else {
  const requiredFields = [
    'creDelinquencyRate',
    'creDelinquencyRateQoQChange',
    'creChargeOffRate',
    'creChargeOffRateQoQChange',
    'sloosCreNonfarmNonresidentialTightening',
    'sloosCreConstructionTightening',
    'sloosCreMultifamilyTightening',
    'sloosCreTighteningMax',
    'reitEtfPrice',
    'reitEtf4wChange',
    'reitEtfUpdatedAt',
    'mortgageReitEtfPrice',
    'mortgageReitEtf4wChange',
    'mortgageReitEtfUpdatedAt',
    'cmbsEtfPrice',
    'cmbsEtf4wChange',
    'cmbsEtfUpdatedAt',
    'crePublicMarketProxyRegime',
    'nonPublicCreStatus',
    'creStressRegime',
    'sourceStatus',
    'updatedAt',
    'source',
    'notes'
  ];
  for (const field of requiredFields) {
    if (!(field in cre)) {
      fail(`macroDrivers.commercialRealEstate.${field} is missing`);
    }
  }

  for (const field of [
    'creDelinquencyRate',
    'creDelinquencyRateQoQChange',
    'creChargeOffRate',
    'creChargeOffRateQoQChange',
    'sloosCreNonfarmNonresidentialTightening',
    'sloosCreConstructionTightening',
    'sloosCreMultifamilyTightening',
    'sloosCreTighteningMax',
    'reitEtfPrice',
    'reitEtf4wChange',
    'mortgageReitEtfPrice',
    'mortgageReitEtf4wChange',
    'cmbsEtfPrice',
    'cmbsEtf4wChange'
  ]) {
    if (field in cre && !isFiniteNumberOrNull(cre[field])) {
      fail(`macroDrivers.commercialRealEstate.${field} must be finite number or null`);
    }
  }

  if (!creStressRegimes.has(cre.creStressRegime)) {
    fail(`macroDrivers.commercialRealEstate.creStressRegime must be one of ${[...creStressRegimes].join('/')}`);
  }
  if (!crePublicMarketRegimes.has(cre.crePublicMarketProxyRegime)) {
    fail(`macroDrivers.commercialRealEstate.crePublicMarketProxyRegime must be one of ${[...crePublicMarketRegimes].join('/')}`);
  }

  if (!cre.sourceStatus || typeof cre.sourceStatus !== 'object' || Array.isArray(cre.sourceStatus)) {
    fail('macroDrivers.commercialRealEstate.sourceStatus must be an object');
  } else {
    for (const key of ['delinquency', 'chargeOff', 'sloosNonfarmNonresidential', 'sloosConstruction', 'sloosMultifamily', 'reitEtf', 'mortgageReitEtf', 'cmbsEtf', 'nonPublicCre']) {
      if (!sourceStatuses.has(cre.sourceStatus[key])) {
        fail(`macroDrivers.commercialRealEstate.sourceStatus.${key} must be live/fallback/missing/manual_required`);
      }
    }
  }

  if (cre.source !== expectedSource) {
    fail(`macroDrivers.commercialRealEstate.source must be ${expectedSource}`);
  }
  if (!Array.isArray(cre.notes) || cre.notes.some((note) => typeof note !== 'string')) {
    fail('macroDrivers.commercialRealEstate.notes must be a string array');
  }
  if (cre.updatedAt !== null && (!cre.updatedAt || !Number.isFinite(Date.parse(cre.updatedAt)))) {
    fail('macroDrivers.commercialRealEstate.updatedAt must be null or parseable ISO string');
  }
}

const requiredRunDailyMarkers = [
  'function classifyCreStressRegime(creDelinquencyRate, creChargeOffRate, sloosCreTighteningMax)',
  'async function resolveCommercialRealEstate(prevCre)',
  "fetchFredSeries('DRCRELEXFACBS', 13000)",
  "fetchFredSeries('CORCREXFACBS', 13000)",
  "fetchFredSeries('SUBLPDRCSN', 13000)",
  "fetchFredSeries('SUBLPDRCSC', 13000)",
  "fetchFredSeries('SUBLPDRCSM', 13000)",
  "fetchYahooChartQuote('VNQ', '1mo', '1d')",
  "fetchYahooChartQuote('REM', '1mo', '1d')",
  "fetchYahooChartQuote('CMBS', '1mo', '1d')",
  'source: CRE_PUBLIC_MARKET_PROXY_SOURCE',
  'commercialRealEstate: macroDrivers.commercialRealEstate'
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-70 marker: ${marker}`);
  }
}

const requiredRenderMarkers = [
  "id: 'driver-cre'",
  '商业地产信用 COMMERCIAL REAL ESTATE',
  'creDelinquencyRate',
  'Commercial Real Estate',
  'FRED 季频',
  'VNQ',
  'REM',
  'CMBS'
];
for (const marker of requiredRenderMarkers) {
  if (!renderMacroText.includes(marker)) {
    fail(`renderMacroOverview missing M-70 marker: ${marker}`);
  }
}

const requiredContractMarkers = [
  'macroDrivers.commercialRealEstate',
  'FRED:DRCRELEXFACBS',
  'FRED:CORCREXFACBS',
  'FRED:SUBLPDRCSN',
  'FRED:SUBLPDRCSC',
  'FRED:SUBLPDRCSM',
  'creDelinquencyRate',
  'sloosCreTighteningMax',
  'reitEtfPrice',
  'mortgageReitEtfPrice',
  'cmbsEtfPrice',
  'creStressRegime',
  'VNQ',
  'REM',
  'CMBS',
  'audit-only / display-only',
  '不参与 scoring、decisionModel、executionLock 或 positionGuidance'
];
for (const marker of requiredContractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`DATA_CONTRACT missing M-70 marker: ${marker}`);
  }
}

const requiredSourceMarkers = [
  '`DRCRELEXFACBS`',
  '`CORCREXFACBS`',
  '`SUBLPDRCSN`',
  '`SUBLPDRCSC`',
  '`SUBLPDRCSM`',
  '`VNQ`',
  '`REM`',
  '`CMBS`',
  'macroDrivers.commercialRealEstate'
];
for (const marker of requiredSourceMarkers) {
  if (!dataSourcesText.includes(marker)) {
    fail(`DATA_SOURCES missing M-70 marker: ${marker}`);
  }
}

if (!agentsText.includes('macroDrivers.commercialRealEstate') || !agentsText.includes('伪造为 CDX、私募信贷数据或非公开 CRE loan tape')) {
  fail('AGENTS.md missing M-70 commercialRealEstate boundary note');
}

if (!backlogText.includes('P3-15: CDX HY/IG + 私募信贷 fundraising')) {
  fail('PROJECT_BACKLOG missing P3-15 CDX/private-credit source-review note');
}

if (errors.length > 0) {
  console.error('Macro drivers commercialRealEstate check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log(
  `Macro drivers commercialRealEstate check: PASS (delinquency=${formatValue(cre.creDelinquencyRate)}, ` +
  `chargeOff=${formatValue(cre.creChargeOffRate)}, sloosMax=${formatValue(cre.sloosCreTighteningMax)}, ` +
  `VNQ=${formatValue(cre.reitEtfPrice)}, REM=${formatValue(cre.mortgageReitEtfPrice)}, CMBS=${formatValue(cre.cmbsEtfPrice)}, ` +
  `creStressRegime=${cre.creStressRegime}, sourceStatus=${JSON.stringify(cre.sourceStatus)})`
);
