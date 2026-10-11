import { isFreightIndexValue } from './stockq-freight.mjs';

// ADR-0067: public homepage ticker, aggregate context only; no access-control bypass.
export const BALTIC_TICKER_URL = 'https://blacksun-api.balticexchange.com/api/ticker';
const SYMBOLS = ['BDTI', 'BCTI', 'BDI'];
const TITLES = ['Baltic Dirty Tanker Index', 'Baltic Clean Tanker Index', 'Baltic Dry Index'];
const DAY_MS = 86400000;

function observationDay(raw) {
  // The publisher omits timezone. Retain its calendar date, not an invented UTC time.
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/u.test(raw)) {
    throw new Error('baltic_date_invalid');
  }
  const date = raw.slice(0, 10);
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw new Error('baltic_date_invalid');
  return ms;
}

export function parseBalticTicker(payload, { nowMs = Date.now() } = {}) {
  if (!Array.isArray(payload) || payload.length > 64 || !Number.isFinite(nowMs)) throw new Error('baltic_payload_invalid');
  return SYMBOLS.map((symbol, index) => {
    try {
      const matches = payload.filter(item => item?.indexDataSetName === symbol);
      if (matches.length !== 1) throw new Error('baltic_identity_invalid');
      const item = matches[0];
      if (item.indexName !== symbol || item.indexDataSetTitle !== TITLES[index]) throw new Error('baltic_identity_invalid');
      const value = item.current?.value;
      if (!isFreightIndexValue(value)) throw new Error('baltic_value_invalid');
      const day = observationDay(item.current?.indexDate);
      const age = nowMs - day;
      if (age < 0 || age > 7 * DAY_MS) throw new Error('baltic_observation_stale');
      let dailyChangePct = null;
      if (isFreightIndexValue(item.previous?.value)) {
        try {
          const priorDay = observationDay(item.previous.indexDate);
          if (priorDay < day && day - priorDay <= 7 * DAY_MS) {
            const change = value / item.previous.value - 1;
            if (Number.isFinite(change) && Math.abs(change) <= 2) dailyChangePct = change;
          }
        } catch { /* Invalid previous quote must not be joined to a valid new value. */ }
      }
      return { status: 'fulfilled', value: { symbol, value, dailyChangePct,
        updatedAt: new Date(day).toISOString(), provider: 'BalticExchangePublicTicker', url: BALTIC_TICKER_URL } };
    } catch (reason) {
      return { status: 'rejected', reason };
    }
  });
}

export async function fetchBalticFreight({ fetchImpl = fetch, nowMs = Date.now(), timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const maxBytes = 65536;
  let reader;
  try {
    const response = await fetchImpl(BALTIC_TICKER_URL, {
      signal: controller.signal, redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': 'GFRRBot/1.0' },
    });
    if (!response.ok) throw new Error('baltic_http_unavailable');
    if (!/\bapplication\/json\b/iu.test(response.headers.get('content-type') || '')) throw new Error('baltic_content_invalid');
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error('baltic_response_too_large');
    if (!response.body) throw new Error('baltic_body_missing');
    reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw new Error('baltic_response_too_large');
      chunks.push(next.value);
    }
    return parseBalticTicker(JSON.parse(Buffer.concat(chunks).toString('utf8')), { nowMs });
  } catch (error) {
    const known = new Set(['baltic_http_unavailable', 'baltic_content_invalid', 'baltic_response_too_large', 'baltic_body_missing', 'baltic_payload_invalid']);
    throw new Error(controller.signal.aborted ? 'baltic_timeout' : known.has(error.message) ? error.message : 'baltic_fetch_invalid');
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
  }
}
