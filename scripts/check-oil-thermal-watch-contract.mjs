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
const FIRMS_FAILURE_CATEGORIES = new Set([
  'timeout',
  'network_error',
  'rate_limited',
  'server_error',
  'authentication_error',
  'request_rejected',
  'unexpected_http_status',
  'empty_response',
  'non_csv_response',
  'invalid_csv_schema',
  'response_parse_error',
  'unknown_error'
]);
const ANOMALY_LEVELS = new Set([
  'none_observed',
  'low_signal',
  'watch',
  'elevated_watch',
  'repeated_watch',
  'elevated_repeated_watch'
]);
const BASELINE_STATUSES = new Set(['missing', 'not_established', 'insufficient_samples', 'partial', 'established']);
const BASELINE_QUALITIES = new Set([
  'starter_short_window',
  'starter_observation_window',
  'established_observation_window'
]);
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
const MAX_FIRMS_REQUESTS_PER_RUN = 150;
const DEFAULT_SOURCE_COUNT = 3;

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

function validateFacilityConfig() {
  if (!Array.isArray(config.facilities) || config.facilities.length === 0) {
    fail('config.facilities must be a non-empty array');
    return;
  }
  const seenFacilityIds = new Set();
  for (const [index, facility] of config.facilities.entries()) {
    const path = `config.facilities[${index}]`;
    for (const field of ['id', 'label', 'region', 'assetType', 'sourceNote']) {
      if (typeof facility[field] !== 'string' || !facility[field]) fail(`${path}.${field} must be non-empty string`);
    }
    if (seenFacilityIds.has(facility.id)) fail(`${path}.id must be unique: ${facility.id}`);
    seenFacilityIds.add(facility.id);
    if (!Array.isArray(facility.bbox) || facility.bbox.length !== 4) {
      fail(`${path}.bbox must be [west,south,east,north]`);
    } else {
      const [west, south, east, north] = facility.bbox;
      if (![west, south, east, north].every(Number.isFinite)) fail(`${path}.bbox values must be finite`);
      if (!(west < east && south < north)) fail(`${path}.bbox must be ordered west<east and south<north`);
      if (Math.abs((east ?? 0) - (west ?? 0)) > 1.5 || Math.abs((north ?? 0) - (south ?? 0)) > 1.5) {
        fail(`${path}.bbox must stay within the small FIRMS watch-box limit`);
      }
    }
    if (!/sourceUrl=/u.test(facility.sourceNote)) fail(`${path}.sourceNote must include sourceUrl`);
  }
  const requestCount = config.facilities.length * DEFAULT_SOURCE_COUNT;
  if (requestCount > MAX_FIRMS_REQUESTS_PER_RUN) {
    fail(`config.facilities exceeds FIRMS request budget: ${requestCount}/${MAX_FIRMS_REQUESTS_PER_RUN}`);
  }
}

validateFacilityConfig();

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
  } else if ('maxRetryRequestsPerRun' in data.facilityCoverage.requestBudget) {
    if (data.facilityCoverage.requestBudget.maxRetryRequestsPerRun !== 6) {
      fail('facilityCoverage.requestBudget.maxRetryRequestsPerRun must be 6');
    }
    if (data.facilityCoverage.requestBudget.maxRetriesPerRequest !== 1) {
      fail('facilityCoverage.requestBudget.maxRetriesPerRequest must be 1');
    }
    if (data.facilityCoverage.requestBudget.maxNetworkAttemptsPerRun !== 156) {
      fail('facilityCoverage.requestBudget.maxNetworkAttemptsPerRun must be 156');
    }
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
  if (baselineConfig.sourceReview) {
    if (!data.baseline.sourceReview || typeof data.baseline.sourceReview !== 'object') {
      fail('baseline.sourceReview must be exposed when config sourceReview exists');
    } else {
      if (data.baseline.sourceReview.baselineQuality !== baselineConfig.sourceReview.baselineQuality) {
        fail('baseline.sourceReview.baselineQuality must match config sourceReview');
      }
      if (!BASELINE_QUALITIES.has(data.baseline.sourceReview.baselineQuality)) {
        fail(`baseline.sourceReview.baselineQuality invalid: ${data.baseline.sourceReview.baselineQuality}`);
      }
      if (!finiteOrNull(data.baseline.sourceReview.sampleWindowDays)) {
        fail('baseline.sourceReview.sampleWindowDays must be number|null');
      }
      if (!Array.isArray(data.baseline.sourceReview.caveats)) {
        fail('baseline.sourceReview.caveats must be an array');
      }
    }
  }
}

if (data.baseline && data.aggregate) {
  if (data.aggregate.baselineStatus !== data.baseline.status) {
    fail('aggregate.baselineStatus must match baseline.status');
  }
  if (data.baseline.status === 'partial') {
    if (!String(data.displayStatusZh || '').includes('部分基线')) {
      fail('partial baseline thermal watch must expose 部分基线 in displayStatusZh');
    }
    const limitationText = JSON.stringify(data.limitationsZh || []);
    if (!limitationText.includes('部分基线')) {
      fail('partial baseline thermal watch limitations must explain partial baseline');
    }
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
  if ('requestDiagnostics' in data.aggregate) {
    const diagnostics = data.aggregate.requestDiagnostics;
    if (!diagnostics || typeof diagnostics !== 'object') {
      fail('aggregate.requestDiagnostics must be an object');
    } else {
      if (diagnostics.policyVersion !== 'firms-request-policy-1') {
        fail(`aggregate.requestDiagnostics.policyVersion invalid: ${diagnostics.policyVersion}`);
      }
      if (diagnostics.logicalRequestCount !== data.aggregate.requestCount) {
        fail('aggregate.requestDiagnostics.logicalRequestCount must match aggregate.requestCount');
      }
      if (diagnostics.failedRequestCount !== data.aggregate.requestErrorCount) {
        fail('aggregate.requestDiagnostics.failedRequestCount must match aggregate.requestErrorCount');
      }
      for (const field of [
        'totalAttemptCount',
        'retryCount',
        'recoveredAfterRetryCount',
        'failedRequestCount',
        'retryableFailureCount',
        'retryBudgetExhaustedCount',
        'backoffAppliedMs'
      ]) {
        if (!Number.isFinite(diagnostics[field]) || diagnostics[field] < 0) {
          fail(`aggregate.requestDiagnostics.${field} must be a non-negative number`);
        }
      }
      if (diagnostics.retryCount > 6 || diagnostics.totalAttemptCount > data.aggregate.requestCount + 6) {
        fail('aggregate.requestDiagnostics exceeds the bounded per-run retry budget');
      }
      for (const field of ['failuresByCategory', 'attemptFailuresByCategory']) {
        const counts = diagnostics[field];
        if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
          fail(`aggregate.requestDiagnostics.${field} must be an object`);
          continue;
        }
        for (const [category, count] of Object.entries(counts)) {
          if (!FIRMS_FAILURE_CATEGORIES.has(category) || !Number.isFinite(count) || count < 0) {
            fail(`aggregate.requestDiagnostics.${field}.${category} is invalid`);
          }
        }
      }
      const retryPolicy = diagnostics.retryPolicy;
      if (!retryPolicy || retryPolicy.maxRetriesPerRequest !== 1 || retryPolicy.maxRetriesPerRun !== 6) {
        fail('aggregate.requestDiagnostics.retryPolicy must preserve one retry/request and six retries/run');
      }
    }
  }
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
if (JSON.stringify(data).includes('errorReason')) {
  fail('production artifact must expose categorized diagnostics instead of free-form errorReason text');
}

if (errors.length > 0) {
  console.error('Oil thermal watch contract check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log(`Oil thermal watch contract check: PASS (${data.status}, facilities=${data.facilityCoverage.facilityCount})`);
