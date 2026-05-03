const FRED_SERIES = {
  brent: 'DCOILBRENTEU',
  dxy: 'DTWEXBGS',
  hyOas: 'BAMLH0A0HYM2',
  vix: 'VIXCLS',
  spx: 'SP500',
  us10y: 'DGS10',
  us2y: 'DGS2',
  real10y: 'DFII10',
  breakeven10y: 'T10YIE',
};

const CRITICAL_FIELDS = ['brent', 'dxy', 'hyOas', 'vix', 'us10y', 'real10y'];
const GOLD_URL = 'https://api.gold-api.com/price/XAU';
const YAHOO_BRENT_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d';
const STOOQ_BRENT_URL = 'https://stooq.com/q/d/l/?s=brn.f&i=d';
const GOOGLE_FINANCE_BRENT_URL = 'https://www.google.com/finance/beta/quote/BZW00:NYMEX';
const TRADING_ECONOMICS_BRENT_URL =
  'https://tradingeconomics.com/commodity/brent-crude-oil';
const TRADING_ECONOMICS_ALT_BRENT_URL =
  'https://tradingeconomics.com/commodity/brentcrudeoil';
const CBOE_VIX_HISTORY_URL = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
const YAHOO_TNX_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d';
const YAHOO_GOLD_FUTURES_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=5d';
const YAHOO_DXY_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d';
const YAHOO_ALT_DXY_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EDXY?interval=1d&range=5d';
const STOOQ_DXY_SYMBOLS = ['dxy', 'dxy.us', 'dx.f'];
const TREASURY_DAILY_RATES_URL =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=5';
const HY_OAS_PROXY_SERIES = 'BAMLH0A0HYM2EY';
const ALPHA_VANTAGE_VIX_SOURCE = 'alphavantage:VIX';
const ALPHA_VANTAGE_GOLD_SOURCE = 'alphavantage:XAU';
const TRADING_ECONOMICS_HY_SOURCE = 'tradingeconomics:hy-credit';
const DIAGNOSTIC_ERROR_MAX = 180;
const SECONDARY_DIAGNOSTICS_ENABLED = false;
const SECONDARY_DIAGNOSTICS_DISABLED_REASON =
  'disabled-by-default-after-v28.0D-1-stability-rollback';
const SECONDARY_DIAGNOSTICS_DISABLED_NOTE =
  'Core Worker preview generation is prioritized; secondary diagnostics require low-frequency redesign before re-enabling.';

const FETCH_HEADERS = {
  Accept: 'text/csv,application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (compatible; GFRRWorkerPreview/28.0B-2A; +https://ctmaomao.github.io/gfrr-auto-update-site/)',
};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundValue(value, digits = 4) {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseNumeric(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().replace(/[$,\s]/g, '');
  if (text === '' || text === '.' || text === '-') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function truncateDiagnosticError(error) {
  if (error == null) return null;
  const text = String(error);
  return text.length > DIAGNOSTIC_ERROR_MAX
    ? `${text.slice(0, DIAGNOSTIC_ERROR_MAX - 3)}...`
    : text;
}

function diagnosticDelayMs() {
  return 150 + Math.floor(Math.random() * 151);
}

function getOptionalEnvValue(_name) {
  const container = globalThis?.GFRR_OPTIONAL_ENV;
  if (container && typeof container === 'object' && typeof container[_name] === 'string') {
    return container[_name];
  }
  const value = globalThis?.[_name];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs() {
  return 300 + Math.floor(Math.random() * 501);
}

function sourceReason(status, error) {
  if (status === 429) return 'rate-limited';
  if (status === 522) return 'connection-timeout-or-origin-unreachable';
  if (status === 520) return 'origin-returned-520';
  if (status && status >= 400) return 'http-error';
  if (error) return 'fetch-or-parse-error';
  return null;
}

function normalizeDiagnostic(result) {
  return {
    ok: result.ok,
    status: result.status,
    statusText: result.statusText,
    urlHost: result.urlHost,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    bodyLength: result.bodyLength,
    durationMs: result.durationMs,
    error: result.error,
    retryCount: result.retryCount,
    reason: sourceReason(result.status, result.error),
  };
}

async function fetchTextWithDiagnostics(url, options = {}) {
  const headers = { ...FETCH_HEADERS, ...(options.headers ?? {}) };
  let last = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = Date.now();
    const parsedUrl = new URL(url);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers,
      });
      const text = await response.text();
      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        urlHost: parsedUrl.host,
        finalUrl: response.url || url,
        contentType: response.headers.get('content-type'),
        bodyLength: text.length,
        durationMs: Date.now() - startedAt,
        error: response.ok ? null : `HTTP ${response.status}`,
        retryCount: attempt,
        text,
      };

      if (response.ok || attempt === 1) return result;
      last = result;
    } catch (err) {
      last = {
        ok: false,
        status: null,
        statusText: null,
        urlHost: parsedUrl.host,
        finalUrl: url,
        contentType: null,
        bodyLength: 0,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
        retryCount: attempt,
        text: '',
      };
      if (attempt === 1) return last;
    }

    await sleep(retryDelayMs());
  }

  return last;
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  out.push(current);
  return out;
}

function latestTwoCsvValues(text, valueColumnIndex = 1) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => splitCsvLine(line));
  const values = [];

  for (const row of rows) {
    const value = parseNumeric(row[valueColumnIndex]);
    if (value != null) {
      values.push({ timestamp: row[0] || null, value });
    }
  }

  return {
    latest: values.at(-1) ?? null,
    previous: values.at(-2) ?? null,
  };
}

async function fetchFredSeries(name, seriesId, cosd) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?cosd=${cosd}&id=${seriesId}`;
  const result = await fetchTextWithDiagnostics(url);
  const diagnostic = normalizeDiagnostic(result);
  const source = `FRED:${seriesId}`;

  if (!result.ok) {
    return {
      name,
      value: null,
      change: null,
      detail: {
        ok: false,
        value: null,
        source,
        timestamp: null,
        error: result.error,
        httpStatus: result.status,
        contentType: result.contentType,
        bodyLength: result.bodyLength,
        durationMs: result.durationMs,
        fredUrlHost: result.urlHost,
        fredHttpStatus: result.status,
        fredBodyLength: result.bodyLength,
        fredContentType: result.contentType,
        fredError: result.error,
        retryCount: result.retryCount,
      },
      diagnostic,
    };
  }

  const { latest, previous } = latestTwoCsvValues(result.text);
  if (!latest) {
    return {
      name,
      value: null,
      change: null,
      detail: {
        ok: false,
        value: null,
        source,
        timestamp: null,
        error: 'no numeric value',
        httpStatus: result.status,
        contentType: result.contentType,
        bodyLength: result.bodyLength,
        durationMs: result.durationMs,
        fredUrlHost: result.urlHost,
        fredHttpStatus: result.status,
        fredBodyLength: result.bodyLength,
        fredContentType: result.contentType,
        fredError: 'no numeric value',
        retryCount: result.retryCount,
      },
      diagnostic,
    };
  }

  return {
    name,
    value: roundValue(latest.value),
    change: previous ? roundValue(latest.value - previous.value) : null,
    detail: {
      ok: true,
      value: roundValue(latest.value),
      source,
      timestamp: latest.timestamp,
      error: null,
      httpStatus: result.status,
      contentType: result.contentType,
      bodyLength: result.bodyLength,
      durationMs: result.durationMs,
      fredUrlHost: result.urlHost,
      fredHttpStatus: result.status,
      fredBodyLength: result.bodyLength,
      fredContentType: result.contentType,
      fredError: null,
      retryCount: result.retryCount,
    },
    diagnostic,
  };
}

async function fetchAllFredSeries(cosd) {
  const results = [];
  const entries = Object.entries(FRED_SERIES);

  for (let i = 0; i < entries.length; i += 1) {
    const [name, seriesId] = entries[i];
    results.push(await fetchFredSeries(name, seriesId, cosd));
    if (i < entries.length - 1) {
      await sleep(150 + Math.floor(Math.random() * 151));
    }
  }

  return results;
}

async function fetchGold() {
  const result = await fetchTextWithDiagnostics(GOLD_URL, {
    headers: { Accept: 'application/json,text/plain,*/*' },
  });
  const diagnostic = normalizeDiagnostic(result);

  if (!result.ok) {
    return {
      value: null,
      change: null,
      detail: {
        ok: false,
        value: null,
        source: GOLD_URL,
        timestamp: null,
        error: result.error,
        httpStatus: result.status,
        contentType: result.contentType,
        bodyLength: result.bodyLength,
        durationMs: result.durationMs,
        retryCount: result.retryCount,
      },
      diagnostic,
    };
  }

  try {
    const payload = JSON.parse(result.text);
    const value = parseNumeric(payload?.price);

    return {
      value: value == null ? null : roundValue(value),
      change: null,
      detail: {
        ok: value != null,
        value: value == null ? null : roundValue(value),
        source: GOLD_URL,
        timestamp: payload?.updatedAt ?? payload?.timestamp ?? null,
        error: value == null ? 'missing price' : null,
        httpStatus: result.status,
        contentType: result.contentType,
        bodyLength: result.bodyLength,
        durationMs: result.durationMs,
        retryCount: result.retryCount,
      },
      diagnostic: {
        ...diagnostic,
        ok: value != null,
        error: value == null ? 'missing price' : diagnostic.error,
        reason: value == null ? 'fetch-or-parse-error' : diagnostic.reason,
      },
    };
  } catch (err) {
    return {
      value: null,
      change: null,
      detail: {
        ok: false,
        value: null,
        source: GOLD_URL,
        timestamp: null,
        error: err instanceof Error ? err.message : String(err),
        httpStatus: result.status,
        contentType: result.contentType,
        bodyLength: result.bodyLength,
        durationMs: result.durationMs,
        retryCount: result.retryCount,
      },
      diagnostic: {
        ...diagnostic,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        reason: 'fetch-or-parse-error',
      },
    };
  }
}

function buildCandidateDiagnostics(result, parseError = null) {
  return {
    status: result.status,
    contentType: result.contentType,
    bodyLength: result.bodyLength,
    durationMs: result.durationMs,
    error: parseError ?? result.error,
    retryCount: result.retryCount,
    reason: sourceReason(result.status, parseError ?? result.error),
  };
}

function buildSecondaryCandidate({
  source,
  metric,
  role = 'diagnostic',
  quality = 'experimental',
  primaryValue,
  value = null,
  timestamp = null,
  error = null,
  result = null,
  note = null,
}) {
  const numericPrimary = isFiniteNumber(primaryValue) ? primaryValue : null;
  const numericValue = isFiniteNumber(value) ? value : null;
  const absDiff = numericPrimary != null && numericValue != null
    ? roundValue(Math.abs(numericValue - numericPrimary))
    : null;
  const diff = numericPrimary != null && numericValue != null
    ? roundValue(numericValue - numericPrimary)
    : null;
  const pctDiff = numericPrimary != null && numericPrimary !== 0 && numericValue != null
    ? roundValue((Math.abs(numericValue - numericPrimary) / Math.abs(numericPrimary)) * 100)
    : null;

  return {
    source,
    metric,
    role,
    participatesInPrimary: false,
    participatesInValidation: false,
    quality,
    ok: numericValue != null && error == null,
    value: numericValue,
    timestamp,
    error: truncateDiagnosticError(error),
    httpStatus: result?.status ?? null,
    contentType: result?.contentType ?? null,
    bodyLength: result?.bodyLength ?? null,
    durationMs: result?.durationMs ?? null,
    retryCount: result?.retryCount ?? null,
    diffFromPrimary: diff,
    pctDiffFromPrimary: pctDiff,
    absDiffFromPrimary: absDiff,
    ...(note ? { note } : {}),
  };
}

function buildSkippedSecondaryCandidate(source, metric, role = 'diagnostic') {
  return buildSecondaryCandidate({
    source,
    metric,
    role,
    quality: 'optional-api-key',
    error: 'skipped-missing-api-key',
  });
}

function parseYahooChartClose(text, transform = (value) => value) {
  const payload = JSON.parse(text);
  const result = payload?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const parsed = parseNumeric(closes[i]);
    if (parsed != null) {
      return {
        value: roundValue(transform(parsed)),
        timestamp: timestamps[i] ? new Date(timestamps[i] * 1000).toISOString() : null,
      };
    }
  }

  throw new Error('no numeric close');
}

function parseCboeVixHistory(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => splitCsvLine(line));
  const header = rows.shift()?.map((item) => item.trim().toLowerCase()) ?? [];
  const dateIndex = header.findIndex((name) => name === 'date');
  const closeIndex = header.findIndex((name) => name === 'close');
  if (dateIndex < 0 || closeIndex < 0) throw new Error('missing DATE/CLOSE columns');

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const value = parseNumeric(rows[i]?.[closeIndex]);
    if (value != null) {
      return {
        value: roundValue(value),
        timestamp: rows[i]?.[dateIndex] || null,
      };
    }
  }

  throw new Error('no numeric VIX close');
}

function parseTreasuryDailyRates(text) {
  const payload = JSON.parse(text);
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  for (const row of rows) {
    const entries = Object.entries(row);
    const match = entries.find(([key]) => /10[\s_-]*(yr|year)/i.test(key));
    const value = parseNumeric(match?.[1]);
    if (value != null) {
      return {
        value: roundValue(value),
        timestamp: row.record_date ?? row.date ?? null,
      };
    }
  }

  throw new Error('daily treasury rate 10Y field not found');
}

async function fetchYahooChartSecondary({ url, source, metric, primaryValue, transform, quality, note }) {
  const result = await fetchTextWithDiagnostics(url, {
    headers: { Accept: 'application/json,text/plain,*/*' },
  });
  let parsed = null;
  let parseError = null;

  if (result.ok) {
    try {
      parsed = parseYahooChartClose(result.text, transform);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  }

  return buildSecondaryCandidate({
    source,
    metric,
    quality,
    primaryValue,
    value: parsed?.value ?? null,
    timestamp: parsed?.timestamp ?? null,
    error: parseError ?? result.error,
    result,
    note,
  });
}

function parseAlphaVantageNumber(text, preferredKeys = []) {
  const payload = JSON.parse(text);
  const stack = [payload];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    for (const key of preferredKeys) {
      const value = parseNumeric(item[key]);
      if (value != null) return { value: roundValue(value), timestamp: item.date ?? item.timestamp ?? null };
    }
    for (const [key, value] of Object.entries(item)) {
      if (/close|price|value/i.test(key)) {
        const parsed = parseNumeric(value);
        if (parsed != null) return { value: roundValue(parsed), timestamp: item.date ?? item.timestamp ?? null };
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  throw new Error('no numeric Alpha Vantage value');
}

async function fetchAlphaVantageSecondary({ source, metric, primaryValue, url, preferredKeys }) {
  const result = await fetchTextWithDiagnostics(url, {
    headers: { Accept: 'application/json,text/plain,*/*' },
  });
  let parsed = null;
  let parseError = null;
  if (result.ok) {
    try {
      parsed = parseAlphaVantageNumber(result.text, preferredKeys);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  }
  return buildSecondaryCandidate({
    source,
    metric,
    quality: 'optional-api',
    primaryValue,
    value: parsed?.value ?? null,
    timestamp: parsed?.timestamp ?? null,
    error: parseError ?? result.error,
    result,
  });
}

async function fetchVixSecondarySources(primaryValue) {
  const candidates = [];
  const cboe = await fetchTextWithDiagnostics(CBOE_VIX_HISTORY_URL);
  let cboeParsed = null;
  let cboeError = null;
  if (cboe.ok) {
    try {
      cboeParsed = parseCboeVixHistory(cboe.text);
    } catch (err) {
      cboeError = err instanceof Error ? err.message : String(err);
    }
  }
  candidates.push(buildSecondaryCandidate({
    source: 'cboe:VIX_History',
    metric: 'vix',
    quality: 'official-csv',
    primaryValue,
    value: cboeParsed?.value ?? null,
    timestamp: cboeParsed?.timestamp ?? null,
    error: cboeError ?? cboe.error,
    result: cboe,
  }));

  const alphaKey = getOptionalEnvValue('ALPHA_VANTAGE_API_KEY');
  if (alphaKey) {
    await sleep(diagnosticDelayMs());
    candidates.push(await fetchAlphaVantageSecondary({
      source: ALPHA_VANTAGE_VIX_SOURCE,
      metric: 'vix',
      primaryValue,
      url: `https://www.alphavantage.co/query?function=INDEX_DATA&symbol=VIX&interval=daily&apikey=${encodeURIComponent(alphaKey)}`,
      preferredKeys: ['close', 'Close', 'value'],
    }));
  } else {
    candidates.push(buildSkippedSecondaryCandidate(ALPHA_VANTAGE_VIX_SOURCE, 'vix'));
  }
  return candidates;
}

async function fetchUs10ySecondarySources(primaryValue) {
  const candidates = [];
  const treasury = await fetchTextWithDiagnostics(TREASURY_DAILY_RATES_URL, {
    headers: { Accept: 'application/json,text/plain,*/*' },
  });
  let treasuryParsed = null;
  let treasuryError = null;
  if (treasury.ok) {
    try {
      treasuryParsed = parseTreasuryDailyRates(treasury.text);
    } catch (err) {
      treasuryError = err instanceof Error ? err.message : String(err);
    }
  }
  candidates.push(buildSecondaryCandidate({
    source: 'treasury:daily-rates',
    metric: 'us10y',
    quality: 'diagnostic-experiment',
    primaryValue,
    value: treasuryParsed?.value ?? null,
    timestamp: treasuryParsed?.timestamp ?? null,
    error: treasuryError ?? treasury.error,
    result: treasury,
    note: 'diagnostic experiment; endpoint may not expose constant-maturity 10Y',
  }));

  await sleep(diagnosticDelayMs());
  candidates.push(await fetchYahooChartSecondary({
    url: YAHOO_TNX_URL,
    source: 'yahoo:^TNX',
    metric: 'us10y',
    primaryValue,
    transform: (value) => value / 10,
    quality: 'market-index-proxy',
    note: '^TNX is quoted as 10Y yield x 10; value is divided by 10',
  }));
  return candidates;
}

async function fetchGoldSecondarySources(primaryValue) {
  const candidates = [];
  const alphaKey = getOptionalEnvValue('ALPHA_VANTAGE_API_KEY');
  if (alphaKey) {
    candidates.push(await fetchAlphaVantageSecondary({
      source: ALPHA_VANTAGE_GOLD_SOURCE,
      metric: 'gold',
      primaryValue,
      url: `https://www.alphavantage.co/query?function=GOLD_SILVER_SPOT&symbol=XAU&apikey=${encodeURIComponent(alphaKey)}`,
      preferredKeys: ['price', 'Price', 'close', 'Close'],
    }));
  } else {
    candidates.push(buildSkippedSecondaryCandidate(ALPHA_VANTAGE_GOLD_SOURCE, 'gold'));
  }

  await sleep(diagnosticDelayMs());
  candidates.push(await fetchYahooChartSecondary({
    url: YAHOO_GOLD_FUTURES_URL,
    source: 'yahoo:GC=F',
    metric: 'gold',
    primaryValue,
    transform: (value) => value,
    quality: 'futures-proxy',
    note: 'diagnostic only; COMEX gold futures are not identical to spot XAU',
  }));
  return candidates;
}

async function fetchDxySecondarySources(primaryValue) {
  const candidates = [];
  let yahooSource = 'yahoo:DX-Y.NYB';
  let yahoo = await fetchYahooChartSecondary({
    url: YAHOO_DXY_URL,
    source: yahooSource,
    metric: 'dxy',
    primaryValue,
    transform: (value) => value,
    quality: 'ice-dxy-proxy',
    note: 'diagnostic only; FRED DTWEXBGS is broad dollar index and not identical to ICE DXY',
  });
  if (!yahoo.ok) {
    await sleep(diagnosticDelayMs());
    yahooSource = 'yahoo:^DXY';
    yahoo = await fetchYahooChartSecondary({
      url: YAHOO_ALT_DXY_URL,
      source: yahooSource,
      metric: 'dxy',
      primaryValue,
      transform: (value) => value,
      quality: 'ice-dxy-proxy',
      note: 'diagnostic only; FRED DTWEXBGS is broad dollar index and not identical to ICE DXY',
    });
  }
  candidates.push(yahoo);

  await sleep(diagnosticDelayMs());
  let bestStooq = null;
  for (let i = 0; i < STOOQ_DXY_SYMBOLS.length; i += 1) {
    const symbol = STOOQ_DXY_SYMBOLS[i];
    const result = await fetchTextWithDiagnostics(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`);
    let parsed = null;
    let parseError = null;
    if (result.ok) {
      try {
        const { latest } = latestTwoCsvValues(result.text, 4);
        if (!latest) throw new Error('no numeric close');
        parsed = { value: roundValue(latest.value), timestamp: latest.timestamp };
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }
    }
    const candidate = buildSecondaryCandidate({
      source: `stooq:${symbol}`,
      metric: 'dxy',
      quality: 'symbol-experiment',
      primaryValue,
      value: parsed?.value ?? null,
      timestamp: parsed?.timestamp ?? null,
      error: parseError ?? result.error,
      result,
      note: 'diagnostic only; symbol may represent ICE DXY rather than broad dollar index',
    });
    bestStooq = bestStooq?.ok ? bestStooq : candidate;
    if (candidate.ok || i === STOOQ_DXY_SYMBOLS.length - 1) break;
    await sleep(diagnosticDelayMs());
  }
  candidates.push(bestStooq);
  return candidates;
}

async function fetchHyOasSecondarySources(primaryValue, cosd) {
  const candidates = [];
  const fredProxy = await fetchTextWithDiagnostics(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?cosd=${cosd}&id=${HY_OAS_PROXY_SERIES}`,
  );
  let fredParsed = null;
  let fredError = null;
  if (fredProxy.ok) {
    try {
      const { latest } = latestTwoCsvValues(fredProxy.text);
      if (!latest) throw new Error('no numeric HY effective yield');
      fredParsed = { value: roundValue(latest.value), timestamp: latest.timestamp };
    } catch (err) {
      fredError = err instanceof Error ? err.message : String(err);
    }
  }
  candidates.push(buildSecondaryCandidate({
    source: `fred:${HY_OAS_PROXY_SERIES}`,
    metric: 'hyOas',
    role: 'diagnostic-proxy',
    quality: 'related-fred-proxy',
    primaryValue,
    value: fredParsed?.value ?? null,
    timestamp: fredParsed?.timestamp ?? null,
    error: fredError ?? fredProxy.error,
    result: fredProxy,
    note: 'high yield effective yield proxy; not OAS and not validation',
  }));

  const tradingEconomicsKey = getOptionalEnvValue('TRADING_ECONOMICS_API_KEY');
  if (tradingEconomicsKey) {
    await sleep(diagnosticDelayMs());
    const result = await fetchTextWithDiagnostics(
      `https://api.tradingeconomics.com/markets/bonds?c=${encodeURIComponent(tradingEconomicsKey)}`,
      { headers: { Accept: 'application/json,text/plain,*/*' } },
    );
    let parsed = null;
    let parseError = null;
    if (result.ok) {
      try {
        const payload = JSON.parse(result.text);
        const rows = Array.isArray(payload) ? payload : [];
        const match = rows.find((row) => /high\s*yield|junk|hy/i.test(JSON.stringify(row)));
        const value = parseNumeric(match?.Last ?? match?.last ?? match?.Value ?? match?.value);
        if (value == null) throw new Error('no high-yield proxy value');
        parsed = { value: roundValue(value), timestamp: match?.Date ?? match?.date ?? null };
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }
    }
    candidates.push(buildSecondaryCandidate({
      source: TRADING_ECONOMICS_HY_SOURCE,
      metric: 'hyOas',
      role: 'diagnostic-proxy',
      quality: 'optional-api-experiment',
      primaryValue,
      value: parsed?.value ?? null,
      timestamp: parsed?.timestamp ?? null,
      error: parseError ?? result.error,
      result,
      note: 'optional Trading Economics proxy; not OAS validation',
    }));
  } else {
    candidates.push(buildSkippedSecondaryCandidate(TRADING_ECONOMICS_HY_SOURCE, 'hyOas', 'diagnostic-proxy'));
  }
  return candidates;
}

function summarizeSecondaryCandidates(candidates) {
  const okCandidates = candidates.filter((candidate) => candidate.ok);
  const absDiffs = okCandidates
    .map((candidate) => candidate.absDiffFromPrimary)
    .filter((value) => isFiniteNumber(value));
  const pctDiffs = okCandidates
    .map((candidate) => candidate.pctDiffFromPrimary)
    .filter((value) => isFiniteNumber(value));

  return {
    okCount: okCandidates.length,
    failCount: candidates.length - okCandidates.length,
    bestSource: okCandidates[0]?.source ?? null,
    maxAbsDiff: absDiffs.length ? roundValue(Math.max(...absDiffs)) : null,
    maxPctDiff: pctDiffs.length ? roundValue(Math.max(...pctDiffs)) : null,
  };
}

async function buildSecondarySourceDiagnostics(values, cosd) {
  if (!SECONDARY_DIAGNOSTICS_ENABLED) {
    return {
      secondaryDiagnostics: {
        enabled: false,
        reason: SECONDARY_DIAGNOSTICS_DISABLED_REASON,
        note: SECONDARY_DIAGNOSTICS_DISABLED_NOTE,
      },
    };
  }

  const secondarySources = {};
  const safeMetric = async (metric, primaryValue, fetcher) => {
    try {
      return await fetcher();
    } catch (err) {
      return [
        buildSecondaryCandidate({
          source: `worker-secondary:${metric}`,
          metric,
          quality: 'internal-diagnostic-error',
          primaryValue,
          error: err instanceof Error ? err.message : String(err),
        }),
      ];
    }
  };

  secondarySources.vix = await safeMetric('vix', values.vix, () => fetchVixSecondarySources(values.vix));
  await sleep(diagnosticDelayMs());
  secondarySources.us10y = await safeMetric('us10y', values.us10y, () => fetchUs10ySecondarySources(values.us10y));
  await sleep(diagnosticDelayMs());
  secondarySources.gold = await safeMetric('gold', values.gold, () => fetchGoldSecondarySources(values.gold));
  await sleep(diagnosticDelayMs());
  secondarySources.dxy = await safeMetric('dxy', values.dxy, () => fetchDxySecondarySources(values.dxy));
  await sleep(diagnosticDelayMs());
  secondarySources.hyOas = await safeMetric('hyOas', values.hyOas, () => fetchHyOasSecondarySources(values.hyOas, cosd));

  return {
    secondaryDiagnostics: {
      enabled: true,
      reason: 'enabled-by-worker-preview-feature-flag',
      note: 'Diagnostic-only secondary sources; not used for primary values or validation.',
    },
    secondarySources,
    secondarySourceSummary: Object.fromEntries(
      Object.entries(secondarySources).map(([metric, candidates]) => [
        metric,
        summarizeSecondaryCandidates(candidates),
      ]),
    ),
  };
}

function parseYahooBrent(text) {
  const payload = JSON.parse(text);
  const result = payload?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const value = parseNumeric(closes[i]);
    if (value != null) {
      return {
        value: roundValue(value),
        timestamp: timestamps[i] ? new Date(timestamps[i] * 1000).toISOString() : null,
      };
    }
  }

  throw new Error('no numeric close');
}

async function fetchYahooBrentCandidate() {
  const result = await fetchTextWithDiagnostics(YAHOO_BRENT_URL, {
    headers: { Accept: 'application/json,text/plain,*/*' },
  });
  let parsed = null;
  let parseError = null;

  if (result.ok) {
    try {
      parsed = parseYahooBrent(result.text);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    source: 'yahoo:BZ=F',
    value: parsed?.value ?? null,
    timestamp: parsed?.timestamp ?? null,
    ok: result.ok && parsed?.value != null,
    error: parseError ?? result.error,
    diagnostics: buildCandidateDiagnostics(result, parseError),
  };
}

async function fetchStooqBrentCandidate() {
  const result = await fetchTextWithDiagnostics(STOOQ_BRENT_URL);
  let parsed = null;
  let parseError = null;

  if (result.ok) {
    try {
      const { latest } = latestTwoCsvValues(result.text, 4);
      if (!latest) throw new Error('no numeric close');
      parsed = { value: roundValue(latest.value), timestamp: latest.timestamp };
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    source: 'stooq:brn.f',
    value: parsed?.value ?? null,
    timestamp: parsed?.timestamp ?? null,
    ok: result.ok && parsed?.value != null,
    error: parseError ?? result.error,
    diagnostics: buildCandidateDiagnostics(result, parseError),
  };
}

function parsePriceFromHtml(text) {
  const candidates = [
    /data-last-price=["']?([0-9][0-9.,]*)/i,
    /data-price=["']?([0-9][0-9.,]*)/i,
    /"price"\s*:\s*"?([0-9][0-9.,]*)"?/i,
    /(?:Brent|BZW00|Crude Oil)[\s\S]{0,600}?([0-9]{2,3}(?:\.[0-9]{1,4})?)/i,
  ];

  for (const pattern of candidates) {
    const match = text.match(pattern);
    const value = parseNumeric(match?.[1]);
    if (value != null) return roundValue(value);
  }

  return null;
}

async function fetchGoogleFinanceDiagnosticCandidate() {
  const result = await fetchTextWithDiagnostics(GOOGLE_FINANCE_BRENT_URL, {
    headers: { Accept: 'text/html,text/plain,*/*' },
  });
  const value = result.ok ? parsePriceFromHtml(result.text) : null;
  const parseError = result.ok && value == null ? 'price parse failed' : null;

  return {
    source: 'google-finance:BZW00:NYMEX',
    value,
    timestamp: null,
    ok: result.ok && value != null,
    error: parseError ?? result.error,
    role: 'diagnostic',
    participatesInConsensus: false,
    quality: 'experimental',
    diagnostics: buildCandidateDiagnostics(result, parseError),
  };
}

async function fetchTradingEconomicsDiagnosticCandidate() {
  let result = await fetchTextWithDiagnostics(TRADING_ECONOMICS_BRENT_URL, {
    headers: { Accept: 'text/html,text/plain,*/*' },
  });
  let sourceUrl = TRADING_ECONOMICS_BRENT_URL;

  if (!result.ok || result.bodyLength === 0) {
    await sleep(150 + Math.floor(Math.random() * 151));
    const alt = await fetchTextWithDiagnostics(TRADING_ECONOMICS_ALT_BRENT_URL, {
      headers: { Accept: 'text/html,text/plain,*/*' },
    });
    if (alt.ok || !result.ok) {
      result = alt;
      sourceUrl = TRADING_ECONOMICS_ALT_BRENT_URL;
    }
  }

  const value = result.ok ? parsePriceFromHtml(result.text) : null;
  const parseError = result.ok && value == null ? 'price parse failed' : null;

  return {
    source: 'tradingeconomics:brent-crude-oil',
    sourceUrl,
    value,
    timestamp: null,
    ok: result.ok && value != null,
    error: parseError ?? result.error,
    role: 'diagnostic',
    participatesInConsensus: false,
    quality: 'experimental',
    diagnostics: buildCandidateDiagnostics(result, parseError),
  };
}

async function buildBrentValidation(anchorValue) {
  const yahoo = await fetchYahooBrentCandidate();
  await sleep(150 + Math.floor(Math.random() * 151));
  const stooq = await fetchStooqBrentCandidate();
  await sleep(150 + Math.floor(Math.random() * 151));
  const googleFinance = await fetchGoogleFinanceDiagnosticCandidate();
  await sleep(150 + Math.floor(Math.random() * 151));
  const tradingEconomics = await fetchTradingEconomicsDiagnosticCandidate();

  const candidates = [
    {
      source: 'FRED:DCOILBRENTEU',
      value: anchorValue,
      role: 'anchor',
      ok: isFiniteNumber(anchorValue),
      error: isFiniteNumber(anchorValue) ? null : 'missing FRED anchor',
    },
    { ...yahoo, role: 'validation', participatesInConsensus: true },
    { ...stooq, role: 'validation', participatesInConsensus: true },
    googleFinance,
    tradingEconomics,
  ];
  const validationValues = candidates
    .filter(
      (candidate) =>
        candidate.role === 'validation' &&
        candidate.participatesInConsensus === true &&
        isFiniteNumber(candidate.value),
    )
    .map((candidate) => candidate.value);
  const recommendedValue =
    validationValues.length > 0
      ? roundValue(validationValues.reduce((sum, value) => sum + value, 0) / validationValues.length)
      : null;
  const recommendedSource =
    validationValues.length > 1
      ? 'validation-average'
      : candidates.find((c) => c.role === 'validation' && c.ok)?.source ?? null;

  return {
    candidates,
    consensus: {
      recommendedValue,
      recommendedSource,
      confidence: validationValues.length >= 2 ? 'medium' : validationValues.length === 1 ? 'low' : 'none',
      reason:
        'Worker preview validation only; FRED DCOILBRENTEU remains the Brent anchor for values.brent. Diagnostic candidates do not participate in consensus.',
      canPromoteToPrimary: false,
    },
    diagnostics: {
      yahoo: yahoo.diagnostics,
      stooq: stooq.diagnostics,
      googleFinance: googleFinance.diagnostics,
      tradingEconomics: tradingEconomics.diagnostics,
    },
  };
}

function buildSourceStatus(sourceDetails) {
  return Object.fromEntries(
    Object.entries(sourceDetails).map(([name, detail]) => [name, detail.ok ? 'ok' : 'missing']),
  );
}

function countMissing(values, fields) {
  return fields.filter((field) => !isFiniteNumber(values[field])).length;
}

function summarizeFred(fredResults) {
  const statuses = fredResults.map((result) => result.diagnostic.status);
  const failStatuses = [
    ...new Set(
      fredResults
        .filter((result) => !result.detail.ok)
        .map((result) => result.diagnostic.status)
        .filter((status) => status != null)
        .map((status) => String(status)),
    ),
  ];

  return {
    okCount: fredResults.filter((result) => result.detail.ok).length,
    failCount: fredResults.filter((result) => !result.detail.ok).length,
    statuses: [...new Set(statuses.filter((status) => status != null).map((status) => String(status)))],
    fredAllFailed: fredResults.every((result) => !result.detail.ok),
    fredFailureStatuses: failStatuses,
  };
}

function sourceSummaryFromDiagnostic(diagnostic) {
  return {
    status: diagnostic.status,
    ok: diagnostic.ok,
    reason: diagnostic.reason,
  };
}

function sourceSummaryFromSecondaryDiagnostics(secondaryDiagnostics) {
  if (!secondaryDiagnostics.secondarySourceSummary) return {};
  return {
    dxyDiagnostic: secondaryDiagnostics.secondarySourceSummary.dxy,
  };
}

export async function buildWorkerGeneratedMarketPreview() {
  const nowIso = new Date().toISOString();
  const cosd = formatDate(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000));
  const fredResults = await fetchAllFredSeries(cosd);
  const gold = await fetchGold();

  const values = Object.fromEntries(fredResults.map((result) => [result.name, result.value]));
  values.gold = gold.value;

  const changes = Object.fromEntries(
    fredResults.map((result) => [`${result.name}1d`, result.change]),
  );
  changes.gold1d = gold.change;

  const sourceDetails = Object.fromEntries(
    fredResults.map((result) => [result.name, result.detail]),
  );
  sourceDetails.gold = gold.detail;

  const brentValidation = await buildBrentValidation(values.brent);
  if (SECONDARY_DIAGNOSTICS_ENABLED) {
    await sleep(diagnosticDelayMs());
  }
  const secondaryDiagnostics = await buildSecondarySourceDiagnostics(values, cosd);
  const criticalMissing = countMissing(values, CRITICAL_FIELDS);
  const nonCriticalFields = Object.keys(values).filter((field) => !CRITICAL_FIELDS.includes(field));
  const nonCriticalMissing = countMissing(values, nonCriticalFields);
  const healthScore = Math.max(0, Math.min(100, 100 - criticalMissing * 15 - nonCriticalMissing * 5));
  const unavailable = criticalMissing >= 4;
  const fredSummary = summarizeFred(fredResults);
  const diagnostics = {
    generatedAt: nowIso,
    requestPolicy: SECONDARY_DIAGNOSTICS_ENABLED
      ? 'sequential-fred-with-retry-and-secondary-diagnostics'
      : 'sequential-fred-with-retry-secondary-diagnostics-disabled',
    fredAllFailed: fredSummary.fredAllFailed,
    fredFailureStatuses: fredSummary.fredFailureStatuses,
    secondaryDiagnostics: secondaryDiagnostics.secondaryDiagnostics,
    ...(secondaryDiagnostics.secondarySources ? { secondarySources: secondaryDiagnostics.secondarySources } : {}),
    ...(secondaryDiagnostics.secondarySourceSummary
      ? { secondarySourceSummary: secondaryDiagnostics.secondarySourceSummary }
      : {}),
    sourceHttpSummary: {
      fred: {
        okCount: fredSummary.okCount,
        failCount: fredSummary.failCount,
        statuses: fredSummary.statuses,
      },
      yahoo: sourceSummaryFromDiagnostic(brentValidation.diagnostics.yahoo),
      stooq: sourceSummaryFromDiagnostic(brentValidation.diagnostics.stooq),
      googleFinance: sourceSummaryFromDiagnostic(brentValidation.diagnostics.googleFinance),
      tradingEconomics: sourceSummaryFromDiagnostic(
        brentValidation.diagnostics.tradingEconomics,
      ),
      gold: sourceSummaryFromDiagnostic(gold.diagnostic),
      ...sourceSummaryFromSecondaryDiagnostics(secondaryDiagnostics),
    },
  };

  return {
    updatedAt: nowIso,
    asOf: nowIso,
    ageMinutes: 0,
    freshnessLevel: 'fresh',
    unavailable,
    sourceMode: unavailable ? 'worker-generated-unavailable' : 'worker-generated-preview',
    degradedMode: criticalMissing > 0 || nonCriticalMissing > 0,
    cacheOnly: false,
    healthScore,
    criticalMissing,
    fallbackCount: 0,
    secondarySourceCount: brentValidation.candidates.filter((candidate) => candidate.role === 'validation' && candidate.ok).length + (gold.detail.ok ? 1 : 0),
    values,
    changes,
    sourceStatus: buildSourceStatus(sourceDetails),
    sourceDetails,
    brentValidation,
    workerGeneratedPreview: {
      enabled: true,
      version: 'v28.0D-1',
      source: 'cloudflare-worker',
      generatedAt: nowIso,
      writePolicy: 'single-kv-write-alternating',
      productionEnabled: false,
      note: 'Worker-generated preview only; not used by frontend',
      diagnostics,
    },
  };
}
