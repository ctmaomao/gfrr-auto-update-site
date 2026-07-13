import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { gzipSync } from 'node:zlib';

import { fetchGdeltWebNgramsText } from '../../scripts/gdelt/fetch-gdelt.mjs';

const ORIGINAL_FETCH = globalThis.fetch;
const TIMESTAMP = '20260713000000';

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function gzipResponse(text, headers = {}) {
  const body = gzipSync(Buffer.from(text));
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/gzip',
      ...headers
    }
  });
}

test('GDELT Web NGrams accepts a bounded gzip response', async () => {
  globalThis.fetch = async () => gzipResponse('bounded ngrams payload');

  const result = await fetchGdeltWebNgramsText({
    timestamp: TIMESTAMP,
    minIntervalMs: 0,
    timeoutMs: 1000,
    maxCompressedBytes: 1024,
    maxDecompressedBytes: 4096,
    maxCompressionRatio: 100
  });

  assert.equal(result.text, 'bounded ngrams payload');
});

test('GDELT Web NGrams rejects a compressed response over the byte cap', async () => {
  globalThis.fetch = async () => gzipResponse('small', { 'content-length': '2048' });

  await assert.rejects(
    fetchGdeltWebNgramsText({
      timestamp: TIMESTAMP,
      minIntervalMs: 0,
      timeoutMs: 1000,
      maxCompressedBytes: 1024
    }),
    (error) => error?.gdeltDiagnostics?.errorCode === 'compressed_size_exceeded'
  );
});

test('GDELT Web NGrams stops a streamed response over the byte cap', async () => {
  globalThis.fetch = async () => new Response(Buffer.alloc(2048, 1), { status: 200 });

  await assert.rejects(
    fetchGdeltWebNgramsText({
      timestamp: TIMESTAMP,
      minIntervalMs: 0,
      timeoutMs: 1000,
      maxCompressedBytes: 1024
    }),
    (error) => error?.gdeltDiagnostics?.errorCode === 'compressed_size_exceeded'
  );
});

test('GDELT Web NGrams rejects excessive decompressed output', async () => {
  globalThis.fetch = async () => gzipResponse('x'.repeat(1024 * 1024));

  await assert.rejects(
    fetchGdeltWebNgramsText({
      timestamp: TIMESTAMP,
      minIntervalMs: 0,
      timeoutMs: 1000,
      maxCompressedBytes: 1024 * 1024,
      maxDecompressedBytes: 128 * 1024,
      maxCompressionRatio: 100
    }),
    (error) => error?.gdeltDiagnostics?.errorCode === 'decompressed_size_exceeded'
  );
});
