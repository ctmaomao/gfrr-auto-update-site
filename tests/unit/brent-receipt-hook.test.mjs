import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRows } from '../../scripts/run-realtime.mjs';
import { createBrentReceiptMetadata } from '../../scripts/realtime/brent-receipt-metadata.mjs';
const descriptor = { kind: 'fred', id: 'DCOILBRENTEU', source: 'fred:DCOILBRENTEU' };
const csv = 'DATE,DCOILBRENTEU\n2026-11-12,70\n2026-11-13,71';
const api = JSON.stringify({ observations: [{ date: '2026-11-12', value: '70' }, { date: '2026-11-13', value: '71' }] });
async function run(steps, observer, extra = {}) {
  const calls = []; const sleeps = []; const timeline = []; let tick = 0;
  const clock = () => { timeline.push('clock'); return new Date(Date.UTC(2026, 10, 16, 0, 0, tick++)).toISOString(); };
  const fetchImpl = async (url, options) => {
    timeline.push('fetch'); calls.push({ url, method: options.method, headers: options.headers, hasSignal: options.signal instanceof AbortSignal });
    const step = steps[calls.length - 1];
    if (!step) throw Error('unexpected request');
    if (step.error) throw step.error;
    return { ok: (step.status ?? 200) === 200, status: step.status ?? 200,
      async text() { timeline.push('body'); if (step.bodyError) throw step.bodyError; return step.text; } };
  };
  try {
    const rows = await fetchRows(extra.descriptor ?? descriptor, { apiKey: 'fixture-only-not-a-key', fetchImpl, clock,
      sleepImpl: async delay => sleeps.push(delay), researchObserver: observer, ...extra });
    return { calls, sleeps, rows, timeline };
  } catch (error) { return { calls, sleeps, error: error.message, timeline }; }
}
function comparable(result) { const rest = { ...result }; delete rest.timeline; return rest; }
test('actual fetchRows success paths preserve URL, method, headers, order and parsed rows', async () => {
  for (const [steps, options] of [[[ { text: api } ], {}], [[{ text: csv }], { apiKey: '' }]]) {
    const recorder = createBrentReceiptMetadata(); const off = await run(steps, null, options); const on = await run(steps, recorder, options);
    assert.deepEqual(comparable(on), comparable(off)); assert.equal(on.calls.length, 1);
    assert.equal(recorder.snapshot().receipts.length, 1);
    assert.deepEqual(on.timeline, ['clock', 'fetch', 'body', 'clock', 'clock']);
    assert.equal(recorder.snapshot().receipts[0].bodyReceivedAt, '2026-11-16T00:00:01.000Z');
  }
});
test('all API fallback reasons and CSV retries preserve existing paths', async () => {
  for (const first of [{ status: 403 }, { error: Error('network') }, { text: 'bad-json' }, { text: '{"observations":[]}' }, { bodyError: Error('body-failed') }]) {
    const steps = [first, { status: 503 }, { error: Object.assign(Error('abort'), { name: 'AbortError' }) }, { text: csv }];
    const recorder = createBrentReceiptMetadata(); const off = await run(steps, null); const on = await run(steps, recorder);
    assert.deepEqual(comparable(on), comparable(off)); assert.equal(on.calls.length, 4); assert.deepEqual(on.sleeps, [500, 1000]);
    assert.equal(recorder.snapshot().receipts.length, 4);
    assert.equal(recorder.snapshot().receipts[1].bodyReceivedAt, null);
    assert.equal(recorder.snapshot().receipts[2].bodyReceivedAt, null);
    assert.equal(recorder.snapshot().receipts[3].outcome, 'body');
  }
});
test('CSV parse insufficiency is not retried; exhausted HTTP error unchanged', async () => {
  for (const steps of [[{ text: 'DATE,DCOILBRENTEU\n2026-11-12,70' }], [{ status: 500 }, { status: 500 }, { status: 500 }]]) {
    const off = await run(steps, null, { apiKey: '' }); const on = await run(steps, createBrentReceiptMetadata(), { apiKey: '' });
    assert.deepEqual(comparable(on), comparable(off)); assert.ok(on.error);
  }
});
test('throw/reject/hang observer and failed clock cannot create requests or change output', { timeout: 1500 }, async () => {
  const steps = [{ text: api }]; const off = await run(steps, null);
  for (const observer of [{ record() { throw Error('writer failed'); } }, { record() { return Promise.reject(Error('rejected')); } }, { record() { return new Promise(() => {}); } }]) {
    assert.deepEqual(comparable(await run(steps, observer)), comparable(off));
  }
  const recorder = createBrentReceiptMetadata();
  assert.deepEqual(comparable(await run(steps, recorder, { clock() { throw Error('bad clock'); } })), comparable(off));
  assert.equal(recorder.snapshot().captureIncomplete, true);
  await new Promise(resolve => setImmediate(resolve));
});
test('other FRED series never call the research observer; no opt-in has no clock calls', async () => {
  let count = 0; const result = await run([{ text: api }], { record() { count++; } }, { descriptor: { ...descriptor, id: 'DGS10' } });
  assert.equal(count, 0); assert.deepEqual(result.timeline, ['fetch', 'body']);
  assert.deepEqual((await run([{ text: api }], null)).timeline, ['fetch', 'body']);
});
test('research parse errors and byte caps do not change existing production parser acceptance', async () => {
  // Existing production parser skips malformed/extra fields; strict research must not force fallback.
  const text = 'DATE,DCOILBRENTEU\n2026-11-12,70,extra\n2026-11-13,71,extra';
  const recorder = createBrentReceiptMetadata();
  const on = await run([{ text }], recorder, { apiKey: '' }); const off = await run([{ text }], null, { apiKey: '' });
  assert.deepEqual(comparable(on), comparable(off)); assert.equal(on.calls.length, 1);
  assert.equal(recorder.snapshot().receipts[0].parseStatus, 'invalid_response');
  const oversized = JSON.stringify({ observations: JSON.parse(api).observations, unused: 'x'.repeat(33000) });
  const capped = createBrentReceiptMetadata();
  assert.deepEqual(comparable(await run([{ text: oversized }], capped)), comparable(await run([{ text: oversized }], null)));
  assert.equal(capped.snapshot().receipts[0].parseStatus, 'byte_limit');
});


test('nonnumeric API rows cannot satisfy the minimum observations before CSV fallback', async () => {
  const malformed = JSON.stringify({ observations: [
    { date: '2026-11-12', value: null }, { date: '2026-11-13', value: false }
  ] });
  const result = await run([{ text: malformed }, { text: csv }], null);
  assert.equal(result.calls.length, 2);
  assert.deepEqual(result.rows, [{ date: '2026-11-12', value: 70 }, { date: '2026-11-13', value: 71 }]);
  assert.deepEqual(result.sleeps, []);
});
