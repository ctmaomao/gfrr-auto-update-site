import { AUTH_PROBE, controlRequest, sessionCookie } from './acled-authenticated-probe.mjs';
import { DETAIL_PAGES, extractDetailLink } from './acled-detail-discovery.mjs';
import { readAcledBatch } from './acled-batch-reader.mjs';

// No default transport or execution entry point. Login, discovery, files and logout
// share one short-lived session; only successful logout releases the full batch.
export async function collectAcledSessionBatch({ username, password, fetchImpl, timeoutMs = 15000, scope = 'pair' } = {}) {
  const report = { status: 'stopped', requestCount: 0, login: 'not_attempted', logout: 'not_attempted',
    sessionMayRemain: false, pages: [], files: [], contentValidated: false, productionEligible: false,
    productionWritten: false, rawFileSaved: false };
  const result = { report, workbooks: null };
  if (!['pair', 'weekly'].includes(scope) || typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000
    || ![username, password].every(v => typeof v === 'string' && v.length > 0 && v.length <= 1024 && !/[\x00-\x1f\x7f]/u.test(v))) {
    report.reason = 'invalid_context'; return result;
  }
  report.requestCount++;
  const login = await controlRequest(AUTH_PROBE.loginUrl, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name: username, pass: password }) }, fetchImpl, timeoutMs);
  report.loginHttpStatus = login.httpStatus; report.loginBytes = login.receivedBytes;
  report.sessionMayRemain = true;
  if (!login.ok) { report.login = 'unconfirmed'; report.reason = login.reason; return result; }
  let cookie, csrfToken, logoutToken;
  try {
    if (login.httpStatus !== 200 || (login.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error();
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(login.bytes));
    if (!/^[1-9]\d*$/u.test(String(value?.current_user?.uid ?? '')) || value.current_user.name !== username
      || ![value.logout_token, value.csrf_token].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{16,256}$/u.test(v))) throw new Error();
    cookie = sessionCookie(login.headers); csrfToken = value.csrf_token; logoutToken = value.logout_token;
  } catch { report.login = 'unconfirmed'; report.reason = 'login_contract_invalid'; return result; }
  report.login = 'confirmed';
  let workbooks = null;
  try {
    const urls = [];
    for (const page of DETAIL_PAGES.filter(p => scope === 'pair' || p.kind === 'weekly')) {
      report.requestCount++;
      const response = await controlRequest(page.url, { method: 'GET', headers: { Cookie: cookie, Accept: 'text/html' } }, fetchImpl, timeoutMs, 'html');
      report.pages.push({ kind: page.kind, identity: page.identity, httpStatus: response.httpStatus, bytes: response.receivedBytes });
      if (!response.ok) { report.reason = 'detail_read_failed'; return result; }
      try { urls.push(extractDetailLink(new TextDecoder('utf-8', { fatal: true }).decode(response.bytes), page)); }
      catch { report.reason = 'detail_link_failed'; return result; }
    }
    const allowed = new Set(urls);
    const batch = await readAcledBatch({ urls, timeoutMs, scope, fetchImpl: (url, options) => {
      if (!allowed.has(url)) throw new Error('unexpected_target');
      return fetchImpl(url, { ...options, headers: { ...options.headers, Cookie: cookie } });
    } });
    report.requestCount += batch.report.requestCount;
    report.files = batch.report.files;
    if (batch.report.status !== 'zip_batch_read') { report.reason = batch.report.reason; return result; }
    workbooks = batch.workbooks;
  } catch { report.reason = 'collection_failed'; }
  finally {
    report.requestCount++;
    const logout = await controlRequest(`${AUTH_PROBE.logoutUrl}&token=${encodeURIComponent(logoutToken)}`, { method: 'POST',
      headers: { Cookie: cookie, Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } }, fetchImpl, timeoutMs);
    report.logoutHttpStatus = logout.httpStatus; report.logoutBytes = logout.receivedBytes;
    report.logout = logout.ok && logout.httpStatus === 204 && logout.receivedBytes === 0 ? 'confirmed' : 'unconfirmed';
    report.sessionMayRemain = report.logout !== 'confirmed';
    if (!report.sessionMayRemain && workbooks) { report.status = 'authenticated_zip_batch_read'; result.workbooks = workbooks; }
    else if (report.sessionMayRemain) report.reason = 'logout_unconfirmed';
    cookie = null; csrfToken = null; logoutToken = null; workbooks = null;
  }
  return result;
}
