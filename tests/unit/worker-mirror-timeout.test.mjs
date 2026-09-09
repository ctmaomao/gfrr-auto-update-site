import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGitHubMirrorPreviewOrStatusPayload } from '../../workers/gfrr-realtime-worker/src/index.js';

test('mirror request and response body deadlines produce status only', async (t) => {
  const originalTimer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => originalTimer(fn, Math.min(ms, 20)));
  t.mock.method(globalThis, 'fetch', async () => new Promise(() => {}));
  for (const bodyPending of [false, true]) {
    let signal;
    globalThis.fetch = async (_url, options) => {
      signal = options.signal;
      return bodyPending ? { ok: true, text: () => new Promise(() => {}) } : new Promise(() => {});
    };
    const result = await buildGitHubMirrorPreviewOrStatusPayload('2026-09-09T00:00:00Z');
    assert.equal(signal.aborted, true);
    assert.equal(result.key, 'market:worker-heartbeat');
    assert.equal(result.value.previewFetchStatus, 'fetch-error');
    assert.match(result.value.previewError, /deadline exceeded/);
  }
});

test('mirror HTTP and malformed JSON failures stay isolated', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  assert.equal((await buildGitHubMirrorPreviewOrStatusPayload('test')).value.previewFetchStatus, 'http-error');
  globalThis.fetch = async () => new Response('{broken');
  assert.equal((await buildGitHubMirrorPreviewOrStatusPayload('test')).value.previewFetchStatus, 'json-error');
});

test('successful mirror keeps the original values and existing destination', async (t) => {
  const payload = { updatedAt: '2026-09-09T00:00:00Z', values: { brent: 100, gold: null }, sourceMode: 'github-realtime' };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload)));
  const result = await buildGitHubMirrorPreviewOrStatusPayload('test');
  assert.equal(result.key, 'market:latest-preview');
  assert.deepEqual(result.value.values, payload.values);
  assert.equal(result.value.sourceMode, payload.sourceMode);
  assert.equal(result.value.workerPreview.previewFetchStatus, 'ok');
});
