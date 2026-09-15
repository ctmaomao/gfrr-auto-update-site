import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { acledHapiPlan, ACLED_HAPI_ATTEMPT, ACLED_HAPI_BUDGET,
  collectAcledHapiCandidate, validateAcledHapiInput } from '../../scripts/world-order/acled-hapi-collector.mjs';
import { reviewAcledMonthlyCandidate } from '../../scripts/world-order/acled-monthly-candidate.mjs';

// Synthetic observations only. NZL is used solely because this acceptance is
// fixed to that declared scope; neither these numbers nor names are ACLED data.
const NOW = '2026-09-16T00:00:00Z';
const ID = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const metadata = { data: [{ resource_hdx_id: ID, dataset_hdx_stub: 'political-violence-events-and-fatalities',
  dataset_hdx_provider_stub: 'acled', format: 'xlsx', name: 'political-violence-events-and-fatalities_as-of-2026-08-28.xlsx',
  update_date: '2026-09-03T10:29:54', hapi_updated_date: '2026-09-07T01:33:17.350664' }] };
const row = { location_code: 'NZL', location_name: 'Synthetic only', admin1_code: null, admin1_name: null,
  admin2_code: null, admin2_name: null, admin_level: 0, resource_hdx_id: ID, event_type: 'political_violence',
  events: 17, fatalities: 5, reference_period_start: '2026-07-01T00:00:00', reference_period_end: '2026-07-31T23:59:59' };
const input = () => ({ approval: ACLED_HAPI_ATTEMPT, application: 'Synthetic test', email: 'test@example.invalid', baseline: null });
const json = body => new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
async function run(responses = [json(metadata), json({ data: [row] }), json(metadata)], supplied = input()) {
  const calls = [], starts = [], waits = []; let elapsed = 0;
  const result = await collectAcledHapiCandidate(supplied, { now: () => NOW, tick: () => elapsed,
    wait: async ms => { waits.push(ms); elapsed += ms; }, fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options }); starts.push(elapsed);
      const response = responses[calls.length - 1];
      if (response instanceof Error) throw response;
      if (!response) throw new Error('unexpected_request');
      return response;
    } });
  return { ...result, calls, starts, waits };
}
const reject = (result, reason, calls) => {
  assert.equal(result.report.status, 'stopped'); assert.equal(result.report.reason, reason);
  assert.equal(result.privateCandidate, null); assert.equal(result.privateMetadataBefore, null);
  if (calls !== undefined) assert.equal(result.calls.length, calls);
};

test('three bounded fixed requests produce only a private candidate, reusable offline', async () => {
  const result = await run();
  assert.equal(result.report.status, 'candidate_ready'); assert.equal(result.report.requestCount, 3);
  assert.equal(result.report.totalRows, 3); assert.equal(result.report.metadataFence, 'stable_visible_metadata');
  assert.equal(result.report.atomicSnapshotProven, false); assert.equal(result.report.baselineUpdated, false);
  assert.deepEqual(result.starts, [0, 1100, 2200]);
  assert.equal(reviewAcledMonthlyCandidate({ current: result.privateCandidate, baseline: null }, { now: NOW }).status, 'review_only');
  for (const call of result.calls) {
    const url = new URL(call.url);
    assert.equal(url.origin, 'https://hapi.humdata.org'); assert.equal(call.options.redirect, 'manual');
    assert.equal(url.searchParams.get('offset'), '0'); assert.equal(url.searchParams.get('app_identifier'), null);
    assert.ok(call.options.headers['X-HDX-HAPI-APP-IDENTIFIER']);
  }
  const output = JSON.stringify(result.report);
  for (const text of ['Synthetic only', 'test@example.invalid', 'Synthetic test', '"events"', '"fatalities"', ID]) assert.ok(!output.includes(text));
});

test('bad approval/contact/baseline never starts a request', async () => {
  for (const bad of [{ ...input(), approval: 'another' }, { ...input(), email: 'x\r\ny' },
    { ...input(), application: 'a:b' }, { ...input(), extra: true }, { ...input(), baseline: {} }]) {
    reject(await run([], bad), 'input_invalid', 0);
  }
  const baseline = (await run()).privateCandidate;
  baseline.pin.countries = ['AAA']; assert.equal(validateAcledHapiInput({ ...input(), baseline }, NOW), false);
});

test('metadata identity/invalid dates stop before the sample; response schema is exact', async () => {
  for (const field of ['resource_hdx_id', 'dataset_hdx_stub', 'dataset_hdx_provider_stub', 'format', 'update_date']) {
    const changed = structuredClone(metadata); changed.data[0][field] = 'bad';
    reject(await run([json(changed)]), 'candidate_invalid', 1);
  }
  reject(await run([json({ data: [] })]), 'metadata_invalid', 1);
  reject(await run([json({ ...metadata, error: 'private raw error' })]), 'response_schema', 1);
});

test('every visible version field is fenced and a switched resource cannot pass', async () => {
  for (const [field, value] of [['name', 'political-violence-events-and-fatalities_as-of-2026-09-04.xlsx'],
    ['update_date', '2026-09-04T00:00:00'], ['hapi_updated_date', '2026-09-08T00:00:00']]) {
    const changed = structuredClone(metadata); changed.data[0][field] = value;
    if (field === 'name') changed.data[0].update_date = '2026-09-05T00:00:00';
    reject(await run([json(metadata), json({ data: [row] }), json(changed)]), 'metadata_changed', 3);
  }
  reject(await run([json(metadata), json({ data: [{ ...row, resource_hdx_id: 'wrong' }] })]), 'candidate_invalid', 2);
  const after = structuredClone(metadata); after.data[0].dataset_hdx_provider_stub = 'other';
  reject(await run([json(metadata), json({ data: [row] }), json(after)]), 'candidate_invalid', 3);
});

test('sample missing/null/limit hit are hold; conflicting duplicates are rejected', async () => {
  for (const rows of [[], [{ ...row, events: null }], Array(100).fill(row)]) {
    reject(await run([json(metadata), json({ data: rows })]), 'sample_incomplete', 2);
  }
  reject(await run([json(metadata), json({ data: [row, { ...row, events: 18 }] })]), 'candidate_invalid', 2);
  reject(await run([json(metadata), json({ data: Array(101).fill(row) })]), 'row_budget', 2);
  reject(await run([json({ data: [metadata.data[0], metadata.data[0]] })]), 'row_budget', 1);
});

test('HTTP failures and redirects are never followed or retried, errors stay sanitized', async () => {
  for (const status of [301, 302, 401, 403, 429, 500]) {
    reject(await run([new Response('private body', { status, headers: { location: 'https://example.invalid', 'retry-after': '1' } })]), 'http_failure', 1);
  }
  const result = await run([new Error('secret-url test@example.invalid')]);
  reject(result, 'request_or_local_failure', 1); assert.ok(!JSON.stringify(result.report).includes('secret-url'));
});

test('content type, invalid UTF8/JSON, declared and streamed cumulative byte limits', async () => {
  reject(await run([new Response('{}')]), 'content_type', 1);
  reject(await run([json('{')]), 'json_invalid', 1);
  reject(await run([new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } })]), 'json_invalid', 1);
  reject(await run([new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '1048577' } })]), 'byte_budget', 1);
  const largeMeta = JSON.stringify(metadata) + ' '.repeat(550000);
  const largeSample = JSON.stringify({ data: [row] }) + ' '.repeat(550000);
  reject(await run([json(largeMeta), json(largeSample)]), 'byte_budget', 2);
});

test('two snapshots compare without updating baseline; same-version mutations hold', async () => {
  const baseline = (await run()).privateCandidate, before = JSON.stringify(baseline);
  const result = await run(undefined, { ...input(), baseline });
  assert.equal(result.report.review.comparison.status, 'unchanged_saved_payload');
  assert.equal(JSON.stringify(baseline), before);
  reject(await run([json(metadata), json({ data: [{ ...row, events: 18 }] }), json(metadata)], { ...input(), baseline }), 'comparison_hold', 3);
});

test('deadline stops hung fetch and hung streaming body even if abort is ignored', async () => {
  const dependencies = { now: () => NOW, wait: async () => {} };
  const results = await Promise.all([
    collectAcledHapiCandidate(input(), { ...dependencies, fetchImpl: () => new Promise(() => {}) }),
    collectAcledHapiCandidate(input(), { ...dependencies, fetchImpl: async () => new Response(new ReadableStream({ start() {} }),
      { headers: { 'content-type': 'application/json' } }) })
  ]);
  for (const result of results) { reject(result, 'timeout'); assert.equal(result.report.requestCount, 1); }
});

function cliFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gfrr-acled-collector-'));
  mkdirSync(path.join(dir, 'scripts/world-order'), { recursive: true });
  for (const file of ['collect-acled-hapi-candidate.mjs', 'world-order/acled-hapi-collector.mjs', 'world-order/acled-monthly-candidate.mjs']) {
    writeFileSync(path.join(dir, 'scripts', file), readFileSync(new URL(`../../scripts/${file}`, import.meta.url)));
  }
  writeFileSync(path.join(dir, '.gitignore'), 'manual-artifacts/\n');
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  const mock = path.join(dir, 'mock.mjs');
  writeFileSync(mock, `const metadata=${JSON.stringify(metadata)}; const row=${JSON.stringify(row)};
    globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/metadata/')?metadata:{data:[row]}),{headers:{'content-type':'application/json'}});`);
  const runCli = (args = [], supplied = input()) => spawnSync(process.execPath,
    ['--import', pathToFileURL(mock).href, path.join(dir, 'scripts/collect-acled-hapi-candidate.mjs'), ...args],
    { cwd: dir, input: JSON.stringify(supplied), encoding: 'utf8', timeout: 15000 });
  return { dir, mock, runCli, attempt: path.join(dir, 'manual-artifacts/acled-hapi-collector', ACLED_HAPI_ATTEMPT) };
}

test('CLI defaults to dry-run; exclusive attempt refuses re-execution and preserves private output', () => {
  const fixture = cliFixture();
  try {
    const dry = fixture.runCli(); assert.equal(dry.status, 0, dry.stderr); assert.deepEqual(JSON.parse(dry.stdout), acledHapiPlan());
    assert.equal(existsSync(fixture.attempt), false);
    const live = fixture.runCli(['--live']); assert.equal(live.status, 0, live.stdout);
    assert.equal(JSON.parse(live.stdout).status, 'candidate_ready');
    const saved = readFileSync(path.join(fixture.attempt, 'candidate.private.json'), 'utf8');
    assert.equal(JSON.parse(saved).current.pin.countries[0], 'NZL');
    const again = fixture.runCli(['--live']); assert.equal(again.status, 1);
    assert.equal(readFileSync(path.join(fixture.attempt, 'candidate.private.json'), 'utf8'), saved);
    assert.ok(!live.stdout.includes('test@example.invalid')); assert.ok(!saved.includes('test@example.invalid'));
    assert.deepEqual(JSON.parse(readFileSync(path.join(fixture.attempt, 'attempt.json'))).budget, ACLED_HAPI_BUDGET);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('CLI rejects arbitrary paths/flags, pre-existing attempts and linked private directories', () => {
  const fixture = cliFixture(), outside = mkdtempSync(path.join(tmpdir(), 'gfrr-acled-outside-'));
  try {
    for (const args of [['--live', '--output', '../data'], ['--other']]) assert.equal(fixture.runCli(args).status, 1);
    symlinkSync(outside, path.join(fixture.dir, 'manual-artifacts'), 'junction');
    const result = fixture.runCli(['--live']); assert.equal(result.status, 1);
    assert.equal(existsSync(path.join(outside, 'acled-hapi-collector')), false);
    assert.ok(!result.stdout.includes(outside));
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('failed collection consumes its attempt and leaves no candidate; invalid stdin reserves nothing', () => {
  const fixture = cliFixture();
  try {
    assert.equal(fixture.runCli(['--live'], { ...input(), private: 'x'.repeat(4 * 1024 * 1024) }).status, 1);
    assert.equal(existsSync(fixture.attempt), false);
    writeFileSync(fixture.mock, 'globalThis.fetch=async()=>new Response("private response",{status:403});');
    const failed = fixture.runCli(['--live']);
    assert.equal(failed.status, 1); assert.equal(JSON.parse(failed.stdout).requestCount, 1);
    assert.ok(!failed.stdout.includes('private response'));
    const receipt = readFileSync(path.join(fixture.attempt, 'receipt.json'), 'utf8');
    assert.equal(existsSync(path.join(fixture.attempt, 'candidate.private.json')), false);
    assert.equal(fixture.runCli(['--live']).status, 1);
    assert.equal(readFileSync(path.join(fixture.attempt, 'receipt.json'), 'utf8'), receipt);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});
