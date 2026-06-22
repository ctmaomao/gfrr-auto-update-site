#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (message) => errors.push(message);
const data = JSON.parse(readFileSync(resolve('data/oil-thermal-watch.json'), 'utf8'));
const config = JSON.parse(readFileSync(resolve('config/oil-thermal-watch-facilities.json'), 'utf8'));
const baselineConfig = JSON.parse(readFileSync(resolve('config/oil-thermal-watch-baseline.json'), 'utf8'));

const STATUSES = new Set(['ok', 'partial', 'source_unavailable', 'not_configured', 'dry_run']);
const SIGNAL_STATES = new Set([
  'facility_whitelist_missing',
  'map_key_or_facility_missing',
  'map_key_missing',
  'source_unavailable',
  'baseline_established_no_detections',
  'baseline_established_no_repeated_signal',
  'baseline_repeated_watch',
  'baseline_elevated_repeated_watch',
  'baseline_building_no_detections',
  'baseline_building_watch',
  'baseline_building_elevated_watch',
  'dry_run'
]);
const SOURCE_STATUSES = new Set(['configured', 'missing', 'not_queried', 'live', 'partial', 'error']);
const ANOMALY_LEVELS = new Set([
  'none_observed',
  'low_signal',
  'watch',
  'elevated_watch',
  'repeated_watch',
  'elevated_repeated_watch'
]);
const BASELINE_STATUSES = new Set(['missing', 'not_established', 'insufficient_samples', 'partial', 'established']);
const PRODUCTION_FALSE_KEYS = [
  'affectsValues',
  'affectsScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance',
  'affectsBrentPromotion',
  'affectsOdpFinalBias',
  'affectsGlobalRiskHeatmap',
  'affectsCrossValidation'
];

function finiteOrNull(value) {
  return value === null || Number.isFinite(value);
}

function validateSummary(path, obj) {
  if (!obj || typeof obj !== 'object') {
    fail(`${path} must be an object`);
    return;
  }
  for (const field of ['rowCount', 'highConfidenceCount', 'frpOver50Count', 'frpOver100Count']) {
    if (!Number.isFinite(obj[field]) || obj[field] < 0) fail(`${path}.${field} must be a non-negative number`);
  }
  if (!finiteOrNull(obj.maxFrp)) fail(`${path}.maxFrp must be number|null`);
  if (obj.latestAcqAt !== null && (typeof obj.latestAcqAt !== 'string' || Number.isNaN(Date.parse(obj.latestAcqAt)))) {
    fail(`${path}.latestAcqAt must be ISO|null`);
  }
  for (const field of ['confidenceCounts', 'dayNightCounts']) {
    if (!obj[field] || typeof obj[field] !== 'object' || Array.isArray(obj[field])) fail(`${path}.${field} must be an object`);
  }
}

if (data.schemaVersion !== 'oil-thermal-watch-1') fail(`schemaVersion invalid: ${data.schemaVersion}`);
if (data.module !== 'oil-thermal-watch') fail(`module invalid: ${data.module}`);
if (typeof data.generatedAt !== 'string' || Number.isNaN(Date.parse(data.generatedAt))) fail('generatedAt must be ISO');
if (!STATUSES.has(data.status)) fail(`status invalid: ${data.status}`);
if (!SIGNAL_STATES.has(data.signalState)) fail(`signalState invalid: ${data.signalState}`);
if (typeof data.displayStatusZh !== 'string' || !data.displayStatusZh) fail('displayStatusZh must be non-empty');
if (!Array.isArray(data.sources) || data.sources.length === 0) fail('sources must be a non-empty array');

if (!data.sourceStatus || typeof data.sourceStatus !== 'object') {
  fail('sourceStatus missing');
} else {
  for (const field of ['mapKey', 'firms', 'facilities']) {
    if (!SOURCE_STATUSES.has(data.sourceStatus[field])) fail(`sourceStatus.${field} invalid: ${data.sourceStatus[field]}`);
  }
}

if (!data.facilityCoverage || typeof data.facilityCoverage !== 'object') {
  fail('facilityCoverage missing');
} else {
  if (data.facilityCoverage.configPath !== 'config/oil-thermal-watch-facilities.json') {
    fail('facilityCoverage.configPath must use committed production config');
  }
  const configFacilities = Array.isArray(config.facilities) ? config.facilities : [];
  if (data.facilityCoverage.facilityCount !== configFacilities.length) {
    fail('facilityCoverage.facilityCount must match config facilities length');
  }
  if (!data.facilityCoverage.requestBudget || data.facilityCoverage.requestBudget.maxRequestsPerRun !== 150) {
    fail('facilityCoverage.requestBudget must preserve maxRequestsPerRun=150');
  }
}

if (!data.baseline || typeof data.baseline !== 'object') {
  fail('baseline missing');
} else {
  if (data.baseline.configPath !== 'config/oil-thermal-watch-baseline.json') {
    fail('baseline.configPath must use committed production baseline config');
  }
  if (data.baseline.configSchemaVersion !== baselineConfig.schemaVersion) {
    fail('baseline.configSchemaVersion must match config/oil-thermal-watch-baseline.json');
  }
  if (!BASELINE_STATUSES.has(data.baseline.status)) fail(`baseline.status invalid: ${data.baseline.status}`);
  for (const field of ['minSamplesPerFacility', 'minRepeatSources', 'facilityCount', 'baselineFacilityCount', 'facilitiesWithEstablishedBaseline']) {
    if (!Number.isFinite(data.baseline[field]) || data.baseline[field] < 0) fail(`baseline.${field} must be non-negative number`);
  }
  if (!data.baseline.repeatedObservationRule || typeof data.baseline.repeatedObservationRule !== 'object') {
    fail('baseline.repeatedObservationRule missing');
  } else if (data.baseline.repeatedObservationRule.requiresEstablishedBaseline !== true
    || data.baseline.repeatedObservationRule.requiresAboveBaselineStrength !== true) {
    fail('baseline.repeatedObservationRule must require established baseline and above-baseline strength');
  }
}

if (!data.freshness || typeof data.freshness !== 'object') {
  fail('freshness missing');
} else {
  if (!Number.isFinite(data.freshness.windowDays) || data.freshness.windowDays < 1 || data.freshness.windowDays > 5) {
    fail('freshness.windowDays must be 1..5');
  }
  if (!finiteOrNull(data.freshness.latestAgeHours)) fail('freshness.latestAgeHours must be number|null');
}

validateSummary('aggregate', data.aggregate);
if (data.aggregate) {
  for (const field of ['facilityCount', 'facilitiesWithDetections', 'requestCount', 'requestErrorCount']) {
    if (!Number.isFinite(data.aggregate[field]) || data.aggregate[field] < 0) fail(`aggregate.${field} must be non-negative number`);
  }
  for (const field of ['repeatedObservationCount', 'elevatedRepeatedObservationCount', 'facilitiesWithEstablishedBaseline']) {
    if (!Number.isFinite(data.aggregate[field]) || data.aggregate[field] < 0) fail(`aggregate.${field} must be non-negative number`);
  }
  if (!BASELINE_STATUSES.has(data.aggregate.baselineStatus)) fail(`aggregate.baselineStatus invalid: ${data.aggregate.baselineStatus}`);
}

if (!Array.isArray(data.facilities)) {
  fail('facilities must be an array');
} else if (data.facilityCoverage && data.facilities.length !== data.facilityCoverage.facilityCount) {
  fail('facilities length must match facilityCoverage.facilityCount');
}
for (const [index, facility] of (data.facilities || []).entries()) {
  const path = `facilities[${index}]`;
  for (const field of ['id', 'label', 'region', 'assetType', 'sourceNote', 'sourceAgreement', 'sourceStatus', 'anomalyLabelZh', 'baselineStatus', 'noteZh']) {
    if (typeof facility[field] !== 'string' || !facility[field]) fail(`${path}.${field} must be non-empty string`);
  }
  if (!ANOMALY_LEVELS.has(facility.anomalyLevel)) fail(`${path}.anomalyLevel invalid: ${facility.anomalyLevel}`);
  if (!ANOMALY_LEVELS.has(facility.rawSignalLevel)) fail(`${path}.rawSignalLevel invalid: ${facility.rawSignalLevel}`);
  if (!BASELINE_STATUSES.has(facility.baselineStatus)) fail(`${path}.baselineStatus invalid: ${facility.baselineStatus}`);
  validateSummary(path, facility);
  if (!facility.baselineComparison || typeof facility.baselineComparison !== 'object') {
    fail(`${path}.baselineComparison missing`);
  } else {
    if (!BASELINE_STATUSES.has(facility.baselineComparison.status)) {
      fail(`${path}.baselineComparison.status invalid: ${facility.baselineComparison.status}`);
    }
    for (const field of ['sampleCount', 'requiredSampleCount', 'sourcesWithDetections']) {
      if (!Number.isFinite(facility.baselineComparison[field]) || facility.baselineComparison[field] < 0) {
        fail(`${path}.baselineComparison.${field} must be non-negative number`);
      }
    }
    for (const field of ['sourceRepeatMet', 'aboveBaselineStrength', 'repeatedObservation', 'elevatedRepeatedObservation']) {
      if (typeof facility.baselineComparison[field] !== 'boolean') fail(`${path}.baselineComparison.${field} must be boolean`);
    }
  }
  if ('bbox' in facility) fail(`${path}.bbox must not be exposed in production display artifact`);
  if ('redactedUrl' in facility || 'url' in facility) fail(`${path} must not expose FIRMS URLs`);
}

if (!data.productionImpact || typeof data.productionImpact !== 'object') {
  fail('productionImpact missing');
} else {
  for (const field of PRODUCTION_FALSE_KEYS) {
    if (data.productionImpact[field] !== false) fail(`productionImpact.${field} must be false`);
  }
}
if (typeof data.boundary !== 'string' || !/display-only|audit-only/i.test(data.boundary) || !/NOT in/u.test(data.boundary)) {
  fail('boundary must declare display-only/audit-only and NOT in guarded paths');
}
if (JSON.stringify(data).includes('FIRMS_MAP_KEY') || /firms\.modaps\.eosdis\.nasa\.gov\/api\/area\/csv/u.test(JSON.stringify(data))) {
  fail('production artifact must not contain raw/redacted FIRMS URL or key marker');
}

if (errors.length > 0) {
  console.error('Oil thermal watch contract check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log(`Oil thermal watch contract check: PASS (${data.status}, facilities=${data.facilityCoverage.facilityCount})`);
