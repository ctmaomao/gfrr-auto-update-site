import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SCOPE, collectScope, inspectScopeSnapshot } from '../../scripts/world-order/acled-admin2-scope-collector.mjs';
import { compareScopeBaselines } from '../../scripts/world-order/acled-admin2-scope-review.mjs';
import { runScopeAcceptance, reviewStoredScope, readScopeCandidateForReview, reviewStoredScopeQuarantine } from '../../scripts/world-order/acled-admin2-scope-store.mjs';
import { reviewScopeQuarantine } from '../../scripts/world-order/acled-admin2-quarantine.mjs';
import { FORENSIC, runForensicAcceptance, reviewForensicEvidence } from '../../scripts/world-order/acled-admin2-forensic.mjs';

const NOW = '2026-09-16T00:00:00.000Z', ID = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const contact = { application: 'Synthetic only', email: 'test@example.invalid' };
function fixture() {
  const metadataBefore = JSON.stringify({ data: [{ resource_hdx_id: ID, dataset_hdx_stub: 'political-violence-events-and-fatalities',
    dataset_hdx_provider_stub: 'acled', format: 'xlsx', name: 'political-violence-events-and-fatalities_as-of-2026-08-28.xlsx',
    update_date: '2026-09-03T10:29:54', hapi_updated_date: '2026-09-07T01:33:17' }] });
  const row = { location_code: 'AFG', location_name: 'Afghanistan', admin_level: 2, admin1_code: '01', admin1_name: 'Province',
    admin2_code: '0101', admin2_name: 'District', resource_hdx_id: ID, event_type: 'political_violence', events: 0, fatalities: null,
    reference_period_start: '2025-01-01T00:00:00', reference_period_end: '2025-01-31T23:59:59' };
  const afg = { metadataBefore, metadataAfter: metadataBefore, fetchedAt: NOW, sampleJson: JSON.stringify({ data: [row] }) };
  const annual = { metadataBefore, metadataAfter: metadataBefore, fetchedAt: NOW,
    partitions: [2022, 2024].map(start => JSON.stringify({ data: Array.from({ length: 24 }, (_, i) => {
      const y = start + Math.floor(i / 12), m = i % 12 + 1, month = `${y}-${String(m).padStart(2, '0')}`;
      return { ...row, location_code: 'NGA', location_name: 'Nigeria', admin_level: 0, admin1_code: null, admin1_name: null,
        admin2_code: null, admin2_name: null, reference_period_start: `${month}-01T00:00:00`,
        reference_period_end: new Date(Date.UTC(y, m, 1) - 1000).toISOString().slice(0, 19) };
    }) })) };
  return { baselines: { annual, afg }, snapshot: { ...afg, sampleJson: JSON.stringify({ data: [row,
    { ...row, location_code: 'NGA', location_name: 'Nigeria' }] }) } };
}
const response = text => new Response(text, { headers: { 'content-type': 'application/json' } });
function mutate(f, fn) { const body = JSON.parse(f.snapshot.sampleJson); fn(body.data); f.snapshot.sampleJson = JSON.stringify(body); return f; }
async function collect(f = fixture(), queue = null) {
  const responses = queue ?? [f.snapshot.metadataBefore, f.snapshot.sampleJson, f.snapshot.metadataAfter].map(response);
  const calls = []; let tick = 0;
  const result = await collectScope(contact, f.baselines, { now: () => NOW, tick: () => tick, wait: async ms => { tick += ms; },
    fetchImpl: async (url, options) => { calls.push({ url: String(url), options, tick }); return responses.shift(); } });
  return { ...result, calls };
}
test('three fixed requests cover returned countries only and preserve cross-country code namespaces', async () => {
  const result = await collect(); assert.equal(result.report.status, 'candidate_ready'); assert.equal(result.report.totalRows, 4);
  assert.deepEqual(result.calls.map(c => c.tick), [0, 1100, 2200]);
  const params = new URL(result.calls[1].url).searchParams;
  assert.equal(params.has('location_code'), false); assert.equal(params.get('admin_level'), '2'); assert.equal(params.get('limit'), '10000');
  assert.equal(params.get('event_type'), 'political_violence'); assert.equal(params.get('start_date'), '2025-01-01');
  assert.equal(params.get('end_date'), '2025-01-31'); assert.ok(result.calls.every(c => c.options.redirect === 'manual'));
  assert.deepEqual(result.report.coverage.returnedCountryCodes, ['AFG', 'NGA']);
  assert.deepEqual(result.report.comparison.crossLayer.commonCountryCodes, ['NGA']);
  assert.equal(result.report.comparison.crossLayer.eventDuplication, 'not_tested');
  assert.equal(result.report.comparison.crossLayer.mutualExclusivity, 'not_proven');
  assert.equal(result.report.comparison.afg.status, 'same_version_rows_equal');
  assert.equal(result.report.productionEligible, false);
  for (const raw of [contact.email, 'District', '0101', 'fatalities']) assert.ok(!JSON.stringify(result.report).includes(raw));
});
test('not-returned and empty intersection are never global completeness or mutual exclusion', () => {
  const f = mutate(fixture(), r => r.pop()), result = compareScopeBaselines(f.snapshot, f.baselines, NOW);
  assert.ok(result.referenceLocations.notReturned.includes('NGA')); assert.equal(result.referenceLocations.absenceMeaning, 'not_proven');
  assert.deepEqual(result.crossLayer.commonCountryCodes, []); assert.equal(result.crossLayer.mutualExclusivity, 'not_proven');
  assert.equal(result.globalCoverage, 'not_proven');
});
test('AFG comparison is bidirectional and checks counts, null and administrative identity', async () => {
  for (const change of [r => r.shift(), r => { r[0].events++; }, r => { r[0].fatalities = 0; },
    r => { r[0].admin2_name = 'Changed'; }, r => r.push({ ...r[0], admin2_code: 'new', admin2_name: 'New' })]) {
    const result = await collect(mutate(fixture(), change));
    assert.equal(result.report.status, 'comparison_hold'); assert.equal(result.report.comparison.afg.status, 'same_version_conflict');
    assert.ok(result.snapshot); assert.equal(result.calls.length, 3);
  }
});
test('full version tuple, not as-of alone, gates each baseline comparison', () => {
  const f = fixture();
  f.snapshot.metadataBefore = f.snapshot.metadataBefore.replace('01:33:17', '01:33:18'); f.snapshot.metadataAfter = f.snapshot.metadataBefore;
  const result = compareScopeBaselines(f.snapshot, f.baselines, NOW);
  assert.equal(result.afg.status, 'indeterminate_version_mismatch');
  assert.equal(result.crossLayer.status, 'indeterminate_version_mismatch'); assert.equal('commonCountryCodes' in result.crossLayer, false);
});
test('invalid baselines stop before all network calls', async () => {
  for (const name of ['annual', 'afg']) { const f = fixture(); f.baselines[name] = null;
    const result = await collect(f); assert.equal(result.calls.length, 0); assert.equal(result.report.status, 'stopped'); }
});
test('schema, duplicate, country and local identity errors stop before final metadata', async () => {
  for (const change of [r => r.push(r[0]), r => { r[0].events = null; }, r => { r[0].location_code = 'bad'; },
    r => { r[0].admin_level = 0; }, r => { r[0].admin2_name = ''; }, r => { r[0].location_name = 'Nigeria'; },
    r => r.push({ ...r[0], admin2_code: 'other' }), r => { r[0].reference_period_end = '2025-01-31T00:00:00'; }]) {
    const result = await collect(mutate(fixture(), change)); assert.equal(result.report.status, 'stopped'); assert.equal(result.calls.length, 2);
  }
  const f = mutate(fixture(), r => r.push(...Array(9998).fill(r[0])));
  assert.equal((await collect(f)).report.reason, 'empty_or_limit_hit');
  assert.equal((await collect(mutate(fixture(), r => r.splice(0)))).report.reason, 'empty_or_limit_hit');
});
test('metadata drift, HTTP, redirect, invalid JSON and streamed byte overflow never retry', async () => {
  for (const status of [301, 401, 403, 429, 500]) assert.equal((await collect(fixture(), [new Response('', { status })])).calls.length, 1);
  const f = fixture(); f.snapshot.metadataAfter = f.snapshot.metadataAfter.replace('01:33:17', '01:33:18');
  assert.equal((await collect(f)).report.reason, 'metadata_changed');
  const g = fixture(); assert.equal((await collect(g, [response(g.snapshot.metadataBefore), response('invalid')])).report.reason, 'json_invalid');
  assert.equal((await collect(g, [response(g.snapshot.metadataBefore), response(g.snapshot.sampleJson.padEnd(SCOPE.bytes, ' '))])).report.reason, 'byte_budget');
});
test('whole-response deadline stops ignored abort in fetch and body', async () => {
  const { baselines } = fixture(); const results = await Promise.all([
    collectScope(contact, baselines, { now: () => NOW, fetchImpl: () => new Promise(() => {}) }),
    collectScope(contact, baselines, { now: () => NOW, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }) })
  ]); assert.ok(results.every(r => r.report.reason === 'timeout' && r.report.requestCount === 1));
});
test('independent once stores hash-checked evidence, failure also consumes attempt', async () => {
  for (const crash of [false, true]) {
    const root = await mkdtemp(path.join(tmpdir(), 'gfrr-scope-'));
    try {
      const parent = path.join(root, 'manual-artifacts'); await mkdir(parent); await writeFile(path.join(parent, 'sentinel'), 'unchanged');
      const f = fixture(), deps = { now: () => NOW, collect: async () => { if (crash) throw Error('crash'); return collect(f); } };
      if (crash) await assert.rejects(runScopeAcceptance(root, contact, f.baselines, deps));
      else {
        assert.equal((await runScopeAcceptance(root, contact, f.baselines, deps)).status, 'candidate_ready');
        assert.equal((await reviewStoredScope(root, f.baselines, NOW)).status, 'saved_candidate_verified');
        await writeFile(path.join(parent, SCOPE.id, 'sample.private.json'), 'bad');
        await assert.rejects(reviewStoredScope(root, f.baselines, NOW), /artifact_hash/u);
      }
      assert.equal((await runScopeAcceptance(root, contact, f.baselines, deps)).networkRequests, 0);
      assert.equal(await readFile(path.join(parent, 'sentinel'), 'utf8'), 'unchanged');
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  }
});
test('unsafe paths, forged snapshots and arbitrary CLI inputs fail; default does no I/O', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gfrr-scope-path-'));
  try {
    await mkdir(path.join(root, 'other')); await symlink(path.join(root, 'other'), path.join(root, 'manual-artifacts'), 'junction');
    await assert.rejects(runScopeAcceptance(root, contact, fixture().baselines));
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  assert.throws(() => inspectScopeSnapshot({ ...fixture().snapshot, approved: true }, NOW));
  const dry = spawnSync(process.execPath, ['scripts/collect-acled-admin2-scope.mjs'], { encoding: 'utf8' });
  assert.equal(dry.status, 0); assert.equal(JSON.parse(dry.stdout).networkRequests, 0);
  const bad = spawnSync(process.execPath, ['scripts/collect-acled-admin2-scope.mjs', '--url', 'private'], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.equal(bad.stderr, ''); assert.ok(!bad.stdout.includes('private'));
});

test('rejected duplicate response is quarantined, never repaired or returned as candidate', async () => {
  const result = await collect(mutate(fixture(), rows => rows.push(rows[0])));
  assert.equal(result.report.reason, 'duplicate_row'); assert.equal(result.report.status, 'stopped');
  assert.equal(result.snapshot, null); assert.equal(result.calls.length, 2);
  assert.ok(result.quarantine); const report = reviewScopeQuarantine(result.quarantine, NOW);
  assert.equal(report.identicalDuplicateKeys, 1); assert.equal(report.conflictingDuplicateKeys, 0);
  assert.equal(report.duplicateRows, 1); assert.equal(report.metadataFence, 'not_completed');
  assert.equal(report.productionEligible, false);
  for (const text of ['District', '0101', 'AFG', 'fatalities', contact.email]) assert.ok(!JSON.stringify(report).includes(text));
});
test('mixed variants classify the entire key as conflicting; invalid rows are separate', async () => {
  const f = mutate(fixture(), rows => rows.push(rows[0], { ...rows[0], fatalities: 0 }, { ...rows[0], events: null }));
  const result = await collect(f), report = reviewScopeQuarantine(result.quarantine, NOW);
  assert.equal(report.identicalDuplicateKeys, 0); assert.equal(report.conflictingDuplicateKeys, 1);
  assert.equal(report.duplicateRows, 2); assert.equal(report.invalidRows, 1); assert.equal(report.rawRows, 5);
  assert.equal(report.classificationScope, 'individually_valid_rows_only');
  assert.equal(report.crossRowIdentityConsistency, 'not_assessed');
});
test('limit-hit evidence remains quarantined; malformed, oversized and HTTP bodies are not saved', async () => {
  const full = await collect(mutate(fixture(), rows => rows.push(...Array(9998).fill(rows[0]))));
  assert.equal(full.report.reason, 'empty_or_limit_hit'); assert.equal(reviewScopeQuarantine(full.quarantine, NOW).limitHit, true);
  const f = fixture();
  for (const body of ['invalid', '{"other":[]}', f.snapshot.sampleJson.padEnd(SCOPE.bytes, ' ')]) {
    const result = await collect(f, [response(f.snapshot.metadataBefore), response(body)]);
    assert.equal(result.quarantine, undefined); assert.equal(result.snapshot, null);
  }
  const tooMany = await collect(mutate(fixture(), rows => rows.push(...Array(9999).fill(rows[0]))));
  assert.equal(tooMany.quarantine, undefined);
  assert.equal((await collect(f, [new Response('', { status: 403 })])).quarantine, undefined);
  const badUtf8 = await collect(f, [response(f.snapshot.metadataBefore), new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } })]);
  assert.equal(badUtf8.quarantine, undefined);
});
test('metadata-after mismatch is preserved without inventing a successful fence', async () => {
  const f = fixture(); f.snapshot.metadataAfter = f.snapshot.metadataAfter.replace('01:33:17', '01:33:18');
  const result = await collect(f);
  assert.equal(result.report.reason, 'metadata_changed'); assert.equal(result.snapshot, null);
  assert.equal(reviewScopeQuarantine(result.quarantine, NOW).metadataFence, 'mismatch');
  assert.equal(result.quarantine.metadataAfter, f.snapshot.metadataAfter);
  const http = await collect(fixture(), [response(f.snapshot.metadataBefore), response(f.snapshot.sampleJson), new Response('', { status: 500 })]);
  assert.equal(reviewScopeQuarantine(http.quarantine, NOW).metadataFence, 'not_completed');
});
test('quarantine archive hashes are checked and candidate reader rejects it; once is consumed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gfrr-quarantine-'));
  try {
    await mkdir(path.join(root, 'manual-artifacts'));
    const f = mutate(fixture(), rows => rows.push(rows[0])), ready = await collect(f);
    assert.equal((await runScopeAcceptance(root, contact, f.baselines, { now: () => NOW, collect: async () => ready })).status, 'stopped');
    const first = await reviewStoredScopeQuarantine(root, NOW); assert.equal(first.identicalDuplicateKeys, 1);
    await assert.rejects(readScopeCandidateForReview(root, NOW), /candidate_missing/u);
    const dir = path.join(root, 'manual-artifacts', SCOPE.id);
    await assert.rejects(readFile(path.join(dir, 'manifest.json')));
    await assert.rejects(readFile(path.join(dir, 'sample.private.json')));
    assert.equal((await runScopeAcceptance(root, contact, f.baselines)).networkRequests, 0);
    await writeFile(path.join(dir, 'quarantine-sample.private.json'), 'tampered');
    await assert.rejects(reviewStoredScopeQuarantine(root, NOW), /quarantine_hash/u);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});
test('quarantine rejects forged envelopes, future times and aggregate oversize', () => {
  const f = fixture(), q = { ...f.snapshot, metadataAfter: null };
  assert.throws(() => reviewScopeQuarantine({ ...q, approved: true }, NOW));
  assert.throws(() => reviewScopeQuarantine({ ...q, fetchedAt: '2027-01-01T00:00:00.000Z' }, NOW));
  assert.throws(() => reviewScopeQuarantine({ ...q, sampleJson: q.sampleJson.padEnd(SCOPE.bytes, ' ') }, NOW));
});

test('new approved forensic once is isolated and never stores candidate files, even on valid input', async () => {
  for (const duplicate of [false, true]) {
    const root = await mkdtemp(path.join(tmpdir(), 'gfrr-forensic-'));
    try {
      const parent = path.join(root, 'manual-artifacts'); await mkdir(parent); await mkdir(path.join(parent, SCOPE.id));
      await writeFile(path.join(parent, SCOPE.id, 'receipt.json'), 'old-spent-receipt');
      const f = fixture(); if (duplicate) mutate(f, rows => rows.push(rows[0]));
      const ready = await collect(f);
      const report = await runForensicAcceptance(root, contact, f.baselines, { now: () => NOW, collect: async () => ready });
      assert.equal(report.status, 'evidence_saved_not_candidate'); assert.equal(report.productionEligible, false);
      assert.equal(report.diagnostic.identicalDuplicateKeys, duplicate ? 1 : 0);
      assert.equal(report.collection.requestCount, duplicate ? 2 : 3);
      assert.deepEqual(await reviewForensicEvidence(root, NOW), report.diagnostic);
      await assert.rejects(readFile(path.join(parent, FORENSIC.id, 'manifest.json')));
      await assert.rejects(readFile(path.join(parent, FORENSIC.id, 'sample.private.json')));
      assert.equal(await readFile(path.join(parent, SCOPE.id, 'receipt.json'), 'utf8'), 'old-spent-receipt');
      assert.equal((await runForensicAcceptance(root, contact, f.baselines)).status, 'already_attempted');
      await writeFile(path.join(parent, FORENSIC.id, 'quarantine-sample.private.json'), 'bad');
      await assert.rejects(reviewForensicEvidence(root, NOW), /artifact_hash/u);
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  }
});
test('forensic failure consumes once and invalid baseline creates no attempt', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gfrr-forensic-fail-'));
  try {
    const parent = path.join(root, 'manual-artifacts'); await mkdir(parent); const f = fixture();
    await assert.rejects(runForensicAcceptance(root, contact, null));
    await assert.rejects(readFile(path.join(parent, FORENSIC.id, 'attempt.json')));
    const failed = await collect(f, [new Response('', { status: 403 })]);
    assert.equal((await runForensicAcceptance(root, contact, f.baselines, { now: () => NOW, collect: async () => failed })).status, 'stopped');
    await assert.rejects(reviewForensicEvidence(root, NOW), /evidence_missing/u);
    assert.equal((await runForensicAcceptance(root, contact, f.baselines)).networkRequests, 0);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});
test('identity diagnostics use exact connector patterns and retain unresolved projection duplicates', () => {
  const f = mutate(fixture(), rows => {
    const base = rows[0]; rows.splice(0);
    for (const codes of [{ admin1_code: 'AFG-XXX', admin2_code: 'AFG-XXX-XXX' },
      { admin1_code: '01', admin2_code: '01-XXX' }, { admin1_code: '999', admin2_code: '000' }]) {
      rows.push({ ...base, ...codes }, { ...base, ...codes, admin2_name: 'Different', events: 1 });
    }
    rows.push({ ...base, admin2_code: 'PRIVATE-CODE' }, { ...base, admin2_code: 'PRIVATE-CODE' });
    rows.push({ ...base, events: null });
  });
  const before = f.snapshot.sampleJson;
  const report = reviewScopeQuarantine(f.snapshot, NOW), d = report.identityDiagnostic;
  assert.deepEqual(d.rowPatterns, { countryConnector: 2, admin1Connector: 2, other: 4 });
  assert.deepEqual(d.conflictingGroupPatterns, { countryConnector: 1, admin1Connector: 1, other: 1 });
  assert.equal(d.nameKeyConflictingGroups, 0); assert.equal(d.nameKeyExtraRows, 1);
  assert.equal(report.invalidRows, 1); assert.equal(report.duplicateRows, 4);
  assert.equal(d.databaseIdentityReconstructed, false); assert.equal(d.deployedMappingVerified, false);
  assert.equal(d.deduplicationAllowed, false); assert.equal(d.aggregationAllowed, false);
  assert.equal(d.eventDisjointness, 'not_proven'); assert.equal(report.productionEligible, false);
  assert.equal(f.snapshot.sampleJson, before);
  for (const privateText of ['AFG', 'District', 'Different', '999', '000', 'PRIVATE-CODE']) assert.ok(!JSON.stringify(report).includes(privateText));
});

test('names do not conceal value conflicts or merge country namespaces', () => {
  const f = mutate(fixture(), rows => rows.push({ ...rows[0], fatalities: 0 }, rows[0]));
  const d = reviewScopeQuarantine(f.snapshot, NOW).identityDiagnostic;
  assert.equal(d.nameKeyConflictingGroups, 1); assert.equal(d.nameKeyExtraRows, 2);
  assert.deepEqual(d.conflictingGroupPatterns, { countryConnector: 0, admin1Connector: 0, other: 1 });
});

test('forensic CLI is dry by default, rejects overrides and preserves exact approved limits', () => {
  const dry = spawnSync(process.execPath, ['scripts/collect-acled-forensic.mjs'], { encoding: 'utf8' });
  assert.equal(dry.status, 0); const plan = JSON.parse(dry.stdout); assert.equal(plan.networkRequests, 0);
  assert.equal(plan.budget.id, 'acled-admin2-forensic-20260916');
  assert.equal(plan.budget.requests, 3); assert.equal(plan.budget.bytes, 8388608); assert.equal(plan.budget.rows, 10002);
  assert.equal(plan.budget.timeoutMs, 15000); assert.equal(plan.budget.spacingMs, 1100);
  const bad = spawnSync(process.execPath, ['scripts/collect-acled-forensic.mjs', '--id', 'private'], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.equal(bad.stderr, ''); assert.ok(!bad.stdout.includes('private'));
});
