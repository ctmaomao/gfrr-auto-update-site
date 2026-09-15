import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { reviewAcledMonthlyCandidate, ACLED_CANDIDATE_LIMITS } from '../../scripts/world-order/acled-monthly-candidate.mjs';

// Entirely synthetic; these are not ACLED observations or production inputs.
const NOW = '2026-09-16T00:00:00Z';
const ID = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const row = { location_code: 'AAA', location_name: 'Synthetic place', admin1_code: null, admin1_name: null,
    admin2_code: null, admin2_name: null, admin_level: 0, resource_hdx_id: ID,
    event_type: 'political_violence', events: 17, fatalities: 5,
    reference_period_start: '2026-07-01T00:00:00', reference_period_end: '2026-07-31T23:59:59' };
  const resource = { resource_hdx_id: ID, dataset_hdx_stub: 'political-violence-events-and-fatalities',
    dataset_hdx_provider_stub: 'acled', format: 'xlsx', name: 'political-violence-events-and-fatalities_as-of-2026-08-28.xlsx',
    update_date: '2026-09-03T10:29:54', hapi_updated_date: '2026-09-07T01:33:17.350664' };
  const item = { sampleJson: JSON.stringify({ data: [row] }), metadataJson: JSON.stringify({ data: [resource] }),
    pin: { schemaVersion: 'acled-hapi-pv-pin-v1', resourceId: ID, resourceName: resource.name,
      resourceUpdatedAt: resource.update_date, hapiUpdatedAt: resource.hapi_updated_date, asOfDate: '2026-08-28',
      fetchedAt: '2026-09-15T20:56:34Z', countries: ['AAA'], months: ['2026-07'], requestLimit: 100 } };
  return rehash(item);
}
function rehash(item) { item.pin.sampleSha256 = hash(item.sampleJson); item.pin.metadataSha256 = hash(item.metadataJson); return item; }
function editRows(item, fn) { const data = JSON.parse(item.sampleJson); fn(data.data); item.sampleJson = JSON.stringify(data); return rehash(item); }
function editMeta(item, fn) { const data = JSON.parse(item.metadataJson); fn(data.data[0]); item.metadataJson = JSON.stringify(data); return rehash(item); }
const run = (current = fixture(), baseline = null) => reviewAcledMonthlyCandidate({ current, baseline }, { now: NOW });
function invalid(item, reason) { const result = run(item); assert.equal(result.status, 'invalid'); if (reason) assert.equal(result.reason, reason); }

test('valid saved PV sample is review-only; no values, row keys or hashes are exported', () => {
  const input = fixture(), before = structuredClone(input), result = run(input);
  assert.equal(result.status, 'review_only'); assert.equal(result.current.status, 'declared_scope_complete');
  assert.equal(result.comparison.status, 'baseline_required'); assert.deepEqual(input, before);
  assert.equal(result.boundaries.productionWriteApproved, false); assert.equal(result.boundaries.sourceCutoverApproved, false);
  assert.equal(result.boundaries.sixMetricEquivalence, 'not_assessed');
  const output = JSON.stringify(result);
  for (const secret of ['Synthetic place', 'AAA', ID, input.pin.sampleSha256, '"events":', '"fatalities":']) assert.ok(!output.includes(secret));
});

test('pins verify both saved byte strings; metadata links use v2 fields, not v1 hdX_id', () => {
  const one = fixture(); one.sampleJson += ' '; invalid(one, 'hash_mismatch');
  const two = fixture(); two.metadataJson += ' '; invalid(two, 'hash_mismatch');
  invalid(editMeta(fixture(), r => { r.hdx_id = r.resource_hdx_id; delete r.resource_hdx_id; }), 'metadata_mismatch');
  for (const field of ['resource_hdx_id', 'name', 'dataset_hdx_stub', 'dataset_hdx_provider_stub', 'format']) {
    invalid(editMeta(fixture(), r => { r[field] = 'untrusted'; }), 'metadata_mismatch');
  }
});

test('dates reject impossible calendars, offsets, future and reversed provenance; preserve microseconds', () => {
  for (const value of ['2026-02-30T01:00:00', '2026-09-03T24:00:00', '2026-09-03T10:00:00+01:00', 'bad']) {
    const item = fixture(); item.pin.resourceUpdatedAt = value; invalid(item, 'date_invalid');
  }
  for (const [field, value] of [['fetchedAt', '2026-09-17T00:00:00Z'], ['hapiUpdatedAt', '2026-09-01T00:00:00Z'], ['resourceUpdatedAt', '2026-08-01T00:00:00Z']]) {
    const item = fixture(); item.pin[field] = value; invalid(item, 'date_order');
  }
  const precise = fixture(); precise.pin.hapiUpdatedAt = '2026-09-07T01:33:17.350665'; invalid(precise, 'metadata_mismatch');
});

test('scope is a bounded explicit Cartesian product; extra geography and categories fail closed', () => {
  for (const countries of [[], ['AAA', 'AAA'], ['lower'], Array.from({ length: 11 }, (_, i) => `A${i}A`)]) {
    const item = fixture(); item.pin.countries = countries; invalid(item, 'scope_invalid');
  }
  for (const months of [[], ['2026-07', '2026-07'], ['2026-13'], ['2026-09']]) {
    const item = fixture(); item.pin.months = months; invalid(item);
  }
  const missing = fixture(); missing.pin.countries.push('BBB');
  assert.equal(run(missing).current.missingRows, 1); assert.equal(run(missing).current.status, 'hold');
  for (const [field, value] of [['admin_level', 1], ['admin2_code', 'AREA'], ['location_code', 'BBB'], ['event_type', 'civilian_targeting'], ['resource_hdx_id', 'other']]) {
    invalid(editRows(fixture(), rows => { rows[0][field] = value; }), 'row_scope');
  }
});

test('real zero survives; missing and null events never become zero or pass completeness', () => {
  const zero = editRows(fixture(), rows => { rows[0].events = 0; });
  assert.equal(run(zero).current.status, 'declared_scope_complete');
  const missing = editRows(fixture(), rows => { rows.length = 0; });
  assert.equal(run(missing).current.missingRows, 1); assert.equal(run(missing).current.status, 'hold');
  const nullCount = editRows(fixture(), rows => { rows[0].events = null; });
  assert.equal(run(nullCount).current.nullEventRows, 1); assert.equal(run(nullCount).current.status, 'hold');
  for (const count of [-1, 1.2, '0', false, Number.MAX_SAFE_INTEGER + 1]) invalid(editRows(fixture(), rows => { rows[0].events = count; }), 'count_invalid');
});

test('partial source month and pagination ceiling hold even when all declared keys are present', () => {
  const partial = fixture(); partial.pin.months = ['2026-08'];
  editRows(partial, rows => { rows[0].reference_period_start = '2026-08-01T00:00:00'; rows[0].reference_period_end = '2026-08-31T23:59:59'; });
  assert.equal(run(partial).current.partialMonthCount, 1); assert.equal(run(partial).current.status, 'hold');
  const capped = fixture(); capped.pin.requestLimit = 1;
  assert.equal(run(capped).current.limitHit, true); assert.equal(run(capped).current.status, 'hold');
  for (const value of ['2026-07-30T23:59:59', '2026-07-31T12:00:00', null]) invalid(editRows(fixture(), rows => { rows[0].reference_period_end = value; }));
});

test('duplicate identity checks every validated field and enforces raw limits before deduplication', () => {
  const sameRows = editRows(fixture(), rows => rows.push(structuredClone(rows[0])));
  assert.equal(run(sameRows).current.uniqueRows, 1); assert.equal(run(sameRows).current.duplicateRows, 1);
  for (const field of ['events', 'fatalities', 'location_name', 'admin1_name']) {
    const item = editRows(fixture(), rows => { const next = structuredClone(rows[0]); next[field] = typeof next[field] === 'number' ? next[field] + 1 : 'changed'; rows.push(next); });
    invalid(item, 'duplicate_conflict');
  }
  const atLimit = editRows(fixture(), rows => { while (rows.length < 100) rows.push(structuredClone(rows[0])); });
  assert.equal(run(atLimit).current.status, 'hold');
  invalid(editRows(atLimit, rows => rows.push(structuredClone(rows[0]))), 'row_limit');
});

test('same revision changes conflict; different declared revisions are reviewable differences, not parser bugs', () => {
  const previous = fixture(), current = fixture();
  assert.equal(run(current, previous).comparison.status, 'unchanged_saved_payload');
  editRows(current, rows => { rows[0].events += 1; });
  assert.equal(run(current, previous).comparison.status, 'revision_conflict');
  assert.equal(run(current, previous).comparison.eventChangedRows, 1);
  current.pin.asOfDate = '2026-09-04'; current.pin.resourceName = 'political-violence-events-and-fatalities_as-of-2026-09-04.xlsx';
  current.pin.resourceUpdatedAt = '2026-09-10T10:25:01'; current.pin.hapiUpdatedAt = '2026-09-11T01:00:00';
  editMeta(current, r => { r.name = current.pin.resourceName; r.update_date = current.pin.resourceUpdatedAt; r.hapi_updated_date = current.pin.hapiUpdatedAt; });
  assert.equal(run(current, previous).comparison.status, 'revision_difference');
});

test('fetch time, HAPI sync time, formatting and row order are not source revisions', () => {
  const previous = fixture(); previous.pin.countries.push('BBB');
  editRows(previous, rows => { const other = structuredClone(rows[0]); other.location_code = 'BBB'; rows.push(other); });
  const current = structuredClone(previous); current.pin.fetchedAt = '2026-09-15T21:00:00Z';
  current.pin.hapiUpdatedAt = '2026-09-08T01:00:00';
  editMeta(current, r => { r.hapi_updated_date = current.pin.hapiUpdatedAt; });
  const object = JSON.parse(current.sampleJson); object.data.reverse(); current.sampleJson = JSON.stringify(object, null, 2); rehash(current);
  assert.equal(run(current, previous).comparison.status, 'serialization_or_metadata_change');
  assert.equal(run(current, previous).comparison.eventChangedRows, 0);
});

test('incomplete, malformed, wrong-scope and reverse-chronology baselines cannot qualify comparison', () => {
  const incomplete = editRows(fixture(), rows => { rows.length = 0; });
  assert.equal(run(fixture(), incomplete).comparison.status, 'incomplete_not_comparable');
  const scope = fixture(); scope.pin.months.push('2026-06');
  assert.equal(run(fixture(), scope).comparison.status, 'scope_mismatch');
  const later = fixture(); later.pin.fetchedAt = '2026-09-15T22:00:00Z';
  assert.equal(run(fixture(), later).comparison.status, 'chronology_reversed');
  const corrupt = fixture(); corrupt.pin.productionWriteApproved = true;
  assert.equal(run(fixture(), corrupt).status, 'invalid');
});

test('body budgets, malformed JSON, extra row fields and forged approval fields are rejected safely', () => {
  const item = fixture(); item.sampleJson = 'PRIVATE_INVALID'; rehash(item); invalid(item, 'json_invalid');
  const large = fixture(); large.sampleJson = ' '.repeat(ACLED_CANDIDATE_LIMITS.bytes); invalid(large, 'body_size');
  invalid(editRows(fixture(), rows => { rows[0].error = 'PRIVATE'; }), 'row_schema');
  const output = reviewAcledMonthlyCandidate({ current: fixture(), baseline: null, sourceCutoverApproved: true });
  assert.equal(output.status, 'invalid'); assert.equal(output.boundaries.sourceCutoverApproved, false);
});

test('CLI is bounded stdin-only; successful and invalid outputs never echo private data', () => {
  const input = JSON.stringify({ current: fixture(), baseline: null });
  const result = spawnSync(process.execPath, ['scripts/review-acled-monthly-candidate.mjs'], { input, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).status, 'review_only'); assert.equal(result.stderr, '');
  for (const args of [[], ['--write'], ['--input', 'https://private.invalid/SECRET']]) {
    const bad = spawnSync(process.execPath, ['scripts/review-acled-monthly-candidate.mjs', ...args], { input: 'SECRET{{', encoding: 'utf8' });
    assert.equal(bad.status, 1); assert.ok(!bad.stdout.includes('SECRET')); assert.equal(bad.stderr, '');
  }
  const large = spawnSync(process.execPath, ['scripts/review-acled-monthly-candidate.mjs'], { input: ' '.repeat(ACLED_CANDIDATE_LIMITS.inputBytes + 1), encoding: 'utf8' });
  assert.equal(large.status, 1); assert.equal(JSON.parse(large.stdout).reason, 'stdin_size');
  const source = readFileSync('scripts/review-acled-monthly-candidate.mjs', 'utf8');
  assert.doesNotMatch(source, /fetch\(|writeFile|readFile|node:https|node:http|child_process/u);
  assert.ok(JSON.parse(readFileSync('package.json', 'utf8')).scripts['check:acled-monthly-candidate']);
});

test('stalled stdin terminates with a sanitized timeout, not an unbounded wait', async () => {
  const child = spawn(process.execPath, ['scripts/review-acled-monthly-candidate.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const guard = setTimeout(() => child.kill(), 10000);
  try {
    const exit = await new Promise(resolve => child.on('close', resolve));
    assert.equal(exit, 1); assert.equal(JSON.parse(stdout).reason, 'stdin_timeout'); assert.equal(stderr, '');
  } finally { clearTimeout(guard); child.stdin.destroy(); }
});
