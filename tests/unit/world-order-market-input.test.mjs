import assert from 'node:assert/strict';
import test from 'node:test';
import { finiteOrNull } from '../../scripts/world-order/normalize-world-order-inputs.mjs';
import { buildMarketConfirmation, selectMarketConfirmationInput } from '../../scripts/world-order/build-market-confirmation.mjs';

const now = Date.parse('2026-09-09T00:00:00Z');
const atAge = (minutes) => new Date(now - minutes * 60000).toISOString();
const worker = () => ({ sourceMode: 'worker-generated-preview', updatedAt: atAge(1), healthScore: 100, criticalMissing: 0, values: { brent: 100 } });
const daily = { updatedAt: atAge(20), displayInputsBaseline: { brent: 90 } };
function stubWorker(t, payload) {
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload)));
}

test('missing, blank, boolean and object inputs cannot become market observations', () => {
  for (const value of [null, undefined, '', '  ', false, true, [], {}, NaN, Infinity]) assert.equal(finiteOrNull(value), null);
  for (const value of [0, '0', ' 0 ']) assert.equal(finiteOrNull(value), 0);
  assert.equal(finiteOrNull('2.5'), 2.5);
  const result = buildMarketConfirmation({ marketConfirmationInput: { source: 'daily-baseline', brent: 100, gold: null, vix: null, dxy: null, hyOas: null, spx: null } });
  assert.equal(result.score, 9);
  assert.equal(result.confidence, 0.17);
  assert.equal(result.evidence.length, 1);
  assert.equal(buildMarketConfirmation({ marketConfirmationInput: { source: 'daily-baseline', brent: 0 } }).confidence, 0.17);
});

test('valid Worker preview retains priority and null metadata cannot pass its gate', async (t) => {
  const payload = worker(); stubWorker(t, payload);
  assert.equal((await selectMarketConfirmationInput({ dataPayload: daily })).source, 'worker-generated-preview');
  for (const key of ['healthScore', 'criticalMissing']) {
    const invalid = { ...payload, [key]: null };
    globalThis.fetch = async () => new Response(JSON.stringify(invalid));
    assert.equal((await selectMarketConfirmationInput({ dataPayload: daily })).source, 'daily-baseline');
  }
});

test('future and stale Worker payloads fail closed, small clock skew remains allowed', async (t) => {
  stubWorker(t, worker());
  for (const age of [-6, 15.01, 100000]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ ...worker(), updatedAt: atAge(age) }));
    assert.equal((await selectMarketConfirmationInput({ dataPayload: daily })).source, 'daily-baseline');
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ ...worker(), updatedAt: atAge(-4) }));
  assert.equal((await selectMarketConfirmationInput()).source, 'worker-generated-preview');
});

test('untrusted or stale local cache cannot displace Daily; valid aging local input can', async (t) => {
  stubWorker(t, {});
  const local = { ...worker(), sourceMode: 'github-realtime', updatedAt: atAge(30) };
  for (const patch of [
    { cacheOnly: true }, { unavailable: true }, { sourceMode: 'cache-only' },
    { healthScore: 0 }, { criticalMissing: 4 }, { degradedMode: true },
    { updatedAt: atAge(90.01) }, { updatedAt: atAge(-6) }, { updatedAt: 'invalid' },
  ]) {
    const selected = await selectMarketConfirmationInput({ dataPayload: daily, realtimePayload: { ...local, ...patch } });
    assert.equal(selected.source, 'daily-baseline', JSON.stringify(patch));
    assert.match(selected.fallbackReason, /local-realtime-unavailable-or-untrusted/);
  }
  assert.equal((await selectMarketConfirmationInput({ dataPayload: daily, realtimePayload: local })).source, 'local-realtime');
  assert.equal((await selectMarketConfirmationInput()).source, 'unavailable');
});
