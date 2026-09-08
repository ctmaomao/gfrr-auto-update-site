import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { crc32 } from 'node:zlib';
import { EPOCH_ARR_HEADERS } from '../../scripts/bubble-watch/epoch-arr-candidate.mjs';
import { EPOCH_ARR_CSV_URL } from '../../scripts/bubble-watch/epoch-arr-reader.mjs';
import { buildEpochArrSnapshot } from '../../scripts/bubble-watch/epoch-arr-snapshot.mjs';
import { EPOCH_ARTIFACT_POLICY as p, packEpochArrArtifact, artifactHash, validateEpochArrArtifact } from '../../scripts/bubble-watch/epoch-arr-artifact.mjs';
import { collectEpochWeeklyCandidate as collect, epochWeeklyContext } from '../../scripts/bubble-watch/epoch-arr-weekly.mjs';
import { discoverEpochWeeklyHistory as discover } from '../../scripts/bubble-watch/epoch-arr-weekly-history.mjs';

const now = '2026-09-14T06:00:00Z', sha = 'a'.repeat(40), oldSha = 'b'.repeat(40);
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: p.repository, GITHUB_REPOSITORY_ID: String(p.repositoryId),
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'schedule', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '99', GITHUB_SHA: sha,
  GITHUB_WORKFLOW_REF: `${p.repository}/${p.workflowPath}@refs/heads/main`, GITHUB_TOKEN: 'PRIVATE_GITHUB_TOKEN' };
const options = { allowNetwork: true, env, now };
const csv = (amount = '65000000000.0') => {
  const row = { Id: 'synthetic', Company: 'Anthropic', Date: '2026-07-31', Scope: 'Full company',
    'Annualized revenue (USD)': amount, 'Annualized revenue type': 'Annualized run rate', Confidence: 'Likely',
    'Report date': '2026-08-17', 'Source type': 'Company disclosure', 'Source 1': 'https://example.org/PRIVATE_SOURCE', Notes: 'PRIVATE_NOTES' };
  return [EPOCH_ARR_HEADERS, EPOCH_ARR_HEADERS.map(key => row[key] || '')].map(values => values.map(value => `"${value}"`).join(',')).join('\n');
};
// Minimal synthetic stored single-file ZIP, independent of filesystem extraction.
function zip(payload) {
  const data = Buffer.from(payload), name = Buffer.from(p.fileName), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}
function fixture() {
  const current = { id: 99, workflow_id: p.workflowId, path: p.workflowPath, repository: { id: p.repositoryId, full_name: p.repository },
    head_repository: { id: p.repositoryId, full_name: p.repository }, head_branch: 'main', head_sha: sha, event: 'schedule',
    run_attempt: 1, status: 'in_progress', conclusion: null, created_at: '2026-09-14T05:30:00Z' };
  const previous = { ...structuredClone(current), id: 41, head_sha: oldSha, status: 'completed', conclusion: 'success', created_at: '2026-09-07T05:30:00Z' };
  const producer = { runId: 41, runAttempt: 1, headSha: oldSha, createdAt: previous.created_at };
  const snapshot = buildEpochArrSnapshot(csv(), { asOfDate: '2026-09-07' }).snapshot;
  const bytes = zip(packEpochArrArtifact(snapshot, producer).payload);
  const artifact = { id: 52, name: 'epoch-arr-candidate-v1-41-1', expired: false, created_at: '2026-09-07T05:31:00Z',
    expires_at: '2026-10-07T05:31:00Z', size_in_bytes: bytes.length, digest: `sha256:${artifactHash(bytes)}`,
    workflow_run: { id: 41, repository_id: p.repositoryId, head_repository_id: p.repositoryId, head_branch: 'main', head_sha: oldSha } };
  return { current, previous, artifact, bytes, runs: { total_count: 1, workflow_runs: [previous] },
    artifacts: { total_count: 1, artifacts: [artifact] }, csv: csv() };
}
const blob = 'https://productionresultssa19.blob.core.windows.net/object?sig=PRIVATE_SIGNED_URL';
function response(url, body, type = 'application/json', status = 200, extra = {}) {
  const result = new Response(body, { status, headers: { 'content-type': type, ...extra } });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
function transport(f = fixture(), intercept = () => null) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts }); const custom = intercept(url, opts, calls.length); if (custom) return custom;
    if (url === EPOCH_ARR_CSV_URL) return response(url, f.csv, 'text/csv');
    if (url === blob) return response(url, f.bytes, 'application/zip');
    if (url.endsWith('/zip')) return response(url, null, 'application/json', 302, { location: blob });
    const value = url.includes('/compare/') ? { status: 'ahead', base_commit: { sha: oldSha }, merge_base_commit: { sha: oldSha } }
      : url.endsWith('/runs/99') ? f.current : url.endsWith('/runs/41') ? f.previous
        : url.includes('/workflows/') ? f.runs : url.includes('/runs/41/artifacts?') ? f.artifacts
          : url.endsWith('/artifacts/52') ? f.artifact : null;
    assert.notEqual(value, null, `unexpected fixed request: ${url}`);
    return response(url, JSON.stringify(value));
  };
  return { fetchImpl, calls };
}

test('default collector and discovery refuse all network; CLI dry-run has no runner requirements', async () => {
  let calls = 0;
  assert.equal((await collect({ fetchImpl: () => calls++ })).status, 'dry_run_no_network');
  await assert.rejects(discover({ fetchImpl: () => calls++ }), /weekly_network_not_authorized/u);
  assert.equal(calls, 0);
  const child = spawnSync(process.execPath, ['scripts/run-epoch-arr-weekly-candidate.mjs'], { encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 0); assert.equal(child.stderr, ''); assert.equal(JSON.parse(child.stdout).status, 'dry_run_no_network');
});

test('schedule/main/first-attempt and exact runner identity gate network before credentials are used', async () => {
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'false', GITHUB_REPOSITORY: 'other/repo', GITHUB_REPOSITORY_ID: '1',
    GITHUB_REF: 'refs/pull/1/merge', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '2', GITHUB_RUN_ID: '99x',
    GITHUB_SHA: 'bad', GITHUB_WORKFLOW_REF: `${p.repository}/${p.workflowPath}@refs/heads/topic` })) {
    let calls = 0;
    await assert.rejects(collect({ ...options, env: { ...env, [key]: value }, fetchImpl: () => calls++ }), /weekly_context_invalid/u);
    assert.equal(calls, 0);
  }
  assert.deepEqual(epochWeeklyContext(env), { runId: 99, headSha: sha });
});

test('full mocked nine-GET handoff compares unchanged hashes, authenticates producer, strips raw values and isolates token', async () => {
  const t = transport(), result = await collect({ ...options, ...t });
  assert.equal(result.summary.comparisonStatus, 'unchanged_file'); assert.equal(t.calls.length, 9);
  assert.equal(result.summary.networkCalls, 9); assert.equal(result.summary.historicalReceipt.provenance, 'github_api_bound');
  assert.equal(result.artifact.artifactName, 'epoch-arr-candidate-v1-99-1'); assert.equal(result.artifact.retentionDays, 30);
  assert.equal(validateEpochArrArtifact(Buffer.from(result.artifact.payload), { runId: 99, runAttempt: 1, headSha: sha, createdAt: '2026-09-14T05:30:00Z' }).productionEligible, false);
  for (const { url, opts } of t.calls) {
    assert.equal(opts.method, 'GET'); assert.equal(opts.credentials, 'omit');
    assert.equal(opts.headers.Authorization, url.startsWith('https://api.github.com/') ? 'Bearer PRIVATE_GITHUB_TOKEN' : undefined);
  }
  assert.equal(t.calls.filter(call => call.url === EPOCH_ARR_CSV_URL).length, 1);
  for (const secret of ['PRIVATE_NOTES', 'PRIVATE_SOURCE', 'PRIVATE_SIGNED_URL', 'PRIVATE_GITHUB_TOKEN', '65000000000', '2026-07-31']) assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(result.summary.baselineUpdated, false); assert.equal(result.summary.observationDatesRefreshed, false);
});

test('old-period amount revision stays review-required and reports changed field group without amounts', async () => {
  const f = fixture(); f.csv = csv('64000000000.0');
  const result = await collect({ ...options, ...transport(f) });
  assert.equal(result.summary.comparisonStatus, 'changed_review_required');
  assert.equal(result.summary.changeCounts.revision, 1); assert.deepEqual(result.summary.fieldGroupsChanged, ['amounts']);
  assert.equal(result.summary.productionEligible, false);
});

test('missing run, missing artifact and expired artifact create unapproved baseline-required candidate, never select older', async () => {
  for (const reason of ['history_missing', 'artifact_missing', 'history_expired']) {
    const f = fixture();
    if (reason === 'history_missing') f.runs = { total_count: 0, workflow_runs: [] };
    if (reason === 'artifact_missing') f.artifacts = { total_count: 0, artifacts: [] };
    if (reason === 'history_expired') f.artifact.expires_at = '2026-09-08T05:31:00Z';
    const t = transport(f), result = await collect({ ...options, ...t });
    assert.equal(result.summary.historyStatus, reason); assert.equal(result.summary.comparisonStatus, 'baseline_required');
    assert.equal(result.summary.historicalReceipt, null); assert.equal(result.summary.baselineUpdated, false);
    assert.equal(t.calls.length, reason === 'history_missing' ? 3 : 4);
  }
});

test('listing order is explicit and ties choose higher run id, not the first API entry', async () => {
  const f = fixture(); f.runs.workflow_runs.unshift({ ...structuredClone(f.previous), id: 40 }); f.runs.total_count = 2;
  const result = await collect({ ...options, ...transport(f) });
  assert.equal(result.summary.historicalReceipt.runId, 41);
});

test('truncated/duplicate/future/malformed listings fail closed before source, never broad pagination', async () => {
  for (const mutate of [
    f => { f.runs.total_count = 101; },
    f => { f.runs.workflow_runs.push(f.previous); f.runs.total_count = 2; },
    f => { f.previous.created_at = now; },
    f => { f.previous.run_attempt = 2; },
    f => { f.previous.head_repository.id = 1; },
    f => { f.artifacts.total_count = 101; },
    f => { f.artifact.workflow_run.head_sha = sha; },
    f => { f.artifact.name = 'epoch-arr-candidate-v1-40-1'; },
    f => { f.artifacts.artifacts.push(f.artifact); f.artifacts.total_count = 2; }
  ]) {
    const f = fixture(); mutate(f); const t = transport(f);
    await assert.rejects(collect({ ...options, ...t }), /weekly_history_invalid/u);
    assert.ok(t.calls.length <= 3); assert.ok(t.calls.every(call => call.url !== EPOCH_ARR_CSV_URL));
  }
});

test('current API identity mismatches runner binding fail on first GET', async () => {
  for (const mutate of [f => { f.current.id = 100; }, f => { f.current.head_sha = oldSha; }, f => { f.current.workflow_id = 1; },
    f => { f.current.path = 'other.yml'; }, f => { f.current.status = 'completed'; }, f => { f.current.created_at = '2026-09-15T05:30:00Z'; }]) {
    const f = fixture(); mutate(f); const t = transport(f);
    await assert.rejects(collect({ ...options, ...t }), /weekly_history_invalid/u); assert.equal(t.calls.length, 1);
  }
});

test('selected artifact corruption or unauthorized ancestry stops without source fetch or fallback', async () => {
  for (const alter of ['digest', 'ancestry']) {
    const f = fixture(); if (alter === 'digest') f.artifact.digest = `sha256:${'0'.repeat(64)}`;
    const t = transport(f, url => alter === 'ancestry' && url.includes('/compare/') ? response(url, '{"status":"diverged"}') : null);
    await assert.rejects(collect({ ...options, ...t }), /weekly_artifact_(digest_mismatch|main_ancestry_invalid)/u);
    assert.ok(t.calls.every(call => call.url !== EPOCH_ARR_CSV_URL));
  }
});

test('metadata HTTP, redirect, type, length, body and malformed JSON errors are bounded and sanitized', async () => {
  for (const make of [
    url => response(url, 'PRIVATE_ERROR', 'text/html', 403),
    url => response(url, null, 'application/json', 302, { location: 'https://example.org/PRIVATE_URL' }),
    url => response(url, '{}', 'text/plain'),
    url => response(url, '{}', 'application/json', 200, { 'content-length': String(p.metadataBytes + 1) }),
    url => response(url, 'x'.repeat(p.metadataBytes + 1)),
    url => response(url, 'PRIVATE_INVALID_JSON'),
    url => { const r = response(url, '{}'); Object.defineProperty(r, 'url', { value: 'https://example.org' }); return r; }
  ]) {
    const t = transport(fixture(), url => make(url));
    await assert.rejects(collect({ ...options, ...t }), /^Error: weekly_history_invalid$/u); assert.equal(t.calls.length, 1);
  }
});

test('metadata deadline bounds stalled request and stalled body even if cleanup never resolves', async () => {
  for (const stalledBody of [false, true]) {
    let calls = 0, signal, cancelled = false;
    const fetchImpl = (url, opts) => {
      calls++; signal = opts.signal;
      if (!stalledBody) return new Promise(() => {});
      const body = { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => { cancelled = true; return new Promise(() => {}); } }) };
      return { url, status: 200, redirected: false, headers: new Headers({ 'content-type': 'application/json' }), body };
    };
    await assert.rejects(collect({ ...options, timeoutMs: 10, fetchImpl }), /weekly_history_timeout/u);
    assert.equal(calls, 1); assert.equal(signal.aborted, true); if (stalledBody) assert.equal(cancelled, true);
  }
});

test('source failure never produces upload payload or retries and does not leak raw CSV/error', async () => {
  const f = fixture(); f.runs = { total_count: 0, workflow_runs: [] };
  const t = transport(f, url => url === EPOCH_ARR_CSV_URL ? response(url, 'PRIVATE_ERROR', 'text/html', 500) : null);
  await assert.rejects(collect({ ...options, ...t }), /^Error: weekly_source_http_status$/u);
  assert.equal(t.calls.length, 3);
});

test('workflow isolates candidate permissions, schedule and successful upload from unchanged production job', () => {
  const workflow = readFileSync('.github/workflows/refresh-bubble-watch.yml', 'utf8').replaceAll('\r\n', '\n');
  const candidate = workflow.split('  epoch-candidate:\n')[1].split('\n  refresh:')[0];
  for (const marker of ["github.event_name == 'schedule'", 'github.run_attempt == 1', "github.ref == 'refs/heads/main'",
    'contents: read', 'actions: read', 'persist-credentials: false', 'ref: ${{ github.sha }}',
    'timeout-minutes: 5', 'node-version: 24', 'GITHUB_TOKEN: ${{ github.token }}',
    'if node scripts/run-epoch-arr-weekly-candidate.mjs --allow-network; then', 'no candidate will be uploaded.',
    "success() && steps.epoch.outputs.candidate_ready == 'true' && steps.epoch.outputs.artifact_path != ''",
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', 'retention-days: 30', 'if-no-files-found: error', 'overwrite: false']) assert.ok(candidate.includes(marker), marker);
  for (const forbidden of ['secrets.', 'contents: write', 'actions: write', 'npm ci', 'git push', 'git add', 'build:bubble-watch', 'needs:', 'always()', 'continue-on-error:']) assert.ok(!candidate.includes(forbidden), forbidden);
  assert.match(candidate, /if node scripts\/run-epoch-arr-weekly-candidate\.mjs --allow-network; then\n\s+echo 'candidate_ready=true' >> "\$GITHUB_OUTPUT"/u);
  assert.equal((candidate.match(/candidate_ready=true/gu) || []).length, 1);
  assert.equal((workflow.match(/cron:/gu) || []).length, 1); assert.ok(workflow.includes("cron: '30 5 * * 1'"));
  // Freeze only this integration's existing production job, normalized to LF.
  // Baseline d3568a8f; a later production-job change requires separate review.
  // No runtime git-history dependency (shallow checkout/source ZIP also works).
  assert.equal(artifactHash(workflow.split('\n  refresh:')[1]), 'b1262782f9934962cfea3392daa3d1cae52ccf93980956793077c4f5931db3cb');
});

test('CLI rejects path, write and manual context arguments before live work with static diagnostics', () => {
  for (const args of [['--output', 'PRIVATE_PATH'], ['--allow-network'], ['--allow-network', '--write']]) {
    const child = spawnSync(process.execPath, ['scripts/run-epoch-arr-weekly-candidate.mjs', ...args],
      { encoding: 'utf8', windowsHide: true, env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch' } });
    assert.equal(child.status, 1); assert.equal(child.stderr, ''); assert.ok(!child.stdout.includes('PRIVATE_PATH'));
    assert.equal(JSON.parse(child.stdout).productionEligible, false);
  }
});

function runnerWorkspace(t) {
  const parent = resolve(tmpdir()), root = mkdtempSync(join(parent, 'gfrr-epoch-weekly-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), parent);
    assert.ok(resolve(root).startsWith(`${parent}${sep}gfrr-epoch-weekly-test-`));
    rmSync(root, { recursive: true, force: true });
  });
  const output = join(root, 'output'), summary = join(root, 'summary');
  writeFileSync(output, ''); writeFileSync(summary, '');
  return { root, output, summary };
}
function runMockedCli(files, fault = '') {
  const f = fixture();
  f.current.created_at = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const cliUrl = pathToFileURL(resolve('scripts/run-epoch-arr-weekly-candidate.mjs')).href;
  // Test-only child replaces fetch and, for fault coverage, one filesystem
  // builtin before importing the real CLI. No injection hooks in production.
  const source = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++; if (calls > 3) throw new Error('unexpected request');
      const csv = url === ${JSON.stringify(EPOCH_ARR_CSV_URL)};
      const body = csv ? ${JSON.stringify(f.csv)} : JSON.stringify(url.endsWith('/runs/99') ? ${JSON.stringify(f.current)} : {total_count:0,workflow_runs:[]});
      const response = new Response(body, {headers:{'content-type':csv?'text/csv':'application/json'}});
      Object.defineProperty(response,'url',{value:url}); return response;
    };
    const fault = ${JSON.stringify(fault)};
    const realAppend = fs.appendFileSync;
    if (fault === 'command') fs.appendFileSync = () => { throw new Error('PRIVATE_COMMAND_FILE_FAILURE'); };
    if (fault === 'partial-output') fs.appendFileSync = (path, data) => {
      if (path !== process.env.GITHUB_OUTPUT) return realAppend(path, data);
      realAppend(path, data.split('\\n')[0] + '\\n'); throw new Error('PRIVATE_PARTIAL_OUTPUT_FAILURE');
    };
    if (fault === 'payload') fs.writeFileSync = () => { throw new Error('PRIVATE_PAYLOAD_FAILURE'); };
    syncBuiltinESMExports();
    process.argv = [process.execPath, 'scripts/run-epoch-arr-weekly-candidate.mjs', '--allow-network'];
    await import(${JSON.stringify(cliUrl)});
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...process.env, ...env, RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', RUNNER_TEMP: files.root,
      GITHUB_OUTPUT: files.output, GITHUB_STEP_SUMMARY: files.summary } });
}

test('real CLI writes only the hash-only payload into fresh runner temp and exposes successful upload outputs', t => {
  const files = runnerWorkspace(t), child = runMockedCli(files);
  assert.equal(child.status, 0); assert.equal(child.stderr, '');
  const result = JSON.parse(child.stdout); assert.equal(result.status, 'candidate_artifact_ready');
  assert.equal(result.comparisonStatus, 'baseline_required'); assert.equal(result.networkCalls, 3);
  const directory = join(files.root, 'epoch-arr-candidate-99-1'), path = join(directory, p.fileName);
  assert.deepEqual(readdirSync(directory), [p.fileName]);
  const bytes = readFileSync(path), bundle = JSON.parse(bytes);
  assert.equal(bundle.schemaVersion, 'epoch-arr-artifact-v1'); assert.equal(bundle.payload, undefined);
  assert.equal(validateEpochArrArtifact(bytes, bundle.producer).productionEligible, false);
  assert.equal(readFileSync(files.output, 'utf8'), `artifact_path=${path}\nartifact_name=epoch-arr-candidate-v1-99-1\n`);
  for (const text of [bytes.toString(), child.stdout, readFileSync(files.summary, 'utf8')]) {
    for (const privateValue of ['PRIVATE_NOTES', 'PRIVATE_SOURCE', 'PRIVATE_GITHUB_TOKEN', '65000000000']) assert.ok(!text.includes(privateValue));
  }
});

test('CLI failures cannot authorize upload even with partial command-file output; existing paths never overwritten', t => {
  for (const fault of ['payload', 'command', 'existing', 'partial-output']) {
    const files = runnerWorkspace(t), directory = join(files.root, 'epoch-arr-candidate-99-1');
    if (fault === 'existing') { mkdirSync(directory); writeFileSync(join(directory, p.fileName), 'OLD_EVIDENCE'); }
    const child = runMockedCli(files, fault);
    assert.equal(child.status, 1); assert.equal(child.stderr, '');
    assert.equal(JSON.parse(child.stdout).code, 'weekly_candidate_failed'); assert.ok(!child.stdout.includes('PRIVATE_'));
    const outputs = readFileSync(files.output, 'utf8');
    if (fault === 'partial-output') {
      assert.ok(outputs.startsWith('artifact_path=')); assert.ok(!outputs.includes('candidate_ready=true'));
    } else assert.equal(outputs, '');
    if (fault === 'existing') assert.equal(readFileSync(join(directory, p.fileName), 'utf8'), 'OLD_EVIDENCE');
  }
});
