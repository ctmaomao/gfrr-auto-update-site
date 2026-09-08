import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { EPOCH_ARTIFACT_POLICY as p, artifactHash, packEpochArrArtifact, validateEpochArrArtifact, validateEpochArtifactMetadata, epochArtifactName } from '../../scripts/bubble-watch/epoch-arr-artifact.mjs';
import { retrieveEpochArrArtifact as retrieve, epochArtifactDiagnostic } from '../../scripts/bubble-watch/epoch-arr-artifact-reader.mjs';
import { readEpochArtifactZip } from '../../scripts/bubble-watch/epoch-arr-artifact-zip.mjs';

const sha = 'a'.repeat(40), now = '2026-09-08T12:00:00Z';
const producer = { runId: 41, runAttempt: 1, headSha: sha, createdAt: '2026-09-07T05:30:00Z' };
// Synthetic hash-only snapshot: no source data or network fixtures.
const snapshot = { schemaVersion: 'epoch-arr-revision-snapshot-v1', sourceKey: 'epoch_ai_company_revenue_candidate',
  sourceAuthenticity: 'unverified', productionEligible: false, fileHash: 'b'.repeat(64), totalRows: 0, excludedRows: 0, rows: [] };
function zip(payload, { method = 8, descriptor = false, trailing = false } = {}) {
  const data = Buffer.from(payload), name = Buffer.from(p.fileName), crc = crc32(data);
  const compressed = Buffer.concat([method === 0 ? data : deflateRawSync(data), trailing ? Buffer.from('trailer') : Buffer.alloc(0)]);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22), desc = Buffer.alloc(descriptor ? 16 : 0);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(descriptor ? 8 : 0, 6);
  local.writeUInt16LE(method, 8); local.writeUInt16LE(name.length, 26);
  if (!descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); }
  if (descriptor) { desc.writeUInt32LE(0x08074b50); desc.writeUInt32LE(crc, 4); desc.writeUInt32LE(compressed.length, 8); desc.writeUInt32LE(data.length, 12); }
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(descriptor ? 8 : 0, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + compressed.length + desc.length, 16);
  return Buffer.concat([local, name, compressed, desc, central, name, end]);
}
const payload = () => packEpochArrArtifact(snapshot, producer).payload;
function fixture() {
  const bytes = zip(payload());
  return {
    bytes,
    run: { id: 41, workflow_id: p.workflowId, path: p.workflowPath, head_branch: 'main', head_sha: sha,
      repository: { id: p.repositoryId, full_name: p.repository }, head_repository: { id: p.repositoryId, full_name: p.repository },
      event: 'schedule', run_attempt: 1, status: 'completed', conclusion: 'success', created_at: producer.createdAt },
    artifact: { id: 52, name: epochArtifactName(41), expired: false, size_in_bytes: bytes.length, digest: `sha256:${artifactHash(bytes)}`,
      created_at: '2026-09-07T05:31:00Z', expires_at: '2026-10-07T05:31:00Z',
      workflow_run: { id: 41, repository_id: p.repositoryId, head_repository_id: p.repositoryId, head_branch: 'main', head_sha: sha } },
    ancestry: { status: 'ahead', base_commit: { sha }, merge_base_commit: { sha } }
  };
}
const selection = { runId: 41, artifactId: 52, now, allowNetwork: true };
const blob = 'https://productionresultssa19.blob.core.windows.net/actions-results/object?sig=PRIVATE_SIGNED_URL';
function response(url, value, { status = 200, headers = {} } = {}) {
  const body = value === null ? null : Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  const result = new Response(body, { status, headers: { 'content-type': Buffer.isBuffer(value) ? 'application/zip' : 'application/json', ...headers } });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}
function transport(f = fixture(), intercept = () => null) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const custom = intercept(url, options, calls.length); if (custom) return custom;
    const values = [f.run, f.artifact, f.ancestry];
    if (calls.length <= 3) return response(url, values[calls.length - 1]);
    if (calls.length === 4) return response(url, null, { status: 302, headers: { location: blob } });
    if (calls.length === 5) return response(url, f.bytes);
    throw new Error('unexpected request');
  };
  return { fetchImpl, calls };
}

test('portable pack is hash-only, producer-bound and explicitly unauthenticated', () => {
  const pack = packEpochArrArtifact(snapshot, producer);
  assert.equal(pack.retentionDays, 30); assert.equal(pack.provenance, 'self_described_unverified');
  assert.equal(pack.productionEligible, false); assert.equal(pack.baselineUpdated, false);
  assert.deepEqual(validateEpochArrArtifact(Buffer.from(pack.payload), producer), snapshot);
  const reordered = Object.fromEntries(Object.entries(snapshot).reverse());
  assert.equal(JSON.parse(pack.payload).snapshotSha256, JSON.parse(packEpochArrArtifact(reordered, producer).payload).snapshotSha256);
  assert.throws(() => packEpochArrArtifact(snapshot, { ...producer, runAttempt: 2 }));
  assert.throws(() => packEpochArrArtifact(snapshot, { ...producer, headSha: [sha] }));
});

test('bundle rejects raw fields, forged hashes, wrong run identity, authority and malformed bytes', () => {
  const changes = [b => { b.raw = 'PRIVATE'; }, b => { b.repositoryId++; }, b => { b.workflowId++; },
    b => { b.producer.runId++; }, b => { b.producer.createdAt = '2026-09-06T05:30:00Z'; }, b => { b.snapshotSha256 = '0'.repeat(64); },
    b => { b.snapshot.productionEligible = true; }, b => { b.snapshot.notes = 'PRIVATE'; }];
  for (const change of changes) { const b = JSON.parse(payload()); change(b); assert.throws(() => validateEpochArrArtifact(Buffer.from(JSON.stringify(b)), producer)); }
  for (const bytes of [Buffer.from('bad'), Buffer.from([0xff]), Buffer.alloc(p.bytes + 1)]) assert.throws(() => validateEpochArrArtifact(bytes, producer));
});

test('ZIP accepts only the one exact regular file, stored/deflated and streaming descriptor variants', () => {
  for (const method of [0, 8]) for (const descriptor of [false, true]) assert.equal(readEpochArtifactZip(zip(payload(), { method, descriptor })).toString(), payload());
});

test('ZIP rejects traversal, symlinks, extra entries, encryption, ZIP64, corruption and expansion bombs', () => {
  const original = zip(payload()); const c = original.readUInt32LE(original.length - 6);
  for (const mutate of [b => b.writeUInt16LE(2, b.length - 12), b => b.writeUInt16LE(1, c + 8),
    b => b.writeUInt32LE(0xa0000000, c + 38), b => b.writeUInt32LE(0xffffffff, c + 24),
    b => b.writeUInt32LE(123, c + 16), b => b.writeUInt16LE(99, 8), b => b.writeUInt32LE(4, c + 42),
    b => b.write('../', 30), b => b.write('BAD', c + 46), b => b.writeUInt16LE(1, b.length - 18)]) {
    const b = Buffer.from(original); mutate(b); assert.throws(() => readEpochArtifactZip(b), /artifact_zip_invalid/u);
  }
  assert.throws(() => readEpochArtifactZip(Buffer.concat([original, Buffer.from('x')])));
  assert.throws(() => readEpochArtifactZip(zip('x'.repeat(p.bytes + 1))));
  assert.throws(() => readEpochArtifactZip(zip(payload(), { trailing: true })));
  assert.throws(() => readEpochArtifactZip(Buffer.alloc(p.zipBytes + 1)));
});

test('metadata binds repository/workflow/main/run/attempt/event/success and artifact ownership', () => {
  const mutations = [f => { f.run.repository.id++; }, f => { f.run.head_repository.id++; }, f => { f.run.path = 'other.yml'; },
    f => { f.run.workflow_id++; }, f => { f.run.head_branch = 'pr'; }, f => { f.run.event = 'pull_request_target'; },
    f => { f.run.run_attempt = 2; }, f => { f.run.conclusion = 'failure'; }, f => { f.artifact.id++; },
    f => { f.artifact.workflow_run.id++; }, f => { f.artifact.workflow_run.head_sha = 'c'.repeat(40); },
    f => { f.artifact.workflow_run.head_repository_id++; }, f => { f.artifact.name = 'latest'; }, f => { delete f.artifact.digest; }];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => validateEpochArtifactMetadata(f.run, f.artifact, selection)); }
  const f = fixture(); assert.deepEqual(validateEpochArtifactMetadata(f.run, f.artifact, selection), producer);
});

test('history retention is independent from observation freshness and rejects future/expired metadata', () => {
  for (const mutate of [f => { f.artifact.expired = true; }, f => { f.artifact.expires_at = now; },
    f => { f.run.created_at = '2026-08-01T00:00:00Z'; }, f => { f.run.created_at = '2026-09-09T00:00:00Z'; },
    f => { f.artifact.created_at = '2026-09-09T00:00:00Z'; }, f => { f.run.created_at = '2026-02-30T00:00:00Z'; }]) {
    const f = fixture(); mutate(f); assert.throws(() => validateEpochArtifactMetadata(f.run, f.artifact, selection));
  }
});

test('default retrieval plans without networking even when a token is supplied', async () => {
  const mock = transport(); const plan = await retrieve({ ...selection, allowNetwork: false, token: 'PRIVATE_TOKEN', fetchImpl: mock.fetchImpl });
  assert.equal(plan.status, 'dry_run_no_network'); assert.equal(mock.calls.length, 0);
  assert.ok(!JSON.stringify(plan).includes('PRIVATE')); assert.equal(plan.automaticSelection, false);
});

test('live adapter binds five bounded requests and never forwards auth to signed blob storage', async () => {
  const mock = transport(); const result = await retrieve({ ...selection, token: 'PRIVATE_TOKEN', fetchImpl: mock.fetchImpl });
  assert.equal(result.status, 'historical_candidate_ready'); assert.deepEqual(result.snapshot, snapshot);
  assert.equal(result.networkCalls, 5); assert.equal(result.receipt.provenance, 'github_api_bound');
  assert.equal(result.snapshot.sourceAuthenticity, 'unverified'); assert.equal(result.baselineUpdated, false);
  assert.equal(result.observationDatesRefreshed, false); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  for (const call of mock.calls) { assert.equal(call.options.redirect, 'manual'); assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.method, 'GET'); }
  assert.ok(mock.calls.slice(0, 4).every(c => c.url.startsWith('https://api.github.com/repos/ctmaomao/gfrr-auto-update-site/') && c.options.headers.Authorization === 'Bearer PRIVATE_TOKEN'));
  assert.deepEqual(mock.calls[4].options.headers, { Accept: 'application/zip' });
});

test('reject invalid ancestry, byte digests and even correctly digested forged bundles', async () => {
  for (const mutate of [f => { f.ancestry.status = 'diverged'; }, f => { f.ancestry.merge_base_commit.sha = 'c'.repeat(40); },
    f => { f.artifact.digest = `sha256:${'0'.repeat(64)}`; }, f => { f.artifact.size_in_bytes++; },
    f => { const b = JSON.parse(payload()); b.producer.runId++; f.bytes = zip(JSON.stringify(b)); f.artifact.size_in_bytes = f.bytes.length; f.artifact.digest = `sha256:${artifactHash(f.bytes)}`; }]) {
    const f = fixture(); mutate(f); const mock = transport(f);
    await assert.rejects(retrieve({ ...selection, fetchImpl: mock.fetchImpl })); assert.ok(mock.calls.length <= 5);
  }
});

test('redirect target is reclassified, not inherited from metadata, and cannot leak credentials', async () => {
  for (const location of ['http://productionresultssa19.blob.core.windows.net/x', 'https://evil.test/x',
    'https://productionresultssa19.blob.core.windows.net.evil.test/x', 'https://user@productionresultssa19.blob.core.windows.net/x',
    'https://productionresultssa19.blob.core.windows.net:444/x', 'https://productionresultssa19.blob.core.windows.net/x#f', '/relative']) {
    const mock = transport(fixture(), (url, _o, i) => i === 4 ? response(url, null, { status: 302, headers: { location } }) : null);
    await assert.rejects(retrieve({ ...selection, token: 'PRIVATE', fetchImpl: mock.fetchImpl }), /artifact_redirect_invalid/u);
    assert.equal(mock.calls.length, 4);
  }
});

test('missing artifacts and network errors stop without retry or a fake comparison baseline', async () => {
  for (const status of [403, 404, 410, 429, 500, 302]) {
    const mock = transport(fixture(), (url, _o, i) => i === 1 ? response(url, null, { status }) : null);
    await assert.rejects(retrieve({ ...selection, fetchImpl: mock.fetchImpl })); assert.equal(mock.calls.length, 1);
  }
  try { await retrieve({ ...selection, fetchImpl: async () => { throw new Error('PRIVATE_URL_AND_TOKEN'); } }); }
  catch (error) { assert.equal(epochArtifactDiagnostic(error), 'artifact_request_failed'); assert.ok(!error.message.includes('PRIVATE')); }
});

test('actual/declared body limits, URL and JSON content type are checked before accepting metadata', async () => {
  for (const makeResponse of [url => response(url, {}, { headers: { 'content-length': String(p.metadataBytes + 1) } }),
    url => response(url, {}, { headers: { 'content-type': 'text/html' } }), url => response(url + '/wrong', {}),
    url => response(url, { data: 'x'.repeat(p.metadataBytes) })]) {
    const mock = transport(fixture(), (url, _o, i) => i === 1 ? makeResponse(url) : null);
    await assert.rejects(retrieve({ ...selection, fetchImpl: mock.fetchImpl })); assert.equal(mock.calls.length, 1);
  }
});

test('shared deadline bounds uncooperative request/body and performs nonblocking cancellation', async () => {
  let cancelled = false;
  const fetchers = [async () => new Promise(() => {}), async url => ({ url, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
    body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => { cancelled = true; } }) } })];
  for (const fetchImpl of fetchers) await assert.rejects(retrieve({ ...selection, timeoutMs: 10, fetchImpl }), /artifact_timeout/u);
  assert.equal(cancelled, true);
});

test('CLI is offline by default, rejects arbitrary paths/URLs and emits no raw error text', () => {
  const cli = (args, input = '') => spawnSync(process.execPath, ['scripts/transfer-epoch-arr-artifact.mjs', ...args],
    { input, encoding: 'utf8', timeout: 5000, maxBuffer: 3 * 1024 * 1024 });
  const packed = cli(['--pack'], JSON.stringify({ snapshot, producer })); assert.equal(packed.status, 0, packed.stderr);
  assert.equal(JSON.parse(packed.stdout).status, 'artifact_pack_ready');
  const plan = cli(['--retrieve', '41', '52']); assert.equal(plan.status, 0); assert.equal(JSON.parse(plan.stdout).status, 'dry_run_no_network');
  for (const [args, input] of [[['--write'], ''], [['--retrieve', '41', '52', '--url', 'PRIVATE_URL'], ''],
    [['--pack'], 'PRIVATE_BAD_JSON'], [['--pack'], 'x'.repeat(p.bytes + 1)], [['--retrieve', '0', '52'], '']]) {
    const result = cli(args, input); assert.equal(result.status, 1); assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes('PRIVATE')); assert.equal(JSON.parse(result.stdout).baselineUpdated, false);
  }
});
