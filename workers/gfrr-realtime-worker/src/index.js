/**
 * v28.0E-0: Worker-first preview pipeline with isolated secondary diagnostics.
 * /market.preview.json reads the GitHub mirror preview.
 * /market.worker-preview.json reads the Worker-generated preview MVP.
 * /market.secondary-preview.json reads isolated secondary diagnostics only.
 * /market.json still reads market:latest only and is not written here.
 */

import { buildWorkerGeneratedMarketPreview } from './worker-market-preview.js';

const MARKET_LATEST_KEY = 'market:latest';
const HEARTBEAT_KEY = 'market:worker-heartbeat';
const GITHUB_REALTIME_URL =
  'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';
const MARKET_PREVIEW_KEY = 'market:latest-preview';
const MARKET_WORKER_GENERATED_PREVIEW_KEY = 'market:worker-generated-preview';
const MARKET_SECONDARY_PREVIEW_KEY = 'market:secondary-preview';
const CBOE_VIX_HISTORY_URL = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
const YAHOO_GOLD_SECONDARY_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=5d';
const YAHOO_DXY_SECONDARY_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d';
const YAHOO_US10Y_SECONDARY_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d';
const YAHOO_SPX_SECONDARY_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PREVIEW_ERROR_MAX = 180;
const SCHEDULE_SLOT_MS = 3 * 60 * 1000;
const SECONDARY_PREVIEW_MIN_INTERVAL_MS = 30 * 60 * 1000;
const SECONDARY_PREVIEW_TIMEOUT_MS = 4000;
const SECONDARY_PREVIEW_USER_AGENT =
  'Mozilla/5.0 (compatible; GFRRWorkerSecondaryPreview/28.0E-0; +https://ctmaomao.github.io/gfrr-auto-update-site/)';
const SECONDARY_PREVIEW_ACCEPT = Object.freeze({
  csv: 'text/csv,text/plain,*/*',
  json: 'application/json,text/plain,*/*',
});

function truncatePreviewError(msg) {
  if (msg == null || msg === '') return null;
  const s = String(msg);
  if (s.length <= PREVIEW_ERROR_MAX) return s;
  return `${s.slice(0, PREVIEW_ERROR_MAX - 3)}...`;
}

function jsonResponse(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function isValidPreviewPayload(payload) {
  if (payload == null || typeof payload !== 'object') return false;
  if (!('updatedAt' in payload) || payload.updatedAt == null) return false;
  if (!('values' in payload) || payload.values == null) return false;
  return true;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractPreviousWorkerPreviewSummary(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const promotion = payload.brentValidation?.promotion || {};
  const sourceProbe = payload.brentValidation?.sourceProbe || {};
  const sourceDetails = payload.sourceDetails?.brent || {};
  return {
    previousUpdatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    previousValuesBrent: positiveNumber(payload.values?.brent),
    previousPromotionApplied: promotion.applied === true,
    previousPromotionSelectedValue: positiveNumber(promotion.selectedValue),
    previousPromotionSelectedSource: typeof promotion.selectedSource === 'string' ? promotion.selectedSource : null,
    previousPromotionMoveStatus: typeof promotion.moveStatus === 'string' ? promotion.moveStatus : null,
    previousSourceDetailsBrentSource: typeof sourceDetails.source === 'string' ? sourceDetails.source : null,
    previousSourceProbe: {
      generatedAt: typeof sourceProbe.generatedAt === 'string' ? sourceProbe.generatedAt : null,
      probes: Array.isArray(sourceProbe.probes) ? sourceProbe.probes : [],
    },
  };
}

async function readPreviousWorkerPreviewSummary(env) {
  try {
    const raw = await env.GFRR_MARKET_KV.get(MARKET_WORKER_GENERATED_PREVIEW_KEY, {
      type: 'text',
      cacheTtl: 30,
    });
    if (raw == null || raw === '') return null;
    return extractPreviousWorkerPreviewSummary(JSON.parse(raw));
  } catch (_err) {
    return null;
  }
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

function parseNumeric(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().replace(/[$,\s]/g, '');
  if (text === '' || text === '.' || text === '-') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function roundValue(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
        observedAt: rows[i]?.[dateIndex] || null,
      };
    }
  }

  throw new Error('no numeric VIX close');
}

function parseYahooGoldChart(text) {
  const payload = JSON.parse(text);
  const result = payload?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const value = positiveNumber(closes[i]);
    if (value != null) {
      return {
        value: roundValue(value),
        observedAt: timestamps[i] ? new Date(timestamps[i] * 1000).toISOString() : null,
      };
    }
  }

  throw new Error('no numeric Gold close');
}

function parseYahooDxyChart(text) {
  const payload = JSON.parse(text);
  const result = payload?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const value = parseNumeric(closes[i]);
    if (value != null) {
      return {
        value: roundValue(value),
        observedAt: timestamps[i] ? new Date(timestamps[i] * 1000).toISOString() : null,
      };
    }
  }

  const regularMarketPrice = positiveNumber(result?.meta?.regularMarketPrice);
  if (regularMarketPrice != null) {
    return {
      value: roundValue(regularMarketPrice),
      observedAt: result?.meta?.regularMarketTime
        ? new Date(result.meta.regularMarketTime * 1000).toISOString()
        : null,
    };
  }

  throw new Error('no numeric DXY close or regularMarketPrice');
}

function normalizeYahooTnxValue(rawValue) {
  if (rawValue > 20) {
    return {
      value: roundValue(rawValue / 10),
      rawValue: roundValue(rawValue),
      normalization: 'divide-by-10',
      normalizationReason: 'raw-yahoo-tnx-appears-times-10',
    };
  }
  return {
    value: roundValue(rawValue),
    rawValue: roundValue(rawValue),
    normalization: 'no-op',
    normalizationReason: 'raw-yahoo-tnx-already-percent',
  };
}

function parseYahooUs10yChart(text) {
  const payload = JSON.parse(text);
  const result = payload?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const rawValue = positiveNumber(closes[i]);
    if (rawValue != null) {
      return {
        ...normalizeYahooTnxValue(rawValue),
        observedAt: timestamps[i] ? new Date(timestamps[i] * 1000).toISOString() : null,
      };
    }
  }

  const regularMarketPrice = positiveNumber(result?.meta?.regularMarketPrice);
  if (regularMarketPrice != null) {
    return {
      ...normalizeYahooTnxValue(regularMarketPrice),
      observedAt: result?.meta?.regularMarketTime
        ? new Date(result.meta.regularMarketTime * 1000).toISOString()
        : null,
    };
  }

  throw new Error('no numeric US10Y close or regularMarketPrice');
}

function parseYahooSpxChart(text) {
  const payload = JSON.parse(text);
  const result = payload?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const value = positiveNumber(closes[i]);
    if (value != null) {
      return {
        value: roundValue(value),
        observedAt: timestamps[i] ? new Date(timestamps[i] * 1000).toISOString() : null,
      };
    }
  }

  const regularMarketPrice = positiveNumber(result?.meta?.regularMarketPrice);
  if (regularMarketPrice != null) {
    return {
      value: roundValue(regularMarketPrice),
      observedAt: result?.meta?.regularMarketTime
        ? new Date(result.meta.regularMarketTime * 1000).toISOString()
        : null,
    };
  }

  throw new Error('no numeric SPX close or regularMarketPrice');
}

function truncateSecondaryError(error) {
  if (error == null || error === '') return null;
  return truncatePreviewError(error);
}

function buildSecondarySourcePayload({
  status,
  provider,
  source,
  value = null,
  rawValue = null,
  normalization = null,
  normalizationReason = null,
  observedAt = null,
  error = null,
}) {
  const ok = status === 'ok' && Number.isFinite(value);
  const payload = {
    status: ok ? 'ok' : status,
    provider,
    source,
    participatesInPrimary: false,
    participatesInValidation: false,
    value: ok ? value : null,
    observedAt: ok ? observedAt : null,
    error: ok ? null : truncateSecondaryError(error),
  };
  if (normalization != null) {
    payload.rawValue = ok && Number.isFinite(rawValue) ? rawValue : null;
    payload.normalization = normalization;
  }
  if (normalizationReason != null) {
    payload.normalizationReason = normalizationReason;
  }
  return payload;
}

function buildSecondaryPreviewPayload({ vix, gold, dxy, us10y, spx }) {
  const nowIso = new Date().toISOString();
  const vixOk = vix?.status === 'ok' && Number.isFinite(vix.value);
  const goldOk = gold?.status === 'ok' && Number.isFinite(gold.value);
  const dxyOk = dxy?.status === 'ok' && Number.isFinite(dxy.value);
  const us10yOk = us10y?.status === 'ok' && Number.isFinite(us10y.value);
  const spxOk = spx?.status === 'ok' && Number.isFinite(spx.value);
  const ok = vixOk || goldOk || dxyOk || us10yOk || spxOk;
  return {
    sourceMode: ok ? 'secondary-preview' : 'secondary-preview-unavailable',
    updatedAt: nowIso,
    unavailable: !ok,
    diagnostics: {
      enabled: true,
      generatedBy: 'worker-secondary-preview',
      frequency: 'low-frequency',
      isolation: 'separate-kv-key',
      sources: {
        vix: buildSecondarySourcePayload({
          status: vix?.status ?? 'unavailable',
          provider: 'cboe',
          source: 'cboe:VIX_History',
          value: vix?.value ?? null,
          observedAt: vix?.observedAt ?? null,
          error: vix?.error ?? null,
        }),
        gold: buildSecondarySourcePayload({
          status: gold?.status ?? 'unavailable',
          provider: 'yahoo',
          source: 'yahoo:GC=F',
          value: gold?.value ?? null,
          observedAt: gold?.observedAt ?? null,
          error: gold?.error ?? null,
        }),
        dxy: buildSecondarySourcePayload({
          status: dxy?.status ?? 'unavailable',
          provider: 'yahoo',
          source: 'yahoo:DX-Y.NYB',
          value: dxy?.value ?? null,
          observedAt: dxy?.observedAt ?? null,
          error: dxy?.error ?? null,
        }),
        us10y: buildSecondarySourcePayload({
          status: us10y?.status ?? 'unavailable',
          provider: 'yahoo',
          source: 'yahoo:^TNX',
          value: us10y?.value ?? null,
          rawValue: us10y?.rawValue ?? null,
          normalization: us10y?.normalization ?? 'unknown',
          normalizationReason: us10y?.normalizationReason ?? 'no-valid-yahoo-tnx-value',
          observedAt: us10y?.observedAt ?? null,
          error: us10y?.error ?? null,
        }),
        spx: buildSecondarySourcePayload({
          status: spx?.status ?? 'unavailable',
          provider: 'yahoo',
          source: 'yahoo:^GSPC',
          value: spx?.value ?? null,
          observedAt: spx?.observedAt ?? null,
          error: spx?.error ?? null,
        }),
      },
    },
  };
}

function buildSecondaryPreviewFailurePayload(error) {
  return buildSecondaryPreviewPayload({
    vix: { status: 'failed', error },
    gold: { status: 'unavailable', error: 'not attempted after secondary preview failure' },
    dxy: { status: 'unavailable', error: 'not attempted after secondary preview failure' },
    us10y: { status: 'unavailable', error: 'not attempted after secondary preview failure' },
    spx: { status: 'unavailable', error: 'not attempted after secondary preview failure' },
  });
}

function buildSecondaryPreviewUnavailablePayload() {
  return {
    ok: false,
    unavailable: true,
    sourceMode: 'secondary-preview-unavailable',
    updatedAt: new Date().toISOString(),
    secondaryPreview: {
      enabled: false,
      source: 'cloudflare-worker-kv',
      key: MARKET_SECONDARY_PREVIEW_KEY,
      reason: 'secondary-preview-not-found',
      note: 'Secondary diagnostics are isolated from the main Worker preview and are not generated by the default scheduled path.',
    },
  };
}

function secondaryPreviewTimestamp(payload) {
  const value = payload?.updatedAt ?? payload?.generatedAt;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function shouldSkipSecondaryPreview(env, nowMs) {
  const raw = await env.GFRR_MARKET_KV.get(MARKET_SECONDARY_PREVIEW_KEY, {
    type: 'text',
    cacheTtl: 30,
  });
  if (raw == null || raw === '') return false;
  try {
    const payload = JSON.parse(raw);
    const timestamp = secondaryPreviewTimestamp(payload);
    return timestamp != null && nowMs - timestamp < SECONDARY_PREVIEW_MIN_INTERVAL_MS;
  } catch (_err) {
    return false;
  }
}

function withSecondaryPreviewTimestamp(url) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}

async function fetchSecondarySource({ url, accept, parser }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SECONDARY_PREVIEW_TIMEOUT_MS);
  try {
    const response = await fetch(withSecondaryPreviewTimestamp(url), {
      cache: 'no-store',
      headers: {
        Accept: accept,
        'User-Agent': SECONDARY_PREVIEW_USER_AGENT,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return parser(text);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCboeVixLatest() {
  return fetchSecondarySource({
    url: CBOE_VIX_HISTORY_URL,
    accept: SECONDARY_PREVIEW_ACCEPT.csv,
    parser: parseCboeVixHistory,
  });
}

async function fetchYahooGoldSecondaryLatest() {
  return fetchSecondarySource({
    url: YAHOO_GOLD_SECONDARY_URL,
    accept: SECONDARY_PREVIEW_ACCEPT.json,
    parser: parseYahooGoldChart,
  });
}

async function fetchYahooDxySecondaryLatest() {
  return fetchSecondarySource({
    url: YAHOO_DXY_SECONDARY_URL,
    accept: SECONDARY_PREVIEW_ACCEPT.json,
    parser: parseYahooDxyChart,
  });
}

async function fetchYahooUs10ySecondaryLatest() {
  return fetchSecondarySource({
    url: YAHOO_US10Y_SECONDARY_URL,
    accept: SECONDARY_PREVIEW_ACCEPT.json,
    parser: parseYahooUs10yChart,
  });
}

async function fetchYahooSpxSecondaryLatest() {
  return fetchSecondarySource({
    url: YAHOO_SPX_SECONDARY_URL,
    accept: SECONDARY_PREVIEW_ACCEPT.json,
    parser: parseYahooSpxChart,
  });
}

async function buildSecondarySourceResult(fetcher) {
  try {
    const result = await fetcher();
    return {
      status: 'ok',
      value: result.value,
      rawValue: result.rawValue ?? null,
      normalization: result.normalization ?? null,
      normalizationReason: result.normalizationReason ?? null,
      observedAt: result.observedAt,
      error: null,
    };
  } catch (err) {
    return {
      status: 'failed',
      value: null,
      observedAt: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function buildSecondaryPreview() {
  const [vix, gold, dxy, us10y, spx] = await Promise.all([
    buildSecondarySourceResult(fetchCboeVixLatest),
    buildSecondarySourceResult(fetchYahooGoldSecondaryLatest),
    buildSecondarySourceResult(fetchYahooDxySecondaryLatest),
    buildSecondarySourceResult(fetchYahooUs10ySecondaryLatest),
    buildSecondarySourceResult(fetchYahooSpxSecondaryLatest),
  ]);
  return buildSecondaryPreviewPayload({ vix, gold, dxy, us10y, spx });
}

async function tryWriteSecondaryPreview(env) {
  try {
    const nowMs = Date.now();
    if (await shouldSkipSecondaryPreview(env, nowMs)) return;
    const payload = await buildSecondaryPreview();
    await env.GFRR_MARKET_KV.put(MARKET_SECONDARY_PREVIEW_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[gfrr-worker] secondary preview skipped:', err instanceof Error ? err.message : String(err));
  }
}

function buildStatusPayload(scheduledAt, previewFetchStatus, previewError, scheduledMode) {
  return {
    key: HEARTBEAT_KEY,
    value: {
      ok: false,
      service: 'gfrr-realtime-worker',
      scheduledAt,
      scheduledMode,
      note: 'preview pipeline attempted; production market generation not enabled',
      previewFetchStatus,
      previewUpdatedAt: null,
      previewError: truncatePreviewError(previewError),
      writePolicy: 'single-kv-write-alternating',
    },
  };
}

function selectScheduledPreviewMode(nowMs) {
  const slot = Math.floor(nowMs / SCHEDULE_SLOT_MS);
  return slot % 2 === 0 ? 'github-mirror-preview' : 'worker-generated-preview';
}

async function buildGitHubMirrorPreviewOrStatusPayload(scheduledAt) {
  const fetchUrl = `${GITHUB_REALTIME_URL}?t=${Date.now()}`;
  let response;

  try {
    response = await fetch(fetchUrl, { cache: 'no-store' });
  } catch (err) {
    return buildStatusPayload(
      scheduledAt,
      'fetch-error',
      err instanceof Error ? err.message : String(err),
      'github-mirror-preview',
    );
  }

  if (!response.ok) {
    return buildStatusPayload(
      scheduledAt,
      'http-error',
      `HTTP ${response.status}`,
      'github-mirror-preview',
    );
  }

  let text;
  try {
    text = await response.text();
  } catch (err) {
    return buildStatusPayload(
      scheduledAt,
      'fetch-error',
      err instanceof Error ? err.message : String(err),
      'github-mirror-preview',
    );
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    return buildStatusPayload(
      scheduledAt,
      'json-error',
      err instanceof Error ? err.message : String(err),
      'github-mirror-preview',
    );
  }

  if (!isValidPreviewPayload(payload)) {
    return buildStatusPayload(
      scheduledAt,
      'invalid-payload',
      'missing or invalid updatedAt or values',
      'github-mirror-preview',
    );
  }

  return {
    key: MARKET_PREVIEW_KEY,
    value: {
      ...payload,
      workerPreview: {
        enabled: true,
        source: 'github-realtime-data',
        fetchedAt: new Date().toISOString(),
        sourceUrl: GITHUB_REALTIME_URL,
        previewFetchStatus: 'ok',
        writePolicy: 'single-kv-write-alternating',
        note: 'preview pipeline; production market generation not enabled',
      },
    },
  };
}

async function buildWorkerGeneratedPreviewOrStatusPayload(scheduledAt, env) {
  try {
    const previousPreviewSummary = await readPreviousWorkerPreviewSummary(env);
    return {
      key: MARKET_WORKER_GENERATED_PREVIEW_KEY,
      value: await buildWorkerGeneratedMarketPreview({
        previousPreviewSummary,
        fredApiKey: env.FRED_API_KEY,
      }),
    };
  } catch (err) {
    return buildStatusPayload(
      scheduledAt,
      'worker-generated-error',
      err instanceof Error ? err.message : String(err),
      'worker-generated-preview',
    );
  }
}

async function buildScheduledPreviewOrStatusPayload(nowMs, env) {
  const scheduledAt = new Date(nowMs).toISOString();
  const mode = selectScheduledPreviewMode(nowMs);
  if (mode === 'worker-generated-preview') {
    return buildWorkerGeneratedPreviewOrStatusPayload(scheduledAt, env);
  }
  return buildGitHubMirrorPreviewOrStatusPayload(scheduledAt);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (request.method !== 'GET') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, { status: 405 });
    }

    if (path === '/health') {
      return jsonResponse({
        ok: true,
        service: 'gfrr-realtime-worker',
        mode: 'scaffold',
        timestamp: new Date().toISOString(),
      });
    }

    if (path === '/market.json') {
      const raw = await env.GFRR_MARKET_KV.get(MARKET_LATEST_KEY, {
        type: 'text',
        cacheTtl: 30,
      });
      if (raw == null || raw === '') {
        return jsonResponse(
          { ok: false, error: 'market:latest not found' },
          {
            status: 404,
            headers: {
              'Cache-Control': 'no-store',
              ...CORS_HEADERS,
            },
          },
        );
      }
      return new Response(raw, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          ...CORS_HEADERS,
        },
      });
    }

    if (path === '/market.preview.json') {
      const raw = await env.GFRR_MARKET_KV.get(MARKET_PREVIEW_KEY, {
        type: 'text',
        cacheTtl: 30,
      });
      if (raw == null || raw === '') {
        return jsonResponse(
          { ok: false, error: 'market:latest-preview not found' },
          {
            status: 404,
            headers: {
              'Cache-Control': 'no-store',
              ...CORS_HEADERS,
            },
          },
        );
      }
      return new Response(raw, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...CORS_HEADERS,
        },
      });
    }

    if (path === '/market.worker-preview.json') {
      const raw = await env.GFRR_MARKET_KV.get(MARKET_WORKER_GENERATED_PREVIEW_KEY, {
        type: 'text',
        cacheTtl: 30,
      });
      if (raw == null || raw === '') {
        return jsonResponse(
          { ok: false, error: 'market:worker-generated-preview not found' },
          {
            status: 404,
            headers: {
              'Cache-Control': 'no-store',
              ...CORS_HEADERS,
            },
          },
        );
      }
      return new Response(raw, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...CORS_HEADERS,
        },
      });
    }

    if (path === '/market.secondary-preview.json') {
      const raw = await env.GFRR_MARKET_KV.get(MARKET_SECONDARY_PREVIEW_KEY, {
        type: 'text',
        cacheTtl: 30,
      });
      if (raw == null || raw === '') {
        return jsonResponse(buildSecondaryPreviewUnavailablePayload(), {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
            ...CORS_HEADERS,
          },
        });
      }
      return new Response(raw, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...CORS_HEADERS,
        },
      });
    }

    return jsonResponse({ ok: false, error: 'Not found' }, { status: 404 });
  },

  async scheduled(_event, env) {
    const { key, value } = await buildScheduledPreviewOrStatusPayload(Date.now(), env);
    try {
      await env.GFRR_MARKET_KV.put(key, JSON.stringify(value));
    } catch (err) {
      console.warn('scheduled primary KV write failed', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (key === MARKET_WORKER_GENERATED_PREVIEW_KEY) {
      await tryWriteSecondaryPreview(env);
    }
  },
};
