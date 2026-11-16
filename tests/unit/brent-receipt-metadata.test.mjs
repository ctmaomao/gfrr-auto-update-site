import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBrentReceiptMetadata, observeBrentReceipt } from '../../scripts/realtime/brent-receipt-metadata.mjs';
const csv = 'DATE,DCOILBRENTEU\n2026-11-12,70\n2026-11-13,.';
const input = (extra = {}) => ({ series: 'DCOILBRENTEU', transport: 'csv', requestStartedAt: '2026-11-16T00:00:00.000Z', bodyReceivedAt: '2026-11-16T00:00:01.000Z', classifiedAt: '2026-11-16T00:00:02.000Z', httpStatus: 200, outcome: 'body', text: csv, ...extra });
test('retains only bounded metadata, hash and counts; snapshot cannot mutate recorder', () => {
  const recorder = createBrentReceiptMetadata(); assert.equal(recorder.record(input()), true);
  const snapshot = recorder.snapshot(); const receipt = snapshot.receipts[0];
  assert.equal(receipt.decodedResponseTextSha256, createHash('sha256').update(csv).digest('hex'));
  assert.equal(receipt.decodedResponseUtf8Bytes, Buffer.byteLength(csv));
  assert.equal(receipt.parsedRowCount, 2); assert.equal(receipt.missingCount, 1);
  assert.equal(snapshot.firstSeenUnknown, true); assert.equal(snapshot.captureIncomplete, false);
  assert.ok(!JSON.stringify(snapshot).includes('2026-11-12')); assert.ok(!('text' in receipt));
  receipt.series = 'changed'; assert.equal(recorder.snapshot().receipts[0].series, 'DCOILBRENTEU');
});
test('strict calendar and values, missing, duplicate and conflicting dates counted without retaining values', () => {
  const recorder = createBrentReceiptMetadata(); recorder.record(input({ transport: 'api', text: JSON.stringify({ observations: [
    { date: '2026-11-12', value: '70' }, { date: '2026-11-12', value: '70.0' }, { date: '2026-11-12', value: '71' },
    { date: '2026-02-30', value: '70' }, { date: '2026-11-13', value: '0' }, { date: '2026-11-14', value: '.' },
    { date: '2026-11-15', value: '-1' }, { date: '2026-11-16', value: true }] }) }));
  const state = recorder.snapshot(); assert.equal(state.captureIncomplete, true);
  assert.equal(state.receipts[0].duplicateCount, 1); assert.equal(state.receipts[0].conflictingDateCount, 1);
  assert.equal(state.receipts[0].invalidCount, 4); assert.equal(state.receipts[0].missingCount, 1);
});
test('malformed envelopes and impossible clocks rejected, secrets never echoed', () => {
  for (const extra of [{ url: 'secret' }, { classifiedAt: '2026-11-15T00:00:00.000Z' }, { bodyReceivedAt: '2026-02-30T00:00:00.000Z' }, { outcome: 'network_error' }, { httpStatus: 500 }, { series: 'secret' }]) {
    const recorder = createBrentReceiptMetadata(); assert.equal(recorder.record(input(extra)), false);
    assert.equal(recorder.snapshot().receipts.length, 0); assert.equal(recorder.snapshot().captureIncomplete, true);
  }
});
test('network and HTTP failure have no invented receipt body clock; success empty differs', () => {
  const recorder = createBrentReceiptMetadata();
  recorder.record(input({ outcome: 'network_error', httpStatus: null, bodyReceivedAt: null, text: null }));
  recorder.record(input({ outcome: 'http_error', httpStatus: 503, bodyReceivedAt: null, text: null }));
  recorder.record(input({ text: 'DATE,DCOILBRENTEU\n' }));
  assert.equal(recorder.snapshot().receipts[0].bodyReceivedAt, null);
  assert.equal(recorder.snapshot().receipts[2].parsedRowCount, 0);
});
test('byte, row, attempt caps mark incomplete and retain no oversized text', () => {
  const recorder = createBrentReceiptMetadata(); recorder.record(input({ text: 'x'.repeat(32769) }));
  recorder.record(input({ text: 'DATE,DCOILBRENTEU\n' + Array(65).fill('2026-11-12,70').join('\n') }));
  recorder.record(input()); recorder.record(input()); assert.equal(recorder.record(input()), false);
  const state = recorder.snapshot(); assert.equal(state.receipts.length, 4); assert.equal(state.captureIncomplete, true);
  assert.equal(state.receipts[0].parseStatus, 'byte_limit'); assert.equal(state.receipts[0].decodedResponseTextSha256, null);
  assert.equal(state.receipts[1].parseStatus, 'row_limit'); assert.ok(JSON.stringify(state).length < 32768);
});
test('malformed CSV / API never retain response or error contents', () => {
  for (const text of ['DATE,DCOILBRENTEU,secret\n2026-11-12,70', 'DATE,DCOILBRENTEU\n"secret', 'secret']) {
    const recorder = createBrentReceiptMetadata(); recorder.record(input({ text }));
    assert.equal(recorder.snapshot().receipts[0].parseStatus, 'invalid_response'); assert.ok(!JSON.stringify(recorder.snapshot()).includes('secret'));
  }
});
test('mock request path unchanged with throw, reject and never-settling observers', { timeout: 1000 }, async () => {
  for (const observer of [null, createBrentReceiptMetadata(), { record() { throw Error('secret'); } }, { record() { return Promise.reject(Error('secret')); } }, { record() { return new Promise(() => {}); } }]) {
    let requests = 0; const fetchMock = async () => { requests++; return csv; };
    const text = await fetchMock(); observeBrentReceipt(observer, input({ text }));
    assert.equal(text, csv); assert.equal(requests, 1);
  }
  await new Promise(resolve => setImmediate(resolve));
});
