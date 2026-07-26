#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  REVIEW_SCHEMA,
  SOURCE_KEYS,
  expectedFreshnessFromSources,
  expectedSourceMode,
  reviewWorldOrderStress
} from './review-world-order-stress.mjs';

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readText(path) {
  return readFileSync(resolve(path), 'utf8');
}

function clone(value) {
  return structuredClone(value);
}

function review(payload) {
  return reviewWorldOrderStress(payload, {
    inputPath: 'docs/fixtures/world-order/synthetic.json'
  });
}

function hasCode(report, code) {
  return report.review.findings.some((finding) => finding.code === code);
}

const currentPayload = JSON.parse(readText('data/world-order-stress.json'));
const current = review(currentPayload);
assert(current.schemaVersion === REVIEW_SCHEMA, 'review schema version is not stable');
assert(
  ['PASS', 'WATCH'].includes(current.review.status),
  'current production World Order review must stay non-failing for coherent degraded states'
);
assert(current.review.expectedFreshness === currentPayload.freshness, 'current freshness must match source statuses');
assert(current.review.expectedSourceMode === currentPayload.sourceMode, 'current sourceMode must match freshness');
for (const [key, value] of Object.entries(current.boundary)) {
  if (['auditOnly', 'readOnly'].includes(key)) assert(value === true, `review boundary.${key} must be true`);
  else assert(value === false, `review boundary.${key} must be false`);
}
assert(
  current.review.findings.every((finding) => finding.severity !== 'fail'),
  'current production World Order review must not carry fail findings when contract is coherent'
);

const degraded = clone(currentPayload);
degraded.externalSources.gdelt.status = 'stale';
degraded.freshness = expectedFreshnessFromSources(degraded.externalSources);
degraded.sourceMode = expectedSourceMode(degraded.freshness);
degraded.confidence = 0.95;
const degradedReport = review(degraded);
assert(degradedReport.review.status === 'WARN', 'degraded but coherent source state must WARN');
assert(hasCode(degradedReport, 'gdelt_source_stale'), 'degraded GDELT source watch code is missing');
assert(hasCode(degradedReport, 'degraded_sources_high_confidence'), 'degraded high-confidence watch is missing');

const freshnessMismatch = clone(degraded);
freshnessMismatch.freshness = 'fresh';
const freshnessMismatchReport = review(freshnessMismatch);
assert(freshnessMismatchReport.review.status === 'FAIL', 'freshness/source mismatch must FAIL');
assert(hasCode(freshnessMismatchReport, 'freshness_source_status_mismatch'), 'freshness mismatch code is missing');

const sourceModeMismatch = clone(currentPayload);
sourceModeMismatch.sourceMode = 'computed_with_source_errors';
assert(hasCode(review(sourceModeMismatch), 'source_mode_freshness_mismatch'), 'sourceMode mismatch must be detected');

const ofacFailure = clone(currentPayload);
ofacFailure.externalSources.ofac.status = 'error';
ofacFailure.freshness = expectedFreshnessFromSources(ofacFailure.externalSources);
ofacFailure.sourceMode = expectedSourceMode(ofacFailure.freshness);
assert(hasCode(review(ofacFailure), 'ofac_source_error'), 'OFAC degradation must be reviewed');

const acledManual = clone(currentPayload);
acledManual.externalSources.acled.status = 'manual_required';
acledManual.externalSources.acled.lastFetchedAt = null;
acledManual.freshness = expectedFreshnessFromSources(acledManual.externalSources);
acledManual.sourceMode = expectedSourceMode(acledManual.freshness);
const acledManualReport = review(acledManual);
const acledFinding = acledManualReport.review.findings.find((finding) => finding.code === 'acled_source_manual_required');
assert(acledFinding, 'ACLED manual-required state must be reviewed');
assert(
  acledFinding?.action === 'download_acled_weekly_monthly_xlsx_then_run_sanitizers',
  'ACLED action must use manual xlsx sanitizers instead of credentials'
);

const invalidTimestamp = clone(currentPayload);
invalidTimestamp.externalSources.sipri.lastFetchedAt = 'not-a-date';
assert(hasCode(review(invalidTimestamp), 'source_timestamp_invalid'), 'invalid source timestamp must FAIL');

const unsafeNarrative = clone(currentPayload);
unsafeNarrative.systemInterpretationZh = '战争已确认，建议加仓。';
const unsafeReport = review(unsafeNarrative);
assert(unsafeReport.review.status === 'FAIL', 'unsafe narrative must FAIL');
assert(hasCode(unsafeReport, 'unsafe_prediction_or_action_language'), 'unsafe narrative code is missing');

const unsafeModifier = clone(currentPayload);
unsafeModifier.decisionModifier.maxStateBoost = 2;
unsafeModifier.decisionModifier.appliesWhen = '立即进入 decisionModel。';
const modifierReport = review(unsafeModifier);
assert(hasCode(modifierReport, 'decision_modifier_boost_invalid'), 'modifier boost cap must be enforced');
assert(
  hasCode(modifierReport, 'decision_modifier_reference_boundary_missing'),
  'future-reference-only modifier wording must be enforced'
);

const reviewerText = readText('scripts/review-world-order-stress.mjs');
for (const marker of [
  "export const REVIEW_SCHEMA = 'world-order-source-health-consistency-review-v1'",
  'download_acled_weekly_monthly_xlsx_then_run_sanitizers',
  'networkAccessed: false',
  'productionWriteAttempted: false',
  'affectsScoring: false',
  'affectsDecisionModel: false',
  'affectsExecutionLock: false',
  'affectsPositionGuidance: false'
]) {
  assert(reviewerText.includes(marker), `reviewer missing boundary marker: ${marker}`);
}
for (const forbidden of ['fetch(', 'writeFile', 'node:https', 'node:http', 'process.env', 'ACLED_API_KEY', 'ACLED_EMAIL']) {
  assert(!reviewerText.includes(forbidden), `reviewer must remain offline/read-only; found ${forbidden}`);
}

const packageJson = JSON.parse(readText('package.json'));
assert(
  packageJson.scripts['review:world-order'] === 'node scripts/review-world-order-stress.mjs data/world-order-stress.json',
  'package review command must remain compatible'
);
assert(
  packageJson.scripts['check:world-order'] === 'node scripts/check-world-order-stress.mjs',
  'World Order check command must remain compatible'
);
assert(
  readText('scripts/check-world-order-stress.mjs').includes("import('./check-world-order-stress-review.mjs')"),
  'World Order checker must load the source-health consistency replay'
);

for (const [path, markers] of Object.entries({
  'docs/DATA_CONTRACT.md': ['world-order-source-health-consistency-review-v1', 'freshness', 'sourceMode'],
  'docs/DATA_SOURCES.md': ['review:world-order', 'ACLED weekly/monthly xlsx'],
  'docs/OPERATIONS.md': ['World Order source-health consistency', '--strict'],
  'docs/PROJECT_BACKLOG.md': ['World Order source-health consistency review', 'overlay-only']
})) {
  const text = readText(path);
  for (const marker of markers) assert(text.includes(marker), `${path} missing marker: ${marker}`);
}

if (errors.length > 0) {
  console.error('World Order source-health consistency check FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `World Order source-health consistency check: PASS ` +
  `(current=${current.review.status}, freshness=${current.review.observedFreshness}, ` +
  `sources=${SOURCE_KEYS.map((key) => `${key}:${current.review.sourceStatuses[key]}`).join('/')})`
);
