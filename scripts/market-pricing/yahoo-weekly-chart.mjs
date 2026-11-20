const CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
export const RANGE = '10y';
export const INTERVAL = '1wk';
const TIMEOUT_MS = 8000;

export async function fetchYahooChart(encodedSymbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = `${CHART_BASE}/${encodedSymbol}?range=${RANGE}&interval=${INTERVAL}`;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GFRRBot/1.0',
        Referer: 'https://finance.yahoo.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`yahoo_chart_http_${response.status}`);
    }

    return {
      url,
      json: await response.json()
    };
  } finally {
    clearTimeout(timeout);
  }
}
