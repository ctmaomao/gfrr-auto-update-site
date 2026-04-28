/**
 * v28.0A scaffold: health, /market.json (KV market:latest read only), cron heartbeat.
 * Does not generate production market data.
 */

const MARKET_LATEST_KEY = 'market:latest';
const HEARTBEAT_KEY = 'market:worker-heartbeat';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { ...init, headers });
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

    return jsonResponse({ ok: false, error: 'Not found' }, { status: 404 });
  },

  async scheduled(_event, env) {
    const payload = {
      ok: true,
      service: 'gfrr-realtime-worker',
      scheduledAt: new Date().toISOString(),
      note: 'scaffold only; market generation not enabled',
    };
    await env.GFRR_MARKET_KV.put(HEARTBEAT_KEY, JSON.stringify(payload));
  },
};
