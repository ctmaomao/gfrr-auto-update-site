import { FILE_PROBE, probeAcledFile } from './acled-file-probe.mjs';

export const AUTH_PROBE = Object.freeze({ loginUrl: 'https://acleddata.com/user/login?_format=json',
  logoutUrl: 'https://acleddata.com/user/logout?_format=json', controlMaxBytes: 65536, timeoutMs: 15000, requests: 3 });

// Deliberately support only a secure Drupal session cookie, not a general cookie jar.
export function sessionCookie(headers, now = Date.now()) {
  const entries = headers.getSetCookie();
  if (entries.length > 20 || entries.join('').length > 16384) throw new Error('cookie_invalid');
  const sessions = entries.filter(value => /^S?SESS/i.test(value));
  if (sessions.length !== 1) throw new Error('cookie_invalid');
  const [pair, ...attributes] = sessions[0].split(';').map(value => value.trim());
  if (!/^SSESS[a-f0-9]{32}=[A-Za-z0-9_-]{16,256}$/u.test(pair)) throw new Error('cookie_invalid');
  const attrs = new Map();
  for (const attribute of attributes) {
    const pos = attribute.indexOf('='), key = (pos < 0 ? attribute : attribute.slice(0, pos)).toLowerCase();
    if (attrs.has(key) || /[\x00-\x1f\x7f]/u.test(attribute)) throw new Error('cookie_invalid');
    attrs.set(key, pos < 0 ? '' : attribute.slice(pos + 1));
  }
  if (attrs.get('secure') !== '' || attrs.get('httponly') !== '' || attrs.get('path') !== '/') throw new Error('cookie_invalid');
  if (attrs.has('domain') && !['acleddata.com', '.acleddata.com'].includes(attrs.get('domain').toLowerCase())) throw new Error('cookie_invalid');
  if (attrs.has('max-age')) {
    if (!/^\d+$/u.test(attrs.get('max-age')) || Number(attrs.get('max-age')) <= 0) throw new Error('cookie_invalid');
  } else if (attrs.has('expires') && !(Date.parse(attrs.get('expires')) > now)) throw new Error('cookie_invalid');
  return pair;
}

// Full-response deadline, including bodies; late responses are cancelled without parsing.
async function controlRequest(url, options, fetchImpl, timeoutMs) {
  const controller = new AbortController(); let timer, reader, httpStatus = null, receivedBytes = 0;
  const fail = reason => ({ ok: false, reason, httpStatus, receivedBytes });
  const operation = async () => {
    const response = await fetchImpl(url, { ...options, redirect: 'manual', signal: controller.signal });
    if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return fail('timeout'); }
    httpStatus = response.status;
    if (![200, 204].includes(httpStatus)) { void response.body?.cancel().catch(() => {}); return fail('http_not_ok'); }
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/u.test(length) || Number(length) > AUTH_PROBE.controlMaxBytes)) {
      void response.body?.cancel().catch(() => {}); return fail('byte_limit');
    }
    const chunks = [];
    if (response.body) {
      reader = response.body.getReader();
      while (true) {
        const part = await reader.read();
        if (controller.signal.aborted) return fail('timeout');
        if (part.done) break;
        receivedBytes += part.value.byteLength;
        if (receivedBytes > AUTH_PROBE.controlMaxBytes) return fail('byte_limit');
        chunks.push(Buffer.from(part.value));
      }
    }
    if (length !== null && Number(length) !== receivedBytes) return fail('length_mismatch');
    return { ok: true, httpStatus, receivedBytes, headers: response.headers, bytes: Buffer.concat(chunks) };
  };
  try {
    return await Promise.race([operation(), new Promise(resolve => { timer = setTimeout(() => {
      controller.abort(); void reader?.cancel().catch(() => {}); resolve(fail('timeout'));
    }, timeoutMs); })]);
  } catch { return fail('network_or_body_error'); }
  finally { clearTimeout(timer); controller.abort(); void reader?.cancel().catch(() => {}); }
}

export async function authenticatedProbe({ username, password, fetchImpl = fetch, timeoutMs = AUTH_PROBE.timeoutMs } = {}) {
  const report = { schemaVersion: 'acled-authenticated-probe-v1', requestCount: 0, status: 'stopped',
    login: 'not_attempted', logout: 'not_attempted', sessionMayRemain: false,
    productionWritten: false, rawFileSaved: false, rowValidation: 'not_performed' };
  if (![username, password].every(value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\x00-\x1f\x7f]/u.test(value))) {
    return { ...report, reason: 'credentials_missing_or_invalid' };
  }
  let cookie, logoutToken, csrfToken;
  report.requestCount++;
  const login = await controlRequest(AUTH_PROBE.loginUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name: username, pass: password }) }, fetchImpl, timeoutMs);
  report.loginHttpStatus = login.httpStatus; report.loginBytes = login.receivedBytes;
  // Even an interrupted/invalid login can have created a server-side session.
  report.sessionMayRemain = true;
  if (!login.ok) return { ...report, login: 'unconfirmed', reason: login.reason };
  try {
    if (login.httpStatus !== 200 || (login.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error();
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(login.bytes));
    if (!/^[1-9]\d*$/u.test(String(payload?.current_user?.uid ?? '')) || payload.current_user.name !== username
      || ![payload.logout_token, payload.csrf_token].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,256}$/u.test(value))) throw new Error();
    cookie = sessionCookie(login.headers); logoutToken = payload.logout_token; csrfToken = payload.csrf_token;
  } catch { return { ...report, login: 'unconfirmed', reason: 'login_contract_invalid' }; }
  report.login = 'confirmed';
  try {
    report.requestCount++;
    const file = await probeAcledFile({ timeoutMs, fetchImpl: (url, options) => {
      if (url !== FILE_PROBE.url) throw new Error();
      return fetchImpl(url, { ...options, headers: { ...options.headers, Cookie: cookie } });
    } });
    // Do not copy the anonymous probe's authentication claim into this report.
    const { requestCount, authenticated, ...result } = file;
    report.file = result;
    if (file.status === 'workbook_container_verified') report.status = 'workbook_container_verified';
  } finally {
    report.requestCount++;
    const logout = await controlRequest(`${AUTH_PROBE.logoutUrl}&token=${encodeURIComponent(logoutToken)}`, {
      method: 'POST', headers: { Cookie: cookie, Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } }, fetchImpl, timeoutMs);
    report.logoutHttpStatus = logout.httpStatus; report.logoutBytes = logout.receivedBytes;
    // Drupal's RPC returns 204 on successful session destruction. Other responses are unconfirmed.
    report.logout = logout.ok && logout.httpStatus === 204 && logout.receivedBytes === 0 ? 'confirmed' : 'unconfirmed';
    report.sessionMayRemain = report.logout !== 'confirmed';
    if (report.sessionMayRemain) report.status = 'stopped';
    cookie = null; logoutToken = null; csrfToken = null;
  }
  return report;
}
