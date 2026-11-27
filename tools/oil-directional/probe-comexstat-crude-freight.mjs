import { pathToFileURL } from 'node:url';

const endpoint = 'https://api-comexstat.mdic.gov.br/general?language=en';
const crudeNcm = '27090010';
const maxBytes = 128_000;
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;

function requireMonth(month) {
  if (typeof month !== 'string' || !monthPattern.test(month)) throw Error('Expected YYYY-MM');
}

function declaredInteger(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value) : NaN;
}

export function normalizeComexFreight(payload, month) {
  requireMonth(month);
  const list = payload?.data?.list;
  if (payload?.success !== true || !Array.isArray(list) || !list.length || list.length > 250) {
    throw Error('No usable Comex Stat rows for requested month');
  }
  const origins = new Set();
  const rows = list.map(item => {
    const origin = typeof item?.country === 'string' ? item.country.trim() : '';
    const netKg = declaredInteger(item?.metricKG);
    const freightUsd = declaredInteger(item?.metricFreight);
    if (`${item?.year}-${item?.monthNumber}` !== month || item?.coNcm !== crudeNcm || item?.via !== 'MARITIMA'
        || !origin || origins.has(origin) || !(netKg > 0) || !Number.isFinite(freightUsd)) {
      throw Error('Unexpected month, commodity, mode, origin, or amount');
    }
    origins.add(origin);
    return { origin, netKg, freightUsd, usdPerNetTonne: freightUsd > 0 ? Number((freightUsd / (netKg / 1000)).toFixed(2)) : null };
  });
  rows.sort((a, b) => a.origin.localeCompare(b.origin, 'en'));
  return { month, source: endpoint, destination: 'Brazil', ncm: crudeNcm, basis: 'declared_monthly_maritime_import_freight_by_origin', rows };
}

// Read-only research probe: one explicit published month; no retry, auth, or production writes.
export async function fetchComexFreight(month, fetchImpl = fetch) {
  requireMonth(month);
  const response = await fetchImpl(endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      flow: 'import', monthDetail: true, period: { from: month, to: month },
      filters: [{ filter: 'ncm', values: [crudeNcm] }, { filter: 'via', values: ['01'] }],
      details: ['country', 'via', 'ncm'], metrics: ['metricKG', 'metricFreight'],
    }),
  });
  if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
    await response.body?.cancel();
    throw Error('Comex Stat response unavailable');
  }
  const chunks = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Error('Comex Stat response exceeds 128 kB');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return normalizeComexFreight(JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')), month);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await fetchComexFreight(process.argv[2]), null, 2));
}
