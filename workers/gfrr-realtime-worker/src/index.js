/**
 * v28.0B-1: preview pipeline — scheduled fetch from GitHub realtime-data → KV market:latest-preview.
 * Cron uses a free-tier safe policy: at most one KV write per scheduled run.
 * GET /market.preview.json reads the preview key. /market.json still reads market:latest only.
 */

const MARKET_LATEST_KEY = 'market:latest';
const HEARTBEAT_KEY = 'market:worker-heartbeat';
const GITHUB_REALTIME_URL =
  'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';
const MARKET_PREVIEW_KEY = 'market:latest-preview';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PREVIEW_ERROR_MAX = 180;

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

function buildStatusPayload(scheduledAt, previewFetchStatus, previewError) {
  return {
    key: HEARTBEAT_KEY,
    value: {
      ok: false,
      service: 'gfrr-realtime-worker',
      scheduledAt,
      note: 'preview pipeline attempted; production market generation not enabled',
      previewFetchStatus,
      previewUpdatedAt: null,
      previewError: truncatePreviewError(previewError),
      writePolicy: 'single-kv-write',
    },
  };
}

async function buildPreviewOrStatusPayload() {
  const scheduledAt = new Date().toISOString();
  const fetchUrl = `${GITHUB_REALTIME_URL}?t=${Date.now()}`;
  let response;

  try {
    response = await fetch(fetchUrl, { cache: 'no-store' });
  } catch (err) {
    return buildStatusPayload(
      scheduledAt,
      'fetch-error',
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!response.ok) {
    return buildStatusPayload(scheduledAt, 'http-error', `HTTP ${response.status}`);
  }

  let text;
  try {
    text = await response.text();
  } catch (err) {
    return buildStatusPayload(
      scheduledAt,
      'fetch-error',
      err instanceof Error ? err.message : String(err),
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
    );
  }

  if (!isValidPreviewPayload(payload)) {
    return buildStatusPayload(
      scheduledAt,
      'invalid-payload',
      'missing or invalid updatedAt or values',
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
        writePolicy: 'single-kv-write',
        note: 'preview pipeline; production market generation not enabled',
      },
    },
  };
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

    return jsonResponse({ ok: false, error: 'Not found' }, { status: 404 });
  },

  async scheduled(_event, env) {
    const { key, value } = await buildPreviewOrStatusPayload();
    await env.GFRR_MARKET_KV.put(key, JSON.stringify(value));
  },
};
