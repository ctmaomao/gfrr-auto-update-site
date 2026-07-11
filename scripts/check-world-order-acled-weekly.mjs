import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const inputPath = path.join(root, 'config', 'world-order-acled-regional-weekly.json');

const SOURCE = 'acled-aggregated-manual-normalized-weekly';
const SOURCE_URL = 'https://acleddata.com/conflict-data/download-data-files';
const LICENSE_LEVEL = 'open';
const ATTRIBUTION = 'ACLED (Armed Conflict Location & Event Data) — https://acleddata.com';
const XLSX_ALLOWED_IMPORTS = new Set([
  'scripts/world-order/sanitize-acled-weekly.mjs',
  'scripts/world-order/sanitize-acled-monthly.mjs'
]);
const failures = [];
const warnings = [];

const topLevelKeys = [
  'version',
  'source',
  'sourceName',
  'preparedAt',
  'preparedBy',
  'latestWeek',
  'filesIngested',
  'global',
  'regionalLast4Weeks',
  'hotZonesLast4Weeks',
  'quality'
];

const globalIntegerFields = [
  'eventsLast4Weeks',
  'eventsLast12Weeks',
  'fatalitiesLast4Weeks',
  'fatalitiesLast12Weeks'
];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function dateAgeDays(isoDate) {
  const latest = new Date(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(latest.getTime())) return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((today.getTime() - latest.getTime()) / 86_400_000);
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

function listSourceFiles(target) {
  if (!fs.existsSync(target)) return [];
  const stats = fs.statSync(target);
  if (stats.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) =>
    listSourceFiles(path.join(target, entry.name))
  );
}

function validateXlsxIsolation() {
  const dependency = ['xl', 'sx'].join('');
  const imports = [
    'scripts',
    'workers',
    'tools',
    '.github/workflows',
    'index.html',
    'bubble-watch.html'
  ]
    .flatMap((target) => listSourceFiles(path.join(root, target)))
    .filter((file) => /\.(?:c?js|mjs|ya?ml|html)$/u.test(file))
    .filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return source.includes(`from '${dependency}'`)
        || source.includes(`from "${dependency}"`)
        || source.includes(`require('${dependency}')`)
        || source.includes(`require("${dependency}")`)
        || source.includes(`import('${dependency}')`)
        || source.includes(`import("${dependency}")`);
    })
    .map((file) => path.relative(root, file).replace(/\\/gu, '/'));

  for (const file of imports) {
    if (!XLSX_ALLOWED_IMPORTS.has(file)) addFailure(`xlsx import escaped ADR-0013 allowlist: ${file}`);
  }
  for (const file of XLSX_ALLOWED_IMPORTS) {
    if (!imports.includes(file)) addFailure(`expected xlsx sanitizer import missing: ${file}`);
  }
}

validateXlsxIsolation();

if (!fs.existsSync(inputPath)) {
  if (failures.length > 0) {
    console.error('ACLED weekly aggregated check: FAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('ACLED weekly aggregated check: PASS (state=no_input)');
  process.exit(0);
}

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

function validateLatestWeek(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    addFailure('latestWeek must match YYYY-MM-DD');
    return;
  }
  const ageDays = dateAgeDays(value);
  if (ageDays === null) {
    addFailure('latestWeek must be parseable');
    return;
  }
  if (ageDays < 0) addFailure(`latestWeek ${value} is in the future`);
  else if (ageDays > 90) addFailure(`latestWeek ${value} is expired (${ageDays} days old)`);
  else if (ageDays > 30) warnings.push(`latestWeek ${value} is aging (${ageDays} days old)`);
}

function validateFilesIngested(files) {
  if (!Array.isArray(files)) {
    addFailure('filesIngested must be an array');
    return;
  }
  if (files.length < 1 || files.length > 6) addFailure('filesIngested length must be 1-6 when present');
  for (const [index, file] of files.entries()) {
    if (!isObject(file)) {
      addFailure(`filesIngested[${index}] must be an object`);
      continue;
    }
    for (const key of ['region', 'filename', 'weekRange', 'rowCount']) requireKey(file, key, `filesIngested[${index}]`);
    if (typeof file.region !== 'string' || file.region.length === 0) addFailure(`filesIngested[${index}].region invalid`);
    if (typeof file.filename !== 'string' || !file.filename.endsWith('.xlsx')) addFailure(`filesIngested[${index}].filename invalid`);
    if (!Array.isArray(file.weekRange) || file.weekRange.length !== 2) addFailure(`filesIngested[${index}].weekRange must have two dates`);
    if (!isNonNegativeInteger(file.rowCount)) addFailure(`filesIngested[${index}].rowCount must be non-negative integer`);
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
  if (global.eventsDelta4Vs12 !== null && !Number.isFinite(global.eventsDelta4Vs12)) {
    addFailure('global.eventsDelta4Vs12 must be finite or null');
  }
  if (global.civilianTargetingShareLast4Weeks !== null) {
    if (!Number.isFinite(global.civilianTargetingShareLast4Weeks) || global.civilianTargetingShareLast4Weeks < 0 || global.civilianTargetingShareLast4Weeks > 1) {
      addFailure('global.civilianTargetingShareLast4Weeks must be in [0, 1] or null');
    }
  }
}

function validateRegional(regional) {
  if (!Array.isArray(regional)) {
    addFailure('regionalLast4Weeks must be an array');
    return;
  }
  if (regional.length < 1 || regional.length > 6) addFailure('regionalLast4Weeks length must be 1-6');
  for (const [index, item] of regional.entries()) {
    if (!isObject(item)) {
      addFailure(`regionalLast4Weeks[${index}] must be object`);
      continue;
    }
    for (const key of ['region', 'events', 'fatalities', 'civilianTargetingEvents', 'topCountriesByEvents']) {
      requireKey(item, key, `regionalLast4Weeks[${index}]`);
    }
    if (typeof item.region !== 'string' || item.region.length === 0) addFailure(`regionalLast4Weeks[${index}].region invalid`);
    for (const key of ['events', 'fatalities', 'civilianTargetingEvents']) {
      if (!isNonNegativeInteger(item[key])) addFailure(`regionalLast4Weeks[${index}].${key} must be non-negative integer`);
    }
    if (!Array.isArray(item.topCountriesByEvents) || item.topCountriesByEvents.length > 5) {
      addFailure(`regionalLast4Weeks[${index}].topCountriesByEvents must be array length <= 5`);
    }
  }
}

function validateHotZones(hotZones) {
  if (!Array.isArray(hotZones)) {
    addFailure('hotZonesLast4Weeks must be an array');
    return;
  }
  if (hotZones.length > 10) addFailure('hotZonesLast4Weeks length must be 0-10');
  for (const [index, zone] of hotZones.entries()) {
    if (!isObject(zone)) {
      addFailure(`hotZonesLast4Weeks[${index}] must be object`);
      continue;
    }
    for (const key of ['country', 'admin1', 'events', 'fatalities']) requireKey(zone, key, `hotZonesLast4Weeks[${index}]`);
    if (typeof zone.country !== 'string' || zone.country.length === 0) addFailure(`hotZonesLast4Weeks[${index}].country invalid`);
    if (typeof zone.admin1 !== 'string' || zone.admin1.length === 0) addFailure(`hotZonesLast4Weeks[${index}].admin1 invalid`);
    if (!isNonNegativeInteger(zone.events)) addFailure(`hotZonesLast4Weeks[${index}].events must be non-negative integer`);
    if (!isNonNegativeInteger(zone.fatalities)) addFailure(`hotZonesLast4Weeks[${index}].fatalities must be non-negative integer`);
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
    validateLatestWeek(payload.latestWeek);
    validateFilesIngested(payload.filesIngested);
    validateGlobal(payload.global);
    validateRegional(payload.regionalLast4Weeks);
    validateHotZones(payload.hotZonesLast4Weeks);
    validateQuality(payload.quality);
    if (Array.isArray(payload.filesIngested) && Array.isArray(payload.regionalLast4Weeks) && payload.filesIngested.length !== payload.regionalLast4Weeks.length) {
      addFailure('filesIngested.length must equal regionalLast4Weeks.length');
    }
    if (hasForbiddenKey(payload)) addFailure('payload must not contain exampleOnly or notForScoring keys');
  }
}

for (const warning of warnings) console.warn(`ACLED weekly aggregated check warning: ${warning}`);

if (failures.length > 0) {
  console.error('ACLED weekly aggregated check: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`ACLED weekly aggregated check: PASS (regions=${payload.regionalLast4Weeks.length}, latestWeek=${payload.latestWeek}, eventsLast4Weeks=${payload.global.eventsLast4Weeks}, eventsDelta4Vs12=${fmtDelta(payload.global.eventsDelta4Vs12)})`);
