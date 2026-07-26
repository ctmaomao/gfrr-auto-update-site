#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  MAX_ACTIVE_ASSET_AGE_DAYS,
  MAX_AUXILIARY_LAG_DAYS,
  REVIEW_SCHEMA,
  reviewMarketPricingFreshness
} from './review-market-pricing-freshness.mjs';

const errors = [];
const NOW_MS = Date.parse('2026-07-26T12:00:00Z');

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readText(path) {
  return readFileSync(resolve(path), 'utf8');
}

function clone(value) {
  return structuredClone(value);
}

function review(history, metrics, nowMs = NOW_MS) {
  return reviewMarketPricingFreshness(history, metrics, {
    historyPath: 'docs/fixtures/market-pricing/history-synthetic.json',
    metricsPath: 'docs/fixtures/market-pricing/metrics-synthetic.json',
    nowMs
  });
}

function hasCode(report, code) {
  return report.review.findings.some((finding) => finding.code === code);
}

const history = JSON.parse(readText('data/market-pricing-history.json'));
const metrics = JSON.parse(readText('data/market-pricing-metrics.json'));
const current = review(history, metrics, Date.now());
assert(current.schemaVersion === REVIEW_SCHEMA, 'review schema version is not stable');
assert(current.review.status !== 'FAIL', 'current Market Pricing snapshot must not FAIL');
assert(current.thresholds.maxActiveAssetAgeDays === MAX_ACTIVE_ASSET_AGE_DAYS, 'active age threshold drifted');
assert(current.thresholds.maxAuxiliaryLagDays === MAX_AUXILIARY_LAG_DAYS, 'auxiliary lag threshold drifted');
for (const [key, value] of Object.entries(current.boundary)) {
  if (['auditOnly', 'displayOnly', 'readOnly'].includes(key)) {
    assert(value === true, `review boundary.${key} must be true`);
  } else {
    assert(value === false, `review boundary.${key} must be false`);
  }
}

const staleAuxHistory = clone(history);
for (const assetKey of ['ndx', 'ixic']) {
  const records = staleAuxHistory.assets[assetKey].records;
  records[records.length - 1].date = '2026-05-22';
  staleAuxHistory.assets[assetKey].coverage.latestDate = '2026-05-22';
}
const staleAuxMetrics = clone(metrics);
for (const assetKey of ['ndx', 'ixic']) {
  const records = staleAuxMetrics.assets[assetKey].records;
  records[records.length - 1].date = '2026-05-22';
  staleAuxMetrics.assets[assetKey].latestMetricDate = '2026-05-22';
}
const staleAuxReport = review(staleAuxHistory, staleAuxMetrics);
assert(staleAuxReport.review.status === 'WARN', 'stale but aligned auxiliaries must WARN');
assert(hasCode(staleAuxReport, 'ndx_history_stale'), 'NDX stale warning is missing');
assert(hasCode(staleAuxReport, 'ixic_history_stale'), 'IXIC stale warning is missing');
assert(hasCode(staleAuxReport, 'ndx_lags_primary'), 'NDX primary-lag warning is missing');
assert(hasCode(staleAuxReport, 'ixic_lags_primary'), 'IXIC primary-lag warning is missing');

const metricMismatch = clone(metrics);
metricMismatch.assets.ndx.latestMetricDate = '2026-07-17';
metricMismatch.assets.ndx.records.at(-1).date = '2026-07-17';
const mismatchReport = review(history, metricMismatch);
assert(mismatchReport.review.status === 'FAIL', 'history/metrics mismatch must FAIL');
assert(hasCode(mismatchReport, 'ndx_history_metrics_mismatch'), 'history/metrics mismatch code is missing');

const futureHistory = clone(history);
futureHistory.assets.qqq.records.at(-1).date = '2026-08-20';
futureHistory.assets.qqq.coverage.latestDate = '2026-08-20';
const futureMetrics = clone(metrics);
futureMetrics.assets.qqq.records.at(-1).date = '2026-08-20';
futureMetrics.assets.qqq.latestMetricDate = '2026-08-20';
const futureReport = review(futureHistory, futureMetrics);
assert(futureReport.review.status === 'FAIL', 'future market date must FAIL');
assert(hasCode(futureReport, 'qqq_date_in_future'), 'future-date code is missing');

const missingHistory = clone(history);
missingHistory.assets.ixic.records = [];
const missingReport = review(missingHistory, metrics);
assert(missingReport.review.status === 'FAIL', 'missing active history must FAIL');
assert(hasCode(missingReport, 'ixic_history_missing'), 'missing-history code is absent');

const reviewerText = readText('scripts/review-market-pricing-freshness.mjs');
for (const marker of [
  "export const REVIEW_SCHEMA = 'market-pricing-freshness-review-v1'",
  'MAX_ACTIVE_ASSET_AGE_DAYS = 10',
  'MAX_AUXILIARY_LAG_DAYS = 7',
  'networkAccessed: false',
  'productionWriteAttempted: false',
  'affectsScoring: false',
  'affectsDecisionModel: false',
  'affectsExecutionLock: false',
  'affectsPositionGuidance: false'
]) {
  assert(reviewerText.includes(marker), `reviewer missing boundary marker: ${marker}`);
}
for (const forbidden of ['fetch(', 'writeFile', 'node:https', 'node:http', 'process.env']) {
  assert(!reviewerText.includes(forbidden), `reviewer must remain offline/read-only; found ${forbidden}`);
}

const packageJson = JSON.parse(readText('package.json'));
assert(
  packageJson.scripts['review:market-pricing-freshness'] === 'node scripts/review-market-pricing-freshness.mjs',
  'package review command is missing'
);
assert(
  packageJson.scripts['check:market-pricing-freshness']
    === 'node --check scripts/review-market-pricing-freshness.mjs && node --check scripts/check-market-pricing-freshness.mjs && node scripts/check-market-pricing-freshness.mjs',
  'package check command is missing'
);
assert(
  readText('scripts/check-suite.mjs').includes("'check:market-pricing-freshness'"),
  'market-pricing suite must include freshness review'
);
assert(
  !readText('.github/workflows/refresh-qqq-market-pricing.yml').includes('market-pricing:ndx-ixic-yahoo:commit'),
  'M-91 NDX/IXIC refresh must remain outside GitHub Actions'
);

for (const [path, markers] of Object.entries({
  'docs/DATA_CONTRACT.md': ['market-pricing-freshness-review-v1', '10 calendar days', '7 calendar days'],
  'docs/DATA_SOURCES.md': ['review:market-pricing-freshness', 'manual-only'],
  'docs/OPERATIONS.md': ['Market Pricing freshness/alignment review', '--strict'],
  'docs/PROJECT_BACKLOG.md': ['Market Pricing freshness/alignment review', 'display-only']
})) {
  const text = readText(path);
  for (const marker of markers) assert(text.includes(marker), `${path} missing marker: ${marker}`);
}

if (errors.length > 0) {
  console.error('Market pricing freshness check FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Market pricing freshness check: PASS ` +
  `(${current.review.assets.map((asset) => `${asset.asset}:${asset.historyLatestDate}`).join('/')})`
);
