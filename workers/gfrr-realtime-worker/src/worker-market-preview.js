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
const GOOGLE_FINANCE_BRENT_URL = 'https://www.google.com/finance/beta/quote/BZW00:NYMEX';
const GOOGLE_FINANCE_BRENT_CANONICAL_URL = 'https://www.google.com/finance/quote/BZW00:NYMEX';
const GOOGLE_FINANCE_BRENT_FRONT_MONTH_URL = 'https://www.google.com/finance/quote/BZY00:NYMEX';
const TRADING_ECONOMICS_BRENT_URL =
  'https://tradingeconomics.com/commodity/brent-crude-oil';
const TRADING_ECONOMICS_ALT_BRENT_URL =
  'https://tradingeconomics.com/commodity/brentcrudeoil';
const BRENT_ANCHOR_STALE_HOURS = 72;
const BRENT_CONFIRMATION_FRESH_HOURS = 48;
// B-worker hardening: upper age cap on a held/anchor Brent value. When the
// selected (non-promoted) Brent observation is older than this, the audit flags
// `heldBeyondAgeCap` so downstream display can warn it is a stale held value.
// Observability + soft-warn only: does NOT change values.brent or any gate.
const BRENT_HELD_MAX_AGE_HOURS = 168;
const BRENT_PROMOTION_MAX_DIVERGENCE_PCT = 2;
const BRENT_MOVE_WATCH_PCT = 2;
const BRENT_MOVE_EXTREME_PCT = 3;
const BRENT_EXTREME_CONFIRMATION_DIVERGENCE_PCT = 1;
const WORKER_FETCH_TIMEOUT_MS = 4500;
const SOURCE_PROBE_FETCH_TIMEOUT_MS = 4000;
const PROBE_SAMPLE_ROW_LIMIT = 3;
const PROBE_SNIPPET_LIMIT = 120;
const SOURCE_PROBE_FREQUENCY_MINUTES = 60;
const FETCH_HEADERS = {
  Accept: 'text/csv,application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (compatible; GFRRWorkerPreview/28.0E-0; +https://ctmaomao.github.io/gfrr-auto-update-site/)',
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
  if (typeof error === 'string' && error.includes('timeout after')) return 'timeout';
  if (status === 429) return 'rate-limited';
  if (status === 522) return 'connection-timeout-or-origin-unreachable';
  if (status === 520) return 'origin-returned-520';
  if (status && status >= 400) return 'http-error';
  if (error) return 'fetch-or-parse-error';
  return null;
}

function sanitizeDiagnosticUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(value || '').split(/[?#]/u)[0] || null;
  }
}

function normalizeDiagnostic(result) {
  return {
    ok: result.ok,
    status: result.status,
    statusText: result.statusText,
    urlHost: result.urlHost,
    finalUrl: sanitizeDiagnosticUrl(result.finalUrl),
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
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : WORKER_FETCH_TIMEOUT_MS;
  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
    ? options.maxAttempts
    : 2;
  let last = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    const parsedUrl = new URL(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        urlHost: parsedUrl.host,
        finalUrl: sanitizeDiagnosticUrl(response.url || url),
        contentType: response.headers.get('content-type'),
        bodyLength: text.length,
        durationMs: Date.now() - startedAt,
        error: response.ok ? null : `HTTP ${response.status}`,
        retryCount: attempt,
        text,
      };

      if (response.ok || attempt === maxAttempts - 1) return result;
      last = result;
    } catch (err) {
      const error = err instanceof Error && err.name === 'AbortError'
        ? `timeout after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      last = {
        ok: false,
        status: null,
        statusText: null,
        urlHost: parsedUrl.host,
        finalUrl: sanitizeDiagnosticUrl(url),
        contentType: null,
        bodyLength: 0,
        durationMs: Date.now() - startedAt,
        error,
        retryCount: attempt,
        text: '',
      };
      if (attempt === maxAttempts - 1) return last;
    } finally {
      clearTimeout(timer);
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

function latestTwoFredApiValues(text) {
  const json = JSON.parse(text);
  const observations = json?.observations;
  if (!Array.isArray(observations)) {
    throw new Error('FRED API returned invalid observations payload');
  }
  const values = [];

  for (const observation of observations) {
    const value = parseNumeric(observation?.value);
    if (observation?.date && value != null) {
      values.push({ timestamp: observation.date, value });
    }
  }

  return {
    latest: values.at(-1) ?? null,
    previous: values.at(-2) ?? null,
  };
}

function buildFredApiUrl(seriesId, cosd, fredApiKey) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: fredApiKey,
    file_type: 'json',
    observation_start: cosd,
    sort_order: 'asc',
  });
  return `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
}

function fredApiFallbackFields(apiFallback) {
  if (!apiFallback) return {};
  const result = apiFallback.result;
  return {
    fredApiFallback: true,
    fredApiHttpStatus: result?.status ?? null,
    fredApiError: apiFallback.error ?? result?.error ?? null,
    fredApiUrlHost: result?.urlHost ?? null,
    fredApiRetryCount: result?.retryCount ?? null,
  };
}

async function fetchFredSeries(name, seriesId, cosd, fredApiKey) {
  const source = `FRED:${seriesId}`;
  let apiFallback = null;

  if (fredApiKey) {
    let apiResult = null;
    try {
      apiResult = await fetchTextWithDiagnostics(buildFredApiUrl(seriesId, cosd, fredApiKey), {
        maxAttempts: 1,
      });

      if (apiResult.ok) {
        const { latest, previous } = latestTwoFredApiValues(apiResult.text);
        if (latest) {
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
              httpStatus: apiResult.status,
              contentType: apiResult.contentType,
              bodyLength: apiResult.bodyLength,
              durationMs: apiResult.durationMs,
              fredUrlHost: apiResult.urlHost,
              fredHttpStatus: apiResult.status,
              fredBodyLength: apiResult.bodyLength,
              fredContentType: apiResult.contentType,
              fredError: null,
              retryCount: apiResult.retryCount,
            },
            diagnostic: normalizeDiagnostic(apiResult),
          };
        }
        apiFallback = { result: apiResult, error: 'no numeric value' };
      } else {
        apiFallback = { result: apiResult, error: apiResult.error };
      }
    } catch (err) {
      apiFallback = {
        result: apiResult,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?cosd=${cosd}&id=${seriesId}`;
  const result = await fetchTextWithDiagnostics(url);
  const diagnostic = normalizeDiagnostic(result);
  const fallbackFields = fredApiFallbackFields(apiFallback);

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
        ...fallbackFields,
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
        ...fallbackFields,
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
      ...fallbackFields,
    },
    diagnostic,
  };
}

async function fetchAllFredSeries(cosd, fredApiKey) {
  const results = [];
  const entries = Object.entries(FRED_SERIES);

  for (let i = 0; i < entries.length; i += 1) {
    const [name, seriesId] = entries[i];
    results.push(await fetchFredSeries(name, seriesId, cosd, fredApiKey));
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

function buildDiagnosticCandidateDiagnostics(result, reason, error = null) {
  return {
    ...buildCandidateDiagnostics(result, error),
    error: error ?? result.error,
    reason: reason ?? sourceReason(result.status, error ?? result.error),
  };
}

function hoursSinceTimestamp(timestamp, nowMs) {
  if (typeof timestamp !== 'string' || timestamp === '') return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (nowMs - parsed) / (60 * 60 * 1000));
}

const MONTH_NAME_TO_INDEX = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function isoTimestampFromMonthNameDate(monthName, day, year) {
  const monthIndex = MONTH_NAME_TO_INDEX[String(monthName ?? '').trim().toLowerCase()];
  const numericDay = Number(day);
  const numericYear = Number(year);
  if (
    monthIndex == null ||
    !Number.isInteger(numericDay) ||
    numericDay < 1 ||
    numericDay > 31 ||
    !Number.isInteger(numericYear)
  ) {
    return null;
  }

  const timestamp = Date.UTC(numericYear, monthIndex, numericDay);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== numericYear ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== numericDay
  ) {
    return null;
  }

  return date.toISOString();
}

function isoTimestampFromMonthNameDateInCurrentYear(monthName, day, nowMs) {
  const now = new Date(nowMs);
  let year = now.getUTCFullYear();
  let observedAt = isoTimestampFromMonthNameDate(monthName, day, year);
  const observedMs = Date.parse(observedAt);
  if (Number.isFinite(observedMs) && observedMs - nowMs > 36 * 60 * 60 * 1000) {
    year -= 1;
    observedAt = isoTimestampFromMonthNameDate(monthName, day, year);
  }
  return observedAt;
}

function parseTradingEconomicsObservedAt(text, nowMs) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const normalizedText = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/\s+/g, ' ');

  const explicit = normalizedText.match(
    /last\s+updated\s+on\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(?:of\s+)?(\d{4})/iu,
  );
  if (explicit) {
    return isoTimestampFromMonthNameDate(explicit[1], explicit[2], explicit[3]);
  }

  const tableDate = normalizedText.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\/(\d{1,2})(?:st|nd|rd|th)?\b/iu,
  );
  if (tableDate) {
    return isoTimestampFromMonthNameDateInCurrentYear(tableDate[1], tableDate[2], nowMs);
  }

  return null;
}

function auditFreshnessFromObservedAt(observedAt, nowMs, freshHours) {
  const age = hoursSinceTimestamp(observedAt, nowMs);
  if (!isFiniteNumber(age)) {
    return {
      observedAt: null,
      ageHours: null,
      freshnessStatus: 'unknown',
      freshnessReason: 'tradingeconomics-observedAt-unparsed',
    };
  }

  const ageHours = roundValue(age, 2);
  return {
    observedAt,
    ageHours,
    freshnessStatus: age <= freshHours ? 'fresh' : 'stale',
    freshnessReason: age <= freshHours
      ? 'tradingeconomics-observedAt-within-48h'
      : 'tradingeconomics-observedAt-stale',
  };
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

function changePctFromPrevious(candidateValue, previousValue) {
  if (!positiveFinite(candidateValue) || !positiveFinite(previousValue)) return null;
  return roundValue((Math.abs(candidateValue - previousValue) / previousValue) * 100);
}

function selectPreviousBrentReference(previousPreviewSummary) {
  if (!previousPreviewSummary || typeof previousPreviewSummary !== 'object') {
    return null;
  }
  if (
    previousPreviewSummary.previousPromotionApplied === true &&
    positiveFinite(previousPreviewSummary.previousPromotionSelectedValue)
  ) {
    return {
      value: previousPreviewSummary.previousPromotionSelectedValue,
      source: previousPreviewSummary.previousPromotionSelectedSource || 'previous-promotion',
      updatedAt: previousPreviewSummary.previousUpdatedAt ?? null,
    };
  }
  if (positiveFinite(previousPreviewSummary.previousValuesBrent)) {
    return {
      value: previousPreviewSummary.previousValuesBrent,
      source: previousPreviewSummary.previousSourceDetailsBrentSource || 'previous-values.brent',
      updatedAt: previousPreviewSummary.previousUpdatedAt ?? null,
    };
  }
  return null;
}

function buildMoveAssessment({
  candidateValue,
  previousReference,
  yahoo,
  tradingEconomics,
  yahooAgeHours,
  tradingEconomicsAgeHours,
  maxConfirmationDivergencePct,
}) {
  if (!previousReference) {
    return {
      previousReferenceValue: null,
      previousReferenceSource: null,
      previousUpdatedAt: null,
      promotedChangePct: null,
      moveStatus: 'no-previous',
      moveReason: 'no previous accepted Brent reference; D-5 promotion gate decides',
      extremeMoveConfirmedBy: [],
      allowPromotion: true,
    };
  }

  const promotedChangePct = changePctFromPrevious(candidateValue, previousReference.value);
  const base = {
    previousReferenceValue: previousReference.value,
    previousReferenceSource: previousReference.source,
    previousUpdatedAt: previousReference.updatedAt,
    promotedChangePct,
    extremeMoveConfirmedBy: [],
    allowPromotion: true,
  };

  if (!isFiniteNumber(promotedChangePct)) {
    return {
      ...base,
      moveStatus: 'no-previous',
      moveReason: 'previous Brent reference exists but promoted change could not be calculated',
    };
  }
  if (promotedChangePct <= BRENT_MOVE_WATCH_PCT) {
    return {
      ...base,
      moveStatus: 'normal',
      moveReason: 'promoted Brent move is within normal range',
    };
  }
  if (promotedChangePct <= BRENT_MOVE_EXTREME_PCT) {
    return {
      ...base,
      moveStatus: 'volatility-watch',
      moveReason: 'promoted Brent move is elevated but below extreme confirmation threshold',
    };
  }

  const extremeConfirmed =
    yahoo?.ok === true &&
    tradingEconomics?.ok === true &&
    positiveFinite(yahoo.value) &&
    positiveFinite(tradingEconomics.value) &&
    isFiniteNumber(yahooAgeHours) &&
    yahooAgeHours <= BRENT_CONFIRMATION_FRESH_HOURS &&
    isFiniteNumber(tradingEconomicsAgeHours) &&
    tradingEconomicsAgeHours <= BRENT_CONFIRMATION_FRESH_HOURS &&
    isFiniteNumber(maxConfirmationDivergencePct) &&
    maxConfirmationDivergencePct <= BRENT_EXTREME_CONFIRMATION_DIVERGENCE_PCT;

  if (extremeConfirmed) {
    return {
      ...base,
      moveStatus: 'confirmed-extreme-move',
      moveReason: 'large Brent move confirmed by fresh Yahoo and Trading Economics agreement',
      extremeMoveConfirmedBy: ['yahoo:BZ=F', 'tradingeconomics:brent-crude-oil'],
    };
  }

  return {
    ...base,
    moveStatus: 'unconfirmed-jump-hold',
    moveReason: 'large Brent move not confirmed by sufficiently tight Yahoo and Trading Economics agreement',
    allowPromotion: false,
  };
}

function buildBrentPromotionDecision(anchorDetail, brentValidation, nowMs, previousPreviewSummary = null) {
  const candidates = brentValidation.candidates || [];
  const yahoo = findBrentCandidate(candidates, 'yahoo:BZ=F');
  const tradingEconomics = findBrentCandidate(candidates, 'tradingeconomics:brent-crude-oil');
  const googleFinance = findBrentCandidate(candidates, 'google-finance:BZW00:NYMEX');
  const anchorValue = positiveFinite(anchorDetail?.value) ? anchorDetail.value : null;
  const anchorAgeHours = hoursSinceTimestamp(anchorDetail?.timestamp, nowMs);
  const yahooAgeHours = hoursSinceTimestamp(yahoo?.timestamp, nowMs);
  const tradingEconomicsAgeHours = hoursSinceTimestamp(tradingEconomics?.timestamp, nowMs);
  const tradingEconomicsAudit = tradingEconomics?.observedAtAudit ??
    auditFreshnessFromObservedAt(tradingEconomics?.timestamp ?? null, nowMs, BRENT_CONFIRMATION_FRESH_HOURS);
  const maxConfirmationDivergencePct = divergencePct(yahoo?.value, tradingEconomics?.value);
  const previousReference = selectPreviousBrentReference(previousPreviewSummary);
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
        observedAt: tradingEconomicsAudit.observedAt ?? null,
        ageHours: tradingEconomicsAudit.ageHours ?? null,
        freshnessStatus: tradingEconomicsAudit.freshnessStatus,
        freshnessReason: tradingEconomicsAudit.freshnessReason,
      },
    ],
    excludedSources: [
      {
        source: 'google-finance:BZW00:NYMEX',
        value: isFiniteNumber(googleFinance?.value) ? googleFinance.value : null,
        reason: googleFinance?.reason ||
          (positiveFinite(googleFinance?.value)
            ? 'google-finance-html-experimental-diagnostic-only'
            : 'excluded-non-positive-or-invalid'),
      },
    ],
    maxConfirmationDivergencePct,
    previousReferenceValue: previousReference?.value ?? null,
    previousReferenceSource: previousReference?.source ?? null,
    previousUpdatedAt: previousReference?.updatedAt ?? null,
    promotedChangePct: null,
    moveStatus: 'no-previous',
    moveReason: previousReference
      ? 'D-5 promotion gate did not reach move assessment'
      : 'no previous accepted Brent reference; D-5 promotion gate decides',
    extremeMoveConfirmedBy: [],
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
  if (!isFiniteNumber(tradingEconomicsAgeHours)) {
    return { ...base, reason: 'tradingeconomics-observedAt-invalid' };
  }
  if (tradingEconomicsAgeHours > BRENT_CONFIRMATION_FRESH_HOURS) {
    return { ...base, reason: 'tradingeconomics-confirmation-stale' };
  }
  if (!isFiniteNumber(maxConfirmationDivergencePct)) return { ...base, reason: 'confirmation-divergence-unavailable' };
  if (maxConfirmationDivergencePct > BRENT_PROMOTION_MAX_DIVERGENCE_PCT) {
    return { ...base, reason: 'confirmation-divergence-above-2pct' };
  }

  const selectedValue = roundValue((yahoo.value + tradingEconomics.value) / 2);
  const moveAssessment = buildMoveAssessment({
    candidateValue: selectedValue,
    previousReference,
    yahoo,
    tradingEconomics,
    yahooAgeHours,
    tradingEconomicsAgeHours,
    maxConfirmationDivergencePct,
  });
  if (!moveAssessment.allowPromotion) {
    const fallbackValue = positiveFinite(previousReference?.value) ? previousReference.value : anchorValue;
    return {
      ...base,
      ...moveAssessment,
      selectedValue: fallbackValue,
      selectedSource: positiveFinite(previousReference?.value)
        ? previousReference.source
        : anchorDetail?.source || 'FRED:DCOILBRENTEU',
      confidence: 'medium',
      reason: moveAssessment.moveStatus,
    };
  }

  return {
    ...base,
    ...moveAssessment,
    applied: true,
    selectedValue,
    selectedSource: 'yahoo:BZ=F+tradingeconomics:brent-crude-oil-average',
    selectedObservedAt: yahoo.timestamp ?? null,
    confidence: 'high',
    reason: moveAssessment.moveStatus === 'confirmed-extreme-move'
      ? 'promoted-confirmed-extreme-move-with-fresh-yahoo-and-tradingeconomics-confirmation'
      : 'promoted-stale-fred-anchor-with-fresh-yahoo-and-tradingeconomics-confirmation',
  };
}

function summarizeBrentCandidate(candidate, anchorDetail = null) {
  const diagnostics = candidate.diagnostics || {};
  const value = isFiniteNumber(candidate.value) ? candidate.value : null;
  const reason = candidate.reason ?? diagnostics.reason ?? null;
  const exclusionReason = candidate.exclusionReason ?? null;
  const observedAt = candidate.timestamp ?? (candidate.role === 'anchor' ? anchorDetail?.timestamp : null) ?? null;
  const observedAtAudit = candidate.observedAtAudit || {};
  const status = candidate.ok && positiveFinite(value)
    ? 'ok'
    : candidate.ok && !positiveFinite(value)
      ? reason || 'excluded-non-positive-or-invalid'
    : reason || diagnostics.error || candidate.error || 'unavailable';

  return {
    source: candidate.source,
    role: candidate.role,
    participatesInConsensus: candidate.participatesInConsensus === true,
    status,
    value,
    observedAt,
    ageHours: observedAtAudit.ageHours ?? null,
    freshnessStatus: observedAtAudit.freshnessStatus ?? null,
    freshnessReason: observedAtAudit.freshnessReason ?? null,
    error: candidate.error ?? diagnostics.error ?? null,
    reason,
    exclusionReason,
    quality: candidate.quality ?? null,
    promotionEligible: candidate.promotionEligible === true,
  };
}

function buildBrentAudit(selectedDetail, brentValidation, promotionDecision, anchorDetail, nowMs = Date.now()) {
  const consensus = brentValidation.consensus || {};
  const selectedValue = isFiniteNumber(selectedDetail?.value) ? selectedDetail.value : null;

  // B-worker hardening: age of the observation behind the value actually written
  // to values.brent. When the value is a held/anchor fallback (promotion not
  // applied) older than the cap, flag it so display can warn "stale held value".
  // Pure observability — selectedValue and every gate are untouched.
  const selectedAgeHours = hoursSinceTimestamp(selectedDetail?.timestamp ?? null, nowMs);
  const heldBeyondAgeCap = promotionDecision?.applied !== true
    && isFiniteNumber(selectedAgeHours)
    && selectedAgeHours > BRENT_HELD_MAX_AGE_HOURS;

  return {
    selectedSource: selectedDetail?.source || 'FRED:DCOILBRENTEU',
    selectedValue,
    selectedObservedAt: selectedDetail?.timestamp ?? null,
    selectedAgeHours: isFiniteNumber(selectedAgeHours) ? roundValue(selectedAgeHours, 2) : null,
    heldMaxAgeHours: BRENT_HELD_MAX_AGE_HOURS,
    heldBeyondAgeCap,
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
      moveStatus: promotionDecision?.moveStatus ?? null,
      promotedChangePct: promotionDecision?.promotedChangePct ?? null,
      extremeMoveConfirmedBy: promotionDecision?.extremeMoveConfirmedBy ?? [],
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

function truncateProbeText(value, limit = PROBE_SNIPPET_LIMIT) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function buildProbeFetchSummary(probeId, url, result) {
  return {
    probeId,
    url,
    httpStatus: result.status,
    contentType: result.contentType,
    bodyLength: result.bodyLength,
    finalUrl: sanitizeDiagnosticUrl(result.finalUrl),
  };
}

function sourceProbeTimestampMs(sourceProbe) {
  const generatedAt = sourceProbe?.generatedAt;
  if (typeof generatedAt !== 'string') return null;
  const parsed = Date.parse(generatedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldReuseSourceProbe(previousPreviewSummary, nowMs) {
  const previousSourceProbe = previousPreviewSummary?.previousSourceProbe;
  if (!previousSourceProbe || !Array.isArray(previousSourceProbe.probes)) return false;
  if (previousSourceProbe.probes.length === 0 || previousSourceProbe.probes.length > 5) return false;
  const previousGeneratedAt = sourceProbeTimestampMs(previousSourceProbe);
  if (previousGeneratedAt == null) return false;
  return nowMs - previousGeneratedAt < SOURCE_PROBE_FREQUENCY_MINUTES * 60 * 1000;
}

function buildReusedSourceProbe(previousPreviewSummary) {
  const previousSourceProbe = previousPreviewSummary.previousSourceProbe;
  return {
    generatedAt: previousSourceProbe.generatedAt,
    reused: true,
    frequencyMinutes: SOURCE_PROBE_FREQUENCY_MINUTES,
    probeCount: previousSourceProbe.probes.length,
    reason: 'source-probe-reused-within-60m',
    payloadPolicy: {
      fullHtmlStored: false,
      fullCsvStored: false,
      maxSampleRows: PROBE_SAMPLE_ROW_LIMIT,
      maxSnippetChars: PROBE_SNIPPET_LIMIT,
    },
    probes: previousSourceProbe.probes,
  };
}

function buildProbeStatus(parsed) {
  return parsed.parseStatus === 'ok' ? 'ok' : parsed.parseStatus || 'unavailable';
}

function parseGoogleFinanceProbeHtml(text) {
  const reliablePatterns = [
    {
      name: 'data-last-price',
      pattern: /data-last-price=["']?([0-9][0-9.,]*)/i,
    },
    {
      name: 'data-price',
      pattern: /data-price=["']?([0-9][0-9.,]*)/i,
    },
  ];

  for (const { name, pattern } of reliablePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = parseNumeric(match[1]);
    const start = Math.max(0, match.index - 40);
    const snippet = truncateProbeText(text.slice(start, match.index + match[0].length + 40));
    if (positiveFinite(value)) {
      return {
        parseStatus: 'ok',
        parsedValue: roundValue(value),
        parseMethod: 'google-finance-main-quote-attribute',
        reason: null,
        matchedPattern: name,
        selectedSnippet: snippet,
      };
    }
    return {
      parseStatus: 'non-positive-or-invalid',
      parsedValue: isFiniteNumber(value) ? value : null,
      parseMethod: 'google-finance-main-quote-attribute',
      reason: 'possible-futures-chain-zero-or-non-primary-price',
      matchedPattern: name,
      selectedSnippet: snippet,
    };
  }

  return {
    parseStatus: 'unreliable-html-parse',
    parsedValue: null,
    parseMethod: 'google-finance-main-quote-attribute',
    reason: 'main quote price attribute not reliably located',
    matchedPattern: null,
    selectedSnippet: null,
  };
}

function looksLikeHtml(text, contentType) {
  return /html/i.test(contentType || '') || /^\s*<(?:!doctype\s+html|html|head|body)\b/i.test(text);
}

async function probeGoogleFinanceBrentSource({ probeId, url }) {
  const result = await fetchTextWithDiagnostics(url, {
    headers: { Accept: 'text/html,text/plain,*/*' },
    timeoutMs: SOURCE_PROBE_FETCH_TIMEOUT_MS,
  });
  const parsed = result.ok
    ? parseGoogleFinanceProbeHtml(result.text)
    : {
        parseStatus: 'fetch-failed',
        parsedValue: null,
        parseMethod: 'google-finance-main-quote-attribute',
        reason: result.error || sourceReason(result.status, result.error),
        matchedPattern: null,
        selectedSnippet: null,
      };

  return {
    ...buildProbeFetchSummary(probeId, url, result),
    source: probeId,
    status: buildProbeStatus(parsed),
    ...parsed,
    role: 'diagnostic',
    participatesInConsensus: false,
    promotionEligible: false,
  };
}

async function buildBrentSourceProbe(previousPreviewSummary, nowMs) {
  if (shouldReuseSourceProbe(previousPreviewSummary, nowMs)) {
    return buildReusedSourceProbe(previousPreviewSummary);
  }

  const generatedAt = new Date().toISOString();
  try {
    const googleProbes = [
      {
        probeId: 'google-finance:BZW00:NYMEX canonical',
        url: GOOGLE_FINANCE_BRENT_CANONICAL_URL,
      },
      {
        probeId: 'google-finance:BZY00:NYMEX front-month',
        url: GOOGLE_FINANCE_BRENT_FRONT_MONTH_URL,
      },
    ];
    const probes = [];

    for (const probe of googleProbes) {
      probes.push(await probeGoogleFinanceBrentSource(probe));
      await sleep(100 + Math.floor(Math.random() * 101));
    }

    return {
      generatedAt,
      reused: false,
      frequencyMinutes: SOURCE_PROBE_FREQUENCY_MINUTES,
      probeCount: probes.length,
      status: 'ok',
      role: 'diagnostic-only',
      affectsPromotion: false,
      payloadPolicy: {
        fullHtmlStored: false,
        fullCsvStored: false,
        maxSampleRows: PROBE_SAMPLE_ROW_LIMIT,
        maxSnippetChars: PROBE_SNIPPET_LIMIT,
      },
      probes,
    };
  } catch (err) {
    return {
      generatedAt,
      reused: false,
      frequencyMinutes: SOURCE_PROBE_FREQUENCY_MINUTES,
      probeCount: 0,
      status: 'probe-failed',
      role: 'diagnostic-only',
      affectsPromotion: false,
      error: err instanceof Error ? err.message : String(err),
      payloadPolicy: {
        fullHtmlStored: false,
        fullCsvStored: false,
        maxSampleRows: PROBE_SAMPLE_ROW_LIMIT,
        maxSnippetChars: PROBE_SNIPPET_LIMIT,
      },
      probes: [],
    };
  }
}

async function fetchGoogleFinanceDiagnosticCandidate() {
  const result = await fetchTextWithDiagnostics(GOOGLE_FINANCE_BRENT_URL, {
    headers: { Accept: 'text/html,text/plain,*/*' },
  });
  const probeParse = result.ok ? parseGoogleFinanceProbeHtml(result.text) : null;
  const value = positiveFinite(probeParse?.parsedValue) ? probeParse.parsedValue : null;
  const invalidValue = result.ok && !positiveFinite(value);
  const parseError = result.ok && value == null ? 'unreliable-html-parse' : null;
  const reason = invalidValue
    ? 'excluded-non-positive-or-invalid'
    : parseError
      ? 'fetch-or-parse-error'
      : null;
  const error = invalidValue
    ? 'Google Finance HTML may contain futures-chain zero / non-primary price'
    : parseError ?? result.error;

  return {
    source: 'google-finance:BZW00:NYMEX',
    value,
    timestamp: null,
    ok: result.ok && positiveFinite(value),
    error,
    reason,
    role: 'diagnostic',
    participatesInConsensus: false,
    quality: 'html-experimental',
    promotionEligible: false,
    exclusionReason: 'google-finance-html-experimental-not-used-for-promotion',
    diagnostics: buildDiagnosticCandidateDiagnostics(result, reason, error),
  };
}

async function fetchTradingEconomicsDiagnosticCandidate(nowMs = Date.now()) {
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
  const observedAt = result.ok ? parseTradingEconomicsObservedAt(result.text, nowMs) : null;
  const observedAtAudit = auditFreshnessFromObservedAt(
    observedAt,
    nowMs,
    BRENT_CONFIRMATION_FRESH_HOURS,
  );
  const parseError = result.ok && value == null ? 'price parse failed' : null;

  return {
    source: 'tradingeconomics:brent-crude-oil',
    sourceUrl,
    value,
    timestamp: observedAt,
    observedAtAudit,
    ok: result.ok && value != null,
    error: parseError ?? result.error,
    role: 'diagnostic',
    participatesInConsensus: false,
    quality: 'experimental',
    diagnostics: {
      ...buildCandidateDiagnostics(result, parseError),
      observedAt,
      observedAtAudit,
    },
  };
}

async function buildBrentValidation(anchorValue, previousPreviewSummary = null, nowMs = Date.now()) {
  const yahoo = await fetchYahooBrentCandidate();
  await sleep(150 + Math.floor(Math.random() * 151));
  const googleFinance = await fetchGoogleFinanceDiagnosticCandidate();
  await sleep(150 + Math.floor(Math.random() * 151));
  const tradingEconomics = await fetchTradingEconomicsDiagnosticCandidate(nowMs);
  await sleep(150 + Math.floor(Math.random() * 151));
  const sourceProbe = await buildBrentSourceProbe(previousPreviewSummary, nowMs);

  const candidates = [
    {
      source: 'FRED:DCOILBRENTEU',
      value: anchorValue,
      role: 'anchor',
      ok: isFiniteNumber(anchorValue),
      error: isFiniteNumber(anchorValue) ? null : 'missing FRED anchor',
    },
    { ...yahoo, role: 'validation', participatesInConsensus: true },
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
      googleFinance: googleFinance.diagnostics,
      tradingEconomics: tradingEconomics.diagnostics,
    },
    sourceProbe,
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

export async function buildWorkerGeneratedMarketPreview(options = {}) {
  const previousPreviewSummary = options?.previousPreviewSummary ?? null;
  const fredApiKey = typeof options?.fredApiKey === 'string' ? options.fredApiKey.trim() : '';
  const nowIso = new Date().toISOString();
  const cosd = formatDate(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000));
  const fredResults = await fetchAllFredSeries(cosd, fredApiKey);
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

  const nowMs = Date.parse(nowIso);
  const brentValidation = await buildBrentValidation(values.brent, previousPreviewSummary, nowMs);
  const brentAnchorDetail = { ...sourceDetails.brent };
  const brentPromotion = buildBrentPromotionDecision(
    brentAnchorDetail,
    brentValidation,
    nowMs,
    previousPreviewSummary,
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
  } else if (
    brentPromotion.moveStatus === 'unconfirmed-jump-hold' &&
    positiveFinite(brentPromotion.selectedValue)
  ) {
    values.brent = brentPromotion.selectedValue;
    changes.brent1d = null;
    sourceDetails.brent = {
      ...sourceDetails.brent,
      value: brentPromotion.selectedValue,
      source: `${brentPromotion.selectedSource} held after unconfirmed Brent jump`,
      timestamp: brentPromotion.previousUpdatedAt ?? brentPromotion.anchorObservedAt,
      error: null,
      promotionHeld: true,
      promotionReason: brentPromotion.reason,
      moveStatus: brentPromotion.moveStatus,
      moveReason: brentPromotion.moveReason,
      previousReferenceValue: brentPromotion.previousReferenceValue,
      previousReferenceSource: brentPromotion.previousReferenceSource,
      previousUpdatedAt: brentPromotion.previousUpdatedAt,
      promotedChangePct: brentPromotion.promotedChangePct,
      anchorSource: brentPromotion.anchorSource,
      anchorValue: brentPromotion.anchorValue,
      anchorObservedAt: brentPromotion.anchorObservedAt,
      confirmationSources: brentPromotion.confirmationSources,
      maxConfirmationDivergencePct: brentPromotion.maxConfirmationDivergencePct,
    };
  }
  brentValidation.audit = buildBrentAudit(
    sourceDetails.brent,
    brentValidation,
    brentPromotion,
    brentAnchorDetail,
    nowMs,
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
