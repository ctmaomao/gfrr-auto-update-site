import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, stat, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PILOT, pilotMetadata, inspectPilotSnapshot, runPilotCollection } from '../../scripts/world-order/acled-pilot.mjs';
import { executePilotSlot, pilotStoreStatus } from '../../scripts/world-order/acled-pilot-store.mjs';

const NOW = '2026-09-16T00:00:00.000Z', ID = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const contact = { application: 'Synthetic test', email: 'test@example.invalid' };
function fixture(asOf = '2026-08-28', countries = ['AAA']) {
  const metadataJson = JSON.stringify({ data: [{ resource_hdx_id: ID, dataset_hdx_stub: 'political-violence-events-and-fatalities',
    dataset_hdx_provider_stub: 'acled', format: 'xlsx', name: `political-violence-events-and-fatalities_as-of-${asOf}.xlsx`,
    update_date: asOf === '2026-08-28' ? '2026-09-03T10:29:54' : '2026-09-10T10:29:54', hapi_updated_date: '2026-09-14T01:33:17.350664' }] });
  const months = pilotMetadata(metadataJson, NOW).months;
  const rows = countries.flatMap(country => months.map(month => {
    const [y, m] = month.split('-').map(Number);
    return { location_code: country, location_name: 'Synthetic country', admin1_code: null, admin1_name: null,
      admin2_code: null, admin2_name: null, admin_level: 0, resource_hdx_id: ID, event_type: 'political_violence',
      events: 17, fatalities: 5, reference_period_start: `${month}-01T00:00:00`,
      reference_period_end: new Date(Date.UTC(y, m, 1) - 1000).toISOString().slice(0, 19) };
  }));
  return { sampleJson: JSON.stringify({ data: rows }), metadataJson, fetchedAt: NOW };
}
const json = body => new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const changeRows = (value, fn) => { const body = JSON.parse(value.sampleJson); fn(body.data); value.sampleJson = JSON.stringify(body); return value; };
const changeMeta = (value, fn) => { const body = JSON.parse(value.metadataJson); fn(body.data[0]); value.metadataJson = JSON.stringify(body); return value; };
async function collect(snapshot = fixture(), previous = null, responses = null, now = NOW) {
  const queue = responses ?? [json(snapshot.metadataJson), json(snapshot.sampleJson), json(snapshot.metadataJson)];
  const calls = [], starts = []; let tick = 0;
  const result = await runPilotCollection(contact, previous, { now: () => now, tick: () => tick,
    wait: async ms => { tick += ms; }, fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options }); starts.push(tick);
      const response = queue.shift(); if (response instanceof Error) throw response;
      if (!response) throw new Error('unexpected_request'); return response;
    } });
  return { ...result, calls, starts };
}
test('24 complete calendar months, exact scope, null/zero, duplicates and missing are enforced by unchanged validator', () => {
  const sample = fixture(), parsed = inspectPilotSnapshot(sample, NOW);
  assert.equal(parsed.summary.firstMonth, '2024-08'); assert.equal(parsed.summary.lastMonth, '2026-07');
  assert.equal(parsed.summary.globalCoverage, 'not_proven'); assert.equal(parsed.summary.observedCoverageComplete, true);
  assert.equal(inspectPilotSnapshot(changeRows(fixture(), r => { r[0].events = 0; }), NOW).summary.observedCoverageComplete, true);
  assert.equal(inspectPilotSnapshot(changeRows(fixture(), r => { r[0].events = null; }), NOW).summary.nullEventRows, 1);
  assert.equal(inspectPilotSnapshot(changeRows(fixture(), r => r.pop()), NOW).summary.missingCountryMonths, 1);
  assert.throws(() => inspectPilotSnapshot(changeRows(fixture(), r => r.push({ ...r[0], events: 99 })), NOW), /row_invalid/u);
  for (const field of ['admin_level', 'resource_hdx_id', 'event_type', 'reference_period_end']) {
    assert.throws(() => inspectPilotSnapshot(changeRows(fixture(), r => { r[0][field] = 'invalid'; }), NOW));
  }
  assert.throws(() => pilotMetadata(changeMeta(fixture(), r => { r.update_date = '2026-02-30'; }).metadataJson, NOW));
});
test('fixed three-request chain is bounded, paced and sanitized, with no declared global completeness', async () => {
  const result = await collect(fixture('2026-08-28', ['AAA', 'BBB']));
  assert.equal(result.report.status, 'candidate_ready'); assert.equal(result.report.requestCount, 3);
  assert.deepEqual(result.starts, [0, 1100, 2200]); assert.equal(result.report.coverage.returnedCountries, 2);
  const query = new URL(result.calls[1].url);
  assert.equal(query.searchParams.get('location_code'), null); assert.equal(query.searchParams.get('limit'), '10000');
  assert.equal(query.searchParams.get('start_date'), '2024-08-01'); assert.equal(query.searchParams.get('end_date'), '2026-07-31');
  for (const call of result.calls) { assert.equal(new URL(call.url).origin, 'https://hapi.humdata.org'); assert.equal(call.options.redirect, 'manual'); }
  for (const text of ['Synthetic country', 'test@example.invalid', 'AAA', ID, '"events"']) assert.ok(!JSON.stringify(result.report).includes(text));
});
test('metadata-only revalidates baseline, preserves data clock and reacts to changed HAPI sync', async () => {
  const old = fixture(), later = '2026-09-23T00:00:00.000Z';
  const result = await collect(old, old, [json(old.metadataJson)], later);
  assert.equal(result.report.status, 'metadata_only'); assert.equal(result.report.requestCount, 1);
  assert.equal(result.report.dataFetchedAt, NOW); assert.equal(result.report.metadataCheckedAt, later);
  const changed = changeMeta(fixture(), r => { r.hapi_updated_date = '2026-09-15T00:00:00'; });
  assert.equal((await collect(changed, old)).report.requestCount, 3);
  assert.equal((await collect(old, { ...old, sampleJson: 'bad' }, [])).calls.length, 0);
});
test('age, backwards versions, moving windows, changed values and disappearing coverage are separated', async () => {
  assert.equal((await collect(fixture(), null, null, '2026-10-20T00:00:00.000Z')).report.status, 'source_stale');
  const next = fixture('2026-09-04'), old = fixture();
  const moved = await collect(next, old); assert.equal(moved.report.comparison.addedMonths, 1); assert.equal(moved.report.comparison.removedMonths, 1);
  assert.equal((await collect(old, next)).report.reason, 'version_regression');
  const changed = changeMeta(changeRows(fixture(), r => { r[0].events = 99; }), r => { r.hapi_updated_date = '2026-09-15T00:00:00'; });
  const conflict = await collect(changed, old); assert.equal(conflict.report.reason, 'same_version_conflict'); assert.equal(conflict.report.paused, true);
  assert.equal((await collect(next, fixture('2026-08-28', ['AAA', 'BBB']))).report.reason, 'coverage_shrink');
  assert.equal((await collect(changeRows(next, r => r.pop()), old)).report.reason, 'coverage_incomplete');
});
test('metadata changes, truncated responses, raw row limits and aggregate bytes stop without retry', async () => {
  const value = fixture(), changed = changeMeta(fixture(), r => { r.hapi_updated_date = '2026-09-15T00:00:00'; });
  assert.equal((await collect(value, null, [json(value.metadataJson), json(value.sampleJson), json(changed.metadataJson)])).report.reason, 'metadata_changed');
  const excessive = JSON.parse(value.sampleJson).data[0];
  assert.equal((await collect(value, null, [json(value.metadataJson), json({ data: Array(10000).fill(excessive) })])).report.reason, 'sample_limit_or_empty');
  assert.equal((await collect(value, null, [json(value.metadataJson), json(value.sampleJson + ' '.repeat(PILOT.bytes))])).report.reason, 'byte_budget');
  assert.equal((await collect(value, null, [json('{')])).report.reason, 'json_invalid');
});
test('auth/rate responses pause while 500 and redirects never retry or follow', async () => {
  for (const code of [301, 403, 401, 429, 500]) {
    const result = await collect(undefined, null, [new Response('private response', { status: code })]);
    assert.equal(result.report.requestCount, 1); assert.equal(result.snapshot, null);
    assert.equal(result.report.paused, [401, 403, 429].includes(code)); assert.ok(!JSON.stringify(result.report).includes('private response'));
  }
});
test('fetch and stalled body obey full request deadlines even when abort is ignored', async () => {
  const common = { now: () => NOW, wait: async () => {} };
  const results = await Promise.all([
    runPilotCollection(contact, null, { ...common, fetchImpl: () => new Promise(() => {}) }),
    runPilotCollection(contact, null, { ...common, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }) })
  ]);
  for (const result of results) { assert.equal(result.report.reason, 'timeout'); assert.equal(result.report.requestCount, 1); }
});

const later = days => new Date(Date.parse(NOW) + days * 86400000).toISOString();
async function storeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-pilot-'));
  // Windows antivirus/indexers can briefly hold freshly written fixtures.
  // These retries only remove this test's mkdtemp directory, never API calls.
  return { root, dir: path.join(root, 'manual-artifacts', PILOT.id), cleanup: () => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) };
}
const stopped = (paused = false) => ({ report: { status: 'stopped', reason: 'synthetic_failure', requestCount: 1, totalBytes: 1, totalRows: 0, paused }, snapshot: null });
test('four immutable weekly attempts, replay refusal, no catch-up and unconditional expiry', async () => {
  const f = await storeFixture(); let calls = 0;
  try {
    const run = days => executePilotSlot(f.root, contact, { now: () => later(days), collect: async () => { calls++; return stopped(); } });
    assert.equal((await run(0)).slot, 0); assert.equal((await run(0)).status, 'not_due');
    assert.equal((await run(7)).slot, 1); assert.equal((await run(14)).slot, 2); assert.equal((await run(21)).slot, 3);
    assert.equal((await run(21)).status, 'finished'); assert.equal((await run(28)).status, 'finished'); assert.equal(calls, 4);
    assert.equal((await pilotStoreStatus(f.dir, later(28))).status, 'finished');
  } finally { await f.cleanup(); }
  const late = await storeFixture();
  try {
    await executePilotSlot(late.root, contact, { now: () => NOW, collect: async () => stopped() });
    assert.equal((await executePilotSlot(late.root, contact, { now: () => later(13), collect: async () => stopped() })).slot, 1);
    assert.equal((await executePilotSlot(late.root, contact, { now: () => later(14), collect: async () => { throw Error('should_not_run'); } })).status, 'not_due');
    assert.equal((await executePilotSlot(late.root, contact, { now: () => later(22), collect: async () => stopped() })).slot, 3);
    await assert.rejects(stat(path.join(late.dir, 'slot-2')), { code: 'ENOENT' });
  } finally { await late.cleanup(); }
});
test('paused, interrupted, corrupted and concurrently locked state cannot start another request', async () => {
  const f = await storeFixture();
  try {
    await executePilotSlot(f.root, contact, { now: () => NOW, collect: async () => stopped(true) });
    await assert.rejects(executePilotSlot(f.root, contact, { now: () => later(7) }), /pilot_paused/u);
    assert.equal((await pilotStoreStatus(f.dir, later(7))).status, 'paused');
  } finally { await f.cleanup(); }
  const interrupted = await storeFixture();
  try {
    await assert.rejects(executePilotSlot(interrupted.root, contact, { now: () => NOW, collect: async () => { throw Error('crash'); } }));
    await assert.rejects(executePilotSlot(interrupted.root, contact, { now: () => later(7) }), /incomplete_attempt/u);
    await mkdir(path.join(interrupted.dir, '.lock'));
    await assert.rejects(executePilotSlot(interrupted.root, contact, { now: () => later(7) }), { code: 'EEXIST' });
  } finally { await interrupted.cleanup(); }
});
test('stored snapshot is hash-verified before a metadata-only request; original files are preserved', async () => {
  const f = await storeFixture(), sample = fixture();
  try {
    const ready = await collect(sample);
    await executePilotSlot(f.root, contact, { now: () => NOW, collect: async () => ready });
    let loaded;
    await executePilotSlot(f.root, contact, { now: () => later(7), collect: async (_, previous) => { loaded = previous; return stopped(); } });
    assert.deepEqual(loaded, sample);
    await writeFile(path.join(f.dir, 'slot-0/sample.private.json'), 'bad');
    await assert.rejects(executePilotSlot(f.root, contact, { now: () => later(14) }), /artifact_hash/u);
  } finally { await f.cleanup(); }
});
test('storage pre-reservation and linked directory rejection happen before network', async () => {
  const f = await storeFixture();
  try {
    await mkdir(f.dir, { recursive: true }); await writeFile(path.join(f.dir, 'contact-source.json'), '{}');
    // Existing unrelated files are not deleted to make room.
    await executePilotSlot(f.root, contact, { now: () => NOW, collect: async () => stopped() });
    const large = path.join(f.dir, 'retained.private'); await writeFile(large, ''); await truncate(large, PILOT.storageBytes);
    await assert.rejects(executePilotSlot(f.root, contact, { now: () => later(7) }), /storage_budget/u);
    assert.equal((await stat(large)).size, PILOT.storageBytes);
  } finally { await f.cleanup(); }
  const links = await storeFixture(), outside = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-outside-'));
  try {
    await mkdir(path.join(outside, PILOT.id));
    await symlink(outside, path.join(links.root, 'manual-artifacts'), 'junction');
    await assert.rejects(executePilotSlot(links.root, contact), /unsafe_directory/u);
    assert.equal((await pilotStoreStatus(links.dir)).status, 'paused');
  }
  finally { await links.cleanup(); await rm(outside, { recursive: true, force: true }); }
});
test('CLI dry-run does not create state, and linked worktree is refused before credentials or requests', async () => {
  const f = await storeFixture();
  try {
    await mkdir(path.join(f.root, 'scripts/world-order'), { recursive: true });
    for (const file of ['run-acled-four-slot-pilot.mjs', 'world-order/acled-pilot.mjs', 'world-order/acled-pilot-store.mjs', 'world-order/acled-monthly-candidate.mjs']) {
      await writeFile(path.join(f.root, 'scripts', file), await readFile(new URL(`../../scripts/${file}`, import.meta.url)));
    }
    const cli = path.join(f.root, 'scripts/run-acled-four-slot-pilot.mjs');
    const dry = spawnSync(process.execPath, [cli], { encoding: 'utf8' }); assert.equal(dry.status, 0); assert.equal(JSON.parse(dry.stdout).networkRequests, 0);
    await assert.rejects(stat(f.dir), { code: 'ENOENT' });
    execFileSync('git', ['init', '--quiet'], { cwd: f.root });
    await writeFile(path.join(f.root, '.gitignore'), 'manual-artifacts/\n');
    execFileSync('git', ['add', '.'], { cwd: f.root });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: f.root });
    const linked = path.join(f.root, 'linked'); execFileSync('git', ['worktree', 'add', '--quiet', '-b', 'linked', linked], { cwd: f.root });
    const result = spawnSync(process.execPath, [path.join(linked, 'scripts/run-acled-four-slot-pilot.mjs'), '--live'], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).status, 'paused');
  } finally { await f.cleanup(); }
});
