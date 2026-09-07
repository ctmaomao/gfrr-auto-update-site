import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeArrCandidate, reviewArrIndependentEvidence } from '../../scripts/bubble-watch/arr-independent-source-review.mjs';

const asOfDate = '2026-09-07';
const input = JSON.parse(readFileSync(new URL('../../config/bubble-watch-arr-evidence.json', import.meta.url), 'utf8'));
const base = input.records[0];
const normalize = (extra = {}, options = {}) => normalizeArrCandidate({ ...base, ...extra }, { asOfDate, ...options });
const review = (records) => reviewArrIndependentEvidence({ schemaVersion: input.schemaVersion, records }, { asOfDate });
const point = { ...base, valueQualifier: 'point', datePrecision: 'day', publishedDate: '2026-08-18', observationStart: '2026-07-31', observationEnd: '2026-07-31' };

test('reviewed official fact remains a 47B lower bound and dated interval, never 65B funding', () => {
  assert.equal(base.valueB, 47);
  const result = normalize();
  assert.deepEqual(result.ageDaysRange, { min: 102, max: 129 });
  assert.equal(result.valueQualifier, 'lower_bound');
  assert.equal(result.freshnessStatus, 'stale');
  assert.ok(result.holds.includes('observation_date_not_exact'));
  assert.ok(result.holds.includes('value_not_point_measurement'));
});

test('July month precision fails conservative freshness despite recent publication', () => {
  const result = normalize({ observationStart: '2026-07-01', observationEnd: '2026-07-31', datePrecision: 'month', publishedDate: '2026-09-07' });
  assert.deepEqual(result.ageDaysRange, { min: 38, max: 68 });
  assert.equal(result.freshnessStatus, 'stale');
});

test('45-day boundary is inclusive and publication cannot refresh an observation', () => {
  for (const [date, status] of [['2026-07-24', 'fresh'], ['2026-07-23', 'stale']]) {
    assert.equal(normalize({ ...point, observationStart: date, observationEnd: date }).freshnessStatus, status);
  }
  assert.equal(normalize({ ...point, publishedDate: '2026-09-07' }).ageDaysRange.max, 38);
});

test('missing, impossible, future, reversed and precision-incompatible dates are rejected', () => {
  for (const extra of [
    { publishedDate: '2026-02-30' }, { publishedDate: '2026-09-08' },
    { observationStart: '2026-02-29' }, { observationEnd: '2026-09-08' },
    { observationEnd: '2026-04-30' }, { publishedDate: '2026-05-27' },
    { observationStart: null }, { datePrecision: 'day' },
    { datePrecision: 'month' }, { datePrecision: 'unknown' },
    { observationStart: '2026-05-28', datePrecision: 'interval' }
  ]) assert.throws(() => normalize(extra), /arr_candidate_/u);
  assert.throws(() => normalize({}, { asOfDate: '2026-02-30' }), /invalid_date/u);
  assert.equal(normalize({ publishedDate: '2024-03-01', observationStart: '2024-02-01', observationEnd: '2024-02-29', datePrecision: 'month' }).datePrecision, 'month');
});

test('other issuer, product revenue, financing, valuation, bookings and spend cannot substitute', () => {
  assert.throws(() => normalize({ issuer: 'OpenAI' }), /incompatible_metric/u);
  for (const metric of ['claude_code_arr', 'funding_usd_b', 'valuation_usd_b', 'quarterly_revenue_usd_b', 'bookings', 'enterprise_spend']) {
    assert.throws(() => normalize({ metric }), /incompatible_metric/u);
  }
  for (const valueB of [null, '47', 0, -1, 81, NaN, Infinity]) assert.throws(() => normalize({ valueB }), /invalid_amount/u);
  assert.throws(() => normalize({ valueQualifier: 'forecast' }), /invalid_qualifier/u);
});

test('unreviewed/credential URLs, prototype source keys, unknown keys and approval flags fail closed', () => {
  for (const sourceUrl of ['http://www.anthropic.com/news/series-h', `${base.sourceUrl}?token=secret`, `${base.sourceUrl}#secret`, 'https://secret@www.anthropic.com/news/series-h', 'https://www.anthropic.com.evil.test/news/series-h', 'https://www.anthropic.com/news/unreviewed']) {
    assert.throws(() => normalize({ sourceUrl }), { message: 'arr_candidate_invalid_url' });
  }
  for (const sourceKey of ['__proto__', 'constructor', 'unknown']) assert.throws(() => normalize({ sourceKey }), /unknown_source/u);
  assert.throws(() => normalize({ liveFetchApproved: true }), /invalid_fields/u);
  assert.throws(() => normalize({ articleBody: 'secret raw text' }), /invalid_fields/u);
  assert.throws(() => normalize({ provenanceGroup: 'secret\ntext' }), /invalid_provenance/u);
  const missing = { ...base }; delete missing.metric;
  assert.throws(() => normalizeArrCandidate(missing, { asOfDate }), /invalid_fields/u);
});

test('all registered independent candidates remain source-rights held', () => {
  for (const [sourceKey, sourceUrl, rights] of [
    ['anthropic_official_news', base.sourceUrl, 'automatic_collection_rights_unresolved'],
    ['sacra_research', 'https://sacra.com/c/anthropic/', 'written_permission_required'],
    ['bloomberg_reporting', 'https://news.bloomberglaw.com/artificial-intelligence/anthropic-revenue-run-rate-surpasses-65-billion-ahead-of-ipo', 'discovery_only_rights_unresolved']
  ]) {
    const result = normalize({ ...point, sourceKey, sourceUrl });
    assert.equal(result.sourceComplianceStatus, rights);
    assert.ok(result.holds.includes('source_rights_pending'));
  }
});

test('four observations and supplied lineage labels never grant approval or independent corroboration', () => {
  const records = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-31'].map((date, i) => ({ ...point, id: `observation-${i}`, observationStart: date, observationEnd: date, valueB: 10 + i }));
  const result = review(records);
  assert.equal(result.productionEligible, false);
  assert.equal(result.independenceVerified, false);
  assert.deepEqual(result.claimedProvenanceGroups, ['anthropic_disclosure']);
  assert.ok(result.holds.includes('independent_runtime_review_required'));
  assert.ok(result.holds.includes('lineage_review_required'));
  assert.ok(!result.holds.includes('underlying_observation_stale'), 'historical observations do not stale the latest fresh point');
  assert.equal(result.latestObservationId, 'observation-3');
  for (const key of ['status', 'score', 'slopeRatio', 'value_display']) assert.ok(!Object.hasOwn(result, key));
});

test('overlapping 44/47 claims are retained for reconciliation, never averaged or spliced', () => {
  const result = review([base, { ...base, id: 'other-estimate', valueB: 44, valueQualifier: 'estimate' }]);
  assert.equal(result.overlappingClaims.length, 1);
  assert.equal(result.overlappingClaims[0].valuesDiffer, true);
  assert.ok(result.holds.includes('overlapping_claims_require_review'));
  assert.equal(result.records.length, 2);
  assert.equal(result.productionEligible, false);
});

test('schema, count and duplicate record validation are bounded and fail closed', () => {
  for (const bad of [null, {}, [], { ...input, schemaVersion: 'v2' }, { ...input, approved: true }, { ...input, records: [] }, { ...input, records: Array(65).fill(base) }]) {
    assert.throws(() => reviewArrIndependentEvidence(bad, { asOfDate }), /arr_candidate_/u);
  }
  assert.throws(() => review([base, base]), /duplicate_id/u);
});

test('CLI reads fixed input, generates non-eligible report and rejects unsafe options without echo', () => {
  const cli = fileURLToPath(new URL('../../scripts/review-bubble-watch-arr.mjs', import.meta.url));
  const good = spawnSync(process.execPath, [cli, '--as-of=2026-09-07'], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  const report = JSON.parse(good.stdout);
  assert.equal(report.productionEligible, false);
  assert.equal(report.networkRequests, 0);
  assert.equal(report.productionWrites, 0);
  for (const args of [['--write-production=secret'], ['--as-of=2026-02-30'], ['--as-of=2026-09-07', '--approve=secret']]) {
    const bad = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, '');
    assert.ok(!bad.stderr.includes('secret'));
    assert.match(bad.stderr, /^ARR candidate review failed:/u);
  }
});
