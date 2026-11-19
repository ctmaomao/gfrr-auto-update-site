import { deepStrictEqual, equal, match, throws } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeThermalReceipts } from '../../scripts/oil-directional/analyze-thermal-receipts.mjs';
import { createThermalReceiptCapture } from '../../scripts/oil-directional/thermal-receipt-capture.mjs';

const noaa = 'VIIRS_NOAA20_NRT';
const snpp = 'VIIRS_SNPP_NRT';
const checkoutSha = 'a'.repeat(40);
const time = '2025-01-01T12:00:00.000Z';
const body1 = '2025-01-01T12:01:00.000Z';
const body2 = '2025-01-01T12:02:00.000Z';

function capture(runId = '123', { zero = false, extra = 0, frp = '8', versions, runAttempt = 1, configDigest = 'b'.repeat(64) } = {}) {
  const pins = { runId, runAttempt, checkoutSha };
  const collector = createThermalReceiptCapture({ ...pins, configDigest, geometryDigest: 'c'.repeat(64),
    sourceSet: [noaa, snpp], expectedRequests: 4 });
  const observation = { instrument: 'VIIRS', satellite: 'N20', latitude: '1', longitude: '1',
    acq_date: '2025-01-01', acq_time: '1201', frp, confidence: 'h', daynight: 'D' };
  for (const [index, bodyReceivedAt] of [body1, body2].entries()) {
    const context = { areaId: 'private-fixture-' + index, bbox: index ? '0,0,3,3' : '0,0,2,2', dayRange: 1,
      logicalRequestStartedAt: time, classifiedAt: bodyReceivedAt };
    const records = versions ? versions[index].map(version => ({ ...observation, version }))
      : index ? [observation, { ...observation, frp: '9' }] : [observation, observation];
    records.push(...Array.from({ length: extra }, (_, n) => ({ ...observation, latitude: (1 + (n + 1) / 100).toFixed(2) })));
    collector.record({ ...context, source: noaa, outcome: 'parsed', bodyReceivedAt,
      diagnostics: { outcome: 'success', httpStatus: 200, attempts: 1, retryCount: 0 },
      researchCsvShapeValid: true, records: zero ? [] : records });
    collector.record({ ...context, source: snpp, outcome: 'request_error',
      diagnostics: { outcome: 'error', category: 'source_retired', httpStatus: null, attempts: 0, retryCount: 0 } });
  }
  return { ...pins, text: JSON.stringify(collector.finalize()) };
}
function mutate(input, change) {
  const data = JSON.parse(input.text);
  change(data);
  return { ...input, text: JSON.stringify(data) };
}

test('reports exact source aggregates and preserves existing run-scoped totals and unknowns', () => {
  const first = capture(), replayedIdentity = capture('456'), empty = capture('789', { zero: true });
  const inputs = [first, replayedIdentity, empty];
  const summary = analyzeThermalReceipts(inputs);
  deepStrictEqual(summary, analyzeThermalReceipts([...inputs].reverse()));
  deepStrictEqual(summary.bySource[noaa], { logicalRequests: 6, transportAttempts: 6, retries: 0, successfulHttpBodies: 6,
    outcomes: { success_detections: 4, success_zero: 2, parse_invalid: 0, request_error: 0, retired: 0 },
    parsedRows: 8, observationReferences: 4, runScopedUniqueCaptures: 2, runScopedUniqueRevisions: 4 });
  deepStrictEqual(summary.bySource[snpp], { logicalRequests: 6, transportAttempts: 0, retries: 0, successfulHttpBodies: 0,
    outcomes: { success_detections: 0, success_zero: 0, parse_invalid: 0, request_error: 0, retired: 6 },
    parsedRows: 0, observationReferences: 0, runScopedUniqueCaptures: 0, runScopedUniqueRevisions: 0 });
  deepStrictEqual(summary.suppliedReceiptCaptureOverlapBySource, {
    [noaa]: { unionUniqueCaptures: 1, capturesInMultipleReceipts: 1 },
    [snpp]: { unionUniqueCaptures: 0, capturesInMultipleReceipts: 0 }
  });
  equal(summary.runAttempts, 3);
  equal(summary.completenessScope, 'captured_requests_not_source_coverage');
  equal(summary.provenance, 'unverified_runtime_assertion');
  for (const key of ['coverage', 'spatialCoverage', 'overpassOpportunity', 'cloudQuality']) equal(summary[key], 'unknown');
  for (const key of ['eligibleForEvaluation', 'eligibleForMainScore']) equal(summary[key], false);
  equal(summary.crossRunFirstSeen, null);
  const output = JSON.stringify(summary), snapshot = JSON.parse(first.text);
  for (const privateValue of [first.checkoutSha, snapshot.manifest.configDigest, snapshot.manifest.geometryDigest,
    snapshot.receipts[0].areaIdHash, snapshot.receipts[0].geometryHash, snapshot.observations[0].observationId, body1]) {
    equal(output.includes(privateValue), false);
  }
});

test('distinguishes a two-receipt subset delta from run totals and does not conflate revisions with new captures', () => {
  const first = capture('123', { extra: 10 });
  const second = capture('456', { extra: 30, frp: '17' });
  const receipts = [first, second];
  const summary = analyzeThermalReceipts(receipts);
  equal(summary.bySource[noaa].runScopedUniqueCaptures, 42);
  deepStrictEqual(summary.suppliedReceiptCaptureOverlapBySource[noaa],
    { unionUniqueCaptures: 31, capturesInMultipleReceipts: 11 });
  deepStrictEqual(analyzeThermalReceipts([second, first]), summary);
  equal(summary.crossRunFirstSeen, null);

  const retry = capture('123', { extra: 10, runAttempt: 2 });
  const retriedSummary = analyzeThermalReceipts([first, retry]);
  equal(retriedSummary.runAttempts, 2);
  deepStrictEqual(retriedSummary.suppliedReceiptCaptureOverlapBySource[noaa],
    { unionUniqueCaptures: 11, capturesInMultipleReceipts: 11 });

  const replay = capture('789', { extra: 10 });
  deepStrictEqual(analyzeThermalReceipts([...receipts, replay]).suppliedReceiptCaptureOverlapBySource,
    summary.suppliedReceiptCaptureOverlapBySource);
  deepStrictEqual(analyzeThermalReceipts([first]).suppliedReceiptCaptureOverlapBySource[noaa],
    { unionUniqueCaptures: 11, capturesInMultipleReceipts: 0 });
});

test('round-trips URT, RT and NRT as three revisions of one capture, ignoring an exact repeat', () => {
  const input = capture('123', { versions: [['2.0URT', '2.0RT'], ['2.0NRT', '2.0NRT']] });
  const snapshot = JSON.parse(input.text);
  equal(snapshot.complete, true);
  equal(snapshot.observations.length, 1);
  const [observation] = snapshot.observations;
  deepStrictEqual(observation.revisions.map(r => r.processingVersion), ['2.0URT', '2.0RT', '2.0NRT']);
  for (const row of [snapshot.receipts[0], snapshot.receipts[2]]) {
    deepStrictEqual(row.observationIds, [observation.observationId]);
  }
  const summary = analyzeThermalReceipts([input]);
  equal(summary.bySource[noaa].runScopedUniqueCaptures, 1);
  equal(summary.bySource[noaa].runScopedUniqueRevisions, 3);
});

test('rejects invalid revision versions even when their content hash matches', () => {
  const input = capture();
  for (const processingVersion of [undefined, '', 2, '2.0rT', '2.0RT ', '2.0URT\n', '2.0RTURT',
    '2.0.0.1RT', '2.001URT', 'URT']) {
    const malformed = mutate(input, receipt => {
      const revision = receipt.observations[0].revisions[0];
      const { frp, confidence, daynight } = revision;
      revision.processingVersion = processingVersion;
      revision.contentHash = createHash('sha256')
        .update(JSON.stringify({ frp, confidence, daynight, processingVersion })).digest('hex');
    });
    throws(() => analyzeThermalReceipts([malformed]), /Malformed or incomplete research receipt/);
  }
});

test('rejects contradictory visible identity fields for a repeated opaque ID', () => {
  const inconsistent = mutate(capture('456'), receipt => {
    receipt.observations[0].acquiredAt = '2025-01-01T12:00:00Z';
  });
  // Without the other receipt the opaque ID cannot be recomputed.
  equal(analyzeThermalReceipts([inconsistent]).runAttempts, 1);
  throws(() => analyzeThermalReceipts([capture(), inconsistent]), /Inconsistent capture identity/);
});

test('HTTP body parse failure and transport failure do not count as parsed zero', () => {
  const input = mutate(capture('123', { zero: true }), receipt => {
    Object.assign(receipt.receipts[0], { outcome: 'parse_invalid', parsedRowCount: null, researchCsvShapeValid: null });
    Object.assign(receipt.receipts[2], { outcome: 'request_error', httpStatus: 503, attempts: 2, retryCount: 1,
      failureCategory: 'server_error', lastFailureCategory: 'server_error', bodyReceivedAt: null, parsedRowCount: null, researchCsvShapeValid: null });
  });
  const tally = analyzeThermalReceipts([input]).bySource[noaa];
  equal(tally.outcomes.success_zero, 0);
  equal(tally.outcomes.parse_invalid, 1);
  equal(tally.outcomes.request_error, 1);
  equal(tally.successfulHttpBodies, 1);
  equal(tally.retries, 1);
});

test('rejects wrong pins, duplicate attempts, mixed cohorts and over-bound inputs', () => {
  const input = capture();
  for (const pins of [{ runId: '456' }, { runAttempt: 2 }, { checkoutSha: 'd'.repeat(40) }]) {
    throws(() => analyzeThermalReceipts([{ ...input, ...pins }]), /pinned run/);
  }
  throws(() => analyzeThermalReceipts([input, input]), /Duplicate run attempt/);
  throws(() => analyzeThermalReceipts([input, capture('456', { configDigest: 'd'.repeat(64) })]), /one receipt cohort/);
  const differentMatrix = mutate(capture('456'), receipt => receipt.receipts
    .filter(row => row.dayRange === 1).forEach(row => { row.dayRange = 2; }));
  throws(() => analyzeThermalReceipts([input, differentMatrix]), /one receipt cohort/);
  throws(() => analyzeThermalReceipts(Array(33).fill(input)), /1 to 32/);
  throws(() => analyzeThermalReceipts([{ ...input, text: ' '.repeat(262145) }]), /pinned run/);
});

test('rejects incomplete, nonclosed or contradictory receipts without counting them', () => {
  const input = capture();
  for (const corrupt of [
    r => { r.finalized = false; },
    r => { r.complete = false; },
    r => { r.eligibleForEvaluation = true; },
    r => { r.coverage = 'known'; },
    r => { r.receipts.pop(); },
    r => { r.receipts[0].requestOrdinal = 2; },
    r => { r.receipts[1].source = noaa; },
    r => { r.receipts[1].areaIdHash = 'e'.repeat(64); },
    r => { r.receipts[1].geometryHash = 'e'.repeat(64); },
    r => { r.receipts[0].httpStatus = 503; },
    r => { r.receipts[0].parsedRowCount = 0; },
    r => { r.receipts[1].attempts = 1; },
    r => { r.observations.pop(); },
    r => { r.observations[0].instrument = null; },
    r => { r.observations[0].satellite = 'INVALID'; },
    r => { r.observations[0].firstReceivedInRun = body2; },
    r => { r.observations[0].revisions[0].frp = 99; },
    r => { r.observations[0].revisions.push(r.observations[0].revisions[0]); }
  ]) throws(() => analyzeThermalReceipts([mutate(input, corrupt)]), /Malformed|pinned run/);
});

test('CLI writes only aggregate output or a static refusal, with a bounded regular-file read', t => {
  const dir = mkdtempSync(join(tmpdir(), 'thermal-aggregate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = capture();
  const script = fileURLToPath(new URL('../../scripts/oil-directional/analyze-thermal-receipts.mjs', import.meta.url));
  const path = join(dir, 'fixture.json');
  const run = file => spawnSync(process.execPath, [script, `${input.runId}:${input.runAttempt}:${input.checkoutSha}`, file], { encoding: 'utf8', timeout: 5000 });
  writeFileSync(path, input.text);
  const good = run(path);
  equal(good.status, 0);
  equal(good.stderr, '');
  deepStrictEqual(JSON.parse(good.stdout), analyzeThermalReceipts([input]));
  writeFileSync(path, Buffer.alloc(262145));
  for (const file of [path, dir, join(dir, 'missing-do-not-echo')]) {
    const bad = run(file);
    equal(bad.status, 1);
    equal(bad.stdout, '');
    match(bad.stderr, /^Thermal receipt analysis refused: [^\n]+\n$/);
    equal(bad.stderr.includes(file), false);
  }
});
