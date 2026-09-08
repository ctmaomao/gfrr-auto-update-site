import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { EPOCH_ARR_HEADERS, EPOCH_ARR_LIMITS } from '../../scripts/bubble-watch/epoch-arr-candidate.mjs';
import { buildEpochArrSnapshot, compareEpochArrSnapshots as compare, validateEpochArrSnapshot } from '../../scripts/bubble-watch/epoch-arr-snapshot.mjs';
import { EPOCH_ARR_CSV_URL, readEpochArrCandidate, epochReaderDiagnostic } from '../../scripts/bubble-watch/epoch-arr-reader.mjs';

// Synthetic test data, not a retained Epoch download.
const sample = { Id: 'synthetic-one', Company: 'Anthropic', Date: '2026-07-31', 'Annualized revenue (USD)': '65000000000.0',
  'Annualized revenue type': 'Annualized run rate', Scope: 'Full company', Confidence: 'Likely',
  'Source 1': 'https://example.org/PRIVATE_URL', 'Report date': '2026-08-17', 'Source type': 'Company disclosure', Notes: 'PRIVATE_NOTES' };
const csv = (rows = [{}]) => [EPOCH_ARR_HEADERS, ...rows.map(row => EPOCH_ARR_HEADERS.map(key => ({ ...sample, ...row })[key] ?? ''))]
  .map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
const asOfDate = '2026-09-08';
const build = (rows = [{}], date = asOfDate) => buildEpochArrSnapshot(csv(rows), { asOfDate: date });
const response = (body = csv(), options = {}) => {
  const result = new Response(body, { status: 200, headers: { 'Content-Type': 'text/csv' }, ...options });
  Object.defineProperty(result, 'url', { value: EPOCH_ARR_CSV_URL, configurable: true });
  return result;
};
const read = (fetchImpl, options = {}) => readEpochArrCandidate({ allowNetwork: true, asOfDate, fetchImpl, ...options });
const rejectsCode = async (promise, code) => assert.rejects(promise, error => epochReaderDiagnostic(error).code === code);

test('reader defaults offline and validates inputs before requesting anything', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(); };
  await rejectsCode(read(fetchImpl, { allowNetwork: false }), 'network_not_authorized');
  for (const timeoutMs of [0, -1, 15001, NaN, '15']) await rejectsCode(read(fetchImpl, { timeoutMs }), 'reader_options_invalid');
  for (const date of ['', '2026-02-30', '2026-09', null]) await rejectsCode(read(fetchImpl, { asOfDate: date }), 'as_of_date_invalid');
  assert.equal(calls, 0);
});

test('one pinned GET has no credentials, redirects or source-link requests and returns only sanitized evidence', async () => {
  let calls = 0;
  const result = await read(async (url, options) => {
    calls += 1; assert.equal(url, EPOCH_ARR_CSV_URL);
    assert.deepEqual(Object.keys(options).sort(), ['cache', 'credentials', 'headers', 'method', 'redirect', 'signal']);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(Object.keys(options.headers).sort(), ['Accept', 'User-Agent']);
    return response();
  });
  assert.equal(calls, 1); assert.equal(result.networkCalls, 1);
  assert.equal(result.snapshot.productionEligible, false);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
  assert.equal(result.report.candidates[0].observation.reportedDate, '2026-07-31');
  assert.equal(compare(null, result.snapshot).status, 'baseline_required');
});

test('HTTP failures, wrong final targets and redirects do not retry or follow derived URLs', async () => {
  for (const status of [301, 403, 429, 500, 503]) {
    let calls = 0;
    await rejectsCode(read(async () => { calls += 1; return response('', { status }); }), 'http_status');
    assert.equal(calls, 1);
  }
  await rejectsCode(read(async () => {
    const res = response(); Object.defineProperty(res, 'url', { value: 'https://private.example/SECRET' }); return res;
  }), 'response_target_invalid');
  await rejectsCode(read(async () => {
    const res = response(); Object.defineProperty(res, 'redirected', { value: true }); return res;
  }), 'response_target_invalid');
  await rejectsCode(read(async () => { throw new Error('redirect includes SECRET'); }), 'request_failed');
});

test('content type, declared length, actual decoded byte limit and absent body fail closed', async () => {
  for (const type of ['text/html', 'application/json', 'text/csv; charset=iso-8859-1', '']) {
    await rejectsCode(read(async () => response(csv(), { headers: { 'Content-Type': type } })), 'content_type_invalid');
  }
  for (const length of ['-1', '1.5', String(EPOCH_ARR_LIMITS.bytes + 1)]) {
    await rejectsCode(read(async () => response(csv(), { headers: { 'Content-Type': 'text/csv', 'Content-Length': length } })), 'response_byte_limit');
  }
  await rejectsCode(read(async () => response('x'.repeat(EPOCH_ARR_LIMITS.bytes + 1))), 'response_byte_limit');
  await rejectsCode(read(async () => response(null)), 'response_body_missing');
  assert.equal((await read(async () => response(csv(), { headers: { 'Content-Type': 'text/csv; charset="UTF-8"' } }))).status, 'candidate_snapshot_ready');
});

test('request and body stalls share a hard deadline, even if an injected transport ignores abort', async () => {
  const start = Date.now();
  await rejectsCode(read(() => new Promise(() => {}), { timeoutMs: 20 }), 'request_timeout');
  let cancelled = false;
  await rejectsCode(read(async () => response(new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => { cancelled = true; } })), { timeoutMs: 20 }), 'request_timeout');
  assert.ok(Date.now() - start < 2000);
  assert.equal(cancelled, true);
});

test('stream and CSV failures are fixed diagnostics without upstream text leakage', async () => {
  await rejectsCode(read(async () => response(new ReadableStream({ start(controller) { controller.error(new Error('SECRET stream')); } }))), 'response_stream_failed');
  for (const body of ['SECRET_BAD_CSV', new Uint8Array([0xc3, 0x28])]) await rejectsCode(read(async () => response(body)), 'csv_validation_failed');
  assert.deepEqual(epochReaderDiagnostic(new Error('SECRET upstream')), { code: 'reader_failed', httpStatus: null });
});

test('same file on a later review date does not create fresh observations or reset the baseline', () => {
  const old = build(), next = build([{}], '2026-09-20');
  assert.deepEqual(old.snapshot, next.snapshot);
  const result = compare(old.snapshot, next.snapshot);
  assert.equal(result.status, 'unchanged_file'); assert.deepEqual(result.changes, []);
  assert.equal(result.boundaries.baselineUpdated, false);
  assert.equal(result.boundaries.observationDatesRefreshed, false);
  assert.equal(next.report.candidates[0].dateAgeDiagnostic.status, 'stale');
  assert.equal(next.report.candidates[0].productionEligible, false);
});

test('amount/date changes, old-period corrections and notes-only changes remain visible', () => {
  const old = build().snapshot;
  for (const [row, field] of [[{ 'Annualized revenue (USD)': '64000000000' }, 'amounts'], [{ Date: '2026-07-01' }, 'observation'], [{ Confidence: 'Confident' }, 'confidence']]) {
    const diff = compare(old, build([row]).snapshot);
    assert.equal(diff.changes[0].kind, 'revision'); assert.ok(diff.changes[0].fieldsChanged.includes(field));
  }
  const notes = compare(old, build([{ Notes: 'PRIVATE_CORRECTION' }]).snapshot);
  assert.equal(notes.changes[0].unprojectedEvidenceChanged, true);
  assert.ok(!JSON.stringify(notes).includes('PRIVATE_'));
  const historic = [{ Id: 'old', Date: '2024-01-01' }, {}];
  const revised = [{ Id: 'old', Date: '2024-01-01', Notes: 'historical correction' }, {}];
  assert.equal(compare(build(historic).snapshot, build(revised).snapshot).changes[0].kind, 'revision');
});

test('additions, removals, descriptive rekeys and missing IDs never silently overwrite evidence', () => {
  const one = build().snapshot, two = build([{}, { Id: 'two' }]).snapshot;
  assert.equal(compare(one, two).changes[0].kind, 'added');
  assert.equal(compare(two, one).changes[0].kind, 'removed');
  assert.deepEqual(compare(one, build([{ Id: 'renamed' }]).snapshot).changes.map(change => change.kind).sort(), ['added', 'removed']);
  assert.deepEqual(compare(build([{ Id: '' }]).snapshot, build([{ Id: '', Notes: 'changed' }]).snapshot).changes.map(change => change.kind).sort(), ['added', 'removed']);
});

test('duplicate counts and ambiguous keys are retained as review events, not last-write-wins', () => {
  const duplicate = compare(build().snapshot, build([{}, {}]).snapshot).changes[0];
  assert.equal(duplicate.kind, 'duplicate_count_changed');
  assert.equal(duplicate.beforeOccurrences, 1); assert.equal(duplicate.afterOccurrences, 2);
  const ambiguous = compare(build().snapshot, build([{}, { Notes: 'conflicting revision' }]).snapshot);
  assert.equal(ambiguous.changes[0].kind, 'ambiguous_key');
  assert.equal(ambiguous.boundaries.productionEligible, false);
});

test('formatting or excluded-company changes remain file changes, not falsely unchanged evidence', () => {
  const before = build().snapshot;
  const formatted = buildEpochArrSnapshot(`${csv()}\n`, { asOfDate }).snapshot;
  const diff = compare(before, formatted);
  assert.equal(diff.status, 'changed_review_required'); assert.equal(diff.unprojectedFileChange, true);
  assert.equal(compare(before, build([{}, { Company: 'Other' }]).snapshot).unprojectedFileChange, true);
});

test('strict imported snapshot validation rejects forged authority, raw strings, duplicates and count/schema corruption', () => {
  const original = build().snapshot;
  for (const mutate of [
    input => { input.productionEligible = true; }, input => { input.sourceAuthenticity = 'verified'; },
    input => { input.sourceKey = 'other'; }, input => { input.extra = 'SECRET'; }, input => { input.fileHash = 'SECRET'; },
    input => { input.rows[0].fields.notes = 'SECRET'; }, input => { input.rows[0].fields.amounts = 'SECRET'; },
    input => { input.rows.push(structuredClone(input.rows[0])); input.totalRows += 1; },
    input => { input.rows[0].occurrences = 0; }, input => { input.totalRows = 1001; }, input => { input.excludedRows = 1; }
  ]) {
    const input = structuredClone(original); mutate(input);
    assert.throws(() => validateEpochArrSnapshot(input), /^Error: snapshot_invalid$/u);
  }
  const reordered = JSON.parse(JSON.stringify(original)); reordered.rows[0].fields = Object.fromEntries(Object.entries(reordered.rows[0].fields).reverse());
  assert.equal(compare(original, reordered).status, 'unchanged_file');
  assert.throws(() => compare(undefined, original), /snapshot_invalid/u);
});

test('inconsistent file/row identities fail closed instead of trusting imported hashes', () => {
  const original = build().snapshot;
  const tampered = structuredClone(original); tampered.rows[0].fields.amounts = '0'.repeat(64);
  assert.throws(() => compare(original, tampered), /snapshot_identity_conflict/u);
  tampered.fileHash = '1'.repeat(64);
  assert.throws(() => compare(original, tampered), /snapshot_identity_conflict/u);
});

const cli = (input, args = ['--as-of', asOfDate]) => spawnSync(process.execPath, ['scripts/review-epoch-arr-refresh.mjs', ...args],
  { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
test('offline CLI composes snapshot and comparison without network or file writes', () => {
  const result = cli({ previousSnapshot: build().snapshot, currentCsv: csv([{ Notes: 'changed' }]) });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.networkCalls, 0); assert.equal(output.productionWrites, 0);
  assert.equal(output.comparison.changes[0].kind, 'revision');
});

test('CLI rejects path/network options, oversized/malformed input and invalid baseline before a live request', () => {
  for (const [input, args] of [
    [{ currentCsv: csv() }, ['--url', 'https://SECRET.example']], ['SECRET malformed', undefined],
    [{ currentCsv: csv(), output: 'data/SECRET.json' }, undefined], ['x'.repeat(4 * 1024 * 1024 + 1), undefined],
    [{ previousSnapshot: { productionEligible: true } }, ['--as-of', asOfDate, '--allow-network']]
  ]) {
    const result = cli(input, args); assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stderr, ''); assert.ok(!result.stdout.includes('SECRET'));
    assert.equal(JSON.parse(result.stdout).productionEligible, false);
  }
});
