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
const BRENT_ANCHOR_STALE_HOURS = 72;
const BRENT_CONFIRMATION_FRESH_HOURS = 48;
const BRENT_PROMOTION_MAX_DIVERGENCE_PCT = 2;

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

function hoursSinceTimestamp(timestamp, nowMs) {
  if (typeof timestamp !== 'string' || timestamp === '') return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (nowMs - parsed) / (60 * 60 * 1000));
}

function findBrentCandidate(candidates, source) {
  return candidates.find((candidate) => candidate.source === source) || null;
}

function positiveFinite(value) {
  return isFiniteNumber(value) && value > 0;
}

function divergencePct(a, b) {
  if (!positiveFinite(a) || !positiveFinite(b)) return null;
  const midpoint = (Math.abs(a) + Math.abs(b)) / 2;
  if (midpoint === 0) return null;
  return roundValue((Math.abs(a - b) / midpoint) * 100);
}

function buildBrentPromotionDecision(anchorDetail, brentValidation, nowMs) {
  const candidates = brentValidation.candidates || [];
  const yahoo = findBrentCandidate(candidates, 'yahoo:BZ=F');
  const tradingEconomics = findBrentCandidate(candidates, 'tradingeconomics:brent-crude-oil');
  const googleFinance = findBrentCandidate(candidates, 'google-finance:BZW00:NYMEX');
  const stooq = findBrentCandidate(candidates, 'stooq:brn.f');
  const anchorValue = positiveFinite(anchorDetail?.value) ? anchorDetail.value : null;
  const anchorAgeHours = hoursSinceTimestamp(anchorDetail?.timestamp, nowMs);
  const yahooAgeHours = hoursSinceTimestamp(yahoo?.timestamp, nowMs);
  const maxConfirmationDivergencePct = divergencePct(yahoo?.value, tradingEconomics?.value);
  const base = {
    applied: false,
    selectedValue: anchorValue,
    selectedSource: anchorDetail?.source || 'FRED:DCOILBRENTEU',
    anchorSource: anchorDetail?.source || 'FRED:DCOILBRENTEU',
    anchorValue,
    anchorObservedAt: anchorDetail?.timestamp ?? null,
    anchorAgeHours: isFiniteNumber(anchorAgeHours) ? roundValue(anchorAgeHours, 2) : null,
    confirmationSources: [
      {
        source: 'yahoo:BZ=F',
        status: yahoo?.ok ? 'ok' : yahoo?.error || 'unavailable',
        value: positiveFinite(yahoo?.value) ? yahoo.value : null,
        observedAt: yahoo?.timestamp ?? null,
        ageHours: isFiniteNumber(yahooAgeHours) ? roundValue(yahooAgeHours, 2) : null,
      },
      {
        source: 'tradingeconomics:brent-crude-oil',
        status: tradingEconomics?.ok ? 'ok' : tradingEconomics?.error || 'unavailable',
        value: positiveFinite(tradingEconomics?.value) ? tradingEconomics.value : null,
        observedAt: tradingEconomics?.timestamp ?? null,
        ageHours: null,
      },
    ],
    excludedSources: [
      {
        source: 'google-finance:BZW00:NYMEX',
        value: isFiniteNumber(googleFinance?.value) ? googleFinance.value : null,
        reason: positiveFinite(googleFinance?.value) ? 'diagnostic-only' : 'excluded-non-positive-or-invalid',
      },
      {
        source: 'stooq:brn.f',
        value: isFiniteNumber(stooq?.value) ? stooq.value : null,
        reason: stooq?.ok ? 'not-required-for-promotion' : stooq?.error || 'excluded-unavailable',
      },
    ],
    maxConfirmationDivergencePct,
    confidence: 'low',
    reason: null,
  };

  if (anchorDetail?.ok !== true) return { ...base, reason: 'fred-anchor-not-ok' };
  if (!positiveFinite(anchorValue)) return { ...base, reason: 'fred-anchor-not-positive-finite' };
  if (!isFiniteNumber(anchorAgeHours)) return { ...base, reason: 'fred-anchor-observedAt-invalid' };
  if (anchorAgeHours <= BRENT_ANCHOR_STALE_HOURS) return { ...base, reason: 'fred-anchor-not-stale' };
  if (yahoo?.ok !== true || !positiveFinite(yahoo.value)) return { ...base, reason: 'yahoo-confirmation-invalid' };
  if (!isFiniteNumber(yahooAgeHours)) return { ...base, reason: 'yahoo-observedAt-invalid' };
  if (yahooAgeHours > BRENT_CONFIRMATION_FRESH_HOURS) return { ...base, reason: 'yahoo-confirmation-stale' };
  if (tradingEconomics?.ok !== true || !positiveFinite(tradingEconomics.value)) {
    return { ...base, reason: 'tradingeconomics-confirmation-invalid' };
  }
  if (!isFiniteNumber(maxConfirmationDivergencePct)) return { ...base, reason: 'confirmation-divergence-unavailable' };
  if (maxConfirmationDivergencePct > BRENT_PROMOTION_MAX_DIVERGENCE_PCT) {
    return { ...base, reason: 'confirmation-divergence-above-2pct' };
  }

  const selectedValue = roundValue((yahoo.value + tradingEconomics.value) / 2);
  return {
    ...base,
    applied: true,
    selectedValue,
    selectedSource: 'yahoo:BZ=F+tradingeconomics:brent-crude-oil-average',
    selectedObservedAt: yahoo.timestamp ?? null,
    confidence: 'high',
    reason: 'promoted-stale-fred-anchor-with-fresh-yahoo-and-tradingeconomics-confirmation',
  };
}

function summarizeBrentCandidate(candidate, anchorDetail = null) {
  const diagnostics = candidate.diagnostics || {};
  const value = isFiniteNumber(candidate.value) ? candidate.value : null;
  const status = candidate.ok && positiveFinite(value)
    ? 'ok'
    : candidate.ok && !positiveFinite(value)
      ? 'invalid-non-positive'
    : diagnostics.reason || diagnostics.error || candidate.error || 'unavailable';

  return {
    source: candidate.source,
    role: candidate.role,
    participatesInConsensus: candidate.participatesInConsensus === true,
    status,
    value,
    observedAt: candidate.timestamp ?? (candidate.role === 'anchor' ? anchorDetail?.timestamp : null) ?? null,
    error: candidate.error ?? diagnostics.error ?? null,
  };
}

function buildBrentAudit(selectedDetail, brentValidation, promotionDecision, anchorDetail) {
  const consensus = brentValidation.consensus || {};
  const selectedValue = isFiniteNumber(selectedDetail?.value) ? selectedDetail.value : null;

  return {
    selectedSource: selectedDetail?.source || 'FRED:DCOILBRENTEU',
    selectedValue,
    selectedObservedAt: selectedDetail?.timestamp ?? null,
    selectedStatus: selectedDetail?.ok ? 'ok' : selectedDetail?.error || 'missing',
    consensusValue: isFiniteNumber(consensus.recommendedValue) ? consensus.recommendedValue : null,
    candidateSources: brentValidation.candidates.map((candidate) =>
      summarizeBrentCandidate(candidate, anchorDetail),
    ),
    promoteDecision: {
      recommendedValue: isFiniteNumber(promotionDecision?.selectedValue)
        ? promotionDecision.selectedValue
        : null,
      canPromoteToPrimary: promotionDecision?.applied === true,
      confidence: promotionDecision?.confidence ?? consensus.confidence ?? null,
      reason: promotionDecision?.reason ?? consensus.reason ?? null,
    },
    note: promotionDecision?.applied
      ? 'Freshness-gated promotion applied; values.brent uses market confirmation over stale FRED anchor.'
      : 'Freshness-gated promotion not applied; values.brent remains selected from the primary FRED DCOILBRENTEU source.',
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
  const brentAnchorDetail = { ...sourceDetails.brent };
  const brentPromotion = buildBrentPromotionDecision(
    brentAnchorDetail,
    brentValidation,
    Date.parse(nowIso),
  );
  brentValidation.promotion = brentPromotion;
  if (brentPromotion.applied) {
    values.brent = brentPromotion.selectedValue;
    changes.brent1d = null;
    sourceDetails.brent = {
      ...sourceDetails.brent,
      value: brentPromotion.selectedValue,
      source: `${brentPromotion.selectedSource} promoted over stale FRED anchor`,
      timestamp: brentPromotion.selectedObservedAt ?? brentPromotion.anchorObservedAt,
      error: null,
      promoted: true,
      promotionReason: brentPromotion.reason,
      anchorSource: brentPromotion.anchorSource,
      anchorValue: brentPromotion.anchorValue,
      anchorObservedAt: brentPromotion.anchorObservedAt,
      anchorAgeHours: brentPromotion.anchorAgeHours,
      confirmationSources: brentPromotion.confirmationSources,
      maxConfirmationDivergencePct: brentPromotion.maxConfirmationDivergencePct,
    };
  }
  brentValidation.audit = buildBrentAudit(
    sourceDetails.brent,
    brentValidation,
    brentPromotion,
    brentAnchorDetail,
  );
  const criticalMissing = countMissing(values, CRITICAL_FIELDS);
  const nonCriticalFields = Object.keys(values).filter((field) => !CRITICAL_FIELDS.includes(field));
  const nonCriticalMissing = countMissing(values, nonCriticalFields);
  const healthScore = Math.max(0, Math.min(100, 100 - criticalMissing * 15 - nonCriticalMissing * 5));
  const unavailable = criticalMissing >= 4;
  const fredSummary = summarizeFred(fredResults);
  const diagnostics = {
    generatedAt: nowIso,
    requestPolicy: 'sequential-fred-with-retry',
    fredAllFailed: fredSummary.fredAllFailed,
    fredFailureStatuses: fredSummary.fredFailureStatuses,
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
