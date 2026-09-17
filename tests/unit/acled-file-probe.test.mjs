import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FILE_PROBE, classifyProbeRedirect, inspectProbeWorkbook, probeAcledFile } from '../../scripts/world-order/acled-file-probe.mjs';

const names = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml'];
function zip(entries = names) {
  const locals = [], central = []; let offset = 0;
  for (const name of entries) {
    const n = Buffer.from(name), data = Buffer.from('<synthetic/>');
    const l = Buffer.alloc(30 + n.length); l.writeUInt32LE(0x04034b50); l.writeUInt32LE(data.length, 18);
    l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26); n.copy(l, 30);
    const c = Buffer.alloc(46 + n.length); c.writeUInt32LE(0x02014b50); c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); n.copy(c, 46);
    locals.push(l, data); central.push(c); offset += l.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const response = bytes => new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });

test('redirect classification exposes only fixed categories, never URL components or credentials', async () => {
  const cases = [
    [null, 'missing'], ['', 'invalid'], [' /user/login', 'invalid'], ['https://[', 'invalid'],
    ['/user/login?destination=PRIVATE#PRIVATE', 'same_origin_login'],
    ['https://acleddata.com/user/login?token=PRIVATE', 'same_origin_login'],
    ['/user/login/PRIVATE', 'same_origin_other'], ['/user/%6cogin', 'same_origin_other'],
    ['/system/files/PRIVATE', 'same_origin_other'], ['?token=PRIVATE', 'same_origin_other'],
    ['https://acleddata.com.evil.invalid/user/login', 'cross_origin'],
    ['//example.invalid/PRIVATE', 'cross_origin'], ['https://acleddata.com:444/user/login', 'cross_origin'],
    ['http://acleddata.com/user/login', 'unsafe'], ['javascript:PRIVATE', 'unsafe'],
    ['https://PRIVATE:PRIVATE@acleddata.com/user/login', 'unsafe'],
    ['/user/\nlogin', 'invalid'], ['\\\\example.invalid', 'invalid'], ['x'.repeat(4097), 'invalid'],
  ];
  for (const [location, expected] of cases) assert.equal(classifyProbeRedirect(location), expected);
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    const report = await probeAcledFile({ fetchImpl: async (_, options) => {
      calls++; assert.equal(options.redirect, 'manual');
      return new Response('PRIVATE-BODY', { status, headers: { location: '/user/login?token=PRIVATE' } });
    } });
    assert.equal(calls, 1); assert.equal(report.redirectTarget, 'same_origin_login');
    assert.equal(report.reason, 'redirect_not_followed'); assert.equal(report.receivedBytes, 0);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE|token|user\/login/u);
  }
  const report = await probeAcledFile({ fetchImpl: async () => new Response(null, { status: 403, headers: { location: '/user/login' } }) });
  assert.equal(Object.hasOwn(report, 'redirectTarget'), false);
});

test('fixed anonymous one-GET probe checks only bounded workbook container, never writes raw bytes', async () => {
  let calls = 0;
  const report = await probeAcledFile({ fetchImpl: async (url, options) => {
    calls++; assert.equal(url, FILE_PROBE.url); assert.equal(options.redirect, 'manual');
    assert.deepEqual(Object.keys(options.headers).sort(), ['Accept', 'User-Agent']); return response(zip());
  } });
  assert.equal(calls, 1); assert.equal(report.status, 'workbook_container_verified');
  assert.equal(report.rawFileSaved, false); assert.equal(report.productionWritten, false);
  assert.equal(report.rowValidation, 'not_performed'); assert.match(report.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(!JSON.stringify(report).includes('synthetic'));
});
test('HTTP errors and redirects stop without any retry or response disclosure', async () => {
  for (const status of [301, 302, 401, 403, 429, 500]) {
    let calls = 0; const report = await probeAcledFile({ fetchImpl: async () => {
      calls++; return new Response('PRIVATE-RESPONSE', { status, headers: { location: 'https://example.invalid/private' } });
    } });
    assert.equal(calls, 1); assert.equal(report.status, 'stopped'); assert.equal(report.httpStatus, status);
    assert.ok(!JSON.stringify(report).includes('PRIVATE')); assert.equal(report.receivedBytes, 0);
  }
});
test('HTML, forged XLSX and missing/duplicate/active package parts stop', async () => {
  assert.equal((await probeAcledFile({ fetchImpl: async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }) })).reason, 'unexpected_content_type');
  for (const bytes of [Buffer.from('<html>login</html>'), zip(names.slice(1)), zip([...names, names[0]]), zip([...names, 'xl/vbaProject.bin'])]) {
    assert.throws(() => inspectProbeWorkbook(bytes));
    assert.equal((await probeAcledFile({ fetchImpl: async () => response(bytes) })).reason, 'invalid_workbook_container');
  }
});
test('declared and streamed size, truncated length and oversized expansion are rejected', async () => {
  const tooLarge = new Response('', { headers: { 'content-type': 'application/zip', 'content-length': String(FILE_PROBE.maxBytes + 1) } });
  assert.equal((await probeAcledFile({ fetchImpl: async () => tooLarge })).reason, 'byte_limit');
  assert.equal((await probeAcledFile({ fetchImpl: async () => response(Buffer.alloc(FILE_PROBE.maxBytes + 1)) })).reason, 'byte_limit');
  const truncated = response(zip()); truncated.headers.set('content-length', '1');
  assert.equal((await probeAcledFile({ fetchImpl: async () => truncated })).reason, 'length_mismatch');
  const bomb = zip(); const directory = bomb.readUInt32LE(bomb.length - 6); bomb.writeUInt32LE(0x7fffffff, directory + 24);
  assert.throws(() => inspectProbeWorkbook(bomb));
});
test('deadline covers both hung connection and hung body, errors are sanitized', async () => {
  for (const fetchImpl of [() => new Promise(() => {}), async () => response(new ReadableStream({ start() {} }))]) {
    assert.equal((await probeAcledFile({ fetchImpl, timeoutMs: 20 })).reason, 'timeout');
  }
  const report = await probeAcledFile({ fetchImpl: async () => { throw new Error('PRIVATE'); } });
  assert.equal(report.reason, 'network_or_body_error'); assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});
test('CLI is offline by default; non-main, rerun and arbitrary arguments cannot fetch', () => {
  const cli = 'scripts/probe-acled-file.mjs';
  const dry = spawnSync(process.execPath, [cli], { encoding: 'utf8' }); assert.equal(dry.status, 0);
  assert.equal(JSON.parse(dry.stdout).requestCount, 0);
  for (const env of [{}, { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site', GITHUB_REF: 'refs/heads/feature', GITHUB_RUN_ATTEMPT: '1' },
    { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '2' }]) {
    const result = spawnSync(process.execPath, [cli, '--live'], { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env } });
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).requestCount, 0);
  }
  const bad = spawnSync(process.execPath, [cli, '--url', 'PRIVATE'], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.ok(!bad.stdout.includes('PRIVATE'));
});
test('timeout cancels active streams and cancels late responses without reading them', async () => {
  let cancelled = 0, pulls = 0;
  const stream = new ReadableStream({ pull() { pulls++; return new Promise(() => {}); }, cancel() { cancelled++; } });
  assert.equal((await probeAcledFile({ fetchImpl: async () => response(stream), timeoutMs: 20 })).reason, 'timeout');
  assert.equal(cancelled, 1); assert.equal(pulls, 1);
  let resolveFetch, lateCancelled = 0;
  const pending = probeAcledFile({ fetchImpl: () => new Promise(resolve => { resolveFetch = resolve; }), timeoutMs: 20 });
  assert.equal((await pending).reason, 'timeout');
  resolveFetch(response(new ReadableStream({ cancel() { lateCancelled++; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lateCancelled, 1);
});
test('workflow retains manual-only, read-only, secret-free, no-artifact contract', () => {
  const workflow = readFileSync('.github/workflows/acled-file-download-probe.yml', 'utf8');
  for (const required of ['workflow_dispatch:', 'default: false', 'contents: read', "github.ref == 'refs/heads/main'", 'github.run_attempt == 1', 'persist-credentials: false', 'timeout-minutes: 2', '--dry-run', '--live']) assert.ok(workflow.includes(required));
  for (const forbidden of [/schedule:/u, /secrets\./u, /upload-artifact/u, /actions\/cache/u, /contents: write/u, /npm (?:ci|install)/u, /workflow_run:/u, /pull_request/u]) assert.doesNotMatch(workflow, forbidden);
});
