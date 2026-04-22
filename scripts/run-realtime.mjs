import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const rulesPath = path.join(root, 'config', 'rules.json');
const RULES = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const realtimePath = path.join(root, 'realtime', 'market.json');

const now = new Date().toISOString();
const cosd = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

const REQUEST_TIMEOUT_MS = 8000;
const REQUEST_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const USER_AGENT = 'gfr-v26.0a-realtime/1.0';
const FRESHNESS_WINDOWS = RULES.freshnessWindows;
const BRENT_VALIDATION_SOURCES = ['ice', 'investing', 'marketscreener'];
const BRENT_REASONABLE_MIN = 30;
const BRENT_REASONABLE_MAX = 150;

const sourceSpecs = {
  brent: {
    critical: true,
    primary: { kind: 'fred', id: 'DCOILBRENTEU', source: 'fred:DCOILBRENTEU' }
  },
  dxy: {
    critical: true,
    primary: { kind: 'fred', id: 'DTWEXBGS', source: 'fred:DTWEXBGS' }
  },
  hyOas: {
    critical: true,
    primary: { kind: 'fred', id: 'BAMLH0A0HYM2', source: 'fred:BAMLH0A0HYM2' }
  },
  vix: {
    critical: true,
    primary: { kind: 'fred', id: 'VIXCLS', source: 'fred:VIXCLS' }
  },
  spx: {
    critical: false,
    primary: { kind: 'fred', id: 'SP500', source: 'fred:SP500' },
    alternates: [{ kind: 'stooq', symbol: '^spx', source: 'stooq:^spx' }]
  },
  us10y: {
    critical: true,
    primary: { kind: 'fred', id: 'DGS10', source: 'fred:DGS10' }
  },
  us2y: {
    critical: false,
    primary: { kind: 'fred', id: 'DGS2', source: 'fred:DGS2' }
  },
  real10y: {
    critical: true,
    primary: { kind: 'fred', id: 'DFII10', source: 'fred:DFII10' }
  },
  breakeven10y: {
    critical: false,
    primary: { kind: 'fred', id: 'T10YIE', source: 'fred:T10YIE' }
  },
  gold: {
    critical: false,
    primary: { kind: 'goldapi', symbol: 'XAU', source: 'goldapi:XAU' },
    alternates: [{ kind: 'stooq', symbol: 'xauusd', source: 'stooq:xauusd' }]
  }
};

function parseFredCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!date || raw === undefined || raw === '.' || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

function parseStooqCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close] = line.split(',');
    const value = Number(close);
    if (!date || !Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

function latest(rows, idx = 0) {
  return rows[rows.length - 1 - idx]?.value;
}

function buildSeriesPayload(rows) {
  const curr = latest(rows);
  const prev = latest(rows, 1);
  return {
    value: Number.isFinite(curr) ? curr : null,
    change: Number.isFinite(curr) && Number.isFinite(prev) ? +(curr - prev).toFixed(4) : 0,
    timestamp: rows[rows.length - 1]?.date ?? null
  };
}

function readPrev() {
  try {
    return JSON.parse(fs.readFileSync(realtimePath, 'utf8'));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringifyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 160);
}

function safeNumber(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractValueByPatterns(text, patterns) {
  const raw = firstMatch(text, patterns);
  return safeNumber(raw);
}

function isReasonableBrentValue(value) {
  return Number.isFinite(value) && value >= BRENT_REASONABLE_MIN && value <= BRENT_REASONABLE_MAX;
}

function parseObservedAtUtc(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const utcTime = Date.parse(cleaned.includes('GMT') || cleaned.includes('UTC') ? cleaned : `${cleaned} UTC`);
  if (!Number.isFinite(utcTime)) return null;
  return new Date(utcTime).toISOString();
}

function buildUnavailableCandidate(source, fetchedAt, delayClass, reason) {
  return {
    source,
    value: null,
    observedAt: null,
    fetchedAt,
    delayClass,
    available: false,
    reason
  };
}

function summarizeWebReason(webCandidates, recommendedSource, hasClosePair, anchorCandidate) {
  const availableSources = webCandidates.map((item) => item.source).join('/');
  if (webCandidates.length === 0) return '无可用网页源，无法形成 Brent 推荐值。';
  if (webCandidates.length >= 2 && hasClosePair) {
    return `${recommendedSource} 与 ${availableSources} 基本一致；FRED 仅作低频锚点参考。`;
  }
  if (webCandidates.length === 1 && anchorCandidate?.available) {
    return `仅 ${availableSources} 可用，已结合 FRED 锚点做偏离参考。`;
  }
  return `仅 ${availableSources} 可用，交叉验证不足。`;
}

function pickRecommendedCandidate(webCandidates) {
  if (webCandidates.length === 0) return null;
  if (webCandidates.length === 1) return webCandidates[0];

  const sortedValues = webCandidates.map((item) => item.value).sort((a, b) => a - b);
  const mid = Math.floor(sortedValues.length / 2);
  const median = sortedValues.length % 2 === 1
    ? sortedValues[mid]
    : (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  const preference = ['ice', 'investing', 'marketscreener'];
  return webCandidates
    .slice()
    .sort((a, b) => {
      const distA = Math.abs(a.value - median);
      const distB = Math.abs(b.value - median);
      if (distA !== distB) return distA - distB;
      return preference.indexOf(a.source) - preference.indexOf(b.source);
    })[0];
}

function computePairDivergencePct(a, b) {
  const avg = (a + b) / 2;
  if (!Number.isFinite(avg) || avg === 0) return null;
  return Math.abs(a - b) / avg * 100;
}

function buildBrentConsensus(candidates) {
  const webCandidates = candidates.filter((item) => BRENT_VALIDATION_SOURCES.includes(item.source) && item.available);
  const anchorCandidate = candidates.find((item) => item.source === 'fred-anchor') ?? null;
  const recommended = pickRecommendedCandidate(webCandidates);
  let divergencePct = null;
  let hasClosePair = false;

  if (webCandidates.length >= 2) {
    const divergences = [];
    for (let i = 0; i < webCandidates.length; i += 1) {
      for (let j = i + 1; j < webCandidates.length; j += 1) {
        const pct = computePairDivergencePct(webCandidates[i].value, webCandidates[j].value);
        if (pct === null) continue;
        divergences.push(pct);
        if (pct < 2) hasClosePair = true;
      }
    }
    if (divergences.length) {
      divergencePct = Number(Math.max(...divergences).toFixed(3));
    }
  }

  const recommendedValue = recommended?.value ?? null;
  const recommendedSource = recommended?.source ?? null;
  const valueLooksReasonable = isReasonableBrentValue(recommendedValue);

  let confidence = 'none';
  if (webCandidates.length >= 2 && hasClosePair && valueLooksReasonable) {
    confidence = 'high';
  } else if (webCandidates.length === 1 && anchorCandidate?.available && valueLooksReasonable) {
    confidence = 'medium';
  } else if (webCandidates.length === 1 && valueLooksReasonable) {
    confidence = 'low';
  }

  return {
    recommendedValue,
    recommendedSource,
    confidence,
    reason: summarizeWebReason(webCandidates, recommendedSource, hasClosePair, anchorCandidate),
    divergencePct,
    canPromoteToPrimary: webCandidates.length >= 2 && hasClosePair && valueLooksReasonable
  };
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function computeAgeMinutes(asOf, reference = now) {
  const asOfTime = parseTimestamp(asOf);
  const referenceTime = parseTimestamp(reference);
  if (asOfTime === null || referenceTime === null) return null;
  return Math.max(0, Math.round((referenceTime - asOfTime) / 60000));
}

function classifyFreshnessLevel(ageMinutes, hasRealtime) {
  if (!hasRealtime || ageMinutes === null) return 'unavailable';
  if (ageMinutes <= FRESHNESS_WINDOWS.fresh) return 'fresh';
  if (ageMinutes <= FRESHNESS_WINDOWS.aging) return 'aging';
  if (ageMinutes <= FRESHNESS_WINDOWS.stale) return 'stale';
  return 'unavailable';
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`timeout after ${options.timeoutMs ?? REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function retryTask(fn, { label, retries = REQUEST_RETRIES } = {}) {
  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    try {
      return await fn({ attempt });
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      attempt += 1;
    }
  }
  throw new Error(`${label} failed after ${retries + 1} attempts: ${stringifyError(lastError)}`);
}

async function fetchRows(descriptor) {
  const url = descriptor.kind === 'fred'
    ? `${FRED}?cosd=${cosd}&id=${descriptor.id}`
    : descriptor.kind === 'goldapi'
      ? `https://api.gold-api.com/price/${descriptor.symbol}`
      : `https://stooq.com/q/d/l/?s=${encodeURIComponent(descriptor.symbol)}&i=d`;

  const text = await retryTask(
    () => fetchWithTimeout(url, { timeoutMs: REQUEST_TIMEOUT_MS }),
    { label: descriptor.source }
  );

  if (descriptor.kind === 'goldapi') {
    const json = JSON.parse(text);
    if (!json || !Number.isFinite(Number(json.price))) {
      throw new Error(`${descriptor.source} returned invalid data`);
    }
    const today = new Date().toISOString().slice(0, 10);
    return [
      { date: today, value: Number(json.price) },
      { date: today, value: Number(json.price) }
    ];
  }
  const rows = descriptor.kind === 'fred' ? parseFredCsv(text) : parseStooqCsv(text);
  if (rows.length < 2) throw new Error(`${descriptor.source} returned insufficient rows`);
  return rows;
}

async function fetchBrentIceCandidate(fetchedAt) {
  const source = 'ice';
  const delayClass = 'delayed-15m';
  const url = 'https://www.ice.com/products/219/Brent-Crude-Futures';
  try {
    const text = await retryTask(
      () => fetchWithTimeout(url, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.ice.com/'
        }
      }),
      { label: 'ice:brent' }
    );

    const value = extractValueByPatterns(text, [
      /"lastPrice"\s*:\s*"([\d.,]+)"/i,
      /"settlementPrice"\s*:\s*"([\d.,]+)"/i,
      /Last\s*Price[\s\S]{0,120}?>([\d.,]+)</i
    ]);
    if (!Number.isFinite(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:value');
    }
    if (!isReasonableBrentValue(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, `parse-failed:out-of-range(${value})`);
    }
    const observedRaw = firstMatch(text, [
      /As of\s*([^<]{8,40}(?:GMT|UTC))/i,
      /Last updated\s*([^<]{8,40}(?:GMT|UTC))/i
    ]);
    return {
      source,
      value,
      observedAt: parseObservedAtUtc(observedRaw),
      fetchedAt,
      delayClass,
      available: true,
      reason: null
    };
  } catch (error) {
    return buildUnavailableCandidate(source, fetchedAt, delayClass, `fetch-failed:${stringifyError(error)}`);
  }
}

async function fetchBrentInvestingCandidate(fetchedAt) {
  const source = 'investing';
  const delayClass = 'delay-unknown';
  const url = 'https://www.investing.com/commodities/brent-oil';
  try {
    const text = await retryTask(
      () => fetchWithTimeout(url, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.investing.com/'
        }
      }),
      { label: 'investing:brent' }
    );
    const value = extractValueByPatterns(text, [
      /data-test="instrument-price-last"[^>]*>([\d.,]+)</i,
      /"last_last"\s*:\s*"([\d.,]+)"/i,
      /"last"\s*:\s*"([\d.,]+)"/i
    ]);
    if (!Number.isFinite(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:value');
    }
    if (!isReasonableBrentValue(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, `parse-failed:out-of-range(${value})`);
    }
    const observedRaw = firstMatch(text, [
      /data-test="instrument-price-last-updated"[^>]*>([^<]+)</i,
      /Last Update:\s*([^<]{5,40})</i
    ]);
    return {
      source,
      value,
      observedAt: parseObservedAtUtc(observedRaw),
      fetchedAt,
      delayClass,
      available: true,
      reason: null
    };
  } catch (error) {
    return buildUnavailableCandidate(source, fetchedAt, delayClass, `fetch-failed:${stringifyError(error)}`);
  }
}

async function fetchBrentMarketScreenerCandidate(fetchedAt) {
  const source = 'marketscreener';
  const delayClass = 'delayed-otc';
  const url = 'https://www.marketscreener.com/quote/commodity/BRENT-CRUDE-OIL-SPOT-4948/';
  try {
    const text = await retryTask(
      () => fetchWithTimeout(url, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.marketscreener.com/'
        }
      }),
      { label: 'marketscreener:brent' }
    );
    const value = extractValueByPatterns(text, [
      /"last"\s*:\s*"([\d.,]+)"/i,
      /class="c-faceplate__price"[^>]*>([\d.,]+)</i,
      /BRENT[^<]{0,120}([\d]{2,3}\.[\d]{1,3})/i
    ]);
    if (!Number.isFinite(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:value');
    }
    if (!isReasonableBrentValue(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, `parse-failed:out-of-range(${value})`);
    }
    const observedRaw = firstMatch(text, [
      /As of\s*([^<]{8,40}(?:GMT|UTC))/i,
      /Updated on\s*([^<]{8,40}(?:GMT|UTC))/i
    ]);
    return {
      source,
      value,
      observedAt: parseObservedAtUtc(observedRaw),
      fetchedAt,
      delayClass,
      available: true,
      reason: null
    };
  } catch (error) {
    return buildUnavailableCandidate(source, fetchedAt, delayClass, `fetch-failed:${stringifyError(error)}`);
  }
}

function buildFredAnchorCandidate(brentResult, fetchedAt) {
  const source = 'fred-anchor';
  const delayClass = 'daily-anchor';
  if (!Number.isFinite(brentResult?.value)) {
    return buildUnavailableCandidate(source, fetchedAt, delayClass, 'missing-fred-value');
  }
  return {
    source,
    value: brentResult.value,
    observedAt: typeof brentResult.timestamp === 'string' ? brentResult.timestamp : null,
    fetchedAt,
    delayClass,
    available: true,
    reason: null
  };
}

async function buildBrentValidation(results, fetchedAt) {
  const brentResult = results.find((item) => item.key === 'brent');
  const [iceCandidate, investingCandidate, marketScreenerCandidate] = await Promise.all([
    fetchBrentIceCandidate(fetchedAt),
    fetchBrentInvestingCandidate(fetchedAt),
    fetchBrentMarketScreenerCandidate(fetchedAt)
  ]);
  const candidates = [
    iceCandidate,
    investingCandidate,
    marketScreenerCandidate,
    buildFredAnchorCandidate(brentResult, fetchedAt)
  ];
  return {
    candidates,
    consensus: buildBrentConsensus(candidates)
  };
}

function normalizeLiveResult(key, descriptor, rows, { critical, fallbackUsed = false } = {}) {
  const payload = buildSeriesPayload(rows);
  return {
    key,
    ok: true,
    value: payload.value,
    change: payload.change,
    source: descriptor.source,
    timestamp: payload.timestamp,
    fallbackUsed,
    error: null,
    critical,
    freshnessPrepared: true,
    ageSeconds: payload.timestamp
      ? Math.max(0, Math.round((Date.now() - Date.parse(`${payload.timestamp}T00:00:00Z`)) / 1000))
      : null,
    sourceStatusLabel: fallbackUsed ? `${descriptor.source}:secondary` : descriptor.source
  };
}

function normalizeFallbackResult(key, descriptor, prev, critical, error) {
  const prevValue = prev?.values?.[key];
  const prevChange = prev?.changes?.[`${key}1d`];
  const prevTimestamp = prev?.sourceDetails?.[key]?.timestamp ?? prev?.lastSuccessAt ?? null;
  return {
    key,
    ok: false,
    value: Number.isFinite(prevValue) ? prevValue : null,
    change: Number.isFinite(prevChange) ? prevChange : 0,
    source: descriptor.source,
    timestamp: prevTimestamp,
    fallbackUsed: true,
    error: stringifyError(error),
    critical,
    freshnessPrepared: true,
    ageSeconds: prevTimestamp ? Math.max(0, Math.round((Date.now() - Date.parse(prevTimestamp)) / 1000)) : null,
    sourceStatusLabel: `fallback:${descriptor.source}:${stringifyError(error)}`
  };
}

async function resolveMetric(key, spec, prev) {
  try {
    const rows = await fetchRows(spec.primary);
    return normalizeLiveResult(key, spec.primary, rows, { critical: spec.critical });
  } catch (primaryError) {
    const alternateErrors = [];
    for (const alternate of spec.alternates || []) {
      try {
        const rows = await fetchRows(alternate);
        return normalizeLiveResult(key, alternate, rows, { critical: spec.critical, fallbackUsed: true });
      } catch (alternateError) {
        alternateErrors.push(`${alternate.source}:${stringifyError(alternateError)}`);
      }
    }
    const combinedError = alternateErrors.length
      ? new Error(`${stringifyError(primaryError)} | ${alternateErrors.join(' | ')}`)
      : primaryError;
    return normalizeFallbackResult(key, spec.primary, prev, spec.critical, combinedError);
  }
}

function buildSourceDetails(results) {
  return Object.fromEntries(results.map((result) => [
    result.key,
    {
      ok: result.ok,
      value: result.value,
      source: result.source,
      timestamp: result.timestamp,
      fallbackUsed: result.fallbackUsed,
      error: result.error,
      freshnessPrepared: result.freshnessPrepared,
      ageSeconds: result.ageSeconds
    }
  ]));
}

function buildSourceStatus(results) {
  return Object.fromEntries(results.map((result) => [result.key, result.sourceStatusLabel]));
}

function buildNotes(results) {
  const notes = [];
  for (const result of results) {
    if (!result.ok) {
      notes.push(`${result.key} 数据源失败，已沿用上次有效值。`);
      continue;
    }
    if (result.fallbackUsed) {
      notes.push(`${result.key} 已切换到备用实时数据源。`);
    }
  }
  return notes.length ? notes : ['实时数据源刷新成功。'];
}

function buildFieldFreshness(sourceDetails) {
  const brentObservedAtRaw = sourceDetails?.brent?.timestamp;
  const brentObservedAt = typeof brentObservedAtRaw === 'string' && brentObservedAtRaw ? brentObservedAtRaw : null;
  const brentAgeMinutes = computeAgeMinutes(brentObservedAt, now);
  const brentFreshnessLevel = classifyFreshnessLevel(brentAgeMinutes, Number.isFinite(sourceDetails?.brent?.value));
  return {
    brent: {
      observedAt: brentObservedAt,
      ageMinutes: brentAgeMinutes,
      freshnessLevel: brentFreshnessLevel,
      isStale: brentFreshnessLevel === 'stale' || brentFreshnessLevel === 'unavailable'
    }
  };
}

function buildPayload(results, prev, brentValidation = null) {
  const values = {};
  const changes = {};
  for (const result of results) {
    values[result.key] = result.value;
    changes[`${result.key}1d`] = result.change;
  }
  const criticalMissing = results.filter((result) => result.critical && !result.ok).length;
  const fallbackCount = results.filter((result) => !result.ok).length;
  const secondarySourceCount = results.filter((result) => result.ok && result.fallbackUsed).length;
  const liveSuccessCount = results.filter((result) => result.ok).length;
  const cacheOnly = criticalMissing >= 4 || liveSuccessCount === 0;
  const degradedMode = cacheOnly || criticalMissing >= 2 || fallbackCount >= 3 || secondarySourceCount >= 2;
  const asOf = liveSuccessCount === 0 ? (prev?.asOf ?? prev?.lastSuccessAt ?? null) : now;
  const ageMinutes = computeAgeMinutes(asOf, now);
  const freshnessLevel = classifyFreshnessLevel(ageMinutes, liveSuccessCount > 0 || !!prev?.values);
  const unavailable = freshnessLevel === 'unavailable';
  const hs = RULES.healthScoring;
  const healthScore = Math.max(
    0,
    Math.min(100, 100 - criticalMissing * hs.criticalMissingPenalty - fallbackCount * hs.fallbackPenalty - secondarySourceCount * hs.secondarySourcePenalty)
  );
  const sourceDetails = buildSourceDetails(results);
  return {
    updatedAt: now,
    asOf,
    ageMinutes,
    freshnessLevel,
    unavailable,
    sourceMode: cacheOnly ? 'cache-only' : degradedMode ? 'live-with-fallback' : 'live',
    degradedMode,
    cacheOnly,
    healthScore,
    criticalMissing,
    fallbackCount,
    secondarySourceCount,
    lastSuccessAt: cacheOnly ? (prev?.lastSuccessAt ?? now) : now,
    freshnessPreparedAt: now,
    freshnessPending: true,
    notes: buildNotes(results),
    values,
    changes,
    sourceStatus: buildSourceStatus(results),
    sourceDetails,
    fieldFreshness: buildFieldFreshness(sourceDetails),
    brentValidation
  };
}

function mockPayload() {
  const values = {
    brent: 89.8, dxy: 104.7, vix: 17.8, us10y: 4.31, us2y: 4.72,
    real10y: 1.96, breakeven10y: 2.35, spx: 5178.4, gold: 2384.7, hyOas: 3.92
  };
  const changes = {
    brent1d: 1.1, dxy1d: -0.08, vix1d: -0.5, us10y1d: 0.01, us2y1d: -0.02,
    real10y1d: 0.01, breakeven10y1d: 0.03, spx1d: 22.5, gold1d: 8.3, hyOas1d: -0.04
  };
  const sourceStatus = Object.fromEntries(Object.keys(sourceSpecs).map((key) => [key, 'mock']));
  const sourceDetails = Object.fromEntries(Object.keys(sourceSpecs).map((key) => [
    key,
    { ok: true, value: values[key], source: 'mock', timestamp: now, fallbackUsed: false, error: null, freshnessPrepared: true, ageSeconds: 0 }
  ]));
  const fieldFreshness = buildFieldFreshness(sourceDetails);
  return {
    updatedAt: now, asOf: now, ageMinutes: 0, freshnessLevel: 'fresh', unavailable: false,
    sourceMode: 'mock', degradedMode: false, cacheOnly: false, healthScore: 100,
    criticalMissing: 0, fallbackCount: 0, secondarySourceCount: 0, lastSuccessAt: now,
    freshnessPreparedAt: now, freshnessPending: true,
    notes: ['本地模拟模式：仅用于验证实时数据格式。'],
    values, changes, sourceStatus, sourceDetails, fieldFreshness,
    brentValidation: {
      candidates: [
        { source: 'ice', value: 89.82, observedAt: now, fetchedAt: now, delayClass: 'delayed-15m', available: true, reason: null },
        { source: 'investing', value: 89.79, observedAt: null, fetchedAt: now, delayClass: 'delay-unknown', available: true, reason: null },
        { source: 'marketscreener', value: 89.85, observedAt: null, fetchedAt: now, delayClass: 'delayed-otc', available: true, reason: null },
        { source: 'fred-anchor', value: 89.8, observedAt: now.slice(0, 10), fetchedAt: now, delayClass: 'daily-anchor', available: true, reason: null }
      ],
      consensus: {
        recommendedValue: 89.82,
        recommendedSource: 'ice',
        confidence: 'high',
        reason: 'ice 与 investing/marketscreener 基本一致；FRED 仅作低频锚点参考。',
        divergencePct: 0.07,
        canPromoteToPrimary: true
      }
    }
  };
}

async function main() {
  const prev = readPrev();
  const payload = process.env.GFR_USE_LOCAL_MOCK === '1'
    ? mockPayload()
    : await (async () => {
      const results = await Promise.all(
        Object.entries(sourceSpecs).map(([key, spec]) => resolveMetric(key, spec, prev))
      );
      const brentValidation = await buildBrentValidation(results, now).catch((error) => ({
        candidates: [buildUnavailableCandidate('ice', now, 'delayed-15m', `validation-failed:${stringifyError(error)}`),
          buildUnavailableCandidate('investing', now, 'delay-unknown', 'validation-failed:skipped'),
          buildUnavailableCandidate('marketscreener', now, 'delayed-otc', 'validation-failed:skipped'),
          buildUnavailableCandidate('fred-anchor', now, 'daily-anchor', 'validation-failed:skipped')],
        consensus: {
          recommendedValue: null,
          recommendedSource: null,
          confidence: 'none',
          reason: `brent 验证链路异常：${stringifyError(error)}`,
          divergencePct: null,
          canPromoteToPrimary: false
        }
      }));
      return buildPayload(results, prev, brentValidation);
    })();
  fs.mkdirSync(path.dirname(realtimePath), { recursive: true });
  fs.writeFileSync(realtimePath, JSON.stringify(payload, null, 2));
  console.log('实时市场数据构建成功。(v27.0)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
