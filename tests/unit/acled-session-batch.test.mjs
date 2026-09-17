import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAcledSessionBatch } from '../../scripts/world-order/acled-session-batch.mjs';
import { DETAIL_PAGES } from '../../scripts/world-order/acled-detail-discovery.mjs';
import { AUTH_PROBE } from '../../scripts/world-order/acled-authenticated-probe.mjs';

const username = 'fixture@example.invalid', password = 'PRIVATE_PASSWORD', token = 'PRIVATE_TOKEN_123456789';
const cookie = `SSESS${'a'.repeat(32)}=PRIVATE_SESSION_123456`;
const link = p => `https://acleddata.com/system/files/2026-09/${p.kind === 'monthly' ? `number_of_${p.identity}_as-of-11Sep2026` : `${p.identity}_aggregated_data_up_to_week_of-2026-09-05`}.xlsx`;
function zip() {
  const local = Buffer.alloc(31), central = Buffer.alloc(47), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(1, 26); local[30] = 120;
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(1, 28); central[46] = 120;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(47, 12); end.writeUInt32LE(31, 16);
  return Buffer.concat([local, central, end]);
}
function fake({ failPage = false, failFile = false, failLogout = false, badLogin = false, hangFile = false } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'manual');
    if (url === AUTH_PROBE.loginUrl) return new Response(JSON.stringify({ current_user: { uid: '42', name: badLogin ? 'wrong' : username }, logout_token: token, csrf_token: token }),
      { headers: { 'content-type': 'application/json', 'set-cookie': `${cookie}; Path=/; Secure; HttpOnly` } });
    assert.equal(options.headers.Cookie, cookie);
    if (url.startsWith(AUTH_PROBE.logoutUrl)) return new Response(null, { status: failLogout ? 500 : 204 });
    const page = DETAIL_PAGES.find(p => p.url === url);
    if (page) return new Response(failPage ? 'PRIVATE' : `<a href="${link(page)}">file</a>`, { headers: { 'content-type': 'text/html' } });
    assert.ok(DETAIL_PAGES.some(p => link(p) === url));
    if (hangFile) return new Promise(() => {});
    return new Response(failFile ? 'PRIVATE' : zip(), { headers: { 'content-type': 'application/octet-stream' } });
  } };
}
const run = f => collectAcledSessionBatch({ username, password, fetchImpl: f.fetchImpl, timeoutMs: 30 });
test('one session: 26 serial requests, whole batch released only after confirmed logout', async () => {
  const f = fake(), r = await run(f);
  assert.equal(f.calls.length, 26); assert.equal(r.report.requestCount, 26);
  assert.equal(r.report.status, 'authenticated_zip_batch_read'); assert.equal(r.workbooks.length, 12);
  assert.equal(r.report.logout, 'confirmed'); assert.equal(r.report.sessionMayRemain, false);
  assert.equal(r.report.contentValidated, false); assert.equal(r.report.productionEligible, false);
  assert.doesNotMatch(JSON.stringify(r.report), /PRIVATE|fixture@|SSESS|<a|https:/u);
});
test('each failure stops and discards all buffers; confirmed login always attempts logout once', async () => {
  for (const [flags, count] of [[{ failPage: true }, 3], [{ failFile: true }, 15], [{ failLogout: true }, 26], [{ hangFile: true }, 15]]) {
    const f = fake(flags), r = await run(f);
    assert.equal(f.calls.length, count); assert.equal(r.report.requestCount, count);
    assert.equal(r.workbooks, null); assert.equal(r.report.status, 'stopped');
    assert.equal(f.calls.filter(u => u.startsWith(AUTH_PROBE.logoutUrl)).length, 1);
    assert.equal(r.report.sessionMayRemain, Boolean(flags.failLogout));
    assert.doesNotMatch(JSON.stringify(r.report), /PRIVATE|fixture@|SSESS/u);
  }
});
test('invalid context is zero-request; uncertain login is disclosed without unsafe logout', async () => {
  const r = await collectAcledSessionBatch({ username, password });
  assert.equal(r.report.requestCount, 0);
  const f = fake({ badLogin: true }), failed = await run(f);
  assert.equal(f.calls.length, 1); assert.equal(failed.report.sessionMayRemain, true);
  assert.equal(failed.report.logout, 'not_attempted'); assert.equal(failed.workbooks, null);
});
