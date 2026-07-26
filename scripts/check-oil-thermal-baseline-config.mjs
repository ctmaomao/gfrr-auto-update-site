#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (message) => errors.push(message);
const baseline = JSON.parse(readFileSync(resolve('config/oil-thermal-watch-baseline.json'), 'utf8'));
const facilityConfig = JSON.parse(readFileSync(resolve('config/oil-thermal-watch-facilities.json'), 'utf8'));
const facilities = Array.isArray(facilityConfig.facilities) ? facilityConfig.facilities : [];
const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
const rows = Array.isArray(baseline.facilities) ? baseline.facilities : [];
const rowIds = new Set();

const VALID_STATUS = new Set(['not_established', 'partial', 'established']);
const VALID_PROMOTION_VERSIONS = new Set([
  'oil-thermal-baseline-promotion-p48',
  'oil-thermal-baseline-promotion-p49',
  'oil-thermal-baseline-promotion-p60'
]);
const VALID_PROMOTION_STAGES = new Set(['P48', 'P49', 'P60']);
const VALID_BASELINE_QUALITIES = [
  'starter_short_window',
  'starter_observation_window',
  'established_observation_window'
];
const VALID_QUALITY_TRANSITIONS = new Set(['new', 'unchanged', 'upgraded', 'downgraded']);
const QUALITY_POLICY = {
  starterShortWindowMaxDays: 7,
  starterObservationWindowMaxDays: 30
};
const POLICY_FIELDS = [
  'minSamplesPerFacility',
  'minRepeatSources',
  'rowCountP95Margin',
  'maxFrpP95Margin',
  'highConfidenceP95Margin',
  'frpOver50P95Margin',
  'elevatedMinFrp',
  'elevatedMinHighConfidenceCount',
  'elevatedMinFrpOver50Count',
  'elevatedMinFrpOver100Count'
];
const ROW_METRIC_FIELDS = [
  'rowCountP95',
  'maxFrpP95',
  'highConfidenceCountP95',
  'frpOver50CountP95',
  'frpOver100CountP95',
  'sourcesWithDetectionsP95'
];

function isIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function expectedBaselineQuality(sampleWindowDays) {
  if (sampleWindowDays < QUALITY_POLICY.starterShortWindowMaxDays) return 'starter_short_window';
  if (sampleWindowDays < QUALITY_POLICY.starterObservationWindowMaxDays) return 'starter_observation_window';
  return 'established_observation_window';
}

function checkNoSensitiveText(payload) {
  const text = JSON.stringify(payload);
  if (text.includes('FIRMS_MAP_KEY')) fail('baseline config must not contain FIRMS_MAP_KEY marker');
  if (/firms\.modaps\.eosdis\.nasa\.gov\/api\/area\/csv/u.test(text)) {
    fail('baseline config must not contain raw FIRMS Area API URLs');
  }
  if (text.includes('"candidateOnly"')) fail('baseline config must not copy candidateOnly review marker');
  if (text.includes('"productionImpact"')) fail('baseline config must not carry productionImpact review map');
}

if (baseline.schemaVersion !== 'oil-thermal-baseline-production-v1') {
  fail(`schemaVersion invalid: ${baseline.schemaVersion}`);
}
if (!VALID_STATUS.has(baseline.status)) fail(`status invalid: ${baseline.status}`);
if (!baseline.policy || typeof baseline.policy !== 'object' || Array.isArray(baseline.policy)) {
  fail('policy must be an object');
} else {
  for (const field of POLICY_FIELDS) {
    if (!isNonNegativeNumber(baseline.policy[field])) fail(`policy.${field} must be non-negative number`);
  }
  if (baseline.policy.minSamplesPerFacility < 8) fail('policy.minSamplesPerFacility must be >= 8');
  if (baseline.policy.minRepeatSources < 2) fail('policy.minRepeatSources must be >= 2');
  if (baseline.policy.elevatedMinFrp < 50) fail('policy.elevatedMinFrp must be >= 50');
}

if (!Array.isArray(baseline.notes) || baseline.notes.length < 3) {
  fail('notes must document baseline limits');
} else {
  const joined = baseline.notes.join(' ');
  for (const marker of ['MAP_KEY', 'oil-price direction', 'ODP finalBias', 'scoring']) {
    if (!joined.includes(marker)) fail(`notes must retain boundary marker: ${marker}`);
  }
}

if (baseline.status === 'not_established' && rows.length !== 0) {
  fail('not_established baseline must not contain facility rows');
}
if (baseline.status === 'partial') {
  if (rows.length <= 0) fail('partial baseline must contain at least one established facility row');
  if (rows.length >= facilities.length) {
    fail(`partial baseline rows ${rows.length} must be fewer than facility whitelist ${facilities.length}`);
  }
  if (!isIso(baseline.establishedAt)) fail('establishedAt must be ISO for partial baseline');
}
if (baseline.status === 'established') {
  if (rows.length !== facilities.length) fail(`established baseline rows ${rows.length} must match facility whitelist ${facilities.length}`);
  if (!isIso(baseline.establishedAt)) fail('establishedAt must be ISO for established baseline');
}
if (baseline.status === 'partial' || baseline.status === 'established') {
  const review = baseline.sourceReview;
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    fail(`sourceReview must be present for ${baseline.status} baseline`);
  } else {
    if (!VALID_PROMOTION_VERSIONS.has(review.promotionVersion)) {
      fail(`sourceReview.promotionVersion invalid: ${review.promotionVersion}`);
    }
    if (!VALID_PROMOTION_STAGES.has(review.promotionStage)) fail(`sourceReview.promotionStage invalid: ${review.promotionStage}`);
    if (!VALID_BASELINE_QUALITIES.includes(review.baselineQuality)) {
      fail(`sourceReview.baselineQuality invalid: ${review.baselineQuality}`);
    }
    if ('qualityTransition' in review && !VALID_QUALITY_TRANSITIONS.has(review.qualityTransition)) {
      fail(`sourceReview.qualityTransition invalid: ${review.qualityTransition}`);
    }
    if (review.qualityPolicy) {
      if (review.qualityPolicy.starterShortWindowMaxDays !== QUALITY_POLICY.starterShortWindowMaxDays) {
        fail('sourceReview.qualityPolicy.starterShortWindowMaxDays must be 7');
      }
      if (review.qualityPolicy.starterObservationWindowMaxDays !== QUALITY_POLICY.starterObservationWindowMaxDays) {
        fail('sourceReview.qualityPolicy.starterObservationWindowMaxDays must be 30');
      }
      if (!Array.isArray(review.qualityPolicy.qualityOrder)
        || review.qualityPolicy.qualityOrder.join('|') !== VALID_BASELINE_QUALITIES.join('|')) {
        fail('sourceReview.qualityPolicy.qualityOrder must preserve quality aging order');
      }
    }
    if (review.previousBaseline !== null && review.previousBaseline !== undefined) {
      if (typeof review.previousBaseline !== 'object' || Array.isArray(review.previousBaseline)) {
        fail('sourceReview.previousBaseline must be object|null');
      } else if (review.previousBaseline.baselineQuality !== null
        && !VALID_BASELINE_QUALITIES.includes(review.previousBaseline.baselineQuality)) {
        fail(`sourceReview.previousBaseline.baselineQuality invalid: ${review.previousBaseline.baselineQuality}`);
      }
    }
    if (!isNonNegativeNumber(review.sampleCount) || review.sampleCount < baseline.policy.minSamplesPerFacility) {
      fail('sourceReview.sampleCount must satisfy policy.minSamplesPerFacility');
    }
    if (!Number.isInteger(review.facilityCount) || review.facilityCount !== rows.length) {
      fail('sourceReview.facilityCount must match established baseline row count');
    }
    if (!Number.isInteger(review.facilitiesReadyForBaseline) || review.facilitiesReadyForBaseline !== rows.length) {
      fail('sourceReview.facilitiesReadyForBaseline must match established baseline row count');
    }
    if (!isNonNegativeNumber(review.sampleWindowDays)) fail('sourceReview.sampleWindowDays must be non-negative number');
    if (review.promotionStage === 'P60') {
      if (review.sampleHealthGateVersion !== 'oil-thermal-sample-health-gate-p60') {
        fail('P60 sourceReview.sampleHealthGateVersion must be oil-thermal-sample-health-gate-p60');
      }
      if (!Number.isInteger(review.totalSampleCount) || review.totalSampleCount < review.sampleCount) {
        fail('P60 sourceReview.totalSampleCount must be integer >= sampleCount');
      }
      if (
        !Number.isInteger(review.quarantinedSampleCount)
        || review.quarantinedSampleCount !== review.totalSampleCount - review.sampleCount
      ) {
        fail('P60 sourceReview.quarantinedSampleCount must equal totalSampleCount - sampleCount');
      }
      if (
        !Number.isInteger(review.diagnosticsConfirmedEligibleSampleCount)
        || review.diagnosticsConfirmedEligibleSampleCount < 1
        || review.diagnosticsConfirmedEligibleSampleCount > review.sampleCount
      ) {
        fail('P60 sourceReview.diagnosticsConfirmedEligibleSampleCount must be within 1..sampleCount');
      }
    }
    const expectedQuality = isNonNegativeNumber(review.sampleWindowDays)
      ? expectedBaselineQuality(review.sampleWindowDays)
      : null;
    if (expectedQuality && review.baselineQuality !== expectedQuality) {
      fail(`sampleWindowDays=${review.sampleWindowDays} must be labelled ${expectedQuality}`);
    }
    const caveatText = Array.isArray(review.caveats) ? review.caveats.join(' ') : '';
    if (!caveatText) {
      fail('sourceReview.caveats must document baseline limits');
    } else if (review.baselineQuality === 'starter_short_window' && !caveatText.includes('short')) {
      fail('sourceReview.caveats must mention short starter-window limitations');
    } else if (review.baselineQuality === 'starter_observation_window' && !/7-30|30 days|not a mature/u.test(caveatText)) {
      fail('sourceReview.caveats must mention 7-30 day observation-window limitations');
    } else if (review.baselineQuality === 'established_observation_window' && !/30\+|30 days|manual source review/u.test(caveatText)) {
      fail('sourceReview.caveats must mention 30+ day/manual-review limitations');
    }
  }
}

for (const [index, row] of rows.entries()) {
  const prefix = `facilities[${index}]`;
  if (typeof row.id !== 'string' || !row.id) fail(`${prefix}.id must be non-empty string`);
  if (rowIds.has(row.id)) fail(`duplicate baseline facility id: ${row.id}`);
  rowIds.add(row.id);
  const facility = facilityById.get(row.id);
  if (!facility) {
    fail(`${prefix}.id is not present in production facility whitelist: ${row.id}`);
    continue;
  }
  for (const field of ['label', 'region', 'assetType']) {
    if (row[field] !== facility[field]) fail(`${prefix}.${field} must match facility whitelist`);
  }
  if (!Number.isInteger(row.sampleCount) || row.sampleCount < baseline.policy.minSamplesPerFacility) {
    fail(`${prefix}.sampleCount must be integer >= policy.minSamplesPerFacility`);
  }
  if (!isNonNegativeNumber(row.windowDays)) fail(`${prefix}.windowDays must be non-negative number`);
  if (!isIso(row.firstSampleAt)) fail(`${prefix}.firstSampleAt must be ISO`);
  if (!isIso(row.lastSampleAt)) fail(`${prefix}.lastSampleAt must be ISO`);
  if (isIso(row.firstSampleAt) && isIso(row.lastSampleAt) && Date.parse(row.firstSampleAt) > Date.parse(row.lastSampleAt)) {
    fail(`${prefix}.firstSampleAt must be <= lastSampleAt`);
  }
  for (const field of ROW_METRIC_FIELDS) {
    if (!isNonNegativeNumber(row[field])) fail(`${prefix}.${field} must be non-negative number`);
  }
  if ('bbox' in row) fail(`${prefix}.bbox must not be copied into baseline config`);
  if ('sourceNote' in row) fail(`${prefix}.sourceNote must stay in facility whitelist, not baseline rows`);
}

checkNoSensitiveText(baseline);

if (errors.length > 0) {
  console.error('Oil thermal baseline config check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log(`Oil thermal baseline config check: PASS (${baseline.status}, rows=${rows.length}, facilities=${facilities.length})`);
