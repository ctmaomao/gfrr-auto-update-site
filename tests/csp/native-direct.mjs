// Manual browser producer. The live caller supplies the budget gate; never use this as telemetry.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ORIGIN, TARGET } from './controlled-platform.mjs';

export const producerFingerprint = () => createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const docs = ['index', 'bubble-watch'];
export function validateNativeRequest(request, target = TARGET + '/csp-report') {
  assert.equal(request.url, target); assert.equal(request.method, 'POST');
  assert.equal(request.contentType?.split(';')[0].trim(), 'application/csp-report');
  assert.equal(typeof request.body, 'string'); assert.ok(Buffer.byteLength(request.body) <= 16_384);
  const payload = JSON.parse(request.body); assert.deepEqual(Object.keys(payload), ['csp-report']);
  const report = payload['csp-report']; assert.ok(report && typeof report === 'object' && !Array.isArray(report));
  const doc = docs.find(name => report['document-uri'] === ORIGIN + '/' + name + '.html?synthetic=fiction-only');
  assert.ok(doc, 'only the two fixed fictional documents can leave the browser');
  assert.equal(report['effective-directive'], 'script-src-elem');
  assert.equal(report['violated-directive'], 'script-src-elem');
  assert.equal(report['blocked-uri'], 'inline'); assert.equal(report.disposition, 'report');
  assert.equal(report['original-policy'], "default-src 'none'; script-src 'none'; report-uri " + target);
  // These are Chromium's known native fields. Unknown fields stop, rather than forwarding metadata.
  const allowed = ['document-uri', 'referrer', 'violated-directive', 'effective-directive', 'original-policy',
    'disposition', 'blocked-uri', 'line-number', 'column-number', 'source-file', 'status-code', 'script-sample'];
  assert.ok(Object.keys(report).every(key => allowed.includes(key)));
  for (const key of ['referrer', 'script-sample']) assert.ok(report[key] === undefined || report[key] === '');
  assert.ok(report['source-file'] === undefined || report['source-file'] === ''
    || report['source-file'] === ORIGIN + '/' + doc + '.html'
    || report['source-file'] === report['document-uri']);
  for (const key of ['line-number', 'column-number']) assert.ok(report[key] === undefined || (Number.isSafeInteger(report[key]) && report[key] >= 0));
  assert.equal(report['status-code'], 200);
  return doc;
}

/** Original bytes go from Chromium to the target; no route.fetch(), Node forwarding or rewriting. */
export async function nativeDirect({ beforeSend, afterResponse, onFailure, signal, target = TARGET + '/csp-report' }) {
  const { chromium } = await import('playwright');
  let browser, context, failure = null, timer;
  const pending = new Set(), seen = new Set(), completed = new Set(), records = new Map();
  const fail = error => {
    if (!failure) { failure = error; onFailure(error); void context?.close().catch(() => {}); }
  };
  const check = () => { if (failure) throw failure; };
  const aborted = () => fail(new Error('shared sequence aborted'));
  const server = createServer((req, res) => {
    if (!docs.some(doc => req.url === '/' + doc + '.html?synthetic=fiction-only')) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy-report-only':
      "default-src 'none'; script-src 'none'; report-uri " + target });
    res.end('<!doctype html><title>Fiction only</title><script>window.fictionOnly=true;</script>');
  });
  try {
    await new Promise((done, reject) => { server.once('error', reject); server.listen(8765, '127.0.0.1', done); });
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
    check();
    await context.route('**/*', async route => {
      const request = route.request();
      if (request.url() !== target) {
        if (!failure && request.method() === 'GET' && docs.some(doc => request.url() === ORIGIN + '/' + doc + '.html?synthetic=fiction-only')) {
          await route.continue(); return;
        }
        await route.abort('blockedbyclient'); return;
      }
      const task = (async () => {
        let continued = false;
        try {
          check();
          const doc = validateNativeRequest({ url: request.url(), method: request.method(),
            contentType: request.headers()['content-type'], body: request.postData() }, target);
          assert.ok(!seen.has(doc), 'duplicate/retry is blocked before transport'); seen.add(doc);
          // MUST be synchronous: phase/ceiling checks and durable attempt write precede continue().
          const record = beforeSend(doc); assert.ok(record && typeof record.then !== 'function'); check();
          records.set(doc, record);
          continued = true; await route.continue();
        } catch (error) {
          fail(error);
          if (!continued) await route.abort('blockedbyclient').catch(() => {});
        }
      })();
      pending.add(task); task.finally(() => pending.delete(task)); await task;
    });
    timer = setTimeout(() => { fail(new Error('native direct deadline')); void context.close().catch(() => {}); }, 10_000);
    for (const doc of docs) {
      check(); const page = await context.newPage();
      const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
      let requestId = null;
      cdp.on('Network.requestWillBeSent', event => {
        if (event.request.url !== target) return;
        if (requestId !== null) { fail(new Error('duplicate native network event')); return; }
        requestId = event.requestId;
      });
      cdp.on('Network.responseReceivedExtraInfo', event => {
        if (event.requestId !== requestId) return;
        try {
          check(); assert.ok(records.has(doc)); assert.ok(!completed.has(doc));
          // report-uri ignores its response. Chromium may flag JSON as ORB, and Playwright's
          // request.response() is null. Use the original network status/headers, never a refetch.
          const headers = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));
          afterResponse(records.get(doc), { status: event.statusCode, headers, bodyInspectable: false }); completed.add(doc);
        } catch (error) { fail(error); }
      });
      await page.goto(ORIGIN + '/' + doc + '.html?synthetic=fiction-only', { timeout: 10_000 });
      const deadline = Date.now() + 10_000;
      while (!completed.has(doc) && !failure && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
      await Promise.all([...pending]); check(); assert.ok(completed.has(doc));
    }
    check(); assert.equal(seen.size, 2); assert.equal(completed.size, 2);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', aborted);
    if (browser) await browser.close();
    await new Promise(done => server.close(done));
  }
}
