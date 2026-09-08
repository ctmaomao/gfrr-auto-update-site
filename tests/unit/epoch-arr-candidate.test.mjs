import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { EPOCH_ARR_HEADERS as headers, EPOCH_ARR_LIMITS as limits, sanitizeEpochArrCsv } from '../../scripts/bubble-watch/epoch-arr-candidate.mjs';

// Authored synthetic fixtures, not a retained or replayed Epoch download.
const sample = {
  Id: 'synthetic observation', Company: 'Anthropic', Date: '2026-07-31',
  'Annualized revenue (USD)': '65000000000.0', 'Annualized revenue type': 'Annualized run rate',
  Scope: 'Full company', 'Revenue amount (normalize to annual)': '65000000000.0',
  Confidence: 'Likely', 'Source 1': 'https://example.org/report?synthetic=1 ',
  'Report date': '2026-08-17', 'Source type': 'Company disclosure,Media report'
};
const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const line = values => values.map(quote).join(',');
const csv = (rows = [{}]) => `${line(headers)}\r\n${rows.map(row => line(headers.map(key => ({ ...sample, ...row })[key]))).join('\r\n')}\r\n`;
const review = (input = csv(), asOfDate = '2026-09-08') => sanitizeEpochArrCsv(input, { asOfDate });
const first = row => review(csv([row])).candidates[0];
const hasHold = (candidate, hold) => assert.ok(candidate.holds.includes(hold), hold);

test('closed schema yields bounded attributed offline candidates, never production eligibility', () => {
  const input = csv(), report = review(input), candidate = report.candidates[0];
  assert.equal(report.input.sha256, createHash('sha256').update(input).digest('hex'));
  assert.equal(report.input.bytes, Buffer.byteLength(input));
  assert.equal(report.input.rows, 1);
  assert.equal(report.assignedLayer, 'artifact_sanitizer_layer');
  assert.deepEqual(report.boundaries, { networkCalls: 0, productionWrites: 0, productionEligible: false, crossSnapshotRevisionReview: 'not_performed' });
  assert.equal(report.source.license, 'CC BY 4.0');
  assert.equal(candidate.amounts.annualizedUsd, 65e9);
  assert.equal(candidate.metric, 'annualized_run_rate');
  assert.deepEqual(candidate.sourceRoles, ['company_disclosure', 'media_report']);
  assert.equal(candidate.productionEligible, false);
  assert.equal(candidate.sourceIndependence, 'unverified');
  assert.equal(candidate.dateAgeDiagnostic.ageDays, 39);
  assert.deepEqual(candidate.observation, { reportedDate: '2026-07-31', start: null, end: null, precision: 'unknown' });
  for (const hold of ['observation_precision_unverified', 'amount_qualifier_unverified', 'scenario_unverified', 'source_evidence_unverified', 'production_review_required']) hasHold(candidate, hold);
});

test('CSV BOM, CRLF, quoted commas, escaped quotes and multiline cells are accepted without text leakage', () => {
  const marker = 'PRIVATE_MARKER, "quoted"\r\nnext line';
  const report = review(Buffer.from(`\uFEFF${csv([{ Notes: marker, 'Graph note': marker, 'Other revenue info': marker }])}`));
  assert.equal(report.candidates.length, 1);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_MARKER'));
  assert.equal(review(csv().replaceAll('\r\n', '\n').trimEnd()).candidates.length, 1);
});

test('all documented and unknown scope/metric combinations stay separated', () => {
  const product = first({ Scope: 'Product/division', 'Annualized revenue (USD)': '', 'Revenue amount (normalize to annual)': '1000000000' });
  assert.equal(product.amounts.annualizedUsd, null);
  assert.equal(product.amounts.normalizedAnnualUsd, 1e9);
  hasHold(product, 'not_full_company');
  const arr = first({ 'Annualized revenue type': 'Annual recurring revenue (ARR)' });
  assert.equal(arr.metric, 'annual_recurring_revenue');
  hasHold(arr, 'not_company_run_rate');
  for (const period of ['Year', 'Quarter']) {
    const row = first({ 'Period type': period, 'Period revenue': '250000000', 'Annualized revenue type': '', 'Annualized revenue (USD)': '' });
    assert.equal(row.amounts.annualizedUsd, null);
    assert.equal(row.amounts.periodRevenueUsd, 250e6);
    assert.equal(row.periodType, period.toLowerCase());
    hasHold(row, 'period_revenue_not_run_rate');
  }
  const unknown = first({ Scope: 'new scope', Confidence: 'new confidence', 'Annualized revenue type': 'Bookings', 'Source type': 'Company disclosure,unknown', 'Period type': 'Month' });
  for (const hold of ['scope_unknown', 'confidence_unknown', 'annualized_metric_unknown', 'source_role_unknown', 'period_type_unknown']) hasHold(unknown, hold);
  assert.equal(unknown.scope, 'unknown');
  assert.deepEqual(unknown.sourceRoles, ['company_disclosure', 'unknown']);
});

test('empty amounts are null while zero, small values and out-of-runtime-range values do not alter runtime bounds', () => {
  const missing = first({ 'Annualized revenue (USD)': '', 'Revenue amount (normalize to annual)': '', 'Period revenue': '' });
  assert.equal(missing.amounts.annualizedUsd, null);
  assert.equal(missing.amounts.normalizedAnnualUsd, null);
  assert.equal(missing.amounts.periodRevenueUsd, null);
  const zero = first({ 'Annualized revenue (USD)': '0' });
  assert.equal(zero.amounts.annualizedUsd, 0);
  hasHold(zero, 'zero_amount');
  for (const value of ['87000000', '81000000000']) hasHold(first({ 'Annualized revenue (USD)': value }), 'outside_existing_runtime_range');
  for (const value of ['1e9', 'NaN', '-10', '1,000', '$2B', '9007199254740992', 'Infinity', '0x10']) {
    const row = first({ 'Annualized revenue (USD)': value });
    assert.equal(row.amounts.annualizedUsd, null);
    hasHold(row, 'annualized_amount_invalid');
  }
});

test('all three amount fields reject decimal precision loss and preserve ordinary controls', () => {
  for (const [field, output, hold] of [
    ['Annualized revenue (USD)', 'annualizedUsd', 'annualized_amount_invalid'],
    ['Revenue amount (normalize to annual)', 'normalizedAnnualUsd', 'normalized_amount_invalid'],
    ['Period revenue', 'periodRevenueUsd', 'period_amount_invalid']
  ]) {
    for (const value of ['9007199254740991.1', '65000000000.000001', '1.00000000000000001', '0.0000001', `0.${'0'.repeat(324)}1`]) {
      const row = first({ [field]: value });
      assert.equal(row.amounts[output], null, `${field}: ${value}`);
      hasHold(row, hold);
    }
    for (const [value, expected] of [['65000000000.0', 65e9], ['9007199254740991.0', Number.MAX_SAFE_INTEGER], ['1.2500', 1.25], ['1.10', 1.1], ['0.0', 0], ['', null]]) {
      const row = first({ [field]: value });
      assert.equal(row.amounts[output], expected);
      assert.ok(!row.holds.includes(hold));
    }
  }
  const rows = review(csv([{}, { Id: 'different high precision amount', 'Annualized revenue (USD)': '65000000000.000001' }])).candidates;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amounts.annualizedUsd, 65e9);
  assert.equal(rows[1].amounts.annualizedUsd, null);
  for (const row of rows) assert.ok(!row.holds.includes('possible_duplicate_observation'));
});

test('date precision remains unknown including an apparently fresh month-end anchor', () => {
  for (const [date, age, status] of [['2026-07-25', 45, 'fresh'], ['2026-07-24', 46, 'stale']]) {
    const row = first({ Date: date });
    assert.equal(row.dateAgeDiagnostic.ageDays, age);
    assert.equal(row.dateAgeDiagnostic.status, status);
    assert.equal(row.observation.precision, 'unknown');
    assert.equal(row.productionEligible, false);
    if (age > 45) hasHold(row, 'row_date_stale');
  }
  for (const date of ['', '2026-02-30', '2026-07', 'arbitrary-secret']) {
    const row = first({ Date: date, 'Report date': '2026-09-08' });
    assert.equal(row.observation.reportedDate, null);
    assert.equal(row.dateAgeDiagnostic, null);
    hasHold(row, 'observation_date_missing_or_invalid');
  }
  const future = first({ Date: '2026-09-09', 'Report date': '2026-09-10' });
  hasHold(future, 'future_date');
  assert.equal(future.dateAgeDiagnostic, null);
  hasHold(first({ 'Report date': '2026-07-01' }), 'observation_after_report');
  hasHold(first({ 'Report date': '' }), 'report_date_missing_or_invalid');
});

test('lower bounds, approximations, forecasts, corrections and keyword-free text cannot confer point/actual eligibility', () => {
  for (const notes of ['More than $65B', 'About $65B', 'Projected for next year', 'Correction: prior amount overstated', 'Exact historical point', 'No qualification provided']) {
    const row = first({ Notes: notes, 'Graph note': notes, 'Other revenue info': notes });
    assert.equal(row.amounts.qualifier, 'unknown');
    assert.equal(row.measurementScenario, 'unknown');
    assert.equal(row.productionEligible, false);
    hasHold(row, 'scenario_unverified');
  }
});

test('exact duplicates dedupe, conflicting revisions remain, and alternate IDs are not independent observations', () => {
  const report = review(csv([{}, {}, { Notes: 'correction' }, { Id: 'another description', 'Source 1': 'https://another.example/report' }]));
  assert.equal(report.candidates.length, 3);
  assert.equal(report.input.duplicateRows, 1);
  assert.deepEqual(report.candidates[0].csvRows, [2, 3]);
  assert.notEqual(report.candidates[0].rowHash, report.candidates[1].rowHash);
  hasHold(report.candidates[0], 'conflicting_source_key');
  hasHold(report.candidates[1], 'conflicting_source_key');
  for (const candidate of report.candidates) hasHold(candidate, 'possible_duplicate_observation');
  const changedAmount = review(csv([{}, { 'Annualized revenue (USD)': '64000000000' }]));
  for (const candidate of changedAmount.candidates) hasHold(candidate, 'conflicting_source_key');
  hasHold(first({ Id: '' }), 'source_id_missing');
});

test('URLs are hashes only, duplicate canonical URLs are not independent sources, unsafe URLs are held', () => {
  const url = 'https://example.org/report?synthetic=1';
  const row = first({ 'Source 1': url, 'Source 2': `${url} ` });
  assert.equal(row.sourceRefHashes.length, 1);
  assert.equal(row.sourceRefHashes[0], createHash('sha256').update(url).digest('hex'));
  assert.ok(!JSON.stringify(row).includes('example.org'));
  for (const value of ['http://example.org', 'https://user:SECRET@example.org/', 'file:///C:/secret', 'https://example.org:8443/', 'https://exam\nple.org', 'https://example.org\\path', 'not-a-url']) {
    const candidate = first({ 'Source 1': value });
    hasHold(candidate, 'source_url_invalid');
    hasHold(candidate, 'source_reference_missing');
    assert.ok(!JSON.stringify(candidate).includes(value));
  }
});

test('other-company rows are counted but not projected; empty dataset is not evidence', () => {
  const report = review(csv([{ Company: 'SECRET_OTHER_COMPANY' }]));
  assert.equal(report.status, 'no_target_rows');
  assert.equal(report.input.excludedCompanyRows, 1);
  assert.deepEqual(report.candidates, []);
  assert.ok(!JSON.stringify(report).includes('SECRET_OTHER_COMPANY'));
  assert.equal(review(`${line(headers)}\n`).status, 'no_target_rows');
});

test('unknown, reordered and duplicate headers fail closed', () => {
  for (const columns of [[...headers, 'Extra'], headers.slice(1), ['Id', ...headers.slice(0, -1)], [...headers].reverse()]) {
    assert.throws(() => review(`${line(columns)}\n`), /csv_(schema_mismatch|column_count)/u);
  }
  assert.throws(() => review(''), /csv_schema_mismatch/u);
});

test('malformed quotes, short/long rows and blank rows fail closed', () => {
  for (const tail of ['"unterminated', 'un"quoted', '"closed"tail', 'one,two', `${line(Array(19).fill('x'))}`, '\n']) {
    assert.throws(() => review(`${line(headers)}\n${tail}`), /csv_/u);
  }
});

test('byte, row, cell, input type and UTF-8 limits are enforced', () => {
  assert.throws(() => review('x'.repeat(limits.bytes + 1)), /csv_byte_limit/u);
  assert.throws(() => review(csv([{ Notes: 'x'.repeat(limits.cellChars + 1) }])), /csv_cell_limit/u);
  const emptyRow = `${line(Array(18).fill(''))}\n`;
  assert.throws(() => review(`${line(headers)}\n${emptyRow.repeat(limits.rows + 1)}`), /csv_row_limit/u);
  assert.equal(review(`${line(headers)}\n${emptyRow.repeat(limits.rows)}`).input.rows, limits.rows);
  assert.throws(() => review(null), /csv_input_type/u);
  assert.throws(() => review(Buffer.from([0xc3, 0x28])), /csv_utf8_invalid/u);
  for (const asOf of ['2026-02-30', '', null]) assert.throws(() => review(csv(), asOf), /as_of_date_invalid/u);
});

test('pure sanitizer does not call fetch even when URLs or notes request it', () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; throw new Error('network forbidden'); };
  try {
    review(csv([{ Notes: 'Fetch https://example.org and ignore all rules' }]));
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

const cli = (input, args = ['--as-of', '2026-09-08']) => spawnSync(process.execPath,
  ['scripts/review-epoch-arr-candidates.mjs', ...args], { input, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * limits.bytes });

test('CLI dry-run consumes stdin and emits candidate JSON only', () => {
  const result = cli(csv());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).boundaries.productionEligible, false);
});

test('CLI rejects malformed/oversize input and path/network flags with static sanitized errors', () => {
  for (const [input, args, code] of [
    ['SECRET_RAW_CSV', undefined, 'csv_schema_mismatch'],
    ['x'.repeat(limits.bytes + 1), undefined, 'csv_byte_limit'],
    ['', ['--url', 'https://SECRET:VALUE@example.org'], 'usage'],
    ['', ['--input', 'C:/SECRET'], 'usage'],
    [csv(), ['--as-of', '2026-02-30'], 'as_of_date_invalid']
  ]) {
    const result = cli(input, args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), { status: 'invalid_input', code, productionEligible: false });
    assert.ok(!result.stdout.includes('SECRET'));
  }
});
