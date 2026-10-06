// Manual localhost-only browser acceptance. No production endpoint/config or platform budget.
// Usage: node tests/csp/receiver-trial-browser.mjs --out-dir test-results/<fresh-directory>
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { resolve, sep } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { handleReceiverRequest } from '../../workers/gfrr-csp-report-receiver/src/index.js';
import { applySchema, ingest, readUsed } from '../../workers/gfrr-csp-report-receiver/src/storage.js';
import { createNodeSqliteAdapter } from '../../workers/gfrr-csp-report-receiver/src/storage-adapter.js';
import { bucketFor } from '../../workers/gfrr-csp-report-receiver/src/constants.js';

const args = process.argv.slice(2);
assert.equal(args.length, 2);
assert.equal(args[0], '--out-dir');
const resultRoot = resolve(import.meta.dirname, '../../test-results');
const out = resolve(args[1]);
assert.ok(out.startsWith(resultRoot + sep), 'output must be a fresh directory inside test-results');
mkdirSync(out); // Existing evidence is never overwritten or deleted, even on failed runs.
const write = (name, data) => writeFileSync(resolve(out, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
write('started.json', { at: new Date().toISOString(), scope: 'localhost only; synthetic fixture; no platform requests' });

const db = new DatabaseSync(':memory:');
const adapter = createNodeSqliteAdapter(db);
applySchema(adapter);
const started = Date.now();
let clock = started;
let enabled = false;
let origin;
let received = 0;
const attempts = [];
const commits = [];
const env = {
  CSP_TRIAL_ENABLED: 'false',
  CSP_TRIAL_START_AT: new Date(started).toISOString(),
  CSP_TRIAL_END_AT: new Date(started + 10 * 60 * 1000).toISOString(),
  CSP_RECEIVER: {
    idFromName: name => name,
    get: () => ({
      async ingest({ entries, receivedAt }) {
        const result = ingest(adapter, receivedAt, new Map(entries));
        commits.push({ action: result.action, rows: result.plannedObsRows });
        return { action: result.action, stored: result.plannedObsRows };
      },
      async health() {
        const used = readUsed(adapter, bucketFor(clock));
        return { status: 'unknown', alerts: ['local-no-platform-alarm'], ingestUsed: used.obsRows + used.ledgerRows };
      },
    }),
  },
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (['/index.html', '/bubble-watch.html'].includes(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy-report-only': "default-src 'none'; script-src 'none'; report-uri " + origin + '/csp-report' });
      res.end('<!doctype html><html><head><title>Local synthetic CSP trial</title></head><body><p>Synthetic fixture</p><script>window.syntheticTrial = true;</script></body></html>');
      return;
    }
    if (!['/csp-report', '/health'].includes(url.pathname)) { res.writeHead(404); res.end(); return; }
    received += 1;
    // Local test-driver ceiling, separate from the runtime gate and the production ingest ledger.
    if (received > 8) throw new Error('local receiver attempt ceiling exceeded');
    env.CSP_TRIAL_ENABLED = enabled ? 'true' : 'false';
    const request = new Request(url, { method: req.method, headers: req.headers,
      ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }) });
    const response = await handleReceiverRequest(request, env, { now: () => clock });
    attempts.push({ path: url.pathname, method: req.method, status: response.status });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch (error) {
    attempts.push({ error: String(error.message) });
    res.writeHead(500); res.end();
  }
});
let browser;
try {
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  origin = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(origin + '/health')).status, 503);
  assert.equal(commits.length, 0);
  enabled = true;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  for (const name of ['index', 'bubble-watch']) {
    await page.goto(origin + '/' + name + '.html?synthetic=fiction-only', { timeout: 10000 });
  }
  const deadline = Date.now() + 10000;
  while (commits.length < 2 && Date.now() < deadline) await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
  assert.equal(commits.length, 2, 'two native reports must arrive within the bounded wait');
  const rows = adapter.all('SELECT directive, blocked, doc, policy_tag, mechanism, reports FROM obs ORDER BY doc');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.doc), ['bubble-watch', 'index']);
  for (const row of rows) {
    assert.equal(row.reports, 1); assert.equal(row.mechanism, 'legacy');
    assert.equal(row.blocked, 'inline'); assert.equal(row.policy_tag, 'unknown');
  }
  assert.ok(!JSON.stringify(rows).includes('fiction-only'));
  const used = readUsed(adapter, bucketFor(clock));
  assert.equal(used.obsRows + used.ledgerRows, 4);
  clock = started + 10 * 60 * 1000;
  assert.equal((await fetch(origin + '/csp-report', { method: 'POST', headers: { 'content-type': 'application/csp-report' },
    body: '{"csp-report":{"effective-directive":"script-src"}}' })).status, 503);
  assert.equal((await fetch(origin + '/health')).status, 503);
  assert.deepEqual(readUsed(adapter, bucketFor(clock)), used);
  assert.equal(commits.length, 2);
  assert.ok(attempts.every(item => !item.error));
  write('result.json', { ok: true, scope: 'local native Chromium + real in-memory SQLite; DO RPC simulated',
    platformVerified: false, receiverAttempts: received, attempts, rows, ingestUsed: 4,
    platformRequests: 0, limitations: ['no Cloudflare metering/alarm verification', 'no production C activation'] });
  console.log('PASS: local native reports committed 2 aggregate rows; ledger=4; expiry rejects without additional writes.');
} catch (error) {
  write('result.json', { ok: false, error: String(error.message), attempts, platformRequests: 0 });
  throw error;
} finally {
  enabled = false;
  if (browser) await browser.close();
  await new Promise(resolvePromise => server.close(resolvePromise));
  db.close();
}
