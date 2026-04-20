import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const realtimePath = path.join(root, 'realtime', 'market.json');

const now = new Date().toISOString();
const cosd = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

const REQUEST_TIMEOUT_MS = 8000;
const REQUEST_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const USER_AGENT = 'gfr-v25.0.0-realtime/1.0';
const FRESHNESS_WINDOWS = {
  fresh: 30,
  aging: 90,
  stale: 360
};

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
    primary: { kind: 'stooq', symbol: 'xauusd', source: 'stooq:xauusd' },
    alternates: [{ kind: 'fred', id: 'GOLDAMGBD228NLBM', source: 'fred:GOLDAMGBD228NLBM' }]
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
      headers: {
        'User-Agent': USER_AGENT,
        ...(options.headers || {})
      },
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
    : `https://stooq.com/q/d/l/?s=${encodeURIComponent(descriptor.symbol)}&i=d`;

  const text = await retryTask(
    () => fetchWithTimeout(url, { timeoutMs: REQUEST_TIMEOUT_MS }),
    { label: descriptor.source }
  );

  const rows = descriptor.kind === 'fred' ? parseFredCsv(text) : parseStooqCsv(text);
  if (rows.length < 2) throw new Error(`${descriptor.source} returned insufficient rows`);
  return rows;
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
        return normalizeLiveResult(key, alternate, rows, {
          critical: spec.critical,
          fallbackUsed: true
        });
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
      notes.push(`${result.key} source failed; reused previous stable value.`);
      continue;
    }

    if (result.fallbackUsed) {
      notes.push(`${result.key} switched to a secondary live source.`);
    }
  }

  return notes.length ? notes : ['Realtime sources refreshed successfully.'];
}

function buildPayload(results, prev) {
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
  const healthScore = Math.max(
    0,
    Math.min(100, 100 - criticalMissing * 18 - fallbackCount * 6 - secondarySourceCount * 3)
  );

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
    sourceDetails: buildSourceDetails(results)
  };
}

function mockPayload() {
  const values = {
    brent: 89.8,
    dxy: 104.7,
    vix: 17.8,
    us10y: 4.31,
    us2y: 4.72,
    real10y: 1.96,
    breakeven10y: 2.35,
    spx: 5178.4,
    gold: 2384.7,
    hyOas: 3.92
  };
  const changes = {
    brent1d: 1.1,
    dxy1d: -0.08,
    vix1d: -0.5,
    us10y1d: 0.01,
    us2y1d: -0.02,
    real10y1d: 0.01,
    breakeven10y1d: 0.03,
    spx1d: 22.5,
    gold1d: 8.3,
    hyOas1d: -0.04
  };

  const sourceStatus = Object.fromEntries(Object.keys(sourceSpecs).map((key) => [key, 'mock']));
  const sourceDetails = Object.fromEntries(Object.keys(sourceSpecs).map((key) => [
    key,
    {
      ok: true,
      value: values[key],
      source: 'mock',
      timestamp: now,
      fallbackUsed: false,
      error: null,
      freshnessPrepared: true,
      ageSeconds: 0
    }
  ]));

  return {
    updatedAt: now,
    asOf: now,
    ageMinutes: 0,
    freshnessLevel: 'fresh',
    unavailable: false,
    sourceMode: 'mock',
    degradedMode: false,
    cacheOnly: false,
    healthScore: 100,
    criticalMissing: 0,
    fallbackCount: 0,
    secondarySourceCount: 0,
    lastSuccessAt: now,
    freshnessPreparedAt: now,
    freshnessPending: true,
    notes: ['Local mock mode: verify realtime payload shape only.'],
    values,
    changes,
    sourceStatus,
    sourceDetails
  };
}

async function main() {
  const prev = readPrev();
  const payload = process.env.GFR_USE_LOCAL_MOCK === '1'
    ? mockPayload()
    : buildPayload(
        await Promise.all(
          Object.entries(sourceSpecs).map(([key, spec]) => resolveMetric(key, spec, prev))
        ),
        prev
      );

  fs.mkdirSync(path.dirname(realtimePath), { recursive: true });
  fs.writeFileSync(realtimePath, JSON.stringify(payload, null, 2));
  console.log('Built realtime market successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
