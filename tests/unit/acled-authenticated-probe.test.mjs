import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { authenticatedProbe, sessionCookie, AUTH_PROBE } from '../../scripts/world-order/acled-authenticated-probe.mjs';
import { FILE_PROBE } from '../../scripts/world-order/acled-file-probe.mjs';

const username = 'fixture@example.invalid', password = 'PRIVATE-PASSWORD', token = 'PRIVATE_LOGOUT_TOKEN_1234';
const cookie = `SSESS${'a'.repeat(32)}=PRIVATE_SESSION_123456`;
const safe = `${cookie}; Path=/; Secure; HttpOnly`;
const login = (headers = {}, payload = { current_user: { uid: '42', name: username }, logout_token: token, csrf_token: token }) =>
  new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json', 'set-cookie': safe, ...headers } });
const run = fetchImpl => authenticatedProbe({ username, password, fetchImpl });
function zip() {
  const names = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml'];
  const local = [], central = []; let offset = 0;
  for (const name of names) {
    const n = Buffer.from(name), data = Buffer.from('<synthetic/>');
    const l = Buffer.alloc(30 + n.length); l.writeUInt32LE(0x04034b50); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26); n.copy(l, 30);
    const c = Buffer.alloc(46 + n.length); c.writeUInt32LE(0x02014b50); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); n.copy(c, 46);
    local.push(l, data); central.push(c); offset += l.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
test('three fixed requests separate login, workbook and logout without disclosing secrets', async () => {
  const calls = [];
  const report = await run(async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'manual');
    if (calls.length === 1) { assert.equal(url, AUTH_PROBE.loginUrl); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), { name: username, pass: password }); return login(); }
    assert.equal(options.headers.Cookie, cookie); assert.equal(options.body, undefined);
    if (calls.length === 2) { assert.equal(url, FILE_PROBE.url); return new Response(zip(), { headers: { 'content-type': 'application/zip' } }); }
    assert.equal(url, `${AUTH_PROBE.logoutUrl}&token=${token}`); assert.equal(options.method, 'POST'); assert.equal(options.headers['X-CSRF-Token'], token); return new Response(null, { status: 204 });
  });
  assert.equal(report.requestCount, 3); assert.equal(report.status, 'workbook_container_verified'); assert.equal(report.logout, 'confirmed'); assert.equal(report.sessionMayRemain, false);
  assert.equal(report.rawFileSaved, false); assert.equal(report.productionWritten, false);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|fixture@|SSESS|synthetic/u);
});
test('cookies require exact session identity and safe scope; multiple Set-Cookie and Expires commas supported', () => {
  const headers = new Headers(); headers.append('set-cookie', 'other=value; Path=/'); headers.append('set-cookie', `${safe}; Expires=Wed, 01 Jan 2031 00:00:00 GMT`);
  assert.equal(sessionCookie(headers, 0), cookie);
  for (const value of [safe.replace('Secure', 'Secure=no'), safe.replace('HttpOnly', 'SameSite=Lax'), safe.replace('Path=/', 'Path=/user'), `${safe}; Domain=evil.invalid`, `${safe}; Max-Age=0`, `${safe}; Expires=invalid`, `${safe}; Path=/`, safe.replace('SSESS', 'SESS'), safe.replace('PRIVATE_SESSION_123456', 'bad,value')]) {
    assert.throws(() => sessionCookie(new Headers({ 'set-cookie': value })));
  }
  headers.append('set-cookie', safe); assert.throws(() => sessionCookie(headers));
});
test('login failures never download or retry and flag potentially unclosed session', async () => {
  for (const response of [new Response('PRIVATE', { status: 403 }), new Response(null, { status: 302, headers: { location: 'https://example.invalid' } }), login({ 'content-type': 'text/html' }), login({}, { current_user: { uid: '0', name: username }, logout_token: token }), login({}, { current_user: { uid: '42', name: 'wrong' }, logout_token: token }), login({ 'set-cookie': 'bad=value' }), new Response('PRIVATE', { headers: { 'content-type': 'application/json' } })]) {
    let count = 0; const report = await run(async () => { count++; return response; });
    assert.equal(count, 1); assert.equal(report.login, 'unconfirmed'); assert.equal(report.sessionMayRemain, true); assert.doesNotMatch(JSON.stringify(report), /PRIVATE/u);
  }
  const missing = await authenticatedProbe({ fetchImpl: () => { throw new Error('must not run'); } }); assert.equal(missing.requestCount, 0);
});
test('file failure still logs out once; failed logout is not hidden or retried', async () => {
  for (const logoutStatus of [204, 200, 403, 302]) {
    let count = 0; const report = await run(async () => { count++; return count === 1 ? login() : count === 2 ? new Response(null, { status: 302 }) : new Response(null, { status: logoutStatus }); });
    assert.equal(count, 3); assert.equal(report.status, 'stopped'); assert.equal(report.file.reason, 'redirect_not_followed'); assert.equal(report.logout, logoutStatus === 204 ? 'confirmed' : 'unconfirmed');
  }
});
test('correct identity without valid CSRF token stops before any file or logout request', async () => {
  for (const csrf_token of [undefined, '', 'bad\r\nheader', 42]) {
    let calls = 0;
    const report = await run(async () => { calls++; return login({}, { current_user: { uid: '42', name: username }, logout_token: token, csrf_token }); });
    assert.equal(calls, 1); assert.equal(report.reason, 'login_contract_invalid'); assert.equal(report.sessionMayRemain, true);
  }
});
test('control responses enforce byte caps, declared length, full deadlines and late cancellation', async () => {
  for (const response of [login({ 'content-length': '65537' }), new Response('x'.repeat(65537)), login({ 'content-length': '1' })]) {
    let count = 0; const report = await run(async () => { count++; return response; }); assert.equal(count, 1); assert.equal(report.login, 'unconfirmed');
  }
  let resolve, cancelled = 0;
  const pending = authenticatedProbe({ username, password, timeoutMs: 10, fetchImpl: () => new Promise(r => { resolve = r; }) });
  assert.equal((await pending).reason, 'timeout');
  resolve(new Response(new ReadableStream({ cancel() { cancelled++; } }))); await new Promise(r => setImmediate(r)); assert.equal(cancelled, 1);
  const report = await authenticatedProbe({ username, password, timeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } })) });
  assert.equal(report.reason, 'timeout'); assert.equal(cancelled, 2);
});
test('CLI defaults offline, refuses local live and never echoes arguments or credentials', () => {
  for (const args of [[], ['--live'], ['--PRIVATE']]) {
    const result = spawnSync(process.execPath, ['scripts/probe-acled-authenticated.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ACLED_DOWNLOAD_PASSWORD: password } });
    assert.equal(JSON.parse(result.stdout).requestCount, 0); assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE/u);
  }
});
test('workflow is manual, main-only, read-only with step-scoped secrets and no artifact/cache', () => {
  const workflow = readFileSync('.github/workflows/acled-authenticated-file-probe.yml', 'utf8');
  for (const text of ['workflow_dispatch:', 'default: false', 'contents: read', 'github.run_attempt == 1', 'persist-credentials: false', 'ACLED_DOWNLOAD_USERNAME: ${{ secrets.ACLED_DOWNLOAD_USERNAME }}', 'ACLED_DOWNLOAD_PASSWORD: ${{ secrets.ACLED_DOWNLOAD_PASSWORD }}']) assert.ok(workflow.includes(text));
  assert.doesNotMatch(workflow, /schedule:|pull_request|upload-artifact|actions\/cache|contents: write|npm (?:ci|install)/u);
  assert.ok(workflow.indexOf('ACLED_DOWNLOAD_PASSWORD') > workflow.indexOf('name: One bounded authenticated probe'));
});
