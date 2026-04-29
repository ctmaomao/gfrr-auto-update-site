/**
 * v28.0B-1: preview pipeline — scheduled fetch from GitHub realtime-data → KV market:latest-preview;
 * GET /market.preview.json reads that key. /market.json still reads market:latest only (not written here).
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
    const scheduledAt = new Date().toISOString();
    let previewFetchStatus = 'ok';
    let previewUpdatedAt = null;
    let previewError = null;
    const kv = env.GFRR_MARKET_KV;

    try {
      const fetchUrl = `${GITHUB_REALTIME_URL}?t=${Date.now()}`;
      let response;
      try {
        response = await fetch(fetchUrl, { cache: 'no-store' });
      } catch (err) {
        previewFetchStatus = 'http-error';
        previewError = truncatePreviewError(err instanceof Error ? err.message : String(err));
        return;
      }

      if (!response.ok) {
        previewFetchStatus = 'http-error';
        previewError = truncatePreviewError(`HTTP ${response.status}`);
        return;
      }

      let text;
      try {
        text = await response.text();
      } catch (err) {
        previewFetchStatus = 'http-error';
        previewError = truncatePreviewError(err instanceof Error ? err.message : String(err));
        return;
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch (err) {
        previewFetchStatus = 'json-error';
        previewError = truncatePreviewError(err instanceof Error ? err.message : String(err));
        return;
      }

      if (!isValidPreviewPayload(payload)) {
        previewFetchStatus = 'invalid-payload';
        previewError = truncatePreviewError('missing or invalid updatedAt or values');
        return;
      }

      const previewPayload = {
        ...payload,
        workerPreview: {
          enabled: true,
          source: 'github-realtime-data',
          fetchedAt: new Date().toISOString(),
          sourceUrl: GITHUB_REALTIME_URL,
        },
      };

      try {
        await kv.put(MARKET_PREVIEW_KEY, JSON.stringify(previewPayload));
        previewUpdatedAt =
          typeof payload.updatedAt === 'string' ? payload.updatedAt : String(payload.updatedAt);
      } catch (err) {
        previewFetchStatus = 'kv-write-error';
        previewError = truncatePreviewError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      const heartbeat = {
        ok: true,
        service: 'gfrr-realtime-worker',
        scheduledAt,
        note: 'preview pipeline enabled; production market generation not enabled',
        previewFetchStatus,
        previewUpdatedAt,
        previewError,
      };
      await kv.put(HEARTBEAT_KEY, JSON.stringify(heartbeat));
    }
  },
};
