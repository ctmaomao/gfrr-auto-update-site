import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ADMIN2, collectAdmin2, inspectAdmin2Snapshot } from '../../scripts/world-order/acled-admin2-collector.mjs';
import { runAdmin2Acceptance, reviewStoredAdmin2, readAdmin2CandidateForReview } from '../../scripts/world-order/acled-admin2-store.mjs';

const NOW = '2026-09-16T00:00:00.000Z', ID = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const contact = { application: 'Synthetic only', email: 'test@example.invalid' };
function fixture() {
  const metadataBefore = JSON.stringify({ data: [{ resource_hdx_id: ID, dataset_hdx_stub: 'political-violence-events-and-fatalities',
    dataset_hdx_provider_stub: 'acled', format: 'xlsx', name: 'political-violence-events-and-fatalities_as-of-2026-08-28.xlsx',
    update_date: '2026-09-03T10:29:54', hapi_updated_date: '2026-09-07T01:33:17' }] });
  const row = { location_code: 'AFG', location_name: 'Afghanistan', admin_level: 2, admin1_code: 'AF01', admin1_name: 'Synthetic province',
    admin2_code: 'AF0101', admin2_name: 'Synthetic district', resource_hdx_id: ID, event_type: 'political_violence', events: 0, fatalities: null,
    reference_period_start: '2025-01-01T00:00:00', reference_period_end: '2025-01-31T23:59:59' };
  return { metadataBefore, metadataAfter: metadataBefore, sampleJson: JSON.stringify({ data: [row] }), fetchedAt: NOW };
}
const response = text => new Response(text, { headers: { 'content-type': 'application/json' } });
async function collect(snapshot = fixture(), queue = null) {
  const responses = queue ?? [snapshot.metadataBefore, snapshot.sampleJson, snapshot.metadataAfter].map(response);
  const calls = []; let tick = 0;
  const result = await collectAdmin2(contact, { now: () => NOW, tick: () => tick, wait: async ms => { tick += ms; },
    fetchImpl: async (url, options) => { calls.push({ url: String(url), options, start: tick }); const next = responses.shift(); if (!next) throw Error('unexpected'); return next; } });
  return { ...result, calls };
}
function mutate(change) { const snapshot = fixture(), body = JSON.parse(snapshot.sampleJson); change(body.data); snapshot.sampleJson = JSON.stringify(body); return snapshot; }
test('fixed bounded three requests preserve zero and privacy without geographic or national claims', async () => {
  const result = await collect(); assert.equal(result.report.status, 'candidate_ready');
  assert.deepEqual(result.calls.map(c => c.start), [0, 1100, 2200]); assert.equal(result.report.totalRows, 3);
  const params = new URL(result.calls[1].url).searchParams;
  assert.equal(params.get('location_code'), 'AFG'); assert.equal(params.get('admin_level'), '2');
  assert.equal(params.get('start_date'), '2025-01-01'); assert.equal(params.get('end_date'), '2025-01-31');
  assert.equal(params.get('limit'), '1000'); assert.ok(result.calls.every(c => c.options.redirect === 'manual'));
  assert.equal(result.report.coverage.geographicCompleteness, 'not_proven'); assert.equal(result.report.coverage.nationalAggregation, 'not_performed');
  assert.equal(result.report.productionEligible, false);
  for (const raw of [contact.email, 'Synthetic district', 'AF0101', 'fatalities', Buffer.from(`${contact.application}:${contact.email}`).toString('base64')])
    assert.ok(!JSON.stringify(result.report).includes(raw));
});
test('scope, schema, counts, strict month and administrative identity errors stop before final request', async () => {
  for (const change of [r => r.location_code = 'NZL', r => r.admin_level = 0, r => r.event_type = 'demonstration', r => r.resource_hdx_id = 'wrong',
    r => r.admin1_code = null, r => r.admin2_name = '', r => r.admin2_code = 'x\n', r => r.admin1_name = 'x'.repeat(201),
    r => r.events = null, r => r.events = '', r => r.events = -1, r => r.fatalities = Number.MAX_SAFE_INTEGER + 1,
    r => r.reference_period_start = '2025-01-02T00:00:00', r => r.reference_period_end = '2025-02-01T00:00:00',
    r => r.reference_period_end = '2025-01-31T23:59:59.000001', r => r.extra = true]) {
    const result = await collect(mutate(rows => change(rows[0])));
    assert.equal(result.report.status, 'stopped'); assert.equal(result.calls.length, 2); assert.equal(result.snapshot, null);
  }
});
test('duplicate keys, cross-province district codes and same-code/name conflicts fail', async () => {
  for (const change of [r => ({ ...r }), r => ({ ...r, admin1_code: 'AF02', admin1_name: 'Other province' }),
    r => ({ ...r, admin2_code: 'AF0102', admin1_name: 'Other name', admin2_name: 'Other district' }),
    r => ({ ...r, admin2_code: 'AF0102' })]) {
    const result = await collect(mutate(rows => rows.push(change(rows[0]))));
    assert.equal(result.report.status, 'stopped'); assert.equal(result.calls.length, 2);
  }
});
test('metadata drift, stale or incomplete source, empty sample and exact limit remain holds', async () => {
  const snapshot = fixture(); snapshot.metadataAfter = snapshot.metadataAfter.replace('10:29:54', '10:29:55');
  assert.equal((await collect(snapshot)).report.reason, 'metadata_changed');
  for (const date of ['2025-01-31', '2026-06-01', '2026-12-01']) {
    const s = fixture(); s.metadataBefore = s.metadataBefore.replace('2026-08-28', date);
    const result = await collect(s); assert.equal(result.calls.length, 1); assert.equal(result.report.status, 'stopped');
  }
  for (const change of [rows => rows.splice(0), rows => rows.push(...Array(999).fill(rows[0]))])
    assert.equal((await collect(mutate(change))).report.reason, 'empty_or_limit_hit');
});
test('HTTP, redirects, cumulative bytes and invalid bodies never retry', async () => {
  for (const status of [301, 401, 403, 429, 500]) {
    const result = await collect(fixture(), [new Response('', { status })]);
    assert.equal(result.calls.length, 1); assert.equal(result.snapshot, null);
  }
  const snapshot = fixture(), padded = snapshot.sampleJson.padEnd(ADMIN2.bytes, ' ');
  assert.equal((await collect(snapshot, [response(snapshot.metadataBefore), response(padded)])).report.reason, 'byte_budget');
  const invalid = await collect(snapshot, [response(snapshot.metadataBefore), response('not json')]);
  assert.equal(invalid.report.reason, 'json_invalid'); assert.equal(invalid.calls.length, 2);
});
test('15-second budget covers ignored abort in both fetch and streamed body', async () => {
  const results = await Promise.all([
    collectAdmin2(contact, { now: () => NOW, fetchImpl: () => new Promise(() => {}) }),
    collectAdmin2(contact, { now: () => NOW, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }) })
  ]);
  assert.ok(results.every(r => r.report.reason === 'timeout' && r.report.requestCount === 1));
});
test('once storage, offline hashes, crash reservation and other candidates remain independent', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-admin2-'));
  try {
    const parent = path.join(root, 'manual-artifacts'); await mkdir(parent); await writeFile(path.join(parent, 'pilot-sentinel'), 'unchanged');
    const ready = await collect();
    assert.equal((await runAdmin2Acceptance(root, contact, { now: () => NOW, collect: async () => ready })).status, 'candidate_ready');
    assert.equal((await reviewStoredAdmin2(root, NOW)).status, 'saved_candidate_verified');
    assert.deepEqual(await readAdmin2CandidateForReview(root, NOW), ready.snapshot);
    assert.equal((await runAdmin2Acceptance(root, contact, { collect: () => { throw Error('must_not_run'); } })).networkRequests, 0);
    assert.equal(await readFile(path.join(parent, 'pilot-sentinel'), 'utf8'), 'unchanged');
    await writeFile(path.join(parent, ADMIN2.id, 'sample.private.json'), 'bad');
    await assert.rejects(reviewStoredAdmin2(root, NOW), /artifact_hash/u);
    await assert.rejects(readAdmin2CandidateForReview(root, NOW), /artifact_hash/u);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  const interrupted = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-admin2-crash-'));
  try {
    await mkdir(path.join(interrupted, 'manual-artifacts'));
    await assert.rejects(runAdmin2Acceptance(interrupted, contact, { now: () => NOW, collect: async () => { throw Error('crash'); } }));
    assert.equal((await runAdmin2Acceptance(interrupted, contact)).status, 'already_attempted');
  } finally { await rm(interrupted, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});
test('unsafe directories and forged snapshot reject; CLI default is dry and arbitrary flags fail', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gfrr-acled-admin2-path-'));
  try {
    const other = path.join(root, 'other'); await mkdir(other); await symlink(other, path.join(root, 'manual-artifacts'), 'junction');
    await assert.rejects(runAdmin2Acceptance(root, contact));
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  assert.throws(() => inspectAdmin2Snapshot({ ...fixture(), approved: true }, NOW));
  const dry = spawnSync(process.execPath, ['scripts/collect-acled-admin2.mjs'], { encoding: 'utf8' });
  assert.equal(dry.status, 0); assert.equal(JSON.parse(dry.stdout).networkRequests, 0);
  const bad = spawnSync(process.execPath, ['scripts/collect-acled-admin2.mjs', '--url', 'private'], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.equal(bad.stderr, ''); assert.ok(!bad.stdout.includes('private'));
});
