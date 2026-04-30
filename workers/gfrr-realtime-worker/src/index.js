/**
 * v28.0B-2A: preview pipeline with alternating single-KV-write scheduled runs.
 * /market.preview.json reads the GitHub mirror preview.
 * /market.worker-preview.json reads the Worker-generated preview MVP.
 * /market.json still reads market:latest only and is not written here.
 */

import { buildWorkerGeneratedMarketPreview } from './worker-market-preview.js';

const MARKET_LATEST_KEY = 'market:latest';
const HEARTBEAT_KEY = 'market:worker-heartbeat';
const GITHUB_REALTIME_URL =
  'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';
const MARKET_PREVIEW_KEY = 'market:latest-preview';
const MARKET_WORKER_GENERATED_PREVIEW_KEY = 'market:worker-generated-preview';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PREVIEW_ERROR_MAX = 180;
const SCHEDULE_SLOT_MS = 3 * 60 * 1000;

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

async function buildWorkerGeneratedPreviewOrStatusPayload(scheduledAt) {
  try {
    return {
      key: MARKET_WORKER_GENERATED_PREVIEW_KEY,
      value: await buildWorkerGeneratedMarketPreview(),
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

async function buildScheduledPreviewOrStatusPayload(nowMs) {
  const scheduledAt = new Date(nowMs).toISOString();
  const mode = selectScheduledPreviewMode(nowMs);
  if (mode === 'worker-generated-preview') {
    return buildWorkerGeneratedPreviewOrStatusPayload(scheduledAt);
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

    return jsonResponse({ ok: false, error: 'Not found' }, { status: 404 });
  },

  async scheduled(_event, env) {
    const { key, value } = await buildScheduledPreviewOrStatusPayload(Date.now());
    await env.GFRR_MARKET_KV.put(key, JSON.stringify(value));
  },
};
