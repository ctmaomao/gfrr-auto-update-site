import { readFileSync } from 'node:fs';

import { buildMacroOverview } from './modules/renderMacroOverview.js';

const errors = [];
const BAD_DATE_TEXT = /\b(?:undefined|NaN|Invalid Date)\b/u;

function fail(message) {
  errors.push(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function flattenDriverText(driver) {
  const parts = [
    driver?.title,
    driver?.status,
    driver?.direction,
    driver?.dataCoverage,
    driver?.explanation,
    driver?.sourceType,
    driver?.updatedAt,
    ...(Array.isArray(driver?.evidence) ? driver.evidence : []),
    ...(Array.isArray(driver?.coverageNotes) ? driver.coverageNotes : []),
    ...(Array.isArray(driver?.missingEvidence) ? driver.missingEvidence : []),
    ...(Array.isArray(driver?.counterEvidence) ? driver.counterEvidence : []),
    ...(Array.isArray(driver?.noiseWarning) ? driver.noiseWarning : []),
  ];
  return parts
    .filter((part) => part !== null && part !== undefined)
    .map(String)
    .join('\n');
}

function findDriver(overview, id) {
  return (overview?.drivers || []).find((driver) => driver?.id === id) || null;
}

function assertDriverDateTextClean(data, id, label) {
  const overview = buildMacroOverview(data, {}, {}, null);
  const driver = findDriver(overview, id);
  if (!driver) {
    fail(`${label}: ${id} not found in buildMacroOverview().drivers`);
    return;
  }

  const text = flattenDriverText(driver);
  if (BAD_DATE_TEXT.test(text)) {
    fail(`${label}: ${id} renders bad date text:\n${text}`);
  }
}

function applyFullIsoDateScenario(data) {
  const employment = data.macroDrivers.employment;
  employment.initialClaims = 209000;
  employment.initialClaims4wAverage = 202500;
  employment.initialClaims4wChange = -8500;
  employment.continuingClaims = 1782000;
  employment.continuingClaims4wAverage = 1773000;
  employment.joltsOpenings = 6866000;
  employment.joltsOpeningsYoY = -0.0124;
  employment.joltsUpdatedAt = '2026-03-01T00:00:00Z';
  employment.averageHourlyEarnings = 37.41;
  employment.averageHourlyEarningsYoY = 0.0357;
  employment.averageHourlyEarningsUpdatedAt = '2026-04-01T00:00:00Z';
  employment.u6Rate = 8.2;
  employment.u6Rate3mChange = 0.1;
  employment.u6UpdatedAt = '2026-04-01T00:00:00Z';
  employment.industryPayrollDiffusionPct = 63.6;
  employment.industryPayrollPositiveCount = 7;
  employment.industryPayrollSeriesCount = 11;
  employment.industryPayrollUpdatedAt = '2026-04-01T00:00:00Z';

  const cre = data.macroDrivers.commercialRealEstate;
  cre.creDelinquencyRate = 1.56;
  cre.creDelinquencyRateQoQChange = -0.02;
  cre.creChargeOffRate = 0.17;
  cre.creChargeOffRateQoQChange = 0.03;
  cre.sloosCreNonfarmNonresidentialTightening = -3.3;
  cre.sloosCreConstructionTightening = 4.9;
  cre.sloosCreMultifamilyTightening = 0;
  cre.sloosCreTighteningMax = 4.9;
  cre.reitEtfPrice = 96.67;
  cre.reitEtf4wChange = 0.0227;
  cre.reitEtfUpdatedAt = '2026-05-21T13:30:00.000Z';
  cre.mortgageReitEtfPrice = 21.82;
  cre.mortgageReitEtf4wChange = -0.048;
  cre.mortgageReitEtfUpdatedAt = '2026-05-21T13:30:00.000Z';
  cre.cmbsEtfPrice = 48.47;
  cre.cmbsEtf4wChange = -0.0088;
  cre.cmbsEtfUpdatedAt = '2026-05-21T13:30:00.000Z';
  cre.creLoanBalance = 3100.5559;
  cre.creLoanBalance4wChange = 0.0048;
  cre.creLoanBalanceYoY = 0.0297;
  cre.creLoanBalanceUpdatedAt = '2026-05-06T00:00:00Z';
  cre.updatedAt = '2026-05-21T13:30:00.000Z';
}

function applyMissingDateScenario(data) {
  const employment = data.macroDrivers.employment;
  employment.joltsUpdatedAt = null;
  employment.averageHourlyEarningsUpdatedAt = null;
  employment.u6UpdatedAt = null;
  employment.industryPayrollUpdatedAt = null;

  const cre = data.macroDrivers.commercialRealEstate;
  cre.reitEtfUpdatedAt = null;
  cre.mortgageReitEtfUpdatedAt = null;
  cre.cmbsEtfUpdatedAt = null;
  cre.creLoanBalanceUpdatedAt = null;
  cre.updatedAt = null;
}

const baselineData = JSON.parse(readFileSync('data/radar-data.json', 'utf8'));
const fullIsoData = clone(baselineData);
applyFullIsoDateScenario(fullIsoData);
const missingDateData = clone(fullIsoData);
applyMissingDateScenario(missingDateData);

for (const [label, data] of [
  ['current radar-data', baselineData],
  ['full ISO datetime scenario', fullIsoData],
  ['missing date fallback scenario', missingDateData],
]) {
  assertDriverDateTextClean(data, 'driver-employment', label);
  assertDriverDateTextClean(data, 'driver-cre', label);
}

if (errors.length > 0) {
  console.error('Macro driver date rendering check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log('Macro driver date rendering check: PASS (employment/CRE current, full-ISO, and missing-date scenarios render without undefined/NaN/Invalid Date)');
