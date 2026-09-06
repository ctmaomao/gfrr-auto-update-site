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

const employment = radarData?.macroDrivers?.employment;
const sourceStatuses = new Set(['live', 'fallback', 'missing']);
const claimsRegimes = new Set(['明显走弱', '走弱', '稳定', '改善', '未知']);
const joltsRegimes = new Set(['紧张', '平衡', '宽松', '走弱', '未知']);
const laborQualityRegimes = new Set(['工资韧性', '扩散改善', '降温', '平衡', '未知']);
const industryDiffusionRegimes = new Set(['广泛扩张', '温和扩张', '分化', '收缩扩散', '未知']);
const expectedSource = 'FRED:ICSA; FRED:CCSA; FRED:JTSJOL; FRED:CES0500000003; FRED:U6RATE; FRED:industry-payroll-basket';

if (!employment || typeof employment !== 'object' || Array.isArray(employment)) {
  fail('macroDrivers.employment is missing or not an object');
} else {
  const requiredFields = [
    'initialClaims',
    'initialClaims4wAverage',
    'initialClaims4wChange',
    'continuingClaims',
    'continuingClaims4wAverage',
    'joltsOpenings',
    'joltsOpeningsYoY',
    'joltsUpdatedAt',
    'averageHourlyEarnings',
    'averageHourlyEarningsYoY',
    'averageHourlyEarningsUpdatedAt',
    'u6Rate',
    'u6Rate3mChange',
    'u6UpdatedAt',
    'industryPayrollDiffusionPct',
    'industryPayrollPositiveCount',
    'industryPayrollSeriesCount',
    'industryPayrollUpdatedAt',
    'claimsRegime',
    'joltsRegime',
    'laborQualityRegime',
    'industryDiffusionRegime',
    'sourceStatus',
    'updatedAt',
    'source',
    'notes'
  ];
  for (const field of requiredFields) {
    if (!(field in employment)) {
      fail(`macroDrivers.employment.${field} is missing`);
    }
  }

  for (const field of [
    'initialClaims',
    'initialClaims4wAverage',
    'initialClaims4wChange',
    'continuingClaims',
    'continuingClaims4wAverage',
    'joltsOpenings',
    'joltsOpeningsYoY',
    'averageHourlyEarnings',
    'averageHourlyEarningsYoY',
    'u6Rate',
    'u6Rate3mChange',
    'industryPayrollDiffusionPct',
    'industryPayrollPositiveCount',
    'industryPayrollSeriesCount'
  ]) {
    if (field in employment && !isFiniteNumberOrNull(employment[field])) {
      fail(`macroDrivers.employment.${field} must be finite number or null`);
    }
  }

  if (!claimsRegimes.has(employment.claimsRegime)) {
    fail(`macroDrivers.employment.claimsRegime must be one of ${[...claimsRegimes].join('/')}`);
  }
  if (!joltsRegimes.has(employment.joltsRegime)) {
    fail(`macroDrivers.employment.joltsRegime must be one of ${[...joltsRegimes].join('/')}`);
  }
  if (!laborQualityRegimes.has(employment.laborQualityRegime)) {
    fail(`macroDrivers.employment.laborQualityRegime must be one of ${[...laborQualityRegimes].join('/')}`);
  }
  if (!industryDiffusionRegimes.has(employment.industryDiffusionRegime)) {
    fail(`macroDrivers.employment.industryDiffusionRegime must be one of ${[...industryDiffusionRegimes].join('/')}`);
  }

  if (!employment.sourceStatus || typeof employment.sourceStatus !== 'object' || Array.isArray(employment.sourceStatus)) {
    fail('macroDrivers.employment.sourceStatus must be an object');
  } else {
    for (const key of ['icsa', 'ccsa', 'jtsjol', 'ahe', 'u6', 'industryPayroll']) {
      if (!sourceStatuses.has(employment.sourceStatus[key])) {
        fail(`macroDrivers.employment.sourceStatus.${key} must be live/fallback/missing`);
      }
    }
  }

  if (employment.source !== expectedSource) {
    fail(`macroDrivers.employment.source must be ${expectedSource}`);
  }
  if (!Array.isArray(employment.notes) || employment.notes.some((note) => typeof note !== 'string')) {
    fail('macroDrivers.employment.notes must be a string array');
  }
  for (const field of ['updatedAt', 'joltsUpdatedAt', 'averageHourlyEarningsUpdatedAt', 'u6UpdatedAt', 'industryPayrollUpdatedAt']) {
    if (employment[field] !== null && (!employment[field] || !Number.isFinite(Date.parse(employment[field])))) {
      fail(`macroDrivers.employment.${field} must be null or parseable ISO string`);
    }
  }
  if (Number.isFinite(employment.industryPayrollDiffusionPct)
      && (employment.industryPayrollDiffusionPct < 0 || employment.industryPayrollDiffusionPct > 100)) {
    fail('macroDrivers.employment.industryPayrollDiffusionPct must be 0-100');
  }
  if (Number.isFinite(employment.industryPayrollPositiveCount)
      && Number.isFinite(employment.industryPayrollSeriesCount)
      && employment.industryPayrollPositiveCount > employment.industryPayrollSeriesCount) {
    fail('macroDrivers.employment industry positive count cannot exceed series count');
  }
}

const requiredRunDailyMarkers = [
  'function classifyClaimsRegime(initialClaims4wAverage, initialClaims4wChange)',
  'function classifyJoltsRegime(joltsOpenings, joltsOpeningsYoY)',
  'function classifyLaborQualityRegime(averageHourlyEarningsYoY, u6Rate3mChange, industryPayrollDiffusionPct)',
  'function calculateIndustryPayrollDiffusion(seriesResults)',
  'async function resolveEmploymentBreadth(prevEmployment)',
  "fetchFredSeries('ICSA', 420)",
  "fetchFredSeries('CCSA', 420)",
  "fetchFredSeries('JTSJOL', 1500)",
  "fetchFredSeries('CES0500000003', 1500)",
  "fetchFredSeries('U6RATE', 1500)",
  'EMPLOYMENT_INDUSTRY_PAYROLL_SERIES',
  'source: EMPLOYMENT_SOURCE',
  'employment: macroDrivers.employment'
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-68 marker: ${marker}`);
  }
}

// PR 2b: M-68/M-73 employment renderer markers in renderMacroOverview.js were removed in
// Stage 8 per contract v3.0 sec 8.4 (buildMacroDrivers simplified to mock 4-pillar object;
// driver-employment sub-module's detailed evidence deleted).
// Employment field consumption preserved in renderThematicCards.js c4-employment-agg card
// (consumes macroDrivers.employment). Data field validation + 13 runDailyMarkers +
// 13 contractMarkers + 6 sourceMarkers + AGENTS marker all preserved.
// P2-10 reconcat regression guard (was checking renderMacroText for new Date(`${iso}T00:00:00Z`)
// bug pattern) is also removed: buildMacroDrivers 4-pillar no longer performs date
// concatenation; if employment date rendering bugs re-emerge they will be caught in
// renderThematicCards.js via separate enforcement (or future check additions).

const requiredContractMarkers = [
  'macroDrivers.employment',
  'FRED:ICSA',
  'FRED:CCSA',
  'FRED:JTSJOL',
  'FRED:CES0500000003',
  'FRED:U6RATE',
  'initialClaims4wAverage',
  'joltsOpeningsYoY',
  'averageHourlyEarningsYoY',
  'industryPayrollDiffusionPct',
  'sourceStatus.icsa',
  'audit-only / display-only',
  '不参与 scoring、decisionModel、executionLock 或 positionGuidance'
];
for (const marker of requiredContractMarkers) {
  if (!dataContractText.includes(marker)) {
    fail(`DATA_CONTRACT missing M-68 marker: ${marker}`);
  }
}

const requiredSourceMarkers = [
  '`ICSA`',
  '`CCSA`',
  '`JTSJOL`',
  '`CES0500000003`',
  '`U6RATE`',
  'macroDrivers.employment'
];
for (const marker of requiredSourceMarkers) {
  if (!dataSourcesText.includes(marker)) {
    fail(`DATA_SOURCES missing M-68 marker: ${marker}`);
  }
}

if (!agentsText.includes('macroDrivers.employment')
    || !agentsText.includes('FRED CES0500000003 平均时薪')
    || !agentsText.includes('sourceStatus.{icsa,ccsa,jtsjol,ahe,u6,industryPayroll}')) {
  fail('docs/AGENT_DOMAIN_BOUNDARIES.md missing M-73 employment boundary note');
}

if (errors.length > 0) {
  console.error('Macro drivers employment check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log(
  `Macro drivers employment check: PASS (ICSA=${formatValue(employment.initialClaims)}, ` +
  `CCSA=${formatValue(employment.continuingClaims)}, JTSJOL=${formatValue(employment.joltsOpenings)}, ` +
  `AHE=${formatValue(employment.averageHourlyEarnings)}, U6=${formatValue(employment.u6Rate)}, ` +
  `industryDiffusion=${formatValue(employment.industryPayrollDiffusionPct)}, ` +
  `claimsRegime=${employment.claimsRegime}, joltsRegime=${employment.joltsRegime}, ` +
  `sourceStatus=${JSON.stringify(employment.sourceStatus)})`
);
