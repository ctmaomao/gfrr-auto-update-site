#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  REVIEW_SCHEMA,
  reviewFomcMinutesToneQuality
} from './review-fomc-minutes-tone-quality.mjs';

const errors = [];
const NOW_MS = Date.parse('2026-07-26T00:00:00Z');

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readText(path) {
  return readFileSync(resolve(path), 'utf8');
}

function clone(value) {
  return structuredClone(value);
}

function review(data) {
  return reviewFomcMinutesToneQuality(data, {
    inputPath: 'docs/fixtures/fomc-minutes/synthetic.json',
    nowMs: NOW_MS
  });
}

function hasCode(report, code) {
  return report.review.findings.some((finding) => finding.code === code);
}

const radarData = JSON.parse(readText('data/radar-data.json'));
const current = review(radarData);
assert(current.schemaVersion === REVIEW_SCHEMA, 'review schema version is not stable');
assert(current.review.status !== 'FAIL', 'current production FOMC minutes review must not FAIL');
assert(current.boundary.auditOnly === true, 'review boundary.auditOnly must be true');
assert(current.boundary.displayOnly === true, 'review boundary.displayOnly must be true');
for (const [key, value] of Object.entries(current.boundary)) {
  if (!['auditOnly', 'displayOnly'].includes(key)) {
    assert(value === false, `review boundary.${key} must be false`);
  }
}

const policy = radarData.macroDrivers.policyExpectations;

const toneMismatch = clone(radarData);
toneMismatch.macroDrivers.policyExpectations.minutesPolicyTone = '偏鸽';
const toneMismatchReport = review(toneMismatch);
assert(toneMismatchReport.review.status === 'FAIL', 'tone/count mismatch must FAIL');
assert(hasCode(toneMismatchReport, 'tone_count_mismatch'), 'tone/count mismatch code is missing');

const summaryMismatch = clone(radarData);
summaryMismatch.macroDrivers.policyExpectations.minutesSummaryZh = 'FOMC minutes keyword NLP 显示语气平衡。';
assert(hasCode(review(summaryMismatch), 'summary_not_reproducible'), 'summary mismatch must be detected');

const unsafeWording = clone(radarData);
unsafeWording.macroDrivers.policyExpectations.minutesSummaryZh =
  `${policy.minutesSummaryZh} 建议加仓并执行交易。`;
assert(hasCode(review(unsafeWording), 'summary_decision_language'), 'decision wording must be rejected');

const unofficialUrl = clone(radarData);
unofficialUrl.macroDrivers.policyExpectations.minutesUrl =
  'https://example.com/monetarypolicy/fomcminutes20260617.htm';
assert(hasCode(review(unofficialUrl), 'minutes_url_not_official'), 'unofficial minutes URL must FAIL');

const invalidCounts = clone(radarData);
invalidCounts.macroDrivers.policyExpectations.minutesHawkishTermCount = -1;
assert(hasCode(review(invalidCounts), 'tone_count_invalid'), 'negative tone count must FAIL');

const cleanMissing = clone(radarData);
const missingPolicy = cleanMissing.macroDrivers.policyExpectations;
missingPolicy.sourceStatus.fomcMinutes = 'missing';
missingPolicy.minutesDate = null;
missingPolicy.minutesUrl = null;
missingPolicy.minutesHawkishTermCount = null;
missingPolicy.minutesDovishTermCount = null;
missingPolicy.minutesPolicyTone = '未知';
missingPolicy.minutesTopicCounts = null;
missingPolicy.minutesSummaryZh = null;
const missingReport = review(cleanMissing);
assert(missingReport.review.status === 'WATCH', 'clean missing source must WATCH instead of FAIL');
assert(hasCode(missingReport, 'minutes_source_missing'), 'missing source watch code is absent');

const inconsistentMissing = clone(cleanMissing);
inconsistentMissing.macroDrivers.policyExpectations.minutesSummaryZh = '偏鹰';
assert(review(inconsistentMissing).review.status === 'FAIL', 'missing source with payload must FAIL');

const fallback = clone(radarData);
fallback.macroDrivers.policyExpectations.sourceStatus.fomcMinutes = 'fallback';
const fallbackReport = review(fallback);
assert(fallbackReport.review.status === 'WATCH', 'fallback source must WATCH');
assert(hasCode(fallbackReport, 'minutes_source_fallback'), 'fallback source watch code is absent');

const manualRequired = clone(cleanMissing);
manualRequired.macroDrivers.policyExpectations.sourceStatus.fomcMinutes = 'manual_required';
const manualRequiredReport = review(manualRequired);
assert(manualRequiredReport.review.status === 'WATCH', 'manual_required source must WATCH');
assert(hasCode(manualRequiredReport, 'minutes_source_manual_required'), 'manual_required watch code is absent');

const stale = clone(radarData);
stale.macroDrivers.policyExpectations.minutesDate = '2026-01-01T00:00:00.000Z';
stale.macroDrivers.policyExpectations.minutesUrl =
  'https://www.federalreserve.gov/monetarypolicy/fomcminutes20260101.htm';
const staleReport = review(stale);
assert(staleReport.review.status === 'WATCH', 'stale valid source must WATCH');
assert(hasCode(staleReport, 'minutes_stale'), 'stale source watch code is absent');

const reviewerText = readText('scripts/review-fomc-minutes-tone-quality.mjs');
for (const marker of [
  "export const REVIEW_SCHEMA = 'fomc-minutes-tone-quality-review-v1'",
  'hawkishCount >= dovishCount + 8',
  'dovishCount >= hawkishCount + 8',
  'assertManualArtifactWritePath(options.output)',
  'networkAccessed: false',
  'productionWriteAttempted: false',
  'affectsScoring: false',
  'affectsDecisionModel: false',
  'affectsExecutionLock: false',
  'affectsPositionGuidance: false'
]) {
  assert(reviewerText.includes(marker), `reviewer missing boundary marker: ${marker}`);
}
for (const forbidden of ['fetch(', 'node:https', 'node:http', 'process.env']) {
  assert(!reviewerText.includes(forbidden), `reviewer must remain offline; found ${forbidden}`);
}

const packageJson = JSON.parse(readText('package.json'));
assert(
  packageJson.scripts['review:fomc-minutes-tone-quality']
    === 'node scripts/review-fomc-minutes-tone-quality.mjs',
  'package review command is missing'
);
assert(
  packageJson.scripts['check:macro-drivers-fomc-minutes-tone-quality']
    ?.includes('scripts/check-fomc-minutes-tone-quality.mjs'),
  'package check command is missing'
);
assert(
  readText('scripts/check-suite.mjs').includes("'check:macro-drivers-fomc-minutes-tone-quality'"),
  'macro-drivers suite must include the FOMC quality check'
);

for (const [path, markers] of Object.entries({
  'docs/DATA_CONTRACT.md': ['fomc-minutes-tone-quality-review-v1', '70', '120'],
  'docs/DATA_SOURCES.md': ['review:fomc-minutes-tone-quality', 'keyword NLP'],
  'docs/OPERATIONS.md': ['FOMC minutes tone quality', '--strict'],
  'docs/PROJECT_BACKLOG.md': ['FOMC Minutes tone/topic quality review', 'display-only']
})) {
  const text = readText(path);
  for (const marker of markers) assert(text.includes(marker), `${path} missing marker: ${marker}`);
}

if (errors.length > 0) {
  console.error('FOMC minutes tone quality check FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `FOMC minutes tone quality check: PASS ` +
  `(current=${current.review.status}, source=${current.review.sourceStatus}, ` +
  `freshness=${current.review.freshness.status}, tone=${current.review.observedTone})`
);
