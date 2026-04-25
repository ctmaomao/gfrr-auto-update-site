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
const BRENT_VALIDATION_SOURCES = ['ice', 'barchart', 'stooq', 'marketwatch', 'oilprice', 'yahoo'];
const BRENT_SOURCE_PREFERENCE = ['ice', 'barchart', 'stooq', 'marketwatch', 'oilprice', 'yahoo'];
const BRENT_SOURCE_QUALITY = {
  ice: 'high',
  barchart: 'high',
  stooq: 'high',
  marketwatch: 'high',
  oilprice: 'medium',
  yahoo: 'weak',
  'fred-anchor': 'anchor'
};
const BRENT_CONSENSUS_MAX_AGE_MINUTES = 120;
const BRENT_CONSENSUS_DIVERGENCE_PCT = 2;
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

function classifyFetchFailure(error) {
  const msg = stringifyError(error);
  const httpMatch = msg.match(/HTTP\s*(\d{3})/i);
  if (httpMatch) {
    const code = Number(httpMatch[1]);
    if (code === 403) return 'fetch-failed:http-403';
    if (code === 404) return 'fetch-failed:http-404';
    if (code === 429) return 'fetch-failed:http-429';
    if (code >= 500 && code < 600) return 'fetch-failed:http-5xx';
    return `fetch-failed:http-${code}`;
  }
  if (/timeout|abort/i.test(msg)) return 'fetch-failed:timeout';
  return `fetch-failed:${msg}`;
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
  const cleaned = raw.replace(/\bat\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const hasTimeZone = /(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  const utcTime = Date.parse(hasTimeZone ? cleaned : `${cleaned} UTC`);
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

function summarizeWebReason(consensusCandidates, recommendedSource, selectedPair, divergencePct) {
  const availableSources = consensusCandidates.map((item) => item.source).join('/');
  if (consensusCandidates.length < 2) {
    return '无足够可用候选源，暂不形成 Brent 推荐值；FRED 仅作低频锚点参考。';
  }
  if (!selectedPair) {
    const suffix = Number.isFinite(divergencePct) ? `，最大偏差 ${divergencePct}%` : '';
    return `候选源偏差过大${suffix}，暂不形成 Brent 推荐值；FRED 仅作低频锚点参考。`;
  }
  const pairSources = selectedPair.map((item) => item.source).join('/');
  return `${pairSources} 基本一致，推荐优先采用 ${recommendedSource}；FRED 仅作低频锚点参考。`;
}

function sourcePreferenceIndex(source) {
  const index = BRENT_SOURCE_PREFERENCE.indexOf(source);
  return index === -1 ? BRENT_SOURCE_PREFERENCE.length : index;
}

function pickRecommendedCandidate(webCandidates) {
  if (webCandidates.length === 0) return null;
  return webCandidates
    .slice()
    .sort((a, b) => {
      return sourcePreferenceIndex(a.source) - sourcePreferenceIndex(b.source);
    })[0];
}

function computePairDivergencePct(a, b) {
  const avg = (a + b) / 2;
  if (!Number.isFinite(avg) || avg === 0) return null;
  return Math.abs(a - b) / avg * 100;
}

function isFreshEnoughForConsensus(candidate, fetchedAt) {
  if (candidate?.source === 'fred-anchor') return false;
  if (candidate?.source === 'stooq') return true;
  const observedTime = parseTimestamp(candidate?.observedAt);
  const fetchedTime = parseTimestamp(fetchedAt);
  if (observedTime === null || fetchedTime === null) return false;
  const ageMinutes = Math.max(0, Math.round((fetchedTime - observedTime) / 60000));
  return ageMinutes <= BRENT_CONSENSUS_MAX_AGE_MINUTES;
}

function annotateBrentCandidateForConsensus(candidate, fetchedAt) {
  const quality = BRENT_SOURCE_QUALITY[candidate.source] ?? 'unknown';
  const isDateOnlyObservedAt = typeof candidate.observedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate.observedAt);
  const ageMinutes = candidate.observedAt && !isDateOnlyObservedAt ? computeAgeMinutes(candidate.observedAt, fetchedAt) : null;
  const base = {
    ...candidate,
    quality,
    ageMinutes,
    staleForConsensus: false,
    excludedFromConsensus: null
  };

  if (candidate.source === 'fred-anchor') {
    return { ...base, excludedFromConsensus: 'fred-anchor' };
  }
  if (!BRENT_VALIDATION_SOURCES.includes(candidate.source)) {
    return { ...base, excludedFromConsensus: 'unknown-source' };
  }
  if (!candidate.available) {
    return { ...base, excludedFromConsensus: 'unavailable' };
  }
  if (!isReasonableBrentValue(candidate.value)) {
    return { ...base, excludedFromConsensus: 'out-of-range' };
  }
  if (candidate.source === 'stooq') {
    return base;
  }
  if (!candidate.observedAt || parseTimestamp(candidate.observedAt) === null) {
    return { ...base, staleForConsensus: true, excludedFromConsensus: 'observedAt-missing' };
  }
  if (!isFreshEnoughForConsensus(candidate, fetchedAt)) {
    return {
      ...base,
      staleForConsensus: true,
      excludedFromConsensus: `observedAt-stale(${ageMinutes}m)`
    };
  }
  return base;
}

function findBestClosePair(consensusCandidates) {
  let bestPair = null;
  let bestDivergence = null;
  for (let i = 0; i < consensusCandidates.length; i += 1) {
    for (let j = i + 1; j < consensusCandidates.length; j += 1) {
      const left = consensusCandidates[i];
      const right = consensusCandidates[j];
      const pct = computePairDivergencePct(left.value, right.value);
      if (pct === null || pct >= BRENT_CONSENSUS_DIVERGENCE_PCT) continue;
      const pair = [left, right].sort((a, b) => sourcePreferenceIndex(a.source) - sourcePreferenceIndex(b.source));
      if (
        bestPair === null ||
        pct < bestDivergence ||
        (pct === bestDivergence && sourcePreferenceIndex(pair[0].source) < sourcePreferenceIndex(bestPair[0].source))
      ) {
        bestPair = pair;
        bestDivergence = pct;
      }
    }
  }
  return { bestPair, bestDivergence };
}

function buildBrentConsensus(candidates, fetchedAt) {
  const annotatedCandidates = candidates.map((item) => annotateBrentCandidateForConsensus(item, fetchedAt));
  const consensusCandidates = annotatedCandidates.filter((item) => item.excludedFromConsensus === null);
  let divergencePct = null;

  if (consensusCandidates.length >= 2) {
    const divergences = [];
    for (let i = 0; i < consensusCandidates.length; i += 1) {
      for (let j = i + 1; j < consensusCandidates.length; j += 1) {
        const pct = computePairDivergencePct(consensusCandidates[i].value, consensusCandidates[j].value);
        if (pct === null) continue;
        divergences.push(pct);
      }
    }
    if (divergences.length) {
      divergencePct = Number(Math.max(...divergences).toFixed(3));
    }
  }

  const { bestPair, bestDivergence } = findBestClosePair(consensusCandidates);
  const recommended = bestPair ? pickRecommendedCandidate(bestPair) : null;
  const selectedDivergencePct = Number.isFinite(bestDivergence) ? Number(bestDivergence.toFixed(3)) : null;

  let confidence = 'none';
  if (bestPair) {
    const highQualityCount = bestPair.filter((item) => item.quality === 'high').length;
    confidence = highQualityCount >= 2 ? 'high' : 'medium';
  }
  const canRecommend = confidence === 'high' || confidence === 'medium';

  return {
    recommendedValue: canRecommend ? recommended.value : null,
    recommendedSource: canRecommend ? recommended.source : null,
    confidence,
    reason: summarizeWebReason(consensusCandidates, recommended?.source ?? null, bestPair, divergencePct),
    divergencePct: selectedDivergencePct ?? divergencePct,
    canPromoteToPrimary: canRecommend,
    excludedFromConsensus: annotatedCandidates
      .filter((item) => item.excludedFromConsensus !== null)
      .map((item) => ({
        source: item.source,
        reason: item.excludedFromConsensus,
        ageMinutes: item.ageMinutes
      }))
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
  const url = 'https://www.ice.com/products/219/Brent-Crude-Futures/data?marketId=400137160';
  try {
    const text = await retryTask(
      () => fetchWithTimeout(url, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.ice.com/products/219/Brent-Crude-Futures'
        }
      }),
      { label: 'ice:brent' }
    );

    const value = extractValueByPatterns(text, [
      /"lastPrice"\s*:\s*"?([\d.,]+)"?/i,
      /"settlementPrice"\s*:\s*"?([\d.,]+)"?/i,
      /"marketPrice"\s*:\s*"?([\d.,]+)"?/i,
      /"price"\s*:\s*"?([\d.,]+)"?/i,
      /Last\s*Price[\s\S]{0,160}?>([\d.,]+)</i,
      /"previousDaySettlementPrice"\s*:\s*"?([\d.,]+)"?/i
    ]);
    if (!Number.isFinite(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:value');
    }
    if (!isReasonableBrentValue(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, `parse-failed:out-of-range(${value})`);
    }
    const observedRaw = firstMatch(text, [
      /"lastTime"\s*:\s*"([^"]{4,40})"/i,
      /"lastUpdateTime"\s*:\s*"([^"]{4,40})"/i,
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
    return buildUnavailableCandidate(source, fetchedAt, delayClass, classifyFetchFailure(error));
  }
}

async function fetchBrentYahooCandidate(fetchedAt) {
  const source = 'yahoo';
  const delayClass = 'delayed-15m';
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d';
  try {
    const text = await retryTask(
      () => fetchWithTimeout(url, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://finance.yahoo.com/quote/BZ=F/'
        }
      }),
      { label: 'yahoo:brent' }
    );
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:non-json');
    }
    const meta = payload?.chart?.result?.[0]?.meta;
    const rawValue = meta?.regularMarketPrice;
    const value = Number.isFinite(rawValue) ? Number(rawValue) : null;
    if (!Number.isFinite(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:value');
    }
    if (!isReasonableBrentValue(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, `parse-failed:out-of-range(${value})`);
    }
    const marketTime = Number(meta?.regularMarketTime);
    const observedAt = Number.isFinite(marketTime) && marketTime > 0
      ? new Date(marketTime * 1000).toISOString()
      : null;
    return {
      source,
      value,
      observedAt,
      fetchedAt,
      delayClass,
      available: true,
      reason: null
    };
  } catch (error) {
    return buildUnavailableCandidate(source, fetchedAt, delayClass, classifyFetchFailure(error));
  }
}

async function fetchBrentHtmlCandidate({
  source,
  delayClass,
  url,
  headers,
  valuePatterns,
  observedAtPatterns,
  parseFailureReason = 'parse-failed:value'
}, fetchedAt) {
  try {
    const text = await retryTask(
      () => fetchWithTimeout(url, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers
      }),
      { label: `${source}:brent` }
    );
    if (!text || typeof text !== 'string') {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:page-structure');
    }
    const value = extractValueByPatterns(text, valuePatterns);
    if (!Number.isFinite(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, parseFailureReason);
    }
    if (!isReasonableBrentValue(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, `parse-failed:out-of-range(${value})`);
    }
    const observedRaw = firstMatch(text, observedAtPatterns);
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
    return buildUnavailableCandidate(source, fetchedAt, delayClass, classifyFetchFailure(error));
  }
}

async function fetchBrentBarchartCandidate(fetchedAt) {
  return fetchBrentHtmlCandidate({
    source: 'barchart',
    delayClass: 'delayed-10m',
    url: 'https://www.barchart.com/futures/quotes/CB*0/overview',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.barchart.com/futures/major-commodities'
    },
    valuePatterns: [
      /"lastPrice"\s*:\s*"?([\d.,]+)"?/i,
      /"last"\s*:\s*"?([\d.,]+)"?/i,
      /"price"\s*:\s*"?([\d.,]+)"?/i,
      /Last Price[\s\S]{0,240}?>([\d.,]+)</i,
      /data-ng-bind="symbol\.lastPrice"[^>]*>([\d.,]+)</i
    ],
    observedAtPatterns: [
      /"tradeTime"\s*:\s*"([^"]{4,60})"/i,
      /"serverTimestamp"\s*:\s*"([^"]{4,60})"/i,
      /Last Updated\s*:?\s*([^<]{8,60})/i
    ],
    parseFailureReason: 'parse-failed:page-structure'
  }, fetchedAt);
}

async function fetchBrentMarketWatchCandidate(fetchedAt) {
  return fetchBrentHtmlCandidate({
    source: 'marketwatch',
    delayClass: 'delayed-10m',
    url: 'https://www.marketwatch.com/investing/future/brn00',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.marketwatch.com/markets/futures'
    },
    valuePatterns: [
      /<bg-quote[^>]+field="Last"[^>]*>\s*([\d.,]+)\s*<\/bg-quote>/i,
      /"last"\s*:\s*"?([\d.,]+)"?/i,
      /"price"\s*:\s*"?([\d.,]+)"?/i,
      /Last[\s\S]{0,180}?class="[^"]*value[^"]*"[^>]*>\s*([\d.,]+)\s*</i
    ],
    observedAtPatterns: [
      /<span[^>]+class="[^"]*timestamp[^"]*"[^>]*>\s*([^<]{8,80})\s*<\/span>/i,
      /Last Updated\s*:?\s*([^<]{8,80})/i,
      /"timestamp"\s*:\s*"([^"]{4,60})"/i
    ],
    parseFailureReason: 'parse-failed:page-structure'
  }, fetchedAt);
}

async function fetchBrentOilpriceCandidate(fetchedAt) {
  return fetchBrentHtmlCandidate({
    source: 'oilprice',
    delayClass: 'delayed-web',
    url: 'https://oilprice.com/oil-price-charts/',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://oilprice.com/'
    },
    valuePatterns: [
      /Brent\s+Crude[\s\S]{0,500}?"price"\s*:\s*"?([\d.,]+)"?/i,
      /Brent\s+Crude[\s\S]{0,500}?data-price=["']([\d.,]+)["']/i,
      /Brent\s+Crude[\s\S]{0,260}?<td[^>]*>\s*([\d.,]+)\s*<\/td>/i,
      /"Brent Crude"[\s\S]{0,260}?([\d]{2,3}\.\d{1,2})/i
    ],
    observedAtPatterns: [
      /Last Updated\s*:?\s*([^<]{8,80})/i,
      /Updated\s*:?\s*([^<]{8,80})/i,
      /"last_updated"\s*:\s*"([^"]{4,60})"/i
    ],
    parseFailureReason: 'parse-failed:page-structure'
  }, fetchedAt);
}

async function fetchBrentStooqCandidate(fetchedAt) {
  const source = 'stooq';
  const delayClass = 'delayed-eod';
  const url = 'https://stooq.com/q/l/?s=cb.f&f=sd2t2c&h&e=csv';
  try {
    const text = await retryTask(
      () => fetchWithTimeout(url, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'text/csv,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://stooq.com/'
        }
      }),
      { label: 'stooq:brent' }
    );
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:empty-csv');
    }
    const fields = lines[1].split(',');
    if (fields.length < 4) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:csv-structure');
    }
    const [, date, time, close] = fields;
    if (!close || /N\/?D/i.test(close) || /N\/?D/i.test(date ?? '')) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:symbol-no-data');
    }
    const value = safeNumber(close);
    if (!Number.isFinite(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, 'parse-failed:value');
    }
    if (!isReasonableBrentValue(value)) {
      return buildUnavailableCandidate(source, fetchedAt, delayClass, `parse-failed:out-of-range(${value})`);
    }
    let observedAt = null;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const fetchedMs = Date.parse(fetchedAt);
      const dateMs = Date.parse(`${date}T00:00:00Z`);
      if (Number.isFinite(fetchedMs) && Number.isFinite(dateMs) && dateMs <= fetchedMs) {
        observedAt = date;
      }
    }
    return {
      source,
      value,
      observedAt,
      fetchedAt,
      delayClass,
      available: true,
      reason: null
    };
  } catch (error) {
    return buildUnavailableCandidate(source, fetchedAt, delayClass, classifyFetchFailure(error));
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
  const [iceCandidate, barchartCandidate, stooqCandidate, marketWatchCandidate, oilpriceCandidate, yahooCandidate] = await Promise.all([
    fetchBrentIceCandidate(fetchedAt),
    fetchBrentBarchartCandidate(fetchedAt),
    fetchBrentStooqCandidate(fetchedAt),
    fetchBrentMarketWatchCandidate(fetchedAt),
    fetchBrentOilpriceCandidate(fetchedAt),
    fetchBrentYahooCandidate(fetchedAt)
  ]);
  const candidates = [
    iceCandidate,
    barchartCandidate,
    stooqCandidate,
    marketWatchCandidate,
    oilpriceCandidate,
    yahooCandidate,
    buildFredAnchorCandidate(brentResult, fetchedAt)
  ].map((candidate) => annotateBrentCandidateForConsensus(candidate, fetchedAt));
  return {
    candidates,
    consensus: buildBrentConsensus(candidates, fetchedAt)
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
        { source: 'ice', value: 89.82, observedAt: now, fetchedAt: now, delayClass: 'delayed-15m', available: true, reason: null, quality: 'high', ageMinutes: 0, staleForConsensus: false, excludedFromConsensus: null },
        { source: 'barchart', value: 89.83, observedAt: now, fetchedAt: now, delayClass: 'delayed-10m', available: true, reason: null, quality: 'high', ageMinutes: 0, staleForConsensus: false, excludedFromConsensus: null },
        { source: 'stooq', value: 89.85, observedAt: now.slice(0, 10), fetchedAt: now, delayClass: 'delayed-eod', available: true, reason: null, quality: 'high', ageMinutes: null, staleForConsensus: false, excludedFromConsensus: null },
        { source: 'marketwatch', value: 89.81, observedAt: now, fetchedAt: now, delayClass: 'delayed-10m', available: true, reason: null, quality: 'high', ageMinutes: 0, staleForConsensus: false, excludedFromConsensus: null },
        { source: 'oilprice', value: 89.84, observedAt: now, fetchedAt: now, delayClass: 'delayed-web', available: true, reason: null, quality: 'medium', ageMinutes: 0, staleForConsensus: false, excludedFromConsensus: null },
        { source: 'yahoo', value: 89.79, observedAt: now, fetchedAt: now, delayClass: 'delayed-15m', available: true, reason: null, quality: 'weak', ageMinutes: 0, staleForConsensus: false, excludedFromConsensus: null },
        { source: 'fred-anchor', value: 89.8, observedAt: now.slice(0, 10), fetchedAt: now, delayClass: 'daily-anchor', available: true, reason: null, quality: 'anchor', ageMinutes: null, staleForConsensus: false, excludedFromConsensus: 'fred-anchor' }
      ],
      consensus: {
        recommendedValue: 89.82,
        recommendedSource: 'ice',
        confidence: 'high',
        reason: 'ice/barchart 基本一致，推荐优先采用 ice；FRED 仅作低频锚点参考。',
        divergencePct: 0.07,
        canPromoteToPrimary: true,
        excludedFromConsensus: [{ source: 'fred-anchor', reason: 'fred-anchor', ageMinutes: null }]
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
          buildUnavailableCandidate('barchart', now, 'delayed-10m', 'validation-failed:skipped'),
          buildUnavailableCandidate('stooq', now, 'delayed-eod', 'validation-failed:skipped'),
          buildUnavailableCandidate('marketwatch', now, 'delayed-10m', 'validation-failed:skipped'),
          buildUnavailableCandidate('oilprice', now, 'delayed-web', 'validation-failed:skipped'),
          buildUnavailableCandidate('yahoo', now, 'delayed-15m', 'validation-failed:skipped'),
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
