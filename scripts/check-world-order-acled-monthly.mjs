import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const inputPath = path.join(root, 'config', 'world-order-acled-global-monthly.json');

const SOURCE = 'acled-aggregated-manual-normalized-monthly';
const SOURCE_URL = 'https://acleddata.com/conflict-data/download-data-files';
const LICENSE_LEVEL = 'open';
const ATTRIBUTION = 'ACLED (Armed Conflict Location & Event Data) — https://acleddata.com';

const topLevelKeys = [
  'version',
  'source',
  'sourceName',
  'preparedAt',
  'preparedBy',
  'asOfDate',
  'latestFullYear',
  'filesIngested',
  'global',
  'monthlyTrend',
  'topEscalatingCountries',
  'topFatalitiesCountries',
  'quality'
];

const expectedSlugs = new Set([
  'demonstration_events_by_country-year',
  'events_targeting_civilians_by_country-year',
  'political_violence_events_by_country-month-year',
  'political_violence_events_by_country-year',
  'reported_civilian_fatalities_by_country-year',
  'reported_fatalities_by_country-year'
]);

const globalIntegerFields = [
  'politicalViolenceEventsLatestFullYear',
  'demonstrationsLatestFullYear',
  'civilianTargetingEventsLatestFullYear',
  'fatalitiesLatestFullYear',
  'civilianFatalitiesLatestFullYear'
];

const globalRationalOrNullFields = [
  'politicalViolenceEventsPrior3YearAverage',
  'politicalViolenceYoyDelta',
  'civilianTargetingShareLatestFullYear',
  'civilianFatalitiesShareLatestFullYear'
];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function dateAgeDays(isoDate) {
  const target = new Date(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(target.getTime())) return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((today.getTime() - target.getTime()) / 86_400_000);
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isObject(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'exampleOnly' || key === 'notForScoring') return true;
    if (hasForbiddenKey(child)) return true;
  }
  return false;
}

function fmtDelta(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'null';
}

if (!fs.existsSync(inputPath)) {
  console.log('ACLED monthly aggregated check: PASS (state=no_input)');
  process.exit(0);
}

const failures = [];
const warnings = [];

function addFailure(message) {
  failures.push(message);
}

function requireKey(object, key, pathLabel) {
  if (!Object.hasOwn(object, key)) addFailure(`${pathLabel}.${key} missing`);
}

function validateIsoTimestamp(value, fieldName) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    addFailure(`${fieldName} must be a parseable ISO timestamp`);
  }
}

function validateAsOfDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    addFailure('asOfDate must match YYYY-MM-DD');
    return;
  }
  const ageDays = dateAgeDays(value);
  if (ageDays === null) {
    addFailure('asOfDate must be parseable');
    return;
  }
  if (ageDays < 0) addFailure(`asOfDate ${value} is in the future`);
  else if (ageDays > 180) addFailure(`asOfDate ${value} is expired (${ageDays} days old)`);
  else if (ageDays > 120) warnings.push(`asOfDate ${value} is stale (${ageDays} days old)`);
  else if (ageDays > 60) warnings.push(`asOfDate ${value} is aging (${ageDays} days old)`);
}

function validateLatestFullYear(value, asOfDate) {
  if (!Number.isInteger(value) || value < 1990 || value > 2100) {
    addFailure(`latestFullYear must be integer in [1990, 2100], got ${value}`);
    return;
  }
  if (typeof asOfDate === 'string' && /^\d{4}/u.test(asOfDate)) {
    const asOfYear = Number(asOfDate.slice(0, 4));
    if (value > asOfYear) addFailure(`latestFullYear (${value}) cannot exceed asOfDate year (${asOfYear})`);
    if (value < asOfYear - 2) warnings.push(`latestFullYear (${value}) lags asOfDate year (${asOfYear}) by more than 1`);
  }
}

function validateFilesIngested(files) {
  if (!Array.isArray(files)) {
    addFailure('filesIngested must be an array');
    return;
  }
  if (files.length !== 6) addFailure(`filesIngested length must be exactly 6 (committed monthly JSON requires all 6 files), got ${files.length}`);
  const seenSlugs = new Set();
  for (const [index, file] of files.entries()) {
    if (!isObject(file)) {
      addFailure(`filesIngested[${index}] must be an object`);
      continue;
    }
    for (const key of ['slug', 'metric', 'granularity', 'filename', 'asOfDate', 'yearRange', 'rowCount']) {
      requireKey(file, key, `filesIngested[${index}]`);
    }
    if (typeof file.slug !== 'string' || !expectedSlugs.has(file.slug)) {
      addFailure(`filesIngested[${index}].slug invalid: ${file.slug}`);
    }
    if (seenSlugs.has(file.slug)) addFailure(`filesIngested[${index}].slug duplicate: ${file.slug}`);
    seenSlugs.add(file.slug);
    if (typeof file.filename !== 'string' || !file.filename.endsWith('.xlsx')) {
      addFailure(`filesIngested[${index}].filename invalid`);
    }
    if (typeof file.granularity !== 'string' || !['country-year', 'country-month-year'].includes(file.granularity)) {
      addFailure(`filesIngested[${index}].granularity invalid`);
    }
    if (typeof file.asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(file.asOfDate)) {
      addFailure(`filesIngested[${index}].asOfDate invalid`);
    }
    if (file.yearRange !== null) {
      if (!Array.isArray(file.yearRange) || file.yearRange.length !== 2 ||
          !Number.isInteger(file.yearRange[0]) || !Number.isInteger(file.yearRange[1]) ||
          file.yearRange[0] > file.yearRange[1]) {
        addFailure(`filesIngested[${index}].yearRange must be [startYear, endYear] integers`);
      }
    }
    if (!isNonNegativeInteger(file.rowCount)) addFailure(`filesIngested[${index}].rowCount must be non-negative integer`);
  }
  const missingExpected = [...expectedSlugs].filter((slug) => !seenSlugs.has(slug));
  if (missingExpected.length > 0) {
    addFailure(`filesIngested missing required slugs (all 6 must be present): ${missingExpected.join(', ')}`);
  }
}

function validateGlobal(global) {
  if (!isObject(global)) {
    addFailure('global must be an object');
    return;
  }
  for (const key of globalIntegerFields) {
    requireKey(global, key, 'global');
    if (!isNonNegativeInteger(global[key])) addFailure(`global.${key} must be non-negative integer`);
  }
  for (const key of globalRationalOrNullFields) {
    requireKey(global, key, 'global');
    if (global[key] !== null && !Number.isFinite(global[key])) {
      addFailure(`global.${key} must be finite number or null`);
    }
  }
  const share1 = global.civilianTargetingShareLatestFullYear;
  if (share1 !== null && (share1 < 0 || share1 > 1)) {
    addFailure('global.civilianTargetingShareLatestFullYear must be in [0, 1] or null');
  }
  const share2 = global.civilianFatalitiesShareLatestFullYear;
  if (share2 !== null && (share2 < 0 || share2 > 1)) {
    addFailure('global.civilianFatalitiesShareLatestFullYear must be in [0, 1] or null');
  }
}

function validateMonthlyTrend(trend) {
  if (trend === null) return;
  if (!isObject(trend)) {
    addFailure('monthlyTrend must be object or null');
    return;
  }
  for (const key of ['latest12mWindow', 'prior12mWindow', 'latest12mEvents', 'prior12mEvents', 'latest12mVsPrior12mDelta']) {
    requireKey(trend, key, 'monthlyTrend');
  }
  for (const key of ['latest12mWindow', 'prior12mWindow']) {
    const window = trend[key];
    if (window === null) continue;
    if (!Array.isArray(window) || window.length !== 2 ||
        !window.every((value) => typeof value === 'string' && /^\d{4}-\d{2}$/u.test(value))) {
      addFailure(`monthlyTrend.${key} must be [startYYYY-MM, endYYYY-MM] or null`);
    }
  }
  if (!isNonNegativeInteger(trend.latest12mEvents)) addFailure('monthlyTrend.latest12mEvents must be non-negative integer');
  if (!isNonNegativeInteger(trend.prior12mEvents)) addFailure('monthlyTrend.prior12mEvents must be non-negative integer');
  if (trend.latest12mVsPrior12mDelta !== null && !Number.isFinite(trend.latest12mVsPrior12mDelta)) {
    addFailure('monthlyTrend.latest12mVsPrior12mDelta must be finite or null');
  }
}

function validateTopEscalating(list) {
  if (!Array.isArray(list)) {
    addFailure('topEscalatingCountries must be array');
    return;
  }
  if (list.length > 10) addFailure('topEscalatingCountries length must be 0-10');
  for (const [index, item] of list.entries()) {
    if (!isObject(item)) {
      addFailure(`topEscalatingCountries[${index}] must be object`);
      continue;
    }
    for (const key of ['country', 'latestFullYearEvents', 'prior3YearAverageEvents', 'yoyDelta']) {
      requireKey(item, key, `topEscalatingCountries[${index}]`);
    }
    if (typeof item.country !== 'string' || item.country.length === 0) {
      addFailure(`topEscalatingCountries[${index}].country invalid`);
    }
    if (!isNonNegativeInteger(item.latestFullYearEvents) || item.latestFullYearEvents < 50) {
      addFailure(`topEscalatingCountries[${index}].latestFullYearEvents must be integer >= 50 (noise threshold)`);
    }
    if (item.prior3YearAverageEvents !== null && (!Number.isFinite(item.prior3YearAverageEvents) || item.prior3YearAverageEvents < 0)) {
      addFailure(`topEscalatingCountries[${index}].prior3YearAverageEvents must be non-negative finite or null`);
    }
    if (item.yoyDelta !== null && !Number.isFinite(item.yoyDelta)) {
      addFailure(`topEscalatingCountries[${index}].yoyDelta must be finite or null`);
    }
  }
}

function validateTopFatalities(list) {
  if (!Array.isArray(list)) {
    addFailure('topFatalitiesCountries must be array');
    return;
  }
  if (list.length > 10) addFailure('topFatalitiesCountries length must be 0-10');
  for (const [index, item] of list.entries()) {
    if (!isObject(item)) {
      addFailure(`topFatalitiesCountries[${index}] must be object`);
      continue;
    }
    for (const key of ['country', 'fatalities']) requireKey(item, key, `topFatalitiesCountries[${index}]`);
    if (typeof item.country !== 'string' || item.country.length === 0) {
      addFailure(`topFatalitiesCountries[${index}].country invalid`);
    }
    if (!isNonNegativeInteger(item.fatalities)) {
      addFailure(`topFatalitiesCountries[${index}].fatalities must be non-negative integer`);
    }
  }
}

function validateQuality(quality) {
  if (!isObject(quality)) {
    addFailure('quality must be object');
    return;
  }
  if (quality.isRealData !== true) addFailure('quality.isRealData must be true');
  if (quality.sourceUrl !== SOURCE_URL) addFailure('quality.sourceUrl must match DATA_SOURCES.md canonical value');
  if (quality.licenseLevel !== LICENSE_LEVEL) addFailure('quality.licenseLevel must match DATA_SOURCES.md canonical value');
  if (quality.attribution !== ATTRIBUTION) addFailure('quality.attribution must match DATA_SOURCES.md canonical value');
  if (typeof quality.methodologyNoteZh !== 'string' || quality.methodologyNoteZh.length < 40) {
    addFailure('quality.methodologyNoteZh must be a non-empty Chinese methodology note');
  }
  if (!Number.isFinite(quality.confidence) || quality.confidence < 0 || quality.confidence > 1) {
    addFailure('quality.confidence must be in [0, 1]');
  }
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (err) {
  addFailure(`JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
}

if (payload !== undefined) {
  if (!isObject(payload)) addFailure('payload must be object');
  else {
    for (const key of topLevelKeys) requireKey(payload, key, 'root');
    if (payload.source !== SOURCE) addFailure(`source must be ${SOURCE}`);
    validateIsoTimestamp(payload.preparedAt, 'preparedAt');
    validateAsOfDate(payload.asOfDate);
    validateLatestFullYear(payload.latestFullYear, payload.asOfDate);
    validateFilesIngested(payload.filesIngested);
    validateGlobal(payload.global);
    validateMonthlyTrend(payload.monthlyTrend);
    validateTopEscalating(payload.topEscalatingCountries);
    validateTopFatalities(payload.topFatalitiesCountries);
    validateQuality(payload.quality);
    if (hasForbiddenKey(payload)) addFailure('payload must not contain exampleOnly or notForScoring keys');
  }
}

for (const warning of warnings) console.warn(`ACLED monthly aggregated check warning: ${warning}`);

if (failures.length > 0) {
  console.error('ACLED monthly aggregated check: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`ACLED monthly aggregated check: PASS (files=${payload.filesIngested.length}, asOfDate=${payload.asOfDate}, latestFullYear=${payload.latestFullYear}, pvEvents=${payload.global.politicalViolenceEventsLatestFullYear}, yoyDelta=${fmtDelta(payload.global.politicalViolenceYoyDelta)})`);
