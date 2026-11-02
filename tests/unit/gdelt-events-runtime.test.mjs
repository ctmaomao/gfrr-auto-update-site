import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { crc32, deflateRawSync } from 'node:zlib';
import { parseTimestamp, formatTimestamp } from '../../scripts/gdelt/events-candidate.mjs';
import { projectResearchFile, buildResearchDay, researchWindow } from '../../scripts/gdelt/events-research.mjs';
import { eventsSourceFromWindow, validateEventsSource, previousEventsSource } from '../../scripts/world-order/gdelt-events-score.mjs';
import { fetchGdeltEvents, EVENTS_CACHE_PATH, readEventsRuntimeCache, waitForEventsIndex } from '../../scripts/world-order/fetch-gdelt-events.mjs';
import { scoreWorldOrderStress } from '../../scripts/world-order/score-world-order-stress.mjs';

const nowMs = Date.parse('2026-10-08T01:00:00Z'), latestTimestamp = '20261008004500';
function row(timestamp) {
  const f = Array(61).fill('');
  f[0] = timestamp; f[1] = timestamp.slice(0, 8); f[25] = '1';
  f[26] = '190'; f[27] = '190'; f[28] = '19'; f[29] = '4'; f[53] = 'UP'; f[59] = timestamp;
  return f.join('\t');
}
function zip(timestamp) {
  const data = Buffer.from(row(timestamp)), name = Buffer.from(`${timestamp}.export.CSV`), compressed = deflateRawSync(data), crc = crc32(data);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(30 + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}
function dayArtifact(day) {
  const files = [], digests = [];
  for (let i = 0; i < 96; i++) {
    const timestamp = formatTimestamp(parseTimestamp(`${day}000000`) + i * 900000);
    files.push({ timestamp, projection: projectResearchFile(row(timestamp), timestamp) });
    digests.push({ timestamp, bytes: 100, sha256: 'a'.repeat(64) });
  }
  return buildResearchDay(day, files, { files: digests, acquiredAt: '2026-10-08T00:30:00Z' });
}
const days = new Map(Array.from({ length: 7 }, (_, i) => {
  const day = `2026100${i + 1}`; return [day, dayArtifact(day)];
}));
const window = researchWindow(days, '20261007');
const makeSource = () => eventsSourceFromWindow(window, { latestTimestamp, acquiredAt: '2026-10-08T00:30:00Z', nowMs });
function temporary(t, subset) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-events-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('gfrr-events-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const filename = path.join(root, EVENTS_CACHE_PATH);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (subset) fs.writeFileSync(filename, JSON.stringify({ schemaVersion: 'gdelt-events-runtime-cache-v1', days: [...subset.values()] }));
  return { root, filename };
}
const indexResponse = () => new Response(`100 ${'a'.repeat(32)} https://data.gdeltproject.org/gdeltv2/${latestTimestamp}.export.CSV.zip\n`);
const indexAt = timestamp => new Response(`100 ${'a'.repeat(32)} https://data.gdeltproject.org/gdeltv2/${timestamp}.export.CSV.zip\n`);

test('future index waits for real clock eligibility with one index GET and no cache rewrite', async t => {
  const { root, filename } = temporary(t, days), before = fs.readFileSync(filename);
  let clock = nowMs, requests = 0;
  const result = await fetchGdeltEvents({ config: { enabled: true }, root, now: () => clock,
    pause: async ms => { assert.ok(ms <= 30000); clock += ms; },
    fetchImpl: async url => { requests++; assert.ok(url.endsWith('lastupdate.txt')); return indexAt('20261008011500'); } });
  assert.equal(result.status, 'ok'); assert.equal(requests, 1);
  assert.equal(result.diagnostics.indexWaitMs, 15 * 60000);
  assert.equal(result.diagnostics.cacheWrites, 0);
  assert.equal(validateEventsSource(result, clock), 1);
  assert.deepEqual(fs.readFileSync(filename), before);
});

test('excessive future, stale index, stalled clock and total deadline remain hard holds', async () => {
  for (const [stamp, advance, started, expected] of [
    ['20261008013000', true, nowMs, /index_time_hold/],
    ['20261007210000', true, nowMs, /index_time_hold/],
    ['20261008011500', false, nowMs, /index_time_hold/],
    ['20261008011500', true, nowMs - 20 * 60000, /time_budget/]
  ]) {
    let clock = nowMs, requestedWait = 0;
    await assert.rejects(waitForEventsIndex(stamp, { started, now: () => clock, diagnostics: {},
      pause: async ms => { requestedWait += ms; if (advance) clock += ms; } }), expected);
    assert.ok(requestedWait <= 15 * 60000);
  }
});

test('index waiting across midnight selects the new latest complete UTC window', async t => {
  const { root, filename } = temporary(t, days);
  let clock = Date.parse('2026-10-08T23:59:00Z'), requests = 0;
  const result = await fetchGdeltEvents({ config: { enabled: true }, root, now: () => clock, pause: async ms => { clock += ms; },
    fetchImpl: async url => {
      requests++;
      if (url.endsWith('lastupdate.txt')) return indexAt('20261009000000');
      const stamp = url.match(/(\d{14})\.export/)[1]; assert.match(stamp, /^20261008/);
      return new Response(zip(stamp));
    } });
  assert.equal(result.status, 'ok'); assert.equal(result.summary.windowEndDay, '20261008');
  assert.equal(result.summary.downloadedFiles, 672); assert.equal(requests, 97);
  assert.equal(result.diagnostics.cachedDays, 6);
  assert.deepEqual([...readEventsRuntimeCache(filename, clock).keys()].sort(), ['20261002','20261003','20261004','20261005','20261006','20261007','20261008']);
});

test('a held refresh retains only completed days and resumes without downloading those days again', async t => {
  const { root, filename } = temporary(t, new Map([...days].slice(0, 5)));
  let requests = 0;
  const held = await fetchGdeltEvents({ config: { enabled: true }, previousSource: makeSource(), root, now: () => nowMs, pause: async () => {},
    fetchImpl: async url => {
      requests++;
      if (url.endsWith('lastupdate.txt')) return indexResponse();
      const stamp = url.match(/(\d{14})\.export/)[1];
      return stamp.startsWith('20261006') ? new Response(zip(stamp)) : new Response('', { status: 429 });
    } });
  assert.equal(held.status, 'stale'); assert.equal(requests, 100);
  assert.equal(held.diagnostics.cacheWrites, 1); assert.equal(held.diagnostics.failureReason, 'events_download_hold');
  assert.equal(held.lastFetchedAt, makeSource().lastFetchedAt);
  const saved = readEventsRuntimeCache(filename, nowMs);
  assert.equal(saved.size, 6); assert.ok(saved.has('20261006')); assert.equal(saved.has('20261007'), false);
  let resumedRequests = 0;
  const resumed = await fetchGdeltEvents({ config: { enabled: true }, root, now: () => nowMs, pause: async () => {},
    fetchImpl: async url => {
      resumedRequests++;
      if (url.endsWith('lastupdate.txt')) return indexResponse();
      const stamp = url.match(/(\d{14})\.export/)[1]; assert.match(stamp, /^20261007/);
      return new Response(zip(stamp));
    } });
  assert.equal(resumed.status, 'ok'); assert.equal(resumedRequests, 97);
  assert.equal(resumed.summary.downloadedFiles, 672);
});

test('failure diagnostics precede publication hold and cache save requires completed-day output outside source-free mode', () => {
  const builder = fs.readFileSync('scripts/build-world-order-stress.mjs', 'utf8');
  assert.ok(builder.indexOf('GDELT Events refresh:') < builder.indexOf('const scored = scoreWorldOrderStress'));
  assert.match(builder, /events_cache_updated=\$\{Boolean\(gdeltEvents\?\.diagnostics\?\.cacheWrites\)\}/u);
  const workflow = fs.readFileSync('.github/workflows/refresh-world-order-stress.yml', 'utf8');
  const save = workflow.split('- name: Save validated dedicated free Events cache')[1].split('- name:')[0];
  for (const condition of ['always()', "steps.world_order_refresh.outputs.events_cache_updated == 'true'", "inputs.acled_config_commit == ''", "inputs.acled_weekly_sha256 == ''", "inputs.acled_monthly_sha256 == ''"]) assert.ok(save.includes(condition));
  assert.ok(save.includes('path: .cache/gdelt-events-runtime/'));
});

test('clock regression cannot persist an otherwise complete day with invalid acquisition provenance', async t => {
  const { root, filename } = temporary(t, new Map([...days].slice(0, 6))), before = fs.readFileSync(filename);
  let clock = nowMs;
  const result = await fetchGdeltEvents({ config: { enabled: true }, root, now: () => clock, pause: async () => {},
    fetchImpl: async url => {
      if (url.endsWith('lastupdate.txt')) return indexResponse();
      const stamp = url.match(/(\d{14})\.export/)[1];
      if (stamp === '20261007234500') clock = Date.parse('2026-10-07T23:00:00Z');
      return new Response(zip(stamp));
    } });
  assert.equal(result.status, 'error'); assert.equal(result.diagnostics.failureReason, 'events_runtime_cache_day');
  assert.equal(result.diagnostics.cacheWrites, 0);
  assert.deepEqual(fs.readFileSync(filename), before);
});

test('complete interval publishes; ambiguity, unknown rounding, clock and confidence errors hold', () => {
  const source = makeSource(); assert.equal(validateEventsSource(source, nowMs), 1);
  for (const mutate of [s => { s.summary.downloadedFiles = 671; }, s => { s.summary.ambiguousIds = 1; },
    s => { s.summary.conflictingIds = 1; }, s => { s.confidence = NaN; },
    s => { s.summary.latestTimestamp = '20261008011500'; }, s => { s.summary.latestTimestamp = '20261007000000'; },
    s => { s.summary.channelScore = 99; }, s => { s.summary.strictQualification = false; }]) {
    const bad = structuredClone(source); mutate(bad); assert.throws(() => validateEventsSource(bad, nowMs));
  }
  const uncertain = structuredClone(window); uncertain.quarantinedRows = 5000; uncertain.statisticallyQualified = false;
  assert.throws(() => eventsSourceFromWindow(uncertain, { latestTimestamp, acquiredAt: source.lastFetchedAt, nowMs }), /interval_hold/);
  const bounded = structuredClone(window); bounded.quarantinedRows = 1; bounded.statisticallyQualified = false;
  const partial = eventsSourceFromWindow(bounded, { latestTimestamp, acquiredAt: source.lastFetchedAt, nowMs });
  assert.equal(partial.status, 'partial'); assert.equal(partial.summary.violenceUpper, 673); assert.equal(partial.summary.channelScore, 1);
  assert.throws(() => validateEventsSource(source, NaN), /time_hold/);
  const sampled = structuredClone(window); sampled.validSubsetCounts.violence = 51817;
  sampled.quarantinedRows = 2; sampled.statisticallyQualified = false;
  const counted = eventsSourceFromWindow(sampled, { latestTimestamp, acquiredAt: source.lastFetchedAt, nowMs });
  assert.equal(counted.summary.channelScore, 51); assert.equal(counted.summary.violenceUpper, 51819);
});
test('history keeps original dates/counts and confidence falls; expiry cannot turn into zero', () => {
  const source = makeSource(), later = nowMs + 86400000;
  const stale = previousEventsSource(source, 'events_http_429', later);
  assert.equal(stale.lastFetchedAt, source.lastFetchedAt); assert.equal(stale.summary.channelScore, source.summary.channelScore);
  assert.equal(stale.summary.windowEndDay, source.summary.windowEndDay); assert.equal(stale.confidence, 0.25);
  assert.throws(() => previousEventsSource(source, 'events_http_429', nowMs + 4 * 86400000));
});
test('incremental producer downloads exactly one missing day, then reuses cache without renewing acquisition', async t => {
  const { root, filename } = temporary(t, new Map([...days].slice(0, 6)));
  let requests = 0;
  const fetchImpl = async (url, options) => {
    requests++; assert.match(url, /^https:\/\/data\.gdeltproject\.org\/gdeltv2\//);
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.redirect, 'error');
    if (url.endsWith('lastupdate.txt')) return indexResponse();
    const timestamp = url.match(/(\d{14})\.export/)[1]; assert.match(timestamp, /^20261007/);
    return new Response(zip(timestamp));
  };
  const a = await fetchGdeltEvents({ config: { enabled: true }, root, fetchImpl, now: () => nowMs, pause: async () => {} });
  assert.equal(a.status, 'ok'); assert.equal(requests, 97); assert.equal(a.diagnostics.cachedDays, 6);
  assert.equal(readEventsRuntimeCache(filename, nowMs).size, 7);
  const b = await fetchGdeltEvents({ config: { enabled: true }, root, fetchImpl, now: () => nowMs, pause: async () => {} });
  assert.equal(b.status, 'ok'); assert.equal(requests, 98); assert.equal(b.lastFetchedAt, a.lastFetchedAt);
  assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), /https|Authorization|API_KEY/);
});
test('access errors have no retries, preserve cache; source-free ACLED refresh makes zero requests', async t => {
  const { root, filename } = temporary(t, days), before = fs.readFileSync(filename);
  for (const status of [403, 429, 500]) {
    let requests = 0;
    const result = await fetchGdeltEvents({ config: { enabled: true }, previousSource: makeSource(), root, now: () => nowMs,
      fetchImpl: async () => { requests++; return new Response('', { status }); } });
    assert.equal(requests, 1); assert.equal(result.status, 'stale'); assert.equal(result.lastFetchedAt, makeSource().lastFetchedAt);
    assert.deepEqual(fs.readFileSync(filename), before);
  }
  const result = await fetchGdeltEvents({ config: { enabled: true }, previousSource: makeSource(), allowNetwork: false,
    root, now: () => nowMs, fetchImpl: async () => assert.fail('ACLED refresh accessed Events network') });
  assert.equal(result.status, 'stale'); assert.equal(result.diagnostics.requests, 0);
  assert.deepEqual(fs.readFileSync(filename), before);
});
test('three export failures stop and never save partial cache; invalid cached provenance holds before HTTP', async t => {
  const { root, filename } = temporary(t);
  let requests = 0;
  const result = await fetchGdeltEvents({ config: { enabled: true }, root, now: () => nowMs, pause: async () => {},
    fetchImpl: async url => { requests++; return url.endsWith('lastupdate.txt') ? indexResponse() : new Response('', { status: 429 }); } });
  assert.equal(requests, 4); assert.equal(result.status, 'error'); assert.equal(fs.existsSync(filename), false);
  fs.writeFileSync(filename, JSON.stringify({ schemaVersion: 'gdelt-events-runtime-cache-v1', days: [{ ...days.values().next().value, digest: 'invalid' }] }));
  const bad = await fetchGdeltEvents({ config: { enabled: true }, root, now: () => nowMs,
    fetchImpl: async () => assert.fail('invalid cache should fail before HTTP') });
  assert.equal(bad.status, 'error'); assert.equal(bad.diagnostics.requests, 0);
});
test('runtime statistics change only the two conflict dimensions and hold before publication on source failure', () => {
  const world = JSON.parse(fs.readFileSync('data/world-order-stress.json'));
  const dataPayload = JSON.parse(fs.readFileSync('data/radar-data.json'));
  const rules = JSON.parse(fs.readFileSync('config/world-order-rules.json'));
  const input = { externalSources: world.externalSources, marketConfirmation: world.dimensions.marketConfirmation, dataPayload, rules, nowMs };
  const before = JSON.stringify(input);
  const legacy = scoreWorldOrderStress({ ...input, rules: { ...rules, gdeltEvents: { enabled: false } } });
  const current = scoreWorldOrderStress({ ...input, gdeltEvents: makeSource() });
  for (const key of ['blocFormation', 'economicWeaponization', 'capitalControlRisk', 'marketConfirmation']) {
    assert.deepEqual(current.dimensions[key], legacy.dimensions[key]);
  }
  for (const key of ['peaceDividendRetreat', 'multiTheaterConflict']) assert.notEqual(current.dimensions[key].score, legacy.dimensions[key].score);
  assert.notEqual(current.score, legacy.score); assert.ok(current.confidence <= 0.55);
  assert.equal(current.scoringModel.version, 'gdelt-events-conflict-interval-v1');
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => scoreWorldOrderStress(input), /publication_hold/);
  assert.throws(() => scoreWorldOrderStress({ ...input, gdeltEvents: { status: 'error' } }), /publication_hold/);
  const builder = fs.readFileSync('scripts/build-world-order-stress.mjs', 'utf8');
  assert.ok(builder.indexOf('const scored = scoreWorldOrderStress') < builder.indexOf('fs.writeFileSync(outputPath'));
  assert.match(builder, /ACLED_CONFIG_COMMIT.*ACLED_WEEKLY_SHA256.*ACLED_MONTHLY_SHA256/);
  assert.match(builder, /allowNetwork: !sourceFreeRefresh/);
});
test('published Events contract accepts certified source and rejects missing source or count tampering without writing data', () => {
  const bytes = fs.readFileSync('data/world-order-stress.json'), payload = JSON.parse(bytes);
  const source = makeSource();
  const result = scoreWorldOrderStress({ externalSources: payload.externalSources, marketConfirmation: payload.dimensions.marketConfirmation,
    dataPayload: JSON.parse(fs.readFileSync('data/radar-data.json')), rules: JSON.parse(fs.readFileSync('config/world-order-rules.json')),
    gdeltEvents: source, nowMs });
  const output = { ...payload, ...result, updatedAt: new Date(nowMs).toISOString(), externalSources: { ...payload.externalSources, gdeltEvents: source } };
  const child = `import fs from 'node:fs'; import path from 'node:path'; import { syncBuiltinESMExports } from 'node:module';
    const payload = fs.readFileSync(0, 'utf8'), read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) { return typeof file === 'string' && path.resolve(file) === path.resolve('data/world-order-stress.json')
      ? payload : read.call(this, file, ...args); };
    syncBuiltinESMExports(); await import('./scripts/check-world-order-stress.mjs');`;
  for (const mutation of ['none', 'missing', 'count']) {
    const input = structuredClone(output);
    if (mutation === 'missing') delete input.externalSources.gdeltEvents;
    if (mutation === 'count') input.externalSources.gdeltEvents.summary.violenceLower++;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', child], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true });
    assert.equal(run.status, mutation === 'none' ? 0 : 1, run.stdout + run.stderr);
  }
  assert.deepEqual(fs.readFileSync('data/world-order-stress.json'), bytes);
});
