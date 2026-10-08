import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { crc32, deflateRawSync } from 'node:zlib';
import { parseTimestamp, planEventsWindow, parseEventsTsv, aggregateEventsFiles } from '../../scripts/gdelt/events-candidate.mjs';
import { readEventsZip } from '../../scripts/gdelt/events-zip.mjs';
import { downloadEventsResource, parseLatestEventsTimestamp } from '../../scripts/gdelt/events-download.mjs';

const nowMs = Date.parse('2026-10-08T01:00:00Z'), stamp = '20261007234500';
function row({ id = '42', quad = '4', country = 'UP', day = '20261007', added = stamp, rootCode = '19' } = {}) {
  const f = Array(61).fill('');
  f[0] = id; f[1] = day; f[25] = '1'; f[26] = '190'; f[27] = '190'; f[28] = rootCode; f[29] = quad;
  f[37] = 'US'; f[45] = 'RS'; f[53] = country; f[59] = added; f[60] = 'https://private.example/SENTINEL';
  return f.join('\t');
}
function zip(text, name = `${stamp}.export.CSV`) {
  const data = Buffer.from(text), fileName = Buffer.from(name), compressed = deflateRawSync(data), crc = crc32(data);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + fileName.length, 12); end.writeUInt32LE(30 + fileName.length + compressed.length, 16);
  return Buffer.concat([local, fileName, compressed, central, fileName, end]);
}
test('strict V2 projection uses ActionGeo country, separates conflict classes, drops URL and actor fields', () => {
  const records = parseEventsTsv(row(), stamp);
  assert.deepEqual(records, [{ id: '42', eventDay: '20261007', country: 'UP', quadClass: 4, rootCode: '19' }]);
  assert.doesNotMatch(JSON.stringify(records), /SENTINEL|https|US|RS/);
  assert.equal(parseEventsTsv('', stamp).length, 0);
  assert.equal(parseEventsTsv(row({ country: '' }), stamp)[0].country, null);
  for (const malformed of [row({ rootCode: '--', quad: '3' }), row({ quad: '0' }), row({ added: '20261007233000' }), row({ day: '20261008' }), row({ day: '20260230' }), `${row()}\textra`]) {
    assert.throws(() => parseEventsTsv(malformed, stamp));
  }
});
test('window covers seven complete UTC days and rejects impossible dates, future or non-quarter anchors', () => {
  const w = planEventsWindow(nowMs);
  assert.equal(w.start, '20261001000000'); assert.equal(w.end, stamp); assert.equal(w.timestamps.length, 672);
  assert.equal(w.completeUtcDays, true);
  for (const bad of ['20260230000000', '20261008010000', '20261007234600']) assert.throws(() => planEventsWindow(nowMs, bad));
  assert.throws(() => parseTimestamp('20261007246000'));
});
test('partial data never supplies a seven-day count; duplicates, old occurrences and unknown countries are disclosed', () => {
  const w = planEventsWindow(nowMs);
  const records = parseEventsTsv([row(), row(), row({ id: '43', quad: '3' }), row({ id: '44', country: '' }), row({ id: '45', day: '20250930' })].join('\n'), stamp);
  const report = aggregateEventsFiles([{ timestamp: stamp, records }], w, { latestTimestamp: stamp, nowMs });
  assert.equal(report.qualifiedSevenDayMaterialConflictCount, null); assert.equal(report.coverage.missingFiles, 671);
  assert.equal(report.observedSubset.materialConflictRecords, 2); assert.equal(report.observedSubset.verbalConflictRecords, 1);
  assert.equal(report.observedSubset.duplicateRecords, 1); assert.equal(report.observedSubset.outsideEventDateWindow, 1);
  assert.equal(report.observedSubset.unknownCountryRecords, 1); assert.deepEqual(report.observedSubset.countries, { UP: 1 });
  assert.equal(report.affectsScoring, false); assert.equal(report.score, null); assert.equal(report.fatalities, null);
});
test('complete actual zero is valid but stale, failed-file and conflicting-ID data cannot qualify', () => {
  const w = planEventsWindow(nowMs), all = w.timestamps.map(timestamp => ({ timestamp, records: [] }));
  const complete = aggregateEventsFiles(all, w, { latestTimestamp: stamp, nowMs });
  assert.equal(complete.qualifiedSevenDayMaterialConflictCount, 0); assert.equal(complete.calibrationApproved, false);
  assert.equal(aggregateEventsFiles(all, w, { latestTimestamp: stamp, nowMs: nowMs + 86400000 }).qualifiedSevenDayMaterialConflictCount, null);
  // A fresh index cannot make a retained/historical seven-day window current.
  const historical = aggregateEventsFiles(all, w, { latestTimestamp: '20261008234500', nowMs: Date.parse('2026-10-09T01:00:00Z') });
  assert.equal(historical.coverage.sourceFresh, true); assert.equal(historical.coverage.windowCurrent, false);
  assert.equal(historical.qualifiedSevenDayMaterialConflictCount, null);
  all[0].records = null;
  assert.equal(aggregateEventsFiles(all, w, { latestTimestamp: stamp, nowMs }).qualifiedSevenDayMaterialConflictCount, null);
  all[0].records = parseEventsTsv(row({ day: '20261001', added: w.start }), w.start);
  all[1].records = [{ ...all[0].records[0], country: 'RS' }];
  assert.equal(aggregateEventsFiles(all, w, { latestTimestamp: stamp, nowMs }).coverage.conflictingDuplicateIds, 1);
  assert.throws(() => aggregateEventsFiles([all[0], all[0]], w));
});
test('ZIP accepts exact single member and rejects tampering, oversized expansion and unsafe member names', () => {
  const good = zip(row()); assert.equal(readEventsZip(good, stamp), row());
  assert.throws(() => readEventsZip(zip(row(), '../escape.CSV'), stamp));
  const badCrc = Buffer.from(good); badCrc.writeUInt32LE(0, 14); assert.throws(() => readEventsZip(badCrc, stamp));
  const bomb = Buffer.from(good); const c = bomb.readUInt32LE(bomb.length - 6); bomb.writeUInt32LE(32 * 1024 * 1024, c + 24);
  assert.throws(() => readEventsZip(bomb, stamp)); assert.throws(() => readEventsZip(Buffer.alloc(1), stamp));
});
test('public transport is fixed-host, bounded, no-credential and never retries access errors', async () => {
  let calls = 0;
  for (const status of [403, 404, 429, 500]) {
    await assert.rejects(downloadEventsResource(stamp, { fetchImpl: async (url, options) => {
      calls++; assert.equal(url, `https://data.gdeltproject.org/gdeltv2/${stamp}.export.CSV.zip`);
      assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
      assert.ok(options.signal); return new Response('SENTINEL', { status });
    } }), new RegExp(`events_http_${status}`));
  }
  assert.equal(calls, 4);
  await assert.rejects(downloadEventsResource('https://gdeltcloud.com', { fetchImpl: () => { throw new Error('must not call'); } }));
  await assert.rejects(downloadEventsResource(stamp, { fetchImpl: async () => new Response('x', { headers: { 'content-length': '999999999' } }) }), /too_large/);
  await assert.rejects(downloadEventsResource(stamp, { fetchImpl: async () => new Response('xx'), onBytes: () => { throw new Error('events_total_byte_budget'); } }), /byte_budget/);
  assert.equal(parseLatestEventsTimestamp(`1 ${'a'.repeat(32)} http://data.gdeltproject.org/gdeltv2/${stamp}.export.CSV.zip`), stamp);
  assert.throws(() => parseLatestEventsTimestamp('https://gdeltcloud.com/'));
});
test('CLI defaults to no-network and refuses arbitrary output paths and excessive request budgets', () => {
  const script = 'scripts/world-order/diagnose-gdelt-events.mjs';
  const dry = spawnSync(process.execPath, [script, '--no-output'], { encoding: 'utf8' });
  assert.equal(dry.status, 0); const report = JSON.parse(dry.stdout);
  assert.equal(report.diagnostics.requests, 0); assert.equal(report.qualifiedSevenDayMaterialConflictCount, null);
  for (const args of [['--end'], ['--max-files', '673'], ['--output', 'data/world-order-stress.json']]) {
    assert.notEqual(spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }).status, 0);
  }
});
