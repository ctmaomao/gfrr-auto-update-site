// ICE delayed futures proxy, never EIA spot or official settlement.
export const ICE_BRENT_CONTRACT_DATA_URL = 'https://www.ice.com/marketdata/api/productguide/charting/contract-data?productId=254&hubId=403';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function quoteTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))? (AM|PM) (?:GMT|UTC)$/u);
  if (!match) return null;
  const [, month, day, year, hour, minute, second = '0', meridiem] = match;
  const h = Number(hour), m = Number(month), d = Number(day), y = Number(year);
  if (h < 1 || h > 12 || m < 1 || m > 12 || d < 1 || Number(minute) > 59 || Number(second) > 59) return null;
  const time = Date.UTC(y, m - 1, d, h % 12 + (meridiem === 'PM' ? 12 : 0), Number(minute), Number(second));
  const date = new Date(time);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString();
}

export function parseIceBrentCandidate(rows, fetchedAt) {
  const base = { source: 'ice', value: null, observedAt: null, fetchedAt, delayClass: 'delayed-15m', available: false };
  const unavailable = reason => ({ ...base, reason });
  const reference = Date.parse(fetchedAt);
  if (!Number.isFinite(reference)) return unavailable('parse-failed:reference-time');
  if (!Array.isArray(rows) || !rows.length || rows.length > 256) return unavailable('parse-failed:contracts');
  const contracts = [];
  for (const row of rows) {
    const match = typeof row?.marketStrip === 'string' ? row.marketStrip.match(/^([A-Z][a-z]{2})(\d{2})$/u) : null;
    const month = match ? MONTHS.indexOf(match[1]) : -1;
    if (month < 0) return unavailable('parse-failed:contract-month');
    contracts.push({ row, month: (2000 + Number(match[2])) * 12 + month });
  }
  // Select identity BEFORE price/time validation: never substitute a deferred
  // contract just because the nearest contract has a missing/stale quote.
  contracts.sort((a, b) => a.month - b.month);
  const first = contracts[0];
  if (contracts[1]?.month === first.month) return unavailable('parse-failed:ambiguous-front');
  const current = new Date(reference);
  if (first.month < current.getUTCFullYear() * 12 + current.getUTCMonth()) return unavailable('parse-failed:expired-contract');
  const { row } = first;
  if (!Number.isSafeInteger(row.marketId) || row.marketId <= 0) return unavailable('parse-failed:market-id');
  if (typeof row.lastPrice !== 'number' || !Number.isFinite(row.lastPrice) || row.lastPrice < 30 || row.lastPrice > 150) return unavailable('parse-failed:value');
  const observedAt = quoteTimestamp(row.lastTime);
  if (!observedAt) return unavailable('parse-failed:observedAt');
  if (Date.parse(observedAt) > reference) return unavailable('parse-failed:future-observedAt');
  // Old timestamps remain old; the existing consensus freshness gate excludes
  // them. No fetchedAt substitution and no change to promotion thresholds.
  return { ...base, value: row.lastPrice, observedAt, available: true, reason: null,
    contract: row.marketStrip, marketId: row.marketId };
}
