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

const employment = radarData?.macroDrivers?.employment;
const sourceStatuses = new Set(['live', 'fallback', 'missing']);
const claimsRegimes = new Set(['明显走弱', '走弱', '稳定', '改善', '未知']);
const joltsRegimes = new Set(['紧张', '平衡', '宽松', '走弱', '未知']);
const expectedSource = 'FRED:ICSA; FRED:CCSA; FRED:JTSJOL';

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
    'claimsRegime',
    'joltsRegime',
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
    'joltsOpeningsYoY'
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

  if (!employment.sourceStatus || typeof employment.sourceStatus !== 'object' || Array.isArray(employment.sourceStatus)) {
    fail('macroDrivers.employment.sourceStatus must be an object');
  } else {
    for (const key of ['icsa', 'ccsa', 'jtsjol']) {
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
  for (const field of ['updatedAt', 'joltsUpdatedAt']) {
    if (employment[field] !== null && (!employment[field] || !Number.isFinite(Date.parse(employment[field])))) {
      fail(`macroDrivers.employment.${field} must be null or parseable ISO string`);
    }
  }
}

const requiredRunDailyMarkers = [
  'function classifyClaimsRegime(initialClaims4wAverage, initialClaims4wChange)',
  'function classifyJoltsRegime(joltsOpenings, joltsOpeningsYoY)',
  'async function resolveEmploymentBreadth(prevEmployment)',
  "fetchFredSeries('ICSA', 420)",
  "fetchFredSeries('CCSA', 420)",
  "fetchFredSeries('JTSJOL', 1500)",
  "source: 'FRED:ICSA; FRED:CCSA; FRED:JTSJOL'",
  'employment: macroDrivers.employment'
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) {
    fail(`run-daily-pipeline missing M-68 marker: ${marker}`);
  }
}

const requiredRenderMarkers = [
  "id: 'driver-employment'",
  '就业广度 LABOR BREADTH',
  'JOLTS:',
  'Claims 是周频裁员压力代理'
];
for (const marker of requiredRenderMarkers) {
  if (!renderMacroText.includes(marker)) {
    fail(`renderMacroOverview missing M-68 marker: ${marker}`);
  }
}

const requiredContractMarkers = [
  'macroDrivers.employment',
  'FRED:ICSA',
  'FRED:CCSA',
  'FRED:JTSJOL',
  'initialClaims4wAverage',
  'joltsOpeningsYoY',
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
  'macroDrivers.employment'
];
for (const marker of requiredSourceMarkers) {
  if (!dataSourcesText.includes(marker)) {
    fail(`DATA_SOURCES missing M-68 marker: ${marker}`);
  }
}

if (!agentsText.includes('macroDrivers.employment') || !agentsText.includes('FRED 周频/月频劳动力 evidence 层')) {
  fail('AGENTS.md missing M-68 employment boundary note');
}

// P2-10 回归守护:vintage formatter 不得对已含 T 后缀的 ISO 字符串再拼一次 T00:00:00Z
// (否则 new Date("...T00:00:00ZT00:00:00Z") = Invalid Date → "undefined NaN" / "QNaN NaN")
const reconcatBugPattern = /new Date\(`\$\{[^}]+\}T00:00:00Z`\)/g;
const reconcatHits = renderMacroText.match(reconcatBugPattern);
if (reconcatHits && reconcatHits.length > 0) {
  fail(
    `renderMacroOverview has ${reconcatHits.length} bad date concat(s) like new Date(\`\${iso}T00:00:00Z\`); ` +
    'drop the T suffix concat — inputs are already full ISO datetime strings (P2-10 regression guard)'
  );
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
  `claimsRegime=${employment.claimsRegime}, joltsRegime=${employment.joltsRegime}, ` +
  `sourceStatus=${JSON.stringify(employment.sourceStatus)})`
);
