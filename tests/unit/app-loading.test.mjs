import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function harness(fetch) {
  const source = readFileSync(new URL('../../scripts/app.js', import.meta.url), 'utf8')
    .replace(/import\s*\{[^}]+\}\s*from\s*'\.\/modules\/config\.js';/u, '')
    .split('// 启动')[0];
  const context = vm.createContext({
    fetch, AbortController, console: { error() {} },
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 30)), clearTimeout,
    dataUrl: 'radar', worldOrderStressUrl: 'world',
  });
  vm.runInContext(source, context);
  return context;
}

test('JSON deadline covers both pending fetch and pending response body', async () => {
  for (const bodyPending of [false, true]) {
    let signal;
    const context = harness(async (_url, options) => {
      signal = options.signal;
      if (!bodyPending) return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) };
    });
    assert.equal(await context.fetchJson('test', 'test'), null);
    assert.equal(signal.aborted, true);
  }
});

test('primary data is handed to renderer before a hanging auxiliary times out', async () => {
  let primaryRendered = false;
  const context = harness(async (url) => url.includes('oil-news')
    ? new Promise(() => {})
    : { ok: true, json: async () => ({ score: 42 }) });
  const pending = context.loadAllData(({ radarData }) => {
    assert.equal(radarData.score, 42);
    primaryRendered = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(primaryRendered, true);
  const data = await pending;
  assert.equal(data.oilNewsEventWatchData, null);
  assert.equal(data.radarData.score, 42);
});

test('failed primary stays unavailable even when auxiliary data succeeds', async () => {
  const context = harness(async (url) => ({ ok: url !== 'radar', status: 404, json: async () => ({ score: 10 }) }));
  const data = await context.loadAllData(({ radarData }) => assert.equal(radarData, null));
  assert.equal(context.allRenderableDataPresent(data), false);
});
