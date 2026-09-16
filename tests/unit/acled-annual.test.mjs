import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ANNUAL, collectAnnualCandidate, inspectAnnualSnapshot } from '../../scripts/world-order/acled-annual-collector.mjs';
import { runAnnualAcceptance, reviewStoredAnnual, readAnnualCandidateForReview } from '../../scripts/world-order/acled-annual-store.mjs';

const NOW = '2026-09-16T00:00:00.000Z', ID = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const contact = { application: 'Synthetic only', email: 'test@example.invalid' };
function fixture(countries = ['AAA']) {
  const metadataBefore = JSON.stringify({ data: [{ resource_hdx_id: ID, dataset_hdx_stub: 'political-violence-events-and-fatalities',
    dataset_hdx_provider_stub: 'acled', format: 'xlsx', name: 'political-violence-events-and-fatalities_as-of-2026-08-28.xlsx',
    update_date: '2026-09-03T10:29:54', hapi_updated_date: '2026-09-07T01:33:17' }] });
  const partitions = [2022, 2024].map(start => JSON.stringify({ data: countries.flatMap(country => Array.from({ length: 24 }, (_, i) => {
    const year = start + Math.floor(i / 12), m = i % 12 + 1, month = `${year}-${String(m).padStart(2, '0')}`;
    return { location_code: country, location_name: 'Synthetic', admin_level: 0, admin1_code: null, admin1_name: null,
      admin2_code: null, admin2_name: null, resource_hdx_id: ID, event_type: 'political_violence', events: 0, fatalities: 0,
      reference_period_start: `${month}-01T00:00:00`, reference_period_end: new Date(Date.UTC(year, m, 1) - 1000).toISOString().slice(0, 19) };
  })) }));
  return { metadataBefore, metadataAfter: metadataBefore, partitions, fetchedAt: NOW };
}
const response = body => new Response(body, { headers: { 'content-type': 'application/json' } });
async function collect(snapshot = fixture(), queue = null) {
  const responses = queue ?? [snapshot.metadataBefore, ...snapshot.partitions, snapshot.metadataAfter].map(response);
  const calls = [], starts = []; let tick = 0;
  const result = await collectAnnualCandidate(contact, { now: () => NOW, tick: () => tick, wait: async ms => { tick += ms; },
    fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); starts.push(tick); const next = responses.shift();
      if (!next) throw Error('unexpected_request'); return next; } });
  return { ...result, calls, starts };
}
const mutate = (snapshot, index, fn) => { const body = JSON.parse(snapshot.partitions[index]); body.data = fn(body.data); snapshot.partitions[index] = JSON.stringify(body); return snapshot; };

test('four bounded requests cover fixed 2022-2025 partitions, zero stays valid, no global/production claim', async () => {
  const result = await collect(); assert.equal(result.report.status, 'candidate_ready'); assert.equal(result.report.requestCount, 4);
  assert.equal(result.report.totalRows, 50); assert.deepEqual(result.starts, [0, 1100, 2200, 3300]);
  assert.deepEqual(result.report.coverage.completeYears, [2022, 2023, 2024, 2025]);
  assert.equal(result.report.coverage.returnedCountries, 1); assert.equal(result.report.coverage.globalCoverage, 'not_proven');
  assert.equal(result.report.productionEligible, false); assert.equal(result.report.sourceCutoverApproved, false);
  assert.equal(new URL(result.calls[1].url).searchParams.get('start_date'), '2022-01-01');
  assert.equal(new URL(result.calls[2].url).searchParams.get('end_date'), '2025-12-31');
  assert.ok(result.calls.every(c => c.options.redirect === 'manual' && new URL(c.url).origin === 'https://hapi.humdata.org'));
  const text = JSON.stringify(result.report); for (const raw of ['AAA', 'Synthetic', 'test@example.invalid', 'location_code']) assert.ok(!text.includes(raw));
});
test('union of returned countries exposes partition loss instead of dropping countries', async () => {
  const snapshot = fixture(); snapshot.partitions[1] = fixture(['BBB']).partitions[1];
  const result = await collect(snapshot); assert.equal(result.report.reason, 'cross_partition_coverage'); assert.equal(result.snapshot, null);
});
test('missing/null/duplicate/wrong year/layer/category fail before another data partition', async () => {
  for (const fn of [r => r.slice(1), r => r.map((x, i) => i ? x : { ...x, events: null }), r => [...r, r[0]],
    r => r.map(x => ({ ...x, admin_level: 1 })), r => r.map(x => ({ ...x, event_type: 'civilian_targeting' })),
    r => r.map(x => ({ ...x, reference_period_start: x.reference_period_start.replace('2022', '2024') }))]) {
    const result = await collect(mutate(fixture(), 0, fn)); assert.equal(result.report.requestCount, 2);
    assert.equal(result.report.status, 'stopped'); assert.equal(result.snapshot, null);
  }
});
test('metadata fence and source period/freshness remain hard holds', async () => {
  const snapshot = fixture(); const meta = JSON.parse(snapshot.metadataAfter); meta.data[0].hapi_updated_date = '2026-09-08T01:33:17';
  snapshot.metadataAfter = JSON.stringify(meta); assert.equal((await collect(snapshot)).report.reason, 'metadata_changed');
  for (const [asOf, expected] of [['2025-12-31', 'source_period_incomplete'], ['2026-06-28', 'source_stale']]) {
    const s = fixture(); s.metadataBefore = s.metadataBefore.replace('2026-08-28.xlsx', `${asOf}.xlsx`);
    const result = await collect(s); assert.equal(result.report.requestCount, 1); assert.equal(result.report.reason, expected);
  }
});
test('HTTP failures and redirects are not retried, second partition failure returns no snapshot', async () => {
  for (const status of [301, 401, 403, 429, 500]) {
    const result = await collect(fixture(), [new Response('', { status })]);
    assert.equal(result.report.requestCount, 1); assert.equal(result.snapshot, null);
  }
  const s = fixture(), result = await collect(s, [response(s.metadataBefore), response(s.partitions[0]), new Response('', { status: 500 })]);
  assert.equal(result.report.requestCount, 3); assert.equal(result.snapshot, null);
});
test('exact row limit, cumulative bytes and malformed JSON stop within approval', async () => {
  const s = fixture(); const row = JSON.parse(s.partitions[0]).data[0]; s.partitions[0] = JSON.stringify({ data: Array(10000).fill(row) });
  assert.equal((await collect(s)).report.reason, 'partition_limit_or_empty');
  const big = fixture(); big.partitions = big.partitions.map(p => p + ' '.repeat(8 * 1024 * 1024));
  const result = await collect(big); assert.equal(result.report.reason, 'byte_budget'); assert.equal(result.report.requestCount, 3);
  assert.equal((await collect(fixture(), [response('{')])).report.reason, 'json_invalid');
});
test('15-second deadline covers hung fetch and hung body even if abort ignored', async () => {
  const failures = await Promise.all([
    collectAnnualCandidate(contact, { now: () => NOW, wait: async () => {}, fetchImpl: () => new Promise(() => {}) }),
    collectAnnualCandidate(contact, { now: () => NOW, wait: async () => {}, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }) })
  ]);
  assert.ok(failures.every(r => r.report.reason === 'timeout' && r.report.requestCount === 1));
});
test('independent once ledger, hash review and failure reservation preserve prior state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-annual-'));
  try {
    const parent = path.join(root, 'manual-artifacts'); await mkdir(parent); await writeFile(path.join(parent, 'existing-pilot-sentinel'), 'unchanged');
    const ready = await collect();
    assert.equal((await runAnnualAcceptance(root, contact, { now: () => NOW, collect: async () => ready })).status, 'candidate_ready');
    assert.equal((await reviewStoredAnnual(root, NOW)).status, 'saved_candidate_verified');
    assert.deepEqual(await readAnnualCandidateForReview(root, NOW), ready.snapshot);
    assert.equal((await runAnnualAcceptance(root, contact, { collect: () => { throw Error('must_not_run'); } })).networkRequests, 0);
    assert.equal(await readFile(path.join(parent, 'existing-pilot-sentinel'), 'utf8'), 'unchanged');
    await writeFile(path.join(parent, ANNUAL.id, 'years-2022-2023.private.json'), 'bad');
    await assert.rejects(reviewStoredAnnual(root, NOW), /artifact_hash/u);
    await assert.rejects(readAnnualCandidateForReview(root, NOW), /artifact_hash/u);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  const interrupted = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-annual-'));
  try {
    await mkdir(path.join(interrupted, 'manual-artifacts'));
    await assert.rejects(runAnnualAcceptance(interrupted, contact, { now: () => NOW, collect: async () => { throw Error('crash'); } }));
    assert.equal((await runAnnualAcceptance(interrupted, contact)).status, 'already_attempted');
  } finally { await rm(interrupted, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});
test('unsafe directories and invalid offline snapshots are rejected; CLI default never fetches', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-annual-')), outside = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-annual-'));
  try {
    await symlink(outside, path.join(root, 'manual-artifacts'), 'junction');
    await assert.rejects(runAnnualAcceptance(root, contact), /unsafe_directory/u);
    assert.throws(() => inspectAnnualSnapshot({ ...fixture(), productionEligible: true }, NOW), /snapshot_schema/u);
    const dry = spawnSync(process.execPath, ['scripts/collect-acled-annual.mjs'], { encoding: 'utf8' });
    assert.equal(dry.status, 0); assert.equal(JSON.parse(dry.stdout).networkRequests, 0);
    const invalid = spawnSync(process.execPath, ['scripts/collect-acled-annual.mjs', '--url', 'private'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1); assert.ok(!invalid.stdout.includes('private'));
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); await rm(outside, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});
