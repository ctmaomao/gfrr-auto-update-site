// Entry point for the CSP report receiver.
//
// LOCAL PHASE: this file is written and reviewed but NOT deployed. Deployment is stage B and needs
// its own authorization, because it creates Cloudflare resources and can consume account quota.
//
// Responsibilities kept here, before any Durable Object is touched:
//   * method and content-type gating;
//   * the streaming byte gate (the platform allows 100 MB request bodies on a free plan, so the
//     application must impose its own limit and must not read an oversized body to completion);
//   * parsing and normalisation into a bounded plan;
//   * per-request diagnostics only. Reject and drop counts are reported for THIS call and are not
//     persisted, so no rejection is ever recorded by bypassing the ingest budget it just hit.
import { LIMITS } from './constants.js';
import { buildPlan, readBodyWithinLimit } from './normalize.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** Accepts both wire formats; anything else is a 415. */
function acceptsContentType(value) {
  const type = String(value ?? '').split(';')[0].trim().toLowerCase();
  return type === 'application/csp-report' || type === 'application/reports+json';
}

export async function handleReport(request, env, { now = Date.now, knownTags = [] } = {}) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method-not-allowed' }, 405);
  }
  if (!acceptsContentType(request.headers.get('content-type'))) {
    return json({ ok: false, error: 'unsupported-media-type' }, 415);
  }

  // The declared length is only a pre-check; the streaming gate is what actually bounds the read.
  const declared = Number(request.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > LIMITS.MAX_BODY_BYTES) {
    return json({ ok: false, error: 'body-too-large' }, 413);
  }

  const body = await readBodyWithinLimit(request.body, LIMITS.MAX_BODY_BYTES);
  if (!body.ok) return json({ ok: false, error: body.reason }, 413);

  let payload;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return json({ ok: false, error: 'malformed-json' }, 400);
  }

  const { plan, diagnostics, malformed } = buildPlan(payload, { knownTags });
  if (malformed) return json({ ok: false, error: 'unrecognised-payload' }, 400);

  // An empty plan is a noop: no ledger row and no observation write.
  if (plan.size === 0) {
    return json({ ok: true, stored: 0, diagnostics });
  }

  const stub = env.CSP_RECEIVER.get(env.CSP_RECEIVER.idFromName('singleton'));
  const result = await stub.ingest({
    // A Map cannot cross the RPC boundary; rebuild it inside the object.
    entries: [...plan.entries()],
    receivedAt: now(),
  });

  const status = result.action === 'reject' ? 429 : 200;
  return json({ ok: result.action === 'commit', ...result, diagnostics }, status);
}

/** Health is read-only and reports "cannot confirm" rather than assuming health. */
export async function handleHealth(env, { now = Date.now } = {}) {
  const stub = env.CSP_RECEIVER.get(env.CSP_RECEIVER.idFromName('singleton'));
  const health = await stub.health({ now: now() });
  return json(health, health.status === 'unknown' ? 503 : 200);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/csp-report') return handleReport(request, env);
    if (pathname === '/health') return handleHealth(env);
    return json({ ok: false, error: 'not-found' }, 404);
  },
};
