import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAcledBatch, BATCH_LIMITS } from '../../scripts/world-order/acled-batch-reader.mjs';
import { ACLED_MONTHLY_SLUGS } from '../../scripts/world-order/acled-download-manifest.mjs';
import { ACLED_WEEKLY_REGIONS } from '../../scripts/world-order/acled-weekly-coverage.mjs';

const urls = () => [...ACLED_WEEKLY_REGIONS.map(r => `https://acleddata.com/system/files/2026-09/${r}_aggregated_data_up_to_week_of-2026-09-05.xlsx`),
  ...ACLED_MONTHLY_SLUGS.map(s => `https://acleddata.com/system/files/2026-09/number_of_${s}_as-of-11Sep2026.xlsx`)];
// Minimal stored ZIP; deliberately NOT an OOXML workbook. Row validation stays false.
function zip(size = 4) {
  const name = Buffer.from('sample'), data = Buffer.alloc(size, 1), local = Buffer.alloc(36), central = Buffer.alloc(52), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(6, 26); name.copy(local, 30);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(size, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(6, 28); name.copy(central, 46);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(52, 12); end.writeUInt32LE(local.length + size, 16);
  return Buffer.concat([local, data, central, end]);
}
const response = bytes => new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });

test('complete serial twelve-file read keeps bytes separate and never claims row validation', async () => {
  let calls = 0, active = 0;
  const result = await readAcledBatch({ urls: urls(), fetchImpl: async (url, options) => {
    assert.ok(urls().includes(url)); assert.equal(options.redirect, 'manual');
    assert.equal(++active, 1); calls++; await Promise.resolve(); active--; return response(zip());
  } });
  assert.equal(calls, 12); assert.equal(result.workbooks.length, 12);
  assert.equal(result.report.status, 'zip_batch_read');
  assert.equal(result.report.contentValidated, false); assert.equal(result.report.productionEligible, false);
  assert.equal(result.report.rawFileSaved, false); assert.equal(result.report.productionWritten, false);
  assert.match(result.report.files[0].sha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(result.report), /sample|Buffer|https:/u);
});

test('no default transport and invalid input performs zero requests', async () => {
  assert.equal((await readAcledBatch({ urls: urls() })).report.reason, 'invalid_context');
  for (const input of [[], urls().slice(1), [...urls().slice(1), 'https://evil.invalid/private']]) {
    const r = await readAcledBatch({ urls: input, fetchImpl: () => assert.fail('must not fetch') });
    assert.equal(r.report.reason, 'invalid_manifest'); assert.equal(r.report.requestCount, 0);
  }
  for (const timeoutMs of [0, 15001, NaN]) assert.equal((await readAcledBatch({ urls: urls(), timeoutMs, fetchImpl: () => assert.fail() })).report.requestCount, 0);
});

test('first failing response stops batch, discards partial buffers, redacts provider details', async () => {
  for (const bad of [() => new Response('PRIVATE', { status: 302, headers: { location: 'https://private.invalid/token' } }),
    () => new Response('PRIVATE', { status: 403 }), () => new Response('PRIVATE', { headers: { 'content-type': 'text/html' } }),
    () => response(Buffer.from('PRIVATE')), () => { throw new Error('PRIVATE'); }]) {
    let calls = 0;
    const r = await readAcledBatch({ urls: urls(), fetchImpl: async () => ++calls === 1 ? response(zip()) : bad() });
    assert.equal(calls, 2); assert.equal(r.workbooks, null); assert.equal(r.report.status, 'stopped');
    assert.doesNotMatch(JSON.stringify(r.report), /PRIVATE|private.invalid|token/u);
  }
});

test('declared, streamed, aggregate byte limits and length mismatch fail closed', async () => {
  const cases = [
    [() => new Response(null, { headers: { 'content-type': 'application/zip', 'content-length': '1048577' } }), 'byte_limit'],
    [() => response(Buffer.alloc(1048577)), 'byte_limit'],
    [() => new Response(zip(), { headers: { 'content-type': 'application/zip', 'content-length': '1' } }), 'length_mismatch'],
  ];
  for (const [make, reason] of cases) {
    const r = await readAcledBatch({ urls: urls(), fetchImpl: async () => make() });
    assert.equal(r.report.reason, reason); assert.equal(r.report.requestCount, 1); assert.equal(r.workbooks, null);
  }
  const r = await readAcledBatch({ urls: urls(), fetchImpl: async () => response(zip(800000)) });
  assert.equal(r.report.requestCount, 3); assert.equal(r.report.reason, 'byte_limit'); assert.equal(r.workbooks, null);
});

test('fetch and streaming deadlines stop and cancel without retries', async () => {
  const r = await readAcledBatch({ urls: urls(), timeoutMs: 10, fetchImpl: () => new Promise(() => {}) });
  assert.equal(r.report.reason, 'timeout'); assert.equal(r.report.requestCount, 1);
  let cancelled = false;
  const s = await readAcledBatch({ urls: urls(), timeoutMs: 10, fetchImpl: async () => response(new ReadableStream({ cancel() { cancelled = true; } })) });
  assert.equal(s.report.reason, 'timeout'); assert.equal(cancelled, true);
});

test('batch limits remain aligned with existing sanitizers, old probe stays 8 MiB', () => {
  for (const [kind, limits] of Object.entries(BATCH_LIMITS)) {
    const source = readFileSync(new URL(`../../scripts/world-order/sanitize-acled-${kind}.mjs`, import.meta.url), 'utf8');
    for (const [name, value] of [['MAX_INPUT_BYTES', limits.fileBytes], ['MAX_BATCH_INPUT_BYTES', limits.batchBytes], ['MAX_BATCH_UNCOMPRESSED_BYTES', limits.batchExpanded]]) {
      const amount = Number(source.match(new RegExp(`const ${name} = (\\d+) \\* 1024 \\* 1024;`))[1]);
      assert.equal(amount * 1024 * 1024, value);
    }
  }
  const source = readFileSync(new URL('../../scripts/world-order/acled-file-probe.mjs', import.meta.url), 'utf8');
  assert.match(source, /maxBytes: 8 \* 1024 \* 1024/u);
});
